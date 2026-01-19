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

    function formatTemplate(template, ...args) {
        if (!template) {
            return '';
        }

        return args.reduce((result, value, index) => {
            const pattern = new RegExp(`\\{${index}\\}`, 'g');
            return result.replace(pattern, value ?? '');
        }, template);
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
                remove.title = this.labels.remove || '';
                remove.textContent = '✕';
                actions.appendChild(remove);
            } else if (entry.status === 'proposed') {
                const accept = document.createElement('button');
                accept.type = 'button';
                accept.dataset.chipAction = 'accept';
                accept.title = this.labels.accept || '';
                accept.textContent = '✓';
                const reject = document.createElement('button');
                reject.type = 'button';
                reject.dataset.chipAction = 'reject';
                reject.title = this.labels.reject || '';
                reject.textContent = '✕';
                actions.append(accept, reject);
            } else if (entry.status === 'rejected') {
                const restore = document.createElement('button');
                restore.type = 'button';
                restore.dataset.chipAction = 'restore';
                restore.title = this.labels.restore || '';
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
                });

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
            this.labels = {
                saved: this.root.dataset.savedLabel || 'Saved',
                saving: this.root.dataset.savingLabel || 'Saving…',
                unsaved: this.root.dataset.unsavedLabel || 'Unsaved changes',
                preview: this.root.dataset.previewLabel || 'Preview',
                reject: this.root.dataset.rejectLabel || 'Reject',
                approve: this.root.dataset.approveLabel || 'Approve',
                edit: this.root.dataset.editLabel || 'Edit metadata',
                test: this.root.dataset.testLabel || 'Test game',
                newLabel: this.root.dataset.newLabel || 'New',
                rejectedLabel: this.root.dataset.rejectedLabel || 'Rejected',
                addedLabel: this.root.dataset.addedLabel || 'Added',
                removedLabel: this.root.dataset.removedLabel || 'Removed',
                remove: this.root.dataset.removeLabel || 'Remove',
                accept: this.root.dataset.acceptLabel || 'Accept',
                restore: this.root.dataset.restoreLabel || 'Restore'
            };
            this.messages = {
                bulkApproveSuccess: this.root.dataset.bulkApproveSuccess || 'Approved submissions.',
                bulkRejectSuccess: this.root.dataset.bulkRejectSuccess || 'Rejected submissions.',
                previewSlug: this.root.dataset.previewSlugTemplate || 'Slug: {0}',
                previewOwner: this.root.dataset.previewOwnerTemplate || 'Owner: {0}',
                previewDescriptionEmpty: this.root.dataset.previewDescriptionEmpty || 'No description provided.',
                previewRulesEmpty: this.root.dataset.previewRulesEmpty || 'No rules provided.',
                tagsEmpty: this.root.dataset.tagsEmpty || 'No tags.',
                saveSuccess: this.root.dataset.saveSuccess || 'Metadata saved.',
                saveError: this.root.dataset.saveError || 'Could not save changes.',
                moderationApproveSuccess: this.root.dataset.moderationApproveSuccess || 'Game approved.',
                moderationRejectSuccess: this.root.dataset.moderationRejectSuccess || 'Game rejected.',
                moderationError: this.root.dataset.moderationError || 'Failed to update game status.'
            };
            this.rejectionTemplate = this.root.dataset.rejectionTemplate || '';
            this.rejectionRetentionDays = Number(this.root.dataset.rejectionRetentionDays) || 14;
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
            this.previewClearRankingsForm = this.drawer?.querySelector('[data-preview-clear-rankings]');
            this.previewDeleteForm = this.drawer?.querySelector('[data-preview-delete]');
            this.rejectForm = this.drawer?.querySelector('[data-reject-form]');
            this.previewTestLink = this.drawer?.querySelector('[data-preview-test]');
            this.previewTitle = this.drawer?.querySelector('[data-preview-title]');
            this.previewSlug = this.drawer?.querySelector('[data-preview-slug]');
            this.previewOwner = this.drawer?.querySelector('[data-preview-owner]');
            this.previewStatus = this.drawer?.querySelector('[data-preview-status]');
            this.previewDescription = this.drawer?.querySelector('[data-preview-description]');
            this.previewRules = this.drawer?.querySelector('[data-preview-rules]');
            this.previewTags = this.drawer?.querySelector('[data-preview-tags]');
            this.previewCover = this.drawer?.querySelector('[data-preview-cover]');
            this.summaryCover = this.drawer?.querySelector('[data-summary-cover]');
            this.summaryTitle = this.drawer?.querySelector('[data-summary-title]');
            this.summaryOwner = this.drawer?.querySelector('[data-summary-owner]');
            this.summaryCreated = this.drawer?.querySelector('[data-summary-created]');
            this.summaryStatus = this.drawer?.querySelector('[data-summary-status]');
            this.summaryCategories = this.drawer?.querySelector('[data-summary-categories]');
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
            this.fieldCoverUpload = this.drawer?.querySelector('[data-field-cover-upload]');
            this.coverUploadLabel = this.drawer?.querySelector('[data-cover-upload-label]');
            this.coverUploadLabelDefault = this.coverUploadLabel?.dataset.defaultLabel || this.coverUploadLabel?.textContent || '';
            this.fieldDescription = this.drawer?.querySelector('[data-field-description]');
            this.fieldRules = this.drawer?.querySelector('[data-field-rules]');
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
            this.activeRow = null;
            this.coverUploadObjectUrl = null;
            this.initializeGames(parseJson(this.root.dataset.games, []));
            this.setupChips();
            this.bind();
            this.showInitialToasts();
            if (window.Bgp?.initRejectionCountdowns) {
                window.Bgp.initRejectionCountdowns(this.root);
            }
        }
        initializeGames(games) {
            games.forEach(game => {
                const normalized = {
                    ...game,
                    createdAtUtc: game.createdAtUtc ? new Date(game.createdAtUtc) : null,
                    rejectedAtUtc: game.rejectedAtUtc ? new Date(game.rejectedAtUtc) : null,
                    categories: (game.categories || []).map(Number),
                    proposedCategories: (game.proposedCategories || []).map(Number),
                    rejectedCategories: [],
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
                removedLabel: this.labels.removedLabel,
                remove: this.labels.remove,
                accept: this.labels.accept,
                reject: this.labels.reject,
                restore: this.labels.restore
            };

            const categoriesContainer = this.drawer?.querySelector('[data-chips-field="categories"]');
            if (categoriesContainer) {
                this.categoriesField = new ChipsField(categoriesContainer, this.categoryOptions, labels, () => this.onMetadataChanged());
            }
        }

        bind() {
            this.list?.addEventListener('click', (event) => {
                const approveButton = event.target.closest('[data-approve-button]');
                if (approveButton) {
                    const row = approveButton.closest('[data-game-row]');
                    if (row) {
                        this.processModeration('approve', row.dataset.gameId);
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
                    if (event.target === this.fieldCover) {
                        this.handleCoverFieldChange();
                    }
                    if (event.target.name !== this.antiForgeryField) {
                        this.onMetadataChanged();
                    }
                });

                this.metadataForm.addEventListener('change', (event) => {
                    if (event.target === this.fieldCover) {
                        this.handleCoverFieldChange();
                    }
                    if (event.target.name !== this.antiForgeryField) {
                        this.onMetadataChanged();
                    }
                });
            }

            this.fieldCoverUpload?.addEventListener('change', (event) => {
                const file = event.target?.files?.length ? event.target.files[0] : null;
                this.handleCoverUploadChange(file);
                this.onMetadataChanged();
            });

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
                    showToast(action === 'approve' ? this.messages.bulkApproveSuccess : this.messages.bulkRejectSuccess, 'success');
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
            this.currentGameId = String(gameId);

            this.previewTitle.textContent = game.title;
            this.previewSlug.textContent = formatTemplate(this.messages.previewSlug, game.slug);
            this.previewOwner.textContent = formatTemplate(this.messages.previewOwner, game.owner);
            this.previewStatus.textContent = this.statusLabels[game.status] || game.status;
            this.previewDescription.textContent = game.description || this.messages.previewDescriptionEmpty;
            if (this.previewRules) {
                this.previewRules.textContent = game.rules || this.messages.previewRulesEmpty;
            }
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

            this.setCoverPreview(game.coverImagePath || null);

            if (this.previewTestLink) {
                this.previewTestLink.href = `/AdminUi/PlayGame/${game.id}`;
            }

            if (this.previewApproveForm) {
                const input = this.previewApproveForm.querySelector('input[name="id"]');
                if (input) {
                    input.value = game.id;
                }
            }

            if (this.previewClearRankingsForm) {
                const input = this.previewClearRankingsForm.querySelector('input[name="id"]');
                if (input) {
                    input.value = game.id;
                }
            }

            if (this.previewDeleteForm) {
                const input = this.previewDeleteForm.querySelector('input[name="Id"]');
                if (input) {
                    input.value = game.id;
                }
                this.previewDeleteForm.hidden = game.status !== 'Rejected';
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
            this.resetCoverUpload();
            if (this.fieldDescription) {
                this.fieldDescription.value = game.description || '';
            }

            if (this.fieldRules) {
                this.fieldRules.value = game.rules || '';
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

            this.setCoverPreview(game.coverImagePath || null);
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
                empty.textContent = this.messages.tagsEmpty || '';
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
            if (!this.summaryCategories) {
                return;
            }
            const categoryLabels = this.categoriesField ? this.categoriesField.getPublishedLabels() : [];
            this.summaryCategories.textContent = categoryLabels.length ? categoryLabels.join(', ') : this.emptyLabel;
        }

        setCoverPreview(source) {
            const hasSource = typeof source === 'string' && source.length > 0;
            const safeSource = hasSource ? source.replace(/"/g, '\\"') : null;
            const imageValue = hasSource ? `url("${safeSource}")` : 'none';
            if (this.previewCover) {
                this.previewCover.style.backgroundImage = imageValue;
            }
            if (this.summaryCover) {
                this.summaryCover.style.backgroundImage = imageValue;
            }
        }

        resetCoverUpload() {
            if (this.fieldCoverUpload) {
                this.fieldCoverUpload.value = '';
            }
            if (this.coverUploadLabel) {
                this.coverUploadLabel.textContent = this.coverUploadLabelDefault;
            }
            if (this.coverUploadObjectUrl) {
                URL.revokeObjectURL(this.coverUploadObjectUrl);
                this.coverUploadObjectUrl = null;
            }
        }

        handleCoverUploadChange(file) {
            if (this.coverUploadObjectUrl) {
                URL.revokeObjectURL(this.coverUploadObjectUrl);
                this.coverUploadObjectUrl = null;
            }
            if (file) {
                this.coverUploadObjectUrl = URL.createObjectURL(file);
                if (this.coverUploadLabel) {
                    this.coverUploadLabel.textContent = file.name;
                }
                this.setCoverPreview(this.coverUploadObjectUrl);
            } else {
                if (this.coverUploadLabel) {
                    this.coverUploadLabel.textContent = this.coverUploadLabelDefault;
                }
                const current = this.fieldCover?.value?.trim();
                this.setCoverPreview(current || null);
            }
        }

        handleCoverFieldChange() {
            if (this.fieldCoverUpload?.files?.length) {
                return;
            }
            const current = this.fieldCover?.value?.trim();
            this.setCoverPreview(current || null);
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
                    let payload = null;
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        try {
                            payload = await response.json();
                        } catch (error) {
                            payload = null;
                        }
                    }
                    const overrides = {};
                    if (payload && Object.prototype.hasOwnProperty.call(payload, 'coverImagePath')) {
                        overrides.coverImagePath = payload.coverImagePath;
                        if (this.fieldCover) {
                            this.fieldCover.value = payload.coverImagePath || '';
                        }
                    }
                    this.applyFormToGame(game, overrides);
                    this.updateRow(game);
                    this.updateSummaries();
                    this.setCoverPreview(game.coverImagePath || null);
                }

                this.resetCoverUpload();
                this.isDirty = false;
                this.setSaveStatus('saved');
                showToast(this.messages.saveSuccess, 'success');
            } catch (error) {
                console.error('Failed to save metadata', error);
                this.setSaveStatus('dirty');
                showToast(this.messages.saveError, 'error');
            } finally {
                this.isSaving = false;
            }
        }

        applyFormToGame(game, overrides = {}) {
            if (!this.metadataForm) {
                return;
            }

            game.title = this.fieldTitle?.value || game.title;
            game.slug = this.fieldSlug?.value || game.slug;
            const coverFieldValue = this.fieldCover?.value?.trim();
            if (Object.prototype.hasOwnProperty.call(overrides, 'coverImagePath')) {
                game.coverImagePath = overrides.coverImagePath || null;
            } else if (typeof coverFieldValue === 'string') {
                game.coverImagePath = coverFieldValue || null;
            }
            game.description = this.fieldDescription?.value || null;
            game.rules = this.fieldRules?.value || null;
            if (this.categoriesField) {
                game.categories = this.categoriesField.getPublishedValues();
                game.proposedCategories = this.categoriesField.getProposedValues();
                game.rejectedCategories = this.categoriesField.getRejectedValues();
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
                if (game.status === 'Rejected' && game.rejectedAtUtc) {
                    const deadline = new Date(game.rejectedAtUtc);
                    deadline.setDate(deadline.getDate() + this.rejectionRetentionDays);
                    statusCell.dataset.rejectionDeadline = deadline.toISOString();
                    statusCell.dataset.rejectionTemplate = this.rejectionTemplate;
                    if (window.Bgp?.updateRejectionCountdown) {
                        window.Bgp.updateRejectionCountdown(statusCell);
                    }
                } else {
                    delete statusCell.dataset.rejectionDeadline;
                    delete statusCell.dataset.rejectionTemplate;
                    statusCell.title = '';
                }
            }

            
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
                    game.rejectedAtUtc = action === 'reject' ? new Date() : null;
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

                showToast(action === 'approve' ? this.messages.moderationApproveSuccess : this.messages.moderationRejectSuccess, 'success');
                if (!explicitId) {
                    this.closeDrawer();
                }
            } catch (error) {
                console.error('Moderation error', error);
                showToast(this.messages.moderationError, 'error');
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
            if (this.currentGameId && this.games.has(this.currentGameId)) {
                const current = this.games.get(this.currentGameId);
                this.setCoverPreview(current?.coverImagePath || null);
            } else {
                this.setCoverPreview(null);
            }
            this.resetCoverUpload();
            this.currentGameId = null;
            this.isDirty = false;
            this.isLoadingForm = false;
        }
    }

    new AdminGamesApp(root);
})();