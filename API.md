📚 Документация LSYSTEM Core — v2.0.0
Полный справочник для разработчиков окон и ExtendedAPI-компонентов.
Актуально под ядро: BaseWindowInstance v2.3.0, RenderWindow v7.0.1, BaseWindow v8.0.2, WindowRegistry v6.0.1, PluginSystem v5.9.1, UserAPI v2.1.0.

📖 Оглавление
Быстрый старт — окно за 5 минут

Жизненный цикл окна

Static-конфиг класса (meta, menu, hotkeys, channels, dropTarget)

Методы окна (this.*)

Хуки (onReady, onData, ...)

Работа с данными и слотами

MessageBus и RPC

Drag & Drop

Хоткеи и клавиатура

ExtendedAPI — свои компоненты

Меню и шапка окна

Поток данных в системе

Отладка и типичные ошибки

1. Быстрый старт
1.1. Создать файл окна
data/window/MyWindow.js:

js
class MyWindow extends window.BaseWindowInstance {

    static get meta() {
        return {
            id: 'my-window',
            name: 'My Window',
            icon: 'icon-example',
            group: 'Мои окна',
            defaultSize: { width: 500, height: 400 }
        };
    }

    buildContent(el) {
        el.appendChild(this.ui.text({
            text: 'Привет, мир!',
            variant: 'heading'
        }));

        el.appendChild(this.ui.button({
            label: 'Нажми меня',
            variant: 'primary',
            onClick: () => this.notify('Клик!', 'Кнопка нажата', 'success')
        }));
    }

    static get menu() {
        return {
            headerItems: []
        };
    }
}

window.MyWindow = MyWindow;
Обязательный минимум для регистрации: static get meta() с полем id.

1.2. Зарегистрировать в data/window/window.json
json
{
    "groups": {
        "Мои окна": [
            { "file": "MyWindow.js", "hidden": false }
        ]
    }
}
1.3. Готово
Перезагрузить страницу.

Меню Window → появится «My Window».

Клик → окно создано.

1.4. Где лежат ядровые файлы
text
core/
├── API/
│   ├── BaseWindowInstance.js   ← твой базовый класс
│   ├── ExtendedAPIInjector.js  ← движок ExtendedAPI
│   ├── PluginAPI.js            ← загрузчик UserAPI.js
│   └── UserAPI.js              ← сборник компонентов (ui.*, utils.*)
├── BaseWindow.js               ← низкоуровневая обёртка (не трогаешь)
├── RenderWindow.js             ← DOM-движок окна (не трогаешь)
├── LayoutManager.js            ← раскладка окон
├── DataBus.js                  ← слоты
├── MessageBus.js               ← связь между окнами
├── ProjectManager.js           ← сохранение проекта
├── PluginSystem.js             ← загрузчик окон и API
├── WindowRegistry.js           ← реестр типов
└── ...
2. Жизненный цикл окна
2.1. Порядок вызовов
text
1. new MyWindow(container, windowData, options)
   ├─ _buildRoot()                → this._root, this._content
   ├─ _setupChannels()            → подписки на static channels
   └─ buildContent(_content)      → твой DOM

   ⚠️ В этот момент this._baseWindow ЕЩЁ НЕ ПРИСВОЕН.

2. onBaseWindowAttached(baseWindow)
   ├─ _flushPendingHeaderOps()    → отложенные мутации headerItems
   ├─ _applyHeaderItems()         → шапка строится по static menu.headerItems
   ├─ _registerDropTarget()       → если есть static dropTarget
   ├─ _registerMenuDragSources()  → drag-source на кнопках шапки
   ├─ _registerHotkeys()          → static hotkeys
   └─ _loadFromSlot()             → данные из слота

3. onReady()                      → финальный хук

4. onData(payload)                → при обновлении слота

5. onMessage(senderId, ch, data)  → при сообщении MessageBus

6. onDrop(files, meta)            → при drop
   onDragEnter(meta)              → при наведении drag
   onDragLeave()                  → при уходе

7. onThemeChange(theme)
   onFocus() / onBlur()
   onResize(w, h)
   onVisibilityChange(visible)
   onSlotChange(slotId)

8. onBeforeDestroy()              → ПЕРЕД очисткой
   destroy()                      → отписки, удаление DOM
2.2. Два критичных момента
Момент A: buildContent() вызывается ДО onBaseWindowAttached().

Внутри buildContent() нельзя обращаться к this._baseWindow.*. Используй публичные геттеры:

js
this.getId()          // windowData.id
this.getType()        // meta.id
this.getSlotId()      // id слота (может быть null)
this.getTitle()       // title окна
this.getIcon()        // иконка
this.getBaseWindow()  // BaseWindow или null
this.hasBaseWindow()  // boolean
Момент B: headerItems.render() вызывается ДО _ensureFields().

Если твой render() использует this._fieldsReady, this.data, this._counter — проверь их на undefined и верни заглушку:

js
render: (ctx) => {
    const inst = ctx.baseWindow?.getRealInstance?.();
    if (!inst || !inst._fieldsReady) {
        return document.createComment('not-ready');
    }
    return inst._buildMyWidget();
}
2.3. Про свёртывание
Свёрнутое окно (minimize) не уничтожается. Инстанс жив, подписки работают, WebSocket/таймеры не глохнут. Только DOM невидим.

