// core/API/BaseWindowInstance.js
// Версия 1.0.2 — drag-source по data-action + guard от двойной регистрации
// - _registerMenuDragSources: поиск по `.window-action-btn[data-action=...]`
// - Guard: if (_dragUnsubs.length > 0) return
// - _cssEscape: CSS.escape fallback

(function() {
    'use strict';

    console.log('[BaseWindowInstance] Loading v1.0.2...');

    class BaseWindowInstance {
        constructor(container, windowData, options = {}) {
            this.container = container;
            this.windowData = windowData || {};
            this.options = options;
            this.id = this.windowData.id;
            this.type = this.windowData.type || (this.constructor.meta && this.constructor.meta.id);
            this.slotId = this.windowData.slotId || null;

            this._dataBus = options.dataBus || null;
            this._registry = options.registry || null;
            this._eventBus = options.eventBus || null;
            this._messageBus = options.messageBus || null;
            this._layoutManager = options.layoutManager || null;
            this._baseWindow = options._baseWindow || null;

            this._isReady = false;
            this._isDestroyed = false;
            this._isVisible = true;
            this._isUpdating = false;

            this.data = null;
            this.metadata = {};
            this.uiState = {};

            this._root = null;
            this._content = null;

            this._channelUnsubs = [];
            this._dragUnsubs = [];
            this._dropUnsub = null;
            this._hotkeyUnsub = null;
            this._requestUnsubs = [];

            this._buildRoot();
            this._setupChannels();
            this.buildContent(this._content);

            if (this._baseWindow) {
                this._initAfterBaseWindow();
            }

            console.log('[BaseWindowInstance] Created:', this.type, '(', this.id, ')');
        }

        // ============================================================
        // 1. СОЗДАНИЕ DOM-КОРНЯ
        // ============================================================

        _buildRoot() {
            this._root = document.createElement('div');
            this._root.className = 'bwi-root';
            Object.assign(this._root.style, {
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                boxSizing: 'border-box',
                background: 'var(--bg-dark, #0d0d0d)',
                color: 'var(--text-primary, #e0d8cc)'
            });

            this._content = document.createElement('div');
            this._content.className = 'bwi-content';
            Object.assign(this._content.style, {
                flex: '1 1 auto',
                minHeight: '0',
                minWidth: '0',
                overflow: 'auto',
                position: 'relative',
                boxSizing: 'border-box'
            });

            this._root.appendChild(this._content);
            this.container.appendChild(this._root);
        }

        // ============================================================
        // 2. КОНТЕНТ
        // ============================================================

        buildContent(el) {}

        // ============================================================
        // 3. ПОДПИСКИ
        // ============================================================

        _setupChannels() {
            if (!this._messageBus) return;

            const channels = this.constructor.channels || [];
            if (!Array.isArray(channels) || channels.length === 0) return;

            for (const ch of channels) {
                if (!ch || typeof ch !== 'string') continue;

                const unsub = this._messageBus.subscribe(
                    this.id,
                    ch,
                    (senderId, data) => {
                        if (this._isDestroyed) return;
                        if (typeof this.onMessage === 'function') {
                            try {
                                this.onMessage(senderId, ch, data);
                            } catch (e) {
                                console.error(`[BaseWindowInstance] onMessage("${ch}") error:`, e);
                            }
                        }
                    }
                );
                this._channelUnsubs.push(unsub);
            }

            console.log(`[BaseWindowInstance #${this.id}] subscribed to`, channels);
        }

        // ============================================================
        // 4. ИНИЦИАЛИЗАЦИЯ ПОСЛЕ BASE WINDOW
        // ============================================================

        onBaseWindowAttached(baseWindow) {
            this._baseWindow = baseWindow || this._baseWindow;
            if (!this._baseWindow) {
                console.warn('[BaseWindowInstance] onBaseWindowAttached: no baseWindow');
                return;
            }
            this._initAfterBaseWindow();
        }

        _initAfterBaseWindow() {
            this._registerDropTarget();
            this._registerMenuDragSources();
            this._registerHotkeys();
            this._loadFromSlot();

            this._isReady = true;

            if (typeof this.onReady === 'function') {
                try {
                    this.onReady();
                } catch (e) {
                    console.error('[BaseWindowInstance] onReady error:', e);
                }
            }

            console.log(`[BaseWindowInstance #${this.id}] ready`);
        }

        // ============================================================
        // 5. DROP-TARGET
        // ============================================================

        _registerDropTarget() {
            if (!this._baseWindow || typeof this._baseWindow.registerDropTarget !== 'function') {
                return;
            }

            const dropConfig = this.constructor.dropTarget;
            if (!dropConfig || typeof dropConfig !== 'object') {
                return;
            }

            const hasOnDrop = typeof this.onDrop === 'function'
                && this.onDrop !== BaseWindowInstance.prototype.onDrop;

            if (!hasOnDrop) return;

            const unsub = this._baseWindow.registerDropTarget({
                acceptExtensions: dropConfig.acceptExtensions,
                accept: dropConfig.accept,
                multiple: dropConfig.multiple !== false,

                onDrop: async (files, meta) => {
                    if (this._isDestroyed) return false;
                    try {
                        const result = await Promise.resolve(this.onDrop(files, meta));
                        return result !== false;
                    } catch (e) {
                        console.error('[BaseWindowInstance] onDrop error:', e);
                        return false;
                    }
                },

                onDragEnter: (meta) => {
                    if (this._isDestroyed) return;
                    if (typeof this.onDragEnter === 'function') {
                        try { this.onDragEnter(meta); } catch (e) {
                            console.error('[BaseWindowInstance] onDragEnter error:', e);
                        }
                    }
                },

                onDragLeave: () => {
                    if (this._isDestroyed) return;
                    if (typeof this.onDragLeave === 'function') {
                        try { this.onDragLeave(); } catch (e) {
                            console.error('[BaseWindowInstance] onDragLeave error:', e);
                        }
                    }
                }
            });

            this._dropUnsub = unsub;
        }

        // ============================================================
        // 6. DRAG-SOURCE ИЗ КНОПОК МЕНЮ (v1.0.2)
        // ============================================================

        _registerMenuDragSources() {
            if (!this._baseWindow || typeof this._baseWindow.registerDragSource !== 'function') {
                return;
            }

            const menu = this.constructor.menu;
            if (!menu || !Array.isArray(menu.headerButtons)) return;

            // Guard от двойной регистрации
            if (this._dragUnsubs.length > 0) return;

            const headerEl = this._baseWindow.getRenderWindow?.()?.getHeader?.();
            if (!headerEl) {
                setTimeout(() => this._registerMenuDragSources(), 50);
                return;
            }

            // Проверяем, что все drag-source кнопки в DOM (по data-action)
            let allFound = true;
            let hasAnyDragSource = false;

            for (const btnConfig of menu.headerButtons) {
                if (!btnConfig || !btnConfig.dragSource) continue;
                if (!btnConfig.action) continue;
                hasAnyDragSource = true;

                const sel = `.window-action-btn[data-action="${this._cssEscape(btnConfig.action)}"]`;
                if (!headerEl.querySelector(sel)) {
                    allFound = false;
                    break;
                }
            }

            if (!hasAnyDragSource) return;

            if (!allFound) {
                setTimeout(() => this._registerMenuDragSources(), 50);
                return;
            }

            // Регистрируем по data-action
            for (const btnConfig of menu.headerButtons) {
                if (!btnConfig || !btnConfig.dragSource) continue;
                const action = btnConfig.action;
                if (!action) continue;

                const sel = `.window-action-btn[data-action="${this._cssEscape(action)}"]`;
                const btn = headerEl.querySelector(sel);
                if (!btn) continue;

                const ds = btnConfig.dragSource;
                const unsub = this._baseWindow.registerDragSource(btn, {
                    type: ds.type || 'default',
                    getPayload: typeof ds.getPayload === 'function'
                        ? ds.getPayload.bind(this)
                        : () => ds.payload || null,
                    ghostHTML: ds.ghostHTML || null
                });

                this._dragUnsubs.push(unsub);

                console.log(`[BaseWindowInstance #${this.id}] drag-source registered on "${action}"`);
            }
        }

        _cssEscape(s) {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(s);
            }
            return String(s).replace(/([^\w-])/g, '\\$1');
        }

        // ============================================================
        // 7. HOTKEYS
        // ============================================================

        _registerHotkeys() {
            if (!this._baseWindow || typeof this._baseWindow.registerHotkeys !== 'function') {
                return;
            }
            this._baseWindow.registerHotkeys();
        }

        getHotkeys() {
            const hotkeys = this.constructor.hotkeys || {};
            const map = {};

            for (const [combo, config] of Object.entries(hotkeys)) {
                if (!config || typeof config !== 'object') continue;
                const action = config.action;
                if (!action) continue;

                map[combo] = (event) => {
                    if (this._isDestroyed) return;
                    if (typeof this[action] === 'function') {
                        try { this[action](); } catch (e) {
                            console.error(`[BaseWindowInstance] hotkey action "${action}" error:`, e);
                        }
                    }
                };
            }

            return map;
        }

        // ============================================================
        // 8. СЛОТЫ / DATA
        // ============================================================

        _loadFromSlot() {
            const data = this._dataBus && this.slotId
                ? this._dataBus.getSlotData(this.slotId)
                : null;

            if (data) {
                this.metadata = data.metadata || {};
                this.data = data.data !== undefined ? data.data : null;
                this.uiState = data.uiState || {};

                if (typeof this.onData === 'function') {
                    try {
                        this.onData({ data: this.data, metadata: this.metadata, uiState: this.uiState });
                    } catch (e) {
                        console.error('[BaseWindowInstance] onData (initial) error:', e);
                    }
                }
            }
        }

        onDataUpdate(payload) {
            if (this._isDestroyed) return;
            if (this._isUpdating) return;

            this._isUpdating = true;
            try {
                if (payload.metadata !== undefined) {
                    this.metadata = payload.metadata || {};
                }
                if (payload.data !== undefined) {
                    this.data = payload.data;
                }
                if (payload.uiState !== undefined) {
                    this.uiState = payload.uiState || {};
                }

                if (typeof this.onData === 'function') {
                    try {
                        this.onData(payload);
                    } catch (e) {
                        console.error('[BaseWindowInstance] onData error:', e);
                    }
                }
            } finally {
                this._isUpdating = false;
            }
        }

        getAllData() {
            return {
                metadata: this.metadata ? { ...this.metadata } : {},
                data: this.data
            };
        }

        setAllData(payload) {
            if (!payload) return;
            if (payload.metadata !== undefined) this.metadata = payload.metadata || {};
            if (payload.data !== undefined) this.data = payload.data;
        }

        getMetadata() {
            return this.metadata ? { ...this.metadata } : {};
        }

        getData() {
            return this.data;
        }

        setData(data) {
            this.data = data;
            return true;
        }

        getState() {
            return this.uiState ? { ...this.uiState } : {};
        }

        setState(state) {
            if (!state) return this;
            this.uiState = { ...this.uiState, ...state };
            return this;
        }

        // ============================================================
        // 9. ХУКИ
        // ============================================================

        onThemeChange(theme) {
            if (this._isDestroyed) return;
            if (typeof this.onTheme === 'function') {
                try { this.onTheme(theme); } catch (e) {
                    console.error('[BaseWindowInstance] onTheme error:', e);
                }
            }
        }

        onVisibilityChange(visible) {
            if (this._isDestroyed) return;
            this._isVisible = !!visible;
            if (typeof this.onVisibility === 'function') {
                try { this.onVisibility(this._isVisible); } catch (e) {
                    console.error('[BaseWindowInstance] onVisibility error:', e);
                }
            }
        }

        onFocus() {
            if (this._isDestroyed) return;
            if (typeof this._onFocus === 'function') {
                try { this._onFocus(); } catch (e) {}
            }
        }

        onBlur() {
            if (this._isDestroyed) return;
            if (typeof this._onBlur === 'function') {
                try { this._onBlur(); } catch (e) {}
            }
        }

        onSlotChange(slotId) {
            if (this._isDestroyed) return;
            this.slotId = slotId;
            if (typeof this.onSlotChanged === 'function') {
                try { this.onSlotChanged(slotId); } catch (e) {
                    console.error('[BaseWindowInstance] onSlotChanged error:', e);
                }
            }
        }

        resize() {
            if (this._isDestroyed) return;
            if (typeof this.onResize === 'function') {
                const w = this._root ? this._root.clientWidth : 0;
                const h = this._root ? this._root.clientHeight : 0;
                try { this.onResize(w, h); } catch (e) {
                    console.error('[BaseWindowInstance] onResize error:', e);
                }
            }
        }

        onImport(parsed) { return false; }
        onExport() { return null; }

        // ============================================================
        // 10. ХЕЛПЕРЫ
        // ============================================================

        save() {
            if (this._baseWindow && typeof this._baseWindow.save === 'function') {
                try { this._baseWindow.save(); } catch (e) {
                    console.error('[BaseWindowInstance] save error:', e);
                }
            }
        }

        notify(title, message, type = 'info') {
            if (this._baseWindow && typeof this._baseWindow.notify === 'function') {
                this._baseWindow.notify(title, message, type);
                return;
            }
            if (typeof window.showNotification === 'function') {
                window.showNotification(String(message || title || ''), type);
            }
        }

        isVisible() {
            return !!this._isVisible;
        }

        isFocused() {
            return this._baseWindow ? !!this._baseWindow.isFocused?.() : false;
        }

        getRoot() {
            return this._root;
        }

        // ============================================================
        // 11. MESSAGEBUS
        // ============================================================

        sendMessage(channel, data, targetId = null) {
            if (!this._messageBus) return false;
            return this._messageBus.send(this.id, channel, data, targetId);
        }

        sendToType(channel, data, typeId = null) {
            if (!this._messageBus) return false;
            return this._messageBus.sendToType(this.id, typeId || this.type, channel, data);
        }

        sendToSlot(channel, data, slotId = null) {
            if (!this._messageBus) return false;
            return this._messageBus.sendToTypeAndSlot(
                this.id, this.type, slotId || this.slotId, channel, data
            );
        }

        subscribeToMessage(channel, callback) {
            if (!this._messageBus) return () => {};
            const unsub = this._messageBus.subscribe(this.id, channel, callback);
            this._channelUnsubs.push(unsub);
            return unsub;
        }

        request(channel, data, targetId, options = {}) {
            if (!this._messageBus) {
                return Promise.reject(new Error('[BaseWindowInstance] MessageBus not available'));
            }
            return this._messageBus.request(this.id, targetId, channel, data, options);
        }

        onRequest(channel, handler) {
            if (!this._messageBus) return () => {};
            const unsub = this._messageBus.onRequest(this.id, channel, handler);
            this._requestUnsubs.push(unsub);
            return unsub;
        }

        // ============================================================
        // 12. KEYBOARD CAPTURE
        // ============================================================

        captureKeyboard() {
            if (!window.hotkeyRegistry) return false;
            return window.hotkeyRegistry.captureKeyboard(this.id);
        }

        releaseKeyboard() {
            if (!window.hotkeyRegistry) return false;
            return window.hotkeyRegistry.releaseKeyboard(this.id);
        }

        // ============================================================
        // 13. ПОИСК ОКОН
        // ============================================================

        findWindowByType(typeId) {
            if (!typeId || !this._layoutManager) return null;

            const myId = String(this.id);
            const getVisible = this._layoutManager.getVisibleWindowsByType;
            const getMinimized = this._layoutManager.getMinimizedWindowsByType;

            if (typeof getVisible === 'function') {
                for (const w of getVisible.call(this._layoutManager, typeId)) {
                    if (String(w.id) !== myId) return this._wrapWindow(w);
                }
            }
            if (typeof getMinimized === 'function') {
                for (const w of getMinimized.call(this._layoutManager, typeId)) {
                    if (String(w.id) !== myId) return this._wrapWindow(w);
                }
            }
            return null;
        }

        findWindowsByType(typeId) {
            if (!typeId || !this._layoutManager) return [];

            const myId = String(this.id);
            const result = [];

            const getVisible = this._layoutManager.getVisibleWindowsByType;
            const getMinimized = this._layoutManager.getMinimizedWindowsByType;

            if (typeof getVisible === 'function') {
                for (const w of getVisible.call(this._layoutManager, typeId)) {
                    if (String(w.id) !== myId) result.push(this._wrapWindow(w));
                }
            }
            if (typeof getMinimized === 'function') {
                for (const w of getMinimized.call(this._layoutManager, typeId)) {
                    if (String(w.id) !== myId) result.push(this._wrapWindow(w));
                }
            }

            return result;
        }

        _wrapWindow(w) {
            return {
                id: w.id,
                type: w.type,
                slotId: w.slotId,
                title: w.title,
                icon: w.icon
            };
        }

        // ============================================================
        // 14. DRAG SOURCE
        // ============================================================

        makeDraggable(element, opts = {}) {
            if (!this._baseWindow || typeof this._baseWindow.registerDragSource !== 'function') {
                return () => {};
            }
            const unsub = this._baseWindow.registerDragSource(element, opts);
            this._dragUnsubs.push(unsub);
            return unsub;
        }

        // ============================================================
        // 15. УТИЛИТЫ
        // ============================================================

        escapeHtml(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ============================================================
        // 16. DESTROY
        // ============================================================

        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            this._isReady = false;

            if (typeof this.onBeforeDestroy === 'function') {
                try { this.onBeforeDestroy(); } catch (e) {
                    console.error('[BaseWindowInstance] onBeforeDestroy error:', e);
                }
            }

            if (window.hotkeyRegistry
                && window.hotkeyRegistry.getCapturedWindow() === String(this.id)) {
                try { window.hotkeyRegistry.releaseKeyboard(this.id); } catch (e) {}
            }

            for (const unsub of this._channelUnsubs) {
                try { unsub(); } catch (e) {}
            }
            this._channelUnsubs = [];

            for (const unsub of this._requestUnsubs) {
                try { unsub(); } catch (e) {}
            }
            this._requestUnsubs = [];

            for (const unsub of this._dragUnsubs) {
                try { unsub(); } catch (e) {}
            }
            this._dragUnsubs = [];

            if (this._dropUnsub) {
                try { this._dropUnsub(); } catch (e) {}
                this._dropUnsub = null;
            }

            if (this._hotkeyUnsub) {
                try { this._hotkeyUnsub(); } catch (e) {}
                this._hotkeyUnsub = null;
            }

            if (this._root && this._root.parentNode) {
                this._root.remove();
            }
            this._root = null;
            this._content = null;

            console.log(`[BaseWindowInstance] Destroyed: ${this.type} (${this.id})`);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BaseWindowInstance };
    }

    if (typeof window !== 'undefined') {
        window.BaseWindowInstance = BaseWindowInstance;
        console.log('[BaseWindowInstance] Registered globally v1.0.2');
    }

})();