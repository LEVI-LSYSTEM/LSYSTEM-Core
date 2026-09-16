LSYSTEM Core — Руководство разработчика окна
Версия: 2.0
Аудитория: разработчики окон и компонентов ExtendedAPI.
Охват: только то, что нужно, чтобы написать окно. Как устроено ядро — не рассказываем. Всё, что описано ниже, — публичный контракт.

1. TL;DR — как выглядит окно
js
// data/window/MyWindow.js
(function () {
    'use strict';

    class MyWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'mywindow',
                name: 'My Window',
                icon: 'icon-example',
                description: 'Короткое описание',
                group: 'Мои окна',
                category: 'custom',
                priority: 50,
                defaultSize: { width: 600, height: 400 },
                minSize: { width: 240, height: 160 },
                maxWindows: 4,
                metadata: { version: '1.0.0', author: 'you' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    { id: 'hello', type: 'button', icon: 'icon-info', label: 'Hello', action: 'greet' }
                ]
            };
        }

        static get hotkeys() {
            return {
                'Ctrl+G': { action: 'greet', label: 'Привет' }
            };
        }

        _ensureFields() {
            if (this._fieldsReady) return;
            this._count = 0;
            this._fieldsReady = true;
        }

        buildContent(el) {
            this._ensureFields();

            el.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:8px;';

            this._label = this.ui.text({ text: 'Кликов: 0', variant: 'mono' });
            el.appendChild(this._label);

            el.appendChild(this.ui.button({
                label: '+1',
                icon: 'icon-plus',
                onClick: () => this.increment()
            }));
        }

        onReady() {
            this.notify('MyWindow', 'Готово', 'success');
        }

        greet() {
            this.notify('Hello', 'Привет из MyWindow', 'success');
        }

        increment() {
            this._count++;
            this._label.textContent = 'Кликов: ' + this._count;
            this.recordHistory('Клик +1');
        }
    }

    if (typeof window !== 'undefined') window.MyWindow = MyWindow;
})();
Всё. Ядро само:

зарегистрирует окно (через static meta.id),

нарисует шапку (иконка, title, hard-кнопки data / change-type / layout / minimize / fullscreen / close),

подпишет на channels, зарегистрирует hotkeys, dropTarget,

создаст слот и синхронизирует data / metadata / uiState,

вызовет buildContent → onReady → lifecycle-хуки.

2. Жизненный цикл окна
Порядок вызовов строго определён. Запомнить один раз.

text
1. new MyWindow(container, windowData, options)
     ├─ _buildRoot()          → this._root, this._content
     ├─ _setupChannels()      → подписки на static channels
     └─ buildContent(this._content)  ← ваш DOM

2. onBaseWindowAttached(baseWindow)   ← _baseWindow присвоен извне
     ├─ _registerDropTarget()
     ├─ _registerMenuDragSources()
     ├─ _registerHotkeys()
     └─ _loadFromSlot()

3. onReady()

4. Работа:
     onData(payload)            ← данные из слота (загрузка/смена)
     onDataUpdate(payload)      ← переопределение синхронизации (редко)
     onMessage(sender, ch, data)← MessageBus
     onDrop(files, meta)        ← drag&drop файлов
     onDragEnter(meta) / onDragLeave()
     onFocus() / onBlur()
     onVisibilityChange(visible)
     onThemeChange(theme)
     onResize(w, h)
     onSlotChange(slotId)

5. Закрытие:
     onBeforeDestroy()  → destroy()  → отписки, DOM
⚠️ Критично: _baseWindow присваивается после конструктора
Внутри buildContent() нельзя обращаться к this._baseWindow.*. Используйте публичные геттеры:

js
this.getId()
this.getType()
this.getTitle()
this.getIcon()
this.getSlotId()
this.getBaseWindow()      // null до attach
this.hasBaseWindow()
⚠️ Критично: поля класса инициализируются в _ensureFields()
super() вызывает buildContent() раньше, чем выполнятся поля после super(). Поэтому все поля — через _ensureFields() в первой строке buildContent().

3. static-конфиг
Все static get опциональны, кроме meta.

