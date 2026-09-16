📚 Документация: NodeGraph + NodeProperties
Справочник для разработчиков нод и свойств.

📖 Оглавление
Часть I. Node Graph

Что это и как устроено

Быстрый старт — своя нода за 5 минут

Структура папок среды

manifest.json — категории и пресеты

Полный формат ноды (все поля)

Параметры (params)

Кнопки (buttons)

Вычисления (compute, checkCompute)

Переход в другую среду (drillDown)

Кастомные свойства для NodeProperties (renderCustomProperties)

Fragment API (лем-фрагменты и др.)

События ноды (onParamChange, onButton)

Часть II. Node Properties

Что показывает NodeProperties

Встроенные типы параметров

Свои блоки через renderCustomProperties

Жизненный цикл кастомных блоков (render / update / destroy)

Часть III. Пресеты и примеры

Формат пресета

Пример полной ноды

Часть I. Node Graph
1. Что это и как устроено
Node Graph — окно с нодами и связями. Используется для визуального конструирования вычислительных графов (акустика, фильтры, обработка сигналов, что угодно).

Состав:

Среды (Environments) — контейнеры нод. Открывается одна активная среда. Можно переключаться.

Ноды — экземпляры из data/nodes/<Env>/<file>.js.

Связи — направленные (output → input).

Комментарии — визуальные блоки для группировки.

Пресеты — готовые графы (наборы нод + связей), описанные в manifest.json среды.

Вычисления — compute у ноды. Запускается вручную (Run) или по кнопке.

Fragment API — способ ноды отдать «фрагмент схемы» наверх (используется в LEM: speaker.js, box.js → LEMsolver.js).

Что видно на ноде:

Заголовок (label).

Иконка (если задана).

Порты (input слева, output справа) — если inputRules / outputRules не пусты.

Тонкая полоска статуса сверху (idle/running/ok/error).

Опционально: кнопка перехода в другую среду (drillDown).

Что НЕ видно на ноде:

Параметры, кнопки, категории — всё в NodeProperties.

Результат — в NodeProperties (секция «Результат»).

Как открыть свойства ноды:

Двойной клик по ноде.

ПКМ по ноде → «Свойства».

Окно свойств открывается автоматически, если его не было.

2. Быстрый старт — своя нода за 5 минут
2.1. Создать файл ноды
data/nodes/MyEnv/MyNode.js:

js
'use strict';

module.exports = {
    meta: {
        id: 'MyEnv.my_node',
        label: 'My Node',
        icon: 'icon-example'
    },

    inputRules: ['*'],
    outputRules: ['*'],
    maxInputs: '*',
    maxOutputs: '*',

    params: [
        { id: 'gain', type: 'number', label: 'Gain', default: 1.0 }
    ],

    buttons: [
        { id: 'run', label: '▶ Run', icon: 'icon-play' }
    ],

    async compute(ctx) {
        const input = ctx.getInputs()[0];
        if (!input) return null;

        const inResult = await ctx.requestCompute(input.id);
        const gain = Number(ctx.params.gain);

        return {
            value: (inResult?.value ?? 0) * gain
        };
    }
};
2.2. Добавить в manifest.json
data/nodes/MyEnv/manifest.json:

json
{
    "categories": [
        { "name": "Мои ноды", "nodes": ["MyNode.js"] }
    ]
}
2.3. Зарегистрировать среду в envirment.json
data/nodes/envirment.json:

json
{
    "envirment": {
        "Примеры": [
            {
                "folder": "MyEnv",
                "abstract": [],
                "concrete": [],
                "icon": "icon-layout"
            }
        ]
    }
}
2.4. Готово
Перезагрузить окно NodeGraph.

Add → «Мои ноды» → «My Node».

Двойной клик → NodeProperties.

3. Структура папок среды
text
data/nodes/
├── envirment.json               ← реестр сред (какие есть)
├── MyEnv/
│   ├── manifest.json            ← какие ноды и пресеты в этой среде
│   ├── MyNode.js                ← нода
│   ├── OtherNode.js
│   └── ...
└── Acoustics/
    ├── manifest.json
    ├── speaker.js
    ├── box.js
    ├── port.js
    ├── passive_radiator.js
    └── LEMsolver.js
Папка = среда. Имя папки — это defEnv в графе и ключ для NodeLoader.

