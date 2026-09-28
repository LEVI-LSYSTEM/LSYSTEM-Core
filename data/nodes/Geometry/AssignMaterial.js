// data/nodes/Geometry/AssignMaterial.js
// AssignMaterial v1.3.0 — назначение материала по группам меша
//
// Среда: Geometry
// Порт: in (input), out (output)
// Результат: { kind: 'geom.material', mesh, assignments, materials, group_names }
//
// Изменения v1.3.0 (относительно v1.2.0):
//   - Убрана толщина (thickness_mm) — это геометрия.
//   - Убран модуль Юнга (young_modulus) — жёсткость = material "rigid".
//   - Оставлены только встроенные материалы: rigid, PETG, none.
//   - Остальные пластики (PLA, ABS, MDF, фанера и т.д.) — пользователь может
//     добавить через «+ Добавить материал».
//
// Особенности:
//   - Автоматически читает группы из входящего меша.
//   - Таблица: группа → материал.
//   - Если материал не назначен — rigid.
//   - Пропускает меш через себя (позиции, индексы, группы).
'use strict';

// ============================================================
// РЕАЛЬНЫЕ АКУСТИЧЕСКИЕ ПАРАМЕТРЫ МАТЕРИАЛОВ
// ============================================================
//
// absorption       — коэффициент поглощения α (0…1) на средних частотах
// density          — плотность, кг/м³
// flow_resistivity — удельное сопротивление потоку, Па·с/м² (для пористых)
//
// ============================================================

const BUILTIN_MATERIALS = {
    rigid: {
        id: 'rigid',
        label: 'Rigid',
        description: 'Абсолютно жёсткая стенка, α = 0',
        is_rigid: true,
        is_builtin: true,
        params: {
            absorption: 0.0,
            density: null,
            flow_resistivity: null
        }
    },

    PETG: {
        id: 'PETG',
        label: 'PETG',
        description: 'Пластик PETG, 3D-печать. Умеренная жёсткость, слабое поглощение.',
        is_builtin: true,
        params: {
            absorption: 0.05,
            density: 1270,       // кг/м³
            flow_resistivity: null
        }
    },

    none: {
        id: 'none',
        label: 'None',
        description: 'Материал не назначается (например, для группы динамика)',
        is_none: true,
        is_builtin: true,
        params: {}
    }
};

const DEFAULT_MATERIAL = 'rigid';

// Схема полей материала
const MATERIAL_FIELDS = [
    {
        id: 'absorption',
        label: 'α (поглощение)',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        description: 'Коэффициент поглощения 0…1'
    },
    {
        id: 'density',
        label: 'Плотность',
        type: 'number',
        min: 1,
        max: 10000,
        step: 1,
        unit: 'кг/м³',
        description: 'Плотность материала'
    },
    {
        id: 'flow_resistivity',
        label: 'Сопрот. потоку',
        type: 'number',
        min: 0,
        max: 1e6,
        step: 100,
        unit: 'Па·с/м²',
        description: 'Flow resistivity (для пористых)'
    }
];

// ============================================================
// МОДУЛЬ
// ============================================================

