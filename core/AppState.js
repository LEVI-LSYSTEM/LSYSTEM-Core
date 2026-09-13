// core/AppState.js
// Версия 4.0.0 — Полная очистка от userKey и pluginKeys
// - _account: только { id, name, eulaAccepted }
// - Убраны: userKey, pluginKeys, все их методы
// - Идентификация юзера — через OAuth в маркетплейсе (не в ядре)
// - Ядро не знает про лицензии и JWT

(function() {
    'use strict';

    console.log('[AppState] Loading v4.0.0...');

    var STORAGE_KEYS = {
        THEME_MODE: 'lsystem-theme-mode',
        THEME_AUTO_HOURS: 'lsystem-theme-auto-hours',
        ACCOUNT: 'lsystem-account',
        HOTKEY_OVERRIDES: 'lsystem-hotkey-overrides',
        GROUP_COLLAPSED: 'lsystem-window-group-collapsed'
    };

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

        // ===== ТЕМА =====
        this._themeMode = 'dark';
        this._theme = 'dark';
        this._autoHours = { darkStart: 18, darkEnd: 6 };

        // ===== АККАУНТ =====
        // { id, name, eulaAccepted }
        this._account = null;

        // ===== ХОТКЕИ =====
        this._hotkeyOverrides = {
            global: {},
            windows: {}
        };

        // ===== СВЁРНУТОСТЬ ГРУПП =====
        this._windowGroupCollapsed = {};

        // ===== ПОДПИСКИ =====
        this._listeners = {};
        this._globalListeners = [];

        // ===== ТАЙМЕР АВТО-ТЕМЫ =====
        this._themeTimer = null;

        this._debug = !!options.debug;

        if (options.persist !== false) {
            this._loadFromStorage();
        }

        this._theme = this.getEffectiveTheme();
        this._applyTheme();

        this._startThemeAutoTimer();

        console.log('[AppState] Initialized v4.0.0', {
            themeMode: this._themeMode,
            theme: this._theme,
            hasAccount: !!this._account,
            canUseApp: this.canUseApp()
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
            if (this._debug) console.log('[AppState] Theme mode unchanged:', mode);
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

        if (this._debug) console.log('[AppState] Theme mode:', mode, '→ theme:', next);
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

                if (self._debug) {
                    console.log('[AppState] Auto-theme switch:', next);
                }
            }
        }, 60000);
    };

    // ============================================================
    // 2. АККАУНТ
    // ============================================================

    /**
     * @returns {Object|null} { id, name, eulaAccepted }
     */
    AppState.prototype.getAccount = function() {
        if (!this._account) return null;
        return {
            id: this._account.id,
            name: this._account.name,
            eulaAccepted: this._account.eulaAccepted
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
            name: account.name !== undefined ? String(account.name) : String(prev.name || ''),
            eulaAccepted: account.eulaAccepted !== undefined
                ? !!account.eulaAccepted
                : !!prev.eulaAccepted
        };

        this._account = normalized;
        this._saveAccount();
        this._notify('account', this.getAccount());

        if (this._debug) {
            console.log('[AppState] Account set:', {
                id: normalized.id,
                name: normalized.name,
                eulaAccepted: normalized.eulaAccepted
            });
        }

        return true;
    };

    AppState.prototype.clearAccount = function() {
        this._account = null;
        this._saveAccount();
        this._notify('account', null);
    };

    AppState.prototype.canUseApp = function() {
        var acc = this._account;
        if (!acc) return false;
        if (!acc.eulaAccepted) return false;
        return true;
    };

    AppState.prototype.isAuthenticated = function() {
        return this.canUseApp();
    };

    // ============================================================
    // 3. ХОТКЕИ
    // ============================================================

    AppState.prototype.ensureHotkeyDefaults = function(typeId, defaults) {
        if (!typeId || !defaults || typeof defaults !== 'object') return;

        if (!this._hotkeyOverrides.windows[typeId]) {
            this._hotkeyOverrides.windows[typeId] = {};
        }

        var bucket = this._hotkeyOverrides.windows[typeId];
        var changed = false;

        for (var combo in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, combo)) continue;

            if (!bucket[combo]) {
                var def = defaults[combo] || {};
                bucket[combo] = {
                    combo: combo,
                    label: def.label || combo,
                    action: def.action || null
                };
                changed = true;
            }
        }

        if (changed) {
            this._saveHotkeyOverrides();
            this._notify('hotkeyOverrides', this._hotkeyOverrides);
        }
    };

    AppState.prototype.ensureGlobalHotkeyDefaults = function(defaults) {
        if (!defaults || typeof defaults !== 'object') return;

        var changed = false;
        for (var combo in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, combo)) continue;

            if (!this._hotkeyOverrides.global[combo]) {
                var def = defaults[combo] || {};
                this._hotkeyOverrides.global[combo] = {
                    combo: combo,
                    label: def.label || combo,
                    action: def.action || null
                };
                changed = true;
            }
        }

        if (changed) {
            this._saveHotkeyOverrides();
            this._notify('hotkeyOverrides', this._hotkeyOverrides);
        }
    };

    AppState.prototype.getWindowHotkeys = function(typeId) {
        var bucket = this._hotkeyOverrides.windows[typeId];
        if (!bucket) return {};

        var result = {};
        for (var key in bucket) {
            if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
            var val = bucket[key];
            result[key] = { combo: val.combo, label: val.label, action: val.action };
        }
        return result;
    };

    AppState.prototype.getGlobalHotkeys = function() {
        var result = {};
        for (var key in this._hotkeyOverrides.global) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.global, key)) continue;
            var val = this._hotkeyOverrides.global[key];
            result[key] = { combo: val.combo, label: val.label, action: val.action };
        }
        return result;
    };

    AppState.prototype.setHotkeyOverride = function(scope, key, originalCombo, newCombo) {
        if (!newCombo) return false;

        if (scope === 'global') {
            var bucketG = this._hotkeyOverrides.global;
            if (!bucketG[originalCombo]) return false;
            bucketG[originalCombo].combo = newCombo;
        } else if (scope === 'window') {
            var bucketW = this._hotkeyOverrides.windows[key];
            if (!bucketW) return false;
            if (!bucketW[originalCombo]) return false;
            bucketW[originalCombo].combo = newCombo;
        } else return false;

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        return true;
    };

    AppState.prototype.resetHotkeyOverride = function(scope, key, originalCombo) {
        if (scope === 'global') {
            var bucketG = this._hotkeyOverrides.global;
            if (bucketG[originalCombo]) bucketG[originalCombo].combo = originalCombo;
        } else if (scope === 'window') {
            var bucketW = this._hotkeyOverrides.windows[key];
            if (bucketW && bucketW[originalCombo]) bucketW[originalCombo].combo = originalCombo;
        }
        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
        return true;
    };

    AppState.prototype.resetAllHotkeyOverrides = function() {
        for (var key in this._hotkeyOverrides.global) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.global, key)) continue;
            this._hotkeyOverrides.global[key].combo = key;
        }
        for (var typeId in this._hotkeyOverrides.windows) {
            if (!Object.prototype.hasOwnProperty.call(this._hotkeyOverrides.windows, typeId)) continue;
            var bucket = this._hotkeyOverrides.windows[typeId];
            for (var k in bucket) {
                if (!Object.prototype.hasOwnProperty.call(bucket, k)) continue;
                bucket[k].combo = k;
            }
        }

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    AppState.prototype.getHotkeyOverrides = function() {
        return deepCopy(this._hotkeyOverrides);
    };

    AppState.prototype.setHotkeyOverrides = function(data) {
        if (!data || typeof data !== 'object') return;

        this._hotkeyOverrides = {
            global: (data.global && typeof data.global === 'object') ? data.global : {},
            windows: (data.windows && typeof data.windows === 'object') ? data.windows : {}
        };

        this._saveHotkeyOverrides();
        this._notify('hotkeyOverrides', this._hotkeyOverrides);
    };

    // ============================================================
    // 4. СВЁРНУТОСТЬ ГРУПП
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
    // 5. ПОДПИСКИ
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
    // 6. ПЕРСИСТЕНТНОСТЬ
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
                        name: String(acc.name || ''),
                        eulaAccepted: !!acc.eulaAccepted
                    };
                }
            }

            var hotkeysStr = localStorage.getItem(STORAGE_KEYS.HOTKEY_OVERRIDES);
            if (hotkeysStr) {
                var hk = JSON.parse(hotkeysStr);
                if (hk && typeof hk === 'object' && !Array.isArray(hk)) {
                    this._hotkeyOverrides = {
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
    // 7. УНИЧТОЖЕНИЕ
    // ============================================================

    AppState.prototype.destroy = function() {
        if (this._themeTimer) {
            clearInterval(this._themeTimer);
            this._themeTimer = null;
        }

        this._listeners = {};
        this._globalListeners = [];
        this._hotkeyOverrides = { global: {}, windows: {} };
        this._windowGroupCollapsed = {};
        this._account = null;

        console.log('[AppState] Destroyed');
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AppState: AppState, STORAGE_KEYS: STORAGE_KEYS };
    }

    if (typeof window !== 'undefined') {
        window.AppState = AppState;
        window.AppState.STORAGE_KEYS = STORAGE_KEYS;
        console.log('[AppState] Registered globally v4.0.0');
    }

})();