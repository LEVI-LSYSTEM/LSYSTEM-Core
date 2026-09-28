// data/window/NodePropertiesWindow.js
// Версия 3.1.0 — окно свойств ноды для NodeGraphWindow
//
// Изменения v3.1.0:
//   1. FIX: _applyParam перечитывает actual после invokeParamChange
//      (onParamChange может изменить node.paramValues[id]).
//   2. FIX: _updateParamEl — с логированием, корректный fallback.
//   3. FIX: _invokeButton — синхронный _renderParams() без setTimeout.
//   4. FIX: _renderParams — поддержка param._noCategoryHeader.
//   5. FIX: _destroyCustomRenderers перед перерисовкой.

(function() {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[NodePropertiesWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    console.log('[NodePropertiesWindow] Loading v3.1.0...');

    const MSG_SHOW        = 'nodeprops:show';
    const MSG_SELECTION   = 'nodegraph:selection-changed';
    const MSG_PARAM       = 'nodeprops:param-changed';
    const MSG_REQUEST_SEL = 'nodeprops:request-selection';

    const COLLAPSED_STATE_KEY = '__np_collapsedGroups';

    class NodePropertiesWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'nodeprops',
                name: 'Node Properties',
                icon: 'icon-settings',
                description: 'Свойства выбранной ноды',
                group: 'Редакторы',
                category: 'editor',
                priority: 3,
                defaultSize: { width: 420, height: 640 },
                minSize: { width: 300, height: 220 },
                maxWindows: 1,
                metadata: { version: '3.1.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    { id: 'np-refresh',  type: 'button', icon: 'icon-refresh', label: 'Обновить',   title: 'Перерисовать',           action: 'refresh' },
                    { id: 'np-expand',   type: 'button', icon: 'icon-plus',    label: 'Развернуть', title: 'Раскрыть все категории', action: 'expandAll' },
                    { id: 'np-collapse', type: 'button', icon: 'icon-minus',   label: 'Свернуть',   title: 'Свернуть все категории', action: 'collapseAll' },
                    { id: 'np-run',      type: 'button', icon: 'icon-play',    label: 'Run',        title: 'Выполнить ноду',         action: 'runNode' }
                ]
            };
        }

        static get hotkeys() {
            return {
                'Ctrl+R': { action: 'refresh', label: 'Обновить' },
                'Ctrl+Enter': { action: 'runNode', label: 'Run' }
            };
        }

        static get channels() {
            return [MSG_SHOW, MSG_SELECTION, MSG_REQUEST_SEL, 'nodegraph:param-changed'];
        }

        constructor(container, windowData, options = {}) {
            super(container, windowData, options);
        }

        _ensureFields() {
            if (this._fieldsReady) return;
            this._node = null;
            this._graph = null;
            this._graphHost = null;
            this._rootEl = null;
            this._bodyEl = null;
            this._searchEl = null;
            this._headerTitleEl = null;
            this._metaEl = null;
            this._searchQuery = '';
            this._customRenderers = null;
            this._applying = false;
            this._collapsedGroups = {};
            this._fieldsReady = true;
        }

        buildContent(el) {
            this._ensureFields();
            this._rootEl = el;
            Object.assign(el.style, {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                boxSizing: 'border-box',
                background: 'var(--bg-panel, #1a1a1a)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '10px 14px 8px',
                borderBottom: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                flexShrink: '0'
            });

            this._headerTitleEl = document.createElement('div');
            Object.assign(this._headerTitleEl.style, {
                fontSize: '13px',
                fontWeight: '600',
                color: 'var(--text-primary, #e0d8cc)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            });
            this._headerTitleEl.textContent = 'Нода не выбрана';
            header.appendChild(this._headerTitleEl);

            this._metaEl = document.createElement('div');
            Object.assign(this._metaEl.style, {
                fontSize: '10px',
                color: 'var(--text-muted, rgba(200,184,154,0.55))',
                fontFamily: '"Courier New", monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            });
            this._metaEl.textContent = '';
            header.appendChild(this._metaEl);

            this._searchEl = document.createElement('input');
            this._searchEl.type = 'text';
            this._searchEl.placeholder = 'Поиск параметров...';
            Object.assign(this._searchEl.style, {
                width: '100%',
                padding: '5px 9px',
                borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '11px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box'
            });
            this._searchEl.addEventListener('input', () => {
                this._searchQuery = this._searchEl.value.trim().toLowerCase();
                this._renderParams();
            });
            header.appendChild(this._searchEl);

            el.appendChild(header);

            this._bodyEl = document.createElement('div');
            Object.assign(this._bodyEl.style, {
                flex: '1',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '10px 14px 14px',
                boxSizing: 'border-box'
            });
            el.appendChild(this._bodyEl);

            this._renderEmpty('Выберите ноду в графе (клик по ноде)');
        }

        onReady() {
            try {
                this.sendMessage(MSG_REQUEST_SEL, { from: this.id }, null);
            } catch (e) {}
        }

        onBeforeDestroy() {
            this._destroyCustomRenderers();
            this._node = null;
            this._graph = null;
            this._graphHost = null;
        }

        onMessage(senderId, channel, data) {
            if (!data) return;

            if (channel === MSG_SHOW) {
                this._setNode(data.node, data.graph, data.host);
                return;
            }
            if (channel === MSG_SELECTION) {
                if (data.node) this._setNode(data.node, data.graph, data.host);
                return;
            }
            if (channel === 'nodegraph:param-changed') {
                if (this._node && data.nodeId === this._node.id) {
                    const param = this._node.def.params.find(p => p.id === data.paramId);
                    if (param) {
                        this._node.paramValues[data.paramId] = data.value;
                        this._updateParamEl(data.paramId, data.value);
                    }
                }
                return;
            }
        }

        // ============================================================
        // ✅ v3.1.0: _updateParamEl с логированием
        // ============================================================
        _updateParamEl(paramId, value) {
            if (!this._bodyEl) return;

            // ✅ Приоритет — кастомный блок (data-np-custom="1")
            let block = this._bodyEl.querySelector(
                `[data-np-custom="1"][data-np-param-id="${CSS.escape(paramId)}"]`
            );
            if (!block) {
                block = this._bodyEl.querySelector(
                    `[data-np-param-id="${CSS.escape(paramId)}"]`
                );
            }
            if (!block) {
                console.warn('[nodeprops] _updateParamEl: block not found for', paramId);
                return;
            }

            const customType = block.dataset.npType;
            if (customType && this._customRenderers && this._customRenderers[customType]) {
                const r = this._customRenderers[customType];
                if (typeof r.update === 'function') {
                    try {
                        r.update(block, value);
                    } catch (e) {
                        console.warn('[nodeprops] custom update error:', e);
                    }
                    return;
                }
            }

            const input = block.querySelector('input, select, textarea');
            if (input) {
                if (input.type === 'checkbox') input.checked = !!value;
                else input.value = value == null ? '' : String(value);
            }
        }

        _setNode(node, graph, host) {
            if (!node || !node.def) return;

            if (this._node === node) {
                this._refreshValues();
                return;
            }

            this._destroyCustomRenderers();

            this._node = node;
            this._graph = graph || null;
            this._graphHost = host || null;

            this._customRenderers = null;
            if (typeof node.def._rawRenderCustomProperties === 'function') {
                try {
                    const res = node.def._rawRenderCustomProperties(this._makeCtx());
                    if (res && typeof res === 'object') {
                        this._customRenderers = res;
                    }
                } catch (e) {
                    console.warn('[nodeprops] renderCustomProperties error:', e);
                }
            }

            this._renderHeader();
            this._renderParams();
        }

        _makeCtx() {
            return {
                node: this._node,
                graph: this._graph,
                host: this,
                getParam: (id) => this._node ? this._node.paramValues[id] : undefined,
                setParam: (id, v) => this._applyParam(id, v),
                notify: (t, m, k) => this.notify(t, m, k),
                log: (...args) => console.log('[nodeprops]', ...args)
            };
        }

        _renderEmpty(text) {
            if (!this._bodyEl) return;
            this._bodyEl.innerHTML = '';
            const div = document.createElement('div');
            Object.assign(div.style, {
                padding: '30px 10px',
                textAlign: 'center',
                color: 'var(--text-muted, rgba(200,184,154,0.5))',
                fontSize: '12px'
            });
            div.textContent = text;
            this._bodyEl.appendChild(div);
        }

        _renderHeader() {
            if (!this._node) return;
            const n = this._node;
            this._headerTitleEl.textContent = n.title || 'Node';

            const def = n.def;
            const env = def.env || '—';
            const file = def.file || '—';
            const id = n.id;
            const status = n.getStatus ? n.getStatus() : 'idle';
            const statusRu = {
                idle: 'ожидание', running: 'считается',
                ok: 'готово', error: 'ошибка'
            }[status] || status;

            if (this._metaEl) {
                this._metaEl.textContent = `#${id} · ${env} / ${file} · ${statusRu}`;
                this._metaEl.style.color =
                    status === 'error' ? 'var(--accent-red, #cc2233)' :
                    status === 'ok' ? 'var(--success-color, #44cc88)' :
                    status === 'running' ? 'var(--warning-color, #ffaa33)' :
                    'var(--text-muted, rgba(200,184,154,0.55))';
            }
        }

        // ============================================================
        // ✅ v3.1.0: _renderParams с поддержкой _noCategoryHeader
        // ============================================================
        _renderParams() {
            if (!this._bodyEl) return;

            this._destroyCustomRenderers();
            this._bodyEl.innerHTML = '';

            if (!this._node) {
                this._renderEmpty('Выберите ноду в графе (клик по ноде)');
                return;
            }

            const def = this._node.def;
            const params = def.params || [];
            const buttons = def.buttons || [];

            const q = this._searchQuery;
            const filterFn = (label, id) => {
                if (!q) return true;
                return (label || '').toLowerCase().includes(q) ||
                       (id || '').toLowerCase().includes(q);
            };

            const filteredParams = q
                ? params.filter(p => filterFn(p.label, p.id))
                : params;

            if (!q && this._node._result !== null && this._node._result !== undefined) {
                this._bodyEl.appendChild(this._makeResultBlock(this._node._result));
            }

            if (buttons.length > 0) {
                const filteredButtons = q
                    ? buttons.filter(b => filterFn(b.label, b.id))
                    : buttons;
                if (filteredButtons.length > 0) {
                    const btnGroup = this._makeGroup('Действия');
                    for (const b of filteredButtons) {
                        const block = this._renderButtonBlock(b);
                        if (block) btnGroup.body.appendChild(block);
                    }
                    this._bodyEl.appendChild(btnGroup.el);
                }
            }

            if (filteredParams.length > 0) {
                const byCat = new Map();
                for (const p of filteredParams) {
                    const c = p.category || '';
                    if (!byCat.has(c)) byCat.set(c, []);
                    byCat.get(c).push(p);
                }

                const catKeys = Array.from(byCat.keys());
                const named = catKeys.filter(k => k !== '').sort((a, b) => a.localeCompare(b));
                const ordered = (catKeys.includes('') ? [''] : []).concat(named);

                for (const catKey of ordered) {
                    const paramsInCat = byCat.get(catKey);

                    const noHeader = paramsInCat.every(p => p._noCategoryHeader === true);

                    if (noHeader) {
                        for (const p of paramsInCat) {
                            const block = this._renderParamBlock(p);
                            if (block) this._bodyEl.appendChild(block);
                        }
                        continue;
                    }

                    const catName = catKey === '' ? 'Без категории' : catKey;
                    const group = this._makeGroup(catName);

                    if (paramsInCat.length > 1) {
                        const resetRow = this._makeCategoryResetRow(paramsInCat);
                        if (resetRow) group.body.appendChild(resetRow);
                    }

                    for (const p of paramsInCat) {
                        const block = this._renderParamBlock(p);
                        if (block) group.body.appendChild(block);
                    }
                    this._bodyEl.appendChild(group.el);
                }
            }

            if (filteredParams.length === 0 && buttons.length === 0 && !this._node._result) {
                this._renderEmpty(q ? 'Ничего не найдено' : 'У ноды нет параметров');
            } else if (q && filteredParams.length === 0 && buttons.filter(b => filterFn(b.label, b.id)).length === 0) {
                this._renderEmpty('Ничего не найдено');
            }
        }

        _makeResultBlock(result) {
            const group = this._makeGroup('Результат');
            const wrap = document.createElement('div');
            Object.assign(wrap.style, {
                padding: '8px 10px',
                marginBottom: '6px',
                borderRadius: '5px',
                background: 'var(--bg-card, #1f1f1f)',
                border: '1px solid var(--border-color, rgba(200,184,154,0.08))',
                boxSizing: 'border-box'
            });

            const pre = document.createElement('pre');
            Object.assign(pre.style, {
                margin: '0', padding: '0',
                fontFamily: '"Courier New", monospace',
                fontSize: '11px',
                color: 'var(--text-primary, #e0d8cc)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '240px',
                overflow: 'auto'
            });

            let text = '';
            try { text = JSON.stringify(result, null, 2); }
            catch (e) { text = String(result); }

            const MAX_CHARS = 8000;
            if (text.length > MAX_CHARS) {
                text = text.slice(0, MAX_CHARS) + '\n\n... (сокращено, всего ' + text.length + ' символов)';
            }

            pre.textContent = text;
            wrap.appendChild(pre);
            group.body.appendChild(wrap);
            return group.el;
        }

        _renderButtonBlock(btnDesc) {
            const block = document.createElement('div');
            block.dataset.npButtonId = btnDesc.id;
            Object.assign(block.style, { display: 'flex', gap: '6px', marginBottom: '6px' });

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'np-btn np-btn--primary';
            Object.assign(btn.style, {
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '5px',
                border: '1px solid var(--accent-red, #cc2233)',
                background: 'var(--accent-red, #cc2233)',
                color: '#fff', fontSize: '12px', fontFamily: 'inherit',
                fontWeight: '500', cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease'
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--accent-red-hover, #ee3344)';
                btn.style.borderColor = 'var(--accent-red-hover, #ee3344)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--accent-red, #cc2233)';
                btn.style.borderColor = 'var(--accent-red, #cc2233)';
            });
            btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.98)');
            btn.addEventListener('mouseup', () => btn.style.transform = '');

            if (btnDesc.icon && btnDesc.icon.startsWith('icon-')) {
                btn.appendChild(this.ui.icon.svg(btnDesc.icon, 13));
            }

            const label = document.createElement('span');
            label.textContent = btnDesc.label || btnDesc.id;
            btn.appendChild(label);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this._invokeButton(btnDesc.id);
            });

            block.appendChild(btn);
            return block;
        }

        // ============================================================
        // ✅ v3.1.0: _invokeButton синхронный
        // ============================================================
        _invokeButton(buttonId) {
            if (!this._node) return;
            const def = this._node.def;

            const ctx = {
                node: this._node,
                graph: this._graph,
                host: this._graphHost || this,
                env: def.env
            };

            try {
                if (buttonId === 'run' && def.hasCompute()) {
                    const host = this._graphHost;
                    if (host && typeof host.runNode === 'function') {
                        host.runNode(this._node);
                        return;
                    }
                }

                def.invokeButton(buttonId, ctx);
                this._renderHeader();
                this._renderParams();
            } catch (e) {
                console.error('[nodeprops] invokeButton error:', e);
                this.notify('Ошибка', String(e.message || e), 'error');
            }
        }

        _renderParamBlock(param) {
            const block = document.createElement('div');
            
            // ✅ Кастомный блок получит npParamId внутри _renderCustomValue.
            // Чтобы не было дубликата — не ставим на внешний div.
            const isCustomType = !!(this._customRenderers && this._customRenderers[param.type]);
            
            if (!isCustomType) {
                block.dataset.npParamId = param.id;
                block.dataset.npType = param.type;
            }
            Object.assign(block.style, {
                display: 'flex', flexDirection: 'column', gap: '4px',
                padding: '8px 10px', marginBottom: '6px',
                borderRadius: '5px',
                background: 'var(--bg-card, #1f1f1f)',
                border: '1px solid var(--border-color, rgba(200,184,154,0.08))',
                boxSizing: 'border-box', position: 'relative'
            });

            if (param.type === 'separator') {
                Object.assign(block.style, {
                    padding: '0', margin: '8px 0', height: '1px',
                    background: 'var(--border-color, rgba(200,184,154,0.12))'
                });
                return block;
            }

            if (param.type === 'header') {
                Object.assign(block.style, {
                    padding: '6px 2px', marginBottom: '2px',
                    background: 'transparent', border: 'none'
                });
                const h = document.createElement('div');
                h.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-secondary, #a09888);';
                h.textContent = param.label || param.id;
                block.appendChild(h);
                return block;
            }

            if (param.type === 'info') {
                Object.assign(block.style, {
                    padding: '8px 10px',
                    background: 'rgba(200,184,154,0.05)',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.1))'
                });
                const txt = document.createElement('div');
                txt.style.cssText = 'font-size:11px;color:var(--text-muted, rgba(200,184,154,0.75));line-height:1.5;';
                txt.textContent = param.default || param.description || param.label || '';
                block.appendChild(txt);
                return block;
            }

            const isCustom = !!(this._customRenderers && this._customRenderers[param.type]);

            if (!isCustom) {
                const labelRow = document.createElement('div');
                Object.assign(labelRow.style, {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px'
                });

                const labelEl = document.createElement('span');
                Object.assign(labelEl.style, {
                    fontSize: '11px', fontWeight: '500',
                    color: 'var(--text-muted, rgba(200,184,154,0.75))',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                });
                labelEl.textContent = param.label || param.id;
                labelRow.appendChild(labelEl);

                const actions = document.createElement('div');
                actions.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0;';

                const typeEl = document.createElement('span');
                Object.assign(typeEl.style, {
                    fontSize: '9px',
                    color: 'var(--text-muted, rgba(200,184,154,0.4))',
                    fontFamily: '"Courier New", monospace'
                });
                typeEl.textContent = param.type;
                actions.appendChild(typeEl);

                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.title = 'Сбросить к значению по умолчанию';
                Object.assign(resetBtn.style, {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', padding: '0',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                    borderRadius: '3px', background: 'transparent',
                    color: 'var(--text-muted, rgba(200,184,154,0.5))',
                    cursor: 'pointer', transition: 'background 0.15s, color 0.15s'
                });
                resetBtn.innerHTML = '<svg class="icon-svg" style="width:10px;height:10px;fill:currentColor;margin:0;"><use href="#icon-refresh"></use></svg>';
                resetBtn.addEventListener('mouseenter', () => {
                    resetBtn.style.background = 'var(--bg-hover, rgba(40,40,40,0.5))';
                    resetBtn.style.color = 'var(--text-primary, #e0d8cc)';
                });
                resetBtn.addEventListener('mouseleave', () => {
                    resetBtn.style.background = 'transparent';
                    resetBtn.style.color = 'var(--text-muted, rgba(200,184,154,0.5))';
                });
                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._applyParam(param.id, param.default);
                });
                actions.appendChild(resetBtn);

                labelRow.appendChild(actions);
                block.appendChild(labelRow);
            }

            const valueEl = this._renderParamValue(param);
            if (valueEl) block.appendChild(valueEl);

            if (param.description && !isCustom) {
                const descEl = document.createElement('div');
                Object.assign(descEl.style, {
                    fontSize: '10px',
                    color: 'var(--text-muted, rgba(200,184,154,0.5))',
                    fontStyle: 'italic',
                    marginTop: '2px'
                });
                descEl.textContent = param.description;
                block.appendChild(descEl);
            }

            return block;
        }

        _renderParamValue(param) {
            const node = this._node;
            if (!node) return null;
            const value = node.paramValues[param.id];

            if (this._customRenderers && this._customRenderers[param.type]) {
                return this._renderCustomValue(param, value, this._customRenderers[param.type]);
            }

            switch (param.type) {
                case 'string':
                case 'text':    return this._inputText(param, value);
                case 'textarea': return this._inputTextarea(param, value);
                case 'number':
                case 'int':     return this._inputNumber(param, value);
                case 'range':   return this._inputRange(param, value);
                case 'bool':
                case 'boolean': return this._inputBool(param, value);
                case 'color':   return this._inputColor(param, value);
                case 'options':
                case 'select':  return this._inputOptions(param, value);
                case 'vector2': return this._inputVector(param, value, 2);
                case 'vector3': return this._inputVector(param, value, 3);
                case 'json':    return this._inputJson(param, value);
                case 'file':    return this._inputFile(param, value);
                case 'readonly': return this._inputReadonly(param, value);
                case 'button':  return this._inputButton(param);
                case 'buttons': return this._inputButtons(param);
                default:        return this._fallbackValue(param, value);
            }
        }

        _inputText(param, value) {
            const el = document.createElement('input');
            el.type = 'text';
            el.value = value == null ? '' : String(value);
            this._styleInput(el);
            el.addEventListener('change', () => this._applyParam(param.id, el.value));
            return el;
        }

        _inputTextarea(param, value) {
            const el = document.createElement('textarea');
            el.value = value == null ? '' : String(value);
            el.rows = 4;
            Object.assign(el.style, {
                width: '100%', padding: '6px 8px', borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                resize: 'vertical', minHeight: '60px'
            });
            el.addEventListener('change', () => this._applyParam(param.id, el.value));
            return el;
        }

        _inputNumber(param, value) {
            const el = document.createElement('input');
            el.type = 'number';
            el.value = value == null ? '' : String(value);
            if (typeof param.min === 'number') el.min = String(param.min);
            if (typeof param.max === 'number') el.max = String(param.max);
            if (typeof param.step === 'number') el.step = String(param.step);
            this._styleInput(el);
            el.addEventListener('change', () => {
                let v = Number(el.value);
                if (isNaN(v)) return;
                if (param.type === 'int') v = Math.round(v);
                if (typeof param.min === 'number' && v < param.min) v = param.min;
                if (typeof param.max === 'number' && v > param.max) v = param.max;
                this._applyParam(param.id, v);
            });
            return el;
        }

        _inputRange(param, value) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.value = value == null ? 0 : Number(value);
            slider.min = String(typeof param.min === 'number' ? param.min : 0);
            slider.max = String(typeof param.max === 'number' ? param.max : 100);
            slider.step = String(typeof param.step === 'number' ? param.step : 1);
            Object.assign(slider.style, {
                flex: '1', accentColor: 'var(--accent-red, #cc2233)', cursor: 'pointer'
            });
            const num = document.createElement('input');
            num.type = 'number';
            num.value = String(slider.value);
            num.min = slider.min; num.max = slider.max; num.step = slider.step;
            Object.assign(num.style, {
                width: '64px', padding: '5px 6px', borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '11px', textAlign: 'right',
                outline: 'none', boxSizing: 'border-box'
            });
            slider.addEventListener('input', () => {
                num.value = slider.value;
                this._applyParam(param.id, Number(slider.value));
            });
            num.addEventListener('change', () => {
                let v = Number(num.value);
                if (isNaN(v)) v = Number(slider.value);
                slider.value = String(v);
                this._applyParam(param.id, v);
            });
            wrap.appendChild(slider);
            wrap.appendChild(num);
            return wrap;
        }

        _inputBool(param, value) {
            const wrap = document.createElement('label');
            Object.assign(wrap.style, {
                display: 'flex', alignItems: 'center', gap: '8px',
                cursor: 'pointer', userSelect: 'none'
            });
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = !!value;
            box.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--accent-red, #cc2233);';
            const txt = document.createElement('span');
            txt.style.cssText = 'font-size:11px;color:var(--text-primary, #e0d8cc);';
            txt.textContent = box.checked ? 'включено' : 'выключено';
            box.addEventListener('change', () => {
                txt.textContent = box.checked ? 'включено' : 'выключено';
                this._applyParam(param.id, box.checked);
            });
            wrap.appendChild(box);
            wrap.appendChild(txt);
            return wrap;
        }

        _inputColor(param, value) {
            const wrap = document.createElement('div');
            Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px' });
            const hex = this._toHex(value);
            const colorEl = document.createElement('input');
            colorEl.type = 'color';
            colorEl.value = hex.slice(0, 7);
            colorEl.style.cssText = 'width:36px;height:26px;border:1px solid var(--border-color, rgba(200,184,154,0.15));background:transparent;cursor:pointer;border-radius:4px;';
            const txt = document.createElement('input');
            txt.type = 'text';
            txt.value = value || hex;
            this._styleInput(txt);
            txt.style.fontFamily = '"Courier New", monospace';
            const alpha = document.createElement('input');
            alpha.type = 'range';
            alpha.min = '0'; alpha.max = '1'; alpha.step = '0.01';
            alpha.value = this._getAlpha(value);
            Object.assign(alpha.style, {
                width: '60px', accentColor: 'var(--accent-red, #cc2233)', cursor: 'pointer'
            });
            const apply = () => {
                const a = Number(alpha.value);
                let v = txt.value.trim();
                if (!v.startsWith('#')) v = '#' + v;
                if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
                if (a >= 1) this._applyParam(param.id, v);
                else {
                    const r = parseInt(v.slice(1, 3), 16);
                    const g = parseInt(v.slice(3, 5), 16);
                    const b = parseInt(v.slice(5, 7), 16);
                    this._applyParam(param.id, `rgba(${r},${g},${b},${a})`);
                }
            };
            colorEl.addEventListener('input', () => {
                txt.value = colorEl.value;
                alpha.value = '1';
                apply();
            });
            txt.addEventListener('change', apply);
            alpha.addEventListener('input', apply);
            wrap.appendChild(colorEl);
            wrap.appendChild(txt);
            wrap.appendChild(alpha);
            return wrap;
        }

        _inputOptions(param, value) {
            const el = document.createElement('select');
            Object.assign(el.style, {
                width: '100%', padding: '5px 8px', borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px', outline: 'none',
                boxSizing: 'border-box', cursor: 'pointer'
            });
            const opts = Array.isArray(param.options) ? param.options : [];
            for (const o of opts) {
                let v, l;
                if (o && typeof o === 'object') {
                    v = o.value;
                    l = o.label !== undefined ? o.label : o.value;
                } else { v = o; l = o; }
                const opt = document.createElement('option');
                opt.value = String(v);
                opt.textContent = String(l);
                el.appendChild(opt);
            }
            el.value = String(value == null ? '' : value);
            el.addEventListener('change', () => this._applyParam(param.id, el.value));
            return el;
        }

        _inputVector(param, value, dim) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;gap:6px;';
            const vec = (value && typeof value === 'object') ? value : {};
            const keys = dim === 2 ? ['x', 'y'] : ['x', 'y', 'z'];
            for (const k of keys) {
                const field = document.createElement('div');
                field.style.cssText = 'flex:1;display:flex;align-items:center;gap:4px;';
                const label = document.createElement('span');
                label.textContent = k.toUpperCase();
                label.style.cssText = 'font-size:10px;color:var(--text-muted, rgba(200,184,154,0.55));font-family:monospace;';
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.value = vec[k] != null ? String(vec[k]) : '0';
                this._styleInput(inp);
                inp.style.fontSize = '11px';
                inp.addEventListener('change', () => {
                    const cur = (this._node.paramValues[param.id] && typeof this._node.paramValues[param.id] === 'object')
                        ? { ...this._node.paramValues[param.id] } : {};
                    cur[k] = Number(inp.value) || 0;
                    this._applyParam(param.id, cur);
                });
                field.appendChild(label);
                field.appendChild(inp);
                wrap.appendChild(field);
            }
            return wrap;
        }

        _inputJson(param, value) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
            const ta = document.createElement('textarea');
            ta.rows = 4;
            try { ta.value = value != null ? JSON.stringify(value, null, 2) : ''; }
            catch (e) { ta.value = String(value || ''); }
            Object.assign(ta.style, {
                width: '100%', padding: '6px 8px', borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '11px', fontFamily: '"Courier New", monospace',
                outline: 'none', boxSizing: 'border-box',
                resize: 'vertical', minHeight: '60px'
            });
            const err = document.createElement('div');
            err.style.cssText = 'font-size:10px;color:var(--accent-red, #cc2233);min-height:12px;';
            ta.addEventListener('change', () => {
                try {
                    const v = ta.value.trim() ? JSON.parse(ta.value) : null;
                    err.textContent = '';
                    this._applyParam(param.id, v);
                } catch (e) {
                    err.textContent = 'Невалидный JSON: ' + e.message;
                }
            });
            wrap.appendChild(ta);
            wrap.appendChild(err);
            return wrap;
        }

        _inputFile(param, value) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;gap:6px;align-items:center;';
            const lbl = document.createElement('span');
            lbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-primary, #e0d8cc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            lbl.textContent = value ? (typeof value === 'string' ? value : (value.name || '—')) : 'Файл не выбран';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Выбрать...';
            Object.assign(btn.style, {
                padding: '5px 10px', fontSize: '11px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                borderRadius: '4px',
                background: 'var(--bg-hover, rgba(40,40,40,0.5))',
                color: 'var(--text-primary, #e0d8cc)',
                cursor: 'pointer', fontFamily: 'inherit'
            });
            btn.addEventListener('click', () => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.onchange = () => {
                    const f = inp.files && inp.files[0];
                    if (!f) return;
                    lbl.textContent = f.name;
                    this._applyParam(param.id, f.name);
                };
                inp.click();
            });
            wrap.appendChild(lbl);
            wrap.appendChild(btn);
            return wrap;
        }

        _inputReadonly(param, value) {
            const el = document.createElement('div');
            Object.assign(el.style, {
                fontSize: '11px', color: 'var(--text-primary, #e0d8cc)',
                fontFamily: '"Courier New", monospace',
                padding: '4px 0', wordBreak: 'break-all'
            });
            el.textContent = value == null ? '—' : String(value);
            return el;
        }

        _inputButton(param) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = param.label || param.id;
            Object.assign(btn.style, {
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '5px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-hover, rgba(40,40,40,0.5))',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px', fontFamily: 'inherit', fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease'
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--bg-active, rgba(60,60,60,0.8))';
                btn.style.borderColor = 'var(--beige-dark, #a89070)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--bg-hover, rgba(40,40,40,0.5))';
                btn.style.borderColor = 'var(--border-color, rgba(200,184,154,0.15))';
            });
            btn.addEventListener('click', () => this._invokeButton(param.id));
            return btn;
        }

        _inputButtons(param) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
            const list = Array.isArray(param.options) ? param.options : [];
            for (const b of list) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = (b && b.label) || (b && b.id) || 'Run';
                Object.assign(btn.style, {
                    padding: '6px 12px', borderRadius: '5px',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                    background: 'var(--bg-hover, rgba(40,40,40,0.5))',
                    color: 'var(--text-primary, #e0d8cc)',
                    fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer'
                });
                btn.addEventListener('click', () => this._invokeButton((b && b.id) || 'run'));
                wrap.appendChild(btn);
            }
            return wrap;
        }

        _fallbackValue(param, value) {
            const el = document.createElement('div');
            Object.assign(el.style, {
                fontSize: '11px',
                color: 'var(--text-muted, rgba(200,184,154,0.6))',
                fontStyle: 'italic', padding: '4px 0'
            });
            el.textContent = value == null ? '—' : String(value);
            return el;
        }

        _styleInput(el) {
            Object.assign(el.style, {
                width: '100%', padding: '5px 8px', borderRadius: '4px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.15))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '12px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box'
            });
        }

        _renderCustomValue(param, value, renderer) {
            const host = this;
            try {
                if (typeof renderer.render !== 'function') {
                    return this._fallbackValue(param, value);
                }
                const el = renderer.render({
                    param: param,
                    value: value,
                    onChange: (v) => host._applyParam(param.id, v),
                    ctx: host._makeCtx(),
                    node: host._node,
                    graph: host._graph
                });
                if (!el || el.nodeType !== 1) {
                    return this._fallbackValue(param, value);
                }
                el.dataset.npParamId = param.id;
                el.dataset.npType = param.type;
                el.setAttribute('data-np-custom', '1');
                return el;
            } catch (e) {
                console.error('[nodeprops] custom render error:', e);
                return this._fallbackValue(param, value);
            }
        }

        _destroyCustomRenderers() {
            if (!this._bodyEl) return;
            if (!this._customRenderers) return;
            for (const [typeName, renderer] of Object.entries(this._customRenderers)) {
                if (typeof renderer.destroy !== 'function') continue;
                try {
                    const nodes = this._bodyEl.querySelectorAll(`[data-np-type="${CSS.escape(typeName)}"]`);
                    for (const n of nodes) {
                        try { renderer.destroy(n); } catch (e) {}
                    }
                } catch (e) {}
            }
        }

        // ============================================================
        // ✅ v3.1.0: _applyParam перечитывает actual
        // ============================================================
        _applyParam(id, value) {
            if (!this._node) return;
            if (this._applying) return;
            this._applying = true;
            try {
                this._node.paramValues[id] = value;
                this._node.updatedAt = Date.now();

                if (typeof this._node.def.invokeParamChange === 'function') {
                    this._node.def.invokeParamChange(id, value, this._node);
                }

                // ✅ Перечитать актуальное значение
                const actual = this._node.paramValues[id];

                if (this._graph) {
                    this._node.invalidateResult();
                    this._graph.invalidateDescendants(this._node.id);
                    this._graph._bump();
                }

                if (this._graphHost && typeof this._graphHost._saveAndRecord === 'function') {
                    this._graphHost._saveAndRecord(`Параметр: ${id}`);
                }

                try {
                    this.sendMessage(MSG_PARAM, {
                        nodeId: this._node.id,
                        paramId: id,
                        value: actual
                    }, null);
                } catch (e) {}

                this._renderHeader();

                // ✅ Передать actual
                this._updateParamEl(id, actual);
            } finally {
                this._applying = false;
            }
        }

        _refreshValues() {
            if (!this._node) return;
            this._renderHeader();
            this._renderParams();
        }

        _makeGroup(title) {
            const wrap = document.createElement('div');
            Object.assign(wrap.style, { marginBottom: '10px' });
            const key = String(title || '');
            const isCollapsed = !!this._collapsedGroups[key];

            const head = document.createElement('button');
            head.type = 'button';
            Object.assign(head.style, {
                display: 'flex', alignItems: 'center', gap: '6px',
                width: '100%', padding: '6px 4px',
                background: 'transparent', border: 'none',
                color: 'var(--text-secondary, #a09888)',
                fontSize: '10px', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                borderBottom: '1px solid var(--border-color, rgba(200,184,154,0.08))'
            });

            const arrow = document.createElement('span');
            arrow.textContent = isCollapsed ? '▶' : '▼';
            arrow.style.cssText = 'font-size:8px;opacity:0.7;';
            head.appendChild(arrow);

            const label = document.createElement('span');
            label.textContent = title;
            head.appendChild(label);

            const body = document.createElement('div');
            Object.assign(body.style, {
                display: isCollapsed ? 'none' : 'flex',
                flexDirection: 'column', gap: '0',
                paddingTop: '6px'
            });

            head.addEventListener('click', () => {
                const next = !this._collapsedGroups[key];
                this._collapsedGroups[key] = next;
                body.style.display = next ? 'none' : 'flex';
                arrow.textContent = next ? '▶' : '▼';
                this.setState({ [COLLAPSED_STATE_KEY]: { ...this._collapsedGroups } });
            });

            wrap.appendChild(head);
            wrap.appendChild(body);
            return { el: wrap, body, head, arrow };
        }

        _makeCategoryResetRow(paramsInCat) {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex', justifyContent: 'flex-end', marginBottom: '4px'
            });
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Сбросить категорию';
            Object.assign(btn.style, {
                padding: '3px 8px', fontSize: '10px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                borderRadius: '3px', background: 'transparent',
                color: 'var(--text-muted, rgba(200,184,154,0.6))',
                cursor: 'pointer', fontFamily: 'inherit'
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--bg-hover, rgba(40,40,40,0.5))';
                btn.style.color = 'var(--text-primary, #e0d8cc)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-muted, rgba(200,184,154,0.6))';
            });
            btn.addEventListener('click', () => {
                for (const p of paramsInCat) {
                    this._node.paramValues[p.id] = p.default;
                }
                if (this._graph) {
                    this._graph.invalidateDescendants(this._node.id);
                    this._graph._bump();
                }
                if (this._graphHost && typeof this._graphHost._saveAndRecord === 'function') {
                    this._graphHost._saveAndRecord('Сброс категории');
                }
                this._renderParams();
            });
            row.appendChild(btn);
            return row;
        }

        _toHex(value) {
            if (!value || typeof value !== 'string') return '#000000';
            if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
            if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
            const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (m) {
                const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
                const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
                const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
                return '#' + r + g + b;
            }
            return '#000000';
        }

        _getAlpha(value) {
            if (!value || typeof value !== 'string') return 1;
            const m = value.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
            if (m) return Math.max(0, Math.min(1, Number(m[1])));
            return 1;
        }

        refresh() {
            if (!this._node) return;
            this._renderHeader();
            this._renderParams();
        }

        expandAll() { this._setAllGroups(false); }
        collapseAll() { this._setAllGroups(true); }

        _setAllGroups(collapsed) {
            if (!this._bodyEl) return;
            const heads = this._bodyEl.querySelectorAll('button');
            for (const h of heads) {
                const arrow = h.querySelector('span');
                const body = h.nextElementSibling;
                if (!body || !body.style) continue;
                body.style.display = collapsed ? 'none' : 'flex';
                if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
            }
        }

        runNode() {
            if (!this._node) return;
            const host = this._graphHost;
            if (host && typeof host.runNode === 'function') {
                host.runNode(this._node);
            } else {
                this.notify('Run', 'Нет доступа к графу', 'warning');
            }
        }
    }

    if (typeof window !== 'undefined') {
        window.NodePropertiesWindow = NodePropertiesWindow;
        console.log('[NodePropertiesWindow] Registered class globally v3.1.0');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { NodePropertiesWindow };
    }

})();