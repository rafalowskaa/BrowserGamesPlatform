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
            sectionButtons.forEach((btn) => btn.classList.remove('is-active'));
            button.classList.add('is-active');
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

    const trendingUrl = root.getAttribute('data-trending-url');
    const lookupUrl = root.getAttribute('data-game-lookup-url');
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
        const titleInput = featuredSection.querySelector('[data-featured-title-input]');
        const slugInput = featuredSection.querySelector('[data-featured-slug-input]');
        const gameIdInput = featuredSection.querySelector('[data-featured-game-id]');
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

        const applyFeaturedGame = (game) => {
            if (!game) {
                return;
            }
            if (gameIdInput) {
                gameIdInput.value = game.id ?? '';
            }
            if (titleInput) {
                titleInput.value = game.title ?? '';
            }
            if (slugInput) {
                slugInput.value = game.slug ?? '';
            }
            if (titleOutput) {
                titleOutput.textContent = game.title ?? '';
            }
            if (slugOutput) {
                slugOutput.textContent = game.slug ?? '';
            }

            const newDescription = game.description || game.excerpt || '';
            if (descriptionInput && !descriptionInput.value) {
                descriptionInput.value = newDescription;
            }
            updateDescriptionPreview();
            setCoverImage(game.coverImagePath);
        };

        let trendingGames = null;

        const getTrendingGames = async () => {
            if (trendingGames || !trendingUrl) {
                return trendingGames ?? [];
            }
            const response = await fetch(trendingUrl, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Trending request failed');
            }
            const payload = await response.json();
            trendingGames = Array.isArray(payload) ? payload : [];
            return trendingGames;
        };

        const fetchGameBySlug = async (slug) => {
            if (!lookupUrl || !slug) {
                return null;
            }
            const response = await fetch(`${lookupUrl}${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Lookup failed');
            }
            const payload = await response.json();
            return {
                id: payload.id,
                title: payload.title,
                slug: payload.slug,
                description: payload.description,
                coverImagePath: payload.coverImagePath
            };
        };

        randomButton?.addEventListener('click', async () => {
            try {
                randomButton.disabled = true;
                const games = await getTrendingGames();
                if (!games.length) {
                    throw new Error('no-games');
                }
                const index = Math.floor(Math.random() * games.length);
                applyFeaturedGame(games[index]);
            } catch (error) {
                if (randomError) {
                    window.alert(randomError);
                }
                console.error(error);
            } finally {
                randomButton.disabled = false;
            }
        });
        replaceButton?.addEventListener('click', async () => {
            const slug = window.prompt(slugPrompt)?.trim();
            if (!slug) {
                return;
            }
            try {
                replaceButton.disabled = true;
                const game = await fetchGameBySlug(slug);
                if (!game) {
                    throw new Error('not-found');
                }
                applyFeaturedGame(game);
            } catch (error) {
                if (featuredError) {
                    window.alert(featuredError);
                }
                console.error(error);
            } finally {
                replaceButton.disabled = false;
            }
        });
    }
    

    root.querySelectorAll('[data-admin-toast]').forEach((toast) => {
        setTimeout(() => toast.remove(), 5000);
    });
})();