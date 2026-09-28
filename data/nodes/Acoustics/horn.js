// data/nodes/Acoustics/horn.js
// v8.1 (NodeGraph 6.1.0) — UserFriendly horn_ui + декларативное излучение
//
// ИЗМЕНЕНИЯ v8.1 (багфикс):
//   1. _calcAll: m_flare === 0 теперь тоже пересчитывается из fc
//      (раньше 0 считался "заданным" и не обновлялся).
//   2. _profileS: при m_flare = 0 используется m = 4π·fc/c,
//      а НЕ геометрический ln(S_m/S_t)/L. Это устраняет расхождение
//      между "проектной" fc в UI и фактической fc профиля.
//   3. _resonances вызывается с эффективной fc (из m_flare), а не
//      с UI-значением — резонансы теперь согласованы с профилем.
//   4. Добавлена _calcMouthFromFc + кнопка "Устье из fc" в UI.
//   5. Добавлен флаг _calc.mismatch: если геометрический m_eff
//      отличается от m(fc) более чем на 5%, в UI показывается ⚠.
//   6. _mismatchInfo() возвращает { geometric_m, fc_m, fc_geo, delta_pct }.
//
// ИЗМЕНЕНИЯ v8.0 (критично):
//   1. Добавлен radiatingPorts с emit.kind='current_through'.
//   2. Добавлен mergedPorts: [{ a: 'out', b: 'gnd' }].
//   3. R_rad_mouth переведён на law='rad_plateau'.
//
// Архитектура:
//   - Профили: exponential, conical, tractrix, lecleach, hyperbolic.
//   - Сегментация S(x) с Ma_i, Ca_i, R_visc_i.
//   - R_rad на устье.
//   - Режимы: back / front (tapped — отдельная нода).
//   - SVG-профиль S(x).
//   - Резонансы, Q_horn, V_horn.
//   - Авторасчёт fc ↔ m_flare, оптимум устья.
//   - Broadcast через document 'nodegraph:param-changed'.

'use strict';

// ============================================================
// ДЕФОЛТЫ
// ============================================================

const HORN_UI_DEFAULT = {
    profile: 'exponential',
    throat_d: 50,
    mouth_d: 300,
    length: 500,
    fc: 100,
    m_flare: null,
    T_param: 1.0,
    mode: 'back',
    n_segments: 20,
    fold_count: 0,
    d_port: 0.10,

    _user: { throat_d: true, mouth_d: true, length: true, fc: true },
    _calc: {},
    _lastEdited: null,
    _version: 1,

    _sections: {
        profile: false,
        geometry: false,
        mode: false,
        response: false,
        advanced: true
    }
};

const PROFILE_LABEL = {
    exponential: 'экспоненциальный',
    conical:     'конический',
    tractrix:    'трактриса',
    lecleach:    'Le Cléac\'h',
    hyperbolic:  'гиперболический'
};

const MODE_LABEL = {
    back:   'back-loaded',
    front:  'front-loaded'
};

// ============================================================
// ФИЗИКА
// ============================================================

const RHO0 = 1.2041;
const C0   = 343.0;
const MU   = 1.81e-5;

function _areaFromD(d_mm) {
    const d = Number(d_mm) / 1000;
    if (!(d > 0)) return 0;
    return Math.PI * d * d / 4;
}

function _radiusFromS(S_m2) {
    return Math.sqrt(S_m2 / Math.PI);
}

function _diamFromS(S_m2) {
    return 2 * _radiusFromS(S_m2) * 1000; // мм
}

function _mFlareFromFc(fc) {
    if (!(fc > 0)) return 0;
    return 4 * Math.PI * fc / C0;
}

function _fcFromMFlare(m) {
    if (!(m > 0)) return 0;
    return C0 * m / (4 * Math.PI);
}

/**
 * Эффективный m экспоненциального профиля.
 * Приоритет: явный m_flare > 0, иначе m(fc), иначе геометрический.
 */
