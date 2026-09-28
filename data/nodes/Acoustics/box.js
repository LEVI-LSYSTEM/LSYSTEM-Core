// data/nodes/Acoustics/box.js
// v13.1 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ ЯЩИКА
//
// Изменения v13.1 (относительно v13.0):
//   - УБРАНЫ стоячие волны (моды). Lumped-модель LEM не может корректно
//     описать моды на НЧ: последовательный L–C контур даёт паразитную
//     гибкость 1/(ω²·Ma_mode), которая на НЧ доминирует над Cbox и
//     разрушает всю картину.
//   - ОСТАВЛЕН заполнитель (R_fill + Ma_fill). Его эффект корректен.
//
// Архитектура:
//   - Отдаёт фрагмент с именованными портами (rear, port, out, gnd).
//   - rear = out = port — один и тот же внутренний объём камеры.
//   - Cbox + потери + заполнитель между rear и gnd.
//   - Порты port/out позволяют подключать внешнюю нагрузку
//     (порт/ПИ/другую камеру) к тому же объёму.

'use strict';

const BOX_UI_DEFAULT = {
    volume: 30,
    shape: 'box',
    dim_h: 400,
    dim_w: 300,
    dim_d: 250,
    fill: 0,
    fill_type: 'none',
    qa: 7.0,
    leak_q: 100,
    wall_thickness: 18,

    _user: { volume: true },
    _calc: { dim_h: true, dim_w: true, dim_d: true },
    _lastEdited: null,
    _version: 1,

    _sections: {
        volume: false,
        shape: false,
        fill: false,
        modes: false,
        advanced: true
    }
};

const FILL_K = {
    none: 0.0,
    polyfill: 0.7,
    fiberglass: 0.9,
    wool: 1.0
};

const FILL_MULT = {
    none: 1.00,
    polyfill: 1.15,
    fiberglass: 1.25,
    wool: 1.30
};

const SHAPE_LABEL = {
    box: 'коробка',
    cylinder: 'цилиндр',
    wedge: 'клин',
    custom: 'своя'
};

const GOLDEN_RATIO = { h: 1.0, w: 1.3, d: 1.6 };
const GAMMA_AIR = 1.4;
const RHO0 = 1.2041;
const C0   = 343.0;

function _dimsFromVolume(volume_L) {
    if (!(volume_L > 0)) return { h: 400, w: 300, d: 250 };
    const k = GOLDEN_RATIO;
    const s = Math.cbrt(volume_L * 1e6 / (k.h * k.w * k.d));
    return { h: Math.round(k.h * s), w: Math.round(k.w * s), d: Math.round(k.d * s) };
}

function _volumeFromDims(h, w, d) {
    const H = Number(h), W = Number(w), D = Number(d);
    if (!(H > 0) || !(W > 0) || !(D > 0)) return null;
    return H * W * D * 1e-6;
}

function _effectiveVolume(volume_L, fill_percent, fill_type) {
    const k_fill = FILL_K[fill_type] ?? 0;
    const fill_frac = Math.max(0, Math.min(100, Number(fill_percent) || 0)) / 100;
    const V = Number(volume_L) || 0;
    return V * (1 + (GAMMA_AIR - 1) * fill_frac * k_fill);
}

function _calcAll(ui) {
    const out = JSON.parse(JSON.stringify(ui));
    let _user = { ...(out._user || {}) };
    let _calc = { ...(out._calc || {}) };
    const edited = out._lastEdited;

    if (edited === 'volume') {
        const dims = _dimsFromVolume(out.volume);
        out.dim_h = dims.h; out.dim_w = dims.w; out.dim_d = dims.d;
        delete _user.dim_h; delete _user.dim_w; delete _user.dim_d;
        _calc.dim_h = true; _calc.dim_w = true; _calc.dim_d = true;
        _user.volume = true;
        delete _calc.volume;
    } else if (edited === 'dim_h' || edited === 'dim_w' || edited === 'dim_d') {
        const vol = _volumeFromDims(out.dim_h, out.dim_w, out.dim_d);
        if (vol != null) {
            out.volume = vol;
            delete _user.volume;
            _calc.volume = true;
            _user.dim_h = true; _user.dim_w = true; _user.dim_d = true;
            delete _calc.dim_h; delete _calc.dim_w; delete _calc.dim_d;
        }
    }

    out._user = _user;
    out._calc = _calc;
    return out;
}

