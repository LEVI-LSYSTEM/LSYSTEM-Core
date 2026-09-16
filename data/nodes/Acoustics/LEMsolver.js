// data/nodes/Acoustics/LEMsolver.js
'use strict';

// ═══════════════════════════════════════════════════════════════
// Комплексная арифметика
// ═══════════════════════════════════════════════════════════════
const C = {
    zero: () => ({ re: 0, im: 0 }),
    from: (re, im = 0) => ({ re, im }),
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    }),
    div: (a, b) => {
        const d = b.re * b.re + b.im * b.im;
        if (d < 1e-300) return { re: 0, im: 0 };
        return {
            re: (a.re * b.re + a.im * b.im) / d,
            im: (a.im * b.re - a.re * b.im) / d
        };
    },
    scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
    neg: (a) => ({ re: -a.re, im: -a.im }),
    conj: (a) => ({ re: a.re, im: -a.im }),
    abs: (a) => Math.hypot(a.re, a.im),
    arg: (a) => Math.atan2(a.im, a.re)
};

// ═══════════════════════════════════════════════════════════════
// Комплексный Гаусс с partial pivoting и row equilibration
// ═══════════════════════════════════════════════════════════════
function solveComplex(A, b) {
    const n = b.length;
    const M = A.map(row => row.map(v => ({ re: v.re, im: v.im })));
    const x = b.map(v => ({ re: v.re, im: v.im }));
    const rs = new Array(n);

    for (let i = 0; i < n; i++) {
        let mx = 0;
        for (let j = 0; j < n; j++) {
            const m = Math.hypot(M[i][j].re, M[i][j].im);
            if (m > mx) mx = m;
        }
        rs[i] = mx > 1e-300 ? mx : 1;
    }

    for (let col = 0; col < n; col++) {
        let pivot = col;
        let best = C.abs(M[col][col]) / rs[col];
        for (let r = col + 1; r < n; r++) {
            const m = C.abs(M[r][col]) / rs[r];
            if (m > best) { best = m; pivot = r; }
        }
        if (best < 1e-14) throw new Error(`LEM: singular matrix at column ${col}`);
        if (pivot !== col) {
            [M[col], M[pivot]] = [M[pivot], M[col]];
            [x[col], x[pivot]] = [x[pivot], x[col]];
            [rs[col], rs[pivot]] = [rs[pivot], rs[col]];
        }
        const d = M[col][col];
        for (let j = col; j < n; j++) M[col][j] = C.div(M[col][j], d);
        x[col] = C.div(x[col], d);
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col];
            if (C.abs(f) < 1e-300) continue;
            for (let j = col; j < n; j++) {
                M[r][j] = C.sub(M[r][j], C.mul(f, M[col][j]));
            }
            x[r] = C.sub(x[r], C.mul(f, x[col]));
        }
    }
    return x;
}

// ═══════════════════════════════════════════════════════════════
// Хелпер: вычисление xmax динамика из решения
// ═══════════════════════════════════════════════════════════════
function _calcXmaxInfo(netlist, targetXmax_mm) {
    // targetXmax_mm — паспортный Xmax динамика (модуль может пробросить).
    // Если не задан — не рисуем отметку.
    return {
        targetXmax_mm: (typeof targetXmax_mm === 'number' && targetXmax_mm > 0)
            ? targetXmax_mm
            : null
    };
}