module.exports = {
    meta: {
        id: 'Acoustic.Geometry.assign_material',
        label: 'Assign Material',
        icon: 'icon-palette'
    },

    ports: {
        inputs:  [ { id: 'in',  label: 'In'  } ],
        outputs: [ { id: 'out', label: 'Out' } ]
    },

    inputRules:  { in:  ['*'] },
    outputRules: { out: ['*'] },

    maxInputs:  { in: 1 },
    maxOutputs: { out: '*' },

    params: [
        {
            id: 'assignments',
            type: 'assign_material_ui',
            label: 'Материалы',
            default: {},
            category: 'Materials',
            _noCategoryHeader: true
        }
    ],

    buttons: [
        { id: 'run', label: 'Run', icon: 'icon-play' }
    ],

    // ============================================================
    // COMPUTE
    // ============================================================
    checkCompute(ctx) {
        const inputs = ctx.getInputs();
        if (inputs.length === 0) {
            return { ready: false, reason: 'No input mesh' };
        }
        return { ready: true };
    },

    async compute(ctx) {
        const inputs = ctx.getInputs();
        if (inputs.length === 0) throw new Error('AssignMaterial: no inputs');

        const upResult = await ctx.requestCompute(inputs[0].id);
        if (!upResult || upResult.kind !== 'geom.mesh') {
            throw new Error('AssignMaterial: input is not a mesh');
        }

        const groups = upResult.groups || {};
        const groupNames = Object.keys(groups);

        // Запоминаем группы для UI
        try {
            if (ctx.node && ctx.node.paramValues) {
                ctx.node.paramValues.__known_groups = groupNames.slice();
            }
        } catch (e) {}

        const rawAssignments = (ctx.params.assignments && typeof ctx.params.assignments === 'object')
            ? ctx.params.assignments
            : {};

        // Пользовательские материалы и переопределения
        const customMaterials = (ctx.node && ctx.node.paramValues && typeof ctx.node.paramValues.custom_materials === 'object')
            ? ctx.node.paramValues.custom_materials : {};
        const overrides = (ctx.node && ctx.node.paramValues && typeof ctx.node.paramValues.material_overrides === 'object')
            ? ctx.node.paramValues.material_overrides : {};

        // Полный словарь материалов = builtin + custom
        const allMaterials = _buildAllMaterials(customMaterials, overrides);

        // Нормализуем assignments
        const assignments = {};
        const materialsUsed = new Set();

        for (const gName of groupNames) {
            let matId = rawAssignments[gName];
            if (!matId || !allMaterials[matId]) {
                matId = DEFAULT_MATERIAL;
            }
            assignments[gName] = matId;
            if (!allMaterials[matId].is_none) materialsUsed.add(matId);
        }

        // Собираем использованные материалы
        const materials = {};
        for (const id of materialsUsed) {
            materials[id] = { ...allMaterials[id] };
        }

        return {
            kind: 'geom.material',
            status: upResult.status || 'watertight_mesh',
            mesh: {
                source:    upResult.source,
                positions: upResult.positions,
                indices:   upResult.indices,
                groups:    upResult.groups,
                bbox:      upResult.bbox,
                stats:     upResult.stats
            },
            assignments,
            materials,
            group_names: groupNames
        };
    },

    // ============================================================
    // UI
    // ============================================================
    renderCustomProperties(ctx) {
        return {
            'assign_material_ui': {
                render({ param, value, onChange, ctx, node, graph }) {
                    return _renderAssignUI(onChange, ctx, node);
                },
                update(el, value) {
                    _updateAssignUI(el);
                },
                destroy(el) {
                    if (el && el.__cleanup) { try { el.__cleanup(); } catch (e) {} }
                }
            }
        };
    }
};

// ============================================================
// ХЕЛПЕРЫ ДАННЫХ
// ============================================================

function _buildAllMaterials(customMaterials, overrides) {
    const out = {};
    for (const [id, m] of Object.entries(BUILTIN_MATERIALS)) {
        const ov = (overrides && overrides[id] && typeof overrides[id] === 'object') ? overrides[id] : {};
        out[id] = {
            id,
            label: m.label,
            description: m.description || '',
            is_rigid: !!m.is_rigid,
            is_none: !!m.is_none,
            is_builtin: true,
            is_porous: !!m.is_porous,
            params: { ...(m.params || {}), ...ov }
        };
    }
    for (const [id, m] of Object.entries(customMaterials)) {
        if (out[id]) continue;
        out[id] = {
            id,
            label: m.label || id,
            description: m.description || '',
            is_rigid: !!m.is_rigid,
            is_none: !!m.is_none,
            is_builtin: false,
            is_porous: !!m.is_porous,
            params: { ...(m.params || {}) }
        };
    }
    return out;
}

