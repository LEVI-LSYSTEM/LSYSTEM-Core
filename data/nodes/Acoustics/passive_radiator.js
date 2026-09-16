// data/nodes/Acoustics/passive_radiator.js
//
// Пассивный излучатель (ПИ).
//
// Модель (impedance analogy, V=p, I=U):
//
//    front ── Ra_rad ── m1 ── Ma_pr ── m2 ── Ra_pr ── m3 ── Ca_pr ── rear
//
//  - Ma_pr = Mms_pr / Sd_pr²      (акустическая масса ПИ)
//  - Ra_pr = Rms_pr / Sd_pr²      (механические потери подвеса)
//  - Ca_pr = Cms_pr · Sd_pr²      (гибкость подвеса)
//  - Ra_rad = ρ·ω²/(2π·c)          (излучение наружу)
//
// Порты:
//   rear   — подключение к ящику (со стороны гибкости)
//   front  — излучение наружу
//   gnd    — общий

'use strict';

module.exports = {
    meta: {
        id: "Acoustics.passive_radiator",
        label: "Passive Radiator",
        icon: "icon-passive-radiator"
    },

    inputRules:  ["box.js", "port.js"],
    outputRules: ["port.js", "LEMsolver.js"],

    maxInputs:  1,
    maxOutputs: 1,

    params: [
        { id: "diameter", type: "number", label: "Diameter, mm", default: 150, category: "" },
        { id: "mms",      type: "number", label: "Mms, g",       default: 30,  category: "" },
        { id: "cms",      type: "number", label: "Cms, mm/N",    default: 0.5, category: "" },
        { id: "rms",      type: "number", label: "Rms, kg/s",    default: 0.8, category: "" },
        { id: "xmax",     type: "number", label: "Xmax, mm",     default: 12,  category: "" }
    ],

    async compute(ctx) {
        const p = ctx.params;

        const D_mm = Number(p.diameter);
        const Mms  = Number(p.mms) * 1e-3;    // г → кг
        const Cms  = Number(p.cms) * 1e-3;    // мм/Н → м/Н
        const Rms  = Number(p.rms);
        const xmax = Number(p.xmax);

        if (!(D_mm > 0)) throw new Error("PR: diameter > 0");
        if (!(Mms > 0))  throw new Error("PR: Mms > 0");
        if (!(Cms > 0))  throw new Error("PR: Cms > 0");
        if (!(Rms > 0))  throw new Error("PR: Rms > 0");

        // Эталонная среда (как в box.js)
        const rho0 = 1.2041;
        const c0   = 343.0;

        const D  = D_mm / 1000;
        const Sd = Math.PI * D * D / 4;
        const Sd2 = Sd * Sd;

        // ── Акустические эквиваленты ──
        const Ma = Mms / Sd2;      // кг/м⁴
        const Ra = Rms / Sd2;      // кг/(м⁴·с)
        const Ca = Cms * Sd2;      // м⁴·с²/кг

        // ── Излучение наружу (2π) ──
        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;
        const Ra_rad_ref = (rho0 * w_ref * w_ref) / (2 * Math.PI * c0);

        // Резонанс ПИ (справочно)
        const fp = 1 / (2 * Math.PI * Math.sqrt(Ma * Ca));

        return {
            kind: "lem.fragment",
            source: "passive_radiator",

            nodes: ["rear", "front", "m1", "m2", "m3", "gnd"],

            components: [
                // Излучение наружу
                {
                    id: "Ra_rad",
                    type: "R_freq",
                    from: "front", to: "m1",
                    value: Ra_rad_ref,
                    freqRef: f_ref,
                    law: "omega_sq"
                },

                // Масса ПИ
                { id: "Ma", type: "L", from: "m1", to: "m2", value: Ma },

                // Механические потери подвеса
                { id: "Ra", type: "R", from: "m2", to: "m3", value: Ra },

                // Гибкость подвеса — конец к rear
                { id: "Ca", type: "C", from: "m3", to: "rear", value: Ca }
            ],

            ports: {
                rear:  "rear",
                front: "front",
                gnd:   "gnd"
            },

            meta: {
                label: `PR Ø${D_mm} мм`,
                diameter_mm: D_mm,
                Sd_m2: Sd,
                Mms_kg: Mms,
                Cms_m_per_N: Cms,
                Rms_kg_per_s: Rms,
                xmax_mm: xmax,
                Ma, Ra, Ca,
                fp_Hz: fp,
                Ra_rad_ref,
                f_ref
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: "PR not connected" };
        }
        return { ready: true };
    }
};