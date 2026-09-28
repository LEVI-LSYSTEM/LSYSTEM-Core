// data/window/AcousticsBoxCalc.js
// v3.3.0 — Thiele-Small box calculator (WinISD-style)
//
// Что нового в v3.3.0:
//   • Интеграция со SpeakerDatabaseWindow:
//       – приём канала 'boxcalc:load-driver' → загрузка T/S из базы
//       – кнопка «Из базы динамиков» в панели «Действия»
//       – плашка «Из базы: Brand Model» над параметрами драйвера
//
// Изменения v3.2.0:
//   • ЗЯ: исправлен баг с Qtc (сохранение и отображение при ручном редактировании)
//   • ФИ: концевая поправка порта, корректные Qa/Qp
//   • БП4/БП6/БП8: каскадная модель
//   • Убраны дублирующие вычисления потоков
//   • Проверка NaN/Infinity при построении payload
//   • Диапазон 10 Гц – 20 кГц

(function () {
    'use strict';

    const DEBUG = !!window.DEBUG_BOXCALC;
    const _log  = DEBUG ? console.log.bind(console) : () => {};
    const _warn = console.warn.bind(console);
    const _err  = console.error.bind(console);

    if (!window.BaseWindowInstance) {
        _err('[BoxCalc] BaseWindowInstance not found');
        return;
    }

    _log('[BoxCalc] Loading v3.3.0 ...');

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================

    const RHO0 = 1.2041;
    const C0   = 343.0;
    const P_REF = 20e-6;

    const QL_DEFAULT = 10;
    const QA_DEFAULT = 20;
    const QP_DEFAULT = 80;

    // ============================================================
    // КОМПЛЕКСНАЯ АРИФМЕТИКА
    // ============================================================

    const _cplx = {
        zero: () => ({ re: 0, im: 0 }),
        from: (re, im = 0) => ({ re, im }),
        add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
        sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
        mul: (a, b) => ({
            re: a.re * b.re - a.im * b.im,
            im: a.re * b.im + a.im * b.re
        }),
        div: (a, b) => {
            const d = b.re * b.re + b.im * b.im;
            if (!(d > 1e-30)) return { re: 0, im: 0 };
            return {
                re: (a.re * b.re + a.im * b.im) / d,
                im: (a.im * b.re - a.re * b.im) / d
            };
        },
        abs: (a) => Math.hypot(a.re, a.im),
        arg: (a) => Math.atan2(a.im, a.re),
        scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
        neg: (a) => ({ re: -a.re, im: -a.im })
    };

    // ============================================================
    // ЕДИНИЦЫ
    // ============================================================

    function _unit(id, label, factor) {
        return { id, label, toBase: (v) => v * factor, fromBase: (v) => v / factor };
    }

    const UNITS = {
        Hz:  [ _unit('Hz','Hz',1), _unit('kHz','kHz',1000) ],
        mm:  [ _unit('mm','мм',1), _unit('cm','см',10), _unit('m','м',1000), _unit('in','in',25.4) ],
        L:   [ _unit('L','L',1), _unit('m3','м³',1000), _unit('cm3','см³',0.001), _unit('ft3','ft³',28.3168), _unit('gal','gal US',3.78541) ],
        cm2: [ _unit('cm2','см²',1), _unit('m2','м²',10000), _unit('in2','in²',6.4516) ],
        g:   [ _unit('g','г',1), _unit('kg','кг',1000), _unit('oz','oz',28.3495), _unit('lb','lb',453.592) ],
        mmN: [ _unit('mmN','мм/Н',1), _unit('mN','м/Н',1000), _unit('inLb','in/lb',175.126) ],
        ohm: [ _unit('ohm','Ω',1), _unit('mohm','мΩ',0.001), _unit('kohm','кΩ',1000) ],
        mH:  [ _unit('mH','mH',1), _unit('H','H',1000), _unit('uH','µH',0.001) ],
        Tm:  [ _unit('Tm','T·m',1), _unit('mTm','mT·m',0.001), _unit('gauss','Гс·см',1e-4) ],
        kgs: [ _unit('kgs','кг/с',1), _unit('gs','г/с',0.001), _unit('Ns_m','Н·с/м',1) ],
        Q:   [ _unit('q','Q',1) ],
        dB:  [ _unit('dB','dB',1) ]
    };

    const FIELD_UNITS = {
        fs:'Hz', qms:'Q', qes:'Q', qts:'Q',
        vas:'L', sd:'cm2',
        re:'ohm', le:'mH', bl:'Tm',
        mms:'g', cms:'mmN', rms:'kgs',
        xmax:'mm', spl:'dB',
        Vb:'L', Vb1:'L', Vb2:'L',
        Fb:'Hz', Fb1:'Hz', Fb2:'Hz',
        port_d:'mm'
    };

    // ============================================================
    // T/S-ФИЗИКА
    // ============================================================

    function driverFromTS(p) {
        const out = { ...p };

        if (out.qms > 0 && out.qes > 0) {
            out.qts = (out.qms * out.qes) / (out.qms + out.qes);
        } else if (out.qts > 0 && out.qms > 0 && out.qms !== out.qts) {
            out.qes = (out.qms * out.qts) / (out.qms - out.qts);
        } else if (out.qts > 0 && out.qes > 0 && out.qes !== out.qts) {
            out.qms = (out.qes * out.qts) / (out.qes - out.qts);
        }

        const Sd = out.sd * 1e-4;
        const Vas = out.vas / 1000;

        if (!(out.cms_m_per_N > 0)) {
            if (out.vas > 0 && out.sd > 0) {
                out.cms_m_per_N = Vas / (RHO0 * C0 * C0 * Sd * Sd);
            } else if (out.cms > 0) {
                out.cms_m_per_N = out.cms / 1000;
            }
        }

        const ws = 2 * Math.PI * out.fs;
        if (!(out.mms_kg > 0)) {
            if (out.cms_m_per_N > 0) {
                out.mms_kg = 1 / (ws * ws * out.cms_m_per_N);
            } else if (out.mms > 0) {
                out.mms_kg = out.mms / 1000;
            }
        }

        if (!(out.rms_kgs > 0)) {
            if (out.mms_kg > 0 && out.cms_m_per_N > 0 && out.qms > 0) {
                out.rms_kgs = Math.sqrt(out.mms_kg / out.cms_m_per_N) / out.qms;
            } else if (out.rms > 0) {
                out.rms_kgs = out.rms;
            }
        }

        if (!(out.bl > 0) && out.re > 0 && out.mms_kg > 0 && out.cms_m_per_N > 0 && out.qes > 0) {
            out.bl = Math.sqrt(out.re * Math.sqrt(out.mms_kg / out.cms_m_per_N) / out.qes);
        }

        out.Sd_m2 = Sd;
        out.Vas_m3 = Vas;
        return out;
    }

    // ============================================================
    // АКУСТИЧЕСКИЕ ИМПЕДАНСЫ
    // ============================================================

    function _zaClosedBox(w, Vb_m3, Qa) {
        Qa = Qa || QA_DEFAULT;
        const Cab = Vb_m3 / (RHO0 * C0 * C0);
        const Rab = 1 / (w * Cab * Qa);
        return _cplx.from(Rab, -1 / (w * Cab));
    }

    function _zaVentedBox(w, Vb_m3, Fb, port_d_m, nPort, Qa, Qp) {
        Qa = Qa || QA_DEFAULT;
        Qp = Qp || QP_DEFAULT;

        if (!(w > 0) || !(Vb_m3 > 0) || !(Fb > 0) || !(port_d_m > 0) || !(nPort > 0)) {
            return _cplx.zero();
        }
        const Cab = Vb_m3 / (RHO0 * C0 * C0);
        const Rab = 1 / (w * Cab * Qa);

        const S_port = Math.PI * port_d_m * port_d_m / 4 * nPort;
        const L_eff = S_port / (Vb_m3 * Math.pow(2 * Math.PI * Fb / C0, 2));
        const L_port = Math.max(0.001, L_eff - 0.85 * port_d_m);
        const Ma_port = RHO0 * L_port / S_port;
        const Rap = (w * Ma_port) / Qp;

        const Za_cav  = _cplx.from(Rab, -1 / (w * Cab));
        const Za_port = _cplx.from(Rap, w * Ma_port);

        return _cplx.div(_cplx.mul(Za_cav, Za_port), _cplx.add(Za_cav, Za_port));
    }

    function _zaRadiation(w, Sd) {
        const a = Math.sqrt(Sd / Math.PI);
        const ka = (w / C0) * a;
        const ka2 = ka * ka;
        const R = RHO0 * C0 / Sd * ka2 / (1 + ka2);
        return _cplx.from(R, 0);
    }

    // ============================================================
    // ЭЛЕКТРИЧЕСКИЙ ИМПЕДАНС
    // ============================================================

    function _zinWithLoad(w, D, Zload_mech) {
        const Re = D.re;
        const Le = D.le / 1000;
        const Bl2 = D.bl * D.bl;
        const Mms = D.mms_kg;
        const Cms = D.cms_m_per_N;
        const Rms = D.rms_kgs;

        const Ze = _cplx.from(Re, w * Le);
        const Zmech = _cplx.add(
            _cplx.from(Rms, w * Mms - 1 / (w * Cms)),
            Zload_mech
        );
        const Zin_refl = _cplx.scale(_cplx.div(_cplx.from(1, 0), Zmech), Bl2);
        return _cplx.add(Ze, Zin_refl);
    }

    function _membraneVelocity(Eg, w, D, Zload_mech) {
        const Re = D.re;
        const Le = D.le / 1000;
        const Bl2 = D.bl * D.bl;
        const Mms = D.mms_kg;
        const Cms = D.cms_m_per_N;
        const Rms = D.rms_kgs;

        const Ze = _cplx.from(Re, w * Le);
        const Zmech_total = _cplx.add(
            _cplx.from(Rms, w * Mms - 1 / (w * Cms)),
            Zload_mech
        );
        const Zin_refl = _cplx.scale(_cplx.div(_cplx.from(1, 0), Zmech_total), Bl2);
        const Zin = _cplx.add(Ze, Zin_refl);

        const I = _cplx.div(_cplx.from(Eg, 0), Zin);
        const F = _cplx.scale(I, D.bl);
        const v = _cplx.div(F, Zmech_total);

        return { v, I, Zin, Zmech_total };
    }

    function _farFieldPressure(U_cplx, w, r) {
        r = r || 1.0;
        const jwRho = _cplx.from(0, w * RHO0);
        return _cplx.scale(_cplx.mul(jwRho, U_cplx), 1 / (2 * Math.PI * r));
    }

    // ============================================================
    // ЗЯ
    // ============================================================

    function computeSealed(f, D, Vb_m3) {
        const w = 2 * Math.PI * f;
        const Sd = D.Sd_m2;

        const Za_box = _zaClosedBox(w, Vb_m3, QA_DEFAULT);
        const Za_rad = _zaRadiation(w, Sd);
        const Za_total = _cplx.add(Za_box, Za_rad);
        const Zload = _cplx.scale(Za_total, Sd * Sd);

        const Eg = 2.83;
        const { v, Zin } = _membraneVelocity(Eg, w, D, Zload);

        const U_dia = _cplx.scale(v, Sd);
        const p_far = _farFieldPressure(U_dia, w, 1.0);
        const p_far_abs = _cplx.abs(p_far);
        const SPL = 20 * Math.log10(Math.max(p_far_abs / P_REF, 1e-30));

        const v_abs = _cplx.abs(v);
        const X_mm = (v_abs * Math.SQRT2) / w * 1000;

        return {
            spl: SPL,
            x: X_mm,
            z: _cplx.abs(Zin),
            zRe: Zin.re,
            zIm: Zin.im,
            u: _cplx.abs(U_dia)
        };
    }

    // ============================================================
    // ФИ
    // ============================================================

    function computeVented(f, D, Vb_m3, Fb, port_d_m, nPort) {
        const w = 2 * Math.PI * f;
        const Sd = D.Sd_m2;

        const Za_box = _zaVentedBox(w, Vb_m3, Fb, port_d_m, nPort, QA_DEFAULT, QP_DEFAULT);
        const Za_rad = _zaRadiation(w, Sd);

        const Za_total = _cplx.add(Za_box, Za_rad);
        const Zload = _cplx.scale(Za_total, Sd * Sd);

        const Eg = 2.83;
        const { v, Zin } = _membraneVelocity(Eg, w, D, Zload);

        const U_dia = _cplx.scale(v, Sd);

        const Cab = Vb_m3 / (RHO0 * C0 * C0);
        const Rab = 1 / (w * Cab * QA_DEFAULT);
        const Za_cav = _cplx.from(Rab, -1 / (w * Cab));

        const S_port = Math.PI * port_d_m * port_d_m / 4 * nPort;
        const L_eff = S_port / (Vb_m3 * Math.pow(2 * Math.PI * Fb / C0, 2));
        const L_port = Math.max(0.001, L_eff - 0.85 * port_d_m);
        const Ma_port = RHO0 * L_port / S_port;
        const Rap = (w * Ma_port) / QP_DEFAULT;
        const Za_port = _cplx.from(Rap, w * Ma_port);

        const Z_parallel = _cplx.div(_cplx.mul(Za_cav, Za_port), _cplx.add(Za_cav, Za_port));
        const p_box = _cplx.mul(U_dia, Z_parallel);
        const I_port = _cplx.div(p_box, Za_port);

        const U_total = _cplx.sub(U_dia, I_port);

        const p_far = _farFieldPressure(U_total, w, 1.0);
        const p_far_abs = _cplx.abs(p_far);
        const SPL = 20 * Math.log10(Math.max(p_far_abs / P_REF, 1e-30));

        const v_abs = _cplx.abs(v);
        const X_mm = (v_abs * Math.SQRT2) / w * 1000;

        return {
            spl: SPL,
            x: X_mm,
            z: _cplx.abs(Zin),
            zRe: Zin.re,
            zIm: Zin.im,
            u: _cplx.abs(U_total),
            uPort: _cplx.abs(I_port)
        };
    }

    // ============================================================
    // БАНДПАСС
    // ============================================================

    function computeBandpass(f, D, Vb1_m3, Vb2_m3, Fb1, Fb2, topology, port_d_m, nPort) {
        const w = 2 * Math.PI * f;
        const Sd = D.Sd_m2;
        const S_port = Math.PI * port_d_m * port_d_m / 4 * nPort;

        let Zload;
        let v;
        let Zin;
        let U_total = _cplx.zero();
        let U_port_out = _cplx.zero();

        if (topology === 'bp4') {
            const Za1 = _zaClosedBox(w, Vb1_m3, QA_DEFAULT);

            const Cab2 = Vb2_m3 / (RHO0 * C0 * C0);
            const Rab2 = 1 / (w * Cab2 * QA_DEFAULT);
            const L_eff2 = S_port / (Vb2_m3 * Math.pow(2 * Math.PI * Fb2 / C0, 2));
            const L_port2 = Math.max(0.001, L_eff2 - 0.85 * port_d_m);
            const Ma2 = RHO0 * L_port2 / S_port;
            const Rap2 = (w * Ma2) / QP_DEFAULT;
            const Za_cav2 = _cplx.from(Rab2, -1 / (w * Cab2));
            const Za_port2 = _cplx.from(Rap2, w * Ma2);
            const Za2 = _cplx.div(_cplx.mul(Za_cav2, Za_port2), _cplx.add(Za_cav2, Za_port2));

            Zload = _cplx.scale(_cplx.add(Za1, Za2), Sd * Sd);

            const Eg = 2.83;
            ({ v, Zin } = _membraneVelocity(Eg, w, D, Zload));
            const U_dia = _cplx.scale(v, Sd);

            const Z_par2 = _cplx.div(_cplx.mul(Za_cav2, Za_port2), _cplx.add(Za_cav2, Za_port2));
            const p_box2 = _cplx.mul(U_dia, Z_par2);
            U_port_out = _cplx.div(p_box2, Za_port2);
            U_total = U_port_out;

        } else if (topology === 'bp6') {
            const Cab1 = Vb1_m3 / (RHO0 * C0 * C0);
            const Rab1 = 1 / (w * Cab1 * QA_DEFAULT);
            const L_eff1 = S_port / (Vb1_m3 * Math.pow(2 * Math.PI * Fb1 / C0, 2));
            const L_port1 = Math.max(0.001, L_eff1 - 0.85 * port_d_m);
            const Ma1 = RHO0 * L_port1 / S_port;
            const Rap1 = (w * Ma1) / QP_DEFAULT;
            const Za_cav1 = _cplx.from(Rab1, -1 / (w * Cab1));
            const Za_port1 = _cplx.from(Rap1, w * Ma1);

            const Cab2 = Vb2_m3 / (RHO0 * C0 * C0);
            const Rab2 = 1 / (w * Cab2 * QA_DEFAULT);
            const L_eff2 = S_port / (Vb2_m3 * Math.pow(2 * Math.PI * Fb2 / C0, 2));
            const L_port2 = Math.max(0.001, L_eff2 - 0.85 * port_d_m);
            const Ma2 = RHO0 * L_port2 / S_port;
            const Rap2 = (w * Ma2) / QP_DEFAULT;
            const Za_cav2 = _cplx.from(Rab2, -1 / (w * Cab2));
            const Za_port2 = _cplx.from(Rap2, w * Ma2);

            const Za1 = _cplx.div(_cplx.mul(Za_cav1, Za_port1), _cplx.add(Za_cav1, Za_port1));
            const Za2 = _cplx.div(_cplx.mul(Za_cav2, Za_port2), _cplx.add(Za_cav2, Za_port2));
            Zload = _cplx.scale(_cplx.add(Za1, Za2), Sd * Sd);

            const Eg = 2.83;
            ({ v, Zin } = _membraneVelocity(Eg, w, D, Zload));
            const U_dia = _cplx.scale(v, Sd);

            // BP6 is a series acoustic chain:
            // port 1 -> chamber 1 -> driver -> chamber 2 -> port 2.
            // The driver excites the two chambers with opposite pressure
            // polarity, so the externally radiated port flows are subtracted.
            const p_box1 = _cplx.mul(U_dia, Za1);
            const I_port1 = _cplx.div(p_box1, Za_port1);

            const p_box2 = _cplx.mul(U_dia, Za2);
            const I_port2 = _cplx.div(p_box2, Za_port2);

            U_total = _cplx.sub(I_port1, I_port2);
            U_port_out = U_total;

        } else {
            // BP8: the driver is mounted in the divider between the chambers.
            // Chamber 1 has the external port; chamber 2 is connected to
            // chamber 1 by the second port, which is parallel to the driver.
            const Cab1 = Vb1_m3 / (RHO0 * C0 * C0);
            const Rab1 = 1 / (w * Cab1 * QA_DEFAULT);
            const L_eff1 = S_port / (Vb1_m3 * Math.pow(2 * Math.PI * Fb1 / C0, 2));
            const L_port1 = Math.max(0.001, L_eff1 - 0.85 * port_d_m);
            const Ma1 = RHO0 * L_port1 / S_port;
            const Rap1 = (w * Ma1) / QP_DEFAULT;
            const Za_cav1 = _cplx.from(Rab1, -1 / (w * Cab1));
            const Za_port1 = _cplx.from(Rap1, w * Ma1);

            const Cab2 = Vb2_m3 / (RHO0 * C0 * C0);
            const Rab2 = 1 / (w * Cab2 * QA_DEFAULT);
            const L_eff2 = S_port / (Vb2_m3 * Math.pow(2 * Math.PI * Fb2 / C0, 2));
            const L_port2 = Math.max(0.001, L_eff2 - 0.85 * port_d_m);
            const Ma2 = RHO0 * L_port2 / S_port;
            const Rap2 = (w * Ma2) / QP_DEFAULT;
            const Za_cav2 = _cplx.from(Rab2, -1 / (w * Cab2));
            const Za_port2 = _cplx.from(Rap2, w * Ma2);

            const Za1 = _cplx.div(
                _cplx.mul(Za_cav1, Za_port1),
                _cplx.add(Za_cav1, Za_port1)
            );
            const Za_driver_path = _cplx.add(Za1, Za_cav2);
            const Za_driver_load = _cplx.div(
                _cplx.mul(Za_driver_path, Za_port2),
                _cplx.add(Za_driver_path, Za_port2)
            );
            Zload = _cplx.scale(Za_driver_load, Sd * Sd);

            const Eg = 2.83;
            ({ v, Zin } = _membraneVelocity(Eg, w, D, Zload));
            const U_dia = _cplx.scale(v, Sd);

            const p_driver = _cplx.mul(U_dia, Za_driver_load);
            const I_driver_path = _cplx.div(p_driver, Za_driver_path);
            const p_box1 = _cplx.mul(I_driver_path, Za1);
            const I_port1 = _cplx.div(p_box1, Za_port1);

            U_total = I_port1;
            U_port_out = I_port1;
        }

        const p_far = _farFieldPressure(U_total, w, 1.0);
        const p_far_abs = _cplx.abs(p_far);
        const SPL = 20 * Math.log10(Math.max(p_far_abs / P_REF, 1e-30));

        const v_abs = _cplx.abs(v);
        const X_mm = (v_abs * Math.SQRT2) / w * 1000;

        return {
            spl: SPL,
            x: X_mm,
            z: _cplx.abs(Zin),
            zRe: Zin.re,
            zIm: Zin.im,
            u: _cplx.abs(U_total),
            uPort: _cplx.abs(U_port_out)
        };
    }

    // ============================================================
    // СВОДНЫЕ ПАРАМЕТРЫ
    // ============================================================

    function sealedSummary(D, Vb_L) {
        const Vb_m3 = Vb_L / 1000;
        const a = D.Vas_m3 / Vb_m3;
        const qtc = D.qts * Math.sqrt(1 + a);
        const fc  = D.fs * Math.sqrt(1 + a);

        let lo = fc * 0.1, hi = fc * 10;
        for (let i = 0; i < 60; i++) {
            const mid = Math.sqrt(lo * hi);
            const w = 2 * Math.PI * mid;
            const wc = 2 * Math.PI * fc;
            const re = wc * wc - w * w;
            const im = (wc / qtc) * w;
            const mag = (wc * wc) / Math.hypot(re, im);
            if (mag > Math.SQRT1_2) lo = mid;
            else hi = mid;
        }
        return { qtc, fc, f3: Math.sqrt(lo * hi) };
    }

    function ventedSummary(D, Vb_L, Fb, port_d_m, nPort) {
        const Vb_m3 = Vb_L / 1000;
        const a = D.Vas_m3 / Vb_m3;
        const h = Fb / D.fs;
        const qtc = D.qts * Math.sqrt(1 + a) / h;

        const f3 = _findF3Numeric(D, 'vented', Vb_L, Fb, port_d_m, nPort, 0, 0, 0, 0);

        return { qtc, fc: Fb, f3 };
    }

    function _findF3Numeric(D, topology, Vb, Fb, port_d_m, nPort, Vb1, Vb2, Fb1, Fb2) {
        const N = 200;
        const freqs = [];
        for (let i = 0; i < N; i++) {
            freqs.push(Math.pow(10, Math.log10(10) + (i / (N - 1)) * (Math.log10(500) - Math.log10(10))));
        }

        const spl = [];
        for (const f of freqs) {
            let r;
            if (topology === 'vented') {
                r = computeVented(f, D, Vb / 1000, Fb, port_d_m, nPort);
            } else if (topology === 'bp4') {
                r = computeBandpass(f, D, Vb1 / 1000, Vb2 / 1000, Fb1, Fb2, 'bp4', port_d_m, nPort);
            } else if (topology === 'bp6') {
                r = computeBandpass(f, D, Vb1 / 1000, Vb2 / 1000, Fb1, Fb2, 'bp6', port_d_m, nPort);
            } else {
                r = computeBandpass(f, D, Vb1 / 1000, Vb2 / 1000, Fb1, Fb2, 'bp8', port_d_m, nPort);
            }
            spl.push(r.spl);
        }

        const finite = spl.filter(Number.isFinite);
        if (finite.length === 0) return 0;
        const sorted = [...finite].sort((a, b) => a - b);
        const peak = Math.max(...finite);
        const threshold = peak - 3;
        for (let i = 0; i < N; i++) {
            if (spl[i] >= threshold) return freqs[i];
        }
        return freqs[0];
    }

    function portLength(Vb_L, Fb, port_d_m, nPort) {
        const Vb_m3 = Vb_L / 1000;
        const S = Math.PI * port_d_m * port_d_m / 4 * nPort;
        const Leff = S / (Vb_m3 * Math.pow(2 * Math.PI * Fb / C0, 2));
        return Math.max(0.001, Leff - 0.85 * port_d_m);
    }

    function fbFromPortLength(Vb_L, L_port_m, port_d_m, nPort) {
        const Vb_m3 = Vb_L / 1000;
        const S = Math.PI * port_d_m * port_d_m / 4 * nPort;
        const Leff = L_port_m + 0.85 * port_d_m;
        if (Leff <= 0 || Vb_m3 <= 0 || S <= 0) return 0;
        return (C0 / (2 * Math.PI)) * Math.sqrt(S / (Vb_m3 * Leff));
    }

    function portAirVelocity(D, Fb, port_d_m, nPort) {
        const S = Math.PI * port_d_m * port_d_m / 4 * nPort;
        const Sd = D.sd * 1e-4;
        const w = 2 * Math.PI * Fb;
        const U_max = Sd * (D.xmax / 1000) * w;
        return U_max / S;
    }

    const OPTIMIZER_PROFILES = {
        balanced: { label: 'Сбалансированный', targetF3: 35, maxVolume: 40, maxPortVelocity: 15, minZ: 4, maxRipple: 3 },
        compact:  { label: 'Компактный',       targetF3: 45, maxVolume: 20, maxPortVelocity: 12, minZ: 6, maxRipple: 4 },
        bass:     { label: 'Глубокий бас',     targetF3: 28, maxVolume: 60, maxPortVelocity: 17, minZ: 4, maxRipple: 5 }
    };

    function _optimizerFrequencies() {
        const out = [];
        for (let i = 0; i < 48; i++) {
            out.push(Math.pow(10, Math.log10(20) + i / 47 * (Math.log10(200) - Math.log10(20))));
        }
        return out;
    }

    function _evaluateCandidate(D, type, candidate, limits) {
        const frequencies = _optimizerFrequencies();
        const spl = [];
        const excursion = [];
        let minZ = Infinity;
        let maxPortVelocity = 0;
        const portD = (candidate.port_d || 60) / 1000;
        const portN = Math.max(1, Math.floor(candidate.port_n || 1));

        for (const f of frequencies) {
            let r;
            if (type === 'sealed') {
                r = computeSealed(f, D, candidate.Vb / 1000);
            } else if (type === 'vented') {
                r = computeVented(f, D, candidate.Vb / 1000, candidate.Fb, portD, portN);
            } else {
                r = computeBandpass(
                    f, D, candidate.Vb1 / 1000, candidate.Vb2 / 1000,
                    candidate.Fb1 || candidate.Fb, candidate.Fb2 || candidate.Fb,
                    type, portD, portN
                );
            }
            if (!Number.isFinite(r.spl) || !Number.isFinite(r.x) || !Number.isFinite(r.z)) {
                return { score: Infinity, valid: false };
            }
            spl.push(r.spl);
            excursion.push(r.x);
            minZ = Math.min(minZ, r.z);
        }

        const peak = Math.max(...spl);
        const normalized = spl.map(v => v - peak);
        const mean = normalized.reduce((a, v) => a + v, 0) / normalized.length;
        const ripple = Math.max(...normalized) - Math.min(...normalized);
        const responseError = Math.sqrt(
            normalized.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / normalized.length
        );
        const maxExcursionRatio = Math.max(...excursion) / Math.max(D.xmax, 0.001);

        if (type !== 'sealed') {
            const portFb = type === 'vented'
                ? candidate.Fb
                : Math.max(candidate.Fb || 0, candidate.Fb1 || 0, candidate.Fb2 || 0);
            maxPortVelocity = portAirVelocity(D, portFb, portD, portN);
        }

        const f3 = frequencies.find((f, i) => normalized[i] >= -3) || frequencies[frequencies.length - 1];
        const totalVolume = type === 'sealed' || type === 'vented'
            ? candidate.Vb
            : candidate.Vb1 + candidate.Vb2;
        const portLengthMm = type === 'sealed' ? 0 : portLength(
            type === 'vented' ? candidate.Vb : candidate.Vb2 || candidate.Vb1,
            type === 'vented' ? candidate.Fb : candidate.Fb2 || candidate.Fb1,
            portD, portN
        ) * 1000;

        const score =
            responseError * 2 +
            Math.pow(Math.max(0, f3 - limits.targetF3) / limits.targetF3, 2) * 12 +
            Math.pow(Math.max(0, maxExcursionRatio - 1), 2) * 80 +
            Math.pow(Math.max(0, maxPortVelocity - limits.maxPortVelocity) / limits.maxPortVelocity, 2) * 20 +
            Math.pow(Math.max(0, limits.minZ - minZ) / limits.minZ, 2) * 30 +
            Math.pow(Math.max(0, totalVolume - limits.maxVolume) / limits.maxVolume, 2) * 10 +
            Math.pow(Math.max(0, ripple - limits.maxRipple) / limits.maxRipple, 2) * 4;

        return {
            score, valid: true, f3, responseError, ripple,
            maxExcursionRatio, minZ, maxPortVelocity, totalVolume, portLengthMm
        };
    }

    // ============================================================
    // ДЕФОЛТЫ
    // ============================================================

    const DEFAULTS = {
        driver: {
            fs: 45, qts: 0.40, vas: 34,
            re: 6.4, qms: 4.0, qes: 0.45,
            sd: 220, xmax: 5, spl: 88,
            le: 0.5, bl: 7.5, mms: 25, rms: 1.2, cms: 0.5
        },
        box: {
            type: 'sealed',
            Vb: 30, Fb: 40,
            Vb1: 20, Vb2: 15,
            Fb1: 45, Fb2: 70,
            port_d: 60, port_n: 1,
            targetQtc: 0.707,
            qtc_manual: null,
            qtc_sealed: null,
            qtc_vented: null,
            L_port_manual: null
        },
        ui: {
            activeType: 'sealed',
            sections: { driver: false, boxType: false },
            units: {}
        }
    };

    // ============================================================
    // ГРУППЫ ПОЛЕЙ ДРАЙВЕРА
    // ============================================================

    const DRIVER_GROUPS = [
        {
            id: 'resonance',
            title: 'Резонанс и добротность',
            fields: [
                { key: 'fs',  label: 'Fs',  unit: 'Hz', step: 0.1,  hint: 'Резонансная частота' },
                { key: 'qms', label: 'Qms', unit: '',   step: 0.1,  hint: 'Механическая добротность' },
                { key: 'qes', label: 'Qes', unit: '',   step: 0.01, hint: 'Электрическая добротность' },
                { key: 'qts', label: 'Qts', unit: '',   step: 0.01, hint: 'Полная добротность' }
            ]
        },
        {
            id: 'volume',
            title: 'Объём и площадь',
            fields: [
                { key: 'vas', label: 'Vas', unit: 'L',   step: 0.1, hint: 'Эквивалентный объём' },
                { key: 'sd',  label: 'Sd',  unit: 'cm²', step: 1,   hint: 'Эффективная площадь' }
            ]
        },
        {
            id: 'electric',
            title: 'Электрика',
            fields: [
                { key: 're', label: 'Re', unit: 'Ω',   step: 0.1,  hint: 'Сопротивление постоянному току' },
                { key: 'le', label: 'Le', unit: 'mH',  step: 0.01, hint: 'Индуктивность катушки' },
                { key: 'bl', label: 'BL', unit: 'T·m', step: 0.1,  hint: 'Силовой фактор' }
            ]
        },
        {
            id: 'mech',
            title: 'Механика',
            fields: [
                { key: 'mms', label: 'Mms', unit: 'g',    step: 0.1,  hint: 'Масса подвижной системы' },
                { key: 'cms', label: 'Cms', unit: 'mm/N', step: 0.01, hint: 'Гибкость подвеса' },
                { key: 'rms', label: 'Rms', unit: 'kg/s', step: 0.01, hint: 'Механическое сопротивление' }
            ]
        },
        {
            id: 'limits',
            title: 'Пределы и чувствительность',
            fields: [
                { key: 'xmax', label: 'Xmax', unit: 'mm', step: 0.1, hint: 'Линейное смещение' },
                { key: 'spl',  label: 'SPL',  unit: 'dB', step: 0.1, hint: 'Чувствительность' }
            ]
        }
    ];

    // ============================================================
    // СТИЛИ
    // ============================================================

    const STYLE_ID = 'acbox-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .acbox-root {
                position: absolute; inset: 0;
                display: flex; flex-direction: column; overflow: hidden;
                background: var(--bg-dark);
                color: var(--text-primary);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; line-height: 1.4;
                box-sizing: border-box; padding: 12px; gap: 10px;
                min-width: 0; min-height: 0;
                transition: background 0.4s ease, color 0.4s ease;
            }
            .acbox-root *,.acbox-root *::before,.acbox-root *::after { box-sizing: border-box; }

            .acbox-inner {
                display: flex; flex-direction: column; gap: 10px;
                width: 100%; height: 100%; min-width: 0; min-height: 0;
                overflow: hidden;
            }

            .acbox-section {
                background: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: var(--radius, 8px);
                display: flex; flex-direction: column;
                min-width: 0; min-height: 0; flex-shrink: 0;
                transition: border-color 0.2s ease, background 0.4s ease;
            }
            .acbox-section:hover { border-color: var(--beige-dark); }
            .acbox-section--grow { flex: 1 1 auto; min-height: 240px; overflow: hidden; }

            .acbox-section__head {
                display: flex; align-items: center; gap: 10px;
                padding: 9px 14px;
                background: transparent;
                border: none;
                width: 100%; text-align: left;
                font: inherit;
                font-size: 11px; font-weight: 700; letter-spacing: 0.6px;
                text-transform: uppercase;
                color: var(--text-secondary);
                cursor: pointer; user-select: none;
                transition: background 0.15s ease, color 0.15s ease;
                flex-shrink: 0;
            }
            .acbox-section__head:hover { background: var(--bg-hover); color: var(--beige); }
            .acbox-section__arrow { font-size: 9px; opacity: 0.7; width: 12px; text-align: center; flex-shrink: 0; }
            .acbox-section__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .acbox-section__hint { font-size: 9px; font-weight: 500; color: var(--text-muted); text-transform: none; letter-spacing: 0.2px; flex-shrink: 0; }

            .acbox-section__body {
                display: flex; flex-direction: column;
                width: 100%; min-width: 0; min-height: 0;
                padding: 4px 14px 14px; gap: 12px;
                overflow-y: auto; overflow-x: hidden;
                flex: 1 1 auto; scrollbar-width: thin;
            }
            .acbox-section__body::-webkit-scrollbar { width: 6px; }
            .acbox-section__body::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
            .acbox-section__body.collapsed { display: none; }
            .acbox-section--grow .acbox-section__body { overflow: hidden; padding-bottom: 0; }

            .acbox-driver-group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
            .acbox-driver-group__title {
                display: flex; align-items: center; gap: 8px;
                font-size: 10px; font-weight: 600; color: var(--text-muted);
                letter-spacing: 0.4px; text-transform: uppercase;
                padding-left: 2px; flex-shrink: 0;
            }
            .acbox-driver-group__title::after {
                content: ''; flex: 1; height: 1px;
                background: var(--border-color); opacity: 0.5; border-radius: 1px;
            }
            .acbox-driver-group__fields {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 10px;
            }

            .acbox-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
            .acbox-field__lbl {
                font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
                color: var(--text-secondary);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                cursor: help; user-select: none; transition: color 0.15s ease;
            }
            .acbox-field:focus-within .acbox-field__lbl { color: var(--beige); }
            .acbox-field__row { display: flex; align-items: stretch; gap: 5px; min-width: 0; }
            .acbox-field__inp {
                flex: 1 1 0; min-width: 0; width: 100%;
                padding: 7px 10px;
                font-size: 13px; font-weight: 600;
                font-family: 'Courier New', monospace;
                background: var(--bg-input);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-sm, 4px);
                outline: none;
                transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
            }
            .acbox-field__inp:hover { border-color: var(--beige-dark); }
            .acbox-field__inp:focus {
                border-color: var(--accent-red);
                box-shadow: 0 0 0 2px rgba(204, 34, 51, 0.15);
                background: var(--bg-hover);
            }
            .acbox-field__unit {
                display: inline-flex; align-items: center; justify-content: center;
                font-size: 10px; font-weight: 600; color: var(--beige);
                font-family: 'Courier New', monospace; flex-shrink: 0;
                min-width: 40px; padding: 0 6px;
                border-radius: var(--radius-sm, 4px);
                border: 1px solid transparent; background: transparent;
                cursor: pointer; user-select: none; transition: all 0.15s ease;
                white-space: nowrap; letter-spacing: 0.2px;
            }
            .acbox-field__unit:hover {
                color: var(--beige-light);
                background: rgba(200, 184, 154, 0.08);
                border-color: var(--border-color);
            }
            .acbox-field__unit--static { cursor: default; color: var(--text-muted); }
            .acbox-field__unit--static:hover { color: var(--text-muted); background: transparent; border-color: transparent; }
            .acbox-field__unit[data-multi="1"]::after { content: ' ⇄'; font-size: 8px; opacity: 0.6; margin-left: 2px; }

            .acbox-typebar { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
            .acbox-typebtn {
                display: flex; flex-direction: column; gap: 3px;
                padding: 10px 14px; font-size: 13px; font-weight: 700;
                font-family: inherit; border-radius: var(--radius-sm, 6px);
                border: 1px solid var(--border-color); background: var(--bg-card);
                color: var(--text-secondary); cursor: pointer;
                transition: all 0.15s ease; text-align: left; min-width: 0;
            }
            .acbox-typebtn:hover { border-color: var(--beige-dark); color: var(--text-primary); background: var(--bg-hover); transform: translateY(-1px); }
            .acbox-typebtn.active {
                background: var(--accent-red-dim);
                border-color: var(--accent-red);
                color: var(--beige-light);
                box-shadow: 0 0 0 2px rgba(204, 34, 51, 0.15);
            }
            .acbox-typebtn__desc { font-size: 10px; font-weight: 400; color: var(--text-muted); letter-spacing: 0.2px; line-height: 1.2; }
            .acbox-typebtn.active .acbox-typebtn__desc { color: var(--beige); }

            .acbox-3col {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.95fr);
                gap: 0; border: 1px solid var(--border-color);
                border-radius: var(--radius, 8px); overflow: hidden;
                background: var(--bg-panel); flex: 1 1 auto; min-height: 0; height: 100%;
            }
            .acbox-col {
                padding: 14px; min-width: 0; min-height: 0;
                display: flex; flex-direction: column; gap: 10px;
                overflow-y: auto; overflow-x: hidden; scrollbar-width: thin;
            }
            .acbox-col::-webkit-scrollbar { width: 6px; }
            .acbox-col::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
            .acbox-col + .acbox-col { border-left: 1px solid var(--border-color); }
            .acbox-col__title {
                display: flex; align-items: center; gap: 8px;
                font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
                text-transform: uppercase; color: var(--text-muted);
                padding-bottom: 8px; border-bottom: 1px solid var(--border-color);
                margin-bottom: 2px; flex-shrink: 0;
            }
            .acbox-col__title::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--beige-dark); flex-shrink: 0; }
            .acbox-col--base .acbox-col__title::before { background: var(--beige); }
            .acbox-col--res  .acbox-col__title::before { background: var(--success-color, #44cc88); }
            .acbox-col--act  .acbox-col__title::before { background: var(--accent-red); }

            @media (max-width: 900px) {
                .acbox-3col { grid-template-columns: 1fr 1fr; }
                .acbox-col--act { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--border-color); }
            }
            @media (max-width: 640px) {
                .acbox-3col { grid-template-columns: 1fr; }
                .acbox-col + .acbox-col { border-left: none; border-top: 1px solid var(--border-color); }
            }

            .acbox-result {
                display: flex; align-items: center; justify-content: space-between;
                gap: 10px; padding: 6px 0;
                border-bottom: 1px dashed rgba(200, 184, 154, 0.12);
                min-height: 30px; flex-shrink: 0;
            }
            .acbox-result:last-of-type { border-bottom: none; }
            .acbox-result__lbl { font-size: 11px; color: var(--text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
            .acbox-result__val {
                font-size: 13px; font-weight: 700; font-family: 'Courier New', monospace;
                color: var(--text-primary); flex-shrink: 0;
                display: inline-flex; align-items: baseline; gap: 4px;
            }
            .acbox-result__val--ok   { color: var(--success-color, #44cc88); }
            .acbox-result__val--warn { color: var(--warning-color, #ffaa33); }
            .acbox-result__val--err  { color: var(--accent-red-hover); }
            .acbox-result__unit { font-size: 10px; font-weight: 500; color: var(--text-muted); font-family: 'Courier New', monospace; }
            .acbox-result__inp {
                width: 78px; padding: 4px 8px;
                font-size: 13px; font-weight: 700;
                font-family: 'Courier New', monospace;
                background: var(--bg-input);
                color: var(--text-primary);
                border: 1px solid var(--accent-red-dim);
                border-radius: var(--radius-sm, 4px);
                outline: none; text-align: right;
                transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
            }
            .acbox-result__inp:hover { border-color: var(--accent-red); }
            .acbox-result__inp:focus {
                border-color: var(--accent-red);
                box-shadow: 0 0 0 2px rgba(204, 34, 51, 0.15);
                background: var(--bg-hover);
            }

            .acbox-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
            .acbox-btn {
                display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                padding: 10px 14px; font-size: 12px; font-weight: 600;
                font-family: inherit; border-radius: var(--radius-sm, 6px);
                border: 1px solid var(--border-color); background: var(--bg-card);
                color: var(--text-secondary); cursor: pointer;
                transition: all 0.15s ease; white-space: nowrap;
                min-width: 0; text-align: center;
            }
            .acbox-btn:hover {
                border-color: var(--beige-dark); color: var(--text-primary);
                background: var(--bg-hover); transform: translateY(-1px);
            }
            .acbox-btn--primary {
                background: var(--accent-red);
                border-color: var(--accent-red);
                color: #fff;
            }
            .acbox-btn--primary:hover {
                background: var(--accent-red-hover);
                border-color: var(--accent-red-hover);
                color: #fff;
                box-shadow: 0 0 20px rgba(204, 34, 51, 0.25);
            }
            .acbox-btn__icon { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; }
            .acbox-btn__icon svg { width: 14px; height: 14px; fill: currentColor; display: block; }

            .acbox-hint { font-size: 10px; font-style: italic; color: var(--text-muted); line-height: 1.5; padding: 2px 0 0; flex-shrink: 0; }
            .acbox-warn {
                padding: 9px 14px; font-size: 11px; font-weight: 600;
                color: var(--warning-color, #ffaa33);
                background: rgba(255, 170, 51, 0.08);
                border: 1px solid rgba(255, 170, 51, 0.3);
                border-radius: var(--radius-sm, 6px);
                line-height: 1.5; flex-shrink: 0;
            }

            .acbox-ports { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }

            .acbox-db-badge {
                display: inline-flex; align-items: center; gap: 6px;
                margin: 6px 0 2px;
                padding: 4px 10px;
                font-size: 10px;
                font-weight: 700;
                color: rgba(68, 204, 136, 0.95);
                background: rgba(68, 204, 136, 0.10);
                border: 1px solid rgba(68, 204, 136, 0.3);
                border-radius: 10px;
                align-self: flex-start;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .acbox-db-badge__clear {
                background: transparent;
                border: none;
                color: inherit;
                cursor: pointer;
                font-size: 10px;
                padding: 0 2px;
                font-weight: 700;
                opacity: 0.7;
                transition: opacity 0.15s;
            }
            .acbox-db-badge__clear:hover { opacity: 1; }

            @media (max-width: 640px) {
                .acbox-root { padding: 10px; gap: 8px; font-size: 12px; }
                .acbox-section__head { padding: 8px 12px; }
                .acbox-section__body { padding: 4px 12px 12px; }
                .acbox-driver-group__fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .acbox-col { padding: 12px; }
                .acbox-typebtn { padding: 9px 12px; font-size: 12px; }
            }
            @media (max-width: 420px) {
                .acbox-driver-group__fields { grid-template-columns: 1fr; }
                .acbox-ports { grid-template-columns: 1fr; }
                .acbox-field__unit { min-width: 34px; padding: 0 4px; }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // КЛАСС ОКНА
    // ============================================================

    class AcousticsBoxCalc extends window.BaseWindowInstance {

        static get meta() {
            return {
                id: 'acoustics-box-calc',
                name: 'Box Calculator',
                icon: 'icon-box',
                description: 'Thiele-Small расчёт корпуса (ЗЯ / ФИ / БП)',
                group: 'Акустика',
                category: 'editor',
                priority: 5,
                defaultSize: { width: 1000, height: 760 },
                minSize: { width: 480, height: 400 },
                maxWindows: 4,
                metadata: { version: '3.3.0', author: 'LSYSTEM' }
            };
        }

        static get menu() {
            return {
                headerItems: [
                    {
                        id: 'dd-alignment',
                        type: 'dropdown',
                        icon: 'icon-layout',
                        label: 'Настройки',
                        items: [
                            { header: 'Тип корпуса' },
                            { label: 'ЗЯ',  action: 'setSealed' },
                            { label: 'ФИ',  action: 'setVented' },
                            { label: 'БП4', action: 'setBP4' },
                            { label: 'БП6', action: 'setBP6' },
                            { label: 'БП8', action: 'setBP8' },
                            { divider: true },
                            { header: 'Целевые параметры' },
                            { label: 'Qtc = 0.577', action: 'setQtc577' },
                            { label: 'Qtc = 0.707', action: 'setQtc707' },
                            { label: 'Qtc = 0.9',   action: 'setQtc900' },
                            { divider: true },
                            { label: 'Из базы динамиков…', action: 'openSpeakerDatabase' },
                            { divider: true },
                            { label: 'Экспорт JSON',        action: 'exportJSON' },
                            { label: 'Отправить в Graphic', action: 'sendToGraphic' }
                        ]
                    }
                ]
            };
        }

        // ============================================================
        // СОСТОЯНИЕ
        // ============================================================

        _ensureFields() {
            if (this._fieldsReady) return;

            this._isDestroyed = false;
            this._root = null;
            this._sections = {};
            this._inputs = { driver: {}, box: {} };
            this._unitEls = {};
            this._resultEls = {};
            this._typeButtons = {};
            this._warnEl = null;
            this._optimizer = { running: false, cancelled: false, best: null, statusEl: null, applyBtn: null };

            this._driver = { ...DEFAULTS.driver };
            this._box    = { ...DEFAULTS.box };
            this._ui     = {
                ...DEFAULTS.ui,
                sections: { ...DEFAULTS.ui.sections },
                units: { ...DEFAULTS.ui.units }
            };

            this._loadedDriverName = null;

            this._saveTimer = null;
            this._pushTimer = null;
            this._graphicWindowId = null;

            this._fieldsReady = true;
        }

        // ============================================================
        // LIFECYCLE
        // ============================================================

        buildContent(el) {
            this._ensureFields();
            injectStyles();
            el.classList.add('acbox-root');
            this._root = el;

            const inner = document.createElement('div');
            inner.className = 'acbox-inner';
            el.appendChild(inner);

            this._driverSectionEl = this._buildDriverSection();
            inner.appendChild(this._driverSectionEl);
            inner.appendChild(this._buildTypeSection());

            this._boxSectionHost = document.createElement('div');
            this._boxSectionHost.style.cssText = 'flex:1 1 auto; min-height:0; display:flex; flex-direction:column;';
            inner.appendChild(this._boxSectionHost);

            this._renderBoxSection();
        }

        onReady() {
            if (this.data && this.data.driver) this._driver = { ...this._driver, ...this.data.driver };
            if (this.data && this.data.box)    this._box    = { ...this._box,    ...this.data.box };
            if (this.data && this.data.ui) {
                this._ui = {
                    ...this._ui,
                    ...this.data.ui,
                    sections: { ...this._ui.sections, ...(this.data.ui.sections || {}) },
                    units:    { ...this._ui.units,    ...(this.data.ui.units    || {}) }
                };
            }
            if (this.data && this.data.loadedDriverName) {
                this._loadedDriverName = String(this.data.loadedDriverName);
            }
            this._refreshAll();
        }

        onData(payload) {
            if (payload && payload.data) {
                if (payload.data.driver) this._driver = { ...this._driver, ...payload.data.driver };
                if (payload.data.box)    this._box    = { ...this._box,    ...payload.data.box };
                if (payload.data.ui) {
                    this._ui = {
                        ...this._ui,
                        ...payload.data.ui,
                        sections: { ...this._ui.sections, ...(payload.data.ui.sections || {}) },
                        units:    { ...this._ui.units,    ...(payload.data.ui.units    || {}) }
                    };
                }
                if (payload.data.loadedDriverName !== undefined) {
                    this._loadedDriverName = payload.data.loadedDriverName;
                }
                this._refreshAll();
            }
        }

        onMessage(senderId, channel, data) {
            if (channel === 'boxcalc:load-driver') {
                this._loadDriverFromPayload(data);
                return;
            }
        }

        onThemeChange() {}
        onBeforeDestroy() {
            this._isDestroyed = true;
            if (this._optimizer) this._optimizer.cancelled = true;
            clearTimeout(this._saveTimer);
            clearTimeout(this._pushTimer);
        }

        // ============================================================
        // ИНТЕГРАЦИЯ С SPEAKER DATABASE
        // ============================================================

        _loadDriverFromPayload(payload) {
            if (!payload || !payload.driver) {
                this.notify('Загрузка', 'Пустой payload', 'warning');
                return;
            }

            const src = payload.driver;

            const copyIfPositive = (key) => {
                const v = Number(src[key]);
                if (isFinite(v) && v > 0) {
                    this._driver[key] = v;
                    return true;
                }
                return false;
            };

            // Обязательные и ключевые поля
            ['fs', 'qts', 'qes', 'qms', 'vas', 'sd', 're', 'le', 'xmax', 'spl'].forEach(copyIfPositive);
            ['bl', 'mms'].forEach(copyIfPositive);

            // Флаги «пользователь задал вручную»
            const user = { ...(this._driver._user || {}) };
            for (const k of ['fs', 'qts', 'qes', 'qms', 'vas', 'sd', 're', 'le', 'xmax', 'spl', 'bl', 'mms']) {
                const v = Number(src[k]);
                if (isFinite(v) && v > 0) user[k] = true;
            }

            // Убираем флаги расчёта для тех полей, что обновили
            const calc = { ...(this._driver._calc || {}) };
            for (const k of ['qes', 'qms', 'cms', 'mms', 'rms', 'bl']) {
                if (user[k]) delete calc[k];
            }

            this._driver._user = user;
            this._driver._calc = calc;
            this._driver._lastEdited = null;
            this._driver._version = (this._driver._version || 1) + 1;

            // Синхронизация UI
            this._refreshAll();
            this._recompute();
            this._saveDelayed();
            this._pushToGraphicDelayed();

            const label = `${src.brand || ''} ${src.model || ''}`.trim();
            this._loadedDriverName = label || 'Из базы';

            // Обновить плашку (если драйвер-секция уже отрисована)
            this._refreshDriverBadge();

            this.notify(
                'Динамик загружен',
                label ? `Из базы: ${label}` : 'Из базы динамиков',
                'success'
            );
        }

        _refreshDriverBadge() {
            if (!this._driverSectionEl) return;

            // Убираем старую плашку
            const old = this._driverSectionEl.querySelector('.acbox-db-badge');
            if (old) old.remove();

            if (!this._loadedDriverName) return;

            const badge = document.createElement('div');
            badge.className = 'acbox-db-badge';
            badge.title = 'Динамик загружен из базы';

            const span = document.createElement('span');
            span.textContent = '✓ Из базы: ' + this._loadedDriverName;
            span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
            badge.appendChild(span);

            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'acbox-db-badge__clear';
            clear.textContent = '✕';
            clear.title = 'Снять плашку';
            clear.addEventListener('click', (e) => {
                e.stopPropagation();
                this._loadedDriverName = null;
                badge.remove();
                this._saveDelayed();
            });
            badge.appendChild(clear);

            // Вставляем в начало body секции драйвера
            const body = this._driverSectionEl.querySelector('.acbox-section__body');
            if (body) body.insertBefore(badge, body.firstChild);
        }

        _openSpeakerDatabase() {
            let target = null;
            try {
                if (typeof this.findWindowByType === 'function') {
                    target = this.findWindowByType('speaker-database');
                }
            } catch (e) {}

            if (target && target.id != null) {
                try {
                    this.sendMessage('speaker-database:focus', {}, target.id);
                } catch (e) {}
                this.notify('База динамиков', 'Окно уже открыто', 'info');
                return;
            }

            const lm = this._layoutManager;
            if (!lm || typeof lm.addWindow !== 'function') {
                this.notify('База динамиков', 'Не удалось открыть окно', 'warning');
                return;
            }

            let created = null;
            try { created = lm.addWindow('speaker-database'); }
            catch (e) {}

            if (!created) {
                this.notify('База динамиков', 'Нет места для окна', 'warning');
                return;
            }

            this.notify('База динамиков', 'Открыто. Выберите динамик и нажмите «Открыть в BP6 Calculator».', 'info');
        }

        // ============================================================
        // СЕКЦИИ
        // ============================================================

        _buildDriverSection() {
            const sec = this._makeSection('Параметры динамика', 'driver', { hint: 'T/S параметры драйвера' });
            sec.body.classList.remove('collapsed');
            for (const group of DRIVER_GROUPS) {
                const g = document.createElement('div');
                g.className = 'acbox-driver-group';

                const title = document.createElement('div');
                title.className = 'acbox-driver-group__title';
                title.textContent = group.title;
                g.appendChild(title);

                const fields = document.createElement('div');
                fields.className = 'acbox-driver-group__fields';
                for (const f of group.fields) fields.appendChild(this._buildInput('driver', f));
                g.appendChild(fields);

                sec.body.appendChild(g);
            }

            // Плашка «Из базы», если уже загружен
            if (this._loadedDriverName) {
                setTimeout(() => this._refreshDriverBadge(), 0);
            }

            return sec.el;
        }

        _buildTypeSection() {
            const sec = this._makeSection('Тип корпуса', 'boxType');
            sec.body.classList.remove('collapsed');
            const bar = document.createElement('div');
            bar.className = 'acbox-typebar';

            const TYPES = [
                { id: 'sealed', label: 'ЗЯ',  desc: 'Закрытый ящик' },
                { id: 'vented', label: 'ФИ',  desc: 'Фазоинвертор' },
                { id: 'bp4',    label: 'БП4', desc: 'Бандпасс 4-го порядка' },
                { id: 'bp6',    label: 'БП6', desc: 'Бандпасс 6-го порядка' },
                { id: 'bp8',    label: 'БП8', desc: 'Бандпасс 8-го порядка' }
            ];

            for (const t of TYPES) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'acbox-typebtn' + (this._box.type === t.id ? ' active' : '');
                btn.dataset.type = t.id;
                const lbl = document.createElement('span'); lbl.textContent = t.label; btn.appendChild(lbl);
                const d = document.createElement('span'); d.className = 'acbox-typebtn__desc'; d.textContent = t.desc; btn.appendChild(d);
                btn.addEventListener('click', () => {
                    this._box.type = t.id;
                    this._ui.activeType = t.id;
                    this._updateTypeButtons();
                    this._renderBoxSection();
                    this._saveDelayed();
                    this._pushToGraphicDelayed();
                });
                bar.appendChild(btn);
                this._typeButtons[t.id] = btn;
            }
            sec.body.appendChild(bar);
            return sec.el;
        }

        _updateTypeButtons() {
            for (const id in this._typeButtons) {
                this._typeButtons[id].classList.toggle('active', this._box.type === id);
            }
        }

        // ============================================================
        // БЛОК КОРПУСА
        // ============================================================

        _renderBoxSection() {
            if (!this._boxSectionHost) return;
            this._inputs.box = {};
            this._unitEls = Object.fromEntries(
                Object.entries(this._unitEls).filter(([k]) => k.startsWith('driver.'))
            );
            this._resultEls = {};

            this._boxSectionHost.innerHTML = '';
            const sec = this._makeSection(
                'Корпус · ' + this._typeLabel(this._box.type),
                'box',
                { hint: 'Вход / Результат / Действия', grow: true }
            );
            sec.body.classList.remove('collapsed');

            const grid = document.createElement('div');
            grid.className = 'acbox-3col';

            const colBase = document.createElement('div');
            colBase.className = 'acbox-col acbox-col--base';
            colBase.appendChild(this._colTitle('Базовые параметры'));
            this._renderBaseParams(colBase);
            grid.appendChild(colBase);

            const colRes = document.createElement('div');
            colRes.className = 'acbox-col acbox-col--res';
            colRes.appendChild(this._colTitle('Результаты'));
            this._renderResults(colRes);
            grid.appendChild(colRes);

            const colAct = document.createElement('div');
            colAct.className = 'acbox-col acbox-col--act';
            colAct.appendChild(this._colTitle('Действия'));
            this._renderActions(colAct);
            grid.appendChild(colAct);

            sec.body.appendChild(grid);
            this._boxSectionHost.appendChild(sec.el);
            this._recompute();
        }

        _colTitle(text) {
            const el = document.createElement('div');
            el.className = 'acbox-col__title';
            el.textContent = text;
            return el;
        }

        _typeLabel(type) {
            return ({
                sealed: 'Закрытый ящик',
                vented: 'Фазоинвертор',
                bp4: 'Бандпасс 4-го порядка',
                bp6: 'Бандпасс 6-го порядка',
                bp8: 'Бандпасс 8-го порядка'
            })[type] || type;
        }

        _renderBaseParams(host) {
            const t = this._box.type;

            if (t === 'sealed') {
                host.appendChild(this._buildInput('box', { key: 'Vb', label: 'Vc (объём)', unit: 'L', step: 0.1, hint: 'Полезный объём' }));
                host.appendChild(this._hint('Qtc = 0.707 — самая гладкая АЧХ. Меню «Настройки».'));

            } else if (t === 'vented') {
                host.appendChild(this._buildInput('box', { key: 'Vb', label: 'Vb', unit: 'L', step: 0.1, hint: 'Объём корпуса' }));
                host.appendChild(this._buildInput('box', { key: 'Fb', label: 'Fb', unit: 'Hz', step: 0.1, hint: 'Резонанс порта' }));
                host.appendChild(this._portsRow());
                host.appendChild(this._hint('Fb — настройка фазоинвертора. L порта можно редактировать в результатах.'));

            } else if (t === 'bp4') {
                host.appendChild(this._buildInput('box', { key: 'Vb1', label: 'Vb1 (закрытая)', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Vb2', label: 'Vb2 (с портом)', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Fb', label: 'Fb порта', unit: 'Hz', step: 0.1 }));
                host.appendChild(this._portsRow());
                host.appendChild(this._hint('Vb1 — закрытая, Vb2 — с портом наружу.'));

            } else if (t === 'bp6') {
                host.appendChild(this._buildInput('box', { key: 'Vb1', label: 'Vb1', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Vb2', label: 'Vb2', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Fb1', label: 'Fb1', unit: 'Hz', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Fb2', label: 'Fb2', unit: 'Hz', step: 0.1 }));
                host.appendChild(this._portsRow());
                host.appendChild(this._hint('Обе камеры с портами наружу.'));

            } else if (t === 'bp8') {
                host.appendChild(this._buildInput('box', { key: 'Vb1', label: 'Vb1', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Vb2', label: 'Vb2', unit: 'L', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Fb1', label: 'Fb1 (наружу)', unit: 'Hz', step: 0.1 }));
                host.appendChild(this._buildInput('box', { key: 'Fb2', label: 'Fb2 (между)', unit: 'Hz', step: 0.1 }));
                host.appendChild(this._portsRow());
                host.appendChild(this._hint('Fb1 — наружу, Fb2 — межкамерный.'));
            }
        }

        _portsRow() {
            const row = document.createElement('div');
            row.className = 'acbox-ports';
            row.appendChild(this._buildInput('box', { key: 'port_d', label: 'Ø порта', unit: 'мм', step: 1 }));
            row.appendChild(this._buildInput('box', { key: 'port_n', label: 'Кол-во', unit: '', step: 1 }));
            return row;
        }

        _hint(text) {
            const el = document.createElement('div');
            el.className = 'acbox-hint';
            el.textContent = text;
            return el;
        }

        _renderResults(host) {
            const t = this._box.type;
            const R = (label, key, opts) => host.appendChild(this._resultRow(label, key, opts));

            if (t === 'sealed') {
                R('Qtc', 'qtc', { edit: true, unit: '' });
                R('Fc', 'fc', { unit: 'Hz' });
                R('F3 (-3dB)', 'f3', { unit: 'Hz' });
                R('Vb', 'Vb_out', { edit: true, unit: 'L' });

            } else if (t === 'vented') {
                R('Qtc_eff', 'qtc', { unit: '' });
                R('F3 (-3dB)', 'f3', { unit: 'Hz' });
                R('Fb', 'Fb_out', { edit: true, unit: 'Hz' });
                R('Vb', 'Vb_out', { edit: true, unit: 'L' });
                R('L порта', 'port_L', { edit: true, unit: 'мм' });
                R('v воздуха', 'v_port', { unit: 'м/с' });

            } else if (t === 'bp4') {
                R('Fc (закр.)', 'fc1', { unit: 'Hz' });
                R('Fb (наружу)', 'fb_out', { edit: true, unit: 'Hz' });
                R('F3 (-3dB)', 'f3', { unit: 'Hz' });
                R('Vb1', 'Vb1_out', { edit: true, unit: 'L' });
                R('Vb2', 'Vb2_out', { edit: true, unit: 'L' });
                R('L порта', 'port_L', { edit: true, unit: 'мм' });
                R('v воздуха', 'v_port', { unit: 'м/с' });

            } else if (t === 'bp6' || t === 'bp8') {
                R('Fc1', 'fc1', { unit: 'Hz' });
                R('Fc2', 'fc2', { unit: 'Hz' });
                R('Fb1', 'Fb1_out', { edit: true, unit: 'Hz' });
                R('Fb2', 'Fb2_out', { edit: true, unit: 'Hz' });
                R('F3 (-3dB)', 'f3', { unit: 'Hz' });
                R('Vb1', 'Vb1_out', { edit: true, unit: 'L' });
                R('Vb2', 'Vb2_out', { edit: true, unit: 'L' });
                R('L порта', 'port_L', { edit: true, unit: 'мм' });
                R('v воздуха', 'v_port', { unit: 'м/с' });
            }
        }

        _resultRow(label, key, opts = {}) {
            const row = document.createElement('div');
            row.className = 'acbox-result' + (opts.edit ? ' acbox-result--edit' : '');

            const lbl = document.createElement('div');
            lbl.className = 'acbox-result__lbl';
            lbl.textContent = label;
            if (opts.hint) lbl.title = opts.hint;
            row.appendChild(lbl);

            const valWrap = document.createElement('div');
            valWrap.className = 'acbox-result__val';

            if (opts.edit) {
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.step = '0.1';
                inp.className = 'acbox-result__inp';
                inp.value = '';
                inp.addEventListener('change', () => {
                    const v = Number(inp.value);
                    if (!isFinite(v)) return;
                    this._onResultEdit(key, v);
                });
                inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
                valWrap.appendChild(inp);
                this._resultEls[key] = inp;
            } else {
                const span = document.createElement('span');
                span.textContent = '—';
                valWrap.appendChild(span);
                this._resultEls[key] = span;
            }

            if (opts.unit) {
                const u = document.createElement('span');
                u.className = 'acbox-result__unit';
                u.textContent = opts.unit;
                valWrap.appendChild(u);
            }

            row.appendChild(valWrap);
            return row;
        }

        _onResultEdit(key, v) {
            switch (key) {
                case 'Vb_out':
                    this._box.Vb = v;
                    if (this._box.type === 'sealed') this._box.qtc_sealed = null;
                    if (this._inputs.box.Vb) this._inputs.box.Vb.value = v;
                    break;
                case 'Fb_out':
                    this._box.Fb = v;
                    if (this._inputs.box.Fb) this._inputs.box.Fb.value = v;
                    break;
                case 'Vb1_out':
                    this._box.Vb1 = v;
                    if (this._inputs.box.Vb1) this._inputs.box.Vb1.value = v;
                    break;
                case 'Vb2_out':
                    this._box.Vb2 = v;
                    if (this._inputs.box.Vb2) this._inputs.box.Vb2.value = v;
                    break;
                case 'Fb1_out':
                    this._box.Fb1 = v;
                    if (this._inputs.box.Fb1) this._inputs.box.Fb1.value = v;
                    break;
                case 'Fb2_out':
                    this._box.Fb2 = v;
                    if (this._inputs.box.Fb2) this._inputs.box.Fb2.value = v;
                    break;
                case 'qtc':
                    this._box.qtc_sealed = v;
                    if (this._box.type === 'sealed') {
                        const r = v / this._driver.qts;
                        if (r > 1) {
                            const Vb = this._driver.vas / (r * r - 1);
                            if (Vb > 0 && isFinite(Vb)) {
                                this._box.Vb = Math.round(Vb * 10) / 10;
                                if (this._inputs.box.Vb) this._inputs.box.Vb.value = this._box.Vb;
                                this._setResult('qtc', v, this._qtcTone(v));
                            }
                        }
                    }
                    break;
                case 'port_L': {
                    const L_m = v / 1000;
                    const port_d_m = (this._box.port_d || 60) / 1000;
                    const nPort = Math.max(1, Math.floor(this._box.port_n || 1));
                    if (this._box.type === 'vented') {
                        const Fb = fbFromPortLength(this._box.Vb, L_m, port_d_m, nPort);
                        if (Fb > 0) {
                            this._box.Fb = Math.round(Fb * 100) / 100;
                            if (this._inputs.box.Fb) this._inputs.box.Fb.value = this._box.Fb;
                        }
                    } else if (this._box.type === 'bp4') {
                        const Fb = fbFromPortLength(this._box.Vb2, L_m, port_d_m, nPort);
                        if (Fb > 0) {
                            this._box.Fb = Math.round(Fb * 100) / 100;
                            if (this._inputs.box.Fb) this._inputs.box.Fb.value = this._box.Fb;
                        }
                    } else if (this._box.type === 'bp6') {
                        const Fb2 = fbFromPortLength(this._box.Vb2, L_m, port_d_m, nPort);
                        if (Fb2 > 0) {
                            this._box.Fb2 = Math.round(Fb2 * 100) / 100;
                            if (this._inputs.box.Fb2) this._inputs.box.Fb2.value = this._box.Fb2;
                        }
                    } else if (this._box.type === 'bp8') {
                        const Fb1 = fbFromPortLength(this._box.Vb1, L_m, port_d_m, nPort);
                        if (Fb1 > 0) {
                            this._box.Fb1 = Math.round(Fb1 * 100) / 100;
                            if (this._inputs.box.Fb1) this._inputs.box.Fb1.value = this._box.Fb1;
                        }
                    }
                    this._box.L_port_manual = v;
                    break;
                }
            }
            this._recompute();
            this._saveDelayed();
            this._pushToGraphicDelayed();
        }

        _renderOptimizer(host) {
            const box = document.createElement('div');
            box.style.cssText = 'display:flex;flex-direction:column;gap:7px;padding:9px;border:1px solid var(--border-color);border-radius:var(--radius-sm,6px);';

            const title = document.createElement('div');
            title.textContent = 'Автоподбор параметров';
            title.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-secondary);';
            box.appendChild(title);

            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
            const profile = document.createElement('select');
            profile.className = 'acbox-result__inp';
            profile.style.width = '100%';
            for (const [id, item] of Object.entries(OPTIMIZER_PROFILES)) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = item.label;
                profile.appendChild(option);
            }
            const f3 = document.createElement('input');
            f3.type = 'number'; f3.min = '15'; f3.max = '100'; f3.step = '1';
            f3.className = 'acbox-result__inp'; f3.title = 'Желаемая F3, Гц';
            f3.value = OPTIMIZER_PROFILES.balanced.targetF3;
            profile.addEventListener('change', () => {
                f3.value = OPTIMIZER_PROFILES[profile.value].targetF3;
            });
            row.appendChild(profile); row.appendChild(f3); box.appendChild(row);

            const limits = document.createElement('div');
            limits.textContent = 'F3, Гц · профиль ограничивает объём, Xmax, порт и импеданс';
            limits.className = 'acbox-hint';
            box.appendChild(limits);

            const status = document.createElement('div');
            status.className = 'acbox-hint';
            status.textContent = 'Готов к запуску';
            box.appendChild(status);
            this._optimizer.statusEl = status;

            const buttons = document.createElement('div');
            buttons.className = 'acbox-actions';
            const run = this._btn('Подобрать автоматически', 'icon-settings', 'primary', () => {
                this._startOptimization(profile.value, Number(f3.value));
            });
            const cancel = this._btn('Остановить', 'icon-close', 'default', () => {
                if (this._optimizer) this._optimizer.cancelled = true;
            });
            const apply = this._btn('Применить лучший вариант', 'icon-check', 'default', () => this._applyOptimization());
            apply.disabled = true;
            apply.style.opacity = '0.55';
            this._optimizer.applyBtn = apply;
            buttons.appendChild(run); buttons.appendChild(cancel); buttons.appendChild(apply);
            box.appendChild(buttons);
            host.appendChild(box);
        }

        _startOptimization(profileId, targetF3) {
            if (this._optimizer.running) return;
            const profile = OPTIMIZER_PROFILES[profileId] || OPTIMIZER_PROFILES.balanced;
            const limits = { ...profile, targetF3: Number.isFinite(targetF3) && targetF3 > 0 ? targetF3 : profile.targetF3 };
            const D = driverFromTS(this._driver);
            const type = this._box.type;
            const candidates = [];
            const add = candidate => candidates.push({ ...candidate, port_d: candidate.port_d || this._box.port_d, port_n: this._box.port_n });
            if (type === 'sealed') {
                for (let Vb = 8; Vb <= limits.maxVolume * 1.5; Vb += 2) add({ Vb });
            } else if (type === 'vented') {
                for (let Vb = 12; Vb <= limits.maxVolume * 1.5; Vb += 4)
                    for (let Fb = 28; Fb <= 65; Fb += 3)
                        for (const port_d of [50, 60, 70, 80]) add({ Vb, Fb, port_d });
            } else {
                for (let Vb1 = 8; Vb1 <= limits.maxVolume * 0.75; Vb1 += 6)
                    for (let Vb2 = 8; Vb2 <= limits.maxVolume * 0.75; Vb2 += 6)
                        for (let Fb1 = 30; Fb1 <= 70; Fb1 += 8)
                            for (let Fb2 = type === 'bp4' ? 45 : 55; Fb2 <= 100; Fb2 += 10)
                                add({ Vb1, Vb2, Fb: Fb2, Fb1, Fb2 });
            }

            this._optimizer.running = true;
            this._optimizer.cancelled = false;
            this._optimizer.best = null;
            if (this._optimizer.applyBtn) {
                this._optimizer.applyBtn.disabled = true;
                this._optimizer.applyBtn.style.opacity = '0.55';
            }
            let index = 0;
            const batchSize = 20;
            const step = () => {
                if (this._isDestroyed || this._optimizer.cancelled) {
                    this._optimizer.running = false;
                    if (this._optimizer.statusEl) this._optimizer.statusEl.textContent = 'Подбор остановлен';
                    return;
                }
                const end = Math.min(index + batchSize, candidates.length);
                for (; index < end; index++) {
                    const candidate = candidates[index];
                    const metrics = _evaluateCandidate(D, type, candidate, limits);
                    if (!this._optimizer.best || metrics.score < this._optimizer.best.metrics.score) {
                        this._optimizer.best = { candidate, metrics };
                    }
                }
                if (this._optimizer.statusEl) {
                    const best = this._optimizer.best;
                    this._optimizer.statusEl.textContent = `Проверено ${index}/${candidates.length}` +
                        (best ? ` · score ${best.metrics.score.toFixed(2)} · F3 ${best.metrics.f3.toFixed(1)} Гц` : '');
                }
                if (index < candidates.length) {
                    setTimeout(step, 0);
                } else {
                    this._optimizer.running = false;
                    if (this._optimizer.applyBtn && this._optimizer.best) {
                        this._optimizer.applyBtn.disabled = false;
                        this._optimizer.applyBtn.style.opacity = '1';
                    }
                }
            };
            step();
        }

        _applyOptimization() {
            const best = this._optimizer && this._optimizer.best;
            if (!best) return;
            const candidate = best.candidate;
            for (const key of ['Vb', 'Fb', 'Vb1', 'Vb2', 'Fb1', 'Fb2', 'port_d', 'port_n']) {
                if (candidate[key] == null) continue;
                this._box[key] = candidate[key];
                if (this._inputs.box[key]) this._inputs.box[key].value = candidate[key];
            }
            this._box.L_port_manual = null;
            this._recompute();
            this._saveDelayed();
            this._pushToGraphicDelayed();
            if (this._optimizer.statusEl) this._optimizer.statusEl.textContent += ' · применено';
        }

        _renderActions(host) {
            // Кнопка «Из базы динамиков»
            const fromDb = this._btn('Из базы динамиков', 'icon-speaker', 'default', () => {
                this._openSpeakerDatabase();
            });
            host.appendChild(fromDb);

            this._renderOptimizer(host);
            const wrap = document.createElement('div');
            wrap.className = 'acbox-actions';
            wrap.appendChild(this._btn('Экспорт JSON',        'icon-save',    'default', () => this._exportJSON()));
            wrap.appendChild(this._btn('Отправить в Graphic', 'icon-graphic', 'primary', () => this._sendToGraphic()));
            wrap.appendChild(this._btn('Скачать',             'icon-download','default', () => {
                this.notify('Скачать', 'Функция в разработке', 'info');
            }));
            host.appendChild(wrap);

            const warn = document.createElement('div');
            warn.className = 'acbox-warn';
            warn.style.display = 'none';
            host.appendChild(warn);
            this._warnEl = warn;
        }

        _btn(label, iconId, variant, onClick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'acbox-btn' + (variant !== 'default' ? ' acbox-btn--' + variant : '');
            const ic = document.createElement('span');
            ic.className = 'acbox-btn__icon';
            let svg = null;
            try {
                if (this.ui && this.ui.icon && typeof this.ui.icon.svg === 'function') {
                    svg = this.ui.icon.svg(iconId, 14);
                }
            } catch (e) {}
            if (!svg) {
                ic.textContent = ({
                    'icon-save': '💾',
                    'icon-graphic': '📈',
                    'icon-download': '⬇',
                    'icon-speaker': '🔊',
                    'icon-settings': '⚙',
                    'icon-close': '✕',
                    'icon-check': '✓'
                })[iconId] || '•';
                ic.style.fontSize = '13px';
            } else ic.appendChild(svg);
            b.appendChild(ic);
            const t = document.createElement('span'); t.textContent = label; b.appendChild(t);
            b.addEventListener('click', onClick);
            return b;
        }

        // ============================================================
        // INPUT + UNITS
        // ============================================================

        _buildInput(group, f) {
            const wrap = document.createElement('div');
            wrap.className = 'acbox-field';

            const lbl = document.createElement('div');
            lbl.className = 'acbox-field__lbl';
            lbl.textContent = f.label;
            if (f.hint) lbl.title = f.hint;
            wrap.appendChild(lbl);

            const row = document.createElement('div');
            row.className = 'acbox-field__row';

            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = String(f.step || 0.1);
            inp.className = 'acbox-field__inp';
            inp.dataset.group = group;
            inp.dataset.key = f.key;
            inp.value = this._formatForInput(this._displayValue(group, f.key));
            if (f.hint) inp.title = f.hint;

            inp.addEventListener('change', () => {
                const raw = Number(inp.value);
                if (!isFinite(raw)) { inp.value = this._formatForInput(this._displayValue(group, f.key)); return; }
                const vBase = this._toBase(f.key, raw);
                this._setVal(group, f.key, vBase);
                if (group === 'box' && f.key === 'Vb' && this._box.type === 'sealed') {
                    this._box.qtc_sealed = null;
                }
                this._refreshAll();
                this._saveDelayed();
                this._pushToGraphicDelayed();
            });
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
            row.appendChild(inp);

            const unitWrap = document.createElement('button');
            unitWrap.type = 'button';
            unitWrap.className = 'acbox-field__unit';
            unitWrap.dataset.group = group;
            unitWrap.dataset.key = f.key;

            const unitsKey = FIELD_UNITS[f.key];
            const unitsArr = unitsKey ? (UNITS[unitsKey] || []) : [];

            if (unitsArr.length <= 1) {
                unitWrap.classList.add('acbox-field__unit--static');
                unitWrap.textContent = f.unit || (unitsArr[0] ? unitsArr[0].label : '');
                unitWrap.disabled = true;
            } else {
                unitWrap.dataset.multi = '1';
                const uid = this._getUnitId(group, f.key, unitsArr);
                const cur = unitsArr.find(u => u.id === uid) || unitsArr[0];
                unitWrap.textContent = cur.label;
                unitWrap.title = 'Клик — переключить (' + unitsArr.map(u => u.label).join(' / ') + ')';
                unitWrap.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._cycleUnit(group, f.key);
                });
            }
            row.appendChild(unitWrap);
            wrap.appendChild(row);

            if (!this._inputs[group]) this._inputs[group] = {};
            this._inputs[group][f.key] = inp;
            this._unitEls[group + '.' + f.key] = unitWrap;

            return wrap;
        }

        _getUnitId(group, key, unitsArr) {
            const stored = this._ui.units[key];
            if (stored && unitsArr.some(u => u.id === stored)) return stored;
            return unitsArr[0].id;
        }

        _cycleUnit(group, key) {
            const unitsKey = FIELD_UNITS[key];
            const unitsArr = UNITS[unitsKey] || [];
            if (unitsArr.length <= 1) return;

            const curId = this._getUnitId(group, key, unitsArr);
            const curIdx = unitsArr.findIndex(u => u.id === curId);
            const nextIdx = (curIdx + 1) % unitsArr.length;
            const nextUnit = unitsArr[nextIdx];

            const vBase = this._getVal(group, key);
            const vNew = nextUnit.fromBase(vBase);

            const inp = this._inputs[group] && this._inputs[group][key];
            if (inp) {
                inp.value = this._formatForInput(vNew);
                inp.step = String(this._stepForUnit(key, nextUnit));
            }

            const uEl = this._unitEls[group + '.' + key];
            if (uEl) uEl.textContent = nextUnit.label;

            this._ui.units[key] = nextUnit.id;
            this._saveDelayed();
        }

        _formatForInput(v) {
            if (!Number.isFinite(v)) return '';
            if (Math.abs(v) >= 1000) return String(Math.round(v));
            if (Math.abs(v) >= 100)  return String(Math.round(v * 10) / 10);
            if (Math.abs(v) >= 1)    return String(Math.round(v * 1000) / 1000);
            return String(Math.round(v * 10000) / 10000);
        }

        _stepForUnit(key, unit) {
            const base = FIELD_UNITS[key];
            switch (base) {
                case 'Hz':  return unit.id === 'kHz' ? 0.01 : 0.1;
                case 'L':   return unit.id === 'L' ? 0.1 : unit.id === 'm3' ? 0.001 : 1;
                case 'mm':  return unit.id === 'm' ? 0.001 : unit.id === 'cm' ? 0.1 : unit.id === 'in' ? 0.01 : 1;
                case 'cm2': return unit.id === 'm2' ? 0.001 : unit.id === 'in2' ? 0.1 : 1;
                case 'g':   return unit.id === 'kg' ? 0.001 : unit.id === 'oz' ? 0.1 : 0.1;
                case 'mmN': return unit.id === 'mN' ? 0.001 : 0.01;
                case 'ohm': return unit.id === 'kohm' ? 0.001 : unit.id === 'mohm' ? 1 : 0.1;
                case 'mH':  return unit.id === 'H' ? 0.001 : unit.id === 'uH' ? 1 : 0.01;
                case 'Tm':  return unit.id === 'gauss' ? 100 : 0.1;
                case 'kgs': return unit.id === 'gs' ? 1 : 0.01;
                default:    return 0.1;
            }
        }

        _getVal(group, key) {
            if (group === 'driver') return this._driver[key];
            return this._box[key];
        }
        _setVal(group, key, v) {
            if (group === 'driver') this._driver[key] = v;
            else this._box[key] = v;
        }
        _displayValue(group, key) {
            const base = this._getVal(group, key);
            const unitsKey = FIELD_UNITS[key];
            const unitsArr = unitsKey ? (UNITS[unitsKey] || []) : [];
            if (unitsArr.length === 0) return base;
            const curId = this._getUnitId(group, key, unitsArr);
            const curUnit = unitsArr.find(u => u.id === curId) || unitsArr[0];
            return curUnit.fromBase(base);
        }
        _toBase(key, displayVal) {
            const unitsKey = FIELD_UNITS[key];
            const unitsArr = unitsKey ? (UNITS[unitsKey] || []) : [];
            if (unitsArr.length === 0) return displayVal;
            const curId = this._ui.units[key] || unitsArr[0].id;
            const curUnit = unitsArr.find(u => u.id === curId) || unitsArr[0];
            return curUnit.toBase(displayVal);
        }

        // ============================================================
        // SECTION
        // ============================================================

        _makeSection(title, key, opts = {}) {
            const el = document.createElement('div');
            el.className = 'acbox-section' + (opts.grow ? ' acbox-section--grow' : '');

            const head = document.createElement('button');
            head.type = 'button';
            head.className = 'acbox-section__head';
            const arrow = document.createElement('span'); arrow.className = 'acbox-section__arrow'; arrow.textContent = '▼'; head.appendChild(arrow);
            const t = document.createElement('span'); t.className = 'acbox-section__title'; t.textContent = title; head.appendChild(t);
            if (opts.hint) { const h = document.createElement('span'); h.className = 'acbox-section__hint'; h.textContent = opts.hint; head.appendChild(h); }

            const body = document.createElement('div');
            body.className = 'acbox-section__body';
            const collapsed = this._ui.sections[key] === true;
            if (collapsed) { body.classList.add('collapsed'); arrow.textContent = '▶'; }

            head.addEventListener('click', () => {
                const c = body.classList.toggle('collapsed');
                arrow.textContent = c ? '▶' : '▼';
                this._ui.sections[key] = c;
                this._saveDelayed();
            });

            el.appendChild(head); el.appendChild(body);
            this._sections[key] = { el, head, body, arrow };
            return { el, head, body, arrow };
        }

        // ============================================================
        // ВЫЧИСЛЕНИЯ
        // ============================================================

        _recompute() {
            const dRaw = this._driver;
            const b = this._box;
            const t = b.type;

            const warn = [];
            if (!(dRaw.fs > 0))  warn.push('Fs > 0');
            if (!(dRaw.qts > 0)) warn.push('Qts > 0');
            if (!(dRaw.vas > 0)) warn.push('Vas > 0');
            if (!(dRaw.re > 0))  warn.push('Re > 0');
            if (!(dRaw.sd > 0))  warn.push('Sd > 0');
            if (t === 'sealed' && !(b.Vb > 0)) warn.push('Vb > 0');
            if (t === 'vented' && (!(b.Vb > 0) || !(b.Fb > 0))) warn.push('Vb/Fb > 0');
            if (t === 'bp4' && (!(b.Vb1 > 0) || !(b.Vb2 > 0) || !(b.Fb > 0))) warn.push('Vb1/Vb2/Fb > 0');
            if ((t === 'bp6' || t === 'bp8') &&
                (!(b.Vb1 > 0) || !(b.Vb2 > 0) || !(b.Fb1 > 0) || !(b.Fb2 > 0))) {
                warn.push('Vb1/Vb2/Fb1/Fb2 > 0');
            }
            if (t !== 'sealed' && (!(b.port_d > 0) || !(b.port_n > 0))) warn.push('Параметры порта > 0');
            if (warn.length) {
                if (this._warnEl) {
                    this._warnEl.style.display = '';
                    this._warnEl.textContent = '⚠ ' + warn.join(' · ');
                }
                return;
            }
            if (this._warnEl) this._warnEl.style.display = 'none';

            const D = driverFromTS(dRaw);
            const d_port_m = (b.port_d || 60) / 1000;
            const nPort = Math.max(1, Math.floor(b.port_n || 1));

            if (t === 'sealed') {
                let Vb = Number(b.Vb) || 30;
                let qtcDisplay = null;

                if (b.qtc_sealed != null && b.qtc_sealed > 0) {
                    qtcDisplay = b.qtc_sealed;
                    const r = qtcDisplay / D.qts;
                    if (r > 1) {
                        const VbCalc = D.vas / (r * r - 1);
                        if (VbCalc > 0 && isFinite(VbCalc)) {
                            b.Vb = Math.round(VbCalc * 10) / 10;
                            if (this._inputs.box.Vb) this._inputs.box.Vb.value = b.Vb;
                            Vb = b.Vb;
                        }
                    }
                }

                const s = sealedSummary(D, Vb);
                if (qtcDisplay == null) qtcDisplay = s.qtc;

                this._setResult('qtc', qtcDisplay, this._qtcTone(qtcDisplay));
                this._setResult('fc', s.fc);
                this._setResult('f3', s.f3);
                this._setResultEditable('Vb_out', Vb);

            } else if (t === 'vented') {
                const Vb = Number(b.Vb) || 30;
                const Fb = Number(b.Fb) || 40;
                const s = ventedSummary(D, Vb, Fb, d_port_m, nPort);

                let L_port_mm;
                if (b.L_port_manual != null && b.L_port_manual > 0) {
                    L_port_mm = b.L_port_manual;
                } else {
                    L_port_mm = portLength(Vb, Fb, d_port_m, nPort) * 1000;
                }
                const v_air = portAirVelocity(D, Fb, d_port_m, nPort);

                this._setResult('qtc', s.qtc, this._qtcTone(s.qtc));
                this._setResult('f3', s.f3);
                this._setResultEditable('Fb_out', Fb);
                this._setResultEditable('Vb_out', Vb);
                this._setResultEditable('port_L', L_port_mm);
                this._setResult('v_port', v_air, this._vTone(v_air));

            } else if (t === 'bp4') {
                const Vb1 = Number(b.Vb1) || 20;
                const Vb2 = Number(b.Vb2) || 15;
                const Fb  = Number(b.Fb)  || 45;
                const fc1 = D.fs * Math.sqrt(1 + D.Vas_m3 / (Vb1 / 1000));
                const f3 = _findF3Numeric(D, 'bp4', 0, 0, d_port_m, nPort, Vb1, Vb2, 0, Fb);

                let L_port_mm;
                if (b.L_port_manual != null && b.L_port_manual > 0) {
                    L_port_mm = b.L_port_manual;
                } else {
                    L_port_mm = portLength(Vb2, Fb, d_port_m, nPort) * 1000;
                }
                const v_air = portAirVelocity(D, Fb, d_port_m, nPort);

                this._setResult('fc1', fc1);
                this._setResultEditable('fb_out', Fb);
                this._setResult('f3', f3);
                this._setResultEditable('Vb1_out', Vb1);
                this._setResultEditable('Vb2_out', Vb2);
                this._setResultEditable('port_L', L_port_mm);
                this._setResult('v_port', v_air, this._vTone(v_air));

            } else if (t === 'bp6') {
                const Vb1 = Number(b.Vb1) || 20;
                const Vb2 = Number(b.Vb2) || 15;
                const Fb1 = Number(b.Fb1) || 45;
                const Fb2 = Number(b.Fb2) || 70;
                const fc1 = D.fs * Math.sqrt(1 + D.Vas_m3 / (Vb1 / 1000));
                const fc2 = D.fs * Math.sqrt(1 + D.Vas_m3 / (Vb2 / 1000));
                const f3 = _findF3Numeric(D, 'bp6', 0, 0, d_port_m, nPort, Vb1, Vb2, Fb1, Fb2);

                let L_port_mm;
                if (b.L_port_manual != null && b.L_port_manual > 0) {
                    L_port_mm = b.L_port_manual;
                } else {
                    L_port_mm = portLength(Vb2, Fb2, d_port_m, nPort) * 1000;
                }
                const v_air = portAirVelocity(D, Math.min(Fb1, Fb2), d_port_m, nPort);

                this._setResult('fc1', fc1);
                this._setResult('fc2', fc2);
                this._setResultEditable('Fb1_out', Fb1);
                this._setResultEditable('Fb2_out', Fb2);
                this._setResult('f3', f3);
                this._setResultEditable('Vb1_out', Vb1);
                this._setResultEditable('Vb2_out', Vb2);
                this._setResultEditable('port_L', L_port_mm);
                this._setResult('v_port', v_air, this._vTone(v_air));

            } else if (t === 'bp8') {
                const Vb1 = Number(b.Vb1) || 20;
                const Vb2 = Number(b.Vb2) || 15;
                const Fb1 = Number(b.Fb1) || 45;
                const Fb2 = Number(b.Fb2) || 70;
                const fc1 = D.fs * Math.sqrt(1 + D.Vas_m3 / (Vb1 / 1000));
                const fc2 = D.fs * Math.sqrt(1 + D.Vas_m3 / (Vb2 / 1000));
                const f3 = _findF3Numeric(D, 'bp8', 0, 0, d_port_m, nPort, Vb1, Vb2, Fb1, Fb2);

                let L_port_mm;
                if (b.L_port_manual != null && b.L_port_manual > 0) {
                    L_port_mm = b.L_port_manual;
                } else {
                    L_port_mm = portLength(Vb1, Fb1, d_port_m, nPort) * 1000;
                }
                const v_air = portAirVelocity(D, Fb1, d_port_m, nPort);

                this._setResult('fc1', fc1);
                this._setResult('fc2', fc2);
                this._setResultEditable('Fb1_out', Fb1);
                this._setResultEditable('Fb2_out', Fb2);
                this._setResult('f3', f3);
                this._setResultEditable('Vb1_out', Vb1);
                this._setResultEditable('Vb2_out', Vb2);
                this._setResultEditable('port_L', L_port_mm);
                this._setResult('v_port', v_air, this._vTone(v_air));
            }
        }

        _setResult(key, value, tone) {
            const el = this._resultEls[key];
            if (!el) return;
            const txt = Number.isFinite(value)
                ? (Math.abs(value) >= 1000 ? value.toFixed(0)
                   : value >= 10 ? value.toFixed(2)
                   : value.toFixed(3))
                : '—';
            el.textContent = txt;
            el.classList.remove('acbox-result__val--ok', 'acbox-result__val--warn', 'acbox-result__val--err');
            if (tone === 'ok')        el.classList.add('acbox-result__val--ok');
            else if (tone === 'warn') el.classList.add('acbox-result__val--warn');
            else if (tone === 'err')  el.classList.add('acbox-result__val--err');
        }

        _setResultEditable(key, value) {
            const el = this._resultEls[key];
            if (!el) return;
            if (document.activeElement === el) return;
            el.value = Number.isFinite(value) ? (Math.round(value * 100) / 100) : '';
        }

        _qtcTone(qtc) {
            if (qtc < 0.5)  return 'warn';
            if (qtc <= 0.75) return 'ok';
            if (qtc <= 1.1)  return 'warn';
            return 'err';
        }
        _portLTone(L) {
            if (L < 10)  return 'err';
            if (L < 30)  return 'warn';
            if (L > 600) return 'warn';
            return 'ok';
        }
        _vTone(v) {
            if (v > 25) return 'err';
            if (v > 17) return 'warn';
            return 'ok';
        }

        _refreshAll() {
            for (const group of ['driver', 'box']) {
                const fields = this._inputs[group];
                if (!fields) continue;
                for (const key in fields) {
                    const el = fields[key];
                    if (document.activeElement === el) continue;
                    const v = this._displayValue(group, key);
                    const formatted = this._formatForInput(v);
                    if (el.value !== formatted) el.value = formatted;
                }
            }
            for (const fullKey in this._unitEls) {
                const [group, key] = fullKey.split('.');
                const unitsKey = FIELD_UNITS[key];
                const unitsArr = unitsKey ? (UNITS[unitsKey] || []) : [];
                if (unitsArr.length <= 1) continue;
                const curId = this._getUnitId(group, key, unitsArr);
                const curUnit = unitsArr.find(u => u.id === curId) || unitsArr[0];
                const uEl = this._unitEls[fullKey];
                if (uEl && uEl.textContent !== curUnit.label) uEl.textContent = curUnit.label;
            }
            this._updateTypeButtons();
            this._renderBoxSection();
            this._refreshDriverBadge();
        }

        // ============================================================
        // PAYLOAD
        // ============================================================

        _buildPayload() {
            const D = driverFromTS(this._driver);
            const b = this._box;
            const t = b.type;
            const d_port_m = (b.port_d || 60) / 1000;
            const nPort = Math.max(1, Math.floor(b.port_n || 1));

            const F_SPLIT = 500;

            const xs = [];
            const N_LOW = 150;
            const N_HIGH = 80;
            for (let i = 0; i < N_LOW; i++) {
                const tt = i / (N_LOW - 1);
                xs.push(Math.pow(10, Math.log10(10) + tt * (Math.log10(F_SPLIT) - Math.log10(10))));
            }
            for (let i = 1; i < N_HIGH; i++) {
                const tt = i / (N_HIGH - 1);
                xs.push(Math.pow(10, Math.log10(F_SPLIT) + tt * (Math.log10(20000) - Math.log10(F_SPLIT))));
            }

            const spl = [], x = [], z = [];

            for (let i = 0; i < xs.length; i++) {
                const f = xs[i];
                let r;

                if (f <= F_SPLIT) {
                    if (t === 'sealed') {
                        r = computeSealed(f, D, (b.Vb || 30) / 1000);
                    } else if (t === 'vented') {
                        r = computeVented(f, D, (b.Vb || 30) / 1000, b.Fb || 40, d_port_m, nPort);
                    } else {
                        r = computeBandpass(
                            f, D,
                            (b.Vb1 || 20) / 1000, (b.Vb2 || 15) / 1000,
                            b.Fb1 || b.Fb || 45, b.Fb2 || 70,
                            t, d_port_m, nPort
                        );
                    }
                } else {
                    let ref;
                    if (t === 'sealed') {
                        ref = computeSealed(F_SPLIT, D, (b.Vb || 30) / 1000);
                    } else if (t === 'vented') {
                        ref = computeVented(F_SPLIT, D, (b.Vb || 30) / 1000, b.Fb || 40, d_port_m, nPort);
                    } else {
                        ref = computeBandpass(
                            F_SPLIT, D,
                            (b.Vb1 || 20) / 1000, (b.Vb2 || 15) / 1000,
                            b.Fb1 || b.Fb || 45, b.Fb2 || 70,
                            t, d_port_m, nPort
                        );
                    }

                    let slopeDbPerOct = 0;
                    if (t === 'bp4') slopeDbPerOct = 12;
                    else if (t === 'bp6') slopeDbPerOct = 12;
                    else if (t === 'bp8') slopeDbPerOct = 24;

                    const octaves = Math.log2(f / F_SPLIT);
                    r = {
                        spl: ref.spl - slopeDbPerOct * octaves,
                        x: ref.x * Math.pow(F_SPLIT / f, 2),
                        z: Math.sqrt(D.re * D.re + Math.pow(2 * Math.PI * f * D.le / 1000, 2)),
                        u: ref.u * (F_SPLIT / f)
                    };
                }

                spl.push(Number.isFinite(r.spl) ? Math.round(r.spl * 1000) / 1000 : -200);
                x.push(Number.isFinite(r.x) ? Math.round(r.x * 100000) / 100000 : 0);
                z.push(Number.isFinite(r.z) ? Math.round(r.z * 1000) / 1000 : 0);
            }

            const xsR = xs.map(v => Math.round(v * 100) / 100);

            let peak = -Infinity;
            for (let i = 0; i < xsR.length; i++) {
                if (xsR[i] >= 20 && xsR[i] <= 500 && spl[i] > -100 && spl[i] > peak) {
                    peak = spl[i];
                }
            }
            const shift = -peak;
            const splN = spl.map(v => Math.round((v + shift) * 1000) / 1000);

            const splGraph = {
                type: 'spl', label: 'SPL (TS)', color: '#ec2e2e',
                xValues: xsR, yValues: splN,
                extraLines: [
                    { y: 0,  color: 'rgba(200,184,154,0.6)', label: '0 dB', dashed: false },
                    { y: -3, color: 'rgba(180,180,140,0.4)', label: '-3 dB', dashed: true },
                    { y: -6, color: 'rgba(180,180,140,0.3)', label: '-6 dB', dashed: true },
                    { x: F_SPLIT, color: 'rgba(120,160,200,0.5)', label: 'модель → экстраполяция', dashed: true }
                ],
                compareGraphs: [],
                metadata: { title: 'SPL (TS)', unitX: 'Hz', unitY: 'dB' },
                settings: {
                    xAxis: { label: 'Frequency, Hz', min: 10, max: 20000, log: true, precision: 0 },
                    yAxis: { label: 'SPL, dB (rel.)', min: -60, max: 10, log: false, precision: 1 },
                    appearance: {
                        lineWidth: 1.8, pointSize: 1.5, showPoints: false,
                        showGrid: true, showLegend: true, showFill: true, fillOpacity: 0.15
                    }
                }
            };

            const xGraph = {
                type: 'xmax', label: 'X, mm', color: '#66ff88',
                xValues: xsR, yValues: x,
                extraLines: (typeof D.xmax === 'number' && D.xmax > 0)
                    ? [
                        { y: D.xmax, color: 'rgba(220,80,80,0.85)', label: `Xmax = ${D.xmax} mm`, dashed: true },
                        { x: F_SPLIT, color: 'rgba(120,160,200,0.4)', label: 'граница', dashed: true }
                    ]
                    : [{ x: F_SPLIT, color: 'rgba(120,160,200,0.4)', label: 'граница', dashed: true }],
                compareGraphs: [],
                metadata: { title: 'Cone excursion (TS)', unitX: 'Hz', unitY: 'mm' },
                settings: {
                    xAxis: { label: 'Frequency, Hz', min: 10, max: 20000, log: true, precision: 0 },
                    yAxis: { label: 'X, mm', min: null, max: null, log: true, precision: 4 },
                    appearance: {
                        lineWidth: 1.8, pointSize: 1.5, showPoints: false,
                        showGrid: true, showLegend: true, showFill: true, fillOpacity: 0.15
                    }
                }
            };

            const zGraph = {
                type: 'impedance', label: '|Z_in|, Ω', color: '#66ddff',
                xValues: xsR, yValues: z,
                extraLines: [{ x: F_SPLIT, color: 'rgba(120,160,200,0.4)', label: 'граница', dashed: true }],
                compareGraphs: [],
                metadata: { title: 'Input impedance (TS)', unitX: 'Hz', unitY: 'Ω' },
                settings: {
                    xAxis: { label: 'Frequency, Hz', min: 10, max: 20000, log: true, precision: 0 },
                    yAxis: { label: '|Z|, Ω', min: null, max: null, log: true, precision: 1 },
                    appearance: {
                        lineWidth: 1.8, pointSize: 1.5, showPoints: false,
                        showGrid: true, showLegend: true, showFill: true, fillOpacity: 0.15
                    }
                }
            };

            return {
                graphs: [splGraph, xGraph, zGraph],
                metadata: {
                    title: 'Box Calculator (TS)',
                    solver: 'TS v3.3',
                    timestamp: new Date().toISOString(),
                    boxType: t,
                    frequency_range: { min: 10, max: 20000, unit: 'Hz' },
                    model_split_Hz: F_SPLIT,
                    driver: { ...D },
                    box: { ...b },
                    loadedDriverName: this._loadedDriverName || null
                }
            };
        }

        // ============================================================
        // ЭКСПОРТ / ОТПРАВКА / АВТООБНОВЛЕНИЕ
        // ============================================================

        _exportJSON() {
            const payload = this._buildPayload();
            try {
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'boxcalc_' + Date.now() + '.json';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
                this.notify('Экспорт', 'JSON сохранён', 'success');
            } catch (e) {
                this.notify('Экспорт', 'Ошибка: ' + e.message, 'error');
            }
        }

        _sendToGraphic() {
            if (this._isDestroyed) return;
            const payload = this._buildPayload();

            let existing = null;
            try {
                if (typeof this.findWindowByType === 'function') {
                    existing = this.findWindowByType('graphic');
                }
            } catch (e) {}

            if (existing && existing.id != null) {
                try {
                    this.sendMessage('graphic:load', payload, existing.id);
                    this._graphicWindowId = existing.id;
                    this.notify('Отправка', 'Отправлено в Graphic', 'success');
                } catch (e) {
                    this.notify('Отправка', 'Ошибка: ' + e.message, 'error');
                }
                return;
            }

            const lm = this._layoutManager;
            if (!lm || typeof lm.addWindow !== 'function') {
                _warn('[BoxCalc] LayoutManager.addWindow not available');
                this.notify('Отправка', 'Не удалось открыть окно Graphic', 'warning');
                return;
            }

            let created = null;
            try { created = lm.addWindow('graphic'); }
            catch (e) { _warn('[BoxCalc] addWindow(graphic) failed:', e); }

            if (!created) {
                this.notify('Отправка', 'Нет свободного места для окна Graphic', 'warning');
                return;
            }

            const self = this;
            let attempts = 0;
            const MAX_ATTEMPTS = 40;

            const trySend = () => {
                if (self._isDestroyed) return;
                attempts++;

                let found = null;
                try {
                    if (typeof self.findWindowByType === 'function') {
                        found = self.findWindowByType('graphic');
                    }
                } catch (e) {}

                if (found && found.id != null) {
                    try {
                        self.sendMessage('graphic:load', payload, found.id);
                        self._graphicWindowId = found.id;
                        self.notify('Отправка', 'Graphic открыт, данные отправлены', 'success');
                    } catch (e) {
                        self.notify('Отправка', 'Ошибка: ' + e.message, 'error');
                    }
                    return;
                }

                if (attempts >= MAX_ATTEMPTS) {
                    self.notify('Отправка', 'Окно Graphic не открылось', 'warning');
                    return;
                }
                setTimeout(trySend, 50);
            };

            requestAnimationFrame(() => { setTimeout(trySend, 30); });
        }

        _pushToGraphicDelayed() {
            if (this._isDestroyed) return;
            clearTimeout(this._pushTimer);
            this._pushTimer = setTimeout(() => {
                if (this._isDestroyed) return;
                let target = null;
                try {
                    if (typeof this.findWindowByType === 'function') {
                        target = this.findWindowByType('graphic');
                    }
                } catch (e) {}

                if (!target || target.id == null) return;

                try {
                    const payload = this._buildPayload();
                    this.sendMessage('graphic:load', payload, target.id);
                } catch (e) {
                    _warn('[BoxCalc] auto-push failed:', e);
                }
            }, 250);
        }

        // ============================================================
        // МЕНЮ-ЭКШЕНЫ
        // ============================================================

        setSealed() { this._box.type = 'sealed'; this._updateTypeButtons(); this._renderBoxSection(); this._saveDelayed(); this._pushToGraphicDelayed(); }
        setVented() { this._box.type = 'vented'; this._updateTypeButtons(); this._renderBoxSection(); this._saveDelayed(); this._pushToGraphicDelayed(); }
        setBP4()    { this._box.type = 'bp4';    this._updateTypeButtons(); this._renderBoxSection(); this._saveDelayed(); this._pushToGraphicDelayed(); }
        setBP6()    { this._box.type = 'bp6';    this._updateTypeButtons(); this._renderBoxSection(); this._saveDelayed(); this._pushToGraphicDelayed(); }
        setBP8()    { this._box.type = 'bp8';    this._updateTypeButtons(); this._renderBoxSection(); this._saveDelayed(); this._pushToGraphicDelayed(); }

        setQtc577() { this._applyQtc(0.577); }
        setQtc707() { this._applyQtc(0.707); }
        setQtc900() { this._applyQtc(0.900); }

        _applyQtc(qtc) {
            const r = qtc / this._driver.qts;
            if (r > 1) {
                const Vb = this._driver.vas / (r * r - 1);
                if (Vb > 0 && isFinite(Vb)) {
                    this._box.Vb = Math.round(Vb * 10) / 10;
                    this._box.qtc_sealed = qtc;
                    this._box.targetQtc = qtc;
                    this._refreshAll();
                    this._saveDelayed();
                    this._pushToGraphicDelayed();
                }
            }
        }

        exportJSON()             { this._exportJSON(); }
        sendToGraphic()          { this._sendToGraphic(); }
        openSpeakerDatabase()    { this._openSpeakerDatabase(); }

        // ============================================================
        // СОХРАНЕНИЕ
        // ============================================================

        _saveDelayed() {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                if (this._isDestroyed) return;
                this.data = {
                    driver: { ...this._driver },
                    box:    { ...this._box },
                    ui: {
                        activeType: this._ui.activeType,
                        sections: { ...this._ui.sections },
                        units: { ...this._ui.units }
                    },
                    loadedDriverName: this._loadedDriverName || null
                };
                try { this.save(); } catch (e) {}
            }, 300);
        }
    }

    if (typeof window !== 'undefined') {
        window.AcousticsBoxCalc = AcousticsBoxCalc;
        window['BoxCalcWindow'] = AcousticsBoxCalc;
        console.log('[BoxCalc] Registered globally: AcousticsBoxCalc v3.3.0');
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AcousticsBoxCalc };
    }
})();