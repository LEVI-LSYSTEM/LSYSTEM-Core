// data/nodes/Acoustics/wall.js
// v8.2 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ СТЕНКИ / ЩИТА / АПЕРИОДИКИ
//
// Архитектура (согласована с box.js / port.js / passive_radiator.js):
//   - Отдаёт фрагмент с именованными портами (rear, out, gnd).
//   - radiatingPorts декларативный: [{ port:'out', emit:{...} }].
//   - Солвер не знает, что это стенка: применяет U = sign·Y·V.
//
// ИЗМЕНЕНИЕ v8.2 (критично):
//   Добавлен mergedPorts: [{ a: 'out', b: 'gnd' }] во ВСЕХ трёх ветках.
//
//   Почему: порт 'out' объявлен как radiatingPort, и солвер в _buildNetlist
//   ПРОПУСКАЕТ соединение 'out → solver' в DSU (чтобы излучающий порт не
//   заземлялся через солвер). В результате узел 'out' остаётся изолированным,
//   а R_rad_open / R_rad_ext висит между 'rear'/'m2' и изолированным 'out'.
//   Уравнение Кирхгофа для 'out' даёт x[out] = x[rear], ток через R_rad = 0,
//   и динамик НЕ нагружен на радиационный импеданс.
//
//   mergedPorts явно объединяет 'out' и 'gnd' ВНУТРИ фрагмента, до DSU.
//   Тогда R_rad работает между 'rear'/'m2' и землёй — правильная нагрузка.
//   Излучение при этом не страдает: emit.from='rear', emit.to='out',
//   а 'out' теперь тот же узел, что 'gnd', т.е. U = Y·(x[rear] − x[gnd]).
//
// Физика:
//   baffle (открытый щит, leak=0):
//     rear --R_rad_dipole--> out(=gnd)   (диполь, R ∝ (ka)⁴)
//
//   wall/baffle с щелью (leak > 0):
//     rear --Ma_leak--> m1 --Ra_leak--> m2 --R_rad_ext--> out(=gnd)
//     + R_resist параллельно Ra_leak (для апериодики)
//
//   wall (герметичная, leak=0):
//     rear --R_seal--> gnd
//
// Излучение:
//   Щель: I = Y_Ma·(x[rear]−x[m1]).
//   Открытый щит: I = Y_R·(x[rear]−x[out]) = Y_R·(x[rear]−x[gnd]).
//   emit: from='rear', to='m1'/'out', sign=+1 (согласовано с PR/speaker).

'use strict';

const WALL_UI_DEFAULT = {
    wall_type: 'baffle',   // baffle | wall | aperiodic
    leak_area: 0,          // мм² (0 = герметично/открыто)
    thickness: 18,         // мм
    seal_q: 50,            // 1..100 — для герметичной стенки
    resistivity: 0,        // Па·с/м² (для апериодики)
    d_port: 0.10,          // м — расстояние динамик→щель

    _user: {},
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: {
        type: false,
        leak: false,
        diagnostics: false,
        advanced: true
    }
};

const WALL_TYPE_LABEL = {
    baffle:    'Щит',
    wall:      'Стенка',
    aperiodic: 'Апериодика'
};

const RHO0 = 1.2041;
const C0   = 343.0;
const MU   = 1.81e-5;

/**
 * Вязкое сопротивление щели/канала (Пуазейль + поправка на погранслой).
 * Возвращает R_visc на f_ref = 100 Гц; частотная зависимость — law 'sqrt_omega'.
 */
function _viscResistance(L_m, A_leak_m2) {
    if (!(L_m > 0) || !(A_leak_m2 > 0)) return 0;
    const r_eff = Math.sqrt(A_leak_m2 / Math.PI);
    const w_ref = 2 * Math.PI * 100;
    const deltaV_ref = Math.sqrt(2 * MU / (RHO0 * w_ref));
    const R_base = (8 * MU * L_m) / (Math.PI * Math.pow(r_eff, 4));
    return R_base * (1 + r_eff / deltaV_ref);
}

/**
 * Акустическая масса щели/канала с end-correction.
 * Ma = ρ₀·(L + 1.7·r_eff)/A   [кг/м⁴]
 */
function _massLeak(L_m, A_leak_m2) {
    if (!(A_leak_m2 > 0)) return 0;
    const r_eff = Math.sqrt(A_leak_m2 / Math.PI);
    return (RHO0 * (L_m + 1.7 * r_eff)) / A_leak_m2;
}

/**
 * R_rad для поршня в бесконечном baffle (2π), f_ref = 100 Гц.
 * R = ρ₀·c·A·(ka)²/(1+ka²)
 *
 * Используется ТОЛЬКО для щели (leak > 0).
 */
function _radResistanceRef(A_m2, r_m) {
    if (!(A_m2 > 0) || !(r_m > 0)) return 0;
    const w_ref = 2 * Math.PI * 100;
    const ka = (w_ref / C0) * r_m;
    const ka2 = ka * ka;
    return RHO0 * C0 * A_m2 * ka2 / (1 + ka2);
}

/**
 * R_rad для ДИПОЛЯ (открытый щит), f_ref = 100 Гц.
 * R = ρ₀·c·A·(ka)⁴/(1+ka²)²
 *
 * Ключевое отличие открытого щита: на НЧ R_rad ∝ (ka)⁴.
 */
function _radResistanceDipoleRef(A_m2, r_m) {
    if (!(A_m2 > 0) || !(r_m > 0)) return 0;
    const w_ref = 2 * Math.PI * 100;
    const ka = (w_ref / C0) * r_m;
    const ka2 = ka * ka;
    const ka4 = ka2 * ka2;
    return RHO0 * C0 * A_m2 * ka4 / Math.pow(1 + ka2, 2);
}

