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
        function setVisibility(isVisible) {
            input.type = isVisible ? 'text' : 'password';
            var isHidden = !isVisible;
            btn.classList.toggle('is-active', isHidden);
            btn.setAttribute('aria-label', isVisible ? hide : show);
            btn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
            if (lbl) {
                lbl.textContent = isVisible ? hide : show;
            }
        }

        setVisibility(defaultVisible);

        btn.addEventListener('click', function () {
            setVisibility(input.type === 'password');
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
        var answerMinLength = parseInt(container.getAttribute('data-answer-minlength') || '1', 10);
        if (isNaN(answerMinLength) || answerMinLength < 1) {
            answerMinLength = 1;
        }

        var stage = container.querySelector('[data-question-stage]') || container;
        var questionBlocks = Array.from(stage.querySelectorAll('.security-question'));
        if (!questionBlocks.length) {
            return;
        }

        var progressContainer = container.querySelector('[data-question-progress]');
        var progressButtons = [];
        var completed = questionBlocks.map(function () { return false; });
        var activeIndex = 0;
        var unlockedCount = 1;

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

        function focusFirstField(block) {
            if (!block) {
                return;
            }

            var focusable = block.querySelector('select, input');
            if (focusable) {
                focusable.focus();
            }
        }

        function isBlockComplete(block, select, customContainer, customInput, answer) {
            if (!block) {
                return false;
            }

            select = select || block.querySelector('select');
            customContainer = customContainer || block.querySelector('[data-custom-container]');
            customInput = customInput || (customContainer ? customContainer.querySelector('input') : null);
            answer = answer || block.querySelector('[data-answer-input]');

            if (select && !select.value) {
                return false;
            }

            var requiresCustom = !!(customContainer && !customContainer.hidden);
            if (requiresCustom) {
                var customValue = customInput ? customInput.value.trim() : '';
                if (!customValue) {
                    return false;
                }
            }

            var answerValue = answer ? answer.value.trim() : '';
            if (answerValue.length < answerMinLength) {
                return false;
            }

            return true;
        }

        function evaluateBlockCompletion(index) {
            var block = questionBlocks[index];
            if (!block) {
                completed[index] = false;
                return false;
            }

            var select = block.querySelector('select');
            var customContainer = block.querySelector('[data-custom-container]');
            var customInput = customContainer ? customContainer.querySelector('input') : null;
            var answer = block.querySelector('[data-answer-input]');
            var isComplete = isBlockComplete(block, select, customContainer, customInput, answer);
            completed[index] = isComplete;
            if (!isComplete) {
                block.classList.remove('is-complete');
            }
            return isComplete;
        }

        function refreshProgress() {
            if (!sequential || !progressButtons.length) {
                return;
            }

            progressButtons.forEach(function (button, index) {
                var isUnlocked = index < unlockedCount;
                var isActive = index === activeIndex;
                var isComplete = completed[index] && !isActive;
                button.disabled = !isUnlocked;
                if (!isUnlocked) {
                    button.setAttribute('aria-disabled', 'true');
                } else {
                    button.removeAttribute('aria-disabled');
                }
                if (isActive) {
                    button.setAttribute('aria-current', 'step');
                } else {
                    button.removeAttribute('aria-current');
                }
                button.classList.toggle('is-active', isActive);
                button.classList.toggle('is-complete', isComplete);
            });
        }

        function setActive(index, options) {
            if (!sequential) {
                return;
            }

            if (unlockedCount < 1) {
                unlockedCount = 1;
            }

            var opts = options || {};
            if (index < 0) {
                index = 0;
            }
            if (index >= unlockedCount) {
                index = unlockedCount - 1;
            }
            if (index < 0) {
                index = 0;
            }

            activeIndex = index;

            questionBlocks.forEach(function (block, blockIndex) {
                if (!block) {
                    return;
                }

                var isActive = blockIndex === activeIndex;
                block.hidden = !isActive;
                block.classList.toggle('is-active', isActive);
                block.classList.toggle('is-complete', completed[blockIndex] && !isActive);
            });

            refreshProgress();

            if (opts.focus !== false) {
                focusFirstField(questionBlocks[activeIndex]);
            }
        }

        function unlockStep(stepIndex) {
            if (!sequential) {
                return;
            }

            if (typeof stepIndex !== 'number' || stepIndex < 0) {
                return;
            }

            var target = Math.min(questionBlocks.length, stepIndex + 1);
            if (target > unlockedCount) {
                unlockedCount = target;
                refreshProgress();
            }
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

                block.hidden = true;
                block.classList.remove('is-active');
                block.classList.remove('is-complete');
                completed[i] = false;
            }

            var newUnlocked = Math.max(1, Math.min(unlockedCount, startIndex));
            if (newUnlocked !== unlockedCount) {
                unlockedCount = newUnlocked;
            }

            if (activeIndex >= unlockedCount) {
                setActive(unlockedCount - 1, { focus: false, force: true });
            } else {
                refreshProgress();
            }
        }

        function createProgress() {
            if (!sequential || !progressContainer) {
                return;
            }

            progressContainer.innerHTML = '';
            progressButtons = [];

            questionBlocks.forEach(function (block, index) {
                if (!block) {
                    return;
                }

                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'security-questions__step';

                var numberSpan = document.createElement('span');
                numberSpan.className = 'security-questions__step-number';
                numberSpan.textContent = String(index + 1);
                button.appendChild(numberSpan);

                var labelEl = block.querySelector('label');
                var labelText = labelEl ? labelEl.textContent.trim() : '';
                if (labelText) {
                    var textSpan = document.createElement('span');
                    textSpan.className = 'security-questions__step-label';
                    textSpan.textContent = labelText;
                    button.appendChild(textSpan);
                }

                button.setAttribute('aria-label', labelText || ('Security question ' + (index + 1)));
                button.addEventListener('click', function () {
                    if (index < unlockedCount) {
                        setActive(index, { focus: true, force: true });
                    }
                });

                progressContainer.appendChild(button);
                progressButtons.push(button);
            });
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

        questionBlocks.forEach(function (block, index) {
            if (!block) {
                return;
            }

            var select = block.querySelector('select');
            var customContainer = block.querySelector('[data-custom-container]');
            var customInput = customContainer ? customContainer.querySelector('input') : null;
            var answer = block.querySelector('[data-answer-input]');

            if (select) {
                updateCustomVisibility(select, customContainer);
            }

            completed[index] = isBlockComplete(block, select, customContainer, customInput, answer);

            if (!sequential) {
                block.hidden = false;
            }
        });

        var errorIndex = questionBlocks.findIndex(function (block) {
            return block && block.dataset.hasError === 'true';
        });

        var firstIncompleteIndex = completed.findIndex(function (value) {
            return !value;
        });

        if (!sequential) {
            unlockedCount = questionBlocks.length;
            activeIndex = errorIndex >= 0 ? errorIndex : (firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
        } else {
            if (firstIncompleteIndex === -1) {
                unlockedCount = questionBlocks.length;
                activeIndex = errorIndex >= 0 ? errorIndex : (questionBlocks.length - 1);
            } else {
                unlockedCount = Math.max(1, firstIncompleteIndex + 1);
                activeIndex = errorIndex >= 0 ? errorIndex : firstIncompleteIndex;
            }

            if (errorIndex >= 0) {
                unlockedCount = Math.max(unlockedCount, errorIndex + 1);
            }
        }

        if (sequential && progressContainer) {
            createProgress();
        } else if (!sequential && progressContainer) {
            progressContainer.hidden = true;
        }

        if (sequential) {
            setActive(activeIndex, { focus: false, force: true });
        }

        questionBlocks.forEach(function (block, index) {
            if (!block) {
                return;
            }

            var select = block.querySelector('select');
            var customContainer = block.querySelector('[data-custom-container]');
            var customInput = customContainer ? customContainer.querySelector('input') : null;
            var answer = block.querySelector('[data-answer-input]');
            var nextIndex = index + 1;

            function handleInput(options) {
                updateOptionAvailability();
                var isComplete = evaluateBlockCompletion(index);

                if (!sequential) {
                    return;
                }

                if (isComplete) {
                    unlockStep(nextIndex);
                }

                if (nextIndex >= questionBlocks.length) {
                    refreshProgress();
                    return;
                }

                var nextBlock = questionBlocks[nextIndex];
                if (!nextBlock) {
                    refreshProgress();
                    return;
                }

                if (isComplete) {
                    if (nextBlock.dataset.hasError !== 'true') {
                        nextBlock.hidden = false;
                    }
                    setActive(nextIndex, { focus: options && options.focus !== false, force: true });
                    refreshProgress();
                    return;
                }

                hideFollowingBlocks(nextIndex);
            }

            if (select) {
                select.addEventListener('change', function () {
                    block.dataset.hasError = 'false';
                    updateCustomVisibility(select, customContainer);
                    handleInput({ focus: false });
                });
            }

            if (customInput) {
                customInput.addEventListener('input', function () {
                    block.dataset.hasError = 'false';
                    handleInput({ focus: false });
                });
            }

            if (answer) {
                answer.addEventListener('input', function () {
                    block.dataset.hasError = 'false';
                    handleInput({ focus: true });
                });
            }

        });

        updateOptionAvailability();
        refreshProgress();
    }

    window.Bgp.initSecurityQuestions = initSecurityQuestions;

    document.querySelectorAll('[data-security-questions]').forEach(function (container) {
        initSecurityQuestions(container);
    });
})();