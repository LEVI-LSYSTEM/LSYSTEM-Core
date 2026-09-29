// core/window/BaseWindow.js
// Версия 12.0.0

(function() {
    'use strict';

    function BaseWindow(config) {
        config = config || {};

        this.id = config.id;
        this.type = config.type;
        this.container = config.container;
        this.options = config.options || {};

        this._themeObserver = null;
        this._themeUnsubscribe = null;

        this._dataBus = this.options.dataBus || null;
        this._registry = this.options.registry || null;
        this._eventBus = this.options.eventBus || null;
        this._layoutManager = this.options.layoutManager || null;
        this._messageBus = this.options.messageBus || null;

        this._realInstance = this.options._realInstance || null;
        this._realInstanceSet = !!this._realInstance;

        if (this._realInstance) {
            this._realInstance._baseWindow = this;
        }

        this._slotId = this.options.slotId || null;

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

        this._typeConfig = this._registry ? this._registry.getType(this.type) : null;
        this._title = (this._typeConfig && this._typeConfig.name) || this.type || 'Window';
        this._icon = (this._typeConfig && this._typeConfig.icon) || '📄';

        this._chrome = null;
        this._header = null;

        this._subscriptions = [];
        this._slotUnsubscribe = null;
        this._messageUnsubscribe = null;
        this._layoutUnsubscribe = null;
        this._hotkeyUnsub = null;

        this._headerUnsubs = [];

        this._init();
    }

    // ============================================================
    // 1. HEADER ITEMS RESOLVER
    // ============================================================

    BaseWindow.prototype._resolveHeaderItems = function() {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.getHeaderItems === 'function') {
            try {
                var items = realInstance.getHeaderItems();
                if (Array.isArray(items)) {
                    return items.filter(function(x) { return x && typeof x === 'object'; });
                }
            } catch (e) {
                console.error('[BaseWindow] realInstance.getHeaderItems error:', e);
            }
        }

        if (this._registry && typeof this._registry.getTypeHeaderItems === 'function') {
            var regItems = this._registry.getTypeHeaderItems(this.type);
            if (Array.isArray(regItems) && regItems.length > 0) {
                return regItems;
            }
        }

        if (this._typeConfig && Array.isArray(this._typeConfig.headerItems)) {
            return this._typeConfig.headerItems.slice();
        }

        return [];
    };

    // ============================================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    BaseWindow.prototype._init = function() {
        var WindowChrome = window.WindowChrome;
        var HeaderController = window.HeaderController;

        if (!WindowChrome || !HeaderController) {
            console.error('[BaseWindow] WindowChrome/HeaderController not loaded');
            return;
        }

        if (this._registry) {
            var typeConfig = this._registry.getType(this.type);
            if (typeConfig) {
                this._typeConfig = typeConfig;
                this._title = typeConfig.name || this._title;
                this._icon = typeConfig.icon || this._icon;
            }
        }

        this._chrome = new WindowChrome({
            container: this.container,
            baseWindow: this,
            layoutManager: this._layoutManager,
            registry: this._registry,
            id: this.id,
            type: this.type,
            title: this._title,
            icon: this._icon
        });

        this._header = new HeaderController({
            chrome: this._chrome,
            baseWindow: this,
            layoutManager: this._layoutManager,
            registry: this._registry,
            id: this.id,
            type: this.type
        });

        this._bindHeaderEvents();

        this._chrome.on('resize', this._onRenderResize.bind(this));

        this._subscribeToSlot();
        this._subscribeToMessages();
        this._loadFromSlot();
        this._setupLayoutListener();
        this._setupThemeSubscription();
        this._setupVisibilityObserver();
        this._setupVisibilityEventListener();
        this._registerHotkeys();

        this._isReady = true;
        this._onReady();

        var headerItems = this._resolveHeaderItems();
        this._header.setItems(headerItems);

        var self = this;
        setTimeout(function() {
            if (self._chrome) self._chrome.resize();
        }, 50);

        this._emit('window-ready', {
            id: this.id,
            type: this.type,
            title: this._title,
            slotId: this._slotId
        });
    };

    BaseWindow.prototype._bindHeaderEvents = function() {
        var self = this;
        var header = this._header;

        var bind = function(event, handler) {
            var unsub = header.on(event, handler);
            self._headerUnsubs.push(unsub);
        };

        bind('menu-action', function(d) { self._onRenderMenuAction(d); });
        bind('change-type', function(d) { self._onRenderChangeType(d); });
        bind('layout-change', function(d) { self._onRenderLayoutChange(d); });
        bind('swap', function(d) { self._onRenderSwap(d); });
        bind('close', function() { self._onRenderClose(); });
        bind('minimize', function() { self._onRenderMinimize(); });
        bind('fullscreen', function() { self._onRenderFullscreen(); });
        bind('fullscreen-exit', function() { self._onRenderFullscreenExit(); });
        bind('data-import', function() { self._onDataImport(); });
        bind('data-export', function() { self._onDataExport(); });
        bind('data-new-slot', function() { self._onDataNewSlot(); });
        bind('data-attach', function(d) { self._onDataAttach(d); });
    };

    // ============================================================
    // 3. SLOT MANAGEMENT
    // ============================================================

    BaseWindow.prototype.getSlotId = function() {
        return this._slotId;
    };

    BaseWindow.prototype.getSlotWindows = function() {
        if (!this._dataBus || !this._slotId) return [];
        return this._dataBus.getSlotWindows(this._slotId);
    };

    BaseWindow.prototype.attachTo = function(slotId) {
        if (!this._dataBus) {
            console.warn('[BaseWindow] attachTo: DataBus not available');
            return this;
        }

        var sid = String(slotId);
        var slot = this._dataBus.getSlot(sid);
        if (!slot) {
            console.warn('[BaseWindow] attachTo: slot not found:', sid);
            return this;
        }

        if (slot.type !== this.type) {
            console.warn('[BaseWindow] attachTo: type mismatch');
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

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.onSlotChange === 'function') {
            try { realInstance.onSlotChange(sid); } catch (e) {
                console.error('[BaseWindow] onSlotChange error:', e);
            }
        }

        return this;
    };

    BaseWindow.prototype.createEmptySlot = function() {
        if (!this._dataBus) {
            console.warn('[BaseWindow] createEmptySlot: DataBus not available');
            return this;
        }

        if (this._slotUnsubscribe) {
            this._slotUnsubscribe();
            this._slotUnsubscribe = null;
        }

        var oldSlotId = this._slotId;

        if (oldSlotId) {
            this._dataBus.detachWindowFromSlot(oldSlotId, this.id);
        }

        var newSlotId = this._dataBus.createSlot(this.type);
        if (!newSlotId) {
            console.error('[BaseWindow] createEmptySlot: failed');
            if (oldSlotId) {
                this._dataBus.attachWindowToSlot(oldSlotId, this.id);
                this._subscribeToSlot();
            }
            return this;
        }

        this._slotId = newSlotId;
        this._dataBus.attachWindowToSlot(newSlotId, this.id);

        if (oldSlotId) {
            var oldSlot = this._dataBus.getSlot(oldSlotId);
            if (oldSlot && oldSlot.attachedWindows.size === 0) {
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

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.onSlotChange === 'function') {
            try { realInstance.onSlotChange(newSlotId); } catch (e) {
                console.error('[BaseWindow] onSlotChange error:', e);
            }
        }

        return this;
    };

    // ============================================================
    // 4. MINIMIZE / FULLSCREEN / CLOSE
    // ============================================================

    BaseWindow.prototype.minimize = function() {
        if (!this._layoutManager) return false;
        return this._layoutManager.minimizeWindow(this.id);
    };

    BaseWindow.prototype.isMinimized = function() {
        if (!this._layoutManager) return false;
        return this._layoutManager.isMinimized(this.id);
    };

    BaseWindow.prototype.setFullscreen = function() {
        if (!this._layoutManager) return false;
        return this._layoutManager.setFullscreen(this.id);
    };

    BaseWindow.prototype.exitFullscreen = function() {
        if (!this._layoutManager) return false;
        return this._layoutManager.exitFullscreen();
    };

    BaseWindow.prototype.isFullscreen = function() {
        if (!this._layoutManager) return false;
        return this._layoutManager.isFullscreen(this.id);
    };

    BaseWindow.prototype.toggleFullscreen = function() {
        if (this.isFullscreen()) return this.exitFullscreen();
        return this.setFullscreen();
    };

    BaseWindow.prototype.close = function() {
        this._close();
    };

    // ============================================================
    // 5. VISIBILITY
    // ============================================================

    BaseWindow.prototype.isVisible = function() {
        return !!this._isVisible;
    };

    BaseWindow.prototype._setupVisibilityEventListener = function() {
        if (typeof document === 'undefined') return;

        var self = this;
        var handler = function(e) {
            if (!e || !e.detail) return;
            if (String(e.detail.windowId) !== String(self.id)) return;
            self._handleVisibilityChanged(!!e.detail.visible);
        };

        document.addEventListener('window-visibility-changed', handler);

        this._visibilityUnsub = function() {
            document.removeEventListener('window-visibility-changed', handler);
        };
    };

    BaseWindow.prototype._handleVisibilityChanged = function(visible) {
        if (this._isDestroyed) return;

        var next = !!visible;
        if (next === this._isVisible) return;

        this._isVisible = next;

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.onVisibilityChange === 'function') {
            try { realInstance.onVisibilityChange(next); } catch (e) {
                console.error('[BaseWindow] onVisibilityChange error:', e);
            }
        }

        this._emit('window-visibility-changed', {
            id: this.id,
            type: this.type,
            visible: next
        });
    };

    // ============================================================
    // 6. KEYBOARD CAPTURE
    // ============================================================

    BaseWindow.prototype.captureKeyboard = function() {
        if (!window.hotkeyRegistry) return false;
        return window.hotkeyRegistry.captureKeyboard(this.id);
    };

    BaseWindow.prototype.releaseKeyboard = function() {
        if (!window.hotkeyRegistry) return false;
        return window.hotkeyRegistry.releaseKeyboard(this.id);
    };

    BaseWindow.prototype.isKeyboardCaptured = function() {
        if (!window.hotkeyRegistry) return false;
        return window.hotkeyRegistry.getCapturedWindow() === String(this.id);
    };

    // ============================================================
    // 7. FIND WINDOW BY TYPE
    // ============================================================

    BaseWindow.prototype.findWindowByType = function(typeId) {
        if (!typeId || !this._layoutManager) return null;

        var myId = String(this.id);

        if (typeof this._layoutManager.getVisibleWindowsByType === 'function') {
            var visible = this._layoutManager.getVisibleWindowsByType(typeId);
            for (var i = 0; i < visible.length; i++) {
                var w = visible[i];
                if (String(w.id) !== myId) {
                    return {
                        id: w.id, type: w.type, slotId: w.slotId,
                        title: w.title, icon: w.icon
                    };
                }
            }
        }

        if (typeof this._layoutManager.getMinimizedWindowsByType === 'function') {
            var minimized = this._layoutManager.getMinimizedWindowsByType(typeId);
            for (var j = 0; j < minimized.length; j++) {
                var mw = minimized[j];
                if (String(mw.id) !== myId) {
                    return {
                        id: mw.id, type: mw.type, slotId: mw.slotId,
                        title: mw.title, icon: mw.icon
                    };
                }
            }
        }

        var all = this._layoutManager.getWindows();
        for (var k = 0; k < all.length; k++) {
            var aw = all[k];
            if (aw.type === typeId && String(aw.id) !== myId) {
                return {
                    id: aw.id, type: aw.type, slotId: aw.slotId,
                    title: aw.title, icon: aw.icon
                };
            }
        }

        return null;
    };

    BaseWindow.prototype.findWindowsByType = function(typeId) {
        if (!typeId || !this._layoutManager) return [];

        var myId = String(this.id);
        var result = [];

        if (typeof this._layoutManager.getVisibleWindowsByType === 'function') {
            var visible = this._layoutManager.getVisibleWindowsByType(typeId);
            for (var i = 0; i < visible.length; i++) {
                if (String(visible[i].id) === myId) continue;
                result.push({
                    id: visible[i].id, type: visible[i].type, slotId: visible[i].slotId,
                    title: visible[i].title, icon: visible[i].icon
                });
            }
        }

        if (typeof this._layoutManager.getMinimizedWindowsByType === 'function') {
            var minimized = this._layoutManager.getMinimizedWindowsByType(typeId);
            for (var j = 0; j < minimized.length; j++) {
                if (String(minimized[j].id) === myId) continue;
                result.push({
                    id: minimized[j].id, type: minimized[j].type, slotId: minimized[j].slotId,
                    title: minimized[j].title, icon: minimized[j].icon
                });
            }
        }

        if (result.length === 0) {
            var all = this._layoutManager.getWindows();
            for (var k = 0; k < all.length; k++) {
                if (all[k].type === typeId && String(all[k].id) !== myId) {
                    result.push({
                        id: all[k].id, type: all[k].type, slotId: all[k].slotId,
                        title: all[k].title, icon: all[k].icon
                    });
                }
            }
        }

        return result;
    };

    // ============================================================
    // 8. РЕАЛЬНЫЙ ЭКЗЕМПЛЯР
    // ============================================================

    BaseWindow.prototype.setRealInstance = function(instance) {
        if (this._realInstanceSet && this._realInstance) {
            console.warn('[BaseWindow] Real instance already set for', this.id);
            return this;
        }

        this._realInstance = instance;
        this._realInstanceSet = true;

        if (instance) instance._baseWindow = this;

        if (this._isReady && this._chrome) {
            this.refreshHeaderItems();
            this._updateContent();
            this._chrome.resize();
        }

        return this;
    };

    BaseWindow.prototype.getRealInstance = function() {
        if (this._realInstance && this._realInstanceSet) return this._realInstance;
        return this;
    };

    BaseWindow.prototype.hasRealInstance = function() {
        return this._realInstanceSet && !!this._realInstance;
    };

    // ============================================================
    // 9. HEADER ITEMS
    // ============================================================

    BaseWindow.prototype.refreshHeaderItems = function() {
        if (this._isDestroyed || !this._header) return false;

        var items = this._resolveHeaderItems();

        try {
            this._header.setItems(items);
        } catch (e) {
            console.error('[BaseWindow] refreshHeaderItems error:', e);
            return false;
        }

        return true;
    };

    BaseWindow.prototype.getRenderedHeaderItems = function() {
        if (!this._header) return [];
        if (typeof this._header.getRenderedItems !== 'function') return [];
        return this._header.getRenderedItems();
    };

    // ============================================================
    // 10. ЖИЗНЕННЫЙ ЦИКЛ
    // ============================================================

    BaseWindow.prototype.destroy = function() {
        if (this._isDestroyed) return;
        this._isDestroyed = true;
        this._isReady = false;

        if (window.hotkeyRegistry
            && window.hotkeyRegistry.getCapturedWindow() === String(this.id)) {
            try { window.hotkeyRegistry.releaseKeyboard(this.id); } catch (e) {}
        }

        if (this.isFullscreen()) {
            try { this.exitFullscreen(); } catch (e) {}
        }

        if (this._realInstance && typeof this._realInstance.destroy === 'function') {
            try { this._realInstance.destroy(); } catch (e) {
                console.warn('[BaseWindow] Error destroying real instance:', e);
            }
        }
        this._realInstance = null;
        this._realInstanceSet = false;

        for (var i = 0; i < this._headerUnsubs.length; i++) {
            try { this._headerUnsubs[i](); } catch (e) {}
        }
        this._headerUnsubs = [];

        if (this._header) {
            this._header.destroy();
            this._header = null;
        }

        if (this._chrome) {
            this._chrome.destroy();
            this._chrome = null;
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

        for (var j = 0; j < this._requestUnsubs.length; j++) {
            try { this._requestUnsubs[j](); } catch (e) {}
        }
        this._requestUnsubs = [];

        for (var k = 0; k < this._subscriptions.length; k++) {
            try { this._subscriptions[k](); } catch (e) {}
        }
        this._subscriptions = [];

        this._emit('window-destroyed', {
            id: this.id,
            type: this.type,
            slotId: this._slotId
        });
    };

    // ============================================================
    // 11. RESIZE
    // ============================================================

    BaseWindow.prototype.resize = function() {
        if (this._isDestroyed) return;

        if (this._chrome) this._chrome.resize();

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.resize === 'function') {
            try { realInstance.resize(); } catch (e) {}
        }
    };

    BaseWindow.prototype._onRenderResize = function(data) {
        var realInstance = this.getRealInstance();
        var w = (data && Number.isFinite(data.width))  ? data.width  : 0;
        var h = (data && Number.isFinite(data.height)) ? data.height : 0;
        var prev = this.__lastRealResize || { w: -1, h: -1 };

        if (w !== prev.w || h !== prev.h) {
            this.__lastRealResize = { w: w, h: h };
            if (realInstance && realInstance !== this && typeof realInstance.resize === 'function') {
                try { realInstance.resize(); } catch (e) {
                    console.warn('[BaseWindow] Error in real instance resize:', e);
                }
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
    };

    // ============================================================
    // 12. ОБНОВЛЕНИЕ КОНТЕНТА
    // ============================================================

    BaseWindow.prototype._updateContent = function() {
        if (!this._chrome) return;

        var realInstance = this.getRealInstance();

        var root = null;
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

        this._chrome.setContent(root);

        if (!root) return;

        this._ensureRealInstanceFillsHost(root, this._chrome.getContent());
        this._ensureRealInstanceObserver(realInstance, this._chrome.getContent());

        requestAnimationFrame(function() {
            if (realInstance && typeof realInstance.resize === 'function') {
                try { realInstance.resize(); } catch (e) {}
            }
        });
    };

    BaseWindow.prototype._ensureRealInstanceFillsHost = function(root, host) {
        if (!root || !host) return;

        var pos = root.style.position;
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
    };

    BaseWindow.prototype._ensureRealInstanceObserver = function(realInstance, host) {
        if (!host || typeof ResizeObserver === 'undefined') return;
        if (!realInstance) return;

        var hasResize = typeof realInstance.resize === 'function';

        if (host.__lsResizeObserver) {
            try { host.__lsResizeObserver.disconnect(); } catch (e) {}
            host.__lsResizeObserver = null;
        }

        if (!hasResize) return;

        var raf = null;
        var observer = new ResizeObserver(function() {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(function() {
                raf = null;
                try { realInstance.resize(); } catch (e) {}
            });
        });

        observer.observe(host);
        host.__lsResizeObserver = observer;
    };

    BaseWindow.prototype._setupThemeSubscription = function() {
        if (typeof MutationObserver === 'undefined') return;

        var self = this;
        var handler = function() {
            if (self._isDestroyed) return;

            var realInstance = self.getRealInstance();
            if (!realInstance || realInstance === self) return;

            if (typeof realInstance.onThemeChange === 'function') {
                var theme = document.documentElement.getAttribute('data-theme') || 'dark';
                try { realInstance.onThemeChange(theme); } catch (e) {
                    console.error('[BaseWindow] onThemeChange error:', e);
                }
            }
        };

        this._themeObserver = new MutationObserver(handler);
        this._themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        this._themeUnsubscribe = function() {
            if (self._themeObserver) {
                self._themeObserver.disconnect();
                self._themeObserver = null;
            }
        };
    };

    BaseWindow.prototype._setupVisibilityObserver = function() {
        if (typeof IntersectionObserver === 'undefined') return;

        var target = this.container;
        if (!target) return;

        var self = this;
        this._visibilityObserver = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                var rect = entry.boundingClientRect;
                if (rect.width === 0 || rect.height === 0) continue;
                self._handleVisibilityChanged(entry.isIntersecting);
            }
        }, { threshold: 0.05 });

        this._visibilityObserver.observe(target);
    };

    // ============================================================
    // 13. ХОТКЕИ ОКНА
    // ============================================================

    BaseWindow.prototype._registerHotkeys = function() {
        if (!window.hotkeyRegistry) return;

        var realInstance = this.getRealInstance();
        if (!realInstance || realInstance === this) return;

        if (typeof realInstance.getHotkeys !== 'function') return;

        if (this._hotkeyUnsub) {
            try { this._hotkeyUnsub(); } catch (e) {}
            this._hotkeyUnsub = null;
        }

        var map;
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
    };

    BaseWindow.prototype._unregisterHotkeys = function() {
        if (this._hotkeyUnsub) {
            try { this._hotkeyUnsub(); } catch (e) {}
            this._hotkeyUnsub = null;
        }
        if (window.hotkeyRegistry) {
            window.hotkeyRegistry.unregisterWindow(this.id);
        }
    };

    BaseWindow.prototype.registerHotkeys = function() {
        this._registerHotkeys();
    };

    // ============================================================
    // 14. DRAG SOURCE
    // ============================================================

    BaseWindow.prototype.registerDragSource = function(element, options) {
        options = options || {};

        if (!element || element.nodeType !== 1) {
            console.warn('[BaseWindow] registerDragSource: element must be a DOM node');
            return function() {};
        }

        if (!window.dragController) {
            console.warn('[BaseWindow] registerDragSource: DragController not available');
            return function() {};
        }

        var payloadFn;
        if (typeof options.getPayload === 'function') {
            payloadFn = options.getPayload;
        } else if (options.payload !== undefined) {
            var staticPayload = options.payload;
            payloadFn = function() { return staticPayload; };
        } else {
            payloadFn = function() { return null; };
        }

        return window.dragController.registerSource(element, {
            channel:   options.type || 'default',
            payload:   payloadFn,
            ghostHTML: options.ghostHTML || null
        });
    };

    // ============================================================
    // 15. РАБОТА С ДАННЫМИ
    // ============================================================

    BaseWindow.prototype.getAllData = function() {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.getAllData === 'function') {
            return realInstance.getAllData();
        }
        return {
            metadata: this.getMetadata(),
            data: this.getData()
        };
    };

    BaseWindow.prototype.setAllData = function(data) {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.setAllData === 'function') {
            return realInstance.setAllData(data);
        }

        if (data) {
            if (data.metadata) {
                this._metadata = {};
                for (var k1 in data.metadata) {
                    if (Object.prototype.hasOwnProperty.call(data.metadata, k1)) {
                        this._metadata[k1] = data.metadata[k1];
                    }
                }
                if (this._metadata.title) {
                    this._title = this._metadata.title;
                    if (this._chrome) this._chrome.setTitle(this._title);
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
    };

    BaseWindow.prototype.getMetadata = function() {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.getMetadata === 'function') {
            return realInstance.getMetadata();
        }
        var out = {};
        for (var k in this._metadata) {
            if (Object.prototype.hasOwnProperty.call(this._metadata, k)) {
                out[k] = this._metadata[k];
            }
        }
        return out;
    };

    BaseWindow.prototype.getData = function() {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.getData === 'function') {
            return realInstance.getData();
        }
        return this._data;
    };

    BaseWindow.prototype.setData = function(data) {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.setData === 'function') {
            return realInstance.setData(data);
        }

        this._data = data;
        this._onDataChanged();
        this._saveToSlot();
        this._updateContent();
        this.resize();

        return this;
    };

    BaseWindow.prototype.getState = function() {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.getState === 'function') {
            return realInstance.getState();
        }
        var out = {};
        for (var k in this._uiState) {
            if (Object.prototype.hasOwnProperty.call(this._uiState, k)) {
                out[k] = this._uiState[k];
            }
        }
        return out;
    };

    BaseWindow.prototype.setState = function(state) {
        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this && typeof realInstance.setState === 'function') {
            return realInstance.setState(state);
        }

        if (state) {
            for (var k in state) {
                if (Object.prototype.hasOwnProperty.call(state, k)) {
                    this._uiState[k] = state[k];
                }
            }
        }
        this._onStateChanged();
        this._saveToSlot();
        return this;
    };

    BaseWindow.prototype.save = function() {
        this._saveToSlot();
    };

    // ============================================================
    // 16. SLOT SUBSCRIPTION + LOAD/SAVE
    // ============================================================

    BaseWindow.prototype._subscribeToSlot = function() {
        if (!this._dataBus || !this._slotId) return;

        var self = this;
        this._slotUnsubscribe = this._dataBus.subscribeToSlot(this._slotId, function(payload) {
            if (self._isReady && !self._isDestroyed) {
                self._onSlotUpdate(payload);
            }
        });
    };

    BaseWindow.prototype._loadFromSlot = function() {
        if (!this._dataBus || !this._slotId) {
            this._updateContent();
            return;
        }

        this._isLoading = true;

        var data = this._dataBus.getSlotData(this._slotId);
        if (data) {
            this._data = data.data !== undefined ? data.data : null;
            this._metadata = data.metadata || {};
            this._uiState = data.uiState || {};

            if (this._metadata.title && this._metadata.title !== this._title) {
                this._title = this._metadata.title;
                if (this._chrome) this._chrome.setTitle(this._title);
            }

            var realInstance = this.getRealInstance();
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
    };

    BaseWindow.prototype._saveToSlot = function() {
        if (!this._dataBus || !this._slotId) return;
        this._isSaving = true;

        var realInstance = this.getRealInstance();
        var metadata = this._metadata;
        var data = this._data;

        if (realInstance && realInstance !== this) {
            if (typeof realInstance.getMetadata === 'function') metadata = realInstance.getMetadata();
            if (typeof realInstance.getData === 'function') data = realInstance.getData();
        }

        var meta = {};
        for (var k in metadata) {
            if (Object.prototype.hasOwnProperty.call(metadata, k)) meta[k] = metadata[k];
        }
        meta.modified = new Date().toISOString();
        if (!meta.type) meta.type = this.type;
        if (!meta.id) meta.id = this.id;
        if (!meta.slotId) meta.slotId = this._slotId;

        var ok = this._dataBus.setSlotData(this._slotId, {
            metadata: meta,
            data: data,
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
    };

    BaseWindow.prototype._onSlotUpdate = function(payload) {
        if (!payload) return;

        var realInstance = this.getRealInstance();

        if (realInstance && realInstance !== this && typeof realInstance.onDataUpdate === 'function') {
            try {
                realInstance.onDataUpdate(payload);
                return;
            } catch (e) {
                console.error('[BaseWindow] onDataUpdate error:', e);
            }
        }

        var needsUpdate = false;

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
    };

    // ============================================================
    // 17. ИМПОРТ / ЭКСПОРТ
    // ============================================================

    BaseWindow.prototype._onDataImport = function() {
        var realInstance = this.getRealInstance();
        if (!realInstance || typeof realInstance.onImport !== 'function') {
            console.warn('[BaseWindow] onImport not implemented');
            this.notify('Импорт', 'Окно не поддерживает импорт', 'warning');
            return;
        }

        var self = this;

        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.lsw,.txt';

        input.onchange = function(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function(ev) {
                var parsed;
                var content = ev.target.result;

                try {
                    parsed = JSON.parse(content);
                } catch (err) {
                    parsed = content;
                }

                try {
                    var ok = realInstance.onImport(parsed);
                    if (ok !== false) {
                        self._saveToSlot();
                        self.notify('Импорт', 'Данные загружены', 'success');

                        if (window.historyManager) {
                            var typeName = self._typeConfig ? self._typeConfig.name : self.type;
                            var label = typeName + ' — импорт из файла';
                            try {
                                window.historyManager.record(label);
                                document.dispatchEvent(new CustomEvent('history-recorded', {
                                    detail: { label: label }
                                }));
                            } catch (e) {}
                        }
                    } else {
                        self.notify('Импорт', 'Окно отклонило данные', 'warning');
                    }
                } catch (err) {
                    console.error('[BaseWindow] onImport error:', err);
                    self.notify('Ошибка импорта', err.message || 'Не удалось', 'error');
                }
            };

            reader.onerror = function() {
                self.notify('Ошибка', 'Не удалось прочитать файл', 'error');
            };

            reader.readAsText(file);
        };

        input.click();
    };

    BaseWindow.prototype._onDataExport = function() {
        var realInstance = this.getRealInstance();
        if (!realInstance || typeof realInstance.onExport !== 'function') {
            console.warn('[BaseWindow] onExport not implemented');
            this.notify('Экспорт', 'Окно не поддерживает экспорт', 'warning');
            return;
        }

        var payload;
        try {
            payload = realInstance.onExport();
        } catch (err) {
            console.error('[BaseWindow] onExport error:', err);
            this.notify('Ошибка экспорта', err.message || 'Не удалось', 'error');
            return;
        }

        var content;
        if (typeof payload === 'string') {
            content = payload;
        } else {
            try {
                content = JSON.stringify(payload, null, 2);
            } catch (err) {
                console.error('[BaseWindow] JSON.stringify error:', err);
                this.notify('Ошибка', 'Не удалось сериализовать', 'error');
                return;
            }
        }

        try {
            var blob = new Blob([content], { type: 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = this.type + '_' + (this._slotId || this.id) + '_' + new Date().toISOString().slice(0, 10) + '.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

            this.notify('Экспорт', 'Файл сохранён', 'success');
        } catch (err) {
            console.error('[BaseWindow] export download error:', err);
            this.notify('Ошибка', 'Не удалось сохранить файл', 'error');
        }
    };

    BaseWindow.prototype._onDataNewSlot = function() {
        this.createEmptySlot();
        this.notify('Новый слот', 'Создан новый слот', 'success');

        if (window.historyManager) {
            var typeName = this._typeConfig ? this._typeConfig.name : this.type;
            var label = typeName + ' — новый слот';
            try {
                window.historyManager.record(label);
                document.dispatchEvent(new CustomEvent('history-recorded', {
                    detail: { label: label }
                }));
            } catch (e) {}
        }
    };

    BaseWindow.prototype._onDataAttach = function(data) {
        if (!data || !data.slotId) return;
        this.attachTo(data.slotId);

        if (window.historyManager) {
            var typeName = this._typeConfig ? this._typeConfig.name : this.type;
            var label = typeName + ' — привязка к слоту ' + data.slotId;
            try {
                window.historyManager.record(label);
                document.dispatchEvent(new CustomEvent('history-recorded', {
                    detail: { label: label }
                }));
            } catch (e) {}
        }
    };

    // ============================================================
    // 18. MESSAGE BUS
    // ============================================================

    BaseWindow.prototype._subscribeToMessages = function() {
        if (!this._messageBus) return;

        var self = this;
        this._messageUnsubscribe = this._messageBus.subscribeAll(
            this.id,
            function(senderId, channel, data) {
                if (self._isReady && !self._isDestroyed) {
                    self._onMessageReceived(senderId, channel, data);
                }
            }
        );
    };

    BaseWindow.prototype.sendMessage = function(channel, data, targetId) {
        if (!this._messageBus) return false;
        return this._messageBus.send(this.id, channel, data, targetId || null);
    };

    BaseWindow.prototype.sendToType = function(channel, data, typeId) {
        if (!this._messageBus) return false;
        return this._messageBus.sendToType(this.id, typeId || this.type, channel, data);
    };

    BaseWindow.prototype.sendToSlot = function(channel, data, slotId) {
        if (!this._messageBus) return false;
        return this._messageBus.sendToTypeAndSlot(
            this.id, this.type, slotId || this._slotId, channel, data
        );
    };

    BaseWindow.prototype.subscribeToMessage = function(channel, callback) {
        if (!this._messageBus) return function() {};
        return this._messageBus.subscribe(this.id, channel, callback);
    };

    BaseWindow.prototype.request = function(channel, data, targetId, options) {
        if (!this._messageBus) {
            return Promise.reject(new Error('[BaseWindow] MessageBus not available'));
        }
        return this._messageBus.request(this.id, targetId, channel, data, options || {});
    };

    BaseWindow.prototype.onRequest = function(channel, handler) {
        if (!this._messageBus) return function() {};
        var unsub = this._messageBus.onRequest(this.id, channel, handler);
        var self = this;

        var wrapped = function() {
            var idx = self._requestUnsubs.indexOf(wrapped);
            if (idx !== -1) self._requestUnsubs.splice(idx, 1);
            try { unsub(); } catch (e) {}
        };

        this._requestUnsubs.push(wrapped);
        return wrapped;
    };

    // ============================================================
    // 19. LAYOUT
    // ============================================================

    BaseWindow.prototype._setupLayoutListener = function() {
        var self = this;

        var changeHandler = function() {
            if (!self._isDestroyed && self._isReady) {
                if (self._chrome) self._chrome.updateWindowCount();
            }
        };

        document.addEventListener('layout-changed', changeHandler);
        this._subscriptions.push(function() {
            document.removeEventListener('layout-changed', changeHandler);
        });

        var renderedHandler = function() {
            if (self._isDestroyed || !self._isReady) return;

            if (self._chrome && typeof self._chrome.resize === 'function') {
                try { self._chrome.resize(); } catch (e) {}
            }

            var realInstance = self.getRealInstance();
            if (realInstance && realInstance !== self && typeof realInstance.resize === 'function') {
                try { realInstance.resize(); } catch (e) {}
            }
        };

        document.addEventListener('layout-rendered', renderedHandler);
        this._subscriptions.push(function() {
            document.removeEventListener('layout-rendered', renderedHandler);
        });
    };

    BaseWindow.prototype.refreshHeader = function() {
        if (!this._isReady || this._isDestroyed) return;
        if (this._header) this._header.refresh();
        if (this._chrome) this._chrome.refresh();
    };

    // ============================================================
    // 20. СМЕНА ТИПА
    // ============================================================

    BaseWindow.prototype._changeType = function(newType) {
        if (newType === this.type) return;

        if (!this._registry) {
            console.error('[BaseWindow] Registry not available');
            return;
        }

        var typeConfig = this._registry.getType(newType);
        if (!typeConfig) {
            console.error('[BaseWindow] Type "' + newType + '" not found');
            return;
        }

        var oldType = this.type;
        var oldSlotId = this._slotId;

        var currentData = this.getData();
        var currentState = this.getState();
        var currentMetadata = this.getMetadata();

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
            var oldSlot = this._dataBus.getSlot(oldSlotId);
            if (oldSlot && oldSlot.attachedWindows.size === 0) {
                this._dataBus.archiveSlot(oldSlotId);
            }
        }

        this.type = newType;
        this._typeConfig = typeConfig;
        this._title = typeConfig.name || newType;
        this._icon = typeConfig.icon || '📄';

        var newSlotId = null;
        if (this._dataBus) {
            newSlotId = this._dataBus.createSlot(newType);
            if (newSlotId) {
                this._slotId = newSlotId;
                this._dataBus.attachWindowToSlot(newSlotId, this.id);
                this._subscribeToSlot();
            }
        }

        if (typeConfig.create && this._chrome) {
            try {
                var contentContainer = this._chrome.getContent();

                if (contentContainer) {
                    contentContainer.innerHTML = '';

                    var newInstance = typeConfig.create(
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

                        var root = null;
                        if (newInstance._root) root = newInstance._root;
                        else if (typeof newInstance.getRoot === 'function') {
                            try { root = newInstance.getRoot(); } catch (e) {}
                        }

                        if (root) {
                            this._ensureRealInstanceFillsHost(root, contentContainer);
                            this._ensureRealInstanceObserver(newInstance, contentContainer);
                        }

                        var ri = newInstance;
                        requestAnimationFrame(function() {
                            requestAnimationFrame(function() {
                                if (typeof ri.resize === 'function') {
                                    try { ri.resize(); } catch (e) {}
                                }
                            });
                        });
                    }
                }
            } catch (error) {
                console.error('[BaseWindow] Error creating new instance:', error);
            }
        }

        var meta = {};
        for (var k in currentMetadata) {
            if (Object.prototype.hasOwnProperty.call(currentMetadata, k)) meta[k] = currentMetadata[k];
        }
        meta.type = newType;
        meta.title = this._title;
        meta.modified = new Date().toISOString();
        meta.slotId = newSlotId;
        this._metadata = meta;

        if (this._layoutManager) {
            var node = this._layoutManager.getNodeByWindowId(this.id);
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

        if (this._chrome) {
            this._chrome._type = newType;
            this._chrome.setTitle(this._title);
            this._chrome.setIcon(this._icon);
            var rootEl = this._chrome.getRoot();
            if (rootEl) rootEl.dataset.windowType = newType;
        }

        this.refreshHeaderItems();

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
            var oldCfg = this._registry.getType(oldType);
            var newCfg = this._registry.getType(newType);
            var oldName = (oldCfg && oldCfg.name) || oldType;
            var newName = (newCfg && newCfg.name) || newType;
            var label = 'Смена типа: ' + oldName + ' → ' + newName;

            try {
                window.historyManager.record(label);
                document.dispatchEvent(new CustomEvent('history-recorded', {
                    detail: { label: label }
                }));
            } catch (e) {
                console.error('[BaseWindow] historyManager.record error:', e);
            }
        }
    };

    // ============================================================
    // 21. ЗАКРЫТИЕ / SWAP
    // ============================================================

    BaseWindow.prototype._close = function() {
        if (this._layoutManager) {
            this._layoutManager.closeWindow(this.id);
        } else {
            this.destroy();
        }
    };

    BaseWindow.prototype._swapWith = function(targetId) {
        if (this.id === targetId) return;
        if (this._layoutManager) {
            this._layoutManager.swapWindows(this.id, targetId);
        }
    };

    // ============================================================
    // 22. EVENTS ОТ HEADER
    // ============================================================

    BaseWindow.prototype._onRenderClose = function() {
        this._close();
    };

    BaseWindow.prototype._onRenderChangeType = function(data) {
        if (data && data.newType) {
            this._changeType(data.newType);
        }
    };

    BaseWindow.prototype._onRenderLayoutChange = function(data) {
        if (data && data.styleId && this._layoutManager) {
            this._layoutManager.setLayoutStyle(data.styleId);
        }
    };

    BaseWindow.prototype._onRenderMenuAction = function(data) {
        var realInstance = this.getRealInstance();
        var action = data.action;
        var value = data.value;
        var item = data.item;
        var payload = data.payload;

        if (realInstance && realInstance !== this
            && typeof realInstance.onHeaderItemClick === 'function') {
            try {
                var handled = realInstance.onHeaderItemClick(
                    item || { action: action, value: value },
                    {
                        action: action,
                        value: value,
                        item: item,
                        payload: payload,
                        source: item && item.type === 'dropdown' ? 'dropdown' : 'button'
                    }
                );
                if (handled === true) return;
            } catch (e) {
                console.error('[BaseWindow] onHeaderItemClick error:', e);
            }
        }

        if (realInstance && realInstance !== this) {
            if (action && typeof realInstance[action] === 'function') {
                try {
                    realInstance[action](value, payload, item);
                } catch (e) {
                    console.error('[BaseWindow] menu action "' + action + '" error:', e);
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
    };

    BaseWindow.prototype._onRenderSwap = function(data) {
        if (data && data.targetId) {
            this._swapWith(data.targetId);
        }
    };

    BaseWindow.prototype._onRenderMinimize = function() {
        if (!this._layoutManager) return;
        this._layoutManager.minimizeWindow(this.id);
    };

    BaseWindow.prototype._onRenderFullscreen = function() {
        if (!this._layoutManager) return;
        this._layoutManager.setFullscreen(this.id);
    };

    BaseWindow.prototype._onRenderFullscreenExit = function() {
        if (!this._layoutManager) return;
        this._layoutManager.exitFullscreen();
    };

    // ============================================================
    // 23. ХУКИ
    // ============================================================

    BaseWindow.prototype._onReady = function() {};
    BaseWindow.prototype._onDataChanged = function() {};
    BaseWindow.prototype._onStateChanged = function() {};
    BaseWindow.prototype._onDataLoaded = function() {};
    BaseWindow.prototype._onResize = function() {};
    BaseWindow.prototype._onMessageReceived = function() {};

    BaseWindow.prototype._onFocus = function() {
        if (this._isDestroyed) return;
        this._isFocused = true;

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.onFocus === 'function') {
            try { realInstance.onFocus(); } catch (e) {
                console.error('[BaseWindow] onFocus error:', e);
            }
        }

        if (this.container) this.container.classList.add('window-focused');

        this._emit('window-focused', {
            id: this.id, type: this.type, slotId: this._slotId
        });
    };

    BaseWindow.prototype._onBlur = function() {
        if (this._isDestroyed) return;
        this._isFocused = false;

        var realInstance = this.getRealInstance();
        if (realInstance && realInstance !== this
            && typeof realInstance.onBlur === 'function') {
            try { realInstance.onBlur(); } catch (e) {
                console.error('[BaseWindow] onBlur error:', e);
            }
        }

        if (this.container) this.container.classList.remove('window-focused');

        this._emit('window-blurred', {
            id: this.id, type: this.type, slotId: this._slotId
        });
    };

    BaseWindow.prototype.isFocused = function() {
        return this._isFocused;
    };

    // ============================================================
    // 24. ПУБЛИЧНЫЕ МЕТОДЫ
    // ============================================================

    BaseWindow.prototype.setTitle = function(title) {
        this._title = title;
        if (this._chrome) this._chrome.setTitle(title);
        return this;
    };

    BaseWindow.prototype.getTitle = function() { return this._title; };
    BaseWindow.prototype.getIcon = function() { return this._icon; };
    BaseWindow.prototype.getType = function() { return this.type; };
    BaseWindow.prototype.getId = function() { return this.id; };
    BaseWindow.prototype.isReady = function() { return this._isReady; };
    BaseWindow.prototype.isDestroyed = function() { return this._isDestroyed; };
    BaseWindow.prototype.getContainer = function() { return this.container; };

    BaseWindow.prototype.getRoot = function() {
        return this._chrome ? this._chrome.getRoot() : null;
    };

    BaseWindow.prototype.getRenderWindow = function() {
        return this._chrome;
    };

    BaseWindow.prototype.getChrome = function() {
        return this._chrome;
    };

    BaseWindow.prototype.getHeader = function() {
        return this._header;
    };

    // ============================================================
    // 25. СОБЫТИЯ
    // ============================================================

    BaseWindow.prototype._emit = function(event, data) {
        var detail = {};
        for (var k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k)) detail[k] = data[k];
        }
        detail.windowId = this.id;

        if (this._eventBus) {
            this._eventBus.emit(event, detail);
        }
        document.dispatchEvent(new CustomEvent(event, { detail: detail }));
    };

    BaseWindow.prototype._on = function(event, callback) {
        if (this._eventBus) {
            var self = this;
            var unsubscribe = this._eventBus.on(event, function(data) {
                if (data.windowId === self.id || !data.windowId) {
                    callback(data);
                }
            });
            this._subscriptions.push(unsubscribe);
            return unsubscribe;
        }
        return function() {};
    };

    BaseWindow.prototype.notify = function(title, message, type) {
        type = type || 'info';
        var typeSafe = (type === 'error' || type === 'warning' || type === 'success' || type === 'info')
            ? type
            : 'info';

        var titleStr = (title != null ? String(title) : '').trim();
        var messageStr = (message != null ? String(message) : '').trim();

        var finalMessage;
        if (titleStr && titleStr !== messageStr) {
            finalMessage = titleStr + ': ' + messageStr;
        } else {
            finalMessage = messageStr || titleStr || '';
        }

        if (typeof window.showNotification === 'function') {
            try {
                window.showNotification(finalMessage, typeSafe);
                return;
            } catch (e) {
                console.warn('[BaseWindow] showNotification error:', e);
            }
        }

        if (this._eventBus && typeof this._eventBus.emit === 'function') {
            try {
                this._eventBus.emit('notification', {
                    title: titleStr,
                    message: messageStr,
                    type: typeSafe
                });
            } catch (e) {}
        }

        try {
            document.dispatchEvent(new CustomEvent('notification', {
                detail: { title: titleStr, message: messageStr, type: typeSafe },
                bubbles: true
            }));
        } catch (e) {}
    };

    // ============================================================
    // 26. СТАТИЧЕСКИЙ МЕТОД
    // ============================================================

    BaseWindow.create = function(config) {
        var registry = config.options && config.options.registry;
        if (!registry) {
            throw new Error('[BaseWindow] Registry is required');
        }

        var typeConfig = registry.getType(config.type);
        if (!typeConfig) {
            throw new Error('[BaseWindow] Type "' + config.type + '" not found');
        }

        var id = (config.options && config.options.id) || Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        var windowData = {
            id: id,
            type: config.type,
            title: typeConfig.name,
            icon: typeConfig.icon
        };

        var realInstance = (config.options && config.options._realInstance) || null;

        if (!realInstance && typeConfig.create) {
            try {
                realInstance = typeConfig.create(config.container, windowData, config.options || {});
            } catch (error) {
                console.error('[BaseWindow.create] Factory error:', error);
                realInstance = null;
            }
        }

        if (realInstance instanceof BaseWindow) {
            return realInstance;
        }

        var opts = {};
        for (var k in config.options) {
            if (Object.prototype.hasOwnProperty.call(config.options, k)) {
                opts[k] = config.options[k];
            }
        }
        opts._realInstance = realInstance;

        return new BaseWindow({
            id: id,
            type: config.type,
            container: config.container,
            options: opts
        });
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BaseWindow: BaseWindow };
    }

    if (typeof window !== 'undefined') {
        window.BaseWindow = BaseWindow;
    }

})();