4. manifest.json — категории и пресеты
json
{
    "categories": [
        { "name": "Излучатели", "nodes": ["speaker.js"] },
        { "name": "Оформление", "nodes": ["box.js", "port.js"] }
    ],
    "presets": [
        {
            "id": "closed_box",
            "label": "Закрытый ящик",
            "icon": "icon-box",
            "description": "Динамик → Ящик → LEM-солвер",
            "graph": {
                "nodes": [
                    {
                        "id": 1,
                        "x": -320,
                        "y": 0,
                        "defEnv": "Acoustics",
                        "defId": "Acoustics.speaker",
                        "defFile": "speaker.js",
                        "paramValues": {}
                    },
                    {
                        "id": 2,
                        "x": 0,
                        "y": 0,
                        "defEnv": "Acoustics",
                        "defId": "Acoustics.box",
                        "defFile": "box.js"
                    },
                    {
                        "id": 3,
                        "x": 320,
                        "y": 0,
                        "defEnv": "Acoustics",
                        "defId": "Acoustics.lem_solver",
                        "defFile": "LEMsolver.js"
                    }
                ],
                "connections": [
                    { "id": 1, "fromNodeId": 1, "fromPortId": "out", "toNodeId": 2, "toPortId": "in" },
                    { "id": 2, "fromNodeId": 2, "fromPortId": "out", "toNodeId": 3, "toPortId": "in" }
                ],
                "comments": []
            }
        }
    ]
}
categories — группы нод в панели Add.

presets — готовые графы. Опционально. Каждый пресет:

id — уникальный.

label — отображаемое имя.

icon — иконка.

description — подпись.

graph — объект с nodes, connections, comments.

Ключевые моменты пресета:

defEnv — имя папки среды (Acoustics).

defId — meta.id ноды.

defFile — имя файла ноды (speaker.js).

paramValues — начальные значения параметров (если не указаны — берутся default).

id нод — локальные (в пресете). При применении ремапятся на новые.

Применение пресета:

«Заменить» — очистить граф, загрузить.

«Добавить» — добавить к существующему графу со сдвигом +30 px.

Категории (params, buttons) у добавленных нод раскрываются по умолчанию.

5. Полный формат ноды
js
module.exports = {
    meta: {
        id: 'Acoustics.speaker',       // ОБЯЗАТЕЛЬНО. Уникальный.
        label: 'Speaker 45 Hz',         // Отображаемое имя.
        icon: 'icon-speaker',           // Иконка из svg-спрайта.
        category: 'Излучатели'          // Категория (перебивается manifest.json).
    },

    // Кто может подключаться к этой ноде на вход.
    // '*' — любой. [] — никто (нет входа). ['box.js'] — только box.js.
    inputRules: ['*'],
    outputRules: ['*'],

    // Максимум связей.
    // '*' — без лимита. 0 — нельзя. 1 — один порт. N — N портов.
    maxInputs: '*',
    maxOutputs: '*',

    // Имя среды для перехода (drillDown-кнопка). Опционально.
    drillDown: null,

    // Параметры (см. §6).
    params: [ /* ... */ ],

    // Кнопки (см. §7).
    buttons: [ /* ... */ ],

    // Реакции.
    onParamChange(id, value) { /* ... */ },   // при изменении параметра
    onButton(id, ctx) { /* ... */ },          // при клике по кнопке

    // Вычисления (см. §8).
    async compute(ctx) { /* ... */ },
    checkCompute(ctx) { return { ready: true }; },

    // Кастомные блоки для NodeProperties (см. §10).
    renderCustomProperties(ctx) { /* ... */ }
};
5.1. inputRules / outputRules
Правила совместимости. Проверяются при попытке создать связь.

Формат: массив имён файлов другой ноды (или '*').

Пример: speaker.js можно подключить к box.js:

js
// speaker.js
outputRules: ['box.js', 'wall.js'],

// box.js
inputRules: ['speaker.js']
Логика:

Связь A → B разрешена, если A.outputRules содержит B.file (или '*') и B.inputRules содержит A.file (или '*').

Если у ноды outputRules = [] — она не имеет выхода.

Если у ноды inputRules = [] — она не имеет входа.

5.2. maxInputs / maxOutputs
Значение	Поведение
'*'	Без лимита
0	Нельзя подключать
1	Один порт (при попытке второй связи — заменяется старая)
N	N портов
5.3. drillDown
Строка — имя среды. Если задана, в теле ноды появится кнопка «Перейти в <env>». Клик → navigateTo.

