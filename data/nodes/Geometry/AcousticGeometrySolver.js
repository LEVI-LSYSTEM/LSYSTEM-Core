// data/nodes/Geometry/AcousticGeometrySolver.js
// AcousticGeometrySolver v0.1.1 — заготовка геометрического решателя
//
// Среда: Geometry
// Порт: in (input)
// Результат: { kind: 'geom.result', status: 'not_implemented', ... }
//
// Изменения v0.1.1 (относительно v0.1.0):
//   - Убрана кнопка "Export simulation".
//   - Кнопка "Export graphics" переименована в "Export Graphic".
//
// Назначение:
//   - Принимает цепочку Mesh → AssignMaterial → Solver.
//   - Валидирует вход, извлекает bbox, группы, материалы.
//   - Проверяет watertight (warning, но не стоп).
//   - Строит "задачу" для будущего FEM/BEM: nodes, elements, BC.
//   - Возвращает заглушку с полной диагностикой.
//   - Кнопки: Run, Send to Graphic, Export Graphic.
'use strict';

// ============================================================
// КОНСТАНТЫ
// ============================================================
const COMPUTE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 минут (по ТЗ)
const DEFAULT_DRIVER_GROUP = 'Driver';
const DEFAULT_RADIATION_ORDER = 4;

// ============================================================
// МОДУЛЬ
// ============================================================
module.exports = {
    meta: {
        id: 'Acoustic.Geometry.solver',
        label: 'Acoustic Geometry Solver',
        icon: 'icon-solver'
    },

    ports: {
        inputs:  [ { id: 'in', label: 'In' } ],
        outputs: []
    },

    inputRules:  { in: ['*'] },
    outputRules: {},

    maxInputs:  { in: 1 },
    maxOutputs: {},

    // ============================================================
    // ПАРАМЕТРЫ
    // ============================================================
    params: [
        // ── Driver ──
        {
            id: 'driver_group',
            type: 'string',
            label: 'Driver group name',
            default: DEFAULT_DRIVER_GROUP,
            category: 'Driver',
            description: 'Имя группы в меше, соответствующей динамику'
        },
        {
            id: 'ts_fs',
            type: 'number',
            label: 'Fs, Hz',
            default: 45,
            min: 5,
            max: 500,
            step: 0.1,
            category: 'Driver'
        },
        {
            id: 'ts_qts',
            type: 'number',
            label: 'Qts',
            default: 0.40,
            min: 0.05,
            max: 2,
            step: 0.01,
            category: 'Driver'
        },
        {
            id: 'ts_vas',
            type: 'number',
            label: 'Vas, L',
            default: 34,
            min: 0.1,
            max: 1000,
            step: 0.1,
            category: 'Driver'
        },
        {
            id: 'ts_re',
            type: 'number',
            label: 'Re, Ω',
            default: 6.4,
            min: 0.1,
            max: 32,
            step: 0.1,
            category: 'Driver'
        },
        {
            id: 'ts_sd',
            type: 'number',
            label: 'Sd, cm²',
            default: 220,
            min: 1,
            max: 5000,
            step: 1,
            category: 'Driver'
        },
        {
            id: 'drive_v_rms',
            type: 'number',
            label: 'Drive, V RMS',
            default: 2.83,
            min: 0.001,
            max: 100,
            step: 0.01,
            category: 'Driver'
        },

        // ── Listen Point ──
        {
            id: 'listen_x',
            type: 'number',
            label: 'X, m',
            default: 0,
            min: -100,
            max: 100,
            step: 0.01,
            category: 'Listen Point'
        },
        {
            id: 'listen_y',
            type: 'number',
            label: 'Y, m',
            default: 0,
            min: -100,
            max: 100,
            step: 0.01,
            category: 'Listen Point'
        },
        {
            id: 'listen_z',
            type: 'number',
            label: 'Z, m',
            default: 1.0,
            min: -100,
            max: 100,
            step: 0.01,
            category: 'Listen Point'
        },

        // ── Damping ──
        {
            id: 'damping_type',
            type: 'options',
            label: 'Type',
            default: 'none',
            options: [
                { value: 'none',       label: 'None' },
                { value: 'wool',       label: 'Wool' },
                { value: 'foam',       label: 'Foam' },
                { value: 'fiberglass', label: 'Fiberglass' },
                { value: 'polyester',  label: 'Polyester' }
            ],
            category: 'Damping'
        },
        {
            id: 'damping_density',
            type: 'number',
            label: 'Density, g/m³',
            default: 0,
            min: 0,
            max: 500,
            step: 1,
            category: 'Damping',
            description: 'Плотность заполнения'
        },
        {
            id: 'damping_mass_g',
            type: 'number',
            label: 'Mass, g',
            default: 0,
            min: 0,
            max: 100000,
            step: 1,
            category: 'Damping'
        },

        // ── Radiation ──
        {
            id: 'radiation_order',
            type: 'int',
            label: 'π multiplier',
            default: DEFAULT_RADIATION_ORDER,
            min: 1,
            max: 8,
            step: 1,
            category: 'Radiation',
            description: '2 = half-space, 4 = full-space'
        },
        {
            id: 'baffle_step',
            type: 'bool',
            label: 'Baffle step',
            default: false,
            category: 'Radiation'
        },
        {
            id: 'baffle_width',
            type: 'number',
            label: 'Baffle width, m',
            default: 0.30,
            min: 0.01,
            max: 5,
            step: 0.01,
            category: 'Radiation'
        },

        // ── Sweep ──
        {
            id: 'f_min',
            type: 'number',
            label: 'F min, Hz',
            default: 20,
            min: 1,
            max: 1000,
            step: 1,
            category: 'Sweep'
        },
        {
            id: 'f_max',
            type: 'number',
            label: 'F max, Hz',
            default: 500,
            min: 10,
            max: 20000,
            step: 1,
            category: 'Sweep'
        },
        {
            id: 'f_points',
            type: 'int',
            label: 'Points',
            default: 200,
            min: 20,
            max: 5000,
            step: 1,
            category: 'Sweep'
        },

        // ── Output ──
        {
            id: 'align',
            type: 'options',
            label: 'Y align',
            default: 'median',
            options: [
                { value: 'peak',   label: 'Peak (in band) → 0 dB' },
                { value: 'median', label: 'Median 200–1000 → 0 dB' },
                { value: 'band',   label: 'Median (custom band) → 0 dB' },
                { value: 'spl',    label: 'Absolute (SPL_ref)' },
                { value: 'none',   label: 'None (raw)' }
            ],
            category: 'Output'
        },
        {
            id: 'align_band_lo',
            type: 'number',
            label: 'Align band lo, Hz',
            default: 50,
            min: 1,
            max: 1000,
            step: 1,
            category: 'Output'
        },
        {
            id: 'align_band_hi',
            type: 'number',
            label: 'Align band hi, Hz',
            default: 200,
            min: 1,
            max: 10000,
            step: 1,
            category: 'Output'
        },
        {
            id: 'smooth',
            type: 'options',
            label: 'Smooth',
            default: 'none',
            options: [
                { value: 'none',  label: 'None' },
                { value: '1/3',   label: '1/3 oct' },
                { value: '1/6',   label: '1/6 oct' },
                { value: '1/12',  label: '1/12 oct' }
            ],
            category: 'Output'
        },

        // ── Solver ──
        {
            id: 'method',
            type: 'options',
            label: 'Method',
            default: 'stub',
            options: [
                { value: 'stub', label: 'Stub (no computation)' },
                { value: 'bem',  label: 'BEM (future)' },
                { value: 'fem',  label: 'FEM (future)' }
            ],
            category: 'Solver'
        },
        {
            id: 'mesh_order',
            type: 'int',
            label: 'Mesh order',
            default: 1,
            min: 1,
            max: 3,
            step: 1,
            category: 'Solver'
        },
        {
            id: 'max_elements',
            type: 'int',
            label: 'Max elements',
            default: 10000,
            min: 100,
            max: 1000000,
            step: 100,
            category: 'Solver'
        },
        {
            id: 'use_gpu',
            type: 'bool',
            label: 'Use GPU (WebGPU)',
            default: true,
            category: 'Solver'
        },

        // ── Env ──
        {
            id: 'temperature',
            type: 'number',
            label: 'T, °C',
            default: 20,
            min: -50,
            max: 100,
            step: 0.1,
            category: 'Env'
        },
        {
            id: 'humidity',
            type: 'number',
            label: 'RH, %',
            default: 50,
            min: 0,
            max: 100,
            step: 1,
            category: 'Env'
        },
        {
            id: 'pressure',
            type: 'number',
            label: 'P, Pa',
            default: 101325,
            min: 1000,
            max: 200000,
            step: 1,
            category: 'Env'
        }
    ],

    // ============================================================
    // КНОПКИ
    // ============================================================
    buttons: [
        { id: 'run',    label: 'Run',               icon: 'icon-play'    },
        { id: 'send',   label: 'Send to Graphic',   icon: 'icon-graphic' },
        { id: 'export', label: 'Export Graphic',    icon: 'icon-export'  }
    ],

    onButton(id, ctx) {
        const { node, host } = ctx;

        if (id === 'run') {
            if (host && typeof host.runNode === 'function') host.runNode(node);
            return;
        }

        if (id === 'send') {
            if (!node._result || node._result.kind !== 'geom.result') {
                if (host && host.notify) host.notify('Send', 'Run first', 'warning');
                return;
            }
            sendToGraphic(node._result, host);
            return;
        }

        if (id === 'export') {
            if (!node._result || node._result.kind !== 'geom.result') {
                if (host && host.notify) host.notify('Export', 'Run first', 'warning');
                return;
            }
            exportGraphicJSON(node._result, host);
            return;
        }
    },

    // ============================================================
    // COMPUTE
    // ============================================================
    checkCompute(ctx) {
        const inputs = ctx.getInputs();
        if (inputs.length === 0) {
            return { ready: false, reason: 'No input mesh' };
        }
        return { ready: true };
    },

    async compute(ctx) {
        const inputs = ctx.getInputs();
        if (inputs.length === 0) throw new Error('Solver: no inputs');

        // ── 1. Получаем материал + меш ──
        const upResult = await ctx.requestCompute(inputs[0].id);
        if (!upResult || upResult.kind !== 'geom.material') {
            throw new Error('Solver: input is not a material');
        }

        const mesh = upResult.mesh || {};
        const groups = mesh.groups || {};
        const groupNames = Object.keys(groups);
        const assignments = upResult.assignments || {};
        const materials = upResult.materials || {};
        const stats = mesh.stats || {};
        const bbox = mesh.bbox || {};

        // ── 2. Проверка watertight ──
        const watertight = !!stats.watertight;
        if (!watertight) {
            ctx.notify('Solver', 'Mesh is not watertight — результат будет приблизительным', 'warning');
        }

        // ── 3. Динамик ──
        const driverGroup = String(ctx.params.driver_group || DEFAULT_DRIVER_GROUP);
        const driverFound = Object.prototype.hasOwnProperty.call(groups, driverGroup);
        const driverTris = driverFound ? (groups[driverGroup] || []) : [];
        const driverTriangleCount = driverTris.length;

        // ── 4. Окружение ──
        const env = _computeEnvironment(
            Number(ctx.params.temperature),
            Number(ctx.params.humidity),
            Number(ctx.params.pressure)
        );

        // ── 5. Sweep ──
        const f_min = Number(ctx.params.f_min);
        const f_max = Number(ctx.params.f_max);
        const f_points = Math.max(20, Math.floor(Number(ctx.params.f_points)));
        if (!(f_min > 0) || !(f_max > f_min)) throw new Error('Solver: bad frequency range');
        const freqs = _logspace(f_min, f_max, f_points);

        // ── 6. Диагностика ──
        const diagnostics = {
            solver: 'AcousticGeometrySolver v0.1.1',
            status: 'not_implemented',
            message: 'FEM/BEM solver not implemented yet',

            mesh: {
                vertex_count: stats.vertex_count || 0,
                face_count: stats.face_count || 0,
                watertight,
                open_edges: stats.open_edges || 0,
                non_manifold_edges: stats.non_manifold_edges || 0,
                euler: stats.euler || 0,
                bbox: {
                    min: bbox.min || { x: 0, y: 0, z: 0 },
                    max: bbox.max || { x: 0, y: 0, z: 0 },
                    size: bbox.size || { x: 0, y: 0, z: 0 },
                    center: bbox.center || { x: 0, y: 0, z: 0 }
                }
            },

            groups: groupNames,
            group_stats: _buildGroupStats(groups),
            materials: { ...assignments },
            materials_used: Object.keys(materials),

            driver: {
                group: driverGroup,
                found: driverFound,
                triangle_count: driverTriangleCount,
                ts: {
                    fs: Number(ctx.params.ts_fs),
                    qts: Number(ctx.params.ts_qts),
                    vas_L: Number(ctx.params.ts_vas),
                    re: Number(ctx.params.ts_re),
                    sd_cm2: Number(ctx.params.ts_sd)
                },
                drive_v_rms: Number(ctx.params.drive_v_rms),
                sd_m2: Number(ctx.params.ts_sd) * 1e-4
            },

            listen: {
                x: Number(ctx.params.listen_x),
                y: Number(ctx.params.listen_y),
                z: Number(ctx.params.listen_z)
            },

            damping: {
                type: String(ctx.params.damping_type || 'none'),
                density: Number(ctx.params.damping_density || 0),
                mass_g: Number(ctx.params.damping_mass_g || 0)
            },

            radiation: {
                order: Number(ctx.params.radiation_order || DEFAULT_RADIATION_ORDER),
                baffle_step: !!ctx.params.baffle_step,
                baffle_width: Number(ctx.params.baffle_width || 0.30)
            },

            env: {
                T_C: env.T_C,
                T_K: env.T_K,
                humidity: env.humidity,
                pressure: env.pressure,
                c: env.c,
                rho: env.rho
            },

            sweep: { f_min, f_max, f_points }
        };

        // ── 7. Строим "задачу" для будущего решателя ──
        const task = {
            nodes: {
                count: stats.vertex_count || 0
            },
            elements: {
                count: stats.face_count || 0,
                type: 'tri',
                order: Number(ctx.params.mesh_order || 1)
            },
            boundary: {
                driver: {
                    group: driverGroup,
                    triangles: driverTris.length
                },
                wall: {
                    triangles: Math.max(0, (stats.face_count || 0) - driverTris.length)
                },
                ports: {
                    count: 0,
                    groups: []
                }
            }
        };

        // ── 8. Графики (пустые, только оси) ──
        const graphs = _buildEmptyGraphs(freqs, {
            align: String(ctx.params.align || 'median'),
            align_band_lo: Number(ctx.params.align_band_lo || 50),
            align_band_hi: Number(ctx.params.align_band_hi || 200),
            smooth: String(ctx.params.smooth || 'none')
        });

        return {
            kind: 'geom.result',
            status: 'not_implemented',
            message: 'FEM/BEM solver not implemented yet',
            graphs,
            diagnostics,
            task,
            metadata: {
                solver: 'AcousticGeometrySolver v0.1.1',
                timestamp: new Date().toISOString(),
                diagnostics
            }
        };
    }
};

