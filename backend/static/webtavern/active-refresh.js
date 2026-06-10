(function () {
  const TOKEN_KEY = 'webtavern-token';
  const API_BASE = '/api/v1';
  const REFRESH_INTERVAL_MS = 7000;
  const IDLE_AFTER_USER_ACTION_MS = 4500;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function pageId() { return document.body.getAttribute('data-page') || ''; }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function formatDateTimeRu(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function isEditableElement(element) {
    if (!element) return false;
    if (element.closest && element.closest('[data-no-active-refresh]')) return true;
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      const type = String(element.type || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden'].includes(type);
    }
    return Boolean(element.isContentEditable);
  }
  function shouldSkipRefresh() {
    if (document.hidden) return true;
    if (Date.now() - lastUserActionAt < IDLE_AFTER_USER_ACTION_MS) return true;
    if (isEditableElement(document.activeElement)) return true;
    return false;
  }
  async function apiRequest(path, options) {
    const token = getToken();
    const response = await fetch(`${API_BASE}${path}`, {
      method: options?.method || 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Token ${token}` } : {})
      },
      body: options?.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) throw new Error(payload?.detail || payload?.error || `Request failed: ${response.status}`);
    return payload;
  }
  function clickIfReady(selector) {
    const button = qs(selector);
    if (!button || button.disabled || button.offsetParent === null) return false;
    button.click();
    return true;
  }
  function dispatchChange(selector) {
    const element = qs(selector);
    if (!element || element.disabled || element.offsetParent === null) return false;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function updateNotificationBadge(count) {
    const badge = qs('#header-notification-badge');
    if (!badge) return;
    const value = Number(count || 0);
    badge.textContent = String(value);
    badge.classList.toggle('hidden', value <= 0);
  }
  async function refreshHeaderBadge() {
    if (!getToken()) return updateNotificationBadge(0);
    try {
      const summary = await apiRequest('/notifications/summary/');
      updateNotificationBadge(summary.unread_total || 0);
    } catch (_) {}
  }
  function renderManagerAuditLog(items) {
    const list = qs('#manager-audit-log-list');
    const empty = qs('#manager-audit-log-empty');
    if (!list) return;
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    list.innerHTML = items.map((item) => `
      <article class="card compact-card">
        <div class="review-card-meta">
          <div>
            <div class="eyebrow-row">
              <span class="pill">${escapeHtml(item.venue_name || '')}</span>
              <span class="pill muted-chip">Бронь #${escapeHtml(item.booking_id || item.booking || '')}</span>
            </div>
            <h3>${escapeHtml(item.actor_name || 'Система')}</h3>
          </div>
          <span class="pill muted-chip">${escapeHtml(formatDateTimeRu(item.created_at))}</span>
        </div>
        <p><strong>${escapeHtml(item.action || '')}</strong>${item.details ? ` — ${escapeHtml(item.details)}` : ''}</p>
      </article>
    `).join('');
  }
  async function refreshManagerOverview() {
    if (!qs('#manager-dashboard')) return;
    const overview = await apiRequest('/manager/overview/');
    const summary = qs('#manager-overview-summary');
    if (summary) {
      summary.textContent = `Непрочитанных уведомлений: ${overview.notifications_unread_total || 0}. Ждут подтверждения: ${overview.pending_confirmation_total || 0}. Ближайшие 2 часа: ${overview.next_two_hours_total || 0}.`;
    }
    renderManagerAuditLog(overview.action_logs || []);
  }
  async function refreshOwnerOverview() {
    if (!qs('#owner-dashboard')) return;
    const overview = await apiRequest('/owner/overview/');
    const ownerSummary = qs('#owner-summary');
    if (ownerSummary) {
      ownerSummary.innerHTML = `
        <div><span>Черновики</span><strong>${escapeHtml(overview.draft_total || 0)}</strong></div>
        <div><span>На модерации</span><strong>${escapeHtml(overview.pending_total || 0)}</strong></div>
        <div><span>Опубликовано</span><strong>${escapeHtml(overview.published_total || 0)}</strong></div>
      `;
    }
    const analyticsCaption = qs('#owner-analytics-caption');
    if (analyticsCaption) analyticsCaption.textContent = `Обновлено автоматически: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    const analyticsSummary = qs('#owner-analytics-summary');
    if (analyticsSummary) {
      analyticsSummary.innerHTML = `
        <div><span>Всего заведений</span><strong>${escapeHtml(overview.venues_total || 0)}</strong></div>
        <div><span>Активные брони</span><strong>${escapeHtml(overview.open_bookings_total || 0)}</strong></div>
        <div><span>Завершено за 30 дней</span><strong>${escapeHtml(overview.completed_last_30_days || 0)}</strong></div>
        <div><span>Неявки за 30 дней</span><strong>${escapeHtml(overview.no_show_last_30_days || 0)}</strong></div>
        <div><span>Средний рейтинг</span><strong>${Number(overview.average_rating || 0).toFixed(1)}</strong></div>
      `;
    }
  }
  function triggerPageRefresh() {
    const page = pageId();
    if (page === 'account') {
      clickIfReady('#account-bookings-refresh');
      clickIfReady('#account-payments-refresh');
      refreshHeaderBadge();
      return;
    }
    if (page === 'notifications') {
      clickIfReady('#notifications-refresh');
      refreshHeaderBadge();
      return;
    }
    if (page === 'manager') {
      dispatchChange('#manager-bookings-status-filter');
      refreshManagerOverview().catch(() => {});
      refreshHeaderBadge();
      return;
    }
    if (page === 'owner') {
      refreshOwnerOverview().catch(() => {});
      refreshHeaderBadge();
      return;
    }
    if (page === 'platform-admin') {
      refreshHeaderBadge();
      return;
    }
    if (page === 'venue-manage') {
      refreshOwnerOverview().catch(() => {});
      refreshHeaderBadge();
      return;
    }
    refreshHeaderBadge();
  }
  function markAutoRefreshStatus(value) {
    document.body.setAttribute('data-active-refresh', value ? 'true' : 'false');
  }
  async function tick() {
    if (!getToken() || shouldSkipRefresh() || running) return;
    running = true;
    markAutoRefreshStatus(true);
    try { triggerPageRefresh(); } finally {
      window.setTimeout(() => {
        running = false;
        markAutoRefreshStatus(false);
      }, 600);
    }
  }

  let running = false;
  let lastUserActionAt = 0;
  ['click', 'keydown', 'input', 'change', 'submit', 'pointerdown'].forEach((eventName) => {
    document.addEventListener(eventName, () => { lastUserActionAt = Date.now(); }, true);
  });

  window.addEventListener('focus', () => { window.setTimeout(tick, 700); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.setTimeout(tick, 700); });
  document.addEventListener('DOMContentLoaded', () => {
    refreshHeaderBadge();
    window.setInterval(tick, REFRESH_INTERVAL_MS);
  });
})();
