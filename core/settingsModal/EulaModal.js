// core/settingsModal/EulaModal.js
// Версия 2.0.0

(function() {
    'use strict';

    var EULA_MD_PATH = 'EULA.md';
    var EULA_HTML_PATH = 'core/settingsModal/EulaModal.html';

    var FALLBACK_TEXT = '# Соглашение о неразглашении (EULA)\n\nНе удалось загрузить текст соглашения.\n';

    var _htmlCache = null;
    var _htmlPromise = null;
    var _mdCache = null;
    var _mdPromise = null;

    function loadHtml() {
        if (_htmlCache) return Promise.resolve(_htmlCache);
        if (_htmlPromise) return _htmlPromise;

        _htmlPromise = fetch(EULA_HTML_PATH)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('EulaModal.html status: ' + response.status);
                }
                return response.text();
            })
            .then(function(html) {
                _htmlCache = html;
                _htmlPromise = null;
                return html;
            })
            .catch(function(err) {
                _htmlPromise = null;
                console.error('[EulaModal] Failed to load HTML:', err);
                return null;
            });

        return _htmlPromise;
    }

    function loadMarkdown() {
        if (_mdCache) return Promise.resolve(_mdCache);
        if (_mdPromise) return _mdPromise;

        _mdPromise = fetch(EULA_MD_PATH)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('EULA.md status: ' + response.status);
                }
                return response.text();
            })
            .then(function(md) {
                _mdCache = md;
                _mdPromise = null;
                return md;
            })
            .catch(function(err) {
                console.warn('[EulaModal] Failed to load EULA.md, using fallback:', err);
                _mdCache = FALLBACK_TEXT;
                _mdPromise = null;
                return FALLBACK_TEXT;
            });

        return _mdPromise;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderMarkdown(md) {
        if (!md) return '';

        var lines = md.split('\n');
        var html = [];
        var inUl = false;
        var inOl = false;
        var paragraph = [];

        function flushParagraph() {
            if (paragraph.length > 0) {
                html.push('<p>' + paragraph.join(' ') + '</p>');
                paragraph = [];
            }
        }

        function closeLists() {
            if (inUl) { html.push('</ul>'); inUl = false; }
            if (inOl) { html.push('</ol>'); inOl = false; }
        }

        function inline(text) {
            var t = escapeHtml(text);
            t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            t = t.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
            t = t.replace(/`([^`]+?)`/g, '<code>$1</code>');
            return t;
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();

            if (trimmed === '') {
                flushParagraph();
                closeLists();
                continue;
            }

            if (/^---+$/.test(trimmed)) {
                flushParagraph();
                closeLists();
                html.push('<hr>');
                continue;
            }

            var hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (hMatch) {
                flushParagraph();
                closeLists();
                var level = hMatch[1].length;
                html.push('<h' + level + '>' + inline(hMatch[2]) + '</h' + level + '>');
                continue;
            }

            var olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
            if (olMatch) {
                flushParagraph();
                if (inUl) { html.push('</ul>'); inUl = false; }
                if (!inOl) { html.push('<ol>'); inOl = true; }
                html.push('<li>' + inline(olMatch[1]) + '</li>');
                continue;
            }

            var ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
            if (ulMatch) {
                flushParagraph();
                if (inOl) { html.push('</ol>'); inOl = false; }
                if (!inUl) { html.push('<ul>'); inUl = true; }
                html.push('<li>' + inline(ulMatch[1]) + '</li>');
                continue;
            }

            paragraph.push(inline(trimmed));
        }

        flushParagraph();
        closeLists();

        return html.join('\n');
    }

    function EulaModal(options) {
        options = options || {};

        this._overlay = null;
        this._isOpen = false;
        this._onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this._listeners = [];
        this._eulaText = FALLBACK_TEXT;
        this._htmlLoaded = false;
        this._mdLoaded = false;

        this._init();
    }

    EulaModal.prototype._init = function() {
        var self = this;

        var existing = document.getElementById('eulaModalOverlay');
        if (existing) {
            this._overlay = existing;
            this._htmlLoaded = true;
            this._finishInit();
            return;
        }

        loadHtml().then(function(html) {
            if (!html) {
                console.error('[EulaModal] Cannot initialize without HTML');
                return;
            }

            var tmp = document.createElement('div');
            tmp.innerHTML = html.trim();

            var overlay = tmp.querySelector('#eulaModalOverlay');
            if (!overlay) {
                console.error('[EulaModal] Overlay not found in HTML');
                return;
            }

            document.body.appendChild(overlay);

            self._overlay = overlay;
            self._htmlLoaded = true;
            self._finishInit();
        });
    };

    EulaModal.prototype._finishInit = function() {
        var self = this;

        this._bindEvents();

        loadMarkdown().then(function(md) {
            self._eulaText = md || FALLBACK_TEXT;
            self._mdLoaded = true;
            self._renderContent();
        });
    };

    EulaModal.prototype._renderContent = function() {
        if (!this._overlay) return;
        var content = this._overlay.querySelector('#eulaModalContent');
        if (!content) return;
        content.innerHTML = renderMarkdown(this._eulaText);
    };

    EulaModal.prototype._bindEvents = function() {
        var self = this;
        var overlay = this._overlay;

        var onOverlayClick = function(e) {
            if (e.target === overlay) self.close();
        };
        overlay.addEventListener('click', onOverlayClick);

        var closeBtn = overlay.querySelector('#eulaModalCloseBtn');
        var closeBtnBottom = overlay.querySelector('#eulaModalCloseBtnBottom');
        var downloadBtn = overlay.querySelector('#eulaModalDownloadBtn');

        var onCloseBtn = function() { self.close(); };
        var onDownload = function() { self.download(); };

        if (closeBtn) closeBtn.addEventListener('click', onCloseBtn);
        if (closeBtnBottom) closeBtnBottom.addEventListener('click', onCloseBtn);
        if (downloadBtn) downloadBtn.addEventListener('click', onDownload);

        this._listeners.push(function() {
            overlay.removeEventListener('click', onOverlayClick);
            if (closeBtn) closeBtn.removeEventListener('click', onCloseBtn);
            if (closeBtnBottom) closeBtnBottom.removeEventListener('click', onCloseBtn);
            if (downloadBtn) downloadBtn.removeEventListener('click', onDownload);
        });
    };

    EulaModal.prototype.open = function() {
        if (this._isOpen) return;

        if (!this._htmlLoaded || !this._overlay) {
            var self = this;
            loadHtml().then(function(html) {
                if (!html) return;
                if (!self._overlay) {
                    var tmp = document.createElement('div');
                    tmp.innerHTML = html.trim();
                    var overlay = tmp.querySelector('#eulaModalOverlay');
                    if (!overlay) return;
                    document.body.appendChild(overlay);
                    self._overlay = overlay;
                    self._htmlLoaded = true;
                    self._finishInit();
                }
                self.open();
            });
            return;
        }

        if (!this._mdLoaded) {
            var self2 = this;
            loadMarkdown().then(function(md) {
                self2._eulaText = md || FALLBACK_TEXT;
                self2._mdLoaded = true;
                self2._renderContent();
                self2.open();
            });
            return;
        }

        this._isOpen = true;
        this._overlay.classList.add('is-open');

        var body = this._overlay.querySelector('#eulaModalBody');
        if (body) {
            body.scrollTop = 0;
            setTimeout(function() {
                try { body.focus(); } catch (e) {}
            }, 250);
        }
    };

    EulaModal.prototype.close = function() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._overlay.classList.remove('is-open');

        if (this._onClose) {
            try { this._onClose(); } catch (e) {}
        }
    };

    EulaModal.prototype.isOpen = function() {
        return this._isOpen;
    };

    EulaModal.prototype.download = function() {
        try {
            var text = this._eulaText || FALLBACK_TEXT;
            var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'EULA.md';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

            if (window.__lsystem) {
                window.__lsystem.showNotification('EULA.md скачан', 'success');
            }
        } catch (e) {
            console.error('[EulaModal] download error:', e);
            if (window.__lsystem) {
                window.__lsystem.showNotification('Ошибка скачивания', 'error');
            }
        }
    };

    EulaModal.prototype.getText = function() {
        return this._eulaText || FALLBACK_TEXT;
    };

    EulaModal.prototype.destroy = function() {
        for (var i = 0; i < this._listeners.length; i++) {
            try { this._listeners[i](); } catch (e) {}
        }
        this._listeners = [];

        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._htmlLoaded = false;
        this._mdLoaded = false;
    };

    EulaModal.renderMarkdown = renderMarkdown;
    EulaModal.FALLBACK_TEXT = FALLBACK_TEXT;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EulaModal: EulaModal,
            renderMarkdown: renderMarkdown
        };
    }

    if (typeof window !== 'undefined') {
        window.EulaModal = EulaModal;
        window.EulaModal.renderMarkdown = renderMarkdown;
    }

})();