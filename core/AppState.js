// core/AppState.js
// Версия 7.1.0

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
    // 1. THEME
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
    // 2. ACCOUNT
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
    // 3. HOTKEY BUCKETS — ОБЩИЕ HELPERS
    // ============================================================

    AppState.prototype._getHotkeyBucket = function(scope, typeId) {
        if (scope === 'global') {
            return this._hotkeyOverrides.global;
        }
        if (scope === 'window' && typeId) {
            if (!this._hotkeyOverrides.windows[typeId]) {
                this._hotkeyOverrides.windows[typeId] = {};
            }
            return this._hotkeyOverrides.windows[typeId];
        }
        return null;
    };

    AppState.prototype._peekHotkeyBucket = function(scope, typeId) {
        if (scope === 'global') {
            return this._hotkeyOverrides.global;
        }
        if (scope === 'window' && typeId) {
            return this._hotkeyOverrides.windows[typeId] || null;
        }
        return null;
    };

    AppState.prototype._ensureHotkeyBucket = function(bucket, defaults) {
        var changed = false;
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
                continue;
            }

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

        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            if (!seen[key]) {
                delete bucket[key];
                changed = true;
            }
        }

        return changed;
    };

    AppState.prototype._collectHotkeys = function(bucket) {
        var result = {};
        if (!bucket) return result;

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

    AppState.prototype._mutateHotkeyRecord = function(scope, typeId, originalCombo, mutator) {
        if (!originalCombo) return false;

        var bucket = this._peekHotkeyBucket(scope, typeId);
        if (!bucket) return false;

        var record = bucket[originalCombo];
        if (!record) return false;

        mutator(record);

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        return true;
    };

    AppState.prototype._findHotkeyConflict = function(scope, typeId, originalCombo, newCombo) {
        var bucket = this._peekHotkeyBucket(scope, typeId);
        if (!bucket) return null;

        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            var rec = bucket[key];
            if (!rec) continue;
            if ((rec.original || key) === originalCombo) continue;
            if (rec.combo === newCombo) {
                return rec.label || key;
            }
        }
        return null;
    };

    // ============================================================
    // 4. HOTKEY DEFAULTS
    // ============================================================

    AppState.prototype.ensureGlobalHotkeyDefaults = function(defaults) {
        if (!defaults || typeof defaults !== 'object') return;

        var bucket = this._hotkeyOverrides.global;
        var changed = this._ensureHotkeyBucket(bucket, defaults);

        if (changed) {
            this._saveHotkeyOverrides();
            this._notify('hotkeyOverrides', this._hotkeyOverrides);
        }
    };

    AppState.prototype.ensureHotkeyDefaults = function(typeId, defaults) {
        if (!typeId || !defaults || typeof defaults !== 'object') return;

        var bucket = this._getHotkeyBucket('window', typeId);
        var changed = this._ensureHotkeyBucket(bucket, defaults);

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
    // 5. HOTKEY READ
    // ============================================================

    AppState.prototype.getGlobalHotkeys = function() {
        return this._collectHotkeys(this._hotkeyOverrides.global);
    };

    AppState.prototype.getWindowHotkeys = function(typeId) {
        return this._collectHotkeys(this._peekHotkeyBucket('window', typeId));
    };

    AppState.prototype.getHotkeyOverrides = function() {
        return deepClone(this._hotkeyOverrides);
    };

    AppState.prototype.getEffectiveCombo = function(scope, typeId, originalCombo) {
        var bucket = this._peekHotkeyBucket(scope, typeId);
        var record = bucket ? bucket[originalCombo] : null;
        return record ? record.combo : originalCombo;
    };

    AppState.prototype.isHotkeyOverridden = function(scope, typeId, originalCombo) {
        var bucket = this._peekHotkeyBucket(scope, typeId);
        var record = bucket ? bucket[originalCombo] : null;
        return !!(record && record.overridden);
    };

    // ============================================================
    // 6. HOTKEY WRITE
    // ============================================================

    AppState.prototype.setHotkeyOverride = function(scope, typeId, originalCombo, newCombo) {
        if (!originalCombo || !newCombo) return false;
        if (originalCombo === newCombo) {
            return this.resetHotkeyOverride(scope, typeId, originalCombo);
        }

        if (scope !== 'global' && !(scope === 'window' && typeId)) {
            return false;
        }

        var self = this;
        return this._mutateHotkeyRecord(scope, typeId, originalCombo, function(record) {
            record.combo = newCombo;
            record.overridden = true;
        });
    };

    AppState.prototype.resetHotkeyOverride = function(scope, typeId, originalCombo) {
        if (!originalCombo) return false;
        if (scope !== 'global' && !(scope === 'window' && typeId)) {
            return false;
        }

        return this._mutateHotkeyRecord(scope, typeId, originalCombo, function(record) {
            record.combo = record.original || originalCombo;
            record.overridden = false;
        });
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

        this._hotkeyOverrides = {
            _version: HOTKEY_OVERRIDES_VERSION,
            global: (data.global && typeof data.global === 'object') ? data.global : {},
            windows: (data.windows && typeof data.windows === 'object') ? data.windows : {}
        };

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    // ============================================================
    // 7. GROUP COLLAPSE
    // ============================================================

    AppState.prototype.getCollapsedGroups = function() {
        return deepClone(this._windowGroupCollapsed);
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
    // 8. SUBSCRIBE
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
    // 9. STORAGE — LOAD
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

    // ============================================================
    // 10. STORAGE — SAVE
    // ============================================================

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
    // 11. JSON
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
    // 12. SNAPSHOT / RESTORE
    // ============================================================

    AppState.prototype._snapshotState = function() {
        return {
            account: this._account ? deepClone(this._account) : null,
            themeMode: this._themeMode,
            theme: this._theme,
            autoHours: deepClone(this._autoHours),
            hotkeyOverrides: deepClone(this._hotkeyOverrides),
            windowGroupCollapsed: deepClone(this._windowGroupCollapsed)
        };
    };

    AppState.prototype._restoreState = function(snapshot) {
        if (!snapshot) return;

        this._account = snapshot.account;
        this._themeMode = snapshot.themeMode;
        this._theme = snapshot.theme;
        this._autoHours = snapshot.autoHours;
        this._hotkeyOverrides = snapshot.hotkeyOverrides;
        this._windowGroupCollapsed = snapshot.windowGroupCollapsed;

        this._saveThemeMode();
        this._saveThemeAutoHours();
        this._saveAccount();
        this._saveHotkeyOverrides();
        this._saveGroupCollapsed();

        this._applyTheme();

        this._notify('theme', this._theme);
        this._notify('themeMode', this._themeMode);
        this._notify('themeAutoHours', this.getAutoThemeHours());
        this._notify('account', this.getAccount());
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        this._notify('windowGroupCollapsed', this._windowGroupCollapsed);
    };

    // ============================================================
    // 13. PROFILE
    // ============================================================

    AppState.prototype.exportProfile = function(meta) {
        var profile = {
            _format: 'lsystem-profile',
            _version: 1,
            exportedAt: new Date().toISOString(),
            app: (meta && typeof meta === 'object') ? deepClone(meta) : {},
            account: this.getAccount(),
            theme: {
                mode: this._themeMode,
                autoHours: this.getAutoThemeHours()
            },
            hotkeys: deepClone(this._hotkeyOverrides),
            windowGroupCollapsed: deepClone(this._windowGroupCollapsed)
        };

        return profile;
    };

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

        var backup = this._snapshotState();

        try {
            if (data.account && typeof data.account === 'object') {
                var acc = {
                    id: String(data.account.id || 'u_' + Date.now().toString(36)),
                    name: String(data.account.name || '')
                };
                this._account = acc;
                this._saveAccount();
                this._notify('account', this.getAccount());
                result.applied.account = true;
            }

            if (data.theme && typeof data.theme === 'object') {
                var mode = data.theme.mode;
                if (mode === 'auto' || mode === 'dark' || mode === 'light') {
                    this.setThemeMode(mode);
                    result.applied.theme = true;
                }

                if (data.theme.autoHours && typeof data.theme.autoHours === 'object') {
                    this.setAutoThemeHours(data.theme.autoHours);
                    result.applied.theme = true;
                }
            }

            if (data.hotkeys && typeof data.hotkeys === 'object' && !Array.isArray(data.hotkeys)) {
                if (merge) {
                    this._mergeHotkeyOverrides(data.hotkeys);
                } else {
                    this.setHotkeyOverrides(data.hotkeys);
                }
                result.applied.hotkeys = true;
            }

            if (data.windowGroupCollapsed && typeof data.windowGroupCollapsed === 'object') {
                if (merge) {
                    for (var k in data.windowGroupCollapsed) {
                        if (!Object.prototype.hasOwnProperty.call(data.windowGroupCollapsed, k)) continue;
                        this._windowGroupCollapsed[k] = !!data.windowGroupCollapsed[k];
                    }
                } else {
                    this._windowGroupCollapsed = deepClone(data.windowGroupCollapsed);
                }
                this._saveGroupCollapsed();
                this._notify('windowGroupCollapsed', this._windowGroupCollapsed);
                result.applied.windowGroupCollapsed = true;
            }
        } catch (e) {
            this._restoreState(backup);
            result.applied = {
                account: false,
                theme: false,
                hotkeys: false,
                windowGroupCollapsed: false
            };
            result.errors.push('import failed: ' + (e && e.message ? e.message : String(e)));
            result.ok = false;
            return result;
        }

        result.ok = result.errors.length === 0;
        return result;
    };

    AppState.prototype._mergeHotkeyOverrides = function(incoming) {
        if (incoming.global && typeof incoming.global === 'object') {
            for (var key in incoming.global) {
                if (!Object.prototype.hasOwnProperty.call(incoming.global, key)) continue;
                var rec = incoming.global[key];
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

        if (incoming.windows && typeof incoming.windows === 'object') {
            for (var typeId in incoming.windows) {
                if (!Object.prototype.hasOwnProperty.call(incoming.windows, typeId)) continue;
                var bucketIn = incoming.windows[typeId];
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
    // 14. DESTROY
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