function _standingWaves(h_mm, w_mm, d_mm) {
    const c = 343.0;
    const h = Number(h_mm) / 1000;
    const w = Number(w_mm) / 1000;
    const d = Number(d_mm) / 1000;
    return {
        f_h: h > 0 ? c / (2 * h) : null,
        f_w: w > 0 ? c / (2 * w) : null,
        f_d: d > 0 ? c / (2 * d) : null
    };
}

module.exports = {
    meta: { id: 'Acoustics.box', label: 'Box', icon: 'icon-box' },

    ports: {
        inputs: [
            { id: 'rear', label: 'Rear' },
            { id: 'port', label: 'Port' }
        ],
        outputs: [{ id: 'out', label: 'Out' }]
    },

    radiatingPorts: [],

    inputRules: {
        rear: ['speaker.js', 'port.js', 'passive_radiator.js', 'wall.js'],
        port: ['port.js', 'passive_radiator.js']
    },
    outputRules: {
        out: ['port.js', 'passive_radiator.js', 'LEMsolver.js', 'twqp.js', 'horn.js', 'tapped_horn.js', 'box.js']
    },

    maxInputs:  { rear: 1, port: 2 },
    maxOutputs: { out: 1 },

    params: [{
        id: 'box_ui',
        type: 'box_ui',
        label: 'Ящик',
        default: BOX_UI_DEFAULT,
        category: 'Ящик',
        _noCategoryHeader: true
    }],

    onParamChange(id, value, node) {
        if (id !== 'box_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(BOX_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...BOX_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;
        node.paramValues.box_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'box_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.box_ui && typeof p.box_ui === 'object') ? p.box_ui : BOX_UI_DEFAULT;

        const V_L    = Number(ui.volume);
        const fill   = Number(ui.fill) || 0;
        const fillType = ui.fill_type || 'none';
        const Qa_ref = Number(ui.qa) || 7.0;
        const leakQ  = Number(ui.leak_q) || 100;
        const wallT  = Number(ui.wall_thickness) || 18;

        if (!(V_L > 0))    throw new Error('Box: Volume > 0');
        if (!(Qa_ref > 0)) throw new Error('Box: Qa > 0');
        if (!(leakQ > 0))  throw new Error('Box: Leak Q > 0');

        const rho0 = RHO0, c0 = C0;

        const V_eff_L = _effectiveVolume(V_L, fill, fillType);
        const V_eff = V_eff_L / 1000;

        // Акустическая гибкость объёма
        const Cbox = V_eff / (rho0 * c0 * c0);

        // Потери в ящике
        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;

        // Площадь стенок
        let S_wall;
        const h_m = (Number(ui.dim_h) || 400) / 1000;
        const w_m = (Number(ui.dim_w) || 300) / 1000;
        const d_m = (Number(ui.dim_d) || 250) / 1000;

        if (ui.shape === 'cylinder') {
            const r = w_m / 2;
            S_wall = 2 * Math.PI * r * h_m + 2 * Math.PI * r * r;
        } else {
            S_wall = 2 * (h_m * w_m + h_m * d_m + w_m * d_m);
        }

        const R_total = Qa_ref / (w_ref * Cbox);

        const R_vis_base   = R_total / 0.60;
        const R_therm_base = R_total / 0.20;
        const R_leak_base  = R_total / 0.20;

        const S_ref = 0.5;
        const wallFactor = Math.sqrt(S_ref / Math.max(S_wall, 1e-6));

        const R_vis_ref   = R_vis_base   * wallFactor;
        const R_therm_ref = R_therm_base * wallFactor;

        const leakFactor = Math.max(0.01, leakQ / 100);
        const R_leak_ref = R_leak_base * leakFactor;

        // ═══════════════════════════════════════════════════════════
        // v13.1 — ЗАПОЛНИТЕЛЬ: R_fill + Ma_fill
        // ═══════════════════════════════════════════════════════════
        const fillFrac = Math.max(0, Math.min(1, (Number(ui.fill) || 0) / 100));
        const fillComponents = [];

        let R_fill_ref = 0, Ma_fill_ref = 0;
        if (fillFrac > 0.01) {
            const V_m3 = Math.max(V_eff, 1e-6);
            const V_ref = 0.02;
            R_fill_ref = 1e4 * fillFrac * Math.pow(V_ref / V_m3, 2/3);
            Ma_fill_ref = (rho0 * fillFrac) / Math.pow(V_m3, 2/3);

            fillComponents.push({
                id: 'R_fill', type: 'R_freq',
                from: 'rear', to: 'gnd',
                value: R_fill_ref,
                freqRef: 100, law: 'sqrt_omega'
            });
            fillComponents.push({
                id: 'Ma_fill', type: 'L',
                from: 'rear', to: 'gnd',
                value: Ma_fill_ref
            });
        }

        // === УЗЛЫ ФРАГМЕНТА ===
        const nodes = ['rear', 'port', 'out', 'gnd'];

        // === КОМПОНЕНТЫ ===
        const components = [
            { id: 'Cbox',   type: 'C', from: 'rear', to: 'gnd', value: Cbox },
            { id: 'R_vis',  type: 'R', from: 'rear', to: 'gnd', value: R_vis_ref },
            { id: 'R_th',   type: 'R', from: 'rear', to: 'gnd', value: R_therm_ref },
            { id: 'R_leak', type: 'R', from: 'rear', to: 'gnd', value: R_leak_ref },
            ...fillComponents
        ];

        // === ПОРТЫ ===
        const ports = {
            rear: 'rear',
            port: 'port',
            out: 'out',
            gnd: 'gnd'
        };

        // === СКЛЕЙКА УЗЛОВ ===
        const mergedPorts = [
            { a: 'rear', b: 'out'  },
            { a: 'rear', b: 'port' }
        ];

        return {
            kind: 'lem.fragment',
            source: 'box',
            nodes,
            components,
            ports,
            mergedPorts,
            meta: {
                label: `Box ${V_L} L`,
                volume_L: V_L,
                volume_eff_L: V_eff_L,
                volume_eff_m3: V_eff,
                fill_percent: fill,
                fill_type: fillType,
                fill_k: FILL_K[fillType] ?? 0,
                shape: ui.shape,
                dim_h: ui.dim_h, dim_w: ui.dim_w, dim_d: ui.dim_d,
                S_wall,
                Qa_ref, leak_q: leakQ,
                Cbox, R_total,
                R_vis_ref, R_therm_ref, R_leak_ref,
                f_ref,
                R_fill_ref,
                Ma_fill_ref
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'Box not connected' };
        }
        const ui = (ctx.params && ctx.params.box_ui) || {};
        if (!(Number(ui.volume) > 0)) {
            return { ready: false, reason: 'Box: Vb > 0 (required)' };
        }
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'box_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderBoxCard(value, onChange, ctx, node);
                },
                update(el, value) { _updateBoxCard(el, value); },
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

function _renderBoxCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(BOX_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...BOX_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'box-ui';
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
        if (node && node.paramValues && node.paramValues.box_ui) {
            if (!node.paramValues.box_ui._sections) node.paramValues.box_ui._sections = {};
            node.paramValues.box_ui._sections[key] = collapsed;
        }
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildVolumeSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildShapeSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildFillSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildModesSection(ui, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildAdvancedSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildActions(ui, onChange, uiApi));

    return wrap;
}

function _buildInfoBar(ui, uiApi) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(204,34,51,0.14) 0%,rgba(204,34,51,0.02) 100%);border-left:3px solid var(--accent-red,#cc2233);border-radius:0 8px 8px 0;width:100%;min-width:0;box-sizing:border-box;';

    const icon = _makeIcon(uiApi, 'icon-box', 20);
    icon.style.cssText += 'color:var(--accent-red,#cc2233);flex-shrink:0;';
    bar.appendChild(icon);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

    const line1 = document.createElement('div');
    line1.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary,#e0d8cc);letter-spacing:0.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
    const v = Number(ui.volume);
    const vLabel = Number.isFinite(v) && v > 0 ? `${v.toFixed(1)} L` : '— L';
    const fill = Number(ui.fill) || 0;
    const fillLabel = fill > 0 ? ` · fill ${fill}%` : '';
    line1.textContent = `Box ${vLabel}${fillLabel} · ${SHAPE_LABEL[ui.shape] || ui.shape}`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = "font-size:10px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:'Courier New',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
    const h = Number(ui.dim_h) || 0, w = Number(ui.dim_w) || 0, d = Number(ui.dim_d) || 0;
    line2.textContent = `${h}×${w}×${d} мм`;
    info.appendChild(line2);

    bar.appendChild(info);

    const missing = !(Number(ui.volume) > 0);
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:10px;font-weight:700;padding:4px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0;';
    if (missing) {
        statusEl.textContent = '⚠ объём';
        statusEl.style.background = 'rgba(200,184,154,0.15)';
        statusEl.style.color = 'var(--beige,#c8b89a)';
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

function _buildVolumeSection(ui, onChange, uiApi, toggleSection) {
    const key = 'volume';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Объём', 'icon-equalizer', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const isVolumeUser = !!(ui._user && ui._user.volume);
    const isVolumeCalc = !!(ui._calc && ui._calc.volume);
    const isVolumeMissing = !(Number(ui.volume) > 0);

    const vbRow = document.createElement('div');
    vbRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    const vbLabel = document.createElement('div');
    vbLabel.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:0.4px;color:var(--beige,#c8b89a);min-width:40px;flex-shrink:0;';
    vbLabel.textContent = 'Vb *';
    vbRow.appendChild(vbLabel);

    const vbInput = document.createElement('input');
    vbInput.type = 'number';
    vbInput.step = '0.1';
    vbInput.min = '0.1';
    vbInput.value = Number.isFinite(ui.volume) ? String(ui.volume) : '';
    vbInput.placeholder = 'обязательное';
    vbInput.dataset.fieldId = 'volume';
    vbInput.style.cssText = `flex:1 1 80px;min-width:0;padding:6px 10px;font-size:14px;font-weight:700;font-family:'Courier New',monospace;background:${isVolumeMissing ? 'rgba(200,184,154,0.08)' : (isVolumeCalc ? 'rgba(68,204,136,0.05)' : 'rgba(204,34,51,0.05)')};color:var(--text-primary,#e0d8cc);border:1px solid ${isVolumeMissing ? 'rgba(200,184,154,0.85)' : (isVolumeCalc ? 'rgba(68,204,136,0.45)' : 'rgba(204,34,51,0.45)')};border-radius:5px;outline:none;box-sizing:border-box;`;
    vbInput.addEventListener('change', () => {
        const raw = vbInput.value.trim();
        if (raw === '') return;
        const num = Number(raw);
        if (!isFinite(num) || num <= 0) return;
        const next = JSON.parse(JSON.stringify(ui));
        next.volume = num;
        next._user = { ...(next._user || {}), volume: true };
        if (next._calc) delete next._calc.volume;
        next._lastEdited = 'volume';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    vbInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') vbInput.blur(); });
    vbRow.appendChild(vbInput);

    const vbUnit = document.createElement('div');
    vbUnit.textContent = 'L';
    vbUnit.style.cssText = 'font-size:11px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:monospace;flex-shrink:0;';
    vbRow.appendChild(vbUnit);

    const vbDot = _makeStatusDot(isVolumeMissing, isVolumeUser, isVolumeCalc, true);
    vbRow.appendChild(vbDot);

    section.body.appendChild(vbRow);

    const dims = document.createElement('div');
    dims.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:8px 12px 10px;border-top:1px solid rgba(200,184,154,0.06);width:100%;box-sizing:border-box;';

    for (const f of [
        { id: 'dim_h', label: 'H', unit: 'мм' },
        { id: 'dim_w', label: 'W', unit: 'мм' },
        { id: 'dim_d', label: 'D', unit: 'мм' }
    ]) {
        dims.appendChild(_buildDimField(ui, f, onChange));
    }
    section.body.appendChild(dims);

    const vEff = _effectiveVolume(Number(ui.volume) || 0, ui.fill, ui.fill_type);
    const veffRow = document.createElement('div');
    veffRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 10px;font-size:10px;color:var(--text-muted,rgba(200,184,154,0.55));width:100%;box-sizing:border-box;';
    const veffLabel = document.createElement('span');
    veffLabel.textContent = 'V_eff (с заполнителем):';
    veffRow.appendChild(veffLabel);
    const veffValue = document.createElement('span');
    veffValue.textContent = `${vEff.toFixed(2)} L`;
    veffValue.style.cssText = `font-family:'Courier New',monospace;font-weight:700;flex-shrink:0;color:${Math.abs(vEff - (Number(ui.volume) || 0)) > 0.01 ? 'rgba(68,204,136,0.95)' : 'var(--text-secondary,#a09888)'};`;
    veffRow.appendChild(veffValue);
    section.body.appendChild(veffRow);

    return section.el;
}

function _buildDimField(ui, f, onChange) {
    const v = ui[f.id];
    const isUser = !!(ui._user && ui._user[f.id]);
    const isCalc = !!(ui._calc && ui._calc[f.id]);
    const isEmpty = (v == null || v === '' || !(Number(v) > 0));

    let borderColor, bgColor;
    if (isUser) { borderColor = 'rgba(204,34,51,0.4)'; bgColor = 'rgba(204,34,51,0.04)'; }
    else if (isCalc) { borderColor = 'rgba(68,204,136,0.4)'; bgColor = 'rgba(68,204,136,0.04)'; }
    else { borderColor = 'var(--border-color,rgba(200,184,154,0.10))'; bgColor = 'transparent'; }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;box-sizing:border-box;';

    const lbl = document.createElement('div');
    lbl.textContent = f.label;
    lbl.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-secondary,#a09888);letter-spacing:0.4px;';
    wrap.appendChild(lbl);

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;';

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '1';
    inp.value = isEmpty ? '' : String(Math.round(Number(v)));
    inp.dataset.fieldId = f.id;
    inp.style.cssText = `flex:1 1 0;min-width:0;width:100%;padding:4px 7px;font-size:11px;font-family:'Courier New',monospace;font-weight:600;background:${bgColor};color:var(--text-primary,#e0d8cc);border:1px solid ${borderColor};border-radius:4px;outline:none;box-sizing:border-box;`;
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
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inputWrap.appendChild(inp);

    const unit = document.createElement('span');
    unit.textContent = f.unit;
    unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;flex-shrink:0;';
    inputWrap.appendChild(unit);

    wrap.appendChild(inputWrap);
    return wrap;
}

function _buildShapeSection(ui, onChange, uiApi, toggleSection) {
    const key = 'shape';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Форма', 'icon-box', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    for (const s of [
        { id: 'box', label: 'Коробка', icon: '▭' },
        { id: 'cylinder', label: 'Цилиндр', icon: '◯' },
        { id: 'wedge', label: 'Клин', icon: '◺' },
        { id: 'custom', label: 'Своя', icon: '⚙' }
    ]) {
        const isActive = ui.shape === s.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = s.icon + ' ' + s.label;
        btn.style.cssText = `padding:5px 10px;font-size:10px;font-weight:600;font-family:inherit;border-radius:5px;border:1px solid ${isActive ? 'var(--accent-red,#cc2233)' : 'var(--border-color,rgba(200,184,154,0.15))'};background:${isActive ? 'rgba(204,34,51,0.18)' : 'transparent'};color:${isActive ? 'var(--text-primary,#e0d8cc)' : 'var(--text-secondary,#a09888)'};cursor:pointer;`;
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const next = JSON.parse(JSON.stringify(ui));
            next.shape = s.id;
            next._lastEdited = 'shape';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }
    section.body.appendChild(row);
    return section.el;
}

function _buildFillSection(ui, onChange, uiApi, toggleSection) {
    const key = 'fill';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Заполнитель', 'icon-wave', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const fill = Number(ui.fill) || 0;
    const fillType = ui.fill_type || 'none';

    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px 4px;width:100%;box-sizing:border-box;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.value = String(fill);
    slider.style.cssText = 'flex:1 1 0;min-width:0;accent-color:var(--accent-red,#cc2233);cursor:pointer;';
    slider.addEventListener('input', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next.fill = Number(slider.value);
        next._lastEdited = 'fill';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    });
    sliderRow.appendChild(slider);

    const sliderVal = document.createElement('div');
    sliderVal.textContent = fill + '%';
    sliderVal.style.cssText = "min-width:42px;text-align:right;font-size:11px;font-weight:700;font-family:'Courier New',monospace;color:var(--text-primary,#e0d8cc);flex-shrink:0;";
    sliderRow.appendChild(sliderVal);
    section.body.appendChild(sliderRow);

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:4px;padding:4px 12px 10px;flex-wrap:wrap;width:100%;box-sizing:border-box;';
    for (const t of [
        { id: 'none', label: 'нет' },
        { id: 'polyfill', label: 'polyfill' },
        { id: 'fiberglass', label: 'fiberglass' },
        { id: 'wool', label: 'wool' }
    ]) {
        const isActive = fillType === t.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t.label;
        btn.style.cssText = `padding:4px 9px;font-size:9px;font-weight:600;font-family:inherit;border-radius:4px;border:1px solid ${isActive ? 'var(--accent-red,#cc2233)' : 'var(--border-color,rgba(200,184,154,0.15))'};background:${isActive ? 'rgba(204,34,51,0.15)' : 'transparent'};color:${isActive ? 'var(--text-primary,#e0d8cc)' : 'var(--text-muted,rgba(200,184,154,0.6))'};cursor:pointer;box-sizing:border-box;`;
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const next = JSON.parse(JSON.stringify(ui));
            next.fill_type = t.id;
            next._lastEdited = 'fill_type';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        typeRow.appendChild(btn);
    }
    section.body.appendChild(typeRow);
    return section.el;
}

function _buildModesSection(ui, uiApi, toggleSection) {
    const key = 'modes';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Стоячие волны', 'icon-frequency', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const h = Number(ui.dim_h) || 0, w = Number(ui.dim_w) || 0, d = Number(ui.dim_d) || 0;
    const modes = _standingWaves(h, w, d);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px;width:100%;box-sizing:border-box;';

    for (const [label, freq, dim] of [['H', modes.f_h, h], ['W', modes.f_w, w], ['D', modes.f_d, d]]) {
        const cell = document.createElement('div');
        cell.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:6px 8px;background:rgba(200,184,154,0.03);border:1px solid rgba(200,184,154,0.08);border-radius:5px;text-align:center;min-width:0;box-sizing:border-box;';
        const l = document.createElement('div');
        l.textContent = label + ' (' + Math.round(dim) + ' мм)';
        l.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.55));text-transform:uppercase;letter-spacing:0.4px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        cell.appendChild(l);
        const f = document.createElement('div');
        f.textContent = (freq != null && isFinite(freq)) ? (Math.round(freq) + ' Hz') : '—';
        f.style.cssText = "font-size:13px;font-weight:700;font-family:'Courier New',monospace;color:var(--text-primary,#e0d8cc);";
        cell.appendChild(f);
        grid.appendChild(cell);
    }
    section.body.appendChild(grid);

    const hint = document.createElement('div');
    hint.textContent = 'Справочно. В LEM-модели не учитываются.';
    hint.style.cssText = 'padding:6px 12px 8px;font-size:9px;color:var(--text-muted,rgba(200,184,154,0.5));font-style:italic;width:100%;box-sizing:border-box;';
    section.body.appendChild(hint);

    return section.el;
}

function _buildAdvancedSection(ui, onChange, uiApi, toggleSection) {
    const key = 'advanced';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Дополнительно', 'icon-settings', uiApi, {
        collapsible: true, collapsed, sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:0;width:100%;box-sizing:border-box;';

    for (const f of [
        { id: 'qa', label: 'Qa', unit: '', step: 0.1, hint: 'Опорная добротность потерь (f_ref=100 Гц)' },
        { id: 'leak_q', label: 'Leak Q', unit: '', step: 1, hint: 'Качество герметизации: больше = плотнее' },
        { id: 'wall_thickness', label: 'Толщина', unit: 'мм', step: 1, hint: 'Толщина стенки ящика' }
    ]) {
        row.appendChild(_buildAdvancedField(ui, f, onChange));
    }

    section.body.appendChild(row);
    return section.el;
}

function _buildAdvancedField(ui, f, onChange) {
    const v = ui[f.id];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 12px;width:100%;box-sizing:border-box;';

    const lbl = document.createElement('div');
    lbl.textContent = f.label;
    lbl.title = f.hint || '';
    lbl.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-secondary,#a09888);text-align:right;cursor:help;width:64px;flex-shrink:0;';
    row.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(f.step);
    inp.value = v == null ? '' : String(v);
    inp.dataset.fieldId = f.id;
    inp.title = f.hint || '';
    inp.style.cssText = 'flex:1 1 0;min-width:0;width:100%;padding:4px 8px;font-size:11px;font-family:"Courier New",monospace;background:transparent;color:var(--text-primary,#e0d8cc);border:1px solid var(--border-color,rgba(200,184,154,0.10));border-radius:4px;outline:none;box-sizing:border-box;';
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
    row.style.cssText = 'display:flex;gap:8px;padding:4px 0 0;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    const mkBtn = (label, iconId, onClick, variant = 'default') => {
        const b = document.createElement('button');
        b.type = 'button';
        const isPrimary = variant === 'primary';
        const isDanger = variant === 'danger';
        b.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:11px;font-weight:600;font-family:inherit;border-radius:6px;cursor:pointer;border:1px solid ${isPrimary ? 'var(--accent-red,#cc2233)' : isDanger ? 'rgba(204,34,51,0.5)' : 'var(--border-color,rgba(200,184,154,0.2))'};background:${isPrimary ? 'var(--accent-red,#cc2233)' : 'transparent'};color:${isPrimary ? '#fff' : isDanger ? 'var(--accent-red,#cc2233)' : 'var(--text-secondary,#a09888)'};box-sizing:border-box;`;
        if (iconId) { const ic = _makeIcon(uiApi, iconId, 12); ic.style.color = 'currentColor'; b.appendChild(ic); }
        const span = document.createElement('span');
        span.textContent = label;
        b.appendChild(span);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return b;
    };

    row.appendChild(mkBtn('Из размеров', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(ui));
        const h = Number(next.dim_h), w = Number(next.dim_w), d = Number(next.dim_d);
        if (!(h > 0) || !(w > 0) || !(d > 0)) {
            const dims = _dimsFromVolume(next.volume || 30);
            next.dim_h = dims.h; next.dim_w = dims.w; next.dim_d = dims.d;
        }
        next._user = { ...(next._user || {}) };
        delete next._user.volume;
        next._user.dim_h = true; next._user.dim_w = true; next._user.dim_d = true;
        next._lastEdited = 'dim_h';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }));

    row.appendChild(mkBtn('Из объёма', 'icon-refresh', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next._user = { ...(next._user || {}) };
        next._user.volume = true;
        delete next._user.dim_h; delete next._user.dim_w; delete next._user.dim_d;
        if (next._calc) delete next._calc.volume;
        next._lastEdited = 'volume';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }, 'primary'));

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        onChange(JSON.parse(JSON.stringify(BOX_UI_DEFAULT)));
    }, 'danger'));

    return row;
}

function _makeSection(title, iconId, uiApi, opts = {}) {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;background:var(--bg-card,#1f1f1f);border:1px solid var(--border-color,rgba(200,184,154,0.10));border-radius:8px;overflow:hidden;width:100%;min-width:0;box-sizing:border-box;';
    if (opts.sectionKey) section.dataset.boxSection = opts.sectionKey;

    const head = document.createElement('button');
    head.type = 'button';
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(200,184,154,0.05);border:none;border-bottom:1px solid var(--border-color,rgba(200,184,154,0.08));font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-secondary,#a09888);user-select:none;font-family:inherit;text-align:left;width:100%;box-sizing:border-box;cursor:pointer;';

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
    if (opts.sectionKey) body.dataset.boxSectionBody = '1';
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

    return { el: section, body, head };
}

function _makeStatusDot(isMissing, isUser, isCalc, isRequired) {
    const dot = document.createElement('div');
    let bg, border, shadow;
    if (isRequired && isMissing) {
        bg = 'rgba(200,184,154,0.35)'; border = 'rgba(200,184,154,0.9)'; shadow = '0 0 6px rgba(200,184,154,0.35)';
    } else if (isUser) {
        bg = 'rgba(204,34,51,0.9)'; border = 'transparent'; shadow = '0 0 6px rgba(204,34,51,0.5)';
    } else if (isCalc) {
        bg = 'rgba(68,204,136,0.9)'; border = 'transparent'; shadow = '0 0 6px rgba(68,204,136,0.5)';
    } else {
        bg = 'transparent'; border = 'rgba(200,184,154,0.3)'; shadow = 'none';
    }
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${bg};border:1px solid ${border};box-shadow:${shadow};box-sizing:border-box;flex-shrink:0;`;
    return dot;
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

function _updateBoxCard(el, value) {
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

    const onChange = target.__onChange;
    const uiApi = target.__uiApi;
    const lastFocusedField = target.__lastFocusedField;
    if (!onChange) return;

    const activeEl = document.activeElement;
    let focusFieldId = null, focusStart = null, focusEnd = null;
    if (activeEl && el.contains(activeEl) && activeEl.dataset && activeEl.dataset.fieldId) {
        focusFieldId = activeEl.dataset.fieldId;
        if (activeEl.selectionStart != null) {
            focusStart = activeEl.selectionStart;
            focusEnd = activeEl.selectionEnd;
        }
    }
    if (!focusFieldId && lastFocusedField) focusFieldId = lastFocusedField;

    const sectionsState = { ...(value._sections || BOX_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-box-section]');
        for (const s of sections) {
            const secKey = s.dataset.boxSection;
            const body = s.querySelector('[data-box-section-body]');
            if (body && secKey) sectionsState[secKey] = (body.style.display === 'none');
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderBoxCard(value, onChange, { host: { ui: uiApi } }, null);
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