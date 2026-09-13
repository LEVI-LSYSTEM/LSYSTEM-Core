// types/GraphicWindow.js
// Версия 5.5.0 - Совместим с ядром v7 (история-снапшоты) + фикс двойной отрисовки

(function() {
    'use strict';

    console.log('[GraphicWindow] Loading v5.5.0...');

    // ============================================================
    // 0. ЦВЕТА
    // ============================================================
    const ThemeColors = {
        dark: {
            bg: '#0d0d0d',
            border: 'rgba(200, 184, 154, 0.12)',
            textPrimary: '#e0d8cc',
            textSecondary: 'rgba(200, 184, 154, 0.7)',
            textMuted: 'rgba(200, 184, 154, 0.35)',
            gridLine: 'rgba(200, 184, 154, 0.08)',
            gridLineStrong: 'rgba(200, 184, 154, 0.15)',
            axisLabel: 'rgba(220, 210, 190, 0.85)',
            axisLabelDim: 'rgba(200, 184, 154, 0.5)',
            axisLine: 'rgba(200, 184, 154, 0.25)',
            accent: '#cc2233'
        },
        light: {
            bg: '#f5f2ed',
            border: 'rgba(180, 160, 140, 0.2)',
            textPrimary: '#2a2824',
            textSecondary: 'rgba(60, 55, 50, 0.75)',
            textMuted: 'rgba(60, 55, 50, 0.4)',
            gridLine: 'rgba(180, 160, 140, 0.12)',
            gridLineStrong: 'rgba(180, 160, 140, 0.2)',
            axisLabel: 'rgba(40, 38, 34, 0.9)',
            axisLabelDim: 'rgba(60, 55, 50, 0.5)',
            axisLine: 'rgba(120, 100, 80, 0.4)',
            accent: '#cc2233'
        }
    };

    function getCurrentTheme() {
        const t = document.documentElement.getAttribute('data-theme') || 'dark';
        return t === 'light' ? 'light' : 'dark';
    }
    function getColors() {
        return ThemeColors[getCurrentTheme()] || ThemeColors.dark;
    }

    // ============================================================
    // 1. КЛАСС
    // ============================================================
    class GraphicWindow {
        constructor(container, windowData, options = {}) {
            this.container = container;
            this.windowData = windowData;
            this.options = options;
            this.id = windowData.id;
            this.type = windowData.type || 'graphic';

            // DI
            this._dataBus = options.dataBus || null;
            this._registry = options.registry || null;
            this._eventBus = options.eventBus || null;
            this._messageBus = options.messageBus || null;
            this._layoutManager = options.layoutManager || null;
            this._baseWindow = options._baseWindow || null;

            // Состояние
            this._isReady = false;
            this._isDestroyed = false;
            this._isVisible = true;
            this._didInitialRender = false;

            // DOM
            this._root = null;
            this._canvas = null;
            this._ctx = null;
            this._tooltip = null;

            // Размеры
            this._width = 0;
            this._height = 0;
            this._dpr = 1;
            this._lastCssW = 0;
            this._lastCssH = 0;

            // Данные
            this._data = null;
            this._floatX = null;
            this._floatY = null;
            this._compareGraphs = [];
            this._extraLines = [];

            // Оси / внешний вид
            this._axisConfig = {
                x: { label: 'Ось X', min: null, max: null, log: false, precision: 2 },
                y: { label: 'Ось Y', min: null, max: null, log: false, precision: 2 }
            };
            this._appearance = {
                lineWidth: 1.8,
                fillOpacity: 0.15,
                pointSize: 1.5,
                showPoints: true,
                showGrid: true,
                showLegend: true,
                showFill: true
            };

            // Метаданные
            this._metadata = {
                title: windowData.title || 'График',
                unitX: '',
                unitY: '',
                version: '5.5.0',
                created: new Date().toISOString()
            };

            // Рендер
            this._needsRender = false;
            this._renderFrameId = null;
            this._renderPending = false;
            this._resizeRAF = null;
            this._zeroAttempts = 0;

            // ResizeObserver на _root
            this._selfResizeObserver = null;

            // Tooltip / hover
            this._isHovering = false;
            this._mouseX = -1;
            this._mouseY = -1;
            this._hoverIndex = -1;

            // Кэши
            this._ticksCache = { x: null, y: null };
            this._rangeCache = { x: null, y: null };

            this._init();
        }

        // ============================================================
        // 2. ИНИЦИАЛИЗАЦИЯ
        // ============================================================
        _init() {
            if (this._isReady) return;
            console.log(`[GraphicWindow] Initializing: ${this.id}`);

            this._buildDOM();

            this._isReady = true;

            // Первый рендер — двойной rAF
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this._isDestroyed) return;
                    this._performResize();
                    this._needsRender = true;
                    this._scheduleRender();
                });
            });

            console.log(`[GraphicWindow] ✅ Ready: ${this.id}`);
        }

        // ============================================================
        // 3. DOM
        // ============================================================
        _buildDOM() {
            this._root = document.createElement('div');
            this._root.className = 'graphic-window-root';
            Object.assign(this._root.style, {
                display: 'block',
                background: 'var(--bg-dark, #0d0d0d)',
                overflow: 'hidden'
            });

            // ✅ Без width/height: они ставятся явно в _performResize
            this._canvas = document.createElement('canvas');
            this._canvas.className = 'graphic-canvas';
            Object.assign(this._canvas.style, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                cursor: 'crosshair',
                imageRendering: 'auto'
            });

            this._root.appendChild(this._canvas);
            this.container.appendChild(this._root);

            this._ctx = this._canvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });

            if (!this._ctx) {
                console.error('[GraphicWindow] Failed to get 2D context');
                return;
            }

            // ResizeObserver на _root — ловит ручной ресайз.
            // Перестройка layout ловится ядром через layout-rendered → resize().
            if (typeof ResizeObserver !== 'undefined') {
                let raf = null;
                this._selfResizeObserver = new ResizeObserver(() => {
                    if (raf) cancelAnimationFrame(raf);
                    raf = requestAnimationFrame(() => {
                        raf = null;
                        if (this._isDestroyed) return;
                        this._needsRender = true;
                        this._performResize();
                    });
                });
                this._selfResizeObserver.observe(this._root);
            }

            this._createTooltip();
            this._setupMouseEvents();
        }

        // ============================================================
        // 4. КОНТРАКТ С ЯДРОМ
        // ============================================================
        onDataUpdate(record) {
            if (!record) return;
            if (record.metadata) this._metadata = { ...this._metadata, ...record.metadata };

            if (record.data === null) {
                this._data = null;
                this._floatX = null;
                this._floatY = null;
                this._compareGraphs = [];
                this._extraLines = [];
            } else if (record.data) {
                this._importPayload(record.data);
            }

            this._invalidateCaches();
            this._needsRender = true;
            this._didInitialRender = false;
            this._scheduleResize();
            this._scheduleRender();
        }

        onThemeChange(theme) {
            if (this._isDestroyed || !this._isReady) return;
            this._needsRender = true;
            this._scheduleRender();
        }

        onVisibilityChange(visible) {
            this._isVisible = visible;
            if (visible) {
                this._needsRender = true;
                this._scheduleResize();
                this._scheduleRender();
            }
        }

        resize() {
            if (this._isDestroyed) return;
            this._needsRender = true;
            this._scheduleResize();
        }

        // ============================================================
        // 5. ИМПОРТ / ЭКСПОРТ ДАННЫХ
        // ============================================================
        _importPayload(payload) {
            if (!payload || typeof payload !== 'object') return;

            if (payload.main && Array.isArray(payload.main.xValues) && Array.isArray(payload.main.yValues)) {
                const x = payload.main.xValues;
                const y = payload.main.yValues;
                const len = Math.min(x.length, y.length);
                const fx = new Float32Array(len);
                const fy = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    fx[i] = x[i] || 0;
                    fy[i] = y[i] || 0;
                }
                this._data = {
                    xValues: x.slice(),
                    yValues: y.slice(),
                    color: payload.main.color || '#cc2233',
                    label: payload.main.label || 'Основной график'
                };
                this._floatX = fx;
                this._floatY = fy;
            }

            if (Array.isArray(payload.compareGraphs)) {
                this._compareGraphs = payload.compareGraphs
                    .filter(g => g && Array.isArray(g.xValues) && Array.isArray(g.yValues))
                    .map((g, i) => {
                        const x = g.xValues;
                        const y = g.yValues;
                        const len = Math.min(x.length, y.length);
                        const fx = new Float32Array(len);
                        const fy = new Float32Array(len);
                        for (let j = 0; j < len; j++) {
                            fx[j] = x[j] || 0;
                            fy[j] = y[j] || 0;
                        }
                        return {
                            xValues: x.slice(),
                            yValues: y.slice(),
                            floatX: fx,
                            floatY: fy,
                            color: g.color || this._pickCompareColor(i),
                            label: g.label || `Сравнение ${i + 1}`
                        };
                    });
            }

            if (Array.isArray(payload.extraLines)) {
                this._extraLines = payload.extraLines
                    .filter(l => l && typeof l.y === 'number')
                    .map(l => ({
                        y: l.y,
                        color: l.color || 'rgba(200,184,154,0.15)',
                        label: l.label || `${l.y}`,
                        dashed: l.dashed !== false
                    }))
                    .sort((a, b) => a.y - b.y);
            }

            if (payload.settings) {
                const s = payload.settings;
                if (s.xAxis) this._axisConfig.x = { ...this._axisConfig.x, ...s.xAxis };
                if (s.yAxis) this._axisConfig.y = { ...this._axisConfig.y, ...s.yAxis };
                if (s.appearance) this._appearance = { ...this._appearance, ...s.appearance };
            }

            if (payload.metadata) this._metadata = { ...this._metadata, ...payload.metadata };

            this._invalidateCaches();
        }

        _pickCompareColor(i) {
            const palette = ['#66ddff', '#ffdd44', '#66ff88', '#ff66aa', '#cc88ff', '#ff8844'];
            return palette[i % palette.length];
        }

        _buildPayload() {
            return {
                main: this._data ? {
                    xValues: this._data.xValues.slice(),
                    yValues: this._data.yValues.slice(),
                    color: this._data.color,
                    label: this._data.label
                } : null,
                compareGraphs: this._compareGraphs.map(g => ({
                    xValues: g.xValues.slice(),
                    yValues: g.yValues.slice(),
                    color: g.color,
                    label: g.label
                })),
                extraLines: this._extraLines.map(l => ({ ...l })),
                settings: {
                    xAxis: { ...this._axisConfig.x },
                    yAxis: { ...this._axisConfig.y },
                    appearance: { ...this._appearance }
                },
                metadata: {
                    title: this._metadata.title,
                    unitX: this._metadata.unitX,
                    unitY: this._metadata.unitY
                },
                timestamp: new Date().toISOString(),
                version: '5.5.0'
            };
        }

        /**
         * ✅ Сохранение в DataBus.
         * @param {boolean} record — писать ли в историю (значимое изменение данных)
         * @param {string} [label] — метка для истории
         */
        _saveData(record = false, label = null) {
            if (!this._dataBus) {
                return;
            }

            this._dataBus.setWindowData(this.id, {
                id: this.id,
                type: this.type,
                metadata: { ...this._metadata },
                data: this._buildPayload(),
                uiState: this.getState()
            });

            if (record && window.historyManager) {
                const typeName = (window.__registry?.getType(this.type)?.name) || this.type;
                const fullLabel = `${typeName} — ${label || 'данные изменены'}`;

                Promise.resolve().then(() => {
                    try {
                        window.historyManager.record(fullLabel);
                    } catch (e) {
                    }
                });
            }
        }

        // ============================================================
        // 6. ПУБЛИЧНЫЙ API
        // ============================================================
        getAllData() {
            return {
                metadata: { ...this._metadata },
                data: this._buildPayload()
            };
        }

        setAllData(data) {
            if (!data) return;
            if (data.metadata) this._metadata = { ...this._metadata, ...data.metadata };
            if (data.data) {
                this._importPayload(data.data);
                this._invalidateCaches();
                this._needsRender = true;
                this._scheduleResize();
                this._scheduleRender();
            }
        }

        getMetadata() { return { ...this._metadata }; }

        getData() {
            if (!this._data) return null;
            return {
                xValues: this._data.xValues.slice(),
                yValues: this._data.yValues.slice(),
                color: this._data.color,
                label: this._data.label
            };
        }

        /**
         * ✅ Только меняет состояние. Сохранение — за вызывающим методом.
         */
        setData(data) {
            if (data && Array.isArray(data.xValues) && Array.isArray(data.yValues)) {
                const len = Math.min(data.xValues.length, data.yValues.length);
                const fx = new Float32Array(len);
                const fy = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    fx[i] = data.xValues[i] || 0;
                    fy[i] = data.yValues[i] || 0;
                }
                this._data = {
                    xValues: data.xValues.slice(),
                    yValues: data.yValues.slice(),
                    color: data.color || '#cc2233',
                    label: data.label || 'Основной график'
                };
                this._floatX = fx;
                this._floatY = fy;
                this._invalidateCaches();
                this._needsRender = true;
                this._scheduleRender();
                return true;
            }
            return false;
        }

        getState() {
            return {
                axisConfig: JSON.parse(JSON.stringify(this._axisConfig)),
                appearance: { ...this._appearance }
            };
        }

        setState(state) {
            if (!state) return this;
            if (state.axisConfig) {
                if (state.axisConfig.x) this._axisConfig.x = { ...this._axisConfig.x, ...state.axisConfig.x };
                if (state.axisConfig.y) this._axisConfig.y = { ...this._axisConfig.y, ...state.axisConfig.y };
            }
            if (state.appearance) this._appearance = { ...this._appearance, ...state.appearance };
            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            return this;
        }

        exportData() {
            return {
                id: this.id,
                type: this.type,
                version: '5.5.0',
                timestamp: new Date().toISOString(),
                metadata: { ...this._metadata },
                data: this._buildPayload(),
                uiState: this.getState()
            };
        }

        importData(lswData) {
            if (!lswData) return false;
            if (lswData.metadata) this._metadata = { ...this._metadata, ...lswData.metadata };
            if (lswData.uiState) this.setState(lswData.uiState);
            if (lswData.data) {
                this._importPayload(lswData.data);
                this._invalidateCaches();
                this._needsRender = true;
                this._scheduleResize();
                this._scheduleRender();
                return true;
            }
            return false;
        }

        getRoot() { return this._root; }

        // ============================================================
        // 7. МУТИРУЮЩИЕ МЕТОДЫ — со записью в историю
        // ============================================================
        updateData(xValues, yValues, color, label) {
            if (xValues && yValues && xValues.length > 0) {
                this.setData({ xValues, yValues, color, label });
                this._saveData(true, 'данные обновлены');
                return true;
            }
            return false;
        }

        addCompareGraph(xValues, yValues, color, label) {
            if (!xValues || !yValues || xValues.length === 0) return false;

            const len = Math.min(xValues.length, yValues.length);
            const fx = new Float32Array(len);
            const fy = new Float32Array(len);
            for (let i = 0; i < len; i++) {
                fx[i] = xValues[i] || 0;
                fy[i] = yValues[i] || 0;
            }

            const i = this._compareGraphs.length;
            this._compareGraphs.push({
                xValues: xValues.slice(),
                yValues: yValues.slice(),
                floatX: fx,
                floatY: fy,
                color: color || this._pickCompareColor(i),
                label: label || `Сравнение ${i + 1}`
            });

            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            this._saveData(true, 'добавлено сравнение');
            return true;
        }

        addExtraLine(y, color, label, dashed = true) {
            this._extraLines.push({
                y,
                color: color || 'rgba(200,184,154,0.15)',
                label: label || `${y}`,
                dashed
            });
            this._extraLines.sort((a, b) => a.y - b.y);
            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            this._saveData(true, 'добавлена линия');
            return this._extraLines.length - 1;
        }

        removeExtraLine(index) {
            if (index >= 0 && index < this._extraLines.length) {
                this._extraLines.splice(index, 1);
                this._invalidateCaches();
                this._needsRender = true;
                this._scheduleRender();
                this._saveData(true, 'удалена линия');
                return true;
            }
            return false;
        }

        clearExtraLines() {
            this._extraLines = [];
            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            this._saveData(true, 'линии очищены');
        }

        clearCompare() {
            this._compareGraphs = [];
            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            this._saveData(true, 'сравнение очищено');
            this._baseWindow?.notify?.('Очищено', 'Данные сравнения удалены', 'info');
        }

        clearAll() {
            this._data = null;
            this._floatX = null;
            this._floatY = null;
            this._compareGraphs = [];
            this._extraLines = [];
            this._invalidateCaches();
            this._needsRender = true;
            this._scheduleRender();
            this._saveData(true, 'всё очищено');
            this._baseWindow?.notify?.('Очищено', 'Все данные удалены', 'info');
        }

        // ============================================================
        // 8. ФАЙЛОВЫЙ ЭКСПОРТ / ИМПОРТ
        // ============================================================
        _importFromFile() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const json = JSON.parse(ev.target.result);
                        const payload = json && json.data ? json.data : json;
                        if (json && json.metadata) this._metadata = { ...this._metadata, ...json.metadata };
                        this._importPayload(payload);
                        this._invalidateCaches();
                        this._needsRender = true;
                        this._scheduleResize();
                        this._scheduleRender();
                        // ✅ Импорт — значимое изменение
                        this._saveData(true, 'импорт из файла');
                        this._baseWindow?.notify?.('Импорт выполнен', 'Данные загружены', 'success');
                    } catch (err) {
                        console.error('[GraphicWindow] Import error:', err);
                        this._baseWindow?.notify?.('Ошибка', 'Неверный формат файла', 'error');
                    }
                };
                reader.readAsText(file);
            };

            input.click();
        }

        _exportToFile() {
            const payload = this._buildPayload();
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `graphic_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this._baseWindow?.notify?.('Экспорт выполнен', 'Данные сохранены', 'success');
        }

        exportImage(format = 'png') {
            if (!this._canvas) return null;
            const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            return this._canvas.toDataURL(mime);
        }

        _exportImageToFile(format = 'png') {
            const dataUrl = this.exportImage(format);
            if (!dataUrl) {
                this._baseWindow?.notify?.('Ошибка', 'Нет данных для экспорта', 'warning');
                return;
            }
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `graphic_${new Date().toISOString().slice(0, 10)}.${format === 'jpeg' ? 'jpg' : 'png'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this._baseWindow?.notify?.('Экспорт выполнен', `Изображение сохранено в ${format.toUpperCase()}`, 'success');
        }

        // ============================================================
        // 9. RESIZE
        // ============================================================
        _scheduleResize() {
            if (this._isDestroyed) return;
            if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
            this._resizeRAF = requestAnimationFrame(() => {
                this._resizeRAF = null;
                this._performResize();
            });
        }

        _performResize() {
            if (!this._canvas || !this._ctx || this._isDestroyed) return;

            const host = this._root;
            if (!host) return;

            const rect = host.getBoundingClientRect();
            const rawW = Math.round(rect.width || host.clientWidth || 0);
            const rawH = Math.round(rect.height || host.clientHeight || 0);

            if (rawW < 1 || rawH < 1) {
                this._zeroAttempts++;
                if (this._zeroAttempts > 10) {
                    this._zeroAttempts = 0;
                    return;
                }
                setTimeout(() => this._performResize(), 100);
                return;
            }
            this._zeroAttempts = 0;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            // ✅ ceil — физический canvas покрывает _root полностью
            const physW = Math.ceil(rawW * dpr);
            const physH = Math.ceil(rawH * dpr);

            const samePhys = (this._canvas.width === physW && this._canvas.height === physH);
            const sameCss = (
                Math.abs(this._lastCssW - rawW) < 0.01 &&
                Math.abs(this._lastCssH - rawH) < 0.01
            );

            if (samePhys && sameCss && this._width > 0) {
                if (this._needsRender && this._isVisible) this._scheduleRender();
                return;
            }

            this._lastCssW = rawW;
            this._lastCssH = rawH;
            this._width = Math.floor(rawW);
            this._height = Math.floor(rawH);

            if (!samePhys) {
                this._canvas.width = physW;
                this._canvas.height = physH;
                this._dpr = dpr;
                this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            // ✅ Явный CSS-размер — убирает растяжение при дробных размерах
            this._canvas.style.width = rawW + 'px';
            this._canvas.style.height = rawH + 'px';

            this._needsRender = true;
            if (this._isVisible) this._scheduleRender();
        }

        _scheduleRender() {
            if (this._isDestroyed || !this._isReady) {
                this._needsRender = true;
                return;
            }
            if (this._renderPending) return;
            if (!this._ctx) {
                this._needsRender = true;
                return;
            }

            // Один раз рендерим даже при _isVisible = false
            if (!this._isVisible && this._didInitialRender) {
                this._needsRender = true;
                return;
            }

            this._renderPending = true;
            if (this._renderFrameId) cancelAnimationFrame(this._renderFrameId);
            this._renderFrameId = requestAnimationFrame(() => {
                this._renderPending = false;
                this._renderFrameId = null;
                this._render();
                this._didInitialRender = true;
            });
        }

        // ============================================================
        // 10. РЕНДЕР
        // ============================================================
        _getPadding() {
            return { top: 20, bottom: 48, left: 52, right: 20 };
        }

        _invalidateCaches() {
            this._ticksCache.x = null;
            this._ticksCache.y = null;
            this._rangeCache.x = null;
            this._rangeCache.y = null;
        }

        _getAxisRange(axis) {
            const cache = this._rangeCache[axis];
            if (cache) return cache.range;

            const cfg = axis === 'x' ? this._axisConfig.x : this._axisConfig.y;
            let min = cfg.min;
            let max = cfg.max;

            const xArr = [];
            const yArr = [];

            if (this._data) {
                if (this._data.xValues) xArr.push(...this._data.xValues);
                if (this._data.yValues) yArr.push(...this._data.yValues);
            }
            for (const g of this._compareGraphs) {
                if (g.xValues) xArr.push(...g.xValues);
                if (g.yValues) yArr.push(...g.yValues);
            }
            for (const l of this._extraLines) yArr.push(l.y);

            const values = axis === 'x' ? xArr : yArr;

            if (values.length === 0) {
                const range = { min: 0, max: 1, range: 1 };
                this._rangeCache[axis] = { range };
                return range;
            }

            if (min === null || min === undefined) min = Math.min(...values);
            if (max === null || max === undefined) max = Math.max(...values);
            if (min === max) { min -= 1; max += 1; }

            const range = { min, max, range: (max - min) || 1 };
            this._rangeCache[axis] = { range };
            return range;
        }

        _mapXToPixel(value, pad, chartW, xRange, isLog) {
            let pos;
            if (isLog && xRange.min > 0) {
                const lmin = Math.log10(xRange.min);
                const lmax = Math.log10(xRange.max);
                pos = (Math.log10(Math.max(value, xRange.min)) - lmin) / (lmax - lmin);
            } else {
                pos = (value - xRange.min) / xRange.range;
            }
            return pad.left + pos * chartW;
        }

        _mapYToPixel(value, pad, chartH, yRange, isLog) {
            let pos;
            if (isLog && yRange.min > 0) {
                const lmin = Math.log10(yRange.min);
                const lmax = Math.log10(yRange.max);
                pos = (Math.log10(Math.max(value, yRange.min)) - lmin) / (lmax - lmin);
            } else {
                pos = (value - yRange.min) / yRange.range;
            }
            return pad.top + chartH - pos * chartH;
        }

        _render() {
            if (!this._ctx || !this._isReady || this._isDestroyed) return;

            const ctx = this._ctx;
            const colors = getColors();

            // ✅ Очищаем по ФИЗИЧЕСКОМУ размеру canvas (в CSS-единицах),
            //    чтобы не оставалось полосы старого кадра при дробных размерах
            const physCssW = this._canvas.width / this._dpr;
            const physCssH = this._canvas.height / this._dpr;

            ctx.clearRect(0, 0, physCssW, physCssH);
            ctx.fillStyle = colors.bg;
            ctx.fillRect(0, 0, physCssW, physCssH);

            // Рендер идёт по целым _width × _height
            const w = this._width || 0;
            const h = this._height || 0;
            if (w < 10 || h < 10) return;

            const pad = this._getPadding();
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;
            if (chartW < 10 || chartH < 10) return;

            const xRange = this._getAxisRange('x');
            const yRange = this._getAxisRange('y');
            const isXLog = this._axisConfig.x.log && xRange.min > 0;
            const isYLog = this._axisConfig.y.log && yRange.min > 0;

            if (this._appearance.showGrid) {
                ctx.strokeStyle = colors.gridLine;
                ctx.lineWidth = 0.5;

                const xTicks = this._getTicks('x', xRange, isXLog);
                for (let i = 0; i < xTicks.length; i++) {
                    const x = this._mapXToPixel(xTicks[i], pad, chartW, xRange, isXLog);
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + chartH);
                    ctx.stroke();
                }

                const yTicks = this._getTicks('y', yRange, isYLog);
                for (let i = 0; i < yTicks.length; i++) {
                    const y = this._mapYToPixel(yTicks[i], pad, chartH, yRange, isYLog);
                    ctx.beginPath();
                    ctx.moveTo(pad.left, y);
                    ctx.lineTo(pad.left + chartW, y);
                    ctx.stroke();
                }
            }

            ctx.strokeStyle = colors.axisLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, pad.top + chartH);
            ctx.lineTo(pad.left + chartW, pad.top + chartH);
            ctx.stroke();

            ctx.fillStyle = colors.axisLabel;
            ctx.font = 'bold 10px monospace';

            const xTicks = this._getTicks('x', xRange, isXLog);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i < xTicks.length; i++) {
                const x = this._mapXToPixel(xTicks[i], pad, chartW, xRange, isXLog);
                ctx.fillText(this._formatNumber(xTicks[i], this._axisConfig.x.precision), x, pad.top + chartH + 6);
            }

            const yTicks = this._getTicks('y', yRange, isYLog);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < yTicks.length; i++) {
                const y = this._mapYToPixel(yTicks[i], pad, chartH, yRange, isYLog);
                ctx.fillText(this._formatNumber(yTicks[i], this._axisConfig.y.precision), pad.left - 6, y);
            }

            ctx.fillStyle = colors.axisLabelDim;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this._axisConfig.x.label || 'Ось X', pad.left + chartW / 2, pad.top + chartH + 28);

            ctx.save();
            ctx.translate(14, pad.top + chartH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._axisConfig.y.label || 'Ось Y', 0, 0);
            ctx.restore();

            for (const line of this._extraLines) {
                if (line.y < yRange.min || line.y > yRange.max) continue;
                const y = this._mapYToPixel(line.y, pad, chartH, yRange, isYLog);
                ctx.setLineDash(line.dashed ? [4, 6] : []);
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + chartW, y);
                ctx.strokeStyle = line.color || colors.gridLine;
                ctx.lineWidth = 0.9;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            if (this._data && this._floatX && this._floatX.length > 0) {
                this._renderMainSeries(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog);
            }

            for (const g of this._compareGraphs) {
                if (!g.floatX || g.floatX.length === 0) continue;
                this._renderSeries(
                    ctx, g.floatX, g.floatY, g.color || '#66ddff',
                    pad, chartW, chartH, xRange, yRange, isXLog, isYLog, 1.5
                );
            }

            if (this._appearance.showLegend) {
                this._renderLegend(ctx, pad, chartH);
            }

            if (this._hoverIndex >= 0 && this._data && this._hoverIndex < this._floatX.length) {
                this._renderHighlight(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog);
            }

            if (!this._data && this._compareGraphs.length === 0) {
                ctx.fillStyle = colors.textMuted;
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Нет данных — используйте «Импорт»', pad.left + chartW / 2, pad.top + chartH / 2);
            }

            this._needsRender = false;
        }

        _renderMainSeries(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog) {
            const d = this._data;
            const fx = this._floatX;
            const fy = this._floatY;
            const len = fx.length;
            const color = d.color || '#cc2233';

            if (this._appearance.showFill) {
                ctx.beginPath();
                const x0 = this._mapXToPixel(fx[0], pad, chartW, xRange, isXLog);
                const y0 = this._mapYToPixel(fy[0], pad, chartH, yRange, isYLog);
                ctx.moveTo(x0, pad.top + chartH);
                ctx.lineTo(x0, y0);
                for (let i = 0; i < len; i++) {
                    const x = this._mapXToPixel(fx[i], pad, chartW, xRange, isXLog);
                    const y = this._mapYToPixel(fy[i], pad, chartH, yRange, isYLog);
                    ctx.lineTo(x, y);
                }
                const xN = this._mapXToPixel(fx[len - 1], pad, chartW, xRange, isXLog);
                ctx.lineTo(xN, pad.top + chartH);
                ctx.closePath();

                const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
                const alpha = this._appearance.fillOpacity ?? 0.15;
                const hex = Math.round(alpha * 255).toString(16).padStart(2, '0');
                grad.addColorStop(0, color + hex);
                grad.addColorStop(1, color + '05');
                ctx.fillStyle = grad;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = this._appearance.lineWidth || 1.8;
            ctx.setLineDash([]);
            for (let i = 0; i < len; i++) {
                const x = this._mapXToPixel(fx[i], pad, chartW, xRange, isXLog);
                const y = this._mapYToPixel(fy[i], pad, chartH, yRange, isYLog);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            if (this._appearance.showPoints) {
                const step = Math.max(1, Math.floor(len / 50));
                ctx.fillStyle = color + '80';
                for (let i = 0; i < len; i += step) {
                    const x = this._mapXToPixel(fx[i], pad, chartW, xRange, isXLog);
                    const y = this._mapYToPixel(fy[i], pad, chartH, yRange, isYLog);
                    ctx.beginPath();
                    ctx.arc(x, y, this._appearance.pointSize || 1.5, 0, Math.PI * 2);
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
                const x = this._mapXToPixel(fx[i], pad, chartW, xRange, isXLog);
                const y = this._mapYToPixel(fy[i], pad, chartH, yRange, isYLog);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        _renderHighlight(ctx, pad, chartW, chartH, xRange, yRange, isXLog, isYLog) {
            const fx = this._floatX;
            const fy = this._floatY;
            const idx = this._hoverIndex;
            const colors = getColors();
            const x = this._mapXToPixel(fx[idx], pad, chartW, xRange, isXLog);
            const y = this._mapYToPixel(fy[idx], pad, chartH, yRange, isYLog);
            const color = (this._data && this._data.color) || '#cc2233';

            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.strokeStyle = color + 'CC';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            ctx.strokeStyle = colors.gridLineStrong;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + chartH);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + chartW, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        _renderLegend(ctx, pad, chartH) {
            const colors = getColors();
            const items = [];

            if (this._data) {
                items.push({ color: this._data.color || '#cc2233', label: this._data.label || 'Основной', type: 'line' });
            }
            for (const g of this._compareGraphs) {
                items.push({ color: g.color || '#66ddff', label: g.label || 'Сравнение', type: 'line' });
            }
            for (const l of this._extraLines) {
                if (l.label) items.push({ color: l.color || colors.gridLine, label: l.label, type: 'dashed' });
            }
            if (items.length === 0) return;

            let x = pad.left + 8;
            let y = pad.top + 8;
            const maxWidth = 150;

            ctx.font = '9px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = colors.axisLabelDim;

            for (const it of items) {
                if (y + 14 > pad.top + chartH) break;

                let label = it.label;
                if (label.length > 18) label = label.slice(0, 17) + '…';

                ctx.textAlign = 'left';
                ctx.fillText(label, x, y);

                const labelW = Math.min(ctx.measureText(label).width, maxWidth);
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

        // ============================================================
        // 11. ТИКИ
        // ============================================================
        _getTicks(axis, range, isLog) {
            const key = `${range.min}|${range.max}|${isLog ? 1 : 0}`;
            const cache = this._ticksCache[axis];
            if (cache && cache.key === key) return cache.ticks;

            const ticks = this._generateTicks(range, isLog);
            this._ticksCache[axis] = { key, ticks };
            return ticks;
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

        _formatNumber(value, precision) {
            if (value === 0) return '0';
            const abs = Math.abs(value);
            if (abs >= 1000000) return (value / 1000000).toFixed(1) + 'M';
            if (abs >= 1000) return (value / 1000).toFixed(1) + 'k';
            if (abs >= 100) return value.toFixed(0);
            return value.toFixed(precision ?? 2);
        }

        // ============================================================
        // 12. TOOLTIP / HOVER
        // ============================================================
        _createTooltip() {
            this._tooltip = document.createElement('div');
            this._tooltip.className = 'graphic-tooltip';
            const colors = getColors();
            const isDark = getCurrentTheme() === 'dark';

            Object.assign(this._tooltip.style, {
                position: 'absolute',
                background: isDark ? 'rgba(13,13,13,0.95)' : 'rgba(255,255,255,0.97)',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: colors.textPrimary,
                pointerEvents: 'none',
                zIndex: '100',
                display: 'none',
                flexDirection: 'column',
                gap: '3px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                minWidth: '100px',
                backdropFilter: 'blur(8px)',
                fontFamily: 'Courier New, monospace'
            });

            this._tooltip.innerHTML = `
                <div class="tt-x" style="font-size:10px;opacity:0.7;border-bottom:1px solid ${colors.border};padding-bottom:4px;margin-bottom:2px;">--</div>
                <div class="tt-values"></div>
            `;

            this._root.appendChild(this._tooltip);
        }

        _updateTooltip(xValue, values) {
            if (!this._tooltip) return;
            const xEl = this._tooltip.querySelector('.tt-x');
            const vEl = this._tooltip.querySelector('.tt-values');
            if (!xEl || !vEl) return;

            const precisionX = this._axisConfig.x.precision ?? 2;
            const precisionY = this._axisConfig.y.precision ?? 2;
            const unitX = this._metadata.unitX || this._axisConfig.x.label || '';
            const unitY = this._metadata.unitY || this._axisConfig.y.label || '';

            xEl.textContent = `${this._formatNumber(xValue, precisionX)} ${unitX}`.trim();

            let html = '';
            for (const v of values) {
                const color = v.color || '#cc2233';
                const label = v.label || 'График';
                const value = typeof v.value === 'number' ? this._formatNumber(v.value, precisionY) : '--';
                html += `
                    <div style="display:flex;align-items:center;gap:6px;padding:1px 0;">
                        <span style="display:inline-block;width:10px;height:2px;background:${color};flex-shrink:0;"></span>
                        <span style="opacity:0.6;font-size:9px;">${label}:</span>
                        <span style="color:${color};font-weight:600;">${value} ${unitY}</span>
                    </div>
                `;
            }
            vEl.innerHTML = html;
        }

        _setupMouseEvents() {
            this._onMouseMove = (e) => {
                if (!this._data) return;
                const rect = this._canvas.getBoundingClientRect();
                const scaleX = this._width / Math.max(1, rect.width);
                const scaleY = this._height / Math.max(1, rect.height);
                this._mouseX = (e.clientX - rect.left) * scaleX;
                this._mouseY = (e.clientY - rect.top) * scaleY;
                this._isHovering = true;
                this._updateHover();
            };

            this._onMouseLeave = () => {
                this._isHovering = false;
                this._hoverIndex = -1;
                if (this._tooltip) this._tooltip.style.display = 'none';
                this._needsRender = true;
                this._scheduleRender();
            };

            this._canvas.addEventListener('mousemove', this._onMouseMove);
            this._canvas.addEventListener('mouseleave', this._onMouseLeave);
        }

        _updateHover() {
            if (!this._data || !this._isHovering || !this._floatX) {
                if (this._tooltip) this._tooltip.style.display = 'none';
                return;
            }

            const fx = this._floatX;
            const fy = this._floatY;
            const len = fx.length;
            if (len === 0) return;

            const pad = this._getPadding();
            const chartW = this._width - pad.left - pad.right;
            const chartH = this._height - pad.top - pad.bottom;
            if (chartW < 10 || chartH < 10) return;

            const xRange = this._getAxisRange('x');
            const isXLog = this._axisConfig.x.log && xRange.min > 0;

            let xValue;
            if (isXLog) {
                const lmin = Math.log10(xRange.min);
                const lmax = Math.log10(xRange.max);
                const pos = (this._mouseX - pad.left) / chartW;
                xValue = Math.pow(10, lmin + pos * (lmax - lmin));
            } else {
                xValue = xRange.min + ((this._mouseX - pad.left) / chartW) * xRange.range;
            }

            let idx = this._binarySearchNearest(fx, xValue, len);

            const xPix = this._mapXToPixel(fx[idx], pad, chartW, xRange, isXLog);
            if (Math.abs(this._mouseX - xPix) > 25) {
                this._hoverIndex = -1;
                if (this._tooltip) this._tooltip.style.display = 'none';
                this._needsRender = true;
                this._scheduleRender();
                return;
            }

            this._hoverIndex = idx;

            const values = [];
            if (fy && fy.length > idx) {
                values.push({
                    label: this._data.label || 'Основной',
                    value: fy[idx],
                    color: this._data.color || '#cc2233'
                });
            }
            for (const g of this._compareGraphs) {
                if (g.floatY && g.floatY.length > idx) {
                    values.push({
                        label: g.label || 'Сравнение',
                        value: g.floatY[idx],
                        color: g.color || '#66ddff'
                    });
                }
            }

            this._updateTooltip(fx[idx], values);

            const rect = this._canvas.getBoundingClientRect();
            const scaleBackX = rect.width / this._width;
            const scaleBackY = rect.height / this._height;

            let left = this._mouseX * scaleBackX + rect.left + 15;
            let top = this._mouseY * scaleBackY + rect.top - 10;

            const tw = 190;
            const th = 40 + values.length * 20;
            if (left + tw > window.innerWidth) left = this._mouseX * scaleBackX + rect.left - tw - 15;
            if (top + th > window.innerHeight) top = window.innerHeight - th - 10;
            if (top < 10) top = 10;

            this._tooltip.style.left = left + 'px';
            this._tooltip.style.top = top + 'px';
            this._tooltip.style.display = 'flex';

            this._needsRender = true;
            this._scheduleRender();
        }

        _binarySearchNearest(arr, target, len) {
            let lo = 0;
            let hi = len - 1;

            if (len > 1 && arr[0] > arr[len - 1]) {
                let best = 0;
                let bestDist = Infinity;
                for (let i = 0; i < len; i++) {
                    const d = Math.abs(arr[i] - target);
                    if (d < bestDist) { bestDist = d; best = i; }
                }
                return best;
            }

            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (arr[mid] < target) lo = mid;
                else hi = mid;
            }
            return (Math.abs(arr[lo] - target) <= Math.abs(arr[hi] - target)) ? lo : hi;
        }

        // ============================================================
        // 13. УНИЧТОЖЕНИЕ
        // ============================================================
        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            this._isReady = false;

            if (this._canvas) {
                this._canvas.removeEventListener('mousemove', this._onMouseMove);
                this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
                this._canvas.remove();
                this._canvas = null;
            }

            if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
            }

            if (this._resizeRAF) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
            if (this._renderFrameId) { cancelAnimationFrame(this._renderFrameId); this._renderFrameId = null; }

            if (this._selfResizeObserver) {
                this._selfResizeObserver.disconnect();
                this._selfResizeObserver = null;
            }

            this._ctx = null;
            this._data = null;
            this._floatX = null;
            this._floatY = null;
            this._compareGraphs = [];
            this._extraLines = [];

            if (this._root && this._root.parentNode) {
                this._root.remove();
            }
            this._root = null;

            console.log(`[GraphicWindow] Destroyed: ${this.id}`);
        }
    }

    // ============================================================
    // 14. РЕГИСТРАЦИЯ
    // ============================================================
    function registerGraphicWindow(registry, dataBus, eventBus, messageBus) {
        if (!registry) {
            console.error('[GraphicWindow] Registry not provided');
            return false;
        }
        if (registry.getType('graphic')) {
            console.log('[GraphicWindow] Already registered');
            return true;
        }

        const contextMenu = () => [
            { icon: '📥', label: 'Импорт JSON', shortcut: 'Ctrl+I', callback: (bw) => bw?.getRealInstance?.()?._importFromFile?.() },
            { icon: '📤', label: 'Экспорт JSON', shortcut: 'Ctrl+E', callback: (bw) => bw?.getRealInstance?.()?._exportToFile?.() },
            { divider: true },
            { icon: '🧹', label: 'Очистить сравнение', callback: (bw) => bw?.getRealInstance?.()?.clearCompare?.() },
            { icon: '🗑️', label: 'Очистить всё', danger: true, callback: (bw) => bw?.getRealInstance?.()?.clearAll?.() }
        ];

        const headerButtons = () => [
            { icon: 'icon-import', label: 'Импорт', callback: (bw) => bw?.getRealInstance?.()?._importFromFile?.() },
            { icon: 'icon-export', label: 'Экспорт', callback: (bw) => bw?.getRealInstance?.()?._exportToFile?.() },
            { icon: 'icon-clear', label: 'Очистить', callback: (bw) => bw?.getRealInstance?.()?.clearCompare?.() }
        ];

        const dropdownMenu = {
            icon: 'icon-menu',
            label: 'Действия',
            items: [
                { header: 'Данные' },
                { icon: '📥', label: 'Импорт JSON', callback: (bw) => bw?.getRealInstance?.()?._importFromFile?.() },
                { icon: '📤', label: 'Экспорт JSON', callback: (bw) => bw?.getRealInstance?.()?._exportToFile?.() },
                { divider: true },
                { header: 'Изображение' },
                { icon: '🖼️', label: 'Сохранить PNG', callback: (bw) => bw?.getRealInstance?.()?._exportImageToFile?.('png') },
                { icon: '📸', label: 'Сохранить JPEG', callback: (bw) => bw?.getRealInstance?.()?._exportImageToFile?.('jpeg') },
                { divider: true },
                { icon: '🗑️', label: 'Очистить всё', danger: true, callback: (bw) => bw?.getRealInstance?.()?.clearAll?.() }
            ]
        };

        return registry.register({
            id: 'graphic',
            name: 'Graphic',
            icon: 'icon-graphic',
            description: 'График: линейная/лог шкала, сравнение, пороги',
            category: 'analysis',
            defaultSize: { width: 560, height: 420 },
            minSize: { width: 260, height: 180 },
            maxWindows: 6,
            priority: 1,
            metadata: { version: '5.5.0', author: 'LSYSTEM' },

            contextMenu,
            headerButtons,
            dropdownMenu,

            create: (container, windowData, options) => new GraphicWindow(container, windowData, options),
            onDestroy: (c, w, instance) => { try { instance?.destroy?.(); } catch (e) {} },
            onResize: (c, w, instance) => { try { instance?.resize?.(); } catch (e) {} },
            onFocus: (w, instance) => { try { instance?.resize?.(); } catch (e) {} },
            onBlur: () => {}
        });
    }

    // ============================================================
    // 15. ЭКСПОРТ
    // ============================================================
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            GraphicWindow,
            registerGraphicWindow,
            ThemeColors,
            getCurrentTheme,
            getColors
        };
    }

    if (typeof window !== 'undefined') {
        window.GraphicWindow = GraphicWindow;
        window.registerGraphicWindow = registerGraphicWindow;
        console.log('[GraphicWindow] Registered globally v5.5.0');
    }

})();