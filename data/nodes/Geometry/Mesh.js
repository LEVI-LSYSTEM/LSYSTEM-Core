// data/nodes/Geometry/Mesh.js
// Mesh v1.1.0 — загрузка .obj / .stl (ASCII), парсинг групп, watertight-проверка
//
// Среда: Geometry
// Порт: mesh (output)
// Результат: { kind: 'geom.mesh', positions, indices, groups, bbox, stats, status }
//
// Изменения v1.1.0 (относительно v1.0.0):
//   - Парсинг групп .obj (g <name>).
//   - Формат groups: { name: [triIdx, ...] }.
//   - Проверка watertight (каждое ребро принадлежит ровно 2 треугольникам).
//   - stats.watertight: true/false.
//   - status: 'watertight_mesh' | 'invalid_mesh'.
//   - Экспорт JSON с группами.
//
// Особенности:
//   - meshText хранится в paramValues, но НЕ объявлен в params[] —
//     NodeProperties его не показывает, compute читает через ctx.params.meshText.
//   - Авто-выбор scale по bbox сырого меша при загрузке.
//   - Поддержка .obj (с триангуляцией полигонов) и .stl (ASCII).
//   - Бинарный .stl не поддерживается.
//   - После загрузки обновляем NodeProperties, если оно открыто.
'use strict';