function _readStateFromNode(node) {
    const out = {
        groups: [],
        assignments: {},
        customMaterials: {},
        overrides: {},
        picker: null
    };
    if (!node || !node.paramValues) return out;

    const pv = node.paramValues;

    if (Array.isArray(pv.__known_groups) && pv.__known_groups.length > 0) {
        out.groups = pv.__known_groups.slice();
    } else if (node._result) {
        const r = node._result;
        if (r.kind === 'geom.material' && Array.isArray(r.group_names)) {
            out.groups = r.group_names.slice();
        } else if (r.mesh && r.mesh.groups) {
            out.groups = Object.keys(r.mesh.groups);
        }
    }

    if (pv.assignments && typeof pv.assignments === 'object') {
        out.assignments = { ...pv.assignments };
    }
    if (pv.custom_materials && typeof pv.custom_materials === 'object') {
        out.customMaterials = JSON.parse(JSON.stringify(pv.custom_materials));
    }
    if (pv.material_overrides && typeof pv.material_overrides === 'object') {
        out.overrides = JSON.parse(JSON.stringify(pv.material_overrides));
    }
    if (typeof pv.__materialPicker === 'string') {
        out.picker = pv.__materialPicker;
    }

    return out;
}

function _writeStateToNode(node, patch) {
    if (!node) return;
    if (!node.paramValues) node.paramValues = {};
    Object.assign(node.paramValues, patch);
    node.updatedAt = Date.now();
    node.invalidateResult();
    try {
        document.dispatchEvent(new CustomEvent('nodegraph:param-changed', {
            detail: { nodeId: node.id, paramId: 'assignments', value: node.paramValues.assignments }
        }));
    } catch (e) {}
}

// ============================================================
// UI: главная карточка
// ============================================================

function _renderAssignUI(onChange, ctx, node) {
    const uiApi = (ctx && ctx.host && ctx.host.ui) ? ctx.host.ui : null;
    const state = _readStateFromNode(node);
    const allMaterials = _buildAllMaterials(state.customMaterials, state.overrides);

    const wrap = document.createElement('div');
    wrap.className = 'assign-material-ui';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;box-sizing:border-box;';
    wrap.__onChange = onChange;
    wrap.__uiApi = uiApi;
    wrap.__node = node;

    wrap.appendChild(_buildInfoBar(state, allMaterials, uiApi));

    if (state.groups.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px 12px;background:rgba(200,184,154,0.04);border:1px dashed rgba(200,184,154,0.2);border-radius:8px;font-size:11px;color:var(--text-muted,rgba(200,184,154,0.55));text-align:center;';
        empty.textContent = 'Нет групп. Запустите Run, чтобы прочитать группы из меша.';
        wrap.appendChild(empty);
    } else {
        wrap.appendChild(_buildGroupsTable(state, allMaterials, uiApi, node));
    }

    wrap.appendChild(_buildMaterialSettingsSection(state, allMaterials, uiApi, node));
    wrap.appendChild(_buildActions(state, allMaterials, uiApi, node));

    return wrap;
}

function _buildInfoBar(state, allMaterials, uiApi) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(204,34,51,0.14) 0%,rgba(204,34,51,0.02) 100%);border-left:3px solid var(--accent-red,#cc2233);border-radius:0 8px 8px 0;width:100%;min-width:0;box-sizing:border-box;';

    const icon = _makeIcon(uiApi, 'icon-palette', 20);
    icon.style.cssText += 'color:var(--accent-red,#cc2233);flex-shrink:0;';
    bar.appendChild(icon);

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

    const line1 = document.createElement('div');
    line1.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary,#e0d8cc);letter-spacing:0.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    line1.textContent = `Материалы · ${state.groups.length} групп`;
    info.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText = "font-size:10px;color:var(--text-muted,rgba(200,184,154,0.5));font-family:'Courier New',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    const counts = {};
    for (const g of state.groups) {
        const m = state.assignments[g] || DEFAULT_MATERIAL;
        counts[m] = (counts[m] || 0) + 1;
    }
    const parts = Object.entries(counts).map(([m, n]) => `${m}: ${n}`);
    line2.textContent = parts.join(' · ') || '—';
    info.appendChild(line2);

    bar.appendChild(info);

    return bar;
}

