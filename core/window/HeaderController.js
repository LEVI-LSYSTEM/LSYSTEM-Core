// core/window/HeaderController.js
// Версия 4.0.0

(function() {
    'use strict';

    var _itemTypes = new Map();

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(s) { return escapeHtml(s); }

    function filterItems(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(function(x) { return x && typeof x === 'object'; });
    }

    function HeaderController(config) {
        config = config || {};

        this._chrome = config.chrome || null;
        this._baseWindow = config.baseWindow || null;
        this._layoutManager = config.layoutManager || null;
        this._registry = config.registry || null;

        this._id = config.id || (this._baseWindow && this._baseWindow.id) || null;
        this._type = config.type || (this._baseWindow && this._baseWindow.type) || 'window';

        this._itemsConfig = [];
        this._headerItems = [];
        this._dropdownWrappers = [];

        this._listeners = {};
        this._isDestroyed = false;

        this._buttonsVersion = 0;
        this._measuredVersion = -1;

        this._build();
    }

    // ============================================================
    // 1. СТАТИЧЕСКИЙ РЕЕСТР ТИПОВ
    // ============================================================

    HeaderController.registerHeaderItemType = function(type, builder) {
        if (!type || typeof type !== 'string') {
            console.error('[HeaderController] registerHeaderItemType: type required');
            return false;
        }
        if (typeof builder !== 'function') {
            console.error('[HeaderController] registerHeaderItemType: builder must be a function');
            return false;
        }
        if (_itemTypes.has(type)) {
            console.warn('[HeaderController] headerItemType override:', type);
        }
        _itemTypes.set(type, builder);
        return true;
    };

    HeaderController.unregisterHeaderItemType = function(type) {
        return _itemTypes.delete(type);
    };

    HeaderController.getHeaderItemTypes = function() {
        return Array.from(_itemTypes.keys());
    };

    // ============================================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    HeaderController.prototype._build = function() {
        if (!this._chrome) {
            console.error('[HeaderController] chrome is required');
            return;
        }
        this._setupDragSwap();
    };

    // ============================================================
    // 3. ITEMS — ПУБЛИЧНОЕ API
    // ============================================================

    HeaderController.prototype.setItems = function(items) {
        this._itemsConfig = filterItems(items);
        this._rebuild();
    };

    HeaderController.prototype.addItem = function(desc, index) {
        if (!desc || typeof desc !== 'object') return false;

        if (typeof index === 'number' && index >= 0 && index <= this._itemsConfig.length) {
            this._itemsConfig.splice(index, 0, desc);
        } else {
            this._itemsConfig.push(desc);
        }

        this._rebuild();
        return true;
    };

    HeaderController.prototype.removeItem = function(id) {
        if (!id) return false;

        var before = this._itemsConfig.length;
        this._itemsConfig = this._itemsConfig.filter(function(d) { return d.id !== id; });
        if (this._itemsConfig.length === before) return false;

        this._rebuild();
        return true;
    };

    HeaderController.prototype.getItemsConfig = function() {
        return this._itemsConfig.slice();
    };

    HeaderController.prototype.getRenderedItems = function() {
        return this._headerItems.slice();
    };

    HeaderController.prototype.refresh = function() {
        if (this._isDestroyed) return;
        this._rebuild();
    };

    HeaderController.prototype.refreshItems = function() {
        if (this._isDestroyed) return;

        for (var i = 0; i < this._headerItems.length; i++) {
            var item = this._headerItems[i];
            if (!item || !item.el || !item.desc) continue;

            if (typeof item.desc.refresh === 'function') {
                try { item.desc.refresh(item.el, this._ctx()); } catch (e) {
                    console.error('[HeaderController] item.refresh error:', e);
                }
            }
            if (typeof item.el._refreshItems === 'function') {
                try { item.el._refreshItems(); } catch (e) {}
            }
        }
    };

    HeaderController.prototype.refreshDropdowns = function() {
        this.refreshItems();
    };

    HeaderController.prototype._ctx = function() {
        return {
            header: this,
            chrome: this._chrome,
            baseWindow: this._baseWindow,
            layoutManager: this._layoutManager,
            registry: this._registry
        };
    };

    // ============================================================
    // 4. РЕНДЕР
    // ============================================================

    HeaderController.prototype._rebuild = function() {
        if (this._isDestroyed || !this._chrome) return;

        this._renderHeaderItems();

        this._buttonsVersion++;
        this._measuredVersion = -1;

        var self = this;
        if (this._chrome.getRoot()) {
            requestAnimationFrame(function() {
                if (self._isDestroyed || !self._chrome) return;
                self._chrome.measureBaseWidths();
                self._chrome.updateHeaderAdaptive();
            });
        }
    };

    HeaderController.prototype._renderHeaderItems = function() {
        var container = this._chrome.getHeaderItemsEl
            ? this._chrome.getHeaderItemsEl()
            : null;
        if (!container) return;

        for (var i = 0; i < this._headerItems.length; i++) {
            var item = this._headerItems[i];
            if (!item || !item.el) continue;

            if (item.desc && typeof item.desc.destroy === 'function') {
                try { item.desc.destroy(item.el, this._baseWindow); } catch (e) {
                    console.error('[HeaderController] headerItem.destroy error:', e);
                }
            }

            if (typeof item.el.__lsDestroy === 'function') {
                try { item.el.__lsDestroy(); } catch (e) {
                    console.error('[HeaderController] el.__lsDestroy error:', e);
                }
            }
        }

        for (var j = 0; j < this._dropdownWrappers.length; j++) {
            var w = this._dropdownWrappers[j];
            try { if (typeof w.cleanup === 'function') w.cleanup(); } catch (e) {}
            if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
        }

        this._dropdownWrappers = [];
        this._headerItems = [];

        container.innerHTML = '';

        var items = this._itemsConfig;
        var self = this;

        for (var k = 0; k < items.length; k++) {
            var desc = items[k];
            if (!desc) continue;

            var isHidden = false;
            if (typeof desc.hidden === 'function') {
                try {
                    isHidden = !!desc.hidden(this._baseWindow, self);
                } catch (e) {
                    console.error('[HeaderController] headerItem.hidden() error:', e);
                    isHidden = false;
                }
            } else if (desc.hidden) {
                isHidden = true;
            }
            if (isHidden) continue;

            var el = null;

            var ctx = {
                header: self,
                chrome: self._chrome,
                baseWindow: self._baseWindow,
                layoutManager: self._layoutManager,
                registry: self._registry,
                index: k,
                desc: desc
            };

            if (typeof desc.render === 'function') {
                try {
                    el = desc.render(ctx);
                } catch (e) {
                    console.error('[HeaderController] headerItem.render() error:', e);
                    el = null;
                }
            } else if (desc.type) {
                var builder = _itemTypes.get(desc.type);
                if (builder) {
                    try {
                        el = builder(desc, ctx);
                    } catch (e) {
                        console.error('[HeaderController] headerItem builder error:', e);
                        el = null;
                    }
                } else {
                    console.warn('[HeaderController] Unknown headerItem type:', desc.type);
                }
            } else {
                console.warn('[HeaderController] headerItem without type/render at index', k, desc);
            }

            if (el && el.nodeType === 1) {
                container.appendChild(el);
                this._headerItems.push({ desc: desc, el: el });

                if (typeof el._refreshItems === 'function') {
                    this._dropdownWrappers.push({ el: el });
                }
            }
        }
    };

    // ============================================================
    // 5. POSITION DROPDOWN
    // ============================================================

    HeaderController.prototype.positionDropdown = function(dropdown, anchor, opts) {
        if (!dropdown || !anchor) return;
        opts = opts || {};

        var align = opts.align || 'right';
        var wasHidden = false;
        var prevVisibility = dropdown.style.visibility;
        var prevDisplay = dropdown.style.display;

        if (prevDisplay !== 'block') {
            wasHidden = true;
            dropdown.style.visibility = 'hidden';
            dropdown.style.display = 'block';
        }

        var btnRect = anchor.getBoundingClientRect();
        var ddWidth = dropdown.offsetWidth || 200;
        var ddHeight = dropdown.offsetHeight || 200;

        var left;
        if (align === 'left') {
            left = Math.round(btnRect.left);
        } else if (align === 'center') {
            left = Math.round(btnRect.left + btnRect.width / 2 - ddWidth / 2);
        } else {
            left = Math.round(btnRect.right - ddWidth);
        }

        var top = Math.round(btnRect.bottom + 4);

        if (left < 4) left = 4;
        if (left + ddWidth > window.innerWidth - 4) {
            left = window.innerWidth - ddWidth - 4;
        }
        if (top + ddHeight > window.innerHeight - 4) {
            top = Math.round(btnRect.top - ddHeight - 4);
            if (top < 4) top = 4;
        }

        dropdown.style.left = left + 'px';
        dropdown.style.top = top + 'px';

        if (wasHidden) {
            dropdown.style.display = prevDisplay;
            dropdown.style.visibility = prevVisibility || '';
        }
    };

    // ============================================================
    // 6. DRAG-SWAP ОКОН
    // ============================================================

    HeaderController.prototype._setupDragSwap = function() {
        if (!this._chrome || !this._baseWindow || !this._layoutManager) return;

        var headerLeft = this._chrome.getHeaderLeft();
        var header = this._chrome.getHeader();
        if (!headerLeft || !header) return;

        var self = this;

        var dragData = null;
        var activeHandlers = null;

        var detach = function() {
            if (!activeHandlers) return;
            document.removeEventListener('mousemove', activeHandlers.onMouseMove);
            document.removeEventListener('mouseup', activeHandlers.onMouseUp);
            document.removeEventListener('pointercancel', activeHandlers.onCancel);
            window.removeEventListener('blur', activeHandlers.onCancel);
            activeHandlers = null;
        };

        var isNoDragTarget = function(target) {
            if (!target || typeof target.closest !== 'function') return false;
            var el = target.closest('[data-no-drag]');
            if (!el) return false;
            var raw = el.getAttribute('data-no-drag');
            var v = (raw == null ? '' : String(raw)).trim().toLowerCase();
            if (v === '') return true;
            if (v === 'true' || v === '1' || v === 'yes') return true;
            if (v === 'false' || v === '0' || v === 'no') return false;
            return true;
        };

        headerLeft.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            if (activeHandlers) return;

            var count = self._layoutManager ? self._layoutManager.getWindowCount() : 1;
            if (count <= 1) return;

            if (e.target.closest('button')) return;
            if (isNoDragTarget(e.target)) return;

            dragData = {
                windowId: self._id,
                startX: e.clientX,
                startY: e.clientY,
                offsetX: 12,
                offsetY: 12,
                isDragging: false,
                ghost: null,
                targetId: null
            };

            headerLeft.style.cursor = 'grabbing';
            header.style.opacity = '0.85';

            var onMouseMove = function(ev) {
                if (ev.buttons === 0) {
                    onCancel();
                    return;
                }

                var dx = ev.clientX - dragData.startX;
                var dy = ev.clientY - dragData.startY;

                if (!dragData.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    dragData.isDragging = true;
                    startDrag(dragData);
                }

                if (dragData.isDragging && dragData.ghost) {
                    dragData.ghost.style.left = (ev.clientX - dragData.offsetX) + 'px';
                    dragData.ghost.style.top = (ev.clientY - dragData.offsetY) + 'px';

                    var target = findWindowAtPoint(ev.clientX, ev.clientY);
                    dragData.targetId = target;
                    highlightTarget(target);
                }
            };

            var onMouseUp = function() {
                if (dragData.isDragging && dragData.targetId) {
                    try {
                        self._layoutManager.swapWindows(dragData.windowId, dragData.targetId);
                    } catch (err) {
                        console.error('[HeaderController] swap error:', err);
                    }
                }
                endDrag(dragData);
                headerLeft.style.cursor = '';
                header.style.opacity = '1';
                detach();
                dragData = null;
            };

            var onCancel = function() {
                if (dragData) endDrag(dragData);
                headerLeft.style.cursor = '';
                header.style.opacity = '1';
                detach();
                dragData = null;
            };

            activeHandlers = {
                onMouseMove: onMouseMove,
                onMouseUp: onMouseUp,
                onCancel: onCancel
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('pointercancel', onCancel);
            window.addEventListener('blur', onCancel);
        });

        var startDrag = function(data) {
            var ghost = document.createElement('div');
            ghost.className = 'window-ghost';
            ghost.style.cssText = [
                'position:fixed',
                'pointer-events:none',
                'z-index:99999',
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

            var iconHtml;
            var icon = self._chrome.getIcon();
            if (icon && icon.indexOf('icon-') === 0) {
                iconHtml = '<svg class="icon-svg" style="width:18px;height:18px;fill:currentColor;display:block;flex-shrink:0;"><use href="#' + escapeAttr(icon) + '"></use></svg>';
            } else {
                iconHtml = '<span style="font-size:18px;flex-shrink:0;">' + escapeHtml(icon || '📄') + '</span>';
            }

            var title = self._chrome.getTitle();

            ghost.innerHTML = [
                '<div style="display:flex;align-items:center;gap:8px;">',
                iconHtml,
                '<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(title) + '</span>',
                '</div>'
            ].join('');

            ghost.style.left = (data.startX - data.offsetX) + 'px';
            ghost.style.top = (data.startY - data.offsetY) + 'px';

            document.body.appendChild(ghost);
            data.ghost = ghost;

            showDragHint('📌 Drop on any window to swap positions');
        };

        var endDrag = function(data) {
            if (data.ghost && data.ghost.parentNode) {
                data.ghost.remove();
            }

            document.querySelectorAll('.window-container.drag-target').forEach(function(el) {
                el.classList.remove('drag-target');
                el.style.borderColor = '';
                el.style.boxShadow = '';
                el.style.transform = '';
                el.style.backgroundColor = '';
            });

            var hint = document.querySelector('.drag-hint');
            if (hint) hint.remove();
        };

        var findWindowAtPoint = function(x, y) {
            var padding = 30;
            var myId = String(self._id);

            var windows = self._layoutManager.getVisibleWindows
                ? self._layoutManager.getVisibleWindows()
                : self._layoutManager.getWindows();

            for (var i = 0; i < windows.length; i++) {
                var w = windows[i];
                if (String(w.id) === myId) continue;
                var node = self._layoutManager._domMap
                    ? self._layoutManager._domMap.get(w.nodeId)
                    : null;
                if (!node) continue;
                var rect = node.getBoundingClientRect();
                if (x >= rect.left - padding && x <= rect.right + padding &&
                    y >= rect.top - padding && y <= rect.bottom + padding) {
                    return w.id;
                }
            }
            return null;
        };

        var highlightTarget = function(targetId) {
            document.querySelectorAll('.window-container.drag-target').forEach(function(el) {
                el.classList.remove('drag-target');
                el.style.borderColor = '';
                el.style.boxShadow = '';
                el.style.transform = '';
                el.style.backgroundColor = '';
            });

            if (!targetId) return;

            var el = null;
            var windows = self._layoutManager.getVisibleWindows
                ? self._layoutManager.getVisibleWindows()
                : self._layoutManager.getWindows();
            for (var i = 0; i < windows.length; i++) {
                if (String(windows[i].id) === String(targetId)) {
                    el = self._layoutManager._domMap
                        ? self._layoutManager._domMap.get(windows[i].nodeId)
                        : null;
                    break;
                }
            }
            if (!el) {
                el = document.querySelector('.window-container[data-window-id="' + targetId + '"]');
            }

            if (el) {
                el.classList.add('drag-target');
                el.style.borderColor = 'var(--accent-red, #cc2233)';
                el.style.boxShadow = 'inset 0 0 40px rgba(204, 34, 51, 0.15), 0 0 30px rgba(204, 34, 51, 0.05)';
                el.style.backgroundColor = 'rgba(204, 34, 51, 0.03)';
            }
        };

        var showDragHint = function(text) {
            var existing = document.querySelector('.drag-hint');
            if (existing) existing.remove();

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
                'z-index:99999',
                'backdrop-filter:blur(12px)',
                'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                'pointer-events:none',
                'opacity:0.95',
                'box-shadow:0 8px 32px rgba(0,0,0,0.4)',
                'font-weight:500'
            ].join(';');
            hint.textContent = text;
            document.body.appendChild(hint);
        };
    };

    // ============================================================
    // 7. СОБЫТИЯ
    // ============================================================

    HeaderController.prototype.on = function(event, cb) {
        if (typeof cb !== 'function') return function() {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);

        var self = this;
        return function() { self.off(event, cb); };
    };

    HeaderController.prototype.off = function(event, cb) {
        var arr = this._listeners[event];
        if (!arr) return;
        var i = arr.indexOf(cb);
        if (i !== -1) arr.splice(i, 1);
    };

    HeaderController.prototype._emit = function(event, data) {
        var arr = this._listeners[event];
        if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](data); } catch (e) {
                console.error('[HeaderController] listener error (' + event + '):', e);
            }
        }
    };

    // ============================================================
    // 8. DESTROY
    // ============================================================

    HeaderController.prototype.destroy = function() {
        if (this._isDestroyed) return;
        this._isDestroyed = true;

        for (var i = 0; i < this._headerItems.length; i++) {
            var item = this._headerItems[i];
            if (!item || !item.el) continue;

            if (item.desc && typeof item.desc.destroy === 'function') {
                try { item.desc.destroy(item.el, this._baseWindow); } catch (e) {}
            }

            if (typeof item.el.__lsDestroy === 'function') {
                try { item.el.__lsDestroy(); } catch (e) {}
            }
        }

        for (var j = 0; j < this._dropdownWrappers.length; j++) {
            var w = this._dropdownWrappers[j];
            try { if (typeof w.cleanup === 'function') w.cleanup(); } catch (e) {}
        }

        this._headerItems = [];
        this._dropdownWrappers = [];
        this._itemsConfig = [];
        this._listeners = {};
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { HeaderController: HeaderController };
    }

    if (typeof window !== 'undefined') {
        window.HeaderController = HeaderController;
    }

})();