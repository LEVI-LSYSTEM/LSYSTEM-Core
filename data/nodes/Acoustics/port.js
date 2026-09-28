// data/nodes/Acoustics/port.js
// v9.2 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ ПОРТА
//
// Изменения v9.2:
//   - Убрана нелинейность Ra_visc: law = 'sqrt_omega' (вместо 'sqrt_omega_nonlin').
//   - Удалены v_local_ref и v_crit из meta и components.
//
// Изменения v9.1:
//   - radiatingPorts.emit.delay_m = dPort (задержка динамик↔порт).
//
// Изменения v9.0:
//   - radiatingPorts декларативный: [{ port:'out', emit:{...} }].
//   - emit: from='m2', to='out', sign=−1.
//   - Топология: rear --Ma--> m1 --Ra_visc--> m2 --Ra_rad_ext--> out.

'use strict';

const PORT_UI_DEFAULT = {
    shape: 'round',
    diameter: 50,
    width: null,
    height: null,
    length: 150,

    n_ports: 1,
    flared: true,
    flare_ratio: 100,
    d_port: 0.10,

    mode: 'normal',
    R_resist: null,

    vb_ref: null,

    _user: { diameter: true, length: true },
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: {
        geometry: false,
        tuning: false,
        diagnostics: false,
        advanced: true
    }
};

const SHAPE_LABEL = {
    round: 'круглый',
    slot:  'щелевой',
    rect:  'прямоугольный'
};

const RHO0 = 1.2041;
const C0   = 343.0;
const MU   = 1.81e-5;

function _portArea(shape, d_mm, w_mm, h_mm, nPorts) {
    const n = Math.max(1, Math.floor(nPorts || 1));
    if (shape === 'round') {
        const d = Number(d_mm) / 1000;
        if (!(d > 0)) return 0;
        return Math.PI * d * d / 4 * n;
    }
    const w = Number(w_mm) / 1000;
    const h = Number(h_mm) / 1000;
    if (!(w > 0) || !(h > 0)) return 0;
    return w * h * n;
}

function _effLength(L_mm, shape, d_mm, w_mm, h_mm, flared) {
    const L = Number(L_mm) / 1000;
    if (!(L > 0)) return 0;

    let r;
    if (shape === 'round') {
        r = Number(d_mm) / 2000;
    } else {
        const w = Number(w_mm) / 1000;
        const h = Number(h_mm) / 1000;
        const S = w * h;
        const perim = 2 * (w + h);
        r = perim > 0 ? (2 * S / perim) : 0;
    }

    const deltaCoef = flared ? 0.61 : 0.85;
    return L + 2 * deltaCoef * r;
}

function _fbFromParams(Vb_L, L_eff_m, S_m2) {
    const Vb = Number(Vb_L) / 1000;
    if (!(Vb > 0) || !(L_eff_m > 0) || !(S_m2 > 0)) return null;
    return (C0 / (2 * Math.PI)) * Math.sqrt(S_m2 / (Vb * L_eff_m));
}

function _lEffFromFb(Vb_L, Fb_Hz, S_m2) {
    const Vb = Number(Vb_L) / 1000;
    const Fb = Number(Fb_Hz);
    if (!(Vb > 0) || !(Fb > 0) || !(S_m2 > 0)) return null;
    return S_m2 / (Vb * Math.pow(2 * Math.PI * Fb / C0, 2));
}

function _viscResistance(L_eff_m, S_m2, shape, d_mm, w_mm, h_mm, nPorts) {
    const n = Math.max(1, Math.floor(nPorts || 1));
    let r;
    if (shape === 'round') {
        r = Number(d_mm) / 2000;
    } else {
        const w = Number(w_mm) / 1000;
        const h = Number(h_mm) / 1000;
        const S = w * h;
        const perim = 2 * (w + h);
        r = perim > 0 ? (2 * S / perim) : 0;
    }
    if (!(r > 0) || !(S_m2 > 0)) return 0;

    const w_ref = 2 * Math.PI * 100;
    const deltaV_ref = Math.sqrt(2 * MU / (RHO0 * w_ref));
    const R_base = (8 * MU * L_eff_m) / (Math.PI * Math.pow(r, 4));
    return R_base * (1 + r / deltaV_ref) / n;
}

function _rRadRef(S_m2, r_m) {
    if (!(S_m2 > 0) || !(r_m > 0)) return 0;
    const w_ref = 2 * Math.PI * 100;
    const ka = (w_ref / C0) * r_m;
    const ka2 = ka * ka;
    return RHO0 * C0 * S_m2 * ka2 / (1 + ka2);
}

