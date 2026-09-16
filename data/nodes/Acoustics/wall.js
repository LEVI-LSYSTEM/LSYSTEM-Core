// data/nodes/Acoustics/wall.js
//
// Стенка — разделяет фронт (излучение наружу) и тыл (ящик) динамика.
//
// В LEM это не «физический» элемент, а топологический разделитель:
//   - подтверждает, что динамик установлен в стенку;
//   - определяет, что rear-порт динамика идёт в ящик,
//     а front-порт (излучение) идёт в окружающее пространство.
//
// Модель: «идеальный» акустический коротыш — узел front пробрасывается
// напрямую к глобальному front-узлу для суммирования излучения.
//
// Порты:
//   front  — наружное излучение
//   rear   — тыл динамика (идёт в ящик/порт/ПИ)
//   gnd    — общий

'use strict';

module.exports = {
    meta: {
        id: "Acoustics.wall",
        label: "Wall",
        icon: "icon-wall"
    },

    inputRules:  ["speaker.js"],
    outputRules: ["LEMsolver.js"],

    maxInputs:  "*",
    maxOutputs: 1,

    params: [
        { id: "thickness", type: "number", label: "Thickness, mm", default: 18, category: "" },
        { id: "leak_q",    type: "number", label: "Leak Q",        default: 50, category: "" }
    ],

    async compute(ctx) {
        const p = ctx.params;
        const thickness_mm = Number(p.thickness);
        const leakQ = Number(p.leak_q);

        if (!(thickness_mm > 0)) throw new Error("Wall: thickness > 0");
        if (!(leakQ > 0))        throw new Error("Wall: leak_q > 0");

        // Параметры утечки: чем выше Q — тем меньше потери.
        // Модель: R_leak(ω) = Q_leak / (ω·C_leak), но здесь C_leak мала,
        // поэтому задаём просто высокоомный резистор с частотной поправкой.
        // Практически: R_leak ≈ const (маленькая дырка — активное сопротивление).
        const R_leak = 1e6 * leakQ;   // очень большое сопротивление по умолчанию

        return {
            kind: "lem.fragment",
            source: "wall",

            // front и rear — глобальные порты; они соединяются между фрагментами.
            // wall сам по себе добавляет только «шунт утечки» на rear.
            nodes: ["rear", "front", "gnd"],

            components: [
                // Утечка через стенку (щели, неплотности)
                { id: "R_leak", type: "R", from: "rear", to: "front", value: R_leak }
            ],

            ports: {
                rear:  "rear",
                front: "front",
                gnd:   "gnd"
            },

            meta: {
                label: `Wall ${thickness_mm} мм`,
                thickness_mm,
                leak_q: leakQ,
                R_leak_ohm_ac: R_leak
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: "Wall not connected" };
        }
        return { ready: true };
    }
};