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

        var list = container.querySelector('[data-question-list]');
        if (!list) {
            return;
        }

        var toggle = container.querySelector('[data-questions-toggle]');
        var addNextButton = container.querySelector('[data-questions-add]');
        var disableButton = container.querySelector('[data-questions-disable]');
        var emptyHint = container.querySelector('[data-empty-hint]');

        var maxQuestions = parseInt(container.getAttribute('data-max-questions') || '3', 10);
        if (!maxQuestions || maxQuestions < 1) {
            maxQuestions = 3;
        }

        var answerMinLength = parseInt(container.getAttribute('data-answer-minlength') || '3', 10);
        if (!answerMinLength || answerMinLength < 1) {
            answerMinLength = 3;
        }

        var questionMinLength = parseInt(container.getAttribute('data-question-minlength') || '5', 10);
        if (!questionMinLength || questionMinLength < 1) {
            questionMinLength = 5;
        }

        var initialCountAttr = parseInt(container.getAttribute('data-initial-count') || '0', 10);
        if (initialCountAttr < 0) {
            initialCountAttr = 0;
        }

        var initialActiveAttr = parseInt(container.getAttribute('data-initial-active') || '-1', 10);
        if (initialActiveAttr < -1) {
            initialActiveAttr = -1;
        }

        var initialEnabledAttr = container.getAttribute('data-initial-enabled') === 'true';

        var messages = {
            questionRequired: container.getAttribute('data-message-question-required') || '',
            customMinLength: container.getAttribute('data-message-custom-min') || '',
            answerMinLength: container.getAttribute('data-message-answer-min') || '',
            answerCommon: container.getAttribute('data-message-answer-common') || '',
            answerMatches: container.getAttribute('data-message-answer-matches') || ''
        };

        if (!messages.questionRequired) {
            messages.questionRequired = 'Please select a question.';
        }
        if (!messages.customMinLength) {
            messages.customMinLength = 'Provide a custom question of at least {0} characters.';
        }
        if (!messages.answerMinLength) {
            messages.answerMinLength = 'The answer must be at least {0} characters long.';
        }
        if (!messages.answerCommon) {
            messages.answerCommon = 'Choose a stronger answer.';
        }
        if (!messages.answerMatches) {
            messages.answerMatches = 'Answer cannot repeat the question.';
        }

        var bannedAnswers = ['1234', '0000', '1111', '9999', '12345', '00000', 'abcd', 'qwerty', 'password', 'haslo', 'hasło', 'pass', 'test', 'admin'];
        bannedAnswers = bannedAnswers.map(function (value) { return value.toLowerCase(); });

        function trim(value) {
            return (value || '').trim();
        }

        var items = Array.from(list.querySelectorAll('[data-question-item]')).map(function (element, index) {
            var summary = element.querySelector('[data-question-summary]');
            var body = element.querySelector('[data-question-body]');
            var select = body ? body.querySelector('select[data-question-select]') || body.querySelector('select') : null;
            var customContainer = body ? body.querySelector('[data-custom-container]') : null;
            var customInput = customContainer ? customContainer.querySelector('input') : null;
            var answerInput = body ? body.querySelector('[data-answer-input]') : null;
            var questionError = body ? body.querySelector('[data-error-question]') : null;
            var customError = body ? body.querySelector('[data-error-custom]') : null;
            var answerError = body ? body.querySelector('[data-error-answer]') : null;
            var summaryQuestion = summary ? summary.querySelector('[data-summary-question]') : null;
            var summaryAnswer = summary ? summary.querySelector('[data-summary-answer]') : null;
            var summaryToggle = summary ? summary.querySelector('[data-summary-toggle]') : null;
            var summaryToggleLabel = summary ? summary.querySelector('[data-summary-toggle-label]') : null;
            var summaryEdit = summary ? summary.querySelector('[data-summary-edit]') : null;
            var summaryRemove = summary ? summary.querySelector('[data-summary-remove]') : null;

            return {
                element: element,
                summary: summary,
                body: body,
                select: select,
                customContainer: customContainer,
                customInput: customInput,
                answerInput: answerInput,
                questionError: questionError,
                customError: customError,
                answerError: answerError,
                summaryQuestion: summaryQuestion,
                summaryAnswer: summaryAnswer,
                summaryToggle: summaryToggle,
                summaryToggleLabel: summaryToggleLabel,
                summaryEdit: summaryEdit,
                summaryRemove: summaryRemove,
                index: index,
                summaryRevealed: false,
                state: 'hidden'
            };
        });

        if (!items.length) {
            return;
        }

        function hasAnyValue(item) {
            if (!item) {
                return false;
            }
            var selectValue = item.select ? trim(item.select.value) : '';
            var customValue = item.customInput ? trim(item.customInput.value) : '';
            var answerValue = item.answerInput ? trim(item.answerInput.value) : '';
            return !!(selectValue || customValue || answerValue);
        }

        function getSelectedOption(item) {
            if (!item || !item.select || item.select.selectedIndex < 0) {
                return null;
            }
            return item.select.options[item.select.selectedIndex] || null;
        }

        function getAnswerValue(item) {
            return item && item.answerInput ? trim(item.answerInput.value) : '';
        }

        function getQuestionText(item) {
            if (!item) {
                return '';
            }
            var option = getSelectedOption(item);
            var allowsCustom = option && option.dataset.allowsCustom === 'true';
            if (allowsCustom && item.customInput && item.customContainer && !item.customContainer.hidden) {
                var customValue = trim(item.customInput.value);
                if (customValue) {
                    return customValue;
                }
            }
            if (option) {
                return trim(option.textContent || '');
            }
            return '';
        }

        function maskAnswer(answer) {
            var length = Math.max(answer.length, 5);
            var mask = '';
            for (var i = 0; i < length; i++) {
                mask += '•';
            }
            return mask;
        }

        function applyError(target, message) {
            if (!target) {
                return;
            }

            if (message) {
                target.textContent = message;
                target.dataset.clientMessage = 'true';
            } else if (target.dataset.clientMessage === 'true') {
                target.textContent = '';
            }
        }

        function updateCustomVisibility(item) {
            if (!item || !item.customContainer || !item.select) {
                return;
            }
            var option = getSelectedOption(item);
            var allowsCustom = option && option.dataset.allowsCustom === 'true';
            item.customContainer.hidden = !allowsCustom;
            if (!allowsCustom && item.customInput) {
                item.customInput.value = '';
            }
        }

        function updateSummary(item) {
            if (!item) {
                return;
            }
            var questionText = getQuestionText(item);
            if (item.summaryQuestion) {
                item.summaryQuestion.textContent = questionText || '—';
            }
            var answerValue = getAnswerValue(item);
            if (!answerValue) {
                item.summaryRevealed = false;
            }
            if (item.summaryToggle) {
                var showLabel = item.summaryToggle.getAttribute('data-summary-show-label') || 'Show';
                var hideLabel = item.summaryToggle.getAttribute('data-summary-hide-label') || 'Hide';
                var hasAnswer = !!answerValue;
                if (hasAnswer) {
                    item.summaryToggle.removeAttribute('aria-disabled');
                    item.summaryToggle.disabled = false;
                    item.summaryToggle.setAttribute('aria-pressed', item.summaryRevealed ? 'true' : 'false');
                    item.summaryToggle.setAttribute('aria-label', item.summaryRevealed ? hideLabel : showLabel);
                } else {
                    item.summaryToggle.setAttribute('aria-disabled', 'true');
                    item.summaryToggle.disabled = true;
                    item.summaryToggle.setAttribute('aria-pressed', 'false');
                    item.summaryToggle.setAttribute('aria-label', showLabel);
                }
                if (item.summaryToggleLabel) {
                    item.summaryToggleLabel.textContent = hasAnswer && item.summaryRevealed ? hideLabel : showLabel;
                }
            }
            if (item.summaryAnswer) {
                if (!answerValue) {
                    item.summaryAnswer.textContent = '—';
                } else if (item.summaryRevealed) {
                    item.summaryAnswer.textContent = answerValue;
                } else {
                    item.summaryAnswer.textContent = maskAnswer(answerValue);
                }
            }
        }

        var maxVisible = Math.min(maxQuestions, items.length);
        var serverVisibleCount = 0;
        var serverActiveIndex = -1;

        items.forEach(function (item, index) {
            if (item.element.getAttribute('data-has-error') === 'true' && serverActiveIndex < 0) {
                serverActiveIndex = index;
            }
            if (hasAnyValue(item) || item.element.getAttribute('data-has-error') === 'true') {
                serverVisibleCount = index + 1;
            }
        });

        var enabled = initialEnabledAttr || serverVisibleCount > 0;
        var visibleCount = enabled ? Math.min(Math.max(initialCountAttr, serverVisibleCount, 1), maxVisible) : 0;
        var activeIndex = enabled ? initialActiveAttr : -1;

        if (enabled) {
            if (activeIndex < 0 && serverActiveIndex >= 0) {
                activeIndex = Math.min(serverActiveIndex, visibleCount - 1);
            }
            if (activeIndex < 0 && serverVisibleCount > 0) {
                activeIndex = Math.min(serverVisibleCount - 1, visibleCount - 1);
            }
            if (activeIndex < 0 && visibleCount > 0) {
                activeIndex = visibleCount - 1;
            }
        } else {
            activeIndex = -1;
        }

        function updateEmptyHint() {
            if (!emptyHint) {
                return;
            }
            if (!enabled || !visibleCount) {
                emptyHint.hidden = false;
                return;
            }
            var hasAnswers = false;
            for (var i = 0; i < visibleCount; i++) {
                if (hasAnyValue(items[i])) {
                    hasAnswers = true;
                    break;
                }
            }
            var hasActive = activeIndex >= 0 && activeIndex < visibleCount;
            emptyHint.hidden = hasAnswers || hasActive;
        }

        function setState(item, state) {
            if (!item) {
                return;
            }
            item.state = state;
            item.element.hidden = state === 'hidden';
            if (item.summary) {
                item.summary.hidden = state !== 'summary';
            }
            if (item.body) {
                item.body.hidden = state !== 'active';
            }
            item.element.classList.toggle('is-active', state === 'active');
        }

        function focusFirstField(item) {
            if (!item || !item.body || item.state !== 'active') {
                return;
            }
            var focusable = item.body.querySelector('select, input');
            if (focusable) {
                focusable.focus();
            }
        }

        function validateItem(item, options) {
            if (!item) {
                return true;
            }
            options = options || {};
            var showErrors = options.showErrors === true;
            var selectValue = item.select ? trim(item.select.value) : '';
            var option = getSelectedOption(item);
            var allowsCustom = option && option.dataset.allowsCustom === 'true';
            var customValue = item.customInput ? trim(item.customInput.value) : '';
            var answerValue = getAnswerValue(item);

            var hasInput = !!(selectValue || customValue || answerValue);
            var questionError = '';
            var customError = '';
            var answerError = '';

            if (!hasInput) {
                if (showErrors) {
                    applyError(item.questionError, '');
                    if (item.customError) {
                        applyError(item.customError, '');
                    }
                    applyError(item.answerError, '');
                }
                return true;
            }

            if (!selectValue) {
                questionError = messages.questionRequired;
            }
            if (allowsCustom) {
                if (customValue.length < questionMinLength) {
                    customError = messages.customMinLength.replace('{0}', questionMinLength);
                }
            } else if (customValue) {
                customValue = '';
                if (item.customInput) {
                    item.customInput.value = '';
                }
            }

            if (answerValue.length < answerMinLength) {
                answerError = messages.answerMinLength.replace('{0}', answerMinLength);
            } else if (selectValue) {
                var questionText = getQuestionText(item);
                if (questionText && questionText.toLowerCase() === answerValue.toLowerCase()) {
                    answerError = messages.answerMatches;
                } else if (bannedAnswers.indexOf(answerValue.toLowerCase()) !== -1) {
                    answerError = messages.answerCommon;
                }
            }

            if (showErrors) {
                applyError(item.questionError, questionError);
                if (allowsCustom || customError) {
                    applyError(item.customError, customError);
                } else if (item.customError) {
                    applyError(item.customError, '');
                }
                applyError(item.answerError, answerError);
            } else {
                if (!questionError) {
                    applyError(item.questionError, '');
                }
                if (!customError && item.customError) {
                    applyError(item.customError, '');
                }
                if (!answerError) {
                    applyError(item.answerError, '');
                }
            }

            return !(questionError || customError || answerError);
        }

        function updateOptionAvailability() {
            if (!enabled) {
                items.forEach(function (item) {
                    if (item.select) {
                        Array.from(item.select.options).forEach(function (option) {
                            option.disabled = false;
                            option.hidden = false;
                        });
                    }
                });
                return;
            }
            var activeSelects = items.slice(0, visibleCount)
                .map(function (item) { return item.select; })
                .filter(function (select) { return !!select; });

            activeSelects.forEach(function (select) {

                var currentValue = select.value;
                Array.from(select.options).forEach(function (option) {
                    if (!option.value) {
                        option.disabled = false;
                        option.hidden = false;
                        return;
                    }

                    var isSelectedElsewhere = activeSelects.some(function (other) {
                        return other !== select && other.value === option.value;
                    });

                    var shouldDisable = isSelectedElsewhere && option.value !== currentValue;
                    option.disabled = shouldDisable;
                    option.hidden = shouldDisable;
                });
            });
        }

        function updateRemoveButtons() {
            items.forEach(function (item, index) {
                var enabledForItem = enabled && index < visibleCount;
                if (item.bodyRemove) {
                    item.bodyRemove.disabled = !enabledForItem;
                    if (!enabledForItem) {
                        item.bodyRemove.setAttribute('aria-disabled', 'true');
                    } else {
                        item.bodyRemove.removeAttribute('aria-disabled');
                    }
                }
                if (item.summaryRemove) {
                    item.summaryRemove.disabled = !enabledForItem;
                    if (!enabledForItem) {
                        item.summaryRemove.setAttribute('aria-disabled', 'true');
                        item.summaryRemove.setAttribute('tabindex', '-1');
                    } else {
                        item.summaryRemove.removeAttribute('aria-disabled');
                        item.summaryRemove.removeAttribute('tabindex');
                    }
                }
            });
        }

        function updateActionButtons() {
            if (addNextButton) {
                if (!enabled) {
                    addNextButton.hidden = true;
                } else {
                    var atCapacity = visibleCount >= maxVisible;
                    addNextButton.hidden = atCapacity;
                    if (!atCapacity) {
                        var hasActive = activeIndex >= 0 && activeIndex < visibleCount;
                        var canAdd = !hasActive;
                        if (canAdd) {
                            for (var i = 0; i < visibleCount; i++) {
                                if (!validateItem(items[i], { showErrors: false })) {
                                    canAdd = false;
                                    break;
                                }
                            }
                        }
                        addNextButton.disabled = !canAdd;
                    } else {
                        addNextButton.disabled = true;
                    }
                }
            }
            if (disableButton) {
                disableButton.hidden = !enabled;
                disableButton.disabled = !enabled;
            }
            if (toggle) {
                toggle.checked = enabled;
            }
        }

        function refreshStates(options) {
            options = options || {};
            if (!enabled) {
                items.forEach(function (item) {
                    setState(item, 'hidden');
                    updateSummary(item);
                });
                if (list) {
                    list.hidden = true;
                }
                updateOptionAvailability();
                updateRemoveButtons();
                updateEmptyHint();
                updateActionButtons();
                return;
            }

            if (list) {
                list.hidden = false;
            }

            if (visibleCount < 0) {
                visibleCount = 0;
            }
            if (visibleCount > maxVisible) {
                visibleCount = maxVisible;
            }

            var hasActive = activeIndex >= 0 && activeIndex < visibleCount;
            items.forEach(function (item, index) {
                if (index >= visibleCount) {
                    setState(item, 'hidden');
                } else if (hasActive && index === activeIndex) {
                    setState(item, 'active');
                } else {
                    setState(item, 'summary');
                }
                updateSummary(item);

            });

            updateOptionAvailability();
            updateRemoveButtons();
            updateEmptyHint();
            updateActionButtons();

            if (hasActive && options.focusActive !== false && items[activeIndex]) {
                focusFirstField(items[activeIndex]);
            }
        }

        function completeItem(item) {
            if (!enabled || !item) {
                return;
            }
            if (activeIndex !== item.index) {
                return;
            }

            if (validateItem(item, { showErrors: false })) {
                activeIndex = -1;
                refreshStates({ focusActive: false });
            }

        }

        function clearItemValues(item) {
            if (!item) {
                return;
            }
            if (item.questionError) {
                item.questionError.dataset.clientMessage = 'true';
            }
            if (item.customError) {
                item.customError.dataset.clientMessage = 'true';
            }
            if (item.answerError) {
                item.answerError.dataset.clientMessage = 'true';
            }
            if (item.select) {
                item.select.value = '';
                item.select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (item.customInput) {
                item.customInput.value = '';
            }
            if (item.customContainer) {
                item.customContainer.hidden = true;
            }
            if (item.answerInput) {
                item.answerInput.value = '';
            }
            applyError(item.questionError, '');
            applyError(item.customError, '');
            applyError(item.answerError, '');
            item.summaryRevealed = false;
        }

        function copyValues(fromItem, toItem) {
            if (!fromItem || !toItem) {
                return;
            }
            if (toItem.select) {
                toItem.select.value = fromItem.select ? fromItem.select.value : '';
                toItem.select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (toItem.customInput) {
                toItem.customInput.value = fromItem.customInput ? fromItem.customInput.value : '';
            }
            if (toItem.answerInput) {
                toItem.answerInput.value = fromItem.answerInput ? fromItem.answerInput.value : '';
            }
            toItem.summaryRevealed = false;
        }

        function removeQuestion(index) {
            if (!enabled || index < 0 || index >= visibleCount) {
                return;
            }

            if (visibleCount <= 1) {
                clearItemValues(items[0]);
                activeIndex = 0;
                refreshStates({ focusActive: true });
                return;
            }
            for (var i = index; i < visibleCount - 1; i++) {
                copyValues(items[i + 1], items[i]);
            }
            clearItemValues(items[visibleCount - 1]);
            visibleCount -= 1;
            if (activeIndex >= visibleCount) {
                activeIndex = visibleCount - 1;
            }
            refreshStates({ focusActive: true });
        }

        function showNextQuestion() {
            if (!enabled) {
                setEnabled(true);
            }
            if (!enabled) {
                return;
            }
            if (visibleCount >= maxVisible) {
                return;
            }
            visibleCount += 1;
            activeIndex = visibleCount - 1;
            refreshStates({ focusActive: true });
        }

        function setEnabled(value) {
            value = !!value;
            if (enabled === value) {
                if (enabled) {
                    refreshStates({ focusActive: activeIndex >= 0 });
                } else {
                    updateEmptyHint();
                    updateActionButtons();
                }
                return;
            }
            enabled = value;
            container.classList.toggle('security-questions--disabled', !enabled);
            if (!enabled) {
                visibleCount = 0;
                activeIndex = -1;
                items.forEach(function (item) {
                    setState(item, 'hidden');
                    clearItemValues(item);
                });
                if (list) {
                    list.hidden = true;
                }
                updateOptionAvailability();
                updateRemoveButtons();
                updateEmptyHint();
                updateActionButtons();
                return;
            }
            visibleCount = Math.min(Math.max(visibleCount || 1, 1), maxVisible);
            activeIndex = Math.min(Math.max(activeIndex, 0), visibleCount - 1);
            refreshStates({ focusActive: true });
        }

        items.forEach(function (item) {
            updateCustomVisibility(item);
            updateSummary(item);

            if (item.select) {
                item.select.addEventListener('change', function () {
                    if (item.questionError) {
                        item.questionError.dataset.clientMessage = 'true';
                    }
                    updateCustomVisibility(item);
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    if (activeIndex === item.index) {
                        completeItem(item);
                    }
                    updateActionButtons();
                });
                item.select.addEventListener('blur', function () {
                    completeItem(item);
                });
            }

            if (item.customInput) {
                item.customInput.addEventListener('input', function () {
                    if (item.customError) {
                        item.customError.dataset.clientMessage = 'true';
                    }
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    updateActionButtons();
                });
                item.customInput.addEventListener('blur', function () {
                    completeItem(item);
                });
            }

            if (item.answerInput) {
                item.answerInput.addEventListener('input', function () {
                    if (item.answerError) {
                        item.answerError.dataset.clientMessage = 'true';
                    }
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    updateActionButtons();
                });
                item.answerInput.addEventListener('blur', function () {
                    completeItem(item);
                });
            }

            if (item.bodyRemove) {
                item.bodyRemove.addEventListener('click', function () {
                    removeQuestion(item.index);
                });
            }

            if (item.summaryRemove) {
                item.summaryRemove.addEventListener('click', function () {
                    removeQuestion(item.index);
                });
            }

            if (item.summaryEdit) {
                item.summaryEdit.addEventListener('click', function () {
                    if (!enabled) {
                        setEnabled(true);
                    }
                    activeIndex = item.index;
                    refreshStates({ focusActive: true });
                });
            }

            if (item.summaryToggle) {
                item.summaryToggle.addEventListener('click', function () {
                    if (item.summaryToggle.disabled) {
                        return;
                    }
                    item.summaryRevealed = !item.summaryRevealed;
                    updateSummary(item);
                });
            }
            if (item.body) {
                item.body.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape' && enabled) {
                        event.preventDefault();
                        activeIndex = -1;
                        refreshStates({ focusActive: false });
                    }
                });
            }
        });

        if (addNextButton) {
            addNextButton.addEventListener('click', function () {
                showNextQuestion();
            });
        }

        if (disableButton) {
            disableButton.addEventListener('click', function () {
                setEnabled(false);
            });
        }

        if (toggle) {
            toggle.addEventListener('change', function () {
                setEnabled(toggle.checked);
                if (enabled && visibleCount === 0) {
                    showNextQuestion();
                }
            });
        }

        setEnabled(enabled);
        if (enabled && visibleCount === 0) {
            showNextQuestion();
        } else {
            refreshStates({ focusActive: enabled && activeIndex >= 0 });
        }
        if (!enabled) {
            updateActionButtons();
        }
    }

    window.Bgp.initSecurityQuestions = initSecurityQuestions;

    document.querySelectorAll('[data-security-questions]').forEach(function (container) {
        initSecurityQuestions(container);
    });
})();