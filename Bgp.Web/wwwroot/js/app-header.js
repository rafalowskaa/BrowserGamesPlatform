(function () {
    const supportLazy = 'loading' in HTMLImageElement.prototype;

    const observer = !supportLazy
        ? new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    return;
                }
                hydrateImage(entry.target);
                obs.unobserve(entry.target);
            });
        }, { rootMargin: '200px 0px' })
        : null;

    function hydrateImage(img) {
        if (!img || img.dataset.processed === 'true') {
            return;
        }

        const source = img.getAttribute('data-src');
        const sourceSet = img.getAttribute('data-srcset');
        if (source) {
            img.src = source;
            img.removeAttribute('data-src');
        }
        if (sourceSet) {
            img.srcset = sourceSet;
            img.removeAttribute('data-srcset');
        } else if (source && !img.srcset) {
            img.srcset = `${source} 1x`;
        }
        img.dataset.processed = 'true';
    }

    function scanImages(images) {
        const nodes = images || document.querySelectorAll('[data-game-card-img]');
        nodes.forEach(img => {
            if (supportLazy) {
                hydrateImage(img);
            } else if (observer) {
                observer.observe(img);
            }
        });
    }

    window.playgridRefreshGameCardImages = function (images) {
        if (images instanceof NodeList || Array.isArray(images)) {
            scanImages(images);
        } else if (images) {
            scanImages([images]);
        } else {
            scanImages();
        }
    };

    scanImages();
    function initUserMenus() {
        const menus = document.querySelectorAll('[data-user-menu]');
        if (!menus.length) {
            return;
        }

        let activeMenu = null;

        function closeMenu(menu, returnFocus) {
            if (!menu) {
                return;
            }

            const trigger = menu.querySelector('.user-menu__trigger');
            const dropdown = menu.querySelector('.user-menu__dropdown');
            if (dropdown) {
                dropdown.classList.remove('is-open');
            }
            menu.classList.remove('is-open');
            if (trigger) {
                trigger.setAttribute('aria-expanded', 'false');
                if (returnFocus) {
                    trigger.focus();
                }
            }

            if (activeMenu === menu) {
                activeMenu = null;
            }
        }

        function openMenu(menu) {
            if (!menu) {
                return;
            }

            if (activeMenu && activeMenu !== menu) {
                closeMenu(activeMenu);
            }

            const trigger = menu.querySelector('.user-menu__trigger');
            const dropdown = menu.querySelector('.user-menu__dropdown');
            if (!trigger || !dropdown) {
                return;
            }

            dropdown.classList.add('is-open');
            menu.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            activeMenu = menu;
        }

        menus.forEach(menu => {
            const trigger = menu.querySelector('.user-menu__trigger');
            const dropdown = menu.querySelector('.user-menu__dropdown');
            if (!trigger || !dropdown) {
                return;
            }

            trigger.setAttribute('aria-expanded', 'false');

            trigger.addEventListener('click', event => {
                event.preventDefault();
                if (menu.classList.contains('is-open')) {
                    closeMenu(menu, false);
                } else {
                    openMenu(menu);
                }
            });

            trigger.addEventListener('keydown', event => {
                if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !menu.classList.contains('is-open')) {
                    event.preventDefault();
                    openMenu(menu);
                }
            });

            dropdown.addEventListener('click', event => {
                const actionable = event.target.closest('a, button');
                if (actionable) {
                    closeMenu(menu, false);
                }
            });

            dropdown.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeMenu(menu, true);
                }
            });
        });

        document.addEventListener('click', event => {
            if (!activeMenu) {
                return;
            }

            if (!activeMenu.contains(event.target)) {
                closeMenu(activeMenu, false);
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && activeMenu) {
                closeMenu(activeMenu, true);
            }
        });
    }

    initUserMenus();
    function initNotificationBadges() {
        const badges = Array.from(document.querySelectorAll('[data-notifications-badge]'));
        if (!badges.length) {
            return;
        }
        const storageKey = 'bgp.notifications.lastSeen';
        const notificationsView = document.querySelector('[data-notifications-view]');
        if (notificationsView) {
            try {
                window.localStorage.setItem(storageKey, new Date().toISOString());
            } catch (err) {

            }
            badges.forEach((badge) => {
                badge.textContent = '0';
                badge.setAttribute('hidden', '');
            });
        }

        let since = null;
        try {
            since = window.localStorage.getItem(storageKey);
        } catch (err) {
            since = null;
        }

        const url = new URL('/api/notifications/unread-count', window.location.origin);
        if (since) {
            url.searchParams.set('since', since);
        }

        fetch(url.toString(), { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!payload || typeof payload.count !== 'number') {
                    return;
                }
                const count = payload.count;
                badges.forEach((badge) => {
                    badge.textContent = String(count);
                    if (count > 0) {
                        badge.removeAttribute('hidden');
                    } else {
                        badge.setAttribute('hidden', '');
                    }
                });
            })
            .catch(() => { });
    }

    initNotificationBadges();
})();