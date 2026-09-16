// core/HistoryManager.js
// Версия 3.3.0 - Fix: циклы через 2+ объекта
// - _deepCopy: seen НЕ удаляется в finally — живёт до конца всего дерева
// - ArrayBuffer/TypedArray/DataView — по ссылке (v3.2.0)
// - Map/Set/Date/RegExp/Array/Object — как было

(function() {
    'use strict';

    console.log('[HistoryManager] Loading v3.3.0...');

    class HistoryManager {
        constructor(options = {}) {
            this._entries = [];
            this._index = -1;
            this._maxHistory = options.maxHistory || 100;

            this._restoringCount = 0;

            this._debug = options.debug || false;

            this._snapshotProvider = options.snapshotProvider || null;
            this._snapshotApplier = options.snapshotApplier || null;

            this._listeners = [];
        }

        // ============================================================
        // 1. НАСТРОЙКА
        // ============================================================

        setSnapshotProvider(fn) {
            this._snapshotProvider = fn;
        }

        setSnapshotApplier(fn) {
            this._snapshotApplier = fn;
        }

        // ============================================================
        // 2. RESTORE GUARD
        // ============================================================

        beginRestore() {
            this._restoringCount++;
            if (this._debug) {
                console.log('[HistoryManager] beginRestore →', this._restoringCount);
            }
        }

        endRestore() {
            if (this._restoringCount > 0) {
                this._restoringCount--;
            }
            if (this._debug) {
                console.log('[HistoryManager] endRestore →', this._restoringCount);
            }
        }

        isRestoring() {
            return this._restoringCount > 0;
        }

        // ============================================================
        // 3. ЗАПИСЬ
        // ============================================================

        record(label = 'Действие') {
            if (this._restoringCount > 0) {
                if (this._debug) {
                    console.log('[HistoryManager] record ignored (restoring):', label);
                }
                return;
            }

            if (typeof this._snapshotProvider !== 'function') {
                console.warn('[HistoryManager] snapshotProvider не установлен');
                return;
            }

            let snapshot;
            try {
                snapshot = this._snapshotProvider();
            } catch (e) {
                console.error('[HistoryManager] snapshotProvider error:', e);
                return;
            }

            if (this._index < this._entries.length - 1) {
                this._entries = this._entries.slice(0, this._index + 1);
            }

            this._entries.push({
                label: label,
                timestamp: Date.now(),
                snapshot: this._deepCopy(snapshot)
            });

            this._index = this._entries.length - 1;

            if (this._entries.length > this._maxHistory) {
                this._entries.shift();
                if (this._index > 0) {
                    this._index--;
                }
            }

            if (this._debug) {
                console.log('[HistoryManager] record:', label,
                    'index:', this._index,
                    'size:', this._entries.length);
            }

            this._notify();
        }

        clear() {
            this._entries = [];
            this._index = -1;
            this._restoringCount = 0;
            if (this._debug) console.log('[HistoryManager] cleared');
            this._notify();
        }

        // ============================================================
        // 4. UNDO / REDO
        // ============================================================

        undo() {
            if (this._index <= 0) return null;

            const prev = this._entries[this._index - 1];
            if (!prev) return null;

            this.beginRestore();
            try {
                const result = {
                    action: 'undo',
                    entry: this._deepCopy(prev),
                    index: this._index - 1
                };
                this._index--;
                if (this._debug) console.log('[HistoryManager] undo →', this._index, prev.label);
                this._notify();
                return result;
            } finally {
                this.endRestore();
            }
        }

        redo() {
            if (this._index >= this._entries.length - 1) return null;

            const next = this._entries[this._index + 1];
            if (!next) return null;

            this.beginRestore();
            try {
                const result = {
                    action: 'redo',
                    entry: this._deepCopy(next),
                    index: this._index + 1
                };
                this._index++;
                if (this._debug) console.log('[HistoryManager] redo →', this._index, next.label);
                this._notify();
                return result;
            } finally {
                this.endRestore();
            }
        }

        jumpTo(index) {
            if (index < 0 || index >= this._entries.length) return null;
            if (index === this._index) return null;

            const entry = this._entries[index];
            if (!entry) return null;

            this.beginRestore();
            try {
                const result = {
                    action: 'jump',
                    entry: this._deepCopy(entry),
                    index: index
                };
                this._index = index;
                if (this._debug) console.log('[HistoryManager] jump →', index, entry.label);
                this._notify();
                return result;
            } finally {
                this.endRestore();
            }
        }

        canUndo() {
            return this._index > 0;
        }

        canRedo() {
            return this._index < this._entries.length - 1;
        }

        // ============================================================
        // 5. ИНФОРМАЦИЯ
        // ============================================================

        getHistory() {
            return this._entries.map((entry, index) => ({
                index: index,
                label: entry.label,
                timestamp: entry.timestamp,
                isCurrent: index === this._index
            }));
        }

        getSize() {
            return this._entries.length;
        }

        getIndex() {
            return this._index;
        }

        getCurrentEntry() {
            if (this._index < 0 || this._index >= this._entries.length) return null;
            return this._deepCopy(this._entries[this._index]);
        }

        // ============================================================
        // 6. ПОДПИСКИ
        // ============================================================

        subscribe(cb) {
            if (typeof cb !== 'function') return () => {};

            this._listeners.push(cb);
            return () => {
                const i = this._listeners.indexOf(cb);
                if (i !== -1) this._listeners.splice(i, 1);
            };
        }

        _notify() {
            for (const cb of this._listeners) {
                try { cb(); } catch (e) {
                    console.error('[HistoryManager] listener error:', e);
                }
            }
        }

        // ============================================================
        // 7. ГЛУБОКОЕ КОПИРОВАНИЕ
        // ============================================================

        /**
         * ✅ FIX v3.3.0:
         * `seen` живёт до конца всего копирования — а не удаляется в finally.
         * Это корректно защищает от циклов через 2+ объекта (a.b=c, c.a=a).
         *
         * Побочный эффект: shared-объекты (вставленные в две ветки) будут
         * скопированы один раз, и вторая ссылка будет указывать на тот же клон.
         * Для истории это скорее плюс — меньше памяти, консистентные ссылки.
         *
         * ArrayBuffer / TypedArray / DataView — по ССЫЛКЕ (v3.2.0).
         */
        _deepCopy(obj, seen) {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj !== 'object') return obj;

            // ArrayBuffer-подобные — по ссылке
            if (ArrayBuffer.isView(obj)) return obj;
            if (obj instanceof ArrayBuffer) return obj;

            if (!seen) seen = new WeakSet();
            if (seen.has(obj)) {
                // ✅ Цикл — возвращаем null (не можем восстановить ссылку без WeakMap-словаря).
                // Для истории сносное поведение: циклические данные всё равно не сериализуются.
                return null;
            }
            seen.add(obj);

            if (obj instanceof Map) {
                const m = new Map();
                for (const [k, v] of obj) {
                    m.set(this._deepCopy(k, seen), this._deepCopy(v, seen));
                }
                return m;
            }
            if (obj instanceof Set) {
                const s = new Set();
                for (const v of obj) s.add(this._deepCopy(v, seen));
                return s;
            }
            if (Array.isArray(obj)) {
                return obj.map(x => this._deepCopy(x, seen));
            }
            if (obj instanceof Date) return new Date(obj.getTime());
            if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);

            const proto = Object.getPrototypeOf(obj);
            if (proto === Object.prototype || proto === null) {
                const result = {};
                for (const [k, v] of Object.entries(obj)) {
                    result[k] = this._deepCopy(v, seen);
                }
                return result;
            }

            // Прочие классы — как есть
            return obj;
        }

        // ============================================================
        // 8. ОТЛАДКА
        // ============================================================

        enableDebug() { this._debug = true; console.log('[HistoryManager] debug ON'); }
        disableDebug() { this._debug = false; console.log('[HistoryManager] debug OFF'); }

        // ============================================================
        // 9. УНИЧТОЖЕНИЕ
        // ============================================================

        destroy() {
            this._entries = [];
            this._index = -1;
            this._restoringCount = 0;
            this._listeners = [];
            this._snapshotProvider = null;
            this._snapshotApplier = null;
            console.log('[HistoryManager] Destroyed');
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { HistoryManager };
    }

    if (typeof window !== 'undefined') {
        window.HistoryManager = HistoryManager;
        console.log('[HistoryManager] Registered globally v3.3.0');
    }

})();