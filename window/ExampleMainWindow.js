// types/ExampleMainWindow.js
// Версия 3.0.0 — на BaseWindowInstance
//
// Демонстрация:
//   - drag-source на кнопке "Clear" (menu.headerButtons[].dragSource)
//   - RPC через onRequest
//   - обычные каналы (example-chat, example-sync, chat-message)
//   - findWindowsByType для списка целей
//   - context menu actions
//   - хоткеи

(function() {
    'use strict';

    class ExampleMainWindow extends BaseWindowInstance {

        // ═══════════════════════════════════════════════════════════
        // 1. МЕТАДАННЫЕ
        // ═══════════════════════════════════════════════════════════
        static get meta() {
            return {
                id: 'example-main',
                name: 'Example Chat',
                icon: 'icon-mail',
                group: 'Примеры',
                description: 'Чат-менеджер для окон типа "example"',
                category: 'other',
                defaultSize: { width: 520, height: 480 },
                minSize: { width: 350, height: 300 },
                maxWindows: 1,
                priority: 998,
                metadata: { version: '3.0.0', author: 'LSYSTEM' }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 2. МЕНЮ (Clear — с dragSource)
        // ═══════════════════════════════════════════════════════════
        static get menu() {
            return {
                headerButtons: [
                    {
                        icon: 'icon-clear',
                        label: 'Clear',
                        action: 'clearChat',
                        danger: true,
                        dragSource: {
                            type: 'clear-command',
                            getPayload: () => ({ command: 'clear' }),
                            ghostHTML: `
                                <div style="display:inline-flex;align-items:center;gap:6px;color:var(--accent-red,#cc2233);">
                                    <svg class="icon-svg" style="width:14px;height:14px;fill:currentColor;">
                                        <use href="#icon-clear"></use>
                                    </svg>
                                    <span>Clear</span>
                                </div>
                            `
                        }
                    }
                ],
                contextMenu: [
                    { icon: 'icon-refresh', label: 'Обновить цели', action: 'refreshTargets' },
                    { icon: 'icon-clear',   label: 'Очистить чат',  action: 'clearChat', danger: true }
                ],
                dropdownMenu: {
                    icon: 'icon-menu',
                    label: 'Чат',
                    items: [
                        { header: 'Управление' },
                        { label: 'Обновить цели', icon: 'icon-refresh', action: 'refreshTargets' },
                        { divider: true },
                        { label: 'Очистить чат', icon: 'icon-clear', action: 'clearChat', danger: true }
                    ]
                }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 3. ХОТКЕИ
        // ═══════════════════════════════════════════════════════════
        static get hotkeys() {
            return {
                'Ctrl+Enter': { label: 'Отправить',     action: '_sendFromInput' },
                'Ctrl+R':     { label: 'Обновить цели', action: 'refreshTargets' }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 4. КАНАЛЫ
        // ═══════════════════════════════════════════════════════════
        static get channels() {
            return ['example-chat', 'example-sync', 'chat-message'];
        }

        // ═══════════════════════════════════════════════════════════
        // 5. КОНТЕНТ
        // ═══════════════════════════════════════════════════════════
        buildContent(el) {
            Object.assign(el.style, {
                display: 'flex',
                flexDirection: 'column',
                padding: '12px',
                gap: '8px',
                boxSizing: 'border-box',
                height: '100%'
            });

            // ─── Лента сообщений ────────────────────────────────
            this._messagesEl = document.createElement('div');
            Object.assign(this._messagesEl.style, {
                flex: '1 1 auto',
                minHeight: '0',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px',
                background: 'var(--bg-panel, #1a1a1a)',
                borderRadius: '6px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.08))'
            });
            this._messagesEl.addEventListener('scroll', () => {
                this.uiState.scrollTop = this._messagesEl.scrollTop;
            });
            el.appendChild(this._messagesEl);

            // ─── Панель управления ──────────────────────────────
            const controls = document.createElement('div');
            Object.assign(controls.style, {
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexShrink: '0',
                flexWrap: 'wrap'
            });

            // Select целей
            this._targetSelect = document.createElement('select');
            Object.assign(this._targetSelect.style, {
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none',
                minWidth: '140px'
            });
            this._refreshTargets();
            controls.appendChild(this._targetSelect);

            // Input сообщения
            this._inputEl = document.createElement('input');
            this._inputEl.type = 'text';
            this._inputEl.placeholder = 'Сообщение или команда...';
            Object.assign(this._inputEl.style, {
                flex: '1 1 200px',
                minWidth: '100px',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none'
            });
            this._inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._sendFromInput();
                }
            });
            controls.appendChild(this._inputEl);

            // Send button
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.title = 'Отправить';
            sendBtn.innerHTML = `
                <svg class="icon-svg" style="width:12px;height:12px;fill:currentColor;display:block;">
                    <use href="#icon-mail"></use>
                </svg>
            `;
            Object.assign(sendBtn.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                padding: '0',
                border: '1px solid var(--accent-red, #cc2233)',
                borderRadius: '4px',
                background: 'var(--accent-red, #cc2233)',
                color: '#fff',
                cursor: 'pointer',
                flexShrink: '0'
            });
            sendBtn.addEventListener('click', () => this._sendFromInput());
            controls.appendChild(sendBtn);

            el.appendChild(controls);

            // ─── Быстрые команды ────────────────────────────────
            const quick = document.createElement('div');
            Object.assign(quick.style, {
                display: 'flex',
                gap: '6px',
                flexShrink: '0',
                flexWrap: 'wrap'
            });

            const commands = [
                { label: 'Добавить 1', text: 'add',       icon: 'icon-plus' },
                { label: 'Добавить 3', text: 'add 3',     icon: 'icon-plus' },
                { label: 'Очистить',   text: 'clear',     icon: 'icon-clear' },
                { label: 'Grid',       text: 'view grid', icon: 'icon-layout' },
                { label: 'List',       text: 'view list', icon: 'icon-menu' }
            ];

            for (const cmd of commands) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerHTML = `
                    <svg class="icon-svg" style="width:11px;height:11px;fill:currentColor;display:block;">
                        <use href="#${cmd.icon}"></use>
                    </svg>
                    <span style="font-size:10px;">${cmd.label}</span>
                `;
                Object.assign(btn.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                    borderRadius: '4px',
                    background: 'var(--bg-hover, rgba(40,40,40,0.4))',
                    color: 'var(--text-secondary, #a09888)',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontFamily: 'inherit'
                });
                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg-active, rgba(60,60,60,0.8))';
                    this.style.color = 'var(--text-primary, #e0d8cc)';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'var(--bg-hover, rgba(40,40,40,0.4))';
                    this.style.color = 'var(--text-secondary, #a09888)';
                });
                btn.addEventListener('click', () => {
                    this._inputEl.value = cmd.text;
                    this._sendFromInput();
                });
                quick.appendChild(btn);
            }

            el.appendChild(quick);
        }

        // ═══════════════════════════════════════════════════════════
        // 6. ХУКИ
        // ═══════════════════════════════════════════════════════════
        onReady() {
            // Если в data уже есть сообщения — рендерим
            const messages = this.data && Array.isArray(this.data.messages)
                ? this.data.messages
                : [];

            if (messages.length === 0) {
                this._appendMessage({
                    kind: 'system',
                    text: 'Чат готов. Отправьте команду окнам "example".'
                });
            } else {
                for (const msg of messages) {
                    this._renderMessage(msg);
                }
                if (this._messagesEl) {
                    this._messagesEl.scrollTop = this.uiState.scrollTop || this._messagesEl.scrollHeight;
                }
            }
        }

        onData(payload) {
            // Данные пришли из слота — если список сообщений изменился,
            // можно перерендерить. Но чтобы не плодить цикл — просто
            // сохраняем scrollTop.
            if (this._messagesEl && this.uiState.scrollTop) {
                this._messagesEl.scrollTop = this.uiState.scrollTop;
            }
        }

        onMessage(senderId, channel, data) {
            if (channel === 'example-chat' || channel === 'chat-message') {
                let text = '';
                if (typeof data === 'string') text = data;
                else if (data && typeof data.text === 'string') text = data.text;
                else text = JSON.stringify(data);

                this._appendMessage({
                    kind: 'incoming',
                    senderId: senderId,
                    text: text
                });
            } else if (channel === 'example-sync') {
                this._appendMessage({
                    kind: 'system',
                    text: `#${senderId} → sync: items=${data?.itemsCount ?? '?'}`
                });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 7. ЛОГИКА (методы, вызываемые через action)
        // ═══════════════════════════════════════════════════════════
        clearChat() {
            this.data = { messages: [] };
            if (this._messagesEl) this._messagesEl.innerHTML = '';
            this._appendMessage({ kind: 'system', text: 'Чат очищен.' });
            this.save();
        }

        refreshTargets() {
            this._refreshTargets();
            this.notify('Цели', 'Список целей обновлён', 'info');
        }

        // ═══════════════════════════════════════════════════════════
        // 8. ВНУТРЕННИЕ ХЕЛПЕРЫ
        // ═══════════════════════════════════════════════════════════
        _refreshTargets() {
            if (!this._targetSelect) return;

            const prev = this._targetSelect.value;
            this._targetSelect.innerHTML = '';

            const allOpt = document.createElement('option');
            allOpt.value = 'all';
            allOpt.textContent = '→ Всем "example"';
            this._targetSelect.appendChild(allOpt);

            const targets = this.findWindowsByType('example');
            for (const w of targets) {
                const opt = document.createElement('option');
                opt.value = `window:${w.id}`;
                opt.textContent = `→ #${w.id} (${w.slotId || 'no-slot'})`;
                this._targetSelect.appendChild(opt);
            }

            if (prev && Array.from(this._targetSelect.options).some(o => o.value === prev)) {
                this._targetSelect.value = prev;
            }
        }

        _sendFromInput() {
            const text = (this._inputEl?.value || '').trim();
            if (!text) return;
            this._sendToTarget(text);
            if (this._inputEl) this._inputEl.value = '';
        }

        _sendToTarget(text) {
            const target = this._targetSelect?.value || 'all';
            const payload = this._parseCommand(text);

            if (target === 'all') {
                this.sendToType('example-chat', payload, 'example');
                this._appendMessage({
                    kind: 'outgoing',
                    text: text,
                    targetLabel: 'всем "example"'
                });
            } else if (target.startsWith('window:')) {
                const windowId = target.slice('window:'.length);
                this.sendMessage('example-chat', payload, windowId);
                this._appendMessage({
                    kind: 'outgoing',
                    text: text,
                    targetLabel: `#${windowId}`
                });
            }

            this.save();
        }

        _parseCommand(text) {
            const trimmed = text.trim();
            const lower = trimmed.toLowerCase();

            if (lower === 'add' || lower.startsWith('add ')) {
                const parts = trimmed.split(/\s+/);
                const count = parts[1] ? parseInt(parts[1], 10) : 1;
                return {
                    command: 'add',
                    count: isNaN(count) ? 1 : Math.max(1, Math.min(50, count)),
                    text: trimmed
                };
            }

            if (lower === 'clear' || lower === 'очистить') {
                return { command: 'clear', text: trimmed };
            }

            if (lower === 'view grid' || lower === 'grid') {
                return { command: 'view', mode: 'grid', text: trimmed };
            }
            if (lower === 'view list' || lower === 'list') {
                return { command: 'view', mode: 'list', text: trimmed };
            }

            return { command: 'text', text: trimmed };
        }

        _appendMessage({ kind, text, senderId, targetLabel }) {
            if (!this._messagesEl) return;

            const msg = {
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                timestamp: Date.now(),
                kind, text, senderId, targetLabel
            };

            if (!this.data) this.data = { messages: [] };
            if (!Array.isArray(this.data.messages)) this.data.messages = [];
            this.data.messages.push(msg);
            if (this.data.messages.length > 200) this.data.messages.shift();

            this._renderMessage(msg);
            this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
        }

        _renderMessage(msg) {
            const el = document.createElement('div');
            Object.assign(el.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: '1.4',
                maxWidth: '85%',
                wordBreak: 'break-word'
            });

            const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            if (msg.kind === 'system') {
                Object.assign(el.style, {
                    alignSelf: 'center',
                    background: 'rgba(200,184,154,0.06)',
                    color: 'var(--text-muted, rgba(200,184,154,0.5))',
                    fontSize: '10px',
                    fontStyle: 'italic',
                    textAlign: 'center'
                });
                el.textContent = `${time}  ${msg.text}`;
            } else if (msg.kind === 'incoming') {
                Object.assign(el.style, {
                    alignSelf: 'flex-start',
                    background: 'var(--bg-card, #1a1a1a)',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.08))',
                    color: 'var(--text-primary, #e0d8cc)'
                });
                el.innerHTML = `
                    <div style="font-size:9px;color:var(--text-muted, rgba(200,184,154,0.5));">← #${this.escapeHtml(msg.senderId || '?')} · ${time}</div>
                    <div>${this.escapeHtml(msg.text)}</div>
                `;
            } else if (msg.kind === 'outgoing') {
                Object.assign(el.style, {
                    alignSelf: 'flex-end',
                    background: 'rgba(204,34,51,0.12)',
                    border: '1px solid rgba(204,34,51,0.3)',
                    color: 'var(--text-primary, #e0d8cc)'
                });
                el.innerHTML = `
                    <div style="font-size:9px;color:var(--text-muted, rgba(200,184,154,0.5));text-align:right;">${time} · ${this.escapeHtml(msg.targetLabel || '')} →</div>
                    <div>${this.escapeHtml(msg.text)}</div>
                `;
            }

            this._messagesEl.appendChild(el);
        }

        onBeforeDestroy() {
            this._messagesEl = null;
            this._inputEl = null;
            this._targetSelect = null;
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    function registerExampleMainWindow(registry) {
        if (!registry) {
            console.error('[ExampleMainWindow] registry required');
            return false;
        }
        if (registry.getType('example-main')) return false;
        return registry.registerFromClass(ExampleMainWindow);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ExampleMainWindow, registerExampleMainWindow };
    }
    if (typeof window !== 'undefined') {
        window.ExampleMainWindow = ExampleMainWindow;
        window.registerExampleMainWindow = registerExampleMainWindow;
        console.log('[ExampleMainWindow] Registered globally v3.0.0');
    }

})();