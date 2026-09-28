// data/nodes/Acoustics/LEMsolver.js
// LEM Solver v21.3 — УНИВЕРСАЛЬНОЕ СУММИРОВАНИЕ ИЗЛУЧЕНИЯ
//
// Изменения v21.3 (относительно v21.2):
//   - Удалён law 'sqrt_omega_nonlin' (нелинейность порта отключена).
//
// Изменения v21.2:
//   - _collectFragments: двухпроходный обход.
//   - _buildNetlist: root-based connectedRoots.
//   - _solveAtFrequency: учёт ep.emit.delay_m.
//
// Изменения v21.1:
//   - Универсальное разделение U_emit и U_total.
//   - spl_abs = spl - shift.

'use strict';

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
        if (!Number.isFinite(d) || d <= 1e-300) return { re: 0, im: 0 };
        return {
            re: (a.re * b.re + a.im * b.im) / d,
            im: (a.im * b.re - a.re * b.im) / d
        };
    },
    scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
    neg: (a) => ({ re: -a.re, im: -a.im }),
    abs: (a) => Math.hypot(a.re, a.im),
    arg: (a) => Math.atan2(a.im, a.re)
};

function solveComplex(A, b) {
    const n = b.length;
    const M = A.map(row => row.map(v => ({ re: v.re, im: v.im })));
    const x = b.map(v => ({ re: v.re, im: v.im }));
    const rs = new Array(n);
    let matrixAbsMax = 1;

    for (let i = 0; i < n; i++) {
        let mx = 0;
        for (let j = 0; j < n; j++) {
            const m = Math.hypot(M[i][j].re, M[i][j].im);
            if (m > mx) mx = m;
            if (m > matrixAbsMax) matrixAbsMax = m;
        }
        rs[i] = mx > 1e-300 ? mx : 1;
    }

    const pivotTol = 1e-14 * Math.max(1, matrixAbsMax);

    for (let col = 0; col < n; col++) {
        let pivot = col;
        let best = C.abs(M[col][col]) / rs[col];
        for (let r = col + 1; r < n; r++) {
            const m = C.abs(M[r][col]) / rs[r];
            if (m > best) { best = m; pivot = r; }
        }
        if (best < pivotTol) {
            throw new Error(`LEM: singular matrix at column ${col} (best=${best.toExponential(3)}, tol=${pivotTol.toExponential(3)})`);
        }
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

class DSU {
    constructor() { this.parent = new Map(); }
    find(x) {
        if (!this.parent.has(x)) { this.parent.set(x, x); return x; }
        let p = this.parent.get(x);
        if (p !== x) { p = this.find(p); this.parent.set(x, p); }
        return p;
    }
    union(a, b) {
        const ra = this.find(a), rb = this.find(b);
        if (ra !== rb) this.parent.set(ra, rb);
    }
}

module.exports = {
    meta: {
        id: "Acoustics.lem_solver",
        label: "LEM Solver",
        icon: "icon-solver"
    },

    ports: {
        inputs:  [ { id: "in", label: "In" } ],
        outputs: []
    },

    inputRules:  { in: ["*"] },
    outputRules: {},

    maxInputs:  { in: "*" },
    maxOutputs: {},

    params: [
        { id: "f_min",       type: "number", label: "F min, Hz",       default: 10,     category: "Sweep" },
        { id: "f_max",       type: "number", label: "F max, Hz",       default: 20000,  category: "Sweep" },
        { id: "f_points",    type: "int",    label: "Points",          default: 300,    category: "Sweep" },
        { id: "v_rms",       type: "number", label: "Drive, V RMS",    default: 2.83,   category: "Drive" },
        { id: "distance",    type: "number", label: "Distance, m",     default: 1.0,    category: "Drive" },
        { id: "port_distance", type: "number", label: "Port–driver dist., m", default: 0.10, category: "Drive" },
        { id: "half_space",  type: "bool",   label: "Half-space (2π)", default: true,   category: "Drive" },
        { id: "baffle_step", type: "bool",   label: "Baffle step (2π→4π)", default: true, category: "Drive" },
        { id: "baffle_width", type: "number", label: "Baffle width, m", default: 0.30, category: "Drive" },
        { id: "temperature", type: "number", label: "T, °C",           default: 20,     category: "Env" },
        { id: "humidity",    type: "number", label: "RH, %",           default: 50,     category: "Env" },
        { id: "pressure",    type: "number", label: "P, Pa",           default: 101325, category: "Env" },
        {
            id: "align",
            type: "select",
            label: "Y align",
            default: "median",
            options: [
                { value: "peak",   label: "Peak (in band) → 0 dB" },
                { value: "median", label: "Median 200–1000 → 0 dB" },
                { value: "band",   label: "Median (custom band) → 0 dB" },
                { value: "spl",    label: "Absolute (SPL_ref)" },
                { value: "none",   label: "None (raw)" }
            ],
            category: "Output"
        },
        { id: "align_band_lo", type: "number", label: "Align band lo, Hz", default: 100, category: "Output" },
        { id: "align_band_hi", type: "number", label: "Align band hi, Hz", default: 500, category: "Output" }
    ],

    buttons: [
        { id: "run",    label: "Run",    icon: "icon-play" },
        { id: "export", label: "Export", icon: "icon-export" },
        { id: "send",   label: "Send",   icon: "icon-graphic" }
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

        const collected = await this._collectFragments(ctx, inputs);
        if (collected.length === 0) throw new Error("LEM: no fragments found");

        const env = this._computeEnvironment(
            Number(ctx.params.temperature),
            Number(ctx.params.humidity),
            Number(ctx.params.pressure)
        );

        const netlist = this._buildNetlist(collected, inputs, ctx, env);

        const f_min = Number(ctx.params.f_min);
        const f_max = Number(ctx.params.f_max);
        const f_points = Math.max(50, Math.floor(Number(ctx.params.f_points)));
        if (!(f_min > 0) || !(f_max > f_min)) throw new Error("LEM: bad frequency range");

        const v_rms = Math.max(1e-9, Number(ctx.params.v_rms));
        const distance = Math.max(0.01, Number(ctx.params.distance));
        const halfSpace = ctx.params.half_space === true || ctx.params.half_space === "true";
        const baffleStep = ctx.params.baffle_step === true || ctx.params.baffle_step === "true";
        const baffleWidth = Math.max(0.01, Number(ctx.params.baffle_width) || 0.30);
        const alignMode = String(ctx.params.align || "median");
        const alignBandLo = Number(ctx.params.align_band_lo) || 100;
        const alignBandHi = Number(ctx.params.align_band_hi) || 500;

        const freqs = this._logspace(f_min, f_max, f_points);
        const vPeak = v_rms * Math.SQRT2;

        const splArr   = new Array(freqs.length);
        const phaseArr = new Array(freqs.length);
        const uArr     = new Array(freqs.length);
        const uPortArr = new Array(freqs.length);
        const xArr     = new Array(freqs.length);
        const zArr     = new Array(freqs.length);
        const zReArr   = new Array(freqs.length);
        const zImArr   = new Array(freqs.length);
        const zArgArr  = new Array(freqs.length);
        const pArr     = new Array(freqs.length);

        const spl_ref_dB = netlist.spl_ref_dB;
        let singularCount = 0;

        for (let i = 0; i < freqs.length; i++) {
            const w = 2 * Math.PI * freqs[i];
            let sol;
            try {
                sol = this._solveAtFrequency(w, netlist, env, {
                    v_rms, distance, halfSpace, baffleStep, baffleWidth
                });
            } catch (e) {
                singularCount++;
                sol = this._emptyResult();
            }
            splArr[i]   = sol.spl_dB;
            phaseArr[i] = sol.phase_deg;
            uArr[i]     = sol.U_total * vPeak;
            uPortArr[i] = (sol.U_emit || 0) * vPeak;
            xArr[i]     = sol.x_mm  * vPeak;
            zArr[i]     = sol.Z_in_mag;
            zReArr[i]   = sol.Z_in_re;
            zImArr[i]   = sol.Z_in_im;
            zArgArr[i]  = sol.Z_in_arg_deg;
            pArr[i]     = sol.P_in_W;
        }

        if (singularCount > 0) {
            console.warn(`[LEM v21.3] ${singularCount} / ${freqs.length} точек singular`);
        }

        const phaseUnwrapped = this._unwrapPhaseFromEnd(phaseArr, freqs);
        const gdArr = this._groupDelay(freqs, phaseUnwrapped);

        const splAbsArr = splArr.slice();
        const splAbsPeak = this._findPeak(freqs, splAbsArr, 'max');

        const shift = this._computeAlignShift(
            freqs, splArr, alignMode, spl_ref_dB,
            alignBandLo, alignBandHi
        );
        const splFinal = splArr.map(v => Number.isFinite(v) ? v + shift : -200);

        return this._buildJSON(
            freqs,
            splFinal, phaseUnwrapped, gdArr,
            uArr, uPortArr, xArr,
            zArr, zReArr, zImArr, zArgArr,
            pArr,
            {
                title: "LEM Solver v21.3",
                env, netlist, v_rms, distance, halfSpace,
                baffleStep, baffleWidth,
                alignMode, spl_ref_dB, appliedShift: shift,
                alignBandLo, alignBandHi,
                vPeak, tau0_ms: (distance / env.c) * 1000,
                singularCount,
                splAbsArr, splAbsPeak
            }
        );
    },

    async _collectFragments(ctx, inputs) {
        const visited = new Set();
        const collected = [];

        const visit = async (nodeId, path) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const node = ctx.graph.getNode(nodeId);
            if (!node) return;

            let r;
            try {
                r = await ctx.requestCompute(nodeId);
            } catch (e) {
                return;
            }
            if (!r || r.kind !== 'lem.fragment') return;

            collected.push({
                node,
                fragment: r,
                path: [...path, { nodeId, source: r.source }]
            });

            const incoming = ctx.graph.connections.filter(c => c.toNodeId === nodeId);
            for (const c of incoming) {
                await visit(c.fromNodeId, [...path, { nodeId, source: r.source }]);
            }
        };

        for (const inp of inputs) {
            await visit(inp.id, []);
        }

        const allNodes = ctx.graph.nodes || [];
        for (const n of allNodes) {
            if (visited.has(n.id)) continue;
            if (!n.def) continue;
            if (n.def.file === 'LEMsolver.js') continue;
            await visit(n.id, []);
        }

        return collected;
    },

    _buildNetlist(collected, solverInputs, ctx, env) {
        const dsu = new DSU();

        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            for (const n of frag.nodes) dsu.find(`${fi}:${n}`);
        }

        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            if (Array.isArray(frag.mergedPorts)) {
                for (const mp of frag.mergedPorts) {
                    dsu.union(`${fi}:${mp.a}`, `${fi}:${mp.b}`);
                }
            }
        }

        const solverNodeId = ctx.node && ctx.node.id != null ? ctx.node.id : null;
        const portMap = new Map();
        for (let fi = 0; fi < collected.length; fi++) {
            const c = collected[fi];
            const frag = c.fragment;
            const ports = frag.ports || {};
            for (const [portName, localName] of Object.entries(ports)) {
                portMap.set(`${c.node.id}:${portName}`, { fi, local: localName });
            }
        }

        const gndTarget = '::GND::';
        dsu.find(gndTarget);
        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            const ports = frag.ports || {};
            if (ports.gnd) dsu.union(`${fi}:${ports.gnd}`, gndTarget);
        }

        const radiatingByFrag = new Map();
        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            const radPorts = Array.isArray(frag.radiatingPorts) ? frag.radiatingPorts : [];
            const map = new Map();
            for (const rp of radPorts) {
                if (typeof rp === 'string') {
                    map.set(rp, { fallback: true });
                } else if (rp && rp.port) {
                    map.set(rp.port, rp.emit ? { emit: rp.emit } : { fallback: true });
                }
            }
            radiatingByFrag.set(fi, map);
        }

        for (const conn of ctx.graph.connections) {
            const k1 = `${conn.fromNodeId}:${conn.fromPortId}`;
            const k2 = `${conn.toNodeId}:${conn.toPortId}`;
            const p1 = portMap.get(k1);
            const p2 = portMap.get(k2);
            if (!p1 || !p2) continue;

            const isRad1 = radiatingByFrag.get(p1.fi)?.has(conn.fromPortId);
            const isRad2 = radiatingByFrag.get(p2.fi)?.has(conn.toPortId);
            const toSolver1 = solverNodeId != null && String(conn.toNodeId) === String(solverNodeId);
            const toSolver2 = solverNodeId != null && String(conn.fromNodeId) === String(solverNodeId);

            if ((isRad1 && toSolver1) || (isRad2 && toSolver2)) continue;

            dsu.union(`${p1.fi}:${p1.local}`, `${p2.fi}:${p2.local}`);
        }

        let inNode = null;
        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            if (frag.ports && frag.ports.in) {
                inNode = dsu.find(`${fi}:${frag.ports.in}`);
                break;
            }
        }
        const gndNode = dsu.find(gndTarget);

        const connectedRoots = new Set();
        for (const conn of ctx.graph.connections) {
            const toKey = `${conn.toNodeId}:${conn.toPortId}`;
            const fromKey = `${conn.fromNodeId}:${conn.fromPortId}`;
            const pTo = portMap.get(toKey);
            const pFrom = portMap.get(fromKey);

            const isRadTo = pTo && radiatingByFrag.get(pTo.fi)?.has(conn.toPortId);
            const isRadFrom = pFrom && radiatingByFrag.get(pFrom.fi)?.has(conn.fromPortId);
            const toSolver = solverNodeId != null && String(conn.toNodeId) === String(solverNodeId);
            const fromSolver = solverNodeId != null && String(conn.fromNodeId) === String(solverNodeId);

            if (isRadFrom && toSolver) continue;
            if (isRadTo && fromSolver) continue;

            if (pTo)   connectedRoots.add(dsu.find(`${pTo.fi}:${pTo.local}`));
            if (pFrom) connectedRoots.add(dsu.find(`${pFrom.fi}:${pFrom.local}`));
        }

        for (let fi = 0; fi < collected.length; fi++) {
            const frag = collected[fi].fragment;
            const ports = frag.ports || {};
            for (const [pName, localName] of Object.entries(ports)) {
                if (pName === 'gnd' || pName === 'in') continue;
                const root = dsu.find(`${fi}:${localName}`);
                if (!connectedRoots.has(root)) {
                    dsu.union(root, gndTarget);
                }
            }
        }

        const emittingPorts = [];

        for (let fi = 0; fi < collected.length; fi++) {
            const c = collected[fi];
            const frag = c.fragment;
            const src = frag.source;
            const radMap = radiatingByFrag.get(fi);
            if (!radMap || radMap.size === 0) continue;

            const outConns = ctx.graph.connections.filter(cc => cc.fromNodeId === c.node.id);

            for (const [pName, spec] of radMap.entries()) {
                if (!frag.ports || frag.ports[pName] === undefined) continue;
                const conn = outConns.find(cc => cc.fromPortId === pName);
                const radiates = !conn || String(conn.toNodeId) === String(solverNodeId);
                if (!radiates) continue;
                emittingPorts.push({
                    fi,
                    portName: pName,
                    localNode: frag.ports[pName],
                    source: src,
                    emit: spec.emit || null,
                    fallback: !!spec.fallback,
                    delay: 0
                });
            }
        }

        const components = [];
        const nodeNames = new Map();
        let nodeCounter = 0;

        const getGlobalName = (localKey) => {
            const root = dsu.find(localKey);
            if (!nodeNames.has(root)) {
                if (root === gndNode) nodeNames.set(root, 'gnd');
                else if (root === inNode) nodeNames.set(root, 'in');
                else nodeNames.set(root, `n${nodeCounter++}`);
            }
            return nodeNames.get(root);
        };

        for (let fi = 0; fi < collected.length; fi++) {
            const c = collected[fi];
            const frag = c.fragment;
            for (const comp of frag.components) {
                const nc = { ...comp };
                nc.from = getGlobalName(`${fi}:${comp.from}`);
                nc.to   = getGlobalName(`${fi}:${comp.to}`);
                if (comp.from2) nc.from2 = getGlobalName(`${fi}:${comp.from2}`);
                if (comp.to2)   nc.to2   = getGlobalName(`${fi}:${comp.to2}`);
                nc.id = `f${fi}_${comp.id}`;
                nc.fragIdx = fi;
                nc.source = frag.source;
                components.push(nc);
            }
        }

        const emittingPortsGlobal = emittingPorts.map(p => {
            const frag = collected[p.fi].fragment;
            const localToGlobal = {};
            for (const nodeName of frag.nodes) {
                localToGlobal[nodeName] = getGlobalName(`${p.fi}:${nodeName}`);
            }
            return {
                ...p,
                globalNode: getGlobalName(`${p.fi}:${p.localNode}`),
                localToGlobal,
                meta: frag.meta || {}
            };
        });

        const metaBySource = {};
        for (const { fragment: f } of collected) {
            if (f.meta) metaBySource[f.source] = { ...metaBySource[f.source], ...f.meta };
        }
        const spl_ref_dB = collected.find(c => c.fragment.normalization)?.fragment.normalization?.spl_ref_dB ?? null;

        const allNodes = new Set(Array.from(nodeNames.values()));
        allNodes.add('gnd');
        if (inNode) allNodes.add('in');

        const speakerMeta = metaBySource.speaker || {};
        const Sd_total = speakerMeta.Sd_m2 || 0.022;

        return {
            nodes: Array.from(allNodes),
            components,
            emittingPorts: emittingPortsGlobal,
            inNode: 'in',
            gndNode: 'gnd',
            metaBySource,
            spl_ref_dB,
            Sd_total,
            env,
            sources: collected.map(c => c.fragment.source)
        };
    },

    _solveAtFrequency(w, netlist, env, opts) {
        const { v_rms, distance, halfSpace, baffleStep, baffleWidth } = opts;
        const nodes = netlist.nodes;
        const nodeIdx = {};
        nodes.forEach((n, i) => nodeIdx[n] = i);
        const N = nodes.length;
        const gndIdx = nodeIdx['gnd'];
        const inIdx = nodeIdx['in'];

        const gyrators = netlist.components.filter(c => c.type === 'GYRATOR');

        const M_g = gyrators.length;
        const size = N + 2 * M_g + 1;

        const A = [];
        for (let i = 0; i < size; i++) {
            const row = new Array(size);
            for (let j = 0; j < size; j++) row[j] = C.zero();
            A.push(row);
        }
        const b = new Array(size);
        for (let i = 0; i < size; i++) b[i] = C.zero();

        for (const comp of netlist.components) {
            const i = nodeIdx[comp.from];
            const j = nodeIdx[comp.to];
            if (i === undefined || j === undefined) continue;

            let Y = null;
            switch (comp.type) {
                case 'R': {
                    const R = Math.max(comp.value, 1e-30);
                    Y = C.from(1 / R, 0);
                    break;
                }
                case 'L': {
                    const L = Math.max(comp.value, 1e-30);
                    Y = C.from(0, -1 / (w * L));
                    break;
                }
                case 'C': {
                    const Cap = Math.max(comp.value, 1e-30);
                    Y = C.from(0, w * Cap);
                    break;
                }
                case 'R_freq': {
                    const R_phys = this._evalRfreq(comp, w, netlist);
                    Y = C.from(1 / Math.max(R_phys, 1e-30), 0);
                    break;
                }
                case 'L_freq': {
                    const L_phys = this._evalLfreq(comp, w);
                    Y = C.from(0, -1 / (w * Math.max(L_phys, 1e-30)));
                    break;
                }
            }
            if (Y) this._stampY(A, i, j, Y, gndIdx);
        }

        gyrators.forEach((g, gi) => {
            const cIe = N + 2 * gi;
            const cIa = N + 2 * gi + 1;
            const eP = nodeIdx[g.from];
            const eN = nodeIdx[g.to];
            const aP = nodeIdx[g.from2];
            const aN = nodeIdx[g.to2];
            const G = g.value;

            if (eP !== undefined) A[eP][cIe] = C.add(A[eP][cIe], C.from(1, 0));
            if (eN !== undefined) A[eN][cIe] = C.sub(A[eN][cIe], C.from(1, 0));
            if (aP !== undefined) A[aP][cIa] = C.add(A[aP][cIa], C.from(1, 0));
            if (aN !== undefined) A[aN][cIa] = C.sub(A[aN][cIa], C.from(1, 0));

            A[cIe][cIe] = C.add(A[cIe][cIe], C.from(1, 0));
            if (aP !== undefined) A[cIe][aP] = C.sub(A[cIe][aP], C.from(G, 0));
            if (aN !== undefined) A[cIe][aN] = C.add(A[cIe][aN], C.from(G, 0));

            A[cIa][cIa] = C.add(A[cIa][cIa], C.from(1, 0));
            if (eP !== undefined) A[cIa][eP] = C.add(A[cIa][eP], C.from(G, 0));
            if (eN !== undefined) A[cIa][eN] = C.sub(A[cIa][eN], C.from(G, 0));
        });

        let iInIdx = -1;
        if (inIdx !== undefined && inIdx !== gndIdx) {
            const cI = N + 2 * M_g;
            iInIdx = cI;
            A[inIdx][cI] = C.sub(A[inIdx][cI], C.from(1, 0));
            A[cI][inIdx] = C.sub(A[cI][inIdx], C.from(1, 0));
            b[cI] = C.from(1, 0);
        }

        if (gndIdx !== undefined) {
            for (let j = 0; j < size; j++) A[gndIdx][j] = C.zero();
            A[gndIdx][gndIdx] = C.from(1, 0);
            b[gndIdx] = C.zero();
        }

        const nodeConnCount = new Array(N).fill(0);
        for (const comp of netlist.components) {
            const i = nodeIdx[comp.from];
            const j = nodeIdx[comp.to];
            if (i !== undefined && i !== gndIdx) nodeConnCount[i]++;
            if (j !== undefined && j !== gndIdx) nodeConnCount[j]++;
        }
        for (const g of gyrators) {
            const eP = nodeIdx[g.from];
            const aP = nodeIdx[g.from2];
            if (eP !== undefined && eP !== gndIdx) nodeConnCount[eP]++;
            if (aP !== undefined && aP !== gndIdx) nodeConnCount[aP]++;
        }
        if (inIdx !== undefined) nodeConnCount[inIdx]++;

        for (let i = 0; i < N; i++) {
            if (i === gndIdx) continue;
            if (nodes[i] === 'in') continue;
            if (nodeConnCount[i] === 0) {
                for (let j = 0; j < size; j++) A[i][j] = C.zero();
                A[i][i] = C.from(1, 0);
                b[i] = C.zero();
            }
        }

        let x;
        try {
            x = solveComplex(A, b);
        } catch (e) {
            throw e;
        }

        const I_in = iInIdx >= 0 ? x[iInIdx] : C.zero();
        const Zc = C.div(C.from(-1, 0), I_in);
        const Z_in_mag = C.abs(Zc);
        const Z_in_re = Zc.re;
        const Z_in_im = Zc.im;
        const Z_in_arg_deg = C.arg(Zc) * 180 / Math.PI;

        let P_in_W = 0;
        const denom = Z_in_re * Z_in_re + Z_in_im * Z_in_im;
        if (Number.isFinite(denom) && denom > 1e-30) {
            P_in_W = (v_rms * v_rms * Z_in_re) / denom;
            if (!Number.isFinite(P_in_W) || P_in_W < 0) P_in_W = 0;
        }

        const rho = env.rho;
        const c = env.c;

        let K = halfSpace ? 2 : 4;
        if (baffleStep && baffleWidth > 0) {
            const f_baffle = c / (Math.PI * baffleWidth);
            const f = w / (2 * Math.PI);
            K = 2 + 2 / (1 + (f / f_baffle) ** 2);
            if (!halfSpace) K *= 2;
        }

        let U_total = C.zero();
        let U_emit_total = C.zero();

        for (const ep of netlist.emittingPorts) {
            let U = null;

            if (ep.emit && ep.emit.kind === 'current_through') {
                const fromGlobal = ep.localToGlobal[ep.emit.from];
                const toGlobal   = ep.localToGlobal[ep.emit.to];
                if (fromGlobal !== undefined && toGlobal !== undefined) {
                    const i1 = nodeIdx[fromGlobal];
                    const i2 = nodeIdx[toGlobal];
                    if (i1 !== undefined && i2 !== undefined) {
                        const V = C.sub(x[i1], x[i2]);
                        const Y = this._evalAdmittance(ep.emit.admittance, w, netlist);
                        const sign = Number(ep.emit.sign) || +1;
                        U = C.scale(C.mul(Y, V), sign);
                    }
                }
            }

            if (!U && ep.fallback) {
                const nodeG = ep.globalNode;
                const radComp = netlist.components.find(c =>
                    c.type === 'R_freq' &&
                    (c.to === nodeG || c.from === nodeG) &&
                    typeof c.law === 'string' &&
                    c.law.startsWith('rad_')
                );
                if (radComp) {
                    const i1 = nodeIdx[radComp.from];
                    const i2 = nodeIdx[radComp.to];
                    if (i1 !== undefined && i2 !== undefined) {
                        const V = C.sub(x[i1], x[i2]);
                        const R_phys = this._evalRfreq(radComp, w, netlist);
                        if (R_phys > 1e-30) {
                            U = C.neg(C.div(V, C.from(R_phys, 0)));
                        }
                    }
                }
            }
            if (U) {
                const delay_m = Number(ep.emit?.delay_m) || Number(ep.delay_m) || 0;
                if (delay_m > 0) {
                    const phase = w * delay_m / (netlist.env?.c ?? 343);
                    const rot = { re: Math.cos(-phase), im: Math.sin(-phase) };
                    U = C.mul(U, rot);
                }

                const isDriver = ep.source === 'speaker';
                if (isDriver) {
                    U_total = C.add(U_total, U);
                } else {
                    U_emit_total = C.add(U_emit_total, U);
                    U_total = C.add(U_total, U);
                }
            }
        }

        let spl_dB = -Infinity;
        let phase_deg = 0;

        if (C.abs(U_total) > 1e-30) {
            const p_far = C.scale(
                C.mul(C.from(0, w * rho), U_total),
                1 / (K * Math.PI * distance)
            );
            const p_rms = C.abs(p_far) * v_rms;
            spl_dB = 20 * Math.log10(Math.max(p_rms / 20e-6, 1e-30));
            phase_deg = C.arg(p_far) * 180 / Math.PI;
        }

        let x_mm = 0;
        const maComp = netlist.components.find(c =>
            c.source === 'speaker' &&
            (c.id.endsWith('_Ma') || c.id === 'Ma' || c.id.endsWith('Ma'))
        );
        if (maComp) {
            const i1 = nodeIdx[maComp.from];
            const i2 = nodeIdx[maComp.to];
            const Ma_val = Number(maComp.value);
            if (i1 !== undefined && i2 !== undefined && Ma_val > 0) {
                const V_ma = C.sub(x[i1], x[i2]);
                const jwMa = C.from(0, w * Ma_val);
                const I_ma = C.div(V_ma, jwMa);
                const jw = C.from(0, w);
                const V_disp = C.div(I_ma, jw);
                x_mm = C.abs(V_disp) / netlist.Sd_total * 1000;
            }
        }

        return {
            spl_dB, phase_deg,
            U_total: C.abs(U_total),
            U_emit: C.abs(U_emit_total),
            x_mm,
            Z_in_mag, Z_in_re, Z_in_im, Z_in_arg_deg,
            P_in_W
        };
    },

    _evalAdmittance(adm, w, netlist) {
        if (!adm) return C.zero();
        switch (adm.type) {
            case 'R': {
                const R = Math.max(Number(adm.value) || 0, 1e-30);
                return C.from(1 / R, 0);
            }
            case 'L': {
                const L = Math.max(Number(adm.value) || 0, 1e-30);
                return C.from(0, -1 / (w * L));
            }
            case 'C': {
                const Cap = Math.max(Number(adm.value) || 0, 1e-30);
                return C.from(0, w * Cap);
            }
            case 'R_freq': {
                const R = this._evalRfreq(
                    { value: adm.value, freqRef: adm.freqRef, law: adm.law,
                    radiationRadius_m: adm.radiationRadius_m },
                    w, netlist
                );
                return C.from(1 / Math.max(R, 1e-30), 0);
            }
            default:
                return C.zero();
        }
    },

    _emptyResult() {
        return {
            spl_dB: -Infinity, phase_deg: 0,
            U_total: 0, U_emit: 0, x_mm: 0,
            Z_in_mag: 0, Z_in_re: 0, Z_in_im: 0, Z_in_arg_deg: 0,
            P_in_W: 0
        };
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

    _evalRfreq(comp, w, netlist) {
        const w_ref = 2 * Math.PI * (comp.freqRef ?? 100);
        switch (comp.law) {
            case "1_over_omega":   return comp.value * (w_ref / w);
            case "omega":          return comp.value * (w / w_ref);
            case "omega_sq":       return comp.value * (w / w_ref) ** 2;
            case "sqrt_omega":     return comp.value * Math.sqrt(w / w_ref);
            case "inv_sqrt_omega": return comp.value * Math.sqrt(w_ref / w);
            case "power_0_3":      return comp.value * Math.pow(w / w_ref, 0.3);
            case "rad_plateau": {
                const r = Number(comp.radiationRadius_m);
                if (!(r > 0)) return comp.value;
                const S = Math.PI * r * r;
                const rho = netlist.env?.rho ?? 1.204;
                const c = netlist.env?.c ?? 343;
                const ka = (w / c) * r;
                const ka2 = ka * ka;
                return rho * c * S * ka2 / (1 + ka2);
            }
            case "rad_dipole": {
                const r = Number(comp.radiationRadius_m);
                if (!(r > 0)) return comp.value;
                const S = Math.PI * r * r;
                const rho = netlist.env?.rho ?? 1.204;
                const c = netlist.env?.c ?? 343;
                const ka = (w / c) * r;
                const ka2 = ka * ka;
                const ka4 = ka2 * ka2;
                return rho * c * S * ka4 / Math.pow(1 + ka2, 2);
            }
            case "const":
            default:               return comp.value;
        }
    },

    _evalLfreq(comp, w) {
        const w_ref = 2 * Math.PI * (comp.freqRef ?? 100);
        switch (comp.law) {
            case "power":
                return comp.value * Math.pow(w / w_ref, comp.exponent ?? 0);
            case "const":
            default:
                return comp.value;
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

    _unwrapPhaseFromEnd(phaseDeg, freqs) {
        const n = phaseDeg.length;
        if (n === 0) return [];
        const out = new Array(n);
        out[n - 1] = phaseDeg[n - 1];
        for (let i = n - 2; i >= 0; i--) {
            let d = phaseDeg[i] - phaseDeg[i + 1];
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            out[i] = out[i + 1] + d;
        }
        return out;
    },

    _groupDelay(freqs, phaseDeg) {
        const n = freqs.length;
        const out = new Array(n).fill(0);
        if (n < 7) return out;

        const w = freqs.map(f => 2 * Math.PI * f);
        const K = 4;

        for (let i = 0; i < n; i++) {
            const lo = Math.max(0, i - K);
            const hi = Math.min(n - 1, i + K);
            const m = hi - lo + 1;
            if (m < 3) continue;

            let wCenter = 0;
            for (let j = lo; j <= hi; j++) wCenter += w[j];
            wCenter /= m;

            let sumX = 0, sumPhi = 0, sumXPhi = 0, sumX2 = 0, cnt = 0;
            for (let j = lo; j <= hi; j++) {
                const phi = phaseDeg[j];
                if (!Number.isFinite(phi)) continue;
                const x = w[j] - wCenter;
                sumX   += x;
                sumPhi += phi;
                sumXPhi += x * phi;
                sumX2  += x * x;
                cnt++;
            }
            if (cnt < 3) continue;

            const denom = cnt * sumX2 - sumX * sumX;
            if (!Number.isFinite(denom) || Math.abs(denom) < 1e-30) continue;
            const a = (cnt * sumXPhi - sumX * sumPhi) / denom;
            out[i] = -a * (Math.PI / 180) * 1000;
        }

        return out;
    },

    _computeAlignShift(freqs, spl, mode, spl_ref_dB, bandLo, bandHi) {
        const finite = spl.filter(Number.isFinite);
        if (finite.length === 0) return 0;

        let lo = Number(bandLo);
        let hi = Number(bandHi);
        if (!Number.isFinite(lo) || lo <= 0) lo = 100;
        if (!Number.isFinite(hi) || hi <= lo) hi = lo * 5;
        const fMin = freqs[0];
        const fMax = freqs[freqs.length - 1];
        if (lo < fMin) lo = fMin;
        if (hi > fMax) hi = fMax;
        if (hi <= lo) { lo = fMin; hi = fMax; }

        const collectInBand = (fLo, fHi) => {
            const out = [];
            for (let i = 0; i < freqs.length; i++) {
                if (freqs[i] < fLo || freqs[i] > fHi) continue;
                if (Number.isFinite(spl[i])) out.push(spl[i]);
            }
            return out;
        };

        switch (mode) {
            case "peak": {
                const zone = collectInBand(lo, hi);
                if (zone.length === 0) return 0;
                return -Math.max(...zone);
            }
            case "median": {
                const zone = collectInBand(200, 1000);
                if (zone.length === 0) return 0;
                zone.sort((a, b) => a - b);
                return -zone[Math.floor(zone.length / 2)];
            }
            case "band": {
                const zone = collectInBand(lo, hi);
                if (zone.length === 0) return 0;
                zone.sort((a, b) => a - b);
                return -zone[Math.floor(zone.length / 2)];
            }
            case "spl": {
                if (spl_ref_dB === null) return 0;
                const zone = collectInBand(200, 1000);
                if (zone.length === 0) return 0;
                zone.sort((a, b) => a - b);
                return spl_ref_dB - zone[Math.floor(zone.length / 2)];
            }
            default:
                return 0;
        }
    },

    _roundArr(arr, digits) {
        const k = Math.pow(10, digits);
        return arr.map(v => Number.isFinite(v) ? Math.round(v * k) / k : null);
    },

    _findPeak(xs, ys, mode) {
        if (!xs || !ys || xs.length === 0) return null;
        let bestIdx = 0;
        let bestVal = (mode === 'min') ? Infinity : -Infinity;
        for (let i = 0; i < ys.length; i++) {
            if (!Number.isFinite(ys[i]) || ys[i] <= -199) continue;
            if (mode === 'min') {
                if (ys[i] < bestVal) { bestVal = ys[i]; bestIdx = i; }
            } else {
                if (ys[i] > bestVal) { bestVal = ys[i]; bestIdx = i; }
            }
        }
        if (!Number.isFinite(bestVal)) return null;
        return { index: bestIdx, x: xs[bestIdx], y: bestVal };
    },

    _findPeakInBand(xs, ys, fLo, fHi, mode) {
        if (!xs || !ys || xs.length === 0) return null;
        let bestIdx = -1;
        let bestVal = (mode === 'min') ? Infinity : -Infinity;
        for (let i = 0; i < ys.length; i++) {
            if (!Number.isFinite(ys[i]) || ys[i] <= -199) continue;
            if (xs[i] < fLo || xs[i] > fHi) continue;
            if (mode === 'min') {
                if (ys[i] < bestVal) { bestVal = ys[i]; bestIdx = i; }
            } else {
                if (ys[i] > bestVal) { bestVal = ys[i]; bestIdx = i; }
            }
        }
        if (bestIdx < 0) return null;
        return { index: bestIdx, x: xs[bestIdx], y: bestVal };
    },

    _minMax(arr) {
        let mn = Infinity, mx = -Infinity;
        for (const v of arr) {
            if (!Number.isFinite(v) || v <= -199) continue;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        if (!Number.isFinite(mn)) return { min: 0, max: 0 };
        return { min: mn, max: mx };
    },

    _statsInBand(xs, ys, fLo, fHi) {
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < xs.length; i++) {
            if (xs[i] < fLo || xs[i] > fHi) continue;
            const v = ys[i];
            if (!Number.isFinite(v) || v <= -199) continue;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        if (!Number.isFinite(mn)) return { min: null, max: null, ripple: null };
        return { min: mn, max: mx, ripple: mx - mn };
    },

    _makeGraph({ type, label, color, xs, ys, extraLines, metadata, settings }) {
        return {
            type, label, color,
            xValues: xs, yValues: ys,
            extraLines: extraLines || [],
            compareGraphs: [],
            metadata: metadata || {},
            settings: settings || {}
        };
    },

    _defaultXAxis(freqs) {
        return {
            label: "Frequency, Hz",
            min: Math.round(freqs[0]),
            max: Math.round(freqs[freqs.length - 1]),
            log: true,
            precision: 0
        };
    },

    _defaultAppearance() {
        return {
            lineWidth: 1.8,
            fillOpacity: 0.15,
            pointSize: 1.5,
            showPoints: false,
            showGrid: true,
            showLegend: true,
            showFill: true
        };
    },

    _buildJSON(freqs, spl, phase, gdelay, U, Uemit, x, Z, zRe, zIm, zArg, P, meta) {
        const xs = this._roundArr(freqs, 2);
        const splVals = spl.map(v => Number.isFinite(v) ? Math.round(v * 1000) / 1000 : -200);

        const tau0_s = meta.distance / meta.env.c;
        const phaseArr = phase.map((v, i) => {
            if (!Number.isFinite(v)) return 0;
            const w = 2 * Math.PI * freqs[i];
            return Math.round((v + (w * tau0_s) * 180 / Math.PI) * 1000) / 1000;
        });
        const gdArr = gdelay.map(v => {
            if (!Number.isFinite(v)) return 0;
            return Math.round((v - meta.tau0_ms) * 10000) / 10000;
        });

        const uArr      = this._roundArr(U, 12);
        const uEmitArr  = this._roundArr(Uemit, 12);
        const xArr      = this._roundArr(x, 6);
        const zArr      = this._roundArr(Z, 4);
        const zReArr    = this._roundArr(zRe, 4);
        const zImArr    = this._roundArr(zIm, 4);
        const zArgArr   = this._roundArr(zArg, 2);
        const pArr      = this._roundArr(P, 6);

        const shift = Number(meta.appliedShift) || 0;
        const splAbsVals = splVals.map(v =>
            Number.isFinite(v) && v > -199
                ? Math.round((v - shift) * 1000) / 1000
                : -200
        );
        const splAbsPeak = this._findPeak(xs, splAbsVals, 'max');

        const commonMeta = {
            solver: "LEM v21.3",
            sources: meta.netlist.sources,
            env: meta.env,
            drive_V_rms: meta.v_rms,
            drive_V_peak: Number((meta.v_rms * Math.SQRT2).toFixed(3)),
            distance_m: meta.distance,
            radiation: baffleStepLabel(meta.halfSpace, meta.baffleStep),
            radiation_effective: meta.baffleStep
                ? "2π→4π (baffle step)"
                : (meta.halfSpace ? "2π" : "4π"),
            baffle_step: meta.baffleStep,
            baffle_width_m: meta.baffleWidth,
            baffle_freq_Hz: meta.baffleStep
                ? Number((meta.env.c / (Math.PI * meta.baffleWidth)).toFixed(1))
                : null,
            tau0_ms: Number(meta.tau0_ms.toFixed(3)),
            delay_compensation_ms: Number(meta.tau0_ms.toFixed(3)),
            emittingPorts: meta.netlist.emittingPorts.map(p => ({
                source: p.source, port: p.portName, node: p.globalNode,
                emit: p.emit ? p.emit.kind : 'fallback'
            })),
            speakerMeta:          meta.netlist.metaBySource?.speaker          || null,
            boxMeta:              meta.netlist.metaBySource?.box              || null,
            portMeta:             meta.netlist.metaBySource?.port             || null,
            passiveRadiatorMeta:  meta.netlist.metaBySource?.passive_radiator || null,
            wallMeta:             meta.netlist.metaBySource?.wall             || null,
            twqpMeta:             meta.netlist.metaBySource?.twqp             || null,
            hornMeta:             meta.netlist.metaBySource?.horn             || null,
            tappedHornMeta:       meta.netlist.metaBySource?.tapped_horn      || null
        };

        const zStats = this._minMax(zArr);
        const zPeak = this._findPeakInBand(xs, zArr, 20, 500, 'max');
        const zMin  = this._findPeakInBand(xs, zArr, 20, 500, 'min');
        const xPeak = this._findPeak(xs, xArr, 'max');
        const uPeak = this._findPeak(xs, uArr, 'max');

        let uEmitSharePeak = null;
        if (uPeak && uPeak.index >= 0) {
            const uTot = uPeak.y;
            const uP = uEmitArr[uPeak.index];
            if (Number.isFinite(uTot) && uTot > 0 && Number.isFinite(uP)) {
                uEmitSharePeak = Number((uP / uTot).toFixed(3));
            }
        }

        const alignLo = meta.alignBandLo;
        const alignHi = meta.alignBandHi;
        const splPeakBand = this._findPeakInBand(xs, splVals, alignLo, alignHi, 'max');
        const splPeakGlobal = this._findPeak(xs, splVals, 'max');
        const splBand = this._statsInBand(xs, splVals, alignLo, alignHi);
        const pMax = Math.max(...pArr.filter(Number.isFinite), 0);

        const diagnostics = {
            Z_min_ohm: zMin ? Number(zMin.y.toFixed(3)) : null,
            Z_min_freq_Hz: zMin ? Number(zMin.x.toFixed(1)) : null,
            Z_max_ohm: zPeak ? Number(zPeak.y.toFixed(3)) : null,
            Z_max_freq_Hz: zPeak ? Number(zPeak.x.toFixed(1)) : null,
            X_max_mm: xPeak ? Number(xPeak.y.toFixed(4)) : null,
            X_max_freq_Hz: xPeak ? Number(xPeak.x.toFixed(1)) : null,
            U_max_m3s: uPeak ? Number(uPeak.y.toExponential(3)) : null,
            U_max_freq_Hz: uPeak ? Number(uPeak.x.toFixed(1)) : null,
            U_port_share_at_peak: uEmitSharePeak,
            SPL_peak_in_band_dB: splPeakBand ? Number(splPeakBand.y.toFixed(2)) : null,
            SPL_peak_in_band_freq_Hz: splPeakBand ? Number(splPeakBand.x.toFixed(1)) : null,
            SPL_peak_global_dB: splPeakGlobal ? Number(splPeakGlobal.y.toFixed(2)) : null,
            SPL_peak_global_freq_Hz: splPeakGlobal ? Number(splPeakGlobal.x.toFixed(1)) : null,
            SPL_ripple_in_band_dB: splBand.ripple !== null ? Number(splBand.ripple.toFixed(2)) : null,
            SPL_min_in_band_dB: splBand.min !== null ? Number(splBand.min.toFixed(2)) : null,
            SPL_band_lo_Hz: alignLo,
            SPL_band_hi_Hz: alignHi,
            SPL_abs_peak_dB: splAbsPeak ? Number(splAbsPeak.y.toFixed(2)) : null,
            SPL_abs_peak_freq_Hz: splAbsPeak ? Number(splAbsPeak.x.toFixed(1)) : null,
            applied_shift_dB: Number(meta.appliedShift.toFixed(3)),
            P_max_W: Number(pMax.toFixed(4)),
            singular_points: meta.singularCount || 0,
            total_points: freqs.length
        };

        const fullMeta = { ...commonMeta, diagnostics };

        const splExtra = [];
        const isRelativeAlign =
            meta.alignMode === "peak" ||
            meta.alignMode === "median" ||
            meta.alignMode === "band";
        if (isRelativeAlign) {
            splExtra.push(
                { y: 0,  color: "rgba(200,184,154,0.6)", label: "0 dB (ref)", dashed: false },
                { y: -3, color: "rgba(180,180,140,0.4)", label: "-3 dB", dashed: true },
                { y: -6, color: "rgba(180,180,140,0.3)", label: "-6 dB", dashed: true }
            );
        }
        if (meta.alignMode !== "none" && splPeakBand) {
            splExtra.push({
                x: splPeakBand.x,
                color: "rgba(255,180,80,0.7)",
                label: `Peak (band): ${splPeakBand.y.toFixed(2)} dB @ ${splPeakBand.x.toFixed(1)} Hz`,
                dashed: true
            });
        }

        const splYLabel = (() => {
            const absSuffix = splAbsPeak
                ? ` (abs peak = ${splAbsPeak.y.toFixed(1)} dB)`
                : "";
            switch (meta.alignMode) {
                case "peak":
                case "median":
                case "band":   return `SPL, dB (rel.)${absSuffix}`;
                case "spl":    return "SPL, dB (ref)";
                default:       return "SPL, dB (absolute)";
            }
        })();

        const splFinite = splVals.filter(v => Number.isFinite(v) && v > -199);
        const splMaxY = splFinite.length ? Math.max(...splFinite) : 0;
        const splMinY = splFinite.length ? Math.min(...splFinite) : -60;

        const splGraph = this._makeGraph({
            type: "spl",
            label: "SPL (LEM)",
            color: "#ec2e2e",
            xs, ys: splVals,
            extraLines: splExtra,
            metadata: {
                title: "SPL (LEM)",
                unitX: "Hz", unitY: "dB",
                phase: phaseArr,
                spl_abs: splAbsVals,
                align: {
                    mode: meta.alignMode,
                    applied_shift_dB: Number(meta.appliedShift.toFixed(3)),
                    spl_ref_dB: meta.spl_ref_dB,
                    band_lo_Hz: meta.alignBandLo,
                    band_hi_Hz: meta.alignBandHi
                },
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: {
                    label: splYLabel,
                    min: Math.floor(splMinY / 10) * 10 - 5,
                    max: Math.ceil(Math.max(splMaxY, 0) / 10) * 10 + 5,
                    log: false,
                    precision: 1
                },
                appearance: this._defaultAppearance()
            }
        });

        const phaseGraph = this._makeGraph({
            type: "phase",
            label: "Phase SPL, ° (delay-compensated)",
            color: "#ffb347",
            xs, ys: phaseArr,
            extraLines: [
                { y: 0,   color: "rgba(200,184,154,0.5)", label: "0°",   dashed: false },
                { y: -90, color: "rgba(180,180,140,0.4)", label: "-90°", dashed: true }
            ],
            metadata: {
                title: "SPL Phase (LEM, unwrapped, delay-compensated)",
                unitX: "Hz", unitY: "°",
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "Phase, °", min: null, max: null, log: false, precision: 0 },
                appearance: this._defaultAppearance()
            }
        });

        const gdGraph = this._makeGraph({
            type: "group_delay",
            label: "Group delay, ms (excess)",
            color: "#c084fc",
            xs, ys: gdArr,
            extraLines: [{ y: 0, color: "rgba(200,184,154,0.5)", label: "0 ms (excess)", dashed: false }],
            metadata: {
                title: "Excess group delay (LEM, ref tau0)",
                unitX: "Hz", unitY: "ms",
                tau0_ms: Number(meta.tau0_ms.toFixed(3)),
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "Excess GD, ms", min: null, max: null, log: false, precision: 2 },
                appearance: this._defaultAppearance()
            }
        });

        const speakerXmax = meta.netlist.metaBySource?.speaker?.xmax_mm ?? null;

        const xExtra = [];
        if (xPeak) {
            xExtra.push({
                x: xPeak.x,
                color: "rgba(255,180,80,0.75)",
                label: `Peak: ${xPeak.y.toFixed(3)} mm @ ${xPeak.x.toFixed(1)} Hz`,
                dashed: true
            });
        }
        if (typeof speakerXmax === "number" && speakerXmax > 0) {
            xExtra.push({
                y: speakerXmax,
                color: "rgba(220,80,80,0.85)",
                label: `Xmax = ${speakerXmax.toFixed(2)} mm`,
                dashed: true
            });
            xExtra.push({
                y: 0.7 * speakerXmax,
                color: "rgba(255,180,80,0.5)",
                label: `70% Xmax = ${(0.7 * speakerXmax).toFixed(2)} mm`,
                dashed: true
            });
        }

        const xFinite = xArr.filter(Number.isFinite);
        const xMaxVal = xFinite.length ? Math.max(...xFinite) : 1;
        let xAxisMax = Math.ceil(xMaxVal * 1.15 * 100) / 100;
        if (typeof speakerXmax === "number" && speakerXmax > 0) {
            xAxisMax = Math.max(xAxisMax, speakerXmax * 1.5);
        }

        const xGraph = this._makeGraph({
            type: "xmax",
            label: "X, mm (peak, per V_rms)",
            color: "#66ff88",
            xs, ys: xArr,
            extraLines: xExtra,
            metadata: {
                title: "Cone excursion (LEM)",
                unitX: "Hz", unitY: "mm",
                xmax_driver_mm: speakerXmax,
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "X, mm", min: 0, max: xAxisMax, log: false, precision: 3 },
                appearance: this._defaultAppearance()
            }
        });

        const uGraph = this._makeGraph({
            type: "u_driver",
            label: "U total (all emitters), m³/s",
            color: "#4fd1ff",
            xs, ys: uArr,
            extraLines: uPeak ? [{
                x: uPeak.x,
                color: "rgba(255,180,80,0.75)",
                label: `Peak: ${uPeak.y.toExponential(2)} m³/s @ ${uPeak.x.toFixed(1)} Hz` +
                    (uEmitSharePeak != null ? ` (emitters ${(uEmitSharePeak * 100).toFixed(0)}%)` : ""),
                dashed: true
            }] : [],
            metadata: {
                title: "Volume velocity total (LEM)",
                unitX: "Hz", unitY: "m³/s",
                u_port: uEmitArr,
                u_port_share_at_peak: uEmitSharePeak,
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "U, m³/s", min: null, max: null, log: true, precision: 6 },
                appearance: this._defaultAppearance()
            }
        });

        const zExtra = [];
        if (zPeak) zExtra.push({
            x: zPeak.x, color: "rgba(255,180,80,0.75)",
            label: `Zmax = ${zPeak.y.toFixed(2)} Ω @ ${zPeak.x.toFixed(1)} Hz`, dashed: true
        });
        if (zMin) zExtra.push({
            x: zMin.x, color: "rgba(120,200,140,0.75)",
            label: `Zmin = ${zMin.y.toFixed(2)} Ω @ ${zMin.x.toFixed(1)} Hz`, dashed: true
        });

        const zGraph = this._makeGraph({
            type: "impedance",
            label: "|Z_in|, Ω",
            color: "#66ddff",
            xs, ys: zArr,
            extraLines: zExtra,
            metadata: {
                title: "Input impedance magnitude (LEM)",
                unitX: "Hz", unitY: "Ω",
                zRe: zReArr, zIm: zImArr,
                ...fullMeta
            },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: {
                    label: "|Z|, Ω",
                    min: Math.max(0, Math.floor(zStats.min / 5) * 5 - 5),
                    max: Math.ceil(zStats.max / 5) * 5 + 5,
                    log: false, precision: 1
                },
                appearance: this._defaultAppearance()
            }
        });

        const zPhaseGraph = this._makeGraph({
            type: "z_phase",
            label: "Phase(Z), °",
            color: "#f87171",
            xs, ys: zArgArr,
            extraLines: [{ y: 0, color: "rgba(200,184,154,0.5)", label: "0°", dashed: false }],
            metadata: { title: "Impedance phase (LEM)", unitX: "Hz", unitY: "°", ...fullMeta },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "Phase(Z), °", min: -90, max: 90, log: false, precision: 0 },
                appearance: this._defaultAppearance()
            }
        });

        const powerGraph = this._makeGraph({
            type: "power",
            label: "P_in, W",
            color: "#facc15",
            xs, ys: pArr,
            extraLines: [],
            metadata: { title: "Input power (LEM)", unitX: "Hz", unitY: "W", ...fullMeta },
            settings: {
                xAxis: this._defaultXAxis(freqs),
                yAxis: { label: "Power, W", min: null, max: null, log: true, precision: 3 },
                appearance: this._defaultAppearance()
            }
        });

        return {
            version: "21.3.0",
            graphs: [splGraph, phaseGraph, gdGraph, xGraph, uGraph, zGraph, zPhaseGraph, powerGraph],
            metadata: {
                title: "LEM Solver v21.3",
                timestamp: new Date().toISOString(),
                solver: "LEM v21.3",
                diagnostics
            }
        };
    }
};

