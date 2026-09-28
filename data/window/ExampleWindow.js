// data/window/ExampleWindow.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  LSYSTEM · УЧЕБНОЕ ПОСОБИЕ: как написать окно
// ═══════════════════════════════════════════════════════════════════════════
//
//  Это не «демонстрационное окно», а живой шаблон. Читайте его сверху вниз —
//  каждая секция объясняет одну грань контракта между окном и ядром.
//  Код в этом файле — рабочий: скопируйте его в свой файл, переименуйте
//  класс, поменяйте `meta.id` — и получите своё окно.
//
//  ─────────────────────────────────────────────────────────────────────────
//  ГЛАВНАЯ ИДЕЯ
//  ─────────────────────────────────────────────────────────────────────────
//
//  Окно — это класс, унаследованный от `window.BaseWindowInstance`.
//  Он описывает себя декларативно (static геттеры) и реализует хуки,
//  которые вызывает ядро. Окно НЕ знает:
//
//    • как его загрузили (через PluginLoader, <script>, eval);
//    • кто такой WindowRegistry, LayoutManager, DataBus, MessageBus;
//    • в каком порядке грузятся другие окна и ядро.
//
//  Всё, что окну нужно от ядра, — уже лежит на `this.*`.
//
//  ─────────────────────────────────────────────────────────────────────────
//  МИНИМАЛЬНЫЙ РАБОЧИЙ ПЛАГИН — ТРИ СТРОКИ
//  ─────────────────────────────────────────────────────────────────────────
//
//      class MyWindow extends window.BaseWindowInstance {
//          static get meta() { return { id: 'my-window', name: 'My Window' }; }
//          buildContent(el) { el.textContent = 'Привет!'; }
//      }
//      module.exports = { MyWindow };
//
//  Готово. Ядро найдёт класс в `module.exports`, зарегистрирует его
//  в WindowRegistry, и окно появится в меню «Window». Системные кнопки
//  (data / changeType / layout / minimize / fullscreen / close) добавятся
//  автоматически — окну не нужно ничего для этого писать.
//
//  ─────────────────────────────────────────────────────────────────────────
//  ЧТО МОЖНО ЭКСПОРТИРОВАТЬ
//  ─────────────────────────────────────────────────────────────────────────
//
//  Любую функцию с `static get meta() { return { id: '...' } }` ядро
//  воспринимает как отдельный тип окна. Из одного файла можно отдать
//  несколько:
//
//      module.exports = { MyWindow, MyPanel, MyDialog };
//
//  Функции без `meta.id` (хелперы, константы, фабрики) — игнорируются.
//
// ═══════════════════════════════════════════════════════════════════════════


