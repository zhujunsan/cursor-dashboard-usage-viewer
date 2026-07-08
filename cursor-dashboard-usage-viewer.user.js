// ==UserScript==
// @name         Cursor Dashboard Usage Viewer
// @namespace    https://github.com/zhujunsan/cursor-dashboard-usage-viewer
// @version      1.0.1
// @description  Display usage balance from Cursor dashboard on the usage page
// @author       San
// @match        https://cursor.com/dashboard
// @match        https://cursor.com/dashboard/*
// @match        https://www.cursor.com/dashboard
// @match        https://www.cursor.com/dashboard/*
// @homepageURL  https://github.com/zhujunsan/cursor-dashboard-usage-viewer
// @supportURL   https://github.com/zhujunsan/cursor-dashboard-usage-viewer/issues
// @updateURL    https://github.com/zhujunsan/cursor-dashboard-usage-viewer/raw/main/cursor-dashboard-usage-viewer.user.js
// @downloadURL  https://github.com/zhujunsan/cursor-dashboard-usage-viewer/raw/main/cursor-dashboard-usage-viewer.user.js
// @run-at       document-end
// @grant        none
// @icon         https://cursor.com/favicon.ico
// ==/UserScript==

(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────

  const ROOT_ID = 'cursor-usage-enhancer-root';
  const STYLE_ID = 'cursor-usage-enhancer-style';
  const VERSION = '1.0.1';
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
    { label: 'Auto', key: 'autoPercentUsed' },
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
      margin-top: 4px;
      height: 4px;
      border-radius: 999px;
      background: var(--bg-quaternary, #ececec);
      overflow: hidden;
    }
    #${ROOT_ID} .cue-bar__fill {
      height: 100%;
      background: var(--text-secondary, #888);
      opacity: 0.8;
      border-radius: 999px;
    }
    #${ROOT_ID} .cue-bar__fill--full { width: 100%; }
    #${ROOT_ID} .cue-refresh-btn { height: 28px; }
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

  function getTeamId() {
    if (cachedTeamId) return cachedTeamId;
    const match = document.cookie.match(/(?:^|; )team_id=([^;]*)/);
    cachedTeamId = match ? decodeURIComponent(match[1]) : null;
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

  function formatLocalDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDateRange(start, end) {
    return `${formatLocalDateTime(start)} — ${formatLocalDateTime(end)}`;
  }

  function renderMeta(data) {
    const cycle = data.billingCycleStart && data.billingCycleEnd
      ? formatDateRange(data.billingCycleStart, data.billingCycleEnd)
      : '';
    return [
      data.membershipType,
      data.limitType && `limit: ${data.limitType}`,
      cycle,
    ].filter(Boolean).join(' · ');
  }

  // ─── Render: primitives ────────────────────────────────────────────────────

  function progressBarTrack(pct, label = '') {
    const v = pct ?? 0;
    const w = v.toFixed(1);
    const ariaLabel = label ? ` aria-label="${esc(label)}"` : '';
    return `
      <div class="cue-bar">
        <div class="cue-bar__fill" style="width:${w}%"
          role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w}"${ariaLabel}></div>
      </div>
    `;
  }

  function progressBarFull(label = '') {
    const ariaLabel = label ? ` aria-label="${esc(label)}"` : '';
    return `
      <div class="cue-bar">
        <div class="cue-bar__fill cue-bar__fill--full"
          role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"${ariaLabel}></div>
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

  function amountWithBar(left, pct, { full = false, leftClass = '', wrapClass = '', barLabel = '' } = {}) {
    const bar = full ? progressBarFull(barLabel) : progressBarTrack(pct, barLabel);
    return `${inlineWithPercent(left, pct, { leftClass, wrapClass })}${bar}`;
  }

  function percentWithBar(pct, { full = false, barLabel = '' } = {}) {
    const bar = full ? progressBarFull(barLabel) : progressBarTrack(pct, barLabel);
    return `
      <div class="cue-inline">
        <span></span>
        <span class="cue-pct">${formatPercentValue(pct)}</span>
      </div>
      ${bar}
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

  function renderHeader({ showRefresh = true, meta = '' } = {}) {
    return `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row items-center justify-between">
          <p class="text-md font-medium text-primary">Usage Balance</p>
          ${showRefresh
            ? '<button type="button" data-cue-refresh class="dashboard-outline-button dashboard-outline-button-md cue-refresh-btn">Refresh</button>'
            : ''}
        </div>
        <p data-cue-meta class="tracking-tight text-base text-secondary"${meta ? '' : ' hidden'}>${esc(meta)}</p>
      </div>
    `;
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

  function renderAmountRow(label, used, limit, { bold = false, usedPct } = {}) {
    const pct = usedPct ?? calcUsedPct(used, limit);
    const value = amountWithBar(
      formatUsedLimit(used, limit),
      pct,
      { leftClass: 'font-semibold text-primary whitespace-nowrap', barLabel: label },
    );
    return renderRow(label, value, {
      labelClass: bold ? 'font-semibold text-primary' : 'font-medium text-secondary',
    });
  }

  function renderPercentSubRow(label, pct) {
    return renderRow(label, percentWithBar(pct, { barLabel: label }), {
      indent: true,
      labelClass: 'text-sm text-secondary',
    });
  }

  function renderPlanIncludedRows(plan) {
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

    parts.push(progressBarFull('Plan Included'));

    return [
      renderRow('Plan Included', parts.join(''), { labelClass: 'font-semibold text-primary' }),
      ...PLAN_SUB_ROWS.map(({ label, key }) => renderPercentSubRow(label, plan[key])),
    ].join('');
  }

  function renderRows(data) {
    const rows = [];
    const plan = data.individualUsage?.plan;

    if (plan?.enabled) rows.push(renderPlanIncludedRows(plan));

    for (const { label, getData } of ON_DEMAND_ROWS) {
      const od = getData(data);
      if (od?.enabled) rows.push(renderAmountRow(label, od.used, od.limit, { bold: true }));
    }

    return rows.join('')
      || `<tr class="${CLS.row}"><td class="${CLS.cell} text-secondary" colspan="2">No data</td></tr>`;
  }

  function renderPanel(data) {
    return `${renderHeader({ meta: renderMeta(data) })}${renderTableShell(renderRows(data))}`;
  }

  function renderError(message) {
    return `
      ${renderHeader({ showRefresh: false })}
      <p class="text-base text-secondary">Failed to load: ${esc(message)}</p>
    `;
  }

  function updatePanel(root, data) {
    const tbody = root.querySelector('[data-cue-tbody]');
    const metaEl = root.querySelector('[data-cue-meta]');
    if (tbody) tbody.innerHTML = renderRows(data);
    if (metaEl) {
      const meta = renderMeta(data);
      metaEl.textContent = meta;
      metaEl.hidden = !meta;
    }
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

    for (const card of document.querySelectorAll('div.dashboard-card')) {
      const title = card.querySelector('p');
      if (title?.textContent === 'Included Usage') {
        const column = card.closest('div.col-span-1');
        if (column) {
          cachedColumn = column;
          return column;
        }
      }
    }

    for (const col of document.querySelectorAll('div.col-span-1.flex.flex-col.gap-6')) {
      if (col.querySelector('div.dashboard-card, table, [role="table"]')) {
        cachedColumn = col;
        return col;
      }
    }

    const any = document.querySelector('div.col-span-1.flex.flex-col.gap-6');
    if (any) cachedColumn = any;
    return any;
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
      if (tryMount(errorMessage)) stopMountWatch();
    });
    mountObserver.observe(getMountObserverTarget(), { childList: true, subtree: true });

    mountTimeout = setTimeout(() => {
      if (!getRoot()) warn('mount watch timeout');
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