js
drillDown: 'Acoustics_Driver'
6. Параметры (params)
Параметры ноды не отображаются в самой ноде. Всё — в NodeProperties.

6.1. Формат
js
params: [
    {
        id: 'fs',                    // ОБЯЗАТЕЛЬНО. Уникальный.
        type: 'number',              // Тип (см. §14).
        label: 'Fs, Hz',             // Отображаемое имя.
        default: 45,                 // Значение по умолчанию.
        category: 'Thiele-Small',    // Категория (группировка в NodeProperties).
        description: 'Резонансная частота' // Подпись под параметром. Опционально.
    }
]
6.2. Значение в compute
js
async compute(ctx) {
    const fs = Number(ctx.params.fs);   // ← читается из node.paramValues
    // ...
}
ctx.params — снимок всех параметров ноды.

6.3. Реакция на изменение
js
onParamChange(id, value) {
    // id — id параметра, value — новое значение
    if (id === 'fs') {
        // что-то пересчитать
    }
}
Вызывается до compute. Не делай тут тяжёлых операций — может висеть UI.

6.4. Категория
Все параметры с одинаковой category группируются в один блок с заголовком. Пустая строка '' — «Без категории».

Порядок категорий:

Сначала — параметры без категории.

Потом — по алфавиту.

7. Кнопки (buttons)
js
buttons: [
    { id: 'run',    label: '▶ Run',    icon: 'icon-play' },
    { id: 'export', label: '↧ Export', icon: 'icon-export' },
    { id: 'send',   label: '📊 Send',  icon: 'icon-graphic' }
]
id — идентификатор (уйдёт в onButton(id, ctx)).

label — текст кнопки.

icon — опционально. Иконка из svg-спрайта.

Кнопка run специальная: если у ноды есть compute, кнопка run автоматически вызывает host.runNode(node). Можно перебить в onButton.

7.1. Обработчик
js
onButton(id, ctx) {
    const { node, host } = ctx;

    if (id === 'export') {
        if (!node._result) {
            host.notify('Export', 'Run first', 'warning');
            return;
        }
        exportJSON(node._result, host);
        return;
    }

    if (id === 'send') {
        // ...
    }
}
ctx:

node — NodeInstance. Доступ: node._result, node.paramValues.

graph — EnvGraph.

host — NodeGraphWindow.

env — имя среды.

host.notify(title, message, type) — уведомление.
host.runNode(node) — запустить вычисление.

8. Вычисления (compute)
8.1. compute(ctx)
Главный метод. Вызывается при Run или из requestCompute.

js
async compute(ctx) {
    // Собрать входы
    const inputs = ctx.getInputs();          // массив NodeInstance
    const outputs = ctx.getOutputs();        // массив NodeInstance

    // Запросить результат соседа (рекурсивно пересчитает, если надо)
    const upResult = await ctx.requestCompute(inputs[0].id);

    // Свои параметры
    const gain = Number(ctx.params.gain);

    // Работа
    const result = upResult.value * gain;

    // Сохранить и вернуть
    return { value: result };
}
Возвращаемое значение:

Объект → результат сохраняется в node._result.

undefined / null → результат не установлен, нода помечена _dirty = true.

ctx — API:

Метод / поле	Что
ctx.params	Объект параметров (снимок)
ctx.node	Текущая NodeInstance
ctx.graph	EnvGraph
ctx.env	Имя среды
ctx.host	NodeGraphWindow
ctx.getInputs(nodeId?)	Входы (все или конкретной ноды)
ctx.getOutputs(nodeId?)	Выходы
ctx.getNode(id)	NodeInstance по id
ctx.getParam(nodeId, paramId)	Значение параметра другой ноды
ctx.hasResult(nodeId)	Есть ли свежий результат
ctx.getResult(nodeId)	node._result
ctx.requestCompute(nodeId, opts?)	Запросить вычисление соседа
ctx.setResult(value)	Установить результат текущей ноды
ctx.invalidate(nodeId?)	Инвалидировать (себя или другую)
ctx.getSnapshot()	Снимок графа (nodes + connections)
ctx.notify(title, msg, type)	Уведомление
ctx.log(...args)	console.log с префиксом
ctx.throwError(msg)	Бросить ошибку
ctx.getSnapshot() возвращает:

js
{
    env: 'Acoustics',
    nodes: [
        { id, title, defId, defFile, env, params, inputIds, outputIds, result }
    ],
    connections: [
        { id, fromNodeId, toNodeId, waypoints }
    ],
    getNode(id),
    getParams(id),
    getInputs(id),
    getOutputs(id),
    getConnectionsFrom(id),
    getConnectionsTo(id),
    hasConnection(fromId, toId),
    getAllEdges()
}
8.2. checkCompute(ctx)
Опциональный. Вызывается перед compute. Если вернуть { ready: false, reason: '...' } — compute не запускается.

js
checkCompute(ctx) {
    if (ctx.getInputs().length === 0) {
        return { ready: false, reason: 'Нет входов' };
    }
    return { ready: true };
}
8.3. Кэш и инвалидация
Результат compute кэшируется в node._result. При повторном Run — пересчёт.

Инвалидация происходит автоматически при:

изменении параметра (onParamChange → _applyParam в NodeProperties);

изменении параметра через NodePropertiesWindow → _applyParam;

создании новой связи (инвалидируются потомки toNode);

удалении связи;

изменении параметров → каскадно инвалидирует всех потомков.

_dirty = true означает, что _result устарел.

8.4. Циклы
При requestCompute проверяется стек вызовов. Если нода пытается запросить саму себя через цепочку — throw:

text
Цикл в вычислениях: 5 → 7 → 3 → 5
Плюс на уровне addConnection проверяется wouldCreateCycle — не даёт создать циклический граф.

8.5. Таймаут
runNode имеет таймаут 30 секунд. Если compute не завершился — node._error = 'Таймаут вычисления'.

9. Переход в другую среду (drillDown)
js
drillDown: 'DriverDetails'
Если у ноды задано drillDown:

В теле ноды появляется кнопка «<название среды>».

Клик → host.navigateTo('DriverDetails').

Переключение сохраняется в uiState.

Логика переходов:

Если целевая среда есть в envirment.json и в abstract / concrete текущей среды — переход разрешён.

Если среда уже открыта в стеке — возврат к ней.

Иначе — предупреждение «Нельзя перейти».

10. Кастомные свойства для NodeProperties (renderCustomProperties)
Если тебе нужно своё поле в NodeProperties (например, графический редактор формы динамика), используй renderCustomProperties.

js
renderCustomProperties(ctx) {
    return {
        'port_shape': {
            render({ param, value, onChange, ctx, node, graph }) {
                // Возвращает DOM-элемент.
                const el = document.createElement('div');
                // ... свой UI
                return el;
            },
            update(el, value) {
                // Опционально. Вызывается при внешнем обновлении.
            },
            destroy(el) {
                // Опционально. Cleanup при закрытии окна / смене ноды.
            }
        },
        'thiele_small_plot': {
            render(...) { /* ... */ }
        }
    };
}
Как это работает:

У параметра type: 'port_shape' (свой тип) в NodeProperties вызывается кастомный рендер.

render() получает:

param — объект параметра (id, type, label, ...).

value — текущее значение (node.paramValues[param.id]).

onChange(newValue) — вызвать, чтобы сохранить значение.

ctx — объект с node, graph, host, getParam(id), setParam(id, v), notify(...).

Возвращает DOM-элемент.

update(el, value) — вызывается, когда значение изменилось вне этого блока (например, inline-редактор в ноде, или другой блок).

destroy(el) — при закрытии окна / смене ноды / удалении блока.

Что можно:

Рисовать canvas.

Использовать this.ui.button, this.ui.modal — но this здесь не окно, а ctx. Используй ctx.node, ctx.graph, ctx.host.

Читать и писать node.paramValues через onChange.

Пример — «слайдер с превью»:

js
renderCustomProperties(ctx) {
    return {
        'range_preview': {
            render({ param, value, onChange }) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = param.min ?? 0;
                slider.max = param.max ?? 100;
                slider.step = param.step ?? 1;
                slider.value = value ?? 0;
                slider.style.flex = '1';

                const num = document.createElement('input');
                num.type = 'number';
                num.value = slider.value;
                num.style.width = '64px';

                slider.addEventListener('input', () => {
                    num.value = slider.value;
                    onChange(Number(slider.value));
                });
                num.addEventListener('change', () => {
                    const v = Number(num.value);
                    slider.value = v;
                    onChange(v);
                });

                wrap.appendChild(slider);
                wrap.appendChild(num);
                return wrap;
            },
            update(el, value) {
                const slider = el.querySelector('input[type="range"]');
                const num = el.querySelector('input[type="number"]');
                if (slider) slider.value = value;
                if (num) num.value = value;
            }
        }
    };
}
11. Fragment API (лем-фрагменты и др.)
Fragment API — это не часть ядра, а договорённость между нодами. Используется, когда одна нода собирает данные с нескольких других (как LEM-солвер собирает speaker + box + port).

11.1. Как это работает
Отдающая нода (speaker.js):

js
async compute(ctx) {
    return {
        kind: 'lem.fragment',        // ← маркер
        source: 'speaker',            // ← имя источника
        nodes: ['in', 'gnd'],         // ← узлы схемы
        components: [
            { type: 'R', from: 'in', to: 'a', value: 6.4 },
            { type: 'L', from: 'a', to: 'b', value: 0.0005 }
        ],
        ports: { in: 'in', gnd: 'gnd' },
        meta: { label: 'Speaker', Sd_m2: 0.022 }
    };
}
Принимающая нода (LEMsolver.js):

js
async compute(ctx) {
    const fragments = [];
    const collect = async (node) => {
        const ups = ctx.graph.connections
            .filter(c => c.toNodeId === node.id)
            .map(c => ctx.graph.getNode(c.fromNodeId))
            .filter(Boolean);
        for (const u of ups) await collect(u);
        const r = await ctx.requestCompute(node.id);
        if (r && r.kind === 'lem.fragment') fragments.push(r);
    };
    for (const inp of ctx.getInputs()) await collect(inp);

    // fragments — массив того, что вернули speaker / box / port
}
11.2. Что вернуть
Минимальный набор:

kind — строка-маркер ('lem.fragment', 'filter.fragment', ...).

source — имя источника ('speaker', 'box', ...).

nodes — список внутренних узлов схемы.

components — список элементов (R, L, C, GYRATOR, VSRC, ...).

ports — какие узлы являются общими (in, gnd, rear, front).

meta — произвольные метаданные.

Всё остальное — на усмотрение автора фрагмента.

11.3. Правила именования
kind — придумай сам, главное чтобы принимающий понимал.

source — короткое имя (speaker, box, port).

ports — узлы, которые склеиваются между фрагментами (общие шины).

Принимающая нода склеивает фрагменты: одинаковые имена в ports → общий узел в итоговой схеме.

12. События ноды
12.1. onParamChange(id, value)
Вызывается при изменении параметра через NodeProperties.

js
onParamChange(id, value) {
    if (id === 'fs') {
        // пересчитать что-то
    }
}
Порядок:

NodeProperties меняет node.paramValues[id] = value.

Вызывает onParamChange(id, value).

Инвалидирует саму ноду и всех потомков.

Broadcast nodeprops:param-changed.

NodeGraphWindow получает — перерисовывает (если надо).

12.2. onButton(id, ctx)
Вызывается при клике по кнопке ноды (в NodeProperties).

js
onButton(id, ctx) {
    const { node, graph, host, env } = ctx;
    if (id === 'run') { /* кастомная логика Run */ }
}
Кнопка run — особенная:

Если у ноды есть compute — по умолчанию вызывается host.runNode(node).

Если хочешь перебить — определи onButton с id === 'run'.

Часть II. Node Properties
13. Что показывает NodeProperties
Окно NodeProperties — единое окно для всех нод. Показывает свойства активной ноды (той, что выделена в графе или по которой двойной клик).

Состав:

Шапка — title ноды, метаданные (id, среда, файл, статус).

Поиск — по label / id параметров.

Результат — если node._result есть.

Действия — кнопки из node.buttons.

Параметры — по категориям, с инлайн-редактором каждого.

Кастомные блоки — если нода вернула renderCustomProperties.

Особенности:

Одно окно NodeProperties на приложение. Переключается между нодами автоматически.

При двойном клике в NodeGraph — открывается / фокусируется.

При изменении параметра — onChange → _applyParam → node.paramValues[id] = value → graph.invalidateDescendants → _saveAndRecord.

