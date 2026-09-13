📚 Документация LSYSTEM Core
Полный справочник для разработчиков окон и ExtendedAPI-компонентов.

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

Поток данных в системе

Отладка и типичные ошибки

1. Быстрый старт
1.1. Создать файл окна
window/MyWindow.js:

js
class MyWindow extends BaseWindowInstance {

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
}
1.2. Зарегистрировать в window/window.json
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

Где лежат ядровые файлы:

text
core/
├── API/
│   ├── BaseWindowInstance.js   ← твой базовый класс
│   ├── ExtendedAPIInjector.js  ← движок ExtendedAPI
│   ├── PluginAPI.js            ← загрузчик UserAPI.js
│   └── UserAPI.js              ← сборник компонентов (ui.*, utils.*)
├── BaseWindow.js               ← низкоуровневая обёртка (обычно не трогаешь)
├── RenderWindow.js             ← DOM-движок окна (не трогаешь)
├── LayoutManager.js            ← раскладка окон
├── DataBus.js                  ← слоты
├── MessageBus.js               ← связь между окнами
├── ProjectManager.js           ← сохранение проекта
├── PluginSystem.js             ← загрузчик окон и API
├── WindowRegistry.js           ← реестр типов
└── ...
2. Жизненный цикл окна
Порядок вызовов:

text
1. new MyWindow(container, windowData, options)
   ├─ this._buildRoot()          → создан this._root, this._content
   ├─ this._setupChannels()      → подписки на static channels
   └─ this.buildContent(_content) → твой DOM

2. onBaseWindowAttached(bw)
   ├─ _registerDropTarget()      → если есть static dropTarget
   ├─ _registerMenuDragSources() → drag-source на кнопках шапки
   ├─ _registerHotkeys()         → static hotkeys
   └─ _loadFromSlot()            → данные из слота

3. onReady()                     → финальный хук (DOM готов, данные загружены)

4. onData(payload)               → при каждом обновлении слота

5. onMessage(senderId, ch, data) → при сообщении из MessageBus

6. onDrop(files, meta)           → при drop
   onDragEnter(meta)             → при наведении drag
   onDragLeave()                 → при уходе

7. onTheme(theme)                → смена темы
   onFocus() / onBlur()          → фокус
   onResize(w, h)                → размер изменился
   onVisibility(visible)         → minimize/restore
   onSlotChanged(slotId)         → перепривязка к слоту

8. onBeforeDestroy()             → ПЕРЕД очисткой
   destroy()                     → отписки, удаление DOM
Важно: свёрнутое окно (minimize) не уничтожается. Инстанс жив, подписки работают, WebSocket/таймеры не глохнут. Только DOM невидим.

3. Static-конфиг
3.1. static get meta()
Обязательное поле. Определяет тип окна.

js
static get meta() {
    return {
        id: 'my-window',              // ОБЯЗАТЕЛЬНО. Уникальный ID типа.
        name: 'My Window',            // Отображаемое имя.
        icon: 'icon-example',         // ID иконки из assets/svg.html.
        group: 'Мои окна',            // Группа в меню Window.
        description: 'Что-то',        // Описание.
        category: 'other',            // Категория (не критично).
        defaultSize: { width: 500, height: 400 },
        minSize: { width: 300, height: 200 },
        maxWindows: 4,                // Макс. одновременно открытых.
        priority: 999,                // Сортировка в реестре (меньше = выше).
        metadata: { version: '1.0.0' }
    };
}
3.2. static get menu()
Опциональное. Описывает шапку, контекстное меню, dropdown.

