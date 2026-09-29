// core/DragController.js
// Версия 2.0.0

(function() {
    'use strict';

    var DRAG_THRESHOLD_PX = 5;
    var Z_GHOST = 9999999;

    var KIND_INTERNAL = 'internal';
    var KIND_FILES = 'files';

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isNoDragTarget(target) {
        if (!target || typeof target.closest !== 'function') return false;

        var el = target.closest('[data-no-drag]');
        if (!el) return false;

        var raw = el.getAttribute('data-no-drag');
        var v = (raw == null ? '' : String(raw)).trim().toLowerCase();

        if (v === '') return true;
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
        return true;
    }

    function rectContains(rect, x, y) {
        return x >= rect.left && x <= rect.right
            && y >= rect.top && y <= rect.bottom;
    }

    function _domDepth(el) {
        var depth = 0;
        var node = el;
        while (node && node.parentNode) {
            depth++;
            node = node.parentNode;
        }
        return depth;
    }

    function DragController(options) {
        options = options || {};

        this._sources = [];
        this._targets = [];

        this._state = 'idle';
        this._armed = null;
        this._session = null;
        this._currentTarget = null;

        this._listeners = {};

        this._debug = !!options.debug;

        this._installDocumentListeners();
    }

    DragController.prototype.registerSource = function(element, descriptor) {
        if (!element || element.nodeType !== 1) {
            console.warn('[DragController] registerSource: element must be a DOM node');
            return function() {};
        }
        if (!descriptor || typeof descriptor !== 'object') {
            console.warn('[DragController] registerSource: descriptor must be an object');
            return function() {};
        }

        var record = {
            element: element,
            descriptor: descriptor
        };
        this._sources.push(record);

        if (!element.style.cursor) {
            element.style.cursor = 'grab';
        }

        var self = this;
        return function() {
            var idx = self._sources.indexOf(record);
            if (idx !== -1) self._sources.splice(idx, 1);

            if (self._armed && self._armed.source === record) {
                self._armed = null;
                self._state = 'idle';
            }
            if (self._session && self._session.source === record) {
                self.cancel('source-unregistered');
            }
        };
    };

    DragController.prototype.registerTarget = function(descriptor) {
        if (!descriptor || typeof descriptor !== 'object') {
            console.warn('[DragController] registerTarget: descriptor must be an object');
            return function() {};
        }
        if (!descriptor.element || descriptor.element.nodeType !== 1) {
            console.warn('[DragController] registerTarget: element must be a DOM node');
            return function() {};
        }
        if (typeof descriptor.onDrop !== 'function') {
            console.warn('[DragController] registerTarget: onDrop is required');
            return function() {};
        }

        var record = { descriptor: descriptor };
        this._targets.push(record);

        var self = this;
        return function() {
            var idx = self._targets.indexOf(record);
            if (idx !== -1) self._targets.splice(idx, 1);

            if (self._currentTarget === record) {
                self._setCurrentTarget(null, 'target-unregistered');
            }
        };
    };

    DragController.prototype.isDragging = function() {
        return this._state === 'dragging' && this._session !== null;
    };

    DragController.prototype.getActiveSession = function() {
        return this._session;
    };

    DragController.prototype.cancel = function(reason) {
        if (this._state !== 'dragging' || !this._session) return;
        this._finishSession(false, reason || 'cancelled');
    };

    DragController.prototype.on = function(event, cb) {
        if (typeof cb !== 'function') return function() {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);

        var self = this;
        return function() { self.off(event, cb); };
    };

    DragController.prototype.off = function(event, cb) {
        var arr = this._listeners[event];
        if (!arr) return;
        var idx = arr.indexOf(cb);
        if (idx !== -1) arr.splice(idx, 1);
    };

    DragController.prototype._emit = function(event, data) {
        var arr = this._listeners[event];
        if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](data); } catch (e) {
                console.error('[DragController] listener error (' + event + '):', e);
            }
        }
    };

    DragController.prototype._installDocumentListeners = function() {
        var self = this;

        this._onDocMouseDown = function(e) { self._handleMouseDown(e); };
        this._onDocMouseMove = function(e) { self._handleMouseMove(e); };
        this._onDocMouseUp   = function(e) { self._handleMouseUp(e); };
        this._onDocKeyDown   = function(e) { self._handleKeyDown(e); };

        this._onDocPointerCancel = function(e) { self._handlePointerCancel(e); };
        this._onWindowBlur       = function()  { self._handleWindowBlur(); };
        this._onVisibilityChange = function()  { if (document.hidden) self._handleVisibilityHidden(); };

        this._onDocDragEnter = function(e) { self._handleFileDragEnter(e); };
        this._onDocDragOver  = function(e) { self._handleFileDragOver(e); };
        this._onDocDragLeave = function(e) { self._handleFileDragLeave(e); };
        this._onDocDrop      = function(e) { self._handleFileDrop(e); };

        document.addEventListener('mousedown', this._onDocMouseDown, true);
        document.addEventListener('mousemove', this._onDocMouseMove, true);
        document.addEventListener('mouseup', this._onDocMouseUp, true);
        document.addEventListener('keydown', this._onDocKeyDown, true);
        document.addEventListener('pointercancel', this._onDocPointerCancel, true);
        window.addEventListener('blur', this._onWindowBlur);
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        document.addEventListener('dragenter', this._onDocDragEnter, true);
        document.addEventListener('dragover',  this._onDocDragOver,  true);
        document.addEventListener('dragleave', this._onDocDragLeave, true);
        document.addEventListener('drop',      this._onDocDrop,      true);
    };

    DragController.prototype._handleMouseDown = function(e) {
        if (this._state !== 'idle') return;
        if (e.button !== 0) return;
        if (isNoDragTarget(e.target)) return;

        var source = this._findSourceFor(e.target);
        if (!source) return;

        var descriptor = source.descriptor;

        if (typeof descriptor.disabled === 'function') {
            try {
                if (descriptor.disabled()) return;
            } catch (err) {
                console.error('[DragController] source.disabled() error:', err);
            }
        }

        this._state = 'armed';
        this._armed = {
            source: source,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: (e.pointerId != null) ? e.pointerId : null,
            pointerType: e.pointerType || 'mouse'
        };

        if (!(e.target.closest && e.target.closest('[data-allow-native-drag="true"]'))) {
            e.preventDefault();
        }
    };

    DragController.prototype._findSourceFor = function(target) {
        var node = target;
        while (node && node !== document) {
            for (var i = 0; i < this._sources.length; i++) {
                if (this._sources[i].element === node) {
                    return this._sources[i];
                }
            }
            node = node.parentNode;
        }
        return null;
    };

    DragController.prototype._handleMouseMove = function(e) {
        if (this._state === 'armed') {
            var dx = e.clientX - this._armed.startX;
            var dy = e.clientY - this._armed.startY;
            if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
                return;
            }
            this._startSession(e);
        }

        if (this._state !== 'dragging' || !this._session) return;
        if (this._session.kind !== KIND_INTERNAL) return;

        if (e.buttons === 0) {
            this._finishSession(true, 'button-released');
            return;
        }

        this._session.pointer.x = e.clientX;
        this._session.pointer.y = e.clientY;
        this._session.pointer.lastEvent = e;

        this._updateGhostPosition(e.clientX, e.clientY);
        this._updateCurrentTarget(e.clientX, e.clientY);

        this._emit('drag:move', { session: this._session });
    };

    DragController.prototype._handleMouseUp = function(e) {
        if (this._state === 'armed') {
            this._armed = null;
            this._state = 'idle';
            return;
        }
        if (this._state !== 'dragging' || !this._session) return;
        if (this._session.kind !== KIND_INTERNAL) return;

        e.preventDefault();
        e.stopPropagation();

        this._finishSession(true, 'mouseup');
    };

    DragController.prototype._handlePointerCancel = function(e) {
        if (this._state === 'dragging' && this._session && this._session.kind === KIND_INTERNAL) {
            this._finishSession(false, 'pointer-cancel');
        } else if (this._state === 'armed') {
            this._armed = null;
            this._state = 'idle';
        }
    };

    DragController.prototype._handleKeyDown = function(e) {
        if (e.key !== 'Escape') return;
        if (this._state !== 'dragging') return;

        e.preventDefault();
        e.stopPropagation();
        this._finishSession(false, 'escape');
    };

    DragController.prototype._handleWindowBlur = function() {
        if (this._state === 'dragging' && this._session && this._session.kind === KIND_INTERNAL) {
            this._finishSession(false, 'window-blur');
        } else if (this._state === 'armed') {
            this._armed = null;
            this._state = 'idle';
        }
    };

    DragController.prototype._handleVisibilityHidden = function() {
        if (this._state === 'dragging' && this._session && this._session.kind === KIND_INTERNAL) {
            this._finishSession(false, 'visibility-hidden');
        } else if (this._state === 'armed') {
            this._armed = null;
            this._state = 'idle';
        }
    };

    DragController.prototype._startSession = function(e) {
        var armed = this._armed;
        if (!armed) return;

        var source = armed.source;
        var descriptor = source.descriptor;

        var payload = null;
        if (typeof descriptor.payload === 'function') {
            try {
                payload = descriptor.payload();
            } catch (err) {
                console.error('[DragController] source.payload() error:', err);
            }
        } else if (descriptor.payload !== undefined) {
            payload = descriptor.payload;
        }

        var ghostHTML = null;
        if (typeof descriptor.ghostHTML === 'function') {
            try { ghostHTML = descriptor.ghostHTML(); } catch (err) { ghostHTML = null; }
        } else if (typeof descriptor.ghostHTML === 'string') {
            ghostHTML = descriptor.ghostHTML;
        }

        var session = {
            token: Symbol('drag-session'),
            kind: KIND_INTERNAL,
            source: source,
            channel: descriptor.channel || 'default',
            payload: payload,
            files: null,
            pointer: {
                startX: armed.startX,
                startY: armed.startY,
                x: e.clientX,
                y: e.clientY,
                pointerId: armed.pointerId,
                pointerType: armed.pointerType
            },
            ghost: null,
            ghostOffset: { x: 12, y: 12 },
            startedAt: performance.now()
        };

        this._session = session;
        this._state = 'dragging';
        this._armed = null;

        this._createGhost(session, ghostHTML);
        this._updateGhostPosition(e.clientX, e.clientY);

        try { source.element.style.opacity = '0.4'; } catch (err) {}

        if (typeof descriptor.onStart === 'function') {
            try { descriptor.onStart(session); } catch (err) {
                console.error('[DragController] source.onStart error:', err);
            }
        }

        this._emit('drag:start', { session: session });
        this._updateCurrentTarget(e.clientX, e.clientY);
    };

    DragController.prototype._isFileDrag = function(e) {
        var dt = e.dataTransfer;
        if (!dt || !dt.types) return false;
        for (var i = 0; i < dt.types.length; i++) {
            if (dt.types[i] === 'Files') return true;
        }
        return false;
    };

    DragController.prototype._startFileSession = function(e) {
        var session = {
            token: Symbol('drag-session'),
            kind: KIND_FILES,
            source: null,
            channel: KIND_FILES,
            payload: null,
            files: [],
            pointer: {
                startX: e.clientX,
                startY: e.clientY,
                x: e.clientX,
                y: e.clientY,
                pointerId: null,
                pointerType: 'file'
            },
            ghost: null,
            ghostOffset: { x: 12, y: 12 },
            startedAt: performance.now()
        };

        this._session = session;
        this._state = 'dragging';
        this._armed = null;

        this._emit('drag:start', { session: session });
    };

    DragController.prototype._handleFileDragEnter = function(e) {
        if (!this._isFileDrag(e)) return;
        if (this._state === 'dragging' && this._session && this._session.kind === KIND_INTERNAL) {
            return;
        }

        e.preventDefault();

        if (this._state !== 'dragging' || !this._session || this._session.kind !== KIND_FILES) {
            this._startFileSession(e);
        }

        this._session.pointer.x = e.clientX;
        this._session.pointer.y = e.clientY;
        this._updateCurrentTarget(e.clientX, e.clientY);
        this._emit('drag:move', { session: this._session });
    };

    DragController.prototype._handleFileDragOver = function(e) {
        if (!this._isFileDrag(e)) return;
        if (!this._session || this._session.kind !== KIND_FILES) return;

        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}

        this._session.pointer.x = e.clientX;
        this._session.pointer.y = e.clientY;
        this._updateCurrentTarget(e.clientX, e.clientY);
        this._emit('drag:move', { session: this._session });
    };

    DragController.prototype._handleFileDragLeave = function(e) {
        if (!this._session || this._session.kind !== KIND_FILES) return;

        if (!e.relatedTarget && e.clientX === 0 && e.clientY === 0) {
            this._finishSession(false, 'file-drag-leave-window');
            return;
        }

        this._updateCurrentTarget(e.clientX, e.clientY);
    };

    DragController.prototype._handleFileDrop = function(e) {
        if (!this._isFileDrag(e)) return;
        if (!this._session || this._session.kind !== KIND_FILES) return;

        e.preventDefault();
        e.stopPropagation();

        var files = [];
        if (e.dataTransfer && e.dataTransfer.files) {
            for (var i = 0; i < e.dataTransfer.files.length; i++) {
                files.push(e.dataTransfer.files[i]);
            }
        }

        this._session.files = files;
        this._session.pointer.x = e.clientX;
        this._session.pointer.y = e.clientY;

        this._updateCurrentTarget(e.clientX, e.clientY);
        this._finishSession(true, 'file-drop');
    };

    DragController.prototype._finishSession = function(allowDrop, reason) {
        var session = this._session;
        if (!session) return;

        var target = this._currentTarget;
        var accepted = false;

        if (allowDrop && target) {
            var descriptor = target.descriptor;
            try {
                var result = descriptor.onDrop(session);
                if (result && typeof result.then === 'function') {
                    result.catch(function(err) {
                        console.error('[DragController] target.onDrop async error:', err);
                    });
                    accepted = true;
                } else {
                    accepted = result !== false;
                }
            } catch (err) {
                console.error('[DragController] target.onDrop error:', err);
                accepted = false;
            }
        }

        if (target) {
            try {
                if (typeof target.descriptor.onLeave === 'function') {
                    target.descriptor.onLeave(session);
                }
            } catch (err) {
                console.error('[DragController] target.onLeave error:', err);
            }
            this._clearTargetHighlight(target);
        }

        this._destroyGhost(session);

        if (session.source) {
            try { session.source.element.style.opacity = ''; } catch (err) {}
            if (typeof session.source.descriptor.onEnd === 'function') {
                try { session.source.descriptor.onEnd(session); } catch (err) {
                    console.error('[DragController] source.onEnd error:', err);
                }
            }
        }

        if (allowDrop) {
            this._emit('drag:drop', {
                session: session,
                target: target ? target.descriptor : null,
                accepted: accepted
            });
        } else {
            this._emit('drag:cancel', {
                session: session,
                reason: reason || 'cancelled'
            });
        }

        this._session = null;
        this._currentTarget = null;
        this._state = 'idle';
    };

    DragController.prototype._createGhost = function(session, ghostHTML) {
        var ghost = document.createElement('div');
        ghost.className = 'ls-drag-ghost';
        ghost.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'pointer-events: none',
            'z-index: ' + Z_GHOST,
            'opacity: 0.92',
            'background: var(--bg-panel, #1a1a1a)',
            'border: 2px solid var(--accent-red, #cc2233)',
            'border-radius: 6px',
            'box-shadow: 0 20px 60px rgba(0,0,0,0.6)',
            'padding: 8px 14px',
            'font-size: 12px',
            'color: var(--text-primary, #e0d8cc)',
            'font-family: inherit',
            'max-width: 260px',
            'overflow: hidden',
            'text-overflow: ellipsis',
            'white-space: nowrap',
            'backdrop-filter: blur(8px)',
            'will-change: transform'
        ].join(';');

        if (ghostHTML) {
            ghost.innerHTML = ghostHTML;
        } else if (session.channel && session.channel.indexOf('icon-') === 0) {
            ghost.innerHTML = '<svg class="icon-svg" style="width:14px;height:14px;fill:currentColor;">'
                + '<use href="#' + escapeHtml(session.channel) + '"></use></svg>';
        } else {
            var label = (session.payload && typeof session.payload === 'object' && session.payload.name)
                ? session.payload.name
                : (session.channel || 'Drag');
            ghost.textContent = '📦 ' + label;
        }

        document.body.appendChild(ghost);
        session.ghost = ghost;
    };

    DragController.prototype._updateGhostPosition = function(x, y) {
        var session = this._session;
        if (!session || !session.ghost) return;

        var offset = session.ghostOffset;
        var left = x - offset.x;
        var top = y - offset.y;

        session.ghost.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0)';
    };

    DragController.prototype._destroyGhost = function(session) {
        if (!session || !session.ghost) return;
        if (session.ghost.parentNode) {
            session.ghost.parentNode.removeChild(session.ghost);
        }
        session.ghost = null;
    };

    DragController.prototype._updateCurrentTarget = function(x, y) {
        var session = this._session;
        if (!session) return;

        var candidates = this._collectTargetsAtPoint(x, y);

        var chosen = null;
        for (var i = 0; i < candidates.length; i++) {
            var record = candidates[i];
            var descriptor = record.descriptor;

            if (typeof descriptor.accept === 'function') {
                var ok;
                try { ok = descriptor.accept(session); } catch (err) {
                    console.error('[DragController] target.accept error:', err);
                    ok = false;
                }
                if (ok === false) continue;
            }

            chosen = record;
            break;
        }

        if (chosen === this._currentTarget) return;
        this._setCurrentTarget(chosen, 'move');
    };

    DragController.prototype._collectTargetsAtPoint = function(x, y) {
        var result = [];
        for (var i = 0; i < this._targets.length; i++) {
            var record = this._targets[i];
            var el = record.descriptor.element;
            if (!el || !el.isConnected) continue;

            var rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (!rectContains(rect, x, y)) continue;

            result.push(record);
        }

        result.sort(function(a, b) {
            return _domDepth(b.descriptor.element) - _domDepth(a.descriptor.element);
        });

        return result;
    };

    DragController.prototype._setCurrentTarget = function(record, reason) {
        var prev = this._currentTarget;
        if (prev === record) return;

        if (prev) {
            try {
                if (typeof prev.descriptor.onLeave === 'function') {
                    prev.descriptor.onLeave(this._session);
                }
            } catch (err) {
                console.error('[DragController] target.onLeave error:', err);
            }
            this._clearTargetHighlight(prev);
            this._emit('drag:leave-target', {
                session: this._session,
                target: prev.descriptor
            });
        }

        this._currentTarget = record;

        if (record) {
            this._applyTargetHighlight(record);
            try {
                if (typeof record.descriptor.onEnter === 'function') {
                    record.descriptor.onEnter(this._session);
                }
            } catch (err) {
                console.error('[DragController] target.onEnter error:', err);
            }
            this._emit('drag:enter-target', {
                session: this._session,
                target: record.descriptor
            });
        }
    };

    DragController.prototype._applyTargetHighlight = function(record) {
        var el = record.descriptor.element;
        if (!el) return;
        el.classList.add('ls-drop-hover');
    };

    DragController.prototype._clearTargetHighlight = function(record) {
        var el = record.descriptor.element;
        if (!el) return;
        el.classList.remove('ls-drop-hover');
    };

    DragController.prototype.destroy = function() {
        if (this._state === 'dragging') {
            this._finishSession(false, 'destroy');
        }
        this._sources = [];
        this._targets = [];
        this._listeners = {};

        document.removeEventListener('mousedown', this._onDocMouseDown, true);
        document.removeEventListener('mousemove', this._onDocMouseMove, true);
        document.removeEventListener('mouseup', this._onDocMouseUp, true);
        document.removeEventListener('keydown', this._onDocKeyDown, true);
        document.removeEventListener('pointercancel', this._onDocPointerCancel, true);
        window.removeEventListener('blur', this._onWindowBlur);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);

        document.removeEventListener('dragenter', this._onDocDragEnter, true);
        document.removeEventListener('dragover',  this._onDocDragOver,  true);
        document.removeEventListener('dragleave', this._onDocDragLeave, true);
        document.removeEventListener('drop',      this._onDocDrop,      true);
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { DragController: DragController };
    }

    if (typeof window !== 'undefined') {
        window.DragController = DragController;
        window.dragController = new DragController({ debug: false });
    }

})();