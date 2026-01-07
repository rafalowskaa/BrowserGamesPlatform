(function () {
    const root = document.querySelector('[data-profile-view]');
    if (!root) {
        return;
    }

    const userId = root.dataset.profileUserId;
    if (!userId) {
        return;
    }

    const actionContainer = root.querySelector('[data-profile-actions]');
    const statusEl = actionContainer ? actionContainer.querySelector('[data-profile-actions-status]') : null;
    const toastContainer = document.getElementById('profileToastStack');
    const stringsEl = document.getElementById('profileViewStrings');

    let strings = {};
    if (stringsEl) {
        try {
            strings = JSON.parse(stringsEl.textContent || '{}');
        } catch (err) {
            console.error('Failed to parse profile view strings.', err);
        }
    }

    const buttons = new Map();
    root.querySelectorAll('[data-profile-action]').forEach((button) => {
        const action = button.dataset.profileAction;
        if (action) {
            buttons.set(action, button);
        }
    });

    const state = {
        isSelf: root.dataset.profileIsSelf === 'true',
        isFriend: root.dataset.profileIsFriend === 'true',
        hasPending: root.dataset.profileHasPending === 'true',
        blockedByViewer: root.dataset.profileBlockedByViewer === 'true',
        blockedByTarget: root.dataset.profileBlockedByTarget === 'true',
        pendingDirection: root.dataset.profileHasPending === 'true' ? 'outgoing' : null
    };

    const initialTone = statusEl ? statusEl.dataset.tone || '' : '';
    const initialMessage = statusEl ? (statusEl.textContent || '').trim() : '';
    let busy = false;

    function setStatus(message, tone) {
        if (!statusEl) {
            return;
        }
        const text = message || '';
        statusEl.textContent = text;
        if (tone) {
            statusEl.dataset.tone = tone;
        } else if (statusEl.dataset.tone !== undefined) {
            statusEl.dataset.tone = '';
        }
        statusEl.hidden = text.length === 0;
    }

    function showToast(message, tone) {
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
        window.setTimeout(() => {
            toast.classList.add('is-leaving');
            window.setTimeout(() => toast.remove(), 250);
        }, 4000);
    }

    function setBusy(next) {
        busy = next;
        buttons.forEach((button) => {
            button.disabled = next;
        });
    }

    function computeTone() {
        if (state.blockedByViewer) {
            return 'warning';
        }
        if (state.blockedByTarget) {
            return 'danger';
        }
        if (state.isFriend) {
            return 'success';
        }
        if (state.hasPending) {
            return 'info';
        }
        return initialTone || 'muted';
    }

    function computeMessage() {
        if (state.blockedByViewer) {
            return strings.relationshipBlockedByYou || initialMessage;
        }
        if (state.blockedByTarget) {
            return strings.relationshipBlockedYou || initialMessage;
        }
        if (state.isFriend) {
            return strings.relationshipFriend || initialMessage;
        }
        if (state.hasPending) {
            if (state.pendingDirection === 'incoming' && strings.relationshipPendingIncoming) {
                return strings.relationshipPendingIncoming;
            }
            if (state.pendingDirection === 'outgoing' && strings.relationshipPendingOutgoing) {
                return strings.relationshipPendingOutgoing;
            }
            return strings.relationshipPending || initialMessage;
        }
        return strings.relationshipNone || initialMessage;
    }

    function toggleButton(action, visible) {
        const button = buttons.get(action);
        if (!button) {
            return;
        }
        if (visible) {
            button.removeAttribute('hidden');
        } else {
            button.setAttribute('hidden', 'hidden');
        }
    }

    function refreshUI() {
        if (!actionContainer) {
            return;
        }

        if (state.isSelf) {
            actionContainer.setAttribute('hidden', 'hidden');
        } else {
            actionContainer.removeAttribute('hidden');
        }

        const cannotInteract = state.blockedByViewer || state.blockedByTarget;

        toggleButton('add', !state.isSelf && !state.isFriend && !state.hasPending && !cannotInteract);
        toggleButton('cancel', !state.isSelf && state.hasPending && !cannotInteract);
        toggleButton('accept', !state.isSelf && state.hasPending && state.pendingDirection !== 'outgoing' && !cannotInteract);
        toggleButton('remove', !state.isSelf && state.isFriend && !cannotInteract);
        toggleButton('chat', !state.isSelf && state.isFriend && !cannotInteract);
        toggleButton('invite', !state.isSelf && state.isFriend && !cannotInteract);
        toggleButton('block', !state.isSelf && !state.blockedByViewer);
        toggleButton('unblock', !state.isSelf && state.blockedByViewer);
        toggleButton('report', !state.isSelf);

        const tone = computeTone();
        const message = computeMessage();
        setStatus(message, tone);
    }

    async function apiCall(url, options = {}) {
        const opts = Object.assign({ credentials: 'same-origin' }, options);
        opts.headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        if (opts.body && !opts.headers['Content-Type']) {
            opts.headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, opts);
        if (!response.ok) {
            let errorMessage = strings.error || 'Something went wrong.';
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                try {
                    const payload = await response.json();
                    if (payload && typeof payload.message === 'string' && payload.message.trim()) {
                        errorMessage = payload.message.trim();
                    }
                } catch (err) {
                    console.warn('Failed to parse error payload.', err);
                }
            }
            throw new Error(errorMessage);
        }
        if (response.status === 204) {
            return null;
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return response.json();
        }
        return response.text();
    }

    async function detectPendingDirection() {
        if (!state.hasPending || state.isSelf) {
            return;
        }
        try {
            const res = await apiCall('/api/friends');
            if (!Array.isArray(res)) {
                return;
            }
            const entry = res.find((friend) => friend && friend.userId === userId);
            if (entry && entry.status === 0) {
                state.pendingDirection = entry.outgoingRequest ? 'outgoing' : 'incoming';
            }
        } catch (err) {
            console.warn('Failed to resolve pending friendship direction.', err);
            if (!state.pendingDirection) {
                state.pendingDirection = 'outgoing';
            }
        } finally {
            refreshUI();
        }
    }

    async function handleAdd() {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            await apiCall('/api/friends/send', {
                method: 'POST',
                body: JSON.stringify({ targetUserId: userId })
            });
            state.hasPending = true;
            state.pendingDirection = 'outgoing';
            showToast(strings.requestSent || strings.relationshipPendingOutgoing || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleCancel() {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            await apiCall(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            state.hasPending = false;
            state.pendingDirection = null;
            showToast(strings.requestCanceled || strings.relationshipNone || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleAccept() {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            await apiCall(`/api/friends/accept/${encodeURIComponent(userId)}`, { method: 'POST' });
            state.isFriend = true;
            state.hasPending = false;
            state.pendingDirection = null;
            showToast(strings.requestAccepted || strings.relationshipFriend || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleRemove() {
        if (busy) {
            return;
        }
        const confirmMessage = strings.removeConfirm || strings.relationshipNone;
        if (confirmMessage && !window.confirm(confirmMessage)) {
            return;
        }
        setBusy(true);
        try {
            await apiCall(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            state.isFriend = false;
            state.hasPending = false;
            state.pendingDirection = null;
            showToast(strings.friendRemoved || strings.relationshipNone || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleBlock() {
        if (busy) {
            return;
        }
        if (strings.blockConfirm && !window.confirm(strings.blockConfirm)) {
            return;
        }
        setBusy(true);
        try {
            await apiCall(`/api/friends/block/${encodeURIComponent(userId)}`, { method: 'POST' });
            state.blockedByViewer = true;
            state.blockedByTarget = false;
            state.isFriend = false;
            state.hasPending = false;
            state.pendingDirection = null;
            showToast(strings.blockSuccess || strings.relationshipBlockedByYou || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.blockError || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleUnblock() {
        if (busy) {
            return;
        }
        if (strings.unblockConfirm && !window.confirm(strings.unblockConfirm)) {
            return;
        }
        setBusy(true);
        try {
            await apiCall(`/api/friends/unblock/${encodeURIComponent(userId)}`, { method: 'POST' });
            state.blockedByViewer = false;
            showToast(strings.unblockSuccess || strings.relationshipNone || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    async function handleReport() {
        if (busy) {
            return;
        }
        const template = strings.reportPrompt || '';
        const promptMessage = template && strings.displayName ? template.replace('{0}', strings.displayName) : template;
        const description = window.prompt(promptMessage || strings.report || '');
        if (description === null) {
            return;
        }
        const payload = {
            targetUserId: userId,
            category: 4,
            description: description.trim() ? description.trim() : null
        };
        setBusy(true);
        try {
            await apiCall('/api/reports', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast(strings.reportSuccess || '');
        } catch (err) {
            console.error(err);
            showToast(err.message || strings.reportError || strings.error, 'error');
        } finally {
            setBusy(false);
            refreshUI();
        }
    }

    function handleChat() {
        if (!buttons.get('chat') || buttons.get('chat').hasAttribute('hidden')) {
            return;
        }
        if (window.bgpChat && typeof window.bgpChat.open === 'function') {
            window.bgpChat.open(userId, strings.displayName || userId);
        }
    }

    function handleInvite() {
        if (!buttons.get('invite') || buttons.get('invite').hasAttribute('hidden')) {
            return;
        }
        const openInvite = () => {
            if (window.bgpChat && typeof window.bgpChat.openWithMessage === 'function') {
                window.bgpChat.openWithMessage(userId, strings.displayName || userId, strings.inviteMessage || '');
                return true;
            }
            if (window.bgpChat && typeof window.bgpChat.open === 'function') {
                window.bgpChat.open(userId, strings.displayName || userId);
                return true;
            }
            return false;
        };

        if (openInvite()) {
            return;
        }

        setTimeout(() => {
            if (!openInvite()) {
                showToast(strings.error || 'Unable to open chat.', 'error');
            }
        }, 300);
    }

    const actionHandlers = {
        add: handleAdd,
        cancel: handleCancel,
        accept: handleAccept,
        remove: handleRemove,
        block: handleBlock,
        unblock: handleUnblock,
        report: handleReport,
        chat: handleChat,
        invite: handleInvite
    };

    buttons.forEach((button, action) => {
        const handler = actionHandlers[action];
        if (!handler) {
            return;
        }
        button.addEventListener('click', (event) => {
            event.preventDefault();
            handler();
        });
    });

    refreshUI();
    if (state.hasPending && !state.isSelf) {
        detectPendingDirection();
    }
})();