// core/API/ExtendedAPIInjector.js
// Версия 1.0.1 — Fix: коллизия категорий с Object.prototype
// - _installCategoryGetter: getOwnPropertyDescriptor вместо `in`
// - Защита от зарезервированных имён (__proto__, prototype, constructor)
// - namespace proxy: get('then') → undefined (не thenable)

(function() {
    'use strict';

    console.log('[ExtendedAPIInjector] Loading v1.0.1...');

    // ============================================================
    // РЕЕСТР
    // ============================================================

    const _registry = Object.create(null);
    const _versions = Object.create(null);

    // Зарезервированные имена, которые нельзя использовать как category
    const RESERVED_NAMES = new Set([
        '__proto__',
        'prototype',
        'constructor',
        'toString',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
        'then',
        'catch',
        'finally'
    ]);

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

    function registerComponent(category, name, config) {
        if (!category || typeof category !== 'string') {
            console.error('[ExtendedAPIInjector] registerComponent: category is required');
            return false;
        }
        if (!name || typeof name !== 'string') {
            console.error('[ExtendedAPIInjector] registerComponent: name is required');
            return false;
        }
        if (RESERVED_NAMES.has(category)) {
            console.error(`[ExtendedAPIInjector] registerComponent: category "${category}" is reserved`);
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
            const merged = Object.assign({}, existing, config);

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

        if (config.version) {
            _versions[`${category}.${name}`] = String(config.version);
        }

        _injectCSS(category, name, config.css);

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
            if (!_installCategoryGetter._pending) {
                _installCategoryGetter._pending = new Set();
            }
            _installCategoryGetter._pending.add(category);
            setTimeout(_flushPendingCategories, 50);
            return;
        }

        const proto = window.BaseWindowInstance.prototype;

        // ✅ FIX: getOwnPropertyDescriptor вместо `in`
        // `in` ловит Object.prototype.constructor/toString/etc.
        const descriptor = Object.getOwnPropertyDescriptor(proto, category);
        if (descriptor) {
            if (typeof descriptor.get === 'function') {
                // Уже установлен — ок
                return;
            }
            console.warn(
                `[ExtendedAPIInjector] ⚠️ category "${category}" already exists on BaseWindowInstance.prototype — skipping`
            );
            return;
        }

        Object.defineProperty(proto, category, {
            get() {
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

                // ✅ FIX: не быть thenable
                if (name === 'then' || name === 'catch' || name === 'finally') {
                    return undefined;
                }

                if (name === 'category') return category;
                if (name === '__category') return category;
                if (name === '__names') {
                    return Object.keys(_registry[category] || {});
                }

                if (componentCache[name]) {
                    return componentCache[name];
                }

                const config = _registry[category] && _registry[category][name];
                if (!config) {
                    return undefined;
                }

                const proxy = _makeComponentProxy(category, name, config, windowInstance);
                componentCache[name] = proxy;
                return proxy;
            },

            has(target, name) {
                if (typeof name !== 'string') return false;
                if (name === 'category' || name === '__category' || name === '__names') return true;
                return !!(_registry[category] && _registry[category][name]);
            },

            ownKeys() {
                return ['category', '__category', '__names', ...Object.keys(_registry[category] || {})];
            },

            getOwnPropertyDescriptor(target, name) {
                if (typeof name !== 'string') return undefined;

                if (name === 'category' || name === '__category' || name === '__names') {
                    return { enumerable: true, configurable: true };
                }
                if (_registry[category] && _registry[category][name]) {
                    return { enumerable: true, configurable: true };
                }
                return undefined;
            }
        });
    }

    // ============================================================
    // COMPONENT PROXY (this.ui.button)
    // ============================================================

    function _makeComponentProxy(category, name, config, windowInstance) {
        const target = function() {};

        Object.defineProperty(target, 'name', {
            value: `${category}.${name}`,
            configurable: true
        });

        return new Proxy(target, {
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

            get(t, prop) {
                if (typeof prop !== 'string') return undefined;

                if (prop === '__config') return config;
                if (prop === '__category') return category;
                if (prop === '__name') return name;
                if (prop === '__window') return windowInstance;

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

                if (typeof config[prop] === 'function' && !prop.startsWith('_')) {
                    return config[prop].bind(windowInstance);
                }

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

    function hasCategory(category) {
        return !!_registry[category];
    }

    function hasComponent(category, name) {
        return !!(_registry[category] && _registry[category][name]);
    }

    function listComponents(category) {
        if (!_registry[category]) return [];
        return Object.keys(_registry[category]);
    }

    function listCategories() {
        return Object.keys(_registry);
    }

    function getComponentVersion(category, name) {
        return _versions[`${category}.${name}`] || null;
    }

    function listVersions() {
        return Object.assign({}, _versions);
    }

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
        getRegistry,
        RESERVED_NAMES: Array.from(RESERVED_NAMES)
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            registerComponent,
            ExtendedAPI: window.ExtendedAPI
        };
    }

    console.log('[ExtendedAPIInjector] Registered globally v1.0.1');
    console.log('[ExtendedAPIInjector] Use: window.registerComponent(category, name, config)');

})();