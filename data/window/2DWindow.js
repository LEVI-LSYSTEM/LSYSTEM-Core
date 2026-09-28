// data/window/2DWindow.js
// Версия 1.1.0
//
// Простое 2D-окно: точки + грани.
//  - Camera и GridCache берутся из this.utils.graph2d (UserAPI).
//  - ThemeAdapter — локальный, читает CSS-переменные --twod-*.
//  - ЛКМ по точке — выделить и тащить.
//  - ЛКМ по пустому — рамка выделения.
//  - MMB / Space — панорама. Ctrl+ЛКМ по точке — начать соединение.
//  - Wheel — зум. Ctrl/Shift+Wheel — панорама.
//  - ПКМ — контекстное меню.
//  - Двойной клик по пустому — добавить точку. По точке — переименовать.
//    По ребру — циклически менять толщину.
//  - Delete — удалить выделенные точки/рёбра.
//  - Ctrl+A/C/V — выделить всё / копировать / вставить.
//  - 1..9 — толщина выделенных рёбер.
//  - Стрелки — двигать выделенные точки. Shift — крупный шаг.
//  - F / Shift+F — zoom to selection / fit.

(function () {
    'use strict';

    const DEBUG = !!window.DEBUG_2DWINDOW;
    const _log = DEBUG ? console.log.bind(console) : () => {};
    const _warn = console.warn.bind(console);
    const _err = console.error.bind(console);

    if (!window.BaseWindowInstance) {
        _err('[2DWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    _log('[2DWindow] Loading v1.1.0...');

    // ============================================================
    // CSS
    // ============================================================
    (function inject2DCSS() {
        if (document.getElementById('twod-styles')) return;
        const style = document.createElement('style');
        style.id = 'twod-styles';
        style.textContent = `
            :root {
                --twod-bg: #1a1a1a;

                --twod-grid-small:  rgba(128, 128, 128, 0.06);
                --twod-grid-medium: rgba(128, 128, 128, 0.13);
                --twod-grid-large:  rgba(128, 128, 128, 0.22);

                --twod-point:          rgba(200, 184, 154, 0.9);
                --twod-point-hover:    rgba(255, 255, 255, 1);
                --twod-point-selected: rgba(204, 34, 51, 1);
                --twod-point-label:    rgba(220, 220, 220, 0.9);

                --twod-edge:          rgba(180, 170, 150, 0.75);
                --twod-edge-hover:    rgba(204, 34, 51, 0.9);
                --twod-edge-selected: rgba(204, 34, 51, 1);

                --twod-selection-bar: rgba(204, 34, 51, 0.55);
                --twod-text:          #e0d8cc;
                --twod-text-muted:    rgba(200, 184, 154, 0.55);
                --twod-accent:        #cc2233;
            }

            [data-theme="light"] {
                --twod-bg: #e8ddd0;

                --twod-grid-small:  rgba(74, 63, 53, 0.05);
                --twod-grid-medium: rgba(74, 63, 53, 0.10);
                --twod-grid-large:  rgba(74, 63, 53, 0.18);

                --twod-point:          rgba(74, 63, 53, 0.9);
                --twod-point-hover:    rgba(0, 0, 0, 1);
                --twod-point-selected: rgba(184, 31, 46, 1);
                --twod-point-label:    #4a3f35;

                --twod-edge:          rgba(74, 63, 53, 0.7);
                --twod-edge-hover:    rgba(184, 31, 46, 0.9);
                --twod-edge-selected: rgba(184, 31, 46, 1);

                --twod-selection-bar: rgba(184, 31, 46, 0.55);
                --twod-text:          #4a3f35;
                --twod-text-muted:    rgba(74, 63, 53, 0.55);
                --twod-accent:        #b81f2e;
            }
        `;
        document.head.appendChild(style);
    })();

    // ============================================================
    // ЛОКАЛЬНЫЕ КОНСТАНТЫ (только то, что специфично для 2D-окна)
    // ============================================================
    const ZOOM_STEP_WHEEL = 0.0015;

    const POINT_RADIUS_BASE = 5;
    const POINT_HIT_RADIUS = 10;
    const EDGE_HIT_THRESHOLD = 8;

    const DRAG_THRESHOLD = 2;
    const SNAP_SMALL = 4;

    const EDGE_WIDTH_DEFAULT = 2;
    const EDGE_WIDTH_MIN = 1;
    const EDGE_WIDTH_MAX = 12;

    const PASTE_OFFSET = 30;

    // ============================================================
    // ЛОКАЛЬНЫЕ УТИЛИТЫ
    // ============================================================
    let _elementId = 1;
    function _nextId() { return _elementId++; }
    function _setIdFloor(v) { if (v >= _elementId) _elementId = v + 1; }

    function _clamp(v, mn, mx) { return v < mn ? mn : (v > mx ? mx : v); }
    function _snapTo(v, step) { return step > 0 ? Math.round(v / step) * step : v; }

    function _distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + dx * t, cy = y1 + dy * t;
        const ddx = px - cx, ddy = py - cy;
        return { dist: Math.sqrt(ddx * ddx + ddy * ddy), t, point: { x: cx, y: cy } };
    }

    // ============================================================
    // THEME
    // ============================================================
    class ThemeAdapter {
        constructor() { this.palette = this._defaults(); }
        _defaults() {
            return {
                bg: '#1a1a1a',
                gridSmall: 'rgba(128,128,128,0.06)',
                gridMedium: 'rgba(128,128,128,0.13)',
                gridLarge: 'rgba(128,128,128,0.22)',

                point: 'rgba(200,184,154,0.9)',
                pointHover: 'rgba(255,255,255,1)',
                pointSelected: 'rgba(204,34,51,1)',
                pointLabel: 'rgba(220,220,220,0.9)',

                edge: 'rgba(180,170,150,0.75)',
                edgeHover: 'rgba(204,34,51,0.9)',
                edgeSelected: 'rgba(204,34,51,1)',

                selectionBar: 'rgba(204,34,51,0.55)',
                text: '#e0d8cc',
                textMuted: 'rgba(200,184,154,0.55)',
                accent: '#cc2233'
            };
        }
        refresh() {
            if (typeof document === 'undefined') return;
            try {
                const cs = getComputedStyle(document.documentElement);
                const read = (n, f) => { const v = cs.getPropertyValue(n); return (v && v.trim()) ? v.trim() : f; };
                const d = this._defaults();
                this.palette = {
                    bg: read('--twod-bg', d.bg),
                    gridSmall: read('--twod-grid-small', d.gridSmall),
                    gridMedium: read('--twod-grid-medium', d.gridMedium),
                    gridLarge: read('--twod-grid-large', d.gridLarge),

                    point: read('--twod-point', d.point),
                    pointHover: read('--twod-point-hover', d.pointHover),
                    pointSelected: read('--twod-point-selected', d.pointSelected),
                    pointLabel: read('--twod-point-label', d.pointLabel),

                    edge: read('--twod-edge', d.edge),
                    edgeHover: read('--twod-edge-hover', d.edgeHover),
                    edgeSelected: read('--twod-edge-selected', d.edgeSelected),

                    selectionBar: read('--twod-selection-bar', d.selectionBar),
                    text: read('--twod-text', d.text),
                    textMuted: read('--twod-text-muted', d.textMuted),
                    accent: read('--twod-accent', d.accent)
                };
            } catch (e) { _warn('[ThemeAdapter] refresh failed:', e); }
        }
    }

    // ============================================================
    // МОДЕЛЬ
    // ============================================================
    class Point {
        constructor(x, y) {
            this.id = _nextId();
            this.x = x;
            this.y = y;
            this.label = '';
            this.selected = false;
        }
        toJSON() { return { id: this.id, x: this.x, y: this.y, label: this.label }; }
    }

    class Edge {
        constructor(aId, bId, width = EDGE_WIDTH_DEFAULT) {
            this.id = _nextId();
            this.aId = aId;
            this.bId = bId;
            this.width = _clamp(width, EDGE_WIDTH_MIN, EDGE_WIDTH_MAX);
        }
        involves(id) { return id === this.aId || id === this.bId; }
        toJSON() { return { id: this.id, aId: this.aId, bId: this.bId, width: this.width }; }
    }

    class Graph2D {
        constructor() {
            this.points = [];
            this.edges = [];
            this.selectedPointIds = new Set();
            this.selectedEdgeIds = new Set();
            this._version = 0;
        }

        addPoint(x, y, label = '') {
            const p = new Point(x, y);
            p.label = label;
            this.points.push(p);
            this._bump();
            return p;
        }

        removePoint(id) {
            const i = this.points.findIndex(p => p.id === id);
            if (i < 0) return false;
            this.points.splice(i, 1);
            this.edges = this.edges.filter(e => !e.involves(id));
            this.selectedPointIds.delete(id);
            this._bump();
            return true;
        }

        getPoint(id) { return this.points.find(p => p.id === id) || null; }
        getEdge(id) { return this.edges.find(e => e.id === id) || null; }

        getPointAt(wx, wy, radius) {
            for (let i = this.points.length - 1; i >= 0; i--) {
                const p = this.points[i];
                const dx = p.x - wx, dy = p.y - wy;
                if (dx * dx + dy * dy <= radius * radius) return p;
            }
            return null;
        }

        getEdgeAt(wx, wy, threshold) {
            let best = null;
            for (const e of this.edges) {
                const a = this.getPoint(e.aId), b = this.getPoint(e.bId);
                if (!a || !b) continue;
                const d = _distToSegment(wx, wy, a.x, a.y, b.x, b.y);
                if (d.dist <= threshold && (!best || d.dist < best.dist)) {
                    best = { edge: e, dist: d.dist, point: d.point };
                }
            }
            return best;
        }

        addEdge(aId, bId, width = EDGE_WIDTH_DEFAULT) {
            if (aId === bId) return { edge: null, reason: 'Точки совпадают' };
            if (!this.getPoint(aId) || !this.getPoint(bId)) return { edge: null, reason: 'Точка не найдена' };
            const dup = this.edges.some(e => (e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId));
            if (dup) return { edge: null, reason: 'Ребро уже существует' };
            const e = new Edge(aId, bId, width);
            this.edges.push(e);
            this._bump();
            return { edge: e, reason: null };
        }

        removeEdge(id) {
            const i = this.edges.findIndex(e => e.id === id);
            if (i < 0) return false;
            this.edges.splice(i, 1);
            this.selectedEdgeIds.delete(id);
            this._bump();
            return true;
        }

        setEdgeWidth(id, w) {
            const e = this.getEdge(id);
            if (!e) return false;
            e.width = _clamp(Math.round(w), EDGE_WIDTH_MIN, EDGE_WIDTH_MAX);
            this._bump();
            return true;
        }

        selectPoint(id, replace = true) {
            if (replace) { this.selectedPointIds.clear(); this.selectedEdgeIds.clear(); }
            this.selectedPointIds.add(id);
            this._sync();
            this._bump();
        }
        selectEdge(id, replace = true) {
            if (replace) { this.selectedPointIds.clear(); this.selectedEdgeIds.clear(); }
            this.selectedEdgeIds.add(id);
            this._sync();
            this._bump();
        }
        selectMany(pointIds, edgeIds, replace = true) {
            if (replace) { this.selectedPointIds.clear(); this.selectedEdgeIds.clear(); }
            for (const id of pointIds) if (this.getPoint(id)) this.selectedPointIds.add(id);
            for (const id of edgeIds) if (this.getEdge(id)) this.selectedEdgeIds.add(id);
            this._sync();
            this._bump();
        }
        deselect() {
            this.selectedPointIds.clear();
            this.selectedEdgeIds.clear();
            this._sync();
            this._bump();
        }
        isSelectedPoint(id) { return this.selectedPointIds.has(id); }
        isSelectedEdge(id) { return this.selectedEdgeIds.has(id); }

        clear() {
            this.points = [];
            this.edges = [];
            this.selectedPointIds.clear();
            this.selectedEdgeIds.clear();
            this._bump();
        }

        _sync() {
            for (const p of this.points) p.selected = this.selectedPointIds.has(p.id);
        }

        _bump() { this._version++; }
        getVersion() { return this._version; }

        toJSON() {
            return {
                points: this.points.map(p => p.toJSON()),
                edges: this.edges.map(e => e.toJSON())
            };
        }
    }

    // ============================================================
    // RENDERER
    // ============================================================
    class Renderer {
        constructor(canvas, camera, theme, gridCache) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
            this.camera = camera;
            this.theme = theme;
            this.gridCache = gridCache;
            this.graph = null;
            this.dirty = true;
            this._renderId = null;
            this._lastVersion = -1;

            this.selectionRect = null;
            this.hoverPointId = null;
            this.hoverEdgeId = null;
            this.tempEdge = null;

            this._hudCache = { version: -1, text: '' };
        }

        setGraph(g) {
            this.graph = g;
            this._lastVersion = -1;
            this._hudCache.version = -1;
            this.markDirty();
        }

        markDirty() {
            this.dirty = true;
            this._schedule();
        }

        _schedule() {
            if (this._renderId !== null) return;
            this._renderId = requestAnimationFrame(() => {
                this._renderId = null;
                this.render();
            });
        }

        render() {
            if (!this.graph) { this._schedule(); return; }
            const v = this.graph.getVersion();
            if (!this.dirty && v === this._lastVersion) { this._schedule(); return; }
            this.dirty = false;
            this._lastVersion = v;

            const ctx = this.ctx;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const w = this.canvas.width / dpr;
            const h = this.canvas.height / dpr;
            if (w < 10 || h < 10) { this._schedule(); return; }

            const p = this.theme.palette;
            ctx.fillStyle = p.bg;
            ctx.fillRect(0, 0, w, h);

            this.gridCache.render(ctx, this.camera, w, h, dpr);

            this._renderEdges(ctx);
            if (this.tempEdge) this._renderTempEdge(ctx);
            this._renderPoints(ctx);

            if (this.selectionRect) this._renderSelection(ctx);

            this._renderHUD(ctx, w, h);
        }

        _renderEdges(ctx) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;

            for (const e of this.graph.edges) {
                const a = this.graph.getPoint(e.aId);
                const b = this.graph.getPoint(e.bId);
                if (!a || !b) continue;

                const sa = this.camera.worldToScreen(a.x, a.y);
                const sb = this.camera.worldToScreen(b.x, b.y);

                const isSel = this.graph.isSelectedEdge(e.id);
                const isHover = this.hoverEdgeId === e.id;

                ctx.strokeStyle = isSel ? p.edgeSelected : (isHover ? p.edgeHover : p.edge);
                ctx.lineWidth = Math.max(1, e.width * zoom);
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.moveTo(sa.x, sa.y);
                ctx.lineTo(sb.x, sb.y);
                ctx.stroke();
            }
        }

        _renderTempEdge(ctx) {
            if (!this.tempEdge) return;
            const sa = this.camera.worldToScreen(this.tempEdge.from.x, this.tempEdge.from.y);
            ctx.strokeStyle = this.tempEdge.ok === true ? 'rgba(120,200,140,0.9)'
                            : this.tempEdge.ok === false ? 'rgba(220,80,80,0.9)'
                            : 'rgba(204,34,51,0.7)';
            ctx.lineWidth = Math.max(1.5, 2 * this.camera.zoom);
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(this.tempEdge.to.x, this.tempEdge.to.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        _renderPoints(ctx) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const baseR = Math.max(3, POINT_RADIUS_BASE * zoom);
            const showLabels = zoom > 0.6;

            for (const pt of this.graph.points) {
                const s = this.camera.worldToScreen(pt.x, pt.y);
                const isSel = this.graph.isSelectedPoint(pt.id);
                const isHover = this.hoverPointId === pt.id;

                let r = baseR;
                if (isSel) r *= 1.25;
                if (isHover) r *= 1.35;

                ctx.beginPath();
                ctx.arc(s.x, s.y, r + 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fillStyle = isSel ? p.pointSelected : (isHover ? p.pointHover : p.point);
                ctx.fill();

                ctx.strokeStyle = isSel ? p.pointSelected : 'rgba(0,0,0,0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (showLabels && pt.label) {
                    ctx.fillStyle = p.pointLabel;
                    ctx.font = `${Math.max(9, 11 * zoom)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(pt.label, s.x, s.y - r - 3);
                }
            }
        }

        _renderSelection(ctx) {
            const { x1, y1, x2, y2 } = this.selectionRect;
            const sx1 = (x1 + this.camera.x) * this.camera.zoom;
            const sy1 = (y1 + this.camera.y) * this.camera.zoom;
            const sx2 = (x2 + this.camera.x) * this.camera.zoom;
            const sy2 = (y2 + this.camera.y) * this.camera.zoom;

            ctx.save();
            ctx.strokeStyle = this.theme.palette.selectionBar;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(Math.min(sx1, sx2), Math.min(sy1, sy2), Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
            ctx.fillStyle = 'rgba(204,34,51,0.06)';
            ctx.fillRect(Math.min(sx1, sx2), Math.min(sy1, sy2), Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
            ctx.restore();
        }

        _renderHUD(ctx, w, h) {
            const p = this.theme.palette;
            ctx.fillStyle = p.textMuted;
            ctx.font = '11px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';

            const key = this.graph.getVersion();
            const zoomPct = this.camera.getZoomPercent();
            if (this._hudCache.version !== key || this._hudCache.zoomPct !== zoomPct) {
                const selPts = this.graph.selectedPointIds.size;
                const selEdges = this.graph.selectedEdgeIds.size;
                this._hudCache.version = key;
                this._hudCache.zoomPct = zoomPct;
                this._hudCache.text =
                    `Zoom: ${zoomPct}%  ·  Points: ${this.graph.points.length}  ·  Edges: ${this.graph.edges.length}` +
                    `  ·  Sel: ${selPts}т/${selEdges}р`;
            }
            ctx.fillText(this._hudCache.text, 12, h - 10);

            ctx.textAlign = 'right';
            ctx.font = '10px monospace';
            ctx.fillStyle = p.textMuted;
            ctx.fillText(
                'ЛКМ — точка/рамка  ·  ПКМ — меню  ·  MMB/Space — pan  ·  Wheel — zoom  ·  Ctrl+ЛКМ по точке — ребро',
                w - 12, h - 10
            );
        }

        resize() {
            const parent = this.canvas.parentElement;
            if (!parent) return;
            const rect = parent.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.camera.setViewport(rect.width, rect.height);
            this.markDirty();
        }

        invalidateGrid() {
            if (this.gridCache) this.gridCache.invalidate();
            this.markDirty();
        }

        setSelectionRect(r) { this.selectionRect = r; this.markDirty(); }
        clearSelectionRect() { this.selectionRect = null; this.markDirty(); }
        setHoverPoint(id) { this.hoverPointId = id; this.markDirty(); }
        setHoverEdge(id) { this.hoverEdgeId = id; this.markDirty(); }
        setTempEdge(t) { this.tempEdge = t; this.markDirty(); }

        destroy() {
            if (this._renderId) { cancelAnimationFrame(this._renderId); this._renderId = null; }
            this.graph = null;
        }
    }

    // ============================================================
    // INPUT MANAGER
    // ============================================================
    class InputManager {
        constructor(canvas, camera, renderer, host) {
            this.canvas = canvas;
            this.camera = camera;
            this.renderer = renderer;
            this.host = host;

            this._isPanning = false;
            this._isDragging = false;
            this._isSelecting = false;
            this._isConnecting = false;

            this._pendingDrag = null;
            this._dragStartWorld = null;
            this._dragStartScreen = null;
            this._dragPoints = null;

            this._selectStartWorld = null;

            this._connectFrom = null;

            this._spaceHeld = false;
            this._snapEnabled = true;

            this._bound = {
                down: this._onDown.bind(this),
                move: this._onMove.bind(this),
                up: this._onUp.bind(this),
                leave: this._onLeave.bind(this),
                wheel: this._onWheel.bind(this),
                dbl: this._onDbl.bind(this),
                keyDown: this._onKeyDown.bind(this),
                keyUp: this._onKeyUp.bind(this),
                ctx: (e) => { e.preventDefault(); e.stopPropagation(); },
                click: (e) => { e.stopPropagation(); e.preventDefault(); }
            };

            this._bind();
        }

        get graph() { return this.host._graph; }
        get g2d() { return this.host.utils.graph2d; }

        _bind() {
            this.canvas.addEventListener('mousedown', this._bound.down);
            this.canvas.addEventListener('mousemove', this._bound.move);
            this.canvas.addEventListener('mouseup', this._bound.up);
            this.canvas.addEventListener('mouseleave', this._bound.leave);
            this.canvas.addEventListener('wheel', this._bound.wheel, { passive: false });
            this.canvas.addEventListener('dblclick', this._bound.dbl);
            this.canvas.addEventListener('click', this._bound.click);
            this.canvas.addEventListener('contextmenu', this._bound.ctx);
            document.addEventListener('keydown', this._bound.keyDown);
            document.addEventListener('keyup', this._bound.keyUp);
        }

        _mouse(e) {
            const r = this.canvas.getBoundingClientRect();
            return { screenX: e.clientX - r.left, screenY: e.clientY - r.top };
        }

        _pointAt(wx, wy) {
            const r = Math.max(POINT_HIT_RADIUS / this.camera.zoom, POINT_RADIUS_BASE);
            return this.graph.getPointAt(wx, wy, r);
        }

        _snapStep() { return this._snapEnabled ? SNAP_SMALL : 0; }

        _onKeyDown(e) {
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

            if (e.code === 'Space' && !this._spaceHeld) {
                this._spaceHeld = true;
                if (!this._isPanning) this.canvas.style.cursor = 'grab';
                e.preventDefault();
                return;
            }

            if (e.key === 'Alt') { this._snapEnabled = false; return; }

            const g = this.graph;
            if (window.__uiMenuRegistry && window.__uiMenuRegistry.size() > 0) return;

            if (e.key === 'Escape') {
                if (this._isConnecting) {
                    this._isConnecting = false;
                    this._connectFrom = null;
                    this.renderer.setTempEdge(null);
                    this.renderer.markDirty();
                    e.preventDefault();
                    return;
                }
                if (g) { g.deselect(); this.renderer.markDirty(); e.preventDefault(); }
                return;
            }

            if (!g) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (g.selectedPointIds.size || g.selectedEdgeIds.size) {
                    e.preventDefault();
                    for (const id of Array.from(g.selectedPointIds)) g.removePoint(id);
                    for (const id of Array.from(g.selectedEdgeIds)) g.removeEdge(id);
                    this.host._saveAndRecord('Удаление');
                    this.renderer.markDirty();
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                g.selectMany(g.points.map(p => p.id), g.edges.map(x => x.id));
                this.renderer.markDirty();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                this.host.copySelection();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                this.host.pasteClipboard();
                return;
            }

            if (e.key === '0') {
                e.preventDefault();
                this.camera.zoomToCenter(1.0, false);
                this.renderer.markDirty();
                return;
            }
            if (e.key === '+' || e.key === '=') { e.preventDefault(); this.camera.zoomIn(); this.renderer.markDirty(); return; }
            if (e.key === '-' || e.key === '_') { e.preventDefault(); this.camera.zoomOut(); this.renderer.markDirty(); return; }

            if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                this.host.zoomToFit();
                return;
            }
            if (!e.shiftKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                this.host.zoomToSelection();
                return;
            }

            if (/^[1-9]$/.test(e.key)) {
                const w = parseInt(e.key, 10);
                if (g.selectedEdgeIds.size > 0) {
                    e.preventDefault();
                    for (const id of g.selectedEdgeIds) g.setEdgeWidth(id, w);
                    this.host._saveAndRecord(`Толщина рёбер: ${w}`);
                    this.renderer.markDirty();
                }
                return;
            }

            const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (arrows.includes(e.key)) {
                const pts = Array.from(g.selectedPointIds).map(id => g.getPoint(id)).filter(Boolean);
                if (pts.length === 0) return;
                e.preventDefault();
                const step = e.shiftKey ? SNAP_SMALL * 4 : SNAP_SMALL;
                const dx = e.key === 'ArrowRight' ? step : (e.key === 'ArrowLeft' ? -step : 0);
                const dy = e.key === 'ArrowDown' ? step : (e.key === 'ArrowUp' ? -step : 0);
                for (const p of pts) { p.x += dx; p.y += dy; }
                g._bump();
                this.host._saveAndRecord('Сдвиг точек');
                this.renderer.markDirty();
                return;
            }
        }

        _onKeyUp(e) {
            if (e.code === 'Space') {
                this._spaceHeld = false;
                if (!this._isPanning) this.canvas.style.cursor = 'default';
            }
            if (e.key === 'Alt') this._snapEnabled = true;
        }

        _onDown(e) {
            if (e.button === 1) {
                this._isPanning = true;
                const { screenX, screenY } = this._mouse(e);
                this._dragStartScreen = { x: screenX, y: screenY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.button !== 0) return;

            const { screenX, screenY } = this._mouse(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const g = this.graph;
            if (!g) return;

            if (this._spaceHeld || e.ctrlKey) {
                const pt = this._pointAt(world.x, world.y);
                if (pt) {
                    this._isConnecting = true;
                    this._connectFrom = pt;
                    this.renderer.setTempEdge({
                        from: { x: pt.x, y: pt.y },
                        to: { x: screenX, y: screenY },
                        ok: null
                    });
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                this._isPanning = true;
                this._dragStartScreen = { x: screenX, y: screenY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const pt = this._pointAt(world.x, world.y);
            if (pt) {
                if (e.shiftKey) {
                    if (g.isSelectedPoint(pt.id)) {
                        g.selectedPointIds.delete(pt.id);
                        pt.selected = false;
                        g._bump();
                        this.renderer.markDirty();
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    g.selectPoint(pt.id, false);
                } else {
                    if (!g.isSelectedPoint(pt.id)) g.selectPoint(pt.id);
                }
                this.renderer.markDirty();

                this._pendingDrag = {
                    startWorld: { x: world.x, y: world.y },
                    hitPointId: pt.id
                };
                this.canvas.style.cursor = 'grab';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const edgeHit = g.getEdgeAt(world.x, world.y, EDGE_HIT_THRESHOLD / this.camera.zoom);
            if (edgeHit) {
                g.selectEdge(edgeHit.edge.id, !e.shiftKey);
                this.renderer.markDirty();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            this._isSelecting = true;
            this._selectStartWorld = { x: world.x, y: world.y };
            this.renderer.setSelectionRect({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
            if (!e.shiftKey) g.deselect();
            this.renderer.markDirty();
            e.preventDefault();
            e.stopPropagation();
        }

        _onMove(e) {
            const { screenX, screenY } = this._mouse(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const g = this.graph;

            if (this._isPanning) {
                const dx = (screenX - this._dragStartScreen.x) / this.camera.zoom;
                const dy = (screenY - this._dragStartScreen.y) / this.camera.zoom;
                this.camera.panByWorld(-dx, -dy);
                this._dragStartScreen = { x: screenX, y: screenY };
                this.renderer.markDirty();
                return;
            }

            if (!g) return;

            if (this._isConnecting) {
                const from = this._connectFrom;
                const hoverPt = this._pointAt(world.x, world.y);
                let ok = null;
                if (hoverPt && hoverPt.id !== from.id) {
                    const dup = g.edges.some(ed =>
                        (ed.aId === from.id && ed.bId === hoverPt.id) ||
                        (ed.aId === hoverPt.id && ed.bId === from.id)
                    );
                    ok = !dup;
                } else if (hoverPt && hoverPt.id === from.id) {
                    ok = false;
                }
                this.renderer.setTempEdge({
                    from: { x: from.x, y: from.y },
                    to: { x: screenX, y: screenY },
                    ok
                });
                return;
            }

            if (this._pendingDrag && !this._isDragging) {
                const pd = this._pendingDrag;
                const dx = world.x - pd.startWorld.x;
                const dy = world.y - pd.startWorld.y;
                if (Math.abs(dx) * this.camera.zoom > DRAG_THRESHOLD ||
                    Math.abs(dy) * this.camera.zoom > DRAG_THRESHOLD) {
                    this._isDragging = true;
                    this._dragStartWorld = { x: pd.startWorld.x, y: pd.startWorld.y };
                    const ids = g.selectedPointIds.size ? Array.from(g.selectedPointIds) : [pd.hitPointId];
                    this._dragPoints = ids.map(id => {
                        const p = g.getPoint(id);
                        return p ? { id, x0: p.x, y0: p.y } : null;
                    }).filter(Boolean);
                    this.canvas.style.cursor = 'grabbing';
                    this._pendingDrag = null;
                }
            }

            if (this._isDragging && this._dragPoints) {
                const rawDx = world.x - this._dragStartWorld.x;
                const rawDy = world.y - this._dragStartWorld.y;

                const step = this._snapStep();
                let sdx = rawDx, sdy = rawDy;
                if (step > 0 && this._dragPoints.length > 0) {
                    const anchor = this._dragPoints[0];
                    sdx = _snapTo(anchor.x0 + rawDx, step) - anchor.x0;
                    sdy = _snapTo(anchor.y0 + rawDy, step) - anchor.y0;
                }

                for (const rec of this._dragPoints) {
                    const p = g.getPoint(rec.id);
                    if (!p) continue;
                    p.x = rec.x0 + sdx;
                    p.y = rec.y0 + sdy;
                }
                g._bump();
                this.renderer.markDirty();
                return;
            }

            if (this._isSelecting) {
                this.renderer.setSelectionRect({
                    x1: this._selectStartWorld.x, y1: this._selectStartWorld.y,
                    x2: world.x, y2: world.y
                });
                return;
            }

            const pt = this._pointAt(world.x, world.y);
            this.renderer.setHoverPoint(pt ? pt.id : null);

            if (pt) {
                this.renderer.setHoverEdge(null);
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'move';
                return;
            }

            const edgeHit = g.getEdgeAt(world.x, world.y, EDGE_HIT_THRESHOLD / this.camera.zoom);
            this.renderer.setHoverEdge(edgeHit ? edgeHit.edge.id : null);
            if (edgeHit) {
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'pointer';
                return;
            }

            this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
        }

        _onUp(e) {
            e.stopPropagation();
            const g = this.graph;
            if (!g) { this._reset(); return; }

            if (this._isPanning) {
                this._isPanning = false;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
                return;
            }

            if (this._isConnecting) {
                const { screenX, screenY } = this._mouse(e);
                const world = this.camera.screenToWorld(screenX, screenY);
                const hit = this._pointAt(world.x, world.y);
                if (hit && hit.id !== this._connectFrom.id) {
                    const res = g.addEdge(this._connectFrom.id, hit.id, EDGE_WIDTH_DEFAULT);
                    if (res.edge) {
                        this.host._saveAndRecord('Добавлено ребро');
                    } else {
                        this.host.notify('Ребро не создано', res.reason || '', 'warning');
                    }
                }
                this._isConnecting = false;
                this._connectFrom = null;
                this.renderer.setTempEdge(null);
                this.renderer.markDirty();
                return;
            }

            if (this._pendingDrag && !this._isDragging) {
                this._pendingDrag = null;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
            }

            if (this._isDragging) {
                this._isDragging = false;
                this._dragPoints = null;
                this._dragStartWorld = null;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
                this.host._saveAndRecord('Перемещение точек');
                return;
            }

            if (this._isSelecting) {
                this._isSelecting = false;
                this.renderer.clearSelectionRect();
                const { screenX, screenY } = this._mouse(e);
                const world = this.camera.screenToWorld(screenX, screenY);
                const x1 = Math.min(this._selectStartWorld.x, world.x);
                const x2 = Math.max(this._selectStartWorld.x, world.x);
                const y1 = Math.min(this._selectStartWorld.y, world.y);
                const y2 = Math.max(this._selectStartWorld.y, world.y);

                const ptIds = [];
                for (const p of g.points) {
                    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) ptIds.push(p.id);
                }
                const edgeIds = [];
                for (const ed of g.edges) {
                    if (ptIds.includes(ed.aId) && ptIds.includes(ed.bId)) edgeIds.push(ed.id);
                }

                if (ptIds.length > 0 || edgeIds.length > 0) {
                    g.selectMany(ptIds, edgeIds, !e.shiftKey);
                } else if (!e.shiftKey) {
                    g.deselect();
                }
                this._selectStartWorld = null;
                this.renderer.markDirty();
                return;
            }
        }

        _onLeave() {
            if (this._isConnecting) {
                this._isConnecting = false;
                this._connectFrom = null;
                this.renderer.setTempEdge(null);
            }
            this._pendingDrag = null;
        }

        _onWheel(e) {
            e.preventDefault();
            let dy = e.deltaY;
            let dx = e.deltaX || 0;
            if (e.deltaMode === 1) { dy *= 16; dx *= 16; }
            else if (e.deltaMode === 2) { dy *= 400; dx *= 400; }

            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                const inv = 1 / this.camera.zoom;
                this.camera.panByWorld(dx * inv, dy * inv);
                this.renderer.markDirty();
                return;
            }

            const { screenX, screenY } = this._mouse(e);
            const g2d = this.g2d;
            const delta = -dy * ZOOM_STEP_WHEEL;
            const nz = _clamp(this.camera.zoom * Math.exp(delta), g2d.ZOOM_MIN, g2d.ZOOM_MAX);
            this.camera.zoomToPoint(nz, screenX, screenY, false);
            this.renderer.markDirty();
        }

        _onDbl(e) {
            const { screenX, screenY } = this._mouse(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const g = this.graph;
            if (!g) return;

            const pt = this._pointAt(world.x, world.y);
            if (pt) {
                this.host.editPointLabel(pt);
                return;
            }

            const edgeHit = g.getEdgeAt(world.x, world.y, EDGE_HIT_THRESHOLD / this.camera.zoom);
            if (edgeHit) {
                const cur = edgeHit.edge.width;
                const next = cur >= 6 ? EDGE_WIDTH_MIN : cur + 1;
                g.setEdgeWidth(edgeHit.edge.id, next);
                this.host._saveAndRecord(`Толщина ребра: ${next}`);
                this.renderer.markDirty();
                return;
            }

            const np = g.addPoint(world.x, world.y, '');
            g.selectPoint(np.id);
            this.host._saveAndRecord('Добавлена точка');
            this.renderer.markDirty();
        }

        _reset() {
            this._isPanning = false;
            this._isDragging = false;
            this._isSelecting = false;
            this._isConnecting = false;
            this._pendingDrag = null;
            this._dragPoints = null;
            this._dragStartWorld = null;
            this._selectStartWorld = null;
            this._connectFrom = null;
            if (this.renderer) {
                this.renderer.setTempEdge(null);
                this.renderer.clearSelectionRect();
                this.renderer.markDirty();
            }
        }

        destroy() {
            this.canvas.removeEventListener('mousedown', this._bound.down);
            this.canvas.removeEventListener('mousemove', this._bound.move);
            this.canvas.removeEventListener('mouseup', this._bound.up);
            this.canvas.removeEventListener('mouseleave', this._bound.leave);
            this.canvas.removeEventListener('wheel', this._bound.wheel);
            this.canvas.removeEventListener('dblclick', this._bound.dbl);
            this.canvas.removeEventListener('click', this._bound.click);
            this.canvas.removeEventListener('contextmenu', this._bound.ctx);
            document.removeEventListener('keydown', this._bound.keyDown);
            document.removeEventListener('keyup', this._bound.keyUp);
        }
    }

    // ============================================================
    // ОКНО
    // ============================================================
    class TwoDWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'twod',
                name: '2D Graph',
                icon: 'icon-layout',
                description: '2D точки и грани',
                group: 'Редакторы',
                category: 'editor',
                priority: 3,
                defaultSize: { width: 800, height: 560 },
                minSize: { width: 360, height: 260 },
                maxWindows: 4,
                metadata: { version: '1.1.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'twod-dd',
                        type: 'dropdown',
                        icon: 'icon-menu',
                        label: 'Граф',
                        items: [
                            { header: 'Навигация' },
                            { icon: 'icon-zoom-in', label: 'Zoom to fit', action: 'zoomToFit', shortcut: 'Shift+F' },
                            { icon: 'icon-zoom-in', label: 'Zoom to selection', action: 'zoomToSelection', shortcut: 'F' },
                            { icon: 'icon-refresh', label: 'Сброс камеры', action: 'resetCamera' },
                            { divider: true },
                            { header: 'Точки' },
                            { icon: 'icon-plus', label: 'Добавить точку', action: 'addPointAtCenter' },
                            { icon: 'icon-copy', label: 'Копировать', action: 'copySelection', shortcut: 'Ctrl+C' },
                            { icon: 'icon-paste', label: 'Вставить', action: 'pasteClipboard', shortcut: 'Ctrl+V' },
                            { divider: true },
                            { header: 'Рёбра (толщина)' },
                            { icon: 'icon-minus', label: 'Тоньше', action: 'edgeWidthThinner', shortcut: '1-9' },
                            { icon: 'icon-plus',  label: 'Толще',  action: 'edgeWidthThicker',  shortcut: '1-9' },
                            { divider: true },
                            { icon: 'icon-clear', label: 'Очистить всё', action: 'clearAll', danger: true }
                        ]
                    }
                ]
            };
        }

        static get hotkeys() {
            return {
                'Ctrl+N': { label: 'Добавить точку', action: 'addPointAtCenter' }
            };
        }

        constructor(container, windowData, options) {
            super(container, windowData, options);
        }

        _ensureFields() {
            if (this._fieldsReady) return;

            this._graph = new Graph2D();
            this._camera = null;
            this._theme = null;
            this._renderer = null;
            this._input = null;
            this._canvas = null;
            this._loopId = null;
            this._lastLoopTime = 0;
            this._clipboard = null;
            this._isSelfSave = false;
            this._pendingGraph = null;

            this._fieldsReady = true;
        }

        buildContent(el) {
            this._ensureFields();
            if (this._canvas) return;

            Object.assign(el.style, {
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--twod-bg, var(--bg-panel, #1a1a1a))'
            });

            this._canvas = document.createElement('canvas');
            Object.assign(this._canvas.style, {
                display: 'block',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: '0', left: '0'
            });
            el.appendChild(this._canvas);

            this._theme = new ThemeAdapter();
            this._theme.refresh();

            // Camera + GridCache из UserAPI
            this._camera = this.utils.graph2d.camera({
                physics: { friction: 0.92, frictionZoom: 0.85, maxVelocity: 100, maxVelocityZoom: 0.5 }
            });
            const gridCache = this.utils.graph2d.gridCache(this._theme);

            this._renderer = new Renderer(this._canvas, this._camera, this._theme, gridCache);
            this._renderer.setGraph(this._graph);

            this._input = new InputManager(this._canvas, this._camera, this._renderer, this);

            this._contextMenuHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showContextMenu(e.clientX, e.clientY);
            };
            this._canvas.addEventListener('contextmenu', this._contextMenuHandler);
        }

        onReady() {
            this._ensureFields();

            if (!this._canvas) {
                const host = this._content || this.container;
                if (host) {
                    try { this.buildContent(host); }
                    catch (e) { _err('[2DWindow] late buildContent failed:', e); }
                }
            }

            this._restoreFromSlot();

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this._renderer) {
                        this._renderer.resize();
                        this._renderer.markDirty();
                    }
                });
            });

            this._startLoop();
        }

        onData() {
            this._ensureDefaults();
            this._restoreFromSlot();
            if (this._isSelfSave) {
                if (this._renderer) this._renderer.markDirty();
                return;
            }
            if (this._renderer) this._renderer.markDirty();
        }

        onResize() {
            if (this._isDestroyed || !this._renderer) return;
            this._renderer.resize();
        }

        onThemeChange() {
            if (this._theme) this._theme.refresh();
            if (this._renderer) {
                this._renderer.invalidateGrid();
                this._renderer.markDirty();
            }
        }

        onVisibilityChange(visible) {
            if (visible && this._renderer) {
                this._renderer.resize();
                this._renderer.markDirty();
            }
        }

        onBeforeDestroy() {
            if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
            if (this._input) { this._input.destroy(); this._input = null; }
            if (this._canvas && this._contextMenuHandler) {
                this._canvas.removeEventListener('contextmenu', this._contextMenuHandler);
                this._contextMenuHandler = null;
            }
            if (this._renderer) { this._renderer.destroy(); this._renderer = null; }
            if (this._camera) { this._camera.destroy(); this._camera = null; }
            this._canvas = null;
            this._clipboard = null;
        }

        onExport() {
            return {
                version: '1.1.0',
                graph: this._graph.toJSON(),
                view: this._camera ? { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom } : null
            };
        }

        onImport(parsed) {
            if (!parsed || typeof parsed !== 'object') return false;
            const gd = parsed.graph || parsed;
            if (!gd || !Array.isArray(gd.points)) return false;

            let maxId = 0;
            for (const p of gd.points) if (p.id > maxId) maxId = p.id;
            for (const e of (gd.edges || [])) if (e.id > maxId) maxId = e.id;
            _setIdFloor(maxId);

            const g = new Graph2D();
            const idMap = new Map();
            for (const p of gd.points) {
                const np = g.addPoint(p.x, p.y, p.label || '');
                np.id = p.id;
                idMap.set(p.id, np);
            }
            for (const e of (gd.edges || [])) {
                if (!idMap.has(e.aId) || !idMap.has(e.bId)) continue;
                const ne = new Edge(e.aId, e.bId, e.width || EDGE_WIDTH_DEFAULT);
                ne.id = e.id;
                g.edges.push(ne);
            }

            this._graph = g;
            if (this._renderer) {
                this._renderer.setGraph(g);
                this._renderer.markDirty();
            }

            const v = parsed.view;
            if (v && this._camera) {
                this._camera.x = v.x || 0;
                this._camera.y = v.y || 0;
                this._camera.zoom = _clamp(v.zoom || 1.0, this.utils.graph2d.ZOOM_MIN, this.utils.graph2d.ZOOM_MAX);
                this._camera.invalidateCache();
            }

            return true;
        }

        _ensureDefaults() {
            if (!this.uiState || typeof this.uiState !== 'object') this.uiState = {};
            if (!this.data || typeof this.data !== 'object') this.data = {};
        }

        _restoreFromSlot() {
            this._ensureDefaults();
            this._pendingGraph = (this.data && this.data.graph) ? this.data.graph : null;
            if (this._pendingGraph) {
                try { this.onImport({ graph: this._pendingGraph, view: this.uiState.view }); } catch (e) {}
                this._pendingGraph = null;
            } else if (this.uiState && this.uiState.view && this._camera) {
                const v = this.uiState.view;
                this._camera.x = v.x || 0;
                this._camera.y = v.y || 0;
                this._camera.zoom = _clamp(v.zoom || 1.0, this.utils.graph2d.ZOOM_MIN, this.utils.graph2d.ZOOM_MAX);
                this._camera.invalidateCache();
            }
        }

        _save() {
            if (!this.data) this.data = {};
            this.data.graph = this._graph.toJSON();
            if (!this.uiState) this.uiState = {};
            if (this._camera) {
                this.uiState.view = { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom };
            }
            this._isSelfSave = true;
            try { if (typeof this.save === 'function') this.save(); }
            finally { this._isSelfSave = false; }
        }

        _saveAndRecord(label) {
            this._save();
            this.recordHistory(String(label || 'Изменение 2D-графа'));
        }

        _startLoop() {
            if (this._loopId !== null) return;
            this._lastLoopTime = performance.now();
            const tick = () => {
                if (this._isDestroyed) { this._loopId = null; return; }
                const now = performance.now();
                const dt = Math.min((now - this._lastLoopTime) / 1000, 0.05);
                this._lastLoopTime = now;
                if (this._camera) this._camera.update(dt);
                this._loopId = requestAnimationFrame(tick);
            };
            this._loopId = requestAnimationFrame(tick);
        }

        // -------- Действия --------

        addPointAtCenter() {
            if (this._isDestroyed) return;
            if (!this._camera || !this._graph) return;
            const c = this._camera.getViewCenter();
            const p = this._graph.addPoint(c.x, c.y, '');
            this._graph.selectPoint(p.id);
            this._renderer.markDirty();
            this._saveAndRecord('Добавлена точка');
        }

        clearAll() {
            if (this._isDestroyed) return;
            this._graph.clear();
            this._renderer.markDirty();
            this._saveAndRecord('Очистка');
        }

        resetCamera() {
            if (this._camera) this._camera.reset();
            if (this._renderer) this._renderer.markDirty();
        }

        zoomToFit() {
            if (this._isDestroyed || !this._camera) return;
            const pts = this._graph.points;
            if (pts.length === 0) { this._camera.reset(); return; }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            const pad = 60;
            const cw = (maxX - minX) + pad * 2;
            const ch = (maxY - minY) + pad * 2;
            const vw = this._camera.viewportWidth;
            const vh = this._camera.viewportHeight;
            if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return;

            const g2d = this.utils.graph2d;
            const targetZoom = _clamp(Math.min(vw / cw, vh / ch), g2d.ZOOM_MIN, g2d.ZOOM_MAX);
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;

            this._camera.stopAnimation();
            this._camera.zoomToCenter(targetZoom, false);
            this._camera.moveCenterTo(cx, cy, true);
            this._renderer.markDirty();
        }

        zoomToSelection() {
            if (this._isDestroyed || !this._camera) return;
            const ids = Array.from(this._graph.selectedPointIds);
            if (ids.length === 0) { this.zoomToFit(); return; }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const id of ids) {
                const p = this._graph.getPoint(id);
                if (!p) continue;
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            const pad = 60;
            const cw = (maxX - minX) + pad * 2;
            const ch = (maxY - minY) + pad * 2;
            const vw = this._camera.viewportWidth;
            const vh = this._camera.viewportHeight;
            if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return;

            const g2d = this.utils.graph2d;
            const targetZoom = _clamp(Math.min(vw / cw, vh / ch), g2d.ZOOM_MIN, g2d.ZOOM_MAX);
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;

            this._camera.stopAnimation();
            this._camera.zoomToCenter(targetZoom, false);
            this._camera.moveCenterTo(cx, cy, true);
            this._renderer.markDirty();
        }

        edgeWidthThinner() {
            const g = this._graph;
            if (!g.selectedEdgeIds.size) {
                this.notify('Рёбра', 'Не выбрано ни одного ребра', 'info');
                return;
            }
            for (const id of g.selectedEdgeIds) {
                const e = g.getEdge(id);
                if (e) g.setEdgeWidth(id, e.width - 1);
            }
            this._renderer.markDirty();
            this._saveAndRecord('Толщина рёбер уменьшена');
        }

        edgeWidthThicker() {
            const g = this._graph;
            if (!g.selectedEdgeIds.size) {
                this.notify('Рёбра', 'Не выбрано ни одного ребра', 'info');
                return;
            }
            for (const id of g.selectedEdgeIds) {
                const e = g.getEdge(id);
                if (e) g.setEdgeWidth(id, e.width + 1);
            }
            this._renderer.markDirty();
            this._saveAndRecord('Толщина рёбер увеличена');
        }

        copySelection() {
            const g = this._graph;
            const ids = Array.from(g.selectedPointIds);
            if (ids.length === 0) {
                this.notify('Копирование', 'Ничего не выделено', 'info');
                return;
            }
            const edges = g.edges.filter(e => ids.includes(e.aId) && ids.includes(e.bId));
            this._clipboard = {
                points: ids.map(id => {
                    const p = g.getPoint(id);
                    return { x: p.x, y: p.y, label: p.label, oldId: id };
                }),
                edges: edges.map(e => ({ aId: e.aId, bId: e.bId, width: e.width }))
            };
            this.notify('Копирование', `Скопировано точек: ${ids.length}`, 'info');
        }

        pasteClipboard() {
            if (!this._clipboard || this._clipboard.points.length === 0) {
                this.notify('Вставка', 'Буфер пуст', 'warning');
                return;
            }
            const g = this._graph;
            const idMap = new Map();
            const newIds = [];
            for (const p of this._clipboard.points) {
                const np = g.addPoint(p.x + PASTE_OFFSET, p.y + PASTE_OFFSET, p.label);
                idMap.set(p.oldId, np.id);
                newIds.push(np.id);
            }
            for (const e of this._clipboard.edges) {
                const a = idMap.get(e.aId);
                const b = idMap.get(e.bId);
                if (a == null || b == null) continue;
                const res = g.addEdge(a, b, e.width);
                if (res.edge) res.edge.width = e.width;
            }
            g.selectMany(newIds, []);
            this._renderer.markDirty();
            this._saveAndRecord('Вставка');
        }

        editPointLabel(pt) {
            if (!pt || !this._canvas) return;
            const s = this._camera.worldToScreen(pt.x, pt.y);
            const r = Math.max(3, POINT_RADIUS_BASE * this._camera.zoom);
            this.ui.inlineEditor({
                parent: this._canvas.parentElement,
                rect: {
                    x: s.x - 60,
                    y: s.y - r - 26,
                    w: 120,
                    h: 22
                },
                type: 'text',
                value: pt.label || '',
                onCommit: (v) => {
                    if (this._isDestroyed) return;
                    pt.label = String(v || '');
                    this._graph._bump();
                    this._renderer.markDirty();
                    this._saveAndRecord('Подпись точки');
                }
            });
        }

        _showContextMenu(clientX, clientY) {
            if (this._isDestroyed || !this._canvas) return;
            const r = this._canvas.getBoundingClientRect();
            const world = this._camera.screenToWorld(clientX - r.left, clientY - r.top);
            const g = this._graph;

            const pt = g.getPointAt(world.x, world.y, Math.max(POINT_HIT_RADIUS / this._camera.zoom, POINT_RADIUS_BASE));
            const edgeHit = !pt ? g.getEdgeAt(world.x, world.y, EDGE_HIT_THRESHOLD / this._camera.zoom) : null;

            const items = [];

            if (pt) {
                if (!g.isSelectedPoint(pt.id)) g.selectPoint(pt.id);
                items.push({ header: 'Точка' });
                items.push({
                    icon: 'icon-edit',
                    label: 'Переименовать',
                    onClick: () => this.editPointLabel(pt)
                });
                items.push({
                    icon: 'icon-plus',
                    label: 'Создать ребро…',
                    onClick: () => {
                        this.notify('Ребро', 'Зажмите Ctrl и потяните от точки к точке', 'info');
                    }
                });
                items.push({
                    icon: 'icon-trash',
                    label: 'Удалить точку',
                    danger: true,
                    shortcut: 'Del',
                    onClick: () => {
                        g.removePoint(pt.id);
                        this._renderer.markDirty();
                        this._saveAndRecord('Удаление точки');
                    }
                });
            } else if (edgeHit) {
                const e = edgeHit.edge;
                if (!g.isSelectedEdge(e.id)) g.selectEdge(e.id);
                items.push({ header: 'Ребро' });
                for (let w = 1; w <= 8; w++) {
                    items.push({
                        icon: 'icon-minus',
                        label: `Толщина: ${w}px`,
                        check: e.width === w,
                        onClick: () => {
                            g.setEdgeWidth(e.id, w);
                            this._renderer.markDirty();
                            this._saveAndRecord(`Толщина ребра: ${w}`);
                        }
                    });
                }
                items.push({ divider: true });
                items.push({
                    icon: 'icon-trash',
                    label: 'Удалить ребро',
                    danger: true,
                    onClick: () => {
                        g.removeEdge(e.id);
                        this._renderer.markDirty();
                        this._saveAndRecord('Удаление ребра');
                    }
                });
            } else {
                items.push({
                    icon: 'icon-plus',
                    label: 'Добавить точку',
                    onClick: () => {
                        const np = g.addPoint(world.x, world.y, '');
                        g.selectPoint(np.id);
                        this._renderer.markDirty();
                        this._saveAndRecord('Добавлена точка');
                    }
                });
                items.push({
                    icon: 'icon-copy',
                    label: 'Вставить',
                    shortcut: 'Ctrl+V',
                    disabled: !this._clipboard,
                    onClick: () => this.pasteClipboard()
                });
                items.push({ divider: true });
                items.push({
                    icon: 'icon-zoom-in',
                    label: 'Zoom to fit',
                    shortcut: 'Shift+F',
                    onClick: () => this.zoomToFit()
                });
                items.push({
                    icon: 'icon-refresh',
                    label: 'Сброс камеры',
                    onClick: () => this.resetCamera()
                });
                items.push({ divider: true });
                items.push({
                    icon: 'icon-clear',
                    label: 'Очистить всё',
                    danger: true,
                    onClick: () => this.clearAll()
                });
            }

            this.ui.contextMenu({ items, x: clientX, y: clientY, width: 260 });
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    function register2DWindow(registry) {
        if (!registry) { _err('[2DWindow] registry required'); return false; }
        if (registry.getType('twod')) return false;
        return registry.registerFromClass(TwoDWindow);
    }

    if (typeof window !== 'undefined') {
        window.TwoDWindow = TwoDWindow;
        window.register2DWindow = register2DWindow;
        _log('[2DWindow] Registered class globally v1.1.0');
    }

})();