js
static get menu() {
    return {
        // Кнопки в шапке (справа, до системных)
        headerButtons: [
            { icon: 'icon-plus',  label: 'Add',   action: 'addItem' },
            { icon: 'icon-clear', label: 'Clear', action: 'clearAll', danger: true }
        ],

        // Правый клик на окне
        contextMenu: [
            { icon: 'icon-plus',  label: 'Добавить', action: 'addItem' },
            { divider: true },
            { icon: 'icon-clear', label: 'Очистить', action: 'clearAll', danger: true }
        ],

        // Кнопка ☰
        dropdownMenu: {
            icon: 'icon-menu',
            label: 'Действия',
            items: [
                { header: 'Вид' },
                { label: 'Grid', icon: 'icon-layout', action: 'viewGrid' },
                { label: 'List', icon: 'icon-menu',   action: 'viewList' },
                { divider: true },
                { label: 'Очистить', icon: 'icon-clear', action: 'clearAll', danger: true }
            ]
        }
    };
}
Опции пункта меню:

Поле	Что	Пример
icon	Иконка из SVG-спрайта (icon-*) или эмодзи	'icon-save', '📁'
label	Текст	'Сохранить'
action	Строка — имя метода класса	'saveItem'
danger	Красный цвет	true
divider	Горизонтальная линия	{ divider: true }
header	Заголовок секции	{ header: 'Вид' }
callback	Legacy — inline-функция (лучше action)	(bw) => ...
dragSource	Сделать пункт drag-источником	{ type, getPayload }
Про action: action: 'clearAll' → при клике вызывается this.clearAll() в окне. Если метод не существует — warn.

3.3. static get hotkeys()
Опциональное. Хоткеи, работающие когда окно в фокусе.

js
static get hotkeys() {
    return {
        'Ctrl+N': { label: 'Добавить', action: 'addItem' },
        'Ctrl+L': { label: 'Очистить', action: 'clearAll' },
        'Ctrl+G': { label: 'Grid view', action: 'viewGrid' }
    };
}
Формат: 'Модификатор+Клавиша': { label, action }.

Поддерживаемые модификаторы: Ctrl, Shift, Alt, Meta (⌘).

Клавиши: A-Z, 0-9, F1-F12, Escape, Enter, Space, Arrow*, Tab, Backspace, Delete, ., ,, -, =, [, ], /, \, ;, ', `.

Пользователь может переопределить хоткей в настройках (SettingsModal → Горячие клавиши).

3.4. static get channels()
Опциональное. Каналы MessageBus, которые слушает окно.

js
static get channels() {
    return ['example-chat', 'example-sync'];
}
При получении сообщения вызывается onMessage(senderId, channel, data).

3.5. static get dropTarget()
Опциональное. Что окно принимает через drag&drop.

js
static get dropTarget() {
    return {
        acceptExtensions: '.json,.lsw,.txt',   // по расширению
        accept: ['image/*', 'application/json'], // по MIME
        multiple: true                          // можно несколько файлов
    };
}
Если dropTarget задан и есть метод onDrop → окно становится drop-target.

Фильтрация:

Если acceptExtensions — проверяем по имени файла.

