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

    function createActionButton(text, handler, css) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = css || 'btn-link';
        btn.innerText = text;
        btn.addEventListener('click', handler);
        return btn;
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
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.className = 'friend-name';
            name.innerText = f.displayName;
            const actions = document.createElement('div');
            actions.className = 'friend-actions';
            actions.appendChild(createActionButton(labels.chat, () => openChat(f.userId, f.displayName), 'btn-link'));
            actions.appendChild(createActionButton(labels.invite, () => inviteToGame(f.userId, f.displayName), 'btn-link'));
            actions.appendChild(createActionButton(labels.remove, () => removeFriend(f.userId), 'btn-danger'));
            li.append(name, actions);
            acceptedList.appendChild(li);
        });

        incoming.forEach(f => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.className = 'friend-name';
            name.innerText = f.displayName;
            const actions = document.createElement('div');
            actions.className = 'friend-actions';
            actions.appendChild(createActionButton(labels.accept, () => acceptFriend(f.userId), 'btn-primary btn-small'));
            actions.appendChild(createActionButton(labels.decline, () => removeFriend(f.userId), 'btn-ghost btn-small'));
            li.append(name, actions);
            incomingList.appendChild(li);
        });

        outgoing.forEach(f => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.className = 'friend-name';
            name.innerText = f.displayName;
            const actions = document.createElement('div');
            actions.className = 'friend-actions';
            actions.appendChild(createActionButton(labels.cancel, () => removeFriend(f.userId), 'btn-ghost btn-small'));
            li.append(name, actions);
            outgoingList.appendChild(li);
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
                const li = document.createElement('li');
                const name = document.createElement('span');
                name.className = 'friend-name';
                name.innerText = r.name;
                const actions = document.createElement('div');
                actions.className = 'friend-actions';
                actions.appendChild(createActionButton(labels.add, () => sendInvite(r.id)));
                li.append(name, actions);
                searchResults.appendChild(li);
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