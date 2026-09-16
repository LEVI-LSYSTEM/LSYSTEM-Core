// data/nodes/Acoustics/speaker.js
'use strict';

module.exports = {
    meta: {
        id: "Acoustics.speaker",
        label: "Speaker",
        icon: "icon-speaker"
    },

    inputRules: [],
    outputRules: ["box.js", "wall.js", "LEMsolver.js"],

    maxInputs: 0,
    maxOutputs: 2,

    params: [
        // ── T/S ── (используются как основной вход)
        { id: "fs",  type: "number", label: "Fs, Hz",  default: 45,   category: "T/S" },
        { id: "qes", type: "number", label: "Qes",     default: 0.45, category: "T/S" },
        { id: "qms", type: "number", label: "Qms",     default: 4.0,  category: "T/S" },
        { id: "vas", type: "number", label: "Vas, L",  default: 34,   category: "T/S" },

        // ── Электрика ──
        { id: "re",  type: "number", label: "Re, Ω",   default: 6.4,  category: "Electrical" },
        { id: "le",  type: "number", label: "Le, mH",  default: 0.5,  category: "Electrical" },

        // ── Геометрия ──
        { id: "sd",  type: "number", label: "Sd, cm²", default: 220,  category: "Geometry" },

        // ── Reference (для нормировки, не влияет на физику) ──
        { id: "spl", type: "number", label: "SPL ref, dB", default: 88, category: "Reference" }
    ],

    async compute(ctx) {
        const p = ctx.params;

        const fs   = Number(p.fs);
        const qes  = Number(p.qes);
        const qms  = Number(p.qms);
        const vasL = Number(p.vas);
        const Re   = Number(p.re);
        const Le   = Number(p.le) * 1e-3;
        const Sd   = Number(p.sd) * 1e-4;

        if (!(fs > 0))  throw new Error("Fs > 0");
        if (!(qes > 0)) throw new Error("Qes > 0");
        if (!(qms > 0)) throw new Error("Qms > 0");
        if (!(vasL > 0))throw new Error("Vas > 0");
        if (!(Re > 0))  throw new Error("Re > 0");
        if (!(Sd > 0))  throw new Error("Sd > 0");

        // ── Среда-эталон (для пересчёта T/S) ──
        const rho0 = 1.2041, c0 = 343.0;

        // ── Вывод физических параметров из T/S ──
        const qts = (qes * qms) / (qes + qms);
        const Vas = vasL / 1000;
        const Cms = Vas / (rho0 * c0 * c0 * Sd * Sd);
        const Mms = 1 / (Math.pow(2 * Math.PI * fs, 2) * Cms);
        const Rms = Math.sqrt(Mms / Cms) / qms;
        const BL  = Math.sqrt(Re * Math.sqrt(Mms / Cms) / qes);

        // ── Акустические эквиваленты (домен p, U) ──
        const Sd2 = Sd * Sd;
        const G   = BL / Sd;      // гиратор (электро-акустический)
        const Ma  = Mms / Sd2;    // акустическая масса
        const Ra  = Rms / Sd2;    // акустическое сопротивление
        const Ca  = Cms * Sd2;    // акустическая гибкость

        // ── Сопротивление излучения R_rad(2π) = ρω²/(2πc) ──
        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;
        const R_rad_ref = (rho0 * w_ref * w_ref) / (2 * Math.PI * c0);

        // ── Узлы ──
        //   in ─ Re ─ e1 ─ Le ─ e2 ─[GYR]─ gnd
        //                              │
        //                            (d)
        //   d ─ Ma ─ m1 ─ Ra ─ m2 ─ R_rad ─ m3 ─ Ca ─ rear
        const nodes = ["in", "e1", "e2", "d", "m1", "m2", "m3", "rear", "gnd"];

        const components = [
            { id: "Re", type: "R", from: "in", to: "e1", value: Re },
            { id: "Le", type: "L", from: "e1", to: "e2", value: Le },

            // Порт 1 — электрика (e2 … gnd). Порт 2 — акустика (d … gnd).
            {
                id: "GYR",
                type: "GYRATOR",
                from: "e2",  to: "gnd",
                from2: "d",  to2: "gnd",
                value: G
            },

            // Механическая цепь (серия) — V=F, I=v (impedance analogy)
            { id: "Ma", type: "L", from: "d",  to: "m1", value: Ma },
            { id: "Ra", type: "R", from: "m1", to: "m2", value: Ra },
            {
                id: "Rrad",
                type: "R_freq",
                from: "m2", to: "m3",
                value: R_rad_ref,
                freqRef: f_ref,
                law: "omega_sq"
            },
            // Гибкость драйвера — конец серии, к rear-порту (там подключится ящик)
            { id: "Ca", type: "C", from: "m3", to: "rear", value: Ca }
        ];

        return {
            kind: "lem.fragment",
            source: "speaker",

            nodes,
            components,

            ports: {
                in:   "in",
                rear: "rear",
                gnd:  "gnd"
            },

            meta: {
                label: `Speaker ${fs} Hz`,
                fs, qes, qms, qts, vasL,
                Re, Le, BL, Sd_m2: Sd, Mms, Rms, Cms,
                Vas_computed_m3: rho0 * c0 * c0 * Sd * Sd * Cms,
                G, Ma, Ra, Ca
            },

            // Используется солвером только для опциональной нормировки
            normalization: {
                spl_ref_dB: Number(p.spl),
                p_ref: 20e-6,
                distance: 1.0
            }
        };
    }
};