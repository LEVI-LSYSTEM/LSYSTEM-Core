// core/plugins/PluginFolderSource.js
// Версия 2.0.0 — использует единый PluginDB.
//
// Абстракция рабочей папки плагинов.
//
// Три бэкенда:
//   - ChromiumFolderSource — FileSystemAccess API (Chrome, Edge, Opera, Brave)
//   - InputFolderSource    — <input webkitdirectory> (Firefox, Safari, старые)
//   - DesktopFolderSource  — заглушка под Electron/Tauri (Tauri v2+)
//
// Общий интерфейс:
//   pick, restore, queryPermission, requestPermission,
//   listDir, readFile, exists, isDirectory,
//   persist, forget, getDisplayName, isAvailable, destroy
//
// Фабрика PluginFolderSource.create() выбирает бэкенд по возможностям.
//
// Изменения относительно 1.0.0:
//   - Убраны локальные _openDB / _idbGet / _idbSet / _idbDel.
//   - Все обращения к IndexedDB идут через window.PluginDB.
//   - Хранилище 'folder-handles' теперь описано в PluginDB.SCHEMA.

(function() {
    'use strict';

    var _IDB_KEY = 'active-folder';

    function _getStoreName() {
        return (window.PluginDB && window.PluginDB.STORE_FOLDER)
            ? window.PluginDB.STORE_FOLDER
            : 'folder-handles';
    }

    function _idbGet(key) {
        if (!window.PluginDB) {
            return Promise.reject(new Error('PluginDB not available'));
        }
        return window.PluginDB.withStore(_getStoreName(), 'readonly', function(store) {
            return window.PluginDB.wrapRequest(store.get(key));
        });
    }

    function _idbSet(key, value) {
        if (!window.PluginDB) {
            return Promise.reject(new Error('PluginDB not available'));
        }
        return window.PluginDB.withStore(_getStoreName(), 'readwrite', function(store) {
            store.put(value, key);
            return true;
        });
    }

    function _idbDel(key) {
        if (!window.PluginDB) {
            return Promise.reject(new Error('PluginDB not available'));
        }
        return window.PluginDB.withStore(_getStoreName(), 'readwrite', function(store) {
            store.delete(key);
            return true;
        });
    }

    function _normalizePath(p) {
        if (!p) return '';
        p = String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
        return p;
    }

    function _splitPath(p) {
        p = _normalizePath(p);
        if (!p) return [];
        return p.split('/').filter(Boolean);
    }

    class PluginFolderSourceBase {
        constructor() {
            this._displayName = '';
            this._available = false;
        }

        isAvailable() { return this._available; }
        getDisplayName() { return this._displayName; }

        async pick() { throw new Error('pick() not implemented'); }
        async restore() { return false; }
        async queryPermission() { return null; }
        async requestPermission() { return false; }

        async listDir() { throw new Error('listDir() not implemented'); }
        async readFile() { throw new Error('readFile() not implemented'); }
        async exists() { throw new Error('exists() not implemented'); }

        isDirectory(name) {
            if (!name) return false;
            var s = String(name);
            if (s.indexOf('.') === -1) return true;
            return /\.(js|json|css|html|svg|md|txt|lsp|lsu)$/i.test(s) ? false : true;
        }

        async persist() { return false; }
        forget() {}
        destroy() {}
    }

    class ChromiumFolderSource extends PluginFolderSourceBase {
        constructor() {
            super();
            this._available = (
                typeof window.showDirectoryPicker === 'function'
            );
            this._handle = null;
            this._displayName = '';
        }

        async pick() {
            if (!this._available) return false;

            try {
                var handle = await window.showDirectoryPicker({
                    id: 'lsystem-plugins',
                    mode: 'read',
                    startIn: 'documents'
                });

                if (!handle || handle.kind !== 'directory') return false;

                this._handle = handle;
                this._displayName = handle.name || 'plugins';
                await this.persist();
                return true;
            } catch (err) {
                if (err && err.name === 'AbortError') return false;
                console.error('[PluginFolderSource] pick error:', err);
                return false;
            }
        }

        async restore() {
            if (!this._available) return false;

            try {
                var handle = await _idbGet(_IDB_KEY);
                if (!handle) return false;

                if (typeof handle.queryPermission === 'function') {
                    var perm = await handle.queryPermission({ mode: 'read' });
                    if (perm === 'granted') {
                        this._handle = handle;
                        this._displayName = handle.name || 'plugins';
                        return true;
                    }
                    this._handle = handle;
                    this._displayName = handle.name || 'plugins';
                    return false;
                }

                return false;
            } catch (err) {
                console.warn('[PluginFolderSource] restore error:', err);
                return false;
            }
        }

        async queryPermission() {
            if (!this._handle) return null;
            if (typeof this._handle.queryPermission !== 'function') return null;
            try {
                return await this._handle.queryPermission({ mode: 'read' });
            } catch (err) {
                return null;
            }
        }

        async requestPermission() {
            if (!this._handle) return false;
            if (typeof this._handle.requestPermission !== 'function') return false;
            try {
                var perm = await this._handle.requestPermission({ mode: 'read' });
                return perm === 'granted';
            } catch (err) {
                console.error('[PluginFolderSource] requestPermission error:', err);
                return false;
            }
        }

        async listDir(relativePath) {
            if (!this._handle) throw new Error('Folder not picked');

            var parts = _splitPath(relativePath);
            var dir = this._handle;

            for (var i = 0; i < parts.length; i++) {
                dir = await dir.getDirectoryHandle(parts[i]);
            }

            var out = [];
            for await (var entry of dir.values()) {
                out.push(entry.name);
            }
            return out.sort();
        }

        async readFile(relativePath) {
            if (!this._handle) throw new Error('Folder not picked');

            var parts = _splitPath(relativePath);
            var fileName = parts.pop();
            var dir = this._handle;

            for (var i = 0; i < parts.length; i++) {
                dir = await dir.getDirectoryHandle(parts[i]);
            }

            var fileHandle = await dir.getFileHandle(fileName);
            var file = await fileHandle.getFile();
            return await file.text();
        }

        async exists(relativePath) {
            if (!this._handle) return false;

            var parts = _splitPath(relativePath);
            if (parts.length === 0) return true;

            var fileName = parts.pop();
            var dir = this._handle;

            try {
                for (var i = 0; i < parts.length; i++) {
                    dir = await dir.getDirectoryHandle(parts[i]);
                }
                await dir.getFileHandle(fileName);
                return true;
            } catch (err) {
                try {
                    var d = this._handle;
                    for (var j = 0; j < parts.length; j++) {
                        d = await d.getDirectoryHandle(parts[j]);
                    }
                    await d.getDirectoryHandle(fileName);
                    return true;
                } catch (err2) {
                    return false;
                }
            }
        }

        async persist() {
            if (!this._handle) return false;
            try {
                await _idbSet(_IDB_KEY, this._handle);
                return true;
            } catch (err) {
                console.warn('[PluginFolderSource] persist error:', err);
                return false;
            }
        }

        forget() {
            this._handle = null;
            this._displayName = '';
            try { _idbDel(_IDB_KEY); } catch (e) {}
        }
    }

    class InputFolderSource extends PluginFolderSourceBase {
        constructor() {
            super();
            this._available = true;
            this._files = new Map();
            this._dirs = new Set();
            this._displayName = '';
        }

        _pickWithInput() {
            return new Promise((resolve) => {
                var input = document.createElement('input');
                input.type = 'file';
                input.webkitdirectory = true;
                input.multiple = true;
                input.style.display = 'none';

                var resolved = false;

                input.addEventListener('change', function() {
                    if (resolved) return;
                    resolved = true;
                    var files = Array.from(input.files || []);
                    document.body.removeChild(input);
                    resolve(files);
                });

                input.addEventListener('cancel', function() {
                    if (resolved) return;
                    resolved = true;
                    document.body.removeChild(input);
                    resolve([]);
                });

                document.body.appendChild(input);
                input.click();
            });
        }

        async pick() {
            try {
                var files = await this._pickWithInput();
                if (!files || files.length === 0) return false;

                this._files.clear();
                this._dirs.clear();

                var rootName = '';

                for (var i = 0; i < files.length; i++) {
                    var file = files[i];
                    var rel = file.webkitRelativePath || file.name;

                    var parts = rel.split('/').filter(Boolean);
                    if (parts.length === 0) continue;

                    if (!rootName) rootName = parts[0];

                    for (var j = 1; j < parts.length; j++) {
                        var dirPath = parts.slice(1, j).join('/');
                        if (dirPath) this._dirs.add(dirPath);
                    }

                    var relFromRoot = parts.slice(1).join('/');
                    if (relFromRoot) {
                        this._files.set(relFromRoot, file);
                    }
                }

                this._displayName = rootName || 'plugins';
                return true;
            } catch (err) {
                console.error('[PluginFolderSource] input pick error:', err);
                return false;
            }
        }

        async restore() {
            return false;
        }

        async queryPermission() { return null; }
        async requestPermission() { return false; }

        async listDir(relativePath) {
            var norm = _normalizePath(relativePath);
            var out = new Set();

            this._dirs.forEach(function(dirPath) {
                if (norm === '') {
                    var first = dirPath.split('/')[0];
                    if (first) out.add(first);
                } else if (dirPath === norm) {
                    // skip
                } else if (dirPath.indexOf(norm + '/') === 0) {
                    var rest = dirPath.slice(norm.length + 1);
                    var first2 = rest.split('/')[0];
                    if (first2) out.add(first2);
                }
            });

            this._files.forEach(function(file, path) {
                if (norm === '') {
                    if (path.indexOf('/') === -1) out.add(path);
                } else if (path.indexOf(norm + '/') === 0) {
                    var rest2 = path.slice(norm.length + 1);
                    if (rest2.indexOf('/') === -1) out.add(rest2);
                }
            });

            return Array.from(out).sort();
        }

        async readFile(relativePath) {
            var norm = _normalizePath(relativePath);
            var file = this._files.get(norm);
            if (!file) throw new Error('File not found: ' + norm);
            return await file.text();
        }

        async exists(relativePath) {
            var norm = _normalizePath(relativePath);
            if (this._files.has(norm)) return true;
            return this._dirs.has(norm);
        }

        async persist() {
            return false;
        }

        forget() {
            this._files.clear();
            this._dirs.clear();
            this._displayName = '';
        }
    }

    class DesktopFolderSource extends PluginFolderSourceBase {
        constructor() {
            super();
            this._available = false;
            this._basePath = null;
            this._displayName = '';

            if (window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.fs) {
                this._available = true;
                this._mode = 'tauri';
            }
            else if (window.electronAPI && typeof window.electronAPI.pickFolder === 'function') {
                this._available = true;
                this._mode = 'electron';
            }
        }

        async pick() {
            if (!this._available) return false;

            try {
                if (this._mode === 'tauri') {
                    var selected = await window.__TAURI__.dialog.open({
                        directory: true,
                        multiple: false
                    });
                    if (!selected) return false;
                    this._basePath = selected;
                    this._displayName = selected.split(/[\\/]/).pop() || selected;
                    return true;
                }

                if (this._mode === 'electron') {
                    var res = await window.electronAPI.pickFolder();
                    if (!res || !res.path) return false;
                    this._basePath = res.path;
                    this._displayName = res.name || res.path;
                    return true;
                }
            } catch (err) {
                console.error('[PluginFolderSource] desktop pick error:', err);
            }

            return false;
        }

        async restore() {
            if (!this._available) return false;
            try {
                var stored = localStorage.getItem('lsystem-plugin-folder-path');
                if (!stored) return false;
                this._basePath = stored;
                this._displayName = stored.split(/[\\/]/).pop() || stored;
                return true;
            } catch (e) {
                return false;
            }
        }

        async queryPermission() { return 'granted'; }
        async requestPermission() { return true; }

        _join(relativePath) {
            if (!this._basePath) throw new Error('Folder not picked');
            var parts = _splitPath(relativePath);
            if (parts.length === 0) return this._basePath;
            var sep = this._basePath.indexOf('\\') !== -1 ? '\\' : '/';
            return this._basePath + sep + parts.join(sep);
        }

        async listDir(relativePath) {
            if (!this._basePath) throw new Error('Folder not picked');

            if (this._mode === 'tauri') {
                var entries = await window.__TAURI__.fs.readDir(this._join(relativePath));
                return entries.map(function(e) { return e.name; }).sort();
            }

            if (this._mode === 'electron') {
                var list = await window.electronAPI.readDir(this._join(relativePath));
                return list.sort();
            }

            throw new Error('Desktop folder source not ready');
        }

        async readFile(relativePath) {
            if (!this._basePath) throw new Error('Folder not picked');

            if (this._mode === 'tauri') {
                return await window.__TAURI__.fs.readTextFile(this._join(relativePath));
            }

            if (this._mode === 'electron') {
                return await window.electronAPI.readFile(this._join(relativePath));
            }

            throw new Error('Desktop folder source not ready');
        }

        async exists(relativePath) {
            if (!this._basePath) return false;
            try {
                if (this._mode === 'tauri') {
                    await window.__TAURI__.fs.stat(this._join(relativePath));
                    return true;
                }
                if (this._mode === 'electron') {
                    return await window.electronAPI.exists(this._join(relativePath));
                }
            } catch (e) {
                return false;
            }
            return false;
        }

        async persist() {
            if (!this._basePath) return false;
            try {
                localStorage.setItem('lsystem-plugin-folder-path', this._basePath);
                return true;
            } catch (e) {
                return false;
            }
        }

        forget() {
            this._basePath = null;
            this._displayName = '';
            try {
                localStorage.removeItem('lsystem-plugin-folder-path');
            } catch (e) {}
        }
    }

    var PluginFolderSource = {
        create: function() {
            var desktop = new DesktopFolderSource();
            if (desktop.isAvailable()) {
                return desktop;
            }

            var chromium = new ChromiumFolderSource();
            if (chromium.isAvailable()) {
                return chromium;
            }

            return new InputFolderSource();
        },

        ChromiumFolderSource: ChromiumFolderSource,
        InputFolderSource: InputFolderSource,
        DesktopFolderSource: DesktopFolderSource
    };

    if (typeof window !== 'undefined') {
        window.PluginFolderSource = PluginFolderSource;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginFolderSource: PluginFolderSource };
    }

})();