// ============================================================
// ХЕЛПЕРЫ
// ============================================================

function _computeEnvironment(T_C, humidity, pressure_Pa) {
    const T_K = T_C + 273.15;
    const c = 331.3 * Math.sqrt(T_K / 273.15) * (1 + 0.0016 * (humidity / 100));
    const R_specific = 287.05;
    const rho = pressure_Pa / (R_specific * T_K);
    return { T_C, T_K, humidity, pressure: pressure_Pa, c, rho };
}

function _logspace(f_min, f_max, n) {
    const l0 = Math.log10(f_min);
    const l1 = Math.log10(f_max);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        out[i] = Math.pow(10, l0 + t * (l1 - l0));
    }
    return out;
}

function _buildGroupStats(groups) {
    const out = {};
    for (const [name, list] of Object.entries(groups)) {
        out[name] = Array.isArray(list) ? list.length : 0;
    }
    return out;
}

// ============================================================
// ПУСТЫЕ ГРАФИКИ (формат GraphicWindow)
// ============================================================

function _buildEmptyGraphs(freqs, opts) {
    const xs = freqs.map(f => Math.round(f * 100) / 100);
    const n = xs.length;
    const emptyY = new Array(n).fill(null);

    const xAxis = {
        label: 'Frequency, Hz',
        unit: 'Hz',
        min: Math.round(freqs[0]),
        max: Math.round(freqs[freqs.length - 1]),
        log: true,
        precision: 0
    };

    const appearance = {
        lineWidth: 1.8,
        fillOpacity: 0.15,
        pointSize: 1.5,
        showPoints: false,
        showGrid: true,
        showLegend: true,
        showFill: true
    };

    const commonMeta = {
        unitX: 'Hz',
        solver: 'AcousticGeometrySolver v0.1.1',
        status: 'not_implemented'
    };

    const mkGraph = (type, label, color, yAxis, extraLines = []) => ({
        type,
        label,
        color,
        xValues: xs,
        yValues: emptyY.slice(),
        extraLines,
        compareGraphs: [],
        metadata: { title: label, ...commonMeta },
        settings: {
            xAxis: { ...xAxis },
            yAxis,
            appearance: { ...appearance }
        }
    });

    const graphs = [];

    graphs.push(mkGraph(
        'spl',
        'SPL (Geometry)',
        '#ec2e2e',
        { label: 'SPL, dB', unit: 'dB', min: -40, max: 10, log: false, precision: 1 },
        [
            { y: 0,  color: 'rgba(200,184,154,0.6)', label: '0 dB',  dashed: false },
            { y: -3, color: 'rgba(180,180,140,0.4)', label: '-3 dB', dashed: true  },
            { y: -6, color: 'rgba(180,180,140,0.3)', label: '-6 dB', dashed: true  }
        ]
    ));

    graphs.push(mkGraph(
        'phase',
        'Phase',
        '#ffb347',
        { label: 'Phase, °', unit: '°', min: -180, max: 180, log: false, precision: 0 }
    ));

    graphs.push(mkGraph(
        'group_delay',
        'Group delay',
        '#c084fc',
        { label: 'GD, ms', unit: 'ms', min: null, max: null, log: false, precision: 2 }
    ));

    graphs.push(mkGraph(
        'z_in',
        '|Z_in|',
        '#66ddff',
        { label: '|Z|, Ω', unit: 'Ω', min: 0, max: 80, log: false, precision: 1 }
    ));

    graphs.push(mkGraph(
        'modes',
        'Mode map',
        '#66ff88',
        { label: 'Mode amplitude', unit: '', min: 0, max: 1, log: false, precision: 2 }
    ));

    graphs.push(mkGraph(
        'port_response',
        'Port response',
        '#facc15',
        { label: 'Port contribution', unit: '', min: -60, max: 0, log: false, precision: 1 }
    ));

    return graphs;
}

