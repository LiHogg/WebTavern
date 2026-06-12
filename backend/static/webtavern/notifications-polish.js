(function () {
  const TOKEN_KEY = 'webtavern-token';
  const API_BASE = '/api/v1';
  const pageId = document.body ? document.body.getAttribute('data-page') : '';
  if (pageId !== 'notifications') return;

  let isRenderingCompactList = false;
  let reloadTimer = null;
  let observerStarted = false;
  let pageObserverStarted = false;
  let deliveryCompactTimer = null;

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
  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }
  function updateNotificationBadge(count) {
    const badge = qs('#header-notification-badge');
    if (!badge) return;
    const value = Number(count || 0);
    badge.textContent = String(value);
    badge.classList.toggle('hidden', value <= 0);
  }
  async function refreshSummary() {
    const summaryRoot = qs('#notifications-summary');
    try {
      const summary = await apiRequest('/notifications/summary/');
      if (summaryRoot) {
        summaryRoot.innerHTML = `
          <div><span>Непрочитанные</span><strong>${escapeHtml(summary.unread_total || 0)}</strong></div>
          <div><span>Сегодня</span><strong>${escapeHtml(summary.today_total || 0)}</strong></div>
          <div><span>Всего</span><strong>${escapeHtml(summary.all_total || 0)}</strong></div>
        `;
      }
      updateNotificationBadge(summary.unread_total || 0);
    } catch (_) {}
  }
  function renderCompactNotificationCard(item) {
    return `
      <article class="compact-card notification-card${item.is_read ? ' is-read' : ''}${item.target_url ? ' notification-card-clickable' : ''}" id="notification-${escapeHtml(item.id)}" data-compact-notification-card="${escapeHtml(item.id)}" data-target-url="${escapeHtml(item.target_url || '/notifications/')}">
        <div class="notification-card-head">
          <div class="eyebrow-row">
            <span class="pill muted-chip">${escapeHtml(item.venue_name || 'Система')}</span>
            <span class="pill muted-chip">${escapeHtml(notificationEventLabel(item.event_type))}</span>
            ${item.is_read ? '<span class="pill muted-chip">Прочитано</span>' : '<span class="pill pill-rating">Новое</span>'}
          </div>
          <span class="muted-block">${escapeHtml(formatDateTimeRu(item.created_at) || '')}</span>
        </div>
        <h3>${escapeHtml(item.title || 'Уведомление')}</h3>
        <p>${escapeHtml(item.message || '')}</p>
        ${item.target_url ? `<div class="button-row top-gap"><a class="button button-secondary" href="${escapeHtml(item.target_url)}" data-compact-notification-open="${escapeHtml(item.id)}">Открыть</a></div>` : ''}
      </article>
    `;
  }
  function bindOpenHandlers(root) {
    qsa('[data-compact-notification-card]', root).forEach((card) => {
      if (card.dataset.compactBound === 'true') return;
      card.dataset.compactBound = 'true';
      card.addEventListener('click', async function (event) {
        if (event.target.closest('a, button, input, select, textarea, label, summary')) return;
        const targetUrl = card.getAttribute('data-target-url') || '/notifications/';
        window.location.href = targetUrl;
      });
    });
  }
  function renderCompactList(notifications) {
    const listRoot = qs('#notifications-list');
    const empty = qs('#notifications-empty');
    const caption = qs('#notifications-caption');
    if (!listRoot) return;

    const items = [...notifications].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    isRenderingCompactList = true;
    try {
      if (!items.length) {
        listRoot.innerHTML = '';
        listRoot.setAttribute('data-notifications-compact-rendered', 'true');
        if (caption) caption.textContent = 'Уведомлений пока нет.';
        if (empty) show(empty);
        return;
      }

      if (empty) hide(empty);
      const unread = items.filter((item) => !item.is_read);
      const visible = unread.length ? unread.slice(0, 10) : items.slice(0, 5);
      const visibleIds = new Set(visible.map((item) => item.id));
      const hiddenItems = items.filter((item) => !visibleIds.has(item.id));
      const modeText = unread.length
        ? `Показаны последние ${visible.length} непрочитанных уведомлений. Остальные скрыты в раскрывающемся списке.`
        : `Все уведомления прочитаны. Показаны ${visible.length} последних, остальные скрыты.`;

      if (caption) caption.textContent = modeText;
      listRoot.innerHTML = `
        <div class="notifications-compact-visible">
          ${visible.map(renderCompactNotificationCard).join('')}
        </div>
        ${hiddenItems.length ? `
          <details class="notifications-hidden-list">
            <summary>Показать остальные уведомления: ${hiddenItems.length}</summary>
            <div class="page-stack top-gap">
              ${hiddenItems.map(renderCompactNotificationCard).join('')}
            </div>
          </details>
        ` : ''}
      `;
      listRoot.setAttribute('data-notifications-compact-rendered', 'true');
      bindOpenHandlers(listRoot);
    } finally {
      window.setTimeout(() => { isRenderingCompactList = false; }, 0);
    }
  }
  async function markVisiblePageAsReadIfNeeded(notifications) {
    const hasUnread = notifications.some((item) => !item.is_read);
    if (!hasUnread) return false;
    try {
      await apiRequest('/notifications/mark_all_read/', { method: 'POST', body: {} });
      await refreshSummary();
      return true;
    } catch (_) {
      return false;
    }
  }
  async function loadCompactNotifications(options = {}) {
    const listRoot = qs('#notifications-list');
    const error = qs('#notifications-error');
    if (!listRoot || !getToken()) return;
    if (error) hide(error);
    try {
      const payload = await apiRequest('/notifications/');
      const notifications = normalizeList(payload);
      renderCompactList(notifications);
      const marked = await markVisiblePageAsReadIfNeeded(notifications);
      if (marked && options.reloadAfterRead !== false) {
        window.setTimeout(() => loadCompactNotifications({ reloadAfterRead: false }), 450);
      }
      scheduleDeliveryCompact(180);
    } catch (err) {
      if (error) {
        error.textContent = err.message || 'Не удалось загрузить уведомления.';
        show(error);
      }
    }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function findDeliverySection() {
    const roots = qsa('section.card, article.card, .card').filter((node) => {
      const text = normalizeText(node.textContent);
      return text.includes('email/sms отправки') || text.includes('журнал доставки') || text.includes('последние отправки');
    });
    return roots.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
  }
  function findDeliveryListRoot(section) {
    if (!section) return null;
    const byId = qsa('[id*="deliver"], [data-deliveries-list]', section)
      .find((node) => qsa('article, .subcard, .compact-card, .delivery-card, [data-delivery-id]', node).length >= 2);
    if (byId) return byId;
    const stacks = qsa('.page-stack, .list-stack, .notifications-list', section)
      .filter((node) => qsa('article, .subcard, .compact-card, .delivery-card, [data-delivery-id]', node).length >= 2);
    if (stacks.length) return stacks.sort((a, b) => b.children.length - a.children.length)[0];
    return section;
  }
  function getDeliveryCards(root) {
    if (!root) return [];
    const nodes = qsa('[data-delivery-id], .delivery-card, .notification-delivery-card, .notification-delivery, article, .subcard', root)
      .filter((node) => !node.closest('.notifications-delivery-hidden') && !node.matches('details, summary'))
      .filter((node) => node !== root)
      .filter((node) => {
        const text = normalizeText(node.textContent);
        return text.includes('email') || text.includes('sms') || text.includes('smtp') || text.includes('smsru') || text.includes('отправ') || text.includes('ошиб');
      });
    return nodes.filter((node, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(node)));
  }
  function compactDeliveryJournal() {
    const section = findDeliverySection();
    const root = findDeliveryListRoot(section);
    if (!root) return;

    qsa('.notifications-delivery-hidden', root).forEach((details) => {
      const nestedCards = qsa('[data-delivery-id], .delivery-card, .notification-delivery-card, .notification-delivery, article, .subcard', details);
      nestedCards.forEach((card) => root.insertBefore(card, details));
      details.remove();
    });

    const cards = getDeliveryCards(root);
    if (cards.length <= 5) {
      root.setAttribute('data-deliveries-compact-rendered', 'true');
      return;
    }

    const hiddenCards = cards.slice(5);
    const details = document.createElement('details');
    details.className = 'notifications-hidden-list notifications-delivery-hidden';
    details.innerHTML = `<summary>Показать старые Email/SMS отправки: ${hiddenCards.length}</summary><div class="page-stack top-gap"></div>`;
    const hiddenRoot = qs('.page-stack', details);
    hiddenCards.forEach((card) => hiddenRoot.appendChild(card));
    const lastVisible = cards[4];
    lastVisible.after(details);
    root.setAttribute('data-deliveries-compact-rendered', 'true');
  }
  function scheduleDeliveryCompact(delay = 120) {
    if (deliveryCompactTimer) window.clearTimeout(deliveryCompactTimer);
    deliveryCompactTimer = window.setTimeout(() => {
      deliveryCompactTimer = null;
      compactDeliveryJournal();
    }, delay);
  }
  function scheduleCompactReload(delay = 180) {
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      reloadTimer = null;
      loadCompactNotifications();
      scheduleDeliveryCompact(220);
    }, delay);
  }
  function startCompactObserver() {
    const listRoot = qs('#notifications-list');
    if (!listRoot || observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver(() => {
      if (isRenderingCompactList) return;
      const hasCompactMarkup = !!qs('.notifications-compact-visible, .notifications-hidden-list', listRoot);
      if (!hasCompactMarkup) scheduleCompactReload(120);
    });
    observer.observe(listRoot, { childList: true, subtree: false });
  }
  function startPageObserver() {
    const dashboard = qs('#notifications-dashboard');
    if (!dashboard || pageObserverStarted) return;
    pageObserverStarted = true;
    const observer = new MutationObserver((mutations) => {
      if (isRenderingCompactList) return;
      const deliveryChanged = mutations.some((mutation) => Array.from(mutation.addedNodes || []).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const text = normalizeText(node.textContent);
        return text.includes('email') || text.includes('sms') || text.includes('отправ') || text.includes('ошиб');
      }));
      if (deliveryChanged) scheduleDeliveryCompact(120);
    });
    observer.observe(dashboard, { childList: true, subtree: true });
  }
  function simplifyNotificationControls() {
    const readAll = qs('#notifications-read-all');
    const refresh = qs('#notifications-refresh');
    if (readAll) hide(readAll);
    if (refresh) {
      const cleanRefresh = refresh.cloneNode(true);
      cleanRefresh.textContent = 'Обновить список';
      refresh.replaceWith(cleanRefresh);
      cleanRefresh.addEventListener('click', function (event) {
        event.preventDefault();
        loadCompactNotifications();
        scheduleDeliveryCompact(220);
      });
    }
  }
  function start() {
    const dashboard = qs('#notifications-dashboard');
    if (!dashboard) return;
    simplifyNotificationControls();
    startCompactObserver();
    startPageObserver();
    window.setTimeout(() => loadCompactNotifications(), 150);
    window.setTimeout(() => loadCompactNotifications(), 900);
    window.setTimeout(() => loadCompactNotifications(), 1800);
    window.setTimeout(() => compactDeliveryJournal(), 350);
    window.setTimeout(() => compactDeliveryJournal(), 1200);
    window.setTimeout(() => compactDeliveryJournal(), 2400);
  }

  window.WebTavernNotificationsCompact = {
    reload: loadCompactNotifications,
    scheduleReload: scheduleCompactReload,
    compactDeliveries: compactDeliveryJournal
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