module.exports = {
    meta: {
        id: 'Acoustic.Geometry.mesh',
        label: 'Mesh',
        icon: 'icon-box'
    },

    ports: {
        inputs:  [],
        outputs: [ { id: 'mesh', label: 'Mesh' } ]
    },

    inputRules:  {},
    outputRules: { mesh: ['*'] },

    maxInputs:  {},
    maxOutputs: { mesh: '*' },

    params: [
        {
            id: 'source_name',
            type: 'readonly',
            label: 'File',
            default: '',
            category: 'Source'
        },
        {
            id: 'format',
            type: 'readonly',
            label: 'Format',
            default: '',
            category: 'Source'
        },
        {
            id: 'scale',
            type: 'number',
            label: 'Scale',
            default: 1.0,
            min: 0.000001,
            max: 1000,
            step: 0.000001,
            category: 'Source',
            description: 'Авто-выбор по bbox при загрузке: мм → 0.001, см → 0.01, дюймы → 0.0254, метры → 1.0.'
        }
    ],

    buttons: [
        { id: 'load',   label: 'Load mesh…',  icon: 'icon-upload' },
        { id: 'clear',  label: 'Clear',       icon: 'icon-trash'  },
        { id: 'export', label: 'Export JSON', icon: 'icon-export' }
    ],

    // ============================================================
    // BUTTONS
    // ============================================================
    onButton(id, ctx) {
        const { node, host } = ctx;

        if (id === 'load') {
            this._pickFile(node, host);
            return;
        }

        if (id === 'clear') {
            node.paramValues.meshText    = '';
            node.paramValues.source_name = '';
            node.paramValues.format      = '';
            node.paramValues.scale       = 1.0;
            node.invalidateResult();
            this._refreshProperties(host, node);
            if (host && host._saveAndRecord) host._saveAndRecord('Mesh cleared');
            if (host && host.notify) host.notify('Mesh', 'Cleared', 'info');
            return;
        }

        if (id === 'export') {
            if (!node._result || node._result.kind !== 'geom.mesh') {
                if (host && host.notify) host.notify('Export', 'Run first', 'warning');
                return;
            }
            this._exportJSON(node._result, host);
        }
    },

    // ============================================================
    // COMPUTE
    // ============================================================
    checkCompute(ctx) {
        const text = ctx.params.meshText;
        if (!text || typeof text !== 'string' || text.length === 0) {
            return { ready: false, reason: 'No mesh loaded' };
        }
        return { ready: true };
    },

    async compute(ctx) {
        const text   = String(ctx.params.meshText || '');
        const format = String(ctx.params.format || '').toLowerCase();
        const scale  = Number(ctx.params.scale);

        if (!Number.isFinite(scale) || scale <= 0) {
            throw new Error('Mesh: scale must be > 0');
        }

        let parsed;
        if (format === 'stl') {
            parsed = this._parseSTL_ASCII(text);
        } else {
            parsed = this._parseOBJ(text);
        }

        const { positions, indices, groups } = parsed;
        if (positions.length === 0 || indices.length === 0) {
            throw new Error('Mesh: empty or invalid mesh');
        }

        // Масштабирование
        for (let i = 0; i < positions.length; i++) {
            positions[i] *= scale;
        }

        // BBox
        let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i + 1], z = positions[i + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const vertexCount = positions.length / 3;
        const faceCount   = indices.length / 3;

        // Watertight
        const topology = this._checkWatertight(indices, vertexCount);

        const status = topology.watertight ? 'watertight_mesh' : 'invalid_mesh';

        return {
            kind: 'geom.mesh',
            status,
            source: {
                name: String(ctx.params.source_name || ''),
                format: format || 'obj',
                scale
            },
            positions: Array.from(positions),
            indices:   Array.from(indices),
            groups:    groups || {},
            bbox: {
                min:    { x: minX, y: minY, z: minZ },
                max:    { x: maxX, y: maxY, z: maxZ },
                size:   { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
                center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
            },
            stats: {
                vertex_count: vertexCount,
                face_count:   faceCount,
                watertight:   topology.watertight,
                open_edges:   topology.openEdges,
                non_manifold_edges: topology.nonManifoldEdges,
                euler:        topology.euler
            }
        };
    },

    // ============================================================
    // WATERTIGHT CHECK
    // ============================================================
    _checkWatertight(indices, vertexCount) {
        // Ребро → количество вхождений
        const edgeCount = new Map();
        const nTris = indices.length / 3;

        const addEdge = (a, b) => {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        };

        for (let t = 0; t < nTris; t++) {
            const i0 = indices[t * 3];
            const i1 = indices[t * 3 + 1];
            const i2 = indices[t * 3 + 2];
            addEdge(i0, i1);
            addEdge(i1, i2);
            addEdge(i2, i0);
        }

        let openEdges = 0;
        let nonManifoldEdges = 0;
        for (const count of edgeCount.values()) {
            if (count === 1) openEdges++;
            else if (count > 2) nonManifoldEdges++;
        }

        const V = vertexCount;
        const E = edgeCount.size;
        const F = nTris;
        const euler = V - E + F;

        return {
            watertight: openEdges === 0 && nonManifoldEdges === 0,
            openEdges,
            nonManifoldEdges,
            euler
        };
    },

    // ============================================================
    // REFRESH NODEPROPERTIES
    // ============================================================
    _refreshProperties(host, node) {
        if (!host || !node) return;

        let propsWin = null;
        try {
            if (typeof host.findWindowByType === 'function') {
                propsWin = host.findWindowByType('nodeprops');
            }
        } catch (e) {}

        if (!propsWin || propsWin.id == null) return;

        try {
            host.sendMessage('nodeprops:show', {
                node,
                graph: host.getActiveGraph ? host.getActiveGraph() : null,
                host
            }, propsWin.id);
        } catch (e) {
            console.warn('[Mesh] failed to refresh NodeProperties:', e);
        }
    },

    // ============================================================
    // LOAD FILE
    // ============================================================
    _pickFile(node, host) {
        const self = this;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.obj,.stl';
        input.style.display = 'none';

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            try { input.remove(); } catch (e) {}
            window.removeEventListener('focus', onFocus);
        };

        const onFocus = () => {
            setTimeout(() => {
                if (!input.files || input.files.length === 0) cleanup();
            }, 400);
        };

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) { cleanup(); return; }

            if (file.size === 0) {
                if (host && host.notify) host.notify('Mesh', `File "${file.name}" is empty`, 'warning');
                cleanup();
                return;
            }

            const reader = new FileReader();

            reader.onload = () => {
                const text = String(reader.result || '');
                const lower = file.name.toLowerCase();
                const format = lower.endsWith('.stl') ? 'stl' : 'obj';

                let autoScale = 1.0;
                try {
                    const raw = format === 'stl'
                        ? self._parseSTL_ASCII(text)
                        : self._parseOBJ(text);
                    autoScale = self._guessScale(raw.positions);
                } catch (e) {
                    autoScale = 1.0;
                }

                node.paramValues.meshText    = text;
                node.paramValues.source_name = file.name;
                node.paramValues.format      = format;
                node.paramValues.scale       = autoScale;
                node.invalidateResult();

                self._refreshProperties(host, node);

                if (host && host._saveAndRecord) host._saveAndRecord('Mesh loaded: ' + file.name);
                if (host && host.notify) {
                    const kb = (file.size / 1024).toFixed(1);
                    host.notify('Mesh', `Loaded ${file.name} (${kb} KB, scale=${autoScale})`, 'success');
                }
                if (host && host.runNode) host.runNode(node);

                cleanup();
            };

            reader.onerror = () => {
                if (host && host.notify) host.notify('Mesh', `Failed to read "${file.name}"`, 'error');
                cleanup();
            };

            reader.readAsText(file);
        });

        window.addEventListener('focus', onFocus);
        document.body.appendChild(input);
        input.value = '';
        input.click();
    },

    _guessScale(positions) {
        if (!positions || positions.length === 0) return 1.0;

        let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i + 1], z = positions[i + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        if (!Number.isFinite(maxDim) || maxDim <= 0) return 1.0;

        if (maxDim > 100)  return 0.001;    // мм
        if (maxDim > 10)   return 0.01;     // см
        if (maxDim < 0.5)  return 0.0254;   // дюймы
        return 1.0;                         // метры
    },

    // ============================================================
    // OBJ PARSER
    // ============================================================
    _parseOBJ(text) {
        const lines = text.split(/\r?\n/);
        const vRaw = [];            // [x0,y0,z0, x1,y1,z1, ...]
        const faceIndices = [];     // сырые индексы вершин для каждой грани
        const faceGroups = [];      // имя группы для каждой грани

        let currentGroup = '';
        let hasGroups = false;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.length === 0 || line[0] === '#') continue;

            // 'g <name>' — группа
            if (line[0] === 'g' && (line[1] === ' ' || line[1] === '\t')) {
                currentGroup = line.slice(2).trim();
                if (currentGroup) hasGroups = true;
                continue;
            }

            // 'v ' — вершина
            if (line[0] === 'v' && (line[1] === ' ' || line[1] === '\t')) {
                const parts = line.split(/\s+/);
                const x = Number(parts[1]);
                const y = Number(parts[2]);
                const z = Number(parts[3]);
                if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                    vRaw.push(x, y, z);
                }
                continue;
            }

            // 'f ' — грань
            if (line[0] === 'f' && (line[1] === ' ' || line[1] === '\t')) {
                const parts = line.slice(2).trim().split(/\s+/);
                const nVerts = vRaw.length / 3;

                const faceIdx = [];
                for (const tok of parts) {
                    const idxStr = tok.split('/')[0];
                    let idx = parseInt(idxStr, 10);
                    if (!Number.isFinite(idx)) continue;

                    if (idx < 0) idx = nVerts + idx;
                    else idx = idx - 1;

                    if (idx < 0 || idx >= nVerts) continue;
                    faceIdx.push(idx);
                }

                if (faceIdx.length < 3) continue;

                faceIndices.push(faceIdx);
                faceGroups.push(currentGroup);
            }
        }

        // Компактизация вершин
        const remap = new Map();
        const positions = [];
        const indices = [];
        const groups = {};

        for (let fi = 0; fi < faceIndices.length; fi++) {
            const faceIdx = faceIndices[fi];
            const groupName = faceGroups[fi] || '';

            // Fan-триангуляция
            const a = this._remapVertex(faceIdx[0], remap, positions, vRaw);
            for (let i = 1; i < faceIdx.length - 1; i++) {
                const b = this._remapVertex(faceIdx[i],     remap, positions, vRaw);
                const c = this._remapVertex(faceIdx[i + 1], remap, positions, vRaw);
                const triIdx = indices.length / 3;
                indices.push(a, b, c);

                if (groupName) {
                    if (!groups[groupName]) groups[groupName] = [];
                    groups[groupName].push(triIdx);
                }
            }
        }

        return { positions, indices, groups };
    },

    _remapVertex(oldIdx, remap, positions, vRaw) {
        let newIdx = remap.get(oldIdx);
        if (newIdx === undefined) {
            newIdx = positions.length / 3;
            remap.set(oldIdx, newIdx);
            positions.push(
                vRaw[oldIdx * 3],
                vRaw[oldIdx * 3 + 1],
                vRaw[oldIdx * 3 + 2]
            );
        }
        return newIdx;
    },

    // ============================================================
    // STL ASCII PARSER
    // ============================================================
    _parseSTL_ASCII(text) {
        const positions = [];
        const indices = [];
        const groups = {};

        const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
        const verts = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            const x = Number(m[1]);
            const y = Number(m[2]);
            const z = Number(m[3]);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                verts.push(x, y, z);
            }
        }

        const nTris = Math.floor(verts.length / 9);
        for (let t = 0; t < nTris; t++) {
            const off = t * 9;
            const base = positions.length / 3;
            positions.push(
                verts[off],     verts[off + 1], verts[off + 2],
                verts[off + 3], verts[off + 4], verts[off + 5],
                verts[off + 6], verts[off + 7], verts[off + 8]
            );
            indices.push(base, base + 1, base + 2);
        }

        return { positions, indices, groups };
    },

    // ============================================================
    // EXPORT
    // ============================================================
    _exportJSON(data, host) {
        try {
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mesh_${Date.now()}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            if (host && host.notify) host.notify('Export', 'JSON saved', 'success');
        } catch (e) {
            console.error('[Mesh] export failed:', e);
            if (host && host.notify) host.notify('Export error', String(e.message || e), 'error');
        }
    }
};