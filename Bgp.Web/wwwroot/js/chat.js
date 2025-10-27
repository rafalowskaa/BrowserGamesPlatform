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
    const windowsContainer = dock.querySelector('[data-chat-windows]');
    const unreadBadge = dock.querySelector('[data-chat-unread]');
    const stringsElement = document.getElementById('chatStrings');
    const statusForm = panel ? panel.querySelector('[data-chat-status-form]') : null;
    const statusMessageInput = statusForm ? statusForm.querySelector('[data-chat-status-message]') : null;
    const statusSelect = statusForm ? statusForm.querySelector('[data-chat-presence]') : null;
    const invisibleToggle = statusForm ? statusForm.querySelector('[data-chat-invisible]') : null;
    const statusFeedback = statusForm ? statusForm.querySelector('[data-chat-status-feedback]') : null;
    const statusSubmit = statusForm ? statusForm.querySelector('[data-chat-status-submit]') : null;
    const currentUserId = dock.dataset.chatUser || null;

    const friends = new Map();
    const conversations = new Map();
    let connection = null;
    let searchTerm = '';
    let statusDirty = false;
    let statusAwaitingConfirmation = false;

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
        newMessage: 'New message',
        accept: 'Accept',
        decline: 'Decline',
        pendingOutgoing: 'Invitation sent',
        noFriends: 'No friends yet',
        noInvites: 'No invitations',
        noMatches: 'No friends match your search',
        minimize: 'Minimize chat window',
        restore: 'Restore chat window',
        close: 'Close chat window',
        writePlaceholder: 'Write a message…',
        send: 'Send'
    };

    try {
        if (stringsElement) {
            const parsed = JSON.parse(stringsElement.textContent || '{}');
            Object.assign(strings, parsed);
        }
    } catch (err) {
        console.warn('Unable to parse chat strings.', err);
    }

    function togglePanel(force) {
        if (!panel) return;
        const shouldOpen = typeof force === 'boolean' ? force : !dock.classList.contains('is-open');
        if (shouldOpen) {
            dock.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
            panel.hidden = false;
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            dock.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            panel.hidden = true;
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
        if (!statusForm || !statusMessageInput || !statusSelect || !invisibleToggle) {
            return;
        }
        try {
            const res = await fetch('/api/status', { credentials: 'same-origin' });
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            statusMessageInput.value = data.statusMessage || '';
            statusSelect.value = String(data.presence ?? 0);
            invisibleToggle.checked = !!data.isInvisible;
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
            if (!statusMessageInput || !statusSelect || !invisibleToggle) {
                return;
            }
            const presenceValue = parseInt(statusSelect.value, 10);
            const payload = {
                statusMessage: statusMessageInput.value,
                presence: Number.isNaN(presenceValue) ? 0 : presenceValue,
                isInvisible: invisibleToggle.checked
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
                    statusSelect.value = String(data.presence ?? 0);
                    invisibleToggle.checked = !!data.isInvisible;
                }
                statusDirty = false;
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
            searchTerm = (evt.target.value || '').toLowerCase().trim();
            applyFriendFilter();
        });
    }

    function presenceLabel(friend) {
        if (friend.isInvisible) {
            return strings.statusInvisible;
        }
        switch (friend.presence) {
            case 0:
                return strings.statusAvailable;
            case 1:
                return strings.statusAway;
            default:
                return strings.statusOffline;
        }
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
        ensureConversation(friendId);
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

    function renderFriends(accepted) {
        if (!friendsList) return;
        friendsList.innerHTML = '';
        accepted.forEach((friend) => {
            friendsList.appendChild(createFriendElement(friend));
        });
        applyFriendFilter();
        updateUnreadBadge();
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
                await fetch(`/api/friends/accept/${encodeURIComponent(request.userId)}`, { method: 'POST' });
                await loadFriends();
            });

            const declineBtn = document.createElement('button');
            declineBtn.type = 'button';
            declineBtn.className = 'btn-outline btn-compact';
            declineBtn.textContent = strings.decline;
            declineBtn.addEventListener('click', async () => {
                await fetch(`/api/friends/${encodeURIComponent(request.userId)}`, { method: 'DELETE' });
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

    function ensureConversation(friendId) {
        let conversation = conversations.get(friendId);
        const friend = friends.get(friendId);
        if (!friend) {
            return null;
        }

        if (!conversation) {
            conversation = createConversation(friend);
            conversations.set(friendId, conversation);
        }

        conversation.element.classList.remove('chat-window--collapsed');
        windowsContainer.appendChild(conversation.element);
        updateConversationHeader(conversation);
        markThreadRead(friendId);
        conversation.input.focus();
        return conversation;
    }

    function createConversation(friend) {
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

        header.addEventListener('dblclick', () => {
            const collapsed = element.classList.toggle('chat-window--collapsed');
            minimizeBtn.textContent = collapsed ? '▴' : '▾';
            minimizeBtn.title = collapsed ? strings.restore : strings.minimize;
            if (!collapsed) {
                markThreadRead(friend.userId);
            }
        });

        const send = () => {
            const message = input.value.trim();
            if (!message || !connection) {
                return;
            }
            input.value = '';
            connection.invoke('SendPrivateMessage', friend.userId, message).catch((err) => {
                console.error('Failed to send message.', err);
            });

        };

        sendBtn.addEventListener('click', send);
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
        loadHistory(conversation).catch((err) => console.error('Failed to load chat history.', err));

        return conversation;
    }

    function formatTime(value) {
        if (!value) return '';
        return new Date(value + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        const sentLabel = formatTime(message.sentAtUtc);
        let label = sentLabel;
        if (fromSelf && message.isRead && message.readAtUtc) {
            label += ` · ${strings.readReceiptLabel} ${formatTime(message.readAtUtc)}`;
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

    async function loadHistory(conversation) {
        if (conversation.loaded) return;
        conversation.loaded = true;
        try {
            const res = await fetch(`/api/chat/history/${encodeURIComponent(conversation.friendId)}?take=50`);
            if (!res.ok) {
                return;
            }
            const history = await res.json();
            history.forEach((msg) => renderMessage(conversation, msg));
            markThreadRead(conversation.friendId);
        } catch (err) {
            console.error('Chat history failed.', err);
        }
    }

    function addIncomingMessage(friendId, message) {
        const friend = friends.get(friendId);
        if (!friend) {
            return;
        }
        const conversation = ensureConversation(friendId);
        renderMessage(conversation, message);
        if (!message.fromSelf) {
            if (conversation.element.classList.contains('chat-window--collapsed') || document.visibilityState === 'hidden') {
                friend.unreadCount = (friend.unreadCount || 0) + 1;
                updateFriendVisual(friend);
                updateUnreadBadge();
            } else {
                markThreadRead(friendId);
            }
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
                const timeLabel = formatTime(entry.data.sentAtUtc);
                const readLabel = formatTime(payload.readAtUtc);
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
        if (!connection) return;
        connection.invoke('MarkThreadRead', friendId).catch(() => { /* ignore */ });
    }

    async function loadFriends() {
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
            const res = await fetch('/api/friends');
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

            accepted.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    }

    async function startConnection() {
        if (typeof signalR === 'undefined') {
            return;
        }
        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/chat')
            .withAutomaticReconnect()
            .build();

        connection.on('ReceiveMessage', (msg) => {
            const friendId = friends.has(msg.senderId) ? msg.senderId : msg.receiverId;
            if (!friendId) {
                return;
            }

            const normalized = {
                id: msg.id,
                senderId: msg.senderId,
                receiverId: msg.receiverId,
                content: msg.content,
                sentAtUtc: msg.sentAtUtc,
                fromSelf: msg.senderId !== friendId,
                isRead: msg.isRead,
                readAtUtc: msg.readAtUtc
            };
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

            if (friends.has(payload.userId)) {
                const friend = friends.get(payload.userId);
                friend.statusMessage = statusMessage;
                friend.presence = presenceValue;
                friend.isInvisible = isInvisible;
                updateFriendVisual(friend);
                conversations.forEach((conversation) => {
                    if (conversation.friendId === payload.userId) {
                        updateConversationHeader(conversation);
                    }
                });
            }

            if (currentUserId && payload.userId === currentUserId) {
                if (!statusDirty) {
                    if (statusMessageInput) {
                        statusMessageInput.value = statusMessage;
                    }
                    if (statusSelect) {
                        statusSelect.value = String(presenceValue);
                    }
                    if (invisibleToggle) {
                        invisibleToggle.checked = isInvisible;
                    }
                }
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
        } catch (err) {
            console.error('Chat connection failed to start.', err);
        }
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
            }
            ensureConversation(userId);
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
    loadFriends();
    startConnection();
})();
