(() => {
    const configScript = document.getElementById('gameDetailsConfig');
    if (!configScript) {
        return;
    }

    let config = {};
    try {
        config = JSON.parse(configScript.textContent || '{}');
    } catch (err) {
        console.error('Invalid game details config', err);
        return;
    }

    const root = configScript.closest('[data-game-config]') || document.querySelector('[data-game-config]');
    if (!root) {
        return;
    }

    const tabs = Array.from(root.querySelectorAll('[data-tab]'));
    const panels = Array.from(root.querySelectorAll('[data-tab-panel]'));
    const tabTargets = Array.from(root.querySelectorAll('[data-tab-target]'));
    const copyButtons = Array.from(root.querySelectorAll('[data-copy-link], [data-copy-text]'));
    const playButtons = Array.from(root.querySelectorAll('[data-play-now]'));
    let playerFrame = root.querySelector('[data-game-frame]');
    const playerContainer = root.querySelector('[data-player-frame]');
    const playerFrameTitle = playerFrame?.getAttribute('title') || document.title;
    const playerFrameLoading = playerFrame?.getAttribute('loading') || 'lazy';
    const playerFrameAllow = playerFrame?.getAttribute('allow') || 'fullscreen';
    const playerFrameAllowFullscreen = playerFrame?.hasAttribute('allowfullscreen');
    const playerStatus = root.querySelector('[data-player-status-text]');
    const retryButton = root.querySelector('[data-retry]');
    const theaterToggle = root.querySelector('[data-theater-toggle]');
    const modeInputs = Array.from(root.querySelectorAll('input[name="game-mode"]'));
    const ratingPanel = root.querySelector('[data-rating-summary]');
    const starButtons = ratingPanel ? Array.from(ratingPanel.querySelectorAll('[data-star-value]')) : [];
    const ratingAverage = ratingPanel?.querySelector('[data-rating-average]');
    const ratingCount = ratingPanel?.querySelector('[data-rating-count]');
    const ratingFeedback = ratingPanel?.querySelector('[data-rating-feedback]');
    const ratingBars = ratingPanel ? Array.from(ratingPanel.querySelectorAll('[data-rating-bar]')) : [];
    const ratingBarCounts = ratingPanel ? Array.from(ratingPanel.querySelectorAll('[data-rating-count-star]')) : [];
    const commentsContainer = root.querySelector('[data-comments]');
    const commentsList = commentsContainer?.querySelector('[data-comments-list]');
    const commentsEmpty = commentsContainer?.querySelector('[data-comments-empty]');
    const commentsLoadMore = commentsContainer?.querySelector('[data-comments-load-more]');
    const commentForm = commentsContainer?.querySelector('[data-comment-form]');
    const commentInput = commentsContainer?.querySelector('[data-comment-input]');
    const commentFeedback = commentsContainer?.querySelector('[data-comment-feedback]');
    const commentTemplate = commentsContainer?.querySelector('[data-comment-template]');
    const commentQuotePreview = commentsContainer?.querySelector('[data-comment-quote-preview]');
    const commentQuotePreviewText = commentsContainer?.querySelector('[data-comment-quote-preview-text]');
    const commentQuotePreviewAuthor = commentsContainer?.querySelector('[data-comment-quote-author]');
    const commentQuoteClear = commentsContainer?.querySelector('[data-comment-quote-clear]');
    const rulesContent = root.querySelector('[data-rules-content]');
    const rulesToc = root.querySelector('[data-rules-toc]');
    const rulesPreview = root.querySelector('[data-rules-preview]');
    const rulesEditor = root.querySelector('[data-rules-editor]');
    const rulesEditButton = root.querySelector('[data-rules-edit]');
    const rulesActions = root.querySelector('[data-rules-actions]');
    const rulesInput = root.querySelector('[data-rules-input]');
    const rulesToolbar = root.querySelector('[data-rules-toolbar]');
    const rulesFeedback = root.querySelector('[data-rules-feedback]');
    let alertsContainer = root.querySelector('[data-game-alerts]');
    const rankingPanel = root.querySelector('[data-game-ranking]');
    const rankingList = rankingPanel?.querySelector('[data-ranking-entries]');
    const rankingListWrapper = rankingPanel?.querySelector('[data-ranking-list]');
    const rankingEmpty = rankingPanel?.querySelector('[data-ranking-empty]');
    const rankingLoading = rankingPanel?.querySelector('[data-ranking-loading]');
    const inviteModal = document.querySelector('[data-invite-modal]');
    const inviteOpeners = Array.from(root.querySelectorAll('[data-invite-open]'));
    const inviteCloser = inviteModal?.querySelector('[data-invite-close]');
    const inviteSearch = inviteModal?.querySelector('[data-invite-search]');
    const inviteList = inviteModal?.querySelector('[data-invite-list]');
    const inviteEmpty = inviteModal?.querySelector('[data-invite-empty]');
    const inviteStatus = inviteModal?.querySelector('[data-invite-status]');

    let currentTab = config.tab || 'overview';
    let currentSessionId = null;
    let currentToken = null;
    let currentPage = 1;
    let isLoadingComments = false;
    let commentReplyTarget = null;
    let userRating = Number(config.ratings?.user_rating ?? 0);
    let inviteConnection = null;
    let ratingFeedbackTimer = null;
    let inviteStatusTimer = null;
    let rankingLoaded = false;
    const commentReactions = new Map();
    const commentVotes = new Map();
    let rulesImageInput = null;
    let leaveRequestSent = false;

    initialize();

    function initialize() {
        ensureAlertsContainer();
        setupTabs();
        setupTabTargets();
        setupCopy();
        setupPlay();
        setupSessionCleanup();
        setupGameExitListener();
        setupRating();
        setupComments();
        setupRulesEditor();
        setupInvites();
        buildRulesToc();
        hydrateSessionFromUrl();
    }

    function setupTabs() {
        setActiveTab(currentTab, false);
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                setActiveTab(target, true);
            });
        });
    }

    function setupTabTargets() {
        tabTargets.forEach(target => {
            target.addEventListener('click', () => {
                const tab = target.dataset.tabTarget;
                if (tab) {
                    setActiveTab(tab, true);
                }
            });
        });
    }

    function setActiveTab(tab, pushState) {
        currentTab = tab || 'overview';
        tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === currentTab));
        panels.forEach(panel => {
            const isActive = panel.dataset.tabPanel === currentTab;
            panel.classList.toggle('is-active', isActive);
            panel.toggleAttribute('hidden', !isActive);
        });
        if (currentTab === 'ranking') {
            loadRanking();
        }
        if (pushState) {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', currentTab);
            window.history.replaceState({}, '', url.toString());
        }
    }

    function setupCopy() {
        const copiedText = config.text?.copied || '';
        copyButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const value = button.dataset.copyText || '';
                if (!value) return;
                try {
                    if (button.hasAttribute('data-copy-link') && navigator.share) {
                        await navigator.share({ url: value });
                    } else if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(value);
                    } else {
                        fallbackCopyText(value);
                    }
                } catch (err) {
                    console.error('Copy/share failed', err);
                } finally {
                    showCopyToast(button, copiedText);
                }
            });
       
        });
    }

    function fallbackCopyText(value) {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    function showCopyToast(button, text) {
        if (!text) return;
        const original = button.textContent;
        button.textContent = text;
        setTimeout(() => {
            button.textContent = original;
        }, 1200);
    }

    function selectedMode() {
        const checked = modeInputs.find(input => input.checked);
        return checked
            ? Number(checked.value)
            : (Number(config.play?.defaultMode) || 1);
    }

    function setupPlay() {
        playButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveTab('play', true);
                startSession(selectedMode());
            });
        });
        retryButton?.addEventListener('click', () => startSession(selectedMode()));

        theaterToggle?.addEventListener('click', () => {
            root.classList.toggle('is-theater');
            theaterToggle.textContent = root.classList.contains('is-theater')
                ? (config.text?.playExitTheater || '')
                : (config.text?.playTheater || '');
        });

    }

    function hydrateSessionFromUrl() {
        if (!config.play?.hasWeb || !config.play?.webUrl) return;
        ensurePlayerFrame();
        if (!playerFrame) return;
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('sessionId');
        const token = params.get('token');
        const mode = Number(params.get('mode'));

        if (!sessionId) return;

        currentSessionId = sessionId;
        currentToken = token;
        leaveRequestSent = false;

        const modeValue = Number.isFinite(mode) && mode > 0 ? mode : selectedMode();
        playerFrame.src = buildGameUrl(modeValue, sessionId, token);
        setPlayerStatus('ready', config.text?.playReady);
        setActiveTab('play', false);

        params.delete('token');
        params.delete('mode');
        const cleaned = params.toString();
        const newUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}`;
        window.history.replaceState({}, '', newUrl);
    }

    async function createSession(mode) {
        if (!config.play?.sessionUrl) {
            return false;
        }

        const res = await fetch(config.play.sessionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ mode })
        });
        if (!res.ok) {
            throw new Error('Failed to create session');
        }
        const data = await res.json();
        currentSessionId = data.session_id || data.sessionId;
        currentToken = data.token;
        leaveRequestSent = false;
        return true;
    }

    async function startSession(mode) {
        if (!config.play?.hasWeb || !config.play?.webUrl || !config.play?.sessionUrl) {
            setPlayerStatus('error', config.text?.playError);
            return false;
        }
        ensurePlayerFrame();
        if (!playerFrame) {
            setPlayerStatus('error', config.text?.playError);
            return false;
        }
        setPlayerStatus('loading', config.text?.playLoading);

        try {
            const created = await createSession(mode);
            if (!created) {
                throw new Error('Session not created');
            }
            const url = buildGameUrl(mode, currentSessionId, currentToken);
            playerFrame.src = url;
            setPlayerStatus('ready', config.text?.playReady);
            return true;
        } catch (err) {
            console.error(err);
            setPlayerStatus('error', config.text?.playError);
            return false;
        }
    }

    function buildGameUrl(mode, sessionId, token) {
        const url = new URL(config.play.webUrl, window.location.origin);
        url.searchParams.set('mode', mode);
        if (sessionId) url.searchParams.set('sessionId', sessionId);
        if (token) url.searchParams.set('token', token);
        const gameId = config.gameId || config.play?.gameId;
        if (gameId) url.searchParams.set('gameId', gameId);
        return url.pathname + url.search;
    }

    function ensurePlayerFrame() {
        if (playerFrame || !playerContainer) {
            return;
        }
        playerFrame = createPlayerFrame();
        playerContainer.appendChild(playerFrame);
    }

    function createPlayerFrame() {
        const frame = document.createElement('iframe');
        frame.src = 'about:blank';
        frame.title = playerFrameTitle || '';
        frame.loading = playerFrameLoading;
        if (playerFrameAllow) {
            frame.setAttribute('allow', playerFrameAllow);
        }
        if (playerFrameAllowFullscreen) {
            frame.setAttribute('allowfullscreen', '');
        }
        frame.dataset.gameFrame = '';
        return frame;
    }

    function setPlayerStatus(state, message) {
        if (playerContainer) {
            playerContainer.dataset.state = state;
        }
        if (playerStatus) {
            playerStatus.textContent = message || '';
        }
        if (retryButton) {
            retryButton.hidden = state !== 'error';
        }
    }

    function setupRating() {
        fetchRatings();
        starButtons.forEach(button => {
            button.addEventListener('click', () => {
                const value = Number(button.dataset.starValue);
                if (!value) return;
                submitRating(value);
            });
        });
    }

    async function fetchRatings() {
        if (!config.ratings?.fetchUrl) return;
        try {
            const res = await fetch(config.ratings.fetchUrl, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load ratings');
            const data = await res.json();
            const avg = Number(data.avg ?? data.Avg ?? 0);
            const count = Number(data.count ?? data.Count ?? 0);
            const user = Number(data.user_rating ?? data.userRating ?? data.UserStars ?? 0);
            const distribution = data.distribution || data.Distribution || {};
            updateRatingUI(avg, count, user, distribution);
        } catch (err) {
            console.error(err);
        }
    }

    function updateRatingUI(avg, count, user, distribution = {}) {
        userRating = Number.isFinite(user) ? user : 0;
        if (ratingAverage && Number.isFinite(avg)) {
            ratingAverage.textContent = avg.toFixed(1);
        }
        if (ratingCount) {
            ratingCount.textContent = count > 0
                ? formatTemplate(config.text?.ratingCount || '{0}', count)
                : (config.text?.noRating || '');
        }
        if (ratingBars.length) {
            ratingBars.forEach(bar => {
                const star = Number(bar.dataset.ratingBar);
                const total = Object.values(distribution).reduce((acc, val) => acc + Number(val || 0), 0) || count;
                const value = distribution?.[star] ?? 0;
                const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
                bar.style.width = `${pct}%`;
            });
        }
        if (ratingBarCounts.length) {
            ratingBarCounts.forEach(el => {
                const star = Number(el.dataset.ratingCountStar);
                el.textContent = distribution?.[star] ?? 0;
            });
        }
        starButtons.forEach(btn => {
            const value = Number(btn.dataset.starValue);
            const filled = value <= userRating;
            btn.classList.toggle('is-filled', filled);
            btn.setAttribute('aria-pressed', filled ? 'true' : 'false');
            const label = formatTemplate(config.text?.starLabel || '', value);
            btn.setAttribute('aria-label', label);
        });
    }

    async function submitRating(value) {
        if (!config.ratings?.submitUrl) return;
        setRatingFeedback('');
        starButtons.forEach(btn => btn.disabled = true);
        try {
            const res = await fetch(config.ratings.submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ value })
            });
            if (!res.ok) throw new Error('Rating failed');
            userRating = value;
            setRatingFeedback(config.text?.ratingSuccess || '', false);
            await fetchRatings();
            } catch (err) {
                console.error(err);
                setRatingFeedback(config.text?.ratingError || '', true);
            } finally {
                starButtons.forEach(btn => btn.disabled = false);
            }
    }

    function setRatingFeedback(message, isError) {
        if (!ratingFeedback) return;
        if (ratingFeedbackTimer) {
            clearTimeout(ratingFeedbackTimer);
            ratingFeedbackTimer = null;
        }
        ratingFeedback.textContent = message || '';
        ratingFeedback.hidden = !message;
        ratingFeedback.classList.toggle('is-error', !!isError);
        if (message) {
            showAlert(message, isError ? 'error' : 'success');
        }
        if (message) {
            ratingFeedbackTimer = setTimeout(() => {
                ratingFeedback.hidden = true;
                ratingFeedback.textContent = '';
                ratingFeedback.classList.remove('is-error');
                ratingFeedbackTimer = null;
            }, 3500);
        }
    }

    function setupRulesEditor() {
        if (!rulesEditor || !rulesEditButton || !rulesInput || !rulesActions || !rulesContent || !rulesToolbar) {
            return;
        }

        if (typeof document.execCommand === 'function') {
            document.execCommand('styleWithCSS', false, false);
        }

        let originalText = rulesInput.innerHTML || '';
        const draftKey = config.rules?.updateUrl ? `bgp.rulesDraft:${config.rules.updateUrl}` : null;
        const readDraft = () => {
            if (!draftKey || !window.sessionStorage) {
                return null;
            }
            return window.sessionStorage.getItem(draftKey);
        };
        const writeDraft = () => {
            if (!draftKey || !window.sessionStorage) {
                return;
            }
            window.sessionStorage.setItem(draftKey, rulesInput.innerHTML || '');
        };
        const clearDraft = () => {
            if (!draftKey || !window.sessionStorage) {
                return;
            }
            window.sessionStorage.removeItem(draftKey);
        };

        const initialDraft = readDraft();
        if (initialDraft) {
            rulesInput.innerHTML = initialDraft;
            updateRulesContent(initialDraft);
            originalText = initialDraft;
        }

        const enterEditMode = () => {
            rulesEditor.classList.add('is-editing');
            rulesInput.hidden = false;
            rulesInput.focus();
            rulesActions.hidden = false;
            rulesToolbar.hidden = false;
            rulesEditButton.hidden = true;
            rulesContent.hidden = true;
        };

        const exitEditMode = (restore) => {
            if (restore) {
                rulesInput.innerHTML = originalText;
            }
            rulesEditor.classList.remove('is-editing');
            rulesInput.hidden = true;
            rulesActions.hidden = true;
            rulesToolbar.hidden = true;
            rulesEditButton.hidden = false;
            rulesContent.hidden = false;
        };

        rulesEditButton.addEventListener('click', () => {
            const draft = readDraft();
            if (draft) {
                rulesInput.innerHTML = draft;
            }
            enterEditMode();
        });

        rulesActions.querySelector('[data-rules-cancel]')?.addEventListener('click', () => {
            setRulesFeedback('');
            clearDraft();
            exitEditMode(true);
        });

        rulesActions.querySelector('[data-rules-save]')?.addEventListener('click', async () => {
            if (!config.rules?.updateUrl) {
                setRulesFeedback(config.text?.rulesSaveError || '', true);
                return;
            }
            const content = sanitizeRulesHtml(rulesInput.innerHTML || '');
            const plainText = extractPlainText(content);
            if (!plainText) {
                setRulesFeedback(config.text?.rulesSaveError || '', true);
                return;
            }
            try {
                const res = await fetch(config.rules.updateUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        content,
                        locale: config.rules?.locale || config.locale || ''
                    })
                });
                if (!res.ok) {
                    throw new Error('Failed to save rules');
                }
                updateRulesContent(content);
                originalText = content;
                clearDraft();
                setRulesFeedback(config.text?.rulesSaved || '', false);
                showAlert(config.text?.rulesSaved || '', 'success');
                exitEditMode(false);
            } catch (err) {
                console.error(err);
                setRulesFeedback(config.text?.rulesSaveError || '', true);
                showAlert(config.text?.rulesSaveError || '', 'error');
            }
        });
        rulesInput.addEventListener('input', writeDraft);

        rulesToolbar.querySelectorAll('[data-rules-command]').forEach(button => {
            button.addEventListener('click', () => {
                const command = button.dataset.rulesCommand;
                if (!command) return;
                const value = button.dataset.rulesValue;
                rulesInput.focus();
                if (command === 'formatBlock') {
                    document.execCommand('formatBlock', false, value || 'p');
                    return;
                }
                document.execCommand(command, false, value || undefined);
            });
        });

        const sizeSelect = rulesToolbar.querySelector('[data-rules-size]');
        sizeSelect?.addEventListener('change', () => {
            if (!(sizeSelect instanceof HTMLSelectElement)) return;
            const className = sizeSelect.value;
            if (!className) return;
            rulesInput.focus();
            wrapSelectionWithSpan(className);
            sizeSelect.value = '';
        });

        const emojiSelect = rulesToolbar.querySelector('[data-rules-emoji]');
        emojiSelect?.addEventListener('change', () => {
            if (!(emojiSelect instanceof HTMLSelectElement)) return;
            const emoji = emojiSelect.value;
            if (!emoji) return;
            rulesInput.focus();
            document.execCommand('insertText', false, emoji);
            emojiSelect.value = '';
        });

        rulesToolbar.querySelector('[data-rules-image]')?.addEventListener('click', () => {
            if (!rulesImageInput) {
                rulesImageInput = document.createElement('input');
                rulesImageInput.type = 'file';
                rulesImageInput.accept = 'image/*';
                rulesImageInput.hidden = true;
                rulesImageInput.addEventListener('change', async () => {
                    const file = rulesImageInput.files && rulesImageInput.files[0];
                    if (!file) {
                        return;
                    }
                    try {
                        const dataUrl = await readFileAsDataUrl(file);
                        rulesInput.focus();
                        const safeAlt = file.name ? file.name.replace(/"/g, '') : '';
                        const imgHtml = `<img src="${dataUrl}" alt="${safeAlt}" />`;
                        document.execCommand('insertHTML', false, imgHtml);
                    } catch (err) {
                        console.error('Failed to load image.', err);
                    } finally {
                        rulesImageInput.value = '';
                    }
                });
                rulesToolbar.appendChild(rulesImageInput);
            }
            rulesImageInput.click();
        });
    }

    function updateRulesContent(text) {
        if (!rulesContent) {
            return;
        }

        rulesContent.innerHTML = '';
        const sanitized = sanitizeRulesHtml(text);
        if (rulesInput && !rulesEditor?.classList.contains('is-editing')) {
            rulesInput.innerHTML = sanitized;
        }
        if (!extractPlainText(sanitized)) {
            const emptyText = config.text?.rulesEmpty || '';
            if (emptyText) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = emptyText;
                rulesContent.appendChild(empty);
            }
            return;
        }

        rulesContent.innerHTML = sanitized;

        if (rulesPreview) {
            const summaryText = extractPlainText(sanitized);
            const summary = summaryText.length > 180 ? `${summaryText.slice(0, 180).trimEnd()}…` : summaryText;
            rulesPreview.textContent = summary || config.text?.rulesEmpty || '';
        }
        buildRulesToc();
    }

    function setRulesFeedback(message, isError) {
        if (!rulesFeedback) {
            return;
        }
        rulesFeedback.textContent = message || '';
        rulesFeedback.hidden = !message;
        rulesFeedback.classList.toggle('is-error', !!isError);
    }

    async function loadRanking() {
        if (rankingLoaded || !rankingPanel || !rankingList || !config.leaderboard?.fetchUrl) {
            return;
        }
        rankingLoaded = true;
        rankingLoading?.removeAttribute('hidden');
        try {
            const res = await fetch(`${config.leaderboard.fetchUrl}?top=10`, { credentials: 'include' });
            if (!res.ok) {
                throw new Error('Failed to load ranking');
            }
            const rows = await res.json();
            if (!Array.isArray(rows) || rows.length === 0) {
                rankingEmpty?.removeAttribute('hidden');
                return;
            }
            rankingList.innerHTML = '';
            rows.forEach((row, index) => {
                const name = row.userName || row.user_name || row.UserName || row.nick || row.Nick || '—';
                const score = Number(row.bestScore ?? row.best_score ?? row.BestScore ?? 0);
                const matches = Number(row.totalMatches
                    ?? row.total_matches
                    ?? row.TotalMatches
                    ?? row.games
                    ?? row.Games
                    ?? row.gamesPlayed
                    ?? row.GamesPlayed
                    ?? 0);
                const wins = Number(row.wins ?? row.Wins ?? 0);
                const losses = Number(row.losses ?? row.Losses ?? 0);
                const pd = Number(row.pointsDifference ?? row.points_difference ?? row.PointsDifference ?? score ?? 0);

                const item = document.createElement('li');
                if (index === 0) {
                    item.classList.add('is-top');
                }
                const position = document.createElement('span');
                position.className = 'leaderboard__position';
                position.textContent = `#${index + 1}`;

                const player = document.createElement('span');
                player.className = 'leaderboard__name';
                player.textContent = name;

                const playedLabel = config.text?.rankingPlayedLabel || 'Played';
                const winsLabel = config.text?.rankingWinsLabel || 'Wins';
                const lossesLabel = config.text?.rankingLossesLabel || 'Losses';
                const pdLabel = config.text?.rankingPdLabel || 'PD';

                const playedValue = document.createElement('span');
                playedValue.className = 'leaderboard__stat';
                playedValue.dataset.label = playedLabel;
                playedValue.textContent = `${Number.isFinite(matches) ? matches.toLocaleString() : '0'}`;

                const winsValue = document.createElement('span');
                winsValue.className = 'leaderboard__stat';
                winsValue.dataset.label = winsLabel;
                winsValue.textContent = `${Number.isFinite(wins) ? wins.toLocaleString() : '0'}`;

                const lossesValue = document.createElement('span');
                lossesValue.className = 'leaderboard__stat';
                lossesValue.dataset.label = lossesLabel;
                lossesValue.textContent = `${Number.isFinite(losses) ? losses.toLocaleString() : '0'}`;

                const pdValue = document.createElement('span');
                pdValue.className = 'leaderboard__stat';
                pdValue.dataset.label = pdLabel;
                pdValue.textContent = `${Number.isFinite(pd) ? pd.toLocaleString() : '0'}`;

                item.appendChild(position);
                item.appendChild(player);
                item.appendChild(playedValue);
                item.appendChild(winsValue);
                item.appendChild(lossesValue);
                item.appendChild(pdValue);
                rankingList.appendChild(item);
            });
            rankingListWrapper?.removeAttribute('hidden');
        } catch (err) {
            console.error(err);
            rankingEmpty?.removeAttribute('hidden');
        } finally {
            rankingLoading?.setAttribute('hidden', 'hidden');
        }
    }

    function setupComments() {
        if (!commentsContainer) return;
        loadComments();
        commentForm?.addEventListener('submit', e => {
            e.preventDefault();
            submitComment();
        });
        commentQuoteClear?.addEventListener('click', () => clearQuotePreview(true));
        commentsLoadMore?.addEventListener('click', () => loadComments(currentPage + 1));
    }

    function decodeHtml(value) {
        if (!value) {
            return '';
        }
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    }

    function setTextWithLineBreaks(element, value) {
        if (!element) {
            return;
        }
        const text = value ?? '';
        element.innerHTML = '';
        const lines = text.split(/\n/);
        lines.forEach((line, index) => {
            if (index > 0) {
                element.appendChild(document.createElement('br'));
            }
            element.appendChild(document.createTextNode(line));
        });
    }

    function renderQuotePreview(text, author) {
        if (!commentQuotePreview || !commentQuotePreviewText) {
            return;
        }
        const labelTemplate = config.text?.commentQuoteFrom || 'Quote from {0}';
        const authorLabel = author ? labelTemplate.replace('{0}', author) : labelTemplate.replace('{0}', '');
        if (commentQuotePreviewAuthor) {
            commentQuotePreviewAuthor.textContent = authorLabel;
        }
        setTextWithLineBreaks(commentQuotePreviewText, text);
        commentQuotePreview.hidden = false;
    }

    function clearQuotePreview(focusInput) {
        commentReplyTarget = null;
        if (commentInput) {
            commentInput.value = '';
        }
        if (commentQuotePreview) {
            commentQuotePreview.hidden = true;
        }
        if (focusInput && commentInput) {
            commentInput.focus();
        }
    }

    async function loadComments(page = 1) {
        if (!config.comments?.fetchUrl || isLoadingComments) return;
        isLoadingComments = true;
        try {
            const url = new URL(config.comments.fetchUrl, window.location.origin);
            url.searchParams.set('page', page);
            url.searchParams.set('pageSize', config.comments.pageSize || 20);
            const res = await fetch(url.toString(), { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load comments');
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            if (page === 1) {
                commentReactions.clear();
                commentVotes.clear();
            }
            mergeCommentReactions(items);
            if (page === 1) {
                commentsList.innerHTML = '';
            }
            renderComments(items, page > 1);
            currentPage = page;
            const total = Number(data.total ?? 0);
            const loaded = (page * (config.comments.pageSize || 20));
            if (loaded >= total || items.length === 0) {
                commentsLoadMore?.setAttribute('hidden', 'hidden');
            } else {
                commentsLoadMore?.removeAttribute('hidden');
            }
            if (items.length === 0 && page === 1) {
                commentsEmpty?.removeAttribute('hidden');
            } else {
                commentsEmpty?.setAttribute('hidden', 'hidden');
            }
        } catch (err) {
            
            console.error(err);
            
        } finally {

            isLoadingComments = false;
        }
    }

    function renderComments(items, append) {
        if (!commentsList) return;
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const node = buildCommentNode(item);
            if (node) {
                fragment.appendChild(node);
            }
        });

        if (!append) {
            commentsList.innerHTML = '';
        }
        commentsList.appendChild(fragment);
    }

    function buildCommentNode(item) {
        if (!commentTemplate) {
            const li = document.createElement('li');
            const meta = document.createElement('div');
            meta.className = 'meta';
            const author = document.createElement('span');
            const authorName = item.author || item.user_id || config.text?.anonymous || '';
            author.textContent = authorName;
            const ts = document.createElement('span');
            ts.textContent = formatDate(item.created_at || item.createdAt || item.createdAtUtc);
            meta.append(author, ts);
            const body = document.createElement('p');
            body.innerHTML = (item.text || '').replace(/\n/g, '<br />');
            li.append(meta, body);
            return li;
        }

        const clone = commentTemplate.content.cloneNode(true);
        const rootEl = clone.querySelector('[data-comment]');
        if (!rootEl) return null;
        const id = item.id || item.Id;
        rootEl.dataset.commentId = id;
        const author = clone.querySelector('[data-comment-author]');
        const created = clone.querySelector('[data-comment-created]');
        const body = clone.querySelector('[data-comment-body]');
        const likeBtn = clone.querySelector('[data-comment-like]');
        const dislikeBtn = clone.querySelector('[data-comment-dislike]');
        const likeCount = clone.querySelector('[data-comment-like-count]');
        const dislikeCount = clone.querySelector('[data-comment-dislike-count]');
        const deleteBtn = clone.querySelector('[data-comment-delete]');
        const editBtn = clone.querySelector('[data-comment-edit]');
        const quoteBtn = clone.querySelector('[data-comment-quote]');
        const quoteBlock = clone.querySelector('[data-comment-quote-block]');
        const quoteText = clone.querySelector('[data-comment-quote-text]');
        const quoteAuthor = clone.querySelector('[data-comment-quote-author]');

        if (author) {
            author.textContent = item.author || item.user_id || config.text?.anonymous || '';
        }
        if (created) {
            created.textContent = formatDate(item.created_at || item.createdAt || item.createdAtUtc);
        }
        const decodedBody = decodeHtml(item.text || '');
        if (body) {
            setTextWithLineBreaks(body, decodedBody);
        }

        if (quoteBlock) {
            if (item.reply_preview) {
                const decodedReply = decodeHtml(item.reply_preview);
                setTextWithLineBreaks(quoteText, decodedReply);
                if (quoteAuthor) {
                    const labelTemplate = config.text?.commentQuoteFrom || 'Quote from {0}';
                    const replyAuthor = item.reply_author || '';
                    quoteAuthor.textContent = replyAuthor ? labelTemplate.replace('{0}', replyAuthor) : labelTemplate.replace('{0}', '');
                }
                quoteBlock.hidden = false;
            } else {
                quoteBlock.hidden = true;
            }
        }

        const reactions = commentReactions.get(id) || { likes: 0, dislikes: 0 };
        const vote = commentVotes.get(id) || null;
        if (likeCount) likeCount.textContent = reactions.likes;
        if (dislikeCount) dislikeCount.textContent = reactions.dislikes;
        likeBtn?.classList.toggle('is-active', vote === 'like');
        dislikeBtn?.classList.toggle('is-active', vote === 'dislike');

        likeBtn?.addEventListener('click', () => submitReaction(id, 'like'));
        dislikeBtn?.addEventListener('click', () => submitReaction(id, 'dislike'));
        deleteBtn?.addEventListener('click', () => deleteComment(id));
        editBtn?.addEventListener('click', () => editComment(id, decodedBody));
        quoteBtn?.addEventListener('click', () => startQuote(id, decodedBody, item.author));

        return clone;
    }

    function mergeCommentReactions(items) {
        items.forEach(item => {
            const id = item.id || item.Id;
            if (!id) return;
            commentReactions.set(id, {
                likes: Number(item.likes ?? item.Likes ?? 0),
                dislikes: Number(item.dislikes ?? item.Dislikes ?? 0)
            });
            if (item.user_vote || item.userVote) {
                commentVotes.set(id, item.user_vote || item.userVote);
            }
        });
    }

    async function submitReaction(commentId, value) {
        if (!config.comments?.reactionUrlTemplate) return;
        const url = config.comments.reactionUrlTemplate.replace('{commentId}', commentId);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ value })
            });
            if (!res.ok) throw new Error('Reaction failed');
            const data = await res.json();
            commentReactions.set(commentId, {
                likes: Number(data.likes ?? 0),
                dislikes: Number(data.dislikes ?? 0)
            });
            commentVotes.set(commentId, data.userVote || value);
            refreshCommentUi(commentId);
        } catch (err) {
            console.error(err);
        }
    }

    function refreshCommentUi(commentId) {
        if (!commentsList) return;
        const node = commentsList.querySelector(`[data-comment][data-comment-id="${commentId}"]`);
        if (!node) return;
        const likes = commentReactions.get(commentId) || { likes: 0, dislikes: 0 };
        const vote = commentVotes.get(commentId) || null;
        const likeBtn = node.querySelector('[data-comment-like]');
        const dislikeBtn = node.querySelector('[data-comment-dislike]');
        const likeCount = node.querySelector('[data-comment-like-count]');
        const dislikeCount = node.querySelector('[data-comment-dislike-count]');
        if (likeCount) likeCount.textContent = likes.likes;
        if (dislikeCount) dislikeCount.textContent = likes.dislikes;
        likeBtn?.classList.toggle('is-active', vote === 'like');
        dislikeBtn?.classList.toggle('is-active', vote === 'dislike');
    }

    async function deleteComment(commentId) {
        if (!config.comments?.deleteTemplate) return;
        const confirmMessage = config.text?.commentDeleteConfirm || 'Are you sure you want to delete this comment?';
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            const res = await fetch(config.comments.deleteTemplate.replace('{commentId}', commentId), {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok && res.status !== 404) throw new Error('Delete failed');
            commentReactions.delete(commentId);
            commentVotes.delete(commentId);
            const node = commentsList?.querySelector(`[data-comment][data-comment-id="${commentId}"]`);
            node?.remove();
            if (!commentsList?.children.length) {
                commentsEmpty?.removeAttribute('hidden');
            }
        } catch (err) {
            console.error(err);
        }

    }

    function startQuote(commentId, text, author) {
        if (!commentInput) return;
        commentReplyTarget = commentId;
        const clean = (text || '').trim();
        if (clean) {
            renderQuotePreview(clean, author);
        }
        commentInput.focus();
    }

    async function editComment(commentId, text) {
        if (!config.comments?.updateTemplate) return;
        const promptLabel = config.text?.commentEditConfirm || 'Edit comment';
        const updated = window.prompt(promptLabel, text || '');
        if (updated === null) return;
        const trimmed = updated.trim();
        if (!trimmed) {
            setCommentFeedback(config.text?.commentError || '', true);
            return;
        }
        try {
            const res = await fetch(config.comments.updateTemplate.replace('{commentId}', commentId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: trimmed })
            });
            if (!res.ok) throw new Error('Edit failed');
            const data = await res.json();
            await loadComments(1);
            setCommentFeedback(config.text?.commentSuccess || '', false);
        } catch (err) {
            console.error(err);
            setCommentFeedback(config.text?.commentError || '', true);
        }
    }

    async function submitComment() {
        if (!config.comments?.submitUrl || !commentInput) return;
        const text = (commentInput.value || '').trim();
        if (!text) {
            setCommentFeedback(config.text?.commentError || '', true);
            return;
        }
        setCommentFeedback('');
        commentInput.disabled = true;
        commentsLoadMore?.setAttribute('hidden', 'hidden');
        try {
            const res = await fetch(config.comments.submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text, replyTo: commentReplyTarget })
            });

            if (!res.ok) throw new Error('Comment failed');
            commentInput.value = '';
            clearQuotePreview(false);
            setCommentFeedback(config.text?.commentSuccess || '', false);
            showAlert(config.text?.commentSuccess || '', 'success');
            await loadComments(1);
            await fetchRatings();
        } catch (err) {
            console.error(err);
            setCommentFeedback(config.text?.commentError || '', true);
            showAlert(config.text?.commentError || '', 'error');
        } finally {
            commentInput.disabled = false;
        }
    }

    function setCommentFeedback(message, isError) {
        if (!commentFeedback) return;
        commentFeedback.textContent = message || '';
        commentFeedback.hidden = !message;
        commentFeedback.classList.toggle('is-error', !!isError);
    }

    function setupInvites() {
        if (!inviteModal) return;
        inviteOpeners.forEach(btn => btn.addEventListener('click', openInviteModal));
        inviteCloser?.addEventListener('click', closeInviteModal);
        inviteModal.addEventListener('click', e => {
            if (e.target === inviteModal) closeInviteModal();
        });
        inviteSearch?.addEventListener('input', () => renderInviteList());
        inviteSearch?.addEventListener('search', () => renderInviteList());
        document.addEventListener('bgp:chat:invite', (event) => {
            if (!(event instanceof CustomEvent)) {
                return;
            }
            const detail = event.detail || {};
            const displayName = detail.displayName || '';
            if (inviteSearch) {
                inviteSearch.value = displayName;
            }
            openInviteModal();
        });
        connectInviteHub();
    }

    function buildRulesToc() {
        if (!rulesContent || !rulesToc) return;
        const headings = Array.from(rulesContent.querySelectorAll('h1, h2, h3'));
        const frag = document.createDocumentFragment();

        if (!headings.length) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = config.text?.rulesHeading || config.text?.rulesEmpty || '';
            btn.addEventListener('click', () => {
                rulesContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            li.appendChild(btn);
            frag.appendChild(li);

        } else {
            headings.forEach((heading, idx) => {
                const text = heading.textContent?.trim() || config.text?.rulesEmpty || '';
                const id = heading.id || `rule-section-${idx}`;
                heading.id = id;
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = text;
                btn.addEventListener('click', () => {
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                li.appendChild(btn);
                frag.appendChild(li);
            });
        }

        if (!frag.childNodes.length) {
            return;
        }

        rulesToc.innerHTML = '';
        rulesToc.appendChild(frag);
    }

    function openInviteModal() {
        inviteModal.hidden = false;
        inviteModal.setAttribute('aria-hidden', 'false');
        setInviteStatus('');
        loadFriends();
    }

    function closeInviteModal() {
        inviteModal.hidden = true;
        inviteModal.setAttribute('aria-hidden', 'true');
    }

    async function loadFriends() {
        if (!inviteList) return;
        try {
            const res = await fetch('/api/friends', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load friends');
            const data = await res.json();
            const accepted = Array.isArray(data)
                ? data.filter(f => (Number(f.status) === 1 || f.status === 'Accepted'))
                : [];
            inviteList.dataset.friends = JSON.stringify(accepted);
            renderInviteList();
        } catch (err) {
            console.error(err);
        }
        
    }

    function renderInviteList() {
        if (!inviteList) return;
        const friends = JSON.parse(inviteList.dataset.friends || '[]');
        const term = (inviteSearch?.value || '').toLowerCase();
        inviteList.innerHTML = '';
        const filtered = friends.filter(f => {
            const name = (f.displayName || f.userName || f.userId || '').toLowerCase();
            return !term || name.includes(term);
        });
        if (!filtered.length) {
            inviteEmpty?.removeAttribute('hidden');
            return;
        }
        inviteEmpty?.setAttribute('hidden', 'hidden');
        const frag = document.createDocumentFragment();
        filtered.forEach(friend => {
            const row = document.createElement('div');
            row.className = 'invite-list__item';
            const meta = document.createElement('div');


            meta.className = 'invite-list__meta';
            const name = document.createElement('div');
            name.textContent = friend.displayName || friend.userName || friend.userId;
            meta.appendChild(name);
            const btn = document.createElement('button');
            btn.className = 'btn-primary btn-compact';
            btn.textContent = config.text?.inviteSend || '';
            btn.addEventListener('click', () => sendInvite(friend.userId));
            row.append(meta, btn);
            frag.appendChild(row);
        });


        inviteList.appendChild(frag);
    }

    async function sendInvite(friendId) {
        if (!config.invites?.createTemplate) {
            setPlayerStatus('error', config.text?.inviteError);
            setInviteStatus(config.text?.inviteError || '', true);
            return;
        }
        
        try {
            let retried = false;

            const ensureSession = async () => {
                if (currentSessionId) {
                    return true;
                }
                try {
                    const started = await createSession(selectedMode());
                    return started && !!currentSessionId;
                } catch (err) {
                    console.error(err);
                    return false;
                }
            };

            const sendRequest = async () => {
                if (!await ensureSession() || !currentSessionId) {
                    return null;
                }
                const url = config.invites.createTemplate.replace('{sessionId}', currentSessionId);
                return fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ friendId, FriendId: friendId })
                });
            };

            let res = await sendRequest();
            if (!res || (!res.ok && (res.status === 403 || res.status === 404) && !retried)) {
                retried = true;
                currentSessionId = null;
                res = await sendRequest();
            }

            if (!res || !res.ok) throw new Error('Invite failed');
            setPlayerStatus('ready', config.text?.inviteSuccess);
            setInviteStatus(config.text?.inviteSuccess || '', false);
            showAlert(config.text?.inviteSuccess || '', 'success');
        } catch (err) {
            console.error(err);
            setPlayerStatus('error', config.text?.inviteError);
            setInviteStatus(config.text?.inviteError || '', true);
            showAlert(config.text?.inviteError || '', 'error');
        }

    }

    function setInviteStatus(message, isError) {
        if (!inviteStatus) return;
        if (inviteStatusTimer) {
            clearTimeout(inviteStatusTimer);
            inviteStatusTimer = null;
        }
        inviteStatus.textContent = message || '';
        inviteStatus.hidden = !message;
        inviteStatus.classList.toggle('is-error', !!isError);
        if (message) {
            inviteStatusTimer = setTimeout(() => {
                inviteStatus.hidden = true;
                inviteStatus.textContent = '';
                inviteStatus.classList.remove('is-error');
                inviteStatusTimer = null;
            }, 3500);
        }
    }

    function ensureAlertsContainer() {
        if (alertsContainer) {
            return;
        }
        alertsContainer = document.createElement('div');
        alertsContainer.className = 'game-alerts';
        alertsContainer.dataset.gameAlerts = '';
        alertsContainer.setAttribute('aria-live', 'polite');
        root.prepend(alertsContainer);
    }

    function showAlert(message, tone = 'info') {
        if (!message || !alertsContainer) {
            return;
        }
        const alert = document.createElement('div');
        alert.className = `game-alert is-${tone}`;
        alert.textContent = message;
        alertsContainer.appendChild(alert);
        window.setTimeout(() => {
            alert.classList.add('is-hidden');
            window.setTimeout(() => alert.remove(), 400);
        }, 7000);
    }

    function setupSessionCleanup() {
        if (!config.play?.leaveTemplate) {
            return;
        }
        window.addEventListener('pagehide', sendLeaveSignal);
        window.addEventListener('beforeunload', sendLeaveSignal);
    }

    function setupGameExitListener() {
        window.addEventListener('message', event => {
            if (!event?.data) {
                return;
            }
            if (event.data.type === 'GAME_EXIT') {
                closeGamePlayer();
            }
        });
    }

    function closeGamePlayer() {
        if (!playerContainer) {
            return;
        }
        sendLeaveSignal();
        playerContainer.innerHTML = '';
        currentSessionId = null;
        currentToken = null;
        leaveRequestSent = false;
        playerFrame = null;
        setPlayerStatus('idle', '');
    }

    function sendLeaveSignal() {
        if (leaveRequestSent || !currentSessionId) {
            return;
        }
        leaveRequestSent = true;
        const url = config.play.leaveTemplate.replace('{sessionId}', currentSessionId);
        const body = JSON.stringify({ sessionId: currentSessionId });
        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
            return;
        }
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body,
            keepalive: true
        }).catch(() => { /* ignored */ });
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function wrapSelectionWithSpan(className) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (range.collapsed) return;
        const span = document.createElement('span');
        span.className = className;
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        newRange.collapse(false);
        selection.addRange(newRange);
    }

    function applyInlineRulesFormatting(wrapper, doc) {
        if (!wrapper) {
            return;
        }
        const styledNodes = wrapper.querySelectorAll('[style]');
        styledNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }
            const rawStyle = node.getAttribute('style') || '';
            if (!rawStyle) {
                return;
            }
            const normalized = rawStyle.toLowerCase();
            const wrappers = [];
            const weightMatch = normalized.match(/font-weight\s*:\s*([^;]+)/);
            if (weightMatch) {
                const weightValue = weightMatch[1].trim();
                const numericWeight = parseInt(weightValue, 10);
                if (weightValue.includes('bold') || (!Number.isNaN(numericWeight) && numericWeight >= 600)) {
                    wrappers.push('strong');
                }
            }
            if (normalized.includes('font-style') && normalized.includes('italic')) {
                wrappers.push('em');
            }
            const decorationMatch = normalized.match(/text-decoration\s*:\s*([^;]+)/);
            if (decorationMatch) {
                const value = decorationMatch[1];
                if (value.includes('underline')) {
                    wrappers.push('u');
                }
                if (value.includes('line-through')) {
                    wrappers.push('s');
                }
            }

            if (wrappers.length) {
                let current = node;
                wrappers.forEach((tag) => {
                    const wrapperEl = doc.createElement(tag);
                    while (current.firstChild) {
                        wrapperEl.appendChild(current.firstChild);
                    }
                    current.appendChild(wrapperEl);
                    current = wrapperEl;
                });
            }
            node.removeAttribute('style');
        });
    }

    function sanitizeRulesHtml(html) {
        if (!html) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const wrapper = doc.body.firstElementChild;
        if (!wrapper) return '';
        applyInlineRulesFormatting(wrapper, doc);
        const allowedTags = new Set(['P', 'BR', 'DIV', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN', 'IMG', 'A']);
        const allowedSpanClasses = new Set(['rules-size-sm', 'rules-size-md', 'rules-size-lg']);

        const walk = doc.createTreeWalker(wrapper, NodeFilter.SHOW_ELEMENT, null);
        const toRemove = [];
        while (walk.nextNode()) {
            const node = walk.currentNode;
            if (!(node instanceof HTMLElement)) continue;
            const tag = node.tagName.toUpperCase();
            if (!allowedTags.has(tag)) {
                toRemove.push(node);
                continue;
            }

            Array.from(node.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
                    node.removeAttribute(attr.name);
                }
            });

            if (tag === 'SPAN') {
                const className = node.getAttribute('class') || '';
                const kept = className
                    .split(' ')
                    .map(val => val.trim())
                    .filter(val => allowedSpanClasses.has(val));
                if (kept.length) {
                    node.setAttribute('class', kept.join(' '));
                } else {
                    node.removeAttribute('class');
                }
            } else if (tag === 'IMG') {
                const src = node.getAttribute('src') || '';
                if (!isSafeUrl(src)) {
                    node.removeAttribute('src');
                }
                const allowed = new Set(['src', 'alt', 'title']);
                Array.from(node.attributes).forEach(attr => {
                    if (!allowed.has(attr.name.toLowerCase())) {
                        node.removeAttribute(attr.name);
                    }
                });
            } else if (tag === 'A') {
                const href = node.getAttribute('href') || '';
                if (!isSafeUrl(href)) {
                    node.removeAttribute('href');
                }
                const allowed = new Set(['href', 'target', 'rel']);
                Array.from(node.attributes).forEach(attr => {
                    if (!allowed.has(attr.name.toLowerCase())) {
                        node.removeAttribute(attr.name);
                    }
                });
            } else {
                Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
            }
        }

        toRemove.forEach(node => {
            const parent = node.parentNode;
            if (!parent) return;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
        });

        return wrapper.innerHTML;
    }

    function extractPlainText(html) {
        if (!html) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        return (doc.body.textContent || '').trim();
    }

    function isSafeUrl(value) {
        if (!value) return false;
        if (value.startsWith('data:image', 0)) return true;
        if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
        try {
            const url = new URL(value, window.location.origin);
            return ['http:', 'https:', 'mailto:'].includes(url.protocol);
        } catch {
            return false;
        }

    }

    function connectInviteHub() {
        if (typeof signalR === 'undefined' || !config.invites?.hubUrl) return;
        inviteConnection = new signalR.HubConnectionBuilder()
            .withUrl(config.invites.hubUrl)
            .withAutomaticReconnect()
            .build();

        inviteConnection.on('InviteReceived', payload => {
            if (payload && payload.invite_id) {
                const message = config.text?.inviteTitle || '';
                setPlayerStatus('ready', message);
            }

        });


        inviteConnection.on('InviteAccepted', payload => {
            if (payload && payload.session_id === currentSessionId) {
                setPlayerStatus('ready', config.text?.inviteSuccess);
            }

        });
        inviteConnection.start().catch(err => console.error(err));
    }
    function formatTemplate(template, value) {
        if (typeof template !== 'string') return '';
        return template.replace('{0}', value);
    }

    function formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }

})();