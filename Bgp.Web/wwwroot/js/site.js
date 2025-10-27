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

        function updateLabel(isVisible) {
            btn.textContent = isVisible ? hideLabel : showLabel;
            btn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
        }

        btn.addEventListener('click', () => {
            const isMasked = input.getAttribute('type') === 'password';
            input.setAttribute('type', isMasked ? 'text' : 'password');
            updateLabel(isMasked);
        });

        updateLabel(false);
    });
})();