3.1. static get meta() — обязательно
js
static get meta() {
    return {
        id: 'mywindow',              // уникальный, обязательный
        name: 'My Window',           // для меню Windows
        icon: 'icon-example',        // id из svg-спрайта
        description: '...',          // tooltip
        group: 'Мои окна',           // группа в меню
        category: 'custom',          // для фильтрации
        priority: 50,                // меньше = выше
        defaultSize: { width: 600, height: 400 },
        minSize:     { width: 240, height: 160 },
        maxWindows: 4,               // одновременно открытых
        metadata: { version: '1.0.0', author: 'you' },

        // allowOverride: true  — разрешить перезапись типа при reload
        // по умолчанию strict: reload не уничтожает открытые окна.
    };
}
3.2. static get menu()
js
static get menu() {
    return {
        headerItems: [ /* SOFT-элементы шапки, см. §4 */ ]
    };
}
3.3. static get hotkeys()
js
static get hotkeys() {
    return {
        'Ctrl+Shift+D': { action: 'onDemo', label: 'Демо' },
        'F5':           { action: 'onDemo', label: 'Демо (F5)' }
    };
}
action — имя метода экземпляра.

label — для UI настроек хоткеев.

Синтаксис combo: Ctrl+Shift+D, Alt+F4, F5, Escape, ArrowUp, Ctrl+,.

3.4. static get channels()
js
static get channels() {
    return ['mywindow-ping', 'mywindow-broadcast'];
}
Каждый канал подписывается на onMessage(senderId, channel, data).

3.5. static get dropTarget()
js
static get dropTarget() {
    return {
        accept: ['application/json', '.txt'],
        acceptExtensions: '.json,.txt',
        multiple: true
    };
}
Реальные обработчики — методы экземпляра onDrop / onDragEnter / onDragLeave.

3.6. static get dataMenu() — содержимое кнопки 📊
Кнопка 📊 в шапке окна — стандартный dropdown данных (Импорт / Экспорт / Новый слот / Привязать). Ты можешь настроить его под своё окно.

Три режима
1. Ничего не объявлять — сток

js
// Работает как есть: Импорт / Экспорт / ─ / Новый слот / Привязать
2. static get dataMenu() — массив или функция

js
// Полная замена
static get dataMenu() {
    return [
        { icon: 'icon-refresh', label: 'Пересчитать', action: 'recalc' },
        { divider: true },
        { icon: 'icon-clear', label: 'Сброс', action: 'resetAll', danger: true }
    ];
}

// Расширение дефолта
static get dataMenu() {
    return (defaults) => {
        const items = defaults.slice();
        items.splice(2, 0, { divider: true });
        items.splice(3, 0, { icon: 'icon-star', label: 'Моё', action: 'myAction' });
        return items;
    };
}
3. onDataMenuOpen(anchorEl, dropdownEl) — полный контроль

js
onDataMenuOpen(anchorEl, dropdownEl) {
    // Сток
    this._renderDefaultDataMenu(dropdownEl);

    // Свой разделитель + заголовок
    const hdr = document.createElement('div');
    hdr.className = 'dropdown-header';
    hdr.textContent = 'Мои действия';
    dropdownEl.appendChild(hdr);

    // Своя кнопка
    const btn = this.utils.dom.el('button', {
        className: 'dropdown-item',
        text: 'Пересчитать всё'
    });
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:7px 14px;border:none;background:transparent;color:var(--text-primary);font-size:12px;cursor:pointer;font-family:inherit;text-align:left;';
    btn.addEventListener('click', () => {
        this.recalcAll();
        this._closeDataMenu();
    });
    dropdownEl.appendChild(btn);
}
Формат пункта
js
{
    icon: 'icon-refresh',           // опционально
    label: 'Пересчитать',
    shortcut: 'Ctrl+R',             // опционально
    danger: false,                  // красный
    disabled: false,                // неактивный
    onClick: (item, ctx) => {},     // обработчик
    action: 'recalc'                // ИЛИ action
}
Спец-элементы:

js
{ divider: true }
{ header: 'Заголовок' }
Спец-action'ы ядра (переиспользуют стандартное поведение):

action	Что делает
'import'	Импорт JSON (скрыт, если нет onImport)
'export'	Экспорт JSON (скрыт, если нет onExport)
'new-slot'	Новый слот
'attach'	Submenu со слотами
Хелперы для окна
Метод	Что
this._closeDataMenu()	Закрыть data-dropdown
this._renderDefaultDataMenu(dropdownEl)	Нарисовать сток в переданный <div>
Полный пример
js
class MyWindow extends BaseWindowInstance {

