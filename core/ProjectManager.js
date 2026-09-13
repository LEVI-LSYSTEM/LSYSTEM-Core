// core/ProjectManager.js
// Версия 4.2.0 - Feature: importFromJSON(json) для cloud-sync
// - importFromJSON(dataOrString) — импорт без файла
// - saveProject/loadProject/_importProject/_migrateProject — без изменений
// - Auto-save / recent projects — без изменений

(function() {
    'use strict';

    console.log('[ProjectManager] Loading v4.2.0...');

    var STORAGE_KEYS = {
        PROJECT_DATA: 'lsystem_project_data',
        RECENT_PROJECTS: 'lsystem_recent_projects',
        LAST_PROJECT: 'lsystem_last_project'
    };

    var PROJECT_FORMAT_VERSION = '4.2.0';

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================

    function sanitizeFilename(name) {
        if (!name) return 'project.lsp';
        return String(name)
            .replace(/[\/\\:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function ensureLspExtension(name) {
        if (!name) return 'project.lsp';
        return /\.lsp$/i.test(name) ? name : (name + '.lsp');
    }

    function stripLspExtension(name) {
        if (!name) return 'Untitled';
        return String(name).replace(/\.lsp$/i, '').replace(/\.json$/i, '');
    }

    // ============================================================
    // КЛАСС
    // ============================================================

    class ProjectManager {
        constructor(options = {}) {
            this._listeners = {};

            this._dataBus = options.dataBus || null;
            this._eventBus = options.eventBus || null;
            this._layoutManager = options.layoutManager || null;

            this._projectPath = null;
            this._projectName = 'Untitled';
            this._isDirty = false;
            this._projectMetadata = {};
            this._created = null;

            this._autoSaveTimer = null;
            this._autoSaveInterval = options.autoSaveInterval || 30000;

            if (options.autoSave !== false) {
                this._startAutoSave();
            }

            if (this._dataBus && typeof document !== 'undefined') {
                document.addEventListener('data-changed', () => {
                    this._markDirty();
                });
            }

            console.log('[ProjectManager] Initialized v4.2.0');
        }

        // ============================================================
        // 0. ПРИВЯЗКА LAYOUTMANAGER
        // ============================================================

        setLayoutManager(layoutManager) {
            this._layoutManager = layoutManager;
        }

        // ============================================================
        // 1. СОХРАНЕНИЕ ПРОЕКТА (.lsp)
        // ============================================================

        saveProject(options = {}) {
            if (!this._dataBus) {
                console.error('[ProjectManager] DataBus not available');
                return false;
            }

            if (options.path !== undefined) {
                this._projectPath = options.path ? String(options.path) : null;
            }
            if (options.name !== undefined) {
                this._projectName = options.name ? String(options.name) : 'Untitled';
            }

            if (!this._projectPath) {
                return this.saveProjectAs(options);
            }

            const download = options.download !== false;

            try {
                const layoutData = this._getLayoutData();
                const layoutStyle = this._getLayoutStyle();

                const slotsData = this._dataBus.exportSlots();

                const projectData = {
                    version: PROJECT_FORMAT_VERSION,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        name: this._projectName,
                        path: this._projectPath,
                        created: this._created || new Date().toISOString(),
                        modified: new Date().toISOString(),
                        ...this._projectMetadata
                    },
                    layout: layoutData,
                    layoutStyle: layoutStyle,
                    slots: slotsData.slots,
                    archive: slotsData.archive,
                    counters: slotsData.counters
                };

                const json = JSON.stringify(projectData, null, 2);

                localStorage.setItem(STORAGE_KEYS.PROJECT_DATA, json);
                this._addRecentProject(this._projectPath);

                if (download) {
                    this._downloadFile(json, this._projectPath);
                }

                this._isDirty = false;
                if (this._dataBus) {
                    this._dataBus.markSaved();
                }

                console.log('[ProjectManager] Project saved:', this._projectPath,
                    download ? '(downloaded)' : '(local only)');

                this._notify('saved', {
                    path: this._projectPath,
                    name: this._projectName,
                    downloaded: download
                });
                return true;
            } catch (error) {
                console.error('[ProjectManager] Save error:', error);
                this._notify('save-error', { error: error.message });
                return false;
            }
        }

        _downloadFile(content, filename) {
            try {
                const safeName = sanitizeFilename(ensureLspExtension(filename));

                const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = safeName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                console.error('[ProjectManager] Download error:', error);
                throw error;
            }
        }

        saveProjectAs() {
            console.warn('[ProjectManager] saveProjectAs: no _projectPath — use saveProject({ path })');
            return false;
        }

        _getLayoutData() {
            if (this._layoutManager && typeof this._layoutManager.getProjectData === 'function') {
                return this._layoutManager.getProjectData();
            }

            this._layoutData = null;
            const event = new CustomEvent('project-get-layout', {
                detail: {
                    respond: (data) => { this._layoutData = data; }
                },
                bubbles: true
            });
            if (typeof document !== 'undefined') {
                document.dispatchEvent(event);
            }
            return this._layoutData || null;
        }

        _getLayoutStyle() {
            if (this._layoutManager && typeof this._layoutManager.getCurrentStyle === 'function') {
                return this._layoutManager.getCurrentStyle();
            }

            this._layoutStyle = null;
            const event = new CustomEvent('project-get-layout-style', {
                detail: {
                    respond: (style) => { this._layoutStyle = style; }
                },
                bubbles: true
            });
            if (typeof document !== 'undefined') {
                document.dispatchEvent(event);
            }
            return this._layoutStyle || 'four-grid-2x2';
        }

        // ============================================================
        // 2. ЗАГРУЗКА ПРОЕКТА (.lsp)
        // ============================================================

        loadFromFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        const result = this._importProject(data);
                        if (result) {
                            this._projectPath = file.name;
                            this._projectName = stripLspExtension(file.name);
                            this._addRecentProject(file.name);
                            this._isDirty = false;
                            if (this._dataBus) {
                                this._dataBus.markSaved();
                            }
                            this._notify('loaded', {
                                path: file.name,
                                name: this._projectName
                            });
                            resolve(true);
                        } else {
                            reject(new Error('Failed to import project'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });
        }

        /**
         * ✅ v4.2.0: импорт проекта из JSON-строки или объекта.
         * Для cloud-sync, paste, drag&drop файла без <input type=file>.
         *
         * @param {string|object} dataOrString — JSON-строка или распарсенный объект
         * @param {object} [options]
         * @param {string} [options.path] — путь проекта (опционально)
         * @param {string} [options.name] — имя проекта (опционально)
         * @returns {boolean}
         */
        importFromJSON(dataOrString, options = {}) {
            if (!dataOrString) {
                console.error('[ProjectManager] importFromJSON: empty input');
                return false;
            }

            let parsed;
            if (typeof dataOrString === 'string') {
                try {
                    parsed = JSON.parse(dataOrString);
                } catch (e) {
                    console.error('[ProjectManager] importFromJSON: invalid JSON string', e);
                    return false;
                }
            } else if (typeof dataOrString === 'object') {
                parsed = dataOrString;
            } else {
                console.error('[ProjectManager] importFromJSON: expected string or object');
                return false;
            }

            try {
                const result = this._importProject(parsed);
                if (!result) return false;

                // Устанавливаем метаданные проекта
                if (options.path !== undefined) {
                    this._projectPath = options.path ? String(options.path) : null;
                }
                if (options.name !== undefined) {
                    this._projectName = options.name ? String(options.name) : 'Untitled';
                } else if (parsed.metadata && parsed.metadata.name) {
                    this._projectName = String(parsed.metadata.name);
                }

                this._isDirty = false;
                if (this._dataBus) {
                    this._dataBus.markSaved();
                }

                this._notify('loaded', {
                    path: this._projectPath,
                    name: this._projectName,
                    source: 'json'
                });

                console.log('[ProjectManager] Project imported from JSON:', this._projectName);
                return true;
            } catch (error) {
                console.error('[ProjectManager] importFromJSON error:', error);
                return false;
            }
        }

        loadProject(path) {
            try {
                const data = localStorage.getItem(STORAGE_KEYS.PROJECT_DATA);
                if (!data) return false;

                const project = JSON.parse(data);
                const result = this._importProject(project);

                if (result) {
                    this._projectPath = path;
                    this._projectName = stripLspExtension(String(path).split('/').pop());
                    this._isDirty = false;
                    if (this._dataBus) {
                        this._dataBus.markSaved();
                    }
                    localStorage.setItem(STORAGE_KEYS.LAST_PROJECT, path);
                    this._addRecentProject(path);
                    this._notify('loaded', {
                        path: path,
                        name: this._projectName
                    });
                    return true;
                }
                return false;
            } catch (error) {
                console.error('[ProjectManager] Load error:', error);
                return false;
            }
        }

        _loadLastProject() {
            try {
                const lastProject = localStorage.getItem(STORAGE_KEYS.LAST_PROJECT);
                if (!lastProject) return false;

                const data = localStorage.getItem(STORAGE_KEYS.PROJECT_DATA);
                if (!data) return false;

                const project = JSON.parse(data);
                const result = this._importProject(project);

                if (!result) return false;

                this._projectPath = lastProject;
                this._projectName = stripLspExtension(String(lastProject).split('/').pop());
                this._isDirty = false;
                if (this._dataBus) {
                    this._dataBus.markSaved();
                }

                console.log('[ProjectManager] Loaded last project:', lastProject);
                return true;
            } catch (error) {
                console.error('[ProjectManager] Error loading last project:', error);
                return false;
            }
        }

        loadLastProject() {
            return this._loadLastProject();
        }

        _importProject(data) {
            if (!data || typeof data !== 'object') {
                console.error('[ProjectManager] Invalid project data');
                return false;
            }

            if (!this._dataBus) {
                console.error('[ProjectManager] DataBus not available');
                return false;
            }

            try {
                const migrated = this._migrateProject(data);

                if (migrated.metadata) {
                    this._projectMetadata = { ...migrated.metadata };
                    this._projectName = migrated.metadata.name || 'Untitled';
                    this._created = migrated.metadata.created || new Date().toISOString();

                    if (migrated.metadata.theme) {
                        if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', migrated.metadata.theme);
                        }
                    }
                }

                const slotsPayload = {
                    slots: migrated.slots || {},
                    archive: migrated.archive || {},
                    counters: migrated.counters || {}
                };

                const slotsResult = this._dataBus.importSlots(slotsPayload);
                if (!slotsResult) {
                    console.error('[ProjectManager] Failed to import slots');
                    return false;
                }

                if (migrated.layout && this._layoutManager) {
                    this._layoutManager.loadProjectData(migrated.layout);
                    if (migrated.layoutStyle) {
                        this._layoutManager.currentLayoutStyle = migrated.layoutStyle;
                    }
                    this._layoutManager.render();
                    if (typeof this._layoutManager._scheduleResize === 'function') {
                        this._layoutManager._scheduleResize();
                    }
                } else if (migrated.layout && typeof document !== 'undefined') {
                    const event = new CustomEvent('project-restore-layout', {
                        detail: {
                            layoutData: migrated.layout,
                            layoutStyle: migrated.layoutStyle || 'four-grid-2x2'
                        },
                        bubbles: true
                    });
                    document.dispatchEvent(event);
                }

                this._isDirty = false;
                if (this._dataBus) {
                    this._dataBus.markSaved();
                }

                this._notify('imported', { name: this._projectName });
                console.log('[ProjectManager] Project imported successfully');
                return true;
            } catch (error) {
                console.error('[ProjectManager] Import error:', error);
                return false;
            }
        }

        _migrateProject(data) {
            if (data.slots && typeof data.slots === 'object') {
                return data;
            }

            if (data.windows && typeof data.windows === 'object') {
                console.log('[ProjectManager] Migrating .lsp v3.x → v4.2.0');

                const slots = {};
                const archive = {};
                const counters = {};

                for (const [windowId, windowData] of Object.entries(data.windows)) {
                    const typeId = windowData.type || 'unknown';
                    const slotId = String(windowId);

                    slots[slotId] = {
                        id: slotId,
                        type: typeId,
                        metadata: windowData.metadata || {},
                        data: windowData.data !== undefined ? windowData.data : null,
                        uiState: windowData.uiState || {},
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        archivedAt: null
                    };

                    const match = slotId.match(/-(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (!counters[typeId] || num > counters[typeId]) {
                            counters[typeId] = num;
                        }
                    } else {
                        counters[typeId] = (counters[typeId] || 0) + 1;
                    }
                }

                const migratedLayout = this._migrateLayout(data.layout);

                return {
                    version: PROJECT_FORMAT_VERSION,
                    timestamp: data.timestamp || new Date().toISOString(),
                    metadata: data.metadata || {},
                    layout: migratedLayout,
                    layoutStyle: data.layoutStyle || 'four-grid-2x2',
                    slots: slots,
                    archive: archive,
                    counters: counters
                };
            }

            return data;
        }

        _migrateLayout(layoutData) {
            if (!layoutData || !layoutData.layout) return layoutData;

            const migrateNode = (node) => {
                if (!node) return node;

                if (node.type === 'leaf' && node.windowData) {
                    if (!node.windowData.slotId) {
                        node.windowData.slotId = String(node.windowData.id);
                    }
                }

                if (node.children && Array.isArray(node.children)) {
                    node.children = node.children.map(migrateNode);
                }

                return node;
            };

            return {
                ...layoutData,
                layout: migrateNode(layoutData.layout)
            };
        }

        // ============================================================
        // 3. УПРАВЛЕНИЕ ПРОЕКТОМ
        // ============================================================

        newProject(options = {}) {
            if (this._isDirty && !options.force) {
                console.warn('[ProjectManager] newProject called with unsaved changes');
            }

            this._projectPath = null;
            this._projectName = 'Untitled';
            this._isDirty = false;
            this._created = new Date().toISOString();
            this._projectMetadata = {};

            if (this._dataBus) {
                this._dataBus.clearAll();
                this._dataBus.markSaved();
            }

            if (typeof document !== 'undefined') {
                const event = new CustomEvent('project-new', {
                    detail: { name: this._projectName },
                    bubbles: true
                });
                document.dispatchEvent(event);
            }

            this._notify('new', { name: this._projectName });
            console.log('[ProjectManager] New project created');
            return true;
        }

        getProjectData() {
            if (!this._dataBus) return null;

            const layoutData = this._getLayoutData();
            const layoutStyle = this._getLayoutStyle();
            const slotsData = this._dataBus.exportSlots();

            return {
                version: PROJECT_FORMAT_VERSION,
                timestamp: new Date().toISOString(),
                metadata: {
                    name: this._projectName,
                    path: this._projectPath,
                    created: this._created || new Date().toISOString(),
                    modified: new Date().toISOString(),
                    ...this._projectMetadata
                },
                layout: layoutData,
                layoutStyle: layoutStyle,
                slots: slotsData.slots,
                archive: slotsData.archive,
                counters: slotsData.counters
            };
        }

        /**
         * ✅ v4.2.0: экспорт проекта как JSON-строки (без сохранения в файл).
         */
        exportToJSON() {
            const data = this.getProjectData();
            if (!data) return null;
            try {
                return JSON.stringify(data, null, 2);
            } catch (e) {
                console.error('[ProjectManager] exportToJSON error:', e);
                return null;
            }
        }

        loadProjectData(data) {
            return this._importProject(data);
        }

        clearAll() {
            if (this._dataBus) {
                this._dataBus.clearAll();
            }
            this._projectPath = null;
            this._projectName = 'Untitled';
            this._isDirty = false;
            this._projectMetadata = {};
        }

        // ============================================================
        // 4. НЕДАВНИЕ ПРОЕКТЫ
        // ============================================================

        getRecentProjects() {
            try {
                const data = localStorage.getItem(STORAGE_KEYS.RECENT_PROJECTS);
                return data ? JSON.parse(data) : [];
            } catch (error) {
                return [];
            }
        }

        _addRecentProject(path) {
            try {
                let recent = this.getRecentProjects();
                recent = recent.filter(p => p !== path);
                recent.unshift(path);
                if (recent.length > 20) {
                    recent = recent.slice(0, 20);
                }
                localStorage.setItem(STORAGE_KEYS.RECENT_PROJECTS, JSON.stringify(recent));
                localStorage.setItem(STORAGE_KEYS.LAST_PROJECT, path);
                this._notify('recent-projects-updated', { recent });
            } catch (error) {
                console.error('[ProjectManager] Error adding recent project:', error);
            }
        }

        removeRecentProject(path) {
            try {
                let recent = this.getRecentProjects();
                recent = recent.filter(p => p !== path);
                localStorage.setItem(STORAGE_KEYS.RECENT_PROJECTS, JSON.stringify(recent));

                const last = localStorage.getItem(STORAGE_KEYS.LAST_PROJECT);
                if (last === path) {
                    localStorage.removeItem(STORAGE_KEYS.LAST_PROJECT);
                }

                this._notify('recent-projects-updated', { recent });
            } catch (error) {
                console.error('[ProjectManager] Error removing recent project:', error);
            }
        }

        // ============================================================
        // 5. АВТОСОХРАНЕНИЕ
        // ============================================================

        _markDirty() {
            this._isDirty = true;
            this._notify('dirty', { isDirty: true });
        }

        isDirty() {
            return this._isDirty;
        }

        markDirty() {
            this._markDirty();
        }

        _startAutoSave() {
            if (this._autoSaveTimer) {
                clearInterval(this._autoSaveTimer);
            }

            this._autoSaveTimer = setInterval(() => {
                if (this._isDirty && this._projectPath) {
                    console.log('[ProjectManager] Auto-saving...');
                    this.saveProject({ download: false });
                }
            }, this._autoSaveInterval);
        }

        _stopAutoSave() {
            if (this._autoSaveTimer) {
                clearInterval(this._autoSaveTimer);
                this._autoSaveTimer = null;
            }
        }

        // ============================================================
        // 6. GETTERS
        // ============================================================

        getProjectPath() { return this._projectPath; }
        getProjectName() { return this._projectName; }
        getProjectMetadata() { return { ...this._projectMetadata }; }

        // ============================================================
        // 7. СОБЫТИЯ
        // ============================================================

        _notify(event, data) {
            if (this._listeners[event]) {
                this._listeners[event].forEach(cb => {
                    try { cb(data); } catch (e) {
                        console.error('[ProjectManager] Listener error:', e);
                    }
                });
            }

            if (typeof document !== 'undefined') {
                const customEvent = new CustomEvent('project-' + event, {
                    detail: data,
                    bubbles: true
                });
                document.dispatchEvent(customEvent);
            }
        }

        on(event, callback) {
            if (!this._listeners[event]) {
                this._listeners[event] = [];
            }
            this._listeners[event].push(callback);
            return () => this.off(event, callback);
        }

        off(event, callback) {
            if (!this._listeners[event]) return;
            const index = this._listeners[event].indexOf(callback);
            if (index !== -1) {
                this._listeners[event].splice(index, 1);
            }
        }

        // ============================================================
        // 8. УНИЧТОЖЕНИЕ
        // ============================================================

        destroy() {
            this._stopAutoSave();
            this._listeners = {};
            console.log('[ProjectManager] Destroyed');
        }
    }

    // ============================================================
    // 9. ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ProjectManager, STORAGE_KEYS };
    }

    if (typeof window !== 'undefined') {
        window.ProjectManager = ProjectManager;
        window.STORAGE_KEYS = STORAGE_KEYS;
        console.log('[ProjectManager] Registered globally v4.2.0');
    }

})();