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
    const playerContainer = container.querySelector('[data-game-player]');
    const frame = container.querySelector('[data-game-frame]');
    const modeInputs = container.querySelectorAll('input[name="game-mode"]');

    let selectedModeValue = modeInputs.length > 0 ? modeInputs[0].value : '0';

    function resolveModeLabel(value) {
        if (!Array.isArray(config.modes)) {
            return value;
        }
        const numeric = Number(value);
        const match = config.modes.find(m => Number(m.value) === numeric);
        return match ? match.label : value;
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
        else if ((modeNumber & 2) === 2 || (modeNumber & 4) === 4) {
            if (config.startMulti) {
                label = config.startMulti;
            }
        }
        startButton.textContent = label;
    }

    modeInputs.forEach(function (input) {
        input.addEventListener('change', function (event) {
            selectedModeValue = event.target.value;
            updateStartButtonLabel();
        });
    });

    updateStartButtonLabel();

    if (startButton) {
        if (!config.hasWeb || !config.webUrl || !frame || !playerContainer) {
            startButton.disabled = true;
            if (startHint) {
                startHint.hidden = true;
            }
        }
        else {
            startButton.addEventListener('click', function () {
                try {
                    const url = new URL(config.webUrl, window.location.origin);
                    url.searchParams.set('mode', selectedModeValue);
                    frame.src = url.pathname + url.search;
                    playerContainer.hidden = false;
                } catch (err) {
                    console.error('Failed to launch game', err);
                }
            });
        }
    }

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