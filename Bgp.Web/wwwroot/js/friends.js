(function () {
    const searchInput = document.getElementById('friendSearch');
    const searchBtn = document.getElementById('friendSearchBtn');
    const searchResults = document.getElementById('friendSearchResults');
    const searchEmpty = document.getElementById('friendSearchEmpty');
    const searchEmptyDefault = searchEmpty ? searchEmpty.textContent : '';
    const acceptedList = document.getElementById('friendsAccepted');
    const incomingList = document.getElementById('friendsIncoming');
    const outgoingList = document.getElementById('friendsOutgoing');
    const acceptedEmpty = document.getElementById('friendsAcceptedEmpty');
    const incomingEmpty = document.getElementById('friendsIncomingEmpty');
    const outgoingEmpty = document.getElementById('friendsOutgoingEmpty');
    const blockedPanel = document.getElementById('friendsBlockedPanel');
    const blockedList = document.getElementById('friendsBlocked');
    const blockedEmpty = document.getElementById('friendsBlockedEmpty');
    const blockedCount = blockedPanel ? blockedPanel.querySelector('[data-friends-blocked-count]') : null;
    const stringsEl = document.getElementById('friendStrings');

    if (!searchInput || !searchBtn || !stringsEl) {
        return;
    }

    const labels = JSON.parse(stringsEl.textContent || '{}');
    if (!labels.viewProfile) {
        labels.viewProfile = 'View profile';
    }

    if (!labels.playingGame) {
        labels.playingGame = 'Playing {0}';
    }

    function openProfile(userId, userName) {
        if (!userId && !userName) {
            return;
        }
        const slug = userName || userId;
        const url = `/dashboard/profile/${encodeURIComponent(slug)}`;
        window.open(url, '_blank', 'noopener');
    }

    function clearList(list) {
        while (list && list.firstChild) list.removeChild(list.firstChild);
    }

    function setEmptyState(el, hasItems) {
        if (!el) return;
        el.style.display = hasItems ? 'none' : 'block';
    }

    function createActionButton(action) {
        if (!action) {
            return null;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = action.className || 'btn-link btn-small';
        if (action.icon) {
            const icon = document.createElement('span');
            icon.className = 'btn-icon-leading';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = action.icon;
            btn.appendChild(icon);
            const label = document.createElement('span');
            label.textContent = action.label;
            btn.appendChild(label);
        } else {
            btn.textContent = action.label;
        }
        if (action.style && typeof action.style === 'object') {
            Object.entries(action.style).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim()) {
                    btn.style.setProperty(key, value);
                }
            });
        }
        btn.addEventListener('click', action.handler);
        return btn;
    }

    function createAvatar(url, name) {
        const wrapper = document.createElement('div');
        wrapper.className = 'friend-avatar';
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = name || '';
            wrapper.appendChild(img);
        } else {
            const fallback = (name || '?').trim();
            wrapper.textContent = fallback ? fallback[0].toUpperCase() : '?';
        }
        return wrapper;
    }

    function buildFriendItem(container, friend, options = {}) {
        if (!container) return;
        const li = document.createElement('li');
        const summary = document.createElement('div');
        summary.className = 'friend-summary';

        summary.appendChild(createAvatar(friend.avatarUrl, friend.displayName));

        const meta = document.createElement('div');
        meta.className = 'friend-meta';

        const nameEl = document.createElement('span');
        nameEl.className = 'friend-name';
        nameEl.innerText = friend.displayName;
        meta.appendChild(nameEl);

        if (friend.currentGameTitle) {
            const gameEl = document.createElement('span');
            gameEl.className = 'friend-game';
            gameEl.innerText = labels.playingGame.replace('{0}', friend.currentGameTitle);
            meta.appendChild(gameEl);
        }

        if (options.showRank !== false) {
            const rankEl = document.createElement('span');
            rankEl.className = 'friend-rank';
            rankEl.innerText = friend.rankTitle ? `${labels.rankLabel}: ${friend.rankTitle}` : labels.rankUnknown;
            meta.appendChild(rankEl);
        }

        summary.appendChild(meta);
        li.appendChild(summary);

        const actions = document.createElement('div');
        actions.className = 'friend-actions';
        (options.actions || []).forEach(action => {
            const button = createActionButton(action);
            if (button) {
                actions.appendChild(button);
            }
        });
        li.appendChild(actions);

        container.appendChild(li);
    }

    async function apiCall(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            ...options
        });
        if (!res.ok) throw new Error('Request failed');
        return res;
    }

    function normalizeStatus(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'number') return value;
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
    }

    function normalizeFriend(row) {
        if (!row || typeof row !== 'object') {
            return null;
        }

        const status = normalizeStatus(row.status ?? row.Status);

        return {
            userId: row.userId ?? row.UserId ?? row.id ?? row.Id ?? '',
            displayName: row.displayName ?? row.DisplayName ?? '',
            userName: row.userName ?? row.UserName ?? null,
            avatarUrl: row.avatarUrl ?? row.AvatarUrl ?? null,
            rankTitle: row.rankTitle ?? row.RankTitle ?? null,
            rankAccentColor: row.rankAccentColor ?? row.RankAccentColor ?? '#38bdf8',
            status,
            outgoingRequest: !!(row.outgoingRequest ?? row.OutgoingRequest),
            statusMessage: row.statusMessage ?? row.StatusMessage ?? null,
            presence: row.presence ?? row.Presence ?? 0,
            isInvisible: !!(row.isInvisible ?? row.IsInvisible),
            unreadCount: Number.parseInt(row.unreadCount ?? row.UnreadCount ?? '0', 10) || 0,
            currentGameTitle: row.currentGameTitle ?? row.CurrentGameTitle ?? null,
            currentGameSlug: row.currentGameSlug ?? row.CurrentGameSlug ?? null,
            conversationOnly: !!(row.conversationOnly ?? row.ConversationOnly)
        };
    }

    function buildActionSet(friend) {
        const actions = [];
        const accent = friend.rankAccentColor || '#38bdf8';
        const baseProfile = { label: labels.viewProfile, handler: () => openProfile(friend.userId, friend.userName), className: 'btn-ghost btn-small', icon: '👤' };

        if (friend.status === 1) {
            actions.push(baseProfile);
            actions.push({ label: labels.chat, handler: () => openChat(friend.userId, friend.displayName), className: 'btn-primary btn-small btn-chat', icon: '💬' });
            actions.push({ label: labels.invite, handler: () => inviteToGame(friend.userId, friend.displayName), className: 'btn-rank', style: { '--accent-color': accent } });
            actions.push({ label: labels.report, handler: () => reportUser(friend.userId, friend.displayName), className: 'btn-ghost btn-small' });
            actions.push({ label: labels.block, handler: () => blockUser(friend.userId, friend.displayName), className: 'btn-danger btn-small' });
            actions.push({ label: labels.remove, handler: () => removeFriend(friend.userId), className: 'btn-danger btn-small' });
            return actions;
        }

        if (friend.status === 0) {
            actions.push(baseProfile);
            if (friend.outgoingRequest) {
                actions.push({ label: labels.cancel, handler: () => removeFriend(friend.userId), className: 'btn-ghost btn-small' });
            } else {
                actions.push({ label: labels.accept, handler: () => acceptFriend(friend.userId), className: 'btn-primary btn-small' });
                actions.push({ label: labels.decline, handler: () => removeFriend(friend.userId), className: 'btn-ghost btn-small' });
            }
            actions.push({ label: labels.report, handler: () => reportUser(friend.userId, friend.displayName), className: 'btn-ghost btn-small' });
            actions.push({ label: labels.block, handler: () => blockUser(friend.userId, friend.displayName), className: 'btn-danger btn-small' });
            return actions;
        }

        if (friend.status === 2) {
            actions.push(baseProfile);
            actions.push({ label: labels.unblock, handler: () => unblockUser(friend.userId), className: 'btn-primary btn-small' });
            return actions;
        }

        actions.push(baseProfile);
        actions.push({ label: labels.add, handler: () => sendInvite(friend.userId), className: 'btn-primary btn-small' });
        actions.push({ label: labels.chat, handler: () => openChat(friend.userId, friend.displayName), className: 'btn-primary btn-small btn-chat', icon: '💬' });
        actions.push({ label: labels.report, handler: () => reportUser(friend.userId, friend.displayName), className: 'btn-ghost btn-small' });
        actions.push({ label: labels.block, handler: () => blockUser(friend.userId, friend.displayName), className: 'btn-danger btn-small' });
        return actions;
    }

    async function loadFriends() {
        try {
            const res = await apiCall('/api/friends');
            const items = await res.json();
            renderFriends(items);
        } catch (err) {
            console.error(err);
            setEmptyState(acceptedEmpty, false);
            setEmptyState(incomingEmpty, false);
            setEmptyState(outgoingEmpty, false);
        }
    }

    function renderFriends(items) {
        const normalized = Array.isArray(items) ? items.map(normalizeFriend).filter(Boolean) : [];
        const accepted = normalized.filter(x => x.status === 1);
        const incoming = normalized.filter(x => x.status === 0 && !x.outgoingRequest && !x.conversationOnly);
        const outgoing = normalized.filter(x => x.status === 0 && x.outgoingRequest && !x.conversationOnly);
        const blocked = normalized.filter(x => x.status === 2);

        clearList(acceptedList);
        clearList(incomingList);
        clearList(outgoingList);
        clearList(blockedList);

        accepted.forEach(f => buildFriendItem(acceptedList, f, { actions: buildActionSet(f) }));

        incoming.forEach(f => {
            buildFriendItem(incomingList, f, {
                showRank: false,
                actions: buildActionSet(f)
            });
        });

        outgoing.forEach(f => {
            buildFriendItem(outgoingList, f, {
                showRank: false,
                actions: buildActionSet(f)
            });
        });

        blocked.forEach(f => {
            buildFriendItem(blockedList, f, {
                showRank: false,
                actions: buildActionSet(f)
            });
        });

        setEmptyState(acceptedEmpty, accepted.length > 0);
        setEmptyState(incomingEmpty, incoming.length > 0);
        setEmptyState(outgoingEmpty, outgoing.length > 0);
        setEmptyState(blockedEmpty, blocked.length > 0);
        if (blockedEmpty && labels.blockedEmpty) {
            blockedEmpty.textContent = labels.blockedEmpty;
        }
        if (blockedCount) {
            blockedCount.textContent = String(blocked.length);
            blockedCount.hidden = blocked.length === 0;
        }
        if (blockedPanel && blocked.length === 0) {
            blockedPanel.open = false;
        }
    }

    async function renderSearch() {
        const term = (searchInput.value || '').trim();
        if (term.length < 1) {
            clearList(searchResults);
            if (searchEmpty) {
                searchEmpty.textContent = searchEmptyDefault;
            }
            setEmptyState(searchEmpty, false);
            return;
        }
        if (term.length < 3) {
            clearList(searchResults);
            if (searchEmpty) {
                searchEmpty.textContent = labels.searchMinChars || searchEmptyDefault;
            }
            setEmptyState(searchEmpty, false);
            return;
        }
        try {
            const res = await apiCall(`/api/friends/search?q=${encodeURIComponent(term)}`);
            const payload = await res.json();
            const normalized = Array.isArray(payload) ? payload.map(normalizeFriend).filter(Boolean) : [];
            clearList(searchResults);
            if (searchEmpty) {
                searchEmpty.textContent = searchEmptyDefault;
            }
            normalized.forEach(profile => {
                buildFriendItem(searchResults, profile, {
                    showRank: false,
                    actions: buildActionSet(profile)
                });
            });
            setEmptyState(searchEmpty, normalized.length > 0);
        } catch (err) {
            console.error(err);
            setEmptyState(searchEmpty, false);
        }
    }

    async function sendInvite(userId) {
        try {
            await apiCall('/api/friends/send', {
                method: 'POST',
                body: JSON.stringify({ targetUserId: userId })
            });
            await loadFriends();
            await renderSearch();
        } catch (err) {
            console.error(err);
        }
    }

    async function acceptFriend(userId) {
        try {
            await apiCall(`/api/friends/accept/${encodeURIComponent(userId)}`, { method: 'POST' });
            await loadFriends();
            await renderSearch();
        } catch (err) {
            console.error(err);
        }
    }

    async function removeFriend(userId) {
        const confirmMessage = labels.removeConfirm || 'Are you sure you want to remove this friend?';
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            await apiCall(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            await loadFriends();
            await renderSearch();
        } catch (err) {
            console.error(err);
        }
    }

    async function blockUser(userId, displayName) {
        if (!window.confirm(labels.blockConfirm)) {
            return;
        }

        try {
            await apiCall(`/api/friends/block/${encodeURIComponent(userId)}`, { method: 'POST' });
            await loadFriends();
            await renderSearch();
            if (window.Bgp && typeof window.Bgp.showGlobalToast === 'function') {
                window.Bgp.showGlobalToast(labels.blockSuccess, 'success');
            } else {
                window.alert(labels.blockSuccess);
            }
        } catch (err) {
            console.error(err);
            if (window.Bgp && typeof window.Bgp.showGlobalToast === 'function') {
                window.Bgp.showGlobalToast(labels.blockError, 'error');
            } else {
                window.alert(labels.blockError);
            }
        }
    }

    async function unblockUser(userId) {
        if (!window.confirm(labels.unblockConfirm)) {
            return;
        }

        try {
            await apiCall(`/api/friends/unblock/${encodeURIComponent(userId)}`, { method: 'POST' });
            await loadFriends();
            await renderSearch();
        } catch (err) {
            console.error(err);
        }
    }

    async function reportUser(userId, displayName) {
        const reason = window.prompt(labels.reportPrompt.replace('{name}', displayName || ''));
        if (reason === null) {
            return;
        }

        const description = reason.trim();

        try {
            await apiCall('/api/reports', {
                method: 'POST',
                body: JSON.stringify({
                    targetUserId: userId,
                    category: 4,
                    description: description ? description : null
                })
            });

            if (window.Bgp && typeof window.Bgp.showGlobalToast === 'function') {
                window.Bgp.showGlobalToast(labels.reportSuccess, 'success');
            } else {
                window.alert(labels.reportSuccess);
            }
        } catch {
            if (window.Bgp && typeof window.Bgp.showGlobalToast === 'function') {
                window.Bgp.showGlobalToast(labels.reportError, 'error');
            } else {
                window.alert(labels.reportError);
            }
        }
    }

    function openChat(userId, displayName) {
        if (window.bgpChat && typeof window.bgpChat.open === 'function') {
            window.bgpChat.open(userId, displayName);
        }
    }

    function inviteToGame(userId, displayName) {
        if (window.bgpChat && typeof window.bgpChat.openWithMessage === 'function') {
            window.bgpChat.openWithMessage(userId, displayName, labels.inviteMessage);
        } else if (window.bgpChat && typeof window.bgpChat.open === 'function') {
            window.bgpChat.open(userId, displayName);
        }
    }

    searchBtn.addEventListener('click', renderSearch);
    searchInput.addEventListener('input', () => {
        const term = (searchInput.value || '').trim();
        if (!term) {
            clearList(searchResults);
            setEmptyState(searchEmpty, false);
            return;
        }
        renderSearch();
    });
    searchInput.addEventListener('search', () => {
        const term = (searchInput.value || '').trim();
        if (!term) {
            clearList(searchResults);
            setEmptyState(searchEmpty, false);
            return;
        }
        renderSearch();
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderSearch();
        }
    });
    const refreshIntervalMs = 30000;
    loadFriends();
    window.setInterval(() => {
        if (document.hidden) {
            return;
        }
        loadFriends();
    }, refreshIntervalMs);
})();