// ═══════════════════════════════════════════════════════════════
// Модуль
// ═══════════════════════════════════════════════════════════════
module.exports = {
    meta: {
        id: "Acoustics.lem_solver",
        label: "LEM Solver",
        icon: "icon-solver"
    },

    inputRules: ["*"],
    outputRules: [],
    maxInputs: "*",
    maxOutputs: 0,

    params: [
        { id: "f_min",       type: "number", label: "F min, Hz",       default: 10,     category: "Sweep" },
        { id: "f_max",       type: "number", label: "F max, Hz",       default: 20000,  category: "Sweep" },
        { id: "f_points",    type: "int",    label: "Points",          default: 800,    category: "Sweep" },
        { id: "v_rms",       type: "number", label: "Drive, V RMS",    default: 2.83,   category: "Drive" },
        { id: "distance",    type: "number", label: "Distance, m",     default: 1.0,    category: "Drive" },
        { id: "half_space",  type: "bool",   label: "Half-space (2π)", default: true,   category: "Drive" },
        { id: "temperature", type: "number", label: "T, °C",           default: 20,     category: "Env" },
        { id: "humidity",    type: "number", label: "RH, %",           default: 50,     category: "Env" },
        { id: "pressure",    type: "number", label: "P, Pa",           default: 101325, category: "Env" },
        {
            id: "align",
            type: "select",
            label: "Y align",
            default: "peak",
            options: [
                { value: "peak",   label: "Peak → 0 dB" },
                { value: "median", label: "Median 200–1000 → 0 dB" },
                { value: "spl",    label: "Absolute (SPL_ref)" },
                { value: "none",   label: "None (raw)" }
            ],
            category: "Output"
        }
    ],

    buttons: [
        { id: "run",    label: "Run",    icon: "icon-play" },
        { id: "export", label: "Export", icon: "icon-export" },
        { id: "send",   label: "Send",  icon: "icon-graphic" }
    ],

    onButton(id, ctx) {
        const { node, host } = ctx;
        if (id === "run") {
            if (host && typeof host.runNode === 'function') host.runNode(node);
            return;
        }
        if (id === "export") {
            if (!node._result || !Array.isArray(node._result.graphs)) {
                if (host && typeof host.notify === 'function') host.notify('Export', 'Run first', 'warning');
                return;
            }
            exportJSON(node._result, host);
            return;
        }
        if (id === "send") {
            if (!node._result || !Array.isArray(node._result.graphs)) {
                if (host && typeof host.notify === 'function') host.notify('Send', 'Run first', 'warning');
                return;
            }
            sendToGraphic(node._result, host);
        }
    },

    checkCompute(ctx) {
        if (ctx.getInputs().length === 0) return { ready: false, reason: "No inputs" };
        return { ready: true };
    },

    async compute(ctx) {
        const inputs = ctx.getInputs();
        if (inputs.length === 0) throw new Error("LEM Solver: no inputs");

        // ── Сбор фрагментов ──
        const fragments = [];
        const visited = new Set();
        const collect = async (node) => {
            if (visited.has(node.id)) return;
            visited.add(node.id);
            const ups = ctx.graph.connections
                .filter(c => c.toNodeId === node.id)
                .map(c => ctx.graph.getNode(c.fromNodeId))
                .filter(Boolean);
            for (const u of ups) await collect(u);
            const r = await ctx.requestCompute(node.id);
            if (r && r.kind === "lem.fragment") fragments.push(r);
        };
        for (const inp of inputs) await collect(inp);

        if (fragments.length === 0) throw new Error("LEM: no LEM fragments found");

        const netlist = this._mergeFragments(fragments);

        // ── Параметры ──
        const f_min = Number(ctx.params.f_min);
        const f_max = Number(ctx.params.f_max);
        const f_points = Math.max(50, Math.floor(Number(ctx.params.f_points)));
        if (!(f_min > 0) || !(f_max > f_min)) throw new Error("LEM: bad frequency range");

        const v_rms = Math.max(1e-9, Number(ctx.params.v_rms));
        const distance = Math.max(0.01, Number(ctx.params.distance));
        const halfSpace = ctx.params.half_space === true || ctx.params.half_space === "true";
        const alignMode = String(ctx.params.align || "peak");

        const env = this._computeEnvironment(
            Number(ctx.params.temperature),
            Number(ctx.params.humidity),
            Number(ctx.params.pressure)
        );

        const freqs = this._logspace(f_min, f_max, f_points);

        const splArr   = new Array(freqs.length);
        const phaseArr = new Array(freqs.length);
        const uArr     = new Array(freqs.length);
        const xArr     = new Array(freqs.length);
        const zArr     = new Array(freqs.length);
        const zReArr   = new Array(freqs.length);
        const zImArr   = new Array(freqs.length);

        const spl_ref_dB = netlist.normalization?.spl_ref_dB ?? null;

        for (let i = 0; i < freqs.length; i++) {
            const w = 2 * Math.PI * freqs[i];
            const sol = this._solveAtFrequency(w, netlist, env, { v_rms, distance, halfSpace });
            splArr[i]   = sol.spl_dB;
            phaseArr[i] = sol.phase_deg;
            uArr[i]     = sol.U_mag;
            xArr[i]     = sol.x_mm;
            zArr[i]     = sol.Z_in_mag;
            zReArr[i]   = sol.Z_in_re;
            zImArr[i]   = sol.Z_in_im;
        }

        // ── Выравнивание Y (SPL) ──
        const shift = this._computeAlignShift(freqs, splArr, alignMode, spl_ref_dB);
        const splFinal = splArr.map(v => Number.isFinite(v) ? v + shift : -200);

        return this._buildJSON(freqs, splFinal, phaseArr, uArr, xArr, zArr, zReArr, zImArr, {
            title: "LEM Solver",
            env, netlist, v_rms, distance, halfSpace,
            alignMode, spl_ref_dB, appliedShift: shift
        });
    },

    // ═══════════════════════════════════════════════════════════
    // Вычисление сдвига Y
    // ═══════════════════════════════════════════════════════════
    _computeAlignShift(freqs, spl, mode, spl_ref_dB) {
        const finite = spl.filter(Number.isFinite);
        if (finite.length === 0) return 0;

        const passBand = [];
        for (let i = 0; i < freqs.length; i++) {
            if (freqs[i] >= 200 && freqs[i] <= 2000 && Number.isFinite(spl[i])) {
                passBand.push(spl[i]);
            }
        }

        switch (mode) {
            case "peak": {
                const ref = passBand.length
                    ? Math.max(...passBand)
                    : Math.max(...finite);
                return -ref;
            }
            case "median": {
                const zone = [];
                for (let i = 0; i < freqs.length; i++) {
                    if (freqs[i] >= 200 && freqs[i] <= 1000 && Number.isFinite(spl[i])) {
                        zone.push(spl[i]);
                    }
                }
                if (zone.length === 0) return 0;
                zone.sort((a, b) => a - b);
                const med = zone[Math.floor(zone.length / 2)];
                return -med;
            }
            case "spl": {
                if (spl_ref_dB === null) return 0;
                const zone = [];
                for (let i = 0; i < freqs.length; i++) {
                    if (freqs[i] >= 200 && freqs[i] <= 1000 && Number.isFinite(spl[i])) {
                        zone.push(spl[i]);
                    }
                }
                if (zone.length === 0) return 0;
                zone.sort((a, b) => a - b);
                const med = zone[Math.floor(zone.length / 2)];
                return spl_ref_dB - med;
            }
            case "none":
            default:
                return 0;
        }
    },

    // ═══════════════════════════════════════════════════════════
    // Склейка фрагментов
    // ═══════════════════════════════════════════════════════════
    _mergeFragments(fragments) {
        const GLOBAL_PORTS = new Set(["in", "gnd", "rear", "front"]);

        const nodes = new Set();
        const components = [];
        const nodeMap = new Map();

        fragments.forEach((frag, fi) => {
            const prefix = `f${fi}_${frag.source}_`;
            const ports = frag.ports || {};
            const localToPort = {};
            for (const [portName, localNode] of Object.entries(ports)) {
                localToPort[localNode] = portName;
            }
            for (const n of frag.nodes) {
                const portName = localToPort[n];
                let globalName;
                if (portName && GLOBAL_PORTS.has(portName)) {
                    globalName = portName;
                } else {
                    globalName = prefix + n;
                }
                nodeMap.set(`${fi}:${n}`, globalName);
                nodes.add(globalName);
            }
        });

        fragments.forEach((frag, fi) => {
            for (const c of frag.components) {
                const nc = { ...c };
                nc.from = nodeMap.get(`${fi}:${c.from}`) ?? c.from;
                nc.to   = nodeMap.get(`${fi}:${c.to}`)   ?? c.to;
                if (c.from2) nc.from2 = nodeMap.get(`${fi}:${c.from2}`) ?? c.from2;
                if (c.to2)   nc.to2   = nodeMap.get(`${fi}:${c.to2}`)   ?? c.to2;
                nc.id = `f${fi}_${c.id}`;
                components.push(nc);
            }
        });

        const sources = fragments.map(f => f.source);
        const normalization = fragments.find(f => f.normalization)?.normalization || null;
        const metaBySource = {};
        for (const f of fragments) {
            if (f.meta) metaBySource[f.source] = { ...metaBySource[f.source], ...f.meta };
        }

        return { nodes: Array.from(nodes), components, sources, normalization, metaBySource };
    },

    // ═══════════════════════════════════════════════════════════
    // MNA на одной частоте
    // ═══════════════════════════════════════════════════════════
    _solveAtFrequency(w, netlist, env, opts) {
        const { v_rms, distance, halfSpace } = opts;
        const nodes = netlist.nodes;
        const nodeIdx = {};
        nodes.forEach((n, i) => nodeIdx[n] = i);
        const N = nodes.length;
        const gndIdx = nodeIdx["gnd"];

        const gyrators = netlist.components.filter(c => c.type === "GYRATOR");
        const vsrcFrag = netlist.components.filter(c => c.type === "VSRC");
        const hasInput = nodeIdx["in"] !== undefined;

        const M_g = gyrators.length;
        const M_v = vsrcFrag.length;
        const M_in = hasInput ? 1 : 0;
        const size = N + 2 * M_g + M_v + M_in;

        const A = [];
        for (let i = 0; i < size; i++) {
            const row = new Array(size);
            for (let j = 0; j < size; j++) row[j] = C.zero();
            A.push(row);
        }
        const b = new Array(size);
        for (let i = 0; i < size; i++) b[i] = C.zero();

        // ── Пассивные ──
        for (const comp of netlist.components) {
            const i = nodeIdx[comp.from];
            const j = nodeIdx[comp.to];
            if (i === undefined || j === undefined) continue;

            let Y = null;
            switch (comp.type) {
                case "R":
                    Y = C.from(1 / comp.value, 0);
                    break;
                case "L":
                    Y = C.from(0, -1 / (w * comp.value));
                    break;
                case "C":
                    Y = C.from(0, w * comp.value);
                    break;
                case "R_freq": {
                    const w_ref = 2 * Math.PI * (comp.freqRef ?? 100);
                    let R;
                    switch (comp.law) {
                        case "1_over_omega": R = comp.value * (w_ref / w); break;
                        case "omega":        R = comp.value * (w / w_ref); break;
                        case "omega_sq":     R = comp.value * (w / w_ref) ** 2; break;
                        case "sqrt_omega":   R = comp.value * Math.sqrt(w / w_ref); break;
                        default:             R = comp.value;
                    }
                    Y = C.from(1 / Math.max(R, 1e-30), 0);
                    break;
                }
            }
            if (Y) this._stampY(A, i, j, Y, gndIdx);
        }

        // ── Гираторы ──
        gyrators.forEach((g, gi) => {
            const cI1 = N + 2 * gi;
            const cI2 = N + 2 * gi + 1;
            const rI1 = N + 2 * gi;
            const rI2 = N + 2 * gi + 1;

            const i1p = nodeIdx[g.from];
            const i1n = nodeIdx[g.to];
            const i2p = nodeIdx[g.from2];
            const i2n = nodeIdx[g.to2];
            const G = g.value;

            if (i1p !== undefined) A[i1p][cI1] = C.add(A[i1p][cI1], C.from(1, 0));
            if (i1n !== undefined) A[i1n][cI1] = C.sub(A[i1n][cI1], C.from(1, 0));
            if (i2p !== undefined) A[i2p][cI2] = C.add(A[i2p][cI2], C.from(1, 0));
            if (i2n !== undefined) A[i2n][cI2] = C.sub(A[i2n][cI2], C.from(1, 0));

            if (i1p !== undefined) A[rI1][i1p] = C.add(A[rI1][i1p], C.from(1, 0));
            if (i1n !== undefined) A[rI1][i1n] = C.sub(A[rI1][i1n], C.from(1, 0));
            A[rI1][cI2] = C.add(A[rI1][cI2], C.from(G, 0));

            if (i2p !== undefined) A[rI2][i2p] = C.add(A[rI2][i2p], C.from(1, 0));
            if (i2n !== undefined) A[rI2][i2n] = C.sub(A[rI2][i2n], C.from(1, 0));
            A[rI2][cI1] = C.sub(A[rI2][cI1], C.from(G, 0));
        });

        // ── VSRC из фрагментов ──
        let off = N + 2 * M_g;
        vsrcFrag.forEach((src, si) => {
            const cI = off + si;
            const rI = off + si;
            const ip = nodeIdx[src.from];
            const ineg = nodeIdx[src.to];
            if (ip !== undefined)   A[ip][cI]   = C.add(A[ip][cI], C.from(1, 0));
            if (ineg !== undefined) A[ineg][cI] = C.sub(A[ineg][cI], C.from(1, 0));
            if (ip !== undefined)   A[rI][ip]   = C.add(A[rI][ip], C.from(1, 0));
            if (ineg !== undefined) A[rI][ineg] = C.sub(A[rI][ineg], C.from(1, 0));
            b[rI] = C.from(src.value, 0);
        });

        // ── Входной источник V_in = 1 (peak) ──
        let iIn_idx = -1;
        if (hasInput) {
            const cI = off + M_v;
            const rI = off + M_v;
            iIn_idx = cI;
            const ip = nodeIdx["in"];
            const ineg = gndIdx;
            if (ip !== undefined)   A[ip][cI]   = C.add(A[ip][cI], C.from(1, 0));
            if (ineg !== undefined) A[ineg][cI] = C.sub(A[ineg][cI], C.from(1, 0));
            if (ip !== undefined)   A[rI][ip]   = C.add(A[rI][ip], C.from(1, 0));
            if (ineg !== undefined) A[rI][ineg] = C.sub(A[rI][ineg], C.from(1, 0));
            b[rI] = C.from(1, 0);
        }

        // ── Земля ──
        if (gndIdx !== undefined) {
            for (let j = 0; j < size; j++) A[gndIdx][j] = C.zero();
            A[gndIdx][gndIdx] = C.from(1, 0);
            b[gndIdx] = C.zero();
        }

        // ── Решение ──
        let x;
        try {
            x = solveComplex(A, b);
        } catch (e) {
            return {
                spl_dB: -Infinity, phase_deg: 0, U_mag: 0, x_mm: 0,
                Z_in_mag: 0, Z_in_re: 0, Z_in_im: 0
            };
        }

        // ── Извлечение ──
        let p_far = C.zero();
        let U_driver = C.zero();
        let U_mag = 0, phase_deg = 0, spl_dB = -Infinity, Z_in_mag = 0, x_mm = 0;
        let Z_in_re = 0, Z_in_im = 0;

        if (gyrators.length > 0) {
            const rho = env.rho;
            const factor = halfSpace ? 2 : 4;

            let U_sum = C.zero();

            const I2 = x[N + 2 * 0 + 1];
            U_driver = C.neg(I2);
            U_sum = C.add(U_sum, U_driver);
            U_mag = C.abs(U_driver);

            const frontIdx = nodeIdx["front"];
            if (frontIdx !== undefined) {
                for (const comp of netlist.components) {
                    if (comp.type !== "R_freq") continue;
                    if (comp.law !== "omega_sq") continue;
                    if (comp.from !== "front") continue;
                    const i1 = nodeIdx[comp.from];
                    const i2 = nodeIdx[comp.to];
                    if (i1 === undefined || i2 === undefined) continue;
                    const w_ref = 2 * Math.PI * (comp.freqRef ?? 100);
                    const R = comp.value * (w / w_ref) ** 2;
                    if (R < 1e-30) continue;
                    const V1 = x[i1];
                    const V2 = x[i2];
                    const I_rad = C.div(C.sub(V1, V2), C.from(R, 0));
                    U_sum = C.add(U_sum, I_rad);
                }
            }

            p_far = C.scale(
                C.mul(C.from(0, w * rho), U_sum),
                1 / (factor * Math.PI * distance)
            );

            const p_rms = C.abs(p_far) * v_rms;
            const p_ref_local = 20e-6;
            spl_dB = 20 * Math.log10(Math.max(p_rms / p_ref_local, 1e-30));
            phase_deg = C.arg(p_far) * 180 / Math.PI;

            const Sd = netlist.metaBySource?.speaker?.Sd_m2;
            if (Sd && Sd > 0) {
                const x_cplx = C.div(U_driver, C.from(0, w * Sd));
                x_mm = C.abs(x_cplx) * 1000;
            }
        }

        // Z_in = V_in / I_in
        if (iIn_idx >= 0) {
            const I_in = x[iIn_idx];
            const Zc = C.div(C.from(1, 0), I_in);
            Z_in_mag = C.abs(Zc);
            Z_in_re = Zc.re;
            Z_in_im = Zc.im;
        }

        return { spl_dB, phase_deg, U_mag, x_mm, Z_in_mag, Z_in_re, Z_in_im };
    },

    _stampY(A, i, j, Y, gndIdx) {
        const ai = (i !== undefined && i !== gndIdx);
        const aj = (j !== undefined && j !== gndIdx);
        if (ai) {
            A[i][i] = C.add(A[i][i], Y);
            if (aj) A[i][j] = C.sub(A[i][j], Y);
        }
        if (aj) {
            A[j][j] = C.add(A[j][j], Y);
            if (ai) A[j][i] = C.sub(A[j][i], Y);
        }
    },

    _computeEnvironment(T_C, humidity, pressure_Pa) {
        const T_K = T_C + 273.15;
        const c = 331.3 * Math.sqrt(T_K / 273.15) * (1 + 0.0016 * (humidity / 100));
        const R_specific = 287.05;
        const rho = pressure_Pa / (R_specific * T_K);
        return { T_C, T_K, humidity, pressure: pressure_Pa, c, rho };
    },

    _logspace(f_min, f_max, n) {
        const l0 = Math.log10(f_min);
        const l1 = Math.log10(f_max);
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            const t = n > 1 ? i / (n - 1) : 0;
            out[i] = Math.pow(10, l0 + t * (l1 - l0));
        }
        return out;
    },

    // ═══════════════════════════════════════════════════════════
    // Хелперы: округление, поиск пика
    // ═══════════════════════════════════════════════════════════
    _roundArr(arr, digits) {
        const k = Math.pow(10, digits);
        return arr.map(v => Number.isFinite(v) ? Math.round(v * k) / k : null);
    },

    _findPeak(xs, ys, mode) {
        // mode: 'max' | 'min'
        if (!xs || !ys || xs.length === 0) return null;
        let bestIdx = 0;
        let bestVal = (mode === 'min') ? Infinity : -Infinity;
        for (let i = 0; i < ys.length; i++) {
            if (!Number.isFinite(ys[i])) continue;
            if (mode === 'min') {
                if (ys[i] < bestVal) { bestVal = ys[i]; bestIdx = i; }
            } else {
                if (ys[i] > bestVal) { bestVal = ys[i]; bestIdx = i; }
            }
        }
        if (!Number.isFinite(bestVal)) return null;
        return { index: bestIdx, x: xs[bestIdx], y: bestVal };
    },

    _findNearestIndex(xs, value) {
        if (!xs || xs.length === 0) return -1;
        let bestIdx = 0;
        let bestDist = Math.abs(xs[0] - value);
        for (let i = 1; i < xs.length; i++) {
            const d = Math.abs(xs[i] - value);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        return bestIdx;
    },

    // ═══════════════════════════════════════════════════════════
    // Сборка JSON — graphs[] с несколькими типами
    // ═══════════════════════════════════════════════════════════
    _buildJSON(freqs, spl, phase, U, x, Z, zRe, zIm, meta) {
        const xs = this._roundArr(freqs, 2);
        const splVals = spl.map(v => Number.isFinite(v) ? Math.round(v * 1000) / 1000 : -200);
        const phaseArr = this._roundArr(phase, 2);
        const uArr = this._roundArr(U, 12);
        const xArr = this._roundArr(x, 6);
        const zArr = this._roundArr(Z, 4);
        const zReArr = this._roundArr(zRe, 4);
        const zImArr = this._roundArr(zIm, 4);

        // ── Общие metadata ──
        const commonMeta = {
            solver: "LEM v6 (complex MNA, multi-radiator)",
            sources: meta.netlist.sources,
            env: meta.env,
            drive_V_rms: meta.v_rms,
            distance_m: meta.distance,
            radiation: meta.halfSpace ? "2π" : "4π",
            speakerMeta:          meta.netlist.metaBySource?.speaker          || null,
            boxMeta:              meta.netlist.metaBySource?.box              || null,
            portMeta:             meta.netlist.metaBySource?.port             || null,
            passiveRadiatorMeta:  meta.netlist.metaBySource?.passive_radiator || null,
            wallMeta:             meta.netlist.metaBySource?.wall             || null,
            diagnostics: {
                Z_in_min_ohm: (() => {
                    const f = zArr.filter(Number.isFinite);
                    return f.length ? Number(Math.min(...f).toFixed(3)) : null;
                })(),
                Z_in_max_ohm: (() => {
                    const f = zArr.filter(Number.isFinite);
                    return f.length ? Number(Math.max(...f).toFixed(3)) : null;
                })(),
                x_max_mm: (() => {
                    const f = xArr.filter(Number.isFinite);
                    return f.length ? Number(Math.max(...f).toFixed(3)) : null;
                })(),
                U_max_m3s: (() => {
                    const f = uArr.filter(Number.isFinite);
                    return f.length ? Number(Math.max(...f).toExponential(3)) : null;
                })()
            }
        };

        // ═══════════════════════════════════════════════════════
        // ГРАФИК 1 — SPL
        // ═══════════════════════════════════════════════════════
        const splPeak = this._findPeak(xs, splVals, 'max');
        const splExtraLines = [
            { y: 0, color: "rgba(200,184,154,0.6)", label: "0 dB", dashed: false }
        ];
        if (meta.alignMode !== "none" && splPeak) {
            splExtraLines.push({
                x: splPeak.x,
                color: "rgba(255,180,80,0.7)",
                label: `Peak: ${splPeak.y.toFixed(2)} dB @ ${splPeak.x.toFixed(1)} Hz`,
                dashed: true
            });
        }

        const splYLabel = (() => {
            switch (meta.alignMode) {
                case "peak":
                case "median": return "SPL, dB (relative)";
                case "spl":    return "SPL, dB (ref)";
                default:       return "SPL, dB (absolute)";
            }
        })();

        const splFinite = splVals.filter(v => v > -199);
        const splMaxY = splFinite.length ? Math.max(...splFinite) : 0;
        const splMinY = splFinite.length ? Math.min(...splFinite) : -60;

        const splGraph = {
            type: "spl",
            label: "SPL (LEM)",
            color: "#ec2e2e",
            xValues: xs,
            yValues: splVals,
            extraLines: splExtraLines,
            compareGraphs: [],
            metadata: {
                title: "SPL (LEM)",
                unitX: "Hz",
                unitY: "dB",
                phase: phaseArr,
                align: {
                    mode: meta.alignMode,
                    applied_shift_dB: Number(meta.appliedShift.toFixed(3)),
                    spl_ref_dB: meta.spl_ref_dB
                },
                ...commonMeta
            },
            settings: {
                xAxis: {
                    label: "Frequency, Hz",
                    min: Math.round(freqs[0]),
                    max: Math.round(freqs[freqs.length - 1]),
                    log: true,
                    precision: 0
                },
                yAxis: {
                    label: splYLabel,
                    min: Math.floor(splMinY / 10) * 10 - 5,
                    max: Math.ceil(Math.max(splMaxY, 0) / 10) * 10 + 5,
                    log: false,
                    precision: 1
                },
                appearance: {
                    lineWidth: 1.8,
                    fillOpacity: 0.15,
                    pointSize: 1.5,
                    showPoints: false,
                    showGrid: true,
                    showLegend: true,
                    showFill: true
                }
            }
        };

        // ═══════════════════════════════════════════════════════
        // ГРАФИК 2 — Xmax (смещение динамика, мм)
        // ═══════════════════════════════════════════════════════
        const xPeak = this._findPeak(xs, xArr, 'max');

        // Паспортный Xmax динамика (если известен)
        const speakerXmax = meta.netlist.metaBySource?.speaker?.xmax_mm
            ?? meta.netlist.metaBySource?.speaker?.Xmax_mm
            ?? null;

        const xExtraLines = [];
        if (xPeak) {
            xExtraLines.push({
                x: xPeak.x,
                color: "rgba(255,180,80,0.75)",
                label: `Peak: ${xPeak.y.toFixed(3)} mm @ ${xPeak.x.toFixed(1)} Hz`,
                dashed: true
            });
        }
        if (typeof speakerXmax === "number" && speakerXmax > 0) {
            xExtraLines.push({
                y: speakerXmax,
                color: "rgba(220,80,80,0.85)",
                label: `Xmax (driver): ${speakerXmax.toFixed(2)} mm`,
                dashed: true
            });
            xExtraLines.push({
                y: -speakerXmax,
                color: "rgba(220,80,80,0.85)",
                label: `−Xmax: ${(-speakerXmax).toFixed(2)} mm`,
                dashed: true
            });
        }

        const xFinite = xArr.filter(Number.isFinite);
        const xMaxVal = xFinite.length ? Math.max(...xFinite) : 1;

        // Верхняя граница оси Y — либо удвоенный пик, либо Xmax×2 (что больше)
        let xAxisMax = Math.ceil(xMaxVal * 1.15 * 100) / 100;
        if (typeof speakerXmax === "number" && speakerXmax > 0) {
            xAxisMax = Math.max(xAxisMax, speakerXmax * 1.5);
        }

        const xGraph = {
            type: "xmax",
            label: "X, mm",
            color: "#66ff88",
            xValues: xs,
            yValues: xArr,
            extraLines: xExtraLines,
            compareGraphs: [],
            metadata: {
                title: "Cone excursion (LEM)",
                unitX: "Hz",
                unitY: "mm",
                xmax_driver_mm: speakerXmax,
                ...commonMeta
            },
            settings: {
                xAxis: {
                    label: "Frequency, Hz",
                    min: Math.round(freqs[0]),
                    max: Math.round(freqs[freqs.length - 1]),
                    log: true,
                    precision: 0
                },
                yAxis: {
                    label: "X, mm",
                    min: 0,
                    max: xAxisMax,
                    log: false,
                    precision: 3
                },
                appearance: {
                    lineWidth: 1.8,
                    fillOpacity: 0.15,
                    pointSize: 1.5,
                    showPoints: false,
                    showGrid: true,
                    showLegend: true,
                    showFill: true
                }
            }
        };

        // ═══════════════════════════════════════════════════════
        // ГРАФИК 3 — Impedance (модуль + отдельные Re/Im как compare)
        // ═══════════════════════════════════════════════════════
        const zPeak = this._findPeak(xs, zArr, 'max');
        const zMin = this._findPeak(xs, zArr, 'min');

        const zExtraLines = [];
        if (zPeak) {
            zExtraLines.push({
                x: zPeak.x,
                color: "rgba(255,180,80,0.75)",
                label: `Z max: ${zPeak.y.toFixed(2)} Ω @ ${zPeak.x.toFixed(1)} Hz`,
                dashed: true
            });
        }
        if (zMin) {
            zExtraLines.push({
                x: zMin.x,
                color: "rgba(120,200,140,0.75)",
                label: `Z min: ${zMin.y.toFixed(2)} Ω @ ${zMin.x.toFixed(1)} Hz`,
                dashed: true
            });
        }

        // Границы Y — по всем трём кривым
        const zAllValues = [];
        for (const v of zArr)   if (Number.isFinite(v)) zAllValues.push(v);
        for (const v of zReArr) if (Number.isFinite(v)) zAllValues.push(v);
        for (const v of zImArr) if (Number.isFinite(v)) zAllValues.push(v);

        const zMaxY = zAllValues.length ? Math.max(...zAllValues) : 100;
        const zMinY = zAllValues.length ? Math.min(...zAllValues) : 0;

        const zGraph = {
            type: "impedance",
            label: "Z_in, Ω",
            color: "#66ddff",
            xValues: xs,
            yValues: zArr,
            extraLines: zExtraLines,
            metadata: {
                title: "Input impedance (LEM)",
                unitX: "Hz",
                unitY: "Ω",
                zRe: zReArr,
                zIm: zImArr,
                ...commonMeta
            },
            settings: {
                xAxis: {
                    label: "Frequency, Hz",
                    min: Math.round(freqs[0]),
                    max: Math.round(freqs[freqs.length - 1]),
                    log: true,
                    precision: 0
                },
                yAxis: {
                    label: "Z, Ω",
                    min: Math.max(0, Math.floor(zMinY / 5) * 5 - 5),
                    max: Math.ceil(zMaxY / 5) * 5 + 5,
                    log: false,
                    precision: 1
                },
                appearance: {
                    lineWidth: 1.8,
                    fillOpacity: 0.15,
                    pointSize: 1.5,
                    showPoints: false,
                    showGrid: true,
                    showLegend: true,
                    showFill: true
                }
            }
        };

        // ═══════════════════════════════════════════════════════
        // Итоговый JSON — верхний уровень
        // ═══════════════════════════════════════════════════════
        return {
            version: "2.0.0",
            graphs: [splGraph, xGraph, zGraph],
            metadata: {
                title: "LEM Solver",
                timestamp: new Date().toISOString(),
                solver: "LEM v6"
            }
        };
    }
};

