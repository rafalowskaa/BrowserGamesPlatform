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

    function canLaunchWebGame() {
        return Boolean(config.hasWeb && config.webUrl && frame && playerContainer);
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