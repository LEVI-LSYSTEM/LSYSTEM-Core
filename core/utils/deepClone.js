// core/utils/deepClone.js
// Версия 1.0.0

(function() {
    'use strict';

    function deepClone(value, seen) {
        if (value === null || value === undefined) return value;

        var t = typeof value;
        if (t !== 'object' && t !== 'function') return value;
        if (t === 'function') return value;

        if (!seen) seen = new WeakSet();
        if (seen.has(value)) return null;
        seen.add(value);

        if (ArrayBuffer.isView(value)) {
            var viewCopy;
            if (value instanceof DataView) {
                viewCopy = new DataView(value.buffer.slice(0));
            } else {
                var bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                var copy = new Uint8Array(bytes.length);
                copy.set(bytes);
                viewCopy = new value.constructor(copy.buffer);
            }
            return viewCopy;
        }

        if (value instanceof ArrayBuffer) {
            return value.slice(0);
        }

        if (Array.isArray(value)) {
            var arr = [];
            for (var i = 0; i < value.length; i++) {
                arr.push(deepClone(value[i], seen));
            }
            return arr;
        }

        if (value instanceof Map) {
            var map = new Map();
            value.forEach(function(v, k) {
                map.set(deepClone(k, seen), deepClone(v, seen));
            });
            return map;
        }

        if (value instanceof Set) {
            var set = new Set();
            value.forEach(function(v) {
                set.add(deepClone(v, seen));
            });
            return set;
        }

        if (value instanceof Date) {
            return new Date(value.getTime());
        }

        if (value instanceof RegExp) {
            return new RegExp(value.source, value.flags);
        }

        var proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            var out = {};
            for (var key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                out[key] = deepClone(value[key], seen);
            }
            return out;
        }

        return value;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { deepClone: deepClone };
    }

    if (typeof window !== 'undefined') {
        window.deepClone = deepClone;
    }

})();