// core/AppState.js
// Версия 6.1.0

(function() {
    'use strict';

    var STORAGE_KEYS = {
        THEME_MODE: 'lsystem-theme-mode',
        THEME_AUTO_HOURS: 'lsystem-theme-auto-hours',
        ACCOUNT: 'lsystem-account',
        HOTKEY_OVERRIDES: 'lsystem-hotkey-overrides',
        GROUP_COLLAPSED: 'lsystem-window-group-collapsed'
    };

    var HOTKEY_OVERRIDES_VERSION = 2;

    function deepCopy(obj) {
        if (obj === null || obj === undefined) return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return {};
        }
    }

    var AppState = function(options) {
        options = options || {};

        this._themeMode = 'dark';
        this._theme = 'dark';
        this._autoHours = { darkStart: 18, darkEnd: 6 };

        this._account = null;

        this._hotkeyOverrides = {
            _version: HOTKEY_OVERRIDES_VERSION,
            global: {},
            windows: {}
        };

        this._windowGroupCollapsed = {};

        this._listeners = {};
        this._globalListeners = [];

        this._themeTimer = null;

        this._debug = !!options.debug;

        if (options.persist !== false) {
            this._loadFromStorage();
        }

        this._theme = this.getEffectiveTheme();
        this._applyTheme();

        this._startThemeAutoTimer();

        var self = this;
        queueMicrotask(function() {
            self._notify('themeMode', self._themeMode);
            self._notify('theme', self._theme);
        });
    };

    // ============================================================
    // 1. ТЕМА
    // ============================================================

    AppState.prototype.getTheme = function() {
        return this._theme;
    };

    AppState.prototype.getThemeMode = function() {
        return this._themeMode;
    };

    AppState.prototype.isAutoTheme = function() {
        return this._themeMode === 'auto';
    };

    AppState.prototype.setThemeMode = function(mode) {
        if (mode !== 'auto' && mode !== 'dark' && mode !== 'light') {
            console.warn('[AppState] Invalid theme mode:', mode);
            return false;
        }

        if (this._themeMode === mode) {
            return true;
        }

        this._themeMode = mode;
        this._saveThemeMode();

        var next = this.getEffectiveTheme();
        if (next !== this._theme) {
            this._theme = next;
            this._applyTheme();
            this._notify('theme', next);
        }

        this._notify('themeMode', mode);
        return true;
    };

    AppState.prototype.setTheme = function(theme) {
        if (theme !== 'dark' && theme !== 'light') {
            console.warn('[AppState] Invalid theme:', theme);
            return false;
        }
        return this.setThemeMode(theme);
    };

    AppState.prototype.toggleTheme = function() {
        var next = this._theme === 'dark' ? 'light' : 'dark';
        this.setThemeMode(next);
        return next;
    };

    AppState.prototype.getEffectiveTheme = function() {
        if (this._themeMode !== 'auto') {
            return this._themeMode;
        }

        var h = new Date().getHours();
        var start = this._autoHours.darkStart;
        var end = this._autoHours.darkEnd;

        var isDark;
        if (start > end) {
            isDark = (h >= start || h < end);
        } else {
            isDark = (h >= start && h < end);
        }

        return isDark ? 'dark' : 'light';
    };

    AppState.prototype.getAutoThemeHours = function() {
        return {
            darkStart: this._autoHours.darkStart,
            darkEnd: this._autoHours.darkEnd
        };
    };

    AppState.prototype.setAutoThemeHours = function(cfg) {
        if (!cfg || typeof cfg !== 'object') return false;

        var start = parseInt(cfg.darkStart, 10);
        var end = parseInt(cfg.darkEnd, 10);

        if (isNaN(start) || start < 0 || start > 23) start = 18;
        if (isNaN(end) || end < 0 || end > 23) end = 6;

        if (this._autoHours.darkStart === start && this._autoHours.darkEnd === end) {
            return false;
        }

        this._autoHours = { darkStart: start, darkEnd: end };
        this._saveThemeAutoHours();

        if (this._themeMode === 'auto') {
            var next = this.getEffectiveTheme();
            if (next !== this._theme) {
                this._theme = next;
                this._applyTheme();
                this._notify('theme', next);
            }
        }

        this._notify('themeAutoHours', this.getAutoThemeHours());
        return true;
    };

    AppState.prototype._applyTheme = function() {
        if (typeof document === 'undefined') return;
        document.documentElement.setAttribute('data-theme', this._theme);
    };

    AppState.prototype._startThemeAutoTimer = function() {
        var self = this;

        if (this._themeTimer) {
            clearInterval(this._themeTimer);
        }

        this._themeTimer = setInterval(function() {
            if (self._themeMode !== 'auto') return;

            var next = self.getEffectiveTheme();
            if (next !== self._theme) {
                self._theme = next;
                self._applyTheme();
                self._notify('theme', next);
            }
        }, 60000);
    };

    // ============================================================
    // 2. АККАУНТ
    // ============================================================

    AppState.prototype.getAccount = function() {
        if (!this._account) return null;
        return {
            id: this._account.id,
            name: this._account.name
        };
    };

    AppState.prototype.setAccount = function(account) {
        if (!account || typeof account !== 'object') {
            console.warn('[AppState] Invalid account');
            return false;
        }

        var prev = this._account || {};

        var normalized = {
            id: String(account.id || prev.id || 'u_' + Date.now().toString(36)),
            name: account.name !== undefined ? String(account.name) : String(prev.name || '')
        };

        this._account = normalized;
        this._saveAccount();
        this._notify('account', this.getAccount());
        return true;
    };

    AppState.prototype.clearAccount = function() {
        this._account = null;
        this._saveAccount();
        this._notify('account', null);
    };

    // ============================================================
    // 3. ХОТКЕИ — ДЕФОЛТЫ
    // ============================================================

    AppState.prototype.ensureGlobalHotkeyDefaults = function(defaults) {
        if (!defaults || typeof defaults !== 'object') return;

        var changed = false;
        var bucket = this._hotkeyOverrides.global;
        var seen = Object.create(null);

        for (var combo in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, combo)) continue;
            seen[combo] = true;

            var def = defaults[combo] || {};
            var existing = bucket[combo];

            if (!existing) {
                bucket[combo] = {
                    combo: combo,
                    original: combo,
                    label: def.label || combo,
                    action: def.action || null,
                    overridden: false
                };
                changed = true;
            } else {
                var nextLabel = def.label || combo;
                var nextAction = def.action || null;

                if (existing.label !== nextLabel) {
                    existing.label = nextLabel;
                    changed = true;
                }
                if (existing.action !== nextAction) {
                    existing.action = nextAction;
                    changed = true;
                }
                if (existing.original !== combo) {
                    existing.original = combo;
                    changed = true;
                }
                if (existing.overridden === undefined) {
                    existing.overridden = existing.combo !== existing.original;
                    changed = true;
                }
            }
        }

        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            if (!seen[key]) {
                delete bucket[key];
                changed = true;
            }
        }

        if (changed) {
            this._saveHotkeyOverrides();
            this._notify('hotkeyOverrides', this._hotkeyOverrides);
        }
    };

    AppState.prototype.ensureHotkeyDefaults = function(typeId, defaults) {
        if (!typeId || !defaults || typeof defaults !== 'object') return;

        if (!this._hotkeyOverrides.windows[typeId]) {
            this._hotkeyOverrides.windows[typeId] = {};
        }

        var bucket = this._hotkeyOverrides.windows[typeId];
        var seen = Object.create(null);
        var changed = false;

        for (var combo in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, combo)) continue;
            seen[combo] = true;

            var def = defaults[combo] || {};
            var existing = bucket[combo];

            if (!existing) {
                bucket[combo] = {
                    combo: combo,
                    original: combo,
                    label: def.label || combo,
                    action: def.action || null,
                    overridden: false
                };
                changed = true;
            } else {
                var nextLabel = def.label || combo;
                var nextAction = def.action || null;

                if (existing.label !== nextLabel) {
                    existing.label = nextLabel;
                    changed = true;
                }
                if (existing.action !== nextAction) {
                    existing.action = nextAction;
                    changed = true;
                }
                if (existing.original !== combo) {
                    existing.original = combo;
                    changed = true;
                }
                if (existing.overridden === undefined) {
                    existing.overridden = existing.combo !== existing.original;
                    changed = true;
                }
            }
        }

        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            if (!seen[key]) {
                delete bucket[key];
                changed = true;
            }
        }

        if (Object.keys(bucket).length === 0) {
            delete this._hotkeyOverrides.windows[typeId];
            changed = true;
        }

        if (changed) {
            this._saveHotkeyOverrides();
            this._notify('hotkeyOverrides', this._hotkeyOverrides);
        }
    };

    // ============================================================
    // 4. ХОТКЕИ — ЧТЕНИЕ
    // ============================================================

    AppState.prototype.getGlobalHotkeys = function() {
        var result = {};
        for (var key in this._hotkeyOverrides.global) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.global, key)) continue;
            var val = this._hotkeyOverrides.global[key];
            result[key] = {
                combo: val.combo,
                original: val.original || key,
                label: val.label,
                action: val.action,
                overridden: !!val.overridden
            };
        }
        return result;
    };

    AppState.prototype.getWindowHotkeys = function(typeId) {
        var bucket = this._hotkeyOverrides.windows[typeId];
        if (!bucket) return {};

        var result = {};
        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            var val = bucket[key];
            result[key] = {
                combo: val.combo,
                original: val.original || key,
                label: val.label,
                action: val.action,
                overridden: !!val.overridden
            };
        }
        return result;
    };

    AppState.prototype.getHotkeyOverrides = function() {
        return deepCopy(this._hotkeyOverrides);
    };

    AppState.prototype.getEffectiveCombo = function(scope, typeId, originalCombo) {
        var record = null;

        if (scope === 'global') {
            record = this._hotkeyOverrides.global[originalCombo];
        } else if (scope === 'window' && typeId) {
            var bucketW = this._hotkeyOverrides.windows[typeId];
            if (bucketW) record = bucketW[originalCombo];
        }

        return record ? record.combo : originalCombo;
    };

    AppState.prototype.isHotkeyOverridden = function(scope, typeId, originalCombo) {
        var record = null;

        if (scope === 'global') {
            record = this._hotkeyOverrides.global[originalCombo];
        } else if (scope === 'window' && typeId) {
            var bucketW = this._hotkeyOverrides.windows[typeId];
            if (bucketW) record = bucketW[originalCombo];
        }

        return !!(record && record.overridden);
    };

    // ============================================================
    // 5. ХОТКЕИ — ЗАПИСЬ
    // ============================================================

    AppState.prototype.setHotkeyOverride = function(scope, typeId, originalCombo, newCombo) {
        if (!originalCombo || !newCombo) return false;
        if (originalCombo === newCombo) {
            return this.resetHotkeyOverride(scope, typeId, originalCombo);
        }

        var record = null;

        if (scope === 'global') {
            record = this._hotkeyOverrides.global[originalCombo];
        } else if (scope === 'window' && typeId) {
            var bucketW = this._hotkeyOverrides.windows[typeId];
            if (bucketW) record = bucketW[originalCombo];
        } else {
            return false;
        }

        if (!record) return false;

        record.combo = newCombo;
        record.overridden = true;

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        return true;
    };

    AppState.prototype.resetHotkeyOverride = function(scope, typeId, originalCombo) {
        var record = null;

        if (scope === 'global') {
            record = this._hotkeyOverrides.global[originalCombo];
        } else if (scope === 'window' && typeId) {
            var bucketW = this._hotkeyOverrides.windows[typeId];
            if (bucketW) record = bucketW[originalCombo];
        } else {
            return false;
        }

        if (!record) return false;

        record.combo = record.original || originalCombo;
        record.overridden = false;

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        return true;
    };

    AppState.prototype.resetAllHotkeyOverrides = function() {
        for (var key in this._hotkeyOverrides.global) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.global, key)) continue;
            var r = this._hotkeyOverrides.global[key];
            r.combo = r.original || key;
            r.overridden = false;
        }

        for (var typeId in this._hotkeyOverrides.windows) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.windows, typeId)) continue;
            var bucket = this._hotkeyOverrides.windows[typeId];
            for (var k in bucket) {
                if (!Object.prototype.hasOwnProperty.call(bucket, k)) continue;
                var r2 = bucket[k];
                r2.combo = r2.original || k;
                r2.overridden = false;
            }
        }

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    AppState.prototype.setHotkeyOverrides = function(data) {
        if (!data || typeof data !== 'object') return;

        var migrated = (data._version && data._version >= HOTKEY_OVERRIDES_VERSION)
            ? data
            : this._migrateHotkeyOverridesV1toV2(data);

        this._hotkeyOverrides = {
            _version: HOTKEY_OVERRIDES_VERSION,
            global: (migrated.global && typeof migrated.global === 'object') ? migrated.global : {},
            windows: (migrated.windows && typeof migrated.windows === 'object') ? migrated.windows : {}
        };

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    // ============================================================
    // 6. СВЁРНУТОСТЬ ГРУПП
    // ============================================================

    AppState.prototype.getCollapsedGroups = function() {
        return deepCopy(this._windowGroupCollapsed);
    };

    AppState.prototype.isGroupCollapsed = function(groupName) {
        if (!groupName) return false;
        return !!this._windowGroupCollapsed[groupName];
    };

    AppState.prototype.setGroupCollapsed = function(groupName, collapsed) {
        if (!groupName) return false;
        var next = !!collapsed;
        if (this._windowGroupCollapsed[groupName] === next) return true;

        this._windowGroupCollapsed[groupName] = next;
        this._saveGroupCollapsed();
        this._notify('windowGroupCollapsed', this._windowGroupCollapsed);
        return true;
    };

    AppState.prototype.toggleGroupCollapsed = function(groupName) {
        if (!groupName) return false;
        var next = !this.isGroupCollapsed(groupName);
        this.setGroupCollapsed(groupName, next);
        return next;
    };

    AppState.prototype.resetGroupCollapsed = function() {
        this._windowGroupCollapsed = {};
        this._saveGroupCollapsed();
        this._notify('windowGroupCollapsed', this._windowGroupCollapsed);
    };

    // ============================================================
    // 7. ПОДПИСКИ
    // ============================================================

    AppState.prototype.subscribe = function(key, callback) {
        var self = this;
        if (typeof callback !== 'function') return function() {};

        if (key === '*') {
            this._globalListeners.push(callback);
            return function() {
                var idx = self._globalListeners.indexOf(callback);
                if (idx !== -1) self._globalListeners.splice(idx, 1);
            };
        }

        if (!this._listeners[key]) this._listeners[key] = [];
        this._listeners[key].push(callback);

        return function() {
            var arr = self._listeners[key];
            if (!arr) return;
            var idx = arr.indexOf(callback);
            if (idx !== -1) arr.splice(idx, 1);
            if (arr.length === 0) delete self._listeners[key];
        };
    };

    AppState.prototype._notify = function(key, value) {
        var arr = this._listeners[key];
        if (arr) {
            for (var i = 0; i < arr.length; i++) {
                try { arr[i](value); } catch (e) {
                    console.error('[AppState] Subscriber error:', e);
                }
            }
        }
        for (var j = 0; j < this._globalListeners.length; j++) {
            try { this._globalListeners[j](key, value); } catch (e) {
                console.error('[AppState] Global subscriber error:', e);
            }
        }
    };

    // ============================================================
    // 8. ПЕРСИСТЕНТНОСТЬ
    // ============================================================

    AppState.prototype._loadFromStorage = function() {
        if (typeof localStorage === 'undefined') return;

        try {
            var mode = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
            if (mode === 'auto' || mode === 'dark' || mode === 'light') {
                this._themeMode = mode;
            }

            var hoursStr = localStorage.getItem(STORAGE_KEYS.THEME_AUTO_HOURS);
            if (hoursStr) {
                try {
                    var h = JSON.parse(hoursStr);
                    if (h && typeof h === 'object' && !Array.isArray(h)) {
                        if (typeof h.darkStart === 'number' && h.darkStart >= 0 && h.darkStart <= 23) {
                            this._autoHours.darkStart = h.darkStart;
                        }
                        if (typeof h.darkEnd === 'number' && h.darkEnd >= 0 && h.darkEnd <= 23) {
                            this._autoHours.darkEnd = h.darkEnd;
                        }
                    }
                } catch (e) {}
            }

            var accStr = localStorage.getItem(STORAGE_KEYS.ACCOUNT);
            if (accStr) {
                var acc = JSON.parse(accStr);
                if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
                    this._account = {
                        id: String(acc.id || 'u_' + Date.now().toString(36)),
                        name: String(acc.name || '')
                    };
                }
            }

            var hotkeysStr = localStorage.getItem(STORAGE_KEYS.HOTKEY_OVERRIDES);
            if (hotkeysStr) {
                var hk = JSON.parse(hotkeysStr);
                if (hk && typeof hk === 'object' && !Array.isArray(hk)) {
                    if (!hk._version || hk._version < HOTKEY_OVERRIDES_VERSION) {
                        hk = this._migrateHotkeyOverridesV1toV2(hk);
                    }

                    this._hotkeyOverrides = {
                        _version: HOTKEY_OVERRIDES_VERSION,
                        global: (hk.global && typeof hk.global === 'object' && !Array.isArray(hk.global))
                            ? hk.global
                            : {},
                        windows: (hk.windows && typeof hk.windows === 'object' && !Array.isArray(hk.windows))
                            ? hk.windows
                            : {}
                    };
                }
            }

            var groupStr = localStorage.getItem(STORAGE_KEYS.GROUP_COLLAPSED);
            if (groupStr) {
                var gr = JSON.parse(groupStr);
                if (gr && typeof gr === 'object' && !Array.isArray(gr)) {
                    this._windowGroupCollapsed = gr;
                }
            }
        } catch (e) {
            console.warn('[AppState] Storage load error:', e);
        }
    };

    AppState.prototype._migrateHotkeyOverridesV1toV2 = function(old) {
        var result = {
            _version: HOTKEY_OVERRIDES_VERSION,
            global: {},
            windows: {}
        };

        var migrateBucket = function(bucket) {
            var out = {};
            for (var key in bucket) {
                if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
                var rec = bucket[key] || {};
                var combo = rec.combo || key;
                out[key] = {
                    combo: combo,
                    original: key,
                    label: rec.label || key,
                    action: rec.action || null,
                    overridden: combo !== key
                };
            }
            return out;
        };

        if (old && old.global) {
            result.global = migrateBucket(old.global);
        }

        if (old && old.windows) {
            for (var tid in old.windows) {
                if (!Object.prototype.hasOwnProperty.call(old.windows, tid)) continue;
                result.windows[tid] = migrateBucket(old.windows[tid]);
            }
        }

        return result;
    };

    AppState.prototype._saveThemeMode = function() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(STORAGE_KEYS.THEME_MODE, this._themeMode);
        } catch (e) {}
    };

    AppState.prototype._saveThemeAutoHours = function() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(
                STORAGE_KEYS.THEME_AUTO_HOURS,
                JSON.stringify(this._autoHours)
            );
        } catch (e) {}
    };

    AppState.prototype._saveAccount = function() {
        if (typeof localStorage === 'undefined') return;
        try {
            if (this._account) {
                localStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(this._account));
            } else {
                localStorage.removeItem(STORAGE_KEYS.ACCOUNT);
            }
        } catch (e) {}
    };

    AppState.prototype._saveHotkeyOverrides = function() {
        if (typeof localStorage === 'undefined') return;
        try {
            this._hotkeyOverrides._version = HOTKEY_OVERRIDES_VERSION;
            localStorage.setItem(
                STORAGE_KEYS.HOTKEY_OVERRIDES,
                JSON.stringify(this._hotkeyOverrides)
            );
        } catch (e) {}
    };

    AppState.prototype._saveGroupCollapsed = function() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(
                STORAGE_KEYS.GROUP_COLLAPSED,
                JSON.stringify(this._windowGroupCollapsed)
            );
        } catch (e) {}
    };

    // ============================================================
    // 9. JSON
    // ============================================================

    AppState.prototype.toJSON = function() {
        return {
            themeMode: this._themeMode,
            theme: this._theme,
            autoHours: this.getAutoThemeHours()
        };
    };

    AppState.prototype.fromJSON = function(data) {
        if (!data || typeof data !== 'object') return;

        if (data.themeMode === 'auto' || data.themeMode === 'dark' || data.themeMode === 'light') {
            this.setThemeMode(data.themeMode);
        } else if (data.theme === 'dark' || data.theme === 'light') {
            this.setThemeMode(data.theme);
        }

        if (data.autoHours && typeof data.autoHours === 'object') {
            this.setAutoThemeHours(data.autoHours);
        }
    };

    // ============================================================
    // 10. УНИЧТОЖЕНИЕ
    // ============================================================

    AppState.prototype.destroy = function() {
        if (this._themeTimer) {
            clearInterval(this._themeTimer);
            this._themeTimer = null;
        }

        this._listeners = {};
        this._globalListeners = [];
        this._hotkeyOverrides = {
            _version: HOTKEY_OVERRIDES_VERSION,
            global: {},
            windows: {}
        };
        this._windowGroupCollapsed = {};
        this._account = null;
    };

    // ============================================================
    // 11. ПРОФИЛЬ — ЭКСПОРТ / ИМПОРТ
    // ============================================================

    /**
     * Собирает полный снапшот состояния приложения (профиль).
     * @param {Object} [meta] — произвольные метаданные (appVersion и т.п.)
     * @returns {Object}
     */
    AppState.prototype.exportProfile = function(meta) {
        var profile = {
            _format: 'lsystem-profile',
            _version: 1,
            exportedAt: new Date().toISOString(),
            app: (meta && typeof meta === 'object') ? deepCopy(meta) : {},
            account: this.getAccount(),
            theme: {
                mode: this._themeMode,
                autoHours: this.getAutoThemeHours()
            },
            hotkeys: deepCopy(this._hotkeyOverrides),
            windowGroupCollapsed: deepCopy(this._windowGroupCollapsed)
        };

        return profile;
    };

    /**
     * Применяет профиль к текущему состоянию.
     * Возвращает { ok: Boolean, applied: Object, errors: Array }.
     *
     * @param {Object} data — результат exportProfile() (или совместимый объект).
     * @param {Object} [opts]
     * @param {Boolean} [opts.merge=false] — если true, объединяет хоткеи/группы
     *                                       с текущими, а не заменяет.
     * @returns {{ok: boolean, applied: Object, errors: string[]}}
     */
    AppState.prototype.importProfile = function(data, opts) {
        opts = opts || {};
        var merge = !!opts.merge;

        var result = {
            ok: false,
            applied: {
                account: false,
                theme: false,
                hotkeys: false,
                windowGroupCollapsed: false
            },
            errors: []
        };

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            result.errors.push('Некорректный формат профиля');
            return result;
        }

        if (data._format && data._format !== 'lsystem-profile') {
            result.errors.push('Неизвестный формат профиля: ' + data._format);
            return result;
        }

        if (data.account && typeof data.account === 'object') {
            try {
                var acc = {
                    id: String(data.account.id || 'u_' + Date.now().toString(36)),
                    name: String(data.account.name || '')
                };
                this._account = acc;
                this._saveAccount();
                this._notify('account', this.getAccount());
                result.applied.account = true;
            } catch (e) {
                result.errors.push('account: ' + e.message);
            }
        }

        if (data.theme && typeof data.theme === 'object') {
            try {
                var mode = data.theme.mode;
                if (mode === 'auto' || mode === 'dark' || mode === 'light') {
                    this.setThemeMode(mode);
                    result.applied.theme = true;
                }

                if (data.theme.autoHours && typeof data.theme.autoHours === 'object') {
                    this.setAutoThemeHours(data.theme.autoHours);
                    result.applied.theme = true;
                }
            } catch (e) {
                result.errors.push('theme: ' + e.message);
            }
        }

        if (data.hotkeys && typeof data.hotkeys === 'object' && !Array.isArray(data.hotkeys)) {
            try {
                if (merge) {
                    this._mergeHotkeyOverrides(data.hotkeys);
                } else {
                    this.setHotkeyOverrides(data.hotkeys);
                }
                result.applied.hotkeys = true;
            } catch (e) {
                result.errors.push('hotkeys: ' + e.message);
            }
        }

        if (data.windowGroupCollapsed && typeof data.windowGroupCollapsed === 'object') {
            try {
                if (merge) {
                    for (var k in data.windowGroupCollapsed) {
                        if (!Object.prototype.hasOwnProperty.call(data.windowGroupCollapsed, k)) continue;
                        this._windowGroupCollapsed[k] = !!data.windowGroupCollapsed[k];
                    }
                } else {
                    this._windowGroupCollapsed = deepCopy(data.windowGroupCollapsed);
                }
                this._saveGroupCollapsed();
                this._notify('windowGroupCollapsed', this._windowGroupCollapsed);
                result.applied.windowGroupCollapsed = true;
            } catch (e) {
                result.errors.push('windowGroupCollapsed: ' + e.message);
            }
        }

        result.ok = result.errors.length === 0;
        return result;
    };

    AppState.prototype._mergeHotkeyOverrides = function(incoming) {
        var migrated = (incoming._version && incoming._version >= HOTKEY_OVERRIDES_VERSION)
            ? incoming
            : this._migrateHotkeyOverridesV1toV2(incoming);

        if (migrated.global && typeof migrated.global === 'object') {
            for (var key in migrated.global) {
                if (!Object.prototype.hasOwnProperty.call(migrated.global, key)) continue;
                var rec = migrated.global[key];
                if (!rec) continue;
                var original = rec.original || key;
                var existing = this._hotkeyOverrides.global[original];

                if (existing) {
                    existing.combo = rec.combo || existing.combo || original;
                    existing.label = rec.label || existing.label || original;
                    existing.action = rec.action !== undefined ? rec.action : existing.action;
                    existing.overridden = !!rec.overridden;
                } else {
                    this._hotkeyOverrides.global[original] = {
                        combo: rec.combo || original,
                        original: original,
                        label: rec.label || original,
                        action: rec.action || null,
                        overridden: !!rec.overridden
                    };
                }
            }
        }

        if (migrated.windows && typeof migrated.windows === 'object') {
            for (var typeId in migrated.windows) {
                if (!Object.prototype.hasOwnProperty.call(migrated.windows, typeId)) continue;
                var bucketIn = migrated.windows[typeId];
                if (!bucketIn || typeof bucketIn !== 'object') continue;

                if (!this._hotkeyOverrides.windows[typeId]) {
                    this._hotkeyOverrides.windows[typeId] = {};
                }
                var bucketOut = this._hotkeyOverrides.windows[typeId];

                for (var k2 in bucketIn) {
                    if (!Object.prototype.hasOwnProperty.call(bucketIn, k2)) continue;
                    var r2 = bucketIn[k2];
                    if (!r2) continue;
                    var orig2 = r2.original || k2;
                    var ex2 = bucketOut[orig2];

                    if (ex2) {
                        ex2.combo = r2.combo || ex2.combo || orig2;
                        ex2.label = r2.label || ex2.label || orig2;
                        ex2.action = r2.action !== undefined ? r2.action : ex2.action;
                        ex2.overridden = !!r2.overridden;
                    } else {
                        bucketOut[orig2] = {
                            combo: r2.combo || orig2,
                            original: orig2,
                            label: r2.label || orig2,
                            action: r2.action || null,
                            overridden: !!r2.overridden
                        };
                    }
                }
            }
        }

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            AppState: AppState,
            STORAGE_KEYS: STORAGE_KEYS,
            HOTKEY_OVERRIDES_VERSION: HOTKEY_OVERRIDES_VERSION
        };
    }

    if (typeof window !== 'undefined') {
        window.AppState = AppState;
        window.AppState.STORAGE_KEYS = STORAGE_KEYS;
        window.AppState.HOTKEY_OVERRIDES_VERSION = HOTKEY_OVERRIDES_VERSION;
    }

})();