Если accept — по MIME-типу (поддерживает wildcards image/*).

Если оба заданы — файл проходит, если соответствует любому.

Если ничего не задано — пропускаем всё.

4. Методы окна
4.1. Хелперы для контента
js
// Получить корневой DOM-элемент окна (весь контент)
this.getRoot()

// Панель контента (то, что в buildContent(el))
this._content

// Сохранить в слот (после изменений this.data / this.metadata / this.uiState)
this.save()

// Уведомление пользователю
this.notify('Заголовок', 'Текст', 'info')   // 'info' | 'success' | 'warning' | 'error'

// Экранирование HTML
const safe = this.escapeHtml(userInput)
4.2. ExtendedAPI (this.ui.*, this.utils.*, this.i18n.*)
См. раздел 10.

4.3. Состояние
js
// Видимо ли окно (не свёрнуто, не закрыто)
this.isVisible()   // → boolean

// В фокусе ли окно
this.isFocused()   // → boolean

// ID окна, тип, slotId
this.id
this.type
this.slotId
4.4. Работа с другими окнами
js
// Найти окно по типу (первое попавшееся, включая свёрнутые)
const w = this.findWindowByType('db-connector');
// w = { id, type, slotId, title, icon } или null

// Найти все окна по типу
const list = this.findWindowsByType('example');
// → [{ id, type, slotId, title, icon }, ...]
5. Хуки
Все хуки опциональны. Если не переопределён — ничего не происходит.

5.1. onReady()
Когда: после buildContent, после подписок, после загрузки данных из слота.

Зачем: финальная инициализация, отрисовка на основе this.data.

js
onReady() {
    this._renderItems();
}
5.2. onData(payload)
Когда: слот обновился (в том числе при загрузке проекта).

Payload:

js
{
    data: ...,      // ← уже в this.data
    metadata: ...,  // ← уже в this.metadata
    uiState: ...    // ← уже в this.uiState
}
Зачем: перерисовать контент на новых данных.

js
onData(payload) {
    this._renderItems();
}
⚠️ Guard: если this._isUpdating === true — вызов не произойдёт. Внутри onData не надо менять this.data и вызывать save() — это создаст цикл.

5.3. onDrop(files, meta)
Когда: пользователь отпустил файл или drag-элемент над окном.

Параметры:

files — массив File (для внешних файлов) или [] (для внутреннего drag).

meta — { source, ... }.

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
Возврат: true — принято, false — отклонено (появится уведомление).

js
onDrop(files, meta) {
    if (meta.source === 'internal') {
        if (meta.channel === 'example-item') {
            this.addItem(meta.payload.name, meta.payload.value);
            return true;
        }
        return false;
    }
    // Files
    return this._handleFiles(files);
}
5.4. onDragEnter(meta) / onDragLeave()
Когда: drag над окном вошёл/ушёл. Не блокирующие — только уведомление.

js
onDragEnter(meta) {
    this._content.style.outline = '2px solid var(--accent-red)';
}
onDragLeave() {
    this._content.style.outline = '';
}
5.5. onMessage(senderId, channel, data)
Когда: пришло сообщение по одному из static channels.

js
onMessage(senderId, channel, data) {
    if (channel === 'example-chat') {
        if (data.command === 'add') this.addItem();
    }
}
5.6. onTheme(theme), onFocus(), onBlur()
js
onTheme(theme) { /* theme = 'dark' | 'light' */ }
onFocus() {}
onBlur() {}
5.7. onResize(width, height)
Когда: окно изменило размер.

js
onResize(w, h) {
    this._redrawCanvas(w, h);
}
5.8. onVisibility(visible)
Когда: окно свернули (false) или развернули (true).

⚠️ Свёрнутое окно живо — onVisibility(false) вызывается, но instance работает. Рендер в onData/onMessage стоит делать только если this.isVisible().

js
onVisibility(visible) {
    if (visible) this._renderItems();
}
5.9. onSlotChanged(slotId)
Когда: окно перепривязали к другому слоту (например, через data-dropdown → «Привязать»).

js
onSlotChanged(slotId) {
    this.notify('Слот', 'Переключен на ' + slotId, 'info');
}
5.10. onBeforeDestroy()
Когда: ПЕРЕД отписками и удалением DOM.

Зачем: остановить свои ресурсы — RAF, WebSocket, таймеры, AudioContext.

js
onBeforeDestroy() {
    if (this._ws) this._ws.close();
    if (this._raf) cancelAnimationFrame(this._raf);
    clearInterval(this._timer);
}
6. Данные и слоты
6.1. Что такое слот
Слот — это контейнер данных. У слота:

id — уникальный (например, example-1).

type — к какому типу окна привязан.

data — пользовательские данные.

metadata — метаданные (title, version, modified).

uiState — состояние UI (scroll, viewMode).

attachedWindows — какие окна к нему привязаны.

Один слот = один набор данных. Два окна одного типа могут смотреть в один слот — тогда они синхронизированы.

Лимиты:

Максимум 4 активных слота на тип.

Максимум 4 архивных на тип.

