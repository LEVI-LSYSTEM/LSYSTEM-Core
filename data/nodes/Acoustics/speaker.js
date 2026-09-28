// data/nodes/Acoustics/speaker.js
// v15.1 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ ДИНАМИКА (sealed + bandpass)
//
// Изменения v15.1:
//   - В sealed-режиме radiatingPorts[0].emit.delay_m = 0 (явно).
//   - В bandpass-режиме — auto-detect по подключению front.
//
// Архитектура (sealed):
//   d --Ma--> m0 --Ra--> m1 --Ca--> m2(=rear)
//   radiatingPorts: front через Ca (m1→m2)
//
// Архитектура (bandpass):
//   d --Ma--> m0 --Ra--> m1 --Ca--> m_split
//                                     |
//                                     +---> m_rear(=rear)
//                                     +---> m_front(=front)
//   radiatingPorts: пусто (излучают порты камер)

'use strict';

const DRIVER_UI_DEFAULT = {
    fs: 45, qts: 0.40, qes: 0.45, qms: 4.0, vas: 34,
    re: 6.4, le: 0.5, bl: null,
    sd: 220, xmax: 5,
    mms: null, cms: null, rms: null,
    spl: 88,

    connection: {
        type: 'single',
        count: 1,
        config: { series: 2, parallel: 2 },
        isobaricType: 'series',
        isobaricCount: 1
    },

    _user: {
        fs: true, qts: true, qes: true, qms: true,
        vas: true, re: true, le: true,
        sd: true, xmax: true, spl: true
    },
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: { ts: false, connection: false }
};

const REQUIRED = ['fs', 'qts', 'vas', 're', 'sd'];

const FIELD_HINTS = {
    fs:   'Fs — резонансная частота в свободном поле (обязательное)',
    qts:  'Qts — полная добротность (обязательное)',
    qes:  'Qes — электрическая добротность',
    qms:  'Qms — механическая добротность',
    vas:  'Vas — эквивалентный объём воздуха (обязательное)',
    re:   'Re — сопротивление постоянному току (обязательное)',
    le:   'Le — индуктивность катушки',
    bl:   'BL — силовой фактор',
    sd:   'Sd — эффективная площадь диффузора (обязательное)',
    mms:  'Mms — масса подвижной системы',
    cms:  'Cms — гибкость подвеса',
    rms:  'Rms — механическое сопротивление',
    xmax: 'Xmax — максимальное линейное смещение',
    spl:  'SPL — уровень звукового давления'
};

function _calcAll(ui, rho0 = 1.2041, c0 = 343.0) {
    const out = JSON.parse(JSON.stringify(ui));
    const _calc = {};
    const _user = { ...(out._user || {}) };

    if (out.vas > 0 && out.sd > 0 && !_user.cms) {
        const Vas = out.vas / 1000;
        const Sd = out.sd * 1e-4;
        out.cms = Vas / (rho0 * c0 * c0 * Sd * Sd);
        _calc.cms = true;
        delete _user.cms;
    }

    if (out.fs > 0 && out.cms > 0 && !_user.mms) {
        out.mms = 1 / (Math.pow(2 * Math.PI * out.fs, 2) * out.cms);
        _calc.mms = true;
        delete _user.mms;
    }

    if (out.qms > 0 && out.mms > 0 && out.cms > 0 && !_user.rms) {
        out.rms = Math.sqrt(out.mms / out.cms) / out.qms;
        _calc.rms = true;
        delete _user.rms;
    }

    if (out.re > 0 && out.mms > 0 && out.cms > 0 && out.qes > 0 && !_user.bl) {
        out.bl = Math.sqrt(out.re * Math.sqrt(out.mms / out.cms) / out.qes);
        _calc.bl = true;
        delete _user.bl;
    }

    if (out.qts > 0 && out.qms > 0 && !_user.qes) {
        const qes = (out.qts * out.qms) / (out.qms - out.qts);
        if (qes > 0 && isFinite(qes)) { out.qes = qes; _calc.qes = true; delete _user.qes; }
    }

    if (out.qts > 0 && out.qes > 0 && !_user.qms) {
        const qms = (out.qts * out.qes) / (out.qes - out.qts);
        if (qms > 0 && isFinite(qms)) { out.qms = qms; _calc.qms = true; delete _user.qms; }
    }

    out._calc = _calc;
    out._user = _user;
    return out;
}

