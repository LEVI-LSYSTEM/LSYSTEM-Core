// core/settingsModal/SettingsModal.js
// Версия 18.0.0

(function() {
    'use strict';

    var SETTINGS_HTML_PATH = 'core/settingsModal/SettingsModal.html';

    var _htmlCache = null;
    var _htmlPromise = null;

    function loadHtml() {
        if (_htmlCache) return Promise.resolve(_htmlCache);
        if (_htmlPromise) return _htmlPromise;

        _htmlPromise = fetch(SETTINGS_HTML_PATH)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('SettingsModal.html status: ' + response.status);
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
                console.error('[SettingsModal] Failed to load HTML:', err);
                return null;
            });

        return _htmlPromise;
    }

    function parseOverlay(html) {
        if (!html) return null;

        var trimmed = html.trim();

        try {
            var parser = new DOMParser();
            var doc = parser.parseFromString(trimmed, 'text/html');
            var node = doc.querySelector('#settingsModalOverlay');
            if (node) {
                return document.importNode(node, true);
            }
        } catch (e) {
            console.warn('[SettingsModal] DOMParser failed, trying innerHTML:', e);
        }

        try {
            var tmp = document.createElement('div');
            tmp.innerHTML = trimmed;
            var fallback = tmp.querySelector('#settingsModalOverlay');
            if (fallback) return fallback;
        } catch (e) {
            console.warn('[SettingsModal] innerHTML parse failed:', e);
        }

        return null;
    }

    function SettingsModal() {
        this._overlay = null;
        this._eula = null;
        this._isOpen = false;
        this._capturingCombo = null;
        this._captureHandler = null;
        this._closeHandlers = [];
        this._busUnsubs = [];
        this._nowTimer = null;

        this._pluginsTab = 'active';
        this._pluginsSearchQuery = '';

        this._htmlLoaded = false;
        this._init();
    }

    // ============================================================
    // 1. INIT
    // ============================================================

    SettingsModal.prototype._init = function() {
        var self = this;

        var existing = document.getElementById('settingsModalOverlay');
        if (existing) {
            this._overlay = existing;
            this._htmlLoaded = true;
            this._afterHtmlReady();
            return;
        }

        loadHtml().then(function(html) {
            if (!html) {
                console.error('[SettingsModal] Cannot initialize without HTML');
                return;
            }

            var overlay = parseOverlay(html);
            if (!overlay) {
                console.error('[SettingsModal] Overlay not found in HTML');
                return;
            }

            document.body.appendChild(overlay);

            self._overlay = overlay;
            self._htmlLoaded = true;
            self._afterHtmlReady();
        });
    };

    SettingsModal.prototype._afterHtmlReady = function() {
        this._eula = new window.EulaModal({
            onClose: function() {}
        });

        this._bindEvents();
        this._subscribePluginEvents();
    };

    // ============================================================
    // 2. PLUGIN EVENTS
    // ============================================================

    SettingsModal.prototype._subscribePluginEvents = function() {
        var self = this;
        var bus = window.eventBus;

        if (bus && typeof bus.on === 'function') {
            var onChange = function() {
                if (!self._isOpen) return;
                self._renderPlugins();
            };
            var onFolderChange = function() {
                if (!self._isOpen) return;
                self._renderWorkingFolder();
                self._renderPluginsFolderBanner();
            };
            var onPermissionNeeded = function() {
                if (!self._isOpen) return;
                self._renderPluginsFolderBanner();
            };

            this._busUnsubs.push(bus.on('plugins:changed', onChange));
            this._busUnsubs.push(bus.on('plugins:folder-changed', onFolderChange));
            this._busUnsubs.push(bus.on('plugins:folder-permission-needed', onPermissionNeeded));
            return;
        }

        var onChangeDom = function() {
            if (!self._isOpen) return;
            self._renderPlugins();
        };
        var onFolderChangeDom = function() {
            if (!self._isOpen) return;
            self._renderWorkingFolder();
            self._renderPluginsFolderBanner();
        };
        var onPermissionNeededDom = function() {
            if (!self._isOpen) return;
            self._renderPluginsFolderBanner();
        };

        document.addEventListener('plugins:changed', onChangeDom);
        document.addEventListener('plugins:folder-changed', onFolderChangeDom);
        document.addEventListener('plugins:folder-permission-needed', onPermissionNeededDom);

        this._busUnsubs.push(function() {
            document.removeEventListener('plugins:changed', onChangeDom);
            document.removeEventListener('plugins:folder-changed', onFolderChangeDom);
            document.removeEventListener('plugins:folder-permission-needed', onPermissionNeededDom);
        });
    };

    // ============================================================
    // 3. BIND EVENTS
    // ============================================================

    SettingsModal.prototype._bind = function(selector, event, handler) {
        var el = this._overlay.querySelector(selector);
        if (!el) {
            console.warn('[SettingsModal] element not found for binding:', selector);
            return null;
        }
        el.addEventListener(event, handler);
        return el;
    };

    SettingsModal.prototype._bindEvents = function() {
        var self = this;
        var overlay = this._overlay;

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) self.close();
        });

        this._bind('#settingsCloseBtn', 'click', function() { self.close(); });

        this._bind('#profileSaveBtn', 'click', function() { self._saveProfile(); });
        this._bind('#profileClearBtn', 'click', function() { self._clearProfile(); });
        this._bind('#profileExportBtn', 'click', function() { self._exportProfile(); });
        this._bind('#profileImportBtn', 'click', function() { self._importProfile(); });

        this._bind('#eulaDownloadBtn', 'click', function() {
            if (self._eula) self._eula.download();
        });
        this._bind('#eulaOpenBtn', 'click', function() {
            if (self._eula) self._eula.open();
        });

        this._bind('#profileName', 'input', function() { self._updateSaveState(); });

        this._bindThemeEvents();
        this._bindPluginsEvents();

        this._bind('#hotkeysResetBtn', 'click', function() { self._resetHotkeys(); });
        this._bind('#settingsApplyBtn', 'click', function() { self._applyAll(); });

        var onKeyDown = function(e) {
            if (e.key !== 'Escape') return;

            if (self._eula && self._eula.isOpen()) {
                e.preventDefault();
                e.stopPropagation();
                self._eula.close();
                return;
            }

            if (!self._isOpen) return;
            if (self._capturingCombo) return;

            e.preventDefault();
            e.stopPropagation();
            self.close();
        };
        document.addEventListener('keydown', onKeyDown, true);
        this._closeHandlers.push(function() {
            document.removeEventListener('keydown', onKeyDown, true);
        });
    };

    // ============================================================
    // 4. THEME EVENTS
    // ============================================================

    SettingsModal.prototype._bindThemeEvents = function() {
        var self = this;
        var overlay = this._overlay;

        var themeSwitch = overlay.querySelector('#themeSwitch');
        if (themeSwitch) {
            themeSwitch.addEventListener('click', function(e) {
                var btn = e.target.closest('.theme-switch__opt');
                if (!btn || !themeSwitch.contains(btn)) return;
                var mode = btn.dataset.mode;
                if (!mode || !window.appState) return;
                if (themeSwitch.dataset.mode === mode) return;

                window.appState.setThemeMode(mode);
                self._renderThemeMode();
            });

            themeSwitch.addEventListener('keydown', function(e) {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                var modes = ['auto', 'dark', 'light'];
                var idx = modes.indexOf(themeSwitch.dataset.mode);
                if (idx === -1) idx = 0;
                idx = (e.key === 'ArrowRight')
                    ? (idx + 1) % modes.length
                    : (idx - 1 + modes.length) % modes.length;
                if (window.appState) {
                    window.appState.setThemeMode(modes[idx]);
                    self._renderThemeMode();
                }
                e.preventDefault();
            });
        }

        var darkStartInput = overlay.querySelector('#themeDarkStart');
        var darkEndInput = overlay.querySelector('#themeDarkEnd');

        var applyHours = function() {
            if (!window.appState) return;
            var start = parseInt(darkStartInput.value, 10);
            var end = parseInt(darkEndInput.value, 10);
            if (isNaN(start) || isNaN(end)) return;
            start = Math.max(0, Math.min(23, start));
            end = Math.max(0, Math.min(23, end));
            darkStartInput.value = start;
            darkEndInput.value = end;
            window.appState.setAutoThemeHours({ darkStart: start, darkEnd: end });
            self._renderThemeTimeline(start, end);
        };

        if (darkStartInput) {
            darkStartInput.addEventListener('change', applyHours);
            darkStartInput.addEventListener('blur', applyHours);
        }
        if (darkEndInput) {
            darkEndInput.addEventListener('change', applyHours);
            darkEndInput.addEventListener('blur', applyHours);
        }
    };

    // ============================================================
    // 5. OPEN / CLOSE / TOGGLE
    // ============================================================

    SettingsModal.prototype.open = function() {
        if (!this._htmlLoaded || !this._overlay) {
            var self = this;
            loadHtml().then(function(html) {
                if (!html) return;
                if (!self._overlay) {
                    var overlay = parseOverlay(html);
                    if (!overlay) return;
                    document.body.appendChild(overlay);
                    self._overlay = overlay;
                    self._htmlLoaded = true;
                    self._afterHtmlReady();
                }
                self.open();
            });
            return;
        }

        this._isOpen = true;
        this._overlay.classList.add('is-open');

        this._renderProfile();
        this._renderThemeMode();
        this._renderHotkeys();
        this._renderWorkingFolder();
        this._renderPluginsFolderBanner();

        var self = this;
        var ps = window.pluginSystem;

        if (ps && typeof ps.loadAll === 'function') {
            Promise.resolve(ps.loadAll())
                .catch(function(err) {
                    console.warn('[SettingsModal] pluginSystem.loadAll failed:', err);
                })
                .then(function() {
                    if (!self._isOpen) return;
                    self._renderWorkingFolder();
                    self._renderPluginsFolderBanner();
                    self._renderPlugins();
                });
        } else {
            this._renderPlugins();
        }

        this._startNowTimer();

        setTimeout(function() {
            var inp = self._overlay.querySelector('#profileName');
            if (inp) inp.focus();
        }, 100);
    };

    SettingsModal.prototype.close = function() {
        if (!this._isOpen) return;

        this._isOpen = false;
        this._overlay.classList.remove('is-open');

        if (this._eula && this._eula.isOpen()) {
            this._eula.close();
        }
        this._cancelCapture();
        this._stopNowTimer();
    };

    SettingsModal.prototype.toggle = function() {
        if (this._isOpen) this.close();
        else this.open();
    };

    SettingsModal.prototype.isOpen = function() { return this._isOpen; };

    SettingsModal.prototype.isEulaOpen = function() {
        return !!(this._eula && this._eula.isOpen());
    };

    // ============================================================
    // 6. PROFILE
    // ============================================================

    SettingsModal.prototype._renderProfile = function() {
        var acc = window.appState ? window.appState.getAccount() : null;
        var nameEl = this._overlay.querySelector('#profileName');
        if (nameEl) nameEl.value = acc ? (acc.name || '') : '';
        this._updateSaveState();
    };

    SettingsModal.prototype._updateSaveState = function() {
        var saveBtn = this._overlay.querySelector('#profileSaveBtn');
        if (!saveBtn) return;
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
    };

    SettingsModal.prototype._saveProfile = function() {
        var nameEl = this._overlay.querySelector('#profileName');
        var name = (nameEl && nameEl.value || '').trim();

        var prev = window.appState ? window.appState.getAccount() : null;

        var payload = {
            id: (prev && prev.id) || ('u_' + Date.now().toString(36)),
            name: name
        };

        if (window.appState) window.appState.setAccount(payload);

        if (window.__lsystem) {
            var welcomeName = name || 'пользователь';
            window.__lsystem.showNotification('Профиль сохранён: ' + welcomeName, 'success');
        }

        return true;
    };

    SettingsModal.prototype._clearProfile = function() {
        if (window.appState) window.appState.clearAccount();
        this._renderProfile();
        if (window.__lsystem) window.__lsystem.showNotification('Профиль сброшен', 'info');
    };

    SettingsModal.prototype._exportProfile = function() {
        if (!window.appState) {
            if (window.__lsystem) window.__lsystem.showNotification('appState не загружен', 'error');
            return;
        }

        try {
            var name = '';
            var nameEl = this._overlay.querySelector('#profileName');
            if (nameEl) name = (nameEl.value || '').trim();

            var profile = window.appState.exportProfile({
                appName: 'LSYSTEM',
                appVersion: (window.__lsystem && window.__lsystem.version) || 'unknown',
                userLabel: name || null
            });

            var json = JSON.stringify(profile, null, 2);
            var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob);

            var ts = new Date();
            var pad = function(n) { return (n < 10 ? '0' : '') + n; };
            var stamp = ts.getFullYear() +
                pad(ts.getMonth() + 1) +
                pad(ts.getDate()) + '-' +
                pad(ts.getHours()) +
                pad(ts.getMinutes()) +
                pad(ts.getSeconds());

            var safeName = (name || 'profile')
                .replace(/[^\wа-яА-ЯёЁ\-]+/gi, '_')
                .slice(0, 32);

            var fileName = 'lsystem-profile_' + safeName + '_' + stamp + '.json';

            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

            if (window.__lsystem) {
                window.__lsystem.showNotification('Профиль экспортирован: ' + fileName, 'success');
            }
        } catch (e) {
            console.error('[SettingsModal] Export profile error:', e);
            if (window.__lsystem) {
                window.__lsystem.showNotification('Ошибка экспорта профиля', 'error');
            }
        }
    };

    SettingsModal.prototype._importProfile = function() {
        if (!window.appState) {
            if (window.__lsystem) window.__lsystem.showNotification('appState не загружен', 'error');
            return;
        }

        var self = this;

        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';

        input.addEventListener('change', function() {
            var file = input.files && input.files[0];
            if (!file) {
                if (input.parentNode) input.parentNode.removeChild(input);
                return;
            }

            var reader = new FileReader();

            reader.onload = function(ev) {
                var text = String(ev.target.result || '');
                var parsed;

                try {
                    parsed = JSON.parse(text);
                } catch (err) {
                    console.error('[SettingsModal] Import parse error:', err);
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Файл повреждён или не JSON', 'error');
                    }
                    if (input.parentNode) input.parentNode.removeChild(input);
                    return;
                }

                var res = window.appState.importProfile(parsed, { merge: false });

                if (!res.ok) {
                    console.warn('[SettingsModal] Import issues:', res.errors);
                    if (window.__lsystem) {
                        window.__lsystem.showNotification(
                            'Импорт с ошибками: ' + res.errors.join('; '),
                            'warning',
                            3500
                        );
                    }
                } else {
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Профиль импортирован', 'success');
                    }
                }

                self._renderProfile();
                self._renderThemeMode();
                self._renderHotkeys();

                if (window.eventBus) {
                    window.eventBus.emit('profile:imported', {
                        applied: res.applied,
                        errors: res.errors
                    });
                }

                if (input.parentNode) input.parentNode.removeChild(input);
            };

            reader.onerror = function() {
                console.error('[SettingsModal] FileReader error');
                if (window.__lsystem) {
                    window.__lsystem.showNotification('Не удалось прочитать файл', 'error');
                }
                if (input.parentNode) input.parentNode.removeChild(input);
            };

            reader.readAsText(file, 'utf-8');
        });

        document.body.appendChild(input);
        input.click();
    };

    // ============================================================
    // 7. THEME RENDER
    // ============================================================

    SettingsModal.prototype._renderThemeMode = function() {
        var appState = window.appState;
        if (!appState) return;

        var mode = appState.getThemeMode();
        var hours = appState.getAutoThemeHours();

        var themeSwitch = this._overlay.querySelector('#themeSwitch');
        if (themeSwitch) {
            themeSwitch.dataset.mode = mode;
            themeSwitch.querySelectorAll('.theme-switch__opt').forEach(function(btn) {
                btn.classList.toggle('is-active', btn.dataset.mode === mode);
            });
        }

        var startInput = this._overlay.querySelector('#themeDarkStart');
        var endInput = this._overlay.querySelector('#themeDarkEnd');
        if (startInput) startInput.value = hours.darkStart;
        if (endInput) endInput.value = hours.darkEnd;

        var autoPanel = this._overlay.querySelector('#themeAutoPanel');
        if (autoPanel) {
            autoPanel.classList.toggle('is-open', mode === 'auto');
        }

        this._renderThemeTimeline(hours.darkStart, hours.darkEnd);
    };

    SettingsModal.prototype._renderThemeTimeline = function(darkStart, darkEnd) {
        var band = this._overlay.querySelector('#themeNightBand');
        if (!band) return;

        var s = Math.max(0, Math.min(24, Number(darkStart) || 0));
        var e = Math.max(0, Math.min(24, Number(darkEnd) || 0));

        if (s === e) {
            band.style.left = '0%';
            band.style.width = '100%';
            band.style.backgroundImage = '';
        } else if (s < e) {
            band.style.left = (s / 24 * 100) + '%';
            band.style.width = ((e - s) / 24 * 100) + '%';
            band.style.backgroundImage = '';
        } else {
            var sPct = (s / 24 * 100).toFixed(3);
            var ePct = (e / 24 * 100).toFixed(3);

            band.style.left = '0%';
            band.style.width = '100%';
            band.style.backgroundImage =
                'linear-gradient(to right, ' +
                'rgba(200, 184, 154, 0.75) 0%, ' +
                'rgba(200, 184, 154, 0.75) ' + ePct + '%, ' +
                'transparent ' + ePct + '%, ' +
                'transparent ' + sPct + '%, ' +
                'rgba(200, 184, 154, 0.75) ' + sPct + '%, ' +
                'rgba(200, 184, 154, 0.75) 100%)';
        }

        this._updateNowHint();
    };

    SettingsModal.prototype._updateNowHint = function() {
        var hint = this._overlay.querySelector('#themeNowHint');
        if (!hint) return;

        if (!window.appState) {
            hint.textContent = 'Сейчас: —';
            return;
        }

        var hours = window.appState.getAutoThemeHours();
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();

        var s = Number(hours.darkStart);
        var e = Number(hours.darkEnd);

        var isDark;
        if (s === e) isDark = true;
        else if (s < e) isDark = (h >= s && h < e);
        else isDark = (h >= s || h < e);

        var pad = function(n) { return (n < 10 ? '0' : '') + n; };
        hint.textContent = 'Сейчас: ' + pad(h) + ':' + pad(m) +
            ' — ' + (isDark ? '🌙 тёмная' : '☀️ светлая') + ' фаза';
    };

    SettingsModal.prototype._startNowTimer = function() {
        var self = this;
        this._stopNowTimer();
        this._nowTimer = setInterval(function() {
            if (self._isOpen) self._updateNowHint();
        }, 30000);
    };

    SettingsModal.prototype._stopNowTimer = function() {
        if (this._nowTimer) {
            clearInterval(this._nowTimer);
            this._nowTimer = null;
        }
    };

    // ============================================================
    // 8. WORKING FOLDER
    // ============================================================

    SettingsModal.prototype._renderWorkingFolder = function() {
        var el = this._overlay.querySelector('#pluginsWorkingFolder');
        if (!el) return;

        var ps = window.pluginSystem;
        if (!ps) {
            el.textContent = '— pluginSystem не загружен —';
            return;
        }

        var state = ps.getFolderState();
        var name = ps.getFolderName();

        if (state === 'granted') {
            el.textContent = name || 'выбрана';
        } else if (state === 'prompt') {
            el.textContent = (name || 'выбрана') + ' — требуется разрешение';
        } else if (state === 'denied') {
            el.textContent = (name || 'выбрана') + ' — доступ запрещён';
        } else {
            el.textContent = '— не выбрана —';
        }
    };

    SettingsModal.prototype._renderPluginsFolderBanner = function() {
        var banner = this._overlay.querySelector('#pluginsFolderBanner');
        if (!banner) return;

        var ps = window.pluginSystem;
        if (!ps) {
            banner.style.display = 'none';
            return;
        }

        var state = ps.getFolderState();
        if (state === 'prompt' || state === 'denied') {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    };

    // ============================================================
    // 9. PLUGINS EVENTS
    // ============================================================

    SettingsModal.prototype._bindPluginsEvents = function() {
        var self = this;
        var overlay = this._overlay;

        var tabsWrap = overlay.querySelector('#pluginsTabs');
        if (tabsWrap) {
            tabsWrap.addEventListener('click', function(e) {
                var tab = e.target.closest('.plugins-tab');
                if (!tab || !tabsWrap.contains(tab)) return;
                var name = tab.dataset.tab;
                if (!name || name === self._pluginsTab) return;

                self._pluginsTab = name;
                tabsWrap.querySelectorAll('.plugins-tab').forEach(function(t) {
                    t.classList.toggle('is-active', t.dataset.tab === name);
                });
                self._pluginsSearchQuery = '';
                var inp = overlay.querySelector('#pluginsSearchInput');
                if (inp) inp.value = '';
                self._renderPlugins();
            });
        }

        var searchInput = overlay.querySelector('#pluginsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                self._pluginsSearchQuery = searchInput.value || '';
                self._renderPlugins();
            });
        }

        var chooseBtn = overlay.querySelector('#pluginsChooseFolderBtn');
        if (chooseBtn) {
            chooseBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                var ok = await ps.pickFolder();
                if (ok) {
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Папка плагинов выбрана: ' + ps.getFolderName(), 'success');
                    }
                }
                self._renderWorkingFolder();
                self._renderPluginsFolderBanner();
            });
        }

        var scanBtn = overlay.querySelector('#pluginsScanFolderBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                scanBtn.disabled = true;
                try {
                    await ps.rescanFolder();
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Папка пересканирована', 'info', 1500);
                    }
                } finally {
                    scanBtn.disabled = false;
                }
            });
        }

        var forgetBtn = overlay.querySelector('#pluginsForgetFolderBtn');
        if (forgetBtn) {
            forgetBtn.addEventListener('click', function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                ps.forgetFolder();
                self._renderWorkingFolder();
                self._renderPluginsFolderBanner();
                if (window.__lsystem) {
                    window.__lsystem.showNotification('Папка плагинов забыта', 'info', 1500);
                }
            });
        }

        var grantBtn = overlay.querySelector('#pluginsGrantAccessBtn');
        if (grantBtn) {
            grantBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                grantBtn.disabled = true;
                try {
                    var ok = await ps.requestFolderPermission();
                    if (!ok) {
                        if (window.__lsystem) {
                            window.__lsystem.showNotification('Доступ не предоставлен', 'warning');
                        }
                    }
                } finally {
                    grantBtn.disabled = false;
                    self._renderWorkingFolder();
                    self._renderPluginsFolderBanner();
                }
            });
        }

        var installBtn = overlay.querySelector('#pluginsInstallUrlBtn');
        if (installBtn) {
            installBtn.addEventListener('click', function() {
                self._openInstallUrlModal();
            });
        }

        var updatesBtn = overlay.querySelector('#pluginsCheckUpdatesBtn');
        if (updatesBtn) {
            updatesBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps || typeof ps.checkUpdates !== 'function') return;
                updatesBtn.disabled = true;
                try {
                    var results = await ps.checkUpdates();
                    var withUpdates = results.filter(function(r) { return r.hasUpdate; });
                    if (window.__lsystem) {
                        if (withUpdates.length === 0) {
                            window.__lsystem.showNotification('Обновлений нет', 'info', 1500);
                        } else {
                            window.__lsystem.showNotification(
                                'Доступно обновлений: ' + withUpdates.length,
                                'info',
                                2500
                            );
                        }
                    }
                } catch (err) {
                    console.error('[SettingsModal] checkUpdates error:', err);
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Ошибка проверки', 'error');
                    }
                } finally {
                    updatesBtn.disabled = false;
                }
            });
        }

        var reloadBtn = overlay.querySelector('#pluginsReloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                var orig = reloadBtn.innerHTML;
                reloadBtn.disabled = true;
                reloadBtn.innerHTML = '<span>Загрузка…</span>';
                try {
                    await ps.reload();
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Плагины перезагружены', 'success');
                    }
                } catch (err) {
                    console.error('[SettingsModal] Reload plugins error:', err);
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Ошибка перезагрузки', 'error');
                    }
                } finally {
                    reloadBtn.disabled = false;
                    reloadBtn.innerHTML = orig;
                }
            });
        }
    };

    // ============================================================
    // 10. PLUGINS LIST
    // ============================================================

    SettingsModal.prototype._renderPlugins = function() {
        var listEl = this._overlay.querySelector('#pluginsList');
        if (!listEl) return;

        var activeCountEl = this._overlay.querySelector('#pluginsActiveCount');
        var hiddenCountEl = this._overlay.querySelector('#pluginsHiddenCount');

        var ps = window.pluginSystem;
        if (!ps || typeof ps.getAllPlugins !== 'function') {
            listEl.innerHTML = '<div class="plugins-list__empty">pluginSystem не загружен</div>';
            if (activeCountEl) activeCountEl.textContent = '0';
            if (hiddenCountEl) hiddenCountEl.textContent = '0';
            return;
        }

        var all = ps.getAllPlugins() || [];

        var active = all.filter(function(p) { return p.enabled; });
        var hidden = all.filter(function(p) { return !p.enabled; });

        if (activeCountEl) activeCountEl.textContent = String(active.length);
        if (hiddenCountEl) hiddenCountEl.textContent = String(hidden.length);

        var current = (this._pluginsTab === 'hidden') ? hidden : active;

        var query = (this._pluginsSearchQuery || '').toLowerCase().trim();
        if (query) {
            current = current.filter(function(p) {
                return (p.name || '').toLowerCase().indexOf(query) !== -1
                    || (p.id || '').toLowerCase().indexOf(query) !== -1
                    || (p.author || '').toLowerCase().indexOf(query) !== -1;
            });
        }

        listEl.innerHTML = '';

        if (current.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'plugins-list__empty';

            var folderState = ps.getFolderState ? ps.getFolderState() : 'none';

            if (query) {
                empty.textContent = 'Ничего не найдено';
            } else if (this._pluginsTab === 'hidden') {
                empty.textContent = 'Скрытых плагинов нет';
            } else if (folderState === 'prompt' || folderState === 'denied') {
                empty.textContent = 'Папка плагинов недоступна — разрешите доступ, чтобы увидеть установленные окна.';
            } else if (folderState === 'none') {
                empty.textContent = 'Папка плагинов не выбрана.';
            } else {
                empty.textContent = 'Активных плагинов нет';
            }
            listEl.appendChild(empty);
            return;
        }

        var self = this;
        current.forEach(function(p) {
            listEl.appendChild(self._makePluginRow(p));
        });
    };

    SettingsModal.prototype._makePluginRow = function(p) {
        var row = document.createElement('div');
        row.className = 'plugin-row';
        row.dataset.pluginId = p.id;

        var main = document.createElement('div');
        main.className = 'plugin-row__main';

        var iconEl = document.createElement('div');
        iconEl.className = 'plugin-row__icon';
        if (p.icon && p.icon.indexOf('icon-') === 0) {
            iconEl.innerHTML = '<svg class="icon-svg"><use href="#' + p.icon + '"></use></svg>';
        } else {
            iconEl.textContent = p.icon || '📄';
        }
        main.appendChild(iconEl);

        var infoEl = document.createElement('div');
        infoEl.className = 'plugin-row__info';

        var nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '6px';
        nameRow.style.minWidth = '0';
        nameRow.style.overflow = 'hidden';

        var nameEl = document.createElement('span');
        nameEl.className = 'plugin-row__name';
        nameEl.textContent = p.name || p.id;
        nameRow.appendChild(nameEl);

        var badgeSource = document.createElement('span');
        badgeSource.className = 'plugin-row__badge';
        if (p.source === 'url') badgeSource.textContent = 'URL';
        else if (p.source === 'folder') badgeSource.textContent = 'Folder';
        else badgeSource.textContent = 'Core';
        nameRow.appendChild(badgeSource);

        var badgeVersion = document.createElement('span');
        badgeVersion.className = 'plugin-row__badge';
        badgeVersion.textContent = 'v' + (p.version || '0.0.0');
        nameRow.appendChild(badgeVersion);

        infoEl.appendChild(nameRow);

        if (p.author || p.description) {
            var metaEl = document.createElement('div');
            metaEl.className = 'plugin-row__meta';
            metaEl.textContent = p.author || p.description || '';
            infoEl.appendChild(metaEl);
        }

        main.appendChild(infoEl);

        var isCore = p.source === 'core';
        var isFolder = p.source === 'folder';

        if (!isCore) {
            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'plugin-row__btn plugin-row__btn--toggle' + (p.enabled ? ' is-on' : '');
            toggleBtn.title = p.enabled ? 'Отключить (переместить в скрытые)' : 'Включить (переместить в активные)';
            toggleBtn.innerHTML = '<svg class="icon-svg"><use href="#' + (p.enabled ? 'icon-eye' : 'icon-eye-off') + '"></use></svg>';

            toggleBtn.addEventListener('click', async function() {
                var ps = window.pluginSystem;
                if (!ps) return;
                toggleBtn.disabled = true;
                try {
                    var target = !p.enabled;
                    if (typeof ps.setEnabled === 'function') {
                        await ps.setEnabled(p.id, target);
                    } else if (target && typeof ps.enablePlugin === 'function') {
                        await ps.enablePlugin(p.id);
                    } else if (!target && typeof ps.disablePlugin === 'function') {
                        await ps.disablePlugin(p.id);
                    }
                } finally {
                    toggleBtn.disabled = false;
                }
            });

            main.appendChild(toggleBtn);

            if (!isFolder) {
                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'plugin-row__btn plugin-row__btn--danger';
                delBtn.title = 'Удалить плагин';
                delBtn.innerHTML = '<svg class="icon-svg"><use href="#icon-trash"></use></svg>';

                delBtn.addEventListener('click', async function() {
                    var ps = window.pluginSystem;
                    if (!ps) return;
                    delBtn.disabled = true;
                    try {
                        var ok = await ps.uninstallPlugin(p.id);
                        if (ok && window.__lsystem) {
                            window.__lsystem.showNotification('Плагин удалён: ' + p.name, 'info', 1800);
                        }
                    } finally {
                        delBtn.disabled = false;
                    }
                });

                main.appendChild(delBtn);
            }
        }

        row.appendChild(main);
        return row;
    };

    // ============================================================
    // 11. INSTALL URL MODAL
    // ============================================================

    SettingsModal.prototype._openInstallUrlModal = function() {
        var overlay = document.createElement('div');
        overlay.className = 'plugin-install-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '1000001',
            padding: '20px'
        });

        var modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'var(--bg-panel, #1a1a1a)',
            border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
            borderRadius: '10px',
            padding: '20px 22px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)'
        });

        var title = document.createElement('div');
        title.textContent = 'Установить плагин по URL';
        Object.assign(title.style, {
            fontSize: '14px',
            fontWeight: '700',
            color: 'var(--text-primary, #e0d8cc)',
            marginBottom: '12px'
        });
        modal.appendChild(title);

        var hint = document.createElement('div');
        hint.textContent = 'Введите прямую ссылку на файл плагина (.js)';
        Object.assign(hint.style, {
            fontSize: '11px',
            color: 'var(--text-muted, #6a6a6a)',
            marginBottom: '10px'
        });
        modal.appendChild(hint);

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'https://example.com/plugin.js';
        input.className = 'settings-input';
        input.style.marginBottom = '16px';
        modal.appendChild(input);

        var actions = document.createElement('div');
        Object.assign(actions.style, {
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end'
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'settings-btn settings-btn--ghost';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', function() {
            document.body.removeChild(overlay);
        });
        actions.appendChild(cancelBtn);

        var installBtn = document.createElement('button');
        installBtn.type = 'button';
        installBtn.className = 'settings-btn settings-btn--primary';
        installBtn.textContent = 'Установить';
        installBtn.addEventListener('click', async function() {
            var url = (input.value || '').trim();
            if (!url) {
                if (window.__lsystem) {
                    window.__lsystem.showNotification('Введите URL', 'warning');
                }
                return;
            }

            var ps = window.pluginSystem;
            if (!ps) {
                if (window.__lsystem) {
                    window.__lsystem.showNotification('pluginSystem не загружен', 'error');
                }
                return;
            }

            installBtn.disabled = true;
            installBtn.textContent = 'Установка...';

            try {
                var ok = await ps.installFromUrl(url);
                document.body.removeChild(overlay);

                if (ok) {
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Плагин установлен', 'success');
                    }
                } else {
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Не удалось установить плагин', 'error');
                    }
                }
            } catch (err) {
                console.error('[SettingsModal] installFromUrl error:', err);
                if (window.__lsystem) {
                    window.__lsystem.showNotification('Ошибка установки', 'error');
                }
                document.body.removeChild(overlay);
            }
        });
        actions.appendChild(installBtn);

        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(function() { input.focus(); }, 50);

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') installBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) document.body.removeChild(overlay);
        });
    };

    // ============================================================
    // 12. HOTKEYS
    // ============================================================

    SettingsModal.prototype._renderHotkeys = function() {
        var appState = window.appState;
        if (!appState) return;

        var globalList = this._overlay.querySelector('#hotkeysGlobalList');
        if (globalList) {
            globalList.innerHTML = '';
            var globalHotkeys = appState.getGlobalHotkeys();

            for (var key in globalHotkeys) {
                if (!Object.prototype.hasOwnProperty.call(globalHotkeys, key)) continue;
                var entry = globalHotkeys[key];

                var row = this._makeHotkeyRow({
                    originalCombo: entry.original || key,
                    combo: entry.combo || key,
                    label: entry.label || key,
                    source: 'global',
                    overridden: !!entry.overridden
                }, 'global', null);

                if (entry.overridden) {
                    row.classList.add('is-overridden');
                }
                globalList.appendChild(row);
            }
        }

        var windowList = this._overlay.querySelector('#hotkeysWindowList');
        if (windowList) {
            windowList.innerHTML = '';
            var overrides = appState.getHotkeyOverrides();
            var windowsMap = overrides.windows || {};

            var found = false;
            for (var typeId in windowsMap) {
                if (!Object.prototype.hasOwnProperty.call(windowsMap, typeId)) continue;
                var bucket = windowsMap[typeId];
                if (!bucket || Object.keys(bucket).length === 0) continue;
                found = true;

                var section = document.createElement('div');
                section.style.marginBottom = '10px';

                var titleEl = document.createElement('div');
                titleEl.className = 'settings-subgroup__title';
                titleEl.textContent = typeId;
                section.appendChild(titleEl);

                var inner = document.createElement('div');
                inner.className = 'settings-hotkeys';

                for (var origCombo in bucket) {
                    if (!Object.prototype.hasOwnProperty.call(bucket, origCombo)) continue;
                    var e2 = bucket[origCombo];

                    var row2 = this._makeHotkeyRow({
                        originalCombo: e2.original || origCombo,
                        combo: e2.combo || origCombo,
                        label: e2.label || origCombo,
                        source: typeId,
                        overridden: !!e2.overridden
                    }, 'window', typeId);

                    if (e2.overridden) {
                        row2.classList.add('is-overridden');
                    }
                    inner.appendChild(row2);
                }
                section.appendChild(inner);
                windowList.appendChild(section);
            }

            if (!found) {
                var empty = document.createElement('div');
                empty.style.cssText = 'font-size:11px;color:var(--text-muted);padding:6px 0;';
                empty.textContent = 'Нет типов с хоткеями';
                windowList.appendChild(empty);
            }
        }
    };

    SettingsModal.prototype._makeHotkeyRow = function(data, scope, typeId) {
        var self = this;

        var row = document.createElement('div');
        row.className = 'hotkey-row';

        var labelEl = document.createElement('span');
        labelEl.className = 'hotkey-row__label';
        labelEl.textContent = data.label;
        row.appendChild(labelEl);

        var srcEl = document.createElement('span');
        srcEl.className = 'hotkey-row__source';
        srcEl.textContent = data.source;
        row.appendChild(srcEl);

        var comboEl = document.createElement('span');
        comboEl.className = 'hotkey-row__combo';
        comboEl.textContent = data.combo;
        comboEl.dataset.scope = scope;
        comboEl.dataset.typeId = typeId || '';
        comboEl.dataset.originalCombo = data.originalCombo;
        comboEl.dataset.currentCombo = data.combo;

        comboEl.addEventListener('click', function() {
            self._startCapture(comboEl, scope, typeId, data.originalCombo);
        });

        row.appendChild(comboEl);
        return row;
    };

    SettingsModal.prototype._startCapture = function(comboEl, scope, typeId, originalCombo) {
        if (this._capturingCombo) return;
        var self = this;

        var currentCombo = comboEl.dataset.currentCombo;

        this._capturingCombo = {
            comboEl: comboEl,
            scope: scope,
            typeId: typeId,
            originalCombo: originalCombo,
            currentCombo: currentCombo
        };
        comboEl.classList.add('is-capturing');
        comboEl.textContent = 'Нажмите...';

        var handler = function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                self._cancelCapture();
                return;
            }

            if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;

            var newCombo = window.HotkeyRegistry.normalizeCombo(
                window.HotkeyRegistry.eventToCombo(e)
            );
            if (!newCombo) return;

            comboEl.classList.remove('is-capturing');
            comboEl.textContent = newCombo;
            comboEl.dataset.currentCombo = newCombo;

            self._applyHotkeyChange(scope, typeId, originalCombo, currentCombo, newCombo);

            self._capturingCombo = null;
            document.removeEventListener('keydown', handler, true);
            self._captureHandler = null;
        };

        document.addEventListener('keydown', handler, true);
        this._captureHandler = handler;
    };

    SettingsModal.prototype._cancelCapture = function() {
        if (!this._capturingCombo) return;
        var c = this._capturingCombo;
        c.comboEl.classList.remove('is-capturing');
        c.comboEl.textContent = c.currentCombo;

        if (this._captureHandler) {
            document.removeEventListener('keydown', this._captureHandler, true);
            this._captureHandler = null;
        }
        this._capturingCombo = null;
    };

    SettingsModal.prototype._applyHotkeyChange = function(scope, typeId, originalCombo, oldCombo, newCombo) {
        if (!window.appState) return;

        var overrides = window.appState.getHotkeyOverrides();
        var conflict = null;

        if (scope === 'global') {
            var globalMap = overrides.global || {};
            for (var key in globalMap) {
                if (!Object.prototype.hasOwnProperty.call(globalMap, key)) continue;
                var rec = globalMap[key];
                if (!rec) continue;
                if ((rec.original || key) === originalCombo) continue;
                if (rec.combo === newCombo) {
                    conflict = rec.label || key;
                    break;
                }
            }
        } else if (scope === 'window' && typeId) {
            var windowMap = (overrides.windows && overrides.windows[typeId]) || {};
            for (var key2 in windowMap) {
                if (!Object.prototype.hasOwnProperty.call(windowMap, key2)) continue;
                var rec2 = windowMap[key2];
                if (!rec2) continue;
                if ((rec2.original || key2) === originalCombo) continue;
                if (rec2.combo === newCombo) {
                    conflict = rec2.label || key2;
                    break;
                }
            }
        }

        if (conflict && window.__lsystem) {
            window.__lsystem.showNotification(
                'Конфликт: ' + newCombo + ' уже назначен на «' + conflict + '»',
                'warning',
                2600
            );
        }

        window.appState.setHotkeyOverride(scope, typeId, originalCombo, newCombo);

        if (window.hotkeyRegistry) {
            if (scope === 'global') {
                window.hotkeyRegistry.rebindGlobal(oldCombo, newCombo);
            } else if (scope === 'window' && typeId && window.layoutManager) {
                var windows = window.layoutManager.getWindowsByType(typeId);
                for (var i = 0; i < windows.length; i++) {
                    window.hotkeyRegistry.rebindWindow(windows[i].id, oldCombo, newCombo);
                }
            }
        }
    };

    SettingsModal.prototype._resetHotkeys = function() {
        if (window.appState) window.appState.resetAllHotkeyOverrides();

        if (window.layoutManager && window.layoutManager._windowInstances) {
            window.layoutManager._windowInstances.forEach(function(bw) {
                if (bw && typeof bw.refreshHotkeys === 'function') {
                    bw.refreshHotkeys();
                }
            });
        }

        this._renderHotkeys();
        if (window.__lsystem) window.__lsystem.showNotification('Хоткеи сброшены', 'info');
    };

    // ============================================================
    // 13. APPLY ALL / DESTROY
    // ============================================================

    SettingsModal.prototype._applyAll = function() {
        this._saveProfile();
        this.close();
        if (window.__lsystem) {
            window.__lsystem.showNotification('Настройки применены', 'success');
        }
    };

    SettingsModal.prototype.destroy = function() {
        this._cancelCapture();
        this._stopNowTimer();

        if (this._eula) {
            try { this._eula.destroy(); } catch (e) {}
            this._eula = null;
        }

        for (var i = 0; i < this._busUnsubs.length; i++) {
            try { this._busUnsubs[i](); } catch (e) {}
        }
        this._busUnsubs = [];

        for (var j = 0; j < this._closeHandlers.length; j++) {
            try { this._closeHandlers[j](); } catch (e) {}
        }
        this._closeHandlers = [];

        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._htmlLoaded = false;
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SettingsModal: SettingsModal };
    }

    if (typeof window !== 'undefined') {
        window.SettingsModal = SettingsModal;
    }

})();