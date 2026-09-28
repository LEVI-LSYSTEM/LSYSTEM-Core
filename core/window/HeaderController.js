// core/window/HeaderController.js
// Версия 3.1.0

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

        // ВАЖНО: рендерим в ОБРАТНОМ порядке.
        // Контейнер имеет flex-direction: row-reverse + justify-content: flex-start,
        // правый край прибит к правому краю шапки. Инвертируя DOM-порядок,
        // мы получаем визуальный порядок, совпадающий с порядком в static menu
        // (первый элемент массива — самый левый).
        for (var k = items.length - 1; k >= 0; k--) {
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
    // 5. ВСТРОЕННЫЕ ТИПЫ
    // ============================================================

    HeaderController.registerHeaderItemType('button', function(desc, ctx) {
        return buildButton(desc, ctx);
    });

    HeaderController.registerHeaderItemType('dropdown', function(desc, ctx) {
        return buildDropdown(desc, ctx);
    });

    HeaderController.registerHeaderItemType('separator', function(desc) {
        var sep = document.createElement('span');
        sep.className = 'header-separator';
        sep.dataset.action = desc.action || '';
        sep.style.cssText = [
            'width:' + (desc.width || '1px'),
            'height:' + (desc.height || '14px'),
            'background:' + (desc.color || 'var(--border-color, rgba(200, 184, 154, 0.12))'),
            'flex-shrink:0',
            'margin:' + (desc.margin || '0 2px'),
            'align-self:center',
            'opacity:' + (desc.opacity || '0.6')
        ].join(';');
        return sep;
    });

    function buildButton(btnConfig, ctx) {
        var btn = document.createElement('button');
        btn.className = 'window-action-btn';
        btn.title = btnConfig.title || '';
        btn.setAttribute('type', 'button');

        if (btnConfig.action) btn.setAttribute('data-action', btnConfig.action);
        if (btnConfig.value)  btn.setAttribute('data-value', btnConfig.value);

        var iconHtml = btnConfig.icon && btnConfig.icon.indexOf('icon-') === 0
            ? '<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;"><use href="#' + escapeAttr(btnConfig.icon) + '"></use></svg>'
            : escapeHtml(btnConfig.icon || '');

        var labelHtml = btnConfig.label
            ? '<span class="btn-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">' + escapeHtml(btnConfig.label) + '</span>'
            : '';

        btn.innerHTML = [
            '<span class="btn-icon" style="display:flex;align-items:center;flex-shrink:0;">' + iconHtml + '</span>',
            '<span class="btn-text-wrapper" style="display:flex;align-items:center;gap:var(--rw-btn-gap-active, 4px);min-width:0;overflow:hidden;">',
            labelHtml,
            '</span>'
        ].join('');

        btn.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'gap:var(--rw-btn-gap-active, 4px)',
            'padding:0 var(--rw-btn-pad-x, 8px)',
            'height:22px',
            'min-height:22px',
            'border-width:1px',
            'border-style:solid',
            'border-color:var(--border-color, rgba(200, 184, 154, 0.12))',
            'border-radius:4px',
            'background:' + (btnConfig.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))'),
            'color:' + (btnConfig.color || 'var(--text-secondary, #a09888)'),
            'font-size:10px',
            'font-weight:500',
            'cursor:pointer',
            'transition:background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
            'white-space:nowrap',
            'font-family:inherit',
            'flex-shrink:0',
            'user-select:none',
            'overflow:hidden',
            'box-sizing:border-box'
        ].join(';');

        btn.addEventListener('mouseenter', function() {
            if (btnConfig.danger) {
                this.style.background = 'var(--accent-red, #cc2233)';
                this.style.borderColor = 'var(--accent-red, #cc2233)';
                this.style.color = '#fff';
                return;
            }
            this.style.background = btnConfig.hoverBg || 'var(--bg-active, rgba(60, 60, 60, 0.8))';
            this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
            this.style.color = 'var(--text-primary, #e0d8cc)';
        });
        btn.addEventListener('mouseleave', function() {
            this.style.background = btnConfig.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
            this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
            this.style.color = btnConfig.color || 'var(--text-secondary, #a09888)';
        });

        btn.addEventListener('click', function(e) {
            e.stopPropagation();

            if (btnConfig.callback && typeof btnConfig.callback === 'function') {
                try { btnConfig.callback(ctx.baseWindow, ctx); } catch (err) {
                    console.error('[HeaderController] button callback error:', err);
                }
                return;
            }

            ctx.header._emit('menu-action', {
                windowId: ctx.header._id,
                action: btnConfig.action || '',
                value: btnConfig.value || '',
                payload: btnConfig.payload !== undefined ? btnConfig.payload : null,
                item: btnConfig
            });
        });

        return btn;
    }

    function buildDropdown(config, ctx) {
        var self = ctx.header;

        var wrapper = document.createElement('div');
        wrapper.className = 'window-actions dropdown-wrapper';
        if (config.id) wrapper.dataset.dropdownId = config.id;

        wrapper.style.cssText = [
            'position:relative',
            'display:flex',
            'flex-shrink:0',
            'overflow:hidden'
        ].join(';');

        var btn = document.createElement('button');
        btn.className = 'window-action-btn dropdown-toggle';
        btn.title = config.title || config.label || 'Menu';
        btn.setAttribute('type', 'button');
        if (config.action) btn.setAttribute('data-action', config.action);

        var iconHtml = config.icon && config.icon.indexOf('icon-') === 0
            ? '<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;"><use href="#' + escapeAttr(config.icon) + '"></use></svg>'
            : escapeHtml(config.icon || '☰');

        btn.innerHTML = [
            '<span class="dropdown-icon" style="display:flex;align-items:center;flex-shrink:0;">' + iconHtml + '</span>',
            '<span class="btn-text-wrapper" style="display:flex;align-items:center;gap:var(--rw-btn-gap-active, 4px);min-width:0;overflow:hidden;">',
            '    <span class="dropdown-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">' + escapeHtml(config.label || '') + '</span>',
            '    <span class="dropdown-arrow" style="font-size:8px;flex-shrink:0;opacity:var(--rw-label-opacity, 1);">▼</span>',
            '</span>'
        ].join('');

        btn.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'gap:var(--rw-btn-gap-active, 4px)',
            'padding:0 var(--rw-btn-pad-x, 8px)',
            'height:22px',
            'min-height:22px',
            'border-width:1px',
            'border-style:solid',
            'border-color:var(--border-color, rgba(200, 184, 154, 0.12))',
            'border-radius:4px',
            'background:var(--bg-hover, rgba(40, 40, 40, 0.4))',
            'color:var(--text-secondary, #a09888)',
            'font-size:10px',
            'font-weight:500',
            'cursor:pointer',
            'transition:background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
            'white-space:nowrap',
            'font-family:inherit',
            'flex-shrink:0',
            'user-select:none',
            'overflow:hidden',
            'box-sizing:border-box'
        ].join(';');

        var dropdown = document.createElement('div');
        dropdown.className = 'window-dropdown menu-dropdown';
        if (ctx.header._id != null) dropdown.dataset.windowId = String(ctx.header._id);
        if (config.id) dropdown.dataset.dropdownId = config.id;
        dropdown.style.cssText = [
            'position:fixed',
            'background:var(--bg-panel, #1a1a1a)',
            'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
            'border-radius:var(--radius, 6px)',
            'padding:4px 0',
            'min-width:100px',
            'max-width:320px',
            'width:max-content',
            'z-index:999999',
            'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
            'backdrop-filter:blur(12px)',
            'display:none',
            'opacity:0',
            'transform:translateY(-8px) scale(0.98)',
            'transition:opacity 0.15s ease, transform 0.15s ease',
            'max-height:500px',
            'overflow-y:auto'
        ].join(';');

        var resolveItems = function() {
            var items = config.items;
            if (typeof items === 'function') {
                try {
                    var bw = ctx.baseWindow;
                    var real = bw && typeof bw.getRealInstance === 'function'
                        ? bw.getRealInstance()
                        : bw;
                    items = items(real, bw, ctx.layoutManager);
                } catch (e) {
                    console.warn('[HeaderController] dropdown items() error:', e);
                    items = [];
                }
            }
            return Array.isArray(items) ? items : [];
        };

        var renderItems = function() {
            var items = resolveItems();
            self._renderDropdownItems(dropdown, items, config);
        };

        renderItems();

        wrapper.appendChild(btn);
        document.body.appendChild(dropdown);

        var closeDropdown = function() {
            dropdown.style.display = 'none';
            dropdown.style.opacity = '0';
            btn.classList.remove('active');
            var arrow = btn.querySelector('.dropdown-arrow');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        };

        var openDropdown = function() {
            renderItems();
            dropdown.style.display = 'block';
            dropdown.style.opacity = '0';
            self.positionDropdown(dropdown, btn);
            requestAnimationFrame(function() {
                dropdown.style.opacity = '1';
                dropdown.style.transform = 'translateY(0) scale(1)';
            });
            btn.classList.add('active');
            var arrow = btn.querySelector('.dropdown-arrow');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        };

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();

            document.querySelectorAll('.menu-dropdown').forEach(function(el) {
                if (el !== dropdown) {
                    el.style.display = 'none';
                    el.style.opacity = '0';
                }
            });

            var isOpen = dropdown.style.display === 'block';
            if (isOpen) closeDropdown();
            else openDropdown();
        });

        var closeHandler = function(e) {
            if (dropdown.style.display !== 'block') return;
            if (wrapper.contains(e.target)) return;
            if (dropdown.contains(e.target)) return;
            closeDropdown();
        };
        document.addEventListener('click', closeHandler);

        var repositionHandler = function() {
            if (dropdown.style.display === 'block') self.positionDropdown(dropdown, btn);
        };
        window.addEventListener('resize', repositionHandler);
        window.addEventListener('scroll', repositionHandler, true);

        var cleanup = function() {
            document.removeEventListener('click', closeHandler);
            window.removeEventListener('resize', repositionHandler);
            window.removeEventListener('scroll', repositionHandler, true);
            if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        };

        wrapper._cleanup = cleanup;
        wrapper._refreshItems = function() {
            if (dropdown.style.display === 'block') renderItems();
        };
        wrapper._closeDropdown = closeDropdown;

        if (self._dropdownWrappers) {
            self._dropdownWrappers.push({ el: wrapper, cleanup: cleanup });
        }

        return wrapper;
    }

    HeaderController.prototype._renderDropdownItems = function(container, items, config) {
        if (!Array.isArray(items)) return;
        container.innerHTML = '';

        var self = this;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item) continue;

            if (item.header) {
                var header = document.createElement('div');
                header.className = 'dropdown-header';
                header.style.cssText = [
                    'padding:6px 14px 4px 14px',
                    'font-size:10px',
                    'font-weight:600',
                    'color:var(--text-muted, rgba(200, 184, 154, 0.35))',
                    'text-transform:uppercase',
                    'letter-spacing:0.5px',
                    'border-bottom:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                    'margin-bottom:2px',
                    'pointer-events:none'
                ].join(';');
                header.textContent = item.header;
                container.appendChild(header);
                continue;
            }

            if (item.divider) {
                var divider = document.createElement('hr');
                divider.style.cssText = [
                    'border:none',
                    'border-top:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                    'margin:4px 12px',
                    'opacity:0.3'
                ].join(';');
                container.appendChild(divider);
                continue;
            }

            var btn = document.createElement('button');
            btn.className = 'dropdown-item';
            btn.dataset.action = item.action || '';
            btn.dataset.value = (item.value !== undefined && item.value !== null) ? String(item.value) : '';
            btn.setAttribute('type', 'button');

            var isActive = item.check || false;
            var isDanger = item.danger || false;
            var isDisabled = item.disabled || false;

            var iconHtml = item.icon && item.icon.indexOf('icon-') === 0
                ? '<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;"><use href="#' + escapeAttr(item.icon) + '"></use></svg>'
                : (item.icon ? '<span style="font-size:14px;flex-shrink:0;">' + escapeHtml(item.icon) + '</span>' : '');

            var shortcutHtml = item.shortcut
                ? '<span class="item-shortcut" style="color:var(--text-muted, rgba(200,184,154,0.35));font-size:9px;flex-shrink:0;">' + escapeHtml(item.shortcut) + '</span>'
                : '';

            var checkHtml = isActive
                ? '<span class="dropdown-check" style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>'
                : '';

            btn.innerHTML = [
                iconHtml,
                '<span class="item-label" style="flex:1;text-align:left;">' + escapeHtml(item.label || '') + '</span>',
                shortcutHtml,
                checkHtml
            ].join('');

            btn.style.cssText = [
                'display:flex',
                'align-items:center',
                'gap:8px',
                'width:100%',
                'padding:6px 14px',
                'border:none',
                'background:' + (isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent'),
                'color:' + (isDanger ? 'var(--accent-red, #cc2233)' : 'var(--text-primary, #e0d8cc)'),
                'font-size:12px',
                'cursor:' + (isDisabled ? 'default' : 'pointer'),
                'text-align:left',
                'transition:background 0.15s ease',
                'font-family:inherit',
                'opacity:' + (isDisabled ? '0.4' : '1'),
                'border-left:' + (isActive ? '3px solid var(--accent-red, #cc2233)' : '3px solid transparent'),
                'outline:none'
            ].join(';');

            if (!isDisabled) {
                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent';
                });
            }

            btn.addEventListener('click', (function(capturedItem, capturedBtn) {
                return function(e) {
                    e.stopPropagation();
                    e.preventDefault();

                    if (capturedBtn.disabled) return;

                    var action = capturedBtn.dataset.action || '';
                    var value = capturedBtn.dataset.value || '';

                    if (capturedItem.callback && typeof capturedItem.callback === 'function') {
                        try {
                            capturedItem.callback(self._baseWindow, capturedItem);
                        } catch (err) {
                            console.error('[HeaderController] dropdown item callback error:', err);
                        }
                    }

                    self._emit('menu-action', {
                        windowId: self._id,
                        action: action,
                        value: value,
                        payload: capturedItem.payload !== undefined ? capturedItem.payload : null,
                        item: capturedItem
                    });

                    container.style.display = 'none';
                    container.style.opacity = '0';
                };
            })(item, btn));

            container.appendChild(btn);
        }
    };

    // ============================================================
    // 6. POSITION DROPDOWN
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
    // 7. DRAG-SWAP ОКОН
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
    // 8. СОБЫТИЯ
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
    // 9. DESTROY
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