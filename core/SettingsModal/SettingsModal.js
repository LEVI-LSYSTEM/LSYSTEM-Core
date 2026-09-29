// core/settingsModal/SettingsModal.js
// Версия 13.1.0
// - Hotkeys: работа с entry.original / entry.overridden.
// - Строки с переопределённой комбой получают класс is-overridden.
// - _applyHotkeyChange сверяет конфликты по effective original.
// - Профиль: настоящий экспорт/импорт через AppState.exportProfile/importProfile.

(function() {
    'use strict';

    var EULA_TEXT = [
        '# Соглашение о неразглашении (EULA)',
        '',
        '**Версия:** 1.0  ',
        '**Дата:** 2025',
        '',
        '## 1. Общие положения',
        '',
        'Настоящее Соглашение о неразглашении (далее — «Соглашение») регулирует',
        'условия использования приложения **LSYSTEM** (далее — «Приложение»).',
        '',
        '## 2. Обязательства пользователя',
        '',
        '2.1. Пользователь обязуется не разглашать конфиденциальную информацию,',
        '     полученную в процессе работы с Приложением.',
        '',
        '2.2. Пользователь обязуется не передавать доступ к Приложению третьим лицам.',
        '',
        '2.3. Пользователь обязуется использовать Приложение только в законных целях.',
        '',
        '## 3. Конфиденциальность',
        '',
        '3.1. Все данные, созданные в Приложении, являются конфиденциальными.',
        '',
        '3.2. Пользователь несёт ответственность за сохранность своих данных.',
        '',
        '## 4. Срок действия',
        '',
        '4.1. Соглашение вступает в силу с момента принятия.',
        '',
        '4.2. Соглашение действует бессрочно.',
        '',
        '## 5. Ответственность',
        '',
        '5.1. Пользователь несёт ответственность за нарушение условий Соглашения.',
        '',
        '---',
        '',
        '**© 2025 LSYSTEM. Все права защищены.**'
    ].join('\n');

    var SETTINGS_HTML = [
        '<div class="settings-modal-overlay" id="settingsModalOverlay">',
        '    <div class="settings-modal" id="settingsModal" role="dialog" aria-modal="true">',
        '        <div class="settings-modal__header">',
        '            <div class="settings-modal__title-wrap">',
        '                <svg class="icon-svg settings-modal__title-icon"><use href="#icon-settings"></use></svg>',
        '                <h2 class="settings-modal__title">Настройки</h2>',
        '            </div>',
        '            <button class="settings-modal__close" id="settingsCloseBtn" type="button" title="Закрыть (Esc)">',
        '                <svg class="icon-svg"><use href="#icon-close"></use></svg>',
        '            </button>',
        '        </div>',
        '        <div class="settings-modal__body">',

        '            <section class="settings-group">',
        '                <header class="settings-group__header">',
        '                    <svg class="icon-svg settings-group__icon"><use href="#icon-user"></use></svg>',
        '                    <span class="settings-group__title">Профиль</span>',
        '                </header>',
        '                <div class="settings-group__body">',

        '                    <div class="settings-row">',
        '                        <label class="settings-row__label" for="profileName">Имя / Организация</label>',
        '                        <div class="settings-row__control">',
        '                            <input class="settings-input" id="profileName" type="text" placeholder="Введите имя или организацию..." autocomplete="off" />',
        '                        </div>',
        '                    </div>',

        '                    <div class="settings-nda" id="eulaBlock">',
        '                        <div class="settings-nda__text">',
        '                            <div class="settings-nda__title">Соглашение о неразглашении (EULA)</div>',
        '                            <div class="settings-nda__desc">Ознакомьтесь с условиями использования приложения. Используя приложение, вы принимаете соглашение.</div>',
        '                            <div class="settings-actions-row">',
        '                                <button class="settings-btn settings-btn--ghost" id="eulaDownloadBtn" type="button">',
        '                                    <svg class="icon-svg"><use href="#icon-download"></use></svg>',
        '                                    <span>Скачать .md</span>',
        '                                </button>',
        '                                <button class="settings-btn settings-btn--ghost" id="eulaOpenBtn" type="button">',
        '                                    <svg class="icon-svg"><use href="#icon-data"></use></svg>',
        '                                    <span>Открыть EULA</span>',
        '                                </button>',
        '                            </div>',
        '                        </div>',
        '                    </div>',

        '                    <div class="settings-group__actions">',
        '                        <button class="settings-btn settings-btn--ghost" id="profileExportBtn" type="button" title="Экспорт профиля">',
        '                            <svg class="icon-svg"><use href="#icon-download"></use></svg>',
        '                            <span>Экспорт</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--ghost" id="profileImportBtn" type="button" title="Импорт профиля">',
        '                            <svg class="icon-svg"><use href="#icon-load"></use></svg>',
        '                            <span>Импорт</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--ghost" id="profileClearBtn" type="button">',
        '                            <svg class="icon-svg"><use href="#icon-trash"></use></svg>',
        '                            <span>Сбросить</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--primary" id="profileSaveBtn" type="button">',
        '                            <svg class="icon-svg"><use href="#icon-save"></use></svg>',
        '                            <span>Сохранить</span>',
        '                        </button>',
        '                    </div>',

        '                </div>',
        '            </section>',

        '            <section class="settings-group">',
        '                <header class="settings-group__header">',
        '                    <svg class="icon-svg settings-group__icon"><use href="#icon-layout"></use></svg>',
        '                    <span class="settings-group__title">Тема</span>',
        '                </header>',
        '                <div class="settings-group__body">',

        '                    <div class="theme-switch" id="themeSwitch" data-mode="auto" tabindex="0">',
        '                        <span class="theme-switch__thumb" aria-hidden="true"></span>',
        '                        <button class="theme-switch__opt" data-mode="auto" type="button" title="Авто">',
        '                            <svg class="icon-svg"><use href="#icon-history"></use></svg>',
        '                            <span>Авто</span>',
        '                        </button>',
        '                        <button class="theme-switch__opt" data-mode="dark" type="button" title="Тёмная">',
        '                            <svg class="icon-svg"><use href="#icon-eye-off"></use></svg>',
        '                            <span>Тёмная</span>',
        '                        </button>',
        '                        <button class="theme-switch__opt" data-mode="light" type="button" title="Светлая">',
        '                            <svg class="icon-svg"><use href="#icon-eye"></use></svg>',
        '                            <span>Светлая</span>',
        '                        </button>',
        '                    </div>',

        '                    <div class="theme-auto" id="themeAutoPanel">',
        '                        <div class="theme-auto__inner">',
        '                            <div class="theme-auto__row">',
        '                                <span class="theme-auto__caption">Тёмная тема с</span>',
        '                                <div class="time-field">',
        '                                    <input type="number" min="0" max="23" id="themeDarkStart" class="time-field__input" />',
        '                                    <span class="time-field__suffix">:00</span>',
        '                                </div>',
        '                                <span class="theme-auto__caption">до</span>',
        '                                <div class="time-field">',
        '                                    <input type="number" min="0" max="23" id="themeDarkEnd" class="time-field__input" />',
        '                                    <span class="time-field__suffix">:00</span>',
        '                                </div>',
        '                            </div>',
        '                            <div class="theme-auto__timeline" id="themeTimeline">',
        '                                <div class="theme-auto__bar"></div>',
        '                                <div class="theme-auto__night" id="themeNightBand"></div>',
        '                                <div class="theme-auto__ticks">',
        '                                    <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>',
        '                                </div>',
        '                            </div>',
        '                            <div class="theme-auto__now" id="themeNowHint">Сейчас: —</div>',
        '                        </div>',
        '                    </div>',

        '                </div>',
        '            </section>',

        '            <section class="settings-group">',
        '                <header class="settings-group__header">',
        '                    <svg class="icon-svg settings-group__icon"><use href="#icon-window-type"></use></svg>',
        '                    <span class="settings-group__title">Плагины</span>',
        '                </header>',
        '                <div class="settings-group__body">',

        '                    <div class="settings-folder-banner" id="pluginsFolderBanner" style="display:none;">',
        '                        <svg class="icon-svg settings-folder-banner__icon"><use href="#icon-warning"></use></svg>',
        '                        <div class="settings-folder-banner__text">',
        '                            <div class="settings-folder-banner__title">Требуется доступ к папке плагинов</div>',
        '                            <div class="settings-folder-banner__desc">Разрешите чтение файлов, чтобы загрузить установленные плагины.</div>',
        '                        </div>',
        '                        <button class="settings-btn settings-btn--primary" id="pluginsGrantAccessBtn" type="button">',
        '                            <span>Разрешить</span>',
        '                        </button>',
        '                    </div>',

        '                    <div class="settings-row">',
        '                        <span class="settings-row__label">Рабочая папка</span>',
        '                        <div class="settings-row__control">',
        '                            <code class="settings-path" id="pluginsWorkingFolder">— не выбрана —</code>',
        '                            <button class="settings-btn settings-btn--ghost" id="pluginsChooseFolderBtn" type="button" title="Выбрать директорию">',
        '                                <svg class="icon-svg"><use href="#icon-folder"></use></svg>',
        '                            </button>',
        '                            <button class="settings-btn settings-btn--ghost" id="pluginsScanFolderBtn" type="button" title="Пересканировать папку">',
        '                                <svg class="icon-svg"><use href="#icon-refresh"></use></svg>',
        '                            </button>',
        '                            <button class="settings-btn settings-btn--ghost" id="pluginsForgetFolderBtn" type="button" title="Забыть папку">',
        '                                <svg class="icon-svg"><use href="#icon-close"></use></svg>',
        '                            </button>',
        '                        </div>',
        '                    </div>',

        '                    <div class="plugins-tabs" id="pluginsTabs">',
        '                        <button type="button" class="plugins-tab is-active" data-tab="active">',
        '                            <span>Активные</span>',
        '                            <span class="plugins-tab__count" id="pluginsActiveCount">0</span>',
        '                        </button>',
        '                        <button type="button" class="plugins-tab" data-tab="hidden">',
        '                            <span>Скрытые</span>',
        '                            <span class="plugins-tab__count" id="pluginsHiddenCount">0</span>',
        '                        </button>',
        '                    </div>',

        '                    <div class="plugins-toolbar">',
        '                        <div class="plugins-search">',
        '                            <svg class="plugins-search__icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
        '                            <input type="text" class="plugins-search__input" id="pluginsSearchInput" placeholder="Поиск плагинов..." autocomplete="off" />',
        '                        </div>',
        '                        <button class="settings-btn settings-btn--ghost" id="pluginsInstallUrlBtn" type="button" title="Установить по URL">',
        '                            <svg class="icon-svg"><use href="#icon-plus"></use></svg>',
        '                            <span>+ URL</span>',
        '                        </button>',
        '                    </div>',

        '                    <div class="plugins-list" id="pluginsList"></div>',

        '                    <div class="settings-group__actions">',
        '                        <button class="settings-btn settings-btn--ghost" id="pluginsCheckUpdatesBtn" type="button" title="Проверить обновления URL-плагинов">',
        '                            <svg class="icon-svg"><use href="#icon-download"></use></svg>',
        '                            <span>Проверить обновления</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--primary" id="pluginsReloadBtn" type="button">',
        '                            <svg class="icon-svg"><use href="#icon-refresh"></use></svg>',
        '                            <span>Перезагрузить</span>',
        '                        </button>',
        '                    </div>',

        '                </div>',
        '            </section>',

        '            <section class="settings-group">',
        '                <header class="settings-group__header">',
        '                    <svg class="icon-svg settings-group__icon"><use href="#icon-settings"></use></svg>',
        '                    <span class="settings-group__title">Горячие клавиши</span>',
        '                </header>',
        '                <div class="settings-group__body">',
        '                    <div class="settings-hotkeys__hint">',
        '                        Кликните по комбинации, чтобы изменить. <kbd>Esc</kbd> отменяет ввод.',
        '                    </div>',
        '                    <div class="settings-subgroup">',
        '                        <div class="settings-subgroup__title">Глобальные</div>',
        '                        <div class="settings-hotkeys" id="hotkeysGlobalList"></div>',
        '                    </div>',
        '                    <div class="settings-subgroup">',
        '                        <div class="settings-subgroup__title">Оконные</div>',
        '                        <div class="settings-hotkeys" id="hotkeysWindowList"></div>',
        '                    </div>',
        '                    <div class="settings-group__actions">',
        '                        <button class="settings-btn settings-btn--ghost" id="hotkeysResetBtn" type="button">',
        '                            <svg class="icon-svg"><use href="#icon-refresh"></use></svg>',
        '                            <span>Сбросить все</span>',
        '                        </button>',
        '                    </div>',
        '                </div>',
        '            </section>',

        '        </div>',
        '        <div class="settings-modal__footer">',
        '            <span class="settings-modal__brand">',
        '                LSYSTEM <span class="settings-modal__sep">|</span> Core',
        '            </span>',
        '            <button class="settings-btn settings-btn--primary" id="settingsApplyBtn" type="button">',
        '                <svg class="icon-svg"><use href="#icon-success"></use></svg>',
        '                <span>Готово</span>',
        '            </button>',
        '        </div>',
        '    </div>',
        '</div>'
    ].join('\n');

    var EULA_MODAL_HTML = [
        '<div class="eula-modal-overlay" id="eulaModalOverlay">',
        '    <div class="eula-modal" role="dialog" aria-modal="true">',
        '        <div class="eula-modal__header">',
        '            <div class="eula-modal__title-wrap">',
        '                <svg class="icon-svg eula-modal__icon"><use href="#icon-data"></use></svg>',
        '                <h2 class="eula-modal__title">Соглашение о неразглашении</h2>',
        '            </div>',
        '            <button class="eula-modal__close" id="eulaModalCloseBtn" type="button" title="Закрыть (Esc)">',
        '                <svg class="icon-svg"><use href="#icon-close"></use></svg>',
        '            </button>',
        '        </div>',
        '        <div class="eula-modal__body" id="eulaModalBody" tabindex="0">',
        '            <div class="eula-modal__content" id="eulaModalContent"></div>',
        '        </div>',
        '        <div class="eula-modal__footer">',
        '            <div class="eula-modal__footer-left">',
        '                <button class="settings-btn settings-btn--ghost" id="eulaModalDownloadBtn" type="button">',
        '                    <svg class="icon-svg"><use href="#icon-download"></use></svg>',
        '                    <span>Скачать .md</span>',
        '                </button>',
        '            </div>',
        '            <div class="eula-modal__footer-right">',
        '                <button class="settings-btn settings-btn--primary" id="eulaModalCloseBtnBottom" type="button">',
        '                    <span>Закрыть</span>',
        '                </button>',
        '            </div>',
        '        </div>',
        '    </div>',
        '</div>'
    ].join('\n');

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

    function SettingsModal() {
        this._overlay = null;
        this._eulaOverlay = null;
        this._isOpen = false;
        this._isEulaOpen = false;
        this._capturingCombo = null;
        this._captureHandler = null;
        this._closeHandlers = [];
        this._nowTimer = null;

        this._pluginsTab = 'active';
        this._pluginsSearchQuery = '';

        this._init();
    }

    SettingsModal.prototype._init = function() {
        var overlay = document.getElementById('settingsModalOverlay');
        if (!overlay) {
            var tmp = document.createElement('div');
            tmp.innerHTML = SETTINGS_HTML.trim();
            overlay = tmp.firstElementChild;
            document.body.appendChild(overlay);
        }
        this._overlay = overlay;

        var eulaOverlay = document.getElementById('eulaModalOverlay');
        if (!eulaOverlay) {
            var tmp2 = document.createElement('div');
            tmp2.innerHTML = EULA_MODAL_HTML.trim();
            eulaOverlay = tmp2.firstElementChild;
            document.body.appendChild(eulaOverlay);
        }
        this._eulaOverlay = eulaOverlay;

        var content = eulaOverlay.querySelector('#eulaModalContent');
        if (content) content.innerHTML = renderMarkdown(EULA_TEXT);

        this._bindEvents();
        this._subscribePluginEvents();
    };

    SettingsModal.prototype._subscribePluginEvents = function() {
        var self = this;

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

        document.addEventListener('plugins:changed', onChange);
        document.addEventListener('plugins:folder-changed', onFolderChange);
        document.addEventListener('plugins:folder-permission-needed', onPermissionNeeded);

        this._closeHandlers.push(function() {
            document.removeEventListener('plugins:changed', onChange);
            document.removeEventListener('plugins:folder-changed', onFolderChange);
            document.removeEventListener('plugins:folder-permission-needed', onPermissionNeeded);
        });
    };

    SettingsModal.prototype._bindEvents = function() {
        var self = this;
        var overlay = this._overlay;
        var eulaOverlay = this._eulaOverlay;

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) self.close();
        });

        eulaOverlay.addEventListener('click', function(e) {
            if (e.target === eulaOverlay) self._closeEulaModal();
        });

        overlay.querySelector('#settingsCloseBtn').addEventListener('click', function() {
            self.close();
        });

        eulaOverlay.querySelector('#eulaModalCloseBtn').addEventListener('click', function() {
            self._closeEulaModal();
        });
        eulaOverlay.querySelector('#eulaModalCloseBtnBottom').addEventListener('click', function() {
            self._closeEulaModal();
        });

        overlay.querySelector('#profileSaveBtn').addEventListener('click', function() {
            self._saveProfile();
        });
        overlay.querySelector('#profileClearBtn').addEventListener('click', function() {
            self._clearProfile();
        });

        overlay.querySelector('#profileExportBtn').addEventListener('click', function() {
            self._exportProfile();
        });
        overlay.querySelector('#profileImportBtn').addEventListener('click', function() {
            self._importProfile();
        });

        overlay.querySelector('#eulaDownloadBtn').addEventListener('click', function() {
            self._downloadEULA();
        });
        overlay.querySelector('#eulaOpenBtn').addEventListener('click', function() {
            self._openEulaModal();
        });
        eulaOverlay.querySelector('#eulaModalDownloadBtn').addEventListener('click', function() {
            self._downloadEULA();
        });

        overlay.querySelector('#profileName').addEventListener('input', function() {
            self._updateSaveState();
        });

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

        this._bindPluginsEvents();

        overlay.querySelector('#hotkeysResetBtn').addEventListener('click', function() {
            self._resetHotkeys();
        });

        overlay.querySelector('#settingsApplyBtn').addEventListener('click', function() {
            self._applyAll();
        });

        var onKeyDown = function(e) {
            if (e.key !== 'Escape') return;

            if (self._isEulaOpen) {
                e.preventDefault();
                e.stopPropagation();
                self._closeEulaModal();
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
    // ОТКРЫТИЕ / ЗАКРЫТИЕ
    // ============================================================

    SettingsModal.prototype.open = function() {
        this._isOpen = true;
        this._overlay.classList.add('is-open');

        this._renderProfile();
        this._renderThemeMode();
        this._renderHotkeys();
        this._renderWorkingFolder();
        this._renderPluginsFolderBanner();

        // Форсируем загрузку (если ещё не загружено) и только потом рендерим.
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

        this._closeEulaModal();
        this._cancelCapture();
        this._stopNowTimer();
    };

    SettingsModal.prototype.toggle = function() {
        if (this._isOpen) this.close();
        else this.open();
    };

    SettingsModal.prototype.isOpen = function() { return this._isOpen; };

    // ============================================================
    // EULA MODAL
    // ============================================================

    SettingsModal.prototype._openEulaModal = function() {
        if (this._isEulaOpen) return;
        this._isEulaOpen = true;
        this._eulaOverlay.classList.add('is-open');

        var body = this._eulaOverlay.querySelector('#eulaModalBody');
        if (body) {
            body.scrollTop = 0;
            setTimeout(function() {
                try { body.focus(); } catch (e) {}
            }, 250);
        }
    };

    SettingsModal.prototype._closeEulaModal = function() {
        if (!this._isEulaOpen) return;
        this._isEulaOpen = false;
        this._eulaOverlay.classList.remove('is-open');
    };

    SettingsModal.prototype.isEulaOpen = function() { return this._isEulaOpen; };

    // ============================================================
    // ПРОФИЛЬ
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

    // ============================================================
    // ПРОФИЛЬ — ЭКСПОРТ / ИМПОРТ
    // ============================================================

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

                // Перерисовываем UI поверх нового состояния
                self._renderProfile();
                self._renderThemeMode();
                self._renderHotkeys();

                // Уведомляем остальную систему
                document.dispatchEvent(new CustomEvent('profile:imported', {
                    detail: { applied: res.applied, errors: res.errors }
                }));

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

    SettingsModal.prototype._downloadEULA = function() {
        try {
            var blob = new Blob([EULA_TEXT], { type: 'text/markdown;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'EULA.md';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

            if (window.__lsystem) window.__lsystem.showNotification('EULA.md скачан', 'success');
        } catch (e) {
            console.error('[SettingsModal] Download EULA error:', e);
            if (window.__lsystem) window.__lsystem.showNotification('Ошибка скачивания', 'error');
        }
    };

    // ============================================================
    // ТЕМА
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
    // ПЛАГИНЫ — рабочая папка
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
    // ПЛАГИНЫ — события
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
    // ПЛАГИНЫ — рендер
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
    // ПЛАГИНЫ — модалка установки по URL
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
    // ХОТКЕИ
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
    // APPLY
    // ============================================================

    SettingsModal.prototype._applyAll = function() {
        this._saveProfile();
        this.close();
        if (window.__lsystem) {
            window.__lsystem.showNotification('Настройки применены', 'success');
        }
    };

    // ============================================================
    // УТИЛИТЫ
    // ============================================================

    SettingsModal.prototype._notifyStub = function(title, message) {
        if (window.__lsystem) {
            window.__lsystem.showNotification(title + ' — ' + message, 'info', 2400);
        } else {
            console.log('[SettingsModal stub]', title, '—', message);
        }
    };

    // ============================================================
    // УНИЧТОЖЕНИЕ
    // ============================================================

    SettingsModal.prototype.destroy = function() {
        this._cancelCapture();
        this._stopNowTimer();
        this._closeEulaModal();

        for (var i = 0; i < this._closeHandlers.length; i++) {
            try { this._closeHandlers[i](); } catch (e) {}
        }
        this._closeHandlers = [];

        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;

        if (this._eulaOverlay && this._eulaOverlay.parentNode) {
            this._eulaOverlay.parentNode.removeChild(this._eulaOverlay);
        }
        this._eulaOverlay = null;
    };

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SettingsModal: SettingsModal, EULA_TEXT: EULA_TEXT };
    }

    if (typeof window !== 'undefined') {
        window.SettingsModal = SettingsModal;
        window.SettingsModal.EULA_TEXT = EULA_TEXT;
    }

})();