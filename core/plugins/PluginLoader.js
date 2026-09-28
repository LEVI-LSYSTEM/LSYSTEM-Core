// core/plugins/PluginLoader.js
// Версия 3.0.0 — Автодискаверинг классов-плагинов.
//
// Модель:
//   - Один manifest.json в корне рабочей папки. ОБЯЗАТЕЛЕН.
//   - manifest.files = [{ path, priority }, ...]. Только .js.
//   - Файлы выполняются по возрастанию priority.
//   - После выполнения файла загрузчик ИЩЕТ классы-плагины в module.exports.
//     Класс считается плагином, если это функция с static meta.id.
//   - Найденные классы регистрируются через registry.registerFromClass.
//   - Плагин = окно. Определяется автоматически: если после выполнения файла
//     в WindowRegistry появился новый тип — это плагин. Если нет — просто
//     shared-утилита.
//   - Выключенные плагины (localStorage 'lsystem-plugin-disabled') выполняются,
//     но их типы снимаются из реестра сразу после регистрации.
//   - Ассеты (любые файлы, не только .js) индексируются по имени.
//
// Контракт плагина (единственный, что должен знать разработчик):
//
//     class MyWindow extends window.BaseWindowInstance {
//         static get meta() { return { id: 'my-window', name: 'My Window', ... }; }
//         // ...
//     }
//     module.exports = { MyWindow };
//
//   Всё остальное — забота ядра.
//
// API:
//   new PluginLoader({ folderSource, registry, onLog })
//   await scan()                      — прочитать манифест, построить индекс
//   await loadAll()                   — выполнить все файлы по priority
//   listFolder(folderName)            — файлы из папки (для NodeGraph)
//   readFile(path)                    — содержимое файла
//   readAsset(name)                   — содержимое ассета по имени
//   resolveAsset(name)                — путь ассета по имени
//   getAssetIndex()                   — полный индекс ассетов
//   getManifest()                     — текущий манифест
//   getLoadedIds()                    — id плагинов, зарегистрированных в реестре
//   getPluginFileMap()                — id → путь файла
//   getDisabledIds()                  — id выключенных плагинов
//   reset()                           — сбросить состояние

