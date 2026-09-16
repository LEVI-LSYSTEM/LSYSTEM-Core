📚 Документация: GraphicWindow
Справочник по окну-графику: форматы данных, типы графиков, сравнения, экспорт.

📖 Оглавление
Что это

Быстрый старт

Формат данных graphs[]

Полный формат одного графика

Оси и масштаб (settings)

extraLines — пороги и метки

compareGraphs — наложения

metadata — произвольные данные

UI: типы, сравнения, контекстное меню

Импорт / экспорт / drop

Приём данных от других окон (graphic:load)

API окна (this.*)

Примеры

Частые ошибки

1. Что это
GraphicWindow — окно для отображения одного или нескольких графиков (кривых).

Ключевая идея:

Окно хранит массив графиков (graphs[]).

Один график активен в данный момент. Активный график определяет:

какие оси рисуются (X и Y);

какие подписи у осей;

какие extraLines (пороги, метки);

какие compareGraphs доступны.

Пользователь переключается между графиками через dropdown «Тип» в шапке.

Наложение нескольких кривых одновременно возможно только внутри одного графика через compareGraphs (одинаковые единицы измерения, одна шкала).

Что умеет:

Лог/линейная шкала по X и Y.

Автоматические тики и сетка.

Tooltip при наведении (интерполяция Y по X).

extraLines — горизонтальные (y) и вертикальные (x) линии.

compareGraphs — наложение дополнительных кривых.

Экспорт JSON / PNG / JPEG.

Приём данных от других окон (например, от LEM-солвера).

Чего не умеет:

Множественные оси Y (left/right).

Sub-plots (несколько панелей).

3D.

2. Быстрый старт
Минимальный JSON для показа одного графика:

json
{
    "graphs": [
        {
            "type": "spl",
            "label": "SPL",
            "color": "#ec2e2e",
            "xValues": [100, 200, 500, 1000, 2000],
            "yValues": [-10, -5, 0, -3, -8],
            "settings": {
                "xAxis": { "label": "Frequency, Hz", "log": true },
                "yAxis": { "label": "SPL, dB", "min": -20, "max": 10 }
            }
        }
    ]
}
Импортировать:

Hard-кнопка 📊 в шапке окна → Импорт.

Drag&drop JSON-файла на окно.

graphic:load — если присылает другое окно (см. §11).

После импорта:

График рисуется.

В шапке появится dropdown «Тип» со списком доступных типов.

ПКМ → контекстное меню.

3. Формат данных graphs[]
Корневой объект — всегда:

json
{
    "version": "2.0.0",
    "graphs": [ ... ],
    "metadata": { ... }
}
Поле	Обязательно	Что
graphs	✅	Массив графиков (см. §4)
metadata	❌	Верхний уровень метаданных (не отображаются)
version	❌	Строка версии формата
Обратной совместимости нет. Старый формат { main, compareGraphs, extraLines } не поддерживается — окно вернёт false при импорте.

4. Полный формат одного графика
json
{
    "type": "spl",
    "label": "SPL (LEM)",
    "color": "#ec2e2e",

    "xValues": [10, 12.5, 15, ...],
    "yValues": [-26.99, -26.84, ...],

    "extraLines": [
        { "y": 0, "color": "rgba(200,184,154,0.6)", "label": "0 dB", "dashed": false }
    ],

    "compareGraphs": [
        {
            "id": "ref_curve",
            "label": "Reference",
            "color": "#66ddff",
            "xValues": [...],
            "yValues": [...]
        }
    ],

    "metadata": { ... },

    "settings": {
        "xAxis": { ... },
        "yAxis": { ... },
        "appearance": { ... }
    }
}
4.1. Обязательные поля
Поле	Тип	Что
type	string	Уникальный ключ графика. Используется для переключения.
xValues	number[]	X-координаты точек
yValues	number[]	Y-координаты точек (длина = xValues)
4.2. Опциональные поля
Поле	Тип	По умолчанию	Что
label	string	type	Отображается в легенде и в шапке
color	string	#cc2233	Цвет основной линии
extraLines	array	[]	Пороги и метки (см. §6)
compareGraphs	array	[]	Наложения (см. §7)
metadata	object	{}	Произвольные данные (см. §8)
settings	object	{}	Оси и внешний вид (см. §5)
4.3. Правила
xValues и yValues должны быть одинаковой длины. Лишние отбрасываются.

X может быть возрастающим или убывающим — интерполяция Y работает в обе стороны.

Точки могут быть неравномерными (лог-шаг, ручной набор).

Разрывы в данных (NaN, null) — рисуются как пропуски.

