(function () {
    const sidebar = document.getElementById('chatSidebar');
    const toggle = document.getElementById('chatToggle');
    const closeBtn = document.getElementById('chatClose');
    const friendsList = document.getElementById('friendsList');
    const reqList = document.getElementById('requestsList');
    const threadHeader = document.getElementById('threadHeader');
    const threadBody = document.getElementById('threadBody');
    const msgInput = document.getElementById('msgInput');
    const msgSend = document.getElementById('msgSend');

    if (!sidebar || !toggle) return;

    let currentPeer = null;
    let connection = null;

    function openSidebar() { sidebar.classList.add('open'); }
    function closeSidebar() { sidebar.classList.remove('open'); }
    toggle.addEventListener('click', openSidebar);
    closeBtn.addEventListener('click', closeSidebar);

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.innerText = text;
        return e;
    }

    async function loadFriends() {
        friendsList.innerHTML = '';
        reqList.innerHTML = '';
        try {
            const r = await fetch('/api/friends');
            if (!r.ok) return;
            const list = await r.json();
            const friends = list.filter(x => x.status === 1); // Accepted
            const outgoing = list.filter(x => x.status === 0 && x.outgoingRequest);
            const incoming = list.filter(x => x.status === 0 && !x.outgoingRequest);

            friends.forEach(f => {
                const li = el('li', 'row');
                li.innerHTML = `<span>${f.displayName}</span><button class="btn-link">Pisz</button>`;
                li.querySelector('button').addEventListener('click', () => openChat(f.userId, f.displayName));
                friendsList.appendChild(li);
            });

            incoming.forEach(f => {
                const li = el('li', 'row');
                const acc = el('button', 'btn-link', 'Akceptuj');
                acc.addEventListener('click', async () => {
                    await fetch(`/api/friends/accept/${encodeURIComponent(f.userId)}`, { method: 'POST' });
                    await loadFriends();
                });
                li.append(el('span', '', f.displayName), acc);
                reqList.appendChild(li);
            });

            outgoing.forEach(f => {
                const li = el('li', 'row');
                li.append(el('span', '', f.displayName), el('span', 'muted', 'Wysłano zaproszenie'));
                reqList.appendChild(li);
            });

        } catch { /* ignore */ }
    }

    async function openChat(userId, displayName) {
        currentPeer = { userId, displayName };
        threadHeader.innerText = displayName;
        threadBody.innerHTML = '';
        openSidebar();

        const r = await fetch(`/api/chat/history/${encodeURIComponent(userId)}?take=50`);
        if (r.ok) {
            const hist = await r.json();
            hist.forEach(addMessageToThread);
            threadBody.scrollTop = threadBody.scrollHeight;
        }
    }

    function addMessageToThread(m) {
        const wrap = el('div', m.fromSelf ? 'msg me' : 'msg peer');
        const txt = el('div', 'bubble', m.content);
        const time = new Date(m.sentAtUtc + 'Z').toLocaleTimeString();
        const meta = el('div', 'meta', time);
        wrap.appendChild(txt);
        wrap.appendChild(meta);
        threadBody.appendChild(wrap);
        threadBody.scrollTop = threadBody.scrollHeight;
    }

    async function sendMessage() {
        const txt = msgInput.value.trim();
        if (!txt || !currentPeer) return;
        msgInput.value = '';
        if (!connection) return;

        try {
            await connection.invoke('SendPrivateMessage', currentPeer.userId, txt);
        } catch (e) {
            console.error(e);
        }
    }

    msgSend.addEventListener('click', sendMessage);
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    async function startSignalR() {
        if (typeof signalR === 'undefined') return;
        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/chat')
            .withAutomaticReconnect()
            .build();

        connection.on('ReceiveMessage', (m) => {
            // pokaż tylko jeśli dotyczy aktualnej rozmowy
            if (!currentPeer) return;
            if ((m.senderId === currentPeer.userId) || (m.receiverId === currentPeer.userId)) {
                addMessageToThread({
                    id: m.id,
                    senderId: m.senderId,
                    receiverId: m.receiverId,
                    content: m.content,
                    sentAtUtc: m.sentAtUtc,
                    fromSelf: m.senderId !== currentPeer.userId ? true : false
                });
            }
        });

        try { await connection.start(); } catch { /* ignore */ }
    }

    // expose helpers for dashboard actions
    window.bgpChat = {
        open: openChat,
        openWithMessage: async (userId, displayName, message) => {
            await openChat(userId, displayName);
            if (message) {
                msgInput.value = message;
                msgInput.focus();
            }
        }
    };

    // start
    loadFriends();
    startSignalR();
})();
