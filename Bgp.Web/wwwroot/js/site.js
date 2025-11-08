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

        var initialCount = parseInt(container.getAttribute('data-initial-count') || '1', 10);
        if (!initialCount || initialCount < 1) {
            initialCount = 1;
        }

        var initialActive = parseInt(container.getAttribute('data-initial-active') || '0', 10);
        if (initialActive < 0) {
            initialActive = 0;
        }

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

        var emptyHint = container.querySelector('[data-empty-hint]');

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
            var addButton = body ? body.querySelector('[data-question-add]') : null;
            var bodyRemove = body ? body.querySelector('[data-question-remove]') : null;
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
                addButton: addButton,
                bodyRemove: bodyRemove,
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

        var visibleCount = Math.min(Math.max(initialCount, 1), Math.min(maxQuestions, items.length));
        var activeIndex = Math.min(Math.max(initialActive, 0), visibleCount - 1);

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

            var selectedOption = item.select.options[item.select.selectedIndex];
            var allowsCustom = selectedOption && selectedOption.dataset.allowsCustom === 'true';
            item.customContainer.hidden = !allowsCustom;
            if (!allowsCustom && item.customInput) {
                item.customInput.value = '';
            }
        }

        function getQuestionText(item) {
            if (!item) {
                return '';
            }

            var allowsCustom = item.customContainer && !item.customContainer.hidden;
            if (allowsCustom && item.customInput) {
                var customValue = (item.customInput.value || '').trim();
                if (customValue) {
                    return customValue;
                }
            }

            if (item.select && item.select.value) {
                var selectedOption = item.select.options[item.select.selectedIndex];
                if (selectedOption) {
                    return (selectedOption.textContent || '').trim();
                }
            }
            return '';
        }

        function getAnswerValue(item) {
            if (!item || !item.answerInput) {
                return '';
            }

            return (item.answerInput.value || '').trim();
        }

        function hasAnyValue(item) {
            if (!item) {
                return false;
            }

            var selectValue = item.select ? (item.select.value || '').trim() : '';
            var customValue = item.customInput ? (item.customInput.value || '').trim() : '';
            var answerValue = getAnswerValue(item);
            return !!(selectValue || customValue || answerValue);
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

        function updateEmptyHint() {
            if (!emptyHint) {
                return;
            }

            if (visibleCount <= 1 && !hasAnyValue(items[0])) {
                emptyHint.hidden = false;
            } else {
                emptyHint.hidden = true;
            }
        }

        function updateAddButtonState(item) {
            if (!item || !item.addButton) {
                return;
            }
            var isActive = item.index === activeIndex && item.state === 'active';
            var canAddMore = visibleCount < Math.min(maxQuestions, items.length);
            item.addButton.hidden = !(isActive && canAddMore);
            if (!item.addButton.hidden) {
                item.addButton.disabled = !validateItem(item, { showErrors: false });
            } else {
                item.addButton.disabled = true;
            }
        }

        function updateRemoveButtons() {
            items.forEach(function (item, index) {
                var enabled = visibleCount > 1 && index < visibleCount;
                if (item.bodyRemove) {
                    item.bodyRemove.disabled = !enabled;
                    if (!enabled) {
                        item.bodyRemove.setAttribute('aria-disabled', 'true');
                    } else {
                        item.bodyRemove.removeAttribute('aria-disabled');
                    }
                }
                if (item.summaryRemove) {
                    item.summaryRemove.disabled = !enabled;
                    if (!enabled) {
                        item.summaryRemove.setAttribute('aria-disabled', 'true');
                        item.summaryRemove.setAttribute('tabindex', '-1');
                    } else {
                        item.summaryRemove.removeAttribute('aria-disabled');
                        item.summaryRemove.removeAttribute('tabindex');
                    }
                }

                
            });

        }

        function setState(item, state) {
            if (!item) {
                return;
            }

            if (state === 'summary' && visibleCount <= 1) {
                state = 'active';
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
                return false;
            }

            options = options || {};
            var showErrors = options.showErrors === true;
            var selectValue = item.select ? (item.select.value || '').trim() : '';
            var selectedOption = item.select && item.select.selectedIndex >= 0 ? item.select.options[item.select.selectedIndex] : null;
            var allowsCustom = !!(selectedOption && selectedOption.dataset.allowsCustom === 'true');
            var customValue = item.customInput ? (item.customInput.value || '').trim() : '';
            var answerValue = getAnswerValue(item);

            var questionError = '';
            var customError = '';
            var answerError = '';

            if (!selectValue) {
                questionError = messages.questionRequired;
            }

            if (allowsCustom) {
                if (customValue.length < questionMinLength) {
                    customError = messages.customMinLength.replace('{0}', questionMinLength);
                }
            }

            if (answerValue.length < answerMinLength) {
                answerError = messages.answerMinLength.replace('{0}', answerMinLength);
            } else {
                var questionText = allowsCustom && !customError ? customValue : getQuestionText(item);
                if (questionText && questionText.trim().toLowerCase() === answerValue.toLowerCase()) {
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
            var activeSelects = items.slice(0, visibleCount).map(function (item) { return item.select; }).filter(function (select) { return !!select; });
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

                if (currentValue && activeSelects.some(function (other) { return other !== select && other.value === currentValue; })) {
                    select.value = '';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        function refreshStates(options) {
            options = options || {};
            items.forEach(function (item, index) {
                if (index >= visibleCount) {
                    setState(item, 'hidden');
                } else if (index === activeIndex) {
                    setState(item, 'active');
                } else {
                    setState(item, 'summary');
                }
                updateSummary(item);
                updateAddButtonState(item);
            });
            updateRemoveButtons();
            updateOptionAvailability();
            updateEmptyHint();
            if (options.focusActive !== false && items[activeIndex]) {
                focusFirstField(items[activeIndex]);
            }
        }

        function addQuestionAt(index) {
            var item = items[index];
            if (!item) {
                return;
            }
            if (!validateItem(item, { showErrors: true })) {
                var focusTarget = item.select && !item.select.value ? item.select : null;
                if (!focusTarget && item.customContainer && !item.customContainer.hidden && item.customInput && (item.customInput.value || '').trim().length < questionMinLength) {
                    focusTarget = item.customInput;
                }
                if (!focusTarget && item.answerInput) {
                    focusTarget = item.answerInput;
                }
                if (focusTarget) {
                    focusTarget.focus();
                }
                return;
            }

            if (visibleCount >= Math.min(maxQuestions, items.length)) {
                return;
            }
            visibleCount += 1;
            activeIndex = visibleCount - 1;
            refreshStates({ focusActive: true });
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
            if (index < 0 || index >= visibleCount) {
                return;
            }

            if (visibleCount <= 1) {
                clearItemValues(items[0]);
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
                    updateAddButtonState(item);
                    updateOptionAvailability();
                });
            }

            if (item.customInput) {
                item.customInput.addEventListener('input', function () {
                    if (item.customError) {
                        item.customError.dataset.clientMessage = 'true';
                    }
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    updateAddButtonState(item);
                });
            }

            if (item.answerInput) {
                item.answerInput.addEventListener('input', function () {
                    if (item.answerError) {
                        item.answerError.dataset.clientMessage = 'true';
                    }
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    updateAddButtonState(item);
                });
            }

            if (item.addButton) {
                item.addButton.addEventListener('click', function () {
                    addQuestionAt(item.index);
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
                    if (event.key === 'Escape' && visibleCount > 1) {
                        event.preventDefault();
                        var targetIndex = item.index > 0 ? item.index - 1 : (item.index + 1 < visibleCount ? item.index + 1 : item.index);
                        activeIndex = Math.max(0, targetIndex);
                        refreshStates({ focusActive: true });
                    }
                });
            }
        });

        refreshStates({ focusActive: false });
        if (items[activeIndex]) {
            focusFirstField(items[activeIndex]);
        }
    }

    window.Bgp.initSecurityQuestions = initSecurityQuestions;

    document.querySelectorAll('[data-security-questions]').forEach(function (container) {
        initSecurityQuestions(container);
    });
})();