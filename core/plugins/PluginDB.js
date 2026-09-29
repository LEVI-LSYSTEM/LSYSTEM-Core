// core/plugins/PluginDB.js
// Версия 1.1.0 — Единый источник истины для IndexedDB 'lsystem-plugins'.
//
// Изменения относительно 1.0.0:
//   - _openRaw() получил таймаут и корректную обработку onblocked.
//   - Перед переоткрытием с version+1 ждём освобождения БД (tick + retry).
//   - MAX_RECOVERY_ATTEMPTS теперь защищает и от «зависшего» onblocked.
//   - На onblocked: закрываем своё соединение (если уже открылось) и
//     повторяем попытку с задержкой.

(function() {
    'use strict';

    var DB_NAME = 'lsystem-plugins';

    var STORE_FOLDER      = 'folder-handles';
    var STORE_URL_PLUGINS = 'url-plugins';

    var SCHEMA = {
        stores: {
            [STORE_FOLDER]: {
                keyPath: null,
                indexes: []
            },
            [STORE_URL_PLUGINS]: {
                keyPath: 'id',
                indexes: [
                    { name: 'enabled',     keyPath: 'enabled',     options: { unique: false } },
                    { name: 'installedAt', keyPath: 'installedAt', options: { unique: false } },
                    { name: 'updatedAt',   keyPath: 'updatedAt',   options: { unique: false } },
                    { name: 'url',         keyPath: 'url',         options: { unique: false } }
                ]
            }
        }
    };

    var MAX_RECOVERY_ATTEMPTS = 5;
    var OPEN_TIMEOUT_MS = 5000;
    var BLOCKED_RETRY_DELAY_MS = 200;

    var _dbPromise = null;
    var _recoveryAttempts = 0;

    function _applySchema(db) {
        for (var storeName in SCHEMA.stores) {
            if (!Object.prototype.hasOwnProperty.call(SCHEMA.stores, storeName)) continue;

            var spec = SCHEMA.stores[storeName];
            var store;

            if (!db.objectStoreNames.contains(storeName)) {
                store = spec.keyPath
                    ? db.createObjectStore(storeName, { keyPath: spec.keyPath })
                    : db.createObjectStore(storeName);
            } else {
                try {
                    store = db.transaction.objectStore(storeName);
                } catch (e) {
                    continue;
                }
            }

            if (spec.indexes && spec.indexes.length && store) {
                for (var i = 0; i < spec.indexes.length; i++) {
                    var idx = spec.indexes[i];
                    if (!store.indexNames.contains(idx.name)) {
                        store.createIndex(idx.name, idx.keyPath, idx.options || {});
                    }
                }
            }
        }
    }

    function _missingStores(db) {
        var missing = [];
        for (var name in SCHEMA.stores) {
            if (!Object.prototype.hasOwnProperty.call(SCHEMA.stores, name)) continue;
            if (!db.objectStoreNames.contains(name)) missing.push(name);
        }
        return missing;
    }

    function _openRaw(version) {
        return new Promise(function(resolve, reject) {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB not supported'));
                return;
            }

            var req = version != null
                ? indexedDB.open(DB_NAME, version)
                : indexedDB.open(DB_NAME);

            var settled = false;
            var timer = setTimeout(function() {
                if (settled) return;
                settled = true;
                console.warn(
                    '[PluginDB] open timeout (' + OPEN_TIMEOUT_MS + 'ms), version=' +
                    (version != null ? version : 'default')
                );
                try {
                    if (req.result) req.result.close();
                } catch (e) {}
                reject(new Error('IndexedDB open timeout'));
            }, OPEN_TIMEOUT_MS);

            req.onerror = function() {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(req.error || new Error('IndexedDB open failed'));
            };

            req.onblocked = function() {
                console.warn(
                    '[PluginDB] open blocked by another connection; waiting…'
                );
            };

            req.onsuccess = function() {
                if (settled) {
                    try { req.result.close(); } catch (e) {}
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve(req.result);
            };

            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                _applySchema(db);
            };
        });
    }

    function _delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function _openWithRecovery() {
        return _openRaw().then(function(db) {
            var missing = _missingStores(db);

            if (missing.length === 0) {
                _recoveryAttempts = 0;
                return db;
            }

            console.warn(
                '[PluginDB] Missing stores:', missing.join(', '),
                '— reopening with version', db.version + 1
            );

            var nextVersion = db.version + 1;
            db.close();

            _recoveryAttempts++;

            if (_recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
                _recoveryAttempts = 0;
                throw new Error(
                    'PluginDB: cannot recover schema after ' +
                    MAX_RECOVERY_ATTEMPTS + ' attempts'
                );
            }

            return _delay(BLOCKED_RETRY_DELAY_MS)
                .then(function() {
                    return _openRaw(nextVersion);
                })
                .then(function(db2) {
                    var stillMissing = _missingStores(db2);
                    if (stillMissing.length === 0) {
                        _recoveryAttempts = 0;
                        return db2;
                    }
                    db2.close();
                    return _delay(BLOCKED_RETRY_DELAY_MS)
                        .then(function() { return _openWithRecovery(); });
                });
        });
    }

    function getDB() {
        if (_dbPromise) return _dbPromise;

        _dbPromise = _openWithRecovery().then(function(db) {
            db.onversionchange = function() {
                try { db.close(); } catch (e) {}
                _dbPromise = null;
            };
            return db;
        }).catch(function(err) {
            _dbPromise = null;
            throw err;
        });

        return _dbPromise;
    }

    function withStore(storeName, mode, fn) {
        if (!SCHEMA.stores[storeName]) {
            return Promise.reject(
                new Error('PluginDB: unknown store "' + storeName + '"')
            );
        }

        return getDB().then(function(db) {
            if (!db.objectStoreNames.contains(storeName)) {
                console.warn(
                    '[PluginDB] store "' + storeName + '" disappeared — retrying open'
                );
                _dbPromise = null;
                return withStore(storeName, mode, fn);
            }

            return new Promise(function(resolve, reject) {
                var tx;
                try {
                    tx = db.transaction(storeName, mode);
                } catch (e) {
                    reject(e);
                    return;
                }

                var store = tx.objectStore(storeName);
                var result;

                try {
                    result = fn(store);
                } catch (e) {
                    try { tx.abort(); } catch (e2) {}
                    reject(e);
                    return;
                }

                tx.oncomplete = function() {
                    if (result && result.__isRequest === true) {
                        resolve(result.result);
                    } else {
                        resolve(result);
                    }
                };
                tx.onerror = function() {
                    reject(tx.error || new Error('Transaction failed'));
                };
                tx.onabort = function() {
                    reject(tx.error || new Error('Transaction aborted'));
                };
            });
        });
    }

    function wrapRequest(req) {
        var wrapper = { __isRequest: true, result: undefined };
        req.onsuccess = function() { wrapper.result = req.result; };
        req.onerror   = function() { wrapper.result = null; };
        return wrapper;
    }

    var PluginDB = {
        DB_NAME: DB_NAME,
        SCHEMA: SCHEMA,

        STORE_FOLDER: STORE_FOLDER,
        STORE_URL_PLUGINS: STORE_URL_PLUGINS,

        getDB: getDB,
        withStore: withStore,
        wrapRequest: wrapRequest,

        _reset: function() {
            _dbPromise = null;
            _recoveryAttempts = 0;
        }
    };

    if (typeof window !== 'undefined') {
        window.PluginDB = PluginDB;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginDB: PluginDB };
    }

})();