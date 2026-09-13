// types/GraphicWindow.js
// Версия 6.0.0 - Рабочая версия с пустым графиком и импортом

(function() {
    'use strict';

    console.log('[GraphicWindow] Loading v6.0.0...');

    // ===== ЦВЕТОВАЯ СХЕМА =====
    const ThemeColors = {
        dark: {
            bg: '#0d0d0d', bgPanel: '#1a1a1a', bgCard: '#222222', bgHover: '#2a2a2a',
            border: 'rgba(200, 184, 154, 0.12)', textPrimary: '#e0d8cc',
            textSecondary: 'rgba(200, 184, 154, 0.7)', textMuted: 'rgba(200, 184, 154, 0.35)',
            gridLine: 'rgba(200, 184, 154, 0.08)', gridLineStrong: 'rgba(200, 184, 154, 0.2)',
            axisLabel: 'rgba(220, 210, 190, 0.85)', axisLabelDim: 'rgba(200, 184, 154, 0.5)',
            accent: '#cc2233'
        },
        light: {
            bg: '#f5f2ed', bgPanel: '#ffffff', bgCard: '#faf8f5', bgHover: '#f0ede8',
            border: 'rgba(180, 160, 140, 0.2)', textPrimary: '#2a2824',
            textSecondary: 'rgba(60, 55, 50, 0.75)', textMuted: 'rgba(60, 55, 50, 0.4)',
            gridLine: 'rgba(180, 160, 140, 0.12)', gridLineStrong: 'rgba(180, 160, 140, 0.25)',
            axisLabel: 'rgba(40, 38, 34, 0.9)', axisLabelDim: 'rgba(60, 55, 50, 0.5)',
            accent: '#cc2233'
        }
    };

    function getCurrentTheme() {
        return (document.documentElement.getAttribute('data-theme') || 'dark') === 'light' ? 'light' : 'dark';
    }

    function getColors() {
        return ThemeColors[getCurrentTheme()] || ThemeColors.dark;
    }

    let themeChangeListeners = [];
    let themeObserver = null;

    function subscribeToThemeChanges(callback) {
        themeChangeListeners.push(callback);
        return () => {
            const i = themeChangeListeners.indexOf(callback);
            if (i !== -1) themeChangeListeners.splice(i, 1);
        };
    }

    function initThemeObserver() {
        if (themeObserver) return;
        themeObserver = new MutationObserver(() => {
            const colors = getColors();
            [...themeChangeListeners].forEach(cb => {
                try { cb(colors); } catch (e) {}
            });
        });
        themeObserver.observe(document.documentElement, {
            attributes: true, attributeFilter: ['data-theme']
        });
    }
    initThemeObserver();

    // ============================================================
    // КЛАСС GRAPHIC WINDOW
    // ============================================================
    class GraphicWindow {
        constructor(container, windowData, options = {}) {
            this.container = container;
            this.windowData = windowData;
            this.options = options;
            this.id = windowData.id;
            this.type = windowData.type || 'graphic';
            
            this._dataBus = options.dataBus || null;
            this._registry = options.registry || null;
            this._eventBus = options.eventBus || null;
            this._messageBus = options.messageBus || null;
            this._layoutManager = options.layoutManager || null;
            
            this.canvas = null;
            this.ctx = null;
            this.isReady = false;
            this._destroying = false;
            this._initialized = false;
            this._resizeTimeout = null;
            this._renderFrameId = null;
            this._data = null;
            this._compareGraphs = [];
            this._extraLines = [];
            this._width = 0;
            this._height = 0;
            this._dpr = 1;
            this._needsRender = false;
            this._resizePending = false;
            this._renderPending = false;
            this._lastRenderTime = 0;
            this._minRenderInterval = 50;
            this._isVisible = true;
            this._unsubscribe = null;
            this._unsubscribeTheme = null;
            
            this._floatX = null;
            this._floatY = null;
            
            this._tooltip = null;
            this._mouseX = -1;
            this._mouseY = -1;
            this._isHovering = false;
            
            this._axisConfig = {
                x: { label: 'Ось X', min: null, max: null, log: false, precision: 4 },
                y: { label: 'Ось Y', min: null, max: null, log: false, precision: 4 }
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
            
            this._metadata = {
                title: windowData.title || 'График',
                version: '6.0.0',
                created: new Date().toISOString()
            };
            
            this._init();
        }

        // ============================================================
        // ИНИЦИАЛИЗАЦИЯ
        // ============================================================
        _init() {
            if (this._initialized) return;
            this._initialized = true;
            this._destroying = false;

            console.log(`[GraphicWindow] Initializing: ${this.id}`);

            this._setupDataSubscription();
            this._buildDOM();
            this._setupThemeSubscription();
            this._setupResizeObserver();
            this._setupVisibilityObserver();
            this._loadData();

            this.isReady = true;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.resize();
                    if (this._data && this._data.xValues && this._data.xValues.length > 0) {
                        this._scheduleRender();
                    } else {
                        this._renderEmpty();
                    }
                });
            });
        }

        _buildDOM() {
            this.container.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.className = 'chart-container';
            wrapper.id = `chart-wrapper-${this.id}`;
            
            const isDark = getCurrentTheme() === 'dark';
            Object.assign(wrapper.style, {
                position: 'relative',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                background: isDark ? '#0d0d0d' : '#f5f2ed'
            });

            this.canvas = document.createElement('canvas');
            this.canvas.id = `chart-${this.id}`;
            Object.assign(this.canvas.style, {
                display: 'block',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: '0',
                left: '0',
                cursor: 'crosshair'
            });

            wrapper.appendChild(this.canvas);
            this.container.appendChild(wrapper);

            this._root = wrapper;

            this.ctx = this.canvas.getContext('2d', {
                alpha: false,
                desynchronized: true,
                willReadFrequently: false
            });

            if (!this.ctx) {
                console.error('[GraphicWindow] Failed to get 2D context');
                return;
            }

            this._createTooltip();
            this._setupMouseEvents();
        }

        // ============================================================
        // РАБОТА С ДАННЫМИ
        // ============================================================
        _setupDataSubscription() {
            if (!this._dataBus) return;
            this._unsubscribe = this._dataBus.subscribe(this.id, (data) => {
                if (this._destroying) return;
                this._onDataUpdate(data);
            });
        }

        _loadData() {
            if (!this._dataBus) return;
            const data = this._dataBus.getWindowData(this.id);
            if (data && data.data) {
                this._importFromData(data.data);
                this._metadata = data.metadata || this._metadata;
            }
        }

        _onDataUpdate(data) {
            if (!data || !data.data) return;
            this._importFromData(data.data);
            this._metadata = data.metadata || this._metadata;
            this._needsRender = true;
            this._scheduleRender();
        }

        _importFromData(data) {
            if (data.mainData) {
                this._data = {
                    xValues: data.mainData.xValues || [],
                    yValues: data.mainData.yValues || [],
                    color: data.mainData.color || '#cc2233',
                    label: data.mainData.label || 'Основной график'
                };
                this._updateFloatArrays();
            }
            if (data.compareGraphs) {
                this._compareGraphs = data.compareGraphs.map(g => {
                    const x = g.xValues || [];
                    const y = g.yValues || [];
                    const len = Math.min(x.length, y.length);
                    const floatX = new Float32Array(len);
                    const floatY = new Float32Array(len);
                    for (let i = 0; i < len; i++) {
                        floatX[i] = x[i] || 0;
                        floatY[i] = y[i] || 0;
                    }
                    return {
                        xValues: x.slice(), yValues: y.slice(),
                        floatX, floatY,
                        color: g.color || '#66ddff',
                        label: g.label || 'Сравнение'
                    };
                });
            }
            if (data.extraLines) {
                this._extraLines = data.extraLines.slice();
            }
            if (data.axisConfig) {
                if (data.axisConfig.x) this._axisConfig.x = { ...this._axisConfig.x, ...data.axisConfig.x };
                if (data.axisConfig.y) this._axisConfig.y = { ...this._axisConfig.y, ...data.axisConfig.y };
            }
            if (data.appearance) {
                this._appearance = { ...this._appearance, ...data.appearance };
            }
        }

        _updateFloatArrays() {
            if (!this._data) return;
            const len = Math.min(this._data.xValues.length, this._data.yValues.length);
            this._floatX = new Float32Array(len);
            this._floatY = new Float32Array(len);
            for (let i = 0; i < len; i++) {
                this._floatX[i] = this._data.xValues[i] || 0;
                this._floatY[i] = this._data.yValues[i] || 0;
            }
        }

        _saveData() {
            if (!this._dataBus) return;
            this._dataBus.setWindowData(this.id, {
                id: this.id,
                type: this.type,
                metadata: this._metadata,
                data: {
                    mainData: this._data ? {
                        xValues: this._data.xValues,
                        yValues: this._data.yValues,
                        color: this._data.color,
                        label: this._data.label
                    } : null,
                    compareGraphs: this._compareGraphs.map(g => ({
                        xValues: g.xValues, yValues: g.yValues,
                        color: g.color, label: g.label
                    })),
                    extraLines: this._extraLines,
                    axisConfig: this._axisConfig,
                    appearance: this._appearance
                }
            });
        }

        // ============================================================
        // ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================
        getAllData() {
            return {
                metadata: { ...this._metadata },
                data: {
                    mainData: this._data ? {
                        xValues: this._data.xValues.slice(),
                        yValues: this._data.yValues.slice(),
                        color: this._data.color,
                        label: this._data.label
                    } : null,
                    compareGraphs: this._compareGraphs.map(g => ({
                        xValues: g.xValues.slice(), yValues: g.yValues.slice(),
                        color: g.color, label: g.label
                    })),
                    extraLines: this._extraLines.slice(),
                    axisConfig: JSON.parse(JSON.stringify(this._axisConfig)),
                    appearance: { ...this._appearance }
                }
            };
        }

        setAllData(data) {
            if (!data) return;
            if (data.metadata) this._metadata = { ...this._metadata, ...data.metadata };
            if (data.data) {
                this._importFromData(data.data);
                this._needsRender = true;
                if (this.isReady) this._scheduleRender();
                this._saveData();
            }
        }

        getMetadata() { return { ...this._metadata }; }

        getData() {
            return this._data ? {
                xValues: this._data.xValues.slice(),
                yValues: this._data.yValues.slice(),
                color: this._data.color,
                label: this._data.label
            } : null;
        }

        setData(data) {
            if (data && data.xValues && data.yValues) {
                this._data = {
                    xValues: data.xValues.slice(),
                    yValues: data.yValues.slice(),
                    color: data.color || '#cc2233',
                    label: data.label || 'Основной график'
                };
                this._updateFloatArrays();
                this._needsRender = true;
                if (this.isReady) this._scheduleRender();
                this._saveData();
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
            if (state.axisConfig) {
                if (state.axisConfig.x) this._axisConfig.x = { ...this._axisConfig.x, ...state.axisConfig.x };
                if (state.axisConfig.y) this._axisConfig.y = { ...this._axisConfig.y, ...state.axisConfig.y };
            }
            if (state.appearance) this._appearance = { ...this._appearance, ...state.appearance };
            this._needsRender = true;
            if (this.isReady) this._scheduleRender();
            return this;
        }

        exportData() {
            return {
                id: this.id, type: this.type, version: '6.0.0',
                timestamp: new Date().toISOString(),
                metadata: { ...this._metadata },
                data: this.getAllData().data
            };
        }

        importData(lswData) {
            if (!lswData) return false;
            if (lswData.metadata) this._metadata = { ...this._metadata, ...lswData.metadata };
            if (lswData.data) {
                this._importFromData(lswData.data);
                this._needsRender = true;
                if (this.isReady) this._scheduleRender();
                this._saveData();
                return true;
            }
            return false;
        }

        getRoot() { return this._root; }

        resize() {
            if (!this.canvas || !this.ctx || !this.isReady || this._destroying) {
                this._scheduleResize();
                return;
            }
            this._performResize();
        }

        // ============================================================
        // МЕТОДЫ УПРАВЛЕНИЯ ДАННЫМИ
        // ============================================================
        updateData(xValues, yValues, color, label) {
            if (xValues && yValues && xValues.length > 0) {
                this._data = {
                    xValues: xValues.slice(),
                    yValues: yValues.slice(),
                    color: color || '#cc2233',
                    label: label || 'Основной график'
                };
                this._updateFloatArrays();
                this._needsRender = true;
                this._scheduleRender();
                this._saveData();
                return true;
            }
            return false;
        }

        addCompareGraph(xValues, yValues, color, label) {
            if (xValues && yValues && xValues.length > 0) {
                const colors = ['#66ddff', '#ffdd44', '#66ff88', '#ff66aa', '#cc88ff', '#ff8844'];
                const len = Math.min(xValues.length, yValues.length);
                const floatX = new Float32Array(len);
                const floatY = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    floatX[i] = xValues[i] || 0;
                    floatY[i] = yValues[i] || 0;
                }
                
                this._compareGraphs.push({
                    xValues: xValues.slice(),
                    yValues: yValues.slice(),
                    floatX, floatY,
                    color: color || colors[this._compareGraphs.length % colors.length],
                    label: label || `Сравнение ${this._compareGraphs.length + 1}`
                });
                
                this._needsRender = true;
                this._scheduleRender();
                this._saveData();
                return true;
            }
            return false;
        }

        addExtraLine(y, color, label, dashed = true) {
            this._extraLines.push({
                y: y,
                color: color || 'rgba(200, 184, 154, 0.15)',
                label: label || `${y}`,
                dashed: dashed
            });
            this._extraLines.sort((a, b) => a.y - b.y);
            this._needsRender = true;
            this._scheduleRender();
            this._saveData();
            return this._extraLines.length - 1;
        }

        clearExtraLines() {
            this._extraLines = [];
            this._needsRender = true;
            this._scheduleRender();
            this._saveData();
        }

        clearCompare() {
            this._compareGraphs = [];
            this._needsRender = true;
            this._scheduleRender();
            this._saveData();
            this._emitNotification('Очищено', 'Данные сравнения удалены', 'info');
        }

        clearAll() {
            this._data = null;
            this._compareGraphs = [];
            this._extraLines = [];
            this._floatX = null;
            this._floatY = null;
            this._needsRender = true;
            this._scheduleRender();
            this._saveData();
            this._emitNotification('Очищено', 'Все данные удалены', 'info');
        }

        // ============================================================
        // ПРИМЕНЕНИЕ НАСТРОЕК
        // ============================================================
        _applySettings(settings) {
            if (!settings) return;

            if (settings.xAxis) {
                const x = settings.xAxis;
                if (x.label !== undefined) this._axisConfig.x.label = x.label;
                if (x.min !== undefined) this._axisConfig.x.min = x.min;
                if (x.max !== undefined) this._axisConfig.x.max = x.max;
                if (x.log !== undefined) this._axisConfig.x.log = x.log;
                if (x.precision !== undefined) this._axisConfig.x.precision = x.precision;
            }

            if (settings.yAxis) {
                const y = settings.yAxis;
                if (y.label !== undefined) this._axisConfig.y.label = y.label;
                if (y.min !== undefined) this._axisConfig.y.min = y.min;
                if (y.max !== undefined) this._axisConfig.y.max = y.max;
                if (y.log !== undefined) this._axisConfig.y.log = y.log;
                if (y.precision !== undefined) this._axisConfig.y.precision = y.precision;
            }

            if (settings.appearance) {
                this._appearance = { ...this._appearance, ...settings.appearance };
            }
        }

        // ============================================================
        // ЭКСПОРТ/ИМПОРТ
        // ============================================================
        exportDataJSON() {
            if (!this._data) return null;
            return JSON.stringify({
                main: {
                    xValues: this._data.xValues,
                    yValues: this._data.yValues,
                    color: this._data.color,
                    label: this._data.label
                },
                compareGraphs: this._compareGraphs.map(g => ({
                    xValues: g.xValues, yValues: g.yValues,
                    color: g.color, label: g.label
                })),
                extraLines: this._extraLines,
                settings: {
                    xAxis: this._axisConfig.x,
                    yAxis: this._axisConfig.y,
                    appearance: this._appearance
                },
                metadata: {
                    title: this._metadata.title,
                    unitX: this._axisConfig.x.label,
                    unitY: this._axisConfig.y.label
                },
                timestamp: new Date().toISOString(),
                version: '6.0.0'
            }, null, 2);
        }

        exportImage(format = 'png') {
            if (!this.canvas) return null;
            return this.canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg');
        }

        _importFromFile() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        // ФОРМАТ: main, compareGraphs, extraLines, settings
                        if (data.main && data.main.xValues) {
                            console.log('[GraphicWindow] Importing standard format');
                            
                            this._data = null;
                            this._compareGraphs = [];
                            this._extraLines = [];
                            
                            this.updateData(
                                data.main.xValues,
                                data.main.yValues,
                                data.main.color,
                                data.main.label
                            );
                            
                            if (data.compareGraphs && Array.isArray(data.compareGraphs)) {
                                data.compareGraphs.forEach(g => {
                                    this.addCompareGraph(g.xValues, g.yValues, g.color, g.label);
                                });
                            }
                            
                            if (data.extraLines && Array.isArray(data.extraLines)) {
                                data.extraLines.forEach(line => {
                                    this.addExtraLine(line.y, line.color, line.label, line.dashed);
                                });
                            }
                            
                            if (data.settings) {
                                this._applySettings(data.settings);
                            }
                            
                            if (data.metadata && data.metadata.title) {
                                this._metadata.title = data.metadata.title;
                            }
                            
                            this._saveData();
                            this._needsRender = true;
                            this._scheduleRender();
                            
                            this._emitNotification('Импорт выполнен', 
                                `Точек: ${data.main.xValues.length}, сравнений: ${this._compareGraphs.length}`, 
                                'success');
                            
                        } else if (data.xValues && data.yValues) {
                            this.updateData(data.xValues, data.yValues, data.color, data.label);
                            if (data.settings) this._applySettings(data.settings);
                            this._saveData();
                            this._needsRender = true;
                            this._scheduleRender();
                            this._emitNotification('Импорт выполнен', 
                                `Точек: ${data.xValues.length}`, 'success');
                        } else {
                            throw new Error('Неизвестный формат');
                        }
                    } catch (error) {
                        console.error('[GraphicWindow] Import error:', error);
                        this._emitNotification('Ошибка', error.message, 'error');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        _exportToFile() {
            const data = this.exportDataJSON();
            if (!data) {
                this._emitNotification('Ошибка', 'Нет данных для экспорта', 'warning');
                return;
            }
            
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `graphic_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this._emitNotification('Экспорт выполнен', 'Данные сохранены', 'success');
        }

        _exportImageToFile(format = 'png') {
            const dataUrl = this.exportImage(format);
            if (!dataUrl) return;
            
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `graphic_${new Date().toISOString().slice(0,10)}.${format === 'jpeg' ? 'jpg' : 'png'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this._emitNotification('Экспорт выполнен', `Изображение сохранено`, 'success');
        }

        // ============================================================
        // ТУЛТИП
        // ============================================================
        _createTooltip() {
            this._tooltip = document.createElement('div');
            this._tooltip.className = 'chart-tooltip';
            
            const isDark = getCurrentTheme() === 'dark';
            Object.assign(this._tooltip.style, {
                position: 'absolute',
                background: isDark ? 'rgba(13, 13, 13, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                border: `1px solid ${isDark ? 'rgba(200, 184, 154, 0.15)' : 'rgba(180, 160, 140, 0.25)'}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: isDark ? '#e0d8cc' : '#2a2824',
                pointerEvents: 'none',
                zIndex: '100',
                display: 'none',
                flexDirection: 'column',
                gap: '3px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                minWidth: '100px',
                fontFamily: 'Courier New, monospace'
            });
            
            this._tooltip.innerHTML = `
                <div class="tooltip-x" style="font-size:10px;border-bottom:1px solid ${isDark ? 'rgba(200,184,154,0.1)' : 'rgba(180,160,140,0.15)'};padding-bottom:4px;margin-bottom:2px;">--</div>
                <div class="tooltip-values"></div>
            `;
            
            this.container.appendChild(this._tooltip);
        }

        _updateTooltipValues(xValue, values) {
            const xEl = this._tooltip.querySelector('.tooltip-x');
            const valuesEl = this._tooltip.querySelector('.tooltip-values');
            if (!xEl || !valuesEl) return;
            
            const unitX = this._axisConfig.x.label || '';
            const precision = this._axisConfig.x.precision || 4;
            xEl.textContent = `${typeof xValue === 'number' ? xValue.toFixed(precision) : '--'} ${unitX}`.trim();
            
            const isDark = getCurrentTheme() === 'dark';
            let html = '';
            for (const v of values) {
                const value = v.value !== undefined ? v.value.toFixed(this._axisConfig.y.precision || 4) : '--';
                html += `
                    <div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:1px 0;">
                        <span style="display:inline-block;width:10px;height:2px;background:${v.color};flex-shrink:0;"></span>
                        <span style="color:${isDark ? 'rgba(200,184,154,0.5)' : 'rgba(80,70,60,0.5)'};font-size:9px;">${v.label}:</span>
                        <span style="color:${v.color};font-weight:600;">${value} ${this._axisConfig.y.label || ''}</span>
                    </div>
                `;
            }
            valuesEl.innerHTML = html;
        }

        // ============================================================
        // СОБЫТИЯ МЫШИ
        // ============================================================
        _setupMouseEvents() {
            this._mouseMoveHandler = this._onMouseMove.bind(this);
            this._mouseLeaveHandler = this._onMouseLeave.bind(this);
            
            this.canvas.addEventListener('mousemove', this._mouseMoveHandler);
            this.canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
        }

        _onMouseMove(e) {
            if (!this._data) return;
            
            const rect = this.canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) * (this._width / rect.width);
            this._mouseY = (e.clientY - rect.top) * (this._height / rect.height);
            this._isHovering = true;
            
            this._updateTooltip();
        }

        _onMouseLeave() {
            this._isHovering = false;
            this._hideTooltip();
            this._needsRender = true;
            this._scheduleRender();
        }

        _updateTooltip() {
            if (!this._data || !this._isHovering) {
                this._hideTooltip();
                return;
            }
            
            const { xValues, yValues } = this._data;
            if (!xValues || xValues.length === 0) return;
            
            const pad = this._getPadding();
            const chartW = this._width - pad.left - pad.right;
            const chartH = this._height - pad.top - pad.bottom;
            
            if (chartW < 10 || chartH < 10) return;
            
            const xRange = this._getAxisRange('x', xValues);
            
            let xValue;
            if (this._axisConfig.x.log && xRange.min > 0) {
                const logMin = Math.log10(xRange.min);
                const logMax = Math.log10(xRange.max);
                const pos = (this._mouseX - pad.left) / chartW;
                xValue = Math.pow(10, logMin + pos * (logMax - logMin));
            } else {
                xValue = xRange.min + ((this._mouseX - pad.left) / chartW) * (xRange.max - xRange.min);
            }
            
            let closestIdx = 0, closestDist = Infinity;
            for (let i = 0; i < xValues.length; i++) {
                const dx = Math.abs(xValues[i] - xValue);
                if (dx < closestDist) { closestDist = dx; closestIdx = i; }
            }
            
            const xPos = this._mapXToPixel(xValues[closestIdx], pad, chartW);
            if (Math.abs(this._mouseX - xPos) > 20) {
                this._hideTooltip();
                return;
            }
            
            const values = [];
            if (yValues && yValues.length > closestIdx) {
                values.push({
                    label: this._data.label || 'Основной',
                    value: yValues[closestIdx],
                    color: this._data.color || '#cc2233'
                });
            }
            for (const g of this._compareGraphs) {
                if (g.yValues && g.yValues.length > closestIdx) {
                    values.push({
                        label: g.label || 'Сравнение',
                        value: g.yValues[closestIdx],
                        color: g.color || '#66ddff'
                    });
                }
            }
            
            this._updateTooltipValues(xValues[closestIdx], values);
            
            const rect = this.canvas.getBoundingClientRect();
            const tooltipX = this._mouseX / this._width * rect.width;
            const tooltipY = this._mouseY / this._height * rect.height;
            
            let left = tooltipX + rect.left + 15;
            let top = tooltipY + rect.top - 10;
            
            if (left + 180 > window.innerWidth) left = tooltipX + rect.left - 195;
            if (top + 100 > window.innerHeight) top = window.innerHeight - 110;
            if (top < 10) top = 10;
            
            this._tooltip.style.left = left + 'px';
            this._tooltip.style.top = top + 'px';
            this._tooltip.style.display = 'flex';
            
            this._render(true, closestIdx);
        }

        _hideTooltip() {
            if (this._tooltip) this._tooltip.style.display = 'none';
        }

        // ============================================================
        // ГЕОМЕТРИЯ
        // ============================================================
        _getPadding() {
            return { top: 20, bottom: 48, left: 50, right: 20 };
        }

        _getAxisRange(axis, data) {
            const config = axis === 'x' ? this._axisConfig.x : this._axisConfig.y;
            const min = config.min !== null ? config.min : Math.min(...data);
            const max = config.max !== null ? config.max : Math.max(...data);
            const range = max - min || 1;
            return { min, max, range };
        }

        _mapXToPixel(value, pad, chartW) {
            const range = this._getAxisRange('x', this._data.xValues);
            let pos;
            if (this._axisConfig.x.log && range.min > 0) {
                const logMin = Math.log10(range.min);
                const logMax = Math.log10(range.max);
                pos = (Math.log10(value) - logMin) / (logMax - logMin);
            } else {
                pos = (value - range.min) / range.range;
            }
            return pad.left + pos * chartW;
        }

        _mapYToPixel(value, pad, chartH) {
            const range = this._getAxisRange('y', this._data.yValues);
            let pos;
            if (this._axisConfig.y.log && range.min > 0) {
                const logMin = Math.log10(range.min);
                const logMax = Math.log10(range.max);
                pos = (Math.log10(value) - logMin) / (logMax - logMin);
            } else {
                pos = (value - range.min) / range.range;
            }
            return pad.top + chartH - pos * chartH;
        }

        // ============================================================
        // RESIZE
        // ============================================================
        _setupVisibilityObserver() {
            if (typeof IntersectionObserver !== 'undefined') {
                try {
                    this._visibilityObserver = new IntersectionObserver((entries) => {
                        for (const entry of entries) {
                            this._isVisible = entry.isIntersecting;
                            if (this._isVisible && this._needsRender) {
                                this._scheduleRender();
                            }
                        }
                    }, { threshold: 0.1 });
                    if (this.container) this._visibilityObserver.observe(this.container);
                } catch (e) {}
            }
        }

        _setupResizeObserver() {
            if (typeof ResizeObserver === 'undefined') return;
            try {
                let resizeTimer = null;
                this._resizeObserver = new ResizeObserver(() => {
                    if (resizeTimer) cancelAnimationFrame(resizeTimer);
                    resizeTimer = requestAnimationFrame(() => {
                        resizeTimer = null;
                        if (this.isReady && !this._destroying) this._scheduleResize();
                    });
                });
                if (this.container) this._resizeObserver.observe(this.container);
            } catch (e) {}
        }

        _scheduleResize() {
            if (this._resizePending || this._destroying) return;
            this._resizePending = true;
            if (this._resizeTimeout) cancelAnimationFrame(this._resizeTimeout);
            this._resizeTimeout = requestAnimationFrame(() => {
                this._resizePending = false;
                this._resizeTimeout = null;
                this.resize();
            });
        }

        _performResize() {
            if (!this.canvas || !this.ctx || this._destroying) return;

            let width = 0, height = 0;
            const parent = this.canvas.parentElement;
            if (parent) {
                const rect = parent.getBoundingClientRect();
                width = rect.width || parent.clientWidth || 0;
                height = rect.height || parent.clientHeight || 0;
            }

            if (width < 10 || height < 10) {
                setTimeout(() => this._performResize(), 100);
                return;
            }

            this._dpr = Math.min(window.devicePixelRatio || 1, 2);
            const physicalWidth = Math.floor(width * this._dpr);
            const physicalHeight = Math.floor(height * this._dpr);

            if (this.canvas.width === physicalWidth && this.canvas.height === physicalHeight) {
                if (this._needsRender && this._isVisible) {
                    this._scheduleRender();
                    this._needsRender = false;
                }
                return;
            }

            this.canvas.width = physicalWidth;
            this.canvas.height = physicalHeight;
            this.canvas.style.width = Math.floor(width) + 'px';
            this.canvas.style.height = Math.floor(height) + 'px';
            this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

            this._width = Math.floor(width);
            this._height = Math.floor(height);
            this._needsRender = true;

            if (this._isVisible) this._scheduleRender();
        }

        _scheduleRender() {
            if (this._destroying || !this.isReady) return;
            if (this._renderPending || !this._isVisible || !this.ctx) {
                this._needsRender = true;
                return;
            }
            
            this._renderPending = true;
            if (this._renderFrameId) cancelAnimationFrame(this._renderFrameId);
            
            this._renderFrameId = requestAnimationFrame(() => {
                this._renderPending = false;
                this._renderFrameId = null;
                this._render();
            });
        }

        // ============================================================
        // РЕНДЕР
        // ============================================================
        _render(highlightMode = false, highlightIndex = -1) {
            if (!this.ctx || !this.isReady || this._destroying) return;
            
            const w = this._width || 400;
            const h = this._height || 300;
            if (w < 10 || h < 10) return;
            
            // ✅ ЕСЛИ НЕТ ДАННЫХ — РИСУЕМ ПУСТОЙ ГРАФИК
            if (!this._data || !this._data.xValues || this._data.xValues.length === 0) {
                this._renderEmpty();
                return;
            }
            
            const ctx = this.ctx;
            const colors = getColors();
            const { color } = this._data;
            
            const xData = this._floatX || new Float32Array(this._data.xValues);
            const yData = this._floatY || new Float32Array(this._data.yValues);
            const len = Math.min(xData.length, yData.length);

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = colors.bg;
            ctx.fillRect(0, 0, w, h);

            const pad = this._getPadding();
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;

            if (chartW < 10 || chartH < 10) {
                this._renderEmpty();
                return;
            }

            const xRange = this._getAxisRange('x', this._data.xValues);
            const yRange = this._getAxisRange('y', this._data.yValues);
            const isXLog = this._axisConfig.x.log && xRange.min > 0;
            const isYLog = this._axisConfig.y.log && yRange.min > 0;

            // Сетка
            if (this._appearance.showGrid) {
                ctx.strokeStyle = colors.gridLine;
                ctx.lineWidth = 0.5;
                
                const xTicks = this._generateTicks(xRange, isXLog);
                for (const value of xTicks) {
                    const x = this._mapXToPixel(value, pad, chartW);
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + chartH);
                    ctx.stroke();
                }
                
                const yTicks = this._generateTicks(yRange, isYLog);
                for (const value of yTicks) {
                    const y = this._mapYToPixel(value, pad, chartH);
                    ctx.beginPath();
                    ctx.moveTo(pad.left, y);
                    ctx.lineTo(pad.left + chartW, y);
                    ctx.stroke();
                }
            }

            // Подписи
            ctx.fillStyle = colors.axisLabel;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            const xTicks = this._generateTicks(xRange, isXLog);
            for (const value of xTicks) {
                const x = this._mapXToPixel(value, pad, chartW);
                ctx.fillText(this._formatNumber(value, this._axisConfig.x.precision || 4), x, pad.top + chartH + 6);
            }

            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            
            const yTicks = this._generateTicks(yRange, isYLog);
            for (const value of yTicks) {
                const y = this._mapYToPixel(value, pad, chartH);
                ctx.fillText(this._formatNumber(value, this._axisConfig.y.precision || 4), pad.left - 6, y);
            }

            // Подписи осей
            ctx.fillStyle = colors.axisLabelDim;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this._axisConfig.x.label || 'Ось X', pad.left + chartW / 2, pad.top + chartH + 28);

            ctx.save();
            ctx.translate(12, pad.top + chartH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._axisConfig.y.label || 'Ось Y', 0, 0);
            ctx.restore();

            // Доп. линии
            for (const line of this._extraLines) {
                const y = this._mapYToPixel(line.y, pad, chartH);
                ctx.setLineDash(line.dashed ? [4, 6] : []);
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + chartW, y);
                ctx.strokeStyle = line.color || colors.gridLine;
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            const mainColor = color || '#cc2233';
            
            // Заливка
            if (this._appearance.showFill) {
                ctx.beginPath();
                const firstX = this._mapXToPixel(xData[0], pad, chartW);
                ctx.moveTo(firstX, pad.top + chartH);
                ctx.lineTo(firstX, this._mapYToPixel(yData[0], pad, chartH));
                for (let i = 0; i < len; i++) {
                    const x = this._mapXToPixel(xData[i], pad, chartW);
                    const y = this._mapYToPixel(yData[i], pad, chartH);
                    ctx.lineTo(x, y);
                }
                const lastX = this._mapXToPixel(xData[len - 1], pad, chartW);
                ctx.lineTo(lastX, pad.top + chartH);
                ctx.closePath();

                const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
                const alpha = Math.round((this._appearance.fillOpacity || 0.15) * 255).toString(16).padStart(2, '0');
                gradient.addColorStop(0, mainColor + alpha);
                gradient.addColorStop(1, mainColor + '05');
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            // Основной график
            ctx.beginPath();
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = this._appearance.lineWidth || 1.8;
            ctx.setLineDash([]);
            for (let i = 0; i < len; i++) {
                const x = this._mapXToPixel(xData[i], pad, chartW);
                const y = this._mapYToPixel(yData[i], pad, chartH);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Точки
            if (this._appearance.showPoints) {
                const step = Math.max(1, Math.floor(len / 50));
                for (let i = 0; i < len; i += step) {
                    const x = this._mapXToPixel(xData[i], pad, chartW);
                    const y = this._mapYToPixel(yData[i], pad, chartH);
                    ctx.beginPath();
                    ctx.arc(x, y, this._appearance.pointSize || 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = mainColor + '80';
                    ctx.fill();
                }
            }

            // Графики сравнения
            for (const g of this._compareGraphs) {
                if (!g.floatY || g.floatY.length === 0) continue;
                ctx.beginPath();
                ctx.strokeStyle = g.color || '#66ddff';
                ctx.lineWidth = 1.5;
                for (let i = 0; i < g.floatX.length; i++) {
                    const x = this._mapXToPixel(g.floatX[i], pad, chartW);
                    const y = this._mapYToPixel(g.floatY[i], pad, chartH);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Легенда
            if (this._appearance.showLegend) {
                this._renderLegend(ctx, pad, chartW, mainColor);
            }

            // Подсветка
            if (highlightMode && highlightIndex >= 0 && highlightIndex < len) {
                const x = this._mapXToPixel(xData[highlightIndex], pad, chartW);
                const y = this._mapYToPixel(yData[highlightIndex], pad, chartH);
                
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.strokeStyle = mainColor + 'CC';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = mainColor;
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
            
            this._needsRender = false;
        }

        _generateTicks(range, isLog) {
            const { min, max } = range;
            const ticks = [];
            
            if (isLog && min > 0) {
                const logMin = Math.floor(Math.log10(min));
                const logMax = Math.ceil(Math.log10(max));
                for (let d = logMin; d <= logMax; d++) {
                    const base = Math.pow(10, d);
                    for (let s = 1; s <= 9; s++) {
                        const v = base * s;
                        if (v >= min && v <= max) ticks.push(v);
                    }
                }
                return ticks.length > 20 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
            } else {
                const step = this._calculateStep(min, max);
                let start = Math.ceil(min / step) * step;
                while (start <= max) {
                    ticks.push(start);
                    start += step;
                }
                return ticks.length > 15 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
            }
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
            if (Math.abs(value) >= 1000) return value.toFixed(1) + 'k';
            if (Math.abs(value) >= 100) return value.toFixed(0);
            return value.toFixed(precision);
        }

        _renderLegend(ctx, pad, chartW, mainColor) {
            const colors = getColors();
            const legendX = pad.left + 8;
            let legendY = pad.top + 8;
            
            const items = [];
            if (this._data) {
                items.push({ color: mainColor, label: this._data.label || 'Основной', type: 'line' });
            }
            for (const g of this._compareGraphs) {
                items.push({ color: g.color || '#66ddff', label: g.label || 'Сравнение', type: 'line' });
            }
            for (const line of this._extraLines) {
                if (line.label) {
                    items.push({ color: line.color || colors.gridLine, label: line.label, type: 'dashed' });
                }
            }
            
            if (items.length === 0) return;
            
            let maxWidth = 0;
            ctx.font = '8px sans-serif';
            for (const item of items) {
                const w = ctx.measureText(item.label.slice(0, 15)).width;
                if (w > maxWidth) maxWidth = w;
            }
            
            for (const item of items) {
                if (legendY + 16 > pad.top + this._height - pad.bottom) return;
                
                ctx.fillStyle = colors.axisLabelDim;
                ctx.font = '8px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.label.slice(0, 15), legendX, legendY + 1);
                
                const lineX = legendX + maxWidth + 8;
                const lineY = legendY + 1;
                
                if (item.type === 'dashed') {
                    ctx.setLineDash([4, 6]);
                    ctx.strokeStyle = item.color;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(lineX, lineY);
                    ctx.lineTo(lineX + 16, lineY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    ctx.fillStyle = item.color;
                    ctx.fillRect(lineX, lineY, 16, 2);
                }
                
                legendY += 16;
            }
        }

        // ✅ ПУСТОЙ ГРАФИК (вместо "Нет данных")
        _renderEmpty() {
            if (!this.ctx) return;
            
            const ctx = this.ctx;
            const colors = getColors();
            const w = this._width || 400;
            const h = this._height || 300;
            
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = colors.bg;
            ctx.fillRect(0, 0, w, h);

            const pad = this._getPadding();
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;

            if (chartW < 10 || chartH < 10) return;

            // Сетка 10x10
            ctx.strokeStyle = colors.gridLine;
            ctx.lineWidth = 0.5;
            for (let i = 0; i <= 10; i++) {
                const x = pad.left + (chartW / 10) * i;
                ctx.beginPath();
                ctx.moveTo(x, pad.top);
                ctx.lineTo(x, pad.top + chartH);
                ctx.stroke();
            }
            for (let i = 0; i <= 10; i++) {
                const y = pad.top + (chartH / 10) * i;
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + chartW, y);
                ctx.stroke();
            }

            // Рамка
            ctx.strokeStyle = colors.gridLineStrong;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, pad.top + chartH);
            ctx.lineTo(pad.left + chartW, pad.top + chartH);
            ctx.stroke();

            // Подписи осей
            ctx.fillStyle = colors.axisLabelDim;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this._axisConfig.x.label || 'Ось X', pad.left + chartW / 2, pad.top + chartH + 28);

            ctx.save();
            ctx.translate(12, pad.top + chartH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._axisConfig.y.label || 'Ось Y', 0, 0);
            ctx.restore();

            // Подсказка
            ctx.fillStyle = colors.textMuted;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Нет данных · Нажмите "Импорт"', pad.left + chartW / 2, pad.top + chartH / 2);
        }

        // ============================================================
        // УВЕДОМЛЕНИЯ
        // ============================================================
        _emitNotification(title, message, type = 'info') {
            if (window.showNotification) {
                window.showNotification(title, message, type);
                return;
            }
            if (this._eventBus) {
                this._eventBus.emit('notification', { title, message, type });
                return;
            }
            document.dispatchEvent(new CustomEvent('notification', {
                detail: { title, message, type },
                bubbles: true
            }));
        }

        // ============================================================
        // ТЕМА
        // ============================================================
        _setupThemeSubscription() {
            this._unsubscribeTheme = subscribeToThemeChanges(() => {
                if (!this._destroying && this.isReady) {
                    this._needsRender = true;
                    this._scheduleRender();
                }
            });
        }

        // ============================================================
        // УНИЧТОЖЕНИЕ
        // ============================================================
        destroy() {
            if (this._destroying) return;
            this._destroying = true;
            this.isReady = false;
            this._initialized = false;
            
            if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
            if (this._unsubscribeTheme) { this._unsubscribeTheme(); this._unsubscribeTheme = null; }
            
            if (this.canvas) {
                this.canvas.removeEventListener('mousemove', this._mouseMoveHandler);
                this.canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
            }
            
            if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
            if (this._resizeTimeout) cancelAnimationFrame(this._resizeTimeout);
            if (this._renderFrameId) cancelAnimationFrame(this._renderFrameId);
            if (this._resizeObserver) this._resizeObserver.disconnect();
            if (this._visibilityObserver) this._visibilityObserver.disconnect();
            if (this.canvas) this.canvas.remove();
            
            this.ctx = null;
            this._data = null;
            this._floatX = null;
            this._floatY = null;
            this._compareGraphs = [];
            this._extraLines = [];
            this._root = null;
            
            if (this.container) this.container.innerHTML = '';
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    function registerGraphicWindow(registry, dataBus, eventBus, messageBus) {
        if (!registry) return false;
        if (registry.getType('graphic')) return true;

        const contextMenu = () => [
            {
                icon: 'icon-import', label: 'Импорт данных', shortcut: 'Ctrl+I',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?._importFromFile?.();
                }
            },
            {
                icon: 'icon-export', label: 'Экспорт JSON', shortcut: 'Ctrl+E',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?._exportToFile?.();
                }
            },
            { divider: true },
            {
                icon: 'icon-clear', label: 'Очистить сравнение',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?.clearCompare?.();
                }
            },
            {
                icon: 'icon-trash', label: 'Очистить всё', danger: true,
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?.clearAll?.();
                }
            }
        ];

        const headerButtons = () => [
            {
                icon: 'icon-import', label: 'Импорт',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?._importFromFile?.();
                }
            },
            {
                icon: 'icon-export', label: 'Экспорт',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?._exportToFile?.();
                }
            },
            {
                icon: 'icon-clear', label: 'Очистить',
                callback: (baseWindow) => {
                    baseWindow?.getRealInstance?.()?.clearAll?.();
                }
            }
        ];

        const dropdownMenu = {
            icon: 'icon-export', label: 'Экспорт',
            items: [
                { header: 'Экспорт данных' },
                {
                    icon: '📄', label: 'JSON',
                    callback: (baseWindow) => baseWindow?.getRealInstance?.()?._exportToFile?.()
                },
                { divider: true },
                { header: 'Экспорт изображения' },
                {
                    icon: '🖼️', label: 'PNG',
                    callback: (baseWindow) => baseWindow?.getRealInstance?.()?._exportImageToFile?.('png')
                },
                {
                    icon: '📸', label: 'JPEG',
                    callback: (baseWindow) => baseWindow?.getRealInstance?.()?._exportImageToFile?.('jpeg')
                }
            ]
        };

        return registry.register({
            id: 'graphic',
            name: 'Graphic',
            icon: 'icon-graphic',
            description: 'График с поддержкой Float32Array и log/linear шкал',
            category: 'analysis',
            defaultSize: { width: 500, height: 400 },
            minSize: { width: 200, height: 150 },
            maxWindows: 4,
            priority: 1,
            metadata: { version: '6.0.0', author: 'LSYSTEM' },
            contextMenu, headerButtons, dropdownMenu,
            create: (container, windowData) => new GraphicWindow(container, windowData),
            onDestroy: (c, w, i) => i?.destroy?.(),
            onResize: (c, w, i) => i?.resize?.()
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    if (typeof window !== 'undefined') {
        window.GraphicWindow = GraphicWindow;
        window.registerGraphicWindow = registerGraphicWindow;
        window._GraphicTheme = { ThemeColors, getCurrentTheme, getColors, subscribeToThemeChanges };
        console.log('[GraphicWindow] Registered globally v6.0.0');
    }

})();