При minimize вызывается onVisibilityChange(false). При restore — onVisibilityChange(true).

3. Static-конфиг класса
3.1. static get meta() — обязательно
js
static get meta() {
    return {
        id: 'my-window',              // ОБЯЗАТЕЛЬНО. Уникальный ID.
        name: 'My Window',            // Отображаемое имя.
        icon: 'icon-example',         // ID иконки из svg.html.
        group: 'Мои окна',            // Группа в меню Window.
        description: 'Что-то',        // Описание.
        category: 'other',            // Категория.
        defaultSize: { width: 500, height: 400 },
        minSize: { width: 300, height: 200 },
        maxWindows: 4,                // Макс. одновременно открытых.
        priority: 999,                // Сортировка (меньше = выше).
        metadata: { version: '1.0.0' }
    };
}
Поле allowOverride — по умолчанию false (strict). Если поставить true, при reload() тип будет перезаписан, а открытые окна этого типа помечены как orphaned. Не используй, если не уверен.

3.2. static get menu() — шапка, меню, contextMenu
js
static get menu() {
    return {
        headerItems: [
            // 1. Простая кнопка
            {
                id: 'btn-save',
                type: 'button',
                icon: 'icon-save',
                label: 'Сохранить',
                title: 'Сохранить в файл',
                action: 'saveItem'
            },

            // 2. Разделитель
            { id: 'sep-1', type: 'separator' },

            // 3. Dropdown
            {
                id: 'dd-view',
                type: 'dropdown',
                icon: 'icon-layout',
                label: 'Вид',
                items: [
                    { header: 'Режимы' },
                    { icon: 'icon-layout', label: 'Grid', action: 'viewGrid', check: true },
                    { icon: 'icon-menu',   label: 'List', action: 'viewList' },
                    { divider: true },
                    { icon: 'icon-clear',  label: 'Очистить', action: 'clearAll', danger: true }
                ]
            },

            // 4. Кастомный render (для сложных виджетов)
            {
                id: 'custom-badge',
                render: (ctx) => {
                    const bw = ctx.baseWindow;
                    const inst = bw?.getRealInstance?.();
                    if (!inst || !inst._fieldsReady) {
                        return document.createComment('not-ready');
                    }
                    return inst._buildBadge();
                }
            },

            // 5. Динамический dropdown — items-функция
            {
                id: 'dd-dynamic',
                type: 'dropdown',
                icon: 'icon-more',
                label: 'Ещё',
                items: (realInstance, baseWindow, layoutManager) => {
                    return [
                        { label: 'Пункт 1', action: 'item1' },
                        { label: 'Пункт 2', action: 'item2' }
                    ];
                },
                hidden: (baseWindow) => {
                    return baseWindow && baseWindow._layoutManager?.getVisibleWindowCount() > 3;
                }
            }
        ]
    };
}
Опции дескриптора headerItems:

Поле	Что
id	Уникальный id (для addHeaderItem/removeHeaderItem)
type	'button' | 'dropdown' | 'separator' | кастомный (см. §11.3)
render	Функция (ctx) => HTMLElement — приоритет над type
icon	ID иконки из svg-спрайта
label	Текст
title	Tooltip
action	Имя метода класса: 'saveItem' → this.saveItem()
value	Произвольное значение (уйдёт в onHeaderItemClick)
payload	Произвольный объект (уйдёт в onHeaderItemClick)
danger	Красный цвет
hidden	boolean или function(baseWindow, renderWindow)
destroy	function(el, baseWindow) — cleanup при пересборке шапки
items	Для dropdown: массив или function(realInstance, baseWindow, layoutManager)
Опции пункта dropdown/contextMenu:

Поле	Что
icon	ID иконки или эмодзи
label	Текст
action	Имя метода
value	Значение
payload	Объект
shortcut	Подсказка хоткея (справа)
check	Галочка (активный)
danger	Красный
disabled	Неактивный
header	Заголовок секции
divider	Горизонтальная линия
ContextMenu (правый клик) — не описывается в static get menu(). Ядро больше не рисует контекстное меню автоматически. Окно само вешает обработчик и вызывает this.ui.contextMenu({...}). См. §11.4.

3.3. static get hotkeys()
js
static get hotkeys() {
    return {
        'Ctrl+N': { label: 'Добавить', action: 'addItem' },
        'Ctrl+L': { label: 'Очистить', action: 'clearAll' },
        'Ctrl+G': { label: 'Grid view', action: 'viewGrid' }
    };
}
Формат: 'Модификатор+Клавиша': { label, action }.

Модификаторы: Ctrl, Shift, Alt, Meta (⌘).
Клавиши: A-Z, 0-9, F1-F12, Escape, Enter, Space, Arrow*, Tab, Backspace, Delete, ., ,, -, =, [, ], /, \, ;, ', `.

Пользователь может переопределить в SettingsModal → Горячие клавиши.

3.4. static get channels()
js
static get channels() {
    return ['example-chat', 'example-sync'];
}
При получении сообщения вызывается onMessage(senderId, channel, data).

