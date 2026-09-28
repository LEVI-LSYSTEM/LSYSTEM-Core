// core/API/BaseWindowInstance.js
// Версия 5.1.0
// - DEFAULT_SYSTEM_HEADER_ITEMS без pin. Порядок определяет положение.
// - Остальное без изменений.

(function() {
    'use strict';

    var DEFAULT_SYSTEM_HEADER_ITEMS = [
        { id: 'sys-data',       type: 'sys-data' },
        { id: 'sys-changeType', type: 'sys-changeType' },
        { id: 'sys-layout',     type: 'sys-layout' },
        { type: 'separator' },
        { id: 'sys-minimize',   type: 'sys-minimize' },
        { id: 'sys-fullscreen', type: 'sys-fullscreen' },
        { id: 'sys-close',      type: 'sys-close' }
    ];

    function cloneSystemItems() {
        var out = [];
        for (var i = 0; i < DEFAULT_SYSTEM_HEADER_ITEMS.length; i++) {
            var item = DEFAULT_SYSTEM_HEADER_ITEMS[i];
            var copy = {};
            for (var k in item) {
                if (Object.prototype.hasOwnProperty.call(item, k)) copy[k] = item[k];
            }
            out.push(copy);
        }
        return out;
    }

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

            this._headerItemsRuntime = null;

            this._dragSourcesTimer = null;
            this._dragSourcesAttempts = 0;
            this._dragSourcesMaxAttempts = 20;

            this._pendingDragSources = [];
            this._pendingHeaderOps = [];
            this._initAfterBaseWindowDone = false;

            this._dragGuardInstalled = false;
            this._dragGuardCleanups = [];
            this._activePointerDrag = null;

            this._buildRoot();
            this._setupChannels();
            this.buildContent(this._content);

            if (this._baseWindow) {
                this._initAfterBaseWindow();
            }
        }

        static get dataMenu() {
            return null;
        }

        // ============================================================
        // 1. DOM-КОРЕНЬ
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

            this._installDragInterruptionGuard();
        }

        // ============================================================
        // 2. DRAG INTERRUPTION GUARD
        // ============================================================

        _installDragInterruptionGuard() {
            if (this._dragGuardInstalled) return;
            this._dragGuardInstalled = true;

            const root = this._root;
            if (!root) return;

            this._activePointerDrag = null;

            const isExternalDrag = () => {
                return !!(window.dragController && window.dragController.isDragging());
            };

            const onDown = (e) => {
                if (this._isDestroyed) return;
                if (isExternalDrag()) return;
                if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
                if (!root.contains(e.target)) return;

                this._activePointerDrag = {
                    target: e.target,
                    button: e.button,
                    buttons: e.buttons,
                    pointerId: (e.pointerId != null) ? e.pointerId : null,
                    pointerType: e.pointerType || 'mouse',
                    startX: e.clientX,
                    startY: e.clientY,
                    startedAt: performance.now()
                };
            };

            const releaseActiveDrag = (reason) => {
                if (isExternalDrag()) return;

                const drag = this._activePointerDrag;
                if (!drag) return;
                this._activePointerDrag = null;

                const target = drag.target;

                const opts = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX: drag.startX,
                    clientY: drag.startY,
                    screenX: 0,
                    screenY: 0,
                    button: drag.button,
                    buttons: 0,
                    pointerId: drag.pointerId != null ? drag.pointerId : 1,
                    pointerType: drag.pointerType,
                    isPrimary: true,
                    view: window
                };

                const dispatchTarget = (target && target.isConnected) ? target : document;

                try {
                    if (typeof PointerEvent === 'function') {
                        dispatchTarget.dispatchEvent(new PointerEvent('pointerup', opts));
                        dispatchTarget.dispatchEvent(new PointerEvent('pointercancel', opts));
                    }
                } catch (err) {}

                try {
                    dispatchTarget.dispatchEvent(new MouseEvent('mouseup', opts));
                    dispatchTarget.dispatchEvent(new MouseEvent('mouseleave', opts));
                } catch (err) {}

                this._forceResetWindowInteractions(reason);
            };

            const onPointerUpAnywhere = () => {
                this._activePointerDrag = null;
            };

            const onMouseLeaveRoot = (e) => {
                if (isExternalDrag()) return;
                if (!this._activePointerDrag) return;
                if (!root.contains(e.relatedTarget)) {
                    releaseActiveDrag('mouseleave');
                }
            };

            const onWindowBlur = () => {
                if (isExternalDrag()) return;
                releaseActiveDrag('window-blur');
            };

            const onVisibilityChange = () => {
                if (document.hidden) {
                    if (isExternalDrag()) return;
                    releaseActiveDrag('visibility-hidden');
                }
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    if (isExternalDrag()) return;
                    releaseActiveDrag('escape');
                }
            };

            root.addEventListener('mousedown', onDown, true);
            root.addEventListener('pointerdown', onDown, true);
            root.addEventListener('mouseleave', onMouseLeaveRoot, true);

            document.addEventListener('pointerup', onPointerUpAnywhere, true);
            document.addEventListener('mouseup', onPointerUpAnywhere, true);

            window.addEventListener('blur', onWindowBlur);
            document.addEventListener('visibilitychange', onVisibilityChange);
            document.addEventListener('keydown', onKeyDown, true);

            this._dragGuardCleanups = [
                () => root.removeEventListener('mousedown', onDown, true),
                () => root.removeEventListener('pointerdown', onDown, true),
                () => root.removeEventListener('mouseleave', onMouseLeaveRoot, true),
                () => document.removeEventListener('pointerup', onPointerUpAnywhere, true),
                () => document.removeEventListener('mouseup', onPointerUpAnywhere, true),
                () => window.removeEventListener('blur', onWindowBlur),
                () => document.removeEventListener('visibilitychange', onVisibilityChange),
                () => document.removeEventListener('keydown', onKeyDown, true)
            ];
        }

        _forceResetWindowInteractions(reason) {
            if (this._isDestroyed) return;
            if (window.dragController && window.dragController.isDragging()) return;

            if (typeof this.onExternalInteractionAbort === 'function') {
                try {
                    this.onExternalInteractionAbort(reason);
                } catch (e) {
                    console.error('[BaseWindowInstance] onExternalInteractionAbort error:', e);
                }
            }
        }

        // ============================================================
        // 3. КОНТЕНТ
        // ============================================================

        buildContent(el) {}

        // ============================================================
        // 4. ПОДПИСКИ НА КАНАЛЫ
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
        }

        // ============================================================
        // 5. ИНИЦИАЛИЗАЦИЯ ПОСЛЕ BASE WINDOW
        // ============================================================

        onBaseWindowAttached(baseWindow) {
            this._baseWindow = baseWindow || this._baseWindow;
            if (!this._baseWindow) return;
            this._initAfterBaseWindow();
        }

        _initAfterBaseWindow() {
            if (this._initAfterBaseWindowDone) {
                this._flushPendingHeaderOps();
                this._flushPendingDragSources();
                return;
            }
            this._initAfterBaseWindowDone = true;

            this._flushPendingHeaderOps();
            this._applyHeaderItems();

            this._registerDropTarget();
            this._registerMenuDragSources();
            this._flushPendingDragSources();
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
        }

        // ============================================================
        // 6. HEADER ITEMS
        // ============================================================

        getHeaderItems() {
            if (Array.isArray(this._headerItemsRuntime)) {
                return this._headerItemsRuntime.slice();
            }

            const menu = this.constructor.menu;
            if (!menu || !Array.isArray(menu.headerItems)) {
                return cloneSystemItems();
            }

            const filtered = menu.headerItems.filter(x => x && typeof x === 'object');

            if (filtered.length === 0 && menu.systemControls !== true) {
                return [];
            }

            return filtered;
        }

        _applyHeaderItems() {
            if (!this._baseWindow) return false;

            const items = this.getHeaderItems();

            if (typeof this._baseWindow.refreshHeaderItems === 'function') {
                try {
                    this._baseWindow.refreshHeaderItems();
                } catch (e) {
                    console.error('[BaseWindowInstance] _applyHeaderItems error:', e);
                    return false;
                }
                return true;
            }

            const header = this._baseWindow.getHeader && this._baseWindow.getHeader();
            if (header && typeof header.setItems === 'function') {
                try {
                    header.setItems(items);
                } catch (e) {
                    console.error('[BaseWindowInstance] _applyHeaderItems error:', e);
                    return false;
                }
                return true;
            }

            return false;
        }

        refreshHeaderItems() {
            if (this._isDestroyed) return false;
            return this._applyHeaderItems();
        }

        setHeaderItems(items) {
            if (this._isDestroyed) return false;

            if (items === null) {
                this._headerItemsRuntime = null;
            } else if (Array.isArray(items)) {
                this._headerItemsRuntime = items.filter(x => x && typeof x === 'object');
            } else {
                console.warn('[BaseWindowInstance] setHeaderItems: expected array or null');
                return false;
            }

            if (!this._baseWindow) {
                this._pendingHeaderOps.push({ type: 'set', items: this._headerItemsRuntime });
                return true;
            }

            return this._applyHeaderItems();
        }

        addHeaderItem(desc, index = undefined) {
            if (this._isDestroyed) return false;
            if (!desc || typeof desc !== 'object') {
                console.warn('[BaseWindowInstance] addHeaderItem: desc must be object');
                return false;
            }

            if (!Array.isArray(this._headerItemsRuntime)) {
                this._headerItemsRuntime = this.getHeaderItems();
            }

            if (typeof index === 'number' && index >= 0 && index <= this._headerItemsRuntime.length) {
                this._headerItemsRuntime.splice(index, 0, desc);
            } else {
                this._headerItemsRuntime.push(desc);
            }

            if (!this._baseWindow) {
                this._pendingHeaderOps.push({ type: 'add', desc, index });
                return true;
            }

            return this._applyHeaderItems();
        }

        removeHeaderItem(id) {
            if (this._isDestroyed) return false;
            if (!id) return false;

            if (!Array.isArray(this._headerItemsRuntime)) {
                this._headerItemsRuntime = this.getHeaderItems();
            }

            const before = this._headerItemsRuntime.length;
            this._headerItemsRuntime = this._headerItemsRuntime.filter(d => d.id !== id);

            if (this._headerItemsRuntime.length === before) {
                return false;
            }

            if (!this._baseWindow) {
                this._pendingHeaderOps.push({ type: 'remove', id });
                return true;
            }

            return this._applyHeaderItems();
        }

        _flushPendingHeaderOps() {
            if (!this._baseWindow) return;
            if (this._pendingHeaderOps.length === 0) return;

            this._pendingHeaderOps = [];
            this._applyHeaderItems();
        }

        getRenderedHeaderItems() {
            if (!this._baseWindow) return [];

            const header = this._baseWindow.getHeader && this._baseWindow.getHeader();
            if (!header || typeof header.getRenderedItems !== 'function') return [];

            return header.getRenderedItems();
        }

        refreshDropdowns() {
            if (!this._baseWindow) return;

            const header = this._baseWindow.getHeader && this._baseWindow.getHeader();
            if (header && typeof header.refreshDropdowns === 'function') {
                try { header.refreshDropdowns(); } catch (e) {}
            }
        }

        onHeaderItemClick(desc, payload) {
            return false;
        }

        // ============================================================
        // 7. DATA MENU
        // ============================================================

        _resolveDataMenu() {
            const def = this.constructor.dataMenu;

            const defaults = [
                { icon: 'icon-import', label: 'Импорт', action: 'import' },
                { icon: 'icon-export', label: 'Экспорт', action: 'export' },
                { divider: true },
                { icon: 'icon-plus',   label: 'Новый слот', action: 'new-slot' },
                { icon: 'icon-link',   label: 'Привязать',  action: 'attach' }
            ];

            if (def == null) return defaults;

            if (typeof def === 'function') {
                try {
                    const result = def(defaults);
                    return Array.isArray(result) ? result : defaults;
                } catch (e) {
                    console.error('[BaseWindowInstance] dataMenu() error:', e);
                    return defaults;
                }
            }

            if (Array.isArray(def)) return def;

            return defaults;
        }

        _hasCustomDataMenuOpen() {
            return typeof this.onDataMenuOpen === 'function'
                && this.onDataMenuOpen !== BaseWindowInstance.prototype.onDataMenuOpen;
        }

        onDataMenuOpen(anchorEl, dropdownEl) {
            // no-op
        }

        _closeDataMenu() {
            if (!this._baseWindow) return;

            const header = this._baseWindow.getHeader && this._baseWindow.getHeader();
            if (!header || typeof header.getRenderedItems !== 'function') return;

            const items = header.getRenderedItems();
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item || !item.el) continue;
                if (typeof item.el._closeDropdown === 'function') {
                    try { item.el._closeDropdown(); } catch (e) {}
                }
            }
        }

        // ============================================================
        // 8. DROP TARGET
        // ============================================================

        _registerDropTarget() {
            const dropConfig = this.constructor.dropTarget;
            if (!dropConfig || typeof dropConfig !== 'object') return;

            const hasOnDrop = typeof this.onDrop === 'function'
                && this.onDrop !== BaseWindowInstance.prototype.onDrop;

            if (!hasOnDrop) return;

            if (!window.dragController) {
                console.warn('[BaseWindowInstance] dragController not available');
                return;
            }

            const owner = this;

            this._dropUnsub = window.dragController.registerTarget({
                owner: owner,
                element: this._root,

                accept: (session) => {
                    if (owner._isDestroyed) return false;
                    if (session.source === owner) return false;

                    if (session.kind === 'files') {
                        const cfg = owner.constructor.dropTarget || {};
                        const multiple = cfg.multiple !== false;
                        if (!multiple && session.files && session.files.length > 1) return false;
                        if (session.files && session.files.length > 0) {
                            return owner._filterFiles(session.files, cfg).length > 0;
                        }
                    }

                    return true;
                },

                onEnter: (session) => {
                    if (owner._isDestroyed) return;
                    const meta = owner._buildSessionMeta(session);
                    if (typeof owner.onDragEnter === 'function') {
                        try { owner.onDragEnter(meta); } catch (e) {
                            console.error('[BaseWindowInstance] onDragEnter error:', e);
                        }
                    }
                },

                onLeave: () => {
                    if (owner._isDestroyed) return;
                    if (typeof owner.onDragLeave === 'function') {
                        try { owner.onDragLeave(); } catch (e) {
                            console.error('[BaseWindowInstance] onDragLeave error:', e);
                        }
                    }
                },

                onDrop: async (session) => {
                    if (owner._isDestroyed) return false;

                    const meta = owner._buildSessionMeta(session);
                    let files = session.files || [];

                    if (session.kind === 'files' && files.length > 0) {
                        const cfg = owner.constructor.dropTarget || {};
                        files = owner._filterFiles(files, cfg);
                        if (files.length === 0) return false;
                    }

                    if (typeof owner.onDrop !== 'function') return false;
                    if (owner.onDrop === BaseWindowInstance.prototype.onDrop) return false;

                    try {
                        const result = await Promise.resolve(owner.onDrop(files, meta));
                        return result !== false;
                    } catch (e) {
                        console.error('[BaseWindowInstance] onDrop error:', e);
                        return false;
                    }
                }
            });
        }

        _buildSessionMeta(session) {
            if (!session) return { source: 'unknown' };

            if (session.kind === 'files') {
                const names = [];
                const types = [];
                const files = session.files || [];
                for (let i = 0; i < files.length; i++) {
                    names.push(files[i].name || '');
                    types.push(files[i].type || '');
                }
                return {
                    source: 'files',
                    fileNames: names,
                    fileTypes: types
                };
            }

            const srcOwner = session.source && session.source.descriptor
                ? session.source.descriptor.owner
                : null;

            return {
                source: 'internal',
                sourceWindowId: srcOwner ? srcOwner.id : null,
                sourceType: srcOwner ? srcOwner.type : null,
                channel: session.channel,
                payload: session.payload
            };
        }

        _filterFiles(files, config) {
            const { accept, acceptExtensions } = config || {};
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

        _callOnDragEnter(meta) {
            if (this._isDestroyed) return true;
            if (typeof this.onDragEnter === 'function') {
                try { this.onDragEnter(meta); } catch (e) {
                    console.error('[BaseWindowInstance] onDragEnter error:', e);
                }
            }
            return true;
        }

        _callOnDragLeave() {
            if (this._isDestroyed) return;
            if (typeof this.onDragLeave === 'function') {
                try { this.onDragLeave(); } catch (e) {
                    console.error('[BaseWindowInstance] onDragLeave error:', e);
                }
            }
        }

        async _callOnDrop(files, meta) {
            if (this._isDestroyed) return null;
            if (typeof this.onDrop !== 'function') return null;
            if (this.onDrop === BaseWindowInstance.prototype.onDrop) return null;

            try {
                const result = await Promise.resolve(this.onDrop(files, meta));
                return result;
            } catch (e) {
                console.error('[BaseWindowInstance] onDrop error:', e);
                return null;
            }
        }

        // ============================================================
        // 9. DRAG SOURCE
        // ============================================================

        _registerMenuDragSources() {
            if (this._isDestroyed) return;

            if (!this._baseWindow || typeof this._baseWindow.registerDragSource !== 'function') {
                return;
            }

            const items = this.getHeaderItems();
            if (!Array.isArray(items) || items.length === 0) return;

            if (this._dragUnsubs.length > 0) return;

            if (this._dragSourcesAttempts >= this._dragSourcesMaxAttempts) {
                if (this._dragSourcesAttempts === this._dragSourcesMaxAttempts) {
                    console.warn(
                        `[BaseWindowInstance #${this.id}] _registerMenuDragSources: ` +
                        `header not found after ${this._dragSourcesMaxAttempts} attempts — giving up`
                    );
                    this._dragSourcesAttempts++;
                }
                return;
            }

            const header = this._baseWindow.getHeader && this._baseWindow.getHeader();
            const headerElement = header && header.nodeType === 1
                ? header
                : (this._baseWindow.getRenderWindow && this._baseWindow.getRenderWindow()?.getHeader
                    ? this._baseWindow.getRenderWindow().getHeader()
                    : null);

            if (!headerElement) {
                this._dragSourcesAttempts++;
                this._dragSourcesTimer = setTimeout(
                    () => {
                        this._dragSourcesTimer = null;
                        this._registerMenuDragSources();
                    },
                    50
                );
                return;
            }

            const dragItems = items.filter(it => it && it.dragSource && it.action);
            if (dragItems.length === 0) return;

            let allFound = true;
            for (const it of dragItems) {
                const sel = `.window-action-btn[data-action="${this._cssEscape(it.action)}"]`;
                if (!headerElement.querySelector(sel)) {
                    allFound = false;
                    break;
                }
            }

            if (!allFound) {
                this._dragSourcesAttempts++;
                this._dragSourcesTimer = setTimeout(
                    () => {
                        this._dragSourcesTimer = null;
                        this._registerMenuDragSources();
                    },
                    50
                );
                return;
            }

            this._dragSourcesAttempts = 0;

            for (const it of dragItems) {
                const action = it.action;
                const sel = `.window-action-btn[data-action="${this._cssEscape(action)}"]`;
                const btn = headerElement.querySelector(sel);
                if (!btn) continue;

                const ds = it.dragSource;
                const unsub = this._baseWindow.registerDragSource(btn, {
                    type: ds.type || 'default',
                    getPayload: typeof ds.getPayload === 'function'
                        ? ds.getPayload.bind(this)
                        : () => ds.payload || null,
                    ghostHTML: ds.ghostHTML || null
                });

                this._dragUnsubs.push(unsub);
            }
        }

        _flushPendingDragSources() {
            if (!this._baseWindow) return;
            if (this._pendingDragSources.length === 0) return;

            if (typeof this._baseWindow.registerDragSource !== 'function') {
                this._pendingDragSources = [];
                return;
            }

            const queue = this._pendingDragSources;
            this._pendingDragSources = [];

            for (const { element, opts } of queue) {
                if (!element || element.nodeType !== 1) continue;
                try {
                    const unsub = this._baseWindow.registerDragSource(element, opts);
                    this._dragUnsubs.push(unsub);
                } catch (e) {
                    console.error('[BaseWindowInstance] pending makeDraggable error:', e);
                }
            }
        }

        _cssEscape(s) {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(s);
            }
            return String(s).replace(/([^\w-])/g, '\\$1');
        }

        // ============================================================
        // 10. HOTKEYS
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
        // 11. СЛОТЫ / DATA
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
        // 12. ХУКИ
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
        // 13. ПРОКСИ-МЕТОДЫ
        // ============================================================

        getSlotId() {
            if (this._baseWindow && typeof this._baseWindow.getSlotId === 'function') {
                try {
                    const sid = this._baseWindow.getSlotId();
                    if (sid != null) return sid;
                } catch (e) {}
            }
            return this.slotId || null;
        }

        getId() {
            if (this._baseWindow && typeof this._baseWindow.getId === 'function') {
                try {
                    const id = this._baseWindow.getId();
                    if (id != null) return id;
                } catch (e) {}
            }
            return this.id;
        }

        getType() {
            return this.type;
        }

        getTitle() {
            if (this.windowData && this.windowData.title) {
                return this.windowData.title;
            }
            if (this._baseWindow && typeof this._baseWindow.getTitle === 'function') {
                try { return this._baseWindow.getTitle(); } catch (e) {}
            }
            const meta = this.constructor.meta;
            return (meta && meta.name) || this.type || 'Window';
        }

        getIcon() {
            if (this.windowData && this.windowData.icon) {
                return this.windowData.icon;
            }
            if (this._baseWindow && typeof this._baseWindow.getIcon === 'function') {
                try { return this._baseWindow.getIcon(); } catch (e) {}
            }
            const meta = this.constructor.meta;
            return (meta && meta.icon) || '📄';
        }

        getBaseWindow() {
            return this._baseWindow || null;
        }

        hasBaseWindow() {
            return !!this._baseWindow;
        }

        getSlotWindows() {
            if (this._baseWindow && typeof this._baseWindow.getSlotWindows === 'function') {
                try { return this._baseWindow.getSlotWindows(); } catch (e) {}
            }
            if (this._dataBus && this.getSlotId()) {
                try { return this._dataBus.getSlotWindows(this.getSlotId()); } catch (e) {}
            }
            return [];
        }

        attachTo(slotId) {
            if (!slotId) {
                console.warn('[BaseWindowInstance] attachTo: slotId is required');
                return this;
            }
            if (this._baseWindow && typeof this._baseWindow.attachTo === 'function') {
                try { this._baseWindow.attachTo(slotId); } catch (e) {
                    console.error('[BaseWindowInstance] attachTo error:', e);
                }
                this.slotId = slotId;
                return this;
            }
            console.warn('[BaseWindowInstance] attachTo: _baseWindow not attached yet');
            return this;
        }

        createEmptySlot() {
            if (this._baseWindow && typeof this._baseWindow.createEmptySlot === 'function') {
                try { this._baseWindow.createEmptySlot(); } catch (e) {
                    console.error('[BaseWindowInstance] createEmptySlot error:', e);
                }
                if (typeof this._baseWindow.getSlotId === 'function') {
                    try { this.slotId = this._baseWindow.getSlotId(); } catch (e) {}
                }
                return this;
            }
            console.warn('[BaseWindowInstance] createEmptySlot: _baseWindow not attached yet');
            return this;
        }

        minimize() {
            if (this._baseWindow && typeof this._baseWindow.minimize === 'function') {
                try { return this._baseWindow.minimize(); } catch (e) {}
            }
            return false;
        }

        isMinimized() {
            if (this._baseWindow && typeof this._baseWindow.isMinimized === 'function') {
                try { return this._baseWindow.isMinimized(); } catch (e) {}
            }
            return false;
        }

        setFullscreen() {
            if (this._baseWindow && typeof this._baseWindow.setFullscreen === 'function') {
                try { return this._baseWindow.setFullscreen(); } catch (e) {}
            }
            return false;
        }

        exitFullscreen() {
            if (this._baseWindow && typeof this._baseWindow.exitFullscreen === 'function') {
                try { return this._baseWindow.exitFullscreen(); } catch (e) {}
            }
            return false;
        }

        isFullscreen() {
            if (this._baseWindow && typeof this._baseWindow.isFullscreen === 'function') {
                try { return this._baseWindow.isFullscreen(); } catch (e) {}
            }
            return false;
        }

        toggleFullscreen() {
            if (this._baseWindow && typeof this._baseWindow.toggleFullscreen === 'function') {
                try { return this._baseWindow.toggleFullscreen(); } catch (e) {}
            }
            return false;
        }

        refreshHeader() {
            if (this._baseWindow && typeof this._baseWindow.refreshHeader === 'function') {
                try { this._baseWindow.refreshHeader(); } catch (e) {}
            }
        }

        getRenderWindow() {
            if (this._baseWindow && typeof this._baseWindow.getRenderWindow === 'function') {
                try { return this._baseWindow.getRenderWindow(); } catch (e) {}
            }
            return null;
        }

        getBaseWindowRoot() {
            if (this._baseWindow && typeof this._baseWindow.getRoot === 'function') {
                try { return this._baseWindow.getRoot(); } catch (e) {}
            }
            return null;
        }

        save() {
            if (this._baseWindow && typeof this._baseWindow.save === 'function') {
                try { this._baseWindow.save(); } catch (e) {
                    console.error('[BaseWindowInstance] save error:', e);
                }
            }
        }

        recordHistory(label = 'Действие') {
            if (this._isDestroyed) return false;

            this.save();

            if (typeof window === 'undefined' || !window.historyManager) {
                console.warn('[BaseWindowInstance] recordHistory: HistoryManager not available');
                return false;
            }

            const hm = window.historyManager;

            if (typeof hm.isRestoring === 'function' && hm.isRestoring()) {
                return false;
            }

            const safeLabel = String(label || 'Действие');

            try {
                hm.record(safeLabel);

                document.dispatchEvent(new CustomEvent('history-recorded', {
                    detail: {
                        label: safeLabel,
                        windowId: this.id,
                        type: this.type
                    }
                }));

                return true;
            } catch (e) {
                console.error('[BaseWindowInstance] recordHistory error:', e);
                return false;
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
        // 14. MESSAGEBUS
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
                this.id, this.type, slotId || this.getSlotId(), channel, data
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
        // 15. KEYBOARD CAPTURE
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
        // 16. ПОИСК ОКОН
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
        // 17. DRAG SOURCE — публичный хелпер
        // ============================================================

        makeDraggable(element, opts = {}) {
            if (!element || element.nodeType !== 1) {
                return () => {};
            }

            if (!this._baseWindow || typeof this._baseWindow.registerDragSource !== 'function') {
                this._pendingDragSources.push({ element, opts });
                return () => {
                    const idx = this._pendingDragSources.findIndex(p => p.element === element);
                    if (idx !== -1) {
                        this._pendingDragSources.splice(idx, 1);
                    }
                };
            }

            const unsub = this._baseWindow.registerDragSource(element, opts);
            this._dragUnsubs.push(unsub);
            return unsub;
        }

        // ============================================================
        // 18. УТИЛИТЫ
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
        // 19. DESTROY
        // ============================================================

        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            this._isReady = false;

            if (this._dragGuardCleanups) {
                for (const fn of this._dragGuardCleanups) {
                    try { fn(); } catch (e) {}
                }
                this._dragGuardCleanups = [];
            }
            this._activePointerDrag = null;
            this._dragGuardInstalled = false;

            if (this._dragSourcesTimer) {
                clearTimeout(this._dragSourcesTimer);
                this._dragSourcesTimer = null;
            }

            if (typeof this.onBeforeDestroy === 'function') {
                try { this.onBeforeDestroy(); } catch (e) {
                    console.error('[BaseWindowInstance] onBeforeDestroy error:', e);
                }
            }

            try {
                const rendered = this.getRenderedHeaderItems();
                if (Array.isArray(rendered)) {
                    for (const item of rendered) {
                        if (!item || !item.el) continue;
                        const desc = item.desc;
                        if (desc && typeof desc.destroy === 'function') {
                            try { desc.destroy(item.el, this); } catch (e) {
                                console.error('[BaseWindowInstance] headerItem.destroy error:', e);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[BaseWindowInstance] headerItem cleanup error:', e);
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

            this._pendingDragSources = [];
            this._pendingHeaderOps = [];

            if (this._root && this._root.parentNode) {
                this._root.remove();
            }
            this._root = null;
            this._content = null;
            this._headerItemsRuntime = null;
        }
    }

    // ============================================================
    // СТАТИЧЕСКИЙ ПРОКИД
    // ============================================================

    BaseWindowInstance.registerHeaderItemType = function(type, builder) {
        if (!window.HeaderController || typeof window.HeaderController.registerHeaderItemType !== 'function') {
            console.error('[BaseWindowInstance] HeaderController not available');
            return false;
        }
        return window.HeaderController.registerHeaderItemType(type, builder);
    };

    BaseWindowInstance.unregisterHeaderItemType = function(type) {
        if (!window.HeaderController || typeof window.HeaderController.unregisterHeaderItemType !== 'function') {
            return false;
        }
        return window.HeaderController.unregisterHeaderItemType(type);
    };

    BaseWindowInstance.getHeaderItemTypes = function() {
        if (!window.HeaderController || typeof window.HeaderController.getHeaderItemTypes !== 'function') {
            return [];
        }
        return window.HeaderController.getHeaderItemTypes();
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BaseWindowInstance };
    }

    if (typeof window !== 'undefined') {
        window.BaseWindowInstance = BaseWindowInstance;
    }

})();