    static get dataMenu() {
        return (defaults) => {
            const items = defaults.slice();
            items.splice(2, 0, { divider: true });
            items.splice(3, 0, {
                icon: 'icon-graphic',
                label: 'Отправить в Graphic',
                action: 'sendToGraphic'
            });
            return items;
        };
    }

    sendToGraphic() {
        // ...
    }
}
Результат в 📊:

text
Импорт
Экспорт
────
Отправить в Graphic   ← добавили
────
Новый слот
Привязать ►
§4.9. onDataMenuOpen(anchorEl, dropdownEl) — полный контроль над 📊
Метод вызывается вместо рендера по dataMenu / стоку. Получает:

anchorEl — кнопка 📊 (HTMLButtonElement). Может быть null при очень раннем вызове.

dropdownEl — пустой <div class="window-dropdown data-dropdown">. Уже display:block и позиционирован.

Окно само наполняет dropdownEl. Ядро закроет dropdown по клику вне.

Что можно рендерить
DOM — обычные элементы, canvas, svg.

this.utils.dom.el(...) — хелпер.

this.ui.button(...) — но учти, что кнопки будут с классом ui-btn, а не dropdown-item. Стилизуй сам, если нужно.

Закрытие
js
this._closeDataMenu();   // ← закрой, когда пользователь выбрал пункт
Ядро закроет автоматически при клике вне dropdown. Но если ты сам вызвал действие — вызови _closeDataMenu() вручную.

Динамический список слотов
js
onDataMenuOpen(anchorEl, dropdownEl) {
    if (!this._dataBus) return;

    const slots = this._dataBus.getAllSlotsByType(this.type);
    const currentSlotId = this.getSlotId();

    const hdr = document.createElement('div');
    hdr.className = 'dropdown-header';
    hdr.textContent = 'Слоты (' + slots.length + ')';
    dropdownEl.appendChild(hdr);

    for (const sid of slots) {
        const slot = this._dataBus.getSlot(sid);
        const isCurrent = sid === currentSlotId;

        const btn = document.createElement('button');
        btn.className = 'dropdown-item';
        btn.style.cssText = `
            display:flex;align-items:center;gap:8px;
            width:100%;padding:7px 14px;border:none;
            background:${isCurrent ? 'rgba(200,184,154,0.08)' : 'transparent'};
            color:${isCurrent ? 'var(--beige)' : 'var(--text-primary)'};
            font-size:12px;cursor:pointer;font-family:inherit;text-align:left;
        `;
        btn.textContent = sid + (isCurrent ? '  ●' : '') +
                          (slot.attachedWindows.length > 1 ? '  ·  ' + slot.attachedWindows.length + ' окон' : '');

        if (!isCurrent) {
            btn.addEventListener('click', () => {
                this.attachTo(sid);
                this._closeDataMenu();
            });
        } else {
            btn.style.cursor = 'default';
        }

        dropdownEl.appendChild(btn);
    }
}
Порядок приоритетов
text
1. onDataMenuOpen(anchorEl, dropdownEl)   ← если определён
2. static get dataMenu()                  ← массив или функция
3. сток ядра
Важно
this._resolveDataMenu() доступен для окна, если нужно получить разрешённый массив (по dataMenu).

this._renderDefaultDataMenu(el) — нарисовать сток в свой контейнер.

Не пытайся переопределить _buildDataMenuItem — это внутренний метод RenderWindow.

Dropdown закрывается автоматически при клике вне, Esc, resize, scroll (кроме scroll внутри себя).

Полный пример: свой заголовок + сток + свои кнопки
js
onDataMenuOpen(anchorEl, dropdownEl) {
    // 1. Свой заголовок
    const hdr = document.createElement('div');
    hdr.className = 'dropdown-header';
    hdr.textContent = 'Моё окно';
    dropdownEl.appendChild(hdr);

    // 2. Свои кнопки
    const items = [
        { icon: 'icon-refresh', label: 'Пересчитать', action: 'recalc' },
        { icon: 'icon-save',    label: 'Сохранить',   action: 'saveAll' }
    ];

    for (const it of items) {
        const btn = document.createElement('button');
        btn.className = 'dropdown-item';
        btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:7px 14px;border:none;background:transparent;color:var(--text-primary);font-size:12px;cursor:pointer;font-family:inherit;text-align:left;';

        if (it.icon) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'icon-svg');
            svg.style.cssText = 'width:14px;height:14px;fill:currentColor;flex-shrink:0;';
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#' + it.icon);
            svg.appendChild(use);
            btn.appendChild(svg);
        }

        const label = document.createElement('span');
        label.textContent = it.label;
        label.style.flex = '1';
        btn.appendChild(label);

        btn.addEventListener('click', () => {
            if (typeof this[it.action] === 'function') this[it.action]();
            this._closeDataMenu();
        });

        dropdownEl.appendChild(btn);
    }

    // 3. Разделитель + сток
    const div = document.createElement('hr');
    div.style.cssText = 'border:none;border-top:1px solid var(--border-color);margin:4px 8px;opacity:0.3;';
    dropdownEl.appendChild(div);

    this._renderDefaultDataMenu(dropdownEl);
}