3.5. static get dropTarget()
js
static get dropTarget() {
    return {
        acceptExtensions: '.json,.lsw,.txt',
        accept: ['image/*', 'application/json'],
        multiple: true
    };
}
acceptExtensions — по расширению.

accept — по MIME (поддерживает image/*).

multiple — можно ли несколько файлов.

Если ничего не задано — пропускаем всё.

Если оба заданы — файл проходит, если соответствует любому.

Если dropTarget задан и есть метод onDrop → окно становится drop-target.

4. Методы окна
4.1. Хелперы
js
// Корневой DOM окна
this.getRoot()

// Панель контента (то, что в buildContent(el))
this._content

// Сохранить в слот (обязательно после изменения this.data / this.metadata / this.uiState)
this.save()

// Уведомление
this.notify('Заголовок', 'Текст', 'info')   // 'info' | 'success' | 'warning' | 'error'

// Экранирование HTML
const safe = this.escapeHtml(userInput)
4.2. Состояние
js
this.isVisible()      // → boolean
this.isFocused()      // → boolean
this.getId()          // → id
this.getType()        // → type
this.getSlotId()      // → slotId
this.getTitle()       // → title
this.getIcon()        // → icon
this.getBaseWindow()  // → BaseWindow или null
this.hasBaseWindow()  // → boolean
4.3. Работа с другими окнами
js
// Первое попавшееся (включая свёрнутые)
const w = this.findWindowByType('db-connector');
// → { id, type, slotId, title, icon } или null

// Все
const list = this.findWindowsByType('example');
// → [{ id, type, slotId, title, icon }, ...]
4.4. Слоты
js
this.attachTo('example-2')       // привязаться к существующему слоту
this.createEmptySlot()           // создать пустой слот
const sid = this.getSlotId()     // 'example-3'
4.5. headerItems — рантайм-мутации
js
// Получить текущие дескрипторы
this.getHeaderItems()

// Полностью заменить
this.setHeaderItems([...])

// Вернуться к static menu.headerItems
this.setHeaderItems(null)

// Добавить в конец (или на позицию)
this.addHeaderItem({ id: 'x', type: 'button', icon: 'icon-plus', action: 'foo' })
this.addHeaderItem({...}, 0)      // на позицию 0

// Удалить по id
this.removeHeaderItem('x')

// Пересобрать шапку без изменения списка
this.refreshHeaderItems()
4.6. Хоткеи и клавиатура
js
this.captureKeyboard()    // все keydown идут только в это окно
this.releaseKeyboard()    // отпустить
Подробнее — §9.

4.7. Управление окном
js
this.minimize()           // свернуть
this.isMinimized()        // свёрнуто?
this.setFullscreen()      // развернуть на весь экран
this.exitFullscreen()
this.isFullscreen()
this.toggleFullscreen()
this.refreshHeader()      // пересобрать шапку из RenderWindow
4.8. История
js
this.recordHistory('Добавлен элемент')   // записать в общую историю
Сохраняет снапшот всего приложения (DataBus + LayoutManager). Undo/redo откатывает систему целиком.

5. Хуки
Все хуки опциональны.

5.1. onReady()
Когда: после buildContent, после подписок, после загрузки данных из слота.

js
onReady() {
    this._renderItems();
}
5.2. onData(payload)
Когда: слот обновился (включая загрузку проекта).

js
onData(payload) {
    // payload = { data, metadata, uiState }
    // они уже присвоены в this.data / this.metadata / this.uiState
    this._renderItems();
}
⚠️ Не меняй this.data и не вызывай this.save() внутри onData — это создаст цикл.

5.3. onDrop(files, meta)
js
onDrop(files, meta) {
    if (meta.source === 'internal') {
        if (meta.channel === 'example-item') {
            this.addItem(meta.payload.name, meta.payload.value);
            return true;
        }
        return false;
    }
    return this._handleFiles(files);
}
meta для внешних файлов:

js
{ source: 'files', fileNames: ['a.json'], fileTypes: ['application/json'] }
meta для внутреннего drag:

js
{
    source: 'internal',
    sourceWindowId: '5',
    sourceType: 'example',
    channel: 'example-item',
    payload: { name: 'X', value: 'Y' }
}
Возврат true — принято. false — отклонено (появится warning).

5.4. onDragEnter(meta) / onDragLeave()
Не блокирующие — только уведомление.

js
onDragEnter(meta) {
    this._content.style.outline = '2px solid var(--accent-red)';
}
onDragLeave() {
    this._content.style.outline = '';
}
5.5. onMessage(senderId, channel, data)
js
onMessage(senderId, channel, data) {
    if (channel === 'example-chat') {
        if (data.command === 'add') this.addItem();
    }
}
5.6. onThemeChange(theme), onFocus(), onBlur()
js
onThemeChange(theme) { /* 'dark' | 'light' */ }
onFocus() {}
onBlur() {}
5.7. onResize(width, height)
js
onResize(w, h) {
    this._redrawCanvas(w, h);
}
5.8. onVisibilityChange(visible)
js
onVisibilityChange(visible) {
    if (visible) this._renderItems();
}
⚠️ Свёрнутое окно живо. Рендер в onData/onMessage стоит делать только если this.isVisible().