function baffleStepLabel(halfSpace, baffleStep) {
    if (baffleStep) return "2π→4π (baffle step)";
    return halfSpace ? "2π" : "4π";
}

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
        if (host && typeof host.notify === 'function') host.notify('Export', 'JSON saved', 'success');
    } catch (e) {
        console.error('[LEMsolver] export failed:', e);
        if (host && typeof host.notify === 'function') host.notify('Export error', String(e.message || e), 'error');
    }
}

function sendToGraphic(data, host) {
    if (!host) return;
    const payload = { graphs: Array.isArray(data.graphs) ? data.graphs : [], metadata: data.metadata || {} };

    let targetWindow = null;
    try {
        if (typeof host.findWindowByType === 'function') targetWindow = host.findWindowByType('graphic');
    } catch (e) {}

    if (targetWindow && targetWindow.id != null) {
        try {
            host.sendMessage('graphic:load', payload, targetWindow.id);
            if (typeof host.notify === 'function') host.notify('Send', 'Sent to Graphic', 'success');
        } catch (e) {}
        return;
    }

    let opened = null;
    try {
        if (typeof host.createWindowByType === 'function') opened = host.createWindowByType('graphic');
        else if (typeof host.openWindow === 'function') opened = host.openWindow('graphic');
    } catch (e) {}

    if (!opened) {
        if (typeof host.notify === 'function') host.notify('Send', 'Open Graphic window first', 'warning');
        return;
    }

    setTimeout(() => {
        try {
            host.sendMessage('graphic:load', payload, opened.id);
            if (typeof host.notify === 'function') host.notify('Send', 'Graphic opened, data sent', 'success');
        } catch (e) {}
    }, 300);
}