4. menu.headerItems — SOFT-элементы шапки
Каждый элемент — объект с id (обязательно) и одним из:

4.1. type: 'button'
js
{
    id: 'btn-hello',
    type: 'button',
    icon: 'icon-info',
    label: 'Hello',
    title: 'Tooltip',
    action: 'greet',
    payload: { from: 'btn-hello' }
}
Клик → _emit('menu-action') → BaseWindow._onRenderMenuAction → onHeaderItemClick(desc, payload) → realInstance[action](value, payload, item).

4.2. type: 'dropdown'
js
{
    id: 'dd-tools',
    type: 'dropdown',
    icon: 'icon-menu',
    label: 'Tools',
    hidden: (baseWindow) => false,    // опционально
    items: (realInstance, baseWindow, layoutManager) => [
        { header: 'Секция' },
        { icon: 'icon-play', label: 'Запустить', action: 'run', shortcut: 'F5' },
        { divider: true },
        { icon: 'icon-trash', label: 'Удалить', action: 'del', danger: true }
    ]
}
items может быть массивом или функцией.

Элемент: { icon, label, action, value, payload, shortcut, disabled, danger, header, divider }.

4.3. type: 'separator'
js
{ id: 'sep-1', type: 'separator' }
4.4. render(ctx) — кастомный элемент
Приоритет над type.

js
{
    id: 'custom-clock',
    hidden: (baseWindow) => false,
    render: (ctx) => {
        // ctx = { renderWindow, baseWindow, layoutManager, index, desc }
        const el = document.createElement('span');
        el.textContent = '00:00';
        return el;
    },
    destroy: (el, baseWindow) => { /* cleanup */ }
}
⚠️ Race: render() может быть вызван до _ensureFields() экземпляра. Если нужен доступ к this:

js
render: (ctx) => {
    const inst = ctx.baseWindow?.getRealInstance?.();
    if (!inst || !inst._fieldsReady) {
        return document.createComment('not-ready');
    }
    return inst._buildMyWidget();
}
4.5. Кастомные type
Регистрируются один раз при загрузке модуля:

js
window.RenderWindow.registerHeaderItemType('badge', (desc, ctx) => {
    const el = document.createElement('span');
    el.textContent = desc.text || '•';
    el.addEventListener('click', () => {
        ctx.renderWindow._emit('menu-action', {
            windowId: ctx.renderWindow.id,
            action: desc.action || '',
            value: desc.value || '',
            payload: desc.payload ?? null,
            item: { ...desc, type: 'badge' }
        });
    });
    return el;
});
После этого можно использовать в headerItems: [{ id, type: 'badge', text: 'DEMO' }].

4.6. Runtime-мутации шапки
Метод	Что делает
this.getHeaderItems()	массив дескрипторов
this.addHeaderItem(desc, index?)	добавить элемент
this.removeHeaderItem(id)	убрать по id
this.setHeaderItems(items | null)	заменить весь массив (null → вернуться к static.menu)
this.refreshHeaderItems()	пересобрать шапку
desc.destroy(el, baseWindow) вызывается при пересборке и на destroy().

5. Хук onHeaderItemClick
js
onHeaderItemClick(desc, payload) {
    // payload = {
    //   action, value, item,      — из дескриптора
    //   payload,                   — payload из дескриптора
    //   source                     — 'button' | 'dropdown' | 'badge' | ...
    // }

    if (payload.action === 'special') {
        // обработать самому
        return true;               // стоп — realInstance[action] не будет вызван
    }
    return false;                  // продолжить: вызовется this[action](value, payload, item)
}
Порядок:

onHeaderItemClick(desc, payload) → если true, стоп.

this[action](value, payload, item) — если метод существует.

document-событие 'window-menu-action' — fallback.

