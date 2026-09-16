// core/API/BaseWindowInstance.js
// Версия 2.4.0
// - Feature: static get dataMenu() — окно само решает содержимое data-dropdown (📊).
//            Три режима:
//              1. ничего не объявлено → сток ядра
//              2. static get dataMenu() → массив или функция от дефолта
//              3. onDataMenuOpen(anchorEl, dropdownEl) → полный контроль
// - Feature: _closeDataMenu(), _renderDefaultDataMenu() — публичные хелперы.
// - v2.3.0: recordHistory(label).
// - v2.2.0: прокси-методы BaseWindow API, отложенные drag-source и headerItems-мутации.
// - v2.1.1: публичные геттеры getSlotId / getId / getType / getTitle / getIcon / getBaseWindow.
//
// ВАЖНО ПРО ПОРЯДОК ВЫЗОВОВ
//
//   BaseWindowInstance.constructor:
//     1) _buildRoot()
//     2) _setupChannels()
//     3) buildContent()            ← здесь this._baseWindow ещё null
//     4) if (this._baseWindow) _initAfterBaseWindow()
//
//   _baseWindow присваивается ИЗВНЕ (WindowRegistry / LayoutManager) уже
//   ПОСЛЕ конструктора, через instance._baseWindow = baseWindow, и затем
//   вызывается _initAfterBaseWindow() повторно, если он не был вызван.
//
// ПРО dataMenu (v2.4.0)
//
//   static get dataMenu() — три формы:
//     null          → сток ядра: Импорт / Экспорт / ─ / Новый слот / Привязать
//     Array         → полная замена
//     function(def) → принимает дефолтный массив, возвращает изменённый
//
//   Если у окна определён onDataMenuOpen(anchorEl, dropdownEl) — он получает
//   полный контроль. Ядро вызывает его вместо рендера по dataMenu.
//
//   Хелперы для окна:
//     this._closeDataMenu()            — закрыть data-dropdown
//     this._renderDefaultDataMenu(el)  — нарисовать стоковый набор в el

