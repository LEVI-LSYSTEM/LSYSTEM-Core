// core/window/HeaderController.js
// Версия 5.0.0

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

        this._swapController = null;

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
    // 6. DRAG-SWAP — ДЕЛЕГИРОВАНИЕ В WindowSwapController
    // ============================================================

    HeaderController.prototype._setupDragSwap = function() {
        if (!this._chrome || !this._baseWindow || !this._layoutManager) return;

        if (typeof window.WindowSwapController !== 'function') {
            console.warn('[HeaderController] WindowSwapController not available');
            return;
        }

        var headerLeft = this._chrome.getHeaderLeft();
        var header = this._chrome.getHeader();
        if (!headerLeft || !header) return;

        this._swapController = new window.WindowSwapController({
            layoutManager: this._layoutManager,
            baseWindow: this._baseWindow,
            headerLeft: headerLeft,
            header: header,
            autoInstall: true
        });
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

        if (this._swapController) {
            try { this._swapController.destroy(); } catch (e) {}
            this._swapController = null;
        }

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