function _calcConnection(conn, re, spl, sd, mms, cms, bl, rms) {
    const type = conn.type || 'single';
    const count = Math.max(1, Math.floor(conn.count || 1));
    const cfg = conn.config || { series: 2, parallel: 2 };
    const isoType = conn.isobaricType || 'series';
    const isoCount = Math.max(1, Math.floor(conn.isobaricCount || 1));

    let totalRe = re, totalCount = 1, totalSpl = spl;
    let totalSd = sd, totalMms = mms, totalCms = cms, totalBL = bl, totalRms = rms;

    switch (type) {
        case 'single':
            totalCount = count;
            totalRe = re;
            totalSpl = spl + 10 * Math.log10(count);
            totalSd = sd * count;
            totalMms = mms * count;
            totalCms = cms / count;
            totalBL = bl * count;
            totalRms = rms * count;
            break;
        case 'series':
            totalCount = count;
            totalRe = re * count;
            totalSpl = spl + 10 * Math.log10(count);
            totalSd = sd * count;
            totalMms = mms * count;
            totalCms = cms / count;
            totalBL = bl * count;
            totalRms = rms * count;
            break;
        case 'parallel':
            totalCount = count;
            totalRe = re / count;
            totalSpl = spl + 10 * Math.log10(count);
            totalSd = sd * count;
            totalMms = mms / count;
            totalCms = cms * count;
            totalBL = bl;
            totalRms = rms / count;
            break;
        case 'series_parallel': {
            const s = Math.max(1, cfg.series || 2);
            const p = Math.max(1, cfg.parallel || 2);
            totalCount = s * p;
            totalRe = (re * s) / p;
            totalSpl = spl + 10 * Math.log10(p);
            totalSd = sd * totalCount;
            totalMms = mms * s / p;
            totalCms = cms * p / s;
            totalBL = bl * s;
            totalRms = rms * s / p;
            break;
        }
        case 'isobaric': {
            const pairRe = isoType === 'series' ? re * 2 : re / 2;
            totalCount = isoCount * 2;
            totalRe = pairRe / isoCount;
            totalSpl = spl + 10 * Math.log10(isoCount);
            totalSd = sd * isoCount;
            totalMms = mms * 2;
            totalCms = cms / 2;
            totalBL = bl;
            totalRms = rms * 2;
            break;
        }
    }

    return { type, totalRe, totalCount, totalSpl, totalSd, totalMms, totalCms, totalBL, totalRms,
             config: cfg, isobaricType: isoType, isobaricCount: isoCount };
}

/**
 * АВТО-ОПРЕДЕЛЕНИЕ РЕЖИМА.
 * Возвращает true, если динамик находится в двухпортовом (bandpass) включении:
 *   - снаружи подключён порт 'front' (к нему идёт соединение в графе), И
 *   - это соединение ведёт к фрагменту, отличному от 'LEMsolver'.
 */
function _detectBandpass(ctx, selfNodeId) {
    if (!ctx || !ctx.graph || !selfNodeId) return false;
    const g = ctx.graph;
    if (!g.connections) return false;

    for (const conn of g.connections) {
        if (String(conn.fromNodeId) !== String(selfNodeId)) continue;
        if (conn.fromPortId !== 'front') continue;

        const target = g.getNode ? g.getNode(conn.toNodeId) : null;
        if (!target || !target.def) return true;

        const file = target.def.file || '';
        if (file === 'LEMsolver.js') return false;
        if (file === 'box.js') return true;
        if (file === 'wall.js') return true;
        if (file === 'twqp.js') return true;
        if (file === 'horn.js') return true;
        return true;
    }
    return false;
}

