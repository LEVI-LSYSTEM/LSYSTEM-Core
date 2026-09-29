// core/main/dropdowns.js
// Версия 1.0.0

(function() {
    'use strict';

    var LsUI = window.LsUI || {};

    var el = {};

    function cacheElements() {
        el.loadDropdown = document.getElementById('loadDropdown');
        el.loadMenu = document.getElementById('loadMenu');
        el.newWindowDropdown = document.getElementById('newWindowDropdown');
        el.historyDropdown = document.getElementById('historyDropdown');
    }

    // ============================================================
    // 1. POSITION DROPDOWN
    // ============================================================

    function positionDropdown(dropdownWrapper) {
        if (!dropdownWrapper) return;

        var menu = dropdownWrapper.querySelector('.dropdown-menu');
        if (!menu) return;

        menu.classList.remove('is-align-right');
        menu.style.left = '';
        menu.style.right = '';
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.maxHeight = '';

        var prevVisibility = menu.style.visibility;
        var prevOpacity = menu.style.opacity;
        var prevDisplay = menu.style.display;

        menu.style.visibility = 'hidden';
        menu.style.opacity = '0';
        menu.style.display = 'block';

        var wrapperRect = dropdownWrapper.getBoundingClientRect();
        var menuRect = menu.getBoundingClientRect();

        var viewportW = window.innerWidth;
        var viewportH = window.innerHeight;
        var margin = 8;

        var left = wrapperRect.left + wrapperRect.width / 2 - menuRect.width / 2;

        if (left + menuRect.width > viewportW - margin) {
            left = wrapperRect.right - menuRect.width;
            menu.classList.add('is-align-right');
        }

        if (left < margin) {
            left = wrapperRect.left;
            menu.classList.remove('is-align-right');
        }

        left = Math.max(margin, Math.min(left, viewportW - menuRect.width - margin));
        menu.style.left = (left - wrapperRect.left) + 'px';

        var spaceBelow = viewportH - wrapperRect.bottom - margin - 6;
        var spaceAbove = wrapperRect.top - margin - 6;

        var openUp = menuRect.height > spaceBelow && spaceAbove > spaceBelow;
        var available = openUp ? spaceAbove : spaceBelow;

        menu.style.maxHeight = Math.max(120, available) + 'px';

        if (openUp) {
            menu.style.top = 'auto';
            menu.style.bottom = 'calc(100% + 6px)';
            menu.style.transformOrigin = 'bottom ' + (menu.classList.contains('is-align-right') ? 'right' : 'left');
        } else {
            menu.style.top = 'calc(100% + 6px)';
            menu.style.bottom = 'auto';
            menu.style.transformOrigin = 'top ' + (menu.classList.contains('is-align-right') ? 'right' : 'left');
        }

        menu.style.visibility = prevVisibility;
        menu.style.opacity = prevOpacity;
        menu.style.display = prevDisplay;
    }

    function repositionOpenDropdowns() {
        var wrappers = [el.loadDropdown, el.newWindowDropdown, el.historyDropdown];
        for (var i = 0; i < wrappers.length; i++) {
            var w = wrappers[i];
            if (w && w.classList.contains('active')) positionDropdown(w);
        }
    }

    // ============================================================
    // 2. CLOSE ALL
    // ============================================================

    function closeAllTopbarDropdowns(except) {
        except = except || null;
        var dropdowns = [el.loadDropdown, el.newWindowDropdown, el.historyDropdown];
        for (var i = 0; i < dropdowns.length; i++) {
            var dd = dropdowns[i];
            if (dd && dd !== except) closeDropdown(dd);
        }
    }

    function closeDropdown(element) {
        if (!element) return;
        element.classList.remove('active');

        if (element === el.newWindowDropdown && window.LsMenu && typeof window.LsMenu.resetSearch === 'function') {
            window.LsMenu.resetSearch();
        }
    }

    // ============================================================
    // 3. TOGGLE
    // ============================================================

    function toggleDropdown(element) {
        if (!element) return;

        var isOpen = element.classList.contains('active');

        if (isOpen) {
            closeDropdown(element);
            return;
        }

        closeAllTopbarDropdowns(element);
        element.classList.add('active');

        if (element === el.loadDropdown && window.LsMenu) {
            if (typeof window.LsMenu.renderRecentProjects === 'function') {
                window.LsMenu.renderRecentProjects();
            }
        }
        if (element === el.newWindowDropdown && window.LsMenu) {
            if (typeof window.LsMenu.populateWindowMenu === 'function') {
                window.LsMenu.populateWindowMenu();
            }
        }
        if (element === el.historyDropdown && window.LsMenu) {
            if (typeof window.LsMenu.renderHistoryMenu === 'function') {
                window.LsMenu.renderHistoryMenu();
            }
        }

        requestAnimationFrame(function() { positionDropdown(element); });
    }

    // ============================================================
    // 4. INIT
    // ============================================================

    function init() {
        cacheElements();

        document.addEventListener('click', function(e) {
            if (el.loadDropdown && !el.loadDropdown.contains(e.target)) closeDropdown(el.loadDropdown);
            if (el.newWindowDropdown && !el.newWindowDropdown.contains(e.target)) closeDropdown(el.newWindowDropdown);
            if (el.historyDropdown && !el.historyDropdown.contains(e.target)) closeDropdown(el.historyDropdown);
        });

        var resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(repositionOpenDropdowns, 150);
        });

        window.addEventListener('scroll', repositionOpenDropdowns, true);
    }

    var api = {
        init: init,
        positionDropdown: positionDropdown,
        repositionOpenDropdowns: repositionOpenDropdowns,
        closeAllTopbarDropdowns: closeAllTopbarDropdowns,
        closeDropdown: closeDropdown,
        toggleDropdown: toggleDropdown,
        getElements: function() { return el; }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined') {
        window.LsDropdowns = api;
    }

})();