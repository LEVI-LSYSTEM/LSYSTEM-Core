// core/EventBus.js
// Версия 1.0.0

(function() {
    'use strict';

    function EventBus(options) {
        options = options || {};

        this._listeners = new Map();
        this._windowListeners = new Map();
        this._onceWrappers = new WeakMap();

        this._debug = !!options.debug;
        this._emitDepth = 0;
        this._maxEmitDepth = 32;
    }

    EventBus.prototype.on = function(event, callback) {
        if (!event || typeof event !== 'string') {
            console.error('[EventBus] on: event must be a non-empty string');
            return function() {};
        }
        if (typeof callback !== 'function') {
            console.error('[EventBus] on: callback must be a function');
            return function() {};
        }

        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        var self = this;
        return function() {
            self.off(event, callback);
        };
    };

    EventBus.prototype.once = function(event, callback) {
        if (!event || typeof event !== 'string') {
            console.error('[EventBus] once: event must be a non-empty string');
            return function() {};
        }
        if (typeof callback !== 'function') {
            console.error('[EventBus] once: callback must be a function');
            return function() {};
        }

        var self = this;

        var wrapper = function(data) {
            self.off(event, wrapper);
            try {
                callback(data);
            } catch (e) {
                console.error('[EventBus] once listener error (' + event + '):', e);
            }
        };

        this.on(event, wrapper);
        this._onceWrappers.set(callback, wrapper);

        return function() {
            self.off(event, wrapper);
            self._onceWrappers.delete(callback);
        };
    };

    EventBus.prototype.off = function(event, callback) {
        if (!event || typeof callback !== 'function') return;

        var set = this._listeners.get(event);
        if (!set) return;

        set.delete(callback);
        if (set.size === 0) {
            this._listeners.delete(event);
        }
    };

    EventBus.prototype.emit = function(event, data) {
        if (!event || typeof event !== 'string') {
            console.error('[EventBus] emit: event must be a non-empty string');
            return;
        }

        if (this._emitDepth >= this._maxEmitDepth) {
            console.error(
                '[EventBus] emit depth exceeded (' + this._maxEmitDepth + ') for "' + event + '" — possible recursion. Dropped.'
            );
            return;
        }

        this._emitDepth++;

        try {
            this._dispatchGlobal(event, data);

            if (data && data.windowId != null) {
                this._dispatchWindow(String(data.windowId), event, data);
            }
        } finally {
            this._emitDepth--;
        }
    };

    EventBus.prototype.emitWindow = function(windowId, event, data) {
        if (windowId == null) {
            console.error('[EventBus] emitWindow: windowId is required');
            return;
        }
        if (!event || typeof event !== 'string') {
            console.error('[EventBus] emitWindow: event must be a non-empty string');
            return;
        }

        var wid = String(windowId);

        var detail = {};
        if (data && typeof data === 'object') {
            for (var k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) detail[k] = data[k];
            }
        }
        detail.windowId = wid;

        this.emit(event, detail);
    };

    EventBus.prototype.onWindow = function(windowId, event, callback) {
        if (windowId == null) {
            console.error('[EventBus] onWindow: windowId is required');
            return function() {};
        }
        if (!event || typeof event !== 'string') {
            console.error('[EventBus] onWindow: event must be a non-empty string');
            return function() {};
        }
        if (typeof callback !== 'function') {
            console.error('[EventBus] onWindow: callback must be a function');
            return function() {};
        }

        var wid = String(windowId);

        if (!this._windowListeners.has(wid)) {
            this._windowListeners.set(wid, new Map());
        }
        var byEvent = this._windowListeners.get(wid);

        if (!byEvent.has(event)) {
            byEvent.set(event, new Set());
        }
        byEvent.get(event).add(callback);

        var self = this;
        return function() {
            var map = self._windowListeners.get(wid);
            if (!map) return;
            var set = map.get(event);
            if (!set) return;
            set.delete(callback);
            if (set.size === 0) map.delete(event);
            if (map.size === 0) self._windowListeners.delete(wid);
        };
    };

    EventBus.prototype.offWindow = function(windowId, event, callback) {
        if (windowId == null || !event || typeof callback !== 'function') return;

        var wid = String(windowId);
        var map = this._windowListeners.get(wid);
        if (!map) return;

        var set = map.get(event);
        if (!set) return;

        set.delete(callback);
        if (set.size === 0) map.delete(event);
        if (map.size === 0) this._windowListeners.delete(wid);
    };

    EventBus.prototype.clearWindow = function(windowId) {
        if (windowId == null) return;
        this._windowListeners.delete(String(windowId));
    };

    EventBus.prototype.clear = function() {
        this._listeners.clear();
        this._windowListeners.clear();
        this._onceWrappers = new WeakMap();
        this._emitDepth = 0;
    };

    EventBus.prototype.hasListeners = function(event) {
        if (event) {
            var set = this._listeners.get(event);
            return !!(set && set.size > 0);
        }
        return this._listeners.size > 0;
    };

    EventBus.prototype.getEvents = function() {
        return Array.from(this._listeners.keys());
    };

    EventBus.prototype.getStats = function() {
        var total = 0;
        this._listeners.forEach(function(set) { total += set.size; });

        var windowTotal = 0;
        this._windowListeners.forEach(function(byEvent) {
            byEvent.forEach(function(set) {
                windowTotal += set.size;
            });
        });

        return {
            events: this._listeners.size,
            listeners: total,
            windowScopes: this._windowListeners.size,
            windowListeners: windowTotal,
            emitDepth: this._emitDepth
        };
    };

    EventBus.prototype._dispatchGlobal = function(event, data) {
        var set = this._listeners.get(event);
        if (!set || set.size === 0) return;

        var snapshot = Array.from(set);
        for (var i = 0; i < snapshot.length; i++) {
            var cb = snapshot[i];
            if (!set.has(cb)) continue;
            try {
                cb(data);
            } catch (e) {
                console.error('[EventBus] listener error (' + event + '):', e);
            }
        }
    };

    EventBus.prototype._dispatchWindow = function(windowId, event, data) {
        var map = this._windowListeners.get(windowId);
        if (!map) return;

        var set = map.get(event);
        if (!set || set.size === 0) return;

        var snapshot = Array.from(set);
        for (var i = 0; i < snapshot.length; i++) {
            var cb = snapshot[i];
            if (!set.has(cb)) continue;
            try {
                cb(data);
            } catch (e) {
                console.error('[EventBus] window listener error (' + event + '):', e);
            }
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { EventBus: EventBus };
    }

    if (typeof window !== 'undefined') {
        window.EventBus = EventBus;
    }

})();