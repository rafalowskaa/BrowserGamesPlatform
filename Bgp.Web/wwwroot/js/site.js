(function () {
    document.querySelectorAll('.password-toggle').forEach(function (btn) {
        var id = btn.getAttribute('data-password-toggle');
        var input = document.getElementById(id);
        if (!input) {
            return;
        }

        var lbl = btn.querySelector('[data-password-label]');
        var show = btn.getAttribute('data-password-show') || 'Pokaż hasło';
        var hide = btn.getAttribute('data-password-hide') || 'Ukryj hasło';
        function setVisible(v) {
            input.type = v ? 'text' : 'password';
            btn.classList.toggle('is-active', v);
            btn.setAttribute('aria-label', v ? hide : show);
            btn.setAttribute('aria-pressed', v ? 'true' : 'false');
            if (lbl) {
                lbl.textContent = v ? hide : show;
            }
        }

        setVisible(false);

        btn.addEventListener('click', function () {
            setVisible(input.type === 'password');
            input.focus();
        });

        input.addEventListener('keydown', function (e) {
            if (e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                btn.click();
            }
        });
    });
})();