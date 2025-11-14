(function () {
    const dock = document.getElementById('chatDock');
    if (!dock) {
        return;
    }

    const toggle = document.getElementById('chatToggle');
    const panel = document.getElementById('chatPanel');
    const closeBtn = panel ? panel.querySelector('[data-chat-close]') : null;
    const searchInput = panel ? panel.querySelector('[data-chat-search]') : null;
    const friendsList = panel ? panel.querySelector('[data-chat-active]') : null;
    const friendsEmpty = panel ? panel.querySelector('[data-chat-active-empty]') : null;
    const archivedList = panel ? panel.querySelector('[data-chat-archived]') : null;
    const archivedEmpty = panel ? panel.querySelector('[data-chat-archived-empty]') : null;
    const requestsList = panel ? panel.querySelector('[data-chat-requests]') : null;
    const requestsEmpty = panel ? panel.querySelector('[data-chat-requests-empty]') : null;
    const strangersList = panel ? panel.querySelector('[data-chat-strangers]') : null;
    const strangersEmpty = panel ? panel.querySelector('[data-chat-strangers-empty]') : null;
    const windowsContainer = dock.querySelector('[data-chat-windows]');
    const overflowToggle = dock.querySelector('[data-chat-overflow]');
    const overflowMenu = dock.querySelector('[data-chat-overflow-menu]');
    const overflowList = dock.querySelector('[data-chat-overflow-list]');
    const overflowCount = dock.querySelector('[data-chat-overflow-count]');
    const overflowClose = dock.querySelector('[data-chat-overflow-close]');
    const unreadBadge = dock.querySelector('[data-chat-unread]');
    const liveRegion = dock.querySelector('[data-chat-live]');
    const stringsElement = document.getElementById('chatStrings');
    const popoutLayer = dock.querySelector('[data-chat-popout]');
    const popoutBody = popoutLayer ? popoutLayer.querySelector('[data-chat-popout-body]') : null;
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
    const panelCollapseToggle = panel ? panel.querySelector('[data-chat-panel-toggle]') : null;
    const panelTitleToggle = panel ? panel.querySelector('[data-chat-panel-title]') : null;
    const currentUserId = dock.dataset.chatUser || null;
    const contextMenu = document.createElement('div');
    contextMenu.className = 'chat-context-menu';
    contextMenu.dataset.chatContext = '';
    contextMenu.hidden = true;
    contextMenu.innerHTML = `
        <div class="chat-context-menu__panel">
            <ul class="chat-context-menu__list" data-chat-context-list></ul>
        </div>`;
    dock.appendChild(contextMenu);
    const contextMenuList = contextMenu.querySelector('[data-chat-context-list]');

    const PRESENCE_AVAILABLE = 0;
    const PRESENCE_AWAY = 1;
    const PRESENCE_OFFLINE = 2;
    const PRESENCE_DND = 3;
    const TIME_GROUP_WINDOW_MS = 2 * 60 * 1000;
    const TIME_GAP_THRESHOLD_MS = 15 * 60 * 1000;

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
    const STORAGE_ARCHIVED_KEY = 'bgp.chat.archived';
    const STORAGE_PANEL_STATE_KEY = 'bgp.chat.panelState';
    const archivedThreads = loadArchivedThreads();
    let pollTimer = null;
    let pollInFlight = false;
    const POLL_INTERVAL_MS = 7000;
    let pollErrorLogged = false;
    let lastUnreadTotal = 0;
    const windowOrder = [];
    const MAX_VISIBLE_WINDOWS = 1;
    let activeConversationId = null;
    let popoutConversationId = null;
    let overflowMenuOpen = false;
    const emojiPalette = ['😀', '😁', '😂', '😎', '😍', '🤔', '👍', '🎉', '🔥', '❤️', '✅', '❗', '🙌', '🥳', '🤖', '🕹️', '🏆', '⚡'];
    const reactionPalette = ['👍', '❤️', '🔥', '😂', '🎉'];
    let panelCollapsedState = loadPanelCollapsedState();
    const mobileSheetQuery = typeof window !== 'undefined'
        ? window.matchMedia('(max-width: 1023px)')
        : { matches: false, addEventListener: () => { /* noop */ } };
    let threadViewForced = false;
    let contextMenuState = null;

    const strings = {
        readReceipt: 'Read at {0}',
        readReceiptLabel: 'Read',
        statusAvailable: 'Available',
        statusAway: 'Be right back',
        statusInvisible: 'Invisible',
        statusOffline: 'Offline',
        statusDnd: 'Do not disturb',
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
        sendError: 'Failed to send message',
        fabLabel: 'Messages',
        activeHeading: 'Active',
        archivedHeading: 'Archive',
        archivedEmpty: 'No archived threads',
        archive: 'Archive',
        unarchive: 'Restore',
        keepArchived: 'Keep archived',
        releaseArchived: 'Return when new messages arrive',
        archiveBadge: 'ARCHIWUM',
        popout: 'Pop out',
        overflow: 'More conversations',
        invite: 'Invite to game',
        searchThread: 'Search thread',
        searchThreadPlaceholder: 'Search messages…',
        searchThreadPrev: 'Prev',
        searchThreadNext: 'Next',
        searchThreadNone: 'No results',
        collapsePanel: 'Collapse chat list',
        expandPanel: 'Expand chat list',
        contextProfile: 'View profile',
        contextAddFriend: 'Add friend',
        contextRemoveFriend: 'Remove friend',
        contextInvite: 'Invite to game',
        contextArchive: 'Archive',
        contextRestore: 'Restore',
        contextKeep: 'Keep archived',
        contextRelease: 'Return to active',
        dayToday: 'Today',
        dayYesterday: 'Yesterday',
        timeMarker: '{0}',
        deliveredShort: 'Delivered',
        readShort: 'Read',
        threadBack: 'Back to list',
        reactionLabel: 'React',
        emojiLabel: 'Emoji',
        attachmentLabel: 'Attachment'
    };

    try {
        if (stringsElement) {
            const parsed = JSON.parse(stringsElement.textContent || '{}');
            Object.assign(strings, parsed);
        }
    } catch (err) {
        console.warn('Unable to parse chat strings.', err);
    }

    syncPanelCollapsedUi(panelCollapsedState);
    syncThreadViewState(false);

    if (mobileSheetQuery && typeof mobileSheetQuery.addEventListener === 'function') {
        mobileSheetQuery.addEventListener('change', () => {
            syncThreadViewState(!mobileSheetQuery.matches);
        });
    } else if (mobileSheetQuery && typeof mobileSheetQuery.addListener === 'function') {
        mobileSheetQuery.addListener(() => {
            syncThreadViewState(!mobileSheetQuery.matches);
        });
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

    function loadPanelCollapsedState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return false;
        }
        try {
            return window.localStorage.getItem(STORAGE_PANEL_STATE_KEY) === 'collapsed';
        } catch (err) {
            console.warn('Unable to load chat panel state.', err);
            return false;
        }
    }

    function persistPanelCollapsedState(collapsed) {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            window.localStorage.setItem(STORAGE_PANEL_STATE_KEY, collapsed ? 'collapsed' : 'expanded');
        } catch (err) {
            console.warn('Unable to persist chat panel state.', err);
        }
    }

    function syncPanelCollapsedUi(collapsed) {
        if (panel) {
            panel.classList.toggle('chat-panel--collapsed', !!collapsed);
        }
        if (panelCollapseToggle) {
            const isCollapsed = !!collapsed;
            panelCollapseToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            const label = isCollapsed
                ? (strings.expandPanel || strings.restore || strings.minimize)
                : (strings.collapsePanel || strings.minimize);
            panelCollapseToggle.setAttribute('aria-label', label);
            panelCollapseToggle.classList.toggle('is-collapsed', isCollapsed);
        }
        if (panelTitleToggle) {
            panelTitleToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
    }

    function setPanelCollapsed(collapsed) {
        const isCollapsed = !!collapsed;
        if (panelCollapsedState === isCollapsed) {
            syncPanelCollapsedUi(isCollapsed);
            return;
        }
        panelCollapsedState = isCollapsed;
        syncPanelCollapsedUi(isCollapsed);
        persistPanelCollapsedState(isCollapsed);
    }

    function togglePanelCollapsed(force) {
        const shouldCollapse = typeof force === 'boolean' ? force : !panelCollapsedState;
        setPanelCollapsed(shouldCollapse);
    }

    function isMobileSheet() {
        return !!(mobileSheetQuery && mobileSheetQuery.matches);
    }

    function syncThreadViewState(forceList) {
        if (!dock) {
            return;
        }
        if (!isMobileSheet() || forceList) {
            dock.classList.remove('is-thread-view');
            threadViewForced = false;
            return;
        }
        if (threadViewForced) {
            dock.classList.add('is-thread-view');
        }
    }

    function enterThreadView() {
        if (!isMobileSheet()) {
            return;
        }
        threadViewForced = true;
        dock.classList.add('is-thread-view');
    }

    function exitThreadView(forceList) {
        if (!isMobileSheet()) {
            return;
        }
        if (forceList) {
            threadViewForced = false;
        }
        dock.classList.remove('is-thread-view');
    }

    function dispatchChatEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(`bgp:chat:${name}`, { detail }));
    }

    function closeContextMenu() {
        if (!contextMenu) {
            return;
        }
        contextMenu.hidden = true;
        contextMenu.style.top = '';
        contextMenu.style.left = '';
        contextMenuState = null;
    }

    async function sendFriendRequest(userId) {
        if (!userId) {
            return;
        }
        try {
            const res = await fetch('/api/friends/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ targetUserId: userId })
            });
            if (!res.ok && res.status !== 409) {
                throw new Error('Request failed');
            }
        } catch (err) {
            console.error('Unable to send friend request.', err);
        }
        await loadFriends();
    }

    async function removeFriendship(userId) {
        if (!userId) {
            return;
        }
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(userId)}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (!res.ok && res.status !== 404) {
                throw new Error('Request failed');
            }
        } catch (err) {
            console.error('Unable to remove friend.', err);
        }
        await loadFriends();
    }

    function buildContextMenuItems(friend) {
        if (!friend) {
            return [];
        }
        const isFriend = friend.isFriend === true;
        const isArchived = friend.isArchived === true;
        const keepArchived = !!friend.keepArchived;
        const items = [];
        items.push({
            key: 'profile',
            label: strings.contextProfile || strings.viewProfile,
            action: () => openProfile(friend.userId)
        });
        items.push({
            key: 'friend',
            label: isFriend
                ? (strings.contextRemoveFriend || 'Remove friend')
                : (strings.contextAddFriend || 'Add friend'),
            action: () => (isFriend ? removeFriendship(friend.userId) : sendFriendRequest(friend.userId))
        });
        items.push({
            key: 'invite',
            label: strings.contextInvite || strings.invite,
            action: () => dispatchInvite(friend.userId, friend.displayName)
        });
        if (isFriend) {
            const archiveLabel = isArchived
                ? (strings.contextRestore || strings.unarchive)
                : (strings.contextArchive || strings.archive);
            items.push({
                key: 'archive',
                label: archiveLabel,
                action: () => toggleFriendArchive(friend.userId)
            });
            if (isArchived) {
                items.push({
                    key: 'keep',
                    label: keepArchived
                        ? (strings.contextRelease || strings.releaseArchived)
                        : (strings.contextKeep || strings.keepArchived),
                    action: () => toggleFriendKeepArchived(friend.userId)
                });
            }
        }
        return items;
    }

    function openContextMenu(friendId, anchor, friendOverride) {
        if (!contextMenu || !contextMenuList) {
            return;
        }
        const friend = getFriend(friendId) || friendOverride;
        if (!friend) {
            return;
        }
        const items = buildContextMenuItems(friend);
        contextMenuList.innerHTML = '';
        items.forEach((item) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = item.label;
            button.addEventListener('click', (event) => {
                event.preventDefault();
                closeContextMenu();
                if (typeof item.action === 'function') {
                    item.action();
                }
            });
            li.appendChild(button);
            contextMenuList.appendChild(li);
        });
        const rect = anchor && typeof anchor.getBoundingClientRect === 'function'
            ? anchor.getBoundingClientRect()
            : null;
        const fallbackX = (anchor && anchor.clientX) || 0;
        const fallbackY = (anchor && anchor.clientY) || 0;
        const x = rect ? rect.left : fallbackX;
        const y = rect ? rect.bottom : fallbackY;
        const maxX = Math.max(0, window.innerWidth - 220);
        const maxY = Math.max(0, window.innerHeight - 260);
        contextMenu.style.left = `${Math.min(x, maxX)}px`;
        contextMenu.style.top = `${Math.min(y, maxY)}px`;
        contextMenu.hidden = false;
        contextMenuState = { friendId };
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

    function loadArchivedThreads() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return new Map();
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_ARCHIVED_KEY);
            if (!raw) {
                return new Map();
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return new Map();
            }
            const entries = Object.entries(parsed).map(([key, value]) => [
                normalizeId(key),
                { keep: !!(value && value.keep) }
            ]);
            return new Map(entries);
        } catch (err) {
            console.warn('Unable to load archived threads.', err);
            return new Map();
        }
    }

    function persistArchivedThreads() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            const payload = {};
            archivedThreads.forEach((value, key) => {
                payload[key] = { keep: !!(value && value.keep) };
            });
            window.localStorage.setItem(STORAGE_ARCHIVED_KEY, JSON.stringify(payload));
        } catch (err) {
            console.warn('Unable to persist archived threads.', err);
        }
    }

    function getArchiveEntry(friendId) {
        if (!friendId) {
            return null;
        }
        return archivedThreads.get(normalizeId(friendId)) || null;
    }

    function setArchiveEntry(friendId, keep) {
        if (!friendId) {
            return;
        }
        archivedThreads.set(normalizeId(friendId), { keep: !!keep });
        persistArchivedThreads();
    }

    function clearArchiveEntry(friendId) {
        if (!friendId) {
            return;
        }
        archivedThreads.delete(normalizeId(friendId));
        persistArchivedThreads();
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

    function isThreadArchived(friendId) {
        if (!friendId) {
            return false;
        }
        return archivedThreads.has(normalizeId(friendId));
    }

    function shouldKeepArchived(friendId) {
        const entry = getArchiveEntry(friendId);
        return !!(entry && entry.keep);
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
        if (presence === PRESENCE_DND) {
            return strings.statusDnd;
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
        if (presence === PRESENCE_DND) {
            return 'dnd';
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
        if (value === 'dnd') {
            return { presence: PRESENCE_DND, isInvisible: false };
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
            panel.setAttribute('aria-hidden', 'false');
            if (searchInput) {
                searchInput.focus();
            }
        } else {
            dock.classList.remove('is-open');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
            }
            panel.setAttribute('aria-hidden', 'true');
            setStatusMenu(false);
            closeContextMenu();
            exitThreadView(true);
        }
    }

    if (toggle) {
        toggle.addEventListener('click', () => togglePanel());
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => togglePanel(false));
    }

    if (panelCollapseToggle) {
        panelCollapseToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePanelCollapsed();
        });
    }

    if (panelTitleToggle) {
        panelTitleToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePanelCollapsed();
        });
        panelTitleToggle.addEventListener('keydown', (event) => {
            const key = event.key || '';
            if (key === 'Enter' || key === ' ') {
                event.preventDefault();
                togglePanelCollapsed();
            }
        });
    }

    if (panelHeader) {
        panelHeader.addEventListener('click', (event) => {
            const closeTarget = event.target.closest('[data-chat-close]');
            if (closeTarget) {
                return;
            }
            if (event.target.closest('[data-chat-panel-toggle]')) {
                return;
            }
            event.preventDefault();
            togglePanelCollapsed();
        });
    }

    function focusChatSearch(options = {}) {
        togglePanel(true);
        if (!searchInput) {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(options, 'value')) {
            searchInput.value = options.value;
        }
        searchInput.focus();
        searchInput.select();
        if (options.dispatchInput) {
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    document.addEventListener('keydown', (evt) => {
        const key = evt.key || '';
        const lower = key.toLowerCase();
        if (key === 'Escape') {
            if (contextMenuState) {
                closeContextMenu();
            }
            if (popoutConversationId) {
                closePopout();
                return;
            }
            if (statusMenuOpen) {
                setStatusMenu(false);
                return;
            }
            closeOverflowMenu();
            if (isMobileSheet() && dock.classList.contains('is-thread-view')) {
                exitThreadView(true);
                return;
            }
            if (dock.classList.contains('is-open')) {
                togglePanel(false);
            }
            return;
        }
        if (evt.ctrlKey && !evt.shiftKey && !evt.altKey) {
            if (lower === 'k') {
                evt.preventDefault();
                focusChatSearch();
                return;
            }
            if (lower === 'n') {
                evt.preventDefault();
                focusChatSearch({ value: '', dispatchInput: true });
                return;
            }
            if (lower === 'g') {
                evt.preventDefault();
                focusChatSearch({ value: '@', dispatchInput: true });
                return;
            }
        }
        if (evt.ctrlKey && !evt.shiftKey && !evt.altKey && lower === 'f') {
            const active = getActiveConversation();
            if (active) {
                evt.preventDefault();
                toggleThreadSearch(active, true);
            }
            return;
        }
        if (evt.ctrlKey && evt.shiftKey && !evt.altKey && lower === 'a') {
            const active = getActiveConversation();
            if (active) {
                evt.preventDefault();
                toggleFriendArchive(active.friendId);
            }
            return;
        }
        if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && lower === 'delete' && panelContainsFocus()) {
            const friendId = getFocusedFriendId();
            if (friendId) {
                evt.preventDefault();
                toggleFriendArchive(friendId);
            }
            return;
        }
        if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && (key === 'ArrowDown' || key === 'ArrowUp') && panelContainsFocus()) {
            evt.preventDefault();
            focusRelativeContact(key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && key === 'Enter' && panelContainsFocus()) {
            const friendId = getFocusedFriendId();
            if (friendId) {
                evt.preventDefault();
                openConversation(friendId);
            }
        }
    });

    if (panelHeader) {
        panelHeader.addEventListener('click', (evt) => {
            const buttonTarget = evt.target.closest('button');
            if (buttonTarget && (buttonTarget.hasAttribute('data-chat-close') || buttonTarget.hasAttribute('data-chat-panel-toggle'))) {
                return;
            }
            togglePanelCollapsed();
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
    
    document.addEventListener('click', (evt) => {
        const target = evt.target;
        if (overflowMenuOpen && overflowMenu && overflowToggle) {
            if (!target || !(target instanceof Node)) {
                closeOverflowMenu();
            } else if (!overflowMenu.contains(target) && !overflowToggle.contains(target)) {
                closeOverflowMenu();
            }
        }
        if (dock && target instanceof Node && !dock.contains(target)) {
            closeAllEmojiPickers();
        }
        if (contextMenuState && contextMenu && target instanceof Node) {
            if (!contextMenu.contains(target) && !target.closest('[data-chat-context-trigger]')) {
                closeContextMenu();
            }
        }
    });

    window.addEventListener('resize', () => closeContextMenu());

    dock.addEventListener('contextmenu', (evt) => {
        const contactTarget = evt.target.closest('[data-chat-friend]');
        const windowHeader = evt.target.closest('[data-chat-window-header]');
        if (!contactTarget && !windowHeader) {
            return;
        }
        evt.preventDefault();
        evt.stopPropagation();
        const friendId = contactTarget ? contactTarget.dataset.chatFriend : (windowHeader ? windowHeader.dataset.chatWindowHeader : null);
        if (!friendId) {
            return;
        }
        const anchor = contactTarget || windowHeader || evt;
        openContextMenu(friendId, anchor);
    }, { capture: true });

    if (overflowToggle) {
        overflowToggle.addEventListener('click', (evt) => {
            evt.preventDefault();
            if (overflowMenuOpen) {
                closeOverflowMenu();
            } else {
                openOverflowMenu();
            }
        });
    }

    if (overflowClose) {
        overflowClose.addEventListener('click', () => closeOverflowMenu());
    }

    if (popoutLayer) {
        popoutLayer.addEventListener('click', (evt) => {
            const target = evt.target;
            if (target instanceof Element && target.closest('[data-chat-popout-dismiss]')) {
                evt.preventDefault();
                closePopout();
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
        if (!friend.isInvisible && friend.presence === PRESENCE_DND) {
            return 2;
        }
        if (friend.isInvisible) {
            return 3;
        }
        return 4;
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
        dotEl.classList.remove('is-online', 'is-away', 'is-offline', 'is-invisible', 'is-dnd');
        if (friend.isInvisible) {
            dotEl.classList.add('is-invisible');
        } else if (friend.presence === PRESENCE_AVAILABLE) {
            dotEl.classList.add('is-online');
        } else if (friend.presence === PRESENCE_AWAY) {
            dotEl.classList.add('is-away');
        } else if (friend.presence === PRESENCE_DND) {
            dotEl.classList.add('is-dnd');
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
        if (total === 0) {
            unreadBadge.classList.remove('is-pulsing');
        } else if (total > lastUnreadTotal) {
            pulseUnreadBadge();
        }
        lastUnreadTotal = total;
    }

    function pulseUnreadBadge() {
        if (!unreadBadge) {
            return;
        }
        unreadBadge.classList.remove('is-pulsing');
        void unreadBadge.offsetWidth;
        unreadBadge.classList.add('is-pulsing');
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
        const sentLabel = formatTimeLabel(message.sentAtUtc);
        if (!fromSelf) {
            return sentLabel || formatDateTime(message.sentAtUtc);
        }
        if (message.sendError) {
            return strings.sendError;
        }
        if (message.isPending) {
            return strings.sending;
        }
        if (message.isRead && message.readAtUtc) {
            const readLabel = formatTimeLabel(message.readAtUtc) || sentLabel;
            return `✓✓ ${readLabel || strings.readShort || strings.readReceiptLabel}`;
        }
        return `✓ ${sentLabel || strings.deliveredShort || strings.deliveredReceiptLabel}`;
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
        if (entry.group) {
            entry.group.lastMessage = entry.data;
            updateGroupMeta(entry.group);
        }
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
                if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === entry.data.id)) {
                    entry.group.lastMessage = entry.data;
                }
                updateGroupMeta(entry.group);
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
        if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === entry.data.id)) {
            entry.group.lastMessage = entry.data;
        }
        updateGroupMeta(entry.group);
    }

    function applyFriendFilter() {
        let visibleActive = 0;
        let visibleArchived = 0;
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
                    if (friend.isArchived) {
                        visibleArchived++;
                    } else {
                        visibleActive++;
                    }
                } else {
                    visibleStrangers++;
                }
            }
        });

        updateActiveEmptyState(visibleActive);
        updateArchivedEmptyState(visibleArchived);
        updateStrangerEmptyState(visibleStrangers);
    }

    function updateActiveEmptyState(count) {
        if (!friendsEmpty) {
            return;
        }

        const hasFriends = Array.from(friends.values()).some((f) => f.isFriend && !f.isArchived);
        friendsEmpty.textContent = searchTerm && hasFriends ? strings.noMatches : strings.noFriends;
        friendsEmpty.style.display = count > 0 ? 'none' : 'block';
    }

    function updateArchivedEmptyState(count) {
        if (!archivedEmpty) {
            return;
        }
        const hasArchived = Array.from(friends.values()).some((f) => f.isFriend && f.isArchived);
        archivedEmpty.textContent = searchTerm && hasArchived ? strings.noMatches : (strings.archivedEmpty || strings.noMatches);
        archivedEmpty.style.display = count > 0 ? 'none' : 'block';
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
            li.dataset.chatFriend = identifier;

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
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'chat-contact__menu';
            menuBtn.dataset.chatContextTrigger = identifier;
            menuBtn.setAttribute('aria-label', strings.contextProfile || 'More options');
            menuBtn.innerHTML = '⋮';
            menuBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openContextMenu(identifier, menuBtn, {
                    userId: identifier,
                    displayName,
                    isFriend: false,
                    avatarUrl: player.avatarUrl || null,
                    isArchived: false,
                    keepArchived: false,
                    isBlocked: false
                });
            });
            actions.appendChild(menuBtn);
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
        updateFriendPlacement(friend);
        if (friend.tagEl) {
            friend.tagEl.hidden = !friend.isArchived;
        }
    }

    function updateFriendPlacement(friend) {
        if (!friend || !friend.element) {
            return;
        }
        if (friend.isFriend) {
            const target = friend.isArchived ? archivedList : friendsList;
            if (target && target !== friend.element.parentElement) {
                target.appendChild(friend.element);
            }
        }
        friend.element.classList.toggle('is-archived', !!friend.isArchived);
    }


    function setFriendArchived(friendId, archived, keep) {
        const friend = getFriend(friendId);
        if (!friend || !friend.isFriend) {
            return;
        }
        friend.isArchived = !!archived;
        friend.keepArchived = friend.isArchived && !!keep;
        if (friend.isArchived) {
            setArchiveEntry(friend.userId, friend.keepArchived);
        } else {
            clearArchiveEntry(friend.userId);
        }
        updateFriendPlacement(friend);
        updateFriendVisual(friend);
        const conversation = getConversation(friend.userId);
        if (conversation) {
            syncConversationArchiveControl(conversation);
        }
        applyFriendFilter();
    }

    function toggleFriendArchive(friendId) {
        const friend = getFriend(friendId);
        if (!friend) {
            return;
        }
        setFriendArchived(friendId, !friend.isArchived, friend.keepArchived);
    }

    function toggleFriendKeepArchived(friendId) {
        const friend = getFriend(friendId);
        if (!friend || !friend.isArchived) {
            return;
        }
        setFriendArchived(friendId, true, !friend.keepArchived);
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
        syncConversationArchiveControl(conversation);
    }

    function syncConversationArchiveControl(conversation) {
        if (!conversation || !conversation.archiveBtn) {
            return;
        }
        const friend = getFriend(conversation.friendId);
        if (!friend) {
            conversation.archiveBtn.hidden = true;
            return;
        }
        conversation.archiveBtn.hidden = false;
        const label = friend.isArchived ? (strings.unarchive || strings.contextRestore || 'Restore') : (strings.archive || strings.contextArchive || 'Archive');
        conversation.archiveBtn.setAttribute('aria-label', label);
        conversation.archiveBtn.title = label;
        conversation.archiveBtn.textContent = friend.isArchived ? '↩' : '⬇';
    }

    function openConversation(friendId) {
        togglePanel(true);
        ensureConnectionStarted();
        const conversation = ensureConversation(friendId, { focus: true, autoRead: true });
        if (conversation && isMobileSheet()) {
            enterThreadView();
        }
    }

    function openProfile(userId) {
        if (!userId) {
            return;
        }
        const url = `/dashboard/profile/${encodeURIComponent(userId)}`;
        window.open(url, '_blank', 'noopener');
    }

    function dispatchInvite(userId, displayName) {
        const detail = { userId, displayName };
        document.dispatchEvent(new CustomEvent('bgp:chat:invite', { detail }));
    }

    function createFriendElement(friend, options = {}) {
        const li = document.createElement('li');
        li.className = 'chat-contact';
        li.dataset.chatFriend = friend.userId;
        const button = document.createElement('button');
        button.type = 'button';
        const buttonClasses = ['chat-contact__button'];
        if (options.ghost) {
            buttonClasses.push('chat-contact__button--ghost');
        }
        button.dataset.chatItem = 'contact';
        button.dataset.chatFriend = friend.userId;
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

        const archiveTag = document.createElement('span');
        archiveTag.className = 'chat-contact__tag';
        archiveTag.textContent = strings.archiveBadge || strings.archivedHeading || 'ARCHIVE';
        archiveTag.hidden = true;
        meta.appendChild(archiveTag);

        button.appendChild(avatar);
        button.appendChild(meta);
        li.appendChild(button);
        const actions = document.createElement('div');
        actions.className = 'chat-contact__actions';
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'chat-contact__menu';
        menuBtn.dataset.chatContextTrigger = friend.userId;
        const contextLabel = strings.contextProfile || strings.contextInvite || 'More options';
        menuBtn.setAttribute('aria-label', contextLabel);
        menuBtn.innerHTML = '⋮';
        menuBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(friend.userId, menuBtn);
        });
        actions.appendChild(menuBtn);
        li.appendChild(actions);
        friend.element = li;
        friend.tagEl = archiveTag;
        friend.menuButton = menuBtn;
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
            isArchived: false,
            keepArchived: false,
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
        if (friendsList) {
            friendsList.innerHTML = '';
        }
        if (archivedList) {
            archivedList.innerHTML = '';
        }
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
            friend.isArchived = friend.isArchived === true;
            friend.keepArchived = friend.isArchived && shouldKeepArchived(friend.userId);
            removeStrangerContact(friend.userId);
            if (!friend.element) {
                createFriendElement(friend);
            }
            updateFriendPlacement(friend);
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
            registerConversation(conversation);
        }

        if (windowsContainer && conversation.element
            && !conversation.element.classList.contains('chat-window--popout')
            && conversation.element.parentElement !== windowsContainer) {
            windowsContainer.appendChild(conversation.element);
        }
        updateConversationHeader(conversation);
        const shouldAutoRead = options.autoRead === true;
        const shouldFocus = options.focus !== false;
        if (shouldAutoRead) {
            markThreadRead(friendId);
        }
        if (shouldFocus) {
            setActiveConversation(conversation);
            if (conversation.input) {
                conversation.input.focus();
            }
        } else {
            syncConversationVisibility();
        }
        return conversation;
    }

    function createConversation(friend, options = {}) {
        const element = document.createElement('section');
        element.className = 'chat-window';
        element.classList.add('chat-window--collapsed');
        element.dataset.friendId = friend.userId;

        const header = document.createElement('div');
        header.className = 'chat-window__header';
        header.dataset.chatWindowHeader = friend.userId;

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'chat-window__back';
        backBtn.setAttribute('aria-label', strings.threadBack || 'Back to list');
        backBtn.innerHTML = '←';
        backBtn.addEventListener('click', (event) => {
            event.preventDefault();
            exitThreadView(true);
        });
        header.appendChild(backBtn);

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

        const badge = document.createElement('span');
        badge.className = 'chat-window__badge';
        badge.hidden = true;
        controls.appendChild(badge);

        const archiveBtn = document.createElement('button');
        archiveBtn.type = 'button';
        archiveBtn.className = 'btn-icon';
        archiveBtn.addEventListener('click', (event) => {
            event.preventDefault();
            toggleFriendArchive(friend.userId);
        });
        controls.appendChild(archiveBtn);

        const profileBtn = document.createElement('button');
        profileBtn.type = 'button';
        profileBtn.className = 'btn-icon';
        profileBtn.title = strings.viewProfile;
        profileBtn.setAttribute('aria-label', strings.viewProfile);
        profileBtn.textContent = '👤';
        profileBtn.addEventListener('click', () => openProfile(friend.userId));
        controls.appendChild(profileBtn);

        const popoutBtn = document.createElement('button');
        popoutBtn.type = 'button';
        popoutBtn.className = 'btn-icon';
        popoutBtn.title = strings.popout;
        popoutBtn.setAttribute('aria-label', strings.popout);
        popoutBtn.textContent = '↗';
        controls.appendChild(popoutBtn);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-icon';
        closeBtn.title = strings.close;
        closeBtn.textContent = '✕';

        controls.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(controls);

        const searchBar = document.createElement('div');
        searchBar.className = 'chat-window__search';
        searchBar.hidden = true;

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = strings.searchThreadPlaceholder;
        searchBar.appendChild(searchInput);

        const searchControls = document.createElement('div');
        searchControls.className = 'chat-window__search-controls';
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.textContent = strings.searchThreadPrev;
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.textContent = strings.searchThreadNext;
        const searchStatus = document.createElement('span');
        searchStatus.className = 'chat-window__search-status';
        searchControls.appendChild(prevBtn);
        searchControls.appendChild(nextBtn);
        searchControls.appendChild(searchStatus);
        searchBar.appendChild(searchControls);


        const body = document.createElement('div');
        body.className = 'chat-window__body';

        const inputWrap = document.createElement('div');
        inputWrap.className = 'chat-window__input';

        const composer = document.createElement('div');
        composer.className = 'chat-window__composer';

        const input = document.createElement('textarea');
        input.rows = 1;
        input.autocomplete = 'off';
        input.maxLength = 2000;
        input.placeholder = strings.writePlaceholder;
        composer.appendChild(input);

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'chat-window__send';
        sendBtn.setAttribute('aria-label', strings.send);
        sendBtn.title = strings.send;
        sendBtn.innerHTML = '➤';
        composer.appendChild(sendBtn);

        const actions = document.createElement('div');
        actions.className = 'chat-window__actions';

        const emojiBtn = document.createElement('button');
        emojiBtn.type = 'button';
        emojiBtn.title = strings.emojiLabel || 'Emoji';
        emojiBtn.textContent = '🙂';
        actions.appendChild(emojiBtn);

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.title = strings.attachmentLabel || 'Attachment';
        attachBtn.textContent = '📎';
        actions.appendChild(attachBtn);

        const emojiPicker = document.createElement('div');
        emojiPicker.className = 'chat-emoji-picker';
        emojiPicker.hidden = true;
        emojiPalette.forEach((emoji) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.textContent = emoji;
            option.addEventListener('click', (event) => {
                event.preventDefault();
                insertTextAtCursor(input, `${emoji} `);
                autoGrowInput(input);
                toggleEmojiPicker(conversation, false);
            });
            emojiPicker.appendChild(option);
        });

        inputWrap.appendChild(composer);
        inputWrap.appendChild(actions);
        inputWrap.appendChild(emojiPicker);

        element.appendChild(header);
        element.appendChild(searchBar);
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
            searchBar,
            searchInput,
            searchStatus,
            searchMatches: [],
            searchIndex: -1,
            searchVisible: false,
            badgeEl: badge,
            unreadBadge: 0,
            emojiPicker,
            emojiToggle: emojiBtn,
            latestSentAtMs: null,
            latestMessageId: null,
            lastAttentionMessageId: null,
            archiveBtn,
            timeline: {
                lastGroup: null,
                lastMessageMs: null,
                lastDayKey: null
            }
        };

        closeBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            destroyConversation(conversation);
        });

        popoutBtn.addEventListener('click', (evt) => {
            evt.preventDefault();
            if (popoutConversationId && normalizeId(popoutConversationId) === normalizeId(friend.userId)) {
                closePopout();
            } else {
                openPopout(conversation);
            }
        });

        header.addEventListener('click', (evt) => {
            if (evt.target.closest('button')) {
                return;
            }
            if (conversation.input) {
                conversation.input.focus();
            }
            setActiveConversation(conversation);
            markThreadRead(friend.userId);
        });

        element.addEventListener('mousedown', () => setActiveConversation(conversation));

        const send = async () => {
            const value = input.value;
            if (!value || !value.trim()) {
                return;
            }
            input.value = '';
            autoGrowInput(input);
            const pendingId = registerPendingMessage(conversation, value);
            const sentViaSignalR = await trySendViaSignalR(friend.userId, value);
            if (sentViaSignalR) {
                return;
            }
            try {
                await sendMessageViaHttp(friend.userId, value);
            } catch (err) {
                console.error('Failed to send message.', err);

                markPendingMessageFailed(conversation, pendingId, value);
                input.value = value;
                autoGrowInput(input);
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

        input.addEventListener('input', () => autoGrowInput(input));
        input.addEventListener('focus', () => {
            setActiveConversation(conversation);
            markThreadRead(friend.userId);
        });
        body.addEventListener('mouseenter', () => {
            setActiveConversation(conversation);
            markThreadRead(friend.userId);
        });
        body.addEventListener('scroll', () => handleConversationScroll(conversation));

        searchInput.addEventListener('input', () => runThreadSearch(conversation, searchInput.value));
        prevBtn.addEventListener('click', (event) => {
            event.preventDefault();
            stepThreadSearch(conversation, -1);
        });
        nextBtn.addEventListener('click', (event) => {
            event.preventDefault();
            stepThreadSearch(conversation, 1);
        });

        emojiBtn.addEventListener('click', (event) => {
            event.preventDefault();
            toggleEmojiPicker(conversation);
        });

        attachBtn.addEventListener('click', (event) => {
            event.preventDefault();
            dispatchAttachment(friend.userId);
        });

        autoGrowInput(input);

        
        updateConversationHeader(conversation);
        loadHistory(conversation, { markRead: options.autoRead === true })
            .catch((err) => console.error('Failed to load chat history.', err));

        return conversation;
    }

    function autoGrowInput(textarea) {
        if (!textarea) {
            return;
        }
        textarea.style.height = 'auto';
        const styles = typeof window !== 'undefined' && window.getComputedStyle
            ? window.getComputedStyle(textarea)
            : null;
        const lineHeight = styles ? parseFloat(styles.lineHeight || '0') : 20;
        const maxHeight = Math.max(lineHeight * 4, 120);
        textarea.style.height = `${Math.min(maxHeight, Math.max(textarea.scrollHeight, lineHeight))}px`;
    }

    function insertTextAtCursor(input, value) {
        if (!input) {
            return;
        }
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const text = input.value || '';
        input.value = `${text.slice(0, start)}${value}${text.slice(end)}`;
        const next = start + value.length;
        if (typeof input.setSelectionRange === 'function') {
            input.setSelectionRange(next, next);
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function toggleEmojiPicker(conversation, force) {
        if (!conversation || !conversation.emojiPicker) {
            return;
        }
        const shouldOpen = typeof force === 'boolean' ? force : conversation.emojiPicker.hidden;
        conversations.forEach((other) => {
            if (other !== conversation && other.emojiPicker) {
                other.emojiPicker.hidden = true;
            }
        });
        conversation.emojiPicker.hidden = !shouldOpen;
        if (shouldOpen && conversation.input) {
            conversation.input.focus();
        }
    }

    function closeAllEmojiPickers() {
        conversations.forEach((conversation) => {
            if (conversation.emojiPicker) {
                conversation.emojiPicker.hidden = true;
            }
        });
    }

    function dispatchAttachment(userId) {
        const detail = { userId };
        document.dispatchEvent(new CustomEvent('bgp:chat:attachment', { detail }));
    }

    function pushWindowToOrder(friendId) {
        const key = normalizeId(friendId);
        if (!key) {
            return;
        }
        const index = windowOrder.indexOf(key);
        if (index !== -1) {
            windowOrder.splice(index, 1);
        }
        windowOrder.push(key);
    }

    function removeWindowFromOrder(friendId) {
        const key = normalizeId(friendId);
        if (!key) {
            return;
        }
        const index = windowOrder.indexOf(key);
        if (index !== -1) {
            windowOrder.splice(index, 1);
        }
    }

    function setConversationCollapsed(conversation, collapsed) {
        if (!conversation || !conversation.element) {
            return;
        }
        conversation.element.classList.toggle('chat-window--collapsed', !!collapsed);
    }

    function syncConversationVisibility() {
        const activeKey = normalizeId(activeConversationId);
        conversations.forEach((conversation, key) => {
            if (!conversation || !conversation.element) {
                return;
            }
            const inPopout = popoutConversationId && normalizeId(popoutConversationId) === key;
            const shouldCollapse = !inPopout && (!activeKey || key !== activeKey);
            setConversationCollapsed(conversation, shouldCollapse);
        });
    }

    function findFallbackConversation() {
        for (let i = windowOrder.length - 1; i >= 0; i -= 1) {
            const id = windowOrder[i];
            if (id && conversations.has(id)) {
                return conversations.get(id);
            }
        }
        return null;
    }

    function setActiveConversation(conversation) {
        if (!conversation) {
            return;
        }
        activeConversationId = conversation.friendId;
        pushWindowToOrder(conversation.friendId);
        layoutDockWindows();
        syncConversationVisibility();
    }

    function getActiveConversation() {
        if (!activeConversationId) {
            return null;
        }
        return getConversation(activeConversationId);
    }

    function registerConversation(conversation) {
        if (!conversation || !conversation.element || !windowsContainer) {
            return;
        }
        windowsContainer.appendChild(conversation.element);
        pushWindowToOrder(conversation.friendId);
        layoutDockWindows();
        syncConversationVisibility();
    }

    function layoutDockWindows() {
        if (!windowsContainer) {
            return;
        }
        const availableIds = windowOrder.filter((id) => id && conversations.has(id)
            && (!popoutConversationId || normalizeId(popoutConversationId) !== id));
        const total = availableIds.length;
        const visible = availableIds.slice(Math.max(0, total - MAX_VISIBLE_WINDOWS));
        const hidden = availableIds.slice(0, Math.max(0, total - MAX_VISIBLE_WINDOWS));
        visible.forEach((id) => {
            const conversation = conversations.get(id);
            if (conversation && conversation.element) {
                conversation.element.classList.remove('chat-window--stacked');
                if (conversation.element.parentElement !== windowsContainer) {
                    windowsContainer.appendChild(conversation.element);
                }
            }
        });
        hidden.forEach((id) => {
            const conversation = conversations.get(id);
            if (conversation && conversation.element) {
                conversation.element.classList.add('chat-window--stacked');
                if (conversation.element.parentElement !== windowsContainer) {
                    windowsContainer.appendChild(conversation.element);
                }
            }
        });
        if (overflowCount) {
            overflowCount.textContent = String(hidden.length);
        }
        if (overflowToggle) {
            overflowToggle.hidden = hidden.length === 0;
            overflowToggle.setAttribute('aria-expanded', overflowMenuOpen ? 'true' : 'false');
        }
        updateOverflowMenu(hidden);
        syncConversationVisibility();
    }

    function updateOverflowMenu(hiddenIds) {
        if (!overflowList) {
            return;
        }
        overflowList.innerHTML = '';
        hiddenIds.forEach((id) => {
            const friend = getFriend(id);
            if (!friend) {
                return;
            }
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = friend.displayName;
            button.addEventListener('click', () => {
                ensureConversation(friend.userId, { focus: true, autoRead: true });
                closeOverflowMenu();
            });
            item.appendChild(button);
            overflowList.appendChild(item);
        });
        if (hiddenIds.length === 0) {
            closeOverflowMenu();
        }
    }

    function openOverflowMenu() {
        if (!overflowMenu) {
            return;
        }
        overflowMenu.hidden = false;
        overflowMenuOpen = true;
        if (overflowToggle) {
            overflowToggle.setAttribute('aria-expanded', 'true');
        }
    }

    function closeOverflowMenu() {
        if (!overflowMenu) {
            return;
        }
        overflowMenu.hidden = true;
        overflowMenuOpen = false;
        if (overflowToggle) {
            overflowToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function toggleThreadSearch(conversation, force) {
        if (!conversation || !conversation.searchBar) {
            return;
        }
        const shouldOpen = typeof force === 'boolean' ? force : !conversation.searchVisible;
        conversation.searchVisible = shouldOpen;
        if (typeof conversation.searchBar.toggleAttribute === 'function') {
            conversation.searchBar.toggleAttribute('hidden', !shouldOpen);
        } else {
            conversation.searchBar.hidden = !shouldOpen;
        }
        if (shouldOpen && conversation.searchInput) {
            conversation.searchInput.focus();
            conversation.searchInput.select();
            runThreadSearch(conversation, conversation.searchInput.value);
        } else {
            clearThreadSearch(conversation);
        }
    }

    function runThreadSearch(conversation, term) {
        if (!conversation) {
            return;
        }
        const query = (term || '').trim().toLowerCase();
        conversation.searchMatches = [];
        conversation.searchIndex = -1;
        if (!query) {
            clearThreadSearch(conversation);
            return;
        }
        conversation.messages.forEach((entry) => {
            if (!entry || !entry.data || !entry.data.content) {
                return;
            }
            const content = entry.data.content.toLowerCase();
            if (content.includes(query)) {
                conversation.searchMatches.push(entry);
            }
            entry.element.classList.remove('chat-message--search-hit');
        });
        if (conversation.searchMatches.length > 0) {
            conversation.searchIndex = 0;
            stepThreadSearch(conversation, 0);
        } else if (conversation.searchStatus) {
            conversation.searchStatus.textContent = strings.searchThreadNone;
        }
    }

    function clearThreadSearch(conversation) {
        if (!conversation) {
            return;
        }
        conversation.searchMatches.forEach((entry) => {
            if (entry && entry.element) {
                entry.element.classList.remove('chat-message--search-hit');
            }
        });
        conversation.searchMatches = [];
        conversation.searchIndex = -1;
        if (conversation.searchStatus) {
            conversation.searchStatus.textContent = '';
        }
    }

    function stepThreadSearch(conversation, delta) {
        if (!conversation || !conversation.searchMatches.length) {
            return;
        }
        if (typeof delta === 'number' && delta !== 0) {
            conversation.searchIndex = (conversation.searchIndex + delta + conversation.searchMatches.length)
                % conversation.searchMatches.length;
        }
        const match = conversation.searchMatches[conversation.searchIndex];
        conversation.searchMatches.forEach((entry, index) => {
            if (entry && entry.element) {
                entry.element.classList.toggle('chat-message--search-hit', index === conversation.searchIndex);
            }
        });
        if (match && match.element && typeof match.element.scrollIntoView === 'function') {
            match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (conversation.searchStatus) {
            conversation.searchStatus.textContent = `${conversation.searchIndex + 1} / ${conversation.searchMatches.length}`;
        }
    }

    function openPopout(conversation) {
        if (!popoutLayer || !popoutBody || !conversation || !conversation.element) {
            return;
        }
        popoutLayer.hidden = false;
        popoutBody.innerHTML = '';
        popoutBody.appendChild(conversation.element);
        conversation.element.classList.add('chat-window--popout');
        popoutConversationId = normalizeId(conversation.friendId);
        syncConversationVisibility();
    }

    function closePopout() {
        if (!popoutLayer || !popoutBody || !popoutConversationId) {
            return;
        }
        const conversation = conversations.get(popoutConversationId);
        if (conversation && conversation.element && windowsContainer) {
            conversation.element.classList.remove('chat-window--popout');
            windowsContainer.appendChild(conversation.element);
        }
        popoutLayer.hidden = true;
        popoutConversationId = null;
        layoutDockWindows();
        syncConversationVisibility();
    }

    function destroyConversation(conversation) {
        if (!conversation) {
            return;
        }
        const friendId = conversation.friendId;
        const normalizedFriendId = normalizeId(friendId);
        const wasActive = normalizedFriendId && normalizeId(activeConversationId) === normalizedFriendId;
        if (popoutConversationId && normalizeId(popoutConversationId) === normalizedFriendId) {
            closePopout();
        }
        if (conversation.element) {
            conversation.element.remove();
        }
        deleteConversation(friendId);
        removeWindowFromOrder(friendId);
        layoutDockWindows();
        if (wasActive) {
            activeConversationId = null;
            const fallback = findFallbackConversation();
            if (fallback) {
                setActiveConversation(fallback);
            } else {
                syncConversationVisibility();
            }
        } else {
            syncConversationVisibility();
        }
        if (isMobileSheet() && conversations.size === 0) {
            exitThreadView(true);
        }
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

    function formatTimeLabel(value) {
        const date = toUtcDate(value);
        if (!date) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDayLabel(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const targetKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const yesterday = new Date(now.getTime() - 86400000);
        const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
        if (targetKey === todayKey) {
            return strings.dayToday || 'Today';
        }
        if (targetKey === yesterdayKey) {
            return strings.dayYesterday || 'Yesterday';
        }
        return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
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

    function getTimeline(conversation) {
        if (!conversation.timeline) {
            conversation.timeline = {
                lastGroup: null,
                lastMessageMs: null,
                lastDayKey: null
            };
        }
        return conversation.timeline;
    }

    function insertTemporalMarkers(conversation, timestamp) {
        const timeline = getTimeline(conversation);
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return timeline;
        }
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if (timeline.lastDayKey !== dayKey) {
            const divider = document.createElement('div');
            divider.className = 'chat-day-divider';
            divider.textContent = formatDayLabel(date);
            conversation.body.appendChild(divider);
            timeline.lastDayKey = dayKey;
            timeline.lastGroup = null;
        }
        if (timeline.lastMessageMs && (timestamp - timeline.lastMessageMs) > TIME_GAP_THRESHOLD_MS) {
            const marker = document.createElement('div');
            marker.className = 'chat-timestamp';
            marker.textContent = formatTimeLabel(date) || date.toLocaleTimeString();
            conversation.body.appendChild(marker);
            timeline.lastGroup = null;
        }
        return timeline;
    }

    function shouldAutoScroll(conversation) {
        if (!conversation || !conversation.body) {
            return true;
        }
        const distance = conversation.body.scrollHeight - conversation.body.scrollTop - conversation.body.clientHeight;
        return distance < 64;
    }

    function getOrCreateMessageGroup(conversation, fromSelf, timestamp) {
        const timeline = getTimeline(conversation);
        const lastGroup = timeline.lastGroup;
        if (lastGroup && lastGroup.fromSelf === fromSelf && lastGroup.lastTimestamp && timestamp
            && (timestamp - lastGroup.lastTimestamp) <= TIME_GROUP_WINDOW_MS) {
            return lastGroup;
        }
        const groupEl = document.createElement('div');
        groupEl.className = ['chat-message-group', fromSelf ? 'chat-message-group--me' : 'chat-message-group--peer'].join(' ');
        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'chat-message-group__avatar';
        if (!fromSelf) {
            const friend = getFriend(conversation.friendId);
            if (friend && friend.avatarUrl) {
                const img = document.createElement('img');
                img.src = friend.avatarUrl;
                img.alt = friend.displayName || '';
                avatarWrap.appendChild(img);
            } else {
                avatarWrap.classList.add('avatar-placeholder');
            }
        } else {
            avatarWrap.classList.add('is-hidden');
        }
        const contentWrap = document.createElement('div');
        contentWrap.className = 'chat-message-group__content';
        if (!fromSelf) {
            const author = document.createElement('div');
            author.className = 'chat-message-group__author';
            const friend = getFriend(conversation.friendId);
            author.textContent = friend ? friend.displayName : '';
            contentWrap.appendChild(author);
        }
        const bubblesEl = document.createElement('div');
        bubblesEl.className = 'chat-message-group__bubbles';
        const metaEl = document.createElement('div');
        metaEl.className = 'chat-message-group__meta';
        contentWrap.appendChild(bubblesEl);
        contentWrap.appendChild(metaEl);
        groupEl.appendChild(avatarWrap);
        groupEl.appendChild(contentWrap);
        conversation.body.appendChild(groupEl);
        const group = {
            element: groupEl,
            bubblesEl,
            metaEl,
            fromSelf,
            lastTimestamp: timestamp,
            lastMessage: null
        };
        timeline.lastGroup = group;
        return group;
    }

    function createReactionBar(conversation, message) {
        const bar = document.createElement('div');
        bar.className = 'chat-message__reactions';
        reactionPalette.forEach((emoji) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.setAttribute('aria-label', `${strings.reactionLabel || 'React'} ${emoji}`);
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                dispatchChatEvent('reaction', {
                    friendId: conversation.friendId,
                    messageId: message.id,
                    emoji
                });
            });
            bar.appendChild(btn);
        });
        return bar;
    }

    function updateGroupMeta(group) {
        if (!group || !group.metaEl || !group.lastMessage) {
            return;
        }
        group.metaEl.textContent = getMessageMeta(group.lastMessage, group.fromSelf);
    }

    function renderMessage(conversation, message, options = {}) {
        const fromSelf = message.fromSelf === true || message.senderId === undefined || message.senderId !== conversation.friendId;
        const timestamp = getMessageTimestamp(message) || Date.now();
        const autoScroll = shouldAutoScroll(conversation);
        insertTemporalMarkers(conversation, timestamp);
        const group = getOrCreateMessageGroup(conversation, fromSelf, timestamp);
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
        bubble.title = formatDateTime(message.sentAtUtc) || formatTimeLabel(timestamp);
        wrapper.appendChild(bubble);

        wrapper.appendChild(createReactionBar(conversation, message));

        const shouldHighlight = !fromSelf && options.highlight !== false;
        if (shouldHighlight) {
            wrapper.classList.add('chat-message--highlight');
            setTimeout(() => wrapper.classList.remove('chat-message--highlight'), 2400);
        }

        group.bubblesEl.appendChild(wrapper);
        group.lastTimestamp = timestamp;
        group.lastMessage = message;
        updateGroupMeta(group);
        conversation.messages.set(message.id, { element: wrapper, meta: group.metaEl, data: message, group });
        if (autoScroll || fromSelf) {
            conversation.body.scrollTop = conversation.body.scrollHeight;
        }
        const timeline = getTimeline(conversation);
        timeline.lastMessageMs = timestamp;
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
            if (friend.isArchived && !friend.keepArchived) {
                setFriendArchived(friend.userId, false, false);
            }
            if (isConversationActive(conversation)) {
                markThreadRead(friendId);
            } else {
                const wasUnread = (friend.unreadCount || 0) > 0;
                friend.unreadCount = (friend.unreadCount || 0) + 1;
                
                updateFriendVisual(friend);
                updateUnreadBadge();
                const becameUnread = !wasUnread;
                if (becameUnread) {
                    announceNewMessage(friend);
                }
                const shouldSignalAttention = becameUnread && !isConversationActive(conversation);
                if (shouldSignalAttention) {
                    friend.lastNotifiedMessageId = message.id || null;
                    triggerConversationAttention(conversation, message);
                    if (friend.element) {
                        friend.element.classList.add('is-attention');
                    }
                }
                conversation.unreadBadge = (conversation.unreadBadge || 0) + 1;
                if (conversation.badgeEl) {
                    conversation.badgeEl.textContent = String(conversation.unreadBadge);
                    conversation.badgeEl.hidden = false;
                }
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
                if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === entry.data.id)) {
                    entry.group.lastMessage = entry.data;
                }
                updateGroupMeta(entry.group);
            }
        });
    }

    function markThreadRead(friendId) {
        const friend = getFriend(friendId);
        if (!friend) return;
        friend.unreadCount = 0;
        friend.lastNotifiedMessageId = null;
        updateFriendVisual(friend);
        if (friend.element) {
            friend.element.classList.remove('is-attention');
        }
        updateUnreadBadge();
        const conversation = getConversation(friend.userId);
        if (conversation) {
            conversation.element.classList.remove('chat-window--attention');
            conversation.lastAttentionMessageId = null;
            conversation.unreadBadge = 0;
            if (conversation.badgeEl) {
                conversation.badgeEl.textContent = '0';
                conversation.badgeEl.hidden = true;
            }
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

    function handleConversationScroll(conversation) {
        if (!conversation || !conversation.body) {
            return;
        }
        const distance = conversation.body.scrollHeight - conversation.body.scrollTop - conversation.body.clientHeight;
        if (distance < 32) {
            setActiveConversation(conversation);
            markThreadRead(conversation.friendId);
        }
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
                            isArchived: isThreadArchived(row.userId),
                            keepArchived: shouldKeepArchived(row.userId),
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
                    isArchived: false,
                    keepArchived: false,
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