function _buildGroupsTable(state, allMaterials, uiApi, node) {
    const section = _makeSection('Группы', 'icon-layers', uiApi);

    const table = document.createElement('div');
    table.style.cssText = 'display:flex;flex-direction:column;width:100%;';

    for (const gName of state.groups) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 140px;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(200,184,154,0.04);';

        const nameEl = document.createElement('div');
        nameEl.textContent = gName;
        nameEl.style.cssText = 'font-size:11px;font-weight:600;font-family:"Courier New",monospace;color:var(--text-primary,#e0d8cc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.title = gName;
        row.appendChild(nameEl);

        const select = document.createElement('select');
        select.style.cssText = 'width:100%;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-input,#2a2a2a);color:var(--text-primary,#e0d8cc);border:1px solid var(--border-color,rgba(200,184,154,0.15));border-radius:4px;outline:none;box-sizing:border-box;cursor:pointer;';

        const ids = Object.keys(allMaterials);
        for (const mid of ids) {
            const opt = document.createElement('option');
            opt.value = mid;
            opt.textContent = allMaterials[mid].label;
            if ((state.assignments[gName] || DEFAULT_MATERIAL) === mid) opt.selected = true;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            const nextAssignments = { ...state.assignments, [gName]: select.value };
            _writeStateToNode(node, { assignments: nextAssignments });
            _rerender(wrapOf(select), node);
        });

        row.appendChild(select);
        table.appendChild(row);
    }

    section.body.appendChild(table);
    return section.el;
}

function wrapOf(el) {
    let cur = el;
    while (cur && !(cur.classList && cur.classList.contains('assign-material-ui'))) {
        cur = cur.parentElement;
    }
    return cur;
}

// ============================================================
// Секция «Настройки материалов»
// ============================================================

