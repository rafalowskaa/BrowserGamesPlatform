(function () {
    document.addEventListener('DOMContentLoaded', function () {
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
                }
            };

            setupModalClose(editModal, resetEditForm);

            editButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const userId = button.getAttribute('data-user-id') || '';
                    const displayName = button.getAttribute('data-user-display-name') || '';
                    const email = button.getAttribute('data-user-email') || '';
                    const accessLevel = button.getAttribute('data-user-access') || 'User';

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
                        accessInput.value = accessLevel;
                    }

                    openModal(editModal);
                });
            });
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
    });
})();