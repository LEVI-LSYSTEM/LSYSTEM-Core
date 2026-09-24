// data/window/ExampleWindow.js
// Версия 1.1.0 — демонстрационное окно LSYSTEM
//
// Это учебный пример, показывающий все основные фишки ядра.
// Файл обновлён под актуальное ядро v2.3.0 / RenderWindow v7.0.1 /
// PluginSystem v5.9.1 / UserAPI v2.1.0.
//
// ═══════════════════════════════════════════════════════════════════
// ⚠️ ВАЖНО: RACE-УСЛОВИЕ В headerItems.render()
// ═══════════════════════════════════════════════════════════════════
//
// RenderWindow._buildHeader() вызывает render() для каждого headerItem
// ДО того, как instance._ensureFields() успеет выполниться.
//
// Порядок:
//   1. LayoutManager._buildLeafDOM() создаёт BaseWindow
//   2. BaseWindow._init() создаёт RenderWindow
//   3. RenderWindow._init() → _buildDOM() → _buildHeader() → _renderHeaderItems()
//   4. RenderWindow вызывает render() для каждого headerItem
//   5. И только ПОТОМ LayoutManager вызывает typeConfig.create() → new ExampleWindow()
//   6. super() → buildContent() → _ensureFields()
//
// Что это значит:
//   Если ваш render() использует this._fieldsReady / this._counter /
//   this.data / this._log — проверьте их на undefined и верните заглушку.
//
// Безопасный паттерн:
//
//   render: (ctx) => {
//       const inst = ctx.baseWindow?.getRealInstance?.();
//       if (!inst || !inst._fieldsReady) {
//           return document.createComment('not-ready');
//       }
//       return inst._buildMyWidget();
//   }
//
// ═══════════════════════════════════════════════════════════════════
// ⚠️ ВАЖНО: _baseWindow присваивается ПОСЛЕ конструктора
// ═══════════════════════════════════════════════════════════════════
//
// В buildContent() нельзя обращаться к this._baseWindow.*.
// Используйте публичные геттеры/прокси:
//   this.getId() / getType() / getTitle() / getIcon() / getSlotId()
//   this.getBaseWindow() / hasBaseWindow()
//   this.createEmptySlot() / attachTo() / minimize() / ...
//
// ═══════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[ExampleWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    console.log('[ExampleWindow] Loading v1.1.0...');

    // ============================================================
    // 1. КАСТОМНЫЙ ТИП headerItems: badge
    // ============================================================
    //
    // Регистрируем через RenderWindow.registerHeaderItemType('badge', builder).
    //
    // Билдер получает (desc, ctx):
    //   desc — исходный дескриптор из menu.headerItems
    //   ctx  — { renderWindow, baseWindow, layoutManager, index, desc }
    //
    // Возвращает DOM-элемент (nodeType === 1).
    //
    // Внутри клика эмитим 'menu-action' — попадёт в
    // BaseWindow._onRenderMenuAction → onHeaderItemClick → realInstance[action].

    if (window.RenderWindow
        && typeof window.RenderWindow.registerHeaderItemType === 'function'
        && !window.RenderWindow.getHeaderItemTypes().includes('badge')
    ) {
        window.RenderWindow.registerHeaderItemType('badge', (desc, ctx) => {
            const el = document.createElement('span');
            el.className = 'example-badge';
            el.dataset.badgeId = desc.id || '';
            el.textContent = desc.text || '•';

            Object.assign(el.style, {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '18px',
                padding: '0 7px',
                borderRadius: '9px',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.2px',
                background: desc.bg || 'rgba(200, 184, 154, 0.14)',
                color: desc.color || 'var(--text-secondary, #a09888)',
                border: '1px solid ' + (desc.border || 'rgba(200, 184, 154, 0.18)'),
                flexShrink: '0',
                userSelect: 'none',
                whiteSpace: 'nowrap'
            });

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const rw = ctx.renderWindow;
                const item = { ...desc, type: 'badge', action: desc.action || 'badge-click' };
                rw._emit('menu-action', {
                    windowId: rw.id,
                    action: item.action,
                    value: desc.value || '',
                    payload: desc.payload !== undefined ? desc.payload : null,
                    item: item
                });
            });

            return el;
        });
        console.log('[ExampleWindow] headerItemType "badge" registered');
    }

    // ============================================================
    // 2. КЛАСС ОКНА
    // ============================================================

    class ExampleWindow extends window.BaseWindowInstance {

        // --------------------------------------------------------
        // 2.1. meta — обязательное поле
        // --------------------------------------------------------
        //
        // id             — уникальный type-id (обязательно)
        // name           — человекочитаемое имя
        // icon           — 'icon-xxx' из svg-спрайта
        // description    — подпись для tooltip
        // group          — группа в меню Windows
        // category       — для фильтрации
        // priority       — сортировка (меньше — выше)
        // defaultSize    — стартовый размер
        // minSize        — минимальный размер
        // maxWindows     — одновременно открытых окон
        // metadata       — произвольные данные
        // allowOverride  — если true, registerFromClass разрешит перезапись
        //                  типа (по умолчанию strict: reload не уничтожает окна)

        static get meta() {
            return {
                id: 'example',
                name: 'Example Window',
                icon: 'icon-example',
                description: 'Демонстрация всех фишек ядра LSYSTEM',
                group: 'Примеры',
                category: 'example',
                priority: 100,
                defaultSize: { width: 640, height: 480 },
                minSize: { width: 280, height: 200 },
                maxWindows: 4,
                metadata: { version: '1.1.0', author: 'LSYSTEM' }
            };
        }

        // --------------------------------------------------------
        // 2.2. menu.headerItems
        // --------------------------------------------------------
        //
        // Формы дескриптора:
        //
        //   type: 'button' | 'dropdown' | 'separator'
        //     — встроенный или зарегистрированный через registerHeaderItemType
        //
        //   render(ctx) — приоритет над type
        //
        //   hidden — boolean или function(baseWindow, renderWindow)
        //
        //   destroy(el, baseWindow) — cleanup при пересборке шапки
        //
        //   для dropdown:
        //     items — Array или function(realInstance, baseWindow, layoutManager)
        //
        // Каждый дескриптор должен иметь id — для add/removeHeaderItem.

        static get menu() {
            return {
                headerItems: [
                    // --- button (простой) ---
                    {
                        id: 'btn-hello',
                        type: 'button',
                        icon: 'icon-info',
                        label: 'Hello',
                        title: 'Показать приветствие',
                        action: 'greet',
                        payload: { from: 'btn-hello' }
                    },

                    // --- separator ---
                    {
                        id: 'sep-1',
                        type: 'separator'
                    },

                    // --- badge (кастомный тип) ---
                    {
                        id: 'badge-mode',
                        type: 'badge',
                        text: 'DEMO',
                        action: 'badge-mode',
                        bg: 'rgba(204, 34, 51, 0.16)',
                        color: 'var(--accent-red, #cc2233)',
                        border: '1px solid rgba(204, 34, 51, 0.3)'
                    },

                    // --- dropdown с динамическими items и hidden ---
                    {
                        id: 'dd-tools',
                        type: 'dropdown',
                        icon: 'icon-settings',
                        label: 'Tools',
                        title: 'Инструменты демо',

                        hidden: (baseWindow) => {
                            const lm = baseWindow && baseWindow._layoutManager;
                            if (!lm) return false;
                            return lm.getVisibleWindowCount() > 3;
                        },

                        items: (realInstance, baseWindow, layoutManager) => {
                            const items = [
                                { header: 'Демо-действия' },
                                {
                                    icon: 'icon-play',
                                    label: 'Выполнить демо',
                                    action: 'run-demo',
                                    shortcut: 'F5'
                                },
                                {
                                    icon: 'icon-refresh',
                                    label: 'Сбросить счётчик',
                                    action: 'reset-counter'
                                },
                                { divider: true },
                                { header: 'headerItems' },
                                {
                                    icon: 'icon-plus',
                                    label: 'Добавить badge',
                                    action: 'add-badge'
                                },
                                {
                                    icon: 'icon-trash',
                                    label: 'Удалить badge',
                                    action: 'remove-badge'
                                },
                                {
                                    icon: 'icon-eye-off',
                                    label: 'Toggle clock (hidden)',
                                    action: 'toggle-clock'
                                },
                                {
                                    icon: 'icon-trash',
                                    label: 'Сбросить headerItems',
                                    action: 'reset-header-items',
                                    danger: true
                                },
                                { divider: true },
                                { header: 'История' },
                                {
                                    icon: 'icon-history',
                                    label: 'Записать в историю',
                                    action: 'snapshot'
                                }
                            ];

                            if (layoutManager) {
                                const others = layoutManager.getVisibleWindows()
                                    .filter(w => String(w.id) !== String(realInstance && realInstance.id));

                                if (others.length > 0) {
                                    items.push({ divider: true });
                                    items.push({ header: 'Другие окна' });
                                    for (const w of others.slice(0, 5)) {
                                        items.push({
                                            icon: w.icon || 'icon-window-type',
                                            label: 'Фокус → ' + (w.title || ('#' + w.id)),
                                            action: 'focus-window',
                                            payload: { targetId: w.id }
                                        });
                                    }
                                }
                            }

                            return items;
                        }
                    },

                    // --- кастомный render() с cleanup через desc.destroy() ---
                    {
                        id: 'custom-clock',
                        hidden: (baseWindow) => {
                            if (!baseWindow) return false;
                            const inst = baseWindow.getRealInstance?.();
                            return !!(inst && inst._clockHidden);
                        },
                        render: (ctx) => {
                            // ⚠️ RACE-SAFE: render может вызваться до _ensureFields.
                            // Здесь мы НЕ обращаемся к this экземпляра —
                            // только к ctx.baseWindow (BaseWindow).
                            const el = document.createElement('span');
                            el.className = 'example-clock';
                            el.style.cssText = [
                                'font-family: "Courier New", monospace',
                                'font-size: 10px',
                                'color: var(--text-muted, rgba(200, 184, 154, 0.55))',
                                'padding: 0 6px',
                                'flex-shrink: 0',
                                'user-select: none',
                                'letter-spacing: 0.3px'
                            ].join(';');

                            const tick = () => {
                                const d = new Date();
                                el.textContent = d.toTimeString().slice(0, 8);
                            };
                            tick();

                            const timer = setInterval(tick, 1000);
                            el.__clockTimer = timer;

                            return el;
                        },
                        destroy: (el, baseWindow) => {
                            if (el && el.__clockTimer) {
                                clearInterval(el.__clockTimer);
                                el.__clockTimer = null;
                            }
                        }
                    }
                ]
            };
        }

        // --------------------------------------------------------
        // 2.3. hotkeys
        // --------------------------------------------------------
        //
        // Карта combo → { action, label }.
        // action — имя метода экземпляра.
        // Регистрируется через BaseWindow._registerHotkeys().

        static get hotkeys() {
            return {
                'Ctrl+Shift+D': { action: 'onHotkeyDemo', label: 'Демо' },
                'Ctrl+Shift+R': { action: 'onHotkeyReset', label: 'Сброс счётчика' },
                'F5': { action: 'onHotkeyDemo', label: 'Демо (F5)' }
            };
        }

        // --------------------------------------------------------
        // 2.4. channels — MessageBus
        // --------------------------------------------------------
        //
        // BaseWindowInstance._setupChannels() подпишется.
        // При получении → onMessage(senderId, channel, data).

        static get channels() {
            return ['demo-ping', 'demo-broadcast', 'demo-rpc'];
        }

        // --------------------------------------------------------
        // 2.5. dropTarget — drag&drop файлов
        // --------------------------------------------------------

        static get dropTarget() {
            return {
                accept: ['application/json', '.txt', '.lsp'],
                acceptExtensions: '.json,.txt,.lsp',
                multiple: true
            };
        }

        // ============================================================
        // 3. КОНСТРУКТОР
        // ============================================================
        //
        // super() вызовет buildContent() ДО того, как эти строки выполнятся.
        // Все поля — в _ensureFields(), внутри buildContent().

        constructor(container, windowData, options = {}) {
            super(container, windowData, options);
            console.log('[ExampleWindow] Constructor:', this.id);
        }

        // ============================================================
        // 3.1. ЛЕНИВАЯ ИНИЦИАЛИЗАЦИЯ
        // ============================================================
        //
        // Идемпотентно. Вызывается первой строкой buildContent().

        _ensureFields() {
            if (this._fieldsReady) return;

            // --- логика ---
            this._counter = 0;
            this._log = [];
            this._dropCount = 0;
            this._messageCount = 0;
            this._clockHidden = false;

            // --- подписки ---
            this._rpcUnsub = null;
            this._dragUnsubs = [];

            // --- DOM-ссылки ---
            this._headerEl = null;
            this._counterEl = null;
            this._dragBtn = null;
            this._infoBlock = null;
            this._logBlock = null;
            this._inputEl = null;

            this._fieldsReady = true;
        }

        // ============================================================
        // 4. КОНТЕНТ
        // ============================================================
        //
        // buildContent(el) вызывается из конструктора.
        // el — this._content, уже в DOM.
        //
        // Доступно:
        //   this.getId() / getType() / getSlotId() / getTitle() / getIcon()

        buildContent(el) {
            this._ensureFields();

            const ui = this.ui;
            const dom = this.utils.dom;

            el.style.cssText = [
                'padding: 14px',
                'display: flex',
                'flex-direction: column',
                'gap: 12px',
                'overflow: auto',
                'box-sizing: border-box'
            ].join(';');

            // --- Заголовок ---
            this._headerEl = ui.text({
                text: t.t('welcome', { name: 'Demo' }),
                variant: 'heading'
            });
            el.appendChild(this._headerEl);

            // --- Счётчик ---
            this._counterEl = ui.text({
                text: 'Счётчик: 0',
                variant: 'mono'
            });
            el.appendChild(this._counterEl);

            // --- Кнопки счётчика ---
            const btnRow = dom.el('div', {
                style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: '+1',
                    icon: 'icon-plus',
                    onClick: () => this.increment(1)
                }),
                ui.button({
                    label: '+10',
                    icon: 'icon-plus-circle',
                    variant: 'primary',
                    onClick: () => this.increment(10)
                }),
                ui.button({
                    label: 'Сброс',
                    icon: 'icon-refresh',
                    variant: 'ghost',
                    onClick: () => this.resetCounter()
                }),
                ui.button({
                    label: 'Сообщение',
                    icon: 'icon-mail',
                    variant: 'ghost',
                    onClick: () => this.broadcastPing()
                })
            ]);
            el.appendChild(btnRow);

            // --- drag-source кнопка ---
            // Иконка: icon-more (есть в svg.html). icon-drag — нет.
            this._dragBtn = ui.button({
                label: 'Перетащи меня на другое окно',
                icon: 'icon-more',
                variant: 'ghost',
                onClick: () => {}
            });
            el.appendChild(this._dragBtn);

            // --- RPC ---
            const rpcRow = dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: 'RPC → self',
                    icon: 'icon-link',
                    variant: 'ghost',
                    onClick: () => this.demoRpcSelf()
                }),
                ui.button({
                    label: 'RPC → other',
                    icon: 'icon-link',
                    variant: 'ghost',
                    onClick: () => this.demoRpcOther()
                })
            ]);
            el.appendChild(rpcRow);

            // --- Слоты ---
            const slotRow = dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: 'Новый слот',
                    icon: 'icon-plus',
                    variant: 'ghost',
                    onClick: () => {
                        this.createEmptySlot();
                        this.notify('Слот', 'Создан новый слот', 'success');
                        this._renderInfo();
                    }
                }),
                ui.button({
                    label: 'Найти другое',
                    icon: 'icon-search',
                    variant: 'ghost',
                    onClick: () => this.demoFindWindow()
                })
            ]);
            el.appendChild(slotRow);

            // --- Capture keyboard ---
            const kbRow = dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: 'Capture keyboard',
                    icon: 'icon-lock',
                    variant: 'ghost',
                    onClick: () => {
                        const ok = this.captureKeyboard();
                        this.notify('Keyboard', ok ? 'Захвачено' : 'Не удалось', ok ? 'success' : 'error');
                    }
                }),
                ui.button({
                    label: 'Release keyboard',
                    icon: 'icon-unlock',
                    variant: 'ghost',
                    onClick: () => {
                        const ok = this.releaseKeyboard();
                        this.notify('Keyboard', ok ? 'Отпущено' : 'Не было захвата', ok ? 'success' : 'info');
                    }
                })
            ]);
            el.appendChild(kbRow);

            // --- Блок info ---
            this._infoBlock = ui.block({
                title: 'Состояние',
                children: []
            });
            el.appendChild(this._infoBlock);

            // --- Блок лог ---
            this._logBlock = ui.block({
                title: 'Лог',
                children: []
            });
            el.appendChild(this._logBlock);

            // --- Поле ввода ---
            this._inputEl = ui.input({
                placeholder: 'Введите сообщение...',
                onChange: (e) => {
                    this.setState({ draft: e.target.value });
                }
            });
            el.appendChild(this._inputEl);

            this._renderInfo();
            this._renderLog();

            // --- drag-source на кнопке ---
            // makeDraggable откладывает регистрацию до onBaseWindowAttached.
            const unsub = this.makeDraggable(this._dragBtn, {
                type: 'demo-payload',
                ghostHTML: '<b>📦 Example payload</b>',
                getPayload: () => ({
                    name: 'ExampleWindow payload',
                    counter: this._counter,
                    slotId: this.getSlotId()
                })
            });
            this._dragUnsubs.push(unsub);
        }

        // ============================================================
        // 5. ЖИЗНЕННЫЙ ЦИКЛ
        // ============================================================

        onReady() {
            console.log('[ExampleWindow] onReady:', this.id, 'slot:', this.getSlotId());
            this.notify('Example', 'Окно готово', 'success');

            const draft = this.uiState && this.uiState.draft;
            if (draft && this._inputEl) {
                this._inputEl.value = draft;
            }

            // RPC-обработчик
            this._rpcUnsub = this.onRequest('demo-rpc', async (data, meta) => {
                this._pushLog('RPC ← ' + meta.fromSenderId + ': ' + JSON.stringify(data));
                this._messageCount++;
                this._renderInfo();
                return {
                    echo: data,
                    from: this.id,
                    slotId: this.getSlotId(),
                    counter: this._counter
                };
            });

            // Runtime-badge
            this.addHeaderItem({
                id: 'badge-runtime',
                type: 'badge',
                text: 'RT',
                action: 'badge-runtime-click',
                bg: 'rgba(68, 204, 136, 0.16)',
                color: 'var(--success-color, #44cc88)',
                border: '1px solid rgba(68, 204, 136, 0.3)'
            });
        }

        onData(data) {
            if (data && data.data && typeof data.data.counter === 'number') {
                this._counter = data.data.counter;
                this._updateCounterEl();
            }
            if (data && data.uiState && data.uiState.draft && this._inputEl) {
                this._inputEl.value = data.uiState.draft;
            }
        }

        onDataUpdate(payload) {
            super.onDataUpdate(payload);
            if (payload && payload.data && typeof payload.data.counter === 'number') {
                this._counter = payload.data.counter;
                this._updateCounterEl();
            }
        }

        onFocus() {
            this._pushLog('Фокус получен');
            this._renderLog();
        }

        onBlur() {
            this._pushLog('Фокус потерян');
            this._renderLog();
        }

        onVisibilityChange(visible) {
            this._pushLog('Видимость: ' + (visible ? 'visible' : 'hidden'));
            this._renderLog();
        }

        onThemeChange(theme) {
            this._pushLog('Тема: ' + theme);
            this._renderLog();
        }

        onResize(w, h) {
            // Слишком часто — не логируем.
        }

        onSlotChange(slotId) {
            this._pushLog('Слот изменён: ' + slotId);
            this._renderLog();
            this._renderInfo();
        }

        onBeforeDestroy() {
            if (this._rpcUnsub) {
                try { this._rpcUnsub(); } catch (e) {}
                this._rpcUnsub = null;
            }
            for (const u of this._dragUnsubs || []) {
                try { u(); } catch (e) {}
            }
            this._dragUnsubs = [];
            console.log('[ExampleWindow] onBeforeDestroy:', this.id);
        }

        // ============================================================
        // 6. headerItems-ХУК
        // ============================================================
        //
        // Порядок в BaseWindow._onRenderMenuAction:
        //   1) realInstance.onHeaderItemClick(desc, payload) → true стоп
        //   2) realInstance[action](value, payload, item)
        //   3) emit 'window-menu-action'

        onHeaderItemClick(desc, payload) {
            this._pushLog('headerItem: ' + (payload.action || '?')
                + ' [' + payload.source + ']');
            this._renderLog();

            if (payload.action === 'badge-mode') {
                this.notify('Badge', 'Клик по badge "DEMO"', 'info');
                return true;
            }

            if (payload.action === 'badge-runtime-click') {
                this.notify('Badge', 'Клик по runtime-badge "RT"', 'info');
                return true;
            }

            return false;
        }

        // ============================================================
        // 7. ОБРАБОТЧИКИ headerItems
        // ============================================================

        greet(value, payload, item) {
            this.notify('Hello', 'Привет из ExampleWindow! payload=' + JSON.stringify(payload || {}), 'success');
            this._pushLog('greet: ' + JSON.stringify(payload || {}));
            this._renderLog();
        }

        'run-demo'(value, payload, item) {
            this._counter += 100;
            this._updateCounterEl();
            this.recordHistory('Demo +100');
            this.notify('Demo', 'Демо выполнено (+100)', 'success');
            this._pushLog('run-demo');
            this._renderLog();
        }

        'reset-counter'(value, payload, item) {
            this._counter = 0;
            this._updateCounterEl();
            this.recordHistory('Сброс счётчика');
            this.notify('Demo', 'Счётчик сброшен', 'info');
        }

        'snapshot'(value, payload, item) {
            this.recordHistory('Ручной снапшот');
            this.notify('История', 'Записано в историю', 'success');
        }

        'add-badge'(value, payload, item) {
            const n = this.getHeaderItems().filter(x => x && x.type === 'badge').length + 1;
            this.addHeaderItem({
                id: 'badge-dyn-' + Date.now(),
                type: 'badge',
                text: 'B' + n,
                action: 'badge-dyn-click',
                bg: 'rgba(255, 170, 51, 0.16)',
                color: 'var(--warning-color, #ffaa33)',
                border: '1px solid rgba(255, 170, 51, 0.3)'
            });
            this.notify('headerItems', 'Добавлен badge B' + n, 'success');
        }

        'remove-badge'(value, payload, item) {
            const badges = this.getHeaderItems().filter(x => x && x.type === 'badge');
            const last = badges[badges.length - 1];
            if (!last) {
                this.notify('headerItems', 'Нет badge для удаления', 'warning');
                return;
            }
            this.removeHeaderItem(last.id);
            this.notify('headerItems', 'Удалён ' + last.id, 'info');
        }

        'toggle-clock'(value, payload, item) {
            this._clockHidden = !this._clockHidden;
            this.refreshHeaderItems();
            this.notify('Clock', this._clockHidden ? 'Скрыт' : 'Показан', 'info');
        }

        'reset-header-items'(value, payload, item) {
            this.setHeaderItems(null);
            this.notify('headerItems', 'Сброшено к дефолту', 'info');
        }

        'badge-dyn-click'(value, payload, item) {
            this.notify('Badge', 'Клик по ' + (item && item.id), 'info');
        }

        'focus-window'(value, payload, item) {
            const targetId = payload && payload.targetId;
            if (!targetId || !this._layoutManager) return;
            this._layoutManager.setFocusedWindow(targetId);
            this.notify('Focus', 'Фокус → ' + targetId, 'info');
        }

        // ============================================================
        // 8. ХОТКЕИ
        // ============================================================

        onHotkeyDemo() {
            this.notify('Hotkey', 'Ctrl+Shift+D / F5 — демо', 'info');
            this['run-demo']();
        }

        onHotkeyReset() {
            this.resetCounter();
        }

        // ============================================================
        // 9. MESSAGEBUS
        // ============================================================

        onMessage(senderId, channel, data) {
            this._messageCount++;
            this._pushLog('MSG ← ' + senderId + ' [' + channel + ']: ' + JSON.stringify(data));
            this._renderLog();
            this._renderInfo();

            if (channel === 'demo-ping') {
                this.notify('Ping', 'Получен ping от ' + senderId, 'info');
            }
        }

        broadcastPing() {
            const ok = this.sendMessage('demo-ping', {
                from: this.id,
                slotId: this.getSlotId(),
                ts: Date.now()
            }, null);
            this.notify('MessageBus', ok ? 'Ping разослан' : 'Не удалось', ok ? 'success' : 'warning');
        }

        // ============================================================
        // 10. RPC
        // ============================================================

        async demoRpcSelf() {
            try {
                const res = await this.request(
                    'demo-rpc',
                    { hello: 'self', counter: this._counter },
                    this.id,
                    { timeout: 3000 }
                );
                this.notify('RPC self', 'OK: ' + JSON.stringify(res), 'success');
                this._pushLog('RPC self → ' + JSON.stringify(res));
                this._renderLog();
            } catch (e) {
                this.notify('RPC self', 'Error: ' + e.message, 'error');
            }
        }

        async demoRpcOther() {
            const other = this.findWindowByType(this.type);
            if (!other) {
                this.notify('RPC other', 'Нет других окон типа "' + this.type + '"', 'warning');
                return;
            }
            try {
                const res = await this.request(
                    'demo-rpc',
                    { hello: 'other', targetId: other.id },
                    other.id,
                    { timeout: 3000 }
                );
                this.notify('RPC other', 'OK от #' + other.id + ': ' + JSON.stringify(res), 'success');
                this._pushLog('RPC other → ' + JSON.stringify(res));
                this._renderLog();
            } catch (e) {
                this.notify('RPC other', 'Error: ' + e.message, 'error');
            }
        }

        // ============================================================
        // 11. DRAG & DROP
        // ============================================================

        onDragEnter(meta) {
            this._pushLog('dragEnter: ' + meta.source);
            this._renderLog();
        }

        onDragLeave() {
            this._pushLog('dragLeave');
            this._renderLog();
        }

        async onDrop(files, meta) {
            this._dropCount++;

            if (meta.source === 'internal') {
                this.notify('Drop', 'Внутренний payload: ' + JSON.stringify(meta.payload), 'success');
                this._pushLog('drop internal: ' + JSON.stringify(meta.payload));
                this._renderLog();
                this._renderInfo();
                return true;
            }

            const names = files.map(f => f.name).join(', ');
            this.notify('Drop', 'Файлов: ' + files.length + ' → ' + names, 'success');
            this._pushLog('drop files: ' + names);

            const first = files[0];
            if (first && (first.type === 'application/json' || /\.(json|txt|lsp)$/i.test(first.name))) {
                try {
                    const text = await first.text();
                    this._pushLog('file[0] content (' + text.length + 'b): '
                        + text.slice(0, 80).replace(/\s+/g, ' '));
                } catch (e) {
                    this._pushLog('file read error: ' + e.message);
                }
            }

            this._renderLog();
            this._renderInfo();
            this.recordHistory('Импорт ' + files.length + ' файл(ов)');
            return true;
        }

        // ============================================================
        // 12. ЛОГИКА
        // ============================================================

        increment(n) {
            this._counter += n;
            this._updateCounterEl();
            this.recordHistory('Счётчик +' + n);
            this._pushLog('counter → ' + this._counter);
            this._renderLog();
        }

        resetCounter() {
            this._counter = 0;
            this._updateCounterEl();
            this.recordHistory('Сброс счётчика');
            this._pushLog('counter reset');
            this._renderLog();
        }

        demoFindWindow() {
            const other = this.findWindowByType(this.type);
            if (other) {
                this.notify('Find', 'Найдено: #' + other.id + ' (' + other.title + ')', 'info');
            } else {
                this.notify('Find', 'Других окон типа "' + this.type + '" нет', 'warning');
            }
        }

        // ============================================================
        // 13. UI-ХЕЛПЕРЫ
        // ============================================================

        _updateCounterEl() {
            if (this._counterEl) {
                this._counterEl.textContent = 'Счётчик: ' + this._counter;
            }
        }

        _pushLog(line) {
            if (!this._log) this._log = [];
            const ts = new Date().toTimeString().slice(0, 8);
            this._log.push('[' + ts + '] ' + line);
            if (this._log.length > 50) this._log.shift();
        }

        _renderLog() {
            if (!this._logBlock) return;
            const body = this.ui.block.getBody(this._logBlock);
            if (!body) return;
            while (body.firstChild) body.removeChild(body.firstChild);

            const log = this._log || [];
            const slice = log.slice(-12);
            if (slice.length === 0) {
                body.appendChild(this.ui.text({ text: '— пусто —', variant: 'muted' }));
                return;
            }
            for (const line of slice) {
                body.appendChild(this.ui.text({ text: line, variant: 'mono' }));
            }
        }

        _renderInfo() {
            if (!this._infoBlock) return;
            const body = this.ui.block.getBody(this._infoBlock);
            if (!body) return;
            while (body.firstChild) body.removeChild(body.firstChild);

            const rows = [
                ['id', this.getId()],
                ['type', this.getType()],
                ['slotId', this.getSlotId() || '—'],
                ['counter', String(this._counter)],
                ['drops', String(this._dropCount)],
                ['messages', String(this._messageCount)],
                ['headerItems', String(this.getHeaderItems().length)],
                ['clockHidden', String(this._clockHidden)],
                ['visible', String(this.isVisible())]
            ];

            for (const [k, v] of rows) {
                const row = this.utils.dom.el('div', {
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        fontSize: '11px',
                        fontFamily: '"Courier New", monospace'
                    }
                }, [
                    this.ui.text({ text: k, variant: 'muted' }),
                    this.ui.text({ text: v })
                ]);
                body.appendChild(row);
            }

            const others = this.findWindowsByType(this.type);
            if (others.length > 0) {
                body.appendChild(this.ui.text({
                    text: 'siblings: ' + others.map(w => '#' + w.id).join(', '),
                    variant: 'muted'
                }));
            }
        }

        // ============================================================
        // 14. ДАННЫЕ
        // ============================================================

        getAllData() {
            return {
                metadata: this.getMetadata(),
                data: {
                    counter: this._counter,
                    log: this._log.slice(-20)
                }
            };
        }

        setAllData(payload) {
            super.setAllData(payload);
            if (payload && payload.data && typeof payload.data.counter === 'number') {
                this._counter = payload.data.counter;
                this._updateCounterEl();
            }
        }

        onImport(parsed) {
            if (!parsed) return false;
            if (typeof parsed === 'object' && typeof parsed.counter === 'number') {
                this._counter = parsed.counter;
                this._updateCounterEl();
                return true;
            }
            return false;
        }

        onExport() {
            return {
                counter: this._counter,
                slotId: this.getSlotId(),
                exportedAt: new Date().toISOString()
            };
        }
    }

    // ============================================================
    // 15. РЕГИСТРАЦИЯ
    // ============================================================

    if (typeof window !== 'undefined') {
        window.ExampleWindow = ExampleWindow;
        console.log('[ExampleWindow] Registered class globally: ExampleWindow');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ExampleWindow };
    }

})();