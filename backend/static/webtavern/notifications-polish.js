(function () {
  const TOKEN_KEY = 'webtavern-token';
  const API_BASE = '/api/v1';
  const pageId = document.body ? document.body.getAttribute('data-page') : '';
  if (pageId !== 'notifications') return;

  let rendering = false;
  let reloadTimer = null;
  let readMarkedOnce = false;
  let observerStarted = false;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }

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

  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Token ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { payload = null; }
    }
    if (!response.ok) throw new Error(payload?.detail || payload?.error || `Request failed: ${response.status}`);
    return payload;
  }

  function notificationEventLabel(eventType) {
    switch (eventType) {
      case 'booking_hold_created': return 'Резерв';
      case 'booking_created': return 'Новая бронь';
      case 'booking_confirmed': return 'Подтверждение';
      case 'booking_cancelled': return 'Отмена';
      case 'booking_rescheduled': return 'Перенос';
      case 'payment_succeeded': return 'Оплата успешна';
      case 'payment_cancelled': return 'Оплата отменена';
      case 'review_created': return 'Новый отзыв';
      case 'review_reply': return 'Ответ на отзыв';
      case 'review_liked': return 'Лайк на отзыв';
      case 'venue_moderation': return 'Модерация';
      case 'notification_test': return 'Тест';
      default: return eventType || 'Событие';
    }
  }

  function deliveryStatusLabel(status) {
    switch (status) {
      case 'sent': return 'Отправлено';
      case 'failed': return 'Ошибка';
      case 'skipped': return 'Пропущено';
      default: return status || 'Неизвестно';
    }
  }

  function deliveryChannelLabel(channel) {
    switch (channel) {
      case 'email': return 'Email';
      case 'sms': return 'SMS';
      default: return channel || 'Канал';
    }
  }

  function updateHeaderBadge(count) {
    const badge = qs('#header-notification-badge');
    if (!badge) return;
    const value = Number(count || 0);
    badge.textContent = String(value);
    badge.classList.toggle('hidden', value <= 0);
  }

  function selectedParams() {
    const params = new URLSearchParams();
    const readFilter = qs('#notifications-read-filter');
    const typeFilter = qs('#notifications-type-filter');
    const venueFilter = qs('#notifications-venue-filter');
    if (readFilter && readFilter.value) params.set('is_read', readFilter.value);
    if (typeFilter && typeFilter.value) params.set('event_type', typeFilter.value);
    if (venueFilter && venueFilter.value) params.set('venue', venueFilter.value);
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  function renderSummary(summaryData) {
    const root = qs('#notifications-summary');
    if (!root) return;
    const deliveries = summaryData.deliveries || {};
    root.innerHTML = `
      <div><span>Непрочитанные</span><strong>${escapeHtml(summaryData.unread_total || 0)}</strong></div>
      <div><span>Сегодня</span><strong>${escapeHtml(summaryData.today_total || 0)}</strong></div>
      <div><span>Всего</span><strong>${escapeHtml(summaryData.all_total || 0)}</strong></div>
      <div><span>Email отправлено</span><strong>${escapeHtml(deliveries.email_sent || 0)}</strong></div>
      <div><span>SMS отправлено</span><strong>${escapeHtml(deliveries.sms_sent || 0)}</strong></div>
      <div><span>Ошибки каналов</span><strong>${escapeHtml((deliveries.email_failed || 0) + (deliveries.sms_failed || 0))}</strong></div>
    `;
    updateHeaderBadge(summaryData.unread_total || 0);
  }

  function notificationCard(item) {
    return `
      <article class="compact-card notification-card${item.is_read ? ' is-read' : ''}${item.target_url ? ' notification-card-clickable' : ''}" data-main-notification-card="${escapeHtml(item.id)}" data-target-url="${escapeHtml(item.target_url || '/notifications/')}">
        <div class="notification-card-head">
          <div class="eyebrow-row">
            <span class="pill muted-chip">${escapeHtml(item.venue_name || 'Система')}</span>
            <span class="pill muted-chip">${escapeHtml(notificationEventLabel(item.event_type))}</span>
            ${item.is_read ? '<span class="pill muted-chip">Прочитано</span>' : '<span class="pill pill-rating">Новое</span>'}
          </div>
          <span class="muted-block">${escapeHtml(formatDateTimeRu(item.created_at))}</span>
        </div>
        <h3>${escapeHtml(item.title || 'Уведомление')}</h3>
        <p>${escapeHtml(item.message || '')}</p>
        ${item.target_url ? `<div class="button-row top-gap"><a class="button button-secondary" href="${escapeHtml(item.target_url)}">Открыть</a></div>` : ''}
      </article>
    `;
  }

  function renderNotifications(items) {
    const list = qs('#notifications-list');
    const empty = qs('#notifications-empty');
    const caption = qs('#notifications-caption');
    if (!list) return;

    const sorted = [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (!sorted.length) {
      list.innerHTML = '';
      if (caption) caption.textContent = 'Уведомлений пока нет.';
      if (empty) show(empty);
      return;
    }

    if (empty) hide(empty);
    const unread = sorted.filter((item) => !item.is_read);
    const visible = unread.length ? unread.slice(0, 10) : sorted.slice(0, 5);
    const visibleIds = new Set(visible.map((item) => item.id));
    const hidden = sorted.filter((item) => !visibleIds.has(item.id));

    if (caption) {
      caption.textContent = unread.length
        ? `Показаны последние ${visible.length} непрочитанных уведомлений. Остальные скрыты.`
        : `Все уведомления прочитаны. Показаны ${visible.length} последних, остальные скрыты.`;
    }

    list.innerHTML = `
      <div class="notifications-compact-visible">
        ${visible.map(notificationCard).join('')}
      </div>
      ${hidden.length ? `
        <details class="notifications-hidden-list">
          <summary>Показать остальные уведомления: ${hidden.length}</summary>
          <div class="page-stack top-gap">${hidden.map(notificationCard).join('')}</div>
        </details>
      ` : ''}
    `;
    list.setAttribute('data-main-notifications-rendered', 'true');

    qsa('[data-main-notification-card]', list).forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, select, textarea, label, summary')) return;
        window.location.href = card.getAttribute('data-target-url') || '/notifications/';
      });
    });
  }

  function deliveryCard(item) {
    const statusClass = item.status === 'sent' ? 'pill-rating' : (item.status === 'failed' ? 'danger-chip' : 'muted-chip');
    return `
      <article class="delivery-card" data-main-delivery-card="true">
        <div class="delivery-card-head">
          <div class="eyebrow-row">
            <span class="pill muted-chip">${escapeHtml(deliveryChannelLabel(item.channel))}</span>
            <span class="pill ${statusClass}">${escapeHtml(deliveryStatusLabel(item.status))}</span>
            <span class="pill muted-chip">${escapeHtml(item.provider || 'provider')}</span>
          </div>
          <span class="muted-block">${escapeHtml(formatDateTimeRu(item.created_at))}</span>
        </div>
        <h3>${escapeHtml(item.notification_title || 'Уведомление')}</h3>
        <p>${escapeHtml(item.notification_message || '')}</p>
        <p class="muted-block">Куда: ${escapeHtml(item.destination || 'не указано')}</p>
        ${item.error ? `<p class="error-text">${escapeHtml(item.error)}</p>` : ''}
      </article>
    `;
  }

  function renderDeliveries(items) {
    const root = qs('#notifications-delivery-list');
    const empty = qs('#notifications-delivery-empty');
    if (!root) return;
    const sorted = [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (!sorted.length) {
      root.innerHTML = '';
      if (empty) show(empty);
      return;
    }
    if (empty) hide(empty);
    const visible = sorted.slice(0, 5);
    const hidden = sorted.slice(5);
    root.innerHTML = `
      <div class="notifications-compact-visible">${visible.map(deliveryCard).join('')}</div>
      ${hidden.length ? `
        <details class="notifications-hidden-list notifications-delivery-hidden">
          <summary>Показать старые Email/SMS отправки: ${hidden.length}</summary>
          <div class="page-stack top-gap">${hidden.map(deliveryCard).join('')}</div>
        </details>
      ` : ''}
    `;
    root.setAttribute('data-main-deliveries-rendered', 'true');
  }

  async function markAllReadOnce(items) {
    if (readMarkedOnce || !items.some((item) => !item.is_read)) return;
    readMarkedOnce = true;
    try {
      await apiRequest('/notifications/mark_all_read/', { method: 'POST', body: {} });
      const summary = await apiRequest(`/notifications/summary/${selectedParams()}`);
      renderSummary(summary);
      updateHeaderBadge(0);
    } catch (_) {}
  }

  async function loadNotifications() {
    const error = qs('#notifications-error');
    if (!getToken()) return;
    if (error) hide(error);
    const suffix = selectedParams();
    try {
      const [itemsPayload, summary] = await Promise.all([
        apiRequest(`/notifications/${suffix}`),
        apiRequest(`/notifications/summary/${suffix}`)
      ]);
      const items = normalizeList(itemsPayload);
      rendering = true;
      renderSummary(summary);
      renderNotifications(items);
      rendering = false;
      await markAllReadOnce(items);
    } catch (err) {
      rendering = false;
      if (error) {
        error.textContent = err.message || 'Не удалось загрузить уведомления.';
        show(error);
      }
    }
  }

  async function loadDeliveries() {
    if (!getToken()) return;
    try {
      const payload = await apiRequest('/notifications/deliveries/');
      rendering = true;
      renderDeliveries(normalizeList(payload));
      rendering = false;
    } catch (_) {
      rendering = false;
    }
  }

  async function loadPreferences() {
    try {
      const prefs = await apiRequest('/notifications/preferences/');
      const prefEmail = qs('#pref-email-enabled');
      const prefSms = qs('#pref-sms-enabled');
      const prefBookingEmail = qs('#pref-booking-email-enabled');
      const prefBookingSms = qs('#pref-booking-sms-enabled');
      if (prefEmail) prefEmail.checked = !!prefs.email_enabled;
      if (prefSms) prefSms.checked = !!prefs.sms_enabled;
      if (prefBookingEmail) prefBookingEmail.checked = !!prefs.booking_email_enabled;
      if (prefBookingSms) prefBookingSms.checked = !!prefs.booking_sms_enabled;
    } catch (_) {}
  }

  async function savePreferences() {
    const prefMessage = qs('#notifications-preferences-message');
    const prefError = qs('#notifications-preferences-error');
    const button = qs('#notifications-save-preferences');
    if (prefMessage) hide(prefMessage);
    if (prefError) hide(prefError);
    const payload = {
      email_enabled: !!qs('#pref-email-enabled')?.checked,
      sms_enabled: !!qs('#pref-sms-enabled')?.checked,
      booking_email_enabled: !!qs('#pref-booking-email-enabled')?.checked,
      booking_sms_enabled: !!qs('#pref-booking-sms-enabled')?.checked
    };
    try {
      if (button) button.disabled = true;
      await apiRequest('/notifications/preferences/', { method: 'PATCH', body: payload });
      if (prefMessage) { prefMessage.textContent = 'Каналы уведомлений сохранены.'; show(prefMessage); }
    } catch (err) {
      if (prefError) { prefError.textContent = err.message || 'Не удалось сохранить каналы уведомлений.'; show(prefError); }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function sendTestChannels() {
    const prefMessage = qs('#notifications-preferences-message');
    const prefError = qs('#notifications-preferences-error');
    const button = qs('#notifications-test-channels');
    if (prefMessage) hide(prefMessage);
    if (prefError) hide(prefError);
    try {
      if (button) button.disabled = true;
      await apiRequest('/notifications/test-channels/', { method: 'POST', body: {} });
      if (prefMessage) { prefMessage.textContent = 'Тестовое уведомление создано. Проверьте журнал отправок ниже.'; show(prefMessage); }
      await reload();
    } catch (err) {
      if (prefError) { prefError.textContent = err.message || 'Не удалось отправить тестовое уведомление.'; show(prefError); }
    } finally {
      if (button) button.disabled = false;
    }
  }

  function cloneAndBind(selector, handler, label) {
    const node = qs(selector);
    if (!node) return;
    const clone = node.cloneNode(true);
    if (label) clone.textContent = label;
    node.replaceWith(clone);
    clone.addEventListener('click', (event) => {
      event.preventDefault();
      handler();
    });
  }

  function bindControls() {
    const warning = qs('#notifications-auth-warning');
    const dashboard = qs('#notifications-dashboard');
    const readAll = qs('#notifications-read-all');
    if (warning) hide(warning);
    if (dashboard) show(dashboard);
    if (readAll) hide(readAll);

    cloneAndBind('#notifications-refresh', reload, 'Обновить список');
    cloneAndBind('#notifications-save-preferences', savePreferences);
    cloneAndBind('#notifications-test-channels', sendTestChannels);

    ['#notifications-read-filter', '#notifications-type-filter', '#notifications-venue-filter'].forEach((selector) => {
      const control = qs(selector);
      if (!control || control.dataset.mainNotificationsBound === 'true') return;
      control.dataset.mainNotificationsBound = 'true';
      control.addEventListener('change', () => loadNotifications());
    });
  }

  function scheduleReload(delay = 180) {
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      reloadTimer = null;
      reload();
    }, delay);
  }

  async function reload() {
    await Promise.all([loadNotifications(), loadDeliveries(), loadPreferences()]);
  }

  function startObserver() {
    const dashboard = qs('#notifications-dashboard');
    if (!dashboard || observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver((mutations) => {
      if (rendering) return;
      const important = mutations.some((mutation) => Array.from(mutation.addedNodes || []).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest && (node.closest('.notifications-hidden-list') || node.closest('[data-main-notification-card]') || node.closest('[data-main-delivery-card]'))) return false;
        const text = String(node.textContent || '').toLowerCase();
        return text.includes('уведом') || text.includes('email') || text.includes('sms') || text.includes('отправ') || text.includes('ошиб');
      }));
      if (important) scheduleReload(140);
    });
    observer.observe(dashboard, { childList: true, subtree: true });
  }

  function start() {
    if (!getToken()) return;
    bindControls();
    startObserver();
    window.setTimeout(reload, 250);
    window.setTimeout(reload, 1000);
    window.setTimeout(reload, 2200);
  }

  window.WebTavernNotificationsCompact = {
    reload,
    scheduleReload,
    loadNotifications,
    loadDeliveries
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
