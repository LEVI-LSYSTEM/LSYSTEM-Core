// core/main/index.js
// Версия 1.2.0

(function() {
    'use strict';

    var LsUI = null;
    var LsHeader = null;
    var LsDropdowns = null;
    var LsMenu = null;
    var LsProjects = null;

    // ============================================================
    // 1. WINDOW CREATION
    // ============================================================

    function createWindow(type) {
        if (!window.layoutManager) {
            if (LsUI) LsUI.showErrorModal('Ошибка', 'LayoutManager не инициализирован');
            return;
        }

        var registry = window.__registry;
        var typeConfig = registry && registry.getType ? registry.getType(type) : null;

        if (!typeConfig) {
            if (LsUI) LsUI.showErrorModal('Ошибка', 'Тип окна "' + type + '" не найден');
            return;
        }

        if (window.layoutManager.getVisibleWindowCount() >= 4) {
            if (LsUI) LsUI.showNotification('Максимум 4 видимых окна', 'warning');
            return;
        }

        var result = window.layoutManager.addWindow(type, typeConfig.name, typeConfig.icon);

        if (result) {
            if (window.projectManager) {
                window.projectManager._markDirty();
            }

            if (LsProjects) {
                LsProjects.setState({ isModified: true });
            }

            setTimeout(function() {
                if (window.layoutManager) window.layoutManager.resizeAll();
                if (LsHeader && LsHeader.refreshActionButtons) {
                    LsHeader.refreshActionButtons();
                }
            }, 100);

            if (LsUI) {
                LsUI.showNotification('Окно "' + typeConfig.name + '" создано', 'success');
            }
        } else {
            if (LsUI) {
                LsUI.showErrorModal('Ошибка', 'Не удалось создать окно "' + typeConfig.name + '"');
            }
        }
    }

    // ============================================================
    // 2. GLOBAL HOTKEYS
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

        var globalHotkeys = window.appState.getGlobalHotkeys();

        var actions = {
            'Ctrl+Z': function() {
                if (window.historyManager && window.historyManager.canUndo() && LsProjects) {
                    LsProjects.doHistoryUndo();
                }
            },
            'Ctrl+Shift+Z': function() {
                if (window.historyManager && window.historyManager.canRedo() && LsProjects) {
                    LsProjects.doHistoryRedo();
                }
            },
            'Ctrl+Y': function() {
                if (window.historyManager && window.historyManager.canRedo() && LsProjects) {
                    LsProjects.doHistoryRedo();
                }
            },
            'Ctrl+S': function() { if (LsProjects) LsProjects.handleSave(); },
            'Ctrl+O': function() { if (LsProjects) LsProjects.handleLoad(); },
            'Ctrl+N': function() { if (LsProjects) LsProjects.handleNewProject(); },
            'Ctrl+,': function() { if (window.settingsModal) window.settingsModal.toggle(); },
            'Ctrl+Shift+H': function() {
                if (LsHeader) LsHeader.toggleHeaderCollapsed();
            },
            'Escape': function() {
                if (!LsDropdowns) return;
                var els = LsDropdowns.getElements();
                LsDropdowns.closeDropdown(els.loadDropdown);
                LsDropdowns.closeDropdown(els.newWindowDropdown);
                LsDropdowns.closeDropdown(els.historyDropdown);
            }
        };

        for (var originalCombo in globalHotkeys) {
            if (!Object.prototype.hasOwnProperty.call(globalHotkeys, originalCombo)) continue;

            var entry = globalHotkeys[originalCombo];
            var effectiveOriginal = entry.original || originalCombo;
            var handler = actions[effectiveOriginal];
            if (!handler) continue;

            var combo = entry.combo || effectiveOriginal;
            window.hotkeyRegistry.registerGlobal(combo, handler, {
                source: 'global',
                original: effectiveOriginal
            });
        }

        if (window.layoutManager && window.layoutManager._windowInstances) {
            window.layoutManager._windowInstances.forEach(function(bw) {
                if (bw && typeof bw.registerHotkeys === 'function') {
                    try { bw.registerHotkeys(); } catch (e) {
                        console.warn('[LsMain] registerHotkeys error:', e);
                    }
                }
            });
        }
    }

    // ============================================================
    // 3. UI BUTTON BINDINGS
    // ============================================================

    function setupUIButtons() {
        var newProjectBtn = document.getElementById('newProjectBtn');
        var saveBtn = document.getElementById('saveBtn');
        var loadBtn = document.getElementById('loadBtn');
        var loadFromFileBtn = document.getElementById('loadFromFileBtn');
        var newWindowBtn = document.getElementById('newWindowBtn');
        var settingsBtn = document.getElementById('settingsBtn');
        var historyBtn = document.getElementById('historyBtn');

        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', function() {
                if (LsProjects) LsProjects.handleNewProject();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (LsProjects) LsProjects.handleSave();
            });
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (LsDropdowns) {
                    LsDropdowns.toggleDropdown(LsDropdowns.getElements().loadDropdown);
                }
            });
        }

        if (loadFromFileBtn) {
            loadFromFileBtn.addEventListener('click', function() {
                if (LsDropdowns) {
                    LsDropdowns.closeDropdown(LsDropdowns.getElements().loadDropdown);
                }
                if (LsProjects) LsProjects.handleLoad();
            });
        }

        if (newWindowBtn) {
            newWindowBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (LsDropdowns) {
                    LsDropdowns.toggleDropdown(LsDropdowns.getElements().newWindowDropdown);
                }
            });
        }

        if (settingsBtn) {
            settingsBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (LsDropdowns) {
                    LsDropdowns.closeAllTopbarDropdowns();
                }
                if (window.settingsModal) window.settingsModal.toggle();
            });
        }

        if (historyBtn) {
            historyBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!LsDropdowns) return;
                var hd = LsDropdowns.getElements().historyDropdown;
                LsDropdowns.toggleDropdown(hd);
                if (hd && hd.classList.contains('active') && LsMenu) {
                    LsMenu.renderHistoryMenu();
                }
            });
        }
    }

    // ============================================================
    // 4. WINDOW MENU CSS INJECTION
    // ============================================================

    function injectWindowMenuCSS() {
        if (document.getElementById('window-menu-styles')) return;

        var style = document.createElement('style');
        style.id = 'window-menu-styles';
        style.textContent = [
            '#windowTypeMenu {',
            '    padding: 0 !important;',
            '    overflow: hidden !important;',
            '    width: max-content !important;',
            '    min-width: 180px !important;',
            '    max-width: 340px !important;',
            '}',
            '.window-menu__search {',
            '    padding: 6px 8px 6px;',
            '    border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.08));',
            '    background: var(--bg-panel, #1a1a1a);',
            '}',
            '.window-menu__search-input {',
            '    display: block;',
            '    width: 100%;',
            '    padding: 5px 8px;',
            '    border-radius: 4px;',
            '    border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));',
            '    background: var(--bg-input, #2a2a2a);',
            '    color: var(--text-primary, #e0d8cc);',
            '    font-size: 11px;',
            '    font-family: inherit;',
            '    outline: none;',
            '    box-sizing: border-box;',
            '    transition: border-color 0.15s ease;',
            '}',
            '.window-menu__search-input:focus {',
            '    border-color: var(--accent-red, #cc2233);',
            '}',
            '.window-menu__scroll {',
            '    max-height: 380px;',
            '    overflow-y: auto;',
            '    overflow-x: hidden;',
            '    padding: 2px 0 4px;',
            '}',
            '.window-menu__scroll::-webkit-scrollbar { width: 6px; }',
            '.window-menu__scroll::-webkit-scrollbar-track { background: transparent; }',
            '.window-menu__scroll::-webkit-scrollbar-thumb {',
            '    background: rgba(200, 184, 154, 0.15);',
            '    border-radius: 3px;',
            '}',
            '.window-menu__scroll::-webkit-scrollbar-thumb:hover {',
            '    background: rgba(200, 184, 154, 0.3);',
            '}',
            '.window-menu__section {',
            '    display: flex;',
            '    align-items: center;',
            '    gap: 6px;',
            '    padding: 4px 10px 3px;',
            '    font-size: 9px;',
            '    font-weight: 700;',
            '    color: var(--text-muted, rgba(200, 184, 154, 0.5));',
            '    text-transform: uppercase;',
            '    letter-spacing: 0.5px;',
            '    border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.06));',
            '    margin-bottom: 2px;',
            '}',
            '.window-menu__section .icon-svg {',
            '    width: 10px;',
            '    height: 10px;',
            '    opacity: 0.7;',
            '}',
            '.window-menu__group-header {',
            '    display: flex;',
            '    align-items: center;',
            '    gap: 6px;',
            '    width: 100%;',
            '    padding: 4px 10px;',
            '    border: none;',
            '    background: transparent;',
            '    color: var(--text-secondary, #a09888);',
            '    font-size: 10px;',
            '    font-weight: 700;',
            '    font-family: inherit;',
            '    text-transform: uppercase;',
            '    letter-spacing: 0.4px;',
            '    cursor: pointer;',
            '    text-align: left;',
            '    transition: background 0.12s ease;',
            '}',
            '.window-menu__group-header:hover {',
            '    background: var(--bg-hover, rgba(40, 40, 40, 0.4));',
            '    color: var(--text-primary, #e0d8cc);',
            '}',
            '.window-menu__group-arrow {',
            '    display: inline-flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    flex-shrink: 0;',
            '    width: 12px;',
            '    height: 12px;',
            '    opacity: 0.7;',
            '}',
            '.window-menu__group-arrow .icon-svg {',
            '    width: 10px;',
            '    height: 10px;',
            '}',
            '.window-menu__group-name {',
            '    flex: 1;',
            '    min-width: 0;',
            '    overflow: hidden;',
            '    text-overflow: ellipsis;',
            '    white-space: nowrap;',
            '}',
            '.window-menu__count {',
            '    font-size: 9px;',
            '    font-weight: 500;',
            '    color: var(--text-muted, rgba(200, 184, 154, 0.35));',
            '    padding: 1px 5px;',
            '    border-radius: 8px;',
            '    background: rgba(200, 184, 154, 0.06);',
            '    flex-shrink: 0;',
            '    text-transform: none;',
            '    letter-spacing: 0;',
            '}',
            '.window-menu__item {',
            '    display: flex;',
            '    align-items: center;',
            '    gap: 8px;',
            '    width: 100%;',
            '    padding: 5px 10px 5px 12px;',
            '    border: none;',
            '    background: transparent;',
            '    color: var(--text-primary, #e0d8cc);',
            '    font-size: 12px;',
            '    font-family: inherit;',
            '    cursor: pointer;',
            '    text-align: left;',
            '    transition: background 0.12s ease;',
            '}',
            '.window-menu__item:hover {',
            '    background: var(--bg-hover, rgba(40, 40, 40, 0.5));',
            '}',
            '.window-menu__item--minimized .window-menu__label {',
            '    color: var(--text-secondary, #a09888);',
            '    font-style: italic;',
            '}',
            '.window-menu__icon {',
            '    width: 14px;',
            '    height: 14px;',
            '    flex-shrink: 0;',
            '    fill: currentColor;',
            '    opacity: 0.85;',
            '}',
            '.window-menu__label {',
            '    flex: 1;',
            '    min-width: 0;',
            '    overflow: hidden;',
            '    text-overflow: ellipsis;',
            '    white-space: nowrap;',
            '}',
            '.window-menu__id {',
            '    font-size: 9px;',
            '    color: var(--text-muted, rgba(200, 184, 154, 0.4));',
            '    flex-shrink: 0;',
            '    font-family: monospace;',
            '}',
            '.window-menu__empty {',
            '    padding: 16px 12px;',
            '    color: var(--text-muted, rgba(200, 184, 154, 0.5));',
            '    font-size: 11px;',
            '    text-align: center;',
            '}',
            '.window-menu__group-items { padding: 0; }',
            '.window-menu__group-items .window-menu__item { padding-left: 22px; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // ============================================================
    // 5. RESIZE DELEGATION
    // ============================================================

    function setupResizeHandling() {
        var resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                if (window.layoutManager) window.layoutManager.resizeAll();
            }, 150);
        });
    }

    // ============================================================
    // 6. BOOTSTRAP
    // ============================================================

    async function init() {
        LsUI = window.LsUI;
        LsHeader = window.LsHeader;
        LsDropdowns = window.LsDropdowns;
        LsMenu = window.LsMenu;
        LsProjects = window.LsProjects;

        var workspace = document.getElementById('workspace');
        if (!workspace) {
            console.error('[LsMain] Workspace not found');
            return;
        }

        if (window.__svgReady && typeof window.__svgReady.then === 'function') {
            try {
                await window.__svgReady;
            } catch (e) {
                console.warn('[LsMain] SVG sprites not ready:', e);
            }
        }

        try {
            window.eventBus = new EventBus({ debug: false });
            window.appState = new AppState({ debug: false });
            window.hotkeyRegistry = new HotkeyRegistry({ debug: false });
            window.messageBus = new MessageBus({ maxHistory: 100, debug: false });

            var registry = new WindowRegistry();
            registry.init();
            window.__registry = registry;

            window.dataBus = new DataBus({ debug: false });

            window.pluginSystem = new PluginSystem({
                registry: registry,
                eventBus: window.eventBus,
                appState: window.appState,
                debug: false
            });

            await window.pluginSystem.loadAll();

            window.layoutManager = new LayoutManager({
                workspace: workspace,
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
            if (LsProjects) {
                window.historyManager.setSnapshotProvider(LsProjects.buildSnapshot);
            }

            window.projectManager = new ProjectManager({
                dataBus: window.dataBus,
                eventBus: window.eventBus,
                layoutManager: window.layoutManager,
                autoSave: true,
                autoSaveInterval: 30000
            });

            if (LsProjects) LsProjects.init();
            if (LsHeader) LsHeader.init();
            if (LsDropdowns) LsDropdowns.init();
            if (LsMenu) LsMenu.init();

            setupUIButtons();
            setupResizeHandling();
            injectWindowMenuCSS();

            if (LsMenu && LsMenu.populateWindowMenu) {
                LsMenu.populateWindowMenu();
            }

            if (window.projectManager) {
                window.projectManager.loadLastProject();
            }

            if (LsHeader && LsHeader.renderProjectName) {
                LsHeader.renderProjectName('Untitled', false);
            }

            if (LsMenu && LsMenu.renderRecentProjects) {
                LsMenu.renderRecentProjects();
            }

            setTimeout(function() {
                if (window.layoutManager) {
                    window.layoutManager.resizeAll();
                }
                if (window.historyManager) {
                    window.historyManager.record('Начальное состояние');
                }
                if (LsHeader && LsHeader.refreshActionButtons) {
                    LsHeader.refreshActionButtons();
                }
            }, 300);

        } catch (error) {
            console.error('[LsMain] Initialization error:', error);
            if (LsUI && LsUI.showErrorModal) {
                LsUI.showErrorModal(
                    'Ошибка инициализации',
                    error.message || 'Не удалось запустить приложение'
                );
            }
        }
    }

    // ============================================================
    // 7. BOOTSTRAP ENTRY
    // ============================================================

    function bootstrap() {
        try {
            var saved = localStorage.getItem('lsystem-header-collapsed');
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
    // 8. GLOBAL API
    // ============================================================

    window.__lsystem = {
        createWindow: createWindow,

        getAppState: function() { return window.appState; },
        getHotkeyRegistry: function() { return window.hotkeyRegistry; },
        getSettingsModal: function() { return window.settingsModal; },
        getPluginSystem: function() { return window.pluginSystem; },
        getEventBus: function() { return window.eventBus; },
        getProjects: function() { return window.LsProjects; },
        getHeader: function() { return window.LsHeader; },
        getMenu: function() { return window.LsMenu; },
        getUI: function() { return window.LsUI; },

        showNotification: function(message, type, duration) {
            if (window.LsUI && typeof window.LsUI.showNotification === 'function') {
                return window.LsUI.showNotification(message, type, duration);
            }
        },

        showSaveModal: function(currentName, onSave) {
            if (window.LsUI && typeof window.LsUI.showSaveModal === 'function') {
                return window.LsUI.showSaveModal(currentName, onSave);
            }
        },

        showUnsavedModal: function(action, onConfirm) {
            if (window.LsUI && typeof window.LsUI.showUnsavedModal === 'function') {
                return window.LsUI.showUnsavedModal(action, onConfirm);
            }
        },

        showConfirmModal: function(title, message, onConfirm) {
            if (window.LsUI && typeof window.LsUI.showConfirmModal === 'function') {
                return window.LsUI.showConfirmModal(title, message, onConfirm);
            }
        },

        showErrorModal: function(title, message) {
            if (window.LsUI && typeof window.LsUI.showErrorModal === 'function') {
                return window.LsUI.showErrorModal(title, message);
            }
        },

        showInfoModal: function(title, message) {
            if (window.LsUI && typeof window.LsUI.showInfoModal === 'function') {
                return window.LsUI.showInfoModal(title, message);
            }
        },

        reloadPlugins: async function() {
            if (!window.pluginSystem) return false;
            await window.pluginSystem.reload();
            return true;
        },

        setThemeMode: function(mode) {
            return window.appState ? window.appState.setThemeMode(mode) : false;
        },
        getThemeMode: function() {
            return window.appState ? window.appState.getThemeMode() : null;
        },
        getAutoThemeHours: function() {
            return window.appState ? window.appState.getAutoThemeHours() : null;
        },
        setAutoThemeHours: function(cfg) {
            return window.appState ? window.appState.setAutoThemeHours(cfg) : false;
        },

        isHeaderCollapsed: function() {
            return LsHeader ? LsHeader.isHeaderCollapsed() : false;
        },
        toggleHeaderCollapsed: function() {
            if (LsHeader) LsHeader.toggleHeaderCollapsed();
        },

        refreshActionButtons: function() {
            if (LsHeader && LsHeader.refreshActionButtons) {
                LsHeader.refreshActionButtons();
            }
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createWindow: createWindow };
    }

    if (typeof window !== 'undefined') {
        window.LsMain = { createWindow: createWindow };
    }

})();