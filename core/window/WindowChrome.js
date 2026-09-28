// core/window/WindowChrome.js
// Версия 5.1.0

(function() {
    'use strict';

    var HEADER_HEIGHT = 28;

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

    function isSvgIcon(v) {
        return typeof v === 'string' && v.indexOf('icon-') === 0;
    }

    function WindowChrome(config) {
        config = config || {};

        this._container = config.container || null;
        this._baseWindow = config.baseWindow || null;
        this._layoutManager = config.layoutManager || null;
        this._registry = config.registry || null;

        this._id = config.id || (this._baseWindow && this._baseWindow.id) || null;
        this._type = config.type || (this._baseWindow && this._baseWindow.type) || 'window';
        this._title = config.title || 'Window';
        this._icon = config.icon || '📄';

        this._isDestroyed = false;
        this._isFullscreen = false;
        this._windowCount = 1;

        this._listeners = {};

        this._root = null;
        this._header = null;
        this._headerIcon = null;
        this._headerLeft = null;
        this._titleEl = null;
        this._headerItems = null;
        this._content = null;

        this._resizeObserver = null;
        this._resizeRAF = null;
        this._resizeTimeout = null;
        this._lastSize = { width: 0, height: 0, dpr: 1 };
        this._zeroAttempts = 0;
        this._maxZeroAttempts = 10;

        this._headerRAF = null;

        this._itemsFullW = 0;
        this._itemsMinW = 0;

        this._buildDOM();
        this._setupResizeObserver();
    }

    // ============================================================
    // 1. DOM
    // ============================================================

    WindowChrome.prototype._buildDOM = function() {
        if (!this._container) return;

        this._container.innerHTML = '';

        this._root = document.createElement('div');
        this._root.className = 'window-root';
        this._root.dataset.windowId = this._id != null ? String(this._id) : '';
        this._root.dataset.windowType = this._type;

        this._root.style.cssText = [
            'display:flex',
            'flex-direction:column',
            'width:100%',
            'height:100%',
            'background:var(--bg-panel, #1a1a1a)',
            'border-radius:var(--radius, 6px)',
            'overflow:hidden',
            'position:relative',
            'box-sizing:border-box',
            'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
            'transition:border-color 0.2s ease, box-shadow 0.2s ease'
        ].join(';');

        this._buildHeader();
        this._buildContent();

        this._container.appendChild(this._root);
    };

    WindowChrome.prototype._buildHeader = function() {
        this._header = document.createElement('div');
        this._header.className = 'window-header';
        if (this._id != null) this._header.dataset.windowId = String(this._id);

        this._header.style.cssText = [
            'display:flex',
            'align-items:center',
            'flex-shrink:0',
            'background:var(--bg-card, #222222)',
            'border-bottom:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
            'user-select:none',
            'position:relative',
            'box-sizing:border-box',
            'overflow:hidden',
            'height:' + HEADER_HEIGHT + 'px',
            'padding:0 6px',
            'gap:6px',
            'font-size:10px'
        ].join(';');

        this._headerIcon = document.createElement('span');
        this._headerIcon.className = 'window-icon';
        this._headerIcon.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'flex:0 0 auto',
            'width:16px',
            'height:16px',
            'min-width:16px',
            'max-width:16px',
            'pointer-events:none',
            'overflow:visible'
        ].join(';');
        this._renderIcon();

        this._headerLeft = document.createElement('div');
        this._headerLeft.className = 'window-header-left';
        this._headerLeft.style.cssText = [
            'display:flex',
            'align-items:center',
            'flex:1 1 0',
            'min-width:0',
            'overflow:hidden',
            'height:100%',
            'line-height:1'
        ].join(';');

        this._titleEl = document.createElement('span');
        this._titleEl.className = 'window-title';
        this._titleEl.style.cssText = [
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'font-size:11px',
            'font-weight:600',
            'color:var(--beige, #e0d8cc)',
            'flex:1 1 auto',
            'min-width:0',
            'line-height:13px',
            'height:13px',
            'transform:translateZ(0)',
            'backface-visibility:hidden',
            '-webkit-font-smoothing:antialiased',
            '-moz-osx-font-smoothing:grayscale'
        ].join(';');
        this._titleEl.textContent = this._title;
        this._titleEl.title = this._title;
        this._headerLeft.appendChild(this._titleEl);

        this._headerItems = document.createElement('div');
        this._headerItems.className = 'window-header-items';
        this._headerItems.style.cssText = [
            'display:flex',
            'justify-content:flex-end',
            'align-items:center',
            'flex:0 1 auto',
            'min-width:0',
            'gap:4px',
            'overflow:hidden',
            'height:100%'
        ].join(';');

        this._header.appendChild(this._headerIcon);
        this._header.appendChild(this._headerLeft);
        this._header.appendChild(this._headerItems);

        this._root.appendChild(this._header);
    };

    WindowChrome.prototype._buildContent = function() {
        this._content = document.createElement('div');
        this._content.className = 'window-content';
        if (this._id != null) this._content.id = 'window-content-' + this._id;

        this._content.style.cssText = [
            'flex:1 1 auto',
            'overflow:hidden',
            'padding:0',
            'margin:0',
            'background:var(--bg-dark, #0d0d0d)',
            'position:relative',
            'display:flex',
            'flex-direction:column',
            'min-height:0',
            'min-width:0',
            'width:100%'
        ].join(';');

        this._root.appendChild(this._content);
    };

    WindowChrome.prototype._renderIcon = function() {
        if (!this._headerIcon) return;

        if (isSvgIcon(this._icon)) {
            this._headerIcon.innerHTML = [
                '<svg class="icon-svg" style="width:100%;height:100%;fill:currentColor;display:block;">',
                '    <use href="#' + escapeAttr(this._icon) + '"></use>',
                '</svg>'
            ].join('');
        } else {
            this._headerIcon.innerHTML = '';
            this._headerIcon.textContent = this._icon || '📄';
            this._headerIcon.style.fontSize = '14px';
            this._headerIcon.style.lineHeight = '1';
        }
    };

    // ============================================================
    // 2. RESIZE
    // ============================================================

    WindowChrome.prototype._setupResizeObserver = function() {
        if (typeof ResizeObserver === 'undefined') return;

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        var self = this;
        this._resizeObserver = new ResizeObserver(function() {
            self._scheduleResize();
        });

        if (this._root) this._resizeObserver.observe(this._root);
        if (this._container) this._resizeObserver.observe(this._container);
    };

    WindowChrome.prototype._scheduleResize = function() {
        if (this._isDestroyed) return;
        if (this._resizeRAF) return;

        var self = this;
        this._resizeRAF = requestAnimationFrame(function() {
            self._resizeRAF = null;
            self._performResize();
        });
    };

    WindowChrome.prototype._performResize = function() {
        if (this._isDestroyed) return;

        var width = 0;
        var height = 0;

        if (this._root) {
            width = this._root.clientWidth || 0;
            height = this._root.clientHeight || 0;
        }

        if (width === 0 || height === 0) {
            this._zeroAttempts++;
            if (this._zeroAttempts > this._maxZeroAttempts) {
                this._zeroAttempts = 0;
                return;
            }
            this._scheduleResize();
            return;
        }

        this._zeroAttempts = 0;

        var dpr = window.devicePixelRatio || 1;

        if (this._lastSize.width === width
            && this._lastSize.height === height
            && this._lastSize.dpr === dpr) {
            this._scheduleHeaderAdaptive();
            return;
        }

        this._lastSize = { width: width, height: height, dpr: dpr };

        this._scheduleHeaderAdaptive();

        this._emit('resize', {
            windowId: this._id,
            width: width,
            height: height
        });
    };

    WindowChrome.prototype.resize = function() {
        this._scheduleResize();
    };

    // ============================================================
    // 3. ADAPTIVE HEADER
    // ============================================================

    WindowChrome.prototype._scheduleHeaderAdaptive = function() {
        if (this._headerRAF) {
            cancelAnimationFrame(this._headerRAF);
            this._headerRAF = null;
        }
        var self = this;
        this._headerRAF = requestAnimationFrame(function() {
            self._headerRAF = null;
            self.updateHeaderAdaptive();
        });
    };

    WindowChrome.prototype.updateHeaderAdaptive = function() {
        if (!this._header || !this._headerItems || this._isDestroyed) return;

        var headerW = this._header.clientWidth || 0;
        if (headerW === 0) return;

        var iconW = 16;
        var fullW = this._itemsFullW || 0;
        var minW = this._itemsMinW || 0;

        var itemsW = this._headerItems.clientWidth || 0;

        var ratio;
        if (fullW <= minW) {
            ratio = itemsW >= fullW ? 1 : 0;
        } else {
            var range = fullW - minW;
            ratio = (itemsW - minW) / range;
            ratio = Math.max(0, Math.min(1, ratio));
        }

        var GAMMA = 2.2;
        var k = Math.pow(ratio, GAMMA);

        var padXLerp = Math.round(4 + (8 - 4) * k);
        var gapActiveLerp = Math.round(0 + (4 - 0) * k);
        var labelOpacity = ratio === 0 ? 0 : Math.max(0, Math.min(1, ratio * 1.6));
        var labelMaxW = Math.round(80 * Math.min(1, ratio * 1.6));

        this._header.style.setProperty('--rw-btn-pad-x', padXLerp + 'px');
        this._header.style.setProperty('--rw-btn-gap-active', gapActiveLerp + 'px');
        this._header.style.setProperty('--rw-label-opacity', labelOpacity.toFixed(3));
        this._header.style.setProperty('--rw-label-maxw', labelMaxW + 'px');

        this._headerIcon.style.width = iconW + 'px';
        this._headerIcon.style.height = iconW + 'px';
        this._headerIcon.style.minWidth = iconW + 'px';
        this._headerIcon.style.maxWidth = iconW + 'px';
    };

    WindowChrome.prototype.measureBaseWidths = function() {
        if (!this._header || !this._headerItems) return;

        var vars = [
            '--rw-btn-gap-active',
            '--rw-btn-pad-x',
            '--rw-label-opacity',
            '--rw-label-maxw'
        ];

        var prevVars = {};
        for (var i = 0; i < vars.length; i++) {
            prevVars[vars[i]] = this._header.style.getPropertyValue(vars[i]);
        }

        var prevMaxWidth = this._headerItems.style.maxWidth;
        var prevMinWidth = this._headerItems.style.minWidth;

        this._headerItems.style.maxWidth = 'none';
        this._headerItems.style.minWidth = '0';

        this._header.style.setProperty('--rw-btn-gap-active', '4px');
        this._header.style.setProperty('--rw-btn-pad-x', '8px');
        this._header.style.setProperty('--rw-label-opacity', '1');
        this._header.style.setProperty('--rw-label-maxw', '80px');

        void this._headerItems.offsetWidth;

        var itemsStyle = getComputedStyle(this._headerItems);
        var gapPx = parseFloat(itemsStyle.gap) || 0;

        var fullW = 0;
        var visible = 0;
        var children = Array.from(this._headerItems.children);

        for (var j = 0; j < children.length; j++) {
            var el = children[j];
            if (el.style.display === 'none') continue;
            var r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            visible++;
            fullW += r.width;
        }
        fullW += gapPx * Math.max(0, visible - 1);
        this._itemsFullW = Math.ceil(fullW);

        var btnHBase = 22;
        this._itemsMinW = visible > 0
            ? visible * btnHBase + Math.max(0, visible - 1) * gapPx
            : 0;
        this._itemsMinW = Math.ceil(this._itemsMinW);

        for (var m = 0; m < vars.length; m++) {
            if (prevVars[vars[m]]) {
                this._header.style.setProperty(vars[m], prevVars[vars[m]]);
            } else {
                this._header.style.removeProperty(vars[m]);
            }
        }

        this._headerItems.style.maxWidth = prevMaxWidth || '';
        this._headerItems.style.minWidth = '0';

        void this._headerItems.offsetWidth;
    };

    // ============================================================
    // 4. СОСТОЯНИЕ
    // ============================================================

    WindowChrome.prototype.setFullscreenState = function(isFullscreen) {
        var next = !!isFullscreen;
        if (this._isFullscreen === next) return;

        this._isFullscreen = next;

        if (this._root) {
            this._root.classList.toggle('is-fullscreen', next);
        }
    };

    WindowChrome.prototype.isFullscreen = function() {
        return !!this._isFullscreen;
    };

    WindowChrome.prototype.updateWindowCount = function() {
        var count = this._layoutManager ? this._layoutManager.getWindowCount() : 1;
        if (count !== this._windowCount) {
            this._windowCount = count;
            this._emit('window-count-changed', { count: count });
        }
    };

    WindowChrome.prototype.getWindowCount = function() {
        return this._windowCount;
    };

    // ============================================================
    // 5. ПУБЛИЧНОЕ API
    // ============================================================

    WindowChrome.prototype.setTitle = function(title) {
        this._title = title != null ? String(title) : 'Window';
        if (this._titleEl) {
            this._titleEl.textContent = this._title;
            this._titleEl.title = this._title;
        }
        this._scheduleHeaderAdaptive();
        return this;
    };

    WindowChrome.prototype.getTitle = function() {
        return this._title;
    };

    WindowChrome.prototype.setIcon = function(icon) {
        this._icon = icon || '📄';
        this._renderIcon();
        return this;
    };

    WindowChrome.prototype.getIcon = function() {
        return this._icon;
    };

    WindowChrome.prototype.setContent = function(contentEl) {
        if (!this._content) return;

        if (this._content.__lsResizeObserver) {
            try { this._content.__lsResizeObserver.disconnect(); } catch (e) {}
            this._content.__lsResizeObserver = null;
        }

        this._content.innerHTML = '';

        if (!contentEl) {
            this._renderPlaceholder();
            return;
        }

        contentEl.style.position = 'absolute';
        contentEl.style.top = '0';
        contentEl.style.left = '0';
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
        contentEl.style.boxSizing = 'border-box';
        contentEl.style.overflow = 'hidden';

        this._content.appendChild(contentEl);

        var contentW = this._content.clientWidth;
        var contentH = this._content.clientHeight;
        if (contentW > 0 && contentH > 0) {
            contentEl.style.width = contentW + 'px';
            contentEl.style.height = contentH + 'px';
        }

        var bw = this._baseWindow;
        var realInstance = bw && typeof bw.getRealInstance === 'function'
            ? bw.getRealInstance()
            : null;

        if (typeof ResizeObserver !== 'undefined' && realInstance
            && typeof realInstance.resize === 'function') {
            var self = this;
            var raf = null;
            var observer = new ResizeObserver(function() {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(function() {
                    raf = null;
                    var w = self._content.clientWidth;
                    var h = self._content.clientHeight;
                    if (w > 0 && h > 0) {
                        contentEl.style.width = w + 'px';
                        contentEl.style.height = h + 'px';
                    }
                    try { realInstance.resize(); } catch (e) {}
                });
            });
            observer.observe(this._content);
            this._content.__lsResizeObserver = observer;
        }
    };

    WindowChrome.prototype._renderPlaceholder = function() {
        if (!this._content) return;

        this._content.innerHTML = '';

        var placeholder = document.createElement('div');
        placeholder.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'height:100%',
            'width:100%',
            'color:var(--text-muted, rgba(200, 184, 154, 0.35))',
            'font-size:14px',
            'flex-direction:column',
            'gap:8px'
        ].join(';');

        var iconHtml = isSvgIcon(this._icon)
            ? '<svg class="icon-svg" style="width:48px;height:48px;fill:currentColor;opacity:0.3;"><use href="#' + escapeAttr(this._icon) + '"></use></svg>'
            : '<div style="font-size:48px;opacity:0.3;">' + escapeHtml(this._icon || '📄') + '</div>';

        placeholder.innerHTML = [
            iconHtml,
            '<div style="color:var(--text-secondary, rgba(200,184,154,0.7));">' + escapeHtml(this._title) + '</div>',
            '<div style="font-size:11px;opacity:0.5;color:var(--text-muted, rgba(200,184,154,0.35));">Ready</div>'
        ].join('');

        this._content.appendChild(placeholder);
    };

    WindowChrome.prototype.refresh = function() {
        if (this._isDestroyed) return;
        this._renderIcon();
        if (this._titleEl) {
            this._titleEl.textContent = this._title;
            this._titleEl.title = this._title;
        }
        this._scheduleHeaderAdaptive();
        this._scheduleResize();
    };

    // ============================================================
    // 6. GETTERS
    // ============================================================

    WindowChrome.prototype.getRoot = function() { return this._root; };
    WindowChrome.prototype.getHeader = function() { return this._header; };
    WindowChrome.prototype.getContent = function() { return this._content; };
    WindowChrome.prototype.getHeaderIcon = function() { return this._headerIcon; };
    WindowChrome.prototype.getHeaderLeft = function() { return this._headerLeft; };
    WindowChrome.prototype.getHeaderItemsEl = function() { return this._headerItems; };
    WindowChrome.prototype.getTitleEl = function() { return this._titleEl; };
    WindowChrome.prototype.getContainer = function() { return this._container; };
    WindowChrome.prototype.getId = function() { return this._id; };
    WindowChrome.prototype.getType = function() { return this._type; };
    WindowChrome.prototype.isDestroyed = function() { return this._isDestroyed; };

    // ============================================================
    // 7. СОБЫТИЯ
    // ============================================================

    WindowChrome.prototype.on = function(event, cb) {
        if (typeof cb !== 'function') return function() {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);

        var self = this;
        return function() { self.off(event, cb); };
    };

    WindowChrome.prototype.off = function(event, cb) {
        var arr = this._listeners[event];
        if (!arr) return;
        var i = arr.indexOf(cb);
        if (i !== -1) arr.splice(i, 1);
    };

    WindowChrome.prototype._emit = function(event, data) {
        var arr = this._listeners[event];
        if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](data); } catch (e) {
                console.error('[WindowChrome] listener error (' + event + '):', e);
            }
        }
    };

    // ============================================================
    // 8. DESTROY
    // ============================================================

    WindowChrome.prototype.destroy = function() {
        if (this._isDestroyed) return;
        this._isDestroyed = true;

        if (this._resizeObserver) {
            try { this._resizeObserver.disconnect(); } catch (e) {}
            this._resizeObserver = null;
        }
        if (this._resizeRAF) {
            cancelAnimationFrame(this._resizeRAF);
            this._resizeRAF = null;
        }
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }
        if (this._headerRAF) {
            cancelAnimationFrame(this._headerRAF);
            this._headerRAF = null;
        }

        if (this._content && this._content.__lsResizeObserver) {
            try { this._content.__lsResizeObserver.disconnect(); } catch (e) {}
            this._content.__lsResizeObserver = null;
        }

        if (this._container) this._container.innerHTML = '';

        this._root = null;
        this._header = null;
        this._headerIcon = null;
        this._headerLeft = null;
        this._titleEl = null;
        this._headerItems = null;
        this._content = null;

        this._listeners = {};
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { WindowChrome: WindowChrome };
    }

    if (typeof window !== 'undefined') {
        window.WindowChrome = WindowChrome;
    }

})();