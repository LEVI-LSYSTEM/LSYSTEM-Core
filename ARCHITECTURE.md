LSYSTEM Core — Архитектура
Версия: 1.0
Назначение: модульная оконная система в браузере для построения инженерных, аналитических и вычислительных приложений.

1. Философия
1.1. Что это
LSYSTEM Core — это не приложение, а платформа. Она даёт разработчикам:

Готовую оконную среду (создание, фокус, minimize, fullscreen, swap).

Связь между окнами (broadcast, RPC).

Хранение данных (слоты) + сохранение проектов.

Расширяемый API (ExtendedAPI).

Профиль, настройки, темы, хоткеи.

Разработчик пишет только уникальную логику окна — всё остальное ядро берёт на себя.

1.2. Принципы
Принцип	Что значит
Ядро не трогается	Расширение — только через window/ (окна) и core/API/UserAPI.js (компоненты).
Каждое окно — самостоятельный модуль	Знает только свои данные и свои методы.
Слабая связность	Окна общаются через MessageBus, а не через прямые ссылки.
Данные — отдельно от UI	Логика и DOM не смешаны.
Один слот — один набор данных	Два окна могут смотреть в один слот и синхронизироваться.
Замена без перезапуска	PluginSystem.reload() — перезагрузка окон и API на лету.
2. Слои системы
text
┌──────────────────────────────────────────────────────────────┐
│                    ПОЛЬЗОВАТЕЛЬ                              │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                    ОКНА (window/)                            │
│  MyWindow.js, DBConnector.js, Chart.js, ...                  │
│  Наследники BaseWindowInstance                               │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│               EXTENDED API (core/API/UserAPI.js)             │
│  ui.button, ui.block, utils.dom, i18n, ...                   │
│  Готовые компоненты, доступные в любом окне                  │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                       ЯДРО (core/)                           │
│  ┌────────────┬────────────┬────────────┬────────────┐       │
│  │  UI-слой   │ Шина       │ Данные     │ Инфра      │       │
│  ├────────────┼────────────┼────────────┼────────────┤       │
│  │ Layout     │ Message    │ DataBus    │ Registry   │       │
│  │ Manager    │ Bus        │            │ Plugin     │       │
│  │            │            │            │ System     │       │
│  │ Render     │ RPC        │ History    │ Settings   │       │
│  │ Window     │            │ Manager    │ Modal      │       │
│  │            │            │            │            │       │
│  │ Base       │            │ Project    │ AppState   │       │
│  │ Window     │            │ Manager    │            │       │
│  └────────────┴────────────┴────────────┴────────────┘       │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                  БРАУЗЕР (DOM, Web APIs)                     │
└──────────────────────────────────────────────────────────────┘
3. Ядро — из чего состоит
3.1. UI-слой
LayoutManager — управляет раскладкой окон.

Хранит дерево раскладки (split/leaf).

Рендерит окна в workspace.

Minimize / restore / fullscreen.

События: layout-changed, layout-action, window-visibility-changed.

RenderWindow — DOM-обёртка окна.

Шапка (иконка, title, кнопки).

Контент-панель.

Dropdown-меню, контекстное меню.

Авто-адаптация шапки по ширине.

BaseWindow — низкоуровневая обёртка инстанса окна.

Связка RenderWindow + BaseWindowInstance.

Управление слотом окна.

Проброс drop/drag/visibility событий.

Хоткеи окна.

RPC-прокси.

BaseWindowInstance — базовый класс для разработчика.

Даёт this._content, lifecycle-хуки, хелперы.

Синхронизирует data / metadata / uiState со слотом.

Регистрирует drop-target, drag-source, каналы, хоткеи из static-конфига.

3.2. Шина
MessageBus — связь между окнами.

Broadcast: sendToType, sendToSlot, sendMessage.

Подписки: subscribe, subscribeAll.

RPC: request ↔ onRequest (Promise-based, с таймаутом).

HotkeyRegistry — глобальные и оконные хоткеи.

Приоритет: capture → data-capture → окно в фокусе → глобальный.

