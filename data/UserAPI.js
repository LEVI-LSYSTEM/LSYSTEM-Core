// data/UserAPI.js
// Версия 2.2.0
// - Add: utils.graph2d (Camera + GridCache) — общие утилиты для 2D-редакторов
// - Remove: i18n.ru (переводы больше не входят в UserAPI)
//
// Компоненты:
//   ui.button, ui.input, ui.block, ui.text
//   ui.icon (svg + canvas)
//   ui.contextMenu, ui.modal, ui.confirm, ui.inlineEditor
//   ui.categoryPanel, ui.listPanel
//   utils.dom, utils.canvas, utils.file
//   utils.graph2d (Camera, GridCache)

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // UI MENU REGISTRY — глобальный реестр открытых меню
    // ═══════════════════════════════════════════════════════════════

    (function installMenuRegistry() {
        if (window.__uiMenuRegistry) return;

        const openMenus = new Set();
        let docHandlerInstalled = false;

        const NATIVE_SELECTORS = [
            '.data-dropdown',
            '.menu-dropdown',
            '.change-type-dropdown',
            '.layout-dropdown',
            '.data-submenu'
        ];

        const hideNativeDropdowns = () => {
            for (const sel of NATIVE_SELECTORS) {
                document.querySelectorAll(sel).forEach(el => {
                    try {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    } catch (e) {}
                });
            }
        };

        const isInsideAnyMenu = (target) => {
            if (!target || !target.closest) return false;
            if (target.closest('.ui-ctx, .ui-catpanel, .ui-listpanel')) return true;
            if (target.closest('[data-ui-menu-trigger]')) return true;
            return false;
        };

        const closeAll = (except) => {
            for (const menu of Array.from(openMenus)) {
                if (menu === except) continue;
                try {
                    if (typeof menu.__close === 'function') menu.__close();
                    else menu.classList.remove('open');
                } catch (e) {}
                openMenus.delete(menu);
            }
            hideNativeDropdowns();
        };

        const ensureDocHandler = () => {
            if (docHandlerInstalled) return;
            docHandlerInstalled = true;

            document.addEventListener('mousedown', (e) => {
                if (openMenus.size === 0) return;
                if (isInsideAnyMenu(e.target)) return;
                closeAll(null);
            }, true);

            window.addEventListener('resize', () => closeAll(null));

            window.addEventListener('scroll', (e) => {
                if (openMenus.size === 0) return;
                const t = e.target;
                if (t && t.closest && t.closest('.ui-ctx, .ui-catpanel, .ui-listpanel')) return;
                closeAll(null);
            }, true);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeAll(null);
            }, true);
        };

        window.__uiMenuRegistry = {
            register(menu) {
                ensureDocHandler();
                closeAll(menu);
                openMenus.add(menu);
            },
            unregister(menu) {
                openMenus.delete(menu);
            },
            closeAll(except) {
                closeAll(except || null);
            },
            closeAllIncludingNative() {
                closeAll(null);
                hideNativeDropdowns();
            },
            hideNativeDropdowns,
            size() {
                return openMenus.size;
            }
        };
    })();

    // ═══════════════════════════════════════════════════════════════
    // UI КОМПОНЕНТЫ
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'button', {
        version: '1.0.0',

        css: `
            .ui-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 14px;
                border-radius: 6px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                background: var(--bg-card, #1a1a1a);
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
                user-select: none;
                white-space: nowrap;
            }
            .ui-btn:hover {
                background: var(--bg-hover, rgba(40, 40, 40, 0.6));
                border-color: var(--beige-dark, #a89070);
            }
            .ui-btn:active { transform: scale(0.98); }
            .ui-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
            .ui-btn--primary {
                background: var(--accent-red, #cc2233);
                border-color: var(--accent-red, #cc2233);
                color: #fff;
            }
            .ui-btn--primary:hover {
                background: var(--accent-red-hover, #ee3344);
                border-color: var(--accent-red-hover, #ee3344);
            }
            .ui-btn--ghost {
                background: transparent;
                border-color: var(--border-color, rgba(200, 184, 154, 0.2));
            }
            .ui-btn--danger {
                background: transparent;
                border-color: var(--accent-red, #cc2233);
                color: var(--accent-red, #cc2233);
            }
            .ui-btn--danger:hover { background: rgba(204, 34, 51, 0.12); }
            .ui-btn--success {
                background: var(--success-color, #44cc88);
                border-color: var(--success-color, #44cc88);
                color: #fff;
            }
            .ui-btn .icon-svg {
                width: 13px;
                height: 13px;
                flex-shrink: 0;
                margin: 0;
            }
        `,

        create({ label = '', icon = null, variant = 'default', onClick = null, disabled = false } = {}) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-btn' + (variant !== 'default' ? ' ui-btn--' + variant : '');
            btn.disabled = !!disabled;

            if (icon) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'icon-svg');
                const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                use.setAttribute('href', '#' + icon);
                svg.appendChild(use);
                btn.appendChild(svg);
            }

            if (label) {
                const span = document.createElement('span');
                span.className = 'ui-btn__label';
                span.textContent = label;
                btn.appendChild(span);
            }

            if (onClick) btn.addEventListener('click', onClick);
            return btn;
        },

        setLabel(btn, label) {
            const span = btn.querySelector('.ui-btn__label');
            if (span) span.textContent = label;
        },

        setDisabled(btn, value) {
            btn.disabled = !!value;
        }
    });

    registerComponent('ui', 'input', {
        version: '1.0.0',

        css: `
            .ui-input {
                width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .ui-input:hover { border-color: rgba(200, 184, 154, 0.35); }
            .ui-input:focus {
                border-color: rgba(200, 184, 154, 0.6);
                box-shadow: 0 0 0 3px rgba(200, 184, 154, 0.12);
            }
            .ui-input::placeholder { color: var(--text-muted, rgba(200, 184, 154, 0.5)); }
        `,

        create({ value = '', placeholder = '', type = 'text', onChange = null } = {}) {
            const input = document.createElement('input');
            input.type = type;
            input.value = value;
            input.placeholder = placeholder;
            input.className = 'ui-input';
            if (onChange) input.addEventListener('input', onChange);
            return input;
        },

        getValue(input) { return input.value; },
        setValue(input, value) { input.value = value; },
        setPlaceholder(input, placeholder) { input.placeholder = placeholder; }
    });

    registerComponent('ui', 'block', {
        version: '1.0.0',

        css: `
            .ui-block {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 12px;
                border-radius: 8px;
                background: var(--bg-card, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.1));
                box-sizing: border-box;
            }
            .ui-block__title {
                font-size: 11px;
                font-weight: 700;
                color: var(--text-secondary, #a09888);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            .ui-block__body {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
        `,

        create({ title = '', children = [] } = {}) {
            const div = document.createElement('div');
            div.className = 'ui-block';

            if (title) {
                const h = document.createElement('div');
                h.className = 'ui-block__title';
                h.textContent = title;
                div.appendChild(h);
            }

            const body = document.createElement('div');
            body.className = 'ui-block__body';

            for (const c of children) {
                if (c) body.appendChild(c);
            }
            div.appendChild(body);
            return div;
        },

        setTitle(block, title) {
            const h = block.querySelector('.ui-block__title');
            if (h) h.textContent = title;
        },

        getBody(block) {
            return block.querySelector('.ui-block__body');
        }
    });

    registerComponent('ui', 'text', {
        version: '1.0.0',

        css: `
            .ui-text {
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                line-height: 1.5;
                font-family: inherit;
                margin: 0;
            }
            .ui-text--heading {
                font-size: 14px;
                font-weight: 600;
                color: var(--beige, #e0d8cc);
                margin-bottom: 4px;
            }
            .ui-text--muted {
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                font-size: 11px;
            }
            .ui-text--mono {
                font-family: 'Courier New', monospace;
                font-size: 11px;
            }
        `,

        create({ text = '', variant = 'default', tag = 'div' } = {}) {
            const el = document.createElement(tag);
            el.className = 'ui-text' + (variant !== 'default' ? ' ui-text--' + variant : '');
            el.textContent = text;
            return el;
        },

        setText(el, text) {
            el.textContent = text;
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI ICON
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'icon', {
        version: '1.0.0',

        svg(id, size = 14, color = 'currentColor') {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'icon-svg');
            svg.style.cssText = `width:${size}px;height:${size}px;fill:${color};display:block;flex-shrink:0;margin:0;`;
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#' + id);
            svg.appendChild(use);
            return svg;
        },

        canvas(ctx, id, x, y, size, color) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = Math.max(1, size / 10);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const cx = x + size / 2;
            const cy = y + size / 2;
            const r = size / 2;
            const a = r * 0.7;

            switch (id) {
                case 'icon-arrow-right':
                case 'icon-enter': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a, cy);
                    ctx.lineTo(cx + a, cy);
                    ctx.moveTo(cx + a * 0.3, cy - a * 0.7);
                    ctx.lineTo(cx + a, cy);
                    ctx.lineTo(cx + a * 0.3, cy + a * 0.7);
                    ctx.stroke();
                    break;
                }
                case 'icon-arrow-left': {
                    ctx.beginPath();
                    ctx.moveTo(cx + a, cy);
                    ctx.lineTo(cx - a, cy);
                    ctx.moveTo(cx - a * 0.3, cy - a * 0.7);
                    ctx.lineTo(cx - a, cy);
                    ctx.lineTo(cx - a * 0.3, cy + a * 0.7);
                    ctx.stroke();
                    break;
                }
                case 'icon-chevron-down': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a * 0.6, cy - a * 0.3);
                    ctx.lineTo(cx, cy + a * 0.3);
                    ctx.lineTo(cx + a * 0.6, cy - a * 0.3);
                    ctx.stroke();
                    break;
                }
                case 'icon-chevron-right': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a * 0.3, cy - a * 0.6);
                    ctx.lineTo(cx + a * 0.3, cy);
                    ctx.lineTo(cx - a * 0.3, cy + a * 0.6);
                    ctx.stroke();
                    break;
                }
                case 'icon-check': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a * 0.7, cy);
                    ctx.lineTo(cx - a * 0.1, cy + a * 0.6);
                    ctx.lineTo(cx + a * 0.7, cy - a * 0.6);
                    ctx.stroke();
                    break;
                }
                case 'icon-plus': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a * 0.7, cy);
                    ctx.lineTo(cx + a * 0.7, cy);
                    ctx.moveTo(cx, cy - a * 0.7);
                    ctx.lineTo(cx, cy + a * 0.7);
                    ctx.stroke();
                    break;
                }
                case 'icon-minus': {
                    ctx.beginPath();
                    ctx.moveTo(cx - a * 0.7, cy);
                    ctx.lineTo(cx + a * 0.7, cy);
                    ctx.stroke();
                    break;
                }
                case 'icon-layout': {
                    const w = a * 0.7, h = a * 0.7;
                    ctx.strokeRect(cx - w - 1, cy - h - 1, w, h);
                    ctx.strokeRect(cx + 1, cy - h - 1, w, h);
                    ctx.strokeRect(cx - w - 1, cy + 1, w, h);
                    ctx.strokeRect(cx + 1, cy + 1, w, h);
                    break;
                }
                default: {
                    ctx.strokeRect(cx - r * 0.7, cy - r * 0.5, r * 1.4, r);
                    ctx.beginPath();
                    ctx.moveTo(cx - r * 0.7, cy - r * 0.15);
                    ctx.lineTo(cx + r * 0.7, cy - r * 0.15);
                    ctx.stroke();
                }
            }

            ctx.restore();
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI CONTEXT MENU
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'contextMenu', {
        version: '1.1.0',

        css: `
            .ui-ctx {
                position: fixed;
                display: none;
                min-width: 200px;
                max-width: 320px;
                max-height: 480px;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 4px 0;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: 6px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                z-index: 1000000;
                font-size: 12px;
                color: var(--text-primary, #e0d8cc);
                font-family: inherit;
                box-sizing: border-box;
                user-select: none;
            }
            .ui-ctx.open { display: block; }
            .ui-ctx::-webkit-scrollbar { width: 6px; }
            .ui-ctx::-webkit-scrollbar-track { background: transparent; }
            .ui-ctx::-webkit-scrollbar-thumb {
                background: rgba(200, 184, 154, 0.15);
                border-radius: 3px;
            }
            .ui-ctx::-webkit-scrollbar-thumb:hover {
                background: rgba(200, 184, 154, 0.3);
            }

            .ui-ctx__item {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 6px 14px;
                border: none;
                background: transparent;
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                text-align: left;
                cursor: pointer;
                transition: background 0.12s ease;
                box-sizing: border-box;
            }
            .ui-ctx__item:hover { background: var(--bg-hover, rgba(40, 40, 40, 0.5)); }
            .ui-ctx__item.danger { color: var(--accent-red, #cc2233); }
            .ui-ctx__item.disabled {
                opacity: 0.4;
                cursor: default;
            }
            .ui-ctx__item.disabled:hover { background: transparent; }
            .ui-ctx__item--active {
                background: var(--bg-hover, rgba(40, 40, 40, 0.5));
                border-left: 3px solid var(--accent-red, #cc2233);
            }

            .ui-ctx__icon {
                width: 16px;
                height: 16px;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .ui-ctx__icon .icon-svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: block;
                margin: 0;
            }
            .ui-ctx__label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ui-ctx__shortcut {
                font-size: 9px;
                color: var(--text-muted, rgba(200, 184, 154, 0.4));
                font-family: 'Courier New', monospace;
                flex-shrink: 0;
            }
            .ui-ctx__arrow {
                font-size: 9px;
                opacity: 0.6;
                flex-shrink: 0;
            }
            .ui-ctx__header {
                padding: 6px 14px 3px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                pointer-events: none;
            }
            .ui-ctx__divider {
                height: 1px;
                margin: 4px 10px;
                background: var(--border-color, rgba(200, 184, 154, 0.12));
                opacity: 0.7;
            }
            .ui-ctx__search {
                padding: 6px 8px;
                border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.1));
            }
            .ui-ctx__search input {
                width: 100%;
                padding: 5px 8px;
                border-radius: 4px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                font-size: 11px;
                font-family: inherit;
                outline: none;
                box-sizing: border-box;
            }
            .ui-ctx__search input:focus {
                border-color: rgba(200, 184, 154, 0.6);
            }
        `,

        create(opts = {}) {
            const host = this;
            const items = Array.isArray(opts.items) ? opts.items : [];
            const width = Number(opts.width) > 0 ? Number(opts.width) : 240;
            const searchable = !!opts.searchable && items.length > 8;
            const onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

            const el = document.createElement('div');
            el.className = 'ui-ctx';
            el.style.minWidth = width + 'px';
            document.body.appendChild(el);

            const state = {
                open: false,
                submenu: null,
                focusIndex: -1,
                flatItems: []
            };

            const makeIcon = (icon) => {
                const wrap = document.createElement('span');
                wrap.className = 'ui-ctx__icon';
                if (!icon) return wrap;
                if (typeof icon === 'string' && icon.startsWith('icon-')) {
                    wrap.appendChild(host.ui.icon.svg(icon, 14));
                } else {
                    wrap.textContent = String(icon);
                    wrap.style.fontSize = '13px';
                }
                return wrap;
            };

            const buildItem = (item) => {
                if (!item || typeof item !== 'object') return null;

                if (item.divider) {
                    const d = document.createElement('div');
                    d.className = 'ui-ctx__divider';
                    return d;
                }

                if (item.header) {
                    const h = document.createElement('div');
                    h.className = 'ui-ctx__header';
                    h.textContent = item.header;
                    return h;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-ctx__item';
                if (item.danger) btn.classList.add('danger');
                if (item.disabled) btn.classList.add('disabled');

                if (item.icon) btn.appendChild(makeIcon(item.icon));

                const label = document.createElement('span');
                label.className = 'ui-ctx__label';
                label.textContent = item.label || '';
                btn.appendChild(label);

                if (item.shortcut) {
                    const sh = document.createElement('span');
                    sh.className = 'ui-ctx__shortcut';
                    sh.textContent = item.shortcut;
                    btn.appendChild(sh);
                }

                if (Array.isArray(item.submenu) && item.submenu.length > 0) {
                    const arrow = document.createElement('span');
                    arrow.className = 'ui-ctx__arrow';
                    arrow.textContent = '▶';
                    btn.appendChild(arrow);
                }

                if (!item.disabled) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        if (Array.isArray(item.submenu) && item.submenu.length > 0) {
                            openSubmenu(item.submenu, btn);
                            return;
                        }

                        try {
                            if (typeof item.onClick === 'function') {
                                item.onClick(item, e);
                            }
                        } catch (err) {
                            console.error('[ui.contextMenu] item onClick error:', err);
                        }
                        close();
                    });

                    btn.addEventListener('mouseenter', () => {
                        setActive(btn);
                        if (Array.isArray(item.submenu) && item.submenu.length > 0) {
                            openSubmenu(item.submenu, btn);
                        } else {
                            closeSubmenu();
                        }
                    });
                }

                btn.__item = item;
                return btn;
            };

            const rebuild = () => {
                el.innerHTML = '';
                state.flatItems = [];

                if (searchable) {
                    const searchWrap = document.createElement('div');
                    searchWrap.className = 'ui-ctx__search';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.placeholder = 'Поиск...';
                    input.addEventListener('input', () => {
                        const q = input.value.trim().toLowerCase();
                        const all = el.querySelectorAll('.ui-ctx__item');
                        all.forEach(node => {
                            const txt = (node.textContent || '').toLowerCase();
                            node.style.display = (!q || txt.includes(q)) ? '' : 'none';
                        });
                    });
                    input.addEventListener('keydown', (e) => e.stopPropagation());
                    searchWrap.appendChild(input);
                    el.appendChild(searchWrap);
                }

                const body = document.createElement('div');
                body.className = 'ui-ctx__body';
                for (const item of items) {
                    const node = buildItem(item);
                    if (!node) continue;
                    body.appendChild(node);
                    if (node.classList && node.classList.contains('ui-ctx__item') && !node.classList.contains('disabled')) {
                        state.flatItems.push(node);
                    }
                }
                el.appendChild(body);
            };

            const setActive = (btn) => {
                el.querySelectorAll('.ui-ctx__item').forEach(n => {
                    if (n !== btn) n.classList.remove('ui-ctx__item--active');
                });
                if (btn) btn.classList.add('ui-ctx__item--active');
            };

            const openSubmenu = (subItems, anchorBtn) => {
                closeSubmenu();

                const sub = document.createElement('div');
                sub.className = 'ui-ctx';
                sub.style.minWidth = width + 'px';
                document.body.appendChild(sub);

                for (const item of subItems) {
                    const node = buildItem(item);
                    if (node) sub.appendChild(node);
                }

                sub.classList.add('open');

                const rect = anchorBtn.getBoundingClientRect();
                const sw = sub.offsetWidth || width;
                const sh = sub.offsetHeight || 200;

                let left = rect.right + 2;
                let top = rect.top;

                if (left + sw > window.innerWidth - 4) {
                    left = rect.left - sw - 2;
                }
                if (left < 4) left = 4;
                if (top + sh > window.innerHeight - 4) {
                    top = window.innerHeight - sh - 4;
                }
                if (top < 4) top = 4;

                sub.style.left = left + 'px';
                sub.style.top = top + 'px';

                state.submenu = sub;

                sub.addEventListener('mouseleave', (e) => {
                    const to = e.relatedTarget;
                    if (sub.contains(to) || (anchorBtn && anchorBtn.contains(to))) return;
                    closeSubmenu();
                });
                anchorBtn.addEventListener('mouseleave', (e) => {
                    const to = e.relatedTarget;
                    if (sub.contains(to) || anchorBtn.contains(to)) return;
                    closeSubmenu();
                }, { once: true });
            };

            const closeSubmenu = () => {
                if (state.submenu) {
                    if (state.submenu.parentNode) state.submenu.parentNode.removeChild(state.submenu);
                    state.submenu = null;
                }
            };

            const positionAt = (clientX, clientY) => {
                const prevDisplay = el.style.display;
                const prevVis = el.style.visibility;
                el.style.visibility = 'hidden';
                el.style.display = 'block';

                const w = el.offsetWidth || width;
                const h = el.offsetHeight || 200;

                let left = Math.round(clientX);
                let top = Math.round(clientY);

                if (left + w > window.innerWidth - 4) {
                    left = Math.max(4, window.innerWidth - w - 4);
                }
                if (top + h > window.innerHeight - 4) {
                    top = Math.max(4, window.innerHeight - h - 4);
                }
                if (left < 4) left = 4;
                if (top < 4) top = 4;

                el.style.left = left + 'px';
                el.style.top = top + 'px';
                el.style.visibility = prevVis || '';
                el.style.display = prevDisplay;
            };

            const open = (clientX, clientY) => {
                if (state.open) close();

                window.__uiMenuRegistry.closeAllIncludingNative();
                window.__uiMenuRegistry.register(el);

                rebuild();
                el.classList.add('open');
                positionAt(clientX, clientY);
                state.open = true;
                state.focusIndex = -1;

                if (searchable) {
                    const inp = el.querySelector('.ui-ctx__search input');
                    if (inp) setTimeout(() => inp.focus(), 30);
                }
            };

            const close = () => {
                if (!state.open) return;
                closeSubmenu();
                el.classList.remove('open');
                state.open = false;
                window.__uiMenuRegistry.unregister(el);
                if (onClose) {
                    try { onClose(); } catch (e) {}
                }
            };

            el.__close = close;

            const onKeyDown = (e) => {
                if (!state.open) return;
                if (e.target && e.target.tagName === 'INPUT') return;

                const items = state.flatItems.filter(n => n.offsetParent !== null);
                if (items.length === 0) return;

                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    const dir = e.key === 'ArrowDown' ? 1 : -1;
                    state.focusIndex = (state.focusIndex + dir + items.length) % items.length;
                    setActive(items[state.focusIndex]);
                    try { items[state.focusIndex].focus(); } catch (err) {}
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (state.focusIndex >= 0 && items[state.focusIndex]) {
                        items[state.focusIndex].click();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            };
            document.addEventListener('keydown', onKeyDown, true);

            const api = {
                el,
                open,
                close,
                destroy() {
                    close();
                    document.removeEventListener('keydown', onKeyDown, true);
                    if (el.parentNode) el.parentNode.removeChild(el);
                },
                isOpen() { return state.open; },
                openAt(x, y) { open(x, y); }
            };

            if (typeof opts.x === 'number' && typeof opts.y === 'number') {
                open(opts.x, opts.y);
            }

            return api;
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI MODAL
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'modal', {
        version: '1.0.0',

        css: `
            .ui-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                            backdrop-filter 0.25s ease;
                box-sizing: border-box;
            }
            .ui-modal-overlay.open {
                opacity: 1;
                pointer-events: auto;
            }

            .ui-modal {
                display: flex;
                flex-direction: column;
                width: 100%;
                max-height: 88vh;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.15));
                border-radius: 10px;
                box-shadow:
                    0 24px 80px rgba(0, 0, 0, 0.6),
                    0 0 60px rgba(200, 184, 154, 0.04);
                overflow: hidden;
                transform: translateY(-16px) scale(0.96);
                opacity: 0;
                transition: transform 0.32s cubic-bezier(0.22, 1.4, 0.36, 1),
                            opacity 0.25s ease;
                box-sizing: border-box;
                font-family: inherit;
                color: var(--text-primary, #e0d8cc);
            }
            .ui-modal-overlay.open .ui-modal {
                transform: translateY(0) scale(1);
                opacity: 1;
            }

            .ui-modal--sm { max-width: 360px; }
            .ui-modal--md { max-width: 520px; }
            .ui-modal--lg { max-width: 720px; }
            .ui-modal--xl { max-width: 960px; }

            .ui-modal--danger { border-color: var(--accent-red, #cc2233); }
            .ui-modal--success { border-color: var(--success-color, #44cc88); }

            .ui-modal__header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 14px 18px;
                border-bottom: 1px solid var(--border-color, rgba(200, 184, 154, 0.1));
                flex-shrink: 0;
            }
            .ui-modal__icon {
                width: 18px;
                height: 18px;
                flex-shrink: 0;
                color: var(--beige, #c8b89a);
            }
            .ui-modal__icon .icon-svg {
                width: 18px;
                height: 18px;
                fill: currentColor;
                margin: 0;
            }
            .ui-modal--danger .ui-modal__icon { color: var(--accent-red, #cc2233); }
            .ui-modal--success .ui-modal__icon { color: var(--success-color, #44cc88); }

            .ui-modal__title {
                margin: 0;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.3px;
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .ui-modal__close {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                padding: 0;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.15));
                border-radius: 6px;
                background: transparent;
                color: var(--text-secondary, #a09888);
                cursor: pointer;
                transition: background 0.15s ease, color 0.15s ease, transform 0.3s ease;
                flex-shrink: 0;
            }
            .ui-modal__close:hover {
                background: var(--bg-hover, rgba(40, 40, 40, 0.5));
                color: var(--text-primary, #e0d8cc);
                transform: rotate(90deg);
            }
            .ui-modal__close .icon-svg {
                width: 12px;
                height: 12px;
                margin: 0;
            }

            .ui-modal__body {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 18px 20px;
                font-size: 12.5px;
                line-height: 1.6;
                color: var(--text-secondary, #a09888);
                scrollbar-width: thin;
                scrollbar-color: rgba(200, 184, 154, 0.15) transparent;
            }
            .ui-modal__body::-webkit-scrollbar { width: 6px; }
            .ui-modal__body::-webkit-scrollbar-track { background: transparent; }
            .ui-modal__body::-webkit-scrollbar-thumb {
                background: rgba(200, 184, 154, 0.15);
                border-radius: 3px;
            }
            .ui-modal__message {
                white-space: pre-wrap;
                color: var(--text-secondary, #a09888);
            }

            .ui-modal__footer {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
                padding: 12px 18px;
                border-top: 1px solid var(--border-color, rgba(200, 184, 154, 0.1));
                background: rgba(200, 184, 154, 0.02);
                flex-shrink: 0;
                flex-wrap: wrap;
            }
        `,

        create(opts = {}) {
            const host = this;
            const title = opts.title || '';
            const icon = opts.icon || null;
            const message = opts.message || '';
            const content = opts.content || null;
            const bodyFn = typeof opts.body === 'function' ? opts.body : null;
            const size = ['sm', 'md', 'lg', 'xl'].includes(opts.size) ? opts.size : 'md';
            const variant = ['default', 'danger', 'success'].includes(opts.variant) ? opts.variant : 'default';
            const closable = opts.closable !== false;
            const closeOnBackdrop = opts.closeOnBackdrop !== false;
            const closeOnEsc = opts.closeOnEsc !== false;

            const buttons = Array.isArray(opts.buttons) && opts.buttons.length > 0
                ? opts.buttons
                : [{ id: 'ok', label: 'OK', variant: 'primary' }];

            return new Promise((resolve) => {
                let resolved = false;

                const overlay = document.createElement('div');
                overlay.className = 'ui-modal-overlay';

                const dialog = document.createElement('div');
                dialog.className = `ui-modal ui-modal--${size} ui-modal--${variant}`;
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-modal', 'true');
                if (title) dialog.setAttribute('aria-label', title);

                const header = document.createElement('div');
                header.className = 'ui-modal__header';

                if (icon) {
                    const iconWrap = document.createElement('span');
                    iconWrap.className = 'ui-modal__icon';
                    iconWrap.appendChild(host.ui.icon.svg(icon, 18));
                    header.appendChild(iconWrap);
                }

                if (title) {
                    const h = document.createElement('h2');
                    h.className = 'ui-modal__title';
                    h.textContent = title;
                    header.appendChild(h);
                } else {
                    const spacer = document.createElement('div');
                    spacer.style.flex = '1';
                    header.appendChild(spacer);
                }

                if (closable) {
                    const closeBtn = document.createElement('button');
                    closeBtn.type = 'button';
                    closeBtn.className = 'ui-modal__close';
                    closeBtn.title = 'Закрыть (Esc)';
                    closeBtn.appendChild(host.ui.icon.svg('icon-close', 12));
                    header.appendChild(closeBtn);
                    closeBtn.addEventListener('click', () => finish(null));
                }

                dialog.appendChild(header);

                const body = document.createElement('div');
                body.className = 'ui-modal__body';

                if (content && content.nodeType === 1) {
                    body.appendChild(content);
                } else if (bodyFn) {
                    bodyFn(body);
                } else if (message) {
                    const m = document.createElement('div');
                    m.className = 'ui-modal__message';
                    m.textContent = message;
                    body.appendChild(m);
                }

                dialog.appendChild(body);

                const footer = document.createElement('div');
                footer.className = 'ui-modal__footer';

                const buttonEls = [];
                for (const b of buttons) {
                    const btn = host.ui.button({
                        label: b.label || b.id,
                        variant: b.variant || 'default',
                        onClick: () => finish(b.id)
                    });
                    buttonEls.push(btn);
                    footer.appendChild(btn);
                }
                dialog.appendChild(footer);

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                requestAnimationFrame(() => {
                    overlay.classList.add('open');
                });

                const getFocusable = () => {
                    const sel = 'button:not([disabled]), [href], input:not([disabled]), ' +
                                'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
                    return Array.from(dialog.querySelectorAll(sel)).filter(el => {
                        return el.offsetParent !== null;
                    });
                };

                const onKeyDown = (e) => {
                    if (e.key === 'Escape' && closeOnEsc) {
                        e.preventDefault();
                        e.stopPropagation();
                        finish(null);
                        return;
                    }
                    if (e.key === 'Tab') {
                        const focusable = getFocusable();
                        if (focusable.length === 0) return;
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];
                        if (e.shiftKey && document.activeElement === first) {
                            e.preventDefault();
                            last.focus();
                        } else if (!e.shiftKey && document.activeElement === last) {
                            e.preventDefault();
                            first.focus();
                        }
                    }
                };
                document.addEventListener('keydown', onKeyDown, true);

                overlay.addEventListener('mousedown', (e) => {
                    if (e.target === overlay && closeOnBackdrop) {
                        finish(null);
                    }
                });

                setTimeout(() => {
                    const focusable = getFocusable();
                    const primary = buttonEls.find(b => b.classList.contains('ui-btn--primary'));
                    if (primary) primary.focus();
                    else if (focusable.length > 0) focusable[0].focus();
                }, 50);

                const finish = (value) => {
                    if (resolved) return;
                    resolved = true;

                    document.removeEventListener('keydown', onKeyDown, true);
                    overlay.classList.remove('open');

                    setTimeout(() => {
                        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    }, 260);

                    if (typeof opts.onClose === 'function') {
                        try { opts.onClose(value); } catch (e) {}
                    }
                    resolve(value);
                };

                if (typeof opts.onOpen === 'function') {
                    try { opts.onOpen(dialog, body); } catch (e) {}
                }
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI CONFIRM
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'confirm', {
        version: '2.0.0',

        create(opts = {}) {
            const buttons = Array.isArray(opts.buttons) && opts.buttons.length > 0
                ? opts.buttons
                : [
                    { id: 'ok',     label: 'ОК',     variant: 'primary' },
                    { id: 'cancel', label: 'Отмена', variant: 'ghost' }
                ];

            return this.ui.modal({
                title: opts.title || 'Подтверждение',
                message: opts.message || '',
                icon: opts.icon || 'icon-help',
                size: opts.size || 'sm',
                variant: opts.variant || 'default',
                buttons: buttons
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI INLINE EDITOR
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'inlineEditor', {
        version: '1.0.0',

        css: `
            .ui-inline-editor {
                position: absolute;
                display: none;
                padding: 0 6px;
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                border: 2px solid var(--accent-red, #cc2233);
                border-radius: 4px;
                font: 11px sans-serif;
                outline: none;
                box-sizing: border-box;
                z-index: 999999;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            }
            .ui-inline-editor.active { display: block; }
        `,

        create(opts = {}) {
            const parent = opts.parent;
            if (!parent) {
                console.warn('[ui.inlineEditor] parent is required');
                return null;
            }

            const rect = opts.rect || { x: 0, y: 0, w: 100, h: 22 };
            const type = opts.type || 'text';
            const value = opts.value;

            const input = document.createElement('input');
            input.type = type === 'number' ? 'number' : 'text';
            input.className = 'ui-inline-editor';
            input.style.left = rect.x + 'px';
            input.style.top = rect.y + 'px';
            input.style.width = Math.max(40, rect.w) + 'px';
            input.style.height = Math.max(18, rect.h) + 'px';
            input.value = value == null ? '' : String(value);

            parent.appendChild(input);
            requestAnimationFrame(() => {
                input.classList.add('active');
                input.focus();
                input.select();
            });

            let done = false;
            const commit = () => {
                if (done) return;
                done = true;
                const v = input.value;
                input.classList.remove('active');
                setTimeout(() => {
                    if (input.parentNode) input.parentNode.removeChild(input);
                }, 50);
                if (typeof opts.onCommit === 'function') {
                    try { opts.onCommit(v); } catch (e) {}
                }
            };
            const cancel = () => {
                if (done) return;
                done = true;
                input.classList.remove('active');
                setTimeout(() => {
                    if (input.parentNode) input.parentNode.removeChild(input);
                }, 50);
                if (typeof opts.onCancel === 'function') {
                    try { opts.onCancel(); } catch (e) {}
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
            input.addEventListener('blur', () => commit());

            return input;
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI CATEGORY PANEL
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'categoryPanel', {
        version: '1.3.0',

        css: `
            .ui-catpanel-trigger {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 0 8px;
                height: 22px;
                min-height: 22px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: 4px;
                background: var(--bg-hover, rgba(40, 40, 40, 0.4));
                color: var(--text-secondary, #a09888);
                font-size: 10px;
                font-weight: 500;
                font-family: inherit;
                cursor: pointer;
                transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
                flex-shrink: 0;
                user-select: none;
                white-space: nowrap;
                box-sizing: border-box;
            }
            .ui-catpanel-trigger:hover {
                background: var(--bg-active, rgba(60, 60, 60, 0.8));
                border-color: var(--border-hover, rgba(200, 184, 154, 0.4));
                color: var(--text-primary, #e0d8cc);
            }
            .ui-catpanel-trigger.active {
                background: var(--bg-active, rgba(60, 60, 60, 0.8));
                border-color: var(--accent-red, #cc2233);
                color: var(--text-primary, #e0d8cc);
            }
            .ui-catpanel-trigger .icon-svg {
                width: 12px;
                height: 12px;
                fill: currentColor;
                display: block;
                flex-shrink: 0;
                margin: 0;
            }

            .ui-catpanel {
                position: fixed;
                display: none;
                min-width: 200px;
                max-width: 340px;
                max-height: 480px;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 4px 0;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: 6px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                z-index: 999999;
                font-size: 12px;
                color: var(--text-primary, #e0d8cc);
                font-family: inherit;
                box-sizing: border-box;
                user-select: none;
            }
            .ui-catpanel.open { display: block; }
            .ui-catpanel::-webkit-scrollbar { width: 6px; }
            .ui-catpanel::-webkit-scrollbar-track { background: transparent; }
            .ui-catpanel::-webkit-scrollbar-thumb {
                background: rgba(200, 184, 154, 0.15);
                border-radius: 3px;
            }
            .ui-catpanel::-webkit-scrollbar-thumb:hover {
                background: rgba(200, 184, 154, 0.3);
            }

            .ui-catpanel__group {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 100%;
                padding: 6px 12px 6px 10px;
                border: none;
                background: transparent;
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                text-align: left;
                cursor: pointer;
                transition: background 0.12s ease;
                box-sizing: border-box;
            }
            .ui-catpanel__group:hover {
                background: var(--bg-hover, rgba(40, 40, 40, 0.4));
            }
            .ui-catpanel__group-arrow {
                width: 10px;
                text-align: center;
                font-size: 8px;
                flex-shrink: 0;
                opacity: 0.65;
            }
            .ui-catpanel__group-icon {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                opacity: 0.85;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .ui-catpanel__group-icon .icon-svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: block;
                margin: 0;
            }
            .ui-catpanel__group-label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: 500;
            }
            .ui-catpanel__group-count {
                font-size: 9px;
                font-weight: 500;
                color: var(--text-muted, rgba(200, 184, 154, 0.4));
                padding: 1px 6px;
                border-radius: 8px;
                background: rgba(200, 184, 154, 0.08);
                flex-shrink: 0;
            }

            .ui-catpanel__items {
                display: flex;
                flex-direction: column;
                padding: 1px 0 4px;
            }
            .ui-catpanel__items.collapsed { display: none; }

            .ui-catpanel__item {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 5px 12px 5px 28px;
                border: none;
                background: transparent;
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                text-align: left;
                cursor: pointer;
                transition: background 0.12s ease;
                box-sizing: border-box;
            }
            .ui-catpanel__item:hover { background: var(--bg-hover, rgba(40, 40, 40, 0.45)); }
            .ui-catpanel__item.danger { color: var(--accent-red, #cc2233); }
            .ui-catpanel__item.disabled { opacity: 0.4; cursor: default; }
            .ui-catpanel__item.disabled:hover { background: transparent; }
            .ui-catpanel__item-icon {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.85;
            }
            .ui-catpanel__item-icon .icon-svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: block;
                margin: 0;
            }
            .ui-catpanel__item-label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ui-catpanel__item-shortcut {
                font-size: 9px;
                color: var(--text-muted, rgba(200, 184, 154, 0.4));
                font-family: 'Courier New', monospace;
                flex-shrink: 0;
            }

            .ui-catpanel__header {
                padding: 6px 12px 3px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                pointer-events: none;
            }
            .ui-catpanel__divider {
                height: 1px;
                margin: 4px 10px;
                background: var(--border-color, rgba(200, 184, 154, 0.12));
                opacity: 0.7;
            }
            .ui-catpanel__empty {
                padding: 12px;
                font-size: 11px;
                font-style: italic;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                text-align: center;
            }
        `,

        create(opts = {}) {
            const host = this;
            const label = opts.label || '';
            const iconId = opts.icon || null;
            const headless = !!opts.headless;
            const categories = Array.isArray(opts.categories) ? opts.categories : [];
            const footerItems = Array.isArray(opts.footerItems) ? opts.footerItems : [];
            const width = Number(opts.width) > 0 ? Number(opts.width) : 220;

            const stateKey = '__uiCatPanel_' + (label || 'headless') + '_collapsed';

            let trigger = null;
            if (!headless) {
                trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'ui-catpanel-trigger';
                trigger.dataset.uiMenuTrigger = 'trigger';

                if (iconId) trigger.appendChild(host.ui.icon.svg(iconId, 12));
                if (label) {
                    const span = document.createElement('span');
                    span.textContent = label;
                    trigger.appendChild(span);
                }
            }

            const panel = document.createElement('div');
            panel.className = 'ui-catpanel';
            panel.style.minWidth = width + 'px';
            panel.dataset.uiMenuTrigger = 'menu';
            document.body.appendChild(panel);

            const localState = { collapsed: {}, open: false };

            (function initCollapsedState() {
                let persisted = null;
                try {
                    if (host && host.uiState && host.uiState[stateKey]) {
                        persisted = host.uiState[stateKey];
                    }
                } catch (e) {}
                for (const cat of categories) {
                    if (!cat || typeof cat !== 'object' || !cat.name) continue;
                    if (persisted && typeof persisted === 'object' && cat.name in persisted) {
                        localState.collapsed[cat.name] = !!persisted[cat.name];
                    } else {
                        localState.collapsed[cat.name] = !!cat.collapsed;
                    }
                }
            })();

            const persistCollapsed = () => {
                try {
                    if (host && typeof host.setState === 'function') {
                        host.setState({ [stateKey]: { ...localState.collapsed } });
                    } else if (host && host.uiState) {
                        host.uiState[stateKey] = { ...localState.collapsed };
                    }
                } catch (e) {}
            };

            const makeIcon = (iconIdOrEmoji) => {
                const wrap = document.createElement('span');
                wrap.className = 'ui-catpanel__item-icon';
                if (!iconIdOrEmoji) return wrap;
                if (typeof iconIdOrEmoji === 'string' && iconIdOrEmoji.startsWith('icon-')) {
                    wrap.appendChild(host.ui.icon.svg(iconIdOrEmoji, 14));
                } else {
                    wrap.textContent = String(iconIdOrEmoji);
                    wrap.style.fontSize = '13px';
                }
                return wrap;
            };

            const makeItem = (item) => {
                if (!item || typeof item !== 'object') return null;
                if (item.divider) {
                    const d = document.createElement('div');
                    d.className = 'ui-catpanel__divider';
                    return d;
                }
                if (item.header) {
                    const h = document.createElement('div');
                    h.className = 'ui-catpanel__header';
                    h.textContent = item.header;
                    return h;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-catpanel__item';
                if (item.danger) btn.classList.add('danger');
                if (item.disabled) btn.classList.add('disabled');

                if (item.icon) btn.appendChild(makeIcon(item.icon));

                const labelEl = document.createElement('span');
                labelEl.className = 'ui-catpanel__item-label';
                labelEl.textContent = item.label || '';
                btn.appendChild(labelEl);

                if (item.shortcut) {
                    const sh = document.createElement('span');
                    sh.className = 'ui-catpanel__item-shortcut';
                    sh.textContent = item.shortcut;
                    btn.appendChild(sh);
                }

                if (!item.disabled) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        try {
                            if (typeof item.onClick === 'function') item.onClick(item, e);
                        } catch (err) {
                            console.error('[ui.categoryPanel] item click error:', err);
                        }
                        closePanel();
                    });
                }
                return btn;
            };

            const makeGroup = (cat) => {
                const name = String(cat.name || 'Без названия');
                const isCollapsed = !!localState.collapsed[name];

                const groupBtn = document.createElement('button');
                groupBtn.type = 'button';
                groupBtn.className = 'ui-catpanel__group';

                const arrow = document.createElement('span');
                arrow.className = 'ui-catpanel__group-arrow';
                arrow.textContent = isCollapsed ? '▶' : '▼';
                groupBtn.appendChild(arrow);

                if (cat.icon) {
                    const iconWrap = makeIcon(cat.icon);
                    iconWrap.className = 'ui-catpanel__group-icon';
                    groupBtn.appendChild(iconWrap);
                }

                const labelEl = document.createElement('span');
                labelEl.className = 'ui-catpanel__group-label';
                labelEl.textContent = name;
                groupBtn.appendChild(labelEl);

                const itemCount = Array.isArray(cat.items)
                    ? cat.items.filter(x => x && !x.divider && !x.header).length
                    : 0;
                if (itemCount > 0) {
                    const count = document.createElement('span');
                    count.className = 'ui-catpanel__group-count';
                    count.textContent = String(itemCount);
                    groupBtn.appendChild(count);
                }

                const itemsWrap = document.createElement('div');
                itemsWrap.className = 'ui-catpanel__items' + (isCollapsed ? ' collapsed' : '');
                if (Array.isArray(cat.items)) {
                    for (const it of cat.items) {
                        const el = makeItem(it);
                        if (el) itemsWrap.appendChild(el);
                    }
                }

                groupBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    localState.collapsed[name] = !localState.collapsed[name];
                    itemsWrap.classList.toggle('collapsed', localState.collapsed[name]);
                    arrow.textContent = localState.collapsed[name] ? '▶' : '▼';
                    persistCollapsed();
                });

                return [groupBtn, itemsWrap];
            };

            const rebuildContent = () => {
                panel.innerHTML = '';
                let anyRendered = false;

                for (const cat of categories) {
                    if (!cat || typeof cat !== 'object' || !cat.name) continue;
                    anyRendered = true;
                    const parts = makeGroup(cat);
                    panel.appendChild(parts[0]);
                    panel.appendChild(parts[1]);
                }

                if (!anyRendered && footerItems.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'ui-catpanel__empty';
                    empty.textContent = 'Пусто';
                    panel.appendChild(empty);
                }

                if (footerItems.length > 0) {
                    if (anyRendered) {
                        const d = document.createElement('div');
                        d.className = 'ui-catpanel__divider';
                        panel.appendChild(d);
                    }
                    for (const it of footerItems) {
                        const el = makeItem(it);
                        if (el) panel.appendChild(el);
                    }
                }
            };

            const positionUnderTrigger = () => {
                if (!trigger) return;
                const r = trigger.getBoundingClientRect();
                const pw = panel.offsetWidth || width;
                const ph = panel.offsetHeight || 200;

                let left = Math.round(r.right - pw);
                let top = Math.round(r.bottom + 4);

                if (left < 4) left = 4;
                if (left + pw > window.innerWidth - 4) {
                    left = window.innerWidth - pw - 4;
                }
                if (top + ph > window.innerHeight - 4) {
                    top = Math.max(4, r.top - ph - 4);
                }

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            };

            const positionAtCursor = (clientX, clientY) => {
                const pw = panel.offsetWidth || width;
                const ph = panel.offsetHeight || 200;

                let left = Math.round(clientX);
                let top = Math.round(clientY);

                if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
                if (left < 4) left = 4;
                if (top + ph > window.innerHeight - 4) top = Math.max(4, clientY - ph);
                if (top < 4) top = 4;

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            };

            const openPanel = () => {
                if (trigger) trigger.classList.add('active');

                window.__uiMenuRegistry.closeAllIncludingNative();
                window.__uiMenuRegistry.register(panel);

                rebuildContent();
                panel.classList.add('open');
                localState.open = true;
                if (trigger) positionUnderTrigger();
            };

            const closePanel = () => {
                panel.classList.remove('open');
                if (trigger) trigger.classList.remove('active');
                localState.open = false;
                window.__uiMenuRegistry.unregister(panel);
            };

            const togglePanel = () => {
                if (localState.open) closePanel();
                else openPanel();
            };

            panel.__close = closePanel;

            if (trigger) {
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    togglePanel();
                });
            }

            const api = {
                open: openPanel,
                close: closePanel,
                toggle: togglePanel,
                isOpen: () => localState.open,
                openAt: (clientX, clientY) => {
                    window.__uiMenuRegistry.closeAllIncludingNative();
                    window.__uiMenuRegistry.register(panel);
                    rebuildContent();
                    panel.classList.add('open');
                    localState.open = true;
                    positionAtCursor(clientX, clientY);
                },
                setCategories: (newCats) => {
                    categories.length = 0;
                    if (Array.isArray(newCats)) categories.push(...newCats);
                    for (const cat of categories) {
                        if (cat && cat.name && !(cat.name in localState.collapsed)) {
                            localState.collapsed[cat.name] = !!cat.collapsed;
                        }
                    }
                    if (localState.open) rebuildContent();
                },
                destroy: () => {
                    closePanel();
                    if (panel.parentNode) panel.parentNode.removeChild(panel);
                },
                panelEl: panel
            };

            if (headless) {
                panel.open = api.open;
                panel.close = api.close;
                panel.toggle = api.toggle;
                panel.isOpen = api.isOpen;
                panel.openAt = api.openAt;
                panel.setCategories = api.setCategories;
                panel.destroy = api.destroy;
                panel.panelEl = panel;
                return panel;
            }

            trigger.open = api.open;
            trigger.close = api.close;
            trigger.toggle = api.toggle;
            trigger.isOpen = api.isOpen;
            trigger.openAt = api.openAt;
            trigger.setCategories = api.setCategories;
            trigger.destroy = api.destroy;
            trigger.panelEl = panel;

            return trigger;
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // UI LIST PANEL
    // ═══════════════════════════════════════════════════════════════

    registerComponent('ui', 'listPanel', {
        version: '1.2.0',

        css: `
            .ui-listpanel {
                position: fixed;
                display: none;
                min-width: 200px;
                max-width: 340px;
                max-height: 480px;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 4px 0;
                background: var(--bg-panel, #1a1a1a);
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: 6px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                backdrop-filter: blur(12px);
                z-index: 999999;
                font-size: 12px;
                color: var(--text-primary, #e0d8cc);
                font-family: inherit;
                box-sizing: border-box;
                user-select: none;
            }
            .ui-listpanel.open { display: block; }
            .ui-listpanel::-webkit-scrollbar { width: 6px; }
            .ui-listpanel::-webkit-scrollbar-track { background: transparent; }
            .ui-listpanel::-webkit-scrollbar-thumb {
                background: rgba(200, 184, 154, 0.15);
                border-radius: 3px;
            }

            .ui-listpanel__trigger {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 0 8px;
                height: 22px;
                min-height: 22px;
                border: 1px solid var(--border-color, rgba(200, 184, 154, 0.12));
                border-radius: 4px;
                background: var(--bg-hover, rgba(40, 40, 40, 0.4));
                color: var(--text-secondary, #a09888);
                font-size: 10px;
                font-weight: 500;
                font-family: inherit;
                cursor: pointer;
                transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
                flex-shrink: 0;
                user-select: none;
                white-space: nowrap;
                box-sizing: border-box;
            }
            .ui-listpanel__trigger:hover {
                background: var(--bg-active, rgba(60, 60, 60, 0.8));
                border-color: var(--border-hover, rgba(200, 184, 154, 0.4));
                color: var(--text-primary, #e0d8cc);
            }
            .ui-listpanel__trigger.active {
                background: var(--bg-active, rgba(60, 60, 60, 0.8));
                border-color: var(--accent-red, #cc2233);
                color: var(--text-primary, #e0d8cc);
            }
            .ui-listpanel__trigger .icon-svg {
                width: 12px;
                height: 12px;
                fill: currentColor;
                display: block;
                flex-shrink: 0;
                margin: 0;
            }

            .ui-listpanel__item {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 6px 12px;
                border: none;
                background: transparent;
                color: var(--text-primary, #e0d8cc);
                font-size: 12px;
                font-family: inherit;
                text-align: left;
                cursor: pointer;
                transition: background 0.12s ease;
                box-sizing: border-box;
            }
            .ui-listpanel__item:hover { background: var(--bg-hover, rgba(40, 40, 40, 0.45)); }
            .ui-listpanel__item.danger { color: var(--accent-red, #cc2233); }
            .ui-listpanel__item.disabled { opacity: 0.4; cursor: default; }
            .ui-listpanel__item.disabled:hover { background: transparent; }
            .ui-listpanel__item-icon {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.85;
            }
            .ui-listpanel__item-icon .icon-svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: block;
                margin: 0;
            }
            .ui-listpanel__item-body {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 1px;
            }
            .ui-listpanel__item-label {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ui-listpanel__item-desc {
                font-size: 10px;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ui-listpanel__divider {
                height: 1px;
                margin: 4px 10px;
                background: var(--border-color, rgba(200, 184, 154, 0.12));
                opacity: 0.7;
            }
            .ui-listpanel__empty {
                padding: 12px;
                font-size: 11px;
                font-style: italic;
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
                text-align: center;
            }
        `,

        create(opts = {}) {
            const host = this;
            const label = opts.label || '';
            const iconId = opts.icon || null;
            const headless = !!opts.headless;
            const items = Array.isArray(opts.items) ? opts.items : [];
            const width = Number(opts.width) > 0 ? Number(opts.width) : 220;

            let trigger = null;
            if (!headless) {
                trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'ui-listpanel__trigger';
                trigger.dataset.uiMenuTrigger = 'trigger';

                if (iconId) trigger.appendChild(host.ui.icon.svg(iconId, 12));
                if (label) {
                    const span = document.createElement('span');
                    span.textContent = label;
                    trigger.appendChild(span);
                }
            }

            const panel = document.createElement('div');
            panel.className = 'ui-listpanel';
            panel.style.minWidth = width + 'px';
            panel.dataset.uiMenuTrigger = 'menu';
            document.body.appendChild(panel);

            const localState = { open: false };

            const makeIcon = (iconIdOrEmoji) => {
                const wrap = document.createElement('span');
                wrap.className = 'ui-listpanel__item-icon';
                if (!iconIdOrEmoji) return wrap;
                if (typeof iconIdOrEmoji === 'string' && iconIdOrEmoji.startsWith('icon-')) {
                    wrap.appendChild(host.ui.icon.svg(iconIdOrEmoji, 14));
                } else {
                    wrap.textContent = String(iconIdOrEmoji);
                    wrap.style.fontSize = '13px';
                }
                return wrap;
            };

            const makeItem = (item) => {
                if (!item || typeof item !== 'object') return null;
                if (item.divider) {
                    const d = document.createElement('div');
                    d.className = 'ui-listpanel__divider';
                    return d;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-listpanel__item';
                if (item.danger) btn.classList.add('danger');
                if (item.disabled) btn.classList.add('disabled');

                if (item.icon) btn.appendChild(makeIcon(item.icon));

                const body = document.createElement('div');
                body.className = 'ui-listpanel__item-body';

                const labelEl = document.createElement('span');
                labelEl.className = 'ui-listpanel__item-label';
                labelEl.textContent = item.label || '';
                body.appendChild(labelEl);

                if (item.description) {
                    const desc = document.createElement('span');
                    desc.className = 'ui-listpanel__item-desc';
                    desc.textContent = item.description;
                    body.appendChild(desc);
                }

                btn.appendChild(body);

                if (!item.disabled) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        try {
                            if (typeof item.onClick === 'function') item.onClick(item, e);
                        } catch (err) {
                            console.error('[ui.listPanel] item click error:', err);
                        }
                        closePanel();
                    });
                }
                return btn;
            };

            const rebuildContent = () => {
                panel.innerHTML = '';
                if (items.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'ui-listpanel__empty';
                    empty.textContent = 'Пусто';
                    panel.appendChild(empty);
                    return;
                }
                for (const it of items) {
                    const el = makeItem(it);
                    if (el) panel.appendChild(el);
                }
            };

            const positionUnderTrigger = () => {
                if (!trigger) return;
                const r = trigger.getBoundingClientRect();
                const pw = panel.offsetWidth || width;
                const ph = panel.offsetHeight || 200;

                let left = Math.round(r.right - pw);
                let top = Math.round(r.bottom + 4);

                if (left < 4) left = 4;
                if (left + pw > window.innerWidth - 4) {
                    left = window.innerWidth - pw - 4;
                }
                if (top + ph > window.innerHeight - 4) {
                    top = Math.max(4, r.top - ph - 4);
                }

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            };

            const positionAtCursor = (clientX, clientY) => {
                const pw = panel.offsetWidth || width;
                const ph = panel.offsetHeight || 200;

                let left = Math.round(clientX);
                let top = Math.round(clientY);

                if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
                if (left < 4) left = 4;
                if (top + ph > window.innerHeight - 4) top = Math.max(4, clientY - ph);
                if (top < 4) top = 4;

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            };

            const openPanel = () => {
                if (trigger) trigger.classList.add('active');
                window.__uiMenuRegistry.closeAllIncludingNative();
                window.__uiMenuRegistry.register(panel);
                rebuildContent();
                panel.classList.add('open');
                localState.open = true;
                if (trigger) positionUnderTrigger();
            };

            const closePanel = () => {
                panel.classList.remove('open');
                if (trigger) trigger.classList.remove('active');
                localState.open = false;
                window.__uiMenuRegistry.unregister(panel);
            };

            const togglePanel = () => {
                if (localState.open) closePanel();
                else openPanel();
            };

            panel.__close = closePanel;

            if (trigger) {
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    togglePanel();
                });
            }

            const api = {
                open: openPanel,
                close: closePanel,
                toggle: togglePanel,
                isOpen: () => localState.open,
                openAt: (clientX, clientY) => {
                    window.__uiMenuRegistry.closeAllIncludingNative();
                    window.__uiMenuRegistry.register(panel);
                    rebuildContent();
                    panel.classList.add('open');
                    localState.open = true;
                    positionAtCursor(clientX, clientY);
                },
                setItems: (newItems) => {
                    items.length = 0;
                    if (Array.isArray(newItems)) items.push(...newItems);
                    if (localState.open) rebuildContent();
                },
                destroy: () => {
                    closePanel();
                    if (panel.parentNode) panel.parentNode.removeChild(panel);
                },
                panelEl: panel
            };

            if (headless) {
                panel.open = api.open;
                panel.close = api.close;
                panel.toggle = api.toggle;
                panel.isOpen = api.isOpen;
                panel.openAt = api.openAt;
                panel.setItems = api.setItems;
                panel.destroy = api.destroy;
                panel.panelEl = panel;
                return panel;
            }

            trigger.open = api.open;
            trigger.close = api.close;
            trigger.toggle = api.toggle;
            trigger.isOpen = api.isOpen;
            trigger.openAt = api.openAt;
            trigger.setItems = api.setItems;
            trigger.destroy = api.destroy;
            trigger.panelEl = panel;

            return trigger;
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // УТИЛИТЫ — DOM
    // ═══════════════════════════════════════════════════════════════

    registerComponent('utils', 'dom', {
        version: '1.0.0',

        el(tag, props = {}, children = []) {
            const e = document.createElement(tag);
            if (props) {
                for (const key in props) {
                    if (key === 'style' && typeof props[key] === 'object') {
                        Object.assign(e.style, props[key]);
                    } else if (key === 'className' || key === 'class') {
                        e.className = props[key];
                    } else if (key === 'text') {
                        e.textContent = props[key];
                    } else if (key === 'html') {
                        e.innerHTML = props[key];
                    } else if (key.startsWith('on') && typeof props[key] === 'function') {
                        e.addEventListener(key.slice(2).toLowerCase(), props[key]);
                    } else if (key === 'dataset' && typeof props[key] === 'object') {
                        for (const dk in props[key]) e.dataset[dk] = props[key][dk];
                    } else {
                        try { e[key] = props[key]; } catch (err) {}
                    }
                }
            }
            if (Array.isArray(children)) {
                for (const child of children) {
                    if (child == null) continue;
                    e.appendChild(typeof child === 'string' || typeof child === 'number'
                        ? document.createTextNode(String(child))
                        : child);
                }
            }
            return e;
        },

        clear(el) {
            while (el.firstChild) el.removeChild(el.firstChild);
        },

        on(el, event, handler) {
            el.addEventListener(event, handler);
            return () => el.removeEventListener(event, handler);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // УТИЛИТЫ — CANVAS
    // ═══════════════════════════════════════════════════════════════

    registerComponent('utils', 'canvas', {
        version: '1.0.0',

        roundRect(ctx, x, y, w, h, r) {
            r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        },

        bezier(ctx, x1, y1, x2, y2, k = 0.5) {
            const dx = Math.max(40, Math.abs(x2 - x1) * k);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
        },

        multiBezier(ctx, points, segmentK = 0.35) {
            if (points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            if (points.length === 2) {
                const dx = Math.max(40, Math.abs(points[1].x - points[0].x) * 0.5);
                ctx.bezierCurveTo(
                    points[0].x + dx, points[0].y,
                    points[1].x - dx, points[1].y,
                    points[1].x, points[1].y
                );
                return;
            }

            for (let i = 0; i < points.length - 1; i++) {
                const p0 = i === 0 ? points[i] : points[i - 1];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = i + 2 < points.length ? points[i + 2] : points[i + 1];

                const c1x = p1.x + (p2.x - p0.x) * segmentK;
                const c1y = p1.y + (p2.y - p0.y) * segmentK;
                const c2x = p2.x - (p3.x - p1.x) * segmentK;
                const c2y = p2.y - (p3.y - p1.y) * segmentK;

                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
            }
        },

        distToSegment(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1, dy = y2 - y1;
            const len2 = dx * dx + dy * dy;
            let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = x1 + dx * t, cy = y1 + dy * t;
            const ddx = px - cx, ddy = py - cy;
            return { dist: Math.sqrt(ddx * ddx + ddy * ddy), t, point: { x: cx, y: cy } };
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // УТИЛИТЫ — FILE
    // ═══════════════════════════════════════════════════════════════

    registerComponent('utils', 'file', {
        version: '1.0.0',

        saveJSON(filename, data) {
            try {
                const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'data.json';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                return true;
            } catch (e) {
                console.error('[utils.file.saveJSON] error:', e);
                return false;
            }
        },

        openJSON(callback, accept = '.json') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        if (typeof callback === 'function') callback(parsed, file);
                    } catch (err) {
                        console.error('[utils.file.openJSON] parse error:', err);
                        if (typeof callback === 'function') callback(null, file, err);
                    }
                };
                reader.onerror = () => {
                    if (typeof callback === 'function') callback(null, file, reader.error);
                };
                reader.readAsText(file);
            };
            input.click();
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // УТИЛИТЫ — GRAPH2D (Camera + GridCache)
    // ═══════════════════════════════════════════════════════════════
    //
    // Общие утилиты для 2D-редакторов (NodeGraphWindow, 2DWindow и т.п.).
    //
    // Theme: объект { palette: { gridSmall, gridMedium, gridLarge, ... } }.
    // Если тема не передана — используются дефолтные цвета сетки.
    //
    //   const cam = this.utils.graph2d.camera({ physics: {...} });
    //   const gc  = this.utils.graph2d.gridCache(this._theme);
    //   gc.render(ctx, cam, w, h, dpr);

    (function installGraph2DUtils() {
        'use strict';

        const ZOOM_MIN = 0.15;
        const ZOOM_MAX = 4.0;
        const ZOOM_STEP_KEY = 0.1;

        const GRID_SMALL = 16;
        const GRID_MEDIUM = GRID_SMALL * 10;
        const GRID_LARGE = GRID_MEDIUM * 10;
        const GRID_TILE_WORLD = GRID_LARGE;

        const GRID_LOD_MEDIUM_MIN = 0.15;
        const GRID_LOD_SMALL_MIN  = 0.45;

        const _clamp = (v, mn, mx) => v < mn ? mn : (v > mx ? mx : v);

        class Camera {
            constructor() {
                this.x = 0;
                this.y = 0;
                this.zoom = 1.0;
                this.viewportWidth = 0;
                this.viewportHeight = 0;

                this.velocityX = 0;
                this.velocityY = 0;
                this.velocityZoom = 0;
                this.friction = 0.92;
                this.frictionZoom = 0.85;
                this.maxVelocity = 100;
                this.maxVelocityZoom = 0.5;
                this.isPhysicsEnabled = true;

                this.isAnimating = false;
                this.animationId = null;
                this.animStartTime = 0;
                this.animDuration = 300;

                this.startX = 0; this.startY = 0; this.startZoom = 1.0;
                this.targetX = 0; this.targetY = 0; this.targetZoom = 1.0;

                this.bezierP1 = { x: 0.25, y: 0.1 };
                this.bezierP2 = { x: 0.25, y: 1.0 };

                this._cachedCenter = null;
                this._listeners = {
                    onZoom: [], onPan: [], onReset: [],
                    onAnimationStart: [], onAnimationEnd: []
                };
            }

            setViewport(w, h) {
                if (w <= 0 || h <= 0) return;
                this.viewportWidth = w;
                this.viewportHeight = h;
                this._cachedCenter = null;
            }

            worldToScreen(wx, wy) {
                return { x: (wx + this.x) * this.zoom, y: (wy + this.y) * this.zoom };
            }
            screenToWorld(sx, sy) {
                return { x: sx / this.zoom - this.x, y: sy / this.zoom - this.y };
            }
            getViewCenter() {
                if (this._cachedCenter) return this._cachedCenter;
                this._cachedCenter = {
                    x: this.viewportWidth / 2 / this.zoom - this.x,
                    y: this.viewportHeight / 2 / this.zoom - this.y
                };
                return this._cachedCenter;
            }
            invalidateCache() { this._cachedCenter = null; }

            setPhysicsParams(friction, frictionZoom, maxVelocity, maxVelocityZoom) {
                this.friction = _clamp(friction, 0.5, 0.99);
                this.frictionZoom = _clamp(frictionZoom, 0.5, 0.99);
                this.maxVelocity = Math.max(1, maxVelocity);
                this.maxVelocityZoom = Math.max(0.01, maxVelocityZoom);
            }

            applyImpulse(dx, dy, dZoom = 0) {
                if (!this.isPhysicsEnabled) return;
                this.velocityX += dx; this.velocityY += dy; this.velocityZoom += dZoom;
            }

            _updatePhysics(dt) {
                if (!this.isPhysicsEnabled) return;
                const d = Math.min(dt, 0.05);
                if (Math.abs(this.velocityX) > 0.001 || Math.abs(this.velocityY) > 0.001) {
                    this.x += this.velocityX * d;
                    this.y += this.velocityY * d;
                    this.velocityX *= this.friction;
                    this.velocityY *= this.friction;
                    if (Math.abs(this.velocityX) < 0.001) this.velocityX = 0;
                    if (Math.abs(this.velocityY) < 0.001) this.velocityY = 0;
                    this._cachedCenter = null;
                }
                if (Math.abs(this.velocityZoom) > 0.0001) {
                    this.zoom = _clamp(this.zoom + this.velocityZoom * d, ZOOM_MIN, ZOOM_MAX);
                    this.velocityZoom *= this.frictionZoom;
                    if (Math.abs(this.velocityZoom) < 0.0001) this.velocityZoom = 0;
                    this._cachedCenter = null;
                }
            }

            zoomToPoint(targetZoom, screenX, screenY, animate = false) {
                targetZoom = _clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
                if (Math.abs(targetZoom - this.zoom) < 0.0005) return;

                this.velocityX = 0; this.velocityY = 0; this.velocityZoom = 0;
                const worldBefore = this.screenToWorld(screenX, screenY);

                if (!animate) {
                    this.zoom = targetZoom;
                    this.x = (screenX / this.zoom) - worldBefore.x;
                    this.y = (screenY / this.zoom) - worldBefore.y;
                    this._cachedCenter = null;
                    this._emit('onZoom', { zoom: this.zoom });
                    return;
                }

                this.startX = this.x; this.startY = this.y; this.startZoom = this.zoom;
                this.targetZoom = targetZoom;
                this.targetX = (screenX / targetZoom) - worldBefore.x;
                this.targetY = (screenY / targetZoom) - worldBefore.y;
                this.isAnimating = true;
                this.animStartTime = performance.now();
                this._startAnimation();
                this._emit('onZoom', { zoom: targetZoom });
            }

            zoomToCenter(targetZoom, animate = true) {
                targetZoom = _clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
                if (Math.abs(targetZoom - this.zoom) < 0.0005) return;
                this.velocityX = 0; this.velocityY = 0; this.velocityZoom = 0;

                const c = this.getViewCenter();
                const newX = -(c.x) + this.viewportWidth / 2 / targetZoom;
                const newY = -(c.y) + this.viewportHeight / 2 / targetZoom;

                if (!animate) {
                    this.x = newX; this.y = newY; this.zoom = targetZoom;
                    this._cachedCenter = null;
                    this._emit('onZoom', { zoom: this.zoom });
                    return;
                }
                this.startX = this.x; this.startY = this.y; this.startZoom = this.zoom;
                this.targetX = newX; this.targetY = newY; this.targetZoom = targetZoom;
                this.isAnimating = true;
                this.animStartTime = performance.now();
                this._startAnimation();
                this._emit('onZoom', { zoom: targetZoom });
            }

            zoomIn(step = ZOOM_STEP_KEY) { this.zoomToCenter(Math.min(ZOOM_MAX, this.zoom + step)); }
            zoomOut(step = ZOOM_STEP_KEY) { this.zoomToCenter(Math.max(ZOOM_MIN, this.zoom - step)); }

            moveCenterTo(worldX, worldY, animate = true) {
                this.velocityX = 0; this.velocityY = 0; this.velocityZoom = 0;
                const targetX = -(worldX) + this.viewportWidth / 2 / this.zoom;
                const targetY = -(worldY) + this.viewportHeight / 2 / this.zoom;

                if (!animate) {
                    this.x = targetX; this.y = targetY;
                    this._cachedCenter = null;
                    this._emit('onPan', { x: this.x, y: this.y });
                    return;
                }
                this.startX = this.x; this.startY = this.y;
                this.targetX = targetX; this.targetY = targetY;
                this.startZoom = this.zoom; this.targetZoom = this.zoom;
                this.isAnimating = true;
                this.animStartTime = performance.now();
                this._startAnimation();
                this._emit('onPan', { x: targetX, y: targetY });
            }

            panByWorld(dxWorld, dyWorld) {
                this.x -= dxWorld;
                this.y -= dyWorld;
                this._cachedCenter = null;
                this._emit('onPan', { x: this.x, y: this.y });
            }

            reset(animate = true) {
                this.velocityX = 0; this.velocityY = 0; this.velocityZoom = 0;
                if (!animate) {
                    this.x = 0; this.y = 0; this.zoom = 1.0;
                    this._cachedCenter = null;
                    this.isAnimating = false;
                    this._emit('onReset', { x: 0, y: 0, zoom: 1.0 });
                    return;
                }
                this.startX = this.x; this.startY = this.y; this.startZoom = this.zoom;
                this.targetX = 0; this.targetY = 0; this.targetZoom = 1.0;
                this.isAnimating = true;
                this.animStartTime = performance.now();
                this._startAnimation();
                this._emit('onReset', { x: 0, y: 0, zoom: 1.0 });
            }

            _bezierEasing(t) {
                const p1x = this.bezierP1.x, p1y = this.bezierP1.y;
                const p2x = this.bezierP2.x, p2y = this.bezierP2.y;
                let g = t;
                for (let i = 0; i < 10; i++) {
                    const cx = 3 * p1x * (1 - g) * (1 - g) + 3 * p2x * (1 - g) * g * g + g ** 3;
                    if (Math.abs(cx - t) < 0.001) break;
                    g -= (cx - t) / (6 * (1 - g) * (p1x * (1 - g) + p2x * g) + 3 * (p2x - p1x) * g * g + 3 * g * g);
                    g = _clamp(g, 0, 1);
                }
                return 3 * p1y * (1 - g) ** 2 + 3 * p2y * (1 - g) * g * g + g ** 3;
            }

            _startAnimation() {
                if (this.animationId !== null) return;
                this._emit('onAnimationStart', {});
                this._animateStep();
            }

            _animateStep() {
                if (!this.isAnimating) { this.animationId = null; return; }
                const elapsed = performance.now() - this.animStartTime;
                const p = Math.min(1, elapsed / this.animDuration);
                const e = this._bezierEasing(p);

                this.x = this.startX + (this.targetX - this.startX) * e;
                this.y = this.startY + (this.targetY - this.startY) * e;
                this.zoom = this.startZoom + (this.targetZoom - this.startZoom) * e;
                this.zoom = Math.round(this.zoom * 1000) / 1000;
                this._cachedCenter = null;

                if (p >= 1) {
                    this.x = this.targetX; this.y = this.targetY; this.zoom = this.targetZoom;
                    this.isAnimating = false;
                    this.animationId = null;
                    this._cachedCenter = null;
                    this._emit('onAnimationEnd', { x: this.x, y: this.y, zoom: this.zoom });
                    return;
                }
                this.animationId = requestAnimationFrame(() => this._animateStep());
            }

            stopAnimation() {
                this.isAnimating = false;
                if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; }
                this._emit('onAnimationEnd', { canceled: true });
            }

            update(dt) { if (this.isPhysicsEnabled) this._updatePhysics(dt); }

            on(e, cb) { if (this._listeners[e]) this._listeners[e].push(cb); return this; }
            off(e, cb) {
                if (this._listeners[e]) this._listeners[e] = this._listeners[e].filter(x => x !== cb);
                return this;
            }
            _emit(e, d) {
                if (this._listeners[e]) for (const cb of this._listeners[e]) {
                    try { cb(d); } catch (err) { console.error(`[Camera] ${e}:`, err); }
                }
            }

            getZoomPercent() { return Math.round(this.zoom * 100); }

            destroy() { this.stopAnimation(); this._listeners = {}; }
        }

        class GridCache {
            constructor(theme) {
                this.theme = theme || null;
                this._tile = null;
                this._tileDpr = 1;
                this._tileZoomKey = null;
                this._tileSizePx = 0;
            }

            static lodForZoom(z) {
                if (z < GRID_LOD_MEDIUM_MIN) return { small: false, medium: false, large: true };
                if (z < GRID_LOD_SMALL_MIN)  return { small: false, medium: true,  large: true };
                return { small: true, medium: true, large: true };
            }

            _lodKey(lod) { return `${lod.small ? 1 : 0}${lod.medium ? 1 : 0}${lod.large ? 1 : 0}`; }

            _palette() {
                const p = this.theme && this.theme.palette ? this.theme.palette : null;
                return {
                    small:  (p && p.gridSmall)  || 'rgba(128,128,128,0.06)',
                    medium: (p && p.gridMedium) || 'rgba(128,128,128,0.13)',
                    large:  (p && p.gridLarge)  || 'rgba(128,128,128,0.22)'
                };
            }

            ensureTile(zoom, dpr) {
                const lod = GridCache.lodForZoom(zoom);
                const key = this._lodKey(lod);
                const tileSizeCss = GRID_TILE_WORLD * zoom;
                const clampedSize = Math.max(64, Math.min(4096, Math.round(tileSizeCss)));

                if (this._tile && this._tileZoomKey === key &&
                    Math.abs(this._tileSizePx - clampedSize) < 0.5 &&
                    this._tileDpr === dpr) {
                    return { lod, tile: this._tile, tileSizeCss: this._tileSizePx / this._tileDpr };
                }

                this._tile = this._buildTile(lod, clampedSize, dpr);
                this._tileZoomKey = key;
                this._tileDpr = dpr;
                this._tileSizePx = clampedSize;
                return { lod, tile: this._tile, tileSizeCss: clampedSize / dpr };
            }

            _buildTile(lod, sizeCss, dpr) {
                if (typeof document === 'undefined') return null;
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.floor(sizeCss * dpr));
                c.height = Math.max(1, Math.floor(sizeCss * dpr));
                const ctx = c.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, sizeCss, sizeCss);

                const colors = this._palette();
                const scale = sizeCss / GRID_TILE_WORLD;

                const draw = (stepWorld, color) => {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    const stepPx = stepWorld * scale;
                    if (stepPx < 2) return;
                    ctx.beginPath();
                    for (let x = 0; x <= sizeCss + 0.5; x += stepPx) {
                        const px = Math.round(x) + 0.5;
                        ctx.moveTo(px, 0); ctx.lineTo(px, sizeCss);
                    }
                    for (let y = 0; y <= sizeCss + 0.5; y += stepPx) {
                        const py = Math.round(y) + 0.5;
                        ctx.moveTo(0, py); ctx.lineTo(sizeCss, py);
                    }
                    ctx.stroke();
                };

                if (lod.small)  draw(GRID_SMALL,  colors.small);
                if (lod.medium) draw(GRID_MEDIUM, colors.medium);
                if (lod.large)  draw(GRID_LARGE,  colors.large);

                return c;
            }

            render(ctx, camera, w, h, dpr) {
                const { tile, tileSizeCss } = this.ensureTile(camera.zoom, dpr);
                if (!tile || tileSizeCss < 4) return;

                const worldLeft = -camera.x;
                const worldTop  = -camera.y;

                const tileIndexX = Math.floor(worldLeft / GRID_TILE_WORLD);
                const tileIndexY = Math.floor(worldTop  / GRID_TILE_WORLD);

                const offsetX = (tileIndexX * GRID_TILE_WORLD - worldLeft) * camera.zoom;
                const offsetY = (tileIndexY * GRID_TILE_WORLD - worldTop)  * camera.zoom;

                const tilesX = Math.ceil(w / tileSizeCss) + 1;
                const tilesY = Math.ceil(h / tileSizeCss) + 1;

                ctx.save();
                ctx.imageSmoothingEnabled = false;
                for (let ty = 0; ty <= tilesY; ty++) {
                    for (let tx = 0; tx <= tilesX; tx++) {
                        const x = offsetX + tx * tileSizeCss;
                        const y = offsetY + ty * tileSizeCss;
                        if (x > w || y > h) continue;
                        if (x + tileSizeCss < 0 || y + tileSizeCss < 0) continue;
                        ctx.drawImage(tile, x, y, tileSizeCss, tileSizeCss);
                    }
                }
                ctx.restore();
            }

            invalidate() { this._tile = null; this._tileZoomKey = null; this._tileSizePx = 0; }
        }

        registerComponent('utils', 'graph2d', {
            version: '1.0.0',

            ZOOM_MIN, ZOOM_MAX, ZOOM_STEP_KEY,
            GRID_SMALL, GRID_MEDIUM, GRID_LARGE, GRID_TILE_WORLD,
            GRID_LOD_MEDIUM_MIN, GRID_LOD_SMALL_MIN,
            Camera, GridCache,

            camera(opts = {}) {
                const cam = new Camera();
                if (opts.physics) {
                    cam.setPhysicsParams(
                        opts.physics.friction,
                        opts.physics.frictionZoom,
                        opts.physics.maxVelocity,
                        opts.physics.maxVelocityZoom
                    );
                }
                return cam;
            },

            gridCache(theme) {
                return new GridCache(theme);
            }
        });
    })();

})();