// ═══════════════════════════════════════════════════════════════
// Экспорт JSON в файл
// ═══════════════════════════════════════════════════════════════
function exportJSON(data, host) {
    try {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lem_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (host && typeof host.notify === 'function') {
            host.notify('Export', 'JSON saved', 'success');
        }
    } catch (e) {
        console.error('[LEMsolver] export failed:', e);
        if (host && typeof host.notify === 'function') {
            host.notify('Export error', String(e.message || e), 'error');
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Отправка в Graphic
// ═══════════════════════════════════════════════════════════════
function sendToGraphic(data, host) {
    if (!host) {
        console.warn('[LEMsolver] sendToGraphic: no host');
        return;
    }

    // Новый формат: { graphs: [...], metadata: {...} }
    const payload = {
        graphs: Array.isArray(data.graphs) ? data.graphs : [],
        metadata: data.metadata || {}
    };

    let targetWindow = null;
    try {
        if (typeof host.findWindowByType === 'function') {
            targetWindow = host.findWindowByType('graphic');
        }
    } catch (e) {
        console.warn('[LEMsolver] findWindowByType failed:', e);
    }

    if (targetWindow && targetWindow.id != null) {
        try {
            host.sendMessage('graphic:load', payload, targetWindow.id);
            if (typeof host.notify === 'function') {
                host.notify('Send', 'Sent to Graphic', 'success');
            }
        } catch (e) {
            console.error('[LEMsolver] sendMessage failed:', e);
            if (typeof host.notify === 'function') {
                host.notify('Send error', String(e.message || e), 'error');
            }
        }
        return;
    }

    let opened = null;
    try {
        if (typeof host.createWindowByType === 'function') {
            opened = host.createWindowByType('graphic');
        } else if (typeof host.openWindow === 'function') {
            opened = host.openWindow('graphic');
        } else if (typeof host.openWindowByType === 'function') {
            opened = host.openWindowByType('graphic');
        }
    } catch (e) {
        console.warn('[LEMsolver] open graphic failed:', e);
    }

    if (!opened) {
        if (typeof host.notify === 'function') {
            host.notify('Send', 'Open Graphic window first', 'warning');
        }
        return;
    }

    setTimeout(() => {
        try {
            host.sendMessage('graphic:load', payload, opened.id);
            if (typeof host.notify === 'function') {
                host.notify('Send', 'Graphic opened, data sent', 'success');
            }
        } catch (e) {
            console.error('[LEMsolver] send after open failed:', e);
        }
    }, 300);
}