6. Хуки жизненного цикла — что и когда
buildContent(el)
Вызывается из конструктора.

el — this._content.

Инициализируйте поля через _ensureFields().

Доступны this.ui, this.utils, this.i18n.

Не обращайтесь к this._baseWindow.

onReady()
После того как _baseWindow присвоен и все подписки активны.

Восстанавливайте UI из this.uiState.

Регистрируйте RPC (this.onRequest).

onData(payload)
payload = { data, metadata, uiState }.

Вызывается при загрузке слота и при изменении через DataBus.

onDataUpdate(payload)
Переопределяйте только если нужна своя логика синхронизации data/metadata/uiState.

Если переопределили — вызывайте super.onDataUpdate(payload).

onMessage(senderId, channel, data)
По каналам из static channels.

onDrop(files, meta), onDragEnter(meta), onDragLeave()
По static dropTarget.

meta.source === 'files' → fileNames, fileTypes.

meta.source === 'internal' → sourceWindowId, sourceType, channel, payload.

Вернуть true, если окно приняло данные.

onFocus() / onBlur()
Вызываются при смене активного окна.

onVisibilityChange(visible)
true → окно показано (restore, переключение вкладки layout).

false → окно свёрнуто.

onThemeChange(theme)
theme — 'dark' | 'light'.

onResize(w, h)
Размер контента окна. Вызывается часто.

onSlotChange(slotId)
После createEmptySlot() или attachTo(slotId).

onBeforeDestroy()
Последний шанс почистить ресурсы: таймеры, RAF, WebSocket, DOM-listeners.

7. Публичные методы экземпляра
7.1. Идентификация
Метод	Возвращает
this.getId()	id окна
this.getType()	type-id
this.getTitle()	заголовок
this.getIcon()	id иконки
this.getSlotId()	id слота
this.getBaseWindow()	BaseWindow или null
this.hasBaseWindow()	boolean
7.2. Данные
Метод	Что делает
this.getData() / this.setData(data)	data в слоте
this.getMetadata()	metadata
this.getState() / this.setState(obj)	uiState
this.getAllData()	{ metadata, data }
this.setAllData({ metadata, data })	переопределить всё
this.save()	сбросить в слот
7.3. Слоты
Метод	Что делает
this.createEmptySlot()	создать новый слот, привязаться
this.attachTo(slotId)	привязаться к слоту
this.getSlotWindows()	id окон того же слота
7.4. Окно
Метод	Что делает
this.minimize() / this.isMinimized()	свернуть
this.setFullscreen() / this.exitFullscreen() / this.toggleFullscreen() / this.isFullscreen()	фуллскрин
this.isVisible()	видимо ли окно
this.isFocused()	в фокусе ли
this.getRoot()	корневой DOM-контейнер
7.5. Поиск других окон
js
this.findWindowByType(typeId)   // первое окно типа (кроме себя) или null
this.findWindowsByType(typeId)  // массив окон типа (кроме себя)
7.6. Уведомления и история
Метод	Что делает
this.notify(title, message, type)	уведомление (info / success / warning / error)
this.recordHistory(label)	запись в общую историю (snapshot всего приложения)
7.7. Шапка
Метод	Что делает
this.getHeaderItems()	дескрипторы
this.addHeaderItem(desc, index?)	добавить
this.removeHeaderItem(id)	убрать
this.setHeaderItems(items)	заменить (null → вернуться к static)
this.refreshHeaderItems()	пересобрать
this.refreshHeader()	перерисовать шапку (только визуально)
7.8. Drag-source
js
const unsub = this.makeDraggable(element, {
    type: 'my-payload',
    ghostHTML: '<b>📦 payload</b>',
    getPayload: () => ({ any: 'data', counter: this._counter })
});
// unsub() — снять.
До onBaseWindowAttached регистрация откладывается автоматически.

7.9. Keyboard capture
js
this.captureKeyboard();    // true/false
this.releaseKeyboard();
При destroy() — авто-release.

7.10. Импорт / экспорт
js
onImport(parsed) { /* ... */ return true; }  // вызывается на кнопке «Импорт» hard-шапки
onExport()       { /* ... */ return payload; } // возвращает любой сериализуемый объект
8. MessageBus — связь между окнами
8.1. Отправка
js
this.sendMessage(channel, data, targetId = null); // null → всем
this.sendToType(channel, data, typeId);           // по типу
this.sendToSlot(channel, data, slotId);           // по слоту
8.2. Приём
js
static get channels() { return ['my-channel']; }

