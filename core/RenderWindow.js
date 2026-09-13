// core/RenderWindow.js
// Версия 6.2.1 - Fix: canImport/canExport через window.BaseWindowInstance.prototype
// - data-action / data-value на кнопках шапки
// - _createDataDropdown: корректная проверка переопределения onImport/onExport
// - Остальное — как в v6.1.0

(function() {
    'use strict';

    console.log('[RenderWindow] Loading v6.2.1...');

    // ============================================================
    // HELPERS
    // ============================================================

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    // ============================================================
    // CLASS
    // ============================================================

    class RenderWindow {
        constructor({ container, type, options = {} }) {
            this.container = container;
            this.type = type;
            this.id = options.id || Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            this._registry = options.registry || null;
            this._layoutManager = options.layoutManager || null;
            this._baseWindow = options.baseWindow || null;

            this._title = options.title || type || 'Window';
            this._icon = options.icon || '📄';
            this._typeConfig = this._registry ? this._registry.getType(type) : null;
            this._headerButtonsConfig = options.headerButtons || [];
            this._contextMenuConfig = options.contextMenu || [];
            this._dropdownMenuConfig = options.dropdownMenu || null;

            this._isReady = false;
            this._isDestroyed = false;
            this._windowCount = 1;
            this._isFullscreen = false;

            this._customFullW = 0;
            this._customMinW = 0;

            this._buttonsVersion = 0;
            this._measuredVersion = -1;

            this._listeners = {};

            // DOM
            this._root = null;
            this._header = null;
            this._headerIcon = null;
            this._headerLeft = null;
            this._titleElement = null;
            this._headerRightBlock = null;
            this._customButtons = null;
            this._dataBtnWrapper = null;
            this._hardButtons = null;
            this._content = null;
            this._divider = null;
            this._layoutWrapper = null;
            this._changeTypeWrapper = null;
            this._minimizeBtn = null;
            this._fullscreenBtn = null;
            this._closeBtn = null;
            this._dropdownWrapper = null;

            this._headerSizeObserver = null;
            this._headerRAF = null;

            this._resizeObserver = null;
            this._resizeTimeout = null;
            this._resizeRAF = null;
            this._lastSize = { width: 0, height: 0, dpr: 1 };

            this._zeroResizeAttempts = 0;
            this._maxZeroResizeAttempts = 10;

            this._closeHandlers = [];

            this._init();
        }

        // ============================================================
        // 1. ИНИЦИАЛИЗАЦИЯ
        // ============================================================

        _init() {
            console.log('[RenderWindow] Initializing:', this.type, '(', this.id, ')');
            this._buildDOM();
            this._setupResizeObserver();
            this._setupHeaderAdaptive();

            if (this._layoutManager) {
                this._windowCount = this._layoutManager.getWindowCount() || 1;
                this._isFullscreen = this._layoutManager.isFullscreen?.(this.id) || false;
            }

            this._isReady = true;
            this._scheduleResize();

            requestAnimationFrame(() => {
                if (this._isReady && !this._isDestroyed) {
                    this._measureBaseWidths();
                    this._updateHeaderAdaptive();
                }
            });

            console.log('[RenderWindow] ✅ Ready:', this.type, '(', this.id, ')');
        }

        // ============================================================
        // 2. СОБЫТИЯ
        // ============================================================

        on(event, callback) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(callback);
            return () => this.off(event, callback);
        }

        off(event, callback) {
            if (!this._listeners[event]) return;
            const index = this._listeners[event].indexOf(callback);
            if (index !== -1) this._listeners[event].splice(index, 1);
        }

        _emit(event, data) {
            if (this._listeners[event]) {
                const listeners = this._listeners[event];
                for (let i = 0; i < listeners.length; i++) {
                    try { listeners[i](data); } catch (e) {
                        console.error('[RenderWindow] Listener error:', e);
                    }
                }
            }
        }

        // ============================================================
        // 3. ПОСТРОЕНИЕ DOM
        // ============================================================

        _buildDOM() {
            this.container.innerHTML = '';

            this._root = document.createElement('div');
            this._root.className = 'window-root';
            this._root.dataset.windowId = this.id;
            this._root.dataset.windowType = this.type;

            Object.assign(this._root.style, {
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                background: 'var(--bg-panel, #1a1a1a)',
                borderRadius: 'var(--radius, 6px)',
                overflow: 'hidden',
                position: 'relative',
                boxSizing: 'border-box',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
            });

            this._buildHeader();
            this._buildContent();

            this.container.appendChild(this._root);
        }

        // ============================================================
        // 4. ШАПКА
        // ============================================================

        _buildHeader() {
            this._header = document.createElement('div');
            this._header.className = 'window-header';
            this._header.dataset.windowId = this.id;

            Object.assign(this._header.style, {
                display: 'flex',
                alignItems: 'center',
                flexShrink: '0',
                background: 'var(--bg-card, #222222)',
                borderBottom: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                userSelect: 'none',
                position: 'relative',
                boxSizing: 'border-box',
                overflow: 'hidden',
                height: '28px',
                padding: '0 6px',
                gap: '6px',
                fontSize: '10px'
            });

            // 1. ИКОНКА
            this._headerIcon = document.createElement('span');
            this._headerIcon.className = 'window-icon';
            Object.assign(this._headerIcon.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                width: '16px',
                height: '16px',
                minWidth: '16px',
                maxWidth: '16px',
                pointerEvents: 'none',
                overflow: 'visible'
            });
            this._updateIcon();

            // 2. LEFT: TITLE
            this._headerLeft = document.createElement('div');
            this._headerLeft.className = 'window-header-left';
            Object.assign(this._headerLeft.style, {
                display: 'flex',
                alignItems: 'center',
                flex: '1 1 auto',
                minWidth: '0',
                overflow: 'hidden',
                height: '100%',
                lineHeight: '1'
            });

            this._titleElement = document.createElement('span');
            this._titleElement.className = 'window-title';
            Object.assign(this._titleElement.style, {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--beige, #e0d8cc)',
                flex: '1 1 auto',
                minWidth: '0',
                lineHeight: '13px',
                height: '13px',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale'
            });
            this._titleElement.textContent = this._title;
            this._titleElement.title = this._title;
            this._headerLeft.appendChild(this._titleElement);

            // 3. RIGHT BLOCK
            this._headerRightBlock = document.createElement('div');
            this._headerRightBlock.className = 'window-header-right-block';
            Object.assign(this._headerRightBlock.style, {
                display: 'flex',
                alignItems: 'center',
                flex: '0 0 auto',
                flexShrink: '0',
                gap: '4px',
                height: '100%',
                overflow: 'hidden',
                minWidth: '0'
            });

            // 3.1 SOFT
            this._customButtons = document.createElement('div');
            this._customButtons.className = 'window-custom-buttons';
            Object.assign(this._customButtons.style, {
                display: 'flex',
                alignItems: 'center',
                flex: '0 1 auto',
                minWidth: '0',
                gap: '4px',
                overflow: 'hidden',
                height: '100%',
                position: 'relative',
                zIndex: '1'
            });

            // 3.2 HARD
            this._hardButtons = document.createElement('div');
            this._hardButtons.className = 'window-hard-buttons';
            Object.assign(this._hardButtons.style, {
                display: 'flex',
                alignItems: 'center',
                flex: '0 0 auto',
                flexShrink: '0',
                flexGrow: '0',
                gap: '4px',
                height: '100%',
                position: 'relative',
                zIndex: '2'
            });

            this._headerRightBlock.appendChild(this._customButtons);
            this._headerRightBlock.appendChild(this._hardButtons);

            // СБОРКА
            this._header.appendChild(this._headerIcon);
            this._header.appendChild(this._headerLeft);
            this._header.appendChild(this._headerRightBlock);

            this._root.appendChild(this._header);

            this._rebuildHeaderButtons();
            this._setupDragAndDrop();
            this._setupContextMenu();
            this._setupLayoutListener();
        }

        _setupLayoutListener() {
            const handler = () => {
                if (this._isReady && !this._isDestroyed) {
                    this.updateWindowCount();
                    if (this._layoutManager) {
                        const fs = this._layoutManager.isFullscreen?.(this.id) || false;
                        this.setFullscreenState(fs);
                    }
                }
            };
            document.addEventListener('layout-changed', handler);
            this._closeHandlers.push(() => document.removeEventListener('layout-changed', handler));
        }

        _updateIcon() {
            if (!this._headerIcon) return;

            if (this._icon && typeof this._icon === 'string' && this._icon.startsWith('icon-')) {
                this._headerIcon.innerHTML = `
                    <svg class="icon-svg" style="width:100%;height:100%;fill:currentColor;display:block;">
                        <use href="#${escapeAttr(this._icon)}"></use>
                    </svg>
                `;
            } else {
                this._headerIcon.innerHTML = '';
                this._headerIcon.textContent = this._icon || '📄';
                this._headerIcon.style.fontSize = '14px';
                this._headerIcon.style.lineHeight = '1';
            }
        }

        // ============================================================
        // 5. КНОПКИ ШАПКИ
        // ============================================================

        _rebuildHeaderButtons() {
            if (!this._hardButtons || !this._customButtons) return;

            if (this._layoutManager) {
                this._windowCount = this._layoutManager.getWindowCount() || 1;
            }

            this._customButtons.innerHTML = '';
            this._hardButtons.innerHTML = '';

            this._customFullW = 0;
            this._customMinW = 0;

            this._buttonsVersion++;
            this._measuredVersion = -1;

            // SOFT: dropdownMenu
            if (this._dropdownMenuConfig) {
                if (!this._dropdownWrapper) {
                    this._dropdownWrapper = this._createDropdownButton(this._dropdownMenuConfig);
                }
                if (this._dropdownWrapper) {
                    this._customButtons.appendChild(this._dropdownWrapper);
                }
            }

            // SOFT: headerButtons
            if (Array.isArray(this._headerButtonsConfig) && this._headerButtonsConfig.length > 0) {
                for (const btnConfig of this._headerButtonsConfig) {
                    const btn = this._createHeaderButton(btnConfig);
                    if (btn) this._customButtons.appendChild(btn);
                }
            }

            // HARD: DIVIDER
            if (this._customButtons.childElementCount > 0) {
                if (!this._divider) {
                    this._divider = document.createElement('span');
                    this._divider.className = 'header-divider';
                    Object.assign(this._divider.style, {
                        width: '1px',
                        height: '14px',
                        background: 'var(--border-color, rgba(200, 184, 154, 0.12))',
                        flexShrink: '0',
                        margin: '0 2px'
                    });
                }
                this._hardButtons.appendChild(this._divider);
            }

            // HARD: ICON-DATA
            if (!this._dataBtnWrapper) {
                this._dataBtnWrapper = this._createDataButton();
            }
            this._hardButtons.appendChild(this._dataBtnWrapper);

            // HARD: LAYOUT
            if (this._windowCount > 1) {
                if (!this._layoutWrapper) {
                    this._layoutWrapper = this._createLayoutButton();
                }
                this._layoutWrapper.style.display = 'flex';
                this._hardButtons.appendChild(this._layoutWrapper);
            } else if (this._layoutWrapper) {
                this._layoutWrapper.style.display = 'none';
            }

            // HARD: CHANGE TYPE
            if (!this._changeTypeWrapper) {
                this._changeTypeWrapper = this._createChangeTypeButton();
            }
            this._hardButtons.appendChild(this._changeTypeWrapper);

            // HARD: MINIMIZE
            if (!this._minimizeBtn) {
                this._minimizeBtn = this._createMinimizeButton();
            }
            this._hardButtons.appendChild(this._minimizeBtn);

            // HARD: FULLSCREEN
            if (!this._fullscreenBtn) {
                this._fullscreenBtn = this._createFullscreenButton();
            }
            this._hardButtons.appendChild(this._fullscreenBtn);

            // HARD: CLOSE
            if (!this._closeBtn) {
                this._closeBtn = this._createCloseButton();
            }
            this._hardButtons.appendChild(this._closeBtn);

            if (this._isReady) {
                requestAnimationFrame(() => {
                    if (this._isReady && !this._isDestroyed) {
                        this._measureBaseWidths();
                        this._updateHeaderAdaptive();
                    }
                });
            }
        }

        // ============================================================
        // 6. ICON-DATA DROPDOWN
        // ============================================================

        _createDataButton() {
            const wrapper = document.createElement('div');
            wrapper.className = 'window-actions data-btn-wrapper';
            Object.assign(wrapper.style, {
                position: 'relative',
                display: 'flex',
                flexShrink: '0'
            });

            const btn = document.createElement('button');
            btn.className = 'data-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-data"></use>
                </svg>
            `;
            btn.title = 'Данные';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            const dropdown = this._createDataDropdown();
            wrapper.appendChild(btn);
            wrapper.appendChild(dropdown);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.data-dropdown').forEach(el => {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                const isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    dropdown.style.display = 'none';
                    dropdown.style.opacity = '0';
                    btn.classList.remove('active');
                } else {
                    if (typeof dropdown._renderItems === 'function') dropdown._renderItems();
                    dropdown.style.display = 'block';
                    dropdown.style.opacity = '0';
                    this._positionDropdown(dropdown, btn);
                    requestAnimationFrame(() => {
                        dropdown.style.opacity = '1';
                        dropdown.style.transform = 'translateY(0) scale(1)';
                    });
                    btn.classList.add('active');
                }
            });

            return wrapper;
        }

        _createDataDropdown() {
            const dropdown = document.createElement('div');
            dropdown.className = 'window-dropdown data-dropdown';
            dropdown.dataset.windowId = this.id;
            dropdown.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: var(--radius, 6px);
                padding: 4px 0;
                min-width: 180px;
                max-width: 320px;
                width: max-content;
                z-index: 999999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                display: none;
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
                transition: opacity 0.15s ease, transform 0.15s ease;
                max-height: 400px;
                overflow-y: auto;
            `;

            const renderItems = () => {
                const realInstance = this._baseWindow?.getRealInstance?.();

                // ✅ v6.2.1: проверка переопределения onImport/onExport через prototype
                const proto = (typeof window !== 'undefined' && window.BaseWindowInstance)
                    ? window.BaseWindowInstance.prototype
                    : null;

                const canImport = !!realInstance
                    && typeof realInstance.onImport === 'function'
                    && (!proto || realInstance.onImport !== proto.onImport);

                const canExport = !!realInstance
                    && typeof realInstance.onExport === 'function'
                    && (!proto || realInstance.onExport !== proto.onExport);

                dropdown.innerHTML = '';

                dropdown.appendChild(this._makeDataItem({
                    icon: 'icon-import',
                    label: 'Импорт',
                    disabled: !canImport,
                    onClick: () => {
                        this._emit('data-import', { windowId: this.id });
                        this._closeDataDropdown(dropdown);
                    }
                }));

                dropdown.appendChild(this._makeDataItem({
                    icon: 'icon-export',
                    label: 'Экспорт',
                    disabled: !canExport,
                    onClick: () => {
                        this._emit('data-export', { windowId: this.id });
                        this._closeDataDropdown(dropdown);
                    }
                }));

                dropdown.appendChild(this._makeDivider());

                dropdown.appendChild(this._makeDataItem({
                    icon: 'icon-plus',
                    label: 'Новый слот',
                    onClick: () => {
                        this._emit('data-new-slot', { windowId: this.id });
                        this._closeDataDropdown(dropdown);
                    }
                }));

                dropdown.appendChild(this._makeAttachItem());
            };

            renderItems();
            dropdown._renderItems = renderItems;

            document.body.appendChild(dropdown);

            const closeHandler = (e) => {
                if (dropdown.style.display !== 'block') return;
                const btn = dropdown.parentElement?.querySelector('.data-btn');
                if (btn && btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                this._closeDataDropdown(dropdown);
            };
            document.addEventListener('click', closeHandler);
            this._closeHandlers.push(() => document.removeEventListener('click', closeHandler));

            const repositionHandler = () => {
                if (dropdown.style.display !== 'block') return;
                const btn = dropdown.parentElement?.querySelector('.data-btn');
                if (btn) this._positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);
            this._closeHandlers.push(() => {
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
            });

            this._closeHandlers.push(() => {
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            });

            return dropdown;
        }

        _closeDataDropdown(dropdown) {
            if (!dropdown) return;
            dropdown.style.display = 'none';
            dropdown.style.opacity = '0';
            const btn = dropdown.parentElement?.querySelector('.data-btn');
            if (btn) btn.classList.remove('active');
        }

        _makeDataItem({ icon, label, disabled = false, danger = false, onClick }) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item';

            const iconHtml = icon && icon.startsWith('icon-')
                ? `<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;">
                    <use href="#${escapeAttr(icon)}"></use>
                   </svg>`
                : `<span style="font-size:14px;flex-shrink:0;width:16px;text-align:center;">${escapeHtml(icon || '')}</span>`;

            btn.innerHTML = `
                ${iconHtml}
                <span style="flex:1;text-align:left;">${escapeHtml(label)}</span>
            `;

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 14px',
                border: 'none',
                background: 'transparent',
                color: danger
                    ? 'var(--accent-red, #cc2233)'
                    : 'var(--text-primary, #e0d8cc)',
                fontSize: '12px',
                cursor: disabled ? 'default' : 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
                fontFamily: 'inherit',
                opacity: disabled ? '0.4' : '1',
                outline: 'none'
            });

            if (!disabled) {
                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'transparent';
                });
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onClick();
                });
            }

            return btn;
        }

        _makeDivider() {
            const hr = document.createElement('hr');
            hr.style.cssText = `
                border: none;
                border-top: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                margin: 4px 8px;
                opacity: 0.3;
            `;
            return hr;
        }

        _makeAttachItem() {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;">
                    <use href="#icon-link"></use>
                </svg>
                <span style="flex:1;text-align:left;">Привязать</span>
                <svg class="icon-svg" style="width:9px;height:9px;flex-shrink:0;fill:currentColor;opacity:0.6;">
                    <use href="#icon-chevron-right"></use>
                </svg>
            `;
            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 14px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
                fontFamily: 'inherit',
                outline: 'none'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'transparent';
            });

            const submenu = document.createElement('div');
            submenu.className = 'data-submenu';
            submenu.dataset.windowId = this.id;
            submenu.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: var(--radius, 6px);
                padding: 4px 0;
                min-width: 200px;
                max-width: 360px;
                z-index: 1000000;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                display: none;
                opacity: 0;
                transition: opacity 0.15s ease;
                max-height: 400px;
                overflow-y: auto;
            `;

            const buildSubmenu = () => {
                submenu.innerHTML = '';

                const baseWindow = this._baseWindow;
                const dataBus = baseWindow?._dataBus;
                const currentSlotId = baseWindow?.getSlotId?.();

                if (!dataBus) {
                    submenu.appendChild(this._makeDataItem({
                        icon: 'icon-warning',
                        label: 'DataBus недоступен',
                        disabled: true,
                        onClick: () => {}
                    }));
                    return;
                }

                const activeSlots = dataBus.getActiveSlotsByType(this.type);
                const freeSlots = dataBus.getFreeActiveSlotsByType(this.type);
                const archivedSlots = dataBus.getArchivedSlotsByType(this.type);

                const allSlotIds = [];
                for (const sid of freeSlots) {
                    if (!allSlotIds.includes(sid)) allSlotIds.push(sid);
                }
                for (const sid of activeSlots) {
                    if (!allSlotIds.includes(sid)) allSlotIds.push(sid);
                }
                for (const sid of archivedSlots) {
                    if (!allSlotIds.includes(sid)) allSlotIds.push(sid);
                }

                if (allSlotIds.length === 0) {
                    submenu.appendChild(this._makeDataItem({
                        icon: '—',
                        label: 'Нет слотов',
                        disabled: true,
                        onClick: () => {}
                    }));
                    return;
                }

                for (const sid of allSlotIds) {
                    const slot = dataBus.getSlot(sid);
                    if (!slot) continue;

                    const isCurrent = sid === currentSlotId;
                    const isArchived = slot.archived;
                    const attachedCount = slot.attachedWindows.length;

                    let hint = '';
                    if (isArchived) hint = 'архив';
                    else if (attachedCount > 1) hint = attachedCount + ' окон';
                    else if (attachedCount === 1) hint = '1 окно';

                    const iconId = isCurrent
                        ? 'icon-circle-filled'
                        : (isArchived ? 'icon-archive' : 'icon-circle');

                    const item = this._makeDataItem({
                        icon: iconId,
                        label: sid + (hint ? '  ·  ' + hint : ''),
                        danger: isCurrent,
                        onClick: () => {
                            if (!isCurrent) {
                                this._emit('data-attach', {
                                    windowId: this.id,
                                    slotId: sid
                                });
                            }
                            this._closeDataDropdown(submenu);
                            this._closeDataDropdown(dropdown);
                        }
                    });

                    if (isCurrent) {
                        item.style.opacity = '0.7';
                    }
                    submenu.appendChild(item);
                }
            };

            const openSubmenu = () => {
                buildSubmenu();
                submenu.style.display = 'block';
                submenu.style.opacity = '0';

                const btnRect = btn.getBoundingClientRect();
                const ddWidth = submenu.offsetWidth || 200;
                const ddHeight = submenu.offsetHeight || 200;

                let left = Math.round(btnRect.right + 4);
                let top = Math.round(btnRect.top);

                if (left + ddWidth > window.innerWidth - 4) {
                    left = Math.round(btnRect.left - ddWidth - 4);
                }
                if (left < 4) left = 4;
                if (top + ddHeight > window.innerHeight - 4) {
                    top = window.innerHeight - ddHeight - 4;
                }
                if (top < 4) top = 4;

                submenu.style.left = left + 'px';
                submenu.style.top = top + 'px';

                requestAnimationFrame(() => {
                    submenu.style.opacity = '1';
                });
            };

            const closeSubmenu = () => {
                submenu.style.display = 'none';
                submenu.style.opacity = '0';
            };

            btn.addEventListener('mouseenter', openSubmenu);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openSubmenu();
            });

            wrapper.addEventListener('mouseleave', (e) => {
                if (submenu.contains(e.relatedTarget)) return;
                closeSubmenu();
            });

            submenu.addEventListener('mouseleave', (e) => {
                if (wrapper.contains(e.relatedTarget)) return;
                closeSubmenu();
            });

            wrapper.appendChild(btn);
            document.body.appendChild(submenu);

            this._closeHandlers.push(() => {
                if (submenu.parentNode) submenu.parentNode.removeChild(submenu);
            });

            return wrapper;
        }

        // ============================================================
        // 7. CUSTOM DROPDOWN MENU
        // ============================================================

        _createDropdownButton(config) {
            const wrapper = document.createElement('div');
            wrapper.className = 'window-actions dropdown-wrapper';
            Object.assign(wrapper.style, {
                position: 'relative',
                display: 'flex',
                flexShrink: '0',
                overflow: 'hidden'
            });

            const btn = document.createElement('button');
            btn.className = 'window-action-btn dropdown-toggle';
            btn.title = config.label || 'Menu';
            btn.setAttribute('type', 'button');

            // ✅ v6.2.1: data-action
            if (config.action) btn.setAttribute('data-action', config.action);

            const iconHtml = config.icon && config.icon.startsWith('icon-')
                ? `<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;">
                    <use href="#${escapeAttr(config.icon)}"></use>
                </svg>`
                : escapeHtml(config.icon || '☰');

            btn.innerHTML = `
                <span class="dropdown-icon" style="display:flex;align-items:center;flex-shrink:0;">${iconHtml}</span>
                <span class="btn-text-wrapper" style="display:flex;align-items:center;gap:var(--rw-btn-gap-active, 4px);min-width:0;overflow:hidden;">
                    <span class="dropdown-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">${escapeHtml(config.label || '')}</span>
                    <span class="dropdown-arrow" style="font-size:8px;flex-shrink:0;opacity:var(--rw-label-opacity, 1);">▼</span>
                </span>
            `;

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--rw-btn-gap-active, 4px)',
                padding: '0 var(--rw-btn-pad-x, 8px)',
                height: '22px',
                minHeight: '22px',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                fontSize: '10px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                flexShrink: '0',
                userSelect: 'none',
                overflow: 'hidden',
                boxSizing: 'border-box'
            });

            const dropdown = document.createElement('div');
            dropdown.className = 'window-dropdown menu-dropdown';
            dropdown.dataset.windowId = this.id;
            dropdown.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: var(--radius, 6px);
                padding: 4px 0;
                min-width: 100px;
                max-width: 280px;
                width: max-content;
                z-index: 999999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                display: none;
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
                transition: opacity 0.15s ease, transform 0.15s ease;
                max-height: 400px;
                overflow-y: auto;
            `;

            this._renderDropdownItems(dropdown, config.items || [], config);

            wrapper.appendChild(btn);
            document.body.appendChild(dropdown);

            const positionDropdown = () => {
                const btnRect = btn.getBoundingClientRect();
                const ddWidth = dropdown.offsetWidth || 200;
                const ddHeight = dropdown.offsetHeight || 200;

                let left = Math.round(btnRect.right - ddWidth);
                let top = Math.round(btnRect.bottom + 4);

                if (left < 4) left = 4;
                if (left + ddWidth > window.innerWidth - 4) {
                    left = window.innerWidth - ddWidth - 4;
                }
                if (top + ddHeight > window.innerHeight - 4) {
                    top = Math.round(btnRect.top - ddHeight - 4);
                    if (top < 4) top = 4;
                }

                dropdown.style.left = left + 'px';
                dropdown.style.top = top + 'px';
            };

            const closeDropdown = () => {
                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                btn.classList.remove('active');
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            };

            const openDropdown = () => {
                dropdown.style.display = 'block';
                dropdown.style.opacity = '0';
                positionDropdown();
                requestAnimationFrame(() => {
                    dropdown.style.opacity = '1';
                    dropdown.style.transform = 'translateY(0) scale(1)';
                });
                btn.classList.add('active');
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            };

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.menu-dropdown').forEach(el => {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                const isOpen = dropdown.style.display === 'block';
                if (isOpen) closeDropdown();
                else openDropdown();
            });

            const closeHandler = (e) => {
                if (dropdown.style.display !== 'block') return;
                if (wrapper.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                closeDropdown();
            };
            document.addEventListener('click', closeHandler);
            this._closeHandlers.push(() => document.removeEventListener('click', closeHandler));

            const repositionHandler = () => {
                if (dropdown.style.display === 'block') positionDropdown();
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);
            this._closeHandlers.push(() => {
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
            });

            this._closeHandlers.push(() => {
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            });

            return wrapper;
        }

        _renderDropdownItems(container, items, config) {
            if (!Array.isArray(items)) return;

            for (const item of items) {
                if (item.header) {
                    const header = document.createElement('div');
                    header.className = 'dropdown-header';
                    header.style.cssText = `
                        padding: 6px 14px 4px 14px;
                        font-size: 10px;
                        font-weight: 600;
                        color: var(--text-muted, rgba(200, 184, 154, 0.35));
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                        margin-bottom: 2px;
                        pointer-events: none;
                    `;
                    header.textContent = item.header;
                    container.appendChild(header);
                    continue;
                }

                if (item.divider) {
                    const divider = document.createElement('hr');
                    divider.style.cssText = `
                        border: none;
                        border-top: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                        margin: 4px 12px;
                        opacity: 0.3;
                    `;
                    container.appendChild(divider);
                    continue;
                }

                const btn = document.createElement('button');
                btn.className = 'dropdown-item';
                btn.dataset.action = item.action || '';
                btn.dataset.value = item.value || '';
                btn.setAttribute('type', 'button');

                const isActive = item.check || false;
                const isDanger = item.danger || false;
                const isDisabled = item.disabled || false;

                const iconHtml = item.icon && item.icon.startsWith('icon-')
                    ? `<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;">
                        <use href="#${escapeAttr(item.icon)}"></use>
                       </svg>`
                    : (item.icon ? `<span style="font-size:14px;flex-shrink:0;">${escapeHtml(item.icon)}</span>` : '');

                btn.innerHTML = `
                    ${iconHtml}
                    <span class="item-label" style="flex:1;text-align:left;">${escapeHtml(item.label)}</span>
                    ${item.shortcut ? `<span class="item-shortcut" style="color:var(--text-muted, rgba(200,184,154,0.35));font-size:9px;flex-shrink:0;">${escapeHtml(item.shortcut)}</span>` : ''}
                    ${isActive ? `<span class="dropdown-check" style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>` : ''}
                `;

                Object.assign(btn.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 14px',
                    border: 'none',
                    background: isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent',
                    color: isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-primary, #e0d8cc)',
                    fontSize: '12px',
                    cursor: isDisabled ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit',
                    opacity: isDisabled ? '0.4' : '1',
                    borderLeft: isActive ? '3px solid var(--accent-red, #cc2233)' : '3px solid transparent',
                    outline: 'none'
                });

                if (!isDisabled) {
                    btn.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                    });
                    btn.addEventListener('mouseleave', function() {
                        this.style.background = isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent';
                    });
                }

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    if (isDisabled) return;

                    const action = btn.dataset.action || '';
                    const value = btn.dataset.value || '';

                    if (item.callback && typeof item.callback === 'function') {
                        item.callback(this._baseWindow);
                    }

                    this._emit('menu-action', {
                        windowId: this.id,
                        action: action,
                        value: value,
                        item: item
                    });

                    container.style.display = 'none';
                    container.style.opacity = '0';
                });

                container.appendChild(btn);
            }
        }

        // ============================================================
        // 8. ОБЫЧНЫЕ КНОПКИ (soft)
        // ============================================================

        _createHeaderButton(btnConfig) {
            const btn = document.createElement('button');
            btn.className = 'window-action-btn';
            btn.title = btnConfig.title || '';
            btn.setAttribute('type', 'button');

            // ✅ v6.2.1: data-action / data-value для drag-source
            if (btnConfig.action) btn.setAttribute('data-action', btnConfig.action);
            if (btnConfig.value)  btn.setAttribute('data-value', btnConfig.value);

            const iconHtml = btnConfig.icon && btnConfig.icon.startsWith('icon-')
                ? `<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;">
                    <use href="#${escapeAttr(btnConfig.icon)}"></use>
                   </svg>`
                : escapeHtml(btnConfig.icon || '');

            btn.innerHTML = `
                <span class="btn-icon" style="display:flex;align-items:center;flex-shrink:0;">${iconHtml}</span>
                <span class="btn-text-wrapper" style="display:flex;align-items:center;gap:var(--rw-btn-gap-active, 4px);min-width:0;overflow:hidden;">
                    ${btnConfig.label ? `<span class="btn-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">${escapeHtml(btnConfig.label)}</span>` : ''}
                </span>
            `;

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--rw-btn-gap-active, 4px)',
                padding: '0 var(--rw-btn-pad-x, 8px)',
                height: '22px',
                minHeight: '22px',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: btnConfig.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: btnConfig.color || 'var(--text-secondary, #a09888)',
                fontSize: '10px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                flexShrink: '0',
                userSelect: 'none',
                overflow: 'hidden',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = btnConfig.hoverBg || 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = btnConfig.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = btnConfig.color || 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btnConfig.callback && typeof btnConfig.callback === 'function') {
                    btnConfig.callback(this._baseWindow);
                    return;
                }
                this._emit('menu-action', {
                    windowId: this.id,
                    action: btnConfig.action || '',
                    value: btnConfig.value || '',
                    item: btnConfig
                });
            });

            return btn;
        }

        // ============================================================
        // 9. MINIMIZE BUTTON
        // ============================================================

        _createMinimizeButton() {
            const btn = document.createElement('button');
            btn.className = 'minimize-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-minimize"></use>
                </svg>
            `;
            btn.title = 'Свернуть окно';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._emit('minimize', { windowId: this.id });
            });

            return btn;
        }

        // ============================================================
        // 10. FULLSCREEN BUTTON
        // ============================================================

        _createFullscreenButton() {
            const btn = document.createElement('button');
            btn.className = 'fullscreen-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-fullscreen"></use>
                </svg>
            `;
            btn.title = 'На весь экран';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._isFullscreen) {
                    this._emit('fullscreen-exit', { windowId: this.id });
                } else {
                    this._emit('fullscreen', { windowId: this.id });
                }
            });

            return btn;
        }

        setFullscreenState(isFullscreen) {
            const next = !!isFullscreen;
            if (this._isFullscreen === next) return;

            this._isFullscreen = next;

            if (this._fullscreenBtn) {
                const use = this._fullscreenBtn.querySelector('use');
                if (use) {
                    use.setAttribute('href', next ? '#icon-fullscreen-exit' : '#icon-fullscreen');
                }
                this._fullscreenBtn.title = next ? 'Выйти из полного экрана' : 'На весь экран';
            }

            if (this._root) {
                this._root.classList.toggle('is-fullscreen', next);
            }
        }

        // ============================================================
        // 11. CLOSE BUTTON
        // ============================================================

        _createCloseButton() {
            const btn = document.createElement('button');
            btn.className = 'close-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-close"></use>
                </svg>
            `;
            btn.title = 'Close Window';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--accent-red, #cc2233)';
                this.style.borderColor = 'var(--accent-red, #cc2233)';
                this.style.color = '#fff';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._emit('close', { windowId: this.id });
            });

            return btn;
        }

        // ============================================================
        // 12. CHANGE TYPE
        // ============================================================

        _createChangeTypeButton() {
            const wrapper = document.createElement('div');
            wrapper.className = 'window-actions change-type-wrapper';
            Object.assign(wrapper.style, {
                position: 'relative',
                display: 'flex',
                flexShrink: '0'
            });

            const btn = document.createElement('button');
            btn.className = 'change-type-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-window-type"></use>
                </svg>
            `;
            btn.title = 'Change Window Type';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            const dropdown = this._createTypeDropdown();
            wrapper.appendChild(btn);
            wrapper.appendChild(dropdown);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.change-type-dropdown').forEach(el => {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                const isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    dropdown.style.display = 'none';
                    dropdown.style.opacity = '0';
                    btn.classList.remove('active');
                } else {
                    if (typeof dropdown._renderItems === 'function') dropdown._renderItems();
                    dropdown.style.display = 'block';
                    dropdown.style.opacity = '0';
                    this._positionDropdown(dropdown, btn);
                    requestAnimationFrame(() => {
                        dropdown.style.opacity = '1';
                        dropdown.style.transform = 'translateY(0) scale(1)';
                    });
                    btn.classList.add('active');
                }
            });

            return wrapper;
        }

        _createTypeDropdown() {
            const dropdown = document.createElement('div');
            dropdown.className = 'window-dropdown change-type-dropdown';
            dropdown.dataset.windowId = this.id;
            dropdown.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: var(--radius, 6px);
                padding: 4px 0;
                min-width: 100px;
                max-width: 280px;
                width: max-content;
                z-index: 999999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                display: none;
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
                transition: opacity 0.15s ease, transform 0.15s ease;
                max-height: 400px;
                overflow-y: auto;
            `;

            const renderItems = () => {
                const allTypes = this._registry ? this._registry.getAllTypes() : [];
                const currentType = this.type;

                let html = `
                    <div style="padding:6px 14px 4px 14px;font-size:10px;font-weight:600;color:var(--text-muted, rgba(200,184,154,0.35));text-transform:uppercase;letter-spacing:0.5px;">
                        Change Window Type
                    </div>
                    <hr style="border:none;border-top:1px solid var(--border-color, rgba(200,184,154,0.12));margin:4px 8px;opacity:0.3;">
                `;

                for (const type of allTypes) {
                    const isActive = type.id === currentType;
                    const iconHtml = type.icon && typeof type.icon === 'string' && type.icon.startsWith('icon-')
                        ? `<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;">
                            <use href="#${escapeAttr(type.icon)}"></use>
                        </svg>`
                        : `<span style="font-size:14px;flex-shrink:0;">${escapeHtml(type.icon || '📄')}</span>`;

                    html += `
                        <button class="dropdown-item${isActive ? ' active' : ''}"
                                data-type-id="${escapeAttr(type.id)}"
                                style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 14px;border:none;background:${isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent'};color:${isActive ? 'var(--beige, #e0d8cc)' : 'var(--text-primary, #e0d8cc)'};font-size:12px;cursor:pointer;text-align:left;transition:background 0.15s ease;font-family:inherit;border-radius:0;border-left:2px solid ${isActive ? 'var(--accent-red, #cc2233)' : 'transparent'};">
                            ${iconHtml}
                            <span style="flex:1;">${escapeHtml(type.name)}</span>
                            ${isActive ? '<span style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>' : ''}
                        </button>
                    `;
                }

                dropdown.innerHTML = html;
            };

            renderItems();
            dropdown._renderItems = renderItems;

            dropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (!item) return;

                e.stopPropagation();
                e.preventDefault();

                const newType = item.dataset.typeId;
                if (newType && newType !== this.type) {
                    this._emit('change-type', { windowId: this.id, newType: newType });
                }

                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                const btn = this._hardButtons?.querySelector('.change-type-btn');
                if (btn) btn.classList.remove('active');
            });

            document.body.appendChild(dropdown);

            const closeHandler = (e) => {
                if (dropdown.style.display !== 'block') return;
                const btn = this._hardButtons?.querySelector('.change-type-btn');
                if (btn && btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                if (btn) btn.classList.remove('active');
            };
            document.addEventListener('click', closeHandler);
            this._closeHandlers.push(() => document.removeEventListener('click', closeHandler));

            const repositionHandler = () => {
                if (dropdown.style.display !== 'block') return;
                const btn = this._hardButtons?.querySelector('.change-type-btn');
                if (btn) this._positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);
            this._closeHandlers.push(() => {
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
            });

            this._closeHandlers.push(() => {
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            });

            return dropdown;
        }

        // ============================================================
        // 13. LAYOUT BUTTON
        // ============================================================

        _createLayoutButton() {
            const wrapper = document.createElement('div');
            wrapper.className = 'window-actions layout-wrapper';
            Object.assign(wrapper.style, {
                position: 'relative',
                display: 'flex',
                flexShrink: '0'
            });

            const btn = document.createElement('button');
            btn.className = 'layout-toggle-btn';
            btn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-layout"></use>
                </svg>
            `;
            btn.title = 'Change Layout';
            btn.setAttribute('type', 'button');

            Object.assign(btn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                minWidth: '22px',
                height: '22px',
                padding: '0',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40, 40, 40, 0.4))',
                color: 'var(--text-secondary, #a09888)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                flexShrink: '0',
                boxSizing: 'border-box'
            });

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            const dropdown = this._createLayoutDropdown();
            wrapper.appendChild(btn);
            wrapper.appendChild(dropdown);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.layout-dropdown').forEach(el => {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                const isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    dropdown.style.display = 'none';
                    dropdown.style.opacity = '0';
                    btn.classList.remove('active');
                } else {
                    if (typeof dropdown._renderItems === 'function') dropdown._renderItems();
                    dropdown.style.display = 'block';
                    dropdown.style.opacity = '0';
                    this._positionDropdown(dropdown, btn);
                    requestAnimationFrame(() => {
                        dropdown.style.opacity = '1';
                        dropdown.style.transform = 'translateY(0) scale(1)';
                    });
                    btn.classList.add('active');
                }
            });

            return wrapper;
        }

        _createLayoutDropdown() {
            const dropdown = document.createElement('div');
            dropdown.className = 'window-dropdown layout-dropdown';
            dropdown.dataset.windowId = this.id;
            dropdown.style.cssText = `
                position: fixed;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: var(--radius, 6px);
                padding: 4px 0;
                min-width: 100px;
                max-width: 280px;
                width: max-content;
                z-index: 999999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                display: none;
                opacity: 0;
                transform: translateY(-8px) scale(0.98);
                transition: opacity 0.15s ease, transform 0.15s ease;
                max-height: 400px;
                overflow-y: auto;
            `;

            const renderItems = () => {
                const styles = this._layoutManager ? this._layoutManager.getAvailableStyles() : [];
                const currentStyle = this._layoutManager ? this._layoutManager.getCurrentStyle() : null;

                if (styles.length === 0) {
                    dropdown.innerHTML = `
                        <div style="padding:8px 14px;color:var(--text-muted, rgba(200,184,154,0.35));font-size:12px;text-align:center;">
                            No layouts available
                        </div>
                    `;
                    return;
                }

                let html = `
                    <div style="padding:6px 14px 4px 14px;font-size:10px;font-weight:600;color:var(--text-muted, rgba(200,184,154,0.35));text-transform:uppercase;letter-spacing:0.5px;">
                        Layout Style
                    </div>
                    <hr style="border:none;border-top:1px solid var(--border-color, rgba(200,184,154,0.12));margin:4px 8px;opacity:0.3;">
                `;

                for (const style of styles) {
                    const isActive = style.id === currentStyle;
                    html += `
                        <button class="dropdown-item${isActive ? ' active' : ''}"
                                data-style-id="${escapeAttr(style.id)}"
                                style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 14px;border:none;background:${isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent'};color:${isActive ? 'var(--beige, #e0d8cc)' : 'var(--text-primary, #e0d8cc)'};font-size:12px;cursor:pointer;text-align:left;transition:background 0.15s ease;font-family:inherit;border-radius:0;border-left:2px solid ${isActive ? 'var(--accent-red, #cc2233)' : 'transparent'};">
                            <span style="font-size:16px;">${escapeHtml(style.icon || '⊞')}</span>
                            <span style="flex:1;">${escapeHtml(style.label)}</span>
                            ${isActive ? '<span style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>' : ''}
                        </button>
                    `;
                }

                dropdown.innerHTML = html;
            };

            renderItems();
            dropdown._renderItems = renderItems;

            dropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (!item) return;

                e.stopPropagation();
                e.preventDefault();

                const styleId = item.dataset.styleId;
                if (styleId) {
                    this._emit('layout-change', { windowId: this.id, styleId: styleId });
                }

                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                const btn = dropdown.parentElement?.querySelector('.layout-toggle-btn');
                if (btn) btn.classList.remove('active');
            });

            document.body.appendChild(dropdown);

            const closeHandler = (e) => {
                if (dropdown.style.display !== 'block') return;
                const btn = dropdown.parentElement?.querySelector('.layout-toggle-btn');
                if (btn && btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                if (btn) btn.classList.remove('active');
            };
            document.addEventListener('click', closeHandler);
            this._closeHandlers.push(() => document.removeEventListener('click', closeHandler));

            this._closeHandlers.push(() => {
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            });

            return dropdown;
        }

        // ============================================================
        // 14. POSITION DROPDOWN
        // ============================================================

        _positionDropdown(dropdown, btn) {
            if (!dropdown || !btn) return;

            const btnRect = btn.getBoundingClientRect();
            const ddWidth = dropdown.offsetWidth || 200;
            const ddHeight = dropdown.offsetHeight || 200;

            let left = Math.round(btnRect.right - ddWidth);
            let top = Math.round(btnRect.bottom + 4);

            if (left < 4) left = 4;
            if (left + ddWidth > window.innerWidth - 4) {
                left = window.innerWidth - ddWidth - 4;
            }
            if (top + ddHeight > window.innerHeight - 4) {
                top = Math.round(btnRect.top - ddHeight - 4);
                if (top < 4) top = 4;
            }

            dropdown.style.left = left + 'px';
            dropdown.style.top = top + 'px';
        }

        // ============================================================
        // 15. DRAG & DROP (swap)
        // ============================================================

        _setupDragAndDrop() {
            if (!this._headerLeft) return;

            let dragData = null;

            this._headerLeft.addEventListener('mousedown', (e) => {
                if (this._windowCount <= 1) return;
                if (e.target.closest('button')) return;

                const rect = this._headerLeft.getBoundingClientRect();

                dragData = {
                    windowId: this.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    offsetX: e.clientX - rect.left,
                    offsetY: e.clientY - rect.top,
                    isDragging: false,
                    ghost: null,
                    targetId: null
                };

                this._headerLeft.style.cursor = 'grabbing';
                this._header.style.opacity = '0.85';

                const onMouseMove = (ev) => {
                    const dx = ev.clientX - dragData.startX;
                    const dy = ev.clientY - dragData.startY;

                    if (!dragData.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        dragData.isDragging = true;
                        this._startDrag(dragData);
                    }

                    if (dragData.isDragging && dragData.ghost) {
                        dragData.ghost.style.left = (ev.clientX - dragData.offsetX) + 'px';
                        dragData.ghost.style.top = (ev.clientY - dragData.offsetY) + 'px';

                        const target = this._findWindowAtPoint(ev.clientX, ev.clientY);
                        dragData.targetId = target;
                        this._highlightTarget(target);
                    }
                };

                const onMouseUp = () => {
                    if (dragData.isDragging && dragData.targetId) {
                        this._emit('swap', { windowId: this.id, targetId: dragData.targetId });
                    }
                    this._endDrag(dragData);
                    this._headerLeft.style.cursor = '';
                    this._header.style.opacity = '1';

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    dragData = null;
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        _startDrag(dragData) {
            const ghost = document.createElement('div');
            ghost.className = 'window-ghost';
            Object.assign(ghost.style, {
                position: 'fixed',
                pointerEvents: 'none',
                zIndex: '99999',
                opacity: '0.92',
                background: 'var(--bg-panel, #1a1a1a)',
                border: '2px solid var(--accent-red, #cc2233)',
                borderRadius: 'var(--radius, 6px)',
                boxShadow: '0 20px 80px rgba(0,0,0,0.6)',
                padding: '10px 20px',
                fontSize: '13px',
                color: 'var(--text-primary, #e0d8cc)',
                width: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(12px)'
            });

            let iconHtml;
            if (this._icon && typeof this._icon === 'string' && this._icon.startsWith('icon-')) {
                iconHtml = `<svg class="icon-svg" style="width:18px;height:18px;fill:currentColor;display:block;flex-shrink:0;">
                    <use href="#${escapeAttr(this._icon)}"></use>
                </svg>`;
            } else {
                iconHtml = `<span style="font-size:18px;flex-shrink:0;">${escapeHtml(this._icon || '📄')}</span>`;
            }

            ghost.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    ${iconHtml}
                    <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(this._title)}</span>
                </div>
            `;

            ghost.style.left = (dragData.startX - dragData.offsetX) + 'px';
            ghost.style.top = (dragData.startY - dragData.offsetY) + 'px';

            document.body.appendChild(ghost);
            dragData.ghost = ghost;

            this._showDragHint('📌 Drop on any window to swap positions');
        }

        _endDrag(dragData) {
            if (dragData.ghost && dragData.ghost.parentNode) {
                dragData.ghost.remove();
            }

            document.querySelectorAll('.window-container.drag-target').forEach(el => {
                el.classList.remove('drag-target');
                el.style.borderColor = '';
                el.style.boxShadow = '';
                el.style.transform = '';
                el.style.backgroundColor = '';
            });

            const hint = document.querySelector('.drag-hint');
            if (hint) hint.remove();
        }

        _findWindowAtPoint(x, y) {
            const padding = 30;
            const myId = String(this.id);

            if (this._layoutManager && typeof this._layoutManager.getWindows === 'function') {
                const windows = this._layoutManager.getVisibleWindows
                    ? this._layoutManager.getVisibleWindows()
                    : this._layoutManager.getWindows();

                for (const w of windows) {
                    if (String(w.id) === myId) continue;
                    const node = this._layoutManager._domMap?.get(w.nodeId);
                    if (!node) continue;
                    const rect = node.getBoundingClientRect();
                    if (x >= rect.left - padding && x <= rect.right + padding &&
                        y >= rect.top - padding && y <= rect.bottom + padding) {
                        return w.id;
                    }
                }
                return null;
            }

            const containers = document.querySelectorAll('.window-container');
            for (const el of containers) {
                const rect = el.getBoundingClientRect();
                const windowId = el.dataset.windowId;
                if (windowId === myId) continue;
                if (x >= rect.left - padding && x <= rect.right + padding &&
                    y >= rect.top - padding && y <= rect.bottom + padding) {
                    return windowId;
                }
            }
            return null;
        }

        _highlightTarget(targetId) {
            document.querySelectorAll('.window-container.drag-target').forEach(el => {
                el.classList.remove('drag-target');
                el.style.borderColor = '';
                el.style.boxShadow = '';
                el.style.transform = '';
                el.style.backgroundColor = '';
            });

            if (!targetId) return;

            let el = null;
            if (this._layoutManager && typeof this._layoutManager.getWindows === 'function') {
                const windows = this._layoutManager.getVisibleWindows
                    ? this._layoutManager.getVisibleWindows()
                    : this._layoutManager.getWindows();
                const w = windows.find(win => String(win.id) === String(targetId));
                if (w) el = this._layoutManager._domMap?.get(w.nodeId) || null;
            }
            if (!el) el = document.querySelector(`.window-container[data-window-id="${targetId}"]`);

            if (el) {
                el.classList.add('drag-target');
                el.style.borderColor = 'var(--accent-red, #cc2233)';
                el.style.boxShadow = 'inset 0 0 40px rgba(204, 34, 51, 0.15), 0 0 30px rgba(204, 34, 51, 0.05)';
                el.style.backgroundColor = 'rgba(204, 34, 51, 0.03)';
            }
        }

        _showDragHint(text) {
            const existing = document.querySelector('.drag-hint');
            if (existing) existing.remove();

            const hint = document.createElement('div');
            hint.className = 'drag-hint';
            Object.assign(hint.style, {
                position: 'fixed',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.85)',
                color: 'var(--text-primary, #e0d8cc)',
                padding: '10px 24px',
                borderRadius: 'var(--radius, 6px)',
                fontSize: '13px',
                zIndex: '99999',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                pointerEvents: 'none',
                opacity: '0.95',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                fontWeight: '500'
            });
            hint.textContent = text;
            document.body.appendChild(hint);
        }

        // ============================================================
        // 16. CONTEXT MENU
        // ============================================================

        _setupContextMenu() {
            if (!this._root) return;
            this._root.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showContextMenu(e);
            });
        }

        _showContextMenu(e) {
            const existing = document.querySelector('.window-context-menu');
            if (existing) existing.remove();

            const menu = document.createElement('div');
            menu.className = 'window-context-menu';

            const menuW = 200;
            const menuH = 200;
            const left = Math.max(4, Math.min(e.clientX, window.innerWidth - menuW - 4));
            const top = Math.max(4, Math.min(e.clientY, window.innerHeight - menuH - 4));

            Object.assign(menu.style, {
                position: 'fixed',
                background: 'var(--bg-panel, #1a1a1a)',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: 'var(--radius, 6px)',
                padding: '4px 0',
                minWidth: menuW + 'px',
                maxWidth: '280px',
                zIndex: '99999',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                left: left + 'px',
                top: top + 'px',
                backdropFilter: 'blur(12px)',
                overflow: 'hidden'
            });

            const customItems = Array.isArray(this._contextMenuConfig) ? this._contextMenuConfig : [];
            const allItems = [];

            if (customItems.length > 0) {
                for (const item of customItems) allItems.push(item);
                allItems.push({ divider: true });
            }

            allItems.push({
                label: this._isFullscreen ? '⇲ Выйти из полного экрана' : '⛶ На весь экран',
                action: this._isFullscreen ? 'fullscreen-exit' : 'fullscreen'
            });
            allItems.push({ label: '─ Свернуть', action: 'minimize' });
            allItems.push({ divider: true });

            if (this._windowCount > 1) {
                allItems.push({ label: '⇄ Swap Position', action: 'swap' });
                allItems.push({ divider: true });
            }

            allItems.push({ label: '✕ Close', action: 'close', danger: true });

            for (const item of allItems) {
                if (item.divider) {
                    const divider = document.createElement('hr');
                    divider.style.cssText = `
                        border: none;
                        border-top: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                        margin: 4px 12px;
                        opacity: 0.3;
                    `;
                    menu.appendChild(divider);
                    continue;
                }

                const btn = document.createElement('button');
                const isDanger = item.danger || false;
                const isDisabled = item.disabled || false;

                Object.assign(btn.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 14px',
                    border: 'none',
                    background: 'transparent',
                    color: isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-primary, #e0d8cc)',
                    fontSize: '12px',
                    cursor: isDisabled ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                    opacity: isDisabled ? '0.4' : '1',
                    fontFamily: 'inherit',
                    minHeight: '28px'
                });

                if (item.icon) {
                    const iconSpan = document.createElement('span');
                    iconSpan.style.cssText = `
                        font-size: 14px; flex-shrink: 0; width: 18px; height: 18px;
                        display: inline-flex; align-items: center; justify-content: center;
                    `;

                    if (typeof item.icon === 'string' && item.icon.startsWith('icon-')) {
                        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        svg.setAttribute('class', 'icon-svg');
                        svg.style.cssText = `width:14px;height:14px;fill:currentColor;display:block;`;
                        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                        use.setAttribute('href', `#${escapeAttr(item.icon)}`);
                        svg.appendChild(use);
                        iconSpan.appendChild(svg);
                    } else {
                        iconSpan.textContent = item.icon;
                    }
                    btn.appendChild(iconSpan);
                }

                const labelSpan = document.createElement('span');
                labelSpan.style.cssText = 'flex:1;';
                labelSpan.textContent = item.label;
                btn.appendChild(labelSpan);

                if (item.shortcut) {
                    const shortcutSpan = document.createElement('span');
                    shortcutSpan.style.cssText = 'color:var(--text-muted, rgba(200,184,154,0.35));font-size:9px;flex-shrink:0;';
                    shortcutSpan.textContent = item.shortcut;
                    btn.appendChild(shortcutSpan);
                }

                if (!isDisabled) {
                    btn.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                    });
                    btn.addEventListener('mouseleave', function() {
                        this.style.background = 'transparent';
                    });
                }

                btn.addEventListener('click', (ev) => {
                    if (isDisabled) return;

                    if (item.action === 'close') {
                        this._emit('close', { windowId: this.id });
                    } else if (item.action === 'swap') {
                        this._showSwapMenu(ev);
                    } else if (item.action === 'minimize') {
                        this._emit('minimize', { windowId: this.id });
                    } else if (item.action === 'fullscreen') {
                        this._emit('fullscreen', { windowId: this.id });
                    } else if (item.action === 'fullscreen-exit') {
                        this._emit('fullscreen-exit', { windowId: this.id });
                    } else if (item.callback && typeof item.callback === 'function') {
                        try { item.callback(this._baseWindow); } catch (error) {}
                    } else {
                        this._emit('menu-action', {
                            windowId: this.id,
                            action: item.action || '',
                            value: item.value || '',
                            item: item
                        });
                    }
                    menu.remove();
                });

                menu.appendChild(btn);
            }

            document.body.appendChild(menu);

            const closeMenu = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 10);
        }

        _showSwapMenu(e) {
            const existing = document.querySelector('.swap-menu');
            if (existing) existing.remove();

            const windows = this._layoutManager
                ? (this._layoutManager.getVisibleWindows?.() || this._layoutManager.getWindows())
                : [];

            const otherWindows = windows.filter(w => String(w.id) !== String(this.id));
            if (otherWindows.length === 0) return;

            const menu = document.createElement('div');
            menu.className = 'swap-menu';

            const menuW = 200;
            const menuH = 200;
            const left = Math.max(4, Math.min(e.clientX, window.innerWidth - menuW - 4));
            const top = Math.max(4, Math.min(e.clientY, window.innerHeight - menuH - 4));

            Object.assign(menu.style, {
                position: 'fixed',
                background: 'var(--bg-panel, #1a1a1a)',
                border: '1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                borderRadius: 'var(--radius, 6px)',
                padding: '4px 0',
                minWidth: menuW + 'px',
                maxWidth: '280px',
                zIndex: '99999',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                left: left + 'px',
                top: top + 'px',
                backdropFilter: 'blur(12px)',
                overflow: 'hidden'
            });

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 6px 14px 8px 14px; font-size: 10px; font-weight: 600;
                color: var(--text-muted, rgba(200,184,154,0.35));
                text-transform: uppercase; letter-spacing: 0.5px;
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.12));
            `;
            header.textContent = 'Swap with:';
            menu.appendChild(header);

            for (const w of otherWindows) {
                const btn = document.createElement('button');
                Object.assign(btn.style, {
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '6px 14px', border: 'none',
                    background: 'transparent', color: 'var(--text-primary, #e0d8cc)',
                    fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit'
                });

                const iconHtml = w.icon && typeof w.icon === 'string' && w.icon.startsWith('icon-')
                    ? `<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;">
                        <use href="#${escapeAttr(w.icon)}"></use>
                       </svg>`
                    : `<span style="font-size:14px;flex-shrink:0;">${escapeHtml(w.icon || '📄')}</span>`;

                btn.innerHTML = `
                    ${iconHtml}
                    <span style="flex:1;font-weight:500;">${escapeHtml(w.title)}</span>
                    <span style="color:var(--text-muted, rgba(200,184,154,0.35));font-size:9px;">#${escapeHtml(String(w.id))}</span>
                `;

                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'transparent';
                });

                btn.addEventListener('click', () => {
                    this._emit('swap', { windowId: this.id, targetId: w.id });
                    menu.remove();
                });

                menu.appendChild(btn);
            }

            document.body.appendChild(menu);

            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 10);
        }

        // ============================================================
        // 17. CONTENT
        // ============================================================

        _buildContent() {
            this._content = document.createElement('div');
            this._content.className = 'window-content';
            this._content.id = `window-content-${this.id}`;

            Object.assign(this._content.style, {
                flex: '1 1 auto',
                overflow: 'hidden',
                padding: '0',
                margin: '0',
                background: 'var(--bg-dark, #0d0d0d)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '0',
                minWidth: '0',
                width: '100%'
            });

            this._root.appendChild(this._content);
            this._renderPlaceholder();
        }

        _renderPlaceholder() {
            this._content.innerHTML = '';

            const placeholder = document.createElement('div');
            Object.assign(placeholder.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                color: 'var(--text-muted, rgba(200, 184, 154, 0.35))',
                fontSize: '14px',
                flexDirection: 'column',
                gap: '8px'
            });

            const iconHtml = this._icon && typeof this._icon === 'string' && this._icon.startsWith('icon-')
                ? `<svg class="icon-svg" style="width:48px;height:48px;fill:currentColor;opacity:0.3;">
                    <use href="#${escapeAttr(this._icon)}"></use>
                   </svg>`
                : `<div style="font-size:48px;opacity:0.3;">${escapeHtml(this._icon || '📄')}</div>`;

            placeholder.innerHTML = `
                ${iconHtml}
                <div style="color:var(--text-secondary, rgba(200,184,154,0.7));">${escapeHtml(this._title)}</div>
                <div style="font-size:11px;opacity:0.5;color:var(--text-muted, rgba(200,184,154,0.35));">Ready</div>
            `;

            this._content.appendChild(placeholder);
        }

        setContent(contentElement) {
            if (!this._content) return;

            if (this._content.__lsResizeObserver) {
                try { this._content.__lsResizeObserver.disconnect(); } catch (e) {}
                this._content.__lsResizeObserver = null;
            }

            this._content.innerHTML = '';

            if (contentElement) {
                contentElement.style.position = 'absolute';
                contentElement.style.top = '0';
                contentElement.style.left = '0';
                contentElement.style.width = '100%';
                contentElement.style.height = '100%';
                contentElement.style.boxSizing = 'border-box';
                contentElement.style.overflow = 'hidden';

                this._content.appendChild(contentElement);

                const contentW = this._content.clientWidth;
                const contentH = this._content.clientHeight;
                if (contentW > 0 && contentH > 0) {
                    contentElement.style.width = contentW + 'px';
                    contentElement.style.height = contentH + 'px';
                }

                const bw = this._baseWindow;
                const realInstance = bw?.getRealInstance?.();

                if (typeof ResizeObserver !== 'undefined' && realInstance
                    && typeof realInstance.resize === 'function') {
                    let raf = null;
                    const observer = new ResizeObserver(() => {
                        if (raf) cancelAnimationFrame(raf);
                        raf = requestAnimationFrame(() => {
                            raf = null;
                            const w = this._content.clientWidth;
                            const h = this._content.clientHeight;
                            if (w > 0 && h > 0) {
                                contentElement.style.width = w + 'px';
                                contentElement.style.height = h + 'px';
                            }
                            try { realInstance.resize(); } catch (e) {}
                        });
                    });
                    observer.observe(this._content);
                    this._content.__lsResizeObserver = observer;
                }
            } else {
                this._renderPlaceholder();
            }
        }

        // ============================================================
        // 18. АДАПТАЦИЯ ШАПКИ
        // ============================================================

        _setupHeaderAdaptive() {
            if (typeof ResizeObserver === 'undefined') return;

            this._headerSizeObserver = new ResizeObserver(() => {
                this._scheduleHeaderAdaptive();
            });
            if (this._header) this._headerSizeObserver.observe(this._header);
        }

        _scheduleHeaderAdaptive() {
            if (this._headerRAF) {
                cancelAnimationFrame(this._headerRAF);
                this._headerRAF = null;
            }
            this._headerRAF = requestAnimationFrame(() => {
                this._headerRAF = null;
                this._updateHeaderAdaptive();
            });
        }

        _measureBaseWidths() {
            if (!this._header || !this._customButtons) return;

            if (this._measuredVersion === this._buttonsVersion && this._customFullW > 0) {
                return;
            }

            const prevGapActive = this._header.style.getPropertyValue('--rw-btn-gap-active');
            const prevBtnPadX = this._header.style.getPropertyValue('--rw-btn-pad-x');
            const prevLabelOp = this._header.style.getPropertyValue('--rw-label-opacity');
            const prevLabelMax = this._header.style.getPropertyValue('--rw-label-maxw');

            const prevMaxWidth = this._customButtons.style.maxWidth;
            const prevMinWidth = this._customButtons.style.minWidth;
            this._customButtons.style.maxWidth = 'none';
            this._customButtons.style.minWidth = '0';

            this._header.style.setProperty('--rw-btn-gap-active', '4px');
            this._header.style.setProperty('--rw-btn-pad-x', '8px');
            this._header.style.setProperty('--rw-label-opacity', '1');
            this._header.style.setProperty('--rw-label-maxw', '80px');

            void this._customButtons.offsetWidth;

            const customStyle = getComputedStyle(this._customButtons);
            const customGap = parseFloat(customStyle.gap) || 0;

            let fullW = 0;
            let visible = 0;
            const children = Array.from(this._customButtons.children);
            for (const el of children) {
                if (el.style.display === 'none') continue;
                const r = el.getBoundingClientRect();
                if (r.width === 0) continue;
                visible++;
                fullW += r.width;
            }
            fullW += customGap * Math.max(0, visible - 1);
            this._customFullW = Math.ceil(fullW);

            const btnHBase = 22;
            this._customMinW = visible > 0
                ? visible * btnHBase + Math.max(0, visible - 1) * customGap
                : 0;
            this._customMinW = Math.ceil(this._customMinW);

            if (prevGapActive) this._header.style.setProperty('--rw-btn-gap-active', prevGapActive);
            if (prevBtnPadX) this._header.style.setProperty('--rw-btn-pad-x', prevBtnPadX);
            if (prevLabelOp) this._header.style.setProperty('--rw-label-opacity', prevLabelOp);
            if (prevLabelMax) this._header.style.setProperty('--rw-label-maxw', prevLabelMax);

            this._customButtons.style.maxWidth = prevMaxWidth || '';
            this._customButtons.style.minWidth = prevMinWidth || '';

            void this._customButtons.offsetWidth;

            this._measuredVersion = this._buttonsVersion;
        }

        _updateHeaderAdaptive() {
            if (!this._header || !this._isReady || this._isDestroyed) return;

            const headerW = this._header.clientWidth || 0;
            if (headerW === 0) return;

            const padX = 6;
            const gap = 6;

            const iconW = 16;
            const rightGap = 4;

            const SAFETY_GAP = 16;
            const EARLY_SHRINK = 24;

            this._hardButtons.style.flex = '0 0 auto';
            this._hardButtons.style.flexShrink = '0';
            this._hardButtons.style.flexGrow = '0';
            this._hardButtons.style.minWidth = 'max-content';

            const hardW = this._hardButtons.offsetWidth || 0;

            const rawAvailable = headerW
                - padX * 2
                - iconW
                - gap * 2
                - rightGap
                - hardW
                - SAFETY_GAP;

            const availableForCustom = Math.max(0, rawAvailable - EARLY_SHRINK);

            const customFullW = this._customFullW || 0;
            const customMinW = this._customMinW || 0;

            let ratio;
            if (customFullW <= customMinW) {
                ratio = availableForCustom >= customFullW ? 1 : 0;
            } else {
                const range = customFullW - customMinW;
                ratio = (availableForCustom - customMinW) / range;
                ratio = Math.max(0, Math.min(1, ratio));
            }

            const GAMMA = 2.2;
            const k = Math.pow(ratio, GAMMA);

            const padXLerp = Math.round(4 + (8 - 4) * k);
            const gapActiveLerp = Math.round(0 + (4 - 0) * k);
            const labelOpacity = ratio === 0 ? 0 : Math.max(0, Math.min(1, ratio * 1.6));
            const labelMaxW = Math.round(80 * Math.min(1, ratio * 1.6));

            this._header.style.setProperty('--rw-btn-pad-x', padXLerp + 'px');
            this._header.style.setProperty('--rw-btn-gap-active', gapActiveLerp + 'px');
            this._header.style.setProperty('--rw-label-opacity', labelOpacity.toFixed(3));
            this._header.style.setProperty('--rw-label-maxw', labelMaxW + 'px');

            if (availableForCustom <= 0) {
                this._customButtons.style.maxWidth = '0px';
                this._customButtons.style.minWidth = '0px';
                this._customButtons.style.overflow = 'hidden';
                this._customButtons.style.opacity = '0';
                this._customButtons.style.pointerEvents = 'none';
            } else {
                this._customButtons.style.maxWidth = Math.floor(availableForCustom) + 'px';
                this._customButtons.style.minWidth = '0px';
                this._customButtons.style.overflow = 'hidden';
                this._customButtons.style.opacity = '1';
                this._customButtons.style.pointerEvents = '';
            }

            this._headerIcon.style.width = iconW + 'px';
            this._headerIcon.style.height = iconW + 'px';
            this._headerIcon.style.minWidth = iconW + 'px';
            this._headerIcon.style.maxWidth = iconW + 'px';
        }

        // ============================================================
        // 19. RESIZE
        // ============================================================

        _setupResizeObserver() {
            if (typeof ResizeObserver === 'undefined') return;

            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }

            this._resizeObserver = new ResizeObserver(() => {
                this._scheduleResize();
            });

            if (this._root) this._resizeObserver.observe(this._root);
            if (this.container) this._resizeObserver.observe(this.container);
        }

        _scheduleResize() {
            if (!this._isReady || this._isDestroyed) return;

            if (this._resizeRAF) {
                cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = null;
            }

            this._resizeRAF = requestAnimationFrame(() => {
                this._resizeRAF = null;

                if (this._resizeTimeout) {
                    cancelAnimationFrame(this._resizeTimeout);
                    this._resizeTimeout = null;
                }

                this._resizeTimeout = requestAnimationFrame(() => {
                    this._resizeTimeout = null;
                    this._performResize();
                });
            });
        }

        _performResize() {
            if (!this._isReady || this._isDestroyed) return;

            let width = 0;
            let height = 0;

            if (this._root) {
                width = this._root.clientWidth || 0;
                height = this._root.clientHeight || 0;
            }

            if (width === 0 || height === 0) {
                this._zeroResizeAttempts++;
                if (this._zeroResizeAttempts > this._maxZeroResizeAttempts) {
                    this._zeroResizeAttempts = 0;
                    return;
                }
                this._scheduleResize();
                return;
            }

            this._zeroResizeAttempts = 0;

            const dpr = window.devicePixelRatio || 1;

            if (this._lastSize.width === width
                && this._lastSize.height === height
                && this._lastSize.dpr === dpr) {
                this._scheduleHeaderAdaptive();
                return;
            }

            this._lastSize = { width, height, dpr };

            this._scheduleHeaderAdaptive();

            this._emit('resize', {
                windowId: this.id,
                width: width,
                height: height
            });
        }

        resize() {
            this._scheduleResize();
        }

        // ============================================================
        // 20. ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================

        setTitle(title) {
            this._title = title || 'Window';
            if (this._titleElement) {
                this._titleElement.textContent = this._title;
                this._titleElement.title = this._title;
            }
            this._scheduleHeaderAdaptive();
            return this;
        }

        setIcon(icon) {
            this._icon = icon || '📄';
            this._updateIcon();
            return this;
        }

        refresh() {
            if (this._isDestroyed) return;
            this._rebuildHeaderButtons();
            this._scheduleHeaderAdaptive();
            this._scheduleResize();
            return this;
        }

        updateTypeConfig({ headerButtons, contextMenu, dropdownMenu, type, title, icon }) {
            if (type) {
                this.type = type;
                this._typeConfig = this._registry ? this._registry.getType(type) : null;
            }
            if (title) this.setTitle(title);
            if (icon) this.setIcon(icon);

            if (headerButtons !== undefined) {
                this._headerButtonsConfig = Array.isArray(headerButtons) ? headerButtons : [];
            }
            if (contextMenu !== undefined) {
                this._contextMenuConfig = Array.isArray(contextMenu) ? contextMenu : [];
            }
            if (dropdownMenu !== undefined) {
                this._dropdownMenuConfig = dropdownMenu;
                if (this._dropdownWrapper && this._dropdownWrapper.parentNode) {
                    this._dropdownWrapper.parentNode.removeChild(this._dropdownWrapper);
                }
                this._dropdownWrapper = null;
            }

            this._rebuildHeaderButtons();

            if (this._root) {
                this._root.dataset.windowType = this.type;
            }
        }

        updateWindowCount() {
            const count = this._layoutManager ? this._layoutManager.getWindowCount() : 1;
            if (count !== this._windowCount) {
                this._windowCount = count;
                this._rebuildHeaderButtons();
            }
        }

        _purgeOrphanDropdowns() {
            if (typeof document === 'undefined') return;
            document.querySelectorAll(
                '.data-dropdown, .menu-dropdown, .change-type-dropdown, .layout-dropdown, .data-submenu'
            ).forEach(el => {
                if (el.dataset.windowId === this.id && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        }

        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            this._isReady = false;

            if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
            if (this._headerSizeObserver) { this._headerSizeObserver.disconnect(); this._headerSizeObserver = null; }

            if (this._resizeTimeout) { cancelAnimationFrame(this._resizeTimeout); this._resizeTimeout = null; }
            if (this._resizeRAF) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
            if (this._headerRAF) { cancelAnimationFrame(this._headerRAF); this._headerRAF = null; }

            for (const handler of this._closeHandlers) {
                try { handler(); } catch (e) {}
            }
            this._closeHandlers = [];

            this._purgeOrphanDropdowns();

            if (this.container) this.container.innerHTML = '';

            this._listeners = {};
        }

        // ============================================================
        // 21. GETTERS
        // ============================================================

        getRoot() { return this._root; }
        getContent() { return this._content; }
        getHeader() { return this._header; }
        getId() { return this.id; }
        getType() { return this.type; }
        getTitle() { return this._title; }
        getIcon() { return this._icon; }
        isReady() { return this._isReady; }
        isDestroyed() { return this._isDestroyed; }
        isFullscreen() { return this._isFullscreen; }
    }

    // ============================================================
    // 22. ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RenderWindow };
    }

    if (typeof window !== 'undefined') {
        window.RenderWindow = RenderWindow;
        console.log('[RenderWindow] Registered globally v6.2.1');
    }

})();