(function() {
    'use strict';

    console.log('[BaseWindowInstance] Loading v2.4.0...');

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

            // runtime-мутации headerItems
            this._headerItemsRuntime = null;

            // состояние polling drag-source
            this._dragSourcesTimer = null;
            this._dragSourcesAttempts = 0;
            this._dragSourcesMaxAttempts = 20;

            // отложенные операции, требующие _baseWindow
            this._pendingDragSources = [];
            this._pendingHeaderOps = [];
            this._initAfterBaseWindowDone = false;

            this._buildRoot();
            this._setupChannels();
            this.buildContent(this._content);

            if (this._baseWindow) {
                this._initAfterBaseWindow();
            }

            console.log('[BaseWindowInstance] Created:', this.type, '(', this.id, ')');
        }

        // ============================================================
        // 0. STATIC: dataMenu
        // ============================================================
        //
        // Переопределяется в окне. Формы:
        //   null          → сток ядра
        //   Array         → полная замена
        //   function(def) → модифицировать дефолт
        //
        // Если нужно полностью контролировать рендер — определи метод
        // onDataMenuOpen(anchorEl, dropdownEl) вместо/помимо этого.

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

            console.log(`[BaseWindowInstance #${this.id}] ready`);
        }

        // ============================================================
        // 4.1. HEADER ITEMS
        // ============================================================

        getHeaderItems() {
            if (Array.isArray(this._headerItemsRuntime)) {
                return this._headerItemsRuntime.slice();
            }

            const menu = this.constructor.menu;
            if (!menu || !Array.isArray(menu.headerItems)) {
                return [];
            }

            return menu.headerItems.filter(x => x && typeof x === 'object');
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

            const rw = this._baseWindow.getRenderWindow?.();
            if (rw && typeof rw.setHeaderItems === 'function') {
                try {
                    rw.setHeaderItems(items);
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
            const rw = this._baseWindow.getRenderWindow?.();
            if (!rw || typeof rw.getHeaderItems !== 'function') return [];
            return rw.getHeaderItems();
        }

        refreshDropdowns() {
            if (!this._baseWindow) return;
            const rw = this._baseWindow.getRenderWindow?.();
            if (rw && typeof rw.refreshDropdowns === 'function') {
                try { rw.refreshDropdowns(); } catch (e) {}
            }
        }

        onHeaderItemClick(desc, payload) {
            return false;
        }

        // ============================================================
        // 4.2. DATA MENU (📊)
        // ============================================================
        //
        // Разрешение содержимого data-dropdown. Возвращает массив пунктов.
        //
        // Форматы пункта:
        //   { divider: true }
        //   { header: 'текст' }
        //   { icon, label, action, value?, payload?, danger?, disabled? }
        //   { icon, label, onClick: (item, ctx) => void }
        //
        // Спец-action'ы ядра (обрабатываются в RenderWindow._buildDataMenuItem):
        //   'import'    — Импорт JSON
        //   'export'    — Экспорт JSON
        //   'new-slot'  — Новый слот
        //   'attach'    — Привязать (submenu)

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

        /**
         * Заглушка. Переопределяется в окне для полного контроля над
         * data-dropdown (📊). Получает:
         *   anchorEl    — кнопка 📊 (может быть null)
         *   dropdownEl  — пустой <div class="window-dropdown data-dropdown">
         *                 (уже display:block, opacity → 1 через rAF)
         *
         * Окно само наполняет dropdownEl. Ядро закроет dropdown по клику вне.
         * Для ручного закрытия — this._closeDataMenu().
         */
        onDataMenuOpen(anchorEl, dropdownEl) {
            // no-op
        }

        /**
         * Закрыть data-dropdown. Используется из onDataMenuOpen.
         */
        _closeDataMenu() {
            if (!this._baseWindow) return;
            const rw = this._baseWindow.getRenderWindow?.();
            if (rw && typeof rw._closeDataMenu === 'function') {
                try { rw._closeDataMenu(); } catch (e) {}
            }
        }

        /**
         * Нарисовать стоковый набор (Импорт / Экспорт / ─ / Новый слот / Привязать)
         * в переданный dropdownEl. Полезно в onDataMenuOpen, если хочется
         * начать со стока и добавить свои.
         */
        _renderDefaultDataMenu(dropdownEl) {
            if (!dropdownEl) return;
            if (!this._baseWindow) return;

            const rw = this._baseWindow.getRenderWindow?.();
            if (!rw || typeof rw._buildDataMenuItem !== 'function') return;

            const items = this._resolveDataMenu();
            for (const item of items) {
                const el = rw._buildDataMenuItem(item, this);
                if (el) dropdownEl.appendChild(el);
            }
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
        // 6. DRAG-SOURCE
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

            const headerEl = this._baseWindow.getRenderWindow?.()?.getHeader?.();
            if (!headerEl) {
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
                if (!headerEl.querySelector(sel)) {
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
                const btn = headerEl.querySelector(sel);
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

                console.log(`[BaseWindowInstance #${this.id}] drag-source registered on "${action}"`);
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

            if (queue.length > 0) {
                console.log(`[BaseWindowInstance #${this.id}] applied ${queue.length} pending drag-source(s)`);
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
        // 10. ПРОКСИ-МЕТОДЫ к BaseWindow
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

        // ============================================================
        // 10.1. ИСТОРИЯ
        // ============================================================

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

            console.log(`[BaseWindowInstance] Destroyed: ${this.type} (${this.id})`);
        }
    }

    // ============================================================
    // 17. СТАТИЧЕСКИЙ ПРОКИД
    // ============================================================

    BaseWindowInstance.registerHeaderItemType = function(type, builder) {
        const RW = window.RenderWindow;
        if (!RW || typeof RW.registerHeaderItemType !== 'function') {
            console.error('[BaseWindowInstance] RenderWindow not available');
            return false;
        }
        return RW.registerHeaderItemType(type, builder);
    };

    BaseWindowInstance.unregisterHeaderItemType = function(type) {
        const RW = window.RenderWindow;
        if (!RW || typeof RW.unregisterHeaderItemType !== 'function') return false;
        return RW.unregisterHeaderItemType(type);
    };

    BaseWindowInstance.getHeaderItemTypes = function() {
        const RW = window.RenderWindow;
        if (!RW || typeof RW.getHeaderItemTypes !== 'function') return [];
        return RW.getHeaderItemTypes();
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BaseWindowInstance };
    }

    if (typeof window !== 'undefined') {
        window.BaseWindowInstance = BaseWindowInstance;
        console.log('[BaseWindowInstance] Registered globally v2.4.0');
    }

})();