Захват клавиатуры (captureKeyboard) для игр/DAW.

3.3. Данные
DataBus — слоты.

Слот = { id, type, data, metadata, uiState, attachedWindows }.

Лимиты: 4 активных + 4 архивных на тип, 16 архивных всего.

Поддержка бинарных данных (ArrayBuffer по ссылке).

События подписки: subscribeToSlot.

HistoryManager — undo/redo.

Снимки состояния (слоты + раскладка).

Восстановление через importSnapshot.

Защита от вложенной записи (beginRestore/endRestore).

ProjectManager — сохранение проекта.

Сериализация: слоты + раскладка + метаданные.

Автосейв (30 сек) + ручное сохранение.

Импорт/экспорт .lsp файлов.

importFromJSON для cloud-sync.

3.4. Инфраструктура
WindowRegistry — реестр типов окон.

register, registerFromClass, unregister.

Группы, категории, приоритеты.

Metadata: channels, dropTarget.

PluginSystem — загрузчик.

Читает window/window.json — список окон.

Авто-регистрация: legacy registerXxxWindow или класс с static meta.

Манифест override (скрытие файлов).

Загружает UserAPI.js через PluginAPI.

reload() — перезагрузка на лету.

PluginAPI — загрузчик UserAPI.js.

Fetch + <script> (обход CORS).

Кэш, таймауты, error-handling.

Не критично, если UserAPI.js отсутствует.

ExtendedAPIInjector — движок ExtendedAPI.

registerComponent(category, name, config).

Proxy-механизм для this.<cat>.<name>(...).

CSS-инжект в <head>.

Namespace на BaseWindowInstance.prototype.

SettingsModal — настройки.

Профиль (имя, User Key, EULA).

Тема (auto/dark/light + часы).

Плагины (управление манифестом).

Хоткеи (переопределение).

AppState — глобальное состояние.

Тема (mode + effective).

Аккаунт (id, name, userKey, eulaAccepted).

Хоткеи (overrides).

Свёрнутость групп.

Persistence в localStorage.

4. Поток данных
4.1. Изменение данных
text
Пользователь (клик, ввод)
      ↓
MyWindow.addItem()
      ↓
this.data.items.push(...)
this.save()
      ↓
BaseWindow._saveToSlot()
      ↓
DataBus.setSlotData(slotId, payload)
      ↓
DataBus._notifySlot() → подписчики
      ↓
BaseWindow._onSlotUpdate (все окна слота)
      ↓
instance.onDataUpdate(payload)  ← синхронизация data/metadata/uiState
      ↓
instance.onData(payload)  ← хук разработчика
      ↓
instance._renderItems()  ← перерисовка DOM
4.2. Сохранение проекта
text
Ctrl+S / автосейв (30 сек)
      ↓
ProjectManager.saveProject()
      ↓
DataBus.exportSlots()         ← все слоты + архив
LayoutManager.getProjectData() ← раскладка + окна
      ↓
JSON.stringify → .lsp
      ↓
download файл + localStorage
4.3. Загрузка проекта
text
Пользователь → Load / loadLastProject
      ↓
ProjectManager.loadProject()
      ↓
_migrateProject()  ← миграция старых форматов
      ↓
DataBus.importSlots()          ← восстановление слотов
LayoutManager.loadProjectData() ← восстановление раскладки
      ↓
LayoutManager.render()         ← создание окон в DOM
      ↓
