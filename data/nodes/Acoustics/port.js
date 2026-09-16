// data/nodes/Acoustics/port.js
//
// Порт (фазоинвертор).
//
// Модель (impedance analogy, V=p, I=U):
//
//    front ── R_rad_ext ── m1 ── L_port ── m2 ── R_visc ── rear
//                                       │
//                                       └── C_end_corr ── gnd
//
//  - L_port      = ρ·L_eff / S          (акустическая масса воздуха в трубе)
//  - R_visc(ω)   = ρ·L_eff·√(ω)·k_visc / S    (вязкое трение о стенки)
//  - R_rad_ext   = ρ·ω² / (2π·c)        (излучение наружу, 2π)
//  - R_rad_int   = ρ·ω² / (2π·c)        (излучение внутрь ящика — учит. через rear)
//  - C_end_corr  = поправка на присоединённую массу концов (учтена в L_eff)
//
// L_eff = L_geom + 0.85·√(S/π)  (поправка на оба конца, формула Рэлея)
//
// Порты:
//   rear   — подключение к ящику
//   front  — излучение наружу
//   gnd    — общий

'use strict';

module.exports = {
    meta: {
        id: "Acoustics.port",
        label: "Port",
        icon: "icon-port"
    },

    inputRules:  ["box.js"],
    outputRules: ["box.js", "passive_radiator.js", "LEMsolver.js"],

    maxInputs:  1,
    maxOutputs: 1,

    params: [
        { id: "diameter", type: "number", label: "Diameter, mm", default: 50,  category: "" },
        { id: "length",   type: "number", label: "Length, mm",   default: 150, category: "" },
        { id: "n_ports",  type: "int",    label: "Count",        default: 1,   category: "" },
        { id: "flared",   type: "bool",   label: "Flared ends",  default: true, category: "" }
    ],

    async compute(ctx) {
        const p = ctx.params;

        const D_mm  = Number(p.diameter);
        const L_mm  = Number(p.length);
        const nPort = Math.max(1, Math.floor(Number(p.n_ports) || 1));
        const flared = p.flared === true || p.flared === "true";

        if (!(D_mm > 0))  throw new Error("Port: diameter > 0");
        if (!(L_mm > 0))  throw new Error("Port: length > 0");

        // Эталонная среда (как в box.js)
        const rho0 = 1.2041;
        const c0   = 343.0;
        const mu   = 1.81e-5;    // динамическая вязкость воздуха, Па·с

        const D = D_mm / 1000;
        const L = L_mm / 1000;
        const S = Math.PI * D * D / 4;   // площадь одного порта

        // ── Поправка длины на присоединённую массу ──
        //   Плоский конец:   δ = 0.85·r   (r = √(S/π)) — оба конца
        //   Раструб (flared): δ ≈ 0.61·r  — оба конца
        //   Внешний/внутренний концы считаем одинаково (упрощение)
        const r = Math.sqrt(S / Math.PI);
        const endCorr = flared ? 2 * 0.61 * r : 2 * 0.85 * r;
        const L_eff = L + endCorr;

        // ── Акустические параметры (для n портов — параллельно) ──
        //   M_port_total = ρ·L_eff / (n·S)   (параллель → масса делится на n)
        //   Считаем в единицах одного порта, а n учитываем множителем
        const Ma = (rho0 * L_eff) / (nPort * S);   // кг/м⁴

        // ── Вязкое сопротивление (Пуазейль / Стокс, тонкий слой) ──
        //   R_visc = (8·μ·L_eff)/(π·r⁴) · n_ports_par  — но у нас параллель,
        //   поэтому сопротивление одного порта делится на n.
        //   В акустических единицах (p/U):  R = (8·μ·L_eff)/(π·r⁴·S²)? Нет.
        //   Через акустический импеданс:  Z_visc = R_v·L_eff / S  где
        //   R_v = 8·μ/r² — коэффициент трения на единицу длины на единицу площади.
        //   Итого: Ra_visc = (8·μ·L_eff) / (S · r²)  ... проверим размерность:
        //   [μ]=Па·с, [L]=м, [S]=м², [r²]=м² → (Па·с·м)/(м⁴) = Па·с/м³ = кг/(м⁴·с).
        //   В impedance analogy p/U → кг/(м⁴·с) — верно.
        const Ra_visc_const = (8 * mu * L_eff) / (S * r * r * nPort);

        // ── Излучение наружу (2π, полупространство) ──
        //   R_rad(ω) = ρ·ω² / (2π·c)
        const f_ref = 100;
        const w_ref = 2 * Math.PI * f_ref;
        const Ra_rad_ref = (rho0 * w_ref * w_ref) / (2 * Math.PI * c0);

        // ── Настройка частоты ──
        //   f_port = (1/2π) · √(1/(Ma·Cbox))   — считается в солвере
        //   Здесь только C-поправка на концах для собственного резонанса порта
        //   не нужна — L_eff уже включает присоединённую массу.

        const w_visRef = w_ref;
        return {
            kind: "lem.fragment",
            source: "port",

            nodes: ["rear", "front", "m1", "m2", "gnd"],

            components: [
                // L_port (акустическая масса воздуха)
                { id: "Ma", type: "L", from: "m1", to: "m2", value: Ma },

                // Вязкое трение внутри порта — последовательно
                //   R_visc(ω) = Ra_visc_const · √(ω/ω_ref)
                {
                    id: "Ra_visc",
                    type: "R_freq",
                    from: "m2", to: "rear",
                    value: Ra_visc_const * Math.sqrt(w_visRef),
                    freqRef: f_ref,
                    law: "sqrt_omega"     // см. патч солвера ниже
                },

                // Излучение наружу — последовательно с массой
                {
                    id: "Ra_rad_ext",
                    type: "R_freq",
                    from: "front", to: "m1",
                    value: Ra_rad_ref,
                    freqRef: f_ref,
                    law: "omega_sq"
                },

                // Излучение внутрь ящика — на стороне rear
                {
                    id: "Ra_rad_int",
                    type: "R_freq",
                    from: "rear", to: "gnd",
                    value: Ra_rad_ref,     // упрощение: та же величина
                    freqRef: f_ref,
                    law: "omega_sq"
                },

                // GND для узлов m1, m2 не нужен — они внутренние (в серии).
                // Но объявим их как узлы, чтобы mergeFragments их сохранил.
            ],

            ports: {
                rear:  "rear",
                front: "front",
                gnd:   "gnd"
            },

            meta: {
                label: `Port Ø${D_mm}×${L_mm} мм (×${nPort})`,
                diameter_mm: D_mm,
                length_mm:   L_mm,
                n_ports:     nPort,
                flared,
                S_m2:        S,
                L_eff_m:     L_eff,
                Ma,
                Ra_visc_const,
                Ra_rad_ref,
                f_ref
            }
        };
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) {
            return { ready: false, reason: "Port not connected" };
        }
        return { ready: true };
    }
};