// core/PluginSystem.js
// Версия 14.0.0 — без манифеста.
//
// Модель:
//   - Один рабочий каталог плагинов. Никакого manifest.json.
//   - Все .js из папки выполняются по алфавиту (см. PluginLoader).
//   - Плагин = окно (класс с static meta.id в module.exports).
//   - Выключенные плагины — снимаются из реестра, но остаются в списке.
//   - URL-плагины живут отдельно (IndexedDB, .lsu).
//
// Изменения относительно 13.0.0:
//   - _doLoadAll: при state === 'prompt' пытается «мягко» восстановить папку.
//   - _tryRestoreFolder: сохраняет _folderName даже при state === 'none'.
//   - Добавлен _trySoftRestoreFolder() — requestPermission без модалки + scan/load.
//   - Добавлен _reloadFolderPlugins() — единая точка scan/load/refresh/emit.
//   - getAllPlugins: добавлен _lazySyncFromLoader() — подтягивает folder-плагины,
//     даже если _refreshPluginsFromRegistry по какой-то причине не отработал.
//
// API:
//   loadAll / reload
//   pickFolder / restoreFolder / forgetFolder / rescanFolder
//   requestFolderPermission
//   getFolderName / getFolderState / getPluginSource
//   getAllPlugins / getActivePlugins / getHiddenPlugins
//   enablePlugin / disablePlugin / uninstallPlugin
//   installFromUrl / checkUpdates
//   getUrlPlugins / getUrlPlugin(id)
//   listFolder(folderName) / listFolderByRelPath(folderName)
//   readFile(path)
//   readAsset(name) / resolveAsset(name) / getAssetIndex()
//
// События:
//   'plugins:changed'
//   'plugins:folder-changed'
//   'plugins:folder-permission-needed'
//   'plugins:reloaded'

