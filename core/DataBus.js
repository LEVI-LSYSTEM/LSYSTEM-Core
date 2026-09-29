// core/DataBus.js
// Версия 6.1.0

(function() {
    'use strict';

    var LIMITS = {
        ACTIVE_PER_TYPE: 4,
        ARCHIVED_PER_TYPE: 4,
        ARCHIVED_TOTAL: 16
    };

    var MAX_NOTIFY_DEPTH = 8;

    var SERIALIZE_TYPE_KEY = '__lsType';
    var SERIALIZE_VALUE_KEY = '__lsValue';

    function isPlainObject(obj) {
        if (obj === null || typeof obj !== 'object') return false;
        var proto = Object.getPrototypeOf(obj);
        return proto === Object.prototype || proto === null;
    }

    function bytesToBase64(bytes) {
        if (typeof btoa === 'function') {
            var binary = '';
            var chunkSize = 0x8000;
            for (var i = 0; i < bytes.length; i += chunkSize) {
                var chunk = bytes.subarray(i, i + chunkSize);
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
            var binary = atob(b64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(b64, 'base64'));
        }
        return new Uint8Array(0);
    }

    function serializeSpecial(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        if (ArrayBuffer.isView(obj)) {
            var ctor = obj.constructor.name;
            var bytes = new Uint8Array(
                obj.buffer,
                obj.byteOffset || 0,
                obj.byteLength
            );
            var out = {};
            out[SERIALIZE_TYPE_KEY] = ctor;
            out[SERIALIZE_VALUE_KEY] = bytesToBase64(bytes);
            return out;
        }
        if (obj instanceof ArrayBuffer) {
            var out2 = {};
            out2[SERIALIZE_TYPE_KEY] = 'ArrayBuffer';
            out2[SERIALIZE_VALUE_KEY] = bytesToBase64(new Uint8Array(obj));
            return out2;
        }
        if (obj instanceof Map) {
            var entries = [];
            obj.forEach(function(v, k) {
                entries.push([serializeSpecial(k), serializeSpecial(v)]);
            });
            var out3 = {};
            out3[SERIALIZE_TYPE_KEY] = 'Map';
            out3[SERIALIZE_VALUE_KEY] = entries;
            return out3;
        }
        if (obj instanceof Set) {
            var values = [];
            obj.forEach(function(v) { values.push(serializeSpecial(v)); });
            var out4 = {};
            out4[SERIALIZE_TYPE_KEY] = 'Set';
            out4[SERIALIZE_VALUE_KEY] = values;
            return out4;
        }
        if (obj instanceof Date) {
            var out5 = {};
            out5[SERIALIZE_TYPE_KEY] = 'Date';
            out5[SERIALIZE_VALUE_KEY] = obj.toISOString();
            return out5;
        }
        if (obj instanceof RegExp) {
            var out6 = {};
            out6[SERIALIZE_TYPE_KEY] = 'RegExp';
            out6[SERIALIZE_VALUE_KEY] = { source: obj.source, flags: obj.flags };
            return out6;
        }
        if (Array.isArray(obj)) {
            return obj.map(serializeSpecial);
        }
        if (isPlainObject(obj)) {
            var result = {};
            for (var key in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
                result[key] = serializeSpecial(obj[key]);
            }
            return result;
        }
        return undefined;
    }

    function deserializeSpecial(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map(deserializeSpecial);
        }

        var t = obj[SERIALIZE_TYPE_KEY];
        if (t !== undefined) {
            var v = obj[SERIALIZE_VALUE_KEY];

            switch (t) {
                case 'Map': {
                    var m = new Map();
                    var arr = v || [];
                    for (var i = 0; i < arr.length; i++) {
                        m.set(deserializeSpecial(arr[i][0]), deserializeSpecial(arr[i][1]));
                    }
                    return m;
                }
                case 'Set': {
                    var s = new Set();
                    var arr2 = v || [];
                    for (var j = 0; j < arr2.length; j++) {
                        s.add(deserializeSpecial(arr2[j]));
                    }
                    return s;
                }
                case 'Date':
                    return new Date(v);
                case 'RegExp':
                    return new RegExp((v && v.source) || '', (v && v.flags) || '');

                case 'ArrayBuffer': {
                    var bytes = (typeof v === 'string')
                        ? base64ToBytes(v)
                        : new Uint8Array(v || []);
                    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                }

                default: {
                    if (typeof globalThis[t] === 'function') {
                        try {
                            var bytes2 = (typeof v === 'string')
                                ? base64ToBytes(v)
                                : new Uint8Array(v || []);

                            var copy = new Uint8Array(bytes2.length);
                            copy.set(bytes2);

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
            var result = {};
            for (var key in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
                result[key] = deserializeSpecial(obj[key]);
            }
            return result;
        }

        return obj;
    }

    class DataBus {
        constructor(options) {
            options = options || {};

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

            this._notifyQueue = [];
            this._notifyFlushing = false;

            this._debug = !!options.debug;
        }

        // ============================================================
        // 1. ID GENERATION
        // ============================================================

        _generateSlotId(typeId) {
            var counter = (this._slotCounters.get(typeId) || 0) + 1;
            this._slotCounters.set(typeId, counter);
            return typeId + '-' + counter;
        }

        // ============================================================
        // 2. TYPE INDEX
        // ============================================================

        _addToTypeIndex(typeId, slotId) {
            if (!this._typeIndex.has(typeId)) {
                this._typeIndex.set(typeId, new Set());
            }
            this._typeIndex.get(typeId).add(slotId);
        }

        _removeFromTypeIndex(typeId, slotId) {
            var set = this._typeIndex.get(typeId);
            if (!set) return;
            set.delete(slotId);
            if (set.size === 0) {
                this._typeIndex.delete(typeId);
            }
        }

        // ============================================================
        // 3. SLOT CRUD
        // ============================================================

        createSlot(typeId, options) {
            options = options || {};

            if (!typeId) {
                console.error('[DataBus] createSlot: typeId is required');
                return null;
            }

            var slotId = options.slotId || this._generateSlotId(typeId);

            if (this._slots.has(slotId)) {
                console.warn('[DataBus] createSlot: slot already exists:', slotId);
                return slotId;
            }

            var activeCount = this.getActiveSlotsByType(typeId).length
                + this.getFreeActiveSlotsByType(typeId).length;

            if (activeCount >= LIMITS.ACTIVE_PER_TYPE) {
                console.warn(
                    '[DataBus] createSlot: active limit reached for type',
                    typeId,
                    '(' + activeCount + '/' + LIMITS.ACTIVE_PER_TYPE + ')'
                );
                return null;
            }

            var slot = {
                id: slotId,
                type: typeId,
                data: options.data !== undefined ? deepClone(options.data) : null,
                metadata: deepClone(options.metadata || {}),
                uiState: deepClone(options.uiState || {}),
                archived: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                archivedAt: null,
                attachedWindows: new Set()
            };

            this._slots.set(slotId, slot);
            this._addToTypeIndex(typeId, slotId);
            this._markDirty();

            return slotId;
        }

        getSlot(slotId) {
            return this._slots.get(String(slotId)) || null;
        }

        hasSlot(slotId) {
            return this._slots.has(String(slotId));
        }

        deleteSlot(slotId) {
            var sid = String(slotId);
            var slot = this._slots.get(sid);
            if (!slot) return false;

            slot.attachedWindows.forEach(function(windowId) {
                this._windowSlotIndex.delete(String(windowId));
            }, this);

            this._slots.delete(sid);
            this._removeFromTypeIndex(slot.type, sid);
            this._slotSubscribers.delete(sid);
            this._pendingUpdates.delete(sid);

            this._markDirty();
            return true;
        }

        archiveSlot(slotId) {
            var sid = String(slotId);
            var slot = this._slots.get(sid);
            if (!slot) return false;
            if (slot.archived) return true;

            slot.archived = true;
            slot.archivedAt = Date.now();

            var archivedOfType = this.getArchivedSlotsByType(slot.type);
            while (archivedOfType.length > LIMITS.ARCHIVED_PER_TYPE) {
                var oldest = this._findOldestArchived(slot.type);
                if (!oldest) break;
                this.deleteSlot(oldest);
                archivedOfType.shift();
            }

            var allArchived = this._getAllArchivedSlotIds();
            while (allArchived.length > LIMITS.ARCHIVED_TOTAL) {
                var oldest2 = this._findOldestArchived(null);
                if (!oldest2) break;
                this.deleteSlot(oldest2);
                allArchived.shift();
            }

            this._markDirty();
            return true;
        }

        unarchiveSlot(slotId) {
            var sid = String(slotId);
            var slot = this._slots.get(sid);
            if (!slot) return false;
            if (!slot.archived) return true;

            slot.archived = false;
            slot.archivedAt = null;
            this._markDirty();
            return true;
        }

        _findOldestArchived(typeId) {
            var oldest = null;
            var oldestTime = Infinity;

            var source = typeId
                ? (this._typeIndex.get(typeId) || new Set())
                : this._slots.keys();

            var self = this;
            var iterate = function(sid) {
                var slot = self._slots.get(sid);
                if (!slot || !slot.archived) return;
                if (slot.archivedAt < oldestTime) {
                    oldestTime = slot.archivedAt;
                    oldest = sid;
                }
            };

            source.forEach(iterate);

            return oldest;
        }

        _getAllArchivedSlotIds() {
            var result = [];
            this._slots.forEach(function(slot, sid) {
                if (slot.archived) result.push(sid);
            });
            return result;
        }

        // ============================================================
        // 4. QUERIES BY TYPE
        // ============================================================

        getActiveSlotsByType(typeId) {
            var ids = this._typeIndex.get(typeId);
            if (!ids) return [];

            var result = [];
            var self = this;
            ids.forEach(function(sid) {
                var slot = self._slots.get(sid);
                if (slot && !slot.archived && slot.attachedWindows.size > 0) {
                    result.push(sid);
                }
            });
            return result;
        }

        getFreeActiveSlotsByType(typeId) {
            var ids = this._typeIndex.get(typeId);
            if (!ids) return [];

            var result = [];
            var self = this;
            ids.forEach(function(sid) {
                var slot = self._slots.get(sid);
                if (slot && !slot.archived && slot.attachedWindows.size === 0) {
                    result.push(sid);
                }
            });
            return result;
        }

        getArchivedSlotsByType(typeId) {
            var ids = this._typeIndex.get(typeId);
            if (!ids) return [];

            var result = [];
            var self = this;
            ids.forEach(function(sid) {
                var slot = self._slots.get(sid);
                if (slot && slot.archived) {
                    result.push({ sid: sid, archivedAt: slot.archivedAt });
                }
            });

            result.sort(function(a, b) { return b.archivedAt - a.archivedAt; });

            var out = [];
            for (var i = 0; i < result.length; i++) out.push(result[i].sid);
            return out;
        }

        getAllSlotsByType(typeId) {
            var ids = this._typeIndex.get(typeId);
            if (!ids) return [];
            return Array.from(ids);
        }

        // ============================================================
        // 5. SLOT DATA — READ
        // ============================================================

        getSlotData(slotId) {
            var slot = this._slots.get(String(slotId));
            if (!slot) return null;
            return {
                metadata: deepClone(slot.metadata),
                data: deepClone(slot.data),
                uiState: deepClone(slot.uiState)
            };
        }

        // ============================================================
        // 6. SLOT DATA — WRITE
        // ============================================================

        setSlotData(slotId, payload) {
            payload = payload || {};
            var sid = String(slotId);
            var slot = this._slots.get(sid);
            if (!slot) {
                console.error('[DataBus] setSlotData: slot not found:', sid);
                return false;
            }

            if (this._notifyFlushing) {
                if (!this._pendingUpdates.has(sid)) {
                    this._pendingUpdates.set(sid, []);
                }
                this._pendingUpdates.get(sid).push({
                    metadata: payload.metadata,
                    data: payload.data,
                    uiState: payload.uiState
                });
                return true;
            }

            if (payload.metadata !== undefined) {
                slot.metadata = deepClone(payload.metadata);
            }
            if (payload.data !== undefined) {
                slot.data = deepClone(payload.data);
            }
            if (payload.uiState !== undefined) {
                slot.uiState = deepClone(payload.uiState);
            }

            slot.updatedAt = Date.now();
            this._markDirty();

            this._enqueueNotify(sid);

            return true;
        }

        // ============================================================
        // 7. WINDOW ATTACHMENT
        // ============================================================

        attachWindowToSlot(slotId, windowId) {
            var sid = String(slotId);
            var wid = String(windowId);

            var slot = this._slots.get(sid);
            if (!slot) {
                console.error('[DataBus] attachWindowToSlot: slot not found:', sid);
                return false;
            }

            var currentSlotId = this._windowSlotIndex.get(wid);
            if (currentSlotId && currentSlotId !== sid) {
                this.detachWindowFromSlot(currentSlotId, wid);
            }

            slot.attachedWindows.add(wid);
            this._windowSlotIndex.set(wid, sid);

            this._markDirty();
            return true;
        }

        detachWindowFromSlot(slotId, windowId) {
            var sid = String(slotId);
            var wid = String(windowId);

            var slot = this._slots.get(sid);
            if (!slot) return false;

            slot.attachedWindows.delete(wid);

            if (this._windowSlotIndex.get(wid) === sid) {
                this._windowSlotIndex.delete(wid);
            }

            this._markDirty();
            return true;
        }

        getSlotWindows(slotId) {
            var slot = this._slots.get(String(slotId));
            if (!slot) return [];
            return Array.from(slot.attachedWindows);
        }

        getWindowSlot(windowId) {
            return this._windowSlotIndex.get(String(windowId)) || null;
        }

        // ============================================================
        // 8. SUBSCRIPTIONS
        // ============================================================

        subscribeToSlot(slotId, callback) {
            var sid = String(slotId);
            if (!this._slotSubscribers.has(sid)) {
                this._slotSubscribers.set(sid, new Set());
            }
            this._slotSubscribers.get(sid).add(callback);

            var self = this;
            return function() {
                var set = self._slotSubscribers.get(sid);
                if (!set) return;
                set.delete(callback);
                if (set.size === 0) {
                    self._slotSubscribers.delete(sid);
                }
            };
        }

        subscribeToType(typeId, callback) {
            if (!this._typeSubscribers.has(typeId)) {
                this._typeSubscribers.set(typeId, new Set());
            }
            this._typeSubscribers.get(typeId).add(callback);

            var self = this;
            return function() {
                var set = self._typeSubscribers.get(typeId);
                if (!set) return;
                set.delete(callback);
                if (set.size === 0) {
                    self._typeSubscribers.delete(typeId);
                }
            };
        }

        // ============================================================
        // 9. NOTIFY QUEUE
        // ============================================================

        _enqueueNotify(slotId) {
            var sid = String(slotId);

            if (this._notifyQueue.indexOf(sid) === -1) {
                this._notifyQueue.push(sid);
            }

            if (this._notifyFlushing) return;

            this._flushNotify();
        }

        _flushNotify() {
            this._notifyFlushing = true;

            try {
                var iterations = 0;

                while (this._notifyQueue.length > 0) {
                    iterations++;
                    if (iterations > MAX_NOTIFY_DEPTH) {
                        console.error(
                            '[DataBus] _flushNotify: depth exceeded (' + MAX_NOTIFY_DEPTH + ') — ' +
                            'possible subscriber loop. Dropping pending updates.'
                        );
                        this._notifyQueue = [];
                        this._pendingUpdates.clear();
                        return;
                    }

                    var sid = this._notifyQueue.shift();
                    var slot = this._slots.get(sid);
                    if (!slot) continue;

                    var payload = {
                        slotId: sid,
                        type: slot.type,
                        metadata: deepClone(slot.metadata),
                        data: deepClone(slot.data),
                        uiState: deepClone(slot.uiState)
                    };

                    this._dispatchNotify(sid, slot, payload);

                    var pending = this._pendingUpdates.get(sid);
                    if (!pending || pending.length === 0) continue;

                    this._pendingUpdates.delete(sid);

                    var merged = {};
                    var hasAny = false;
                    for (var i = 0; i < pending.length; i++) {
                        var p = pending[i];
                        if (p.metadata !== undefined) { merged.metadata = p.metadata; hasAny = true; }
                        if (p.data !== undefined) { merged.data = p.data; hasAny = true; }
                        if (p.uiState !== undefined) { merged.uiState = p.uiState; hasAny = true; }
                    }

                    if (!hasAny) continue;

                    if (merged.metadata !== undefined) slot.metadata = deepClone(merged.metadata);
                    if (merged.data !== undefined) slot.data = deepClone(merged.data);
                    if (merged.uiState !== undefined) slot.uiState = deepClone(merged.uiState);

                    slot.updatedAt = Date.now();
                    this._markDirty();

                    if (this._notifyQueue.indexOf(sid) === -1) {
                        this._notifyQueue.push(sid);
                    }
                }
            } finally {
                this._notifyFlushing = false;
            }
        }

        _dispatchNotify(sid, slot, payload) {
            var slotSubs = this._slotSubscribers.get(sid);
            if (slotSubs) {
                slotSubs.forEach(function(cb) {
                    try { cb(payload); } catch (e) {
                        console.error('[DataBus] Slot subscriber error:', e);
                    }
                });
            }

            var typeSubs = this._typeSubscribers.get(slot.type);
            if (typeSubs) {
                typeSubs.forEach(function(cb) {
                    try { cb(payload); } catch (e) {
                        console.error('[DataBus] Type subscriber error:', e);
                    }
                });
            }
        }

        // ============================================================
        // 10. EXPORT / IMPORT
        // ============================================================

        exportSlots() {
            var slots = {};
            var archive = {};

            this._slots.forEach(function(slot, sid) {
                var data = {
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
            });

            var counters = {};
            this._slotCounters.forEach(function(value, key) {
                counters[key] = value;
            });

            return {
                slots: slots,
                archive: archive,
                counters: counters
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
                this._notifyQueue = [];

                if (data.counters && typeof data.counters === 'object') {
                    for (var typeId in data.counters) {
                        if (!Object.prototype.hasOwnProperty.call(data.counters, typeId)) continue;
                        this._slotCounters.set(typeId, data.counters[typeId]);
                    }
                }

                if (data.slots && typeof data.slots === 'object') {
                    for (var sid in data.slots) {
                        if (!Object.prototype.hasOwnProperty.call(data.slots, sid)) continue;
                        this._restoreSlot(sid, data.slots[sid], false);
                    }
                }

                if (data.archive && typeof data.archive === 'object') {
                    for (var sid2 in data.archive) {
                        if (!Object.prototype.hasOwnProperty.call(data.archive, sid2)) continue;
                        this._restoreSlot(sid2, data.archive[sid2], true);
                    }
                }

                this._isDirty = false;
                this._lastSaveTime = Date.now();
                this._version++;

                return true;
            } catch (error) {
                console.error('[DataBus] importSlots error:', error);
                return false;
            } finally {
                this._isRestoring = false;
            }
        }

        _restoreSlot(slotId, source, archived) {
            var sid = String(slotId);
            var typeId = source.type || 'unknown';

            var slot = {
                id: sid,
                type: typeId,
                data: source.data !== undefined ? deserializeSpecial(source.data) : null,
                metadata: deserializeSpecial(source.metadata || {}),
                uiState: deserializeSpecial(source.uiState || {}),
                archived: !!archived,
                createdAt: source.createdAt || Date.now(),
                updatedAt: source.updatedAt || Date.now(),
                archivedAt: source.archivedAt || (archived ? Date.now() : null),
                attachedWindows: new Set()
            };

            this._slots.set(sid, slot);
            this._addToTypeIndex(typeId, sid);
        }

        exportSnapshot() {
            return this.exportSlots();
        }

        importSnapshot(snapshot) {
            return this.importSlots(snapshot);
        }

        // ============================================================
        // 11. RECONCILE
        // ============================================================

        ensureSlotForWindow(slotId, typeId) {
            var sid = String(slotId);
            if (this._slots.has(sid)) return sid;

            var type = typeId || sid.replace(/-\d+$/, '') || 'unknown';
            var activeCount = this.getActiveSlotsByType(type).length
                + this.getFreeActiveSlotsByType(type).length;

            if (activeCount >= LIMITS.ACTIVE_PER_TYPE) {
                console.warn('[DataBus] ensureSlotForWindow: active limit reached for type', type);
                return null;
            }

            var slot = {
                id: sid,
                type: type,
                data: null,
                metadata: {},
                uiState: {},
                archived: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                archivedAt: null,
                attachedWindows: new Set()
            };

            this._slots.set(sid, slot);
            this._addToTypeIndex(type, sid);

            var match = sid.match(/-(\d+)$/);
            if (match) {
                var num = parseInt(match[1], 10);
                if (!isNaN(num)) {
                    var cur = this._slotCounters.get(type) || 0;
                    if (num > cur) this._slotCounters.set(type, num);
                }
            }

            this._markDirty();
            return sid;
        }

        // ============================================================
        // 12. STATS / DIRTY
        // ============================================================

        getStats() {
            var active = 0;
            var archived = 0;
            var byType = {};

            this._slots.forEach(function(slot) {
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
            });

            return {
                totalSlots: this._slots.size,
                activeSlots: active,
                archivedSlots: archived,
                byType: byType,
                attachedWindows: this._windowSlotIndex.size,
                pendingUpdates: this._pendingUpdates.size,
                notifyQueue: this._notifyQueue.length,
                limits: {
                    ACTIVE_PER_TYPE: LIMITS.ACTIVE_PER_TYPE,
                    ARCHIVED_PER_TYPE: LIMITS.ARCHIVED_PER_TYPE,
                    ARCHIVED_TOTAL: LIMITS.ARCHIVED_TOTAL
                },
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

        // ============================================================
        // 13. LIFECYCLE
        // ============================================================

        clearAll() {
            this._slots.clear();
            this._typeIndex.clear();
            this._windowSlotIndex.clear();
            this._slotSubscribers.clear();
            this._typeSubscribers.clear();
            this._slotCounters.clear();
            this._pendingUpdates.clear();
            this._notifyQueue = [];
            this._markDirty();
        }

        enableDebug() { this._debug = true; }
        disableDebug() { this._debug = false; }

        destroy() {
            this._slots.clear();
            this._typeIndex.clear();
            this._windowSlotIndex.clear();
            this._slotSubscribers.clear();
            this._typeSubscribers.clear();
            this._slotCounters.clear();
            this._pendingUpdates.clear();
            this._notifyQueue = [];
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DataBus: DataBus,
            LIMITS: LIMITS,
            serializeSpecial: serializeSpecial,
            deserializeSpecial: deserializeSpecial
        };
    }

    if (typeof window !== 'undefined') {
        window.DataBus = DataBus;
        window.DataBus.LIMITS = LIMITS;
    }

})();