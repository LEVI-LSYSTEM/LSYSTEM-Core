// data/window/NodeGraphWindow.js
// Версия 8.0.0 — адаптация под новое ядро (WindowChrome + HeaderController + sys-* items).
//
// Изменения относительно 7.1.0:
//   1. static menu: добавлены sys-* системные items в конец.
//   2. Добавлен destroy для env-panel / add-panel / presets-panel дескрипторов.
//   3. InputManager._onKeyDown: убраны Ctrl+A и Q/Й (обрабатываются HotkeyRegistry).
//   4. Всё остальное — без изменений.

(function () {
    'use strict';

    const DEBUG = !!window.DEBUG_NODEGRAPH;
    const _log = DEBUG ? console.log.bind(console) : () => {};
    const _warn = console.warn.bind(console);
    const _err = console.error.bind(console);

    if (!window.BaseWindowInstance) {
        _err('[NodeGraphWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    _log('[NodeGraphWindow] Loading v8.0.0...');

    // ============================================================
    // CSS-ИНЖЕКТ
    // ============================================================
    (function injectNodeGraphCSS() {
        if (document.getElementById('ng-styles')) return;
        const style = document.createElement('style');
        style.id = 'ng-styles';
        style.textContent = `
            :root {
                --ng-bg: #1a1a1a;

                --ng-node-bg: #2a2a2a;
                --ng-node-bg-dark: #1f1f1f;
                --ng-node-border: rgba(200, 184, 154, 0.25);
                --ng-node-selected: rgba(204, 34, 51, 1.0);
                --ng-node-selected-glow: rgba(204, 34, 51, 0.45);
                --ng-node-title: rgba(220, 220, 220, 0.9);

                --ng-selection-bar: rgba(204, 34, 51, 0.55);

                --ng-port: rgba(200, 184, 154, 0.35);
                --ng-port-hover: rgba(204, 34, 51, 0.9);
                --ng-port-connected: rgba(120, 200, 140, 0.85);
                --ng-port-target-ok: rgba(120, 200, 140, 0.9);
                --ng-port-target-bad: rgba(220, 80, 80, 0.9);

                --ng-connection: rgba(180, 170, 150, 0.55);
                --ng-connection-selected: rgba(204, 34, 51, 0.9);
                --ng-connection-temp: rgba(204, 34, 51, 0.6);
                --ng-connection-temp-ok: rgba(120, 200, 140, 0.8);
                --ng-connection-temp-bad: rgba(220, 80, 80, 0.8);

                --ng-waypoint: rgba(200, 184, 154, 0.9);
                --ng-waypoint-hover: rgba(204, 34, 51, 1);

                --ng-comment-bg: rgba(120, 120, 180, 0.10);
                --ng-comment-header-bg: rgba(120, 120, 180, 0.30);
                --ng-comment-border: rgba(140, 140, 200, 0.35);
                --ng-comment-text: #e0d8cc;

                --ng-transition-bg: rgba(120, 200, 140, 0.15);
                --ng-transition-border: rgba(120, 200, 140, 0.45);
                --ng-transition-text: #e0d8cc;

                --ng-status-idle: rgba(120, 160, 220, 0.85);
                --ng-status-running: rgba(220, 180, 80, 0.95);
                --ng-status-ok: rgba(120, 200, 140, 0.95);
                --ng-status-error: rgba(220, 80, 80, 0.95);

                --ng-grid-small: rgba(128, 128, 128, 0.06);
                --ng-grid-medium: rgba(128, 128, 128, 0.13);
                --ng-grid-large: rgba(128, 128, 128, 0.22);

                --ng-search-match: rgba(255, 200, 60, 0.9);
                --ng-search-match-glow: rgba(255, 200, 60, 0.4);
                --ng-node-target-glow: rgba(120, 200, 140, 0.5);
            }

            [data-theme="light"] {
                --ng-bg: #e8ddd0;

                --ng-node-bg: #d5c8b8;
                --ng-node-bg-dark: #c8baa8;
                --ng-node-border: #baaa98;
                --ng-node-selected: #b81f2e;
                --ng-node-selected-glow: rgba(184, 31, 46, 0.35);
                --ng-node-title: #4a3f35;

                --ng-selection-bar: rgba(184, 31, 46, 0.55);

                --ng-port: rgba(74, 63, 53, 0.45);
                --ng-port-hover: rgba(184, 31, 46, 0.9);
                --ng-port-connected: rgba(60, 140, 90, 0.85);
                --ng-port-target-ok: rgba(40, 140, 80, 0.9);
                --ng-port-target-bad: rgba(180, 40, 40, 0.9);

                --ng-connection: rgba(74, 63, 53, 0.55);
                --ng-connection-selected: rgba(184, 31, 46, 0.9);
                --ng-connection-temp: rgba(184, 31, 46, 0.6);
                --ng-connection-temp-ok: rgba(40, 140, 80, 0.8);
                --ng-connection-temp-bad: rgba(180, 40, 40, 0.8);

                --ng-waypoint: rgba(74, 63, 53, 0.8);
                --ng-waypoint-hover: rgba(184, 31, 46, 1);

                --ng-comment-bg: rgba(120, 120, 180, 0.08);
                --ng-comment-header-bg: rgba(120, 120, 180, 0.18);
                --ng-comment-border: rgba(90, 90, 140, 0.35);
                --ng-comment-text: #4a3f35;

                --ng-transition-bg: rgba(60, 140, 90, 0.12);
                --ng-transition-border: rgba(60, 140, 90, 0.4);
                --ng-transition-text: #4a3f35;

                --ng-status-idle: rgba(60, 100, 160, 0.85);
                --ng-status-running: rgba(180, 120, 20, 0.95);
                --ng-status-ok: rgba(40, 140, 80, 0.95);
                --ng-status-error: rgba(180, 40, 40, 0.95);

                --ng-grid-small: rgba(74, 63, 53, 0.05);
                --ng-grid-medium: rgba(74, 63, 53, 0.10);
                --ng-grid-large: rgba(74, 63, 53, 0.18);

                --ng-search-match: rgba(180, 130, 20, 0.9);
                --ng-search-match-glow: rgba(180, 130, 20, 0.35);
                --ng-node-target-glow: rgba(40, 140, 80, 0.5);
            }

            .ui-catpanel__item-actions {
                display: inline-flex;
                gap: 2px;
                flex-shrink: 0;
                margin-left: auto;
            }
            .ui-catpanel__item-action {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 18px;
                padding: 0;
                border: none;
                border-radius: 3px;
                background: transparent;
                color: inherit;
                cursor: pointer;
                opacity: 0.55;
                transition: background 0.12s ease, opacity 0.12s ease, color 0.12s ease;
            }
            .ui-catpanel__item-action:hover {
                opacity: 1;
                background: rgba(200, 184, 154, 0.14);
            }
            .ui-catpanel__item-action.danger { color: var(--accent-red, #cc2233); }
            .ui-catpanel__item-action.danger:hover {
                background: rgba(204, 34, 51, 0.18);
            }
            .ui-catpanel__item-action .icon-svg {
                width: 11px;
                height: 11px;
                fill: currentColor;
                margin: 0;
            }
        `;
        document.head.appendChild(style);
    })();

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================
    const NODE_MIN_WIDTH = 180;
    const NODE_MAX_WIDTH = 280;
    const NODE_HEADER_H = 32;
    const PORT_SLOT_H = 16;
    const NODE_TRANSITION_H = 26;

    const COMMENT_HEADER_H = 24;
    const COMMENT_MIN_W = 160;
    const COMMENT_MIN_H = 80;

    const PORT_RADIUS_BASE = 5;
    const WAYPOINT_RADIUS_BASE = 3.5;
    const WAYPOINT_HIT_RADIUS = 10;
    const CONNECTION_HIT_THRESHOLD = 10;

    const ALIGN_H_GAP = 80;
    const ALIGN_V_GAP = 30;
    const PASTE_OFFSET = 30;

    const DRAG_THRESHOLD = 2;

    const ZOOM_TO_FIT_PADDING = 60;

    const NODE_TITLE_PAD_X = 44;
    const NODE_BODY_PAD_Y = 4;
    const NODE_BODY_PAD_X = 6;
    const PORT_LABEL_PAD = 9;
    const PORT_LABEL_MIN_ZOOM = 0.7;

    const COMPUTE_TIMEOUT_MS = 30000;

    const ZOOM_STEP_WHEEL = 0.0015;

    const SNAP_SMALL = 16;
    const SNAP_LARGE = 1600;

    // ============================================================
    // ЛОКАЛЬНЫЕ УТИЛИТЫ
    // ============================================================
    let _elementId = 1;
    const _nextElementId = () => _elementId++;
    const _setElementIdFloor = (v) => { if (v >= _elementId) _elementId = v + 1; };

    let _connectionId = 1;
    const _nextConnectionId = () => _connectionId++;
    const _setConnectionIdFloor = (v) => { if (v >= _connectionId) _connectionId = v + 1; };

    const _clamp = (v, min, max) => v < min ? min : (v > max ? max : v);
    const _snapTo = (value, step) => step > 0 ? Math.round(value / step) * step : value;

    function _distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + dx * t, cy = y1 + dy * t;
        const ddx = px - cx, ddy = py - cy;
        return { dist: Math.sqrt(ddx * ddx + ddy * ddy), t, point: { x: cx, y: cy } };
    }

    function _normalizeCommentData(cm) {
        if (!cm || typeof cm !== 'object') cm = {};
        const width  = Number.isFinite(cm.width)  ? cm.width  :
                       Number.isFinite(cm.w)      ? cm.w      : 240;
        const height = Number.isFinite(cm.height) ? cm.height :
                       Number.isFinite(cm.h)      ? cm.h      : 140;
        const text   = (typeof cm.text === 'string' && cm.text) ? cm.text : 'Comment';

        let cx = Number.isFinite(cm.x) ? cm.x : 0;
        let cy = Number.isFinite(cm.y) ? cm.y : 0;
        const isTopLeft = cm.topLeft === true || cm.anchor === 'top-left';
        if (isTopLeft) {
            cx += width / 2;
            cy += height / 2;
        }
        return {
            x: cx,
            y: cy,
            width: Math.max(COMMENT_MIN_W, width),
            height: Math.max(COMMENT_MIN_H, height),
            text,
            headerHeight: Number.isFinite(cm.headerHeight) ? cm.headerHeight : undefined
        };
    }

    // ============================================================
    // THEME ADAPTER
    // ============================================================
    class ThemeAdapter {
        constructor() { this.palette = this._defaults(); }

        _defaults() {
            return {
                bg: '#1a1a1a',
                gridSmall: 'rgba(128,128,128,0.06)',
                gridMedium: 'rgba(128,128,128,0.13)',
                gridLarge: 'rgba(128,128,128,0.22)',

                nodeBg: '#2a2a2a',
                nodeBgDark: '#1f1f1f',
                nodeBorder: 'rgba(200,184,154,0.25)',
                nodeSelected: 'rgba(204,34,51,1.0)',
                nodeSelectedGlow: 'rgba(204,34,51,0.45)',
                nodeTitle: 'rgba(220,220,220,0.9)',

                selectionBar: 'rgba(204,34,51,0.55)',
                text: '#e0d8cc',
                textMuted: 'rgba(200,184,154,0.55)',
                accent: '#cc2233',
                beige: '#c8b89a',

                port: 'rgba(200,184,154,0.35)',
                portHover: 'rgba(204,34,51,0.9)',
                portConnected: 'rgba(120,200,140,0.85)',
                portTargetOk: 'rgba(120,200,140,0.9)',
                portTargetBad: 'rgba(220,80,80,0.9)',

                connection: 'rgba(180,170,150,0.55)',
                connectionSelected: 'rgba(204,34,51,0.9)',
                connectionTemp: 'rgba(204,34,51,0.6)',
                connectionTempOk: 'rgba(120,200,140,0.8)',
                connectionTempBad: 'rgba(220,80,80,0.8)',

                waypoint: 'rgba(200,184,154,0.9)',
                waypointHover: 'rgba(204,34,51,1)',

                commentBg: 'rgba(120,120,180,0.10)',
                commentHeaderBg: 'rgba(120,120,180,0.30)',
                commentBorder: 'rgba(140,140,200,0.35)',
                commentText: '#e0d8cc',

                transitionBg: 'rgba(120,200,140,0.15)',
                transitionBorder: 'rgba(120,200,140,0.45)',
                transitionText: '#e0d8cc',

                statusIdle: 'rgba(120,160,220,0.85)',
                statusRunning: 'rgba(220,180,80,0.95)',
                statusOk: 'rgba(120,200,140,0.95)',
                statusError: 'rgba(220,80,80,0.95)',

                searchMatch: 'rgba(255,200,60,0.9)',
                searchMatchGlow: 'rgba(255,200,60,0.4)',
                nodeTargetGlow: 'rgba(120,200,140,0.5)'
            };
        }

        refresh() {
            if (typeof document === 'undefined') return;
            try {
                const cs = getComputedStyle(document.documentElement);
                const read = (name, fallback) => {
                    const v = cs.getPropertyValue(name);
                    return (v && v.trim()) ? v.trim() : fallback;
                };
                const d = this._defaults();
                this.palette = {
                    bg: read('--ng-bg', read('--bg-panel', d.bg)),
                    gridSmall: read('--ng-grid-small', d.gridSmall),
                    gridMedium: read('--ng-grid-medium', d.gridMedium),
                    gridLarge: read('--ng-grid-large', d.gridLarge),
                    nodeBg: read('--ng-node-bg', d.nodeBg),
                    nodeBgDark: read('--ng-node-bg-dark', d.nodeBgDark),
                    nodeBorder: read('--ng-node-border', d.nodeBorder),
                    nodeSelected: read('--ng-node-selected', d.nodeSelected),
                    nodeSelectedGlow: read('--ng-node-selected-glow', d.nodeSelectedGlow),
                    nodeTitle: read('--ng-node-title', d.nodeTitle),
                    selectionBar: read('--ng-selection-bar', d.selectionBar),
                    text: read('--text-primary', d.text),
                    textMuted: read('--text-muted', d.textMuted),
                    accent: read('--accent-red', d.accent),
                    beige: read('--beige', d.beige),
                    port: read('--ng-port', d.port),
                    portHover: read('--ng-port-hover', d.portHover),
                    portConnected: read('--ng-port-connected', d.portConnected),
                    portTargetOk: read('--ng-port-target-ok', d.portTargetOk),
                    portTargetBad: read('--ng-port-target-bad', d.portTargetBad),
                    connection: read('--ng-connection', d.connection),
                    connectionSelected: read('--ng-connection-selected', d.connectionSelected),
                    connectionTemp: read('--ng-connection-temp', d.connectionTemp),
                    connectionTempOk: read('--ng-connection-temp-ok', d.connectionTempOk),
                    connectionTempBad: read('--ng-connection-temp-bad', d.connectionTempBad),
                    waypoint: read('--ng-waypoint', d.waypoint),
                    waypointHover: read('--ng-waypoint-hover', d.waypointHover),
                    commentBg: read('--ng-comment-bg', d.commentBg),
                    commentHeaderBg: read('--ng-comment-header-bg', d.commentHeaderBg),
                    commentBorder: read('--ng-comment-border', d.commentBorder),
                    commentText: read('--ng-comment-text', d.commentText),
                    transitionBg: read('--ng-transition-bg', d.transitionBg),
                    transitionBorder: read('--ng-transition-border', d.transitionBorder),
                    transitionText: read('--ng-transition-text', d.transitionText),
                    statusIdle: read('--ng-status-idle', d.statusIdle),
                    statusRunning: read('--ng-status-running', d.statusRunning),
                    statusOk: read('--ng-status-ok', d.statusOk),
                    statusError: read('--ng-status-error', d.statusError),
                    searchMatch: read('--ng-search-match', d.searchMatch),
                    searchMatchGlow: read('--ng-search-match-glow', d.searchMatchGlow),
                    nodeTargetGlow: read('--ng-node-target-glow', d.nodeTargetGlow)
                };
            } catch (e) {
                _warn('[ThemeAdapter] refresh failed:', e);
            }
        }
    }

    // ============================================================
    // ENV REGISTRY
    // ============================================================
    class EnvRegistry {
        constructor() {
            this.categories = [];
            this.envs = new Map();
        }

        static async load(url) {
            const reg = new EnvRegistry();
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                reg.parse(json);
            } catch (e) {
                _warn('[EnvRegistry] load failed:', e);
            }
            return reg;
        }

        parse(json) {
            this.categories = [];
            this.envs.clear();

            const root = json && json.envirment;
            if (!root || typeof root !== 'object') return;

            for (const [categoryName, envList] of Object.entries(root)) {
                if (!Array.isArray(envList)) continue;
                const catEnvs = [];
                for (const entry of envList) {
                    if (!entry || typeof entry !== 'object') continue;
                    const folder = entry.folder;
                    if (!folder) continue;
                    const abstract = Array.isArray(entry.abstract) ? entry.abstract.slice() : [];
                    const concrete = Array.isArray(entry.concrete) ? entry.concrete.slice() : [];
                    const icon = (typeof entry.icon === 'string' && entry.icon) ? entry.icon : 'icon-layout';
                    this.envs.set(folder, { name: folder, category: categoryName, abstract, concrete, icon });
                    catEnvs.push(folder);
                }
                this.categories.push({ name: categoryName, envs: catEnvs });
            }
        }

        has(env) { return this.envs.has(env); }
        get(env) { return this.envs.get(env) || null; }
        allEnvs() { return Array.from(this.envs.keys()); }
        getCategoryOf(env) { const e = this.envs.get(env); return e ? e.category : null; }
        getAbstract(env) { const e = this.envs.get(env); return e ? e.abstract : []; }
        getConcrete(env) { const e = this.envs.get(env); return e ? e.concrete : []; }
        getIcon(env) { const e = this.envs.get(env); return e && e.icon ? e.icon : 'icon-layout'; }
    }

    // ============================================================
    // NODE DEF
    // ============================================================
    class NodeDef {
        constructor(raw, envName, fileName) {
            this.env = envName;
            this.file = fileName;
            this.meta = raw.meta || {};
            this.id = this.meta.id || `${envName}.${fileName.replace(/\.js$/i, '')}`;
            this.label = this.meta.label || this.id;
            this.icon = this.meta.icon || null;
            this.category = this.meta.category ? String(this.meta.category) : 'Прочее';

            this.portDefs = this._normPorts(raw.ports);
            this.inputPorts = this.portDefs.inputs;
            this.outputPorts = this.portDefs.outputs;

            this.inputRules = this._normRules(raw.inputRules);
            this.outputRules = this._normRules(raw.outputRules);

            this.maxInputs = this._normLimit(raw.maxInputs);
            this.maxOutputs = this._normLimit(raw.maxOutputs);

            this.params = Array.isArray(raw.params) ? raw.params.map(p => this._normParam(p)) : [];
            this.buttons = Array.isArray(raw.buttons) ? raw.buttons.map(b => this._normButton(b)) : [];

            this._rawModule = raw;
            this._rawOnButton = (typeof raw.onButton === 'function') ? raw.onButton : null;
            this._rawOnParamChange = (typeof raw.onParamChange === 'function') ? raw.onParamChange : null;
            this._rawRenderCustomProperties = (typeof raw.renderCustomProperties === 'function') ? raw.renderCustomProperties : null;
            this._rawCompute = (typeof raw.compute === 'function') ? raw.compute : null;
            this._rawCheckCompute = (typeof raw.checkCompute === 'function') ? raw.checkCompute : null;
            this.drillDown = (typeof raw.drillDown === 'string' && raw.drillDown) ? raw.drillDown : null;

            this._paramCategoriesCache = null;
        }

        _normPorts(ports) {
            if (!ports || typeof ports !== 'object') {
                throw new Error(`[NodeDef ${this.env}.${this.file}] missing "ports" section`);
            }

            const normSide = (arr, sideName) => {
                if (!Array.isArray(arr)) {
                    throw new Error(`[NodeDef ${this.env}.${this.file}] ports.${sideName} must be an array`);
                }
                const out = [];
                const seen = new Set();
                for (const p of arr) {
                    if (!p || typeof p !== 'object') {
                        throw new Error(`[NodeDef ${this.env}.${this.file}] invalid port entry in ports.${sideName}`);
                    }
                    const id = String(p.id || '').trim();
                    if (!id) {
                        throw new Error(`[NodeDef ${this.env}.${this.file}] port without id in ports.${sideName}`);
                    }
                    if (seen.has(id)) {
                        throw new Error(`[NodeDef ${this.env}.${this.file}] duplicate port id "${id}" in ports.${sideName}`);
                    }
                    seen.add(id);
                    out.push({
                        id,
                        label: (typeof p.label === 'string' && p.label) ? p.label : id
                    });
                }
                return out;
            };

            return {
                inputs: normSide(ports.inputs, 'inputs'),
                outputs: normSide(ports.outputs, 'outputs')
            };
        }

        _normRules(rules) {
            if (rules === undefined || rules === null) return {};
            if (typeof rules !== 'object' || Array.isArray(rules)) {
                throw new Error(`[NodeDef ${this.env}.${this.file}] rules must be an object {portId: [...]}`);
            }
            const out = {};
            for (const [portId, list] of Object.entries(rules)) {
                if (!Array.isArray(list)) {
                    throw new Error(`[NodeDef ${this.env}.${this.file}] rule for port "${portId}" must be an array`);
                }
                const clean = [];
                for (const v of list) {
                    if (typeof v !== 'string') continue;
                    const t = v.trim();
                    if (t) clean.push(t);
                }
                out[String(portId)] = clean;
            }
            return out;
        }

        _normLimit(v) {
            const parseOne = (x) => {
                if (x === undefined || x === null) return '*';
                if (x === '*') return '*';
                const n = Number(x);
                if (!Number.isFinite(n) || n < 0) return '*';
                return Math.floor(n);
            };

            if (v === undefined || v === null) return { default: '*', perPort: {} };
            if (v === '*') return { default: '*', perPort: {} };
            const num = Number(v);
            if (Number.isFinite(num) && num >= 0) {
                return { default: Math.floor(num), perPort: {} };
            }
            if (typeof v === 'object' && !Array.isArray(v)) {
                const perPort = {};
                let def = '*';
                for (const [portId, val] of Object.entries(v)) {
                    if (portId === '*') def = parseOne(val);
                    else perPort[String(portId)] = parseOne(val);
                }
                return { default: def, perPort };
            }
            throw new Error(`[NodeDef ${this.env}.${this.file}] invalid maxInputs/maxOutputs`);
        }

        _limitForPort(limitObj, portId) {
            if (!limitObj) return '*';
            if (Object.prototype.hasOwnProperty.call(limitObj.perPort, portId)) {
                return limitObj.perPort[portId];
            }
            return limitObj.default;
        }

        _allowsOnPort(otherDef, portId, side) {
            const rules = side === 'input' ? this.inputRules : this.outputRules;
            const list = (rules[portId] && rules[portId].length)
                ? rules[portId]
                : (rules['*'] || []);
            if (list.length === 0) return false;
            if (list.includes('*')) return true;
            if (!otherDef) return false;
            return list.includes(otherDef.file);
        }

        canConnectPorts(toDef, fromPortId, toPortId) {
            if (!this || !toDef) return { ok: false, reason: 'Неизвестный тип ноды' };
            if (!this.outputPorts.some(p => p.id === fromPortId)) {
                return { ok: false, reason: `"${this.label}" не имеет выхода "${fromPortId}"` };
            }
            if (!toDef.inputPorts.some(p => p.id === toPortId)) {
                return { ok: false, reason: `"${toDef.label}" не имеет входа "${toPortId}"` };
            }

            const fromAllows = this._allowsOnPort(toDef, fromPortId, 'output');
            const toAllows = toDef._allowsOnPort(this, toPortId, 'input');

            if (!fromAllows && !toAllows) {
                return { ok: false, reason: `"${this.label}.${fromPortId}" и "${toDef.label}.${toPortId}" не разрешают соединение` };
            }
            if (!fromAllows) {
                return { ok: false, reason: `"${this.label}.${fromPortId}" не разрешает выход к "${toDef.label}.${toPortId}"` };
            }
            if (!toAllows) {
                return { ok: false, reason: `"${toDef.label}.${toPortId}" не разрешает вход от "${this.label}.${fromPortId}"` };
            }
            return { ok: true };
        }

        hasInput() { return this.inputPorts.length > 0; }
        hasOutput() { return this.outputPorts.length > 0; }

        canAcceptInput(currentCount, portId) {
            if (!this.hasInput()) return { ok: false, reason: `"${this.label}" не имеет входов` };
            if (portId && !this.inputPorts.some(p => p.id === portId)) {
                return { ok: false, reason: `"${this.label}" не имеет входа "${portId}"` };
            }
            const lim = portId ? this._limitForPort(this.maxInputs, portId) : this.maxInputs.default;
            if (lim === '*') return { ok: true };
            if (lim === 0) return { ok: false, reason: `Порт "${portId || '?'}" ноды "${this.label}" не принимает связи` };
            if (currentCount < lim) return { ok: true };
            if (lim === 1) return { ok: true, displaceExisting: true };
            return { ok: false, reason: `Порт "${portId || '?'}" ноды "${this.label}" уже имеет ${currentCount} входящих связей (лимит: ${lim})` };
        }

        canAcceptOutput(currentCount, portId) {
            if (!this.hasOutput()) return { ok: false, reason: `"${this.label}" не имеет выходов` };
            if (portId && !this.outputPorts.some(p => p.id === portId)) {
                return { ok: false, reason: `"${this.label}" не имеет выхода "${portId}"` };
            }
            const lim = portId ? this._limitForPort(this.maxOutputs, portId) : this.maxOutputs.default;
            if (lim === '*') return { ok: true };
            if (lim === 0) return { ok: false, reason: `Порт "${portId || '?'}" ноды "${this.label}" не отдаёт связи` };
            if (currentCount < lim) return { ok: true };
            if (lim === 1) return { ok: false, reason: `Порт "${portId || '?'}" ноды "${this.label}" уже имеет исходящую связь (лимит: 1)` };
            return { ok: false, reason: `Порт "${portId || '?'}" ноды "${this.label}" уже имеет ${currentCount} исходящих связей (лимит: ${lim})` };
        }

        _normParam(p) {
            return {
                id: String(p.id || 'p'),
                type: String(p.type || 'string'),
                label: p.label || String(p.id || ''),
                default: p.default !== undefined ? p.default : null,
                options: Array.isArray(p.options) ? p.options.slice() : null,
                category: (typeof p.category === 'string') ? p.category : '',
                min: (typeof p.min === 'number') ? p.min : undefined,
                max: (typeof p.max === 'number') ? p.max : undefined,
                step: (typeof p.step === 'number') ? p.step : undefined,
                description: (typeof p.description === 'string') ? p.description : ''
            };
        }

        _normButton(b) {
            return {
                id: String(b.id || 'b'),
                label: b.label || 'Run',
                icon: b.icon || null
            };
        }

        invokeButton(id, ctx) {
            if (!this._rawOnButton) return;
            try { this._rawOnButton.call(this._rawModule, id, ctx || {}); }
            catch (e) { _warn(`[NodeDef ${this.id}] onButton error:`, e); }
        }

        invokeParamChange(id, value, node) {
            if (!this._rawOnParamChange) return;
            try { this._rawOnParamChange.call(this._rawModule, id, value, node); }
            catch (e) { _warn(`[NodeDef ${this.id}] onParamChange error:`, e); }
        }

        hasCompute() { return typeof this._rawCompute === 'function'; }
        hasCheckCompute() { return typeof this._rawCheckCompute === 'function'; }

        async invokeCompute(ctx, signal) {
            if (!this.hasCompute()) return undefined;
            return await this._rawCompute.call(this._rawModule, ctx, signal);
        }

        invokeCheckCompute(ctx) {
            if (!this.hasCheckCompute()) return { ready: true };
            try { return this._rawCheckCompute.call(this._rawModule, ctx) || { ready: true }; }
            catch (e) { return { ready: false, reason: String(e.message || e) }; }
        }

        getParamCategories() {
            if (this._paramCategoriesCache) return this._paramCategoriesCache;
            const map = new Map();
            for (const p of this.params) {
                const c = p.category || '';
                if (!map.has(c)) map.set(c, []);
                map.get(c).push(p);
            }
            const keys = Array.from(map.keys());
            const named = keys.filter(k => k !== '').sort((a, b) => a.localeCompare(b));
            const ordered = (keys.includes('') ? [''] : []).concat(named);
            this._paramCategoriesCache = ordered.map(k => ({ name: k, params: map.get(k) }));
            return this._paramCategoriesCache;
        }
    }

    // ============================================================
    // NODE INSTANCE
    // ============================================================
    class NodeInstance {
        constructor(def, x, y) {
            this.id = _nextElementId();
            this.def = def;
            this.x = x;
            this.y = y;
            this.width = NODE_MIN_WIDTH;
            this.selected = false;
            this.paramValues = {};
            if (def && def.params) {
                for (const p of def.params) this.paramValues[p.id] = p.default;
            }
            this._expandedCategories = new Set();
            this.createdAt = Date.now();
            this.updatedAt = Date.now();

            this._result = null;
            this._resultTs = 0;
            this._error = null;
            this._dirty = true;
            this._running = false;
            this._computePromise = null;
            this._computeAbort = null;

            this._layout = { transition: null };
            this._searchMatch = false;

            this._recalcWidth();
        }

        get title() { return this.def ? this.def.label : 'Node'; }
        get env() { return this.def ? this.def.env : null; }

        getHeaderHeight() {
            const nIn = this.def?.inputPorts?.length || 0;
            const nOut = this.def?.outputPorts?.length || 0;
            const maxPorts = Math.max(nIn, nOut, 1);
            return NODE_HEADER_H + (maxPorts - 1) * PORT_SLOT_H;
        }

        hasInput() { return !!(this.def && this.def.hasInput()); }
        hasOutput() { return !!(this.def && this.def.hasOutput()); }
        hasDrillDown() { return !!(this.def && this.def.drillDown); }
        hasCompute() { return !!(this.def && this.def.hasCompute()); }

        isCategoryExpanded(key) { return this._expandedCategories.has(key); }
        toggleCategory(key) {
            if (this._expandedCategories.has(key)) this._expandedCategories.delete(key);
            else this._expandedCategories.add(key);
            this.updatedAt = Date.now();
        }

        invalidateResult() {
            this._dirty = true;
            this._result = null;
            this._error = null;
        }
        hasFreshResult() {
            return !this._dirty && this._result !== null && this._result !== undefined;
        }
        setResult(value) {
            this._result = value;
            this._resultTs = Date.now();
            this._error = null;
            this._dirty = false;
        }
        setError(message) {
            this._error = String(message || 'Неизвестная ошибка');
            this._result = null;
            this._resultTs = 0;
            this._dirty = false;
        }
        clearError() { this._error = null; }

        getStatus() {
            if (this._running) return 'running';
            if (this._error) return 'error';
            if (this.hasFreshResult()) return 'ok';
            return 'idle';
        }

        getBodyHeight() { return this.hasDrillDown() ? (NODE_TRANSITION_H + 8) : 0; }
        getFullHeight() { return this.getHeaderHeight() + this.getBodyHeight(); }

        _recalcWidth() {
            let w = NODE_MIN_WIDTH;
            if (this.def) {
                const titleLen = String(this.title || '').length;
                w = Math.max(w, Math.min(NODE_MAX_WIDTH, titleLen * 8 + 60));
            }
            this.width = w;
        }

        contains(worldX, worldY) {
            const hw = this.width / 2;
            const hh = this.getFullHeight() / 2;
            return worldX >= this.x - hw && worldX <= this.x + hw &&
                   worldY >= this.y - hh && worldY <= this.y + hh;
        }

        getBounds() {
            const hw = this.width / 2;
            const hh = this.getFullHeight() / 2;
            return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
        }

        getTopLeft() {
            const b = this.getBounds();
            return { x: b.minX, y: b.minY };
        }
        setTopLeft(tlx, tly) {
            const hw = this.width / 2;
            const hh = this.getFullHeight() / 2;
            this.x = tlx + hw;
            this.y = tly + hh;
        }

        getPortWorld(portId, side) {
            const def = this.def;
            if (!def) return null;
            const list = (side === 'input') ? def.inputPorts : def.outputPorts;
            if (!list || list.length === 0) return null;

            const idx = list.findIndex(p => p.id === portId);
            if (idx < 0) return null;

            const b = this.getBounds();
            const h = this.getHeaderHeight();
            const n = list.length;
            const y = b.minY + h * (idx + 1) / (n + 1);
            const x = (side === 'input') ? b.minX : b.maxX;
            return { x, y, portId, side };
        }

        getAllPorts() {
            const out = [];
            const def = this.def;
            if (!def) return out;
            for (const p of def.inputPorts) {
                const w = this.getPortWorld(p.id, 'input');
                if (w) out.push({ ...w, side: 'input', label: p.label });
            }
            for (const p of def.outputPorts) {
                const w = this.getPortWorld(p.id, 'output');
                if (w) out.push({ ...w, side: 'output', label: p.label });
            }
            return out;
        }

        hitTestBody(worldX, worldY) {
            if (!this._layout) return null;
            const t = this._layout.transition;
            if (t && worldX >= t.x && worldX <= t.x + t.w &&
                worldY >= t.y && worldY <= t.y + t.h) {
                return { kind: 'transition' };
            }
            return null;
        }

        toJSON() {
            return {
                id: this.id, x: this.x, y: this.y,
                width: this.width,
                defEnv: this.def ? this.def.env : null,
                defId: this.def ? this.def.id : null,
                defFile: this.def ? this.def.file : null,
                paramValues: { ...this.paramValues },
                expandedCategories: Array.from(this._expandedCategories),
                createdAt: this.createdAt, updatedAt: this.updatedAt
            };
        }
    }

    // ============================================================
    // CONNECTION
    // ============================================================
    class Connection {
        constructor(fromNodeId, fromPortId, toNodeId, toPortId) {
            this.id = _nextConnectionId();
            this.fromNodeId = fromNodeId;
            this.fromPortId = fromPortId;
            this.toNodeId = toNodeId;
            this.toPortId = toPortId;
            this.waypoints = [];
            this.createdAt = Date.now();
        }
        involvesNode(nodeId) {
            return this.fromNodeId === nodeId || this.toNodeId === nodeId;
        }
        toJSON() {
            return {
                id: this.id,
                fromNodeId: this.fromNodeId, fromPortId: this.fromPortId,
                toNodeId: this.toNodeId, toPortId: this.toPortId,
                waypoints: this.waypoints.map(w => ({ x: w.x, y: w.y })),
                createdAt: this.createdAt
            };
        }
        static fromJSON(c) {
            const conn = Object.create(Connection.prototype);
            conn.id = c.id;
            conn.fromNodeId = c.fromNodeId;
            conn.fromPortId = c.fromPortId;
            conn.toNodeId = c.toNodeId;
            conn.toPortId = c.toPortId;
            conn.waypoints = Array.isArray(c.waypoints)
                ? c.waypoints.map(w => ({ x: w.x, y: w.y }))
                : [];
            conn.createdAt = c.createdAt || Date.now();
            return conn;
        }
    }

    // ============================================================
    // COMMENT
    // ============================================================
    class Comment {
        constructor(x, y, width = 240, height = 140, text = 'Comment') {
            this.id = _nextElementId();
            this.x = x;
            this.y = y;
            this.width = Math.max(COMMENT_MIN_W, width);
            this.height = Math.max(COMMENT_MIN_H, height);
            this.text = text;
            this.selected = false;
            this.headerHeight = COMMENT_HEADER_H;
            this.createdAt = Date.now();
            this.updatedAt = Date.now();
        }

        getRect() {
            const hw = this.width / 2, hh = this.height / 2;
            return { left: this.x - hw, right: this.x + hw, top: this.y - hh, bottom: this.y + hh };
        }
        getHeaderRect() {
            const r = this.getRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.top + this.headerHeight };
        }
        getBodyRect() {
            const r = this.getRect();
            return { left: r.left, right: r.right, top: r.top + this.headerHeight, bottom: r.bottom };
        }
        setRect(r) {
            const left = Math.min(r.left, r.right);
            const right = Math.max(r.left, r.right);
            const top = Math.min(r.top, r.bottom);
            const bottom = Math.max(r.top, r.bottom);
            this.width = Math.max(COMMENT_MIN_W, right - left);
            this.height = Math.max(COMMENT_MIN_H, bottom - top);
            this.x = left + this.width / 2;
            this.y = top + this.height / 2;
            this.updatedAt = Date.now();
        }
        containsHeader(wx, wy) {
            const h = this.getHeaderRect();
            return wx >= h.left && wx <= h.right && wy >= h.top && wy <= h.bottom;
        }
        containsBody(wx, wy) {
            const b = this.getBodyRect();
            return wx >= b.left && wx <= b.right && wy >= b.top && wy <= b.bottom;
        }
        contains(wx, wy) {
            const hw = this.width / 2, hh = this.height / 2;
            return wx >= this.x - hw && wx <= this.x + hw && wy >= this.y - hh && wy <= this.y + hh;
        }
        containsNode(node) {
            const b = node.getBounds();
            return b.minX >= this.x - this.width / 2 && b.maxX <= this.x + this.width / 2 &&
                   b.minY >= this.y - this.height / 2 && b.maxY <= this.y + this.height / 2;
        }
        getBounds() {
            const hw = this.width / 2, hh = this.height / 2;
            return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
        }
        getTopLeft() {
            const b = this.getBounds();
            return { x: b.minX, y: b.minY };
        }
        setTopLeft(tlx, tly) {
            const hw = this.width / 2;
            const hh = this.height / 2;
            this.x = tlx + hw;
            this.y = tly + hh;
        }
        toJSON() {
            return {
                id: this.id, x: this.x, y: this.y,
                width: this.width, height: this.height,
                text: this.text,
                headerHeight: this.headerHeight,
                anchor: 'center',
                createdAt: this.createdAt, updatedAt: this.updatedAt
            };
        }
    }

    // ============================================================
    // ENV GRAPH
    // ============================================================
    class EnvGraph {
        constructor(envName) {
            this.env = envName;
            this.nodes = [];
            this.connections = [];
            this.comments = [];
            this._selectedNodeIds = new Set();
            this._selectedCommentIds = new Set();
            this._selectedConnectionId = null;
            this._version = 0;
            this._snapshot = null;
            this._snapshotVersion = -1;
        }

        addNode(def, x, y) {
            const n = new NodeInstance(def, x, y);
            this.nodes.push(n);
            this._bump();
            return n;
        }
        removeNode(nodeId) {
            const idx = this.nodes.findIndex(n => n.id === nodeId);
            if (idx < 0) return false;
            this.nodes.splice(idx, 1);
            this.connections = this.connections.filter(c => !c.involvesNode(nodeId));
            this._selectedNodeIds.delete(nodeId);
            this._bump();
            return true;
        }
        getNode(id) { return this.nodes.find(n => n.id === id) || null; }
        getNodeAt(wx, wy) {
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                if (this.nodes[i].contains(wx, wy)) return this.nodes[i];
            }
            return null;
        }
        getNodesInRect(x1, y1, x2, y2) {
            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            const out = [];
            for (const n of this.nodes) {
                const b = n.getBounds();
                if (b.minX < maxX && b.maxX > minX && b.minY < maxY && b.maxY > minY) out.push(n);
            }
            return out;
        }
        updateNode(id, updates) {
            const n = this.getNode(id);
            if (!n) return null;
            let paramsChanged = false;
            if (updates.x !== undefined) n.x = updates.x;
            if (updates.y !== undefined) n.y = updates.y;
            if (updates.paramValues !== undefined) {
                Object.assign(n.paramValues, updates.paramValues);
                paramsChanged = true;
            }
            n.updatedAt = Date.now();
            this._bump();
            if (paramsChanged) {
                n.invalidateResult();
                this.invalidateDescendants(id);
            }
            return n;
        }

        wouldCreateCycle(fromNodeId, toNodeId) {
            if (fromNodeId === toNodeId) return true;
            const visited = new Set();
            const stack = [toNodeId];
            while (stack.length) {
                const id = stack.pop();
                if (id === fromNodeId) return true;
                if (visited.has(id)) continue;
                visited.add(id);
                for (const c of this.connections) {
                    if (c.fromNodeId === id) stack.push(c.toNodeId);
                }
            }
            return false;
        }

        addConnection(fromNodeId, fromPortId, toNodeId, toPortId) {
            if (fromNodeId === toNodeId) return { conn: null, reason: 'Нельзя соединить ноду саму с собой' };
            const fromNode = this.getNode(fromNodeId);
            const toNode = this.getNode(toNodeId);
            if (!fromNode || !toNode) return { conn: null, reason: 'Одна из нод не найдена' };
            if (!fromNode.def || !toNode.def) return { conn: null, reason: 'Одна из нод не имеет определения' };

            const check = fromNode.def.canConnectPorts(toNode.def, fromPortId, toPortId);
            if (!check.ok) return { conn: null, reason: check.reason };

            if (this.wouldCreateCycle(fromNodeId, toNodeId)) {
                return { conn: null, reason: 'Связь создаст цикл в графе' };
            }

            const dup = this.connections.some(c =>
                c.fromNodeId === fromNodeId && c.fromPortId === fromPortId &&
                c.toNodeId === toNodeId && c.toPortId === toPortId
            );
            if (dup) return { conn: null, reason: 'Такое соединение уже существует' };

            const inputCount = this.connections.filter(c => c.toNodeId === toNodeId && c.toPortId === toPortId).length;
            const outputCount = this.connections.filter(c => c.fromNodeId === fromNodeId && c.fromPortId === fromPortId).length;

            const inCheck = toNode.def.canAcceptInput(inputCount, toPortId);
            if (!inCheck.ok) return { conn: null, reason: inCheck.reason };
            const outCheck = fromNode.def.canAcceptOutput(outputCount, fromPortId);
            if (!outCheck.ok) return { conn: null, reason: outCheck.reason };

            if (inCheck.displaceExisting) {
                const existing = this.connections.find(c => c.toNodeId === toNodeId && c.toPortId === toPortId);
                if (existing) this.removeConnection(existing.id);
            }

            const conn = new Connection(fromNodeId, fromPortId, toNodeId, toPortId);
            this.connections.push(conn);
            this._bump();
            this.invalidateDescendants(toNodeId);
            return { conn, reason: null };
        }

        canConnect(fromNodeId, fromPortId, toNodeId, toPortId) {
            if (fromNodeId === toNodeId) return { ok: false, reason: 'self' };
            const fromNode = this.getNode(fromNodeId);
            const toNode = this.getNode(toNodeId);
            if (!fromNode || !toNode) return { ok: false, reason: 'not-found' };
            if (!fromNode.def || !toNode.def) return { ok: false, reason: 'no-def' };

            const defCheck = fromNode.def.canConnectPorts(toNode.def, fromPortId, toPortId);
            if (!defCheck.ok) return { ok: false, reason: defCheck.reason };

            if (this.wouldCreateCycle(fromNodeId, toNodeId)) return { ok: false, reason: 'cycle' };

            const dup = this.connections.some(c =>
                c.fromNodeId === fromNodeId && c.fromPortId === fromPortId &&
                c.toNodeId === toNodeId && c.toPortId === toPortId
            );
            if (dup) return { ok: false, reason: 'dup' };

            const inputCount = this.connections.filter(c => c.toNodeId === toNodeId && c.toPortId === toPortId).length;
            const outputCount = this.connections.filter(c => c.fromNodeId === fromNodeId && c.fromPortId === fromPortId).length;

            const inCheck = toNode.def.canAcceptInput(inputCount, toPortId);
            if (!inCheck.ok) return { ok: false, reason: inCheck.reason };
            const outCheck = fromNode.def.canAcceptOutput(outputCount, fromPortId);
            if (!outCheck.ok) return { ok: false, reason: outCheck.reason };

            return { ok: true };
        }

        removeConnection(id) {
            const idx = this.connections.findIndex(c => c.id === id);
            if (idx < 0) return false;
            const conn = this.connections[idx];
            this.connections.splice(idx, 1);
            if (this._selectedConnectionId === id) this._selectedConnectionId = null;
            this._bump();
            if (conn) this.invalidateDescendants(conn.toNodeId);
            return true;
        }

        getConnection(id) { return this.connections.find(c => c.id === id) || null; }

        addWaypoint(connectionId, worldX, worldY, insertIndex = -1) {
            const conn = this.getConnection(connectionId);
            if (!conn) return false;
            if (insertIndex < 0 || insertIndex > conn.waypoints.length) {
                conn.waypoints.push({ x: worldX, y: worldY });
            } else {
                conn.waypoints.splice(insertIndex, 0, { x: worldX, y: worldY });
            }
            this._bump();
            return true;
        }
        removeWaypoint(connectionId, waypointIndex) {
            const conn = this.getConnection(connectionId);
            if (!conn) return false;
            if (waypointIndex < 0 || waypointIndex >= conn.waypoints.length) return false;
            conn.waypoints.splice(waypointIndex, 1);
            this._bump();
            return true;
        }
        updateWaypoint(connectionId, waypointIndex, worldX, worldY) {
            const conn = this.getConnection(connectionId);
            if (!conn) return false;
            if (waypointIndex < 0 || waypointIndex >= conn.waypoints.length) return false;
            conn.waypoints[waypointIndex].x = worldX;
            conn.waypoints[waypointIndex].y = worldY;
            this._bump();
            return true;
        }

        getConnectionAt(worldX, worldY, threshold = CONNECTION_HIT_THRESHOLD) {
            let best = null;
            for (const conn of this.connections) {
                const poly = this._connectionPolyline(conn);
                if (!poly) continue;
                for (let i = 0; i < poly.length - 1; i++) {
                    const a = poly[i], b = poly[i + 1];
                    const d = _distToSegment(worldX, worldY, a.x, a.y, b.x, b.y);
                    if (d.dist <= threshold && (!best || d.dist < best.dist)) {
                        best = { conn, dist: d.dist, segmentIndex: i, t: d.t, point: d.point };
                    }
                }
            }
            return best;
        }

        getWaypointAt(worldX, worldY, threshold = WAYPOINT_HIT_RADIUS) {
            let best = null;
            for (const conn of this.connections) {
                for (let i = 0; i < conn.waypoints.length; i++) {
                    const w = conn.waypoints[i];
                    const dx = w.x - worldX, dy = w.y - worldY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= threshold && (!best || dist < best.dist)) {
                        best = { conn, waypointIndex: i, dist };
                    }
                }
            }
            return best;
        }

        _connectionPolyline(conn) {
            const fromNode = this.getNode(conn.fromNodeId);
            const toNode = this.getNode(conn.toNodeId);
            if (!fromNode || !toNode) return null;
            const a = fromNode.getPortWorld(conn.fromPortId, 'output');
            const b = toNode.getPortWorld(conn.toPortId, 'input');
            if (!a || !b) return null;
            return [a, ...conn.waypoints.map(w => ({ x: w.x, y: w.y })), b];
        }

        addComment(x, y, w, h, text) {
            const c = new Comment(x, y, w, h, text);
            this.comments.push(c);
            this._bump();
            return c;
        }
        removeComment(id) {
            const idx = this.comments.findIndex(c => c.id === id);
            if (idx < 0) return false;
            this.comments.splice(idx, 1);
            this._selectedCommentIds.delete(id);
            this._bump();
            return true;
        }
        getComment(id) { return this.comments.find(c => c.id === id) || null; }
        getCommentAt(wx, wy) {
            for (let i = this.comments.length - 1; i >= 0; i--) {
                if (this.comments[i].contains(wx, wy)) return this.comments[i];
            }
            return null;
        }
        getCommentsInRect(x1, y1, x2, y2) {
            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            const out = [];
            for (const c of this.comments) {
                const b = c.getBounds();
                if (b.minX < maxX && b.maxX > minX && b.minY < maxY && b.maxY > minY) out.push(c);
            }
            return out;
        }
        updateComment(id, updates) {
            const c = this.getComment(id);
            if (!c) return null;
            if (updates.x !== undefined) c.x = updates.x;
            if (updates.y !== undefined) c.y = updates.y;
            if (updates.width !== undefined) c.width = Math.max(COMMENT_MIN_W, updates.width);
            if (updates.height !== undefined) c.height = Math.max(COMMENT_MIN_H, updates.height);
            if (updates.text !== undefined) c.text = updates.text;
            c.updatedAt = Date.now();
            this._bump();
            return c;
        }

        invalidateDescendants(nodeId) {
            const visited = new Set([nodeId]);
            const adj = new Map();
            for (const c of this.connections) {
                if (!adj.has(c.fromNodeId)) adj.set(c.fromNodeId, []);
                adj.get(c.fromNodeId).push(c.toNodeId);
            }
            const stack = adj.get(nodeId) ? adj.get(nodeId).slice() : [];
            let changed = false;
            while (stack.length) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                const n = this.getNode(id);
                if (n) { n.invalidateResult(); changed = true; }
                const next = adj.get(id);
                if (next) for (const to of next) stack.push(to);
            }
            if (changed) this._bump();
        }

        getSnapshot() {
            if (this._snapshot && this._snapshotVersion === this._version) return this._snapshot;
            this._snapshot = this._buildSnapshot();
            this._snapshotVersion = this._version;
            return this._snapshot;
        }

        _buildSnapshot() {
            const g = this;
            const inputMap = new Map();
            const outputMap = new Map();
            for (const n of g.nodes) {
                inputMap.set(n.id, []);
                outputMap.set(n.id, []);
            }
            for (const c of g.connections) {
                if (inputMap.has(c.toNodeId)) inputMap.get(c.toNodeId).push(c.fromNodeId);
                if (outputMap.has(c.fromNodeId)) outputMap.get(c.fromNodeId).push(c.toNodeId);
            }

            const nodes = g.nodes.map(n => ({
                id: n.id,
                title: n.title,
                defId: n.def ? n.def.id : null,
                defFile: n.def ? n.def.file : null,
                env: n.def ? n.def.env : null,
                params: { ...n.paramValues },
                inputIds: inputMap.get(n.id) || [],
                outputIds: outputMap.get(n.id) || [],
                result: n._result
            }));

            const connections = g.connections.map(c => ({
                id: c.id,
                fromNodeId: c.fromNodeId,
                toNodeId: c.toNodeId,
                waypoints: c.waypoints.map(w => ({ x: w.x, y: w.y }))
            }));

            const byId = new Map(nodes.map(n => [n.id, n]));

            return {
                env: g.env,
                nodes,
                connections,
                getNode: (id) => byId.get(id) || null,
                getParams: (id) => { const n = byId.get(id); return n ? n.params : null; },
                getInputs: (id) => {
                    const n = byId.get(id);
                    if (!n) return [];
                    return n.inputIds.map(i => byId.get(i)).filter(Boolean);
                },
                getOutputs: (id) => {
                    const n = byId.get(id);
                    if (!n) return [];
                    return n.outputIds.map(i => byId.get(i)).filter(Boolean);
                },
                getConnectionsFrom: (id) => connections.filter(c => c.fromNodeId === id),
                getConnectionsTo: (id) => connections.filter(c => c.toNodeId === id),
                hasConnection: (fromId, toId) => connections.some(c => c.fromNodeId === fromId && c.toNodeId === toId),
                getAllEdges: () => connections.map(c => ({ from: c.fromNodeId, to: c.toNodeId }))
            };
        }

        _syncSelectedFlags() {
            for (const n of this.nodes) n.selected = this._selectedNodeIds.has(n.id);
            for (const c of this.comments) c.selected = this._selectedCommentIds.has(c.id);
        }

        select(ids, replace = true) {
            if (replace) {
                this._selectedNodeIds.clear();
                this._selectedCommentIds.clear();
            }
            this._selectedConnectionId = null;

            const list = Array.isArray(ids) ? ids : (ids != null ? [ids] : []);
            for (const id of list) {
                if (this.nodes.some(n => n.id === id)) this._selectedNodeIds.add(id);
                if (this.comments.some(c => c.id === id)) this._selectedCommentIds.add(id);
            }
            this._syncSelectedFlags();
            this._bump();
        }

        deselect(ids = null) {
            if (ids === null) {
                this._selectedNodeIds.clear();
                this._selectedCommentIds.clear();
                this._selectedConnectionId = null;
            } else {
                const list = Array.isArray(ids) ? ids : [ids];
                for (const id of list) {
                    this._selectedNodeIds.delete(id);
                    this._selectedCommentIds.delete(id);
                }
            }
            this._syncSelectedFlags();
            this._bump();
        }

        isSelected(id) {
            return this._selectedNodeIds.has(id) || this._selectedCommentIds.has(id);
        }

        getSelectedIds() {
            return [...this._selectedNodeIds, ...this._selectedCommentIds];
        }

        selectConnection(connId) {
            this._selectedNodeIds.clear();
            this._selectedCommentIds.clear();
            this._selectedConnectionId = connId;
            this._syncSelectedFlags();
            this._bump();
        }

        getSelectedConnectionId() { return this._selectedConnectionId; }

        getSelected() {
            const nodes = [];
            const comments = [];
            for (const id of this._selectedNodeIds) {
                const n = this.getNode(id);
                if (n) nodes.push(n);
            }
            for (const id of this._selectedCommentIds) {
                const c = this.getComment(id);
                if (c) comments.push(c);
            }
            return { nodes, comments };
        }

        clear() {
            this.nodes = [];
            this.connections = [];
            this.comments = [];
            this._selectedNodeIds.clear();
            this._selectedCommentIds.clear();
            this._selectedConnectionId = null;
            this._bump();
        }

        destroy() {
            this._snapshot = null;
            this._snapshotVersion = -1;
            this.nodes = [];
            this.connections = [];
            this.comments = [];
            this._selectedNodeIds.clear();
            this._selectedCommentIds.clear();
            this._selectedConnectionId = null;
            this._version = 0;
        }

        _bump() {
            this._version++;
            this._snapshot = null;
            this._snapshotVersion = -1;
        }
        getVersion() { return this._version; }

        toJSON() {
            return {
                env: this.env,
                nodes: this.nodes.map(n => n.toJSON()),
                connections: this.connections.map(c => c.toJSON()),
                comments: this.comments.map(c => c.toJSON()),
                version: this._version
            };
        }
    }

    // ============================================================
    // NODE LOADER
    // ============================================================
    class NodeLoader {
        constructor(baseUrl = 'data/nodes') {
            this.baseUrl = baseUrl.replace(/\/$/, '');
            this.registry = null;
            this.defsByEnv = new Map();
            this.categoriesByEnv = new Map();
            this.presetsByEnv = new Map();
        }

        async loadAll() {
            this.registry = await EnvRegistry.load(`${this.baseUrl}/envirment.json`);
            this.defsByEnv.clear();
            this.categoriesByEnv.clear();
            this.presetsByEnv.clear();
            for (const env of this.registry.allEnvs()) {
                try {
                    const defs = await this._loadEnv(env);
                    this.defsByEnv.set(env, defs);
                } catch (e) {
                    _warn(`[NodeLoader] env "${env}" load failed:`, e);
                    this.defsByEnv.set(env, new Map());
                    this.categoriesByEnv.set(env, []);
                    this.presetsByEnv.set(env, []);
                }
            }
            return this.registry;
        }

        async _loadEnv(env) {
            const map = new Map();
            const categories = [];
            const manifestUrl = `${this.baseUrl}/${env}/manifest.json`;

            let manifest = null;
            try {
                const res = await fetch(manifestUrl);
                if (res.ok) manifest = await res.json();
                else _warn(`[NodeLoader] manifest not found: ${manifestUrl} (HTTP ${res.status})`);
            } catch (e) {
                _warn(`[NodeLoader] manifest "${manifestUrl}" failed:`, e);
            }

            if (manifest && Array.isArray(manifest.categories)) {
                for (const cat of manifest.categories) {
                    if (!cat || typeof cat !== 'object') continue;
                    const catName = String(cat.name || 'Прочее');
                    const files = Array.isArray(cat.nodes) ? cat.nodes : [];
                    const catDefs = [];
                    for (const file of files) {
                        try {
                            const def = await this._loadNodeFile(env, file);
                            if (!def) continue;
                            def.category = catName;
                            map.set(def.id, def);
                            catDefs.push(def);
                        } catch (e) {
                            _warn(`[NodeLoader] node "${env}/${file}" failed:`, e);
                        }
                    }
                    categories.push({ name: catName, defs: catDefs });
                }
            }

            this.categoriesByEnv.set(env, categories);
            const presets = (manifest && Array.isArray(manifest.presets))
                ? manifest.presets.filter(p => p && typeof p === 'object' && p.id)
                : [];
            this.presetsByEnv.set(env, presets);
            return map;
        }

        async _loadNodeFile(env, file) {
            const url = `${this.baseUrl}/${env}/${file}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const code = await res.text();

            const module = { exports: {} };
            try {
                const fn = new Function('module', 'exports', 'console', '"use strict";\n' + code);
                fn(module, module.exports, console);
            } catch (e) {
                throw new Error(`eval error: ${e.message}`);
            }
            const raw = module.exports;
            if (!raw || typeof raw !== 'object') return null;
            return new NodeDef(raw, env, file);
        }

        getDefs(env) { return this.defsByEnv.get(env) || new Map(); }
        getCategories(env) { return this.categoriesByEnv.get(env) || []; }
        getPresets(env) { return this.presetsByEnv.get(env) || []; }

        findDef(env, defId) { return this.getDefs(env).get(defId) || null; }
        findDefByFile(env, file) {
            const map = this.getDefs(env);
            for (const d of map.values()) if (d.file === file) return d;
            return null;
        }
    }

    // ============================================================
    // COMPUTE CONTEXT
    // ============================================================
    class ComputeContext {
        constructor(graph, node, host) {
            this.graph = graph;
            this.node = node;
            this.def = node.def;
            this.env = graph.env;
            this.params = { ...node.paramValues };
            this.host = host;

            this._stack = [];
            this._snapshot = null;
            this.signal = null;
        }

        getSnapshot() {
            if (!this._snapshot) this._snapshot = this.graph.getSnapshot();
            return this._snapshot;
        }

        getNode(id) { return this.graph.getNode(id); }
        getInputs(nodeId) {
            const id = nodeId != null ? nodeId : this.node.id;
            return this.graph.connections
                .filter(c => c.toNodeId === id)
                .map(c => this.graph.getNode(c.fromNodeId))
                .filter(Boolean);
        }
        getOutputs(nodeId) {
            const id = nodeId != null ? nodeId : this.node.id;
            return this.graph.connections
                .filter(c => c.fromNodeId === id)
                .map(c => this.graph.getNode(c.toNodeId))
                .filter(Boolean);
        }
        getParam(nodeId, paramId) {
            const n = this.graph.getNode(nodeId);
            return n ? n.paramValues[paramId] : undefined;
        }

        hasResult(nodeId) {
            const n = this.graph.getNode(nodeId);
            return !!(n && n.hasFreshResult());
        }
        getResult(nodeId) {
            const n = this.graph.getNode(nodeId);
            return n ? n._result : null;
        }
        setResult(value) { this.node.setResult(value); }
        invalidate(nodeId) {
            if (nodeId == null) this.node.invalidateResult();
            else {
                const n = this.graph.getNode(nodeId);
                if (n) n.invalidateResult();
            }
        }

        async requestCompute(nodeId, opts = {}) {
            const force = !!opts.force;
            const target = this.graph.getNode(nodeId);
            if (!target) throw new Error(`Нода ${nodeId} не найдена`);

            if (this._stack.includes(nodeId)) {
                const chain = this._stack.concat(nodeId).join(' → ');
                throw new Error(`Цикл в вычислениях: ${chain}`);
            }

            if (!force && target.hasFreshResult()) return target._result;
            if (!target.def || !target.def.hasCompute()) return null;

            const childCtx = new ComputeContext(this.graph, target, this.host);
            childCtx._stack = this._stack.concat(this.node.id);
            childCtx.signal = this.signal;

            const check = target.def.invokeCheckCompute(childCtx);
            if (check && check.ready === false) return null;

            if (target._running && target._computePromise) return await target._computePromise;

            target._running = true;
            target._error = null;
            const p = (async () => {
                try {
                    const result = await target.def.invokeCompute(childCtx, childCtx.signal);
                    if (result === undefined || result === null) {
                        target._dirty = true;
                        return null;
                    }
                    target.setResult(result);
                    return result;
                } catch (e) {
                    target.setError(String(e.message || e));
                    throw e;
                } finally {
                    target._running = false;
                    target._computePromise = null;
                }
            })();
            target._computePromise = p;
            return await p;
        }

        notify(title, message, variant) {
            if (this.host && typeof this.host.notify === 'function') {
                this.host.notify(title, message, variant);
            }
        }
        log(...args) { _log(`[${this.env}:${this.node.title}]`, ...args); }
        throwError(message) { throw new Error(String(message)); }
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
            this.dirty = true;
            this._renderId = null;
            this._lastVersion = -1;
            this.graph = null;

            this.selectionRect = null;
            this.hoverPort = null;
            this.tempConnection = null;
            this.hoverWaypoint = null;
            this.hoverConnectionId = null;

            this.hoverNodeId = null;
            this.hoverNodeOk = false;

            this.searchQuery = '';
            this.searchMatchIds = new Set();
            this.searchCurrentId = null;

            this.hudVisible = true;

            this._hudCache = { version: -1, text: '' };
            this._envIconProvider = null;
        }

        setGraph(graph) {
            this.graph = graph;
            this._lastVersion = -1;
            this._hudCache.version = -1;
            this.markDirty();
        }

        markDirty() {
            this.dirty = true;
            this._scheduleRender();
        }

        _scheduleRender() {
            if (this._renderId !== null) return;
            this._renderId = requestAnimationFrame(() => {
                this._renderId = null;
                this.render();
            });
        }

        render() {
            if (!this.graph) { this._scheduleRender(); return; }
            const v = this.graph.getVersion();
            if (!this.dirty && v === this._lastVersion) { this._scheduleRender(); return; }
            this.dirty = false;
            this._lastVersion = v;

            const ctx = this.ctx;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const w = this.canvas.width / dpr;
            const h = this.canvas.height / dpr;
            if (w < 10 || h < 10) { this._scheduleRender(); return; }

            const p = this.theme.palette;
            ctx.fillStyle = p.bg;
            ctx.fillRect(0, 0, w, h);

            this.gridCache.render(ctx, this.camera, w, h, dpr);
            this._renderComments(ctx);
            this._renderConnections(ctx);
            if (this.tempConnection) this._renderTempConnection(ctx);
            this._renderNodes(ctx);
            if (this.selectionRect) this._renderSelectionRect(ctx);
            if (this.hudVisible) this._renderHUD(ctx, w, h);
        }

        _renderComments(ctx) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const canvasUtils = window.utils && window.utils.canvas;
            const rr = canvasUtils
                ? canvasUtils.roundRect.bind(canvasUtils)
                : this._roundRect.bind(this);

            for (const c of this.graph.comments) {
                const sw = c.width * zoom;
                const sh = c.height * zoom;
                const sx = (c.x + this.camera.x) * zoom - sw / 2;
                const sy = (c.y + this.camera.y) * zoom - sh / 2;

                if (sx + sw < -50 || sx > this.camera.viewportWidth + 50) continue;
                if (sy + sh < -50 || sy > this.camera.viewportHeight + 50) continue;

                const r = Math.min(6 * zoom, 10);
                const headerH = c.headerHeight * zoom;

                ctx.fillStyle = p.commentBg;
                rr(ctx, sx, sy, sw, sh, r);
                ctx.fill();

                ctx.save();
                rr(ctx, sx, sy, sw, headerH, r);
                ctx.clip();
                ctx.fillStyle = p.commentHeaderBg;
                ctx.fillRect(sx, sy, sw, headerH);
                ctx.restore();

                ctx.strokeStyle = p.commentBorder;
                ctx.lineWidth = 1;
                rr(ctx, sx, sy, sw, sh, r);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(sx, sy + headerH);
                ctx.lineTo(sx + sw, sy + headerH);
                ctx.stroke();

                if (c.selected) {
                    ctx.save();
                    rr(ctx, sx, sy, sw, sh, r);
                    ctx.clip();
                    ctx.fillStyle = p.selectionBar;
                    ctx.fillRect(sx, sy, sw, Math.max(2, 3 * zoom));
                    ctx.restore();
                }

                const fs = Math.max(9, 11 * zoom);
                ctx.fillStyle = p.commentText;
                ctx.font = `600 ${fs}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const pad = 8 * zoom;
                let label = c.text || 'Comment';
                const maxW = sw - pad * 2;
                while (ctx.measureText(label).width > maxW && label.length > 1) {
                    label = label.slice(0, -1);
                }
                ctx.fillText(label, sx + pad, sy + headerH / 2);
            }
        }

        _renderConnections(ctx) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const canvasUtils = window.utils && window.utils.canvas;

            for (const conn of this.graph.connections) {
                const fromNode = this.graph.getNode(conn.fromNodeId);
                const toNode = this.graph.getNode(conn.toNodeId);
                if (!fromNode || !toNode) continue;
                const a = fromNode.getPortWorld(conn.fromPortId, 'output');
                const b = toNode.getPortWorld(conn.toPortId, 'input');
                if (!a || !b) continue;

                const isSelected = this.graph.getSelectedConnectionId() === conn.id;
                const isHover = this.hoverConnectionId === conn.id;

                ctx.strokeStyle = isSelected
                    ? p.connectionSelected
                    : (isHover ? p.waypointHover : p.connection);
                ctx.lineWidth = Math.max(1.2, (isSelected ? 3 : 2) * zoom);

                const points = [a, ...conn.waypoints.map(w => ({ x: w.x, y: w.y })), b];
                if (points.length === 2) {
                    const sa = this.camera.worldToScreen(points[0].x, points[0].y);
                    const sb = this.camera.worldToScreen(points[1].x, points[1].y);
                    if (canvasUtils) canvasUtils.bezier(ctx, sa.x, sa.y, sb.x, sb.y, 0.5);
                    else this._bezier(ctx, sa.x, sa.y, sb.x, sb.y);
                    ctx.stroke();
                } else {
                    const spts = points.map(pt => this.camera.worldToScreen(pt.x, pt.y));
                    if (canvasUtils) canvasUtils.multiBezier(ctx, spts, 0.35);
                    else this._multiBezier(ctx, points);
                    ctx.stroke();
                }

                for (let i = 0; i < conn.waypoints.length; i++) {
                    const wp = conn.waypoints[i];
                    const s = this.camera.worldToScreen(wp.x, wp.y);
                    const isHoverWp = (this.hoverWaypoint &&
                        this.hoverWaypoint.connectionId === conn.id &&
                        this.hoverWaypoint.waypointIndex === i) || isHover;
                    const r = (WAYPOINT_RADIUS_BASE * (isHoverWp ? 1.6 : 1)) * zoom;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, Math.max(2.5, r), 0, Math.PI * 2);
                    ctx.fillStyle = isHoverWp ? p.waypointHover : p.waypoint;
                    ctx.fill();
                    ctx.strokeStyle = p.bg;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }

        _renderTempConnection(ctx) {
            const p = this.theme.palette;
            const sa = this.camera.worldToScreen(this.tempConnection.from.x, this.tempConnection.from.y);

            let color = p.connectionTemp;
            if (this.tempConnection.ok === true) color = p.connectionTempOk;
            else if (this.tempConnection.ok === false) color = p.connectionTempBad;

            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1.2, 2 * this.camera.zoom);
            ctx.setLineDash([6, 4]);
            this._bezier(ctx, sa.x, sa.y, this.tempConnection.to.x, this.tempConnection.to.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        _bezier(ctx, x1, y1, x2, y2) {
            const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
        }

        _multiBezier(ctx, points) {
            if (points.length < 2) return;
            const s = points.map(p => this.camera.worldToScreen(p.x, p.y));
            ctx.beginPath();
            ctx.moveTo(s[0].x, s[0].y);

            if (s.length === 2) {
                const dx = Math.max(40, Math.abs(s[1].x - s[0].x) * 0.5);
                ctx.bezierCurveTo(s[0].x + dx, s[0].y, s[1].x - dx, s[1].y, s[1].x, s[1].y);
                return;
            }
            for (let i = 0; i < s.length - 1; i++) {
                const p0 = i === 0 ? s[i] : s[i - 1];
                const p1 = s[i];
                const p2 = s[i + 1];
                const p3 = i + 2 < s.length ? s[i + 2] : s[i + 1];

                const c1x = p1.x + (p2.x - p0.x) * 0.35;
                const c1y = p1.y + (p2.y - p0.y) * 0.35;
                const c2x = p2.x - (p3.x - p1.x) * 0.35;
                const c2y = p2.y - (p3.y - p1.y) * 0.35;

                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
            }
        }

        _renderNodes(ctx) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const canvasUtils = window.utils && window.utils.canvas;
            const rr = canvasUtils
                ? canvasUtils.roundRect.bind(canvasUtils)
                : this._roundRect.bind(this);

            for (const node of this.graph.nodes) {
                const fullH = node.getFullHeight();
                const sw = node.width * zoom;
                const sh = fullH * zoom;
                const sx = (node.x + this.camera.x) * zoom - sw / 2;
                const sy = (node.y + this.camera.y) * zoom - sh / 2;

                if (sx + sw < -50 || sx > this.camera.viewportWidth + 50) continue;
                if (sy + sh < -50 || sy > this.camera.viewportHeight + 50) continue;

                const r = Math.min(6 * zoom, 10);
                const headerH = node.getHeaderHeight() * zoom;

                ctx.shadowColor = 'rgba(0,0,0,0.25)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;

                ctx.fillStyle = p.nodeBg;
                rr(ctx, sx, sy, sw, sh, r);
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

                ctx.save();
                rr(ctx, sx, sy, sw, headerH, r);
                ctx.clip();
                ctx.fillStyle = p.nodeBgDark;
                ctx.fillRect(sx, sy, sw, headerH);
                ctx.restore();

                ctx.strokeStyle = p.nodeBorder;
                ctx.lineWidth = 1;
                rr(ctx, sx, sy, sw, sh, r);
                ctx.stroke();

                if (node._searchMatch) {
                    ctx.strokeStyle = p.searchMatch;
                    ctx.lineWidth = 2;
                    rr(ctx, sx - 2, sy - 2, sw + 4, sh + 4, r + 2);
                    ctx.stroke();

                    if (this.searchCurrentId === node.id) {
                        ctx.save();
                        ctx.shadowColor = p.searchMatchGlow;
                        ctx.shadowBlur = 12;
                        ctx.strokeStyle = p.searchMatch;
                        ctx.lineWidth = 3;
                        rr(ctx, sx - 3, sy - 3, sw + 6, sh + 6, r + 3);
                        ctx.stroke();
                        ctx.restore();
                    }
                }

                if (this.hoverNodeId === node.id && this.tempConnection) {
                    ctx.save();
                    ctx.shadowColor = this.hoverNodeOk ? p.nodeTargetGlow : 'rgba(220,80,80,0.5)';
                    ctx.shadowBlur = 16;
                    ctx.strokeStyle = this.hoverNodeOk ? p.portTargetOk : p.portTargetBad;
                    ctx.lineWidth = 2.5;
                    rr(ctx, sx - 2, sy - 2, sw + 4, sh + 4, r + 2);
                    ctx.stroke();
                    ctx.restore();
                }

                if (node.selected) {
                    ctx.save();
                    rr(ctx, sx, sy, sw, sh, r);
                    ctx.clip();
                    ctx.fillStyle = p.selectionBar;
                    ctx.fillRect(sx, sy, sw, Math.max(2, 3 * zoom));
                    ctx.restore();
                }

                const status = node.getStatus();
                if (status !== 'idle') {
                    const statusColors = {
                        running: p.statusRunning,
                        ok: p.statusOk,
                        error: p.statusError
                    };
                    const color = statusColors[status];
                    if (color) {
                        ctx.save();
                        rr(ctx, sx, sy, sw, sh, r);
                        ctx.clip();
                        ctx.fillStyle = color;
                        ctx.fillRect(sx, sy, sw, Math.max(2, 2 * zoom));
                        ctx.restore();
                    }
                }

                const fs = Math.max(9, 12 * zoom);
                ctx.fillStyle = p.nodeTitle;
                ctx.font = `600 ${fs}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const cy = sy + headerH / 2;
                const maxW = sw - NODE_TITLE_PAD_X * zoom;
                let label = node.title;
                while (ctx.measureText(label).width > maxW && label.length > 1) {
                    label = label.slice(0, -1);
                }
                ctx.fillText(label, sx + sw / 2, cy);

                this._renderPorts(ctx, node);

                node._layout.transition = null;
                if (node.hasDrillDown()) {
                    this._renderNodeBody(ctx, node, sx, sy + headerH, sw, sh - headerH);
                }
            }
        }

        _renderPorts(ctx, node) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const r = Math.max(3.5, PORT_RADIUS_BASE * zoom);
            const hover = this.hoverPort;

            for (const port of node.getAllPorts()) {
                const s = this.camera.worldToScreen(port.x, port.y);
                const isHover = hover
                    && hover.nodeId === node.id
                    && hover.portId === port.portId
                    && hover.side === port.side;

                let color = isHover ? p.portHover : p.port;
                if (this.tempConnection && isHover) {
                    color = (this.tempConnection.ok === false) ? p.portTargetBad : p.portTargetOk;
                }

                ctx.beginPath();
                ctx.arc(s.x, s.y, isHover ? r * 1.4 : r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = p.nodeBg;
                ctx.lineWidth = 1;
                ctx.stroke();

                if (zoom > PORT_LABEL_MIN_ZOOM && port.label) {
                    ctx.fillStyle = p.textMuted;
                    ctx.font = `${Math.max(8, 9 * zoom)}px sans-serif`;
                    ctx.textAlign = port.side === 'input' ? 'left' : 'right';
                    ctx.textBaseline = 'middle';
                    const pad = PORT_LABEL_PAD * zoom;
                    const tx = port.side === 'input' ? s.x + pad : s.x - pad;
                    ctx.fillText(port.label, tx, s.y);
                }
            }
        }

        _renderNodeBody(ctx, node, sx, sy, sw, sh) {
            const p = this.theme.palette;
            const zoom = this.camera.zoom;
            const canvasUtils = window.utils && window.utils.canvas;
            const rr = canvasUtils
                ? canvasUtils.roundRect.bind(canvasUtils)
                : this._roundRect.bind(this);

            const padY = NODE_BODY_PAD_Y * zoom;
            const transH = NODE_TRANSITION_H * zoom;
            const innerX = sx + NODE_BODY_PAD_X * zoom;
            const innerW = sw - NODE_BODY_PAD_X * 2 * zoom;

            const cy = sy + padY;
            if (cy + transH > sy + sh) {
                node._layout.transition = null;
                return;
            }

            const tRect = { x: innerX, y: cy, w: innerW, h: transH };
            ctx.fillStyle = p.transitionBg;
            rr(ctx, tRect.x, tRect.y, tRect.w, tRect.h, 4);
            ctx.fill();
            ctx.strokeStyle = p.transitionBorder;
            ctx.lineWidth = 1;
            rr(ctx, tRect.x, tRect.y, tRect.w, tRect.h, 4);
            ctx.stroke();

            const iconSize = Math.min(transH - 6 * zoom, 16 * zoom);
            const iconX = tRect.x + 8 * zoom;
            const iconY = tRect.y + (tRect.h - iconSize) / 2;
            const iconEl = node.def && node.def.drillDown
                ? this._envIconClass(node.def.drillDown)
                : 'icon-layout';
            if (window.ui && window.ui.icon && typeof window.ui.icon.canvas === 'function') {
                window.ui.icon.canvas(ctx, iconEl, iconX, iconY, iconSize, p.transitionText);
            }

            ctx.fillStyle = p.transitionText;
            ctx.font = `${Math.max(9, 10.5 * zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = node.def.drillDown;
            const maxLabelW = tRect.w - iconSize - 20 * zoom;
            let displayLabel = label;
            while (ctx.measureText(displayLabel).width > maxLabelW && displayLabel.length > 1) {
                displayLabel = displayLabel.slice(0, -1);
            }
            ctx.fillText(displayLabel, tRect.x + tRect.w / 2, tRect.y + tRect.h / 2);

            const enterIconSize = Math.min(transH - 6 * zoom, 16 * zoom);
            const enterX = tRect.x + tRect.w - 8 * zoom - enterIconSize;
            const enterY = tRect.y + (tRect.h - enterIconSize) / 2;
            if (window.ui && window.ui.icon && typeof window.ui.icon.canvas === 'function') {
                window.ui.icon.canvas(ctx, 'icon-arrow-right', enterX, enterY, enterIconSize, p.transitionText);
            }

            node._layout.transition = tRect;
        }

        _envIconClass(envName) {
            if (typeof this._envIconProvider === 'function') {
                try { return this._envIconProvider(envName) || 'icon-layout'; } catch (e) {}
            }
            return 'icon-layout';
        }
        setEnvIconProvider(fn) { this._envIconProvider = fn; }

        _renderSelectionRect(ctx) {
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

            const cacheKey = this.graph.getVersion();
            const zoomPct = this.camera.getZoomPercent();
            if (this._hudCache.version !== cacheKey || this._hudCache.zoomPct !== zoomPct) {
                const sel = this.graph.getSelected();
                let hudText = `Zoom: ${zoomPct}%  ·  ${this.graph.env}  ·  Nodes: ${this.graph.nodes.length}  ·  Sel: ${sel.nodes.length}н/${sel.comments.length}к`;
                if (this.searchQuery) {
                    hudText += `  ·  Поиск: "${this.searchQuery}" (${this.searchMatchIds.size})`;
                }
                this._hudCache.version = cacheKey;
                this._hudCache.zoomPct = zoomPct;
                this._hudCache.text = hudText;
            }
            ctx.fillText(this._hudCache.text, 12, h - 10);

            let hint;
            if (this.tempConnection) hint = 'Esc — отмена  ·  Отпустите на порту';
            else if (this.selectionRect) hint = 'ЛКМ — выделить область';
            else hint = 'ЛКМ — выделить  ·  MMB/Space — pan  ·  Wheel — zoom  ·  ПКМ — меню  ·  DblClick — свойства';

            ctx.textAlign = 'right';
            ctx.font = '10px monospace';
            ctx.fillStyle = p.textMuted;
            ctx.fillText(hint, w - 12, h - 10);
        }

        _roundRect(ctx, x, y, w, h, r) {
            r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }

        setSelectionRect(rect) {
            const prev = this.selectionRect;
            if (prev && rect &&
                prev.x1 === rect.x1 && prev.y1 === rect.y1 &&
                prev.x2 === rect.x2 && prev.y2 === rect.y2) return;
            if (!prev && !rect) return;
            this.selectionRect = rect;
            this.markDirty();
        }
        clearSelectionRect() {
            if (!this.selectionRect) return;
            this.selectionRect = null;
            this.markDirty();
        }
        setHoverPort(p) {
            const prev = this.hoverPort;
            const same = (!prev && !p) ||
                (prev && p &&
                 prev.nodeId === p.nodeId &&
                 prev.portId === p.portId &&
                 prev.side === p.side);
            if (same) return;
            this.hoverPort = p;
            this.markDirty();
        }
        setTempConnection(t) {
            const prev = this.tempConnection;
            const same = (!prev && !t) ||
                (prev && t &&
                 prev.from && t.from &&
                 prev.from.x === t.from.x && prev.from.y === t.from.y &&
                 prev.to && t.to &&
                 prev.to.x === t.to.x && prev.to.y === t.to.y &&
                 prev.ok === t.ok);
            if (same) return;
            this.tempConnection = t;
            this.markDirty();
        }
        setHoverWaypoint(w) {
            const prev = this.hoverWaypoint;
            const same = (!prev && !w) ||
                (prev && w &&
                 prev.connectionId === w.connectionId &&
                 prev.waypointIndex === w.waypointIndex);
            if (same) return;
            this.hoverWaypoint = w;
            this.markDirty();
        }
        setHoverConnection(id) {
            if (this.hoverConnectionId === id) return;
            this.hoverConnectionId = id;
            this.markDirty();
        }
        setHoverNode(id, ok) {
            if (this.hoverNodeId === id && this.hoverNodeOk === ok) return;
            this.hoverNodeId = id;
            this.hoverNodeOk = !!ok;
            this.markDirty();
        }
        setSearch(query, matchIds, currentId) {
            this.searchQuery = query || '';
            this.searchMatchIds = matchIds || new Set();
            this.searchCurrentId = currentId || null;
            this._hudCache.version = -1;
            this.markDirty();
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

        destroy() {
            if (this._renderId) { cancelAnimationFrame(this._renderId); this._renderId = null; }
            this.gridCache = null;
            this._envIconProvider = null;
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
            this._isResizingComment = false;
            this._isConnecting = false;
            this._isDraggingWaypoint = false;

            this._dragTarget = null;
            this._dragElement = null;
            this._dragStartPos = null;
            this._dragStartWorld = null;
            this._dragStartScreen = null;
            this._pendingDrag = null;
            this._selectionStartWorld = null;

            this._resizeHandle = null;
            this._resizeStartPos = null;
            this._resizeStartRect = null;

            this._connectFrom = null;
            this._waypointDrag = null;

            this._spaceHeld = false;
            this._snapEnabled = true;

            this._bound = {
                down: this._onMouseDown.bind(this),
                move: this._onMouseMove.bind(this),
                up: this._onMouseUp.bind(this),
                wheel: this._onWheel.bind(this),
                dbl: this._onDoubleClick.bind(this),
                keyDown: this._onKeyDown.bind(this),
                keyUp: this._onKeyUp.bind(this),
                ctx: (e) => { e.preventDefault(); e.stopPropagation(); },
                leave: this._onMouseLeave.bind(this),
                click: (e) => { e.stopPropagation(); e.preventDefault(); }
            };
            this._bind();
        }

        get graph() { return this.host.getActiveGraph(); }
        get g2d() { return this.host.utils.graph2d; }

        _bind() {
            this.canvas.addEventListener('mousedown', this._bound.down);
            this.canvas.addEventListener('mousemove', this._bound.move);
            this.canvas.addEventListener('mouseup', this._bound.up);
            this.canvas.addEventListener('mouseleave', this._bound.leave);
            this.canvas.addEventListener('contextmenu', this._bound.ctx);
            this.canvas.addEventListener('wheel', this._bound.wheel, { passive: false });
            this.canvas.addEventListener('dblclick', this._bound.dbl);
            this.canvas.addEventListener('click', this._bound.click);
            document.addEventListener('keydown', this._bound.keyDown);
            document.addEventListener('keyup', this._bound.keyUp);
        }

        _getMousePos(e) {
            const rect = this.canvas.getBoundingClientRect();
            return { screenX: e.clientX - rect.left, screenY: e.clientY - rect.top };
        }

        _getPortAt(worldX, worldY) {
            const g = this.graph;
            if (!g) return null;
            const zoom = this.camera.zoom;
            const thr = Math.max(6, 10 / zoom);
            const thr2 = thr * thr;

            let best = null;
            let bestDist2 = thr2;

            for (let i = g.nodes.length - 1; i >= 0; i--) {
                const node = g.nodes[i];
                if (!node.def) continue;
                for (const port of node.getAllPorts()) {
                    const dx = worldX - port.x, dy = worldY - port.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestDist2) {
                        bestDist2 = d2;
                        best = {
                            nodeId: node.id,
                            portId: port.portId,
                            side: port.side,
                            node,
                            world: { x: port.x, y: port.y }
                        };
                    }
                }
            }
            return best;
        }

        _getResizeHandle(wx, wy, comment) {
            const r = comment.getRect();
            const band = 8 / this.camera.zoom;
            const cornerSize = 14 / this.camera.zoom;

            const inX = wx >= r.left && wx <= r.right;
            const inY = wy >= r.top && wy <= r.bottom;
            if (!inX || !inY) return null;

            const nearLeft = wx >= r.left && wx <= r.left + band;
            const nearRight = wx >= r.right - band && wx <= r.right;
            const nearTop = wy >= r.top && wy <= r.top + band;
            const nearBottom = wy >= r.bottom - band && wy <= r.bottom;

            const inLeftCorner = wx <= r.left + cornerSize;
            const inRightCorner = wx >= r.right - cornerSize;
            const inTopCorner = wy <= r.top + cornerSize;
            const inBottomCorner = wy >= r.bottom - cornerSize;

            if (nearTop && inLeftCorner) return 'nw';
            if (nearTop && inRightCorner) return 'ne';
            if (nearBottom && inLeftCorner) return 'sw';
            if (nearBottom && inRightCorner) return 'se';

            if (nearTop) return 'n';
            if (nearBottom) return 's';
            if (nearLeft) return 'w';
            if (nearRight) return 'e';
            return null;
        }

        _cursorForHandle(h) {
            return {
                nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
                e: 'e-resize', se: 'se-resize', s: 's-resize',
                sw: 'sw-resize', w: 'w-resize'
            }[h] || 'default';
        }

        _snapStep() {
            return this._snapEnabled ? SNAP_SMALL : 0;
        }

        _computeInsertIndex(connHit) {
            const conn = connHit.conn;
            const fromNode = this.graph.getNode(conn.fromNodeId);
            const toNode = this.graph.getNode(conn.toNodeId);
            if (!fromNode || !toNode) return -1;
            const a = fromNode.getPortWorld(conn.fromPortId, 'output');
            const b = toNode.getPortWorld(conn.toPortId, 'input');
            if (!a || !b) return -1;

            const point = connHit.point;
            const dTotal = Math.hypot(b.x - a.x, b.y - a.y);
            if (dTotal < 1) return -1;
            const dPoint = Math.hypot(point.x - a.x, point.y - a.y) / dTotal;

            if (conn.waypoints.length === 0) return 0;
            for (let i = 0; i < conn.waypoints.length; i++) {
                const w = conn.waypoints[i];
                const t = Math.hypot(w.x - a.x, w.y - a.y) / dTotal;
                if (dPoint < t) return i;
            }
            return conn.waypoints.length;
        }

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

            if (window.__uiMenuRegistry && window.__uiMenuRegistry.size() > 0) return;

            const g = this.graph;

            if (e.key === 'Escape') {
                if (this._isConnecting) {
                    this._isConnecting = false;
                    this._connectFrom = null;
                    this.renderer.setTempConnection(null);
                    this.renderer.setHoverNode(null, false);
                    this.renderer.markDirty();
                    e.preventDefault();
                    return;
                }
                if (g) {
                    g.deselect();
                    this.renderer.markDirty();
                    e.preventDefault();
                }
                return;
            }

            if (!g) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selConn = g.getSelectedConnectionId();
                if (selConn != null) {
                    e.preventDefault();
                    g.removeConnection(selConn);
                    this.host._saveAndRecord('Удаление связи');
                    this.renderer.markDirty();
                    return;
                }
                const sel = g.getSelected();
                if (sel.nodes.length || sel.comments.length) {
                    e.preventDefault();
                    for (const n of sel.nodes) g.removeNode(n.id);
                    for (const c of sel.comments) g.removeComment(c.id);
                    this.host._saveAndRecord('Удаление');
                    this.renderer.markDirty();
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault(); this.host.copySelection(); return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault(); this.host.pasteClipboard(); return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
                e.preventDefault(); this.host.duplicateSelection(); return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault(); this.host.toggleSearch(); return;
            }
            if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault(); this.host.zoomToFit(); return;
            }
            if (!e.shiftKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault(); this.host.zoomToSelection(); return;
            }
            if (e.key === '0') {
                e.preventDefault();
                this.camera.zoomToCenter(1.0, false);
                this.renderer.markDirty();
                return;
            }
            if (e.key === '+' || e.key === '=') { e.preventDefault(); this.camera.zoomIn(); this.renderer.markDirty(); return; }
            if (e.key === '-' || e.key === '_') { e.preventDefault(); this.camera.zoomOut(); this.renderer.markDirty(); return; }

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const sel = g.getSelected();
                if (sel.nodes.length === 0 && sel.comments.length === 0) return;
                e.preventDefault();
                const step = e.shiftKey ? SNAP_LARGE : SNAP_SMALL;
                const dx = e.key === 'ArrowRight' ? step : (e.key === 'ArrowLeft' ? -step : 0);
                const dy = e.key === 'ArrowDown' ? step : (e.key === 'ArrowUp' ? -step : 0);

                for (const n of sel.nodes) { n.x += dx; n.y += dy; n.updatedAt = Date.now(); }
                for (const c of sel.comments) { c.x += dx; c.y += dy; c.updatedAt = Date.now(); }
                g._bump();
                this.host._saveAndRecord('Сдвиг');
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

        _onMouseDown(e) {
            if (e.button === 1) {
                this._isPanning = true;
                const { screenX, screenY } = this._getMousePos(e);
                this._dragStartScreen = { x: screenX, y: screenY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.button !== 0) return;

            const { screenX, screenY } = this._getMousePos(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const g = this.graph;
            if (!g) return;

            if (this._spaceHeld || e.ctrlKey) {
                this._isPanning = true;
                this._dragStartScreen = { x: screenX, y: screenY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const portHit = this._getPortAt(world.x, world.y);
            if (portHit) {
                this._isConnecting = true;
                this._connectFrom = portHit;
                this.renderer.setTempConnection({
                    from: { x: portHit.world.x, y: portHit.world.y },
                    to: { x: screenX, y: screenY },
                    ok: null
                });
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const wpHit = g.getWaypointAt(world.x, world.y, WAYPOINT_HIT_RADIUS / this.camera.zoom);
            if (wpHit) {
                this._isDraggingWaypoint = true;
                this._waypointDrag = { connectionId: wpHit.conn.id, waypointIndex: wpHit.waypointIndex };
                g.selectConnection(wpHit.conn.id);
                this.renderer.markDirty();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const node = g.getNodeAt(world.x, world.y);
            const comment = g.getCommentAt(world.x, world.y);
            const commentHeaderHit = comment ? comment.containsHeader(world.x, world.y) : false;

            if (node && !commentHeaderHit) {
                const b = node.getBounds();
                const headerBottom = b.minY + node.getHeaderHeight();

                if (world.y >= headerBottom) {
                    const hit = node.hitTestBody(world.x, world.y);
                    if (hit && hit.kind === 'transition') {
                        e.preventDefault();
                        e.stopPropagation();
                        this.host.navigateTo(node.def.drillDown);
                        return;
                    }
                }

                if (e.shiftKey) {
                    if (g.isSelected(node.id)) {
                        g.deselect(node.id);
                        this.renderer.markDirty();
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    g.select(node.id, false);
                } else if (!g.isSelected(node.id)) {
                    g.deselect();
                    g.select(node.id);
                }
                this.renderer.markDirty();
                if (typeof this.host._broadcastSelection === 'function') {
                    this.host._broadcastSelection(node);
                }
                this._pendingDrag = {
                    target: 'node',
                    element: node,
                    startWorld: { x: world.x, y: world.y }
                };
                this.canvas.style.cursor = 'grab';
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (comment) {
                const handle = this._getResizeHandle(world.x, world.y, comment);
                if (handle) {
                    this._isResizingComment = true;
                    this._resizeHandle = handle;
                    this._resizeStartPos = { x: world.x, y: world.y };
                    this._resizeStartRect = comment.getRect();
                    this._dragElement = comment;
                    if (!e.shiftKey) g.deselect();
                    g.select(comment.id);
                    this.renderer.markDirty();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if (commentHeaderHit) {
                    if (e.shiftKey) {
                        if (g.isSelected(comment.id)) {
                            g.deselect(comment.id);
                            this.renderer.markDirty();
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                        }
                        g.select(comment.id, false);
                    } else if (!g.isSelected(comment.id)) {
                        g.deselect();
                        g.select(comment.id);
                    }
                    this.renderer.markDirty();
                    this._pendingDrag = {
                        target: 'comment',
                        element: comment,
                        startWorld: { x: world.x, y: world.y }
                    };
                    this.canvas.style.cursor = 'grab';
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if (e.shiftKey) {
                    if (g.isSelected(comment.id)) g.deselect(comment.id);
                    else g.select(comment.id, false);
                } else if (!g.isSelected(comment.id)) {
                    g.deselect();
                    g.select(comment.id);
                }
                this.renderer.markDirty();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const connHit = g.getConnectionAt(world.x, world.y, CONNECTION_HIT_THRESHOLD / this.camera.zoom);
            if (connHit) {
                if (e.shiftKey) {
                    g.removeConnection(connHit.conn.id);
                    this.host._saveAndRecord('Удаление связи');
                    this.renderer.markDirty();
                } else {
                    g.selectConnection(connHit.conn.id);
                    this.renderer.markDirty();
                }
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            this._isSelecting = true;
            this._selectionStartWorld = { x: world.x, y: world.y };
            this.renderer.setSelectionRect({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
            if (!e.shiftKey) g.deselect();
            this.renderer.markDirty();
            e.preventDefault();
            e.stopPropagation();
        }

        _onMouseMove(e) {
            const { screenX, screenY } = this._getMousePos(e);
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
                this._updateConnecting(screenX, screenY, world, g);
                return;
            }

            if (this._isDraggingWaypoint && this._waypointDrag) {
                g.updateWaypoint(this._waypointDrag.connectionId, this._waypointDrag.waypointIndex, world.x, world.y);
                this.renderer.markDirty();
                return;
            }

            if (this._isResizingComment && this._dragElement) {
                this._updateCommentResize(world);
                return;
            }

            if (this._pendingDrag && !this._isDragging) {
                this._tryStartDrag(world, g);
            }

            if (this._isDragging && this._dragStartPos && this._dragStartWorld) {
                this._updateDrag(world, g);
                return;
            }

            if (this._isSelecting) {
                this.renderer.setSelectionRect({
                    x1: this._selectionStartWorld.x, y1: this._selectionStartWorld.y,
                    x2: world.x, y2: world.y
                });
                return;
            }

            this._updateHover(world, g);
        }

        _updateConnecting(screenX, screenY, world, g) {
            const fromNode = g.getNode(this._connectFrom.nodeId);
            let fromWorld = { x: 0, y: 0 };
            if (fromNode) {
                const w = fromNode.getPortWorld(this._connectFrom.portId, this._connectFrom.side);
                if (w) fromWorld = { x: w.x, y: w.y };
            }

            const hover = this._getPortAt(world.x, world.y);
            this.renderer.setHoverPort(hover);

            let ok = null;
            let targetNodeId = null;

            if (hover && hover.nodeId !== this._connectFrom.nodeId) {
                const res = this._evalPotentialConnection(hover, g);
                ok = res.ok;
                targetNodeId = res.nodeId;
            } else if (!hover) {
                const n = g.getNodeAt(world.x, world.y);
                if (n && n.id !== this._connectFrom.nodeId) {
                    const res = this._evalPotentialConnectionByNode(n, g);
                    ok = res.ok;
                    targetNodeId = res.nodeId;
                }
            }

            this.renderer.setHoverNode(targetNodeId, ok === true);
            this.renderer.setTempConnection({
                from: fromWorld,
                to: { x: screenX, y: screenY },
                ok
            });
        }

        _evalPotentialConnection(hoverPort, g) {
            let src = this._connectFrom;
            let dst = hoverPort;
            if (src.side === 'input' && dst.side === 'output') {
                const t = src; src = dst; dst = t;
            }
            if (src.side === 'output' && dst.side === 'input') {
                const res = g.canConnect(src.nodeId, src.portId, dst.nodeId, dst.portId);
                return { ok: !!res.ok, nodeId: dst.nodeId };
            }
            return { ok: false, nodeId: hoverPort.nodeId };
        }

        _evalPotentialConnectionByNode(node, g) {
            const wantSide = this._connectFrom.side === 'output' ? 'input' : 'output';
            const ports = (wantSide === 'input') ? (node.def?.inputPorts || []) : (node.def?.outputPorts || []);
            if (ports.length === 0) return { ok: false, nodeId: node.id };

            const firstPort = ports[0];
            let src = this._connectFrom;
            let dst = { nodeId: node.id, portId: firstPort.id, side: wantSide };
            if (src.side === 'input' && dst.side === 'output') {
                const t = src; src = dst; dst = t;
            }
            if (src.side === 'output' && dst.side === 'input') {
                const res = g.canConnect(src.nodeId, src.portId, dst.nodeId, dst.portId);
                return { ok: !!res.ok, nodeId: node.id };
            }
            return { ok: false, nodeId: node.id };
        }

        _updateCommentResize(world) {
            const c = this._dragElement;
            const dx = world.x - this._resizeStartPos.x;
            const dy = world.y - this._resizeStartPos.y;
            const r = this._resizeStartRect;
            const h = this._resizeHandle;

            let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
            if (h.includes('e')) right = Math.max(r.left + COMMENT_MIN_W, r.right + dx);
            if (h.includes('w')) left = Math.min(r.right - COMMENT_MIN_W, r.left + dx);
            if (h.includes('s')) bottom = Math.max(r.top + COMMENT_MIN_H, r.bottom + dy);
            if (h.includes('n')) top = Math.min(r.bottom - COMMENT_MIN_H, r.top + dy);

            c.setRect({ left, right, top, bottom });
            this.renderer.markDirty();
        }

        _tryStartDrag(world, g) {
            const pd = this._pendingDrag;
            const dx = world.x - pd.startWorld.x;
            const dy = world.y - pd.startWorld.y;
            if (Math.abs(dx) * this.camera.zoom <= 3 && Math.abs(dy) * this.camera.zoom <= 3) return;

            this._isDragging = true;
            this._dragTarget = pd.target;
            this._dragElement = pd.element;
            this._dragStartWorld = { x: pd.startWorld.x, y: pd.startWorld.y };

            const sel = g.getSelected();
            if (pd.target === 'node') {
                this._dragStartPos = {
                    nodes: sel.nodes.map(n => { const tl = n.getTopLeft(); return { id: n.id, tlx: tl.x, tly: tl.y }; }),
                    comments: sel.comments.map(c => { const tl = c.getTopLeft(); return { id: c.id, tlx: tl.x, tly: tl.y }; })
                };
            } else if (pd.target === 'comment') {
                const comment = pd.element;
                const nodesInside = g.nodes.filter(n => comment.containsNode(n));
                const nodeMap = new Map();
                for (const rec of sel.nodes) {
                    const tl = rec.getTopLeft();
                    nodeMap.set(rec.id, { id: rec.id, tlx: tl.x, tly: tl.y });
                }
                for (const n of nodesInside) {
                    if (!nodeMap.has(n.id)) {
                        const tl = n.getTopLeft();
                        nodeMap.set(n.id, { id: n.id, tlx: tl.x, tly: tl.y });
                    }
                }
                const commentMap = new Map();
                for (const rec of sel.comments) {
                    const tl = rec.getTopLeft();
                    commentMap.set(rec.id, { id: rec.id, tlx: tl.x, tly: tl.y });
                }
                if (!commentMap.has(comment.id)) {
                    const tl = comment.getTopLeft();
                    commentMap.set(comment.id, { id: comment.id, tlx: tl.x, tly: tl.y });
                }
                this._dragStartPos = {
                    nodes: Array.from(nodeMap.values()),
                    comments: Array.from(commentMap.values())
                };
            }
            this.canvas.style.cursor = 'grabbing';
            this._pendingDrag = null;
        }

        _updateDrag(world, g) {
            const rawDx = world.x - this._dragStartWorld.x;
            const rawDy = world.y - this._dragStartWorld.y;
            const step = this._snapStep();

            let snappedDx = rawDx;
            let snappedDy = rawDy;
            if (step > 0) {
                const anchorNode = this._dragStartPos.nodes[0];
                const anchorComment = this._dragStartPos.comments[0];
                let anchorTLX = null, anchorTLY = null;
                if (this._dragTarget === 'node' && anchorNode) {
                    anchorTLX = anchorNode.tlx; anchorTLY = anchorNode.tly;
                } else if (this._dragTarget === 'comment' && anchorComment) {
                    anchorTLX = anchorComment.tlx; anchorTLY = anchorComment.tly;
                }
                if (anchorTLX != null) {
                    const rawTLX = anchorTLX + rawDx;
                    const rawTLY = anchorTLY + rawDy;
                    snappedDx = _snapTo(rawTLX, step) - anchorTLX;
                    snappedDy = _snapTo(rawTLY, step) - anchorTLY;
                }
            }

            for (const rec of this._dragStartPos.nodes) {
                const n = g.getNode(rec.id);
                if (!n) continue;
                n.setTopLeft(rec.tlx + snappedDx, rec.tly + snappedDy);
                n.updatedAt = Date.now();
            }
            for (const rec of this._dragStartPos.comments) {
                const c = g.getComment(rec.id);
                if (!c) continue;
                c.setTopLeft(rec.tlx + snappedDx, rec.tly + snappedDy);
                c.updatedAt = Date.now();
            }
            g._bump();
            this.renderer.markDirty();
        }

        _updateHover(world, g) {
            const portHit = this._getPortAt(world.x, world.y);
            this.renderer.setHoverPort(portHit);
            if (portHit) {
                this.renderer.setHoverWaypoint(null);
                this.renderer.setHoverConnection(null);
                this.canvas.style.cursor = 'crosshair';
                return;
            }

            const wpHit = g.getWaypointAt(world.x, world.y, WAYPOINT_HIT_RADIUS / this.camera.zoom);
            this.renderer.setHoverWaypoint(wpHit ? { connectionId: wpHit.conn.id, waypointIndex: wpHit.waypointIndex } : null);
            if (wpHit) {
                this.renderer.setHoverConnection(null);
                this.canvas.style.cursor = 'move';
                return;
            }

            const connHit = g.getConnectionAt(world.x, world.y, CONNECTION_HIT_THRESHOLD / this.camera.zoom);
            this.renderer.setHoverConnection(connHit ? connHit.conn.id : null);
            if (connHit) {
                this.canvas.style.cursor = 'pointer';
                return;
            }

            const node = g.getNodeAt(world.x, world.y);
            const comment = g.getCommentAt(world.x, world.y);

            if (node && !(comment && comment.containsHeader(world.x, world.y))) {
                const b = node.getBounds();
                this.canvas.style.cursor =
                    (world.y > b.minY + node.getHeaderHeight() && node.hasDrillDown()) ? 'pointer' : 'grab';
            } else if (comment) {
                const h = this._getResizeHandle(world.x, world.y, comment);
                if (h) this.canvas.style.cursor = this._cursorForHandle(h);
                else if (comment.containsHeader(world.x, world.y)) this.canvas.style.cursor = 'grab';
                else this.canvas.style.cursor = 'default';
            } else if (this._spaceHeld) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.canvas.style.cursor = 'default';
            }
        }

        _onMouseUp(e) {
            e.stopPropagation();
            const g = this.graph;
            if (!g) { this._resetState(); return; }

            if (this._isPanning) {
                this._isPanning = false;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
                return;
            }

            if (this._isConnecting) {
                this._finishConnecting(e, g);
                return;
            }

            if (this._isDraggingWaypoint) {
                this._isDraggingWaypoint = false;
                this._waypointDrag = null;
                this.host._saveAndRecord('Точка излома');
                this.renderer.markDirty();
                return;
            }

            if (this._isResizingComment) {
                this._isResizingComment = false;
                this._resizeHandle = null;
                this._resizeStartRect = null;
                this._dragElement = null;
                this.host._saveAndRecord('Изменение размера комментария');
                this.renderer.markDirty();
                return;
            }

            if (this._pendingDrag && !this._isDragging) {
                this._pendingDrag = null;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
            }

            if (this._isDragging) {
                this._isDragging = false;
                let moved = false;
                if (this._dragStartWorld) {
                    const { screenX, screenY } = this._getMousePos(e);
                    const world = this.camera.screenToWorld(screenX, screenY);
                    moved = Math.abs(world.x - this._dragStartWorld.x) > DRAG_THRESHOLD ||
                            Math.abs(world.y - this._dragStartWorld.y) > DRAG_THRESHOLD;
                }
                this._dragTarget = null;
                this._dragElement = null;
                this._dragStartPos = null;
                this._dragStartWorld = null;
                this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'default';
                if (moved) this.host._saveAndRecord('Перемещение');
                return;
            }

            if (this._isSelecting) {
                this._finishSelecting(e, g);
                return;
            }
        }

        _finishConnecting(e, g) {
            const { screenX, screenY } = this._getMousePos(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const hit = this._getPortAt(world.x, world.y);

            let target = hit;
            if (!target) {
                const n = g.getNodeAt(world.x, world.y);
                if (n && n.id !== this._connectFrom.nodeId) {
                    const wantSide = this._connectFrom.side === 'output' ? 'input' : 'output';
                    const ports = (wantSide === 'input') ? (n.def?.inputPorts || []) : (n.def?.outputPorts || []);
                    if (ports.length > 0) {
                        target = { nodeId: n.id, portId: ports[0].id, side: wantSide, node: n };
                    }
                }
            }

            if (target && target.nodeId !== this._connectFrom.nodeId) {
                let src = this._connectFrom;
                let dst = target;
                if (src.side === 'input' && dst.side === 'output') {
                    const t = src; src = dst; dst = t;
                }
                if (src.side === 'output' && dst.side === 'input') {
                    const res = g.addConnection(src.nodeId, src.portId, dst.nodeId, dst.portId);
                    if (res.conn) this.host._saveAndRecord('Соединение');
                    else this.host.notify('Соединение невозможно', res.reason || 'Ноды несовместимы', 'warning');
                } else {
                    this.host.notify(
                        'Соединение невозможно',
                        'Соединять можно только выход одной ноды со входом другой',
                        'warning'
                    );
                }
            }

            this._isConnecting = false;
            this._connectFrom = null;
            this.renderer.setTempConnection(null);
            this.renderer.setHoverPort(null);
            this.renderer.setHoverNode(null, false);
            this.renderer.markDirty();
        }

        _finishSelecting(e, g) {
            this._isSelecting = false;
            this.renderer.clearSelectionRect();
            const { screenX, screenY } = this._getMousePos(e);
            const world = this.camera.screenToWorld(screenX, screenY);

            const nodes = g.getNodesInRect(this._selectionStartWorld.x, this._selectionStartWorld.y, world.x, world.y);
            const comments = g.getCommentsInRect(this._selectionStartWorld.x, this._selectionStartWorld.y, world.x, world.y);

            const filteredNodes = nodes.filter(n => {
                for (const c of comments) if (c.containsNode(n)) return false;
                return true;
            });

            const nodeIds = filteredNodes.map(n => n.id);
            const commentIds = comments.map(c => c.id);

            if (nodeIds.length > 0 || commentIds.length > 0) {
                if (!e.shiftKey) g.deselect();
                if (nodeIds.length > 0) g.select(nodeIds, false);
                if (commentIds.length > 0) g.select(commentIds, false);
            } else if (!e.shiftKey) {
                g.deselect();
            }
            this._selectionStartWorld = null;
            this.renderer.markDirty();
        }

        _resetState() {
            this._isPanning = false;
            this._isConnecting = false;
            this._connectFrom = null;
            this._isResizingComment = false;
            this._isDragging = false;
            this._pendingDrag = null;
            this._isSelecting = false;
            this._isDraggingWaypoint = false;
            this._dragElement = null;
            this._dragStartPos = null;
            this._dragStartWorld = null;
            this._resizeHandle = null;
            this._resizeStartRect = null;
            this._selectionStartWorld = null;
            this._waypointDrag = null;
            if (this.renderer) {
                this.renderer.setTempConnection(null);
                this.renderer.clearSelectionRect();
                this.renderer.setHoverNode(null, false);
                this.renderer.markDirty();
            }
        }

        _onMouseLeave() {
            if (this._isConnecting) {
                this._isConnecting = false;
                this._connectFrom = null;
                this.renderer.setTempConnection(null);
                this.renderer.setHoverNode(null, false);
            }
            if (this._pendingDrag) this._pendingDrag = null;
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

            const { screenX, screenY } = this._getMousePos(e);
            const g2d = this.g2d;
            const delta = -dy * ZOOM_STEP_WHEEL;
            const newZoom = _clamp(this.camera.zoom * Math.exp(delta), g2d.ZOOM_MIN, g2d.ZOOM_MAX);
            this.camera.zoomToPoint(newZoom, screenX, screenY, false);
            this.renderer.markDirty();
        }

        _onDoubleClick(e) {
            const { screenX, screenY } = this._getMousePos(e);
            const world = this.camera.screenToWorld(screenX, screenY);
            const g = this.graph;
            if (!g) return;

            this._pendingDrag = null;

            const wpHit = g.getWaypointAt(world.x, world.y, WAYPOINT_HIT_RADIUS / this.camera.zoom);
            if (wpHit) {
                g.removeWaypoint(wpHit.conn.id, wpHit.waypointIndex);
                this.host._saveAndRecord('Удаление точки излома');
                this.renderer.markDirty();
                return;
            }

            const comment = g.getCommentAt(world.x, world.y);
            if (comment && comment.containsHeader(world.x, world.y)) {
                this.host.editComment(comment);
                return;
            }

            const connHit = g.getConnectionAt(world.x, world.y, CONNECTION_HIT_THRESHOLD / this.camera.zoom);
            if (connHit) {
                const insertIndex = this._computeInsertIndex(connHit);
                g.addWaypoint(connHit.conn.id, world.x, world.y, insertIndex);
                g.selectConnection(connHit.conn.id);
                this.host._saveAndRecord('Добавлена точка излома');
                this.renderer.markDirty();
                return;
            }

            const node = g.getNodeAt(world.x, world.y);
            if (node) {
                if (!g.isSelected(node.id)) {
                    g.deselect();
                    g.select(node.id);
                    this.renderer.markDirty();
                }
                if (typeof this.host.openPropertiesFor === 'function') {
                    this.host.openPropertiesFor(node);
                }
                return;
            }
        }

        destroy() {
            this.canvas.removeEventListener('mousedown', this._bound.down);
            this.canvas.removeEventListener('mousemove', this._bound.move);
            this.canvas.removeEventListener('mouseup', this._bound.up);
            this.canvas.removeEventListener('mouseleave', this._bound.leave);
            this.canvas.removeEventListener('contextmenu', this._bound.ctx);
            this.canvas.removeEventListener('wheel', this._bound.wheel);
            this.canvas.removeEventListener('dblclick', this._bound.dbl);
            this.canvas.removeEventListener('click', this._bound.click);
            document.removeEventListener('keydown', this._bound.keyDown);
            document.removeEventListener('keyup', this._bound.keyUp);
        }
    }

    // ============================================================
    // NODE GRAPH WINDOW
    // ============================================================
    class NodeGraphWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'nodegraph',
                name: 'Node Graph',
                icon: 'icon-nodegraph',
                description: 'Нодовая система со средами',
                group: 'Редакторы',
                category: 'editor',
                priority: 2,
                defaultSize: { width: 900, height: 600 },
                minSize: { width: 400, height: 300 },
                maxWindows: 2,
                metadata: { version: '8.0.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'graph-dd',
                        type: 'dropdown',
                        icon: 'icon-menu',
                        label: 'Граф',
                        title: 'Действия с графом',
                        items: [
                            { header: 'Навигация' },
                            { icon: 'icon-arrow-left', label: 'Назад', action: 'navBack' },
                            { divider: true },
                            { header: 'Узлы' },
                            { icon: 'icon-plus', label: 'Add', action: 'openAddPanelAtCursor', shortcut: 'Ctrl+N' },
                            { icon: 'icon-check', label: 'Выбрать всё', action: 'selectAll', shortcut: 'Ctrl+A' },
                            { icon: 'icon-align', label: 'Выровнять', action: 'alignNodes', shortcut: 'Q' },
                            { icon: 'icon-copy', label: 'Копировать', action: 'copySelection', shortcut: 'Ctrl+C' },
                            { icon: 'icon-paste', label: 'Вставить', action: 'pasteClipboard', shortcut: 'Ctrl+V' },
                            { icon: 'icon-refresh', label: 'Дублировать', action: 'duplicateSelection', shortcut: 'Ctrl+D' },
                            { divider: true },
                            { header: 'Поиск' },
                            { icon: 'icon-search', label: 'Найти узел', action: 'toggleSearch', shortcut: 'Ctrl+F' },
                            { icon: 'icon-zoom-in', label: 'Zoom to fit', action: 'zoomToFit', shortcut: 'Shift+F' },
                            { icon: 'icon-zoom-in', label: 'Zoom to selection', action: 'zoomToSelection', shortcut: 'F' },
                            { divider: true },
                            { header: 'Комментарии' },
                            { icon: 'icon-plus', label: 'Добавить комментарий', action: 'addCommentAtMouse', shortcut: 'C' },
                            { divider: true },
                            { icon: 'icon-refresh', label: 'Сброс камеры', action: 'resetCamera' },
                            { icon: 'icon-clear', label: 'Очистить всё', action: 'clearAll', danger: true }
                        ]
                    },
                    {
                        id: 'env-panel',
                        render: (ctx) => {
                            const bw = ctx.baseWindow;
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst || typeof inst._buildEnvTrigger !== 'function') {
                                return document.createComment('env-trigger');
                            }
                            return inst._buildEnvTrigger();
                        },
                        destroy: (el, bw) => {
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst) return;
                            if (inst._envTrigger && typeof inst._envTrigger.destroy === 'function') {
                                try { inst._envTrigger.destroy(); } catch (e) {}
                            }
                            inst._envTrigger = null;
                        }
                    },
                    {
                        id: 'add-panel',
                        render: (ctx) => {
                            const bw = ctx.baseWindow;
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst || typeof inst._buildAddTrigger !== 'function') {
                                return document.createComment('add-trigger');
                            }
                            return inst._buildAddTrigger();
                        },
                        destroy: (el, bw) => {
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst) return;
                            if (inst._addTrigger && typeof inst._addTrigger.destroy === 'function') {
                                try { inst._addTrigger.destroy(); } catch (e) {}
                            }
                            inst._addTrigger = null;
                        }
                    },
                    {
                        id: 'presets-panel',
                        render: (ctx) => {
                            const bw = ctx.baseWindow;
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst || typeof inst._buildPresetsTrigger !== 'function') {
                                return document.createComment('presets-trigger');
                            }
                            return inst._buildPresetsTrigger();
                        },
                        destroy: (el, bw) => {
                            const inst = bw && typeof bw.getRealInstance === 'function'
                                ? bw.getRealInstance()
                                : null;
                            if (!inst) return;
                            if (inst._presetsTrigger && typeof inst._presetsTrigger.destroy === 'function') {
                                try { inst._presetsTrigger.destroy(); } catch (e) {}
                            }
                            inst._presetsTrigger = null;
                        }
                    },

                    { type: 'separator' },

                    { id: 'sys-data',       type: 'sys-data' },
                    { id: 'sys-changeType', type: 'sys-changeType' },
                    { id: 'sys-layout',     type: 'sys-layout' },
                    { id: 'sys-minimize',   type: 'sys-minimize' },
                    { id: 'sys-fullscreen', type: 'sys-fullscreen' },
                    { id: 'sys-close',      type: 'sys-close' }
                ]
            };
        }

        static get hotkeys() {
            return {
                'C':      { label: 'Комментарий на курсоре',     action: 'addCommentAtMouse' },
                'Ctrl+A': { label: 'Выбрать всё',                action: 'selectAll' },
                'Q':      { label: 'Выровнять выделенные',       action: 'alignNodes' },
                'Ctrl+N': { label: 'Открыть Add на курсоре',     action: 'openAddPanelAtCursor' },
                'Ctrl+L': { label: 'Очистить',                   action: 'clearAll' }
            };
        }

        static get channels() {
            return ['nodeprops:request-selection', 'nodegraph:param-changed', 'nodeprops:param-changed'];
        }

        // ============================================================
        // LIFECYCLE
        // ============================================================
        _ensureFields() {
            if (this._fieldsReady) return;

            this._graphs = {};
            this._envStack = [];
            this._openEnvs = new Set();
            this._loader = null;
            this._registry = null;
            this._activeEnv = null;
            this._loopId = null;
            this._lastLoopTime = 0;
            this._theme = null;
            this._camera = null;
            this._renderer = null;
            this._input = null;
            this._canvas = null;
            this._lastMouse = { x: 0, y: 0 };
            this._pendingGraphs = null;

            this._envTrigger = null;
            this._addTrigger = null;
            this._presetsTrigger = null;

            this._clipboard = null;

            this._searchActive = false;
            this._searchQuery = '';
            this._searchMatches = [];
            this._searchIndex = 0;
            this._searchEl = null;

            this._isSelfSave = false;

            this._fieldsReady = true;
        }

        buildContent(el) {
            this._ensureFields();
            if (this._canvas) return;

            Object.assign(el.style, {
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--bg-panel, #1a1a1a)'
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

            this._buildSearchInput(el);

            this._theme = new ThemeAdapter();
            this._theme.refresh();

            this._camera = this.utils.graph2d.camera({
                physics: { friction: 0.92, frictionZoom: 0.85, maxVelocity: 100, maxVelocityZoom: 0.5 }
            });

            const gridCache = this.utils.graph2d.gridCache(this._theme);
            this._renderer = new Renderer(this._canvas, this._camera, this._theme, gridCache);
            this._renderer.setEnvIconProvider((env) => this._envIconFor(env));
            this._input = new InputManager(this._canvas, this._camera, this._renderer, this);

            this._contextMenuHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showContextMenu(e.clientX, e.clientY);
            };
            this._canvas.addEventListener('contextmenu', this._contextMenuHandler);

            this._canvas.addEventListener('mousemove', (e) => {
                const r = this._canvas.getBoundingClientRect();
                this._lastMouse = { x: e.clientX - r.left, y: e.clientY - r.top };
            });
        }

        _buildSearchInput(el) {
            this._searchEl = document.createElement('input');
            this._searchEl.type = 'text';
            this._searchEl.placeholder = 'Поиск нод...';
            Object.assign(this._searchEl.style, {
                position: 'absolute',
                top: '10px', right: '10px',
                width: '240px',
                padding: '6px 10px',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                border: '1px solid var(--accent-red, #cc2233)',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                display: 'none',
                zIndex: '10',
                boxSizing: 'border-box'
            });
            this._searchEl.addEventListener('input', () => this._onSearchInput());
            this._searchEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); this._searchNext(ev.shiftKey ? -1 : 1); }
                else if (ev.key === 'Escape') { ev.preventDefault(); this._closeSearch(); }
            });
            el.appendChild(this._searchEl);
        }

        async onReady() {
            this._ensureDefaults();
            if (!this._canvas) {
                const host = this._content || this.container;
                if (host) {
                    try { this.buildContent(host); }
                    catch (e) { _err('[NodeGraphWindow] late buildContent failed:', e); }
                }
            }

            if (!this._loader) this._loader = new NodeLoader('data/nodes');

            this._restoreFromSlot();

            try { this._registry = await this._loader.loadAll(); }
            catch (e) { _warn('[NodeGraphWindow] loader failed:', e); this._registry = new EnvRegistry(); }

            this._applyPendingGraphs();

            if (!this._activeEnv) {
                const envs = this._registry ? this._registry.allEnvs() : [];
                if (envs.length > 0) {
                    this._activeEnv = envs[0];
                    this._openEnvs.add(this._activeEnv);
                    this._envStack = [this._activeEnv];
                }
            }
            for (const env of this._openEnvs) {
                if (!this._graphs[env]) this._graphs[env] = new EnvGraph(env);
            }

            this._bindActiveGraph();
            this._refreshAllHeaderPanels();

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this._isDestroyed) return;
                    this._renderer.resize();
                    this._renderer.markDirty();
                    this._refreshAllHeaderPanels();
                    setTimeout(() => this._refreshAllHeaderPanels(), 100);
                });
            });

            this._startPhysicsLoop();

            this._paramChangeHandler = (e) => {
                if (this._isDestroyed) return;
                const detail = e && e.detail;
                if (!detail || !detail.nodeId) return;
                const g = this.getActiveGraph();
                if (!g) return;
                g.invalidateDescendants(detail.nodeId);
                if (this._renderer) this._renderer.markDirty();
            };
            document.addEventListener('nodegraph:param-changed', this._paramChangeHandler);
        }

        onData() {
            this._ensureDefaults();
            this._restoreFromSlot();
            if (this._isSelfSave) {
                if (this._renderer) this._renderer.markDirty();
                return;
            }
            if (this._registry && this._loader) this._applyPendingGraphs();
            this._bindActiveGraph();
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

        onMessage(senderId, channel, data) {
            if (channel === 'nodeprops:request-selection') {
                const g = this.getActiveGraph();
                if (!g) return;
                const sel = g.getSelected().nodes;
                if (sel.length > 0) this._broadcastSelection(sel[0]);
                return;
            }
            if (channel === 'nodeprops:param-changed') {
                if (this._renderer) this._renderer.markDirty();
                return;
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
            if (this._paramChangeHandler) {
                document.removeEventListener('nodegraph:param-changed', this._paramChangeHandler);
                this._paramChangeHandler = null;
            }

            for (const trig of [this._envTrigger, this._addTrigger, this._presetsTrigger]) {
                if (trig && typeof trig.destroy === 'function') {
                    try { trig.destroy(); } catch (e) {}
                }
            }
            this._envTrigger = null;
            this._addTrigger = null;
            this._presetsTrigger = null;

            for (const env of Object.keys(this._graphs)) {
                const g = this._graphs[env];
                if (g && typeof g.destroy === 'function') {
                    try { g.destroy(); } catch (e) {}
                }
            }

            this._canvas = null;
            this._searchEl = null;
            this._graphs = {};
            this._clipboard = null;
        }

        // ============================================================
        // DATA / SLOTS
        // ============================================================
        _ensureDefaults() {
            if (!this.uiState || typeof this.uiState !== 'object') this.uiState = {};
            if (!this.data || typeof this.data !== 'object') this.data = {};
            if (!this.uiState.viewStates) this.uiState.viewStates = {};
            if (!Array.isArray(this.uiState.envStack)) this.uiState.envStack = [];
            if (!Array.isArray(this.uiState.openEnvs)) this.uiState.openEnvs = [];
            if (typeof this.uiState.activeEnv !== 'string') this.uiState.activeEnv = null;
        }

        _restoreFromSlot() {
            const d = this.data || {};
            this._pendingGraphs = (d && d.graphs && typeof d.graphs === 'object') ? d.graphs : null;

            this._activeEnv = this.uiState.activeEnv || this._activeEnv;
            this._envStack = Array.isArray(this.uiState.envStack) && this.uiState.envStack.length
                ? this.uiState.envStack.slice()
                : (this._activeEnv ? [this._activeEnv] : []);
            this._openEnvs = new Set(Array.isArray(this.uiState.openEnvs) && this.uiState.openEnvs.length
                ? this.uiState.openEnvs
                : (this._activeEnv ? [this._activeEnv] : []));
        }

        _applyPendingGraphs() {
            if (!this._pendingGraphs) return;
            const payload = {
                graphs: this._pendingGraphs,
                nav: {
                    activeEnv: this.uiState.activeEnv,
                    envStack: this.uiState.envStack,
                    openEnvs: this.uiState.openEnvs
                }
            };
            try { this.onImport(payload); }
            catch (e) { _warn('[NodeGraphWindow] applyPendingGraphs failed:', e); }
            this._pendingGraphs = null;
        }

        _bindActiveGraph() {
            if (!this._activeEnv) return;
            if (!this._graphs[this._activeEnv]) this._graphs[this._activeEnv] = new EnvGraph(this._activeEnv);
            const g = this._graphs[this._activeEnv];
            if (this._renderer) this._renderer.setGraph(g);

            if (this._camera) {
                const vs = (this.uiState.viewStates || {})[this._activeEnv];
                if (vs) {
                    this._camera.x = vs.x || 0;
                    this._camera.y = vs.y || 0;
                    this._camera.zoom = _clamp(vs.zoom || 1.0, this.utils.graph2d.ZOOM_MIN, this.utils.graph2d.ZOOM_MAX);
                    this._camera.invalidateCache();
                }
            }
            this._closeSearch();
        }

        _collectViewStates() {
            const out = {};
            for (const env of Object.keys(this._graphs)) out[env] = { x: 0, y: 0, zoom: 1.0 };
            if (this._activeEnv && this._camera) {
                out[this._activeEnv] = { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom };
            }
            return out;
        }

        _save() {
            if (!this.data) this.data = {};
            const graphs = {};
            for (const [env, g] of Object.entries(this._graphs)) graphs[env] = g.toJSON();
            this.data.graphs = graphs;

            this.uiState.activeEnv = this._activeEnv;
            this.uiState.envStack = this._envStack.slice();
            this.uiState.openEnvs = Array.from(this._openEnvs);

            const vs = this.uiState.viewStates || {};
            if (this._activeEnv && this._camera) {
                vs[this._activeEnv] = { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom };
            }
            this.uiState.viewStates = vs;

            this._isSelfSave = true;
            try { if (typeof this.save === 'function') this.save(); }
            finally { this._isSelfSave = false; }
        }

        _saveAndRecord(label) {
            this._save();
            this.recordHistory(String(label || 'Изменение графа'));
        }

        getActiveGraph() {
            if (!this._activeEnv) return null;
            return this._graphs[this._activeEnv] || null;
        }

        onExport() {
            const graphs = {};
            for (const [env, g] of Object.entries(this._graphs)) {
                if (g.nodes.length === 0 && g.connections.length === 0 && g.comments.length === 0) continue;
                graphs[env] = g.toJSON();
            }
            return {
                version: '8.0.0',
                graphs,
                nav: {
                    activeEnv: this._activeEnv,
                    envStack: this._envStack.slice(),
                    openEnvs: Array.from(this._openEnvs)
                },
                view: this._collectViewStates()
            };
        }

        onImport(parsed) {
            if (!parsed || typeof parsed !== 'object') return false;
            const payload = parsed.graphs ? parsed : (parsed.graph && parsed.graph.graphs ? parsed.graph : parsed);
            const graphs = payload.graphs;
            if (!graphs || typeof graphs !== 'object') return false;

            this._clipboard = null;
            this._searchActive = false;
            this._searchQuery = '';
            this._searchMatches = [];
            this._searchIndex = 0;
            if (this._searchEl) { this._searchEl.value = ''; this._searchEl.style.display = 'none'; }

            const reg = this._registry;
            this._graphs = {};
            this._openEnvs = new Set();

            let maxElementId = 0, maxConnId = 0;
            for (const [env, data] of Object.entries(graphs)) {
                if (reg && !reg.has(env)) continue;
                for (const n of (data.nodes || [])) if (n.id > maxElementId) maxElementId = n.id;
                for (const cm of (data.comments || [])) if (cm.id > maxElementId) maxElementId = cm.id;
                for (const c of (data.connections || [])) if (c.id > maxConnId) maxConnId = c.id;
            }
            _setElementIdFloor(maxElementId);
            _setConnectionIdFloor(maxConnId);

            for (const [env, data] of Object.entries(graphs)) {
                if (reg && !reg.has(env)) continue;
                const g = new EnvGraph(env);
                for (const n of (data.nodes || [])) {
                    const def = this._loader.findDef(n.defEnv, n.defId) ||
                                this._loader.findDefByFile(n.defEnv, n.defFile);
                    if (!def) continue;
                    const inst = g.addNode(def, n.x, n.y);
                    inst.id = n.id;
                    inst.width = n.width || inst.width;
                    inst.paramValues = Object.assign({}, inst.paramValues, n.paramValues || {});
                    if (Array.isArray(n.expandedCategories)) inst._expandedCategories = new Set(n.expandedCategories);
                }
                for (const c of (data.connections || [])) {
                    g.connections.push(Connection.fromJSON(c));
                }
                for (const cm of (data.comments || [])) {
                    const norm = _normalizeCommentData(cm);
                    const com = new Comment(norm.x, norm.y, norm.width, norm.height, norm.text);
                    com.id = cm.id;
                    if (norm.headerHeight != null) com.headerHeight = norm.headerHeight;
                    g.comments.push(com);
                }
                this._graphs[env] = g;
            }

            const nav = payload.nav || {};
            if (nav.activeEnv && this._graphs[nav.activeEnv]) {
                this._activeEnv = nav.activeEnv;
                this._envStack = Array.isArray(nav.envStack) && nav.envStack.length ? nav.envStack.slice() : [nav.activeEnv];
                this._openEnvs = new Set(Array.isArray(nav.openEnvs) ? nav.openEnvs : [nav.activeEnv]);
            } else {
                const keys = Object.keys(this._graphs);
                this._activeEnv = keys[0] || null;
                this._envStack = this._activeEnv ? [this._activeEnv] : [];
                this._openEnvs = new Set(this._activeEnv ? [this._activeEnv] : []);
            }

            for (const env of this._openEnvs) {
                if (!this._graphs[env]) this._graphs[env] = new EnvGraph(env);
            }

            this._bindActiveGraph();
            if (this._renderer) this._renderer.markDirty();
            this._refreshAllHeaderPanels();
            return true;
        }

        // ============================================================
        // ENV NAVIGATION
        // ============================================================
        _envIconFor(env) {
            if (!this._registry) return 'icon-layout';
            return this._registry.getIcon(env) || 'icon-layout';
        }

        _buildEnvCategories() {
            const cats = [];
            if (!this._registry) return cats;

            const openList = Object.keys(this._graphs);
            if (openList.length > 0) {
                const sorted = openList.slice().sort((a, b) => {
                    const aActive = a === this._activeEnv ? 0 : 1;
                    const bActive = b === this._activeEnv ? 0 : 1;
                    if (aActive !== bActive) return aActive - bActive;
                    return a.localeCompare(b);
                });
                cats.push({
                    name: 'Текущие',
                    icon: 'icon-circle-filled',
                    items: sorted.map(env => ({
                        label: env,
                        icon: env === this._activeEnv ? 'icon-check' : this._envIconFor(env),
                        actions: [{
                            icon: 'icon-close',
                            title: 'Закрыть среду',
                            danger: true,
                            onClick: (action, ev) => {
                                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                                this.closeEnv(env);
                            }
                        }],
                        onClick: () => { if (env !== this._activeEnv) this.navigateTo(env); }
                    }))
                });
            }

            for (const cat of this._registry.categories) {
                if (!cat.envs || cat.envs.length === 0) continue;
                cats.push({
                    name: cat.name,
                    icon: 'icon-layout',
                    items: cat.envs.map(env => ({
                        label: env,
                        icon: this._envIconFor(env),
                        onClick: () => this.navigateTo(env)
                    }))
                });
            }
            return cats;
        }

        _buildEnvTrigger() {
            this._envTrigger = this.ui.categoryPanel({
                label: 'Среда',
                icon: 'icon-layout',
                categories: this._buildEnvCategories()
            });
            return this._envTrigger;
        }

        _refreshEnvPanelCategories() {
            if (this._envTrigger && typeof this._envTrigger.setCategories === 'function') {
                this._envTrigger.setCategories(this._buildEnvCategories());
            }
        }

        _buildAddTrigger() {
            this._addTrigger = this.ui.categoryPanel({
                label: 'Add',
                icon: 'icon-plus',
                categories: this._buildAddCategories()
            });
            return this._addTrigger;
        }

        _buildAddCategories() {
            const cats = [];
            const env = this._activeEnv;
            if (!env || !this._loader) return cats;

            const categories = this._loader.getCategories(env);
            if (!categories || categories.length === 0) return cats;

            for (const cat of categories) {
                if (!cat.defs || cat.defs.length === 0) continue;
                const sorted = [...cat.defs].sort((a, b) => a.label.localeCompare(b.label));
                cats.push({
                    name: cat.name,
                    icon: 'icon-nodegraph',
                    items: sorted.map(def => ({
                        label: def.label,
                        icon: def.icon || 'icon-nodegraph',
                        onClick: () => this._addNodeByDef(def)
                    }))
                });
            }
            return cats;
        }

        _refreshAddPanelCategories() {
            if (this._addTrigger && typeof this._addTrigger.setCategories === 'function') {
                this._addTrigger.setCategories(this._buildAddCategories());
            }
        }

        _buildPresetsItems() {
            const env = this._activeEnv;
            const presets = (env && this._loader) ? this._loader.getPresets(env) : [];
            return presets.map(p => ({
                label: p.label || p.id,
                icon: p.icon || 'icon-bookmark',
                description: p.description || '',
                onClick: () => this._applyPresetWithConfirm(p)
            }));
        }

        _buildPresetsTrigger() {
            this._presetsTrigger = this.ui.listPanel({
                label: 'Пресеты',
                icon: 'icon-bookmark',
                items: this._buildPresetsItems()
            });
            return this._presetsTrigger;
        }

        _refreshAllHeaderPanels() {
            if (this._isDestroyed) return;
            if (this._renderer) {
                this._renderer.resize();
                this._renderer.markDirty();
            }
            this._refreshEnvPanelCategories();
            this._refreshAddPanelCategories();
            if (this._presetsTrigger && typeof this._presetsTrigger.setItems === 'function') {
                this._presetsTrigger.setItems(this._buildPresetsItems());
            }
            this._refreshHeaderItems();
        }

        _refreshHeaderItems() {
            if (this._isDestroyed) return;
            if (typeof this.refreshHeaderItems === 'function') this.refreshHeaderItems();
        }

        navigateTo(env) {
            if (this._isDestroyed || !env) return;
            if (!this._registry || !this._registry.has(env)) {
                this.notify('Среда', `Среда "${env}" не найдена`, 'warning');
                return;
            }
            if (env === this._activeEnv) return;

            const cur = this._activeEnv;
            if (cur && this._registry) {
                const concrete = this._registry.getConcrete(cur);
                const abstract = this._registry.getAbstract(cur);
                const canUp = abstract.includes(env);
                const canDown = concrete.includes(env);
                const inStack = this._envStack.slice(0, -1).includes(env);
                if (!canUp && !canDown && !inStack) {
                    this.notify('Переход', `Нельзя перейти из "${cur}" в "${env}"`, 'warning');
                    return;
                }
            }

            if (this._activeEnv && this._camera) {
                const vs = this.uiState.viewStates || {};
                vs[this._activeEnv] = { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom };
                this.uiState.viewStates = vs;
            }

            if (!this._graphs[env]) this._graphs[env] = new EnvGraph(env);
            this._openEnvs.add(env);

            const idx = this._envStack.indexOf(env);
            if (idx >= 0) this._envStack = this._envStack.slice(0, idx + 1);
            else this._envStack.push(env);

            this._activeEnv = env;
            this._bindActiveGraph();
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Смена среды: ' + env);
            this.notify('Смена среды', `Активная среда: ${env}`, 'info');
            this._refreshEnvPanelCategories();
            this._refreshAddPanelCategories();
            this._refreshHeaderItems();
        }

        navBack() {
            if (this._isDestroyed) return;
            if (this._envStack.length <= 1) return;
            this._envStack.pop();
            this._activeEnv = this._envStack[this._envStack.length - 1];
            this._bindActiveGraph();
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Назад');
            this.notify('Смена среды', `Активная среда: ${this._activeEnv}`, 'info');
            this._refreshEnvPanelCategories();
            this._refreshAddPanelCategories();
            this._refreshHeaderItems();
        }

        async closeEnv(value, payload) {
            if (this._isDestroyed) return;
            const env = payload || value;
            if (!env) return;

            const g = this._graphs[env];
            const hasContent = g && (g.nodes.length > 0 || g.connections.length > 0 || g.comments.length > 0);

            if (hasContent) {
                const confirmId = await this.ui.confirm({
                    title: 'Закрыть среду?',
                    message:
                        `Среда «${env}» содержит ${g.nodes.length} нод, ` +
                        `${g.connections.length} связей, ${g.comments.length} комментариев.\n\n` +
                        `Все несохранённые данные этой среды будут потеряны.`,
                    icon: 'icon-warning',
                    variant: 'danger',
                    buttons: [
                        { id: 'close', label: 'Закрыть', variant: 'danger' },
                        { id: 'cancel', label: 'Отмена', variant: 'ghost' }
                    ]
                });
                if (confirmId !== 'close') return;
                if (this._isDestroyed) return;
            }

            if (g && typeof g.destroy === 'function') {
                try { g.destroy(); } catch (e) {}
            }

            delete this._graphs[env];
            this._openEnvs.delete(env);
            this._envStack = this._envStack.filter(e => e !== env);

            if (this.uiState && this.uiState.viewStates) delete this.uiState.viewStates[env];
            if (this.uiState && Array.isArray(this.uiState.openEnvs)) {
                this.uiState.openEnvs = this.uiState.openEnvs.filter(e => e !== env);
            }
            if (this.uiState && Array.isArray(this.uiState.envStack)) {
                this.uiState.envStack = this.uiState.envStack.filter(e => e !== env);
            }
            if (this.data && this.data.graphs && typeof this.data.graphs === 'object') {
                delete this.data.graphs[env];
            }

            if (this._activeEnv === env) {
                this._activeEnv = this._envStack[this._envStack.length - 1] || null;
                if (this._activeEnv && !this._graphs[this._activeEnv]) {
                    this._graphs[this._activeEnv] = new EnvGraph(this._activeEnv);
                    this._openEnvs.add(this._activeEnv);
                    if (!this._envStack.includes(this._activeEnv)) this._envStack.push(this._activeEnv);
                }
                this._bindActiveGraph();
            }

            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Закрытие среды: ' + env);
            this._refreshEnvPanelCategories();
            this._refreshAddPanelCategories();
            this._refreshHeaderItems();
        }

        async closeActiveEnv() {
            if (this._isDestroyed) return;
            if (!this._activeEnv) return;
            await this.closeEnv(this._activeEnv);
        }

        // ============================================================
        // NODES / COMMENTS
        // ============================================================
        _addNodeByDef(def) {
            if (this._isDestroyed || !def) return;
            const g = this.getActiveGraph();
            if (!g) return;

            const rect = this._canvas ? this._canvas.getBoundingClientRect() : null;
            const mouse = this._lastMouse || (rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
            const world = this._camera.screenToWorld(mouse.x, mouse.y);

            const n = g.addNode(def, world.x, world.y);
            g.select(n.id);
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Добавлен узел: ' + def.label);
        }

        addNodeAtCenter() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g) { this.notify('Узел', 'Среда не выбрана', 'warning'); return; }
            const defs = this._loader.getDefs(this._activeEnv);
            if (defs.size === 0) { this.notify('Узел', 'В среде нет доступных нод', 'warning'); return; }
            this._addNodeByDef(Array.from(defs.values())[0]);
        }

        addCommentAtMouse() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g || !this._canvas) return;
            const rect = this._canvas.getBoundingClientRect();
            const mouse = this._lastMouse || { x: rect.width / 2, y: rect.height / 2 };
            const w = this._camera.screenToWorld(mouse.x, mouse.y);
            const c = g.addComment(w.x, w.y, 240, 140, `Comment ${g.comments.length + 1}`);
            g.select(c.id);
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Добавлен комментарий');
        }

        editComment(comment) {
            if (!this._canvas || !comment) return;
            const sTL = this._camera.worldToScreen(comment.getBounds().minX, comment.getBounds().minY);
            const zoom = this._camera.zoom;
            this.ui.inlineEditor({
                parent: this._canvas.parentElement,
                rect: {
                    x: sTL.x + 2,
                    y: sTL.y + 2,
                    w: Math.max(40, comment.width * zoom - 4),
                    h: Math.max(18, comment.headerHeight * zoom - 4)
                },
                type: 'text',
                value: comment.text || '',
                onCommit: (v) => {
                    if (this._isDestroyed) return;
                    const g = this.getActiveGraph();
                    if (!g) return;
                    g.updateComment(comment.id, { text: v });
                    this._saveAndRecord('Комментарий');
                    this._renderer.markDirty();
                }
            });
        }

        // ============================================================
        // PRESETS
        // ============================================================
        async _applyPresetWithConfirm(preset) {
            if (this._isDestroyed) return;
            if (!preset || !preset.graph) {
                this.notify('Пресет', 'Пустой пресет', 'warning');
                return;
            }

            const gd = preset.graph;
            const hasNodes = Array.isArray(gd.nodes) && gd.nodes.length > 0;
            const hasComments = Array.isArray(gd.comments) && gd.comments.length > 0;
            if (!hasNodes && !hasComments) {
                this.notify('Пресет', 'В пресете нет нод и комментариев', 'warning');
                return;
            }

            const label = preset.label || preset.id;
            const mode = await this.ui.confirm({
                title: 'Применить пресет',
                message:
                    `Как применить пресет «${label}»?\n\n` +
                    `«Заменить» — очистить текущий граф и загрузить пресет.\n` +
                    `«Добавить» — добавить ноды пресета к текущему графу.`,
                icon: 'icon-bookmark',
                buttons: [
                    { id: 'replace', label: 'Заменить', variant: 'danger' },
                    { id: 'merge', label: 'Добавить', variant: 'primary' },
                    { id: 'cancel', label: 'Отмена', variant: 'ghost' }
                ]
            });
            if (mode !== 'replace' && mode !== 'merge') return;

            try {
                this._applyPreset(preset, mode);
                this.notify('Пресет', `«${label}» применён (${mode === 'replace' ? 'замена' : 'добавление'})`, 'success');
            } catch (e) {
                _err('[NodeGraphWindow] applyPreset failed:', e);
                this.notify('Ошибка', String(e.message || e), 'error');
            }
        }

        _applyPreset(preset, mode) {
            if (this._isDestroyed) return;
            const env = this._activeEnv;
            if (!env) { this.notify('Пресет', 'Нет активной среды', 'warning'); return; }

            const graphData = preset.graph;
            if (!graphData || typeof graphData !== 'object') throw new Error('Некорректный пресет: нет graph');

            let g = this._graphs[env];
            if (!g) { g = new EnvGraph(env); this._graphs[env] = g; }
            if (mode === 'replace') g.clear();

            const offset = mode === 'merge' ? PASTE_OFFSET : 0;
            const srcNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
            const srcConns = Array.isArray(graphData.connections) ? graphData.connections : [];
            const srcComments = Array.isArray(graphData.comments) ? graphData.comments : [];

            const idMap = new Map();
            let skipped = 0;

            for (const n of srcNodes) {
                const def = this._loader.findDef(n.defEnv || env, n.defId) ||
                            this._loader.findDefByFile(n.defEnv || env, n.defFile);
                if (!def) { skipped++; continue; }

                const inst = g.addNode(def, (n.x || 0) + offset, (n.y || 0) + offset);
                if (typeof n.width === 'number') {
                    inst.width = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, n.width));
                }
                if (n.paramValues && typeof n.paramValues === 'object') {
                    inst.paramValues = Object.assign({}, inst.paramValues, n.paramValues);
                }
                if (Array.isArray(n.expandedCategories) && n.expandedCategories.length > 0) {
                    inst._expandedCategories = new Set(n.expandedCategories);
                } else {
                    if (def.params && def.params.length > 0) inst._expandedCategories.add('params');
                    if (def.buttons && def.buttons.length > 0) inst._expandedCategories.add('buttons');
                }
                idMap.set(n.id, inst);
            }

            if (skipped > 0) {
                this.notify('Пресет', `Не найдено определений для ${skipped} нод.`, 'warning');
            }

            for (const c of srcConns) {
                const from = idMap.get(c.fromNodeId);
                const to = idMap.get(c.toNodeId);
                if (!from || !to) continue;
                if (!c.fromPortId || !c.toPortId) {
                    _warn('[NodeGraphWindow] preset connection without port id:', c);
                    continue;
                }
                const res = g.addConnection(from.id, c.fromPortId, to.id, c.toPortId);
                if (!res.conn) {
                    _warn('[NodeGraphWindow] preset connection rejected:', res.reason);
                    continue;
                }
                if (Array.isArray(c.waypoints)) {
                    for (const w of c.waypoints) {
                        if (w && typeof w.x === 'number' && typeof w.y === 'number') {
                            g.addWaypoint(res.conn.id, w.x + offset, w.y + offset);
                        }
                    }
                }
            }

            for (const cm of srcComments) {
                const norm = _normalizeCommentData(cm);
                const com = g.addComment(
                    norm.x + offset, norm.y + offset,
                    norm.width, norm.height, norm.text
                );
                if (norm.headerHeight != null) com.headerHeight = norm.headerHeight;
            }

            g.deselect();
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord(`Пресет: ${preset.label || preset.id}`);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this._isDestroyed) return;
                    try { this.zoomToFit(); } catch (e) { _warn('[NodeGraphWindow] zoomToFit failed:', e); }
                });
            });
        }

        // ============================================================
        // NODE OPERATIONS
        // ============================================================
        async runNode(node) {
            if (!node || !node.def) return;
            if (this._isDestroyed) return;
            if (!node.def.hasCompute()) {
                this.notify('Run', `"${node.title}" не поддерживает вычисления`, 'warning');
                return;
            }
            const g = this.getActiveGraph();
            if (!g) return;

            const ac = new AbortController();
            node._computeAbort = ac;

            const ctx = new ComputeContext(g, node, this);
            ctx.signal = ac.signal;
            let timedOut = false;

            try {
                node._running = true;
                if (this._renderer) this._renderer.markDirty();

                const timeoutId = setTimeout(() => { timedOut = true; ac.abort(); }, COMPUTE_TIMEOUT_MS);

                try {
                    const result = await node.def.invokeCompute(ctx, ac.signal);
                    if (timedOut) return;

                    if (result === undefined || result === null) {
                        node._dirty = true;
                        this.notify('Run', `"${node.title}" не дал результат`, 'warning');
                    } else {
                        node.setResult(result);
                        g.invalidateDescendants(node.id);
                        this.notify('Run', `"${node.title}" посчитано`, 'success');
                    }
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (e) {
                if (timedOut) {
                    node.setError(`Таймаут вычисления (${COMPUTE_TIMEOUT_MS} мс)`);
                    this.notify('Ошибка вычисления', `Таймаут (${COMPUTE_TIMEOUT_MS} мс)`, 'error');
                } else if (e && e.name === 'AbortError') {
                    // отменено
                } else {
                    node.setError(String(e.message || e));
                    this.notify('Ошибка вычисления', String(e.message || e), 'error');
                }
            } finally {
                node._running = false;
                node._computeAbort = null;
                if (this._renderer) this._renderer.markDirty();
            }
        }

        openPropertiesFor(node) {
            if (!node || this._isDestroyed) return;

            const payload = { node, graph: this.getActiveGraph(), host: this };

            let existing = null;
            try {
                if (typeof this.findWindowByType === 'function') existing = this.findWindowByType('nodeprops');
            } catch (e) {}

            if (existing && existing.id != null) {
                try { this.sendMessage('nodeprops:show', payload, existing.id); }
                catch (e) { _warn('[NodeGraphWindow] sendMessage(nodeprops:show) failed:', e); }
                return;
            }

            const lm = this._layoutManager;
            if (!lm || typeof lm.addWindow !== 'function') {
                this.notify('Свойства', 'Не удалось открыть окно свойств', 'warning');
                return;
            }

            let created = null;
            try { created = lm.addWindow('nodeprops'); }
            catch (e) { _warn('[NodeGraphWindow] addWindow(nodeprops) failed:', e); }

            if (!created) {
                this.notify('Свойства', 'Нет свободного места для окна свойств', 'warning');
                return;
            }

            const self = this;
            let attempts = 0;
            const MAX_ATTEMPTS = 40;

            const trySend = () => {
                if (self._isDestroyed) return;
                attempts++;

                let found = null;
                try {
                    if (typeof self.findWindowByType === 'function') found = self.findWindowByType('nodeprops');
                } catch (e) {}

                if (found && found.id != null) {
                    try {
                        self.sendMessage('nodeprops:show', {
                            node, graph: self.getActiveGraph(), host: self
                        }, found.id);
                    } catch (e) { _warn('[NodeGraphWindow] late sendMessage failed:', e); }
                    return;
                }

                if (attempts >= MAX_ATTEMPTS) {
                    _warn('[NodeGraphWindow] nodeprops did not appear in time');
                    self.notify('Свойства', 'Окно свойств не открылось', 'warning');
                    return;
                }
                setTimeout(trySend, 50);
            };

            requestAnimationFrame(() => setTimeout(trySend, 30));
        }

        _broadcastSelection(node) {
            if (!node || this._isDestroyed) return;
            try {
                this.sendMessage('nodegraph:selection-changed', {
                    node, graph: this.getActiveGraph(), host: this
                }, null);
            } catch (e) {}
        }

        // ============================================================
        // SELECT ALL / ALIGN / CLEAR / CAMERA
        // ============================================================
        selectAll() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g) return;
            const ids = [...g.nodes.map(n => n.id), ...g.comments.map(c => c.id)];
            if (ids.length === 0) {
                this.notify('Выделение', 'Граф пуст', 'info');
                return;
            }
            g.select(ids);
            if (this._renderer) this._renderer.markDirty();
            this.notify(
                'Выделение',
                `Выбрано: ${g.nodes.length} нод, ${g.comments.length} комментариев`,
                'info'
            );
        }

        alignNodes() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g) return;

            const sel = g.getSelected().nodes;
            if (sel.length <= 1) {
                this.notify('Выравнивание', 'Нужно выделить минимум 2 ноды', 'info');
                return;
            }

            const targetSet = new Set(sel.map(n => n.id));
            const adjOut = new Map();
            const adjIn = new Map();
            for (const n of sel) { adjOut.set(n.id, []); adjIn.set(n.id, []); }
            for (const c of g.connections) {
                if (targetSet.has(c.fromNodeId) && targetSet.has(c.toNodeId)) {
                    adjOut.get(c.fromNodeId).push(c.toNodeId);
                    adjIn.get(c.toNodeId).push(c.fromNodeId);
                }
            }

            const connected = sel.filter(n => adjIn.get(n.id).length > 0 || adjOut.get(n.id).length > 0);
            if (connected.length <= 1) {
                this.notify('Выравнивание', 'Выделенные ноды не связаны между собой', 'info');
                return;
            }

            const connectedSet = new Set(connected.map(n => n.id));
            const adjOut2 = new Map();
            const adjIn2 = new Map();
            for (const n of connected) { adjOut2.set(n.id, []); adjIn2.set(n.id, []); }
            for (const c of g.connections) {
                if (connectedSet.has(c.fromNodeId) && connectedSet.has(c.toNodeId)) {
                    adjOut2.get(c.fromNodeId).push(c.toNodeId);
                    adjIn2.get(c.toNodeId).push(c.fromNodeId);
                }
            }

            const layer = new Map();
            const inDeg = new Map();
            for (const n of connected) inDeg.set(n.id, adjIn2.get(n.id).length);

            const queue = [];
            for (const n of connected) {
                if (inDeg.get(n.id) === 0) { layer.set(n.id, 0); queue.push(n.id); }
            }
            if (queue.length === 0) { layer.set(connected[0].id, 0); queue.push(connected[0].id); }

            while (queue.length > 0) {
                const id = queue.shift();
                const curLayer = layer.get(id) || 0;
                for (const toId of adjOut2.get(id)) {
                    const nl = Math.max(layer.get(toId) || 0, curLayer + 1);
                    layer.set(toId, nl);
                    inDeg.set(toId, inDeg.get(toId) - 1);
                    if (inDeg.get(toId) === 0) queue.push(toId);
                }
            }
            for (const n of connected) {
                if (!layer.has(n.id)) {
                    const inMax = adjIn2.get(n.id).reduce((m, f) => {
                        const l = layer.get(f);
                        return l != null ? Math.max(m, l) : m;
                    }, -1);
                    layer.set(n.id, inMax + 1);
                }
            }

            const byLayer = new Map();
            for (const n of connected) {
                const l = layer.get(n.id);
                if (!byLayer.has(l)) byLayer.set(l, []);
                byLayer.get(l).push(n);
            }
            const layersSorted = Array.from(byLayer.keys()).sort((a, b) => a - b);
            const posInLayer = new Map();

            for (const l of layersSorted) byLayer.get(l).sort((a, b) => a.y - b.y);

            for (let pass = 0; pass < 4; pass++) {
                const forward = pass % 2 === 0;
                const layers = forward ? layersSorted : [...layersSorted].reverse();
                for (const l of layers) {
                    const arr = byLayer.get(l);
                    const bary = new Map();
                    for (const n of arr) {
                        const neighbors = forward ? adjIn2.get(n.id) : adjOut2.get(n.id);
                        let sum = 0, cnt = 0;
                        for (const nb of neighbors) {
                            const p = posInLayer.get(nb);
                            if (p != null) { sum += p; cnt++; }
                        }
                        bary.set(n.id, cnt > 0 ? sum / cnt : (posInLayer.get(n.id) || 0));
                    }
                    arr.sort((a, b) => bary.get(a.id) - bary.get(b.id));
                    arr.forEach((n, i) => posInLayer.set(n.id, i));
                }
            }

            const layerWidths = new Map();
            for (const l of layersSorted) {
                const arr = byLayer.get(l);
                let maxW = 0;
                for (const n of arr) maxW = Math.max(maxW, n.width);
                layerWidths.set(l, maxW);
            }

            const layerX = new Map();
            let cursorX = 0;
            for (const l of layersSorted) {
                const w = layerWidths.get(l);
                layerX.set(l, cursorX + w / 2);
                cursorX += w + ALIGN_H_GAP;
            }

            const rawPositions = new Map();
            for (const l of layersSorted) {
                const arr = byLayer.get(l);
                let y = 0;
                const x = layerX.get(l);
                for (const n of arr) {
                    const h = n.getFullHeight();
                    rawPositions.set(n.id, { x, y: y + h / 2 });
                    y += h + ALIGN_V_GAP;
                }
            }

            let rawMinTLX = Infinity, rawMinTLY = Infinity;
            for (const n of connected) {
                const p = rawPositions.get(n.id);
                const tlx = p.x - n.width / 2;
                const tly = p.y - n.getFullHeight() / 2;
                if (tlx < rawMinTLX) rawMinTLX = tlx;
                if (tly < rawMinTLY) rawMinTLY = tly;
            }

            let curMinTLX = Infinity, curMinTLY = Infinity;
            for (const n of connected) {
                const tl = n.getTopLeft();
                if (tl.x < curMinTLX) curMinTLX = tl.x;
                if (tl.y < curMinTLY) curMinTLY = tl.y;
            }

            const targetTLX = _snapTo(curMinTLX, SNAP_SMALL);
            const targetTLY = _snapTo(curMinTLY, SNAP_SMALL);
            const offsetX = targetTLX - rawMinTLX;
            const offsetY = targetTLY - rawMinTLY;

            for (const n of connected) {
                const p = rawPositions.get(n.id);
                const cx = p.x + offsetX;
                const cy = p.y + offsetY;
                const tlx = cx - n.width / 2;
                const tly = cy - n.getFullHeight() / 2;
                n.setTopLeft(_snapTo(tlx, SNAP_SMALL), _snapTo(tly, SNAP_SMALL));
                n.updatedAt = Date.now();
            }

            g._bump();
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Выравнивание');
            this.notify('Выравнивание', `Выровнено нод: ${connected.length}`, 'success');
        }

        clearAll() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g) return;
            g.clear();
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Очистка графа');
            this.notify('Очищено', `Граф среды "${g.env}" очищен`, 'info');
        }

        resetCamera() {
            if (this._isDestroyed) return;
            if (this._camera) this._camera.reset();
            if (this._renderer) this._renderer.markDirty();
        }

        // ============================================================
        // CLIPBOARD
        // ============================================================
        copySelection() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g) return;
            const sel = g.getSelected();
            if (sel.nodes.length === 0 && sel.comments.length === 0) {
                this.notify('Копирование', 'Ничего не выделено', 'info');
                return;
            }

            const ids = new Set(sel.nodes.map(n => n.id));
            const conns = g.connections.filter(c => ids.has(c.fromNodeId) && ids.has(c.toNodeId));

            const comments = sel.comments.slice();
            for (const c of g.comments) {
                if (comments.includes(c)) continue;
                if (sel.nodes.some(n => c.containsNode(n))) comments.push(c);
            }

            this._clipboard = {
                nodes: sel.nodes.map(n => ({ ...n.toJSON(), _oldId: n.id })),
                connections: conns.map(c => c.toJSON()),
                comments: comments.map(c => ({ ...c.toJSON(), _oldId: c.id }))
            };

            const parts = [];
            if (sel.nodes.length) parts.push(`${sel.nodes.length} нод`);
            if (comments.length) parts.push(`${comments.length} коммент.`);
            this.notify('Копирование', `Скопировано: ${parts.join(', ')}`, 'info');
        }

        pasteClipboard() {
            if (this._isDestroyed) return;
            if (!this._clipboard || (!this._clipboard.nodes.length && !this._clipboard.comments?.length)) {
                this.notify('Вставка', 'Буфер пуст', 'warning');
                return;
            }
            const g = this.getActiveGraph();
            if (!g) return;

            const idMap = new Map();
            const newNodes = [];

            for (const n of this._clipboard.nodes) {
                let def = this._loader.findDef(n.defEnv, n.defId) ||
                          this._loader.findDefByFile(n.defEnv, n.defFile);
                if (!def && this._activeEnv) {
                    def = this._loader.findDef(this._activeEnv, n.defId) ||
                          this._loader.findDefByFile(this._activeEnv, n.defFile);
                }
                if (!def) continue;

                const inst = g.addNode(def, n.x + PASTE_OFFSET, n.y + PASTE_OFFSET);
                if (typeof n.width === 'number') {
                    inst.width = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, n.width));
                }
                if (n.paramValues && typeof n.paramValues === 'object') {
                    inst.paramValues = Object.assign({}, inst.paramValues, n.paramValues);
                }
                if (Array.isArray(n.expandedCategories)) {
                    inst._expandedCategories = new Set(n.expandedCategories);
                }
                idMap.set(n._oldId, inst);
                newNodes.push(inst);
            }

            for (const c of this._clipboard.connections) {
                const from = idMap.get(c.fromNodeId);
                const to = idMap.get(c.toNodeId);
                if (!from || !to) continue;
                const res = g.addConnection(from.id, c.fromPortId, to.id, c.toPortId);
                if (res.conn && Array.isArray(c.waypoints)) {
                    for (const w of c.waypoints) {
                        if (w && typeof w.x === 'number' && typeof w.y === 'number') {
                            g.addWaypoint(res.conn.id, w.x + PASTE_OFFSET, w.y + PASTE_OFFSET);
                        }
                    }
                }
            }

            const newComments = [];
            if (Array.isArray(this._clipboard.comments)) {
                for (const cm of this._clipboard.comments) {
                    const norm = _normalizeCommentData(cm);
                    const com = g.addComment(
                        norm.x + PASTE_OFFSET, norm.y + PASTE_OFFSET,
                        norm.width, norm.height, norm.text
                    );
                    if (norm.headerHeight != null) com.headerHeight = norm.headerHeight;
                    newComments.push(com);
                }
            }

            g.deselect();
            const newIds = [...newNodes.map(n => n.id), ...newComments.map(c => c.id)];
            if (newIds.length) g.select(newIds);
            if (this._renderer) this._renderer.markDirty();
            this._saveAndRecord('Вставка');
        }

        duplicateSelection() {
            if (this._isDestroyed) return;
            const backup = this._clipboard;
            try {
                this.copySelection();
                this.pasteClipboard();
            } finally {
                this._clipboard = backup;
            }
        }

        // ============================================================
        // ZOOM
        // ============================================================
        _computeContentBounds(items) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const it of items) {
                const b = it.getBounds();
                if (b.minX < minX) minX = b.minX;
                if (b.minY < minY) minY = b.minY;
                if (b.maxX > maxX) maxX = b.maxX;
                if (b.maxY > maxY) maxY = b.maxY;
            }
            return { minX, minY, maxX, maxY };
        }

        _zoomToBounds(bounds) {
            const { minX, minY, maxX, maxY } = bounds;
            const vw = this._camera.viewportWidth;
            const vh = this._camera.viewportHeight;
            if (vw <= 0 || vh <= 0) return;

            const contentW = (maxX - minX) + ZOOM_TO_FIT_PADDING * 2;
            const contentH = (maxY - minY) + ZOOM_TO_FIT_PADDING * 2;
            const g2d = this.utils.graph2d;
            const targetZoom = _clamp(Math.min(vw / contentW, vh / contentH), g2d.ZOOM_MIN, g2d.ZOOM_MAX);
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;

            this._camera.stopAnimation();
            this._camera.velocityX = 0;
            this._camera.velocityY = 0;
            this._camera.velocityZoom = 0;

            this._camera.zoomToCenter(targetZoom, false);
            this._camera.moveCenterTo(cx, cy, true);
            this._renderer.markDirty();
        }

        zoomToFit() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g || !this._camera) return;
            const items = [...g.nodes, ...g.comments];
            if (items.length === 0) { this._camera.reset(); return; }
            this._zoomToBounds(this._computeContentBounds(items));
        }

        zoomToSelection() {
            if (this._isDestroyed) return;
            const g = this.getActiveGraph();
            if (!g || !this._camera) return;
            const sel = g.getSelected();
            const items = [...sel.nodes, ...sel.comments];
            if (items.length === 0) { this.zoomToFit(); return; }
            this._zoomToBounds(this._computeContentBounds(items));
        }

        // ============================================================
        // SEARCH
        // ============================================================
        toggleSearch() {
            if (this._isDestroyed) return;
            if (this._searchActive) this._closeSearch();
            else this._openSearch();
        }

        _openSearch() {
            if (!this._searchEl) return;
            this._searchActive = true;
            this._searchEl.style.display = 'block';
            this._searchEl.focus();
            this._searchEl.select();
        }

        _closeSearch() {
            if (!this._searchEl) return;
            this._searchActive = false;
            this._searchEl.style.display = 'none';
            this._searchEl.value = '';
            try { this._searchEl.blur(); } catch (e) {}
            this._searchQuery = '';
            this._searchMatches = [];
            this._searchIndex = 0;
            const g = this.getActiveGraph();
            if (g) for (const n of g.nodes) n._searchMatch = false;
            if (this._renderer) {
                this._renderer.setSearch('', new Set(), null);
                this._renderer.markDirty();
            }
        }

        _onSearchInput() {
            const q = (this._searchEl.value || '').trim().toLowerCase();
            this._searchQuery = q;
            const g = this.getActiveGraph();
            if (!g) return;

            if (!q) {
                for (const n of g.nodes) n._searchMatch = false;
                this._searchMatches = [];
                this._searchIndex = 0;
                this._renderer.setSearch('', new Set(), null);
                this._renderer.markDirty();
                return;
            }

            const matches = [];
            for (const n of g.nodes) {
                const title = (n.title || '').toLowerCase();
                const id = n.def ? (n.def.id || '').toLowerCase() : '';
                const file = n.def ? (n.def.file || '').toLowerCase() : '';
                const isMatch = title.includes(q) || id.includes(q) || file.includes(q);
                n._searchMatch = isMatch;
                if (isMatch) matches.push(n.id);
            }
            this._searchMatches = matches;
            this._searchIndex = matches.length > 0 ? 0 : -1;

            this._renderer.setSearch(q, new Set(matches), this._searchIndex >= 0 ? matches[this._searchIndex] : null);
            this._renderer.markDirty();
            if (this._searchIndex >= 0) this._focusSearchMatch();
        }

        _searchNext(dir) {
            if (this._searchMatches.length === 0) return;
            this._searchIndex = (this._searchIndex + dir + this._searchMatches.length) % this._searchMatches.length;
            this._renderer.setSearch(this._searchQuery, new Set(this._searchMatches), this._searchMatches[this._searchIndex]);
            this._renderer.markDirty();
            this._focusSearchMatch();
        }

        _focusSearchMatch() {
            const g = this.getActiveGraph();
            if (!g) return;
            const id = this._searchMatches[this._searchIndex];
            const n = g.getNode(id);
            if (!n) return;
            this._camera.moveCenterTo(n.x, n.y, true);
        }

        // ============================================================
        // IMPORT / EXPORT (manual)
        // ============================================================
        importFile() {
            if (this._isDestroyed) return;
            this.utils.file.openJSON((parsed) => {
                if (this._isDestroyed) return;
                if (!parsed) { this.notify('Импорт', 'Не удалось прочитать файл', 'error'); return; }
                if (this.onImport(parsed)) {
                    this._saveAndRecord('Импорт графа');
                    this.notify('Импорт', 'Граф загружен', 'success');
                } else {
                    this.notify('Импорт', 'Формат не распознан', 'warning');
                }
            }, '.json');
        }

        exportFile() {
            if (this._isDestroyed) return;
            const payload = this.onExport();
            const name = `nodegraph_${new Date().toISOString().slice(0, 10)}.json`;
            if (this.utils.file.saveJSON(name, payload)) {
                this.notify('Экспорт', 'JSON сохранён', 'success');
            } else {
                this.notify('Экспорт', 'Ошибка сохранения', 'error');
            }
        }

        // ============================================================
        // PHYSICS LOOP
        // ============================================================
        _startPhysicsLoop() {
            if (this._loopId !== null) return;
            this._lastLoopTime = performance.now();
            this._physicsLoop();
        }

        _physicsLoop() {
            if (this._isDestroyed) { this._loopId = null; return; }
            const now = performance.now();
            const delta = Math.min((now - this._lastLoopTime) / 1000, 0.05);
            this._lastLoopTime = now;
            if (this._camera) this._camera.update(delta);
            this._loopId = requestAnimationFrame(() => this._physicsLoop());
        }

        // ============================================================
        // STATE
        // ============================================================
        getState() {
            return {
                viewState: this._camera
                    ? { x: this._camera.x, y: this._camera.y, zoom: this._camera.zoom }
                    : { x: 0, y: 0, zoom: 1.0 },
                activeEnv: this._activeEnv,
                envStack: this._envStack.slice()
            };
        }

        setState(state) {
            if (!state) return this;
            if (state.viewState && this._camera) {
                this._camera.x = state.viewState.x || 0;
                this._camera.y = state.viewState.y || 0;
                this._camera.zoom = _clamp(state.viewState.zoom || 1.0, this.utils.graph2d.ZOOM_MIN, this.utils.graph2d.ZOOM_MAX);
                this._camera.invalidateCache();
            }
            if (state.activeEnv && this._graphs[state.activeEnv]) {
                this._activeEnv = state.activeEnv;
                this._bindActiveGraph();
            }
            if (Array.isArray(state.envStack)) this._envStack = state.envStack.slice();
            if (this._renderer) this._renderer.markDirty();
            return this;
        }

        // ============================================================
        // CONTEXT MENU
        // ============================================================
        _addWaypointFromHit(connHit, worldPoint) {
            const g = this.getActiveGraph();
            if (!g) return;
            const insertIndex = this._input ? this._input._computeInsertIndex(connHit) : -1;
            g.addWaypoint(connHit.conn.id, worldPoint.x, worldPoint.y, insertIndex);
            this._saveAndRecord('Добавлена точка излома');
            this._renderer.markDirty();
        }

        _showContextMenu(clientX, clientY) {
            if (this._isDestroyed || !this._canvas) return;
            const g = this.getActiveGraph();
            if (!g) return;

            const rect = this._canvas.getBoundingClientRect();
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            const world = this._camera.screenToWorld(localX, localY);

            const node = g.getNodeAt(world.x, world.y);
            const comment = g.getCommentAt(world.x, world.y);
            const commentHeaderHit = comment ? comment.containsHeader(world.x, world.y) : false;
            const connHit = g.getConnectionAt(world.x, world.y, CONNECTION_HIT_THRESHOLD / this._camera.zoom);

            const items = [
                {
                    icon: 'icon-plus',
                    label: 'Add',
                    shortcut: 'Ctrl+N',
                    onClick: () => this.openAddPanelAtCursor(clientX, clientY)
                },
                {
                    icon: 'icon-bookmark',
                    label: 'Пресеты...',
                    onClick: () => this.openPresetsPanelAtCursor(clientX, clientY)
                },
                {
                    icon: 'icon-plus-circle',
                    label: 'Добавить комментарий',
                    shortcut: 'C',
                    onClick: () => {
                        const w = this._camera.screenToWorld(localX, localY);
                        const c = g.addComment(w.x, w.y, 240, 140, `Comment ${g.comments.length + 1}`);
                        g.select(c.id);
                        this._saveAndRecord('Добавлен комментарий');
                        this._renderer.markDirty();
                    }
                }
            ];

            const sel = g.getSelected();
            if (sel.nodes.length > 1) {
                items.push({
                    icon: 'icon-align',
                    label: 'Выровнять выделенные',
                    shortcut: 'Q',
                    onClick: () => this.alignNodes()
                });
            }
            if (sel.nodes.length > 0 || sel.comments.length > 0) {
                items.push({
                    icon: 'icon-check',
                    label: 'Выбрать всё',
                    shortcut: 'Ctrl+A',
                    onClick: () => this.selectAll()
                });
            }
            if (this._clipboard && ((this._clipboard.nodes && this._clipboard.nodes.length > 0) ||
                                    (this._clipboard.comments && this._clipboard.comments.length > 0))) {
                items.push({
                    icon: 'icon-paste',
                    label: 'Вставить',
                    shortcut: 'Ctrl+V',
                    onClick: () => this.pasteClipboard()
                });
            }

            items.push({ divider: true });

            if (this._activeEnv) {
                items.push({
                    icon: 'icon-arrow-left',
                    label: 'Назад',
                    onClick: () => this.navBack()
                });
                items.push({ divider: true });
            }

            items.push(
                { icon: 'icon-zoom-in', label: 'Zoom to fit', shortcut: 'Shift+F', onClick: () => this.zoomToFit() },
                { icon: 'icon-refresh', label: 'Сброс камеры', onClick: () => this.resetCamera() },
                { icon: 'icon-search', label: 'Найти узел', shortcut: 'Ctrl+F', onClick: () => this.toggleSearch() },
                { divider: true },
                { icon: 'icon-clear', label: 'Очистить всё', danger: true, onClick: () => this.clearAll() }
            );

            if (node && !commentHeaderHit) {
                items.push({ divider: true });
                items.push({ header: 'Узел: ' + (node.title || node.id) });

                if (node.hasCompute()) {
                    items.push(
                        { icon: 'icon-play', label: 'Run', onClick: () => this.runNode(node) },
                        {
                            icon: 'icon-refresh',
                            label: 'Сбросить кэш',
                            onClick: () => {
                                node.invalidateResult();
                                g._bump();
                                if (this._renderer) this._renderer.markDirty();
                                this.notify('Кэш', `"${node.title}" сброшен`, 'info');
                            }
                        }
                    );
                }
                if (node.def && node.def.drillDown) {
                    items.push({
                        icon: 'icon-arrow-right',
                        label: `Перейти в "${node.def.drillDown}"`,
                        onClick: () => this.navigateTo(node.def.drillDown)
                    });
                }
                items.push(
                    { icon: 'icon-edit', label: 'Свойства', onClick: () => this.openPropertiesFor(node) },
                    {
                        icon: 'icon-copy',
                        label: 'Копировать',
                        shortcut: 'Ctrl+C',
                        onClick: () => {
                            if (!g.isSelected(node.id)) { g.deselect(); g.select(node.id); }
                            this.copySelection();
                        }
                    },
                    {
                        icon: 'icon-refresh',
                        label: 'Дублировать',
                        shortcut: 'Ctrl+D',
                        onClick: () => {
                            if (!g.isSelected(node.id)) { g.deselect(); g.select(node.id); }
                            this.duplicateSelection();
                        }
                    },
                    {
                        icon: 'icon-trash',
                        label: 'Удалить узел',
                        danger: true,
                        shortcut: 'Del',
                        onClick: () => {
                            g.removeNode(node.id);
                            this._saveAndRecord('Удаление узла');
                            this._renderer.markDirty();
                        }
                    }
                );
            } else if (comment) {
                items.push({ divider: true });
                items.push({ header: 'Комментарий' });
                items.push(
                    { icon: 'icon-edit', label: 'Редактировать название', onClick: () => this.editComment(comment) },
                    {
                        icon: 'icon-trash',
                        label: 'Удалить комментарий',
                        danger: true,
                        onClick: () => {
                            g.removeComment(comment.id);
                            this._saveAndRecord('Удаление комментария');
                            this._renderer.markDirty();
                        }
                    }
                );
            } else if (connHit) {
                items.push({ divider: true });
                items.push({ header: 'Соединение' });
                items.push(
                    {
                        icon: 'icon-plus',
                        label: 'Добавить точку излома',
                        onClick: () => this._addWaypointFromHit(connHit, connHit.point)
                    },
                    {
                        icon: 'icon-trash',
                        label: 'Удалить связь',
                        danger: true,
                        onClick: () => {
                            g.removeConnection(connHit.conn.id);
                            this._saveAndRecord('Удаление связи');
                            this._renderer.markDirty();
                        }
                    }
                );
            }

            this.ui.contextMenu({ items, x: clientX, y: clientY, width: 260 });
        }

        // ============================================================
        // HEADER PANEL TRIGGERS (open at cursor)
        // ============================================================
        openAddPanelAtCursor(value, payload) {
            if (this._isDestroyed) return;
            const { clientX, clientY } = this._resolveCursor(value, payload);
            const cats = this._buildAddCategories();
            if (cats.length === 0) {
                this.notify('Add', 'В текущей среде нет доступных нод', 'warning');
                return;
            }
            const panel = this.ui.categoryPanel({ headless: true, categories: cats });
            panel.openAt(clientX, clientY);
        }

        openPresetsPanelAtCursor(value, payload) {
            if (this._isDestroyed) return;
            const { clientX, clientY } = this._resolveCursor(value, payload);
            const items = this._buildPresetsItems();
            if (items.length === 0) {
                this.notify('Пресеты', 'Нет пресетов для этой среды', 'warning');
                return;
            }
            const panel = this.ui.listPanel({ headless: true, items });
            panel.openAt(clientX, clientY);
        }

        _resolveCursor(value, payload) {
            if (typeof value === 'number' && typeof payload === 'number') {
                return { clientX: value, clientY: payload };
            }
            const rect = this._canvas ? this._canvas.getBoundingClientRect() : null;
            if (rect) {
                const mx = this._lastMouse ? this._lastMouse.x : rect.width / 2;
                const my = this._lastMouse ? this._lastMouse.y : rect.height / 2;
                return { clientX: rect.left + mx, clientY: rect.top + my };
            }
            return { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    function registerNodeGraphWindow(registry) {
        if (!registry) { _err('[NodeGraphWindow] registry required'); return false; }
        if (registry.getType('nodegraph')) return false;
        return registry.registerFromClass(NodeGraphWindow);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            NodeGraphWindow, ThemeAdapter, EnvRegistry,
            NodeDef, NodeLoader, EnvGraph, NodeInstance, Connection, Comment,
            Renderer, InputManager, ComputeContext,
            registerNodeGraphWindow
        };
    }
    if (typeof window !== 'undefined') {
        window.NodeGraphWindow = NodeGraphWindow;
        window.ComputeContext = ComputeContext;
        window.registerNodeGraphWindow = registerNodeGraphWindow;
        _log('[NodeGraphWindow] Registered class globally v8.0.0');
    }
})();