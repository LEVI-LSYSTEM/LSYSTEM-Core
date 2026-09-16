// data/window/GraphicWindow.js
// Версия 2.0.1
//
// Изменения 2.0.1:
//   - FIX: _buildTypeTrigger/_buildCompareTrigger защищены от раннего render()
//     (RenderWindow вызывает render() ДО того, как instance._ensureFields).
//   - FIX: _ensureDefaults чистит legacy-поля (main/compareGraphs/extraLines),
//     если формат данных не соответствует graphs[].
//   - FIX: onData игнорирует legacy-формат, помечает его как «нет данных».
//
// Изменения 2.0.0:
//   - data.graphs[] вместо data.main/compareGraphs/extraLines.
//   - Каждый график самодостаточен: xValues, yValues, color, label,
//     extraLines, compareGraphs, metadata, settings (xAxis/yAxis/appearance).
//   - Активный type — один (radio), сохраняется в uiState.activeType.
//   - Панель «Тип» в шапке (listPanel), «Сравнения» — listPanel.
//   - Контекстное меню — ui.contextMenu.
//   - Импорт/экспорт JSON — только через hard-кнопки ядра.
//   - utils.file для saveJSON/openJSON.
//   - Обратной совместимости со старым форматом (main) НЕТ.
//
// Зависимости (UserAPI):
//   ui.icon, ui.contextMenu, ui.listPanel
//   utils.file