14. Встроенные типы параметров
type	Что рендерит	Поля
string / text	однострочный input	default
textarea	многострочный textarea	default
number	input number	default, min, max, step
int	input number + округление	default, min, max, step
range	слайдер + число	default, min, max, step
bool / boolean	чекбокс + label on/off	default
color	color-picker + hex + alpha	default (#rrggbb или rgba(...))
options / select	select	options: [{ value, label }] или ['a', 'b']
vector2	X / Y инпуты	default: { x: 0, y: 0 }
vector3	X / Y / Z	default: { x: 0, y: 0, z: 0 }
json	textarea с валидацией	default: {...}
file	имя + кнопка выбора	default: string
readonly	просто значение	default
button	одна кнопка	default игнорируется
buttons	несколько кнопок	options: [{ id, label }]
separator	горизонтальная линия	—
header	заголовок	label
info	текстовый блок	default или description
Поле category — группировка. Все параметры с одинаковой category — в одном блоке.

Поле description — подпись под параметром (мелким шрифтом).

Поле min / max / step — для number / int / range.

Пример:

js
params: [
    { id: 'fs',    type: 'number', label: 'Fs, Hz',    default: 45,  min: 10, max: 200, step: 0.1, category: 'T/S' },
    { id: 'qts',   type: 'number', label: 'Qts',       default: 0.4, min: 0.1, max: 2,  step: 0.01, category: 'T/S' },
    { id: 'shape', type: 'options', label: 'Форма',    default: 'round', options: [
        { value: 'round', label: 'Круглая' },
        { value: 'square', label: 'Квадратная' }
    ], category: 'Корпус' },
    { id: 'flared', type: 'bool',  label: 'Раструб',   default: false, category: 'Корпус' },
    { id: 'color',  type: 'color', label: 'Цвет',      default: '#cc2233', category: 'Вид' }
]
15. Свои блоки через renderCustomProperties
Если встроенных типов недостаточно — используй кастомный блок.

15.1. Как это работает
В params описываешь параметр с произвольным type (например, port_shape).

В ноде реализуешь renderCustomProperties(ctx).

Он возвращает объект: { [type]: renderer }.

NodeProperties при отрисовке параметра с этим type вызовет renderer.render({...}).

15.2. Полный шаблон
js
renderCustomProperties(ctx) {
    return {
        'my_type': {
            render({ param, value, onChange, ctx, node, graph }) {
                const el = document.createElement('div');
                el.className = 'my-custom-block';
                // ... свой DOM
                return el;
            },
            update(el, value) {
                // опционально
            },
            destroy(el) {
                // опционально
            }
        }
    };
}
15.3. Параметры render
Поле	Что
param	{ id, type, label, default, options, category, min, max, step, description }
value	Текущее значение (node.paramValues[param.id])
onChange(newValue)	Сохранить новое значение
ctx	Тот же контекст, что был передан в renderCustomProperties
node	NodeInstance
graph	EnvGraph
ctx — API:

js
ctx.node                    // NodeInstance
ctx.graph                   // EnvGraph
ctx.host                    // NodePropertiesWindow
ctx.getParam(id)            // node.paramValues[id]
ctx.setParam(id, v)         // то же, что onChange(id, v)
ctx.notify(title, msg, type)
ctx.log(...args)
15.4. update(el, value)
Вызывается, когда значение изменилось вне этого блока (например, через inline-редактор в ноде, или через другой блок).

Не обязателен. Если его нет — блок не обновится.

15.5. destroy(el)
Вызывается при:

смене ноды (пользователь выбрал другую);

закрытии окна;

удалении блока.

Используй для cleanup: removeEventListener, clearInterval, cancelAnimationFrame, disconnect ResizeObserver.

15.6. Что можно рендерить
DOM — обычные элементы, canvas, svg, iframe.

Компоненты UserAPI — ctx.host.ui.button(...), ctx.host.ui.modal(...), и т.д. (доступ через ctx.host).

Графики — свой canvas с 2D-контекстом.

Модалки — ctx.host.ui.modal({...}).

15.7. Пример — кастомный блок «Форма корпуса»
js
// В params:
{ id: 'cab_shape', type: 'cab_shape', label: 'Форма ящика', default: { w: 200, h: 300, d: 250 }, category: 'Корпус' }

// В ноде:
renderCustomProperties(ctx) {
    return {
        'cab_shape': {
            render({ param, value, onChange }) {
                const v = value || { w: 200, h: 300, d: 250 };

                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:6px;background:var(--bg-card);border-radius:6px;';

                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 120;
                canvas.style.cssText = 'background:var(--bg-dark);border-radius:4px;width:100%;';
                wrap.appendChild(canvas);

                const ctx2d = canvas.getContext('2d');
                const draw = () => {
                    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
                    ctx2d.strokeStyle = 'var(--accent-red)';
                    ctx2d.lineWidth = 1.5;
                    ctx2d.strokeRect(20, 20, 160, 80);
                    ctx2d.fillStyle = 'var(--text-muted)';
                    ctx2d.font = '10px monospace';
                    ctx2d.fillText(`${v.w}×${v.h}×${v.d} mm`, 20, 110);
                };
                draw();

                const mkInput = (label, key) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;gap:6px;align-items:center;';
                    const l = document.createElement('span');
                    l.textContent = label;
                    l.style.cssText = 'font-size:10px;color:var(--text-muted);width:16px;';
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.value = v[key];
                    inp.style.cssText = 'flex:1;padding:4px 6px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-color);border-radius:3px;font-size:11px;';
                    inp.addEventListener('input', () => {
                        v[key] = Number(inp.value) || 0;
                        draw();
                        onChange({ ...v });
                    });
                    row.appendChild(l);
                    row.appendChild(inp);
                    return row;
                };

                wrap.appendChild(mkInput('W', 'w'));
                wrap.appendChild(mkInput('H', 'h'));
                wrap.appendChild(mkInput('D', 'd'));

                return wrap;
            },
            update(el, value) {
                // Если значение пришло извне — надо перерисовать
                // (в реальном коде — сложнее; здесь просто пересоздаём)
            },
            destroy(el) {
                // cleanup, если был addEventListener вне el
            }
        }
    };
}
15.8. Ограничения
this в render — не окно. Это деструктурированный объект { param, value, onChange, ctx, node, graph }. Для UI — используй ctx.host.ui.*.