function _airVelocity(S_port_m2, Fb_Hz) {
    if (!(S_port_m2 > 0) || !(Fb_Hz > 0)) return null;
    const Sd = 220e-4;
    const X  = 5e-3;
    const w  = 2 * Math.PI * Fb_Hz;
    return (Sd * X * w) / S_port_m2;
}

function _findBoxInGraph(ctx, selfNodeId) {
    if (!ctx || !ctx.graph || !selfNodeId) return null;
    const g = ctx.graph;
    if (!g.connections || !g.nodes) return null;

    for (const conn of g.connections) {
        if (String(conn.toNodeId) !== String(selfNodeId)) continue;
        if (conn.toPortId !== 'rear') continue;
        const up = g.getNode ? g.getNode(conn.fromNodeId) : null;
        if (up && up.def && up.def.file === 'box.js') {
            const boxUi = up.paramValues && up.paramValues.box_ui;
            if (boxUi && Number(boxUi.volume) > 0) {
                return { node: up, Vb_L: Number(boxUi.volume) };
            }
        }
    }

    for (const n of g.nodes) {
        if (n.def && n.def.file === 'box.js') {
            const boxUi = n.paramValues && n.paramValues.box_ui;
            if (boxUi && Number(boxUi.volume) > 0) {
                return { node: n, Vb_L: Number(boxUi.volume) };
            }
        }
    }
    return null;
}