5. Оси и масштаб (settings)
json
"settings": {
    "xAxis": {
        "label": "Frequency, Hz",
        "unit": "Hz",
        "min": 10,
        "max": 20000,
        "log": true,
        "precision": 0
    },
    "yAxis": {
        "label": "SPL, dB",
        "unit": "dB",
        "min": -40,
        "max": 10,
        "log": false,
        "precision": 1
    },
    "appearance": {
        "lineWidth": 1.8,
        "fillOpacity": 0.15,
        "pointSize": 1.5,
        "showPoints": false,
        "showGrid": true,
        "showLegend": true,
        "showFill": true
    }
}
5.1. xAxis / yAxis
Поле	Тип	Что
label	string	Подпись оси
unit	string	Единица (используется в tooltip)
min	number|null	Минимум. null — авто по данным
max	number|null	Максимум. null — авто по данным
log	bool	Логарифмическая шкала. Работает только если min > 0
precision	int	Знаков после запятой на тиках и в tooltip
Auto-scale:

Если min/max = null — вычисляется по всем видимым графикам (main + visible compare) + extraLines.y для Y.

Если данных нет — берётся 0..10.

5.2. appearance
Поле	Тип	По умолчанию	Что
lineWidth	number	1.8	Толщина основной линии
fillOpacity	number	0.15	Прозрачность заливки под линией
pointSize	number	1.5	Радиус точек
showPoints	bool	false	Рисовать точки на линии
showGrid	bool	true	Сетка
showLegend	bool	true	Легенда (список кривых)
showFill	bool	true	Заливка под линией
6. extraLines — пороги и метки
Каждый элемент массива — либо горизонтальная, либо вертикальная линия.

6.1. Горизонтальная
json
{ "y": 0, "color": "rgba(200,184,154,0.6)", "label": "0 dB", "dashed": false }
Поле	Обязательно	Что
y	✅	Значение по Y
color	❌	Цвет линии
label	❌	Подпись в легенде
dashed	❌	Пунктир. По умолчанию true
6.2. Вертикальная
json
{ "x": 424.42, "color": "rgba(255,180,80,0.75)", "label": "Peak", "dashed": true }
Поле	Обязательно	Что
x	✅	Значение по X
color	❌	Цвет линии
label	❌	Подпись в легенде
dashed	❌	Пунктир. По умолчанию true
6.3. Использование
Горизонтальные — пороги (0 dB, Xmax, Z_ref).

Вертикальные — маркеры (пики, резонансы).

Авто-подписи — формируются в ноде. Например, для LEM: Peak: 0.00 dB @ 424.4 Hz.

7. compareGraphs — наложения
Позволяет нарисовать несколько кривых внутри одного графика — но только в той же шкале (Y-ось общая).

json
"compareGraphs": [
    {
        "id": "ref",
        "label": "Reference",
        "color": "#66ddff",
        "xValues": [...],
        "yValues": [...]
    },
    {
        "id": "measured",
        "label": "Measured",
        "color": "#ffdd44",
        "xValues": [...],
        "yValues": [...]
    }
]
7.1. Поля
Поле	Обязательно	Что
id	✅	Уникальный ключ (для visibility toggle)
xValues	✅	X-координаты
yValues	✅	Y-координаты
label	❌	Имя в легенде
color	❌	Цвет линии. По умолчанию — из палитры
7.2. Управление видимостью
Каждый compareGraph можно включать/выключать отдельно.

UI:

Панель «Сравнения» в шапке окна (ui.listPanel).

Подменю «Сравнения» в контекстном меню (ПКМ).

Состояние сохраняется в uiState.compareVisibility[type][compareId] = true/false.

По умолчанию все видимы.

7.3. Пример использования
В LEM Impedance-графике:

main — |Z|, Ω

compare — Re(Z), Ω и Im(Z), Ω

Все три кривые — в одной шкале (Ω), накладываются друг на друга.

8. metadata — произвольные данные
Окно не отображает metadata. Оно сохраняется при экспорте и доступно в коде.

Типовое использование:

unitX, unitY — используются в tooltip (если в settings не заданы).

Параметры расчёта (Fs, Qts, Vb) — для отладки / передачи в другие окна.

Диагностика (Z_min, x_max) — числовые сводки.

json
"metadata": {
    "title": "SPL (LEM)",
    "unitX": "Hz",
    "unitY": "dB",
    "solver": "LEM v6",
    "env": { "T_C": 20, "rho": 1.204 },
    "diagnostics": {
        "Z_in_min_ohm": 6.484,
        "x_max_mm": 0.709
    },
    "speakerMeta": { "label": "Speaker 45 Hz", "fs": 45 }
}
Tooltip читает:

metadata.unitX → единица X.

metadata.unitY → единица Y.

Если не заданы — берёт settings.xAxis.label / settings.yAxis.label.

9. UI: типы, сравнения, контекстное меню
9.1. Панель «Тип» (в шапке)
Отображает label активного графика.

Клик → список всех графиков (type + label).

Выбор → активный type меняется, canvas перестраивается.

Активный тип сохраняется в uiState.activeType.

9.2. Панель «Сравнения» (в шапке)
Показывается только если у активного графика есть compareGraphs.

Заголовок: «Сравнения (N/M)», где N — видимых, M — всего.

Клик → список с галочками.

Клик по пункту → toggle видимости.

9.3. Контекстное меню (ПКМ)
Открывается через ui.contextMenu:

Типы (submenu) → список графиков, активный отмечен галочкой.

Сравнения (submenu) → чекбоксы compareGraphs активного графика.

— divider —

Сохранить PNG — экспорт canvas в PNG.

Сохранить JPEG — экспорт canvas в JPEG.

— divider —

Очистить сравнения — выключить все compareGraphs активного графика.

Очистить всё — сбросить все данные.

Дублирование Импорт/Экспорт JSON — убрано из контекстного меню. Импорт/Экспорт JSON доступны только через hard-кнопку 📊 в шапке (стандартное ядровое меню данных).

9.4. Tooltip
Показывает X в текущей позиции курсора.

Показывает Y для каждой видимой линии (main + visible compare).

Y интерполируется между соседними точками.

Формат значений — по precision из settings.xAxis / settings.yAxis.

Единицы — из metadata.unitX / metadata.unitY (или label).

10. Импорт / экспорт / drop
10.1. Импорт JSON
Только через hard-кнопку 📊 в шапке окна. Метод importFile() в окне остаётся, но не вызывается из меню — только из ядра.

Вызывает onImport(parsed):

Если формат { graphs: [...] } — принято.

Если формат { data: { graphs: [...] } } — тоже принято (обёртка от ядра).

Иначе — false, уведомление «Формат не распознан».

При импорте:

uiState.activeType = прежний, если есть в новых graphs[]; иначе первый.

uiState.compareVisibility сбрасывается.

Все compareGraphs — видимы по умолчанию.

10.2. Экспорт JSON
Только через hard-кнопку 📊 → Экспорт.

Возвращает:

json
{
    "version": "2.0.0",
    "graphs": [ ... ],
    "metadata": { ... },
    "timestamp": "2025-..."
}
Пустой график (без graphs или с пустым массивом) — экспорт выдаст «Нет данных для экспорта».

10.3. Drag&drop
Окно принимает .json файлы (см. static get dropTarget).

При drop:

Читается текст файла.

JSON.parse.

Вызывается onImport.

Если ок → notify('Drop', 'Данные загружены', 'success').

10.4. Экспорт PNG / JPEG
Через контекстное меню (ПКМ) → «Сохранить PNG» / «Сохранить JPEG».

Сохраняет текущий canvas как изображение. Имя файла: graphic_YYYY-MM-DD.png.

11. Приём данных от других окон (graphic:load)
GraphicWindow слушает канал graphic:load (static get channels).

Отправитель (например, LEM-солвер):

js
const targetWindow = host.findWindowByType('graphic');
if (targetWindow) {
    host.sendMessage('graphic:load', payload, targetWindow.id);
}
Payload:

js
{
    graphs: [ /* ... */ ],
    metadata: { /* ... */ }
}
Что происходит:

onMessage(senderId, 'graphic:load', data).

Вызывается this.onImport(data).

Если ок → notify «Данные загружены в график», recordHistory('Импорт JSON').

Если нет → notify «Формат не распознан».

Проверка: если graphic-окно не открыто — отправитель сам решает, что делать (открыть окно через host.openWindow('graphic') или сказать «откройте окно»).

12. API окна (this.*)
12.1. Публичные методы
Метод	Что
this.onImport(parsed)	Загрузить данные. Возвращает true/false
this.onExport()	Собрать данные для экспорта
this.setActiveType(type)	Переключить активный график
this.setCompareVisible(type, cgId, visible)	Toggle видимости compareGraph
this.clearCompare()	Выключить все compare активного графика
this.clearAll()	Сбросить всё
this.exportPng()	Сохранить canvas как PNG
this.exportJpeg()	Сохранить canvas как JPEG
12.2. Внутренние
Метод	Что
this._getActiveGraph()	Вернуть активный graph (или пустышку)
this._makeEmptyGraph()	Виртуальная пустышка для отрисовки осей
this._rebuildFloats()	Пересобрать Float32Array для отрисовки
this._showContextMenu(x, y)	Открыть контекстное меню
this._scheduleRender()	Запланировать перерисовку
12.3. Состояние
Поле	Что
this.data.graphs	Массив графиков
this.data.metadata	Метаданные верхнего уровня
this.uiState.activeType	Активный тип
this.uiState.compareVisibility	Видимость compareGraphs
12.4. Events
Окно наследует BaseWindowInstance, доступны все стандартные хуки:

