// core/PluginSystem.js
// Версия 5.8.0 - Add: PluginAPI integration (ExtendedAPI/UserAPI.js)
// - loadAll: первым загрузчиком PluginAPI.load()
// - reload: перезагрузка PluginAPI.reload + UserAPI.js
// - _tryRegisterFromClass / _loadWindowFile — без изменений
// - Manifest override / hide / reload — без изменений
// - Legacy registerXxxWindow сохранён

(function() {
    'use strict';

    console.log('[PluginSystem] Loading v5.8.0...');

    var STORAGE_KEYS = {
        MANIFEST_OVERRIDE: 'lsystem_window_manifest_override',
        USER_PLUGINS: 'lsystem_user_plugins'
    };

    class PluginSystem {
        constructor(options = {}) {
            this._registry = options.registry;
            this._dataBus = options.dataBus;
            this._eventBus = options.eventBus;
            this._messageBus = options.messageBus;
            this._appState = options.appState || null;

            this._plugins = new Map();
            this._loaded = false;
            this._manifestPath = options.manifestPath || '/plugins/manifest.json';
            this._windowPath = options.windowPath || 'window/';
            this._enableGlobalScan = options.enableGlobalScan !== false;
            this._enableManifest = options.enableManifest !== false;
            this._enableUserPlugins = options.enableUserPlugins !== false;
            this._enableWindowAutoLoad = options.enableWindowAutoLoad !== false;
            this._enableExtendedAPI = options.enableExtendedAPI !== false;

            this._loadedScripts = new Set();
            this._registeredTypes = new Set();
            this._scriptPromises = new Map();
            this._windowGroups = new Map();

            this._cacheBust = 0;

            this._manifestOverride = this._loadManifestOverride();
            this._fetchedManifest = { groups: {} };
        }

        setAppState(appState) {
            this._appState = appState;
        }

        // ============================================================
        // ЗАГРУЗКА ВСЕГО
        // ============================================================

        async loadAll() {
            if (this._loaded) {
                console.log('[PluginSystem] Already loaded');
                return;
            }

            console.log('[PluginSystem] 🔍 Scanning for plugins...');

            const loaders = [];

            // ✅ ExtendedAPI (UserAPI.js) — ГРУЗИМ ПЕРВЫМ, чтобы компоненты были готовы
            if (this._enableExtendedAPI && window.PluginAPI && typeof window.PluginAPI.load === 'function') {
                loaders.push(this._loadExtendedAPI());
            }

            if (this._enableWindowAutoLoad) loaders.push(this._loadWindowsFromFolder());
            if (this._enableGlobalScan) loaders.push(this._loadFromGlobalScope());
            if (this._enableManifest) loaders.push(this._loadFromManifest());
            if (this._enableUserPlugins) loaders.push(this._loadFromStorage());

            await Promise.allSettled(loaders);

            this._scanGlobalWindowRegistrars();

            this._loaded = true;
            console.log('[PluginSystem] ✅ Loaded ' + this._plugins.size + ' plugins');
            console.log('[PluginSystem] ✅ Registered types:', Array.from(this._registeredTypes));

            this._notify('plugins-loaded', {
                count: this._plugins.size,
                types: Array.from(this._registeredTypes)
            });

            return this._plugins;
        }

        /**
         * ✅ Загрузка ExtendedAPI/UserAPI.js через PluginAPI.
         * Не критично, если файла нет — просто warn.
         */
        async _loadExtendedAPI() {
            try {
                const ok = await window.PluginAPI.load();
                if (ok) {
                    console.log('[PluginSystem] ✅ ExtendedAPI loaded');
                } else {
                    console.warn('[PluginSystem] ⚠️ ExtendedAPI not loaded (optional)');
                }
            } catch (e) {
                console.warn('[PluginSystem] ExtendedAPI error:', e);
            }
        }

        // ============================================================
        // МАНИФЕСТ — OVERRIDE
        // ============================================================

        _loadManifestOverride() {
            try {
                if (typeof localStorage === 'undefined') return null;
                const raw = localStorage.getItem(STORAGE_KEYS.MANIFEST_OVERRIDE);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return null;
                if (!parsed.groups || typeof parsed.groups !== 'object') return null;
                return parsed;
            } catch (e) {
                return null;
            }
        }

        _saveManifestOverride(data) {
            try {
                if (typeof localStorage === 'undefined') return;
                if (!data) {
                    localStorage.removeItem(STORAGE_KEYS.MANIFEST_OVERRIDE);
                    this._manifestOverride = null;
                } else {
                    const payload = { groups: {} };
                    for (const g in data.groups) {
                        if (!Object.prototype.hasOwnProperty.call(data.groups, g)) continue;
                        const list = data.groups[g];
                        if (!Array.isArray(list)) continue;
                        payload.groups[g] = list.map(function(e) {
                            return { file: String(e.file || ''), hidden: !!e.hidden };
                        }).filter(function(e) { return e.file; });
                    }
                    localStorage.setItem(STORAGE_KEYS.MANIFEST_OVERRIDE, JSON.stringify(payload));
                    this._manifestOverride = payload;
                }
            } catch (e) {}
        }

        _normalizeEntry(entry) {
            if (typeof entry === 'string') {
                return { file: entry, hidden: false };
            }
            if (entry && typeof entry === 'object') {
                return {
                    file: String(entry.file || ''),
                    hidden: !!entry.hidden
                };
            }
            return null;
        }

        _normalizeRawManifest(raw) {
            const result = { groups: {} };
            if (!raw || typeof raw !== 'object') return result;

            if (raw.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups)) {
                for (const [groupName, list] of Object.entries(raw.groups)) {
                    if (!Array.isArray(list)) continue;
                    const entries = [];
                    for (const item of list) {
                        const norm = this._normalizeEntry(item);
                        if (norm && norm.file && /\.js$/i.test(norm.file)) {
                            entries.push(norm);
                        }
                    }
                    if (entries.length > 0) result.groups[groupName] = entries;
                }
                return result;
            }

            if (Array.isArray(raw.files)) {
                const entries = [];
                for (const f of raw.files) {
                    if (typeof f === 'string' && /\.js$/i.test(f)) {
                        entries.push({ file: f, hidden: false });
                    }
                }
                if (entries.length > 0) result.groups['Other'] = entries;
            }

            return result;
        }

        getManifest() {
            const baseGroups = this._fetchedManifest.groups || {};
            const override = this._manifestOverride;

            const result = { groups: {} };
            for (const [groupName, entries] of Object.entries(baseGroups)) {
                if (!Array.isArray(entries)) continue;
                result.groups[groupName] = entries.map(function(e) {
                    return { file: e.file, hidden: !!e.hidden };
                });
            }

            if (override && override.groups) {
                const overrideMap = {};

                for (const og of Object.keys(override.groups)) {
                    const list = override.groups[og];
                    if (!Array.isArray(list)) continue;
                    for (const item of list) {
                        const norm = this._normalizeEntry(item);
                        if (norm && norm.file) {
                            overrideMap[norm.file] = {
                                group: og,
                                hidden: !!norm.hidden
                            };
                        }
                    }
                }

                const flat = [];
                for (const g of Object.keys(result.groups)) {
                    for (const entry of result.groups[g]) {
                        const ov = overrideMap[entry.file];
                        flat.push({
                            file: entry.file,
                            hidden: ov ? ov.hidden : entry.hidden,
                            group: ov ? ov.group : g
                        });
                    }
                }

                const existingFiles = new Set(flat.map(f => f.file));
                for (const of_ of Object.keys(overrideMap)) {
                    if (!existingFiles.has(of_)) {
                        flat.push({
                            file: of_,
                            hidden: overrideMap[of_].hidden,
                            group: overrideMap[of_].group
                        });
                    }
                }

                result.groups = {};
                for (const f of flat) {
                    if (!result.groups[f.group]) result.groups[f.group] = [];
                    result.groups[f.group].push({
                        file: f.file,
                        hidden: f.hidden
                    });
                }
            }

            return result;
        }

        _saveManifest(manifest) {
            this._saveManifestOverride({
                groups: manifest.groups
            });
        }

        _findFileEntry(manifest, filename) {
            for (const groupName of Object.keys(manifest.groups)) {
                for (const entry of manifest.groups[groupName]) {
                    if (entry.file === filename) {
                        return { group: groupName, entry };
                    }
                }
            }
            return null;
        }

        // ============================================================
        // HIDDEN
        // ============================================================

        hideFile(filename) {
            if (!filename) return false;

            const manifest = this.getManifest();
            const found = this._findFileEntry(manifest, filename);

            if (found) {
                found.entry.hidden = true;
            } else {
                if (!manifest.groups['Other']) manifest.groups['Other'] = [];
                manifest.groups['Other'].push({ file: filename, hidden: true });
            }

            this._saveManifest(manifest);
            return true;
        }

        unhideFile(filename) {
            if (!filename) return false;

            const manifest = this.getManifest();
            const found = this._findFileEntry(manifest, filename);

            if (!found) return false;

            found.entry.hidden = false;
            this._saveManifest(manifest);
            return true;
        }

        isFileHidden(filename) {
            if (!filename) return false;
            const manifest = this.getManifest();
            const found = this._findFileEntry(manifest, filename);
            return found ? !!found.entry.hidden : false;
        }

        getHiddenFiles() {
            const result = [];
            const manifest = this.getManifest();

            for (const g of Object.keys(manifest.groups)) {
                for (const entry of manifest.groups[g]) {
                    if (entry.hidden) result.push(entry.file);
                }
            }

            return result;
        }

        clearHiddenFiles() {
            const manifest = this.getManifest();
            for (const g of Object.keys(manifest.groups)) {
                for (const entry of manifest.groups[g]) {
                    entry.hidden = false;
                }
            }
            this._saveManifest(manifest);
        }

        clearManifestOverride() {
            this._saveManifestOverride(null);
        }

        downloadManifest() {
            const manifest = this.getManifest();

            const payload = { groups: {} };
            for (const [g, entries] of Object.entries(manifest.groups)) {
                payload.groups[g] = entries.map(e => ({
                    file: e.file,
                    hidden: !!e.hidden
                }));
            }

            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'window.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        }

        addFileToManifest(filename, groupName = 'Other') {
            if (!filename || typeof filename !== 'string') return false;

            const manifest = this.getManifest();

            for (const g of Object.keys(manifest.groups)) {
                manifest.groups[g] = manifest.groups[g].filter(e => e.file !== filename);
                if (manifest.groups[g].length === 0) delete manifest.groups[g];
            }

            if (!manifest.groups[groupName]) manifest.groups[groupName] = [];
            manifest.groups[groupName].push({ file: filename, hidden: false });

            this._saveManifest(manifest);
            return true;
        }

        setFileGroup(filename, groupName) {
            if (!filename || !groupName) return false;

            const manifest = this.getManifest();

            let hidden = false;
            for (const g of Object.keys(manifest.groups)) {
                for (const entry of manifest.groups[g]) {
                    if (entry.file === filename) hidden = entry.hidden;
                }
                manifest.groups[g] = manifest.groups[g].filter(e => e.file !== filename);
                if (manifest.groups[g].length === 0) delete manifest.groups[g];
            }

            if (!manifest.groups[groupName]) manifest.groups[groupName] = [];
            manifest.groups[groupName].push({ file: filename, hidden: hidden });

            this._saveManifest(manifest);
            return true;
        }

        // ============================================================
        // RELOAD
        // ============================================================

        async reload() {
            console.log('[PluginSystem] 🔄 Reloading plugins (soft)...');

            this._rejectPendingScripts('reload');

            // ✅ Перезагружаем ExtendedAPI/UserAPI.js
            if (this._enableExtendedAPI && window.PluginAPI && typeof window.PluginAPI.load === 'function') {
                try {
                    await window.PluginAPI.load({ reload: true });
                    console.log('[PluginSystem] ✅ ExtendedAPI reloaded');
                } catch (e) {
                    console.warn('[PluginSystem] ExtendedAPI reload error:', e);
                }
            }

            if (this._registry) {
                const typesToRemove = Array.from(this._registeredTypes);
                for (const typeId of typesToRemove) {
                    if (typeof this._registry.unregister === 'function') {
                        try { this._registry.unregister(typeId); } catch (e) {}
                    }
                }
            }

            this._plugins.clear();
            this._loadedScripts.clear();
            this._registeredTypes.clear();
            this._windowGroups.clear();
            this._fetchedManifest = { groups: {} };

            this._manifestOverride = this._loadManifestOverride();

            this._cacheBust++;
            this._purgeOldScripts();

            this._loaded = false;
            await this.loadAll();

            console.log('[PluginSystem] ✅ Reload complete');
            console.log('[PluginSystem] Registered types:', Array.from(this._registeredTypes));

            this._notify('plugins-reloaded', {
                count: this._plugins.size,
                types: Array.from(this._registeredTypes)
            });
        }

        _rejectPendingScripts(reason) {
            if (!this._scriptPromises || this._scriptPromises.size === 0) return;

            const pending = Array.from(this._scriptPromises.entries());
            for (const [key, promise] of pending) {
                const entry = this._scriptPromises.get(key);
                if (entry && entry._reject) {
                    try { entry._reject(new Error('Script load cancelled: ' + reason)); } catch (e) {}
                }
                this._scriptPromises.delete(key);
            }
        }

        _purgeOldScripts() {
            if (typeof document === 'undefined') return;
            document.querySelectorAll('script[data-ls-plugin="true"]').forEach(function(s) {
                if (s.parentNode) s.parentNode.removeChild(s);
            });
        }

        // ============================================================
        // АВТОЗАГРУЗКА ОКОН
        // ============================================================

        async _loadWindowsFromFolder() {
            console.log('[PluginSystem] 📂 Scanning window folder:', this._windowPath);

            const data = await this._getWindowManifest();
            const groups = data.groups;

            const visibleFiles = [];
            let hiddenCount = 0;

            this._windowGroups.clear();
            for (const [groupName, entries] of Object.entries(groups)) {
                for (const entry of entries) {
                    if (entry.hidden) {
                        hiddenCount++;
                        continue;
                    }
                    visibleFiles.push(entry.file);
                    this._windowGroups.set(entry.file, groupName);
                }
            }

            if (visibleFiles.length === 0) {
                console.warn('[PluginSystem] No visible window files');
                return;
            }

            console.log('[PluginSystem] Visible files:', visibleFiles.length,
                ', hidden:', hiddenCount);

            for (const file of visibleFiles) {
                await this._loadWindowFile(file);
            }
        }

        async _getWindowManifest() {
            const empty = { groups: {} };

            try {
                const url = this._windowPath + 'window.json?_=' + Date.now() + '_' + this._cacheBust;
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) {
                    console.warn('[PluginSystem] ⚠️ window/window.json not found');
                    this._fetchedManifest = { groups: {} };
                } else {
                    const raw = await response.json();
                    this._fetchedManifest = this._normalizeRawManifest(raw);
                    console.log('[PluginSystem] window.json → groups:',
                        Object.keys(this._fetchedManifest.groups).length);
                }
            } catch (e) {
                console.warn('[PluginSystem] Error reading window.json:', e);
                this._fetchedManifest = { groups: {} };
            }

            this._manifestOverride = this._loadManifestOverride();

            const merged = this.getManifest();
            return { groups: merged.groups };
        }

        // ============================================================
        // ЗАГРУЗКА ОДНОГО ФАЙЛА ОКНА
        // ============================================================

        async _loadWindowFile(filename) {
            const fullPath = this._windowPath + filename;
            const bustPath = fullPath + '?_=' + Date.now() + '_' + this._cacheBust;

            if (this._loadedScripts.has(fullPath)) {
                return;
            }

            console.log('[PluginSystem] 📄 Loading window:', filename);

            try {
                await this._loadScript(bustPath, fullPath);
                this._loadedScripts.add(fullPath);

                const baseName = filename.replace(/\.js$/, '');
                const groupName = this._windowGroups.get(filename) || 'Other';

                // ==================================================
                // ПРИОРИТЕТ 1: legacy registerXxxWindow
                // ==================================================
                const registerFnName = 'register' + baseName;
                const registerFn = window[registerFnName];

                if (typeof registerFn === 'function') {
                    const typesBefore = new Set(
                        this._registry.getAllTypes().map(t => t.id)
                    );

                    const result = registerFn(
                        this._registry,
                        this._dataBus,
                        this._eventBus,
                        this._messageBus
                    );

                    if (result) {
                        const typesAfter = this._registry.getAllTypes().map(t => t.id);
                        const newTypeIds = typesAfter.filter(id => !typesBefore.has(id));

                        const realTypeIds = newTypeIds.length > 0
                            ? newTypeIds
                            : [
                                baseName
                                    .replace(/Window$/, '')
                                    .replace(/([a-z])([A-Z])/g, '$1-$2')
                                    .toLowerCase()
                            ];

                        for (const realTypeId of realTypeIds) {
                            const typeConfig = this._registry.getType(realTypeId);
                            if (typeConfig && (!typeConfig.group || typeConfig.group === 'Other')) {
                                typeConfig.group = groupName;
                            }

                            this._plugins.set(realTypeId, {
                                id: realTypeId,
                                name: filename,
                                type: 'window',
                                file: filename,
                                group: groupName,
                                loaded: true,
                                registeredVia: 'legacy'
                            });
                            this._registeredTypes.add(realTypeId);

                            this._syncTypeHotkeys(realTypeId);
                        }

                        console.log('[PluginSystem] ✅ Loaded window (legacy):', filename,
                            '(types:', realTypeIds.join(', ') + ',', 'group:', groupName + ')');
                        return;
                    }
                }

                // ==================================================
                // ПРИОРИТЕТ 2: класс с static meta
                // ==================================================
                if (this._tryRegisterFromClass(filename, baseName, groupName)) {
                    return;
                }

                // ==================================================
                // ПРИОРИТЕТ 3: fallback — класс без meta
                // ==================================================
                const className = baseName;
                const WindowClass = window[className];

                if (typeof WindowClass === 'function') {
                    this._autoRegisterWindowClass(
                        baseName.replace(/Window$/, '').toLowerCase(),
                        className,
                        filename,
                        WindowClass,
                        groupName
                    );
                }
            } catch (error) {
                console.error('[PluginSystem] ❌ Failed to load window:', filename, error);
            }
        }

        // ============================================================
        // АВТО-РЕГИСТРАЦИЯ ИЗ КЛАССА С static meta
        // ============================================================

        _tryRegisterFromClass(filename, baseName, groupName) {
            if (!this._registry) return false;

            const Class = window[baseName];
            if (typeof Class !== 'function') {
                return false;
            }

            const meta = Class.meta;
            if (!meta || typeof meta !== 'object' || !meta.id) {
                return false;
            }

            if (typeof this._registry.registerFromClass !== 'function') {
                console.warn('[PluginSystem] registerFromClass not available in registry');
                return false;
            }

            const typesBefore = new Set(
                this._registry.getAllTypes().map(t => t.id)
            );

            let result;
            try {
                result = this._registry.registerFromClass(Class);
            } catch (e) {
                console.error('[PluginSystem] registerFromClass error:', e);
                return false;
            }

            if (!result) return false;

            const typesAfter = this._registry.getAllTypes().map(t => t.id);
            const newTypeIds = typesAfter.filter(id => !typesBefore.has(id));

            const realTypeIds = newTypeIds.length > 0
                ? newTypeIds
                : [ String(meta.id) ];

            for (const realTypeId of realTypeIds) {
                const typeConfig = this._registry.getType(realTypeId);
                if (typeConfig && (!typeConfig.group || typeConfig.group === 'Other')) {
                    if (groupName) typeConfig.group = groupName;
                }

                this._plugins.set(realTypeId, {
                    id: realTypeId,
                    name: filename,
                    type: 'window',
                    file: filename,
                    group: groupName || meta.group || 'Other',
                    loaded: true,
                    registeredVia: 'class'
                });
                this._registeredTypes.add(realTypeId);

                this._syncTypeHotkeys(realTypeId);
            }

            console.log('[PluginSystem] ✅ Loaded window (class):', filename,
                '(types:', realTypeIds.join(', ') + ',',
                'group:', groupName + ')');

            return true;
        }

        _syncTypeHotkeys(typeId) {
            if (!this._appState || !this._registry) return;

            const typeConfig = this._registry.getType(typeId);
            if (!typeConfig || !typeConfig.hotkeys) return;

            const keys = Object.keys(typeConfig.hotkeys);
            if (keys.length === 0) return;

            this._appState.ensureHotkeyDefaults(typeId, typeConfig.hotkeys);
        }

        // ============================================================
        // FALLBACK: класс без static meta
        // ============================================================

        _autoRegisterWindowClass(typeId, className, filename, WindowClass, groupName) {
            if (!this._registry) return false;

            const staticConfig = WindowClass.typeConfig || WindowClass.config || {};

            const typeConfig = {
                id: typeId,
                name: staticConfig.name || className.replace(/Window$/, ''),
                icon: staticConfig.icon || 'icon-' + typeId,
                description: staticConfig.description || 'Auto-registered from ' + filename,
                group: staticConfig.group || groupName || 'Other',
                category: staticConfig.category || 'other',
                defaultSize: staticConfig.defaultSize || { width: 500, height: 400 },
                minSize: staticConfig.minSize || { width: 200, height: 150 },
                maxWindows: staticConfig.maxWindows || 4,
                priority: staticConfig.priority || 999,
                metadata: staticConfig.metadata || { version: '1.0.0', source: filename },

                contextMenu: staticConfig.contextMenu || [],
                headerButtons: staticConfig.headerButtons || [],
                dropdownMenu: staticConfig.dropdownMenu || null,
                hotkeys: staticConfig.hotkeys || {},

                create: (container, windowData) => {
                    return new WindowClass(container, windowData, {
                        dataBus: this._dataBus,
                        registry: this._registry,
                        eventBus: this._eventBus,
                        messageBus: this._messageBus
                    });
                },
                onDestroy: (container, windowData, instance) => {
                    if (instance && typeof instance.destroy === 'function') {
                        instance.destroy();
                    }
                },
                onResize: (container, windowData, instance) => {
                    if (instance && typeof instance.resize === 'function') {
                        instance.resize();
                    }
                }
            };

            const result = this._registry.register(typeConfig);
            if (result) {
                this._plugins.set(typeId, {
                    id: typeId,
                    name: filename,
                    type: 'window',
                    file: filename,
                    group: groupName,
                    loaded: true,
                    autoRegistered: true,
                    registeredVia: 'fallback'
                });
                this._registeredTypes.add(typeId);
                this._syncTypeHotkeys(typeId);
            }
            return result;
        }

        // ============================================================
        // ГЛОБАЛЬНЫЕ / МАНИФЕСТ / STORAGE
        // ============================================================

        async _loadFromGlobalScope() {
            this._scanGlobalWindowRegistrars();
        }

        _scanGlobalWindowRegistrars() {
            const keys = Object.keys(window);
            let found = 0;

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key.length < 14) continue;
                if (key.charCodeAt(0) !== 114) continue;
                if (!key.startsWith('register')) continue;
                if (!key.endsWith('Window')) continue;

                const fn = window[key];
                if (typeof fn !== 'function') continue;

                const typeId = key.replace('register', '').replace('Window', '').toLowerCase();
                if (this._registry && this._registry.hasType(typeId)) continue;

                const typesBefore = new Set(
                    this._registry ? this._registry.getAllTypes().map(t => t.id) : []
                );

                try {
                    const result = fn(
                        this._registry, this._dataBus, this._eventBus, this._messageBus
                    );
                    if (result) {
                        const typesAfter = this._registry
                            ? this._registry.getAllTypes().map(t => t.id)
                            : [];
                        const newTypes = typesAfter.filter(id => !typesBefore.has(id));

                        for (const newId of newTypes) {
                            this._plugins.set(newId, {
                                id: newId,
                                name: key,
                                type: 'global',
                                loaded: true
                            });
                            this._registeredTypes.add(newId);
                            found++;
                            this._syncTypeHotkeys(newId);
                        }
                    }
                } catch (error) {}
            }
        }

        async _loadFromManifest() {
            try {
                const url = this._manifestPath + '?_=' + Date.now();
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) return;

                const manifest = await response.json();
                if (!Array.isArray(manifest.plugins)) return;

                for (const plugin of manifest.plugins) {
                    if (plugin.enabled === false) continue;
                    try {
                        if (plugin.entry) {
                            await this._loadScript(plugin.entry + '?_=' + this._cacheBust, plugin.entry);
                        }
                        const registerFn = window[plugin.registerFn];
                        if (typeof registerFn === 'function') {
                            const result = registerFn(
                                this._registry, this._dataBus, this._eventBus, this._messageBus
                            );
                            if (result) {
                                this._plugins.set(plugin.id, {
                                    id: plugin.id, name: plugin.name, type: 'manifest', loaded: true
                                });
                                this._registeredTypes.add(plugin.id);
                                this._syncTypeHotkeys(plugin.id);
                            }
                        }
                    } catch (error) {}
                }
            } catch (error) {}
        }

        async _loadFromStorage() {
            try {
                if (typeof localStorage === 'undefined') return;
                const stored = localStorage.getItem(STORAGE_KEYS.USER_PLUGINS);
                if (!stored) return;
                const plugins = JSON.parse(stored);
                if (!Array.isArray(plugins)) return;

                for (const plugin of plugins) {
                    if (!plugin.enabled) continue;
                    try {
                        const blob = new Blob([plugin.code], { type: 'application/javascript' });
                        const url = URL.createObjectURL(blob);
                        try {
                            await this._loadScript(url, url);
                        } finally {
                            URL.revokeObjectURL(url);
                        }

                        const registerFn = window[plugin.registerFn];
                        if (typeof registerFn === 'function') {
                            const typesBefore = new Set(
                                this._registry ? this._registry.getAllTypes().map(t => t.id) : []
                            );

                            const result = registerFn(
                                this._registry, this._dataBus, this._eventBus, this._messageBus
                            );

                            if (result) {
                                const typesAfter = this._registry
                                    ? this._registry.getAllTypes().map(t => t.id)
                                    : [];
                                const newTypes = typesAfter.filter(id => !typesBefore.has(id));

                                const realTypeIds = newTypes.length > 0
                                    ? newTypes
                                    : [ plugin.id ];

                                for (const realTypeId of realTypeIds) {
                                    const typeConfig = this._registry.getType(realTypeId);
                                    if (typeConfig && plugin.group && (!typeConfig.group || typeConfig.group === 'Other')) {
                                        typeConfig.group = plugin.group;
                                    }

                                    this._plugins.set(realTypeId, {
                                        id: realTypeId,
                                        name: plugin.name,
                                        type: 'user',
                                        file: plugin.id,
                                        group: plugin.group || 'Other',
                                        loaded: true
                                    });
                                    this._registeredTypes.add(realTypeId);
                                    this._syncTypeHotkeys(realTypeId);
                                }
                            }
                        }
                    } catch (error) {}
                }
            } catch (error) {}
        }

        _loadScript(src, originalSrc) {
            const key = originalSrc || src;

            const existing = document.querySelector('script[data-ls-src="' + key + '"]');
            if (existing && existing.dataset.loaded === 'true') {
                return Promise.resolve();
            }

            if (this._scriptPromises.has(key)) {
                return this._scriptPromises.get(key).promise;
            }

            let resolveFn, rejectFn;
            const promise = new Promise((resolve, reject) => {
                resolveFn = resolve;
                rejectFn = reject;
            });

            const entry = {
                promise: promise,
                reject: rejectFn
            };
            this._scriptPromises.set(key, entry);

            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                script.onload = null;
                script.onerror = null;
                if (script.parentNode) script.parentNode.removeChild(script);
                this._scriptPromises.delete(key);
                rejectFn(new Error('Script load timeout: ' + src));
            }, 30000);

            let script = existing;

            if (!script) {
                script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.dataset.lsPlugin = 'true';
                script.dataset.lsSrc = key;
                document.head.appendChild(script);
            }

            script.onload = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                script.dataset.loaded = 'true';
                this._scriptPromises.delete(key);
                resolveFn();
            };

            script.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (script.parentNode) script.parentNode.removeChild(script);
                this._scriptPromises.delete(key);
                rejectFn(new Error('Failed to load script: ' + src));
            };

            return promise;
        }

        // ============================================================
        // GETTERS / DESTROY
        // ============================================================

        getPlugins() {
            return Array.from(this._plugins.values());
        }

        getPlugin(id) {
            return this._plugins.get(id) || null;
        }

        isLoaded(id) {
            const p = this._plugins.get(id);
            return p && p.loaded;
        }

        getRegisteredTypes() {
            return Array.from(this._registeredTypes);
        }

        destroy() {
            this._rejectPendingScripts('destroy');
            this._plugins.clear();
            this._loaded = false;
            this._loadedScripts.clear();
            this._registeredTypes.clear();
            this._windowGroups.clear();
            this._fetchedManifest = { groups: {} };
            this._purgeOldScripts();
            console.log('[PluginSystem] Destroyed');
        }

        _notify(event, data) {
            if (typeof document !== 'undefined') {
                const customEvent = new CustomEvent(event, { detail: data });
                document.dispatchEvent(customEvent);
            }
            if (this._eventBus) this._eventBus.emit(event, data);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginSystem };
    }

    if (typeof window !== 'undefined') {
        window.PluginSystem = PluginSystem;
        console.log('[PluginSystem] Registered globally v5.8.0');
    }

})();