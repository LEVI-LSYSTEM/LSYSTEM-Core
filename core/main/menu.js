// core/main/menu.js
// Версия 1.0.0

(function() {
    'use strict';

    var LsUI = window.LsUI || {};

    var SVG_NS = 'http://www.w3.org/2000/svg';

    var _windowSearchQuery = '';
    var _pluginsTab = 'active';

    var el = {};

    function cacheElements() {
        el.windowTypeMenu = document.getElementById('windowTypeMenu');
        el.historyMenu = document.getElementById('historyMenu');
        el.recentList = document.getElementById('recentProjectsList');
    }

    // ============================================================
    // 1. HELPERS
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

    function cssEscape(s) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(s);
        }
        return String(s).replace(/([^\w-])/g, '\\$1');
    }

    function makeSvgIcon(iconId, size, color) {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'icon-svg');
        svg.style.cssText = [
            'width:' + size + 'px',
            'height:' + size + 'px',
            'flex-shrink:0',
            'fill:' + (color || 'currentColor'),
            'display:block',
            'margin:0'
        ].join(';');

        var use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', '#' + iconId);
        svg.appendChild(use);
        return svg;
    }

    function makeSvgIconString(iconId, size, className) {
        var s = size || 14;
        var cls = 'icon-svg' + (className ? ' ' + className : '');
        return '<svg class="' + cls + '" style="width:' + s + 'px;height:' + s +
            'px;flex-shrink:0;display:block;margin:0;fill:currentColor;">' +
            '<use href="#' + iconId + '"></use></svg>';
    }

    function resolveIconName(icon, fallback) {
        if (typeof icon === 'string' && icon.startsWith('icon-')) return icon;
        return fallback || 'icon-data';
    }

    // ============================================================
    // 2. WINDOW MENU
    // ============================================================

    function populateWindowMenu() {
        if (!el.windowTypeMenu) return;

        var registry = window.__registry;
        if (!registry) {
            el.windowTypeMenu.innerHTML =
                '<div class="window-menu__empty">Реестр не инициализирован</div>';
            return;
        }

        var layout = window.layoutManager;
        var appState = window.appState;
        if (!layout || !appState) return;

        var query = (_windowSearchQuery || '').toLowerCase().trim();

        var minimized = layout.getMinimizedWindows();
        var groups = registry.getTypesByGroup();
        var collapsed = appState.getCollapsedGroups();

        var html = '';

        html += [
            '<div class="window-menu__search">',
            '    <input type="text" class="window-menu__search-input" id="windowMenuSearchInput"',
            '        placeholder="Поиск..."',
            '        value="' + escapeHtml(_windowSearchQuery || '') + '" />',
            '</div>'
        ].join('\n');

        html += '<div class="window-menu__scroll">';

        var visibleMinimized = minimized.filter(function(w) {
            return !query || matchesQuery(w, query);
        });

        if (visibleMinimized.length > 0) {
            html += '<div class="window-menu__section">' +
                makeSvgIconString('icon-archive', 10) +
                ' Свёрнутые <span class="window-menu__count">' +
                visibleMinimized.length + '</span></div>';

            for (var i = 0; i < visibleMinimized.length; i++) {
                html += renderMinimizedItem(visibleMinimized[i]);
            }
        }

        var groupNames = Object.keys(groups).sort();
        var hasAnyType = false;

        for (var g = 0; g < groupNames.length; g++) {
            var groupName = groupNames[g];
            var types = groups[groupName] || [];

            var visibleTypes = types.filter(function(t) {
                return !query || matchesTypeQuery(t, query);
            });

            if (visibleTypes.length === 0) continue;
            hasAnyType = true;

            var isCollapsed = !!collapsed[groupName];
            var arrowIcon = isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down';

            html += '<button type="button" class="window-menu__group-header" data-group-toggle="' +
                escapeHtml(groupName) + '">' +
                '<span class="window-menu__group-arrow">' + makeSvgIconString(arrowIcon, 10) + '</span>' +
                '<span class="window-menu__group-name">' + escapeHtml(groupName) + '</span>' +
                '<span class="window-menu__count">' + visibleTypes.length + '</span>' +
                '</button>' +
                '<div class="window-menu__group-items" data-group-items="' +
                escapeHtml(groupName) + '" style="display:' +
                (isCollapsed ? 'none' : 'block') + ';">';

            for (var t = 0; t < visibleTypes.length; t++) {
                html += renderTypeItem(visibleTypes[t]);
            }

            html += '</div>';
        }

        if (!hasAnyType && visibleMinimized.length === 0) {
            html += '<div class="window-menu__empty">' +
                (query ? 'Ничего не найдено' : 'Нет типов окон') + '</div>';
        }

        html += '</div>';

        el.windowTypeMenu.innerHTML = html;

        bindWindowMenuEvents();
    }

    function bindWindowMenuEvents() {
        var searchInput = el.windowTypeMenu.querySelector('#windowMenuSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                _windowSearchQuery = e.target.value;

                var selStart = searchInput.selectionStart;
                var selEnd = searchInput.selectionEnd;

                populateWindowMenu();

                var newInput = el.windowTypeMenu.querySelector('#windowMenuSearchInput');
                if (newInput) {
                    newInput.focus();
                    try { newInput.setSelectionRange(selStart, selEnd); } catch (err) {}
                }
            });

            searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
            searchInput.addEventListener('keydown', function(e) { e.stopPropagation(); });
        }

        el.windowTypeMenu.querySelectorAll('[data-group-toggle]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var groupName = btn.dataset.groupToggle;
                if (!groupName) return;

                if (window.appState) {
                    window.appState.toggleGroupCollapsed(groupName);
                }

                var items = el.windowTypeMenu.querySelector('[data-group-items="' + cssEscape(groupName) + '"]');
                var arrow = btn.querySelector('.window-menu__group-arrow');
                var isCollapsed = window.appState ? window.appState.isGroupCollapsed(groupName) : false;

                if (items) items.style.display = isCollapsed ? 'none' : 'block';
                if (arrow) {
                    arrow.innerHTML = makeSvgIconString(
                        isCollapsed ? 'icon-chevron-right' : 'icon-chevron-down',
                        10
                    );
                }
            });
        });

        el.windowTypeMenu.querySelectorAll('.window-menu__item[data-type]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var type = btn.dataset.type;
                if (!type) return;

                if (window.__lsystem && typeof window.__lsystem.createWindow === 'function') {
                    window.__lsystem.createWindow(type);
                }
                if (window.LsDropdowns) {
                    window.LsDropdowns.closeDropdown(window.LsDropdowns.getElements().newWindowDropdown);
                }
            });
        });

        el.windowTypeMenu.querySelectorAll('.window-menu__item[data-minimized-id]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var wid = btn.dataset.minimizedId;
                if (wid && window.layoutManager) {
                    window.layoutManager.restoreWindow(wid);
                    if (window.LsDropdowns) {
                        window.LsDropdowns.closeDropdown(window.LsDropdowns.getElements().newWindowDropdown);
                    }
                }
            });
        });
    }

    function renderTypeItem(type) {
        var iconId = resolveIconName(type.icon, 'icon-window-type');
        return '<button class="window-menu__item" data-type="' + escapeHtml(type.id) + '">' +
            makeSvgIconString(iconId, 14, 'window-menu__icon') +
            '<span class="window-menu__label">' + escapeHtml(type.name) + '</span></button>';
    }

    function renderMinimizedItem(w) {
        var iconId = resolveIconName(w.icon, 'icon-window-type');
        return '<button class="window-menu__item window-menu__item--minimized" data-minimized-id="' +
            escapeHtml(String(w.id)) + '">' +
            makeSvgIconString(iconId, 14, 'window-menu__icon') +
            '<span class="window-menu__label">' + escapeHtml(w.title || ('#' + w.id)) + '</span>' +
            '<span class="window-menu__id">#' + escapeHtml(String(w.id)) + '</span></button>';
    }

    function matchesQuery(w, query) {
        var title = (w.title || '').toLowerCase();
        var type = (w.type || '').toLowerCase();
        var slot = (w.slotId || '').toLowerCase();
        return title.indexOf(query) !== -1
            || type.indexOf(query) !== -1
            || slot.indexOf(query) !== -1;
    }

    function matchesTypeQuery(type, query) {
        var name = (type.name || '').toLowerCase();
        var id = (type.id || '').toLowerCase();
        return name.indexOf(query) !== -1 || id.indexOf(query) !== -1;
    }

    function resetSearch() {
        _windowSearchQuery = '';
    }

    // ============================================================
    // 3. HISTORY MENU
    // ============================================================

    function renderHistoryMenu() {
        if (!el.historyMenu) return;
        if (!window.historyManager) return;

        var hm = window.historyManager;
        var entries = hm.getHistory() || [];
        var currentIndex = hm.getIndex();
        var canUndo = hm.canUndo();
        var canRedo = hm.canRedo();

        el.historyMenu.innerHTML = '';

        var actionsRow = document.createElement('div');
        actionsRow.className = 'history-actions-row';

        var undoBtn = makeHistoryActionButton('icon-undo', 'Undo', 'Ctrl+Z', canUndo, function() {
            if (hm.canUndo() && window.LsProjects) {
                window.LsProjects.doHistoryUndo();
            }
            closeHistoryDropdown();
        });

        var redoBtn = makeHistoryActionButton('icon-redo', 'Redo', 'Ctrl+Y', canRedo, function() {
            if (hm.canRedo() && window.LsProjects) {
                window.LsProjects.doHistoryRedo();
            }
            closeHistoryDropdown();
        });

        actionsRow.appendChild(undoBtn);
        actionsRow.appendChild(redoBtn);
        el.historyMenu.appendChild(actionsRow);

        var list = document.createElement('div');
        list.className = 'history-list';

        if (entries.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.textContent = 'Нет действий';
            list.appendChild(empty);
        } else {
            var sorted = entries.slice().sort(function(a, b) { return b.index - a.index; });
            for (var i = 0; i < sorted.length; i++) {
                list.appendChild(makeHistoryEntryRow(sorted[i], currentIndex));
            }
        }

        el.historyMenu.appendChild(list);

        var footer = document.createElement('div');
        footer.className = 'history-footer';
        var total = hm.getSize();
        footer.textContent = total === 0 ? 'История пуста' : (currentIndex + 1) + ' / ' + total;
        el.historyMenu.appendChild(footer);
    }

    function makeHistoryActionButton(iconId, label, shortcut, enabled, onClick) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-action-btn';
        btn.disabled = !enabled;
        btn.title = label + ' (' + shortcut + ')';

        btn.appendChild(makeSvgIcon(iconId, 14));

        var labelEl = document.createElement('span');
        labelEl.textContent = label;
        btn.appendChild(labelEl);

        if (enabled) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                onClick();
            });
        }
        return btn;
    }

    function makeHistoryEntryRow(entry, currentIndex) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'history-entry'
            + (entry.index === currentIndex ? ' is-current' : '')
            + (entry.index > currentIndex ? ' is-future' : '');

        var isCurrent = entry.index === currentIndex;

        var marker = document.createElement('span');
        marker.className = 'history-marker';
        marker.textContent = isCurrent ? '●' : '○';
        row.appendChild(marker);

        var idx = document.createElement('span');
        idx.className = 'history-index';
        idx.textContent = '#' + entry.index;
        row.appendChild(idx);

        var label = document.createElement('span');
        label.className = 'history-label';
        label.textContent = entry.label || 'Действие';
        row.appendChild(label);

        if (!isCurrent) {
            var jumpBtn = document.createElement('span');
            jumpBtn.className = 'history-jump-btn';
            jumpBtn.title = 'Перейти к состоянию #' + entry.index;
            jumpBtn.setAttribute('role', 'button');
            jumpBtn.setAttribute('tabindex', '0');

            jumpBtn.appendChild(makeSvgIcon('icon-arrow-right', 12));

            var doJump = function(e) {
                e.stopPropagation();
                e.preventDefault();
                if (window.LsProjects) {
                    window.LsProjects.doHistoryJumpTo(entry.index);
                }
                closeHistoryDropdown();
            };

            jumpBtn.addEventListener('click', doJump);
            jumpBtn.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') doJump(e);
            });

            row.appendChild(jumpBtn);
        }

        row.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isCurrent) return;
            if (window.LsProjects) {
                window.LsProjects.doHistoryJumpTo(entry.index);
            }
            closeHistoryDropdown();
        });

        return row;
    }

    function closeHistoryDropdown() {
        if (window.LsDropdowns && typeof window.LsDropdowns.closeDropdown === 'function') {
            window.LsDropdowns.closeDropdown(window.LsDropdowns.getElements().historyDropdown);
        }
    }

    // ============================================================
    // 4. RECENT PROJECTS
    // ============================================================

    function renderRecentProjects() {
        if (!el.recentList) return;

        var recent = (window.projectManager && window.projectManager.getRecentProjects)
            ? window.projectManager.getRecentProjects()
            : [];

        if (recent.length === 0) {
            el.recentList.innerHTML =
                '<div class="recent-empty">Нет недавних проектов</div>';
            return;
        }

        var currentPath = window.LsProjects && window.LsProjects.getState
            ? window.LsProjects.getState().projectPath
            : null;

        var html = '';
        for (var i = 0; i < recent.length; i++) {
            var path = recent[i];
            var name = String(path).split(/[\\/]/).pop() || path;
            var isActive = path === currentPath;
            var iconId = isActive ? 'icon-circle-filled' : 'icon-data';

            html += '<div class="recent-item" data-path="' + escapeHtml(path) +
                '" data-active="' + (isActive ? '1' : '0') +
                '" role="button" tabindex="0">' +
                '<span class="recent-icon">' + makeSvgIconString(iconId, 13) + '</span>' +
                '<span class="recent-name" title="' + escapeHtml(path) + '">' +
                escapeHtml(name) + '</span>' +
                '<span class="recent-path">' + escapeHtml(path) + '</span>' +
                '<button type="button" class="recent-remove" data-path="' +
                escapeHtml(path) + '" title="Удалить из недавних" aria-label="Удалить">' +
                makeSvgIconString('icon-close', 10) +
                '</button></div>';
        }

        el.recentList.innerHTML = html;

        el.recentList.querySelectorAll('.recent-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                if (e.target.closest('.recent-remove')) return;
                var path = item.dataset.path;
                if (!path) return;

                if (path === currentPath) {
                    if (LsUI && LsUI.showNotification) {
                        LsUI.showNotification('Этот проект уже открыт', 'info', 1500);
                    }
                    return;
                }

                if (window.LsDropdowns) {
                    window.LsDropdowns.closeDropdown(window.LsDropdowns.getElements().loadDropdown);
                }
                if (window.LsProjects) {
                    window.LsProjects.loadRecentProject(path);
                }
            });

            item.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.click();
                }
            });
        });

        el.recentList.querySelectorAll('.recent-remove').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var path = btn.dataset.path;
                if (path && window.projectManager) {
                    window.projectManager.removeRecentProject(path);
                    renderRecentProjects();
                    if (LsUI && LsUI.showNotification) {
                        LsUI.showNotification('Удалено из недавних', 'info', 1500);
                    }
                }
            });
        });
    }

    // ============================================================
    // 5. INIT
    // ============================================================

    function init() {
        cacheElements();
    }

    var api = {
        init: init,
        populateWindowMenu: populateWindowMenu,
        renderHistoryMenu: renderHistoryMenu,
        renderRecentProjects: renderRecentProjects,
        resetSearch: resetSearch,
        makeSvgIcon: makeSvgIcon,
        makeSvgIconString: makeSvgIconString,
        escapeHtml: escapeHtml
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined') {
        window.LsMenu = api;
    }

})();