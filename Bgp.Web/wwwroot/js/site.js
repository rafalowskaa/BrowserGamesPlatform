(function () {
    const toggles = document.querySelectorAll('[data-password-toggle]');
    toggles.forEach((btn) => {
        const targetId = btn.getAttribute('data-password-toggle');
        if (!targetId) {
            return;
        }
        const input = document.getElementById(targetId);
        if (!input) {
            return;
        }
        const showLabel = btn.getAttribute('data-password-show') || 'Show';
        const hideLabel = btn.getAttribute('data-password-hide') || 'Hide';

        const labelTarget = btn.querySelector('[data-password-label]');

        if (!btn.hasAttribute('tabindex')) {
            btn.setAttribute('tabindex', '-1');
        }

        function updateLabel(isVisible) {
            const text = isVisible ? hideLabel : showLabel;
            if (labelTarget) {
                labelTarget.textContent = text;
            }
            btn.setAttribute('aria-label', text);
            btn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
            btn.classList.toggle('is-active', isVisible);
        }

        btn.addEventListener('click', () => {
            const isMasked = input.getAttribute('type') === 'password';
            input.setAttribute('type', isMasked ? 'text' : 'password');
            updateLabel(isMasked);
        });

        updateLabel(false);
    });
})();