onMessage(senderId, channel, data) {
    if (channel === 'my-channel') { /* ... */ }
}
8.3. Подписка из кода
js
const unsub = this.subscribeToMessage('custom-channel', (senderId, data) => {
    // ...
});
// unsub() — снять.
8.4. RPC
Сервер:

js
this._rpcUnsub = this.onRequest('my-rpc', async (data, meta) => {
    // meta = { requestId, fromSenderId, channel }
    return { echo: data };          // или Promise
});

// на destroy:
this._rpcUnsub();
Клиент:

js
try {
    const res = await this.request('my-rpc', { hello: 'x' }, targetWindowId, {
        timeout: 3000
    });
    this.notify('RPC', JSON.stringify(res), 'success');
} catch (e) {
    // e.code: 'RPC_TIMEOUT' | 'RPC_ERROR' | 'RPC_SEND_FAILED' | 'RPC_BUS_DESTROYED'
    this.notify('RPC', e.message, 'error');
}
9. ExtendedAPI — что доступно как this.*
Весь набор — из data/UserAPI.js. Компоненты вызываются как this.<category>.<name>(...). CSS инжектится автоматически. Компоненты внутри реализации могут обращаться к другим компонентам и к this окна.

9.1. ui.button
js
this.ui.button({
    label: 'Save',
    icon: 'icon-save',
    variant: 'default' | 'primary' | 'ghost' | 'danger' | 'success',
    disabled: false,
    onClick: () => {}
});
9.2. ui.input
js
const input = this.ui.input({
    value: '', placeholder: '...', type: 'text',
    onChange: (e) => this.setState({ draft: e.target.value })
});

this.ui.input.getValue(input);
this.ui.input.setValue(input, 'x');
this.ui.input.setPlaceholder(input, '...');
9.3. ui.block
js
const block = this.ui.block({ title: 'Секция', children: [el1, el2] });

this.ui.block.setTitle(block, 'Новый заголовок');
const body = this.ui.block.getBody(block);   // <div> для динамических children
9.4. ui.text
js
this.ui.text({ text: 'Hello', variant: 'default' | 'heading' | 'muted' | 'mono', tag: 'div' });
this.ui.text.setText(el, 'новый текст');
9.5. ui.icon
js
// SVG из спрайта
this.ui.icon.svg('icon-save', 14, 'currentColor');

// canvas-отрисовка базовых иконок
this.ui.icon.canvas(ctx, 'icon-arrow-right', x, y, size, color);
Поддерживаемые в canvas: icon-arrow-right, icon-arrow-left, icon-chevron-down, icon-chevron-right, icon-check, icon-plus, icon-minus, icon-layout + fallback.

9.6. ui.contextMenu
js
const menu = this.ui.contextMenu({
    x: clientX, y: clientY,
    width: 220,
    items: [
        { header: 'Секция' },
        { icon: 'icon-copy', label: 'Копировать', shortcut: 'Ctrl+C', onClick: () => {} },
        { icon: 'icon-paste', label: 'Вставить',
          submenu: [{ label: 'A', onClick: () => {} }, { label: 'B' }] },
        { divider: true },
        { icon: 'icon-trash', label: 'Удалить', danger: true, onClick: () => {} }
    ]
});

menu.close();
menu.isOpen();
Меню взаимоисключающие — открытие нового закрывает все остальные (через window.__uiMenuRegistry). Закрываются на ЛКМ вне меню, Escape, resize, scroll вне меню.

9.7. ui.modal и ui.confirm
js
// modal — универсальная
const id = await this.ui.modal({
    title: 'Заголовок',
    icon: 'icon-info',
    message: 'Текст',
    size: 'sm' | 'md' | 'lg' | 'xl',
    variant: 'default' | 'danger' | 'success',
    buttons: [
        { id: 'ok',     label: 'OK',     variant: 'primary' },
        { id: 'cancel', label: 'Отмена', variant: 'ghost' }
    ]
});
// id — строка или null (Esc / backdrop)

// confirm — обёртка
const ok = await this.ui.confirm({
    title: 'Удалить?',
    message: 'Точно?',
    icon: 'icon-warning',
    buttons: [
        { id: 'yes', label: 'Да', variant: 'danger' },
        { id: 'no',  label: 'Нет', variant: 'ghost' }
    ]
});
Focus-trap, Escape, Tab — из коробки.