(function () {
    'use strict';

    // ───────────────────────────────────────────────────────────────────────
    // 0. СТРАХОВКА: ЯДРО ДОЛЖНО БЫТЬ ЗАГРУЖЕНО
    // ───────────────────────────────────────────────────────────────────────

    if (!window.BaseWindowInstance) {
        console.error('[MyWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }


    // ═══════════════════════════════════════════════════════════════════════
    // 1. ГЛОБАЛЬНАЯ РЕГИСТРАЦИЯ КАСТОМНОГО ТИПА headerItem
    // ═══════════════════════════════════════════════════════════════════════
    //
    //  HeaderController умеет рисовать три встроенных типа:
    //
    //      'button'    — обычная кнопка
    //      'dropdown'  — выпадающее меню
    //      'separator' — вертикальная черта
    //
    //  Плюс шесть системных типов, зарегистрированных в UserAPI.js:
    //
    //      'sys-close', 'sys-minimize', 'sys-fullscreen',
    //      'sys-data', 'sys-changeType', 'sys-layout'
    //
    //  Если нужно своё — регистрируем новый тип глобально:
    //
    //      HeaderController.registerHeaderItemType(name, builder)
    //
    //  builder(desc, ctx) должен вернуть DOM-элемент (nodeType === 1).
    //  ctx = { header, chrome, baseWindow, layoutManager, registry, index, desc }.
    //
    //  Регистрация идемпотентна. Если builder возвращает DOM-элемент
    //  с полем `el.__lsDestroy = function() {...}`, ядро вызовет его
    //  при удалении элемента (например, при смене типа окна или
    //  при destroy() самого окна). Это место для снятия глобальных
    //  слушателей и таймеров.
    //
    //  Здесь регистрируем тип `badge` — маленький цветной ярлык.

    if (window.HeaderController
        && typeof window.HeaderController.registerHeaderItemType === 'function'
        && window.HeaderController.getHeaderItemTypes().indexOf('badge') === -1
    ) {
        window.HeaderController.registerHeaderItemType('badge', function (desc, ctx) {
            var el = document.createElement('span');
            el.className = 'mywindow-badge';
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

            el.addEventListener('click', function (e) {
                e.stopPropagation();
                ctx.header._emit('menu-action', {
                    windowId: ctx.header._id,
                    action: desc.action || 'badge-click',
                    value: desc.value || '',
                    payload: desc.payload !== undefined ? desc.payload : null,
                    item: Object.assign({}, desc, { type: 'badge' })
                });
            });

            return el;
        });

        console.log('[MyWindow] headerItemType "badge" registered');
    }


    // ═══════════════════════════════════════════════════════════════════════
    // 2. КЛАСС ОКНА
    // ═══════════════════════════════════════════════════════════════════════

    class ExampleWindow extends window.BaseWindowInstance {

        // ───────────────────────────────────────────────────────────────────
        // 2.1. static meta — ПАСПОРТ ОКНА
        // ───────────────────────────────────────────────────────────────────
        //
        //  Единственное ОБЯЗАТЕЛЬНОЕ поле класса. Ядро решает, что перед
        //  ним плагин, ровно по наличию `static meta.id`. Функция без
        //  meta.id — это утилита, а не окно.
        //
        //  Поля:
        //      id           — уникальный строковый id типа (обязательно)
        //      name         — человекочитаемое имя (в меню «Window»)
        //      icon         — 'icon-xxx' из svg-спрайта или emoji
        //      description  — подпись для tooltip
        //      group        — группа в меню (по умолчанию 'Other')
        //      category     — для фильтрации и сортировки
        //      priority     — сортировка внутри группы (меньше — выше)
        //      defaultSize  — { width, height } — стартовый размер
        //      minSize      — { width, height } — минимальный размер
        //      maxWindows   — сколько таких окон можно открыть одновременно
        //      metadata     — произвольные данные (version, author и т.п.)

        static get meta() {
            return {
                id: 'example',
                name: 'Example Window',
                icon: 'icon-example',
                description: 'Учебный шаблон окна LSYSTEM',
                group: 'Примеры',
                category: 'example',
                priority: 100,
                defaultSize: { width: 640, height: 480 },
                minSize: { width: 280, height: 200 },
                maxWindows: 4,
                metadata: { version: '1.0.0', author: 'LSYSTEM' }
            };
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.2. static menu — КНОПКИ И ДРОПДАУНЫ В ШАПКЕ ОКНА
        // ───────────────────────────────────────────────────────────────────
        //
        //  Это шапка самого окна, которую рисует HeaderController.
        //  Сюда попадают кнопки, уникальные для этого типа.
        //
        //  ВАЖНО: если окно определяет свой static menu, дефолтный
        //  системный набор НЕ добавляется. Нужно явно перечислить
        //  нужные sys-* items или не задавать static menu вовсе.
        //
        //  Каждый дескриптор должен иметь id — для динамических
        //  операций addHeaderItem / removeHeaderItem во время работы.
        //
        //  Форматы:
        //
        //      { id, type: 'button',   icon, label, title, action, payload }
        //      { id, type: 'dropdown', icon, label, title, items, hidden }
        //      { id, type: 'separator' }
        //      { id, render(ctx) { return Element }, destroy(el), refresh(el, ctx) }
        //      { id, type: 'sys-close' }     // системные, из UserAPI
        //      { id, type: 'sys-minimize' }
        //      { id, type: 'sys-fullscreen' }
        //      { id, type: 'sys-data' }
        //      { id, type: 'sys-changeType' }
        //      { id, type: 'sys-layout' }
        //
        //  items дропдауна может быть:
        //      • массивом пунктов;
        //      • функцией (realInstance, baseWindow, layoutManager) => [...]
        //
        //  hidden может быть boolean или функцией (baseWindow, header) => bool.
        //
        //  Если у пункта задан `action`, ядро вызовет метод экземпляра
        //  с этим именем: myAction(value, payload, item).
        //
        //  Если задан `render(ctx)`, вы возвращаете DOM-узел сами. Помните:
        //  render() вызывается ДО того, как instance готов. Поэтому внутри
        //  render() нельзя обращаться к this — только к ctx.baseWindow.
        //
        //  Элемент, возвращённый render(), может иметь:
        //      el.__lsDestroy = function() {...}
        //  Ядро вызовет его при удалении элемента.
        //
        //  Элемент, возвращённый для dropdown-дескриптора, может иметь:
        //      el._refreshItems = function() {...}
        //  Ядро вызовет его при refreshDropdowns().

        static get menu() {
            return {
                headerItems: [

                    // ─── Простая кнопка ───
                    {
                        id: 'btn-hello',
                        type: 'button',
                        icon: 'icon-info',
                        label: 'Hello',
                        title: 'Показать приветствие',
                        action: 'greet',
                        payload: { from: 'btn-hello' }
                    },

                    // ─── Разделитель ───
                    { id: 'sep-1', type: 'separator' },

                    // ─── Кастомный badge (зарегистрирован выше) ───
                    {
                        id: 'badge-mode',
                        type: 'badge',
                        text: 'DEMO',
                        action: 'badge-mode',
                        bg: 'rgba(204, 34, 51, 0.16)',
                        color: 'var(--accent-red, #cc2233)',
                        border: '1px solid rgba(204, 34, 51, 0.3)'
                    },

                    // ─── Дропдаун с динамическими items и hidden ───
                    {
                        id: 'dd-tools',
                        type: 'dropdown',
                        icon: 'icon-settings',
                        label: 'Tools',
                        title: 'Инструменты демо',

                        hidden: function (baseWindow) {
                            var lm = baseWindow && baseWindow._layoutManager;
                            if (!lm) return false;
                            return lm.getVisibleWindowCount() > 3;
                        },

                        items: function (realInstance, baseWindow, layoutManager) {
                            var items = [
                                { header: 'Демо-действия' },
                                { icon: 'icon-play',    label: 'Выполнить демо',  action: 'run-demo',      shortcut: 'F5' },
                                { icon: 'icon-refresh', label: 'Сбросить счётчик', action: 'reset-counter' },
                                { divider: true },
                                { header: 'headerItems' },
                                { icon: 'icon-plus',     label: 'Добавить badge',      action: 'add-badge' },
                                { icon: 'icon-trash',    label: 'Удалить badge',       action: 'remove-badge' },
                                { icon: 'icon-eye-off',  label: 'Toggle clock (hidden)', action: 'toggle-clock' },
                                { icon: 'icon-trash',    label: 'Сбросить headerItems', action: 'reset-header-items', danger: true },
                                { divider: true },
                                { header: 'История' },
                                { icon: 'icon-history',  label: 'Записать в историю', action: 'snapshot' }
                            ];

                            if (layoutManager) {
                                var others = layoutManager.getVisibleWindows().filter(function (w) {
                                    return String(w.id) !== String(realInstance && realInstance.id);
                                });
                                if (others.length > 0) {
                                    items.push({ divider: true });
                                    items.push({ header: 'Другие окна' });
                                    for (var i = 0; i < Math.min(others.length, 5); i++) {
                                        var w = others[i];
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

                    // ─── Полностью кастомный headerItem ───
                    //
                    //  Здесь рисуем живые часы. render() не имеет доступа
                    //  к this — только к ctx. Поэтому все нужные данные
                    //  хранятся на instance, к которому можно добраться
                    //  через ctx.baseWindow.getRealInstance().
                    //
                    //  __lsDestroy вызывается ядром при удалении элемента —
                    //  чистим таймер, чтобы не утекал.
                    {
                        id: 'custom-clock',
                        hidden: function (baseWindow) {
                            if (!baseWindow) return false;
                            var inst = baseWindow.getRealInstance && baseWindow.getRealInstance();
                            return !!(inst && inst._clockHidden);
                        },
                        render: function (ctx) {
                            var el = document.createElement('span');
                            el.className = 'mywindow-clock';
                            el.style.cssText = [
                                'font-family: "Courier New", monospace',
                                'font-size: 10px',
                                'color: var(--text-muted, rgba(200, 184, 154, 0.55))',
                                'padding: 0 6px',
                                'flex-shrink: 0',
                                'user-select: none',
                                'letter-spacing: 0.3px'
                            ].join(';');

                            var tick = function () {
                                el.textContent = new Date().toTimeString().slice(0, 8);
                            };
                            tick();

                            var timer = setInterval(tick, 1000);

                            el.__lsDestroy = function () {
                                clearInterval(timer);
                                timer = null;
                            };

                            return el;
                        }
                    },

                    // ─── Разделитель ───
                    { id: 'sep-2', type: 'separator' },

                    // ─── Системные контролы из UserAPI ───
                    //  Поскольку мы задали свой static menu, дефолтный
                    //  набор не подставится. Перечисляем sys-* явно.
                    { id: 'sys-data',       type: 'sys-data' },
                    { id: 'sys-changeType', type: 'sys-changeType' },
                    { id: 'sys-layout',     type: 'sys-layout' },
                    { id: 'sys-minimize',   type: 'sys-minimize' },
                    { id: 'sys-fullscreen', type: 'sys-fullscreen' },
                    { id: 'sys-close',      type: 'sys-close' }
                ]
            };
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.3. static hotkeys — ГОРЯЧИЕ КЛАВИШИ ОКНА
        // ───────────────────────────────────────────────────────────────────
        //
        //  Активны только когда окно в фокусе. Регистрируются ядром
        //  автоматически через HotkeyRegistry.
        //
        //      { '<Combo>': { action: 'имяМетода', label: 'подпись' } }
        //
        //  Ядро вызывает метод экземпляра без аргументов.

        static get hotkeys() {
            return {
                'Ctrl+Shift+D': { action: 'onHotkeyDemo',  label: 'Демо' },
                'Ctrl+Shift+R': { action: 'onHotkeyReset', label: 'Сброс счётчика' },
                'F5':           { action: 'onHotkeyDemo',  label: 'Демо (F5)' }
            };
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.4. static channels — ПОДПИСКИ MESSAGEBUS
        // ───────────────────────────────────────────────────────────────────
        //
        //  BaseWindowInstance подпишется на эти каналы автоматически
        //  в конструкторе. При получении сообщения вызовется onMessage.

        static get channels() {
            return ['demo-ping', 'demo-broadcast', 'demo-rpc'];
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.5. static dropTarget — ПРИЁМ ФАЙЛОВ
        // ───────────────────────────────────────────────────────────────────
        //
        //  Если задан — окно принимает drag&drop файлов из ОС или из
        //  другого окна. Результат прилетит в onDrop(files, meta).
        //
        //      accept           — массив MIME-типов или расширений ('.json')
        //      acceptExtensions — строка через запятую ('.json,.txt,.lsp')
        //      multiple         — принимать ли несколько файлов за раз
        //
        //  Если onDrop возвращает false — ядро покажет «окно отклонило».

        static get dropTarget() {
            return {
                accept: ['application/json', '.txt', '.lsp'],
                acceptExtensions: '.json,.txt,.lsp',
                multiple: true
            };
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.6. constructor — ТОЧКА ВХОДА
        // ───────────────────────────────────────────────────────────────────
        //
        //  ВАЖНО: super() вызывает buildContent() ДО того, как эта строка
        //  выполнится. Поэтому любая инициализация полей экземпляра —
        //  в _ensureFields(), а не здесь.
        //
        //  Так же важно: this._baseWindow присваивается ПОСЛЕ конструктора.
        //  Значит, в buildContent() его ещё нет. Всё, что требует _baseWindow,
        //  делайте в onReady().

        constructor(container, windowData, options) {
            super(container, windowData, options);
            console.log('[MyWindow] Constructor:', this.id);
        }


        // ───────────────────────────────────────────────────────────────────
        // 2.7. _ensureFields — ЛЕНИВАЯ ИНИЦИАЛИЗАЦИЯ
        // ───────────────────────────────────────────────────────────────────
        //
        //  Идемпотентно. Вызывается первой строкой buildContent().
        //  Здесь создаются все поля экземпляра и DOM-ссылки, чтобы
        //  не засорять конструктор.

        _ensureFields() {
            if (this._fieldsReady) return;

            this._counter = 0;
            this._log = [];
            this._dropCount = 0;
            this._messageCount = 0;
            this._clockHidden = false;

            this._rpcUnsub = null;
            this._dragUnsubs = [];

            this._counterEl = null;
            this._dragBtn = null;
            this._infoBlock = null;
            this._logBlock = null;
            this._inputEl = null;

            this._fieldsReady = true;
        }


        // ═══════════════════════════════════════════════════════════════════
        // 3. buildContent — ПОСТРОЕНИЕ DOM
        // ═══════════════════════════════════════════════════════════════════
        //
        //  el — это this._content, уже вставленный в DOM. Сюда добавляйте
        //  свою разметку.
        //
        //  Доступно:
        //      this.ui.*       — ui.button, ui.input, ui.block, ui.text,
        //                        ui.icon, ui.contextMenu, ui.modal,
        //                        ui.confirm, ui.inlineEditor,
        //                        ui.categoryPanel, ui.listPanel
        //      this.utils.*    — utils.dom, utils.canvas, utils.file,
        //                        utils.graph2d
        //
        //  НЕ доступно:
        //      this._baseWindow   (присваивается после конструктора)
        //      this.getSlotId()   (работает, но данные слота ещё не читались)

        buildContent(el) {
            this._ensureFields();

            var ui = this.ui;
            var dom = this.utils.dom;

            el.style.cssText = [
                'padding: 14px',
                'display: flex',
                'flex-direction: column',
                'gap: 12px',
                'overflow: auto',
                'box-sizing: border-box'
            ].join(';');

            // ─── Заголовок ───
            el.appendChild(ui.text({
                text: 'Учебное окно. Откройте консоль — здесь много полезного.',
                variant: 'heading'
            }));

            // ─── Счётчик ───
            this._counterEl = ui.text({ text: 'Счётчик: 0', variant: 'mono' });
            el.appendChild(this._counterEl);

            // ─── Кнопки счётчика ───
            el.appendChild(dom.el('div', {
                style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }
            }, [
                ui.button({ label: '+1',  icon: 'icon-plus',        onClick: () => this.increment(1) }),
                ui.button({ label: '+10', icon: 'icon-plus-circle', variant: 'primary', onClick: () => this.increment(10) }),
                ui.button({ label: 'Сброс', icon: 'icon-refresh',   variant: 'ghost',   onClick: () => this.resetCounter() }),
                ui.button({ label: 'Сообщение', icon: 'icon-mail',  variant: 'ghost',   onClick: () => this.broadcastPing() })
            ]));

            // ─── Drag-source ───
            this._dragBtn = ui.button({
                label: 'Перетащи меня на другое окно',
                icon: 'icon-more',
                variant: 'ghost',
                onClick: () => {}
            });
            el.appendChild(this._dragBtn);

            // ─── RPC ───
            el.appendChild(dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({ label: 'RPC → self',  icon: 'icon-link', variant: 'ghost', onClick: () => this.demoRpcSelf() }),
                ui.button({ label: 'RPC → other', icon: 'icon-link', variant: 'ghost', onClick: () => this.demoRpcOther() })
            ]));

            // ─── Слоты ───
            el.appendChild(dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: 'Новый слот', icon: 'icon-plus', variant: 'ghost',
                    onClick: () => {
                        this.createEmptySlot();
                        this.notify('Слот', 'Создан новый слот', 'success');
                        this._renderInfo();
                    }
                }),
                ui.button({
                    label: 'Найти другое', icon: 'icon-search', variant: 'ghost',
                    onClick: () => this.demoFindWindow()
                })
            ]));

            // ─── Клавиатура ───
            el.appendChild(dom.el('div', {
                style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
            }, [
                ui.button({
                    label: 'Capture keyboard', icon: 'icon-lock', variant: 'ghost',
                    onClick: () => {
                        var ok = this.captureKeyboard();
                        this.notify('Keyboard', ok ? 'Захвачено' : 'Не удалось', ok ? 'success' : 'error');
                    }
                }),
                ui.button({
                    label: 'Release keyboard', icon: 'icon-unlock', variant: 'ghost',
                    onClick: () => {
                        var ok = this.releaseKeyboard();
                        this.notify('Keyboard', ok ? 'Отпущено' : 'Не было захвата', ok ? 'success' : 'info');
                    }
                })
            ]));

            // ─── Блоки информации и лога ───
            this._infoBlock = ui.block({ title: 'Состояние', children: [] });
            el.appendChild(this._infoBlock);

            this._logBlock = ui.block({ title: 'Лог', children: [] });
            el.appendChild(this._logBlock);

            // ─── Поле ввода ───
            this._inputEl = ui.input({
                placeholder: 'Введите сообщение...',
                onChange: (e) => this.setState({ draft: e.target.value })
            });
            el.appendChild(this._inputEl);

            this._renderInfo();
            this._renderLog();

            // ─── Регистрация drag-source ───
            this._dragUnsubs.push(this.makeDraggable(this._dragBtn, {
                type: 'demo-payload',
                ghostHTML: '<b>📦 Example payload</b>',
                getPayload: () => ({
                    name: 'ExampleWindow payload',
                    counter: this._counter,
                    slotId: this.getSlotId()
                })
            }));
        }


        // ═══════════════════════════════════════════════════════════════════
        // 4. onReady — ОКНО ГОТОВО
        // ═══════════════════════════════════════════════════════════════════
        //
        //  Вызывается один раз, когда BaseWindow завершил инициализацию
        //  и присвоил this._baseWindow. Здесь можно безопасно работать
        //  со слотом, RPC, headerItems, других окон.

        onReady() {
            console.log('[MyWindow] onReady:', this.id, 'slot:', this.getSlotId());

            // Восстанавливаем введённый текст из uiState.
            var draft = this.uiState && this.uiState.draft;
            if (draft && this._inputEl) this._inputEl.value = draft;

            // RPC-обработчик. Возвращаемое значение уйдёт вызывающему.
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

            // Добавляем runtime-badge в шапку. Это не часть static menu,
            // а динамическая кнопка — добавлена во время работы окна.
            this.addHeaderItem({
                id: 'badge-runtime',
                type: 'badge',
                text: 'RT',
                action: 'badge-runtime-click',
                bg: 'rgba(68, 204, 136, 0.16)',
                color: 'var(--success-color, #44cc88)',
                border: '1px solid rgba(68, 204, 136, 0.3)'
            }, 0);
        }


        // ═══════════════════════════════════════════════════════════════════
        // 5. ДАННЫЕ СЛОТА
        // ═══════════════════════════════════════════════════════════════════
        //
        //  onData       — пришли данные из слота (первичная загрузка, sync).
        //  onDataUpdate — то же, но вызывается при каждом обновлении.

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


        // ═══════════════════════════════════════════════════════════════════
        // 6. ХУКИ ЖИЗНЕННОГО ЦИКЛА
        // ═══════════════════════════════════════════════════════════════════

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
            // Вызывается часто — не логируем.
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
            for (var i = 0; i < (this._dragUnsubs || []).length; i++) {
                try { this._dragUnsubs[i](); } catch (e) {}
            }
            this._dragUnsubs = [];
        }


        // ═══════════════════════════════════════════════════════════════════
        // 7. onHeaderItemClick — КЛИК ПО КНОПКЕ ШАПКИ
        // ═══════════════════════════════════════════════════════════════════
        //
        //  Ядро вызывает этот метод РАНЬШЕ, чем пытается вызвать метод
        //  с именем action. Верните true — вы поглотили клик.
        //  Верните false — ядро вызовет this[action](value, payload, item).

        onHeaderItemClick(desc, payload) {
            this._pushLog('headerItem: ' + (payload.action || '?') + ' [' + payload.source + ']');
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


        // ═══════════════════════════════════════════════════════════════════
        // 8. ОБРАБОТЧИКИ headerItems
        // ═══════════════════════════════════════════════════════════════════

        greet(value, payload) {
            this.notify('Hello', 'Привет! payload=' + JSON.stringify(payload || {}), 'success');
            this._pushLog('greet: ' + JSON.stringify(payload || {}));
            this._renderLog();
        }

        'run-demo'() {
            this._counter += 100;
            this._updateCounterEl();
            this.recordHistory('Demo +100');
            this.notify('Demo', 'Демо выполнено (+100)', 'success');
            this._pushLog('run-demo');
            this._renderLog();
        }

        'reset-counter'() {
            this._counter = 0;
            this._updateCounterEl();
            this.recordHistory('Сброс счётчика');
            this.notify('Demo', 'Счётчик сброшен', 'info');
        }

        'snapshot'() {
            this.recordHistory('Ручной снапшот');
            this.notify('История', 'Записано в историю', 'success');
        }

        'add-badge'() {
            var n = this.getHeaderItems().filter(function (x) {
                return x && x.type === 'badge';
            }).length + 1;
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

        'remove-badge'() {
            var badges = this.getHeaderItems().filter(function (x) {
                return x && x.type === 'badge';
            });
            var last = badges[badges.length - 1];
            if (!last) {
                this.notify('headerItems', 'Нет badge для удаления', 'warning');
                return;
            }
            this.removeHeaderItem(last.id);
            this.notify('headerItems', 'Удалён ' + last.id, 'info');
        }

        'toggle-clock'() {
            this._clockHidden = !this._clockHidden;
            this.refreshHeaderItems();
            this.notify('Clock', this._clockHidden ? 'Скрыт' : 'Показан', 'info');
        }

        'reset-header-items'() {
            this.setHeaderItems(null);
            this.notify('headerItems', 'Сброшено к дефолту', 'info');
        }

        'badge-dyn-click'(value, payload, item) {
            this.notify('Badge', 'Клик по ' + (item && item.id), 'info');
        }

        'focus-window'(value, payload) {
            var targetId = payload && payload.targetId;
            if (!targetId || !this._layoutManager) return;
            this._layoutManager.setFocusedWindow(targetId);
            this.notify('Focus', 'Фокус → ' + targetId, 'info');
        }


        // ═══════════════════════════════════════════════════════════════════
        // 9. ХОТКЕИ
        // ═══════════════════════════════════════════════════════════════════

        onHotkeyDemo() {
            this.notify('Hotkey', 'Ctrl+Shift+D / F5 — демо', 'info');
            this['run-demo']();
        }

        onHotkeyReset() {
            this.resetCounter();
        }


        // ═══════════════════════════════════════════════════════════════════
        // 10. MESSAGEBUS
        // ═══════════════════════════════════════════════════════════════════

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
            var ok = this.sendMessage('demo-ping', {
                from: this.id,
                slotId: this.getSlotId(),
                ts: Date.now()
            }, null);

            this.notify('MessageBus', ok ? 'Ping разослан' : 'Не удалось', ok ? 'success' : 'warning');
        }

        async demoRpcSelf() {
            try {
                var res = await this.request(
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
            var other = this.findWindowByType(this.type);
            if (!other) {
                this.notify('RPC other', 'Нет других окон типа "' + this.type + '"', 'warning');
                return;
            }
            try {
                var res = await this.request(
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


        // ═══════════════════════════════════════════════════════════════════
        // 11. DRAG & DROP
        // ═══════════════════════════════════════════════════════════════════

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

            var names = files.map(function (f) { return f.name; }).join(', ');
            this.notify('Drop', 'Файлов: ' + files.length + ' → ' + names, 'success');
            this._pushLog('drop files: ' + names);
            this._renderLog();
            this._renderInfo();
            this.recordHistory('Импорт ' + files.length + ' файл(ов)');
            return true;
        }


        // ═══════════════════════════════════════════════════════════════════
        // 12. ЛОГИКА ОКНА
        // ═══════════════════════════════════════════════════════════════════

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
            var other = this.findWindowByType(this.type);
            if (other) {
                this.notify('Find', 'Найдено: #' + other.id + ' (' + other.title + ')', 'info');
            } else {
                this.notify('Find', 'Других окон типа "' + this.type + '" нет', 'warning');
            }
        }


        // ═══════════════════════════════════════════════════════════════════
        // 13. UI-ХЕЛПЕРЫ
        // ═══════════════════════════════════════════════════════════════════

        _updateCounterEl() {
            if (this._counterEl) {
                this._counterEl.textContent = 'Счётчик: ' + this._counter;
            }
        }

        _pushLog(line) {
            if (!this._log) this._log = [];
            var ts = new Date().toTimeString().slice(0, 8);
            this._log.push('[' + ts + '] ' + line);
            if (this._log.length > 50) this._log.shift();
        }

        _renderLog() {
            if (!this._logBlock) return;
            var body = this.ui.block.getBody(this._logBlock);
            if (!body) return;
            while (body.firstChild) body.removeChild(body.firstChild);

            var slice = (this._log || []).slice(-12);
            if (slice.length === 0) {
                body.appendChild(this.ui.text({ text: '— пусто —', variant: 'muted' }));
                return;
            }
            for (var i = 0; i < slice.length; i++) {
                body.appendChild(this.ui.text({ text: slice[i], variant: 'mono' }));
            }
        }

        _renderInfo() {
            if (!this._infoBlock) return;
            var body = this.ui.block.getBody(this._infoBlock);
            if (!body) return;
            while (body.firstChild) body.removeChild(body.firstChild);

            var rows = [
                ['id',          this.getId()],
                ['type',        this.getType()],
                ['slotId',      this.getSlotId() || '—'],
                ['counter',     String(this._counter)],
                ['drops',       String(this._dropCount)],
                ['messages',    String(this._messageCount)],
                ['headerItems', String(this.getHeaderItems().length)],
                ['clockHidden', String(this._clockHidden)],
                ['visible',     String(this.isVisible())]
            ];

            for (var i = 0; i < rows.length; i++) {
                var k = rows[i][0], v = rows[i][1];
                body.appendChild(this.utils.dom.el('div', {
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
                ]));
            }
        }


        // ═══════════════════════════════════════════════════════════════════
        // 14. ДАННЫЕ
        // ═══════════════════════════════════════════════════════════════════

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


    // ═══════════════════════════════════════════════════════════════════════
    // 15. ЭКСПОРТ КЛАССА
    // ═══════════════════════════════════════════════════════════════════════
    //
    //  Единственное, что плагин делает «наружу» — отдаёт класс через
    //  module.exports. PluginLoader найдёт его по static meta.id и
    //  зарегистрирует в WindowRegistry.

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ExampleWindow: ExampleWindow };
    }

    if (typeof window !== 'undefined') {
        window.ExampleWindow = ExampleWindow;
        console.log('[MyWindow] Registered class globally: ExampleWindow');
    }

})();