(function() {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[GraphicWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    console.log('[GraphicWindow] Loading v2.0.1...');

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================

    const COMPARE_PALETTE = [
        '#66ddff', '#ffdd44', '#66ff88', '#ff66aa',
        '#cc88ff', '#ff8844', '#44ddcc', '#ffaa66',
        '#88aaff', '#dd88cc', '#aadd66', '#ff7788'
    ];

    const DEFAULT_RANGE = { min: 0, max: 10, range: 10 };

    // ============================================================
    // КЛАСС
    // ============================================================

    class GraphicWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'graphic',
                name: 'Graphic',
                icon: 'icon-graphic',
                description: 'График: мульти-типы, сравнения, пороги',
                group: 'Анализ',
                category: 'analysis',
                priority: 1,
                defaultSize: { width: 560, height: 420 },
                minSize: { width: 260, height: 180 },
                maxWindows: 6,
                metadata: { version: '2.0.1', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'type-panel',
                        render: (ctx) => {
                            const bw = ctx.baseWindow;
                            const inst = bw?.getRealInstance?.();
                            if (!inst || typeof inst._buildTypeTrigger !== 'function') {
                                return document.createComment('type-trigger');
                            }
                            return inst._buildTypeTrigger();
                        }
                    },
                    {
                        id: 'compare-panel',
                        render: (ctx) => {
                            const bw = ctx.baseWindow;
                            const inst = bw?.getRealInstance?.();
                            if (!inst || typeof inst._buildCompareTrigger !== 'function') {
                                return document.createComment('compare-trigger');
                            }
                            return inst._buildCompareTrigger();
                        }
                    }
                ]
            };
        }

        static get hotkeys() {
            return {
                'Ctrl+L': { label: 'Очистить всё', action: 'clearAll' }
            };
        }

        static get dropTarget() {
            return {
                accept: ['application/json', '.json'],
                acceptExtensions: '.json',
                multiple: false
            };
        }

        static get channels() {
            return ['graphic:load'];
        }

        constructor(container, windowData, options = {}) {
            super(container, windowData, options);
            console.log('[GraphicWindow] Constructor:', this.id);
        }

        // --------------------------------------------------------
        // Ленивая инициализация полей
        // --------------------------------------------------------
        _ensureFields() {
            if (this._fieldsReady) return;

            this._canvas = null;
            this._ctx = null;

            this._tooltip = null;
            this._tooltipX = null;
            this._tooltipRows = null;

            this._floatX = null;
            this._floatY = null;
            this._compareFloats = [];

            this._width = 0;
            this._height = 0;
            this._dpr = 1;
            this._lastCssW = 0;
            this._lastCssH = 0;

            this._isHovering = false;
            this._mouseX = -1;
            this._mouseY = -1;

            this._ticksCache = { x: null, y: null };
            this._rangeCache = { x: null, y: null };

            this._renderRAF = null;
            this._renderPending = false;

            this._onMouseMove = null;
            this._onMouseLeave = null;
            this._onContextMenu = null;

            this._typeTrigger = null;
            this._compareTrigger = null;

            this._fieldsReady = true;
        }

        // ============================================================
        // КОНТЕНТ
        // ============================================================

        buildContent(el) {
            this._ensureFields();

            Object.assign(el.style, {
                position: 'relative',
                overflow: 'hidden'
            });

            this._canvas = document.createElement('canvas');
            Object.assign(this._canvas.style, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                cursor: 'crosshair'
            });

            this._ctx = this._canvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });

            el.appendChild(this._canvas);

            // Tooltip
            this._tooltip = document.createElement('div');
            this._tooltip.className = 'gw-tooltip';
            Object.assign(this._tooltip.style, {
                position: 'fixed',
                background: 'var(--bg-panel, rgba(26, 26, 26, 0.95))',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.18))',
                borderRadius: '10px',
                padding: '0',
                fontSize: '11px',
                color: 'var(--text-primary, #e0d8cc)',
                pointerEvents: 'none',
                zIndex: '9999',
                display: 'none',
                flexDirection: 'column',
                minWidth: '180px',
                maxWidth: '280px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.02) inset',
                backdropFilter: 'blur(12px)',
                fontFamily: 'inherit',
                overflow: 'hidden',
                opacity: '0',
                transition: 'opacity 0.12s ease'
            });

            this._tooltipX = document.createElement('div');
            Object.assign(this._tooltipX.style, {
                padding: '8px 12px 7px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--text-primary, #e0d8cc)',
                letterSpacing: '0.3px',
                borderBottom: '1px solid var(--border-color, rgba(200, 184, 154, 0.1))',
                background: 'rgba(200, 184, 154, 0.03)',
                display: 'flex',
                alignItems: 'baseline',
                gap: '6px'
            });
            this._tooltipX.textContent = '—';

            this._tooltipRows = document.createElement('div');
            Object.assign(this._tooltipRows.style, {
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 0'
            });

            this._tooltip.appendChild(this._tooltipX);
            this._tooltip.appendChild(this._tooltipRows);
            document.body.appendChild(this._tooltip);

            this._onMouseMove = (e) => {
                const rect = this._canvas.getBoundingClientRect();
                const scaleX = this._width / Math.max(1, rect.width);
                const scaleY = this._height / Math.max(1, rect.height);
                this._mouseX = (e.clientX - rect.left) * scaleX;
                this._mouseY = (e.clientY - rect.top) * scaleY;
                this._isHovering = true;
                this._updateHover(e.clientX, e.clientY);
            };
            this._onMouseLeave = () => {
                this._isHovering = false;
                this._mouseX = -1;
                this._mouseY = -1;
                this._hideTooltip();
                this._scheduleRender();
            };

            // Своё контекстное меню (не ядровое)
            this._onContextMenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showContextMenu(e.clientX, e.clientY);
            };

            this._canvas.addEventListener('mousemove', this._onMouseMove);
            this._canvas.addEventListener('mouseleave', this._onMouseLeave);
            this._canvas.addEventListener('contextmenu', this._onContextMenu);
        }

        // ============================================================
        // ЖИЗНЕННЫЙ ЦИКЛ
        // ============================================================

        onReady() {
            this._ensureDefaults();
            this._rebuildFloats();
            this._invalidateCaches();

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this._isDestroyed) return;
                    this._doResize();
                    this._scheduleRender();
                    this._refreshHeaderItems();
                });
            });
        }

        onData(payload) {
            this._ensureDefaults();

            // ✅ FIX: если слот пришёл в legacy-формате — не пытаемся его читать.
            // Просто оставляем пустой graphs[].
            if (this._isLegacyData(this.data)) {
                console.warn('[GraphicWindow] onData: legacy-формат (main/compareGraphs) — игнорируем');
                this.data = { graphs: [], metadata: {} };
                this.uiState.activeType = null;
                this.uiState.compareVisibility = {};
            }

            this._rebuildFloats();
            this._invalidateCaches();
            this._scheduleRender();
            this._refreshHeaderItems();
        }

        onThemeChange(theme) {
            this._scheduleRender();
        }

        onVisibilityChange(visible) {
            if (visible) {
                this._invalidateCaches();
                this._scheduleRender();
            }
        }

        onResize(width, height) {
            if (this._isDestroyed || !this._ctx) return;
            if (width < 1 || height < 1) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const physW = Math.ceil(width * dpr);
            const physH = Math.ceil(height * dpr);

            const samePhys = (this._canvas.width === physW && this._canvas.height === physH);
            const sameCss = (
                Math.abs(this._lastCssW - width) < 0.01 &&
                Math.abs(this._lastCssH - height) < 0.01
            );

            if (samePhys && sameCss && this._width > 0) return;

            this._lastCssW = width;
            this._lastCssH = height;
            this._width = Math.floor(width);
            this._height = Math.floor(height);

            if (!samePhys) {
                this._canvas.width = physW;
                this._canvas.height = physH;
                this._dpr = dpr;
                this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            this._canvas.style.width = width + 'px';
            this._canvas.style.height = height + 'px';

            this._scheduleRender();
        }

        onBeforeDestroy() {
            if (this._canvas) {
                this._canvas.removeEventListener('mousemove', this._onMouseMove);
                this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
                this._canvas.removeEventListener('contextmenu', this._onContextMenu);
            }
            if (this._renderRAF) {
                cancelAnimationFrame(this._renderRAF);
                this._renderRAF = null;
            }
            if (this._tooltip && this._tooltip.parentNode) {
                this._tooltip.parentNode.removeChild(this._tooltip);
            }
            if (this._typeTrigger && typeof this._typeTrigger.destroy === 'function') {
                try { this._typeTrigger.destroy(); } catch (e) {}
            }
            if (this._compareTrigger && typeof this._compareTrigger.destroy === 'function') {
                try { this._compareTrigger.destroy(); } catch (e) {}
            }

            this._ctx = null;
            this._canvas = null;
            this._tooltip = null;
            this._tooltipX = null;
            this._tooltipRows = null;
            this._floatX = null;
            this._floatY = null;
            this._compareFloats = [];
            this._typeTrigger = null;
            this._compareTrigger = null;
        }

        // ============================================================
        // ДЕФОЛТЫ / STATE
        // ============================================================

        _isLegacyData(data) {
            if (!data || typeof data !== 'object') return false;
            // Legacy-маркер: есть main или compareGraphs или extraLines,
            // но НЕТ непустого graphs[]
            const hasGraphs = Array.isArray(data.graphs) && data.graphs.length > 0;
            if (hasGraphs) return false;
            return !!(data.main || data.compareGraphs || data.extraLines);
        }

        _ensureDefaults() {
            if (!this.uiState || typeof this.uiState !== 'object') this.uiState = {};
            if (typeof this.uiState.activeType !== 'string') this.uiState.activeType = null;
            if (!this.uiState.compareVisibility || typeof this.uiState.compareVisibility !== 'object') {
                this.uiState.compareVisibility = {};
            }

            if (!this.data || typeof this.data !== 'object') {
                this.data = { graphs: [], metadata: {} };
            }
            if (!Array.isArray(this.data.graphs)) this.data.graphs = [];
            if (!this.data.metadata || typeof this.data.metadata !== 'object') {
                this.data.metadata = {};
            }

            // ✅ FIX: чистим legacy-поля, если формат — старый
            if (this._isLegacyData(this.data)) {
                this.data = { graphs: [], metadata: {} };
                this.uiState.activeType = null;
                this.uiState.compareVisibility = {};
                return;
            }

            // Нормализуем графики
            for (const g of this.data.graphs) {
                this._normalizeGraph(g);
            }

            // Активный тип
            if (this.data.graphs.length > 0) {
                const hasActive = this.data.graphs.some(g => g.type === this.uiState.activeType);
                if (!hasActive) {
                    this.uiState.activeType = this.data.graphs[0].type;
                }
            } else {
                this.uiState.activeType = null;
            }
        }

        _normalizeGraph(g) {
            if (!g || typeof g !== 'object') return;

            if (typeof g.type !== 'string') g.type = 'custom';
            if (typeof g.label !== 'string') g.label = g.type;
            if (typeof g.color !== 'string') g.color = '#cc2233';

            if (!Array.isArray(g.xValues)) g.xValues = [];
            if (!Array.isArray(g.yValues)) g.yValues = [];
            if (!Array.isArray(g.extraLines)) g.extraLines = [];
            if (!Array.isArray(g.compareGraphs)) g.compareGraphs = [];

            if (!g.settings || typeof g.settings !== 'object') g.settings = {};
            if (!g.settings.xAxis) g.settings.xAxis = {};
            if (!g.settings.yAxis) g.settings.yAxis = {};
            if (!g.settings.appearance) g.settings.appearance = {};

            for (let i = 0; i < g.compareGraphs.length; i++) {
                const cg = g.compareGraphs[i];
                if (!cg || typeof cg !== 'object') continue;
                if (typeof cg.id !== 'string') cg.id = g.type + '_cmp_' + i;
                if (typeof cg.label !== 'string') cg.label = 'Compare ' + (i + 1);
                if (typeof cg.color !== 'string') {
                    cg.color = COMPARE_PALETTE[i % COMPARE_PALETTE.length];
                }
                if (!Array.isArray(cg.xValues)) cg.xValues = [];
                if (!Array.isArray(cg.yValues)) cg.yValues = [];
            }

            const typeKey = g.type;
            if (!this.uiState.compareVisibility[typeKey]) {
                this.uiState.compareVisibility[typeKey] = {};
            }
            const visMap = this.uiState.compareVisibility[typeKey];
            for (const cg of g.compareGraphs) {
                if (!(cg.id in visMap)) visMap[cg.id] = true;
            }
        }

        _getActiveGraph() {
            if (!this.data || !Array.isArray(this.data.graphs)) {
                return this._makeEmptyGraph();
            }
            const type = this.uiState.activeType;
            const found = type ? this.data.graphs.find(g => g.type === type) : null;
            if (found) return found;
            if (this.data.graphs.length === 0) return this._makeEmptyGraph();
            return null;
        }

        /**
         * Виртуальная «пустая» болванка графика — для отрисовки осей/сетки
         * когда данных нет. НЕ попадает в data.graphs и НЕ экспортируется.
         */
        _makeEmptyGraph() {
            return {
                type: '_empty',
                label: 'Пусто',
                color: 'rgba(200,184,154,0.4)',
                xValues: [],
                yValues: [],
                extraLines: [],
                compareGraphs: [],
                metadata: {},
                settings: {
                    xAxis: {
                        label: 'Ось X',
                        min: 0,
                        max: 10,
                        log: false,
                        precision: 2
                    },
                    yAxis: {
                        label: 'Ось Y',
                        min: 0,
                        max: 10,
                        log: false,
                        precision: 2
                    },
                    appearance: {
                        lineWidth: 1.8,
                        fillOpacity: 0.15,
                        pointSize: 1.5,
                        showPoints: false,
                        showGrid: true,
                        showLegend: false,
                        showFill: false
                    }
                }
            };
        }

        // ============================================================
        // FLOAT32
        // ============================================================

        _rebuildFloats() {
            const active = this._getActiveGraph();
            if (!active) {
                this._floatX = null;
                this._floatY = null;
                this._compareFloats = [];
                return;
            }

            const x = active.xValues || [];
            const y = active.yValues || [];
            const len = Math.min(x.length, y.length);

            const fx = new Float32Array(len);
            const fy = new Float32Array(len);
            for (let i = 0; i < len; i++) {
                fx[i] = +x[i] || 0;
                fy[i] = +y[i] || 0;
            }
            this._floatX = fx;
            this._floatY = fy;

            const typeKey = active.type;
            const visMap = (this.uiState.compareVisibility && this.uiState.compareVisibility[typeKey]) || {};

            this._compareFloats = (active.compareGraphs || []).map(cg => {
                const cx = cg.xValues || [];
                const cy = cg.yValues || [];
                const cl = Math.min(cx.length, cy.length);
                const cfx = new Float32Array(cl);
                const cfy = new Float32Array(cl);
                for (let i = 0; i < cl; i++) {
                    cfx[i] = +cx[i] || 0;
                    cfy[i] = +cy[i] || 0;
                }
                return {
                    id: cg.id,
                    label: cg.label,
                    color: cg.color,
                    floatX: cfx,
                    floatY: cfy,
                    visible: visMap[cg.id] !== false
                };
            });
        }

        // ============================================================
        // ИМПОРТ / ЭКСПОРТ
        // ============================================================

        onImport(parsed) {
            if (!parsed || typeof parsed !== 'object') return false;

            let payload = parsed;
            if (parsed.data && typeof parsed.data === 'object' && Array.isArray(parsed.data.graphs)) {
                payload = parsed.data;
            }

            if (!Array.isArray(payload.graphs) || payload.graphs.length === 0) {
                console.warn('[GraphicWindow] onImport: нет поля graphs (или пусто)');
                return false;
            }

            this._ensureDefaults();

            const prevType = this.uiState.activeType;

            this.data = {
                graphs: payload.graphs.map(g => JSON.parse(JSON.stringify(g))),
                metadata: payload.metadata && typeof payload.metadata === 'object'
                    ? JSON.parse(JSON.stringify(payload.metadata))
                    : {}
            };

            this.uiState.compareVisibility = {};

            const types = this.data.graphs.map(g => g.type);
            if (prevType && types.includes(prevType)) {
                this.uiState.activeType = prevType;
            } else {
                this.uiState.activeType = types[0] || null;
            }

            for (const g of this.data.graphs) {
                this._normalizeGraph(g);
            }

            this._rebuildFloats();
            this._invalidateCaches();
            this.recordHistory('Импорт JSON');
            this._scheduleRender();
            this._refreshHeaderItems();

            return true;
        }

        onExport() {
            this._ensureDefaults();
            return {
                version: '2.0.1',
                graphs: this.data.graphs.map(g => JSON.parse(JSON.stringify(g))),
                metadata: JSON.parse(JSON.stringify(this.data.metadata || {})),
                timestamp: new Date().toISOString()
            };
        }

        async onDrop(files, meta) {
            if (meta.source === 'internal') return false;

            const file = files[0];
            if (!file) return false;

            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (this.onImport(parsed)) {
                    this.notify('Drop', 'Данные загружены из ' + file.name, 'success');
                    return true;
                }
                this.notify('Drop', 'Формат не распознан', 'warning');
                return false;
            } catch (e) {
                console.error('[GraphicWindow] drop parse error:', e);
                this.notify('Drop', 'Не удалось прочитать файл', 'error');
                return false;
            }
        }

        onMessage(senderId, channel, data) {
            if (channel === 'graphic:load') {
                if (!data || typeof data !== 'object') {
                    console.warn('[GraphicWindow] graphic:load: пустой payload');
                    return;
                }
                try {
                    const ok = this.onImport(data);
                    if (ok) {
                        this.notify('Приём', 'Данные загружены в график', 'success');
                    } else {
                        this.notify('Приём', 'Формат не распознан', 'warning');
                    }
                } catch (e) {
                    console.error('[GraphicWindow] onMessage load error:', e);
                    this.notify('Ошибка', String(e.message || e), 'error');
                }
                return;
            }
        }

        // ============================================================
        // ACTIONS
        // ============================================================

        importFile() {
            if (this._isDestroyed) return;
            this.utils.file.openJSON((parsed) => {
                if (this._isDestroyed) return;
                if (!parsed) {
                    this.notify('Импорт', 'Не удалось прочитать файл', 'error');
                    return;
                }
                if (this.onImport(parsed)) {
                    this.notify('Импорт', 'Данные загружены', 'success');
                } else {
                    this.notify('Импорт', 'Формат не распознан', 'warning');
                }
            }, '.json');
        }

        exportFile() {
            if (this._isDestroyed) return;
            const payload = this.onExport();
            if (!payload || !payload.graphs || payload.graphs.length === 0) {
                this.notify('Экспорт', 'Нет данных для экспорта', 'warning');
                return;
            }
            const name = `graphic_${new Date().toISOString().slice(0, 10)}.json`;
            if (this.utils.file.saveJSON(name, payload)) {
                this.notify('Экспорт', 'JSON сохранён', 'success');
            } else {
                this.notify('Экспорт', 'Ошибка сохранения', 'error');
            }
        }

        exportPng()  { this._exportImage('png'); }
        exportJpeg() { this._exportImage('jpeg'); }

        clearCompare() {
            const active = this._getActiveGraph();
            if (!active || active.compareGraphs.length === 0) return;

            const typeKey = active.type;
            const visMap = this.uiState.compareVisibility[typeKey] || {};

            let changed = false;
            for (const cg of active.compareGraphs) {
                if (visMap[cg.id] !== false) {
                    visMap[cg.id] = false;
                    changed = true;
                }
            }
            if (!changed) return;

            this.uiState.compareVisibility[typeKey] = visMap;
            this._rebuildFloats();
            this._invalidateCaches();
            this.recordHistory('Очистка сравнения');
            this._scheduleRender();
            this._refreshHeaderItems();
            this.notify('Очищено', 'Сравнения отключены', 'info');
        }

        clearAll() {
            this._ensureDefaults();
            this.data = { graphs: [], metadata: {} };
            this.uiState.activeType = null;
            this.uiState.compareVisibility = {};
            this._floatX = null;
            this._floatY = null;
            this._compareFloats = [];
            this._invalidateCaches();
            this.recordHistory('Очистка графика');
            this._scheduleRender();
            this._refreshHeaderItems();
            this.notify('Очищено', 'Все данные удалены', 'info');
        }

        setActiveType(type) {
            if (!type) return;
            if (!this.data || !Array.isArray(this.data.graphs)) return;
            if (!this.data.graphs.some(g => g.type === type)) return;
            if (this.uiState.activeType === type) return;

            this.uiState.activeType = type;
            this._rebuildFloats();
            this._invalidateCaches();
            this.recordHistory('Тип графика: ' + type);
            this._scheduleRender();
            this._refreshHeaderItems();
        }

        setCompareVisible(type, compareId, visible) {
            if (!type || !compareId) return;
            if (!this.uiState.compareVisibility[type]) {
                this.uiState.compareVisibility[type] = {};
            }
            this.uiState.compareVisibility[type][compareId] = !!visible;
            this._rebuildFloats();
            this._scheduleRender();
            this._refreshHeaderItems();
        }

        // ============================================================
        // HEADER
        // ============================================================

        _refreshHeaderItems() {
            if (this._isDestroyed) return;
            if (typeof this.refreshHeaderItems === 'function') {
                this.refreshHeaderItems();
            }
        }

        /**
         * Заглушка триггера для случая, когда инстанс ещё не готов
         * (RenderWindow вызывает render() до _ensureFields).
         */
        _makeStubTrigger(label, iconId) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-listpanel__trigger';
            btn.dataset.uiMenuTrigger = 'trigger';
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';

            if (this.ui && this.ui.icon && iconId) {
                try { btn.appendChild(this.ui.icon.svg(iconId, 12)); } catch (e) {}
            }

            const span = document.createElement('span');
            span.textContent = label;
            btn.appendChild(span);

            return btn;
        }

        _buildTypeTrigger() {
            // ✅ Защита от раннего вызова render() из RenderWindow
            if (!this._fieldsReady || !this.data || !Array.isArray(this.data.graphs)) {
                return this._makeStubTrigger('Тип', 'icon-layers');
            }

            if (this._typeTrigger && typeof this._typeTrigger.destroy === 'function') {
                try { this._typeTrigger.destroy(); } catch (e) {}
            }

            const active = this.uiState.activeType;
            const activeGraph = active ? this._getActiveGraph() : null;
            let label;
            if (this.data.graphs.length === 0) {
                label = 'Пусто';
            } else if (activeGraph) {
                label = activeGraph.label || active;
            } else {
                label = 'Тип';
            }

            const items = this.data.graphs.map(g => ({
                label: g.label || g.type,
                icon: g.type === active ? 'icon-check' : 'icon-graphic',
                description: g.type,
                onClick: () => this.setActiveType(g.type)
            }));

            if (items.length === 0) {
                items.push({
                    label: 'Нет данных',
                    icon: 'icon-info',
                    disabled: true
                });
            }

            this._typeTrigger = this.ui.listPanel({
                label: label,
                icon: 'icon-layers',
                items: items
            });

            return this._typeTrigger;
        }

        _buildCompareTrigger() {
            // ✅ Защита от раннего вызова
            if (!this._fieldsReady || !this.data || !Array.isArray(this.data.graphs)) {
                return this._makeStubTrigger('Сравнения', 'icon-layers');
            }

            if (this._compareTrigger && typeof this._compareTrigger.destroy === 'function') {
                try { this._compareTrigger.destroy(); } catch (e) {}
            }

            const active = this._getActiveGraph();
            const compares = (active && active.compareGraphs) ? active.compareGraphs : [];

            const typeKey = active ? active.type : null;
            const visMap = (typeKey && this.uiState.compareVisibility[typeKey]) || {};

            const items = compares.map(cg => ({
                label: cg.label || cg.id,
                icon: visMap[cg.id] !== false ? 'icon-eye' : 'icon-eye-off',
                onClick: () => {
                    const cur = visMap[cg.id] !== false;
                    this.setCompareVisible(typeKey, cg.id, !cur);
                }
            }));

            if (items.length === 0) {
                items.push({
                    label: 'Нет сравнений',
                    icon: 'icon-info',
                    disabled: true
                });
            }

            const visibleCount = compares.filter(cg => visMap[cg.id] !== false).length;

            this._compareTrigger = this.ui.listPanel({
                label: 'Сравнения' + (compares.length > 0 ? ` (${visibleCount}/${compares.length})` : ''),
                icon: 'icon-layers',
                items: items
            });

            return this._compareTrigger;
        }

        // ============================================================
        // CONTEXT MENU
        // ============================================================

        _showContextMenu(clientX, clientY) {
            if (this._isDestroyed) return;

            // ✅ Защита: если данных ещё нет — только PNG/JPEG/Очистить
            const hasData = this.data && Array.isArray(this.data.graphs) && this.data.graphs.length > 0;

            const active = hasData ? this._getActiveGraph() : null;
            const items = [];

            if (hasData) {
                // Типы
                const typeItems = this.data.graphs.map(g => ({
                    label: g.label || g.type,
                    icon: g.type === this.uiState.activeType ? 'icon-check' : 'icon-graphic',
                    onClick: () => this.setActiveType(g.type)
                }));

                items.push({
                    icon: 'icon-layers',
                    label: 'Типы',
                    submenu: typeItems
                });

                // Сравнения
                if (active && active.compareGraphs.length > 0) {
                    const typeKey = active.type;
                    const visMap = this.uiState.compareVisibility[typeKey] || {};
                    const compareItems = active.compareGraphs.map(cg => ({
                        label: cg.label || cg.id,
                        icon: visMap[cg.id] !== false ? 'icon-eye' : 'icon-eye-off',
                        onClick: () => {
                            const cur = visMap[cg.id] !== false;
                            this.setCompareVisible(typeKey, cg.id, !cur);
                        }
                    }));

                    items.push({
                        icon: 'icon-layers',
                        label: 'Сравнения',
                        submenu: compareItems
                    });
                }

                items.push({ divider: true });
            }

            // Изображение
            items.push({
                icon: 'icon-download',
                label: 'Сохранить PNG',
                onClick: () => this.exportPng()
            });
            items.push({
                icon: 'icon-download',
                label: 'Сохранить JPEG',
                onClick: () => this.exportJpeg()
            });

            items.push({ divider: true });

            // Очистка
            items.push({
                icon: 'icon-clear',
                label: 'Очистить сравнения',
                disabled: !active || active.compareGraphs.length === 0,
                onClick: () => this.clearCompare()
            });
            items.push({
                icon: 'icon-clear',
                label: 'Очистить всё',
                danger: true,
                onClick: () => this.clearAll()
            });

            this.ui.contextMenu({
                items: items,
                x: clientX,
                y: clientY,
                width: 220
            });
        }

        // ============================================================
        // ТЕМА
        // ============================================================

        _cssVar(name, fallback) {
            try {
                const v = getComputedStyle(document.documentElement)
                    .getPropertyValue(name)
                    .trim();
                return v || fallback;
            } catch (e) {
                return fallback;
            }
        }

        _colors() {
            const cs = getComputedStyle(document.documentElement);
            const get = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;

            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const baseGrid = isLight ? 'rgba(120, 100, 80, 0.12)' : 'rgba(200, 184, 154, 0.08)';

            return {
                bg:              get('--bg-dark', isLight ? '#e8ddd0' : '#0d0d0d'),
                border:          get('--border-color', isLight ? 'rgba(180,160,140,0.2)' : 'rgba(200,184,154,0.12)'),
                textPrimary:     get('--text-primary', isLight ? '#2a2824' : '#e0d8cc'),
                textSecondary:   get('--text-secondary', isLight ? 'rgba(60,55,50,0.75)' : 'rgba(200,184,154,0.7)'),
                textMuted:       get('--text-muted', isLight ? 'rgba(60,55,50,0.4)' : 'rgba(200,184,154,0.35)'),
                gridLine:        baseGrid,
                gridLineStrong:  isLight ? 'rgba(120, 100, 80, 0.22)' : 'rgba(200, 184, 154, 0.18)',
                axisLabel:       get('--text-primary', isLight ? 'rgba(40,38,34,0.9)' : 'rgba(220,210,190,0.85)'),
                axisLabelDim:    get('--text-muted', isLight ? 'rgba(60,55,50,0.5)' : 'rgba(200,184,154,0.5)'),
                axisLine:        isLight ? 'rgba(120, 100, 80, 0.4)' : 'rgba(200, 184, 154, 0.25)',
                accent:          get('--accent-red', '#cc2233')
            };
        }

        // ============================================================
        // РЕНДЕР
        // ============================================================

        _invalidateCaches() {
            this._ticksCache.x = null;
            this._ticksCache.y = null;
            this._rangeCache.x = null;
            this._rangeCache.y = null;
        }

        _scheduleRender() {
            if (this._isDestroyed || !this._ctx) return;
            if (this._renderPending) return;

            this._renderPending = true;
            if (this._renderRAF) cancelAnimationFrame(this._renderRAF);
            this._renderRAF = requestAnimationFrame(() => {
                this._renderRAF = null;
                this._renderPending = false;
                this._render();
            });
        }

        _doResize() {
            if (!this._canvas) return;
            const rect = this._canvas.getBoundingClientRect();
            const w = Math.round(rect.width || this._canvas.clientWidth || 0);
            const h = Math.round(rect.height || this._canvas.clientHeight || 0);
            if (w > 0 && h > 0) this.onResize(w, h);
        }

        _getPadding() {
            return { top: 20, bottom: 48, left: 52, right: 20 };
        }

        _getAxisRange(axis) {
            const cache = this._rangeCache[axis];
            if (cache) return cache;

            const active = this._getActiveGraph();
            if (!active) {
                const r = { min: DEFAULT_RANGE.min, max: DEFAULT_RANGE.max, range: DEFAULT_RANGE.range };
                this._rangeCache[axis] = r;
                return r;
            }

            const cfg = (axis === 'x' ? active.settings.xAxis : active.settings.yAxis) || {};

            let min = cfg.min;
            let max = cfg.max;

            const values = [];
            if (axis === 'x' && this._floatX) {
                for (let i = 0; i < this._floatX.length; i++) values.push(this._floatX[i]);
                for (const cf of this._compareFloats) {
                    if (!cf.visible) continue;
                    for (let i = 0; i < cf.floatX.length; i++) values.push(cf.floatX[i]);
                }
            } else if (axis === 'y' && this._floatY) {
                for (let i = 0; i < this._floatY.length; i++) values.push(this._floatY[i]);
                for (const cf of this._compareFloats) {
                    if (!cf.visible) continue;
                    for (let i = 0; i < cf.floatY.length; i++) values.push(cf.floatY[i]);
                }
                if (active.extraLines) {
                    for (const l of active.extraLines) {
                        if (typeof l.y === 'number') values.push(l.y);
                    }
                }
            }

            if (values.length === 0) {
                const r = {
                    min: min != null ? min : DEFAULT_RANGE.min,
                    max: max != null ? max : DEFAULT_RANGE.max,
                    range: DEFAULT_RANGE.range
                };
                this._rangeCache[axis] = r;
                return r;
            }

            let vmin = Infinity, vmax = -Infinity;
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                if (v < vmin) vmin = v;
                if (v > vmax) vmax = v;
            }

            if (min == null) min = vmin;
            if (max == null) max = vmax;
            if (min === max) { min -= 1; max += 1; }

            const r = { min, max, range: (max - min) || 1 };
            this._rangeCache[axis] = r;
            return r;
        }

        _mapX(v, pad, w, range, isLog) {
            let p;
            if (isLog && range.min > 0) {
                const lmin = Math.log10(range.min);
                const lmax = Math.log10(range.max);
                p = (Math.log10(Math.max(v, range.min)) - lmin) / (lmax - lmin);
            } else {
                p = (v - range.min) / range.range;
            }
            return pad.left + p * w;
        }

        _mapY(v, pad, h, range, isLog) {
            let p;
            if (isLog && range.min > 0) {
                const lmin = Math.log10(range.min);
                const lmax = Math.log10(range.max);
                p = (Math.log10(Math.max(v, range.min)) - lmin) / (lmax - lmin);
            } else {
                p = (v - range.min) / range.range;
            }
            return pad.top + h - p * h;
        }

        _unmapX(px, pad, w, range, isLog) {
            const p = (px - pad.left) / w;
            if (isLog && range.min > 0) {
                const lmin = Math.log10(range.min);
                const lmax = Math.log10(range.max);
                return Math.pow(10, lmin + p * (lmax - lmin));
            }
            return range.min + p * range.range;
        }

        _interpolateY(floatX, floatY, x) {
            const len = Math.min(floatX.length, floatY.length);
            if (len === 0) return null;
            if (len === 1) return floatY[0];

            const ascending = floatX[0] <= floatX[len - 1];

            if (ascending) {
                if (x < floatX[0] || x > floatX[len - 1]) return null;
            } else {
                if (x > floatX[0] || x < floatX[len - 1]) return null;
            }

            let lo = 0;
            let hi = len - 1;

            if (ascending) {
                while (hi - lo > 1) {
                    const mid = (lo + hi) >> 1;
                    if (floatX[mid] <= x) lo = mid;
                    else hi = mid;
                }
            } else {
                while (hi - lo > 1) {
                    const mid = (lo + hi) >> 1;
                    if (floatX[mid] >= x) hi = mid;
                    else lo = mid;
                }
            }

            const x0 = floatX[lo];
            const x1 = floatX[hi];
            const y0 = floatY[lo];
            const y1 = floatY[hi];

            if (x1 === x0) return y0;

            const t = (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * t;
        }

        _render() {
            if (!this._ctx || !this._canvas || this._isDestroyed) return;

            const ctx = this._ctx;
            const colors = this._colors();

            const physCssW = this._canvas.width / this._dpr;
            const physCssH = this._canvas.height / this._dpr;

            ctx.fillStyle = colors.bg;
            ctx.fillRect(0, 0, physCssW, physCssH);

            const w = this._width;
            const h = this._height;
            if (w < 10 || h < 10) return;

            const pad = this._getPadding();
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;
            if (chartW < 10 || chartH < 10) return;

            const active = this._getActiveGraph();

           if (!active) return;

            const xRange = this._getAxisRange('x');
            const yRange = this._getAxisRange('y');

            const xCfg = active.settings.xAxis || {};
            const yCfg = active.settings.yAxis || {};
            const appearance = active.settings.appearance || {};

            const isXLog = xCfg.log && xRange.min > 0;
            const isYLog = yCfg.log && yRange.min > 0;

            // Сетка
            if (appearance.showGrid !== false) {
                ctx.strokeStyle = colors.gridLine;
                ctx.lineWidth = 0.5;

                const xTicks = this._generateTicks(xRange, isXLog);
                for (const t of xTicks) {
                    const x = this._mapX(t, pad, chartW, xRange, isXLog);
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + chartH);
                    ctx.stroke();
                }

                const yTicks = this._generateTicks(yRange, isYLog);
                for (const t of yTicks) {
                    const y = this._mapY(t, pad, chartH, yRange, isYLog);
                    ctx.beginPath();
                    ctx.moveTo(pad.left, y);
                    ctx.lineTo(pad.left + chartW, y);
                    ctx.stroke();
                }
            }

            // Оси
            ctx.strokeStyle = colors.axisLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, pad.top + chartH);
            ctx.lineTo(pad.left + chartW, pad.top + chartH);
            ctx.stroke();

            // Тики X
            ctx.fillStyle = colors.axisLabel;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xTicks = this._generateTicks(xRange, isXLog);
            for (const t of xTicks) {
                const x = this._mapX(t, pad, chartW, xRange, isXLog);
                ctx.fillText(this._fmt(t, xCfg.precision), x, pad.top + chartH + 6);
            }

            // Тики Y
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const yTicks = this._generateTicks(yRange, isYLog);
            for (const t of yTicks) {
                const y = this._mapY(t, pad, chartH, yRange, isYLog);
                ctx.fillText(this._fmt(t, yCfg.precision), pad.left - 6, y);
            }

            // Подписи осей
            ctx.fillStyle = colors.axisLabelDim;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(xCfg.label || 'X', pad.left + chartW / 2, pad.top + chartH + 28);

            ctx.save();
            ctx.translate(14, pad.top + chartH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(yCfg.label || 'Y', 0, 0);
            ctx.restore();

            // extraLines
            const extraLines = active.extraLines || [];
            for (const l of extraLines) {
                if (typeof l.y === 'number') {
                    if (l.y < yRange.min || l.y > yRange.max) continue;
                    const y = this._mapY(l.y, pad, chartH, yRange, isYLog);
                    ctx.setLineDash(l.dashed ? [4, 6] : []);
                    ctx.beginPath();
                    ctx.moveTo(pad.left, y);
                    ctx.lineTo(pad.left + chartW, y);
                    ctx.strokeStyle = l.color || colors.gridLine;
                    ctx.lineWidth = 0.9;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                if (typeof l.x === 'number') {
                    if (l.x < xRange.min || l.x > xRange.max) continue;
                    const x = this._mapX(l.x, pad, chartW, xRange, isXLog);
                    ctx.setLineDash(l.dashed ? [4, 6] : []);
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + chartH);
                    ctx.strokeStyle = l.color || colors.gridLine;
                    ctx.lineWidth = 0.9;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Главная линия
            this._renderMainLine(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog);

            // Сравнения
            for (const cf of this._compareFloats) {
                if (!cf.visible) continue;
                if (!cf.floatX || cf.floatX.length === 0) continue;
                this._renderSeries(
                    ctx, cf.floatX, cf.floatY, cf.color,
                    pad, chartW, chartH, xRange, yRange, isXLog, isYLog, 1.5
                );
            }

            // Легенда
            if (appearance.showLegend !== false) {
                this._renderLegend(ctx, pad, chartH);
            }

            // Crosshair
            if (this._isHovering) {
                this._renderCrosshair(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog);
            }
        }

        _renderMainLine(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog) {
            const fx = this._floatX;
            const fy = this._floatY;
            if (!fx || !fy) return;
            const len = Math.min(fx.length, fy.length);
            if (len === 0) return;

            const active = this._getActiveGraph();
            const color = (active && active.color) || '#cc2233';
            const appearance = (active && active.settings.appearance) || {};

            if (appearance.showFill) {
                ctx.beginPath();
                const x0 = this._mapX(fx[0], pad, chartW, xRange, isXLog);
                const y0 = this._mapY(fy[0], pad, chartH, yRange, isYLog);
                ctx.moveTo(x0, pad.top + chartH);
                ctx.lineTo(x0, y0);
                for (let i = 0; i < len; i++) {
                    ctx.lineTo(
                        this._mapX(fx[i], pad, chartW, xRange, isXLog),
                        this._mapY(fy[i], pad, chartH, yRange, isYLog)
                    );
                }
                const xN = this._mapX(fx[len - 1], pad, chartW, xRange, isXLog);
                ctx.lineTo(xN, pad.top + chartH);
                ctx.closePath();

                const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
                const alpha = appearance.fillOpacity ?? 0.15;
                const hex = Math.round(alpha * 255).toString(16).padStart(2, '0');
                grad.addColorStop(0, color + hex);
                grad.addColorStop(1, color + '05');
                ctx.fillStyle = grad;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = appearance.lineWidth || 1.8;
            ctx.setLineDash([]);
            for (let i = 0; i < len; i++) {
                const x = this._mapX(fx[i], pad, chartW, xRange, isXLog);
                const y = this._mapY(fy[i], pad, chartH, yRange, isYLog);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            if (appearance.showPoints) {
                const step = Math.max(1, Math.floor(len / 50));
                ctx.fillStyle = color + '80';
                for (let i = 0; i < len; i += step) {
                    const x = this._mapX(fx[i], pad, chartW, xRange, isXLog);
                    const y = this._mapY(fy[i], pad, chartH, yRange, isYLog);
                    ctx.beginPath();
                    ctx.arc(x, y, appearance.pointSize || 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        _renderSeries(ctx, fx, fy, color, pad, chartW, chartH, xRange, yRange, isXLog, isYLog, lineWidth) {
            const len = Math.min(fx.length, fy.length);
            if (len === 0) return;

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth || 1.5;
            ctx.setLineDash([]);
            for (let i = 0; i < len; i++) {
                const x = this._mapX(fx[i], pad, chartW, xRange, isXLog);
                const y = this._mapY(fy[i], pad, chartH, yRange, isYLog);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        _renderCrosshair(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog) {
            if (this._mouseX < pad.left || this._mouseX > pad.left + chartW) return;

            const colors = this._colors();
            const xValue = this._unmapX(this._mouseX, pad, chartW, xRange, isXLog);

            ctx.strokeStyle = colors.gridLineStrong;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(this._mouseX, pad.top);
            ctx.lineTo(this._mouseX, pad.top + chartH);
            ctx.stroke();
            ctx.setLineDash([]);

            const markers = this._getHoverMarkers(xValue, pad, chartW, chartH, yRange, isYLog);
            for (const m of markers) {
                ctx.beginPath();
                ctx.arc(this._mouseX, m.pixelY, 4, 0, Math.PI * 2);
                ctx.fillStyle = m.color;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(this._mouseX, m.pixelY, 4, 0, Math.PI * 2);
                ctx.strokeStyle = colors.bg;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.strokeStyle = m.color + '60';
                ctx.lineWidth = 0.8;
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.moveTo(this._mouseX, m.pixelY);
                ctx.lineTo(pad.left + chartW, m.pixelY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        _getHoverMarkers(xValue, pad, chartW, chartH, yRange, isYLog) {
            const markers = [];
            const active = this._getActiveGraph();

            if (this._floatX && this._floatY) {
                const y = this._interpolateY(this._floatX, this._floatY, xValue);
                if (y != null) {
                    markers.push({
                        color: (active && active.color) || '#cc2233',
                        label: (active && active.label) || 'Main',
                        value: y,
                        pixelY: this._mapY(y, pad, chartH, yRange, isYLog)
                    });
                }
            }

            for (const cf of this._compareFloats) {
                if (!cf.visible) continue;
                const y = this._interpolateY(cf.floatX, cf.floatY, xValue);
                if (y != null) {
                    markers.push({
                        color: cf.color || '#66ddff',
                        label: cf.label || 'Compare',
                        value: y,
                        pixelY: this._mapY(y, pad, chartH, yRange, isYLog)
                    });
                }
            }

            return markers;
        }

        _renderLegend(ctx, pad, chartH) {
            const colors = this._colors();
            const active = this._getActiveGraph();
            if (!active) return;

            // Пустая болванка — легенду не рисуем
            if (active.type === '_empty') return;

            const items = [];
            items.push({
                color: active.color || '#cc2233',
                label: active.label || 'Main',
                type: 'line'
            });

            for (const cf of this._compareFloats) {
                if (!cf.visible) continue;
                items.push({
                    color: cf.color || '#66ddff',
                    label: cf.label || 'Compare',
                    type: 'line'
                });
            }
            for (const l of (active.extraLines || [])) {
                if (l.label) items.push({ color: l.color || colors.gridLine, label: l.label, type: 'dashed' });
            }

            if (items.length === 0) return;

            let x = pad.left + 8;
            let y = pad.top + 8;

            ctx.font = '9px sans-serif';
            ctx.textBaseline = 'middle';

            for (const it of items) {
                if (y + 14 > pad.top + chartH) break;

                let label = it.label;
                if (label.length > 18) label = label.slice(0, 17) + '…';

                ctx.textAlign = 'left';
                ctx.fillStyle = colors.axisLabelDim;
                ctx.fillText(label, x, y);

                const labelW = Math.min(ctx.measureText(label).width, 150);
                const lineX = x + labelW + 6;

                if (it.type === 'dashed') {
                    ctx.setLineDash([4, 5]);
                    ctx.strokeStyle = it.color;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(lineX, y);
                    ctx.lineTo(lineX + 16, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    ctx.fillStyle = it.color;
                    ctx.fillRect(lineX, y - 1, 16, 2);
                    ctx.fillStyle = colors.axisLabelDim;
                }

                y += 14;
            }
        }

        _generateTicks(range, isLog) {
            const { min, max } = range;
            const ticks = [];

            if (isLog && min > 0) {
                const lmin = Math.floor(Math.log10(min));
                const lmax = Math.ceil(Math.log10(max));
                for (let d = lmin; d <= lmax; d++) {
                    const base = Math.pow(10, d);
                    for (let s = 1; s <= 9; s++) {
                        const v = base * s;
                        if (v >= min && v <= max) ticks.push(v);
                    }
                }
                return ticks.length > 30 ? ticks.filter((_, i) => i % 3 === 0) : ticks;
            }

            const step = this._calculateStep(min, max);
            let start = Math.ceil(min / step) * step;
            while (start <= max) {
                ticks.push(start);
                start += step;
            }
            return ticks.length > 15 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
        }

        _calculateStep(min, max) {
            const range = max - min;
            if (range === 0) return 1;
            const rough = range / 8;
            const mag = Math.pow(10, Math.floor(Math.log10(rough)));
            const norm = rough / mag;
            let step;
            if (norm < 1.5) step = mag;
            else if (norm < 3.5) step = 2 * mag;
            else if (norm < 7.5) step = 5 * mag;
            else step = 10 * mag;
            return step;
        }

        _fmt(value, precision) {
            if (value === 0) return '0';
            const abs = Math.abs(value);
            if (abs >= 1000000) return (value / 1000000).toFixed(1) + 'M';
            if (abs >= 1000) return (value / 1000).toFixed(1) + 'k';
            if (abs >= 100) return value.toFixed(0);
            return value.toFixed(precision ?? 2);
        }

        // ============================================================
        // HOVER
        // ============================================================

        _updateHover(clientX, clientY) {
            if (!this._isHovering || !this._canvas) {
                this._hideTooltip();
                return;
            }

            const pad = this._getPadding();
            const chartW = this._width - pad.left - pad.right;
            const chartH = this._height - pad.top - pad.bottom;
            if (chartW < 10 || chartH < 10) return;

            if (this._mouseX < pad.left || this._mouseX > pad.left + chartW) {
                this._hideTooltip();
                this._scheduleRender();
                return;
            }

            const active = this._getActiveGraph();
            if (!active) {
                this._hideTooltip();
                this._scheduleRender();
                return;
            }

            const xRange = this._getAxisRange('x');
            const yRange = this._getAxisRange('y');
            const xCfg = active.settings.xAxis || {};
            const yCfg = active.settings.yAxis || {};
            const isXLog = xCfg.log && xRange.min > 0;
            const isYLog = yCfg.log && yRange.min > 0;

            const xValue = this._unmapX(this._mouseX, pad, chartW, xRange, isXLog);
            const markers = this._getHoverMarkers(xValue, pad, chartW, chartH, yRange, isYLog);

            this._updateTooltipContent(xValue, markers, active);
            this._positionTooltip(clientX, clientY);
            this._showTooltip();

            this._scheduleRender();
        }

        _updateTooltipContent(xValue, markers, active) {
            if (!this._tooltip || !this._tooltipX || !this._tooltipRows) return;

            const xCfg = active.settings.xAxis || {};
            const yCfg = active.settings.yAxis || {};
            const pX = xCfg.precision ?? 2;
            const pY = yCfg.precision ?? 2;
            const uX = (active.metadata && active.metadata.unitX) || xCfg.label || '';
            const uY = (active.metadata && active.metadata.unitY) || yCfg.label || '';

            this._tooltipX.innerHTML = '';

            const xLabel = document.createElement('span');
            xLabel.textContent = 'X';
            Object.assign(xLabel.style, {
                fontSize: '9px',
                fontWeight: '700',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: 'var(--text-muted, rgba(200,184,154,0.5))',
                flexShrink: '0'
            });

            const xValueEl = document.createElement('span');
            xValueEl.textContent = this._fmt(xValue, pX);
            Object.assign(xValueEl.style, {
                fontWeight: '700',
                fontSize: '13px',
                color: 'var(--text-primary, #e0d8cc)',
                fontFamily: '"Courier New", monospace',
                letterSpacing: '0.2px'
            });

            this._tooltipX.appendChild(xLabel);
            this._tooltipX.appendChild(xValueEl);

            if (uX) {
                const xUnit = document.createElement('span');
                xUnit.textContent = uX;
                Object.assign(xUnit.style, {
                    fontSize: '10px',
                    color: 'var(--text-muted, rgba(200,184,154,0.5))',
                    marginLeft: '2px'
                });
                this._tooltipX.appendChild(xUnit);
            }

            this._tooltipRows.innerHTML = '';

            if (markers.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = 'нет данных в этой точке';
                Object.assign(empty.style, {
                    padding: '8px 12px',
                    fontSize: '10px',
                    color: 'var(--text-muted, rgba(200,184,154,0.5))',
                    fontStyle: 'italic',
                    textAlign: 'center'
                });
                this._tooltipRows.appendChild(empty);
                return;
            }

            for (const m of markers) {
                const row = document.createElement('div');
                Object.assign(row.style, {
                    display: 'grid',
                    gridTemplateColumns: '12px 1fr auto',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 12px',
                    lineHeight: '1.3'
                });

                const swatch = document.createElement('span');
                Object.assign(swatch.style, {
                    width: '10px',
                    height: '3px',
                    borderRadius: '2px',
                    background: m.color,
                    flexShrink: '0',
                    boxShadow: `0 0 6px ${m.color}55`
                });
                row.appendChild(swatch);

                const label = document.createElement('span');
                label.textContent = m.label;
                Object.assign(label.style, {
                    fontSize: '10px',
                    color: 'var(--text-secondary, rgba(200,184,154,0.75))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: '0'
                });
                row.appendChild(label);

                const valueWrap = document.createElement('span');
                Object.assign(valueWrap.style, {
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: '3px',
                    fontFamily: '"Courier New", monospace',
                    flexShrink: '0'
                });

                const valueEl = document.createElement('span');
                valueEl.textContent = this._fmt(m.value, pY);
                Object.assign(valueEl.style, {
                    fontSize: '12px',
                    fontWeight: '700',
                    color: m.color,
                    letterSpacing: '0.2px'
                });
                valueWrap.appendChild(valueEl);

                if (uY) {
                    const unitEl = document.createElement('span');
                    unitEl.textContent = uY;
                    Object.assign(unitEl.style, {
                        fontSize: '9px',
                        color: 'var(--text-muted, rgba(200,184,154,0.5))'
                    });
                    valueWrap.appendChild(unitEl);
                }

                row.appendChild(valueWrap);
                this._tooltipRows.appendChild(row);
            }

            if (markers.length > 0) {
                this._tooltipRows.style.paddingTop = '4px';
                this._tooltipRows.style.paddingBottom = '6px';
            }
        }

        _positionTooltip(clientX, clientY) {
            if (!this._tooltip) return;

            this._tooltip.style.visibility = 'hidden';
            this._tooltip.style.display = 'flex';

            const tw = this._tooltip.offsetWidth || 200;
            const th = this._tooltip.offsetHeight || 100;

            const OFFSET = 16;
            let left = clientX + OFFSET;
            let top  = clientY + OFFSET;

            if (left + tw > window.innerWidth - 8) {
                left = clientX - tw - OFFSET;
            }
            if (left < 8) left = 8;

            if (top + th > window.innerHeight - 8) {
                top = clientY - th - OFFSET;
            }
            if (top < 8) top = 8;

            this._tooltip.style.left = left + 'px';
            this._tooltip.style.top = top + 'px';
            this._tooltip.style.visibility = '';
        }

        _showTooltip() {
            if (!this._tooltip) return;
            this._tooltip.style.display = 'flex';
            requestAnimationFrame(() => {
                if (this._tooltip) this._tooltip.style.opacity = '1';
            });
        }

        _hideTooltip() {
            if (!this._tooltip) return;
            this._tooltip.style.opacity = '0';
            setTimeout(() => {
                if (this._tooltip && this._tooltip.style.opacity === '0') {
                    this._tooltip.style.display = 'none';
                }
            }, 130);
        }

        // ============================================================
        // ЭКСПОРТ ИЗОБРАЖЕНИЯ
        // ============================================================

        _exportImage(format) {
            if (!this._canvas) {
                this.notify('Ошибка', 'Нет canvas', 'warning');
                return;
            }
            const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const ext = format === 'jpeg' ? 'jpg' : 'png';
            try {
                const dataUrl = this._canvas.toDataURL(mime);
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `graphic_${new Date().toISOString().slice(0, 10)}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                this.notify('Экспорт', `Изображение сохранено в ${format.toUpperCase()}`, 'success');
            } catch (e) {
                console.error('[GraphicWindow] Export image error:', e);
                this.notify('Ошибка', 'Не удалось сохранить изображение', 'error');
            }
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================

    if (typeof window !== 'undefined') {
        window.GraphicWindow = GraphicWindow;
        console.log('[GraphicWindow] Registered class globally v2.0.1');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { GraphicWindow };
    }

})();