module.exports = {
    meta: { id: 'Acoustics.speaker', label: 'Speaker', icon: 'icon-speaker' },

    ports: {
        inputs: [],
        outputs: [
            { id: 'rear',  label: 'Rear'  },
            { id: 'front', label: 'Front' }
        ]
    },

    inputRules:  {},
    outputRules: {
        rear:  ['box.js', 'wall.js', 'LEMsolver.js', 'twqp.js', 'horn.js'],
        front: ['box.js', 'LEMsolver.js', 'twqp.js', 'horn.js']
    },

    maxInputs:  {},
    maxOutputs: { rear: 1, front: 1 },

    params: [{
        id: 'driver_ui',
        type: 'driver_ui',
        label: 'Драйвер',
        default: DRIVER_UI_DEFAULT,
        category: 'Драйвер',
        _noCategoryHeader: true
    }],

    onParamChange(id, value, node) {
        if (id !== 'driver_ui' || !node) return;
        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(DRIVER_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...DRIVER_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;
        node.paramValues.driver_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'driver_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.driver_ui && typeof p.driver_ui === 'object') ? p.driver_ui : DRIVER_UI_DEFAULT;

        for (const key of REQUIRED) {
            const v = ui[key];
            if (v == null || v === '' || !(Number(v) > 0)) {
                throw new Error(`Speaker: ${key.toUpperCase()} > 0 (required)`);
            }
        }

        const fs   = Number(ui.fs);
        const qes  = Number(ui.qes) > 0 ? Number(ui.qes) : null;
        const qms  = Number(ui.qms) > 0 ? Number(ui.qms) : null;
        const qts  = Number(ui.qts);
        const vasL = Number(ui.vas);
        const Re25 = Number(ui.re);
        const Le   = Number(ui.le) * 1e-3;
        const Sd   = Number(ui.sd) * 1e-4;
        const xmax = Number(ui.xmax);
        const spl  = Number(ui.spl) || 88;

        if (!(fs > 0))   throw new Error('Speaker: Fs > 0');
        if (!(qts > 0))  throw new Error('Speaker: Qts > 0');
        if (!(vasL > 0)) throw new Error('Speaker: Vas > 0');
        if (!(Re25 > 0)) throw new Error('Speaker: Re > 0');
        if (!(Sd > 0))   throw new Error('Speaker: Sd > 0');
        if (!(xmax > 0)) throw new Error('Speaker: Xmax > 0');

        let T_C = 25;
        try {
            const lemNodes = (ctx.graph.nodes || []).filter(n => n.def && n.def.file === 'LEMsolver.js');
            if (lemNodes.length > 0) {
                const t = Number(lemNodes[0].paramValues?.temperature);
                if (Number.isFinite(t)) T_C = t;
            }
        } catch (e) {}

        const Re = Re25 * (1 + 0.00393 * (T_C - 25));
        const rho0 = 1.2041, c0 = 343.0;

        let qesEff = qes, qmsEff = qms;
        if (!qesEff && qts && qmsEff) qesEff = (qts * qmsEff) / (qmsEff - qts);
        if (!qmsEff && qts && qesEff) qmsEff = (qts * qesEff) / (qesEff - qts);
        if (!qesEff || !qmsEff || !isFinite(qesEff) || !isFinite(qmsEff)) {
            throw new Error('Speaker: cannot resolve Qes/Qms');
        }

        const Vas_single = vasL / 1000;
        const Cms_single = Vas_single / (rho0 * c0 * c0 * Sd * Sd);
        const Mms_single = 1 / (Math.pow(2 * Math.PI * fs, 2) * Cms_single);
        const Rms_single = Math.sqrt(Mms_single / Cms_single) / qmsEff;
        const BL_single  = Math.sqrt(Re * Math.sqrt(Mms_single / Cms_single) / qesEff);

        const conn = ui.connection || DRIVER_UI_DEFAULT.connection;
        const connCalc = _calcConnection(
            conn, Re, spl, Sd, Mms_single, Cms_single, BL_single, Rms_single
        );

        const Sd_total   = connCalc.totalSd;
        const Mms_total  = connCalc.totalMms;
        const Cms_total  = connCalc.totalCms;
        const BL_total   = connCalc.totalBL;
        const Rms_total  = connCalc.totalRms;
        const Re_total   = connCalc.totalRe;

        const Sd2 = Sd_total * Sd_total;
        const Ma = Mms_total / Sd2;
        const Ra = Rms_total / Sd2;
        const Ca = Cms_total * Sd2;

        const a_eq = Math.sqrt(Sd_total / Math.PI);
        const M_air = rho0 * (8 / 3) * a_eq * a_eq * a_eq;
        const Ma_air = M_air / Sd2;
        const Ma_total = Ma;

        const G_gyr = Sd_total / BL_total;

        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;

        const R_Le_ref = 0.05 * Re_total;

        const rho_c_Sd = rho0 * c0 * Sd_total;
        const k_ref = w_ref / c0;
        const ka_ref = k_ref * a_eq;
        const ka2_ref = ka_ref * ka_ref;
        const R_rad_mech_ref = rho_c_Sd * ka2_ref / (1 + ka2_ref);
        const R_rad_ref = R_rad_mech_ref / (Sd_total * Sd_total);

        // ═══════════════════════════════════════════════════════════
        // АВТО-РЕЖИМ
        // ═══════════════════════════════════════════════════════════
        const driverMode = _detectBandpass(ctx, ctx.node && ctx.node.id) ? 'bandpass' : 'sealed';

        const Ma_air_side = Ma_air;

        let nodes, components, ports, mergedPorts, radiatingPorts;

        if (driverMode === 'bandpass') {
            // ─────────── BANDPASS: двухпортовая модель ───────────
            nodes = [
                'in', 'e1', 'e1a', 'e2', 'd', 'm0', 'm1', 'm_split',
                'm_rear', 'm_front', 'rear', 'front', 'gnd'
            ];

            components = [
                { id: 'Re',    type: 'R', from: 'in',  to: 'e1',  value: Re_total },
                { id: 'Le',    type: 'L', from: 'e1',  to: 'e1a', value: Le },
                { id: 'R_Le',  type: 'R', from: 'e1a', to: 'e2',  value: R_Le_ref },

                { id: 'GYR', type: 'GYRATOR',
                  from: 'e2', to: 'gnd',
                  from2: 'd', to2: 'gnd',
                  value: G_gyr },

                { id: 'Ma', type: 'L', from: 'd',  to: 'm0', value: Ma_total },
                { id: 'Ra', type: 'R', from: 'm0', to: 'm1', value: Ra },

                { id: 'Ca', type: 'C', from: 'm1', to: 'm_split', value: Ca }
            ];

            ports = {
                in: 'in',
                gnd: 'gnd',
                rear: 'm_rear',
                front: 'm_front'
            };

            mergedPorts = [
                { a: 'm_split', b: 'm_rear' },
                { a: 'm_split', b: 'm_front' }
            ];

            radiatingPorts = [];

        } else {
            // ─────────── SEALED: односторонняя модель ───────────
            nodes = [
                'in', 'e1', 'e1a', 'e2', 'd', 'm0', 'm1', 'm2', 'rear', 'front', 'gnd'
            ];

            components = [
                { id: 'Re',    type: 'R', from: 'in',  to: 'e1',  value: Re_total },
                { id: 'Le',    type: 'L', from: 'e1',  to: 'e1a', value: Le },
                { id: 'R_Le',  type: 'R', from: 'e1a', to: 'e2',  value: R_Le_ref },

                { id: 'GYR', type: 'GYRATOR',
                  from: 'e2', to: 'gnd',
                  from2: 'd', to2: 'gnd',
                  value: G_gyr },

                { id: 'Ma', type: 'L', from: 'd',  to: 'm0', value: Ma_total },
                { id: 'Ra', type: 'R', from: 'm0', to: 'm1', value: Ra },
                { id: 'Ca', type: 'C', from: 'm1', to: 'm2', value: Ca }
            ];

            ports = {
                in: 'in',
                gnd: 'gnd',
                rear: 'm2',
                front: 'front'
            };

            mergedPorts = [
                { a: 'm2', b: 'rear' }
            ];

            radiatingPorts = [
                {
                    port: 'front',
                    emit: {
                        kind: 'current_through',
                        from: 'm1',
                        to: 'm2',
                        sign: +1,
                        delay_m: 0,
                        admittance: { type: 'C', value: Ca }
                    }
                }
            ];
        }

        return {
            kind: 'lem.fragment',
            source: 'speaker',
            nodes,
            components,
            ports,
            mergedPorts,
            radiatingPorts,
            meta: {
                label: `Speaker ${fs} Hz${driverMode === 'bandpass' ? ' · BP' : ''}`,
                fs, qes: qesEff, qms: qmsEff, qts, vasL,
                Re25, Re: Re_total, Re_single: Re, T_C,
                Le, R_Le_ref, Le_RLe_series: true, BL: BL_total,
                Sd_m2: Sd_total, Mms: Mms_total, Rms: Rms_total, Cms: Cms_total,
                xmax_mm: xmax,
                n_drivers: connCalc.totalCount,
                connection: conn,
                G_gyr, Ma, Ma_air, Ma_total, Ra, Ca,
                R_rad_ref, R_rad_mech_ref, ka2_ref, a_eq,
                f_ref,
                mode: driverMode,
                Ma_air_side: driverMode === 'bandpass' ? Ma_air_side : null,
                acoustic_anchor: driverMode === 'bandpass' ? 'm_split' : 'm2'
            },
            normalization: {
                spl_ref_dB: connCalc.totalSpl,
                p_ref: 20e-6,
                distance: 1.0
            }
        };
    },

    checkCompute(ctx) {
        const ui = (ctx.params && ctx.params.driver_ui) || {};
        for (const key of REQUIRED) {
            if (!(Number(ui[key]) > 0)) {
                return { ready: false, reason: `Speaker: ${key.toUpperCase()} > 0` };
            }
        }
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'driver_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderDriverCard(value, onChange, ctx, node);
                },
                update(el, value) { _updateDriverCard(el, value); },
                destroy(el) {
                    if (el && el.__cleanup) { try { el.__cleanup(); } catch (e) {} }
                }
            }
        };
    }
};

