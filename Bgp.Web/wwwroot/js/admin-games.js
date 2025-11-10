(function () {
    const root = document.getElementById('admin-games-app');
    if (!root) {
        return;
    }

    const toastContainer = document.getElementById('toast-stack');

    function parseJson(value, fallback) {
        if (!value) {
            return fallback;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('Unable to parse JSON dataset', error);
            return fallback;
        }
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function showToast(message, variant = 'success') {
        if (!message || !toastContainer) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast--${variant}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        window.setTimeout(() => {
            toast.style.opacity = '0';
            window.setTimeout(() => toast.remove(), 300);
        }, 4200);
    }

    function isFormElement(element) {
        if (!element) {
            return false;
        }

        const tag = element.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
    }
    class ChipsField {
        constructor(container, options, labels, onChange) {
            this.container = container;
            this.options = options || [];
            this.optionMap = new Map(this.options.map(option => [String(option.value), option]));
            this.labels = labels;
            this.onChange = onChange;
            this.hiddenName = container.dataset.hiddenName;
            this.input = container.querySelector('[data-chips-input]');
            this.suggestions = container.querySelector('[data-chips-suggestions]');
            this.proposedList = container.querySelector('[data-chips-list="proposed"]');
            this.publishedList = container.querySelector('[data-chips-list="published"]');
            this.hiddenContainer = container.querySelector('[data-chips-hidden]');
            this.undoButton = container.querySelector('[data-chips-undo]');
            this.redoButton = container.querySelector('[data-chips-redo]');
            this.state = new Map();
            this.history = [];
            this.future = [];
            this.bind();
        }

        bind() {
            this.container.addEventListener('click', (event) => {
                const button = event.target.closest('[data-chip-action]');
                if (!button) {
                    return;
                }

                const chip = button.closest('.chip');
                if (!chip) {
                    return;
                }

                const value = Number(chip.dataset.value);
                const entry = this.state.get(value);
                if (!entry) {
                    return;
                }

                const action = button.dataset.chipAction;
                this.updateState(() => {
                    if (action === 'accept') {
                        entry.status = 'published';
                        if (entry.origin === 'proposed') {
                            entry.wasProposed = true;
                        }
                    } else if (action === 'reject') {
                        entry.status = 'rejected';
                    } else if (action === 'remove') {
                        if (entry.origin === 'manual') {
                            this.state.delete(value);
                        } else if (entry.origin === 'proposed') {
                            entry.status = 'proposed';
                        } else {
                            entry.status = 'rejected';
                        }
                    } else if (action === 'restore') {
                        if (entry.origin === 'published') {
                            entry.status = 'published';
                        } else {
                            entry.status = 'proposed';
                        }
                    }
                });
            });

            if (this.undoButton) {
                this.undoButton.addEventListener('click', () => this.undo());
            }
            if (this.redoButton) {
                this.redoButton.addEventListener('click', () => this.redo());
            }

            if (this.input) {
                this.input.addEventListener('input', () => this.populateSuggestions());
                this.input.addEventListener('focus', () => this.populateSuggestions());
                this.input.addEventListener('blur', () => {
                    window.setTimeout(() => this.hideSuggestions(), 100);
                });
                this.input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        const first = this.suggestions?.querySelector('button');
                        if (first) {
                            first.click();
                        }
                    }
                });
            }

            if (this.suggestions) {
                this.suggestions.addEventListener('click', (event) => {
                    const button = event.target.closest('button');
                    if (!button) {
                        return;
                    }

                    const value = Number(button.dataset.value);
                    this.addValue(value);
                    if (this.input) {
                        this.input.value = '';
                        this.input.focus();
                    }
                    this.hideSuggestions();
                });
            }
        }

        createEntry(value, status, origin) {
            const option = this.optionMap.get(String(value));
            return {
                value,
                label: option?.label ?? `#${value}`,
                status,
                origin,
                wasProposed: origin === 'proposed'
            };
        }

        setState({ published = [], proposed = [], rejected = [] }) {
            this.state = new Map();
            published.forEach(value => {
                this.state.set(value, this.createEntry(value, 'published', 'published'));
            });

            proposed.forEach(value => {
                const entry = this.state.get(value);
                if (entry) {
                    entry.wasProposed = true;
                } else {
                    this.state.set(value, this.createEntry(value, 'proposed', 'proposed'));
                }
            });

            rejected.forEach(value => {
                const entry = this.state.get(value) ?? this.createEntry(value, 'rejected', 'proposed');
                entry.status = 'rejected';
                this.state.set(value, entry);
            });

            this.history = [];
            this.future = [];
            this.render();
        }

        addValue(value) {
            const entry = this.state.get(value);
            this.updateState(() => {
                if (entry) {
                    entry.status = 'published';
                    if (entry.origin === 'proposed') {
                        entry.wasProposed = true;
                    }
                } else {
                    this.state.set(value, this.createEntry(value, 'published', 'manual'));
                }
            });
        }

        updateState(mutator) {
            const before = this.serialize();
            mutator();
            const after = this.serialize();
            if (before === after) {
                return;
            }

            this.history.push(before);
            if (this.history.length > 40) {
                this.history.shift();
            }
            this.future = [];
            this.render();
        }

        undo() {
            if (!this.history.length) {
                return;
            }

            const previous = this.history.pop();
            const current = this.serialize();
            this.future.push(current);
            this.load(previous);
        }

        redo() {
            if (!this.future.length) {
                return;
            }

            const snapshot = this.future.pop();
            const current = this.serialize();
            this.history.push(current);
            this.load(snapshot);
        }

        load(snapshot) {
            try {
                const parsed = JSON.parse(snapshot);
                this.state = new Map(parsed.map(entry => [entry.value, entry]));
                this.render();
            } catch (error) {
                console.warn('Failed to restore chips state', error);
            }
        }

        serialize() {
            return JSON.stringify([...this.state.values()]);
        }

        render() {
            if (this.publishedList) {
                this.publishedList.innerHTML = '';
            }
            if (this.proposedList) {
                this.proposedList.innerHTML = '';
            }

            const entries = [...this.state.values()].sort((a, b) => a.label.localeCompare(b.label));
            entries.forEach(entry => {
                const chip = this.createChip(entry);
                if (entry.status === 'published') {
                    this.publishedList?.appendChild(chip);
                } else {
                    this.proposedList?.appendChild(chip);
                }
            });

            this.refreshHiddenInputs();
            this.refreshControls();
            if (typeof this.onChange === 'function') {
                this.onChange(this.getPublishedLabels());
            }
        }

        createChip(entry) {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.dataset.value = entry.value;
            chip.dataset.status = entry.status;
            chip.textContent = entry.label;

            if (entry.status === 'proposed') {
                chip.classList.add('badge-new');
                chip.appendChild(this.createBadge(this.labels.newLabel));
            } else if (entry.status === 'rejected') {
                if (entry.origin === 'published') {
                    chip.classList.add('badge-removed');
                    chip.appendChild(this.createBadge(this.labels.removedLabel));
                } else {
                    chip.classList.add('badge-rejected');
                    chip.appendChild(this.createBadge(this.labels.rejectedLabel));
                }
            } else if (entry.origin === 'proposed' && entry.wasProposed) {
                chip.classList.add('badge-new');
                chip.appendChild(this.createBadge(this.labels.newLabel));
            } else if (entry.origin === 'manual') {
                chip.appendChild(this.createBadge(this.labels.addedLabel));
            }

            const actions = document.createElement('span');
            actions.className = 'chip-actions';
            if (entry.status === 'published') {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.dataset.chipAction = 'remove';
                remove.title = 'Usuń';
                remove.textContent = '✕';
                actions.appendChild(remove);
            } else if (entry.status === 'proposed') {
                const accept = document.createElement('button');
                accept.type = 'button';
                accept.dataset.chipAction = 'accept';
                accept.title = 'Akceptuj';
                accept.textContent = '✓';
                const reject = document.createElement('button');
                reject.type = 'button';
                reject.dataset.chipAction = 'reject';
                reject.title = 'Odrzuć';
                reject.textContent = '✕';
                actions.append(accept, reject);
            } else if (entry.status === 'rejected') {
                const restore = document.createElement('button');
                restore.type = 'button';
                restore.dataset.chipAction = 'restore';
                restore.title = 'Przywróć';
                restore.textContent = '↺';
                actions.appendChild(restore);
            }

            if (actions.children.length) {
                chip.appendChild(actions);
            }

            return chip;
        }

        createBadge(label) {
            const badge = document.createElement('span');
            badge.className = 'chip-badge';
            badge.textContent = label || '';
            return badge;
        }

        populateSuggestions() {
            if (!this.input || !this.suggestions) {
                return;
            }

            const term = this.input.value.trim().toLowerCase();
            const options = this.options
                .filter(option => {
                    const entry = this.state.get(Number(option.value));
                    const unavailable = entry && (entry.status === 'published' || entry.status === 'proposed');
                    if (unavailable) {
                        return false;
                    }
                    return !term || option.label.toLowerCase().includes(term);
                })
                .slice(0, 6);

            this.suggestions.innerHTML = '';
            if (!options.length) {
                this.hideSuggestions();
                return;
            }

            options.forEach(option => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.value = option.value;
                button.textContent = option.label;
                this.suggestions.appendChild(button);
            });

            this.suggestions.classList.add('is-visible');
        }

        hideSuggestions() {
            this.suggestions?.classList.remove('is-visible');
        }

        refreshHiddenInputs() {
            if (!this.hiddenContainer) {
                return;
            }

            this.hiddenContainer.innerHTML = '';
            this.getPublishedValues().forEach(value => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = this.hiddenName;
                input.value = value;
                this.hiddenContainer.appendChild(input);
            });
        }

        refreshControls() {
            if (this.undoButton) {
                this.undoButton.disabled = this.history.length === 0;
            }
            if (this.redoButton) {
                this.redoButton.disabled = this.future.length === 0;
            }
        }

        getPublishedValues() {
            return [...this.state.values()].filter(entry => entry.status === 'published').map(entry => entry.value);
        }

        getPublishedLabels() {
            return [...this.state.values()].filter(entry => entry.status === 'published').map(entry => entry.label);
        }

        getProposedValues() {
            return [...this.state.values()].filter(entry => entry.status === 'proposed').map(entry => entry.value);
        }

        getRejectedValues() {
            return [...this.state.values()].filter(entry => entry.status === 'rejected').map(entry => entry.value);
        }
    }
    class AdminGamesApp {
        constructor(rootElement) {
            this.root = rootElement;
            this.games = new Map();
            this.statusLabels = parseJson(this.root.dataset.statusLabels, {});
            this.categoryOptions = parseJson(this.root.dataset.categoryOptions, []);
            this.modeOptions = parseJson(this.root.dataset.modeOptions, []);
            this.labels = {
                saved: this.root.dataset.savedLabel || 'Zapisano',
                saving: this.root.dataset.savingLabel || 'Zapisywanie…',
                unsaved: this.root.dataset.unsavedLabel || 'Zmiany niezapisane',
                preview: this.root.dataset.previewLabel || 'Podgląd',
                reject: this.root.dataset.rejectLabel || 'Odrzuć',
                approve: this.root.dataset.approveLabel || 'Zatwierdź',
                edit: this.root.dataset.editLabel || 'Edytuj metadane',
                test: this.root.dataset.testLabel || 'Przetestuj grę',
                newLabel: this.root.dataset.newLabel || 'Nowe',
                rejectedLabel: this.root.dataset.rejectedLabel || 'Odrzucono',
                addedLabel: this.root.dataset.addedLabel || 'Dodano',
                removedLabel: this.root.dataset.removedLabel || 'Usunięto'
            };
            this.successMessage = this.root.dataset.successMessage;
            this.errorMessage = this.root.dataset.errorMessage;
            this.emptyLabel = this.root.dataset.emptyLabel || '';
            this.bulkBar = this.root.querySelector('[data-bulk-bar]');
            this.selectAll = this.root.querySelector('[data-select-all]');
            this.bulkApprove = this.root.querySelector('[data-bulk-approve]');
            this.bulkReject = this.root.querySelector('[data-bulk-reject]');
            this.bulkEdit = this.root.querySelector('[data-bulk-edit]');
            this.bulkCount = this.root.querySelector('[data-bulk-count]');
            this.list = this.root.querySelector('.admin-games__list');
            this.drawer = this.root.querySelector('[data-drawer]');
            this.previewSection = this.drawer?.querySelector('[data-drawer-preview]');
            this.editorSection = this.drawer?.querySelector('[data-drawer-editor]');
            this.metadataForm = this.drawer?.querySelector('[data-metadata-form]');
            this.previewApproveForm = this.drawer?.querySelector('[data-preview-approve]');
            this.rejectForm = this.drawer?.querySelector('[data-reject-form]');
            this.previewTestLink = this.drawer?.querySelector('[data-preview-test]');
            this.previewTitle = this.drawer?.querySelector('[data-preview-title]');
            this.previewSlug = this.drawer?.querySelector('[data-preview-slug]');
            this.previewOwner = this.drawer?.querySelector('[data-preview-owner]');
            this.previewStatus = this.drawer?.querySelector('[data-preview-status]');
            this.previewDescription = this.drawer?.querySelector('[data-preview-description]');
            this.previewTags = this.drawer?.querySelector('[data-preview-tags]');
            this.previewCover = this.drawer?.querySelector('[data-preview-cover]');
            this.summaryCover = this.drawer?.querySelector('[data-summary-cover]');
            this.summaryTitle = this.drawer?.querySelector('[data-summary-title]');
            this.summaryOwner = this.drawer?.querySelector('[data-summary-owner]');
            this.summaryCreated = this.drawer?.querySelector('[data-summary-created]');
            this.summaryStatus = this.drawer?.querySelector('[data-summary-status]');
            this.summaryCategories = this.drawer?.querySelector('[data-summary-categories]');
            this.summaryModes = this.drawer?.querySelector('[data-summary-modes]');
            this.actionStatus = this.drawer?.querySelector('[data-save-status]');
            this.saveButton = this.drawer?.querySelector('[data-save-button]');
            this.previewLink = this.drawer?.querySelector('[data-preview-link]');
            this.footerReject = this.drawer?.querySelector('[data-footer-reject]');
            this.cancelEdit = this.drawer?.querySelector('[data-cancel-edit]');
            this.openModerationButtons = this.drawer?.querySelectorAll('[data-open-moderation]');
            this.drawerCloseButtons = this.drawer?.querySelectorAll('[data-drawer-close]');
            this.fieldId = this.drawer?.querySelector('[data-field-id]');
            this.fieldTitle = this.drawer?.querySelector('[data-field-title]');
            this.fieldSlug = this.drawer?.querySelector('[data-field-slug]');
            this.fieldOwner = this.drawer?.querySelector('[data-field-owner]');
            this.fieldCover = this.drawer?.querySelector('[data-field-cover]');
            this.fieldDescription = this.drawer?.querySelector('[data-field-description]');
            this.fieldStatus = this.drawer?.querySelector('[data-field-status]');
            this.fieldNotes = this.drawer?.querySelector('[data-field-notes]');
            this.rejectNotes = this.drawer?.querySelector('[data-reject-notes]');
            this.tagsList = this.drawer?.querySelector('[data-tags-list]');
            this.accordion = this.drawer?.querySelector('[data-accordion]');
            this.antiForgeryField = this.root.dataset.antiForgeryField;
            this.antiForgeryToken = this.root.dataset.antiForgeryToken;
            this.currentGameId = null;
            this.isDirty = false;
            this.isSaving = false;
            this.isLoadingForm = false;
            this.categoriesField = null;
            this.modesField = null;
            this.activeRow = null;
            this.initializeGames(parseJson(this.root.dataset.games, []));
            this.setupChips();
            this.bind();
            this.showInitialToasts();
        }
        initializeGames(games) {
            games.forEach(game => {
                const normalized = {
                    ...game,
                    createdAtUtc: game.createdAtUtc ? new Date(game.createdAtUtc) : null,
                    categories: (game.categories || []).map(Number),
                    proposedCategories: (game.proposedCategories || []).map(Number),
                    rejectedCategories: [],
                    modes: (game.modes || []).map(Number),
                    proposedModes: (game.proposedModes || []).map(Number),
                    rejectedModes: [],
                    tags: (game.tags || []).map(tag => ({
                        id: tag.id,
                        value: tag.value,
                        isApproved: Boolean(tag.isApproved),
                        isPending: Boolean(tag.isPending)
                    }))
                };
                this.games.set(String(game.id), normalized);
            });
        }

        setupChips() {
            const labels = {
                newLabel: this.labels.newLabel,
                rejectedLabel: this.labels.rejectedLabel,
                addedLabel: this.labels.addedLabel,
                removedLabel: this.labels.removedLabel
            };

            const categoriesContainer = this.drawer?.querySelector('[data-chips-field="categories"]');
            if (categoriesContainer) {
                this.categoriesField = new ChipsField(categoriesContainer, this.categoryOptions, labels, () => this.onMetadataChanged());
            }

            const modesContainer = this.drawer?.querySelector('[data-chips-field="modes"]');
            if (modesContainer) {
                this.modesField = new ChipsField(modesContainer, this.modeOptions, labels, () => this.onMetadataChanged());
            }
        }

        bind() {
            this.list?.addEventListener('click', (event) => {
                const previewButton = event.target.closest('[data-preview-button]');
                if (previewButton) {
                    const row = previewButton.closest('[data-game-row]');
                    if (row) {
                        this.openPreview(row.dataset.gameId);
                    }
                    return;
                }

                const editButton = event.target.closest('[data-edit-button]');
                if (editButton) {
                    const row = editButton.closest('[data-game-row]');
                    if (row) {
                        this.openEditor(row.dataset.gameId);
                    }
                    return;
                }

                const checkbox = event.target.closest('[data-row-checkbox]');
                if (checkbox) {
                    this.updateBulkState();
                    return;
                }

                const row = event.target.closest('[data-game-row]');
                if (row && !event.target.closest('button') && !event.target.closest('a') && !event.target.closest('input')) {
                    this.openPreview(row.dataset.gameId);
                }
            });

            this.list?.addEventListener('change', (event) => {
                if (event.target.matches('[data-row-checkbox]')) {
                    this.updateBulkState();
                }
            });

            this.list?.addEventListener('focusin', (event) => {
                const row = event.target.closest('[data-game-row]');
                if (row) {
                    this.activeRow = row;
                }
            });

            this.selectAll?.addEventListener('change', () => {
                const checkboxes = this.list?.querySelectorAll('[data-row-checkbox]');
                checkboxes?.forEach(cb => {
                    cb.checked = this.selectAll.checked;
                });
                this.updateBulkState();
            });

            this.bulkApprove?.addEventListener('click', () => this.handleBulkAction('approve'));
            this.bulkReject?.addEventListener('click', () => this.handleBulkAction('reject'));
            this.bulkEdit?.addEventListener('click', () => this.handleBulkEdit());

            this.drawerCloseButtons?.forEach(button => button.addEventListener('click', () => this.closeDrawer()));
            this.footerReject?.addEventListener('click', () => this.openModeration());
            this.cancelEdit?.addEventListener('click', () => this.closeDrawer());
            this.openModerationButtons?.forEach(button => button.addEventListener('click', () => this.openModeration()));

            if (this.metadataForm) {
                this.metadataForm.addEventListener('submit', (event) => {
                    event.preventDefault();
                    this.saveMetadata();
                });

                this.metadataForm.addEventListener('input', (event) => {
                    if (event.target.name !== this.antiForgeryField) {
                        this.onMetadataChanged();
                    }
                });

                this.metadataForm.addEventListener('change', (event) => {
                    if (event.target.name !== this.antiForgeryField) {
                        this.onMetadataChanged();
                    }
                });
            }

            this.previewApproveForm?.addEventListener('submit', (event) => {
                event.preventDefault();
                this.processModeration('approve');
            });

            this.rejectForm?.addEventListener('submit', (event) => {
                event.preventDefault();
                this.processModeration('reject');
            });

            document.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    if (this.drawer?.classList.contains('is-open') && !this.previewSection?.hidden) {
                        return;
                    }
                    if (this.drawer?.classList.contains('is-open') && !this.editorSection?.hidden) {
                        event.preventDefault();
                        this.saveMetadata();
                    }
                } else if (event.key.toLowerCase() === 't') {
                    if (isFormElement(event.target)) {
                        return;
                    }
                    const row = this.activeRow;
                    const button = row?.querySelector('[data-test-button]');
                    if (button) {
                        event.preventDefault();
                        button.click();
                    }
                } else if (event.key === 'Escape') {
                    this.closeDrawer();
                }
            });

            if (this.accordion) {
                this.accordion.addEventListener('click', (event) => {
                    const trigger = event.target.closest('[data-accordion-trigger]');
                    if (!trigger) {
                        return;
                    }

                    const item = trigger.closest('[data-accordion-item]');
                    const panel = item?.querySelector('[data-accordion-panel]');
                    if (!panel) {
                        return;
                    }

                    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
                    this.closeAccordion();
                    if (!isOpen) {
                        trigger.setAttribute('aria-expanded', 'true');
                        panel.hidden = false;
                    }
                });
            }
        }

        showInitialToasts() {
            if (this.successMessage) {
                showToast(this.successMessage, 'success');
            }
            if (this.errorMessage) {
                showToast(this.errorMessage, 'error');
            }
        }
        closeAccordion() {
            this.accordion?.querySelectorAll('[data-accordion-trigger]').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
            this.accordion?.querySelectorAll('[data-accordion-panel]').forEach(panel => panel.hidden = true);
        }

        updateBulkState() {
            const checkboxes = [...this.list?.querySelectorAll('[data-row-checkbox]') || []];
            const selected = checkboxes.filter(cb => cb.checked);
            if (this.selectAll) {
                this.selectAll.checked = selected.length > 0 && selected.length === checkboxes.length;
                this.selectAll.indeterminate = selected.length > 0 && selected.length !== checkboxes.length;
            }
            const count = selected.length;
            if (this.bulkCount) {
                this.bulkCount.textContent = String(count);
            }
            const hasSelection = count > 0;
            if (this.bulkApprove) {
                this.bulkApprove.disabled = !hasSelection;
            }
            if (this.bulkReject) {
                this.bulkReject.disabled = !hasSelection;
            }
            if (this.bulkEdit) {
                this.bulkEdit.disabled = !hasSelection;
            }
        }

        handleBulkAction(action) {
            const ids = [...this.list?.querySelectorAll('[data-row-checkbox]:checked') || []].map(cb => cb.value);
            if (!ids.length) {
                return;
            }

            const processNext = () => {
                if (!ids.length) {
                    this.updateBulkState();
                    showToast(action === 'approve' ? 'Zatwierdzono zgłoszenia.' : 'Odrzucono zgłoszenia.', 'success');
                    return;
                }

                const id = ids.shift();
                this.processModeration(action, id).finally(processNext);
            };

            processNext();
        }

        handleBulkEdit() {
            const first = this.list?.querySelector('[data-row-checkbox]:checked');
            if (first) {
                this.openEditor(first.value);
            }
        }
        openPreview(gameId) {
            const game = this.games.get(String(gameId));
            if (!game || !this.drawer) {
                return;
            }

            this.drawer.classList.add('is-open');
            this.previewSection.hidden = false;
            this.editorSection.hidden = true;
            this.activeRow = this.list?.querySelector(`[data-game-row][data-game-id="${gameId}"]`);

            this.previewTitle.textContent = game.title;
            this.previewSlug.textContent = `Adres w katalogu: ${game.slug}`;
            this.previewOwner.textContent = `Autor: ${game.owner}`;
            this.previewStatus.textContent = this.statusLabels[game.status] || game.status;
            this.previewDescription.textContent = game.description || 'Brak opisu';
            this.previewTags.innerHTML = '';
            game.tags.forEach(tag => {
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = tag.value;
                if (tag.isPending) {
                    span.appendChild(this.createBadge(this.labels.newLabel));
                }
                this.previewTags.appendChild(span);
            });

            if (this.previewCover) {
                if (game.coverImagePath) {
                    this.previewCover.style.backgroundImage = `url('${game.coverImagePath}')`;
                } else {
                    this.previewCover.style.backgroundImage = 'none';
                }
            }

            if (this.previewTestLink) {
                this.previewTestLink.href = `/AdminUi/PlayGame/${game.id}`;
            }

            if (this.previewApproveForm) {
                const input = this.previewApproveForm.querySelector('input[name="id"]');
                if (input) {
                    input.value = game.id;
                }
            }

            if (this.rejectForm) {
                const input = this.rejectForm.querySelector('input[name="Id"]');
                if (input) {
                    input.value = game.id;
                }
                if (this.rejectNotes) {
                    this.rejectNotes.value = '';
                }
            }
        }

        openEditor(gameId) {
            const game = this.games.get(String(gameId));
            if (!game || !this.drawer) {
                return;
            }

            this.isLoadingForm = true;
            this.drawer.classList.add('is-open');
            this.previewSection.hidden = true;
            this.editorSection.hidden = false;
            this.activeRow = this.list?.querySelector(`[data-game-row][data-game-id="${gameId}"]`);
            this.currentGameId = String(gameId);

            if (this.fieldId) {
                this.fieldId.value = game.id;
            }
            if (this.fieldTitle) {
                this.fieldTitle.value = game.title;
            }
            if (this.fieldSlug) {
                this.fieldSlug.value = game.slug;
            }
            if (this.fieldOwner) {
                this.fieldOwner.value = game.owner;
            }
            if (this.fieldCover) {
                this.fieldCover.value = game.coverImagePath || '';
            }
            if (this.fieldDescription) {
                this.fieldDescription.value = game.description || '';
            }
            if (this.fieldStatus) {
                this.fieldStatus.value = game.status;
            }
            if (this.fieldNotes) {
                this.fieldNotes.value = game.moderationNotes || '';
            }
            if (this.rejectNotes) {
                this.rejectNotes.value = '';
            }
            if (this.previewLink) {
                this.previewLink.href = `/Games/Details/${game.slug}`;
            }
            if (this.previewTestLink) {
                this.previewTestLink.href = `/AdminUi/PlayGame/${game.id}`;
            }

            if (this.summaryCover) {
                if (game.coverImagePath) {
                    this.summaryCover.style.backgroundImage = `url('${game.coverImagePath}')`;
                } else {
                    this.summaryCover.style.backgroundImage = 'none';
                }
            }
            if (this.summaryTitle) {
                this.summaryTitle.textContent = game.title;
            }
            if (this.summaryOwner) {
                this.summaryOwner.textContent = game.owner;
            }
            if (this.summaryCreated) {
                this.summaryCreated.textContent = formatDate(game.createdAtUtc);
            }
            if (this.summaryStatus) {
                this.summaryStatus.textContent = this.statusLabels[game.status] || game.status;
            }

            this.categoriesField?.setState({
                published: game.categories,
                proposed: game.proposedCategories
            });
            this.modesField?.setState({
                published: game.modes,
                proposed: game.proposedModes
            });

            this.renderTags(game.tags);
            this.isLoadingForm = false;
            this.updateSummaries();
            this.setSaveStatus('saved');
            this.isDirty = false;
        }

        createBadge(label) {
            const badge = document.createElement('span');
            badge.className = 'chip-badge';
            badge.textContent = label || '';
            return badge;
        }

        renderTags(tags) {
            if (!this.tagsList) {
                return;
            }

            this.tagsList.innerHTML = '';
            if (!tags.length) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = 'Brak tagów.';
                this.tagsList.appendChild(empty);
                return;
            }
            tags.forEach(tag => {
                const label = document.createElement('label');
                label.className = 'option-chip';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = 'ApprovedTags';
                input.value = tag.id;
                input.checked = tag.isApproved;
                input.addEventListener('change', () => this.onMetadataChanged());
                const span = document.createElement('span');
                span.textContent = tag.value;
                label.append(input, span);
                if (tag.isPending) {
                    const badge = this.createBadge(this.labels.newLabel);
                    label.appendChild(badge);
                }
                this.tagsList.appendChild(label);
            });
        }

        updateSummaries() {
            if (!this.summaryCategories || !this.summaryModes) {
                return;
            }
            const categoryLabels = this.categoriesField ? this.categoriesField.getPublishedLabels() : [];
            const modeLabels = this.modesField ? this.modesField.getPublishedLabels() : [];
            this.summaryCategories.textContent = categoryLabels.length ? categoryLabels.join(', ') : this.emptyLabel;
            this.summaryModes.textContent = modeLabels.length ? modeLabels.join(', ') : this.emptyLabel;
        }
        setSaveStatus(state) {
            if (!this.actionStatus) {
                return;
            }

            if (state === 'saving') {
                this.actionStatus.textContent = this.labels.saving;
            } else if (state === 'dirty') {
                this.actionStatus.textContent = this.labels.unsaved;
            } else if (state === 'saved') {
                const time = new Date();
                const formatted = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(time);
                this.actionStatus.textContent = `${this.labels.saved} • ${formatted}`;
            }
        }

        onMetadataChanged() {
            if (this.isLoadingForm || this.isSaving) {
                return;
            }
            this.isDirty = true;
            this.setSaveStatus('dirty');
            this.updateSummaries();
        }
        async saveMetadata() {
            if (!this.metadataForm || !this.currentGameId) {
                return;
            }

            const formData = new FormData(this.metadataForm);
            this.setSaveStatus('saving');
            this.isSaving = true;

            try {
                const response = await fetch(this.metadataForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (!response.ok) {
                    throw new Error('Request failed');
                }

                const game = this.games.get(this.currentGameId);
                if (game) {
                    this.applyFormToGame(game);
                    this.updateRow(game);
                    this.updateSummaries();
                }

                this.isDirty = false;
                this.setSaveStatus('saved');
                showToast('Zapisano metadane.', 'success');
            } catch (error) {
                console.error('Failed to save metadata', error);
                this.setSaveStatus('dirty');
                showToast('Nie udało się zapisać zmian.', 'error');
            } finally {
                this.isSaving = false;
            }
        }

        applyFormToGame(game) {
            if (!this.metadataForm) {
                return;
            }

            game.title = this.fieldTitle?.value || game.title;
            game.slug = this.fieldSlug?.value || game.slug;
            game.coverImagePath = this.fieldCover?.value || null;
            game.description = this.fieldDescription?.value || null;
            if (this.categoriesField) {
                game.categories = this.categoriesField.getPublishedValues();
                game.proposedCategories = this.categoriesField.getProposedValues();
                game.rejectedCategories = this.categoriesField.getRejectedValues();
            }
            if (this.modesField) {
                game.modes = this.modesField.getPublishedValues();
                game.proposedModes = this.modesField.getProposedValues();
                game.rejectedModes = this.modesField.getRejectedValues();
            }
            game.tags = [...this.tagsList?.querySelectorAll('label') || []].map(label => {
                const input = label.querySelector('input[type="checkbox"]');
                const nameSpan = label.querySelector('span');
                const value = nameSpan?.textContent || '';
                const id = input?.value;
                const original = (game.tags || []).find(tag => String(tag.id) === id) || { id, value };
                return {
                    ...original,
                    id: id,
                    value: value,
                    isApproved: Boolean(input?.checked),
                    isPending: original.isPending
                };
            });
        }
        updateRow(game) {
            const row = this.list?.querySelector(`[data-game-row][data-game-id="${game.id}"]`);
            if (!row) {
                return;
            }

            const titleCell = row.querySelector('.cell--title');
            if (titleCell) {
                const title = titleCell.querySelector('.game-title');
                const slug = titleCell.querySelectorAll('.game-meta')[0];
                const statusLine = titleCell.querySelectorAll('.game-meta')[1];
                if (title) {
                    title.textContent = game.title;
                }
                if (slug) {
                    slug.textContent = game.slug;
                }
                if (statusLine) {
                    statusLine.textContent = this.statusLabels[game.status] || game.status;
                }
            }

            const statusCell = row.querySelector('.cell--status .status-pill');
            if (statusCell) {
                statusCell.textContent = this.statusLabels[game.status] || game.status;
                statusCell.className = `status-pill status-${String(game.status).toLowerCase()}`;
            }

            const diffCell = row.querySelector('.cell--diff');
            if (diffCell) {
                const diffCount = diffCell.querySelector('[data-diff-count]');
                const diffContainer = diffCell.querySelector('.diff-chips');
                const chips = this.calculateDiffChips(game);
                if (diffCount) {
                    diffCount.textContent = String(chips.length);
                }
                if (diffContainer) {
                    diffContainer.innerHTML = '';
                    chips.forEach(chip => {
                        const span = document.createElement('span');
                        span.className = `diff-chip diff-chip--${chip.kind}`;
                        span.textContent = chip.label;
                        diffContainer.appendChild(span);
                    });
                }
            }
        }

        calculateDiffChips(game) {
            const chips = [];
            const categoriesMap = new Map(this.categoryOptions.map(opt => [Number(opt.value), opt.label]));
            const modesMap = new Map(this.modeOptions.map(opt => [Number(opt.value), opt.label]));

            const currentCategories = new Set(game.categories || []);
            const proposedCategories = new Set(game.proposedCategories || []);
            const rejectedCategories = new Set(game.rejectedCategories || []);
            const currentModes = new Set(game.modes || []);
            const proposedModes = new Set(game.proposedModes || []);
            const rejectedModes = new Set(game.rejectedModes || []);

            proposedCategories.forEach(value => {
                if (!currentCategories.has(value)) {
                    chips.push({ label: `+ ${categoriesMap.get(value) || value}`, kind: 'added' });
                }
            });
            const removalSet = new Set();
            currentCategories.forEach(value => {
                if (!proposedCategories.has(value) && proposedCategories.size > 0) {
                    const label = `- ${categoriesMap.get(value) || value}`;
                    chips.push({ label, kind: 'removed' });
                    removalSet.add(value);
                }
            });
            rejectedCategories.forEach(value => {
                if (!removalSet.has(value)) {
                    chips.push({ label: `- ${categoriesMap.get(value) || value}`, kind: 'removed' });
                }
            });

            proposedModes.forEach(value => {
                if (!currentModes.has(value)) {
                    chips.push({ label: `+ ${modesMap.get(value) || value}`, kind: 'added' });
                }
            });
            const modeRemovalSet = new Set();
            currentModes.forEach(value => {
                if (!proposedModes.has(value) && proposedModes.size > 0) {
                    const label = `- ${modesMap.get(value) || value}`;
                    chips.push({ label, kind: 'removed' });
                    modeRemovalSet.add(value);
                }
            });
            rejectedModes.forEach(value => {
                if (!modeRemovalSet.has(value)) {
                    chips.push({ label: `- ${modesMap.get(value) || value}`, kind: 'removed' });
                }
            });

            (game.tags || []).forEach(tag => {
                if (tag.isPending) {
                    chips.push({ label: `+ #${tag.value}`, kind: 'added' });
                }
            });

            return chips;
        }
        async processModeration(action, explicitId) {
            const targetId = explicitId || this.currentGameId;
            if (!targetId) {
                return;
            }

            const form = action === 'approve' ? this.previewApproveForm : this.rejectForm;
            if (!form) {
                return;
            }

            if (explicitId) {
                const idField = form.querySelector('input[name="id"], input[name="Id"]');
                if (idField) {
                    idField.value = explicitId;
                }
            }

            if (action === 'reject' && this.rejectNotes && !explicitId) {
                const notesInput = form.querySelector('textarea[name="Notes"]');
                if (notesInput) {
                    notesInput.value = this.rejectNotes.value;
                }
            }

            try {
                const response = await fetch(form.action, {
                    method: form.method || 'POST',
                    body: new FormData(form),
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (!response.ok) {
                    throw new Error('Moderation failed');
                }

                const game = this.games.get(String(targetId));
                if (game) {
                    game.status = action === 'approve' ? 'Approved' : 'Rejected';
                    if (action === 'reject' && this.rejectNotes) {
                        game.moderationNotes = this.rejectNotes.value || null;
                    } else if (action === 'approve') {
                        game.moderationNotes = null;
                    }
                    this.updateRow(game);
                    if (this.summaryStatus) {
                        this.summaryStatus.textContent = this.statusLabels[game.status] || game.status;
                    }
                    if (this.fieldStatus) {
                        this.fieldStatus.value = game.status;
                    }
                }

                showToast(action === 'approve' ? 'Gra zatwierdzona.' : 'Gra odrzucona.', 'success');
                if (!explicitId) {
                    this.closeDrawer();
                }
            } catch (error) {
                console.error('Moderation error', error);
                showToast('Nie udało się zaktualizować statusu gry.', 'error');
            }
        }

        openModeration() {
            if (!this.accordion) {
                return;
            }
            const moderationItem = this.accordion.querySelector('[data-accordion-item="moderation"]');
            if (!moderationItem) {
                return;
            }
            this.closeAccordion();
            const trigger = moderationItem.querySelector('[data-accordion-trigger]');
            const panel = moderationItem.querySelector('[data-accordion-panel]');
            if (trigger && panel) {
                trigger.setAttribute('aria-expanded', 'true');
                panel.hidden = false;
                const field = panel.querySelector('textarea, input');
                field?.focus();
            }
        }

        closeDrawer() {
            if (!this.drawer) {
                return;
            }
            this.drawer.classList.remove('is-open');
            this.previewSection.hidden = true;
            this.editorSection.hidden = true;
            this.currentGameId = null;
            this.isDirty = false;
            this.isLoadingForm = false;
        }
    }

    new AdminGamesApp(root);
})();