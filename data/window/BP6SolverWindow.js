// data/window/BP6Solver.js
// Версия 3.1.0 — реальная STL-геометрия
//
// STL теперь содержит:
//   • корпус (параллелепипед W×H×D) с отверстиями под порты 1 и 2;
//   • перегородку на z=dividerZ с отверстием под драйвер;
//   • два порта-трубки внутри корпуса от отверстий на длину Lphys.
//
// Всё считается локально, без внешних окон.

(function() {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[BP6Solver] BaseWindowInstance not found — ядро не загружено');
        return;
    }

    console.log('[BP6Solver] Loading v3.1.0...');

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================

    const STAGES = [
        { id: 'stage-input',    title: 'Параметры',  icon: 'icon-settings', hint: 'Vb, Fb, порты, ТС, ограничения' },
        { id: 'stage-validate', title: 'Валидация',  icon: 'icon-check',    hint: 'Проверка достижимости' },
        { id: 'stage-port',     title: 'Расчёт',     icon: 'icon-run',      hint: 'Подбор порта и симуляция потока' },
        { id: 'stage-stl',      title: 'STL',        icon: 'icon-export',   hint: 'Экспорт геометрии корпуса' }
    ];

    const PORT_TYPES = [
        { id: 'slot',  label: 'Щелевой (slot)' },
        { id: 'round', label: 'Круглый (round)' },
        { id: 'rect',  label: 'Прямоугольный (rect)' }
    ];

    const SIDES = [
        { id: 'front',  label: 'Передняя', axis: 'z', sign: +1 },
        { id: 'back',   label: 'Задняя',   axis: 'z', sign: -1 },
        { id: 'left',   label: 'Левая',    axis: 'x', sign: -1 },
        { id: 'right',  label: 'Правая',   axis: 'x', sign: +1 },
        { id: 'top',    label: 'Верхняя',  axis: 'y', sign: +1 },
        { id: 'bottom', label: 'Нижняя',   axis: 'y', sign: -1 }
    ];
    const SIDE_BY_ID = Object.fromEntries(SIDES.map(s => [s.id, s]));

    const RESONANCE_PRESETS = [
        { id: 'neutral',    label: 'Нейтральный',         hint: 'Ровная АЧХ без выраженных пиков',    targets: [40, 80],    q: 0.7, curve: 'Ровная, без акцентов' },
        { id: 'warm',       label: 'Тёплый (низ)',         hint: 'Подчёркнутый низ, мягкая середина',  targets: [35, 70],    q: 0.8, curve: 'Плавный подъём к низу' },
        { id: 'tight',      label: 'Собранный (середина)', hint: 'Чёткая середина, собранный бас',     targets: [55, 110],   q: 1.0, curve: 'Акцент в середине' },
        { id: 'aggressive', label: 'Агрессивный',          hint: 'Резкие пики, атака',                 targets: [45, 90, 135], q: 1.3, curve: 'Выраженные пики' },
        { id: 'smooth',     label: 'Гладкий',              hint: 'Максимально линейная АЧХ',           targets: [50, 100],   q: 0.5, curve: 'Линейная' },
        { id: 'custom',     label: 'По частотам (custom)', hint: 'Задать целевые резонансы вручную',   targets: [],          q: null, curve: 'По вашим значениям' }
    ];

    const J_ALPHA = 1.0;
    const J_BETA  = 0.35;
    const J_GAMMA = 0.25;
    const J_DELTA = 0.20;

    const PORT_LOSS_FACTOR = { slot: 0.15, round: 0.10, rect: 0.20 };

    const SPEED_OF_SOUND = 34300; // см/с
    const CYL_SEGMENTS   = 32;    // сегментов аппроксимации цилиндра

    // ============================================================
    // МАТЕМАТИКА (валидация, метрики, пути)
    // ============================================================

    function computeWallVolume(W, H, D, t) {
        const outer = W * H * D;
        const iW = Math.max(0, W - 2 * t);
        const iH = Math.max(0, H - 2 * t);
        const iD = Math.max(0, D - 2 * t);
        return (outer - iW * iH * iD) / 1e6;
    }

    function requiredPortLength(Fb, V_liters, S_cm2) {
        if (Fb <= 0 || V_liters <= 0 || S_cm2 <= 0) return null;
        const V_cm3 = V_liters * 1000;
        const c2 = SPEED_OF_SOUND * SPEED_OF_SOUND;
        return (S_cm2 * c2) / (4 * Math.PI * Math.PI * Fb * Fb * V_cm3);
    }

    function physicalPortLength(Leff, type, charSize_cm) {
        const k = type === 'round' ? 0.85 : (type === 'slot' ? 0.70 : 0.80);
        return Math.max(0.5, Leff - k * charSize_cm);
    }

    function minPortArea(Sd_cm2, Xmax_mm, Fb) {
        if (!Sd_cm2 || !Xmax_mm || !Fb) return 10;
        const Xmax_cm = Xmax_mm / 10;
        const Qpeak = Sd_cm2 * Xmax_cm * 2 * Math.PI * Fb;
        return Qpeak / 1700;
    }

    function charSizeFromArea(S_cm2, type) {
        if (type === 'round') return 2 * Math.sqrt(S_cm2 / Math.PI);
        return Math.sqrt(S_cm2);
    }

    function segDir(p1, p2) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        return { x: dx / len, y: dy / len, z: dz / len, len };
    }

    function angleBetween(a, b) {
        const dot = a.x * b.x + a.y * b.y + a.z * b.z;
        const na = Math.hypot(a.x, a.y, a.z) || 1;
        const nb = Math.hypot(b.x, b.y, b.z) || 1;
        let c = dot / (na * nb);
        c = Math.max(-1, Math.min(1, c));
        return Math.acos(c);
    }

    function sidePoint(sideId, uv, W, H, D) {
        const side = SIDE_BY_ID[sideId];
        const hx = W / 2, hy = H / 2, hz = D / 2;
        const u = uv.u, v = uv.v;
        const px = (u - 0.5) * W;
        const py = (v - 0.5) * H;
        const pz = (u - 0.5) * D;
        switch (side.id) {
            case 'front':  return { x: px, y: py, z: +hz };
            case 'back':   return { x: px, y: py, z: -hz };
            case 'left':   return { x: -hx, y: py, z: pz };
            case 'right':  return { x: +hx, y: py, z: pz };
            case 'top':    return { x: px, y: +hy, z: pz };
            case 'bottom': return { x: px, y: -hy, z: pz };
        }
        return { x: 0, y: 0, z: 0 };
    }

    function buildFlowPath(sideIn, uvIn, sideOut, uvOut, geo) {
        const { W, H, D, dividerZ } = geo;
        const pIn  = sidePoint(sideIn,  uvIn,  W, H, D);
        const pOut = sidePoint(sideOut, uvOut, W, H, D);
        const halfD = D / 2;
        const camA = { x: 0, y: 0, z: dividerZ - (halfD - Math.abs(dividerZ)) * 0.4 };
        const camB = { x: 0, y: 0, z: dividerZ + (halfD - Math.abs(dividerZ)) * 0.4 };
        const midWall = { x: 0, y: 0, z: dividerZ };
        return { points: [pIn, camA, midWall, camB, pOut], pIn, pOut };
    }

    function analyzePath(pts) {
        let Lpath = 0;
        const dirs = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const s = segDir(pts[i], pts[i + 1]);
            Lpath += s.len;
            dirs.push({ x: s.x, y: s.y, z: s.z });
        }
        const p1 = pts[0], p2 = pts[pts.length - 1];
        const Ldirect = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z));
        let Nturns = 0, thetaTotal = 0;
        for (let i = 0; i < dirs.length - 1; i++) {
            const a = angleBetween(dirs[i], dirs[i + 1]);
            if (a > Math.PI / 12) Nturns++;
            thetaTotal += a;
        }
        return { Lpath, Ldirect, Nturns, thetaTotal };
    }

    function computeJ(metrics, portType) {
        const lossType = PORT_LOSS_FACTOR[portType] ?? 0.15;
        return J_ALPHA * (metrics.Lpath / metrics.Ldirect)
             + J_BETA  * metrics.Nturns
             + J_GAMMA * (metrics.thetaTotal / Math.PI)
             + J_DELTA * lossType;
    }

    function portFitsInBox(Lphys_cm, sideId, W, H, D, t) {
        const side = SIDE_BY_ID[sideId];
        const inner = { x: W - 2 * t, y: H - 2 * t, z: D - 2 * t };
        return (Lphys_cm * 10) <= inner[side.axis];
    }

    // ============================================================
    // ГЕНЕРАЦИЯ STL — РЕАЛЬНАЯ ГЕОМЕТРИЯ
    // ============================================================
    //
    // Модель: W×H×D (мм), центр в (0,0,0).
    //   z <  dividerZ  → задняя камера Vb1
    //   z >  dividerZ  → передняя камера Vb2
    //   перегородка занимает z ∈ [dividerZ - t/2, dividerZ + t/2]
    //
    // Что строим:
    //   1) Внешний параллелепипед с двумя отверстиями под порты (на стенках).
    //   2) Перегородку-«плиту» с круглым отверстием под драйвер.
    //   3) Два порта-трубки (параллелепипед для slot/rect, цилиндр для round),
    //      идущие внутрь от отверстия на длину Lphys.
    //
    // Триангуляция каждой грани — простая, но с вырезом под отверстие.
    // Грани строим как «рамка вокруг отверстия» из 8 треугольников на прямоугольные
    // отверстия и из N треугольников на круглые.

    // --- низкоуровневые добавления треугольников ---

    function makeMesh() {
        return { triangles: [] };
    }

    function pushTri(mesh, p1, p2, p3) {
        mesh.triangles.push([p1, p2, p3]);
    }

    /**
     * Правильный порядок обхода — против часовой, если смотреть извне.
     * Определяем нормаль через векторное произведение и, если нужно, реверсируем.
     */
    function pushTriOriented(mesh, p1, p2, p3, outwardRef) {
        const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
        const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const dot = nx * outwardRef[0] + ny * outwardRef[1] + nz * outwardRef[2];
        if (dot < 0) pushTri(mesh, p1, p3, p2);
        else         pushTri(mesh, p1, p2, p3);
    }

    /**
     * Прямоугольник с вырезом (прямоугольное отверстие) — 8 треугольников «рамкой».
     * Строим в локальных координатах на плоскости (2D), затем мапим на 3D.
     *
     * r — {x0,y0,x1,y1} внешний прямоугольник (в 2D)
     * h — {x0,y0,x1,y1} внутренний вырез (отверстие), целиком внутри r
     * map2Dto3D(u, v) → [x, y, z]
     * outward — нормаль (3D единичная)
     *
     * Триангуляция рамки: 4 полосы (верх, низ, лево, право).
     * Каждая полоса — 2 треугольника.
     */
    function addRectRing(mesh, r, h, map2Dto3D, outward) {
        const M = map2Dto3D;

        // Верхняя полоса: y ∈ [h.y1, r.y1], x ∈ [r.x0, r.x1]
        quadRing(mesh,
            M(r.x0, h.y1), M(r.x1, h.y1), M(r.x1, r.y1), M(r.x0, r.y1),
            outward);

        // Нижняя полоса: y ∈ [r.y0, h.y0], x ∈ [r.x0, r.x1]
        quadRing(mesh,
            M(r.x0, r.y0), M(r.x1, r.y0), M(r.x1, h.y0), M(r.x0, h.y0),
            outward);

        // Левая полоса: x ∈ [r.x0, h.x0], y ∈ [h.y0, h.y1]
        quadRing(mesh,
            M(r.x0, h.y0), M(h.x0, h.y0), M(h.x0, h.y1), M(r.x0, h.y1),
            outward);

        // Правая полоса: x ∈ [h.x1, r.x1], y ∈ [h.y0, h.y1]
        quadRing(mesh,
            M(h.x1, h.y0), M(r.x1, h.y0), M(r.x1, h.y1), M(h.x1, h.y1),
            outward);
    }

    /** Один плоский четырёхугольник — 2 треугольника. */
    function quadRing(mesh, p1, p2, p3, p4, outward) {
        pushTriOriented(mesh, p1, p2, p3, outward);
        pushTriOriented(mesh, p1, p3, p4, outward);
    }

    /**
     * Прямоугольная грань со сквозным прямоугольным отверстием.
     * r — прямоугольник, h — отверстие (оба в 2D сторона).
     */
    function faceWithRectHole(mesh, r, h, map2Dto3D, outward) {
        addRectRing(mesh, r, h, map2Dto3D, outward);
    }

    /**
     * Прямоугольная грань со сквозным КРУГЛЫМ отверстием.
     * Строим «колечко» между внешним прямоугольником и вписанным кругом.
     *
     * r — {x0,y0,x1,y1} (2D)
     * cx, cy, radius — центр и радиус отверстия
     */
    function faceWithCircleHole(mesh, r, cx, cy, radius, map2Dto3D, outward) {
        const N = CYL_SEGMENTS;
        const M = map2Dto3D;

        // Проходим по сегментам круга. Для каждого — «полоса» от прямоугольника
        // до дуги. Чтобы упростить — разделим прямоугольник на 4 подпрямоугольника,
        // соответствующих 4 сторонам круга (верх, низ, лево, право относительно центра),
        // и в каждом построим триангуляцию «под дугой».
        //
        // Проще и надёжнее: проходим по всем N сегментам круга, для каждого
        // строим 1 треугольник с внешней точкой на ближайшей стороне прямоугольника,
        // и 1 треугольник внутрь от края круга. Итог: примерно 2N треугольников.

        // Разделим окружность на N секторов. Для каждого сектора (p_i, p_{i+1})
        // возьмём две «внешние» точки на прямоугольнике — проекции дуги наружу.
        // Это даёт сетку «веером» — нормально для STL.

        // Практичный подход: точки на прямоугольнике = точки пересечения луча
        // из центра (cx, cy) под углом θ_i с прямоугольником r.

        const boundaryPoint = (theta) => {
            const dirX = Math.cos(theta), dirY = Math.sin(theta);
            // Пересечение с прямоугольником r
            let tMax = Infinity;
            const cand = [];
            if (Math.abs(dirX) > 1e-9) {
                cand.push((r.x1 - cx) / dirX);
                cand.push((r.x0 - cx) / dirX);
            }
            if (Math.abs(dirY) > 1e-9) {
                cand.push((r.y1 - cy) / dirY);
                cand.push((r.y0 - cy) / dirY);
            }
            for (const t of cand) {
                if (t <= 0) continue;
                const px = cx + dirX * t;
                const py = cy + dirY * t;
                if (px >= r.x0 - 1e-6 && px <= r.x1 + 1e-6 &&
                    py >= r.y0 - 1e-6 && py <= r.y1 + 1e-6) {
                    tMax = Math.min(tMax, t);
                }
            }
            if (!isFinite(tMax)) tMax = 0;
            return { x: cx + dirX * tMax, y: cy + dirY * tMax };
        };

        for (let i = 0; i < N; i++) {
            const a1 = (i / N) * Math.PI * 2;
            const a2 = ((i + 1) / N) * Math.PI * 2;

            const c1 = { x: cx + Math.cos(a1) * radius, y: cy + Math.sin(a1) * radius };
            const c2 = { x: cx + Math.cos(a2) * radius, y: cy + Math.sin(a2) * radius };
            const b1 = boundaryPoint(a1);
            const b2 = boundaryPoint(a2);

            const pC1 = M(c1.x, c1.y);
            const pC2 = M(c2.x, c2.y);
            const pB1 = M(b1.x, b1.y);
            const pB2 = M(b2.x, b2.y);

            // 2 треугольника: (C1, C2, B2) и (C1, B2, B1)
            pushTriOriented(mesh, pC1, pC2, pB2, outward);
            pushTriOriented(mesh, pC1, pB2, pB1, outward);
        }
    }

    // --- корпус ---

    /**
     * Внешний параллелепипед W×H×D с двумя отверстиями на стенках.
     * hole1, hole2:
     *   { side, u, v, shape: 'round'|'rect', sizeCm, LphysCm }
     * sizeCm — характерный размер (диаметр для round, сторона квадрата для rect)
     */
    function buildHousing(mesh, W, H, D, holes) {
        const hx = W / 2, hy = H / 2, hz = D / 2;

        // 6 граней. Для грани без отверстия — 2 треугольника.
        // Для грани с отверстием — триангуляция с вырезом.

        // -- Грани по осям --
        // lowZ (задняя): z = -hz
        // highZ (передняя): z = +hz
        // lowX (левая): x = -hx
        // highX (правая): x = +hx
        // lowY (низ): y = -hy
        // highY (верх): y = +hy

        const faces = {
            back:   { out: [0, 0, -1], side: 'back'   },   // z = -hz
            front:  { out: [0, 0, +1], side: 'front'  },   // z = +hz
            left:   { out: [-1, 0, 0], side: 'left'   },   // x = -hx
            right:  { out: [+1, 0, 0], side: 'right'  },   // x = +hx
            bottom: { out: [0, -1, 0], side: 'bottom' },   // y = -hy
            top:    { out: [0, +1, 0], side: 'top'    }    // y = +hy
        };

        const holesBySide = { back: [], front: [], left: [], right: [], top: [], bottom: [] };
        for (const h of holes) {
            if (holesBySide[h.side]) holesBySide[h.side].push(h);
        }

        for (const key of Object.keys(faces)) {
            const f = faces[key];
            const hs = holesBySide[f.side];

            // 2D рамка грани и функция map2Dto3D
            let r, map;
            if (f.side === 'front' || f.side === 'back') {
                const zConst = (f.side === 'front') ? +hz : -hz;
                r = { x0: -hx, y0: -hy, x1: +hx, y1: +hy };
                map = (u, v) => [u, v, zConst];
            } else if (f.side === 'left' || f.side === 'right') {
                const xConst = (f.side === 'right') ? +hx : -hx;
                r = { x0: -hz, y0: -hy, x1: +hz, y1: +hy };
                map = (u, v) => [xConst, v, u];
            } else if (f.side === 'top' || f.side === 'bottom') {
                const yConst = (f.side === 'top') ? +hy : -hy;
                r = { x0: -hx, y0: -hz, x1: +hx, y1: +hz };
                map = (u, v) => [u, yConst, v];
            }

            if (hs.length === 0) {
                // без отверстий — 2 треугольника
                const p1 = map(r.x0, r.y0);
                const p2 = map(r.x1, r.y0);
                const p3 = map(r.x1, r.y1);
                const p4 = map(r.x0, r.y1);
                quadRing(mesh, p1, p2, p3, p4, f.out);
            } else {
                // берём первое отверстие на грани
                // (в разумном дизайне — не больше одного порта на грань)
                const h = hs[0];

                // Центр отверстия на грани в 2D-координатах плоскости
                // sidePoint даёт 3D-координату; переведём её в 2D координаты грани.
                const sp3 = sidePoint(h.side, { u: h.u, v: h.v }, W, H, D);

                let cx2, cy2;
                if (f.side === 'front' || f.side === 'back') {
                    cx2 = sp3.x; cy2 = sp3.y;
                } else if (f.side === 'left' || f.side === 'right') {
                    cx2 = sp3.z; cy2 = sp3.y;
                } else {
                    cx2 = sp3.x; cy2 = sp3.z;
                }

                const sizeMm = h.sizeCm * 10;

                if (h.shape === 'round') {
                    faceWithCircleHole(mesh, r, cx2, cy2, sizeMm / 2, map, f.out);
                } else {
                    // прямоугольное отверстие: sizeMm × sizeMm
                    const half = sizeMm / 2;
                    const hRect = {
                        x0: cx2 - half, y0: cy2 - half,
                        x1: cx2 + half, y1: cy2 + half
                    };
                    // Если отверстие больше грани — ужмём
                    hRect.x0 = Math.max(hRect.x0, r.x0 + 2);
                    hRect.x1 = Math.min(hRect.x1, r.x1 - 2);
                    hRect.y0 = Math.max(hRect.y0, r.y0 + 2);
                    hRect.y1 = Math.min(hRect.y1, r.y1 - 2);
                    faceWithRectHole(mesh, r, hRect, map, f.out);
                }
            }
        }
    }

    // --- перегородка ---

    /**
     * Перегородка на z = dividerZ, толщиной t, с круглым отверстием в центре
     * под драйвер диаметром driverDiameter.
     *
     * Строим «плиту»: два параллельных прямоугольника (передняя грань z = dividerZ + t/2,
     * задняя — z = dividerZ - t/2), у каждой — круглый вырез.
     * Плюс боковые рёбра по 4 сторонам.
     */
    function buildDivider(mesh, W, H, t, dividerZ, driverDiameter) {
        const hx = W / 2, hy = H / 2;
        const zFront = dividerZ + t / 2;
        const zBack  = dividerZ - t / 2;

        // Границы «полотна» перегородки (внутренние размеры корпуса)
        const r = { x0: -hx + 0.01, y0: -hy + 0.01, x1: hx - 0.01, y1: hy - 0.01 };
        const cx = 0, cy = 0;
        const radius = driverDiameter / 2;

        // Передняя грань (z = zFront), нормаль +z
        const mapFront = (u, v) => [u, v, zFront];
        faceWithCircleHole(mesh, r, cx, cy, radius, mapFront, [0, 0, +1]);

        // Задняя грань (z = zBack), нормаль -z
        const mapBack = (u, v) => [u, v, zBack];
        faceWithCircleHole(mesh, r, cx, cy, radius, mapBack, [0, 0, -1]);

        // Боковые рёбра плиты (по контуру прямоугольника)
        // 4 полосы, каждая — 2 треугольника
        const N = CYL_SEGMENTS;

        // Между прямоугольным контуром r на zBack и r на zFront — боковины плиты.
        // Их можно построить как 4 «quad strip».
        const front = [
            mapFront(r.x0, r.y0), mapFront(r.x1, r.y0),
            mapFront(r.x1, r.y1), mapFront(r.x0, r.y1)
        ];
        const back = [
            mapBack(r.x0, r.y0), mapBack(r.x1, r.y0),
            mapBack(r.x1, r.y1), mapBack(r.x0, r.y1)
        ];

        // 4 ребра: (0,1), (1,2), (2,3), (3,0)
        const edges = [
            [0, 1, [0, -1, 0]],
            [1, 2, [+1, 0, 0]],
            [2, 3, [0, +1, 0]],
            [3, 0, [-1, 0, 0]]
        ];
        for (const [a, b, out] of edges) {
            pushTriOriented(mesh, front[a], front[b], back[b], out);
            pushTriOriented(mesh, front[a], back[b], back[a], out);
        }

        // Внутренняя боковина отверстия драйвера — цилиндр
        for (let i = 0; i < N; i++) {
            const a1 = (i / N) * Math.PI * 2;
            const a2 = ((i + 1) / N) * Math.PI * 2;

            const p1f = [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, zFront];
            const p2f = [cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, zFront];
            const p1b = [cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, zBack];
            const p2b = [cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, zBack];

            // Нормаль цилиндра — «внутрь» отверстия. Считаем наружу от оси,
            // т.к. отверстие — это «дырка», и нормаль должна смотреть в стенку.
            const midA = (a1 + a2) / 2;
            const nx = Math.cos(midA), ny = Math.sin(midA);
            const outward = [-nx, -ny, 0];

            pushTriOriented(mesh, p1f, p2f, p2b, outward);
            pushTriOriented(mesh, p1f, p2b, p1b, outward);
        }
    }

    // --- порт как трубка ---

    /**
     * Строит порт: трубку, идущую внутрь корпуса от отверстия на грани.
     *
     * side — id стороны корпуса
     * u, v — нормированные координаты отверстия
     * shape — 'round' | 'rect'
     * sizeCm — характерный размер (диаметр или сторона)
     * LphysCm — длина порта внутрь корпуса
     *
     * Трубка строится как «стакан» без дна и крышки (открытая с обеих сторон),
     * нормали — внутрь трубки, чтобы стенки были видны.
     */
    function buildPortTube(mesh, W, H, D, side, u, v, shape, sizeCm, LphysCm) {
        const sizeMm = sizeCm * 10;
        const L = LphysCm * 10;

        // Центр отверстия на плоскости грани (3D)
        const sp = sidePoint(side, { u, v }, W, H, D);
        const s = SIDE_BY_ID[side];

        // Ось внутрь корпуса = -sign вдоль axis
        const inward = {
            x: s.axis === 'x' ? -s.sign : 0,
            y: s.axis === 'y' ? -s.sign : 0,
            z: s.axis === 'z' ? -s.sign : 0
        };

        // Внутренний конец
        const ep = {
            x: sp.x + inward.x * L,
            y: sp.y + inward.y * L,
            z: sp.z + inward.z * L
        };

        if (shape === 'round') {
            const r = sizeMm / 2;
            buildCylinderBetween(mesh, sp, ep, r);
        } else {
            // прямоугольная трубка: квадрат sizeMm
            buildRectTubeBetween(mesh, sp, ep, sizeMm, sizeMm, s.axis);
        }
    }

    /**
     * Цилиндр между двумя точками (только боковая стенка, без днищ).
     * Нормаль наружу от оси.
     */
    function buildCylinderBetween(mesh, p1, p2, radius) {
        const N = CYL_SEGMENTS;

        // Локальная система координат: ось от p1 к p2
        const dir = {
            x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z
        };
        const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
        dir.x /= len; dir.y /= len; dir.z /= len;

        // Базис перпендикулярный dir
        const up = Math.abs(dir.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
        const ex = cross(dir, up);
        const exL = Math.hypot(ex.x, ex.y, ex.z) || 1;
        ex.x /= exL; ex.y /= exL; ex.z /= exL;
        const ey = cross(dir, ex);

        const circlePts = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            circlePts.push({
                cx: Math.cos(a), sx: Math.sin(a)
            });
        }

        for (let i = 0; i < N; i++) {
            const a1 = circlePts[i];
            const a2 = circlePts[(i + 1) % N];

            const p1a = [
                p1.x + ex.x * a1.cx * radius + ey.x * a1.sx * radius,
                p1.y + ex.y * a1.cx * radius + ey.y * a1.sx * radius,
                p1.z + ex.z * a1.cx * radius + ey.z * a1.sx * radius
            ];
            const p1b = [
                p1.x + ex.x * a2.cx * radius + ey.x * a2.sx * radius,
                p1.y + ex.y * a2.cx * radius + ey.y * a2.sx * radius,
                p1.z + ex.z * a2.cx * radius + ey.z * a2.sx * radius
            ];
            const p2a = [
                p2.x + ex.x * a1.cx * radius + ey.x * a1.sx * radius,
                p2.y + ex.y * a1.cx * radius + ey.y * a1.sx * radius,
                p2.z + ex.z * a1.cx * radius + ey.z * a1.sx * radius
            ];
            const p2b = [
                p2.x + ex.x * a2.cx * radius + ey.x * a2.sx * radius,
                p2.y + ex.y * a2.cx * radius + ey.y * a2.sx * radius,
                p2.z + ex.z * a2.cx * radius + ey.z * a2.sx * radius
            ];

            // Нормаль наружу от оси
            const midA = (a1.cx + a2.cx) / 2;
            const midS = (a1.sx + a2.sx) / 2;
            const nrmLen = Math.hypot(midA, midS) || 1;
            const outward = [
                ex.x * midA / nrmLen + ey.x * midS / nrmLen,
                ex.y * midA / nrmLen + ey.y * midS / nrmLen,
                ex.z * midA / nrmLen + ey.z * midS / nrmLen
            ];

            pushTriOriented(mesh, p1a, p1b, p2b, outward);
            pushTriOriented(mesh, p1a, p2b, p2a, outward);
        }
    }

    function cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    /**
     * Прямоугольная трубка (квадрат sizeMm × sizeMm) между p1 и p2.
     * axis — ось стороны (нужна для правильной ориентации квадрата).
     */
    function buildRectTubeBetween(mesh, p1, p2, w, h, axis) {
        const hw = w / 2, hh = h / 2;

        // Базис перпендикулярно оси внутрь
        // Ось p1→p2 совпадает с одной из глобальных осей по построению.
        let ex, ey;
        if (axis === 'z') { ex = { x: 1, y: 0, z: 0 }; ey = { x: 0, y: 1, z: 0 }; }
        else if (axis === 'x') { ex = { x: 0, y: 0, z: 1 }; ey = { x: 0, y: 1, z: 0 }; }
        else { ex = { x: 1, y: 0, z: 0 }; ey = { x: 0, y: 0, z: 1 }; }

        const corner = (p, sx, sy) => [
            p.x + ex.x * sx * hw + ey.x * sy * hh,
            p.y + ex.y * sx * hw + ey.y * sy * hh,
            p.z + ex.z * sx * hw + ey.z * sy * hh
        ];

        const corners = (p) => [
            corner(p, -1, -1),
            corner(p, +1, -1),
            corner(p, +1, +1),
            corner(p, -1, +1)
        ];

        const c1 = corners(p1);
        const c2 = corners(p2);

        // 4 боковые грани: (-1,-1)→(1,-1), (1,-1)→(1,1), (1,1)→(-1,1), (-1,1)→(-1,-1)
        const faces = [
            [0, 1, { x: -ey.x, y: -ey.y, z: -ey.z }], // низ
            [1, 2, { x: +ex.x, y: +ex.y, z: +ex.z }], // право
            [2, 3, { x: +ey.x, y: +ey.y, z: +ey.z }], // верх
            [3, 0, { x: -ex.x, y: -ex.y, z: -ex.z }]  // лево
        ];

        for (const [a, b, out] of faces) {
            pushTriOriented(mesh, c1[a], c1[b], c2[b], [out.x, out.y, out.z]);
            pushTriOriented(mesh, c1[a], c2[b], c2[a], [out.x, out.y, out.z]);
        }
    }

    /**
     * Полная сборка геометрии корпуса.
     */
    function buildHousingMesh(params, validation, portResult) {
        const mesh = makeMesh();

        const W = params.boxMax.w;
        const H = params.boxMax.h;
        const D = params.boxMax.d;
        const t = params.wallThickness;

        // dividerZ
        const total = params.vb1 + params.vb2;
        const dividerZ = total > 0
            ? (-D / 2) + (params.vb1 / total) * D
            : 0;

        // Лучший вариант порта
        const best = portResult && portResult.best;
        if (!best) {
            // без портов — просто коробка
            buildHousing(mesh, W, H, D, []);
            return mesh;
        }

        // Отверстия под порты
        const holes = [
            {
                side: best.port1.side,
                u: best.port1.u,
                v: best.port1.v,
                shape: best.port1.type === 'round' ? 'round' : 'rect',
                sizeCm: best.port1.S ? Math.sqrt(best.port1.S) : 10,
                LphysCm: best.port1.Lphys || 5
            },
            {
                side: best.port2.side,
                u: best.port2.u,
                v: best.port2.v,
                shape: best.port2.type === 'round' ? 'round' : 'rect',
                sizeCm: best.port2.S ? Math.sqrt(best.port2.S) : 10,
                LphysCm: best.port2.Lphys || 5
            }
        ];

        // 1. Корпус с отверстиями
        buildHousing(mesh, W, H, D, holes);

        // 2. Перегородка
        buildDivider(mesh, W, H, t, dividerZ, params.driverDiameter);

        // 3. Порты-трубки
        for (const h of holes) {
            buildPortTube(mesh, W, H, D, h.side, h.u, h.v, h.shape, h.sizeCm, h.LphysCm);
        }

        return mesh;
    }

    /**
     * Сериализация меша в ASCII STL.
     */
    function meshToSTL(mesh, name) {
        const lines = ['solid ' + (name || 'bp6_housing')];

        for (const tri of mesh.triangles) {
            const [p1, p2, p3] = tri;
            const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
            const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;

            lines.push('  facet normal ' + nx.toFixed(6) + ' ' + ny.toFixed(6) + ' ' + nz.toFixed(6));
            lines.push('    outer loop');
            lines.push('      vertex ' + p1[0].toFixed(4) + ' ' + p1[1].toFixed(4) + ' ' + p1[2].toFixed(4));
            lines.push('      vertex ' + p2[0].toFixed(4) + ' ' + p2[1].toFixed(4) + ' ' + p2[2].toFixed(4));
            lines.push('      vertex ' + p3[0].toFixed(4) + ' ' + p3[1].toFixed(4) + ' ' + p3[2].toFixed(4));
            lines.push('    endloop');
            lines.push('  endfacet');
        }
        lines.push('endsolid ' + (name || 'bp6_housing'));
        return lines.join('\n');
    }

    // ============================================================
    // КЛАСС
    // ============================================================

    class BP6SolverWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'bp6-solver',
                name: 'BP6 Solver',
                icon: 'icon-box',
                description: 'Солвер идеального корпуса бандпасса 6-го порядка',
                group: 'Акустика',
                category: 'acoustics',
                priority: 50,
                defaultSize: { width: 780, height: 680 },
                minSize: { width: 480, height: 480 },
                maxWindows: 2,
                metadata: { version: '3.1.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'bp6-stage-label',
                        render: (ctx) => {
                            const inst = ctx.baseWindow?.getRealInstance?.();
                            const el = document.createElement('span');
                            el.style.cssText = [
                                'font-size:11px','font-weight:600','color:var(--beige, #c8b89a)',
                                'padding:0 8px','white-space:nowrap','overflow:hidden',
                                'text-overflow:ellipsis','max-width:220px','user-select:none'
                            ].join(';');
                            if (!inst || !inst._fieldsReady) { el.textContent = 'BP6'; return el; }
                            const stage = STAGES[inst._stageIndex] || STAGES[0];
                            el.textContent = stage.title;
                            return el;
                        }
                    },
                    {
                        id: 'bp6-progress',
                        render: (ctx) => {
                            const inst = ctx.baseWindow?.getRealInstance?.();
                            if (!inst || !inst._fieldsReady) return document.createComment('not-ready');
                            const wrap = document.createElement('span');
                            wrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:0 6px;';
                            for (let i = 0; i < STAGES.length; i++) {
                                const dot = document.createElement('span');
                                dot.style.cssText = [
                                    'width:6px','height:6px','border-radius:50%',
                                    'background:' + (i <= inst._stageIndex
                                        ? 'var(--accent-red, #cc2233)'
                                        : 'rgba(200,184,154,0.18)')
                                ].join(';');
                                wrap.appendChild(dot);
                            }
                            return wrap;
                        }
                    },
                    {
                        id: 'bp6-btn-run',
                        type: 'button',
                        icon: 'icon-run',
                        label: 'Расчёт',
                        title: 'Выполнить валидацию и подбор порта',
                        action: 'runAll'
                    }
                ]
            };
        }

        static get hotkeys() {
            return { 'Ctrl+Enter': { action: 'runAll', label: 'Выполнить всё' } };
        }

        constructor(container, windowData, options = {}) {
            super(container, windowData, options);
            console.log('[BP6Solver] Constructor:', this.id);
        }

        _ensureFields() {
            if (this._fieldsReady) return;
            this._stageIndex = 0;

            this._params = {
                vb1: 30, vb2: 20,
                fb1: 35, fb2: 70,
                portType1: 'slot', portType2: 'round',
                driverImported: false, driverName: '', driverTS: null,
                driverDiameter: 165, driverX: 0.5, driverY: 0.5,
                boxMin: { w: 200, h: 300, d: 250 },
                boxMax: { w: 400, h: 500, d: 450 },
                portBlockedSides1: [], portBlockedSides2: [],
                targetFmin: 25, targetFmax: 120,
                resonanceChar: 'neutral', resonanceTargets: [40, 80],
                wallThickness: 18
            };

            this._validation = null;
            this._portResult = null;
            this._stlText = null;
            this._stlBox = null;
            this._meshStats = null;

            this._stageHost = null;
            this._bottomBar = null;
            this._stageTitleEl = null;
            this._statusLine = null;

            this._fieldsReady = true;
        }

        // ============================================================
        // BUILD
        // ============================================================

        buildContent(el) {
            this._ensureFields();
            const ui  = this.ui;
            const dom = this.utils.dom;

            el.style.cssText = [
                'display:flex','flex-direction:column','width:100%','height:100%',
                'background:var(--bg-dark)','box-sizing:border-box','overflow:hidden'
            ].join(';');

            const head = dom.el('div', {
                style: {
                    display:'flex', alignItems:'center', gap:'8px',
                    padding:'10px 14px', borderBottom:'1px solid var(--border-color)',
                    flexShrink:'0'
                }
            }, [
                ui.text({ text: 'BP6 Solver', variant: 'heading' }),
                ui.text({ text: '·', variant: 'muted' })
            ]);
            this._stageTitleEl = ui.text({ text: STAGES[0].title, variant: 'muted' });
            head.appendChild(this._stageTitleEl);
            el.appendChild(head);

            this._stageHost = dom.el('div', {
                style: {
                    flex:'1 1 auto', minHeight:'0',
                    overflowY:'auto', overflowX:'hidden',
                    padding:'14px 16px 20px'
                }
            });
            el.appendChild(this._stageHost);

            this._statusLine = dom.el('div', {
                style: {
                    padding:'6px 14px', borderTop:'1px solid var(--border-color)',
                    fontSize:'11px', color:'var(--text-muted)',
                    fontFamily:'"Courier New", monospace',
                    flexShrink:'0', whiteSpace:'nowrap',
                    overflow:'hidden', textOverflow:'ellipsis'
                }
            }, ['—']);
            el.appendChild(this._statusLine);

            this._bottomBar = dom.el('div', {
                style: {
                    display:'flex', alignItems:'center', gap:'4px',
                    padding:'6px 8px', borderTop:'1px solid var(--border-color)',
                    background:'var(--bg-panel)', flexShrink:'0', overflowX:'auto'
                }
            });
            el.appendChild(this._bottomBar);

            this._renderStage();
        }

        _buildBottomBar() {
            const ui  = this.ui;
            const bar = this._bottomBar;
            if (!bar) return;
            while (bar.firstChild) bar.removeChild(bar.firstChild);

            const mkBtn = (label, iconId, disabled, onClick) => {
                const b = ui.button({ label, icon: iconId, variant: 'ghost', disabled: !!disabled, onClick });
                b.style.minWidth = 'auto';
                b.style.padding = '5px 12px';
                b.style.fontSize = '11px';
                return b;
            };

            bar.appendChild(mkBtn('Назад', 'icon-arrow-left', this._stageIndex === 0, () => this.prevStage()));

            const dots = document.createElement('div');
            dots.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 8px;flex:0 0 auto;';
            for (let i = 0; i < STAGES.length; i++) {
                const s = STAGES[i];
                const isActive = i === this._stageIndex;
                const isDone   = i <  this._stageIndex;

                const wrap = document.createElement('button');
                wrap.type = 'button';
                wrap.title = s.title + ' — ' + s.hint;
                wrap.style.cssText = [
                    'display:inline-flex','align-items:center','gap:5px',
                    'padding:4px 10px','border-radius:14px',
                    'border:1px solid ' + (isActive ? 'var(--accent-red,#cc2233)' : 'var(--border-color)'),
                    'background:' + (isActive
                        ? 'var(--accent-red,#cc2233)'
                        : (isDone ? 'rgba(204,34,51,0.15)' : 'transparent')),
                    'color:' + (isActive ? '#fff' : 'var(--text-secondary)'),
                    'font-size:11px','font-weight:600','font-family:inherit',
                    'cursor:pointer','transition:all 0.2s ease'
                ].join(';');

                const num = document.createElement('span');
                num.textContent = String(i + 1);
                num.style.cssText = [
                    'display:inline-flex','align-items:center','justify-content:center',
                    'width:16px','height:16px','border-radius:50%',
                    'background:' + (isActive ? 'rgba(255,255,255,0.22)' : 'rgba(200,184,154,0.12)'),
                    'font-size:10px','font-weight:700'
                ].join(';');
                wrap.appendChild(num);

                const lbl = document.createElement('span');
                lbl.textContent = s.title;
                wrap.appendChild(lbl);
                wrap.addEventListener('click', () => this.goToStage(i));
                dots.appendChild(wrap);
            }
            bar.appendChild(dots);

            bar.appendChild(mkBtn('Далее', 'icon-arrow-right',
                this._stageIndex === STAGES.length - 1, () => this.nextStage()));

            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            bar.appendChild(spacer);

            if (this._stageIndex === 1 || this._stageIndex === 2) {
                const run = ui.button({
                    label: 'Выполнить всё', icon: 'icon-run',
                    variant: 'primary', onClick: () => this.runAll()
                });
                run.style.padding = '5px 14px';
                run.style.fontSize = '11px';
                bar.appendChild(run);
            }
        }

        _renderStage() {
            const host = this._stageHost;
            if (!host) return;
            while (host.firstChild) host.removeChild(host.firstChild);

            const stage = STAGES[this._stageIndex];
            if (this._stageTitleEl) this._stageTitleEl.textContent = stage.title;

            switch (stage.id) {
                case 'stage-input':    this._renderStageInput(host);    break;
                case 'stage-validate': this._renderStageValidate(host); break;
                case 'stage-port':     this._renderStagePort(host);     break;
                case 'stage-stl':      this._renderStageSTL(host);      break;
            }

            this._buildBottomBar();
            this._updateStatus();
        }

        _updateStatus() {
            if (!this._statusLine) return;
            const p = this._params;
            this._statusLine.textContent = [
                STAGES[this._stageIndex].title,
                'Vb1=' + p.vb1 + 'L', 'Vb2=' + p.vb2 + 'L',
                'Fb1=' + p.fb1 + 'Hz', 'Fb2=' + p.fb2 + 'Hz',
                'D=' + p.driverDiameter + 'мм'
            ].join('  ·  ');
        }

        // ----- ХЕЛПЕРЫ ФОРМ -----

        _field(labelText, node, hint) {
            const ui  = this.ui;
            const dom = this.utils.dom;
            const head = dom.el('div', {
                style: { display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'8px' }
            }, [ ui.text({ text: labelText, variant: 'muted' }) ]);
            if (hint) head.appendChild(ui.text({ text: hint, variant: 'muted' }));
            return dom.el('div', {
                style: { display:'flex', flexDirection:'column', gap:'3px', marginBottom:'8px' }
            }, [ head, node ]);
        }

        _numInput(value, onChange, opts = {}) {
            const input = this.ui.input({
                value: String(value), type: 'number',
                placeholder: opts.placeholder || '',
                onChange: (e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onChange(v);
                }
            });
            if (opts.min != null) input.min = opts.min;
            if (opts.max != null) input.max = opts.max;
            if (opts.step != null) input.step = opts.step;
            input.style.fontFamily = '"Courier New", monospace';
            return input;
        }

        _select(value, options, onChange) {
            const sel = document.createElement('select');
            sel.className = 'ui-input';
            sel.style.cssText = [
                'width:100%','padding:8px 12px','border-radius:6px',
                'background:var(--bg-input,#2a2a2a)','color:var(--text-primary,#e0d8cc)',
                'border:1px solid var(--border-color)','font-size:12px','font-family:inherit',
                'outline:none','box-sizing:border-box','cursor:pointer'
            ].join(';');
            for (const o of options) {
                const op = document.createElement('option');
                op.value = o.id; op.textContent = o.label;
                if (o.id === value) op.selected = true;
                sel.appendChild(op);
            }
            sel.addEventListener('change', () => onChange(sel.value));
            return sel;
        }

        _row(labelText, valueText) {
            const ui  = this.ui;
            const dom = this.utils.dom;
            return dom.el('div', {
                style: {
                    display:'flex', justifyContent:'space-between', gap:'12px',
                    fontSize:'11px', fontFamily:'"Courier New", monospace',
                    padding:'3px 0', borderBottom:'1px dashed rgba(200,184,154,0.08)'
                }
            }, [
                ui.text({ text: labelText, variant: 'muted' }),
                ui.text({ text: String(valueText) })
            ]);
        }

        _card(title, hint, children) {
            const ui  = this.ui;
            const dom = this.utils.dom;
            const head = dom.el('div', {
                style: { display:'flex', flexDirection:'column', gap:'2px', marginBottom:'10px' }
            }, [
                ui.text({ text: title, variant: 'heading' }),
                hint ? ui.text({ text: hint, variant: 'muted' }) : null
            ].filter(Boolean));
            return ui.block({ title: '', children: [ head, dom.el('div', {}, children) ] });
        }

        // ============================================================
        // ЭТАП 1 — ПАРАМЕТРЫ
        // ============================================================

        _renderStageInput(host) {
            const ui  = this.ui;
            const dom = this.utils.dom;
            const p   = this._params;

            host.appendChild(this._card('Камеры',
                'Объёмы задней и передней камер, настройка портов, толщина стенок', [
                    dom.el('div', {
                        style: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
                    }, [
                        this._field('Vb1 — задняя, л',
                            this._numInput(p.vb1, v => { p.vb1 = v; this._updateStatus(); },
                                { min: 0.1, max: 500, step: 0.1 }), '0.1…500'),
                        this._field('Vb2 — передняя, л',
                            this._numInput(p.vb2, v => { p.vb2 = v; this._updateStatus(); },
                                { min: 0.1, max: 500, step: 0.1 }), '0.1…500'),
                        this._field('Fb1 — задний порт, Гц',
                            this._numInput(p.fb1, v => { p.fb1 = v; this._updateStatus(); },
                                { min: 10, max: 200, step: 0.5 }), '10…200'),
                        this._field('Fb2 — передний порт, Гц',
                            this._numInput(p.fb2, v => { p.fb2 = v; this._updateStatus(); },
                                { min: 10, max: 200, step: 0.5 }), '10…200')
                    ]),
                    this._field('Толщина стенок, мм',
                        this._numInput(p.wallThickness, v => p.wallThickness = v,
                            { min: 4, max: 60, step: 1 }), 'Vminстенок')
                ]
            ));

            const port1Grid = this._makeSidesGrid(() => p.portBlockedSides1);
            const port2Grid = this._makeSidesGrid(() => p.portBlockedSides2);

            host.appendChild(this._card('Порт 1 — задний',
                'Тип порта и стороны, недоступные для его отверстия', [
                    this._field('Тип порта 1',
                        this._select(p.portType1, PORT_TYPES, v => p.portType1 = v)),
                    dom.el('div', {
                        style: { fontSize:'11px', color:'var(--text-muted)', marginBottom:'6px' }
                    }, ['Запрещённые стороны (нажмите на плитку):']),
                    port1Grid.grid
                ]
            ));

            host.appendChild(this._card('Порт 2 — передний',
                'Тип порта и стороны, недоступные для его отверстия', [
                    this._field('Тип порта 2',
                        this._select(p.portType2, PORT_TYPES, v => p.portType2 = v)),
                    dom.el('div', {
                        style: { fontSize:'11px', color:'var(--text-muted)', marginBottom:'6px' }
                    }, ['Запрещённые стороны (нажмите на плитку):']),
                    port2Grid.grid
                ]
            ));

            host.appendChild(this._card('Динамик',
                'TS-параметры и физическое расположение', [
                    dom.el('div', {
                        style: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }
                    }, [
                        this._field('Внешний диаметр, мм',
                            this._numInput(p.driverDiameter, v => { p.driverDiameter = v; this._updateStatus(); },
                                { min: 20, max: 600, step: 0.5 })),
                        this._field('Расположение X (0…1)',
                            this._numInput(p.driverX, v => p.driverX = v,
                                { min: 0, max: 1, step: 0.01 })),
                        this._field('Расположение Y (0…1)',
                            this._numInput(p.driverY, v => p.driverY = v,
                                { min: 0, max: 1, step: 0.01 }))
                    ]),
                    dom.el('div', {
                        style: {
                            display:'flex', gap:'8px', alignItems:'center',
                            padding:'8px 10px', border:'1px dashed var(--border-color)',
                            borderRadius:'6px',
                            background: p.driverImported ? 'rgba(68,204,136,0.06)' : 'transparent'
                        }
                    }, [
                        ui.button({
                            label: p.driverImported ? 'Переимпортировать ТС' : 'Импорт ТС',
                            icon: 'icon-import',
                            variant: p.driverImported ? 'success' : 'ghost',
                            onClick: () => this._importDriverTS()
                        }),
                        ui.text({
                            text: p.driverImported
                                ? ('✓ ' + (p.driverName || 'ТС загружены'))
                                : 'Файл .json (Fs, Qts, Vas, Re, Le, Xmax, Sd…)',
                            variant: 'muted'
                        })
                    ])
                ]
            ));

            const minMaxRow = (label, key) => {
                const o = p[key];
                return dom.el('div', {
                    style: { display:'grid', gridTemplateColumns:'52px 1fr 1fr 1fr', gap:'8px', alignItems:'center', padding:'2px 0' }
                }, [
                    ui.text({ text: label, variant: 'muted' }),
                    this._numInput(o.w, v => o.w = v, { min: 10, max: 3000, step: 1 }),
                    this._numInput(o.h, v => o.h = v, { min: 10, max: 3000, step: 1 }),
                    this._numInput(o.d, v => o.d = v, { min: 10, max: 3000, step: 1 })
                ]);
            };

            host.appendChild(this._card('Ограничение по размеру, мм',
                'Мин/макс габариты корпуса', [
                    dom.el('div', {
                        style: { display:'grid', gridTemplateColumns:'52px 1fr 1fr 1fr', gap:'8px', alignItems:'center', marginBottom:'4px' }
                    }, [
                        ui.text({ text: '', variant: 'muted' }),
                        ui.text({ text: 'W (ширина)', variant: 'muted' }),
                        ui.text({ text: 'H (высота)', variant: 'muted' }),
                        ui.text({ text: 'D (глубина)', variant: 'muted' })
                    ]),
                    minMaxRow('Мин', 'boxMin'),
                    minMaxRow('Макс', 'boxMax')
                ]
            ));

            host.appendChild(this._card('Целевой диапазон частот',
                'В этих пределах ищем рабочий диапазон корпуса', [
                    dom.el('div', {
                        style: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
                    }, [
                        this._field('Fmin, Гц',
                            this._numInput(p.targetFmin, v => { p.targetFmin = v; this._updateStatus(); },
                                { min: 5, max: 500, step: 1 }), '≥ 20'),
                        this._field('Fmax, Гц',
                            this._numInput(p.targetFmax, v => { p.targetFmax = v; this._updateStatus(); },
                                { min: 20, max: 2000, step: 1 }), '≤ 200')
                    ])
                ]
            ));

            this._renderResonanceCard(host, p);

            host.appendChild(ui.text({
                text: 'Все расчёты — здесь. STL содержит корпус, перегородку и порты.',
                variant: 'muted'
            }));
        }

        _makeSidesGrid(listGetter) {
            const dom = this.utils.dom;
            const grid = dom.el('div', {
                style: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px' }
            });
            const render = () => {
                while (grid.firstChild) grid.removeChild(grid.firstChild);
                const blockedList = listGetter();
                for (const s of SIDES) {
                    const blocked = blockedList.includes(s.id);
                    const tile = document.createElement('button');
                    tile.type = 'button';
                    tile.title = blocked ? ('Разрешить "' + s.label + '"') : ('Запретить "' + s.label + '"');
                    tile.style.cssText = [
                        'display:flex','flex-direction:column','align-items:center',
                        'justify-content:center','gap:6px','padding:12px 8px',
                        'border-radius:8px',
                        'border:1px solid ' + (blocked ? 'var(--accent-red,#cc2233)' : 'var(--border-color)'),
                        'background:' + (blocked ? 'rgba(204,34,51,0.10)' : 'var(--bg-card)'),
                        'color:' + (blocked ? 'var(--accent-red,#cc2233)' : 'var(--text-primary)'),
                        'font-family:inherit','font-size:11px','font-weight:600',
                        'cursor:pointer','transition:all 0.2s ease','user-select:none'
                    ].join(';');

                    const icon = document.createElement('span');
                    icon.style.cssText = [
                        'display:inline-flex','align-items:center','justify-content:center',
                        'width:28px','height:28px','border-radius:50%',
                        'background:' + (blocked ? 'rgba(204,34,51,0.18)' : 'rgba(200,184,154,0.10)'),
                        'font-size:14px'
                    ].join(';');
                    icon.textContent = blocked ? '🚫' : '○';
                    tile.appendChild(icon);

                    const lbl = document.createElement('span');
                    lbl.textContent = s.label;
                    tile.appendChild(lbl);

                    const st = document.createElement('span');
                    st.textContent = blocked ? 'Запрещена' : 'Разрешена';
                    st.style.cssText = [
                        'font-size:9px','font-weight:500','letter-spacing:0.3px','text-transform:uppercase',
                        'color:' + (blocked ? 'rgba(204,34,51,0.85)' : 'var(--text-muted)')
                    ].join(';');
                    tile.appendChild(st);

                    tile.addEventListener('click', () => {
                        const list = listGetter();
                        if (blocked) {
                            const i = list.indexOf(s.id);
                            if (i >= 0) list.splice(i, 1);
                        } else {
                            list.push(s.id);
                        }
                        render();
                    });
                    grid.appendChild(tile);
                }
            };
            render();
            return { grid, render };
        }

        _renderResonanceCard(host, p) {
            const ui  = this.ui;
            const dom = this.utils.dom;

            const select = this._select(p.resonanceChar, RESONANCE_PRESETS, (v) => {
                p.resonanceChar = v;
                const preset = RESONANCE_PRESETS.find(r => r.id === v);
                if (preset && preset.id !== 'custom') p.resonanceTargets = preset.targets.slice();
                syncAll();
            });

            const hintEl = dom.el('div', {
                style: { fontSize:'10px', color:'var(--text-muted)', marginTop:'2px', marginBottom:'8px' }
            });

            const targetsInput = this.ui.input({
                value: (p.resonanceTargets || []).join(', '),
                placeholder: 'например: 40, 55, 80',
                onChange: (e) => {
                    const arr = e.target.value.split(',')
                        .map(s => parseFloat(s.trim()))
                        .filter(v => !isNaN(v) && v > 0);
                    p.resonanceTargets = arr;
                    renderChips();
                }
            });
            targetsInput.style.fontFamily = '"Courier New", monospace';

            const targetsField = this._field('Целевые резонансы, Гц', targetsInput,
                'можно править вручную — через запятую');

            const chipsWrap = dom.el('div', {
                style: {
                    marginTop:'4px', padding:'10px 12px', borderRadius:'8px',
                    border:'1px dashed var(--border-color)', background:'rgba(200,184,154,0.03)'
                }
            });

            const renderChips = () => {
                while (chipsWrap.firstChild) chipsWrap.removeChild(chipsWrap.firstChild);
                const preset = RESONANCE_PRESETS.find(r => r.id === p.resonanceChar) || RESONANCE_PRESETS[0];

                chipsWrap.appendChild(dom.el('div', {
                    style: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }
                }, [
                    ui.text({ text: 'Что поставит солвер', variant: 'heading' }),
                    ui.text({ text: preset.q != null ? ('Q ≈ ' + preset.q) : 'Q —', variant: 'muted' })
                ]));

                const list = p.resonanceTargets || [];
                if (list.length === 0) {
                    chipsWrap.appendChild(dom.el('div', {
                        style: { fontSize:'11px', color:'var(--text-muted)', fontStyle:'italic', padding:'6px 0' }
                    }, ['Введите частоты выше — через запятую.']));
                } else {
                    const row = dom.el('div', { style: { display:'flex', flexWrap:'wrap', gap:'6px' } });
                    for (const f of list) {
                        const chip = document.createElement('span');
                        chip.textContent = f + ' Гц';
                        chip.style.cssText = [
                            'display:inline-flex','align-items:center','padding:4px 10px','border-radius:14px',
                            'border:1px solid var(--accent-red,#cc2233)','background:rgba(204,34,51,0.10)',
                            'color:var(--accent-red,#cc2233)','font-size:11px','font-weight:700',
                            'font-family:"Courier New", monospace'
                        ].join(';');
                        row.appendChild(chip);
                    }
                    chipsWrap.appendChild(row);
                }

                chipsWrap.appendChild(dom.el('div', {
                    style: { marginTop:'8px', fontSize:'11px', color:'var(--text-secondary)' }
                }, [
                    ui.text({ text: 'АЧХ: ', variant: 'muted' }),
                    ui.text({ text: preset.curve })
                ]));
            };

            const syncAll = () => {
                const preset = RESONANCE_PRESETS.find(r => r.id === p.resonanceChar) || RESONANCE_PRESETS[0];
                hintEl.textContent = preset.hint;
                const str = (p.resonanceTargets || []).join(', ');
                if (targetsInput.value !== str) targetsInput.value = str;
                renderChips();
            };

            host.appendChild(this._card('Характер резонансов',
                'Выберите тип — цели подставятся. Можно отредактировать «Целевые резонансы».', [
                    this._field('Тип', select), hintEl, targetsField, chipsWrap
                ]
            ));
            syncAll();
        }

        _importDriverTS() {
            const self = this;
            if (!this.utils || !this.utils.file) {
                this.notify('Импорт', 'utils.file недоступен', 'error');
                return;
            }
            this.utils.file.openJSON((parsed, file, err) => {
                if (err || !parsed) {
                    self.notify('Импорт ТС', 'Не удалось прочитать файл', 'error');
                    return;
                }
                const p = self._params;
                const ts = (parsed.driver && typeof parsed.driver === 'object') ? parsed.driver : parsed;
                p.driverTS = ts;
                p.driverImported = true;
                p.driverName = (file && file.name) || 'TS';
                if (typeof ts.diameter === 'number') p.driverDiameter = ts.diameter;
                self.notify('Импорт ТС', 'Загружено: ' + Object.keys(ts).slice(0, 6).join(', '), 'success');
                self._renderStage();
            }, '.json');
        }

        // ============================================================
        // ЭТАП 2 — ВАЛИДАЦИЯ
        // ============================================================

        _renderStageValidate(host) {
            const ui  = this.ui;
            const p   = this._params;
            const v = this._validation;

            if (!v) {
                host.appendChild(this._card('Валидация',
                    'Нажмите «Выполнить всё» — проверка выполнится сразу', [
                    ui.text({ text: 'Здесь появится отчёт о проверке.', variant: 'muted' })
                ]));
                return;
            }

            host.appendChild(this._card(
                v.ok ? 'Габариты в порядке' : 'Проблема с габаритами',
                v.ok ? 'Объём камер и стенок помещается в макс. размеры' : 'Уменьшите камеры или увеличьте габариты', [
                    this._row('Vb1 + Vb2 (л)', (p.vb1 + p.vb2).toFixed(2)),
                    this._row('Стенки (л)', v.wallVol.toFixed(2)),
                    this._row('Порты (л, оценка)', v.portVol.toFixed(2)),
                    this._row('Суммарно (л)', v.totalVol.toFixed(2)),
                    this._row('Внутренний объём макс. корпуса (л)', v.maxInnerVol.toFixed(2)),
                    this._row('Свободно (л)', (v.maxInnerVol - v.totalVol).toFixed(2))
                ]
            ));

            host.appendChild(this._card(
                v.driverFits ? 'Динамик влезает' : 'Динамик не влезает',
                v.driverFits ? 'Диаметр меньше минимального размера стенки' : 'Уменьшите диаметр или увеличьте габариты', [
                    this._row('Диаметр динамика (мм)', p.driverDiameter),
                    this._row('Мин. стенка (мм)', Math.min(p.boxMin.w, p.boxMin.h, p.boxMin.d)),
                    this._row('Запас (мм)', (Math.min(p.boxMin.w, p.boxMin.h, p.boxMin.d) - p.driverDiameter).toFixed(1))
                ]
            ));

            host.appendChild(this._card(
                v.fbReachable ? 'Fb1 и Fb2 достижимы' : 'Fb не достижимы',
                v.fbReachable ? 'Для обоих портов хватает длины внутри корпуса' : 'Порты не помещаются — измените габариты или Fb', [
                    this._row('Fb1', p.fb1 + ' Гц → L = ' + (v.port1?.Lphys?.toFixed(1) ?? '—') + ' см'),
                    this._row('Fb2', p.fb2 + ' Гц → L = ' + (v.port2?.Lphys?.toFixed(1) ?? '—') + ' см'),
                    this._row('S порта 1 (см²)', v.port1?.S?.toFixed(1) ?? '—'),
                    this._row('S порта 2 (см²)', v.port2?.S?.toFixed(1) ?? '—')
                ]
            ));

            host.appendChild(this._card('Доступные стороны',
                'После исключения чёрных списков', [
                    this._row('Порт 1 доступно', v.sides1Free.length ? v.sides1Free.join(', ') : '—'),
                    this._row('Порт 2 доступно', v.sides2Free.length ? v.sides2Free.join(', ') : '—')
                ]
            ));

            if (!v.ok || !v.driverFits || !v.fbReachable) {
                host.appendChild(this._card('Что можно сделать', 'Подсказки', [
                    ui.text({ text: '• Увеличить габариты (W/H/D)', variant: 'muted' }),
                    ui.text({ text: '• Уменьшить Vb1 / Vb2', variant: 'muted' }),
                    ui.text({ text: '• Уменьшить диаметр динамика', variant: 'muted' }),
                    ui.text({ text: '• Понизить / повысить Fb1 / Fb2', variant: 'muted' }),
                    ui.text({ text: '• Открыть больше сторон корпуса', variant: 'muted' })
                ]));
            }
        }

        // ============================================================
        // ЭТАП 3 — РАСЧЁТ
        // ============================================================

        _renderStagePort(host) {
            const ui = this.ui;
            const r = this._portResult;

            if (!r) {
                host.appendChild(this._card('Расчёт порта',
                    'Нажмите «Выполнить всё» — начнётся перебор сторон и позиций', [
                    ui.text({ text: 'Здесь появится лучшая конфигурация и метрики потока.', variant: 'muted' })
                ]));
                return;
            }

            host.appendChild(this._card('Лучший вариант',
                'Выбран по формуле J_simple (меньше — лучше)', [
                    this._row('J_simple', r.best.J.toFixed(4)),
                    this._row('Порт 1 (задний)',
                        r.best.port1.side + '  ' + r.best.port1.type +
                        '  L=' + (r.best.port1.Lphys?.toFixed(1) ?? '—') + 'см'),
                    this._row('Порт 2 (передний)',
                        r.best.port2.side + '  ' + r.best.port2.type +
                        '  L=' + (r.best.port2.Lphys?.toFixed(1) ?? '—') + 'см'),
                    this._row('Lpath / Ldirect',
                        r.best.metrics.Lpath.toFixed(1) + ' / ' + r.best.metrics.Ldirect.toFixed(1) + ' мм'),
                    this._row('Nturns', r.best.metrics.Nturns),
                    this._row('θtotal', (r.best.metrics.thetaTotal * 180 / Math.PI).toFixed(1) + '°')
                ]
            ));

            const top = r.candidates.slice(0, 5);
            host.appendChild(this._card('Топ-5 вариантов',
                'Первые 5 по J_simple', [
                    ...top.map((c, i) => this._row(
                        '#' + (i + 1) + '  J=' + c.J.toFixed(3),
                        c.port1.side + '→' + c.port2.side + '  Nturns=' + c.metrics.Nturns
                    ))
                ]
            ));

            host.appendChild(this._card('Статистика', 'Сколько вариантов проверено', [
                this._row('Всего проверено', r.stats.total),
                this._row('Прошло фильтры', r.stats.passed),
                this._row('Отсеяно', r.stats.total - r.stats.passed)
            ]));

            host.appendChild(ui.button({
                label: 'Перейти к экспорту STL',
                icon: 'icon-export',
                variant: 'primary',
                onClick: () => this.goToStage(3)
            }));
        }

        // ============================================================
        // ЭТАП 4 — STL
        // ============================================================

        _renderStageSTL(host) {
            const ui  = this.ui;
            const p   = this._params;

            if (!this._stlText) {
                const canGenerate = !!(this._portResult && this._portResult.best);
                host.appendChild(this._card('STL',
                    'Содержит: корпус + перегородку + два порта-трубки', [
                    ui.button({
                        label: canGenerate ? 'Сгенерировать STL' : 'Сначала выполните расчёт',
                        icon: 'icon-export',
                        variant: canGenerate ? 'primary' : 'ghost',
                        disabled: !canGenerate,
                        onClick: () => this._generateSTL()
                    })
                ]));
                return;
            }

            const box = this._stlBox;
            const stats = this._meshStats || { tris: 0 };

            host.appendChild(this._card('Геометрия корпуса',
                'Реальная модель: параллелепипед с отверстиями, перегородка, порты-трубки', [
                    this._row('W × H × D', box.W.toFixed(1) + ' × ' + box.H.toFixed(1) + ' × ' + box.D.toFixed(1) + ' мм'),
                    this._row('Толщина стенок', p.wallThickness + ' мм'),
                    this._row('dividerZ (граница камер)', box.dividerZ.toFixed(2) + ' мм'),
                    this._row('Отверстие драйвера', p.driverDiameter + ' мм (круглое)'),
                    this._row('Порт 1', box.port1.side + ' / ' + box.port1.type + ' / L=' + box.port1.L.toFixed(1) + ' мм'),
                    this._row('Порт 2', box.port2.side + ' / ' + box.port2.type + ' / L=' + box.port2.L.toFixed(1) + ' мм'),
                    this._row('Треугольников в STL', stats.tris)
                ]
            ));

            host.appendChild(ui.button({
                label: 'Скачать STL',
                icon: 'icon-download',
                variant: 'primary',
                onClick: () => this._downloadSTL()
            }));

            host.appendChild(ui.button({
                label: 'Сгенерировать заново',
                icon: 'icon-refresh',
                variant: 'ghost',
                onClick: () => this._generateSTL()
            }));

            host.appendChild(ui.text({
                text: 'STL содержит корпус с отверстиями под порты, перегородку с отверстием под драйвер и два порта-трубки внутри.',
                variant: 'muted'
            }));
        }

        _generateSTL() {
            try {
                const mesh = buildHousingMesh(this._params, this._validation, this._portResult);
                this._stlText = meshToSTL(mesh, 'bp6_housing');
                this._meshStats = { tris: mesh.triangles.length };

                const p = this._params;
                const total = p.vb1 + p.vb2;
                const dividerZ = total > 0
                    ? (-p.boxMax.d / 2) + (p.vb1 / total) * p.boxMax.d
                    : 0;

                const best = this._portResult.best;
                this._stlBox = {
                    W: p.boxMax.w,
                    H: p.boxMax.h,
                    D: p.boxMax.d,
                    dividerZ,
                    port1: {
                        side: best.port1.side,
                        type: best.port1.type,
                        L: (best.port1.Lphys || 0) * 10
                    },
                    port2: {
                        side: best.port2.side,
                        type: best.port2.type,
                        L: (best.port2.Lphys || 0) * 10
                    }
                };

                this.notify('STL',
                    'Готово: ' + this._meshStats.tris + ' треугольников',
                    'success');
                this._renderStage();
            } catch (e) {
                console.error('[BP6Solver] STL generation error:', e);
                this.notify('Ошибка', String(e.message || e), 'error');
            }
        }

        _downloadSTL() {
            if (!this._stlText) return;
            try {
                const blob = new Blob([this._stlText], { type: 'model/stl' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'bp6_housing.stl';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                this.notify('STL', 'Файл сохранён', 'success');
            } catch (e) {
                console.error('[BP6Solver] STL download error:', e);
                this.notify('Ошибка', 'Не удалось сохранить STL', 'error');
            }
        }

        // ============================================================
        // РАСЧЁТ
        // ============================================================

        _runValidation() {
            const p = this._params;
            const W = p.boxMax.w, H = p.boxMax.h, D = p.boxMax.d;
            const t = p.wallThickness;

            const innerW = Math.max(0, W - 2 * t);
            const innerH = Math.max(0, H - 2 * t);
            const innerD = Math.max(0, D - 2 * t);
            const maxInnerVol = (innerW * innerH * innerD) / 1e6;

            const wallVol = computeWallVolume(W, H, D, t);

            const ts = p.driverTS || {};
            const Sd_cm2 = ts.Sd ?? (Math.PI * Math.pow(p.driverDiameter / 2 / 10, 2) * 0.75);
            const Xmax_mm = ts.Xmax ?? 6;

            const S1 = Math.max(10, minPortArea(Sd_cm2, Xmax_mm, p.fb1));
            const S2 = Math.max(10, minPortArea(Sd_cm2, Xmax_mm, p.fb2));

            const Leff1 = requiredPortLength(p.fb1, p.vb1, S1);
            const Leff2 = requiredPortLength(p.fb2, p.vb2, S2);

            const char1 = charSizeFromArea(S1, p.portType1);
            const char2 = charSizeFromArea(S2, p.portType2);
            const Lphys1 = Leff1 != null ? physicalPortLength(Leff1, p.portType1, char1) : null;
            const Lphys2 = Leff2 != null ? physicalPortLength(Leff2, p.portType2, char2) : null;

            const portVol1 = Lphys1 != null ? (S1 * Lphys1) / 1000 : 0;
            const portVol2 = Lphys2 != null ? (S2 * Lphys2) / 1000 : 0;
            const portVol = portVol1 + portVol2;

            const totalVol = p.vb1 + p.vb2 + wallVol + portVol;
            const ok = totalVol <= maxInnerVol + 0.5;

            const minWallDim = Math.min(p.boxMin.w, p.boxMin.h, p.boxMin.d);
            const driverFits = p.driverDiameter < minWallDim - 10;

            const sides1Free = SIDES.map(s => s.id).filter(id => !p.portBlockedSides1.includes(id));
            const sides2Free = SIDES.map(s => s.id).filter(id => !p.portBlockedSides2.includes(id));

            const fits1 = sides1Free.some(side => portFitsInBox(Lphys1 ?? 0, side, W, H, D, t));
            const fits2 = sides2Free.some(side => portFitsInBox(Lphys2 ?? 0, side, W, H, D, t));

            const fbReachable = fits1 && fits2;

            this._validation = {
                ok, maxInnerVol, wallVol, portVol, totalVol,
                driverFits, sides1Free, sides2Free,
                port1: { S: S1, Leff: Leff1, Lphys: Lphys1, fits: fits1, char: char1 },
                port2: { S: S2, Leff: Leff2, Lphys: Lphys2, fits: fits2, char: char2 },
                fbReachable, Sd: Sd_cm2, Xmax: Xmax_mm
            };
            return this._validation;
        }

        _runPortSearch() {
            const v = this._validation || this._runValidation();
            const p = this._params;

            const W = p.boxMax.w, H = p.boxMax.h, D = p.boxMax.d;
            const total = p.vb1 + p.vb2;
            const dividerZ = total > 0 ? (-D / 2) + (p.vb1 / total) * D : 0;
            const geo = { W, H, D, dividerZ };

            const UVS = [0.2, 0.5, 0.8];

            const sides1 = v.sides1Free.length ? v.sides1Free : SIDES.map(s => s.id);
            const sides2 = v.sides2Free.length ? v.sides2Free : SIDES.map(s => s.id);

            const results = [];
            let totalCount = 0;

            for (const side1 of sides1) {
                for (const u1 of UVS) {
                    for (const v1 of UVS) {
                        for (const side2 of sides2) {
                            for (const u2 of UVS) {
                                for (const v2 of UVS) {
                                    totalCount++;
                                    if (side1 === side2 &&
                                        Math.abs(u1 - u2) < 0.1 &&
                                        Math.abs(v1 - v2) < 0.1) continue;

                                    const uvIn  = { u: u1, v: v1 };
                                    const uvOut = { u: u2, v: v2 };

                                    const path = buildFlowPath(side1, uvIn, side2, uvOut, geo);
                                    const metrics = analyzePath(path.points);
                                    const J = computeJ(metrics, p.portType1);

                                    results.push({
                                        port1: { side: side1, u: u1, v: v1, type: p.portType1,
                                                 S: v.port1.S, Lphys: v.port1.Lphys },
                                        port2: { side: side2, u: u2, v: v2, type: p.portType2,
                                                 S: v.port2.S, Lphys: v.port2.Lphys },
                                        metrics, J
                                    });
                                }
                            }
                        }
                    }
                }
            }

            results.sort((a, b) => a.J - b.J);

            this._portResult = {
                best: results[0] || null,
                candidates: results,
                stats: { total: totalCount, passed: results.length }
            };
            return this._portResult;
        }

        runAll() {
            try {
                this._runValidation();
                if (!this._validation.ok || !this._validation.driverFits || !this._validation.fbReachable) {
                    this.notify('Валидация', 'Есть проблемы — смотрите этап «Валидация»', 'warning');
                    this.goToStage(1);
                    return;
                }
                this._runPortSearch();
                this.notify('Расчёт',
                    'Готово. Лучший J = ' +
                    (this._portResult.best ? this._portResult.best.J.toFixed(3) : '—'),
                    'success');
                this.goToStage(2);
            } catch (e) {
                console.error('[BP6Solver] runAll error:', e);
                this.notify('Ошибка', String(e.message || e), 'error');
            }
        }

        onHeaderItemClick(desc, payload) {
            if (payload && payload.action === 'runAll') { this.runAll(); return true; }
            return false;
        }

        goToStage(i) {
            if (i < 0 || i >= STAGES.length) return;
            this._stageIndex = i;
            this._renderStage();
            if (typeof this.refreshHeaderItems === 'function') this.refreshHeaderItems();
        }

        nextStage() { if (this._stageIndex < STAGES.length - 1) this.goToStage(this._stageIndex + 1); }
        prevStage() { if (this._stageIndex > 0) this.goToStage(this._stageIndex - 1); }

        onReady() {
            console.log('[BP6Solver] onReady:', this.id);
            this.notify('BP6 Solver', 'Готов. Нажмите «Расчёт»', 'success');
        }

        onData(data) {
            if (data && data.data && data.data.params) {
                Object.assign(this._params, data.data.params);
                this._renderStage();
            }
        }

        onSlotChange() { this.save(); }
        onBeforeDestroy() { try { this.save(); } catch (e) {} }

        onImport(parsed) {
            if (!parsed || typeof parsed !== 'object') return false;
            if (parsed.params) Object.assign(this._params, parsed.params);
            else Object.assign(this._params, parsed);
            this._renderStage();
            return true;
        }

        onExport() {
            return {
                type: this.getType(),
                slotId: this.getSlotId(),
                params: this._params,
                validation: this._validation,
                portResult: this._portResult,
                exportedAt: new Date().toISOString()
            };
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================

    if (typeof window !== 'undefined') {
        window.BP6SolverWindow = BP6SolverWindow;
        console.log('[BP6Solver] Registered class globally: BP6SolverWindow');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BP6SolverWindow };
    }

})();