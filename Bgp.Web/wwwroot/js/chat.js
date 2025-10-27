(function () {
    const dock = document.getElementById('chatDock');
    if (!dock) {
        return;
    }

    const toggle = document.getElementById('chatToggle');
    const panel = document.getElementById('chatPanel');
    const closeBtn = panel ? panel.querySelector('[data-chat-close]') : null;
    const searchInput = panel ? panel.querySelector('[data-chat-search]') : null;
    const friendsList = panel ? panel.querySelector('[data-chat-friends]') : null;
    const friendsEmpty = panel ? panel.querySelector('[data-chat-friends-empty]') : null;
    const requestsList = panel ? panel.querySelector('[data-chat-requests]') : null;
    const requestsEmpty = panel ? panel.querySelector('[data-chat-requests-empty]') : null;
    const strangersList = panel ? panel.querySelector('[data-chat-strangers]') : null;
    const strangersEmpty = panel ? panel.querySelector('[data-chat-strangers-empty]') : null;
    const windowsContainer = dock.querySelector('[data-chat-windows]');
    const unreadBadge = dock.querySelector('[data-chat-unread]');
    const stringsElement = document.getElementById('chatStrings');
    const statusForm = panel ? panel.querySelector('[data-chat-status-form]') : null;
    const statusMessageInput = statusForm ? statusForm.querySelector('[data-chat-status-message]') : null;
    const statusSelect = statusForm ? statusForm.querySelector('[data-chat-presence]') : null;
    const statusFeedback = statusForm ? statusForm.querySelector('[data-chat-status-feedback]') : null;
    const statusSubmit = statusForm ? statusForm.querySelector('[data-chat-status-submit]') : null;
    const statusContainer = panel ? panel.querySelector('[data-chat-status]') : null;
    const statusToggle = panel ? panel.querySelector('[data-chat-status-toggle]') : null;
    const statusMessageDisplay = panel ? panel.querySelector('[data-chat-status-text]') : null;
    const statusPresenceDisplay = panel ? panel.querySelector('[data-chat-status-presence]') : null;
    const selfStatusDot = panel ? panel.querySelector('[data-chat-self-dot]') : null;
    const panelHeader = panel ? panel.querySelector('.chat-panel__header') : null;
    const currentUserId = dock.dataset.chatUser || null;

    const friends = new Map();
    const conversations = new Map();
    const pendingMessages = new Map();
    let connection = null;
    let loadFriendsPromise = null;
    let connectionPromise = null;
    let searchTerm = '';
    let statusDirty = false;
    let statusAwaitingConfirmation = false;
    let statusMenuOpen = false;
    let searchDebounceTimer = null;
    let searchController = null;
    let searchRequestId = 0;
    const pendingPresence = new Map();

    const strings = {
        readReceipt: 'Read at {0}',
        readReceiptLabel: 'Read',
        statusAvailable: 'Available',
        statusAway: 'Be right back',
        statusInvisible: 'Invisible',
        statusOffline: 'Offline',
        statusUnknown: 'Offline',
        statusSaved: 'Status updated',
        statusError: 'Unable to update status',
        statusPrompt: 'Change status',
        newMessage: 'New message',
        accept: 'Accept',
        decline: 'Decline',
        pendingOutgoing: 'Invitation sent',
        noFriends: 'No friends yet',
        noInvites: 'No invitations',
        noMatches: 'No friends match your search',
        strangers: 'Other players',
        noStrangers: 'No players match your search',
        searchHint: 'Start typing to find players',
        strangersPrompt: 'Start a conversation',
        minimize: 'Minimize chat window',
        restore: 'Restore chat window',
        close: 'Close chat window',
        writePlaceholder: 'Write a message…',
        send: 'Send',
        deliveredReceiptLabel: 'Delivered'
    };

    try {
        if (stringsElement) {
            const parsed = JSON.parse(stringsElement.textContent || '{}');
            Object.assign(strings, parsed);
        }
    } catch (err) {
        console.warn('Unable to parse chat strings.', err);
    }

    function presenceLabelFromValues(presence, isInvisible) {
        if (isInvisible) {
            return strings.statusInvisible;
        }
        if (presence === 0) {
            return strings.statusAvailable;
        }
        if (presence === 1) {
            return strings.statusAway;
        }
        return strings.statusOffline;
    }

    function selectionValueFromPresence(presence, isInvisible) {
        if (isInvisible) {
            return 'invisible';
        }
        if (presence === 1) {
            return 'away';
        }
        return 'available';
    }

    function parsePresenceSelection(value) {
        if (value === 'invisible') {
            return { presence: 0, isInvisible: true };
        }
        if (value === 'away') {
            return { presence: 1, isInvisible: false };
        }
        return { presence: 0, isInvisible: false };
    }

    function updateSelfStatusDisplay(message, presence, isInvisible) {
        if (statusPresenceDisplay) {
            statusPresenceDisplay.textContent = presenceLabelFromValues(presence, isInvisible);
        }
        if (statusMessageDisplay) {
            if (message && message.trim()) {
                statusMessageDisplay.textContent = message;
                statusMessageDisplay.classList.remove('is-empty');
            } else {
                statusMessageDisplay.textContent = strings.statusPrompt;
                statusMessageDisplay.classList.add('is-empty');
            }
        }
        applyStatusDot(selfStatusDot, { presence, isInvisible });
    }

    function setStatusMenu(open) {
        if (!statusContainer || !statusForm || !statusToggle) {
            return;
        }
        statusMenuOpen = !!open;
        statusForm.hidden = !statusMenuOpen;
        statusContainer.classList.toggle('is-open', statusMenuOpen);
        statusToggle.setAttribute('aria-expanded', statusMenuOpen ? 'true' : 'false');
        if (statusMenuOpen && statusMessageInput) {
            statusMessageInput.focus();
        }
    }

    function togglePanel(force) {
        if (!panel) return;
        const shouldOpen = typeof force === 'boolean' ? force : !dock.classList.contains('is-open');
        if (shouldOpen) {
            dock.classList.add('is-open');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'true');
            }
            panel.hidden = false;
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            dock.classList.remove('is-open');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
            }
            panel.hidden = true;
            setStatusMenu(false);
        }
    }

    if (toggle) {
        toggle.addEventListener('click', () => togglePanel());
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => togglePanel(false));
    }

    document.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape' && dock.classList.contains('is-open')) {
            togglePanel(false);
        }
    });

    if (panelHeader) {
        panelHeader.addEventListener('click', (evt) => {
            if (evt.target.closest('button')) {
                return;
            }
            togglePanel();
        });
    }

    if (statusToggle) {
        statusToggle.addEventListener('click', (evt) => {
            evt.preventDefault();
            setStatusMenu(!statusMenuOpen);
        });
    }

    if (statusContainer) {
        document.addEventListener('click', (evt) => {
            if (!statusMenuOpen) {
                return;
            }
            if (!statusContainer.contains(evt.target)) {
                setStatusMenu(false);
            }
        });
    }

    function showStatusFeedback(message, isError) {
        if (!statusFeedback) {
            return;
        }
        const text = message || '';
        statusFeedback.textContent = text;
        statusFeedback.hidden = !text;
        statusFeedback.classList.toggle('is-error', !!isError);
    }

    function setStatusBusy(busy) {
        if (!statusForm) {
            return;
        }
        statusForm.classList.toggle('is-busy', !!busy);
        if (statusSubmit) {
            statusSubmit.disabled = !!busy;
        }
    }

    async function loadSelfStatus() {
        if (!statusForm || !statusMessageInput || !statusSelect) {
            return;
        }
        try {
            const res = await fetch('/api/status', { credentials: 'same-origin' });
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            statusMessageInput.value = data.statusMessage || '';
            const presence = typeof data.presence === 'number' ? data.presence : parseInt(data.presence, 10) || 0;
            const isInvisible = !!data.isInvisible;
            statusSelect.value = selectionValueFromPresence(presence, isInvisible);
            updateSelfStatusDisplay(statusMessageInput.value, presence, isInvisible);
            statusDirty = false;
            showStatusFeedback('', false);
        } catch (err) {
            console.error('Failed to load status.', err);
        }
    }

    if (statusForm) {
        statusForm.addEventListener('input', () => {
            statusDirty = true;
            showStatusFeedback('', false);
        });

        statusForm.addEventListener('submit', async (evt) => {
            evt.preventDefault();
            if (!statusMessageInput || !statusSelect) {
                return;
            }
            const selection = parsePresenceSelection(statusSelect.value);
            const payload = {
                statusMessage: statusMessageInput.value,
                presence: selection.presence,
                isInvisible: selection.isInvisible
            };
            statusAwaitingConfirmation = true;
            setStatusBusy(true);
            try {
                const res = await fetch('/api/status', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    let message = strings.statusError;
                    try {
                        const data = await res.json();
                        if (data && typeof data.error === 'string' && data.error.trim()) {
                            message = data.error;
                        }
                    } catch (_) {
                        // ignore parse errors
                    }
                    statusAwaitingConfirmation = false;
                    showStatusFeedback(message, true);
                    return;
                }
                const data = await res.json();
                if (data) {
                    statusMessageInput.value = data.statusMessage || '';
                    const updatedPresence = typeof data.presence === 'number' ? data.presence : parseInt(data.presence, 10) || 0;
                    const updatedInvisible = !!data.isInvisible;
                    statusSelect.value = selectionValueFromPresence(updatedPresence, updatedInvisible);
                    updateSelfStatusDisplay(statusMessageInput.value, updatedPresence, updatedInvisible);
                }
                statusDirty = false;
                setStatusMenu(false);
            } catch (err) {
                console.error('Failed to update status.', err);
                statusAwaitingConfirmation = false;
                showStatusFeedback(strings.statusError, true);
            } finally {
                setStatusBusy(false);
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (evt) => {
            const value = evt.target.value || '';
            searchTerm = value.toLowerCase().trim();
            applyFriendFilter();
            scheduleSearch(value);
        });
    }

    function presenceLabel(friend) {
        return presenceLabelFromValues(friend.presence, friend.isInvisible);
    }

    function presencePriority(friend) {
        if (!friend.isInvisible && friend.presence === 0) {
            return 0;
        }
        if (!friend.isInvisible && friend.presence === 1) {
            return 1;
        }
        if (friend.isInvisible) {
            return 2;
        }
        return 3;
    }

    function getStatusLine(friend) {
        if (friend.statusMessage) {
            return friend.statusMessage;
        }
        return presenceLabel(friend);
    }

    function applyStatusDot(dotEl, friend) {
        if (!dotEl) {
            return;
        }
        dotEl.classList.remove('is-online', 'is-away', 'is-offline', 'is-invisible');
        if (friend.isInvisible) {
            dotEl.classList.add('is-invisible');
        } else if (friend.presence === 0) {
            dotEl.classList.add('is-online');
        } else if (friend.presence === 1) {
            dotEl.classList.add('is-away');
        } else {
            dotEl.classList.add('is-offline');
        }
    }

    function applyPresenceSnapshot(friendId, snapshot) {
        if (!snapshot) {
            return;
        }
        const friend = friends.get(friendId);
        if (!friend) {
            pendingPresence.set(friendId, snapshot);
            return;
        }
        friend.statusMessage = snapshot.statusMessage;
        friend.presence = snapshot.presence;
        friend.isInvisible = snapshot.isInvisible;
        updateFriendVisual(friend);
        conversations.forEach((conversation) => {
            if (conversation.friendId === friendId) {
                updateConversationHeader(conversation);
            }
        });
        pendingPresence.delete(friendId);
    }

    function applyPendingPresence() {
        if (pendingPresence.size === 0) {
            return;
        }
        Array.from(pendingPresence.entries()).forEach(([friendId, snapshot]) => {
            applyPresenceSnapshot(friendId, snapshot);
        });
    }

    function updateUnreadBadge() {
        const total = Array.from(friends.values()).reduce((sum, friend) => sum + (friend.unreadCount || 0), 0);
        if (!unreadBadge) return;
        if (total > 0) {
            unreadBadge.textContent = String(total);
            unreadBadge.hidden = false;
        } else {
            unreadBadge.hidden = true;
        }
    }

    function queuePendingMessage(friendId, message) {
        if (!pendingMessages.has(friendId)) {
            pendingMessages.set(friendId, []);
        }
        pendingMessages.get(friendId).push(message);
    }

    function flushPendingMessages(friendId) {
        const queued = pendingMessages.get(friendId);
        if (!queued || !friends.has(friendId)) {
            return;
        }
        queued.forEach((msg) => addIncomingMessage(friendId, msg));
        pendingMessages.delete(friendId);
    }

    function applyFriendFilter() {
        let visible = 0;
        friends.forEach((friend) => {
            if (!friend.element) {
                return;
            }
            const matches = !searchTerm || friend.displayName.toLowerCase().includes(searchTerm) ||
                (friend.statusMessage && friend.statusMessage.toLowerCase().includes(searchTerm));
            friend.element.hidden = !matches;
            if (matches) {
                visible++;
            }
        });

        if (friendsEmpty) {
            const hasFriends = friends.size > 0;
            friendsEmpty.textContent = searchTerm && hasFriends ? strings.noMatches : strings.noFriends;
            friendsEmpty.style.display = visible > 0 ? 'none' : 'block';
        }
    }

    function clearStrangerResults() {
        if (strangersList) {
            strangersList.innerHTML = '';
        }
    }

    function showStrangerMessage(message) {
        if (!strangersEmpty) {
            return;
        }
        const text = message ? message.trim() : '';
        strangersEmpty.textContent = text;
        strangersEmpty.style.display = text ? 'block' : 'none';
    }

    function renderStrangers(results) {
        if (!strangersList) {
            return;
        }
        clearStrangerResults();
        const fragment = document.createDocumentFragment();
        results.forEach((player) => {
            const displayName = player.name || player.Name || player.id;
            const li = document.createElement('li');
            li.className = 'chat-contact';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-contact__button chat-contact__button--ghost';
            button.addEventListener('click', () => {
                if (window.bgpChat && typeof window.bgpChat.open === 'function') {
                    window.bgpChat.open(player.id, displayName);
                }
            });

            const avatar = document.createElement('span');
            avatar.className = 'chat-contact__avatar';
            if (player.avatarUrl) {
                const img = document.createElement('img');
                img.src = player.avatarUrl;
                img.alt = '';
                avatar.appendChild(img);
            } else {
                const source = (displayName || player.id || '?').trim();
                avatar.textContent = source ? source.slice(0, 1).toUpperCase() : '?';
            }

            const meta = document.createElement('span');
            meta.className = 'chat-contact__meta';

            const name = document.createElement('span');
            name.className = 'chat-contact__name';
            name.textContent = displayName;
            meta.appendChild(name);

            const prompt = document.createElement('span');
            prompt.className = 'chat-contact__status';
            prompt.textContent = strings.strangersPrompt;
            meta.appendChild(prompt);

            button.appendChild(avatar);
            button.appendChild(meta);
            li.appendChild(button);
            fragment.appendChild(li);
        });
        strangersList.appendChild(fragment);
        showStrangerMessage('');
    }

    function updateSearchResults(value) {
        if (!strangersList || !strangersEmpty) {
            return;
        }
        if (searchController) {
            searchController.abort();
            searchController = null;
        }
        const controller = new AbortController();
        searchController = controller;
        const requestId = ++searchRequestId;
        fetch(`/api/friends/search?q=${encodeURIComponent(value)}`, {
            credentials: 'same-origin',
            signal: controller.signal
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error('Search failed');
                }
                return res.json();
            })
            .then((results) => {
                if (searchRequestId !== requestId) {
                    return;
                }
                const list = Array.isArray(results) ? results : [];
                if (list.length === 0) {
                    clearStrangerResults();
                    showStrangerMessage(strings.noStrangers);
                    return;
                }
                renderStrangers(list);
            })
            .catch((err) => {
                if (err && err.name === 'AbortError') {
                    return;
                }
                console.error('Player search failed.', err);
                clearStrangerResults();
                showStrangerMessage(strings.noStrangers);
            })
            .finally(() => {
                if (searchController === controller) {
                    searchController = null;
                }
            });
    }

    function scheduleSearch(rawValue) {
        const value = (rawValue || '').trim();
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        if (!value || value.length < 2) {
            if (searchController) {
                searchController.abort();
                searchController = null;
            }
            clearStrangerResults();
            showStrangerMessage(strings.searchHint);
            return;
        }
        clearStrangerResults();
        showStrangerMessage(strings.searchHint);
        searchDebounceTimer = setTimeout(() => {
            updateSearchResults(value);
        }, 250);
    }

    function updateFriendVisual(friend) {
        if (!friend.element) return;
        const nameEl = friend.element.querySelector('[data-friend-name]');
        const statusEl = friend.element.querySelector('[data-friend-status]');
        const dotEl = friend.element.querySelector('[data-friend-dot]');
        if (nameEl) {
            nameEl.textContent = friend.displayName;
        }
        if (statusEl) {
            statusEl.textContent = getStatusLine(friend);
        }
        applyStatusDot(dotEl, friend);
        friend.element.classList.toggle('is-unread', (friend.unreadCount || 0) > 0);
    }

    function updateConversationHeader(conversation) {
        const friend = friends.get(conversation.friendId);
        if (!friend) return;
        if (conversation.nameEl) {
            conversation.nameEl.textContent = friend.displayName;
        }
        if (conversation.statusEl) {
            conversation.statusEl.textContent = getStatusLine(friend);
        }
        applyStatusDot(conversation.dotEl, friend);
    }

    function openConversation(friendId) {
        togglePanel(false);
        ensureConnectionStarted();
        ensureConversation(friendId, { focus: true, autoRead: true });
    }

    function createFriendElement(friend) {
        const li = document.createElement('li');
        li.className = 'chat-contact';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-contact__button';
        button.addEventListener('click', () => openConversation(friend.userId));

        const avatar = document.createElement('span');
        avatar.className = 'chat-contact__avatar';
        if (friend.avatarUrl) {
            const img = document.createElement('img');
            img.src = friend.avatarUrl;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.textContent = friend.displayName.slice(0, 1).toUpperCase();
        }

        const statusDot = document.createElement('span');
        statusDot.className = 'chat-status-dot';
        statusDot.dataset.friendDot = '';
        avatar.appendChild(statusDot);

        const meta = document.createElement('span');
        meta.className = 'chat-contact__meta';

        const name = document.createElement('span');
        name.className = 'chat-contact__name';
        name.dataset.friendName = '';
        meta.appendChild(name);

        const status = document.createElement('span');
        status.className = 'chat-contact__status';
        status.dataset.friendStatus = '';
        meta.appendChild(status);

        button.appendChild(avatar);
        button.appendChild(meta);
        li.appendChild(button);
        friend.element = li;
        updateFriendVisual(friend);
        return li;
    }

    async function ensureFriendLoaded(friendId, message) {
        if (friends.has(friendId)) {
            return friends.get(friendId);
        }
        try {
            await loadFriends();
        } catch (err) {
            console.error('Friend list refresh failed.', err);
        }
        if (friends.has(friendId)) {
            return friends.get(friendId);
        }
        if (!message) {
            return null;
        }
        const fallbackName = message.senderId === friendId
            ? (message.senderName || message.senderId)
            : (message.receiverName || message.receiverId);
        const friend = {
            userId: friendId,
            displayName: fallbackName,
            avatarUrl: null,
            statusMessage: '',
            presence: 2,
            isInvisible: false,
            unreadCount: 0
        };
        friends.set(friendId, friend);
        if (friendsList) {
            friendsList.appendChild(createFriendElement(friend));
            applyFriendFilter();
            updateUnreadBadge();
        }
        applyPendingPresence();
        return friend;
    }

    function renderFriends(accepted) {
        if (!friendsList) return;
        friendsList.innerHTML = '';
        const ordered = accepted.slice().sort((a, b) => {
            const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
            if (unreadDiff !== 0) {
                return unreadDiff;
            }
            const priorityDiff = presencePriority(a) - presencePriority(b);
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            return a.displayName.localeCompare(b.displayName);
        });
        ordered.forEach((friend) => {
            friendsList.appendChild(createFriendElement(friend));
        });
        applyFriendFilter();
        updateUnreadBadge();
        applyPendingPresence();
        ordered.forEach((friend) => flushPendingMessages(friend.userId));
    }

    function renderRequests(incoming, outgoing) {
        if (!requestsList) return;
        requestsList.innerHTML = '';

        const fragment = document.createDocumentFragment();

        incoming.forEach((request) => {
            const item = document.createElement('li');
            const meta = document.createElement('div');
            meta.className = 'chat-contact__meta';

            const name = document.createElement('span');
            name.className = 'chat-contact__name';
            name.textContent = request.displayName;
            meta.appendChild(name);

            if (request.statusMessage) {
                const status = document.createElement('span');
                status.className = 'chat-contact__status';
                status.textContent = request.statusMessage;
                meta.appendChild(status);
            }

            const actions = document.createElement('div');
            actions.className = 'chat-requests__actions';

            const acceptBtn = document.createElement('button');
            acceptBtn.type = 'button';
            acceptBtn.className = 'btn-primary btn-compact';
            acceptBtn.textContent = strings.accept;
            acceptBtn.addEventListener('click', async () => {
                await fetch(`/api/friends/accept/${encodeURIComponent(request.userId)}`, {
                    method: 'POST',
                    credentials: 'same-origin'
                });
                await loadFriends();
            });

            const declineBtn = document.createElement('button');
            declineBtn.type = 'button';
            declineBtn.className = 'btn-outline btn-compact';
            declineBtn.textContent = strings.decline;
            declineBtn.addEventListener('click', async () => {
                await fetch(`/api/friends/${encodeURIComponent(request.userId)}`, {
                    method: 'DELETE',
                    credentials: 'same-origin'
                });
                await loadFriends();
            });

            actions.appendChild(acceptBtn);
            actions.appendChild(declineBtn);

            item.appendChild(meta);
            item.appendChild(actions);
            fragment.appendChild(item);
        });

        outgoing.forEach((request) => {
            const item = document.createElement('li');
            const wrapper = document.createElement('div');
            wrapper.className = 'chat-contact__meta';

            const name = document.createElement('span');
            name.className = 'chat-contact__name';
            name.textContent = request.displayName;
            wrapper.appendChild(name);

            const status = document.createElement('span');
            status.className = 'chat-contact__status';
            status.textContent = strings.pendingOutgoing;
            wrapper.appendChild(status);

            item.appendChild(wrapper);
            fragment.appendChild(item);
        });

        requestsList.appendChild(fragment);

        if (requestsEmpty) {
            const hasRequests = incoming.length + outgoing.length > 0;
            requestsEmpty.style.display = hasRequests ? 'none' : 'block';
            requestsEmpty.textContent = strings.noInvites;
        }
    }

    function ensureConversation(friendId, options = {}) {
        let conversation = conversations.get(friendId);
        const friend = friends.get(friendId);
        if (!friend) {
            return null;
        }

        if (!conversation) {
            conversation = createConversation(friend, options);
            conversations.set(friendId, conversation);
        }

        conversation.element.classList.remove('chat-window--collapsed');
        if (windowsContainer) {
            windowsContainer.appendChild(conversation.element);
        }
        updateConversationHeader(conversation);
        const shouldAutoRead = options.autoRead === true;
        const shouldFocus = options.focus !== false;
        if (shouldAutoRead) {
            markThreadRead(friendId);
        }
        if (shouldFocus && conversation.input) {
            conversation.input.focus();
        }
        return conversation;
    }

    function createConversation(friend, options = {}) {
        const element = document.createElement('section');
        element.className = 'chat-window';
        element.dataset.friendId = friend.userId;

        const header = document.createElement('div');
        header.className = 'chat-window__header';

        const title = document.createElement('div');
        title.className = 'chat-window__title';

        const avatar = document.createElement('span');
        avatar.className = 'chat-window__avatar';
        if (friend.avatarUrl) {
            const img = document.createElement('img');
            img.src = friend.avatarUrl;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.textContent = friend.displayName.slice(0, 1).toUpperCase();
        }

        const dot = document.createElement('span');
        dot.className = 'chat-status-dot';
        avatar.appendChild(dot);

        const labelWrap = document.createElement('div');

        const name = document.createElement('span');
        name.dataset.windowName = '';
        labelWrap.appendChild(name);

        const status = document.createElement('small');
        status.dataset.windowStatus = '';
        labelWrap.appendChild(status);

        title.appendChild(avatar);
        title.appendChild(labelWrap);

        const controls = document.createElement('div');
        controls.className = 'chat-window__controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.type = 'button';
        minimizeBtn.className = 'btn-icon';
        minimizeBtn.title = strings.minimize;
        minimizeBtn.textContent = '▾';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-icon';
        closeBtn.title = strings.close;
        closeBtn.textContent = '✕';

        controls.appendChild(minimizeBtn);
        controls.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(controls);

        const body = document.createElement('div');
        body.className = 'chat-window__body';

        const inputWrap = document.createElement('div');
        inputWrap.className = 'chat-window__input';

        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.maxLength = 2000;
        input.placeholder = strings.writePlaceholder;

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'btn-primary btn-compact';
        sendBtn.textContent = strings.send;

        inputWrap.appendChild(input);
        inputWrap.appendChild(sendBtn);

        element.appendChild(header);
        element.appendChild(body);
        element.appendChild(inputWrap);

        minimizeBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const collapsed = element.classList.toggle('chat-window--collapsed');
            minimizeBtn.textContent = collapsed ? '▴' : '▾';
            minimizeBtn.title = collapsed ? strings.restore : strings.minimize;
            if (!collapsed) {
                markThreadRead(friend.userId);
            }
        });

        closeBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            element.remove();
            conversations.delete(friend.userId);
        });

        header.addEventListener('click', (evt) => {
            if (evt.target.closest('button')) {
                return;
            }
            const collapsed = element.classList.toggle('chat-window--collapsed');
            minimizeBtn.textContent = collapsed ? '▴' : '▾';
            minimizeBtn.title = collapsed ? strings.restore : strings.minimize;
            if (!collapsed) {
                markThreadRead(friend.userId);
            }
        });

        const send = async () => {
            const message = input.value.trim();
            if (!message) {
                return;
            }
            input.value = '';
            const conn = await ensureConnectionStarted();
            if (!conn || conn.state !== 'Connected') {
                console.warn('Chat connection is not ready.');
                return;
            }
            conn.invoke('SendPrivateMessage', friend.userId, message).catch((err) => {
                console.error('Failed to send message.', err);
            });

        };

        sendBtn.addEventListener('click', () => { send(); });
        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter' && !evt.shiftKey) {
                evt.preventDefault();
                send();
            }
        });

        input.addEventListener('focus', () => markThreadRead(friend.userId));
        body.addEventListener('mouseenter', () => markThreadRead(friend.userId));

        const conversation = {
            friendId: friend.userId,
            element,
            body,
            input,
            messages: new Map(),
            loaded: false,
            nameEl: name,
            statusEl: status,
            dotEl: dot
        };

        updateConversationHeader(conversation);
        loadHistory(conversation, { markRead: options.autoRead === true })
            .catch((err) => console.error('Failed to load chat history.', err));

        return conversation;
    }

    function toUtcDate(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return value;
        }
        const str = typeof value === 'string' && value.endsWith('Z') ? value : `${value}Z`;
        const date = new Date(str);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDateTime(value) {
        const date = toUtcDate(value);
        if (!date) return '';
        return date.toLocaleString([], {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function renderMessage(conversation, message) {
        const fromSelf = message.fromSelf === true || message.senderId === undefined || message.senderId !== conversation.friendId;
        const wrapper = document.createElement('div');
        wrapper.className = `chat-message ${fromSelf ? 'chat-message--me' : 'chat-message--peer'}`;
        wrapper.dataset.messageId = message.id;

        const bubble = document.createElement('div');
        bubble.className = 'chat-message__bubble';
        bubble.textContent = message.content;
        wrapper.appendChild(bubble);

        const meta = document.createElement('div');
        meta.className = 'chat-message__meta';
        const sentLabel = formatDateTime(message.sentAtUtc);
        let label = sentLabel;
        if (fromSelf) {
            if (message.isRead && message.readAtUtc) {
                label += ` · ${strings.readReceiptLabel} ${formatDateTime(message.readAtUtc)}`;
            } else {
                label += ` · ${strings.deliveredReceiptLabel}`;
            }
        }
        meta.textContent = label;
        wrapper.appendChild(meta);

        if (!fromSelf) {
            wrapper.classList.add('chat-message--highlight');
            setTimeout(() => wrapper.classList.remove('chat-message--highlight'), 2400);
        }

        conversation.body.appendChild(wrapper);
        conversation.messages.set(message.id, { element: wrapper, meta, data: message });
        conversation.body.scrollTop = conversation.body.scrollHeight;
    }

    async function loadHistory(conversation, options = {}) {
        if (conversation.loaded) return;
        conversation.loaded = true;
        try {
            const res = await fetch(`/api/chat/history/${encodeURIComponent(conversation.friendId)}?take=50`, { credentials: 'same-origin' });
            if (!res.ok) {
                return;
            }
            const history = await res.json();
            history.forEach((msg) => renderMessage(conversation, msg));
            if (options.markRead) {
                markThreadRead(conversation.friendId);
            }
        } catch (err) {
            console.error('Chat history failed.', err);
        }
    }

    function addIncomingMessage(friendId, message) {
        const friend = friends.get(friendId);
        if (!friend) {
            return;
        }
        const conversation = ensureConversation(friendId, { focus: false, autoRead: false });
        renderMessage(conversation, message);
        if (!message.fromSelf) {
            friend.unreadCount = (friend.unreadCount || 0) + 1;
            updateFriendVisual(friend);
            updateUnreadBadge();
            conversation.element.classList.add('chat-window--attention');
        }
    }

    function handleMessagesRead(payload) {
        const friendId = friends.has(payload.userId) ? payload.userId : (friends.has(payload.peerId) ? payload.peerId : null);
        if (!friendId) return;
        const conversation = conversations.get(friendId);
        if (!conversation) return;
        payload.messageIds.forEach((id) => {
            const entry = conversation.messages.get(id);
            if (entry && entry.data) {
                entry.data.isRead = true;
                entry.data.readAtUtc = payload.readAtUtc;
                const timeLabel = formatDateTime(entry.data.sentAtUtc);
                const readLabel = formatDateTime(payload.readAtUtc);
                entry.meta.textContent = `${timeLabel} · ${strings.readReceiptLabel} ${readLabel}`;
            }
        });
    }

    function markThreadRead(friendId) {
        const friend = friends.get(friendId);
        if (!friend) return;
        friend.unreadCount = 0;
        updateFriendVisual(friend);
        updateUnreadBadge();
        const conversation = conversations.get(friendId);
        if (conversation) {
            conversation.element.classList.remove('chat-window--attention');
        }
        ensureConnectionStarted().then((conn) => {
            if (!conn || conn.state !== 'Connected') {
                return;
            }
            conn.invoke('MarkThreadRead', friendId).catch(() => { /* ignore */ });
        });
    }

    async function loadFriends() {
        if (loadFriendsPromise) {
            return loadFriendsPromise;
        }

        loadFriendsPromise = (async () => {
            if (friendsList) {
                friendsList.innerHTML = '';
            }
            if (requestsList) {
                requestsList.innerHTML = '';
            }

            const previousUnread = new Map();
            friends.forEach((friend) => {
                previousUnread.set(friend.userId, friend.unreadCount || 0);
            });

            friends.clear();

            try {
                const res = await fetch('/api/friends', { credentials: 'same-origin' });
                if (!res.ok) {
                    throw new Error('Request failed');
                }
                const data = await res.json();
                const accepted = [];
                const incoming = [];
                const outgoing = [];
                data.forEach((row) => {
                    if (row.status === 1) {
                        const friend = {
                            userId: row.userId,
                            displayName: row.displayName,
                            avatarUrl: row.avatarUrl,
                            statusMessage: row.statusMessage,
                            presence: typeof row.presence === 'number' ? row.presence : parseInt(row.presence, 10) || 0,
                            isInvisible: !!row.isInvisible,
                            unreadCount: previousUnread.get(row.userId) || row.unreadCount || 0
                        };
                        friends.set(row.userId, friend);
                        accepted.push(friend);
                    } else if (row.status === 0 && row.outgoingRequest) {
                        outgoing.push(row);
                    } else if (row.status === 0) {
                        incoming.push(row);
                    }
                });

                renderFriends(accepted);
                renderRequests(incoming, outgoing);
                conversations.forEach((conversation, id) => {
                    if (friends.has(id)) {
                        updateConversationHeader(conversation);
                    } else {
                        conversation.element.remove();
                        conversations.delete(id);
                    }
                });
            } catch (err) {
                console.error('Failed to load friends.', err);
                if (friendsEmpty) {
                    friendsEmpty.textContent = strings.noFriends;
                    friendsEmpty.style.display = 'block';
                }
            
            }
        })();

        try {
            await loadFriendsPromise;
        } finally {
            loadFriendsPromise = null;
        }
    }

    async function startConnection() {
        if (typeof signalR === 'undefined') {
            return null;
        }
        if (connection) {
            if (connection.state === 'Disconnected') {
                try {
                    await connection.start();
                } catch (err) {
                    console.error('Chat connection failed to restart.', err);
                    connection = null;
                    return null;
                }
            }
            return connection;
        }

        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/chat')
            .withAutomaticReconnect()
            .build();

        connection.on('ReceiveMessage', (msg) => {
            const friendId = friends.has(msg.senderId)
                ? msg.senderId
                : (friends.has(msg.receiverId)
                    ? msg.receiverId
                    : (msg.senderId === currentUserId ? msg.receiverId : msg.senderId));
            if (!friendId) {
                return;
            }

            const normalized = {
                id: msg.id,
                senderId: msg.senderId,
                receiverId: msg.receiverId,
                senderName: msg.senderName,
                receiverName: msg.receiverName,
                content: msg.content,
                sentAtUtc: msg.sentAtUtc,
                fromSelf: msg.senderId !== friendId,
                isRead: msg.isRead,
                readAtUtc: msg.readAtUtc
            };

            if (!friends.has(friendId)) {
                queuePendingMessage(friendId, normalized);
                ensureFriendLoaded(friendId, normalized).then((friend) => {
                    if (friend) {
                        flushPendingMessages(friendId);
                    }
                });
                return;
            }

            addIncomingMessage(friendId, normalized);
        });

        connection.on('MessagesRead', handleMessagesRead);

        connection.on('PresenceUpdated', (payload) => {
            if (!payload || !payload.userId) {
                return;
            }
            const presenceValue = typeof payload.presence === 'number' ? payload.presence : parseInt(payload.presence, 10) || 0;
            const isInvisible = !!payload.isInvisible;
            const statusMessage = payload.statusMessage || '';

            const snapshot = {
                statusMessage,
                presence: presenceValue,
                isInvisible
            };

            if (!currentUserId || payload.userId !== currentUserId) {
                applyPresenceSnapshot(payload.userId, snapshot);
            }

            if (currentUserId && payload.userId === currentUserId) {
                if (!statusDirty) {
                    if (statusMessageInput) {
                        statusMessageInput.value = statusMessage;
                    }
                    if (statusSelect) {
                        statusSelect.value = selectionValueFromPresence(presenceValue, isInvisible);
                    }
                }
                updateSelfStatusDisplay(statusMessage, presenceValue, isInvisible);
                statusDirty = false;
                if (statusAwaitingConfirmation) {
                    showStatusFeedback(strings.statusSaved, false);
                } else {
                    showStatusFeedback('', false);
                }
                statusAwaitingConfirmation = false;
            }
        });

        try {
            await connection.start();
            return connection;
        } catch (err) {
            console.error('Chat connection failed to start.', err);
            connection = null;
            return null;
        }
    }

    function ensureConnectionStarted() {
        if (!connectionPromise) {
            connectionPromise = startConnection().then((conn) => {
                if (!conn) {
                    connectionPromise = null;
                }
                return conn;
            });
        }
        return connectionPromise;
    }

    window.bgpChat = {
        open: (userId, displayName) => {
            togglePanel(false);
            const friend = friends.get(userId) || {
                userId,
                displayName,
                avatarUrl: null,
                statusMessage: '',
                presence: 0,
                isInvisible: false,
                unreadCount: 0
            };
            if (!friends.has(userId)) {
                friends.set(userId, friend);
                if (pendingPresence.has(userId)) {
                    applyPresenceSnapshot(userId, pendingPresence.get(userId));
                }
            }
            ensureConversation(userId, { focus: true, autoRead: true });
        },
        openWithMessage: async (userId, displayName, presetMessage) => {
            window.bgpChat.open(userId, displayName);
            const conversation = conversations.get(userId);
            if (conversation && presetMessage) {
                conversation.input.value = presetMessage;
                conversation.input.focus();
            }
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            conversations.forEach((_, friendId) => markThreadRead(friendId));
        }
    });

    loadSelfStatus();
    if (strangersEmpty) {
        showStrangerMessage(strings.searchHint);
    }
    loadFriends();
    ensureConnectionStarted();
})();
