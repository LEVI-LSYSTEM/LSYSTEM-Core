// index.js
// Версия 10.0.0 — EULA-гейт удалён полностью.
// - Нет gateApplication/ungateApplication, нет canUseApp-проверки.
// - Нет profile-ready, нет _isGated.
// - Профиль — просто имя/организация, не блокирует UI.
// - AppState.canUseApp() больше не используется.

(function() {
    'use strict';

    console.log('[LSYSTEM] Loading v10.0.0...');

    // ================================================================
    // 1. СОСТОЯНИЕ
    // ================================================================

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

    // ================================================================
    // 2. DOM ЭЛЕМЕНТЫ
    // ================================================================

    const el = {};

    function cacheElements() {
        el.workspace = document.getElementById('workspace');
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

    // ================================================================
    // 3. МОДАЛКИ
    // ================================================================

    function createModal({
        icon = '⚠️',
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

        const iconEl = document.createElement('div');
        Object.assign(iconEl.style, {
            fontSize: '48px',
            textAlign: 'center',
            marginBottom: '12px',
            display: 'block',
            lineHeight: '1'
        });
        iconEl.textContent = icon;

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

    // ================================================================
    // 4. УВЕДОМЛЕНИЯ
    // ================================================================

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

        const safeType = (type === 'success' || type === 'warning' || type === 'error')
            ? type
            : 'info';

        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%) translateY(20px)',
            background: 'var(--bg-panel, #1a1a1a)',
            border: '1px solid ' + (colors[safeType] || colors.info),
            borderRadius: '12px',
            padding: '12px 28px',
            color: 'var(--text-primary, #e0d8cc)',
            fontSize: '13px',
            fontWeight: '500',
            zIndex: '99998',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 0 30px ' + (colors[safeType] || colors.info) + '15',
            backdropFilter: 'blur(12px)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            maxWidth: '90%',
            textAlign: 'center',
            pointerEvents: 'none'
        });

        const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `<span style="margin-right:10px;">${icons[safeType] || 'ℹ️'}</span>${escapeHtml(String(message || ''))}`;
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

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ================================================================
    // 5. ИСТОРИЯ (UNDO / REDO)
    // ================================================================

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

        const undoBtn = makeHistoryActionButton('↶', 'Undo', 'Ctrl+Z', canUndo, () => {
            if (hm.canUndo()) doHistoryUndo();
        });
        const redoBtn = makeHistoryActionButton('↷', 'Redo', 'Ctrl+Y', canRedo, () => {
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

    function makeHistoryActionButton(icon, label, shortcut, enabled, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-action-btn';
        btn.disabled = !enabled;
        btn.title = `${label} (${shortcut})`;

        btn.innerHTML = `
            <span style="font-size:14px;line-height:1;">${icon}</span>
            <span>${label}</span>
        `;

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
            jumpBtn.textContent = '⇥';
            jumpBtn.title = `Перейти к состоянию #${entry.index}`;
            jumpBtn.setAttribute('role', 'button');
            jumpBtn.setAttribute('tabindex', '0');

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

    const IGNORED_LAYOUT_ACTIONS = new Set([
        'focus'
    ]);

    function setupHistoryEvents() {
        if (!window.historyManager) return;

        document.addEventListener('layout-action', (e) => {
            if (!window.historyManager) return;
            if (window.historyManager.isRestoring && window.historyManager.isRestoring()) return;

            const d = e.detail || {};

            if (IGNORED_LAYOUT_ACTIONS.has(d.action)) {
                return;
            }

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
                case 'swap':
                    label = 'Окна — перестановка';
                    break;
                case 'style':
                    label = `Layout — ${d.styleId || 'стиль'}`;
                    break;
                case 'minimize': {
                    const t = getTypeName(d.type);
                    label = `Свернуть: ${t}`;
                    break;
                }
                case 'restore': {
                    const t = getTypeName(d.type);
                    label = `Развернуть: ${t}`;
                    break;
                }
                case 'fullscreen': {
                    const t = getTypeName(d.type);
                    label = `Полный экран: ${t}`;
                    break;
                }
                case 'fullscreen-exit': {
                    const t = getTypeName(d.type);
                    label = `Выход из полного экрана: ${t}`;
                    break;
                }
                default:
                    return;
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

    // ================================================================
    // 6. МОДАЛКИ СОХРАНЕНИЯ / ЗАГРУЗКИ
    // ================================================================

    function showSaveModal(onSave) {
        const currentName = state.projectName || 'project';

        createModal({
            icon: '💾',
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
            icon: '💾',
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
            icon: '❓',
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
            icon: '❌',
            title: title,
            message: message,
            type: 'error',
            buttons: [{ label: 'OK', primary: true, action: () => {} }]
        });
    }

    function showInfoModal(title, message) {
        createModal({
            icon: 'ℹ️',
            title: title,
            message: message,
            type: 'info',
            buttons: [{ label: 'OK', action: () => {} }]
        });
    }

    // ================================================================
    // 7. ИНИЦИАЛИЗАЦИЯ
    // ================================================================

    async function init() {
        cacheElements();

        if (!el.workspace) {
            console.error('[LSYSTEM] ❌ Workspace not found!');
            return;
        }

        console.log('[LSYSTEM] ✅ Workspace found');

        if (window.__svgReady && typeof window.__svgReady.then === 'function') {
            try {
                await window.__svgReady;
                console.log('[LSYSTEM] ✅ SVG sprites ready');
            } catch (e) {
                console.warn('[LSYSTEM] SVG sprites not ready:', e);
            }
        }

        try {
            window.appState = new AppState({ debug: false });
            console.log('[LSYSTEM] ✅ AppState created');

            window.hotkeyRegistry = new HotkeyRegistry({ debug: false });
            console.log('[LSYSTEM] ✅ HotkeyRegistry created');

            window.messageBus = new MessageBus({ maxHistory: 100, debug: false });
            console.log('[LSYSTEM] ✅ MessageBus created');

            const registry = new WindowRegistry();
            registry.init();
            window.__registry = registry;
            console.log('[LSYSTEM] ✅ WindowRegistry created');

            window.dataBus = new DataBus({ debug: false });
            console.log('[LSYSTEM] ✅ DataBus created');

            window.eventBus = createEventBus();
            console.log('[LSYSTEM] ✅ EventBus created');

            window.pluginSystem = new PluginSystem({
                registry: registry,
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                messageBus: window.messageBus,
                appState: window.appState,
                windowPath: 'data/window/',
                enableWindowAutoLoad: true,
                enableGlobalScan: true,
                enableUserPlugins: false
            });
            await window.pluginSystem.loadAll();
            console.log('[LSYSTEM] ✅ PluginSystem loaded');

            window.layoutManager = new LayoutManager({
                workspace: el.workspace,
                maxWindows: 4,
                registry: registry,
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                messageBus: window.messageBus
            });
            window.layoutManager.init();
            console.log('[LSYSTEM] ✅ LayoutManager created');

            window.messageBus.setLayoutManager(window.layoutManager);
            console.log('[LSYSTEM] ✅ MessageBus bound to LayoutManager');

            window.hotkeyRegistry.attach(document);
            console.log('[LSYSTEM] ✅ HotkeyRegistry attached');

            setupGlobalHotkeys();

            window.settingsModal = new SettingsModal();
            console.log('[LSYSTEM] ✅ SettingsModal created');

            window.historyManager = new HistoryManager({
                maxHistory: 100,
                debug: false
            });
            window.historyManager.setSnapshotProvider(buildSnapshot);
            console.log('[LSYSTEM] ✅ HistoryManager created');

            window.projectManager = new ProjectManager({
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                layoutManager: window.layoutManager,
                autoSave: true,
                autoSaveInterval: 30000
            });
            console.log('[LSYSTEM] ✅ ProjectManager created');

            setupProjectEvents();
            setupUIEvents();
            setupHistoryEvents();
            setupTheme();

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

            console.log('[LSYSTEM] ✅ Initialized v10.0.0');
            console.log('[LSYSTEM] Registered types:', registry.getAllTypes().map(t => t.id));

        } catch (error) {
            console.error('[LSYSTEM] ❌ Initialization error:', error);
            showErrorModal('Ошибка инициализации', error.message || 'Не удалось запустить приложение');
        }
    }

    // ================================================================
    // 8. EVENT BUS
    // ================================================================

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

    // ================================================================
    // 9. ТЕМА
    // ================================================================

    function setupTheme() {
        if (el.logo) {
            el.logo.addEventListener('click', () => {
                const next = window.appState.toggleTheme();
                showNotification('Тема: ' + next, 'info', 1500);
            });
        }

        if (window.appState) {
            window.appState.subscribe('theme', (theme) => {
                console.log('[LSYSTEM] Theme changed:', theme,
                    '(mode:', window.appState.getThemeMode() + ')');
            });

            window.appState.subscribe('themeMode', (mode) => {
                console.log('[LSYSTEM] Theme mode:', mode);
            });
        }
    }

    // ================================================================
    // 10. ГЛОБАЛЬНЫЕ ХОТКЕИ
    // ================================================================

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
            'Escape':       () => {
                closeDropdown(el.loadDropdown);
                closeDropdown(el.newWindowDropdown);
                closeDropdown(el.historyDropdown);
            }
        };

        for (const [originalCombo, entry] of Object.entries(globalHotkeys)) {
            const handler = actions[originalCombo];
            if (!handler) continue;

            const combo = entry.combo || originalCombo;
            window.hotkeyRegistry.registerGlobal(combo, handler, { source: 'global' });
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

        console.log('[LSYSTEM] ✅ Global hotkeys registered');
    }

    // ================================================================
    // 11. ПРОЕКТНЫЕ СОБЫТИЯ
    // ================================================================

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

    // ================================================================
    // 12. UI СОБЫТИЯ
    // ================================================================

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
            if (el.loadDropdown && !el.loadDropdown.contains(e.target)) {
                closeDropdown(el.loadDropdown);
            }
            if (el.newWindowDropdown && !el.newWindowDropdown.contains(e.target)) {
                closeDropdown(el.newWindowDropdown);
            }
            if (el.historyDropdown && !el.historyDropdown.contains(e.target)) {
                closeDropdown(el.historyDropdown);
            }
        });

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.layoutManager) window.layoutManager.resizeAll();
            }, 150);
        });
    }

    // ================================================================
    // 13. DROPDOWN
    // ================================================================

    function closeAllTopbarDropdowns(except = null) {
        const dropdowns = [
            el.loadDropdown,
            el.newWindowDropdown,
            el.historyDropdown
        ];
        for (const dd of dropdowns) {
            if (dd && dd !== except) {
                dd.classList.remove('active');
            }
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

            if (element === el.loadDropdown) {
                updateRecentProjects();
            }
            if (element === el.newWindowDropdown) {
                populateWindowMenu();
            }
            if (element === el.historyDropdown) {
                renderHistoryMenu();
            }
        }
    }

    function closeDropdown(element) {
        if (!element) return;
        element.classList.remove('active');

        if (element === el.newWindowDropdown) {
            state.windowSearchQuery = '';
        }
    }

    // ================================================================
    // 14. НОВЫЙ ПРОЕКТ
    // ================================================================

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

    // ================================================================
    // 15. СОХРАНЕНИЕ
    // ================================================================

    function handleSave() {
        return new Promise((resolve) => {
            if (state.isSaving) {
                resolve(false);
                return;
            }

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
                if (!projectName) {
                    resolve(false);
                    return;
                }

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

    // ================================================================
    // 16. ЗАГРУЗКА
    // ================================================================

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

            input.onchange = () => {
                const file = input.files?.[0] || null;
                finish(file);
            };

            input.oncancel = () => {
                finish(null);
            };

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

    // ================================================================
    // 17. НЕДАВНИЕ ПРОЕКТЫ
    // ================================================================

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
                if (window.projectManager) {
                    window.projectManager.removeRecentProject(path);
                }
                updateRecentProjects();
            }
        } catch (error) {
            console.error('[LSYSTEM] Load recent error:', error);
            showErrorModal('Ошибка загрузки', error.message || 'Не удалось загрузить проект');
            if (window.projectManager) {
                window.projectManager.removeRecentProject(path);
            }
            updateRecentProjects();
        } finally {
            state.isLoading = false;
        }
    }

    // ================================================================
    // 18. МЕНЮ "WINDOWS"
    // ================================================================

    function populateWindowMenu() {
        if (!el.windowTypeMenu) return;

        const registry = window.__registry;
        if (!registry) {
            el.windowTypeMenu.innerHTML = '<div style="padding:8px 12px;color:var(--text-muted);font-size:11px;text-align:center;">Реестр не инициализирован</div>';
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
            html += `<div class="window-menu__section">📌 Свёрнутые <span class="window-menu__count">${visibleMinimized.length}</span></div>`;

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
            const arrow = isCollapsed ? '▶' : '▼';

            html += `
                <button type="button" class="window-menu__group-header" data-group-toggle="${escapeHtml(groupName)}">
                    <span class="window-menu__group-arrow">${arrow}</span>
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
                if (arrow) arrow.textContent = isCollapsed ? '▶' : '▼';
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
        const isSvg = type.icon && typeof type.icon === 'string' && type.icon.startsWith('icon-');
        const icon = isSvg
            ? `<svg class="icon-svg window-menu__icon"><use href="#${type.icon}"></use></svg>`
            : `<span class="window-menu__icon window-menu__icon--emoji">${escapeHtml(type.icon || '📄')}</span>`;

        return `<button class="window-menu__item" data-type="${escapeHtml(type.id)}">${icon}<span class="window-menu__label">${escapeHtml(type.name)}</span></button>`;
    }

    function renderMinimizedItem(w) {
        const isSvg = w.icon && typeof w.icon === 'string' && w.icon.startsWith('icon-');
        const icon = isSvg
            ? `<svg class="icon-svg window-menu__icon"><use href="#${w.icon}"></use></svg>`
            : `<span class="window-menu__icon window-menu__icon--emoji">${escapeHtml(w.icon || '📄')}</span>`;

        return `<button class="window-menu__item window-menu__item--minimized" data-minimized-id="${escapeHtml(String(w.id))}">${icon}<span class="window-menu__label">${escapeHtml(w.title || ('#' + w.id))}</span><span class="window-menu__id">#${escapeHtml(String(w.id))}</span></button>`;
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

    function cssEscape(s) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(s);
        }
        return String(s).replace(/([^\w-])/g, '\\$1');
    }

    // ================================================================
    // 19. СОЗДАНИЕ ОКНА
    // ================================================================

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

    // ================================================================
    // 20. НЕДАВНИЕ ПРОЕКТЫ (UI)
    // ================================================================

    function updateRecentProjects() {
        if (!el.recentList) return;

        const recent = window.projectManager?.getRecentProjects() || [];

        if (recent.length === 0) {
            el.recentList.innerHTML = '<div style="padding:8px 16px;color:var(--text-muted);font-size:11px;text-align:center;">Нет недавних проектов</div>';
            return;
        }

        let html = '';
        for (const path of recent) {
            const name = path.split('/').pop() || path;
            const isActive = path === state.projectPath;
            html += `
                <button class="recent-item" data-path="${escapeHtml(path)}" style="${isActive ? 'border-left-color:var(--accent-red);background:var(--bg-hover);' : ''}">
                    <span class="recent-icon">${isActive ? '●' : '📄'}</span>
                    <span class="recent-name" title="${escapeHtml(path)}">${escapeHtml(name)}</span>
                    <span class="recent-path">${escapeHtml(path)}</span>
                    <button class="recent-remove" data-path="${escapeHtml(path)}" title="Удалить">✕</button>
                </button>
            `;
        }

        el.recentList.innerHTML = html;

        el.recentList.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('recent-remove')) return;
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

    // ================================================================
    // 21. UI ОБНОВЛЕНИЕ
    // ================================================================

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
    }

    // ================================================================
    // 22. ЗАПУСК
    // ================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ================================================================
    // 23. ГЛОБАЛЬНЫЙ ДОСТУП
    // ================================================================

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

        getAppState: () => window.appState,
        getHotkeyRegistry: () => window.hotkeyRegistry,
        getSettingsModal: () => window.settingsModal,

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

    console.log('[LSYSTEM] App ready v10.0.0');

})();