(function () {
    window.Bgp = window.Bgp || {};

    document.querySelectorAll('.password-toggle').forEach(function (btn) {
        var id = btn.getAttribute('data-password-toggle');
        var input = document.getElementById(id);
        if (!input) {
            return;
        }

        var lbl = btn.querySelector('[data-password-label]');
        var show = btn.getAttribute('data-password-show') || 'Pokaż hasło';
        var hide = btn.getAttribute('data-password-hide') || 'Ukryj hasło';
        var defaultVisible = btn.getAttribute('data-password-default') === 'show';
        function setVisible(v) {
            input.type = v ? 'text' : 'password';
            btn.classList.toggle('is-active', v);
            btn.setAttribute('aria-label', v ? hide : show);
            btn.setAttribute('aria-pressed', v ? 'true' : 'false');
            if (lbl) {
                lbl.textContent = v ? hide : show;
            }
        }

        setVisible(defaultVisible);

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
    function initSecurityQuestions(container) {
        if (!container) {
            return;
        }

        var sequential = container.getAttribute('data-sequential') !== 'false';
        var questionBlocks = Array.from(container.querySelectorAll('.security-question'));
        if (!questionBlocks.length) {
            return;
        }

        var selects = questionBlocks
            .map(function (block) { return block.querySelector('select'); })
            .filter(function (select) { return !!select; });

        function updateCustomVisibility(select, customContainer) {
            if (!select || !customContainer) {
                return;
            }

            var selectedOption = select.options[select.selectedIndex];
            var allowsCustom = selectedOption && selectedOption.dataset.allowsCustom === 'true';
            customContainer.hidden = !allowsCustom;
            if (!allowsCustom) {
                var customInput = customContainer.querySelector('input');
                if (customInput) {
                    customInput.value = '';
                }
            }
        }

        function updateOptionAvailability() {
            selects.forEach(function (select) {
                if (!select) {
                    return;
                }

                var currentValue = select.value;
                Array.from(select.options).forEach(function (option) {
                    if (!option.value) {
                        option.disabled = false;
                        option.hidden = false;
                        return;
                    }

                    var isSelectedElsewhere = selects.some(function (other) {
                        return other && other !== select && other.value === option.value;
                    });

                    var shouldDisable = isSelectedElsewhere && option.value !== currentValue;
                    option.disabled = shouldDisable;
                    option.hidden = shouldDisable;
                });

                if (currentValue && selects.some(function (other) {
                    return other && other !== select && other.value === currentValue;
                })) {
                    select.value = '';
                    var evt = new Event('change', { bubbles: true });
                    select.dispatchEvent(evt);
                }
            });
        }

        function hideFollowingBlocks(startIndex) {
            if (!sequential) {
                return;
            }

            for (var i = startIndex; i < questionBlocks.length; i++) {
                var block = questionBlocks[i];
                if (!block) {
                    continue;
                }

                if (block.dataset.hasError === 'true') {
                    block.hidden = false;
                    continue;
                }

                block.hidden = true;
            }
        }

        questionBlocks.forEach(function (block, index) {
            if (!block) {
                return;
            }

            var select = block.querySelector('select');
            var customContainer = block.querySelector('[data-custom-container]');
            var answer = block.querySelector('[data-answer-input]');
            var nextIndex = index + 1;

            function revealNextIfReady() {
                updateOptionAvailability();

                if (!sequential) {
                    return;
                }

                if (nextIndex >= questionBlocks.length) {
                    return;
                }

                var nextBlock = questionBlocks[nextIndex];
                if (!nextBlock) {
                    return;
                }

                var hasQuestion = select && !!select.value;
                var hasAnswer = answer && !!answer.value.trim();

                if (hasQuestion && hasAnswer) {
                    nextBlock.hidden = false;
                    return;
                }

                if (nextBlock.dataset.hasError === 'true') {
                    nextBlock.hidden = false;
                    return;
                }

                if (!hasQuestion) {
                    hideFollowingBlocks(nextIndex);
                }
            }

            if (select) {
                updateCustomVisibility(select, customContainer);
                select.addEventListener('change', function () {
                    updateCustomVisibility(select, customContainer);
                    revealNextIfReady();
                });
            }

            if (answer) {
                answer.addEventListener('input', revealNextIfReady);
            }

            revealNextIfReady();
        });

        updateOptionAvailability();
    }

    window.Bgp.initSecurityQuestions = initSecurityQuestions;

    document.querySelectorAll('[data-security-questions]').forEach(function (container) {
        initSecurityQuestions(container);
    });
})();