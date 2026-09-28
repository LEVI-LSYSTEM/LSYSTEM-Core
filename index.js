(function() {
    'use strict';

    const HEADER_COLLAPSE_KEY = 'lsystem-header-collapsed';

    // ============================================================
    // КОНСТАНТЫ АДАПТИВА ШАПКИ
    // ============================================================

    // Ширина viewport (в px), при которой кнопки шапки
    // переходят в компактный (иконочный) режим.
    const HEADER_COMPACT_BREAKPOINT = 900;

    // Ширина viewport (в px), при которой скрываются названия в логотипе.
    const HEADER_COMPACT_BREAKPOINT_NAME = 500;

    // Гистерезис, чтобы не дёргалось на границе.
    const HEADER_COMPACT_HYSTERESIS = 4;

    const state = {
        projectPath: null,
        projectName: 'Untitled',
        isModified: false,
        isLoading: false,
        isSaving: false,
        isReady: false,
        lastWindowCount: -1,
        windowSearchQuery: ''
    };

    const el = {};

    function cacheElements() {
        el.workspace = document.getElementById('workspace');
        el.header = document.getElementById('appHeader');
        el.mainMenu = document.querySelector('.main-menu');

        el.newProjectBtn = document.getElementById('newProjectBtn');
        el.saveBtn = document.getElementById('saveBtn');
        el.saveBtnLabel = document.getElementById('saveBtnLabel');
        el.loadBtn = document.getElementById('loadBtn');
        el.loadDropdown = document.getElementById('loadDropdown');
        el.loadMenu = document.getElementById('loadMenu');
        el.recentList = document.getElementById('recentProjectsList');
        el.loadFromFileBtn = document.getElementById('loadFromFileBtn');
        el.newWindowBtn = document.getElementById('newWindowBtn');
        el.newWindowDropdown = document.getElementById('newWindowDropdown');
        el.windowTypeMenu = document.getElementById('windowTypeMenu');
        el.settingsBtn = document.getElementById('settingsBtn');
        el.logo = document.querySelector('.logo');
        el.projectNameDisplay = document.getElementById('projectNameDisplay');

        el.historyDropdown = document.getElementById('historyDropdown');
        el.historyBtn = document.getElementById('historyBtn');
        el.historyMenu = document.getElementById('historyMenu');
    }

    // ============================================================
    // SVG-ИКОНКИ
    // ============================================================

    const SVG_NS = 'http://www.w3.org/2000/svg';

    function makeSvgIcon(iconId, size, color) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'icon-svg');
        svg.style.cssText = [
            'width:' + size + 'px',
            'height:' + size + 'px',
            'flex-shrink:0',
            'fill:' + (color || 'currentColor'),
            'display:block',
            'margin:0'
        ].join(';');

        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', '#' + iconId);
        svg.appendChild(use);
        return svg;
    }

    function makeSvgIconString(iconId, size, className) {
        const s = size || 14;
        const cls = 'icon-svg' + (className ? ' ' + className : '');
        return '<svg class="' + cls + '" style="width:' + s + 'px;height:' + s +
            'px;flex-shrink:0;display:block;margin:0;fill:currentColor;">' +
            '<use href="#' + iconId + '"></use></svg>';
    }

    function isSvgIcon(value) {
        return typeof value === 'string' && value.indexOf('icon-') === 0;
    }

    function resolveIconName(icon, fallback) {
        if (typeof icon === 'string' && icon.startsWith('icon-')) return icon;
        return fallback || 'icon-data';
    }

    // ============================================================
    // HTML-УТИЛИТЫ
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

    function cssEscape(s) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(s);
        }
        return String(s).replace(/([^\w-])/g, '\\$1');
    }

    // ============================================================
    // МОДАЛКИ
    // ============================================================

    function createModal({
        icon = 'icon-warning',
        title = 'Внимание',
        message = '',
        type = 'warning',
        buttons = [],
        onClose = null,
        input = null
    }) {
        const old = document.querySelector('.modal-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '99999',
            animation: 'fadeIn 0.25s ease',
            padding: '20px'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'var(--bg-panel, #1a1a1a)',
            borderRadius: '16px',
            padding: '32px 36px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(204,34,51,0.08)',
            border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
            animation: 'modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative'
        });

        let iconColor = 'var(--beige, #c8b89a)';
        if (type === 'error') iconColor = 'var(--accent-red, #cc2233)';
        else if (type === 'warning') iconColor = 'var(--warning-color, #ffaa33)';
        else if (type === 'success') iconColor = 'var(--success-color, #44cc88)';

        const iconEl = document.createElement('div');
        Object.assign(iconEl.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
            lineHeight: '1',
            color: iconColor
        });

        iconEl.appendChild(makeSvgIcon(resolveIconName(icon, 'icon-warning'), 42));

        const titleEl = document.createElement('div');
        Object.assign(titleEl.style, {
            fontSize: '18px',
            fontWeight: '700',
            color: 'var(--text-primary, #e0d8cc)',
            textAlign: 'center',
            marginBottom: '8px',
            letterSpacing: '0.3px'
        });
        titleEl.textContent = title;

        const msgEl = document.createElement('div');
        Object.assign(msgEl.style, {
            fontSize: '13px',
            color: 'var(--text-secondary, #a09888)',
            textAlign: 'center',
            lineHeight: '1.7',
            marginBottom: '16px',
            padding: '0 4px'
        });
        msgEl.innerHTML = message;

        modal.appendChild(iconEl);
        modal.appendChild(titleEl);
        modal.appendChild(msgEl);

        let inputField = null;
        if (input) {
            const inputWrapper = document.createElement('div');
            Object.assign(inputWrapper.style, {
                marginBottom: '20px',
                width: '100%'
            });

            if (input.label) {
                const label = document.createElement('label');
                Object.assign(label.style, {
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--text-secondary, #a09888)',
                    marginBottom: '6px'
                });
                label.textContent = input.label;
                inputWrapper.appendChild(label);
            }

            inputField = document.createElement('input');
            inputField.type = 'text';
            inputField.placeholder = input.placeholder || '';
            inputField.value = input.value || '';
            inputField.required = input.required || false;
            Object.assign(inputField.style, {
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                boxSizing: 'border-box'
            });

            inputField.addEventListener('focus', function() {
                this.style.borderColor = 'var(--accent-red, #cc2233)';
                this.style.boxShadow = '0 0 0 3px rgba(204,34,51,0.15)';
            });
            inputField.addEventListener('blur', function() {
                this.style.borderColor = 'var(--border-color, rgba(200,184,154,0.12))';
                this.style.boxShadow = 'none';
            });

            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const confirmBtn = modal.querySelector('.btn-confirm');
                    if (confirmBtn) confirmBtn.click();
                }
            });

            inputWrapper.appendChild(inputField);
            modal.appendChild(inputWrapper);

            setTimeout(() => {
                inputField.focus();
                inputField.select();
            }, 100);
        }

        if (buttons.length > 0) {
            const actions = document.createElement('div');
            Object.assign(actions.style, {
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                flexWrap: 'wrap'
            });

            for (const btn of buttons) {
                const button = document.createElement('button');
                button.textContent = btn.label;
                button.className = btn.primary ? 'btn-confirm' : '';
                Object.assign(button.style, {
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    minWidth: '80px',
                    background: btn.primary ? 'var(--accent-red, #cc2233)' : 'var(--bg-card, #262626)',
                    color: btn.primary ? '#fff' : 'var(--text-primary, #e0d8cc)',
                    borderColor: btn.primary ? 'var(--accent-red, #cc2233)' : 'var(--border-color, rgba(200,184,154,0.12))'
                });

                if (btn.danger) {
                    button.style.background = 'var(--accent-red, #cc2233)';
                    button.style.borderColor = 'var(--accent-red, #cc2233)';
                    button.style.color = '#fff';
                }
                if (btn.success) {
                    button.style.background = 'var(--success-color, #44cc88)';
                    button.style.borderColor = 'var(--success-color, #44cc88)';
                    button.style.color = '#fff';
                }

                button.addEventListener('mouseenter', function() {
                    if (!btn.danger && !btn.success && !btn.primary) {
                        this.style.background = 'var(--bg-hover, #2d2d2d)';
                        this.style.borderColor = 'var(--beige-dark, #a89070)';
                    }
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
                });
                button.addEventListener('mouseleave', function() {
                    this.style.transform = 'none';
                    this.style.boxShadow = 'none';
                });
                button.addEventListener('click', () => {
                    const value = inputField ? inputField.value.trim() : null;
                    overlay.remove();
                    if (btn.action) btn.action(value);
                });

                actions.appendChild(button);
            }

            modal.appendChild(actions);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onClose) onClose(null);
            }
        });

        return overlay;
    }

    // ============================================================
    // УВЕДОМЛЕНИЯ
    // ============================================================

    function showNotification(message, type = 'info', duration = 3000) {
        const old = document.querySelector('.toast-notification');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';

        const colors = {
            success: '#44cc88',
            warning: '#ffaa33',
            error: '#cc2233',
            info: '#c8b89a'
        };

        const iconMap = {
            success: 'icon-success',
            warning: 'icon-warning',
            error: 'icon-error',
            info: 'icon-notification'
        };

        const safeType = (type === 'success' || type === 'warning' || type === 'error')
            ? type
            : 'info';

        const accent = colors[safeType] || colors.info;
        const iconId = iconMap[safeType] || iconMap.info;

        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%) translateY(20px)',
            background: 'var(--bg-panel, #1a1a1a)',
            border: '1px solid ' + accent,
            borderRadius: '12px',
            padding: '12px 24px',
            color: 'var(--text-primary, #e0d8cc)',
            fontSize: '13px',
            fontWeight: '500',
            zIndex: '99998',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 0 30px ' + accent + '15',
            backdropFilter: 'blur(12px)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            maxWidth: '90%',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxSizing: 'border-box'
        });

        toast.appendChild(makeSvgIcon(iconId, 14, accent));

        const textEl = document.createElement('span');
        textEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
        textEl.textContent = String(message || '');
        toast.appendChild(textEl);

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        const d = (typeof duration === 'number' && duration > 0) ? duration : 3000;
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 400);
        }, d);
    }

    // ============================================================
    // CSS МЕНЮ WINDOWS
    // ============================================================

    function injectWindowMenuCSS() {
        if (document.getElementById('window-menu-styles')) return;

        const style = document.createElement('style');
        style.id = 'window-menu-styles';
        style.textContent = `
            #windowTypeMenu {
                padding: 0 !important;
                overflow: hidden !important;
                width: max-content !important;
                min-width: 180px !important;
                max-width: 340px !important;
            }

            .window-menu__search {
                padding: 6px 8px 6px;
                border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.08));
                background: var(--bg-panel, #1a1a1a);
            }

            .window-menu__search-input {
                display: block;
                width: 100%;
                padding: 5px 8px;
                border-radius: 4px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                font-size: 11px;
                font-family: inherit;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.15s ease;
            }

            .window-menu__search-input:focus {
                border-color: var(--accent-red, #cc2233);
            }

            .window-menu__scroll {
                max-height: 380px;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 2px 0 4px;
            }

            .window-menu__scroll::-webkit-scrollbar { width: 6px; }
            .window-menu__scroll::-webkit-scrollbar-track { background: transparent; }
            .window-menu__scroll::-webkit-scrollbar-thumb {
                background: rgba(200, 184, 154, 0.15);
                border-radius: 3px;
            }
            .window-menu__scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(200, 184, 154, 0.3);
            }

            .window-menu__section {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px 3px;
                font-size: 9px;
                font-weight: 700;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.06));
                margin-bottom: 2px;
            }

            .window-menu__section .icon-svg {
                width: 10px;
                height: 10px;
                opacity: 0.7;
            }

            .window-menu__group-header {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 100%;
                padding: 4px 10px;
                border: none;
                background: transparent;
                color: var(--text-secondary, #a09888);
                font-size: 10px;
                font-weight: 700;
                font-family: inherit;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                cursor: pointer;
                text-align: left;
                transition: background 0.12s ease;
            }

            .window-menu__group-header:hover {
                background: var(--bg-hover, rgba(40, 40, 40, 0.4));
                color: var(--text-primary, #e0d8cc);
            }

            .window-menu__group-arrow {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                width: 12px;
                height: 12px;
                opacity: 0.7;
            }

            .window-menu__group-arrow .icon-svg {
                width: 10px;
                height: 10px;
            }

            .window-menu__group-name {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .window-menu__count {
                font-size: 9px;
                font-weight: 500;
                color: var(--text-muted, rgba(200, 184, 154, 0.35));
                padding: 1px 5px;
                border-radius: 8px;
                background: rgba(200, 184, 154, 0.06);
                flex-shrink: 0;
                text-transform: none;
                letter-spacing: 0;
            }

            .window-menu__item {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 5px 10px 5px 12px;
                border: none;
                background: transparent;
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                cursor: pointer;
                text-align: left;
                transition: background 0.12s ease;
            }

            .window-menu__item:hover {
                background: var(--bg-hover, rgba(40, 40, 40, 0.5));
            }

            .window-menu__item--minimized .window-menu__label {
                color: var(--text-secondary, #a09888);
                font-style: italic;
            }

            .window-menu__icon {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                fill: currentColor;
                opacity: 0.85;
            }

            .window-menu__label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .window-menu__id {
                font-size: 9px;
                color: var(--text-muted, rgba(200, 184, 154, 0.4));
                flex-shrink: 0;
                font-family: monospace;
            }

            .window-menu__empty {
                padding: 16px 12px;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                font-size: 11px;
                text-align: center;
            }

            .window-menu__group-items { padding: 0; }
            .window-menu__group-items .window-menu__item { padding-left: 22px; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // ИСТОРИЯ
    // ============================================================

    function renderHistoryMenu() {
        if (!el.historyMenu) return;
        if (!window.historyManager) return;

        const hm = window.historyManager;
        const entries = hm.getHistory() || [];
        const currentIndex = hm.getIndex();
        const canUndo = hm.canUndo();
        const canRedo = hm.canRedo();

        el.historyMenu.innerHTML = '';

        const actionsRow = document.createElement('div');
        actionsRow.className = 'history-actions-row';

        const undoBtn = makeHistoryActionButton('icon-undo', 'Undo', 'Ctrl+Z', canUndo, () => {
            if (hm.canUndo()) doHistoryUndo();
        });
        const redoBtn = makeHistoryActionButton('icon-redo', 'Redo', 'Ctrl+Y', canRedo, () => {
            if (hm.canRedo()) doHistoryRedo();
        });

        actionsRow.appendChild(undoBtn);
        actionsRow.appendChild(redoBtn);
        el.historyMenu.appendChild(actionsRow);

        const list = document.createElement('div');
        list.className = 'history-list';

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.textContent = 'Нет действий';
            list.appendChild(empty);
        } else {
            const sorted = [...entries].sort((a, b) => b.index - a.index);
            for (const entry of sorted) {
                list.appendChild(makeHistoryEntryRow(entry, currentIndex, hm));
            }
        }

        el.historyMenu.appendChild(list);

        const footer = document.createElement('div');
        footer.className = 'history-footer';
        const total = hm.getSize();
        footer.textContent = total === 0 ? 'История пуста' : `${currentIndex + 1} / ${total}`;
        el.historyMenu.appendChild(footer);
    }

    function makeHistoryActionButton(iconId, label, shortcut, enabled, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-action-btn';
        btn.disabled = !enabled;
        btn.title = `${label} (${shortcut})`;

        btn.appendChild(makeSvgIcon(iconId, 14));

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        btn.appendChild(labelEl);

        if (enabled) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        return btn;
    }

    function makeHistoryEntryRow(entry, currentIndex, hm) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'history-entry'
            + (entry.index === currentIndex ? ' is-current' : '')
            + (entry.index > currentIndex ? ' is-future' : '');

        const isCurrent = entry.index === currentIndex;

        const marker = document.createElement('span');
        marker.className = 'history-marker';
        marker.textContent = isCurrent ? '●' : '○';
        row.appendChild(marker);

        const idx = document.createElement('span');
        idx.className = 'history-index';
        idx.textContent = `#${entry.index}`;
        row.appendChild(idx);

        const label = document.createElement('span');
        label.className = 'history-label';
        label.textContent = entry.label || 'Действие';
        row.appendChild(label);

        if (!isCurrent) {
            const jumpBtn = document.createElement('span');
            jumpBtn.className = 'history-jump-btn';
            jumpBtn.title = `Перейти к состоянию #${entry.index}`;
            jumpBtn.setAttribute('role', 'button');
            jumpBtn.setAttribute('tabindex', '0');

            jumpBtn.appendChild(makeSvgIcon('icon-arrow-right', 12));

            const doJump = (e) => {
                e.stopPropagation();
                e.preventDefault();
                doHistoryJumpTo(entry.index);
                renderHistoryMenu();
            };

            jumpBtn.addEventListener('click', doJump);
            jumpBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') doJump(e);
            });

            row.appendChild(jumpBtn);
        }

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isCurrent) return;
            doHistoryJumpTo(entry.index);
            renderHistoryMenu();
        });

        return row;
    }

    function doHistoryUndo() {
        if (!window.historyManager) return;
        const result = window.historyManager.undo();
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function doHistoryRedo() {
        if (!window.historyManager) return;
        const result = window.historyManager.redo();
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function doHistoryJumpTo(index) {
        if (!window.historyManager) return;
        const result = window.historyManager.jumpTo(index);
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function applySnapshot(snapshot) {
        if (!snapshot) return;

        const hm = window.historyManager;
        if (hm && typeof hm.beginRestore === 'function') {
            hm.beginRestore();
        }

        try {
            if (window.dataBus && typeof window.dataBus.importSlots === 'function') {
                window.dataBus.importSlots({
                    slots: snapshot.slots || {},
                    archive: snapshot.archive || {},
                    counters: snapshot.counters || {}
                });
            }

            if (snapshot.layout && window.layoutManager) {
                window.layoutManager.loadProjectData(snapshot.layout);
                if (snapshot.layoutStyle) {
                    window.layoutManager.currentLayoutStyle = snapshot.layoutStyle;
                }
                window.layoutManager.render();

                setTimeout(() => {
                    try { window.layoutManager.resizeAll(); } catch (e) {}
                    updateUI();
                    if (el.historyDropdown?.classList.contains('active')) {
                        renderHistoryMenu();
                    }
                }, 30);
            } else {
                updateUI();
                if (el.historyDropdown?.classList.contains('active')) {
                    renderHistoryMenu();
                }
            }
        } catch (e) {
            console.error('[LSYSTEM] applySnapshot error:', e);
        } finally {
            setTimeout(() => {
                if (hm && typeof hm.endRestore === 'function') {
                    hm.endRestore();
                }
            }, 200);
        }
    }

    function buildSnapshot() {
        const snap = {
            slots: null,
            archive: null,
            counters: null,
            layout: null,
            layoutStyle: null
        };

        if (window.dataBus && typeof window.dataBus.exportSlots === 'function') {
            const s = window.dataBus.exportSlots();
            snap.slots = s.slots;
            snap.archive = s.archive;
            snap.counters = s.counters;
        }

        if (window.layoutManager) {
            if (typeof window.layoutManager.getProjectData === 'function') {
                snap.layout = window.layoutManager.getProjectData();
            }
            if (typeof window.layoutManager.getCurrentStyle === 'function') {
                snap.layoutStyle = window.layoutManager.getCurrentStyle();
            }
        }

        return snap;
    }

    const IGNORED_LAYOUT_ACTIONS = new Set(['focus']);

    function setupHistoryEvents() {
        if (!window.historyManager) return;

        document.addEventListener('layout-action', (e) => {
            if (!window.historyManager) return;
            if (window.historyManager.isRestoring && window.historyManager.isRestoring()) return;

            const d = e.detail || {};
            if (IGNORED_LAYOUT_ACTIONS.has(d.action)) return;

            let label;
            switch (d.action) {
                case 'add': {
                    const t = getTypeName(d.type);
                    const slot = d.slotId ? ` (${d.slotId})` : '';
                    label = `${t} — добавлено${slot}`;
                    break;
                }
                case 'remove': {
                    const t = getTypeName(d.type);
                    const slot = d.slotId ? ` (${d.slotId})` : '';
                    label = `${t} — удалено${slot}`;
                    break;
                }
                case 'swap': label = 'Окна — перестановка'; break;
                case 'style': label = `Layout — ${d.styleId || 'стиль'}`; break;
                case 'minimize': label = `Свернуть: ${getTypeName(d.type)}`; break;
                case 'restore': label = `Развернуть: ${getTypeName(d.type)}`; break;
                case 'fullscreen': label = `Полный экран: ${getTypeName(d.type)}`; break;
                case 'fullscreen-exit': label = `Выход из полного экрана: ${getTypeName(d.type)}`; break;
                default: return;
            }

            window.historyManager.record(label);
            refreshHistoryButton();
        });

        document.addEventListener('history-recorded', () => {
            if (el.historyDropdown?.classList.contains('active')) {
                renderHistoryMenu();
            }
            refreshHistoryButton();
        });

        window.historyManager.subscribe(() => {
            if (el.historyDropdown?.classList.contains('active')) {
                renderHistoryMenu();
            }
            refreshHistoryButton();
        });

        refreshHistoryButton();
    }

    function refreshHistoryButton() {
        if (!el.historyBtn || !window.historyManager) return;
        const total = window.historyManager.getSize();
        el.historyBtn.style.opacity = total === 0 ? '0.5' : '1';
    }

    function getTypeName(typeId) {
        if (!typeId) return 'Окно';
        const reg = window.__registry;
        if (reg && typeof reg.getType === 'function') {
            const cfg = reg.getType(typeId);
            if (cfg && cfg.name) return cfg.name;
        }
        return typeId;
    }

    // ============================================================
    // МОДАЛКИ ПРОЕКТОВ
    // ============================================================

    function showSaveModal(onSave) {
        const currentName = state.projectName || 'project';

        createModal({
            icon: 'icon-save',
            title: 'Сохранить проект',
            message: 'Введите название проекта',
            type: 'info',
            input: {
                label: 'Название проекта',
                placeholder: 'Введите название...',
                value: currentName,
                required: true
            },
            buttons: [
                { label: 'Отмена', action: () => { if (onSave) onSave(null); } },
                { label: 'Сохранить', success: true, primary: true, action: (value) => {
                    if (value && value.trim()) {
                        if (onSave) onSave(value.trim());
                    } else {
                        showNotification('Введите название проекта', 'warning');
                    }
                }}
            ]
        });
    }

    function showUnsavedModal(action, onConfirm) {
        const actionLabels = {
            'new': 'создания нового проекта',
            'load': 'загрузки другого проекта',
            'quit': 'закрытия приложения'
        };

        createModal({
            icon: 'icon-save',
            title: 'Несохранённые изменения',
            message: `У вас есть несохранённые изменения.<br>Сохранить перед <strong>${actionLabels[action] || 'продолжением'}</strong>?`,
            type: 'warning',
            buttons: [
                { label: 'Отменить', action: () => { if (onConfirm) onConfirm(null); } },
                { label: 'Не сохранять', danger: true, action: () => { if (onConfirm) onConfirm(false); } },
                { label: 'Сохранить', success: true, action: () => { if (onConfirm) onConfirm(true); } }
            ]
        });
    }

    function showConfirmModal(title, message, onConfirm) {
        createModal({
            icon: 'icon-question',
            title: title,
            message: message,
            type: 'info',
            buttons: [
                { label: 'Отмена', action: () => {} },
                { label: 'Подтвердить', primary: true, action: () => { if (onConfirm) onConfirm(); } }
            ]
        });
    }

    function showErrorModal(title, message) {
        createModal({
            icon: 'icon-error',
            title: title,
            message: message,
            type: 'error',
            buttons: [{ label: 'OK', primary: true, action: () => {} }]
        });
    }

    function showInfoModal(title, message) {
        createModal({
            icon: 'icon-notification',
            title: title,
            message: message,
            type: 'info',
            buttons: [{ label: 'OK', action: () => {} }]
        });
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    async function init() {
        cacheElements();

        if (!el.workspace) {
            console.error('[LSYSTEM] Workspace not found');
            return;
        }

        if (window.__svgReady && typeof window.__svgReady.then === 'function') {
            try {
                await window.__svgReady;
            } catch (e) {
                console.warn('[LSYSTEM] SVG sprites not ready:', e);
            }
        }

        try {
            window.appState = new AppState({ debug: false });
            window.hotkeyRegistry = new HotkeyRegistry({ debug: false });
            window.messageBus = new MessageBus({ maxHistory: 100, debug: false });

            const registry = new WindowRegistry();
            registry.init();
            window.__registry = registry;

            window.dataBus = new DataBus({ debug: false });
            window.eventBus = createEventBus();

            window.pluginSystem = new PluginSystem({
                registry: registry,
                eventBus: window.eventBus,
                appState: window.appState,
                debug: false
            });

            await window.pluginSystem.loadAll();

            window.layoutManager = new LayoutManager({
                workspace: el.workspace,
                maxWindows: 4,
                registry: registry,
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                messageBus: window.messageBus
            });
            window.layoutManager.init();

            window.messageBus.setLayoutManager(window.layoutManager);

            window.hotkeyRegistry.attach(document);

            setupGlobalHotkeys();

            window.settingsModal = new SettingsModal();

            window.historyManager = new HistoryManager({
                maxHistory: 100,
                debug: false
            });
            window.historyManager.setSnapshotProvider(buildSnapshot);

            window.projectManager = new ProjectManager({
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                layoutManager: window.layoutManager,
                autoSave: true,
                autoSaveInterval: 30000
            });

            setupProjectEvents();
            setupUIEvents();
            setupHistoryEvents();
            setupTheme();
            setupHeaderCollapse();
            setupHeaderAdaptive();
            injectWindowMenuCSS();

            populateWindowMenu();

            if (window.projectManager) {
                window.projectManager.loadLastProject();
            }

            state.isModified = false;

            updateUI();
            updateRecentProjects();

            state.isReady = true;

            setTimeout(() => {
                if (window.layoutManager) {
                    window.layoutManager.resizeAll();
                }
                if (window.historyManager) {
                    window.historyManager.record('Начальное состояние');
                }
            }, 300);

        } catch (error) {
            console.error('[LSYSTEM] Initialization error:', error);
            showErrorModal('Ошибка инициализации', error.message || 'Не удалось запустить приложение');
        }
    }

    // ============================================================
    // EVENT BUS
    // ============================================================

    function createEventBus() {
        const listeners = {};
        return {
            on: function(event, callback) {
                if (!listeners[event]) listeners[event] = [];
                listeners[event].push(callback);
                return () => {
                    const idx = listeners[event]?.indexOf(callback);
                    if (idx !== -1) listeners[event].splice(idx, 1);
                };
            },
            emit: function(event, data) {
                if (listeners[event]) {
                    for (const cb of listeners[event]) {
                        try { cb(data); } catch (e) { console.error(e); }
                    }
                }
            }
        };
    }

    // ============================================================
    // ТЕМА
    // ============================================================

    function setupTheme() {
        if (window.appState) {
            window.appState.subscribe('theme', () => {});
            window.appState.subscribe('themeMode', () => {});
        }
    }

    // ============================================================
    // HEADER COLLAPSE
    // ============================================================

    function isHeaderCollapsed() {
        return document.body.classList.contains('header-collapsed');
    }

    function setHeaderCollapsed(collapsed, animate = true) {
        const next = !!collapsed;
        const current = isHeaderCollapsed();

        if (next === current) return;

        if (!animate) {
            document.body.style.transition = 'none';
        }

        document.body.classList.toggle('header-collapsed', next);

        if (!animate) {
            void document.body.offsetWidth;
            document.body.style.transition = '';
        }

        try {
            localStorage.setItem(HEADER_COLLAPSE_KEY, next ? '1' : '0');
        } catch (e) {}

        refreshLogoImageTitle();

        if (window.layoutManager) {
            requestAnimationFrame(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
            });
        }
    }

    function toggleHeaderCollapsed() {
        setHeaderCollapsed(!isHeaderCollapsed());
    }

    function restoreHeaderCollapsedState() {
        let saved = null;
        try { saved = localStorage.getItem(HEADER_COLLAPSE_KEY); } catch (e) {}

        const collapsed = isHeaderCollapsed();
        if (saved === '1' && !collapsed) {
            setHeaderCollapsed(true, false);
        } else if (saved !== '1' && collapsed) {
            setHeaderCollapsed(false, false);
        }
    }

    function setupHeaderCollapse() {
        if (!el.logo) return;

        restoreHeaderCollapsedState();

        const logoText = el.logo.querySelector('.logo-text');
        if (logoText) {
            logoText.title = 'Switch Theme';
            logoText.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.appState) return;
                const next = window.appState.toggleTheme();
                showNotification('Тема: ' + next, 'info', 1500);
            });
        }

        const logoImg = el.logo.querySelector('.logo-img');
        if (logoImg) {
            logoImg.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleHeaderCollapsed();
            });
        }

        refreshLogoImageTitle();
        refreshIslandButtons();
    }

    function refreshLogoImageTitle() {
        const logoImg = el.logo?.querySelector('.logo-img');
        if (!logoImg) return;
        logoImg.title = isHeaderCollapsed() ? 'Expand Header' : 'Collapse Header';
    }

    function refreshIslandButtons() {
        if (!isHeaderCollapsed()) return;

        const hasWindows = (window.layoutManager?.getWindowCount() || 0) > 0;
        const visibleCount = window.layoutManager?.getVisibleWindowCount() || 0;
        const maxed = visibleCount >= 4;

        if (el.saveBtn) el.saveBtn.classList.toggle('is-hidden-in-island', !hasWindows);
        if (el.newProjectBtn) el.newProjectBtn.classList.toggle('is-hidden-in-island', !hasWindows);
        if (el.newWindowBtn) el.newWindowBtn.classList.toggle('is-hidden-in-island', maxed);
    }

    // ============================================================
    // АДАПТИВ HEADER (ФИКСИРОВАННЫЙ BREAKPOINT)
    // ============================================================

    function setupHeaderAdaptive() {
        if (!el.header) return;

        let compact = false;
        let namesCompact = false;
        let rafId = null;

        const applyState = () => {
            rafId = null;

            const viewportW = window.innerWidth || 0;
            if (viewportW === 0) return;

            let shouldCompact = compact;

            if (!compact) {
                // Переход в compact: ширина <= breakpoint
                shouldCompact = viewportW <= HEADER_COMPACT_BREAKPOINT;
            } else {
                // Выход из compact: ширина > breakpoint + гистерезис
                shouldCompact = viewportW <= (HEADER_COMPACT_BREAKPOINT + HEADER_COMPACT_HYSTERESIS);
            }

            let shouldCompactNames = namesCompact;
            if (!namesCompact) {
                shouldCompactNames = viewportW <= HEADER_COMPACT_BREAKPOINT_NAME;
            } else {
                shouldCompactNames = viewportW <= (HEADER_COMPACT_BREAKPOINT_NAME + HEADER_COMPACT_HYSTERESIS);
            }

            if (shouldCompact !== compact) {
                compact = shouldCompact;
                el.header.classList.toggle('is-compact', compact);
            }

            if (shouldCompactNames !== namesCompact) {
                namesCompact = shouldCompactNames;
                el.header.classList.toggle('is-name-compact', namesCompact);
            }
        };

        const schedule = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(applyState);
        };

        setupHeaderAdaptive._apply = schedule;
        setupHeaderAdaptive._invalidateMeasurement = () => {};

        requestAnimationFrame(() => {
            requestAnimationFrame(applyState);
        });

        window.addEventListener('resize', () => {
            clearTimeout(setupHeaderAdaptive._t);
            setupHeaderAdaptive._t = setTimeout(schedule, 60);
        });
    }

    function refreshHeaderCompact() {
        if (setupHeaderAdaptive._apply) {
            setupHeaderAdaptive._apply();
        }
    }

    // ============================================================
    // ГОРЯЧИЕ КЛАВИШИ
    // ============================================================

    function setupGlobalHotkeys() {
        if (!window.hotkeyRegistry) return;
        if (!window.appState) return;

        window.appState.ensureGlobalHotkeyDefaults({
            'Ctrl+Z':       { label: 'Отменить' },
            'Ctrl+Shift+Z': { label: 'Повторить' },
            'Ctrl+Y':       { label: 'Повторить (альт.)' },
            'Ctrl+S':       { label: 'Сохранить проект' },
            'Ctrl+O':       { label: 'Открыть проект' },
            'Ctrl+N':       { label: 'Новый проект' },
            'Ctrl+,':       { label: 'Настройки' },
            'Ctrl+Shift+H': { label: 'Свернуть/развернуть панель' },
            'Escape':       { label: 'Закрыть меню / Отмена' }
        });

        const globalHotkeys = window.appState.getGlobalHotkeys();

        const actions = {
            'Ctrl+Z':       () => { if (window.historyManager?.canUndo()) doHistoryUndo(); },
            'Ctrl+Shift+Z': () => { if (window.historyManager?.canRedo()) doHistoryRedo(); },
            'Ctrl+Y':       () => { if (window.historyManager?.canRedo()) doHistoryRedo(); },
            'Ctrl+S':       () => handleSave(),
            'Ctrl+O':       () => handleLoad(),
            'Ctrl+N':       () => handleNewProject(),
            'Ctrl+,':       () => window.settingsModal?.toggle(),
            'Ctrl+Shift+H': () => toggleHeaderCollapsed(),
            'Escape':       () => {
                closeDropdown(el.loadDropdown);
                closeDropdown(el.newWindowDropdown);
                closeDropdown(el.historyDropdown);
            }
        };

        for (const [originalCombo, entry] of Object.entries(globalHotkeys)) {
            const effectiveOriginal = entry.original || originalCombo;
            const handler = actions[effectiveOriginal];
            if (!handler) continue;

            const combo = entry.combo || effectiveOriginal;
            window.hotkeyRegistry.registerGlobal(combo, handler, {
                source: 'global',
                original: effectiveOriginal
            });
        }

        if (window.layoutManager && window.layoutManager._windowInstances) {
            window.layoutManager._windowInstances.forEach(function(bw) {
                if (bw && typeof bw.registerHotkeys === 'function') {
                    try { bw.registerHotkeys(); } catch (e) {
                        console.warn('[LSYSTEM] registerHotkeys error:', e);
                    }
                }
            });
        }
    }

    // ============================================================
    // СОБЫТИЯ ПРОЕКТА
    // ============================================================

    function setupProjectEvents() {
        document.addEventListener('project-new', () => {
            if (window.layoutManager) {
                window.layoutManager.loadDefaultState();
                state.isModified = false;
                state.projectName = 'Untitled';
                state.projectPath = null;
                updateUI();
                populateWindowMenu();
                showNotification('Новый проект создан', 'success');

                if (window.historyManager) {
                    window.historyManager.clear();
                    window.historyManager.record('Начальное состояние');
                }
            }
        });

        document.addEventListener('project-saved', (e) => {
            const path = e.detail?.path || null;
            const name = e.detail?.name || state.projectName || 'Untitled';
            const downloaded = e.detail?.downloaded;

            state.projectPath = path;
            state.projectName = name;
            state.isModified = false;
            updateUI();
            updateRecentProjects();

            if (downloaded) {
                showNotification('Проект "' + name + '" сохранён и выгружен', 'success');
            } else {
                showNotification('Автосохранение: "' + name + '"', 'info', 1500);
            }
        });

        document.addEventListener('project-loaded', (e) => {
            state.projectPath = e.detail?.path || null;
            state.projectName = e.detail?.name || state.projectName || 'Untitled';
            state.isModified = false;
            updateUI();
            updateRecentProjects();

            setTimeout(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
                updateUI();

                if (window.historyManager) {
                    window.historyManager.clear();
                    window.historyManager.record('Проект загружен');
                }
            }, 200);

            showNotification('Проект "' + state.projectName + '" загружен', 'success');
        });

        document.addEventListener('project-dirty', () => {
            state.isModified = true;
            updateUI();
        });

        document.addEventListener('layout-changed', () => {
            if (window.layoutManager?.getWindowCount() > 0) {
                if (window.projectManager) window.projectManager._markDirty();
            }
            updateUI();
            setTimeout(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
            }, 50);
        });
    }

    // ============================================================
    // UI СОБЫТИЯ
    // ============================================================

    function setupUIEvents() {
        el.newProjectBtn?.addEventListener('click', handleNewProject);
        el.saveBtn?.addEventListener('click', handleSave);

        el.loadBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(el.loadDropdown);
        });

        el.loadFromFileBtn?.addEventListener('click', () => {
            closeDropdown(el.loadDropdown);
            handleLoad();
        });

        el.newWindowBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(el.newWindowDropdown);
        });

        el.settingsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            window.settingsModal?.toggle();
        });

        el.historyBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(el.historyDropdown);
            if (el.historyDropdown?.classList.contains('active')) {
                renderHistoryMenu();
            }
        });

        document.addEventListener('click', (e) => {
            if (el.loadDropdown && !el.loadDropdown.contains(e.target)) closeDropdown(el.loadDropdown);
            if (el.newWindowDropdown && !el.newWindowDropdown.contains(e.target)) closeDropdown(el.newWindowDropdown);
            if (el.historyDropdown && !el.historyDropdown.contains(e.target)) closeDropdown(el.historyDropdown);
        });

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
                repositionOpenDropdowns();
            }, 150);
        });

        window.addEventListener('scroll', repositionOpenDropdowns, true);
    }

    // ============================================================
    // DROPDOWN
    // ============================================================

    function closeAllTopbarDropdowns(except = null) {
        const dropdowns = [el.loadDropdown, el.newWindowDropdown, el.historyDropdown];
        for (const dd of dropdowns) {
            if (dd && dd !== except) dd.classList.remove('active');
        }
    }

    function positionDropdown(dropdownWrapper) {
        if (!dropdownWrapper) return;

        const menu = dropdownWrapper.querySelector('.dropdown-menu');
        if (!menu) return;

        menu.classList.remove('is-align-right');
        menu.style.left = '';
        menu.style.right = '';
        menu.style.top = '';
        menu.style.bottom = '';

        const prevVisibility = menu.style.visibility;
        const prevOpacity = menu.style.opacity;
        const prevDisplay = menu.style.display;

        menu.style.visibility = 'hidden';
        menu.style.opacity = '0';
        menu.style.display = 'block';

        const wrapperRect = dropdownWrapper.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();

        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const margin = 8;

        let left = wrapperRect.left + wrapperRect.width / 2 - menuRect.width / 2;

        if (left + menuRect.width > viewportW - margin) {
            left = wrapperRect.right - menuRect.width;
            menu.classList.add('is-align-right');
        }

        if (left < margin) {
            left = wrapperRect.left;
            menu.classList.remove('is-align-right');
        }

        left = Math.max(margin, Math.min(left, viewportW - menuRect.width - margin));
        menu.style.left = (left - wrapperRect.left) + 'px';

        const spaceBelow = viewportH - wrapperRect.bottom - margin;
        const spaceAbove = wrapperRect.top - margin;

        if (menuRect.height > spaceBelow && spaceAbove > spaceBelow) {
            menu.style.top = 'auto';
            menu.style.bottom = 'calc(100% + 6px)';
            menu.style.transformOrigin = 'bottom ' + (menu.classList.contains('is-align-right') ? 'right' : 'left');
        } else {
            menu.style.top = 'calc(100% + 6px)';
            menu.style.bottom = 'auto';
            menu.style.transformOrigin = 'top ' + (menu.classList.contains('is-align-right') ? 'right' : 'left');
        }

        menu.style.visibility = prevVisibility;
        menu.style.opacity = prevOpacity;
        menu.style.display = prevDisplay;
    }

    function repositionOpenDropdowns() {
        const wrappers = [el.loadDropdown, el.newWindowDropdown, el.historyDropdown];
        for (const w of wrappers) {
            if (w && w.classList.contains('active')) positionDropdown(w);
        }
    }

    function toggleDropdown(element) {
        if (!element) return;

        const isOpen = element.classList.contains('active');

        if (isOpen) {
            closeDropdown(element);
        } else {
            closeAllTopbarDropdowns(element);
            element.classList.add('active');

            if (element === el.loadDropdown) updateRecentProjects();
            if (element === el.newWindowDropdown) populateWindowMenu();
            if (element === el.historyDropdown) renderHistoryMenu();

            requestAnimationFrame(() => positionDropdown(element));
        }
    }

    function closeDropdown(element) {
        if (!element) return;
        element.classList.remove('active');
        if (element === el.newWindowDropdown) state.windowSearchQuery = '';
    }

    // ============================================================
    // НОВЫЙ ПРОЕКТ
    // ============================================================

    async function handleNewProject() {
        if (!window.projectManager) {
            showErrorModal('Ошибка', 'ProjectManager не инициализирован');
            return;
        }

        const hasWindows = window.layoutManager?.getWindowCount() > 0;
        const hasUnsaved = window.projectManager.isDirty() || state.isModified;

        if (hasUnsaved && hasWindows) {
            const decision = await new Promise((resolve) => {
                showUnsavedModal('new', resolve);
            });

            if (decision === true) {
                const saved = await handleSave();
                if (!saved) return;
            } else if (decision === null) {
                return;
            }
        }

        performNewProject();
    }

    function performNewProject() {
        if (window.projectManager) {
            window.projectManager.newProject({ force: true });
        } else {
            if (window.dataBus) window.dataBus.clearAll();
            if (window.layoutManager) {
                window.layoutManager.closeAll();
                window.layoutManager.loadDefaultState();
            }
            state.isModified = false;
        }

        state.projectPath = null;
        state.projectName = 'Untitled';
        populateWindowMenu();
        updateUI();
        showNotification('Новый проект создан', 'success');
    }

    // ============================================================
    // СОХРАНЕНИЕ
    // ============================================================

    function handleSave() {
        return new Promise((resolve) => {
            if (state.isSaving) { resolve(false); return; }

            if (!window.projectManager) {
                showErrorModal('Ошибка', 'ProjectManager не инициализирован');
                resolve(false);
                return;
            }

            const hasWindows = window.layoutManager?.getWindowCount() > 0;
            if (!hasWindows) {
                showNotification('Нет окон для сохранения', 'warning');
                resolve(false);
                return;
            }

            if (state.projectPath) {
                resolve(doSave(state.projectPath));
                return;
            }

            showSaveModal((projectName) => {
                if (!projectName) { resolve(false); return; }

                const filename = projectName.endsWith('.lsp') ? projectName : projectName + '.lsp';
                state.projectPath = filename;
                state.projectName = projectName.replace(/\.lsp$/, '');
                resolve(doSave(filename));
            });
        });
    }

    function doSave(filename) {
        if (state.isSaving) return false;
        state.isSaving = true;

        try {
            const cleanName = String(filename).replace(/\.lsp$/i, '');

            const result = window.projectManager.saveProject({
                path: filename,
                name: cleanName,
                download: true
            });

            if (result) {
                state.isModified = false;
                state.projectPath = filename;
                state.projectName = cleanName;
                updateUI();
                updateRecentProjects();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[LSYSTEM] Save error:', error);
            showErrorModal('Ошибка сохранения', error.message || 'Не удалось сохранить проект');
            return false;
        } finally {
            state.isSaving = false;
        }
    }

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================

    async function handleLoad() {
        if (state.isLoading) return;
        state.isLoading = true;

        try {
            if (!window.projectManager) {
                showErrorModal('Ошибка', 'ProjectManager не инициализирован');
                return;
            }

            const hasWindows = window.layoutManager?.getWindowCount() > 0;
            const hasUnsaved = window.projectManager.isDirty() || state.isModified;

            if (hasUnsaved && hasWindows) {
                const decision = await new Promise((resolve) => {
                    showUnsavedModal('load', resolve);
                });

                if (decision === true) {
                    const saved = await handleSave();
                    if (!saved) return;
                } else if (decision === null) {
                    return;
                }
            }

            await performLoad();
        } finally {
            state.isLoading = false;
        }
    }

    async function performLoad() {
        try {
            const file = await selectFile('.lsp,.json');
            if (file && window.projectManager) {
                await window.projectManager.loadFromFile(file);
                state.projectPath = file.name;
                state.projectName = file.name.replace(/\.lsp$/i, '').replace(/\.json$/i, '');
                state.isModified = false;
                updateUI();
                updateRecentProjects();
                setTimeout(() => {
                    if (window.layoutManager) window.layoutManager.resizeAll();
                    updateUI();
                }, 200);
            }
        } catch (error) {
            console.error('[LSYSTEM] Load error:', error);
            showErrorModal('Ошибка загрузки', error.message || 'Не удалось загрузить проект');
        } finally {
            state.isLoading = false;
        }
    }

    function selectFile(accept) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept || '.lsp,.json';
            input.style.display = 'none';
            document.body.appendChild(input);

            let resolved = false;

            const finish = (file) => {
                if (resolved) return;
                resolved = true;
                input.remove();
                window.removeEventListener('focus', onFocus);
                resolve(file);
            };

            input.onchange = () => finish(input.files?.[0] || null);
            input.oncancel = () => finish(null);

            const onFocus = () => {
                setTimeout(() => {
                    if (!resolved && (!input.files || input.files.length === 0)) {
                        finish(null);
                    }
                }, 300);
            };
            window.addEventListener('focus', onFocus);

            input.click();
        });
    }

    // ============================================================
    // НЕДАВНИЕ ПРОЕКТЫ
    // ============================================================

    async function loadRecentProject(path) {
        if (!path) return;

        if (!window.projectManager) {
            showErrorModal('Ошибка', 'ProjectManager не инициализирован');
            return;
        }

        const hasWindows = window.layoutManager?.getWindowCount() > 0;
        const hasUnsaved = window.projectManager.isDirty() || state.isModified;

        if (hasUnsaved && hasWindows) {
            const decision = await new Promise((resolve) => {
                showUnsavedModal('load', resolve);
            });

            if (decision === true) {
                const saved = await handleSave();
                if (!saved) return;
            } else if (decision === null) {
                return;
            }
        }

        await doLoadRecent(path);
    }

    async function doLoadRecent(path) {
        try {
            const result = window.projectManager.loadProject(path);
            if (result) {
                state.projectPath = path;
                state.projectName = path.split('/').pop().replace(/\.lsp$/i, '').replace(/\.json$/i, '');
                state.isModified = false;
                updateUI();
                updateRecentProjects();
                setTimeout(() => {
                    if (window.layoutManager) window.layoutManager.resizeAll();
                    updateUI();
                }, 200);
                showNotification('Проект "' + state.projectName + '" загружен', 'success');
            } else {
                showErrorModal('Ошибка', 'Проект не найден или повреждён');
                if (window.projectManager) window.projectManager.removeRecentProject(path);
                updateRecentProjects();
            }
        } catch (error) {
            console.error('[LSYSTEM] Load recent error:', error);
            showErrorModal('Ошибка загрузки', error.message || 'Не удалось загрузить проект');
            if (window.projectManager) window.projectManager.removeRecentProject(path);
            updateRecentProjects();
        } finally {
            state.isLoading = false;
        }
    }

    // ============================================================
    // МЕНЮ WINDOWS
    // ============================================================

    function populateWindowMenu() {
        if (!el.windowTypeMenu) return;

        const registry = window.__registry;
        if (!registry) {
            el.windowTypeMenu.innerHTML =
                '<div class="window-menu__empty">Реестр не инициализирован</div>';
            return;
        }

        const layout = window.layoutManager;
        const appState = window.appState;
        if (!layout || !appState) return;

        const query = (state.windowSearchQuery || '').toLowerCase().trim();

        const minimized = layout.getMinimizedWindows();
        const groups = registry.getTypesByGroup();
        const collapsed = appState.getCollapsedGroups();

        let html = '';

        html += `
            <div class="window-menu__search">
                <input type="text" class="window-menu__search-input" id="windowMenuSearchInput"
                    placeholder="Поиск..."
                    value="${escapeHtml(state.windowSearchQuery || '')}" />
            </div>
        `;

        html += `<div class="window-menu__scroll">`;

        const visibleMinimized = minimized.filter(w => !query || matchesQuery(w, query));

        if (visibleMinimized.length > 0) {
            html += `<div class="window-menu__section">${
                makeSvgIconString('icon-archive', 10)
            } Свёрнутые <span class="window-menu__count">${visibleMinimized.length}</span></div>`;

            for (const w of visibleMinimized) {
                html += renderMinimizedItem(w);
            }
        }

        const groupNames = Object.keys(groups).sort();
        let hasAnyType = false;

        for (const groupName of groupNames) {
            const types = groups[groupName] || [];
            const visibleTypes = types.filter(t => !query || matchesTypeQuery(t, query));

            if (visibleTypes.length === 0) continue;
            hasAnyType = true;

            const isCollapsed = !!collapsed[groupName];
            const arrowIcon = isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down';

            html += `
                <button type="button" class="window-menu__group-header" data-group-toggle="${escapeHtml(groupName)}">
                    <span class="window-menu__group-arrow">${makeSvgIconString(arrowIcon, 10)}</span>
                    <span class="window-menu__group-name">${escapeHtml(groupName)}</span>
                    <span class="window-menu__count">${visibleTypes.length}</span>
                </button>
                <div class="window-menu__group-items" data-group-items="${escapeHtml(groupName)}" style="display:${isCollapsed ? 'none' : 'block'};">
            `;

            for (const type of visibleTypes) {
                html += renderTypeItem(type);
            }

            html += `</div>`;
        }

        if (!hasAnyType && visibleMinimized.length === 0) {
            html += `<div class="window-menu__empty">${query ? 'Ничего не найдено' : 'Нет типов окон'}</div>`;
        }

        html += `</div>`;

        el.windowTypeMenu.innerHTML = html;

        const searchInput = el.windowTypeMenu.querySelector('#windowMenuSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.windowSearchQuery = e.target.value;

                const selStart = searchInput.selectionStart;
                const selEnd = searchInput.selectionEnd;

                populateWindowMenu();

                const newInput = el.windowTypeMenu.querySelector('#windowMenuSearchInput');
                if (newInput) {
                    newInput.focus();
                    try { newInput.setSelectionRange(selStart, selEnd); } catch (err) {}
                }
            });

            searchInput.addEventListener('click', (e) => e.stopPropagation());
            searchInput.addEventListener('keydown', (e) => e.stopPropagation());
        }

        el.windowTypeMenu.querySelectorAll('[data-group-toggle]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const groupName = btn.dataset.groupToggle;
                if (!groupName) return;

                if (window.appState) {
                    window.appState.toggleGroupCollapsed(groupName);
                }

                const items = el.windowTypeMenu.querySelector(`[data-group-items="${cssEscape(groupName)}"]`);
                const arrow = btn.querySelector('.window-menu__group-arrow');
                const isCollapsed = window.appState?.isGroupCollapsed(groupName);

                if (items) items.style.display = isCollapsed ? 'none' : 'block';
                if (arrow) {
                    arrow.innerHTML = makeSvgIconString(
                        isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down',
                        10
                    );
                }
            });
        });

        el.windowTypeMenu.querySelectorAll('.window-menu__item[data-type]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const type = btn.dataset.type;
                if (type) {
                    createWindow(type);
                    closeDropdown(el.newWindowDropdown);
                }
            });
        });

        el.windowTypeMenu.querySelectorAll('.window-menu__item[data-minimized-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const wid = btn.dataset.minimizedId;
                if (wid && window.layoutManager) {
                    window.layoutManager.restoreWindow(wid);
                    closeDropdown(el.newWindowDropdown);
                }
            });
        });
    }

    function renderTypeItem(type) {
        const iconId = resolveIconName(type.icon, 'icon-window-type');
        return `<button class="window-menu__item" data-type="${escapeHtml(type.id)}">${
            makeSvgIconString(iconId, 14, 'window-menu__icon')
        }<span class="window-menu__label">${escapeHtml(type.name)}</span></button>`;
    }

    function renderMinimizedItem(w) {
        const iconId = resolveIconName(w.icon, 'icon-window-type');
        return `<button class="window-menu__item window-menu__item--minimized" data-minimized-id="${escapeHtml(String(w.id))}">${
            makeSvgIconString(iconId, 14, 'window-menu__icon')
        }<span class="window-menu__label">${escapeHtml(w.title || ('#' + w.id))}</span><span class="window-menu__id">#${escapeHtml(String(w.id))}</span></button>`;
    }

    function matchesQuery(w, query) {
        const title = (w.title || '').toLowerCase();
        const type = (w.type || '').toLowerCase();
        const slot = (w.slotId || '').toLowerCase();
        return title.includes(query) || type.includes(query) || slot.includes(query);
    }

    function matchesTypeQuery(type, query) {
        const name = (type.name || '').toLowerCase();
        const id = (type.id || '').toLowerCase();
        return name.includes(query) || id.includes(query);
    }

    // ============================================================
    // СОЗДАНИЕ ОКНА
    // ============================================================

    function createWindow(type) {
        if (!window.layoutManager) {
            showErrorModal('Ошибка', 'LayoutManager не инициализирован');
            return;
        }

        const registry = window.__registry;
        const typeConfig = registry?.getType(type);

        if (!typeConfig) {
            showErrorModal('Ошибка', 'Тип окна "' + type + '" не найден');
            return;
        }

        if (window.layoutManager.getVisibleWindowCount() >= 4) {
            showNotification('Максимум 4 видимых окна', 'warning');
            return;
        }

        const result = window.layoutManager.addWindow(type, typeConfig.name, typeConfig.icon);

        if (result) {
            state.isModified = true;
            if (window.projectManager) window.projectManager._markDirty();
            updateUI();
            setTimeout(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
                updateUI();
            }, 100);
            showNotification('Окно "' + typeConfig.name + '" создано', 'success');
        } else {
            showErrorModal('Ошибка', 'Не удалось создать окно "' + typeConfig.name + '"');
        }
    }

    // ============================================================
    // НЕДАВНИЕ ПРОЕКТЫ (UI)
    // ============================================================

    function updateRecentProjects() {
        if (!el.recentList) return;

        const recent = window.projectManager?.getRecentProjects() || [];

        if (recent.length === 0) {
            el.recentList.innerHTML =
                '<div class="window-menu__empty">Нет недавних проектов</div>';
            return;
        }

        let html = '';
        for (const path of recent) {
            const name = path.split('/').pop() || path;
            const isActive = path === state.projectPath;
            const iconId = isActive ? 'icon-circle-filled' : 'icon-data';

            html += `
                <button class="recent-item" data-path="${escapeHtml(path)}" style="${isActive ? 'border-left-color:var(--accent-red);background:var(--bg-hover);' : ''}">
                    <span class="recent-icon">${makeSvgIconString(iconId, 14)}</span>
                    <span class="recent-name" title="${escapeHtml(path)}">${escapeHtml(name)}</span>
                    <span class="recent-path">${escapeHtml(path)}</span>
                    <button class="recent-remove" data-path="${escapeHtml(path)}" title="Удалить">${
                        makeSvgIconString('icon-close', 12)
                    }</button>
                </button>
            `;
        }

        el.recentList.innerHTML = html;

        el.recentList.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.recent-remove')) return;
                const path = item.dataset.path;
                if (path && path !== state.projectPath) {
                    closeDropdown(el.loadDropdown);
                    loadRecentProject(path);
                } else if (path === state.projectPath) {
                    showNotification('Этот проект уже открыт', 'info', 1500);
                }
            });
        });

        el.recentList.querySelectorAll('.recent-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = btn.dataset.path;
                if (path && window.projectManager) {
                    window.projectManager.removeRecentProject(path);
                    updateRecentProjects();
                    showNotification('Удалено из недавних', 'info', 1500);
                }
            });
        });
    }

    // ============================================================
    // UI ОБНОВЛЕНИЕ
    // ============================================================

    function updateUI() {
        const windowCount = window.layoutManager?.getWindowCount() || 0;
        const visibleCount = window.layoutManager?.getVisibleWindowCount() || 0;
        const hasWindows = windowCount > 0;

        if (el.projectNameDisplay) {
            const name = state.projectName || 'Untitled';
            const modified = state.isModified ? ' *' : '';
            el.projectNameDisplay.textContent = name + modified;
        }

        if (el.saveBtnLabel) {
            const modified = state.isModified && hasWindows;
            el.saveBtnLabel.textContent = modified ? 'Save *' : 'Save';
        }
        if (el.saveBtn) {
            const modified = state.isModified && hasWindows;
            el.saveBtn.style.borderColor = modified ? 'var(--accent-red)' : '';
            el.saveBtn.disabled = !hasWindows;
            el.saveBtn.style.opacity = hasWindows ? '1' : '0.4';
            el.saveBtn.style.cursor = hasWindows ? 'pointer' : 'default';
        }

        if (el.newProjectBtn) {
            el.newProjectBtn.disabled = !hasWindows;
            el.newProjectBtn.style.opacity = hasWindows ? '1' : '0.4';
            el.newProjectBtn.style.cursor = hasWindows ? 'pointer' : 'default';
        }

        if (el.newWindowBtn) {
            const maxed = visibleCount >= 4;
            el.newWindowBtn.disabled = maxed;
            el.newWindowBtn.style.opacity = maxed ? '0.4' : '1';
            el.newWindowBtn.style.cursor = maxed ? 'default' : 'pointer';
        }

        if (el.loadBtn) {
            el.loadBtn.disabled = false;
            el.loadBtn.style.opacity = '1';
            el.loadBtn.style.pointerEvents = '';
        }

        refreshIslandButtons();
        refreshHeaderCompact();
    }

    // ============================================================
    // ЗАПУСК
    // ============================================================

    function bootstrap() {
        try {
            const saved = localStorage.getItem(HEADER_COLLAPSE_KEY);
            if (saved === '1') document.body.classList.add('header-collapsed');
        } catch (e) {}

        init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

    // ============================================================
    // ГЛОБАЛЬНЫЙ ДОСТУП
    // ============================================================

    window.showNotification = showNotification;

    window.__lsystem = {
        state,
        updateUI,
        createWindow,
        populateWindowMenu,
        updateRecentProjects,
        showNotification,
        showErrorModal,
        showInfoModal,
        showConfirmModal,
        showUnsavedModal,
        showSaveModal,
        buildSnapshot,
        doHistoryUndo,
        doHistoryRedo,
        doHistoryJumpTo,
        updateHistoryButton: refreshHistoryButton,
        renderHistoryMenu,

        isHeaderCollapsed,
        setHeaderCollapsed,
        toggleHeaderCollapsed,
        refreshHeaderCompact,

        getAppState: () => window.appState,
        getHotkeyRegistry: () => window.hotkeyRegistry,
        getSettingsModal: () => window.settingsModal,
        getPluginSystem: () => window.pluginSystem,

        reloadPlugins: async () => {
            if (!window.pluginSystem) return false;
            await window.pluginSystem.reload();
            return true;
        },

        setThemeMode: (mode) => window.appState?.setThemeMode(mode),
        getThemeMode: () => window.appState?.getThemeMode(),
        getAutoThemeHours: () => window.appState?.getAutoThemeHours(),
        setAutoThemeHours: (cfg) => window.appState?.setAutoThemeHours(cfg)
    };

})();