BaseWindowInstance (#n) → onReady
4.4. Связь между окнами
text
Окно A                          Окно B
  sendToType('ch', data)          │
        ↓                         │
  MessageBus.send()               │
        ↓                         │
  _deliverToTarget(targetId)      │
        ↓                         │
  subscribers['B']['ch'] ───►  onMessage(senderId, ch, data)
4.5. RPC
text
Клиент                     Сервер
request('ch', data, B)     onRequest('ch', handler)
      ↓                         ↑
  send('ch:request')  ──────►  handler(data, meta)
      ↓                         ↓
  ждём 'ch:response'   ◄─────  respond(requestId, result)
      ↓
  resolve(result) / reject(error)
5. Жизненный цикл
5.1. Окно
text
[1] Создание: new MyWindow(container, windowData, options)
      ├─ _buildRoot()          → this._root, this._content
      ├─ _setupChannels()      → подписки на static channels
      └─ buildContent(_content) → DOM разработчика

[2] Привязка: onBaseWindowAttached(bw)
      ├─ _registerDropTarget()   → из static dropTarget
      ├─ _registerMenuDragSources() → drag-source на кнопках
      ├─ _registerHotkeys()      → из static hotkeys
      └─ _loadFromSlot()         → синхронизация данных

[3] Готовность: onReady()

[4] Работа: onData / onMessage / onDrop / onResize / ...

[5] Свёртывание (minimize): окно уходит из DOM, instance жив
      └─ onVisibility(false)

[6] Разворачивание (restore):
      └─ onVisibility(true)

[7] Закрытие: onBeforeDestroy() → destroy() → отписки, DOM
5.2. Слот
text
[1] Создан: LayoutManager._resolveSlotForType()
      ├─ свободный активный? — переиспользовать
      ├─ есть архивный?     — распаковать
      └─ иначе              — создать новый

[2] Привязан: DataBus.attachWindowToSlot()

[3] Обновляется: setSlotData() → notify подписчиков

[4] Архивация: окно закрыто → archiveSlot()
      └─ данные сохранены, слот ждёт новое окно

[5] Очистка: при превышении лимитов архив удаляется
5.3. Рекорд истории
text
Пользователь делает действие
      ↓
layout-action / data-changed
      ↓
HistoryManager.record(label)
      ├─ snapshotProvider() → снимок состояния
      ├─ обрезка future (если был undo)
      └─ push в entries
Undo/redo:

text
User: Ctrl+Z / клик
      ↓
HistoryManager.undo()
      ↓
beginRestore() — блокирует record()
      ↓
applySnapshot(snapshot)
      ├─ DataBus.importSlots()
      ├─ LayoutManager.loadProjectData()
      └─ LayoutManager.render()
      ↓
endRestore() — снимает блок
6. Расширяемость
6.1. Три уровня расширения
text
┌─────────────────────────────────────────────────┐
│  1. ОКНА — window/MyWindow.js                   │
│     Новый тип окна. Своя логика, свои данные.   │
│     Регистрация: static meta + class.           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  2. EXTENDED API — core/API/UserAPI.js          │
│     Новый компонент (ui.button, chart.line).    │
│     Доступен во всех окнах через this.<cat>.<n>.│
│     Регистрация: registerComponent(...).        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  3. ЯДРО — core/*.js                            │
│     Изменение/расширение самого ядра.           │
│     Требует понимания архитектуры.              │
└─────────────────────────────────────────────────┘
Разработчик обычно работает только с уровнями 1 и 2. Уровень 3 — редко, только если нужна принципиально новая функциональность.

6.2. PluginSystem — авто-обнаружение
При старте:

Загрузить ExtendedAPI (UserAPI.js) → зарегистрировать компоненты.

Прочитать window/window.json → список файлов окон.

Для каждого файла:

Загрузить <script>.

Найти класс (window.MyWindow).

WindowRegistry.registerFromClass(MyWindow).

Собрать metadata: hotkeys, channels, dropTarget.

Окно доступно в меню Window.

Reload: PluginSystem.reload() — перезагружает все окна и UserAPI.js без перезагрузки страницы.

6.3. ExtendedAPI — механизм
Проблема: как добавить this.ui.button() всем окнам без правки ядра?

Решение:

UserAPI.js вызывает registerComponent('ui', 'button', {...}).

ExtendedAPIInjector кладёт конфиг в реестр.

На BaseWindowInstance.prototype появляется getter для ui.

this.ui → namespace Proxy, который лениво создаёт компонент-Proxy.

this.ui.button(...) → вызывает config.create.call(окно, ...).

Итог:

Компонент не знает про окно до момента вызова.

При вызове — this = окно, доступны this.data, this.save(), this.notify().

Компоненты могут вызывать другие компоненты (this.ui.text внутри ui.block).

CSS автоматически инжектится.

7. Коммуникация между модулями
7.1. Способы связи
Способ	Когда	Пример
DataBus (слоты)	Общие данные	Два окна смотрят один слот
MessageBus (broadcast)	Событие «всем»	Уведомление о новой записи
MessageBus (RPC)	Запрос-ответ	Окно-вьюер спрашивает БД
CustomEvent (document)	Системные события	layout-changed, window-visibility-changed
EventBus (внутри ядра)	Опционально	Может использоваться параллельно с DOM-событиями
7.2. Приоритет
text
1. DataBus          — если данные разделяются
2. MessageBus RPC   — если нужен ответ
3. MessageBus bro.  — если «просто уведомить»
4. CustomEvent      — только для системных вещей
Прямые ссылки между окнами запрещены — это создаёт связанность и ломает изоляцию.

7.3. Событийная модель
Ядро генерирует события:

Событие	Когда
window-visibility-changed	minimize/restore
layout-changed	раскладка изменилась
layout-action	пользователь сделал действие
window-ready	окно готово
window-destroyed	окно уничтожено
window-slot-changed	перепривязка к слоту
window-type-changed	смена типа
window-saved	данные сохранены в слот
project-saved / project-loaded	сохранение/загрузка проекта
extended-api-loaded	UserAPI.js загружен
Окна могут слушать через document.addEventListener(...).

8. Модель данных
8.1. Слот
Единица хранения данных. Может содержать:

data — пользовательские данные (объекты, массивы, ArrayBuffer).

metadata — метаданные (title, version, created, modified).

uiState — UI-состояние (scrollTop, viewMode, selection).

Привязка: несколько окон могут смотреть в один слот → данные синхронизированы.

Лимиты: 4 активных + 4 архивных на тип. Ограничение защищает от утечек.

8.2. Проект
Проект = снимок всей системы:

Все слоты (активные + архивные).

Раскладка окон.

Позиции split-делителей.

Список свёрнутых окон.

Метаданные (имя, дата, автор).

Формат: .lsp (JSON).

8.3. История
История = очередь снимков (проект + слоты).

Ограничения:

Максимум 100 снимков.

Снимок содержит слоты + раскладку.

Undo/redo/jumpTo — восстановление снимка.

Защита от циклов: во время восстановления HistoryManager не записывает новые снимки.

9. Изоляция и безопасность
9.1. Изоляция окон
Каждое окно:

Свой DOM-контейнер.

Свои подписки (авто-очистка при destroy).

Свой слот (или shared).

Свои drag-source / drop-target (авто-очистка).

Что НЕ изолировано:

Окна одного типа могут видеть окна друг друга через findWindowByType.

Все окна в одном JS-контексте (нет sandbox/iframe).

9.2. Безопасность
Профиль (EULA) — gate для работы приложения.

PluginSystem — не грузит произвольные URL, только локальные файлы.

RPC — таймауты, отмена, reject при destroy.

XSS — везде, где нужно, escapeHtml (в ui.* компонентах автоматически).

Что НЕ защищено:

localStorage можно менять вручную.

Нет sandbox для плагинов (все в одном контексте).

WebSocket-соединения — на совести окна.

9.3. Защита от утечек
Авто-очистка:

MessageBus.subscribe → возвращает unsub, destroy() вызывает.

DataBus.subscribeToSlot → то же.

HotkeyRegistry.registerWindow → unsub.

Drop-target → unsub.

Drag-source → unsub.

captureKeyboard → авто-release при destroy.

Ручная:

Таймеры (setInterval), RAF, WebSocket, EventListener — сам разработчик чистит в onBeforeDestroy.

10. Ограничения системы
10.1. Что можно
✅ 3D-движок, FEM-симуляция, DAW, CAD, IDE — UI-слой.

✅ Окно как BД-коннектор с WebSocket.

✅ Realtime-связь через captureKeyboard + RPC.

✅ Большие данные через ArrayBuffer (по ссылке, не копируется).

✅ Несколько окон на одном слоте (синхронизация).

✅ Undo/redo всей системы.

✅ Замена окон/компонентов на лету (PluginSystem.reload()).

10.2. Что нельзя (и почему)
❌ Изоляция процессов. Всё в одном JS-контексте.

❌ Локальные файлы. Только через File System Access API (не везде).

❌ Настоящая ОС. Нет доступа к железу.

❌ Sandbox для плагинов. Плагин = полный доступ к window.

❌ Множественные WebSocket между вкладками. Нужен SharedWorker — вне ядра.

❌ Realtime (μs). MessageBus async — мс. Для realtime — SharedArrayBuffer, вне ядра.

10.3. Масштаб
Параметр	Значение
Одновременных видимых окон	до 4
Свёрнутых окон	сколько угодно
Активных слотов на тип	4
Архивных слотов	16
Исторических снимков	100
Размер проекта	ограничен памятью
Размер данных в слоте	ограничен памятью
11. Порядок загрузки
text
1. HTML парсится
   ↓
2. <script> ядра (core/*.js) — регистрация глобальных классов
   ├─ HistoryManager
   ├─ RenderWindow
   ├─ BaseWindow
   ├─ ExtendedAPIInjector   ← ДО BaseWindowInstance
   ├─ PluginAPI             ← ДО PluginSystem
   ├─ BaseWindowInstance
   ├─ DataBus, MessageBus, ProjectManager
   ├─ WindowRegistry, PluginSystem
   ├─ LayoutManager, AppState, HotkeyRegistry
   └─ SettingsModal
   ↓
3. <script> index.js — точка входа
   ↓
4. DOMContentLoaded
   ↓
5. await window.__svgReady — ждём SVG-спрайты
   ↓
6. index.js:init()
   ├─ AppState (тема, аккаунт, хоткеи)
   ├─ HotkeyRegistry (глобальные хоткеи)
   ├─ MessageBus, DataBus, EventBus
   ├─ WindowRegistry
   ├─ PluginSystem.loadAll()
   │   ├─ PluginAPI.load() → UserAPI.js → регистрация компонентов
   │   ├─ window.json → список окон
   │   ├─ Загрузка каждого окна → registerFromClass
   │   └─ Регистрация всех типов
   ├─ LayoutManager (workspace)
   ├─ SettingsModal
   ├─ HistoryManager
   ├─ ProjectManager
   └─ loadLastProject() или gate (EULA)
   ↓
7. Готово — пользователь видит workspace
Критичный порядок:

ExtendedAPIInjector → до BaseWindowInstance (иначе не установит getter).

PluginAPI → до PluginSystem (иначе не загрузит UserAPI.js).

BaseWindowInstance → до загрузки окон (иначе окна не наследуются).

12. Точки расширения
12.1. Для разработчика окон
Что	Где	Как
Новое окно	window/MyWindow.js	extends BaseWindowInstance + static meta
Меню окна	static menu	headerButtons / contextMenu / dropdownMenu
Хоткеи	static hotkeys	{ 'Ctrl+N': { label, action } }
Каналы	static channels	массив строк
Drop-target	static dropTarget	{ acceptExtensions, multiple }
12.2. Для разработчика компонентов
Что	Где	Как
UI-компонент	core/API/UserAPI.js	registerComponent('cat', 'name', {...})
Утилита	там же	Тот же механизм
Готовый CSS	В css: поле компонента	Инжектится автоматически
Данные	Любые поля в config	defaults, strings, svg, ...
12.3. Для разработчика ядра
Что	Где	Когда
Новый системный сервис	core/MyService.js	Редко, требует понимания связей
Расширение DataBus	core/DataBus.js	Осторожно, ломает сохранение
Расширение LayoutManager	core/LayoutManager.js	Новые раскладки
Новый хук окна	core/BaseWindowInstance.js	По запросу
13. Диаграмма зависимостей
text
                ┌─────────────────┐
                │  window/*.js    │  (окна разработчика)
                └────────┬────────┘
                         │ extends
                         ↓
                ┌─────────────────┐
                │BaseWindowInstance│
                └────────┬────────┘
                         │ uses
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ExtendedAPI   │ │  DataBus     │ │ MessageBus   │
│ (ui.*, ...)  │ │  (слоты)     │ │ (broadcast)  │
└──────────────┘ └──────────────┘ └──────────────┘
        ↑                ↑                ↑
        │                │                │
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│PluginAPI     │ │ProjectManager│ │LayoutManager │
│(UserAPI.js)  │ │ (сохранение) │ │ (раскладка)  │
└──────────────┘ └──────────────┘ └──────────────┘
        ↑                ↑                ↑
        └────────────────┼────────────────┘
                         ↓
                ┌─────────────────┐
                │  PluginSystem   │
                │  (загрузчик)    │
                └─────────────────┘
                         ↑
                ┌─────────────────┐
                │   index.js      │
                │ (точка входа)   │
                └─────────────────┘
14. Философия дизайна
14.1. Почему окна как модули
Одно окно = одна задача. Не «комбайн», а чистый модуль.

Много окон = составное приложение. Каждое окно можно заменить/удалить без последствий.

Данные отдельно от UI. Логика и DOM не смешаны — можно тестировать.

Расширение без правки. Никогда не лезь в ядро, если можешь сделать окно.

14.2. Почему слоты
Данные переживают окно. Закрыл — данные в архиве, открыл — вернулись.

Шаринг между окнами. Два окна смотрят один слот = синхронизация бесплатно.

Ограничения защищают. 4 активных слота — не «100 пустых в памяти».

14.3. Почему MessageBus, не прямые ссылки
Изоляция. Окно A не знает про окно B — только про канал.

Замена без поломок. Убрал окно B — A продолжает работать.

RPC. Единый способ спросить-ответить.

14.4. Почему ExtendedAPI
Не трогая ядро — расширяй.

Один компонент — всем окнам.

CSS/данные/логика — в одном файле.

Замена на лету — reload().

14.5. Почему PluginSystem
Авто-обнаружение. Положил файл — оно работает.

Манифест. Можно скрыть/перегруппировать без изменения кода.

Reload без перезапуска. Правь — обновляй — тестируй.

15. Что даёт эта архитектура
Разработчику окна:

Не думает про шапку, кнопки, minimize, focus — ядро даёт.

Пишет только уникальное: buildContent + логика + хуки.

100-200 строк вместо 700-900.

Разработчику компонента:

Не думает про окна — пишет один раз — работает везде.

Может использовать другие компоненты.

Может включать CSS/данные/методы.

Команде:

Каждое окно — отдельный модуль → можно параллельно разрабатывать.

Слабая связность → замена окна не ломает соседей.

Единый стиль → все окна выглядят как части одной системы.

Владельцу продукта:

Расширение без переписывания ядра.

Замена окон на лету.

Большие данные, realtime, БД — всё на одном фундаменте.

16. Итог
LSYSTEM Core — это не фреймворк, а среда. Она даёт:

Полный оконный менеджер.

Готовую инфраструктуру (слоты, шина, история, сохранения).

Расширяемый API (ExtendedAPI).

Систему плагинов (окна + компоненты).

Разработчик получает:

Ядро → не трогает.

Пишет окна через BaseWindowInstance → 100-200 строк.

Пишет компоненты через UserAPI.js → доступны всем окнам.

Получает RPC, drag&drop, слоты, хоткеи, undo/redo — бесплатно.

Архитектура рассчитана на:

Масштабирование (много окон).

Расширение (новые окна/компоненты без правки ядра).

Замену (правка на лету через reload).

Сложные приложения (БД, FEM, CAD, DAW).

Принцип:

Разработчик пишет только то, что уникально. Всё остальное — ядро.

LSYSTEM Core v1.0 · Архитектура · актуально на текущую версию ядра.