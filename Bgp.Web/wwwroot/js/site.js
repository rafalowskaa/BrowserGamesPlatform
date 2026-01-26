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
            btn.classList.toggle('is-revealed', isVisible);
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

    function updateRejectionCountdown(element) {
        if (!element) {
            return;
        }
        var template = element.getAttribute('data-rejection-template') || '';
        var deadlineValue = element.getAttribute('data-rejection-deadline');
        if (!template || !deadlineValue) {
            element.removeAttribute('title');
            return;
        }
        var deadline = new Date(deadlineValue);
        if (isNaN(deadline.getTime())) {
            element.removeAttribute('title');
            return;
        }
        var now = new Date();
        var remainingMs = deadline.getTime() - now.getTime();
        var daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
        element.title = template.replace('{0}', daysRemaining);
    }

    function initRejectionCountdowns(root) {
        var scope = root || document;
        var marker = '__bgpRejectionTimer';
        if (scope[marker]) {
            return;
        }
        var items = scope.querySelectorAll('[data-rejection-deadline]');
        if (!items.length) {
            return;
        }
        var tick = function () { items.forEach(updateRejectionCountdown); };
        tick();
        var interval = setInterval(tick, 60 * 60 * 1000);
        scope[marker] = interval;
        window.addEventListener('beforeunload', function () {
            clearInterval(interval);
        }, { once: true });
    }

    window.Bgp.updateRejectionCountdown = updateRejectionCountdown;
    window.Bgp.initRejectionCountdowns = initRejectionCountdowns;

    initRejectionCountdowns();

    function showGlobalToast(message, tone) {
        const toastContainer = document.getElementById('globalToastStack');
        if (!toastContainer || !message) {
            return;
        }
        while (toastContainer.children.length > 4) {
            toastContainer.removeChild(toastContainer.firstChild);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${tone || 'success'}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('is-leaving');
            window.setTimeout(() => toast.remove(), 250);
        }, 3500);
    }

    window.Bgp.showGlobalToast = showGlobalToast;

    function showGlobalAlert(message, tone, link) {
        const toastContainer = document.getElementById('globalToastStack');
        if (!toastContainer || !message) {
            return;
        }
        while (toastContainer.children.length > 4) {
            toastContainer.removeChild(toastContainer.firstChild);
        }
        const toast = document.createElement(link ? 'a' : 'div');
        toast.className = `toast${tone ? ` toast--${tone}` : ''}`;
        toast.textContent = message;
        if (link) {
            toast.href = link;
        }
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('is-leaving');
            window.setTimeout(() => toast.remove(), 250);
        }, 5000);
    }

    window.Bgp.showGlobalAlert = showGlobalAlert;

    function initSecurityQuestions(container) {
        if (!container) {
            return;
        }

        var list = container.querySelector('[data-question-list]');
        if (!list) {
            return;
        }

        var formScope = container.closest('form') || container;
        var addNextButton = container.querySelector('[data-questions-add]') || formScope.querySelector('[data-questions-add]');
        var saveButton = container.querySelector('[data-questions-save]') || formScope.querySelector('[data-questions-save]');
        var emptyHint = container.querySelector('[data-empty-hint]');
        var countLabel = container.querySelector('[data-questions-count]');
        var addFirstLabel = container.getAttribute('data-label-add-first') || '';
        var addNextLabel = container.getAttribute('data-label-add-next') || '';
        var alwaysExpanded = container.getAttribute('data-questions-layout') === 'expanded';

        if ((!addFirstLabel || !addNextLabel) && addNextButton) {
            var currentLabel = (addNextButton.textContent || '').trim();
            if (!addFirstLabel) {
                addFirstLabel = currentLabel;
            }
            if (!addNextLabel) {
                addNextLabel = currentLabel;
            }
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
        var maskedToken = container.getAttribute('data-answer-mask') || '';

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

        function isMaskedValue(value) {
            if (!maskedToken) {
                return false;
            }
            return trim(value) === maskedToken;
        }

        function clearMaskedAnswer(item) {
            if (!item || !item.answerInput) {
                return;
            }
            if (item.answerInput.dataset.answerMasked === 'true') {
                item.answerInput.value = '';
                delete item.answerInput.dataset.answerMasked;
            }
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
            var bodyRemove = body ? body.querySelector('[data-question-remove]') : null;

            if (answerInput && maskedToken && isMaskedValue(answerInput.value)) {
                answerInput.dataset.answerMasked = 'true';
            }

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
                bodyRemove: bodyRemove,
                index: index,
                summaryRevealed: false,
                summaryHideTimer: null,
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

        function getCustomOptionValue(item) {
            if (!item) {
                return container.getAttribute('data-custom-option') || '__custom__';
            }
            if (item.select && item.select.getAttribute('data-custom-option')) {
                return item.select.getAttribute('data-custom-option') || '__custom__';
            }
            return container.getAttribute('data-custom-option') || '__custom__';
        }

        function isCustomOption(item, option) {
            if (!item || !option) {
                return false;
            }
            var customValue = getCustomOptionValue(item);
            return option.value === customValue || option.dataset.custom === 'true';
        }

        function getAnswerValue(item) {
            return item && item.answerInput ? trim(item.answerInput.value) : '';
        }

        function getQuestionText(item) {
            if (!item) {
                return '';
            }
            var option = getSelectedOption(item);
            var isCustom = isCustomOption(item, option);
            if (isCustom && item.customInput && item.customContainer && !item.customContainer.hidden) {
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
            var maskChar = isMaskedValue(answer) ? '●' : '•';
            var mask = '';
            for (var i = 0; i < length; i++) {
                mask += maskChar;
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
            var isCustom = isCustomOption(item, option);
            item.customContainer.hidden = !isCustom;
            if (!isCustom && item.customInput) {
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
        var allowNoActive = false;
        var userActivated = false;

        if (enabled) {
            if (activeIndex < 0 && serverActiveIndex >= 0) {
                activeIndex = Math.min(serverActiveIndex, visibleCount - 1);
            }
            if (activeIndex < 0 && serverVisibleCount > 0) {
                activeIndex = Math.min(serverVisibleCount - 1, visibleCount - 1);
            }
            if (activeIndex >= visibleCount) {
                activeIndex = visibleCount - 1;
            }
        } else {
            activeIndex = -1;
        }

        function evaluateAllowNoActive(currentVisibleCount) {
            if (!enabled || !currentVisibleCount || currentVisibleCount < 1) {
                return false;
            }
            var hasErrors = false;
            var allCompleted = true;
            for (var i = 0; i < currentVisibleCount; i++) {
                var currentItem = items[i];
                if (!currentItem) {
                    continue;
                }
                if (currentItem.element && currentItem.element.getAttribute('data-has-error') === 'true') {
                    hasErrors = true;
                }
                if (!hasAnyValue(currentItem)) {
                    allCompleted = false;
                }
            }
            return allCompleted && !hasErrors;
        }

        allowNoActive = evaluateAllowNoActive(visibleCount);

        if (allowNoActive && !userActivated) {
            activeIndex = -1;
        } else if (!allowNoActive && activeIndex < 0 && visibleCount > 0) {
            activeIndex = visibleCount - 1;
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

        function showElement(element) {
            if (!element) {
                return;
            }
            element.hidden = false;
            element.removeAttribute('hidden');
        }

        function hideElement(element) {
            if (!element) {
                return;
            }
            element.hidden = true;
            element.setAttribute('hidden', '');
        }

        function setState(item, state, options) {
            if (!item) {
                return;
            }
            options = options || {};
            var allowCollapseEmpty = options.allowCollapseEmpty === true;
            var effectiveState = state;
            if (state === 'collapsed' && !allowCollapseEmpty && !hasAnyValue(item)) {
                effectiveState = 'active';
            }
            item.state = effectiveState;
            var isHidden = effectiveState === 'hidden';
            if (isHidden) {
                hideElement(item.element);
            } else {
                showElement(item.element);
            }
            if (item.summary) {
                var showSummary = effectiveState === 'collapsed' && hasAnyValue(item);
                if (showSummary) {
                    showElement(item.summary);
                } else {
                    hideElement(item.summary);
                }
                var summaryButton = item.summary.querySelector('[data-summary-edit]');
                if (summaryButton) {
                    summaryButton.setAttribute('aria-expanded', effectiveState === 'active' ? 'true' : 'false');
                }
            }
            if (item.body) {
                if (effectiveState === 'active') {
                    showElement(item.body);
                } else {
                    hideElement(item.body);
                }
            }
            if (effectiveState === 'active') {
                item.summaryRevealed = false;
            }
            item.element.classList.toggle('is-active', effectiveState === 'active');
            item.element.classList.toggle('is-collapsed', effectiveState === 'collapsed' && hasAnyValue(item));
            item.element.classList.toggle('is-complete', effectiveState !== 'active' && hasAnyValue(item));
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
            var isCustom = isCustomOption(item, option);
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
            if (isCustom) {
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
                if (isCustom || customError) {
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

                    var allowsMultiple = option.dataset.allowsMultiple === 'true';
                    var isSelectedElsewhere = activeSelects.some(function (other) {
                        return other !== select && other.value === option.value;
                    });

                    var shouldDisable = !allowsMultiple && isSelectedElsewhere && option.value !== currentValue;
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
                var atCapacity = enabled && visibleCount >= maxVisible;
                addNextButton.hidden = false;

                if (atCapacity) {
                    addNextButton.disabled = true;
                    addNextButton.setAttribute('aria-disabled', 'true');
                } else if (!enabled || visibleCount === 0) {
                    if (addFirstLabel) {
                        addNextButton.textContent = addFirstLabel;
                    }
                    addNextButton.disabled = false;
                    addNextButton.removeAttribute('aria-disabled');
                } else {
                    if (addNextLabel) {
                        addNextButton.textContent = addNextLabel;
                    }
                    addNextButton.disabled = false;
                    addNextButton.removeAttribute('aria-disabled');
                }
                if (saveButton) {
                    var shouldShowSave = enabled && visibleCount >= maxVisible;
                    saveButton.hidden = !shouldShowSave;
                    saveButton.toggleAttribute('hidden', !shouldShowSave);
                }
            }
        }
        function updateCountLabel() {
            if (!countLabel) {
                return;
            }
            var count = enabled ? visibleCount : 0;
            countLabel.textContent = count + '/' + maxVisible;
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
                updateCountLabel();
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

            allowNoActive = alwaysExpanded ? false : evaluateAllowNoActive(visibleCount);

            if (visibleCount > 0) {
                if (activeIndex >= visibleCount) {
                    activeIndex = visibleCount - 1;
                }
                if (activeIndex < 0 && !allowNoActive) {
                    activeIndex = visibleCount - 1;
                }
            } else {
                activeIndex = -1;
            }

            var hasActive = activeIndex >= 0 && activeIndex < visibleCount;
            items.forEach(function (item, index) {
                if (index >= visibleCount) {
                    setState(item, 'hidden');
                } else if (alwaysExpanded) {
                    setState(item, 'active');
                } else if (hasActive && index === activeIndex) {
                    setState(item, 'active');
                } else {
                    setState(item, 'collapsed', { allowCollapseEmpty: hasActive });
                }
                updateSummary(item);

            });

            updateOptionAvailability();
            updateRemoveButtons();
            updateEmptyHint();
            updateActionButtons();
            updateCountLabel();

            if (!alwaysExpanded && hasActive && options.focusActive !== false && items[activeIndex]) {
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

            validateItem(item, { showErrors: false });
            updateActionButtons();

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
                setEnabled(false);
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

        function setActive(index, focus) {
            if (!enabled) {
                setEnabled(true);
    
            }
            if (index < 0 || index >= Math.min(visibleCount, maxVisible)) {
                return;
            }

            userActivated = true;
            activeIndex = index;
            refreshStates({ focusActive: !!focus });
        }
        function showNextQuestion() {
            var wasEnabled = enabled;

            if (!enabled) {
                setEnabled(true);
            }
            if (!wasEnabled) {
                if (visibleCount <= 0) {
                    visibleCount = 1;
                }

                var nextIndex = Math.max(Math.min(visibleCount - 1, maxVisible - 1), 0);
                setActive(nextIndex, true);
                return;
            }

            if (visibleCount >= maxVisible) {
                return;

            }

            visibleCount += 1;
            setActive(visibleCount - 1, true);
        }

        function setEnabled(value) {
            value = !!value;
            if (enabled === value) {
                container.classList.toggle('security-questions--disabled', !value);
                if (enabled) {
                    refreshStates({ focusActive: activeIndex >= 0 });
                } else {
                    updateEmptyHint();
                    updateActionButtons();
                    updateCountLabel();
                }
                return;
            }
            enabled = value;
            container.classList.toggle('security-questions--disabled', !enabled);
            if (!enabled) {
                userActivated = false;
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
                updateCountLabel();
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
                    clearMaskedAnswer(item);
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
                    clearMaskedAnswer(item);
                    validateItem(item, { showErrors: false });
                    updateSummary(item);
                    updateActionButtons();
                });
                item.customInput.addEventListener('blur', function () {
                    completeItem(item);
                });
            }

            if (item.answerInput) {
                item.answerInput.addEventListener('keydown', function (event) {
                    if (item.answerInput.dataset.answerMasked === 'true'
                        && !event.ctrlKey
                        && !event.metaKey
                        && !event.altKey
                        && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
                        clearMaskedAnswer(item);
                    }
                });
                item.answerInput.addEventListener('paste', function () {
                    clearMaskedAnswer(item);
                });
                item.answerInput.addEventListener('input', function () {
                    if (item.answerError) {
                        item.answerError.dataset.clientMessage = 'true';
                    }
                    if (item.answerInput && item.answerInput.dataset.answerMasked === 'true') {
                        clearMaskedAnswer(item);
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
                    if (!window.confirm('Na pewno?')) {
                        return;
                    }
                    removeQuestion(item.index);
                });
            }

            if (item.summaryRemove) {
                item.summaryRemove.addEventListener('click', function () {
                    if (!window.confirm('Na pewno?')) {
                        return;
                    }
                    removeQuestion(item.index);
                });
            }

            if (item.summaryEdit) {
                item.summaryEdit.addEventListener('click', function () {
                    
                    if (activeIndex !== item.index) {
                        setActive(item.index, true);
                    }
                });
            }

            if (item.summaryToggle) {
                item.summaryToggle.addEventListener('click', function () {
                    if (item.summaryToggle.disabled) {
                        return;
                    }
                    item.summaryRevealed = !item.summaryRevealed;
                    updateSummary(item);
                    if (item.summaryRevealed) {
                        if (item.summaryHideTimer) {
                            clearTimeout(item.summaryHideTimer);
                        }
                        item.summaryHideTimer = window.setTimeout(function () {
                            item.summaryRevealed = false;
                            updateSummary(item);
                            item.summaryHideTimer = null;
                        }, 6000);
                    } else if (item.summaryHideTimer) {
                        clearTimeout(item.summaryHideTimer);
                        item.summaryHideTimer = null;
                    }
                });
            }
            if (item.body) {
                item.body.addEventListener('focusin', function () {
                    
                    if (activeIndex !== item.index) {
                        setActive(item.index, false);
                    }
                });
                item.body.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape' && enabled) {
                        event.preventDefault();
                        userActivated = false;
                        activeIndex = -1;
                        refreshStates({ focusActive: false });
                    }
                });
            }
        });

        if (addNextButton) {
            addNextButton.addEventListener('click', function () {
                if (!enabled) {
                    showNextQuestion();
                    return;
                }

                var currentItem = activeIndex >= 0 && activeIndex < visibleCount ? items[activeIndex] : null;
                if (currentItem && !validateItem(currentItem, { showErrors: true })) {
                    focusFirstField(currentItem);
                    updateActionButtons();
                    return;
                }
                showNextQuestion();
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

(function () {
    var forms = Array.from(document.querySelectorAll('[data-recovery-questions-form]'));
    if (!forms.length) {
        return;
    }

    var modal = document.querySelector('[data-profile-recovery-unlock-modal]');
    if (!modal) {
        return;
    }

    var passwordInput = modal.querySelector('#recoveryUnlockPassword');
    var warning = modal.querySelector('[data-recovery-unlock-warning]');
    var message = modal.querySelector('[data-recovery-unlock-message]');
    var confirmButton = modal.querySelector('[data-recovery-unlock-confirm]');
    var closeButtons = Array.from(modal.querySelectorAll('[data-recovery-unlock-close]'));
    var activeForm = null;

    function setLocked(form, locked) {
        if (!form) {
            return;
        }
        var lockScope = form.querySelector('[data-recovery-lock-scope]');
        var lockBanner = form.querySelector('[data-recovery-lock-banner]');
        var questionsContainer = form.querySelector('[data-security-questions]');
        if (questionsContainer) {
            questionsContainer.classList.toggle('security-questions--locked', locked);
        }
        if (lockBanner) {
            lockBanner.hidden = !locked;
        }
        if (lockScope) {
            Array.from(lockScope.querySelectorAll('input, select, textarea, button')).forEach(function (field) {
                if (field.closest('[data-recovery-lock-exempt]')) {
                    return;
                }
                field.disabled = locked;
                if (locked) {
                    field.setAttribute('aria-disabled', 'true');
                } else {
                    field.removeAttribute('aria-disabled');
                }
            });
        }
        form.dataset.recoveryUnlocked = locked ? 'false' : 'true';
    }

    function openModal(form) {
        activeForm = form;
        if (message && form && form.dataset.recoveryUnlockMessage) {
            message.textContent = form.dataset.recoveryUnlockMessage;
        }
        if (warning) {
            warning.hidden = true;
            warning.textContent = '';
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        modal.removeAttribute('hidden');
        if (passwordInput) {
            passwordInput.focus();
        }
    }

    function closeModal() {
        modal.setAttribute('hidden', '');
        if (passwordInput) {
            passwordInput.value = '';
        }
        activeForm = null;
        if (warning) {
            warning.hidden = true;
            warning.textContent = '';
        }
    }

    closeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            closeModal();
        });
    });

    if (confirmButton) {
        confirmButton.addEventListener('click', function () {
            if (!activeForm) {
                closeModal();
                return;
            }
            var value = passwordInput ? passwordInput.value.trim() : '';
            if (!value) {
                if (warning) {
                    warning.textContent = activeForm.dataset.recoveryUnlockRequired || 'Enter your password.';
                    warning.hidden = false;
                }
                if (passwordInput) {
                    passwordInput.focus();
                }
                return;
            }
            setLocked(activeForm, false);
            closeModal();
        });
    }

    forms.forEach(function (form) {
        var unlockButton = form.querySelector('[data-recovery-unlock]');
        if (unlockButton) {
            unlockButton.addEventListener('click', function () {
                openModal(form);
            });
        }
        var initialUnlocked = form.dataset.recoveryUnlocked === 'true';
        setLocked(form, !initialUnlocked);
    });
})();

(function () {
    var forms = Array.from(document.querySelectorAll('[data-recovery-questions-form]'));
    if (!forms.length) {
        return;
    }

    var modal = document.querySelector('[data-profile-recovery-modal]');
    if (!modal) {
        return;
    }

    var passwordInput = modal.querySelector('#recoveryConfirmPassword');
    var warning = modal.querySelector('[data-recovery-modal-warning]');
    var message = modal.querySelector('[data-recovery-modal-message]');
    var confirmButton = modal.querySelector('[data-recovery-modal-confirm]');
    var closeButtons = Array.from(modal.querySelectorAll('[data-recovery-modal-close]'));
    var activeForm = null;

    function openModal(form) {
        activeForm = form;
        if (message && form && form.dataset.recoveryConfirmMessage) {
            message.textContent = form.dataset.recoveryConfirmMessage;
        }
        if (warning) {
            warning.hidden = true;
            warning.textContent = '';
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        modal.removeAttribute('hidden');
        if (passwordInput) {
            passwordInput.focus();
        }
    }

    function closeModal() {
        modal.setAttribute('hidden', '');
        if (passwordInput) {
            passwordInput.value = '';
        }
        activeForm = null;
        if (warning) {
            warning.hidden = true;
            warning.textContent = '';
        }
    }

    closeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            closeModal();
        });
    });

    if (confirmButton) {
        confirmButton.addEventListener('click', function () {
            if (!activeForm) {
                closeModal();
                return;
            }
            var hiddenInput = activeForm.querySelector('input[name="Password"]');
            var value = passwordInput ? passwordInput.value.trim() : '';
            if (!value) {
                if (warning) {
                    warning.textContent = activeForm.dataset.recoveryPasswordRequired || 'Enter your password.';
                    warning.hidden = false;
                }
                if (passwordInput) {
                    passwordInput.focus();
                }
                return;
            }
            if (hiddenInput) {
                hiddenInput.value = value;
            }
            closeModal();
            activeForm.submit();
        });
    }

    forms.forEach(function (form) {
        form.addEventListener('submit', function (event) {
            var hiddenInput = form.querySelector('input[name="Password"]');
            var value = hiddenInput ? hiddenInput.value.trim() : '';
            if (value) {
                return;
            }
            event.preventDefault();
            openModal(form);
        });
    });
})();