function _buildMaterialSettingsSection(state, allMaterials, uiApi, node) {
    const section = _makeSection('Настройки материалов', 'icon-settings', uiApi);

    const editable = Object.keys(allMaterials).filter(id => !allMaterials[id].is_none);

    if (editable.length === 0) {
        section.body.appendChild(_empty('Нет материалов.'));
        return section.el;
    }

    const activeId = (state.picker && editable.includes(state.picker)) ? state.picker : editable[0];

    const pickerRow = document.createElement('div');
    pickerRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(200,184,154,0.06);';

    const pickerLabel = document.createElement('div');
    pickerLabel.textContent = 'Материал:';
    pickerLabel.style.cssText = 'font-size:11px;color:var(--text-secondary,#a09888);font-weight:600;flex-shrink:0;';
    pickerRow.appendChild(pickerLabel);

    const picker = document.createElement('select');
    picker.style.cssText = 'flex:1;min-width:0;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-input,#2a2a2a);color:var(--text-primary,#e0d8cc);border:1px solid var(--border-color,rgba(200,184,154,0.15));border-radius:4px;outline:none;box-sizing:border-box;cursor:pointer;';
    for (const id of editable) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = allMaterials[id].label + (allMaterials[id].is_builtin ? '' : ' (custom)');
        if (id === activeId) opt.selected = true;
        picker.appendChild(opt);
    }
    pickerRow.appendChild(picker);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '×';
    delBtn.title = 'Удалить материал';
    delBtn.style.cssText = 'width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(204,34,51,0.5);border-radius:4px;background:transparent;color:var(--accent-red,#cc2233);cursor:pointer;font-size:14px;font-weight:700;line-height:1;box-sizing:border-box;flex-shrink:0;';
    const updateDelVisibility = () => {
        const m = allMaterials[picker.value];
        delBtn.style.display = (m && !m.is_builtin) ? 'inline-flex' : 'none';
    };
    updateDelVisibility();
    pickerRow.appendChild(delBtn);

    section.body.appendChild(pickerRow);

    const fieldsArea = document.createElement('div');
    fieldsArea.style.cssText = 'display:flex;flex-direction:column;width:100%;';
    section.body.appendChild(fieldsArea);

    const renderFields = (matId) => {
        fieldsArea.innerHTML = '';
        const mat = allMaterials[matId];
        if (!mat) return;

        if (mat.description) {
            const desc = document.createElement('div');
            desc.textContent = mat.description;
            desc.style.cssText = 'font-size:10px;color:var(--text-muted,rgba(200,184,154,0.55));font-style:italic;padding:6px 12px 4px;';
            fieldsArea.appendChild(desc);
        }

        for (const f of MATERIAL_FIELDS) {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 100px 70px;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid rgba(200,184,154,0.04);';

            const lab = document.createElement('div');
            lab.textContent = f.label;
            lab.title = f.description || '';
            lab.style.cssText = 'font-size:11px;color:var(--text-secondary,#a09888);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            row.appendChild(lab);

            const inp = document.createElement('input');
            inp.type = 'number';
            const cur = mat.params ? mat.params[f.id] : null;
            inp.value = (cur != null) ? String(cur) : '';
            inp.placeholder = '—';
            if (f.min != null) inp.min = String(f.min);
            if (f.max != null) inp.max = String(f.max);
            if (f.step != null) inp.step = String(f.step);
            inp.style.cssText = 'width:100%;padding:4px 6px;font-size:11px;font-family:"Courier New",monospace;background:var(--bg-input,#2a2a2a);color:var(--text-primary,#e0d8cc);border:1px solid var(--border-color,rgba(200,184,154,0.15));border-radius:4px;outline:none;box-sizing:border-box;';

            inp.addEventListener('change', () => {
                const raw = inp.value.trim();

                if (mat.is_builtin) {
                    const nextOverrides = JSON.parse(JSON.stringify(state.overrides || {}));
                    if (!nextOverrides[matId]) nextOverrides[matId] = {};
                    if (raw === '') delete nextOverrides[matId][f.id];
                    else {
                        let v = Number(raw);
                        if (!isFinite(v)) return;
                        if (f.min != null && v < f.min) v = f.min;
                        if (f.max != null && v > f.max) v = f.max;
                        nextOverrides[matId][f.id] = v;
                    }
                    _writeStateToNode(node, { material_overrides: nextOverrides });
                } else {
                    const nextCustom = JSON.parse(JSON.stringify(state.customMaterials || {}));
                    if (!nextCustom[matId]) nextCustom[matId] = { label: mat.label, params: {} };
                    if (!nextCustom[matId].params) nextCustom[matId].params = {};
                    if (raw === '') delete nextCustom[matId].params[f.id];
                    else {
                        let v = Number(raw);
                        if (!isFinite(v)) return;
                        if (f.min != null && v < f.min) v = f.min;
                        if (f.max != null && v > f.max) v = f.max;
                        nextCustom[matId].params[f.id] = v;
                    }
                    _writeStateToNode(node, { custom_materials: nextCustom });
                }
                if (node && node._graph && node._graph._bump) node._graph._bump();
            });

            row.appendChild(inp);

            const unit = document.createElement('div');
            unit.textContent = f.unit || '';
            unit.style.cssText = 'font-size:9px;color:var(--text-muted,rgba(200,184,154,0.4));font-family:monospace;';
            row.appendChild(unit);

            fieldsArea.appendChild(row);
        }

        if (mat.is_builtin) {
            const resetRow = document.createElement('div');
            resetRow.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 12px;';
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.textContent = 'Сбросить к встроенным';
            resetBtn.style.cssText = 'padding:4px 10px;font-size:10px;font-family:inherit;border:1px solid var(--border-color,rgba(200,184,154,0.15));border-radius:4px;background:transparent;color:var(--text-muted,rgba(200,184,154,0.6));cursor:pointer;';
            resetBtn.addEventListener('click', () => {
                const nextOverrides = JSON.parse(JSON.stringify(state.overrides || {}));
                delete nextOverrides[matId];
                _writeStateToNode(node, { material_overrides: nextOverrides });
                _rerender(wrapOf(fieldsArea), node);
            });
            resetRow.appendChild(resetBtn);
            fieldsArea.appendChild(resetRow);
        }
    };

    picker.addEventListener('change', () => {
        _writeStateToNode(node, { __materialPicker: picker.value });
        updateDelVisibility();
        renderFields(picker.value);
    });

    delBtn.addEventListener('click', () => {
        const id = picker.value;
        const mat = allMaterials[id];
        if (!mat || mat.is_builtin) return;

        if (!confirm(`Удалить материал "${mat.label}"?`)) return;

        const nextCustom = JSON.parse(JSON.stringify(state.customMaterials || {}));
        delete nextCustom[id];

        const nextAssignments = { ...state.assignments };
        for (const g of Object.keys(nextAssignments)) {
            if (nextAssignments[g] === id) nextAssignments[g] = DEFAULT_MATERIAL;
        }

        _writeStateToNode(node, {
            custom_materials: nextCustom,
            assignments: nextAssignments,
            __materialPicker: editable.find(e => e !== id) || DEFAULT_MATERIAL
        });
        _rerender(wrapOf(pickerRow), node);
    });

    renderFields(activeId);

    return section.el;
}

