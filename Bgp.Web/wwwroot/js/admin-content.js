(() => {
    const root = document.querySelector('[data-admin-content-root]');
    if (!root) {
        return;
    }

    const sectionButtons = root.querySelectorAll('[data-admin-section-button]');
    const sections = root.querySelectorAll('[data-admin-section]');

    const activateSection = (targetSelector) => {
        sections.forEach((section) => {
            const matches = `#${section.id}` === targetSelector;
            section.hidden = !matches;
            section.classList.toggle('is-active', matches);
        });
    };

    sectionButtons.forEach((button, index) => {

        button.addEventListener('click', () => {
            sectionButtons.forEach((btn) => btn.classList.remove('is-active', 'active'));
            button.classList.add('is-active', 'active');
            const targetSelector = button.getAttribute('data-admin-section-button');
            if (targetSelector) {
                activateSection(targetSelector);
            }
           
        });
   

        if (index === 0) {
            const initialTarget = button.getAttribute('data-admin-section-button');
            if (initialTarget) {
                activateSection(initialTarget);
            }
        }
    });

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
            const handle = item.querySelector('[data-dnd-handle]');
            const enableDrag = () => {
                item.dataset.dndReady = 'true';
            };
            const disableDrag = () => {
                delete item.dataset.dndReady;
            };

            handle?.addEventListener('pointerdown', enableDrag);
            handle?.addEventListener('pointerup', disableDrag);
            handle?.addEventListener('pointerleave', disableDrag);
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (event) => {
                if (item.dataset.dndReady !== 'true') {
                    event.preventDefault();
                    return;
                }
                disableDrag();
                draggedItem = item;
                item.classList.add('is-dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('is-dragging');
                draggedItem = null;
                disableDrag();
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

    const slugPrompt = root.getAttribute('data-featured-slug-prompt') || '';
    const featuredError = root.getAttribute('data-featured-error') || '';
    const randomError = root.getAttribute('data-featured-random-error') || '';
    const placeholderImage = root.getAttribute('data-featured-placeholder') || '';

    const featuredSection = root.querySelector('[data-featured-section]');
    if (featuredSection) {
        const cover = featuredSection.querySelector('[data-featured-cover]');
        const slugOutput = featuredSection.querySelector('[data-featured-slug]');
        const titleOutput = featuredSection.querySelector('[data-featured-title-display]');
        const descriptionPreview = featuredSection.querySelector('[data-featured-preview-description]');
        const descriptionInput = featuredSection.querySelector('textarea[name="Description"]');
        const slugInput = featuredSection.querySelector('[data-featured-slug-input]');
        const selectInput = featuredSection.querySelector('[data-featured-select]');
        const randomButton = featuredSection.querySelector('[data-featured-random]');
        const replaceButton = featuredSection.querySelector('[data-featured-replace]');

        const updateDescriptionPreview = () => {
            if (!descriptionPreview) {
                return;
            }
            const value = descriptionInput?.value?.trim();
            descriptionPreview.textContent = value || descriptionInput?.getAttribute('placeholder') || '';
        };

        descriptionInput?.addEventListener('input', updateDescriptionPreview);
        updateDescriptionPreview();

        const setCoverImage = (imagePath) => {
            const url = imagePath || placeholderImage;
            if (cover && url) {
                cover.style.backgroundImage = `url('${url}')`;
            }
        };

        const getOptionData = (option) => {
            if (!(option instanceof HTMLOptionElement)) {
                return null;
            }
            return {
                id: option.value,
                title: option.getAttribute('data-title') || option.textContent || '',
                slug: option.getAttribute('data-slug') || '',
                description: option.getAttribute('data-description') || '',
                coverImagePath: option.getAttribute('data-cover') || ''
            };
        };

        const applyOption = (option) => {
            const data = getOptionData(option);
            if (!data) {
                return;
            }
            if (selectInput && option?.value) {
                selectInput.value = option.value;
            }
            if (slugInput) {
                slugInput.value = data.slug || '';
            }
            if (titleOutput) {
                titleOutput.textContent = data.title || '';
            }
            if (slugOutput) {
                slugOutput.textContent = data.slug || '';
            }

            if (descriptionInput && !descriptionInput.value) {
                descriptionInput.value = data.description || '';
            }
            updateDescriptionPreview();
            setCoverImage(data.coverImagePath);
        };

        selectInput?.addEventListener('change', () => {
            const option = selectInput.selectedOptions[0];
            applyOption(option);
        });

        randomButton?.addEventListener('click', () => {
            if (!selectInput) {
                return;
            }
            const options = Array.from(selectInput.options).filter((option) => option.value);
            if (!options.length) {
                if (randomError) {
                    window.alert(randomError);
                }
                return;
            }
            const index = Math.floor(Math.random() * options.length);
            applyOption(options[index]);
        });

        replaceButton?.addEventListener('click', () => {
            if (!selectInput) {
                return;
            }
            const slugValue = window.prompt(slugPrompt)?.trim().toLowerCase();
            if (!slugValue) {
                return;
            }
            const match = Array.from(selectInput.options).find((option) => {
                const optionSlug = option.getAttribute('data-slug') || '';
                return optionSlug.toLowerCase() === slugValue;
            });
            if (!match) {
                if (featuredError) {
                    window.alert(featuredError);
                }
                return;
            }
            applyOption(match);
        });

        if (selectInput) {
            const selected = selectInput.selectedOptions[0];
            if (selected) {
                applyOption(selected);
            }
        }
    }
    

    root.querySelectorAll('[data-admin-toast]').forEach((toast) => {
        setTimeout(() => toast.remove(), 5000);
    });
})();