Не пытайся держать состояние между render и update в замыкании — оно теряется при перерисовке. Сохраняй в node.paramValues через onChange.

Возвращай именно DOM-элемент (nodeType === 1). Иначе NodeProperties покажет fallback.

Часть III. Пресеты и примеры
17. Формат пресета
(См. §4 — пресеты описаны в manifest.json.)

Ключевые поля:

id — уникальный идентификатор пресета в среде.

label — отображается в списке.

icon — иконка.

description — подпись.

graph.nodes[] — массив нод:

id — локальный (для связей внутри пресета).

x, y — world-координаты.

defEnv — имя среды (Acoustics).

defId — meta.id ноды.

defFile — имя файла.

paramValues — значения параметров (опционально).

expandedCategories — раскрытые категории (опционально).

graph.connections[]:

id — локальный.

fromNodeId, toNodeId — id нод из nodes.

fromPortId: 'out', toPortId: 'in'.

waypoints — опционально.

Применение:

«Заменить» — граф очищается, пресет загружается.

«Добавить» — пресет добавляется со сдвигом +30 px.

Категории (params, buttons) раскрываются автоматически.

18. Пример полной ноды
Нода «Speaker 45 Hz» из среды Acoustics.

js
// data/nodes/Acoustics/speaker.js
'use strict';

