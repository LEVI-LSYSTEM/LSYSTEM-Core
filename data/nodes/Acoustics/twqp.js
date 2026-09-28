// data/nodes/Acoustics/twqp.js
// v9.0 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ ЛИНИИ ПЕРЕДАЧИ
//
// ИЗМЕНЕНИЯ v9.0 (критично):
//   - Добавлен mergedPorts: [{ a: 'out', b: 'gnd' }] во ВСЕХ трёх ветках
//     termination (open, closed, ported).
//
//   Почему: порт 'out' объявлен как radiatingPort, и солвер в _buildNetlist
//   ПРОПУСКАЕТ соединение 'out → solver' в DSU. В результате узел 'out'
//   остаётся изолированным, R_rad_out / R_rad_port висит между 'm_N' и
//   изолированным 'out'. Уравнение Кирхгофа для 'out' даёт x[out] = x[m_N],
//   ток через R_rad = 0, и линия НЕ нагружена на радиационный импеданс.
//
//   mergedPorts явно объединяет 'out' и 'gnd' ВНУТРИ фрагмента, до DSU.
//   Тогда R_rad работает между 'm_N'/'m_port' и землёй — правильная нагрузка.
//   Излучение при этом не страдает: emit.from='m_N'/'m_port', emit.to='out',
//   а 'out' теперь тот же узел, что 'gnd'.
//
// Архитектура (согласована с box.js / port.js / passive_radiator.js / speaker.js):
//   - radiatingPorts декларативный: [{ port:'out', emit:{...} }].
//   - Солвер не знает, что это TWQP: применяет U = sign·Y·V.
//
// Физика (акустический домен):
//   TL / TQWT / ML-TL / лабиринт сегментируется на N ячеек:
//     m_i --Ma_i--> m_{i+1} --Ca_i--> gnd
//   + R_visc_i (sqrt_omega) последовательно с Ma_i
//   + R_fill_i (sqrt_omega) в зоне заполнителя
//
//   Termination:
//     open:    m_N --R_rad_ext--> out   (rad_plateau, r = sqrt(S_end/π))
//     closed:  m_N --Ca_N--> gnd       (гибкость закрытого конца)
//     ported:  m_N --Ma_port--> m_port --R_rad_port--> out
//              + R_visc_port последовательно с Ma_port
//
//   Врезка динамика:
//     rear --R_link--> m_k   (R_link = 1e-6, k = round(x_driver·N))
//
// Излучение:
//   open:   поток через R_rad_ext: I = Y_rad·(x[m_N]−x[out])
//           emit: from='m_N', to='out', sign=−1
//   ported: поток через Ma_port:   I = Y_Ma·(x[m_N]−x[m_port])
//           emit: from='m_N', to='m_port', sign=+1
//   closed: не излучает

'use strict';

// ============================================================
// ДЕФОЛТЫ
// ============================================================

const TWQP_UI_DEFAULT = {
    config: 'twqp',

    length: 1500,
    s_start: 200,
    s_end: 100,
    taper: 'linear',

    x_driver: 0.0,

    termination: 'open',
    port_d: 50,
    port_l: 100,

    fill_density: 0,
    fill_ratio: 0,

    n_segments: 30,
    d_port: 0.10,

    _user: { length: true, s_start: true, s_end: true },
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: {
        config: false,
        geometry: false,
        driver: false,
        termination: false,
        fill: false,
        response: false,
        advanced: true
    }
};

const CONFIG_PRESETS = {
    tl: {
        label: 'TL',
        taper: 'linear',
        termination: 'open',
        x_driver: 0.0,
        desc: 'Классическая линия передачи'
    },
    twqp: {
        label: 'TWQP',
        taper: 'linear',
        termination: 'open',
        x_driver: 0.2,
        desc: 'Tapered, драйвер смещён'
    },
    tqwt: {
        label: 'TQWT',
        taper: 'linear',
        termination: 'open',
        x_driver: 0.0,
        s_end_ratio: 0.3,
        desc: 'Tapered Quarter-Wave Tube'
    },
    mltl: {
        label: 'ML-TL',
        taper: 'linear',
        termination: 'ported',
        x_driver: 0.2,
        desc: 'Mass-Loaded TL'
    },
    labyrinth: {
        label: 'Лабиринт',
        taper: 'linear',
        termination: 'open',
        x_driver: 0.0,
        desc: 'С изгибами'
    }
};

const TAPER_LABEL = {
    linear:      'линейный',
    exponential: 'экспоненциальный',
    parabolic:   'параболический'
};

const TERMINATION_LABEL = {
    open:    'открытый',
    closed:  'закрытый',
    ported:  'с портом'
};

// ============================================================
// ФИЗИКА
// ============================================================

const RHO0 = 1.2041;
const C0   = 343.0;
const MU   = 1.81e-5;

function _profileS(x_over_L, s_start_m2, s_end_m2, taper) {
    const x = Math.max(0, Math.min(1, x_over_L));
    const S0 = s_start_m2;
    const S1 = s_end_m2;
    if (!(S0 > 0) || !(S1 > 0)) return 0;

    switch (taper) {
        case 'exponential':
            return S0 * Math.pow(S1 / S0, x);
        case 'parabolic': {
            const k = 1 - Math.sqrt(S1 / S0);
            const v = 1 - k * x;
            return S0 * v * v;
        }
        case 'linear':
        default:
            return S0 + (S1 - S0) * x;
    }
}

function _radiusFromS(S_m2) {
    return Math.sqrt(S_m2 / Math.PI);
}

function _effLength(L_mm, s_end_m2, termination, port_l_mm) {
    const L = Number(L_mm) / 1000;
    if (!(L > 0)) return 0;

    if (termination === 'closed') return L;

    if (termination === 'ported') {
        const Lp = (Number(port_l_mm) || 0) / 1000;
        return L + Lp;
    }

    const r = _radiusFromS(s_end_m2);
    return L + 0.61 * r;
}

function _resonances(L_eff_m, termination, nMax) {
    if (!(L_eff_m > 0)) return [];
    const out = [];
    for (let n = 1; n <= nMax; n++) {
        let f;
        if (termination === 'closed') {
            f = n * C0 / (2 * L_eff_m);
        } else {
            f = (2 * n - 1) * C0 / (4 * L_eff_m);
        }
        if (isFinite(f)) out.push(f);
    }
    return out;
}

