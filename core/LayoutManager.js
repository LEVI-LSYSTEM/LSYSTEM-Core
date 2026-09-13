// core/LayoutManager.js
// Версия 6.1.0 - Fix: window-visibility-changed + get*WindowsByType
// - _emitVisibilityChanged(windowId, visible) → dispatch 'window-visibility-changed'
// - minimizeWindow: эмит после finishMinimize
// - restoreWindow: эмит после render
// - closeWindow: эмит false, если окно было видимым
// - closeAll: эмит false для всех видимых
// - getVisibleWindowsByType(typeId) / getMinimizedWindowsByType(typeId)
// - _emitLayoutAction (layout-action) НЕ тронут

(function() {
    'use strict';

    console.log('[LayoutManager] Loading v6.1.0 (visibility events)...');

    const NodeType = { LEAF: 'leaf', SPLIT: 'split' };
    const SplitDirection = { HORIZONTAL: 'horizontal', VERTICAL: 'vertical' };

    const LayoutStyle = {
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

    let _idCounter = 0;
    function generateId() { return ++_idCounter; }

    // ============================================================
    // 1. УЗЕЛ ДЕРЕВА
    // ============================================================

    class LayoutNode {
        constructor({ type, id, direction, ratio, children, windowData } = {}) {
            this.id = id || generateId();
            this.type = type || NodeType.LEAF;
            this.direction = direction || null;
            this.ratio = ratio || 0.5;
            this.children = children || [];
            this.windowData = windowData || null;
            this.parent = null;
        }

        isLeaf() { return this.type === NodeType.LEAF; }
        isSplit() { return this.type === NodeType.SPLIT; }

        addChild(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index !== -1) {
                this.children.splice(index, 1);
                child.parent = null;
                return true;
            }
            return false;
        }

        getLeafCount() {
            if (this.isLeaf()) return 1;
            return this.children.reduce((sum, child) => sum + child.getLeafCount(), 0);
        }

        getLeaves() {
            if (this.isLeaf()) return [this];
            return this.children.flatMap(child => child.getLeaves());
        }

        findLeafByWindowId(id) {
            const target = String(id);
            if (this.isLeaf() && this.windowData && String(this.windowData.id) === target) return this;
            if (this.isSplit()) {
                for (const child of this.children) {
                    const found = child.findLeafByWindowId(target);
                    if (found) return found;
                }
            }
            return null;
        }

        getIndexInParent() {
            if (!this.parent) return -1;
            return this.parent.children.indexOf(this);
        }

        toJSON() {
            return {
                id: this.id,
                type: this.type,
                direction: this.direction,
                ratio: this.ratio,
                windowData: this.windowData ? {
                    id: this.windowData.id,
                    type: this.windowData.type,
                    title: this.windowData.title,
                    icon: this.windowData.icon,
                    slotId: this.windowData.slotId || null
                } : null,
                children: this.children.map(child => child.toJSON())
            };
        }

        static fromJSON(data) {
            const node = new LayoutNode({
                type: data.type,
                id: data.id,
                direction: data.direction,
                ratio: data.ratio,
                windowData: data.windowData
            });
            node.children = (data.children || []).map(childData => {
                const child = LayoutNode.fromJSON(childData);
                child.parent = node;
                return child;
            });
            return node;
        }
    }

    // ============================================================
    // 2. ОСНОВНОЙ КЛАСС
    // ============================================================

    class LayoutManager {
        constructor(options = {}) {
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

            // ✅ Свёрнутые окна: Map<windowId, windowData>
            this._minimizedWindowsData = new Map();

            // ✅ Fullscreen
            this._fullscreenWindowId = null;

            this._resizeTimer = null;
            this._resizeRAF = null;

            this._contentRenderers = new Map();

            console.log('[LayoutManager] Created v6.1.0');
        }

        // ============================================================
        // 3. РЕГИСТРАЦИЯ
        // ============================================================

        registerContentRenderer(typeId, renderer) {
            this._contentRenderers.set(typeId, renderer);
            console.log(`[LayoutManager] Registered content renderer: "${typeId}"`);
        }

        // ============================================================
        // 4. ИНИЦИАЛИЗАЦИЯ
        // ============================================================

        init() {
            if (!this.workspace) {
                console.error('[LayoutManager] Workspace not provided');
                return false;
            }

            this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            this._setupProjectListeners();
            console.log('[LayoutManager] Initialized');
            return true;
        }

        _setupProjectListeners() {
            document.addEventListener('project-get-layout', (e) => {
                if (e.detail && typeof e.detail.respond === 'function') {
                    e.detail.respond(this.getProjectData());
                }
            });

            document.addEventListener('project-get-layout-style', (e) => {
                if (e.detail && typeof e.detail.respond === 'function') {
                    e.detail.respond(this.getCurrentStyle());
                }
            });

            document.addEventListener('project-restore-layout', (e) => {
                if (!e.detail) return;
                const { layoutData, layoutStyle } = e.detail;

                if (layoutStyle) {
                    this.currentLayoutStyle = layoutStyle;
                }

                if (layoutData) {
                    this.loadProjectData(layoutData);
                    this.render();
                    this._scheduleResize();
                }
            });
        }

        destroy() {
            this.exitFullscreen(true);

            if (this._resizeTimer) {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = null;
            }
            if (this._resizeRAF) {
                cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = null;
            }

            this._windowInstances.forEach((instance) => {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();
            this._domMap.clear();
            this._windowMap.clear();
            this._minimizedWindowsData.clear();
            this.root = null;
            console.log('[LayoutManager] Destroyed');
        }

        // ============================================================
        // 5. РАБОТА С ОКНАМИ
        // ============================================================

        getWindows() {
            const result = [];

            if (this.root) {
                this.root.getLeaves()
                    .filter(node => node.windowData !== null)
                    .forEach(node => {
                        result.push({
                            ...node.windowData,
                            nodeId: node.id,
                            node: node,
                            minimized: false
                        });
                    });
            }

            this._minimizedWindowsData.forEach((windowData, id) => {
                result.push({
                    ...windowData,
                    nodeId: null,
                    node: null,
                    minimized: true
                });
            });

            return result;
        }

        getVisibleWindows() {
            if (!this.root) return [];
            return this.root.getLeaves()
                .filter(node => node.windowData !== null)
                .map(node => ({
                    ...node.windowData,
                    nodeId: node.id,
                    node: node,
                    minimized: false
                }));
        }

        getMinimizedWindows() {
            const result = [];
            this._minimizedWindowsData.forEach((windowData, id) => {
                result.push({
                    ...windowData,
                    nodeId: null,
                    node: null,
                    minimized: true
                });
            });
            return result;
        }

        // ✅ НОВОЕ: фильтр по типу
        getVisibleWindowsByType(typeId) {
            if (!typeId) return [];
            return this.getVisibleWindows().filter(w => w.type === typeId);
        }

        // ✅ НОВОЕ: фильтр по типу среди свёрнутых
        getMinimizedWindowsByType(typeId) {
            if (!typeId) return [];
            return this.getMinimizedWindows().filter(w => w.type === typeId);
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
            return this._windowInstances.get(String(id)) || null;
        }

        getWindowsByType(typeId) {
            return this.getWindows().filter(w => w.type === typeId);
        }

        // ============================================================
        // 5.1. ФОКУС
        // ============================================================

        setFocusedWindow(windowId) {
            const wid = windowId != null ? String(windowId) : null;
            if (wid === this._focusedWindowId) return;

            const prev = this._focusedWindowId;
            this._focusedWindowId = wid;

            if (window.hotkeyRegistry) {
                window.hotkeyRegistry.setFocusedWindow(wid);
            }

            if (prev) {
                const prevBw = this._windowInstances.get(prev);
                if (prevBw && typeof prevBw._onBlur === 'function') {
                    try { prevBw._onBlur(); } catch (e) {}
                }
            }

            if (wid) {
                const bw = this._windowInstances.get(wid);
                if (bw && typeof bw._onFocus === 'function') {
                    try { bw._onFocus(); } catch (e) {}
                }
            }

            this._emitLayoutAction('focus', {
                prevId: prev,
                focusedId: wid
            });
        }

        getFocusedWindow() {
            return this._focusedWindowId;
        }

        // ============================================================
        // 5.2. MINIMIZE
        // ============================================================

        minimizeWindow(windowId) {
            const sid = String(windowId);

            if (this._minimizedWindowsData.has(sid)) return true;

            const node = this.getNodeByWindowId(sid);
            if (!node || !node.windowData) {
                console.warn('[LayoutManager] minimizeWindow: node not found:', sid);
                return false;
            }

            if (this._fullscreenWindowId === sid) {
                this.exitFullscreen(true);
            }

            this._minimizedWindowsData.set(sid, { ...node.windowData });

            const container = this._domMap.get(node.id);
            const ANIM_MS = 220;

            const finishMinimize = () => {
                this._rebuildFromVisible(this.getVisibleWindows().filter(w => String(w.id) !== sid));

                if (this._focusedWindowId === sid) {
                    const visible = this.getVisibleWindows();
                    const nextId = visible.length > 0 ? visible[0].id : null;
                    this.setFocusedWindow(nextId);
                }

                this.render();
                this._notifyChange();

                this._emitLayoutAction('minimize', {
                    id: sid,
                    type: node.windowData?.type || 'unknown',
                    slotId: node.windowData?.slotId || null
                });

                // ✅ НОВОЕ: уведомляем instance, что окно скрыто
                this._emitVisibilityChanged(sid, false);

                console.log('[LayoutManager] Window minimized:', sid);
            };

            if (container) {
                container.classList.add('ls-minimizing');

                let done = false;
                const onEnd = () => {
                    if (done) return;
                    done = true;
                    container.removeEventListener('animationend', onEnd);
                    finishMinimize();
                };
                container.addEventListener('animationend', onEnd);
                setTimeout(onEnd, ANIM_MS + 80);
            } else {
                finishMinimize();
            }

            return true;
        }

        restoreWindow(windowId) {
            const sid = String(windowId);

            if (!this._minimizedWindowsData.has(sid)) return false;

            if (this.getVisibleWindowCount() >= this.maxWindows) {
                console.warn('[LayoutManager] restoreWindow: max visible windows reached');
                return false;
            }

            const windowData = this._minimizedWindowsData.get(sid);
            this._minimizedWindowsData.delete(sid);

            const visible = this.getVisibleWindows().map(w => ({ ...w }));
            visible.push({ ...windowData });

            this._rebuildFromVisible(visible);

            this.render();
            this._notifyChange();

            this._emitLayoutAction('restore', {
                id: sid,
                type: windowData?.type || 'unknown',
                slotId: windowData?.slotId || null
            });

            // ✅ НОВОЕ: уведомляем instance, что окно снова видно
            this._emitVisibilityChanged(sid, true);

            this.setFocusedWindow(sid);

            console.log('[LayoutManager] Window restored:', sid);
            return true;
        }

        isMinimized(windowId) {
            return this._minimizedWindowsData.has(String(windowId));
        }

        // ============================================================
        // 5.3. FULLSCREEN
        // ============================================================

        setFullscreen(windowId) {
            const sid = String(windowId);

            if (this.isMinimized(sid)) {
                console.warn('[LayoutManager] setFullscreen: window is minimized, restore first');
                return false;
            }

            const node = this.getNodeByWindowId(sid);
            if (!node) {
                console.warn('[LayoutManager] setFullscreen: node not found:', sid);
                return false;
            }

            if (this._fullscreenWindowId === sid) return true;

            if (this._fullscreenWindowId) {
                this.exitFullscreen(true);
            }

            this._fullscreenWindowId = sid;

            const bw = this._windowInstances.get(sid);
            const rootEl = bw?.getRenderWindow?.()?.getRoot?.();
            const container = this._domMap.get(node.id);

            let flipScaleX = 1;
            let flipScaleY = 1;

            if (rootEl) {
                const before = rootEl.getBoundingClientRect();
                const winW = window.innerWidth || 1920;
                const winH = window.innerHeight || 1080;
                flipScaleX = winW / Math.max(1, before.width);
                flipScaleY = winH / Math.max(1, before.height);
            }

            if (container) container.classList.add('ls-fullscreen-target');
            document.body.classList.add('ls-fullscreen');
            document.documentElement.classList.add('ls-fullscreen-root');

            if (rootEl && rootEl.requestFullscreen) {
                rootEl.requestFullscreen().catch((err) => {
                    console.warn('[LayoutManager] Fullscreen API error:', err);
                });
            }

            if (rootEl) {
                rootEl.classList.remove('ls-flip-out');
                rootEl.style.setProperty(
                    '--ls-flip-from',
                    `scale(${(1 / flipScaleX).toFixed(4)}, ${(1 / flipScaleY).toFixed(4)})`
                );
                void rootEl.offsetWidth;
                rootEl.classList.add('ls-flip-in');

                setTimeout(() => {
                    try { rootEl.classList.remove('ls-flip-in'); } catch (e) {}
                    rootEl.style.removeProperty('--ls-flip-from');
                }, 360);
            }

            this._notifyChange();
            this._emitLayoutAction('fullscreen', {
                id: sid,
                type: node.windowData?.type || 'unknown'
            });

            console.log('[LayoutManager] Window fullscreen:', sid);
            return true;
        }

        exitFullscreen(silent = false) {
            if (!this._fullscreenWindowId) return false;

            const prevId = this._fullscreenWindowId;
            this._fullscreenWindowId = null;

            const node = this.getNodeByWindowId(prevId);
            const bw = node ? this._windowInstances.get(prevId) : null;
            const rootEl = bw?.getRenderWindow?.()?.getRoot?.();
            const container = node ? this._domMap.get(node.id) : null;

            let flipScaleX = 1;
            let flipScaleY = 1;

            if (rootEl) {
                const before = rootEl.getBoundingClientRect();
                const winW = window.innerWidth || 1920;
                const winH = window.innerHeight || 1080;
                flipScaleX = winW / Math.max(1, before.width);
                flipScaleY = winH / Math.max(1, before.height);
            }

            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch((err) => {
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
                    `scale(${flipScaleX.toFixed(4)}, ${flipScaleY.toFixed(4)})`
                );
                void rootEl.offsetWidth;
                rootEl.classList.add('ls-flip-out');

                setTimeout(() => {
                    try { rootEl.classList.remove('ls-flip-out'); } catch (e) {}
                    rootEl.style.removeProperty('--ls-flip-to');
                }, 320);
            }

            this._notifyChange();

            if (!silent) {
                this._emitLayoutAction('fullscreen-exit', {
                    id: prevId,
                    type: node?.windowData?.type || 'unknown'
                });
            }

            console.log('[LayoutManager] Fullscreen exited' + (silent ? ' (silent)' : ''));
            return true;
        }

        getFullscreenWindow() {
            return this._fullscreenWindowId;
        }

        isFullscreen(windowId = null) {
            if (windowId == null) return !!this._fullscreenWindowId;
            return this._fullscreenWindowId === String(windowId);
        }

        // ============================================================
        // 6. РЕЗОЛВ СЛОТА
        // ============================================================

        _resolveSlotForType(typeId) {
            if (!this._dataBus) return null;

            const freeActive = this._dataBus.getFreeActiveSlotsByType(typeId);
            if (freeActive.length > 0) return freeActive[0];

            const archived = this._dataBus.getArchivedSlotsByType(typeId);
            if (archived.length > 0) {
                const sid = archived[0];
                this._dataBus.unarchiveSlot(sid);
                return sid;
            }

            return this._dataBus.createSlot(typeId);
        }

        // ============================================================
        // 7. ДОБАВЛЕНИЕ ОКНА
        // ============================================================

        addWindow(type, title, icon) {
            console.log(`[LayoutManager] Adding window: ${type}`);

            if (this.getVisibleWindowCount() >= this.maxWindows) {
                console.warn(`[LayoutManager] Max ${this.maxWindows} visible windows`);
                return null;
            }

            if (!this.root) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            }

            const windowId = ++this._windowIdCounter;

            let typeConfig = null;
            if (this._registry) typeConfig = this._registry.getType(type);

            const slotId = this._resolveSlotForType(type);
            if (!slotId) {
                console.error('[LayoutManager] Failed to resolve slot for type:', type);
                return null;
            }

            const windowData = {
                id: windowId,
                type: type,
                title: title || (typeConfig ? typeConfig.name : type),
                icon: icon || (typeConfig ? typeConfig.icon : '📄'),
                slotId: slotId
            };

            const visibleWindows = this.getVisibleWindows().map(w => ({ ...w }));
            visibleWindows.push(windowData);

            const count = visibleWindows.length;
            let defaultStyle = this.currentLayoutStyle;

            const availableStyles = this._getAvailableStylesForCount(count);
            const styleExists = availableStyles.some(s => s.id === defaultStyle);

            if (!styleExists) {
                if (count === 2) defaultStyle = LayoutStyle.TWO_HORIZONTAL;
                else if (count === 3) defaultStyle = LayoutStyle.THREE_BIG_LEFT;
                else if (count === 4) defaultStyle = LayoutStyle.FOUR_GRID_2X2;
                this.currentLayoutStyle = defaultStyle;
            }

            this._rebuildFromVisible(visibleWindows);
            this.render();
            this._notifyChange();
            this._emitLayoutAction('add', windowData);

            // ✅ НОВОЕ: окно добавлено видимым
            this._emitVisibilityChanged(windowId, true);

            return windowData;
        }

        // ============================================================
        // 8. createWindowPair
        // ============================================================

        createWindowPair(typeId, count = 2) {
            console.log(`[LayoutManager] createWindowPair: ${typeId} × ${count}`);

            if (!typeId) {
                console.error('[LayoutManager] createWindowPair: typeId required');
                return [];
            }

            if (!this._registry || !this._registry.getType(typeId)) {
                console.error('[LayoutManager] createWindowPair: type not found:', typeId);
                return [];
            }

            const typeConfig = this._registry.getType(typeId);
            const freeSlots = Math.max(0, this.maxWindows - this.getVisibleWindowCount());
            const actualCount = Math.min(count, freeSlots);

            if (actualCount === 0) return [];

            const created = [];

            for (let i = 0; i < actualCount; i++) {
                const windowId = ++this._windowIdCounter;

                const slotId = this._resolveSlotForType(typeId);
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

            const visibleWindows = this.getVisibleWindows().map(w => ({ ...w }));
            visibleWindows.push(...created);

            const newCount = visibleWindows.length;
            const availableStyles = this._getAvailableStylesForCount(newCount);
            const styleExists = availableStyles.some(s => s.id === this.currentLayoutStyle);

            if (!styleExists) {
                if (newCount === 2) this.currentLayoutStyle = LayoutStyle.TWO_HORIZONTAL;
                else if (newCount === 3) this.currentLayoutStyle = LayoutStyle.THREE_BIG_LEFT;
                else if (newCount === 4) this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;
            }

            this._rebuildFromVisible(visibleWindows);
            this.render();
            this._notifyChange();

            for (const wd of created) {
                this._emitLayoutAction('add', wd);
                // ✅ НОВОЕ
                this._emitVisibilityChanged(wd.id, true);
            }

            return created;
        }

        // ============================================================
        // 9. ЗАКРЫТИЕ ОКНА
        // ============================================================

        closeWindow(id) {
            const sid = String(id);
            console.log(`[LayoutManager] Closing window: ${sid}`);

            const node = this.getNodeByWindowId(sid);
            const minimizedData = this._minimizedWindowsData.get(sid);

            if (!node && !minimizedData) {
                console.warn('[LayoutManager] closeWindow: not found:', sid);
                return false;
            }

            const wasVisible = !!node;
            const winType = node?.windowData?.type || minimizedData?.type || 'unknown';
            const winSlotId = node?.windowData?.slotId || minimizedData?.slotId || null;

            if (this._fullscreenWindowId === sid) {
                this.exitFullscreen(true);
            }

            this._minimizedWindowsData.delete(sid);

            const instance = this._windowInstances.get(sid);
            if (instance && typeof instance.destroy === 'function') {
                try { instance.destroy(); } catch (e) {}
            }
            this._windowInstances.delete(sid);

            if (this._registry && typeof this._registry.destroyWindow === 'function') {
                try { this._registry.destroyWindow(sid); } catch (e) {}
            }

            if (this._dataBus && winSlotId) {
                this._dataBus.detachWindowFromSlot(winSlotId, sid);
                const slot = this._dataBus.getSlot(winSlotId);
                if (slot && slot.attachedWindows.length === 0) {
                    this._dataBus.archiveSlot(winSlotId);
                }
            }

            const remainingVisible = this.getVisibleWindows()
                .filter(w => String(w.id) !== sid)
                .map(w => ({ ...w }));

            if (remainingVisible.length === 0) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                this._windowIdCounter = 0;
            } else {
                this._rebuildFromVisible(remainingVisible);
            }

            this.render();
            this._notifyChange();

            this._emitLayoutAction('remove', {
                id: sid,
                type: winType,
                slotId: winSlotId
            });

            // ✅ НОВОЕ: если было видимым — эмитим false (перед destroy)
            if (wasVisible) {
                this._emitVisibilityChanged(sid, false);
            }

            if (this._focusedWindowId === sid) {
                const remaining = this.getVisibleWindows();
                const nextId = remaining.length > 0 ? remaining[0].id : null;
                this.setFocusedWindow(nextId);
            }

            return true;
        }

        closeAll() {
            this.exitFullscreen(true);

            // ✅ НОВОЕ: собираем id видимых ДО очистки
            const visibleIds = this.getVisibleWindows().map(w => String(w.id));

            this._windowInstances.forEach((instance) => {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();

            if (this._dataBus) {
                const windows = this.getWindows();
                for (const w of windows) {
                    if (w.slotId) {
                        this._dataBus.detachWindowFromSlot(w.slotId, w.id);
                        const slot = this._dataBus.getSlot(w.slotId);
                        if (slot && slot.attachedWindows.length === 0) {
                            this._dataBus.archiveSlot(w.slotId);
                        }
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

            // ✅ НОВОЕ: эмитим false для всех, кто был видим
            for (const wid of visibleIds) {
                this._emitVisibilityChanged(wid, false);
            }

            return true;
        }

        // ============================================================
        // 10. SWAP
        // ============================================================

        swapWindows(windowId1, windowId2) {
            const s1 = String(windowId1);
            const s2 = String(windowId2);
            console.log(`[LayoutManager] Swapping windows: ${s1} <-> ${s2}`);

            if (s1 === s2) return true;

            if (this.isMinimized(s1) || this.isMinimized(s2)) {
                console.warn('[LayoutManager] swapWindows: cannot swap minimized windows');
                return false;
            }

            const node1 = this.getNodeByWindowId(s1);
            const node2 = this.getNodeByWindowId(s2);

            if (!node1 || !node2) {
                console.error('[LayoutManager] One or both windows not found');
                return false;
            }

            const tempData = node1.windowData;
            node1.windowData = node2.windowData;
            node2.windowData = tempData;

            const inst1 = this._windowInstances.get(s1);
            const inst2 = this._windowInstances.get(s2);

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
        // 11. УПРАВЛЕНИЕ СТИЛЕМ
        // ============================================================

        getAvailableStyles() {
            return this._getAvailableStylesForCount(this.getVisibleWindowCount());
        }

        _getAvailableStylesForCount(count) {
            if (count === 2) {
                return [
                    { id: LayoutStyle.TWO_HORIZONTAL, label: '2 Columns', icon: '⬌' },
                    { id: LayoutStyle.TWO_VERTICAL, label: '2 Rows', icon: '⬍' }
                ];
            }
            if (count === 3) {
                return [
                    { id: LayoutStyle.THREE_HORIZONTAL, label: '3 Columns', icon: '⬌' },
                    { id: LayoutStyle.THREE_VERTICAL, label: '3 Rows', icon: '⬍' },
                    { id: LayoutStyle.THREE_BIG_LEFT, label: 'Big Left + 2 Right', icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_RIGHT, label: 'Big Right + 2 Left', icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_TOP, label: 'Big Top + 2 Bottom', icon: '▣' },
                    { id: LayoutStyle.THREE_BIG_BOTTOM, label: 'Big Bottom + 2 Top', icon: '▣' }
                ];
            }
            if (count === 4) {
                return [
                    { id: LayoutStyle.FOUR_GRID_2X2, label: 'Grid 2x2', icon: '⊞' },
                    { id: LayoutStyle.FOUR_HORIZONTAL, label: '4 Columns', icon: '⬌' },
                    { id: LayoutStyle.FOUR_VERTICAL, label: '4 Rows', icon: '⬍' },
                    { id: LayoutStyle.FOUR_BIG_LEFT, label: 'Big Left + 3 Right', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_RIGHT, label: 'Big Right + 3 Left', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_TOP, label: 'Big Top + 3 Bottom', icon: '▣' },
                    { id: LayoutStyle.FOUR_BIG_BOTTOM, label: 'Big Bottom + 3 Top', icon: '▣' },
                    { id: LayoutStyle.FOUR_MIXED, label: 'Mixed (2+2)', icon: '⊞' }
                ];
            }
            return [];
        }

        setLayoutStyle(styleId) {
            const styles = this.getAvailableStyles();
            const style = styles.find(s => s.id === styleId);
            if (!style) return false;

            this.currentLayoutStyle = styleId;

            this._rebuildFromVisible(this.getVisibleWindows());

            this.render();
            this._notifyChange();
            this._emitLayoutAction('style', { styleId });
            return true;
        }

        getCurrentStyle() { return this.currentLayoutStyle; }

        _emitLayoutAction(action, data) {
            const event = new CustomEvent('layout-action', {
                detail: {
                    action,
                    ...data,
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(event);

            if (this._eventBus) {
                try { this._eventBus.emit('layout-action', { action, ...data }); } catch (e) {}
            }
        }

        // ✅ НОВОЕ: уведомление о смене видимости окна
        _emitVisibilityChanged(windowId, visible) {
            const wid = String(windowId);
            const detail = {
                windowId: wid,
                visible: !!visible,
                timestamp: Date.now()
            };

            document.dispatchEvent(new CustomEvent('window-visibility-changed', { detail }));

            if (this._eventBus) {
                try { this._eventBus.emit('window-visibility-changed', detail); } catch (e) {}
            }
        }

        // ============================================================
        // 12. ПЕРЕСТРОЙКА
        // ============================================================

        _rebuildFromVisible(visibleWindows) {
            const count = visibleWindows.length;

            if (count === 0) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
                return;
            }

            if (count === 1) {
                const w = visibleWindows[0];
                this.root = new LayoutNode({
                    type: NodeType.LEAF,
                    windowData: { ...w },
                    id: w.nodeId || generateId()
                });
                return;
            }

            const availableStyles = this._getAvailableStylesForCount(count);
            const styleExists = availableStyles.some(s => s.id === this.currentLayoutStyle);

            if (!styleExists) {
                if (count === 2) this.currentLayoutStyle = LayoutStyle.TWO_HORIZONTAL;
                else if (count === 3) this.currentLayoutStyle = LayoutStyle.THREE_BIG_LEFT;
                else if (count === 4) this.currentLayoutStyle = LayoutStyle.FOUR_GRID_2X2;
            }

            const newRoot = this._buildLayoutForStyle(this.currentLayoutStyle, visibleWindows);
            if (newRoot) this.root = newRoot;
        }

        _buildLayoutForStyle(style, windows) {
            const count = windows.length;

            if (count === 2) {
                switch (style) {
                    case LayoutStyle.TWO_HORIZONTAL: return this._buildTwoHorizontal(windows);
                    case LayoutStyle.TWO_VERTICAL: return this._buildTwoVertical(windows);
                    default: return this._buildTwoHorizontal(windows);
                }
            }
            if (count === 3) {
                switch (style) {
                    case LayoutStyle.THREE_HORIZONTAL: return this._buildThreeHorizontal(windows);
                    case LayoutStyle.THREE_VERTICAL: return this._buildThreeVertical(windows);
                    case LayoutStyle.THREE_BIG_LEFT: return this._buildThreeBigLeft(windows);
                    case LayoutStyle.THREE_BIG_RIGHT: return this._buildThreeBigRight(windows);
                    case LayoutStyle.THREE_BIG_TOP: return this._buildThreeBigTop(windows);
                    case LayoutStyle.THREE_BIG_BOTTOM: return this._buildThreeBigBottom(windows);
                    default: return this._buildThreeBigLeft(windows);
                }
            }
            if (count === 4) {
                switch (style) {
                    case LayoutStyle.FOUR_GRID_2X2: return this._buildFourGrid2x2(windows);
                    case LayoutStyle.FOUR_HORIZONTAL: return this._buildFourHorizontal(windows);
                    case LayoutStyle.FOUR_VERTICAL: return this._buildFourVertical(windows);
                    case LayoutStyle.FOUR_BIG_LEFT: return this._buildFourBigLeft(windows);
                    case LayoutStyle.FOUR_BIG_RIGHT: return this._buildFourBigRight(windows);
                    case LayoutStyle.FOUR_BIG_TOP: return this._buildFourBigTop(windows);
                    case LayoutStyle.FOUR_BIG_BOTTOM: return this._buildFourBigBottom(windows);
                    case LayoutStyle.FOUR_MIXED: return this._buildFourMixed(windows);
                    default: return this._buildFourGrid2x2(windows);
                }
            }

            return null;
        }

        _buildTwoHorizontal(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            return root;
        }

        _buildTwoVertical(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            return root;
        }

        _buildThreeHorizontal(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1/3 });
            for (const w of windows) root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...w }, id: w.nodeId || generateId() }));
            return root;
        }

        _buildThreeVertical(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1/3 });
            for (const w of windows) root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...w }, id: w.nodeId || generateId() }));
            return root;
        }

        _buildThreeBigLeft(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.4 });
            const rightSplit = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            rightSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            rightSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            root.addChild(rightSplit);
            return root;
        }

        _buildThreeBigRight(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.6 });
            const leftSplit = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            leftSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            leftSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            root.addChild(leftSplit);
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            return root;
        }

        _buildThreeBigTop(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            const bottomSplit = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            bottomSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            bottomSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            root.addChild(bottomSplit);
            return root;
        }

        _buildThreeBigBottom(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            const topSplit = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            topSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            topSplit.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            root.addChild(topSplit);
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            return root;
        }

        _buildFourGrid2x2(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            const left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            const right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            left.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            left.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            right.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            right.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            root.addChild(left);
            root.addChild(right);
            return root;
        }

        _buildFourHorizontal(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.25 });
            for (const w of windows) root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...w }, id: w.nodeId || generateId() }));
            return root;
        }

        _buildFourVertical(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.25 });
            for (const w of windows) root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...w }, id: w.nodeId || generateId() }));
            return root;
        }

        _buildFourBigLeft(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.4 });
            const right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1/3 });
            const splitBottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            right.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            splitBottom.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            splitBottom.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            right.addChild(splitBottom);
            root.addChild(right);
            return root;
        }

        _buildFourBigRight(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.6 });
            const left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 1/3 });
            const splitBottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.5 });
            left.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            splitBottom.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            splitBottom.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            left.addChild(splitBottom);
            root.addChild(left);
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            return root;
        }

        _buildFourBigTop(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            const bottom = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1/3 });
            const splitRight = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            bottom.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            splitRight.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            splitRight.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            bottom.addChild(splitRight);
            root.addChild(bottom);
            return root;
        }

        _buildFourBigBottom(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            const top = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 1/3 });
            const splitRight = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            top.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            splitRight.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            splitRight.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            top.addChild(splitRight);
            root.addChild(top);
            root.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            return root;
        }

        _buildFourMixed(windows) {
            const root = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.HORIZONTAL, ratio: 0.5 });
            const left = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.6 });
            const right = new LayoutNode({ type: NodeType.SPLIT, direction: SplitDirection.VERTICAL, ratio: 0.4 });
            left.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[0] }, id: windows[0].nodeId || generateId() }));
            left.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[1] }, id: windows[1].nodeId || generateId() }));
            right.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[2] }, id: windows[2].nodeId || generateId() }));
            right.addChild(new LayoutNode({ type: NodeType.LEAF, windowData: { ...windows[3] }, id: windows[3].nodeId || generateId() }));
            root.addChild(left);
            root.addChild(right);
            return root;
        }

        // ============================================================
        // 13. РЕНДЕРИНГ
        // ============================================================

        render() {
            if (!this.workspace) return;

            if (!this.root) {
                this.root = new LayoutNode({ type: NodeType.LEAF, windowData: null });
            }

            this.workspace.innerHTML = '';
            this._domMap.clear();

            const visibleWindows = this.getVisibleWindows();

            if (visibleWindows.length === 0) {
                this._renderEmptyWorkspace();
                this._updateWindowMap();
                this._scheduleResize();
                console.log('[LayoutManager] Render complete (empty/placeholder)');
                return;
            }

            let renderRoot;

            if (visibleWindows.length === 1) {
                const w = visibleWindows[0];
                renderRoot = new LayoutNode({
                    type: NodeType.LEAF,
                    windowData: { ...w },
                    id: w.nodeId || generateId()
                });
            } else {
                const styles = this._getAvailableStylesForCount(visibleWindows.length);
                const styleExists = styles.some(s => s.id === this.currentLayoutStyle);
                const style = styleExists ? this.currentLayoutStyle : styles[0]?.id;
                renderRoot = this._buildLayoutForStyle(style, visibleWindows);
            }

            if (!renderRoot) return;

            const element = this._buildDOM(renderRoot);
            if (element) this.workspace.appendChild(element);

            this._updateWindowMap();
            this._scheduleResize();

            console.log('[LayoutManager] Render complete, visible:',
                visibleWindows.length, ', minimized:',
                this._minimizedWindowsData.size);
        }

        _renderEmptyWorkspace() {
            const placeholder = document.createElement('div');
            placeholder.className = 'workspace-empty';
            placeholder.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                width: 100%;
                color: var(--text-muted, rgba(200,184,154,0.35));
                font-size: 14px;
                flex-direction: column;
                gap: 8px;
            `;
            placeholder.innerHTML = `
                <div style="font-size:48px;opacity:0.3;">
                    <svg class="icon-folder" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <div>Нет активных окон</div>
                <div style="font-size:11px;opacity:0.5;">Используйте меню «Window»</div>
            `;
            this.workspace.appendChild(placeholder);
        }

        _scheduleResize() {
            if (this._resizeRAF) {
                cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = null;
            }
            if (this._resizeTimer) {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = null;
            }

            this._resizeRAF = requestAnimationFrame(() => {
                this._resizeRAF = null;
                this._doResizeAll();

                this._resizeTimer = setTimeout(() => {
                    this._resizeTimer = null;
                    this._doResizeAll();
                }, 200);
            });
        }

        _doResizeAll() {
            this._windowInstances.forEach((instance) => {
                if (instance && typeof instance.resize === 'function') {
                    try { instance.resize(); } catch (e) {}
                }
            });
        }

        resizeAll() {
            this._doResizeAll();
        }

        _buildDOM(node) {
            if (node.isLeaf()) return this._buildLeafDOM(node);
            if (node.isSplit()) return this._buildSplitDOM(node);
            return null;
        }

        _buildLeafDOM(node) {
            const container = document.createElement('div');
            container.className = 'window-container';
            container.dataset.nodeId = node.id;
            container.dataset.windowId = node.windowData?.id || '';
            container.dataset.slotId = node.windowData?.slotId || '';

            Object.assign(container.style, {
                flex: '1 1 auto',
                minWidth: '0',
                minHeight: '0',
                maxWidth: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--bg-panel, #1a1a1a)',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: 'var(--radius, 6px)',
                margin: '0',
                padding: '0',
                height: '100%',
                width: '100%',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
            });

            this._domMap.set(node.id, container);

            if (!node.windowData) return container;

            const focusWindowId = node.windowData.id;
            container.addEventListener('mousedown', () => {
                this.setFocusedWindow(focusWindowId);
            }, true);

            const BaseWindow = window.BaseWindow;
            if (!BaseWindow) {
                console.error('[LayoutManager] BaseWindow not found');
                return container;
            }

            const windowId = node.windowData.id;
            const sid = String(windowId);
            const slotId = node.windowData.slotId;

            const existingBaseWindow = this._windowInstances.get(sid);

            if (existingBaseWindow && !existingBaseWindow.isDestroyed()) {
                if (existingBaseWindow.type === node.windowData.type) {
                    const rw = existingBaseWindow.getRenderWindow();
                    if (rw && rw._root) {
                        existingBaseWindow.container = container;
                        rw.container = container;
                        container.appendChild(rw._root);

                        if (slotId && existingBaseWindow.getSlotId() !== slotId) {
                            existingBaseWindow.attachTo(slotId);
                        }

                        console.log('[LayoutManager] Reused BaseWindow:', sid, '(slot:', slotId + ')');
                        return container;
                    }
                }

                try { existingBaseWindow.destroy(); } catch (e) {}
                this._windowInstances.delete(sid);
            }

            if (existingBaseWindow && existingBaseWindow.isDestroyed()) {
                this._windowInstances.delete(sid);
            }

            const typeId = node.windowData.type;
            const typeConfig = this._registry ? this._registry.getType(typeId) : null;

            let realInstance = null;

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
                const baseWindow = new BaseWindow({
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

                const placeholder = document.createElement('div');
                placeholder.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--text-muted);
                    font-size: 14px;
                `;
                placeholder.textContent = node.windowData.title + ' (Error)';
                container.appendChild(placeholder);
            }

            return container;
        }

        _buildSplitDOM(node) {
            const container = document.createElement('div');
            container.className = 'split-container';
            container.dataset.nodeId = node.id;

            const isHorizontal = node.direction === SplitDirection.HORIZONTAL;

            Object.assign(container.style, {
                display: 'flex',
                flex: '1 1 auto',
                minWidth: '0',
                minHeight: '0',
                position: 'relative',
                flexDirection: isHorizontal ? 'row' : 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                boxSizing: 'border-box'
            });

            this._domMap.set(node.id, container);

            const children = node.children;
            const childCount = children.length;
            const ratio = node.ratio;

            const childElements = [];
            const DIVIDER_SIZE = 4;

            children.forEach((child, index) => {
                const childElement = this._buildDOM(child);
                if (!childElement) return;

                let flexBasis;
                if (childCount === 2) {
                    const percent = index === 0 ? ratio : 1 - ratio;
                    flexBasis = `calc(${(percent * 100).toFixed(4)}% - ${DIVIDER_SIZE / 2}px)`;
                } else {
                    const totalDivider = DIVIDER_SIZE * (childCount - 1);
                    const perChild = `((100% - ${totalDivider}px) / ${childCount})`;
                    flexBasis = `calc(${perChild})`;
                }

                childElement.style.flex = `0 0 ${flexBasis}`;
                childElement.style.minWidth = '0';
                childElement.style.minHeight = '0';
                childElement.style.overflow = 'hidden';
                childElement.style.position = 'relative';
                childElement.style.boxSizing = 'border-box';

                container.appendChild(childElement);
                childElements.push(childElement);
            });

            if (childElements.length >= 2) {
                for (let i = childElements.length - 1; i > 0; i--) {
                    const divider = document.createElement('div');
                    divider.className = 'split-divider';
                    divider.dataset.nodeId = node.id;

                    Object.assign(divider.style, {
                        flex: `0 0 ${DIVIDER_SIZE}px`,
                        width: isHorizontal ? `${DIVIDER_SIZE}px` : '100%',
                        minWidth: isHorizontal ? `${DIVIDER_SIZE}px` : '0',
                        height: isHorizontal ? '100%' : `${DIVIDER_SIZE}px`,
                        minHeight: isHorizontal ? '0' : `${DIVIDER_SIZE}px`,
                        cursor: isHorizontal ? 'col-resize' : 'row-resize',
                        backgroundColor: 'rgba(200, 184, 154, 0.15)',
                        position: 'relative',
                        zIndex: '10',
                        flexShrink: '0',
                        flexGrow: '0',
                        transition: 'background-color 0.15s ease',
                        boxSizing: 'border-box',
                        alignSelf: 'stretch',
                        userSelect: 'none'
                    });

                    divider.addEventListener('mouseenter', function() {
                        this.style.backgroundColor = 'rgba(200, 184, 154, 0.4)';
                    });
                    divider.addEventListener('mouseleave', function() {
                        this.style.backgroundColor = 'rgba(200, 184, 154, 0.15)';
                    });

                    const dividerIndex = i;

                    divider.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        divider.style.backgroundColor = 'rgba(204, 34, 51, 0.5)';
                        document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
                        document.body.style.userSelect = 'none';

                        const startPos = isHorizontal ? e.clientX : e.clientY;

                        const leftElement = childElements[dividerIndex - 1];
                        const rightElement = childElements[dividerIndex];

                        const leftRect = leftElement.getBoundingClientRect();
                        const rightRect = rightElement.getBoundingClientRect();

                        const adjacentSize = (isHorizontal ? leftRect.width : leftRect.height) +
                                            (isHorizontal ? rightRect.width : rightRect.height);

                        const leftSize = isHorizontal ? leftRect.width : leftRect.height;
                        const currentLeftRatio = adjacentSize > 0 ? leftSize / adjacentSize : 0.5;

                        const onMouseMove = (ev) => {
                            const currentPos = isHorizontal ? ev.clientX : ev.clientY;
                            const deltaPixels = currentPos - startPos;
                            const deltaRatio = adjacentSize > 0 ? deltaPixels / adjacentSize : 0;

                            const newLeftRatio = Math.max(0.05, Math.min(0.95, currentLeftRatio + deltaRatio));

                            if (childCount === 2) {
                                node.ratio = newLeftRatio;
                                const p0 = (newLeftRatio * 100).toFixed(4);
                                const p1 = ((1 - newLeftRatio) * 100).toFixed(4);
                                childElements[0].style.flex = `0 0 calc(${p0}% - ${DIVIDER_SIZE / 2}px)`;
                                childElements[1].style.flex = `0 0 calc(${p1}% - ${DIVIDER_SIZE / 2}px)`;
                            } else {
                                const total = childElements.length;
                                const newLeftFlex = Math.max(0.05, Math.min(0.95, newLeftRatio));
                                const newRightFlex = 1 - newLeftFlex;
                                const totalDivider = DIVIDER_SIZE * (total - 1);

                                const pl = `calc(((100% - ${totalDivider}px) / ${total}) * ${newLeftFlex.toFixed(4)} * ${total})`;
                                const pr = `calc(((100% - ${totalDivider}px) / ${total}) * ${newRightFlex.toFixed(4)} * ${total})`;

                                leftElement.style.flex = `0 0 ${pl}`;
                                rightElement.style.flex = `0 0 ${pr}`;
                            }
                        };

                        const onMouseUp = () => {
                            divider.style.backgroundColor = 'rgba(200, 184, 154, 0.15)';
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                            this._notifyChange();
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    });

                    container.insertBefore(divider, childElements[i]);
                }
            }

            return container;
        }

        // ============================================================
        // 14. ОБНОВЛЕНИЕ MAP
        // ============================================================

        _updateWindowMap() {
            this._windowMap.clear();
            const windows = this.getVisibleWindows();
            windows.forEach(w => {
                const element = this._domMap.get(w.nodeId);
                if (element) {
                    this._windowMap.set(w.id, { node: w.node, element });
                }
            });
        }

        // ============================================================
        // 15. НОТИФИКАЦИЯ
        // ============================================================

        _notifyChange() {
            const event = new CustomEvent('layout-changed', {
                detail: {
                    windows: this.getWindows(),
                    visibleWindows: this.getVisibleWindows(),
                    minimizedWindows: Array.from(this._minimizedWindowsData.keys()),
                    fullscreenWindowId: this._fullscreenWindowId,
                    style: this.currentLayoutStyle
                }
            });
            document.dispatchEvent(event);

            if (this._eventBus) {
                this._eventBus.emit('layout-changed', {
                    windows: this.getWindows(),
                    visibleWindows: this.getVisibleWindows(),
                    minimizedWindows: Array.from(this._minimizedWindowsData.keys()),
                    fullscreenWindowId: this._fullscreenWindowId,
                    style: this.currentLayoutStyle
                });
            }
        }

        // ============================================================
        // 16. ЗАГРУЗКА ПО УМОЛЧАНИЮ
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
        // 17. СЕРИАЛИЗАЦИЯ
        // ============================================================

        getProjectData() {
            if (!this.root) return null;
            return {
                version: '1.2.0',
                layout: this.root.toJSON(),
                windowCounter: this._windowIdCounter,
                layoutStyle: this.currentLayoutStyle,
                minimizedWindows: Array.from(this._minimizedWindowsData.values()).map(w => ({
                    id: w.id,
                    type: w.type,
                    title: w.title,
                    icon: w.icon,
                    slotId: w.slotId
                })),
                fullscreenWindowId: this._fullscreenWindowId
            };
        }

        loadProjectData(data) {
            if (!data || !data.layout) return false;

            this._clearInstances();

            this.root = LayoutNode.fromJSON(data.layout);
            this._windowIdCounter = data.windowCounter || 0;
            this.currentLayoutStyle = data.layoutStyle || LayoutStyle.FOUR_GRID_2X2;

            this._minimizedWindowsData.clear();
            if (Array.isArray(data.minimizedWindows)) {
                for (const w of data.minimizedWindows) {
                    if (!w || w.id == null) continue;
                    const sid = String(w.id);
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

            return true;
        }

        renderLayout() { this.render(); }

        getLayoutData() { return this.getProjectData(); }

        loadLayoutData(data) { return this.loadProjectData(data); }

        _clearInstances() {
            if (!this._windowInstances) {
                this._windowInstances = new Map();
                return;
            }

            this._windowInstances.forEach((instance) => {
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); } catch (e) {}
                }
            });
            this._windowInstances.clear();
        }
    }

    // ============================================================
    // 18. ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            LayoutManager,
            LayoutNode,
            NodeType,
            SplitDirection,
            LayoutStyle
        };
    }

    if (typeof window !== 'undefined') {
        window.LayoutManager = LayoutManager;
        window.LayoutNode = LayoutNode;
        window.NodeType = NodeType;
        window.SplitDirection = SplitDirection;
        window.LayoutStyle = LayoutStyle;
        console.log('[LayoutManager] Registered globally v6.1.0');
    }

})();