// core/PluginSystem.js
// Версия 12.0.0 — Оркестратор плагинов под новый PluginLoader v2.0.0.
//
// Модель:
//   - Один manifest.json в корне рабочей папки. ОБЯЗАТЕЛЕН.
//   - Все .js из manifest.files выполняются по priority (см. PluginLoader).
//   - Плагин = окно (определяется автоматически по static meta).
//   - Выключенные плагины — выполняются, но типы снимаются из реестра.
//   - URL-плагины живут отдельно (IndexedDB, хранятся в .lsu).
//   - NodeGraph сам запрашивает nodes/ и presets/ через listFolder().
//
// API:
//   loadAll / reload
//   pickFolder / restoreFolder / forgetFolder / rescanFolder
//   requestFolderPermission
//   getFolderName / getFolderState / getPluginSource
//
//   getAllPlugins / getActivePlugins / getHiddenPlugins
//   enablePlugin / disablePlugin / uninstallPlugin
//
//   installFromUrl / checkUpdates
//   getUrlPlugins / getUrlPlugin(id)
//
//   listFolder(folderName)         — для NodeGraph
//   readFile(path)                 — для NodeGraph
//   readAsset(name) / resolveAsset(name) / getAssetIndex()
//
// События:
//   'plugins:changed'
//   'plugins:folder-changed'
//   'plugins:folder-permission-needed'
//   'plugins:reloaded'

