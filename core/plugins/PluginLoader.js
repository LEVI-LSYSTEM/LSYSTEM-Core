// core/plugins/PluginLoader.js
// Версия 5.1.0

(function() {
    'use strict';

    var DISABLED_KEY = 'lsystem-plugin-disabled';
    var MAX_SCAN_DEPTH = 32;

    function _isJsFileName(name) {
        if (window.LsFileTypes && typeof window.LsFileTypes.isJsFile === 'function') {
            return window.LsFileTypes.isJsFile(name);
        }
        return /\.js$/i.test(name);
    }

    function _normalizePath(p) {
        if (!p) return '';

        var s = String(p)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');

        var parts = s.split('/');
        var stack = [];

        for (var i = 0; i < parts.length; i++) {
            var seg = parts[i];
            if (seg === '' || seg === '.') continue;
            if (seg === '..') {
                if (stack.length > 0) stack.pop();
                continue;
            }
            stack.push(seg);
        }

        return stack.join('/');
    }

    function _dirnameOf(path) {
        var norm = _normalizePath(path);
        var idx = norm.lastIndexOf('/');
        return idx >= 0 ? norm.slice(0, idx) : '';
    }

    function _isPathInFolder(filePath, folderName) {
        var norm = _normalizePath(filePath);
        var folder = _normalizePath(folderName);
        if (!folder) return true;
        return norm.indexOf(folder + '/') === 0;
    }

    function _relPathWithinFolder(filePath, folderName) {
        var norm = _normalizePath(filePath);
        var folder = _normalizePath(folderName);
        if (!folder) return norm;
        if (norm === folder) return '';
        return norm.slice(folder.length + 1);
    }

    function _isPluginClass(value) {
        if (typeof value !== 'function') return false;
        if (!value.meta || typeof value.meta !== 'object') return false;
        if (!value.meta.id || typeof value.meta.id !== 'string') return false;
        if (!value.meta.id.trim()) return false;
        return true;
    }

    class PluginLoader {
        constructor(opts) {
            opts = opts || {};

            this.folderSource = opts.folderSource || null;
            this.registry = opts.registry || null;

            this._sortedFiles = [];
            this._pathIndex = new Map();
            this._assetIndex = new Map();
            this._assetDuplicates = [];
            this._pluginFileMap = new Map();
            this._filePluginMap = new Map();
            this._loadedIds = new Set();
            this._disabledIds = this._readDisabledIds();
            this._scanned = false;

            this._fileCache = new Map();
            this._moduleCache = new Map();
            this._loading = new Map();
        }

        _readDisabledIds() {
            try {
                var raw = localStorage.getItem(DISABLED_KEY);
                if (!raw) return new Set();
                var arr = JSON.parse(raw);
                if (!Array.isArray(arr)) return new Set();
                return new Set(arr.map(String));
            } catch (e) {
                return new Set();
            }
        }

        _writeDisabledIds() {
            try {
                localStorage.setItem(DISABLED_KEY, JSON.stringify(Array.from(this._disabledIds)));
            } catch (e) {}
        }

        isDisabled(pluginId) {
            return this._disabledIds.has(String(pluginId));
        }

        setDisabled(pluginId, disabled) {
            var id = String(pluginId);
            if (disabled) this._disabledIds.add(id);
            else this._disabledIds.delete(id);
            this._writeDisabledIds();
        }

        async scan() {
            this._sortedFiles = [];
            this._pathIndex.clear();
            this._assetIndex.clear();
            this._assetDuplicates = [];
            this._fileCache.clear();
            this._moduleCache.clear();
            this._loading.clear();

            if (!this.folderSource) {
                console.warn('[PluginLoader] scan: no folderSource');
                this._scanned = false;
                return false;
            }

            var jsFiles = [];
            await this._scanTree('', jsFiles, 0);

            jsFiles.sort();
            this._sortedFiles = jsFiles.map(function(p) {
                return { path: p };
            });

            for (var i = 0; i < this._sortedFiles.length; i++) {
                var fp = this._sortedFiles[i].path;
                this._pathIndex.set(fp, i);
                try {
                    var content = await this.folderSource.readFile(fp);
                    this._fileCache.set(fp, content);
                } catch (err) {
                    console.warn('[PluginLoader] scan: cannot preload ' + fp + ': ' + err.message);
                }
            }

            this._scanned = true;
            return true;
        }

        async _scanTree(currentPath, jsFiles, depth) {
            if (depth > MAX_SCAN_DEPTH) {
                console.warn('[PluginLoader] scan: max depth at ' + currentPath);
                return;
            }

            var entries;
            try {
                entries = await this.folderSource.listDir(currentPath);
            } catch (err) {
                return;
            }

            for (var i = 0; i < entries.length; i++) {
                var name = entries[i];

                if (name.charAt(0) === '_' || name.charAt(0) === '.') continue;

                var fullPath = currentPath ? (currentPath + '/' + name) : name;

                if (this.folderSource.isDirectory(name)) {
                    await this._scanTree(fullPath, jsFiles, depth + 1);
                    continue;
                }

                if (_isJsFileName(name)) {
                    jsFiles.push(fullPath);
                    continue;
                }

                var slash = name.lastIndexOf('/');
                var baseName = slash >= 0 ? name.slice(slash + 1) : name;

                if (this._assetIndex.has(baseName)) {
                    var existing = this._assetIndex.get(baseName);
                    var dup = null;
                    for (var d = 0; d < this._assetDuplicates.length; d++) {
                        if (this._assetDuplicates[d].name === baseName) {
                            dup = this._assetDuplicates[d];
                            break;
                        }
                    }
                    if (dup) {
                        dup.paths.push(fullPath);
                    } else {
                        this._assetDuplicates.push({
                            name: baseName,
                            paths: [existing, fullPath]
                        });
                    }
                    if (fullPath < existing) {
                        this._assetIndex.set(baseName, fullPath);
                    }
                } else {
                    this._assetIndex.set(baseName, fullPath);
                }
            }
        }

        async loadAll() {
            if (!this._scanned) {
                var ok = await this.scan();
                if (!ok) return [];
            }

            var newIds = [];

            for (var i = 0; i < this._sortedFiles.length; i++) {
                var entry = this._sortedFiles[i];
                var ids = await this._executeFile(entry.path);
                for (var k = 0; k < ids.length; k++) {
                    newIds.push(ids[k]);
                    this._loadedIds.add(ids[k]);
                }
            }

            return newIds;
        }

        async reloadFile(path) {
            var norm = _normalizePath(path);

            var code = this._fileCache.get(norm);
            if (code == null) {
                try {
                    code = await this.folderSource.readFile(norm);
                    this._fileCache.set(norm, code);
                } catch (err) {
                    console.warn('[PluginLoader] reloadFile: cannot read ' + norm + ': ' + err.message);
                    return false;
                }
            }

            this._moduleCache.delete(norm);
            var ids = await this._executeFile(norm);

            for (var i = 0; i < ids.length; i++) {
                this._loadedIds.add(ids[i]);
            }

            return ids.length > 0;
        }

        async _executeFile(path) {
            if (!this.folderSource) return [];

            if (this._moduleCache.has(path)) {
                var cached = this._moduleCache.get(path);
                var cachedClasses = this._discoverClasses(cached);
                var present = [];
                for (var ci = 0; ci < cachedClasses.length; ci++) {
                    var cid = cachedClasses[ci].meta && cachedClasses[ci].meta.id;
                    if (!cid) continue;
                    if (this.registry && typeof this.registry.hasType === 'function'
                        && this.registry.hasType(cid)) {
                        present.push(cid);
                    }
                }
                return present;
            }

            var code = this._fileCache.get(path);
            if (code == null) {
                try {
                    code = await this.folderSource.readFile(path);
                    this._fileCache.set(path, code);
                } catch (err) {
                    console.warn('[PluginLoader] Cannot read ' + path + ': ' + err.message);
                    return [];
                }
            }

            var beforeIds = this._snapshotRegistry();
            var moduleRef = { exports: {} };

            this._loading.set(path, moduleRef);
            try {
                this._execute(path, code, moduleRef);
            } finally {
                this._loading.delete(path);
            }
            this._moduleCache.set(path, moduleRef);

            var discovered = this._discoverClasses(moduleRef);

            if (discovered.length > 0) {
                for (var i = 0; i < discovered.length; i++) {
                    this._registerClass(discovered[i], path);
                }
            }

            var addedIds = this._diffRegistry(beforeIds);

            for (var j = 0; j < addedIds.length; j++) {
                var id = addedIds[j];
                this._pluginFileMap.set(id, path);
                this._filePluginMap.set(path, id);

                if (this._disabledIds.has(String(id))) {
                    this._unregisterId(id);
                }
            }

            return addedIds;
        }

        _execute(path, code, moduleRef) {
            var self = this;
            var dir = _dirnameOf(path);

            function localRequire(reqPath) {
                return self._resolveRequire(dir, reqPath);
            }

            try {
                var fn = new Function(
                    'module', 'exports', 'console', 'require', '__filename', '__dirname',
                    '"use strict";\n' + code
                );
                fn(moduleRef, moduleRef.exports, console, localRequire, path, dir);
            } catch (err) {
                console.warn('[PluginLoader] Error executing ' + path + ': ' + err.message);
            }
        }

        _resolveRequire(fromDir, reqPath) {
            if (!reqPath || typeof reqPath !== 'string') {
                throw new Error('require: path must be a string');
            }

            var candidates;

            if (reqPath.charAt(0) === '.') {
                var resolved = _normalizePath(fromDir + '/' + reqPath);
                candidates = [resolved, resolved + '.js', resolved + '/index.js'];
            } else {
                var root = _normalizePath(reqPath);
                candidates = [root, root + '.js', root + '/index.js'];
            }

            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                if (this._moduleCache.has(c)) {
                    return this._moduleCache.get(c).exports;
                }
            }

            var target = null;
            for (var k = 0; k < candidates.length; k++) {
                if (this._pathIndex.has(candidates[k])) {
                    target = candidates[k];
                    break;
                }
            }

            if (!target) {
                throw new Error('require: cannot resolve "' + reqPath + '" from "' + fromDir + '"');
            }

            if (this._loading.has(target)) {
                return this._loading.get(target).exports;
            }

            var code = this._fileCache.get(target);
            if (code == null) {
                throw new Error('require: "' + target + '" not in cache');
            }

            var moduleRef = { exports: {} };
            this._loading.set(target, moduleRef);

            try {
                var dir = _dirnameOf(target);
                var self = this;
                function nestedRequire(p) { return self._resolveRequire(dir, p); }

                var fn = new Function(
                    'module', 'exports', 'console', 'require', '__filename', '__dirname',
                    '"use strict";\n' + code
                );
                fn(moduleRef, moduleRef.exports, console, nestedRequire, target, dir);
            } finally {
                this._loading.delete(target);
            }

            this._moduleCache.set(target, moduleRef);
            return moduleRef.exports;
        }

        _discoverClasses(moduleRef) {
            var out = [];
            var seen = new Set();

            var push = function(v) {
                if (!_isPluginClass(v)) return;
                if (seen.has(v)) return;
                seen.add(v);
                out.push(v);
            };

            var ex = moduleRef && moduleRef.exports;

            if (typeof ex === 'function') {
                push(ex);
            } else if (Array.isArray(ex)) {
                for (var i = 0; i < ex.length; i++) push(ex[i]);
            } else if (ex && typeof ex === 'object') {
                for (var key in ex) {
                    if (!Object.prototype.hasOwnProperty.call(ex, key)) continue;
                    push(ex[key]);
                }
            }

            return out;
        }

        _registerClass(Class, path) {
            if (!this.registry || typeof this.registry.registerFromClass !== 'function') {
                console.warn('[PluginLoader] registerFromClass not available — cannot register '
                    + (Class.meta && Class.meta.id));
                return false;
            }

            var id = Class.meta && Class.meta.id;
            if (!id) return false;

            if (typeof this.registry.hasType === 'function' && this.registry.hasType(id)) {
                return false;
            }

            try {
                return !!this.registry.registerFromClass(Class);
            } catch (e) {
                console.warn('[PluginLoader] registerFromClass("' + id + '") threw: ' + e.message);
                return false;
            }
        }

        _snapshotRegistry() {
            if (!this.registry || typeof this.registry.getAllTypes !== 'function') {
                return new Set();
            }
            var arr = this.registry.getAllTypes() || [];
            return new Set(arr.map(function(t) { return t.id; }));
        }

        _diffRegistry(before) {
            if (!this.registry || typeof this.registry.getAllTypes !== 'function') {
                return [];
            }
            var arr = this.registry.getAllTypes() || [];
            var after = arr.map(function(t) { return t.id; });
            var diff = [];
            for (var i = 0; i < after.length; i++) {
                if (!before.has(after[i])) diff.push(after[i]);
            }
            return diff;
        }

        _unregisterId(id) {
            if (!this.registry || typeof this.registry.unregister !== 'function') return;
            try { this.registry.unregister(id); } catch (e) {}
        }

        listFolder(folderName) {
            var out = [];
            var folder = _normalizePath(folderName);

            for (var i = 0; i < this._sortedFiles.length; i++) {
                var p = this._sortedFiles[i].path;
                if (_isPathInFolder(p, folder)) out.push(p);
            }

            this._assetIndex.forEach(function(fullPath) {
                if (_isPathInFolder(fullPath, folder)) out.push(fullPath);
            });

            out.sort();
            return out;
        }

        listFolderByRelPath(folderName) {
            var out = [];
            var folder = _normalizePath(folderName);

            for (var i = 0; i < this._sortedFiles.length; i++) {
                var p = this._sortedFiles[i].path;
                if (_isPathInFolder(p, folder)) {
                    out.push({ fullPath: p, relPath: _relPathWithinFolder(p, folder) });
                }
            }

            this._assetIndex.forEach(function(fullPath) {
                if (_isPathInFolder(fullPath, folder)) {
                    out.push({ fullPath: fullPath, relPath: _relPathWithinFolder(fullPath, folder) });
                }
            });

            out.sort(function(a, b) { return a.relPath.localeCompare(b.relPath); });
            return out;
        }

        async readFile(path) {
            if (!this.folderSource) throw new Error('No folder source');
            return await this.folderSource.readFile(_normalizePath(path));
        }

        async readAsset(name) {
            var path = this._assetIndex.get(String(name));
            if (!path) return null;
            try {
                return await this.folderSource.readFile(path);
            } catch (err) {
                console.warn('[PluginLoader] readAsset(' + name + ') failed: ' + err.message);
                return null;
            }
        }

        resolveAsset(name) {
            return this._assetIndex.get(String(name)) || null;
        }

        getAssetIndex() {
            var obj = {};
            this._assetIndex.forEach(function(path, name) { obj[name] = path; });
            return obj;
        }

        getAssetDuplicates() {
            return this._assetDuplicates.map(function(d) {
                return { name: d.name, paths: d.paths.slice() };
            });
        }

        getSortedFiles() {
            return this._sortedFiles.map(function(f) { return f.path; });
        }

        getLoadedIds() {
            return Array.from(this._loadedIds);
        }

        hasLoaded(id) {
            return this._loadedIds.has(String(id));
        }

        getLoadedCount() {
            return this._loadedIds.size;
        }

        getPluginFileMap() {
            var obj = {};
            this._pluginFileMap.forEach(function(path, id) { obj[id] = path; });
            return obj;
        }

        getFilePluginMap() {
            var obj = {};
            this._filePluginMap.forEach(function(id, path) { obj[path] = id; });
            return obj;
        }

        getDisabledIds() {
            return Array.from(this._disabledIds);
        }

        reset() {
            this._sortedFiles = [];
            this._pathIndex.clear();
            this._assetIndex.clear();
            this._assetDuplicates = [];
            this._pluginFileMap.clear();
            this._filePluginMap.clear();
            this._loadedIds.clear();
            this._fileCache.clear();
            this._moduleCache.clear();
            this._loading.clear();
            this._scanned = false;
        }

        resetFull() {
            this.reset();
            this._disabledIds = this._readDisabledIds();
        }
    }

    if (typeof window !== 'undefined') {
        window.PluginLoader = PluginLoader;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginLoader: PluginLoader };
    }

})();