/**
 * R_seal для герметичной стенки — заглушка (идеальный разрыв).
 * Физически герметичная стенка между объёмами — это гибкость C = V/(ρ₀c²),
 * но без знания объёмов используем R → ∞. seal_q — артефакт UI.
 */
function _sealedResistanceLegacy(seal_q) {
    return 1e8 * Math.max(1, Number(seal_q) || 50);
}

function _wallStatus(ui) {
    const type = ui.wall_type || 'baffle';
    const leak = Number(ui.leak_area) || 0;

    if (type === 'baffle') {
        return leak > 0
            ? { label: 'щит с щелью', tone: 'warn' }
            : { label: 'открытый щит', tone: 'ok' };
    }
    if (type === 'wall') {
        return leak > 0
            ? { label: 'стенка со щелью', tone: 'warn' }
            : { label: 'герметичная стенка', tone: 'ok' };
    }
    if (type === 'aperiodic') {
        return leak > 0
            ? { label: 'апериодика', tone: 'ok' }
            : { label: 'апериодика (нет щели!)', tone: 'err' };
    }
    return { label: '—', tone: 'muted' };
}

function _calcAll(ui) {
    const out = JSON.parse(JSON.stringify(ui));
    const _calc = { ...(out._calc || {}) };

    if (!(out.thickness > 0)) out.thickness = 18;
    if (!(out.seal_q > 0)) out.seal_q = 50;
    if (out.leak_area < 0) out.leak_area = 0;
    if (out.resistivity < 0) out.resistivity = 0;
    if (out.d_port < 0) out.d_port = 0.10;

    if (out.wall_type === 'aperiodic' && out.leak_area <= 0 && out._lastEdited === 'wall_type') {
        out.leak_area = 2000;
        _calc.leak_area = true;
    }

    if (out.wall_type !== 'aperiodic' && out.resistivity > 0) {
        out.resistivity = 0;
        _calc.resistivity = true;
    }

    out._calc = _calc;
    return out;
}