// ============================================================
// UI
// ============================================================

function _renderDriverCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(DRIVER_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...DRIVER_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'speaker-driver-ui';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;box-sizing:border-box;';

    wrap.__onChange = onChange;
    wrap.__uiApi = uiApi;
    wrap.__lastFocusedField = null;

    wrap.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.fieldId) wrap.__lastFocusedField = t.dataset.fieldId;
    });

    const toggleSectionLocal = (key, collapsed) => {
        if (!ui._sections) ui._sections = {};
        ui._sections[key] = collapsed;
        if (node && node.paramValues && node.paramValues.driver_ui) {
            if (!node.paramValues.driver_ui._sections) node.paramValues.driver_ui._sections = {};
            node.paramValues.driver_ui._sections[key] = collapsed;
        }
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildTSSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildConnectionSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildActions(ui, onChange, uiApi));

    return wrap;
}

function _buildInfoBar(ui, uiApi) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(204,34,51,0.14) 0%,rgba(204,34,51,0.02) 100%);border-left:3px solid var(--accent-red,#cc2233);border-radius:0 8px 8px 0;width:100%;min-width:0;box-sizing:border-box;';

    const icon = _makeIcon(uiApi, 'icon-speaker', 20);
    icon.style.cssText += 'color:var(--accent-red,#cc2233);flex-shrink:0;';
    bar.appendChild(icon);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

    const line1 = document.createElement('div');
    line1.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary,#e0d8cc);letter-spacing:0.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
    const fsLabel = ui.fs ? `${ui.fs} Hz` : '— Hz';
    const qtsLabel = ui.qts ? ` · Qts ${ui.qts}` : '';
    const vasLabel = ui.vas ? ` · Vas ${ui.vas} L` : '';
    line1.textContent = `Speaker ${fsLabel}${qtsLabel}${vasLabel}`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = "font-size:10px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:'Courier New',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
    const connType = ui.connection ? ui.connection.type : 'single';
    const connNames = { single: 'одиночный', series: 'послед.', parallel: 'паралл.', series_parallel: 'смешанный', isobaric: 'изобарик' };
    const connCount = ui.connection
        ? (ui.connection.type === 'isobaric'
            ? (ui.connection.isobaricCount || 1) * 2
            : (ui.connection.type === 'series_parallel'
                ? (ui.connection.config?.series || 2) * (ui.connection.config?.parallel || 2)
                : (ui.connection.count || 1)))
        : 1;
    const countStr = connCount > 1 ? ` · ${connCount} шт` : '';
    line2.textContent = `${connNames[connType] || connType}${countStr}`;
    info.appendChild(line2);

    bar.appendChild(info);

    const missing = REQUIRED.filter(k => !ui[k] || Number(ui[k]) <= 0);
    const statusEl = document.createElement('div');
    if (missing.length > 0) {
        statusEl.textContent = `⚠ ${missing.length} обяз.`;
        statusEl.style.cssText = 'font-size:10px;font-weight:700;padding:4px 10px;border-radius:12px;background:rgba(200,184,154,0.15);color:var(--beige,#c8b89a);border:1px solid rgba(200,184,154,0.5);white-space:nowrap;flex-shrink:0;';
        statusEl.title = 'Обязательные: ' + missing.map(k => k.toUpperCase()).join(', ');
    } else {
        statusEl.textContent = '✓ Готов';
        statusEl.style.cssText = 'font-size:10px;font-weight:700;padding:4px 10px;border-radius:12px;background:rgba(68,204,136,0.12);color:rgba(68,204,136,0.95);border:1px solid rgba(68,204,136,0.35);white-space:nowrap;flex-shrink:0;';
    }
    bar.appendChild(statusEl);

    return bar;
}

