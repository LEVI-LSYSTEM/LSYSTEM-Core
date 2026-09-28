// data/window/3DWindow.js
// Версия 4.7.0 — Three.js viewer, без Alt, FPS-look + кликабельный компас
// Z-up, spherical CameraRig, шейдерная бесконечная сетка и оси, компас 6 осей
// Раскладка:
//   RMB (зажат)       — FPS-look (X инвертирован) + WASD/QE полёт
//   MMB               — панорама
//   MMB → RMB         — dolly (порядок важен: сначала MMB, потом RMB)
//   RMB → MMB         — остаётся look+fly (MMB игнорируется)
//   Wheel up          — приближение
//   Wheel при RMB     — скорость полёта
//   Клик по компасу   — переключение видов (X/X⁻, Y/Y⁻, Z/Z⁻)
//   Клик в центр      — изометрия
// Публичный API: setMesh / setMeshes / frameAll / exportOBJ / ...

(function () {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[3DWindow] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    console.log('[3DWindow] Loading v4.7.0 (clickable compass)...');

    // ============================================================
    // КОНФИГ
    // ============================================================

    const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
    const VERSION = '4.7.0';

    let _threePromise = null;
    function loadThree() {
        if (!_threePromise) {
            _threePromise = import(/* @vite-ignore */ THREE_URL).then((THREE) => {
                console.log('[3DWindow] Three.js loaded r' + THREE.REVISION);
                return THREE;
            }).catch((err) => {
                _threePromise = null;
                throw new Error('Не удалось загрузить Three.js: ' + err.message);
            });
        }
        return _threePromise;
    }

    // ============================================================
    // ПАЛИТРА
    // ============================================================

    const PALETTE_DARK = {
        bg:        0x1a1a1c,
        gridMinor: 0x2e2e31,
        gridMajor: 0x4a4a4f,
        axisX:     0xd94a4a,
        axisY:     0x4ad06a,
        axisZ:     0x4a86d9,
        mesh:      0x9a9a9e,
        wire:      0xb8b0a0,
        points:    0xc8c0b0
    };
    const PALETTE_LIGHT = {
        bg:        0xe8e0d4,
        gridMinor: 0xc0b8a8,
        gridMajor: 0x908878,
        axisX:     0xc9202f,
        axisY:     0x1e7830,
        axisZ:     0x1e5c96,
        mesh:      0x606060,
        wire:      0x4a3f35,
        points:    0x2a2018
    };

    function getPalette() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return isLight ? { ...PALETTE_LIGHT } : { ...PALETTE_DARK };
    }

    function colorToVec3(THREE, hex) {
        const c = new THREE.Color(hex);
        return new THREE.Vector3(c.r, c.g, c.b);
    }

    // ============================================================
    // СТИЛИ UI
    // ============================================================

    const STYLE_ID = 'dw3d-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .dw3d-root { position: relative; width: 100%; height: 100%; overflow: hidden;
                         background: var(--bg-dark, #1a1a1c); font-family: system-ui, sans-serif; }
            .dw3d-canvas { display: block; position: absolute; inset: 0;
                           width: 100%; height: 100%; outline: none; touch-action: none;
                           cursor: default; }
            .dw3d-canvas.dw3d-orbit   { cursor: grabbing; }
            .dw3d-canvas.dw3d-pan     { cursor: move; }
            .dw3d-canvas.dw3d-fly     { cursor: none; }
            .dw3d-canvas.dw3d-dolly   { cursor: ns-resize; }

            .dw3d-compass { position: absolute; top: 14px; right: 14px;
                            width: 96px; height: 96px;
                            pointer-events: auto;
                            cursor: pointer;
                            user-select: none;
                            opacity: 0.92;
                            transition: opacity 0.3s; }
            .dw3d-compass.dw3d-compass--hidden { opacity: 0; }

            .dw3d-error { position: absolute; inset: 0;
                          display: flex; flex-direction: column;
                          align-items: center; justify-content: center; gap: 12px;
                          padding: 32px; text-align: center; color: #d8c89a;
                          background: #1a1a1c; font-family: system-ui, sans-serif; }
            .dw3d-error h3 { margin: 0; font-size: 18px; color: #ff8833; }
            .dw3d-error p { margin: 0; max-width: 420px; line-height: 1.5; opacity: 0.85; }
            .dw3d-error__hint { font-size: 12px; opacity: 0.6; }
            .dw3d-error button { margin-top: 8px; padding: 8px 16px; border: none;
                                 background: #d8c89a; color: #1a1a1a; border-radius: 6px;
                                 cursor: pointer; font-weight: 600; }

            .dw3d-loading { position: absolute; inset: 0;
                            display: flex; align-items: center; justify-content: center;
                            color: #d8c89a; font: 13px system-ui, sans-serif;
                            background: #1a1a1c; }
            .dw3d-spinner { width: 28px; height: 28px;
                            border: 3px solid rgba(216,200,154,0.2);
                            border-top-color: #d8c89a; border-radius: 50%;
                            animation: dw3d-spin 0.8s linear infinite; margin-right: 12px; }
            @keyframes dw3d-spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // ШЕЙДЕРЫ: бесконечная сетка и оси
    // ============================================================

    const GRID_VERT = `
        varying vec3 vWorldPos;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `;

    const GRID_FRAG = `
        precision highp float;
        varying vec3 vWorldPos;
        uniform vec3  uMinorColor;
        uniform vec3  uMajorColor;
        uniform float uCellSize;
        uniform float uMajorEvery;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        uniform vec3  uCamPos;

        float gridLine(vec2 coord, float size, float width) {
            vec2 g = abs(fract(coord / size - 0.5) - 0.5) / fwidth(coord / size);
            float line = min(g.x, g.y);
            return 1.0 - min(line / width, 1.0);
        }

        void main() {
            vec2 p = vWorldPos.xy;

            float minor = gridLine(p, uCellSize, 1.0);
            float major = gridLine(p, uCellSize * uMajorEvery, 1.2);

            float distCam = length(vWorldPos - uCamPos);
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distCam);

            vec3 col = mix(uMinorColor, uMajorColor, major);
            float alpha = max(minor * 0.55, major) * fade;

            if (alpha < 0.001) discard;
            gl_FragColor = vec4(col, alpha);
        }
    `;

    const AXES_VERT = GRID_VERT;

    const AXES_FRAG = `
        precision highp float;
        varying vec3 vWorldPos;
        uniform vec3  uColor;
        uniform int   uAxis;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        uniform vec3  uCamPos;
        uniform float uWidth;

        void main() {
            float d;
            if (uAxis == 0)      d = abs(vWorldPos.y);
            else if (uAxis == 1) d = abs(vWorldPos.x);
            else                 d = length(vWorldPos.xy);

            float aa = fwidth(d) * uWidth;
            float line = 1.0 - smoothstep(0.0, aa + 1e-5, d);

            float distCam = length(vWorldPos - uCamPos);
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distCam);

            float alpha = line * fade;
            if (alpha < 0.001) discard;
            gl_FragColor = vec4(uColor, alpha);
        }
    `;

    // ============================================================
    // CAMERA RIG
    // ============================================================

    class CameraRig {
        constructor(THREE, camera, domElement) {
            this.THREE = THREE;
            this.camera = camera;
            this.dom = domElement;

            this.target = new THREE.Vector3(0, 0, 0);
            this.distance = 18;
            this.theta = Math.PI * 0.25;
            this.phi   = Math.PI * 0.32;

            this.minDistance = 0.02;
            this.maxDistance = 50000;
            this.minPhi = 0.001;
            this.maxPhi = Math.PI - 0.001;

            this.enableDamping = true;
            this.damping = 0.20;
            this._dTheta = 0;
            this._dPhi = 0;
            this._dTarget = new THREE.Vector3();

            this.rotateSpeed = 1.0;
            this.panSpeed    = 1.0;
            this.zoomSpeed   = 1.0;
            this.lookSpeed   = 1.0;

            this.moveSpeed    = 1.0;
            this.minMoveSpeed = 0.05;
            this.maxMoveSpeed = 50;
            this._flyKeys = new Set();
            this._flying = false;

            this._transition = null;

            this.onChange = null;

            this._apply(true);
        }

        _apply(updateMatrix) {
            const s = Math.sin(this.phi);
            const c = Math.cos(this.phi);
            const st = Math.sin(this.theta);
            const ct = Math.cos(this.theta);

            const x = this.target.x + this.distance * s * st;
            const y = this.target.y + this.distance * s * ct;
            const z = this.target.z + this.distance * c;

            this.camera.up.set(0, 0, 1);
            this.camera.position.set(x, y, z);
            this.camera.lookAt(this.target.x, this.target.y, this.target.z);
            if (updateMatrix) {
                this.camera.updateMatrixWorld();
                if (this.onChange) this.onChange();
            }
        }

        orbit(dxPx, dyPx) {
            const h = this.dom.clientHeight || 1;
            const k = (2 * Math.PI / h) * this.rotateSpeed;
            this._dTheta -= dxPx * k;
            this._dPhi   -= dyPx * k;
        }

        look(dxPx, dyPx) {
            const h = this.dom.clientHeight || 1;
            const k = (2 * Math.PI / h) * this.lookSpeed;

            this.theta += dxPx * k;
            this.phi   -= dyPx * k;
            this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi));

            const s = Math.sin(this.phi);
            const c = Math.cos(this.phi);
            const st = Math.sin(this.theta);
            const ct = Math.cos(this.theta);

            const camPos = this.camera.position.clone();
            const newTarget = new this.THREE.Vector3(
                camPos.x - this.distance * s * st,
                camPos.y - this.distance * s * ct,
                camPos.z - this.distance * c
            );
            this.target.copy(newTarget);
        }

        pan(dxPx, dyPx) {
            const h = this.dom.clientHeight || 1;
            const cam = this.camera;

            const offset = cam.position.clone().sub(this.target);
            let targetDistance;
            if (cam.isPerspectiveCamera) {
                targetDistance = offset.length() * Math.tan((cam.fov || 45) * Math.PI / 360);
            } else {
                targetDistance = ((cam.top - cam.bottom) / cam.zoom) * 0.5;
            }

            const panX = (2 * dxPx * targetDistance / h) * this.panSpeed;
            const panY = (2 * dyPx * targetDistance / h) * this.panSpeed;

            const right = new this.THREE.Vector3();
            const up = new this.THREE.Vector3();
            right.crossVectors(cam.up, offset).normalize();
            if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
            up.crossVectors(offset, right).normalize();

            const delta = right.multiplyScalar(-panX).add(up.multiplyScalar(panY));
            this._dTarget.add(delta);
        }

        dolly(steps, screenPos) {
            const factor = Math.pow(0.88, steps * this.zoomSpeed);
            const newDist = this.distance * factor;
            if (newDist < this.minDistance || newDist > this.maxDistance) return;

            if (screenPos && this.camera.isPerspectiveCamera) {
                const rect = this.dom.getBoundingClientRect();
                const nx = ((screenPos.x - rect.left) / rect.width) * 2 - 1;
                const ny = -((screenPos.y - rect.top) / rect.height) * 2 + 1;

                const cam = this.camera;
                const offset = cam.position.clone().sub(this.target);
                const dist = offset.length();
                const fovRad = cam.fov * Math.PI / 180;
                const halfH = dist * Math.tan(fovRad / 2);
                const halfW = halfH * cam.aspect;

                const right = new this.THREE.Vector3();
                const up = new this.THREE.Vector3();
                right.crossVectors(cam.up, offset).normalize();
                if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
                up.crossVectors(offset, right).normalize();

                const shift = right.multiplyScalar(nx * halfW * (1 - factor));
                shift.add(up.multiplyScalar(ny * halfH * (1 - factor)));
                this.target.add(shift);
            }

            this.distance = newDist;
        }

        startFly()  { this._flying = true; this._flyKeys.clear(); }
        stopFly()   { this._flying = false; this._flyKeys.clear(); }
        flyKey(code, down) {
            if (!this._flying) return;
            if (down) this._flyKeys.add(code);
            else this._flyKeys.delete(code);
        }

        setFlySpeedFromWheel(steps) {
            const factor = Math.pow(1.25, steps);
            this.moveSpeed = Math.max(
                this.minMoveSpeed,
                Math.min(this.maxMoveSpeed, this.moveSpeed * factor)
            );
        }

        _updateFly(dt) {
            if (!this._flying || !this._flyKeys.size) return;
            const THREE = this.THREE;
            const cam = this.camera;

            const forward = new THREE.Vector3();
            cam.getWorldDirection(forward);
            const right = new THREE.Vector3().crossVectors(forward, cam.up).normalize();
            if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
            const up = cam.up.clone().normalize();
            const move = new THREE.Vector3();

            if (this._flyKeys.has('KeyW')) move.add(forward);
            if (this._flyKeys.has('KeyS')) move.sub(forward);
            if (this._flyKeys.has('KeyD')) move.add(right);
            if (this._flyKeys.has('KeyA')) move.sub(right);
            if (this._flyKeys.has('KeyE') || this._flyKeys.has('Space')) move.add(up);
            if (this._flyKeys.has('KeyQ') ||
                this._flyKeys.has('ControlLeft') || this._flyKeys.has('ControlRight')) move.sub(up);
            if (move.lengthSq() < 1e-8) return;

            const boost =
                (this._flyKeys.has('ShiftLeft') || this._flyKeys.has('ShiftRight')) ? 4 : 1;

            const speed = this.distance * 0.9 * this.moveSpeed * boost;

            move.normalize().multiplyScalar(speed * dt);
            this.target.add(move);
            this.camera.position.add(move);
            if (this.onChange) this.onChange();
        }

        transitionTo(toPos, toTarget, durationMs) {
            durationMs = durationMs || 280;
            const startPos = this.camera.position.clone();
            const startTarget = this.target.clone();
            const endPos = toPos.clone();
            const endTarget = toTarget.clone();

            const offset = endPos.clone().sub(endTarget);
            const dist = offset.length() || 1e-3;
            const phi = Math.acos(Math.max(-1, Math.min(1, offset.z / dist)));
            const theta = Math.atan2(offset.x, offset.y);

            this._transition = {
                t0: performance.now(),
                duration: durationMs,
                startPos, startTarget,
                endPos, endTarget,
                startTheta: this.theta,
                startPhi: this.phi,
                startDist: this.distance,
                endTheta: theta,
                endPhi: phi,
                endDist: dist
            };
        }

        _updateTransition() {
            const tr = this._transition;
            if (!tr) return;
            const t = Math.min(1, (performance.now() - tr.t0) / tr.duration);
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            let dTheta = tr.endTheta - tr.startTheta;
            while (dTheta > Math.PI)  dTheta -= Math.PI * 2;
            while (dTheta < -Math.PI) dTheta += Math.PI * 2;

            this.theta = tr.startTheta + dTheta * e;
            this.phi   = tr.startPhi + (tr.endPhi - tr.startPhi) * e;
            this.distance = tr.startDist + (tr.endDist - tr.startDist) * e;
            this.target.lerpVectors(tr.startTarget, tr.endTarget, e);

            if (t >= 1) this._transition = null;
        }

        update(dt) {
            if (dt > 0.1) dt = 0.1;

            this._updateTransition();
            if (!this._transition) {
                if (this.enableDamping) {
                    this.theta += this._dTheta;
                    this.phi   += this._dPhi;
                    this.target.add(this._dTarget);

                    const k = 1 - this.damping;
                    this._dTheta *= k;
                    this._dPhi   *= k;
                    this._dTarget.multiplyScalar(k);

                    if (Math.abs(this._dTheta) < 1e-5) this._dTheta = 0;
                    if (Math.abs(this._dPhi)   < 1e-5) this._dPhi   = 0;
                    if (this._dTarget.lengthSq() < 1e-8) this._dTarget.set(0, 0, 0);
                } else {
                    this.theta += this._dTheta;
                    this.phi   += this._dPhi;
                    this.target.add(this._dTarget);
                    this._dTheta = 0;
                    this._dPhi = 0;
                    this._dTarget.set(0, 0, 0);
                }
            }

            this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi));

            this._updateFly(dt);
            this._apply(true);
        }
    }

    // ============================================================
    // INFINITE GRID + AXES
    // ============================================================

    function buildInfiniteGrid(THREE, palette) {
        const geom = new THREE.PlaneGeometry(2, 2);
        const mat = new THREE.ShaderMaterial({
            vertexShader: GRID_VERT,
            fragmentShader: GRID_FRAG,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            uniforms: {
                uMinorColor: { value: colorToVec3(THREE, palette.gridMinor) },
                uMajorColor: { value: colorToVec3(THREE, palette.gridMajor) },
                uCellSize:   { value: 1.0 },
                uMajorEvery: { value: 10.0 },
                uFadeStart:  { value: 60.0 },
                uFadeEnd:    { value: 140.0 },
                uCamPos:     { value: new THREE.Vector3() }
            }
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = -2;
        mesh.userData.isGrid = true;
        mesh.userData.update = (camera, fadeStart, fadeEnd) => {
            const cam = camera.position;
            const span = fadeEnd * 2.2;
            mesh.position.set(cam.x, cam.y, 0);
            mesh.scale.set(span, span, 1);
            mesh.quaternion.identity();
            mat.uniforms.uCamPos.value.copy(cam);
            mat.uniforms.uCellSize.value = 1.0;
            mat.uniforms.uMajorEvery.value = 10.0;
            mat.uniforms.uFadeStart.value = fadeStart;
            mat.uniforms.uFadeEnd.value = fadeEnd;
        };
        return mesh;
    }

    function buildInfiniteAxes(THREE, palette) {
        const group = new THREE.Group();
        group.name = 'InfiniteAxes';
        group.renderOrder = -1;

        const makeAxis = (axis, colorHex) => {
            const geom = new THREE.PlaneGeometry(2, 2);
            const mat = new THREE.ShaderMaterial({
                vertexShader: AXES_VERT,
                fragmentShader: AXES_FRAG,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                uniforms: {
                    uColor:     { value: colorToVec3(THREE, colorHex) },
                    uAxis:      { value: axis },
                    uFadeStart: { value: 60.0 },
                    uFadeEnd:   { value: 140.0 },
                    uCamPos:    { value: new THREE.Vector3() },
                    uWidth:     { value: 1.4 }
                }
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.frustumCulled = false;
            mesh.userData.axis = axis;
            mesh.userData.mat = mat;
            return mesh;
        };

        const ax = makeAxis(0, palette.axisX);
        const ay = makeAxis(1, palette.axisY);
        const az = makeAxis(2, palette.axisZ);
        group.add(ax, ay, az);

        group.userData.update = (camera, fadeStart, fadeEnd) => {
            const cam = camera.position;
            const span = fadeEnd * 2.2;

            ax.position.set(cam.x, 0, 0);
            ax.scale.set(span, span, 1);
            ax.quaternion.identity();

            ay.position.set(0, cam.y, 0);
            ay.scale.set(span, span, 1);
            ay.quaternion.identity();

            az.position.set(0, 0, cam.z);
            az.scale.set(span, span, 1);
            az.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

            for (const m of [ax, ay, az]) {
                m.userData.mat.uniforms.uCamPos.value.copy(cam);
                m.userData.mat.uniforms.uFadeStart.value = fadeStart;
                m.userData.mat.uniforms.uFadeEnd.value = fadeEnd;
            }
        };

        return group;
    }

    // ============================================================
    // OBJ EXPORTER
    // ============================================================

    function exportOBJ(rootObject) {
        const lines = [];
        let vIndex = 0;
        let nIndex = 0;

        lines.push('# Exported from LSYSTEM 3D Window v' + VERSION);
        lines.push('# ' + new Date().toISOString());
        lines.push('');

        rootObject.traverse((obj) => {
            if (!obj.isMesh) return;

            const geom = obj.geometry;
            if (!geom || !geom.getAttribute) return;
            const pos = geom.getAttribute('position');
            if (!pos) return;

            lines.push(`o ${obj.name || 'mesh'}`);
            obj.updateWorldMatrix(true, false);

            const baseV = vIndex;
            for (let i = 0; i < pos.count; i++) {
                const p = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
                const wp = obj.localToWorld(new obj.position.constructor(p.x, p.y, p.z));
                lines.push(`v ${wp.x.toFixed(6)} ${wp.y.toFixed(6)} ${wp.z.toFixed(6)}`);
            }
            vIndex += pos.count;

            const nrm = geom.getAttribute('normal');
            let baseN = null;
            if (nrm) {
                baseN = nIndex;
                for (let i = 0; i < nrm.count; i++) {
                    lines.push(`vn ${nrm.getX(i).toFixed(6)} ${nrm.getY(i).toFixed(6)} ${nrm.getZ(i).toFixed(6)}`);
                }
                nIndex += nrm.count;
            }

            const idx = geom.getIndex();
            const triCount = idx ? idx.count / 3 : pos.count / 3;
            for (let i = 0; i < triCount; i++) {
                const a = idx ? idx.getX(i * 3 + 0) : (i * 3 + 0);
                const b = idx ? idx.getX(i * 3 + 1) : (i * 3 + 1);
                const c = idx ? idx.getX(i * 3 + 2) : (i * 3 + 2);
                if (baseN != null) {
                    lines.push(`f ${baseV + a + 1}//${baseN + a + 1} ${baseV + b + 1}//${baseN + b + 1} ${baseV + c + 1}//${baseN + c + 1}`);
                } else {
                    lines.push(`f ${baseV + a + 1} ${baseV + b + 1} ${baseV + c + 1}`);
                }
            }
            lines.push('');
        });

        return lines.join('\n');
    }

    // ============================================================
    // КЛАСС ОКНА
    // ============================================================

    class Window3D extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: '3d-viewport',
                name: '3D Viewport',
                icon: 'icon-3d',
                description: 'Three.js viewer (Z-up, кликабельный компас)',
                group: 'Редакторы',
                category: 'editor',
                priority: 3,
                defaultSize: { width: 1000, height: 700 },
                minSize: { width: 400, height: 300 },
                maxWindows: 4,
                metadata: { version: VERSION, author: 'LSYSTEM', engine: 'Three.js' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'view-dd',
                        type: 'dropdown',
                        icon: 'icon-3d',
                        label: 'Вид',
                        title: 'Управление видом',
                        items: [
                            { header: 'Стандартные виды' },
                            { icon: 'icon-layout', label: 'Спереди',   action: 'viewFront',   shortcut: 'Num 1' },
                            { icon: 'icon-layout', label: 'Сзади',     action: 'viewBack',    shortcut: 'Num 2' },
                            { icon: 'icon-layout', label: 'Слева',     action: 'viewLeft',    shortcut: 'Num 4' },
                            { icon: 'icon-layout', label: 'Справа',    action: 'viewRight',   shortcut: 'Num 3' },
                            { icon: 'icon-layout', label: 'Сверху',    action: 'viewTop',     shortcut: 'Num 7' },
                            { icon: 'icon-layout', label: 'Снизу',     action: 'viewBottom',  shortcut: 'Num 9' },
                            { icon: 'icon-layout', label: 'Изометрия', action: 'viewIso',     shortcut: 'Num 0' },
                            { divider: true },
                            { header: 'Камера' },
                            { icon: 'icon-fullscreen', label: 'Ortho / Persp', action: 'toggleOrtho', shortcut: 'Num 5' },
                            { icon: 'icon-maximize',   label: 'Fit All',       action: 'frameAll',    shortcut: 'Home' },
                            { icon: 'icon-refresh',    label: 'Сброс камеры',  action: 'resetCamera', shortcut: 'Shift+C' },
                            { divider: true },
                            { header: 'Режим отображения' },
                            { icon: 'icon-layout', label: 'Solid',            action: 'modeSolid',     shortcut: 'Z' },
                            { icon: 'icon-layout', label: 'Wireframe',        action: 'modeWire',      shortcut: 'X' },
                            { icon: 'icon-layout', label: 'Points',           action: 'modePoints',    shortcut: 'V' },
                            { icon: 'icon-layout', label: 'Wire поверх Solid', action: 'toggleMeshWire', shortcut: 'W' },
                            { divider: true },
                            { header: 'Отображение' },
                            { icon: 'icon-layout', label: 'Сетка',  action: 'toggleGrid',    check: true, shortcut: 'G' },
                            { icon: 'icon-layout', label: 'Оси',    action: 'toggleAxes',    check: true },
                            { icon: 'icon-layout', label: 'Компас', action: 'toggleCompass', check: true },
                            { divider: true },
                            { header: 'Помощь' },
                            { icon: 'icon-info', label: 'Справка по управлению', action: 'showHelp', shortcut: '?' },
                            { icon: 'icon-info', label: 'Сведения о движке',     action: 'showEngineInfo' },
                            { divider: true },
                            { header: 'Экспорт' },
                            { icon: 'icon-save', label: 'Экспорт OBJ', action: 'exportOBJ', shortcut: 'Ctrl+E' }
                        ]
                    }
                ]
            };
        }

        static get hotkeys() {
            return {
                'Numpad1':    { label: 'Вид спереди',       action: 'viewFront' },
                'Numpad2':    { label: 'Вид сзади',         action: 'viewBack' },
                'Numpad3':    { label: 'Вид справа',        action: 'viewRight' },
                'Numpad4':    { label: 'Вид слева',         action: 'viewLeft' },
                'Numpad5':    { label: 'Ortho/Persp',       action: 'toggleOrtho' },
                'Numpad7':    { label: 'Вид сверху',        action: 'viewTop' },
                'Numpad9':    { label: 'Вид снизу',         action: 'viewBottom' },
                'Numpad0':    { label: 'Изометрия',         action: 'viewIso' },
                'Home':       { label: 'Fit All',           action: 'frameAll' },
                'KeyF':       { label: 'Focus',             action: 'focusSelected' },
                'Shift+KeyC': { label: 'Сброс камеры',      action: 'resetCamera' },
                'KeyZ':       { label: 'Solid',             action: 'modeSolid' },
                'KeyX':       { label: 'Wireframe',         action: 'modeWire' },
                'KeyV':       { label: 'Points',            action: 'modePoints' },
                'KeyG':       { label: 'Сетка',             action: 'toggleGrid' },
                'Slash':      { label: 'Справка',           action: 'showHelp' }
            };
        }

        _ensureFields() {
            if (this._fieldsReady) return;

            this._canvas = null;
            this._container = null;
            this._THREE = null;
            this._scene = null;
            this._camera = null;
            this._renderer = null;
            this._rig = null;
            this._grid = null;
            this._axes = null;
            this._meshGroup = null;
            this._lightsGroup = null;
            this._resizeObserver = null;
            this._raf = null;
            this._lastFrameTime = 0;
            this._palette = null;
            this._viewMode = 'solid';
            this._showMeshWire = false;
            this._gridVisible = true;
            this._axesVisible = true;
            this._compassVisible = true;
            this._lastMesh = null;
            this._initialized = false;
            this._initPromise = null;
            this._viewSaveTimer = null;
            this._pendingMeshes = null;
            this._compassCtx = null;
            this._compassSize = 96;
            this._compassHitAreas = null;
            this._boundCompassClick = null;

            this._bookmarks = {};
            this._boundKeyDown = null;
            this._boundKeyUp = null;
            this._boundPointerMove = null;
            this._boundPointerUp = null;
            this._boundWheel = null;
            this._boundContext = null;
            this._dragState = null;
            this._touches = null;
            this._touchLast = null;

            // Флаги зажатых кнопок (для MMB→RMB dolly)
            this._rmbDown = false;
            this._mmbDown = false;

            this._pointerLocked = false;
            this._boundPointerLockChange = null;

            this._fieldsReady = true;
        }

        // ============================================================
        // UI
        // ============================================================

        buildContent(el) {
            this._ensureFields();
            injectStyles();

            el.classList.add('dw3d-root');

            const canvas = document.createElement('canvas');
            canvas.className = 'dw3d-canvas';
            canvas.setAttribute('data-capture-keyboard', '');
            canvas.tabIndex = 0;
            el.appendChild(canvas);
            this._canvas = canvas;

            const loading = document.createElement('div');
            loading.className = 'dw3d-loading';
            loading.innerHTML = '<div class="dw3d-spinner"></div><span>Загрузка Three.js…</span>';
            el.appendChild(loading);
            this._loadingEl = loading;

            const compass = document.createElement('canvas');
            compass.className = 'dw3d-compass';
            compass.width = this._compassSize * 2;
            compass.height = this._compassSize * 2;
            compass.style.width = this._compassSize + 'px';
            compass.style.height = this._compassSize + 'px';
            el.appendChild(compass);
            this._compassEl = compass;
            this._compassCtx = compass.getContext('2d');

            // Клик по компасу — переключение видов
            this._boundCompassClick = this._onCompassClick.bind(this);
            compass.addEventListener('click', this._boundCompassClick);

            canvas.addEventListener('pointerdown', () => {
                try { canvas.focus(); } catch (_) {}
                if (typeof this.focus === 'function') this.focus();
            });

            this._container = el;
        }

        onReady() {
            this._initPromise = this._initThree();
            this._initPromise.catch((err) => this._showError(err));
        }

        _showError(err) {
            console.error('[3DWindow] init error:', err);
            if (!this._container) return;
            if (this._loadingEl) { this._loadingEl.remove(); this._loadingEl = null; }
            if (this._compassEl) { this._compassEl.remove(); this._compassEl = null; }

            const box = document.createElement('div');
            box.className = 'dw3d-error';
            box.innerHTML = `
                <h3>⚠ Не удалось запустить 3D</h3>
                <p>${this._escapeHtml(err.message || String(err))}</p>
                <p class="dw3d-error__hint">
                    Проверьте подключение к интернету (Three.js загружается с CDN)
                    и что WebGL включён в браузере.
                </p>
                <button type="button" id="dw3d-retry">Повторить загрузку</button>
            `;
            this._container.appendChild(box);
            const btn = box.querySelector('#dw3d-retry');
            btn?.addEventListener('click', () => {
                box.remove();
                this._fieldsReady = false;
                this._ensureFields();
                this.buildContent(this._container);
                this.onReady();
            });

            try {
                this.notify('3D Viewport', 'Ошибка инициализации: ' + err.message, 'error');
            } catch (_) {}
        }

        _escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // ============================================================
        // ИНИЦИАЛИЗАЦИЯ
        // ============================================================

        async _initThree() {
            const THREE = await loadThree();
            this._THREE = THREE;
            this._palette = getPalette();

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(this._palette.bg);
            this._scene = scene;

            const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100000);
            camera.up.set(0, 0, 1);
            this._camera = camera;

            let renderer;
            try {
                renderer = new THREE.WebGLRenderer({
                    canvas: this._canvas,
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance'
                });
            } catch (e) {
                throw new Error('WebGL недоступен: ' + e.message);
            }
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            if ('outputColorSpace' in renderer) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            this._renderer = renderer;

            const rig = new CameraRig(THREE, camera, this._canvas);
            rig.target.set(0, 0, 0);
            rig.theta = Math.PI * 0.25;
            rig.phi = Math.PI * 0.34;
            rig.distance = 18;
            this._rig = rig;

            this._grid = buildInfiniteGrid(THREE, this._palette);
            this._grid.visible = this._gridVisible;
            scene.add(this._grid);

            this._axes = buildInfiniteAxes(THREE, this._palette);
            this._axes.visible = this._axesVisible;
            scene.add(this._axes);

            const meshGroup = new THREE.Group();
            meshGroup.name = 'MeshGroup';
            scene.add(meshGroup);
            this._meshGroup = meshGroup;

            const lights = new THREE.Group();
            lights.name = 'Lights';
            const ambient = new THREE.AmbientLight(0xffffff, 0.55);
            const key     = new THREE.DirectionalLight(0xffffff, 0.85);
            key.position.set(5, -5, 10);
            const fill    = new THREE.DirectionalLight(0xffffff, 0.30);
            fill.position.set(-6, 6, 4);
            const rim     = new THREE.DirectionalLight(0xffffff, 0.20);
            rim.position.set(0, 0, -8);
            lights.add(ambient, key, fill, rim);
            scene.add(lights);
            this._lightsGroup = lights;

            this._bindInput();

            if (window.ResizeObserver && this._container) {
                this._resizeObserver = new ResizeObserver(() => this._resize());
                this._resizeObserver.observe(this._container);
            }

            this._restoreViewState();
            this._resize();

            this._initialized = true;
            if (this._loadingEl) { this._loadingEl.remove(); this._loadingEl = null; }

            this._boundKeyDown = this._onKeyDown.bind(this);
            this._boundKeyUp = this._onKeyUp.bind(this);
            document.addEventListener('keydown', this._boundKeyDown);
            document.addEventListener('keyup', this._boundKeyUp);

            this._animate();

            if (this._pendingMeshes) {
                const m = this._pendingMeshes;
                this._pendingMeshes = null;
                this.setMeshes(m);
            }

            console.log('[3DWindow] Ready v' + VERSION);
        }

        // ============================================================
        // INPUT
        // ============================================================
        //
        //  RMB (зажат)              — FPS-look (X инвертирован) + WASD/QE полёт
        //  MMB                      — панорама
        //  MMB → RMB (MMB первым)   — dolly
        //  RMB → MMB                — остаётся look+fly
        //  Wheel up                 — приближение
        //  Wheel при RMB            — скорость полёта
        //  Клик по компасу          — вид на ось / переключение на противоположную

        _bindInput() {
            const canvas = this._canvas;

            this._boundPointerMove = this._onPointerMove.bind(this);
            this._boundPointerUp   = this._onPointerUp.bind(this);
            this._boundWheel       = this._onWheel.bind(this);
            this._boundContext     = (e) => e.preventDefault();

            canvas.addEventListener('pointerdown', this._onPointerDown.bind(this));
            canvas.addEventListener('contextmenu', this._boundContext);
            canvas.addEventListener('wheel', this._boundWheel, { passive: false });
            canvas.addEventListener('dblclick', () => this.frameAll());

            window.addEventListener('pointermove', this._boundPointerMove);
            window.addEventListener('pointerup', this._boundPointerUp);
            window.addEventListener('pointercancel', this._boundPointerUp);
            window.addEventListener('blur', () => {
                if (this._rig) {
                    this._rig._flyKeys.clear();
                    this._rig.stopFly();
                }
                this._dragState = null;
                this._touches = null;
                this._touchLast = null;
                this._rmbDown = false;
                this._mmbDown = false;
                this._unlockPointer();
            });

            this._boundPointerLockChange = () => {
                this._pointerLocked = (document.pointerLockElement === this._canvas);
            };
            document.addEventListener('pointerlockchange', this._boundPointerLockChange);
        }

        _lockPointer() {
            const el = this._canvas;
            el.classList.add('dw3d-fly');
            try {
                const p = el.requestPointerLock?.();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
        }

        _unlockPointer() {
            try {
                if (document.pointerLockElement === this._canvas) {
                    document.exitPointerLock();
                }
            } catch (_) {}
            this._pointerLocked = false;
            this._setCursor(null);
        }

        _onPointerDown(e) {
            // Touch
            if (e.pointerType === 'touch') {
                this._touches = this._touches || new Map();
                this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (this._touches.size === 1) {
                    this._dragState = { type: 'orbit', x: e.clientX, y: e.clientY };
                } else if (this._touches.size === 2) {
                    this._dragState = { type: 'touch-pan' };
                    this._touchLast = null;
                }
                e.preventDefault();
                return;
            }

            // MMB — панорама или dolly, если RMB уже зажат
            if (e.button === 1) {
                e.preventDefault();
                this._mmbDown = true;

                if (this._rmbDown) {
                    this._rig.stopFly();
                    this._unlockPointer();
                    this._dragState = { type: 'dolly', x: e.clientX, y: e.clientY };
                    this._setCursor('dw3d-dolly');
                    return;
                }

                this._dragState = { type: 'pan', x: e.clientX, y: e.clientY };
                this._setCursor('dw3d-pan');
                return;
            }

            // RMB — FPS-look + fly, либо dolly, если MMB уже зажат
            if (e.button === 2) {
                e.preventDefault();
                this._rmbDown = true;

                if (this._mmbDown) {
                    this._dragState = { type: 'dolly', x: e.clientX, y: e.clientY };
                    this._setCursor('dw3d-dolly');
                    return;
                }

                this._rig.startFly();
                this._dragState = { type: 'look', x: e.clientX, y: e.clientY };
                this._lockPointer();
                return;
            }
        }

        _onPointerMove(e) {
            // Touch
            if (e.pointerType === 'touch' && this._touches && this._touches.has(e.pointerId)) {
                this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (this._dragState?.type === 'touch-pan' && this._touches.size === 2) {
                    const pts = [...this._touches.values()];
                    const cx = (pts[0].x + pts[1].x) / 2;
                    const cy = (pts[0].y + pts[1].y) / 2;
                    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                    if (this._touchLast) {
                        const dx = cx - this._touchLast.x;
                        const dy = cy - this._touchLast.y;
                        this._rig.pan(dx, dy);
                        const factor = this._touchLast.dist / Math.max(dist, 1e-3);
                        if (factor !== 1) {
                            const steps = Math.log(1 / factor) / Math.log(0.88);
                            this._rig.dolly(steps, null);
                        }
                    }
                    this._touchLast = { x: cx, y: cy, dist };
                } else if (this._dragState?.type === 'orbit') {
                    const dx = e.clientX - this._dragState.x;
                    const dy = e.clientY - this._dragState.y;
                    this._dragState.x = e.clientX;
                    this._dragState.y = e.clientY;
                    this._rig.orbit(dx, dy);
                }
                e.preventDefault();
                return;
            }

            // Синхронизация флагов через e.buttons
            const btns = e.buttons || 0;
            const rmbNow = (btns & 2) !== 0;
            const mmbNow = (btns & 4) !== 0;

            this._rmbDown = rmbNow;
            this._mmbDown = mmbNow;

            // Обе кнопки зажаты, dragState не dolly → dolly
            if (this._rmbDown && this._mmbDown && this._dragState?.type !== 'dolly') {
                this._rig.stopFly();
                this._unlockPointer();
                this._dragState = { type: 'dolly', x: e.clientX, y: e.clientY };
                this._setCursor('dw3d-dolly');
            }

            // RMB отпущен, MMB зажат, dragState=dolly → pan
            if (!this._rmbDown && this._mmbDown && this._dragState?.type === 'dolly') {
                this._dragState = { type: 'pan', x: e.clientX, y: e.clientY };
                this._setCursor('dw3d-pan');
            }

            // MMB отпущен, RMB зажат, dragState=dolly → look
            if (this._rmbDown && !this._mmbDown && this._dragState?.type === 'dolly') {
                this._rig.startFly();
                this._dragState = { type: 'look', x: e.clientX, y: e.clientY };
                this._lockPointer();
            }

            if (!this._dragState) return;

            if (this._dragState.type === 'look') {
                const mdx = (e.movementX != null) ? e.movementX : (e.clientX - this._dragState.x);
                const mdy = (e.movementY != null) ? e.movementY : (e.clientY - this._dragState.y);
                this._rig.look(mdx, mdy);
                this._dragState.x = e.clientX;
                this._dragState.y = e.clientY;
            } else if (this._dragState.type === 'pan') {
                const dx = e.clientX - this._dragState.x;
                const dy = e.clientY - this._dragState.y;
                this._dragState.x = e.clientX;
                this._dragState.y = e.clientY;
                this._rig.pan(dx, dy);
            } else if (this._dragState.type === 'dolly') {
                const dy = e.clientY - this._dragState.y;
                this._dragState.x = e.clientX;
                this._dragState.y = e.clientY;
                this._rig.dolly(-dy * 0.05, null);
            }
        }

        _onPointerUp(e) {
            if (e.pointerType === 'touch' && this._touches) {
                this._touches.delete(e.pointerId);
                if (this._touches.size < 2) this._touchLast = null;
                if (this._touches.size === 0) this._dragState = null;
                return;
            }

            const btns = e.buttons || 0;
            const rmbNow = (btns & 2) !== 0;
            const mmbNow = (btns & 4) !== 0;

            let releasedButton = e.button;
            if (releasedButton == null || releasedButton === -1) {
                if (this._rmbDown && !rmbNow) releasedButton = 2;
                else if (this._mmbDown && !mmbNow) releasedButton = 1;
            }

            if (releasedButton === 1) this._mmbDown = false;
            if (releasedButton === 2) this._rmbDown = false;
            this._rmbDown = rmbNow;
            this._mmbDown = mmbNow;

            if (this._dragState?.type === 'dolly' && this._mmbDown) {
                this._dragState = { type: 'pan', x: e.clientX, y: e.clientY };
                this._setCursor('dw3d-pan');
                return;
            }

            if (this._dragState?.type === 'dolly' && this._rmbDown) {
                this._rig.startFly();
                this._dragState = { type: 'look', x: e.clientX, y: e.clientY };
                this._lockPointer();
                return;
            }

            if (releasedButton === 2 && this._rig._flying) {
                this._rig.stopFly();
                this._dragState = null;
                this._unlockPointer();
                this._saveViewState();
                return;
            }

            if (this._dragState) {
                this._dragState = null;
                this._setCursor(null);
                this._saveViewState();
            }
        }

        _onWheel(e) {
            e.preventDefault();
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            const steps = -delta / 100;

            if (this._rig._flying) {
                this._rig.setFlySpeedFromWheel(steps);
                return;
            }

            const screenPos = { x: e.clientX, y: e.clientY };
            this._rig.dolly(steps, screenPos);
        }

        _setCursor(cls) {
            const c = this._canvas.classList;
            c.remove('dw3d-orbit', 'dw3d-pan', 'dw3d-fly', 'dw3d-dolly');
            if (cls) c.add(cls);
        }

        // ============================================================
        // COMPASS — клики
        // ============================================================

        _onCompassClick(e) {
            if (!this._compassHitAreas || !this._initialized) return;

            const rect = this._compassEl.getBoundingClientRect();
            const scale = (this._compassSize * 2) / rect.width;
            const px = (e.clientX - rect.left) * scale;
            const py = (e.clientY - rect.top) * scale;

            // Ищем ближайшую ось
            let hit = null;
            let hitDist = Infinity;
            for (const h of this._compassHitAreas) {
                const d = Math.hypot(px - h.x, py - h.y);
                if (d < h.r && d < hitDist) {
                    hit = h;
                    hitDist = d;
                }
            }

            if (hit) {
                this._goToAxis(hit.label, hit.isNeg);
                return;
            }

            // Клик в центр — iso
            const cx = this._compassSize;   // canvas 2x
            const cy = this._compassSize;
            if (Math.hypot(px - cx, py - cy) < 30) {
                this.viewIso();
            }
        }

        _goToAxis(label, isNeg) {
            // label: 'X' | 'Y' | 'Z' — без '⁻'
            const viewMap = {
                'X': { pos: 'right',  neg: 'left'   },
                'Y': { pos: 'back',   neg: 'front'  },
                'Z': { pos: 'top',    neg: 'bottom' }
            };
            const map = viewMap[label];
            if (!map) return;

            const targetView = isNeg ? map.neg : map.pos;
            const oppositeView = isNeg ? map.pos : map.neg;

            const currentView = this._detectViewName().toLowerCase();
            if (currentView === targetView) {
                this.setView(oppositeView);
            } else {
                this.setView(targetView);
            }
        }

        _detectViewName() {
            const cam = this._camera;
            if (!cam || !this._rig) return 'User';
            const dir = cam.position.clone().sub(this._rig.target).normalize();
            const eps = 0.05;
            if (Math.abs(dir.x) < eps && Math.abs(dir.y) < eps) {
                return dir.z > 0 ? 'Top' : 'Bottom';
            }
            if (Math.abs(dir.x) < eps && Math.abs(dir.z) < eps) {
                return dir.y < 0 ? 'Front' : 'Back';
            }
            if (Math.abs(dir.y) < eps && Math.abs(dir.z) < eps) {
                return dir.x > 0 ? 'Right' : 'Left';
            }
            return 'User';
        }

        // ============================================================
        // RENDER LOOP
        // ============================================================

        _animate = (time) => {
            this._raf = requestAnimationFrame(this._animate);
            if (!this._initialized) return;

            const dt = this._lastFrameTime ? (time - this._lastFrameTime) / 1000 : 0;
            this._lastFrameTime = time;

            this._rig.update(dt);

            const cam = this._camera;
            const distance = cam.position.distanceTo(this._rig.target);
            const fadeStart = Math.max(30, distance * 3);
            const fadeEnd   = Math.max(90, distance * 8);

            if (this._grid && this._gridVisible) {
                this._grid.userData.update(cam, fadeStart, fadeEnd);
            }
            if (this._axes && this._axesVisible) {
                this._axes.userData.update(cam, fadeStart, fadeEnd);
            }

            this._renderer.render(this._scene, this._camera);
            this._drawCompass();
        };

        _resize() {
            if (!this._renderer || !this._container) return;
            const rect = this._container.getBoundingClientRect();
            const w = Math.max(1, Math.floor(rect.width));
            const h = Math.max(1, Math.floor(rect.height));
            this._renderer.setSize(w, h, false);
            const aspect = w / h;
            if (this._camera.isPerspectiveCamera) {
                this._camera.aspect = aspect;
            } else if (this._camera.isOrthographicCamera) {
                const halfH = (this._camera.top - this._camera.bottom) / 2;
                const halfW = halfH * aspect;
                this._camera.left   = -halfW;
                this._camera.right  =  halfW;
            }
            this._camera.updateProjectionMatrix();

            if (this._compassEl) {
                const tooSmall = w < 320 || h < 220;
                this._compassEl.style.display = (this._compassVisible && !tooSmall) ? '' : 'none';
            }

            this._saveViewState();
        }

        // ============================================================
        // COMPASS — отрисовка
        // ============================================================

        _drawCompass() {
            if (!this._compassCtx || !this._compassVisible || !this._camera) return;
            if (this._compassEl.style.display === 'none') return;

            const ctx = this._compassCtx;
            const size = this._compassSize * 2;
            const cx = size / 2;
            const cy = size / 2;
            const R = size * 0.34;

            ctx.clearRect(0, 0, size, size);

            const cam = this._camera;
            const q = cam.quaternion;
            const THREE = this._THREE;
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';

            const axes = [
                { dir: new THREE.Vector3( 1, 0, 0), color: this._palette.axisX, label: 'X'  },
                { dir: new THREE.Vector3(-1, 0, 0), color: this._palette.axisX, label: 'X⁻' },
                { dir: new THREE.Vector3( 0, 1, 0), color: this._palette.axisY, label: 'Y'  },
                { dir: new THREE.Vector3( 0,-1, 0), color: this._palette.axisY, label: 'Y⁻' },
                { dir: new THREE.Vector3( 0, 0, 1), color: this._palette.axisZ, label: 'Z'  },
                { dir: new THREE.Vector3( 0, 0,-1), color: this._palette.axisZ, label: 'Z⁻' }
            ];

            const camDir   = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
            const camUp    = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

            const projected = axes.map(a => {
                const v = a.dir.clone();
                return {
                    x: cx + v.dot(camRight) * R,
                    y: cy - v.dot(camUp) * R,
                    z: v.dot(camDir),
                    color: '#' + new THREE.Color(a.color).getHexString(),
                    label: a.label,
                    isNeg: a.label.endsWith('⁻')
                };
            });
            projected.sort((a, b) => a.z - b.z);

            // Фон
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? 'rgba(240,235,225,0.6)' : 'rgba(40,40,44,0.6)';
            ctx.fill();
            ctx.strokeStyle = isLight ? 'rgba(80,60,40,0.2)' : 'rgba(160,160,170,0.18)';
            ctx.lineWidth = 2;
            ctx.stroke();

            for (const p of projected) {
                const alpha = 0.35 + 0.65 * (p.z * 0.5 + 0.5);
                ctx.globalAlpha = alpha;

                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.isNeg ? 3 : 5;
                if (p.isNeg) ctx.setLineDash([4, 4]);
                else ctx.setLineDash([]);

                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.isNeg ? 8 : 11, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();

                ctx.fillStyle = isLight ? '#2a2018' : '#fff';
                ctx.font = (p.isNeg ? 'bold 14px' : 'bold 18px') + ' system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.label, p.x, p.y);

                ctx.globalAlpha = 1;
            }

            // Hit-зоны для кликов
            this._compassHitAreas = projected.map(p => ({
                x: p.x,
                y: p.y,
                r: p.isNeg ? 16 : 22,
                label: p.label.replace('⁻', ''),
                isNeg: p.isNeg
            }));
        }

        // ============================================================
        // ХУКИ ЯДРА
        // ============================================================

        onThemeChange() {
            this._palette = getPalette();
            if (!this._initialized) return;
            const THREE = this._THREE;
            this._scene.background = new THREE.Color(this._palette.bg);

            if (this._grid) {
                this._grid.material.uniforms.uMinorColor.value.copy(colorToVec3(THREE, this._palette.gridMinor));
                this._grid.material.uniforms.uMajorColor.value.copy(colorToVec3(THREE, this._palette.gridMajor));
            }
            if (this._axes) {
                const cols = [this._palette.axisX, this._palette.axisY, this._palette.axisZ];
                let i = 0;
                this._axes.traverse((c) => {
                    if (c.userData && c.userData.mat) {
                        c.userData.mat.uniforms.uColor.value.copy(colorToVec3(THREE, cols[i++]));
                    }
                });
            }
            if (this._lastMesh) {
                const m = this._lastMesh;
                this._lastMesh = null;
                this.setMeshes(m);
            }
        }

        _disposeObject(obj) {
            obj.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(mm => mm.dispose());
                    else child.material.dispose();
                }
            });
        }

        onVisibilityChange(visible) {
            if (visible) this._resize();
        }

        onResize() { this._resize(); }

        onBeforeDestroy() {
            if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
            if (this._resizeObserver) {
                try { this._resizeObserver.disconnect(); } catch (e) {}
                this._resizeObserver = null;
            }
            if (this._boundKeyDown) {
                document.removeEventListener('keydown', this._boundKeyDown);
                this._boundKeyDown = null;
            }
            if (this._boundKeyUp) {
                document.removeEventListener('keyup', this._boundKeyUp);
                this._boundKeyUp = null;
            }
            if (this._boundPointerMove) {
                window.removeEventListener('pointermove', this._boundPointerMove);
                this._boundPointerMove = null;
            }
            if (this._boundPointerUp) {
                window.removeEventListener('pointerup', this._boundPointerUp);
                window.removeEventListener('pointercancel', this._boundPointerUp);
                this._boundPointerUp = null;
            }
            if (this._canvas && this._boundWheel) {
                this._canvas.removeEventListener('wheel', this._boundWheel);
            }
            if (this._canvas && this._boundContext) {
                this._canvas.removeEventListener('contextmenu', this._boundContext);
            }
            if (this._compassEl && this._boundCompassClick) {
                this._compassEl.removeEventListener('click', this._boundCompassClick);
                this._boundCompassClick = null;
            }
            if (this._boundPointerLockChange) {
                document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
                this._boundPointerLockChange = null;
            }
            this._unlockPointer();

            if (this._meshGroup) {
                for (const child of [...this._meshGroup.children]) this._disposeObject(child);
            }
            if (this._grid) this._disposeObject(this._grid);
            if (this._axes) this._disposeObject(this._axes);
            if (this._renderer) {
                try { this._renderer.dispose(); } catch (e) {}
            }
            if (this._viewSaveTimer) {
                clearTimeout(this._viewSaveTimer);
                this._viewSaveTimer = null;
            }
            this._scene = null;
            this._camera = null;
            this._renderer = null;
            this._rig = null;
            this._grid = null;
            this._axes = null;
            this._meshGroup = null;
            this._lightsGroup = null;
            this._canvas = null;
            this._compassEl = null;
            this._compassCtx = null;
            this._loadingEl = null;
            this._container = null;
            this._initialized = false;
        }

        // ============================================================
        // VIEW STATE
        // ============================================================

        _restoreViewState() {
            if (!this.uiState) this.uiState = {};
            const vs = this.uiState.view3d;
            if (vs && this._rig) {
                if (vs.target) this._rig.target.set(vs.target.x, vs.target.y, vs.target.z);
                if (typeof vs.distance === 'number') this._rig.distance = vs.distance;
                if (typeof vs.theta === 'number') this._rig.theta = vs.theta;
                if (typeof vs.phi === 'number') this._rig.phi = vs.phi;
                if (typeof vs.moveSpeed === 'number') this._rig.moveSpeed = vs.moveSpeed;
                this._rig._apply(true);
                if (typeof vs.isOrtho === 'boolean' && vs.isOrtho !== this._camera.isOrthographicCamera) {
                    this.toggleOrtho();
                }
            }
            if (typeof this.uiState.gridVisible    === 'boolean') this._gridVisible    = this.uiState.gridVisible;
            if (typeof this.uiState.axesVisible    === 'boolean') this._axesVisible    = this.uiState.axesVisible;
            if (typeof this.uiState.compassVisible === 'boolean') this._compassVisible = this.uiState.compassVisible;
            if (typeof this.uiState.viewMode       === 'string')  this._viewMode       = this.uiState.viewMode;
            if (typeof this.uiState.showMeshWire   === 'boolean') this._showMeshWire   = this.uiState.showMeshWire;
            if (this.uiState.bookmarks && typeof this.uiState.bookmarks === 'object') {
                this._bookmarks = { ...this.uiState.bookmarks };
            }

            if (this._grid) this._grid.visible = this._gridVisible;
            if (this._axes) this._axes.visible = this._axesVisible;
            if (this._compassEl) this._compassEl.style.display = this._compassVisible ? '' : 'none';
        }

        _saveViewState() {
            if (this._viewSaveTimer) return;
            this._viewSaveTimer = setTimeout(() => {
                this._viewSaveTimer = null;
                if (!this.uiState) this.uiState = {};
                if (this._rig && this._camera) {
                    this.uiState.view3d = {
                        target:    { x: this._rig.target.x, y: this._rig.target.y, z: this._rig.target.z },
                        distance:  this._rig.distance,
                        theta:     this._rig.theta,
                        phi:       this._rig.phi,
                        moveSpeed: this._rig.moveSpeed,
                        isOrtho:   !!this._camera.isOrthographicCamera
                    };
                }
                this.uiState.gridVisible    = this._gridVisible;
                this.uiState.axesVisible    = this._axesVisible;
                this.uiState.compassVisible = this._compassVisible;
                this.uiState.viewMode       = this._viewMode;
                this.uiState.showMeshWire   = this._showMeshWire;
                this.uiState.bookmarks      = { ...this._bookmarks };
                try { if (typeof this.save === 'function') this.save(); } catch (e) {}
            }, 250);
        }

        // ============================================================
        // ПУБЛИЧНЫЙ API
        // ============================================================

        setMesh(mesh) { this.setMeshes(mesh ? [mesh] : []); }

        setMeshes(meshes) {
            if (!this._initialized) {
                this._pendingMeshes = meshes;
                if (this._initPromise) {
                    this._initPromise.then(() => {
                        if (this._pendingMeshes) {
                            const m = this._pendingMeshes;
                            this._pendingMeshes = null;
                            this.setMeshes(m);
                        }
                    }).catch(() => {});
                }
                return;
            }
            const THREE = this._THREE;

            for (const child of [...this._meshGroup.children]) {
                this._meshGroup.remove(child);
                this._disposeObject(child);
            }

            this._lastMesh = meshes;

            if (!Array.isArray(meshes) || meshes.length === 0) return;

            for (let i = 0; i < meshes.length; i++) {
                const m = meshes[i];
                if (!m || !m.vertices || !m.indices) continue;

                const geom = new THREE.BufferGeometry();
                const pos = (m.vertices instanceof Float32Array)
                    ? m.vertices : new Float32Array(m.vertices);
                geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

                if (m.normals) {
                    const nrm = (m.normals instanceof Float32Array) ? m.normals : new Float32Array(m.normals);
                    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
                } else if (m.mode !== 'points' && m.mode !== 'wire') {
                    geom.computeVertexNormals();
                }
                if (m.colors) {
                    const col = (m.colors instanceof Float32Array) ? m.colors : new Float32Array(m.colors);
                    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
                }

                const idx = (m.indices instanceof Uint32Array || m.indices instanceof Uint16Array)
                    ? m.indices
                    : (pos.length / 3 > 65535 ? new Uint32Array(m.indices) : new Uint16Array(m.indices));
                geom.setIndex(new THREE.BufferAttribute(idx, 1));

                geom.computeBoundingBox();
                geom.computeBoundingSphere();

                const mode = m.mode || this._viewMode;
                const threeMesh = this._createMeshObject(geom, mode, m.colors);
                threeMesh.name = m.name || ('mesh_' + i);
                this._meshGroup.add(threeMesh);
            }
        }

        _createMeshObject(geom, mode, hasColors) {
            const THREE = this._THREE;
            const p = this._palette;

            if (mode === 'points') {
                const mat = new THREE.PointsMaterial({
                    color: p.points,
                    size: 3,
                    sizeAttenuation: false,
                    vertexColors: !!hasColors
                });
                return new THREE.Points(geom, mat);
            }
            if (mode === 'wire') {
                const mat = new THREE.MeshBasicMaterial({
                    color: p.wire,
                    wireframe: true,
                    vertexColors: !!hasColors
                });
                return new THREE.Mesh(geom, mat);
            }
            const mat = new THREE.MeshStandardMaterial({
                color: hasColors ? 0xffffff : p.mesh,
                metalness: 0.08,
                roughness: 0.72,
                flatShading: false,
                side: THREE.DoubleSide,
                vertexColors: !!hasColors
            });

            if (this._showMeshWire) {
                const group = new THREE.Group();
                group.add(new THREE.Mesh(geom, mat));
                const wireMat = new THREE.LineBasicMaterial({
                    color: p.wire,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false
                });
                const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geom), wireMat);
                wire.renderOrder = 1;
                group.add(wire);
                group.userData.isSolidGroup = true;
                return group;
            }

            return new THREE.Mesh(geom, mat);
        }

        clearMeshes() { this.setMeshes([]); }

        setViewMode(mode) {
            if (!['solid', 'wire', 'points'].includes(mode)) return;
            this._viewMode = mode;
            if (this._lastMesh) {
                const m = this._lastMesh;
                this._lastMesh = null;
                this.setMeshes(m);
            }
            this._saveViewState();
        }

        setMeshWireframe(on) {
            this._showMeshWire = !!on;
            if (this._lastMesh) {
                const m = this._lastMesh;
                this._lastMesh = null;
                this.setMeshes(m);
            }
            this._saveViewState();
        }

        frameAll() {
            if (!this._initialized || !this._meshGroup.children.length) {
                this.resetCamera();
                return;
            }
            const THREE = this._THREE;
            const box = new THREE.Box3().setFromObject(this._meshGroup);
            if (box.isEmpty()) { this.resetCamera(); return; }
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.y, size.z) * 0.5;
            const safeRadius = Math.max(radius, 0.5);
            const fov = this._camera.isPerspectiveCamera
                ? this._camera.fov * Math.PI / 180
                : Math.PI / 4;
            const dist = (safeRadius * 1.6) / Math.sin(fov / 2);

            const dir = this._camera.position.clone().sub(this._rig.target);
            if (dir.lengthSq() < 1e-6) dir.set(1, -1, 1);
            dir.normalize();

            this._rig.transitionTo(
                center.clone().addScaledVector(dir, dist),
                center.clone(),
                320
            );
            this._saveViewState();
        }

        onMessage(senderId, channel, data) {
            if (channel === '3d:setMeshes') {
                const meshes = (data.meshes || []).map(m => ({
                    name: m.name || 'mesh',
                    vertices: m.vertices instanceof Float32Array
                        ? m.vertices : new Float32Array(m.vertices),
                    indices: m.indices instanceof Uint32Array
                        ? m.indices : new Uint32Array(m.indices),
                    colors: m.colors ? (m.colors instanceof Float32Array
                        ? m.colors : new Float32Array(m.colors)) : undefined,
                    mode: m.mode || 'solid'
                }));
                this.setMeshes(meshes);
                this.frameAll();
                return;
            }
            if (channel === '3d:clear') {
                this.clearMeshes();
                return;
            }
            if (channel === '3d:focus') {
                this.frameAll();
                return;
            }
        }

        focusSelected() { this.frameAll(); }

        resetCamera() {
            if (!this._initialized) return;
            const THREE = this._THREE;
            const pos = new THREE.Vector3(8, -8, 8);
            this._rig.transitionTo(pos, new THREE.Vector3(0, 0, 0), 300);
            this._saveViewState();
        }

        setView(preset) {
            if (!this._initialized) return;
            const THREE = this._THREE;
            const target = this._rig.target.clone();
            const dist = Math.max(this._rig.distance, 2);

            const dirs = {
                front:  new THREE.Vector3( 0, -1,  0),
                back:   new THREE.Vector3( 0,  1,  0),
                right:  new THREE.Vector3( 1,  0,  0),
                left:   new THREE.Vector3(-1,  0,  0),
                top:    new THREE.Vector3( 0,  0,  1),
                bottom: new THREE.Vector3( 0,  0, -1),
                iso:    new THREE.Vector3( 1, -1,  1).normalize()
            };
            const dir = dirs[preset] || dirs.iso;
            this._rig.transitionTo(target.clone().addScaledVector(dir, dist), target, 280);
            this._saveViewState();
        }

        toggleOrtho() {
            if (!this._initialized) return;
            const THREE = this._THREE;
            const cam = this._camera;
            const target = this._rig.target.clone();
            const dist = this._rig.distance;

            let newCam;
            if (cam.isPerspectiveCamera) {
                const aspect = cam.aspect;
                const fovRad = cam.fov * Math.PI / 180;
                const halfH = dist * Math.tan(fovRad / 2);
                const halfW = halfH * aspect;
                newCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 100000);
            } else {
                newCam = new THREE.PerspectiveCamera(45, cam.aspect, 0.05, 100000);
            }
            newCam.position.copy(cam.position);
            newCam.up.copy(cam.up);
            newCam.lookAt(target);

            this._camera = newCam;
            this._rig.camera = newCam;
            this._rig._apply(true);
            this._resize();
            this._saveViewState();
        }

        saveBookmark(index) {
            if (!this._initialized) return;
            if (index < 1 || index > 9) return;
            this._bookmarks[index] = {
                target: { x: this._rig.target.x, y: this._rig.target.y, z: this._rig.target.z },
                distance: this._rig.distance,
                theta: this._rig.theta,
                phi: this._rig.phi
            };
            this._saveViewState();
            try { this.notify('3D', 'Камера сохранена в слот ' + index, 'success'); } catch (_) {}
        }

        recallBookmark(index) {
            if (!this._initialized) return;
            const b = this._bookmarks[index];
            if (!b) return;
            const THREE = this._THREE;
            const t = new THREE.Vector3(b.target.x, b.target.y, b.target.z);
            const s = Math.sin(b.phi), c = Math.cos(b.phi);
            const st = Math.sin(b.theta), ct = Math.cos(b.theta);
            const pos = new THREE.Vector3(
                t.x + b.distance * s * st,
                t.y + b.distance * s * ct,
                t.z + b.distance * c
            );
            this._rig.transitionTo(pos, t, 260);
        }

        setGridVisible(v) {
            this._gridVisible = !!v;
            if (this._grid) this._grid.visible = this._gridVisible;
            this._saveViewState();
        }

        setAxesVisible(v) {
            this._axesVisible = !!v;
            if (this._axes) this._axes.visible = this._axesVisible;
            this._saveViewState();
        }

        setCompassVisible(v) {
            this._compassVisible = !!v;
            if (this._compassEl) this._compassEl.style.display = this._compassVisible ? '' : 'none';
            this._saveViewState();
        }

        setDamping(on) {
            if (this._rig) this._rig.enableDamping = !!on;
            this._saveViewState();
        }

        setFlySpeed(v) {
            if (this._rig) {
                this._rig.moveSpeed = Math.max(this._rig.minMoveSpeed, Math.min(this._rig.maxMoveSpeed, +v || 0));
            }
            this._saveViewState();
        }

        exportOBJ() {
            if (!this._initialized) {
                this.notify('Экспорт', '3D ещё загружается…', 'info');
                return null;
            }
            const result = exportOBJ(this._meshGroup);
            try {
                const blob = new Blob([result], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'viewport-' + Date.now() + '.obj';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
                this.notify('Экспорт', 'OBJ сохранён', 'success');
            } catch (e) {
                this.notify('Экспорт', 'Ошибка: ' + e.message, 'error');
            }
            return result;
        }

        showEngineInfo() {
            if (!this._initialized) {
                this.notify('3D Viewport', 'Three.js ещё загружается…', 'info');
                return;
            }
            const r = this._renderer;
            const gl = r.getContext();
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const gpu = debugInfo
                ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                : 'неизвестно';
            const ver = this._THREE.REVISION;
            this.notify('Движок рендера', `Three.js r${ver}\nGPU: ${gpu}`, 'success');
        }

        showHelp() {
            const html = [
                '<b>Навигация</b>',
                '• ПКМ (hold) — FPS-обзор мышью (X инвертирован) + WASD/QE полёт',
                '• СКМ — панорама',
                '• СКМ → ПКМ (СКМ первым) — dolly',
                '• Колесо вверх — приближение',
                '• Shift — ускорение, колесо при ПКМ — скорость полёта',
                '• Двойной клик / Home — показать всё',
                '• F — фокус',
                '',
                '<b>Компас (правый верх)</b>',
                '• Клик по оси — вид на эту ось',
                '• Повторный клик — на противоположную',
                '• Клик в центр — изометрия',
                '',
                '<b>Тачскрин</b>',
                '• 1 палец — орбита',
                '• 2 пальца — панорама + пинч-зум',
                '',
                '<b>Виды (Numpad)</b>',
                '• 1/3/7 — спереди / справа / сверху',
                '• 2/4/9 — сзади / слева / снизу',
                '• 0 — изометрия, 5 — орто/перспектива',
                '',
                '<b>Закладки камеры</b>',
                '• Ctrl+1..9 — сохранить позицию',
                '• 1..9 — перейти к позиции',
                '',
                '<b>Отображение</b>',
                '• Z — Solid, X — Wireframe, V — Points',
                '• W — каркас поверх Solid',
                '• G — сетка',
                '',
                '<b>Прочее</b>',
                '• Shift+C — сброс камеры',
                '• Ctrl+E — экспорт OBJ',
                '• ? — эта справка'
            ].join('\n');
            try {
                this.notify('Управление 3D', html, 'info', { html: true, duration: 12000 });
            } catch (_) {
                console.log(html);
            }
        }

        // --- Экшены меню ---
        viewFront()   { this.setView('front'); }
        viewBack()    { this.setView('back'); }
        viewLeft()    { this.setView('left'); }
        viewRight()   { this.setView('right'); }
        viewTop()     { this.setView('top'); }
        viewBottom()  { this.setView('bottom'); }
        viewIso()     { this.setView('iso'); }
        modeSolid()   { this.setViewMode('solid'); }
        modeWire()    { this.setViewMode('wire'); }
        modePoints()  { this.setViewMode('points'); }
        toggleGrid()  { this.setGridVisible(!this._gridVisible); }
        toggleAxes()  { this.setAxesVisible(!this._axesVisible); }
        toggleCompass() { this.setCompassVisible(!this._compassVisible); }
        toggleMeshWire() { this.setMeshWireframe(!this._showMeshWire); }

        // --- Хоткеи ---
        _onKeyDown(e) {
            if (typeof this.isFocused === 'function' && !this.isFocused()) return;
            if (e.defaultPrevented) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

            if (this._rig && this._rig._flying) {
                const flyCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
                                  'Space', 'ShiftLeft', 'ShiftRight',
                                  'ControlLeft', 'ControlRight'];
                if (flyCodes.includes(e.code)) {
                    this._rig.flyKey(e.code, true);
                    e.preventDefault();
                    return;
                }
            }

            if (e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
                this.saveBookmark(parseInt(e.code.slice(5), 10));
                e.preventDefault();
                return;
            }
            if (!e.ctrlKey && !e.altKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
                this.recallBookmark(parseInt(e.code.slice(5), 10));
                e.preventDefault();
                return;
            }

            if (e.ctrlKey && e.code === 'KeyE') {
                this.exportOBJ();
                e.preventDefault();
                return;
            }

            switch (e.code) {
                case 'Numpad1': this.viewFront();   e.preventDefault(); break;
                case 'Numpad2': this.viewBack();    e.preventDefault(); break;
                case 'Numpad3': this.viewRight();   e.preventDefault(); break;
                case 'Numpad4': this.viewLeft();    e.preventDefault(); break;
                case 'Numpad5': this.toggleOrtho(); e.preventDefault(); break;
                case 'Numpad7': this.viewTop();     e.preventDefault(); break;
                case 'Numpad9': this.viewBottom();  e.preventDefault(); break;
                case 'Numpad0': this.viewIso();     e.preventDefault(); break;
                case 'Home':    this.frameAll();    e.preventDefault(); break;
                case 'KeyF':    if (!e.ctrlKey && !e.altKey) { this.focusSelected(); e.preventDefault(); } break;
                case 'KeyC':    if (e.shiftKey) { this.resetCamera(); e.preventDefault(); } break;
                case 'KeyZ':    if (!e.ctrlKey && !e.shiftKey) { this.modeSolid();  e.preventDefault(); } break;
                case 'KeyX':    if (!e.ctrlKey && !e.shiftKey) { this.modeWire();   e.preventDefault(); } break;
                case 'KeyV':    if (!e.ctrlKey && !e.shiftKey) { this.modePoints(); e.preventDefault(); } break;
                case 'KeyW':    if (!e.ctrlKey && !e.shiftKey && this._rig && !this._rig._flying) { this.toggleMeshWire(); e.preventDefault(); } break;
                case 'KeyG':    if (!e.ctrlKey && !e.shiftKey) { this.toggleGrid(); e.preventDefault(); } break;
                case 'Slash':   if (e.shiftKey || e.key === '?') { this.showHelp(); e.preventDefault(); } break;
            }
        }

        _onKeyUp(e) {
            if (this._rig && this._rig._flying) {
                this._rig.flyKey(e.code, false);
            }
        }

        // --- Данные ---
        getAllData() {
            return {
                metadata: this.getMetadata ? this.getMetadata() : {},
                data: this.data || {},
                uiState: this.uiState || {}
            };
        }

        onExport() {
            return {
                type: this.getType ? this.getType() : '3d-viewport',
                version: VERSION,
                engine: 'three.js',
                meshCount: this._meshGroup ? this._meshGroup.children.length : 0,
                view: this.uiState?.view3d || null,
                bookmarks: this._bookmarks || {},
                exportedAt: new Date().toISOString()
            };
        }
    }

    if (typeof window !== 'undefined') {
        window.Window3D = Window3D;
        window['3DWindow'] = Window3D;
        console.log('[3DWindow] Registered class globally: Window3D v' + VERSION);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Window3D, '3DWindow': Window3D };
    }
})();