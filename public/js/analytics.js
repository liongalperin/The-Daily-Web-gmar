/**
 * Impact Analytics (editor). Vanilla JS + Chart.js (served locally from /vendor/chart.umd.min.js).
 *
 * 1. The editor searches for a live article (GET /api/admin/articles?q=, keeping items with isLive).
 * 2. GET /api/admin/analytics/:articleId returns hourly view counts and the publish/update times:
 *      { viewData: [{ time: ISO, views }], updatePoints: [ISO, ...] }
 * 3. We draw views per hour on a time axis, a labeled vertical line at every update,
 *    and compare the average views/hour in the 6 hours before and after each update.
 *
 * Depends on window.DW (main.js) and window.Chart.
 */
(function () {
  'use strict';

  const DW = window.DW;
  const root = document.getElementById('analytics');
  if (!DW || !root) return;

  const t = DW.t;
  const HOUR = 3600 * 1000;
  const IMPACT_WINDOW_HOURS = 6;
  const html = document.documentElement;
  const isRtl = html.dir === 'rtl';

  const el = {
    input: document.getElementById('picker-q'),
    results: document.getElementById('picker-results'),
    empty: document.getElementById('an-empty'),
    loader: document.getElementById('an-loader'),
    error: document.getElementById('an-error'),
    retry: document.getElementById('an-retry'),
    report: document.getElementById('an-report'),
    title: document.getElementById('chart-title'),
    canvas: document.getElementById('chart'),
    chartEmpty: document.getElementById('chart-empty'),
    range: document.getElementById('range'),
    tableToggle: document.getElementById('table-toggle'),
    tableWrap: document.getElementById('table-wrap'),
    tableBody: document.getElementById('table-body'),
    impact: document.getElementById('impact'),
    total: document.getElementById('t-total'),
    peak: document.getElementById('t-peak'),
    peakWhen: document.getElementById('t-peak-when'),
    latest: document.getElementById('t-impact'),
    latestDetail: document.getElementById('t-impact-detail')
  };

  const formatHour = new Intl.DateTimeFormat(DW.lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  // Axis labels are two lines -- date over time -- so Hebrew month names and digits never
  // share one line, where the bidi algorithm reorders them ("09 ,4 באוק'").
  const formatTickDate = new Intl.DateTimeFormat(DW.lang, { day: 'numeric', month: 'short' });
  const formatTickTime = new Intl.DateTimeFormat(DW.lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const TICK_STEPS_HOURS = [1, 2, 3, 6, 12, 24, 48];
  const formatInt = new Intl.NumberFormat(DW.lang);

  const state = { article: null, points: [], updates: [], rangeHours: 0, chart: null };

  function css(name) {
    return getComputedStyle(html).getPropertyValue(name).trim();
  }

  /* ---------------------------------------------------------------------
     Article picker (combobox)
     --------------------------------------------------------------------- */
  let searchController = null;
  let activeIndex = -1;

  function closeResults() {
    el.results.hidden = true;
    el.input.setAttribute('aria-expanded', 'false');
    el.input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function highlight(index) {
    const options = el.results.querySelectorAll('[role="option"]');
    if (!options.length) return;
    activeIndex = (index + options.length) % options.length;
    options.forEach(function (option, i) { option.setAttribute('aria-selected', String(i === activeIndex)); });
    el.input.setAttribute('aria-activedescendant', options[activeIndex].id);
    options[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderResults(items) {
    el.results.replaceChildren();
    if (!items.length) {
      const none = document.createElement('li');
      none.className = 'picker__option';
      none.textContent = t('analytics.noResults');
      el.results.appendChild(none);
    }
    items.forEach(function (item, index) {
      const id = String(item._id || item.id);
      const title = item.title || (item.publicVersion && item.publicVersion.title) || '';
      const option = document.createElement('li');
      option.className = 'picker__option';
      option.id = 'picker-option-' + index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.dataset.id = id;
      option.dataset.title = title;

      const name = document.createElement('span');
      name.className = 'picker__option-title';
      name.dir = 'auto';
      name.textContent = title;
      const meta = document.createElement('span');
      meta.className = 'picker__option-meta';
      const published = item.publishedAt || (item.publicVersion && item.publicVersion.publishedAt);
      meta.textContent = [item.category ? t('cat.' + item.category) : '', item.authorName || '', DW.fmt.date(published)].filter(Boolean).join(' · ');
      option.append(name, meta);
      el.results.appendChild(option);
    });
    el.results.hidden = false;
    el.input.setAttribute('aria-expanded', 'true');
    activeIndex = -1;
  }

  function isLive(item) {
    if (typeof item.isLive === 'boolean') return item.isLive;
    return Boolean(item.publishedAt || (item.publicVersion && item.publicVersion.publishedAt));
  }

  async function searchArticles() {
    if (searchController) searchController.abort();
    searchController = new AbortController();
    // Every article with a public version has views, whatever its status: a published article
    // with an update waiting for approval is Pending but live, and its update markers matter most.
    const params = new URLSearchParams({ limit: '30' });
    const q = el.input.value.trim();
    if (q) params.set('q', q);
    try {
      const data = await DW.api('/api/admin/articles?' + params.toString(), { signal: searchController.signal });
      const items = Array.isArray(data) ? data : ((data && (data.articles || data.items)) || []);
      renderResults(items.filter(isLive).slice(0, 8));
    } catch (error) {
      if (error.name !== 'AbortError') closeResults();
    }
  }

  function choose(option) {
    if (!option || !option.dataset.id) return;
    el.input.value = option.dataset.title;
    closeResults();
    selectArticle({ id: option.dataset.id, title: option.dataset.title });
  }

  el.input.addEventListener('input', DW.debounce(searchArticles, 250));
  el.input.addEventListener('focus', function () { if (el.results.hidden) searchArticles(); });
  el.input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (el.results.hidden) searchArticles(); else highlight(activeIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(activeIndex - 1); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const options = el.results.querySelectorAll('[role="option"]');
      choose(options[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Escape') closeResults();
  });
  el.results.addEventListener('mousedown', function (event) {
    // mousedown (not click) so the input doesn't lose focus and close the list first
    event.preventDefault();
    choose(event.target.closest('[role="option"]'));
  });
  document.addEventListener('click', function (event) {
    if (!document.getElementById('picker').contains(event.target)) closeResults();
  });

  /* ---------------------------------------------------------------------
     Loading and normalizing the data
     --------------------------------------------------------------------- */
  function toTime(value) {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function normalize(data) {
    const rawPoints = (data && (data.viewData || data.views || data.points)) || [];
    const points = rawPoints
      .map(function (p) { return { x: toTime(p.time || p.timestamp || p.hour), y: Number(p.views !== undefined ? p.views : p.count) || 0 }; })
      // Stop at now: hours that haven't happened yet can't have views.
      .filter(function (p) { return p.x !== null && p.x <= Date.now(); })
      .sort(function (a, b) { return a.x - b.x; });
    const updates = ((data && (data.updatePoints || data.publishHistory)) || [])
      .map(function (u) { return toTime(typeof u === 'object' && u !== null ? (u.time || u.date) : u); })
      .filter(function (u) { return u !== null && u <= Date.now(); })
      .sort(function (a, b) { return a - b; });
    return { points: points, updates: updates };
  }

  function show(part) {
    el.empty.hidden = part !== 'empty';
    el.loader.hidden = part !== 'loading';
    el.error.hidden = part !== 'error';
    el.report.hidden = part !== 'report';
  }

  async function selectArticle(article) {
    state.article = article;
    const url = new URL(window.location.href);
    url.searchParams.set('article', article.id);
    window.history.replaceState(null, '', url.pathname + url.search);

    show('loading');
    try {
      const data = await DW.api('/api/admin/analytics/' + encodeURIComponent(article.id));
      const parsed = normalize(data);
      state.points = parsed.points;
      state.updates = parsed.updates;
      if (data && data.article && data.article.title) state.article.title = data.article.title;
      show('report');
      render();
    } catch (error) {
      document.getElementById('an-error-text').textContent = DW.errorText(error, t('analytics.error'));
      show('error');
    }
  }

  el.retry.addEventListener('click', function () { if (state.article) selectArticle(state.article); });

  /* ---------------------------------------------------------------------
     Calculations
     --------------------------------------------------------------------- */
  function visiblePoints() {
    if (!state.rangeHours || !state.points.length) return state.points;
    const end = state.points[state.points.length - 1].x;
    return state.points.filter(function (p) { return p.x > end - state.rangeHours * HOUR; });
  }

  /** Average views per hour in [from, to), only over hours we actually have data for. */
  function viewsPerHour(from, to) {
    if (!state.points.length) return null;
    const first = state.points[0].x;
    const last = state.points[state.points.length - 1].x + HOUR;
    const start = Math.max(from, first);
    const end = Math.min(to, last);
    if (end <= start) return null;
    const total = state.points.reduce(function (sum, p) { return p.x >= start && p.x < end ? sum + p.y : sum; }, 0);
    return total / ((end - start) / HOUR);
  }

  function impactOf(update) {
    const before = viewsPerHour(update - IMPACT_WINDOW_HOURS * HOUR, update);
    const after = viewsPerHour(update, update + IMPACT_WINDOW_HOURS * HOUR);
    const change = before ? Math.round((after - before) / before * 100) : null;
    return { before: before, after: after, change: change };
  }

  function changeText(change) {
    if (change === null || !Number.isFinite(change)) return '–';
    return (change > 0 ? '▲ +' : change < 0 ? '▼ ' : '') + formatInt.format(change) + '%';
  }

  /* ---------------------------------------------------------------------
     Rendering
     --------------------------------------------------------------------- */
  /** Ticks at whole hours, using the smallest step that keeps the axis to about 8 labels. */
  function hourTicks(min, max) {
    const span = (max - min) / HOUR;
    const step = TICK_STEPS_HOURS.find(function (h) { return span / h <= 8; }) || TICK_STEPS_HOURS[TICK_STEPS_HOURS.length - 1];
    const first = new Date(min);
    first.setMinutes(0, 0, 0);
    if (first.getTime() < min) first.setHours(first.getHours() + 1);
    // Align to the step in local time (e.g. 00:00, 06:00, 12:00 for a 6-hour step).
    while (first.getHours() % Math.min(step, 24) !== 0) first.setHours(first.getHours() + 1);
    const ticks = [];
    for (let time = first.getTime(); time <= max; time += step * HOUR) ticks.push({ value: time });
    return ticks;
  }

  /** Date on the first tick and wherever the day changes; the time on every tick. */
  function tickLabel(value, index, ticks) {
    const previous = index > 0 ? ticks[index - 1].value : null;
    const newDay = previous === null || new Date(previous).toDateString() !== new Date(value).toDateString();
    return newDay ? [formatTickTime.format(value), formatTickDate.format(value)] : formatTickTime.format(value);
  }

  function render() {
    const points = visiblePoints();
    el.title.textContent = t('analytics.chartTitle', { title: state.article.title || '' });
    renderTiles(points);
    renderImpact();
    renderTable(points);
    renderChart(points);
  }

  function renderTiles(points) {
    const total = points.reduce(function (sum, p) { return sum + p.y; }, 0);
    el.total.textContent = DW.fmt.number(total);
    const peak = points.reduce(function (best, p) { return !best || p.y > best.y ? p : best; }, null);
    el.peak.textContent = peak ? formatInt.format(peak.y) : '–';
    el.peakWhen.textContent = peak ? formatHour.format(peak.x) : '';

    const latest = state.updates[state.updates.length - 1];
    el.latestDetail.classList.remove('is-up', 'is-down');
    if (latest === undefined) {
      el.latest.textContent = '–';
      el.latestDetail.textContent = t('analytics.noUpdates');
      return;
    }
    const impact = impactOf(latest);
    el.latest.textContent = impact.change === null ? '–' : (impact.change > 0 ? '+' : '') + formatInt.format(impact.change) + '%';
    el.latestDetail.textContent = impact.before === null || impact.after === null ? '' : t('analytics.perHour', {
      before: formatInt.format(Math.round(impact.before)),
      after: formatInt.format(Math.round(impact.after))
    });
    if (impact.change !== null) el.latestDetail.classList.add(impact.change >= 0 ? 'is-up' : 'is-down');
  }

  function renderImpact() {
    el.impact.replaceChildren();
    if (!state.updates.length) {
      const p = document.createElement('p');
      p.className = 'panel__text';
      p.textContent = t('analytics.noUpdates');
      el.impact.appendChild(p);
      return;
    }
    state.updates.forEach(function (update, index) {
      const impact = impactOf(update);
      const row = document.createElement('div');
      row.className = 'impact__row';
      const label = document.createElement('span');
      label.className = 'impact__when';
      label.textContent = t('analytics.update', { n: index + 1 });
      const when = document.createElement('time');
      when.dateTime = new Date(update).toISOString();
      when.textContent = formatHour.format(update);
      const nums = document.createElement('span');
      nums.className = 'impact__nums';
      nums.textContent = impact.before === null || impact.after === null ? '–' : t('analytics.perHour', {
        before: formatInt.format(Math.round(impact.before)),
        after: formatInt.format(Math.round(impact.after))
      });
      const delta = document.createElement('span');
      delta.className = 'tile__delta' + (impact.change === null ? '' : impact.change >= 0 ? ' is-up' : ' is-down');
      delta.textContent = changeText(impact.change);
      row.append(label, when, nums, delta);
      el.impact.appendChild(row);
    });
  }

  function renderTable(points) {
    const fragment = document.createDocumentFragment();
    points.forEach(function (p) {
      const isUpdate = state.updates.some(function (u) { return u >= p.x && u < p.x + HOUR; });
      const row = document.createElement('tr');
      if (isUpdate) row.className = 'is-update';
      const when = document.createElement('td');
      when.textContent = formatHour.format(p.x) + (isUpdate ? ' · ' + t('analytics.updateMark') : '');
      const views = document.createElement('td');
      views.className = 'num';
      views.textContent = formatInt.format(p.y);
      row.append(when, views);
      fragment.appendChild(row);
    });
    el.tableBody.replaceChildren(fragment);
  }

  /* Chart.js plugin: a labeled vertical line at every update + a hover crosshair. */
  const updateMarkers = {
    id: 'updateMarkers',
    afterDatasetsDraw: function (chart) {
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const x = chart.scales.x;
      const marker = css('--chart-marker');
      const labelInk = css('--sheet');
      ctx.save();
      ctx.font = '700 11px ' + css('--font-sans');
      ctx.textBaseline = 'middle';
      state.updates.forEach(function (update, index) {
        if (update < x.min || update > x.max) return;
        const px = Math.round(x.getPixelForValue(update)) + 0.5;
        ctx.strokeStyle = marker;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, area.top + 22);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();

        const label = t('analytics.update', { n: index + 1 }) + ' · ' + formatHour.format(update);
        const width = ctx.measureText(label).width + 12;
        const left = Math.min(Math.max(px - width / 2, area.left), area.right - width);
        ctx.fillStyle = marker;
        ctx.fillRect(left, area.top, width, 20);
        ctx.fillStyle = labelInk;
        ctx.textAlign = 'left';
        ctx.direction = isRtl ? 'rtl' : 'ltr';
        ctx.fillText(label, left + 6, area.top + 10);
      });

      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (active && active.length) {
        ctx.strokeStyle = css('--ink-3');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(active[0].element.x, area.top);
        ctx.lineTo(active[0].element.x, area.bottom);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  function renderChart(points) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    el.chartEmpty.hidden = points.length > 0;
    el.canvas.hidden = points.length === 0;
    if (!points.length || typeof window.Chart !== 'function') return;

    const ink3 = css('--ink-3');
    const rule = css('--rule');
    const axisTitle = { display: true, color: ink3, font: { size: 11, weight: '600' } };

    state.chart = new window.Chart(el.canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: t('analytics.keyViews'),
          data: points,
          parsing: false,
          borderColor: css('--chart-line'),
          backgroundColor: css('--chart-fill'),
          fill: 'origin',
          borderWidth: 2,
          // Straight segments: a smoothed curve bends upward before the update marker, so a jump
          // caused by the update would look like it started earlier.
          tension: 0,
          pointRadius: points.length > 60 ? 0 : 2,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: css('--sheet'),
          pointHoverBackgroundColor: css('--chart-line')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          // Time always runs left to right, also in Hebrew (the usual convention for timelines).
          x: {
            type: 'linear',
            min: points[0].x,
            max: points[points.length - 1].x,
            grid: { color: rule, drawTicks: false },
            border: { color: rule },
            // Our own ticks on whole local hours, evenly spaced (a linear scale would pick odd values).
            afterBuildTicks: function (scale) { scale.ticks = hourTicks(scale.min, scale.max); },
            ticks: { color: ink3, padding: 8, autoSkip: false, maxRotation: 0, callback: tickLabel },
            title: Object.assign({ text: t('analytics.axisTime') }, axisTitle)
          },
          y: {
            beginAtZero: true,
            grid: { color: rule, drawTicks: false },
            border: { display: false },
            ticks: { color: ink3, padding: 8, maxTicksLimit: 6, precision: 0, callback: function (value) { return formatInt.format(value); } },
            title: Object.assign({ text: t('analytics.axisViews') }, axisTitle)
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: isRtl,
            textDirection: isRtl ? 'rtl' : 'ltr',
            backgroundColor: css('--ink'),
            titleColor: css('--paper'),
            bodyColor: css('--paper'),
            padding: 10,
            cornerRadius: 4,
            displayColors: false,
            callbacks: {
              title: function (items) { return formatHour.format(items[0].parsed.x); },
              label: function (item) { return t('analytics.viewsCount', { count: formatInt.format(item.parsed.y) }); }
            }
          }
        }
      },
      plugins: [updateMarkers]
    });
  }

  /* ---------------------------------------------------------------------
     Controls
     --------------------------------------------------------------------- */
  el.range.addEventListener('click', function (event) {
    const button = event.target.closest('[data-range]');
    if (!button) return;
    state.rangeHours = Number(button.dataset.range) || 0;
    el.range.querySelectorAll('[data-range]').forEach(function (other) {
      other.setAttribute('aria-pressed', String(other === button));
    });
    if (state.article) render();
  });

  el.tableToggle.addEventListener('click', function () {
    el.tableWrap.hidden = !el.tableWrap.hidden;
    el.tableToggle.setAttribute('aria-expanded', String(!el.tableWrap.hidden));
    el.tableToggle.textContent = el.tableWrap.hidden ? t('analytics.showTable') : t('analytics.hideTable');
  });

  // Chart colors come from CSS variables, so redraw when the Day/Night theme changes.
  new MutationObserver(function () {
    if (state.article && !el.report.hidden) renderChart(visiblePoints());
  }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  // Opened with ?article=<id> (e.g. from the editor desk): load it straight away.
  if (root.dataset.articleId) {
    selectArticle({ id: root.dataset.articleId, title: root.dataset.articleTitle || '' });
  }
})();
