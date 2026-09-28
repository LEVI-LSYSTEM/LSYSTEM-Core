// data/nodes/Acoustics/passive_radiator.js
// v9.0 — УНИВЕРСАЛЬНЫЙ LEM-ФРАГМЕНТ ПИ
//
// Изменения v9.0:
//   - radiatingPorts декларативный: [{ port:'out', emit:{...} }].
//   - emit: from='rear', to='m1', sign=−1 (согласовано с speaker.js/port.js).
//   - Топология: rear --Ma--> m1 --Ra--> m2 --Ca--> gnd;  m2 --Ra_rad_ext--> out.
//   - Cms с учётом M_air (Fp даташита).

'use strict';

const PR_UI_DEFAULT = {
    diameter: 200,
    xmax: 15,
    fp: 35,
    mms: 35,
    cms: null,
    rms: 1.0,
    d_port: 0.10,

    _user: { diameter: true, xmax: true, fp: true, mms: true },
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: {
        geometry: false,
        tuning: false,
        matching: false,
        advanced: true
    }
};

const RHO0 = 1.2041;
const C0   = 343.0;

function _areaFromD(d_mm) {
    const d = Number(d_mm) / 1000;
    if (!(d > 0)) return 0;
    return Math.PI * d * d / 4;
}

function _airAddedMass(Sd_m2) {
    if (!(Sd_m2 > 0)) return 0;
    const a = Math.sqrt(Sd_m2 / Math.PI);
    return RHO0 * (8 / 3) * a * a * a;
}

function _cmsFromFpMmsTotal(fp, mms_total_kg) {
    if (!(fp > 0) || !(mms_total_kg > 0)) return 0;
    return 1 / (Math.pow(2 * Math.PI * fp, 2) * mms_total_kg);
}

function _fpFromCmsMmsTotal(cms_m_per_N, mms_total_kg) {
    if (!(cms_m_per_N > 0) || !(mms_total_kg > 0)) return 0;
    return 1 / (2 * Math.PI * Math.sqrt(mms_total_kg * cms_m_per_N));
}

function _vdFromSdXmax(Sd_m2, xmax_mm) {
    if (!(Sd_m2 > 0) || !(xmax_mm > 0)) return 0;
    return Sd_m2 * (xmax_mm / 1000);
}

function _findSpeakerInGraph(ctx, selfNodeId) {
    if (!ctx || !ctx.graph || !selfNodeId) return null;
    const g = ctx.graph;
    if (!g.connections || !g.nodes) return null;

    for (const conn of g.connections) {
        if (String(conn.toNodeId) !== String(selfNodeId)) continue;
        const up = g.getNode ? g.getNode(conn.fromNodeId) : null;
        if (up && up.def && up.def.file === 'speaker.js') return up;
        if (up && up.def && up.def.file === 'box.js') {
            for (const c2 of g.connections) {
                if (String(c2.toNodeId) !== String(up.id)) continue;
                const up2 = g.getNode ? g.getNode(c2.fromNodeId) : null;
                if (up2 && up2.def && up2.def.file === 'speaker.js') return up2;
            }
        }
    }

    for (const n of g.nodes) {
        if (n.def && n.def.file === 'speaker.js') return n;
    }
    return null;
}

function _getVdDriver(speakerNode) {
    if (!speakerNode || !speakerNode.paramValues) return null;
    const ui = speakerNode.paramValues.driver_ui;
    if (!ui || typeof ui !== 'object') return null;
    const Sd_cm2 = Number(ui.sd);
    const xmax = Number(ui.xmax);
    if (!(Sd_cm2 > 0) || !(xmax > 0)) return null;
    const Sd_m2 = Sd_cm2 * 1e-4;
    return Sd_m2 * (xmax / 1000);
}

