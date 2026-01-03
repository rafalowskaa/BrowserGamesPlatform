(function () {
    const sections = Array.from(document.querySelectorAll('[data-ranking]'));
    if (!sections.length) {
        return;
    }

    function closeMenus(section, except) {
        const menus = section.querySelectorAll('[data-ranking-menu-panel]');
        const toggles = section.querySelectorAll('[data-ranking-menu]');
        menus.forEach(menu => {
            if (menu !== except) {
                menu.hidden = true;
            }
        });
        toggles.forEach(toggle => {
            if (!except || toggle.nextElementSibling !== except) {
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    sections.forEach(section => {
        const list = section.querySelector('[data-ranking-list]');
        const items = Array.from(list ? list.children : []);
        const search = section.querySelector('[data-ranking-search]');
        const filter = section.querySelector('[data-ranking-filter]');
        const empty = section.querySelector('[data-ranking-empty]');

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

        section.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            if (target.dataset.rankingAction) {
                const action = target.dataset.rankingAction;
                const row = target.closest('.ranking-row');
                const name = row?.dataset.name || '';
                target.setAttribute('data-ranking-selected', action);
                target.setAttribute('data-ranking-user', name);
                closeMenus(section);
                return;
            }

            if (target.matches('[data-ranking-menu]')) {
                const menu = target.nextElementSibling;
                if (!(menu instanceof HTMLElement)) {
                    return;
                }
                const isOpen = menu.hidden === false;
                closeMenus(section);
                if (!isOpen) {
                    menu.hidden = false;
                    target.setAttribute('aria-expanded', 'true');
                }
                event.stopPropagation();
            }
        });

        document.addEventListener('click', (event) => {
            if (!section.contains(event.target)) {
                closeMenus(section);
            }
        });

        section.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMenus(section);
            }
        });
    });
})();