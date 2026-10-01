// core/ProjectManager.js
// Версия 5.2.0

(function() {
    'use strict';

    var STORAGE_KEYS = {
        PROJECT_DATA: 'lsystem_project_data',
        RECENT_PROJECTS: 'lsystem_recent_projects',
        LAST_PROJECT: 'lsystem_last_project'
    };

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

            this._busUnsubs = [];

            if (options.autoSave !== false) {
                this._startAutoSave();
            }

            if (this._dataBus && typeof document !== 'undefined') {
                var onDataChanged = () => {
                    this._markDirty();
                };
                document.addEventListener('data-changed', onDataChanged);
                this._busUnsubs.push(function() {
                    document.removeEventListener('data-changed', onDataChanged);
                });
            }
        }

        setLayoutManager(layoutManager) {
            this._layoutManager = layoutManager;
        }

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

            if (!data.slots || typeof data.slots !== 'object') {
                console.error('[ProjectManager] Invalid project format: missing slots');
                return false;
            }

            try {
                if (data.metadata) {
                    this._projectMetadata = { ...data.metadata };
                    this._projectName = data.metadata.name || 'Untitled';
                    this._created = data.metadata.created || new Date().toISOString();

                    if (data.metadata.theme) {
                        if (window.appState && typeof window.appState.setThemeMode === 'function') {
                            window.appState.setThemeMode(data.metadata.theme);
                        } else if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', data.metadata.theme);
                        }
                    }
                }

                const slotsPayload = {
                    slots: data.slots,
                    archive: data.archive || {},
                    counters: data.counters || {}
                };

                const slotsResult = this._dataBus.importSlots(slotsPayload);
                if (!slotsResult) {
                    console.error('[ProjectManager] Failed to import slots');
                    return false;
                }

                if (data.layout && this._layoutManager) {
                    this._layoutManager.loadProjectData(data.layout);
                    if (data.layoutStyle) {
                        this._layoutManager.currentLayoutStyle = data.layoutStyle;
                    }
                    this._layoutManager.render();
                    if (typeof this._layoutManager._scheduleResize === 'function') {
                        this._layoutManager._scheduleResize();
                    }
                } else if (data.layout && typeof document !== 'undefined') {
                    const event = new CustomEvent('project-restore-layout', {
                        detail: {
                            layoutData: data.layout,
                            layoutStyle: data.layoutStyle || 'four-grid-2x2'
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
                return true;
            } catch (error) {
                console.error('[ProjectManager] Import error:', error);
                return false;
            }
        }

        newProject(options = {}) {
            if (this._isDirty && !options.force) {
                console.warn('[ProjectManager] newProject called with unsaved changes');
            }

            this._projectPath = null;
            this._projectName = 'Untitled';
            this._isDirty = false;
            this._created = new Date().toISOString();
            this._projectMetadata = {};

            if (this._layoutManager) {
                try {
                    if (typeof this._layoutManager.closeAll === 'function') {
                        this._layoutManager.closeAll();
                    }
                    if (typeof this._layoutManager.loadDefaultState === 'function') {
                        this._layoutManager.loadDefaultState();
                    }
                } catch (e) {
                    console.error('[ProjectManager] newProject: layout reset error:', e);
                }
            }

            if (this._dataBus) {
                this._dataBus.clearAll();
                this._dataBus.markSaved();
            }

            this._notify('new', { name: this._projectName });
            return true;
        }

        getProjectData() {
            if (!this._dataBus) return null;

            const layoutData = this._getLayoutData();
            const layoutStyle = this._getLayoutStyle();
            const slotsData = this._dataBus.exportSlots();

            return {
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

        getProjectPath() { return this._projectPath; }
        getProjectName() { return this._projectName; }
        getProjectMetadata() { return { ...this._projectMetadata }; }

        _notify(event, data) {
            if (this._listeners[event]) {
                this._listeners[event].forEach(cb => {
                    try { cb(data); } catch (e) {
                        console.error('[ProjectManager] Listener error:', e);
                    }
                });
            }

            if (window.eventBus && typeof window.eventBus.emit === 'function') {
                try {
                    window.eventBus.emit('project:' + event, data);
                } catch (e) {}
            }

            if (this._eventBus && this._eventBus !== window.eventBus) {
                try { this._eventBus.emit('project:' + event, data); } catch (e) {}
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

        destroy() {
            this._stopAutoSave();

            for (var i = 0; i < this._busUnsubs.length; i++) {
                try { this._busUnsubs[i](); } catch (e) {}
            }
            this._busUnsubs = [];

            this._listeners = {};
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ProjectManager, STORAGE_KEYS };
    }

    if (typeof window !== 'undefined') {
        window.ProjectManager = ProjectManager;
        window.STORAGE_KEYS = STORAGE_KEYS;
    }

})();