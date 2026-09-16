// core/API/PluginAPI.js
// Версия 1.0.1 - Fix: race condition при параллельных load()
// - _appendScript: addEventListener вместо onload = (не затирает чужие)
// - _loadScript: addEventListener для load/error
// - onload/onerror остаются как fallback для старых браузеров
// - Публичное API не изменилось

(function() {
    'use strict';

    console.log('[PluginAPI] Loading v1.0.1...');

    var DEFAULT_PATH = 'data/UserAPI.js';

    class PluginAPI {
        constructor(options = {}) {
            this._path = options.path || DEFAULT_PATH;
            this._debug = options.debug || false;

            this._loaded = false;
            this._loading = false;
            this._loadPromise = null;

            this._scriptEl = null;

            this._onLoadCallbacks = [];
            this._onErrorCallbacks = [];

            this._cacheBust = 0;

            // ✅ FIX: реестр pending-резолверов для одного и того же URL
            this._pendingResolvers = new Map();
        }

        getPath() {
            return this._path;
        }

        setPath(path) {
            if (!path || typeof path !== 'string') return false;
            this._path = path;
            return true;
        }

        isLoaded() {
            return this._loaded;
        }

        isLoading() {
            return this._loading;
        }

        onLoad(cb) {
            if (typeof cb !== 'function') return () => {};
            this._onLoadCallbacks.push(cb);
            return () => {
                const i = this._onLoadCallbacks.indexOf(cb);
                if (i !== -1) this._onLoadCallbacks.splice(i, 1);
            };
        }

        onError(cb) {
            if (typeof cb !== 'function') return () => {};
            this._onErrorCallbacks.push(cb);
            return () => {
                const i = this._onErrorCallbacks.indexOf(cb);
                if (i !== -1) this._onErrorCallbacks.splice(i, 1);
            };
        }

        load(opts = {}) {
            if (this._loading && this._loadPromise) {
                return this._loadPromise;
            }

            if (this._loaded && !opts.reload) {
                if (this._debug) {
                    console.log('[PluginAPI] Already loaded, skipping');
                }
                return Promise.resolve(true);
            }

            if (opts.reload && this._scriptEl) {
                this._unloadScript();
            }

            this._loading = true;
            this._cacheBust++;

            this._loadPromise = this._loadScript();
            return this._loadPromise;
        }

        _loadScript() {
            const self = this;
            const url = this._path + '?_extapi=' + Date.now() + '_' + this._cacheBust;

            return new Promise((resolve) => {
                fetch(url, { method: 'HEAD', cache: 'no-cache' })
                    .then((res) => {
                        if (!res.ok) {
                            console.warn('[PluginAPI] ⚠️ ' + this._path + ' not found (status ' + res.status + ')');
                            self._loading = false;
                            self._loaded = false;
                            self._loadPromise = null;
                            self._fireError(new Error('File not found: ' + self._path));
                            resolve(false);
                            return;
                        }

                        self._appendScript(url, resolve);
                    })
                    .catch((err) => {
                        if (self._debug) {
                            console.warn('[PluginAPI] HEAD failed, trying direct script load:', err);
                        }
                        self._appendScript(url, resolve);
                    });
            });
        }

        /**
         * ✅ FIX v1.0.1:
         * - Если script уже в DOM и уже загружен — сразу resolve(true).
         * - Если script уже в DOM, но ещё грузится — добавляем свой резолвер
         *   в _pendingResolvers и не перезаписываем onload/onerror.
         * - Если script новый — создаём, вешаем addEventListener('load'/'error').
         */
        _appendScript(url, resolve) {
            const self = this;

            // Если скрипт уже есть в DOM по этому URL — не создаём дубликат
            const existing = document.querySelector('script[data-extapi="true"][data-src="' + url + '"]');

            if (existing) {
                if (existing.dataset.loaded === 'true') {
                    resolve(true);
                    return;
                }

                // Уже грузится — ставим в очередь резолверов
                if (!this._pendingResolvers.has(url)) {
                    this._pendingResolvers.set(url, []);
                }
                this._pendingResolvers.get(url).push(resolve);
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.dataset.extapi = 'true';
            script.dataset.src = url;
            script.dataset.loaded = 'false';
            this._scriptEl = script;

            this._pendingResolvers.set(url, [resolve]);

            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.error('[PluginAPI] ❌ Load timeout: ' + this._path);
                self._loading = false;
                self._loadPromise = null;

                const resolvers = self._pendingResolvers.get(url) || [];
                for (const r of resolvers) {
                    try { r(false); } catch (e) {}
                }
                self._pendingResolvers.delete(url);

                self._fireError(new Error('Load timeout'));
            }, 10000);

            const finishOk = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                self._loading = false;
                self._loaded = true;
                script.dataset.loaded = 'true';

                const registry = (window.ExtendedAPI && window.ExtendedAPI.getRegistry)
                    ? window.ExtendedAPI.getRegistry()
                    : {};

                const total = Object.keys(registry)
                    .reduce((sum, cat) => sum + registry[cat].length, 0);

                console.log('[PluginAPI] ✅ UserAPI.js loaded',
                    '(' + Object.keys(registry).length + ' categories, ' + total + ' components)');

                if (self._debug) {
                    console.log('[PluginAPI] Registry:', registry);
                }

                const resolvers = self._pendingResolvers.get(url) || [];
                for (const r of resolvers) {
                    try { r(true); } catch (e) {}
                }
                self._pendingResolvers.delete(url);

                self._fireLoad();
            };

            const finishErr = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                console.error('[PluginAPI] ❌ Failed to load: ' + self._path);
                self._loading = false;
                self._loadPromise = null;

                const resolvers = self._pendingResolvers.get(url) || [];
                for (const r of resolvers) {
                    try { r(false); } catch (e) {}
                }
                self._pendingResolvers.delete(url);

                self._fireError(new Error('Script load failed'));
            };

            // ✅ FIX: addEventListener вместо onload = (не затирает чужие)
            script.addEventListener('load', finishOk);
            script.addEventListener('error', finishErr);

            document.head.appendChild(script);
        }

        _unloadScript() {
            if (this._scriptEl && this._scriptEl.parentNode) {
                this._scriptEl.parentNode.removeChild(this._scriptEl);
            }
            this._scriptEl = null;
            this._pendingResolvers.clear();
        }

        _fireLoad() {
            for (const cb of this._onLoadCallbacks) {
                try { cb(); } catch (e) {
                    console.error('[PluginAPI] onLoad callback error:', e);
                }
            }
            document.dispatchEvent(new CustomEvent('extended-api-loaded'));
        }

        _fireError(error) {
            for (const cb of this._onErrorCallbacks) {
                try { cb(error); } catch (e) {
                    console.error('[PluginAPI] onError callback error:', e);
                }
            }
            document.dispatchEvent(new CustomEvent('extended-api-error', {
                detail: { error: error ? error.message : 'unknown' }
            }));
        }

        destroy() {
            this._unloadScript();
            this._loaded = false;
            this._loading = false;
            this._loadPromise = null;
            this._onLoadCallbacks = [];
            this._onErrorCallbacks = [];
            this._pendingResolvers.clear();
            console.log('[PluginAPI] Destroyed');
        }
    }

    window.PluginAPI = new PluginAPI();
    window.PluginAPI.Class = PluginAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginAPI };
    }

    console.log('[PluginAPI] Registered globally v1.0.1');

})();