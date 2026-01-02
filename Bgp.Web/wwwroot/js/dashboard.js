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