// ============================================================
// ЭКСПОРТ / ОТПРАВКА
// ============================================================

function exportGraphicJSON(result, host) {
    try {
        const payload = {
            version: '2.0.0',
            graphs: Array.isArray(result.graphs) ? result.graphs : [],
            metadata: result.metadata || {},
            timestamp: new Date().toISOString()
        };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geometry_graphics_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (host && host.notify) host.notify('Export', 'Graphic JSON saved', 'success');
    } catch (e) {
        console.error('[GeomSolver] export graphic failed:', e);
        if (host && host.notify) host.notify('Export error', String(e.message || e), 'error');
    }
}

function sendToGraphic(result, host) {
    if (!host) return;

    const payload = {
        graphs: Array.isArray(result.graphs) ? result.graphs : [],
        metadata: result.metadata || {}
    };

    let targetWindow = null;
    try {
        if (typeof host.findWindowByType === 'function') {
            targetWindow = host.findWindowByType('graphic');
        }
    } catch (e) {}

    if (targetWindow && targetWindow.id != null) {
        try {
            host.sendMessage('graphic:load', payload, targetWindow.id);
            if (host.notify) host.notify('Send', 'Sent to Graphic', 'success');
        } catch (e) {
            if (host.notify) host.notify('Send error', String(e.message || e), 'error');
        }
        return;
    }

    let opened = null;
    try {
        if (typeof host.createWindowByType === 'function') opened = host.createWindowByType('graphic');
        else if (typeof host.openWindow === 'function') opened = host.openWindow('graphic');
    } catch (e) {}

    if (!opened) {
        if (host.notify) host.notify('Send', 'Open Graphic window first', 'warning');
        return;
    }

    setTimeout(() => {
        try {
            host.sendMessage('graphic:load', payload, opened.id);
            if (host.notify) host.notify('Send', 'Graphic opened, data sent', 'success');
        } catch (e) {}
    }, 300);
}