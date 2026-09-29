// core/LayoutManager.js
// Версия 10.1.0

(function() {
    'use strict';

    var NodeType = { LEAF: 'leaf', SPLIT: 'split' };
    var SplitDirection = { HORIZONTAL: 'horizontal', VERTICAL: 'vertical' };

    var LayoutStyle = {
        TWO_HORIZONTAL: 'two-horizontal',
        TWO_VERTICAL: 'two-vertical',
        THREE_HORIZONTAL: 'three-horizontal',
        THREE_VERTICAL: 'three-vertical',
        THREE_BIG_LEFT: 'three-big-left',
        THREE_BIG_RIGHT: 'three-big-right',
        THREE_BIG_TOP: 'three-big-top',
        THREE_BIG_BOTTOM: 'three-big-bottom',
        FOUR_GRID_2X2: 'four-grid-2x2',
        FOUR_HORIZONTAL: 'four-horizontal',
        FOUR_VERTICAL: 'four-vertical',
        FOUR_BIG_LEFT: 'four-big-left',
        FOUR_BIG_RIGHT: 'four-big-right',
        FOUR_BIG_TOP: 'four-big-top',
        FOUR_BIG_BOTTOM: 'four-big-bottom',
        FOUR_MIXED: 'four-mixed'
    };

    var DIVIDER_SIZE = 4;

    var DEFAULT_STYLE_FOR_COUNT = {
        2: LayoutStyle.TWO_HORIZONTAL,
        3: LayoutStyle.THREE_BIG_LEFT,
        4: LayoutStyle.FOUR_GRID_2X2
    };

    var _idCounter = 0;
    function generateId() { return ++_idCounter; }
    function setIdFloor(v) {
        if (typeof v === 'number' && v >= _idCounter) _idCounter = v + 1;
    }

    function isPositiveNumber(v) {
        return typeof v === 'number' && isFinite(v) && v > 0;
    }

    function normalizeRatios(arr) {
        if (!Array.isArray(arr)) return null;
        if (arr.length === 0) return null;

        var cleaned = [];
        for (var i = 0; i < arr.length; i++) {
            if (!isPositiveNumber(arr[i])) return null;
            cleaned.push(arr[i]);
        }

        var sum = 0;
        for (var j = 0; j < cleaned.length; j++) sum += cleaned[j];
        if (sum <= 0) return null;

        var out = [];
        for (var k = 0; k < cleaned.length; k++) out.push(cleaned[k] / sum);
        return out;
    }

    class LayoutNode {
        constructor(opts) {
            opts = opts || {};
            this.id = opts.id || generateId();
            this.type = opts.type || NodeType.LEAF;
            this.direction = opts.direction || null;
            this.ratio = opts.ratio || 0.5;
            this.ratios = Array.isArray(opts.ratios) ? opts.ratios.slice() : null;
            this.children = opts.children || [];
            this.windowData = opts.windowData || null;
            this.parent = null;
        }

        isLeaf()  { return this.type === NodeType.LEAF; }
        isSplit() { return this.type === NodeType.SPLIT; }

        addChild(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            const i = this.children.indexOf(child);
            if (i === -1) return false;
            this.children.splice(i, 1);
            child.parent = null;
            return true;
        }

        getLeafCount() {
            if (this.isLeaf()) return 1;
            let sum = 0;
            for (let i = 0; i < this.children.length; i++) {
                sum += this.children[i].getLeafCount();
            }
            return sum;
        }

        getLeaves() {
            if (this.isLeaf()) return [this];
            const out = [];
            for (let i = 0; i < this.children.length; i++) {
                const sub = this.children[i].getLeaves();
                for (let j = 0; j < sub.length; j++) out.push(sub[j]);
            }
            return out;
        }

        findLeafByWindowId(id) {
            const target = String(id);
            if (this.isLeaf()) {
                return (this.windowData && String(this.windowData.id) === target)
                    ? this : null;
            }
            for (let i = 0; i < this.children.length; i++) {
                const found = this.children[i].findLeafByWindowId(target);
                if (found) return found;
            }
            return null;
        }

        toJSON() {
            const children = [];
            for (let i = 0; i < this.children.length; i++) {
                children.push(this.children[i].toJSON());
            }
            return {
                id: this.id,
                type: this.type,
                direction: this.direction,
                ratio: this.ratio,
                ratios: this.ratios ? this.ratios.slice() : null,
                windowData: this.windowData ? {
                    id: this.windowData.id,
                    type: this.windowData.type,
                    title: this.windowData.title,
                    icon: this.windowData.icon,
                    slotId: this.windowData.slotId || null
                } : null,
                children: children
            };
        }

        static fromJSON(data) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return new LayoutNode({ type: NodeType.LEAF, windowData: null });
            }

            var type = (data.type === NodeType.SPLIT) ? NodeType.SPLIT : NodeType.LEAF;
            var id = (typeof data.id === 'number' && isFinite(data.id)) ? data.id : undefined;

            var direction = null;
            if (data.direction === SplitDirection.HORIZONTAL ||
                data.direction === SplitDirection.VERTICAL) {
                direction = data.direction;
            }

            var ratio = (isPositiveNumber(data.ratio) && data.ratio < 1) ? data.ratio : 0.5;
            var ratios = normalizeRatios(data.ratios);

            var windowData = null;
            if (type === NodeType.LEAF && data.windowData && typeof data.windowData === 'object') {
                windowData = {
                    id: data.windowData.id,
                    type: data.windowData.type,
                    title: data.windowData.title,
                    icon: data.windowData.icon,
                    slotId: data.windowData.slotId || null
                };
            }

            var node = new LayoutNode({
                type: type,
                id: id,
                direction: direction,
                ratio: ratio,
                ratios: ratios,
                windowData: windowData
            });

            var children = Array.isArray(data.children) ? data.children : [];
            for (var i = 0; i < children.length; i++) {
                var child = LayoutNode.fromJSON(children[i]);
                child.parent = node;
                node.children.push(child);
            }

            return node;
        }
    }

    function leafFromWindow(w) {
        return new LayoutNode({
            type: NodeType.LEAF,
            windowData: {
                id: w.id,
                type: w.type,
                title: w.title,
                icon: w.icon,
                slotId: w.slotId || null
            },
            id: w.nodeId || generateId()
        });
    }

    function cloneWindowData(w) {
        return {
            id: w.id,
            type: w.type,
            title: w.title,
            icon: w.icon,
            slotId: w.slotId || null
        };
    }

    class LayoutManager {
        constructor(options) {
            options = options || {};

            this.root = null;
            this.workspace = options.workspace || null;
            this.maxWindows = options.maxWindows || 4;
            this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;

            this._windowIdCounter = 0;
            this._domMap = new Map();
            this._windowMap = new Map();
            this._windowInstances = new Map();

            this._registry = options.registry || null;
            this._focusedWindowId = null;
            this._dataBus = options.dataBus || null;
            this._eventBus = options.eventBus || null;
            this._messageBus = options.messageBus || null;

            this._minimizedWindowsData = new Map();
            this._fullscreenWindowId = null;

            this._resizeRAF = null;
            this._resizeFallbackTimer = null;

            this._contentRenderers = new Map();

            this._activeDividerDrag = null;

            this._projectListeners = [];
        }

        // ============================================================
        // 1. EVENT BUS HELPERS
        // ============================================================

        _busEmit(event, detail) {
            if (window.eventBus && typeof window.eventBus.emit === 'function') {
                try { window.eventBus.emit(event, detail); } catch (e) {}
            }
        }

        // ============================================================
        // 2. REGISTER CONTENT RENDERER
        // ============================================================

        registerContentRenderer(typeId, renderer) {
            this._contentRenderers.set(typeId, renderer);
        }

        // ============================================================
        // 3. INIT
        // ============================================================

        init() {
            if (!this.workspace) {
                console.error('[LayoutManager] Workspace not provided');
                return false;
            }

            this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            this._setupProjectListeners();
            this.render();
            return true;
        }

        _setupProjectListeners() {
            var self = this;

            var onGetLayout = function(e) {
                if (e.detail && typeof e.detail.respond === 'function') {
                    e.detail.respond(self.getProjectData());
                }
            };

            var onGetStyle = function(e) {
                if (e.detail && typeof e.detail.respond === 'function') {
                    e.detail.respond(self.getCurrentStyle());
                }
            };

            var onRestore = function(e) {
                if (!e.detail) return;
                var layoutData = e.detail.layoutData;
                var layoutStyle = e.detail.layoutStyle;

                if (layoutStyle) self.currentLayoutStyle = layoutStyle;

                if (layoutData) {
                    self.loadProjectData(layoutData);
                    self.render();
                    self._scheduleResize();
                } else {
                    self.render();
                }
            };

            document.addEventListener('project-get-layout', onGetLayout);
            document.addEventListener('project-get-layout-style', onGetStyle);
            document.addEventListener('project-restore-layout', onRestore);

            this._projectListeners.push(function() {
                document.removeEventListener('project-get-layout', onGetLayout);
                document.removeEventListener('project-get-layout-style', onGetStyle);
                document.removeEventListener('project-restore-layout', onRestore);
            });
        }

        // ============================================================
        // 4. DESTROY
        // ============================================================

        destroy() {
            this._cancelActiveDividerDrag();
            this.exitFullscreen(true);

            if (this._resizeRAF) {
                cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = null;
            }
            if (this._resizeFallbackTimer) {
                clearTimeout(this._resizeFallbackTimer);
                this._resizeFallbackTimer = null;
            }

            for (var i = 0; i < this._projectListeners.length; i++) {
                try { this._projectListeners[i](); } catch (e) {}
            }
            this._projectListeners = [];

            this._windowInstances.forEach(function(instance) {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();
            this._domMap.clear();
            this._windowMap.clear();
            this._minimizedWindowsData.clear();
            this.root = null;
        }

        _cancelActiveDividerDrag() {
            if (!this._activeDividerDrag) return;

            var d = this._activeDividerDrag;

            try { document.removeEventListener('mousemove', d.onMove); } catch (e) {}
            try { document.removeEventListener('mouseup', d.onUp); } catch (e) {}
            try { document.removeEventListener('pointercancel', d.onUp); } catch (e) {}
            try { window.removeEventListener('blur', d.onUp); } catch (e) {}

            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            this._activeDividerDrag = null;
        }

        // ============================================================
        // 5. QUERIES — WINDOWS
        // ============================================================

        getWindows() {
            var result = [];

            if (this.root) {
                var leaves = this.root.getLeaves();
                for (var i = 0; i < leaves.length; i++) {
                    var node = leaves[i];
                    if (!node.windowData) continue;
                    result.push({
                        id: node.windowData.id,
                        type: node.windowData.type,
                        title: node.windowData.title,
                        icon: node.windowData.icon,
                        slotId: node.windowData.slotId || null,
                        nodeId: node.id,
                        node: node,
                        minimized: false
                    });
                }
            }

            this._minimizedWindowsData.forEach(function(data, id) {
                result.push({
                    id: data.id,
                    type: data.type,
                    title: data.title,
                    icon: data.icon,
                    slotId: data.slotId || null,
                    nodeId: null,
                    node: null,
                    minimized: true
                });
            });

            return result;
        }

        getVisibleWindows() {
            if (!this.root) return [];
            var result = [];
            var leaves = this.root.getLeaves();
            for (var i = 0; i < leaves.length; i++) {
                var node = leaves[i];
                if (!node.windowData) continue;
                result.push({
                    id: node.windowData.id,
                    type: node.windowData.type,
                    title: node.windowData.title,
                    icon: node.windowData.icon,
                    slotId: node.windowData.slotId || null,
                    nodeId: node.id,
                    node: node,
                    minimized: false
                });
            }
            return result;
        }

        getMinimizedWindows() {
            var result = [];
            this._minimizedWindowsData.forEach(function(data, id) {
                result.push({
                    id: data.id,
                    type: data.type,
                    title: data.title,
                    icon: data.icon,
                    slotId: data.slotId || null,
                    nodeId: null,
                    node: null,
                    minimized: true
                });
            });
            return result;
        }

        getVisibleWindowsByType(typeId) {
            if (!typeId) return [];
            return this.getVisibleWindows().filter(function(w) { return w.type === typeId; });
        }

        getMinimizedWindowsByType(typeId) {
            if (!typeId) return [];
            return this.getMinimizedWindows().filter(function(w) { return w.type === typeId; });
        }

        getWindowCount() {
            return this.getVisibleWindows().length + this._minimizedWindowsData.size;
        }

        getVisibleWindowCount() {
            return this.getVisibleWindows().length;
        }

        getNodeByWindowId(id) {
            if (!this.root) return null;
            return this.root.findLeafByWindowId(id);
        }

        getInstance(id) {
            var bw = this._windowInstances.get(String(id)) || null;
            if (!bw) return null;
            return typeof bw.getRealInstance === 'function' ? bw.getRealInstance() : null;
        }

        getBaseWindow(id) {
            return this._windowInstances.get(String(id)) || null;
        }

        hasInstance(id) {
            return this._windowInstances.has(String(id));
        }

        getWindowElement(nodeId) {
            return this._domMap.get(nodeId) || null;
        }

        getWindowsByType(typeId) {
            return this.getWindows().filter(function(w) { return w.type === typeId; });
        }

        // ============================================================
        // 6. FOCUS
        // ============================================================

        setFocusedWindow(windowId) {
            var wid = windowId != null ? String(windowId) : null;
            if (wid === this._focusedWindowId) return;

            var prev = this._focusedWindowId;
            this._focusedWindowId = wid;

            if (window.hotkeyRegistry) {
                window.hotkeyRegistry.setFocusedWindow(wid);
            }

            if (prev) {
                var prevBw = this._windowInstances.get(prev);
                if (prevBw && typeof prevBw._onBlur === 'function') {
                    try { prevBw._onBlur(); } catch (e) {}
                }
            }

            if (wid) {
                var bw = this._windowInstances.get(wid);
                if (bw && typeof bw._onFocus === 'function') {
                    try { bw._onFocus(); } catch (e) {}
                }
            }

            this._emitLayoutAction('focus', { prevId: prev, focusedId: wid });
        }

        getFocusedWindow() {
            return this._focusedWindowId;
        }

        // ============================================================
        // 7. MINIMIZE
        // ============================================================

        minimizeWindow(windowId) {
            var sid = String(windowId);
            if (this._minimizedWindowsData.has(sid)) return true;

            var node = this.getNodeByWindowId(sid);
            if (!node || !node.windowData) {
                console.warn('[LayoutManager] minimizeWindow: node not found:', sid);
                return false;
            }

            if (this._fullscreenWindowId === sid) {
                this.exitFullscreen(true);
            }

            var data = cloneWindowData(node.windowData);
            this._minimizedWindowsData.set(sid, data);

            var container = this._domMap.get(node.id);
            var self = this;
            var ANIM_MS = 220;

            var finish = function() {
                var remaining = self.getVisibleWindows()
                    .filter(function(w) { return String(w.id) !== sid; })
                    .map(function(w) {
                        return {
                            id: w.id,
                            type: w.type,
                            title: w.title,
                            icon: w.icon,
                            slotId: w.slotId,
                            nodeId: w.nodeId
                        };
                    });

                self._rebuildFromVisible(remaining);

                if (self._focusedWindowId === sid) {
                    var vis = self.getVisibleWindows();
                    var next = vis.length > 0 ? vis[0].id : null;
                    self.setFocusedWindow(next);
                }

                self.render();
                self._notifyChange();

                self._emitLayoutAction('minimize', {
                    id: sid,
                    type: data.type,
                    slotId: data.slotId
                });
                self._emitVisibilityChanged(sid, false);
            };

            if (container) {
                container.classList.add('ls-minimizing');

                var done = false;
                var onEnd = function() {
                    if (done) return;
                    done = true;
                    container.removeEventListener('animationend', onEnd);
                    finish();
                };
                container.addEventListener('animationend', onEnd);
                setTimeout(onEnd, ANIM_MS + 80);
            } else {
                finish();
            }

            return true;
        }

        restoreWindow(windowId) {
            var sid = String(windowId);

            if (!this._minimizedWindowsData.has(sid)) return false;

            if (this.getVisibleWindowCount() >= this.maxWindows) {
                console.warn('[LayoutManager] restoreWindow: max visible windows reached');
                return false;
            }

            var data = this._minimizedWindowsData.get(sid);
            this._minimizedWindowsData.delete(sid);

            var visible = this._collectVisibleAsPlain();
            visible.push({
                id: data.id,
                type: data.type,
                title: data.title,
                icon: data.icon,
                slotId: data.slotId
            });

            this._rebuildFromVisible(visible);

            this.render();
            this._notifyChange();

            this._emitLayoutAction('restore', {
                id: sid,
                type: data.type,
                slotId: data.slotId
            });
            this._emitVisibilityChanged(sid, true);

            this.setFocusedWindow(sid);
            return true;
        }

        isMinimized(windowId) {
            return this._minimizedWindowsData.has(String(windowId));
        }

        // ============================================================
        // 8. FULLSCREEN
        // ============================================================

        setFullscreen(windowId) {
            var sid = String(windowId);

            if (this.isMinimized(sid)) {
                console.warn('[LayoutManager] setFullscreen: window is minimized');
                return false;
            }

            var node = this.getNodeByWindowId(sid);
            if (!node) {
                console.warn('[LayoutManager] setFullscreen: node not found:', sid);
                return false;
            }

            if (this._fullscreenWindowId === sid) return true;

            if (this._fullscreenWindowId) {
                this.exitFullscreen(true);
            }

            this._fullscreenWindowId = sid;

            var bw = this._windowInstances.get(sid);
            var rootEl = bw && bw.getRenderWindow && bw.getRenderWindow()
                ? bw.getRenderWindow().getRoot()
                : null;
            var container = this._domMap.get(node.id);

            var flipX = 1, flipY = 1;
            if (rootEl) {
                var before = rootEl.getBoundingClientRect();
                var winW = window.innerWidth || 1920;
                var winH = window.innerHeight || 1080;
                flipX = winW / Math.max(1, before.width);
                flipY = winH / Math.max(1, before.height);
            }

            if (container) container.classList.add('ls-fullscreen-target');
            document.body.classList.add('ls-fullscreen');
            document.documentElement.classList.add('ls-fullscreen-root');

            if (rootEl && rootEl.requestFullscreen) {
                rootEl.requestFullscreen().catch(function(err) {
                    console.warn('[LayoutManager] Fullscreen API error:', err);
                });
            }

            if (rootEl) {
                rootEl.classList.remove('ls-flip-out');
                rootEl.style.setProperty(
                    '--ls-flip-from',
                    'scale(' + (1 / flipX).toFixed(4) + ', ' + (1 / flipY).toFixed(4) + ')'
                );
                void rootEl.offsetWidth;
                rootEl.classList.add('ls-flip-in');

                setTimeout(function() {
                    try { rootEl.classList.remove('ls-flip-in'); } catch (e) {}
                    rootEl.style.removeProperty('--ls-flip-from');
                }, 360);
            }

            this._notifyChange();
            this._emitLayoutAction('fullscreen', {
                id: sid,
                type: node.windowData ? node.windowData.type : 'unknown'
            });
            return true;
        }

        exitFullscreen(silent) {
            if (!this._fullscreenWindowId) return false;

            var prevId = this._fullscreenWindowId;
            this._fullscreenWindowId = null;

            var node = this.getNodeByWindowId(prevId);
            var bw = node ? this._windowInstances.get(prevId) : null;
            var rootEl = bw && bw.getRenderWindow && bw.getRenderWindow()
                ? bw.getRenderWindow().getRoot()
                : null;
            var container = node ? this._domMap.get(node.id) : null;

            var flipX = 1, flipY = 1;
            if (rootEl) {
                var before = rootEl.getBoundingClientRect();
                var winW = window.innerWidth || 1920;
                var winH = window.innerHeight || 1080;
                flipX = winW / Math.max(1, before.width);
                flipY = winH / Math.max(1, before.height);
            }

            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(function(err) {
                    console.warn('[LayoutManager] exitFullscreen error:', err);
                });
            }

            document.body.classList.remove('ls-fullscreen');
            document.documentElement.classList.remove('ls-fullscreen-root');
            if (container) container.classList.remove('ls-fullscreen-target');

            if (rootEl) {
                rootEl.classList.remove('ls-flip-in');
                rootEl.style.setProperty(
                    '--ls-flip-to',
                    'scale(' + flipX.toFixed(4) + ', ' + flipY.toFixed(4) + ')'
                );
                void rootEl.offsetWidth;
                rootEl.classList.add('ls-flip-out');

                setTimeout(function() {
                    try { rootEl.classList.remove('ls-flip-out'); } catch (e) {}
                    rootEl.style.removeProperty('--ls-flip-to');
                }, 320);
            }

            this._notifyChange();

            if (!silent) {
                this._emitLayoutAction('fullscreen-exit', {
                    id: prevId,
                    type: node && node.windowData ? node.windowData.type : 'unknown'
                });
            }
            return true;
        }

        getFullscreenWindow() { return this._fullscreenWindowId; }

        isFullscreen(windowId) {
            if (windowId == null) return !!this._fullscreenWindowId;
            return this._fullscreenWindowId === String(windowId);
        }

        // ============================================================
        // 9. SLOT RESOLUTION
        // ============================================================

        _resolveSlotForType(typeId) {
            if (!this._dataBus) return null;

            var freeActive = this._dataBus.getFreeActiveSlotsByType(typeId);
            if (freeActive.length > 0) return freeActive[0];

            var archived = this._dataBus.getArchivedSlotsByType(typeId);
            if (archived.length > 0) {
                var sid = archived[0];
                this._dataBus.unarchiveSlot(sid);
                return sid;
            }

            return this._dataBus.createSlot(typeId);
        }

        _ensureSlotForWindow(windowData) {
            if (!this._dataBus) return;
            if (!windowData || windowData.slotId == null) return;

            var sid = String(windowData.slotId);
            if (this._dataBus.hasSlot(sid)) return;

            var recovered = this._dataBus.ensureSlotForWindow(sid, windowData.type);
            if (!recovered) {
                windowData.slotId = null;
            }
        }

        _ensureSlotsForVisible(visibleWindows) {
            if (!this._dataBus) return;
            for (var i = 0; i < visibleWindows.length; i++) {
                this._ensureSlotForWindow(visibleWindows[i]);
            }
        }

        // ============================================================
        // 10. ADD / CREATE
        // ============================================================

        addWindow(type, title, icon) {
            if (this.getVisibleWindowCount() >= this.maxWindows) {
                console.warn('[LayoutManager] Max visible windows reached');
                return null;
            }

            if (!this.root) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            }

            var windowId = ++this._windowIdCounter;
            var typeConfig = this._registry ? this._registry.getType(type) : null;

            var slotId = this._resolveSlotForType(type);
            if (!slotId) {
                console.error('[LayoutManager] addWindow: failed to resolve slot');
                return null;
            }

            var data = {
                id: windowId,
                type: type,
                title: title || (typeConfig ? typeConfig.name : type),
                icon: icon || (typeConfig ? typeConfig.icon : '📄'),
                slotId: slotId
            };

            var visible = this._collectVisibleAsPlain();
            visible.push(data);

            this._rebuildFromVisible(visible);
            this.render();
            this._notifyChange();
            this._emitLayoutAction('add', data);
            this._emitVisibilityChanged(windowId, true);

            return data;
        }

        createWindowPair(typeId, count) {
            count = count || 2;

            if (!typeId) {
                console.error('[LayoutManager] createWindowPair: typeId required');
                return [];
            }
            if (!this._registry || !this._registry.getType(typeId)) {
                console.error('[LayoutManager] createWindowPair: type not found:', typeId);
                return [];
            }

            var typeConfig = this._registry.getType(typeId);
            var freeSlots = Math.max(0, this.maxWindows - this.getVisibleWindowCount());
            var actual = Math.min(count, freeSlots);
            if (actual === 0) return [];

            var created = [];
            for (var i = 0; i < actual; i++) {
                var windowId = ++this._windowIdCounter;
                var slotId = this._resolveSlotForType(typeId);
                if (!slotId) break;

                created.push({
                    id: windowId,
                    type: typeId,
                    title: typeConfig.name,
                    icon: typeConfig.icon,
                    slotId: slotId
                });
            }

            if (created.length === 0) return [];

            var visible = this._collectVisibleAsPlain();
            for (var k = 0; k < created.length; k++) visible.push(created[k]);

            this._rebuildFromVisible(visible);
            this.render();
            this._notifyChange();

            for (var m = 0; m < created.length; m++) {
                this._emitLayoutAction('add', created[m]);
                this._emitVisibilityChanged(created[m].id, true);
            }

            return created;
        }

        // ============================================================
        // 11. CLOSE
        // ============================================================

        closeWindow(id) {
            var sid = String(id);
            var node = this.getNodeByWindowId(sid);
            var minData = this._minimizedWindowsData.get(sid);

            if (!node && !minData) {
                console.warn('[LayoutManager] closeWindow: not found:', sid);
                return false;
            }

            var wasVisible = !!node;
            var winType = node && node.windowData ? node.windowData.type
                : (minData ? minData.type : 'unknown');
            var winSlotId = node && node.windowData ? node.windowData.slotId
                : (minData ? minData.slotId : null);

            if (this._fullscreenWindowId === sid) {
                this.exitFullscreen(true);
            }

            this._minimizedWindowsData.delete(sid);

            var instance = this._windowInstances.get(sid);
            if (instance && typeof instance.destroy === 'function') {
                try { instance.destroy(); } catch (e) {}
            }
            this._windowInstances.delete(sid);

            if (this._registry && typeof this._registry.destroyWindow === 'function') {
                try { this._registry.destroyWindow(sid); } catch (e) {}
            }

            if (this._dataBus && winSlotId) {
                this._dataBus.detachWindowFromSlot(winSlotId, sid);
                var slot = this._dataBus.getSlot(winSlotId);
                if (slot && slot.attachedWindows.size === 0) {
                    this._dataBus.archiveSlot(winSlotId);
                }
            }

            var remaining = this.getVisibleWindows()
                .filter(function(w) { return String(w.id) !== sid; })
                .map(function(w) {
                    return {
                        id: w.id,
                        type: w.type,
                        title: w.title,
                        icon: w.icon,
                        slotId: w.slotId,
                        nodeId: w.nodeId
                    };
                });

            if (remaining.length === 0) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                this._windowIdCounter = 0;
            } else {
                this._rebuildFromVisible(remaining);
            }

            this.render();
            this._notifyChange();

            this._emitLayoutAction('remove', {
                id: sid,
                type: winType,
                slotId: winSlotId
            });

            if (wasVisible) this._emitVisibilityChanged(sid, false);

            if (this._focusedWindowId === sid) {
                var vis = this.getVisibleWindows();
                var next = vis.length > 0 ? vis[0].id : null;
                this.setFocusedWindow(next);
            }
            return true;
        }

        closeAll() {
            this._cancelActiveDividerDrag();
            this.exitFullscreen(true);

            var visibleIds = this.getVisibleWindows().map(function(w) { return String(w.id); });

            this._windowInstances.forEach(function(instance) {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();

            if (this._dataBus) {
                var windows = this.getWindows();
                for (var i = 0; i < windows.length; i++) {
                    var w = windows[i];
                    if (!w.slotId) continue;
                    this._dataBus.detachWindowFromSlot(w.slotId, w.id);
                    var slot = this._dataBus.getSlot(w.slotId);
                    if (slot && slot.attachedWindows.size === 0) {
                        this._dataBus.archiveSlot(w.slotId);
                    }
                }
            }

            this._minimizedWindowsData.clear();
            this._fullscreenWindowId = null;
            this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            this._windowIdCounter = 0;
            this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;

            this.setFocusedWindow(null);
            this.render();
            this._notifyChange();

            for (var j = 0; j < visibleIds.length; j++) {
                this._emitVisibilityChanged(visibleIds[j], false);
            }
            return true;
        }

        // ============================================================
        // 12. SWAP
        // ============================================================

        swapWindows(windowId1, windowId2) {
            var s1 = String(windowId1);
            var s2 = String(windowId2);
            if (s1 === s2) return true;

            if (this.isMinimized(s1) || this.isMinimized(s2)) {
                console.warn('[LayoutManager] swapWindows: cannot swap minimized');
                return false;
            }

            var node1 = this.getNodeByWindowId(s1);
            var node2 = this.getNodeByWindowId(s2);
            if (!node1 || !node2) {
                console.error('[LayoutManager] swapWindows: one or both nodes not found');
                return false;
            }

            var tmp = node1.windowData;
            node1.windowData = node2.windowData;
            node2.windowData = tmp;

            var inst1 = this._windowInstances.get(s1);
            var inst2 = this._windowInstances.get(s2);

            if (inst1) {
                this._windowInstances.delete(s1);
                this._windowInstances.set(String(node2.windowData.id), inst1);
            }
            if (inst2) {
                this._windowInstances.delete(s2);
                this._windowInstances.set(String(node1.windowData.id), inst2);
            }

            if (inst1 && inst1.id !== undefined) inst1.id = node2.windowData.id;
            if (inst2 && inst2.id !== undefined) inst2.id = node1.windowData.id;

            this.render();
            this._notifyChange();
            this._emitLayoutAction('swap', {
                id1: s1,
                id2: s2,
                slotId1: node2.windowData.slotId,
                slotId2: node1.windowData.slotId
            });
            return true;
        }

        // ============================================================
        // 13. LAYOUT STYLES
        // ============================================================

        getAvailableStyles() {
            return this._getAvailableStylesForCount(this.getVisibleWindowCount());
        }

        _getAvailableStylesForCount(count) {
            if (count === 2) {
                return [
                    { id: LayoutStyle.TWO_HORIZONTAL, label: '2 Columns', icon: '⬌' },
                    { id: LayoutStyle.TWO_VERTICAL,   label: '2 Rows',    icon: '⬍' }
                ];
            }
            if (count === 3) {
                return [
                    { id: LayoutStyle.THREE_HORIZONTAL,  label: '3 Columns', icon: '⬌' },
                    { id: LayoutStyle.THREE_VERTICAL,    label: '3 Rows',    icon: '⬍' },
                    { id: LayoutStyle.THREE_BIG_LEFT,    label: 'Big Left + 2 Right',  icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_RIGHT,   label: 'Big Right + 2 Left',  icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_TOP,     label: 'Big Top + 2 Bottom',  icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_BOTTOM,  label: 'Big Bottom + 2 Top',  icon: '▣' }
                ];
            }
            if (count === 4) {
                return [
                    { id: LayoutStyle.FOUR_GRID_2X2,    label: 'Grid 2x2',           icon: '⊞' },
                    { id: LayoutStyle.FOUR_HORIZONTAL,  label: '4 Columns',          icon: '⬌' },
                    { id: LayoutStyle.FOUR_VERTICAL,    label: '4 Rows',             icon: '⬍' },
                    { id: LayoutStyle.FOUR_BIG_LEFT,    label: 'Big Left + 3 Right', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_RIGHT,   label: 'Big Right + 3 Left', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_TOP,     label: 'Big Top + 3 Bottom', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_BOTTOM,  label: 'Big Bottom + 3 Top', icon: '▣' },
                    { id: LayoutStyle.FOUR_MIXED,       label: 'Mixed (2+2)',        icon: '⊞' }
                ];
            }
            return [];
        }

        setLayoutStyle(styleId) {
            var styles = this.getAvailableStyles();
            var found = false;
            for (var i = 0; i < styles.length; i++) {
                if (styles[i].id === styleId) { found = true; break; }
            }
            if (!found) return false;

            this.currentLayoutStyle = styleId;
            this._rebuildFromVisible(this._collectVisibleAsPlain());
            this.render();
            this._notifyChange();
            this._emitLayoutAction('style', { styleId: styleId });
            return true;
        }

        getCurrentStyle() { return this.currentLayoutStyle; }

        // ============================================================
        // 14. RATIOS / SPLIT COMPUTATION
        // ============================================================

        _computeSplitRatios(node) {
            var n = node.children.length;
            if (n === 0) return [];
            if (n === 1) return [1];

            if (Array.isArray(node.ratios) && node.ratios.length === n) {
                var sum = 0;
                var valid = true;
                for (var i = 0; i < n; i++) {
                    var r = node.ratios[i];
                    if (!isPositiveNumber(r)) { valid = false; break; }
                    sum += r;
                }
                if (valid && sum > 0) {
                    var out = [];
                    for (var j = 0; j < n; j++) out.push(node.ratios[j] / sum);
                    return out;
                }
            }

            if (n === 2) {
                var rr = node.ratio;
                if (rr <= 0 || rr >= 1) rr = 0.5;
                return [rr, 1 - rr];
            }

            var equal = 1 / n;
            var out2 = [];
            for (var k = 0; k < n; k++) out2.push(equal);
            return out2;
        }

        // ============================================================
        // 15. VISIBLE PLAIN COLLECTION
        // ============================================================

        _collectVisibleAsPlain() {
            var visible = this.getVisibleWindows();
            var out = [];
            for (var i = 0; i < visible.length; i++) {
                var w = visible[i];
                out.push({
                    id: w.id,
                    type: w.type,
                    title: w.title,
                    icon: w.icon,
                    slotId: w.slotId,
                    nodeId: w.nodeId
                });
            }
            return out;
        }

        // ============================================================
        // 16. DEDUP
        // ============================================================

        _dedupRootLeafIds() {
            if (!this.root) return false;

            var seenLeafIds = new Set();
            var seenWindowIds = new Set();
            var changed = false;

            var leaves = this.root.getLeaves();
            for (var i = 0; i < leaves.length; i++) {
                var leaf = leaves[i];

                if (seenLeafIds.has(leaf.id)) {
                    var oldId = leaf.id;
                    leaf.id = generateId();
                    changed = true;
                    console.warn(
                        '[LayoutManager] Duplicate leaf id:', oldId,
                        '→', leaf.id,
                        '(window:', leaf.windowData ? leaf.windowData.id : null, ')'
                    );
                }
                seenLeafIds.add(leaf.id);

                if (leaf.windowData && leaf.windowData.id != null) {
                    var wid = String(leaf.windowData.id);
                    if (seenWindowIds.has(wid)) {
                        console.warn(
                            '[LayoutManager] ⚠ Duplicate windowData.id in tree:',
                            wid, '— logical error, may produce phantom windows'
                        );
                    }
                    seenWindowIds.add(wid);
                }
            }

            return changed;
        }

        // ============================================================
        // 17. ROOT STRUCTURE
        // ============================================================

        _ensureRootStructureMatches(visibleWindows) {
            var count = visibleWindows.length;

            if (count === 0) {
                if (!this.root || !this.root.isLeaf() || this.root.windowData !== null) {
                    this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                }
                return;
            }

            if (count === 1) {
                var w = visibleWindows[0];
                var alreadySingle = this.root
                    && this.root.isLeaf()
                    && this.root.windowData
                    && String(this.root.windowData.id) === String(w.id);

                if (!alreadySingle) {
                    this.root = leafFromWindow(w);
                }
                return;
            }

            var styles = this._getAvailableStylesForCount(count);
            var styleOk = false;
            for (var i = 0; i < styles.length; i++) {
                if (styles[i].id === this.currentLayoutStyle) { styleOk = true; break; }
            }
            if (!styleOk) {
                this.currentLayoutStyle = DEFAULT_STYLE_FOR_COUNT[count]
                    || LayoutStyle.FOUR_GRID_2X2;
            }

            var leaves = (this.root && this.root.isSplit()) ? this.root.getLeaves() : [];
            var allFilled = leaves.length === count;
            if (allFilled) {
                for (var k = 0; k < leaves.length; k++) {
                    if (!leaves[k].windowData) { allFilled = false; break; }
                }
            }

            if (this.root && this.root.isSplit() && allFilled) return;

            this.root = this._buildLayoutForStyle(this.currentLayoutStyle, visibleWindows);
        }

        _rebuildFromVisible(visibleWindows) {
            this._ensureSlotsForVisible(visibleWindows);

            var count = visibleWindows.length;

            if (count === 0) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                return;
            }

            var seen = new Set();
            var cleaned = [];
            for (var i = 0; i < visibleWindows.length; i++) {
                var w = visibleWindows[i];
                var nid = w.nodeId;
                if (nid == null || seen.has(nid)) nid = generateId();
                seen.add(nid);
                cleaned.push({
                    id: w.id,
                    type: w.type,
                    title: w.title,
                    icon: w.icon,
                    slotId: w.slotId,
                    nodeId: nid
                });
            }

            if (count === 1) {
                this.root = leafFromWindow(cleaned[0]);
                return;
            }

            var styles = this._getAvailableStylesForCount(count);
            var styleOk = false;
            for (var j = 0; j < styles.length; j++) {
                if (styles[j].id === this.currentLayoutStyle) { styleOk = true; break; }
            }
            if (!styleOk) {
                this.currentLayoutStyle = DEFAULT_STYLE_FOR_COUNT[count]
                    || LayoutStyle.FOUR_GRID_2X2;
            }

            var newRoot = this._buildLayoutForStyle(this.currentLayoutStyle, cleaned);
            if (newRoot) this.root = newRoot;
        }

        // ============================================================
        // 18. LAYOUT BUILDERS
        // ============================================================

        _buildLayoutForStyle(style, windows) {
            var count = windows.length;

            if (count === 2) {
                switch (style) {
                    case LayoutStyle.TWO_HORIZONTAL: return this._buildTwoHorizontal(windows);
                    case LayoutStyle.TWO_VERTICAL:   return this._buildTwoVertical(windows);
                    default:                          return this._buildTwoHorizontal(windows);
                }
            }
            if (count === 3) {
                switch (style) {
                    case LayoutStyle.THREE_HORIZONTAL:  return this._buildThreeHorizontal(windows);
                    case LayoutStyle.THREE_VERTICAL:    return this._buildThreeVertical(windows);
                    case LayoutStyle.THREE_BIG_LEFT:    return this._buildThreeBigLeft(windows);
                    case LayoutStyle.THREE_BIG_RIGHT:   return this._buildThreeBigRight(windows);
                    case LayoutStyle.THREE_BIG_TOP:     return this._buildThreeBigTop(windows);
                    case LayoutStyle.THREE_BIG_BOTTOM:  return this._buildThreeBigBottom(windows);
                    default:                             return this._buildThreeBigLeft(windows);
                }
            }
            if (count === 4) {
                switch (style) {
                    case LayoutStyle.FOUR_GRID_2X2:    return this._buildFourGrid2x2(windows);
                    case LayoutStyle.FOUR_HORIZONTAL:  return this._buildFourHorizontal(windows);
                    case LayoutStyle.FOUR_VERTICAL:    return this._buildFourVertical(windows);
                    case LayoutStyle.FOUR_BIG_LEFT:    return this._buildFourBigLeft(windows);
                    case LayoutStyle.FOUR_BIG_RIGHT:   return this._buildFourBigRight(windows);
                    case LayoutStyle.FOUR_BIG_TOP:     return this._buildFourBigTop(windows);
                    case LayoutStyle.FOUR_BIG_BOTTOM:  return this._buildFourBigBottom(windows);
                    case LayoutStyle.FOUR_MIXED:       return this._buildFourMixed(windows);
                    default:                            return this._buildFourGrid2x2(windows);
                }
            }

            return null;
        }

        _buildTwoHorizontal(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            root.addChild(leafFromWindow(windows[1]));
            return root;
        }

        _buildTwoVertical(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            root.addChild(leafFromWindow(windows[1]));
            return root;
        }

        _buildThreeHorizontal(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1 / 3 });
            for (var i = 0; i < windows.length; i++) root.addChild(leafFromWindow(windows[i]));
            return root;
        }

        _buildThreeVertical(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1 / 3 });
            for (var i = 0; i < windows.length; i++) root.addChild(leafFromWindow(windows[i]));
            return root;
        }

        _buildThreeBigLeft(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.4 });
            var right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            right.addChild(leafFromWindow(windows[1]));
            right.addChild(leafFromWindow(windows[2]));
            root.addChild(right);
            return root;
        }

        _buildThreeBigRight(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.6 });
            var left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            left.addChild(leafFromWindow(windows[0]));
            left.addChild(leafFromWindow(windows[1]));
            root.addChild(left);
            root.addChild(leafFromWindow(windows[2]));
            return root;
        }

        _buildThreeBigTop(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            var bottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            bottom.addChild(leafFromWindow(windows[1]));
            bottom.addChild(leafFromWindow(windows[2]));
            root.addChild(bottom);
            return root;
        }

        _buildThreeBigBottom(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            var top = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            top.addChild(leafFromWindow(windows[0]));
            top.addChild(leafFromWindow(windows[1]));
            root.addChild(top);
            root.addChild(leafFromWindow(windows[2]));
            return root;
        }

        _buildFourGrid2x2(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            var left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            var right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            left.addChild(leafFromWindow(windows[0]));
            left.addChild(leafFromWindow(windows[1]));
            right.addChild(leafFromWindow(windows[2]));
            right.addChild(leafFromWindow(windows[3]));
            root.addChild(left);
            root.addChild(right);
            return root;
        }

        _buildFourHorizontal(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.25 });
            for (var i = 0; i < windows.length; i++) root.addChild(leafFromWindow(windows[i]));
            return root;
        }

        _buildFourVertical(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.25 });
            for (var i = 0; i < windows.length; i++) root.addChild(leafFromWindow(windows[i]));
            return root;
        }

        _buildFourBigLeft(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.4 });
            var right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1 / 3 });
            var splitBottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            right.addChild(leafFromWindow(windows[1]));
            splitBottom.addChild(leafFromWindow(windows[2]));
            splitBottom.addChild(leafFromWindow(windows[3]));
            right.addChild(splitBottom);
            root.addChild(right);
            return root;
        }

        _buildFourBigRight(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.6 });
            var left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1 / 3 });
            var splitBottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            left.addChild(leafFromWindow(windows[0]));
            splitBottom.addChild(leafFromWindow(windows[1]));
            splitBottom.addChild(leafFromWindow(windows[2]));
            left.addChild(splitBottom);
            root.addChild(left);
            root.addChild(leafFromWindow(windows[3]));
            return root;
        }

        _buildFourBigTop(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            var bottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1 / 3 });
            var splitRight = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(leafFromWindow(windows[0]));
            bottom.addChild(leafFromWindow(windows[1]));
            splitRight.addChild(leafFromWindow(windows[2]));
            splitRight.addChild(leafFromWindow(windows[3]));
            bottom.addChild(splitRight);
            root.addChild(bottom);
            return root;
        }

        _buildFourBigBottom(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            var top = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1 / 3 });
            var splitRight = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            top.addChild(leafFromWindow(windows[0]));
            splitRight.addChild(leafFromWindow(windows[1]));
            splitRight.addChild(leafFromWindow(windows[2]));
            top.addChild(splitRight);
            root.addChild(top);
            root.addChild(leafFromWindow(windows[3]));
            return root;
        }

        _buildFourMixed(windows) {
            var root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            var left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            var right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            left.addChild(leafFromWindow(windows[0]));
            left.addChild(leafFromWindow(windows[1]));
            right.addChild(leafFromWindow(windows[2]));
            right.addChild(leafFromWindow(windows[3]));
            root.addChild(left);
            root.addChild(right);
            return root;
        }

        // ============================================================
        // 19. RENDER — FULL
        // ============================================================

        render() {
            this._cancelActiveDividerDrag();
            if (!this.workspace) return;

            if (!this.root) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            }

            this._dedupRootLeafIds();

            var visible = this.getVisibleWindows();
            this._ensureRootStructureMatches(visible);
            this._ensureSlotsForVisible(visible);
            this._dedupRootLeafIds();

            this.workspace.innerHTML = '';
            this._domMap.clear();

            if (this.getVisibleWindowCount() === 0) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                this._renderEmptyWorkspace();
                this._updateWindowMap();
                this._scheduleResize();

                this._busEmit('layout-rendered', { count: 0 });
                return;
            }

            var element = this._buildDOM(this.root);
            if (element) this.workspace.appendChild(element);

            this._updateWindowMap();
            this._scheduleResize();

            this._busEmit('layout-rendered', {
                count: this.getVisibleWindowCount()
            });
        }

        // ============================================================
        // 20. RENDER — RESIZE ONLY
        // ============================================================

        resizeRenderedDOM() {
            if (!this.workspace) return false;
            if (!this.root) return false;

            var element = this.workspace.firstElementChild;
            if (!element) return false;

            this._reflowSplitRatios(this.root, element);
            this._scheduleResize();
            return true;
        }

        _reflowSplitRatios(node, el) {
            if (!node || !el) return;

            if (node.isSplit()) {
                var isHorizontal = node.direction === SplitDirection.HORIZONTAL;
                var childCount = node.children.length;
                var dividerTotalPx = DIVIDER_SIZE * (childCount - 1);
                var ratios = this._computeSplitRatios(node);

                var childElements = [];
                for (var i = 0; i < el.children.length; i++) {
                    var child = el.children[i];
                    if (!child.classList || !child.classList.contains('split-divider')) {
                        childElements.push(child);
                    }
                }

                for (var k = 0; k < childElements.length && k < node.children.length; k++) {
                    var cEl = childElements[k];
                    var percent = (ratios[k] * 100).toFixed(6);
                    cEl.style.flex = '0 0 calc((100% - ' + dividerTotalPx + 'px) * ' + percent + ' / 100)';
                    cEl.dataset.splitR = String(ratios[k]);

                    this._reflowSplitRatios(node.children[k], cEl);
                }
            }
        }

        // ============================================================
        // 21. RENDER — EMPTY
        // ============================================================

        _renderEmptyWorkspace() {
            var existing = this.workspace.querySelector('.workspace-empty');
            if (existing) existing.remove();

            var placeholder = document.createElement('div');
            placeholder.className = 'workspace-empty';
            placeholder.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'height:100%',
                'width:100%',
                'color:var(--text-muted, rgba(200,184,154,0.35))',
                'font-size:14px',
                'flex-direction:column',
                'gap:8px'
            ].join(';');
            placeholder.innerHTML = [
                '<div style="font-size:48px;opacity:0.7;">',
                '    <svg class="icon-folder" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
                '        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
                '    </svg>',
                '</div>',
                '<div>Нет активных окон</div>',
                '<div style="font-size:11px;opacity:0.5;">Используйте меню «Window»</div>'
            ].join('');
            this.workspace.appendChild(placeholder);
        }

        // ============================================================
        // 22. RESIZE SCHEDULING
        // ============================================================

        _scheduleResize() {
            if (this._resizeRAF) {
                cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = null;
            }
            if (this._resizeFallbackTimer) {
                clearTimeout(this._resizeFallbackTimer);
                this._resizeFallbackTimer = null;
            }

            var self = this;

            this._resizeRAF = requestAnimationFrame(function() {
                self._resizeRAF = null;

                var anyVisible = false;
                self._windowInstances.forEach(function(bw) {
                    if (!bw || typeof bw.isDestroyed !== 'function') return;
                    if (bw.isDestroyed()) return;
                    var el = bw.getRoot && bw.getRoot();
                    if (!el) return;
                    if (el.clientWidth > 0 && el.clientHeight > 0) {
                        anyVisible = true;
                    }
                });

                self._doResizeAll();

                if (!anyVisible) {
                    self._resizeFallbackTimer = setTimeout(function() {
                        self._resizeFallbackTimer = null;
                        self._doResizeAll();
                    }, 200);
                }
            });
        }

        _doResizeAll() {
            this._windowInstances.forEach(function(instance) {
                if (instance && typeof instance.resize === 'function') {
                    try { instance.resize(); } catch (e) {}
                }
            });
        }

        resizeAll() {
            this._doResizeAll();
        }

        // ============================================================
        // 23. DOM BUILD
        // ============================================================

        _buildDOM(node) {
            if (node.isLeaf()) return this._buildLeafDOM(node);
            if (node.isSplit()) return this._buildSplitDOM(node);
            return null;
        }

        _buildLeafDOM(node) {
            if (!node.windowData) {
                var empty = document.createElement('div');
                empty.style.cssText = 'flex:1 1 auto;min-width:0;min-height:0;background:transparent;';
                return empty;
            }

            this._ensureSlotForWindow(node.windowData);

            var container = document.createElement('div');
            container.className = 'window-container';
            container.dataset.nodeId = node.id;
            container.dataset.windowId = node.windowData.id;
            container.dataset.slotId = node.windowData.slotId || '';

            container.style.cssText = [
                'flex:1 1 auto',
                'min-width:0',
                'min-height:0',
                'max-width:100%',
                'display:flex',
                'flex-direction:column',
                'position:relative',
                'overflow:hidden',
                'background:var(--bg-panel, #1a1a1a)',
                'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                'border-radius:var(--radius, 6px)',
                'margin:0',
                'padding:0',
                'height:100%',
                'width:100%',
                'box-sizing:border-box',
                'transition:border-color 0.2s ease, box-shadow 0.2s ease'
            ].join(';');

            this._domMap.set(node.id, container);

            var focusId = node.windowData.id;
            var self = this;
            container.addEventListener('mousedown', function() {
                self.setFocusedWindow(focusId);
            }, true);

            var BaseWindow = window.BaseWindow;
            if (!BaseWindow) {
                console.error('[LayoutManager] BaseWindow not found');
                return container;
            }

            var windowId = node.windowData.id;
            var sid = String(windowId);
            var slotId = node.windowData.slotId;

            var existing = this._windowInstances.get(sid);

            if (existing && !existing.isDestroyed()) {
                if (existing.type === node.windowData.type) {
                    var oldSlotId = existing.getSlotId ? existing.getSlotId() : null;

                    if (slotId && oldSlotId !== slotId) {
                        if (typeof existing.attachTo === 'function') {
                            existing.attachTo(slotId);
                        }
                    }

                    var rw = existing.getRenderWindow();
                    if (rw && rw._root) {
                        existing.container = container;
                        rw.container = container;
                        container.appendChild(rw._root);
                        return container;
                    }
                }
                try { existing.destroy(); } catch (e) {}
                this._windowInstances.delete(sid);
            }

            if (existing && existing.isDestroyed()) {
                this._windowInstances.delete(sid);
            }

            var typeId = node.windowData.type;
            var typeConfig = this._registry ? this._registry.getType(typeId) : null;

            var realInstance = null;
            if (typeConfig && typeof typeConfig.create === 'function') {
                try {
                    realInstance = typeConfig.create(
                        container,
                        {
                            id: windowId,
                            type: typeId,
                            title: node.windowData.title,
                            icon: node.windowData.icon,
                            slotId: slotId
                        },
                        {
                            dataBus: this._dataBus,
                            registry: this._registry,
                            eventBus: this._eventBus,
                            messageBus: this._messageBus,
                            layoutManager: this
                        }
                    );
                } catch (error) {
                    console.error('[LayoutManager] Error creating real instance:', error);
                    realInstance = null;
                }
            }

            try {
                var baseWindow = new BaseWindow({
                    id: windowId,
                    type: typeId,
                    container: container,
                    options: {
                        title: node.windowData.title,
                        icon: node.windowData.icon,
                        slotId: slotId,
                        registry: this._registry,
                        layoutManager: this,
                        dataBus: this._dataBus,
                        eventBus: this._eventBus,
                        messageBus: this._messageBus,
                        _realInstance: realInstance
                    }
                });

                if (realInstance && baseWindow) {
                    realInstance._baseWindow = baseWindow;
                    if (baseWindow._realInstance) {
                        baseWindow._realInstance._baseWindow = baseWindow;
                    }
                    if (typeof realInstance.onBaseWindowAttached === 'function') {
                        try { realInstance.onBaseWindowAttached(baseWindow); } catch (e) {}
                    }
                }

                this._windowInstances.set(sid, baseWindow);
                node.windowData._instance = baseWindow;

                if (this._dataBus && slotId) {
                    this._dataBus.attachWindowToSlot(slotId, windowId);
                }
            } catch (error) {
                console.error('[LayoutManager] Error creating BaseWindow:', error);

                var placeholder = document.createElement('div');
                placeholder.style.cssText = [
                    'display:flex',
                    'align-items:center',
                    'justify-content:center',
                    'height:100%',
                    'color:var(--text-muted)',
                    'font-size:14px'
                ].join(';');
                placeholder.textContent = node.windowData.title + ' (Error)';
                container.appendChild(placeholder);
            }

            return container;
        }

        _buildSplitDOM(node) {
            var container = document.createElement('div');
            container.className = 'split-container';
            container.dataset.nodeId = node.id;

            var isHorizontal = node.direction === SplitDirection.HORIZONTAL;
            var childCount = node.children.length;
            var dividerTotalPx = DIVIDER_SIZE * (childCount - 1);

            container.style.cssText = [
                'display:flex',
                'flex:1 1 auto',
                'min-width:0',
                'min-height:0',
                'position:relative',
                'flex-direction:' + (isHorizontal ? 'row' : 'column'),
                'height:100%',
                'width:100%',
                'overflow:hidden',
                'box-sizing:border-box'
            ].join(';');

            container.dataset.splitDividerTotal = String(dividerTotalPx);

            this._domMap.set(node.id, container);

            var ratios = this._computeSplitRatios(node);
            var childElements = [];

            for (var i = 0; i < childCount; i++) {
                var child = node.children[i];
                var el = this._buildDOM(child);
                if (!el) continue;

                var percent = (ratios[i] * 100).toFixed(6);
                el.style.flex = '0 0 calc((100% - ' + dividerTotalPx + 'px) * ' + percent + ' / 100)';
                el.dataset.splitR = String(ratios[i]);

                el.style.minWidth = '0';
                el.style.minHeight = '0';
                el.style.overflow = 'hidden';
                el.style.position = 'relative';
                el.style.boxSizing = 'border-box';

                container.appendChild(el);
                childElements.push(el);
            }

            if (childElements.length < 2) return container;

            for (var d = childElements.length - 1; d > 0; d--) {
                var divider = this._createDivider(node, container, d, isHorizontal, childElements);
                container.insertBefore(divider, childElements[d]);
            }

            return container;
        }

        _createDivider(node, container, dividerIndex, isHorizontal, childElements) {
            var divider = document.createElement('div');
            divider.className = 'split-divider';
            divider.dataset.nodeId = node.id;

            divider.style.cssText = [
                'flex:0 0 ' + DIVIDER_SIZE + 'px',
                'width:' + (isHorizontal ? DIVIDER_SIZE + 'px' : '100%'),
                'min-width:' + (isHorizontal ? DIVIDER_SIZE + 'px' : '0'),
                'height:' + (isHorizontal ? '100%' : DIVIDER_SIZE + 'px'),
                'min-height:' + (isHorizontal ? '0' : DIVIDER_SIZE + 'px'),
                'cursor:' + (isHorizontal ? 'col-resize' : 'row-resize'),
                'background-color:rgba(200, 184, 154, 0.15)',
                'position:relative',
                'z-index:10',
                'flex-shrink:0',
                'flex-grow:0',
                'transition:background-color 0.15s ease',
                'box-sizing:border-box',
                'align-self:stretch',
                'user-select:none'
            ].join(';');

            divider.addEventListener('mouseenter', function() {
                this.style.backgroundColor = 'rgba(200, 184, 154, 0.4)';
            });
            divider.addEventListener('mouseleave', function() {
                this.style.backgroundColor = 'rgba(200, 184, 154, 0.15)';
            });

            var self = this;

            divider.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();

                self._cancelActiveDividerDrag();
                divider.style.backgroundColor = 'rgba(204, 34, 51, 0.5)';
                document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
                document.body.style.userSelect = 'none';

                var startPos = isHorizontal ? e.clientX : e.clientY;

                var total = childElements.length;
                var containerRect = container.getBoundingClientRect();
                var totalSize = isHorizontal ? containerRect.width : containerRect.height;
                var adjacentSize = totalSize - DIVIDER_SIZE * (total - 1);
                if (adjacentSize <= 0) adjacentSize = totalSize;

                var leftEl = childElements[dividerIndex - 1];
                var rightEl = childElements[dividerIndex];

                var rLeft = parseFloat(leftEl.dataset.splitR) || 0;
                var rRight = parseFloat(rightEl.dataset.splitR) || 0;
                var sumStart = rLeft + rRight;
                if (sumStart <= 0) sumStart = 2 / total;

                var divPx = parseInt(container.dataset.splitDividerTotal, 10) || 0;

                var onMouseMove = function(ev) {
                    var currentPos = isHorizontal ? ev.clientX : ev.clientY;
                    var deltaPx = currentPos - startPos;
                    var deltaRatio = adjacentSize > 0 ? deltaPx / adjacentSize : 0;

                    var newLeft = rLeft + deltaRatio * sumStart;
                    var newRight = rRight - deltaRatio * sumStart;

                    var minRatio = 0.05 * sumStart;
                    if (newLeft < minRatio) { newLeft = minRatio; newRight = sumStart - minRatio; }
                    if (newRight < minRatio) { newRight = minRatio; newLeft = sumStart - minRatio; }

                    leftEl.dataset.splitR = String(newLeft);
                    rightEl.dataset.splitR = String(newRight);

                    var lPercent = (newLeft * 100).toFixed(6);
                    var rPercent = (newRight * 100).toFixed(6);

                    leftEl.style.flex  = '0 0 calc((100% - ' + divPx + 'px) * ' + lPercent + ' / 100)';
                    rightEl.style.flex = '0 0 calc((100% - ' + divPx + 'px) * ' + rPercent + ' / 100)';
                };

                var onMouseUp = function() {
                    try { document.removeEventListener('mousemove', onMouseMove); } catch (err) {}
                    try { document.removeEventListener('mouseup', onMouseUp); } catch (err) {}
                    try { document.removeEventListener('pointercancel', onMouseUp); } catch (err) {}
                    try { window.removeEventListener('blur', onMouseUp); } catch (err) {}

                    divider.style.backgroundColor = 'rgba(200, 184, 154, 0.15)';
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';

                    var collected = [];
                    for (var i = 0; i < total; i++) {
                        var r = parseFloat(childElements[i].dataset.splitR);
                        if (!isPositiveNumber(r)) r = 1 / total;
                        collected.push(r);
                    }

                    var normalized = normalizeRatios(collected);
                    if (normalized) {
                        node.ratios = normalized;
                        if (normalized.length === 2) {
                            node.ratio = normalized[0];
                        }
                    }

                    self._activeDividerDrag = null;
                    self._notifyChange();
                };

                self._activeDividerDrag = { onMove: onMouseMove, onUp: onMouseUp };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                document.addEventListener('pointercancel', onMouseUp);
                window.addEventListener('blur', onMouseUp);
            });

            return divider;
        }

        // ============================================================
        // 24. WINDOW MAP
        // ============================================================

        _updateWindowMap() {
            this._windowMap.clear();
            var windows = this.getVisibleWindows();
            for (var i = 0; i < windows.length; i++) {
                var w = windows[i];
                var el = this._domMap.get(w.nodeId);
                if (el) this._windowMap.set(w.id, { node: w.node, element: el });
            }
        }

        // ============================================================
        // 25. EMIT HELPERS
        // ============================================================

        _notifyChange() {
            var detail = {
                windows: this.getWindows(),
                visibleWindows: this.getVisibleWindows(),
                minimizedWindows: Array.from(this._minimizedWindowsData.keys()),
                fullscreenWindowId: this._fullscreenWindowId,
                style: this.currentLayoutStyle
            };

            this._busEmit('layout-changed', detail);
        }

        _emitLayoutAction(action, data) {
            var detail = { action: action };
            for (var k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) detail[k] = data[k];
            }
            detail.timestamp = Date.now();

            this._busEmit('layout-action', detail);
        }

        _emitVisibilityChanged(windowId, visible) {
            var detail = {
                windowId: String(windowId),
                visible: !!visible,
                timestamp: Date.now()
            };

            this._busEmit('window-visibility-changed', detail);
        }

        // ============================================================
        // 26. DEFAULT STATE
        // ============================================================

        loadDefaultState() {
            this.closeAll();
            this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;
            this._windowIdCounter = 0;
            this._minimizedWindowsData.clear();
            this._fullscreenWindowId = null;
            this.render();
            this._notifyChange();
        }

        // ============================================================
        // 27. PROJECT DATA
        // ============================================================

        getProjectData() {
            if (!this.root) return null;

            var minimized = [];
            this._minimizedWindowsData.forEach(function(w) {
                minimized.push({
                    id: w.id,
                    type: w.type,
                    title: w.title,
                    icon: w.icon,
                    slotId: w.slotId
                });
            });

            return {
                version: '1.5.0',
                layout: this.root.toJSON(),
                windowCounter: this._windowIdCounter,
                layoutStyle: this.currentLayoutStyle,
                minimizedWindows: minimized,
                fullscreenWindowId: this._fullscreenWindowId
            };
        }

        loadProjectData(data) {
            if (!data || !data.layout) {
                this._clearInstances();
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                this._windowIdCounter = 0;
                this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;
                this._minimizedWindowsData.clear();
                this._fullscreenWindowId = null;
                this.render();
                this._notifyChange();
                return false;
            }

            this._clearInstances();

            this.root = LayoutNode.fromJSON(data.layout);
            this._dedupRootLeafIds();

            var maxLeafId = 0;
            var leaves = this.root.getLeaves();
            for (var i = 0; i < leaves.length; i++) {
                if (leaves[i].id > maxLeafId) maxLeafId = leaves[i].id;
            }
            setIdFloor(maxLeafId);

            this._windowIdCounter = data.windowCounter || 0;
            this.currentLayoutStyle = data.layoutStyle || LayoutStyle.FOUR_GRID_2X2;

            this._minimizedWindowsData.clear();
            if (Array.isArray(data.minimizedWindows)) {
                for (var j = 0; j < data.minimizedWindows.length; j++) {
                    var w = data.minimizedWindows[j];
                    if (!w || w.id == null) continue;
                    var sid = String(w.id);
                    this._minimizedWindowsData.set(sid, {
                        id: w.id,
                        type: w.type || 'unknown',
                        title: w.title || ('#' + w.id),
                        icon: w.icon || '📄',
                        slotId: w.slotId || null
                    });
                }
            }

            this._fullscreenWindowId = data.fullscreenWindowId != null
                ? String(data.fullscreenWindowId)
                : null;

            if (this._fullscreenWindowId && !this.getNodeByWindowId(this._fullscreenWindowId)) {
                console.warn('[LayoutManager] loadProjectData: fullscreen window not found, reset');
                this._fullscreenWindowId = null;
            }

            var allVisible = this.getVisibleWindows();
            this._ensureSlotsForVisible(allVisible);

            var minimizedList = [];
            this._minimizedWindowsData.forEach(function(v) { minimizedList.push(v); });
            this._ensureSlotsForVisible(minimizedList);

            return true;
        }

        renderLayout() { this.render(); }
        getLayoutData() { return this.getProjectData(); }
        loadLayoutData(data) { return this.loadProjectData(data); }

        // ============================================================
        // 28. CLEAR INSTANCES
        // ============================================================

        _clearInstances() {
            this._cancelActiveDividerDrag();
            if (!this._windowInstances) {
                this._windowInstances = new Map();
                return;
            }
            this._windowInstances.forEach(function(instance) {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            LayoutManager: LayoutManager,
            LayoutNode: LayoutNode,
            NodeType: NodeType,
            SplitDirection: SplitDirection,
            LayoutStyle: LayoutStyle
        };
    }

    if (typeof window !== 'undefined') {
        window.LayoutManager = LayoutManager;
        window.LayoutNode = LayoutNode;
        window.NodeType = NodeType;
        window.SplitDirection = SplitDirection;
        window.LayoutStyle = LayoutStyle;
    }

})();