(function() {
    'use strict';

    console.log('[PluginLoader] Loading v3.0.0...');

    var MANIFEST_FILE = 'manifest.json';
    var DISABLED_KEY = 'lsystem-plugin-disabled';

    // ================================================================
    // УТИЛИТЫ
    // ================================================================

    function _endsWithJs(name) {
        return /\.js$/i.test(name);
    }

    function _endsWithJson(name) {
        return /\.json$/i.test(name);
    }

    function _normalizePath(p) {
        if (!p) return '';
        return String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    }

    function _splitPath(p) {
        var norm = _normalizePath(p);
        if (!norm) return [];
        return norm.split('/').filter(Boolean);
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

    function _sortByPriorityThenPath(a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.path.localeCompare(b.path);
    }

    // ================================================================
    // ПРОВЕРКА: ЯВЛЯЕТСЯ ЛИ ЗНАЧЕНИЕ КЛАССОМ-ПЛАГИНОМ
    // ================================================================
    //
    // Класс-плагин — это функция с непустым static meta.id.
    // Всё остальное (утилиты, хелперы, константы) игнорируется.
    //
    // Эта проверка — единственное место, где ядро решает, "что такое плагин".
    // Если контракт нужно расширить — расширяется ровно здесь.

    function _isPluginClass(value) {
        if (typeof value !== 'function') return false;
        if (!value.meta || typeof value.meta !== 'object') return false;
        if (!value.meta.id || typeof value.meta.id !== 'string') return false;
        if (!value.meta.id.trim()) return false;
        return true;
    }

    // ================================================================
    // ЗАГРУЗЧИК
    // ================================================================

    class PluginLoader {
        constructor(opts) {
            opts = opts || {};

            this.folderSource = opts.folderSource || null;
            this.registry = opts.registry || null;
            this.onLog = typeof opts.onLog === 'function' ? opts.onLog : null;

            this._manifest = null;             // распарсенный manifest.json
            this._manifestRaw = null;          // как прочитано
            this._sortedFiles = [];            // [{ path, priority }]
            this._assetIndex = new Map();      // name → fullPath
            this._assetDuplicates = [];        // [{ name, paths: [p1, p2] }]
            this._pluginFileMap = new Map();   // pluginId → filePath
            this._filePluginMap = new Map();   // filePath → pluginId
            this._loadedIds = new Set();       // id, зарегистрированные в реестре
            this._disabledIds = this._readDisabledIds();
            this._scanned = false;

            this._log = this._log.bind(this);
        }

        // ============================================================
        // ЛОГ
        // ============================================================

        _log(msg) {
            console.log('[PluginLoader]', msg);
            if (this.onLog) {
                try { this.onLog(msg); } catch (e) {}
            }
        }

        _warn(msg) {
            console.warn('[PluginLoader]', msg);
        }

        // ============================================================
        // ВЫКЛЮЧЕННЫЕ ПЛАГИНЫ (localStorage)
        // ============================================================

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

        // ============================================================
        // СКАН
        // ============================================================

        async scan() {
            this._manifest = null;
            this._manifestRaw = null;
            this._sortedFiles = [];
            this._assetIndex.clear();
            this._assetDuplicates = [];

            if (!this.folderSource) {
                this._warn('scan: no folderSource');
                this._scanned = false;
                return false;
            }

            // Читаем manifest.json
            var manifestText;
            try {
                manifestText = await this.folderSource.readFile(MANIFEST_FILE);
            } catch (err) {
                this._warn('scan: manifest.json not found or unreadable: ' + err.message);
                this._scanned = false;
                return false;
            }

            var manifest;
            try {
                manifest = JSON.parse(manifestText);
            } catch (err) {
                this._warn('scan: manifest.json is not valid JSON: ' + err.message);
                this._scanned = false;
                return false;
            }

            if (!manifest || typeof manifest !== 'object') {
                this._warn('scan: manifest.json is not an object');
                this._scanned = false;
                return false;
            }

            this._manifest = manifest;
            this._manifestRaw = manifestText;

            // Парсим files
            var files = Array.isArray(manifest.files) ? manifest.files : [];
            var normalized = [];
            for (var i = 0; i < files.length; i++) {
                var entry = files[i];
                if (!entry || typeof entry !== 'object') continue;
                var path = _normalizePath(entry.path);
                if (!path) continue;
                if (!_endsWithJs(path)) {
                    this._warn('scan: file "' + path + '" is not .js — skipped');
                    continue;
                }
                var priority = Number(entry.priority);
                if (!isFinite(priority)) priority = 9999;
                normalized.push({ path: path, priority: priority });
            }
            normalized.sort(_sortByPriorityThenPath);
            this._sortedFiles = normalized;

            // Строим индекс ассетов — рекурсивно обходим всю папку
            await this._buildAssetIndex('');

            this._scanned = true;
            this._log('scan: manifest ok, ' + this._sortedFiles.length + ' file(s), '
                + this._assetIndex.size + ' asset(s)');

            return true;
        }

        async _buildAssetIndex(currentPath) {
            var entries;
            try {
                entries = await this.folderSource.listDir(currentPath);
            } catch (err) {
                return;
            }

            for (var i = 0; i < entries.length; i++) {
                var name = entries[i];
                var fullPath = currentPath ? (currentPath + '/' + name) : name;

                if (this.folderSource.isDirectory(name)) {
                    await this._buildAssetIndex(fullPath);
                } else {
                    var slash = name.lastIndexOf('/');
                    var baseName = slash >= 0 ? name.slice(slash + 1) : name;

                    if (this._assetIndex.has(baseName)) {
                        var existing = this._assetIndex.get(baseName);
                        var dup = this._assetDuplicates.find(function(d) { return d.name === baseName; });
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
        }

        // ============================================================
        // ЗАГРУЗКА
        // ============================================================

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

        // ============================================================
        // ВЫПОЛНЕНИЕ ФАЙЛА
        // ============================================================
        //
        // Порядок:
        //   1. Прочитать код.
        //   2. Снять снапшот реестра "до".
        //   3. Создать module / module.exports (снаружи!).
        //   4. Выполнить код.
        //   5. Найти классы-плагины в module.exports.
        //   6. Зарегистрировать их в реестре.
        //   7. Снять снапшот "после" — получить diff.
        //   8. Зафиксировать связь id ↔ file.
        //   9. Если плагин выключен — снять тип из реестра.

        async _executeFile(path) {
            if (!this.folderSource) return [];

            var code;
            try {
                code = await this.folderSource.readFile(path);
            } catch (err) {
                this._warn('Cannot read ' + path + ': ' + err.message);
                return [];
            }

            var beforeIds = this._snapshotRegistry();

            // module создаётся СНАРУЖИ и передаётся в _execute,
            // чтобы после выполнения прочитать module.exports.
            var moduleRef = { exports: {} };

            this._execute(path, code, moduleRef);

            // Дискаверинг классов-плагинов в module.exports.
            var discovered = this._discoverClasses(moduleRef);

            if (discovered.length > 0) {
                this._log('Discovered ' + discovered.length + ' class(es) in ' + path);
                for (var i = 0; i < discovered.length; i++) {
                    this._registerClass(discovered[i], path);
                }
            }

            var addedIds = this._diffRegistry(beforeIds);

            // Фиксируем связь id ↔ file и обрабатываем disabled.
            for (var j = 0; j < addedIds.length; j++) {
                var id = addedIds[j];
                this._pluginFileMap.set(id, path);
                this._filePluginMap.set(path, id);

                if (this._disabledIds.has(String(id))) {
                    this._unregisterId(id);
                    this._log('File ' + path + ' registered type "' + id + '" (disabled — unregistered)');
                } else {
                    this._log('File ' + path + ' registered type "' + id + '"');
                }
            }

            // Сообщение о результате
            if (addedIds.length === 0 && discovered.length === 0) {
                this._log('File ' + path + ' executed (shared, no type)');
            } else if (addedIds.length === 0 && discovered.length > 0) {
                this._log('File ' + path + ' executed (no new types — already registered)');
            }

            return addedIds;
        }

        _execute(path, code, moduleRef) {
            try {
                var fn = new Function('module', 'exports', 'console',
                    '"use strict";\n' + code);
                fn(moduleRef, moduleRef.exports, console);
            } catch (err) {
                this._warn('Error executing ' + path + ': ' + err.message);
            }
        }

        // ============================================================
        // ДИСКАВЕРИНГ КЛАССОВ
        // ============================================================
        //
        // Плагин может экспортировать:
        //   - один класс:      module.exports = MyClass;
        //   - объект классов:  module.exports = { MyClass, Other };
        //   - массив классов:  module.exports = [MyClass, Other];
        //
        // Всё, что не является функцией с meta.id, игнорируется.

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

        // ============================================================
        // РЕГИСТРАЦИЯ КЛАССА В РЕЕСТРЕ
        // ============================================================

        _registerClass(Class, path) {
            if (!this.registry || typeof this.registry.registerFromClass !== 'function') {
                this._warn('registerFromClass not available — cannot register '
                    + (Class.meta && Class.meta.id));
                return false;
            }

            var id = Class.meta && Class.meta.id;
            if (!id) return false;

            // Уже зарегистрирован — нормально при reload плагина.
            // Молча пропускаем, чтобы не засорять лог.
            if (typeof this.registry.hasType === 'function' && this.registry.hasType(id)) {
                this._log('Type "' + id + '" already registered — skipping ('
                    + (path || 'unknown') + ')');
                return false;
            }

            try {
                var ok = this.registry.registerFromClass(Class);
                if (ok) {
                    this._log('Registered type "' + id + '" from class ('
                        + (path || 'unknown') + ')');
                } else {
                    this._warn('registerFromClass returned false for "' + id + '"');
                }
                return !!ok;
            } catch (e) {
                this._warn('registerFromClass("' + id + '") threw: ' + e.message);
                return false;
            }
        }

        // ============================================================
        // РЕЕСТР
        // ============================================================

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

        // ============================================================
        // ФАЙЛЫ / АССЕТЫ
        // ============================================================

        listFolder(folderName) {
            var out = [];
            this._assetIndex.forEach(function(fullPath) {
                if (_isPathInFolder(fullPath, folderName)) {
                    out.push(fullPath);
                }
            });
            out.sort();
            return out;
        }

        listFolderByRelPath(folderName) {
            var out = [];
            this._assetIndex.forEach(function(fullPath) {
                if (_isPathInFolder(fullPath, folderName)) {
                    out.push({
                        fullPath: fullPath,
                        relPath: _relPathWithinFolder(fullPath, folderName)
                    });
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
                this._warn('readAsset(' + name + ') failed: ' + err.message);
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

        // ============================================================
        // МЕТАДАННЫЕ
        // ============================================================

        getManifest() {
            return this._manifest;
        }

        getSortedFiles() {
            return this._sortedFiles.map(function(f) { return { path: f.path, priority: f.priority }; });
        }

        getLoadedIds() {
            return Array.from(this._loadedIds);
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

        // ============================================================
        // СБРОС
        // ============================================================

        reset() {
            this._manifest = null;
            this._manifestRaw = null;
            this._sortedFiles = [];
            this._assetIndex.clear();
            this._assetDuplicates = [];
            this._pluginFileMap.clear();
            this._filePluginMap.clear();
            this._loadedIds.clear();
            this._scanned = false;
        }

        resetFull() {
            this.reset();
            this._disabledIds = this._readDisabledIds();
        }
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    if (typeof window !== 'undefined') {
        window.PluginLoader = PluginLoader;
        console.log('[PluginLoader] Registered globally v3.0.0');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginLoader: PluginLoader };
    }

})();