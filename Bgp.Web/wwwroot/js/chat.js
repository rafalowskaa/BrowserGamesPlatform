(function initChatDock() {
    function setup() {
    const dock = document.getElementById('chatDock');
    if (!dock) {
        return;
        }

        if (dock.dataset.chatInit === '1') {
            return;
        }
        dock.dataset.chatInit = '1';

    const toggle = document.getElementById('chatToggle');
    const panel = document.getElementById('chatPanel');
    const closeBtn = panel ? panel.querySelector('[data-chat-close]') : null;
    const searchInput = panel ? panel.querySelector('[data-chat-search]') : null;
    const searchClear = panel ? panel.querySelector('[data-chat-search-clear]') : null;
    const usersList = panel ? panel.querySelector('[data-chat-users]') : null;
    const usersEmpty = panel ? panel.querySelector('[data-chat-users-empty]') : null;
    const usersEmptyDefault = usersEmpty ? usersEmpty.textContent : '';
    const friendsList = panel ? panel.querySelector('[data-chat-active]') : null;
    const friendsEmpty = panel ? panel.querySelector('[data-chat-active-empty]') : null;
    const archivedList = panel ? panel.querySelector('[data-chat-archived]') : null;
    const archivedEmpty = panel ? panel.querySelector('[data-chat-archived-empty]') : null;
    const requestsList = panel ? panel.querySelector('[data-chat-requests]') : null;
    const requestsEmpty = panel ? panel.querySelector('[data-chat-requests-empty]') : null;
    const strangersList = panel ? panel.querySelector('[data-chat-strangers]') : null;
    const strangersEmpty = panel ? panel.querySelector('[data-chat-strangers-empty]') : null;
    const localResultsSection = panel ? panel.querySelector('[data-chat-search-section]') : null;
    const localResultsList = panel ? panel.querySelector('[data-chat-local-results]') : null;
    const localResultsEmpty = panel ? panel.querySelector('[data-chat-local-empty]') : null;
    const searchLoader = panel ? panel.querySelector('[data-chat-search-loader]') : null;
    const windowsContainer = dock.querySelector('[data-chat-windows]');
    const overflowToggle = dock.querySelector('[data-chat-overflow]');
    const overflowMenu = dock.querySelector('[data-chat-overflow-menu]');
    const overflowList = dock.querySelector('[data-chat-overflow-list]');
    const overflowCount = dock.querySelector('[data-chat-overflow-count]');
    const overflowClose = dock.querySelector('[data-chat-overflow-close]');
    const unreadBadge = dock.querySelector('[data-chat-unread]');
    const liveRegion = dock.querySelector('[data-chat-live]');
    const stringsElement = document.getElementById('chatStrings');
    const globalToastStack = document.getElementById('globalToastStack');
    const resizeHandle = panel ? panel.querySelector('[data-chat-panel-resize]') : null;
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
        let contextMenu = document.querySelector('[data-chat-context]');
        if (!contextMenu) {
            contextMenu = document.createElement('div');
            contextMenu.className = 'chat-context-menu';
            contextMenu.dataset.chatContext = '';
            contextMenu.hidden = true;
            contextMenu.innerHTML = `
        <div class="chat-context-menu__panel">
            <ul class="chat-context-menu__list" data-chat-context-list></ul>
        </div>`;
            document.body.appendChild(contextMenu);
        }
        contextMenu.hidden = true;
        if (!contextMenu.querySelector('[data-chat-context-list]')) {
            const list = document.createElement('ul');
            list.className = 'chat-context-menu__list';
            list.dataset.chatContextList = '';
            const panel = document.createElement('div');
            panel.className = 'chat-context-menu__panel';
            panel.appendChild(list);
            contextMenu.appendChild(panel);
        }
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
    const strangerContacts = loadStrangerContacts();
    const sectionState = loadSectionState();
    let incomingRequests = [];
    let outgoingRequests = [];
    let connection = null;
    let inviteConnection = null;
    let loadFriendsPromise = null;
    let connectionPromise = null;
    let inviteConnectionPromise = null;
    let searchTerm = '';
    let statusDirty = false;
    let statusAwaitingConfirmation = false;
    let statusMenuOpen = false;
    let searchDebounceTimer = null;
    let searchController = null;
    let searchRequestId = 0;
    let latestLocalResultIds = new Set();
    let strangerMessage = '';
    let strangerMessageForced = false;
    let searchSectionSnapshot = null;
    let usersRenderScheduled = false;
    const pendingPresence = new Map();
    const STORAGE_LAST_SEEN_KEY = 'bgp.chat.lastSeen';
    const STORAGE_PANEL_STATE_KEY = 'bgp.chat.panelState';
    const STORAGE_WINDOWS_STATE_KEY = 'bgp.chat.windowsState';
    const STORAGE_PANEL_HEIGHT_KEY = 'bgp.chat.panelHeight';
    const STORAGE_SECTION_STATE_KEY = 'bgp.chat.sectionState';
    const STORAGE_STRANGERS_KEY = 'bgp.chat.strangers';
    const lastSeenMessages = loadLastSeenMessages();
    const STORAGE_ARCHIVED_KEY = 'bgp.chat.archived';
    const archivedThreads = loadArchivedThreads();
    const STORAGE_CLEARED_KEY = 'bgp.chat.cleared';
    const clearedThreads = loadClearedThreads();
    let pollTimer = null;
    let pollInFlight = false;
    const POLL_INTERVAL_MS = 7000;
    let pollErrorLogged = false;
    let lastUnreadTotal = null;
    const windowOrder = [];
    const windowsDock = new Map();
    const MAX_VISIBLE_WINDOWS_DESKTOP = 4;
    const MAX_VISIBLE_WINDOWS_MOBILE = 1;
    let activeConversationId = null;
    let panelHeight = loadPanelHeight();
    let overflowMenuOpen = false;
    let draggingWindowId = null;
    let lastDragTargetId = null;
    const emojiPalette = ['😀', '😁', '😂', '😎', '😍', '🤔', '👍', '🎉', '🔥', '❤️', '✅', '❗', '🙌', '🥳', '🤖', '🕹️', '🏆', '⚡'];

    const reactionPalette = ['👍', '❤️', '🔥', '😂', '🎉'];
    const reactionsEnabled = true;
    let panelCollapsedState = loadPanelCollapsedState();
    const mobileSheetQuery = typeof window !== 'undefined'
        ? window.matchMedia('(max-width: 64rem)')
        : { matches: false, addEventListener: () => { /* noop */ } };
    let threadViewForced = false;
    let contextMenuState = null;
    let chatInitialized = false;
    let chatBootstrapPromise = null;
    let chatBootstrapScheduled = false;
    let dockStateRestored = false;
    const sectionContainers = panel ? panel.querySelectorAll('[data-chat-section]') : [];


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
        activeHeading: 'Friends',
        archivedHeading: 'Archive',
        archivedEmpty: 'No archived threads',
        archive: 'Archive',
        unarchive: 'Restore',
        keepArchived: 'Keep archived',
        releaseArchived: 'Return when new messages arrive',
        archiveBadge: 'ARCHIWUM',
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
        contextGroup: 'Create group',
        contextBlock: 'Block user',
        contextReport: 'Report user',
        contextArchive: 'Archive',
        contextRestore: 'Restore',
        contextKeep: 'Keep archived',
        contextRelease: 'Return to active',
        contextClear: 'Clear chat',
        clearConversation: 'Clear chat',
        clearConversationConfirm: 'Clear this conversation for you?',
        dayToday: 'Today',
        dayYesterday: 'Yesterday',
        timeMarker: '{0}',
        deliveredShort: 'Delivered',
        readShort: 'Read',
        threadBack: 'Back to list',
        reactionLabel: 'React',
        emojiLabel: 'Emoji',
        attachmentLabel: 'Attachment',
        openConversationError: 'Unable to open conversation',
        deleteMessage: 'Delete message',
        deleteMessageConfirm: 'Delete this message?',
        messageDeleted: 'Message removed',
        deleteMessageError: 'Unable to delete message',
        attachmentUnsupported: 'Only image attachments are supported right now',
        searchLocalHeading: 'Local results',
        searchGlobalHeading: 'Users',
        searchLoading: 'Searching…',
        searchOpenChat: 'Open chat',
        searchInvite: 'Invite',
        searchWrite: 'Message',
        searchPending: 'Pending',
        searchAccept: 'Accept',
        searchDecline: 'Decline',
        searchApprovalRequired: 'Requires approval',
        alertFriendRequest: 'Friend request received',
        alertFriendAccepted: 'Friend request accepted',
        alertGameInvite: 'Game invitation received',
        alertGameInviteAccepted: 'Game invitation accepted',
        searchClear: 'Clear search'

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
    applyPanelHeight(panelHeight, { persist: false });
    applyStoredSectionState();
    restoreStoredStrangers();

    if (mobileSheetQuery && typeof mobileSheetQuery.addEventListener === 'function') {
        mobileSheetQuery.addEventListener('change', () => {
            syncThreadViewState(false);
            applyPanelHeight(panelHeight, { persist: false });
            layoutDockWindows();
        });
    } else if (mobileSheetQuery && typeof mobileSheetQuery.addListener === 'function') {
        mobileSheetQuery.addListener(() => {
            syncThreadViewState(false);
            applyPanelHeight(panelHeight, { persist: false });
            layoutDockWindows();
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

    function loadSectionState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return {};
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_SECTION_STATE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (err) {
            console.warn('Unable to load chat section state.', err);
            return {};
        }
    }

    function persistSectionState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            window.localStorage.setItem(STORAGE_SECTION_STATE_KEY, JSON.stringify(sectionState));
        } catch (err) {
            console.warn('Unable to store chat section state.', err);
        }
    }

    function applyStoredSectionState() {
        if (!sectionContainers || !sectionContainers.length) {
            return;
        }
        sectionContainers.forEach((section) => {
            const key = section.dataset.chatSection;
            if (!key) return;
            const collapsed = sectionState[key] === true;
            setSectionCollapsed(key, collapsed, { persist: false });
        });
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

        function loadPanelHeight() {
            if (typeof window === 'undefined' || !window.localStorage) {
                return null;
            }
            try {
                const value = window.localStorage.getItem(STORAGE_PANEL_HEIGHT_KEY);
                if (!value) {
                    return null;
                }
                const parsed = parseFloat(value);
                return Number.isFinite(parsed) ? parsed : null;
            } catch (err) {
                console.warn('Unable to load chat panel height.', err);
                return null;
            }
        }

        function persistPanelHeight(height) {
            if (typeof window === 'undefined' || !window.localStorage) {
                return;
            }
            try {
                window.localStorage.setItem(STORAGE_PANEL_HEIGHT_KEY, String(height));
            } catch (err) {
                console.warn('Unable to persist chat panel height.', err);
            }
        }

    function loadWindowsState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return { order: [], states: {}, active: null };
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_WINDOWS_STATE_KEY);
            if (!raw) {
                return { order: [], states: {}, active: null };
            }
            const parsed = JSON.parse(raw);
            const order = Array.isArray(parsed.order)
                ? parsed.order.map(normalizeId).filter(Boolean)
                : [];
            const collapsed = parsed.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {};
            const states = parsed.states && typeof parsed.states === 'object' ? parsed.states : {};
            if (Object.keys(states).length === 0 && Object.keys(collapsed).length > 0) {
                Object.keys(collapsed).forEach((key) => {
                    states[key] = {
                        state: collapsed[key] ? 'minimized' : 'open',
                        badge: 0
                    };
                });
            }
            const active = parsed.active ? normalizeId(parsed.active) : null;
            return { order, states, active };
        } catch (err) {
            console.warn('Unable to load chat window state.', err);
            return { order: [], states: {}, active: null };
        }
    }

    function persistWindowsState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            const payload = {
                order: [...windowOrder],
                states: {},
                active: activeConversationId ? normalizeId(activeConversationId) : null
            };
            windowsDock.forEach((entry, key) => {
                payload.states[key] = {
                    state: entry && entry.state ? entry.state : 'open',
                    badge: entry && entry.badge ? entry.badge : 0
                };
            });
            if (Object.keys(payload.states).length === 0) {
                conversations.forEach((conversation, key) => {
                    if (conversation) {
                        payload.states[key] = {
                            state: conversation.isCollapsed ? 'minimized' : 'open',
                            badge: conversation.unreadBadge || 0
                        };
                    }
                });
            }
            window.localStorage.setItem(STORAGE_WINDOWS_STATE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.warn('Unable to persist chat window state.', err);
        }
    }

        function loadStrangerContacts() {
            if (typeof window === 'undefined' || !window.localStorage) {
                return new Map();
            }
            try {
                const raw = window.localStorage.getItem(STORAGE_STRANGERS_KEY);
                if (!raw) {
                    return new Map();
                }
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') {
                    return new Map();
                }
                const entries = Object.entries(parsed)
                    .filter(([key, value]) => key && value && typeof value === 'object')
                    .map(([key, value]) => {
                        const normalized = normalizeId(key);
                        return [normalized, {
                            userId: key,
                            displayName: typeof value.displayName === 'string' && value.displayName.trim()
                                ? value.displayName.trim()
                                : key,
                            avatarUrl: value.avatarUrl || null,
                            statusMessage: value.statusMessage || '',
                            presence: normalizePresence(value.presence),
                            isInvisible: !!value.isInvisible,
                            unreadCount: Math.max(0, parseInt(value.unreadCount, 10) || 0),
                            hasConversationHistory: !!value.hasConversationHistory
                        }];
                    });
                return new Map(entries);
            } catch (err) {
                console.warn('Unable to load stranger contacts.', err);
                return new Map();
            }
        }

        function persistStrangerContacts() {
            if (typeof window === 'undefined' || !window.localStorage) {
                return;
            }
            try {
                const payload = {};
                strangerContacts.forEach((contact, key) => {
                    if (!contact || !contact.userId) {
                        return;
                    }
                    const hasHistory = !!contact.hasConversationHistory || (contact.unreadCount && contact.unreadCount > 0);
                    if (!hasHistory) {
                        return;
                    }
                    payload[key] = {
                        displayName: contact.displayName || contact.userId,
                        avatarUrl: contact.avatarUrl || null,
                        statusMessage: contact.statusMessage || '',
                        presence: normalizePresence(contact.presence),
                        isInvisible: !!contact.isInvisible,
                        unreadCount: Math.max(0, contact.unreadCount || 0),
                        hasConversationHistory: hasHistory
                    };
                });
                window.localStorage.setItem(STORAGE_STRANGERS_KEY, JSON.stringify(payload));
            } catch (err) {
                console.warn('Unable to persist stranger contacts.', err);
            }
        }

        function restoreStoredStrangers() {
            if (!strangerContacts.size) {
                return;
            }
            strangerContacts.forEach((contact, key) => {
                if (!contact || !contact.userId) {
                    strangerContacts.delete(key);
                    return;
                }
                const hydrated = getFriend(contact.userId) || {
                    userId: contact.userId,
                    avatarUrl: contact.avatarUrl || null,
                    statusMessage: contact.statusMessage || '',
                    presence: normalizePresence(contact.presence),
                    isInvisible: !!contact.isInvisible,
                    unreadCount: Math.max(0, contact.unreadCount || 0),
                    isFriend: false,
                    isArchived: false,
                    keepArchived: false,
                    lastNotifiedMessageId: null,
                    hasConversationHistory: contact.hasConversationHistory === true
                };
                hydrated.displayName = contact.displayName || hydrated.displayName || hydrated.userId;
                hydrated.avatarUrl = contact.avatarUrl || hydrated.avatarUrl || null;
                hydrated.statusMessage = contact.statusMessage || hydrated.statusMessage || '';
                hydrated.presence = normalizePresence(contact.presence);
                hydrated.isInvisible = !!contact.isInvisible;
                hydrated.unreadCount = Math.max(0, contact.unreadCount || hydrated.unreadCount || 0);
                hydrated.isFriend = false;
                hydrated.isArchived = false;
                hydrated.keepArchived = false;
                hydrated.hasConversationHistory = contact.hasConversationHistory === true || hydrated.unreadCount > 0;
                setFriend(hydrated);
                setStrangerContact(hydrated.userId, hydrated);
                updateFriendVisual(hydrated);
            });
            renderStrangerContacts();
            applyFriendFilter();
        }

    function getWindowEntry(friendId, createIfMissing = false) {
        const key = normalizeId(friendId);
        if (!key) {
            return null;
        }
        if (!windowsDock.has(key) && createIfMissing) {
            windowsDock.set(key, { state: 'open', badge: 0 });
        }
        return windowsDock.get(key) || null;
    }

    function setWindowEntry(friendId, updates) {
        const entry = getWindowEntry(friendId, true);
        if (!entry) {
            return null;
        }
        const next = typeof updates === 'function' ? updates(entry) : { ...entry, ...updates };
        windowsDock.set(normalizeId(friendId), next);
        return next;
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

        function clampPanelHeight(desiredHeight) {
            const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
            const minHeight = viewportHeight ? viewportHeight * 0.4 : 320;
            const maxHeight = viewportHeight ? viewportHeight * 0.9 : 900;
            if (isMobileSheet()) {
                return viewportHeight || null;
            }
            const fallback = panel && panel.getBoundingClientRect().height
                ? panel.getBoundingClientRect().height
                : viewportHeight * 0.7;
            const target = typeof desiredHeight === 'number' && Number.isFinite(desiredHeight)
                ? desiredHeight
                : fallback;
            return Math.min(Math.max(target, minHeight), maxHeight);
        }

        function applyPanelHeight(height, options = {}) {
            if (!panel) {
                return;
            }
            if (isMobileSheet()) {
                panel.style.removeProperty('height');
                panel.style.removeProperty('max-height');
                panel.style.removeProperty('--chat-panel-height');
                return;
            }
            const clamped = clampPanelHeight(height);
            if (!clamped) {
                return;
            }
            panelHeight = clamped;
            panel.style.height = `${clamped}px`;
            panel.style.maxHeight = `${clamped}px`;
            panel.style.setProperty('--chat-panel-height', `${clamped}px`);
            if (options.persist !== false) {
                persistPanelHeight(clamped);
            }
        }

    function setSectionCollapsed(key, collapsed, options = {}) {
        if (!key) return;
        const section = panel ? panel.querySelector(`[data-chat-section="${key}"]`) : null;
        if (!section) return;
        const isCollapsed = !!collapsed;
        section.classList.toggle('is-collapsed', isCollapsed);
        const list = section.querySelector('ul');
        const empty = section.querySelector('.chat-empty');
        if (list) {
            list.style.display = isCollapsed ? 'none' : '';
            list.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
        }
        if (empty) {
            empty.style.display = isCollapsed ? 'none' : '';
            empty.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
        }
        sectionState[key] = isCollapsed;
        if (options.persist !== false) {
            persistSectionState();
        }
    }

    function isMobileSheet() {
        return !!(mobileSheetQuery && mobileSheetQuery.matches);
    }

    function getMaxVisibleWindows() {
        return isMobileSheet() ? MAX_VISIBLE_WINDOWS_MOBILE : MAX_VISIBLE_WINDOWS_DESKTOP;
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
        const activeKey = normalizeId(activeConversationId);
        const hasActive = !!(activeKey && conversations.has(activeKey));
        const shouldThread = threadViewForced || hasActive;
        dock.classList.toggle('is-thread-view', shouldThread);
        threadViewForced = shouldThread;
    }

    function enterThreadView() {
        if (!isMobileSheet()) {
            return;
        }
        threadViewForced = true;
        dock.classList.add('is-thread-view');
    }

    function ensureChatInitialized() {
        if (chatInitialized) {
            return Promise.resolve();
        }
        if (!chatBootstrapPromise) {
            chatBootstrapPromise = (async () => {
                try {
                    await loadFriends();
                    await loadSelfStatus();
                    chatInitialized = true;
                } catch (err) {
                    console.warn('Unable to initialize chat immediately.', err);
                    chatInitialized = false;
                    throw err;
                } finally {
                    ensureConnectionStarted();
                    ensureInviteConnectionStarted();
                }
            })().finally(() => {
                chatBootstrapPromise = null;
            });
        }
        return chatBootstrapPromise;
    }

    function scheduleChatInitialization() {
        if (chatInitialized || chatBootstrapPromise || chatBootstrapScheduled) {
            return;
        }
        chatBootstrapScheduled = true;
        const schedule = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
            ? (cb) => window.requestIdleCallback(cb, { timeout: 5000 })
            : (cb) => window.setTimeout(cb, 2000);
        schedule(() => {
            chatBootstrapScheduled = false;
            ensureChatInitialized().catch(() => { /* handled earlier */ });
        });
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

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) {
            return '0 B';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        const value = bytes / (1024 ** exponent);
        return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
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
            action: () => openProfile(friend.userId, friend.userName)
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
        if (hasConversationHistory(friend)) {
            items.push({
                key: 'clear',
                label: strings.contextClear || strings.clearConversation || 'Clear chat',
                action: () => clearConversationHistory(friend.userId)
            });
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
        contextMenu.hidden = false;
        contextMenu.style.left = '0px';
        contextMenu.style.top = '0px';

        const anchorRect = anchor && typeof anchor.getBoundingClientRect === 'function'
            ? anchor.getBoundingClientRect()
            : null;

        let x = anchorRect ? anchorRect.left : (anchor?.clientX || 0);
        let y = anchorRect ? anchorRect.bottom : (anchor?.clientY || 0);

        const menuRect = contextMenu.getBoundingClientRect();
        const padding = 8;

        x = Math.min(x, window.innerWidth - menuRect.width - padding);
        y = Math.min(y, window.innerHeight - menuRect.height - padding);
        x = Math.max(padding, x);
        y = Math.max(padding, y);

        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
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

        function loadClearedThreads() {
            if (typeof window === 'undefined' || !window.localStorage) {
                return new Map();
            }
            try {
                const raw = window.localStorage.getItem(STORAGE_CLEARED_KEY);
                if (!raw) {
                    return new Map();
                }
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') {
                    return new Map();
                }
                const entries = Object.entries(parsed)
                    .map(([key, value]) => [normalizeId(key), Number(value) || 0])
                    .filter(([, value]) => value > 0);
                return new Map(entries);
            } catch (err) {
                console.warn('Unable to load cleared threads.', err);
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

        function persistClearedThreads() {
            if (typeof window === 'undefined' || !window.localStorage) {
                return;
            }
            try {
                const payload = {};
                clearedThreads.forEach((value, key) => {
                    if (value) {
                        payload[key] = value;
                    }
                });
                window.localStorage.setItem(STORAGE_CLEARED_KEY, JSON.stringify(payload));
            } catch (err) {
                console.warn('Unable to persist cleared threads.', err);
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

        function getClearedAt(friendId) {
            if (!friendId) {
                return 0;
            }
            return clearedThreads.get(normalizeId(friendId)) || 0;
        }

        function setClearedAt(friendId, timestamp) {
            if (!friendId) {
                return;
            }
            const normalized = normalizeId(friendId);
            if (!timestamp || timestamp <= 0) {
                clearedThreads.delete(normalized);
            } else {
                clearedThreads.set(normalized, timestamp);
            }
            persistClearedThreads();
        }

    function clearLastSeenEntry(friendId) {
        if (!friendId) {
            return;
        }
        lastSeenMessages.delete(normalizeId(friendId));
        persistLastSeenMessages();
    }

    function normalizeId(id) {
        if (id === null || id === undefined) {
            return '';
        }
        return String(id).trim().toLowerCase();
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
        const key = normalizeId(id);
        if (!key) {
            return;
        }
        const updated = contact || {};
        updated.displayName = updated.displayName || updated.userId || id;
        updated.statusMessage = updated.statusMessage || '';
        updated.avatarUrl = updated.avatarUrl || null;
        strangerContacts.set(key, updated);
        persistStrangerContacts();
    }

    function deleteStrangerContact(id) {
        strangerContacts.delete(normalizeId(id));
        persistStrangerContacts();
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
            ensureChatInitialized().catch(() => { /* initialization is best-effort */ });
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

    if (sectionContainers && sectionContainers.length) {
        sectionContainers.forEach((section) => {
            const key = section.dataset.chatSection;
            const toggleBtn = section.querySelector('[data-chat-section-toggle]');
            if (!key || !toggleBtn) {
                return;
            }
            toggleBtn.addEventListener('click', (evt) => {
                evt.preventDefault();
                const shouldCollapse = !section.classList.contains('is-collapsed');
                setSectionCollapsed(key, shouldCollapse);
            });
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

    function panelContainsFocus() {
        if (!panel || !document.activeElement) {
            return false;
        }
        return panel.contains(document.activeElement);
    }

    function getFocusedFriendId() {
        const active = document.activeElement;
        if (!active) {
            return null;
        }
        const friendNode = active.closest('[data-chat-friend]');
        if (friendNode && friendNode.dataset.chatFriend) {
            return friendNode.dataset.chatFriend;
        }
        return null;
    }

    function focusRelativeContact(delta) {
        if (!panel) {
            return;
        }
        const buttons = Array.from(panel.querySelectorAll('button[data-chat-item="contact"]'));
        if (!buttons.length) {
            return;
        }
        const current = document.activeElement && document.activeElement.closest('button[data-chat-item="contact"]');
        const index = Math.max(0, buttons.indexOf(current));
        const nextIndex = (index + delta + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
    }

    document.addEventListener('keydown', (evt) => {
        const key = evt.key || '';
        const lower = key.toLowerCase();
        if (key === 'Escape') {
            if (contextMenuState) {
                closeContextMenu();
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

        document.addEventListener('bgp:chat:attachment', async (evt) => {
            const detail = evt.detail || {};
            const friendId = detail.userId;
            if (!friendId) {
                return;
            }
            openConversation(friendId);
            const conversation = getConversation(friendId);
            if (!conversation || typeof conversation.sendPayload !== 'function') {
                return;
            }
            const file = detail.file || null;
            const fallbackName = (file && file.name) || detail.attachmentName || strings.attachmentLabel || 'Attachment';
            try {
                let uploadResult = null;
                if (file) {
                    uploadResult = await uploadAttachment(file);
                }
                const outgoing = {
                    content: '',
                    attachmentUrl: uploadResult?.attachmentUrl || detail.attachmentUrl || null,
                    attachmentName: uploadResult?.attachmentName || detail.attachmentName || fallbackName
                };
                if (!outgoing.attachmentUrl) {
                    outgoing.content = fallbackName;
                }
                conversation.sendPayload(outgoing, { skipInputClear: true, skipInputReset: true });
            } catch (err) {
                console.error('Attachment upload failed.', err);
                conversation.sendPayload({ content: fallbackName }, { skipInputClear: true });
                announceMessage(strings.attachmentUnsupported || strings.sendError || 'Attachment failed');
            }
        });

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

    if (windowsContainer) {
        windowsContainer.addEventListener('dragover', (evt) => {
            if (!draggingWindowId) {
                return;
            }
            const header = evt.target.closest('[data-chat-window-header]');
            if (!header) {
                return;
            }
            const targetId = normalizeId(header.dataset.chatWindowHeader || '');
            if (!targetId || targetId === draggingWindowId) {
                return;
            }
            evt.preventDefault();
            if (lastDragTargetId === targetId) {
                return;
            }
            lastDragTargetId = targetId;
            reorderWindowOrder(draggingWindowId, targetId);
        });

        windowsContainer.addEventListener('drop', (evt) => {
            if (draggingWindowId) {
                evt.preventDefault();
            }
            finishWindowDrag();
        });
    }

        if (resizeHandle && panel) {
            const beginResize = (evt) => {
                if (isMobileSheet()) {
                    return;
                }
                if (typeof evt.button === 'number' && evt.button !== 0) {
                    return;
                }
                const startY = evt.clientY ?? (evt.touches && evt.touches[0]?.clientY);
                if (typeof startY !== 'number') {
                    return;
                }
                evt.preventDefault();
                const rect = panel.getBoundingClientRect();
                const startHeight = rect.height || panelHeight || clampPanelHeight();
                let pendingHeight = startHeight;
                let frameRequested = false;

                const queueHeight = (clientY) => {
                    const delta = startY - clientY;
                    pendingHeight = clampPanelHeight(startHeight + delta);
                    if (!frameRequested) {
                        frameRequested = true;
                        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                            window.requestAnimationFrame(() => {
                                frameRequested = false;
                                applyPanelHeight(pendingHeight, { persist: false });
                            });
                        } else {
                            frameRequested = false;
                            applyPanelHeight(pendingHeight, { persist: false });
                        }
                    }
                };

                const handleMove = (moveEvt) => {
                    const currentY = moveEvt.clientY ?? (moveEvt.touches && moveEvt.touches[0]?.clientY);
                    if (typeof currentY !== 'number') {
                        return;
                    }
                    moveEvt.preventDefault();
                    queueHeight(currentY);
                };

                const endResize = () => {
                    document.removeEventListener('pointermove', handleMove);
                    document.removeEventListener('pointerup', endResize);
                    document.body.style.removeProperty('user-select');
                    applyPanelHeight(panelHeight, { persist: true });
                };

                document.body.style.userSelect = 'none';
                if (resizeHandle.setPointerCapture && evt.pointerId !== undefined) {
                    resizeHandle.setPointerCapture(evt.pointerId);
                }
                document.addEventListener('pointermove', handleMove, { passive: false });
                document.addEventListener('pointerup', endResize, { once: true });
            };

            resizeHandle.addEventListener('pointerdown', beginResize);
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => applyPanelHeight(panelHeight, { persist: false }));
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

    function updateSearchClearVisibility() {
        if (!searchClear || !searchInput) {
            return;
        }
        searchClear.hidden = !searchInput.value;
    }

    if (searchInput) {
        searchInput.addEventListener('input', (evt) => {
            const value = evt.target.value || '';
            runSearch(value);
            updateSearchClearVisibility();
        });
            searchInput.addEventListener('search', (evt) => {
                const value = evt.target.value || '';
                runSearch(value);
                updateSearchClearVisibility();
            });
            updateSearchClearVisibility();
        }

        if (searchClear && searchInput) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                runSearch('');
                updateSearchClearVisibility();
                searchInput.focus();
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

        let presenceState = 'offline';
        if (!friend.isInvisible && friend.presence === PRESENCE_AVAILABLE) {
            presenceState = 'online';
        } else if (!friend.isInvisible && friend.presence === PRESENCE_AWAY) {
            presenceState = 'away';
        } else if (!friend.isInvisible && friend.presence === PRESENCE_DND) {
            presenceState = 'dnd';
        } else if (friend.isInvisible) {
            presenceState = 'invisible';
        }
        dotEl.classList.remove('is-online', 'is-away', 'is-offline', 'is-invisible', 'is-dnd');
        dotEl.classList.add(`is-${presenceState}`);

        const host = dotEl.closest('.chat-contact, .chat-window, .chat-status-toggle');
        if (host) {
            ['online', 'away', 'offline', 'invisible', 'dnd'].forEach((state) => {
                host.classList.toggle(`is-${state}`, presenceState === state);
            });
            host.dataset.presenceState = presenceState;
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
        requestUsersRender();
    }

    function announceMessage(message) {
        if (!liveRegion || !message) {
            return;
        }
       
        liveRegion.textContent = '';
        const writer = () => {
            liveRegion.textContent = message;
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(writer);
        } else {
            writer();
        }
        }

    function showGlobalToast(message, tone) {
        if (!globalToastStack || !message) {
            return;
        }
        while (globalToastStack.children.length > 4) {
            globalToastStack.removeChild(globalToastStack.firstChild);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${tone || 'success'}`;
        toast.textContent = message;
        globalToastStack.appendChild(toast);
        window.setTimeout(() => {
            toast.classList.add('is-leaving');
            window.setTimeout(() => toast.remove(), 250);
        }, 7000);
    }

    function announceNewMessage(friend) {
        if (!strings.newMessage) {
            return;
        }
        const label = friend && friend.displayName
            ? `${strings.newMessage}: ${friend.displayName}`
            : strings.newMessage;
        announceMessage(label);
    }

    function updateUnreadBadge() {
        if (!unreadBadge) return;
        const total = Array.from(friends.values()).reduce((sum, friend) => sum + (friend.unreadCount || 0), 0);
        unreadBadge.textContent = String(total);
        unreadBadge.hidden = total === 0;
        if (total === 0) {
            unreadBadge.classList.remove('is-pulsing');
        } else if (lastUnreadTotal !== null && total > lastUnreadTotal) {
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
        const errorLabel = typeof message.sendError === 'string' && message.sendError.trim();
        if (errorLabel) {
            return errorLabel;
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

        function registerPendingMessage(conversation, draft) {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const queue = getPendingQueue(conversation.friendId, true);
        if (queue) {
            queue.push(localId);
        }
            const pendingContent = (draft && typeof draft.content === 'string' && draft.content.trim())
                ? draft.content.trim()
                : (draft?.attachmentName || draft?.attachmentUrl || strings.attachmentLabel || '[attachment]');
        const pending = {
            id: localId,
            senderId: currentUserId,
            receiverId: conversation.friendId,
            content: pendingContent,
            attachmentUrl: draft?.attachmentUrl || null,
            attachmentName: draft?.attachmentName || null,
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
        const updatedData = Object.assign({}, message, { isPending: false, sendError: false, isDeleted: message.isDeleted === true });
        entry.data = updatedData;
        entry.element.dataset.messageId = message.id;
        entry.element.classList.remove('chat-message--pending', 'chat-message--error');
        const bubble = entry.element.querySelector('.chat-message__bubble');
        if (bubble) {
            applyBubbleContent(bubble, updatedData);
        }
        if (updatedData.isDeleted) {
            entry.element.classList.add('chat-message--deleted');
            const reactions = entry.element.querySelector('.chat-message__reactions');
            if (reactions) {
                reactions.remove();
            }
        }
        applyLocalReaction(conversation, message.id, updatedData.reaction);
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
            content: raw.isDeleted ? '' : raw.content,
            attachmentUrl: raw.attachmentUrl || raw.fileUrl || null,
            attachmentName: raw.attachmentName || null,
            reaction: raw.isDeleted ? null : (raw.reaction || null),
            sentAtUtc: raw.sentAtUtc,
            fromSelf: raw.fromSelf === true || (raw.senderId ? raw.senderId !== friendId : true),
            isRead: raw.isRead,
            readAtUtc: raw.readAtUtc,
            isDeleted: raw.isDeleted === true,
            deletedAtUtc: raw.deletedAtUtc || null
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
                    readAtUtc: normalized.readAtUtc,
                    isDeleted: normalized.isDeleted,
                    deletedAtUtc: normalized.deletedAtUtc,
                    reaction: normalized.reaction
                });
                entry.data = updated;
                if (updated.isDeleted) {
                    applyMessageDeletion(conversation, updated.id, updated.deletedAtUtc, updated.senderId);
                } else {
                    if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === entry.data.id)) {
                        entry.group.lastMessage = entry.data;
                    }
                    updateGroupMeta(entry.group);
                    updateConversationLatest(conversation, updated);
                }

                if (!updated.isDeleted) {
                    applyLocalReaction(conversation, updated.id, updated.reaction);
                }
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

        async function trySendViaSignalR(friendId, payload) {
        try {
            const conn = await ensureConnectionStarted();
            if (!conn || conn.state !== 'Connected') {
                return false;
            }
            await conn.invoke('SendPrivateMessage', friendId, payload.content || '', payload.attachmentUrl || null, payload.attachmentName || null);
            return true;
        } catch (err) {
            console.warn('SignalR delivery failed, falling back to HTTP.', err);
            return false;
        }
    }

        async function sendMessageViaHttp(friendId, payload) {
        const res = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                toUserId: friendId,
                content: payload.content || '',
                attachmentUrl: payload.attachmentUrl,
                attachmentName: payload.attachmentName
            })
        });
        if (!res.ok) {
            throw new Error(await extractErrorMessage(res));
        }
            const responsePayload = await res.json();
            responsePayload.fromSelf = true;
            deliverMessageFromServer(responsePayload, friendId);
        }

        async function uploadAttachment(file) {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/chat/attachments', {
                method: 'POST',
                body: form,
                credentials: 'same-origin'
            });
            if (!res.ok) {
                throw new Error(await extractErrorMessage(res));
            }
            return res.json();
    }

    async function deleteMessage(conversation, message) {
        if (!conversation || !message || !message.id) {
            return;
        }

        const prompt = strings.deleteMessageConfirm || 'Delete this message?';
        if (typeof window !== 'undefined' && !window.confirm(prompt)) {
            return;
        }

        try {
            const res = await fetch(`/api/chat/messages/${encodeURIComponent(message.id)}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (!res.ok) {
                throw new Error(await extractErrorMessage(res));
            }
            const payload = await res.json();
            handleMessageDeleted(payload);
        } catch (err) {
            console.error('Failed to delete message.', err);
            announceMessage(strings.deleteMessageError || strings.statusError || 'Unable to delete message');
        }
        }

        async function sendReaction(conversation, messageId, emoji, options = {}) {
            if (!conversation || !messageId || !emoji) {
                return;
            }

            const entry = conversation.messages ? conversation.messages.get(messageId) : null;
            const previousReaction = entry && entry.data ? entry.data.reaction : null;

            if (options.optimistic) {
                applyLocalReaction(conversation, messageId, emoji);
            }

            try {
                const res = await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ reaction: emoji })
                });
                if (!res.ok) {
                    throw new Error(await extractErrorMessage(res));
                }
                const payload = await res.json();
                handleMessageReaction(payload);
            } catch (err) {
                console.error('Failed to set reaction.', err);
                if (options.optimistic) {
                    applyLocalReaction(conversation, messageId, previousReaction || null);
                }
                announceMessage(strings.statusError || 'Unable to react to message');
            }
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

        function markPendingMessageFailed(conversation, pendingId, payload) {
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
        entry.data.sendError = payload && payload.sendErrorText ? payload.sendErrorText : true;
            if (payload) {
                if (typeof payload.content === 'string' && payload.content.trim()) {
                    entry.data.content = payload.content.trim();
                }
                if (payload.attachmentUrl) {
                    entry.data.attachmentUrl = payload.attachmentUrl;
                }
                if (payload.attachmentName) {
                    entry.data.attachmentName = payload.attachmentName;
                }
            const bubble = entry.element.querySelector('.chat-message__bubble');
            if (bubble) {
                applyBubbleContent(bubble, entry.data);
            }
        }
        entry.element.classList.remove('chat-message--pending');
        entry.element.classList.add('chat-message--error');
        if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === entry.data.id)) {
            entry.group.lastMessage = entry.data;
        }
        updateGroupMeta(entry.group);
    }

        function setSearchBusy(isBusy) {
            if (!searchLoader) {
                return;
            }
            searchLoader.hidden = !isBusy;
        }

        function setSearchMode(enabled) {
            if (!panel) {
                return;
            }
            panel.classList.toggle('is-searching', !!enabled);
            if (enabled) {
                const localSection = panel.querySelector('[data-chat-section="local-results"]');
                const strangerSection = panel.querySelector('[data-chat-section="strangers"]');
                searchSectionSnapshot = {
                    local: !!(localSection && localSection.classList.contains('is-collapsed')),
                    strangers: !!(strangerSection && strangerSection.classList.contains('is-collapsed'))
                };
                setSectionCollapsed('local-results', false, { persist: false });
                setSectionCollapsed('strangers', false, { persist: false });
            } else if (searchSectionSnapshot) {
                if (searchSectionSnapshot.local) {
                    setSectionCollapsed('local-results', true, { persist: false });
                }
                if (searchSectionSnapshot.strangers) {
                    setSectionCollapsed('strangers', true, { persist: false });
                }
                searchSectionSnapshot = null;
            }
        }

        function buildAvatarImage(avatarEl, url, alt = '') {
            const clip = document.createElement('span');
            clip.className = 'chat-avatar__clip';
            if (url) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = alt;
                clip.appendChild(img);
            } else {
                avatarEl.classList.add('avatar-placeholder');
            }
            avatarEl.appendChild(clip);
            return clip;
        }

        function clearLocalSearchResults() {
            if (!localResultsSection || !localResultsList || !localResultsEmpty) {
                return;
            }
            localResultsList.innerHTML = '';
            localResultsEmpty.style.display = 'none';
            localResultsSection.hidden = true;
            latestLocalResultIds = new Set();
        }

        function normalizeSearchTerm(raw) {
            return (raw || '').trim().toLowerCase();
        }

        function matchesSearch(candidate, term) {
            if (!candidate) {
                return false;
            }
            if (!term) {
                return true;
            }
            const lowered = term.toLowerCase();
            return (candidate.displayName && candidate.displayName.toLowerCase().includes(lowered))
                || (candidate.userName && candidate.userName.toLowerCase().includes(lowered))
                || (candidate.statusMessage && candidate.statusMessage.toLowerCase().includes(lowered));
        }

        function buildLocalSearchResults(rawValue) {
            const trimmed = (rawValue || '').trim();
            const term = trimmed.toLowerCase();
            if (!term) {
                clearLocalSearchResults();
                return [];
            }

            const results = [];
            const seen = new Set();

            friends.forEach((friend) => {
                if (!friend || seen.has(normalizeId(friend.userId))) {
                    return;
                }
                if (!matchesSearch(friend, term)) {
                    return;
                }
                const relation = friend.isFriend
                    ? (friend.isArchived ? 'archived' : 'friend')
                    : 'stranger';
                seen.add(normalizeId(friend.userId));
                results.push({
                    userId: friend.userId,
                    displayName: friend.displayName,
                    userName: friend.userName,
                    avatarUrl: friend.avatarUrl,
                    statusMessage: friend.statusMessage,
                    presence: friend.presence,
                    isInvisible: friend.isInvisible,
                    relation,
                    outgoingRequest: false,
                    incomingRequest: false
                });
            });

            incomingRequests.forEach((request) => {
                if (!request || seen.has(normalizeId(request.userId))) {
                    return;
                }
                if (!matchesSearch(request, term)) {
                    return;
                }
                seen.add(normalizeId(request.userId));
                results.push({
                    userId: request.userId,
                    displayName: request.displayName,
                    userName: request.userName,
                    avatarUrl: request.avatarUrl,
                    statusMessage: request.statusMessage,
                    presence: normalizePresence(request.presence),
                    isInvisible: !!request.isInvisible,
                    relation: 'pending-in',
                    outgoingRequest: false,
                    incomingRequest: true
                });
            });

            outgoingRequests.forEach((request) => {
                if (!request || seen.has(normalizeId(request.userId))) {
                    return;
                }
                if (!matchesSearch(request, term)) {
                    return;
                }
                seen.add(normalizeId(request.userId));
                results.push({
                    userId: request.userId,
                    displayName: request.displayName,
                    userName: request.userName,
                    avatarUrl: request.avatarUrl,
                    statusMessage: request.statusMessage,
                    presence: normalizePresence(request.presence),
                    isInvisible: !!request.isInvisible,
                    relation: 'pending-out',
                    outgoingRequest: true,
                    incomingRequest: false
                });
            });

            results.sort((a, b) => {
                const relationOrder = {
                    friend: 0,
                    archived: 1,
                    'pending-in': 2,
                    'pending-out': 3,
                    stranger: 4
                };
                const relationDiff = (relationOrder[a.relation] || 9) - (relationOrder[b.relation] || 9);
                if (relationDiff !== 0) {
                    return relationDiff;
                }
                return a.displayName.localeCompare(b.displayName);
            });

            return results;
        }

        function createSearchActionButtons(entry) {
            const actions = document.createElement('div');
            actions.className = 'chat-contact__actions';
            if (entry.relation === 'pending-in') {
                const acceptBtn = document.createElement('button');
                acceptBtn.type = 'button';
                acceptBtn.className = 'chat-contact__button';
                acceptBtn.textContent = strings.searchAccept || strings.accept;
                acceptBtn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    await fetch(`/api/friends/accept/${encodeURIComponent(entry.userId)}`, {
                        method: 'POST',
                        credentials: 'same-origin'
                    });
                    await loadFriends();
                    runSearch(searchTerm);
                });
                actions.appendChild(acceptBtn);

                const declineBtn = document.createElement('button');
                declineBtn.type = 'button';
                declineBtn.className = 'chat-contact__button chat-contact__button--ghost';
                declineBtn.textContent = strings.searchDecline || strings.decline;
                declineBtn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    await fetch(`/api/friends/${encodeURIComponent(entry.userId)}`, {
                        method: 'DELETE',
                        credentials: 'same-origin'
                    });
                    await loadFriends();
                    runSearch(searchTerm);
                });
                actions.appendChild(declineBtn);
            } else if (entry.relation === 'pending-out') {
                const pendingTag = document.createElement('span');
                pendingTag.className = 'chat-contact__status';
                pendingTag.textContent = strings.searchPending || strings.pendingOutgoing;
                actions.appendChild(pendingTag);
            }
            return actions;
        }

        function hydrateFriendSnapshot(snapshot) {
            if (!snapshot || !snapshot.userId) {
                return;
            }
            const normalizedId = normalizeId(snapshot.userId);
            if (!normalizedId) {
                return;
            }
            const existing = getFriend(snapshot.userId);
            const merged = existing ? { ...existing } : {
                userId: snapshot.userId,
                displayName: snapshot.displayName || snapshot.userName || snapshot.userId,
                userName: snapshot.userName || null,
                avatarUrl: snapshot.avatarUrl || null,
                statusMessage: snapshot.statusMessage || '',
                presence: normalizePresence(snapshot.presence),
                isInvisible: !!snapshot.isInvisible,
                unreadCount: existing?.unreadCount || 0,
                isFriend: snapshot.relation === 'friend' || snapshot.isFriend === true || (existing?.isFriend ?? false),
                isArchived: existing?.isArchived || false,
                keepArchived: existing?.keepArchived || false,
                lastNotifiedMessageId: existing?.lastNotifiedMessageId || null
            };

            merged.displayName = snapshot.displayName || merged.displayName;
            merged.userName = snapshot.userName || merged.userName;
            merged.avatarUrl = snapshot.avatarUrl ?? merged.avatarUrl;
            merged.statusMessage = snapshot.statusMessage ?? merged.statusMessage;
            merged.presence = normalizePresence(snapshot.presence ?? merged.presence);
            merged.isInvisible = snapshot.isInvisible ?? merged.isInvisible;
            if (snapshot.relation === 'friend') {
                merged.isFriend = true;
            } else if (typeof snapshot.isFriend === 'boolean') {
                merged.isFriend = snapshot.isFriend;
            }

            setFriend(merged);
            if (merged.isFriend) {
                if (!merged.element) {
                    createFriendElement(merged);
                }
                updateFriendVisual(merged);
                updateFriendPlacement(merged);
            } else {
                ensureStrangerContact(merged);
            }
        }

        function renderLocalSearchResults(results) {
            if (!localResultsSection || !localResultsList || !localResultsEmpty) {
                return;
            }
            localResultsList.innerHTML = '';
            latestLocalResultIds = new Set();
            if (!results || results.length === 0) {
                localResultsEmpty.textContent = searchTerm ? (strings.noMatches || '') : '';
                localResultsEmpty.style.display = 'block';
                localResultsSection.hidden = false;
                return;
            }

            const fragment = document.createDocumentFragment();
            results.forEach((entry) => {
                const li = document.createElement('li');
                li.className = 'chat-contact';
                li.dataset.searchResult = entry.relation;
                li.dataset.chatFriend = entry.userId;

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-contact__button chat-contact__button--ghost';
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    hydrateFriendSnapshot(entry);
                    openConversation(entry.userId, entry.displayName);
                });

                const avatar = document.createElement('span');
                avatar.className = 'chat-contact__avatar';
                avatar.setAttribute('aria-hidden', 'true');
                buildAvatarImage(avatar, entry.avatarUrl || '', '');

                const statusDot = document.createElement('span');
                statusDot.className = 'chat-status-dot';
                statusDot.dataset.friendDot = '';
                avatar.appendChild(statusDot);

                const meta = document.createElement('span');
                meta.className = 'chat-contact__meta';

                const name = document.createElement('span');
                name.className = 'chat-contact__name';
                name.textContent = entry.displayName;
                meta.appendChild(name);

                const status = document.createElement('span');
                status.className = 'chat-contact__status';
                if (entry.relation === 'pending-out') {
                    status.textContent = strings.searchPending || strings.pendingOutgoing;
                } else if (entry.relation === 'pending-in') {
                    status.textContent = strings.searchApprovalRequired || strings.searchPending;
                } else {
                    status.textContent = entry.statusMessage || presenceLabel(entry);
                }
                meta.appendChild(status);

                button.appendChild(avatar);
                button.appendChild(meta);
                li.appendChild(button);

                const actions = createSearchActionButtons(entry);
                if (actions && actions.childNodes.length > 0) {
                    li.appendChild(actions);
                }

                fragment.appendChild(li);
                latestLocalResultIds.add(normalizeId(entry.userId));
                applyStatusDot(statusDot, entry);
            });

            localResultsList.appendChild(fragment);
            localResultsEmpty.style.display = 'none';
            localResultsSection.hidden = false;
        }

        function runSearch(value) {
            const normalized = normalizeSearchTerm(value);
            searchTerm = normalized;
            setSearchMode(!!normalized);
            applyFriendFilter();
            if (!normalized) {
                clearLocalSearchResults();
                scheduleSearch('');
                return;
            }
            const localResults = buildLocalSearchResults(value);
            renderLocalSearchResults(localResults);
            scheduleSearch(value);
        }

    function applyFriendFilter() {
        let visibleActive = 0;
        let visibleArchived = 0;
        let visibleStrangers = 0;
        friends.forEach((friend) => {
            if (!friend.element) {
                return;
            }
            const matches = !searchTerm
                || friend.displayName.toLowerCase().includes(searchTerm)
                || (friend.userName && friend.userName.toLowerCase().includes(searchTerm))
                || (friend.statusMessage && friend.statusMessage.toLowerCase().includes(searchTerm));
            friend.element.hidden = !matches;
            if (matches) {
                if (friend.isFriend) {
                    if (friend.isArchived) {
                        visibleArchived++;
                    } else {
                        visibleActive++;
                    }
                } else if (hasConversationHistory(friend)) {
                    visibleStrangers++;
                }
            }
        });

        updateActiveEmptyState(visibleActive);
        updateArchivedEmptyState(visibleArchived);
        updateStrangerEmptyState(visibleStrangers);
            requestUsersRender();
        }

        function hasConversationHistory(friend) {
            if (!friend) {
                return false;
            }
            if (friend.hasConversationHistory || friend.isConversationOnly) {
                return true;
            }
            if ((friend.unreadCount || 0) > 0) {
                return true;
            }
            const stored = getStrangerContact(friend.userId);
            if (stored && stored.hasConversationHistory) {
                return true;
            }
            const lastSeen = getLastSeenEntry(friend.userId);
            if (lastSeen && lastSeen.sentAtUtc) {
                return true;
            }
            const conversation = getConversation(friend.userId);
            return !!(conversation && conversation.messages && conversation.messages.size > 0);
        }

        function markConversationHistory(friendId) {
            const friend = getFriend(friendId);
            if (!friend) {
                return;
            }
            if (!friend.hasConversationHistory) {
                friend.hasConversationHistory = true;
                setFriend(friend);
            }
            const stored = getStrangerContact(friendId);
            if (stored && !stored.hasConversationHistory) {
                stored.hasConversationHistory = true;
                setStrangerContact(friendId, stored);
            }
            if (!friend.isFriend) {
                ensureStrangerContact(friend, { hasHistory: true });
            } else {
                requestUsersRender();
            }
        }

        function requestUsersRender() {
            if (usersRenderScheduled) {
                return;
            }
            usersRenderScheduled = true;
            const scheduler = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
                ? window.requestAnimationFrame
                : (fn) => setTimeout(fn, 0);
            scheduler(() => {
                usersRenderScheduled = false;
                renderUsersDirectory();
            });
        }

        function renderUsersDirectory() {
            if (!usersList) {
                return;
            }
            usersList.innerHTML = '';
            const entries = [];
            friends.forEach((friend) => {
                if (!friend) {
                    return;
                }
                if (friend.isFriend || friend.isArchived || !hasConversationHistory(friend)) {
                    return;
                }
                const matches = !searchTerm
                    || (friend.displayName && friend.displayName.toLowerCase().includes(searchTerm))
                    || (friend.userName && friend.userName.toLowerCase().includes(searchTerm))
                    || (friend.statusMessage && friend.statusMessage.toLowerCase().includes(searchTerm));
                if (!matches) {
                    return;
                }
                const conversation = getConversation(friend.userId);
                const lastSeen = getLastSeenEntry(friend.userId);
                const lastSeenMs = lastSeen?.sentAtUtc ? (toUtcDate(lastSeen.sentAtUtc)?.getTime() || 0) : 0;
                const lastActive = conversation?.latestSentAtMs || lastSeenMs || 0;
                entries.push({ friend, conversation, lastActive });
            });

            entries.sort((a, b) => {
                const diff = (b.lastActive || 0) - (a.lastActive || 0);
                if (diff !== 0) {
                    return diff;
                }
                const nameA = (a.friend.displayName || a.friend.userName || a.friend.userId || '').toLowerCase();
                const nameB = (b.friend.displayName || b.friend.userName || b.friend.userId || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

            const fragment = document.createDocumentFragment();
            entries.forEach(entry => {
                const friend = entry.friend;
                const li = document.createElement('li');
                li.className = 'chat-contact';

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-contact__button';
                button.dataset.chatFriend = friend.userId;
                button.addEventListener('click', () => openConversation(friend.userId, friend.displayName));

                const avatar = document.createElement('span');
                avatar.className = 'chat-contact__avatar';
                avatar.setAttribute('aria-hidden', 'true');
                buildAvatarImage(avatar, friend.avatarUrl || '', friend.displayName || friend.userId || '');
                const statusDot = document.createElement('span');
                statusDot.className = 'chat-status-dot';
                statusDot.dataset.friendDot = '';
                avatar.appendChild(statusDot);
                applyStatusDot(statusDot, friend);

                const meta = document.createElement('span');
                meta.className = 'chat-contact__meta';

                const name = document.createElement('span');
                name.className = 'chat-contact__name';
                name.textContent = friend.displayName || friend.userName || friend.userId;
                meta.appendChild(name);

                const status = document.createElement('span');
                status.className = 'chat-contact__status';
                if (entry.conversation && entry.conversation.latestSentAtMs) {
                    status.textContent = formatDayFromDate(new Date(entry.conversation.latestSentAtMs));
                } else {
                    status.textContent = presenceLabel(friend);
                }
                meta.appendChild(status);

                button.appendChild(avatar);
                button.appendChild(meta);
                li.appendChild(button);
                fragment.appendChild(li);
            });

            usersList.appendChild(fragment);
            if (usersEmpty) {
                const emptyText = searchTerm && strings.noMatches
                    ? strings.noMatches
                    : (usersEmptyDefault || usersEmpty.textContent || '');
                usersEmpty.textContent = emptyText;
                usersEmpty.style.display = entries.length > 0 ? 'none' : 'block';
            }
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

        function ensureStrangerContact(friend, options = {}) {
            if (!friend) {
            return;
        }
        let contact = getStrangerContact(friend.userId);
        if (!contact) {
            contact = { ...friend };
        } else {
            contact.userId = contact.userId || friend.userId;
            contact.displayName = contact.displayName || friend.displayName || contact.userId;
            contact.userName = contact.userName || friend.userName;
            contact.avatarUrl = contact.avatarUrl || friend.avatarUrl;
            contact.statusMessage = contact.statusMessage || friend.statusMessage;
            contact.presence = typeof contact.presence === 'number' ? contact.presence : friend.presence;
            contact.isInvisible = typeof contact.isInvisible === 'boolean' ? contact.isInvisible : !!friend.isInvisible;
            contact.unreadCount = typeof contact.unreadCount === 'number' ? contact.unreadCount : (friend.unreadCount || 0);
        }
        contact.displayName = contact.displayName || contact.userName || contact.userId;
            const hasHistory = options.hasHistory === true
                || friend.hasConversationHistory === true
                || contact.hasConversationHistory === true
                || hasConversationHistory(friend);
            contact.hasConversationHistory = hasHistory;
            if (!contact.element && strangersList) {
            contact.element = createFriendElement(contact, { ghost: true });
        }
        contact.isFriend = false;
        setStrangerContact(contact.userId, contact);
        setFriend(contact);
        updateFriendVisual(contact);
            if (strangersList) {
                renderStrangerContacts();
            }
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
        const seen = new Set();
        results.forEach((player) => {
            const rawUserId = String(player.id || player.Id || player.userId || player.UserId || '').trim();
            const identifier = normalizeId(rawUserId);
            const displayName = player.name || player.Name || rawUserId || identifier;
            const playerUserName = player.userName || player.UserName || null;
            if (!rawUserId || !identifier || seen.has(identifier)) {
                return;
            }
            if (latestLocalResultIds.has(identifier)) {
                return;
            }
            const statusValue = player.status ?? player.Status;
            const rawStatus = typeof statusValue === 'number' ? statusValue : parseInt(statusValue, 10);
            
            const relation = rawStatus === 1
                ? 'friend'
                : (rawStatus === 0
                    ? (player.outgoingRequest ? 'pending-out' : 'pending-in')
                    : 'stranger');
            const actionEntry = {
                userId: rawUserId,
                displayName,
                userName: playerUserName,
                avatarUrl: player.avatarUrl || player.AvatarUrl || null,
                statusMessage: player.statusMessage || player.StatusMessage,
                presence: normalizePresence(player.presence ?? player.Presence),
                isInvisible: !!(player.isInvisible ?? player.IsInvisible),
                relation,
                outgoingRequest: !!player.outgoingRequest
            };

            const existing = getFriend(rawUserId);
            if (existing) {
                seen.add(identifier);
                if (playerUserName && !existing.userName) {
                    existing.userName = playerUserName;
                }
                if (rawUserId && existing.userId !== rawUserId) {
                    existing.userId = rawUserId;
                }
                if (!existing.isFriend) {
                    ensureStrangerContact(existing);
                }
                return;
            }

            const contact = getStrangerContact(rawUserId);
            if (contact) {
                seen.add(identifier);
                contact.userId = contact.userId || rawUserId;
                contact.displayName = contact.displayName || displayName;
                contact.userName = contact.userName || playerUserName;
                contact.avatarUrl = contact.avatarUrl || player.avatarUrl || null;
                ensureStrangerContact(contact);
                return;
            }


            seen.add(identifier);
            
            const li = document.createElement('li');
            li.className = 'chat-contact';
            li.dataset.strangerSearch = '';
            li.dataset.chatFriend = rawUserId;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = ['chat-contact__button', 'chat-contact__button--ghost'].join(' ').trim();
            button.addEventListener('click', () => {
                hydrateFriendSnapshot(actionEntry);
                if (relation === 'pending-out') {
                    return;
                }
                openConversation(rawUserId, displayName);
            });

            const avatar = document.createElement('span');
            avatar.className = 'chat-contact__avatar';
            avatar.setAttribute('aria-hidden', 'true');
            buildAvatarImage(avatar, player.avatarUrl || player.AvatarUrl || '', '');

            const statusDot = document.createElement('span');
            statusDot.className = 'chat-status-dot';
            statusDot.dataset.friendDot = '';
            avatar.appendChild(statusDot);

            const meta = document.createElement('span');
            meta.className = 'chat-contact__meta';

            const name = document.createElement('span');
            name.className = 'chat-contact__name';
            name.textContent = displayName;
            meta.appendChild(name);

            const prompt = document.createElement('span');
            prompt.className = 'chat-contact__status';
            if (relation === 'pending-out') {
                prompt.textContent = strings.searchPending || strings.pendingOutgoing;
            } else if (relation === 'pending-in') {
                prompt.textContent = strings.searchApprovalRequired || strings.searchPending;
            } else if (relation === 'friend') {
                prompt.textContent = strings.searchOpenChat || strings.strangersPrompt;
            } else {
                prompt.textContent = strings.searchWrite || strings.strangersPrompt;
            }
            meta.appendChild(prompt);

            button.appendChild(avatar);
            button.appendChild(meta);
            li.appendChild(button);
            const actions = document.createElement('div');
            actions.className = 'chat-contact__actions';
            
            const requestActions = createSearchActionButtons(actionEntry);
            if (requestActions && requestActions.childNodes.length > 0) {
                actions.append(...Array.from(requestActions.childNodes));
            }
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'chat-contact__menu';
            menuBtn.dataset.chatContextTrigger = rawUserId;
            menuBtn.setAttribute('aria-label', strings.contextProfile || 'More options');
            menuBtn.innerHTML = '⋮';
            menuBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openContextMenu(rawUserId, menuBtn, {
                    userId: rawUserId,
                    displayName,
                    userName: playerUserName,
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
            applyStatusDot(statusDot, actionEntry);
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
        setSearchBusy(true);
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
                setSearchBusy(false);
            });
    }

    function scheduleSearch(rawValue) {
        const value = (rawValue || '').trim();
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        if (!value || value.length < 1) {
            if (searchController) {
                searchController.abort();
                searchController = null;
            }
            clearStrangerResults();
            showStrangerMessage(strings.searchHint, false);
            setSearchBusy(false);
            return;
        }
        clearStrangerResults();
        showStrangerMessage(strings.searchHint, true);
        setSearchBusy(true);
        searchDebounceTimer = setTimeout(() => {
            updateSearchResults(value);
        }, 300);
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
        updateFriendUnreadState(friend, shouldFlagUnread);
        updateFriendPlacement(friend);
        if (friend.tagEl) {
            friend.tagEl.hidden = !friend.isArchived;
        }
    }

    function updateFriendUnreadState(friend, unread) {
        if (!friend || !friend.element) {
            return;
        }
        const shouldFlagUnread = !!unread;
        if (friend.__hasUnread === shouldFlagUnread) {
            return;
        }
        friend.__hasUnread = shouldFlagUnread;
        friend.element.classList.remove('is-unread');
        if (shouldFlagUnread) {
            void friend.element.offsetWidth;
            friend.element.classList.add('is-unread');
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

        function clearConversationHistory(friendId) {
            if (!friendId) {
                return;
            }
            const confirmMessage = strings.clearConversationConfirm || 'Clear this conversation?';
            if (!window.confirm(confirmMessage)) {
                return;
            }
            const now = Date.now();
            setClearedAt(friendId, now);

            const friend = getFriend(friendId);
            if (friend) {
                friend.unreadCount = 0;
                updateFriendUnreadState(friend, false);
                updateFriendVisual(friend);
            }

            const conversation = getConversation(friendId);
            if (conversation) {
                conversation.clearedAtMs = now;
                conversation.messages.clear();
                conversation.latestSentAtMs = null;
                conversation.latestMessageId = null;
                conversation.lastAttentionMessageId = null;
                conversation.timeline = {
                    lastGroup: null,
                    lastMessageMs: null,
                    lastDayKey: null
                };
                if (conversation.body) {
                    conversation.body.innerHTML = '';
                }
                updateConversationLatest(conversation, null);
            }

            setLastSeenEntry(friendId, null, new Date(now).toISOString());
            updateUnreadBadge();
            requestUsersRender();
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

    function openConversation(friendId, displayName) {
        togglePanel(true);
        ensureConnectionStarted();
        const conversation = ensureConversation(friendId, {
            focus: true,
            autoRead: true,
            displayName
        });
        if (!conversation) {
            const errorMessage = strings.openConversationError || 'Unable to open conversation';
            if (typeof console !== 'undefined' && console.error) {
                console.error('Failed to open conversation for friend.', friendId);
            }
            announceMessage(errorMessage);
            return;
        }
        markConversationHistory(friendId);
        if (isMobileSheet()) {
            enterThreadView();
        }
    }

    function openProfile(userId, userName) {
        const slug = userName || userId;
        if (!slug) {
            return;
        }
        const url = `/dashboard/profile/${encodeURIComponent(slug)}`;
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
        button.addEventListener('click', () => openConversation(friend.userId, friend.displayName));

        const avatar = document.createElement('span');
        avatar.className = 'chat-contact__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        buildAvatarImage(avatar, friend.avatarUrl || '', '');

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
            userName: null,
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
            updateFriendVisual(friend);
            updateFriendPlacement(friend);
        });
        applyFriendFilter();
        updateUnreadBadge();
        applyPendingPresence();
        ordered.forEach((friend) => flushPendingMessages(friend.userId));
        requestUsersRender();
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
        let friend = getFriend(friendId);
        const displayNameHint = typeof options.displayName === 'string' && options.displayName.trim()
            ? options.displayName.trim()
            : null;
        if (!friend) {
            const fallbackId = normalizeId(friendId);
            if (fallbackId) {
                friend = {
                    userId: friendId,
                    displayName: displayNameHint || friendId,
                    avatarUrl: options.avatarUrl || '',
                    statusMessage: options.statusMessage || '',
                    presence: 'offline',
                    isInvisible: false,
                    unreadCount: 0,
                    isFriend: false,
                    isArchived: false,
                    keepArchived: false,
                    lastNotifiedMessageId: null
                };
                setFriend(friend);
            }
        }
        if (!friend) {
            console.error('Unable to ensure conversation: friend not found', friendId);
            return null;
        }

        if (displayNameHint && friend.displayName !== displayNameHint) {
            friend.displayName = displayNameHint;
        }
        if (options.avatarUrl && !friend.avatarUrl) {
            friend.avatarUrl = options.avatarUrl;
        }
        if (options.statusMessage && !friend.statusMessage) {
            friend.statusMessage = options.statusMessage;
        }
        if (!friend.isFriend) {
            ensureStrangerContact(friend);
        }

        if (!conversation) {
            conversation = createConversation(friend, options);
            setConversation(friend.userId, conversation);
            registerConversation(conversation);
        }

        setWindowEntry(friend.userId, {
            state: conversation.isCollapsed ? 'minimized' : 'open',
            badge: conversation.unreadBadge || 0
        });

        if (windowsContainer && conversation.element
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
        element.dataset.friendId = friend.userId;

        const header = document.createElement('div');
        header.className = 'chat-window__header';
        header.dataset.chatWindowHeader = friend.userId;
        header.setAttribute('aria-expanded', 'true');
        header.draggable = true;

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

        header.addEventListener('dragstart', (evt) => {
            beginWindowDrag(friend.userId);
            if (evt && evt.dataTransfer) {
                evt.dataTransfer.effectAllowed = 'move';
                evt.dataTransfer.setData('text/plain', friend.userId);
            }
        });

        header.addEventListener('dragend', () => finishWindowDrag());

        const title = document.createElement('div');
        title.className = 'chat-window__title';

        const avatar = document.createElement('span');
        avatar.className = 'chat-window__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        buildAvatarImage(avatar, friend.avatarUrl || '', '');

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
        profileBtn.addEventListener('click', () => openProfile(friend.userId, friend.userName));
        controls.appendChild(profileBtn);

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'btn-icon';
        controls.appendChild(collapseBtn);

        const destroyBtn = document.createElement('button');
        destroyBtn.type = 'button';
        destroyBtn.className = 'btn-icon';
        destroyBtn.title = strings.close;
        destroyBtn.setAttribute('aria-label', strings.close);
        destroyBtn.textContent = '✕';
        destroyBtn.addEventListener('click', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            destroyConversation(conversation);
        });
        controls.appendChild(destroyBtn);

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

        const attachmentInput = document.createElement('input');
        attachmentInput.type = 'file';
        attachmentInput.hidden = true;
        attachmentInput.accept = 'image/*';
        attachmentInput.addEventListener('change', () => {
            const file = attachmentInput.files && attachmentInput.files[0];
            if (!file) {
                return;
            }
            if (file.type && !file.type.startsWith('image/')) {
                showStatusFeedback(strings.attachmentUnsupported || strings.attachmentLabel, true);
                if (liveRegion) {
                    liveRegion.textContent = strings.attachmentUnsupported || strings.attachmentLabel;
                }
                attachmentInput.value = '';
                return;
            }

            const detail = { userId: conversation.friendId, file };
            document.dispatchEvent(new CustomEvent('bgp:chat:attachment', { detail }));

            attachmentInput.value = '';
        });
        actions.appendChild(attachmentInput);

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

        const restoredEntry = getWindowEntry(friend.userId);
        const initialCollapse = restoredEntry ? restoredEntry.state === 'minimized' : false;

        const conversation = {
            friendId: friend.userId,
            element,
            body,
            input,
            header,
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
            clearedAtMs: getClearedAt(friend.userId),
            archiveBtn,
            collapseBtn,
            isCollapsed: initialCollapse,
            timeline: {
                lastGroup: null,
                lastMessageMs: null,
                lastDayKey: null
            }
        };

        const initialBadge = restoredEntry && typeof restoredEntry.badge === 'number'
            ? restoredEntry.badge
            : (friend.unreadCount || 0);
        updateConversationBadge(conversation, initialBadge);
        updateConversationAttention(conversation, initialBadge > 0 && conversation.isCollapsed);

        collapseBtn.addEventListener('click', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const willCollapse = !conversation.isCollapsed;
            setConversationCollapsed(conversation, willCollapse);
            if (!willCollapse) {
                setActiveConversation(conversation);
                markThreadRead(friend.userId);
                if (conversation.input) {
                    conversation.input.focus();
                }
            }
        });

        header.addEventListener('click', (evt) => {
            if (evt.target.closest('button')) {
                return;
            }
            evt.preventDefault();
            if (conversation.isCollapsed) {
                setActiveConversation(conversation);
                markThreadRead(friend.userId);
                if (conversation.input) {
                    conversation.input.focus();
                }
            } else {
                setConversationCollapsed(conversation, true);
            }

        });

        element.addEventListener('mousedown', (evt) => {
            if (evt.target.closest('.chat-window__header')) {
                return;
            }
            setActiveConversation(conversation);
        });

        const sendPayload = async (payload, options = {}) => {
            const content = (payload?.content || '').trim();
            const attachmentUrl = payload?.attachmentUrl || null;
            const attachmentName = payload?.attachmentName || null;
            if (!content && !attachmentUrl) {
                return;
            }
            markConversationHistory(friend.userId);
            if (!options.skipInputClear) {
                input.value = '';
                autoGrowInput(input);
            }
            const pendingId = registerPendingMessage(conversation, { content, attachmentUrl, attachmentName });
            const outgoing = { content, attachmentUrl, attachmentName };
            const sentViaSignalR = await trySendViaSignalR(friend.userId, outgoing);
            if (sentViaSignalR) {
                return;
            }
            try {
                await sendMessageViaHttp(friend.userId, outgoing);
            } catch (err) {
                console.error('Failed to send message.', err);

                const errorMessage = (err && err.message) ? err.message : (strings.sendError || 'Failed to send message');
                markPendingMessageFailed(conversation, pendingId, { ...outgoing, sendErrorText: errorMessage });
                announceMessage(errorMessage);
                if (!options.skipInputReset) {
                    input.value = payload?.content || '';
                    autoGrowInput(input);
                    input.focus();
                }
            }

        };

        const send = () => {
            const value = (input.value || '').trim();
            if (!value) {
                return;
            }
            sendPayload({ content: value });
        };

        conversation.sendPayload = sendPayload;

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
            attachmentInput.click();
        });

        autoGrowInput(input);

        setConversationCollapsed(conversation, initialCollapse, { force: true });


        
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
        const paddingTop = styles ? parseFloat(styles.paddingTop || '0') : 0;
        const paddingBottom = styles ? parseFloat(styles.paddingBottom || '0') : 0;
        const minHeight = Math.max(lineHeight * 1.6 + paddingTop + paddingBottom, 48);
        const maxHeight = Math.max(lineHeight * 4 + paddingTop + paddingBottom, minHeight);
        const nextHeight = Math.min(maxHeight, Math.max(textarea.scrollHeight, minHeight));
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
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

    function dispatchChatAction(name, detail) {
        document.dispatchEvent(new CustomEvent(`bgp:chat:${name}`, { detail }));
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
        persistWindowsState();
    }

    function reorderWindowOrder(sourceId, targetId) {
        const source = normalizeId(sourceId);
        const target = normalizeId(targetId);
        if (!source || !target || source === target) {
            return;
        }
        const srcIndex = windowOrder.indexOf(source);
        const tgtIndex = windowOrder.indexOf(target);
        if (srcIndex === -1 || tgtIndex === -1) {
            return;
        }
        windowOrder.splice(srcIndex, 1);
        const insertIndex = windowOrder.indexOf(target);
        windowOrder.splice(insertIndex, 0, source);
        persistWindowsState();
        layoutDockWindows();
    }

    function beginWindowDrag(friendId) {
        draggingWindowId = normalizeId(friendId);
        if (windowsContainer) {
            windowsContainer.classList.add('is-dragging');
        }
    }

    function finishWindowDrag() {
        draggingWindowId = null;
        lastDragTargetId = null;
        if (windowsContainer) {
            windowsContainer.classList.remove('is-dragging');
        }
        persistWindowsState();
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
        persistWindowsState();
    }

    function setConversationCollapsed(conversation, collapsed, options = {}) {
        if (!conversation || !conversation.element) {
            return;
        }
        const wasCollapsed = !!conversation.isCollapsed;
        const shouldCollapse = !!collapsed;
        if (conversation.isCollapsed === shouldCollapse && !options.force) {
            return;
        }
        conversation.isCollapsed = shouldCollapse;
        conversation.element.classList.toggle('chat-window--collapsed', shouldCollapse);
        setWindowEntry(conversation.friendId, (entry) => ({
            ...entry,
            state: shouldCollapse ? 'minimized' : 'open'
        }));
        if (conversation.header) {
            conversation.header.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
        }
        if (conversation.collapseBtn) {
            const collapseLabel = shouldCollapse
                ? (strings.restore || 'Restore chat window')
                : (strings.minimize || 'Minimize chat window');
            conversation.collapseBtn.setAttribute('aria-label', collapseLabel);
            conversation.collapseBtn.title = collapseLabel;
            conversation.collapseBtn.textContent = shouldCollapse ? '▢' : '–';
        }
        if (!shouldCollapse && wasCollapsed) {
            conversation.element.classList.remove('chat-window--attention');
        }
        updateConversationAttention(conversation, shouldCollapse && (conversation.unreadBadge || 0) > 0);
        if (shouldCollapse && normalizeId(activeConversationId) === normalizeId(conversation.friendId)) {
            activeConversationId = null;
            const fallback = findFallbackConversation();
            if (fallback && fallback !== conversation) {
                setActiveConversation(fallback);
                return;
            }
            if (!fallback) {
                syncConversationVisibility();
                persistWindowsState();
                return;
            }
        }
        syncConversationVisibility();
        persistWindowsState();
    }

    function syncConversationVisibility() {
        const activeKey = normalizeId(activeConversationId);
        conversations.forEach((conversation, key) => {
            if (!conversation || !conversation.element) {
                return;
            }
            const isActive = !!activeKey && key === activeKey && !conversation.isCollapsed;
            conversation.element.classList.toggle('chat-window--active', isActive);
            
        });
    }

    function updateConversationAttention(conversation, active) {
        if (!conversation || !conversation.element) {
            return;
        }
        const shouldPulse = !!active;
        if (!shouldPulse) {
            conversation.hasAttention = false;
            conversation.element.classList.remove('chat-window--attention');
            return;
        }
        if (conversation.hasAttention === shouldPulse) {
            return;
        }
        conversation.hasAttention = shouldPulse;
        conversation.element.classList.remove('chat-window--attention');
        void conversation.element.offsetWidth;
        conversation.element.classList.add('chat-window--attention');
    }

    function updateConversationBadge(conversation, count) {
        if (!conversation || !conversation.badgeEl) {
            return;
        }
        const value = Math.max(0, count || 0);
        conversation.unreadBadge = value;
        conversation.badgeEl.textContent = String(value);
        conversation.badgeEl.hidden = value === 0;
        setWindowEntry(conversation.friendId, (entry) => ({
            ...entry,
            badge: value
        }));
        persistWindowsState();
    }

    function findFallbackConversation() {
        for (let i = windowOrder.length - 1; i >= 0; i -= 1) {
            const id = windowOrder[i];
            if (!id || !conversations.has(id)) {
                continue;
            }
            const conversation = conversations.get(id);
            if (!conversation || conversation.isCollapsed) {
                continue;
            }
            if (conversation.element && conversation.element.classList.contains('chat-window--stacked')) {
                continue;
            }
            return conversation;
        }
        return null;
    }

    function setActiveConversation(conversation) {
        if (!conversation) {
            return;
        }
        if (isMobileSheet()) {
            enterThreadView();
        }
        activeConversationId = conversation.friendId;
        setWindowEntry(conversation.friendId, (entry) => ({
            ...entry,
            state: 'open'
        }));
        pushWindowToOrder(conversation.friendId);
        setConversationCollapsed(conversation, false);
        updateConversationAttention(conversation, false);
        if (isConversationScrolledToBottom(conversation)) {
            markThreadRead(conversation.friendId);
        }
        layoutDockWindows();
        syncConversationVisibility();
        syncThreadViewState(false);
        persistWindowsState();
    }

    function getActiveConversation() {
        if (!activeConversationId) {
            return null;
        }
        const conversation = getConversation(activeConversationId);
        if (conversation && conversation.isCollapsed) {
            return null;
        }
        return conversation;
    }

    function restoreDockState() {
        if (dockStateRestored) {
            return;
        }
        dockStateRestored = true;
        const state = loadWindowsState();
        if (!state.order.length && !state.active) {
            return;
        }

        if (Array.isArray(state.order) && state.order.length) {
            windowOrder.splice(0, windowOrder.length, ...state.order);
        }

        state.order.forEach((id) => {
            if (!hasFriend(id)) {
                return;
            }
            const conversation = ensureConversation(id, { focus: false, autoRead: false });
            if (!conversation) {
                return;
            }
            const savedState = state.states && state.states[id] ? state.states[id] : null;
            const shouldCollapse = savedState
                ? savedState.state === 'minimized'
                : false;

            setWindowEntry(id, {
                state: shouldCollapse ? 'minimized' : 'open',
                badge: savedState && savedState.badge ? savedState.badge : 0
            });
            setConversationCollapsed(conversation, shouldCollapse, { force: true });
            if (savedState && savedState.badge && conversation.badgeEl) {
                conversation.unreadBadge = savedState.badge;
                conversation.badgeEl.textContent = String(savedState.badge);
                conversation.badgeEl.hidden = savedState.badge === 0;
            }
        });

        if (state.active && conversations.has(state.active)) {
            const active = conversations.get(state.active);
            setConversationCollapsed(active, false, { force: true });
            setActiveConversation(active);
        } else if (state.order.length) {
            const fallback = findFallbackConversation();
            if (fallback) {
                setActiveConversation(fallback);
            }
        }

        layoutDockWindows();
        syncConversationVisibility();
        persistWindowsState();
    }

    function registerConversation(conversation) {
        if (!conversation || !conversation.element || !windowsContainer) {
            return;
        }
        windowsContainer.appendChild(conversation.element);
        setWindowEntry(conversation.friendId, {
            state: conversation.isCollapsed ? 'minimized' : 'open',
            badge: conversation.unreadBadge || 0
        });
        pushWindowToOrder(conversation.friendId);
        layoutDockWindows();
        syncConversationVisibility();
    }

    function layoutDockWindows() {
        if (!windowsContainer) {
            return;
        }
        const availableIds = windowOrder.filter((id) => id && conversations.has(id));
        const collapsedVisible = availableIds.filter((id) => {
            const convo = conversations.get(id);
            return convo && convo.isCollapsed;
        });
        const orderedIds = availableIds.filter((id) => {
            const convo = conversations.get(id);
            return convo && !convo.isCollapsed;
        });
        const activeId = normalizeId(activeConversationId);
        if (activeId) {
            const activeIndex = orderedIds.indexOf(activeId);
            if (activeIndex !== -1) {
                orderedIds.splice(activeIndex, 1);
                orderedIds.push(activeId);
            }
        }
        const total = orderedIds.length;
        const maxVisible = getMaxVisibleWindows();
        const remainingSlots = Math.max(0, maxVisible - collapsedVisible.length);
        const visibleExpanded = orderedIds.slice(Math.max(0, total - remainingSlots));
        const hidden = orderedIds.slice(0, Math.max(0, total - remainingSlots));
        const visible = [...collapsedVisible, ...visibleExpanded];
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
        visible.forEach((id, index) => {
            const conversation = conversations.get(id);
            if (conversation && conversation.element) {
                const isActive = normalizeId(activeConversationId) === id;
                conversation.element.style.zIndex = String(5 + index + (isActive ? 10 : 0));
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

    function destroyConversation(conversation) {
        if (!conversation) {
            return;
        }
        const friendId = conversation.friendId;
        const normalizedFriendId = normalizeId(friendId);
        const wasActive = normalizedFriendId && normalizeId(activeConversationId) === normalizedFriendId;
       
        if (conversation.element) {
            conversation.element.remove();
        }
        deleteConversation(friendId);
        windowsDock.delete(normalizeId(friendId));
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

        persistWindowsState();

    }

    function isConversationActive(conversation) {
        if (!conversation || !conversation.element) {
            return false;
        }
        if (conversation.isCollapsed) {
            return false;
        }
        if (conversation.element.classList.contains('chat-window--stacked')) {
            return false;
        }
        if (normalizeId(activeConversationId) !== normalizeId(conversation.friendId)) {
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

        function shouldRenderMessage(conversation, message) {
            if (!conversation || !message) {
                return false;
            }
            const clearedAt = conversation.clearedAtMs || getClearedAt(conversation.friendId);
            if (!clearedAt) {
                return true;
            }
            const timestamp = getMessageTimestamp(message);
            if (!timestamp) {
                return true;
            }
            return timestamp > clearedAt;
        }

    function updateConversationLatest(conversation, message) {
        if (!conversation || !message) {
            return;
        }
        const timestamp = getMessageTimestamp(message);
        if (timestamp && (!conversation.latestSentAtMs || timestamp > conversation.latestSentAtMs)) {
            conversation.latestSentAtMs = timestamp;
            conversation.latestMessageId = message.id || conversation.latestMessageId || null;
            requestUsersRender();
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
        if (conversation.hasAttention) {
            return;
        }
        if (messageId && conversation.lastAttentionMessageId === messageId) {
            return;
        }
        conversation.lastAttentionMessageId = messageId;
        updateConversationAttention(conversation, true);
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

    function createReactionBar(conversation, message, options = {}) {
        if (!reactionsEnabled) {
            return null;
        }
        if (!conversation || !message || !message.id || message.isPending) {
            return null;
        }
        const bar = document.createElement('div');
        bar.className = 'chat-message__reactions';
        reactionPalette.forEach((emoji) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.setAttribute('aria-label', `${strings.reactionLabel || 'React'} ${emoji}`);
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                sendReaction(conversation, message.id, emoji, { optimistic: true });
            });
            bar.appendChild(btn);
        });


        if (options.allowDelete) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'chat-message__delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.setAttribute('aria-label', strings.deleteMessage || 'Delete message');
            deleteBtn.addEventListener('click', (event) => {
                event.preventDefault();
                deleteMessage(conversation, message);
            });
            bar.appendChild(deleteBtn);
        }
        return bar;
    }

    function applyLocalReaction(conversation, messageId, emoji) {
        if (!conversation || !conversation.messages) {
            return;
        }
        const entry = conversation.messages.get(messageId);
        if (!entry || !entry.element) {
            return;
        }

        const pill = entry.element.querySelector('.chat-message__reaction');

        if (!emoji) {
            if (pill) {
                pill.remove();
            }
            entry.data = { ...entry.data, reaction: null };
            return;
        }

        let reactionPill = pill;
        if (!reactionPill) {
            reactionPill = document.createElement('span');
            reactionPill.className = 'chat-message__reaction';
            entry.element.appendChild(reactionPill);
        }
        reactionPill.textContent = emoji;
        entry.data = { ...entry.data, reaction: emoji };
    }

    function updateGroupMeta(group) {
        if (!group || !group.metaEl || !group.lastMessage) {
            return;
        }
        group.metaEl.textContent = getMessageMeta(group.lastMessage, group.fromSelf);
    }
    function applyMessageDeletion(conversation, messageId, deletedAtUtc, deletedById) {
        if (!conversation || !conversation.messages) {
            return;
        }

        const entry = conversation.messages.get(messageId);
        if (!entry || !entry.element) {
            return;
        }

        const deletedAt = deletedAtUtc || entry?.data?.deletedAtUtc || null;
        const updated = Object.assign({}, entry.data || {}, {
            isDeleted: true,
            deletedAtUtc: deletedAt,
            deletedById,
            reaction: null
        });

        entry.data = updated;
        entry.element.classList.add('chat-message--deleted');

        const reactionPill = entry.element.querySelector('.chat-message__reaction');
        if (reactionPill) {
            reactionPill.remove();
        }

        const bubble = entry.element.querySelector('.chat-message__bubble');
        if (bubble) {
            bubble.textContent = strings.messageDeleted || 'Message removed';
            bubble.title = formatDateTime(deletedAt) || bubble.title;
        }

        const reactions = entry.element.querySelector('.chat-message__reactions');
        if (reactions) {
            reactions.remove();
        }

        const friend = getFriend(conversation.friendId);
        if (friend && !updated.fromSelf && friend.unreadCount > 0) {
            friend.unreadCount = Math.max(0, (friend.unreadCount || 0) - 1);
            updateFriendUnreadState(friend, friend.unreadCount > 0);
            updateFriendVisual(friend);
            updateUnreadBadge();
        }

        if (entry.group && (!entry.group.lastMessage || entry.group.lastMessage.id === updated.id)) {
            entry.group.lastMessage = updated;
            updateGroupMeta(entry.group);
        }

        updateConversationLatest(conversation, updated);
    }

    function isLikelyUrl(value) {
        if (!value || typeof value !== 'string') {
            return false;
        }
        return /^https?:\/\//i.test(value) || value.startsWith('/');
    }

    function normalizeAttachment(message) {
        if (!message || message.isDeleted) {
            return null;
        }
        const url = message.attachmentUrl || message.fileUrl || (isLikelyUrl(message.content) ? message.content : null);
        if (!url) {
            return null;
        }
        let safeUrl = url;
        try {
            const parsed = new URL(url, window.location.origin);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return null;
            }
            safeUrl = parsed.href;
        } catch (_) {
            if (!url.startsWith('/')) {
                return null;
            }
        }
        const label = message.attachmentName || message.content || strings.attachmentLabel || 'Attachment';
        return { url: safeUrl, label };
    }

        function applyBubbleContent(bubble, message) {
            if (!bubble || !message) {
                return;
            }
            bubble.textContent = '';
            const isDeleted = message.isDeleted === true;
            const attachment = !isDeleted ? normalizeAttachment(message) : null;
            if (attachment) {
                const anchor = document.createElement('a');
                anchor.href = attachment.url;
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                anchor.textContent = attachment.label;
                anchor.className = 'chat-message__attachment';
                bubble.appendChild(anchor);
            } else {
                bubble.textContent = isDeleted ? (strings.messageDeleted || 'Message removed') : message.content;
            }
        }

    function renderMessage(conversation, message, options = {}) {
        if (!shouldRenderMessage(conversation, message)) {
            return;
        }
        const fromSelf = message.fromSelf === true || message.senderId === undefined || message.senderId !== conversation.friendId;
        const isDeleted = message.isDeleted === true;
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
        if (isDeleted) {
            classNames.push('chat-message--deleted');
        }
        wrapper.className = classNames.join(' ');
        wrapper.dataset.messageId = message.id;
        wrapper.tabIndex = 0;

        const bubble = document.createElement('div');
        bubble.className = 'chat-message__bubble';
        applyBubbleContent(bubble, message);
        bubble.title = formatDateTime(isDeleted ? (message.deletedAtUtc || message.sentAtUtc) : message.sentAtUtc)
            || formatTimeLabel(timestamp);
        wrapper.appendChild(bubble);

        if (!isDeleted) {
            const reactions = createReactionBar(conversation, message, { fromSelf, allowDelete: fromSelf });
            if (reactions) {
                wrapper.appendChild(reactions);
            }
        }

        const shouldHighlight = !fromSelf && !isDeleted && options.highlight !== false;
        if (shouldHighlight) {
            wrapper.classList.add('chat-message--highlight');
            setTimeout(() => wrapper.classList.remove('chat-message--highlight'), 2400);
        }

        group.bubblesEl.appendChild(wrapper);
        group.lastTimestamp = timestamp;
        const data = Object.assign({}, message, { isDeleted });
        group.lastMessage = data;
        updateGroupMeta(group);
        conversation.messages.set(message.id, { element: wrapper, meta: group.metaEl, data, group });
        if (message.reaction) {
            applyLocalReaction(conversation, message.id, message.reaction);
        }
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
        markConversationHistory(friendId);
        const conversation = ensureConversation(friendId, { focus: false, autoRead: false });
        if (!conversation) {
            return;
        }
        const isDeleted = message.isDeleted === true;
        if (message.fromSelf && resolvePendingMessage(conversation, message)) {
            return;
        }
        const alreadySeen = isMessageAlreadySeen(friend.userId, message);
        const shouldHighlightBubble = !message.fromSelf && !alreadySeen && !isDeleted;
        renderMessage(conversation, message, { highlight: shouldHighlightBubble });
        const senderMatchesFriend = typeof message.senderId === 'string'
            ? normalizeId(message.senderId) === normalizeId(friend.userId)
            : !message.fromSelf;
        const receiverMatchesSelf = typeof message.receiverId === 'string'
            ? !currentUserKey || normalizeId(message.receiverId) === currentUserKey
            : true;
        const shouldFlagUnread = !message.fromSelf && senderMatchesFriend && receiverMatchesSelf && !alreadySeen && !isDeleted;

        if (shouldFlagUnread) {
            if (friend.isArchived && !friend.keepArchived) {
                setFriendArchived(friend.userId, false, false);
            }
            if (isConversationActive(conversation)) {
                markThreadRead(friendId);
            } else {
                const wasUnread = (friend.unreadCount || 0) > 0;
                friend.unreadCount = (friend.unreadCount || 0) + 1;
                updateFriendUnreadState(friend, true);
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
                   
                }
                const entry = setWindowEntry(friendId, (prev) => ({
                    ...prev,
                    badge: (prev.badge || 0) + 1
                }));
                updateConversationBadge(conversation, entry && entry.badge ? entry.badge : (conversation.unreadBadge || 0));
            }
        } else if (!message.fromSelf) {
            updateFriendVisual(friend);
        }

        if (isMobileSheet()) {
            const activeKey = normalizeId(activeConversationId);
            if (!activeKey && dock.classList.contains('is-open')) {
                setActiveConversation(conversation);
            } else if (activeKey && activeKey === normalizeId(friendId)) {
                enterThreadView();
            }
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

        function handleMessageReaction(payload) {
            if (!payload || !payload.messageId || !payload.peerId) {
                return;
            }
            const actorId = normalizeId(payload.userId);
            const peerId = normalizeId(payload.peerId);
            const friendId = actorId === currentUserId ? peerId : (actorId || peerId);
            if (!friendId) {
                return;
            }
            const conversation = getConversation(friendId);
            if (!conversation) {
                return;
            }
            applyLocalReaction(conversation, payload.messageId, payload.reaction);
        }

    function handleMessageDeleted(payload) {
        if (!payload || !payload.messageId) {
            return;
        }
        const actorId = normalizeId(payload.userId || payload.deletedById);
        const peerId = normalizeId(payload.peerId);
        const friendId = actorId === currentUserId ? peerId : (actorId || peerId);
        if (!friendId) {
            return;
        }
        const friend = getFriend(friendId);
        if (friend && payload.deletedById && payload.deletedById !== currentUserId && friend.unreadCount > 0) {
            friend.unreadCount = Math.max(0, (friend.unreadCount || 0) - 1);
            updateFriendUnreadState(friend, friend.unreadCount > 0);
            updateFriendVisual(friend);
            updateUnreadBadge();
        }
        const conversation = getConversation(friendId);
        if (!conversation) {
            return;
        }
        applyMessageDeletion(conversation, payload.messageId, payload.deletedAtUtc, payload.deletedById);
    }

    function markThreadRead(friendId) {
        const friend = getFriend(friendId);
        if (!friend) return;
        friend.unreadCount = 0;
        friend.lastNotifiedMessageId = null;
        updateFriendUnreadState(friend, false);
        updateFriendVisual(friend);
        if (friend.element) {
            friend.element.classList.remove('is-attention');
        }
        updateUnreadBadge();
        const conversation = getConversation(friend.userId);
        if (conversation) {
            conversation.element.classList.remove('chat-window--attention');
            conversation.lastAttentionMessageId = null;
            updateConversationAttention(conversation, false);
            updateConversationBadge(conversation, 0);
            recordConversationSeen(conversation);
        } else {
            setLastSeenEntry(friend.userId, null, new Date().toISOString());
        }
        setWindowEntry(friendId, (entry) => ({
            ...entry,
            badge: 0
        }));
            ensureConnectionStarted()
                .then((conn) => {
                    if (conn && conn.state === 'Connected') {
                        return conn.invoke('MarkThreadRead', friend.userId)
                            .catch(() => markThreadReadHttp(friend.userId));
                    }
                    return markThreadReadHttp(friend.userId);
                })
                .catch(() => { /* lokalny stan został już zaktualizowany */ });
        }

        async function markThreadReadHttp(friendId) {
            try {
                await fetch(`/api/chat/read/${encodeURIComponent(friendId)}`, {
                    method: 'POST',
                    credentials: 'same-origin'
                });
            } catch (err) {
                console.warn('HTTP MarkThreadRead failed', err);
            }
    }

    function isConversationScrolledToBottom(conversation) {
        if (!conversation || !conversation.body) {
            return false;
        }
        const distance = conversation.body.scrollHeight - conversation.body.scrollTop - conversation.body.clientHeight;
        return distance < 32;
    }


    function handleConversationScroll(conversation) {
        if (!conversation || !conversation.body) {
            return;
        }
        if (isConversationScrolledToBottom(conversation)) {
            setActiveConversation(conversation);
            markThreadRead(conversation.friendId);
        }
    }

    async function loadFriends() {
        if (loadFriendsPromise) {
            return loadFriendsPromise;
        }

        loadFriendsPromise = (async () => {

            try {
                const res = await fetch('/api/friends', { credentials: 'same-origin' });
                if (!res.ok) {
                    throw new Error('Request failed');
                }
                const data = await res.json();
                const accepted = [];
                const incoming = [];
                const outgoing = [];
                const priorChats = [];
                const seenFriendIds = new Set();
                data.forEach((row) => {
                    const normalizedPresence = row.isInvisible ? PRESENCE_OFFLINE : normalizePresence(row.presence);
                    if (row.conversationOnly) {
                        const key = normalizeId(row.userId);
                        const unreadCount = Math.max(0, row.unreadCount || 0);
                        const existing = getFriend(row.userId);
                        const contact = existing || {
                            userId: row.userId,
                            displayName: row.displayName,
                            userName: row.userName || null,
                            avatarUrl: row.avatarUrl,
                            statusMessage: row.statusMessage,
                            presence: normalizedPresence,
                            isInvisible: !!row.isInvisible,
                            isFriend: false,
                            isConversationOnly: true,
                            isArchived: isThreadArchived(row.userId),
                            keepArchived: shouldKeepArchived(row.userId),
                            lastNotifiedMessageId: null,
                            hasConversationHistory: true
                        };
                        contact.displayName = row.displayName || contact.displayName || row.userId;
                        contact.userName = row.userName || contact.userName || null;
                        contact.avatarUrl = row.avatarUrl || contact.avatarUrl || null;
                        contact.statusMessage = row.statusMessage || contact.statusMessage || '';
                        contact.presence = normalizedPresence;
                        contact.isInvisible = !!row.isInvisible;
                        contact.unreadCount = unreadCount;
                        contact.isFriend = false;
                        contact.isConversationOnly = true;
                        contact.hasConversationHistory = true;
                        contact.isArchived = isThreadArchived(row.userId);
                        if (contact.element && contact.element.parentElement) {
                            contact.element.remove();
                        }
                        contact.element = null;
                        contact.keepArchived = shouldKeepArchived(row.userId);
                        setFriend(contact);
                        priorChats.push(contact);
                        seenFriendIds.add(key);
                        return;
                    }
                    if (row.status === 1) {
                        const key = normalizeId(row.userId);
                        const existing = getFriend(row.userId);
                        const unreadCount = Math.max(0, row.unreadCount || 0);
                        if (existing) {
                            existing.displayName = row.displayName;
                            existing.userName = row.userName || existing.userName;
                            existing.avatarUrl = row.avatarUrl;
                            existing.statusMessage = row.statusMessage;
                            existing.presence = normalizedPresence;
                            existing.isInvisible = !!row.isInvisible;
                            existing.unreadCount = unreadCount;
                            existing.isFriend = true;
                            existing.isArchived = isThreadArchived(row.userId);
                            existing.keepArchived = shouldKeepArchived(row.userId);
                            accepted.push(existing);
                        } else {
                            const friend = {
                                userId: row.userId,
                                displayName: row.displayName,
                                userName: row.userName || null,
                                avatarUrl: row.avatarUrl,
                                statusMessage: row.statusMessage,
                                presence: normalizedPresence,
                                isInvisible: !!row.isInvisible,
                                unreadCount,
                                isFriend: true,
                                isArchived: isThreadArchived(row.userId),
                                keepArchived: shouldKeepArchived(row.userId),
                                lastNotifiedMessageId: null
                            };
                            setFriend(friend);
                            accepted.push(friend);
                        }
                        seenFriendIds.add(key);
                    } else if (row.status === 0 && row.outgoingRequest) {
                        outgoing.push(row);
                    } else if (row.status === 0) {
                        incoming.push(row);
                    }
                });

                incomingRequests = incoming || [];
                outgoingRequests = outgoing || [];
                priorChats.forEach((contact) => ensureStrangerContact(contact, { hasHistory: true }));

                friends.forEach((friend, key) => {
                    if (friend && friend.isFriend && !seenFriendIds.has(key)) {
                        if (friend.element) {
                            friend.element.remove();
                        }
                        friends.delete(key);
                    }
                });

                renderFriends(accepted);
                renderRequests(incoming, outgoing);
                Array.from(strangerContacts.values()).forEach((stranger) => {
                    const strangerId = stranger ? normalizeId(stranger.userId) : '';
                    if (!strangerId) {
                        if (stranger) {
                            removeStrangerContact(stranger.userId);
                        }
                        return;
                    }
                    const existingFriend = getFriend(strangerId);
                    if (existingFriend && existingFriend.isFriend) {
                        removeStrangerContact(strangerId);
                        return;
                    }
                    const existing = existingFriend || stranger;
                    existing.userId = existing.userId || strangerId;
                    existing.unreadCount = Math.max(0, existing.unreadCount || stranger.unreadCount || 0);
                    setFriend(existing);
                    ensureStrangerContact(existing);
                    flushPendingMessages(existing.userId);
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
                if (!dockStateRestored) {
                    restoreDockState();
                }
                updateUnreadBadge();
            } catch (err) {
                console.error('Failed to load friends.', err);
                incomingRequests = [];
                outgoingRequests = [];
                if (friendsEmpty) {
                    friendsEmpty.textContent = strings.noFriends;
                    friendsEmpty.style.display = 'block';
                }
                updateUnreadBadge();
                requestUsersRender();
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
        connection.on('MessageReaction', (payload) => handleMessageReaction(payload));


        connection.on('MessagesRead', handleMessagesRead);

        connection.on('FriendRequestReceived', (payload) => {
            announceMessage(strings.newMessage || 'New friend request');
            showGlobalToast(strings.alertFriendRequest || strings.noInvites || 'Friend request received', 'success');
            loadFriends();
        });

        connection.on('FriendRequestAccepted', (payload) => {
            announceMessage(strings.accept || 'Friend request accepted');
            showGlobalToast(strings.alertFriendAccepted || strings.accept || 'Friend request accepted', 'success');
            loadFriends();
        });

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

    async function startInviteConnection() {
        if (typeof signalR === 'undefined') {
            return null;
        }
        if (inviteConnection) {
            if (inviteConnection.state === 'Disconnected') {
                try {
                    await inviteConnection.start();
                } catch (err) {
                    console.error('Invite connection failed to restart.', err);
                    inviteConnection = null;
                    return null;
                }
            }
            return inviteConnection;
        }

        inviteConnection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/invites')
            .withAutomaticReconnect()
            .build();

        inviteConnection.onclose(() => {
            inviteConnection = null;
            inviteConnectionPromise = null;
        });

        inviteConnection.on('InviteReceived', () => {
            showGlobalToast(strings.alertGameInvite || 'Game invitation received', 'success');
        });

        inviteConnection.on('InviteAccepted', () => {
            showGlobalToast(strings.alertGameInviteAccepted || 'Game invitation accepted', 'success');
        });

        try {
            await inviteConnection.start();
            return inviteConnection;
        } catch (err) {
            console.error('Invite connection failed to start.', err);
            inviteConnection = null;
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

    function ensureInviteConnectionStarted() {
        if (!inviteConnectionPromise) {
            inviteConnectionPromise = startInviteConnection().then((conn) => {
                if (!conn) {
                    inviteConnectionPromise = null;
                }
                return conn;
            });
        }
        return inviteConnectionPromise;
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
            markConversationHistory(userId);
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
            ensureConversation(userId, { focus: true, autoRead: true, displayName });
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
        if (document.visibilityState !== 'visible') {
            return;
        }
        const active = getActiveConversation();
        if (active && isConversationScrolledToBottom(active)) {
            markThreadRead(active.friendId);
        }
    });

    if (strangersEmpty) {
        showStrangerMessage(strings.searchHint);
    }
        scheduleChatInitialization();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