// ============================================================
// Действия
// ============================================================

function _buildActions(state, allMaterials, uiApi, node) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;padding:4px 0 0;flex-wrap:wrap;width:100%;box-sizing:border-box;';

    const mkBtn = (label, iconId, onClick, variant = 'default') => {
        const b = document.createElement('button');
        b.type = 'button';
        const isPrimary = variant === 'primary';
        const isDanger = variant === 'danger';
        b.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:11px;font-weight:600;font-family:inherit;letter-spacing:0.2px;border-radius:6px;cursor:pointer;transition:all 0.15s ease;border:1px solid ${isPrimary ? 'var(--accent-red,#cc2233)' : isDanger ? 'rgba(204,34,51,0.5)' : 'var(--border-color,rgba(200,184,154,0.2))'};background:${isPrimary ? 'var(--accent-red,#cc2233)' : 'transparent'};color:${isPrimary ? '#fff' : isDanger ? 'var(--accent-red,#cc2233)' : 'var(--text-secondary,#a09888)'};box-sizing:border-box;`;
        if (iconId) { const ic = _makeIcon(uiApi, iconId, 12); ic.style.color = 'currentColor'; b.appendChild(ic); }
        const span = document.createElement('span');
        span.textContent = label;
        b.appendChild(span);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return b;
    };

    row.appendChild(mkBtn('Всё Rigid', 'icon-box', () => {
        const next = {};
        for (const g of state.groups) next[g] = 'rigid';
        _writeStateToNode(node, { assignments: next });
        _rerender(wrapOf(row), node);
    }));

    row.appendChild(mkBtn('Сбросить', 'icon-refresh', () => {
        _writeStateToNode(node, { assignments: {} });
        _rerender(wrapOf(row), node);
    }, 'danger'));

    row.appendChild(mkBtn('+ Добавить материал', 'icon-plus', () => {
        _showAddMaterialDialog(node, () => _rerender(wrapOf(row), node));
    }, 'primary'));

    return row;
}

// ============================================================
// Диалог добавления материала
// ============================================================

function _showAddMaterialDialog(node, onDone) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:var(--bg-panel,#1a1a1a);border:1px solid var(--border-color,rgba(200,184,154,0.2));border-radius:10px;min-width:380px;max-width:480px;width:90%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);';

    const header = document.createElement('div');
    header.textContent = 'Новый материал';
    header.style.cssText = 'padding:14px 16px;font-size:13px;font-weight:700;color:var(--text-primary,#e0d8cc);border-bottom:1px solid var(--border-color,rgba(200,184,154,0.15));';
    dlg.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;';

    const mkField = (label, key, type = 'text', opts = {}) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        const l = document.createElement('label');
        l.textContent = label;
        l.style.cssText = 'font-size:11px;color:var(--text-secondary,#a09888);font-weight:600;';
        wrap.appendChild(l);
        const inp = document.createElement('input');
        inp.type = type;
        inp.dataset.key = key;
        if (type === 'number') {
            if (opts.min != null) inp.min = String(opts.min);
            if (opts.max != null) inp.max = String(opts.max);
            if (opts.step != null) inp.step = String(opts.step);
        }
        inp.value = (opts.value != null) ? String(opts.value) : '';
        inp.style.cssText = 'padding:6px 9px;font-size:12px;font-family:inherit;background:var(--bg-input,#2a2a2a);color:var(--text-primary,#e0d8cc);border:1px solid var(--border-color,rgba(200,184,154,0.15));border-radius:5px;outline:none;box-sizing:border-box;';
        wrap.appendChild(inp);
        body.appendChild(wrap);
        return inp;
    };

    const idInp = mkField('ID (латиница, без пробелов) *', 'id');
    const labelInp = mkField('Название *', 'label');
    const descInp = mkField('Описание', 'description');

    const hint = document.createElement('div');
    hint.textContent = 'Параметры:';
    hint.style.cssText = 'font-size:11px;color:var(--text-secondary,#a09888);font-weight:600;margin-top:6px;';
    body.appendChild(hint);

    const paramInputs = {};
    for (const f of MATERIAL_FIELDS) {
        const inp = mkField(f.label + (f.unit ? ` (${f.unit})` : ''), 'p_' + f.id, 'number', {
            min: f.min, max: f.max, step: f.step
        });
        inp.placeholder = 'оставьте пустым, если не нужно';
        paramInputs[f.id] = inp;
    }

    dlg.appendChild(body);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--border-color,rgba(200,184,154,0.15));';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.cssText = 'padding:8px 14px;font-size:12px;font-family:inherit;border:1px solid var(--border-color,rgba(200,184,154,0.2));border-radius:6px;background:transparent;color:var(--text-secondary,#a09888);cursor:pointer;';
    cancelBtn.addEventListener('click', () => close());
    footer.appendChild(cancelBtn);

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = 'Создать';
    okBtn.style.cssText = 'padding:8px 14px;font-size:12px;font-family:inherit;font-weight:600;border:1px solid var(--accent-red,#cc2233);border-radius:6px;background:var(--accent-red,#cc2233);color:#fff;cursor:pointer;';
    okBtn.addEventListener('click', () => {
        const id = idInp.value.trim();
        const label = labelInp.value.trim() || id;
        if (!id) { alert('Укажите ID'); return; }
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) { alert('ID: только латиница, цифры, _; начинается с буквы'); return; }
        if (BUILTIN_MATERIALS[id]) { alert('ID совпадает со встроенным материалом'); return; }

        const params = {};
        for (const f of MATERIAL_FIELDS) {
            const raw = paramInputs[f.id].value.trim();
            if (raw === '') continue;
            const v = Number(raw);
            if (!isFinite(v)) continue;
            params[f.id] = v;
        }

        const pv = node.paramValues || {};
        const nextCustom = JSON.parse(JSON.stringify(pv.custom_materials || {}));
        nextCustom[id] = {
            label,
            description: descInp.value.trim(),
            params
        };
        _writeStateToNode(node, {
            custom_materials: nextCustom,
            __materialPicker: id
        });
        close();
        if (typeof onDone === 'function') onDone();
    });
    footer.appendChild(okBtn);

    dlg.appendChild(footer);
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    function close() {
        try { overlay.remove(); } catch (e) {}
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    setTimeout(() => idInp.focus(), 30);
}

// ============================================================
// Перерисовка
// ============================================================

function _rerender(rootEl, node) {
    if (!rootEl) return;
    const onChange = rootEl.__onChange;
    const uiApi = rootEl.__uiApi;
    if (!onChange) return;

    const fresh = _renderAssignUI(onChange, { host: { ui: uiApi } }, node || rootEl.__node);
    rootEl.innerHTML = '';
    while (fresh.firstChild) rootEl.appendChild(fresh.firstChild);

    rootEl.__onChange = onChange;
    rootEl.__uiApi = uiApi;
    rootEl.__node = node || rootEl.__node;
}

function _updateAssignUI(el) {
    if (!el || !el.parentNode) return;
    _rerender(el, el.__node);
}

// ============================================================
// Общие хелперы UI
// ============================================================

function _makeSection(title, iconId, uiApi) {
    const section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;background:var(--bg-card,#1f1f1f);border:1px solid var(--border-color,rgba(200,184,154,0.10));border-radius:8px;overflow:hidden;width:100%;min-width:0;box-sizing:border-box;';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(200,184,154,0.05);border-bottom:1px solid var(--border-color,rgba(200,184,154,0.08));font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--text-secondary,#a09888);user-select:none;';

    const iconEl = _makeIcon(uiApi, iconId, 12);
    if (iconEl) head.appendChild(iconEl);

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    head.appendChild(titleEl);

    section.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;width:100%;min-width:0;box-sizing:border-box;';
    section.appendChild(body);

    return { el: section, body, head };
}

function _empty(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'padding:10px 12px;font-size:11px;color:var(--text-muted,rgba(200,184,154,0.55));';
    return el;
}

function _makeIcon(uiApi, id, size = 14) {
    if (uiApi && uiApi.icon && typeof uiApi.icon.svg === 'function') {
        try {
            const el = uiApi.icon.svg(id, size);
            if (el && el.nodeType === 1) return el;
        } catch (e) {}
    }
    const span = document.createElement('span');
    span.style.cssText = `display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;`;
    return span;
}