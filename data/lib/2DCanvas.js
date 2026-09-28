// data/lib/2DCanvas.js
// Версия 1.0.0
//
// Регистрирует два компонента:
//   utils.canvas   — примитивы рисования (roundRect, bezier, multiBezier, distToSegment)
//   utils.graph2d  — Camera + GridCache + константы
//
// Используется через обычный ExtendedAPIInjector:
//
//     this.utils.canvas.roundRect(ctx, x, y, w, h, r)
//     this.utils.graph2d.camera({ physics: {...} })
//     this.utils.graph2d.gridCache(theme)
//
// Плагин самодостаточен: самостоятельно регистрирует компоненты
// через window.registerComponent. Не требует правок в ядре.

(function() {
    'use strict';

    console.log('[2DCanvas] Loading v1.0.0...');

    if (typeof window.registerComponent !== 'function') {
        console.error('[2DCanvas] registerComponent not available — ExtendedAPIInjector not loaded');
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    // CANVAS PRIMITIVES
    // ═══════════════════════════════════════════════════════════════

    var canvasUtils = {
        version: '1.0.0',

        roundRect: function(ctx, x, y, w, h, r) {
            r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        },

        bezier: function(ctx, x1, y1, x2, y2, k) {
            if (k === undefined) k = 0.5;
            var dx = Math.max(40, Math.abs(x2 - x1) * k);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
        },

        multiBezier: function(ctx, points, segmentK) {
            if (segmentK === undefined) segmentK = 0.35;
            if (!points || points.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            if (points.length === 2) {
                var dx = Math.max(40, Math.abs(points[1].x - points[0].x) * 0.5);
                ctx.bezierCurveTo(
                    points[0].x + dx, points[0].y,
                    points[1].x - dx, points[1].y,
                    points[1].x, points[1].y
                );
                return;
            }

            for (var i = 0; i < points.length - 1; i++) {
                var p0 = i === 0 ? points[i] : points[i - 1];
                var p1 = points[i];
                var p2 = points[i + 1];
                var p3 = i + 2 < points.length ? points[i + 2] : points[i + 1];

                var c1x = p1.x + (p2.x - p0.x) * segmentK;
                var c1y = p1.y + (p2.y - p0.y) * segmentK;
                var c2x = p2.x - (p3.x - p1.x) * segmentK;
                var c2y = p2.y - (p3.y - p1.y) * segmentK;

                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
            }
        },

        distToSegment: function(px, py, x1, y1, x2, y2) {
            var dx = x2 - x1, dy = y2 - y1;
            var len2 = dx * dx + dy * dy;
            var t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            var cx = x1 + dx * t, cy = y1 + dy * t;
            var ddx = px - cx, ddy = py - cy;
            return {
                dist: Math.sqrt(ddx * ddx + ddy * ddy),
                t: t,
                point: { x: cx, y: cy }
            };
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // GRAPH2D — Camera + GridCache
    // ═══════════════════════════════════════════════════════════════

    var ZOOM_MIN = 0.15;
    var ZOOM_MAX = 4.0;
    var ZOOM_STEP_KEY = 0.1;

    var GRID_SMALL = 16;
    var GRID_MEDIUM = GRID_SMALL * 10;
    var GRID_LARGE = GRID_MEDIUM * 10;
    var GRID_TILE_WORLD = GRID_LARGE;

    var GRID_LOD_MEDIUM_MIN = 0.15;
    var GRID_LOD_SMALL_MIN  = 0.45;

    function _clamp(v, mn, mx) {
        return v < mn ? mn : (v > mx ? mx : v);
    }

    // ------------------------------------------------------------
    // CAMERA
    // ------------------------------------------------------------

    function Camera() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1.0;
        this.viewportWidth = 0;
        this.viewportHeight = 0;

        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZoom = 0;
        this.friction = 0.92;
        this.frictionZoom = 0.85;
        this.maxVelocity = 100;
        this.maxVelocityZoom = 0.5;
        this.isPhysicsEnabled = true;

        this.isAnimating = false;
        this.animationId = null;
        this.animStartTime = 0;
        this.animDuration = 300;

        this.startX = 0;
        this.startY = 0;
        this.startZoom = 1.0;
        this.targetX = 0;
        this.targetY = 0;
        this.targetZoom = 1.0;

        this.bezierP1 = { x: 0.25, y: 0.1 };
        this.bezierP2 = { x: 0.25, y: 1.0 };

        this._cachedCenter = null;
        this._listeners = {
            onZoom: [],
            onPan: [],
            onReset: [],
            onAnimationStart: [],
            onAnimationEnd: []
        };
    }

    Camera.prototype.setViewport = function(w, h) {
        if (w <= 0 || h <= 0) return;
        this.viewportWidth = w;
        this.viewportHeight = h;
        this._cachedCenter = null;
    };

    Camera.prototype.worldToScreen = function(wx, wy) {
        return {
            x: (wx + this.x) * this.zoom,
            y: (wy + this.y) * this.zoom
        };
    };

    Camera.prototype.screenToWorld = function(sx, sy) {
        return {
            x: sx / this.zoom - this.x,
            y: sy / this.zoom - this.y
        };
    };

    Camera.prototype.getViewCenter = function() {
        if (this._cachedCenter) return this._cachedCenter;
        this._cachedCenter = {
            x: this.viewportWidth / 2 / this.zoom - this.x,
            y: this.viewportHeight / 2 / this.zoom - this.y
        };
        return this._cachedCenter;
    };

    Camera.prototype.invalidateCache = function() {
        this._cachedCenter = null;
    };

    Camera.prototype.setPhysicsParams = function(friction, frictionZoom, maxVelocity, maxVelocityZoom) {
        this.friction = _clamp(friction, 0.5, 0.99);
        this.frictionZoom = _clamp(frictionZoom, 0.5, 0.99);
        this.maxVelocity = Math.max(1, maxVelocity);
        this.maxVelocityZoom = Math.max(0.01, maxVelocityZoom);
    };

    Camera.prototype.applyImpulse = function(dx, dy, dZoom) {
        if (!this.isPhysicsEnabled) return;
        if (dZoom === undefined) dZoom = 0;
        this.velocityX += dx;
        this.velocityY += dy;
        this.velocityZoom += dZoom;
    };

    Camera.prototype._updatePhysics = function(dt) {
        if (!this.isPhysicsEnabled) return;
        var d = Math.min(dt, 0.05);

        if (Math.abs(this.velocityX) > 0.001 || Math.abs(this.velocityY) > 0.001) {
            this.x += this.velocityX * d;
            this.y += this.velocityY * d;
            this.velocityX *= this.friction;
            this.velocityY *= this.friction;
            if (Math.abs(this.velocityX) < 0.001) this.velocityX = 0;
            if (Math.abs(this.velocityY) < 0.001) this.velocityY = 0;
            this._cachedCenter = null;
        }
        if (Math.abs(this.velocityZoom) > 0.0001) {
            this.zoom = _clamp(this.zoom + this.velocityZoom * d, ZOOM_MIN, ZOOM_MAX);
            this.velocityZoom *= this.frictionZoom;
            if (Math.abs(this.velocityZoom) < 0.0001) this.velocityZoom = 0;
            this._cachedCenter = null;
        }
    };

    Camera.prototype.zoomToPoint = function(targetZoom, screenX, screenY, animate) {
        targetZoom = _clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
        if (Math.abs(targetZoom - this.zoom) < 0.0005) return;

        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZoom = 0;

        var worldBefore = this.screenToWorld(screenX, screenY);

        if (!animate) {
            this.zoom = targetZoom;
            this.x = (screenX / this.zoom) - worldBefore.x;
            this.y = (screenY / this.zoom) - worldBefore.y;
            this._cachedCenter = null;
            this._emit('onZoom', { zoom: this.zoom });
            return;
        }

        this.startX = this.x;
        this.startY = this.y;
        this.startZoom = this.zoom;
        this.targetZoom = targetZoom;
        this.targetX = (screenX / targetZoom) - worldBefore.x;
        this.targetY = (screenY / targetZoom) - worldBefore.y;

        this.isAnimating = true;
        this.animStartTime = performance.now();
        this._startAnimation();
        this._emit('onZoom', { zoom: targetZoom });
    };

    Camera.prototype.zoomToCenter = function(targetZoom, animate) {
        if (animate === undefined) animate = true;
        targetZoom = _clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
        if (Math.abs(targetZoom - this.zoom) < 0.0005) return;

        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZoom = 0;

        var c = this.getViewCenter();
        var newX = -(c.x) + this.viewportWidth / 2 / targetZoom;
        var newY = -(c.y) + this.viewportHeight / 2 / targetZoom;

        if (!animate) {
            this.x = newX;
            this.y = newY;
            this.zoom = targetZoom;
            this._cachedCenter = null;
            this._emit('onZoom', { zoom: this.zoom });
            return;
        }

        this.startX = this.x;
        this.startY = this.y;
        this.startZoom = this.zoom;
        this.targetX = newX;
        this.targetY = newY;
        this.targetZoom = targetZoom;

        this.isAnimating = true;
        this.animStartTime = performance.now();
        this._startAnimation();
        this._emit('onZoom', { zoom: targetZoom });
    };

    Camera.prototype.zoomIn = function(step) {
        if (step === undefined) step = ZOOM_STEP_KEY;
        this.zoomToCenter(Math.min(ZOOM_MAX, this.zoom + step));
    };

    Camera.prototype.zoomOut = function(step) {
        if (step === undefined) step = ZOOM_STEP_KEY;
        this.zoomToCenter(Math.max(ZOOM_MIN, this.zoom - step));
    };

    Camera.prototype.moveCenterTo = function(worldX, worldY, animate) {
        if (animate === undefined) animate = true;

        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZoom = 0;

        var targetX = -(worldX) + this.viewportWidth / 2 / this.zoom;
        var targetY = -(worldY) + this.viewportHeight / 2 / this.zoom;

        if (!animate) {
            this.x = targetX;
            this.y = targetY;
            this._cachedCenter = null;
            this._emit('onPan', { x: this.x, y: this.y });
            return;
        }

        this.startX = this.x;
        this.startY = this.y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.startZoom = this.zoom;
        this.targetZoom = this.zoom;

        this.isAnimating = true;
        this.animStartTime = performance.now();
        this._startAnimation();
        this._emit('onPan', { x: targetX, y: targetY });
    };

    Camera.prototype.panByWorld = function(dxWorld, dyWorld) {
        this.x -= dxWorld;
        this.y -= dyWorld;
        this._cachedCenter = null;
        this._emit('onPan', { x: this.x, y: this.y });
    };

    Camera.prototype.reset = function(animate) {
        if (animate === undefined) animate = true;

        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZoom = 0;

        if (!animate) {
            this.x = 0;
            this.y = 0;
            this.zoom = 1.0;
            this._cachedCenter = null;
            this.isAnimating = false;
            this._emit('onReset', { x: 0, y: 0, zoom: 1.0 });
            return;
        }

        this.startX = this.x;
        this.startY = this.y;
        this.startZoom = this.zoom;
        this.targetX = 0;
        this.targetY = 0;
        this.targetZoom = 1.0;

        this.isAnimating = true;
        this.animStartTime = performance.now();
        this._startAnimation();
        this._emit('onReset', { x: 0, y: 0, zoom: 1.0 });
    };

    Camera.prototype._bezierEasing = function(t) {
        var p1x = this.bezierP1.x, p1y = this.bezierP1.y;
        var p2x = this.bezierP2.x, p2y = this.bezierP2.y;
        var g = t;

        for (var i = 0; i < 10; i++) {
            var cx = 3 * p1x * (1 - g) * (1 - g)
                + 3 * p2x * (1 - g) * g * g
                + g * g * g;
            if (Math.abs(cx - t) < 0.001) break;
            var d = 6 * (1 - g) * (p1x * (1 - g) + p2x * g)
                + 3 * (p2x - p1x) * g * g
                + 3 * g * g;
            if (d === 0) break;
            g -= (cx - t) / d;
            g = _clamp(g, 0, 1);
        }

        return 3 * p1y * (1 - g) * (1 - g)
            + 3 * p2y * (1 - g) * g * g
            + g * g * g;
    };

    Camera.prototype._startAnimation = function() {
        if (this.animationId !== null) return;
        this._emit('onAnimationStart', {});
        var self = this;
        this._animateStep(function() { self._animateStep(); });
    };

    Camera.prototype._animateStep = function() {
        if (!this.isAnimating) {
            this.animationId = null;
            return;
        }

        var elapsed = performance.now() - this.animStartTime;
        var p = Math.min(1, elapsed / this.animDuration);
        var e = this._bezierEasing(p);

        this.x = this.startX + (this.targetX - this.startX) * e;
        this.y = this.startY + (this.targetY - this.startY) * e;
        this.zoom = this.startZoom + (this.targetZoom - this.startZoom) * e;
        this.zoom = Math.round(this.zoom * 1000) / 1000;
        this._cachedCenter = null;

        if (p >= 1) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.zoom = this.targetZoom;
            this.isAnimating = false;
            this.animationId = null;
            this._cachedCenter = null;
            this._emit('onAnimationEnd', { x: this.x, y: this.y, zoom: this.zoom });
            return;
        }

        var self = this;
        this.animationId = requestAnimationFrame(function() {
            self._animateStep();
        });
    };

    Camera.prototype.stopAnimation = function() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this._emit('onAnimationEnd', { canceled: true });
    };

    Camera.prototype.update = function(dt) {
        if (this.isPhysicsEnabled) this._updatePhysics(dt);
    };

    Camera.prototype.on = function(e, cb) {
        if (this._listeners[e]) this._listeners[e].push(cb);
        return this;
    };

    Camera.prototype.off = function(e, cb) {
        if (this._listeners[e]) {
            this._listeners[e] = this._listeners[e].filter(function(x) {
                return x !== cb;
            });
        }
        return this;
    };

    Camera.prototype._emit = function(e, d) {
        var list = this._listeners[e];
        if (!list) return;
        for (var i = 0; i < list.length; i++) {
            try { list[i](d); } catch (err) {
                console.error('[Camera] ' + e + ':', err);
            }
        }
    };

    Camera.prototype.getZoomPercent = function() {
        return Math.round(this.zoom * 100);
    };

    Camera.prototype.destroy = function() {
        this.stopAnimation();
        this._listeners = {};
    };

    // ------------------------------------------------------------
    // GRID CACHE
    // ------------------------------------------------------------

    function GridCache(theme) {
        this.theme = theme || null;
        this._tile = null;
        this._tileDpr = 1;
        this._tileZoomKey = null;
        this._tileSizePx = 0;
    }

    GridCache.lodForZoom = function(z) {
        if (z < GRID_LOD_MEDIUM_MIN) {
            return { small: false, medium: false, large: true };
        }
        if (z < GRID_LOD_SMALL_MIN) {
            return { small: false, medium: true, large: true };
        }
        return { small: true, medium: true, large: true };
    };

    GridCache.prototype._lodKey = function(lod) {
        return (lod.small ? 1 : 0) + '' + (lod.medium ? 1 : 0) + (lod.large ? 1 : 0);
    };

    GridCache.prototype._palette = function() {
        var p = this.theme && this.theme.palette ? this.theme.palette : null;
        return {
            small:  (p && p.gridSmall)  || 'rgba(128,128,128,0.06)',
            medium: (p && p.gridMedium) || 'rgba(128,128,128,0.13)',
            large:  (p && p.gridLarge)  || 'rgba(128,128,128,0.22)'
        };
    };

    GridCache.prototype.ensureTile = function(zoom, dpr) {
        var lod = GridCache.lodForZoom(zoom);
        var key = this._lodKey(lod);
        var tileSizeCss = GRID_TILE_WORLD * zoom;
        var clampedSize = Math.max(64, Math.min(4096, Math.round(tileSizeCss)));

        if (this._tile
            && this._tileZoomKey === key
            && Math.abs(this._tileSizePx - clampedSize) < 0.5
            && this._tileDpr === dpr) {
            return {
                lod: lod,
                tile: this._tile,
                tileSizeCss: this._tileSizePx / this._tileDpr
            };
        }

        this._tile = this._buildTile(lod, clampedSize, dpr);
        this._tileZoomKey = key;
        this._tileDpr = dpr;
        this._tileSizePx = clampedSize;

        return {
            lod: lod,
            tile: this._tile,
            tileSizeCss: clampedSize / dpr
        };
    };

    GridCache.prototype._buildTile = function(lod, sizeCss, dpr) {
        if (typeof document === 'undefined') return null;

        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.floor(sizeCss * dpr));
        c.height = Math.max(1, Math.floor(sizeCss * dpr));

        var ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, sizeCss, sizeCss);

        var colors = this._palette();
        var scale = sizeCss / GRID_TILE_WORLD;

        var draw = function(stepWorld, color) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            var stepPx = stepWorld * scale;
            if (stepPx < 2) return;
            ctx.beginPath();
            for (var x = 0; x <= sizeCss + 0.5; x += stepPx) {
                var px = Math.round(x) + 0.5;
                ctx.moveTo(px, 0);
                ctx.lineTo(px, sizeCss);
            }
            for (var y = 0; y <= sizeCss + 0.5; y += stepPx) {
                var py = Math.round(y) + 0.5;
                ctx.moveTo(0, py);
                ctx.lineTo(sizeCss, py);
            }
            ctx.stroke();
        };

        if (lod.small)  draw(GRID_SMALL,  colors.small);
        if (lod.medium) draw(GRID_MEDIUM, colors.medium);
        if (lod.large)  draw(GRID_LARGE,  colors.large);

        return c;
    };

    GridCache.prototype.render = function(ctx, camera, w, h, dpr) {
        var ensured = this.ensureTile(camera.zoom, dpr);
        var tile = ensured.tile;
        var tileSizeCss = ensured.tileSizeCss;

        if (!tile || tileSizeCss < 4) return;

        var worldLeft = -camera.x;
        var worldTop = -camera.y;

        var tileIndexX = Math.floor(worldLeft / GRID_TILE_WORLD);
        var tileIndexY = Math.floor(worldTop / GRID_TILE_WORLD);

        var offsetX = (tileIndexX * GRID_TILE_WORLD - worldLeft) * camera.zoom;
        var offsetY = (tileIndexY * GRID_TILE_WORLD - worldTop) * camera.zoom;

        var tilesX = Math.ceil(w / tileSizeCss) + 1;
        var tilesY = Math.ceil(h / tileSizeCss) + 1;

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        for (var ty = 0; ty <= tilesY; ty++) {
            for (var tx = 0; tx <= tilesX; tx++) {
                var x = offsetX + tx * tileSizeCss;
                var y = offsetY + ty * tileSizeCss;
                if (x > w || y > h) continue;
                if (x + tileSizeCss < 0 || y + tileSizeCss < 0) continue;
                ctx.drawImage(tile, x, y, tileSizeCss, tileSizeCss);
            }
        }

        ctx.restore();
    };

    GridCache.prototype.invalidate = function() {
        this._tile = null;
        this._tileZoomKey = null;
        this._tileSizePx = 0;
    };

    // ------------------------------------------------------------
    // FACADE
    // ------------------------------------------------------------

    var graph2dUtils = {
        version: '1.0.0',

        ZOOM_MIN: ZOOM_MIN,
        ZOOM_MAX: ZOOM_MAX,
        ZOOM_STEP_KEY: ZOOM_STEP_KEY,
        GRID_SMALL: GRID_SMALL,
        GRID_MEDIUM: GRID_MEDIUM,
        GRID_LARGE: GRID_LARGE,
        GRID_TILE_WORLD: GRID_TILE_WORLD,
        GRID_LOD_MEDIUM_MIN: GRID_LOD_MEDIUM_MIN,
        GRID_LOD_SMALL_MIN: GRID_LOD_SMALL_MIN,

        Camera: Camera,
        GridCache: GridCache,

        camera: function(opts) {
            opts = opts || {};
            var cam = new Camera();
            if (opts.physics) {
                cam.setPhysicsParams(
                    opts.physics.friction,
                    opts.physics.frictionZoom,
                    opts.physics.maxVelocity,
                    opts.physics.maxVelocityZoom
                );
            }
            return cam;
        },

        gridCache: function(theme) {
            return new GridCache(theme);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // РЕГИСТРАЦИЯ В ExtendedAPIInjector
    // ═══════════════════════════════════════════════════════════════

    window.registerComponent('utils', 'canvas', canvasUtils);
    window.registerComponent('utils', 'graph2d', graph2dUtils);

    window.LS2D = {
        canvas: canvasUtils,
        graph2d: graph2dUtils
    };

    console.log('[2DCanvas] ✅ utils.canvas + utils.graph2d registered');

    // ═══════════════════════════════════════════════════════════════
    // ЭКСПОРТ (для PluginLoader)
    // ═══════════════════════════════════════════════════════════════

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            canvas: canvasUtils,
            graph2d: graph2dUtils
        };
    }

})();