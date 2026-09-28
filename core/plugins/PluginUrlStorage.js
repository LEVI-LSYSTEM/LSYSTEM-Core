// core/plugins/PluginUrlStorage.js
// Версия 2.0.0 — использует единый PluginDB.
// Убраны собственные _openDB / _withStore / _wrapRequest.

(function() {
    'use strict';

    console.log('[PluginUrlStorage] Loading v2.0.0...');

    var STORE = window.PluginDB
        ? window.PluginDB.STORE_URL_PLUGINS
        : 'url-plugins';

    // ────────────────────────────────────────────────────────────
    // НОРМАЛИЗАЦИЯ ЗАПИСИ
    // ────────────────────────────────────────────────────────────

    function _normalize(record) {
        if (!record || typeof record !== 'object') return null;
        if (!record.id) return null;

        return {
            id: String(record.id),
            name: String(record.name || record.id),
            description: String(record.description || ''),
            url: String(record.url || ''),
            code: String(record.code || ''),
            version: String(record.version || '0.0.0'),
            author: String(record.author || ''),
            icon: String(record.icon || 'icon-layout'),
            enabled: record.enabled !== false,
            installedAt: Number(record.installedAt) || Date.now(),
            updatedAt: Number(record.updatedAt) || Date.now(),
            etag: record.etag ? String(record.etag) : null,
            lastModified: record.lastModified ? String(record.lastModified) : null
        };
    }

    // ────────────────────────────────────────────────────────────
    // ОБЁРТКА НАД PluginDB
    // ────────────────────────────────────────────────────────────

    function _withStore(mode, fn) {
        if (!window.PluginDB) {
            return Promise.reject(new Error('PluginDB not available'));
        }
        return window.PluginDB.withStore(STORE, mode, fn);
    }

    function _wrap(req) {
        return window.PluginDB.wrapRequest(req);
    }

    // ────────────────────────────────────────────────────────────
    // КЛАСС
    // ────────────────────────────────────────────────────────────

    class PluginUrlStorage {

        async list() {
            return _withStore('readonly', function(store) {
                return _wrap(store.getAll());
            }).then(function(arr) {
                return Array.isArray(arr) ? arr : [];
            });
        }

        async get(id) {
            if (!id) return null;
            return _withStore('readonly', function(store) {
                return _wrap(store.get(String(id)));
            }).then(function(rec) {
                return rec || null;
            });
        }

        async has(id) {
            if (!id) return false;
            return _withStore('readonly', function(store) {
                return _wrap(store.count(String(id)));
            }).then(function(c) {
                return c > 0;
            });
        }

        async set(record) {
            var norm = _normalize(record);
            if (!norm) {
                console.warn('[PluginUrlStorage] set: invalid record', record);
                return false;
            }

            return _withStore('readwrite', function(store) {
                store.put(norm);
                return true;
            }).then(function() {
                return true;
            }).catch(function(err) {
                console.error('[PluginUrlStorage] set error:', err);
                return false;
            });
        }

        async remove(id) {
            if (!id) return false;
            return _withStore('readwrite', function(store) {
                store.delete(String(id));
                return true;
            }).then(function() {
                return true;
            }).catch(function(err) {
                console.error('[PluginUrlStorage] remove error:', err);
                return false;
            });
        }

        async clear() {
            return _withStore('readwrite', function(store) {
                store.clear();
                return true;
            }).then(function() {
                return true;
            }).catch(function(err) {
                console.error('[PluginUrlStorage] clear error:', err);
                return false;
            });
        }

        async setEnabled(id, enabled) {
            var rec = await this.get(id);
            if (!rec) return false;
            rec.enabled = !!enabled;
            rec.updatedAt = Date.now();
            await this.set(rec);
            return rec.enabled;
        }

        async count() {
            return _withStore('readonly', function(store) {
                return _wrap(store.count());
            }).then(function(c) {
                return Number(c) || 0;
            });
        }

        async listEnabled() {
            var all = await this.list();
            return all.filter(function(r) { return r.enabled; });
        }

        async listDisabled() {
            var all = await this.list();
            return all.filter(function(r) { return !r.enabled; });
        }

        async findByUrl(url) {
            if (!url) return null;
            var all = await this.list();
            var norm = String(url);
            for (var i = 0; i < all.length; i++) {
                if (all[i].url === norm) return all[i];
            }
            return null;
        }

        async setMany(records) {
            if (!Array.isArray(records) || records.length === 0) return 0;

            return _withStore('readwrite', function(store) {
                var count = 0;
                for (var i = 0; i < records.length; i++) {
                    var norm = _normalize(records[i]);
                    if (norm) {
                        store.put(norm);
                        count++;
                    }
                }
                return count;
            }).then(function(n) {
                return n;
            }).catch(function(err) {
                console.error('[PluginUrlStorage] setMany error:', err);
                return 0;
            });
        }

        async keepOnly(keepIds) {
            var keep = new Set(Array.isArray(keepIds) ? keepIds.map(String) : []);

            return _withStore('readwrite', function(store) {
                var req = store.openCursor();
                var removed = { count: 0 };

                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (!cursor) return;
                    if (!keep.has(String(cursor.value.id))) {
                        cursor.delete();
                        removed.count++;
                    }
                    cursor.continue();
                };

                return removed;
            }).then(function(r) {
                return r ? r.count : 0;
            });
        }

        async destroy() {
            return this.clear();
        }

        async exportMeta() {
            var all = await this.list();
            return all.map(function(r) {
                return {
                    id: r.id,
                    name: r.name,
                    url: r.url,
                    version: r.version,
                    author: r.author,
                    icon: r.icon,
                    enabled: r.enabled,
                    installedAt: r.installedAt,
                    updatedAt: r.updatedAt
                };
            });
        }

        async exportFull() {
            return await this.list();
        }

        async importFull(records) {
            return await this.setMany(records);
        }
    }

    if (typeof window !== 'undefined') {
        window.PluginUrlStorage = PluginUrlStorage;
        console.log('[PluginUrlStorage] Registered globally v2.0.0');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginUrlStorage: PluginUrlStorage };
    }

})();