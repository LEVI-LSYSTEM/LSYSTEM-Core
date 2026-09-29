// core/main/ui.js
// Версия 1.0.0

(function() {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function makeSvgIcon(iconId, size, color) {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'icon-svg');
        svg.style.cssText = [
            'width:' + size + 'px',
            'height:' + size + 'px',
            'flex-shrink:0',
            'fill:' + (color || 'currentColor'),
            'display:block',
            'margin:0'
        ].join(';');

        var use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', '#' + iconId);
        svg.appendChild(use);
        return svg;
    }

    function isSvgIcon(value) {
        return typeof value === 'string' && value.indexOf('icon-') === 0;
    }

    function resolveIconName(icon, fallback) {
        if (typeof icon === 'string' && icon.startsWith('icon-')) return icon;
        return fallback || 'icon-data';
    }

    function createModal(opts) {
        opts = opts || {};

        var icon = opts.icon || 'icon-warning';
        var title = opts.title || 'Внимание';
        var message = opts.message || '';
        var type = opts.type || 'warning';
        var buttons = Array.isArray(opts.buttons) ? opts.buttons : [];
        var onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
        var inputCfg = opts.input || null;

        var old = document.querySelector('.modal-overlay');
        if (old) old.remove();

        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '99999',
            animation: 'fadeIn 0.25s ease',
            padding: '20px'
        });

        var modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'var(--bg-panel, #1a1a1a)',
            borderRadius: '16px',
            padding: '32px 36px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(204,34,51,0.08)',
            border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
            animation: 'modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative'
        });

        var iconColor = 'var(--beige, #c8b89a)';
        if (type === 'error') iconColor = 'var(--accent-red, #cc2233)';
        else if (type === 'warning') iconColor = 'var(--warning-color, #ffaa33)';
        else if (type === 'success') iconColor = 'var(--success-color, #44cc88)';

        var iconEl = document.createElement('div');
        Object.assign(iconEl.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
            lineHeight: '1',
            color: iconColor
        });
        iconEl.appendChild(makeSvgIcon(resolveIconName(icon, 'icon-warning'), 42));

        var titleEl = document.createElement('div');
        Object.assign(titleEl.style, {
            fontSize: '18px',
            fontWeight: '700',
            color: 'var(--text-primary, #e0d8cc)',
            textAlign: 'center',
            marginBottom: '8px',
            letterSpacing: '0.3px'
        });
        titleEl.textContent = title;

        var msgEl = document.createElement('div');
        Object.assign(msgEl.style, {
            fontSize: '13px',
            color: 'var(--text-secondary, #a09888)',
            textAlign: 'center',
            lineHeight: '1.7',
            marginBottom: '16px',
            padding: '0 4px'
        });
        msgEl.innerHTML = message;

        modal.appendChild(iconEl);
        modal.appendChild(titleEl);
        modal.appendChild(msgEl);

        var inputField = null;
        if (inputCfg) {
            var inputWrapper = document.createElement('div');
            Object.assign(inputWrapper.style, {
                marginBottom: '20px',
                width: '100%'
            });

            if (inputCfg.label) {
                var label = document.createElement('label');
                Object.assign(label.style, {
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--text-secondary, #a09888)',
                    marginBottom: '6px'
                });
                label.textContent = inputCfg.label;
                inputWrapper.appendChild(label);
            }

            inputField = document.createElement('input');
            inputField.type = 'text';
            inputField.placeholder = inputCfg.placeholder || '';
            inputField.value = inputCfg.value || '';
            inputField.required = inputCfg.required || false;
            Object.assign(inputField.style, {
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                background: 'var(--bg-input, #2a2a2a)',
                color: 'var(--text-primary, #e0d8cc)',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                boxSizing: 'border-box'
            });

            inputField.addEventListener('focus', function() {
                this.style.borderColor = 'var(--accent-red, #cc2233)';
                this.style.boxShadow = '0 0 0 3px rgba(204,34,51,0.15)';
            });
            inputField.addEventListener('blur', function() {
                this.style.borderColor = 'var(--border-color, rgba(200,184,154,0.12))';
                this.style.boxShadow = 'none';
            });

            inputField.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var confirmBtn = modal.querySelector('.btn-confirm');
                    if (confirmBtn) confirmBtn.click();
                }
            });

            inputWrapper.appendChild(inputField);
            modal.appendChild(inputWrapper);

            setTimeout(function() {
                inputField.focus();
                inputField.select();
            }, 100);
        }

        if (buttons.length > 0) {
            var actions = document.createElement('div');
            Object.assign(actions.style, {
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                flexWrap: 'wrap'
            });

            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];

                var button = document.createElement('button');
                button.textContent = btn.label;
                button.className = btn.primary ? 'btn-confirm' : '';
                Object.assign(button.style, {
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(200,184,154,0.12))',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                    minWidth: '80px',
                    background: btn.primary ? 'var(--accent-red, #cc2233)' : 'var(--bg-card, #262626)',
                    color: btn.primary ? '#fff' : 'var(--text-primary, #e0d8cc)',
                    borderColor: btn.primary ? 'var(--accent-red, #cc2233)' : 'var(--border-color, rgba(200,184,154,0.12))'
                });

                if (btn.danger) {
                    button.style.background = 'var(--accent-red, #cc2233)';
                    button.style.borderColor = 'var(--accent-red, #cc2233)';
                    button.style.color = '#fff';
                }
                if (btn.success) {
                    button.style.background = 'var(--success-color, #44cc88)';
                    button.style.borderColor = 'var(--success-color, #44cc88)';
                    button.style.color = '#fff';
                }

                button.addEventListener('mouseenter', function() {
                    if (!btn.danger && !btn.success && !btn.primary) {
                        this.style.background = 'var(--bg-hover, #2d2d2d)';
                        this.style.borderColor = 'var(--beige-dark, #a89070)';
                    }
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
                });
                button.addEventListener('mouseleave', function() {
                    this.style.transform = 'none';
                    this.style.boxShadow = 'none';
                });

                (function(capturedBtn) {
                    button.addEventListener('click', function() {
                        var value = inputField ? inputField.value.trim() : null;
                        overlay.remove();
                        if (capturedBtn.action) capturedBtn.action(value);
                    });
                })(btn);

                actions.appendChild(button);
            }

            modal.appendChild(actions);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.remove();
                if (onClose) onClose(null);
            }
        });

        return overlay;
    }

    function showNotification(message, type, duration) {
        type = type || 'info';

        var old = document.querySelector('.toast-notification');
        if (old) old.remove();

        var toast = document.createElement('div');
        toast.className = 'toast-notification';

        var colors = {
            success: '#44cc88',
            warning: '#ffaa33',
            error: '#cc2233',
            info: '#c8b89a'
        };

        var iconMap = {
            success: 'icon-success',
            warning: 'icon-warning',
            error: 'icon-error',
            info: 'icon-notification'
        };

        var safeType = (type === 'success' || type === 'warning' || type === 'error')
            ? type
            : 'info';

        var accent = colors[safeType] || colors.info;
        var iconId = iconMap[safeType] || iconMap.info;

        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%) translateY(20px)',
            background: 'var(--bg-panel, #1a1a1a)',
            border: '1px solid ' + accent,
            borderRadius: '12px',
            padding: '12px 24px',
            color: 'var(--text-primary, #e0d8cc)',
            fontSize: '13px',
            fontWeight: '500',
            zIndex: '99998',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 0 30px ' + accent + '15',
            backdropFilter: 'blur(12px)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            maxWidth: '90%',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxSizing: 'border-box'
        });

        toast.appendChild(makeSvgIcon(iconId, 14, accent));

        var textEl = document.createElement('span');
        textEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
        textEl.textContent = String(message || '');
        toast.appendChild(textEl);

        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        var d = (typeof duration === 'number' && duration > 0) ? duration : 3000;
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(function() { toast.remove(); }, 400);
        }, d);
    }

    function showSaveModal(currentName, onSave) {
        var name = currentName || 'project';

        createModal({
            icon: 'icon-save',
            title: 'Сохранить проект',
            message: 'Введите название проекта',
            type: 'info',
            input: {
                label: 'Название проекта',
                placeholder: 'Введите название...',
                value: name,
                required: true
            },
            buttons: [
                { label: 'Отмена', action: function() { if (onSave) onSave(null); } },
                { label: 'Сохранить', success: true, primary: true, action: function(value) {
                    if (value && value.trim()) {
                        if (onSave) onSave(value.trim());
                    } else {
                        showNotification('Введите название проекта', 'warning');
                    }
                }}
            ]
        });
    }

    function showUnsavedModal(action, onConfirm) {
        var labels = {
            'new': 'создания нового проекта',
            'load': 'загрузки другого проекта',
            'quit': 'закрытия приложения'
        };

        createModal({
            icon: 'icon-save',
            title: 'Несохранённые изменения',
            message: 'У вас есть несохранённые изменения.<br>Сохранить перед <strong>'
                + (labels[action] || 'продолжением') + '</strong>?',
            type: 'warning',
            buttons: [
                { label: 'Отменить', action: function() { if (onConfirm) onConfirm(null); } },
                { label: 'Не сохранять', danger: true, action: function() { if (onConfirm) onConfirm(false); } },
                { label: 'Сохранить', success: true, action: function() { if (onConfirm) onConfirm(true); } }
            ]
        });
    }

    function showConfirmModal(title, message, onConfirm) {
        createModal({
            icon: 'icon-question',
            title: title,
            message: message,
            type: 'info',
            buttons: [
                { label: 'Отмена', action: function() {} },
                { label: 'Подтвердить', primary: true, action: function() { if (onConfirm) onConfirm(); } }
            ]
        });
    }

    function showErrorModal(title, message) {
        createModal({
            icon: 'icon-error',
            title: title,
            message: message,
            type: 'error',
            buttons: [{ label: 'OK', primary: true, action: function() {} }]
        });
    }

    function showInfoModal(title, message) {
        createModal({
            icon: 'icon-notification',
            title: title,
            message: message,
            type: 'info',
            buttons: [{ label: 'OK', action: function() {} }]
        });
    }

    var ui = {
        makeSvgIcon: makeSvgIcon,
        isSvgIcon: isSvgIcon,
        resolveIconName: resolveIconName,
        createModal: createModal,
        showNotification: showNotification,
        showSaveModal: showSaveModal,
        showUnsavedModal: showUnsavedModal,
        showConfirmModal: showConfirmModal,
        showErrorModal: showErrorModal,
        showInfoModal: showInfoModal
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ui;
    }

    if (typeof window !== 'undefined') {
        window.LsUI = ui;
        window.showNotification = showNotification;
    }

})();