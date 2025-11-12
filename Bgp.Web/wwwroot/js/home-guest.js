(function () {
    const root = document.querySelector('[data-home-guest]');
    if (!root) {
        return;
    }

    const popularGrid = root.querySelector('[data-home-popular]');
    const loginUrl = root.dataset.loginUrl || '/Account/Login';
    const isAuthenticated = root.dataset.authenticated === 'true';
    const detailsTemplate = root.dataset.detailsUrlTemplate || '/Games/Details/__slug__'; 
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

    function buildGuestLoginLink(slug) {
        const detailsPath = `/Games/Details/${encodeURIComponent(slug)}`;
        try {
            const target = new URL(loginUrl, window.location.origin);
            target.searchParams.set('returnUrl', detailsPath);
            target.searchParams.set('intent', 'play');
            return target.pathname + target.search;
        }
        catch (error) {
            return `${loginUrl}?returnUrl=${encodeURIComponent(detailsPath)}&intent=play`;
        }
    }

    function buildGameLink(slug) {
        const safeSlug = encodeURIComponent(slug);
        if (isAuthenticated) {
            return detailsTemplate.replace('__slug__', safeSlug);
        }
        return buildGuestLoginLink(slug);
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
            const detailsUrl = buildGameLink(game.slug);
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

    function setupFeaturedCarousel(carousel) {
        const viewport = carousel.querySelector('[data-featured-viewport]');
        const track = carousel.querySelector('[data-featured-track]');
        if (!viewport || !track) {
            return;
        }

        let items = Array.from(track.children);
        if (!items.length) {
            return;
        }

        if (track.dataset.loopReady === 'true') { 

            return;
        }

        const templateSources = items.map(item => item.cloneNode(true));
        const templateCount = templateSources.length;
        const hasLoop = templateCount > 1;

        let itemWidth = 0;
        let gap = 0;
        let autoTimer = null;
        let leadingClones = 0;
        let trailingClones = 0;
        let firstRealIndex = 0;
        let lastRealIndex = templateCount - 1;
        let currentIndex = 0;

        const prevButton = carousel.querySelector('[data-featured-prev]');
        const nextButton = carousel.querySelector('[data-featured-next]');

        function refreshItems() {
            items = Array.from(track.children);
        }

        function cloneTemplate(index) {
            if (!templateCount) {
                return null;
            }
            const normalized = ((index % templateCount) + templateCount) % templateCount;
            const source = templateSources[normalized];
            if (!source) {
                return null;
            }
            const clone = source.cloneNode(true);
            clone.dataset.carouselClone = 'true';
            return clone;
        }

        function addLeadingClone(templateIndex) {
            if (!hasLoop) {
                return;
            }
            const clone = cloneTemplate(templateIndex);
            if (!clone) {
                return;
            }
            const targetIndex = Math.min(leadingClones, items.length);
            const insertBeforeNode = items[targetIndex] || items[0] || null;
            track.insertBefore(clone, insertBeforeNode);
            leadingClones += 1;
            refreshItems();
        }

        function addTrailingClone(templateIndex) {
            if (!hasLoop) {
                return;
            }
            const clone = cloneTemplate(templateIndex);
            if (!clone) {
                return;
            }
            const anchorIndex = Math.max(0, items.length - trailingClones);
            const anchorNode = items[anchorIndex] || null;
            track.insertBefore(clone, anchorNode);
            trailingClones += 1;
            refreshItems();
        }

        if (hasLoop) {
            addLeadingClone(templateCount - 1);
            addTrailingClone(0);
        }

        track.dataset.loopReady = 'true';

        function updateBounds() {
            refreshItems();
            if (hasLoop) {
                firstRealIndex = leadingClones;
                lastRealIndex = Math.max(leadingClones, items.length - trailingClones - 1);
            } else {
                firstRealIndex = 0;
                lastRealIndex = items.length - 1;
            }

            if (currentIndex < firstRealIndex || currentIndex > lastRealIndex) {
                currentIndex = firstRealIndex;
            }
        }

        refreshItems();
        const referenceIndex = Math.min(Math.max(firstRealIndex, 0), items.length - 1);
            const reference = items[referenceIndex];
            if (!reference) {
                itemWidth = 0;

                return;
            }

            const rect = reference.getBoundingClientRect(); 
            itemWidth = rect.width;
            const styles = window.getComputedStyle(track);
            const gapValue = parseFloat(styles.columnGap || styles.gap || '0');
            gap = Number.isNaN(gapValue) ? 0 : gapValue;
        }

        function ensureFill() {
            if (!hasLoop || !templateCount) {
                return;
            }

            refreshItems();


            if (!itemWidth) {
                measure();
            }

            const viewportWidth = viewport.getBoundingClientRect().width;
            const singleWidth = itemWidth + gap;
            if (!singleWidth) {
                return;
            }

            const visibleNeeded = Math.max(1, Math.ceil(viewportWidth / singleWidth));
            const targetClones = Math.max(visibleNeeded + 1, 2);

            while (leadingClones < targetClones) {
                addLeadingClone(templateCount - 1 - (leadingClones % templateCount));
            }

            while (trailingClones < targetClones) {
                addTrailingClone(trailingClones % templateCount);
            }

            updateBounds();
        }

        function applyTransform(animated = true) {
            if (!animated) {
                track.style.transition = 'none';
            } 

            const offset = -(itemWidth + gap) * currentIndex;
            track.style.transform = `translateX(${offset}px)`;
            if (!animated) {
                track.offsetHeight;
                track.style.transition = '';
            } 

        }

        function goTo(index, animated = true) {
            currentIndex = index;
            applyTransform(animated); 

        }

    function step(delta) {
        if (!items.length) {
            return;
        }
            if (!hasLoop) {
                const total = items.length;
               
                const nextIndex = (currentIndex + delta) % total;
                currentIndex = (nextIndex + total) % total;
                applyTransform();
                return;
            }

            currentIndex += delta;
        applyTransform();

    }

    function handleLoopBoundary(event) {
        if (!hasLoop || event.target !== track || event.propertyName !== 'transform') {
            return;
        }

            if (currentIndex > lastRealIndex) {
                goTo(firstRealIndex, false);
            } else if (currentIndex < firstRealIndex) {
                goTo(lastRealIndex, false);
            }

        }

        function stopAuto() {
            if (autoTimer) {
                clearInterval(autoTimer);
                autoTimer = null;
            }
        }

        function startAuto() {
            if (!hasLoop) { 
                return;
            }
            stopAuto();
            autoTimer = setInterval(() => {
                step(1);
            }, 5000);
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                stopAuto();
                step(-1);
                startAuto();
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                stopAuto();
                step(1);
                startAuto();
            });
        }

        carousel.addEventListener('mouseenter', stopAuto);
        carousel.addEventListener('mouseleave', startAuto);
        carousel.addEventListener('focusin', stopAuto);
        carousel.addEventListener('focusout', startAuto);

        window.addEventListener('resize', () => {
            measure();
            ensureFill();
            measure();
            applyTransform(false);
        });

    track.addEventListener('transitionend', handleLoopBoundary);

    updateBounds();
    currentIndex = firstRealIndex;

        measure();
        ensureFill();
        measure();
        goTo(currentIndex, false);
        startAuto();
    }

    root.querySelectorAll('[data-featured-carousel]').forEach(setupFeaturedCarousel);


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