function _volumeTl(L_mm, s_start_m2, s_end_m2, taper) {
    const L = Number(L_mm) / 1000;
    if (!(L > 0)) return 0;

    const N = 100;
    const dx = 1 / N;
    let V = 0;
    for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx;
        V += _profileS(x, s_start_m2, s_end_m2, taper) * dx * L;
    }
    return V;
}

function _viscResistanceSegment(dx_m, S_m2, f_ref) {
    const w_ref = 2 * Math.PI * (f_ref || 100);
    const deltaV_ref = Math.sqrt(2 * MU / (RHO0 * w_ref));
    const r = _radiusFromS(S_m2);
    if (!(r > 0) || !(S_m2 > 0)) return 0;
    const R_base = (8 * MU * dx_m) / (Math.PI * Math.pow(r, 4));
    return R_base * (1 + r / deltaV_ref);
}

function _fillResistanceSegment(dx_m, S_m2, fill_density, f_ref) {
    if (!(fill_density > 0) || !(S_m2 > 0)) return 0;
    const K = 10;
    const w_ref = 2 * Math.PI * (f_ref || 100);
    return K * fill_density * dx_m * Math.sqrt(w_ref) / S_m2;
}

function _massSegment(dx_m, S_m2) {
    if (!(S_m2 > 0)) return 0;
    return RHO0 * dx_m / S_m2;
}

function _complianceSegment(dx_m, S_m2) {
    return (S_m2 * dx_m) / (RHO0 * C0 * C0);
}

function _radResistanceRef(A_m2, r_m) {
    if (!(A_m2 > 0) || !(r_m > 0)) return 0;
    const w_ref = 2 * Math.PI * 100;
    const ka = (w_ref / C0) * r_m;
    const ka2 = ka * ka;
    return RHO0 * C0 * A_m2 * ka2 / (1 + ka2);
}

// ============================================================
// АВТОРАСЧЁТ
// ============================================================

function _calcAll(ui) {
    const out = JSON.parse(JSON.stringify(ui));
    const _calc = { ...(out._calc || {}) };

    if (!CONFIG_PRESETS[out.config]) {
        out.config = 'twqp';
        _calc.config = true;
    }

    if (out.config === 'tqwt' && out.s_end > out.s_start) {
        const t = out.s_end; out.s_end = out.s_start; out.s_start = t;
        _calc.s_end = true;
        _calc.s_start = true;
    }

    if (out._lastEdited === 'config') {
        const preset = CONFIG_PRESETS[out.config];
        if (preset) {
            out.taper = preset.taper;
            out.termination = preset.termination;
            out.x_driver = preset.x_driver;
            if (preset.s_end_ratio && out.s_start > 0) {
                out.s_end = Math.round(out.s_start * preset.s_end_ratio);
            }
            _calc.taper = true;
            _calc.termination = true;
            _calc.x_driver = true;
        }
    }

    if (!(out.length > 0)) out.length = 1500;
    if (!(out.s_start > 0)) out.s_start = 200;
    if (!(out.s_end > 0)) out.s_end = 100;
    if (out.x_driver < 0) out.x_driver = 0;
    if (out.x_driver > 1) out.x_driver = 1;
    if (out.n_segments < 10) out.n_segments = 10;
    if (out.n_segments > 200) out.n_segments = 200;
    if (!(out.port_d > 0)) out.port_d = 50;
    if (!(out.port_l > 0)) out.port_l = 100;
    if (out.d_port < 0) out.d_port = 0.10;

    out._calc = _calc;
    return out;
}

// ============================================================
// МОДУЛЬ
// ============================================================