5.9. onSlotChange(slotId)
js
onSlotChange(slotId) {
    this.notify('Слот', 'Переключен на ' + slotId, 'info');
}
5.10. onHeaderItemClick(desc, payload)
Когда: клик по headerItem (button / dropdown / badge / render).

js
onHeaderItemClick(desc, payload) {
    // payload = { action, value, item, payload, source }
    // source = 'button' | 'dropdown' | 'badge' | ...

    if (payload.action === 'badge-mode') {
        this.notify('Badge', 'Клик', 'info');
        return true;   // ← стоп, action не вызывается
    }

    return false;   // ← продолжить: вызовется this[action](value, payload, item)
}
5.11. onImport(parsed) / onExport()
Вызываются кнопкой data-dropdown (📊) в шапке — или через hard-кнопку.

js
onImport(parsed) {
    if (Array.isArray(parsed)) {
        this.data = { items: parsed };
    } else if (parsed.items) {
        this.data = parsed;
    } else {
        return false;   // ← не распознали — ядро скажет «Формат не распознан»
    }
    this.save();
    this._renderItems();
    return true;
}

onExport() {
    return {
        type: this.getType(),
        slotId: this.getSlotId(),
        items: this.data?.items || []
    };
}
⚠️ Пункты «Импорт»/«Экспорт» в data-dropdown скрыты, если методы не переопределены.

5.12. onBeforeDestroy()
js
onBeforeDestroy() {
    if (this._ws) this._ws.close();
    if (this._raf) cancelAnimationFrame(this._raf);
    clearInterval(this._timer);
    if (this._rpcUnsub) this._rpcUnsub();
    if (this._dragUnsub) this._dragUnsub();
}
5.13. onBaseWindowAttached(baseWindow)
Вызывается ядром автоматически после присвоения _baseWindow. Обычно не переопределяется, кроме случаев, когда нужно поймать момент готовности _baseWindow.

6. Данные и слоты
6.1. Что такое слот
Слот = контейнер данных.

id — уникальный (example-1).

type — к какому типу привязан.

data — пользовательские данные.

metadata — метаданные (title, version, modified).

uiState — UI-состояние (scrollTop, viewMode).

attachedWindows — какие окна привязаны.

Один слот = один набор данных. Два окна одного типа могут смотреть в один слот → синхронизированы.

Лимиты: 4 активных + 4 архивных на тип, 16 архивных всего.

6.2. this.data / this.metadata / this.uiState
js
// Чтение
const items = this.data?.items || [];

// Изменение
this.data.items.push({ name: 'X', value: 'Y' });
this.save();

// UI-состояние
this.uiState.viewMode = 'grid';
this.save();
6.3. this.save()
Сохраняет data + metadata + uiState в слот.

⚠️ save() НЕ сохраняет на диск. Только в слот. На диск — ProjectManager (автосейв каждые 30 сек или Ctrl+S).

6.4. Data-dropdown (📊 в шапке)
Каждое окно имеет кнопку 📊:

Импорт — из .json / .lsw / .txt. Вызывает onImport(parsed).

Экспорт — в файл. Вызывает onExport().

Новый слот — создать пустой.

Привязать — подменю со списком слотов.

Импорт/Экспорт скрыты, если методы не переопределены.

7. MessageBus и RPC
7.1. Broadcast
js
// Всем окнам указанного типа (кроме себя)
this.sendToType('channel-name', { foo: 'bar' }, 'target-type');

// Всем окнам своего типа
this.sendToType('channel-name', { foo: 'bar' });

// Конкретному окну
this.sendMessage('channel-name', { foo: 'bar' }, '5');

// Всем окнам слота
this.sendToSlot('channel-name', { foo: 'bar' }, 'slot-id');
Кто получает: окна, у которых static channels содержит 'channel-name'. Для них вызывается onMessage(senderId, 'channel-name', data).

7.2. Ручная подписка
js
onReady() {
    this._unsub = this.subscribeToMessage('custom-channel', (senderId, data) => {
        console.log('got', data, 'from', senderId);
    });
}

onBeforeDestroy() {
    if (this._unsub) this._unsub();
}
7.3. RPC
Клиент:

js
async loadTable(table) {
    const connector = this.findWindowByType('db-connector');
    if (!connector) return;

    try {
        const result = await this.request(
            'db-query',
            { sql: `SELECT * FROM ${table}` },
            connector.id,
            { timeout: 15000 }
        );
        this.data.rows = result;
        this.save();
    } catch (err) {
        if (err.code === 'RPC_TIMEOUT') {
            this.notify('Таймаут', 'БД не отвечает', 'warning');
        } else {
            this.notify('Ошибка', err.message, 'error');
        }
    }
}
Сервер:

js
onReady() {
    this._dbHandler = this.onRequest('db-query', async (data, meta) => {
        // data = payload без requestId
        // meta = { requestId, fromSenderId, channel }
        if (!data.sql) throw new Error('SQL is required');
        return await this._executeQuery(data.sql);
    });
}

onBeforeDestroy() {
    if (this._dbHandler) this._dbHandler();
}
Коды ошибок:

err.code === 'RPC_TIMEOUT' — таймаут.

err.code === 'RPC_ERROR' — сервер вернул ошибку (err.originalError).