Максимум 16 архивных всего.

Жизненный цикл слота:

Окно создано → слот создан или переиспользован.

Окно закрыто → слот архивируется (данные сохраняются).

Открывается новое окно того же типа → слот разворачивается из архива.

6.2. this.data, this.metadata, this.uiState
Прямые поля. Синхронизируются со слотом.

js
// Чтение
const items = this.data?.items || [];

// Изменение (не забудь save!)
this.data.items.push({ name: 'X', value: 'Y' });
this.save();    // ← обязательно

// UI-состояние
this.uiState.viewMode = 'grid';
this.save();
6.3. this.save()
Сохраняет this.data + this.metadata + this.uiState в слот.

js
addItem() {
    this.data.items.push({ name: 'X' });
    this.save();    // ← данные ушли в слот
    this._renderItems();
}
⚠️ save() НЕ сохраняет на диск. Только в слот. На диск сохраняет ProjectManager (автосейв каждые 30 сек или Ctrl+S).

6.4. Data-dropdown (кнопка 📊 в шапке)
У каждого окна есть кнопка 📊. Она даёт:

Импорт — из файла .json/.lsw/.txt. Вызывает onImport(parsed).

Экспорт — в файл. Вызывает onExport() → получает объект/строку.

Новый слот — создать пустой слот, отвязаться от текущего.

Привязать к слоту — переключиться на другой существующий слот.

Пункты Импорт/Экспорт скрыты, если ты не переопределил соответствующие методы в классе.

6.5. onImport(parsed) / onExport()
js
onImport(parsed) {
    // parsed — распарсенный JSON (объект) или строка (если не JSON)
    if (Array.isArray(parsed)) {
        this.data = { items: parsed };
    } else if (parsed.items) {
        this.data = parsed;
    } else {
        return false;   // формат не подходит
    }
    this.save();
    this._renderItems();
    return true;    // успех
}

onExport() {
    return {
        type: this.type,
        slotId: this.slotId,
        items: this.data?.items || []
    };
}
6.6. Ручная работа со слотами
Только если нужно:

js
// Перепривязаться к существующему слоту
this.attachTo('example-2');

// Создать пустой слот
this.createEmptySlot();

// ID текущего слота
const sid = this.slotId;   // 'example-3'
Автоматика: слоты привязываются при создании окна через LayoutManager.addWindow. Ядро само выбирает свободный или архивный.

7. MessageBus и RPC
7.1. Отправка broadcast
js
// Отправить всем окнам указанного типа (кроме себя)
this.sendToType('channel-name', { foo: 'bar' }, 'target-type');

// Отправить всем окнам своего типа
this.sendToType('channel-name', { foo: 'bar' });   // typeId = this.type

// Отправить конкретному окну по id
this.sendMessage('channel-name', { foo: 'bar' }, '5');

// Отправить всем, кто слушает канал, включая свёрнутые
this.sendToSlot('channel-name', { foo: 'bar' }, 'slot-id');
Кто получает: окна, у которых static channels содержит 'channel-name'. Для них вызывается onMessage(senderId, 'channel-name', data).

7.2. Подписка вручную
Если канал не в static channels:

js
onReady() {
    this._unsub = this.subscribeToMessage('custom-channel', (senderId, data) => {
        console.log('got', data, 'from', senderId);
    });
}

onBeforeDestroy() {
    if (this._unsub) this._unsub();
}
7.3. RPC (запрос → ответ)
Клиент (спрашивает):

