(function () {
    const sections = Array.from(document.querySelectorAll('[data-ranking]'));
    if (!sections.length) {
        return;
    }

    const chatDock = document.getElementById('chatDock');
    const currentUserId = chatDock?.dataset.chatUser;
    let activeMenu = null;

    const api = {
        openChat: (userId, displayName) => {
            if (window.bgpChat && typeof window.bgpChat.open === 'function') {
                window.bgpChat.open(userId, displayName);
            }
        },
        inviteToGame: (userId, displayName) => {
            if (window.bgpChat && typeof window.bgpChat.openWithMessage === 'function') {
                window.bgpChat.openWithMessage(userId, displayName, '');
            } else if (window.bgpChat && typeof window.bgpChat.open === 'function') {
                window.bgpChat.open(userId, displayName);
            }
        },
        addFriend: async (userId) => {
            try {
                await fetch('/api/friends/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ targetUserId: userId })
                });
            } catch (err) {
                console.error('Unable to send friend request from leaderboard.', err);
            }
        },
        viewProfile: (userId) => {
            if (!userId) return;
            window.location.href = `/dashboard/profile/${encodeURIComponent(userId)}`;
        }
    };

    function closeMenus(reason) {
        if (!activeMenu) return;
        activeMenu.panel.hidden = true;
        activeMenu.button.setAttribute('aria-expanded', 'false');
        if (reason === 'escape') {
            activeMenu.button.focus();
        }
        activeMenu = null;
    }

    function openMenu(button, panel) {
        if (activeMenu?.button === button) {
            closeMenus();
            return;
        }

        closeMenus();
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        activeMenu = { button, panel };
    }

    function handleActionClick(actionButton) {
        const action = actionButton.dataset.rankingAction;
        if (!action) return;

        const row = actionButton.closest('[data-user-id]');
        const userId = row?.dataset.userId;
        const displayName = row?.dataset.name || userId || '';

        switch (action) {
            case 'message':
                api.openChat(userId, displayName);
                break;
            case 'invite':
                api.inviteToGame(userId, displayName);
                break;
            case 'friend':
                api.addFriend(userId);
                break;
            case 'profile':
                api.viewProfile(userId);
                break;
            default:
                break;
        }

        closeMenus();
    }

    sections.forEach(section => {
        const list = section.querySelector('[data-ranking-list]');
        const items = Array.from(list ? list.children : []);
        const search = section.querySelector('[data-ranking-search]');
        const filter = section.querySelector('[data-ranking-filter]');
        const empty = section.querySelector('[data-ranking-empty]');

        items.forEach((item, index) => {
            const menu = item.querySelector('[data-ranking-menu-panel]');
            const button = item.querySelector('[data-ranking-menu]');
            if (menu && button) {
                const id = `${section.dataset.rankingContext || 'leaderboard'}-menu-${index}`;
                menu.id = id;
                button.setAttribute('aria-controls', id);
            }

            if (currentUserId && item.dataset.userId === currentUserId) {
                item.classList.add('is-self');
            }
        });

        function applyFilters() {
            const query = (search?.value || '').trim().toLowerCase();
            const tier = (filter?.value || '').trim().toLowerCase();
            let visible = 0;

            items.forEach(item => {
                const name = (item.dataset.name || '').toLowerCase();
                const itemTier = (item.dataset.tier || '').toLowerCase();
                const matches = (!query || name.includes(query)) && (!tier || itemTier === tier);
                item.hidden = !matches;
                if (matches) {
                    visible += 1;
                }
            });

            if (empty) {
                empty.hidden = visible > 0;
            }
        }

        if (search) {
            search.addEventListener('input', applyFilters);
        }

        if (filter) {
            filter.addEventListener('change', applyFilters);
        }

        applyFilters();
        });

        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const menuButton = target.closest('[data-ranking-menu]');
            if (menuButton) {
                const panel = menuButton.nextElementSibling;
                if (panel instanceof HTMLElement) {
                    openMenu(menuButton, panel);
                    event.stopPropagation();
                return;
                }
            }

            const actionButton = target.closest('[data-ranking-action]');
            if (actionButton) {
                handleActionClick(actionButton);
                return;
            }

            if (activeMenu && !activeMenu.panel.contains(target) && !activeMenu.button.contains(target)) {
                closeMenus();
            }
        });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenus('escape');
        }
    });
})();