onReady, onData, onResize, onThemeChange, onVisibilityChange, onBeforeDestroy.

onMessage(senderId, channel, data) — для канала graphic:load.

13. Примеры
13.1. Простой график (SPL)
json
{
    "graphs": [
        {
            "type": "spl",
            "label": "SPL",
            "color": "#ec2e2e",
            "xValues": [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000],
            "yValues": [-26.99, -23.88, -12.94, -0.96, -1.97, -5.01, -6.34, -7.34, -12.51, -19.19, -24.41],
            "extraLines": [
                { "y": 0, "color": "rgba(200,184,154,0.6)", "label": "0 dB", "dashed": false }
            ],
            "settings": {
                "xAxis": { "label": "Frequency, Hz", "unit": "Hz", "log": true, "min": 10, "max": 20000, "precision": 0 },
                "yAxis": { "label": "SPL, dB", "unit": "dB", "log": false, "min": -35, "max": 5, "precision": 1 },
                "appearance": { "showFill": true, "fillOpacity": 0.15, "lineWidth": 1.8 }
            },
            "metadata": {
                "unitX": "Hz",
                "unitY": "dB",
                "title": "SPL"
            }
        }
    ]
}
13.2. Несколько типов в одном JSON
json
{
    "graphs": [
        {
            "type": "spl",
            "label": "SPL",
            "color": "#ec2e2e",
            "xValues": [...],
            "yValues": [...],
            "settings": {
                "xAxis": { "label": "Frequency, Hz", "log": true },
                "yAxis": { "label": "SPL, dB", "min": -40, "max": 5 }
            }
        },
        {
            "type": "impedance",
            "label": "Z_in, Ω",
            "color": "#66ddff",
            "xValues": [...],
            "yValues": [...],
            "compareGraphs": [
                { "id": "z_re", "label": "Re(Z), Ω", "color": "#66ddff", "xValues": [...], "yValues": [...] },
                { "id": "z_im", "label": "Im(Z), Ω", "color": "#ffdd44", "xValues": [...], "yValues": [...] }
            ],
            "settings": {
                "xAxis": { "label": "Frequency, Hz", "log": true },
                "yAxis": { "label": "Z, Ω", "min": 0, "max": 80 }
            }
        },
        {
            "type": "xmax",
            "label": "X, mm",
            "color": "#66ff88",
            "xValues": [...],
            "yValues": [...],
            "extraLines": [
                { "y": 5, "color": "rgba(220,80,80,0.85)", "label": "Xmax (driver): 5.00 mm", "dashed": true }
            ],
            "settings": {
                "xAxis": { "label": "Frequency, Hz", "log": true },
                "yAxis": { "label": "X, mm", "min": 0, "max": 6, "precision": 3 }
            }
        }
    ],
    "metadata": {
        "title": "LEM Solver"
    }
}
После импорта в шапке появится dropdown «Тип»: SPL, Z_in Ω, X mm. Пользователь переключается.

13.3. Отправка из своей ноды
js
function sendToGraphic(data, host) {
    if (!host) return;

    const target = host.findWindowByType('graphic');
    if (!target) {
        host.notify('Send', 'Откройте окно Graphic', 'warning');
        return;
    }

    host.sendMessage('graphic:load', {
        graphs: data.graphs,
        metadata: data.metadata || {}
    }, target.id);

    host.notify('Send', 'Отправлено в Graphic', 'success');
}
13.4. Кастомный блок в NodeProperties с canvas-графиком
Если хочешь свой мини-график внутри NodeProperties:

js
renderCustomProperties(ctx) {
    return {
        'preview_canvas': {
            render({ param, value, onChange, node }) {
                const wrap = document.createElement('div');
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 100;
                canvas.style.cssText = 'background:var(--bg-dark);border-radius:4px;width:100%;display:block;';
                wrap.appendChild(canvas);

                const c2d = canvas.getContext('2d');
                const draw = () => {
                    c2d.clearRect(0, 0, canvas.width, canvas.height);
                    c2d.strokeStyle = '#ec2e2e';
                    c2d.lineWidth = 1.5;
                    c2d.beginPath();
                    // ... нарисовать что угодно из node._result
                    c2d.stroke();
                };
                draw();

                return wrap;
            },
            destroy(el) { /* cleanup */ }
        }
    };
}
14. Частые ошибки
«Format не распознан»
Причина: формат не { graphs: [...] }.

