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

    function openProfile(userId, userName) {
        if (!userId && !userName) {
            return;
        }
        const slug = userName || userId;
        const url = `/dashboard/profile/${encodeURIComponent(slug)}`;
        window.open(url, '_blank', 'noopener');
    }

    function clearList(list) {
        while (list.firstChild) list.removeChild(list.firstChild);
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
        const blocked = items.filter(x => x.status === 2);

        clearList(acceptedList);
        clearList(incomingList);
        clearList(outgoingList);
        if (blockedList) {
            clearList(blockedList);
        }

        accepted.forEach(f => {
            const accent = f.rankAccentColor || '#38bdf8';
            buildFriendItem(acceptedList, f, {
                actions: [
                    { label: labels.viewProfile, handler: () => openProfile(f.userId, f.userName), className: 'btn-ghost btn-small', icon: '👤' },
                    { label: labels.chat, handler: () => openChat(f.userId, f.displayName), className: 'btn-primary btn-small btn-chat', icon: '💬' },
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
                    { label: labels.viewProfile, handler: () => openProfile(f.userId, f.userName), className: 'btn-ghost btn-small', icon: '👤' },
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
                    { label: labels.viewProfile, handler: () => openProfile(f.userId, f.userName), className: 'btn-ghost btn-small', icon: '👤' },
                    { label: labels.cancel, handler: () => removeFriend(f.userId), className: 'btn-ghost btn-small' },
                    { label: labels.report, handler: () => reportUser(f.userId, f.displayName), className: 'btn-ghost btn-small' },
                    { label: labels.block, handler: () => blockUser(f.userId, f.displayName), className: 'btn-danger btn-small' }
                ]
            });
        });

        if (blockedList) {
            blocked.forEach(f => {
                buildFriendItem(blockedList, f, {
                    showRank: false,
                    actions: [
                        { label: labels.unblock, handler: () => unblockUser(f.userId), className: 'btn-primary btn-small' }
                    ]
                });
            });
        }

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

    async function searchFriends() {
        const term = (searchInput.value || '').trim();
        if (term.length < 1) {
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
                    userName: r.userName,
                    displayName: r.name,
                    avatarUrl: r.avatarUrl,
                    rankTitle: null
                };
                buildFriendItem(searchResults, profile, {
                    showRank: false,
                    actions: [
                        { label: labels.viewProfile, handler: () => openProfile(r.id, r.userName), className: 'btn-ghost btn-small', icon: '👤' },
                        { label: labels.add, handler: () => sendInvite(r.id), className: 'btn-primary btn-small' },
                        { label: labels.chat, handler: () => openChat(r.id, r.name), className: 'btn-primary btn-small btn-chat', icon: '💬' },
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
        const confirmMessage = labels.removeConfirm || 'Are you sure you want to remove this friend?';
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            await apiCall(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            await loadFriends();
            await searchFriends();
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

    async function unblockUser(userId) {
        const confirmMessage = labels.unblockConfirm || 'Unblock this player?';
        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            await apiCall(`/api/friends/unblock/${encodeURIComponent(userId)}`, { method: 'POST' });
            await loadFriends();
            await searchFriends();
        } catch (err) {
            console.error(err);
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

(function () {
    const root = document.querySelector('[data-friend-leaderboards]');
    const dataEl = document.getElementById('friendLeaderboardData');
    if (!root || !dataEl) {
        return;
    }

    let payload;
    try {
        payload = JSON.parse(dataEl.textContent || '{}');
    } catch (err) {
        console.error('Failed to parse friend leaderboard data.', err);
        return;
    }

    const games = Array.isArray(payload.games) ? payload.games : [];
    if (!games.length) {
        return;
    }

    const searchInput = root.querySelector('[data-leaderboard-search]');
    const sortSelect = root.querySelector('[data-leaderboard-sort]');
    const gameSelect = root.querySelector('[data-leaderboard-game]');
    const noResults = root.querySelector('[data-leaderboard-no-results]');
    const card = root.querySelector('[data-leaderboard-card]');
    const list = root.querySelector('[data-leaderboard-list]');
    const ratingEl = root.querySelector('[data-leaderboard-game-rating]');
    const titleEl = root.querySelector('[data-leaderboard-game-title]');
    const linkEl = root.querySelector('[data-leaderboard-game-link]');
    const imageEl = root.querySelector('[data-leaderboard-game-image]');
    const emptyEl = root.querySelector('[data-leaderboard-empty]');
    const placeholder = root.dataset.leaderboardPlaceholder || '';
    const ratingTemplate = root.dataset.leaderboardRatingLabel || '{0}';
    const noPlayersText = root.dataset.leaderboardNoPlayers || '';

    let filteredGames = games.slice();
    let selectedGameId = payload.selectedGameId || (games[0] && games[0].gameId);
    let currentSort = sortSelect ? sortSelect.value : 'recent';

    function formatRating(value) {
        const val = Number(value ?? 0);
        return ratingTemplate.replace('{0}', val.toFixed(1));
    }

    function sortGames(list) {
        const sorted = list.slice();
        switch ((currentSort || '').toLowerCase()) {
            case 'rating':
                sorted.sort((a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0));
                break;
            case 'alpha':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            default:
                sorted.sort((a, b) => {
                    const aDate = new Date(a.lastActivityAt || 0).getTime();
                    const bDate = new Date(b.lastActivityAt || 0).getTime();
                    return bDate - aDate;
                });
                break;
        }
        return sorted;
    }

    function renderList(entries) {
        if (!list) {
            return;
        }
        list.innerHTML = '';
        entries.forEach((entry) => {
            const row = document.createElement('li');
            row.className = entry.isCurrentUser ? 'friend-leaderboard-card__row is-self' : 'friend-leaderboard-card__row';

            const rank = document.createElement('span');
            rank.className = 'friend-leaderboard-card__rank';
            rank.textContent = String(entry.rank ?? '');
            row.appendChild(rank);

            const player = document.createElement('div');
            player.className = 'friend-leaderboard-card__player';
            if (entry.avatarUrl) {
                const avatar = document.createElement('img');
                avatar.src = entry.avatarUrl;
                avatar.alt = '';
                player.appendChild(avatar);
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'friend-leaderboard-card__avatar-placeholder';
                fallback.setAttribute('aria-hidden', 'true');
                const initial = (entry.displayName || '?').trim();
                fallback.textContent = initial ? initial.charAt(0) : '?';
                player.appendChild(fallback);
            }

            const name = document.createElement('span');
            name.className = 'friend-leaderboard-card__name';
            name.textContent = entry.displayName || '—';
            player.appendChild(name);

            row.appendChild(player);

            const score = document.createElement('span');
            score.className = 'friend-leaderboard-card__score';
            const formattedScore = typeof entry.bestScore === 'number'
                ? entry.bestScore.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : '0';
            score.textContent = formattedScore;
            row.appendChild(score);

            list.appendChild(row);
        });
    }

    function renderGame(gameId) {
        if (!card) {
            return;
        }
        const game = games.find((g) => g.gameId === gameId) || filteredGames[0] || games[0];
        if (!game) {
            card.hidden = true;
            return;
        }

        card.hidden = false;
        selectedGameId = game.gameId;
        if (titleEl) {
            titleEl.textContent = game.title;
        }
        if (linkEl) {
            linkEl.textContent = game.title;
            if (game.slug) {
                linkEl.href = `/Games/Details/${encodeURIComponent(game.slug)}`;
            }
        }
        if (ratingEl) {
            ratingEl.textContent = formatRating(game.averageRating);
        }
        if (imageEl) {
            imageEl.src = game.coverImage || placeholder;
        }

        const players = Array.isArray(game.topPlayers) ? game.topPlayers : [];
        renderList(players);

        if (emptyEl) {
            emptyEl.hidden = players.length > 0;
            if (!players.length && noPlayersText) {
                emptyEl.textContent = noPlayersText;
            }
        }
    }

    function updateOptions() {
        if (gameSelect) {
            gameSelect.innerHTML = '';
            filteredGames.forEach((game) => {
                const option = document.createElement('option');
                option.value = game.gameId;
                option.textContent = game.title;
                if (game.gameId === selectedGameId) {
                    option.selected = true;
                }
                gameSelect.appendChild(option);
            });
            if (!filteredGames.some((game) => game.gameId === selectedGameId)) {
                selectedGameId = filteredGames.length ? filteredGames[0].gameId : null;
            }
            if (gameSelect) {
                gameSelect.disabled = filteredGames.length === 0;
            }
        }

        if (noResults) {
            noResults.hidden = filteredGames.length > 0;
        }

        if (!filteredGames.length) {
            selectedGameId = null;
            if (card) {
                card.hidden = true;
            }
            if (emptyEl) {
                emptyEl.hidden = true;
            }
            return;
        }

        renderGame(selectedGameId);
    }

    function applyFilters() {
        const query = ((searchInput && searchInput.value) || '').trim().toLowerCase();
        filteredGames = games.filter((game) => !query || game.title.toLowerCase().includes(query));
        filteredGames = sortGames(filteredGames);
        updateOptions();
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentSort = sortSelect.value || 'recent';
            filteredGames = sortGames(filteredGames);
            updateOptions();
        });
    }

    if (gameSelect) {
        gameSelect.addEventListener('change', () => {
            selectedGameId = gameSelect.value;
            renderGame(selectedGameId);
        });
    }

    applyFilters();
})();