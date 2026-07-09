// ==UserScript==
// @name         Cursor Dashboard Usage Viewer
// @namespace    https://github.com/zhujunsan/cursor-dashboard-usage-viewer
// @version      1.0.6
// @description  Display usage balance from Cursor dashboard on the usage page
// @author       San
// @match        https://cursor.com/dashboard
// @match        https://cursor.com/dashboard/*
// @match        https://www.cursor.com/dashboard
// @match        https://www.cursor.com/dashboard/*
// @homepageURL  https://github.com/zhujunsan/cursor-dashboard-usage-viewer
// @supportURL   https://github.com/zhujunsan/cursor-dashboard-usage-viewer/issues
// @updateURL    https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js
// @run-at       document-end
// @grant        none
// @icon         https://cursor.com/favicon.ico
// ==/UserScript==

(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────

  const ROOT_ID = 'cursor-usage-enhancer-root';
  const STYLE_ID = 'cursor-usage-enhancer-style';
  const VERSION = '1.0.6';
  const TAG = '[Cursor Dashboard Usage Viewer]';
  const USAGE_PAGE_RE = /\/dashboard\/usage(?:\/|$|\?)/;
  const MOUNT_TIMEOUT_MS = 10000;
  const REFRESH_RESET_MS = 800;

  const CLS = {
    row: 'border-t border-brand-borders bg-transparent',
    cell: 'px-3 py-2.5 align-baseline',
    cellIndent: 'px-3 py-2.5 pl-6 align-baseline',
  };

  const ON_DEMAND_ROWS = [
    { label: 'Personal On-Demand', getData: (d) => d.individualUsage?.onDemand },
    { label: 'Team On-Demand', getData: (d) => d.teamUsage?.onDemand },
  ];

  const PLAN_SUB_ROWS = [
    { label: 'API', key: 'apiPercentUsed' },
    { label: 'First-party models', key: 'autoPercentUsed' },
    { label: 'Total', key: 'totalPercentUsed' },
  ];

  const USD_FMT = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const USD_NUM = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const STYLES = `
    #${ROOT_ID} .cue-inline {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
    }
    #${ROOT_ID} .cue-pct {
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--text-secondary, #666);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    #${ROOT_ID} .cue-bar {
      position: relative;
      margin-top: 4px;
      height: 4px;
      background: var(--color-dashboard-usage-accent-10, rgba(0, 0, 0, 0.08));
    }
    #${ROOT_ID} .cue-bar__fill {
      height: 100%;
      max-width: 100%;
      background: var(--color-dashboard-usage-accent, #555);
    }
    #${ROOT_ID} .cue-bar__marker {
      position: absolute;
      top: -1px;
      bottom: -1px;
      width: 1px;
      transform: translateX(-50%);
      pointer-events: none;
      z-index: 1;
    }
    #${ROOT_ID} .cue-bar__marker--ok { background: #22c55e; }
    #${ROOT_ID} .cue-bar__marker--over { background: #ef4444; }
    #${ROOT_ID} .cue-refresh-btn { height: 28px; }
    #${ROOT_ID} .cue-status {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--text-secondary, #666);
    }
    #${ROOT_ID} .cue-status--error { color: #ef4444; }
  `;

  // ─── State ─────────────────────────────────────────────────────────────────

  let DEBUG = localStorage.getItem('cue:debug') === '1';
  let latestData = null;
  let mounted = false;
  let cachedColumn = null;
  let cachedTeamId = null;
  let fetchCtrl = null;
  let mountObserver = null;
  let mountTimeout = null;
  let mountRaf = null;
  let spaHooked = false;
  let usagePageKey = '';
  let usagePageCache = false;

  const log = (...args) => { if (DEBUG) console.log(TAG, ...args); };
  const warn = (...args) => { if (DEBUG) console.warn(TAG, ...args); };
  const error = (...args) => console.error(TAG, ...args);

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function calcUsedPct(used, limit) {
    return limit > 0 ? ((used ?? 0) / limit) * 100 : 0;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isUsagePage() {
    const key = `${location.pathname}${location.search}`;
    if (key === usagePageKey) return usagePageCache;
    usagePageKey = key;
    usagePageCache = USAGE_PAGE_RE.test(key);
    return usagePageCache;
  }

  function getRoot() {
    const el = document.getElementById(ROOT_ID);
    return el?.isConnected ? el : null;
  }

  function readTeamIdFromCookie() {
    const match = document.cookie.match(/(?:^|; )team_id=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getTeamId() {
    const current = readTeamIdFromCookie();
    // Re-read when cookie changes (team switch / re-login); keep cache only as a hit.
    if (current !== cachedTeamId) cachedTeamId = current;
    return cachedTeamId;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  // ─── Formatters ────────────────────────────────────────────────────────────

  function formatCents(cents) {
    if (cents == null || Number.isNaN(cents)) return '—';
    return USD_FMT.format(cents / 100);
  }

  function formatCentsNumber(cents) {
    if (cents == null || Number.isNaN(cents)) return '—';
    return USD_NUM.format(cents / 100);
  }

  function formatUsedLimit(used, limit) {
    return `${formatCents(used)} / ${formatCentsNumber(limit)}`;
  }

  function formatPercentValue(pct) {
    return `${(pct ?? 0).toFixed(1)}%`;
  }

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function parseDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatLocalDate(d) {
    if (!d) return '—';
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function formatLocalTime(d) {
    if (!d) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDateRange(start, end) {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate) return '—';
    return `${formatLocalDate(startDate)} - ${formatLocalDate(endDate)} ${formatLocalTime(endDate)}`;
  }

  function getTimeProgress(data) {
    if (!data?.billingCycleStart || !data?.billingCycleEnd) return null;
    return calcTimeProgress(data.billingCycleStart, data.billingCycleEnd);
  }

  function renderMeta(data, timePct = getTimeProgress(data)) {
    const cycle = data.billingCycleStart && data.billingCycleEnd
      ? formatDateRange(data.billingCycleStart, data.billingCycleEnd)
      : '';
    return [
      data.membershipType && capitalize(data.membershipType),
      data.limitType && `Limit: ${capitalize(data.limitType)}`,
      cycle,
      timePct != null && `Time Progress: ${timePct.toFixed(1)}%`,
    ].filter(Boolean).join(' · ');
  }

  // ─── Render: primitives ────────────────────────────────────────────────────

  function calcTimeProgress(start, end, now = Date.now()) {
    const s = parseDate(start)?.getTime();
    const e = parseDate(end)?.getTime();
    if (s == null || e == null || e <= s) return null;
    return Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100));
  }

  function timeMarkerHtml(timePct, usedPct) {
    if (timePct == null) return '';
    const over = (usedPct ?? 0) > timePct;
    const cls = over ? 'cue-bar__marker--over' : 'cue-bar__marker--ok';
    const left = timePct.toFixed(1);
    // Decorative only — textual time progress lives in the meta line for a11y.
    return `<div class="cue-bar__marker ${cls}" style="left:${left}%" aria-hidden="true"></div>`;
  }

  function progressBar(pct, { label = '', timePct } = {}) {
    const v = pct ?? 0;
    const w = Math.min(100, v).toFixed(1);
    const ariaLabel = label ? ` aria-label="${esc(label)}"` : '';
    return `
      <div class="cue-bar">
        <div class="cue-bar__fill" style="width:${w}%"
          role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w}"${ariaLabel}></div>
        ${timeMarkerHtml(timePct, v)}
      </div>
    `;
  }

  function inlineWithPercent(left, pct, { leftClass = '', wrapClass = '' } = {}) {
    return `
      <div class="cue-inline ${wrapClass}">
        <span class="${leftClass}">${left}</span>
        <span class="cue-pct">${formatPercentValue(pct)}</span>
      </div>
    `;
  }

  function amountWithBar(left, pct, { leftClass = '', wrapClass = '', barLabel = '', timePct } = {}) {
    return `${inlineWithPercent(left, pct, { leftClass, wrapClass })}${progressBar(pct, { label: barLabel, timePct })}`;
  }

  function percentWithBar(pct, { barLabel = '', timePct } = {}) {
    return `
      <div class="cue-inline">
        <span></span>
        <span class="cue-pct">${formatPercentValue(pct)}</span>
      </div>
      ${progressBar(pct, { label: barLabel, timePct })}
    `;
  }

  function renderRow(label, valueHtml, { indent = false, labelClass = 'font-medium text-secondary' } = {}) {
    return `
      <tr class="${CLS.row}">
        <td class="${indent ? CLS.cellIndent : CLS.cell}">
          <span class="${labelClass}">${esc(label)}</span>
        </td>
        <td class="${CLS.cell}">${valueHtml}</td>
      </tr>
    `;
  }

  function renderHeader({ showRefresh = true, meta = '', status = '', statusError = false } = {}) {
    const statusCls = statusError ? 'cue-status cue-status--error' : 'cue-status';
    return `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row items-center justify-between">
          <p class="text-md font-medium text-primary">Usage Balance</p>
          ${showRefresh
            ? '<button type="button" data-cue-refresh class="dashboard-outline-button dashboard-outline-button-md cue-refresh-btn">Refresh</button>'
            : ''}
        </div>
        <p data-cue-meta class="tracking-tight text-base text-secondary"${meta ? '' : ' hidden'}>${esc(meta)}</p>
        <p data-cue-status class="${statusCls}"${status ? '' : ' hidden'}>${esc(status)}</p>
      </div>
    `;
  }

  function setStatus(root, message = '', { error: isError = false } = {}) {
    const el = root?.querySelector('[data-cue-status]');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle('cue-status--error', !!isError && !!message);
  }

  function renderTableShell(rowsHtml) {
    return `
      <div class="flex w-full flex-col gap-4">
        <div class="w-full overflow-x-auto">
          <table class="w-full table-fixed border-collapse text-left text-base tabular-nums">
            <thead class="text-base text-secondary">
              <tr>
                <th scope="col" class="px-3 py-2 font-semibold w-[40%]">Item</th>
                <th scope="col" class="px-3 py-2 font-semibold w-[60%]">Used / Limit</th>
              </tr>
            </thead>
            <tbody data-cue-tbody class="text-base">${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ─── Render: rows ──────────────────────────────────────────────────────────

  function renderAmountRow(label, used, limit, { bold = false, usedPct, timePct } = {}) {
    const pct = usedPct ?? calcUsedPct(used, limit);
    const value = amountWithBar(
      formatUsedLimit(used, limit),
      pct,
      { leftClass: 'font-semibold text-primary whitespace-nowrap', barLabel: label, timePct },
    );
    return renderRow(label, value, {
      labelClass: bold ? 'font-semibold text-primary' : 'font-medium text-secondary',
    });
  }

  function renderPercentSubRow(label, pct, timePct) {
    return renderRow(label, percentWithBar(pct, { barLabel: label, timePct }), {
      indent: true,
      labelClass: 'text-sm text-secondary',
    });
  }

  function renderPlanIncludedRows(plan, timePct) {
    const breakdown = plan.breakdown;
    const displayUsed = breakdown?.total ?? plan.used;
    const displayLimit = breakdown?.included ?? plan.limit;
    const usedPct = calcUsedPct(displayUsed, displayLimit);
    const parts = [
      inlineWithPercent(
        formatUsedLimit(displayUsed, displayLimit),
        usedPct,
        { leftClass: 'font-semibold text-primary whitespace-nowrap' },
      ),
    ];

    if (breakdown) {
      parts.push(
        `<div class="mt-1 text-sm text-secondary">Included ${formatCents(breakdown.included)} + Bonus ${formatCentsNumber(breakdown.bonus)}</div>`,
      );
    }

    // Cap bar width at 100%, but keep real usedPct for the time-marker color.
    parts.push(progressBar(usedPct, { label: 'Plan Included', timePct }));

    return [
      renderRow('Plan Included', parts.join(''), { labelClass: 'font-semibold text-primary' }),
      ...PLAN_SUB_ROWS.map(({ label, key }) => renderPercentSubRow(label, plan[key], timePct)),
    ].join('');
  }

  function renderRows(data, timePct = getTimeProgress(data)) {
    const rows = [];
    const plan = data.individualUsage?.plan;

    if (plan?.enabled) rows.push(renderPlanIncludedRows(plan, timePct));

    for (const { label, getData } of ON_DEMAND_ROWS) {
      const od = getData(data);
      if (od?.enabled) rows.push(renderAmountRow(label, od.used, od.limit, { bold: true, timePct }));
    }

    return rows.join('')
      || `<tr class="${CLS.row}"><td class="${CLS.cell} text-secondary" colspan="2">No data</td></tr>`;
  }

  function renderPanel(data) {
    const timePct = getTimeProgress(data);
    return `${renderHeader({ meta: renderMeta(data, timePct) })}${renderTableShell(renderRows(data, timePct))}`;
  }

  function renderError(message) {
    return `
      ${renderHeader({
        status: `Failed to load: ${message}`,
        statusError: true,
      })}
    `;
  }

  function updatePanel(root, data) {
    const timePct = getTimeProgress(data);
    const tbody = root.querySelector('[data-cue-tbody]');
    const metaEl = root.querySelector('[data-cue-meta]');
    if (tbody) tbody.innerHTML = renderRows(data, timePct);
    if (metaEl) {
      const meta = renderMeta(data, timePct);
      metaEl.textContent = meta;
      metaEl.hidden = !meta;
    }
    setStatus(root, '');
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  async function fetchUsageSummary() {
    fetchCtrl?.abort();
    fetchCtrl = new AbortController();
    const { signal } = fetchCtrl;

    const teamId = getTeamId();
    if (!teamId) throw new Error('team_id cookie not found');

    const url = `/api/usage-summary?teamId=${encodeURIComponent(teamId)}`;
    log('fetch:', url);

    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: '*/*' },
      signal,
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const data = await res.json();
    log('fetch: ok');
    return data;
  }

  // ─── DOM ───────────────────────────────────────────────────────────────────

  function findUsageColumn() {
    if (cachedColumn?.isConnected) return cachedColumn;

    // Strategy 1: card titled "Included Usage" (exact, then fuzzy).
    const cards = document.querySelectorAll('div.dashboard-card');
    for (const card of cards) {
      const title = card.querySelector('p');
      const text = title?.textContent?.trim() || '';
      if (text === 'Included Usage') {
        const column = card.closest('div.col-span-1');
        if (column) {
          cachedColumn = column;
          return column;
        }
      }
    }
    for (const card of cards) {
      const title = card.querySelector('p');
      const text = (title?.textContent || '').toLowerCase();
      if (text.includes('included') && text.includes('usage')) {
        const column = card.closest('div.col-span-1') || card.parentElement;
        if (column) {
          log('mount: fuzzy Included Usage match →', text.trim());
          cachedColumn = column;
          return column;
        }
      }
    }

    // Strategy 2: usage-looking column with a card/table.
    for (const col of document.querySelectorAll('div.col-span-1.flex.flex-col.gap-6')) {
      if (col.querySelector('div.dashboard-card, table, [role="table"]')) {
        log('mount: fallback column with card/table');
        cachedColumn = col;
        return col;
      }
    }

    // Strategy 3: first matching column shell.
    const any = document.querySelector('div.col-span-1.flex.flex-col.gap-6');
    if (any) {
      log('mount: last-resort column shell');
      cachedColumn = any;
    }
    return any || null;
  }

  function getMountObserverTarget() {
    return document.querySelector('main') || document.body;
  }

  function ensureRootEvents(root) {
    if (root.dataset.eventsBound) return;
    root.dataset.eventsBound = '1';
    root.addEventListener('click', onRootClick);
  }

  async function onRootClick(e) {
    const btn = e.target.closest('[data-cue-refresh]');
    if (!btn || btn.disabled) return;

    const root = getRoot();
    if (!root) return;

    btn.textContent = 'Loading…';
    btn.disabled = true;
    setStatus(root, '');
    try {
      latestData = await fetchUsageSummary();
      if (root.querySelector('[data-cue-tbody]')) {
        updatePanel(root, latestData);
      } else {
        root.innerHTML = renderPanel(latestData);
        ensureRootEvents(root);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        error('refresh failed', err);
        btn.textContent = 'Failed';
        // Keep existing data; surface the failure next to the header.
        setStatus(root, `Refresh failed: ${err.message || 'unknown error'}`, { error: true });
      }
    } finally {
      setTimeout(() => {
        const r = getRoot();
        const next = r?.querySelector('[data-cue-refresh]');
        if (next) {
          next.textContent = 'Refresh';
          next.disabled = false;
        }
      }, REFRESH_RESET_MS);
    }
  }

  function stopMountWatch() {
    mountObserver?.disconnect();
    mountObserver = null;
    if (mountTimeout) {
      clearTimeout(mountTimeout);
      mountTimeout = null;
    }
    if (mountRaf != null) {
      cancelAnimationFrame(mountRaf);
      mountRaf = null;
    }
  }

  function tryMount(errorMessage) {
    const existing = getRoot();
    if (existing && mounted && !errorMessage) return true;

    const column = findUsageColumn();
    if (!column) return false;

    injectStyles();

    let root = existing;
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'dashboard-card flex flex-col gap-4 p-6';
      column.insertBefore(root, column.firstChild);
      log('mounted');
    } else if (root.parentElement !== column) {
      column.insertBefore(root, column.firstChild);
    }

    if (errorMessage) {
      root.removeAttribute('data-events-bound');
      root.innerHTML = renderError(errorMessage);
      ensureRootEvents(root);
    } else if (latestData) {
      if (root.querySelector('[data-cue-tbody]')) {
        updatePanel(root, latestData);
      } else {
        root.innerHTML = renderPanel(latestData);
      }
      ensureRootEvents(root);
    }

    mounted = true;
    stopMountWatch();
    return true;
  }

  function startMountWatch(errorMessage) {
    stopMountWatch();
    if (tryMount(errorMessage)) return;

    mountObserver = new MutationObserver(() => {
      if (mountRaf != null) return;
      mountRaf = requestAnimationFrame(() => {
        mountRaf = null;
        if (tryMount(errorMessage)) stopMountWatch();
      });
    });
    mountObserver.observe(getMountObserverTarget(), { childList: true, subtree: true });

    mountTimeout = setTimeout(() => {
      if (!getRoot()) {
        warn(
          `mount watch timeout after ${MOUNT_TIMEOUT_MS}ms — ` +
          'Included Usage column not found; page layout may have changed',
        );
      }
      stopMountWatch();
    }, MOUNT_TIMEOUT_MS);
  }

  function reset() {
    log('reset');
    fetchCtrl?.abort();
    fetchCtrl = null;
    mounted = false;
    latestData = null;
    cachedColumn = null;
    cachedTeamId = null;
    stopMountWatch();
    document.getElementById(ROOT_ID)?.remove();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async function run() {
    if (!isUsagePage()) return;

    try {
      latestData = await fetchUsageSummary();
      if (!tryMount()) startMountWatch();
    } catch (err) {
      if (err.name === 'AbortError') return;
      error('run failed', err);
      if (!tryMount(err.message)) startMountWatch(err.message);
    }
  }

  function onSpaNav() {
    if (!isUsagePage()) {
      if (getRoot()) reset();
      return;
    }
    if (!getRoot()) run();
  }

  function hookSpaNavigation() {
    if (spaHooked) return;
    spaHooked = true;

    const wrap = (fn) => function (...args) {
      const ret = fn.apply(this, args);
      queueMicrotask(onSpaNav);
      return ret;
    };

    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', onSpaNav);
    log('spa hook installed');
  }

  window.__cursorUsageEnhancer = {
    version: VERSION,
    run,
    reset,
    getState: () => ({ mounted, latestData, root: getRoot() }),
    setDebug: (on) => {
      DEBUG = !!on;
      localStorage.setItem('cue:debug', DEBUG ? '1' : '0');
    },
  };

  log(`script loaded v${VERSION}`);
  injectStyles();
  hookSpaNavigation();
  if (isUsagePage()) run();
})();
