// core/main/projects.js
// Версия 1.1.0

(function() {
    'use strict';

    var LsUI = window.LsUI || {};
    var LsHeader = window.LsHeader || {};
    var LsMenu = window.LsMenu || {};

    var IGNORED_LAYOUT_ACTIONS = { focus: true };

    var state = {
        projectPath: null,
        projectName: 'Untitled',
        isModified: false,
        isLoading: false,
        isSaving: false
    };

    var _busUnsubs = [];

    // ============================================================
    // 1. HELPERS
    // ============================================================

    function notify(message, type, duration) {
        if (LsUI && typeof LsUI.showNotification === 'function') {
            LsUI.showNotification(message, type || 'info', duration);
        }
    }

    function showError(title, message) {
        if (LsUI && typeof LsUI.showErrorModal === 'function') {
            LsUI.showErrorModal(title, message);
        }
    }

    function getFileName(path) {
        return String(path || '').split(/[\\/]/).pop() || String(path || '');
    }

    function refreshHeaderName() {
        if (LsHeader && typeof LsHeader.renderProjectName === 'function') {
            LsHeader.renderProjectName(state.projectName, state.isModified);
        }
    }

    function refreshActionButtons() {
        if (LsHeader && typeof LsHeader.refreshActionButtons === 'function') {
            LsHeader.refreshActionButtons();
        }
    }

    // ============================================================
    // 2. SNAPSHOT
    // ============================================================

    function buildSnapshot() {
        var snap = {
            slots: null,
            archive: null,
            counters: null,
            layout: null,
            layoutStyle: null
        };

        if (window.dataBus && typeof window.dataBus.exportSlots === 'function') {
            var s = window.dataBus.exportSlots();
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

    function applySnapshot(snapshot) {
        if (!snapshot) return;

        var hm = window.historyManager;
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

                setTimeout(function() {
                    try { window.layoutManager.resizeAll(); } catch (e) {}
                    if (LsMenu && LsMenu.renderHistoryMenu) {
                        var hd = document.getElementById('historyDropdown');
                        if (hd && hd.classList.contains('active')) {
                            LsMenu.renderHistoryMenu();
                        }
                    }
                    refreshActionButtons();
                }, 30);
            } else {
                var hd2 = document.getElementById('historyDropdown');
                if (hd2 && hd2.classList.contains('active') && LsMenu && LsMenu.renderHistoryMenu) {
                    LsMenu.renderHistoryMenu();
                }
                refreshActionButtons();
            }
        } catch (e) {
            console.error('[LsProjects] applySnapshot error:', e);
        } finally {
            setTimeout(function() {
                if (hm && typeof hm.endRestore === 'function') {
                    hm.endRestore();
                }
            }, 200);
        }
    }

    // ============================================================
    // 3. HISTORY
    // ============================================================

    function doHistoryUndo() {
        if (!window.historyManager) return;
        var result = window.historyManager.undo();
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function doHistoryRedo() {
        if (!window.historyManager) return;
        var result = window.historyManager.redo();
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function doHistoryJumpTo(index) {
        if (!window.historyManager) return;
        var result = window.historyManager.jumpTo(index);
        if (!result || !result.entry) return;
        applySnapshot(result.entry.snapshot);
    }

    function getTypeName(typeId) {
        if (!typeId) return 'Окно';
        var reg = window.__registry;
        if (reg && typeof reg.getType === 'function') {
            var cfg = reg.getType(typeId);
            if (cfg && cfg.name) return cfg.name;
        }
        return typeId;
    }

    function refreshHistoryButton() {
        var historyBtn = document.getElementById('historyBtn');
        if (!historyBtn || !window.historyManager) return;
        var total = window.historyManager.getSize();
        historyBtn.style.opacity = total === 0 ? '0.5' : '1';
    }

    function setupHistoryEvents() {
        if (!window.historyManager || !window.eventBus) return;

        var unsubLayoutAction = window.eventBus.on('layout-action', function(d) {
            if (!window.historyManager) return;
            if (window.historyManager.isRestoring && window.historyManager.isRestoring()) return;

            d = d || {};
            if (IGNORED_LAYOUT_ACTIONS[d.action]) return;

            var label;
            switch (d.action) {
                case 'add': {
                    var t = getTypeName(d.type);
                    var slot = d.slotId ? ' (' + d.slotId + ')' : '';
                    label = t + ' — добавлено' + slot;
                    break;
                }
                case 'remove': {
                    var t2 = getTypeName(d.type);
                    var slot2 = d.slotId ? ' (' + d.slotId + ')' : '';
                    label = t2 + ' — удалено' + slot2;
                    break;
                }
                case 'swap': label = 'Окна — перестановка'; break;
                case 'style': label = 'Layout — ' + (d.styleId || 'стиль'); break;
                case 'minimize': label = 'Свернуть: ' + getTypeName(d.type); break;
                case 'restore': label = 'Развернуть: ' + getTypeName(d.type); break;
                case 'fullscreen': label = 'Полный экран: ' + getTypeName(d.type); break;
                case 'fullscreen-exit': label = 'Выход из полного экрана: ' + getTypeName(d.type); break;
                default: return;
            }

            window.historyManager.record(label);
            refreshHistoryButton();
        });

        var unsubHistoryRecorded = window.eventBus.on('history-recorded', function() {
            var hd = document.getElementById('historyDropdown');
            if (hd && hd.classList.contains('active') && LsMenu && LsMenu.renderHistoryMenu) {
                LsMenu.renderHistoryMenu();
            }
            refreshHistoryButton();
        });

        var hmUnsub = window.historyManager.subscribe(function() {
            var hd = document.getElementById('historyDropdown');
            if (hd && hd.classList.contains('active') && LsMenu && LsMenu.renderHistoryMenu) {
                LsMenu.renderHistoryMenu();
            }
            refreshHistoryButton();
        });

        _busUnsubs.push(unsubLayoutAction);
        _busUnsubs.push(unsubHistoryRecorded);
        _busUnsubs.push(hmUnsub);

        refreshHistoryButton();
    }

    // ============================================================
    // 4. NEW PROJECT
    // ============================================================

    function handleNewProject() {
        if (!window.projectManager) {
            showError('Ошибка', 'ProjectManager не инициализирован');
            return;
        }

        var hasWindows = window.layoutManager && window.layoutManager.getWindowCount
            ? window.layoutManager.getWindowCount() > 0
            : false;
        var hasUnsaved = window.projectManager.isDirty() || state.isModified;

        if (hasUnsaved && hasWindows) {
            LsUI.showUnsavedModal('new', function(decision) {
                if (decision === true) {
                    handleSave().then(function(saved) {
                        if (saved) performNewProject();
                    });
                } else if (decision === false) {
                    performNewProject();
                }
            });
            return;
        }

        performNewProject();
    }

    function performNewProject() {
        if (window.layoutManager) {
            try {
                window.layoutManager.closeAll();
                window.layoutManager.loadDefaultState();
            } catch (e) {
                console.error('[LsProjects] performNewProject: layout reset error:', e);
            }
        }

        if (window.dataBus) {
            window.dataBus.clearAll();
            window.dataBus.markSaved();
        }

        if (window.projectManager) {
            window.projectManager.newProject({ force: true });
        }

        state.projectPath = null;
        state.projectName = 'Untitled';
        state.isModified = false;
        refreshHeaderName();

        if (window.historyManager) {
            window.historyManager.clear();
            window.historyManager.record('Начальное состояние');
        }

        if (LsMenu && LsMenu.populateWindowMenu) {
            LsMenu.populateWindowMenu();
        }

        refreshActionButtons();
        refreshHistoryButton();

        notify('Новый проект создан', 'success');
    }

    // ============================================================
    // 5. SAVE
    // ============================================================

    function handleSave() {
        return new Promise(function(resolve) {
            if (state.isSaving) { resolve(false); return; }

            if (!window.projectManager) {
                showError('Ошибка', 'ProjectManager не инициализирован');
                resolve(false);
                return;
            }

            var hasWindows = window.layoutManager && window.layoutManager.getWindowCount
                ? window.layoutManager.getWindowCount() > 0
                : false;

            if (!hasWindows) {
                notify('Нет окон для сохранения', 'warning');
                resolve(false);
                return;
            }

            if (state.projectPath) {
                resolve(doSave(state.projectPath));
                return;
            }

            LsUI.showSaveModal(state.projectName, function(projectName) {
                if (!projectName) { resolve(false); return; }

                var filename = projectName.endsWith('.lsp') ? projectName : projectName + '.lsp';
                resolve(doSave(filename));
            });
        });
    }

    function doSave(filename) {
        if (state.isSaving) return false;
        state.isSaving = true;

        try {
            var cleanName = String(filename).replace(/\.lsp$/i, '');

            var result = window.projectManager.saveProject({
                path: filename,
                name: cleanName,
                download: true
            });

            if (result) {
                state.isModified = false;
                state.projectPath = filename;
                state.projectName = cleanName;
                refreshHeaderName();
                if (LsMenu && LsMenu.renderRecentProjects) {
                    LsMenu.renderRecentProjects();
                }
                refreshActionButtons();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[LsProjects] Save error:', error);
            showError('Ошибка сохранения', error.message || 'Не удалось сохранить проект');
            return false;
        } finally {
            state.isSaving = false;
        }
    }

    // ============================================================
    // 6. LOAD
    // ============================================================

    function handleLoad() {
        if (state.isLoading) return Promise.resolve(false);
        state.isLoading = true;

        return new Promise(function(resolve) {
            if (!window.projectManager) {
                showError('Ошибка', 'ProjectManager не инициализирован');
                state.isLoading = false;
                resolve(false);
                return;
            }

            var hasWindows = window.layoutManager && window.layoutManager.getWindowCount
                ? window.layoutManager.getWindowCount() > 0
                : false;
            var hasUnsaved = window.projectManager.isDirty() || state.isModified;

            if (hasUnsaved && hasWindows) {
                LsUI.showUnsavedModal('load', function(decision) {
                    if (decision === true) {
                        handleSave().then(function(saved) {
                            if (saved) {
                                performLoad().then(function(loaded) {
                                    state.isLoading = false;
                                    resolve(loaded);
                                });
                            } else {
                                state.isLoading = false;
                                resolve(false);
                            }
                        });
                    } else if (decision === false) {
                        performLoad().then(function(loaded) {
                            state.isLoading = false;
                            resolve(loaded);
                        });
                    } else {
                        state.isLoading = false;
                        resolve(false);
                    }
                });
                return;
            }

            performLoad().then(function(loaded) {
                state.isLoading = false;
                resolve(loaded);
            });
        });
    }

    function performLoad() {
        return new Promise(function(resolve) {
            selectFile('.lsp,.json').then(function(file) {
                if (!file || !window.projectManager) {
                    resolve(false);
                    return;
                }

                window.projectManager.loadFromFile(file).then(function() {
                    state.projectPath = file.name;
                    state.projectName = getFileName(file.name)
                        .replace(/\.lsp$/i, '').replace(/\.json$/i, '');
                    state.isModified = false;
                    refreshHeaderName();
                    if (LsMenu && LsMenu.renderRecentProjects) {
                        LsMenu.renderRecentProjects();
                    }
                    setTimeout(function() {
                        if (window.layoutManager) window.layoutManager.resizeAll();
                        refreshActionButtons();
                    }, 200);
                    resolve(true);
                }).catch(function(error) {
                    console.error('[LsProjects] Load error:', error);
                    showError('Ошибка загрузки', error.message || 'Не удалось загрузить проект');
                    resolve(false);
                });
            });
        });
    }

    function selectFile(accept) {
        return new Promise(function(resolve) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = accept || '.lsp,.json';
            input.style.display = 'none';
            document.body.appendChild(input);

            var resolved = false;

            function finish(file) {
                if (resolved) return;
                resolved = true;
                input.remove();
                window.removeEventListener('focus', onFocus);
                resolve(file);
            }

            input.onchange = function() { finish(input.files && input.files[0] ? input.files[0] : null); };
            input.oncancel = function() { finish(null); };

            var onFocus = function() {
                setTimeout(function() {
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
    // 7. RECENT PROJECTS
    // ============================================================

    function loadRecentProject(path) {
        if (!path) return;

        if (!window.projectManager) {
            showError('Ошибка', 'ProjectManager не инициализирован');
            return;
        }

        var hasWindows = window.layoutManager && window.layoutManager.getWindowCount
            ? window.layoutManager.getWindowCount() > 0
            : false;
        var hasUnsaved = window.projectManager.isDirty() || state.isModified;

        if (hasUnsaved && hasWindows) {
            LsUI.showUnsavedModal('load', function(decision) {
                if (decision === true) {
                    handleSave().then(function(saved) {
                        if (saved) doLoadRecent(path);
                    });
                } else if (decision === false) {
                    doLoadRecent(path);
                }
            });
            return;
        }

        doLoadRecent(path);
    }

    function doLoadRecent(path) {
        try {
            var result = window.projectManager.loadProject(path);
            if (result) {
                state.projectPath = path;
                state.projectName = getFileName(path)
                    .replace(/\.lsp$/i, '').replace(/\.json$/i, '');
                state.isModified = false;
                refreshHeaderName();
                if (LsMenu && LsMenu.renderRecentProjects) {
                    LsMenu.renderRecentProjects();
                }
                setTimeout(function() {
                    if (window.layoutManager) window.layoutManager.resizeAll();
                    refreshActionButtons();
                }, 200);
                notify('Проект "' + state.projectName + '" загружен', 'success');
            } else {
                showError('Ошибка', 'Проект не найден или повреждён');
                if (window.projectManager) window.projectManager.removeRecentProject(path);
                if (LsMenu && LsMenu.renderRecentProjects) {
                    LsMenu.renderRecentProjects();
                }
            }

        } catch (error) {
            console.error('[LsProjects] Load recent error:', error);
            showError('Ошибка загрузки', error.message || 'Не удалось загрузить проект');
            if (window.projectManager) window.projectManager.removeRecentProject(path);
            if (LsMenu && LsMenu.renderRecentProjects) {
                LsMenu.renderRecentProjects();
            }
        }
    }

    // ============================================================
    // 8. PROJECT EVENTS
    // ============================================================

    function setupProjectEvents() {
        if (!window.eventBus) return;

        var unsubNew = window.eventBus.on('project-new', function() {
            if (window.layoutManager) {
                window.layoutManager.loadDefaultState();
                state.isModified = false;
                state.projectName = 'Untitled';
                state.projectPath = null;
                refreshHeaderName();

                if (LsMenu && LsMenu.populateWindowMenu) {
                    LsMenu.populateWindowMenu();
                }

                notify('Новый проект создан', 'success');

                if (window.historyManager) {
                    window.historyManager.clear();
                    window.historyManager.record('Начальное состояние');
                }
            }

            refreshActionButtons();
            refreshHistoryButton();
        });

        var unsubSaved = window.eventBus.on('project:saved', function(d) {
            d = d || {};
            var path = d.path || null;
            var name = d.name || state.projectName || 'Untitled';
            var downloaded = d.downloaded;

            state.projectPath = path;
            state.projectName = name;
            state.isModified = false;
            refreshHeaderName();
            if (LsMenu && LsMenu.renderRecentProjects) {
                LsMenu.renderRecentProjects();
            }

            if (downloaded) {
                notify('Проект "' + name + '" сохранён и выгружен', 'success');
            } else {
                notify('Автосохранение: "' + name + '"', 'info', 1500);
            }

            refreshActionButtons();
        });

        var unsubLoaded = window.eventBus.on('project:loaded', function(d) {
            d = d || {};
            state.projectPath = d.path || null;
            state.projectName = d.name || state.projectName || 'Untitled';
            state.isModified = false;
            refreshHeaderName();
            if (LsMenu && LsMenu.renderRecentProjects) {
                LsMenu.renderRecentProjects();
            }

            setTimeout(function() {
                if (window.layoutManager) window.layoutManager.resizeAll();

                if (window.historyManager) {
                    window.historyManager.clear();
                    window.historyManager.record('Проект загружен');
                }

                refreshActionButtons();
                refreshHistoryButton();
            }, 200);

            notify('Проект "' + state.projectName + '" загружен', 'success');
        });

        var unsubDirty = window.eventBus.on('project:dirty', function() {
            state.isModified = true;
            refreshHeaderName();
            refreshActionButtons();
        });

        var unsubLayoutChanged = window.eventBus.on('layout-changed', function() {
            var hasWindows = window.layoutManager && window.layoutManager.getWindowCount
                ? window.layoutManager.getWindowCount() > 0
                : false;

            if (hasWindows && window.projectManager) {
                window.projectManager._markDirty();
            }

            refreshActionButtons();

            setTimeout(function() {
                if (window.layoutManager) window.layoutManager.resizeAll();
            }, 50);
        });

        _busUnsubs.push(unsubNew);
        _busUnsubs.push(unsubSaved);
        _busUnsubs.push(unsubLoaded);
        _busUnsubs.push(unsubDirty);
        _busUnsubs.push(unsubLayoutChanged);
    }

    // ============================================================
    // 9. PUBLIC STATE
    // ============================================================

    function getState() {
        return {
            projectPath: state.projectPath,
            projectName: state.projectName,
            isModified: state.isModified,
            isLoading: state.isLoading,
            isSaving: state.isSaving
        };
    }

    function setState(patch) {
        if (!patch) return;
        if (patch.projectPath !== undefined) state.projectPath = patch.projectPath;
        if (patch.projectName !== undefined) state.projectName = patch.projectName;
        if (patch.isModified !== undefined) state.isModified = patch.isModified;
        refreshHeaderName();
        refreshActionButtons();
    }

    // ============================================================
    // 10. INIT
    // ============================================================

    function init() {
        LsUI = window.LsUI || {};
        LsHeader = window.LsHeader || {};
        LsMenu = window.LsMenu || {};

        setupProjectEvents();
        setupHistoryEvents();
        refreshHeaderName();
        refreshActionButtons();
    }

    function destroy() {
        for (var i = 0; i < _busUnsubs.length; i++) {
            try { _busUnsubs[i](); } catch (e) {}
        }
        _busUnsubs = [];
    }

    var api = {
        init: init,
        destroy: destroy,

        handleNewProject: handleNewProject,
        handleSave: handleSave,
        handleLoad: handleLoad,
        loadRecentProject: loadRecentProject,

        doHistoryUndo: doHistoryUndo,
        doHistoryRedo: doHistoryRedo,
        doHistoryJumpTo: doHistoryJumpTo,
        buildSnapshot: buildSnapshot,
        refreshHistoryButton: refreshHistoryButton,

        getState: getState,
        setState: setState
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined') {
        window.LsProjects = api;
    }

})();