Проверка: в консоли data.graphs должно быть массивом.

График пустой, но graphs есть
Причина: активный type не найден в graphs.

Проверка:

js
const lg = window.layoutManager;
const w = lg.getWindows().find(x => x.type === 'graphic');
const inst = lg.getInstance(w.id).getRealInstance();
console.log('activeType:', inst.uiState.activeType);
console.log('available:', inst.data.graphs.map(g => g.type));
Если activeType не в списке — _ensureDefaults сбросит на первый.

Два графика одновременно не отображаются
Так и должно быть. Одновременно виден только один график (активный). Для наложения используй compareGraphs внутри активного.

График не отрисовывается (пустой canvas)
Причины:

xValues и yValues разной длины.

В settings.xAxis.log = true, но min <= 0.

canvas имеет размер 0 (окно свёрнуто?).

Проверка:

js
inst._floatX?.length   // должно быть > 0
inst._width, inst._height   // > 100
Log-шкала не работает
Причина: xAxis.log = true, но xValues содержит 0 или отрицательные.

Фикс: для лог-шкалы все X должны быть > 0.

compareGraphs видны, но не рисуются
Причина: compareVisibility[type][id] = false.

Проверка:

js
inst.uiState.compareVisibility
Или включи через контекстное меню.

Tooltip пустой
Причина: курсор не в области графика (не в pad.left..pad.left+chartW).

Проверка: наведи точно на область осей.

Экспорт PNG даёт пустую картинку
Причина: canvas не готов (окно было свёрнуто).

Фикс: сначала показать окно (onVisibilityChange(true) → _scheduleRender).

«Пусто» в шапке, но canvas не пустой
Норма. Если graphs.length === 0, но canvas показывает оси — это виртуальный «пустой» график (_makeEmptyGraph). Он не экспортируется и не попадает в data.

NodeProperties не открывается при dblclick
Не про Graphic. Смотри документацию NodeGraph: openPropertiesFor ищет окно nodeprops через findWindowByType и создаёт его через layoutManager.addWindow, если нет.

📌 Мини-шпаргалка
json
{
    "graphs": [
        {
            "type": "spl",                      // ОБЯЗАТЕЛЬНО, уникальный
            "label": "SPL (LEM)",
            "color": "#ec2e2e",
            "xValues": [10, 20, ...],           // ОБЯЗАТЕЛЬНО
            "yValues": [-26, -23, ...],         // ОБЯЗАТЕЛЬНО
            "extraLines": [
                { "y": 0, "label": "0 dB", "dashed": false },
                { "x": 424, "label": "Peak", "dashed": true }
            ],
            "compareGraphs": [
                { "id": "ref", "label": "Ref", "color": "#66ddff", "xValues": [...], "yValues": [...] }
            ],
            "metadata": { "unitX": "Hz", "unitY": "dB" },
            "settings": {
                "xAxis": { "label": "F, Hz", "log": true, "min": 10, "max": 20000, "precision": 0 },
                "yAxis": { "label": "dB", "log": false, "min": -40, "max": 10, "precision": 1 },
                "appearance": {
                    "lineWidth": 1.8,
                    "fillOpacity": 0.15,
                    "pointSize": 1.5,
                    "showPoints": false,
                    "showGrid": true,
                    "showLegend": true,
                    "showFill": true
                }
            }
        }
    ],
    "metadata": { "title": "..." }
}
API окна:

js
inst.onImport(parsed)              // → true/false
inst.onExport()                    // → { version, graphs, metadata, timestamp }
inst.setActiveType('spl')          // переключить активный
inst.setCompareVisible('spl', 'ref', false)  // toggle compare
inst.clearCompare()                // выключить все compare
inst.clearAll()                    // сбросить всё
inst.exportPng() / inst.exportJpeg()
Канал:

js
host.sendMessage('graphic:load', { graphs: [...], metadata: {} }, targetId)
UI:

Шапка → dropdown «Тип», панель «Сравнения».

ПКМ → Типы (submenu), Сравнения (submenu), PNG, JPEG, Очистить сравнения, Очистить всё.

Hard-кнопка 📊 → Импорт / Экспорт JSON.

GraphicWindow · справочник актуален на текущую версию ядра.