function _effectiveM(m_flare, fc, S_throat, S_mouth, L_m) {
    if (m_flare > 0) return m_flare;
    if (fc > 0) return _mFlareFromFc(fc);
    if (S_throat > 0 && S_mouth > 0 && L_m > 0) {
        return Math.log(S_mouth / S_throat) / L_m;
    }
    return 0;
}

/**
 * Диаметр устья, соответствующий fc, throat_d, length (для exponential).
 */
function _calcMouthFromFc(fc, throat_d_mm, L_mm) {
    const S_t = _areaFromD(throat_d_mm);
    const L_m = Number(L_mm) / 1000;
    const m = _mFlareFromFc(fc);
    if (!(S_t > 0) || !(L_m > 0) || !(m > 0)) return 0;
    const S_m = S_t * Math.exp(m * L_m);
    return _diamFromS(S_m);
}

/**
 * Информация о рассогласовании между fc и геометрией.
 */
function _mismatchInfo(ui) {
    const S_t = _areaFromD(ui.throat_d);
    const S_m = _areaFromD(ui.mouth_d);
    const L_m = Number(ui.length) / 1000;
    const fc  = Number(ui.fc);
    if (!(S_t > 0) || !(S_m > 0) || !(L_m > 0) || !(fc > 0)) {
        return { geometric_m: 0, fc_m: 0, fc_geo: 0, delta_pct: 0 };
    }
    const m_geo = Math.log(S_m / S_t) / L_m;
    const m_fc  = _mFlareFromFc(fc);
    const fc_geo = _fcFromMFlare(m_geo);
    const delta_pct = m_fc > 0 ? Math.abs(m_geo - m_fc) / m_fc * 100 : 0;
    return { geometric_m: m_geo, fc_m: m_fc, fc_geo, delta_pct };
}

function _profileS(x_over_L, S_throat, S_mouth, L_m, profile, m_flare, T_param, fc) {
    const x = Math.max(0, Math.min(1, x_over_L)) * L_m;
    if (!(S_throat > 0) || !(S_mouth > 0) || !(L_m > 0)) return 0;

    switch (profile) {
        case 'exponential': {
            const m_eff = _effectiveM(m_flare, fc, S_throat, S_mouth, L_m);
            return S_throat * Math.exp(m_eff * x);
        }
        case 'conical': {
            const r_t = Math.sqrt(S_throat);
            const r_m = Math.sqrt(S_mouth);
            if (r_m <= r_t) return S_throat;
            const x0 = L_m * r_t / (r_m - r_t);
            const v = 1 + x / x0;
            return S_throat * v * v;
        }
        case 'tractrix': {
            const ratio = Math.sqrt(S_mouth / S_throat);
            if (ratio <= 1) return S_throat;
            const x0 = L_m / Math.acosh(ratio);
            const v = Math.cosh(x / x0);
            return S_throat * v * v;
        }
        case 'lecleach':
        case 'hyperbolic': {
            const T = Number(T_param) || 1.0;
            const r_m = Math.sqrt(S_mouth / S_throat);
            let u_target = Math.log(r_m);
            if (T !== 1) {
                let u = Math.log(r_m);
                for (let i = 0; i < 20; i++) {
                    const f = Math.cosh(u) + T * Math.sinh(u) - r_m;
                    const fp = Math.sinh(u) + T * Math.cosh(u);
                    if (Math.abs(fp) < 1e-12) break;
                    u -= f / fp;
                    if (Math.abs(f) < 1e-10) break;
                }
                u_target = u;
            }
            const x0 = L_m / u_target;
            const v = Math.cosh(x / x0) + T * Math.sinh(x / x0);
            return S_throat * v * v;
        }
        default:
            return S_throat + (S_mouth - S_throat) * x_over_L;
    }
}

function _resonances(L_m, fc, nMax) {
    if (!(L_m > 0) || !(fc > 0)) return [];
    const out = [];
    for (let n = 1; n <= nMax; n++) {
        const f = fc * Math.sqrt(1 + Math.pow(n * C0 / (2 * fc * L_m), 2));
        if (isFinite(f)) out.push(f);
    }
    return out;
}

