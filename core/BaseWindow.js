// core/BaseWindow.js
// Версия 8.0.2
// - Fix v8.0.2: registerDragSource — [data-no-drag] теперь учитывает значение:
//     <el data-no-drag>            → блокирует (значение пустое)
//     <el data-no-drag="true">     → блокирует
//     <el data-no-drag="1">        → блокирует
//     <el data-no-drag="false">    → НЕ блокирует
//     <el data-no-drag="0">        → НЕ блокирует
//     <el data-no-drag="no">       → НЕ блокирует
//   Раньше closest('[data-no-drag]') матчил по факту наличия атрибута
//   независимо от значения — это ломало случаи, когда разработчик писал
//   data-no-drag="false" в расчёте на противоположное поведение.
// - Fix v8.0.2: registerDragSource — добавлен preventDefault на 'dragstart'
//   (защита от native HTML5 drag&drop, который мог перебить кастомный ghost).
//   Если элементу нужен native drag — ставим data-allow-native-drag="true".
// - v8.0.1: _setupDropTarget / _teardownDropTarget — корректная работа
//           при reuse контейнера.
// - v8.0.0: headerItems only.

(function() {
    'use strict';

    console.log('[BaseWindow] Loading v8.0.2...');

    class BaseWindow {
        constructor({ id, type, container, options = {} }) {
            this.id = id;
            this.type = type;
            this.container = container;
            this.options = options;

            this._themeObserver = null;
            this._themeUnsubscribe = null;

            this._dataBus = options.dataBus || null;
            this._registry = options.registry || null;
            this._eventBus = options.eventBus || null;
            this._layoutManager = options.layoutManager || null;
            this._messageBus = options.messageBus || null;

            this._realInstance = options._realInstance || null;
            this._realInstanceSet = !!this._realInstance;

            if (this._realInstance) {
                this._realInstance._baseWindow = this;
            }

            this._slotId = options.slotId || null;

            this._isReady = false;
            this._isDestroyed = false;
            this._isLoading = false;
            this._isSaving = false;
            this._isFocused = false;
            this._isVisible = true;
            this._visibilityObserver = null;

            this._visibilityUnsub = null;

            this._requestUnsubs = [];

            this._metadata = {};
            this._data = null;
            this._config = {};
            this._uiState = {};

            this._typeConfig = this._registry ? this._registry.getType(type) : null;
            this._title = this._typeConfig?.name || type || 'Window';
            this._icon = this._typeConfig?.icon || '📄';

            this._renderWindow = null;

            this._subscriptions = [];
            this._slotUnsubscribe = null;
            this._messageUnsubscribe = null;
            this._layoutUnsubscribe = null;
            this._hotkeyUnsub = null;

            this._dragState = null;
            this._dropHandlers = null;
            this._dropConfig = null;
            this._dropUnsub = null;

            this._init();
        }

        // ============================================================
        // 0. HEADER ITEMS RESOLVER
        // ============================================================

        _resolveHeaderItems() {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.getHeaderItems === 'function') {
                try {
                    const items = realInstance.getHeaderItems();
                    if (Array.isArray(items)) {
                        return items.filter(x => x && typeof x === 'object');
                    }
                } catch (e) {
                    console.warn('[BaseWindow] realInstance.getHeaderItems error:', e);
                }
            }

            if (this._registry && typeof this._registry.getTypeHeaderItems === 'function') {
                const items = this._registry.getTypeHeaderItems(this.type);
                if (Array.isArray(items) && items.length > 0) {
                    return items;
                }
            }

            if (this._typeConfig && Array.isArray(this._typeConfig.headerItems)) {
                return this._typeConfig.headerItems.slice();
            }

            return [];
        }

        // ============================================================
        // 1. ИНИЦИАЛИЗАЦИЯ
        // ============================================================

        _init() {
            console.log('[BaseWindow] Initializing:', this.type, '(', this.id, ')',
                'slot:', this._slotId);

            const RenderWindow = window.RenderWindow;
            if (!RenderWindow) {
                console.error('[BaseWindow] RenderWindow not found!');
                return;
            }

            if (this._registry) {
                const typeConfig = this._registry.getType(this.type);
                if (typeConfig) {
                    this._typeConfig = typeConfig;
                    this._title = typeConfig.name || this._title;
                    this._icon = typeConfig.icon || this._icon;
                }
            }

            let contextMenu = [];
            if (this._typeConfig) {
                if (typeof this._typeConfig.contextMenu === 'function') {
                    try {
                        const result = this._typeConfig.contextMenu(this, null, this._layoutManager);
                        contextMenu = Array.isArray(result) ? result : [];
                    } catch (e) {
                        console.warn('[BaseWindow] contextMenu error:', e);
                        contextMenu = [];
                    }
                } else if (Array.isArray(this._typeConfig.contextMenu)) {
                    contextMenu = this._typeConfig.contextMenu;
                }
            }

            const headerItems = this._resolveHeaderItems();

            this._renderWindow = new RenderWindow({
                container: this.container,
                type: this.type,
                options: {
                    id: this.id,
                    title: this._title,
                    icon: this._icon,
                    registry: this._registry,
                    layoutManager: this._layoutManager,
                    headerItems: headerItems,
                    contextMenu: contextMenu,
                    baseWindow: this
                }
            });

            this._renderWindow.on('close', () => this._onRenderClose());
            this._renderWindow.on('change-type', (data) => this._onRenderChangeType(data));
            this._renderWindow.on('layout-change', (data) => this._onRenderLayoutChange(data));
            this._renderWindow.on('menu-action', (data) => this._onRenderMenuAction(data));
            this._renderWindow.on('resize', (data) => this._onRenderResize(data));
            this._renderWindow.on('swap', (data) => this._onRenderSwap(data));

            this._renderWindow.on('data-import', () => this._onDataImport());
            this._renderWindow.on('data-export', () => this._onDataExport());
            this._renderWindow.on('data-new-slot', () => this._onDataNewSlot());
            this._renderWindow.on('data-attach', (data) => this._onDataAttach(data));

            this._renderWindow.on('minimize', () => this._onRenderMinimize());
            this._renderWindow.on('fullscreen', () => this._onRenderFullscreen());
            this._renderWindow.on('fullscreen-exit', () => this._onRenderFullscreenExit());

            this._subscribeToSlot();
            this._subscribeToMessages();
            this._loadFromSlot();
            this._setupLayoutListener();
            this._setupThemeSubscription();
            this._setupVisibilityObserver();
            this._setupVisibilityEventListener();
            this._setupDropTarget();
            this._registerHotkeys();

            this._syncFullscreenState();

            this._isReady = true;
            this._onReady();

            setTimeout(() => {
                if (this._renderWindow) {
                    this._renderWindow.resize();
                }
            }, 50);

            this._emit('window-ready', {
                id: this.id,
                type: this.type,
                title: this._title,
                slotId: this._slotId
            });

            console.log('[BaseWindow] ✅ Ready:', this.type, '(', this.id, ')',
                'slot:', this._slotId,
                'headerItems:', headerItems.length);
        }

        // ============================================================
        // 2. SLOT MANAGEMENT
        // ============================================================

        getSlotId() {
            return this._slotId;
        }

        getSlotWindows() {
            if (!this._dataBus || !this._slotId) return [];
            return this._dataBus.getSlotWindows(this._slotId);
        }

        attachTo(slotId) {
            if (!this._dataBus) {
                console.warn('[BaseWindow] attachTo: DataBus not available');
                return this;
            }

            const sid = String(slotId);
            const slot = this._dataBus.getSlot(sid);
            if (!slot) {
                console.warn('[BaseWindow] attachTo: slot not found:', sid);
                return this;
            }

            if (slot.type !== this.type) {
                console.warn('[BaseWindow] attachTo: type mismatch',
                    '(slot:', slot.type + ', window:', this.type + ')');
                return this;
            }

            if (this._slotUnsubscribe) {
                this._slotUnsubscribe();
                this._slotUnsubscribe = null;
            }

            if (this._slotId && this._slotId !== sid) {
                this._dataBus.detachWindowFromSlot(this._slotId, this.id);
            }

            this._slotId = sid;
            this._dataBus.attachWindowToSlot(sid, this.id);

            this._subscribeToSlot();
            this._loadFromSlot();
            this._updateContent();
            this.resize();

            this._emit('window-slot-changed', {
                id: this.id,
                type: this.type,
                slotId: sid
            });

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.onSlotChange === 'function') {
                try { realInstance.onSlotChange(sid); } catch (e) {
                    console.error('[BaseWindow] onSlotChange error:', e);
                }
            }

            console.log('[BaseWindow] Attached to slot:', sid);
            return this;
        }

        createEmptySlot() {
            if (!this._dataBus) {
                console.warn('[BaseWindow] createEmptySlot: DataBus not available');
                return this;
            }

            if (this._slotUnsubscribe) {
                this._slotUnsubscribe();
                this._slotUnsubscribe = null;
            }

            const oldSlotId = this._slotId;

            if (oldSlotId) {
                this._dataBus.detachWindowFromSlot(oldSlotId, this.id);
            }

            const newSlotId = this._dataBus.createSlot(this.type);
            if (!newSlotId) {
                console.error('[BaseWindow] createEmptySlot: failed to create slot');
                if (oldSlotId) {
                    this._dataBus.attachWindowToSlot(oldSlotId, this.id);
                    this._subscribeToSlot();
                }
                return this;
            }

            this._slotId = newSlotId;
            this._dataBus.attachWindowToSlot(newSlotId, this.id);

            if (oldSlotId) {
                const oldSlot = this._dataBus.getSlot(oldSlotId);
                if (oldSlot && oldSlot.attachedWindows.length === 0) {
                    this._dataBus.archiveSlot(oldSlotId);
                }
            }

            this._subscribeToSlot();

            this._metadata = {};
            this._data = null;
            this._uiState = {};

            this._updateContent();
            this.resize();

            this._emit('window-slot-changed', {
                id: this.id,
                type: this.type,
                slotId: newSlotId,
                oldSlotId: oldSlotId
            });

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.onSlotChange === 'function') {
                try { realInstance.onSlotChange(newSlotId); } catch (e) {
                    console.error('[BaseWindow] onSlotChange error:', e);
                }
            }

            console.log('[BaseWindow] Created new slot:', newSlotId, '(old:', oldSlotId + ')');
            return this;
        }

        // ============================================================
        // 3. MINIMIZE / FULLSCREEN
        // ============================================================

        minimize() {
            if (!this._layoutManager) return false;
            return this._layoutManager.minimizeWindow(this.id);
        }

        isMinimized() {
            if (!this._layoutManager) return false;
            return this._layoutManager.isMinimized(this.id);
        }

        setFullscreen() {
            if (!this._layoutManager) return false;
            return this._layoutManager.setFullscreen(this.id);
        }

        exitFullscreen() {
            if (!this._layoutManager) return false;
            return this._layoutManager.exitFullscreen();
        }

        isFullscreen() {
            if (!this._layoutManager) return false;
            return this._layoutManager.isFullscreen(this.id);
        }

        toggleFullscreen() {
            if (this.isFullscreen()) {
                return this.exitFullscreen();
            }
            return this.setFullscreen();
        }

        // ============================================================
        // 3.1. VISIBILITY
        // ============================================================

        isVisible() {
            return !!this._isVisible;
        }

        _setupVisibilityEventListener() {
            if (typeof document === 'undefined') return;

            const handler = (e) => {
                if (!e || !e.detail) return;
                if (String(e.detail.windowId) !== String(this.id)) return;
                this._handleVisibilityChanged(!!e.detail.visible);
            };

            document.addEventListener('window-visibility-changed', handler);

            this._visibilityUnsub = () => {
                document.removeEventListener('window-visibility-changed', handler);
            };
        }

        _handleVisibilityChanged(visible) {
            if (this._isDestroyed) return;

            const next = !!visible;
            if (next === this._isVisible) return;

            this._isVisible = next;

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.onVisibilityChange === 'function') {
                try {
                    realInstance.onVisibilityChange(next);
                } catch (e) {
                    console.error('[BaseWindow] onVisibilityChange error:', e);
                }
            }

            this._emit('window-visibility-changed', {
                id: this.id,
                type: this.type,
                visible: next
            });
        }

        // ============================================================
        // 3.2. KEYBOARD CAPTURE
        // ============================================================

        captureKeyboard() {
            if (!window.hotkeyRegistry) {
                console.warn('[BaseWindow] captureKeyboard: hotkeyRegistry not available');
                return false;
            }
            return window.hotkeyRegistry.captureKeyboard(this.id);
        }

        releaseKeyboard() {
            if (!window.hotkeyRegistry) return false;
            return window.hotkeyRegistry.releaseKeyboard(this.id);
        }

        isKeyboardCaptured() {
            if (!window.hotkeyRegistry) return false;
            return window.hotkeyRegistry.getCapturedWindow() === String(this.id);
        }

        // ============================================================
        // 3.3. FIND WINDOW BY TYPE
        // ============================================================

        findWindowByType(typeId) {
            if (!typeId || !this._layoutManager) return null;

            const myId = String(this.id);

            if (typeof this._layoutManager.getVisibleWindowsByType === 'function') {
                const visible = this._layoutManager.getVisibleWindowsByType(typeId);
                for (const w of visible) {
                    if (String(w.id) !== myId) {
                        return {
                            id: w.id,
                            type: w.type,
                            slotId: w.slotId,
                            title: w.title,
                            icon: w.icon
                        };
                    }
                }
            }

            if (typeof this._layoutManager.getMinimizedWindowsByType === 'function') {
                const minimized = this._layoutManager.getMinimizedWindowsByType(typeId);
                for (const w of minimized) {
                    if (String(w.id) !== myId) {
                        return {
                            id: w.id,
                            type: w.type,
                            slotId: w.slotId,
                            title: w.title,
                            icon: w.icon
                        };
                    }
                }
            }

            const all = this._layoutManager.getWindows();
            for (const w of all) {
                if (w.type === typeId && String(w.id) !== myId) {
                    return {
                        id: w.id,
                        type: w.type,
                        slotId: w.slotId,
                        title: w.title,
                        icon: w.icon
                    };
                }
            }

            return null;
        }

        findWindowsByType(typeId) {
            if (!typeId || !this._layoutManager) return [];

            const myId = String(this.id);
            const result = [];

            if (typeof this._layoutManager.getVisibleWindowsByType === 'function') {
                for (const w of this._layoutManager.getVisibleWindowsByType(typeId)) {
                    if (String(w.id) === myId) continue;
                    result.push({
                        id: w.id,
                        type: w.type,
                        slotId: w.slotId,
                        title: w.title,
                        icon: w.icon
                    });
                }
            }

            if (typeof this._layoutManager.getMinimizedWindowsByType === 'function') {
                for (const w of this._layoutManager.getMinimizedWindowsByType(typeId)) {
                    if (String(w.id) === myId) continue;
                    result.push({
                        id: w.id,
                        type: w.type,
                        slotId: w.slotId,
                        title: w.title,
                        icon: w.icon
                    });
                }
            }

            if (result.length === 0) {
                for (const w of this._layoutManager.getWindows()) {
                    if (w.type === typeId && String(w.id) !== myId) {
                        result.push({
                            id: w.id,
                            type: w.type,
                            slotId: w.slotId,
                            title: w.title,
                            icon: w.icon
                        });
                    }
                }
            }

            return result;
        }

        // ============================================================
        // 4. РЕАЛЬНЫЙ ЭКЗЕМПЛЯР
        // ============================================================

        setRealInstance(instance) {
            if (this._realInstanceSet && this._realInstance) {
                console.warn('[BaseWindow] Real instance already set for', this.id);
                return this;
            }

            this._realInstance = instance;
            this._realInstanceSet = true;

            if (instance) {
                instance._baseWindow = this;
            }

            if (this._isReady && this._renderWindow) {
                this.refreshHeaderItems();
                this._updateContent();
                this._renderWindow.resize();
            }

            console.log('[BaseWindow] Real instance set for', this.id);
            return this;
        }

        getRealInstance() {
            if (this._realInstance && this._realInstanceSet) {
                return this._realInstance;
            }
            return this;
        }

        hasRealInstance() {
            return this._realInstanceSet && !!this._realInstance;
        }

        // ============================================================
        // 5. HEADER ITEMS
        // ============================================================

        refreshHeaderItems() {
            if (this._isDestroyed || !this._renderWindow) return false;

            const items = this._resolveHeaderItems();

            try {
                this._renderWindow.setHeaderItems(items);
            } catch (e) {
                console.error('[BaseWindow] refreshHeaderItems error:', e);
                return false;
            }

            return true;
        }

        getRenderedHeaderItems() {
            if (!this._renderWindow) return [];
            if (typeof this._renderWindow.getHeaderItems !== 'function') return [];
            return this._renderWindow.getHeaderItems();
        }

        // ============================================================
        // 6. ЖИЗНЕННЫЙ ЦИКЛ
        // ============================================================

        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            this._isReady = false;

            if (window.hotkeyRegistry
                && window.hotkeyRegistry.getCapturedWindow() === String(this.id)) {
                try { window.hotkeyRegistry.releaseKeyboard(this.id); } catch (e) {}
            }

            if (this._dropUnsub) {
                try { this._dropUnsub(); } catch (e) {}
                this._dropUnsub = null;
            }
            this._dropConfig = null;

            this._teardownDropTarget(this.container);

            if (this.isFullscreen()) {
                try { this.exitFullscreen(); } catch (e) {}
            }

            if (this._realInstance && typeof this._realInstance.destroy === 'function') {
                try {
                    this._realInstance.destroy();
                } catch (e) {
                    console.warn('[BaseWindow] Error destroying real instance:', e);
                }
            }
            this._realInstance = null;
            this._realInstanceSet = false;

            if (this._renderWindow) {
                const host = this._renderWindow.getContent?.();
                if (host && host.__lsResizeObserver) {
                    try { host.__lsResizeObserver.disconnect(); } catch (e) {}
                    host.__lsResizeObserver = null;
                }
                this._renderWindow.destroy();
                this._renderWindow = null;
            }

            this._unregisterHotkeys();

            if (this._slotUnsubscribe) {
                this._slotUnsubscribe();
                this._slotUnsubscribe = null;
            }

            if (this._dataBus && this._slotId) {
                this._dataBus.detachWindowFromSlot(this._slotId, this.id);
            }

            if (this._messageUnsubscribe) {
                this._messageUnsubscribe();
                this._messageUnsubscribe = null;
            }
            if (this._themeUnsubscribe) {
                this._themeUnsubscribe();
                this._themeUnsubscribe = null;
            }
            if (this._layoutUnsubscribe) {
                this._layoutUnsubscribe();
                this._layoutUnsubscribe = null;
            }

            if (this._visibilityUnsub) {
                try { this._visibilityUnsub(); } catch (e) {}
                this._visibilityUnsub = null;
            }

            if (this._visibilityObserver) {
                this._visibilityObserver.disconnect();
                this._visibilityObserver = null;
            }

            for (const unsub of this._requestUnsubs) {
                try { unsub(); } catch (e) {}
            }
            this._requestUnsubs = [];

            this._subscriptions.forEach(unsub => {
                try { unsub(); } catch (e) {}
            });
            this._subscriptions = [];

            this._emit('window-destroyed', {
                id: this.id,
                type: this.type,
                slotId: this._slotId
            });

            console.log('[BaseWindow] Destroyed:', this.type, '(', this.id, ')');
        }

        // ============================================================
        // 7. RESIZE
        // ============================================================

        resize() {
            if (this._isDestroyed) return;

            if (this._renderWindow) this._renderWindow.resize();

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.resize === 'function') {
                try { realInstance.resize(); } catch (e) {}
            }
        }

        _onRenderResize(data) {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.resize === 'function') {
                try {
                    realInstance.resize();
                } catch (e) {
                    console.warn('[BaseWindow] Error in real instance resize:', e);
                }
            }

            this._onResize();
            this._emit('window-resized', {
                id: this.id,
                type: this.type,
                slotId: this._slotId,
                width: data.width,
                height: data.height
            });
        }

        // ============================================================
        // 8. ОБНОВЛЕНИЕ КОНТЕНТА
        // ============================================================

        _updateContent() {
            if (!this._renderWindow) return;

            const realInstance = this.getRealInstance();

            let root = null;
            if (realInstance && realInstance !== this) {
                if (realInstance._root) root = realInstance._root;
                else if (typeof realInstance.getRoot === 'function') {
                    try { root = realInstance.getRoot(); } catch (e) {}
                }

                if (!root) {
                    root = document.createElement('div');
                    root.className = 'real-instance-root';
                    realInstance._root = root;
                }
            }

            this._renderWindow.setContent(root);

            if (!root) return;

            this._ensureRealInstanceFillsHost(root, this._renderWindow.getContent());
            this._ensureRealInstanceObserver(realInstance, this._renderWindow.getContent());

            requestAnimationFrame(() => {
                if (realInstance && typeof realInstance.resize === 'function') {
                    try { realInstance.resize(); } catch (e) {}
                }
            });
        }

        _ensureRealInstanceFillsHost(root, host) {
            if (!root || !host) return;

            const pos = root.style.position;
            if (pos === 'absolute' || pos === 'fixed') return;

            root.style.position = 'absolute';
            root.style.top = '0';
            root.style.left = '0';
            root.style.right = '0';
            root.style.bottom = '0';
            root.style.width = '100%';
            root.style.height = '100%';
            root.style.boxSizing = 'border-box';

            if (!root.style.overflow) {
                root.style.overflow = 'hidden';
            }
        }

        _ensureRealInstanceObserver(realInstance, host) {
            if (!host || typeof ResizeObserver === 'undefined') return;
            if (!realInstance) return;

            const hasResize = typeof realInstance.resize === 'function';

            if (host.__lsResizeObserver) {
                try { host.__lsResizeObserver.disconnect(); } catch (e) {}
                host.__lsResizeObserver = null;
            }

            if (!hasResize) return;

            let raf = null;
            const observer = new ResizeObserver(() => {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    raf = null;
                    try { realInstance.resize(); } catch (e) {}
                });
            });

            observer.observe(host);
            host.__lsResizeObserver = observer;
        }

        _setupThemeSubscription() {
            if (typeof MutationObserver === 'undefined') return;

            const handler = () => {
                if (this._isDestroyed) return;

                const realInstance = this.getRealInstance();
                if (!realInstance || realInstance === this) return;

                if (typeof realInstance.onThemeChange === 'function') {
                    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
                    try {
                        realInstance.onThemeChange(theme);
                    } catch (e) {
                        console.error('[BaseWindow] onThemeChange error:', e);
                    }
                }
            };

            this._themeObserver = new MutationObserver(handler);
            this._themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-theme']
            });

            this._themeUnsubscribe = () => {
                if (this._themeObserver) {
                    this._themeObserver.disconnect();
                    this._themeObserver = null;
                }
            };
        }

        _setupVisibilityObserver() {
            if (typeof IntersectionObserver === 'undefined') return;

            const target = this.container;
            if (!target) return;

            this._visibilityObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const rect = entry.boundingClientRect;
                    if (rect.width === 0 || rect.height === 0) continue;

                    const visible = entry.isIntersecting;
                    this._handleVisibilityChanged(visible);
                }
            }, { threshold: 0.05 });

            this._visibilityObserver.observe(target);
        }

        // ============================================================
        // 8.1. ХОТКЕИ ОКНА
        // ============================================================

        _registerHotkeys() {
            if (!window.hotkeyRegistry) return;

            const realInstance = this.getRealInstance();
            if (!realInstance || realInstance === this) return;

            if (typeof realInstance.getHotkeys !== 'function') return;

            if (this._hotkeyUnsub) {
                try { this._hotkeyUnsub(); } catch (e) {}
                this._hotkeyUnsub = null;
            }

            let map;
            try {
                map = realInstance.getHotkeys();
            } catch (e) {
                console.error('[BaseWindow] getHotkeys error:', e);
                return;
            }

            if (!map || typeof map !== 'object') return;

            this._hotkeyUnsub = window.hotkeyRegistry.registerWindowMap(
                this.id,
                map,
                { source: this.type }
            );

            console.log('[BaseWindow] Hotkeys registered for', this.id,
                '(' + Object.keys(map).length + ')');
        }

        _unregisterHotkeys() {
            if (this._hotkeyUnsub) {
                try { this._hotkeyUnsub(); } catch (e) {}
                this._hotkeyUnsub = null;
            }
            if (window.hotkeyRegistry) {
                window.hotkeyRegistry.unregisterWindow(this.id);
            }
        }

        registerHotkeys() {
            this._registerHotkeys();
        }

        // ============================================================
        // 8.2. DROP TARGET
        // ============================================================

        registerDropTarget(options) {
            if (!options || typeof options.onDrop !== 'function') {
                console.warn('[BaseWindow] registerDropTarget: onDrop is required');
                return () => {};
            }

            if (this._dropUnsub) {
                try { this._dropUnsub(); } catch (e) {}
                this._dropUnsub = null;
            }

            const token = Symbol('dropTarget');
            const config = { ...options, _token: token };
            this._dropConfig = config;

            const self = this;
            const unsubscribe = () => {
                if (self._dropConfig && self._dropConfig._token === token) {
                    self._dropConfig = null;
                    if (self._dropUnsub) self._dropUnsub = null;
                }
            };

            this._dropUnsub = unsubscribe;

            console.log('[BaseWindow] registerDropTarget:', this.id,
                'acceptExtensions:', options.acceptExtensions || '—',
                'accept:', options.accept ? options.accept.join(',') : '—');

            return unsubscribe;
        }

        getDropTarget() {
            if (this._dropConfig) return this._dropConfig;

            const ri = this.getRealInstance();
            if (ri && ri !== this && typeof ri.getDropTarget === 'function') {
                try {
                    const legacy = ri.getDropTarget();
                    if (legacy && typeof legacy.onDrop === 'function') {
                        return legacy;
                    }
                } catch (e) {
                    console.error('[BaseWindow] legacy getDropTarget error:', e);
                }
            }

            return null;
        }

        isDropTarget() {
            return true;
        }

        _getEffectiveDropConfig() {
            if (this._dropConfig) return this._dropConfig;

            const ri = this.getRealInstance();
            if (ri && ri !== this && typeof ri.getDropTarget === 'function') {
                try {
                    const legacy = ri.getDropTarget();
                    if (legacy && typeof legacy.onDrop === 'function') {
                        return legacy;
                    }
                } catch (e) {
                    console.error('[BaseWindow] legacy getDropTarget error:', e);
                }
            }

            return null;
        }

        _buildFilesMeta(dt) {
            const names = [];
            const types = [];
            if (dt && dt.files) {
                for (let i = 0; i < dt.files.length; i++) {
                    const f = dt.files[i];
                    names.push(f.name || '');
                    types.push(f.type || '');
                }
            }
            return {
                source: 'files',
                fileNames: names,
                fileTypes: types
            };
        }

        _buildInternalMeta(dragData) {
            return {
                source: 'internal',
                sourceWindowId: this.id,
                sourceType: this.type,
                channel: dragData.channel,
                payload: dragData.payload
            };
        }

        _callOnDragEnter(meta) {
            const config = this._getEffectiveDropConfig();
            if (!config || typeof config.onDragEnter !== 'function') return true;

            try {
                config.onDragEnter(meta);
            } catch (e) {
                console.error('[BaseWindow] onDragEnter error:', e);
            }
            return true;
        }

        _callOnDragLeave() {
            const config = this._getEffectiveDropConfig();
            if (!config || typeof config.onDragLeave !== 'function') return;

            try {
                config.onDragLeave();
            } catch (e) {
                console.error('[BaseWindow] onDragLeave error:', e);
            }
        }

        async _callOnDrop(files, meta) {
            const config = this._getEffectiveDropConfig();
            if (!config || typeof config.onDrop !== 'function') {
                return null;
            }

            try {
                const result = await Promise.resolve(config.onDrop(files, meta));
                return result;
            } catch (e) {
                console.error('[BaseWindow] onDrop error:', e);
                return null;
            }
        }

        _setupDropTarget() {
            if (!this.container) return;

            if (this.container.__lsDropBound) {
                if (this.container.__lsDropHandlers === this._dropHandlers) {
                    return;
                }
                this._teardownDropTarget(this.container);
            }

            this.container.__lsDropBound = true;

            const onDragEnter = (e) => {
                if (!this._shouldAcceptDrop(e)) return;
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.add('ls-drop-hover');

                const meta = this._buildFilesMeta(e.dataTransfer);
                this._callOnDragEnter(meta);
            };

            const onDragOver = (e) => {
                if (!this._shouldAcceptDrop(e)) return;
                e.preventDefault();
                e.stopPropagation();

                try {
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'copy';
                    }
                } catch (err) {}

                this.container.classList.add('ls-drop-hover');
            };

            const onDragLeave = (e) => {
                const related = e.relatedTarget;
                if (related && this.container.contains(related)) return;
                this.container.classList.remove('ls-drop-hover');
                this._callOnDragLeave();
            };

            const onDrop = (e) => {
                this.container.classList.remove('ls-drop-hover');

                if (!this._shouldAcceptDrop(e)) return;
                e.preventDefault();
                e.stopPropagation();

                this._handleDrop(e);
            };

            this.container.addEventListener('dragenter', onDragEnter, false);
            this.container.addEventListener('dragover', onDragOver, false);
            this.container.addEventListener('dragleave', onDragLeave, false);
            this.container.addEventListener('drop', onDrop, false);

            this._dropHandlers = { onDragEnter, onDragOver, onDragLeave, onDrop };
            this.container.__lsDropHandlers = this._dropHandlers;
        }

        _teardownDropTarget(container) {
            if (!container || !this._dropHandlers) return;

            const h = this._dropHandlers;
            try { container.removeEventListener('dragenter', h.onDragEnter); } catch (e) {}
            try { container.removeEventListener('dragover', h.onDragOver); } catch (e) {}
            try { container.removeEventListener('dragleave', h.onDragLeave); } catch (e) {}
            try { container.removeEventListener('drop', h.onDrop); } catch (e) {}

            if (container.__lsDropHandlers === h) {
                container.__lsDropBound = false;
                container.__lsDropHandlers = null;
            }

            this._dropHandlers = null;
        }

        _shouldAcceptDrop(e) {
            const dt = e.dataTransfer;
            if (!dt) return false;
            return dt.types && dt.types.indexOf('Files') !== -1;
        }

        async _handleDrop(e) {
            const dt = e.dataTransfer;
            const files = [];
            if (dt.files && dt.files.length > 0) {
                for (let i = 0; i < dt.files.length; i++) {
                    files.push(dt.files[i]);
                }
            }

            if (files.length === 0) return;

            const meta = this._buildFilesMeta(dt);
            this._callOnDragEnter(meta);

            const config = this._getEffectiveDropConfig();
            if (!config) {
                console.log('[BaseWindow] drop ignored (no config):', this.id);
                return;
            }

            const multiple = config.multiple !== false;
            if (!multiple && files.length > 1) {
                this.notify('Не подходит', 'Можно только один файл', 'warning');
                return;
            }

            const filtered = this._filterFiles(files, config);
            if (filtered.length === 0) {
                this.notify('Не подходит', 'Файлы не подходят по формату', 'warning');
                return;
            }

            const ok = await this._callOnDrop(filtered, meta);

            if (ok === false) {
                this.notify('Не подходит', 'Окно отклонило файлы', 'warning');
            }
        }

        _filterFiles(files, config) {
            const { accept, acceptExtensions } = config;

            if (!accept && !acceptExtensions) return files;

            const extList = acceptExtensions
                ? String(acceptExtensions).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                : null;

            const acceptList = Array.isArray(accept)
                ? accept
                : (typeof accept === 'string' ? [accept] : []);

            return files.filter(file => {
                const name = (file.name || '').toLowerCase();
                const rawMime = (file.type || '').toLowerCase();
                const mime = rawMime.split(';')[0].trim();

                if (extList && extList.length > 0) {
                    if (extList.some(ext => name.endsWith(ext))) return true;
                }

                if (acceptList.length > 0) {
                    for (const a of acceptList) {
                        const rule = String(a).toLowerCase().trim();
                        if (rule === '*') return true;
                        if (rule.endsWith('/*')) {
                            const prefix = rule.slice(0, -1);
                            if (mime.startsWith(prefix)) return true;
                        } else if (rule.startsWith('.')) {
                            if (name.endsWith(rule)) return true;
                        } else if (rule === mime) {
                            return true;
                        }
                    }
                }

                return false;
            });
        }

        // ============================================================
        // 8.3. DRAG SOURCE
        // ============================================================
        //
        // registerDragSource(element, options) — делает element источником drag.
        //
        // Семантика [data-no-drag]:
        //   Значение интерпретируется как "no-drag", если оно пустое,
        //   'true', '1' или 'yes'. Значения 'false', '0', 'no' считаются
        //   "разрешить drag".
        //
        //   Это позволяет писать:
        //     <div data-no-drag>               <!-- блокирует -->
        //     <div data-no-drag="true">        <!-- блокирует -->
        //     <div data-no-drag="false">       <!-- НЕ блокирует -->
        //
        //   Раньше closest('[data-no-drag]') матчил по факту наличия атрибута
        //   и игнорировал значение — из-за этого data-no-drag="false" вело себя
        //   как блокировка, что путало разработчиков.
        //
        // Native dragstart:
        //   Мы вешаем preventDefault на 'dragstart', чтобы браузер не начинал
        //   свой native drag (актуально для <img>, <a>, выделенного текста).
        //   Если элементу нужен native drag — он должен иметь атрибут
        //   data-allow-native-drag="true".

        _isNoDragTarget(target) {
            if (!target || typeof target.closest !== 'function') return false;

            const el = target.closest('[data-no-drag]');
            if (!el) return false;

            const raw = el.getAttribute('data-no-drag');
            const v = (raw == null ? '' : String(raw)).trim().toLowerCase();

            // Пустое значение (атрибут без value) — блокирует.
            if (v === '') return true;

            // Явно блокирующие значения.
            if (v === 'true' || v === '1' || v === 'yes') return true;

            // Явно разрешающие значения — не блокируем.
            if (v === 'false' || v === '0' || v === 'no') return false;

            // Неизвестное значение — считаем блокирующим (безопасный default).
            return true;
        }

        registerDragSource(element, options = {}) {
            if (!element || element.nodeType !== 1) return () => {};

            const self = this;

            const elementIsButton = element.tagName === 'BUTTON';

            const onMouseDown = (e) => {
                if (e.button !== 0) return;
                // Если сам element — не кнопка, а клик пришёл по вложенной
                // кнопке — не начинаем drag (это клик по кнопке).
                if (!elementIsButton && e.target.closest('button')) return;

                // [data-no-drag] с учётом значения
                if (self._isNoDragTarget(e.target)) return;

                const startX = e.clientX;
                const startY = e.clientY;
                const offsetX = e.clientX - element.getBoundingClientRect().left;
                const offsetY = e.clientY - element.getBoundingClientRect().top;

                let isDragging = false;
                let ghost = null;
                let targetWindowId = null;
                let rafId = null;
                let ghostX = 0;
                let ghostY = 0;

                const payload = options.getPayload
                    ? options.getPayload()
                    : options.payload;

                const dragData = {
                    windowId: self.id,
                    sourceType: self.type,
                    channel: options.type || 'default',
                    payload: payload !== undefined ? payload : null
                };

                const applyGhostTransform = () => {
                    rafId = null;
                    if (ghost) {
                        ghost.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0)`;
                    }
                };

                const onMouseMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;

                    if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        isDragging = true;

                        self._dragState = {
                            windowId: self.id,
                            channel: dragData.channel
                        };

                        ghost = document.createElement('div');
                        ghost.className = 'ls-custom-drag-ghost';
                        ghost.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            pointer-events: none;
                            z-index: 999999;
                            opacity: 0.92;
                            background: var(--bg-panel, #1a1a1a);
                            border: 2px solid var(--accent-red, #cc2233);
                            border-radius: 6px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                            padding: 8px 14px;
                            font-size: 12px;
                            color: var(--text-primary, #e0d8cc);
                            font-family: inherit;
                            max-width: 260px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            backdrop-filter: blur(8px);
                            will-change: transform;
                        `;

                        if (options.ghostHTML) {
                            ghost.innerHTML = options.ghostHTML;
                        } else if (options.type && options.type.startsWith('icon-')) {
                            ghost.innerHTML = `<svg class="icon-svg" style="width:14px;height:14px;fill:currentColor;"><use href="#${options.type}"></use></svg>`;
                        } else {
                            const label = (dragData.payload && typeof dragData.payload === 'object' && dragData.payload.name)
                                ? dragData.payload.name
                                : (dragData.channel || 'Drag');
                            ghost.textContent = '📦 ' + label;
                        }

                        ghostX = startX - offsetX;
                        ghostY = startY - offsetY;
                        ghost.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0)`;

                        document.body.appendChild(ghost);

                        element.style.opacity = '0.4';
                        element.style.cursor = 'grabbing';

                        self._showCustomDragHint('📌 Отпустите на окне, чтобы применить');
                    }

                    if (isDragging && ghost) {
                        ghostX = ev.clientX - offsetX;
                        ghostY = ev.clientY - offsetY;

                        if (rafId == null) {
                            rafId = requestAnimationFrame(applyGhostTransform);
                        }

                        const target = self._findDropTargetAtPoint(ev.clientX, ev.clientY);
                        targetWindowId = target;
                        self._highlightDropTarget(target);
                    }
                };

                const onMouseUp = () => {
                    if (rafId != null) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                    }

                    if (isDragging && targetWindowId) {
                        self._deliverCustomDrop(targetWindowId, dragData);
                    }

                    if (ghost && ghost.parentNode) {
                        ghost.remove();
                    }

                    self._clearDropHighlight();
                    self._hideCustomDragHint();

                    element.style.opacity = '';
                    element.style.cursor = '';
                    self._dragState = null;

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);

                e.preventDefault();
            };

            // Защита от native HTML5 drag&drop (для <img>, <a>, текста).
            // Если элементу нужен native drag — data-allow-native-drag="true".
            const onDragStart = (e) => {
                if (element.dataset && element.dataset.allowNativeDrag === 'true') {
                    return;
                }
                e.preventDefault();
            };

            element.addEventListener('mousedown', onMouseDown);
            element.addEventListener('dragstart', onDragStart);

            element.classList.add('ls-drag-source');
            element.style.cursor = 'grab';

            return () => {
                element.removeEventListener('mousedown', onMouseDown);
                element.removeEventListener('dragstart', onDragStart);
                element.classList.remove('ls-drag-source');
                element.style.cursor = '';
            };
        }

        _findDropTargetAtPoint(x, y) {
            if (!this._layoutManager) return null;

            const myId = String(this.id);
            const windows = this._layoutManager.getVisibleWindows
                ? this._layoutManager.getVisibleWindows()
                : this._layoutManager.getWindows();

            for (const w of windows) {
                const wid = String(w.id);
                if (wid === myId) continue;

                const node = this._layoutManager._domMap?.get(w.nodeId);
                if (!node) continue;

                const rect = node.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right &&
                    y >= rect.top && y <= rect.bottom) {
                    return wid;
                }
            }
            return null;
        }

        _highlightDropTarget(targetId) {
            this._clearDropHighlight();

            if (!targetId || !this._layoutManager) return;

            const w = this._layoutManager.getWindows().find(win => String(win.id) === String(targetId));
            if (!w) return;

            const el = this._layoutManager._domMap?.get(w.nodeId);
            if (!el) return;

            el.classList.add('ls-drop-hover');
        }

        _clearDropHighlight() {
            document.querySelectorAll('.window-container.ls-drop-hover').forEach(el => {
                el.classList.remove('ls-drop-hover');
            });
        }

        _deliverCustomDrop(targetWindowId, dragData) {
            if (!this._layoutManager) return;

            const targetBw = this._layoutManager.getInstance(targetWindowId);
            if (!targetBw) return;

            const meta = {
                source: 'internal',
                sourceWindowId: this.id,
                sourceType: this.type,
                channel: dragData.channel,
                payload: dragData.payload
            };

            targetBw._callOnDragEnter(meta);

            const config = targetBw._getEffectiveDropConfig();
            if (!config) {
                console.log('[BaseWindow] internal drop ignored (no config):', targetWindowId);
                return;
            }

            Promise.resolve()
                .then(() => targetBw._callOnDrop([], meta))
                .then((ok) => {
                    if (ok === false) {
                        this.notify('Не подходит', 'Окно отклонило данные', 'warning');
                    }
                })
                .catch((err) => {
                    console.error('[BaseWindow] onDrop error:', err);
                });
        }

        _showCustomDragHint(text) {
            this._hideCustomDragHint();

            const hint = document.createElement('div');
            hint.className = 'ls-drag-hint';
            Object.assign(hint.style, {
                position: 'fixed',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.85)',
                color: 'var(--text-primary, #e0d8cc)',
                padding: '10px 24px',
                borderRadius: '6px',
                fontSize: '13px',
                zIndex: '99999',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                pointerEvents: 'none',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                fontWeight: '500'
            });
            hint.textContent = text;
            document.body.appendChild(hint);
        }

        _hideCustomDragHint() {
            document.querySelectorAll('.ls-drag-hint').forEach(el => el.remove());
        }

        // ============================================================
        // 9. РАБОТА С ДАННЫМИ
        // ============================================================

        getAllData() {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.getAllData === 'function') {
                return realInstance.getAllData();
            }
            return {
                metadata: this.getMetadata(),
                data: this.getData()
            };
        }

        setAllData(data) {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.setAllData === 'function') {
                return realInstance.setAllData(data);
            }

            if (data) {
                if (data.metadata) {
                    this._metadata = { ...data.metadata };
                    if (this._metadata.title) {
                        this._title = this._metadata.title;
                        if (this._renderWindow) {
                            this._renderWindow.setTitle(this._title);
                        }
                    }
                }
                if (data.data !== undefined) {
                    this._data = data.data;
                }
            }

            this._onDataChanged();
            this._saveToSlot();
            this._updateContent();
            this.resize();

            return this;
        }

        getMetadata() {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.getMetadata === 'function') {
                return realInstance.getMetadata();
            }
            return { ...this._metadata };
        }

        getData() {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.getData === 'function') {
                return realInstance.getData();
            }
            return this._data;
        }

        setData(data) {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.setData === 'function') {
                return realInstance.setData(data);
            }

            this._data = data;
            this._onDataChanged();
            this._saveToSlot();
            this._updateContent();
            this.resize();

            return this;
        }

        getState() {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.getState === 'function') {
                return realInstance.getState();
            }
            return { ...this._uiState };
        }

        setState(state) {
            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this && typeof realInstance.setState === 'function') {
                return realInstance.setState(state);
            }

            this._uiState = { ...this._uiState, ...state };
            this._onStateChanged();
            this._saveToSlot();
            return this;
        }

        save() {
            this._saveToSlot();
        }

        // ============================================================
        // 10. SLOT SUBSCRIPTION + LOAD/SAVE
        // ============================================================

        _subscribeToSlot() {
            if (!this._dataBus || !this._slotId) return;

            this._slotUnsubscribe = this._dataBus.subscribeToSlot(this._slotId, (payload) => {
                if (this._isReady && !this._isDestroyed) {
                    this._onSlotUpdate(payload);
                }
            });
        }

        _loadFromSlot() {
            if (!this._dataBus || !this._slotId) {
                this._updateContent();
                return;
            }

            this._isLoading = true;

            const data = this._dataBus.getSlotData(this._slotId);
            if (data) {
                this._data = data.data !== undefined ? data.data : null;
                this._metadata = data.metadata || {};
                this._uiState = data.uiState || {};

                if (this._metadata.title && this._metadata.title !== this._title) {
                    this._title = this._metadata.title;
                    if (this._renderWindow) {
                        this._renderWindow.setTitle(this._title);
                    }
                }

                const realInstance = this.getRealInstance();
                if (realInstance && realInstance !== this && typeof realInstance.setAllData === 'function') {
                    try {
                        realInstance.setAllData({
                            metadata: this._metadata,
                            data: this._data
                        });
                    } catch (e) {
                        console.warn('[BaseWindow] realInstance.setAllData error:', e);
                    }
                }

                if (realInstance && realInstance !== this && typeof realInstance.setState === 'function') {
                    try { realInstance.setState(this._uiState); } catch (e) {}
                }

                this._onDataLoaded();
            }

            this._updateContent();
            this._isLoading = false;

            console.log('[BaseWindow] Loaded from slot:', this._slotId);
        }

        _saveToSlot() {
            if (!this._dataBus || !this._slotId) return;
            this._isSaving = true;

            const realInstance = this.getRealInstance();
            let metadata = this._metadata;
            let data = this._data;

            if (realInstance && realInstance !== this) {
                if (typeof realInstance.getMetadata === 'function') metadata = realInstance.getMetadata();
                if (typeof realInstance.getData === 'function') data = realInstance.getData();
            }

            metadata = {
                ...(metadata || {}),
                modified: new Date().toISOString()
            };
            if (!metadata.type) metadata.type = this.type;
            if (!metadata.id) metadata.id = this.id;
            if (!metadata.slotId) metadata.slotId = this._slotId;

            const ok = this._dataBus.setSlotData(this._slotId, {
                metadata,
                data,
                uiState: this.getState()
            });

            this._isSaving = false;

            if (ok) {
                this._emit('window-saved', {
                    id: this.id,
                    type: this.type,
                    slotId: this._slotId
                });
            }
        }

        _onSlotUpdate(payload) {
            if (!payload) return;

            const realInstance = this.getRealInstance();

            if (realInstance && realInstance !== this && typeof realInstance.onDataUpdate === 'function') {
                try {
                    realInstance.onDataUpdate(payload);
                    return;
                } catch (e) {
                    console.error('[BaseWindow] onDataUpdate error (fallthrough to local):', e);
                }
            }

            let needsUpdate = false;

            if (payload.metadata && payload.metadata !== this._metadata) {
                this._metadata = payload.metadata;
                needsUpdate = true;
            }
            if (payload.data !== undefined && payload.data !== this._data) {
                this._data = payload.data;
                needsUpdate = true;
            }
            if (payload.uiState && payload.uiState !== this._uiState) {
                this._uiState = payload.uiState;
                needsUpdate = true;
            }

            if (needsUpdate) {
                this._onDataChanged();
                this._updateContent();
                this.resize();
            }
        }

        // ============================================================
        // 11. ИМПОРТ / ЭКСПОРТ
        // ============================================================

        _onDataImport() {
            const realInstance = this.getRealInstance();
            if (!realInstance || typeof realInstance.onImport !== 'function') {
                console.warn('[BaseWindow] onImport not implemented');
                this.notify('Импорт', 'Окно не поддерживает импорт', 'warning');
                return;
            }

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.lsw,.txt';

            input.onchange = (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    let parsed;
                    const content = ev.target.result;

                    try {
                        parsed = JSON.parse(content);
                    } catch (err) {
                        parsed = content;
                    }

                    try {
                        const ok = realInstance.onImport(parsed);
                        if (ok !== false) {
                            this._saveToSlot();

                            this.notify('Импорт', 'Данные загружены', 'success');

                            if (window.historyManager) {
                                const typeName = this._typeConfig?.name || this.type;
                                const label = `${typeName} — импорт из файла`;
                                try {
                                    window.historyManager.record(label);
                                    document.dispatchEvent(new CustomEvent('history-recorded', {
                                        detail: { label }
                                    }));
                                } catch (e) {}
                            }
                        } else {
                            this.notify('Импорт', 'Окно отклонило данные', 'warning');
                        }
                    } catch (err) {
                        console.error('[BaseWindow] onImport error:', err);
                        this.notify('Ошибка импорта', err.message || 'Не удалось импортировать', 'error');
                    }
                };

                reader.onerror = () => {
                    this.notify('Ошибка', 'Не удалось прочитать файл', 'error');
                };

                reader.readAsText(file);
            };

            input.click();
        }

        _onDataExport() {
            const realInstance = this.getRealInstance();
            if (!realInstance || typeof realInstance.onExport !== 'function') {
                console.warn('[BaseWindow] onExport not implemented');
                this.notify('Экспорт', 'Окно не поддерживает экспорт', 'warning');
                return;
            }

            let payload;
            try {
                payload = realInstance.onExport();
            } catch (err) {
                console.error('[BaseWindow] onExport error:', err);
                this.notify('Ошибка экспорта', err.message || 'Не удалось экспортировать', 'error');
                return;
            }

            let content;
            if (typeof payload === 'string') {
                content = payload;
            } else {
                try {
                    content = JSON.stringify(payload, null, 2);
                } catch (err) {
                    console.error('[BaseWindow] JSON.stringify error:', err);
                    this.notify('Ошибка', 'Не удалось сериализовать данные', 'error');
                    return;
                }
            }

            try {
                const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.type}_${this._slotId || this.id}_${new Date().toISOString().slice(0, 10)}.json`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);

                this.notify('Экспорт', 'Файл сохранён', 'success');
            } catch (err) {
                console.error('[BaseWindow] export download error:', err);
                this.notify('Ошибка', 'Не удалось сохранить файл', 'error');
            }
        }

        _onDataNewSlot() {
            this.createEmptySlot();
            this.notify('Новый слот', 'Создан новый слот', 'success');

            if (window.historyManager) {
                const typeName = this._typeConfig?.name || this.type;
                const label = `${typeName} — новый слот`;
                try {
                    window.historyManager.record(label);
                    document.dispatchEvent(new CustomEvent('history-recorded', {
                        detail: { label }
                    }));
                } catch (e) {}
            }
        }

        _onDataAttach(data) {
            if (!data || !data.slotId) return;
            this.attachTo(data.slotId);

            if (window.historyManager) {
                const typeName = this._typeConfig?.name || this.type;
                const label = `${typeName} — привязка к слоту ${data.slotId}`;
                try {
                    window.historyManager.record(label);
                    document.dispatchEvent(new CustomEvent('history-recorded', {
                        detail: { label }
                    }));
                } catch (e) {}
            }
        }

        // ============================================================
        // 12. MESSAGE BUS
        // ============================================================

        _subscribeToMessages() {
            if (!this._messageBus) return;

            this._messageUnsubscribe = this._messageBus.subscribeAll(
                this.id,
                (senderId, channel, data) => {
                    if (this._isReady && !this._isDestroyed) {
                        this._onMessageReceived(senderId, channel, data);
                    }
                }
            );
        }

        sendMessage(channel, data, targetId = null) {
            if (!this._messageBus) {
                console.warn('[BaseWindow] MessageBus not available');
                return false;
            }
            return this._messageBus.send(this.id, channel, data, targetId);
        }

        sendToType(channel, data, typeId = null) {
            if (!this._messageBus) return false;
            return this._messageBus.sendToType(this.id, typeId || this.type, channel, data);
        }

        sendToSlot(channel, data, slotId = null) {
            if (!this._messageBus) return false;
            return this._messageBus.sendToTypeAndSlot(
                this.id, this.type, slotId || this._slotId, channel, data
            );
        }

        subscribeToMessage(channel, callback) {
            if (!this._messageBus) {
                console.warn('[BaseWindow] MessageBus not available');
                return () => {};
            }
            return this._messageBus.subscribe(this.id, channel, callback);
        }

        // ============================================================
        // 12.1. RPC PROXY
        // ============================================================

        request(channel, data, targetId, options = {}) {
            if (!this._messageBus) {
                return Promise.reject(new Error('[BaseWindow] MessageBus not available'));
            }
            return this._messageBus.request(this.id, targetId, channel, data, options);
        }

        onRequest(channel, handler) {
            if (!this._messageBus) {
                console.warn('[BaseWindow] MessageBus not available');
                return () => {};
            }

            const unsub = this._messageBus.onRequest(this.id, channel, handler);

            const wrappedUnsub = () => {
                const idx = this._requestUnsubs.indexOf(wrappedUnsub);
                if (idx !== -1) this._requestUnsubs.splice(idx, 1);
                try { unsub(); } catch (e) {}
            };

            this._requestUnsubs.push(wrappedUnsub);
            return wrappedUnsub;
        }

        // ============================================================
        // 13. LAYOUT
        // ============================================================

        _setupLayoutListener() {
            const changeHandler = () => {
                if (!this._isDestroyed && this._isReady && this._renderWindow) {
                    this._renderWindow.updateWindowCount();
                    this._syncFullscreenState();
                }
            };

            document.addEventListener('layout-changed', changeHandler);
            this._subscriptions.push(() => document.removeEventListener('layout-changed', changeHandler));

            const renderedHandler = () => {
                if (this._isDestroyed || !this._isReady) return;

                if (this._renderWindow && typeof this._renderWindow.resize === 'function') {
                    try { this._renderWindow.resize(); } catch (e) {}
                }

                const realInstance = this.getRealInstance();
                if (realInstance && realInstance !== this && typeof realInstance.resize === 'function') {
                    try { realInstance.resize(); } catch (e) {}
                }
            };

            document.addEventListener('layout-rendered', renderedHandler);
            this._subscriptions.push(() => document.removeEventListener('layout-rendered', renderedHandler));
        }

        _syncFullscreenState() {
            if (!this._renderWindow || !this._layoutManager) return;
            if (typeof this._renderWindow.setFullscreenState !== 'function') return;

            const isFs = this._layoutManager.isFullscreen?.(this.id) || false;
            this._renderWindow.setFullscreenState(isFs);
        }

        refreshHeader() {
            if (!this._isReady || this._isDestroyed || !this._renderWindow) return;
            this._renderWindow.refresh();
        }

        // ============================================================
        // 14. СМЕНА ТИПА
        // ============================================================

        _changeType(newType) {
            if (newType === this.type) return;

            console.log('[BaseWindow] Changing type:', this.type, '→', newType);

            if (!this._registry) {
                console.error('[BaseWindow] Registry not available');
                return;
            }

            const typeConfig = this._registry.getType(newType);
            if (!typeConfig) {
                console.error('[BaseWindow] Type "' + newType + '" not found');
                return;
            }

            const oldType = this.type;
            const oldSlotId = this._slotId;

            const currentData = this.getData();
            const currentState = this.getState();
            const currentMetadata = this.getMetadata();

            if (this._realInstance && typeof this._realInstance.destroy === 'function') {
                try { this._realInstance.destroy(); } catch (e) {}
            }
            this._realInstance = null;
            this._realInstanceSet = false;

            if (this._slotUnsubscribe) {
                this._slotUnsubscribe();
                this._slotUnsubscribe = null;
            }

            if (this._dataBus && oldSlotId) {
                this._dataBus.detachWindowFromSlot(oldSlotId, this.id);
                const oldSlot = this._dataBus.getSlot(oldSlotId);
                if (oldSlot && oldSlot.attachedWindows.length === 0) {
                    this._dataBus.archiveSlot(oldSlotId);
                }
            }

            this.type = newType;
            this._typeConfig = typeConfig;
            this._title = typeConfig.name || newType;
            this._icon = typeConfig.icon || '📄';

            let newSlotId = null;
            if (this._dataBus) {
                newSlotId = this._dataBus.createSlot(newType);
                if (newSlotId) {
                    this._slotId = newSlotId;
                    this._dataBus.attachWindowToSlot(newSlotId, this.id);
                    this._subscribeToSlot();
                }
            }

            let contextMenu = [];
            if (typeof typeConfig.contextMenu === 'function') {
                try { contextMenu = typeConfig.contextMenu(this, null, this._layoutManager) || []; } catch (e) {}
            } else if (Array.isArray(typeConfig.contextMenu)) {
                contextMenu = typeConfig.contextMenu;
            }

            if (typeConfig.create && this._renderWindow) {
                try {
                    const contentContainer = this._renderWindow.getContent();

                    if (contentContainer) {
                        contentContainer.innerHTML = '';

                        const newInstance = typeConfig.create(
                            contentContainer,
                            {
                                id: this.id,
                                type: newType,
                                title: this._title,
                                icon: this._icon,
                                slotId: newSlotId
                            },
                            {
                                dataBus: this._dataBus,
                                registry: this._registry,
                                eventBus: this._eventBus,
                                messageBus: this._messageBus,
                                layoutManager: this._layoutManager,
                                _baseWindow: this
                            }
                        );

                        if (newInstance) {
                            this._realInstance = newInstance;
                            this._realInstanceSet = true;
                            newInstance._baseWindow = this;

                            if (!newInstance._dataBus) newInstance._dataBus = this._dataBus;
                            if (!newInstance._eventBus) newInstance._eventBus = this._eventBus;
                            if (!newInstance._messageBus) newInstance._messageBus = this._messageBus;
                            if (!newInstance._layoutManager) newInstance._layoutManager = this._layoutManager;
                            if (!newInstance._registry) newInstance._registry = this._registry;

                            let root = null;
                            if (newInstance._root) root = newInstance._root;
                            else if (typeof newInstance.getRoot === 'function') {
                                try { root = newInstance.getRoot(); } catch (e) {}
                            }

                            if (root) {
                                this._ensureRealInstanceFillsHost(root, contentContainer);
                                this._ensureRealInstanceObserver(newInstance, contentContainer);
                            }

                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    if (typeof newInstance.resize === 'function') {
                                        try { newInstance.resize(); } catch (e) {}
                                    }
                                });
                            });
                        }
                    }
                } catch (error) {
                    console.error('[BaseWindow] Error creating new instance:', error);
                }
            }

            this._metadata = {
                ...currentMetadata,
                type: newType,
                title: this._title,
                modified: new Date().toISOString(),
                slotId: newSlotId
            };

            if (this._layoutManager) {
                const node = this._layoutManager.getNodeByWindowId(this.id);
                if (node && node.windowData) {
                    node.windowData.type = newType;
                    node.windowData.title = this._title;
                    node.windowData.icon = this._icon;
                    node.windowData.slotId = newSlotId;
                }
            }

            this._saveToSlot();

            this._unregisterHotkeys();
            this._registerHotkeys();

            const newHeaderItems = this._resolveHeaderItems();

            if (this._renderWindow) {
                this._renderWindow.updateTypeConfig({
                    type: newType,
                    title: this._title,
                    icon: this._icon,
                    headerItems: newHeaderItems,
                    contextMenu: contextMenu
                });
            }

            this._emit('window-type-changed', {
                id: this.id,
                oldType: oldType,
                newType: newType,
                oldSlotId: oldSlotId,
                newSlotId: newSlotId
            });

            if (this._layoutManager) {
                this._layoutManager._notifyChange();
            }

            if (window.historyManager) {
                const oldCfg = this._registry.getType(oldType);
                const newCfg = this._registry.getType(newType);
                const oldName = oldCfg?.name || oldType;
                const newName = newCfg?.name || newType;
                const label = `Смена типа: ${oldName} → ${newName}`;

                try {
                    window.historyManager.record(label);
                    document.dispatchEvent(new CustomEvent('history-recorded', {
                        detail: { label }
                    }));
                } catch (e) {
                    console.error('[BaseWindow] historyManager.record error:', e);
                }
            }

            console.log('[BaseWindow] ✅ Type changed:', oldType, '→', newType,
                '(headerItems:', newHeaderItems.length + ')');
        }

        // ============================================================
        // 15. ЗАКРЫТИЕ / SWAP
        // ============================================================

        _close() {
            if (this._layoutManager) {
                this._layoutManager.closeWindow(this.id);
            } else {
                this.destroy();
            }
        }

        _swapWith(targetId) {
            if (this.id === targetId) return;
            if (this._layoutManager) {
                this._layoutManager.swapWindows(this.id, targetId);
            }
        }

        // ============================================================
        // 16. EVENTS от RENDER WINDOW
        // ============================================================

        _onRenderClose() {
            this._close();
        }

        _onRenderChangeType(data) {
            if (data && data.newType) {
                this._changeType(data.newType);
            }
        }

        _onRenderLayoutChange(data) {
            if (data && data.styleId && this._layoutManager) {
                this._layoutManager.setLayoutStyle(data.styleId);
            }
        }

        _onRenderMenuAction(data) {
            const realInstance = this.getRealInstance();
            const action = data.action;
            const value = data.value;
            const item = data.item;
            const payload = data.payload;

            if (realInstance && realInstance !== this
                && typeof realInstance.onHeaderItemClick === 'function') {
                try {
                    const handled = realInstance.onHeaderItemClick(
                        item || { action, value },
                        {
                            action: action,
                            value: value,
                            item: item,
                            payload: payload,
                            source: item && item.type === 'dropdown' ? 'dropdown' : 'button'
                        }
                    );
                    if (handled === true) {
                        return;
                    }
                } catch (e) {
                    console.error('[BaseWindow] onHeaderItemClick error:', e);
                }
            }

            if (realInstance && realInstance !== this) {
                if (action && typeof realInstance[action] === 'function') {
                    try {
                        realInstance[action](value, payload, item);
                    } catch (e) {
                        console.error(`[BaseWindow] menu action "${action}" error:`, e);
                    }
                    return;
                }
            }

            this._emit('window-menu-action', {
                windowId: this.id,
                action: action,
                value: value,
                payload: payload,
                item: item
            });
        }

        _onRenderSwap(data) {
            if (data && data.targetId) {
                this._swapWith(data.targetId);
            }
        }

        _onRenderMinimize() {
            if (!this._layoutManager) return;
            this._layoutManager.minimizeWindow(this.id);
        }

        _onRenderFullscreen() {
            if (!this._layoutManager) return;
            this._layoutManager.setFullscreen(this.id);
        }

        _onRenderFullscreenExit() {
            if (!this._layoutManager) return;
            this._layoutManager.exitFullscreen();
        }

        // ============================================================
        // 17. ХУКИ
        // ============================================================

        _onReady() {}
        _onDataChanged() {}
        _onStateChanged() {}
        _onDataLoaded() {}
        _onResize() {}
        _onMessageReceived(senderId, channel, data) {}

        _onFocus() {
            if (this._isDestroyed) return;
            this._isFocused = true;

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.onFocus === 'function') {
                try { realInstance.onFocus(); } catch (e) {
                    console.error('[BaseWindow] onFocus error:', e);
                }
            }

            if (this.container) {
                this.container.classList.add('window-focused');
            }

            this._emit('window-focused', {
                id: this.id,
                type: this.type,
                slotId: this._slotId
            });
        }

        _onBlur() {
            if (this._isDestroyed) return;
            this._isFocused = false;

            const realInstance = this.getRealInstance();
            if (realInstance && realInstance !== this
                && typeof realInstance.onBlur === 'function') {
                try { realInstance.onBlur(); } catch (e) {
                    console.error('[BaseWindow] onBlur error:', e);
                }
            }

            if (this.container) {
                this.container.classList.remove('window-focused');
            }

            this._emit('window-blurred', {
                id: this.id,
                type: this.type,
                slotId: this._slotId
            });
        }

        isFocused() {
            return this._isFocused;
        }

        // ============================================================
        // 18. ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================

        setTitle(title) {
            this._title = title;
            if (this._renderWindow) {
                this._renderWindow.setTitle(title);
            }
            return this;
        }

        getTitle() { return this._title; }
        getIcon() { return this._icon; }
        getType() { return this.type; }
        getId() { return this.id; }
        isReady() { return this._isReady; }
        isDestroyed() { return this._isDestroyed; }
        getContainer() { return this.container; }
        getRoot() { return this._renderWindow ? this._renderWindow.getRoot() : null; }
        getRenderWindow() { return this._renderWindow; }

        // ============================================================
        // 19. СОБЫТИЯ
        // ============================================================

        _emit(event, data) {
            if (this._eventBus) {
                this._eventBus.emit(event, { ...data, windowId: this.id });
            }
            const detail = { ...data, windowId: this.id };
            document.dispatchEvent(new CustomEvent(event, { detail }));
        }

        _on(event, callback) {
            if (this._eventBus) {
                const unsubscribe = this._eventBus.on(event, (data) => {
                    if (data.windowId === this.id || !data.windowId) {
                        callback(data);
                    }
                });
                this._subscriptions.push(unsubscribe);
                return unsubscribe;
            }
            return () => {};
        }

        notify(title, message, type = 'info') {
            const typeSafe = (type === 'error' || type === 'warning' || type === 'success' || type === 'info')
                ? type
                : 'info';

            const titleStr = (title != null ? String(title) : '').trim();
            const messageStr = (message != null ? String(message) : '').trim();

            let finalMessage;
            if (titleStr && titleStr !== messageStr) {
                finalMessage = titleStr + ': ' + messageStr;
            } else {
                finalMessage = messageStr || titleStr || '';
            }

            // 1) Глобальная функция (если есть в билде)
            if (typeof window.showNotification === 'function') {
                try {
                    window.showNotification(finalMessage, typeSafe);
                    return;
                } catch (e) {
                    console.warn('[BaseWindow] showNotification error:', e);
                }
            }

            // 2) eventBus (если есть) — НЕ выходим, даём шанс и document-слушателю
            if (this._eventBus && typeof this._eventBus.emit === 'function') {
                try {
                    this._eventBus.emit('notification', {
                        title: titleStr,
                        message: messageStr,
                        type: typeSafe
                    });
                } catch (e) {
                    console.warn('[BaseWindow] eventBus notification error:', e);
                }
            }

            // 3) Всегда дублируем в document — чтобы UI-слой мог
            //    подписаться через document.addEventListener('notification', ...)
            try {
                document.dispatchEvent(new CustomEvent('notification', {
                    detail: { title: titleStr, message: messageStr, type: typeSafe },
                    bubbles: true
                }));
            } catch (e) {
                console.warn('[BaseWindow] document notification error:', e);
            }

            // 4) Фолбэк — консоль, если совсем ничего не нашлось
            if (typeof window.showNotification !== 'function' && !this._eventBus) {
                console.warn(`[notify:${typeSafe}] ${finalMessage}`);
            }
        }

        // ============================================================
        // 20. СТАТИЧЕСКИЙ МЕТОД
        // ============================================================

        static create({ type, container, options = {} }) {
            const registry = options.registry;
            if (!registry) {
                throw new Error('[BaseWindow] Registry is required');
            }

            const typeConfig = registry.getType(type);
            if (!typeConfig) {
                throw new Error('[BaseWindow] Type "' + type + '" not found');
            }

            const id = options.id || Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const windowData = {
                id: id,
                type: type,
                title: typeConfig.name,
                icon: typeConfig.icon
            };

            let realInstance = options._realInstance || null;

            if (!realInstance && typeConfig.create) {
                try {
                    realInstance = typeConfig.create(container, windowData, {
                        ...options,
                        registry: registry
                    });
                } catch (error) {
                    console.error('[BaseWindow.create] Factory error:', error);
                    realInstance = null;
                }
            }

            if (realInstance instanceof BaseWindow) {
                return realInstance;
            }

            const wrapped = new BaseWindow({
                id: id,
                type: type,
                container: container,
                options: {
                    ...options,
                    _realInstance: realInstance
                }
            });

            return wrapped;
        }
    }

    // ============================================================
    // 21. ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BaseWindow };
    }

    if (typeof window !== 'undefined') {
        window.BaseWindow = BaseWindow;
        console.log('[BaseWindow] Registered globally v8.0.2');
    }

})();