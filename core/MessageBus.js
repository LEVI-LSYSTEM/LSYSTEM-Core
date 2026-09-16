// core/MessageBus.js
// Версия 2.4.0 - Fix: защита от рекурсии в _deliverToAll / _deliverToTarget
// - _deliveryDepth / MAX_DELIVERY_DEPTH = 16
// - warn + стоп при превышении
// - onRequest/send/sendToType/sendToTypeAndSlot — без изменений
// - v2.3.1: onRequest handler (без изменений)

(function() {
    'use strict';

    console.log('[MessageBus] Loading v2.4.0...');

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================

    var DEFAULT_REQUEST_TIMEOUT = 10000;
    var REQUEST_SUFFIX = ':request';
    var RESPONSE_SUFFIX = ':response';
    var MAX_DELIVERY_DEPTH = 16;

    function generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    // ============================================================
    // КЛАСС
    // ============================================================

    class MessageBus {
        constructor(options = {}) {
            this._subscribers = new Map();
            this._globalSubscribers = new Map();
            this._history = [];
            this._maxHistory = options.maxHistory || 100;
            this._debug = options.debug || false;

            this._layoutManager = options.layoutManager || null;

            this._typeRegistry = new Map();
            this._slotRegistry = new Map();

            this._layoutListener = null;

            this._pendingRequests = new Map();
            this._requestUnsubscribes = new Map();
            this._defaultRequestTimeout = options.requestTimeout || DEFAULT_REQUEST_TIMEOUT;

            this._requestHandlers = new Set();

            // ✅ FIX: глубина синхронной доставки
            this._deliveryDepth = 0;

            console.log('[MessageBus] Initialized v2.4.0');
        }

        // ============================================================
        // 0. ПРИВЯЗКА LAYOUTMANAGER
        // ============================================================

        setLayoutManager(layoutManager) {
            if (this._layoutListener) {
                try {
                    document.removeEventListener('layout-changed', this._layoutListener);
                } catch (e) {}
                this._layoutListener = null;
            }

            this._layoutManager = layoutManager;
            this._rebuildRegistries();

            this._layoutListener = () => {
                this._rebuildRegistries();
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('layout-changed', this._layoutListener);
            }

            if (this._debug) {
                console.log('[MessageBus] LayoutManager set, registries rebuilt');
            }

            return () => {
                if (this._layoutListener) {
                    try {
                        document.removeEventListener('layout-changed', this._layoutListener);
                    } catch (e) {}
                    this._layoutListener = null;
                }
            };
        }

        _rebuildRegistries() {
            this._typeRegistry.clear();
            this._slotRegistry.clear();

            if (!this._layoutManager) return;

            const windows = this._layoutManager.getWindows();

            for (const w of windows) {
                const wid = w.id;
                const type = w.type;
                const slotId = w.slotId;

                if (!this._typeRegistry.has(type)) {
                    this._typeRegistry.set(type, new Set());
                }
                this._typeRegistry.get(type).add(wid);

                if (slotId) {
                    if (!this._slotRegistry.has(slotId)) {
                        this._slotRegistry.set(slotId, new Set());
                    }
                    this._slotRegistry.get(slotId).add(wid);
                }
            }

            if (this._debug) {
                console.log('[MessageBus] Registries rebuilt:',
                    'types:', this._typeRegistry.size,
                    'slots:', this._slotRegistry.size);
            }
        }

        // ============================================================
        // 0.1. ПОИСК ОКОН ПО ТИПУ / СЛОТУ
        // ============================================================

        _getWindowsByType(typeId) {
            if (!this._layoutManager) {
                const set = this._typeRegistry.get(typeId);
                return set ? Array.from(set) : [];
            }

            if (typeof this._layoutManager.getVisibleWindowsByType === 'function'
                && typeof this._layoutManager.getMinimizedWindowsByType === 'function') {

                const visible = this._layoutManager
                    .getVisibleWindowsByType(typeId)
                    .map(w => w.id);

                const minimized = this._layoutManager
                    .getMinimizedWindowsByType(typeId)
                    .map(w => w.id);

                return [...visible, ...minimized];
            }

            return this._layoutManager
                .getWindows()
                .filter(w => w.type === typeId)
                .map(w => w.id);
        }

        _getWindowsByTypeAndSlot(typeId, slotId) {
            if (!this._layoutManager) {
                const set = this._slotRegistry.get(slotId);
                return set ? Array.from(set) : [];
            }

            if (typeof this._layoutManager.getVisibleWindowsByType === 'function'
                && typeof this._layoutManager.getMinimizedWindowsByType === 'function') {

                const visible = this._layoutManager
                    .getVisibleWindowsByType(typeId)
                    .filter(w => w.slotId === slotId)
                    .map(w => w.id);

                const minimized = this._layoutManager
                    .getMinimizedWindowsByType(typeId)
                    .filter(w => w.slotId === slotId)
                    .map(w => w.id);

                return [...visible, ...minimized];
            }

            return this._layoutManager
                .getWindows()
                .filter(w => w.type === typeId && w.slotId === slotId)
                .map(w => w.id);
        }

        // ============================================================
        // 1. ОТПРАВКА (LOW-LEVEL)
        // ============================================================

        send(senderId, channel, data, targetId = null) {
            if (!senderId) {
                console.error('[MessageBus] senderId is required');
                return false;
            }

            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] channel must be a non-empty string');
                return false;
            }

            if (targetId !== null && String(targetId) === String(senderId)) {
                if (this._debug) {
                    console.warn('[MessageBus] send: targetId === senderId, ignored');
                }
                return false;
            }

            const message = {
                id: generateId(),
                timestamp: Date.now(),
                senderId: senderId,
                channel: channel,
                data: data,
                targetId: targetId
            };

            this._pushToHistory(message);

            if (this._debug) {
                console.log(`[MessageBus] 📤 ${senderId} -> ${targetId || 'all'} [${channel}]:`, data);
            }

            if (targetId !== null) {
                this._deliverToTarget(targetId, message);
            } else {
                this._deliverToAll(message);
            }

            return true;
        }

        sendToType(senderId, typeId, channel, data) {
            if (!senderId) {
                console.error('[MessageBus] senderId is required');
                return false;
            }
            if (!typeId) {
                console.error('[MessageBus] typeId is required');
                return false;
            }
            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] channel must be a non-empty string');
                return false;
            }

            const message = {
                id: generateId(),
                timestamp: Date.now(),
                senderId: senderId,
                channel: channel,
                data: data,
                targetType: typeId,
                targetId: null
            };

            this._pushToHistory(message);

            const targetIds = this._getWindowsByType(typeId);

            if (this._debug) {
                console.log(`[MessageBus] 📤 ${senderId} -> type:${typeId} [${channel}]:`,
                    data, '→ targets:', targetIds);
            }

            let delivered = 0;
            for (const targetId of targetIds) {
                if (String(targetId) === String(senderId)) continue;
                this._deliverToTarget(targetId, message);
                delivered++;
            }

            return delivered > 0 || targetIds.length === 0;
        }

        sendToTypeAndSlot(senderId, typeId, slotId, channel, data) {
            if (!senderId) {
                console.error('[MessageBus] senderId is required');
                return false;
            }
            if (!typeId) {
                console.error('[MessageBus] typeId is required');
                return false;
            }
            if (!slotId) {
                console.error('[MessageBus] slotId is required');
                return false;
            }
            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] channel must be a non-empty string');
                return false;
            }

            const message = {
                id: generateId(),
                timestamp: Date.now(),
                senderId: senderId,
                channel: channel,
                data: data,
                targetType: typeId,
                targetSlot: slotId,
                targetId: null
            };

            this._pushToHistory(message);

            const targetIds = this._getWindowsByTypeAndSlot(typeId, slotId);

            if (this._debug) {
                console.log(`[MessageBus] 📤 ${senderId} -> type:${typeId} slot:${slotId} [${channel}]:`,
                    data, '→ targets:', targetIds);
            }

            let delivered = 0;
            for (const targetId of targetIds) {
                if (String(targetId) === String(senderId)) continue;
                this._deliverToTarget(targetId, message);
                delivered++;
            }

            return delivered > 0 || targetIds.length === 0;
        }

        sendToAll(senderId, channel, data) {
            return this.send(senderId, channel, data, null);
        }

        // ============================================================
        // 1.1. RPC — ЗАПРОС
        // ============================================================

        request(senderId, targetId, channel, data = {}, options = {}) {
            return new Promise((resolve, reject) => {
                if (!senderId) {
                    reject(new Error('[MessageBus] request: senderId is required'));
                    return;
                }
                if (!targetId) {
                    reject(new Error('[MessageBus] request: targetId is required'));
                    return;
                }
                if (!channel || typeof channel !== 'string') {
                    reject(new Error('[MessageBus] request: channel must be a non-empty string'));
                    return;
                }

                const requestId = generateId();
                const timeoutMs = (typeof options.timeout === 'number' && options.timeout > 0)
                    ? options.timeout
                    : this._defaultRequestTimeout;

                const requestChannel = channel + REQUEST_SUFFIX;
                const responseChannel = channel + RESPONSE_SUFFIX;

                const self = this;

                const unsub = this.subscribe(
                    senderId,
                    responseChannel,
                    (fromSenderId, responseData) => {
                        if (!responseData) return;
                        if (String(responseData.requestId) !== String(requestId)) return;

                        const pending = self._pendingRequests.get(requestId);
                        if (!pending) return;

                        self._cleanupRequest(requestId);

                        if (responseData.ok === false) {
                            const err = new Error(
                                responseData.error || 'RPC request failed'
                            );
                            err.code = 'RPC_ERROR';
                            err.originalError = responseData.error;
                            reject(err);
                        } else {
                            resolve(responseData.result);
                        }
                    }
                );

                const timer = setTimeout(() => {
                    const pending = self._pendingRequests.get(requestId);
                    if (!pending) return;

                    self._cleanupRequest(requestId);

                    const err = new Error(
                        `RPC request timeout (${timeoutMs}ms): ${channel} → ${targetId}`
                    );
                    err.code = 'RPC_TIMEOUT';
                    err.channel = channel;
                    err.targetId = targetId;
                    reject(err);
                }, timeoutMs);

                this._pendingRequests.set(requestId, {
                    resolve: resolve,
                    reject: reject,
                    timer: timer,
                    senderId: senderId,
                    targetId: targetId,
                    channel: channel,
                    createdAt: Date.now()
                });
                this._requestUnsubscribes.set(requestId, unsub);

                const payload = {
                    requestId: requestId,
                    ...data
                };

                const sent = this.send(senderId, requestChannel, payload, targetId);

                if (!sent) {
                    this._cleanupRequest(requestId);
                    const err = new Error(
                        `RPC request not sent: ${channel} → ${targetId}`
                    );
                    err.code = 'RPC_SEND_FAILED';
                    reject(err);
                    return;
                }

                if (this._debug) {
                    console.log(
                        `[MessageBus] ⏳ RPC request ${requestId}: ${senderId} → ${targetId} [${channel}]`
                    );
                }
            });
        }

        // ============================================================
        // 1.2. RPC — ОТВЕТ
        // ============================================================

        respond(senderId, requestId, channel, response, targetId = null) {
            if (!senderId) {
                console.error('[MessageBus] respond: senderId is required');
                return false;
            }
            if (!requestId) {
                console.error('[MessageBus] respond: requestId is required');
                return false;
            }
            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] respond: channel must be a non-empty string');
                return false;
            }

            const responseChannel = channel + RESPONSE_SUFFIX;
            const payload = {
                requestId: requestId,
                ok: true,
                result: response
            };

            if (this._debug) {
                console.log(
                    `[MessageBus] ✅ RPC respond ${requestId}: ${senderId} → ${targetId || '?'} [${channel}]`
                );
            }

            return this.send(senderId, responseChannel, payload, targetId);
        }

        respondError(senderId, requestId, channel, error, targetId = null) {
            if (!senderId) {
                console.error('[MessageBus] respondError: senderId is required');
                return false;
            }
            if (!requestId) {
                console.error('[MessageBus] respondError: requestId is required');
                return false;
            }
            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] respondError: channel must be a non-empty string');
                return false;
            }

            const responseChannel = channel + RESPONSE_SUFFIX;
            const payload = {
                requestId: requestId,
                ok: false,
                error: (error == null) ? 'Unknown RPC error' : String(error)
            };

            if (this._debug) {
                console.warn(
                    `[MessageBus] ❌ RPC respondError ${requestId}: ${senderId} -> ${targetId || '?'} [${channel}] — ${payload.error}`
                );
            }

            return this.send(senderId, responseChannel, payload, targetId);
        }

        // ============================================================
        // 1.3. RPC — ОБРАБОТЧИК
        // ============================================================

        onRequest(senderId, channel, handler) {
            if (!senderId) {
                console.error('[MessageBus] onRequest: senderId is required');
                return () => {};
            }
            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] onRequest: channel must be a non-empty string');
                return () => {};
            }
            if (typeof handler !== 'function') {
                console.error('[MessageBus] onRequest: handler must be a function');
                return () => {};
            }

            const requestChannel = channel + REQUEST_SUFFIX;
            const self = this;

            const wrapper = (fromSenderId, payload) => {
                if (!payload || !payload.requestId) {
                    console.warn('[MessageBus] onRequest: payload without requestId, ignored');
                    return;
                }

                const requestId = payload.requestId;

                const data = { ...payload };
                delete data.requestId;

                const meta = {
                    requestId: requestId,
                    fromSenderId: fromSenderId,
                    channel: channel
                };

                let result;
                try {
                    result = handler(data, meta);
                } catch (syncErr) {
                    self.respondError(senderId, requestId, channel, syncErr.message, fromSenderId);
                    return;
                }

                if (result && typeof result.then === 'function') {
                    result
                        .then((value) => {
                            self.respond(senderId, requestId, channel, value, fromSenderId);
                        })
                        .catch((asyncErr) => {
                            self.respondError(
                                senderId,
                                requestId,
                                channel,
                                asyncErr ? asyncErr.message : 'Unknown error',
                                fromSenderId
                            );
                        });
                } else {
                    self.respond(senderId, requestId, channel, result, fromSenderId);
                }
            };

            const unsub = this.subscribe(senderId, requestChannel, wrapper);

            const handle = {
                senderId: senderId,
                channel: channel,
                unsub: unsub
            };
            this._requestHandlers.add(handle);

            if (this._debug) {
                console.log(`[MessageBus] 🎧 onRequest: ${senderId} listening on [${channel}]`);
            }

            return () => {
                this._requestHandlers.delete(handle);
                try { unsub(); } catch (e) {}
                if (this._debug) {
                    console.log(`[MessageBus] 🔴 onRequest off: ${senderId} [${channel}]`);
                }
            };
        }

        // ============================================================
        // 1.4. RPC — CLEANUP
        // ============================================================

        _cleanupRequest(requestId) {
            const pending = this._pendingRequests.get(requestId);
            if (pending) {
                if (pending.timer) {
                    try { clearTimeout(pending.timer); } catch (e) {}
                }
                this._pendingRequests.delete(requestId);
            }

            const unsub = this._requestUnsubscribes.get(requestId);
            if (unsub) {
                try { unsub(); } catch (e) {}
                this._requestUnsubscribes.delete(requestId);
            }
        }

        getPendingRequestCount() {
            return this._pendingRequests.size;
        }

        // ============================================================
        // 2. ДОСТАВКА
        // ============================================================

        /**
         * ✅ FIX v2.4.0: защита от рекурсии.
         * Счётчик живёт в синхронном стеке. Если подписчик вызовет send()
         * синхронно — глубина вырастет. Если превысит MAX — warn + стоп.
         * Асинхронные вызовы (через Promise.then, setTimeout) не считаются —
         * счётчик уже сброшен.
         */
        _enterDelivery() {
            this._deliveryDepth++;
            if (this._deliveryDepth > MAX_DELIVERY_DEPTH) {
                console.error(
                    `[MessageBus] ❌ Delivery depth exceeded (${MAX_DELIVERY_DEPTH}) — possible recursion. ` +
                    `Message dropped.`
                );
                this._deliveryDepth--;
                return false;
            }
            return true;
        }

        _exitDelivery() {
            if (this._deliveryDepth > 0) {
                this._deliveryDepth--;
            }
        }

        _deliverToTarget(targetId, message) {
            if (!this._enterDelivery()) return;

            try {
                const tid = String(targetId);

                const subscriptions = this._subscribers.get(tid);
                if (subscriptions) {
                    const callbacks = subscriptions.get(message.channel);
                    if (callbacks) {
                        for (const cb of callbacks) {
                            try {
                                cb(message.senderId, message.data);
                            } catch (e) {
                                console.error('[MessageBus] Subscriber error:', e);
                            }
                        }
                    }
                }

                const globalCallbacks = this._globalSubscribers.get(tid);
                if (globalCallbacks) {
                    for (const cb of globalCallbacks) {
                        try {
                            cb(message.senderId, message.channel, message.data);
                        } catch (e) {
                            console.error('[MessageBus] Global subscriber error:', e);
                        }
                    }
                }
            } finally {
                this._exitDelivery();
            }
        }

        _deliverToAll(message) {
            if (!this._enterDelivery()) return;

            try {
                for (const [windowId, subscriptions] of this._subscribers) {
                    if (String(windowId) === String(message.senderId)) continue;

                    const callbacks = subscriptions.get(message.channel);
                    if (callbacks) {
                        for (const cb of callbacks) {
                            try {
                                cb(message.senderId, message.data);
                            } catch (e) {
                                console.error('[MessageBus] Subscriber error:', e);
                            }
                        }
                    }
                }

                for (const [windowId, callbacks] of this._globalSubscribers) {
                    if (String(windowId) === String(message.senderId)) continue;

                    for (const cb of callbacks) {
                        try {
                            cb(message.senderId, message.channel, message.data);
                        } catch (e) {
                            console.error('[MessageBus] Global subscriber error:', e);
                        }
                    }
                }
            } finally {
                this._exitDelivery();
            }
        }

        _pushToHistory(message) {
            this._history.push(message);
            if (this._history.length > this._maxHistory) {
                this._history.shift();
            }
        }

        // ============================================================
        // 3. ПОДПИСКИ
        // ============================================================

        subscribe(windowId, channel, callback) {
            if (!windowId) {
                console.error('[MessageBus] windowId is required');
                return () => {};
            }

            if (!channel || typeof channel !== 'string') {
                console.error('[MessageBus] channel must be a non-empty string');
                return () => {};
            }

            if (typeof callback !== 'function') {
                console.error('[MessageBus] callback must be a function');
                return () => {};
            }

            const wid = String(windowId);

            if (!this._subscribers.has(wid)) {
                this._subscribers.set(wid, new Map());
            }

            const subscriptions = this._subscribers.get(wid);
            if (!subscriptions.has(channel)) {
                subscriptions.set(channel, []);
            }

            const callbacks = subscriptions.get(channel);
            callbacks.push(callback);

            if (this._debug) {
                console.log(`[MessageBus] ✅ ${wid} subscribed to [${channel}]`);
            }

            return () => {
                const subs = this._subscribers.get(wid);
                if (!subs) return;

                const cbs = subs.get(channel);
                if (!cbs) return;

                const index = cbs.indexOf(callback);
                if (index !== -1) {
                    cbs.splice(index, 1);
                }

                if (cbs.length === 0) {
                    subs.delete(channel);
                }

                if (subs.size === 0) {
                    this._subscribers.delete(wid);
                }

                if (this._debug) {
                    console.log(`[MessageBus] 🔴 ${wid} unsubscribed from [${channel}]`);
                }
            };
        }

        subscribeAll(windowId, callback) {
            if (!windowId) {
                console.error('[MessageBus] windowId is required');
                return () => {};
            }

            if (typeof callback !== 'function') {
                console.error('[MessageBus] callback must be a function');
                return () => {};
            }

            const wid = String(windowId);

            if (!this._globalSubscribers.has(wid)) {
                this._globalSubscribers.set(wid, []);
            }

            const callbacks = this._globalSubscribers.get(wid);
            callbacks.push(callback);

            if (this._debug) {
                console.log(`[MessageBus] ✅ ${wid} subscribed to all messages`);
            }

            return () => {
                const cbs = this._globalSubscribers.get(wid);
                if (!cbs) return;

                const index = cbs.indexOf(callback);
                if (index !== -1) {
                    cbs.splice(index, 1);
                }

                if (cbs.length === 0) {
                    this._globalSubscribers.delete(wid);
                }

                if (this._debug) {
                    console.log(`[MessageBus] 🔴 ${wid} unsubscribed from all messages`);
                }
            };
        }

        unsubscribeAll(windowId) {
            const wid = String(windowId);
            this._subscribers.delete(wid);
            this._globalSubscribers.delete(wid);

            if (this._debug) {
                console.log(`[MessageBus] 🔴 ${wid} unsubscribed from everything`);
            }
        }

        // ============================================================
        // 4. ИСТОРИЯ
        // ============================================================

        getHistory(channel = null, senderId = null, targetId = null) {
            let history = this._history;

            if (channel) {
                history = history.filter(m => m.channel === channel);
            }
            if (senderId) {
                history = history.filter(m => String(m.senderId) === String(senderId));
            }
            if (targetId) {
                history = history.filter(m => String(m.targetId) === String(targetId));
            }

            return history;
        }

        clearHistory() {
            this._history = [];
        }

        // ============================================================
        // 5. СТАТИСТИКА
        // ============================================================

        getStats() {
            let totalSubscriptions = 0;
            for (const [, subscriptions] of this._subscribers) {
                totalSubscriptions += subscriptions.size;
            }

            return {
                totalWindows: this._subscribers.size + this._globalSubscribers.size,
                totalChannels: totalSubscriptions,
                historySize: this._history.length,
                globalSubscribers: this._globalSubscribers.size,
                registeredTypes: this._typeRegistry.size,
                registeredSlots: this._slotRegistry.size,
                layoutManagerAttached: !!this._layoutManager,
                pendingRequests: this._pendingRequests.size,
                requestHandlers: this._requestHandlers.size,
                deliveryDepth: this._deliveryDepth
            };
        }

        getChannels() {
            const channels = new Set();
            for (const [, subscriptions] of this._subscribers) {
                for (const [channel] of subscriptions) {
                    channels.add(channel);
                }
            }
            return Array.from(channels);
        }

        getSubscribers(channel) {
            const result = [];
            for (const [windowId, subscriptions] of this._subscribers) {
                if (subscriptions.has(channel)) {
                    result.push(windowId);
                }
            }
            return result;
        }

        getRegisteredTypes() {
            return Array.from(this._typeRegistry.keys());
        }

        getRegisteredSlots() {
            return Array.from(this._slotRegistry.keys());
        }

        // ============================================================
        // 6. ОТЛАДКА
        // ============================================================

        enableDebug() {
            this._debug = true;
            console.log('[MessageBus] Debug mode enabled');
        }

        disableDebug() {
            this._debug = false;
            console.log('[MessageBus] Debug mode disabled');
        }

        // ============================================================
        // 7. УНИЧТОЖЕНИЕ
        // ============================================================

        destroy() {
            if (this._layoutListener) {
                try {
                    document.removeEventListener('layout-changed', this._layoutListener);
                } catch (e) {}
                this._layoutListener = null;
            }

            for (const handle of this._requestHandlers) {
                try { handle.unsub(); } catch (e) {}
            }
            this._requestHandlers.clear();

            const pendingIds = Array.from(this._pendingRequests.keys());
            for (const requestId of pendingIds) {
                const pending = this._pendingRequests.get(requestId);
                if (pending && typeof pending.reject === 'function') {
                    try {
                        const err = new Error('MessageBus destroyed during pending RPC');
                        err.code = 'RPC_BUS_DESTROYED';
                        pending.reject(err);
                    } catch (e) {}
                }
                this._cleanupRequest(requestId);
            }
            this._pendingRequests.clear();
            this._requestUnsubscribes.clear();

            this._subscribers.clear();
            this._globalSubscribers.clear();
            this._typeRegistry.clear();
            this._slotRegistry.clear();
            this._history = [];
            this._layoutManager = null;
            this._debug = false;
            this._deliveryDepth = 0;
            console.log('[MessageBus] Destroyed');
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { MessageBus };
    }

    if (typeof window !== 'undefined') {
        window.MessageBus = MessageBus;
        console.log('[MessageBus] Registered globally v2.4.0');
    }

})();