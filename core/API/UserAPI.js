// ExtendedAPI/UserAPI.js
// Файл-сборник всех расширенных API-компонентов.
//
// Каждый компонент регистрируется через:
//   registerComponent('category', 'name', { version?, css?, create?, ...методы, ...данные });
//
// В методах `this` — это окно (BaseWindowInstance).
// Компоненты могут ссылаться друг на друга через `this.otherCategory.otherName`.
//
// Примеры компонентов ниже. Дописывай свои.

(function() {
    'use strict';

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
            .ui-btn:active {
                transform: scale(0.98);
            }
            .ui-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                transform: none;
            }
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
            .ui-btn--danger:hover {
                background: rgba(204, 34, 51, 0.12);
            }
            .ui-btn .icon-svg {
                width: 13px;
                height: 13px;
                flex-shrink: 0;
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

            if (onClick) {
                btn.addEventListener('click', onClick);
            }

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
            .ui-input:hover {
                border-color: rgba(200, 184, 154, 0.35);
            }
            .ui-input:focus {
                border-color: rgba(200, 184, 154, 0.6);
                box-shadow: 0 0 0 3px rgba(200, 184, 154, 0.12);
            }
            .ui-input::placeholder {
                color: var(--text-muted, rgba(200, 184, 154, 0.5));
            }
        `,

        create({ value = '', placeholder = '', type = 'text', onChange = null } = {}) {
            const input = document.createElement('input');
            input.type = type;
            input.value = value;
            input.placeholder = placeholder;
            input.className = 'ui-input';

            if (onChange) {
                input.addEventListener('input', onChange);
            }

            return input;
        },

        getValue(input) {
            return input.value;
        },

        setValue(input, value) {
            input.value = value;
        },

        setPlaceholder(input, placeholder) {
            input.placeholder = placeholder;
        }
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
    // УТИЛИТЫ
    // ═══════════════════════════════════════════════════════════════

    registerComponent('utils', 'dom', {
        version: '1.0.0',

        /**
         * Создать DOM-элемент.
         *   this.utils.dom.el('div', { className: 'x' }, ['text', childEl])
         */
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
                        const event = key.slice(2).toLowerCase();
                        e.addEventListener(event, props[key]);
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
    // I18N
    // ═══════════════════════════════════════════════════════════════

    registerComponent('i18n', 'ru', {
        version: '1.0.0',

        strings: {
            'save': 'Сохранить',
            'cancel': 'Отмена',
            'close': 'Закрыть',
            'welcome': 'Добро пожаловать, {name}!'
        },

        t(key, params = {}) {
            let s = this.i18n.ru.strings[key] || key;
            for (const k in params) {
                s = s.replace('{' + k + '}', params[k]);
            }
            return s;
        },

        add(key, value) {
            this.i18n.ru.strings[key] = value;
        }
    });

})();