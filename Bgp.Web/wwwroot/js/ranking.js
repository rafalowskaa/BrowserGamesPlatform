(function () {
    const sections = Array.from(document.querySelectorAll('[data-ranking]'));
    if (!sections.length) {
        return;
    }

    const chatDock = document.getElementById('chatDock');
    const currentUserId = chatDock?.dataset.chatUser;
    const menuPortals = new Map();
    let activeMenu = null;
    const interactiveSelectors = ['button', 'a', 'input', 'select', 'textarea', '[data-ranking-menu]', '[data-ranking-action]', '.leaderboard__menu', '.leaderboard__cell--actions'];

    const isInteractiveTarget = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        return interactiveSelectors.some(selector => node.closest(selector));
    };

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
        activeMenu.portal.hidden = true;
        activeMenu.button.setAttribute('aria-expanded', 'false');
        activeMenu.portal.style.visibility = '';
        if (reason === 'escape') {
            activeMenu.button.focus();
        }
        activeMenu = null;
    }

    function positionMenu(button, portal) {
        const rect = button.getBoundingClientRect();
        const width = portal.offsetWidth || 200;
        const maxLeft = window.innerWidth - width - 8;
        const left = Math.max(8, Math.min(maxLeft, rect.right + window.scrollX - width));
        const top = rect.bottom + window.scrollY + 8;

        portal.style.left = `${left}px`;
        portal.style.top = `${top}px`;
        portal.style.minWidth = `${Math.max(width, 200)}px`;
    }

    function openMenu(button, row, portal) {
        if (activeMenu?.button === button) {
            closeMenus();
            return;
        }

        closeMenus();
        portal.hidden = false;
        portal.style.visibility = 'hidden';
        positionMenu(button, portal);
        portal.style.visibility = 'visible';
        button.setAttribute('aria-expanded', 'true');
        activeMenu = { button, row, portal };
    }

    function handleActionClick(actionButton, row) {
        const action = actionButton.dataset.rankingAction;
        if (!action || !row) return;

        const userId = row.dataset.userId;
        const displayName = row.dataset.name || userId || '';

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

    function navigateToProfile(row) {
        if (!row) return;
        closeMenus();
        api.viewProfile(row.dataset.userId);
    }

    function createMenuPortal(section) {
        const template = section.querySelector('[data-ranking-menu-template]');
        const portal = template ? template.cloneNode(true) : document.createElement('div');
        const menuId = `${section.dataset.rankingContext || 'leaderboard'}-menu`;

        portal.hidden = true;
        portal.id = menuId;
        portal.removeAttribute('data-ranking-menu-template');
        portal.classList.add('leaderboard__menu');
        if (!portal.hasAttribute('role')) {
            portal.setAttribute('role', 'menu');
        }

        document.body.appendChild(portal);
        menuPortals.set(section, portal);
        return { portal, menuId };
    }

    sections.forEach(section => {
        const list = section.querySelector('[data-ranking-list]');
        const rows = Array.from(list?.querySelectorAll('[data-user-id]') ?? []);
        const search = section.querySelector('[data-ranking-search]');
        const filter = section.querySelector('[data-ranking-filter]');
        const empty = section.querySelector('[data-ranking-empty]');

        const jumpButton = section.querySelector('[data-ranking-jump]');
        const { portal, menuId } = createMenuPortal(section);

        rows.forEach(row => {
            const button = row.querySelector('[data-ranking-menu]');
            if (button) {
                button.setAttribute('aria-controls', menuId);
                button.setAttribute('aria-expanded', 'false');
            }

            if (currentUserId && row.dataset.userId === currentUserId) {
                row.classList.add('is-self');
            }
        });

        if (jumpButton && rows.some(r => r.classList.contains('is-self'))) {
            jumpButton.hidden = false;
            jumpButton.addEventListener('click', () => {
                if (search) search.value = '';
                if (filter) filter.value = '';
                applyFilters();
                const target = rows.find(r => r.classList.contains('is-self'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('is-self');
                }
            });
        }

        function applyFilters() {
            const query = (search?.value || '').trim().toLowerCase();
            const tier = (filter?.value || '').trim().toLowerCase();
            let visible = 0;

            rows.forEach(row => {
                const name = (row.dataset.name || '').toLowerCase();
                const itemTier = (row.dataset.tier || '').toLowerCase()
                const matches = (!query || name.includes(query)) && (!tier || itemTier === tier);
                row.hidden = !matches;
                if (matches) {
                    visible += 1;
                }
            });

            if (empty) {
                empty.hidden = visible > 0;
            }
        }

        if (search) {
            search.addEventListener('input', () => {
                closeMenus();
                applyFilters();
            });
        }

        if (filter) {
            filter.addEventListener('change', () => {
                closeMenus();
                applyFilters();
            });
        }

        applyFilters();

        if (list) {
            list.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;

                if (isInteractiveTarget(target)) {
                    return;
                }

                const row = target.closest('[data-user-id]');
                if (!row) return;

                event.preventDefault();
                navigateToProfile(row);
            });
        }
    });

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const menuButton = target.closest('[data-ranking-menu]');
        if (menuButton) {
            const row = menuButton.closest('[data-user-id]');
            const section = menuButton.closest('[data-ranking]');
            const portal = section ? menuPortals.get(section) : null;
            if (row && portal) {
                openMenu(menuButton, row, portal);
                event.stopPropagation();
            }
            return;
        }

        const actionButton = target.closest('[data-ranking-action]');
        if (actionButton) {
            handleActionClick(actionButton, activeMenu?.row || actionButton.closest('[data-user-id]'));
            return;
        }

        if (activeMenu && !activeMenu.portal.contains(target) && !activeMenu.button.contains(target)) {
            closeMenus();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenus('escape');
        }
    });
    window.addEventListener('resize', () => closeMenus());
    window.addEventListener('scroll', () => closeMenus(), true);
})();