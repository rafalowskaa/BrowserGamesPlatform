(function () {
    const searchInput = document.getElementById('friendSearch');
    const searchBtn = document.getElementById('friendSearchBtn');
    const searchResults = document.getElementById('friendSearchResults');
    const searchEmpty = document.getElementById('friendSearchEmpty');
    const acceptedList = document.getElementById('friendsAccepted');
    const incomingList = document.getElementById('friendsIncoming');
    const outgoingList = document.getElementById('friendsOutgoing');
    const acceptedEmpty = document.getElementById('friendsAcceptedEmpty');
    const incomingEmpty = document.getElementById('friendsIncomingEmpty');
    const outgoingEmpty = document.getElementById('friendsOutgoingEmpty');
    const stringsEl = document.getElementById('friendStrings');

    if (!searchInput || !searchBtn || !stringsEl) {
        return;
    }

    const labels = JSON.parse(stringsEl.textContent || '{}');

    function clearList(list) {
        while (list.firstChild) list.removeChild(list.firstChild);
    }

    function setEmptyState(el, hasItems) {
        if (!el) return;
        el.style.display = hasItems ? 'none' : 'block';
    }

    function createActionButton(text, handler, css, style) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = css || 'btn-link btn-small';
        btn.innerText = text;
        if (style && typeof style === 'object') {
            Object.entries(style).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim()) {
                    btn.style.setProperty(key, value);
                }
            });
        }
        btn.addEventListener('click', handler);
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
            if (!action) {
                return;
            }
            actions.appendChild(createActionButton(action.label, action.handler, action.className, action.style));
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

    async function loadFriends() {
        try {
            const res = await apiCall('/api/friends');
            const items = await res.json();
            renderFriends(items);
        } catch (err) {
            console.error(err);
        }
    }

    function renderFriends(items) {
        const accepted = items.filter(x => x.status === 1);
        const incoming = items.filter(x => x.status === 0 && !x.outgoingRequest);
        const outgoing = items.filter(x => x.status === 0 && x.outgoingRequest);

        clearList(acceptedList);
        clearList(incomingList);
        clearList(outgoingList);

        accepted.forEach(f => {
            const accent = f.rankAccentColor || '#38bdf8';
            buildFriendItem(acceptedList, f, {
                actions: [
                    { label: labels.chat, handler: () => openChat(f.userId, f.displayName), className: 'btn-link btn-small' },
                    { label: labels.invite, handler: () => inviteToGame(f.userId, f.displayName), className: 'btn-rank', style: { '--accent-color': accent } },
                    { label: labels.report, handler: () => reportUser(f.userId, f.displayName), className: 'btn-ghost btn-small' },
                    { label: labels.block, handler: () => blockUser(f.userId, f.displayName), className: 'btn-danger btn-small' },
                    { label: labels.remove, handler: () => removeFriend(f.userId), className: 'btn-danger btn-small' }
                ]
            });
        });

        incoming.forEach(f => {
            buildFriendItem(incomingList, f, {
                showRank: false,
                actions: [
                    { label: labels.accept, handler: () => acceptFriend(f.userId), className: 'btn-primary btn-small' },
                    { label: labels.decline, handler: () => removeFriend(f.userId), className: 'btn-ghost btn-small' },
                    { label: labels.report, handler: () => reportUser(f.userId, f.displayName), className: 'btn-ghost btn-small' },
                    { label: labels.block, handler: () => blockUser(f.userId, f.displayName), className: 'btn-danger btn-small' }
                ]
            });
        });

        outgoing.forEach(f => {
            buildFriendItem(outgoingList, f, {
                showRank: false,
                actions: [
                    { label: labels.cancel, handler: () => removeFriend(f.userId), className: 'btn-ghost btn-small' },
                    { label: labels.report, handler: () => reportUser(f.userId, f.displayName), className: 'btn-ghost btn-small' },
                    { label: labels.block, handler: () => blockUser(f.userId, f.displayName), className: 'btn-danger btn-small' }
                ]
            });
        });

        setEmptyState(acceptedEmpty, accepted.length > 0);
        setEmptyState(incomingEmpty, incoming.length > 0);
        setEmptyState(outgoingEmpty, outgoing.length > 0);
    }

    async function searchFriends() {
        const term = (searchInput.value || '').trim();
        if (term.length < 2) {
            searchResults.innerHTML = '';
            setEmptyState(searchEmpty, false);
            return;
        }

        try {
            const res = await apiCall(`/api/friends/search?q=${encodeURIComponent(term)}`);
            const results = await res.json();
            clearList(searchResults);
            results.forEach(r => {
                const profile = {
                    userId: r.id,
                    displayName: r.name,
                    avatarUrl: r.avatarUrl,
                    rankTitle: null
                };
                buildFriendItem(searchResults, profile, {
                    showRank: false,
                    actions: [
                        { label: labels.add, handler: () => sendInvite(r.id), className: 'btn-primary btn-small' },
                        { label: labels.chat, handler: () => openChat(r.id, r.name), className: 'btn-link btn-small' },
                        { label: labels.report, handler: () => reportUser(r.id, r.name), className: 'btn-ghost btn-small' },
                        { label: labels.block, handler: () => blockUser(r.id, r.name), className: 'btn-danger btn-small' }
                    ]
                });
            });
            setEmptyState(searchEmpty, results.length > 0);
        } catch (err) {
            console.error(err);
        }
    }

    async function sendInvite(userId) {
        try {
            await apiCall('/api/friends/send', {
                method: 'POST',
                body: JSON.stringify({ targetUserId: userId })
            });
            await loadFriends();
            await searchFriends();
        } catch (err) {
            console.error(err);
        }
    }

    async function acceptFriend(userId) {
        try {
            await apiCall(`/api/friends/accept/${encodeURIComponent(userId)}`, { method: 'POST' });
            await loadFriends();
        } catch (err) {
            console.error(err);
        }
    }

    async function removeFriend(userId) {
        try {
            await apiCall(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            await loadFriends();
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
            await searchFriends();
            if (labels.blockSuccess) {
                alert(labels.blockSuccess);
            }
        } catch (err) {
            console.error(err);
            if (labels.blockError) {
                alert(labels.blockError);
            }
        }
    }

    async function reportUser(userId, displayName) {
        const promptTemplate = labels.reportPrompt || '';
        const message = promptTemplate.includes('{0}')
            ? promptTemplate.replace('{0}', displayName || '')
            : promptTemplate;
        const description = window.prompt(message);
        if (description === null) {
            return;
        }

        try {
            await apiCall('/api/reports', {
                method: 'POST',
                body: JSON.stringify({
                    targetUserId: userId,
                    category: 4,
                    description: description.trim() ? description.trim() : null
                })
            });
            if (labels.reportSuccess) {
                alert(labels.reportSuccess);
            }
        } catch (err) {
            console.error(err);
            if (labels.reportError) {
                alert(labels.reportError);
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

    searchBtn.addEventListener('click', searchFriends);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFriends();
        }
    });

    loadFriends();
})();