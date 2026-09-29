// core/HotkeyRegistry.js
// Версия 3.0.0

(function() {
    'use strict';

    function normalizeCombo(combo) {
        if (!combo || typeof combo !== 'string') return '';

        const parts = combo.split('+').map(p => p.trim()).filter(Boolean);
        const mods = { ctrl: false, shift: false, alt: false, meta: false };
        let key = '';

        for (const part of parts) {
            const lower = part.toLowerCase();
            if (lower === 'ctrl' || lower === 'control') mods.ctrl = true;
            else if (lower === 'shift') mods.shift = true;
            else if (lower === 'alt' || lower === 'option') mods.alt = true;
            else if (lower === 'meta' || lower === 'cmd' || lower === 'command') mods.meta = true;
            else key = part;
        }

        const alias = {
            'esc': 'Escape', 'escape': 'Escape',
            'enter': 'Enter', 'return': 'Enter',
            'space': 'Space', 'tab': 'Tab',
            'backspace': 'Backspace',
            'delete': 'Delete', 'del': 'Delete',
            'up': 'ArrowUp', 'down': 'ArrowDown',
            'left': 'ArrowLeft', 'right': 'ArrowRight',
            'uparrow': 'ArrowUp', 'downarrow': 'ArrowDown',
            'leftarrow': 'ArrowLeft', 'rightarrow': 'ArrowRight',
            ',': 'Comma', '.': 'Period', '/': 'Slash',
            ';': 'Semicolon', "'": 'Quote', '[': 'BracketLeft',
            ']': 'BracketRight', '\\': 'Backslash', '-': 'Minus',
            '=': 'Equal', '`': 'Backquote'
        };

        let normalizedKey = key;
        const lowerKey = key.toLowerCase();

        if (alias[lowerKey]) {
            normalizedKey = alias[lowerKey];
        } else if (key.length === 1 && /[a-z0-9]/i.test(key)) {
            normalizedKey = 'Key' + key.toUpperCase();
        } else if (key.length === 1) {
            normalizedKey = key;
        } else {
            normalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        }

        const out = [];
        if (mods.ctrl) out.push('Ctrl');
        if (mods.shift) out.push('Shift');
        if (mods.alt) out.push('Alt');
        if (mods.meta) out.push('Meta');
        out.push(normalizedKey);
        return out.join('+');
    }

    function eventToCombo(e) {
        if (!e) return '';

        const out = [];
        if (e.ctrlKey) out.push('Ctrl');
        if (e.shiftKey) out.push('Shift');
        if (e.altKey) out.push('Alt');
        if (e.metaKey) out.push('Meta');

        let code = e.code || '';

        if (!code || code === 'Unidentified') {
            const key = e.key || '';
            if (key.length === 1) {
                code = 'Key' + key.toUpperCase();
            } else {
                code = key;
            }
        }

        out.push(code);
        return out.join('+');
    }

    function isInputFocused() {
        let el = document.activeElement;
        if (!el) return false;

        while (el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }

        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;

        const ce = el.getAttribute && el.getAttribute('contenteditable');
        if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;

        return false;
    }

    function isKeyboardCaptureElementFocused() {
        let el = document.activeElement;
        if (!el) return false;

        while (el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }

        if (el.closest && el.closest('[data-capture-keyboard]')) return true;

        return false;
    }

    function isExternalDrag() {
        return !!(window.dragController && window.dragController.isDragging());
    }

    class HotkeyRegistry {
        constructor(options = {}) {
            this._globalBindings = new Map();
            this._windowBindings = new Map();
            this._focusedWindowId = null;
            this._target = null;
            this._handler = null;
            this._debug = options.debug || false;

            this._capturedWindowId = null;
        }

        registerGlobal(combo, callback, meta = {}) {
            const key = normalizeCombo(combo);
            if (!key || typeof callback !== 'function') return () => {};

            if (this._globalBindings.has(key)) {
                console.warn('[HotkeyRegistry] Global combo override:', key);
            }
            this._globalBindings.set(key, { callback, meta });

            return () => {
                const current = this._globalBindings.get(key);
                if (current && current.callback === callback) {
                    this._globalBindings.delete(key);
                }
            };
        }

        registerWindow(windowId, combo, callback, meta = {}) {
            const wid = String(windowId);
            const key = normalizeCombo(combo);
            if (!key || typeof callback !== 'function') return () => {};

            if (!this._windowBindings.has(wid)) {
                this._windowBindings.set(wid, new Map());
            }
            const map = this._windowBindings.get(wid);

            if (map.has(key) && this._debug) {
                console.warn('[HotkeyRegistry] Window combo override:', wid, key);
            }
            map.set(key, { callback, meta });

            return () => {
                const m = this._windowBindings.get(wid);
                if (m && m.get(key) && m.get(key).callback === callback) {
                    m.delete(key);
                    if (m.size === 0) this._windowBindings.delete(wid);
                }
            };
        }

        registerWindowMap(windowId, map, meta = {}) {
            if (!map || typeof map !== 'object') return () => {};
            const unsubs = [];
            for (const [combo, cb] of Object.entries(map)) {
                if (typeof cb === 'function') {
                    unsubs.push(this.registerWindow(windowId, combo, cb, meta));
                }
            }
            return () => {
                for (const u of unsubs) {
                    try { u(); } catch (e) {}
                }
            };
        }

        unregisterWindow(windowId) {
            const wid = String(windowId);

            if (this._capturedWindowId === wid) {
                this._capturedWindowId = null;
            }

            this._windowBindings.delete(wid);
        }

        unregisterAll() {
            this._globalBindings.clear();
            this._windowBindings.clear();
            this._capturedWindowId = null;
        }

        rebindGlobal(oldCombo, newCombo) {
            const oldKey = normalizeCombo(oldCombo);
            const newKey = normalizeCombo(newCombo);

            if (!oldKey || !newKey) return false;
            if (oldKey === newKey) return true;

            const binding = this._globalBindings.get(oldKey);
            if (!binding) {
                console.warn('[HotkeyRegistry] rebindGlobal: not found:', oldKey);
                return false;
            }

            if (this._globalBindings.has(newKey) && newKey !== oldKey) {
                console.warn('[HotkeyRegistry] rebindGlobal: collision on', newKey);
            }

            this._globalBindings.delete(oldKey);
            this._globalBindings.set(newKey, binding);

            return true;
        }

        rebindWindow(windowId, oldCombo, newCombo) {
            const wid = String(windowId);
            const oldKey = normalizeCombo(oldCombo);
            const newKey = normalizeCombo(newCombo);

            if (!oldKey || !newKey) return false;
            if (oldKey === newKey) return true;

            const map = this._windowBindings.get(wid);
            if (!map) return false;

            const binding = map.get(oldKey);
            if (!binding) {
                console.warn('[HotkeyRegistry] rebindWindow: not found:', wid, oldKey);
                return false;
            }

            if (map.has(newKey) && newKey !== oldKey) {
                console.warn('[HotkeyRegistry] rebindWindow: collision on', wid, newKey);
            }

            map.delete(oldKey);
            map.set(newKey, binding);

            return true;
        }

        setFocusedWindow(windowId) {
            const nextId = windowId != null ? String(windowId) : null;
            this._focusedWindowId = nextId;

            if (this._capturedWindowId) {
                if (nextId === null || nextId !== this._capturedWindowId) {
                    this._capturedWindowId = null;
                }
            }
        }

        getFocusedWindow() {
            return this._focusedWindowId;
        }

        captureKeyboard(windowId) {
            if (windowId == null) {
                console.warn('[HotkeyRegistry] captureKeyboard: windowId is required');
                return false;
            }

            this._capturedWindowId = String(windowId);
            return true;
        }

        releaseKeyboard(windowId) {
            if (!this._capturedWindowId) return false;

            if (windowId == null) {
                this._capturedWindowId = null;
                return true;
            }

            const wid = String(windowId);
            if (this._capturedWindowId !== wid) return false;

            this._capturedWindowId = null;
            return true;
        }

        isCaptured() {
            return this._capturedWindowId != null;
        }

        getCapturedWindow() {
            return this._capturedWindowId;
        }

        handle(event) {
            if (!event) return false;
            const combo = eventToCombo(event);

            if (isExternalDrag()) {
                return false;
            }

            if (this._capturedWindowId) {
                if (this._focusedWindowId !== this._capturedWindowId) {
                    this._capturedWindowId = null;
                } else {
                    if (combo !== 'Escape') {
                        const map = this._windowBindings.get(this._capturedWindowId);
                        if (map && map.has(combo)) {
                            try {
                                map.get(combo).callback(event, this._capturedWindowId);
                            } catch (e) {
                                console.error('[HotkeyRegistry] Captured window callback error:', e);
                            }
                        }
                        return true;
                    }
                }
            }

            if (isKeyboardCaptureElementFocused()) {
                return false;
            }

            if (isInputFocused() && combo !== 'Escape') {
                return false;
            }

            if (this._focusedWindowId) {
                const map = this._windowBindings.get(this._focusedWindowId);
                if (map && map.has(combo)) {
                    try {
                        map.get(combo).callback(event, this._focusedWindowId);
                    } catch (e) {
                        console.error('[HotkeyRegistry] Window callback error:', e);
                    }
                    return true;
                }
            }

            if (this._globalBindings.has(combo)) {
                try {
                    this._globalBindings.get(combo).callback(event, null);
                } catch (e) {
                    console.error('[HotkeyRegistry] Global callback error:', e);
                }
                return true;
            }

            return false;
        }

        attach(target = document) {
            if (this._handler) this.detach();

            this._target = target;
            this._handler = (e) => {
                const handled = this.handle(e);
                if (handled) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            target.addEventListener('keydown', this._handler, true);
        }

        detach() {
            if (this._target && this._handler) {
                this._target.removeEventListener('keydown', this._handler, true);
            }
            this._target = null;
            this._handler = null;
        }

        getGlobalBindings() {
            const result = [];
            for (const [combo, b] of this._globalBindings) {
                result.push({ combo, meta: b.meta });
            }
            return result;
        }

        getWindowBindings(windowId) {
            const wid = String(windowId);
            const map = this._windowBindings.get(wid);
            if (!map) return [];
            const result = [];
            for (const [combo, b] of map) {
                result.push({ combo, meta: b.meta });
            }
            return result;
        }

        getAllBindings() {
            return {
                global: this.getGlobalBindings(),
                windows: Array.from(this._windowBindings.keys()).map(wid => ({
                    windowId: wid,
                    bindings: this.getWindowBindings(wid)
                }))
            };
        }

        destroy() {
            this.detach();
            this._globalBindings.clear();
            this._windowBindings.clear();
            this._focusedWindowId = null;
            this._capturedWindowId = null;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            HotkeyRegistry,
            normalizeCombo,
            eventToCombo,
            isInputFocused,
            isKeyboardCaptureElementFocused
        };
    }

    if (typeof window !== 'undefined') {
        window.HotkeyRegistry = HotkeyRegistry;
        window.HotkeyRegistry.normalizeCombo = normalizeCombo;
        window.HotkeyRegistry.eventToCombo = eventToCombo;
        window.HotkeyRegistry.isInputFocused = isInputFocused;
        window.HotkeyRegistry.isKeyboardCaptureElementFocused = isKeyboardCaptureElementFocused;
    }

})();