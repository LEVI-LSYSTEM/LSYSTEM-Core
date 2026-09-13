// core/API/ExtendedAPIInjector.js
// Версия 1.0.0 — реестр компонентов ExtendedAPI + Proxy + CSS-инжект
//
// Разработчик расширений пишет в ExtendedAPI/UserAPI.js:
//
//   registerComponent('category', 'name', {
//       version: '1.0.0',         // опционально
//       css: `...`,                // опционально — инжектится в <head>
//       data: {...},               // любые данные
//       create(...) { /* this === окно */ },
//       someMethod(...) { /* this === окно */ },
//   });
//
// Разработчик окна использует:
//
//   this.category.name(...)               // → create()
//   this.category.name.create(...)        // → create()
//   this.category.name.someMethod(...)    // → someMethod()
//   this.category.name.data               // → данные
//
// Компоненты могут ссылаться друг на друга:
//   create() { const btn = this.ui.button({...}); }
//
// Ядро не трогается. PluginAPI загружает UserAPI.js.

(function() {
    'use strict';

    console.log('[ExtendedAPIInjector] Loading v1.0.0...');

    // ============================================================
    // РЕЕСТР
    // ============================================================

    // _registry[category][name] = config
    const _registry = Object.create(null);

    // Отдельно храним версии для отладки
    const _versions = Object.create(null);

    // ============================================================
    // УТИЛИТЫ
    // ============================================================

    function _isPlainObject(v) {
        return v !== null
            && typeof v === 'object'
            && !Array.isArray(v)
            && (Object.getPrototypeOf(v) === Object.prototype
                || Object.getPrototypeOf(v) === null);
    }

    function _injectCSS(category, name, css) {
        if (typeof css !== 'string' || css.trim().length === 0) return;

        const id = `extapi-css-${category}-${name}`;
        if (document.getElementById(id)) return;

        const style = document.createElement('style');
        style.id = id;
        style.setAttribute('data-extapi', `${category}.${name}`);
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // REGISTER COMPONENT
    // ============================================================

    /**
     * Зарегистрировать компонент ExtendedAPI.
     *
     * @param {string} category — 'ui', 'chart', 'utils', ...
     * @param {string} name     — 'button', 'block', ...
     * @param {object} config   — { version?, css?, create?, ...методы, ...данные }
     * @returns {boolean}
     */
    function registerComponent(category, name, config) {
        if (!category || typeof category !== 'string') {
            console.error('[ExtendedAPIInjector] registerComponent: category is required');
            return false;
        }
        if (!name || typeof name !== 'string') {
            console.error('[ExtendedAPIInjector] registerComponent: name is required');
            return false;
        }
        if (!_isPlainObject(config)) {
            console.error('[ExtendedAPIInjector] registerComponent: config must be a plain object');
            return false;
        }

        if (!_registry[category]) {
            _registry[category] = Object.create(null);
        }

        const existing = _registry[category][name];

        if (existing) {
            // Мерджим: старый + новый (новый перекрывает)
            const merged = Object.assign({}, existing, config);

            // Warn про коллизии методов
            for (const key in config) {
                if (Object.prototype.hasOwnProperty.call(existing, key)
                    && typeof existing[key] === 'function'
                    && typeof config[key] === 'function') {
                    console.warn(`[ExtendedAPIInjector] ⚠️ "${category}.${name}.${key}" overridden`);
                }
            }

            _registry[category][name] = merged;
        } else {
            _registry[category][name] = Object.assign({}, config);
        }

        // Версия
        if (config.version) {
            _versions[`${category}.${name}`] = String(config.version);
        }

        // CSS
        _injectCSS(category, name, config.css);

        // Устанавливаем getter на BaseWindowInstance.prototype для category (если ещё нет)
        _installCategoryGetter(category);

        const methodCount = Object.keys(config)
            .filter(k => typeof config[k] === 'function' && !k.startsWith('_'))
            .length;

        console.log(`[ExtendedAPIInjector] ✅ registerComponent: "${category}.${name}"`,
            `(${methodCount} methods)`,
            config.version ? `v${config.version}` : '');

        return true;
    }

    // ============================================================
    // INSTALL CATEGORY GETTER
    // ============================================================

    function _installCategoryGetter(category) {
        if (!window.BaseWindowInstance) {
            // BaseWindowInstance ещё не загружен — повторим позже
            if (!_installCategoryGetter._pending) {
                _installCategoryGetter._pending = new Set();
            }
            _installCategoryGetter._pending.add(category);
            setTimeout(_flushPendingCategories, 50);
            return;
        }

        const proto = window.BaseWindowInstance.prototype;

        // Уже установлен?
        const descriptor = Object.getOwnPropertyDescriptor(proto, category);
        if (descriptor && typeof descriptor.get === 'function') {
            return;
        }

        // Коллизия: category уже существует в прототипе как поле/метод?
        if (category in proto) {
            console.warn(
                `[ExtendedAPIInjector] ⚠️ category "${category}" already exists on BaseWindowInstance — skipping`
            );
            return;
        }

        Object.defineProperty(proto, category, {
            get() {
                // this === окно
                const cacheKey = '__extapi_ns_' + category;

                if (!this[cacheKey]) {
                    this[cacheKey] = _makeNamespaceProxy(category, this);
                }
                return this[cacheKey];
            },
            configurable: true,
            enumerable: false
        });
    }

    function _flushPendingCategories() {
        const pending = _installCategoryGetter._pending;
        if (!pending) return;

        if (!window.BaseWindowInstance) {
            // Всё ещё нет — повторим
            setTimeout(_flushPendingCategories, 50);
            return;
        }

        for (const category of pending) {
            _installCategoryGetter(category);
        }
        pending.clear();
    }

    // ============================================================
    // NAMESPACE PROXY (this.ui / this.chart / ...)
    // ============================================================

    function _makeNamespaceProxy(category, windowInstance) {
        const componentCache = Object.create(null);

        return new Proxy({}, {
            get(target, name) {
                if (typeof name !== 'string') return undefined;
                if (name === 'category') return category;

                // Компонент уже создан — возвращаем
                if (componentCache[name]) {
                    return componentCache[name];
                }

                // Есть в реестре?
                const config = _registry[category] && _registry[category][name];
                if (!config) {
                    // Не найден — возвращаем undefined
                    return undefined;
                }

                const proxy = _makeComponentProxy(category, name, config, windowInstance);
                componentCache[name] = proxy;
                return proxy;
            },

            has(target, name) {
                return !!(_registry[category] && _registry[category][name]);
            },

            ownKeys() {
                return Object.keys(_registry[category] || {});
            },

            getOwnPropertyDescriptor(target, name) {
                if (_registry[category] && _registry[category][name]) {
                    return {
                        enumerable: true,
                        configurable: true
                    };
                }
                return undefined;
            }
        });
    }

    // ============================================================
    // COMPONENT PROXY (this.ui.button)
    // ============================================================

    function _makeComponentProxy(category, name, config, windowInstance) {
        // Функция-обёртка, чтобы Proxy работал как callable
        const target = function() {};

        // Опционально — привет для дебага
        Object.defineProperty(target, 'name', {
            value: `${category}.${name}`,
            configurable: true
        });

        return new Proxy(target, {
            // this.ui.button(...)  →  config.create.call(windowInstance, ...)
            apply(t, thisArg, args) {
                if (typeof config.create === 'function') {
                    try {
                        return config.create.apply(windowInstance, args);
                    } catch (e) {
                        console.error(`[ExtendedAPIInjector] ${category}.${name}.create error:`, e);
                        return null;
                    }
                }
                console.warn(`[ExtendedAPIInjector] ${category}.${name} has no create()`);
                return null;
            },

            // this.ui.button.create / .someMethod / .data / ...
            get(t, prop) {
                if (typeof prop !== 'string') return undefined;

                // Спецполя
                if (prop === '__config') return config;
                if (prop === '__category') return category;
                if (prop === '__name') return name;
                if (prop === '__window') return windowInstance;

                // create — алиас вызова
                if (prop === 'create') {
                    return function(...args) {
                        if (typeof config.create === 'function') {
                            try {
                                return config.create.apply(windowInstance, args);
                            } catch (e) {
                                console.error(`[ExtendedAPIInjector] ${category}.${name}.create error:`, e);
                                return null;
                            }
                        }
                        console.warn(`[ExtendedAPIInjector] ${category}.${name} has no create()`);
                        return null;
                    };
                }

                // Публичный метод?
                if (typeof config[prop] === 'function' && !prop.startsWith('_')) {
                    return config[prop].bind(windowInstance);
                }

                // Данные
                if (Object.prototype.hasOwnProperty.call(config, prop)) {
                    return config[prop];
                }

                return undefined;
            },

            has(t, prop) {
                if (typeof prop !== 'string') return false;
                if (prop === 'create') return typeof config.create === 'function';
                if (typeof config[prop] === 'function' && !prop.startsWith('_')) return true;
                return Object.prototype.hasOwnProperty.call(config, prop);
            },

            ownKeys() {
                const keys = new Set(['create']);
                for (const k in config) {
                    if (!k.startsWith('_') && k !== 'css' && k !== 'version') {
                        keys.add(k);
                    }
                }
                return Array.from(keys);
            },

            getOwnPropertyDescriptor(t, prop) {
                if (typeof prop !== 'string') return undefined;
                if (this.has(t, prop)) {
                    return { enumerable: true, configurable: true };
                }
                return undefined;
            }
        });
    }

    // ============================================================
    // УПРАВЛЕНИЕ РЕЕСТРОМ
    // ============================================================

    /**
     * Есть ли категория в реестре?
     */
    function hasCategory(category) {
        return !!_registry[category];
    }

    /**
     * Есть ли компонент?
     */
    function hasComponent(category, name) {
        return !!(_registry[category] && _registry[category][name]);
    }

    /**
     * Список компонентов категории.
     */
    function listComponents(category) {
        if (!_registry[category]) return [];
        return Object.keys(_registry[category]);
    }

    /**
     * Список категорий.
     */
    function listCategories() {
        return Object.keys(_registry);
    }

    /**
     * Версия компонента.
     */
    function getComponentVersion(category, name) {
        return _versions[`${category}.${name}`] || null;
    }

    /**
     * Все версии (для дебага).
     */
    function listVersions() {
        return Object.assign({}, _versions);
    }

    /**
     * Полный реестр (для дебага/интроспекции).
     */
    function getRegistry() {
        const out = Object.create(null);
        for (const cat in _registry) {
            out[cat] = Object.keys(_registry[cat]);
        }
        return out;
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    window.registerComponent = registerComponent;

    window.ExtendedAPI = {
        registerComponent,
        hasCategory,
        hasComponent,
        listComponents,
        listCategories,
        getComponentVersion,
        listVersions,
        getRegistry
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            registerComponent,
            ExtendedAPI: window.ExtendedAPI
        };
    }

    console.log('[ExtendedAPIInjector] Registered globally v1.0.0');
    console.log('[ExtendedAPIInjector] Use: window.registerComponent(category, name, config)');

})();