module.exports = {
    meta: {
        id: 'Acoustics.wall',
        label: 'Wall',
        icon: 'icon-wall'
    },

    ports: {
        inputs:  [{ id: 'rear', label: 'Rear' }],
        outputs: [{ id: 'out',  label: 'Out'  }]
    },

    inputRules:  { rear: ['speaker.js'] },
    outputRules: { out:  ['LEMsolver.js'] },

    maxInputs:  { rear: '*' },
    maxOutputs: { out:  1 },

    params: [
        {
            id: 'wall_ui',
            type: 'wall_ui',
            label: 'Стенка',
            default: WALL_UI_DEFAULT,
            category: 'Стенка',
            _noCategoryHeader: true
        }
    ],

    onParamChange(id, value, node) {
        if (id !== 'wall_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(WALL_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...WALL_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;

        node.paramValues.wall_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'wall_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.wall_ui && typeof p.wall_ui === 'object') ? p.wall_ui : WALL_UI_DEFAULT;

        const wall_type = ui.wall_type || 'baffle';
        const leakArea_mm2 = Math.max(0, Number(ui.leak_area) || 0);
        const thickness_mm = Math.max(1, Number(ui.thickness) || 18);
        const sealQ = Math.max(1, Number(ui.seal_q) || 50);
        const resistivity = Math.max(0, Number(ui.resistivity) || 0);
        const dPort = Math.max(0, Number(ui.d_port) || 0.10);

        const L_m = thickness_mm / 1000;
        const A_leak = leakArea_mm2 * 1e-6;

        // ═══════════════════════════════════════════════════════════
        // 1. ОТКРЫТЫЙ ЩИТ (baffle, leak = 0)
        // ═══════════════════════════════════════════════════════════
        // Дипольный R_rad ∝ (ka)⁴. НЕ поршневой (ka)².
        //
        // КРИТИЧНО v8.2: mergedPorts объединяет 'out' и 'gnd'.
        // Без этого 'out' изолирован (солвер пропускает 'out→solver' в DSU),
        // R_rad_open висит в воздухе, динамик не нагружен на излучение,
        // Ca в speaker.js не работает, X уезжает вниз.
        if (wall_type === 'baffle' && leakArea_mm2 === 0) {
            let Sd_m2 = null;
            try {
                const inputs = ctx.getInputs();
                for (const inp of inputs) {
                    if (inp.def && inp.def.file === 'speaker.js') {
                        const drvUi = inp.paramValues && inp.paramValues.driver_ui;
                        if (drvUi && Number(drvUi.sd) > 0) {
                            const conn = drvUi.connection || {};
                            const cnt = (conn.type === 'isobaric')
                                ? (conn.isobaricCount || 1) * 2
                                : (conn.type === 'series_parallel'
                                    ? (conn.config?.series || 2) * (conn.config?.parallel || 2)
                                    : (conn.count || 1));
                            Sd_m2 = Number(drvUi.sd) * 1e-4 * cnt;
                            break;
                        }
                    }
                }
            } catch (e) {}
            if (!(Sd_m2 > 0)) Sd_m2 = 220e-4;

            const a_eq = Math.sqrt(Sd_m2 / Math.PI);
            const R_rad_dipole_ref = _radResistanceDipoleRef(Sd_m2, a_eq);

            const nodes = ['rear', 'out', 'gnd'];
            const components = [
                {
                    id: 'R_rad_open',
                    type: 'R_freq',
                    from: 'rear',
                    to: 'out',
                    value: R_rad_dipole_ref,
                    freqRef: 100,
                    law: 'rad_dipole',
                    radiationRadius_m: a_eq
                }
            ];

            const ports = { rear: 'rear', out: 'out', gnd: 'gnd' };

            // ═══ КРИТИЧНО: объединяем 'out' с 'gnd' ВНУТРИ фрагмента ═══
            // Тогда R_rad_open работает между 'rear' и землёй.
            const mergedPorts = [
                { a: 'out', b: 'gnd' }
            ];

            const radiatingPorts = [
                {
                    port: 'out',
                    emit: {
                        kind: 'current_through',
                        from: 'rear',
                        to: 'out',
                        sign: +1,
                        admittance: {
                            type: 'R_freq',
                            value: R_rad_dipole_ref,
                            freqRef: 100,
                            law: 'rad_dipole',
                            radiationRadius_m: a_eq
                        }
                    }
                }
            ];

            return {
                kind: 'lem.fragment',
                source: 'wall',
                nodes,
                components,
                ports,
                mergedPorts,
                radiatingPorts,
                meta: {
                    label: 'Wall (open baffle)',
                    wall_type,
                    leak_area_mm2: 0,
                    thickness_mm,
                    seal_q: sealQ,
                    d_port_m: dPort,
                    Sd_m2,
                    a_eq_m: a_eq,
                    R_rad_ref: R_rad_dipole_ref,
                    rad_law: 'rad_dipole',
                    status: 'open'
                }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 2. ЩЕЛЬ (leak > 0) — baffle/wall с щелью, aperiodic
        // ═══════════════════════════════════════════════════════════
        // Топология (аналог port.js):
        //   rear --Ma_leak--> m1 --Ra_leak--> m2 --R_rad_ext--> out(=gnd)
        //   + R_resist параллельно Ra_leak (для апериодики)
        //
        // R_rad_ext — для щели в тонкой стенке, излучение с внешней стороны.
        // mergedPorts: 'out' = 'gnd' — та же причина, что в baffle.
        if (A_leak > 0) {
            const r_eff = Math.sqrt(A_leak / Math.PI);
            const R_visc_ref = _viscResistance(L_m, A_leak);
            const Ma_leak = _massLeak(L_m, A_leak);
            const R_rad_ref = _radResistanceRef(A_leak, r_eff);

            const nodes = ['rear', 'm1', 'm2', 'out', 'gnd'];

            const components = [
                { id: 'Ma_leak', type: 'L', from: 'rear', to: 'm1', value: Ma_leak },
                {
                    id: 'Ra_leak',
                    type: 'R_freq',
                    from: 'm1',
                    to: 'm2',
                    value: R_visc_ref,
                    freqRef: 100,
                    law: 'sqrt_omega'
                },
                {
                    id: 'R_rad_ext',
                    type: 'R_freq',
                    from: 'm2',
                    to: 'out',
                    value: R_rad_ref,
                    freqRef: 100,
                    law: 'rad_plateau',
                    radiationRadius_m: r_eff
                }
            ];

            if (wall_type === 'aperiodic' && resistivity > 0) {
                const R_resist = resistivity * L_m / A_leak;
                components.push({
                    id: 'R_resist',
                    type: 'R',
                    from: 'm1',
                    to: 'm2',
                    value: R_resist
                });
            }

            const ports = { rear: 'rear', out: 'out', gnd: 'gnd' };

            // ═══ КРИТИЧНО: 'out' = 'gnd' ═══
            const mergedPorts = [
                { a: 'out', b: 'gnd' }
            ];

            const radiatingPorts = [
                {
                    port: 'out',
                    emit: {
                        kind: 'current_through',
                        from: 'rear',
                        to: 'm1',
                        sign: +1,
                        admittance: {
                            type: 'L',
                            value: Ma_leak
                        }
                    }
                }
            ];

            return {
                kind: 'lem.fragment',
                source: 'wall',
                nodes,
                components,
                ports,
                mergedPorts,
                radiatingPorts,
                meta: {
                    label: `Wall (${WALL_TYPE_LABEL[wall_type]} ${leakArea_mm2} мм²)`,
                    wall_type,
                    leak_area_mm2: leakArea_mm2,
                    thickness_mm,
                    seal_q: sealQ,
                    resistivity,
                    d_port_m: dPort,
                    r_eff_m: r_eff,
                    A_leak_m2: A_leak,
                    Ma_leak,
                    R_visc_ref,
                    R_rad_ref,
                    R_resist: (wall_type === 'aperiodic' && resistivity > 0)
                        ? resistivity * L_m / A_leak
                        : null,
                    status: wall_type
                }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 3. ГЕРМЕТИЧНАЯ СТЕНКА (leak = 0, baffle/wall)
        // ═══════════════════════════════════════════════════════════
        // rear → gnd через очень большое R (идеальный разрыв).
        // Нет излучения — radiatingPorts пуст.
        // mergedPorts не нужен: 'out' изолирован, но и не используется.
        const R_wall = _sealedResistanceLegacy(sealQ);

        const nodes = ['rear', 'out', 'gnd'];
        const components = [
            { id: 'R_wall', type: 'R', from: 'rear', to: 'gnd', value: R_wall }
        ];

        const ports = { rear: 'rear', out: 'out', gnd: 'gnd' };

        const mergedPorts = [
            { a: 'out', b: 'gnd' }
        ];

        const radiatingPorts = [];

        return {
            kind: 'lem.fragment',
            source: 'wall',
            nodes,
            components,
            ports,
            mergedPorts,
            radiatingPorts,
            meta: {
                label: `Wall (sealed, ${thickness_mm} мм)`,
                wall_type,
                leak_area_mm2: 0,
                thickness_mm,
                seal_q: sealQ,
                d_port_m: dPort,
                R_wall,
                status: 'sealed'
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'Wall not connected' };
        }
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'wall_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderWallCard(value, onChange, ctx, node);
                },
                update(el, value) {
                    _updateWallCard(el, value);
                },
                destroy(el) {
                    if (el && el.__cleanup) {
                        try { el.__cleanup(); } catch (e) {}
                    }
                }
            }
        };
    }
};

// ============================================================
// UI — без изменений (сохранён из v8.1)
// ============================================================

function _renderWallCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(WALL_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...WALL_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'wall-ui';
    wrap.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    `;

    wrap.__onChange = onChange;
    wrap.__uiApi = uiApi;
    wrap.__lastFocusedField = null;

    wrap.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.fieldId) {
            wrap.__lastFocusedField = t.dataset.fieldId;
        }
    });

    const toggleSectionLocal = (key, collapsed) => {
        if (!ui._sections) ui._sections = {};
        ui._sections[key] = collapsed;
        if (node && node.paramValues && node.paramValues.wall_ui) {
            if (!node.paramValues.wall_ui._sections) node.paramValues.wall_ui._sections = {};
            node.paramValues.wall_ui._sections[key] = collapsed;
        }
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildTypeSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildLeakSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildDiagnosticsSection(ui, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildAdvancedSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildActions(ui, onChange, uiApi));

    return wrap;
}

function _buildInfoBar(ui, uiApi) {
    const bar = document.createElement('div');
    bar.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        background: linear-gradient(90deg, rgba(204,34,51,0.14) 0%, rgba(204,34,51,0.02) 100%);
        border-left: 3px solid var(--accent-red, #cc2233);
        border-radius: 0 8px 8px 0;
        width: 100%; min-width: 0; box-sizing: border-box;
    `;

    const icon = _makeIcon(uiApi, 'icon-wall', 20);
    icon.style.cssText += 'color:var(--accent-red, #cc2233);flex-shrink:0;';
    bar.appendChild(icon);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

    const line1 = document.createElement('div');
    line1.style.cssText = `
        font-size: 13px; font-weight: 700;
        color: var(--text-primary, #e0d8cc);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const typeLabel = WALL_TYPE_LABEL[ui.wall_type] || ui.wall_type;
    const leak = Number(ui.leak_area) || 0;
    const leakLabel = leak > 0 ? ` · leak ${leak} мм²` : '';
    line1.textContent = `Wall · ${typeLabel}${leakLabel}`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = `
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-family: 'Courier New', monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const th = Number(ui.thickness) || 0;
    const sq = Number(ui.seal_q) || 0;
    line2.textContent = `Толщина ${th} мм · seal Q ${sq}`;
    info.appendChild(line2);

    bar.appendChild(info);

    const status = _wallStatus(ui);
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `
        font-size: 10px; font-weight: 700;
        padding: 4px 10px; border-radius: 12px;
        white-space: nowrap; flex-shrink: 0;
    `;
    if (status.tone === 'err') {
        statusEl.textContent = '⚠ ' + status.label;
        statusEl.style.background = 'rgba(255,170,51,0.15)';
        statusEl.style.color = 'rgba(255,170,51,0.95)';
        statusEl.style.border = '1px solid rgba(255,170,51,0.5)';
    } else if (status.tone === 'warn') {
        statusEl.textContent = '⚠ ' + status.label;
        statusEl.style.background = 'rgba(200,184,154,0.15)';
        statusEl.style.color = 'var(--beige, #c8b89a)';
        statusEl.style.border = '1px solid rgba(200,184,154,0.5)';
    } else {
        statusEl.textContent = '✓ ' + status.label;
        statusEl.style.background = 'rgba(68,204,136,0.12)';
        statusEl.style.color = 'rgba(68,204,136,0.95)';
        statusEl.style.border = '1px solid rgba(68,204,136,0.35)';
    }
    bar.appendChild(statusEl);

    return bar;
}

function _buildTypeSection(ui, onChange, uiApi, toggleSection) {
    const key = 'type';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Тип', 'icon-wall', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; gap: 6px; padding: 8px 12px;
        flex-wrap: wrap; width: 100%; box-sizing: border-box;
    `;

    const OPTS = [
        { id: 'baffle',    label: 'Щит',        desc: 'Открытый щит (дипольное излучение)' },
        { id: 'wall',      label: 'Стенка',     desc: 'Стенка между двумя объёмами' },
        { id: 'aperiodic', label: 'Апериодика', desc: 'Щель + заполнитель (Variovent)' }
    ];

    for (const opt of OPTS) {
        const isActive = ui.wall_type === opt.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.title = opt.desc;
        btn.style.cssText = `
            padding: 6px 12px; font-size: 10px; font-weight: 600;
            font-family: inherit; border-radius: 5px;
            border: 1px solid ${isActive ? 'var(--accent-red, #cc2233)' : 'var(--border-color, rgba(200,184,154,0.15))'};
            background: ${isActive ? 'rgba(204,34,51,0.18)' : 'transparent'};
            color: ${isActive ? 'var(--text-primary, #e0d8cc)' : 'var(--text-secondary, #a09888)'};
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
            box-sizing: border-box;
        `;
        btn.addEventListener('mouseenter', () => {
            if (!isActive) {
                btn.style.borderColor = 'var(--beige-dark, #a89070)';
                btn.style.color = 'var(--text-primary, #e0d8cc)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!isActive) {
                btn.style.borderColor = 'var(--border-color, rgba(200,184,154,0.15))';
                btn.style.color = 'var(--text-secondary, #a09888)';
            }
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = JSON.parse(JSON.stringify(ui));
            next.wall_type = opt.id;
            next._lastEdited = 'wall_type';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }

    section.body.appendChild(row);

    const hint = document.createElement('div');
    hint.textContent = (OPTS.find(o => o.id === ui.wall_type) || {}).desc || '';
    hint.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 9px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-style: italic;
        width: 100%; box-sizing: border-box;
    `;
    section.body.appendChild(hint);

    return section.el;
}

function _buildLeakSection(ui, onChange, uiApi, toggleSection) {
    const key = 'leak';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Щель', 'icon-port', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const leakArea = Number(ui.leak_area) || 0;

    const areaRow = document.createElement('div');
    areaRow.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;

    const areaLbl = document.createElement('div');
    areaLbl.textContent = 'Площадь:';
    areaLbl.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary, #a09888); min-width: 70px;';
    areaRow.appendChild(areaLbl);

    const areaInp = document.createElement('input');
    areaInp.type = 'number';
    areaInp.step = '10';
    areaInp.min = '0';
    areaInp.value = String(leakArea);
    areaInp.placeholder = '0 = герметично';
    areaInp.dataset.fieldId = 'leak_area';
    areaInp.style.cssText = `
        flex: 1 1 0; min-width: 0;
        padding: 5px 8px;
        font-size: 12px;
        font-family: 'Courier New', monospace;
        font-weight: 600;
        background: ${leakArea > 0 ? 'rgba(204,34,51,0.04)' : 'transparent'};
        color: var(--text-primary, #e0d8cc);
        border: 1px solid ${leakArea > 0 ? 'rgba(204,34,51,0.4)' : 'var(--border-color, rgba(200,184,154,0.15))'};
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease, background 0.15s ease;
    `;
    areaInp.addEventListener('focus', () => {
        areaInp.style.borderColor = 'var(--accent-red, #cc2233)';
        areaInp.style.background = 'var(--bg-input, #2a2a2a)';
    });
    areaInp.addEventListener('blur', () => {
        areaInp.style.borderColor = leakArea > 0 ? 'rgba(204,34,51,0.4)' : 'var(--border-color, rgba(200,184,154,0.15))';
        areaInp.style.background = leakArea > 0 ? 'rgba(204,34,51,0.04)' : 'transparent';
    });
    areaInp.addEventListener('change', () => {
        const num = Number(areaInp.value);
        if (!isFinite(num) || num < 0) return;
        const next = JSON.parse(JSON.stringify(ui));
        next.leak_area = num;
        next._user = { ...(next._user || {}), leak_area: true };
        next._lastEdited = 'leak_area';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    areaRow.appendChild(areaInp);

    const areaUnit = document.createElement('span');
    areaUnit.textContent = 'мм²';
    areaUnit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;flex-shrink:0;width:32px;';
    areaRow.appendChild(areaUnit);

    section.body.appendChild(areaRow);

    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = `
        padding: 10px 12px;
        background: rgba(0,0,0,0.20);
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;
    svgWrap.appendChild(_buildWallSVG(ui));
    section.body.appendChild(svgWrap);

    const hint = document.createElement('div');
    hint.textContent = leakArea > 0
        ? 'Щель пропускает часть заднего излучения наружу'
        : 'Щель закрыта — стенка герметичная';
    hint.style.cssText = `
        padding: 6px 12px 8px;
        font-size: 9px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-style: italic;
        width: 100%; box-sizing: border-box;
    `;
    section.body.appendChild(hint);

    return section.el;
}

function _buildDiagnosticsSection(ui, uiApi, toggleSection) {
    const key = 'diagnostics';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Диагностика', 'icon-wave', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const leakArea_mm2 = Number(ui.leak_area) || 0;
    const thickness_mm = Number(ui.thickness) || 18;
    const sealQ = Number(ui.seal_q) || 50;

    const L_m = thickness_mm / 1000;
    const A_leak = leakArea_mm2 * 1e-6;

    let statusText, R_leak_text, f_alpha_text, rad_law_text;

    if (leakArea_mm2 > 0 && A_leak > 0) {
        const R_visc = _viscResistance(L_m, A_leak);
        const Ma_leak = _massLeak(L_m, A_leak);
        const Ca_leak = A_leak / (RHO0 * C0 * C0);

        R_leak_text = R_visc.toExponential(2) + ' Па·с/м⁵';

        const f_alpha = 1 / (2 * Math.PI * Math.sqrt(Math.max(Ma_leak * Ca_leak, 1e-30)));
        f_alpha_text = isFinite(f_alpha) ? Math.round(f_alpha) + ' Hz' : '—';
        rad_law_text = 'rad_plateau (поршень, 2π)';

        statusText = `${WALL_TYPE_LABEL[ui.wall_type] || '—'} со щелью ${leakArea_mm2} мм²`;
    } else if (ui.wall_type === 'baffle') {
        R_leak_text = '— (открытый щит)';
        f_alpha_text = '—';
        rad_law_text = 'rad_dipole (∝ (ka)⁴)';
        statusText = 'открытый щит (диполь)';
    } else {
        R_leak_text = _sealedResistanceLegacy(sealQ).toExponential(2) + ' Па·с/м⁵';
        f_alpha_text = '—';
        rad_law_text = '— (разрыв)';
        statusText = 'герметично';
    }

    const rows = [
        { label: 'Статус:', value: statusText },
        { label: 'R_leak:', value: R_leak_text },
        { label: 'R_rad law:', value: rad_law_text },
        { label: 'f_α (апериодика):', value: f_alpha_text }
    ];

    for (const row of rows) {
        const r = document.createElement('div');
        r.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px; padding: 5px 12px;
            width: 100%; box-sizing: border-box;
        `;
        const l = document.createElement('span');
        l.textContent = row.label;
        l.style.cssText = 'font-size: 10px; color: var(--text-secondary, #a09888); min-width:0;overflow:hidden;text-overflow:ellipsis;';
        r.appendChild(l);

        const v = document.createElement('span');
        v.textContent = row.value;
        v.style.cssText = `
            font-size: 11px; font-weight: 700;
            font-family: 'Courier New', monospace;
            color: var(--text-primary, #e0d8cc);
            flex-shrink: 0;
        `;
        r.appendChild(v);
        section.body.appendChild(r);
    }

    return section.el;
}

function _buildAdvancedSection(ui, onChange, uiApi, toggleSection) {
    const key = 'advanced';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Дополнительно', 'icon-settings', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:0;width:100%;box-sizing:border-box;';

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'thickness', label: 'Толщина', unit: 'мм',
        step: 1, min: 1, max: 200,
        hint: 'Толщина стенки'
    }, onChange));

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'seal_q', label: 'Seal Q', unit: '',
        step: 1, min: 1, max: 100,
        hint: 'Заглушка: множитель R_seal (физически не влияет)'
    }, onChange));

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'd_port', label: 'До динам.', unit: 'м',
        step: 0.01, min: 0, max: 5,
        hint: 'Расстояние от динамика до щели'
    }, onChange));

    if (ui.wall_type === 'aperiodic') {
        row.appendChild(_buildAdvancedNumber(ui, {
            id: 'resistivity', label: 'Resistivity', unit: 'Па·с/м²',
            step: 100, min: 0, max: 1e6,
            hint: 'Удельное сопротивление заполнителя; R = ρ·L/A'
        }, onChange));
    }

    section.body.appendChild(row);
    return section.el;
}