module.exports = {
    meta: { id: 'Acoustics.port', label: 'Port', icon: 'icon-port' },

    ports: {
        inputs:  [{ id: 'rear', label: 'Rear' }],
        outputs: [{ id: 'out',  label: 'Out'  }]
    },

    inputRules:  { rear: ['box.js'] },
    outputRules: { out:  ['box.js', 'passive_radiator.js', 'LEMsolver.js', 'horn.js', 'twqp.js' ] },

    maxInputs:  { rear: 1 },
    maxOutputs: { out:  1 },

    params: [
        {
            id: 'port_ui',
            type: 'port_ui',
            label: 'Порт',
            default: PORT_UI_DEFAULT,
            category: 'Порт',
            _noCategoryHeader: true
        }
    ],

    onParamChange(id, value, node) {
        if (id !== 'port_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(PORT_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...PORT_UI_DEFAULT._sections };
        }

        ui._version = (ui._version || 1) + 1;
        node.paramValues.port_ui = ui;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'port_ui', value: ui }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.port_ui && typeof p.port_ui === 'object') ? p.port_ui : PORT_UI_DEFAULT;

        const shape  = ui.shape || 'round';
        const D_mm   = Number(ui.diameter);
        const W_mm   = Number(ui.width);
        const H_mm   = Number(ui.height);
        const L_mm   = Number(ui.length);
        const nPort  = Math.max(1, Math.floor(Number(ui.n_ports) || 1));
        const flared = ui.flared === true;
        const dPort  = Math.max(0, Number(ui.d_port) || 0.10);
        const mode   = ui.mode || 'normal';

        if (shape === 'round' && !(D_mm > 0)) throw new Error('Port: diameter > 0');
        if (shape !== 'round' && (!(W_mm > 0) || !(H_mm > 0))) throw new Error('Port: W, H > 0');
        if (!(L_mm > 0)) throw new Error('Port: length > 0');

        let Vb_L = null;
        try {
            const inputs = ctx.getInputs();
            for (const inp of inputs) {
                if (inp.def && inp.def.file === 'box.js') {
                    const boxUi = inp.paramValues && inp.paramValues.box_ui;
                    if (boxUi && Number(boxUi.volume) > 0) {
                        Vb_L = Number(boxUi.volume);
                        break;
                    }
                }
            }
        } catch (e) {}
        if (Vb_L == null && ui.vb_ref != null && Number(ui.vb_ref) > 0) {
            Vb_L = Number(ui.vb_ref);
        }

        const S_total = _portArea(shape, D_mm, W_mm, H_mm, nPort);
        const S_one = S_total / nPort;
        if (!(S_one > 0)) throw new Error('Port: S > 0');

        const r_eq = Math.sqrt(S_one / Math.PI);

        const L_eff = _effLength(L_mm, shape, D_mm, W_mm, H_mm, flared);
        const Ma = (RHO0 * L_eff) / S_total;

        const R_visc_ref = _viscResistance(L_eff, S_one, shape, D_mm, W_mm, H_mm, 1) / nPort;

        const R_rad_ref = _rRadRef(S_one, r_eq);

        const Fb = Vb_L ? _fbFromParams(Vb_L, L_eff, S_one) : null;
        const V_port = S_total * L_eff;

        const nodes = ['rear', 'm1', 'm2', 'out', 'gnd'];

        const components = [
            { id: 'Ma', type: 'L', from: 'rear', to: 'm1', value: Ma },
            { id: 'Ra_visc', type: 'R_freq', from: 'm1', to: 'm2',
              value: R_visc_ref, freqRef: 100, law: 'sqrt_omega' },
            { id: 'Ra_rad_ext', type: 'R_freq', from: 'm2', to: 'out',
              value: R_rad_ref, freqRef: 100, law: 'rad_plateau',
              radiationRadius_m: r_eq }
        ];

        const ports = { rear: 'rear', out: 'out', gnd: 'gnd' };

        const radiatingPorts = [
            {
                port: 'out',
                emit: {
                    kind: 'current_through',
                    from: 'm2',
                    to: 'out',
                    sign: -1,
                    delay_m: dPort,
                    admittance: {
                        type: 'R_freq',
                        value: R_rad_ref,
                        freqRef: 100,
                        law: 'rad_plateau',
                        radiationRadius_m: r_eq
                    }
                }
            }
        ];

        return {
            kind: 'lem.fragment',
            source: 'port',
            nodes,
            components,
            ports,
            radiatingPorts,
            meta: {
                label: _portLabel(shape, D_mm, W_mm, H_mm, L_mm, nPort),
                shape,
                diameter_mm: D_mm,
                width_mm: W_mm,
                height_mm: H_mm,
                length_mm: L_mm,
                n_ports: nPort,
                flared,
                d_port_m: dPort,
                mode,

                S_m2: S_one,
                S_total_m2: S_total,
                r_eq_m: r_eq,
                L_eff_m: L_eff,

                Ma,
                R_visc_ref,
                R_rad_ref,
                radiationRadius_m: r_eq,

                Vb_L,
                Fb_Hz: Fb,
                V_port_m3: V_port,
                f_ref: 100
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'Port not connected' };
        }
        const ui = (ctx.params && ctx.params.port_ui) || {};
        const shape = ui.shape || 'round';
        if (shape === 'round' && !(Number(ui.diameter) > 0)) {
            return { ready: false, reason: 'Port: Ø > 0 (required)' };
        }
        if (shape !== 'round' && (!(Number(ui.width) > 0) || !(Number(ui.height) > 0))) {
            return { ready: false, reason: 'Port: W, H > 0 (required)' };
        }
        if (!(Number(ui.length) > 0)) {
            return { ready: false, reason: 'Port: L > 0 (required)' };
        }
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'port_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderPortCard(value, onChange, ctx, node);
                },
                update(el, value) {
                    _updatePortCard(el, value);
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

function _portLabel(shape, d, w, h, l, n) {
    const nStr = n > 1 ? ` ×${n}` : '';
    if (shape === 'round') return `Port Ø${d}×${l} мм${nStr}`;
    return `Port ${w}×${h}×${l} мм${nStr}`;
}

// ============================================================
// UI
// ============================================================

function _renderPortCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(PORT_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...PORT_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'port-ui';
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

    const boxInfo = _findBoxInGraph(ctx, node ? node.id : null);
    const Vb_L = boxInfo ? boxInfo.Vb_L : null;

    const toggleSection = (key) => {
        const next = JSON.parse(JSON.stringify(ui));
        if (!next._sections) next._sections = { ...PORT_UI_DEFAULT._sections };
        next._sections[key] = !next._sections[key];
        next._lastEdited = '_toggle_section';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildGeometrySection(ui, onChange, uiApi, toggleSection));
    wrap.appendChild(_buildTuningSection(ui, onChange, uiApi, Vb_L, toggleSection));
    wrap.appendChild(_buildDiagnosticsSection(ui, uiApi, Vb_L, toggleSection));
    wrap.appendChild(_buildAdvancedSection(ui, onChange, uiApi, Vb_L, toggleSection));
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

    const icon = _makeIcon(uiApi, 'icon-port', 20);
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
    const shape = ui.shape || 'round';
    if (shape === 'round') {
        const d = ui.diameter != null ? ui.diameter : '—';
        line1.textContent = `Port Ø${d} мм · ${SHAPE_LABEL[shape]}`;
    } else {
        const w = ui.width != null ? ui.width : '—';
        const h = ui.height != null ? ui.height : '—';
        line1.textContent = `Port ${w}×${h} мм · ${SHAPE_LABEL[shape]}`;
    }
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = `
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-family: 'Courier New', monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const L = ui.length != null ? ui.length : '—';
    const n = Math.max(1, Math.floor(Number(ui.n_ports) || 1));
    const nStr = n > 1 ? ` ×${n}` : '';
    const flaredStr = ui.flared ? ' · раструб' : '';
    line2.textContent = `L ${L} мм${nStr}${flaredStr}`;
    info.appendChild(line2);

    bar.appendChild(info);

    const shapeV = ui.shape || 'round';
    const missing = shapeV === 'round'
        ? !(Number(ui.diameter) > 0)
        : (!(Number(ui.width) > 0) || !(Number(ui.height) > 0));
    const missingL = !(Number(ui.length) > 0);

    const statusEl = document.createElement('div');
    statusEl.style.cssText = `
        font-size: 10px; font-weight: 700;
        padding: 4px 10px; border-radius: 12px;
        white-space: nowrap; flex-shrink: 0;
    `;
    if (missing || missingL) {
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

function _buildGeometrySection(ui, onChange, uiApi, toggleSection) {
    const key = 'geometry';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Геометрия', 'icon-port', uiApi, {
        collapsible: true, collapsed,
        onToggle: () => toggleSection(key)
    });

    const shape = ui.shape || 'round';

    const shapeRow = document.createElement('div');
    shapeRow.style.cssText = `
        display: flex; gap: 6px;
        padding: 8px 12px;
        flex-wrap: wrap;
        width: 100%; box-sizing: border-box;
    `;

    const SHAPES = [
        { id: 'round', label: 'Круг',  icon: '○' },
        { id: 'slot',  label: 'Щель',  icon: '▭' },
        { id: 'rect',  label: 'Прям.', icon: '▬' }
    ];

    for (const s of SHAPES) {
        const isActive = shape === s.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = s.icon + ' ' + s.label;
        btn.style.cssText = `
            padding: 5px 10px; font-size: 10px; font-weight: 600;
            font-family: inherit; border-radius: 5px;
            border: 1px solid ${isActive ? 'var(--accent-red, #cc2233)' : 'var(--border-color, rgba(200,184,154,0.15))'};
            background: ${isActive ? 'rgba(204,34,51,0.18)' : 'transparent'};
            color: ${isActive ? 'var(--text-primary, #e0d8cc)' : 'var(--text-secondary, #a09888)'};
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
            box-sizing: border-box;
        `;
        btn.addEventListener('click', () => {
            const next = JSON.parse(JSON.stringify(ui));
            next.shape = s.id;
            if (s.id === 'slot') {
                if (next.width == null) next.width = 200;
                if (next.height == null) next.height = 30;
            } else if (s.id === 'rect') {
                if (next.width == null) next.width = 60;
                if (next.height == null) next.height = 60;
            }
            next._lastEdited = 'shape';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        shapeRow.appendChild(btn);
    }
    section.body.appendChild(shapeRow);

    const fieldsRow = document.createElement('div');
    fieldsRow.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        padding: 4px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;

    if (shape === 'round') {
        fieldsRow.appendChild(_buildDimField(ui, {
            id: 'diameter', label: 'Ø', unit: 'мм', step: 1, required: true,
            hint: 'Диаметр порта'
        }, onChange));
    } else {
        fieldsRow.appendChild(_buildDimField(ui, {
            id: 'width', label: 'Ширина', unit: 'мм', step: 1, required: true,
            hint: 'Ширина порта'
        }, onChange));
        fieldsRow.appendChild(_buildDimField(ui, {
            id: 'height', label: 'Высота', unit: 'мм', step: 1, required: true,
            hint: 'Высота порта'
        }, onChange));
    }

    fieldsRow.appendChild(_buildDimField(ui, {
        id: 'length', label: 'Длина', unit: 'мм', step: 1, required: true,
        hint: 'Эффективная длина порта'
    }, onChange));

    section.body.appendChild(fieldsRow);

    const S = _portArea(shape, ui.diameter, ui.width, ui.height, 1);
    const S_cm2 = S * 10000;
    const n = Math.max(1, Math.floor(Number(ui.n_ports) || 1));
    const S_total = S * n;

    const summary = document.createElement('div');
    summary.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        padding: 6px 12px 10px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.55));
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;

    const sl = document.createElement('span');
    sl.textContent = 'Площадь:';
    sl.style.cssText = 'min-width:0; overflow:hidden; text-overflow:ellipsis;';
    summary.appendChild(sl);

    const sv = document.createElement('span');
    sv.textContent = `${S_cm2.toFixed(2)} см²` + (n > 1 ? ` ×${n} = ${(S_total*10000).toFixed(2)} см²` : '');
    sv.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        flex-shrink: 0;
        color: var(--text-secondary, #a09888);
    `;
    summary.appendChild(sv);

    section.body.appendChild(summary);
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
    lbl.textContent = f.label + (isRequired ? ' *' : '');
    lbl.title = f.hint || '';
    lbl.style.cssText = `
        font-size: 10px; font-weight: 600;
        color: ${isRequired ? 'var(--beige, #c8b89a)' : 'var(--text-secondary, #a09888)'};
        letter-spacing: 0.4px;
        cursor: help;
    `;
    wrap.appendChild(lbl);

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;';

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    inp.min = '1';
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
    unit.textContent = f.unit;
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;flex-shrink:0;';
    inputWrap.appendChild(unit);

    wrap.appendChild(inputWrap);
    return wrap;
}

function _buildTuningSection(ui, onChange, uiApi, Vb_L, toggleSection) {
    const key = 'tuning';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Настройка', 'icon-frequency', uiApi, {
        collapsible: true, collapsed,
        onToggle: () => toggleSection(key)
    });

    const shape = ui.shape || 'round';
    const S_total = _portArea(shape, ui.diameter, ui.width, ui.height, ui.n_ports);
    const n = Math.max(1, Math.floor(Number(ui.n_ports) || 1));
    const S_one = S_total / n;
    const L_eff = _effLength(ui.length, shape, ui.diameter, ui.width, ui.height, ui.flared);

    const vbRow = document.createElement('div');
    vbRow.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px 4px;
        flex-wrap: wrap;
        width: 100%; box-sizing: border-box;
    `;

    const vbLabel = document.createElement('div');
    if (Vb_L != null) {
        vbLabel.textContent = 'Vb (из Box):';
        vbLabel.style.cssText = `
            font-size: 11px; font-weight: 600;
            color: var(--text-secondary, #a09888);
            min-width: 0; flex-shrink: 0;
        `;
    } else {
        vbLabel.textContent = 'Vb (ручной):';
        vbLabel.style.cssText = `
            font-size: 11px; font-weight: 600;
            color: var(--beige, #c8b89a);
            min-width: 0; flex-shrink: 0;
        `;
    }
    vbRow.appendChild(vbLabel);

    if (Vb_L != null) {
        const vbVal = document.createElement('div');
        vbVal.textContent = Vb_L.toFixed(1) + ' L';
        vbVal.style.cssText = `
            font-size: 12px; font-weight: 700;
            font-family: 'Courier New', monospace;
            color: rgba(68,204,136,0.95);
            flex-shrink: 0;
        `;
        vbRow.appendChild(vbVal);

        const badge = document.createElement('span');
        badge.textContent = '✓ связано';
        badge.style.cssText = `
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 8px;
            background: rgba(68,204,136,0.12);
            color: rgba(68,204,136,0.9);
            border: 1px solid rgba(68,204,136,0.3);
            flex-shrink: 0;
        `;
        vbRow.appendChild(badge);
    } else {
        const vbInput = document.createElement('input');
        vbInput.type = 'number';
        vbInput.step = '0.1';
        vbInput.min = '0.1';
        vbInput.value = ui.vb_ref != null ? String(ui.vb_ref) : '';
        vbInput.placeholder = 'например, 30';
        vbInput.dataset.fieldId = 'vb_ref';
        vbInput.style.cssText = `
            flex: 1 1 80px; min-width: 0;
            padding: 5px 8px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
            font-weight: 600;
            background: ${ui.vb_ref != null ? 'rgba(204,34,51,0.04)' : 'rgba(200,184,154,0.06)'};
            color: var(--text-primary, #e0d8cc);
            border: 1px solid ${ui.vb_ref != null ? 'rgba(204,34,51,0.4)' : 'rgba(200,184,154,0.4)'};
            border-radius: 4px;
            outline: none;
            box-sizing: border-box;
        `;
        vbInput.addEventListener('focus', () => {
            vbInput.style.borderColor = 'var(--beige, #c8b89a)';
            vbInput.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.2)';
        });
        vbInput.addEventListener('blur', () => {
            vbInput.style.boxShadow = 'none';
        });
        vbInput.addEventListener('change', () => {
            const num = Number(vbInput.value);
            if (!isFinite(num) || num <= 0) return;
            const next = JSON.parse(JSON.stringify(ui));
            next.vb_ref = num;
            next._user = { ...(next._user || {}), vb_ref: true };
            next._lastEdited = 'vb_ref';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        vbRow.appendChild(vbInput);

        const vbUnit = document.createElement('span');
        vbUnit.textContent = 'L';
        vbUnit.style.cssText = 'font-size:11px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:monospace;flex-shrink:0;';
        vbRow.appendChild(vbUnit);
    }

    section.body.appendChild(vbRow);

    const Fb = (Vb_L && S_one > 0 && L_eff > 0) ? _fbFromParams(Vb_L, L_eff, S_one) : null;

    const fbRow = document.createElement('div');
    fbRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        padding: 6px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const fbLabel = document.createElement('span');
    fbLabel.textContent = 'Fb (расчётная):';
    fbLabel.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary, #a09888); min-width:0;';
    fbRow.appendChild(fbLabel);

    const fbVal = document.createElement('span');
    fbVal.textContent = Fb != null ? `${Fb.toFixed(2)} Hz` : '— (нужен Vb)';
    fbVal.style.cssText = `
        font-size: 13px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: ${Fb != null ? 'rgba(68,204,136,0.95)' : 'var(--text-muted, rgba(200,184,154,0.5))'};
        flex-shrink: 0;
    `;
    fbRow.appendChild(fbVal);

    section.body.appendChild(fbRow);

    const vpRow = document.createElement('div');
    vpRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        padding: 6px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;

    const vpLabel = document.createElement('span');
    vpLabel.textContent = 'V_port:';
    vpLabel.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary, #a09888); min-width:0;';
    vpRow.appendChild(vpLabel);

    const V_port_total = S_one * L_eff * n * 1000;
    const vpVal = document.createElement('span');
    vpVal.textContent = V_port_total > 0 ? `${V_port_total.toFixed(3)} L` : '—';
    vpVal.style.cssText = `
        font-size: 13px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: var(--text-primary, #e0d8cc);
        flex-shrink: 0;
    `;
    vpRow.appendChild(vpVal);

    section.body.appendChild(vpRow);

    if (Vb_L != null) {
        const autoRow = document.createElement('div');
        autoRow.style.cssText = `
            display: flex; align-items: center; gap: 6px;
            padding: 6px 12px 10px;
            border-top: 1px solid rgba(200,184,154,0.06);
            flex-wrap: wrap;
            width: 100%; box-sizing: border-box;
        `;

        const fbInput = document.createElement('input');
        fbInput.type = 'number';
        fbInput.step = '0.1';
        fbInput.min = '10';
        fbInput.placeholder = 'Fb target, Hz';
        fbInput.style.cssText = `
            flex: 1 1 100px; min-width: 0;
            padding: 5px 8px;
            font-size: 11px;
            font-family: 'Courier New', monospace;
            background: transparent;
            color: var(--text-primary, #e0d8cc);
            border: 1px solid var(--border-color, rgba(200,184,154,0.15));
            border-radius: 4px;
            outline: none;
            box-sizing: border-box;
        `;
        fbInput.addEventListener('focus', () => {
            fbInput.style.borderColor = 'var(--accent-red, #cc2233)';
            fbInput.style.background = 'var(--bg-input, #2a2a2a)';
        });
        fbInput.addEventListener('blur', () => {
            fbInput.style.borderColor = 'var(--border-color, rgba(200,184,154,0.15))';
            fbInput.style.background = 'transparent';
        });
        autoRow.appendChild(fbInput);

        const tuneBtn = document.createElement('button');
        tuneBtn.type = 'button';
        tuneBtn.textContent = 'Настроить';
        tuneBtn.style.cssText = `
            padding: 5px 12px;
            font-size: 10px; font-weight: 600;
            font-family: inherit;
            border: 1px solid var(--accent-red, #cc2233);
            background: var(--accent-red, #cc2233);
            color: #fff;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.15s ease;
            flex-shrink: 0;
            box-sizing: border-box;
        `;
        tuneBtn.addEventListener('mouseenter', () => {
            tuneBtn.style.background = 'var(--accent-red-hover, #ee3344)';
        });
        tuneBtn.addEventListener('mouseleave', () => {
            tuneBtn.style.background = 'var(--accent-red, #cc2233)';
        });
        tuneBtn.addEventListener('click', () => {
            const Fb_target = Number(fbInput.value);
            if (!(Fb_target > 0)) return;
            if (!(S_one > 0) || !(Vb_L > 0)) return;

            const L_eff_target = _lEffFromFb(Vb_L, Fb_target, S_one);
            if (!(L_eff_target > 0)) return;

            const r_est = shape === 'round'
                ? Number(ui.diameter) / 2000
                : (() => {
                    const w = Number(ui.width) / 1000, h = Number(ui.height) / 1000;
                    const S1 = w * h, perim = 2 * (w + h);
                    return perim > 0 ? (2 * S1 / perim) : 0.025;
                })();
            const deltaCoef = ui.flared ? 0.61 : 0.85;
            const endCorr = 2 * deltaCoef * r_est;
            const L_calc_mm = (L_eff_target - endCorr) * 1000;

            if (!(L_calc_mm > 0)) return;

            const next = JSON.parse(JSON.stringify(ui));
            next.length = Math.round(L_calc_mm);
            next._user = { ...(next._user || {}), length: true };
            if (next._calc) delete next._calc.length;
            next._lastEdited = 'length';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        autoRow.appendChild(tuneBtn);

        section.body.appendChild(autoRow);
    }

    return section.el;
}

function _buildDiagnosticsSection(ui, uiApi, Vb_L, toggleSection) {
    const key = 'diagnostics';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Диагностика', 'icon-wave', uiApi, {
        collapsible: true, collapsed,
        onToggle: () => toggleSection(key)
    });

    const shape = ui.shape || 'round';
    const S_total = _portArea(shape, ui.diameter, ui.width, ui.height, ui.n_ports);
    const n = Math.max(1, Math.floor(Number(ui.n_ports) || 1));
    const S_one = S_total / n;

    let Fb = null;
    if (Vb_L) {
        const L_eff = _effLength(ui.length, shape, ui.diameter, ui.width, ui.height, ui.flared);
        Fb = _fbFromParams(Vb_L, L_eff, S_one);
    }

    const v = Fb ? _airVelocity(S_one, Fb) : null;
    const vMax = 0.16 * C0;

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const lbl = document.createElement('span');
    lbl.textContent = 'v_max (грубо):';
    lbl.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-secondary, #a09888); min-width: 0;';
    row.appendChild(lbl);

    const val = document.createElement('span');
    if (v == null) {
        val.textContent = '—';
        val.style.color = 'var(--text-muted, rgba(200,184,154,0.5))';
    } else {
        const bad = v > vMax;
        val.textContent = `${v.toFixed(1)} м/с ${bad ? '⚠' : '✓'}`;
        val.style.color = bad ? 'rgba(255,170,51,0.95)' : 'rgba(68,204,136,0.95)';
        val.title = bad
            ? `Скорость воздуха выше ${vMax.toFixed(1)} м/с — возможен свист.`
            : 'Скорость воздуха в норме';
    }
    val.style.cssText += `
        font-size: 12px; font-weight: 700;
        font-family: 'Courier New', monospace;
        flex-shrink: 0;
    `;
    row.appendChild(val);

    section.body.appendChild(row);

    if (v != null && v > vMax) {
        const warn = document.createElement('div');
        warn.textContent = `⚠ Скорость ${v.toFixed(1)} м/с > ${vMax.toFixed(1)} м/с (0.16c) — риск свиста`;
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

function _buildAdvancedSection(ui, onChange, uiApi, Vb_L, toggleSection) {
    const key = 'advanced';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Дополнительно', 'icon-settings', uiApi, {
        collapsible: true, collapsed,
        onToggle: () => toggleSection(key)
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:0;width:100%;box-sizing:border-box;';

    row.appendChild(_buildStepper(ui, {
        id: 'n_ports', label: 'Кол-во', min: 1, max: 8,
        hint: 'Количество портов'
    }, onChange));

    row.appendChild(_buildCheckbox(ui, {
        id: 'flared', label: 'Раструб',
        hint: 'Раструб на концах порта'
    }, onChange));

    if (ui.flared) {
        row.appendChild(_buildAdvancedNumber(ui, {
            id: 'flare_ratio', label: 'Раструб', unit: '%',
            step: 1, min: 0, max: 200,
            hint: 'Степень раструба: 0..200%'
        }, onChange));
    }

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'd_port', label: 'До динам.', unit: 'м',
        step: 0.01, min: 0, max: 5,
        hint: 'Расстояние от динамика до порта'
    }, onChange));

    row.appendChild(_buildRadioRow(ui, {
        id: 'mode', label: 'Режим',
        options: [
            { id: 'normal',    label: 'Обычный' },
            { id: 'resistive', label: 'Апериодика' }
        ],
        hint: 'Обычный порт или апериодический'
    }, onChange));

    if (ui.mode === 'resistive') {
        row.appendChild(_buildAdvancedNumber(ui, {
            id: 'R_resist', label: 'R рез.', unit: 'Па·с/м³',
            step: 1e3, min: 0, max: 1e9,
            hint: 'Сопротивление апериодического порта'
        }, onChange));
    }

    if (Vb_L == null) {
        row.appendChild(_buildAdvancedNumber(ui, {
            id: 'vb_ref', label: 'Vb вручную', unit: 'L',
            step: 0.1, min: 0.1, max: 1000,
            hint: 'Объём ящика (если box.js не подключён)'
        }, onChange));
    }

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
        text-align: right;
        cursor: help;
        width: 64px; flex-shrink: 0;
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
            flex-shrink: 0;
            box-sizing: border-box;
        `;
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
        min-width: 36px; text-align: center;
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

function _buildCheckbox(ui, f, onChange) {
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
        text-align: right;
        cursor: help;
        width: 64px; flex-shrink: 0;
    `;
    row.appendChild(lbl);

    const lbl2 = document.createElement('label');
    lbl2.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;min-width:0;';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!ui[f.id];
    box.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--accent-red, #cc2233);flex-shrink:0;';
    box.addEventListener('change', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next[f.id] = box.checked;
        next._user = { ...(next._user || {}), [f.id]: true };
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    lbl2.appendChild(box);

    const txt = document.createElement('span');
    txt.textContent = box.checked ? 'включено' : 'выключено';
    txt.style.cssText = 'font-size:10px;color:var(--text-muted,rgba(200,184,154,0.6));min-width:0;';
    lbl2.appendChild(txt);

    row.appendChild(lbl2);
    return row;
}

function _buildRadioRow(ui, f, onChange) {
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
        text-align: right;
        cursor: help;
        width: 64px; flex-shrink: 0;
    `;
    row.appendChild(lbl);

    const group = document.createElement('div');
    group.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;min-width:0;';

    const groupName = 'rad_' + Math.random().toString(36).slice(2, 8);

    for (const opt of f.options) {
        const l = document.createElement('label');
        l.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-primary,#e0d8cc);cursor:pointer;';

        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = groupName;
        inp.checked = ui[f.id] === opt.id;
        inp.style.cssText = 'accent-color:var(--accent-red,#cc2233);cursor:pointer;';
        inp.addEventListener('change', () => {
            const next = JSON.parse(JSON.stringify(ui));
            next[f.id] = opt.id;
            next._user = { ...(next._user || {}), [f.id]: true };
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        l.appendChild(inp);
        l.appendChild(document.createTextNode(opt.label));
        group.appendChild(l);
    }

    row.appendChild(group);
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
        text-align: right;
        cursor: help;
        width: 64px; flex-shrink: 0;
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
        flex-wrap: wrap;
        width: 100%; box-sizing: border-box;
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
        b.addEventListener('click', onClick);
        return b;
    };

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        onChange(JSON.parse(JSON.stringify(PORT_UI_DEFAULT)));
    }, 'danger'));

    return row;
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
    section.appendChild(body);

    head.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'flex' : 'none';
        arrow.textContent = isHidden ? '▼' : '▶';

        if (typeof opts.onToggle === 'function') {
            opts.onToggle(isHidden);
        }
    });

    return { el: section, body, head };
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

function _updatePortCard(el, value) {
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

    const onChange = target.__onChange;
    const uiApi = target.__uiApi;
    const lastFocusedField = target.__lastFocusedField;
    if (!onChange) {
        console.warn('[port] _updatePortCard: no onChange found');
        return;
    }

    const activeEl = document.activeElement;
    let focusFieldId = null;
    let focusStart = null, focusEnd = null;

    if (activeEl && el.contains(activeEl)) {
        if (activeEl.dataset && activeEl.dataset.fieldId) {
            focusFieldId = activeEl.dataset.fieldId;
            if (activeEl.selectionStart != null) {
                focusStart = activeEl.selectionStart;
                focusEnd = activeEl.selectionEnd;
            }
        }
    }
    if (!focusFieldId && lastFocusedField) {
        focusFieldId = lastFocusedField;
    }

    const sectionsState = { ...(value._sections || PORT_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-port-section]');
        for (const s of sections) {
            const secKey = s.dataset.portSection;
            const body = s.querySelector('[data-port-section-body]');
            if (body && secKey) {
                sectionsState[secKey] = (body.style.display === 'none');
            }
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderPortCard(value, onChange, { host: { ui: uiApi } }, null);

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
            const activeInEl = document.activeElement && el.contains(document.activeElement);
            if (activeInEl || lastFocusedField === focusFieldId) {
                targetEl.focus();
                try {
                    if (focusStart != null && targetEl.setSelectionRange) {
                        targetEl.setSelectionRange(focusStart, focusEnd);
                    }
                } catch (e) {}
            }
        }
    }
}