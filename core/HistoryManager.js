// core/HistoryManager.js
// Версия 3.4.0

(function() {
    'use strict';

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

        setSnapshotProvider(fn) {
            this._snapshotProvider = fn;
        }

        setSnapshotApplier(fn) {
            this._snapshotApplier = fn;
        }

        beginRestore() {
            this._restoringCount++;
        }

        endRestore() {
            if (this._restoringCount > 0) {
                this._restoringCount--;
            }
        }

        isRestoring() {
            return this._restoringCount > 0;
        }

        record(label = 'Действие') {
            if (this._restoringCount > 0) {
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
                snapshot: deepClone(snapshot)
            });

            this._index = this._entries.length - 1;

            if (this._entries.length > this._maxHistory) {
                this._entries.shift();
                if (this._index > 0) {
                    this._index--;
                }
            }

            this._notify();
        }

        clear() {
            this._entries = [];
            this._index = -1;
            this._restoringCount = 0;
            this._notify();
        }

        undo() {
            if (this._index <= 0) return null;

            const prev = this._entries[this._index - 1];
            if (!prev) return null;

            this.beginRestore();
            try {
                const result = {
                    action: 'undo',
                    entry: deepClone(prev),
                    index: this._index - 1
                };
                this._index--;
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
                    entry: deepClone(next),
                    index: this._index + 1
                };
                this._index++;
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
                    entry: deepClone(entry),
                    index: index
                };
                this._index = index;
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
            return deepClone(this._entries[this._index]);
        }

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

        enableDebug() { this._debug = true; }
        disableDebug() { this._debug = false; }

        destroy() {
            this._entries = [];
            this._index = -1;
            this._restoringCount = 0;
            this._listeners = [];
            this._snapshotProvider = null;
            this._snapshotApplier = null;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { HistoryManager };
    }

    if (typeof window !== 'undefined') {
        window.HistoryManager = HistoryManager;
    }

})();