err.code === 'RPC_BUS_DESTROYED' — MessageBus уничтожен.

8. Drag & Drop
8.1. Окно как drop-target
js
static get dropTarget() {
    return { acceptExtensions: '.json,.txt', multiple: true };
}

onDrop(files, meta) {
    return true;
}
CSS для подсветки: .ls-drop-hover на контейнере.

8.2. Обычный drag-source
js
const card = document.createElement('div');
card.textContent = 'Меня можно тащить';
this._content.appendChild(card);

this.makeDraggable(card, {
    type: 'my-item',                          // channel
    getPayload: () => ({ name: 'X' }),
    ghostHTML: '<div>👋 X</div>'
});
makeDraggable можно вызывать до onBaseWindowAttached — регистрация отложится.

8.3. Drag-source из headerItems
js
static get menu() {
    return {
        headerItems: [
            {
                id: 'drag-btn',
                type: 'button',
                icon: 'icon-clear',
                label: 'Clear',
                action: 'clearAll',
                dragSource: {
                    type: 'clear-command',
                    getPayload: () => ({ command: 'clear' }),
                    ghostHTML: '<div>🗑 Clear</div>'
                }
            }
        ]
    };
}
⚠️ action обязателен — ядро ищет кнопку по data-action.

8.4. Drop на себя
Не работает — _findDropTargetAtPoint исключает свой id.

9. Хоткеи и клавиатура
9.1. Обычные хоткеи
js
static get hotkeys() {
    return {
        'Ctrl+S': { label: 'Сохранить', action: 'saveItem' },
        'Escape': { label: 'Отмена',   action: 'cancelEdit' }
    };
}
9.2. Захват клавиатуры
js
onReady() {
    this.captureKeyboard();
}

onBeforeDestroy() {
    this.releaseKeyboard();
}
Пока захвачено — глобальные хоткеи не срабатывают.

Все keydown идут в окно через getHotkeys().

Escape тоже захватывается — для выхода вызывай releaseKeyboard() вручную.

Авто-release при destroy() окна.

Авто-release при потере фокуса окна (v2.3.0).

9.3. [data-capture-keyboard]
Если нужно перехватывать только когда фокус в canvas:

js
buildContent(el) {
    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('data-capture-keyboard', '');
    this._canvas.tabIndex = 0;
    el.appendChild(this._canvas);
}
Работает так: ядро проверяет document.activeElement.closest('[data-capture-keyboard]'). Если активный элемент внутри — глобальные хоткеи не срабатывают.

10. ExtendedAPI
10.1. Что это
ExtendedAPI — реестр компонентов, доступных в окнах как this.<category>.<name>. Все компоненты — в core/API/UserAPI.js.

10.2. Встроенные компоненты (UserAPI v2.1.0)
Путь	Что
this.ui.button(opts)	Кнопка
this.ui.input(opts)	Input
this.ui.block(opts)	Блок с заголовком
this.ui.text(opts)	Текст
this.ui.icon.svg(id, size, color)	SVG-иконка
this.ui.icon.canvas(ctx, id, x, y, size, color)	Иконка на canvas
this.ui.contextMenu(opts)	Контекстное меню
this.ui.modal(opts)	Модалка (Promise<buttonId>)
this.ui.confirm(opts)	Confirm (обёртка над modal)
this.ui.inlineEditor(opts)	Инлайн-редактор
this.ui.categoryPanel(opts)	Панель с категориями
this.ui.listPanel(opts)	Плоский список
this.utils.dom.el(tag, props, children)	Создать DOM-элемент
this.utils.dom.clear(el)	Очистить элемент
this.utils.dom.on(el, evt, cb)	Handler (возвращает unsub)
this.utils.canvas.roundRect(...)	canvas-примитив
this.utils.canvas.bezier(...)	canvas-кривая
this.utils.canvas.multiBezier(...)	Мульти-кривая
this.utils.canvas.distToSegment(...)	Точка-отрезок
this.utils.file.saveJSON(name, data)	Скачать JSON
this.utils.file.openJSON(cb, accept)	Открыть JSON
this.i18n.ru.t(key, params)	Перевод
this.i18n.ru.add(key, val)	Добавить перевод
10.3. Использование
js
buildContent(el) {
    // Кнопка
    el.appendChild(this.ui.button({
        label: 'Сохранить',
        icon: 'icon-save',
        variant: 'primary',      // 'default' | 'primary' | 'ghost' | 'danger' | 'success'
        onClick: () => this.save()
    }));

    // Блок
    el.appendChild(this.ui.block({
        title: 'Настройки',
        children: [
            this.ui.input({ placeholder: 'Имя', onChange: (e) => {...} }),
            this.ui.button({ label: 'OK' })
        ]
    }));

    // Текст
    el.appendChild(this.ui.text({ text: 'Привет', variant: 'heading' }));

    // DOM-хелпер
    const row = this.utils.dom.el('div', {
        className: 'my-row',
        style: { display: 'flex', gap: '8px' }
    }, [
        'Надпись: ',
        this.ui.button({ label: 'X' })
    ]);
    el.appendChild(row);

    // i18n
    const msg = this.i18n.ru.t('welcome', { name: 'Иван' });
}
10.4. Свой компонент
В core/API/UserAPI.js:

