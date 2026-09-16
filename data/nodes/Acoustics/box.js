// data/nodes/Acoustics/box.js
'use strict';

module.exports = {
    meta: {
        id: "Acoustics.box",
        label: "Box",
        icon: "icon-box"
    },

    inputRules:  ["speaker.js", "port.js"],
    outputRules: ["port.js", "passive_radiator.js", "LEMsolver.js"],

    maxInputs:  "*",
    maxOutputs: "*",

    params: [
        { id: "volume", type: "number", label: "Volume, L", default: 30,  category: "" },
        { id: "qa",     type: "number", label: "Qa",        default: 7.0, category: "" },
        { id: "fill",   type: "number", label: "Fill, %",   default: 0,   category: "" }
    ],

    async compute(ctx) {
        const V_L  = Number(ctx.params.volume);
        const Qa   = Number(ctx.params.qa);
        const fill = Number(ctx.params.fill) || 0;

        if (!(V_L > 0)) throw new Error("Volume > 0");
        if (!(Qa > 0))  throw new Error("Qa > 0");

        // Эталонная среда
        const rho0 = 1.2041, c0 = 343.0;

        // Заполнитель: приближённо +50% от объёма заполнителя к «акустическому» объёму
        const V_eff = (V_L / 1000) * (1 + 0.5 * fill / 100);

        // Акустическая гибкость: Cbox = V / (ρ·c²)
        const Cbox = V_eff / (rho0 * c0 * c0);

        // Потери в ящике: Qa = ω·Ra·Cbox ⇒ Ra = Qa / (ω·Cbox)
        // Модель постоянной Qa ⇒ Ra ∝ 1/ω
        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;
        const Ra_ref = Qa / (w_ref * Cbox);

        return {
            kind: "lem.fragment",
            source: "box",

            nodes: ["rear", "gnd"],

            // Cbox — последовательно с Ca драйвера (series capacitors)
            // Rabox — параллельно Cbox (шунт потерь)
            components: [
                { id: "Cbox", type: "C", from: "rear", to: "gnd", value: Cbox },
                {
                    id: "Rabox",
                    type: "R_freq",
                    from: "rear", to: "gnd",
                    value: Ra_ref,
                    freqRef: f_ref,
                    law: "1_over_omega"
                }
            ],

            ports: {
                rear: "rear",
                gnd:  "gnd"
            },

            meta: {
                label: `Box ${V_L} L`,
                volume_L: V_L,
                volume_eff_m3: V_eff,
                Qa,
                fill_percent: fill,
                Cbox,
                Ra_ref,
                f_ref
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: "Box not connected" };
        }
        return { ready: true };
    }
};