function _calcAll(ui) {
    const out = JSON.parse(JSON.stringify(ui));
    const _calc = { ...(out._calc || {}) };

    if (!(out.diameter > 0)) out.diameter = 200;
    if (!(out.xmax > 0)) out.xmax = 15;
    if (!(out.fp > 0)) out.fp = 35;
    if (!(out.mms > 0)) out.mms = 35;
    if (!(out.rms > 0)) out.rms = 1.0;

    const Sd = _areaFromD(out.diameter);
    const M_air = _airAddedMass(Sd);
    const mms_total_kg = out.mms / 1000 + M_air;

    if (out._lastEdited === 'fp' || out._lastEdited === 'mms' ||
        out._lastEdited === 'diameter' || out.cms == null) {
        const cms_m_per_N = _cmsFromFpMmsTotal(out.fp, mms_total_kg);
        out.cms = cms_m_per_N * 1000;
        _calc.cms = true;
    }

    if (out._lastEdited === 'cms' && out.cms > 0) {
        const cms_m_per_N = out.cms / 1000;
        out.fp = _fpFromCmsMmsTotal(cms_m_per_N, mms_total_kg);
        _calc.fp = true;
    }

    out._calc = _calc;
    return out;
}

module.exports = {
    meta: {
        id: 'Acoustics.passive_radiator',
        label: 'Passive Radiator',
        icon: 'icon-passive-radiator'
    },

    ports: {
        inputs:  [{ id: 'rear', label: 'Rear' }],
        outputs: [{ id: 'out',  label: 'Out'  }]
    },

    inputRules:  { rear: ['box.js', 'port.js'] },
    outputRules: { out:  ['port.js', 'LEMsolver.js'] },

    maxInputs:  { rear: 1 },
    maxOutputs: { out:  1 },

    params: [
        {
            id: 'pr_ui',
            type: 'pr_ui',
            label: 'Пассивный радиатор',
            default: PR_UI_DEFAULT,
            category: 'PR',
            _noCategoryHeader: true
        }
    ],

    onParamChange(id, value, node) {
        if (id !== 'pr_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(PR_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...PR_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;

        node.paramValues.pr_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'pr_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.pr_ui && typeof p.pr_ui === 'object') ? p.pr_ui : PR_UI_DEFAULT;

        const D_mm     = Number(ui.diameter);
        const Mms_user = Number(ui.mms) * 1e-3;
        const Rms      = Number(ui.rms);
        const xmax     = Number(ui.xmax);
        const fp       = Number(ui.fp);
        const dPort    = Math.max(0, Number(ui.d_port) || 0.10);

        if (!(D_mm > 0))     throw new Error('PR: diameter > 0');
        if (!(Mms_user > 0)) throw new Error('PR: Mms > 0');
        if (!(Rms > 0))      throw new Error('PR: Rms > 0');
        if (!(xmax > 0))     throw new Error('PR: Xmax > 0');
        if (!(fp > 0))       throw new Error('PR: Fp > 0');

        const D = D_mm / 1000;
        const Sd = Math.PI * D * D / 4;
        const Sd2 = Sd * Sd;
        const a_eq = Math.sqrt(Sd / Math.PI);

        const M_air = _airAddedMass(Sd);
        const Mms_total = Mms_user + M_air;

        const Cms = _cmsFromFpMmsTotal(fp, Mms_total);

        const Ma = Mms_total / Sd2;
        const Ra = Rms / Sd2;
        const Ca = Cms * Sd2;

        const fp_check = _fpFromCmsMmsTotal(Cms, Mms_total);
        const w_fp = 2 * Math.PI * fp;
        const Q_pr = (w_fp * Ma) / Ra;

        const Vd_m3 = _vdFromSdXmax(Sd, xmax);

        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;
        const R_rad_ref = (RHO0 * w_ref * w_ref * Sd2) / (2 * Math.PI * C0);
        const R_rad_at_fp = R_rad_ref * Math.pow(w_fp / w_ref, 2);

        // ═══════════════════════════════════════════════════════════
        // ТОПОЛОГИЯ:
        //   rear --Ma--> m1 --Ra--> m2 --Ca--> gnd
        //                                    |
        //                                Ra_rad_ext --> out
        // ═══════════════════════════════════════════════════════════

        const nodes = ['rear', 'm1', 'm2', 'out', 'gnd'];

        const components = [
            { id: 'Ma', type: 'L', from: 'rear', to: 'm1', value: Ma },
            { id: 'Ra', type: 'R', from: 'm1',   to: 'm2', value: Ra },
            { id: 'Ca', type: 'C', from: 'm2',   to: 'gnd', value: Ca },
            {
                id: 'Ra_rad_ext',
                type: 'R_freq',
                from: 'm2', to: 'out',
                value: R_rad_ref,
                freqRef: 100,
                law: 'rad_plateau',
                radiationRadius_m: a_eq
            }
        ];

        const ports = { rear: 'rear', out: 'out', gnd: 'gnd' };

        const mergedPorts = [
            { a: 'out', b: 'gnd' }
        ];

        // ─── ДЕКЛАРАТИВНОЕ ИЗЛУЧЕНИЕ ───
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
                        value: Ma
                    }
                }
            }
        ];

        return {
            kind: 'lem.fragment',
            source: 'passive_radiator',
            nodes,
            components,
            ports,
            mergedPorts,
            radiatingPorts,
            meta: {
                label: `PR Ø${D_mm} мм · Fp ${fp.toFixed(1)} Hz`,
                diameter_mm: D_mm,
                d_port_m: dPort,
                Sd_m2: Sd,
                a_eq_m: a_eq,
                Mms_user_kg: Mms_user,
                M_air_kg: M_air,
                Mms_total_kg: Mms_total,
                Cms_m_per_N: Cms,
                Rms_kg_per_s: Rms,
                xmax_mm: xmax,
                Ma, Ra, Ca,
                fp_Hz: fp,
                fp_check_Hz: fp_check,
                Q_pr,
                Vd_m3,
                R_rad_ref,
                R_rad_at_fp,
                f_ref,
                emitter_type: 'pr_through_Ma',
                topology: 'rear-Ma-m1-Ra-m2-Ca-gnd / m2-Ra_rad_ext-out'
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'PR not connected' };
        }
        const ui = (ctx.params && ctx.params.pr_ui) || {};
        if (!(Number(ui.diameter) > 0)) return { ready: false, reason: 'PR: Ø > 0' };
        if (!(Number(ui.fp) > 0))       return { ready: false, reason: 'PR: Fp > 0' };
        if (!(Number(ui.mms) > 0))      return { ready: false, reason: 'PR: Mms > 0' };
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'pr_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderPRCard(value, onChange, ctx, node);
                },
                update(el, value) {
                    _updatePRCard(el, value);
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
// UI — сохранён из v8.0
// ============================================================

function _renderPRCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(PR_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...PR_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'pr-ui';
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
        if (node && node.paramValues && node.paramValues.pr_ui) {
            if (!node.paramValues.pr_ui._sections) node.paramValues.pr_ui._sections = {};
            node.paramValues.pr_ui._sections[key] = collapsed;
        }
    };

    const Sd_pr_m2 = _areaFromD(ui.diameter);
    const Vd_pr_m3 = _vdFromSdXmax(Sd_pr_m2, ui.xmax);

    const speakerNode = _findSpeakerInGraph(ctx, node ? node.id : null);
    const Vd_drv_m3 = speakerNode ? _getVdDriver(speakerNode) : null;

    wrap.appendChild(_buildInfoBar(ui, uiApi, Vd_pr_m3, Vd_drv_m3));
    wrap.appendChild(_buildGeometrySection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildTuningSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildMatchingSection(ui, uiApi, Vd_pr_m3, Vd_drv_m3, toggleSectionLocal));
    wrap.appendChild(_buildAdvancedSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildActions(ui, onChange, uiApi));

    return wrap;
}