9.8. ui.inlineEditor
js
this.ui.inlineEditor({
    parent: this._content,
    rect: { x, y, w, h },
    type: 'text' | 'number',
    value: 'initial',
    onCommit: (v) => { /* Enter или blur */ },
    onCancel: () => { /* Escape */ }
});
9.9. ui.categoryPanel
Сворачиваемые категории с элементами.

js
// С триггером (в headerItems)
const trigger = this.ui.categoryPanel({
    label: 'Add',
    icon: 'icon-plus',
    categories: [
        { name: 'Группа', icon: 'icon-folder', items: [
            { label: 'Пункт', icon: 'icon-check', onClick: () => {} },
            { label: 'Удалить', danger: true, onClick: () => {} }
        ]}
    ],
    footerItems: [
        { divider: true },
        { label: 'Ещё', icon: 'icon-more', onClick: () => {} }
    ]
});

// Headless — открытие в точке курсора
const panel = this.ui.categoryPanel({ headless: true, categories: [...] });
panel.openAt(clientX, clientY);
panel.setCategories(newCats);
panel.close();
panel.destroy();
Состояние сворачивания категорий персистится в uiState.

9.10. ui.listPanel
Плоский список — то же, без групп.

js
const trigger = this.ui.listPanel({
    label: 'Пресеты',
    icon: 'icon-bookmark',
    items: [
        { label: 'Закрытый ящик', description: 'Динамик → Ящик → Solver',
          icon: 'icon-box', onClick: () => {} }
    ]
});

const panel = this.ui.listPanel({ headless: true, items: [...] });
panel.openAt(x, y);
panel.setItems(newItems);
9.11. utils.dom
js
this.utils.dom.el('div', { style: { display: 'flex' }, text: '' }, [child1, child2]);
this.utils.dom.clear(el);
const unsub = this.utils.dom.on(el, 'click', handler);
9.12. utils.canvas
js
this.utils.canvas.roundRect(ctx, x, y, w, h, r);
this.utils.canvas.bezier(ctx, x1, y1, x2, y2, k);
this.utils.canvas.multiBezier(ctx, points, segmentK);
this.utils.canvas.distToSegment(px, py, x1, y1, x2, y2);
9.13. utils.file
js
this.utils.file.saveJSON('data.json', obj);
this.utils.file.openJSON((parsed, file, err) => { /* ... */ }, '.json');
9.14. i18n.ru
js
this.i18n.ru.t('welcome', { name: 'Demo' });   // "Добро пожаловать, Demo!"
this.i18n.ru.add('mykey', 'значение');
10. Слоты — как работает синхронизация
Каждое окно привязано к слоту. Слот = { id, type, data, metadata, uiState, attachedWindows }.

Один слот могут смотреть несколько окон одного типа → изменения синхронизируются.

Слот сохраняется, когда окно закрыто (архив), и восстанавливается при открытии.

Как сохранять данные:

js
this.setData({ items: [1, 2, 3] });      // → в слот, всем подписчикам
this.setState({ scrollTop: 120 });        // → uiState
this.save();                              // принудительно

// Или разом:
this.setAllData({ data: {...}, metadata: {...} });
Как читать:

js
const data = this.getData();
const md = this.getMetadata();
const us = this.getState();
Изменение через this.setData(...) асинхронно придёт в onData(payload) всех окон слота — включая вас.

11. Хоткеи
static hotkeys регистрируются автоматически.

Хоткеи работают только когда окно в фокусе (или у него captureKeyboard).

captureKeyboard() перехватывает все клавиши, кроме Escape.

Пользователь может переопределить через Settings.

12. Импорт / экспорт файлов
Из hard-кнопки шапки (data-dropdown):

«Импорт» → onImport(parsed). Верните true, если приняли.

«Экспорт» → onExport(). Верните любой сериализуемый объект.

«Новый слот» → this.createEmptySlot().

«Привязать» → this.attachTo(slotId).

Свои кнопки/меню в headerItems — те же методы, вызывайте сами.

Прямая загрузка файла через utils.file.openJSON.

13. Drop и drag-source
Drop файлов
js
static get dropTarget() {
    return {
        accept: ['application/json', '.txt'],
        acceptExtensions: '.json,.txt',
        multiple: true
    };
}

