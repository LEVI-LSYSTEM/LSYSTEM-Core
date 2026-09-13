// core/API/PluginAPI.js
// Версия 1.0.0 — менеджер загрузки ExtendedAPI/UserAPI.js
//
// Загружает файл-сборник ExtendedAPI/UserAPI.js.
// Все компоненты внутри него сами себя регистрируют через registerComponent.
//
// Публичное API:
//   - PluginAPI.load()          — загрузить/перезагрузить UserAPI.js
//   - PluginAPI.isLoaded()      — загружен?
//   - PluginAPI.getPath()       — путь к файлу
//   - PluginAPI.setPath(path)   — изменить путь
//   - PluginAPI.onLoad(cb)      — callback при загрузке
//   - PluginAPI.onError(cb)     — callback при ошибке

(function() {
    'use strict';

    console.log('[PluginAPI] Loading v1.0.0...');

    var DEFAULT_PATH = 'core/API/UserAPI.js';

    // ============================================================
    // КЛАСС
    // ============================================================

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
        }

        // ============================================================
        // CONFIG
        // ============================================================

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

        // ============================================================
        // CALLBACKS
        // ============================================================

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

        // ============================================================
        // LOAD
        // ============================================================

        /**
         * Загрузить UserAPI.js.
         * @param {object} [opts]
         * @param {boolean} [opts.reload=false] — перезагрузить если уже загружен
         * @returns {Promise<boolean>}
         */
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
                // Убираем старый <script>, чтобы перезагрузить
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
                // Проверяем: файл вообще существует?
                fetch(url, { method: 'HEAD', cache: 'no-cache' })
                    .then((res) => {
                        if (!res.ok) {
                            // 404 — не критично
                            console.warn('[PluginAPI] ⚠️ ' + this._path + ' not found (status ' + res.status + ')');
                            self._loading = false;
                            self._loaded = false;
                            self._loadPromise = null;
                            self._fireError(new Error('File not found: ' + self._path));
                            resolve(false);
                            return;
                        }

                        // Файл есть — грузим через <script>
                        self._appendScript(url, resolve);
                    })
                    .catch((err) => {
                        // fetch не удался (CORS, offline) — попробуем <script> напрямую
                        if (self._debug) {
                            console.warn('[PluginAPI] HEAD failed, trying direct script load:', err);
                        }
                        self._appendScript(url, resolve);
                    });
            });
        }

        _appendScript(url, resolve) {
            const self = this;

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.dataset.extapi = 'true';
            this._scriptEl = script;

            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.error('[PluginAPI] ❌ Load timeout: ' + this._path);
                self._loading = false;
                self._loadPromise = null;
                self._fireError(new Error('Load timeout'));
                resolve(false);
            }, 10000);

            script.onload = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                self._loading = false;
                self._loaded = true;

                // Смотрим, что зарегистрировалось
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

                self._fireLoad();
                resolve(true);
            };

            script.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                // НЕ 404 (иначе HEAD бы сработал), а именно ошибка исполнения
                console.error('[PluginAPI] ❌ Failed to load: ' + self._path);
                self._loading = false;
                self._loadPromise = null;
                self._fireError(new Error('Script load failed'));
                resolve(false);
            };

            document.head.appendChild(script);
        }

        _unloadScript() {
            if (this._scriptEl && this._scriptEl.parentNode) {
                this._scriptEl.parentNode.removeChild(this._scriptEl);
            }
            this._scriptEl = null;
        }

        // ============================================================
        // NOTIFY
        // ============================================================

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

        // ============================================================
        // DESTROY
        // ============================================================

        destroy() {
            this._unloadScript();
            this._loaded = false;
            this._loading = false;
            this._loadPromise = null;
            this._onLoadCallbacks = [];
            this._onErrorCallbacks = [];
            console.log('[PluginAPI] Destroyed');
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    window.PluginAPI = new PluginAPI();
    window.PluginAPI.Class = PluginAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PluginAPI };
    }

    console.log('[PluginAPI] Registered globally v1.0.0');

})();