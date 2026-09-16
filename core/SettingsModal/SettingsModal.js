// core/SettingsModal/SettingsModal.js
// Версия 10.0.0 — EULA как информационный блок (без принятия и гейта).
// - Нет чекбокса, нет eulaAccepted, нет profile-ready, нет gate.
// - EULA — только текст + кнопки "Скачать .md" и "Открыть".
// - Профиль: только Имя / Организация.

(function() {
    'use strict';

    console.log('[SettingsModal] Loading v10.0.0...');

    var LS_MANIFEST_OVERRIDE = 'lsystem_window_manifest_override';
    var WINDOW_MANIFEST_URL = 'data/window/window.json';

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

    // ============================================================
    // HTML — SettingsModal
    // ============================================================

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

        /* ===== ПРОФИЛЬ ===== */
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

        /* ===== ТЕМА ===== */
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

        /* ===== ПЛАГИНЫ ===== */
        '            <section class="settings-group">',
        '                <header class="settings-group__header">',
        '                    <svg class="icon-svg settings-group__icon"><use href="#icon-refresh"></use></svg>',
        '                    <span class="settings-group__title">Плагины</span>',
        '                    <span class="settings-group__count" id="pluginsCount">0</span>',
        '                    <button class="plugins-show-hidden-btn" id="pluginsShowHiddenBtn" type="button" title="Показать скрытые" style="display:none;">',
        '                        <svg class="icon-svg"><use href="#icon-eye"></use></svg>',
        '                        <span class="plugins-show-hidden-btn__label">Скрытых: <span id="pluginsHiddenCount">0</span></span>',
        '                    </button>',
        '                </header>',
        '                <div class="settings-group__body">',

        '                    <div class="plugins-toolbar">',
        '                        <div class="plugins-search">',
        '                            <svg class="plugins-search__icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
        '                            <input type="text" class="plugins-search__input" id="pluginsSearchInput" placeholder="Поиск плагинов..." autocomplete="off" />',
        '                        </div>',
        '                        <button class="settings-btn settings-btn--ghost" id="pluginsRefreshBtn" type="button" title="Обновить из манифеста">',
        '                            <svg class="icon-svg"><use href="#icon-refresh"></use></svg>',
        '                        </button>',
        '                    </div>',

        '                    <div class="plugins-list" id="pluginsList"></div>',

        '                    <div class="settings-group__actions">',
        '                        <button class="settings-btn settings-btn--ghost" id="pluginsDownloadBtn" type="button" title="Скачать window.json">',
        '                            <svg class="icon-svg"><use href="#icon-download"></use></svg>',
        '                            <span>Скачать window.json</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--ghost" id="pluginsResetBtn" type="button" title="Сбросить override манифеста">',
        '                            <svg class="icon-svg"><use href="#icon-trash"></use></svg>',
        '                            <span>Сбросить</span>',
        '                        </button>',
        '                        <button class="settings-btn settings-btn--primary" id="pluginsReloadBtn" type="button">',
        '                            <svg class="icon-svg"><use href="#icon-refresh"></use></svg>',
        '                            <span>Перезагрузить</span>',
        '                        </button>',
        '                    </div>',

        '                </div>',
        '            </section>',

        /* ===== ХОТКЕИ ===== */
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

    // ============================================================
    // HTML — EULA Modal
    // ============================================================

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

    // ============================================================
    // Markdown
    // ============================================================

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

    // ============================================================
    // КЛАСС
    // ============================================================

    function SettingsModal() {
        this._overlay = null;
        this._eulaOverlay = null;
        this._isOpen = false;
        this._isEulaOpen = false;
        this._capturingCombo = null;
        this._captureHandler = null;
        this._closeHandlers = [];
        this._nowTimer = null;

        this._pluginsSearchQuery = '';
        this._showHiddenPlugins = false;

        this._baseManifest = { groups: {} };
        this._overrideManifest = null;
        this._manifestLoaded = false;

        this._init();
    }

    SettingsModal.prototype._init = function() {
        console.log('[SettingsModal] Initializing v10.0.0...');

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
        console.log('[SettingsModal] ✅ Ready v10.0.0');
    };

    // ============================================================
    // МАНИФЕСТ
    // ============================================================

    SettingsModal.prototype._loadOverride = function() {
        try {
            var raw = localStorage.getItem(LS_MANIFEST_OVERRIDE);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.groups || typeof parsed.groups !== 'object') return null;
            return parsed;
        } catch (e) {
            return null;
        }
    };

    SettingsModal.prototype._saveOverride = function(manifest) {
        try {
            if (!manifest) {
                localStorage.removeItem(LS_MANIFEST_OVERRIDE);
                this._overrideManifest = null;
            } else {
                var payload = { groups: {} };
                for (var g in manifest.groups) {
                    if (!Object.prototype.hasOwnProperty.call(manifest.groups, g)) continue;
                    payload.groups[g] = manifest.groups[g].map(function(e) {
                        return { file: e.file, hidden: !!e.hidden };
                    });
                }
                localStorage.setItem(LS_MANIFEST_OVERRIDE, JSON.stringify(payload));
                this._overrideManifest = payload;
            }
        } catch (e) {}
    };

    SettingsModal.prototype._normalizeEntry = function(entry) {
        if (typeof entry === 'string') {
            return { file: entry, hidden: false };
        }
        if (entry && typeof entry === 'object') {
            return {
                file: String(entry.file || ''),
                hidden: !!entry.hidden
            };
        }
        return null;
    };

    SettingsModal.prototype._normalizeRaw = function(raw) {
        var result = { groups: {} };
        if (!raw || typeof raw !== 'object') return result;

        if (raw.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups)) {
            for (var g in raw.groups) {
                if (!Object.prototype.hasOwnProperty.call(raw.groups, g)) continue;
                var list = raw.groups[g];
                if (!Array.isArray(list)) continue;
                var entries = [];
                for (var i = 0; i < list.length; i++) {
                    var norm = this._normalizeEntry(list[i]);
                    if (norm && norm.file && /\.js$/i.test(norm.file)) {
                        entries.push(norm);
                    }
                }
                if (entries.length > 0) result.groups[g] = entries;
            }
            return result;
        }

        if (Array.isArray(raw.files)) {
            var entries2 = [];
            for (var j = 0; j < raw.files.length; j++) {
                var f = raw.files[j];
                if (typeof f === 'string' && /\.js$/i.test(f)) {
                    entries2.push({ file: f, hidden: false });
                }
            }
            if (entries2.length > 0) result.groups['Other'] = entries2;
        }

        return result;
    };

    SettingsModal.prototype._fetchBaseManifest = async function() {
        try {
            var url = WINDOW_MANIFEST_URL + '?_=' + Date.now();
            var res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) {
                console.warn('[SettingsModal] window.json not found (status ' + res.status + ')');
                this._baseManifest = { groups: {} };
                return;
            }
            var raw = await res.json();
            this._baseManifest = this._normalizeRaw(raw);
            console.log('[SettingsModal] window.json loaded:',
                Object.keys(this._baseManifest.groups).length, 'groups');
        } catch (e) {
            console.warn('[SettingsModal] Error fetching window.json:', e);
            this._baseManifest = { groups: {} };
        }
    };

    SettingsModal.prototype._getEffectiveManifest = function() {
        var result = { groups: {} };

        for (var g in this._baseManifest.groups) {
            if (!Object.prototype.hasOwnProperty.call(this._baseManifest.groups, g)) continue;
            result.groups[g] = this._baseManifest.groups[g].map(function(e) {
                return { file: e.file, hidden: !!e.hidden };
            });
        }

        if (this._overrideManifest && this._overrideManifest.groups) {
            var override = this._overrideManifest.groups;

            var overrideMap = {};
            for (var og in override) {
                if (!Object.prototype.hasOwnProperty.call(override, og)) continue;
                var list = override[og];
                if (!Array.isArray(list)) continue;
                for (var oi = 0; oi < list.length; oi++) {
                    var norm = this._normalizeEntry(list[oi]);
                    if (norm && norm.file) {
                        overrideMap[norm.file] = {
                            group: og,
                            hidden: !!norm.hidden
                        };
                    }
                }
            }

            for (var bg in result.groups) {
                if (!Object.prototype.hasOwnProperty.call(result.groups, bg)) continue;
                result.groups[bg] = result.groups[bg].map(function(e) {
                    if (overrideMap[e.file]) {
                        return { file: e.file, hidden: overrideMap[e.file].hidden };
                    }
                    return e;
                });
            }

            var flat = [];
            for (var fg in result.groups) {
                if (!Object.prototype.hasOwnProperty.call(result.groups, fg)) continue;
                for (var fi = 0; fi < result.groups[fg].length; fi++) {
                    var entry = result.groups[fg][fi];
                    var ov = overrideMap[entry.file];
                    flat.push({
                        file: entry.file,
                        hidden: ov ? ov.hidden : entry.hidden,
                        group: ov ? ov.group : fg
                    });
                }
            }

            for (var of_ in overrideMap) {
                if (!Object.prototype.hasOwnProperty.call(overrideMap, of_)) continue;
                var exists = false;
                for (var k = 0; k < flat.length; k++) {
                    if (flat[k].file === of_) { exists = true; break; }
                }
                if (!exists) {
                    flat.push({
                        file: of_,
                        hidden: overrideMap[of_].hidden,
                        group: overrideMap[of_].group
                    });
                }
            }

            result.groups = {};
            for (var n = 0; n < flat.length; n++) {
                var f = flat[n];
                if (!result.groups[f.group]) result.groups[f.group] = [];
                result.groups[f.group].push({
                    file: f.file,
                    hidden: f.hidden
                });
            }
        }

        return result;
    };

    SettingsModal.prototype._setHiddenFlag = function(filename, hidden) {
        var manifest = this._getEffectiveManifest();

        var found = false;
        for (var g in manifest.groups) {
            if (!Object.prototype.hasOwnProperty.call(manifest.groups, g)) continue;
            for (var i = 0; i < manifest.groups[g].length; i++) {
                if (manifest.groups[g][i].file === filename) {
                    manifest.groups[g][i].hidden = !!hidden;
                    found = true;
                }
            }
        }

        if (!found) {
            if (!manifest.groups['Other']) manifest.groups['Other'] = [];
            manifest.groups['Other'].push({ file: filename, hidden: !!hidden });
        }

        this._saveOverride(manifest);
    };

    SettingsModal.prototype._setGroup = function(filename, groupName) {
        if (!filename || !groupName) return;

        var manifest = this._getEffectiveManifest();

        var hidden = false;
        for (var g in manifest.groups) {
            if (!Object.prototype.hasOwnProperty.call(manifest.groups, g)) continue;
            for (var i = 0; i < manifest.groups[g].length; i++) {
                if (manifest.groups[g][i].file === filename) {
                    hidden = manifest.groups[g][i].hidden;
                }
            }
            manifest.groups[g] = manifest.groups[g].filter(function(e) {
                return e.file !== filename;
            });
            if (manifest.groups[g].length === 0) delete manifest.groups[g];
        }

        if (!manifest.groups[groupName]) manifest.groups[groupName] = [];
        manifest.groups[groupName].push({ file: filename, hidden: hidden });

        this._saveOverride(manifest);
    };

    // ============================================================
    // СОБЫТИЯ
    // ============================================================

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

        overlay.querySelector('#eulaDownloadBtn').addEventListener('click', function() {
            self._downloadEULA();
        });

        overlay.querySelector('#eulaOpenBtn').addEventListener('click', function() {
            self._openEulaModal();
        });

        overlay.querySelector('#profileName').addEventListener('input', function() {
            self._updateSaveState();
        });

        eulaOverlay.querySelector('#eulaModalDownloadBtn').addEventListener('click', function() {
            self._downloadEULA();
        });

        // ===== Тема =====
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
        this._startNowTimer();

        var self = this;
        this._loadOverride();
        this._fetchBaseManifest().then(function() {
            self._manifestLoaded = true;
            self._renderPluginsList();
        });

        this._renderPluginsList();

        setTimeout(function() {
            var inp = self._overlay.querySelector('#profileName');
            if (inp) inp.focus();
        }, 100);

        console.log('[SettingsModal] Opened');
    };

    SettingsModal.prototype.close = function() {
        if (!this._isOpen) return;

        this._isOpen = false;
        this._overlay.classList.remove('is-open');

        this._closeEulaModal();
        this._cancelCapture();
        this._stopNowTimer();
        console.log('[SettingsModal] Closed');
    };

    SettingsModal.prototype.toggle = function() {
        if (this._isOpen) {
            this.close();
        } else {
            this.open();
        }
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

        window.appState.setAccount(payload);

        if (window.__lsystem) {
            var welcomeName = name || 'пользователь';
            window.__lsystem.showNotification('Профиль сохранён: ' + welcomeName, 'success');
        }

        console.log('[SettingsModal] Profile saved:', { name: name });
        return true;
    };

    SettingsModal.prototype._clearProfile = function() {
        if (window.appState) window.appState.clearAccount();
        this._renderProfile();
        if (window.__lsystem) window.__lsystem.showNotification('Профиль сброшен', 'info');
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
            band.style.background = '';
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
    // ПЛАГИНЫ
    // ============================================================

    SettingsModal.prototype._bindPluginsEvents = function() {
        var self = this;
        var overlay = this._overlay;

        var searchInput = overlay.querySelector('#pluginsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                self._pluginsSearchQuery = searchInput.value || '';
                self._renderPluginsList();
            });
        }

        var showHiddenBtn = overlay.querySelector('#pluginsShowHiddenBtn');
        if (showHiddenBtn) {
            showHiddenBtn.addEventListener('click', function() {
                self._showHiddenPlugins = !self._showHiddenPlugins;
                self._renderPluginsList();
            });
        }

        var refreshBtn = overlay.querySelector('#pluginsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async function() {
                refreshBtn.disabled = true;
                var orig = refreshBtn.innerHTML;
                refreshBtn.innerHTML = '<svg class="icon-svg icon-spin"><use href="#icon-refresh"></use></svg>';

                try {
                    self._loadOverride();
                    await self._fetchBaseManifest();
                    self._renderPluginsList();
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Манифест обновлён', 'success');
                    }
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = orig;
                }
            });
        }

        var downloadBtn = overlay.querySelector('#pluginsDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function() {
                self._downloadManifest();
            });
        }

        var resetBtn = overlay.querySelector('#pluginsResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                self._saveOverride(null);
                self._renderPluginsList();
                if (window.__lsystem) {
                    window.__lsystem.showNotification('Изменения манифеста сброшены', 'info');
                }
            });
        }

        var reloadBtn = overlay.querySelector('#pluginsReloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', async function() {
                var btn = reloadBtn;
                var origText = btn.innerHTML;
                btn.innerHTML = '<span>Загрузка…</span>';
                btn.disabled = true;

                try {
                    if (window.pluginSystem && typeof window.pluginSystem.reload === 'function') {
                        await window.pluginSystem.reload();
                        self._loadOverride();
                        await self._fetchBaseManifest();
                        self._renderPluginsList();
                        if (window.__lsystem) {
                            window.__lsystem.showNotification('Плагины перезагружены', 'success');
                        }
                    }
                } catch (err) {
                    console.error('[SettingsModal] Reload plugins error:', err);
                    if (window.__lsystem) {
                        window.__lsystem.showNotification('Ошибка перезагрузки', 'error');
                    }
                } finally {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                }
            });
        }
    };

    SettingsModal.prototype._downloadManifest = function() {
        var manifest = this._getEffectiveManifest();

        var payload = { groups: {} };
        for (var g in manifest.groups) {
            if (!Object.prototype.hasOwnProperty.call(manifest.groups, g)) continue;
            payload.groups[g] = manifest.groups[g].map(function(e) {
                return { file: e.file, hidden: !!e.hidden };
            });
        }

        var json = JSON.stringify(payload, null, 2);
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'window.json';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

        if (window.__lsystem) {
            window.__lsystem.showNotification('window.json скачан', 'success');
        }
    };

    SettingsModal.prototype._buildPluginsData = function() {
        var manifest = this._getEffectiveManifest();

        var byFile = {};

        for (var g in manifest.groups) {
            if (!Object.prototype.hasOwnProperty.call(manifest.groups, g)) continue;
            var list = manifest.groups[g];
            for (var i = 0; i < list.length; i++) {
                var entry = list[i];
                if (!entry || !entry.file) continue;
                byFile[entry.file] = {
                    file: entry.file,
                    group: g,
                    hidden: !!entry.hidden
                };
            }
        }

        var ps = window.pluginSystem;
        var loadedByFile = {};

        if (ps && typeof ps.getPlugins === 'function') {
            var plugins = ps.getPlugins();
            for (var j = 0; j < plugins.length; j++) {
                var plugin = plugins[j];
                var file = plugin.file;
                if (!file) continue;

                if (!byFile[file]) {
                    byFile[file] = {
                        file: file,
                        group: plugin.group || 'Other',
                        hidden: false
                    };
                }

                var reg = window.__registry ? window.__registry.getType(plugin.id) : null;

                loadedByFile[file] = {
                    id: plugin.id,
                    name: plugin.name,
                    displayName: (reg && reg.name) || plugin.id,
                    icon: (reg && reg.icon) || 'icon-window',
                    loaded: true,
                    type: plugin.type || 'window',
                    autoRegistered: !!plugin.autoRegistered
                };
            }
        }

        var result = [];
        for (var filename in byFile) {
            if (!Object.prototype.hasOwnProperty.call(byFile, filename)) continue;
            var meta = byFile[filename];
            var loaded = loadedByFile[filename] || null;

            result.push({
                file: filename,
                group: meta.group || 'Other',
                hidden: !!meta.hidden,
                id: loaded ? loaded.id : null,
                displayName: loaded ? loaded.displayName : filename.replace(/\.js$/, ''),
                icon: loaded ? loaded.icon : (meta.hidden ? 'icon-eye-off' : 'icon-window'),
                loaded: !!loaded,
                type: loaded ? loaded.type : (meta.hidden ? 'hidden' : 'pending'),
                autoRegistered: loaded ? loaded.autoRegistered : false
            });
        }

        result.sort(function(a, b) {
            if (a.group !== b.group) return a.group.localeCompare(b.group);
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        return result;
    };

    SettingsModal.prototype._renderPluginsList = function() {
        var listEl = this._overlay.querySelector('#pluginsList');
        if (!listEl) return;

        var countEl = this._overlay.querySelector('#pluginsCount');
        var showHiddenBtn = this._overlay.querySelector('#pluginsShowHiddenBtn');

        var all = this._buildPluginsData();

        var hiddenCount = 0;
        for (var i = 0; i < all.length; i++) {
            if (all[i].hidden) hiddenCount++;
        }

        if (showHiddenBtn) {
            if (hiddenCount > 0) {
                showHiddenBtn.style.display = 'inline-flex';
                showHiddenBtn.classList.toggle('is-active', this._showHiddenPlugins);
                var label = showHiddenBtn.querySelector('.plugins-show-hidden-btn__label');
                if (label) {
                    label.innerHTML = this._showHiddenPlugins
                        ? 'Скрыть'
                        : 'Скрытых: <span id="pluginsHiddenCount">' + hiddenCount + '</span>';
                }
            } else {
                showHiddenBtn.style.display = 'none';
                this._showHiddenPlugins = false;
            }
        }

        var plugins = all.filter(function(p) {
            if (p.hidden && !this._showHiddenPlugins) return false;
            return true;
        }, this);

        var query = (this._pluginsSearchQuery || '').toLowerCase().trim();
        if (query) {
            plugins = plugins.filter(function(p) {
                var inName = (p.displayName || '').toLowerCase().indexOf(query) !== -1;
                var inFile = (p.file || '').toLowerCase().indexOf(query) !== -1;
                var inGroup = (p.group || '').toLowerCase().indexOf(query) !== -1;
                return inName || inFile || inGroup;
            });
        }

        if (countEl) countEl.textContent = plugins.length;

        if (plugins.length === 0) {
            listEl.innerHTML = '<div class="plugins-list__empty">' +
                (query ? 'Ничего не найдено'
                    : (this._showHiddenPlugins ? 'Нет скрытых' : 'Нет плагинов')) + '</div>';
            return;
        }

        var groupSet = {};
        all.forEach(function(p) {
            if (p.group) groupSet[p.group] = true;
        });
        var groupNames = Object.keys(groupSet).sort();

        var self = this;
        listEl.innerHTML = '';

        plugins.forEach(function(p) {
            listEl.appendChild(self._makePluginRow(p, groupNames));
        });

        var existingList = this._overlay.querySelector('#pluginsGroupList');
        if (existingList) existingList.remove();

        var datalist = document.createElement('datalist');
        datalist.id = 'pluginsGroupList';
        groupNames.forEach(function(g) {
            var opt = document.createElement('option');
            opt.value = g;
            datalist.appendChild(opt);
        });
        listEl.appendChild(datalist);
    };

    SettingsModal.prototype._makePluginRow = function(p, groupNames) {
        var self = this;
        var isHidden = !!p.hidden;

        var row = document.createElement('div');
        row.className = 'plugin-row' + (isHidden ? ' is-hidden' : '');
        row.dataset.file = p.file;

        var main = document.createElement('div');
        main.className = 'plugin-row__main';

        var iconEl = document.createElement('div');
        iconEl.className = 'plugin-row__icon';
        if (isHidden) {
            iconEl.innerHTML = '<svg class="icon-svg"><use href="#icon-eye-off"></use></svg>';
        } else if (p.icon && p.icon.indexOf('icon-') === 0) {
            iconEl.innerHTML = '<svg class="icon-svg"><use href="#' + p.icon + '"></use></svg>';
        } else {
            iconEl.textContent = p.icon || '📄';
        }
        main.appendChild(iconEl);

        var infoEl = document.createElement('div');
        infoEl.className = 'plugin-row__info';

        var nameEl = document.createElement('div');
        nameEl.className = 'plugin-row__name';
        nameEl.textContent = p.displayName || p.file;
        infoEl.appendChild(nameEl);

        var metaEl = document.createElement('div');
        metaEl.className = 'plugin-row__meta';
        var statusText = p.loaded ? 'loaded' : (isHidden ? 'hidden' : 'pending');
        metaEl.textContent = p.file + '  ·  ' + statusText;
        infoEl.appendChild(metaEl);

        main.appendChild(infoEl);

        var groupWrap = document.createElement('div');
        groupWrap.className = 'plugin-row__group';

        var groupInput = document.createElement('input');
        groupInput.type = 'text';
        groupInput.className = 'plugin-row__group-input';
        groupInput.value = p.group || 'Other';
        groupInput.placeholder = 'Группа';
        groupInput.setAttribute('list', 'pluginsGroupList');
        groupInput.title = isHidden ? 'Группа (файл скрыт)' : 'Изменить группу';
        groupInput.disabled = isHidden;

        if (!isHidden) {
            groupInput.addEventListener('change', function() {
                var newGroup = (groupInput.value || '').trim() || 'Other';
                if (newGroup === p.group) return;
                self._setGroup(p.file, newGroup);
                if (window.__lsystem) {
                    window.__lsystem.showNotification(
                        'Группа изменена: ' + newGroup + ' (перезагрузите)', 'info', 2500
                    );
                }
            });
        }

        groupWrap.appendChild(groupInput);
        main.appendChild(groupWrap);

        var hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'plugin-row__btn';
        hideBtn.title = isHidden
            ? 'Показать (файл снова будет загружаться)'
            : 'Скрыть (файл не будет загружаться)';
        hideBtn.innerHTML = '<svg class="icon-svg"><use href="#' + (isHidden ? 'icon-eye' : 'icon-eye-off') + '"></use></svg>';

        hideBtn.addEventListener('click', async function() {
            self._setHiddenFlag(p.file, !isHidden);

            var btnOriginalHTML = hideBtn.innerHTML;
            hideBtn.innerHTML = '<svg class="icon-svg icon-spin"><use href="#icon-refresh"></use></svg>';
            hideBtn.disabled = true;

            try {
                if (window.pluginSystem && typeof window.pluginSystem.reload === 'function') {
                    await window.pluginSystem.reload();
                }
                self._loadOverride();
                await self._fetchBaseManifest();
            } catch (err) {
                console.error('[SettingsModal] Auto-reload error:', err);
            } finally {
                hideBtn.disabled = false;
                hideBtn.innerHTML = btnOriginalHTML;
            }

            self._renderPluginsList();

            if (window.__lsystem) {
                window.__lsystem.showNotification(
                    isHidden ? 'Плагин показан' : 'Плагин скрыт',
                    'info',
                    1500
                );
            }
        });

        main.appendChild(hideBtn);
        row.appendChild(main);

        return row;
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

            for (var originalCombo in globalHotkeys) {
                if (!Object.prototype.hasOwnProperty.call(globalHotkeys, originalCombo)) continue;
                var entry = globalHotkeys[originalCombo];
                globalList.appendChild(this._makeHotkeyRow({
                    originalCombo: originalCombo,
                    combo: entry.combo || originalCombo,
                    label: entry.label || originalCombo,
                    source: 'global'
                }, 'global', null));
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

                var title = document.createElement('div');
                title.className = 'settings-subgroup__title';
                title.textContent = typeId;
                section.appendChild(title);

                var inner = document.createElement('div');
                inner.className = 'settings-hotkeys';

                for (var origCombo in bucket) {
                    if (!Object.prototype.hasOwnProperty.call(bucket, origCombo)) continue;
                    var e2 = bucket[origCombo];
                    inner.appendChild(this._makeHotkeyRow({
                        originalCombo: origCombo,
                        combo: e2.combo || origCombo,
                        label: e2.label || origCombo,
                        source: typeId
                    }, 'window', typeId));
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
        if (window.appState) {
            var overrides = window.appState.getHotkeyOverrides();
            var conflict = null;

            if (scope === 'global') {
                var globalMap = overrides.global || {};
                for (var key in globalMap) {
                    if (Object.prototype.hasOwnProperty.call(globalMap, key) &&
                        key !== originalCombo &&
                        globalMap[key].combo === newCombo) {
                        conflict = key;
                        break;
                    }
                }
            } else if (scope === 'window' && typeId) {
                var windowMap = (overrides.windows && overrides.windows[typeId]) || {};
                for (var key2 in windowMap) {
                    if (Object.prototype.hasOwnProperty.call(windowMap, key2) &&
                        key2 !== originalCombo &&
                        windowMap[key2].combo === newCombo) {
                        conflict = key2;
                        break;
                    }
                }
            }

            if (conflict) {
                if (window.__lsystem) {
                    window.__lsystem.showNotification(
                        'Конфликт: ' + newCombo + ' уже назначен на ' + conflict,
                        'warning'
                    );
                }
            }

            window.appState.setHotkeyOverride(scope, typeId, originalCombo, newCombo);
        }

        if (!window.hotkeyRegistry) return;

        if (scope === 'global') {
            window.hotkeyRegistry.rebindGlobal(oldCombo, newCombo);
        } else if (scope === 'window' && typeId) {
            if (window.layoutManager) {
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

        console.log('[SettingsModal] Destroyed');
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
        console.log('[SettingsModal] Registered globally v10.0.0');
    }

})();