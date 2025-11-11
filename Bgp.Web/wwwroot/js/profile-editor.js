(function () {
    const form = document.querySelector('[data-profile-form]');
    if (!form) {
        return;
    }

    const actionBar = form.querySelector('[data-profile-actions]');
    const statusEl = form.querySelector('[data-profile-status]');
    const saveBtn = form.querySelector('[data-profile-save]');
    const cancelBtn = form.querySelector('[data-profile-cancel]');
    const panels = Array.from(form.querySelectorAll('[data-profile-panel]'));
    const navButtons = Array.from(document.querySelectorAll('[data-profile-nav]'));
    const displayNameInput = form.querySelector('#DisplayName');
    const displayNamePasswordField = form.querySelector('#DisplayNamePasswordField');
    const displayNameModal = form.querySelector('[data-profile-displayname-modal]');
    const avatarModal = form.querySelector('[data-profile-avatar-modal]');
    const avatarInput = form.querySelector('[data-profile-avatar-input]');
    const avatarDropzone = form.querySelector('[data-profile-avatar-drop]');
    const avatarPreview = form.querySelector('[data-profile-avatar-preview]');
    const displayNamePendingHint = form.querySelector('[data-display-name-pending-hint]');
    const savingText = form.dataset.savingText || 'Saving…';
    const savedText = form.dataset.savedText || 'Saved';
    const errorText = form.dataset.errorText || 'Could not save changes.';
    const agreementError = form.dataset.displayNameAgreementError || 'Please confirm the rules.';
    const passwordError = form.dataset.displayNamePasswordError || 'Enter your password.';
    const displayNameConfirmMessage = form.dataset.displayNameConfirmMessage || '';
    const displayNameBlockedTemplate = form.dataset.displayNameBlockedTemplate || '';
    const displayNameBlockedGeneric = form.dataset.displayNameBlockedGeneric || '';
    const displayNamePendingTemplate = form.dataset.displayNamePendingTemplate || '';

    const originalValues = new Map();
    const radioOriginal = new Map();
    const trackedRadios = new Set();
    let saving = false;
    let lastSavedAt = null;
    let autosaveTimer = null;
    let avatarState = null;
    let canRequestDisplayNameChange = form.dataset.displayNameCanRequest === 'true';
    let hasPendingDisplayName = form.dataset.displayNamePending === 'true';

    function getDisplayNameBlockedMessage() {
        return form.dataset.displayNameBlockedMessage || '';
    }

    function setStatus(message, tone) {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.dataset.tone = tone || '';
    }

    function updateActionBarState() {
        if (!actionBar) {
            return;
        }
        const dirty = hasDirtyFields();
        actionBar.classList.toggle('is-dirty', dirty);
    }

    function captureInitialValues() {
        originalValues.clear();
        radioOriginal.clear();
        trackedRadios.clear();

        const elements = Array.from(form.elements).filter((el) => {
            if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
                return false;
            }
            if (!el.name) {
                return false;
            }
            if (el.type === 'hidden') {
                return false;
            }
            return true;
        });

        elements.forEach((el) => {
            if (el instanceof HTMLInputElement && el.type === 'radio') {
                if (!trackedRadios.has(el.name)) {
                    const checked = form.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`);
                    radioOriginal.set(el.name, checked ? checked.value : null);
                    trackedRadios.add(el.name);
                }
            } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                originalValues.set(el, el.checked);
            } else if (el instanceof HTMLInputElement && el.type === 'file') {
                originalValues.set(el, null);
            } else {
                originalValues.set(el, el.value);
            }
            const wrapper = el.closest('[data-profile-field]');
            if (wrapper) {
                wrapper.classList.remove('is-dirty');
            }
        });

        updateActionBarState();
    }

    function getRadioValue(name) {
        const checked = form.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
        return checked ? checked.value : null;
    }

    function isElementDirty(el) {
        if (el instanceof HTMLInputElement && el.type === 'radio') {
            const original = radioOriginal.get(el.name) || null;
            const current = getRadioValue(el.name);
            return original !== current;
        }
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            return originalValues.get(el) !== el.checked;
        }
        if (el instanceof HTMLInputElement && el.type === 'file') {
            return el.files && el.files.length > 0;
        }
        const original = originalValues.get(el) ?? '';
        return original !== el.value;
    }

    function markFieldDirty(el) {
        const wrapper = el.closest('[data-profile-field]');
        if (!wrapper) {
            return;
        }
        const dirty = isElementDirty(el);
        wrapper.classList.toggle('is-dirty', dirty);
        if (dirty && actionBar) {
            actionBar.classList.add('is-dirty');
        }
    }

    function handleChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
            return;
        }

        if (target.type === 'radio') {
            const radios = form.querySelectorAll(`input[name="${CSS.escape(target.name)}"]`);
            radios.forEach((radio) => markFieldDirty(radio));
        } else {
            markFieldDirty(target);
        }

        updateActionBarState();
    }

    function hasDirtyFields() {
        return form.querySelector('[data-profile-field].is-dirty') !== null;
    }

    function displayNameChanged() {
        if (!displayNameInput) {
            return false;
        }
        const original = (originalValues.get(displayNameInput) || '').toString().trim();
        const current = displayNameInput.value.trim();
        return original !== current;
    }

    function shouldAutoSave() {
        if (saving) {
            return false;
        }
        if (!hasDirtyFields()) {
            return false;
        }
        if (displayNameChanged()) {
            return false;
        }
        return true;
    }

    function startAutosave() {
        if (autosaveTimer) {
            window.clearInterval(autosaveTimer);
        }
        autosaveTimer = window.setInterval(() => {
            if (shouldAutoSave()) {
                saveForm(true).catch(() => {
                    // swallow errors, status already updated
                });
            }
        }, 6000);
    }

    function openPanel(id) {
        panels.forEach((panel) => {
            const isActive = panel.dataset.profilePanel === id;
            panel.classList.toggle('is-open', isActive);
        });
        navButtons.forEach((button) => {
            const isActive = button.dataset.profileNav === id;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        form.dataset.selectedPanel = id;
    }

    function handleNavClick(event) {
        const target = event.currentTarget;
        if (!(target instanceof HTMLButtonElement)) {
            return;
        }
        const id = target.dataset.profileNav;
        if (id) {
            openPanel(id);
        }
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }
        modal.setAttribute('hidden', '');
    }

    function openModal(modal) {
        if (!modal) {
            return;
        }
        modal.removeAttribute('hidden');
    }

    function ensureDisplayNameAllowed() {
        if (!displayNameChanged()) {
            return Promise.resolve(true);
        }
        if (!canRequestDisplayNameChange || hasPendingDisplayName) {
            showDisplayNameBlocked();
            return Promise.resolve(false);
        }
        return promptDisplayNameConfirmation();
    }

    function showDisplayNameBlocked() {
        if (!displayNameModal) {
            return;
        }
        const message = displayNameModal.querySelector('[data-modal-message]');
        const warning = displayNameModal.querySelector('[data-modal-warning]');
        const agreement = displayNameModal.querySelector('[data-modal-agreement]');
        const password = displayNameModal.querySelector('[data-modal-password]');
        const confirmBtn = displayNameModal.querySelector('[data-modal-confirm]');
        const closeButtons = displayNameModal.querySelectorAll('[data-modal-close]');

        if (message) {
            message.textContent = getDisplayNameBlockedMessage() || message.textContent;
        }
        if (warning) {
            warning.textContent = '';
            warning.setAttribute('hidden', '');
        }
        if (agreement) {
            agreement.setAttribute('hidden', '');
        }
        if (password) {
            password.setAttribute('hidden', '');
        }
        if (confirmBtn instanceof HTMLButtonElement) {
            confirmBtn.disabled = true;
            confirmBtn.setAttribute('hidden', '');
        }
        openModal(displayNameModal);
        closeButtons.forEach((btn) => {
            btn.addEventListener('click', () => closeModal(displayNameModal), { once: true });
        });
    }

    function promptDisplayNameConfirmation() {
        return new Promise((resolve, reject) => {
            if (!displayNameModal) {
                resolve(false);
                return;
            }
            const message = displayNameModal.querySelector('[data-modal-message]');
            const warning = displayNameModal.querySelector('[data-modal-warning]');
            const agreementWrapper = displayNameModal.querySelector('[data-modal-agreement]');
            const passwordWrapper = displayNameModal.querySelector('[data-modal-password]');
            const agreementCheckbox = displayNameModal.querySelector('#displayNameConfirmAgree');
            const passwordInput = displayNameModal.querySelector('#displayNameConfirmPassword');
            const confirmButton = displayNameModal.querySelector('[data-modal-confirm]');
            const closeButtons = displayNameModal.querySelectorAll('[data-modal-close]');

            if (message) {
                message.textContent = displayNameConfirmMessage || message.textContent;
            }
            if (warning) {
                warning.textContent = '';
                warning.setAttribute('hidden', '');
            }
            if (agreementWrapper) {
                agreementWrapper.removeAttribute('hidden');
            }
            if (passwordWrapper) {
                passwordWrapper.removeAttribute('hidden');
            }
            if (agreementCheckbox instanceof HTMLInputElement) {
                agreementCheckbox.checked = false;
            }
            if (passwordInput instanceof HTMLInputElement) {
                passwordInput.value = '';
            }

            function cleanup() {
                closeModal(displayNameModal);
                confirmButton?.removeEventListener('click', onConfirm);
                closeButtons.forEach((btn) => btn.removeEventListener('click', onClose));
                displayNameModal.removeEventListener('click', onBackdrop);
            }

            function onConfirm() {
                if (!(agreementCheckbox instanceof HTMLInputElement) || !agreementCheckbox.checked) {
                    if (warning) {
                        warning.textContent = agreementError;
                        warning.removeAttribute('hidden');
                    }
                    return;
                }
                if (!(passwordInput instanceof HTMLInputElement) || !passwordInput.value.trim()) {
                    if (warning) {
                        warning.textContent = passwordError;
                        warning.removeAttribute('hidden');
                    }
                    return;
                }
                cleanup();
                displayNamePasswordField.value = passwordInput.value;
                resolve(true);
            }

            function onClose() {
                cleanup();
                resolve(false);
            }

            function onBackdrop(event) {
                if (event.target === displayNameModal) {
                    onClose();
                }
            }

            openModal(displayNameModal);
            confirmButton?.addEventListener('click', onConfirm);
            closeButtons.forEach((btn) => btn.addEventListener('click', onClose));
            displayNameModal.addEventListener('click', onBackdrop);
        });
    }

    async function saveForm(isAuto) {
        if (saving) {
            return;
        }
        if (!hasDirtyFields()) {
            return;
        }
        if (isAuto && displayNameChanged()) {
            return;
        }

        if (!isAuto) {
            const allowed = await ensureDisplayNameAllowed();
            if (!allowed) {
                updateActionBarState();
                return;
            }
        }

        saving = true;
        actionBar?.classList.add('is-saving');
        setStatus(savingText, 'saving');

        const formData = new FormData(form);
        const controller = new AbortController();

        try {
            const response = await fetch(form.action, {
                method: form.method || 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                signal: controller.signal,
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error('Request failed');
            }

            const result = await response.json();
            if (!result || result.success === false) {
                applyValidationErrors(result?.errors);
                setStatus(errorText, 'error');
                return;
            }

            clearValidationErrors();
            lastSavedAt = new Date();
            const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(lastSavedAt);
            const savedLabel = savedText.replace('{0}', timeLabel);
            setStatus(savedLabel, 'success');
            updateServerState(result);
            captureInitialValues();
        } catch (err) {
            console.error('Failed to save profile.', err);
            setStatus(errorText, 'error');
        } finally {
            saving = false;
            actionBar?.classList.remove('is-saving');
            if (displayNamePasswordField) {
                displayNamePasswordField.value = '';
            }
        }
    }

    function applyValidationErrors(errors) {
        clearValidationErrors();
        if (!errors || typeof errors !== 'object') {
            return;
        }
        Object.entries(errors).forEach(([key, messages]) => {
            const elements = form.querySelectorAll(`[data-valmsg-for="${CSS.escape(key)}"]`);
            elements.forEach((msg) => {
                msg.classList.add('val');
                msg.textContent = Array.isArray(messages) ? messages.join(' ') : String(messages);
            });
        });
    }

    function clearValidationErrors() {
        const messages = form.querySelectorAll('[data-valmsg-for]');
        messages.forEach((msg) => {
            msg.textContent = '';
        });
    }

    function updateServerState(result) {
        if (!result || typeof result !== 'object') {
            return;
        }

        const payload = result.state && typeof result.state === 'object' ? result.state : result;
        if (!payload || typeof payload !== 'object') {
            return;
        }

        if (payload.displayName !== undefined && displayNameInput) {
            displayNameInput.value = payload.displayName;
        }
        if (typeof payload.enableEmailNotifications === 'boolean') {
            const checkbox = form.querySelector('#EnableEmailNotifications');
            if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = payload.enableEmailNotifications;
            }
        }
        if (typeof payload.enableFriendInvites === 'boolean') {
            const checkbox = form.querySelector('#EnableFriendInvites');
            if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = payload.enableFriendInvites;
            }
        }
        if (payload.preferredLanguage) {
            const select = form.querySelector('#PreferredLanguage');
            if (select instanceof HTMLSelectElement) {
                select.value = payload.preferredLanguage;
            }
        }
        if (payload.preferredTheme) {
            const themeRadio = form.querySelector(`input[name="PreferredTheme"][value="${CSS.escape(payload.preferredTheme)}"]`);
            if (themeRadio instanceof HTMLInputElement) {
                themeRadio.checked = true;
            }
        }
        if (payload.avatarUrl && avatarPreview instanceof HTMLImageElement) {
            avatarPreview.src = payload.avatarUrl;
        }

        updatePendingDisplayNameHint(payload);
        updateDisplayNameState(payload);
    }

    function updatePendingDisplayNameHint(payload) {
        if (!displayNamePendingHint || !('pendingDisplayName' in payload)) {
            return;
        }

        const pendingValue = payload.pendingDisplayName;
        if (pendingValue) {
            let requestedLabel = '';
            if (payload.pendingDisplayNameRequestedAt) {
                const requestedAt = new Date(payload.pendingDisplayNameRequestedAt);
                if (!Number.isNaN(requestedAt.getTime())) {
                    requestedLabel = new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short'
                    }).format(requestedAt);
                }
            }

            let messageTemplate = displayNamePendingTemplate;
            if (!messageTemplate) {
                messageTemplate = displayNamePendingHint.textContent || '';
            }

            let message = messageTemplate;
            if (message.includes('{0}')) {
                message = message.replace('{0}', pendingValue);
            } else {
                message = pendingValue;
            }
            if (message.includes('{1}')) {
                message = message.replace('{1}', requestedLabel);
            }

            displayNamePendingHint.textContent = message;
            displayNamePendingHint.classList.remove('is-hidden');
        } else {
            displayNamePendingHint.textContent = '';
            displayNamePendingHint.classList.add('is-hidden');
        }
    }

    function updateDisplayNameState(payload) {
        const hasPendingKey = 'pendingDisplayName' in payload;
        const cooldownKey = 'displayNameChangeAvailableAt' in payload;
        const requestedKey = 'displayNameRequested' in payload;

        if (!hasPendingKey && !cooldownKey && !requestedKey) {
            return;
        }

        if (hasPendingKey) {
            hasPendingDisplayName = !!payload.pendingDisplayName;
            form.dataset.displayNamePending = hasPendingDisplayName ? 'true' : 'false';
        }

        let changeAvailableAtDate = null;
        if (cooldownKey) {
            const raw = payload.displayNameChangeAvailableAt;
            if (raw) {
                const parsed = new Date(raw);
                if (!Number.isNaN(parsed.getTime())) {
                    changeAvailableAtDate = parsed;
                }
            }
        }

        const now = new Date();
        if (changeAvailableAtDate && changeAvailableAtDate > now) {
            if (displayNameBlockedTemplate) {
                const formatted = new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }).format(changeAvailableAtDate);
                form.dataset.displayNameBlockedMessage = displayNameBlockedTemplate.replace('{0}', formatted);
            } else if (displayNameBlockedGeneric) {
                form.dataset.displayNameBlockedMessage = displayNameBlockedGeneric;
            }
        } else if (!hasPendingDisplayName && displayNameBlockedGeneric) {
            form.dataset.displayNameBlockedMessage = displayNameBlockedGeneric;
        } else if (hasPendingDisplayName && displayNameBlockedGeneric) {
            form.dataset.displayNameBlockedMessage = displayNameBlockedGeneric;
        }

        let canRequest = !hasPendingDisplayName && (!changeAvailableAtDate || changeAvailableAtDate <= now);
        if (requestedKey && payload.displayNameRequested) {
            canRequest = false;
        }

        canRequestDisplayNameChange = canRequest;
        form.dataset.displayNameCanRequest = canRequest ? 'true' : 'false';
    }

    function cancelEditing() {
        window.location.reload();
    }

    function setupNav() {
        navButtons.forEach((btn) => btn.addEventListener('click', handleNavClick));
        const selected = form.dataset.selectedPanel || 'profile';
        openPanel(selected);
    }

    function setupListeners() {
        form.addEventListener('change', handleChange, true);
        form.addEventListener('input', handleChange, true);

        if (saveBtn) {
            saveBtn.addEventListener('click', (event) => {
                event.preventDefault();
                saveForm(false);
            });
        }

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            saveForm(false);
        });

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (event) => {
                event.preventDefault();
                cancelEditing();
            });
        }

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveForm(false);
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditing();
            }
        });

        if (avatarInput) {
            avatarInput.addEventListener('change', () => {
                if (avatarInput.files && avatarInput.files[0]) {
                    loadAvatarForCropping(avatarInput.files[0]);
                }
            });
        }

        if (avatarDropzone) {
            avatarDropzone.addEventListener('dragover', (event) => {
                event.preventDefault();
                avatarDropzone.classList.add('is-dragover');
            });
            avatarDropzone.addEventListener('dragleave', () => {
                avatarDropzone.classList.remove('is-dragover');
            });
            avatarDropzone.addEventListener('drop', (event) => {
                event.preventDefault();
                avatarDropzone.classList.remove('is-dragover');
                if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
                    loadAvatarForCropping(event.dataTransfer.files[0]);
                }
            });
        }

        setupRecoveryFields();
    }

    function setupRecoveryFields() {
        const selects = form.querySelectorAll('[data-recovery-select]');
        selects.forEach((select) => {
            if (!(select instanceof HTMLSelectElement)) {
                return;
            }
            const fieldset = select.closest('.recovery-field');
            const customInput = fieldset ? fieldset.querySelector('[data-recovery-custom]') : null;

            function toggleCustom() {
                const option = select.selectedOptions[0];
                const allowsCustom = option && option.dataset.allowsCustom === 'true';
                if (customInput instanceof HTMLInputElement) {
                    customInput.classList.toggle('is-hidden', !allowsCustom);
                    customInput.disabled = !allowsCustom;
                    if (!allowsCustom) {
                        customInput.value = '';
                    }
                }
            }

            select.addEventListener('change', () => {
                toggleCustom();
                markFieldDirty(select);
            });
            toggleCustom();
        });
    }

    function loadAvatarForCropping(file) {
        if (!file.type.startsWith('image/')) {
            setStatus(errorText, 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            openAvatarModal(reader.result, file);
        };
        reader.onerror = () => {
            setStatus(errorText, 'error');
        };
        reader.readAsDataURL(file);
    }

    function openAvatarModal(dataUrl, originalFile) {
        if (!avatarModal) {
            return;
        }
        const image = avatarModal.querySelector('[data-avatar-crop-image]');
        const zoom = avatarModal.querySelector('[data-avatar-crop-zoom]');
        const confirm = avatarModal.querySelector('[data-avatar-crop-confirm]');
        const cancel = avatarModal.querySelectorAll('[data-avatar-crop-cancel]');
        const viewport = avatarModal.querySelector('[data-avatar-cropper] .avatar-cropper__viewport');
        if (!(image instanceof HTMLImageElement) || !(zoom instanceof HTMLInputElement) || !viewport) {
            return;
        }

        avatarState = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            initialX: 0,
            initialY: 0,
            dragging: false,
            dataUrl,
            originalFile,
            naturalWidth: null,
            naturalHeight: null
        };

        function cleanup() {
            closeModal(avatarModal);
            viewport.removeEventListener('pointerdown', onPointerDown);
            viewport.removeEventListener('pointermove', onPointerMove);
            viewport.removeEventListener('pointerup', onPointerUp);
            viewport.removeEventListener('pointercancel', onPointerUp);
            viewport.removeEventListener('wheel', onWheel);
            zoom.removeEventListener('input', onZoomChange);
            confirm?.removeEventListener('click', onConfirm);
            cancel.forEach((btn) => btn.removeEventListener('click', onCancel));
            avatarModal.removeEventListener('keydown', onModalKeydown);
            image.onload = null;
            image.onerror = null;
            avatarState = null;
        }

        image.onload = () => {
            if (!avatarState) {
                return;
            }
            avatarState.naturalWidth = image.naturalWidth || image.width;
            avatarState.naturalHeight = image.naturalHeight || image.height;
            const rect = viewport.getBoundingClientRect();
            clampAvatarOffset(rect);
            updateAvatarTransform();
        };
        image.onerror = () => {
            setStatus(errorText, 'error');
            cleanup();
        };

        image.src = dataUrl;
        zoom.value = '1';
        updateAvatarTransform();
        openModal(avatarModal);

        function onPointerDown(event) {
            if (!avatarState) {
                return;
            }
            avatarState.dragging = true;
            avatarState.initialX = event.clientX;
            avatarState.initialY = event.clientY;
            viewport.setPointerCapture(event.pointerId);
        }

        function onPointerMove(event) {
            if (!avatarState || !avatarState.dragging) {
                return;
            }
            const rect = viewport.getBoundingClientRect();
            avatarState.offsetX += event.clientX - avatarState.initialX;
            avatarState.offsetY += event.clientY - avatarState.initialY;
            avatarState.initialX = event.clientX;
            avatarState.initialY = event.clientY;
            clampAvatarOffset(rect);
            updateAvatarTransform();
        }

        function onPointerUp(event) {
            if (!avatarState) {
                return;
            }
            avatarState.dragging = false;
            viewport.releasePointerCapture(event.pointerId);
        }

        function onWheel(event) {
            event.preventDefault();
            if (!avatarState) {
                return;
            }
            const delta = event.deltaY < 0 ? 0.05 : -0.05;
            const newScale = Math.min(3, Math.max(1, avatarState.scale + delta));
            avatarState.scale = newScale;
            zoom.value = String(newScale);
            const rect = viewport.getBoundingClientRect();
            clampAvatarOffset(rect);
            updateAvatarTransform();
        }

        function onZoomChange() {
            if (!avatarState) {
                return;
            }
            const rect = viewport.getBoundingClientRect();
            avatarState.scale = parseFloat(zoom.value) || 1;
            clampAvatarOffset(rect);
            updateAvatarTransform();
        }

        function onConfirm() {
            exportAvatar().then((file) => {
                if (file) {
                    const transfer = new DataTransfer();
                    transfer.items.add(file);
                    if (avatarInput) {
                        avatarInput.files = transfer.files;
                    }
                    if (avatarPreview instanceof HTMLImageElement) {
                        avatarPreview.src = URL.createObjectURL(file);
                    }
                    markFieldDirty(avatarInput);
                    updateActionBarState();
                }
                cleanup();
            }).catch((err) => {
                console.error('Failed to crop avatar', err);
                setStatus(errorText, 'error');
                cleanup();
            });
        }

        function onCancel() {
            cleanup();
        }

        function onModalKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                cleanup();
            }
        }

        viewport.addEventListener('pointerdown', onPointerDown);
        viewport.addEventListener('pointermove', onPointerMove);
        viewport.addEventListener('pointerup', onPointerUp);
        viewport.addEventListener('pointercancel', onPointerUp);
        viewport.addEventListener('wheel', onWheel, { passive: false });
        zoom.addEventListener('input', onZoomChange);
        confirm?.addEventListener('click', onConfirm);
        cancel.forEach((btn) => btn.addEventListener('click', onCancel));
        avatarModal.addEventListener('keydown', onModalKeydown);
    }

    function clampAvatarOffset(rect) {
        const state = avatarState;
        if (!state) {
            return;
        }
        const viewportSize = rect.width || rect.height || 1;
        const naturalWidth = state.naturalWidth || viewportSize;
        const naturalHeight = state.naturalHeight || viewportSize;
        const scaledWidth = naturalWidth * state.scale;
        const scaledHeight = naturalHeight * state.scale;
        const maxX = Math.max(0, (scaledWidth - viewportSize) / 2);
        const maxY = Math.max(0, (scaledHeight - viewportSize) / 2);
        state.offsetX = Math.min(maxX, Math.max(-maxX, state.offsetX));
        state.offsetY = Math.min(maxY, Math.max(-maxY, state.offsetY));
    }

    function updateAvatarTransform() {
        const state = avatarState;
        if (!state) {
            return;
        }
        const image = avatarModal?.querySelector('[data-avatar-crop-image]');
        if (!(image instanceof HTMLImageElement)) {
            return;
        }
        image.style.transform = `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px)) scale(${state.scale})`;
    }

    function exportAvatar() {
        return new Promise((resolve, reject) => {
            const state = avatarState;
            if (!state) {
                resolve(null);
                return;
            }
            const image = new Image();
            image.onload = () => {
                const canvasSize = 512;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = canvasSize;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }
                const outputType = state.originalFile?.type === 'image/png' ? 'image/png' : 'image/jpeg';
                ctx.clearRect(0, 0, canvasSize, canvasSize);
                if (outputType !== 'image/png') {
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(0, 0, canvasSize, canvasSize);
                }
                const drawWidth = image.width * state.scale;
                const drawHeight = image.height * state.scale;
                const drawX = canvasSize / 2 - drawWidth / 2 + state.offsetX;
                const drawY = canvasSize / 2 - drawHeight / 2 + state.offsetY;
                ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(null);
                        return;
                    }
                    const extension = outputType === 'image/png' ? '.png' : '.jpg';
                    let filename = state.originalFile ? state.originalFile.name : `avatar${extension}`;
                    const lower = filename.toLowerCase();
                    if (!lower.endsWith(extension)) {
                        if (filename.includes('.')) {
                            filename = filename.replace(/\.[^.]+$/, extension);
                        } else {
                            filename += extension;
                        }
                    }
                    const file = new File([blob], filename, { type: outputType });
                    resolve(file);
                }, outputType, outputType === 'image/jpeg' ? 0.92 : undefined);
            };
            image.onerror = reject;
            image.src = state.dataUrl;
        });
    }

    captureInitialValues();
    setupNav();
    setupListeners();
    if (statusEl) {
        setStatus(statusEl.textContent || '', 'idle');
    }
    startAutosave();
})();