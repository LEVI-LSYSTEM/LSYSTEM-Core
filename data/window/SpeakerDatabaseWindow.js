// data/window/SpeakerDatabaseWindow.js
// v1.4.0 — База динамиков с анализом пригодности к оформлениям
//
// Изменения v1.4.0:
//   • Кнопка «Отправить» вместо «Открыть в BP6 Calculator»
//   • Кнопка просто шлёт канал 'boxcalc:load-driver' всем, кто его слушает
//     (без поиска окна, без открытия нового)
//   • Убран код с findWindowByType / addWindow / trySend
//
// Изменения v1.3.0:
//   • onMessage для 'speaker-database:focus'
//   • Флаг _isDestroyed корректно сбрасывается в onReady
//
// Изменения v1.2.0:
//   • Редактируемые бренд / модель / размер / цена в шапке
//   • Размер хранится числом, отображается с ″
//   • Фильтр по размеру работает по числам
//   • Миграция старых данных: "8\"" → 8

(function () {
    'use strict';

    if (!window.BaseWindowInstance) {
        console.error('[SpeakerDB] BaseWindowInstance not found');
        return;
    }

    // ============================================================
    // УТИЛИТЫ РАЗМЕРА
    // ============================================================

    function formatSize(size) {
        if (size == null || size === '') return '—';
        const n = Number(size);
        if (!isFinite(n) || n <= 0) return '—';
        const clean = Math.round(n * 100) / 100;
        return `${clean}″`;
    }

    function parseSize(v) {
        if (v == null) return null;
        if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
        const s = String(v).replace(/["″']/g, '').replace(',', '.').trim();
        const n = Number(s);
        return isFinite(n) && n > 0 ? n : null;
    }

    // ============================================================
    // ФОРМУЛЫ ПРИГОДНОСТИ
    // ============================================================

    const FORMULAS = {
        ebp(fs, qes) {
            if (!(fs > 0) || !(qes > 0)) return 0;
            return fs / qes;
        },

        ebpClass(ebp) {
            if (ebp < 50)  return { class: 'ЗЯ',        color: '#44cc88' };
            if (ebp < 90)  return { class: 'Универсал', color: '#88cc44' };
            if (ebp < 100) return { class: 'ФИ',        color: '#cccc44' };
            if (ebp < 120) return { class: 'БП/ФИ',     color: '#cc8844' };
            return           { class: 'БП6/БП8',   color: '#cc4444' };
        },

        pSealed(qts, vas) {
            const dq = Math.pow((qts - 0.5) / 0.30, 2);
            const dv = Math.pow((Math.log10(Math.max(vas, 0.1)) - Math.log10(30)) / 0.5, 2);
            return Math.exp(-dq - dv);
        },

        pVented(qts, fs) {
            const dq = Math.pow((qts - 0.35) / 0.15, 2);
            const df = Math.pow((Math.log10(Math.max(fs, 1)) - Math.log10(35)) / 0.3, 2);
            return Math.exp(-dq - df);
        },

        pBp4(qts, fs) {
            const dq = Math.pow((qts - 0.40) / 0.12, 2);
            const df = Math.pow((Math.log10(Math.max(fs, 1)) - Math.log10(45)) / 0.25, 2);
            return Math.exp(-dq - df);
        },

        pBp6(qts, fs, xmax) {
            const dq = Math.pow((qts - 0.42) / 0.10, 2);
            const df = Math.pow((Math.log10(Math.max(fs, 1)) - Math.log10(55)) / 0.20, 2);
            const dx = Math.min(1, Math.max(0, xmax / 8));
            return Math.exp(-dq - df) * dx;
        },

        pBp8(qts, fs) {
            const dq = Math.pow((qts - 0.45) / 0.15, 2);
            const df = Math.pow((Math.log10(Math.max(fs, 1)) - Math.log10(60)) / 0.30, 2);
            return Math.exp(-dq - df);
        },

        pHorn(qts, bl) {
            const dq = Math.pow((qts - 0.25) / 0.10, 2);
            const db = Math.pow((bl - 15) / 7, 2);
            return Math.exp(-dq - db);
        },

        allScores(driver) {
            const { fs, qts, qes, vas, xmax, bl } = driver;
            const qms = driver.qms || 4;
            let Qes = qes;
            if (!(Qes > 0) && qts > 0 && qms > qts) {
                Qes = (qts * qms) / (qms - qts);
            }
            const ebp = this.ebp(fs, Qes);
            return {
                ebp,
                ebpClass: this.ebpClass(ebp),
                sealed: this.pSealed(qts, vas),
                vented: this.pVented(qts, fs),
                bp4:    this.pBp4(qts, fs),
                bp6:    this.pBp6(qts, fs, xmax),
                bp8:    this.pBp8(qts, fs),
                horn:   this.pHorn(qts, bl)
            };
        },

        bestTopology(s) {
            const list = [
                { id: 'sealed', name: 'ЗЯ',    p: s.sealed },
                { id: 'vented', name: 'ФИ',    p: s.vented },
                { id: 'bp4',    name: 'БП4',   p: s.bp4 },
                { id: 'bp6',    name: 'БП6',   p: s.bp6 },
                { id: 'bp8',    name: 'БП8',   p: s.bp8 },
                { id: 'horn',   name: 'Рупор', p: s.horn }
            ];
            return list.reduce((best, c) => c.p > best.p ? c : best);
        }
    };

    // ============================================================
    // ПРЕСЕТЫ
    // ============================================================

    const PRESET_DRIVERS = [
        {
            id: 'scan-18w-4424',
            brand: 'ScanSpeak', model: '18W/4424G00', size: 6.5, price: 12000,
            fs: 55.6, qts: 0.42, qes: 0.47, qms: 4.0,
            vas: 18.38, sd: 213, xmax: 10,
            bl: 10, re: 4, le: 0.5, mms: 28.6, spl: 91.7
        },
        {
            id: 'dayton-rss210',
            brand: 'Dayton Audio', model: 'RSS210HF-4', size: 8, price: 9000,
            fs: 27.5, qts: 0.38, qes: 0.42, qms: 3.5,
            vas: 47, sd: 220, xmax: 12,
            bl: 14, re: 3.5, le: 0.8, mms: 65, spl: 86
        },
        {
            id: 'peerless-xxls8',
            brand: 'Peerless', model: 'XXLS-8', size: 8, price: 14000,
            fs: 32, qts: 0.31, qes: 0.34, qms: 3.2,
            vas: 42, sd: 230, xmax: 12.5,
            bl: 12, re: 3.4, le: 0.6, mms: 55, spl: 87
        },
        {
            id: 'sb-sb23nrxs45',
            brand: 'SB Acoustics', model: 'SB23NRXS45-8', size: 8, price: 11000,
            fs: 30, qts: 0.35, qes: 0.38, qms: 3.8,
            vas: 55, sd: 220, xmax: 8,
            bl: 11, re: 6.5, le: 0.6, mms: 50, spl: 88
        },
        {
            id: 'dayton-dcs205',
            brand: 'Dayton Audio', model: 'DCS205-4', size: 8, price: 4500,
            fs: 45, qts: 0.55, qes: 0.60, qms: 4.5,
            vas: 28, sd: 213, xmax: 6,
            bl: 8, re: 3.2, le: 1.0, mms: 40, spl: 88
        },
        {
            id: 'peerless-sls85',
            brand: 'Peerless', model: 'SLS-85', size: 8, price: 6500,
            fs: 38, qts: 0.45, qes: 0.50, qms: 3.8,
            vas: 38, sd: 220, xmax: 8,
            bl: 9, re: 3.6, le: 0.9, mms: 45, spl: 87
        }
    ];

    const FILTER_SIZES = [6.5, 8, 10, 12];

    // ============================================================
    // СТИЛИ
    // ============================================================

    const STYLE_ID = 'spkdb-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .spkdb-root {
                position: absolute; inset: 0;
                display: flex; overflow: hidden;
                background: var(--bg-dark, #1a1a1a);
                color: var(--text-primary, #e0d8cc);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
            }
            .spkdb-root * { box-sizing: border-box; }

            /* ─── Левая колонка ─── */
            .spkdb-list {
                width: 340px; min-width: 240px; flex-shrink: 0;
                display: flex; flex-direction: column;
                border-right: 1px solid var(--border-color, rgba(200,184,154,0.12));
                background: var(--bg-panel, #1f1f1f);
            }
            .spkdb-search-wrap {
                padding: 10px;
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.12));
            }
            .spkdb-search {
                width: 100%; padding: 7px 10px;
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                border: 1px solid var(--border-color, rgba(200,184,154,0.15));
                border-radius: 6px; outline: none;
                font-size: 12px;
                transition: border-color 0.15s, box-shadow 0.15s;
            }
            .spkdb-search:focus {
                border-color: var(--accent-red, #cc2233);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }
            .spkdb-filters {
                padding: 8px 10px;
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.12));
                display: flex; gap: 6px; flex-wrap: wrap;
            }
            .spkdb-filter-btn {
                padding: 4px 10px; font-size: 10px; font-weight: 600;
                background: transparent;
                color: var(--text-secondary, #a09888);
                border: 1px solid var(--border-color, rgba(200,184,154,0.15));
                border-radius: 12px; cursor: pointer;
                transition: all 0.15s;
                font-family: inherit;
            }
            .spkdb-filter-btn:hover {
                border-color: var(--beige-dark, #a89070);
                color: var(--text-primary, #e0d8cc);
            }
            .spkdb-filter-btn.active {
                background: rgba(204,34,51,0.18);
                border-color: var(--accent-red, #cc2233);
                color: var(--text-primary, #e0d8cc);
            }
            .spkdb-list-body {
                flex: 1; overflow-y: auto;
            }
            .spkdb-list-body::-webkit-scrollbar { width: 6px; }
            .spkdb-list-body::-webkit-scrollbar-thumb {
                background: var(--border-color, rgba(200,184,154,0.2));
                border-radius: 3px;
            }

            .spkdb-item {
                padding: 10px 12px;
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.08));
                cursor: pointer;
                transition: background 0.12s;
            }
            .spkdb-item:hover { background: rgba(200,184,154,0.04); }
            .spkdb-item.selected {
                background: rgba(204,34,51,0.10);
                border-left: 3px solid var(--accent-red, #cc2233);
                padding-left: 9px;
            }
            .spkdb-item__title {
                font-size: 12px; font-weight: 700;
                color: var(--text-primary, #e0d8cc);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .spkdb-item__params {
                font-size: 10px; color: var(--text-muted, rgba(200,184,154,0.5));
                margin-top: 3px;
                font-family: 'Courier New', monospace;
                display: flex; gap: 8px; flex-wrap: wrap;
            }
            .spkdb-item__badge {
                display: inline-block;
                margin-top: 6px;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 10px; font-weight: 700;
            }

            .spkdb-add {
                margin: 10px;
                padding: 10px;
                background: var(--accent-red, #cc2233);
                color: #fff;
                border: none; border-radius: 6px;
                font-weight: 600; cursor: pointer;
                font-family: inherit;
                transition: all 0.15s;
            }
            .spkdb-add:hover {
                background: var(--accent-red-hover, #ee3344);
                box-shadow: 0 0 16px rgba(204,34,51,0.35);
            }

            /* ─── Правая колонка ─── */
            .spkdb-detail {
                flex: 1; overflow-y: auto;
                padding: 16px 20px;
            }
            .spkdb-detail::-webkit-scrollbar { width: 8px; }
            .spkdb-detail::-webkit-scrollbar-thumb {
                background: var(--border-color, rgba(200,184,154,0.2));
                border-radius: 4px;
            }

            .spkdb-empty {
                display: flex; align-items: center; justify-content: center;
                height: 100%;
                color: var(--text-muted, rgba(200,184,154,0.5));
                font-size: 13px;
                font-style: italic;
            }

            /* ─── Заголовок ─── */
            .spkdb-header {
                display: flex; align-items: center; gap: 14px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.12));
                margin-bottom: 16px;
            }
            .spkdb-header__icon {
                width: 56px; height: 56px;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, rgba(204,34,51,0.25), rgba(204,34,51,0.05));
                border: 1px solid rgba(204,34,51,0.4);
                border-radius: 12px;
                font-size: 28px;
                flex-shrink: 0;
            }
            .spkdb-header__info { flex: 1; min-width: 0; }

            .spkdb-header__brand-input {
                display: block;
                width: 100%;
                padding: 2px 4px;
                font-size: 10px; font-weight: 700;
                color: var(--text-muted, rgba(200,184,154,0.55));
                text-transform: uppercase;
                letter-spacing: 0.8px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 4px;
                outline: none;
                font-family: inherit;
                transition: all 0.15s;
            }
            .spkdb-header__brand-input:hover {
                border-color: var(--border-color, rgba(200,184,154,0.15));
                background: var(--bg-input, #2a2a2a);
            }
            .spkdb-header__brand-input:focus {
                border-color: var(--accent-red, #cc2233);
                background: var(--bg-input, #2a2a2a);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }

            .spkdb-header__model-input {
                display: block;
                width: 100%;
                padding: 2px 4px;
                font-size: 20px; font-weight: 800;
                color: var(--text-primary, #e0d8cc);
                margin-top: 2px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 4px;
                outline: none;
                font-family: inherit;
                transition: all 0.15s;
            }
            .spkdb-header__model-input:hover {
                border-color: var(--border-color, rgba(200,184,154,0.15));
                background: var(--bg-input, #2a2a2a);
            }
            .spkdb-header__model-input:focus {
                border-color: var(--accent-red, #cc2233);
                background: var(--bg-input, #2a2a2a);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }

            .spkdb-header__meta {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--text-muted, rgba(200,184,154,0.55));
                margin-top: 6px;
                font-family: 'Courier New', monospace;
            }

            .spkdb-header__size-input {
                width: 60px;
                padding: 3px 6px;
                font-size: 12px;
                font-weight: 700;
                font-family: 'Courier New', monospace;
                color: var(--text-primary, #e0d8cc);
                background: transparent;
                border: 1px solid var(--border-color, rgba(200,184,154,0.15));
                border-radius: 4px;
                outline: none;
                transition: all 0.15s;
            }
            .spkdb-header__size-input:hover { border-color: var(--beige-dark, #a89070); }
            .spkdb-header__size-input:focus {
                border-color: var(--accent-red, #cc2233);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }

            .spkdb-header__price-input {
                width: 90px;
                padding: 3px 6px;
                font-size: 12px;
                font-weight: 700;
                font-family: 'Courier New', monospace;
                color: var(--text-primary, #e0d8cc);
                background: transparent;
                border: 1px solid var(--border-color, rgba(200,184,154,0.15));
                border-radius: 4px;
                outline: none;
                transition: all 0.15s;
            }
            .spkdb-header__price-input:hover { border-color: var(--beige-dark, #a89070); }
            .spkdb-header__price-input:focus {
                border-color: var(--accent-red, #cc2233);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }

            .spkdb-header__unit {
                font-size: 11px;
                color: var(--text-muted, rgba(200,184,154,0.55));
                font-weight: 600;
            }
            .spkdb-header__dot {
                color: var(--text-muted, rgba(200,184,154,0.3));
                margin: 0 4px;
            }

            /* ─── Секции ─── */
            .spkdb-section {
                background: var(--bg-card, #232323);
                border: 1px solid var(--border-color, rgba(200,184,154,0.10));
                border-radius: 8px;
                margin-bottom: 12px;
                overflow: hidden;
            }
            .spkdb-section__head {
                display: flex; align-items: center; gap: 8px;
                padding: 9px 14px;
                background: rgba(200,184,154,0.05);
                border-bottom: 1px solid var(--border-color, rgba(200,184,154,0.08));
                font-size: 10px; font-weight: 700;
                letter-spacing: 0.6px;
                text-transform: uppercase;
                color: var(--text-secondary, #a09888);
            }
            .spkdb-section__body {
                padding: 12px 14px;
            }

            /* ─── T/S сетка ─── */
            .spkdb-ts-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
            }
            @media (max-width: 900px) {
                .spkdb-ts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }

            .spkdb-field {
                display: flex; flex-direction: column; gap: 3px;
                min-width: 0;
            }
            .spkdb-field__lbl {
                font-size: 10px; font-weight: 600;
                color: var(--text-muted, rgba(200,184,154,0.55));
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .spkdb-field__inp {
                padding: 5px 8px;
                font-size: 12px; font-weight: 600;
                font-family: 'Courier New', monospace;
                background: var(--bg-input, #2a2a2a);
                color: var(--text-primary, #e0d8cc);
                border: 1px solid var(--border-color, rgba(200,184,154,0.15));
                border-radius: 5px;
                outline: none;
                width: 100%;
                transition: all 0.15s;
            }
            .spkdb-field__inp:hover { border-color: var(--beige-dark, #a89070); }
            .spkdb-field__inp:focus {
                border-color: var(--accent-red, #cc2233);
                box-shadow: 0 0 0 2px rgba(204,34,51,0.15);
            }

            /* ─── Строки результатов ─── */
            .spkdb-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 7px 0;
                border-bottom: 1px dashed rgba(200,184,154,0.08);
            }
            .spkdb-row:last-child { border-bottom: none; }
            .spkdb-row__lbl {
                font-size: 11px; color: var(--text-secondary, #a09888);
                display: flex; align-items: center; gap: 6px;
            }
            .spkdb-row__val {
                font-size: 13px; font-weight: 700;
                font-family: 'Courier New', monospace;
                color: var(--text-primary, #e0d8cc);
            }

            /* ─── Пригодность ─── */
            .spkdb-score {
                display: flex; align-items: center; gap: 10px;
                padding: 6px 0;
            }
            .spkdb-score__name {
                font-size: 11px; font-weight: 700;
                width: 60px;
                color: var(--text-secondary, #a09888);
                flex-shrink: 0;
            }
            .spkdb-score__bar {
                flex: 1; height: 16px;
                background: rgba(200,184,154,0.08);
                border-radius: 8px;
                overflow: hidden;
                position: relative;
            }
            .spkdb-score__fill {
                height: 100%;
                border-radius: 8px;
                transition: width 0.3s ease;
            }
            .spkdb-score__val {
                font-size: 11px; font-weight: 700;
                font-family: 'Courier New', monospace;
                width: 46px;
                text-align: right;
                flex-shrink: 0;
            }
            .spkdb-score__star {
                color: #ffb347;
                font-size: 14px;
                width: 14px;
                flex-shrink: 0;
            }

            /* ─── Кнопки ─── */
            .spkdb-actions {
                display: flex; gap: 8px; flex-wrap: wrap;
                margin-top: 4px;
            }
            .spkdb-btn {
                display: inline-flex; align-items: center; gap: 6px;
                padding: 9px 14px;
                font-size: 11px; font-weight: 600;
                font-family: inherit;
                border-radius: 6px;
                border: 1px solid var(--border-color, rgba(200,184,154,0.2));
                background: transparent;
                color: var(--text-secondary, #a09888);
                cursor: pointer;
                transition: all 0.15s;
                white-space: nowrap;
            }
            .spkdb-btn:hover {
                border-color: var(--beige-dark, #a89070);
                color: var(--text-primary, #e0d8cc);
                background: var(--bg-hover, rgba(40,40,40,0.5));
            }
            .spkdb-btn--primary {
                background: var(--accent-red, #cc2233);
                border-color: var(--accent-red, #cc2233);
                color: #fff;
            }
            .spkdb-btn--primary:hover {
                background: var(--accent-red-hover, #ee3344);
                border-color: var(--accent-red-hover, #ee3344);
                color: #fff;
            }
            .spkdb-btn--danger {
                color: var(--accent-red, #cc2233);
                border-color: rgba(204,34,51,0.4);
            }
            .spkdb-btn--danger:hover {
                background: rgba(204,34,51,0.1);
                border-color: var(--accent-red, #cc2233);
                color: var(--accent-red, #cc2233);
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // КЛАСС ОКНА
    // ============================================================

    class SpeakerDatabaseWindow extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'speaker-database',
                name: 'Speaker Database',
                icon: 'icon-speaker',
                description: 'База динамиков с анализом пригодности к оформлениям',
                group: 'Акустика',
                category: 'editor',
                priority: 4,
                defaultSize: { width: 1100, height: 760 },
                minSize: { width: 720, height: 500 },
                maxWindows: 2,
                metadata: { version: '1.4.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'dd-actions',
                        type: 'dropdown',
                        icon: 'icon-menu',
                        label: 'Действия',
                        items: [
                            { header: 'База' },
                            { label: 'Экспорт JSON', action: 'exportJSON' },
                            { label: 'Импорт JSON', action: 'importJSON' },
                            { divider: true },
                            { label: 'Сбросить к пресетам', action: 'resetToPresets', danger: true },
                            { divider: true },
                            { header: 'Анализ' },
                            { label: 'Отсортировать по пригодности БП6', action: 'sortByBP6' },
                            { label: 'Отсортировать по Fs', action: 'sortByFs' }
                        ]
                    }
                ]
            };
        }

        static get channels() {
            return ['speaker-database:focus'];
        }

        // ============================================================
        // СОСТОЯНИЕ
        // ============================================================

        _ensureFields() {
            if (this._fieldsReady) return;

            this._isDestroyed = false;
            this._selectedId = null;
            this._search = '';
            this._filterSize = null;

            this._listHost = null;
            this._detailHost = null;
            this._filterButtons = {};
            this._saveTimer = null;

            const stored = (this.data && Array.isArray(this.data.drivers))
                ? this.data.drivers
                : null;

            this._drivers = stored
                ? stored.map(d => this._migrateDriver(d))
                : PRESET_DRIVERS.map(d => ({ ...d }));

            this._fieldsReady = true;
        }

        _migrateDriver(d) {
            const out = { ...d };
            if (typeof out.size === 'string') out.size = parseSize(out.size);
            if (out.size == null) out.size = 8;
            if (out.price == null || !isFinite(Number(out.price))) out.price = 0;
            if (typeof out.brand !== 'string') out.brand = 'Новый бренд';
            if (typeof out.model !== 'string') out.model = 'Новая модель';
            return out;
        }

        // ============================================================
        // LIFECYCLE
        // ============================================================

        buildContent(el) {
            this._ensureFields();
            injectStyles();
            el.classList.add('spkdb-root');

            el.appendChild(this._buildLeftColumn());

            const right = document.createElement('div');
            right.className = 'spkdb-detail';
            el.appendChild(right);
            this._detailHost = right;

            this._renderList();
            this._renderDetail();
        }

        onReady() {
            this._isDestroyed = false;
            this._renderList();
            this._renderDetail();
        }

        onData(payload) {
            if (payload && payload.data && Array.isArray(payload.data.drivers)) {
                this._drivers = payload.data.drivers.map(d => this._migrateDriver(d));
                this._renderList();
                this._renderDetail();
            }
        }

        onMessage(senderId, channel, data) {
            if (channel === 'speaker-database:focus') {
                try {
                    if (typeof this.bringToFront === 'function') this.bringToFront();
                } catch (e) {}
                return;
            }
        }

        onBeforeDestroy() {
            this._isDestroyed = true;
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
            }
        }

        onThemeChange() { /* используем CSS-переменные */ }

        // ============================================================
        // ЛЕВАЯ КОЛОНКА
        // ============================================================

        _buildLeftColumn() {
            const left = document.createElement('div');
            left.className = 'spkdb-list';

            // Поиск
            const searchWrap = document.createElement('div');
            searchWrap.className = 'spkdb-search-wrap';
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'spkdb-search';
            searchInput.placeholder = 'Поиск по бренду или модели…';
            searchInput.value = this._search;
            searchInput.addEventListener('input', () => {
                this._search = searchInput.value.toLowerCase();
                this._renderList();
            });
            searchWrap.appendChild(searchInput);
            left.appendChild(searchWrap);

            // Фильтры
            const filtersWrap = document.createElement('div');
            filtersWrap.className = 'spkdb-filters';
            for (const size of FILTER_SIZES) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'spkdb-filter-btn';
                btn.textContent = formatSize(size);
                btn.addEventListener('click', () => {
                    this._filterSize = (this._filterSize === size) ? null : size;
                    this._updateFilterButtons();
                    this._renderList();
                });
                filtersWrap.appendChild(btn);
                this._filterButtons[size] = btn;
            }
            left.appendChild(filtersWrap);

            // Список
            const listBody = document.createElement('div');
            listBody.className = 'spkdb-list-body';
            left.appendChild(listBody);
            this._listHost = listBody;

            // Кнопка «Добавить»
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'spkdb-add';
            addBtn.textContent = '+ Добавить динамик';
            addBtn.addEventListener('click', () => this._addDriver());
            left.appendChild(addBtn);

            return left;
        }

        _updateFilterButtons() {
            for (const sizeKey in this._filterButtons) {
                const sizeNum = Number(sizeKey);
                this._filterButtons[sizeKey].classList.toggle('active', this._filterSize === sizeNum);
            }
        }

        // ============================================================
        // СПИСОК
        // ============================================================

        _renderList() {
            if (!this._listHost) return;
            this._listHost.innerHTML = '';

            const filtered = this._drivers.filter(d => {
                if (this._filterSize != null && d.size !== this._filterSize) return false;
                if (this._search) {
                    const hay = (d.brand + ' ' + d.model).toLowerCase();
                    if (!hay.includes(this._search)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText =
                    'padding:24px;text-align:center;color:var(--text-muted);font-size:11px;font-style:italic;';
                empty.textContent = 'Ничего не найдено';
                this._listHost.appendChild(empty);
                return;
            }

            for (const d of filtered) {
                this._listHost.appendChild(this._buildListItem(d));
            }
        }

        _buildListItem(d) {
            const scores = FORMULAS.allScores(d);
            const best = FORMULAS.bestTopology(scores);

            const item = document.createElement('div');
            item.className = 'spkdb-item' + (this._selectedId === d.id ? ' selected' : '');
            item.addEventListener('click', () => {
                this._selectedId = d.id;
                this._renderList();
                this._renderDetail();
            });

            const title = document.createElement('div');
            title.className = 'spkdb-item__title';
            title.textContent = `${d.brand} ${d.model}`;
            item.appendChild(title);

            const params = document.createElement('div');
            params.className = 'spkdb-item__params';
            params.innerHTML = `
                <span>${formatSize(d.size)}</span>
                <span>Fs ${d.fs}</span>
                <span>Qts ${d.qts}</span>
            `;
            item.appendChild(params);

            item.appendChild(this._buildListBadge(best));

            return item;
        }

        _buildListBadge(best) {
            const badge = document.createElement('span');
            badge.className = 'spkdb-item__badge';

            const pct = (best.p * 100).toFixed(0);
            if (best.p > 0.8) {
                badge.style.background = 'rgba(68,204,136,0.18)';
                badge.style.color = 'rgba(68,204,136,1)';
                badge.style.border = '1px solid rgba(68,204,136,0.4)';
            } else if (best.p > 0.5) {
                badge.style.background = 'rgba(255,180,80,0.15)';
                badge.style.color = 'rgba(255,180,80,1)';
                badge.style.border = '1px solid rgba(255,180,80,0.4)';
            } else {
                badge.style.background = 'rgba(200,184,154,0.10)';
                badge.style.color = 'var(--text-muted)';
                badge.style.border = '1px solid rgba(200,184,154,0.2)';
            }
            badge.textContent = `★ ${best.name} · ${pct}%`;
            return badge;
        }

        // ============================================================
        // ДЕТАЛИ
        // ============================================================

        _renderDetail() {
            if (!this._detailHost) return;
            this._detailHost.innerHTML = '';

            if (!this._selectedId) {
                const empty = document.createElement('div');
                empty.className = 'spkdb-empty';
                empty.textContent = 'Выберите динамик из списка';
                this._detailHost.appendChild(empty);
                return;
            }

            const d = this._drivers.find(x => x.id === this._selectedId);
            if (!d) return;

            this._detailHost.appendChild(this._buildHeader(d));
            this._detailHost.appendChild(this._buildTSSection(d));
            this._detailHost.appendChild(this._buildComputedSection(d));
            this._detailHost.appendChild(this._buildScoresSection(d));
            this._detailHost.appendChild(this._buildActions(d));
        }

        _buildHeader(d) {
            const header = document.createElement('div');
            header.className = 'spkdb-header';

            const icon = document.createElement('div');
            icon.className = 'spkdb-header__icon';
            icon.textContent = '🔊';
            header.appendChild(icon);

            const info = document.createElement('div');
            info.className = 'spkdb-header__info';

            // Бренд
            const brandInput = document.createElement('input');
            brandInput.type = 'text';
            brandInput.className = 'spkdb-header__brand-input';
            brandInput.value = d.brand || '';
            brandInput.placeholder = 'Бренд';
            brandInput.addEventListener('change', () => {
                d.brand = brandInput.value.trim() || 'Без бренда';
                this._saveDelayed();
                this._renderList();
            });
            info.appendChild(brandInput);

            // Модель
            const modelInput = document.createElement('input');
            modelInput.type = 'text';
            modelInput.className = 'spkdb-header__model-input';
            modelInput.value = d.model || '';
            modelInput.placeholder = 'Модель';
            modelInput.addEventListener('change', () => {
                d.model = modelInput.value.trim() || 'Без модели';
                this._saveDelayed();
                this._renderList();
            });
            info.appendChild(modelInput);

            // Мета: размер + цена
            const meta = document.createElement('div');
            meta.className = 'spkdb-header__meta';

            const sizeInput = document.createElement('input');
            sizeInput.type = 'number';
            sizeInput.step = '0.1';
            sizeInput.min = '0.5';
            sizeInput.className = 'spkdb-header__size-input';
            sizeInput.value = d.size != null ? d.size : '';
            sizeInput.placeholder = 'размер';
            sizeInput.title = 'Размер динамика в дюймах';
            sizeInput.addEventListener('change', () => {
                const v = parseSize(sizeInput.value);
                if (v == null) return;
                d.size = v;
                this._saveDelayed();
                this._renderList();
            });
            meta.appendChild(sizeInput);

            const sizeUnit = document.createElement('span');
            sizeUnit.className = 'spkdb-header__unit';
            sizeUnit.textContent = '″';
            meta.appendChild(sizeUnit);

            const dot = document.createElement('span');
            dot.className = 'spkdb-header__dot';
            dot.textContent = '·';
            meta.appendChild(dot);

            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.step = '100';
            priceInput.min = '0';
            priceInput.className = 'spkdb-header__price-input';
            priceInput.value = d.price != null ? d.price : '';
            priceInput.placeholder = 'цена';
            priceInput.title = 'Цена в рублях';
            priceInput.addEventListener('change', () => {
                const v = Number(priceInput.value);
                d.price = isFinite(v) && v >= 0 ? v : 0;
                this._saveDelayed();
                this._renderList();
            });
            meta.appendChild(priceInput);

            const priceUnit = document.createElement('span');
            priceUnit.className = 'spkdb-header__unit';
            priceUnit.textContent = '₽';
            meta.appendChild(priceUnit);

            info.appendChild(meta);
            header.appendChild(info);
            return header;
        }

        // ─── Конструктор секции ───

        _buildSection(title, opts = {}) {
            const section = document.createElement('div');
            section.className = 'spkdb-section';
            if (opts.derived) section.dataset.derived = '1';

            const head = document.createElement('div');
            head.className = 'spkdb-section__head';
            head.textContent = title;
            section.appendChild(head);

            const body = document.createElement('div');
            body.className = 'spkdb-section__body';
            section.appendChild(body);

            return { el: section, body };
        }

        // ─── T/S секция ───

        _buildTSSection(d) {
            const { el, body } = this._buildSection('T/S Параметры');

            const grid = document.createElement('div');
            grid.className = 'spkdb-ts-grid';

            const fields = [
                { key: 'fs',   label: 'Fs, Гц',   step: 0.1 },
                { key: 'qts',  label: 'Qts',      step: 0.01 },
                { key: 'qes',  label: 'Qes',      step: 0.01 },
                { key: 'qms',  label: 'Qms',      step: 0.1 },
                { key: 'vas',  label: 'Vas, л',   step: 0.1 },
                { key: 'sd',   label: 'Sd, см²',  step: 1 },
                { key: 'xmax', label: 'Xmax, мм', step: 0.5 },
                { key: 'bl',   label: 'BL, T·m',  step: 0.1 },
                { key: 're',   label: 'Re, Ω',    step: 0.1 },
                { key: 'le',   label: 'Le, mH',   step: 0.01 },
                { key: 'mms',  label: 'Mms, г',   step: 0.1 },
                { key: 'spl',  label: 'SPL, дБ',  step: 0.1 }
            ];

            for (const f of fields) {
                grid.appendChild(this._buildTSField(d, f));
            }

            body.appendChild(grid);
            return el;
        }

        _buildTSField(d, f) {
            const wrap = document.createElement('div');
            wrap.className = 'spkdb-field';

            const lbl = document.createElement('div');
            lbl.className = 'spkdb-field__lbl';
            lbl.textContent = f.label;
            wrap.appendChild(lbl);

            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = String(f.step);
            inp.className = 'spkdb-field__inp';
            inp.value = d[f.key] != null ? d[f.key] : '';
            inp.addEventListener('change', () => {
                const num = Number(inp.value);
                if (!isFinite(num)) return;
                d[f.key] = num;
                this._saveDelayed();
                this._refreshDerived(d);
                this._renderList();
            });
            wrap.appendChild(inp);

            return wrap;
        }

        // ─── Производные блоки ───

        _refreshDerived(d) {
            if (!this._detailHost) return;
            this._detailHost.querySelectorAll('[data-derived]').forEach(el => el.remove());
            this._detailHost.appendChild(this._buildComputedSection(d));
            this._detailHost.appendChild(this._buildScoresSection(d));
        }

        _buildComputedSection(d) {
            const { el, body } = this._buildSection('Расчётные метрики', { derived: true });
            const scores = FORMULAS.allScores(d);

            const rows = [
                { label: 'Ebp (Fs/Qes)',        value: scores.ebp.toFixed(1) },
                { label: 'EBP-класс',           value: scores.ebpClass.class, color: scores.ebpClass.color },
                { label: 'Vas/Vb (opt.)',       value: (d.vas / 20).toFixed(2), hint: 'Оптимально ≈ 3' },
                { label: 'Fs (30 / 50 Гц)',     value: (d.fs < 30 ? 'низкая' : (d.fs < 50 ? 'средняя' : 'высокая')) },
                { label: 'Xmax (5 / 10 мм)',    value: (d.xmax < 5 ? 'мало' : (d.xmax < 10 ? 'средне' : 'много')) }
            ];

            for (const r of rows) {
                const row = document.createElement('div');
                row.className = 'spkdb-row';

                const lbl = document.createElement('span');
                lbl.className = 'spkdb-row__lbl';
                lbl.textContent = r.label;
                if (r.hint) lbl.title = r.hint;
                row.appendChild(lbl);

                const val = document.createElement('span');
                val.className = 'spkdb-row__val';
                val.textContent = r.value;
                if (r.color) val.style.color = r.color;
                row.appendChild(val);

                body.appendChild(row);
            }

            return el;
        }

        _buildScoresSection(d) {
            const { el, body } = this._buildSection('Пригодность к оформлениям', { derived: true });
            const scores = FORMULAS.allScores(d);
            const best = FORMULAS.bestTopology(scores);

            const items = [
                { id: 'sealed', name: 'ЗЯ',    p: scores.sealed },
                { id: 'vented', name: 'ФИ',    p: scores.vented },
                { id: 'bp4',    name: 'БП4',   p: scores.bp4 },
                { id: 'bp6',    name: 'БП6',   p: scores.bp6 },
                { id: 'bp8',    name: 'БП8',   p: scores.bp8 },
                { id: 'horn',   name: 'Рупор', p: scores.horn }
            ];

            for (const item of items) {
                body.appendChild(this._buildScoreRow(item, best));
            }

            return el;
        }

        _buildScoreRow(item, best) {
            const row = document.createElement('div');
            row.className = 'spkdb-score';

            const name = document.createElement('span');
            name.className = 'spkdb-score__name';
            name.textContent = item.name;
            row.appendChild(name);

            const bar = document.createElement('div');
            bar.className = 'spkdb-score__bar';

            const fill = document.createElement('div');
            fill.className = 'spkdb-score__fill';
            fill.style.width = (item.p * 100).toFixed(1) + '%';
            if (item.p > 0.8) {
                fill.style.background = 'linear-gradient(90deg, rgba(68,204,136,0.5), rgba(68,204,136,0.9))';
            } else if (item.p > 0.5) {
                fill.style.background = 'linear-gradient(90deg, rgba(255,180,80,0.4), rgba(255,180,80,0.9))';
            } else {
                fill.style.background = 'linear-gradient(90deg, rgba(200,120,120,0.3), rgba(200,120,120,0.7))';
            }
            bar.appendChild(fill);
            row.appendChild(bar);

            const val = document.createElement('span');
            val.className = 'spkdb-score__val';
            val.textContent = (item.p * 100).toFixed(0) + '%';
            if (item.p > 0.8) val.style.color = 'rgba(68,204,136,1)';
            else if (item.p > 0.5) val.style.color = 'rgba(255,180,80,1)';
            else val.style.color = 'var(--text-muted)';
            row.appendChild(val);

            const star = document.createElement('span');
            star.className = 'spkdb-score__star';
            star.textContent = (item.id === best.id) ? '★' : '';
            row.appendChild(star);

            return row;
        }

        // ─── Действия ───

        _buildActions(d) {
            const wrap = document.createElement('div');
            wrap.className = 'spkdb-actions';

            wrap.appendChild(this._makeButton('Отправить', 'primary', () => this._sendDriver(d)));
            wrap.appendChild(this._makeButton('Экспорт даташит (JSON)', null, () => this._exportDatasheet(d)));
            wrap.appendChild(this._makeButton('Удалить из базы', 'danger', () => this._removeDriver(d)));

            return wrap;
        }

        _makeButton(label, variant, onClick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'spkdb-btn' + (variant ? ' spkdb-btn--' + variant : '');
            b.textContent = label;
            b.addEventListener('click', onClick);
            return b;
        }

        // ============================================================
        // ДЕЙСТВИЯ
        // ============================================================

        _addDriver() {
            const id = 'drv_' + Date.now().toString(36);
            const newDrv = {
                id,
                brand: 'Новый бренд',
                model: 'Новая модель',
                size: 8,
                price: 0,
                fs: 40, qts: 0.4, qes: 0.45, qms: 4,
                vas: 30, sd: 220, xmax: 8,
                bl: 10, re: 4, le: 0.5, mms: 30, spl: 88
            };
            this._drivers.push(newDrv);
            this._selectedId = id;
            this._renderList();
            this._renderDetail();
            this._saveDelayed();
        }

        _removeDriver(d) {
            if (!window.confirm(`Удалить "${d.brand} ${d.model}" из базы?`)) return;
            this._drivers = this._drivers.filter(x => x.id !== d.id);
            if (this._selectedId === d.id) this._selectedId = null;
            this._renderList();
            this._renderDetail();
            this._saveDelayed();
        }

        /**
         * Просто шлёт канал 'boxcalc:load-driver' всем слушателям.
         * Никаких поисков окон, никаких addWindow, никаких retry.
         * Кто слушает — тот и получит.
         */
        _sendDriver(d) {
            const payload = {
                type: 'driver-from-database',
                driver: { ...d }
            };

            let sent = false;
            try {
                if (typeof this.sendMessage === 'function') {
                    // targetId = null → broadcast всем окнам, которые слушают канал
                    this.sendMessage('boxcalc:load-driver', payload, null);
                    sent = true;
                }
            } catch (e) {
                console.warn('[SpeakerDB] sendMessage failed:', e);
            }

            if (sent) {
                this.notify(
                    'Отправлено',
                    `Динамик "${d.brand} ${d.model}" отправлен в Box Calculator`,
                    'success'
                );
            } else {
                this.notify(
                    'Ошибка',
                    'Не удалось отправить канал',
                    'error'
                );
            }
        }

        _exportDatasheet(d) {
            const scores = FORMULAS.allScores(d);
            const best = FORMULAS.bestTopology(scores);

            const payload = {
                datasheet: {
                    brand: d.brand,
                    model: d.model,
                    size: d.size,
                    price: d.price,
                    ts: {
                        fs: d.fs, qts: d.qts, qes: d.qes, qms: d.qms,
                        vas: d.vas, sd: d.sd, xmax: d.xmax,
                        bl: d.bl, re: d.re, le: d.le, mms: d.mms, spl: d.spl
                    },
                    computed: {
                        ebp: scores.ebp,
                        ebpClass: scores.ebpClass.class
                    },
                    suitability: {
                        sealed: scores.sealed,
                        vented: scores.vented,
                        bp4:    scores.bp4,
                        bp6:    scores.bp6,
                        bp8:    scores.bp8,
                        horn:   scores.horn,
                        best:   { id: best.id, name: best.name, p: best.p }
                    }
                },
                generatedAt: new Date().toISOString()
            };

            try {
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `datasheet_${d.brand}_${d.model}.json`.replace(/\s+/g, '_');
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
                this.notify('Экспорт', 'Даташит сохранён', 'success');
            } catch (e) {
                this.notify('Экспорт', 'Ошибка: ' + e.message, 'error');
            }
        }

        // ============================================================
        // СОХРАНЕНИЕ
        // ============================================================

        _saveDelayed() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                this._saveTimer = null;
                if (this._isDestroyed) return;
                this.data = {
                    drivers: this._drivers.map(d => ({ ...d }))
                };
                try { if (typeof this.save === 'function') this.save(); } catch (e) {}
            }, 300);
        }

        // ============================================================
        // МЕНЮ-ЭКШЕНЫ
        // ============================================================

        exportJSON() {
            try {
                const payload = { drivers: this._drivers };
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `speaker_database_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
                this.notify('Экспорт', 'База сохранена', 'success');
            } catch (e) {
                this.notify('Экспорт', 'Ошибка: ' + e.message, 'error');
            }
        }

        importJSON() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const parsed = JSON.parse(String(reader.result));
                        const arr = Array.isArray(parsed)
                            ? parsed
                            : (parsed && Array.isArray(parsed.drivers) ? parsed.drivers : null);
                        if (!arr) {
                            this.notify('Импорт', 'Неверный формат', 'error');
                            return;
                        }
                        this._drivers = arr.map(d => this._migrateDriver(d));
                        this._selectedId = null;
                        this._renderList();
                        this._renderDetail();
                        this._saveDelayed();
                        this.notify('Импорт', `Загружено ${arr.length} динамиков`, 'success');
                    } catch (e) {
                        this.notify('Импорт', 'Ошибка JSON: ' + e.message, 'error');
                    }
                };
                reader.readAsText(file);
            });
            input.click();
        }

        resetToPresets() {
            if (!window.confirm('Сбросить базу к пресетам? Все изменения будут потеряны.')) return;
            this._drivers = PRESET_DRIVERS.map(d => ({ ...d }));
            this._selectedId = null;
            this._renderList();
            this._renderDetail();
            this._saveDelayed();
            this.notify('База', 'Сброшено к пресетам', 'success');
        }

        sortByBP6() {
            this._drivers.sort((a, b) => {
                const sa = FORMULAS.allScores(a).bp6;
                const sb = FORMULAS.allScores(b).bp6;
                return sb - sa;
            });
            this._renderList();
            this.notify('Сортировка', 'По пригодности к БП6', 'info');
        }

        sortByFs() {
            this._drivers.sort((a, b) => a.fs - b.fs);
            this._renderList();
            this.notify('Сортировка', 'По Fs', 'info');
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================

    window.SpeakerDatabaseWindow = SpeakerDatabaseWindow;
    console.log('[SpeakerDB] Registered globally: SpeakerDatabaseWindow v1.4.0');

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SpeakerDatabaseWindow };
    }
})();