module.exports = {
    meta: {
        id: 'Acoustics.twqp',
        label: 'TWQP',
        icon: 'icon-wave'
    },

    ports: {
        inputs:  [{ id: 'rear', label: 'Rear' }],
        outputs: [{ id: 'out',  label: 'Out'  }]
    },

    inputRules:  { rear: ['speaker.js', 'box.js'] },
    outputRules: { out:  ['LEMsolver.js'] },

    maxInputs:  { rear: 1 },
    maxOutputs: { out:  1 },

    params: [
        {
            id: 'twqp_ui',
            type: 'twqp_ui',
            label: 'TWQP',
            default: TWQP_UI_DEFAULT,
            category: 'TWQP',
            _noCategoryHeader: true
        }
    ],

    onParamChange(id, value, node) {
        if (id !== 'twqp_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(TWQP_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...TWQP_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;

        node.paramValues.twqp_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'twqp_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.twqp_ui && typeof p.twqp_ui === 'object') ? p.twqp_ui : TWQP_UI_DEFAULT;

        const config       = ui.config || 'twqp';
        const L_mm         = Number(ui.length);
        const S_start_cm2  = Number(ui.s_start);
        const S_end_cm2    = Number(ui.s_end);
        const taper        = ui.taper || 'linear';
        const x_driver     = Math.max(0, Math.min(1, Number(ui.x_driver) || 0));
        const termination  = ui.termination || 'open';
        const port_d_mm    = Number(ui.port_d) || 50;
        const port_l_mm    = Number(ui.port_l) || 100;
        const fill_density = Math.max(0, Number(ui.fill_density) || 0);
        const fill_ratio   = Math.max(0, Math.min(100, Number(ui.fill_ratio) || 0));
        const N            = Math.max(10, Math.min(200, Math.floor(Number(ui.n_segments) || 30)));
        const d_port       = Math.max(0, Number(ui.d_port) || 0.10);

        if (!(L_mm > 0))        throw new Error('TWQP: length > 0');
        if (!(S_start_cm2 > 0)) throw new Error('TWQP: S_start > 0');
        if (!(S_end_cm2 > 0))   throw new Error('TWQP: S_end > 0');

        const L_m = L_mm / 1000;
        const S_start_m2 = S_start_cm2 * 1e-4;
        const S_end_m2   = S_end_cm2 * 1e-4;

        const L_eff = _effLength(L_mm, S_end_m2, termination, port_l_mm);
        const f_res = _resonances(L_eff, termination, 5);
        const V_tl = _volumeTl(L_mm, S_start_m2, S_end_m2, taper);

        const dx = L_m / N;

        const nodes = ['rear', 'out', 'gnd'];
        for (let i = 0; i <= N; i++) nodes.push(`m${i}`);

        const components = [];

        for (let i = 0; i < N; i++) {
            const x_center = (i + 0.5) / N;
            const S_i = _profileS(x_center, S_start_m2, S_end_m2, taper);
            const S_i_safe = Math.max(S_i, 1e-8);

            const Ma_i = _massSegment(dx, S_i_safe);
            const Ca_i = _complianceSegment(dx, S_i_safe);

            components.push({
                id: `Ma_${i}`,
                type: 'L',
                from: `m${i}`,
                to: `m${i+1}`,
                value: Ma_i
            });

            const needCa = (i < N - 1) || (termination === 'closed') || (termination === 'ported');
            if (needCa) {
                components.push({
                    id: `Ca_${i}`,
                    type: 'C',
                    from: `m${i+1}`,
                    to: 'gnd',
                    value: Ca_i
                });
            }

            const R_visc_ref = _viscResistanceSegment(dx, S_i_safe, 100);
            if (R_visc_ref > 0) {
                components.push({
                    id: `R_visc_${i}`,
                    type: 'R_freq',
                    from: `m${i}`,
                    to: `m${i+1}`,
                    value: R_visc_ref,
                    freqRef: 100,
                    law: 'sqrt_omega'
                });
            }

            const inFillZone = ((i + 0.5) / N) * 100 <= fill_ratio;
            if (fill_density > 0 && inFillZone) {
                const R_fill_ref = _fillResistanceSegment(dx, S_i_safe, fill_density, 100);
                if (R_fill_ref > 0) {
                    components.push({
                        id: `R_fill_${i}`,
                        type: 'R_freq',
                        from: `m${i}`,
                        to: `m${i+1}`,
                        value: R_fill_ref,
                        freqRef: 100,
                        law: 'sqrt_omega'
                    });
                }
            }
        }

        const k = Math.max(0, Math.min(N, Math.round(x_driver * N)));
        const driverNode = `m${k}`;

        components.push({
            id: 'link_rear',
            type: 'R',
            from: 'rear',
            to: driverNode,
            value: 1e-6
        });

        const mLast = `m${N}`;

        let radiatingPorts = [];
        let metaExtra = {};

        if (termination === 'open') {
            const S_end_safe = Math.max(S_end_m2, 1e-8);
            const r_end = _radiusFromS(S_end_safe);
            const R_rad_ref = _radResistanceRef(S_end_safe, r_end);

            components.push({
                id: 'R_rad_out',
                type: 'R_freq',
                from: mLast,
                to: 'out',
                value: R_rad_ref,
                freqRef: 100,
                law: 'rad_plateau',
                radiationRadius_m: r_end
            });

            radiatingPorts = [
                {
                    port: 'out',
                    emit: {
                        kind: 'current_through',
                        from: mLast,
                        to: 'out',
                        sign: -1,
                        delay_m: d_port,
                        admittance: {
                            type: 'R_freq',
                            value: R_rad_ref,
                            freqRef: 100,
                            law: 'rad_plateau',
                            radiationRadius_m: r_end
                        }
                    }
                }
            ];

            metaExtra = {
                termination_kind: 'open',
                r_end_m: r_end,
                S_end_m2: S_end_safe,
                R_rad_ref
            };

        } else if (termination === 'closed') {
            metaExtra = {
                termination_kind: 'closed'
            };

        } else if (termination === 'ported') {
            const r_port = port_d_mm / 2000;
            const S_port = Math.PI * r_port * r_port;

            if (S_port > 0) {
                const L_eff_port = (port_l_mm / 1000) + 2 * 0.61 * r_port;
                const Ma_port = (RHO0 * L_eff_port) / S_port;
                const R_visc_port_ref = _viscResistanceSegment(L_eff_port, S_port, 100);
                const R_rad_port_ref = _radResistanceRef(S_port, r_port);

                nodes.push('m_port');

                components.push({
                    id: 'Ma_port',
                    type: 'L',
                    from: mLast,
                    to: 'm_port',
                    value: Ma_port
                });

                if (R_visc_port_ref > 0) {
                    components.push({
                        id: 'R_visc_port',
                        type: 'R_freq',
                        from: mLast,
                        to: 'm_port',
                        value: R_visc_port_ref,
                        freqRef: 100,
                        law: 'sqrt_omega'
                    });
                }

                components.push({
                    id: 'R_rad_port',
                    type: 'R_freq',
                    from: 'm_port',
                    to: 'out',
                    value: R_rad_port_ref,
                    freqRef: 100,
                    law: 'rad_plateau',
                    radiationRadius_m: r_port
                });

                radiatingPorts = [
                    {
                        port: 'out',
                        emit: {
                            kind: 'current_through',
                            from: mLast,
                            to: 'm_port',
                            sign: +1,
                            delay_m: d_port,
                            admittance: {
                                type: 'L',
                                value: Ma_port
                            }
                        }
                    }
                ];

                metaExtra = {
                    termination_kind: 'ported',
                    port_d_mm,
                    port_l_mm,
                    S_port_m2: S_port,
                    r_port_m: r_port,
                    L_eff_port_m: L_eff_port,
                    Ma_port,
                    R_visc_port_ref,
                    R_rad_port_ref,
                    radiationRadius_m: r_port
                };
            } else {
                metaExtra = { termination_kind: 'ported', error: 'S_port = 0' };
            }
        }

        // ═══ КРИТИЧНО: объединяем 'out' с 'gnd' ВНУТРИ фрагмента ═══
        // См. комментарий в шапке файла. Без этого 'out' изолирован
        // (солвер пропускает 'out→solver' в DSU для radiating-портов),
        // и R_rad_out / R_rad_port висит в воздухе.
        const mergedPorts = [
            { a: 'out', b: 'gnd' }
        ];

        const ports = {
            rear: 'rear',
            out: 'out',
            gnd: 'gnd'
        };

        return {
            kind: 'lem.fragment',
            source: 'twqp',
            nodes,
            components,
            ports,
            mergedPorts,
            radiatingPorts,
            markers: {
                driverNode,
                x_driver,
                k_index: k,
                N_segments: N
            },
            meta: {
                label: `TWQP ${config.toUpperCase()} ${L_mm} мм`,
                config,
                length_mm: L_mm,
                s_start_cm2: S_start_cm2,
                s_end_cm2: S_end_cm2,
                taper,
                x_driver,
                termination,
                fill_density,
                fill_ratio,
                n_segments: N,
                L_eff_m: L_eff,
                f_resonances_Hz: f_res,
                V_tl_m3: V_tl,
                d_port_m: d_port,
                driverNode,
                k_index: k,
                ...metaExtra
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'TWQP not connected' };
        }
        const ui = (ctx.params && ctx.params.twqp_ui) || {};
        if (!(Number(ui.length) > 0))    return { ready: false, reason: 'TWQP: L > 0' };
        if (!(Number(ui.s_start) > 0))   return { ready: false, reason: 'TWQP: S_start > 0' };
        if (!(Number(ui.s_end) > 0))     return { ready: false, reason: 'TWQP: S_end > 0' };
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'twqp_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderTwqpCard(value, onChange, ctx, node);
                },
                update(el, value) {
                    _updateTwqpCard(el, value);
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
// UI — без изменений (сохранён из v7.1)
// ============================================================

function _renderTwqpCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(TWQP_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...TWQP_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'twqp-ui';
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
        if (node && node.paramValues && node.paramValues.twqp_ui) {
            if (!node.paramValues.twqp_ui._sections) node.paramValues.twqp_ui._sections = {};
            node.paramValues.twqp_ui._sections[key] = collapsed;
        }
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildConfigSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildGeometrySection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildDriverSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildTerminationSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildFillSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildResponseSection(ui, uiApi, toggleSectionLocal));
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

    const icon = _makeIcon(uiApi, 'icon-wave', 20);
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
    const L = Number(ui.length) || 0;
    const preset = CONFIG_PRESETS[ui.config] || CONFIG_PRESETS.twqp;
    line1.textContent = `${preset.label} ${L} мм · ${TAPER_LABEL[ui.taper] || ui.taper}`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = `
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-family: 'Courier New', monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const s0 = Number(ui.s_start) || 0;
    const s1 = Number(ui.s_end) || 0;
    const xd = (Number(ui.x_driver) || 0) * L;
    line2.textContent = `S ${s0}→${s1} см² · драйвер ${Math.round(xd)} мм`;
    info.appendChild(line2);

    bar.appendChild(info);

    const missing = !(L > 0) || !(Number(ui.s_start) > 0) || !(Number(ui.s_end) > 0);
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `
        font-size: 10px; font-weight: 700;
        padding: 4px 10px; border-radius: 12px;
        white-space: nowrap; flex-shrink: 0;
    `;
    if (missing) {
        statusEl.textContent = '⚠ обязат.';
        statusEl.style.background = 'rgba(200,184,154,0.15)';
        statusEl.style.color = 'var(--beige, #c8b89a)';
        statusEl.style.border = '1px solid rgba(200,184,154,0.5)';
    } else {
        statusEl.textContent = '✓ Готов';
        statusEl.style.background = 'rgba(68,204,136,0.12)';
        statusEl.style.color = 'rgba(68,204,136,0.95)';
        statusEl.style.border = '1px solid rgba(68,204,136,0.35)';
    }
    bar.appendChild(statusEl);

    return bar;
}

function _buildConfigSection(ui, onChange, uiApi, toggleSection) {
    const key = 'config';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Конфигурация', 'icon-nodegraph', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; gap: 6px; padding: 8px 12px;
        flex-wrap: wrap; width: 100%; box-sizing: border-box;
    `;

    const order = ['tl', 'twqp', 'tqwt', 'mltl', 'labyrinth'];

    for (const cfgId of order) {
        const preset = CONFIG_PRESETS[cfgId];
        const isActive = ui.config === cfgId;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = preset.label;
        btn.title = preset.desc;
        btn.style.cssText = `
            padding: 5px 12px; font-size: 10px; font-weight: 600;
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
            next.config = cfgId;
            next._lastEdited = 'config';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }

    section.body.appendChild(row);

    const hint = document.createElement('div');
    hint.textContent = (CONFIG_PRESETS[ui.config] || {}).desc || '';
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

function _buildGeometrySection(ui, onChange, uiApi, toggleSection) {
    const key = 'geometry';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Геометрия', 'icon-equalizer', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    section.body.appendChild(_buildNumberField(ui, {
        id: 'length', label: 'Длина *', unit: 'мм', step: 10,
        required: true, hint: 'Длина линии от динамика до конца'
    }, onChange));

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 10px; padding: 4px 12px 8px;
        width: 100%; box-sizing: border-box;
    `;
    grid.appendChild(_buildDimField(ui, {
        id: 's_start', label: 'S нач. *', unit: 'см²', step: 1, required: true,
        hint: 'Площадь у динамика'
    }, onChange));
    grid.appendChild(_buildDimField(ui, {
        id: 's_end', label: 'S кон. *', unit: 'см²', step: 1, required: true,
        hint: 'Площадь у конца'
    }, onChange));
    section.body.appendChild(grid);

    const K = (Number(ui.s_start) > 0) ? (Number(ui.s_end) / Number(ui.s_start)) : 0;
    const kRow = document.createElement('div');
    kRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 6px 12px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.55));
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;
    const kLabel = document.createElement('span');
    kLabel.textContent = 'K тапера (S_end / S_start):';
    kLabel.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    kRow.appendChild(kLabel);
    const kVal = document.createElement('span');
    kVal.textContent = K.toFixed(2);
    kVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: ${K < 0.1 || K > 2 ? 'rgba(255,170,51,0.95)' : 'var(--text-secondary, #a09888)'};
        flex-shrink: 0;
    `;
    kRow.appendChild(kVal);
    section.body.appendChild(kRow);

    section.body.appendChild(_buildTaperRadio(ui, onChange));

    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = `
        padding: 10px 12px;
        background: rgba(0,0,0,0.20);
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;
    svgWrap.appendChild(_buildProfileSVG(ui));
    section.body.appendChild(svgWrap);

    return section.el;
}

function _buildDimField(ui, f, onChange) {
    const v = ui[f.id];
    const isUser = !!(ui._user && ui._user[f.id]);
    const isCalc = !!(ui._calc && ui._calc[f.id]);
    const isEmpty = (v == null || v === '' || !(Number(v) > 0));
    const isRequired = !!f.required;

    let borderColor, bgColor;
    if (isRequired && isEmpty) {
        borderColor = 'rgba(200,184,154,0.85)';
        bgColor = 'rgba(200,184,154,0.08)';
    } else if (isUser) {
        borderColor = 'rgba(204,34,51,0.4)';
        bgColor = 'rgba(204,34,51,0.04)';
    } else if (isCalc) {
        borderColor = 'rgba(68,204,136,0.4)';
        bgColor = 'rgba(68,204,136,0.04)';
    } else {
        borderColor = 'var(--border-color, rgba(200,184,154,0.10))';
        bgColor = 'transparent';
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;box-sizing:border-box;';

    const lbl = document.createElement('div');
    lbl.textContent = f.label;
    lbl.title = f.hint || '';
    lbl.style.cssText = `
        font-size: 10px; font-weight: 600;
        color: ${isRequired ? 'var(--beige, #c8b89a)' : 'var(--text-secondary, #a09888)'};
        letter-spacing: 0.4px; cursor: help;
    `;
    wrap.appendChild(lbl);

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;';

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    inp.value = isEmpty ? '' : String(v);
    inp.placeholder = isRequired ? 'обязательное' : '';
    inp.dataset.fieldId = f.id;
    inp.title = f.hint || '';
    inp.style.cssText = `
        flex: 1 1 0; min-width: 0; width: 100%;
        padding: 5px 8px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        font-weight: 600;
        background: ${bgColor};
        color: var(--text-primary, #e0d8cc);
        border: 1px solid ${borderColor};
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    `;
    inp.addEventListener('focus', () => {
        inp.style.borderColor = isRequired ? 'var(--beige, #c8b89a)' : 'var(--accent-red, #cc2233)';
        inp.style.boxShadow = isRequired
            ? '0 0 0 2px rgba(200,184,154,0.2)'
            : '0 0 0 2px rgba(204,34,51,0.18)';
        inp.style.background = 'var(--bg-input, #2a2a2a)';
    });
    inp.addEventListener('blur', () => {
        inp.style.boxShadow = 'none';
    });
    inp.addEventListener('change', () => {
        const raw = inp.value.trim();
        if (raw === '') return;
        const num = Number(raw);
        if (!isFinite(num) || num <= 0) return;

        const next = JSON.parse(JSON.stringify(ui));
        next[f.id] = num;
        next._user = { ...(next._user || {}), [f.id]: true };
        if (next._calc) delete next._calc[f.id];
        next._lastEdited = f.id;
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') inp.blur();
    });
    inputWrap.appendChild(inp);

    const unit = document.createElement('span');
    unit.textContent = f.unit || '';
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;flex-shrink:0;';
    inputWrap.appendChild(unit);

    wrap.appendChild(inputWrap);
    return wrap;
}

function _buildNumberField(ui, f, onChange) {
    const v = ui[f.id];
    const isUser = !!(ui._user && ui._user[f.id]);
    const isCalc = !!(ui._calc && ui._calc[f.id]);
    const isEmpty = (v == null || v === '' || !(Number(v) > 0));
    const isRequired = !!f.required;

    let borderColor, bgColor;
    if (isRequired && isEmpty) {
        borderColor = 'rgba(200,184,154,0.85)';
        bgColor = 'rgba(200,184,154,0.08)';
    } else if (isUser) {
        borderColor = 'rgba(204,34,51,0.4)';
        bgColor = 'rgba(204,34,51,0.04)';
    } else if (isCalc) {
        borderColor = 'rgba(68,204,136,0.4)';
        bgColor = 'rgba(68,204,136,0.04)';
    } else {
        borderColor = 'var(--border-color, rgba(200,184,154,0.10))';
        bgColor = 'transparent';
    }

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const lbl = document.createElement('div');
    lbl.textContent = f.label;
    lbl.title = f.hint || '';
    lbl.style.cssText = `
        font-size: 11px; font-weight: 600;
        color: ${isRequired ? 'var(--beige, #c8b89a)' : 'var(--text-secondary, #a09888)'};
        min-width: 70px; flex-shrink: 0;
        cursor: help;
    `;
    row.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    inp.value = isEmpty ? '' : String(v);
    inp.placeholder = isRequired ? 'обязательное' : '';
    inp.dataset.fieldId = f.id;
    inp.title = f.hint || '';
    inp.style.cssText = `
        flex: 1 1 0; min-width: 0; width: 100%;
        padding: 5px 8px;
        font-size: 12px;
        font-family: 'Courier New', monospace;
        font-weight: 600;
        background: ${bgColor};
        color: var(--text-primary, #e0d8cc);
        border: 1px solid ${borderColor};
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    `;
    inp.addEventListener('focus', () => {
        inp.style.borderColor = isRequired ? 'var(--beige, #c8b89a)' : 'var(--accent-red, #cc2233)';
        inp.style.boxShadow = '0 0 0 2px rgba(204,34,51,0.18)';
        inp.style.background = 'var(--bg-input, #2a2a2a)';
    });
    inp.addEventListener('blur', () => {
        inp.style.boxShadow = 'none';
    });
    inp.addEventListener('change', () => {
        const raw = inp.value.trim();
        if (raw === '') return;
        const num = Number(raw);
        if (!isFinite(num) || num <= 0) return;

        const next = JSON.parse(JSON.stringify(ui));
        next[f.id] = num;
        next._user = { ...(next._user || {}), [f.id]: true };
        if (next._calc) delete next._calc[f.id];
        next._lastEdited = f.id;
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') inp.blur();
    });
    row.appendChild(inp);

    const unit = document.createElement('span');
    unit.textContent = f.unit || '';
    unit.style.cssText = 'font-size:10px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:monospace;flex-shrink:0;width:28px;';
    row.appendChild(unit);

    return row;
}

function _buildTaperRadio(ui, onChange) {
    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const lbl = document.createElement('div');
    lbl.textContent = 'Тапер:';
    lbl.style.cssText = `
        font-size: 11px; font-weight: 600;
        color: var(--text-secondary, #a09888);
        min-width: 70px; flex-shrink: 0;
    `;
    row.appendChild(lbl);

    const group = document.createElement('div');
    group.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;min-width:0;';

    const groupName = 'taper_' + Math.random().toString(36).slice(2, 8);

    for (const opt of ['linear', 'exponential', 'parabolic']) {
        const l = document.createElement('label');
        l.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-primary,#e0d8cc);cursor:pointer;';

        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = groupName;
        inp.checked = ui.taper === opt;
        inp.style.cssText = 'accent-color:var(--accent-red,#cc2233);cursor:pointer;';
        inp.addEventListener('change', () => {
            const next = JSON.parse(JSON.stringify(ui));
            next.taper = opt;
            next._lastEdited = 'taper';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        l.appendChild(inp);
        l.appendChild(document.createTextNode(TAPER_LABEL[opt] || opt));
        group.appendChild(l);
    }

    row.appendChild(group);
    return row;
}

function _buildDriverSection(ui, onChange, uiApi, toggleSection) {
    const key = 'driver';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Динамик', 'icon-speaker', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const L = Number(ui.length) || 0;
    const xd = Number(ui.x_driver) || 0;

    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '1'; slider.step = '0.01';
    slider.value = String(xd);
    slider.dataset.fieldId = 'x_driver';
    slider.style.cssText = `
        flex: 1 1 0; min-width: 0;
        accent-color: var(--accent-red, #cc2233); cursor: pointer;
    `;
    slider.addEventListener('input', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next.x_driver = Number(slider.value);
        next._lastEdited = 'x_driver';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    sliderRow.appendChild(slider);

    const sliderVal = document.createElement('div');
    sliderVal.textContent = xd.toFixed(2);
    sliderVal.style.cssText = `
        min-width: 42px; text-align: right;
        font-size: 11px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: var(--text-primary, #e0d8cc);
        flex-shrink: 0;
    `;
    sliderRow.appendChild(sliderVal);

    section.body.appendChild(sliderRow);

    const posRow = document.createElement('div');
    posRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 4px 12px 10px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.55));
        width: 100%; box-sizing: border-box;
    `;
    const posLbl = document.createElement('span');
    posLbl.textContent = 'Позиция от начала:';
    posLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    posRow.appendChild(posLbl);
    const posVal = document.createElement('span');
    posVal.textContent = Math.round(xd * L) + ' мм';
    posVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    posRow.appendChild(posVal);
    section.body.appendChild(posRow);

    return section.el;
}

function _buildTerminationSection(ui, onChange, uiApi, toggleSection) {
    const key = 'termination';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Конец линии', 'icon-port', uiApi, {
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
        { id: 'open',    label: 'Открытый' },
        { id: 'closed',  label: 'Закрытый' },
        { id: 'ported',  label: 'С портом' }
    ];

    for (const opt of OPTS) {
        const isActive = ui.termination === opt.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.style.cssText = `
            padding: 5px 12px; font-size: 10px; font-weight: 600;
            font-family: inherit; border-radius: 5px;
            border: 1px solid ${isActive ? 'var(--accent-red, #cc2233)' : 'var(--border-color, rgba(200,184,154,0.15))'};
            background: ${isActive ? 'rgba(204,34,51,0.18)' : 'transparent'};
            color: ${isActive ? 'var(--text-primary, #e0d8cc)' : 'var(--text-secondary, #a09888)'};
            cursor: pointer; transition: all 0.15s ease;
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
            next.termination = opt.id;
            next._lastEdited = 'termination';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }

    section.body.appendChild(row);

    if (ui.termination === 'ported') {
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
            gap: 10px; padding: 4px 12px 10px;
            width: 100%; box-sizing: border-box;
        `;
        grid.appendChild(_buildDimField(ui, {
            id: 'port_d', label: 'Ø порта', unit: 'мм', step: 1,
            hint: 'Диаметр порта'
        }, onChange));
        grid.appendChild(_buildDimField(ui, {
            id: 'port_l', label: 'L порта', unit: 'мм', step: 1,
            hint: 'Длина порта'
        }, onChange));
        section.body.appendChild(grid);
    }

    return section.el;
}

function _buildFillSection(ui, onChange, uiApi, toggleSection) {
    const key = 'fill';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Заполнитель', 'icon-wave', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const fill = Number(ui.fill_ratio) || 0;
    const density = Number(ui.fill_density) || 0;

    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.value = String(fill);
    slider.dataset.fieldId = 'fill_ratio';
    slider.style.cssText = `
        flex: 1 1 0; min-width: 0;
        accent-color: var(--accent-red, #cc2233); cursor: pointer;
    `;
    slider.addEventListener('input', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next.fill_ratio = Number(slider.value);
        next._lastEdited = 'fill_ratio';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    sliderRow.appendChild(slider);

    const sliderVal = document.createElement('div');
    sliderVal.textContent = fill + '%';
    sliderVal.style.cssText = `
        min-width: 42px; text-align: right;
        font-size: 11px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: var(--text-primary, #e0d8cc);
        flex-shrink: 0;
    `;
    sliderRow.appendChild(sliderVal);

    section.body.appendChild(sliderRow);

    const densityRow = document.createElement('div');
    densityRow.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 4px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;

    const dl = document.createElement('div');
    dl.textContent = 'Плотность:';
    dl.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary, #a09888); min-width: 70px;';
    densityRow.appendChild(dl);

    const dInp = document.createElement('input');
    dInp.type = 'number';
    dInp.step = '1';
    dInp.min = '0';
    dInp.value = String(density);
    dInp.dataset.fieldId = 'fill_density';
    dInp.style.cssText = `
        flex: 1 1 0; min-width: 0;
        padding: 5px 8px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        background: transparent;
        color: var(--text-primary, #e0d8cc);
        border: 1px solid var(--border-color, rgba(200,184,154,0.10));
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
    `;
    dInp.addEventListener('focus', () => {
        dInp.style.borderColor = 'var(--accent-red, #cc2233)';
        dInp.style.background = 'var(--bg-input, #2a2a2a)';
    });
    dInp.addEventListener('blur', () => {
        dInp.style.borderColor = 'var(--border-color, rgba(200,184,154,0.10))';
        dInp.style.background = 'transparent';
    });
    dInp.addEventListener('change', () => {
        const num = Number(dInp.value);
        if (!isFinite(num) || num < 0) return;
        const next = JSON.parse(JSON.stringify(ui));
        next.fill_density = num;
        next._lastEdited = 'fill_density';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    densityRow.appendChild(dInp);

    const du = document.createElement('span');
    du.textContent = 'кг/м³';
    du.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;flex-shrink:0;width:32px;';
    densityRow.appendChild(du);

    section.body.appendChild(densityRow);

    return section.el;
}

function _buildResponseSection(ui, uiApi, toggleSection) {
    const key = 'response';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Резонансы', 'icon-frequency', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const L_mm = Number(ui.length) || 0;
    const S_start = Number(ui.s_start) || 0;
    const S_end = Number(ui.s_end) || 0;
    const taper = ui.taper || 'linear';
    const termination = ui.termination || 'open';

    const S_end_m2 = S_end * 1e-4;
    const L_eff = _effLength(L_mm, S_end_m2, termination, ui.port_l || 0);
    const f_res = _resonances(L_eff, termination, 3);
    const V_tl = _volumeTl(L_mm, S_start * 1e-4, S_end_m2, taper);

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px; padding: 10px 12px;
        width: 100%; box-sizing: border-box;
    `;

    for (let i = 0; i < 3; i++) {
        const freq = f_res[i] != null ? f_res[i] : null;
        const cell = document.createElement('div');
        cell.style.cssText = `
            display: flex; flex-direction: column; gap: 3px;
            padding: 6px 8px; text-align: center;
            background: rgba(200,184,154,0.03);
            border: 1px solid rgba(200,184,154,0.08);
            border-radius: 5px; min-width: 0;
            box-sizing: border-box;
        `;

        const l = document.createElement('div');
        l.textContent = `f${2*i+1}`;
        l.style.cssText = `
            font-size: 9px; color: var(--text-muted, rgba(200,184,154,0.55));
            text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600;
        `;
        cell.appendChild(l);

        const f = document.createElement('div');
        f.textContent = freq != null ? `${Math.round(freq)} Hz` : '—';
        f.style.cssText = `
            font-size: 13px; font-weight: 700;
            font-family: 'Courier New', monospace;
            color: var(--text-primary, #e0d8cc);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        `;
        cell.appendChild(f);

        grid.appendChild(cell);
    }
    section.body.appendChild(grid);

    const vRow = document.createElement('div');
    vRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 4px 12px 10px;
        font-size: 11px;
        color: var(--text-muted, rgba(200,184,154,0.6));
        width: 100%; box-sizing: border-box;
    `;
    const vLbl = document.createElement('span');
    vLbl.textContent = 'V_tl (объём линии):';
    vLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    vRow.appendChild(vLbl);
    const vVal = document.createElement('span');
    vVal.textContent = `${(V_tl * 1000).toFixed(2)} L`;
    vVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    vRow.appendChild(vVal);
    section.body.appendChild(vRow);

    const inRange = f_res.filter(f => f > 20 && f < 500);
    if (inRange.length > 2) {
        const warn = document.createElement('div');
        warn.textContent = `⚠ Много резонансов в 20..500 Гц (${inRange.length}) — возможны пики/провалы`;
        warn.style.cssText = `
            padding: 6px 12px 8px;
            font-size: 10px;
            color: rgba(255,170,51,0.9);
            background: rgba(255,170,51,0.06);
            border-top: 1px solid rgba(255,170,51,0.15);
            width: 100%; box-sizing: border-box;
        `;
        section.body.appendChild(warn);
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

    row.appendChild(_buildStepper(ui, {
        id: 'n_segments', label: 'Сегментов', min: 10, max: 200,
        hint: 'Число сегментов для численного расчёта (10..200)'
    }, onChange));

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'd_port', label: 'До динам.', unit: 'м',
        step: 0.01, min: 0, max: 5,
        hint: 'Расстояние от динамика до порта'
    }, onChange));

    section.body.appendChild(row);
    return section.el;
}

function _buildStepper(ui, f, onChange) {
    const v = Math.max(f.min, Math.min(f.max, Number(ui[f.id]) || f.min));

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

    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';

    const mkBtn = (txt, sign) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.style.cssText = `
            width: 26px; height: 26px; padding: 0;
            display:inline-flex;align-items:center;justify-content:center;
            border:1px solid var(--border-color,rgba(200,184,154,0.2));
            background:var(--bg-hover,rgba(40,40,40,0.5));
            color:var(--text-primary,#e0d8cc);
            border-radius:5px;cursor:pointer;
            font-size:14px;font-weight:700;line-height:1;
            transition:background 0.15s ease, border-color 0.15s ease;
            flex-shrink: 0; box-sizing: border-box;
        `;
        b.addEventListener('mouseenter', () => {
            b.style.background = 'var(--bg-active,rgba(60,60,60,0.8))';
            b.style.borderColor = 'var(--beige-dark, #a89070)';
        });
        b.addEventListener('mouseleave', () => {
            b.style.background = 'var(--bg-hover,rgba(40,40,40,0.5))';
            b.style.borderColor = 'var(--border-color,rgba(200,184,154,0.2))';
        });
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nv = Math.max(f.min, Math.min(f.max, v + sign));
            if (nv === v) return;
            const next = JSON.parse(JSON.stringify(ui));
            next[f.id] = nv;
            next._user = { ...(next._user || {}), [f.id]: true };
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        return b;
    };

    ctrl.appendChild(mkBtn('−', -1));

    const val = document.createElement('div');
    val.textContent = String(v);
    val.style.cssText = `
        min-width: 40px; text-align: center;
        font-size: 13px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: var(--text-primary, #e0d8cc);
        padding: 4px 8px;
        background: var(--bg-input, #2a2a2a);
        border-radius: 5px;
        border: 1px solid var(--border-color, rgba(200,184,154,0.1));
        flex-shrink: 0;
        box-sizing: border-box;
    `;
    ctrl.appendChild(val);

    ctrl.appendChild(mkBtn('+', 1));
    row.appendChild(ctrl);

    return row;
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
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;width:24px;flex-shrink:0;';
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

    row.appendChild(mkBtn('Опт. тапер', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(ui));
        if (Number(next.s_start) > 0) {
            next.s_end = Math.round(Number(next.s_start) * 0.3);
            next._user.s_end = true;
        }
        next._lastEdited = 's_end';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }));

    row.appendChild(mkBtn('Опт. позиция', 'icon-align', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next.x_driver = 0.2;
        next._user.x_driver = true;
        next._lastEdited = 'x_driver';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }, 'primary'));

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        const fresh = JSON.parse(JSON.stringify(TWQP_UI_DEFAULT));
        fresh._sections = ui._sections;
        onChange(fresh);
    }, 'danger'));

    return row;
}

function _buildProfileSVG(ui) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 140');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '140');
    svg.style.cssText = 'display:block;';

    const L_mm = Number(ui.length) || 0;
    const S_start_cm2 = Number(ui.s_start) || 0;
    const S_end_cm2 = Number(ui.s_end) || 0;
    const taper = ui.taper || 'linear';
    const x_driver = Math.max(0, Math.min(1, Number(ui.x_driver) || 0));

    if (!(L_mm > 0) || !(S_start_cm2 > 0) || !(S_end_cm2 > 0)) {
        return svg;
    }

    const S_start_m2 = S_start_cm2 * 1e-4;
    const S_end_m2 = S_end_cm2 * 1e-4;

    const PAD_L = 40, PAD_R = 20, PAD_T = 20, PAD_B = 30;
    const W = 400 - PAD_L - PAD_R;
    const H = 140 - PAD_T - PAD_B;

    const S_max = Math.max(S_start_m2, S_end_m2) * 1.1;
    const S_min = 0;

    const colorLine = 'var(--accent-red, #cc2233)';
    const colorFill = 'rgba(204,34,51,0.12)';
    const colorAxis = 'var(--border-color, rgba(200,184,154,0.25))';
    const colorText = 'var(--text-muted, rgba(200,184,154,0.6))';
    const colorDriver = 'rgba(68,204,136,0.95)';

    const xToPx = (x) => PAD_L + x * W;
    const SToPy = (S) => PAD_T + H - ((S - S_min) / (S_max - S_min)) * H;

    const axisX = document.createElementNS(NS, 'line');
    axisX.setAttribute('x1', PAD_L);
    axisX.setAttribute('y1', PAD_T + H);
    axisX.setAttribute('x2', PAD_L + W);
    axisX.setAttribute('y2', PAD_T + H);
    axisX.setAttribute('stroke', colorAxis);
    axisX.setAttribute('stroke-width', '1');
    svg.appendChild(axisX);

    const axisY = document.createElementNS(NS, 'line');
    axisY.setAttribute('x1', PAD_L);
    axisY.setAttribute('y1', PAD_T);
    axisY.setAttribute('x2', PAD_L);
    axisY.setAttribute('y2', PAD_T + H);
    axisY.setAttribute('stroke', colorAxis);
    axisY.setAttribute('stroke-width', '1');
    svg.appendChild(axisY);

    const N = 60;
    let pathD = `M ${xToPx(0)} ${PAD_T + H}`;
    const points = [];
    for (let i = 0; i <= N; i++) {
        const x = i / N;
        const S = _profileS(x, S_start_m2, S_end_m2, taper);
        const px = xToPx(x);
        const py = SToPy(S);
        pathD += ` L ${px} ${py}`;
        points.push({ x: px, y: py });
    }
    pathD += ` L ${xToPx(1)} ${PAD_T + H} Z`;

    const fill = document.createElementNS(NS, 'path');
    fill.setAttribute('d', pathD);
    fill.setAttribute('fill', colorFill);
    fill.setAttribute('stroke', 'none');
    svg.appendChild(fill);

    let lineD = '';
    for (let i = 0; i < points.length; i++) {
        lineD += (i === 0 ? 'M' : 'L') + ` ${points[i].x} ${points[i].y} `;
    }
    const curve = document.createElementNS(NS, 'path');
    curve.setAttribute('d', lineD);
    curve.setAttribute('fill', 'none');
    curve.setAttribute('stroke', colorLine);
    curve.setAttribute('stroke-width', '2');
    svg.appendChild(curve);

    const xdPx = xToPx(x_driver);
    const Sd = _profileS(x_driver, S_start_m2, S_end_m2, taper);
    const ydPx = SToPy(Sd);

    const vline = document.createElementNS(NS, 'line');
    vline.setAttribute('x1', xdPx);
    vline.setAttribute('y1', PAD_T);
    vline.setAttribute('x2', xdPx);
    vline.setAttribute('y2', PAD_T + H);
    vline.setAttribute('stroke', colorDriver);
    vline.setAttribute('stroke-width', '1');
    vline.setAttribute('stroke-dasharray', '3,3');
    vline.setAttribute('opacity', '0.6');
    svg.appendChild(vline);

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', xdPx);
    dot.setAttribute('cy', ydPx);
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', colorDriver);
    dot.setAttribute('stroke', 'var(--bg-card, #1f1f1f)');
    dot.setAttribute('stroke-width', '1.5');
    svg.appendChild(dot);

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

    svg.appendChild(mkText(PAD_L, 12, `S₀ ${Math.round(S_start_cm2)} см²`, 'start'));
    svg.appendChild(mkText(PAD_L + W, 12, `S₁ ${Math.round(S_end_cm2)} см²`, 'end'));
    svg.appendChild(mkText(PAD_L + W / 2, 140 - 8, `L ${L_mm} мм`, 'middle'));
    svg.appendChild(mkText(xdPx, ydPx - 10, `${Math.round(x_driver * L_mm)} мм`, 'middle'));

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
        section.dataset.twqpSection = opts.sectionKey;
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
        body.dataset.twqpSectionBody = '1';
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

function _updateTwqpCard(el, value) {
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
        console.warn('[twqp] _updateTwqpCard: no onChange found');
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

    const sectionsState = { ...(value._sections || TWQP_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-twqp-section]');
        for (const s of sections) {
            const secKey = s.dataset.twqpSection;
            const body = s.querySelector('[data-twqp-section-body]');
            if (body && secKey) {
                sectionsState[secKey] = (body.style.display === 'none');
            }
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderTwqpCard(value, onChange, { host: { ui: uiApi } }, null);

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