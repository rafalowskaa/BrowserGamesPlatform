(() => {
    const root = document.querySelector('[data-stats-root]');
    if (!root) return;

    const locale = document.documentElement.lang || 'pl-PL';
    const numberFormat = new Intl.NumberFormat(locale);
    const dateFormat = (granularity) => {
        const options =
            granularity === 'month'
                ? { month: 'short', year: '2-digit' }
                : granularity === 'week'
                    ? { day: '2-digit', month: 'short' }
                    : { day: '2-digit', month: 'short' };
        return new Intl.DateTimeFormat(locale, options);
    };

    const state = {
        rangePreset: root.dataset.range || '30d',
        granularity: root.dataset.granularity || 'day',
        start: root.dataset.start,
        end: root.dataset.end,
        compare: root.dataset.compare === 'true',
        showInactive: root.dataset.showInactive === 'true',
        metric: 'activeUsers',
        multiSeries: false,
        tab: 'overview'
    };

    const endpoints = {
        summary: root.dataset.summaryUrl,
        series: root.dataset.seriesUrl,
        heatmap: root.dataset.heatmapUrl,
        top: root.dataset.topUrl,
        drilldown: root.dataset.drilldownUrl
    };

    const elements = {
        tabs: root.querySelectorAll('[data-tab]'),
        panels: root.querySelectorAll('[data-tab-panel]'),
        filter: root.querySelector('[data-stats-filter]'),
        rangeSelect: root.querySelector('select[name="range"]'),
        startInput: root.querySelector('input[name="start"]'),
        endInput: root.querySelector('input[name="end"]'),
        granularitySelect: root.querySelector('select[name="granularity"]'),
        compareToggle: root.querySelector('input[name="compare"]'),
        showInactiveToggle: root.querySelector('input[name="showInactive"]'),
        kpiGrids: root.querySelectorAll('[data-kpi-grid]'),
        kpiSummaries: root.querySelectorAll('[data-kpi-summary]'),
        trendSections: root.querySelectorAll('[data-trend-section]'),
        trendCharts: root.querySelectorAll('[data-trend-chart]'),
        trendEmpties: root.querySelectorAll('[data-trend-empty]'),
        metricSelect: root.querySelector('[data-metric-select]'),
        multiSeriesToggle: root.querySelector('[data-multi-series-toggle]'),
        heatmapBodies: root.querySelectorAll('[data-heatmap-body]'),
        heatmapEmpties: root.querySelectorAll('[data-heatmap-empty]'),
        insightsList: root.querySelector('[data-insights]'),
        insightsEmpty: root.querySelector('[data-insights-empty]'),
        topDays: root.querySelectorAll('[data-top-days]'),
        topGames: root.querySelectorAll('[data-top-games]'),
        newGames: root.querySelectorAll('[data-new-games]'),
        reportReasons: root.querySelectorAll('[data-report-reasons]'),
        ratingDistribution: root.querySelectorAll('[data-rating-distribution]'),
        drawer: root.querySelector('[data-stats-drawer]'),
        drawerSubtitle: root.querySelector('[data-drawer-subtitle]'),
        drawerTotals: root.querySelector('[data-drawer-totals]'),
        drawerTopGames: root.querySelector('[data-drawer-top-games]'),
        drawerTopCommented: root.querySelector('[data-drawer-top-commented]'),
        drawerRatingDist: root.querySelector('[data-drawer-rating-distribution]'),
        drawerCloseButtons: root.querySelectorAll('[data-drawer-close]')
    };

    const loadingTargets = root.querySelectorAll('[data-kpi-section], [data-trend-section], [data-heatmap-card], [data-insights-card], [data-toplists], [data-moderation-card], [data-ratings-card]');

    const chartInstances = new Map();
    let debounceTimer = null;
    let latestSeries = null;

    const colorMap = {
        activeUsers: '#38bdf8',
        logins: '#38bdf8',
        gamesPlayed: '#22c55e',
        comments: '#fbbf24',
        ratings: '#a855f7',
        gamesPublished: '#f97316',
        reports: '#ef4444'
    };

    const metricLabels = {
        activeUsers: root.querySelector('[data-kpi="activeUsers"] span')?.textContent || 'Active users',
        logins: root.querySelector('[data-kpi="logins"] span')?.textContent || 'Logins',
        gamesPlayed: root.querySelector('[data-kpi="gamesPlayed"] span')?.textContent || 'Games played',
        comments: root.querySelector('[data-kpi="comments"] span')?.textContent || 'Comments',
        ratings: root.querySelector('[data-kpi="ratings"] span')?.textContent || 'Ratings',
        gamesPublished: root.querySelector('[data-kpi="gamesPublished"] span')?.textContent || 'Games published',
        averageRating: root.dataset.averageRatingLabel || 'Average rating'
    };

    const emptyText = root.dataset.emptyText || 'No data.';

    const parseDate = (value) => new Date(`${value}T00:00:00`);
    const formatNumber = (value) => numberFormat.format(value ?? 0);
    const formatPercent = (value) => {
        if (value === null || value === undefined) return '';
        const percent = value * 100;
        const sign = percent > 0 ? '+' : '';
        return `${sign}${percent.toFixed(0)}%`;
    };

    const setLoading = (isLoading) => {
        loadingTargets.forEach((el) => {
            if (isLoading) {
                el.classList.add('is-loading');
            } else {
                el.classList.remove('is-loading');
            }
        });
    };

    const setActiveTab = (tab) => {
        state.tab = tab;
        elements.tabs.forEach((button) => {
            const active = button.dataset.tab === tab;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        elements.panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
        });
        if (latestSeries) {
            window.requestAnimationFrame(() => renderTrend(latestSeries));
        }
    };

    const getRenderableTrendCanvases = () => {
        const activeCanvases = root.querySelectorAll('.stats-tab-panel.is-active [data-trend-canvas]');
        if (activeCanvases.length > 0) {
            return Array.from(activeCanvases);
        }

        return Array.from(root.querySelectorAll('[data-trend-canvas]'));
    };

    const enforceGranularity = () => {
        const startDate = parseDate(state.start);
        const endDate = parseDate(state.end);
        const days = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
        if (days > 365 && state.granularity !== 'month') {
            state.granularity = 'month';
            elements.granularitySelect.value = 'month';
        } else if (days > 120 && state.granularity === 'day') {
            state.granularity = 'week';
            elements.granularitySelect.value = 'week';
        }
    };

    const applyPresetDates = (preset) => {
        const now = new Date();
        const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        let startDate = new Date(endDate);
        if (preset === '7d') {
            startDate.setUTCDate(endDate.getUTCDate() - 6);
        } else if (preset === '30d') {
            startDate.setUTCDate(endDate.getUTCDate() - 29);
        } else if (preset === '12m') {
            startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
            startDate.setUTCMonth(startDate.getUTCMonth() - 11);
        }
        return {
            start: startDate.toISOString().slice(0, 10),
            end: endDate.toISOString().slice(0, 10)
        };
    };

    const buildQuery = () => {
        const params = new URLSearchParams();
        params.set('range', state.rangePreset);
        params.set('granularity', state.granularity);
        params.set('start', state.start);
        params.set('end', state.end);
        if (state.compare) params.set('compare', 'true');
        if (state.showInactive) params.set('showInactive', 'true');
        return params.toString();
    };

    const fetchJson = async (url, query) => {
        const response = await fetch(`${url}?${query}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!response.ok) {
            throw new Error('Request failed');
        }
        return response.json();
    };

    const renderKpis = (totals, deltas) => {
        elements.kpiGrids.forEach((grid) => {
            grid.querySelectorAll('[data-kpi]').forEach((card) => {
                const key = card.dataset.kpi;
                const valueEl = card.querySelector('.stats-kpi-value');
                const deltaEl = card.querySelector('.stats-kpi-delta');
                const value = totals?.[key] ?? 0;
                if (valueEl) valueEl.textContent = formatNumber(value);
                if (deltaEl) {
                    if (deltas && deltas[key] !== undefined) {
                        deltaEl.textContent = formatPercent(deltas[key]);
                        deltaEl.hidden = false;
                        deltaEl.classList.toggle('is-positive', deltas[key] > 0);
                        deltaEl.classList.toggle('is-negative', deltas[key] < 0);
                    } else {
                        deltaEl.hidden = true;
                    }
                }
            });
        });
        if (totals) {
            elements.kpiSummaries.forEach((summary) => {
                summary.innerHTML = `
          <span>${metricLabels.averageRating}: <strong>${totals.averageRating?.toFixed(2) ?? '0.00'}</strong></span>
          <span>${metricLabels.ratings}: <strong>${formatNumber(totals.ratings)}</strong></span>
        `;
            });
        }
    };

    const renderInsights = (insights) => {
        if (!elements.insightsList) return;
        elements.insightsList.innerHTML = '';
        if (!insights || insights.length === 0) {
            elements.insightsEmpty?.removeAttribute('hidden');
            return;
        }
        elements.insightsEmpty?.setAttribute('hidden', 'true');
        insights.forEach((insight) => {
            const item = document.createElement('article');
            item.className = 'stats-insight';
            item.dataset.tone = insight.tone || 'neutral';
            item.innerHTML = `<strong>${insight.title}</strong><span>${insight.description}</span>`;
            elements.insightsList.appendChild(item);
        });
    };

    const renderTopLists = (data) => {
        const renderList = (targets, items, builder, emptyMessage = emptyText) => {
            targets.forEach((target) => {
                target.innerHTML = '';
                if (!items || items.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'stats-empty';
                    empty.textContent = emptyMessage;
                    target.appendChild(empty);
                    return;
                }
                items.forEach((item) => target.appendChild(builder(item)));
            });
        };

        renderList(elements.topDays, data.topDays, (day) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${formatBucket(day.periodStart)}</span><strong>${formatNumber(day.totalActivity)}</strong>`;
            return li;
        });

        renderList(elements.topGames, data.topGames, (game) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${game.title}</span><strong>${formatNumber(game.plays)} · ${formatNumber(game.ratings)} · ${formatNumber(game.comments)}</strong>`;
            return li;
        });

        renderList(elements.newGames, data.newGames, (game) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${game.title}</span><strong>${formatBucket(game.publishedAtUtc)}</strong>`;
            return li;
        });

        renderList(elements.reportReasons, data.reportsByReason, (item) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${item.reason}</span><strong>${formatNumber(item.total)}</strong>`;
            return li;
        });

        renderList(elements.ratingDistribution, data.ratingDistribution, (item) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${item.stars}-★</span><strong>${formatNumber(item.total)}</strong>`;
            return li;
        });
    };

    const formatBucket = (value) => {
        const date = value instanceof Date ? value : new Date(value);
        return dateFormat(state.granularity).format(date);
    };

    const buildDataset = (label, metric, data, dashed = false) => {
        return {
            label,
            data,
            borderColor: colorMap[metric] || '#38bdf8',
            backgroundColor: colorMap[metric] || '#38bdf8',
            borderWidth: 2,
            fill: false,
            tension: 0,
            borderDash: dashed ? [6, 6] : undefined,
            pointRadius: 2
        };
    };

    const renderTrend = (data) => {
        const labels = data.series.map((point) => formatBucket(point.bucket));
        const series = data.series;
        const previous = data.previousSeries || [];

        elements.trendEmpties.forEach((empty) => {
            if (labels.length === 0) {
                empty.removeAttribute('hidden');
            } else {
                empty.setAttribute('hidden', 'true');
            }
        });

        if (labels.length === 0) {
            chartInstances.forEach((instance) => instance.destroy());
            chartInstances.clear();
            return;
        }

        const datasets = [];
        if (state.multiSeries) {
            ['activeUsers', 'logins', 'gamesPlayed', 'comments', 'ratings', 'gamesPublished'].forEach((metric) => {
                datasets.push(buildDataset(metricLabels[metric], metric, series.map((point) => point[metric])));
            });
            if (state.compare && previous.length > 0) {
                ['activeUsers', 'logins', 'gamesPlayed', 'comments', 'ratings', 'gamesPublished'].forEach((metric) => {
                    datasets.push(buildDataset(`${metricLabels[metric]} (prev)`, metric, previous.map((point) => point[metric]), true));
                });
            }
        } else {
            datasets.push(buildDataset(metricLabels[state.metric], state.metric, series.map((point) => point[state.metric])));
            if (state.compare && previous.length > 0) {
                datasets.push(buildDataset(`${metricLabels[state.metric]} (prev)`, state.metric, previous.map((point) => point[state.metric]), true));
            }
        }

        const config = {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y)}`
                        }
                    }
                },
                animation: false,
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148,163,184,0.1)' }
                    }
                }
            }
        };

        const canvases = getRenderableTrendCanvases();

        canvases.forEach((canvas) => {
            const existing = chartInstances.get(canvas);
            if (existing) {
                existing.data = config.data;
                existing.options = config.options;
                existing.resize();
                existing.update('none');
                return;
            }
            const instance = new Chart(canvas, config);
            chartInstances.set(canvas, instance);
        });
    };

    const renderHeatmap = (data) => {
        elements.heatmapBodies.forEach((body) => {
            body.innerHTML = '';
        });
        if (!data.heatmap || data.heatmap.length === 0) {
            elements.heatmapEmpties.forEach((empty) => empty.removeAttribute('hidden'));
            return;
        }
        elements.heatmapEmpties.forEach((empty) => empty.setAttribute('hidden', 'true'));

        const maxValue = Math.max(
            1,
            ...data.heatmap.map((row) => row.logins + row.gamesPlayed + row.comments + row.ratings + row.gamesPublished)
        );

        data.heatmap.forEach((row) => {
            const total = row.logins + row.gamesPlayed + row.comments + row.ratings + row.gamesPublished;
            const intensity = Math.min(4, Math.ceil((total / maxValue) * 4));
            const wrapper = document.createElement('div');
            wrapper.className = 'stats-heatmap__row';
            wrapper.dataset.bucket = row.bucket;
            wrapper.innerHTML = `
        <button class="stats-heatmap__date" type="button">${formatBucket(row.bucket)}</button>
        <span class="stats-heatmap__cell heat-${intensity}">${formatNumber(row.logins)}</span>
        <span class="stats-heatmap__cell heat-${intensity}">${formatNumber(row.gamesPlayed)}</span>
        <span class="stats-heatmap__cell heat-${intensity}">${formatNumber(row.comments)}</span>
        <span class="stats-heatmap__cell heat-${intensity}">${formatNumber(row.ratings)}</span>
        <span class="stats-heatmap__cell heat-${intensity}">${formatNumber(row.gamesPublished)}</span>
      `;
            elements.heatmapBodies.forEach((body) => body.appendChild(wrapper.cloneNode(true)));
        });
    };

    const renderDrawer = (data) => {
        if (!elements.drawer) return;
        elements.drawerSubtitle.textContent = `${formatBucket(data.range.start)} - ${formatBucket(data.range.end)}`;
        elements.drawerTotals.innerHTML = `
      <div><span>${metricLabels.logins}</span><strong>${formatNumber(data.totals.logins)}</strong></div>
      <div><span>${metricLabels.gamesPlayed}</span><strong>${formatNumber(data.totals.gamesPlayed)}</strong></div>
      <div><span>${metricLabels.comments}</span><strong>${formatNumber(data.totals.comments)}</strong></div>
      <div><span>${metricLabels.ratings}</span><strong>${formatNumber(data.totals.ratings)}</strong></div>
      <div><span>${metricLabels.gamesPublished}</span><strong>${formatNumber(data.totals.gamesPublished)}</strong></div>
    `;

        const renderList = (target, items) => {
            target.innerHTML = '';
            if (!items || items.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'stats-empty';
                empty.textContent = emptyText;
                target.appendChild(empty);
                return;
            }
            items.forEach((item) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${item.title}</span><strong>${formatNumber(item.plays)} · ${formatNumber(item.ratings)} · ${formatNumber(item.comments)}</strong>`;
                target.appendChild(li);
            });
        };

        renderList(elements.drawerTopGames, data.topGames);
        renderList(elements.drawerTopCommented, data.topCommented);
        elements.drawerRatingDist.innerHTML = '';
        if (!data.ratingDistribution || data.ratingDistribution.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'stats-empty';
            empty.textContent = emptyText;
            elements.drawerRatingDist.appendChild(empty);
        } else {
            data.ratingDistribution.forEach((item) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${item.stars}-★</span><strong>${formatNumber(item.total)}</strong>`;
                elements.drawerRatingDist.appendChild(li);
            });
        }

        elements.drawer.classList.add('is-open');
    };

    const closeDrawer = () => {
        elements.drawer?.classList.remove('is-open');
    };

    const loadAll = async () => {
        enforceGranularity();
        setLoading(true);
        const query = buildQuery();
        try {
            const [summary, series, heatmap, top] = await Promise.all([
                fetchJson(endpoints.summary, query),
                fetchJson(endpoints.series, query),
                fetchJson(endpoints.heatmap, query),
                fetchJson(endpoints.top, query)
            ]);
            renderKpis(summary.totals, summary.deltasPct);
            renderInsights(summary.insights);
            latestSeries = series;
            renderTrend(series);
            renderHeatmap(heatmap);
            renderTopLists(top);
        } catch (error) {
            console.error(error);
            elements.insightsEmpty?.removeAttribute('hidden');
            elements.insightsEmpty.textContent = root.dataset.errorText || emptyText;
            elements.heatmapEmpty?.removeAttribute('hidden');
            elements.heatmapEmpty.textContent = root.dataset.errorText || emptyText;
        } finally {
            setLoading(false);
        }
    };

    const scheduleLoad = () => {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(loadAll, 250);
    };

    elements.tabs.forEach((tab) => {
        tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    if (elements.filter) {
        elements.rangeSelect?.addEventListener('change', (event) => {
            state.rangePreset = event.target.value;
            if (state.rangePreset !== 'custom') {
                const dates = applyPresetDates(state.rangePreset);
                state.start = dates.start;
                state.end = dates.end;
                elements.startInput.value = state.start;
                elements.endInput.value = state.end;
            }
            scheduleLoad();
        });

        elements.startInput?.addEventListener('change', (event) => {
            state.start = event.target.value;
            state.rangePreset = 'custom';
            if (elements.rangeSelect) elements.rangeSelect.value = 'custom';
            scheduleLoad();
        });

        elements.endInput?.addEventListener('change', (event) => {
            state.end = event.target.value;
            state.rangePreset = 'custom';
            if (elements.rangeSelect) elements.rangeSelect.value = 'custom';
            scheduleLoad();
        });

        elements.granularitySelect?.addEventListener('change', (event) => {
            state.granularity = event.target.value;
            scheduleLoad();
        });

        elements.compareToggle?.addEventListener('change', (event) => {
            state.compare = event.target.checked;
            scheduleLoad();
        });

        elements.showInactiveToggle?.addEventListener('change', (event) => {
            state.showInactive = event.target.checked;
            scheduleLoad();
        });
    }

    elements.metricSelect?.addEventListener('change', (event) => {
        state.metric = event.target.value;
        if (latestSeries) {
            renderTrend(latestSeries);
            return;
        }
        scheduleLoad();
    });

    elements.multiSeriesToggle?.addEventListener('change', (event) => {
        state.multiSeries = event.target.checked;
        if (latestSeries) {
            renderTrend(latestSeries);
            return;
        }
        scheduleLoad();
    });

    root.addEventListener('click', async (event) => {
        const row = event.target.closest('.stats-heatmap__row');
        if (!row) return;
        const bucket = row.dataset.bucket;
        if (!bucket) return;
        try {
            const query = new URLSearchParams();
            query.set('bucket', bucket);
            query.set('granularity', state.granularity);
            const data = await fetchJson(endpoints.drilldown, query.toString());
            renderDrawer(data);
        } catch (error) {
            console.error(error);
        }
    });

    elements.drawerCloseButtons.forEach((button) => {
        button.addEventListener('click', closeDrawer);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDrawer();
    });

    setActiveTab('overview');
    scheduleLoad();
})();