(function() {
    'use strict';

    console.log('[PluginSystem] Loading v12.0.0...');

    // ================================================================
    // ХЕЛПЕРЫ
    // ================================================================

    function _slugFromUrl(url) {
        if (!url) return null;
        try {
            var u = new URL(url, window.location.href);
            var name = u.pathname.split('/').pop() || 'plugin';
            name = name.replace(/\.js$/i, '');
            name = name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
            return name || 'plugin';
        } catch (err) {
            return null;
        }
    }

    function _guessNameFromUrl(url) {
        var slug = _slugFromUrl(url);
        if (!slug) return 'Plugin';
        return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    function _normalizeUrl(url) {
        if (!url || typeof url !== 'string') return null;
        var trimmed = url.trim();
        if (!trimmed) return null;
        if (!/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(trimmed)) return null;
        return trimmed;
    }

    // ================================================================
    // ОСНОВНОЙ КЛАСС
    // ================================================================

    class PluginSystem {
        constructor(options) {
            options = options || {};

            this._registry = options.registry || null;
            this._eventBus = options.eventBus || null;
            this._appState = options.appState || null;

            this._folderSource = null;
            this._urlStorage = null;
            this._loader = null;

            this._isLoaded = false;
            this._isLoading = false;
            this._loadPromise = null;
            this._plugins = new Map();       // id → plugin descriptor
            this._folderState = 'none';
            this._folderName = '';
            this._lastReloadAt = 0;
            this._manifest = null;

            this._debug = !!options.debug;

            this._ensureBackends();
        }

        _ensureBackends() {
            if (window.PluginFolderSource && typeof window.PluginFolderSource.create === 'function') {
                this._folderSource = window.PluginFolderSource.create();
            } else {
                console.warn('[PluginSystem] PluginFolderSource not available');
            }

            if (window.PluginUrlStorage) {
                this._urlStorage = new window.PluginUrlStorage();
            } else {
                console.warn('[PluginSystem] PluginUrlStorage not available');
            }

            if (window.PluginLoader) {
                this._loader = new window.PluginLoader({
                    folderSource: this._folderSource,
                    registry: this._registry,
                    onLog: this._debug
                        ? function(msg) { console.log('[PluginLoader]', msg); }
                        : null
                });
            } else {
                console.warn('[PluginSystem] PluginLoader not available');
            }
        }

        // ============================================================
        // ЖИЗНЕННЫЙ ЦИКЛ
        // ============================================================

        async loadAll() {
            if (this._isLoaded && !this._isLoading) {
                if (this._debug) console.log('[PluginSystem] Already loaded');
                return;
            }

            if (this._isLoading && this._loadPromise) {
                return this._loadPromise;
            }

            this._isLoading = true;
            this._loadPromise = this._doLoadAll();

            try {
                await this._loadPromise;
                this._isLoaded = true;
            } finally {
                this._isLoading = false;
                this._loadPromise = null;
            }
        }

        async _doLoadAll() {
            console.log('[PluginSystem] Loading plugins...');

            // 1) Восстановить рабочую папку
            await this._tryRestoreFolder();

            // 2) Загрузить плагины из папки (scan + loadAll)
            if (this._folderState === 'granted' && this._loader) {
                try {
                    var ok = await this._loader.scan();
                    if (ok) {
                        this._manifest = this._loader.getManifest();
                        await this._loader.loadAll();
                        this._refreshPluginsFromRegistry();
                    }
                } catch (err) {
                    console.warn('[PluginSystem] load from folder failed:', err);
                }
            }

            // 3) URL-плагины
            if (this._urlStorage) {
                try {
                    await this._loadUrlPlugins();
                } catch (err) {
                    console.warn('[PluginSystem] loadUrlPlugins failed:', err);
                }
            }

            console.log('[PluginSystem] Loaded ' + this._plugins.size + ' plugin(s)');
            this._emit('plugins:changed', { plugins: this.getAllPlugins() });
        }

        async reload() {
            console.log('[PluginSystem] Reloading plugins...');

            // Снимаем типы всех folder-плагинов
            this._clearFolderPlugins();
            this._plugins.clear();
            this._manifest = null;

            if (this._loader) {
                this._loader.resetFull();
            }

            this._isLoaded = false;
            await this.loadAll();

            this._lastReloadAt = Date.now();
            this._emit('plugins:reloaded', { plugins: this.getAllPlugins() });
        }

        // ============================================================
        // ПЕРЕСБОРКА СПИСКА ПЛАГИНОВ ИЗ РЕЕСТРА
        // ============================================================

        _refreshPluginsFromRegistry() {
            if (!this._loader || !this._registry) return;

            var loadedIds = this._loader.getLoadedIds();
            var fileMap = this._loader.getPluginFileMap();
            var disabled = this._loader.getDisabledIds();

            // Обновляем записи для folder-плагинов
            for (var i = 0; i < loadedIds.length; i++) {
                var id = loadedIds[i];
                var typeConfig = this._registry.getType(id);
                if (!typeConfig) continue;

                var file = fileMap[id] || '';
                var enabled = !this._loader.isDisabled(id);

                var meta = typeConfig.metadata || {};
                var plugin = {
                    id: id,
                    name: typeConfig.name || id,
                    version: meta.version || '1.0.0',
                    author: meta.author || '',
                    icon: typeConfig.icon || 'icon-layout',
                    description: typeConfig.description || '',
                    source: 'folder',
                    enabled: enabled,
                    url: null,
                    file: file,
                    installedAt: 0
                };

                this._plugins.set(id, plugin);
            }
        }

        // ============================================================
        // РАБОЧАЯ ПАПКА
        // ============================================================

        async _tryRestoreFolder() {
            if (!this._folderSource) return;

            try {
                var ok = await this._folderSource.restore();
                if (ok) {
                    this._folderState = 'granted';
                    this._folderName = this._folderSource.getDisplayName() || '';
                    console.log('[PluginSystem] Folder restored: ' + this._folderName);
                } else {
                    var perm = await this._folderSource.queryPermission();
                    if (perm === 'prompt') {
                        this._folderState = 'prompt';
                        this._folderName = this._folderSource.getDisplayName() || '';
                        this._emit('plugins:folder-permission-needed', {});
                    } else if (perm === 'denied') {
                        this._folderState = 'denied';
                        this._folderName = this._folderSource.getDisplayName() || '';
                    } else {
                        this._folderState = 'none';
                        this._folderName = '';
                    }
                }
            } catch (err) {
                console.warn('[PluginSystem] restore folder failed:', err);
                this._folderState = 'none';
            }

            this._emit('plugins:folder-changed', {
                state: this._folderState,
                name: this._folderName
            });
        }

        async pickFolder() {
            if (!this._folderSource) return false;

            try {
                // Снимаем старые folder-плагины
                this._clearFolderPlugins();
                if (this._loader) this._loader.resetFull();

                var ok = await this._folderSource.pick();
                if (!ok) return false;

                this._folderState = 'granted';
                this._folderName = this._folderSource.getDisplayName() || '';

                if (this._loader) {
                    var scanOk = await this._loader.scan();
                    if (scanOk) {
                        this._manifest = this._loader.getManifest();
                        await this._loader.loadAll();
                        this._refreshPluginsFromRegistry();
                    }
                }

                this._emit('plugins:folder-changed', {
                    state: this._folderState,
                    name: this._folderName
                });
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });

                return true;
            } catch (err) {
                console.error('[PluginSystem] pickFolder error:', err);
                return false;
            }
        }

        forgetFolder() {
            if (!this._folderSource) return;

            this._folderSource.forget();
            this._folderState = 'none';
            this._folderName = '';

            if (this._loader) this._loader.resetFull();

            this._clearFolderPlugins();

            this._emit('plugins:folder-changed', { state: 'none', name: '' });
            this._emit('plugins:changed', { plugins: this.getAllPlugins() });
        }

        async rescanFolder() {
            if (!this._folderSource || this._folderState !== 'granted') return false;
            if (!this._loader) return false;

            try {
                // Снимаем типы, чтобы не было дублей
                this._clearFolderPlugins();

                this._loader.reset();

                var ok = await this._loader.scan();
                if (!ok) return false;

                this._manifest = this._loader.getManifest();
                await this._loader.loadAll();
                this._refreshPluginsFromRegistry();

                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            } catch (err) {
                console.error('[PluginSystem] rescanFolder error:', err);
                return false;
            }
        }

        async requestFolderPermission() {
            if (!this._folderSource) return false;

            try {
                var ok = await this._folderSource.requestPermission();
                if (ok) {
                    this._folderState = 'granted';
                    this._folderName = this._folderSource.getDisplayName() || '';
                    await this.reload();
                    this._emit('plugins:folder-changed', {
                        state: this._folderState,
                        name: this._folderName
                    });
                }
                return ok;
            } catch (err) {
                console.error('[PluginSystem] requestPermission error:', err);
                return false;
            }
        }

        _clearFolderPlugins() {
            var toRemove = [];
            this._plugins.forEach(function(p, id) {
                if (p.source === 'folder') toRemove.push(id);
            });
            for (var i = 0; i < toRemove.length; i++) {
                this._plugins.delete(toRemove[i]);
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(toRemove[i]); } catch (e) {}
                }
            }
        }

        getFolderName() {
            return this._folderName;
        }

        getFolderState() {
            return this._folderState;
        }

        getPluginSource() {
            return this._folderSource;
        }

        getManifest() {
            return this._manifest;
        }

        // ============================================================
        // ПЛАГИНЫ — список
        // ============================================================

        getAllPlugins() {
            var out = [];
            var self = this;

            // 1) Core-типы (встроенные)
            if (this._registry && typeof this._registry.getAllTypes === 'function') {
                var types = this._registry.getAllTypes() || [];
                for (var i = 0; i < types.length; i++) {
                    var t = types[i];
                    if (self._plugins.has(t.id)) continue; // дальше добавим как folder/url
                    var meta = t.metadata || {};
                    out.push({
                        id: t.id,
                        name: t.name || t.id,
                        version: meta.version || '1.0.0',
                        author: meta.author || 'LSYSTEM',
                        icon: t.icon || 'icon-layout',
                        description: t.description || '',
                        source: 'core',
                        enabled: true,
                        url: null,
                        file: null,
                        installedAt: 0
                    });
                }
            }

            // 2) Folder/URL плагины
            this._plugins.forEach(function(p) {
                out.push(Object.assign({}, p));
            });

            return out;
        }

        getActivePlugins() {
            return this.getAllPlugins().filter(function(p) { return p.enabled; });
        }

        getHiddenPlugins() {
            return this.getAllPlugins().filter(function(p) { return !p.enabled; });
        }

        // ============================================================
        // ПЛАГИНЫ — управление
        // ============================================================

        async enablePlugin(id) {
            var plugin = this._plugins.get(id);
            if (!plugin) return false;

            if (plugin.source === 'folder') {
                if (!this._loader) return false;
                var file = this._loader.getPluginFileMap()[id];
                if (!file) return false;

                this._loader.setDisabled(id, false);
                await this._loader.reloadFile(file);

                plugin.enabled = true;
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            if (plugin.source === 'url') {
                var rec = await this._urlStorage.get(id);
                if (!rec) return false;
                rec.enabled = true;
                await this._urlStorage.set(rec);
                this._executeUrlCode(rec);
                plugin.enabled = true;
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            return false;
        }

        async disablePlugin(id) {
            var plugin = this._plugins.get(id);
            if (!plugin) return false;

            if (plugin.source === 'folder') {
                if (!this._loader) return false;
                this._loader.setDisabled(id, true);
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(id); } catch (e) {}
                }
                plugin.enabled = false;
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            if (plugin.source === 'url') {
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(id); } catch (e) {}
                }
                var rec = await this._urlStorage.get(id);
                if (rec) {
                    rec.enabled = false;
                    await this._urlStorage.set(rec);
                }
                plugin.enabled = false;
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            return false;
        }

        /**
         * Удалить плагин.
         * Folder — только снимает тип и запоминает как disabled.
         * URL — удаляет из storage и registry.
         */
        async uninstallPlugin(id) {
            var plugin = this._plugins.get(id);
            if (!plugin) return false;

            if (plugin.source === 'folder') {
                // File удалить нельзя (пользователь сам его уберёт)
                // Просто деактивируем
                if (this._loader) this._loader.setDisabled(id, true);
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(id); } catch (e) {}
                }
                plugin.enabled = false;
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            if (plugin.source === 'url') {
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(id); } catch (e) {}
                }
                await this._urlStorage.remove(id);
                this._plugins.delete(id);
                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            }

            return false;
        }

        // ============================================================
        // URL-ПЛАГИНЫ
        // ============================================================

        async _loadUrlPlugins() {
            if (!this._urlStorage) return;

            var all = await this._urlStorage.list();
            for (var i = 0; i < all.length; i++) {
                var rec = all[i];

                this._plugins.set(rec.id, {
                    id: rec.id,
                    name: rec.name,
                    version: rec.version,
                    author: rec.author,
                    icon: rec.icon,
                    description: rec.description,
                    source: 'url',
                    enabled: rec.enabled !== false,
                    url: rec.url,
                    file: null,
                    installedAt: rec.installedAt
                });

                if (rec.enabled !== false) {
                    this._executeUrlCode(rec);
                }
            }
        }

        _executeUrlCode(rec) {
            if (!rec || !rec.code) return;
            try {
                var fn = new Function('module', 'exports', 'console',
                    '"use strict";\n' + rec.code);
                var module = { exports: {} };
                fn(module, module.exports, console);
            } catch (err) {
                console.error('[PluginSystem] Failed to execute URL-plugin ' + rec.id + ':', err);
                if (this._registry && typeof this._registry.unregister === 'function') {
                    try { this._registry.unregister(rec.id); } catch (e) {}
                }
            }
        }

        async installFromUrl(url) {
            var cleanUrl = _normalizeUrl(url);
            if (!cleanUrl) {
                console.warn('[PluginSystem] installFromUrl: invalid url', url);
                return false;
            }

            var code;
            try {
                var res = await fetch(cleanUrl, { credentials: 'omit' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                code = await res.text();
            } catch (err) {
                console.error('[PluginSystem] installFromUrl: fetch failed:', err);
                return false;
            }

            var existing = await this._urlStorage.findByUrl(cleanUrl);
            var id = (existing && existing.id) || _slugFromUrl(cleanUrl) || ('plugin-' + Date.now().toString(36));

            if (this._plugins.has(id) && (!existing || existing.id !== id)) {
                id = id + '-' + Date.now().toString(36);
            }

            var record = {
                id: id,
                name: _guessNameFromUrl(cleanUrl),
                description: '',
                url: cleanUrl,
                code: code,
                version: '1.0.0',
                author: '',
                icon: 'icon-layout',
                enabled: true,
                installedAt: Date.now(),
                updatedAt: Date.now()
            };

            await this._urlStorage.set(record);

            var beforeIds = this._snapshotRegistry();
            this._executeUrlCode(record);
            var newIds = this._diffRegistry(beforeIds);

            for (var i = 0; i < newIds.length; i++) {
                var reg = this._registry ? this._registry.getType(newIds[i]) : null;
                if (reg) {
                    // Если id изменился — удаляем старую запись
                    if (newIds[i] !== record.id) {
                        await this._urlStorage.remove(record.id);
                    }
                    record.id = newIds[i];
                    record.name = reg.name || record.name;
                    record.icon = reg.icon || record.icon;
                    record.description = reg.description || record.description;
                    await this._urlStorage.set(record);
                    break;
                }
            }

            this._plugins.set(record.id, {
                id: record.id,
                name: record.name,
                version: record.version,
                author: record.author,
                icon: record.icon,
                description: record.description,
                source: 'url',
                enabled: true,
                url: record.url,
                file: null,
                installedAt: record.installedAt
            });

            this._emit('plugins:changed', { plugins: this.getAllPlugins() });
            return true;
        }

        async checkUpdates() {
            if (!this._urlStorage) return [];

            var all = await this._urlStorage.list();
            var results = [];

            for (var i = 0; i < all.length; i++) {
                var rec = all[i];
                if (!rec.url) continue;

                try {
                    var res = await fetch(rec.url, { method: 'HEAD', credentials: 'omit' });
                    if (!res.ok) continue;

                    var etag = res.headers.get('etag');
                    var lastMod = res.headers.get('last-modified');

                    var changed = false;
                    if (etag && rec.etag && etag !== rec.etag) changed = true;
                    else if (lastMod && rec.lastModified && lastMod !== rec.lastModified) changed = true;

                    results.push({
                        id: rec.id,
                        name: rec.name,
                        oldVersion: rec.version,
                        hasUpdate: changed
                    });
                } catch (err) {
                    // ignore
                }
            }

            return results;
        }

        getUrlPlugins() {
            var out = [];
            this._plugins.forEach(function(p) {
                if (p.source === 'url') out.push(Object.assign({}, p));
            });
            return out;
        }

        getUrlPlugin(id) {
            var p = this._plugins.get(id);
            if (!p || p.source !== 'url') return null;
            return Object.assign({}, p);
        }

        // ============================================================
        // ФАЙЛЫ / АССЕТЫ — API для NodeGraph и окон
        // ============================================================

        listFolder(folderName) {
            if (!this._loader) return [];
            return this._loader.listFolder(folderName);
        }

        listFolderByRelPath(folderName) {
            if (!this._loader) return [];
            return this._loader.listFolderByRelPath(folderName);
        }

        async readFile(path) {
            if (!this._loader) throw new Error('PluginLoader not available');
            return await this._loader.readFile(path);
        }

        async readAsset(name) {
            if (!this._loader) return null;
            return await this._loader.readAsset(name);
        }

        resolveAsset(name) {
            if (!this._loader) return null;
            return this._loader.resolveAsset(name);
        }

        getAssetIndex() {
            if (!this._loader) return {};
            return this._loader.getAssetIndex();
        }

        // ============================================================
        // РЕЕСТР — утилиты
        // ============================================================

        _snapshotRegistry() {
            if (!this._registry || typeof this._registry.getAllTypes !== 'function') {
                return new Set();
            }
            var arr = this._registry.getAllTypes() || [];
            return new Set(arr.map(function(t) { return t.id; }));
        }

        _diffRegistry(before) {
            if (!this._registry || typeof this._registry.getAllTypes !== 'function') {
                return [];
            }
            var arr = this._registry.getAllTypes() || [];
            var after = arr.map(function(t) { return t.id; });
            var diff = [];
            for (var i = 0; i < after.length; i++) {
                if (!before.has(after[i])) diff.push(after[i]);
            }
            return diff;
        }

        // ============================================================
        // СОБЫТИЯ
        // ============================================================

        _emit(name, data) {
            if (this._eventBus && typeof this._eventBus.emit === 'function') {
                try { this._eventBus.emit(name, data); } catch (e) {}
            }
            if (typeof document !== 'undefined') {
                try {
                    document.dispatchEvent(new CustomEvent(name, { detail: data }));
                } catch (e) {}
            }
        }

        // ============================================================
        // УНИЧТОЖЕНИЕ
        // ============================================================

        destroy() {
            this._plugins.clear();
            this._isLoaded = false;
            this._folderSource = null;
            this._urlStorage = null;
            this._loader = null;
            console.log('[PluginSystem] Destroyed');
        }
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    if (typeof window !== 'undefined') {
        window.PluginSystem = PluginSystem;
        console.log('[PluginSystem] Registered globally v12.0.0');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginSystem: PluginSystem };
    }

})();