js
registerComponent('myapp', 'counter', {
    version: '1.0.0',

    css: `
        .myapp-counter {
            display: inline-flex;
            gap: 8px;
            align-items: center;
            padding: 8px;
            background: var(--bg-card);
            border-radius: 6px;
        }
        .myapp-counter__value {
            font-family: monospace;
            font-size: 16px;
            min-width: 40px;
            text-align: center;
        }
    `,

    defaults: { step: 1 },

    // this === окно
    create(initial = 0) {
        const div = document.createElement('div');
        div.className = 'myapp-counter';

        const valueEl = document.createElement('span');
        valueEl.className = 'myapp-counter__value';
        valueEl.textContent = String(initial);

        const minus = this.ui.button({
            label: '−',
            onClick: () => {
                const cur = parseInt(valueEl.textContent, 10);
                valueEl.textContent = String(cur - this.myapp.counter.defaults.step);
            }
        });

        const plus = this.ui.button({
            label: '+',
            onClick: () => {
                const cur = parseInt(valueEl.textContent, 10);
                valueEl.textContent = String(cur + this.myapp.counter.defaults.step);
            }
        });

        div.appendChild(minus);
        div.appendChild(valueEl);
        div.appendChild(plus);

        return div;
    },

    getValue(counterEl) {
        return parseInt(counterEl.querySelector('.myapp-counter__value').textContent, 10);
    },

    setValue(counterEl, value) {
        counterEl.querySelector('.myapp-counter__value').textContent = String(value);
    }
});
Использование:

js
const counter = this.myapp.counter(10);
el.appendChild(counter);
this.myapp.counter.setValue(counter, 42);
10.5. Правила
Правило	Почему
create(...) — главный метод	this.cat.name(...) вызывает его
Остальные методы публичные, this = окно	Доступ к this.data, this.save(), this.notify()
Приватные — префикс _	Не попадут в Proxy
css — инжектится автоматически	Один раз при регистрации
Любые поля — через this.cat.name.field	defaults, strings, svg, ...
Компонент может использовать другой	this.ui.button(...) внутри create
11. Меню и шапка окна
11.1. Из чего состоит шапка
Слева направо:

Иконка окна.

Заголовок (title).

headerItems из static get menu() — твои кастомные кнопки, dropdown, badge.

Hard-кнопки ядра (всегда): 📊 data-dropdown, change-type (⧉), layout (только если окон >1), minimize, fullscreen, close.

Hard-кнопки не трогаются из окна. Это базовый минимум.

11.2. Триггеры из headerItems
Простой вариант — type: 'button' или type: 'dropdown'. Сложный — render(ctx).

11.3. Кастомный тип headerItem
js
if (window.RenderWindow && !window.RenderWindow.getHeaderItemTypes().includes('badge')) {
    window.RenderWindow.registerHeaderItemType('badge', (desc, ctx) => {
        const el = document.createElement('span');
        el.textContent = desc.text || '•';
        el.addEventListener('click', () => {
            ctx.renderWindow._emit('menu-action', {
                windowId: ctx.renderWindow.id,
                action: desc.action || 'badge-click',
                value: desc.value || '',
                payload: desc.payload || null,
                item: { ...desc, type: 'badge' }
            });
        });
        return el;
    });
}
Доступно в headerItems как type: 'badge'.

11.4. ContextMenu — свой, через ui.contextMenu
Ядро больше не рисует контекстное меню автоматически. Окно делает так:

js
buildContent(el) {
    // ...
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showContextMenu(e.clientX, e.clientY);
    });
}

