// core/window/WindowSwapController.js
// Версия 1.0.0

(function() {
    'use strict';

    var DRAG_THRESHOLD_PX = 5;
    var HINT_Z = 99999;
    var GHOST_Z = 99999;

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

    class WindowSwapController {
        constructor(options) {
            options = options || {};

            this._layoutManager = options.layoutManager || null;
            this._baseWindow = options.baseWindow || null;
            this._headerLeft = options.headerLeft || null;
            this._header = options.header || null;

            this._isDragging = false;
            this._activeHandler = null;
            this._ghost = null;
            this._hint = null;
            this._targetEl = null;
            this._dragData = null;

            this._onMouseDown = null;
            this._installed = false;

            if (options.autoInstall !== false) {
                this.install();
            }
        }

        install() {
            if (this._installed) return;
            if (!this._headerLeft || !this._layoutManager || !this._baseWindow) return;

            var self = this;

            this._onMouseDown = function(e) {
                self._handleMouseDown(e);
            };

            this._headerLeft.addEventListener('mousedown', this._onMouseDown);

            this._installed = true;
        }

        uninstall() {
            if (!this._installed) return;

            if (this._headerLeft && this._onMouseDown) {
                this._headerLeft.removeEventListener('mousedown', this._onMouseDown);
            }

            this._onMouseDown = null;
            this._installed = false;

            this._detachGlobalHandlers();
            this._cleanupDragVisuals();
        }

        destroy() {
            this.uninstall();
            this._layoutManager = null;
            this._baseWindow = null;
            this._headerLeft = null;
            this._header = null;
        }

        isDragging() {
            return this._isDragging;
        }

        // ============================================================
        // 1. MOUSE DOWN
        // ============================================================

        _handleMouseDown(e) {
            if (e.button !== 0) return;
            if (this._activeHandler) return;

            var count = this._layoutManager ? this._layoutManager.getWindowCount() : 1;
            if (count <= 1) return;

            if (e.target.closest('button')) return;
            if (isNoDragTarget(e.target)) return;

            var self = this;

            this._dragData = {
                windowId: this._baseWindow.id,
                startX: e.clientX,
                startY: e.clientY,
                offsetX: 12,
                offsetY: 12,
                isDragging: false,
                targetId: null
            };

            if (this._headerLeft) {
                this._headerLeft.style.cursor = 'grabbing';
            }
            if (this._header) {
                this._header.style.opacity = '0.85';
            }

            var onMouseMove = function(ev) {
                if (ev.buttons === 0) {
                    self._cancelDrag();
                    return;
                }

                var dx = ev.clientX - self._dragData.startX;
                var dy = ev.clientY - self._dragData.startY;

                if (!self._dragData.isDragging
                    && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
                    self._dragData.isDragging = true;
                    self._isDragging = true;
                    self._createGhost();
                    self._showHint();
                }

                if (self._dragData.isDragging && self._ghost) {
                    self._ghost.style.left = (ev.clientX - self._dragData.offsetX) + 'px';
                    self._ghost.style.top = (ev.clientY - self._dragData.offsetY) + 'px';

                    var targetId = self._findWindowAtPoint(ev.clientX, ev.clientY);
                    self._dragData.targetId = targetId;
                    self._highlightTarget(targetId);
                }
            };

            var onMouseUp = function() {
                if (self._dragData && self._dragData.isDragging && self._dragData.targetId) {
                    try {
                        self._layoutManager.swapWindows(
                            self._dragData.windowId,
                            self._dragData.targetId
                        );
                    } catch (err) {
                        console.error('[WindowSwapController] swap error:', err);
                    }
                }
                self._finishDrag();
            };

            var onCancel = function() {
                self._cancelDrag();
            };

            this._activeHandler = {
                onMouseMove: onMouseMove,
                onMouseUp: onMouseUp,
                onCancel: onCancel
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('pointercancel', onCancel);
            window.addEventListener('blur', onCancel);
        }

        // ============================================================
        // 2. DETACH GLOBAL HANDLERS
        // ============================================================

        _detachGlobalHandlers() {
            if (!this._activeHandler) return;

            var h = this._activeHandler;

            try { document.removeEventListener('mousemove', h.onMouseMove); } catch (e) {}
            try { document.removeEventListener('mouseup', h.onMouseUp); } catch (e) {}
            try { document.removeEventListener('pointercancel', h.onCancel); } catch (e) {}
            try { window.removeEventListener('blur', h.onCancel); } catch (e) {}

            this._activeHandler = null;
        }

        // ============================================================
        // 3. GHOST
        // ============================================================

        _createGhost() {
            if (this._ghost) return;

            var ghost = document.createElement('div');
            ghost.className = 'window-ghost';
            ghost.style.cssText = [
                'position:fixed',
                'pointer-events:none',
                'z-index:' + GHOST_Z,
                'opacity:0.92',
                'background:var(--bg-panel, #1a1a1a)',
                'border:2px solid var(--accent-red, #cc2233)',
                'border-radius:var(--radius, 6px)',
                'box-shadow:0 20px 80px rgba(0,0,0,0.6)',
                'padding:10px 20px',
                'font-size:13px',
                'color:var(--text-primary, #e0d8cc)',
                'width:200px',
                'overflow:hidden',
                'text-overflow:ellipsis',
                'white-space:nowrap',
                'backdrop-filter:blur(12px)'
            ].join(';');

            var chrome = this._baseWindow && typeof this._baseWindow.getRenderWindow === 'function'
                ? this._baseWindow.getRenderWindow()
                : null;

            var icon = chrome ? chrome.getIcon() : '📄';
            var title = chrome ? chrome.getTitle() : 'Window';

            var iconHtml;
            if (typeof icon === 'string' && icon.indexOf('icon-') === 0) {
                iconHtml = '<svg class="icon-svg" style="width:18px;height:18px;fill:currentColor;display:block;flex-shrink:0;">'
                    + '<use href="#' + escapeHtml(icon) + '"></use></svg>';
            } else {
                iconHtml = '<span style="font-size:18px;flex-shrink:0;">'
                    + escapeHtml(icon || '📄') + '</span>';
            }

            ghost.innerHTML = [
                '<div style="display:flex;align-items:center;gap:8px;">',
                iconHtml,
                '<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">',
                escapeHtml(title),
                '</span>',
                '</div>'
            ].join('');

            var d = this._dragData;
            if (d) {
                ghost.style.left = (d.startX - d.offsetX) + 'px';
                ghost.style.top = (d.startY - d.offsetY) + 'px';
            }

            document.body.appendChild(ghost);
            this._ghost = ghost;
        }

        // ============================================================
        // 4. HINT
        // ============================================================

        _showHint() {
            if (this._hint) return;

            var hint = document.createElement('div');
            hint.className = 'drag-hint';
            hint.style.cssText = [
                'position:fixed',
                'bottom:40px',
                'left:50%',
                'transform:translateX(-50%)',
                'background:rgba(0,0,0,0.85)',
                'color:var(--text-primary, #e0d8cc)',
                'padding:10px 24px',
                'border-radius:var(--radius, 6px)',
                'font-size:13px',
                'z-index:' + HINT_Z,
                'backdrop-filter:blur(12px)',
                'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                'pointer-events:none',
                'opacity:0.95',
                'box-shadow:0 8px 32px rgba(0,0,0,0.4)',
                'font-weight:500'
            ].join(';');
            hint.textContent = '📌 Drop on any window to swap positions';

            document.body.appendChild(hint);
            this._hint = hint;
        }

        // ============================================================
        // 5. FIND WINDOW AT POINT
        // ============================================================

        _findWindowAtPoint(x, y) {
            if (!this._layoutManager || !this._baseWindow) return null;

            var padding = 30;
            var myId = String(this._baseWindow.id);

            var windows = this._layoutManager.getVisibleWindows
                ? this._layoutManager.getVisibleWindows()
                : this._layoutManager.getWindows();

            for (var i = 0; i < windows.length; i++) {
                var w = windows[i];
                if (String(w.id) === myId) continue;

                var node = this._layoutManager.getWindowElement(w.nodeId);
                if (!node) continue;

                var rect = node.getBoundingClientRect();
                if (x >= rect.left - padding && x <= rect.right + padding &&
                    y >= rect.top - padding && y <= rect.bottom + padding) {
                    return w.id;
                }
            }
            return null;
        }

        // ============================================================
        // 6. HIGHLIGHT TARGET
        // ============================================================

        _highlightTarget(targetId) {
            this._clearHighlight();

            if (!targetId) return;
            if (!this._layoutManager) return;

            var el = this._resolveTargetElement(targetId);
            if (!el) return;

            el.classList.add('drag-target');
            el.style.borderColor = 'var(--accent-red, #cc2233)';
            el.style.boxShadow = 'inset 0 0 40px rgba(204, 34, 51, 0.15), 0 0 30px rgba(204, 34, 51, 0.05)';
            el.style.backgroundColor = 'rgba(204, 34, 51, 0.03)';

            this._targetEl = el;
        }

        _clearHighlight() {
            if (this._targetEl) {
                this._targetEl.classList.remove('drag-target');
                this._targetEl.style.borderColor = '';
                this._targetEl.style.boxShadow = '';
                this._targetEl.style.backgroundColor = '';
                this._targetEl = null;
            }

            var all = document.querySelectorAll('.window-container.drag-target');
            for (var i = 0; i < all.length; i++) {
                all[i].classList.remove('drag-target');
                all[i].style.borderColor = '';
                all[i].style.boxShadow = '';
                all[i].style.backgroundColor = '';
            }
        }

        _resolveTargetElement(targetId) {
            if (!this._layoutManager) return null;

            var windows = this._layoutManager.getVisibleWindows
                ? this._layoutManager.getVisibleWindows()
                : this._layoutManager.getWindows();

            for (var i = 0; i < windows.length; i++) {
                if (String(windows[i].id) === String(targetId)) {
                    return this._layoutManager.getWindowElement(windows[i].nodeId);
                }
            }
            return null;
        }

        // ============================================================
        // 7. CLEANUP
        // ============================================================

        _cleanupDragVisuals() {
            if (this._ghost && this._ghost.parentNode) {
                this._ghost.parentNode.removeChild(this._ghost);
            }
            this._ghost = null;

            if (this._hint && this._hint.parentNode) {
                this._hint.parentNode.removeChild(this._hint);
            }
            this._hint = null;

            this._clearHighlight();
        }

        // ============================================================
        // 8. FINISH / CANCEL
        // ============================================================

        _finishDrag() {
            this._detachGlobalHandlers();
            this._cleanupDragVisuals();

            if (this._headerLeft) this._headerLeft.style.cursor = '';
            if (this._header) this._header.style.opacity = '1';

            this._isDragging = false;
            this._dragData = null;
        }

        _cancelDrag() {
            this._finishDrag();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { WindowSwapController: WindowSwapController };
    }

    if (typeof window !== 'undefined') {
        window.WindowSwapController = WindowSwapController;
    }

})();