function _buildTSSection(ui, onChange, uiApi, toggleSection) {
    const key = 'ts';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('T/S Параметры', 'icon-equalizer', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-left:auto;font-size:9px;font-weight:500;color:var(--beige,#c8b89a);letter-spacing:0.3px;text-transform:none;';
    hint.textContent = '* — обязательные';
    section.head.appendChild(hint);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;';

    const LEFT_FIELDS = [
        { id: 'fs',   label: 'Fs',   unit: 'Hz',   step: 0.1,  required: true },
        { id: 'qts',  label: 'Qts',  unit: '',     step: 0.01, required: true },
        { id: 'vas',  label: 'Vas',  unit: 'L',    step: 0.1,  required: true },
        { id: 're',   label: 'Re',   unit: 'Ω',    step: 0.1,  required: true },
        { id: 'sd',   label: 'Sd',   unit: 'cm²',  step: 1,    required: true },
        { id: 'le',   label: 'Le',   unit: 'mH',   step: 0.01 },
        { id: 'xmax', label: 'Xmax', unit: 'mm',   step: 0.1 }
    ];
    const RIGHT_FIELDS = [
        { id: 'qes',  label: 'Qes',  unit: '',     step: 0.01 },
        { id: 'qms',  label: 'Qms',  unit: '',     step: 0.1 },
        { id: 'bl',   label: 'BL',   unit: 'T·m',  step: 0.1 },
        { id: 'mms',  label: 'Mms',  unit: 'g',    step: 0.1 },
        { id: 'cms',  label: 'Cms',  unit: 'mm/N', step: 0.01 },
        { id: 'rms',  label: 'Rms',  unit: 'kg/s', step: 0.01 },
        { id: 'spl',  label: 'SPL',  unit: 'dB',   step: 0.1 }
    ];

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'border-right:1px solid rgba(200,184,154,0.06);min-width:0;';
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'min-width:0;';

    for (const f of LEFT_FIELDS) leftCol.appendChild(_buildField(ui, f, onChange, uiApi));
    for (const f of RIGHT_FIELDS) rightCol.appendChild(_buildField(ui, f, onChange, uiApi));

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    section.body.appendChild(grid);

    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:14px;padding:8px 12px;border-top:1px solid rgba(200,184,154,0.06);background:rgba(200,184,154,0.02);font-size:9px;color:var(--text-muted,rgba(200,184,154,0.55));flex-wrap:wrap;width:100%;box-sizing:border-box;';
    const mkLegend = (color, label, border) => {
        const el = document.createElement('span');
        el.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
        const dot = document.createElement('span');
        dot.style.cssText = border
            ? `width:10px;height:10px;border-radius:3px;border:1px solid ${color};background:transparent;box-sizing:border-box;`
            : `width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 5px ${color};`;
        el.appendChild(dot);
        el.appendChild(document.createTextNode(label));
        return el;
    };
    legend.appendChild(mkLegend('rgba(204,34,51,0.9)', 'введено'));
    legend.appendChild(mkLegend('rgba(68,204,136,0.9)', 'рассчитано'));
    legend.appendChild(mkLegend('rgba(200,184,154,0.9)', 'обязательное *', true));
    section.body.appendChild(legend);

    return section.el;
}

function _buildField(ui, f, onChange, uiApi) {
    const v = ui[f.id];
    const isUser = !!(ui._user && ui._user[f.id]);
    const isCalc = !!(ui._calc && ui._calc[f.id]);
    const isEmpty = (v == null || v === '' || (typeof v === 'number' && !isFinite(v)));
    const isRequired = !!f.required;
    const isMissing = isRequired && isEmpty;

    let borderColor, bgColor, dotBg, dotBorder;
    if (isRequired && isMissing) {
        borderColor = 'rgba(200,184,154,0.85)'; bgColor = 'rgba(200,184,154,0.08)';
        dotBg = 'rgba(200,184,154,0.35)'; dotBorder = 'rgba(200,184,154,0.9)';
    } else if (isUser) {
        borderColor = 'rgba(204,34,51,0.45)'; bgColor = 'rgba(204,34,51,0.05)';
        dotBg = 'rgba(204,34,51,0.9)'; dotBorder = 'transparent';
    } else if (isCalc) {
        borderColor = 'rgba(68,204,136,0.45)'; bgColor = 'rgba(68,204,136,0.05)';
        dotBg = 'rgba(68,204,136,0.9)'; dotBorder = 'transparent';
    } else {
        borderColor = 'var(--border-color,rgba(200,184,154,0.10))'; bgColor = 'transparent';
        dotBg = 'transparent'; dotBorder = 'rgba(200,184,154,0.3)';
    }

    const row = document.createElement('div');
    row.dataset.fieldId = f.id;
    row.style.cssText = 'display:grid;grid-template-columns:46px minmax(0,1fr) 42px 14px;align-items:center;gap:6px;padding:5px 10px;transition:background 0.15s ease;box-sizing:border-box;';
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(200,184,154,0.03)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

    const lab = document.createElement('div');
    lab.textContent = f.label;
    if (isRequired) {
        const star = document.createElement('span');
        star.textContent = ' *';
        star.style.cssText = 'color:var(--beige,#c8b89a);font-weight:700;';
        lab.appendChild(star);
    }
    lab.title = FIELD_HINTS[f.id] || '';
    lab.style.cssText = `font-size:10px;font-weight:600;letter-spacing:0.3px;color:${isRequired ? 'var(--beige,#c8b89a)' : 'var(--text-secondary,#a09888)'};text-align:right;white-space:nowrap;user-select:none;cursor:help;`;
    row.appendChild(lab);

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    inp.value = isEmpty ? '' : String(v);
    inp.placeholder = isRequired ? 'обязательное' : '—';
    inp.dataset.fieldId = f.id;
    inp.title = FIELD_HINTS[f.id] || '';
    inp.style.cssText = `width:100%;min-width:0;padding:4px 8px;font-size:11px;font-family:'Courier New',monospace;font-weight:600;background:${bgColor};color:var(--text-primary,#e0d8cc);border:1px solid ${borderColor};border-radius:4px;outline:none;box-sizing:border-box;transition:border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;`;
    inp.addEventListener('focus', () => {
        inp.style.borderColor = isRequired ? 'var(--beige,#c8b89a)' : 'var(--accent-red,#cc2233)';
        inp.style.boxShadow = isRequired ? '0 0 0 2px rgba(200,184,154,0.2)' : '0 0 0 2px rgba(204,34,51,0.18)';
        inp.style.background = 'var(--bg-input,#2a2a2a)';
    });
    inp.addEventListener('blur', () => { inp.style.boxShadow = 'none'; });
    inp.addEventListener('change', () => {
        const raw = inp.value.trim();
        const next = JSON.parse(JSON.stringify(ui));
        if (raw === '') {
            next[f.id] = null;
            if (next._user) delete next._user[f.id];
            if (next._calc) delete next._calc[f.id];
        } else {
            const num = Number(raw);
            if (!isFinite(num)) return;
            next[f.id] = num;
            next._user = { ...(next._user || {}), [f.id]: true };
            if (next._calc) delete next._calc[f.id];
        }
        next._lastEdited = f.id;
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    row.appendChild(inp);

    const unit = document.createElement('div');
    unit.textContent = f.unit || '';
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;white-space:nowrap;text-align:left;';
    row.appendChild(unit);

    const dot = document.createElement('div');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${dotBg};border:1px solid ${dotBorder};box-shadow:${dotBg !== 'transparent' ? `0 0 6px ${dotBg}` : 'none'};transition:all 0.2s ease;box-sizing:border-box;`;
    dot.title = isRequired ? (isMissing ? 'Обязательное (не задано)' : 'Обязательное') : (isUser ? 'Введено' : (isCalc ? 'Рассчитано' : 'Не задано'));
    row.appendChild(dot);

    return row;
}

function _buildConnectionSection(ui, onChange, uiApi, toggleSection) {
    const key = 'connection';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Подключение', 'icon-link', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const conn = ui.connection || DRIVER_UI_DEFAULT.connection;

    const typeBar = document.createElement('div');
    typeBar.style.cssText = 'display:flex;gap:4px;padding:8px 10px;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    const TYPES = [
        { id: 'single', label: 'Одиночный', icon: '🔊' },
        { id: 'series', label: 'Послед.', icon: '─' },
        { id: 'parallel', label: 'Паралл.', icon: '∥' },
        { id: 'series_parallel', label: 'Смеш.', icon: '⊞' },
        { id: 'isobaric', label: 'Изобарик', icon: '🔄' }
    ];

    for (const t of TYPES) {
        const isActive = conn.type === t.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t.icon + ' ' + t.label;
        btn.style.cssText = `padding:5px 10px;font-size:10px;font-weight:600;font-family:inherit;border-radius:5px;border:1px solid ${isActive ? 'var(--accent-red,#cc2233)' : 'var(--border-color,rgba(200,184,154,0.15))'};background:${isActive ? 'rgba(204,34,51,0.18)' : 'transparent'};color:${isActive ? 'var(--text-primary,#e0d8cc)' : 'var(--text-secondary,#a09888)'};cursor:pointer;transition:all 0.15s ease;white-space:nowrap;box-sizing:border-box;`;
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const next = JSON.parse(JSON.stringify(ui));
            next.connection = { ...next.connection, type: t.id };
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        typeBar.appendChild(btn);
    }
    section.body.appendChild(typeBar);

    const settingsWrap = document.createElement('div');
    settingsWrap.style.cssText = 'padding:10px 12px;width:100%;box-sizing:border-box;';
    settingsWrap.appendChild(_buildConnectionSettings(conn, ui, onChange));
    section.body.appendChild(settingsWrap);

    const re = Number(ui.re) || 6.4;
    const spl = Number(ui.spl) || 88;
    const sd = Number(ui.sd) * 1e-4 || 0.022;
    const fs = Number(ui.fs) || 45;
    const vas = Number(ui.vas) / 1000 || 0.034;
    const rho0 = 1.2041, c0 = 343.0;
    const Cms_single = vas / (rho0 * c0 * c0 * sd * sd);
    const Mms_single = 1 / (Math.pow(2 * Math.PI * fs, 2) * Cms_single);
    const BL_single = 9.97;
    const Rms_single = 1.78;
    const connCalc = _calcConnection(conn, re, spl, sd, Mms_single, Cms_single, BL_single, Rms_single);

    const summary = document.createElement('div');
    summary.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:10px 12px;background:rgba(200,184,154,0.04);border-top:1px solid rgba(200,184,154,0.06);width:100%;box-sizing:border-box;';
    summary.appendChild(_makeStat('Динамиков', connCalc.totalCount + ' шт'));
    summary.appendChild(_makeStat('Сопротивление', connCalc.totalRe.toFixed(2) + ' Ω'));
    summary.appendChild(_makeStat('Чувствительность', connCalc.totalSpl.toFixed(1) + ' dB'));
    summary.appendChild(_makeStat('Sd общая', (connCalc.totalSd * 1e4).toFixed(0) + ' cm²'));
    section.body.appendChild(summary);

    return section.el;
}

function _makeStat(label, value) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.55));text-transform:uppercase;letter-spacing:0.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const v = document.createElement('div');
    v.textContent = value;
    v.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary,#e0d8cc);font-family:"Courier New",monospace;letter-spacing:0.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    wrap.appendChild(l); wrap.appendChild(v);
    return wrap;
}

function _buildConnectionSettings(conn, ui, onChange) {
    const type = conn.type;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const applyChange = (patchFn) => {
        const next = JSON.parse(JSON.stringify(ui));
        patchFn(next.connection);
        next._version = (ui._version || 1) + 1;
        onChange(next);
    };

    const mkStepper = (label, value, min, max, patchKey) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
        const l = document.createElement('div');
        l.textContent = label;
        l.style.cssText = 'font-size:11px;color:var(--text-secondary,#a09888);font-weight:500;';
        row.appendChild(l);

        const ctrl = document.createElement('div');
        ctrl.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const mkBtn = (txt, sign) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = txt;
            b.style.cssText = 'width:26px;height:26px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-color,rgba(200,184,154,0.2));background:var(--bg-hover,rgba(40,40,40,0.5));color:var(--text-primary,#e0d8cc);border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1;box-sizing:border-box;';
            b.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const v = Math.max(min, Math.min(max, value + sign));
                if (v === value) return;
                applyChange((c) => patchKey(c, v));
            });
            return b;
        };

        ctrl.appendChild(mkBtn('−', -1));
        const val = document.createElement('div');
        val.textContent = String(value);
        val.style.cssText = 'min-width:36px;text-align:center;font-size:13px;font-weight:700;font-family:"Courier New",monospace;color:var(--text-primary,#e0d8cc);padding:4px 8px;background:var(--bg-input,#2a2a2a);border-radius:5px;border:1px solid var(--border-color,rgba(200,184,154,0.1));box-sizing:border-box;';
        ctrl.appendChild(val);
        ctrl.appendChild(mkBtn('+', 1));
        row.appendChild(ctrl);

        return row;
    };

    if (type === 'single' || type === 'series' || type === 'parallel') {
        wrap.appendChild(mkStepper('Количество динамиков', conn.count || 1, 1, 8, (c, v) => { c.count = v; }));
    } else if (type === 'series_parallel') {
        wrap.appendChild(mkStepper('Динамиков в ветке', conn.config?.series || 2, 1, 4, (c, v) => { if (!c.config) c.config = { series: 2, parallel: 2 }; c.config.series = v; }));
        wrap.appendChild(mkStepper('Количество веток', conn.config?.parallel || 2, 1, 4, (c, v) => { if (!c.config) c.config = { series: 2, parallel: 2 }; c.config.parallel = v; }));
    } else if (type === 'isobaric') {
        wrap.appendChild(mkStepper('Количество пар', conn.isobaricCount || 1, 1, 4, (c, v) => { c.isobaricCount = v; }));
    }

    return wrap;
}

function _buildActions(ui, onChange, uiApi) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;padding:4px 0 0;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    const mkBtn = (label, iconId, onClick, variant = 'default') => {
        const b = document.createElement('button');
        b.type = 'button';
        const isPrimary = variant === 'primary';
        const isDanger = variant === 'danger';
        b.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:11px;font-weight:600;font-family:inherit;letter-spacing:0.2px;border-radius:6px;cursor:pointer;transition:all 0.15s ease;border:1px solid ${isPrimary ? 'var(--accent-red,#cc2233)' : isDanger ? 'rgba(204,34,51,0.5)' : 'var(--border-color,rgba(200,184,154,0.2))'};background:${isPrimary ? 'var(--accent-red,#cc2233)' : 'transparent'};color:${isPrimary ? '#fff' : isDanger ? 'var(--accent-red,#cc2233)' : 'var(--text-secondary,#a09888)'};box-sizing:border-box;`;
        if (iconId) { const ic = _makeIcon(uiApi, iconId, 12); ic.style.color = 'currentColor'; b.appendChild(ic); }
        const span = document.createElement('span');
        span.textContent = label;
        b.appendChild(span);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return b;
    };

    row.appendChild(mkBtn('Из даташита', 'icon-import', () => {
        const next = JSON.parse(JSON.stringify(DRIVER_UI_DEFAULT));
        for (const k of REQUIRED) {
            if (ui[k] != null && Number(ui[k]) > 0) next[k] = ui[k];
            next._user[k] = true;
        }
        next._sections = ui._sections;
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }));

    row.appendChild(mkBtn('Всё авто', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(DRIVER_UI_DEFAULT));
        for (const k of REQUIRED) {
            if (ui[k] != null && Number(ui[k]) > 0) next[k] = ui[k];
            next._user[k] = true;
        }
        next._sections = ui._sections;
        const computed = _calcAll(next);
        computed._version = (ui._version || 1) + 1;
        onChange(computed);
    }, 'primary'));

    row.appendChild(mkBtn('Сбросить', 'icon-refresh', () => {
        const fresh = JSON.parse(JSON.stringify(DRIVER_UI_DEFAULT));
        fresh._sections = ui._sections;
        onChange(fresh);
    }, 'danger'));

    return row;
}

function _makeSection(title, iconId, uiApi, opts = {}) {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;background:var(--bg-card,#1f1f1f);border:1px solid var(--border-color,rgba(200,184,154,0.10));border-radius:8px;overflow:hidden;width:100%;min-width:0;box-sizing:border-box;';
    if (opts.sectionKey) section.dataset.speakerSection = opts.sectionKey;

    const head = document.createElement('button');
    head.type = 'button';
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(200,184,154,0.05);border:none;border-bottom:1px solid var(--border-color,rgba(200,184,154,0.08));font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-secondary,#a09888);user-select:none;font-family:inherit;text-align:left;width:100%;box-sizing:border-box;cursor:pointer;';

    if (opts.collapsible) {
        head.addEventListener('mouseenter', () => { head.style.background = 'rgba(200,184,154,0.10)'; head.style.color = 'var(--text-primary,#e0d8cc)'; });
        head.addEventListener('mouseleave', () => { head.style.background = 'rgba(200,184,154,0.05)'; head.style.color = 'var(--text-secondary,#a09888)'; });
    } else {
        head.style.pointerEvents = 'none';
    }

    const arrow = document.createElement('span');
    arrow.textContent = opts.collapsed ? '▶' : '▼';
    arrow.style.cssText = 'font-size:8px;opacity:0.7;width:10px;text-align:center;flex-shrink:0;';
    head.appendChild(arrow);

    const iconEl = _makeIcon(uiApi, iconId, 12);
    if (iconEl) head.appendChild(iconEl);

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    head.appendChild(titleEl);

    section.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = `display:${opts.collapsed ? 'none' : 'flex'};flex-direction:column;width:100%;min-width:0;box-sizing:border-box;`;
    if (opts.sectionKey) body.dataset.speakerSectionBody = '1';
    section.appendChild(body);

    if (opts.collapsible) {
        head.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'flex' : 'none';
            arrow.textContent = isHidden ? '▼' : '▶';
            if (typeof opts.onToggleLocal === 'function') opts.onToggleLocal(isHidden);
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

function _updateDriverCard(el, value) {
    if (!el || !el.parentNode) return;
    if (!value || typeof value !== 'object') return;

    let target = el;
    if (!target.__onChange) {
        const inner = el.querySelector('[data-np-custom="1"]');
        if (inner && inner.__onChange) target = inner;
        else {
            const all = el.querySelectorAll('*');
            for (const n of all) if (n.__onChange) { target = n; break; }
        }
    }

    const onChange = el.__onChange || target.__onChange;
    const uiApi = el.__uiApi || target.__uiApi;
    const lastFocusedField = el.__lastFocusedField || target.__lastFocusedField;
    if (!onChange) return;

    const activeEl = document.activeElement;
    let focusFieldId = null, focusStart = null, focusEnd = null, hadFocusInEl = false;

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

    const sectionsState = { ...(value._sections || DRIVER_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-speaker-section]');
        for (const s of sections) {
            const secKey = s.dataset.speakerSection;
            const body = s.querySelector('[data-speaker-section-body]');
            if (body && secKey) sectionsState[secKey] = (body.style.display === 'none');
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderDriverCard(value, onChange, { host: { ui: uiApi } }, null);
    fresh.__onChange = onChange;
    fresh.__uiApi = uiApi;
    fresh.__lastFocusedField = lastFocusedField;

    el.innerHTML = '';
    while (fresh.firstChild) el.appendChild(fresh.firstChild);

    el.__onChange = onChange;
    el.__uiApi = uiApi;
    el.__lastFocusedField = lastFocusedField;

    if (focusFieldId) {
        const targetEl = el.querySelector(`input[data-field-id="${CSS.escape(focusFieldId)}"]`);
        if (targetEl) {
            targetEl.focus();
            try {
                if (focusStart != null && targetEl.setSelectionRange) targetEl.setSelectionRange(focusStart, focusEnd);
            } catch (e) {}
        }
    }
}