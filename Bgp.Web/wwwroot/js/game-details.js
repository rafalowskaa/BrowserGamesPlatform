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
    const playerFrame = root.querySelector('[data-game-frame]');
    const playerContainer = root.querySelector('[data-player-frame]');
    const playerStatus = root.querySelector('[data-player-status-text]');
    const retryButton = root.querySelector('[data-retry]');
    const theaterToggle = root.querySelector('[data-theater-toggle]');
    const fullscreenButton = root.querySelector('[data-fullscreen]');
    const modeInputs = Array.from(root.querySelectorAll('input[name="game-mode"]'));
    const ratingPanel = root.querySelector('[data-rating-summary]');
    const starButtons = ratingPanel ? Array.from(ratingPanel.querySelectorAll('[data-star-value]')) : [];
    const ratingAverage = ratingPanel?.querySelector('[data-rating-average]');
    const ratingCount = ratingPanel?.querySelector('[data-rating-count]');
    const ratingFeedback = ratingPanel?.querySelector('[data-rating-feedback]');
    const commentsContainer = root.querySelector('[data-comments]');
    const commentsList = commentsContainer?.querySelector('[data-comments-list]');
    const commentsEmpty = commentsContainer?.querySelector('[data-comments-empty]');
    const commentsLoadMore = commentsContainer?.querySelector('[data-comments-load-more]');
    const commentForm = commentsContainer?.querySelector('[data-comment-form]');
    const commentInput = commentsContainer?.querySelector('[data-comment-input]');
    const commentFeedback = commentsContainer?.querySelector('[data-comment-feedback]');
    const rulesContent = root.querySelector('[data-rules-content]');
    const rulesToc = root.querySelector('[data-rules-toc]');
    const inviteModal = document.querySelector('[data-invite-modal]');
    const inviteOpeners = Array.from(root.querySelectorAll('[data-invite-open]'));
    const inviteCloser = inviteModal?.querySelector('[data-invite-close]');
    const inviteSearch = inviteModal?.querySelector('[data-invite-search]');
    const inviteList = inviteModal?.querySelector('[data-invite-list]');
    const inviteEmpty = inviteModal?.querySelector('[data-invite-empty]');

    let currentTab = config.tab || 'overview';
    let currentSessionId = null;
    let currentToken = null;
    let currentPage = 1;
    let isLoadingComments = false;
    let userRating = Number(config.ratings?.user_rating ?? 0);
    let inviteConnection = null;

    initialize();

    function initialize() {
        setupTabs();
        setupTabTargets();
        setupCopy();
        setupPlay();
        setupRating();
        setupComments();
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
        return checked ? Number(checked.value) : (config.play?.modes?.[0]?.value ?? 1);
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

        fullscreenButton?.addEventListener('click', () => toggleFullscreen());
    }

    function hydrateSessionFromUrl() {
        if (!config.play?.hasWeb || !config.play?.webUrl || !playerFrame) return;
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('sessionId');
        const token = params.get('token');
        const mode = Number(params.get('mode'));

        if (!sessionId) return;

        currentSessionId = sessionId;
        currentToken = token;

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


    async function startSession(mode) {
        if (!config.play?.hasWeb || !config.play?.webUrl || !config.play?.sessionUrl) {
            setPlayerStatus('error', config.text?.playError);
            return;
        }
        setPlayerStatus('loading', config.text?.playLoading);

        try {
            const res = await fetch(config.play.sessionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ mode })
            });
            if (!res.ok) throw new Error('Failed to create session');
            const data = await res.json();
            currentSessionId = data.session_id || data.sessionId;
            currentToken = data.token;
            const url = buildGameUrl(mode, currentSessionId, currentToken);
            playerFrame.src = url;
            setPlayerStatus('ready', config.text?.playReady);
        } catch (err) {
            console.error(err);
            setPlayerStatus('error', config.text?.playError);
        }
    }

    function buildGameUrl(mode, sessionId, token) {
        const url = new URL(config.play.webUrl, window.location.origin);
        url.searchParams.set('mode', mode);
        if (sessionId) url.searchParams.set('sessionId', sessionId);
        if (token) url.searchParams.set('token', token);
        return url.pathname + url.search;
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


    function toggleFullscreen() {
        if (!playerContainer) return;
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
        } else {
            playerContainer.requestFullscreen?.();
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
            updateRatingUI(avg, count, user);
        } catch (err) {
            console.error(err);
        }
    }

    function updateRatingUI(avg, count, user) {
        userRating = Number.isFinite(user) ? user : 0;
        if (ratingAverage && Number.isFinite(avg)) {
            ratingAverage.textContent = avg.toFixed(1);
        }
        if (ratingCount) {
            ratingCount.textContent = count > 0
                ? formatTemplate(config.text?.ratingCount || '{0}', count)
                : (config.text?.noRating || '');
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
        ratingFeedback.textContent = message || '';
        ratingFeedback.hidden = !message;
        ratingFeedback.classList.toggle('is-error', !!isError);
    }

    function setupComments() {
        if (!commentsContainer) return;
        loadComments();
        commentForm?.addEventListener('submit', e => {
            e.preventDefault();
            submitComment();
        });
        commentsLoadMore?.addEventListener('click', () => loadComments(currentPage + 1));
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
            fragment.appendChild(li);
        });

        if (!append) {
            commentsList.innerHTML = '';
        }
        commentsList.appendChild(fragment);
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
                body: JSON.stringify({ text })
            });

            if (!res.ok) throw new Error('Comment failed');
            commentInput.value = '';
            setCommentFeedback(config.text?.commentSuccess || '', false);
            await loadComments(1);
            await fetchRatings();
        } catch (err) {
            console.error(err);
            setCommentFeedback(config.text?.commentError || '', true);
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
        connectInviteHub();
    }

    function buildRulesToc() {
        if (!rulesContent || !rulesToc) return;
        const headings = Array.from(rulesContent.querySelectorAll('h1, h2, h3'));
        const items = headings.length ? headings : [rulesContent];
        const frag = document.createDocumentFragment();
        items.forEach((heading, idx) => {
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
        rulesToc.innerHTML = '';
        rulesToc.appendChild(frag);
    }

    function openInviteModal() {
        inviteModal.hidden = false;
        inviteModal.setAttribute('aria-hidden', 'false');
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
            const accepted = Array.isArray(data) ? data.filter(f => Number(f.status) === 1 && !f.outgoingRequest) : [];
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
        if (!currentSessionId || !config.invites?.createTemplate) {
            setPlayerStatus('error', config.text?.inviteError);
            return;
        }
        const url = config.invites.createTemplate.replace('{sessionId}', currentSessionId);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friendId })
            });


            if (!res.ok) throw new Error('Invite failed');
            setPlayerStatus('ready', config.text?.inviteSuccess);
            closeInviteModal();
        } catch (err) {
            console.error(err);
            setPlayerStatus('error', config.text?.inviteError);
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