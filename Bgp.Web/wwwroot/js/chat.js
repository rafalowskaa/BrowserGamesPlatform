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
    const liveRegion = dock.querySelector('[data-chat-live]');
    const stringsElement = document.getElementById('chatStrings');
    const statusForm = panel ? panel.querySelector('[data-chat-status-form]') : null;
    const statusMessageInput = statusForm ? statusForm.querySelector('[data-chat-status-message]') : null;
    const statusSelect = statusForm ? statusForm.querySelector('[data-chat-presence]') : null;
    const statusFeedback = statusForm ? statusForm.querySelector('[data-chat-status-feedback]') : null;
    const statusSubmit = statusForm ? statusForm.querySelector('[data-chat-status-submit]') : null;
    const statusCancel = statusForm ? statusForm.querySelector('[data-chat-status-cancel]') : null;
    const statusContainer = panel ? panel.querySelector('[data-chat-status]') : null;
    const statusToggle = panel ? panel.querySelector('[data-chat-status-toggle]') : null;
    const statusMessageDisplay = panel ? panel.querySelector('[data-chat-status-text]') : null;
    const statusPresenceDisplay = panel ? panel.querySelector('[data-chat-status-presence]') : null;
    const selfStatusDot = panel ? panel.querySelector('[data-chat-self-dot]') : null;
    const panelHeader = panel ? panel.querySelector('.chat-panel__header') : null;
    const currentUserId = dock.dataset.chatUser || null;

    const PRESENCE_AVAILABLE = 0;
    const PRESENCE_AWAY = 1;
    const PRESENCE_OFFLINE = 2;

    const friends = new Map();
    const conversations = new Map();
    const pendingMessages = new Map();
    const pendingOutgoing = new Map();
    const strangerContacts = new Map();
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
    let strangerMessage = '';
    let strangerMessageForced = false;
    const pendingPresence = new Map();
    const STORAGE_LAST_SEEN_KEY = 'bgp.chat.lastSeen';
    const lastSeenMessages = loadLastSeenMessages();
    let pollTimer = null;
    let pollInFlight = false;
    const POLL_INTERVAL_MS = 7000;
    let pollErrorLogged = false;

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
        viewProfile: 'View profile',
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
        deliveredReceiptLabel: 'Delivered',
        sending: 'Sending…',
        sendError: 'Failed to send message'
    };

    try {
        if (stringsElement) {
            const parsed = JSON.parse(stringsElement.textContent || '{}');
            Object.assign(strings, parsed);
        }
    } catch (err) {
        console.warn('Unable to parse chat strings.', err);
    }

    function loadLastSeenMessages() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return new Map();
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_LAST_SEEN_KEY);
            if (!raw) {
                return new Map();
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return new Map();
            }
            const entries = Object.entries(parsed).map(([key, value]) => [
                normalizeId(key),
                normalizeLastSeenValue(value)
            ]);
            return new Map(entries);
        } catch (err) {
            console.warn('Unable to load chat last seen state.', err);
            return new Map();
        }
    }

    function normalizeLastSeenValue(value) {
        if (!value || typeof value !== 'object') {
            return { id: null, sentAtUtc: null };
        }
        const id = typeof value.id === 'string' && value.id ? value.id : null;
        const sentAtUtc = typeof value.sentAtUtc === 'string' && value.sentAtUtc ? value.sentAtUtc : null;
        return { id, sentAtUtc };
    }

    function persistLastSeenMessages() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            const payload = {};
            lastSeenMessages.forEach((value, key) => {
                payload[key] = value;
            });
            window.localStorage.setItem(STORAGE_LAST_SEEN_KEY, JSON.stringify(payload));
        } catch (err) {
            console.warn('Unable to persist chat last seen state.', err);
        }
    }

    function getLastSeenEntry(friendId) {
        if (!friendId) {
            return null;
        }
        return lastSeenMessages.get(normalizeId(friendId)) || null;
    }

    function setLastSeenEntry(friendId, messageId, sentAtUtc) {
        if (!friendId) {
            return;
        }
        lastSeenMessages.set(normalizeId(friendId), {
            id: typeof messageId === 'string' && messageId ? messageId : null,
            sentAtUtc: typeof sentAtUtc === 'string' && sentAtUtc ? sentAtUtc : null
        });
        persistLastSeenMessages();
    }

    function clearLastSeenEntry(friendId) {
        if (!friendId) {
            return;
        }
        lastSeenMessages.delete(normalizeId(friendId));
        persistLastSeenMessages();
    }

    function normalizeId(id) {
        return typeof id === 'string' ? id.trim().toLowerCase() : '';
    }

    function getFriend(id) {
        return friends.get(normalizeId(id));
    }

    function setFriend(friend) {
        friends.set(normalizeId(friend.userId), friend);
    }

    function hasFriend(id) {
        return friends.has(normalizeId(id));
    }

    function getConversation(id) {
        return conversations.get(normalizeId(id));
    }

    function setConversation(id, conversation) {
        conversations.set(normalizeId(id), conversation);
    }

    function deleteConversation(id) {
        conversations.delete(normalizeId(id));
    }

    function getPendingMessages(id, createIfMissing) {
        const key = normalizeId(id);
        if (!pendingMessages.has(key) && createIfMissing) {
            pendingMessages.set(key, []);
        }
        return pendingMessages.get(key) || null;
    }

    function deletePendingMessages(id) {
        pendingMessages.delete(normalizeId(id));
    }

    function setPendingOutgoing(id, value) {
        pendingOutgoing.set(normalizeId(id), value);
    }

    function getPendingOutgoing(id) {
        return pendingOutgoing.get(normalizeId(id));
    }

    function deletePendingOutgoing(id) {
        pendingOutgoing.delete(normalizeId(id));
    }

    function getPendingPresence(id) {
        return pendingPresence.get(normalizeId(id));
    }

    function setPendingPresence(id, value) {
        pendingPresence.set(normalizeId(id), value);
    }

    function deletePendingPresence(id) {
        pendingPresence.delete(normalizeId(id));
    }

    function getStrangerContact(id) {
        return strangerContacts.get(normalizeId(id));
    }

    function setStrangerContact(id, contact) {
        strangerContacts.set(normalizeId(id), contact);
    }

    function deleteStrangerContact(id) {
        strangerContacts.delete(normalizeId(id));
    }

    const currentUserKey = normalizeId(currentUserId);

    function presenceLabelFromValues(presence, isInvisible) {
        if (isInvisible) {
            return strings.statusInvisible;
        }
        if (presence === PRESENCE_AVAILABLE) {
            return strings.statusAvailable;
        }
        if (presence === PRESENCE_AWAY) {
            return strings.statusAway;
        }
        return strings.statusOffline;
    }

    function selectionValueFromPresence(presence, isInvisible) {
        if (isInvisible) {
            return 'invisible';
        }
        if (presence === PRESENCE_AWAY) {
            return 'away';
        }
        return 'available';
    }

    function parsePresenceSelection(value) {
        if (value === 'invisible') {
            return { presence: PRESENCE_AVAILABLE, isInvisible: true };
        }
        if (value === 'away') {
            return { presence: PRESENCE_AWAY, isInvisible: false };
        }
        return { presence: PRESENCE_AVAILABLE, isInvisible: false };
    }

    function normalizePresence(value) {
        if (typeof value === 'number' && !Number.isNaN(value)) {
            return value;
        }
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? PRESENCE_OFFLINE : parsed;
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
        if (typeof statusForm.toggleAttribute === 'function') {
            statusForm.toggleAttribute('hidden', !statusMenuOpen);
        } else if (statusMenuOpen) {
            statusForm.hidden = false;
        } else {
            statusForm.hidden = true;
        }
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
        if (evt.key === 'Escape') {
            if (statusMenuOpen) {
                setStatusMenu(false);
                return;
            }
            if (dock.classList.contains('is-open')) {
                togglePanel(false);
            }
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
            const target = evt.target;
            if (!target || !(target instanceof Node)) {
                setStatusMenu(false);
                return;
            }
            if (!statusContainer.contains(target)) {
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
            const presence = normalizePresence(data.presence);
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
                    const updatedPresence = normalizePresence(data.presence);
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

        if (statusCancel) {
            statusCancel.addEventListener('click', (evt) => {
                evt.preventDefault();
                setStatusMenu(false);
            });
        }
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
        if (!friend.isInvisible && friend.presence === PRESENCE_AVAILABLE) {
            return 0;
        }
        if (!friend.isInvisible && friend.presence === PRESENCE_AWAY) {
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
        } else if (friend.presence === PRESENCE_AVAILABLE) {
            dotEl.classList.add('is-online');
        } else if (friend.presence === PRESENCE_AWAY) {
            dotEl.classList.add('is-away');
        } else {
            dotEl.classList.add('is-offline');
        }
    }

    function applyPresenceSnapshot(friendId, snapshot) {
        if (!snapshot) {
            return;
        }
        const friend = getFriend(friendId);
        if (!friend) {
            setPendingPresence(friendId, snapshot);
            return;
        }
        friend.statusMessage = snapshot.statusMessage;
        friend.presence = snapshot.presence;
        friend.isInvisible = snapshot.isInvisible;
        updateFriendVisual(friend);
        const conversation = getConversation(friendId);
        if (conversation) {
            updateConversationHeader(conversation);
        }
        deletePendingPresence(friendId);
    }

    function applyPendingPresence() {
        if (pendingPresence.size === 0) {
            return;
        }
        Array.from(pendingPresence.entries()).forEach(([friendId, snapshot]) => {
            applyPresenceSnapshot(friendId, snapshot);
        });
    }

    function announceNewMessage(friend) {
        if (!liveRegion || !strings.newMessage) {
            return;
        }
        const label = friend && friend.displayName
            ? `${strings.newMessage}: ${friend.displayName}`
            : strings.newMessage;
        liveRegion.textContent = '';
        const writer = () => {
            liveRegion.textContent = label;
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(writer);
        } else {
            writer();
        }
    }

    function updateUnreadBadge() {
        if (!unreadBadge) return;
        const total = Array.from(friends.values()).reduce((sum, friend) => sum + (friend.unreadCount || 0), 0);
        unreadBadge.textContent = String(total);
        unreadBadge.hidden = total === 0;
    }

    function queuePendingMessage(friendId, message) {
        const queue = getPendingMessages(friendId, true);
        if (queue) {
            queue.push(message);
        }
    }

    function flushPendingMessages(friendId) {
        const queued = getPendingMessages(friendId, false);
        if (!queued || !hasFriend(friendId)) {
            return;
        }
        queued.forEach((msg) => addIncomingMessage(friendId, msg));
        deletePendingMessages(friendId);
    }

    function getPendingQueue(friendId, create) {
        let queue = getPendingOutgoing(friendId);
        if (!queue && create) {
            queue = [];
            setPendingOutgoing(friendId, queue);
        }
        return queue || null;
    }

    function getMessageMeta(message, fromSelf) {
        const sentLabel = formatDateTime(message.sentAtUtc);
        const baseLabel = sentLabel || '';
        if (!fromSelf) {
            return baseLabel;
        }
        if (message.sendError) {
            return baseLabel ? `${baseLabel} · ${strings.sendError}` : strings.sendError;
        }
        if (message.isPending) {
            return baseLabel ? `${baseLabel} · ${strings.sending}` : strings.sending;
        }
        if (message.isRead && message.readAtUtc) {
            const readLabel = formatDateTime(message.readAtUtc);
            return readLabel ? `${baseLabel} · ${strings.readReceiptLabel} ${readLabel}` : `${baseLabel} · ${strings.readReceiptLabel}`;
        }
        return baseLabel ? `${baseLabel} · ${strings.deliveredReceiptLabel}` : strings.deliveredReceiptLabel;
    }

    function registerPendingMessage(conversation, content) {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const queue = getPendingQueue(conversation.friendId, true);
        if (queue) {
            queue.push(localId);
        }
        const pending = {
            id: localId,
            senderId: currentUserId,
            receiverId: conversation.friendId,
            content,
            sentAtUtc: new Date().toISOString(),
            fromSelf: true,
            isPending: true,
            isRead: false,
            readAtUtc: null
        };
        renderMessage(conversation, pending);
        return localId;
    }

    function resolvePendingMessage(conversation, message) {
        const queue = getPendingQueue(conversation.friendId, false);
        if (!queue || queue.length === 0) {
            return false;
        }
        const pendingId = queue.shift();
        if (queue.length === 0) {
            deletePendingOutgoing(conversation.friendId);
        }
        const entry = conversation.messages.get(pendingId);
        if (!entry) {
            return false;
        }
        conversation.messages.delete(pendingId);
        entry.data = Object.assign({}, message, { isPending: false, sendError: false });
        entry.element.dataset.messageId = message.id;
        entry.element.classList.remove('chat-message--pending', 'chat-message--error');
        const bubble = entry.element.querySelector('.chat-message__bubble');
        if (bubble) {
            bubble.textContent = message.content;
        }
        entry.meta.textContent = getMessageMeta(entry.data, true);
        conversation.messages.set(message.id, entry);
        updateConversationLatest(conversation, entry.data);
        return true;
    }

    function deliverMessageFromServer(raw, friendHint) {
        if (!raw) {
            return;
        }

        const friendId = friendHint
            || (hasFriend(raw.senderId)
                ? raw.senderId
            : (hasFriend(raw.receiverId)
                    ? raw.receiverId
                    : (raw.senderId === currentUserId ? raw.receiverId : raw.senderId)));

        if (!friendId) {
            return;
        }

        const normalized = {
            id: raw.id,
            senderId: raw.senderId || (raw.fromSelf ? currentUserId : friendId),
            receiverId: raw.receiverId || (raw.fromSelf ? friendId : currentUserId),
            senderName: raw.senderName || '',
            receiverName: raw.receiverName || '',
            content: raw.content,
            sentAtUtc: raw.sentAtUtc,
            fromSelf: raw.fromSelf === true || (raw.senderId ? raw.senderId !== friendId : true),
            isRead: raw.isRead,
            readAtUtc: raw.readAtUtc
        };

        if (!hasFriend(friendId)) {
            queuePendingMessage(friendId, normalized);
            ensureFriendLoaded(friendId, normalized).then((friend) => {
                if (friend) {
                    flushPendingMessages(friendId);
                }
            });
            return;
        }

        const conversation = getConversation(friendId);
        if (conversation && resolvePendingMessage(conversation, normalized)) {
            return;
        }

        if (conversation && conversation.messages.has(normalized.id)) {
            const entry = conversation.messages.get(normalized.id);
            if (entry && entry.data) {
                const updated = Object.assign({}, entry.data, {
                    isRead: normalized.isRead,
                    readAtUtc: normalized.readAtUtc
                });
                entry.data = updated;
                entry.meta.textContent = getMessageMeta(updated, updated.senderId !== friendId);
                updateConversationLatest(conversation, updated);
            }
            return;
        }

        addIncomingMessage(friendId, normalized);
    }

    function ensurePolling() {
        if (pollTimer !== null) {
            return;
        }
        pollTimer = window.setInterval(() => {
            runPollingCycle().catch((err) => console.warn('Chat polling failed.', err));
        }, POLL_INTERVAL_MS);
        runPollingCycle().catch(() => { /* ignored */ });
    }

    function stopPolling() {
        if (pollTimer === null) {
            return;
        }
        window.clearInterval(pollTimer);
        pollTimer = null;
    }

    async function runPollingCycle() {
        if (pollInFlight) {
            return;
        }
        pollInFlight = true;
        try {
            await loadFriends();
            if (conversations.size > 0) {
                for (const [friendId] of conversations) {
                    await pollConversation(friendId);
                }
            }
        } finally {
            pollInFlight = false;
        }
    }

    async function pollConversation(friendId) {
        try {
            const res = await fetch(`/api/chat/history/${encodeURIComponent(friendId)}?take=20`, { credentials: 'same-origin' });
            if (!res.ok) {
                return;
            }
            const items = await res.json();
            pollErrorLogged = false;
            items.forEach((msg) => deliverMessageFromServer(msg, friendId));
        } catch (err) {
            if (!pollErrorLogged) {
                console.warn('Failed to poll chat history.', err);
                pollErrorLogged = true;
            }
        }
    }

    async function trySendViaSignalR(friendId, message) {
        try {
            const conn = await ensureConnectionStarted();
            if (!conn || conn.state !== 'Connected') {
                return false;
            }
            await conn.invoke('SendPrivateMessage', friendId, message);
            return true;
        } catch (err) {
            console.warn('SignalR delivery failed, falling back to HTTP.', err);
            return false;
        }
    }

    async function sendMessageViaHttp(friendId, message) {
        const res = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ toUserId: friendId, content: message })
        });
        if (!res.ok) {
            throw new Error(await extractErrorMessage(res));
        }
        const payload = await res.json();
        payload.fromSelf = true;
        deliverMessageFromServer(payload, friendId);
    }

    async function extractErrorMessage(res) {
        try {
            const data = await res.clone().json();
            if (data) {
                if (typeof data.error === 'string' && data.error.trim()) {
                    return data.error;
                }
                if (typeof data.message === 'string' && data.message.trim()) {
                    return data.message;
                }
            }
        } catch (err) {
            // ignore JSON errors
        }
        try {
            const text = await res.text();
            if (text && text.trim()) {
                return text;
            }
        } catch (err) {
            // ignore text errors
        }
        return res.statusText || 'Request failed';
    }

    function markPendingMessageFailed(conversation, pendingId, content) {
        const queue = getPendingQueue(conversation.friendId, false);
        if (queue) {
            const index = queue.indexOf(pendingId);
            if (index !== -1) {
                queue.splice(index, 1);
            }
            if (queue.length === 0) {
                deletePendingOutgoing(conversation.friendId);
            }
        }
        const entry = conversation.messages.get(pendingId);
        if (!entry) {
            return;
        }
        entry.data.isPending = false;
        entry.data.sendError = true;
        if (typeof content === 'string' && content.trim()) {
            entry.data.content = content;
            const bubble = entry.element.querySelector('.chat-message__bubble');
            if (bubble) {
                bubble.textContent = content;
            }
        }
        entry.element.classList.remove('chat-message--pending');
        entry.element.classList.add('chat-message--error');
        entry.meta.textContent = getMessageMeta(entry.data, true);
    }

    function applyFriendFilter() {
        let visibleFriends = 0;
        let visibleStrangers = 0;
        friends.forEach((friend) => {
            if (!friend.element) {
                return;
            }
            const matches = !searchTerm || friend.displayName.toLowerCase().includes(searchTerm)
                || (friend.statusMessage && friend.statusMessage.toLowerCase().includes(searchTerm));
            friend.element.hidden = !matches;
            if (matches) {
                if (friend.isFriend) {
                    visibleFriends++;
                } else {
                    visibleStrangers++;
                }
            }
        });

        if (friendsEmpty) {
            const hasFriends = Array.from(friends.values()).some((f) => f.isFriend);
            friendsEmpty.textContent = searchTerm && hasFriends ? strings.noMatches : strings.noFriends;
            friendsEmpty.style.display = visibleFriends > 0 ? 'none' : 'block';
        }

        updateStrangerEmptyState(visibleStrangers);
    }

    function renderStrangerContacts() {
        if (!strangersList) {
            return;
        }
        const expected = new Set();
        strangerContacts.forEach((contact) => {
            if (!contact || !contact.element) {
                return;
            }
            expected.add(contact.element);
            if (!contact.element.parentElement) {
                strangersList.insertBefore(contact.element, strangersList.firstChild);
            }
            contact.element.dataset.strangerContact = '';
        });

        Array.from(strangersList.querySelectorAll('[data-stranger-contact]')).forEach((node) => {
            if (!expected.has(node)) {
                node.remove();
            }
        });

        updateStrangerEmptyState();
    }

    function ensureStrangerContact(friend) {
        if (!friend || !strangersList) {
            return;
        }
        let contact = getStrangerContact(friend.userId);
        if (!contact) {
            const element = createFriendElement(friend, { ghost: true });
            contact = { element };
            setStrangerContact(friend.userId, contact);
        }
        friend.element = contact.element;
        friend.isFriend = false;
        updateFriendVisual(friend);
        renderStrangerContacts();
        applyFriendFilter();
        updateUnreadBadge();
    }

    function removeStrangerContact(friendId) {
        const contact = getStrangerContact(friendId);
        if (contact && contact.element) {
            contact.element.remove();
        }
        deleteStrangerContact(friendId);
        updateStrangerEmptyState();
    }

    function clearStrangerResults() {
        if (!strangersList) {
            return;
        }

        Array.from(strangersList.querySelectorAll('[data-stranger-search]')).forEach((node) => node.remove());
        updateStrangerEmptyState();
    }

    function showStrangerMessage(message, forceVisible = false) {
        strangerMessage = message ? message.trim() : '';
        strangerMessageForced = forceVisible;
        updateStrangerEmptyState();
    }

    function updateStrangerEmptyState(visibleContacts) {
        if (!strangersEmpty) {
            return;
        }
        const visibleCount = typeof visibleContacts === 'number'
            ? visibleContacts
            : Array.from(friends.values()).filter((f) => !f.isFriend && f.element && !f.element.hidden).length;
        const hasSearchResults = !!(strangersList && strangersList.querySelector('[data-stranger-search]'));
        const shouldShow = strangerMessageForced || ((visibleCount === 0) && !hasSearchResults && strangerMessage);
        strangersEmpty.textContent = strangerMessage;
        strangersEmpty.style.display = shouldShow ? 'block' : 'none';
    }

    function renderStrangers(results) {
        if (!strangersList) {
            return;
        }
        renderStrangerContacts();

        clearStrangerResults();
        const fragment = document.createDocumentFragment();
        results.forEach((player) => {
            const displayName = player.name || player.Name || player.id;
            const identifier = player.id;
            if (!identifier) {
                return;
            }
            const existing = getFriend(identifier);
            if (existing) {
                if (!existing.isFriend) {
                    ensureStrangerContact(existing);
                }
                return;
            }
            const li = document.createElement('li');
            li.className = 'chat-contact';
            li.dataset.strangerSearch = '';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-contact__button chat-contact__button--ghost';
            button.addEventListener('click', () => {
                if (window.bgpChat && typeof window.bgpChat.open === 'function') {
                    window.bgpChat.open(identifier, displayName);
                }
            });

            const avatar = document.createElement('span');
            avatar.className = 'chat-contact__avatar';
            avatar.setAttribute('aria-hidden', 'true');
            if (player.avatarUrl) {
                const img = document.createElement('img');
                img.src = player.avatarUrl;
                img.alt = '';
                avatar.appendChild(img);
            } else {
                avatar.classList.add('avatar-placeholder');
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
            const actions = document.createElement('div');
            actions.className = 'chat-contact__actions';
            actions.appendChild(createProfileAction(identifier));
            li.appendChild(actions);
            fragment.appendChild(li);
        });
        strangersList.appendChild(fragment);
        showStrangerMessage('', false);
        updateStrangerEmptyState();
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
                    showStrangerMessage(strings.noStrangers, true);
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
                showStrangerMessage(strings.noStrangers, true);
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
            showStrangerMessage(strings.searchHint, false);
            return;
        }
        clearStrangerResults();
        showStrangerMessage(strings.searchHint, true);
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
        const shouldFlagUnread = (friend.unreadCount || 0) > 0;
        const hasUnreadClass = friend.element.classList.contains('is-unread');
        if (shouldFlagUnread && !hasUnreadClass) {
            friend.element.classList.add('is-unread');
        }
        if (!shouldFlagUnread && hasUnreadClass) {
            friend.element.classList.remove('is-unread');
        }
    }

    function updateConversationHeader(conversation) {
        const friend = getFriend(conversation.friendId);
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
        togglePanel(true);
        ensureConnectionStarted();
        ensureConversation(friendId, { focus: true, autoRead: true });
    }

    function openProfile(userId) {
        if (!userId) {
            return;
        }
        const url = `/dashboard/profile/${encodeURIComponent(userId)}`;
        window.open(url, '_blank', 'noopener');
    }

    function createProfileAction(userId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-contact__action';
        btn.title = strings.viewProfile;
        btn.setAttribute('aria-label', strings.viewProfile);
        btn.textContent = '👤';
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openProfile(userId);
        });
        return btn;
    }

    function createFriendElement(friend, options = {}) {
        const li = document.createElement('li');
        li.className = 'chat-contact';
        const button = document.createElement('button');
        button.type = 'button';
        const buttonClasses = ['chat-contact__button'];
        if (options.ghost) {
            buttonClasses.push('chat-contact__button--ghost');
        }
        button.className = buttonClasses.join(' ');
        button.addEventListener('click', () => openConversation(friend.userId));

        const avatar = document.createElement('span');
        avatar.className = 'chat-contact__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        if (friend.avatarUrl) {
            const img = document.createElement('img');
            img.src = friend.avatarUrl;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.classList.add('avatar-placeholder');
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
        const actions = document.createElement('div');
        actions.className = 'chat-contact__actions';
        actions.appendChild(createProfileAction(friend.userId));
        li.appendChild(actions);
        friend.element = li;
        updateFriendVisual(friend);
        return li;
    }

    async function ensureFriendLoaded(friendId, message) {
        if (hasFriend(friendId)) {
            return getFriend(friendId);
        }
        try {
            await loadFriends();
        } catch (err) {
            console.error('Friend list refresh failed.', err);
        }
        if (hasFriend(friendId)) {
            return getFriend(friendId);
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
            presence: PRESENCE_OFFLINE,
            isInvisible: false,
            unreadCount: 0,
            isFriend: false,
            lastNotifiedMessageId: null
        };
        setFriend(friend);
        if (friend.isFriend && friendsList) {
            friendsList.appendChild(createFriendElement(friend));
            applyFriendFilter();
            updateUnreadBadge();
        } else {
            ensureStrangerContact(friend);
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
            removeStrangerContact(friend.userId);
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
        let conversation = getConversation(friendId);
        const friend = getFriend(friendId);
        if (!friend) {
            return null;
        }

        if (!conversation) {
            conversation = createConversation(friend, options);
            setConversation(friend.userId, conversation);
        }

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
        avatar.setAttribute('aria-hidden', 'true');
        if (friend.avatarUrl) {
            const img = document.createElement('img');
            img.src = friend.avatarUrl;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.classList.add('avatar-placeholder');
        }

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

        const statusDot = document.createElement('span');
        statusDot.className = 'chat-window__status-dot';
        controls.appendChild(statusDot);

        const profileBtn = document.createElement('button');
        profileBtn.type = 'button';
        profileBtn.className = 'btn-icon';
        profileBtn.title = strings.viewProfile;
        profileBtn.setAttribute('aria-label', strings.viewProfile);
        profileBtn.textContent = '👤';
        profileBtn.addEventListener('click', () => openProfile(friend.userId));
        controls.appendChild(profileBtn);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-icon';
        closeBtn.title = strings.close;
        closeBtn.textContent = '✕';

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

        const conversation = {
            friendId: friend.userId,
            element,
            body,
            input,
            messages: new Map(),
            loaded: false,
            nameEl: name,
            statusEl: status,
            dotEl: statusDot,
            latestSentAtMs: null,
            latestMessageId: null,
            lastAttentionMessageId: null
        };

        closeBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            element.remove();
            deleteConversation(friend.userId);
        });

        header.addEventListener('click', (evt) => {
            if (evt.target.closest('button')) {
                return;
            }
            if (conversation.input) {
                conversation.input.focus();
            }
            markThreadRead(friend.userId);
        });

        const send = async () => {
            const message = input.value.trim();
            if (!message) {
                return;
            }
            input.value = '';
            const pendingId = registerPendingMessage(conversation, message);
            const sentViaSignalR = await trySendViaSignalR(friend.userId, message);
            if (sentViaSignalR) {
                return;
            }
            try {
                await sendMessageViaHttp(friend.userId, message);
            } catch (err) {
                console.error('Failed to send message.', err);

                markPendingMessageFailed(conversation, pendingId, message);
                input.value = message;
                input.focus();
            }

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

        
        updateConversationHeader(conversation);
        loadHistory(conversation, { markRead: options.autoRead === true })
            .catch((err) => console.error('Failed to load chat history.', err));

        return conversation;
    }

    function isConversationActive(conversation) {
        if (!conversation || !conversation.element) {
            return false;
        }
        if (conversation.element.classList.contains('chat-window--collapsed')) {
            return false;
        }
        if (document.visibilityState === 'hidden') {
            return false;
        }
        return true;
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

    function getMessageTimestamp(message) {
        if (!message) {
            return null;
        }
        const sentAt = toUtcDate(message.sentAtUtc);
        return sentAt ? sentAt.getTime() : null;
    }

    function updateConversationLatest(conversation, message) {
        if (!conversation || !message) {
            return;
        }
        const timestamp = getMessageTimestamp(message);
        if (timestamp && (!conversation.latestSentAtMs || timestamp > conversation.latestSentAtMs)) {
            conversation.latestSentAtMs = timestamp;
            conversation.latestMessageId = message.id || conversation.latestMessageId || null;
            return;
        }
        if (!conversation.latestMessageId && message.id) {
            conversation.latestMessageId = message.id;
        }
    }

    function isMessageAlreadySeen(friendId, message) {
        if (!message) {
            return false;
        }
        const entry = getLastSeenEntry(friendId);
        if (!entry) {
            return false;
        }
        if (entry.id && message.id && entry.id === message.id) {
            return true;
        }
        if (entry.sentAtUtc) {
            const seenDate = toUtcDate(entry.sentAtUtc);
            const messageDate = toUtcDate(message.sentAtUtc);
            if (seenDate && messageDate) {
                return messageDate.getTime() <= seenDate.getTime();
            }
        }
        return false;
    }

    function recordConversationSeen(conversation) {
        if (!conversation) {
            return;
        }
        const iso = conversation.latestSentAtMs
            ? new Date(conversation.latestSentAtMs).toISOString()
            : null;
        setLastSeenEntry(conversation.friendId, conversation.latestMessageId || null, iso);
        const friend = getFriend(conversation.friendId);
        if (friend) {
            friend.lastNotifiedMessageId = null;
        }
    }

    function triggerConversationAttention(conversation, message) {
        if (!conversation || !conversation.element) {
            return;
        }
        const messageId = message && message.id ? message.id : null;
        if (messageId && conversation.lastAttentionMessageId === messageId) {
            return;
        }
        conversation.lastAttentionMessageId = messageId;
        conversation.element.classList.remove('chat-window--attention');
        void conversation.element.offsetWidth;
        conversation.element.classList.add('chat-window--attention');
    }

    function renderMessage(conversation, message, options = {}) {
        const fromSelf = message.fromSelf === true || message.senderId === undefined || message.senderId !== conversation.friendId;
        const wrapper = document.createElement('div');
        const classNames = ['chat-message', fromSelf ? 'chat-message--me' : 'chat-message--peer'];
        if (message.isPending) {
            classNames.push('chat-message--pending');
        }
        if (message.sendError) {
            classNames.push('chat-message--error');
        }
        wrapper.className = classNames.join(' ');
        wrapper.dataset.messageId = message.id;

        const bubble = document.createElement('div');
        bubble.className = 'chat-message__bubble';
        bubble.textContent = message.content;
        wrapper.appendChild(bubble);

        const meta = document.createElement('div');
        meta.className = 'chat-message__meta';
        meta.textContent = getMessageMeta(message, fromSelf);
        wrapper.appendChild(meta);

        const shouldHighlight = !fromSelf && options.highlight !== false;
        if (shouldHighlight) {
            wrapper.classList.add('chat-message--highlight');
            setTimeout(() => wrapper.classList.remove('chat-message--highlight'), 2400);
        }

        conversation.body.appendChild(wrapper);
        conversation.messages.set(message.id, { element: wrapper, meta, data: message });
        conversation.body.scrollTop = conversation.body.scrollHeight;
        updateConversationLatest(conversation, message);
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
            history.forEach((msg) => renderMessage(conversation, msg, { highlight: false }));
            if (options.markRead) {
                markThreadRead(conversation.friendId);
            }
        } catch (err) {
            console.error('Chat history failed.', err);
        }
    }

    function addIncomingMessage(friendId, message) {
        const friend = getFriend(friendId);
        if (!friend) {
            return;
        }
        const conversation = ensureConversation(friendId, { focus: false, autoRead: false });
        if (!conversation) {
            return;
        }
        if (message.fromSelf && resolvePendingMessage(conversation, message)) {
            return;
        }
        const alreadySeen = isMessageAlreadySeen(friend.userId, message);
        const shouldHighlightBubble = !message.fromSelf && !alreadySeen;
        renderMessage(conversation, message, { highlight: shouldHighlightBubble });
        const senderMatchesFriend = typeof message.senderId === 'string'
            ? normalizeId(message.senderId) === normalizeId(friend.userId)
            : !message.fromSelf;
        const receiverMatchesSelf = typeof message.receiverId === 'string'
            ? !currentUserKey || normalizeId(message.receiverId) === currentUserKey
            : true;
        const shouldFlagUnread = !message.fromSelf && senderMatchesFriend && receiverMatchesSelf && !alreadySeen;

        if (shouldFlagUnread) {
            if (isConversationActive(conversation)) {
                markThreadRead(friendId);
            } else {
                const wasUnread = (friend.unreadCount || 0) > 0;
                friend.unreadCount = (friend.unreadCount || 0) + 1;
                friend.lastNotifiedMessageId = message.id || friend.lastNotifiedMessageId || null;
                updateFriendVisual(friend);
                updateUnreadBadge();
                if (!wasUnread) {
                    announceNewMessage(friend);
                }
                triggerConversationAttention(conversation, message);
            }
        } else if (!message.fromSelf) {
            updateFriendVisual(friend);
        }
    }

    function handleMessagesRead(payload) {
        const friendId = hasFriend(payload.userId) ? payload.userId : (hasFriend(payload.peerId) ? payload.peerId : null);
        if (!friendId) return;
        const conversation = getConversation(friendId);
        if (!conversation) return;
        payload.messageIds.forEach((id) => {
            const entry = conversation.messages.get(id);
            if (entry && entry.data) {
                entry.data.isRead = true;
                entry.data.readAtUtc = payload.readAtUtc;
                entry.meta.textContent = getMessageMeta(entry.data, true);
            }
        });
    }

    function markThreadRead(friendId) {
        const friend = getFriend(friendId);
        if (!friend) return;
        friend.unreadCount = 0;
        friend.lastNotifiedMessageId = null;
        updateFriendVisual(friend);
        updateUnreadBadge();
        const conversation = getConversation(friend.userId);
        if (conversation) {
            conversation.element.classList.remove('chat-window--attention');
            conversation.lastAttentionMessageId = null;
            recordConversationSeen(conversation);
        } else {
            setLastSeenEntry(friend.userId, null, new Date().toISOString());
        }
        ensureConnectionStarted().then((conn) => {
            if (!conn || conn.state !== 'Connected') {
                return;
            }
            conn.invoke('MarkThreadRead', friend.userId).catch(() => { /* ignore */ });
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
            const preservedStrangers = [];
            friends.forEach((friend) => {
                previousUnread.set(normalizeId(friend.userId), friend.unreadCount || 0);
                if (friend && friend.isFriend === false) {
                    preservedStrangers.push(friend);
                }
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
                            presence: normalizePresence(row.presence),
                            isInvisible: !!row.isInvisible,
                            unreadCount: previousUnread.get(normalizeId(row.userId)) || row.unreadCount || 0,
                            isFriend: true,
                            lastNotifiedMessageId: null
                        };
                        setFriend(friend);
                        accepted.push(friend);
                    } else if (row.status === 0 && row.outgoingRequest) {
                        outgoing.push(row);
                    } else if (row.status === 0) {
                        incoming.push(row);
                    }
                });

                renderFriends(accepted);
                renderRequests(incoming, outgoing);
                preservedStrangers.forEach((stranger) => {
                    if (hasFriend(stranger.userId)) {
                        removeStrangerContact(stranger.userId);
                        return;
                    }
                    stranger.unreadCount = previousUnread.get(normalizeId(stranger.userId)) || stranger.unreadCount || 0;
                    stranger.isFriend = false;
                    setFriend(stranger);
                    ensureStrangerContact(stranger);
                    flushPendingMessages(stranger.userId);
                });
                applyPendingPresence();
                conversations.forEach((conversation, id) => {
                    if (hasFriend(id)) {
                        updateConversationHeader(conversation);
                    } else {
                        conversation.element.remove();
                        deleteConversation(id);
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
            ensurePolling();
            return null;
        }
        if (connection) {
            if (connection.state === 'Disconnected') {
                try {
                    await connection.start();
                } catch (err) {
                    console.error('Chat connection failed to restart.', err);
                    connection = null;
                    ensurePolling();
                    return null;
                }
            }
            return connection;
        }

        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/chat')
            .withAutomaticReconnect()
            .build();

        connection.onclose(() => {
            ensurePolling();
            connection = null;
            connectionPromise = null;
        });

        connection.onreconnecting(() => {
            ensurePolling();
        });

        connection.onreconnected(() => {
            stopPolling();
        });

        connection.on('ReceiveMessage', (msg) => {
            deliverMessageFromServer(msg);
        });

        connection.on('MessagesRead', handleMessagesRead);

        connection.on('PresenceUpdated', (payload) => {
            if (!payload || !payload.userId) {
                return;
            }
            const presenceValue = normalizePresence(payload.presence);
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
            stopPolling();
            return connection;
        } catch (err) {
            console.error('Chat connection failed to start.', err);
            connection = null;
            ensurePolling();
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
            togglePanel(true);
            let friend = getFriend(userId);
            if (!friend) {
                friend = {
                    userId,
                    displayName,
                    avatarUrl: null,
                    statusMessage: '',
                    presence: PRESENCE_OFFLINE,
                    isInvisible: false,
                    unreadCount: 0,
                    isFriend: false,
                    lastNotifiedMessageId: null
                };
                setFriend(friend);
                ensureStrangerContact(friend);
            }
            if (displayName && displayName.trim() && friend.displayName !== displayName) {
                friend.displayName = displayName;
                updateFriendVisual(friend);
                const conversation = getConversation(userId);
                if (conversation) {
                    updateConversationHeader(conversation);
                }
            }

            const pending = getPendingPresence(userId);
            if (pending) {
                applyPresenceSnapshot(userId, pending);
            }
            ensureConversation(userId, { focus: true, autoRead: true });
        },
        openWithMessage: async (userId, displayName, presetMessage) => {
            window.bgpChat.open(userId, displayName);
            const conversation = getConversation(userId);
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
