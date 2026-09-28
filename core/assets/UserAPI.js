// data/UserAPI.js
// Версия 2.3.0

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // UI MENU REGISTRY
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

                if (Array.isArray(item.actions) && item.actions.length > 0) {
                    const actionsWrap = document.createElement('span');
                    actionsWrap.className = 'ui-catpanel__item-actions';

                    for (const act of item.actions) {
                        if (!act || typeof act !== 'object') continue;

                        const ab = document.createElement('button');
                        ab.type = 'button';
                        ab.className = 'ui-catpanel__item-action';
                        if (act.danger) ab.classList.add('danger');
                        if (act.title) ab.title = act.title;

                        if (act.icon) {
                            if (typeof act.icon === 'string' && act.icon.startsWith('icon-')) {
                                ab.appendChild(host.ui.icon.svg(act.icon, 11));
                            } else {
                                ab.textContent = String(act.icon);
                            }
                        }

                        ab.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            try {
                                if (typeof act.onClick === 'function') act.onClick(item, e);
                            } catch (err) {
                                console.error('[ui.categoryPanel] action click error:', err);
                            }
                            if (act.closePanel === true) closePanel();
                        });

                        ab.addEventListener('mousedown', (e) => {
                            e.stopPropagation();
                        });

                        actionsWrap.appendChild(ab);
                    }

                    btn.appendChild(actionsWrap);
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
    // HEADER ITEMS — базовые типы (button / dropdown / separator)
    // ═══════════════════════════════════════════════════════════════

    (function installBaseHeaderItems() {
        if (!window.HeaderController) return;

        function esc(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        var _registered = false;
        if (window.HeaderController.getHeaderItemTypes().indexOf('button') !== -1
            && window.HeaderController.getHeaderItemTypes().indexOf('dropdown') !== -1
            && window.HeaderController.getHeaderItemTypes().indexOf('separator') !== -1) {
            _registered = true;
        }
        if (_registered) return;

        window.HeaderController.registerHeaderItemType('button', function(desc, ctx) {
            var btn = document.createElement('button');
            btn.className = 'window-action-btn';
            btn.title = desc.title || '';
            btn.setAttribute('type', 'button');

            if (desc.action) btn.setAttribute('data-action', desc.action);
            if (desc.value)  btn.setAttribute('data-value', desc.value);

            var iconHtml = desc.icon && desc.icon.indexOf('icon-') === 0
                ? '<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;"><use href="#' + esc(desc.icon) + '"></use></svg>'
                : esc(desc.icon || '');

            var labelHtml = desc.label
                ? '<span class="btn-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">' + esc(desc.label) + '</span>'
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
                'background:' + (desc.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))'),
                'color:' + (desc.color || 'var(--text-secondary, #a09888)'),
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
                if (desc.danger) {
                    this.style.background = 'var(--accent-red, #cc2233)';
                    this.style.borderColor = 'var(--accent-red, #cc2233)';
                    this.style.color = '#fff';
                    return;
                }
                this.style.background = desc.hoverBg || 'var(--bg-active, rgba(60, 60, 60, 0.8))';
                this.style.borderColor = 'var(--border-hover, rgba(200, 184, 154, 0.4))';
                this.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = desc.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = desc.color || 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', function(e) {
                e.stopPropagation();

                if (desc.callback && typeof desc.callback === 'function') {
                    try { desc.callback(ctx.baseWindow, ctx); } catch (err) {
                        console.error('[UserAPI.header.button] callback error:', err);
                    }
                    return;
                }

                ctx.header._emit('menu-action', {
                    windowId: ctx.header._id,
                    action: desc.action || '',
                    value: desc.value || '',
                    payload: desc.payload !== undefined ? desc.payload : null,
                    item: desc
                });
            });

            return btn;
        });

        window.HeaderController.registerHeaderItemType('dropdown', function(desc, ctx) {
            var header = ctx.header;

            var wrapper = document.createElement('div');
            wrapper.className = 'window-actions dropdown-wrapper';
            if (desc.id) wrapper.dataset.dropdownId = desc.id;

            wrapper.style.cssText = [
                'position:relative',
                'display:flex',
                'flex-shrink:0',
                'overflow:hidden'
            ].join(';');

            var btn = document.createElement('button');
            btn.className = 'window-action-btn dropdown-toggle';
            btn.title = desc.title || desc.label || 'Menu';
            btn.setAttribute('type', 'button');
            if (desc.action) btn.setAttribute('data-action', desc.action);

            var iconHtml = desc.icon && desc.icon.indexOf('icon-') === 0
                ? '<svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0;"><use href="#' + esc(desc.icon) + '"></use></svg>'
                : esc(desc.icon || '☰');

            btn.innerHTML = [
                '<span class="dropdown-icon" style="display:flex;align-items:center;flex-shrink:0;">' + iconHtml + '</span>',
                '<span class="btn-text-wrapper" style="display:flex;align-items:center;gap:var(--rw-btn-gap-active, 4px);min-width:0;overflow:hidden;">',
                '    <span class="dropdown-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:var(--rw-label-opacity, 1);max-width:var(--rw-label-maxw, 80px);">' + esc(desc.label || '') + '</span>',
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
            if (desc.id) dropdown.dataset.dropdownId = desc.id;
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
                var items = desc.items;
                if (typeof items === 'function') {
                    try {
                        var bw = ctx.baseWindow;
                        var real = bw && typeof bw.getRealInstance === 'function'
                            ? bw.getRealInstance()
                            : bw;
                        items = items(real, bw, ctx.layoutManager);
                    } catch (e) {
                        console.warn('[UserAPI.header.dropdown] items() error:', e);
                        items = [];
                    }
                }
                return Array.isArray(items) ? items : [];
            };

            var renderItems = function() {
                var items = resolveItems();
                renderDropdownItems(dropdown, items, header);
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
                header.positionDropdown(dropdown, btn);
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
                if (dropdown.style.display === 'block') header.positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);

            wrapper._cleanup = function() {
                document.removeEventListener('click', closeHandler);
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            };
            wrapper._refreshItems = function() {
                if (dropdown.style.display === 'block') renderItems();
            };
            wrapper._closeDropdown = closeDropdown;

            return wrapper;
        });

        window.HeaderController.registerHeaderItemType('separator', function(desc) {
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

        function renderDropdownItems(container, items, header) {
            if (!Array.isArray(items)) return;
            container.innerHTML = '';

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!item) continue;

                if (item.header) {
                    var headerEl = document.createElement('div');
                    headerEl.className = 'dropdown-header';
                    headerEl.style.cssText = [
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
                    headerEl.textContent = item.header;
                    container.appendChild(headerEl);
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

                var b = document.createElement('button');
                b.className = 'dropdown-item';
                b.dataset.action = item.action || '';
                b.dataset.value = (item.value !== undefined && item.value !== null) ? String(item.value) : '';
                b.setAttribute('type', 'button');

                var isActive = item.check || false;
                var isDanger = item.danger || false;
                var isDisabled = item.disabled || false;

                var iconHtml = item.icon && item.icon.indexOf('icon-') === 0
                    ? '<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;"><use href="#' + esc(item.icon) + '"></use></svg>'
                    : (item.icon ? '<span style="font-size:14px;flex-shrink:0;">' + esc(item.icon) + '</span>' : '');

                var shortcutHtml = item.shortcut
                    ? '<span class="item-shortcut" style="color:var(--text-muted, rgba(200,184,154,0.35));font-size:9px;flex-shrink:0;">' + esc(item.shortcut) + '</span>'
                    : '';

                var checkHtml = isActive
                    ? '<span class="dropdown-check" style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>'
                    : '';

                b.innerHTML = [
                    iconHtml,
                    '<span class="item-label" style="flex:1;text-align:left;">' + esc(item.label || '') + '</span>',
                    shortcutHtml,
                    checkHtml
                ].join('');

                b.style.cssText = [
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
                    b.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                    });
                    b.addEventListener('mouseleave', function() {
                        this.style.background = isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent';
                    });
                }

                b.addEventListener('click', (function(capturedItem, capturedBtn) {
                    return function(e) {
                        e.stopPropagation();
                        e.preventDefault();

                        if (capturedBtn.disabled) return;

                        var action = capturedBtn.dataset.action || '';
                        var value = capturedBtn.dataset.value || '';

                        if (capturedItem.callback && typeof capturedItem.callback === 'function') {
                            try {
                                capturedItem.callback(header._baseWindow, capturedItem);
                            } catch (err) {
                                console.error('[UserAPI.header.dropdown] item callback error:', err);
                            }
                        }

                        header._emit('menu-action', {
                            windowId: header._id,
                            action: action,
                            value: value,
                            payload: capturedItem.payload !== undefined ? capturedItem.payload : null,
                            item: capturedItem
                        });

                        container.style.display = 'none';
                        container.style.opacity = '0';
                    };
                })(item, b));

                container.appendChild(b);
            }
        }
    })();

    // ═══════════════════════════════════════════════════════════════
    // SYSTEM CONTROLS — sys-* header items
    // ═══════════════════════════════════════════════════════════════

    (function installSystemControls() {
        if (!window.HeaderController) return;
        if (window.HeaderController.getHeaderItemTypes().indexOf('sys-close') !== -1) return;

        function esc(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function makeBaseButton() {
            var btn = document.createElement('button');
            btn.setAttribute('type', 'button');
            btn.className = 'window-action-btn';
            btn.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'width:22px',
                'min-width:22px',
                'height:22px',
                'padding:0',
                'border-width:1px',
                'border-style:solid',
                'border-color:var(--border-color, rgba(200, 184, 154, 0.12))',
                'border-radius:4px',
                'background:var(--bg-hover, rgba(40, 40, 40, 0.4))',
                'color:var(--text-secondary, #a09888)',
                'cursor:pointer',
                'transition:background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                'flex-shrink:0',
                'box-sizing:border-box'
            ].join(';');
            return btn;
        }

        function attachHover(btn, options) {
            options = options || {};

            var baseBg = options.bg || 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
            var baseBorder = options.border || 'var(--border-color, rgba(200, 184, 154, 0.12))';
            var baseColor = options.color || 'var(--text-secondary, #a09888)';

            var hoverBg = options.hoverBg || 'var(--bg-active, rgba(60, 60, 60, 0.8))';
            var hoverBorder = options.hoverBorder || 'var(--border-hover, rgba(200, 184, 154, 0.4))';
            var hoverColor = options.hoverColor || 'var(--text-primary, #e0d8cc)';

            btn.addEventListener('mouseenter', function() {
                this.style.background = hoverBg;
                this.style.borderColor = hoverBorder;
                this.style.color = hoverColor;
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = baseBg;
                this.style.borderColor = baseBorder;
                this.style.color = baseColor;
            });
        }

        function setIcon(btn, iconId, size) {
            btn.innerHTML = [
                '<svg class="icon-svg" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;display:block;">',
                '    <use href="#' + esc(iconId) + '"></use>',
                '</svg>'
            ].join('');
        }

        function makeDropdownShell(className) {
            var dd = document.createElement('div');
            dd.className = 'window-dropdown ' + className;
            dd.style.cssText = [
                'position:fixed',
                'background:var(--bg-panel, #1a1a1a)',
                'border:1px solid var(--border-color, rgba(200, 184, 154, 0.12))',
                'border-radius:var(--radius, 6px)',
                'padding:4px 0',
                'min-width:180px',
                'max-width:320px',
                'width:max-content',
                'z-index:999999',
                'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
                'backdrop-filter:blur(12px)',
                'display:none',
                'opacity:0',
                'transform:translateY(-8px) scale(0.98)',
                'transition:opacity 0.15s ease, transform 0.15s ease',
                'max-height:400px',
                'overflow-y:auto'
            ].join(';');
            return dd;
        }

        function openDropdown(dropdown, anchor, header) {
            dropdown.style.display = 'block';
            dropdown.style.opacity = '0';
            if (header) header.positionDropdown(dropdown, anchor);
            requestAnimationFrame(function() {
                dropdown.style.opacity = '1';
                dropdown.style.transform = 'translateY(0) scale(1)';
            });
        }

        function closeDropdown(dropdown, btn) {
            dropdown.style.display = 'none';
            dropdown.style.opacity = '0';
            if (btn) btn.classList.remove('active');
        }

        HeaderController.registerHeaderItemType('sys-close', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var btn = makeBaseButton();
            btn.className = 'window-action-btn close-btn';
            btn.title = desc.title || 'Close Window';
            setIcon(btn, 'icon-close', 12);

            btn.addEventListener('mouseenter', function() {
                this.style.background = 'var(--accent-red, #cc2233)';
                this.style.borderColor = 'var(--accent-red, #cc2233)';
                this.style.color = '#fff';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'var(--bg-hover, rgba(40, 40, 40, 0.4))';
                this.style.borderColor = 'var(--border-color, rgba(200, 184, 154, 0.12))';
                this.style.color = 'var(--text-secondary, #a09888)';
            });

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (bw && typeof bw.close === 'function') bw.close();
                else if (bw && typeof bw.destroy === 'function') bw.destroy();
            });

            return btn;
        });

        HeaderController.registerHeaderItemType('sys-minimize', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var btn = makeBaseButton();
            btn.className = 'window-action-btn minimize-btn';
            btn.title = desc.title || 'Свернуть окно';
            setIcon(btn, 'icon-minimize', 12);
            attachHover(btn);

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (bw && typeof bw.minimize === 'function') bw.minimize();
            });

            return btn;
        });

        HeaderController.registerHeaderItemType('sys-fullscreen', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var btn = makeBaseButton();
            btn.className = 'window-action-btn fullscreen-btn';
            attachHover(btn);

            var updateIcon = function() {
                var isFs = bw && typeof bw.isFullscreen === 'function' && bw.isFullscreen();
                setIcon(btn, isFs ? 'icon-fullscreen-exit' : 'icon-fullscreen', 12);
                btn.title = isFs ? 'Выйти из полного экрана' : 'На весь экран';
            };

            updateIcon();

            var onLayoutChanged = function() {
                updateIcon();
            };
            document.addEventListener('layout-changed', onLayoutChanged);

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!bw) return;
                if (typeof bw.isFullscreen === 'function' && bw.isFullscreen()) {
                    if (typeof bw.exitFullscreen === 'function') bw.exitFullscreen();
                } else {
                    if (typeof bw.setFullscreen === 'function') bw.setFullscreen();
                }
            });

            btn.__lsDestroy = function() {
                document.removeEventListener('layout-changed', onLayoutChanged);
            };

            return btn;
        });

        HeaderController.registerHeaderItemType('sys-data', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var header = ctx.header;
            var dataBus = bw && bw._dataBus;

            var wrapper = document.createElement('div');
            wrapper.className = 'window-actions data-btn-wrapper';
            wrapper.style.cssText = 'position:relative;display:flex;flex-shrink:0;';

            var btn = makeBaseButton();
            btn.className = 'window-action-btn data-btn';
            btn.title = desc.title || 'Данные';
            setIcon(btn, 'icon-data', 12);
            attachHover(btn);

            wrapper.appendChild(btn);

            var dropdown = makeDropdownShell('data-dropdown');
            if (bw) dropdown.dataset.windowId = String(bw.id);
            document.body.appendChild(dropdown);

            var cleanupCallbacks = [];

            var makeDataItem = function(opts) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'dropdown-item';

                var iconHtml = opts.icon && opts.icon.indexOf('icon-') === 0
                    ? '<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;"><use href="#' + esc(opts.icon) + '"></use></svg>'
                    : (opts.icon ? '<span style="font-size:14px;flex-shrink:0;width:16px;text-align:center;">' + esc(opts.icon) + '</span>' : '');

                b.innerHTML = [
                    iconHtml,
                    '<span style="flex:1;text-align:left;">' + esc(opts.label || '') + '</span>'
                ].join('');

                b.style.cssText = [
                    'display:flex',
                    'align-items:center',
                    'gap:8px',
                    'width:100%',
                    'padding:7px 14px',
                    'border:none',
                    'background:transparent',
                    'color:' + (opts.danger ? 'var(--accent-red, #cc2233)' : 'var(--text-primary, #e0d8cc)'),
                    'font-size:12px',
                    'cursor:' + (opts.disabled ? 'default' : 'pointer'),
                    'text-align:left',
                    'transition:background 0.15s ease',
                    'font-family:inherit',
                    'opacity:' + (opts.disabled ? '0.4' : '1'),
                    'outline:none'
                ].join(';');

                if (!opts.disabled) {
                    b.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                    });
                    b.addEventListener('mouseleave', function() {
                        this.style.background = 'transparent';
                    });
                    b.addEventListener('click', function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        if (opts.onClick) opts.onClick();
                    });
                }

                return b;
            };

            var makeAttachItem = function() {
                var wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative;';

                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'dropdown-item';
                b.innerHTML = [
                    '<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;"><use href="#icon-link"></use></svg>',
                    '<span style="flex:1;text-align:left;">Привязать</span>',
                    '<svg class="icon-svg" style="width:9px;height:9px;flex-shrink:0;fill:currentColor;opacity:0.6;"><use href="#icon-chevron-right"></use></svg>'
                ].join('');
                b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:7px 14px;border:none;background:transparent;color:var(--text-primary, #e0d8cc);font-size:12px;cursor:pointer;text-align:left;transition:background 0.15s ease;font-family:inherit;outline:none;';

                b.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                });
                b.addEventListener('mouseleave', function() {
                    this.style.background = 'transparent';
                });

                var submenu = makeDropdownShell('data-submenu');
                submenu.style.minWidth = '200px';
                submenu.style.maxWidth = '360px';
                submenu.style.zIndex = '1000000';

                var buildSubmenu = function() {
                    submenu.innerHTML = '';

                    if (!dataBus) {
                        submenu.appendChild(makeDataItem({
                            icon: 'icon-warning',
                            label: 'DataBus недоступен',
                            disabled: true
                        }));
                        return;
                    }

                    var type = bw ? bw.type : 'unknown';
                    var currentSlotId = bw && typeof bw.getSlotId === 'function' ? bw.getSlotId() : null;

                    var activeSlots = dataBus.getActiveSlotsByType(type);
                    var freeSlots = dataBus.getFreeActiveSlotsByType(type);
                    var archivedSlots = dataBus.getArchivedSlotsByType(type);

                    var all = [];
                    var seen = {};
                    var push = function(sid) {
                        if (seen[sid]) return;
                        seen[sid] = true;
                        all.push(sid);
                    };
                    for (var i = 0; i < freeSlots.length; i++) push(freeSlots[i]);
                    for (var j = 0; j < activeSlots.length; j++) push(activeSlots[j]);
                    for (var k = 0; k < archivedSlots.length; k++) push(archivedSlots[k]);

                    if (all.length === 0) {
                        submenu.appendChild(makeDataItem({
                            icon: '—',
                            label: 'Нет слотов',
                            disabled: true
                        }));
                        return;
                    }

                    for (var m = 0; m < all.length; m++) {
                        var sid = all[m];
                        var slot = dataBus.getSlot(sid);
                        if (!slot) continue;

                        var isCurrent = sid === currentSlotId;
                        var isArchived = slot.archived;
                        var attachedCount = slot.attachedWindows.size;

                        var hint = '';
                        if (isArchived) hint = 'архив';
                        else if (attachedCount > 1) hint = attachedCount + ' окон';
                        else if (attachedCount === 1) hint = '1 окно';

                        var iconId = isCurrent ? 'icon-circle-filled'
                            : (isArchived ? 'icon-archive' : 'icon-circle');

                        var node = makeDataItem({
                            icon: iconId,
                            label: sid + (hint ? '  ·  ' + hint : ''),
                            danger: isCurrent,
                            onClick: (function(sidArg, isCur) {
                                return function() {
                                    if (!isCur) {
                                        header._emit('data-attach', {
                                            windowId: bw.id,
                                            slotId: sidArg
                                        });
                                    }
                                    closeDropdown(submenu, null);
                                    closeDropdown(dropdown, btn);
                                };
                            })(sid, isCurrent)
                        });

                        if (isCurrent) node.style.opacity = '0.7';
                        submenu.appendChild(node);
                    }
                };

                var openSubmenu = function() {
                    buildSubmenu();
                    submenu.style.display = 'block';
                    submenu.style.opacity = '0';

                    var bRect = b.getBoundingClientRect();
                    var ddW = submenu.offsetWidth || 200;
                    var ddH = submenu.offsetHeight || 200;

                    var left = Math.round(bRect.right + 4);
                    var top = Math.round(bRect.top);

                    if (left + ddW > window.innerWidth - 4) {
                        left = Math.round(bRect.left - ddW - 4);
                    }
                    if (left < 4) left = 4;
                    if (top + ddH > window.innerHeight - 4) {
                        top = window.innerHeight - ddH - 4;
                    }
                    if (top < 4) top = 4;

                    submenu.style.left = left + 'px';
                    submenu.style.top = top + 'px';

                    requestAnimationFrame(function() {
                        submenu.style.opacity = '1';
                    });
                };

                var closeSubmenu = function() {
                    closeDropdown(submenu, null);
                };

                b.addEventListener('mouseenter', openSubmenu);
                b.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    openSubmenu();
                });

                wrap.addEventListener('mouseleave', function(e) {
                    if (submenu.contains(e.relatedTarget)) return;
                    closeSubmenu();
                });
                submenu.addEventListener('mouseleave', function(e) {
                    if (wrap.contains(e.relatedTarget)) return;
                    closeSubmenu();
                });

                wrap.appendChild(b);
                document.body.appendChild(submenu);

                cleanupCallbacks.push(function() {
                    if (submenu.parentNode) submenu.parentNode.removeChild(submenu);
                });

                return wrap;
            };

            var defaultDataMenu = function() {
                return [
                    { icon: 'icon-import', label: 'Импорт', action: 'import' },
                    { icon: 'icon-export', label: 'Экспорт', action: 'export' },
                    { divider: true },
                    { icon: 'icon-plus',   label: 'Новый слот', action: 'new-slot' },
                    { icon: 'icon-link',   label: 'Привязать',  action: 'attach' }
                ];
            };

            var buildDataMenuItem = function(item, realInstance) {
                if (!item || typeof item !== 'object') return null;

                if (item.divider) {
                    var hr = document.createElement('hr');
                    hr.style.cssText = 'border:none;border-top:1px solid var(--border-color, rgba(200, 184, 154, 0.12));margin:4px 8px;opacity:0.3;';
                    return hr;
                }

                if (item.header) {
                    var h = document.createElement('div');
                    h.className = 'dropdown-header';
                    h.style.cssText = 'padding:6px 14px 4px;font-size:10px;font-weight:600;color:var(--text-muted, rgba(200,184,154,0.35));text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border-color, rgba(200,184,154,0.12));margin-bottom:2px;pointer-events:none;';
                    h.textContent = item.header;
                    return h;
                }

                var proto = (typeof window !== 'undefined' && window.BaseWindowInstance)
                    ? window.BaseWindowInstance.prototype
                    : null;

                var canImport = !!realInstance
                    && typeof realInstance.onImport === 'function'
                    && (!proto || realInstance.onImport !== proto.onImport);
                var canExport = !!realInstance
                    && typeof realInstance.onExport === 'function'
                    && (!proto || realInstance.onExport !== proto.onExport);

                if (item.action === 'import') {
                    return makeDataItem({
                        icon: item.icon || 'icon-import',
                        label: item.label || 'Импорт',
                        disabled: item.disabled || !canImport,
                        onClick: function() {
                            header._emit('data-import', { windowId: bw.id });
                            closeDropdown(dropdown, btn);
                        }
                    });
                }

                if (item.action === 'export') {
                    return makeDataItem({
                        icon: item.icon || 'icon-export',
                        label: item.label || 'Экспорт',
                        disabled: item.disabled || !canExport,
                        onClick: function() {
                            header._emit('data-export', { windowId: bw.id });
                            closeDropdown(dropdown, btn);
                        }
                    });
                }

                if (item.action === 'new-slot') {
                    return makeDataItem({
                        icon: item.icon || 'icon-plus',
                        label: item.label || 'Новый слот',
                        disabled: !!item.disabled,
                        onClick: function() {
                            header._emit('data-new-slot', { windowId: bw.id });
                            closeDropdown(dropdown, btn);
                        }
                    });
                }

                if (item.action === 'attach') {
                    return makeAttachItem();
                }

                if (typeof item.onClick === 'function') {
                    return makeDataItem({
                        icon: item.icon || null,
                        label: item.label || '',
                        disabled: !!item.disabled,
                        danger: !!item.danger,
                        onClick: function() {
                            try {
                                item.onClick(item, { baseWindow: bw });
                            } catch (e) {
                                console.error('[UserAPI.sys-data] onClick error:', e);
                            }
                            closeDropdown(dropdown, btn);
                        }
                    });
                }

                if (item.action) {
                    return makeDataItem({
                        icon: item.icon || null,
                        label: item.label || '',
                        disabled: !!item.disabled,
                        danger: !!item.danger,
                        onClick: function() {
                            header._emit('menu-action', {
                                windowId: bw.id,
                                action: item.action,
                                value: item.value || '',
                                payload: item.payload !== undefined ? item.payload : null,
                                item: item
                            });
                            closeDropdown(dropdown, btn);
                        }
                    });
                }

                return null;
            };

            var renderItems = function() {
                dropdown.innerHTML = '';

                var realInstance = bw && typeof bw.getRealInstance === 'function'
                    ? bw.getRealInstance()
                    : null;

                if (realInstance
                    && typeof realInstance._hasCustomDataMenuOpen === 'function'
                    && realInstance._hasCustomDataMenuOpen()) {
                    try {
                        realInstance.onDataMenuOpen(btn, dropdown);
                    } catch (e) {
                        console.error('[UserAPI.sys-data] onDataMenuOpen error:', e);
                    }
                    return;
                }

                var items = (realInstance && typeof realInstance._resolveDataMenu === 'function')
                    ? realInstance._resolveDataMenu()
                    : defaultDataMenu();

                for (var i = 0; i < items.length; i++) {
                    var el = buildDataMenuItem(items[i], realInstance);
                    if (el) dropdown.appendChild(el);
                }
            };

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.data-dropdown').forEach(function(el) {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                var isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    closeDropdown(dropdown, btn);
                    return;
                }

                renderItems();
                if (window.__uiMenuRegistry) window.__uiMenuRegistry.closeAll();
                openDropdown(dropdown, btn, header);
                btn.classList.add('active');
            });

            var closeHandler = function(e) {
                if (dropdown.style.display !== 'block') return;
                if (btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                closeDropdown(dropdown, btn);
            };
            document.addEventListener('click', closeHandler);

            var repositionHandler = function() {
                if (dropdown.style.display !== 'block') return;
                if (header) header.positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);

            wrapper.__lsDestroy = function() {
                document.removeEventListener('click', closeHandler);
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
                for (var i = 0; i < cleanupCallbacks.length; i++) {
                    try { cleanupCallbacks[i](); } catch (e) {}
                }
                cleanupCallbacks = [];
            };

            return wrapper;
        });

        HeaderController.registerHeaderItemType('sys-changeType', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var header = ctx.header;
            var registry = ctx.registry;

            var wrapper = document.createElement('div');
            wrapper.className = 'window-actions change-type-wrapper';
            wrapper.style.cssText = 'position:relative;display:flex;flex-shrink:0;';

            var btn = makeBaseButton();
            btn.className = 'window-action-btn change-type-btn';
            btn.title = desc.title || 'Change Window Type';
            setIcon(btn, 'icon-window-type', 12);
            attachHover(btn);

            wrapper.appendChild(btn);

            var dropdown = makeDropdownShell('change-type-dropdown');
            if (bw) dropdown.dataset.windowId = String(bw.id);
            document.body.appendChild(dropdown);

            var renderItems = function() {
                var allTypes = registry ? registry.getAllTypes() : [];
                var currentType = bw ? bw.type : null;

                var html = '<div style="padding:6px 14px 4px 14px;font-size:10px;font-weight:600;color:var(--text-muted, rgba(200,184,154,0.35));text-transform:uppercase;letter-spacing:0.5px;">Change Window Type</div><hr style="border:none;border-top:1px solid var(--border-color, rgba(200,184,154,0.12));margin:4px 8px;opacity:0.3;">';

                for (var i = 0; i < allTypes.length; i++) {
                    var type = allTypes[i];
                    var isActive = type.id === currentType;
                    var iconHtml = type.icon && typeof type.icon === 'string' && type.icon.indexOf('icon-') === 0
                        ? '<svg class="icon-svg" style="width:14px;height:14px;flex-shrink:0;fill:currentColor;"><use href="#' + esc(type.icon) + '"></use></svg>'
                        : '<span style="font-size:14px;flex-shrink:0;">' + esc(type.icon || '📄') + '</span>';

                    html += '<button class="dropdown-item' + (isActive ? ' active' : '') + '" data-type-id="' + esc(type.id) + '" style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 14px;border:none;background:' + (isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent') + ';color:var(--text-primary, #e0d8cc);font-size:12px;cursor:pointer;text-align:left;transition:background 0.15s ease;font-family:inherit;border-radius:0;border-left:2px solid ' + (isActive ? 'var(--accent-red, #cc2233)' : 'transparent') + ';">' + iconHtml + '<span style="flex:1;">' + esc(type.name) + '</span>' + (isActive ? '<span style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>' : '') + '</button>';
                }

                dropdown.innerHTML = html;
            };

            dropdown.addEventListener('click', function(e) {
                var item = e.target.closest('.dropdown-item');
                if (!item) return;
                e.stopPropagation();
                e.preventDefault();

                var newType = item.dataset.typeId;
                if (newType && bw && newType !== bw.type) {
                    header._emit('change-type', { windowId: bw.id, newType: newType });
                }
                closeDropdown(dropdown, btn);
            });

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.change-type-dropdown').forEach(function(el) {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                var isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    closeDropdown(dropdown, btn);
                    return;
                }

                renderItems();
                if (window.__uiMenuRegistry) window.__uiMenuRegistry.closeAll();
                openDropdown(dropdown, btn, header);
                btn.classList.add('active');
            });

            var closeHandler = function(e) {
                if (dropdown.style.display !== 'block') return;
                if (btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                closeDropdown(dropdown, btn);
            };
            document.addEventListener('click', closeHandler);

            var repositionHandler = function() {
                if (dropdown.style.display !== 'block') return;
                if (header) header.positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);

            wrapper.__lsDestroy = function() {
                document.removeEventListener('click', closeHandler);
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            };

            return wrapper;
        });

        HeaderController.registerHeaderItemType('sys-layout', function(desc, ctx) {
            var bw = ctx.baseWindow;
            var header = ctx.header;
            var layoutManager = ctx.layoutManager;

            var wrapper = document.createElement('div');
            wrapper.className = 'window-actions layout-wrapper';
            wrapper.style.cssText = 'position:relative;display:flex;flex-shrink:0;';

            var btn = makeBaseButton();
            btn.className = 'window-action-btn layout-toggle-btn';
            btn.title = desc.title || 'Change Layout';
            setIcon(btn, 'icon-layout', 12);
            attachHover(btn);

            wrapper.appendChild(btn);

            var dropdown = makeDropdownShell('layout-dropdown');
            if (bw) dropdown.dataset.windowId = String(bw.id);
            document.body.appendChild(dropdown);

            var renderItems = function() {
                var styles = layoutManager ? layoutManager.getAvailableStyles() : [];
                var currentStyle = layoutManager ? layoutManager.getCurrentStyle() : null;

                if (styles.length === 0) {
                    dropdown.innerHTML = '<div style="padding:8px 14px;color:var(--text-muted, rgba(200,184,154,0.35));font-size:12px;text-align:center;">No layouts available</div>';
                    return;
                }

                var html = '<div style="padding:6px 14px 4px 14px;font-size:10px;font-weight:600;color:var(--text-muted, rgba(200,184,154,0.35));text-transform:uppercase;letter-spacing:0.5px;">Layout Style</div><hr style="border:none;border-top:1px solid var(--border-color, rgba(200,184,154,0.12));margin:4px 8px;opacity:0.3;">';

                for (var i = 0; i < styles.length; i++) {
                    var style = styles[i];
                    var isActive = style.id === currentStyle;
                    html += '<button class="dropdown-item' + (isActive ? ' active' : '') + '" data-style-id="' + esc(style.id) + '" style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 14px;border:none;background:' + (isActive ? 'var(--bg-hover, rgba(40,40,40,0.4))' : 'transparent') + ';color:var(--text-primary, #e0d8cc);font-size:12px;cursor:pointer;text-align:left;transition:background 0.15s ease;font-family:inherit;border-radius:0;border-left:2px solid ' + (isActive ? 'var(--accent-red, #cc2233)' : 'transparent') + ';"><span style="font-size:16px;">' + esc(style.icon || '⊞') + '</span><span style="flex:1;">' + esc(style.label) + '</span>' + (isActive ? '<span style="color:var(--accent-red, #cc2233);margin-left:4px;">✓</span>' : '') + '</button>';
                }

                dropdown.innerHTML = html;
            };

            dropdown.addEventListener('click', function(e) {
                var item = e.target.closest('.dropdown-item');
                if (!item) return;
                e.stopPropagation();
                e.preventDefault();

                var styleId = item.dataset.styleId;
                if (styleId) {
                    header._emit('layout-change', { windowId: bw.id, styleId: styleId });
                }
                closeDropdown(dropdown, btn);
            });

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.layout-dropdown').forEach(function(el) {
                    if (el !== dropdown) {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                });

                var isOpen = dropdown.style.display === 'block';
                if (isOpen) {
                    closeDropdown(dropdown, btn);
                    return;
                }

                renderItems();
                if (window.__uiMenuRegistry) window.__uiMenuRegistry.closeAll();
                openDropdown(dropdown, btn, header);
                btn.classList.add('active');
            });

            var closeHandler = function(e) {
                if (dropdown.style.display !== 'block') return;
                if (btn.contains(e.target)) return;
                if (dropdown.contains(e.target)) return;
                closeDropdown(dropdown, btn);
            };
            document.addEventListener('click', closeHandler);

            var repositionHandler = function() {
                if (dropdown.style.display !== 'block') return;
                if (header) header.positionDropdown(dropdown, btn);
            };
            window.addEventListener('resize', repositionHandler);
            window.addEventListener('scroll', repositionHandler, true);

            wrapper.__lsDestroy = function() {
                document.removeEventListener('click', closeHandler);
                window.removeEventListener('resize', repositionHandler);
                window.removeEventListener('scroll', repositionHandler, true);
                if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
            };

            return wrapper;
        });

    })();

})();