_showContextMenu(clientX, clientY) {
    const items = [
        { icon: 'icon-plus', label: 'Add', shortcut: 'Ctrl+N', onClick: () => this.addItem() },
        { icon: 'icon-copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => this.copyItem() },
        { divider: true },
        { icon: 'icon-trash', label: 'Delete', danger: true, shortcut: 'Del', onClick: () => this.deleteItem() }
    ];

    this.ui.contextMenu({
        items,
        x: clientX,
        y: clientY,
        width: 240
    });
}
Меню автоматически:

закрывает все другие открытые меню (ui.contextMenu, ui.listPanel, ui.categoryPanel, .data-dropdown, .menu-dropdown, ...);

закрывается при ЛКМ вне, Esc, resize, scroll (кроме scroll внутри себя);

поддерживает submenu, shortcut, header, divider, danger, disabled, searchable;

keyboard-nav: ↑↓, Enter, Esc.

Опции ui.contextMenu:

js
this.ui.contextMenu({
    items: [
        { header: 'Заголовок секции' },
        { icon: 'icon-save', label: 'Сохранить', shortcut: 'Ctrl+S', onClick: () => {} },
        { divider: true },
        {
            icon: 'icon-more', label: 'Подменю', submenu: [
                { label: 'A', onClick: () => {} },
                { label: 'B', onClick: () => {} }
            ]
        },
        { icon: 'icon-trash', label: 'Удалить', danger: true, disabled: false, onClick: () => {} }
    ],
    x: clientX,
    y: clientY,
    width: 240,
    searchable: false,
    onClose: null
});
11.5. ui.listPanel — плоский список (для dropdown)
js
this._myPanel = this.ui.listPanel({
    label: 'Пресеты',
    icon: 'icon-bookmark',
    items: [
        { label: 'Закрытый ящик', description: 'динамик → ящик', onClick: () => {} },
        { label: 'Фазоинвертор', onClick: () => {} }
    ]
});
// this._myPanel — это триггер. Вставляй его в headerItems через render().
11.6. ui.categoryPanel — список с категориями
js
this._myPanel = this.ui.categoryPanel({
    label: 'Add',
    icon: 'icon-plus',
    categories: [
        { name: 'Излучатели', icon: 'icon-speaker', items: [
            { label: 'Speaker 45Hz', onClick: () => {} }
        ]},
        { name: 'Оформление', icon: 'icon-box', items: [
            { label: 'Box 30L', onClick: () => {} }
        ]}
    ],
    footerItems: [
        { divider: true },
        { label: 'Управление', danger: true, onClick: () => {} }
    ]
});
11.7. ui.modal — модалка с Promise
js
const result = await this.ui.modal({
    title: 'Применить пресет',
    message: 'Как применить?',
    icon: 'icon-warning',
    size: 'sm',              // 'sm' | 'md' | 'lg' | 'xl'
    variant: 'default',      // 'default' | 'danger' | 'success'
    buttons: [
        { id: 'replace', label: 'Заменить', variant: 'danger' },
        { id: 'merge',   label: 'Добавить', variant: 'primary' },
        { id: 'cancel',  label: 'Отмена',   variant: 'ghost' }
    ]
});

if (result === 'replace') { /* ... */ }
Опции:

content — HTMLElement (тело).

body: (bodyEl) => void — колбэк наполнения.

closable — крестик.

closeOnBackdrop, closeOnEsc.

onOpen(dialog, body), onClose(buttonId).

11.8. ui.confirm — обёртка над modal
js
const ok = await this.ui.confirm({
    title: 'Удалить?',
    message: 'Действие необратимо.',
    icon: 'icon-warning',
    variant: 'danger'
});
if (ok === 'ok') { /* ... */ }
11.9. ui.inlineEditor — инлайн-редактор на canvas
js
this.ui.inlineEditor({
    parent: this._canvas.parentElement,
    rect: { x: 100, y: 100, w: 120, h: 22 },
    type: 'number',
    value: 42,
    onCommit: (v) => { /* ... */ },
    onCancel: () => { /* ... */ }
});
Enter — commit. Esc — cancel. Blur — commit.

12. Поток данных
text
ПОЛЬЗОВАТЕЛЬ
   ↓
ОКНО (this)
   логика → this.data.push(...) → this.save()
   ↓
DataBus
   slot.data = deepCopy(...) → notify подписчиков
   ↓
BaseWindow._onSlotUpdate (все окна слота)
   → instance.onDataUpdate(payload)
   → this.data = payload.data
   → this.onData(payload)
   ↓
ОКНО
   _renderItems() → DOM
Параллельно: ProjectManager (автосейв 30 сек) → DataBus.exportSlots() + LayoutManager.getProjectData() → .lsp.

Связь между окнами:

text
Окно A → sendToType('ch', data) → MessageBus → onMessage у Окна B
13. Отладка
13.1. Команды в консоли
js
// Все окна
window.layoutManager.getWindows()

// Видимые / свёрнутые
window.layoutManager.getVisibleWindows()
window.layoutManager.getMinimizedWindows()

// Инстанс
const bw = window.layoutManager.getInstance('5');
const inst = bw.getRealInstance();

inst.data
inst.metadata
inst.uiState
inst.getSlotId()

// Слоты
window.dataBus.getStats()
window.dataBus.getSlotData('example-1')

// Типы
window.__registry.getAllTypes()

// ExtendedAPI
window.ExtendedAPI.getRegistry()
window.ExtendedAPI.listCategories()
window.ExtendedAPI.listComponents('ui')
window.ExtendedAPI.hasComponent('ui', 'button')

// MessageBus
window.messageBus.getStats()
window.messageBus.getHistory('my-channel')

// История
window.historyManager.getHistory()
window.historyManager.getIndex()
13.2. Типичные ошибки
Симптом	Причина
this.ui is undefined	ExtendedAPI не загружен. Проверь консоль: [PluginAPI] ✅ UserAPI.js loaded.
Cannot read properties of undefined (reading 'dom')	this.utils не установлен — ExtendedAPI не загружен.
registerComponent is not a function	ExtendedAPIInjector.js не подключён в index.html, или UserAPI.js грузится до инжектора.
Cannot read properties of null (reading 'X') в headerItems.render()	render() вызывается до _ensureFields(). Защити: if (!inst._fieldsReady) return document.createComment('not-ready');
action "clearAll" not found	Опечатка в menu.headerItems[].action или метода нет.
onDrop не вызывается	Не объявлен static dropTarget или onDrop. Или файлы не прошли фильтр.
Свёрнутое окно не рендерит	Норма. DOM скрыт. Рендер делай в onVisibilityChange(true).
Данные не сохраняются	Забыл this.save().
Цикл onData → save → onData	Внутри onData нельзя менять data и вызывать save().
13.3. Логи при загрузке (норма)
text
[HistoryManager] Registered globally v3.3.0
[RenderWindow] Registered globally v7.0.1
[BaseWindow] Registered globally v8.0.2
[ExtendedAPIInjector] Registered globally v1.0.1
[PluginAPI] Registered globally v1.0.1
[BaseWindowInstance] Registered globally v2.3.0
[DataBus] Registered globally v4.2.1
[MessageBus] Registered globally v2.4.0
[ProjectManager] Registered globally v4.2.0
[WindowRegistry] Registered globally v6.0.1
[PluginSystem] Registered globally v5.9.1
[LayoutManager] Registered globally v6.1.1
[AppState] Registered globally v5.0.0
[HotkeyRegistry] Registered globally v2.3.0
[SettingsModal] Registered globally v10.0.0

[PluginSystem] 🔍 Scanning for plugins...
[PluginAPI] ✅ UserAPI.js loaded (N categories, M components)
[ExtendedAPIInjector] ✅ registerComponent: "ui.button" ...
[PluginSystem] 📂 Scanning window folder: window/
[PluginSystem] 📄 Loading window: MyWindow.js
[WindowRegistry] ✅ Registered from class: "my-window"
13.4. Полный сброс
js
localStorage.clear();
location.reload();
Удалит сохранённый проект, профиль, хоткеи, manifest override.

📌 Мини-шпаргалка
js
class MyWindow extends window.BaseWindowInstance {
    static get meta()       { return { id: 'my-window', name: 'My', icon: 'icon-x', group: 'Group' }; }
    static get menu()       { return { headerItems: [...] }; }
    static get hotkeys()    { return { 'Ctrl+N': { label: 'New', action: 'newItem' } }; }
    static get channels()   { return ['my-channel']; }
    static get dropTarget() { return { acceptExtensions: '.json' }; }

    _ensureFields() {
        if (this._fieldsReady) return;
        // поля — здесь
        this._fieldsReady = true;
    }

    buildContent(el) {
        this._ensureFields();
        el.appendChild(this.ui.button({ label: 'Hi', onClick: () => this.hi() }));
    }

    onReady()                  {}
    onData(payload)            {}
    onDrop(files, meta)        { return true; }
    onDragEnter(meta)          {}
    onDragLeave()              {}
    onMessage(senderId, ch, d) {}
    onHeaderItemClick(desc, payload) { return false; }
    onThemeChange(theme)       {}
    onFocus()                  {}
    onBlur()                   {}
    onResize(w, h)             {}
    onVisibilityChange(v)      {}
    onSlotChange(slotId)       {}
    onBeforeDestroy()          {}

    hi() { this.notify('Hi', 'Клик!', 'success'); }

    onImport(parsed) { return false; }
    onExport()       { return null; }
}

window.MyWindow = MyWindow;
js
// Внутри окна (this.*)
this.data / this.metadata / this.uiState
this.save()
this.notify(title, msg, type)
this.recordHistory(label)
this.sendToType(ch, data, type)
this.sendMessage(ch, data, targetId)
this.sendToSlot(ch, data, slotId)
this.subscribeToMessage(ch, cb)
this.request(ch, data, targetId, opts)
this.onRequest(ch, handler)
this.makeDraggable(el, { type, getPayload })
this.captureKeyboard() / this.releaseKeyboard()
this.findWindowByType(typeId) / this.findWindowsByType(typeId)
this.isVisible() / this.isFocused()
this.getId() / getType() / getSlotId() / getTitle() / getIcon()
this.getBaseWindow() / hasBaseWindow()
this.attachTo(slotId) / createEmptySlot()
this.minimize() / setFullscreen() / exitFullscreen()
this.getHeaderItems() / setHeaderItems() / addHeaderItem() / removeHeaderItem() / refreshHeaderItems()
this.escapeHtml(s)
this.getRoot()

// ExtendedAPI
this.ui.button({ label, icon, variant, onClick, disabled })
this.ui.input({ value, placeholder, type, onChange })
this.ui.block({ title, children })
this.ui.text({ text, variant, tag })
this.ui.icon.svg(id, size, color)
this.ui.contextMenu({ items, x, y })
this.ui.modal({ title, message, buttons })     // → Promise<buttonId>
this.ui.confirm({ title, message })            // → Promise<buttonId>
this.ui.inlineEditor({ parent, rect, type, value, onCommit })
this.ui.listPanel({ label, items })
this.ui.categoryPanel({ label, categories })
this.utils.dom.el(tag, props, children)
this.utils.dom.clear(el)
this.utils.dom.on(el, event, handler)
this.utils.file.saveJSON(name, data)
this.utils.file.openJSON(cb, accept)
this.i18n.ru.t(key, params)
🎓 Что дальше
UI-примитивы — добавляй свои компоненты в UserAPI.js (таблицы, деревья, модалки).

Серверная синхронизация — окно-коннектор с WebSocket + RPC.

Realtime — captureKeyboard + [data-capture-keyboard].

Большие данные — ArrayBuffer не копируется (DataBus v4.2.1).

Свои контекстные меню — ui.contextMenu.

Свои модалки — ui.modal.

LSYSTEM Core v2.0.0 · Документация актуальна на текущую версию ядра.