function _buildInfoBar(ui, uiApi, Vd_pr_m3, Vd_drv_m3) {
    const bar = document.createElement('div');
    bar.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        background: linear-gradient(90deg, rgba(204,34,51,0.14) 0%, rgba(204,34,51,0.02) 100%);
        border-left: 3px solid var(--accent-red, #cc2233);
        border-radius: 0 8px 8px 0;
        width: 100%; min-width: 0; box-sizing: border-box;
    `;

    const icon = _makeIcon(uiApi, 'icon-passive-radiator', 20);
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
    const D = Number(ui.diameter) || 0;
    const fp = Number(ui.fp) || 0;
    line1.textContent = `PR Ø${D} мм · Fp ${fp.toFixed(1)} Hz`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = `
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-family: 'Courier New', monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const Vd_pr_cm3 = Vd_pr_m3 * 1e6;
    let vdText = `Vd ${Vd_pr_cm3.toFixed(0)} см³`;
    if (Vd_drv_m3 != null) {
        const Vd_drv_cm3 = Vd_drv_m3 * 1e6;
        const ok = Vd_pr_cm3 >= Vd_drv_cm3 * 1.1;
        vdText += ` · драйвер ${Vd_drv_cm3.toFixed(0)} см³ ${ok ? '✓' : '⚠'}`;
    }
    line2.textContent = vdText;
    info.appendChild(line2);

    bar.appendChild(info);

    const missing = !(D > 0) || !(Number(ui.fp) > 0) || !(Number(ui.mms) > 0);
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

function _buildGeometrySection(ui, onChange, uiApi, toggleSection) {
    const key = 'geometry';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Геометрия', 'icon-passive-radiator', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 10px; padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;
    grid.appendChild(_buildDimField(ui, {
        id: 'diameter', label: 'Ø *', unit: 'мм', step: 1, required: true,
        hint: 'Диаметр пассивного радиатора'
    }, onChange));
    grid.appendChild(_buildDimField(ui, {
        id: 'xmax', label: 'Xmax *', unit: 'мм', step: 1, required: true,
        hint: 'Максимальное линейное смещение'
    }, onChange));
    section.body.appendChild(grid);

    const Sd = _areaFromD(ui.diameter);
    const Vd_cm3 = _vdFromSdXmax(Sd, ui.xmax) * 1e6;
    const a_eq = Sd > 0 ? Math.sqrt(Sd / Math.PI) : 0;
    const M_air_g = _airAddedMass(Sd) * 1000;

    const infoGrid = document.createElement('div');
    infoGrid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 8px; padding: 4px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;
    infoGrid.appendChild(_makeStat('Sd', (Sd * 10000).toFixed(1) + ' см²', 'calc'));
    infoGrid.appendChild(_makeStat('Vd', Vd_cm3.toFixed(0) + ' см³', 'calc'));
    infoGrid.appendChild(_makeStat('a_eq', (a_eq * 1000).toFixed(1) + ' мм', 'calc'));
    infoGrid.appendChild(_makeStat('M_air', M_air_g.toFixed(2) + ' г', 'calc'));
    section.body.appendChild(infoGrid);

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

function _buildTuningSection(ui, onChange, uiApi, toggleSection) {
    const key = 'tuning';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Настройка', 'icon-frequency', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 10px; padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;
    grid.appendChild(_buildDimField(ui, {
        id: 'fp', label: 'Fp *', unit: 'Hz', step: 0.5, required: true,
        hint: 'Резонанс PR в свободном поле (с воздухом)'
    }, onChange));
    grid.appendChild(_buildDimField(ui, {
        id: 'mms', label: 'Mms *', unit: 'г', step: 1, required: true,
        hint: 'Масса подвижной системы PR (без воздуха)'
    }, onChange));
    section.body.appendChild(grid);

    const Sd = _areaFromD(ui.diameter);
    const M_air_g = _airAddedMass(Sd) * 1000;
    const Mms_total_g = (Number(ui.mms) || 35) + M_air_g;

    const infoGrid = document.createElement('div');
    infoGrid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 8px; padding: 4px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;
    infoGrid.appendChild(_makeStat('M_air', M_air_g.toFixed(2) + ' г', 'calc'));
    infoGrid.appendChild(_makeStat('Mms total', Mms_total_g.toFixed(2) + ' г', 'calc'));
    section.body.appendChild(infoGrid);

    const mms_total_kg = Mms_total_g / 1000;
    const cms_m_per_N = _cmsFromFpMmsTotal(Number(ui.fp) || 35, mms_total_kg);
    const cms_mm_per_N = cms_m_per_N * 1000;
    const rms = Number(ui.rms) || 1.0;

    const cmsRow = document.createElement('div');
    cmsRow.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 8px; padding: 4px 12px 10px;
        width: 100%; box-sizing: border-box;
    `;
    cmsRow.appendChild(_makeStat('Cms', cms_mm_per_N.toFixed(3) + ' мм/Н', 'calc'));
    cmsRow.appendChild(_makeStat('Rms', rms.toFixed(2) + ' кг/с', 'user'));
    section.body.appendChild(cmsRow);

    const Ma = mms_total_kg / Math.pow(Sd, 2);
    const Ra = rms / Math.pow(Sd, 2);
    const Q_pr = (2 * Math.PI * (Number(ui.fp) || 35) * Ma) / Math.max(Ra, 1e-12);

    const qRow = document.createElement('div');
    qRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 6px 12px 10px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.55));
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;
    const qLbl = document.createElement('span');
    qLbl.textContent = 'Q_pr:';
    qLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    qRow.appendChild(qLbl);
    const qVal = document.createElement('span');
    qVal.textContent = isFinite(Q_pr) ? Q_pr.toFixed(2) : '—';
    qVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    qRow.appendChild(qVal);
    section.body.appendChild(qRow);

    return section.el;
}

function _makeStat(label, value, kind) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
        display: flex; flex-direction: column; gap: 2px;
        padding: 6px 8px;
        background: rgba(200,184,154,0.03);
        border: 1px solid rgba(200,184,154,0.08);
        border-radius: 5px;
        min-width: 0; box-sizing: border-box;
    `;
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = `
        font-size: 9px; font-weight: 600;
        color: var(--text-muted, rgba(200,184,154,0.55));
        text-transform: uppercase; letter-spacing: 0.4px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    `;
    wrap.appendChild(l);

    const v = document.createElement('div');
    v.textContent = value;
    const color = kind === 'calc'
        ? 'rgba(68,204,136,0.95)'
        : 'var(--text-primary, #e0d8cc)';
    v.style.cssText = `
        font-size: 12px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: ${color};
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    `;
    wrap.appendChild(v);
    return wrap;
}

function _buildMatchingSection(ui, uiApi, Vd_pr_m3, Vd_drv_m3, toggleSection) {
    const key = 'matching';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Согласование Vd', 'icon-calculate', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const Vd_pr_cm3 = Vd_pr_m3 * 1e6;
    section.body.appendChild(_makeMatchingRow('Vd_pr:', `${Vd_pr_cm3.toFixed(0)} см³`, 'neutral'));

    if (Vd_drv_m3 != null) {
        const Vd_drv_cm3 = Vd_drv_m3 * 1e6;
        const ratio = Vd_pr_cm3 / Math.max(Vd_drv_cm3, 1e-9);
        let tone = 'ok';
        let note = '✓ достаточно';
        if (ratio < 1.0) { tone = 'err'; note = '⚠ маловат'; }
        else if (ratio < 1.1) { tone = 'warn'; note = '▲ на пределе'; }

        section.body.appendChild(_makeMatchingRow('Vd_driver:', `${Vd_drv_cm3.toFixed(0)} см³`, 'neutral'));
        section.body.appendChild(_makeMatchingRow('Отношение:', `${ratio.toFixed(2)}×  ${note}`, tone));
    } else {
        const empty = document.createElement('div');
        empty.textContent = 'Speaker не подключён — сравнение недоступно';
        empty.style.cssText = `
            padding: 8px 12px 10px;
            font-size: 10px;
            color: var(--text-muted, rgba(200,184,154,0.5));
            font-style: italic;
            width: 100%; box-sizing: border-box;
        `;
        section.body.appendChild(empty);
    }

    return section.el;
}

function _makeMatchingRow(label, value, tone) {
    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 5px 12px;
        width: 100%; box-sizing: border-box;
    `;

    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'font-size: 10px; color: var(--text-secondary, #a09888); min-width:0;overflow:hidden;text-overflow:ellipsis;';
    row.appendChild(l);

    const v = document.createElement('span');
    v.textContent = value;
    const color = tone === 'err' ? 'rgba(220,80,80,0.95)'
        : tone === 'warn' ? 'rgba(255,170,51,0.95)'
        : tone === 'ok' ? 'rgba(68,204,136,0.95)'
        : 'var(--text-primary, #e0d8cc)';
    v.style.cssText = `
        font-size: 11px; font-weight: 700;
        font-family: 'Courier New', monospace;
        color: ${color};
        flex-shrink: 0;
    `;
    row.appendChild(v);

    return row;
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
        id: 'rms', label: 'Rms', unit: 'кг/с',
        step: 0.1, min: 0.01, max: 100,
        hint: 'Механическое сопротивление (потери)'
    }, onChange));

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'cms', label: 'Cms', unit: 'мм/Н',
        step: 0.01, min: 0.01, max: 100,
        hint: 'Гибкость подвеса (если введено — пересчёт Fp)'
    }, onChange));

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'd_port', label: 'До динам.', unit: 'м',
        step: 0.01, min: 0, max: 5,
        hint: 'Расстояние от динамика до PR'
    }, onChange));

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

    row.appendChild(mkBtn('Из Q', 'icon-calculate', () => {
        const D = Number(ui.diameter) / 1000;
        const Sd = Math.PI * D * D / 4;
        if (!(Sd > 0)) return;
        const a_eq = Math.sqrt(Sd / Math.PI);
        const M_air = RHO0 * (8 / 3) * a_eq * a_eq * a_eq;
        const Mms_total = (Number(ui.mms) || 35) / 1000 + M_air;
        const fp = Number(ui.fp) || 35;
        if (!(fp > 0) || !(Mms_total > 0)) return;

        const w_fp = 2 * Math.PI * fp;
        const Ma = Mms_total / (Sd * Sd);
        const Q_target = 3.0;
        const Ra = (w_fp * Ma) / Q_target;
        const Rms = Ra * Sd * Sd;

        const next = JSON.parse(JSON.stringify(ui));
        next.rms = Number(Rms.toFixed(3));
        next._user = { ...(next._user || {}), rms: true };
        next._lastEdited = 'rms';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }, 'primary'));

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        const fresh = JSON.parse(JSON.stringify(PR_UI_DEFAULT));
        fresh._sections = ui._sections;
        onChange(fresh);
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
    if (opts.sectionKey) {
        section.dataset.prSection = opts.sectionKey;
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
        body.dataset.prSectionBody = '1';
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

function _updatePRCard(el, value) {
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
        console.warn('[pr] _updatePRCard: no onChange found');
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

    const sectionsState = { ...(value._sections || PR_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-pr-section]');
        for (const s of sections) {
            const secKey = s.dataset.prSection;
            const body = s.querySelector('[data-pr-section-body]');
            if (body && secKey) {
                sectionsState[secKey] = (body.style.display === 'none');
            }
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderPRCard(value, onChange, { host: { ui: uiApi } }, null);

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