(function() {
    'use strict';

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
            this._plugins = new Map();
            this._folderState = 'none';
            this._folderName = '';
            this._lastReloadAt = 0;

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
                    registry: this._registry
                });
            } else {
                console.warn('[PluginSystem] PluginLoader not available');
            }
        }

        async loadAll() {
            if (this._isLoaded && !this._isLoading) {
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
            await this._tryRestoreFolder();

            if (this._folderState === 'granted' && this._loader) {
                try {
                    var ok = await this._loader.scan();
                    if (ok) {
                        await this._loader.loadAll();
                        this._refreshPluginsFromRegistry();
                    }
                } catch (err) {
                    console.warn('[PluginSystem] load from folder failed:', err);
                }
            } else if (this._folderState === 'prompt' && this._loader) {
                try {
                    var soft = await this._trySoftRestoreFolder();
                    if (soft) {
                        await this._reloadFolderPlugins();
                    }
                } catch (err) {
                    console.warn('[PluginSystem] soft restore failed:', err);
                }
            }

            if (this._urlStorage) {
                try {
                    await this._loadUrlPlugins();
                } catch (err) {
                    console.warn('[PluginSystem] loadUrlPlugins failed:', err);
                }
            }

            this._emit('plugins:changed', { plugins: this.getAllPlugins() });
        }

        async reload() {
            this._clearFolderPlugins();
            this._plugins.clear();

            if (this._loader) {
                this._loader.resetFull();
            }

            this._isLoaded = false;
            await this.loadAll();

            this._lastReloadAt = Date.now();
            this._emit('plugins:reloaded', { plugins: this.getAllPlugins() });
        }

        _refreshPluginsFromRegistry() {
            if (!this._loader || !this._registry) return;

            var loadedIds = this._loader.getLoadedIds();
            var fileMap = this._loader.getPluginFileMap();
            var disabledSet = new Set(this._loader.getDisabledIds());

            for (var i = 0; i < loadedIds.length; i++) {
                var id = String(loadedIds[i]);
                var typeConfig = this._registry.getType(id);
                var isDisabled = disabledSet.has(id);

                var name = typeConfig ? typeConfig.name : id;
                var icon = typeConfig ? typeConfig.icon : 'icon-layout';
                var meta = typeConfig ? (typeConfig.metadata || {}) : {};
                var description = typeConfig ? (typeConfig.description || '') : '';

                this._plugins.set(id, {
                    id: id,
                    name: name,
                    version: meta.version || '1.0.0',
                    author: meta.author || '',
                    icon: icon,
                    description: description,
                    source: 'folder',
                    enabled: !isDisabled,
                    url: null,
                    file: fileMap[id] || '',
                    installedAt: 0
                });
            }
        }

        async _tryRestoreFolder() {
            if (!this._folderSource) return;

            try {
                var ok = await this._folderSource.restore();
                if (ok) {
                    this._folderState = 'granted';
                    this._folderName = this._folderSource.getDisplayName() || '';
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
                        this._folderName = this._folderSource.getDisplayName() || '';
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

        async _trySoftRestoreFolder() {
            if (!this._folderSource || !this._loader) return false;

            var ok = await this._folderSource.requestPermission();
            if (!ok) return false;

            this._folderState = 'granted';
            this._folderName = this._folderSource.getDisplayName() || this._folderName;

            try {
                var scanOk = await this._loader.scan();
                if (scanOk) {
                    await this._loader.loadAll();
                    this._refreshPluginsFromRegistry();
                }
            } catch (e) {
                console.warn('[PluginSystem] soft scan failed:', e);
                return false;
            }

            this._emit('plugins:folder-changed', {
                state: this._folderState,
                name: this._folderName
            });
            this._emit('plugins:changed', { plugins: this.getAllPlugins() });
            return true;
        }

        async _reloadFolderPlugins() {
            if (!this._loader) return false;

            this._clearFolderPlugins();
            this._loader.reset();

            try {
                var ok = await this._loader.scan();
                if (!ok) return false;

                await this._loader.loadAll();
                this._refreshPluginsFromRegistry();

                this._emit('plugins:changed', { plugins: this.getAllPlugins() });
                return true;
            } catch (err) {
                console.error('[PluginSystem] _reloadFolderPlugins error:', err);
                return false;
            }
        }

        async pickFolder() {
            if (!this._folderSource) return false;

            try {
                this._clearFolderPlugins();
                if (this._loader) this._loader.resetFull();

                var ok = await this._folderSource.pick();
                if (!ok) return false;

                this._folderState = 'granted';
                this._folderName = this._folderSource.getDisplayName() || '';

                if (this._loader) {
                    var scanOk = await this._loader.scan();
                    if (scanOk) {
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
                this._clearFolderPlugins();
                this._loader.reset();

                var ok = await this._loader.scan();
                if (!ok) return false;

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

        getAllPlugins() {
            this._lazySyncFromLoader();

            var out = [];
            var seen = Object.create(null);
            if (this._registry && typeof this._registry.getAllTypes === 'function') {
                var types = this._registry.getAllTypes() || [];
                for (var i = 0; i < types.length; i++) {
                    var t = types[i];
                    if (!t || !t.id) continue;

                    var id = String(t.id);
                    if (seen[id]) continue;
                    seen[id] = true;

                    var meta = t.metadata || {};
                    var extra = this._plugins.get(id) || null;

                    out.push({
                        id: id,
                        name: t.name || id,
                        version: meta.version || '1.0.0',
                        author: meta.author || (extra && extra.author) || 'LSYSTEM',
                        icon: t.icon || (extra && extra.icon) || 'icon-layout',
                        description: t.description || (extra && extra.description) || '',
                        source: (extra && extra.source) || 'core',
                        enabled: true,
                        url: (extra && extra.url) || null,
                        file: (extra && extra.file) || null,
                        installedAt: (extra && extra.installedAt) || 0
                    });
                }
            }

            var self = this;
            this._plugins.forEach(function(p, id) {
                if (seen[id]) return;
                seen[id] = true;

                out.push({
                    id: id,
                    name: p.name || id,
                    version: p.version || '1.0.0',
                    author: p.author || '',
                    icon: p.icon || 'icon-layout',
                    description: p.description || '',
                    source: p.source || 'folder',
                    enabled: !!p.enabled,
                    url: p.url || null,
                    file: p.file || null,
                    installedAt: p.installedAt || 0
                });
            });

            return out;
        }

        _lazySyncFromLoader() {
            if (!this._loader || !this._registry) return;

            var loadedIds = this._loader.getLoadedIds() || [];
            var fileMap = this._loader.getPluginFileMap();
            var disabledSet = new Set(this._loader.getDisabledIds());

            for (var i = 0; i < loadedIds.length; i++) {
                var id = String(loadedIds[i]);
                if (this._plugins.has(id)) continue;

                var typeConfig = this._registry.getType(id);
                if (!typeConfig) continue;

                var meta = typeConfig.metadata || {};
                this._plugins.set(id, {
                    id: id,
                    name: typeConfig.name || id,
                    version: meta.version || '1.0.0',
                    author: meta.author || '',
                    icon: typeConfig.icon || 'icon-layout',
                    description: typeConfig.description || '',
                    source: 'folder',
                    enabled: !disabledSet.has(id),
                    url: null,
                    file: fileMap[id] || '',
                    installedAt: 0
                });
            }
        }

        getActivePlugins() {
            return this.getAllPlugins().filter(function(p) { return p.enabled; });
        }

        getHiddenPlugins() {
            return this.getAllPlugins().filter(function(p) { return !p.enabled; });
        }

        async enablePlugin(id) {
            var plugin = this._plugins.get(id);
            if (!plugin) return false;

            if (plugin.source === 'folder') {
                if (!this._loader) return false;
                var file = this._loader.getPluginFileMap()[id];
                if (!file) return false;

                this._loader.setDisabled(id, false);
                var ok = await this._loader.reloadFile(file);

                if (!ok) {
                    var typeConfig = this._registry ? this._registry.getType(id) : null;
                    if (!typeConfig) return false;
                }

                this._refreshPluginsFromRegistry();
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

        async uninstallPlugin(id) {
            var plugin = this._plugins.get(id);
            if (!plugin) return false;

            if (plugin.source === 'folder') {
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

        destroy() {
            this._plugins.clear();
            this._isLoaded = false;
            this._folderSource = null;
            this._urlStorage = null;
            this._loader = null;
        }
    }

    if (typeof window !== 'undefined') {
        window.PluginSystem = PluginSystem;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginSystem: PluginSystem };
    }

})();