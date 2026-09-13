// core/WindowRegistry.js
// Версия 5.2.0 - Feature: registerFromClass + channels/dropTarget metadata
// - registerFromClass(Class) — регистрация типа из класса с static meta
// - _typeChannels: Map<typeId, string[]>
// - _typeDropTarget: Map<typeId, object>
// - getTypeChannels(typeId) / getTypeDropTarget(typeId)
// - register/unregister — чистят новые Map
// - register(config) — без изменений (legacy путь)
// - createInstance/attachInstance/detachInstance — без изменений

(function() {
    'use strict';

    console.log('[WindowRegistry] Loading v5.2.0...');

    class WindowRegistry {
        constructor() {
            this._types = new Map();
            this._instances = new Map();

            // ✅ НОВОЕ: метаданные для PluginSystem
            this._typeChannels = new Map();
            this._typeDropTarget = new Map();

            this._initialized = false;
        }

        // ============================================================
        // 1. РЕГИСТРАЦИЯ ТИПА (legacy)
        // ============================================================

        register(config) {
            if (!config || !config.id) {
                console.error('[WindowRegistry] Type must have an id');
                return false;
            }

            if (this._types.has(config.id)) {
                if (config.strict === true) {
                    console.error('[WindowRegistry] Type "' + config.id + '" already registered (strict)');
                    return false;
                }

                console.warn('[WindowRegistry] ⚠️ Type "' + config.id + '" already registered — overriding');

                // Чистим старые instances этого типа
                const oldInstances = this.getInstancesByType(config.id);
                for (const inst of oldInstances) {
                    try {
                        const oldType = this._types.get(config.id);
                        if (oldType && typeof oldType.onDestroy === 'function') {
                            oldType.onDestroy(inst.container, inst.windowData, inst.instance);
                        }
                        if (inst.instance && typeof inst.instance.destroy === 'function') {
                            inst.instance.destroy();
                        }
                    } catch (e) {
                        console.error('[WindowRegistry] Error destroying old instance:', e);
                    }
                    this._instances.delete(inst.id);
                }

                // ✅ Чистим метаданные
                this._typeChannels.delete(config.id);
                this._typeDropTarget.delete(config.id);
            }

            const fullConfig = {
                id: config.id,
                name: config.name || config.id,
                icon: config.icon || 'icon-window',
                description: config.description || '',

                group: config.group || 'Other',

                category: config.category || 'other',
                defaultSize: config.defaultSize || { width: 400, height: 300 },
                minSize: config.minSize || { width: 200, height: 150 },
                maxWindows: config.maxWindows || 4,
                priority: config.priority || 999,
                metadata: config.metadata || {},

                // === UI ===
                headerButtons: config.headerButtons || [],
                contextMenu: config.contextMenu || [],
                dropdownMenu: config.dropdownMenu || null,

                // === HOTKEYS ===
                hotkeys: config.hotkeys && typeof config.hotkeys === 'object'
                    ? { ...config.hotkeys }
                    : {},

                // === ЖИЗНЕННЫЙ ЦИКЛ ===
                create: config.create || null,
                onBeforeCreate: config.onBeforeCreate || null,
                onAfterCreate: config.onAfterCreate || null,
                onDestroy: config.onDestroy || null,
                onResize: config.onResize || null,
                onFocus: config.onFocus || null,
                onBlur: config.onBlur || null,

                // === ДАННЫЕ ===
                getAllData: config.getAllData || null,
                setAllData: config.setAllData || null,
                getDataForExport: config.getDataForExport || null,
                importFromLSW: config.importFromLSW || null,
                getDataByMeta: config.getDataByMeta || null
            };

            this._types.set(config.id, fullConfig);

            console.log('[WindowRegistry] ✅ Registered: "' + config.id + '"',
                '(group:', fullConfig.group + ')',
                '(hotkeys:', Object.keys(fullConfig.hotkeys).length + ')');
            this._notify('register', config.id, fullConfig);
            return true;
        }

        registerAll(types) {
            if (!Array.isArray(types)) return 0;
            let count = 0;
            for (const type of types) {
                if (this.register(type)) count++;
            }
            return count;
        }

        // ============================================================
        // 1.1. РЕГИСТРАЦИЯ ТИПА ИЗ КЛАССА (✅ НОВОЕ v5.2.0)
        // ============================================================

        /**
         * Регистрирует тип из класса с `static get meta()`.
         *
         * Класс может определить:
         *   - static get meta()       — { id, name, icon, group, ... }
         *   - static get menu()       — { headerButtons, contextMenu, dropdownMenu }
         *   - static get hotkeys()    — { 'Ctrl+N': { label, action } }
         *   - static get channels()   — ['chan1', 'chan2']
         *   - static get dropTarget() — { acceptExtensions, accept, multiple }
         *
         * @param {Function} Class — класс окна
         * @returns {boolean}
         */
        registerFromClass(Class) {
            if (typeof Class !== 'function') {
                console.error('[WindowRegistry] registerFromClass: Class must be a function');
                return false;
            }

            const meta = Class.meta;
            if (!meta || typeof meta !== 'object') {
                console.error('[WindowRegistry] registerFromClass: Class.meta is required (static get meta())');
                return false;
            }

            if (!meta.id) {
                console.error('[WindowRegistry] registerFromClass: meta.id is required');
                return false;
            }

            const typeId = String(meta.id);

            const menu = (Class.menu && typeof Class.menu === 'object') ? Class.menu : {};
            const hotkeys = (Class.hotkeys && typeof Class.hotkeys === 'object') ? Class.hotkeys : {};
            const channels = Array.isArray(Class.channels) ? Class.channels.slice() : [];
            const dropTarget = (Class.dropTarget && typeof Class.dropTarget === 'object')
                ? { ...Class.dropTarget }
                : null;

            const registered = this.register({
                // === META ===
                id: typeId,
                name: meta.name || typeId,
                icon: meta.icon || 'icon-window',
                description: meta.description || '',
                group: meta.group || 'Other',
                category: meta.category || 'other',
                defaultSize: meta.defaultSize || { width: 400, height: 300 },
                minSize: meta.minSize || { width: 200, height: 150 },
                maxWindows: meta.maxWindows || 4,
                priority: meta.priority || 999,
                metadata: meta.metadata || {},

                // === MENU ===
                headerButtons: menu.headerButtons || [],
                contextMenu: menu.contextMenu || [],
                dropdownMenu: menu.dropdownMenu || null,

                // === HOTKEYS ===
                hotkeys: hotkeys,

                // === FACTORY ===
                create: (container, windowData, options) => {
                    return new Class(container, windowData, options);
                },

                onDestroy: (container, windowData, instance) => {
                    if (instance && typeof instance.destroy === 'function') {
                        instance.destroy();
                    }
                },

                onResize: (container, windowData, instance) => {
                    if (instance && typeof instance.resize === 'function') {
                        instance.resize();
                    }
                }
            });

            if (!registered) {
                return false;
            }

            // ✅ Сохраняем метаданные для PluginSystem
            if (channels.length > 0) {
                this._typeChannels.set(typeId, channels);
            }
            if (dropTarget) {
                this._typeDropTarget.set(typeId, dropTarget);
            }

            console.log('[WindowRegistry] ✅ Registered from class: "' + typeId + '"',
                '(channels:', channels.length + ')',
                '(dropTarget:', dropTarget ? 'yes' : 'no' + ')');
            return true;
        }

        unregister(id) {
            if (!this._types.has(id)) {
                console.warn('[WindowRegistry] unregister: type not found:', id);
                return false;
            }

            const instances = this.getInstancesByType(id);
            for (const inst of instances) {
                try {
                    const type = this._types.get(id);
                    if (type && typeof type.onDestroy === 'function') {
                        type.onDestroy(inst.container, inst.windowData, inst.instance);
                    }
                    if (inst.instance && typeof inst.instance.destroy === 'function') {
                        inst.instance.destroy();
                    }
                } catch (e) {
                    console.error('[WindowRegistry] Error destroying instance:', e);
                }
                this._instances.delete(inst.id);
            }

            this._types.delete(id);

            // ✅ Чистим метаданные
            this._typeChannels.delete(id);
            this._typeDropTarget.delete(id);

            this._notify('unregister', id);
            console.log('[WindowRegistry] 🗑️ Unregistered: "' + id + '"');
            return true;
        }

        // ============================================================
        // 2. ПОЛУЧЕНИЕ ТИПА
        // ============================================================

        getType(id) {
            return this._types.get(id) || null;
        }

        getTypeInfo(id) {
            return this.getType(id);
        }

        getAllTypes() {
            const arr = Array.from(this._types.values());
            arr.sort((a, b) => (a.priority || 999) - (b.priority || 999));
            return arr;
        }

        getTypesByCategory(category) {
            return this.getAllTypes().filter(t => t.category === category);
        }

        getCategories() {
            return Array.from(new Set(this.getAllTypes().map(t => t.category)));
        }

        hasType(id) {
            return this._types.has(id);
        }

        // ============================================================
        // 2.1. ГРУППЫ
        // ============================================================

        getTypesByGroup() {
            const result = {};
            for (const type of this._types.values()) {
                const g = type.group || 'Other';
                if (!result[g]) result[g] = [];
                result[g].push(type);
            }
            for (const g in result) {
                if (!Object.prototype.hasOwnProperty.call(result, g)) continue;
                result[g].sort((a, b) => (a.priority || 999) - (b.priority || 999));
            }
            return result;
        }

        getGroups() {
            const set = new Set();
            for (const type of this._types.values()) {
                set.add(type.group || 'Other');
            }
            return Array.from(set);
        }

        getGroupName(typeId) {
            const type = this._types.get(typeId);
            return type ? (type.group || 'Other') : null;
        }

        // ============================================================
        // 2.2. ХОТКЕИ ТИПА
        // ============================================================

        getTypeHotkeys(typeId) {
            const type = this._types.get(typeId);
            if (!type || !type.hotkeys) return {};
            return { ...type.hotkeys };
        }

        getAllTypeHotkeys() {
            const result = {};
            for (const [id, type] of this._types) {
                if (type.hotkeys && Object.keys(type.hotkeys).length > 0) {
                    result[id] = { ...type.hotkeys };
                }
            }
            return result;
        }

        // ============================================================
        // 2.3. CHANNELS / DROP TARGET (✅ НОВОЕ v5.2.0)
        // ============================================================

        /**
         * Каналы, которые слушает тип (из static channels).
         * @returns {string[]} — копия массива
         */
        getTypeChannels(typeId) {
            const arr = this._typeChannels.get(typeId);
            return arr ? arr.slice() : [];
        }

        /**
         * Drop-target config типа (из static dropTarget).
         * @returns {object|null} — копия
         */
        getTypeDropTarget(typeId) {
            const cfg = this._typeDropTarget.get(typeId);
            return cfg ? { ...cfg } : null;
        }

        getAllTypeChannels() {
            const result = {};
            for (const [id, arr] of this._typeChannels) {
                result[id] = arr.slice();
            }
            return result;
        }

        getAllTypeDropTargets() {
            const result = {};
            for (const [id, cfg] of this._typeDropTarget) {
                result[id] = { ...cfg };
            }
            return result;
        }

        // ============================================================
        // 3. СОЗДАНИЕ ЭКЗЕМПЛЯРА
        // ============================================================

        createInstance(typeId, container, options = {}) {
            const type = this.getType(typeId);
            if (!type) {
                console.error('[WindowRegistry] Type "' + typeId + '" not found');
                return null;
            }
            if (!type.create) {
                console.error('[WindowRegistry] Type "' + typeId + '" has no create function');
                return null;
            }

            const instances = this.getInstancesByType(typeId);
            if (instances.length >= type.maxWindows) {
                console.warn('[WindowRegistry] Max instances (' + type.maxWindows + ') for "' + typeId + '"');
                return null;
            }

            const BaseWindow = window.BaseWindow;
            if (!BaseWindow) {
                console.error('[WindowRegistry] BaseWindow not found');
                return null;
            }

            const windowData = options.windowData || {
                id: options.id || Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: typeId,
                title: type.name,
                icon: type.icon
            };

            if (type.onBeforeCreate) {
                try { type.onBeforeCreate(container, windowData); } catch (e) {
                    console.error('[WindowRegistry] onBeforeCreate error:', e);
                }
            }

            let instance = null;
            try {
                instance = type.create(container, windowData, {
                    dataBus: options.dataBus,
                    registry: this,
                    eventBus: options.eventBus,
                    layoutManager: options.layoutManager,
                    messageBus: options.messageBus,
                    _realInstance: options._realInstance || null
                });
            } catch (error) {
                console.error('[WindowRegistry] Error creating instance:', error);
                return null;
            }

            if (!(instance instanceof BaseWindow)) {
                const wrapped = new BaseWindow({
                    id: windowData.id,
                    type: typeId,
                    container: container,
                    options: {
                        dataBus: options.dataBus,
                        registry: this,
                        eventBus: options.eventBus,
                        layoutManager: options.layoutManager,
                        messageBus: options.messageBus,
                        _realInstance: instance || null
                    }
                });
                instance = wrapped;
            }

            if (type.onAfterCreate) {
                try { type.onAfterCreate(container, windowData, instance); } catch (e) {
                    console.error('[WindowRegistry] onAfterCreate error:', e);
                }
            }

            const instanceId = windowData.id;
            this._instances.set(String(instanceId), {
                type: typeId,
                windowData: windowData,
                container: container,
                instance: instance,
                created: Date.now()
            });

            this._notify('create', typeId, windowData, instance);
            console.log('[WindowRegistry] Window created: "' + typeId + '" (' + instanceId + ')');
            return instance;
        }

        // ============================================================
        // 3.1. ATTACH / DETACH
        // ============================================================

        attachInstance(windowId, instance, windowData, container) {
            if (windowId == null || !instance) {
                console.warn('[WindowRegistry] attachInstance: invalid args');
                return false;
            }

            const sid = String(windowId);

            if (this._instances.has(sid)) {
                console.warn('[WindowRegistry] attachInstance: overwriting existing', sid);
            }

            this._instances.set(sid, {
                type: windowData?.type || instance.type || 'unknown',
                windowData: windowData || {
                    id: windowId,
                    type: instance.type
                },
                container: container || instance.container || null,
                instance: instance,
                created: Date.now()
            });

            this._notify('attach', sid, instance);
            return true;
        }

        detachInstance(windowId) {
            const sid = String(windowId);
            if (!this._instances.has(sid)) return false;

            this._instances.delete(sid);
            this._notify('detach', sid);
            return true;
        }

        // ============================================================
        // 4. УНИЧТОЖЕНИЕ
        // ============================================================

        destroyWindow(instanceId) {
            const sid = String(instanceId);
            const record = this._instances.get(sid);
            if (!record) return false;

            const type = this.getType(record.type);
            if (type && typeof type.onDestroy === 'function') {
                try {
                    type.onDestroy(record.container, record.windowData, record.instance);
                } catch (e) {
                    console.error('[WindowRegistry] onDestroy error:', e);
                }
            }

            if (record.instance && typeof record.instance.destroy === 'function') {
                try {
                    record.instance.destroy();
                } catch (e) {
                    console.error('[WindowRegistry] instance.destroy error:', e);
                }
            }

            this._instances.delete(sid);
            this._notify('destroy', sid, record);
            console.log('[WindowRegistry] Window destroyed: ' + sid);
            return true;
        }

        destroyAll() {
            const ids = Array.from(this._instances.keys());
            for (const id of ids) this.destroyWindow(id);
        }

        // ============================================================
        // 5. ПОЛУЧЕНИЕ ЭКЗЕМПЛЯРОВ
        // ============================================================

        getInstance(id) {
            const data = this._instances.get(String(id));
            return data ? data.instance : null;
        }

        hasInstance(id) {
            return this._instances.has(String(id));
        }

        getInstancesByType(typeId) {
            const result = [];
            this._instances.forEach((record, key) => {
                if (record.type === typeId) {
                    result.push({
                        id: key,
                        type: record.type,
                        windowData: record.windowData,
                        container: record.container,
                        instance: record.instance,
                        created: record.created
                    });
                }
            });
            return result;
        }

        getAllInstances() {
            const result = [];
            this._instances.forEach((record, key) => {
                result.push({
                    id: key,
                    type: record.type,
                    windowData: record.windowData,
                    container: record.container,
                    instance: record.instance,
                    created: record.created
                });
            });
            return result;
        }

        getInstanceCount() {
            return this._instances.size;
        }

        // ============================================================
        // 6. СОБЫТИЯ
        // ============================================================

        addListener(callback) {
            if (typeof callback === 'function') {
                if (!this._listeners) this._listeners = [];
                this._listeners.push(callback);
                return () => this.removeListener(callback);
            }
            return null;
        }

        removeListener(callback) {
            if (!this._listeners) return;
            const index = this._listeners.indexOf(callback);
            if (index !== -1) this._listeners.splice(index, 1);
        }

        _notify(event, ...args) {
            if (!this._listeners) return;
            for (const cb of this._listeners) {
                try { cb(event, ...args); } catch (e) {
                    console.error('[WindowRegistry]', e);
                }
            }
        }

        // ============================================================
        // 7. СЕРИАЛИЗАЦИЯ
        // ============================================================

        exportConfig() {
            const config = {};
            this._types.forEach((type, id) => {
                config[id] = {
                    id: type.id,
                    name: type.name,
                    icon: type.icon,
                    description: type.description,
                    group: type.group,
                    category: type.category,
                    defaultSize: type.defaultSize,
                    minSize: type.minSize,
                    maxWindows: type.maxWindows,
                    priority: type.priority,
                    metadata: type.metadata
                };
            });
            return config;
        }

        importConfig(config) {
            if (!config || typeof config !== 'object') return false;

            let count = 0;
            for (const [id, type] of Object.entries(config)) {
                if (this.register({ id, ...type })) count++;
            }
            return count;
        }

        // ============================================================
        // 8. СТАТИСТИКА
        // ============================================================

        getStats() {
            const byType = {};
            this._instances.forEach((record) => {
                if (!byType[record.type]) byType[record.type] = 0;
                byType[record.type]++;
            });

            return {
                totalTypes: this._types.size,
                totalInstances: this._instances.size,
                categories: this.getCategories(),
                groups: this.getGroups(),
                types: this.getAllTypes().map(t => t.id),
                byType: byType,
                typesWithChannels: this._typeChannels.size,
                typesWithDropTarget: this._typeDropTarget.size
            };
        }

        init() {
            this._initialized = true;
            console.log('[WindowRegistry] Initialized v5.2.0');
            return this;
        }

        isInitialized() {
            return this._initialized;
        }

        destroy() {
            this.destroyAll();
            this._types.clear();
            this._typeChannels.clear();
            this._typeDropTarget.clear();
            this._listeners = [];
            this._initialized = false;
            console.log('[WindowRegistry] Destroyed');
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { WindowRegistry };
    }

    if (typeof window !== 'undefined') {
        window.WindowRegistry = WindowRegistry;
        console.log('[WindowRegistry] Registered globally v5.2.0');
    }

})();