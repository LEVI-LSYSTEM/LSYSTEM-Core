// types/ExampleWindow.js
// Версия 3.1.0 — тест ExtendedAPI (ui.button, ui.block, ui.text, utils.dom)
//
// Демонстрация:
//   - static meta / menu / hotkeys / channels / dropTarget
//   - buildContent(el) с ExtendedAPI-компонентами
//   - onData / onDrop / onMessage
//   - makeDraggable для карточек

(function() {
    'use strict';

    class ExampleWindow extends BaseWindowInstance {

        // ═══════════════════════════════════════════════════════════
        // 1. МЕТАДАННЫЕ
        // ═══════════════════════════════════════════════════════════
        static get meta() {
            return {
                id: 'example',
                name: 'Example',
                icon: 'icon-example',
                group: 'Примеры',
                description: 'Тест ExtendedAPI: ui.button, ui.block, ui.text',
                category: 'other',
                defaultSize: { width: 560, height: 460 },
                minSize: { width: 320, height: 240 },
                maxWindows: 4,
                priority: 999,
                metadata: { version: '3.1.0', author: 'LSYSTEM' }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 2. МЕНЮ
        // ═══════════════════════════════════════════════════════════
        static get menu() {
            return {
                headerButtons: [
                    { icon: 'icon-plus',  label: 'Add',   action: 'addItem' },
                    {
                        icon: 'icon-clear', label: 'Clear', action: 'clearAll', danger: true,
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
                    { icon: 'icon-plus',    label: 'Добавить',  action: 'addItem' },
                    { icon: 'icon-refresh', label: 'Broadcast', action: 'broadcast' },
                    { divider: true },
                    { icon: 'icon-clear',   label: 'Очистить',  action: 'clearAll', danger: true }
                ],
                dropdownMenu: {
                    icon: 'icon-menu',
                    label: 'Действия',
                    items: [
                        { header: 'Вид' },
                        { label: 'Grid', icon: 'icon-layout', action: 'viewGrid' },
                        { label: 'List', icon: 'icon-menu',   action: 'viewList' },
                        { divider: true },
                        { label: 'Добавить',  icon: 'icon-plus',         action: 'addItem' },
                        { label: 'Broadcast', icon: 'icon-notification', action: 'broadcast' },
                        { divider: true },
                        { label: 'Очистить',  icon: 'icon-clear', action: 'clearAll', danger: true }
                    ]
                }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 3. ХОТКЕИ
        // ═══════════════════════════════════════════════════════════
        static get hotkeys() {
            return {
                'Ctrl+N':       { label: 'Добавить',    action: 'addItem' },
                'Ctrl+L':       { label: 'Очистить',    action: 'clearAll' },
                'Ctrl+G':       { label: 'Grid view',   action: 'viewGrid' },
                'Ctrl+Shift+L': { label: 'List view',   action: 'viewList' }
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 4. КОММУНИКАЦИЯ
        // ═══════════════════════════════════════════════════════════
        static get channels() {
            return ['example-sync', 'example-chat'];
        }

        static get dropTarget() {
            return {
                acceptExtensions: '.json,.lsw,.txt',
                multiple: true
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 5. КОНТЕНТ — используем ExtendedAPI
        // ═══════════════════════════════════════════════════════════
        buildContent(el) {
            // el — это this._content (flex:1, overflow:auto)
            Object.assign(el.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '12px',
                boxSizing: 'border-box'
            });

            // ─── Панель управления через ExtendedAPI ────────────
            const controls = this.utils.dom.el('div', {
                style: {
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }
            });

            controls.appendChild(this.ui.button({
                label: 'Добавить',
                icon: 'icon-plus',
                variant: 'primary',
                onClick: () => this.addItem()
            }));

            controls.appendChild(this.ui.button({
                label: 'Очистить',
                icon: 'icon-clear',
                variant: 'danger',
                onClick: () => this.clearAll()
            }));

            controls.appendChild(this.ui.button({
                label: 'Grid',
                icon: 'icon-layout',
                onClick: () => this.viewGrid()
            }));

            controls.appendChild(this.ui.button({
                label: 'List',
                icon: 'icon-menu',
                onClick: () => this.viewList()
            }));

            controls.appendChild(this.ui.button({
                label: 'Broadcast',
                icon: 'icon-notification',
                onClick: () => this.broadcast()
            }));

            el.appendChild(controls);

            // ─── Инфо-блок через ui.text ────────────────────────
            this._infoEl = this.ui.text({
                text: 'Нет данных. Нажмите «Добавить» или перетащите файл.',
                variant: 'muted'
            });
            el.appendChild(this._infoEl);

            // ─── Контейнер для карточек ────────────────────────
            this._itemsEl = this.utils.dom.el('div', {
                style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                    padding: '0'
                }
            });
            el.appendChild(this._itemsEl);

            // Дефолтный вид
            this.uiState.viewMode = this.uiState.viewMode || 'grid';
            this._applyViewMode();
        }

        // ═══════════════════════════════════════════════════════════
        // 6. ХУКИ
        // ═══════════════════════════════════════════════════════════
        onReady() {
            this._renderItems();
        }

        onData(payload) {
            this._renderItems();
        }

        onDrop(files, meta) {
            if (meta && meta.source === 'internal') {
                if (meta.channel === 'clear-command') {
                    this.clearAll();
                    return true;
                }
                if (meta.channel === 'example-item' && meta.payload) {
                    this.addItem(meta.payload.name, meta.payload.value);
                    return true;
                }
                return false;
            }
            return this._handleFiles(files);
        }

        onMessage(senderId, channel, data) {
            if (channel === 'example-chat') {
                const command = data && data.command || 'text';
                if (command === 'add') {
                    const count = Math.max(1, Math.min(50, data.count || 1));
                    for (let i = 0; i < count; i++) this.addItem();
                } else if (command === 'clear') {
                    this.clearAll();
                } else if (command === 'view') {
                    this.setViewMode(data.mode);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 7. ЛОГИКА
        // ═══════════════════════════════════════════════════════════
        addItem(name, value) {
            if (!this.data) this.data = { items: [] };
            if (!Array.isArray(this.data.items)) this.data.items = [];

            const n = name ?? `Item ${this.data.items.length + 1}`;
            const v = value ?? `Значение ${this.data.items.length + 1}`;

            this.data.items.push({ name: n, value: v });
            this.save();
            this._renderItems();
        }

        removeItem(index) {
            if (!this.data || !this.data.items) return;
            this.data.items.splice(index, 1);
            this.save();
            this._renderItems();
        }

        clearAll() {
            this.data = { items: [] };
            this.save();
            this._renderItems();
        }

        viewGrid() { this.setViewMode('grid'); }
        viewList() { this.setViewMode('list'); }

        setViewMode(mode) {
            if (mode !== 'grid' && mode !== 'list') return;
            this.uiState.viewMode = mode;
            this._applyViewMode();
            this._renderItems();
            this.save();
        }

        broadcast() {
            this.sendToType('example-sync', {
                from: this.id,
                timestamp: Date.now(),
                itemsCount: this.data?.items?.length || 0
            }, 'example');
            this.notify('Broadcast', 'Отправлено всем окнам "example"', 'info');
        }

        // ═══════════════════════════════════════════════════════════
        // 8. IMPORT / EXPORT
        // ═══════════════════════════════════════════════════════════
        onImport(parsed) {
            if (!parsed) return false;

            let items = null;
            if (Array.isArray(parsed)) {
                items = parsed.map((it, i) => this._toItem(it, i));
            } else if (parsed.items && Array.isArray(parsed.items)) {
                items = parsed.items.map((it, i) => this._toItem(it, i));
            } else if (parsed.data && Array.isArray(parsed.data.items)) {
                items = parsed.data.items.map((it, i) => this._toItem(it, i));
            } else if (typeof parsed === 'string') {
                items = parsed.split('\n').filter(l => l.trim())
                    .map((line, i) => ({ name: `Line ${i + 1}`, value: line.trim() }));
            }

            if (!items) return false;
            this.data = { items };
            this.save();
            this._renderItems();
            return true;
        }

        onExport() {
            return {
                type: this.type,
                slotId: this.slotId,
                exportedAt: new Date().toISOString(),
                items: this.data?.items || []
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 9. ВНУТРЕННИЕ ХЕЛПЕРЫ
        // ═══════════════════════════════════════════════════════════
        _toItem(it, i) {
            if (typeof it === 'object' && it !== null) {
                return { name: String(it.name ?? `Item ${i + 1}`), value: String(it.value ?? '—') };
            }
            return { name: `Item ${i + 1}`, value: String(it) };
        }

        _applyViewMode() {
            if (!this._itemsEl) return;
            if (this.uiState.viewMode === 'list') {
                this._itemsEl.style.gridTemplateColumns = '1fr';
            } else {
                this._itemsEl.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            }
        }

        _renderItems() {
            if (!this._itemsEl) return;
            this._itemsEl.innerHTML = '';

            const items = this.data?.items || [];

            // Обновляем инфо-текст
            if (this._infoEl) {
                if (items.length === 0) {
                    this._infoEl.textContent = 'Нет данных. Нажмите «Добавить» или перетащите файл.';
                } else {
                    this._infoEl.textContent = 'Элементов: ' + items.length;
                }
            }

            if (items.length === 0) {
                return;
            }

            items.forEach((item, index) => {
                const card = this.utils.dom.el('div', {
                    style: {
                        background: 'var(--bg-card, #1a1a1a)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        border: '1px solid var(--border-color, rgba(200,184,154,0.08))',
                        position: 'relative',
                        cursor: 'grab'
                    }
                });

                // Название
                card.appendChild(this.ui.text({
                    text: item.name,
                    variant: 'heading'
                }));

                // Значение
                card.appendChild(this.ui.text({
                    text: item.value,
                    variant: 'muted'
                }));

                // Кнопка удаления — используем ui.button
                const delBtn = this.ui.button({
                    icon: 'icon-close',
                    variant: 'ghost',
                    onClick: (e) => {
                        e.stopPropagation();
                        this.removeItem(index);
                    }
                });
                Object.assign(delBtn.style, {
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '22px',
                    height: '22px',
                    padding: '0',
                    minWidth: '22px',
                    border: 'none',
                    background: 'transparent'
                });
                delBtn.setAttribute('data-no-drag', 'true');
                card.appendChild(delBtn);

                // Drag source
                this.makeDraggable(card, {
                    type: 'example-item',
                    getPayload: () => ({ name: item.name, value: item.value }),
                    ghostHTML: `
                        <div style="display:inline-flex;align-items:center;gap:8px;">
                            <svg class="icon-svg" style="width:14px;height:14px;fill:currentColor;">
                                <use href="#icon-example"></use>
                            </svg>
                            <span style="font-weight:600;">${this.escapeHtml(item.name)}</span>
                        </div>
                    `
                });

                this._itemsEl.appendChild(card);
            });
        }

        async _handleFiles(files) {
            if (!files || files.length === 0) return false;
            for (const file of files) {
                try {
                    const text = await file.text();
                    let parsed;
                    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
                    if (!this.onImport(parsed)) return false;
                } catch (err) {
                    console.error('[ExampleWindow] file error:', err);
                    return false;
                }
            }
            return true;
        }

        onBeforeDestroy() {
            this._itemsEl = null;
            this._infoEl = null;
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    function registerExampleWindow(registry) {
        if (!registry) {
            console.error('[ExampleWindow] registry required');
            return false;
        }
        if (registry.getType('example')) return false;
        return registry.registerFromClass(ExampleWindow);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ExampleWindow, registerExampleWindow };
    }
    if (typeof window !== 'undefined') {
        window.ExampleWindow = ExampleWindow;
        window.registerExampleWindow = registerExampleWindow;
        console.log('[ExampleWindow] Registered globally v3.1.0');
    }

})();