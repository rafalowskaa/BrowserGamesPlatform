(function () {
    const configScript = document.getElementById('gameDetailsConfig');
    if (!configScript) {
        return;
    }

    let config;
    try {
        config = JSON.parse(configScript.textContent || '{}');
    } catch (err) {
        console.error('Failed to parse game details config', err);
        return;
    }

    const container = configScript.closest('[data-game-config]');
    if (!container) {
        return;
    }

    const startButton = container.querySelector('[data-game-start]');
    const startHint = container.querySelector('[data-game-start-hint]');
    const cancelButton = container.querySelector('[data-game-cancel]');
    const playerContainer = container.querySelector('[data-game-player]');
    const frame = container.querySelector('[data-game-frame]');
    const modeInputs = container.querySelectorAll('input[name="game-mode"]');

    const startHintDefault = startHint ? (startHint.textContent || '') : '';
    let selectedModeValue = modeInputs.length > 0 ? modeInputs[0].value : '0';
    let activeTicketId = null;
    let matchmakingAbort = null;
    let matchmakingMode = null;

    function resolveModeLabel(value) {
        if (!Array.isArray(config.modes)) {
            return value;
        }
        const numeric = Number(value);
        const match = config.modes.find(m => Number(m.value) === numeric);
        return match ? match.label : value;
    }

    const matchMessages = {
        searching: config.matchSearching || '',
        found: config.matchFound || '',
        starting: config.matchStarting || '',
        error: config.matchError || '',
        cancelled: config.matchCancelled || '',
        cancelLabel: config.matchCancel || ''
    };

    if (cancelButton && matchMessages.cancelLabel) {
        cancelButton.textContent = matchMessages.cancelLabel;
    }

    const stage = playerContainer ? playerContainer.querySelector('[data-game-stage]') : null;
    const viewer = playerContainer ? playerContainer.querySelector('[data-game-viewer]') : null;
    const fullscreenButton = playerContainer ? playerContainer.querySelector('[data-game-fullscreen]') : null;
    const fullscreenEnterLabelDefault = fullscreenButton
        ? (fullscreenButton.querySelector('[data-game-fullscreen-enter]')?.textContent || fullscreenButton.textContent || '')
        : '';
    const fullscreenExitLabelDefault = fullscreenButton
        ? (fullscreenButton.querySelector('[data-game-fullscreen-exit]')?.textContent || '')
        : '';
    const fullscreenLabels = {
        enter: config.fullScreenLabel || fullscreenEnterLabelDefault || 'Full screen',
        exit: config.fullScreenExitLabel || fullscreenExitLabelDefault || config.fullScreenLabel || 'Exit full screen'
    };
    const fullscreenUnavailableMessage = config.fullScreenUnavailable || '';
    let resizeFrame = null;
    let fullscreenMessageTimeout = null;
    let currentAspect = { width: 16, height: 9, ratio: 16 / 9 };

    initializeViewer();

    function canLaunchWebGame() {
        return Boolean(config.hasWeb && config.webUrl && frame && playerContainer && viewer);
    }

    function needsMatchmaking(modeNumber) {
        return (modeNumber & 2) === 2 || (modeNumber & 4) === 4;
    }

    function setStartHint(message) {
        if (!startHint) {
            return;
        }
        const text = message && message.trim().length > 0 ? message : startHintDefault;
        startHint.textContent = text;
        startHint.hidden = !text;
    }

    function updateStartButtonLabel() {
        if (!startButton) {
            return;
        }
        const modeNumber = Number(selectedModeValue);
        let label = config.startGeneric || startButton.textContent || 'Start';
        if (modeNumber === 1 && config.startSingle) {
            label = config.startSingle;
        }
        else if (needsMatchmaking(modeNumber)) {
            if (config.startMulti) {
                label = config.startMulti;
            }
        }
        startButton.textContent = label;
    }

    function setMatchmakingUi(active, hintMessage) {
        if (startButton) {
            startButton.disabled = active || !canLaunchWebGame();
        }
        if (cancelButton) {
            cancelButton.hidden = !active;
            cancelButton.disabled = false;
        }
        if (typeof hintMessage !== 'undefined') {
            setStartHint(hintMessage);
        } else if (!active) {
            setStartHint('');
        }
        if (!active) {
            updateStartButtonLabel();
        }
    }

    function initializeViewer() {
        if (!playerContainer || !viewer) {
            return;
        }

        applyAspectFromMetadata();
        syncHeaderHeight();
        updateFullscreenButton(isFullscreenActive());
        updateViewerConstraints();

        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', function (event) {
                event.preventDefault();
                toggleFullscreen();
            });
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('keydown', handleKeydown);

        window.addEventListener('resize', scheduleResizeUpdate);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleResizeUpdate);
            window.visualViewport.addEventListener('scroll', scheduleResizeUpdate);
        }
    }

    function syncHeaderHeight() {
        const header = document.querySelector('header');
        if (!header) {
            document.documentElement.style.setProperty('--player-header-height', '0px');
            return 0;
        }

        const rect = header.getBoundingClientRect();
        const height = Math.max(0, Math.round(rect.height));
        document.documentElement.style.setProperty('--player-header-height', `${height}px`);
        return height;
    }

    function scheduleResizeUpdate() {
        if (typeof window.requestAnimationFrame !== 'function') {
            syncHeaderHeight();
            updateViewerConstraints();
            return;
        }

        if (resizeFrame) {
            if (typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(resizeFrame);
            }
        }

        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            syncHeaderHeight();
            updateViewerConstraints();
        });
    }

    function updateViewerConstraints() {
        if (!playerContainer || !viewer) {
            return;
        }

        if (isFullscreenActive()) {
            return;
        }

        const maxHeight = computeMaxHeightValue();
        if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
            playerContainer.style.removeProperty('--player-viewport-max-height');
            return;
        }

        playerContainer.style.setProperty('--player-viewport-max-height', `${maxHeight}px`);
    }

    function computeMaxHeightValue() {
        const viewport = window.visualViewport;
        const viewportHeight = viewport ? viewport.height : window.innerHeight;
        if (!viewportHeight) {
            return 0;
        }

        const headerHeight = syncHeaderHeight();
        const safeTop = getCssNumber('--safe-area-top');
        const safeBottom = getCssNumber('--safe-area-bottom');
        const safeArea = safeTop + safeBottom;
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const gap = isMobile ? getCssNumber('--player-mobile-gap') : getCssNumber('--player-desktop-gap');

        const available = viewportHeight - headerHeight - safeArea - gap;
        if (available <= 0) {
            return Math.max(viewportHeight * 0.6, 0);
        }

        if (isMobile) {
            return available;
        }

        const eightyPercent = viewportHeight * 0.8;
        return Math.min(available, eightyPercent);
    }

    function getCssNumber(variableName) {
        const styles = getComputedStyle(document.documentElement);
        const value = styles.getPropertyValue(variableName);
        if (!value) {
            return 0;
        }
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function applyAspectFromMetadata() {
        if (!viewer) {
            return;
        }

        currentAspect = resolveAspectFromMetadata();
        const width = currentAspect.width > 0 ? currentAspect.width : 16;
        const height = currentAspect.height > 0 ? currentAspect.height : 9;
        viewer.style.setProperty('--player-aspect-width', String(width));
        viewer.style.setProperty('--player-aspect-height', String(height));
        viewer.style.setProperty('--player-fallback-padding', `${(height / width) * 100}%`);
        if (typeof viewer.style.aspectRatio !== 'undefined') {
            viewer.style.aspectRatio = `${width} / ${height}`;
        }
    }

    function resolveAspectFromMetadata() {
        const metadata = config.gameMetadata || {};
        const nativeWidth = parseDimension(metadata.nativeWidth);
        const nativeHeight = parseDimension(metadata.nativeHeight);
        let ratio = parseAspectRatioValue(metadata.aspectRatio);

        if (nativeWidth > 0 && nativeHeight > 0) {
            ratio = nativeWidth / nativeHeight;
            return { width: nativeWidth, height: nativeHeight, ratio };
        }

        if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
            ratio = 16 / 9;
        }

        const approximate = approximateAspect(ratio);
        return { width: approximate[0], height: approximate[1], ratio };
    }

    function parseDimension(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const numeric = parseFloat(value);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
        return 0;
    }

    function parseAspectRatioValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value !== 'string') {
            return 0;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return 0;
        }
        const parts = trimmed.split(/[:/]/);
        if (parts.length === 2) {
            const left = parseFloat(parts[0]);
            const right = parseFloat(parts[1]);
            if (Number.isFinite(left) && Number.isFinite(right) && right !== 0) {
                return left / right;
            }
        }
        const numeric = parseFloat(trimmed);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function approximateAspect(ratio) {
        const maxDenominator = 100;
        let bestNumerator = 16;
        let bestDenominator = 9;
        let smallestError = Number.POSITIVE_INFINITY;

        for (let denominator = 1; denominator <= maxDenominator; denominator++) {
            const numerator = Math.round(ratio * denominator);
            if (numerator < 1) {
                continue;
            }
            const approximation = numerator / denominator;
            const error = Math.abs(approximation - ratio);
            if (error < smallestError) {
                smallestError = error;
                bestNumerator = numerator;
                bestDenominator = denominator;
                if (error <= 1e-4) {
                    break;
                }
            }
        }

        const divisor = gcd(bestNumerator, bestDenominator);
        return [bestNumerator / divisor, bestDenominator / divisor];
    }

    function gcd(a, b) {
        let x = Math.abs(a);
        let y = Math.abs(b);
        while (y) {
            const temp = y;
            y = x % y;
            x = temp;
        }
        return x || 1;
    }

    function updateFullscreenButton(isActive) {
        if (!fullscreenButton) {
            return;
        }

        fullscreenButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        fullscreenButton.dataset.state = isActive ? 'exit' : 'enter';

        const enterLabel = fullscreenButton.querySelector('[data-game-fullscreen-enter]');
        const exitLabel = fullscreenButton.querySelector('[data-game-fullscreen-exit]');

        if (enterLabel) {
            enterLabel.hidden = isActive;
            enterLabel.textContent = fullscreenLabels.enter;
        }

        if (exitLabel) {
            exitLabel.hidden = !isActive;
            exitLabel.textContent = fullscreenLabels.exit;
        }

        if (!enterLabel && !exitLabel) {
            fullscreenButton.textContent = isActive ? fullscreenLabels.exit : fullscreenLabels.enter;
        }

        fullscreenButton.setAttribute('aria-label', isActive ? fullscreenLabels.exit : fullscreenLabels.enter);
        fullscreenButton.setAttribute('title', isActive ? fullscreenLabels.exit : fullscreenLabels.enter);
    }

    function isFullscreenActive() {
        if (!stage) {
            return false;
        }
        const element = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        return element === stage;
    }

    function toggleFullscreen() {
        if (!stage) {
            return;
        }

        if (isFullscreenActive()) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
            if (exit) {
                try {
                    const result = exit.call(document);
                    if (result && typeof result.catch === 'function') {
                        result.catch(err => console.error(err));
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            return;
        }

        const request = stage.requestFullscreen || stage.webkitRequestFullscreen || stage.msRequestFullscreen;
        if (!request) {
            showFullscreenError();
            return;
        }

        try {
            const outcome = request.call(stage);
            if (outcome && typeof outcome.catch === 'function') {
                outcome.catch(() => showFullscreenError());
            }
        } catch (err) {
            console.error(err);
            showFullscreenError();
        }
    }

    function handleFullscreenChange() {
        updateFullscreenButton(isFullscreenActive());
        if (!isFullscreenActive()) {
            scheduleResizeUpdate();
        }
    }

    function handleKeydown(event) {
        if (!playerContainer || playerContainer.hidden) {
            return;
        }
        if (event.defaultPrevented) {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }
        const target = event.target;
        if (target && typeof target.tagName === 'string') {
            const tag = target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
                return;
            }
        }
        if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            toggleFullscreen();
        }
    }

    function showFullscreenError() {
        if (!fullscreenUnavailableMessage) {
            return;
        }
        setStartHint(fullscreenUnavailableMessage);
        if (fullscreenMessageTimeout) {
            clearTimeout(fullscreenMessageTimeout);
        }
        fullscreenMessageTimeout = window.setTimeout(() => {
            setStartHint('');
            fullscreenMessageTimeout = null;
        }, 4000);
    }

    function buildGameUrl(modeNumber, extraParams) {
        const url = new URL(config.webUrl, window.location.origin);
        url.searchParams.set('mode', String(modeNumber));
        if (extraParams && typeof extraParams === 'object') {
            Object.entries(extraParams).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            });
        }
        return url.pathname + url.search;
    }

    function launchGame(modeNumber, extraParams) {
        if (!canLaunchWebGame()) {
            return;
        }
        try {
            const src = buildGameUrl(modeNumber, extraParams);
            frame.src = src;
            playerContainer.hidden = false;
            updateViewerConstraints();
            scheduleResizeUpdate();
        } catch (err) {
            console.error('Failed to launch game', err);
            setMatchmakingUi(false, matchMessages.error || startHintDefault);
        }
    }

    async function requestMatchTicket(modeNumber, signal) {
        const res = await fetch(`/api/games/${config.gameId}/matchmaking/find`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ mode: modeNumber }),
            signal
        });
        if (!res.ok) {
            throw new Error('Matchmaking request failed');
        }
        return await res.json();
    }

    function wait(ms, signal) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, ms);
            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    reject(signal.reason || new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            }
        });
    }

    async function waitForMatch(ticketId, signal) {
        while (true) {
            if (signal?.aborted) {
                throw signal.reason || new DOMException('Aborted', 'AbortError');
            }
            await wait(1500, signal);
            const res = await fetch(`/api/games/${config.gameId}/matchmaking/tickets/${ticketId}`, {
                credentials: 'include',
                signal
            });
            if (!res.ok) {
                throw new Error('Matchmaking status failed');
            }
            const data = await res.json();
            if (data.status === 'matched' || data.status === 'cancelled') {
                return data;
            }
        }
    }

    function finalizeMatch(result) {
        const modeNumber = matchmakingMode ?? Number(selectedModeValue);
        const params = {
            ticketId: result.ticketId,
            matchId: result.matchId,
            opponentId: result.opponentUserId
        };
        if (result.opponentDisplayName) {
            params.opponentName = result.opponentDisplayName;
        }
        setStartHint(matchMessages.found || startHintDefault);
        launchGame(modeNumber, params);
        setMatchmakingUi(false, matchMessages.starting || startHintDefault);
    }

    function cleanupMatchmaking() {
        activeTicketId = null;
        matchmakingAbort = null;
        matchmakingMode = null;
    }

    async function startMatchmaking(modeNumber) {
        if (!canLaunchWebGame()) {
            return;
        }
        if (matchmakingAbort) {
            await cancelMatchmaking({ silent: true });
        }
        matchmakingMode = modeNumber;
        matchmakingAbort = new AbortController();
        setMatchmakingUi(true, matchMessages.searching || startHintDefault);
        try {
            const initial = await requestMatchTicket(modeNumber, matchmakingAbort.signal);
            if (initial.status === 'matched') {
                finalizeMatch(initial);
                return;
            }
            if (initial.status === 'cancelled') {
                setMatchmakingUi(false, matchMessages.cancelled || startHintDefault);
                return;
            }
            activeTicketId = initial.ticketId;
            const result = await waitForMatch(activeTicketId, matchmakingAbort.signal);
            if (result.status === 'matched') {
                finalizeMatch(result);
            } else {
                setMatchmakingUi(false, matchMessages.cancelled || startHintDefault);
            }
        } catch (err) {
            if (err && err.name === 'AbortError') {
                return;
            }
            console.error(err);
            setMatchmakingUi(false, matchMessages.error || startHintDefault);
        } finally {
            cleanupMatchmaking();
        }
    }

    async function cancelMatchmaking(options) {
        const opts = options || {};
        const ticketId = activeTicketId;
        if (matchmakingAbort) {
            matchmakingAbort.abort();
        }
        cleanupMatchmaking();
        if (cancelButton) {
            cancelButton.disabled = true;
        }
        if (ticketId) {
            try {
                await fetch(`/api/games/${config.gameId}/matchmaking/tickets/${ticketId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
            } catch (err) {
                console.error(err);
            }
        }
        if (cancelButton) {
            cancelButton.disabled = false;
        }
        if (!opts || !opts.silent) {
            setMatchmakingUi(false, matchMessages.cancelled || startHintDefault);
        } else {
            setMatchmakingUi(false);
        }
    }

    modeInputs.forEach(function (input) {
        input.addEventListener('change', function (event) {
            selectedModeValue = event.target.value;
            updateStartButtonLabel();
            if (!needsMatchmaking(Number(selectedModeValue)) && (matchmakingAbort || activeTicketId)) {
                cancelMatchmaking({ silent: true }).catch(err => console.error(err));
            }
        });
    });

    updateStartButtonLabel();

    if (startButton) {
        if (!canLaunchWebGame()) {
            startButton.disabled = true;
            if (startHint) {
                startHint.hidden = true;
            }
        }
        else {
            startButton.addEventListener('click', function () {
                const modeNumber = Number(selectedModeValue);
                if (needsMatchmaking(modeNumber)) {
                    startMatchmaking(modeNumber).catch(err => console.error(err));
                } else {
                    launchGame(modeNumber);
                }
            });
        }
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', function () {
            cancelMatchmaking().catch(err => console.error(err));
        });
    }

    window.addEventListener('beforeunload', function () {
        if (matchmakingAbort || activeTicketId) {
            cancelMatchmaking({ silent: true }).catch(() => { });
        }
    });

    const invitePanel = container.querySelector('[data-invite-panel]');
    if (invitePanel && config.inviteTemplate) {
        const select = invitePanel.querySelector('[data-invite-select]');
        const sendButton = invitePanel.querySelector('[data-invite-send]');
        const emptyHint = invitePanel.querySelector('[data-invite-empty]');
        const placeholder = select ? (select.options[0]?.textContent || '') : '';

        async function loadFriends() {
            if (!select || !sendButton) {
                return;
            }
            try {
                const res = await fetch('/api/friends', { credentials: 'include' });
                if (!res.ok) {
                    throw new Error('Failed to load friends');
                }
                const data = await res.json();
                const accepted = Array.isArray(data)
                    ? data.filter(f => Number(f.status) === 1 && !f.outgoingRequest)
                    : [];

                select.innerHTML = '';
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = placeholder;
                select.appendChild(defaultOption);

                accepted.forEach(friend => {
                    const option = document.createElement('option');
                    option.value = friend.userId;
                    option.textContent = friend.displayName || friend.userId;
                    select.appendChild(option);
                });

                if (accepted.length > 0) {
                    invitePanel.hidden = false;
                    if (emptyHint) {
                        emptyHint.hidden = true;
                    }
                    if (sendButton) {
                        sendButton.disabled = false;
                    }
                }
                else {
                    invitePanel.hidden = false;
                    if (emptyHint) {
                        emptyHint.hidden = false;
                    }
                    if (sendButton) {
                        sendButton.disabled = true;
                    }
                }
            } catch (err) {
                console.error(err);
            }
        }

        async function sendInvite() {
            if (!select || !sendButton) {
                return;
            }
            const target = select.value;
            if (!target) {
                select.focus();
                return;
            }

            const modeLabel = resolveModeLabel(selectedModeValue);
            let message = config.inviteTemplate || '';
            if (typeof message === 'string') {
                message = message.replace('{game}', config.gameTitle || '');
                message = message.replace('{mode}', modeLabel || '');
            }

            sendButton.disabled = true;
            try {
                const res = await fetch('/api/chat/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        toUserId: target,
                        content: message
                    })
                });
                if (!res.ok) {
                    throw new Error('Invite failed');
                }
                if (config.inviteSuccess) {
                    alert(config.inviteSuccess);
                }
            } catch (err) {
                console.error(err);
                if (config.inviteError) {
                    alert(config.inviteError);
                }
            } finally {
                sendButton.disabled = false;
            }
        }

        if (sendButton) {
            sendButton.addEventListener('click', sendInvite);
        }

        loadFriends().catch(err => console.error(err));
    }
})();