function _volumeHorn(L_mm, S_throat, S_mouth, profile, m_flare, T_param, fc) {
    const L = Number(L_mm) / 1000;
    if (!(L > 0)) return 0;
    const N = 100;
    const dx = 1 / N;
    let V = 0;
    for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx;
        V += _profileS(x, S_throat, S_mouth, L, profile, m_flare, T_param, fc) * dx * L;
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

function _massSegment(dx_m, S_m2) {
    if (!(S_m2 > 0)) return 0;
    return RHO0 * dx_m / S_m2;
}

function _complianceSegment(dx_m, S_m2) {
    return (S_m2 * dx_m) / (RHO0 * C0 * C0);
}

/**
 * R_rad на f_ref = 100 Hz, law='rad_plateau' (согласовано с port.js / twqp.js).
 */
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

    if (!(out.throat_d > 0)) out.throat_d = 50;
    if (!(out.mouth_d > 0)) out.mouth_d = 300;
    if (!(out.length > 0)) out.length = 500;
    if (!(out.fc > 0)) out.fc = 100;
    if (out.n_segments < 5) out.n_segments = 5;
    if (out.n_segments > 100) out.n_segments = 100;

    // ── v8.1: m_flare === 0 тоже пересчитывается из fc ──
    if (out._lastEdited === 'fc'
        || out.m_flare == null
        || out.m_flare === 0) {
        out.m_flare = _mFlareFromFc(out.fc);
        _calc.m_flare = true;
    }

    if (out._lastEdited === 'm_flare' && out.m_flare > 0) {
        out.fc = _fcFromMFlare(out.m_flare);
        _calc.fc = true;
    }

    // ── v8.1: кнопка "Устье из fc" ──
    if (out._lastEdited === 'mouth_from_fc' && out.fc > 0) {
        const d = _calcMouthFromFc(out.fc, out.throat_d, out.length);
        if (d > 0) {
            out.mouth_d = Math.round(d);
            _calc.mouth_d = true;
        }
    }

    // ── v8.1: кнопка "fc из устья" ──
    if (out._lastEdited === 'fc_from_mouth'
        && out.throat_d > 0 && out.mouth_d > 0 && out.length > 0) {
        const S_t = _areaFromD(out.throat_d);
        const S_m = _areaFromD(out.mouth_d);
        const L_m = out.length / 1000;
        const m_geo = Math.log(S_m / S_t) / L_m;
        out.fc = _fcFromMFlare(m_geo);
        out.m_flare = m_geo;
        _calc.fc = true;
        _calc.m_flare = true;
    }

    if (out._lastEdited === 'mouth_opt' && out.m_flare > 0) {
        const L_m = out.length / 1000;
        const S_t = _areaFromD(out.throat_d);
        const S_m = S_t * Math.exp(out.m_flare * L_m);
        out.mouth_d = Math.round(_radiusFromS(S_m) * 2000);
        _calc.mouth_d = true;
    }

    if (out.profile === 'conical' && out.mouth_d <= out.throat_d) {
        out.mouth_d = Math.round(out.throat_d * 3);
        _calc.mouth_d = true;
    }

    // ── v8.1: флаг рассогласования ──
    const mm = _mismatchInfo(out);
    if (mm.delta_pct > 5) {
        _calc.mismatch = true;
        out._mismatch = mm;
    } else {
        delete _calc.mismatch;
        delete out._mismatch;
    }

    out._calc = _calc;
    return out;
}

// ============================================================
// МОДУЛЬ
// ============================================================

