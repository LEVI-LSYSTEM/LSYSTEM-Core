// core/DataBus.js
// Версия 4.2.1 - Fix: рекурсия в _notifySlot → итеративный цикл с лимитом
// - MAX_NOTIFY_DEPTH = 8
// - _notifySlot: while-loop вместо рекурсии
// - v4.2.0: ArrayBuffer по ссылке (без изменений)

(function() {
    'use strict';

    console.log('[DataBus] Loading v4.2.1...');

    // ============================================================
    // КОНСТАНТЫ ЛИМИТОВ
    // ============================================================

    const LIMITS = {
        ACTIVE_PER_TYPE: 4,
        ARCHIVED_PER_TYPE: 4,
        ARCHIVED_TOTAL: 16
    };

    const MAX_NOTIFY_DEPTH = 8;

    // ============================================================
    // СЕРИАЛИЗАЦИЯ Map / Set / ArrayBuffer
    // ============================================================

    const SERIALIZE_TYPE_KEY = '__lsType';
    const SERIALIZE_VALUE_KEY = '__lsValue';

    function isPlainObject(obj) {
        if (obj === null || typeof obj !== 'object') return false;
        const proto = Object.getPrototypeOf(obj);
        return proto === Object.prototype || proto === null;
    }

    // ============================================================
    // BASE64 HELPERS
    // ============================================================

    function bytesToBase64(bytes) {
        if (typeof btoa === 'function') {
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            return btoa(binary);
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        return Array.from(bytes);
    }

    function base64ToBytes(b64) {
        if (typeof atob === 'function') {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(b64, 'base64'));
        }
        return new Uint8Array(0);
    }

    // ============================================================
    // SERIALIZE (in-memory → JSON)
    // ============================================================

    function serializeSpecial(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        if (ArrayBuffer.isView(obj)) {
            const ctor = obj.constructor.name;
            const bytes = new Uint8Array(
                obj.buffer,
                obj.byteOffset || 0,
                obj.byteLength
            );
            return {
                [SERIALIZE_TYPE_KEY]: ctor,
                [SERIALIZE_VALUE_KEY]: bytesToBase64(bytes)
            };
        }
        if (obj instanceof ArrayBuffer) {
            return {
                [SERIALIZE_TYPE_KEY]: 'ArrayBuffer',
                [SERIALIZE_VALUE_KEY]: bytesToBase64(new Uint8Array(obj))
            };
        }
        if (obj instanceof Map) {
            const entries = [];
            for (const [k, v] of obj) {
                entries.push([serializeSpecial(k), serializeSpecial(v)]);
            }
            return { [SERIALIZE_TYPE_KEY]: 'Map', [SERIALIZE_VALUE_KEY]: entries };
        }
        if (obj instanceof Set) {
            const values = [];
            for (const v of obj) values.push(serializeSpecial(v));
            return { [SERIALIZE_TYPE_KEY]: 'Set', [SERIALIZE_VALUE_KEY]: values };
        }
        if (obj instanceof Date) {
            return { [SERIALIZE_TYPE_KEY]: 'Date', [SERIALIZE_VALUE_KEY]: obj.toISOString() };
        }
        if (obj instanceof RegExp) {
            return {
                [SERIALIZE_TYPE_KEY]: 'RegExp',
                [SERIALIZE_VALUE_KEY]: { source: obj.source, flags: obj.flags }
            };
        }
        if (Array.isArray(obj)) {
            return obj.map(serializeSpecial);
        }
        if (isPlainObject(obj)) {
            const result = {};
            for (const [k, v] of Object.entries(obj)) {
                result[k] = serializeSpecial(v);
            }
            return result;
        }
        return undefined;
    }

    // ============================================================
    // DESERIALIZE (JSON → in-memory)
    // ============================================================

    function deserializeSpecial(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map(deserializeSpecial);
        }

        const t = obj[SERIALIZE_TYPE_KEY];
        if (t !== undefined) {
            const v = obj[SERIALIZE_VALUE_KEY];

            switch (t) {
                case 'Map': {
                    const m = new Map();
                    for (const [k, val] of (v || [])) {
                        m.set(deserializeSpecial(k), deserializeSpecial(val));
                    }
                    return m;
                }
                case 'Set': {
                    const s = new Set();
                    for (const val of (v || [])) s.add(deserializeSpecial(val));
                    return s;
                }
                case 'Date':
                    return new Date(v);
                case 'RegExp':
                    return new RegExp(v?.source || '', v?.flags || '');

                case 'ArrayBuffer': {
                    const bytes = (typeof v === 'string')
                        ? base64ToBytes(v)
                        : new Uint8Array(v || []);
                    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                }

                default: {
                    if (typeof globalThis[t] === 'function') {
                        try {
                            const bytes = (typeof v === 'string')
                                ? base64ToBytes(v)
                                : new Uint8Array(v || []);

                            const copy = new Uint8Array(bytes.length);
                            copy.set(bytes);

                            if (t === 'DataView') {
                                return new DataView(copy.buffer);
                            }
                            return new globalThis[t](copy.buffer);
                        } catch (e) {
                            console.error('[DataBus] deserializeSpecial error for', t, e);
                        }
                    }
                    return v;
                }
            }
        }

        if (isPlainObject(obj)) {
            const result = {};
            for (const [k, val] of Object.entries(obj)) {
                result[k] = deserializeSpecial(val);
            }
            return result;
        }

        return obj;
    }

    // ============================================================
    // КЛАСС
    // ============================================================

    class DataBus {
        constructor(options = {}) {
            this._slots = new Map();
            this._typeIndex = new Map();
            this._windowSlotIndex = new Map();

            this._slotSubscribers = new Map();
            this._typeSubscribers = new Map();

            this._isDirty = false;
            this._lastSaveTime = Date.now();
            this._version = 0;
            this._isRestoring = false;

            this._slotCounters = new Map();
            this._pendingUpdates = new Map();

            this._debug = options.debug || false;

            console.log('[DataBus] Initialized v4.2.1 (slots mode)');
        }

        // ============================================================
        // 1. ГЛУБОКОЕ КОПИРОВАНИЕ
        // ============================================================

        _deepCopy(obj) {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj !== 'object') return obj;

            if (ArrayBuffer.isView(obj)) return obj;
            if (obj instanceof ArrayBuffer) return obj;

            if (obj instanceof Map) {
                const result = new Map();
                for (const [key, value] of obj) {
                    result.set(this._deepCopy(key), this._deepCopy(value));
                }
                return result;
            }
            if (obj instanceof Set) {
                const result = new Set();
                for (const value of obj) {
                    result.add(this._deepCopy(value));
                }
                return result;
            }
            if (Array.isArray(obj)) {
                return obj.map(item => this._deepCopy(item));
            }
            if (obj instanceof Date) {
                return new Date(obj.getTime());
            }
            if (obj instanceof RegExp) {
                return new RegExp(obj.source, obj.flags);
            }

            if (isPlainObject(obj)) {
                const result = {};
                for (const [key, value] of Object.entries(obj)) {
                    result[key] = this._deepCopy(value);
                }
                return result;
            }

            return obj;
        }

        // ============================================================
        // 2. ГЕНЕРАЦИЯ slotId
        // ============================================================

        _generateSlotId(typeId) {
            const counter = (this._slotCounters.get(typeId) || 0) + 1;
            this._slotCounters.set(typeId, counter);
            return `${typeId}-${counter}`;
        }

        // ============================================================
        // 3. ИНДЕКСЫ
        // ============================================================

        _addToTypeIndex(typeId, slotId) {
            if (!this._typeIndex.has(typeId)) {
                this._typeIndex.set(typeId, new Set());
            }
            this._typeIndex.get(typeId).add(slotId);
        }

        _removeFromTypeIndex(typeId, slotId) {
            const set = this._typeIndex.get(typeId);
            if (set) {
                set.delete(slotId);
                if (set.size === 0) {
                    this._typeIndex.delete(typeId);
                }
            }
        }

        // ============================================================
        // 4. СОЗДАНИЕ СЛОТА
        // ============================================================

        createSlot(typeId, options = {}) {
            if (!typeId) {
                console.error('[DataBus] createSlot: typeId is required');
                return null;
            }

            const slotId = options.slotId || this._generateSlotId(typeId);

            if (this._slots.has(slotId)) {
                console.warn('[DataBus] createSlot: slot already exists:', slotId);
                return slotId;
            }

            const activeCount = this.getActiveSlotsByType(typeId).length
                + this.getFreeActiveSlotsByType(typeId).length;

            if (activeCount >= LIMITS.ACTIVE_PER_TYPE) {
                console.warn(
                    '[DataBus] createSlot: active limit reached for type',
                    typeId,
                    '(' + activeCount + '/' + LIMITS.ACTIVE_PER_TYPE + ')'
                );
                return null;
            }

            const slot = {
                id: slotId,
                type: typeId,
                data: options.data !== undefined ? this._deepCopy(options.data) : null,
                metadata: this._deepCopy(options.metadata || {}),
                uiState: this._deepCopy(options.uiState || {}),
                archived: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                archivedAt: null,
                attachedWindows: [],
                _isUpdating: false
            };

            this._slots.set(slotId, slot);
            this._addToTypeIndex(typeId, slotId);
            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Slot created:', slotId, '(type:', typeId + ')');
            }

            return slotId;
        }

        // ============================================================
        // 5. ПОЛУЧЕНИЕ СЛОТА
        // ============================================================

        getSlot(slotId) {
            return this._slots.get(String(slotId)) || null;
        }

        hasSlot(slotId) {
            return this._slots.has(String(slotId));
        }

        // ============================================================
        // 6. УДАЛЕНИЕ СЛОТА
        // ============================================================

        deleteSlot(slotId) {
            const sid = String(slotId);
            const slot = this._slots.get(sid);
            if (!slot) return false;

            for (const windowId of slot.attachedWindows.slice()) {
                this._windowSlotIndex.delete(String(windowId));
            }

            this._slots.delete(sid);
            this._removeFromTypeIndex(slot.type, sid);
            this._slotSubscribers.delete(sid);
            this._pendingUpdates.delete(sid);

            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Slot deleted:', sid);
            }

            return true;
        }

        // ============================================================
        // 7. АРХИВАЦИЯ / РАСПАКОВКА
        // ============================================================

        archiveSlot(slotId) {
            const sid = String(slotId);
            const slot = this._slots.get(sid);
            if (!slot) return false;
            if (slot.archived) return true;

            slot.archived = true;
            slot.archivedAt = Date.now();

            const archivedOfType = this.getArchivedSlotsByType(slot.type);
            while (archivedOfType.length > LIMITS.ARCHIVED_PER_TYPE) {
                const oldest = this._findOldestArchived(slot.type);
                if (oldest) {
                    this.deleteSlot(oldest);
                    archivedOfType.shift();
                } else {
                    break;
                }
            }

            const allArchived = this._getAllArchivedSlotIds();
            while (allArchived.length > LIMITS.ARCHIVED_TOTAL) {
                const oldest = this._findOldestArchived(null);
                if (oldest) {
                    this.deleteSlot(oldest);
                    allArchived.shift();
                } else {
                    break;
                }
            }

            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Slot archived:', sid);
            }

            return true;
        }

        unarchiveSlot(slotId) {
            const sid = String(slotId);
            const slot = this._slots.get(sid);
            if (!slot) return false;
            if (!slot.archived) return true;

            slot.archived = false;
            slot.archivedAt = null;
            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Slot unarchived:', sid);
            }

            return true;
        }

        _findOldestArchived(typeId = null) {
            let oldest = null;
            let oldestTime = Infinity;

            const source = typeId
                ? (this._typeIndex.get(typeId) || new Set())
                : this._slots.keys();

            for (const sid of source) {
                const slot = this._slots.get(sid);
                if (!slot || !slot.archived) continue;
                if (slot.archivedAt < oldestTime) {
                    oldestTime = slot.archivedAt;
                    oldest = sid;
                }
            }

            return oldest;
        }

        _getAllArchivedSlotIds() {
            const result = [];
            for (const [sid, slot] of this._slots) {
                if (slot.archived) result.push(sid);
            }
            return result;
        }

        // ============================================================
        // 8. ЗАПРОСЫ ПО ТИПУ
        // ============================================================

        getActiveSlotsByType(typeId) {
            const ids = this._typeIndex.get(typeId);
            if (!ids) return [];
            const result = [];
            for (const sid of ids) {
                const slot = this._slots.get(sid);
                if (slot && !slot.archived && slot.attachedWindows.length > 0) {
                    result.push(sid);
                }
            }
            return result;
        }

        getFreeActiveSlotsByType(typeId) {
            const ids = this._typeIndex.get(typeId);
            if (!ids) return [];
            const result = [];
            for (const sid of ids) {
                const slot = this._slots.get(sid);
                if (slot && !slot.archived && slot.attachedWindows.length === 0) {
                    result.push(sid);
                }
            }
            return result;
        }

        getArchivedSlotsByType(typeId) {
            const ids = this._typeIndex.get(typeId);
            if (!ids) return [];
            const result = [];
            for (const sid of ids) {
                const slot = this._slots.get(sid);
                if (slot && slot.archived) {
                    result.push({ sid, archivedAt: slot.archivedAt });
                }
            }
            result.sort((a, b) => b.archivedAt - a.archivedAt);
            return result.map(r => r.sid);
        }

        getAllSlotsByType(typeId) {
            const ids = this._typeIndex.get(typeId);
            if (!ids) return [];
            return Array.from(ids);
        }

        // ============================================================
        // 9. РАБОТА С ДАННЫМИ СЛОТА
        // ============================================================

        getSlotData(slotId) {
            const slot = this._slots.get(String(slotId));
            if (!slot) return null;
            return {
                metadata: this._deepCopy(slot.metadata),
                data: this._deepCopy(slot.data),
                uiState: this._deepCopy(slot.uiState)
            };
        }

        setSlotData(slotId, payload = {}) {
            const sid = String(slotId);
            const slot = this._slots.get(sid);
            if (!slot) {
                console.error('[DataBus] setSlotData: slot not found:', sid);
                return false;
            }

            if (slot._isUpdating) {
                if (!this._pendingUpdates.has(sid)) {
                    this._pendingUpdates.set(sid, []);
                }
                this._pendingUpdates.get(sid).push({
                    metadata: payload.metadata,
                    data: payload.data,
                    uiState: payload.uiState
                });

                if (this._debug) {
                    console.warn('[DataBus] setSlotData: queued for', sid);
                }
                return true;
            }

            if (payload.metadata !== undefined) {
                slot.metadata = this._deepCopy(payload.metadata);
            }
            if (payload.data !== undefined) {
                slot.data = this._deepCopy(payload.data);
            }
            if (payload.uiState !== undefined) {
                slot.uiState = this._deepCopy(payload.uiState);
            }

            slot.updatedAt = Date.now();
            this._markDirty();

            this._notifySlot(sid);

            return true;
        }

        // ============================================================
        // 10. ПРИВЯЗКА ОКОН
        // ============================================================

        attachWindowToSlot(slotId, windowId) {
            const sid = String(slotId);
            const wid = String(windowId);

            const slot = this._slots.get(sid);
            if (!slot) {
                console.error('[DataBus] attachWindowToSlot: slot not found:', sid);
                return false;
            }

            const currentSlotId = this._windowSlotIndex.get(wid);
            if (currentSlotId && currentSlotId !== sid) {
                this.detachWindowFromSlot(currentSlotId, wid);
            }

            if (!slot.attachedWindows.includes(windowId)) {
                slot.attachedWindows.push(windowId);
            }
            this._windowSlotIndex.set(wid, sid);

            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Window', wid, 'attached to slot', sid);
            }

            return true;
        }

        detachWindowFromSlot(slotId, windowId) {
            const sid = String(slotId);
            const wid = String(windowId);

            const slot = this._slots.get(sid);
            if (!slot) return false;

            const idx = slot.attachedWindows.indexOf(windowId);
            if (idx !== -1) {
                slot.attachedWindows.splice(idx, 1);
            }

            if (this._windowSlotIndex.get(wid) === sid) {
                this._windowSlotIndex.delete(wid);
            }

            this._markDirty();

            if (this._debug) {
                console.log('[DataBus] Window', wid, 'detached from slot', sid);
            }

            return true;
        }

        getSlotWindows(slotId) {
            const slot = this._slots.get(String(slotId));
            return slot ? slot.attachedWindows.slice() : [];
        }

        getWindowSlot(windowId) {
            return this._windowSlotIndex.get(String(windowId)) || null;
        }

        // ============================================================
        // 11. ПОДПИСКИ
        // ============================================================

        subscribeToSlot(slotId, callback) {
            const sid = String(slotId);
            if (!this._slotSubscribers.has(sid)) {
                this._slotSubscribers.set(sid, new Set());
            }
            this._slotSubscribers.get(sid).add(callback);

            return () => {
                const set = this._slotSubscribers.get(sid);
                if (set) {
                    set.delete(callback);
                    if (set.size === 0) {
                        this._slotSubscribers.delete(sid);
                    }
                }
            };
        }

        subscribeToType(typeId, callback) {
            if (!this._typeSubscribers.has(typeId)) {
                this._typeSubscribers.set(typeId, new Set());
            }
            this._typeSubscribers.get(typeId).add(callback);

            return () => {
                const set = this._typeSubscribers.get(typeId);
                if (set) {
                    set.delete(callback);
                    if (set.size === 0) {
                        this._typeSubscribers.delete(typeId);
                    }
                }
            };
        }

        // ============================================================
        // 12. NOTIFY (✅ FIX: итеративный цикл вместо рекурсии)
        // ============================================================

        /**
         * ✅ FIX v4.2.1:
         * Раньше после finally с pending-обновлениями вызывался _notifySlot(sid)
         * рекурсивно. Это могло привести к глубокой рекурсии, если подписчик
         * снова писал в слот.
         *
         * Теперь — while-loop с лимитом MAX_NOTIFY_DEPTH.
         * Pending-обновления обрабатываются в следующей итерации цикла.
         */
        _notifySlot(slotId) {
            const sid = String(slotId);

            let depth = 0;

            while (true) {
                const slot = this._slots.get(sid);
                if (!slot) return;

                if (depth >= MAX_NOTIFY_DEPTH) {
                    console.error(
                        `[DataBus] _notifySlot: depth exceeded (${MAX_NOTIFY_DEPTH}) for slot "${sid}" — ` +
                        `possible subscriber loop. Dropping pending updates.`
                    );
                    slot._isUpdating = false;
                    this._pendingUpdates.delete(sid);
                    return;
                }

                slot._isUpdating = true;

                const payload = {
                    slotId: sid,
                    type: slot.type,
                    metadata: this._deepCopy(slot.metadata),
                    data: this._deepCopy(slot.data),
                    uiState: this._deepCopy(slot.uiState)
                };

                try {
                    const slotSubs = this._slotSubscribers.get(sid);
                    if (slotSubs) {
                        for (const cb of slotSubs) {
                            try { cb(payload); } catch (e) {
                                console.error('[DataBus] Slot subscriber error:', e);
                            }
                        }
                    }

                    const typeSubs = this._typeSubscribers.get(slot.type);
                    if (typeSubs) {
                        for (const cb of typeSubs) {
                            try { cb(payload); } catch (e) {
                                console.error('[DataBus] Type subscriber error:', e);
                            }
                        }
                    }
                } finally {
                    slot._isUpdating = false;
                }

                // Проверяем: не накопились ли pending-обновления во время notify?
                const pending = this._pendingUpdates.get(sid);
                if (!pending || pending.length === 0) {
                    return; // всё чисто — выходим из цикла
                }

                this._pendingUpdates.delete(sid);

                const merged = {};
                let hasAny = false;
                for (const p of pending) {
                    if (p.metadata !== undefined) { merged.metadata = p.metadata; hasAny = true; }
                    if (p.data !== undefined) { merged.data = p.data; hasAny = true; }
                    if (p.uiState !== undefined) { merged.uiState = p.uiState; hasAny = true; }
                }

                if (!hasAny) {
                    return;
                }

                if (merged.metadata !== undefined) slot.metadata = this._deepCopy(merged.metadata);
                if (merged.data !== undefined) slot.data = this._deepCopy(merged.data);
                if (merged.uiState !== undefined) slot.uiState = this._deepCopy(merged.uiState);

                slot.updatedAt = Date.now();
                this._markDirty();

                depth++;
                // продолжаем while-loop → следующая итерация notify с новыми данными
            }
        }

        // ============================================================
        // 13. ЭКСПОРТ / ИМПОРТ
        // ============================================================

        exportSlots() {
            const slots = {};
            const archive = {};

            for (const [sid, slot] of this._slots) {
                const data = {
                    id: slot.id,
                    type: slot.type,
                    metadata: serializeSpecial(slot.metadata),
                    data: serializeSpecial(slot.data),
                    uiState: serializeSpecial(slot.uiState),
                    createdAt: slot.createdAt,
                    updatedAt: slot.updatedAt,
                    archivedAt: slot.archivedAt
                };
                if (slot.archived) {
                    archive[sid] = data;
                } else {
                    slots[sid] = data;
                }
            }

            return {
                slots,
                archive,
                counters: Object.fromEntries(this._slotCounters)
            };
        }

        importSlots(data) {
            if (!data || typeof data !== 'object') {
                console.error('[DataBus] importSlots: invalid data');
                return false;
            }

            this._isRestoring = true;

            try {
                this._slots.clear();
                this._typeIndex.clear();
                this._windowSlotIndex.clear();
                this._slotSubscribers.clear();
                this._typeSubscribers.clear();
                this._slotCounters.clear();
                this._pendingUpdates.clear();

                if (data.counters && typeof data.counters === 'object') {
                    for (const [typeId, counter] of Object.entries(data.counters)) {
                        this._slotCounters.set(typeId, counter);
                    }
                }

                if (data.slots && typeof data.slots === 'object') {
                    for (const [sid, s] of Object.entries(data.slots)) {
                        this._restoreSlot(sid, s, false);
                    }
                }

                if (data.archive && typeof data.archive === 'object') {
                    for (const [sid, s] of Object.entries(data.archive)) {
                        this._restoreSlot(sid, s, true);
                    }
                }

                this._isDirty = false;
                this._lastSaveTime = Date.now();
                this._version++;

                if (this._debug) {
                    console.log('[DataBus] Slots imported:',
                        this._slots.size, 'total');
                }

                return true;
            } catch (error) {
                console.error('[DataBus] importSlots error:', error);
                return false;
            } finally {
                this._isRestoring = false;
            }
        }

        _restoreSlot(slotId, source, archived) {
            const sid = String(slotId);
            const typeId = source.type || 'unknown';

            const slot = {
                id: sid,
                type: typeId,
                data: source.data !== undefined ? deserializeSpecial(source.data) : null,
                metadata: deserializeSpecial(source.metadata || {}),
                uiState: deserializeSpecial(source.uiState || {}),
                archived: !!archived,
                createdAt: source.createdAt || Date.now(),
                updatedAt: source.updatedAt || Date.now(),
                archivedAt: source.archivedAt || (archived ? Date.now() : null),
                attachedWindows: [],
                _isUpdating: false
            };

            this._slots.set(sid, slot);
            this._addToTypeIndex(typeId, sid);
        }

        // ============================================================
        // 14. СНАПШОТ (для истории)
        // ============================================================

        exportSnapshot() {
            return this.exportSlots();
        }

        importSnapshot(snapshot) {
            return this.importSlots(snapshot);
        }

        // ============================================================
        // 15. СТАТИСТИКА / ОТЛАДКА
        // ============================================================

        getStats() {
            let active = 0;
            let archived = 0;
            const byType = {};

            for (const [sid, slot] of this._slots) {
                if (!byType[slot.type]) {
                    byType[slot.type] = { active: 0, archived: 0 };
                }
                if (slot.archived) {
                    archived++;
                    byType[slot.type].archived++;
                } else {
                    active++;
                    byType[slot.type].active++;
                }
            }

            return {
                totalSlots: this._slots.size,
                activeSlots: active,
                archivedSlots: archived,
                byType,
                attachedWindows: this._windowSlotIndex.size,
                pendingUpdates: this._pendingUpdates.size,
                limits: { ...LIMITS },
                isDirty: this._isDirty,
                lastSaveTime: this._lastSaveTime,
                version: this._version
            };
        }

        isDirty() {
            return this._isDirty;
        }

        markSaved() {
            this._isDirty = false;
        }

        getVersion() {
            return this._version;
        }

        _markDirty() {
            this._isDirty = true;
            this._lastSaveTime = Date.now();
            this._version++;
        }

        clearAll() {
            this._slots.clear();
            this._typeIndex.clear();
            this._windowSlotIndex.clear();
            this._slotSubscribers.clear();
            this._typeSubscribers.clear();
            this._slotCounters.clear();
            this._pendingUpdates.clear();
            this._markDirty();
            console.log('[DataBus] Cleared all slots');
        }

        enableDebug() {
            this._debug = true;
            console.log('[DataBus] Debug mode enabled');
        }

        disableDebug() {
            this._debug = false;
            console.log('[DataBus] Debug mode disabled');
        }

        destroy() {
            this._slots.clear();
            this._typeIndex.clear();
            this._windowSlotIndex.clear();
            this._slotSubscribers.clear();
            this._typeSubscribers.clear();
            this._slotCounters.clear();
            this._pendingUpdates.clear();
            console.log('[DataBus] Destroyed');
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DataBus,
            LIMITS,
            serializeSpecial,
            deserializeSpecial
        };
    }

    if (typeof window !== 'undefined') {
        window.DataBus = DataBus;
        window.DataBus.LIMITS = LIMITS;
        console.log('[DataBus] Registered globally v4.2.1');
    }

})();