async onDrop(files, meta) {
    // files: File[]
    // meta: { source, fileNames, fileTypes } или { source:'internal', payload, ... }
    return true;
}
Drag-source
js
const unsub = this.makeDraggable(element, {
    type: 'my-payload',
    ghostHTML: '<b>📦 drag</b>',
    getPayload: () => ({ counter: this._counter })
});
Пользователь тащит element → отпускает над другим окном → там срабатывает onDrop([], { source:'internal', payload }).

14. Уведомления
js
this.notify('Заголовок', 'Текст', 'info');
this.notify('Сохранено', 'Файл записан', 'success');
this.notify('Внимание', 'Пустой ввод', 'warning');
this.notify('Ошибка', e.message, 'error');
15. Undo / redo
js
this.recordHistory('Действие');      // сохранит снапшот всего приложения
Что попадает в снапшот:

data всех слотов (активных + архивных),

раскладка,

uiState всех окон.

Восстановление — через меню истории (Ctrl+Z / Ctrl+Y на уровне ядра).

Правило: вызывайте recordHistory после изменения состояния, а не до.

16. Куда что класть (шпаргалка)
Что хотите	Где
Свою кнопку в шапке	static menu.headerItems + this[action]
Своё выпадающее меню в шапке	type: 'dropdown' + items
Свой кастомный элемент шапки	render(ctx) + опционально destroy(el, bw)
Правый клик по окну	this.ui.contextMenu({ x, y, items })
Модалку / подтверждение	this.ui.modal / this.ui.confirm
Панель с категориями	this.ui.categoryPanel
Плоский список	this.ui.listPanel
Инлайн-редактор	this.ui.inlineEditor
Хоткей	static hotkeys + метод
Канал	static channels + onMessage
RPC	this.onRequest + this.request
Drag-source	this.makeDraggable
Drop файлов	static dropTarget + onDrop
Сохранение данных	this.setData / this.setState / this.setAllData
Чтение данных	this.getData / this.getState / this.getMetadata
Импорт / экспорт	onImport / onExport
Файл на диск	this.utils.file.saveJSON
Undo	this.recordHistory('label')
Уведомление	this.notify(title, msg, type)
Поиск других окон	this.findWindowByType / this.findWindowsByType
Focus / minimize / fullscreen	this.setFocusedWindow (через LayoutManager) / this.minimize / this.setFullscreen
17. Частые грабли
_baseWindow не готов в buildContent. → используйте геттеры (this.getId() и т.п.).

headerItems.render() вызывается до _ensureFields. → проверяйте inst._fieldsReady.

this.data в buildContent — null. → данные приходят позже, в onData. UI обновляйте в onData / onReady.

makeDraggable в конструкторе. → безопасно, регистрация отложится.

Забыли unsub() для onRequest. → делайте в onBeforeDestroy.

Изменили данные без recordHistory. → undo не откатит.

this.setState({...}) — это merge, не replace. → предыдущие ключи остаются.

setHeaderItems([]) ≠ setHeaderItems(null). → [] = пустая шапка, null = вернуться к static.menu.

18. Минимальный чек-лист нового окна
□ static get meta() с уникальным id.
□ class MyWindow extends window.BaseWindowInstance.
□ _ensureFields() — все поля.
□ buildContent(el) — DOM. Первая строка: this._ensureFields().
□ onReady() — стартовая логика, восстановление из uiState.
□ onBeforeDestroy() — снять таймеры, RAF, WebSocket, unsub.
□ window.MyWindow = MyWindow в конце IIFE.
□ Файл добавлен в data/window/window.json.
□ (Опционально) static hotkeys, static channels, static dropTarget.
□ (Опционально) static menu.headerItems для кнопок в шапке.
19. Регистрация окна
PluginSystem читает data/window/window.json, для каждого файла:

Загружает <script>.

Ищет класс с static meta.id → registerFromClass.

Собирает hotkeys, channels, dropTarget из static-конфига.

Никаких ручных вызовов registry.register* не нужно.

Reload на лету: window.pluginSystem.reload() — перезагрузит все окна и UserAPI.js без перезапуска страницы. Открытые окна сохраняют данные (слоты), меняется только код.

20. Что дальше
ExampleWindow.js — рабочий шаблон со всеми фишками.

NodeGraphWindow.js — сложное окно-редактор (multi-type UI, свои меню, inline-editor, RPC).

GraphicWindow.js — окно-график (canvas, tooltip, multi-graph).

NodePropertiesWindow.js — формы с 15+ типами параметров.

Каждое из них — образец под свой класс задач. Смотрите их, когда делаете похожее.