module.exports = {
    meta: {
        id: 'Acoustics.horn',
        label: 'Horn',
        icon: 'icon-box'
    },

    ports: {
        inputs:  [{ id: 'rear', label: 'Rear' }],
        outputs: [{ id: 'out',  label: 'Out'  }]
    },

    inputRules:  { rear: ['speaker.js', 'box.js'] },
    outputRules: { out:  ['LEMsolver.js', 'tapped_horn.js'] },

    maxInputs:  { rear: 1 },
    maxOutputs: { out:  1 },

    params: [
        {
            id: 'horn_ui',
            type: 'horn_ui',
            label: 'Рупор',
            default: HORN_UI_DEFAULT,
            category: 'Рупор',
            _noCategoryHeader: true
        }
    ],

    onParamChange(id, value, node) {
        if (id !== 'horn_ui' || !node) return;

        const ui = value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : JSON.parse(JSON.stringify(HORN_UI_DEFAULT));

        const changed = ui._lastEdited;
        if (changed && changed !== '_toggle_section') {
            ui._user = { ...(ui._user || {}), [changed]: true };
            if (ui._calc) delete ui._calc[changed];
        }

        if (!ui._sections || typeof ui._sections !== 'object') {
            ui._sections = { ...HORN_UI_DEFAULT._sections };
        }

        const next = (changed === '_toggle_section') ? ui : _calcAll(ui);
        next._version = (ui._version || 1) + 1;

        node.paramValues.horn_ui = next;

        try {
            document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
                detail: { nodeId: node.id, paramId: 'horn_ui', value: next }
            }));
        } catch (e) {}
    },

    async compute(ctx) {
        const p = ctx.params;
        const ui = (p.horn_ui && typeof p.horn_ui === 'object') ? p.horn_ui : HORN_UI_DEFAULT;

        const profile    = ui.profile || 'exponential';
        const throat_d_mm = Number(ui.throat_d);
        const mouth_d_mm  = Number(ui.mouth_d);
        const L_mm        = Number(ui.length);
        const fc          = Number(ui.fc);
        const m_flare     = Number(ui.m_flare) || 0;
        const T_param     = Number(ui.T_param) || 1.0;
        const mode        = ui.mode || 'back';
        const N           = Math.max(5, Math.min(100, Math.floor(Number(ui.n_segments) || 20)));
        const d_port      = Math.max(0, Number(ui.d_port) || 0.10);

        if (!(throat_d_mm > 0)) throw new Error('Horn: throat_d > 0');
        if (!(mouth_d_mm > 0))  throw new Error('Horn: mouth_d > 0');
        if (!(L_mm > 0))        throw new Error('Horn: length > 0');
        if (!(fc > 0))          throw new Error('Horn: fc > 0');

        const L_m = L_mm / 1000;
        const S_throat = _areaFromD(throat_d_mm);
        const S_mouth = _areaFromD(mouth_d_mm);

        // ── v8.1: эффективный m и согласованная fc для резонансов ──
        const m_eff = _effectiveM(m_flare, fc, S_throat, S_mouth, L_m);
        const fc_eff = m_eff > 0 ? _fcFromMFlare(m_eff) : fc;

        const f_res = _resonances(L_m, fc_eff, 5);
        const V_horn = _volumeHorn(
            L_mm, S_throat, S_mouth, profile, m_flare, T_param, fc
        );

        const mismatch = _mismatchInfo(ui);

        const dx = L_m / N;

        const nodes = ['rear', 'out', 'gnd'];
        for (let i = 0; i <= N; i++) nodes.push(`m${i}`);

        const components = [];

        for (let i = 0; i < N; i++) {
            const x_center = (i + 0.5) / N;
            const S_i = _profileS(
                x_center, S_throat, S_mouth, L_m,
                profile, m_flare, T_param, fc
            );
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

            if (i < N - 1) {
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
        }

        // Врезка динамика в горло
        components.push({
            id: 'link_rear',
            type: 'R',
            from: 'rear',
            to: 'm0',
            value: 1e-6
        });

        // Устье: R_rad_mouth + декларативное излучение
        const mLast = `m${N}`;
        const S_mouth_safe = Math.max(S_mouth, 1e-8);
        const r_mouth = _radiusFromS(S_mouth_safe);
        const R_rad_ref = _radResistanceRef(S_mouth_safe, r_mouth);

        components.push({
            id: 'R_rad_mouth',
            type: 'R_freq',
            from: mLast,
            to: 'out',
            value: R_rad_ref,
            freqRef: 100,
            law: 'rad_plateau',
            radiationRadius_m: r_mouth
        });

        // ─── ДЕКЛАРАТИВНОЕ ИЗЛУЧЕНИЕ ───
        const radiatingPorts = [
            {
                port: 'out',
                emit: {
                    kind: 'current_through',
                    from: mLast,
                    to: 'out',
                    sign: -1,
                    admittance: {
                        type: 'R_freq',
                        value: R_rad_ref,
                        freqRef: 100,
                        law: 'rad_plateau',
                        radiationRadius_m: r_mouth
                    }
                }
            }
        ];

        // ═══ КРИТИЧНО: объединяем 'out' с 'gnd' ВНУТРИ фрагмента ═══
        const mergedPorts = [
            { a: 'out', b: 'gnd' }
        ];

        return {
            kind: 'lem.fragment',
            source: 'horn',
            nodes,
            components,
            ports: {
                rear: 'rear',
                out: 'out',
                gnd: 'gnd'
            },
            mergedPorts,
            radiatingPorts,
            markers: {
                driverNode: 'm0',
                throatNode: 'm0',
                mouthNode: mLast,
                mode
            },
            meta: {
                label: `Horn ${profile} · ${L_mm} мм`,
                profile,
                throat_d_mm,
                mouth_d_mm,
                length_mm: L_mm,
                fc,
                fc_eff,
                m_flare,
                m_eff,
                T_param,
                mode,
                n_segments: N,
                V_horn_m3: V_horn,
                f_resonances_Hz: f_res,
                d_port_m: d_port,
                r_mouth_m: r_mouth,
                S_mouth_m2: S_mouth_safe,
                R_rad_ref,
                radiationRadius_m: r_mouth,
                mismatch
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: 'Horn not connected' };
        }
        const ui = (ctx.params && ctx.params.horn_ui) || {};
        if (!(Number(ui.throat_d) > 0)) return { ready: false, reason: 'Horn: throat_d > 0' };
        if (!(Number(ui.mouth_d) > 0))  return { ready: false, reason: 'Horn: mouth_d > 0' };
        if (!(Number(ui.length) > 0))   return { ready: false, reason: 'Horn: length > 0' };
        if (!(Number(ui.fc) > 0))       return { ready: false, reason: 'Horn: fc > 0' };
        return { ready: true };
    },

    renderCustomProperties(ctx) {
        return {
            'horn_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderHornCard(value, onChange, ctx, node);
                },
                update(el, value) {
                    _updateHornCard(el, value);
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
// UI
// ============================================================

function _renderHornCard(value, onChange, ctx, node) {
    const ui = value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : JSON.parse(JSON.stringify(HORN_UI_DEFAULT));

    if (!ui._sections || typeof ui._sections !== 'object') {
        ui._sections = { ...HORN_UI_DEFAULT._sections };
    }

    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;

    const wrap = document.createElement('div');
    wrap.className = 'horn-ui';
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
        if (node && node.paramValues && node.paramValues.horn_ui) {
            if (!node.paramValues.horn_ui._sections) node.paramValues.horn_ui._sections = {};
            node.paramValues.horn_ui._sections[key] = collapsed;
        }
    };

    wrap.appendChild(_buildInfoBar(ui, uiApi));
    wrap.appendChild(_buildProfileSection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildGeometrySection(ui, onChange, uiApi, toggleSectionLocal));
    wrap.appendChild(_buildModeSection(ui, onChange, uiApi, toggleSectionLocal));
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

    const icon = _makeIcon(uiApi, 'icon-box', 20);
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
    const prof = (ui.profile || 'exponential').slice(0, 3);
    const L = Number(ui.length) || 0;
    line1.textContent = `Horn ${prof} · ${MODE_LABEL[ui.mode] || ui.mode} · ${L} мм`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = `
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.5));
        font-family: 'Courier New', monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    `;
    const th = Number(ui.throat_d) || 0;
    const mo = Number(ui.mouth_d) || 0;
    const fc = Number(ui.fc) || 0;
    line2.textContent = `Ø ${th}→${mo} мм · fc = ${Math.round(fc)} Hz`;
    info.appendChild(line2);

    // ── v8.1: строка рассогласования ──
    const mm = ui._mismatch;
    if (mm && mm.delta_pct > 5) {
        const line3 = document.createElement('div');
        line3.style.cssText = `
            font-size: 10px;
            color: rgba(255,180,80,0.9);
            font-family: 'Courier New', monospace;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
        `;
        line3.textContent = `⚠ m_geo=${mm.geometric_m.toFixed(2)} ≠ m_fc=${mm.fc_m.toFixed(2)} · fc_geo=${Math.round(mm.fc_geo)} Hz`;
        line3.title = `Геометрия даёт fc = ${mm.fc_geo.toFixed(1)} Hz, а задано fc = ${fc} Hz. Расхождение ${mm.delta_pct.toFixed(1)}%. Используйте "Устье из fc" или "fc из устья".`;
        info.appendChild(line3);
    }

    bar.appendChild(info);

    const missing = !(Number(ui.throat_d) > 0) || !(Number(ui.mouth_d) > 0)
                 || !(Number(ui.length) > 0) || !(Number(ui.fc) > 0);
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
    } else if (mm && mm.delta_pct > 5) {
        statusEl.textContent = '⚠ рассогл.';
        statusEl.style.background = 'rgba(255,180,80,0.15)';
        statusEl.style.color = 'rgba(255,180,80,0.95)';
        statusEl.style.border = '1px solid rgba(255,180,80,0.5)';
    } else {
        statusEl.textContent = '✓ Готов';
        statusEl.style.background = 'rgba(68,204,136,0.12)';
        statusEl.style.color = 'rgba(68,204,136,0.95)';
        statusEl.style.border = '1px solid rgba(68,204,136,0.35)';
    }
    bar.appendChild(statusEl);

    return bar;
}

function _buildProfileSection(ui, onChange, uiApi, toggleSection) {
    const key = 'profile';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Профиль', 'icon-nodegraph', uiApi, {
        collapsible: true, collapsed,
        sectionKey: key,
        onToggleLocal: (c) => toggleSection(key, c)
    });

    const row = document.createElement('div');
    row.style.cssText = `
        display: flex; gap: 6px; padding: 8px 12px;
        flex-wrap: wrap; width: 100%; box-sizing: border-box;
    `;

    const order = ['exponential', 'conical', 'tractrix', 'lecleach', 'hyperbolic'];

    for (const profId of order) {
        const isActive = ui.profile === profId;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = profId;
        btn.title = PROFILE_LABEL[profId] || profId;
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
            next.profile = profId;
            next._lastEdited = 'profile';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }

    section.body.appendChild(row);
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

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap: 10px; padding: 8px 12px 4px;
        width: 100%; box-sizing: border-box;
    `;
    grid.appendChild(_buildDimField(ui, {
        id: 'throat_d', label: 'Горло *', unit: 'мм', step: 1, required: true,
        hint: 'Диаметр горла'
    }, onChange));
    grid.appendChild(_buildDimField(ui, {
        id: 'mouth_d', label: 'Устье *', unit: 'мм', step: 1, required: true,
        hint: 'Диаметр устья'
    }, onChange));
    section.body.appendChild(grid);

    section.body.appendChild(_buildNumberField(ui, {
        id: 'length', label: 'Длина *', unit: 'мм', step: 10,
        required: true, hint: 'Длина рупора'
    }, onChange));

    section.body.appendChild(_buildNumberField(ui, {
        id: 'fc', label: 'f_c *', unit: 'Hz', step: 1,
        required: true, hint: 'Частота среза'
    }, onChange));

    // ── v8.1: строка с m и предупреждением о рассогласовании ──
    const m = Number(ui.m_flare) || _mFlareFromFc(ui.fc || 100);
    const mm = ui._mismatch;
    const mRow = document.createElement('div');
    mRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 6px 12px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.55));
        border-top: 1px solid rgba(200,184,154,0.06);
        width: 100%; box-sizing: border-box;
    `;
    const mLabel = document.createElement('span');
    mLabel.textContent = 'm (flare, 1/м):';
    mLabel.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    mRow.appendChild(mLabel);
    const mVal = document.createElement('span');
    mVal.textContent = m.toFixed(3);
    mVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    mRow.appendChild(mVal);
    section.body.appendChild(mRow);

    // ── v8.1: строка fc_geo ──
    if (mm && mm.delta_pct > 5) {
        const fcGeoRow = document.createElement('div');
        fcGeoRow.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px; padding: 4px 12px 8px;
            font-size: 10px;
            color: rgba(255,180,80,0.85);
            border-top: 1px solid rgba(255,180,80,0.10);
            width: 100%; box-sizing: border-box;
        `;
        const fcLbl = document.createElement('span');
        fcLbl.textContent = 'f_c (геом.):';
        fcLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
        fcGeoRow.appendChild(fcLbl);
        const fcVal = document.createElement('span');
        fcVal.textContent = `${Math.round(mm.fc_geo)} Hz`;
        fcVal.style.cssText = `
            font-family: 'Courier New', monospace;
            font-weight: 700;
            flex-shrink: 0;
        `;
        fcGeoRow.appendChild(fcVal);
        section.body.appendChild(fcGeoRow);
    }

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

function _buildModeSection(ui, onChange, uiApi, toggleSection) {
    const key = 'mode';
    const collapsed = ui._sections && ui._sections[key] === true;
    const section = _makeSection('Режим', 'icon-link', uiApi, {
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
        { id: 'back',  label: 'Back-loaded',  desc: 'Тыл динамика в горло' },
        { id: 'front', label: 'Front-loaded', desc: 'Фронт динамика в горло' }
    ];

    for (const opt of OPTS) {
        const isActive = ui.mode === opt.id;
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
            next.mode = opt.id;
            next._lastEdited = 'mode';
            next._version = (ui._version || 1) + 1;
            onChange(next);
        });
        row.appendChild(btn);
    }

    section.body.appendChild(row);
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

    const L_m = (Number(ui.length) || 0) / 1000;
    const fc = Number(ui.fc) || 0;
    const S_t = _areaFromD(ui.throat_d);
    const S_m = _areaFromD(ui.mouth_d);
    const m_flare = Number(ui.m_flare) || 0;

    // ── v8.1: резонансы от согласованной fc_eff ──
    const m_eff = _effectiveM(m_flare, fc, S_t, S_m, L_m);
    const fc_eff = m_eff > 0 ? _fcFromMFlare(m_eff) : fc;
    const f_res = _resonances(L_m, fc_eff, 3);

    const V_horn = _volumeHorn(
        ui.length, S_t, S_m,
        ui.profile || 'exponential', m_flare, ui.T_param, fc
    );

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
        l.textContent = `f${i+1}`;
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

    // ── v8.1: строка fc_eff ──
    const fcEffRow = document.createElement('div');
    fcEffRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 4px 12px;
        font-size: 10px;
        color: var(--text-muted, rgba(200,184,154,0.6));
        width: 100%; box-sizing: border-box;
    `;
    const fcEffLbl = document.createElement('span');
    fcEffLbl.textContent = 'f_c (эфф.):';
    fcEffLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    fcEffRow.appendChild(fcEffLbl);
    const fcEffVal = document.createElement('span');
    fcEffVal.textContent = `${Math.round(fc_eff)} Hz`;
    fcEffVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    fcEffRow.appendChild(fcEffVal);
    section.body.appendChild(fcEffRow);

    const vRow = document.createElement('div');
    vRow.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 4px 12px 10px;
        font-size: 11px;
        color: var(--text-muted, rgba(200,184,154,0.6));
        width: 100%; box-sizing: border-box;
    `;
    const vLbl = document.createElement('span');
    vLbl.textContent = 'V_horn:';
    vLbl.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;';
    vRow.appendChild(vLbl);
    const vVal = document.createElement('span');
    vVal.textContent = `${(V_horn * 1000).toFixed(2)} L`;
    vVal.style.cssText = `
        font-family: 'Courier New', monospace;
        font-weight: 700;
        color: var(--text-secondary, #a09888);
        flex-shrink: 0;
    `;
    vRow.appendChild(vVal);
    section.body.appendChild(vRow);

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
        id: 'n_segments', label: 'Сегментов', min: 5, max: 100,
        hint: 'Число сегментов рупора (5..100)'
    }, onChange));

    row.appendChild(_buildStepper(ui, {
        id: 'fold_count', label: 'Изгибов', min: 0, max: 4,
        hint: 'Число изгибов рупора (0 = прямая)'
    }, onChange));

    if (ui.profile === 'hyperbolic' || ui.profile === 'lecleach') {
        row.appendChild(_buildAdvancedNumber(ui, {
            id: 'T_param', label: 'T', unit: '',
            step: 0.1, min: 0.1, max: 5,
            hint: 'T-параметр (1 = экспоненциальный, <1 = гиперболический)'
        }, onChange));
    }

    row.appendChild(_buildAdvancedNumber(ui, {
        id: 'd_port', label: 'До динам.', unit: 'м',
        step: 0.01, min: 0, max: 5,
        hint: 'Расстояние от динамика до горла'
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

    // ── v8.1: "Устье из fc" — автокоррекция геометрии ──
    row.appendChild(mkBtn('Устье из fc', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next._lastEdited = 'mouth_from_fc';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }, 'primary'));

    // ── v8.1: "fc из устья" — обратная автокоррекция ──
    row.appendChild(mkBtn('fc из устья', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next._lastEdited = 'fc_from_mouth';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }));

    row.appendChild(mkBtn('Опт. устье', 'icon-calculate', () => {
        const next = JSON.parse(JSON.stringify(ui));
        next._lastEdited = 'mouth_opt';
        next._version = (ui._version || 1) + 1;
        onChange(next);
    }));

    row.appendChild(mkBtn('Сбросить', 'icon-trash', () => {
        const fresh = JSON.parse(JSON.stringify(HORN_UI_DEFAULT));
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
    const throat_d = Number(ui.throat_d) || 0;
    const mouth_d = Number(ui.mouth_d) || 0;
    const profile = ui.profile || 'exponential';
    const m_flare = Number(ui.m_flare) || 0;
    const T_param = Number(ui.T_param) || 1.0;
    const fc = Number(ui.fc) || 0;

    if (!(L_mm > 0) || !(throat_d > 0) || !(mouth_d > 0)) {
        return svg;
    }

    const S_throat = _areaFromD(throat_d);
    const S_mouth = _areaFromD(mouth_d);
    const L_m = L_mm / 1000;

    const PAD_L = 40, PAD_R = 20, PAD_T = 20, PAD_B = 30;
    const W = 400 - PAD_L - PAD_R;
    const H = 140 - PAD_T - PAD_B;

    const S_max = Math.max(S_throat, S_mouth) * 1.1;
    const S_min = 0;

    const colorLine = 'var(--accent-red, #cc2233)';
    const colorFill = 'rgba(204,34,51,0.12)';
    const colorAxis = 'var(--border-color, rgba(200,184,154,0.25))';
    const colorText = 'var(--text-muted, rgba(200,184,154,0.6))';

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
        const S = _profileS(x, S_throat, S_mouth, L_m, profile, m_flare, T_param, fc);
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

    svg.appendChild(mkText(PAD_L, 12, `Ø ${Math.round(throat_d)} мм`, 'start'));
    svg.appendChild(mkText(PAD_L + W, 12, `Ø ${Math.round(mouth_d)} мм`, 'end'));
    svg.appendChild(mkText(PAD_L + W / 2, 140 - 8, `L ${L_mm} мм · ${profile}`, 'middle'));

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
        section.dataset.hornSection = opts.sectionKey;
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
        body.dataset.hornSectionBody = '1';
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

function _updateHornCard(el, value) {
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
        console.warn('[horn] _updateHornCard: no onChange found');
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

    const sectionsState = { ...(value._sections || HORN_UI_DEFAULT._sections) };
    try {
        const sections = el.querySelectorAll('[data-horn-section]');
        for (const s of sections) {
            const secKey = s.dataset.hornSection;
            const body = s.querySelector('[data-horn-section-body]');
            if (body && secKey) {
                sectionsState[secKey] = (body.style.display === 'none');
            }
        }
    } catch (e) {}
    value._sections = sectionsState;

    const fresh = _renderHornCard(value, onChange, { host: { ui: uiApi } }, null);

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