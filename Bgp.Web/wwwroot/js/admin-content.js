(() => {
    const root = document.querySelector('[data-admin-content-root]');
    if (!root) {
        return;
    }

    const scrollButtons = root.querySelectorAll('[data-admin-scroll]');
    const sections = root.querySelectorAll('.admin-editor-section');
    const navMap = new Map();

    scrollButtons.forEach((button) => {
        const targetSelector = button.getAttribute('data-admin-scroll');
        if (!targetSelector) {
            return;
        }

        navMap.set(targetSelector, button);

        button.addEventListener('click', () => {
            const target = root.querySelector(targetSelector);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            scrollButtons.forEach((btn) => btn.classList.remove('is-active'));
            button.classList.add('is-active');
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }
            const id = `#${entry.target.id}`;
            const navButton = navMap.get(id);
            if (!navButton) {
                return;
            }
            scrollButtons.forEach((btn) => btn.classList.remove('is-active'));
            navButton.classList.add('is-active');
        });
    }, { rootMargin: '-40% 0px -55% 0px' });

    sections.forEach((section) => observer.observe(section));

    const inlineInputs = root.querySelectorAll('[data-inline-input]');
    inlineInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
            return;
        }

        if (input.hasAttribute('readonly')) {
            input.dataset.originalValue = input.value;
            input.addEventListener('click', () => enterEdit(input));
            input.addEventListener('focus', () => enterEdit(input));
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    input.value = input.dataset.originalValue ?? input.value;
                    exitEdit(input);
                }

                if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    if (input.form) {
                        input.form.requestSubmit();
                    }
                }
            });
            input.addEventListener('blur', () => {
                input.dataset.originalValue = input.value;
                exitEdit(input);
            });
        }
    });

    function enterEdit(element) {
        if (element.readOnly) {
            element.readOnly = false;
            element.classList.add('is-editing');
            element.setSelectionRange(element.value.length, element.value.length);
        }
    }

    function exitEdit(element) {
        if (!element.readOnly) {
            element.readOnly = true;
            element.classList.remove('is-editing');
        }
    }

    root.querySelectorAll('[data-status-toggle]').forEach((select) => {
        select.addEventListener('change', () => {
            const form = select.closest('form');
            const hidden = form?.querySelector('[data-status-input]');
            if (!hidden) {
                return;
            }

            hidden.value = select.value === 'active' ? 'true' : 'false';
        });
    });

    const updateSortOrder = (list) => {
        const items = list.querySelectorAll('[data-dnd-item]');
        items.forEach((item, index) => {
            item.querySelectorAll('.admin-sort-input').forEach((input) => {
                input.value = (index + 1).toString();
            });
            const indicator = item.querySelector('.admin-order-indicator');
            if (indicator) {
                indicator.textContent = `Kolejność ${index + 1}`;
            }
        });
    };

    root.querySelectorAll('[data-dnd-list]').forEach((list) => {
        let draggedItem = null;

        list.querySelectorAll('[data-dnd-item]').forEach((item) => {
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (event) => {
                const handle = event.target instanceof HTMLElement ? event.target.closest('[data-dnd-handle]') : null;
                if (!handle) {
                    event.preventDefault();
                    return;
                }
                draggedItem = item;
                item.classList.add('is-dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('is-dragging');
                draggedItem = null;
            });
        });

        list.addEventListener('dragover', (event) => {
            if (!draggedItem) {
                return;
            }
            event.preventDefault();
            const target = event.target instanceof HTMLElement ? event.target.closest('[data-dnd-item]') : null;
            if (!target || target === draggedItem || target.parentElement !== list) {
                return;
            }

            const rect = target.getBoundingClientRect();
            const shouldInsertAfter = (event.clientY - rect.top) > rect.height / 2;
            if (shouldInsertAfter) {
                target.after(draggedItem);
            }
            else {
                target.before(draggedItem);
            }
        });

        list.addEventListener('drop', (event) => {
            event.preventDefault();
            if (draggedItem) {
                draggedItem.classList.remove('is-dragging');
            }
            updateSortOrder(list);
            draggedItem = null;
        });

        updateSortOrder(list);
    });

    const previewFrame = root.querySelector('[data-preview-frame]');
    const previewButtons = root.querySelectorAll('[data-preview-mode]');
    previewButtons.forEach((button) => {
        button.addEventListener('click', () => {
            previewButtons.forEach((btn) => btn.classList.remove('is-active'));
            button.classList.add('is-active');
            const mode = button.getAttribute('data-preview-mode') || 'mobile';
            previewFrame?.setAttribute('data-device', mode === 'desktop' ? 'desktop' : 'mobile');
        });
    });

    root.querySelectorAll('[data-admin-toast]').forEach((toast) => {
        setTimeout(() => toast.remove(), 5000);
    });
})();