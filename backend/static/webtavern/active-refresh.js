(function () {
  const TOKEN_KEY = 'webtavern-token';
  const API_BASE = '/api/v1';
  const REFRESH_INTERVAL_MS = 5000;
  const IDLE_AFTER_USER_ACTION_MS = 2500;

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
  function formatDateTimeRangeRu(start, end) {
    const left = formatDateTimeRu(start);
    const right = formatDateTimeRu(end);
    if (!left && !right) return '';
    if (!right) return left;
    return `${left} — ${right}`;
  }
  function formatMoney(amount, currency) {
    const value = Number(amount || 0);
    if (!value) return 'Не требуется';
    return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'RUB'}`;
  }
  function bookingStatusLabel(status) {
    switch (status) {
      case 'hold': return 'Зарезервировано';
      case 'pending_confirmation': return 'Ждёт подтверждения';
      case 'waiting_for_payment': return 'Ожидает оплаты';
      case 'paid': return 'Оплачено';
      case 'confirmed': return 'Подтверждено';
      case 'cancelled': return 'Отменено';
      case 'completed': return 'Завершено';
      case 'no_show': return 'Неявка';
      default: return status || 'Не указан';
    }
  }
  function bookingStatusClass(status) {
    if (['confirmed', 'paid', 'completed'].includes(status)) return 'status-chip status-chip-success';
    if (['cancelled', 'no_show'].includes(status)) return 'status-chip status-chip-danger';
    if (['waiting_for_payment', 'pending_confirmation', 'hold'].includes(status)) return 'status-chip status-chip-warning';
    return 'status-chip';
  }
  function paymentStatusLabel(status) {
    switch (status) {
      case 'pending': return 'Ожидает';
      case 'succeeded': return 'Оплачено';
      case 'cancelled': return 'Отменено';
      case 'failed': return 'Ошибка';
      default: return status || 'Не указан';
    }
  }
  function bookingTablesSummary(booking) {
    const tables = Array.isArray(booking.tables_detail) && booking.tables_detail.length ? booking.tables_detail : [];
    if (tables.length) return tables.map((table) => table.name).join(', ');
    return booking.table_name || booking.table || 'Стол не указан';
  }
  function bookingTablesCapacityText(booking) {
    const tables = Array.isArray(booking.tables_detail) && booking.tables_detail.length ? booking.tables_detail : [];
    const total = tables.reduce((sum, table) => sum + Number(table.seats_count || 0), 0) || Number(booking.table_seats_count || 0);
    return total ? `${total} мест` : 'Вместимость не указана';
  }
  function bookingPaymentSummary(booking) {
    const amount = booking.required_deposit_amount ?? booking.payment_amount ?? 0;
    const currency = booking.required_deposit_currency || booking.payment_currency || 'RUB';
    const text = formatMoney(amount, currency);
    if (booking.status === 'waiting_for_payment') return `${text} · ожидает оплаты`;
    if (['paid', 'confirmed', 'completed'].includes(booking.status) && Number(amount || 0) > 0) return `${text} · оплачено/принято`;
    return text;
  }
  function bookingNeedsPayment(booking) {
    return booking && booking.status === 'waiting_for_payment' && Number(booking.required_deposit_amount || booking.payment_amount || 0) > 0;
  }
  function isPastBooking(booking) {
    const terminalStatuses = new Set(['cancelled', 'completed', 'no_show']);
    if (terminalStatuses.has(booking.status)) return true;
    const bookingEnd = booking.booking_end ? new Date(booking.booking_end) : null;
    if (!bookingEnd || Number.isNaN(bookingEnd.getTime())) return false;
    return bookingEnd.getTime() < Date.now();
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
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }
  function dispatchChange(selector) {
    const element = qs(selector);
    if (!element || element.disabled) return false;
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

  async function startBookingPaymentFlow(bookingId) {
    const payment = await apiRequest('/payments/initialize/', { method: 'POST', body: { booking: Number(bookingId), provider: 'demo' } });
    if (payment && payment.id) {
      return apiRequest(`/payments/${payment.id}/simulate-success/`, { method: 'POST', body: {} });
    }
    return payment;
  }

  function renderAccountBookings(items) {
    const summary = qs('#account-bookings-summary');
    const activeRoot = qs('#account-active-bookings');
    const pastRoot = qs('#account-past-bookings');
    const message = qs('#account-bookings-message');
    const error = qs('#account-bookings-error');
    if (!summary || !activeRoot || !pastRoot) return false;

    const activeItems = items.filter((booking) => !isPastBooking(booking)).sort((a, b) => new Date(a.booking_start) - new Date(b.booking_start));
    const pastItems = items.filter((booking) => isPastBooking(booking)).sort((a, b) => new Date(b.booking_start) - new Date(a.booking_start));
    summary.innerHTML = `
      <div class="subcard"><span class="info-label">Всего броней</span><strong>${items.length}</strong></div>
      <div class="subcard"><span class="info-label">Актуальные</span><strong>${activeItems.length}</strong></div>
      <div class="subcard"><span class="info-label">Прошлые</span><strong>${pastItems.length}</strong></div>
    `;

    const bookingCardHtml = (booking, active) => `
      <article class="subcard booking-card" data-live-booking-id="${escapeHtml(booking.id)}" data-live-booking-status="${escapeHtml(booking.status)}">
        <div class="booking-card-head">
          <div>
            <h3 class="subcard-title">${escapeHtml(booking.venue_name)} · ${escapeHtml(bookingTablesSummary(booking))}</h3>
            <p class="muted-block">${escapeHtml(formatDateTimeRangeRu(booking.booking_start, booking.booking_end))}</p>
          </div>
          <span class="${bookingStatusClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
        </div>
        <div class="compact-definition-list top-gap">
          <div><span>Зал</span><strong>${escapeHtml(booking.hall_name || 'Не указан')}</strong></div>
          <div><span>Столы</span><strong>${escapeHtml(bookingTablesSummary(booking))} · ${escapeHtml(bookingTablesCapacityText(booking))}</strong></div>
          <div><span>Гостей</span><strong>${escapeHtml(booking.guests_count || 1)}</strong></div>
          <div><span>Оплата</span><strong>${escapeHtml(bookingPaymentSummary(booking))}</strong></div>
          <div><span>Комментарий</span><strong>${escapeHtml(booking.customer_comment || 'Не указан')}</strong></div>
        </div>
        ${booking.status === 'waiting_for_payment' ? '<p class="muted-block top-gap"><strong>Оплата:</strong> бронь подтверждена менеджером и ожидает предоплату от клиента.</p>' : ''}
        ${active ? `
          <div class="button-row top-gap">
            <a class="button button-secondary" href="/venues/${encodeURIComponent((booking.venue_slug || '').trim() || '')}/">Открыть заведение</a>
            ${bookingNeedsPayment(booking) ? `<button class="button button-primary account-live-booking-pay" type="button" data-id="${escapeHtml(booking.id)}">Оплатить бронь</button>` : ''}
            ${!['cancelled', 'completed', 'no_show'].includes(booking.status) ? `<button class="button button-secondary account-live-booking-cancel" type="button" data-id="${escapeHtml(booking.id)}">Отменить бронь</button>` : ''}
          </div>` : ''}
      </article>
    `;

    activeRoot.innerHTML = activeItems.length
      ? activeItems.map((booking) => bookingCardHtml(booking, true)).join('')
      : '<article class="subcard"><h3 class="subcard-title">Актуальных броней пока нет</h3><p>Когда вы забронируете стол на будущее время, бронь появится здесь.</p></article>';
    pastRoot.innerHTML = pastItems.length
      ? pastItems.map((booking) => bookingCardHtml(booking, false)).join('')
      : '<article class="subcard"><h3 class="subcard-title">История пока пустая</h3><p>Здесь появятся завершённые и отменённые брони.</p></article>';

    qsa('.account-live-booking-pay', activeRoot).forEach((button) => {
      button.addEventListener('click', async function () {
        const bookingId = button.getAttribute('data-id');
        button.disabled = true;
        if (message) message.classList.add('hidden');
        if (error) error.classList.add('hidden');
        try {
          await startBookingPaymentFlow(bookingId);
          if (message) { message.textContent = 'Предоплата внесена успешно. Статус брони обновлён.'; message.classList.remove('hidden'); }
          await refreshAccountBookings();
          await refreshAccountPayments();
        } catch (err) {
          if (error) { error.textContent = err.message || 'Не удалось провести оплату.'; error.classList.remove('hidden'); }
        } finally {
          button.disabled = false;
        }
      });
    });
    qsa('.account-live-booking-cancel', activeRoot).forEach((button) => {
      button.addEventListener('click', async function () {
        const bookingId = button.getAttribute('data-id');
        if (!window.confirm('Отменить бронь?')) return;
        button.disabled = true;
        if (message) message.classList.add('hidden');
        if (error) error.classList.add('hidden');
        try {
          await apiRequest(`/bookings/${bookingId}/cancel/`, { method: 'POST', body: {} });
          if (message) { message.textContent = 'Бронь отменена. Список обновлён.'; message.classList.remove('hidden'); }
          await refreshAccountBookings();
          await refreshAccountPayments();
        } catch (err) {
          if (error) { error.textContent = err.message || 'Не удалось отменить бронь.'; error.classList.remove('hidden'); }
        } finally {
          button.disabled = false;
        }
      });
    });
    return true;
  }

  async function refreshAccountBookings() {
    if (pageId() !== 'account' || !qs('#account-active-bookings')) return;
    if (isEditableElement(document.activeElement)) return;
    try {
      const bookings = await apiRequest('/bookings/?scope=mine');
      renderAccountBookings(Array.isArray(bookings) ? bookings : []);
      document.body.setAttribute('data-bookings-live-updated-at', new Date().toISOString());
    } catch (_) {}
  }

  async function refreshAccountPayments() {
    if (pageId() !== 'account' || !qs('#account-payments-list')) return;
    if (typeof window.WebTavernRefreshAccountPayments === 'function') {
      window.WebTavernRefreshAccountPayments();
      return;
    }
    clickIfReady('#account-payments-refresh');
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
  function refreshManagerBookings() {
    if (pageId() !== 'manager') return;
    if (typeof window.WebTavernRefreshManagerBookings === 'function') {
      window.WebTavernRefreshManagerBookings();
      return;
    }
    dispatchChange('#manager-bookings-status-filter');
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
      refreshAccountBookings().catch(() => {});
      refreshAccountPayments().catch(() => {});
      refreshHeaderBadge();
      return;
    }
    if (page === 'notifications') {
      if (window.WebTavernNotificationsCompact && typeof window.WebTavernNotificationsCompact.scheduleReload === 'function') {
        window.WebTavernNotificationsCompact.scheduleReload(900);
      } else {
        clickIfReady('#notifications-refresh');
      }
      return;
    }
    if (page === 'manager') {
      refreshManagerBookings();
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
      }, 700);
    }
  }

  let running = false;
  let lastUserActionAt = 0;
  ['keydown', 'input', 'change', 'submit', 'pointerdown'].forEach((eventName) => {
    document.addEventListener(eventName, () => { lastUserActionAt = Date.now(); }, true);
  });
  document.addEventListener('click', (event) => {
    if (event.isTrusted) lastUserActionAt = Date.now();
  }, true);

  window.addEventListener('focus', () => { window.setTimeout(tick, 500); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.setTimeout(tick, 500); });
  document.addEventListener('DOMContentLoaded', () => {
    if (pageId() !== 'notifications') refreshHeaderBadge();
    window.setTimeout(tick, 1200);
    window.setInterval(tick, REFRESH_INTERVAL_MS);
  });
})();