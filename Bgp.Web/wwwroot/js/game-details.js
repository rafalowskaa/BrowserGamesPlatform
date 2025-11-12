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

    const ratingPanel = document.querySelector('[data-rating-panel]');
    const ratingAverageDisplay = ratingPanel ? ratingPanel.querySelector('[data-rating-average]') : null;
    const ratingCountDisplay = ratingPanel ? ratingPanel.querySelector('[data-rating-count]') : null;
    const ratingFeedback = ratingPanel ? ratingPanel.querySelector('[data-rating-feedback]') : null;
    const ratingInput = ratingPanel ? ratingPanel.querySelector('[data-rating-input]') : null;
    const ratingButtons = ratingInput ? Array.from(ratingInput.querySelectorAll('[data-star-value]')) : [];
    const ratingConfig = (config.rating && typeof config.rating === 'object') ? config.rating : {};
    const ratingMessages = (config.ratingMessages && typeof config.ratingMessages === 'object') ? config.ratingMessages : {};
    const ratingStarLabelTemplate = typeof config.ratingStarLabel === 'string'
        ? config.ratingStarLabel
        : 'Rate {0} stars';
    let userRating = Number(ratingConfig.user ?? 0) || 0;
    let currentAverage = Number(ratingConfig.average ?? 0) || 0;
    let reviewCount = Number(ratingConfig.count ?? 0) || 0;

    const stage = playerContainer ? playerContainer.querySelector('[data-game-stage]') : null;
    const viewer = playerContainer ? playerContainer.querySelector('[data-game-viewer]') : null;
    const controls = playerContainer ? playerContainer.querySelector('[data-game-controls]') : null;
    const fullscreenButton = playerContainer ? playerContainer.querySelector('[data-game-fullscreen]') : null;
    const scaleFitButton = controls ? controls.querySelector('[data-game-scale-fit]') : null;
    const scaleRange = controls ? controls.querySelector('[data-game-scale-range]') : null;
    const scaleValueDisplay = controls ? controls.querySelector('[data-game-scale-value]') : null;
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
    const SCALE_MIN_DEFAULT = 0.5;
    const SCALE_MAX_DEFAULT = 2.25;
    let resizeFrame = null;
    let fullscreenMessageTimeout = null;
    let nativeDimensions = { width: 1280, height: 720, ratio: 16 / 9 };
    let viewerMaxHeight = 0;
    let scaleMode = 'fit';
    let manualScale = 1;
    let lastFitScale = 1;
    let controlsInteractive = false;

    initializeViewer();
    initializeRating();

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
        setControlsVisibility(false);
        initializeScaleControls();
        syncHeaderHeight();
        updateFullscreenButton(isFullscreenActive());
        updateViewerConstraints();

        if (fullscreenButton) {
            fullscreenButton.addEventListener('click', function (event) {
                event.preventDefault();
                toggleFullscreen();
            });
        }
        if (scaleFitButton) {
            scaleFitButton.addEventListener('click', function (event) {
                event.preventDefault();
                scaleMode = 'fit';
                refreshScale({ force: true });
            });
        }

        if (scaleRange) {
            scaleRange.addEventListener('input', function () {
                if (!controlsInteractive) {
                    return;
                }
                scaleMode = 'manual';
                manualScale = clampScaleValue(parseFloat(scaleRange.value));
                updateScaleDisplay(manualScale);
                refreshScale();
            });
            scaleRange.addEventListener('change', function () {
                if (!controlsInteractive) {
                    return;
                }
                manualScale = clampScaleValue(parseFloat(scaleRange.value));
                refreshScale();
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

    function initializeScaleControls() {
        if (!controls) {
            return;
        }

        const [min, max] = getScaleRangeBounds();
        manualScale = clampScaleValue(manualScale, min, max);
        lastFitScale = clampScaleValue(lastFitScale, min, max);

        if (scaleRange) {
            scaleRange.value = manualScale.toFixed(2);
            scaleRange.disabled = true;
        }

        updateScaleDisplay(scaleMode === 'fit' ? lastFitScale : manualScale);
    }

    function setControlsVisibility(visible) {
        if (!controls) {
            return;
        }
        controls.hidden = !visible;
    }

    function setControlsInteractive(active) {
        controlsInteractive = Boolean(active);
        updateScaleControlState();
    }

    function updateScaleControlState() {
        if (scaleRange) {
            scaleRange.disabled = !controlsInteractive || isFullscreenActive();
        }
    }

    function refreshScale(options) {
        if (!viewer) {
            return;
        }

        updateScaleControlState();

        const { force = false } = options || {};
        const width = nativeDimensions.width > 0 ? nativeDimensions.width : 1280;
        const height = nativeDimensions.height > 0 ? nativeDimensions.height : 720;
        const [min, max] = getScaleRangeBounds();

        if (isFullscreenActive()) {
            viewer.dataset.scrollable = 'false';
            viewer.style.removeProperty('--player-viewport-height');
            viewer.style.setProperty('--player-scale', '1');
            updateScaleDisplay(scaleMode === 'fit' ? lastFitScale : manualScale);
            return;
        }

        let scale;
        if (scaleMode === 'fit') {
            scale = computeFitScale(width, height, min, max);
            lastFitScale = scale;
            manualScale = scale;
            if (scaleRange) {
                const currentValue = parseFloat(scaleRange.value);
                if (!controlsInteractive || force || !Number.isFinite(currentValue) || Math.abs(currentValue - scale) > 0.01) {
                    scaleRange.value = scale.toFixed(2);
                }
            }
        } else {
            scale = clampScaleValue(manualScale, min, max);
            manualScale = scale;
            if (scaleRange) {
                const currentValue = parseFloat(scaleRange.value);
                if (!Number.isFinite(currentValue) || Math.abs(currentValue - scale) > 0.005) {
                    scaleRange.value = scale.toFixed(2);
                }
            }
        }

        viewer.style.setProperty('--player-scale', String(scale));

        const styles = window.getComputedStyle(viewer);
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const paddingBottom = parseFloat(styles.paddingBottom) || 0;
        const rect = viewer.getBoundingClientRect();
        const containerWidth = Math.max((rect.width || viewer.clientWidth || width) - paddingLeft - paddingRight, 0);
        const maxHeight = viewerMaxHeight && Number.isFinite(viewerMaxHeight)
            ? viewerMaxHeight
            : Math.max(rect.height || viewer.clientHeight || height, 0);
        const availableHeight = Math.max(maxHeight - paddingTop - paddingBottom, 0);
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const viewportHeight = Math.min(maxHeight, scaledHeight + paddingTop + paddingBottom);

        if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
            viewer.style.setProperty('--player-viewport-height', `${viewportHeight}px`);
        } else {
            viewer.style.removeProperty('--player-viewport-height');
        }

        const requiresScroll = scaledWidth > containerWidth + 1 || scaledHeight > availableHeight + 1;
        viewer.dataset.scrollable = requiresScroll ? 'true' : 'false';

        updateScaleDisplay(scale);
    }

    function computeFitScale(width, height, min, max) {
        if (!viewer) {
            return clampScaleValue(1, min, max);
        }

        const rect = viewer.getBoundingClientRect();
        const styles = window.getComputedStyle(viewer);
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const paddingBottom = parseFloat(styles.paddingBottom) || 0;
        const widthSource = rect.width || viewer.clientWidth || width;
        const heightLimit = viewerMaxHeight && Number.isFinite(viewerMaxHeight)
            ? viewerMaxHeight
            : rect.height || viewer.clientHeight || height;
        const availableWidth = Math.max(widthSource - paddingLeft - paddingRight, 0);
        const availableHeight = Math.max(heightLimit - paddingTop - paddingBottom, 0);
        const widthScale = availableWidth > 0 ? availableWidth / width : 1;
        const heightScale = availableHeight > 0 ? availableHeight / height : 1;
        let scale = Math.min(widthScale, heightScale);
        if (!Number.isFinite(scale) || scale <= 0) {
            scale = 1;
        }
        scale = Math.min(scale, 1);
        return clampScaleValue(scale, min, max);
    }

    function getScaleRangeBounds() {
        if (!scaleRange) {
            return [SCALE_MIN_DEFAULT, SCALE_MAX_DEFAULT];
        }
        let min = parseFloat(scaleRange.min);
        let max = parseFloat(scaleRange.max);
        if (!Number.isFinite(min)) {
            min = SCALE_MIN_DEFAULT;
            scaleRange.min = String(min);
        }
        if (!Number.isFinite(max)) {
            max = SCALE_MAX_DEFAULT;
            scaleRange.max = String(max);
        }
        if (min > max) {
            const temp = min;
            min = max;
            max = temp;
            scaleRange.min = String(min);
            scaleRange.max = String(max);
        }
        return [min, max];
    }

    function clampScaleValue(value, min, max) {
        const bounds = getScaleRangeBounds();
        const lower = Number.isFinite(min) ? min : bounds[0];
        const upper = Number.isFinite(max) ? max : bounds[1];
        if (upper <= lower) {
            return lower;
        }
        const numeric = Number.isFinite(value) ? value : 1;
        return Math.min(Math.max(numeric, lower), upper);
    }

    function updateScaleDisplay(scale) {
        if (!scaleValueDisplay) {
            return;
        }
        const percentage = Math.round((Number(scale) || 1) * 100);
        scaleValueDisplay.textContent = `${percentage}%`;
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
            viewerMaxHeight = 0;
            playerContainer.style.removeProperty('--player-viewport-max-height');
            refreshScale();
            return;
        }

        const maxHeight = computeMaxHeightValue();
        if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
            playerContainer.style.removeProperty('--player-viewport-max-height');
            viewerMaxHeight = 0;
            refreshScale();
            return;
        }

        viewerMaxHeight = maxHeight;
        playerContainer.style.setProperty('--player-viewport-max-height', `${maxHeight}px`);
        refreshScale({ force: scaleMode === 'fit' });
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

        nativeDimensions = resolveDimensionsFromMetadata();
        const width = nativeDimensions.width > 0 ? nativeDimensions.width : 1280;
        const height = nativeDimensions.height > 0 ? nativeDimensions.height : 720;
        viewer.style.setProperty('--player-native-width', String(width));
        viewer.style.setProperty('--player-native-height', String(height));
        viewer.style.setProperty('--player-scale', '1');
        manualScale = clampScaleValue(1);
        lastFitScale = manualScale;
        if (scaleRange) {
            scaleRange.value = manualScale.toFixed(2);
        }
        updateScaleDisplay(scaleMode === 'fit' ? lastFitScale : manualScale);
    }

    function resolveDimensionsFromMetadata() {
        const metadata = config.gameMetadata || {};
        const nativeWidth = parseDimension(metadata.nativeWidth);
        const nativeHeight = parseDimension(metadata.nativeHeight);
        let ratio = parseAspectRatioValue(metadata.aspectRatio);

        if (nativeWidth > 0 && nativeHeight > 0) {
            return { width: nativeWidth, height: nativeHeight, ratio: nativeWidth / nativeHeight };
        }

        if (nativeWidth > 0 && ratio > 0) {
            const estimatedHeight = Math.max(Math.round(nativeWidth / ratio), 1);
            return { width: nativeWidth, height: estimatedHeight, ratio: nativeWidth / estimatedHeight };
        }

        if (nativeHeight > 0 && ratio > 0) {
            const estimatedWidth = Math.max(Math.round(nativeHeight * ratio), 1);
            return { width: estimatedWidth, height: nativeHeight, ratio: estimatedWidth / nativeHeight };
        }

        if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
            ratio = 16 / 9;
        }

        const approximate = approximateAspect(ratio);
        const ratioWidth = Math.max(approximate[0], 1);
        const ratioHeight = Math.max(approximate[1], 1);
        const baseHeight = 720;
        const computedWidth = Math.max(Math.round(baseHeight * (ratioWidth / ratioHeight)), 320);
        return { width: computedWidth, height: baseHeight, ratio: computedWidth / baseHeight };
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
        updateScaleControlState();
        refreshScale({ force: true });
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
            setControlsVisibility(true);
            setControlsInteractive(true);
            updateViewerConstraints();
            refreshScale({ force: true });
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

    function initializeRating() {
        if (!ratingPanel) {
            return;
        }

        updateRatingSummary(currentAverage, reviewCount);
        updateUserRating(userRating);

        if (!ratingInput || ratingButtons.length === 0 || typeof ratingConfig.submitUrl !== 'string' || ratingConfig.submitUrl.length === 0) {
            return;
        }

        ratingButtons.forEach(button => {
            button.addEventListener('click', function (event) {
                event.preventDefault();
                const value = Number(button.dataset.starValue);
                if (!Number.isFinite(value) || value < 1 || value > 5) {
                    return;
                }
                submitRating(value);
            });
        });
    }

    async function submitRating(value) {
        if (!ratingConfig || typeof ratingConfig.submitUrl !== 'string' || ratingConfig.submitUrl.length === 0) {
            return;
        }

        setRatingFeedback();
        setRatingButtonsDisabled(true);

        try {
            const response = await fetch(ratingConfig.submitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ stars: value })
            });

            if (!response.ok) {
                throw new Error('Rating submission failed');
            }

            updateUserRating(value);
            await refreshRating();
            setRatingFeedback('success');
        } catch (err) {
            console.error('Failed to submit rating', err);
            setRatingFeedback('error');
        } finally {
            setRatingButtonsDisabled(false);
        }
    }

    async function refreshRating() {
        if (!ratingConfig || typeof ratingConfig.submitUrl !== 'string' || ratingConfig.submitUrl.length === 0) {
            return;
        }

        try {
            const response = await fetch(ratingConfig.submitUrl, { method: 'GET', credentials: 'include' });
            if (!response.ok) {
                throw new Error('Failed to load rating data');
            }

            const data = await response.json();
            if (data && typeof data === 'object') {
                const avg = Number(data.Avg ?? data.avg);
                const count = Number(data.Count ?? data.count);
                const user = Number(data.UserStars ?? data.userStars);
                if (Number.isFinite(avg)) {
                    currentAverage = avg;
                }
                if (Number.isFinite(count)) {
                    reviewCount = count;
                }
                if (Number.isFinite(user)) {
                    updateUserRating(user);
                }
            }

            updateRatingSummary(currentAverage, reviewCount);
        } catch (err) {
            console.error('Failed to refresh rating', err);
        }
    }

    function updateRatingSummary(avg, count) {
        if (ratingAverageDisplay) {
            const normalized = Number.isFinite(avg) ? avg : 0;
            ratingAverageDisplay.textContent = normalized.toFixed(1);
        }

        if (ratingCountDisplay) {
            let text;
            if (count > 0) {
                const template = typeof ratingMessages.count === 'string' ? ratingMessages.count : '{0}';
                text = formatTemplate(template, count);
            } else {
                text = typeof ratingMessages.none === 'string' ? ratingMessages.none : '';
            }

            ratingCountDisplay.textContent = text;
            ratingCountDisplay.hidden = !text;
        }
    }

    function updateUserRating(value) {
        userRating = Number.isFinite(value) ? value : 0;
        if (!ratingInput) {
            return;
        }

        ratingInput.dataset.userRating = String(userRating);
        ratingButtons.forEach(button => {
            const starValue = Number(button.dataset.starValue) || 0;
            const filled = starValue <= userRating;
            button.classList.toggle('is-filled', filled);
            button.setAttribute('aria-pressed', filled ? 'true' : 'false');
            const label = formatTemplate(ratingStarLabelTemplate, starValue);
            if (label) {
                button.setAttribute('aria-label', label);
            }
        });
    }

    function setRatingButtonsDisabled(disabled) {
        if (!ratingButtons.length) {
            return;
        }

        const state = Boolean(disabled);
        ratingButtons.forEach(button => {
            button.disabled = state;
        });
    }

    function setRatingFeedback(state) {
        if (!ratingFeedback) {
            return;
        }

        let message = '';
        let isError = false;
        let isSuccess = false;

        if (state === 'success') {
            message = typeof ratingMessages.success === 'string' ? ratingMessages.success : '';
            isSuccess = message.length > 0;
        } else if (state === 'error') {
            message = typeof ratingMessages.error === 'string' ? ratingMessages.error : '';
            isError = message.length > 0;
        }

        ratingFeedback.textContent = message;
        ratingFeedback.hidden = !message;
        ratingFeedback.classList.toggle('is-error', isError);
        ratingFeedback.classList.toggle('is-success', isSuccess);
    }

    function formatTemplate(template, ...args) {
        if (typeof template !== 'string' || template.length === 0) {
            return '';
        }

        return template.replace(/\{(\d+)\}/g, (match, index) => {
            const idx = Number(index);
            if (!Number.isFinite(idx) || idx < 0 || idx >= args.length) {
                return match;
            }
            return String(args[idx]);
        });
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