module.exports = {
    meta: {
        id: 'Acoustics.speaker',
        label: 'Speaker 45 Hz',
        icon: 'icon-speaker'
    },

    inputRules: [],
    outputRules: ['box.js', 'wall.js'],
    maxInputs: 0,
    maxOutputs: '*',

    params: [
        { id: 'fs',  type: 'number', label: 'Fs, Hz',  default: 45,   min: 10, max: 200, step: 0.1, category: 'Thiele-Small' },
        { id: 'qes', type: 'number', label: 'Qes',     default: 0.45, min: 0.1, max: 2,  step: 0.01, category: 'Thiele-Small' },
        { id: 'qms', type: 'number', label: 'Qms',     default: 4,    min: 0.1, max: 20, step: 0.1, category: 'Thiele-Small' },
        { id: 'vas', type: 'number', label: 'Vas, L',  default: 34,   min: 1, max: 500, step: 0.1, category: 'Thiele-Small' },
        { id: 're',  type: 'number', label: 'Re, Ω',   default: 6.4,  min: 0.1, max: 32, step: 0.1, category: 'Electrical' },
        { id: 'le',  type: 'number', label: 'Le, mH',  default: 0.5,  min: 0, max: 10, step: 0.01, category: 'Electrical' },
        { id: 'bl',  type: 'number', label: 'BL, T·m', default: 10.07, min: 0.1, max: 50, step: 0.1, category: 'Electrical' },
        { id: 'sd',  type: 'number', label: 'Sd, cm²', default: 220,  min: 10, max: 2000, step: 1, category: 'Mechanical' },
        { id: 'mms', type: 'number', label: 'Mms, g',  default: 25.22, min: 1, max: 500, step: 0.1, category: 'Mechanical' },
        { id: 'xmax', type: 'number', label: 'Xmax, mm', default: 5,  min: 0.1, max: 50, step: 0.1, category: 'Mechanical' }
    ],

    buttons: [
        { id: 'run', label: '▶ Run', icon: 'icon-play' }
    ],

    async compute(ctx) {
        const p = ctx.params;

        const fs  = Number(p.fs);
        const qes = Number(p.qes);
        const qms = Number(p.qms);
        const vas = Number(p.vas) / 1000;   // L → m³
        const re  = Number(p.re);
        const le  = Number(p.le) / 1000;    // mH → H
        const bl  = Number(p.bl);
        const sd  = Number(p.sd) / 10000;   // cm² → m²
        const mms = Number(p.mms) / 1000;   // g → kg

        const qts = (qes * qms) / (qes + qms);
        const cms = 1 / (Math.pow(2 * Math.PI * fs, 2) * mms);
        const rms = (2 * Math.PI * fs * mms) / qms;
        const g   = bl / re;                // гиратор
        const ma  = bl * sd;                // акустическая масса
        const ra  = bl * bl / re * sd * sd / 1; // приблизительно

        return {
            kind: 'lem.fragment',
            source: 'speaker',
            nodes: ['in', 'gnd', 'front', 'rear'],
            components: [
                { type: 'R', from: 'in', to: 'n1', value: re },
                { type: 'L', from: 'n1', to: 'n2', value: le },
                { type: 'GYRATOR', from: 'n2', to: 'gnd', from2: 'front', to2: 'rear', value: g },
                { type: 'L', from: 'front', to: 'rear', value: ma },
                { type: 'R', from: 'front', to: 'rear', value: ra }
            ],
            ports: { in: 'in', gnd: 'gnd', front: 'front', rear: 'rear' },
            meta: {
                label: `Speaker ${fs} Hz`,
                fs, qes, qms, qts, vas,
                re, le, bl, sd, mms,
                Sd_m2: sd,
                Cms: cms, Rms: rms,
                G: g, Ma: ma, Ra: ra
            }
        };
    }
};
Что тут важно:

meta.id = 'Acoustics.speaker' — точно совпадает с defId в пресетах.

outputRules: ['box.js', 'wall.js'] — speaker можно подключить только к этим нодам.

inputRules: [] — у speaker нет входа.

compute возвращает фрагмент — его подхватит LEMsolver.js.

📌 Мини-шпаргалка по ноде
js
module.exports = {
    meta: { id, label, icon, category },

    inputRules: ['*' | 'file.js'],
    outputRules: ['*' | 'file.js'],
    maxInputs: '*' | 0 | N,
    maxOutputs: '*' | 0 | N,

    drillDown: null | 'EnvName',

    params: [
        { id, type, label, default, category, description, min, max, step, options }
    ],

    buttons: [
        { id, label, icon }
    ],

    onParamChange(id, value) {},
    onButton(id, ctx) {},

    async compute(ctx) {},
    checkCompute(ctx) { return { ready: true }; },

    renderCustomProperties(ctx) {}
};
Типы параметров: string, textarea, number, int, range, bool, color, options, vector2, vector3, json, file, readonly, button, buttons, separator, header, info.

📌 Мини-шпаргалка по свойствам
js
renderCustomProperties(ctx) {
    return {
        'my_type': {
            render({ param, value, onChange, ctx, node, graph }) { /* DOM */ },
            update(el, value) {},
            destroy(el) {}
        }
    };
}
Использование в params:

js
{ id: 'x', type: 'my_type', label: 'X', default: 42, category: 'Custom' }
Node Graph & Node Properties · справочник актуален на текущую версию ядра