function _buildAdvancedNumber(ui, f, onChange) {
    const v = ui[f.id];

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 5px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const lbl = document.createElement('div');
    lbl.textContent = f.label;
    lbl.title = f.hint || '';
    lbl.style.cssText = `
        font-size: 10px; font-weight: 600;
        color: var(--text-secondary, #a09888);
        text-align: right; cursor: help;
        width: 80px; flex-shrink: 0;
    `;
    row.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    if (f.min != null) inp.min = String(f.min);
    if (f.max != null) inp.max = String(f.max);
    inp.value = v == null ? '' : String(v);
    inp.dataset.fieldId = f.id;
    inp.title = f.hint || '';
    inp.style.cssText = `
        flex: 1 1 0; min-width: 0; width: 100%;
        padding: 4px 8px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        background: transparent;
        color: var(--text-primary, #e0d8cc);
        border: 1px solid var(--border-color, rgba(200,184,154,0.10));
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease, background 0.15s ease;
    `;
    inp.addEventListener('focus', () => {
        inp.style.borderColor = 'var(--accent-red, #cc2233)';
        inp.style.background = 'var(--bg-input, #2a2a2a)';
    });
    inp.addEventListener('blur', () => {
        inp.style.borderColor = 'var(--border-color, rgba(200,184,154,0.10))';
        inp.style.background = 'transparent';
    });
    inp.addEventListener('change', () => {
        const num = Number(inp.value);
        if (!isFinite(num)) return;
        const next = JSON.parse(JSON.stringify(ui));
        next[f.id] = num;
        next._user = { ...(next._user || {}), [f.id]: true };
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    row.appendChild(inp);

    const unit = document.createElement('div');
    unit.textContent = f.unit;
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;width:32px;flex-shrink:0;';
    row.appendChild(unit);

    return row;
}

function _buildActions(ui, onChange, uiApi) {
    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; gap: 8px; padding: 4px 0 0;
        flex-wrap: wrap; width: 100%; box-sizing: border-box;
    `;

    const mkBtn = (label, iconId, onClick, variant = 'default') => {
        const b = document.createElement('button');
        b.type = 'button';
        const isPrimary = variant === 'primary';
        const isDanger = variant === 'danger';
        b.style.cssText = `
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 14px; font-size: 11px; font-weight: 600;
            font-family: inherit; letter-spacing: 0.2px;
            border-radius: 6px; cursor: pointer;
            transition: all 0.15s ease;
            border: 1px solid ${isPrimary ? 'var(--accent-red, #cc2233)' : isDanger ? 'rgba(204,34,51,0.5)' : 'var(--border-color, rgba(200,184,154,0.2))'};
            background: ${isPrimary ? 'var(--accent-red, #cc2233)' : 'transparent'};
            color: ${isPrimary ? '#fff' : isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-secondary, #a09888)'};
            box-sizing: border-box;
        `;
        if (iconId) {
            const ic = _makeIcon(uiApi, iconId, 12);
            ic.style.color = 'currentColor';
            b.appendChild(ic);
        }
        const span = document.createElement('span');
        span.textContent = label;
        b.appendChild(span);
        b.addEventListener('mouseenter', () => {
            if (isPrimary) {
                b.style.background = 'var(--accent-red-hover, #ee3344)';
                b.style.borderColor = 'var(--accent-red-hover, #ee3344)';
            } else {
                b.style.borderColor = isDanger ? 'var(--accent-red, #cc2233)' : 'var(--beige-dark, #a89070)';
                b.style.color = isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-primary, #e0d8cc)';
                b.style.background = isDanger ? 'rgba(204,34,51,0.1)' : 'var(--bg-hover, rgba(40,40,40,0.5))';
            }
        });
        b.addEventListener('mouseleave', () => {
            if (isPrimary) {
                b.style.background = 'var(--accent-red, #cc2233)';
                b.style.borderColor = 'var(--accent-red, #cc2233)';
            } else {
                b.style.borderColor = isDanger ? 'rgba(204,34,51,0.5)' : 'var(--border-color, rgba(200,184,154,0.2))';
                b.style.color = isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-secondary, #a09888)';
                b.style.background = 'transparent';
            }
        });
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return b;
    };

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        const fresh = JSON.parse(JSON.stringify(WALL_UI_DEFAULT));
        fresh._sections = ui._sections;
        onChange(fresh);
    }, 'danger'));

    return row;
}

function _buildWallSVG(ui) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 140');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '140');
    svg.style.cssText = 'display:block;';

    const wall_type = ui.wall_type || 'baffle';
    const leakArea = Number(ui.leak_area) || 0;

    const colorWall = 'var(--beige, #c8b89a)';
    const colorLeak = leakArea > 0 ? 'rgba(68,204,136,0.9)' : 'rgba(204,34,51,0.6)';
    const colorSpeaker = 'var(--accent-red, #cc2233)';
    const colorText = 'var(--text-muted, rgba(200,184,154,0.6))';

    const wallRect = document.createElementNS(NS, 'rect');
    wallRect.setAttribute('x', '180');
    wallRect.setAttribute('y', '10');
    wallRect.setAttribute('width', '40');
    wallRect.setAttribute('height', '120');
    wallRect.setAttribute('fill', colorWall);
    wallRect.setAttribute('fill-opacity', '0.15');
    wallRect.setAttribute('stroke', colorWall);
    wallRect.setAttribute('stroke-width', '1.5');
    svg.appendChild(wallRect);

    const spkRect = document.createElementNS(NS, 'rect');
    spkRect.setAttribute('x', '150');
    spkRect.setAttribute('y', '50');
    spkRect.setAttribute('width', '30');
    spkRect.setAttribute('height', '40');
    spkRect.setAttribute('rx', '5');
    spkRect.setAttribute('fill', 'none');
    spkRect.setAttribute('stroke', colorSpeaker);
    spkRect.setAttribute('stroke-width', '2');
    svg.appendChild(spkRect);

    const spkCircle = document.createElementNS(NS, 'circle');
    spkCircle.setAttribute('cx', '165');
    spkCircle.setAttribute('cy', '70');
    spkCircle.setAttribute('r', '10');
    spkCircle.setAttribute('fill', 'none');
    spkCircle.setAttribute('stroke', colorSpeaker);
    spkCircle.setAttribute('stroke-width', '1.5');
    svg.appendChild(spkCircle);

    const spkDot = document.createElementNS(NS, 'circle');
    spkDot.setAttribute('cx', '165');
    spkDot.setAttribute('cy', '70');
    spkDot.setAttribute('r', '2');
    spkDot.setAttribute('fill', colorSpeaker);
    svg.appendChild(spkDot);

    if (leakArea > 0) {
        const leakH = Math.min(60, Math.max(10, leakArea / 100));
        const leakY = 70 - leakH / 2;

        const leakRect = document.createElementNS(NS, 'rect');
        leakRect.setAttribute('x', '180');
        leakRect.setAttribute('y', String(leakY));
        leakRect.setAttribute('width', '40');
        leakRect.setAttribute('height', String(leakH));
        leakRect.setAttribute('fill', colorLeak);
        leakRect.setAttribute('fill-opacity', '0.3');
        leakRect.setAttribute('stroke', colorLeak);
        leakRect.setAttribute('stroke-width', '1');
        leakRect.setAttribute('stroke-dasharray', '4,3');
        svg.appendChild(leakRect);

        for (const dir of [1, -1]) {
            const arrow = document.createElementNS(NS, 'path');
            const x1 = dir > 0 ? 230 : 170;
            const x2 = dir > 0 ? 250 : 150;
            arrow.setAttribute('d', `M ${x1} 70 L ${x2} 70`);
            arrow.setAttribute('stroke', colorLeak);
            arrow.setAttribute('stroke-width', '2');
            arrow.setAttribute('stroke-linecap', 'round');
            svg.appendChild(arrow);

            const head = document.createElementNS(NS, 'path');
            const hx = dir > 0 ? 250 : 150;
            const sign = dir > 0 ? 1 : -1;
            head.setAttribute('d', `M ${hx} 70 L ${hx - 6*sign} 65 M ${hx} 70 L ${hx - 6*sign} 75`);
            head.setAttribute('stroke', colorLeak);
            head.setAttribute('stroke-width', '2');
            head.setAttribute('fill', 'none');
            head.setAttribute('stroke-linecap', 'round');
            svg.appendChild(head);
        }
    } else {
        const arrow = document.createElementNS(NS, 'path');
        arrow.setAttribute('d', 'M 220 70 L 240 70');
        arrow.setAttribute('stroke', colorText);
        arrow.setAttribute('stroke-width', '1');
        arrow.setAttribute('stroke-dasharray', '3,3');
        svg.appendChild(arrow);
    }

    const mkText = (x, y, text, anchor = 'middle') => {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.setAttribute('fill', colorText);
        t.setAttribute('font-size', '9');
        t.setAttribute('font-family', 'monospace');
        t.setAttribute('text-anchor', anchor);
        t.textContent = text;
        return t;
    };

    svg.appendChild(mkText(60, 75, 'Спереди', 'middle'));
    svg.appendChild(mkText(340, 75, 'Сзади', 'middle'));

    if (leakArea > 0) {
        svg.appendChild(mkText(200, 8, `щель ${leakArea} мм²`, 'middle'));
    }

    return svg;
}

function _makeSection(title, iconId, uiApi, opts = {}) {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex; flex-direction: column;
        background: var(--bg-card, #1f1f1f);
        border: 1px solid var(--border-color, rgba(200,184,154,0.10));
        border-radius: 8px;
        overflow: hidden;
        width: 100%; min-width: 0;
        box-sizing: border-box;
    `;
    if (opts.sectionKey) {
        section.dataset.wallSection = opts.sectionKey;
    }

    const head = document.createElement('button');
    head.type = 'button';
    head.style.cssText = `
        display: flex; align-items: center; gap: 6px;
        padding: 8px 12px;
        background: rgba(200,184,154,0.05);
        border: none;
        border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.08));
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.6px; text-transform: uppercase;
        color: var(--text-secondary, #a09888);
        user-select: none;
        font-family: inherit;
        text-align: left;
        width: 100%; box-sizing: border-box;
        transition: background 0.15s ease, color 0.15s ease;
    `;

    if (opts.collapsible) {
        head.style.cursor = 'pointer';
        head.addEventListener('mouseenter', () => {
            head.style.background = 'rgba(200,184,154,0.10)';
            head.style.color = 'var(--text-primary, #e0d8cc)';
        });
        head.addEventListener('mouseleave', () => {
            head.style.background = 'rgba(200,184,154,0.05)';
            head.style.color = 'var(--text-secondary, #a09888)';
        });
    } else {
        head.style.cursor = 'default';
        head.disabled = true;
        head.style.opacity = '1';
        head.style.pointerEvents = 'none';
    }

    const arrow = document.createElement('span');
    arrow.textContent = opts.collapsed ? '▶' : '▼';
    arrow.style.cssText = 'font-size:8px;opacity:0.7;width:10px;text-align:center;flex-shrink:0;';
    head.appendChild(arrow);

    const iconEl = _makeIcon(uiApi, iconId, 12);
    if (iconEl) {
        iconEl.style.flexShrink = '0';
        head.appendChild(iconEl);
    }

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    head.appendChild(titleEl);

    section.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = `
        display: ${opts.collapsed ? 'none' : 'flex'};
        flex-direction: column;
        width: 100%; min-width: 0;
        box-sizing: border-box;
    `;
    if (opts.sectionKey) {
        body.dataset.wallSectionBody = '1';
    }
    section.appendChild(body);

    if (opts.collapsible) {
        head.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'flex' : 'none';
            arrow.textContent = isHidden ? '▼' : '▶';
            if (typeof opts.onToggleLocal === 'function') {
                opts.onToggleLocal(isHidden);
            }
        });
    }

    return { el: section, body, head, arrow };
}

function _makeIcon(uiApi, id, size = 14) {
    if (uiApi && uiApi.icon && typeof uiApi.icon.svg === 'function') {
        try {
            const el = uiApi.icon.svg(id, size);
            if (el && el.nodeType === 1) return el;
        } catch (e) {}
    }
    const span = document.createElement('span');
    span.style.cssText = `display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;`;
    return span;
}

function _updateWallCard(el, value) {
    if (!el || !el.parentNode) return;
    if (!value || typeof value !== 'object') return;

    let target = el;
    if (!target.__onChange) {
        const inner = el.querySelector('[data-np-custom="1"]');
        if (inner && inner.__onChange) target = inner;
        else {
            const all = el.querySelectorAll('*');
            for (const n of all) {
                if (n.__onChange) { target = n; break; }
            }
        }
    }

    const onChange = el.__onChange || target.__onChange;
    const uiApi = el.__uiApi || target.__uiApi;
    const lastFocusedField = el.__lastFocusedField || target.__lastFocusedField;

    if (!onChange) {
        console.warn('[wall] _updateWallCard: no onChange found');
        return;
    }

    const activeEl = document.activeElement;
    let focusFieldId = null;
    let focusStart = null, focusEnd = null;
    let hadFocusInEl = false;

    if (activeEl && el.contains(activeEl)) {
        hadFocusInEl = true;
        if (activeEl.dataset && activeEl.dataset.fieldId) {
            focusFieldId = activeEl.dataset.fieldId;
            if (activeEl.selectionStart != null) {
                focusStart = activeEl.selectionStart;
                focusEnd = activeEl.selectionEnd;
            }
        }
    }
    if (!hadFocusInEl) focusFieldId = null;

    const sectionsState = { ...(value._sections || WALL_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-wall-section]');
        for (const s of sections) {
            const secKey = s.dataset.wallSection;
            const body = s.querySelector('[data-wall-section-body]');
            if (body && secKey) {
                sectionsState[secKey] = (body.style.display === 'none');
            }
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderWallCard(value, onChange, { host: { ui: uiApi } }, null);

    fresh.__onChange = onChange;
    fresh.__uiApi = uiApi;
    fresh.__lastFocusedField = lastFocusedField;

    el.innerHTML = '';
    while (fresh.firstChild) {
        el.appendChild(fresh.firstChild);
    }

    el.__onChange = onChange;
    el.__uiApi = uiApi;
    el.__lastFocusedField = lastFocusedField;

    if (focusFieldId) {
        const targetEl = el.querySelector(`input[data-field-id="${CSS.escape(focusFieldId)}"]`);
        if (targetEl) {
            targetEl.focus();
            try {
                if (focusStart != null && targetEl.setSelectionRange) {
                    targetEl.setSelectionRange(focusStart, focusEnd);
                }
            } catch (e) {}
        }
    }
}