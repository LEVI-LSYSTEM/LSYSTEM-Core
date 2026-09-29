// core/main/header.js
// Версия 1.1.0

(function() {
    'use strict';

    var HEADER_COLLAPSE_KEY = 'lsystem-header-collapsed';

    var HEADER_COMPACT_BREAKPOINT = 900;
    var HEADER_COMPACT_BREAKPOINT_NAME = 500;
    var HEADER_COMPACT_HYSTERESIS = 4;

    var el = {};

    var state = {
        compact: false,
        namesCompact: false,
        rafId: null,
        resizeTimer: null
    };

    function cacheElements() {
        el.header = document.getElementById('appHeader');
        el.logo = document.querySelector('.logo');
        el.projectNameDisplay = document.getElementById('projectNameDisplay');
        el.saveBtn = document.getElementById('saveBtn');
        el.newProjectBtn = document.getElementById('newProjectBtn');
        el.newWindowBtn = document.getElementById('newWindowBtn');
    }

    // ============================================================
    // 1. HEADER COLLAPSE
    // ============================================================

    function isHeaderCollapsed() {
        return document.body.classList.contains('header-collapsed');
    }

    function setHeaderCollapsed(collapsed, animate) {
        if (animate === undefined) animate = true;

        var next = !!collapsed;
        var current = isHeaderCollapsed();

        if (next === current) return;

        if (!animate) {
            document.body.style.transition = 'none';
        }

        document.body.classList.toggle('header-collapsed', next);

        if (!animate) {
            void document.body.offsetWidth;
            document.body.style.transition = '';
        }

        try {
            localStorage.setItem(HEADER_COLLAPSE_KEY, next ? '1' : '0');
        } catch (e) {}

        refreshLogoImageTitle();
        refreshActionButtons();

        if (window.layoutManager) {
            requestAnimationFrame(function() {
                if (window.layoutManager) window.layoutManager.resizeAll();
            });
        }
    }

    function toggleHeaderCollapsed() {
        setHeaderCollapsed(!isHeaderCollapsed());
    }

    function restoreHeaderCollapsedState() {
        var saved = null;
        try { saved = localStorage.getItem(HEADER_COLLAPSE_KEY); } catch (e) {}

        var collapsed = isHeaderCollapsed();
        if (saved === '1' && !collapsed) {
            setHeaderCollapsed(true, false);
        } else if (saved !== '1' && collapsed) {
            setHeaderCollapsed(false, false);
        }
    }

    function refreshLogoImageTitle() {
        var logoImg = el.logo ? el.logo.querySelector('.logo-img') : null;
        if (!logoImg) return;
        logoImg.title = isHeaderCollapsed() ? 'Expand Header' : 'Collapse Header';
    }

    // ============================================================
    // 2. ACTION BUTTONS STATE
    // ============================================================

    function _computeActionState() {
        var lm = window.layoutManager;
        var pm = window.projectManager;
        var proj = window.LsProjects;

        var hasWindows = false;
        var visibleCount = 0;
        var maxed = false;

        if (lm) {
            if (typeof lm.getWindowCount === 'function') {
                hasWindows = lm.getWindowCount() > 0;
            }
            if (typeof lm.getVisibleWindowCount === 'function') {
                visibleCount = lm.getVisibleWindowCount();
            }
            maxed = visibleCount >= 4;
        }

        var isDirty = false;
        if (pm && typeof pm.isDirty === 'function') {
            isDirty = !!pm.isDirty();
        }
        if (proj && typeof proj.getState === 'function') {
            var st = proj.getState();
            if (st && st.isModified) isDirty = true;
        }

        return {
            hasWindows: hasWindows,
            visibleCount: visibleCount,
            maxed: maxed,
            isDirty: isDirty,
            canSave: hasWindows && isDirty,
            canNewProject: hasWindows || isDirty
        };
    }

    function refreshActionButtons() {
        var s = _computeActionState();
        var collapsed = isHeaderCollapsed();

        if (el.saveBtn) {
            el.saveBtn.disabled = !s.canSave;
            if (collapsed) {
                el.saveBtn.classList.toggle('is-hidden-in-island', !s.hasWindows);
            } else {
                el.saveBtn.classList.remove('is-hidden-in-island');
            }
        }

        if (el.newProjectBtn) {
            el.newProjectBtn.disabled = !s.canNewProject;
            if (collapsed) {
                el.newProjectBtn.classList.toggle('is-hidden-in-island', !s.hasWindows);
            } else {
                el.newProjectBtn.classList.remove('is-hidden-in-island');
            }
        }

        if (el.newWindowBtn) {
            el.newWindowBtn.disabled = s.maxed;
            if (collapsed) {
                el.newWindowBtn.classList.toggle('is-hidden-in-island', s.maxed);
            } else {
                el.newWindowBtn.classList.remove('is-hidden-in-island');
            }
        }
    }

    function refreshIslandButtons() {
        refreshActionButtons();
    }

    // ============================================================
    // 3. HEADER ADAPTIVE
    // ============================================================

    function applyAdaptiveState() {
        state.rafId = null;

        var viewportW = window.innerWidth || 0;
        if (viewportW === 0) return;

        var shouldCompact;
        if (!state.compact) {
            shouldCompact = viewportW <= HEADER_COMPACT_BREAKPOINT;
        } else {
            shouldCompact = viewportW <= (HEADER_COMPACT_BREAKPOINT + HEADER_COMPACT_HYSTERESIS);
        }

        var shouldCompactNames;
        if (!state.namesCompact) {
            shouldCompactNames = viewportW <= HEADER_COMPACT_BREAKPOINT_NAME;
        } else {
            shouldCompactNames = viewportW <= (HEADER_COMPACT_BREAKPOINT_NAME + HEADER_COMPACT_HYSTERESIS);
        }

        if (shouldCompact !== state.compact) {
            state.compact = shouldCompact;
            if (el.header) el.header.classList.toggle('is-compact', state.compact);
        }

        if (shouldCompactNames !== state.namesCompact) {
            state.namesCompact = shouldCompactNames;
            if (el.header) el.header.classList.toggle('is-name-compact', state.namesCompact);
        }
    }

    function scheduleAdaptive() {
        if (state.rafId !== null) return;
        state.rafId = requestAnimationFrame(applyAdaptiveState);
    }

    function refreshHeaderCompact() {
        scheduleAdaptive();
    }

    // ============================================================
    // 4. LOGO CLICKS
    // ============================================================

    function setupLogoClickHandlers() {
        if (!el.logo) return;

        var logoText = el.logo.querySelector('.logo-text');
        if (logoText) {
            logoText.title = 'Switch Theme';
            logoText.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!window.appState) return;
                var next = window.appState.toggleTheme();

                if (window.LsUI && typeof window.LsUI.showNotification === 'function') {
                    window.LsUI.showNotification('Тема: ' + next, 'info', 1500);
                }
            });
        }

        var logoImg = el.logo.querySelector('.logo-img');
        if (logoImg) {
            logoImg.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleHeaderCollapsed();
            });
        }
    }

    // ============================================================
    // 5. PROJECT NAME
    // ============================================================

    function renderProjectName(name, isModified) {
        if (!el.projectNameDisplay) return;

        var displayName = name || 'Untitled';
        var modifiedSuffix = isModified ? ' *' : '';
        el.projectNameDisplay.textContent = displayName + modifiedSuffix;
    }

    // ============================================================
    // 6. EVENT SUBSCRIPTIONS
    // ============================================================

    var _busUnsubs = [];

    function subscribeToStateChanges() {
        var bus = window.eventBus;
        if (!bus || typeof bus.on !== 'function') return;

        _busUnsubs.push(bus.on('layout-changed', function() {
            refreshActionButtons();
        }));

        _busUnsubs.push(bus.on('project:dirty', function() {
            refreshActionButtons();
        }));

        _busUnsubs.push(bus.on('project:saved', function() {
            refreshActionButtons();
        }));

        _busUnsubs.push(bus.on('project:new', function() {
            refreshActionButtons();
        }));

        _busUnsubs.push(bus.on('project:loaded', function() {
            refreshActionButtons();
        }));

        _busUnsubs.push(bus.on('project:imported', function() {
            refreshActionButtons();
        }));
    }

    // ============================================================
    // 7. INIT
    // ============================================================

    function init() {
        cacheElements();

        if (!el.header) return;

        restoreHeaderCollapsedState();
        setupLogoClickHandlers();
        refreshLogoImageTitle();

        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                applyAdaptiveState();
                refreshActionButtons();
            });
        });

        subscribeToStateChanges();

        window.addEventListener('resize', function() {
            clearTimeout(state.resizeTimer);
            state.resizeTimer = setTimeout(scheduleAdaptive, 60);
        });
    }

    var api = {
        init: init,
        isHeaderCollapsed: isHeaderCollapsed,
        setHeaderCollapsed: setHeaderCollapsed,
        toggleHeaderCollapsed: toggleHeaderCollapsed,
        refreshHeaderCompact: refreshHeaderCompact,
        refreshIslandButtons: refreshIslandButtons,
        refreshActionButtons: refreshActionButtons,
        refreshLogoImageTitle: refreshLogoImageTitle,
        renderProjectName: renderProjectName
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined') {
        window.LsHeader = api;
    }

})();