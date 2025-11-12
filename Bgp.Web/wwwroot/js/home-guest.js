(function () {
    const root = document.querySelector('[data-home-guest]');
    if (!root) {
        return;
    }

    const popularGrid = root.querySelector('[data-home-popular]');
    const tagButtons = Array.from(root.querySelectorAll('[data-home-tag]'));
    const playLabel = root.dataset.playLabel || 'Zagraj';
    const detailsLabel = root.dataset.detailsLabel || 'Szczegóły';
    const newLabel = root.dataset.newLabel || 'Nowość';
    const ratingTemplate = root.dataset.ratingTemplate || 'Ocena {0} ({1})';
    const placeholder = root.dataset.placeholder || '';
    const emptyLabel = root.dataset.emptyLabel || '';
    let currentTag = tagButtons.find(btn => btn.classList.contains('is-active'))?.dataset.tag || null;
    let currentRequest = null;

    function formatRating(rating, reviewsCount) {
        return ratingTemplate
            .replace('{0}', rating.toFixed(1))
            .replace('{1}', reviewsCount.toString());
    }

    function escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createSkeletonCard() {
        const skeleton = document.createElement('div');
        skeleton.className = 'game-card-guest game-card-guest--skeleton';
        skeleton.innerHTML = '<div class="game-card-guest__media"></div><div class="game-card-guest__content"><div class="game-card-guest__title"></div><div class="game-card-guest__excerpt"></div></div>';
        return skeleton;
    }

    function showSkeleton(count = 4) {
        if (!popularGrid) {
            return;
        }

        popularGrid.setAttribute('aria-busy', 'true');
        popularGrid.innerHTML = '';
        for (let i = 0; i < count; i += 1) {
            popularGrid.appendChild(createSkeletonCard());
        }
    }

    function renderEmpty() {
        popularGrid.setAttribute('aria-busy', 'false');
        const emptyState = document.createElement('p');
        emptyState.className = 'home-guest__empty';
        emptyState.textContent = emptyLabel || 'Brak gier do wyświetlenia.';
        popularGrid.innerHTML = '';
        popularGrid.appendChild(emptyState);
    }

    function renderGames(games) {
        if (!popularGrid) {
            return;
        }

        popularGrid.innerHTML = '';
        if (!Array.isArray(games) || games.length === 0) {
            renderEmpty();
            return;
        }

        const fragment = document.createDocumentFragment();
        games.forEach(game => {
            const card = document.createElement('article');
            card.className = 'game-card-guest';
            const cover = game.coverImagePath || placeholder;
            const detailsUrl = `/Games/Details/${encodeURIComponent(game.slug)}`;
            const ratingHtml = game.reviewsCount > 0
                ? `<span class="game-card-guest__rating" aria-label="${formatRating(game.rating, game.reviewsCount)}">★ ${game.rating.toFixed(1)}</span>`
                : `<span class="game-card-guest__badge">${escapeHtml(newLabel)}</span>`;

            card.innerHTML = `
                <div class="game-card-guest__media">
                    <a class="game-card-guest__cover" href="${detailsUrl}" aria-label="${escapeHtml(game.title)}">
                        <span class="sr-only">${escapeHtml(game.title)}</span>
                        <img data-game-card-img src="${placeholder}" data-src="${cover}" data-srcset="${cover} 1x" alt="${escapeHtml(game.title)}" width="320" height="180" loading="lazy" decoding="async" />
                    </a>
                    <div class="game-card-guest__actions">
                        <a class="game-card-guest__play" href="${detailsUrl}">${escapeHtml(playLabel)}</a>
                    </div>
                </div>
                <div class="game-card-guest__content">
                    <h3 class="game-card-guest__title"><a href="${detailsUrl}">${escapeHtml(game.title)}</a></h3>
                    <p class="game-card-guest__excerpt">${escapeHtml(game.excerpt || '')}</p>
                    <div class="game-card-guest__meta">
                        ${ratingHtml}
                        <a class="game-card-guest__details" href="${detailsUrl}">${escapeHtml(detailsLabel)}</a>
                    </div>
                </div>
            `;

            fragment.appendChild(card);
        });

        popularGrid.appendChild(fragment);
        popularGrid.setAttribute('aria-busy', 'false');
        if (typeof window.playgridRefreshGameCardImages === 'function') {
            window.playgridRefreshGameCardImages(popularGrid.querySelectorAll('[data-game-card-img]'));
        }
    }

    function fetchGames(tag) {
        const params = new URLSearchParams();
        if (tag) {
            params.set('tag', tag);
        }
        params.set('limit', '8');

        if (currentRequest) {
            currentRequest.abort();
        }
        currentRequest = new AbortController();

        showSkeleton();

        fetch(`/api/home/trending?${params.toString()}`, { signal: currentRequest.signal })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Request failed');
                }
                return response.json();
            })
            .then(data => {
                renderGames(data);
            })
            .catch(error => {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error('Failed to load games', error);
                renderEmpty();
            })
            .finally(() => {
                currentRequest = null;
            });
    }

    function setActive(button) {
        tagButtons.forEach(btn => {
            const isActive = btn === button;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    tagButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tag = button.dataset.tag || null;
            if (tag === currentTag) {
                return;
            }
            currentTag = tag;
            setActive(button);
            fetchGames(tag);
        });
    });
})();