js
async loadTable(table) {
    const connector = this.findWindowByType('db-connector');
    if (!connector) return;

    try {
        const result = await this.request(
            'db-query',                       // канал
            { sql: `SELECT * FROM ${table}` },// payload
            connector.id,                     // targetId
            { timeout: 15000 }                // опции
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
Сервер (отвечает):

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
Что внутри:

request шлёт на канал db-query:request с { requestId, ...data }.

onRequest подписывается на этот канал, вызывает handler.

Если handler возвращает Promise — ждём resolve.

Resolve → respond, throw → respondError.

request подписывается на db-query:response, фильтрует по requestId.

Ошибки:

err.code === 'RPC_TIMEOUT' — не дождались ответа.

err.code === 'RPC_ERROR' — сервер вернул ошибку (в err.originalError).

err.code === 'RPC_BUS_DESTROYED' — MessageBus уничтожен.

8. Drag & Drop
8.1. Окно как drop-target
Объяви static dropTarget + onDrop — ядро само всё сделает:

js
static get dropTarget() {
    return { acceptExtensions: '.json,.txt', multiple: true };
}

onDrop(files, meta) {
    // files — массив File
    // meta.source === 'files'
    return true;
}
CSS для подсветки: .ls-drop-hover на контейнере окна.

8.2. Окно как drag-source — обычные DOM-элементы
Регистрируй каждый элемент через makeDraggable:

js
const card = document.createElement('div');
card.textContent = 'Меня можно тащить';
this._content.appendChild(card);

this.makeDraggable(card, {
    type: 'my-item',                          // channel
    getPayload: () => ({ name: 'X' }),        // payload
    ghostHTML: '<div>👋 X</div>'              // DOM для курсора
});
При отпускании на другом окне вызовется onDrop([], meta) у получателя, где:

js
meta = {
    source: 'internal',
    sourceWindowId: '5',
    sourceType: 'my-window',
    channel: 'my-item',
    payload: { name: 'X' }
}
8.3. Drag-source из кнопки меню
В static menu.headerButtons:

js
static get menu() {
    return {
        headerButtons: [
            {
                icon: 'icon-clear',
                label: 'Clear',
                action: 'clearAll',           // клик тоже работает
                dragSource: {
                    type: 'clear-command',    // channel
                    getPayload: () => ({ command: 'clear' }),
                    ghostHTML: '<div>🗑 Clear</div>'
                }
            }
        ]
    };
}
Ядро само:

Находит кнопку по data-action.

Регистрирует её как drag-source.

Отписка — в destroy().

При drop на другом окне:

js
onDrop(files, meta) {
    if (meta.source === 'internal' && meta.channel === 'clear-command') {
        this.clearAll();
        return true;
    }
    return false;
}
8.4. Drop на себя
Не работает — _findDropTargetAtPoint исключает свой id. Если нужно — обрабатывай через клик, не drag.

9. Хоткеи и клавиатура
9.1. Обычные хоткеи
static hotkeys + action:

js
static get hotkeys() {
    return {
        'Ctrl+S': { label: 'Сохранить', action: 'saveItem' },
        'Escape': { label: 'Отмена',   action: 'cancelEdit' }
    };
}
Пользователь может переопределить — SettingsModal → «Горячие клавиши».

9.2. Захват клавиатуры (для игр, редакторов)
js
onReady() {
    this.captureKeyboard();    // ← все keydown идут ТОЛЬКО в это окно
}

onBeforeDestroy() {
    this.releaseKeyboard();
}
Как работает:

Пока захвачено — ядро игнорирует глобальные хоткеи (Ctrl+S, Ctrl+N, ...).

Все события идут в окно через зарегистрированные getHotkeys().

Escape тоже захватывается — для выхода вызывай releaseKeyboard() вручную.

Авто-release: при destroy() окна.

9.3. Избирательный захват (canvas)
Если нужно перехватывать клавиатуру только когда фокус в canvas — используй атрибут:

js
buildContent(el) {
    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('data-capture-keyboard', '');   // ←
    this._canvas.tabIndex = 0;
    el.appendChild(this._canvas);
}
Как работает:

Ядро проверяет document.activeElement.closest('[data-capture-keyboard]').

Если активный элемент внутри такого контейнера — глобальные хоткеи не срабатывают (событие пропускается).

Окно может само слушать keydown на canvas.

Отличие от captureKeyboard():

captureKeyboard() — все клавиши идут в окно.

[data-capture-keyboard] — только когда фокус в элементе.

10. ExtendedAPI
10.1. Что это
ExtendedAPI — реестр компонентов, доступных в окнах. Все компоненты лежат в core/API/UserAPI.js и доступны как this.<category>.<name>.

Встроенные компоненты:

Путь	Что
this.ui.button(opts)	Кнопка
this.ui.input(opts)	Текстовый input
this.ui.block(opts)	Блок с заголовком
this.ui.text(opts)	Текст
this.utils.dom.el(tag, props, children)	Создать DOM-элемент
this.utils.dom.clear(el)	Очистить элемент
this.utils.dom.on(el, evt, cb)	Навесить handler (возвращает unsub)
this.i18n.ru.t(key, params)	Перевод
this.i18n.ru.add(key, val)	Добавить перевод
10.2. Использование
js
buildContent(el) {
    // Кнопка
    el.appendChild(this.ui.button({
        label: 'Сохранить',
        icon: 'icon-save',
        variant: 'primary',     // 'default' | 'primary' | 'ghost' | 'danger'
        onClick: () => this.save()
    }));

    // Блок с заголовком
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
10.3. Как написать свой компонент
Открой core/API/UserAPI.js и добавь в конец:

js
registerComponent('myapp', 'counter', {
    version: '1.0.0',

    // CSS автоматически инжектится в <head>
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

    // Данные компонента
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

    // Публичные методы — вызываются как this.myapp.counter.getValue(el)
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

// Позже
this.myapp.counter.setValue(counter, 42);
const v = this.myapp.counter.getValue(counter);
10.4. Правила компонента
Правило	Почему
create(...) — главный метод	При вызове this.cat.name(...) вызывается он
Остальные методы — публичные, с this = окно	Ты можешь обращаться к this.data, this.save(), this.notify()
Приватные методы — префикс _	Не попадут в Proxy
css — инжектится автоматически	Один раз, при регистрации
Любые другие поля — доступны через this.cat.name.field	defaults, strings, svg, ...
Компонент может использовать другой компонент	this.ui.button(...) внутри create
version — опционально	Для отладки
10.5. Как добавить свой компонент в работу
Открыть core/API/UserAPI.js.

Добавить registerComponent(...) в конце файла.

Перезагрузить страницу.

Проверить в консоли: window.ExtendedAPI.getRegistry().

Или через PluginSystem.reload() — но это вызовет перезагрузку всех окон.

10.6. Отладка ExtendedAPI
js
// Все категории
window.ExtendedAPI.listCategories()
// → ['ui', 'utils', 'i18n', 'myapp']

// Компоненты категории
window.ExtendedAPI.listComponents('ui')
// → ['button', 'input', 'block', 'text']

// Есть ли?
window.ExtendedAPI.hasComponent('ui', 'button')   // true
window.ExtendedAPI.hasCategory('myapp')           // true

// Версия
window.ExtendedAPI.getComponentVersion('ui', 'button')   // '1.0.0'

// Полный реестр
window.ExtendedAPI.getRegistry()
// → { ui: ['button', 'input', 'block', 'text'], ... }
11. Поток данных
text
┌─────────────────────────────────────────────────────────────┐
│                     ПОЛЬЗОВАТЕЛЬ                             │
│  клик, ввод, drag, хоткей                                   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                       ОКНО (this)                            │
│  логика → this.data.push(...) → this.save()                 │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                      DataBus                                 │
│  slot.data = deepCopy(...)                                   │
│  → notify подписчиков                                        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│           BaseWindow._onSlotUpdate (все окна слота)          │
│  → instance.onDataUpdate(payload)                            │
│  → this.data = payload.data                                  │
│  → this.onData(payload)                                      │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     ОКНО                                     │
│  _renderItems() → DOM обновился                              │
└─────────────────────────────────────────────────────────────┘
Параллельно:

text
┌───────────────────────────────────────────────┐
│           ProjectManager (автосейв)           │
│  каждые 30 сек или Ctrl+S:                    │
│  → DataBus.exportSlots()                      │
│  → LayoutManager.getProjectData()             │
│  → JSON.stringify                             │
│  → download .lsp + localStorage               │
└───────────────────────────────────────────────┘
Связь между окнами:

text
Окно A                    Окно B
  ↓                         ↑
  sendToType('ch', data)    │
  ────────► MessageBus ────►│
                            │
                        onMessage()
12. Отладка
12.1. Полезные команды в консоли
js
// Все окна (видимые + свёрнутые)
window.layoutManager.getWindows()

// Видимые окна
window.layoutManager.getVisibleWindows()

// Свёрнутые окна
window.layoutManager.getMinimizedWindows()

// Инстанс окна по id
const bw = window.layoutManager.getInstance('5');   // BaseWindow
const inst = bw.getRealInstance();                  // MyWindow

// Данные окна
inst.data
inst.metadata
inst.uiState
inst.slotId

// Все слоты
window.dataBus.getStats()

// Слот по id
window.dataBus.getSlotData('example-1')

// Типы окон
window.__registry.getAllTypes()

// ExtendedAPI
window.ExtendedAPI.getRegistry()

// MessageBus
window.messageBus.getStats()
window.messageBus.getHistory('my-channel')

// История (undo/redo)
window.historyManager.getHistory()
window.historyManager.getIndex()
12.2. Типичные ошибки
this.ui is undefined
→ ExtendedAPI не загрузился. Проверь консоль: [PluginAPI] ✅ UserAPI.js loaded.
→ Файл core/API/UserAPI.js не найден (404).

Cannot read properties of undefined (reading 'dom')
→ this.utils не установлен. То же — ExtendedAPI не загружен.

registerComponent is not a function
→ ExtendedAPIInjector.js не подключён в index.html.
→ Или UserAPI.js грузится до инжектора.

action "clearAll" not found
→ В menu.headerButtons[].action опечатка.
→ Или метод не определён в классе.

onDrop never called
→ Не объявлен static dropTarget.
→ Или не переопределён onDrop.
→ Или acceptExtensions/accept не совпали с файлами.

Свёрнутое окно не рендерит
→ Это нормально. DOM скрыт.
→ Рендер делай в onVisibility(true), когда окно вернётся.

Данные не сохраняются
→ Забыл this.save() после изменения this.data.

Цикл onData → save → onData → ...
→ Внутри onData нельзя менять this.data и вызывать save().
→ Только рендер.

12.3. Логи при загрузке (норма)
text
[HistoryManager] Registered globally v3.2.0
[RenderWindow] Registered globally v6.2.1
[BaseWindow] Registered globally v7.4.0
[ExtendedAPIInjector] Registered globally v1.0.0
[PluginAPI] Registered globally v1.0.0 (instance ready)
[BaseWindowInstance] Registered globally v1.0.2
[DataBus] Registered globally v4.2.0
[MessageBus] Registered globally v2.3.1
[ProjectManager] Registered globally v4.2.0
[WindowRegistry] Registered globally v5.2.0
[PluginSystem] Registered globally v5.8.0
[LayoutManager] Registered globally v6.1.0
[AppState] Registered globally v4.0.0
[HotkeyRegistry] Registered globally v2.2.0
[SettingsModal] Registered globally v9.0.0

[LSYSTEM] ✅ Workspace found
[SVG Sprites] Loaded

[PluginSystem] 🔍 Scanning for plugins...
[PluginAPI] ✅ UserAPI.js loaded (3 categories, 6 components)
[ExtendedAPIInjector] ✅ registerComponent: "ui.button" (3 methods) v1.0.0
... (все компоненты)

[PluginSystem] 📂 Scanning window folder: window/
[PluginSystem] 📄 Loading window: MyWindow.js
[WindowRegistry] ✅ Registered from class: "my-window"
[PluginSystem] ✅ Loaded N plugins

[LSYSTEM] ✅ Initialized v9.1.0
Если чего-то нет — ищи причину:

[PluginAPI] ✅ UserAPI.js loaded отсутствует → UserAPI.js не найден.

[ExtendedAPIInjector] ✅ registerComponent отсутствует → registerComponent не вызывается (или файл падает).

[WindowRegistry] ✅ Registered отсутствует → ошибка в конструкторе окна или в static meta.

12.4. Полный сброс
Если всё сломалось:

js
localStorage.clear();
location.reload();
Удалит:

Сохранённый проект.

Профиль.

Хоткеи.

Manifest override.

📌 Мини-шпаргалка
js
// Класс окна
class MyWindow extends BaseWindowInstance {
    static get meta()       { return { id: 'my-window', name: 'My', icon: 'icon-x', group: 'Group' }; }
    static get menu()       { return { headerButtons: [...], contextMenu: [...], dropdownMenu: {...} }; }
    static get hotkeys()    { return { 'Ctrl+N': { label: 'New', action: 'newItem' } }; }
    static get channels()   { return ['my-channel']; }
    static get dropTarget() { return { acceptExtensions: '.json' }; }

    buildContent(el) {
        el.appendChild(this.ui.button({ label: 'Hi', onClick: () => this.hi() }));
    }

    onReady()                  {}
    onData(payload)            {}
    onDrop(files, meta)        { return true; }
    onDragEnter(meta)          {}
    onDragLeave()              {}
    onMessage(senderId, ch, d) {}
    onTheme(theme)             {}
    onFocus()                  {}
    onBlur()                   {}
    onResize(w, h)             {}
    onVisibility(visible)      {}
    onSlotChanged(slotId)      {}
    onBeforeDestroy()          {}

    // Логика (вызывается через action/hotkey)
    hi() { this.notify('Hi', 'Клик!', 'success'); }

    // Импорт/экспорт (опционально)
    onImport(parsed) { return false; }
    onExport()       { return null; }
}
js
// Внутри окна (this.*)
this.data / this.metadata / this.uiState
this.save()
this.notify(title, msg, type)
this.sendToType(ch, data, type)
this.sendMessage(ch, data, targetId)
this.subscribeToMessage(ch, cb)
this.request(ch, data, targetId, opts)     // RPC
this.onRequest(ch, handler)                 // RPC-сервер
this.makeDraggable(el, { type, getPayload })
this.captureKeyboard() / this.releaseKeyboard()
this.findWindowByType(typeId)
this.findWindowsByType(typeId)
this.isVisible() / this.isFocused()
this.escapeHtml(s)
this.attachTo(slotId) / this.createEmptySlot()
this.getRoot()
this.slotId / this.id / this.type

// ExtendedAPI
this.ui.button({ label, icon, variant, onClick, disabled })
this.ui.input({ value, placeholder, type, onChange })
this.ui.block({ title, children })
this.ui.text({ text, variant, tag })
this.utils.dom.el(tag, props, children)
this.utils.dom.clear(el)
this.utils.dom.on(el, event, handler)
this.i18n.ru.t(key, params)
🎓 Что дальше
Теперь ты умеешь:

Писать окна за 5 минут.

Использовать ExtendedAPI.

Работать с слотами и MessageBus.

Расширять API своими компонентами.

Отлаживать типичные ошибки.

Куда расти:

UI-примитивы — добавляй в UserAPI.js свои компоненты (таблицы, деревья, модалки).

Серверная синхронизация — пиши окно-коннектор с WebSocket + RPC.

Realtime — для DAW/игр используй captureKeyboard + [data-capture-keyboard].

Большие данные — ArrayBuffer не копируется (DataBus v4.2.0).

Приятной разработки! 🚀

LSYSTEM Core v1.0 · Документация актуальна на текущую версию ядра.