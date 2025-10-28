(function () {
    const init = () => {
        const editModal = document.getElementById('userEditModal');
        const blockModal = document.getElementById('userBlockModal');

        const openModal = (modal) => {
            if (!modal) {
                return;
            }

            modal.removeAttribute('hidden');
        };

        const closeModal = (modal) => {
            if (!modal) {
                return;
            }

            modal.setAttribute('hidden', '');
        };

        const setupModalClose = (modal, resetCallback) => {
            if (!modal) {
                return;
            }

            const closeTriggers = modal.querySelectorAll('[data-modal-close]');
            closeTriggers.forEach((trigger) => {
                trigger.addEventListener('click', () => {
                    if (typeof resetCallback === 'function') {
                        resetCallback();
                    }
                    closeModal(modal);
                });
            });
        };

        const editForm = document.getElementById('userEditForm');
        const editButtons = document.querySelectorAll('[data-user-edit]');

        if (editModal && editForm && editButtons.length > 0) {
            const idInput = editForm.querySelector('[data-modal-input="id"]');
            const nameInput = editForm.querySelector('[data-modal-input="displayName"]');
            const emailInput = editForm.querySelector('[data-modal-input="email"]');
            const accessInput = editForm.querySelector('[data-modal-input="access"]');
            const roleInfoMessage = editModal.querySelector('[data-role-info]');

            const resetEditForm = () => {
                if (idInput) {
                    idInput.value = '';
                }
                if (nameInput) {
                    nameInput.value = '';
                }
                if (emailInput) {
                    emailInput.value = '';
                }
                if (accessInput) {
                    accessInput.value = 'User';
                    accessInput.classList.remove('modal-dialog__input--readonly');
                    Array.from(accessInput.options).forEach((option) => {
                        option.disabled = false;
                    });
                }
                if (roleInfoMessage) {
                    roleInfoMessage.hidden = true;
                }
            };

            setupModalClose(editModal, resetEditForm);

            editButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const userId = button.getAttribute('data-user-id') || '';
                    const displayName = button.getAttribute('data-user-display-name') || '';
                    const email = button.getAttribute('data-user-email') || '';
                    const accessLevel = button.getAttribute('data-user-access') || 'User';
                    const allowedAccess = button.getAttribute('data-user-access-allowed') || '';
                    const allowedAccessValues = allowedAccess
                        .split(',')
                        .map((value) => value.trim())
                        .filter((value) => value.length > 0);

                    if (idInput) {
                        idInput.value = userId;
                    }
                    if (nameInput) {
                        nameInput.value = displayName;
                        nameInput.focus();
                    }
                    if (emailInput) {
                        emailInput.value = email;
                    }
                    if (accessInput) {
                        const options = Array.from(accessInput.options);
                        const hasRestrictions = allowedAccessValues.length > 0;

                        options.forEach((option) => {
                            if (hasRestrictions) {
                                option.disabled = !allowedAccessValues.includes(option.value);
                            }
                            else {
                                option.disabled = false;
                            }
                        });

                        let nextAccessValue = accessLevel;
                        if (hasRestrictions && !allowedAccessValues.includes(nextAccessValue)) {
                            nextAccessValue = allowedAccessValues[0] || nextAccessValue;
                        }

                        accessInput.value = nextAccessValue;

                        const isLocked = hasRestrictions && allowedAccessValues.length <= 1;
                        if (isLocked) {
                            accessInput.classList.add('modal-dialog__input--readonly');
                            if (roleInfoMessage) {
                                roleInfoMessage.hidden = false;
                            }
                        }
                        else {
                            accessInput.classList.remove('modal-dialog__input--readonly');
                            if (roleInfoMessage) {
                                roleInfoMessage.hidden = true;
                            }
                        }
                    }

                    openModal(editModal);
                });
            });
        }

        const adminSearchForm = document.querySelector('form.admin-search');
        if (adminSearchForm) {
            const submitButton = adminSearchForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (typeof adminSearchForm.requestSubmit === 'function') {
                        adminSearchForm.requestSubmit(submitButton);
                    }
                    else {
                        adminSearchForm.submit();
                    }
                });
            }
        }

        const blockForm = document.getElementById('userBlockForm');
        const blockButtons = document.querySelectorAll('[data-user-block]');

        if (blockModal && blockForm && blockButtons.length > 0) {
            const idInput = blockForm.querySelector('[data-modal-input="id"]');
            const reasonInput = blockForm.querySelector('[data-modal-input="reason"]');
            const untilInput = blockForm.querySelector('[data-modal-input="until"]');
            const messageElement = blockForm.querySelector('[data-block-message]');
            const messageTemplate = messageElement ? messageElement.getAttribute('data-template') || '' : '';

            const resetBlockForm = () => {
                if (idInput) {
                    idInput.value = '';
                }
                if (reasonInput) {
                    reasonInput.value = '';
                }
                if (untilInput) {
                    untilInput.value = '';
                }
                if (messageElement) {
                    messageElement.textContent = '';
                }
            };

            setupModalClose(blockModal, resetBlockForm);

            blockButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const userId = button.getAttribute('data-user-id') || '';
                    const displayName = button.getAttribute('data-user-display-name') || '';

                    if (idInput) {
                        idInput.value = userId;
                    }
                    if (reasonInput) {
                        reasonInput.value = '';
                        reasonInput.focus();
                    }
                    if (untilInput) {
                        untilInput.value = '';
                    }
                    if (messageElement) {
                        if (messageTemplate && messageTemplate.includes('{0}')) {
                            messageElement.textContent = messageTemplate.replace('{0}', displayName);
                        }
                        else {
                            messageElement.textContent = displayName;
                        }
                    }

                    openModal(blockModal);
                });
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    }
    else {
        init();
    }
})();