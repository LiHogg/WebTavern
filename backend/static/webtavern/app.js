(function () {
  const TOKEN_KEY = 'webtavern-token';
  const USER_KEY = 'webtavern-user';
  const CITY_PREF_KEY = 'webtavern-preferred-city';
  const apiBase = '/api/v1';

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function setText(el, value) { if (el) el.textContent = value; }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function formatPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (!digits.startsWith('7')) digits = `7${digits}`;
    digits = digits.slice(0, 11);
    const local = digits.slice(1);
    let result = '+7';
    if (local.length > 0) result += ` (${local.slice(0, 3)}`;
    if (local.length >= 3) result += ')';
    if (local.length > 3) result += ` ${local.slice(3, 6)}`;
    if (local.length > 6) result += `-${local.slice(6, 8)}`;
    if (local.length > 8) result += `-${local.slice(8, 10)}`;
    return result;
  }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { window.localStorage.removeItem(USER_KEY); return null; }
  }
  function storeSession(token, user) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
  function getPreferredCity() {
    return String(window.localStorage.getItem(CITY_PREF_KEY) || '').trim();
  }
  function setPreferredCity(city) {
    const normalized = String(city || '').trim();
    if (normalized) window.localStorage.setItem(CITY_PREF_KEY, normalized);
    else window.localStorage.removeItem(CITY_PREF_KEY);
  }
  function resolveCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Браузер не поддерживает геолокацию.')); return; }
      navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Не удалось определить геопозицию.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    });
  }
  async function detectCurrentCity() {
    const position = await resolveCurrentPosition();
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    let city = '';
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ru&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, { headers: { 'Accept': 'application/json' } });
      if (response.ok) {
        const payload = await response.json();
        const address = payload.address || {};
        city = address.city || address.town || address.village || address.municipality || address.county || address.state || '';
      }
    } catch (error) {
      city = '';
    }
    return { lat, lng, city: String(city || '').trim() };
  }
  function getMapsConfig() {
    const defaults = { provider: 'yandex', yandexApiKey: '', googleApiKey: '', googleMapId: '', fallback: 'local' };
    const node = qs('#webtavern-maps-config');
    if (!node) return defaults;
    try {
      const payload = JSON.parse(node.textContent || '{}');
      const provider = String(payload.provider || defaults.provider).trim().toLowerCase();
      return {
        provider: ['yandex', 'google', 'local'].includes(provider) ? provider : defaults.provider,
        yandexApiKey: String(payload.yandexApiKey || '').trim(),
        googleApiKey: String(payload.googleApiKey || '').trim(),
        googleMapId: String(payload.googleMapId || '').trim(),
        fallback: 'local'
      };
    } catch (error) {
      return defaults;
    }
  }

  const mapsScriptPromises = {};

  function loadExternalScript(src, key) {
    const cacheKey = key || src;
    if (mapsScriptPromises[cacheKey]) return mapsScriptPromises[cacheKey];
    mapsScriptPromises[cacheKey] = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-webtavern-map-script="${cacheKey}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Не удалось загрузить внешний API карт.')), { once: true });
        if (existing.getAttribute('data-loaded') === 'true') resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-webtavern-map-script', cacheKey);
      script.addEventListener('load', () => { script.setAttribute('data-loaded', 'true'); resolve(); }, { once: true });
      script.addEventListener('error', () => reject(new Error('Не удалось загрузить внешний API карт.')), { once: true });
      document.head.appendChild(script);
    });
    return mapsScriptPromises[cacheKey];
  }

  async function loadYandexMaps(apiKey) {
    if (!apiKey) throw new Error('Для Яндекс.Карт нужен YANDEX_MAPS_API_KEY в .env.');
    if (!window.ymaps) {
      await loadExternalScript(`https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`, 'yandex-maps');
    }
    if (!window.ymaps) throw new Error('Яндекс.Карты не загрузились.');
    await new Promise((resolve) => window.ymaps.ready(resolve));
    return window.ymaps;
  }

  async function loadGoogleMaps(apiKey) {
    if (!apiKey) throw new Error('Для Google Maps нужен GOOGLE_MAPS_API_KEY в .env.');
    if (!window.google || !window.google.maps) {
      await loadExternalScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=ru`, 'google-maps');
    }
    if (!window.google || !window.google.maps) throw new Error('Google Maps не загрузился.');
    return window.google.maps;
  }

  function roleLabel(role) {
    switch (role) {
      case 'owner': return 'Владелец';
      case 'manager': return 'Менеджер';
      case 'moderator': return 'Модератор';
      case 'platform_admin': return 'Администратор платформы';
      default: return 'Клиент';
    }
  }
  function accountTypeLabel(type) {
    return type === 'legal' ? 'Юридическое лицо' : 'Физическое лицо';
  }

  function modeLabel(mode) {
    switch (mode) {
      case 'owner': return 'Владелец';
      case 'manager': return 'Менеджер';
      case 'moderator': return 'Модератор';
      case 'platform_admin': return 'Админ';
      default: return 'Клиент';
    }
  }

  function priceCategoryLabel(value) {
    switch (value) {
      case 'budget': return 'Доступно';
      case 'middle': return 'Средний чек';
      case 'high': return 'Выше среднего';
      case 'premium': return 'Премиум';
      default: return value || 'Не указано';
    }
  }

  function venueThemeLabel(value) {
    switch (value) {
      case 'family': return 'Семейное';
      case 'romantic': return 'Романтика';
      case 'business': return 'Деловое';
      case 'geek': return 'Гик / настолки';
      case 'panoramic': return 'Панорамное';
      case 'ethnic': return 'Этническое';
      case 'art': return 'Арт-пространство';
      case 'lounge': return 'Lounge';
      case 'live_music': return 'Живая музыка';
      case 'fast_casual': return 'Fast casual';
      default: return value || 'Не указано';
    }
  }

  function normalizeHex(value) {
    let v = String(value || '').trim();
    if (!v) return '#000000';
    if (!v.startsWith('#')) v = `#${v}`;
    if (v.length === 4) v = `#${v.slice(1).split('').map((ch) => ch + ch).join('')}`;
    return v.toLowerCase();
  }

  function channelLuminance(hexPair) {
    const numeric = parseInt(hexPair, 16) / 255;
    return numeric <= 0.03928 ? numeric / 12.92 : Math.pow((numeric + 0.055) / 1.055, 2.4);
  }

  function calcContrastRatio(bg, fg) {
    const bgValue = normalizeHex(bg);
    const fgValue = normalizeHex(fg);
    const bgL = 0.2126 * channelLuminance(bgValue.slice(1, 3)) + 0.7152 * channelLuminance(bgValue.slice(3, 5)) + 0.0722 * channelLuminance(bgValue.slice(5, 7));
    const fgL = 0.2126 * channelLuminance(fgValue.slice(1, 3)) + 0.7152 * channelLuminance(fgValue.slice(3, 5)) + 0.0722 * channelLuminance(fgValue.slice(5, 7));
    const lighter = Math.max(bgL, fgL);
    const darker = Math.min(bgL, fgL);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  }

  function buildVenuePageBackground(branding) {
    const accent = branding?.accent_color || '#111827';
    const card = branding?.card_background_color || '#ffffff';
    const variant = branding?.background_variant || 'neutral-surface';
    const dark = branding?.theme_mode === 'dark';

    if (variant === 'graphite-grid') {
      return dark
        ? `radial-gradient(circle at 12% 8%, color-mix(in srgb, ${accent} 32%, transparent) 0, transparent 34%), radial-gradient(circle at 88% 14%, color-mix(in srgb, ${accent} 20%, transparent) 0, transparent 30%), linear-gradient(135deg, #070b14 0%, color-mix(in srgb, ${card} 70%, #030712 30%) 52%, #111827 100%)`
        : `radial-gradient(circle at 12% 8%, color-mix(in srgb, ${accent} 18%, transparent) 0, transparent 30%), linear-gradient(135deg, #f8fafc 0%, color-mix(in srgb, ${card} 88%, #e2e8f0 12%) 100%)`;
    }
    if (variant === 'dark-soft') {
      return `radial-gradient(circle at 18% 12%, color-mix(in srgb, ${accent} 36%, transparent) 0, transparent 38%), radial-gradient(circle at 85% 0%, color-mix(in srgb, ${accent} 22%, transparent) 0, transparent 30%), linear-gradient(180deg, color-mix(in srgb, ${card} 82%, #030712 18%) 0%, #09090f 100%)`;
    }
    if (variant === 'cool-gradient') {
      return `radial-gradient(circle at 8% 10%, color-mix(in srgb, ${accent} 18%, transparent) 0, transparent 32%), linear-gradient(180deg, #f0f9ff 0%, color-mix(in srgb, ${card} 86%, #dbeafe 14%) 48%, #e0f2fe 100%)`;
    }
    if (variant === 'warm-gradient') {
      return `radial-gradient(circle at 12% 10%, color-mix(in srgb, ${accent} 20%, transparent) 0, transparent 32%), linear-gradient(180deg, #fff7ed 0%, color-mix(in srgb, ${card} 84%, #fed7aa 16%) 48%, #f3e7d8 100%)`;
    }
    if (variant === 'pattern-soft') {
      return `radial-gradient(circle at 18px 18px, color-mix(in srgb, ${accent} 12%, transparent) 0 2px, transparent 2px 100%), linear-gradient(180deg, color-mix(in srgb, ${card} 88%, #ffffff 12%) 0%, color-mix(in srgb, ${accent} 10%, ${card} 90%) 100%)`;
    }
    if (variant === 'soft-paper') {
      return `radial-gradient(circle at 12% 6%, color-mix(in srgb, ${accent} 15%, transparent) 0, transparent 30%), linear-gradient(180deg, #fffaf7 0%, color-mix(in srgb, ${card} 90%, #f3e8ff 10%) 100%)`;
    }
    return dark
      ? `linear-gradient(180deg, color-mix(in srgb, ${card} 78%, #030712 22%) 0%, #0f172a 100%)`
      : `linear-gradient(180deg, color-mix(in srgb, ${card} 90%, #ffffff 10%) 0%, color-mix(in srgb, ${accent} 8%, ${card} 92%) 100%)`;
  }

  function applyVenueBrandingVars(root, branding) {
    if (!root || !branding) return;
    root.style.setProperty('--venue-accent', branding.accent_color || '#111827');
    root.style.setProperty('--venue-text', branding.text_color || '#111827');
    root.style.setProperty('--venue-card-bg', branding.card_background_color || '#ffffff');
    root.style.setProperty('--venue-card-text', branding.card_text_color || '#111827');
    root.style.setProperty('--venue-badge-bg', branding.badge_background_color || '#eef2ff');
    root.style.setProperty('--venue-badge-text', branding.badge_text_color || '#312e81');
    root.style.setProperty('--venue-cta-bg', branding.cta_background_color || branding.accent_color || '#111827');
    root.style.setProperty('--venue-cta-text', branding.cta_text_color || '#ffffff');
    root.style.setProperty('--venue-page-bg', buildVenuePageBackground(branding));
    root.style.setProperty('--venue-page-shell', `color-mix(in srgb, ${branding.card_background_color || '#ffffff'} 92%, transparent)`);
    root.style.setProperty('--venue-page-soft', `color-mix(in srgb, ${branding.card_background_color || '#ffffff'} 72%, ${branding.accent_color || '#111827'} 28%)`);
    root.style.setProperty('--venue-page-border', `color-mix(in srgb, ${branding.accent_color || '#111827'} 28%, ${branding.card_background_color || '#ffffff'} 72%)`);
    root.style.setProperty('--venue-page-shadow', branding.theme_mode === 'dark' ? '0 24px 70px rgba(0, 0, 0, 0.36)' : '0 24px 70px rgba(40, 32, 26, 0.14)');
  }

  function applyVenueBrandingToContainer(root, branding) {
    if (!root || !branding) return;
    applyVenueBrandingVars(root, branding);
    root.classList.add('venue-themed-surface');
  }

  function clearVenuePageTheme() {
    document.body.classList.remove('venue-page-themed', 'venue-page-themed-dark');
    document.body.removeAttribute('data-venue-theme-preset');
    ['--venue-accent', '--venue-text', '--venue-card-bg', '--venue-card-text', '--venue-badge-bg', '--venue-badge-text', '--venue-cta-bg', '--venue-cta-text', '--venue-page-bg', '--venue-page-shell', '--venue-page-soft', '--venue-page-border', '--venue-page-shadow'].forEach((name) => {
      document.body.style.removeProperty(name);
    });
  }

  function applyVenueBrandingToPage(branding) {
    if (!branding) return clearVenuePageTheme();
    applyVenueBrandingVars(document.body, branding);
    document.body.classList.add('venue-page-themed');
    document.body.classList.toggle('venue-page-themed-dark', branding.theme_mode === 'dark');
    document.body.setAttribute('data-venue-theme-preset', branding.theme_preset || 'custom');
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
      default: return eventType || 'Событие';
    }
  }

  function updateNotificationBadge(count) {
    const badge = qs('#header-notification-badge');
    if (!badge) return;
    const value = Number(count || 0);
    badge.textContent = String(value);
    badge.classList.toggle('hidden', value <= 0);
  }

  async function refreshNotificationBadge() {
    const token = getToken();
    if (!token) return updateNotificationBadge(0);
    try {
      const summary = await apiRequest('/notifications/summary/', { token });
      updateNotificationBadge(summary.unread_total || 0);
    } catch (err) {
      updateNotificationBadge(0);
    }
  }

  function renderNotificationCard(item, options = {}) {
    const compact = !!options.compact;
    return `
      <article class="compact-card notification-card${item.is_read ? ' is-read' : ''}${item.target_url ? ' notification-card-clickable' : ''}" id="notification-${item.id}" ${item.target_url ? `data-notification-card-open="${item.id}" data-target-url="${escapeHtml(item.target_url)}"` : ''}>
        <div class="notification-card-head">
          <div class="eyebrow-row">
            <span class="pill muted-chip">${escapeHtml(item.venue_name || 'Система')}</span>
            <span class="pill muted-chip">${escapeHtml(notificationEventLabel(item.event_type))}</span>
            ${item.is_read ? '<span class="pill muted-chip">Прочитано</span>' : '<span class="pill pill-rating">Новое</span>'}
          </div>
          <span class="muted-block">${escapeHtml(formatDateTimeRu(item.created_at) || '')}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.message)}</p>
        <div class="button-row top-gap">
          ${item.target_url ? `<a class="button button-primary" href="${item.target_url}" data-notification-open="${item.id}" data-target-url="${item.target_url}">Открыть</a>` : ''}
          ${!item.is_read ? `<button class="button button-secondary" type="button" data-notification-read="${item.id}">Отметить прочитанным</button>` : ''}
        </div>
      </article>`;
  }

  function bindNotificationCardOpenHandlers(root, token, reloadCallback) {
    qsa('[data-notification-card-open]', root).forEach((card) => {
      if (card.dataset.boundOpenCard === 'true') return;
      card.dataset.boundOpenCard = 'true';
      card.addEventListener('click', async function (event) {
        if (event.target.closest('a, button, input, select, textarea, label')) return;
        const notificationId = card.getAttribute('data-notification-card-open');
        const targetUrl = card.getAttribute('data-target-url') || '/notifications/';
        if (notificationId && token) {
          try { await apiRequest(`/notifications/${notificationId}/mark_read/`, { method: 'POST', token, body: {} }); } catch (err) {}
          if (typeof reloadCallback === 'function') await reloadCallback();
        }
        window.location.href = targetUrl;
      });
    });
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

  function renderDeliveryCard(item) {
    const statusClass = item.status === 'sent' ? 'pill-rating' : (item.status === 'failed' ? 'danger-chip' : 'muted-chip');
    return `
      <article class="delivery-card">
        <div class="delivery-card-head">
          <div class="eyebrow-row">
            <span class="pill muted-chip">${escapeHtml(deliveryChannelLabel(item.channel))}</span>
            <span class="pill ${statusClass}">${escapeHtml(deliveryStatusLabel(item.status))}</span>
            <span class="pill muted-chip">${escapeHtml(item.provider || 'provider')}</span>
          </div>
          <span class="muted-block">${escapeHtml(formatDateTimeRu(item.created_at) || '')}</span>
        </div>
        <h3>${escapeHtml(item.notification_title || 'Уведомление')}</h3>
        <p>${escapeHtml(item.notification_message || '')}</p>
        <p class="muted-block">Куда: ${escapeHtml(item.destination || 'не указано')}</p>
        ${item.error ? `<p class="error-text">${escapeHtml(item.error)}</p>` : ''}
      </article>`;
  }

  async function mountNotificationWidgets() {
    const token = getToken();
    if (!token) return;
    const widgets = [
      { list: qs('#account-notifications-list'), empty: qs('#account-notifications-empty'), readAll: qs('#account-notifications-read-all') },
      { list: qs('#manager-notifications-list'), empty: qs('#manager-notifications-empty'), readAll: qs('#manager-notifications-read-all') },
    ].filter((item) => item.list);
    if (!widgets.length) return;

    async function load() {
      try {
        const notifications = await apiRequest('/notifications/?is_read=false', { token });
        await refreshNotificationBadge();
        widgets.forEach(({ list, empty }) => {
          const items = notifications.slice(0, 8);
          if (!items.length) {
            list.innerHTML = '';
            if (empty) show(empty);
            return;
          }
          if (empty) hide(empty);
          list.innerHTML = items.map((item) => renderNotificationCard(item, { compact: true })).join('');
          qsa('[data-notification-read]', list).forEach((button) => {
            button.addEventListener('click', async function () {
              await apiRequest(`/notifications/${button.getAttribute('data-notification-read')}/mark_read/`, { method: 'POST', token, body: {} });
              await load();
            });
          });
          qsa('[data-notification-open]', list).forEach((link) => {
            link.addEventListener('click', async function (event) {
              event.preventDefault();
              await apiRequest(`/notifications/${link.getAttribute('data-notification-open')}/mark_read/`, { method: 'POST', token, body: {} });
              window.location.href = link.getAttribute('data-target-url') || '/notifications/';
            });
          });
          bindNotificationCardOpenHandlers(list, token, load);
        });
      } catch (err) {
        widgets.forEach(({ list }) => {
          list.innerHTML = `<p class="error-text">${escapeHtml(err.message || 'Не удалось загрузить уведомления.')}</p>`;
        });
      }
    }

    widgets.forEach(({ readAll }) => {
      if (readAll) readAll.addEventListener('click', async function () {
        await apiRequest('/notifications/mark_all_read/', { method: 'POST', token, body: {} });
        await load();
      });
    });

    await load();
  }

  function venueStatusLabel(status) {
    switch (status) {
      case 'draft': return 'Черновик';
      case 'pending_moderation': return 'На модерации';
      case 'active': return 'Опубликовано';
      case 'blocked': return 'Заблокировано';
      default: return 'Неизвестно';
    }
  }

  function venueStatusClass(status) {
    if (status === 'active') return 'pill pill-rating';
    if (status === 'pending_moderation') return 'pill';
    return 'pill muted-chip';
  }

  function bookingStatusLabel(status) {
    switch (status) {
      case 'hold': return 'Зарезервировано';
      case 'pending_confirmation': return 'Нужно подтвердить';
      case 'waiting_for_payment': return 'Ожидает оплаты';
      case 'paid': return 'Оплачено';
      case 'confirmed': return 'Подтверждено';
      case 'cancelled': return 'Отменено';
      case 'completed': return 'Завершено';
      case 'no_show': return 'Неявка';
      default: return 'Неизвестно';
    }
  }

  function bookingStatusClass(status) {
    if (status === 'hold') return 'pill booking-status-pill waiting';
    if (status === 'pending_confirmation') return 'pill booking-status-pill pending';
    if (status === 'waiting_for_payment') return 'pill booking-status-pill waiting';
    if (status === 'paid' || status === 'confirmed') return 'pill booking-status-pill success';
    if (status === 'cancelled' || status === 'no_show') return 'pill booking-status-pill cancelled';
    return 'pill booking-status-pill muted';
  }

  function paymentStatusLabel(status) {
    switch (status) {
      case 'created': return 'Создан';
      case 'pending': return 'Ожидает оплаты';
      case 'succeeded': return 'Оплачен';
      case 'failed': return 'Ошибка';
      case 'cancelled': return 'Отменён';
      default: return 'Не инициализирован';
    }
  }

  function formatMoney(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Не требуется';
    try {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB', maximumFractionDigits: 2 }).format(amount);
    } catch (err) {
      return `${amount.toFixed(2)} ${currency || 'RUB'}`;
    }
  }

  function bookingNeedsPayment(booking) {
    return booking && booking.status === 'waiting_for_payment' && Number(booking.required_deposit_amount || booking.payment_amount || 0) > 0;
  }

  function bookingPaymentSummary(booking) {
    const amount = booking.payment_amount || booking.required_deposit_amount;
    const currency = booking.payment_currency || booking.required_deposit_currency || 'RUB';
    if (!(Number(amount) > 0)) return 'Предоплата не требуется';
    const status = booking.payment_status ? paymentStatusLabel(booking.payment_status) : (booking.status === 'waiting_for_payment' ? 'Не оплачено' : 'Не требуется');
    return `${formatMoney(amount, currency)} · ${status}`;
  }



  function bookingTablesSummary(booking) {
    if (booking && booking.booking_type === 'hall') return `Зал целиком: ${booking.hall_name || 'зал'}`;
    return booking.tables_summary || (Array.isArray(booking.table_names) && booking.table_names.length ? booking.table_names.join(', ') : booking.table_name || 'Столы не указаны');
  }

  function bookingTablesCapacityText(booking) {
    const count = Number(booking.total_seats_count || booking.table_seats_count || 0);
    return count ? `${count} мест суммарно` : 'вместимость не указана';
  }

  function formatPaymentCountdown(seconds) {
    const raw = Number(seconds);
    if (!Number.isFinite(raw)) return '';
    if (raw <= 0) return 'время истекло';
    const minutes = Math.floor(raw / 60);
    const secs = Math.floor(raw % 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return `${hours} ч ${rest} мин`;
    }
    return `${minutes} мин ${secs.toString().padStart(2, '0')} сек`;
  }

  function bookingPaymentDeadlineText(booking) {
    if (!booking || booking.status !== 'waiting_for_payment') return '';
    const deadline = booking.payment_deadline_at ? formatDateTimeRu(booking.payment_deadline_at) : '';
    const countdown = formatPaymentCountdown(booking.payment_time_left_seconds);
    if (deadline && countdown) return `Оплату нужно завершить до ${deadline}. Осталось: ${countdown}.`;
    if (deadline) return `Оплату нужно завершить до ${deadline}.`;
    return 'Оплату нужно завершить в течение времени, указанного в правилах заведения.';
  }

  function bookingCancellationPolicyText(booking) {
    if (!booking) return 'Правила отмены применятся после создания брони.';
    const deadline = booking.free_cancellation_deadline ? formatDateTimeRu(booking.free_cancellation_deadline) : null;
    if (booking.status === 'cancelled') {
      if (booking.cancelled_without_penalty) return 'Бронь отменена без штрафа.';
      const amount = Number(booking.cancellation_penalty_amount || 0) > 0
        ? ` Штраф: ${formatMoney(booking.cancellation_penalty_amount, booking.cancellation_penalty_currency || 'RUB')}.`
        : '';
      return `Бронь отменена с удержанием.${amount}`;
    }
    if (booking.can_cancel_without_penalty === false) {
      const amount = Number(booking.cancellation_penalty_amount || booking.required_deposit_amount || 0) > 0
        ? ` При отмене сейчас будет удержано ${formatMoney(booking.cancellation_penalty_amount || booking.required_deposit_amount, booking.cancellation_penalty_currency || booking.required_deposit_currency || 'RUB')}.`
        : ' Бесплатное окно отмены уже прошло.';
      return `${deadline ? `Без штрафа можно было отменить до ${deadline}.` : 'Бесплатное окно отмены уже прошло.'}${amount}`;
    }
    return deadline ? `Без штрафа можно отменить до ${deadline}.` : 'Отмена без штрафа доступна по правилам заведения.';
  }

  async function startBookingPaymentFlow(bookingId, token) {
    const payment = await apiRequest('/payments/initialize/', { method: 'POST', token, body: { booking_id: bookingId } });
    if (payment.is_demo || payment.checkout_mode === 'stub' || (payment.raw_payload && payment.raw_payload.mode === 'stub')) {
      const approved = window.confirm(`Учебная оплата брони #${bookingId} на сумму ${formatMoney(payment.amount, payment.currency)}. Реального списания не будет. Продолжить?`);
      if (!approved) {
        const cancelled = await apiRequest(`/payments/${payment.id}/simulate-cancel/`, { method: 'POST', token, body: {} });
        return { cancelled: true, payment: cancelled };
      }
      const completed = await apiRequest(`/payments/${payment.id}/simulate-success/`, { method: 'POST', token, body: {} });
      return { completed: true, payment: completed };
    }
    if (payment.confirmation_url) {
      window.location.href = payment.confirmation_url;
      return { redirected: true, payment };
    }
    throw new Error('Платёж инициализирован, но ссылка на оплату не получена.');
  }

  function formatDateTimeRangeRu(startValue, endValue) {
    const start = formatDateTimeRu(startValue);
    const endDate = endValue ? new Date(endValue) : null;
    if (!start) return 'Дата не указана';
    if (!endDate || Number.isNaN(endDate.getTime())) return start;
    return `${start} — ${endDate.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function buildDefaultBookingLocalValue(stepMinutes, offsetMinutes) {
    const step = Math.max(Number(stepMinutes) || 10, 5);
    const offset = Math.max(Number(offsetMinutes) || 0, step * 2);
    const date = new Date();
    date.setMinutes(date.getMinutes() + offset);
    date.setSeconds(0, 0);
    const remainder = date.getMinutes() % step;
    if (remainder) {
      date.setMinutes(date.getMinutes() + (step - remainder));
    }
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function shiftLocalDateTimeValue(localValue, minutesToAdd) {
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() + (Number(minutesToAdd) || 0));
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function debounce(fn, delay) {
    let timeoutId = null;
    return function debounced(...args) {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }
  function flattenApiError(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) return payload.map(flattenApiError).filter(Boolean).join(' ');
    if (typeof payload === 'object') {
      const lines = Object.entries(payload).map(([key, value]) => {
        const nested = flattenApiError(value);
        if (!nested) return null;
        return (key === 'detail' || key === 'non_field_errors') ? nested : `${key}: ${nested}`;
      }).filter(Boolean);
      return lines.length ? lines.join('\n') : null;
    }
    return null;
  }
  async function parseApiResponse(response) {
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
        const message = response.ok
          ? 'Сервер вернул HTML вместо JSON. Проверьте, что запущен backend и что API-адрес начинается с /api/v1/.'
          : `API вернул HTML-страницу вместо JSON (${response.status}). ${pageTitle ? `Страница ошибки: ${pageTitle}. ` : ''}Откройте логи backend-контейнера.`;
        throw new Error(message);
      }
    }
    if (!response.ok) throw new Error(flattenApiError(data) || `Request failed: ${response.status}`);
    return data;
  }

  async function apiRequest(path, options) {
    const opts = options || {};
    const response = await fetch(`${apiBase}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Token ${opts.token}` } : {})
      },
      cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return parseApiResponse(response);
  }

  async function apiUploadRequest(path, options) {
    const opts = options || {};
    const response = await fetch(`${apiBase}${path}`, {
      method: opts.method || 'POST',
      headers: {
        ...(opts.token ? { Authorization: `Token ${opts.token}` } : {})
      },
      cache: 'no-store',
      body: opts.body
    });
    return parseApiResponse(response);
  }


  function buildWebSocketUrl(path, params) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const search = new URLSearchParams(params || {});
    return `${protocol}//${window.location.host}${path}${search.toString() ? `?${search.toString()}` : ''}`;
  }

  function connectRealtimeSocket({ venueId, token, onMessage, onStatus }) {
    if (!('WebSocket' in window)) return { close() {} };
    let socket = null;
    let closedByClient = false;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    const params = {};
    if (venueId) params.venue_id = venueId;
    if (token) params.token = token;

    function setStatus(value) {
      if (typeof onStatus === 'function') onStatus(value);
    }

    function connect() {
      if (closedByClient) return;
      try {
        socket = new WebSocket(buildWebSocketUrl('/ws/notifications/', params));
      } catch (error) {
        setStatus('offline');
        scheduleReconnect();
        return;
      }
      socket.addEventListener('open', function () {
        reconnectAttempt = 0;
        setStatus('online');
      });
      socket.addEventListener('message', function (event) {
        let payload = null;
        try { payload = JSON.parse(event.data || '{}'); } catch { return; }
        if (!payload || payload.type === 'connected' || payload.type === 'pong') return;
        if (typeof onMessage === 'function') onMessage(payload);
      });
      socket.addEventListener('close', function () {
        if (closedByClient) return;
        setStatus('offline');
        scheduleReconnect();
      });
      socket.addEventListener('error', function () {
        setStatus('offline');
      });
    }

    function scheduleReconnect() {
      if (closedByClient || reconnectTimer) return;
      const delay = Math.min(8000, 700 + reconnectAttempt * 900);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    connect();
    return {
      close() {
        closedByClient = true;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, 'page closed');
      }
    };
  }

  function initResponsiveHeader() {
    const state = qs('#header-menu-state');
    if (!state) return;
    state.checked = false;
    document.addEventListener('click', function (event) {
      if (!state.checked) return;
      const header = qs('#site-header');
      if (header && !header.contains(event.target)) state.checked = false;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') state.checked = false;
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024) state.checked = false;
    });
  }

  function buildHeader(user) {
    const nav = qs('#main-nav');
    const actions = qs('#header-actions');
    if (!nav || !actions) return;
    const guestLinks = [
      ['/', 'Главная'], ['/venues/', 'Заведения'], ['/login/', 'Вход'], ['/register/', 'Регистрация']
    ];
    const modes = Array.isArray(user && user.available_modes) ? user.available_modes : (user && user.role ? [user.role] : []);
    const links = user ? [['/', 'Главная'], ['/venues/', 'Заведения'], ['/notifications/', 'Уведомления']] : guestLinks;
    if (user && modes.includes('manager')) links.push(['/manager/', 'Менеджер']);
    if (user && (modes.includes('platform_admin') || modes.includes('moderator') || user.role === 'platform_admin' || user.role === 'moderator')) links.push(['/platform-admin/', 'Админ']);
    nav.innerHTML = links.map(([href, label]) => href === '/notifications/' ? `<a class="nav-link nav-link-with-badge" href="${href}">${label}<span class="nav-badge hidden" id="header-notification-badge">0</span></a>` : `<a class="nav-link" href="${href}">${label}</a>`).join('');
    if (user) {
      const displayModes = modes.filter((mode) => mode !== 'client');
      const modeHrefMap = {
        owner: '/owner/',
        manager: '/manager/',
        moderator: '/platform-admin/',
        platform_admin: '/platform-admin/',
      };
      const modesHtml = displayModes.map((mode) => {
        const label = modeLabel(mode);
        const href = modeHrefMap[mode];
        return href ? `<a class="header-mode-link" href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label);
      }).join(' · ');
      actions.innerHTML = `
        <div class="header-user">
          <a class="header-user-name" href="/account/">${escapeHtml(user.first_name || user.email)}</a>
          ${modesHtml ? `<span class="header-user-role">${modesHtml}</span>` : ''}
        </div>
        <button class="button button-secondary" type="button" id="logout-button">Выйти</button>
      `;
      const logoutButton = qs('#logout-button');
      if (logoutButton) logoutButton.addEventListener('click', async function () {
        const token = getToken();
        try {
          if (token) await apiRequest('/auth/logout/', { method: 'POST', token });
        } catch (e) { /* ignore */ }
        clearSession();
        window.location.href = '/login/';
      });
    } else {
      actions.innerHTML = `<a class="button button-primary" href="/login/">Войти</a>`;
    }
    const menuState = qs('#header-menu-state');
    qsa('#main-nav a, #header-actions a, #header-actions button').forEach((node) => {
      node.addEventListener('click', function () {
        if (menuState) menuState.checked = false;
      });
    });
  }

  async function hydrateUser() {
    const token = getToken();
    const localUser = getUser();
    buildHeader(localUser);
    if (!token) return null;
    try {
      const me = await apiRequest('/auth/me/', { token });
      storeSession(token, me);
      buildHeader(me);
      await refreshNotificationBadge();
      return me;
    } catch (e) {
      clearSession();
      buildHeader(null);
      updateNotificationBadge(0);
      return null;
    }
  }


  function resolveImageUrl(image) {
    if (!image) return '';
    const raw = typeof image === 'string' ? image : (image.image_url || image.image || '');
    if (!raw) return '';
    const value = String(raw).trim();
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const url = new URL(value);
        if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.pathname.startsWith('/media/')) {
          return `${url.pathname}${url.search || ''}`;
        }
      } catch (e) {
        return value;
      }
    }
    return value.startsWith('/') ? value : `/${value.replace(/^\/+/, '')}`;
  }

  function renderVenuePhotoSection(images, options = {}) {
    const list = Array.isArray(images) ? images.filter((item) => resolveImageUrl(item)) : [];
    const title = options.title || 'Фотографии заведения';
    const subtitle = options.subtitle || 'Владелец или менеджер могут добавить фотографии интерьера, залов и атмосферы заведения.';
    if (!list.length) {
      return `
        <article class="panel venue-photo-library venue-photo-library-empty">
          <div class="section-topline"><span class="section-kicker">Галерея</span><h2>${escapeHtml(title)}</h2></div>
          <p class="muted-block">Фотографии пока не добавлены. Владелец или менеджер могут загрузить их на странице редактирования заведения.</p>
        </article>
      `;
    }
    return `
      <article class="panel venue-photo-library" data-venue-photo-slider>
        <div class="section-topline"><span class="section-kicker">Галерея</span><h2>${escapeHtml(title)}</h2></div>
        <p class="muted-block">${escapeHtml(subtitle)}</p>
        <div class="venue-slider-shell top-gap">
          <button class="venue-slider-control venue-slider-control-prev" type="button" data-gallery-prev aria-label="Предыдущее фото">‹</button>
          <div class="venue-slider-viewport">
            <div class="venue-slider-track" data-gallery-track>
              ${list.map((image, index) => {
                const url = resolveImageUrl(image);
                const alt = image.alt_text || title;
                return `<figure class="venue-slider-slide" data-gallery-slide><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${image.is_cover || index === 0 ? 'Обложка' : `Фото ${index + 1}`}</figcaption></figure>`;
              }).join('')}
            </div>
          </div>
          <button class="venue-slider-control venue-slider-control-next" type="button" data-gallery-next aria-label="Следующее фото">›</button>
        </div>
        <div class="venue-slider-footer">
          <div class="venue-slider-thumbs" data-gallery-dots>
            ${list.map((image, index) => {
              const url = resolveImageUrl(image);
              const alt = image.alt_text || title;
              return `<button class="venue-slider-thumb" type="button" data-gallery-dot="${index}" aria-label="Показать фото ${index + 1}"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"></button>`;
            }).join('')}
          </div>
          <span class="venue-slider-counter" data-gallery-counter>1 / ${list.length}</span>
        </div>
      </article>
    `;
  }

  function initializeVenuePhotoSliders(root = document) {
    qsa('[data-venue-photo-slider]', root).forEach((slider) => {
      if (slider.dataset.sliderBound === 'true') return;
      slider.dataset.sliderBound = 'true';
      const track = qs('[data-gallery-track]', slider);
      const slides = qsa('[data-gallery-slide]', slider);
      const prevButton = qs('[data-gallery-prev]', slider);
      const nextButton = qs('[data-gallery-next]', slider);
      const counter = qs('[data-gallery-counter]', slider);
      const dots = qsa('[data-gallery-dot]', slider);
      const viewport = qs('.venue-slider-viewport', slider);
      if (!track || !slides.length) return;
      let index = 0;
      let touchStartX = null;

      function update(nextIndex) {
        index = (Number(nextIndex) + slides.length) % slides.length;
        track.style.transform = `translateX(-${index * 100}%)`;
        dots.forEach((dot) => dot.classList.toggle('is-active', Number(dot.getAttribute('data-gallery-dot')) === index));
        if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
        const disabled = slides.length <= 1;
        if (prevButton) prevButton.disabled = disabled;
        if (nextButton) nextButton.disabled = disabled;
      }

      if (prevButton) prevButton.addEventListener('click', () => update(index - 1));
      if (nextButton) nextButton.addEventListener('click', () => update(index + 1));
      dots.forEach((dot) => dot.addEventListener('click', () => update(Number(dot.getAttribute('data-gallery-dot')) || 0)));
      if (viewport) {
        viewport.addEventListener('touchstart', (event) => {
          touchStartX = event.touches && event.touches.length ? event.touches[0].clientX : null;
        }, { passive: true });
        viewport.addEventListener('touchend', (event) => {
          if (touchStartX === null || !event.changedTouches || !event.changedTouches.length) return;
          const delta = event.changedTouches[0].clientX - touchStartX;
          touchStartX = null;
          if (Math.abs(delta) > 45) update(index + (delta < 0 ? 1 : -1));
        }, { passive: true });
      }
      update(0);
    });
  }

  function renderReviewImages(images) {
    const list = Array.isArray(images) ? images.filter((item) => resolveImageUrl(item)) : [];
    if (!list.length) return '';
    return `
      <div class="review-image-grid top-gap">
        ${list.map((image) => `<a class="review-image-card" href="${escapeHtml(resolveImageUrl(image))}" target="_blank" rel="noopener"><img src="${escapeHtml(resolveImageUrl(image))}" alt="${escapeHtml(image.alt_text || 'Фото из отзыва')}" loading="lazy"></a>`).join('')}
      </div>
    `;
  }

  function renderCompactVenueCard(venue, extraMeta) {
    const reviewInfo = Number(venue.review_count || 0) > 0 ? `${Number(venue.average_rating || 0).toFixed(1)} · ${venue.review_count} отзывов` : 'Пока без отзывов';
    return `
      <article class="venue-card compact-card">
        ${venue.cover_image_url ? `<div class="venue-card-cover"><img src="${escapeHtml(venue.cover_image_url)}" alt="${escapeHtml(venue.name)}" loading="lazy"></div>` : ''}
        <div class="eyebrow-row">
          <span class="pill">${escapeHtml(venue.city || 'Город')}</span>
          <span class="pill muted-chip">${escapeHtml(venueThemeLabel(venue.venue_theme))}</span>
        </div>
        <div class="venue-card-body">
          <h2>${escapeHtml(venue.name)}</h2>
          <p>${escapeHtml(venue.short_description || 'Описание скоро появится.')}</p>
        </div>
        <div class="stack-sm">
          <span class="muted-block">${escapeHtml(venue.address || 'Адрес не указан')}</span>
          <span class="muted-block">${escapeHtml(reviewInfo)}</span>
          ${extraMeta ? `<span class="muted-block">${extraMeta}</span>` : ''}
          <div class="button-row">
            <a class="button button-primary" href="/venues/${encodeURIComponent(venue.slug)}/">Открыть</a>
            <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/reviews/">Отзывы</a>
          </div>
        </div>
      </article>
    `;
  }

  async function mountHomePage() {
    const topRatedRoot = qs('#home-top-rated');
    if (!topRatedRoot) return;
    const popularRoot = qs('#home-popular');
    const recentReviewsRoot = qs('#home-recent-reviews');
    const reviewCandidatesRoot = qs('#home-review-candidates');
    const reviewCandidatesEmpty = qs('#home-review-candidates-empty');
    const errorCard = qs('#home-error-card');
    const registerCta = qs('#home-register-cta');
    const token = getToken();
    const currentUser = getUser();
    const homeSearchForm = qs('#home-search-form');
    const homeSearchQuery = qs('#home-search-query');

    if (homeSearchForm) {
      homeSearchForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const query = String(homeSearchQuery?.value || '').trim();
        window.location.href = query ? `/venues/?q=${encodeURIComponent(query)}` : '/venues/';
      });
    }

    if (registerCta && currentUser) hide(registerCta);
    function renderRecentReview(review) {
      return `
        <article class="review-card compact-card">
          <div class="review-card-meta">
            <div>
              <div class="eyebrow-row">
                <span class="pill">${escapeHtml(review.venue_name)}</span>
                <span class="pill muted-chip">${'★'.repeat(Math.max(Number(review.rating) || 0, 0))}</span>
              </div>
              <h3>${escapeHtml(review.author_name)}</h3>
            </div>
            <span class="muted-block">${escapeHtml(formatDateTimeRu(review.created_at) || '')}</span>
          </div>
          <p>${escapeHtml(review.text)}</p>
          ${renderReviewImages(review.images)}
          ${review.reply ? `<div class="review-reply-card"><strong>Ответ заведения</strong><p>${escapeHtml(review.reply.text)}</p></div>` : ''}
          <div class="button-row compact-row">
            <span class="pill muted-chip">Лайков: ${escapeHtml(String(review.likes_count || 0))}</span>
            <a class="button button-secondary" href="/venues/${encodeURIComponent(review.venue_slug)}/reviews/">Все отзывы</a>
          </div>
        </article>
      `;
    }

    async function renderReviewCandidates(items) {
      if (!reviewCandidatesRoot) return;
      if (!token) {
        reviewCandidatesRoot.innerHTML = '<article class="card compact-card"><p class="muted-block">Авторизуйтесь, чтобы оставлять отзывы о заведениях. Бронь для этого не обязательна.</p><div class="button-row"><a class="button button-primary" href="/login/">Войти</a></div></article>';
        hide(reviewCandidatesEmpty);
        return;
      }
      if (!items.length) {
        reviewCandidatesRoot.innerHTML = '';
        show(reviewCandidatesEmpty);
        return;
      }
      hide(reviewCandidatesEmpty);
      reviewCandidatesRoot.innerHTML = items.map((item) => `
        <article class="card compact-card review-candidate-card">
          <div class="section-topline">
            <span class="section-kicker">${escapeHtml(item.city || 'Город')}</span>
            <h3>${escapeHtml(item.venue_name)}</h3>
          </div>
          <p class="muted-block">Можно оставить отзыв после регистрации, даже если визит был без предварительной брони. Для одного заведения доступен один основной отзыв.</p>
          <form class="form inline-review-form" data-home-review-form="${item.venue_id}">
            <input type="hidden" name="venue" value="${item.venue_id}">
            <div class="grid grid-two">
              <label class="field"><span>Оценка</span><select name="rating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label>
              <label class="field"><span>Быстрый переход</span><a class="button button-secondary" href="/venues/${encodeURIComponent(item.venue_slug)}/reviews/">Страница отзывов</a></label>
            </div>
            <label class="field"><span>Ваш отзыв</span><textarea name="text" rows="4" placeholder="Что понравилось, как прошёл визит, что можно улучшить"></textarea></label>
            <div class="button-row">
              <button class="button button-primary" type="submit">Опубликовать отзыв</button>
            </div>
            <p class="success-text hidden"></p>
            <p class="error-text hidden"></p>
          </form>
        </article>
      `).join('');
      qsa('[data-home-review-form]', reviewCandidatesRoot).forEach((form) => {
        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          const success = qs('.success-text', form);
          const error = qs('.error-text', form);
          hide(success); hide(error);
          const submit = qs('button[type="submit"]', form);
          submit.disabled = true;
          const data = new FormData(form);
          try {
            await apiRequest('/reviews/', {
              method: 'POST',
              token,
              body: {
                venue: Number(data.get('venue')),
                rating: Number(data.get('rating') || 5),
                text: String(data.get('text') || '').trim(),
              },
            });
            setText(success, 'Спасибо! Отзыв опубликован.');
            show(success);
            const refreshed = await apiRequest('/reviews/eligible/', { token });
            await renderReviewCandidates(refreshed);
          } catch (err) {
            setText(error, err.message || 'Не удалось сохранить отзыв.');
            show(error);
          } finally {
            submit.disabled = false;
          }
        });
      });
    }

    try {
      const overview = await apiRequest('/home/overview/', token ? { token } : undefined);
      topRatedRoot.innerHTML = overview.top_rated.length ? overview.top_rated.map((venue) => renderCompactVenueCard(venue, `${priceCategoryLabel(venue.price_category)} · ${venue.hall_count} залов`)).join('') : '<article class="card compact-card">Топ пока пуст.</article>';
      popularRoot.innerHTML = overview.popular.length ? overview.popular.map((venue) => renderCompactVenueCard(venue, `Бронирований: ${venue.visits_total}`)).join('') : '<article class="card compact-card">Популярные заведения появятся после бронирований.</article>';
      recentReviewsRoot.innerHTML = overview.recent_reviews.length ? overview.recent_reviews.map(renderRecentReview).join('') : '<article class="card compact-card">Пока отзывов нет.</article>';
      await renderReviewCandidates(overview.review_candidates || []);
      hide(errorCard);
    } catch (err) {
      if (errorCard) {
        errorCard.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось загрузить главную страницу.')}</p>`;
        show(errorCard);
      }
    }
  }

  function mountLoginPage() {
    const form = qs('#login-form');
    if (!form) return;
    qsa('.demo-account').forEach((button) => {
      button.addEventListener('click', function () {
        qs('#login-email').value = button.getAttribute('data-demo-email') || '';
        qs('#login-password').value = button.getAttribute('data-demo-password') || '';
        setText(qs('#login-message'), 'Данные демо-аккаунта подставлены в форму.');
        show(qs('#login-message'));
        hide(qs('#login-error'));
      });
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(qs('#login-error'));
      hide(qs('#login-message'));
      const submit = qs('#login-submit');
      submit.disabled = true;
      const formData = new FormData(form);
      const payload = {
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || '')
      };
      try {
        const result = await apiRequest('/auth/login/', { method: 'POST', body: payload });
        storeSession(result.token, result.user);
        buildHeader(result.user);
        window.location.href = '/account/';
      } catch (error) {
        setText(qs('#login-error'), error.message || 'Ошибка входа');
        show(qs('#login-error'));
        submit.disabled = false;
      }
    });
  }

  function validateRegister(form) {
    const email = String(form.email || '').trim().toLowerCase();
    if (!String(form.last_name || '').trim()) return 'Укажите фамилию.';
    if (!String(form.first_name || '').trim()) return 'Укажите имя.';
    if (!String(form.phone || '').trim()) return 'Укажите телефон.';
    if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(String(form.phone || '').trim())) return 'Введите телефон в формате +7 (999) 999-99-99.';
    if (!email) return 'Укажите email.';
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return 'Email должен быть на латинице и обязательно содержать символ @.';
    if (!form.date_of_birth) return 'Укажите дату рождения.';
    if (!form.password) return 'Введите пароль.';
    if (String(form.password).length < 8) return 'Пароль должен содержать минимум 8 символов.';
    if (!/[A-Za-z]/.test(form.password)) return 'Пароль должен содержать хотя бы одну латинскую букву.';
    if (!/\d/.test(form.password)) return 'Пароль должен содержать хотя бы одну цифру.';
    if (form.password !== form.confirm_password) return 'Пароль и подтверждение пароля не совпадают.';
    if (form.account_type === 'legal') {
      if (!String(form.company_name || '').trim()) return 'Укажите название организации.';
      if (!String(form.tax_number || '').trim()) return 'Укажите ИНН организации.';
      if (![10, 12].includes(String(form.tax_number || '').trim().length)) return 'ИНН должен содержать 10 или 12 цифр.';
    }
    return null;
  }

  function mountRegisterPage() {
    const form = qs('#register-form');
    if (!form) return;
    const accountType = qs('#account-type-select');
    const legalFields = qs('#legal-fields');
    const phoneInput = qs('#register-phone');
    const taxInput = qs('#tax-number-input');
    function syncLegalFields() {
      if (accountType.value === 'legal') show(legalFields); else hide(legalFields);
    }
    syncLegalFields();
    accountType.addEventListener('change', syncLegalFields);
    phoneInput.addEventListener('input', function () { phoneInput.value = formatPhone(phoneInput.value); });
    taxInput.addEventListener('input', function () { taxInput.value = String(taxInput.value || '').replace(/\D/g, '').slice(0, 12); });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(qs('#register-error'));
      hide(qs('#register-message'));
      const submit = qs('#register-submit');
      submit.disabled = true;
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.email = String(payload.email || '').trim().toLowerCase();
      payload.phone = String(payload.phone || '').trim();
      payload.tax_number = String(payload.tax_number || '').replace(/\D/g, '');
      const validationError = validateRegister(payload);
      if (validationError) {
        setText(qs('#register-error'), validationError);
        show(qs('#register-error'));
        submit.disabled = false;
        return;
      }
      const body = {
        email: payload.email,
        phone: payload.phone,
        password: payload.password,
        first_name: payload.first_name,
        last_name: payload.last_name,
        middle_name: payload.middle_name,
        date_of_birth: payload.date_of_birth,
        account_type: payload.account_type,
        company_name: payload.company_name,
        tax_number: payload.tax_number,
        registration_number: payload.registration_number,
        legal_address: payload.legal_address
      };
      try {
        const result = await apiRequest('/auth/register/', { method: 'POST', body });
        storeSession(result.token, result.user);
        buildHeader(result.user);
        window.location.href = '/account/';
      } catch (error) {
        setText(qs('#register-error'), error.message || 'Ошибка регистрации');
        show(qs('#register-error'));
        submit.disabled = false;
      }
    });
  }

  function validateProfile(form) {
    const email = String(form.email || '').trim().toLowerCase();
    if (!String(form.last_name || '').trim()) return 'Укажите фамилию.';
    if (!String(form.first_name || '').trim()) return 'Укажите имя.';
    if (!String(form.phone || '').trim()) return 'Укажите телефон.';
    if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(String(form.phone || '').trim())) return 'Введите телефон в формате +7 (999) 999-99-99.';
    if (!email) return 'Укажите email.';
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return 'Email должен быть на латинице и обязательно содержать символ @.';
    if (!form.date_of_birth) return 'Укажите дату рождения.';
    if (String(form.city || '').trim().length > 120) return 'Название города слишком длинное.';
    return null;
  }

  function renderAccountDetails(user) {
    const availableModes = Array.isArray(user.available_modes) ? user.available_modes : ['client'];
    qs('#account-details').innerHTML = `
      <div><span>ФИО</span><strong>${escapeHtml([user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ')) || 'Не указано'}</strong></div>
      <div><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
      <div><span>Телефон</span><strong>${escapeHtml(user.phone || 'Не указан')}</strong></div>
      <div><span>Город проживания</span><strong>${escapeHtml(user.city || 'Не указан')}</strong></div>
      <div><span>Основная роль</span><strong>${escapeHtml(roleLabel(user.role))}</strong></div>
      <div><span>Доступные режимы</span><strong>${escapeHtml(availableModes.map(modeLabel).join(' · '))}</strong></div>
      <div><span>Клиентский режим</span><strong>${user.client_mode_enabled === false ? 'Выключен' : 'Доступен для этого аккаунта'}</strong></div>
      <div><span>Своих заведений</span><strong>${escapeHtml(user.owned_venues_count || 0)}</strong></div>
      <div><span>Заведений в управлении</span><strong>${escapeHtml(user.managed_venues_count || 0)}</strong></div>
      <div><span>Тип аккаунта</span><strong>${escapeHtml(accountTypeLabel(user.account_type))}</strong></div>
      <div><span>Дата рождения</span><strong>${escapeHtml(user.date_of_birth || 'Не указана')}</strong></div>
    `;
  }

  function fillAccountForm(user) {
    qs('#account-last-name').value = user.last_name || '';
    qs('#account-first-name').value = user.first_name || '';
    qs('#account-middle-name').value = user.middle_name || '';
    qs('#account-date-of-birth').value = user.date_of_birth || '';
    qs('#account-email').value = user.email || '';
    qs('#account-phone').value = user.phone || '';
    if (qs('#account-city')) qs('#account-city').value = user.city || '';
  }

  async function mountAccountPage() {
    if (!qs('#account-card')) return;
    const token = getToken();
    const loading = qs('#account-loading');
    const errorCard = qs('#account-error-card');
    const errorText = qs('#account-error-text');
    const card = qs('#account-card');
    const form = qs('#account-form');
    const phoneInput = qs('#account-phone');
    const success = qs('#account-success');
    const formError = qs('#account-form-error');
    const saveButton = qs('#account-save');
    const cityInput = qs('#account-city');
    const detectCityButton = qs('#account-detect-city');
    const cityHint = qs('#account-city-hint');
    const bookingsSummary = qs('#account-bookings-summary');
    const activeBookingsRoot = qs('#account-active-bookings');
    const pastBookingsRoot = qs('#account-past-bookings');
    const bookingsMessage = qs('#account-bookings-message');
    const bookingsError = qs('#account-bookings-error');
    const bookingsRefreshButton = qs('#account-bookings-refresh');
    const paymentsSummary = qs('#account-payments-summary');
    const paymentsList = qs('#account-payments-list');
    const paymentsError = qs('#account-payments-error');
    const paymentsRefreshButton = qs('#account-payments-refresh');
    const reviewCandidatesRoot = qs('#account-review-candidates');
    const reviewCandidatesEmpty = qs('#account-review-candidates-empty');
    const returnedFromPayment = window.location.pathname.startsWith('/account/payments');

    if (!token) {
      hide(loading); show(errorCard); setText(errorText, 'Сначала войдите в систему или зарегистрируйтесь.'); return;
    }

    phoneInput.addEventListener('input', function () {
      phoneInput.value = formatPhone(phoneInput.value);
    });
    if (detectCityButton) detectCityButton.addEventListener('click', async function () {
      hide(formError);
      if (cityHint) { setText(cityHint, 'Определяем ваш город…'); show(cityHint); }
      detectCityButton.disabled = true;
      try {
        const detected = await detectCurrentCity();
        if (!detected.city) throw new Error('Город определить не удалось. Укажите его вручную.');
        if (cityInput) cityInput.value = detected.city;
        setPreferredCity(detected.city);
        if (cityHint) { setText(cityHint, `Определён город: ${detected.city}`); show(cityHint); }
      } catch (error) {
        if (cityHint) { setText(cityHint, error.message || 'Не удалось определить город.'); show(cityHint); }
      } finally {
        detectCityButton.disabled = false;
      }
    });

    function isPastBooking(booking) {
      const terminalStatuses = new Set(['cancelled', 'completed', 'no_show']);
      if (terminalStatuses.has(booking.status)) return true;
      const bookingEnd = booking.booking_end ? new Date(booking.booking_end) : null;
      if (!bookingEnd || Number.isNaN(bookingEnd.getTime())) return false;
      return bookingEnd.getTime() < Date.now();
    }

    function buildBookingHistoryLine(booking) {
      const history = Array.isArray(booking.status_history) ? booking.status_history : [];
      if (!history.length) return '';
      const lastEvent = history[history.length - 1];
      const who = lastEvent.changed_by_email ? ` · ${lastEvent.changed_by_email}` : '';
      const reason = lastEvent.reason ? ` — ${escapeHtml(lastEvent.reason)}` : '';
      return `<p class="muted-block top-gap"><strong>Последнее изменение:</strong> ${escapeHtml(bookingStatusLabel(lastEvent.new_status))}${who}${reason}</p>`;
    }

    function renderReviewCandidates(items) {
      if (!reviewCandidatesRoot) return;
      if (!items.length) {
        reviewCandidatesRoot.innerHTML = '';
        show(reviewCandidatesEmpty);
        return;
      }
      hide(reviewCandidatesEmpty);
      reviewCandidatesRoot.innerHTML = items.map((item) => `
        <article class="card compact-card review-candidate-card">
          <div class="section-topline">
            <span class="section-kicker">${escapeHtml(item.city || 'Город')}</span>
            <h3>${escapeHtml(item.venue_name)}</h3>
          </div>
          <p class="muted-block">Отзыв можно оставить после регистрации, даже если визит был без бронирования через WebTavern.</p>
          <form class="form" data-account-review-form="${item.venue_id}">
            <input type="hidden" name="venue" value="${item.venue_id}">
            <div class="grid grid-two">
              <label class="field"><span>Оценка</span><select name="rating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label>
              <label class="field"><span>Подробнее</span><a class="button button-secondary" href="/venues/${encodeURIComponent(item.venue_slug)}/reviews/">Страница отзывов</a></label>
            </div>
            <label class="field"><span>Текст</span><textarea name="text" rows="4" placeholder="Опишите впечатления от посещения"></textarea></label>
            <div class="button-row"><button class="button button-primary" type="submit">Оставить отзыв</button></div>
            <p class="success-text hidden"></p>
            <p class="error-text hidden"></p>
          </form>
        </article>
      `).join('');
      qsa('[data-account-review-form]', reviewCandidatesRoot).forEach((reviewForm) => {
        reviewForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          const successNode = qs('.success-text', reviewForm);
          const errorNode = qs('.error-text', reviewForm);
          hide(successNode); hide(errorNode);
          const submit = qs('button[type="submit"]', reviewForm);
          submit.disabled = true;
          const data = new FormData(reviewForm);
          try {
            await apiRequest('/reviews/', {
              method: 'POST',
              token,
              body: {
                venue: Number(data.get('venue')),
                rating: Number(data.get('rating') || 5),
                text: String(data.get('text') || '').trim(),
              },
            });
            setText(successNode, 'Отзыв сохранён. Спасибо за обратную связь.');
            show(successNode);
            await loadReviewCandidates();
          } catch (err) {
            setText(errorNode, err.message || 'Не удалось сохранить отзыв.');
            show(errorNode);
          } finally {
            submit.disabled = false;
          }
        });
      });
    }

    function renderPayments(items) {
      if (!paymentsSummary || !paymentsList) return;
      const pending = items.filter((item) => item.status === 'pending').length;
      const succeeded = items.filter((item) => item.status === 'succeeded').length;
      const cancelled = items.filter((item) => ['cancelled', 'failed'].includes(item.status)).length;
      paymentsSummary.innerHTML = `
        <div class="subcard"><span class="info-label">Всего платежей</span><strong>${items.length}</strong></div>
        <div class="subcard"><span class="info-label">Ожидают</span><strong>${pending}</strong></div>
        <div class="subcard"><span class="info-label">Успешные</span><strong>${succeeded}</strong></div>
        <div class="subcard"><span class="info-label">Отменённые</span><strong>${cancelled}</strong></div>
      `;
      if (!items.length) {
        paymentsList.innerHTML = '<article class="subcard"><h3 class="subcard-title">Оплат пока нет</h3><p>Когда бронь потребует предоплату, здесь появится история платежей.</p></article>';
        return;
      }
      paymentsList.innerHTML = items.map((payment) => `
        <article class="subcard booking-card">
          <div class="booking-card-head">
            <div>
              <h3 class="subcard-title">${escapeHtml(payment.venue_name)} · бронь #${escapeHtml(payment.booking)}</h3>
              <p class="muted-block">${escapeHtml(formatDateTimeRu(payment.created_at) || '')}</p>
            </div>
            <span class="${bookingStatusClass(payment.status === 'succeeded' ? 'confirmed' : payment.status === 'pending' ? 'waiting_for_payment' : 'cancelled')}">${escapeHtml(paymentStatusLabel(payment.status))}</span>
          </div>
          <div class="compact-definition-list top-gap">
            <div><span>Сумма</span><strong>${escapeHtml(formatMoney(payment.amount, payment.currency))}</strong></div>
            <div><span>Провайдер</span><strong>${escapeHtml(payment.provider)}</strong></div>
            <div><span>Статус брони</span><strong>${escapeHtml(bookingStatusLabel(payment.booking_status || 'pending_confirmation'))}</strong></div>
          </div>
          <div class="button-row top-gap">
            <a class="button button-secondary" href="/venues/${encodeURIComponent(payment.venue_slug)}/">Открыть заведение</a>
            ${payment.status === 'pending' ? `<button class="button button-primary account-payment-complete" type="button" data-id="${payment.id}">Завершить учебную оплату</button><button class="button button-secondary account-payment-cancel" type="button" data-id="${payment.id}">Отменить оплату</button>` : ''}
          </div>
        </article>
      `).join('');
      qsa('.account-payment-complete', paymentsList).forEach((button) => {
        button.addEventListener('click', async function () {
          button.disabled = true;
          hide(paymentsError);
          try {
            await apiRequest(`/payments/${button.getAttribute('data-id')}/simulate-success/`, { method: 'POST', token, body: {} });
            await loadPayments();
            await loadBookings();
          } catch (err) {
            setText(paymentsError, err.message || 'Не удалось завершить учебную оплату.');
            show(paymentsError);
          } finally {
            button.disabled = false;
          }
        });
      });
      qsa('.account-payment-cancel', paymentsList).forEach((button) => {
        button.addEventListener('click', async function () {
          button.disabled = true;
          hide(paymentsError);
          try {
            await apiRequest(`/payments/${button.getAttribute('data-id')}/simulate-cancel/`, { method: 'POST', token, body: {} });
            await loadPayments();
            await loadBookings();
          } catch (err) {
            setText(paymentsError, err.message || 'Не удалось отменить оплату.');
            show(paymentsError);
          } finally {
            button.disabled = false;
          }
        });
      });
    }


    function bookingReservationNoteHtml(booking, audience = 'client') {
      if (!booking || booking.status !== 'hold') return '';
      const until = booking.hold_expires_at ? ` до ${formatDateTimeRu(booking.hold_expires_at)}` : '';
      const tail = audience === 'manager' ? ' Клиент уже видит эту бронь в профиле.' : ' Менеджер уже видит эту бронь в кабинете.';
      return `<p class="muted-block top-gap"><strong>Резерв:</strong> выбранные столы заблокированы для других клиентов на выбранный слот${until}.${tail}</p>`;
    }

    function renderBookings(items) {
      const activeItems = items.filter((booking) => !isPastBooking(booking)).sort((left, right) => new Date(left.booking_start) - new Date(right.booking_start));
      const pastItems = items.filter((booking) => isPastBooking(booking)).sort((left, right) => new Date(right.booking_start) - new Date(left.booking_start));
      bookingsSummary.innerHTML = `
        <div class="subcard"><span class="info-label">Всего броней</span><strong>${items.length}</strong></div>
        <div class="subcard"><span class="info-label">Актуальные</span><strong>${activeItems.length}</strong></div>
        <div class="subcard"><span class="info-label">Прошлые</span><strong>${pastItems.length}</strong></div>
      `;
      if (!activeItems.length) {
        activeBookingsRoot.innerHTML = '<article class="subcard"><h3 class="subcard-title">Актуальных броней пока нет</h3><p>Когда вы забронируете стол на будущее время, бронь появится здесь.</p></article>';
      } else {
        activeBookingsRoot.innerHTML = activeItems.map((booking) => `
          <article class="subcard booking-card">
            <div class="booking-card-head">
              <div>
                <h3 class="subcard-title">${escapeHtml(booking.venue_name)} · ${escapeHtml(bookingTablesSummary(booking))}</h3>
                <p class="muted-block">${escapeHtml(formatDateTimeRangeRu(booking.booking_start, booking.booking_end))}</p>
              </div>
              <span class="${bookingStatusClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
            </div>
            <div class="compact-definition-list top-gap">
              <div><span>Зал</span><strong>${escapeHtml(booking.hall_name)}</strong></div>
              <div><span>Столы</span><strong>${escapeHtml(bookingTablesSummary(booking))} · ${escapeHtml(bookingTablesCapacityText(booking))}</strong></div>
              <div><span>Гостей</span><strong>${escapeHtml(booking.guests_count)}</strong></div>
              <div><span>Оплата</span><strong>${escapeHtml(bookingPaymentSummary(booking))}</strong></div>
              <div><span>Комментарий</span><strong>${escapeHtml(booking.customer_comment || 'Не указан')}</strong></div>
            </div>
            ${booking.status === 'waiting_for_payment' ? `<p class="muted-block top-gap"><strong>Оплата:</strong> ${escapeHtml(bookingPaymentDeadlineText(booking))}</p>` : ''}
            <p class="muted-block top-gap"><strong>Отмена:</strong> ${escapeHtml(bookingCancellationPolicyText(booking))}</p>
            ${buildBookingHistoryLine(booking)}
            ${bookingReservationNoteHtml(booking)}
            <div class="button-row top-gap">
              <a class="button button-secondary" href="/venues/${encodeURIComponent((booking.venue_slug || '').trim() || '')}/">Открыть заведение</a>
              ${bookingNeedsPayment(booking) ? `<button class="button button-primary account-booking-pay" type="button" data-id="${booking.id}">Оплатить бронь</button>` : ''}
              ${!['cancelled', 'completed', 'no_show'].includes(booking.status) ? `<button class="button button-secondary account-booking-cancel" type="button" data-id="${booking.id}" data-can-free="${booking.can_cancel_without_penalty ? 'true' : 'false'}" data-penalty="${escapeHtml(formatMoney(booking.cancellation_penalty_amount || booking.required_deposit_amount || 0, booking.cancellation_penalty_currency || booking.required_deposit_currency || 'RUB'))}">Отменить бронь</button>` : ''}
            </div>
          </article>
        `).join('');
      }
      if (!pastItems.length) {
        pastBookingsRoot.innerHTML = '<article class="subcard"><h3 class="subcard-title">История пока пустая</h3><p>Здесь появятся завершённые и отменённые брони.</p></article>';
      } else {
        pastBookingsRoot.innerHTML = pastItems.map((booking) => `
          <article class="subcard booking-card">
            <div class="booking-card-head">
              <div>
                <h3 class="subcard-title">${escapeHtml(booking.venue_name)} · ${escapeHtml(bookingTablesSummary(booking))}</h3>
                <p class="muted-block">${escapeHtml(formatDateTimeRangeRu(booking.booking_start, booking.booking_end))}</p>
              </div>
              <span class="${bookingStatusClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
            </div>
            <div class="compact-definition-list top-gap">
              <div><span>Зал</span><strong>${escapeHtml(booking.hall_name)}</strong></div>
              <div><span>Столы</span><strong>${escapeHtml(bookingTablesSummary(booking))} · ${escapeHtml(bookingTablesCapacityText(booking))}</strong></div>
              <div><span>Гостей</span><strong>${escapeHtml(booking.guests_count)}</strong></div>
              <div><span>Оплата</span><strong>${escapeHtml(bookingPaymentSummary(booking))}</strong></div>
              <div><span>Комментарий</span><strong>${escapeHtml(booking.customer_comment || 'Не указан')}</strong></div>
            </div>
            ${booking.status === 'waiting_for_payment' ? `<p class="muted-block top-gap"><strong>Оплата:</strong> ${escapeHtml(bookingPaymentDeadlineText(booking))}</p>` : ''}
            <p class="muted-block top-gap"><strong>Отмена:</strong> ${escapeHtml(bookingCancellationPolicyText(booking))}</p>
            ${buildBookingHistoryLine(booking)}
            ${bookingReservationNoteHtml(booking)}
          </article>
        `).join('');
      }
      qsa('.account-booking-pay', activeBookingsRoot).forEach((button) => {
        button.addEventListener('click', async function () {
          const bookingId = button.getAttribute('data-id');
          hide(bookingsMessage);
          hide(bookingsError);
          button.disabled = true;
          try {
            const result = await startBookingPaymentFlow(bookingId, token);
            if (result && result.cancelled) {
              setText(bookingsMessage, 'Оплата отменена. Бронь освобождена автоматически.');
              show(bookingsMessage);
              await loadPayments();
              await loadBookings();
            } else if (result && result.completed) {
              setText(bookingsMessage, 'Предоплата внесена успешно. Статус брони обновлён.');
              show(bookingsMessage);
              await loadPayments();
              await loadBookings();
            }
          } catch (err) {
            setText(bookingsError, err.message || 'Не удалось провести оплату.');
            show(bookingsError);
          } finally {
            button.disabled = false;
          }
        });
      });
      qsa('.account-booking-cancel', activeBookingsRoot).forEach((button) => {
        button.addEventListener('click', async function () {
          const bookingId = button.getAttribute('data-id');
          const canFree = button.getAttribute('data-can-free') === 'true';
          const penalty = String(button.getAttribute('data-penalty') || '').trim();
          const confirmed = window.confirm(canFree ? 'Отменить бронь? Сейчас отмена пройдёт без штрафа.' : `Отменить бронь? Бесплатное окно уже прошло.${penalty && penalty !== 'Не требуется' ? ` Возможное удержание: ${penalty}.` : ''}`);
          if (!confirmed) return;
          hide(bookingsMessage); hide(bookingsError);
          button.disabled = true;
          try {
            const cancelled = await apiRequest(`/bookings/${bookingId}/cancel/`, { method: 'POST', token, body: {} });
            setText(bookingsMessage, cancelled.cancelled_without_penalty ? 'Бронь отменена без штрафа. Список обновлён.' : `Бронь отменена. Удержание: ${formatMoney(cancelled.cancellation_penalty_amount || 0, cancelled.cancellation_penalty_currency || 'RUB')}.`);
            show(bookingsMessage);
            await loadBookings();
            await loadPayments();
          } catch (err) {
            setText(bookingsError, err.message || 'Не удалось отменить бронь.');
            show(bookingsError);
          } finally {
            button.disabled = false;
          }
        });
      });
    }

    async function loadBookings() {
      hide(bookingsMessage); hide(bookingsError);
      activeBookingsRoot.innerHTML = '<article class="subcard">Загружаем актуальные брони...</article>';
      pastBookingsRoot.innerHTML = '<article class="subcard">Загружаем историю броней...</article>';
      try {
        const bookings = await apiRequest('/bookings/?scope=mine', { token });
        renderBookings(bookings);
      } catch (err) {
        activeBookingsRoot.innerHTML = '';
        pastBookingsRoot.innerHTML = '';
        bookingsSummary.innerHTML = '';
        setText(bookingsError, err.message || 'Не удалось загрузить брони.');
        show(bookingsError);
      }
    }

    async function loadPayments() {
      if (!paymentsList) return;
      paymentsList.innerHTML = '<article class="subcard">Загружаем оплаты...</article>';
      hide(paymentsError);
      try {
        const payments = await apiRequest('/payments/?scope=mine', { token });
        renderPayments(payments);
      } catch (err) {
        paymentsList.innerHTML = '';
        paymentsSummary.innerHTML = '';
        setText(paymentsError, err.message || 'Не удалось загрузить оплаты.');
        show(paymentsError);
      }
    }

    async function loadReviewCandidates() {
      if (!reviewCandidatesRoot) return;
      try {
        const items = await apiRequest('/reviews/eligible/', { token });
        renderReviewCandidates(items);
      } catch (err) {
        reviewCandidatesRoot.innerHTML = `<article class="subcard"><p class="error-text">${escapeHtml(err.message || 'Не удалось загрузить список для отзывов.')}</p></article>`;
      }
    }

    try {
      const user = await apiRequest('/auth/me/', { token });
      storeSession(token, user);
      if (user.city) setPreferredCity(user.city);
      buildHeader(user);
      renderAccountDetails(user);
      fillAccountForm(user);

      const availableModes = Array.isArray(user.available_modes) ? user.available_modes : ['client'];
      const actions = [['/venues/', 'Клиентский режим']];
      if (availableModes.includes('owner')) actions.push(['/owner/', 'Режим владельца']);
      if (availableModes.includes('manager')) actions.push(['/manager/', 'Режим менеджера']);
      if (availableModes.includes('platform_admin') || availableModes.includes('moderator')) actions.push(['/platform-admin/', 'Режим администратора']);
      qs('#account-actions').innerHTML = actions.map(([href, label]) => `<a class="button button-secondary" href="${href}">${label}</a>`).join('') + `<button class="button button-primary" type="button" id="account-logout">Выйти</button>`;
      qs('#account-logout').addEventListener('click', async function () {
        try { await apiRequest('/auth/logout/', { method: 'POST', token }); } catch (e) {}
        clearSession();
        window.location.href = '/login/';
      });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        hide(success); hide(formError);
        saveButton.disabled = true;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.email = String(payload.email || '').trim().toLowerCase();
        payload.phone = formatPhone(payload.phone || '');
        const validationError = validateProfile(payload);
        if (validationError) {
          setText(formError, validationError);
          show(formError);
          saveButton.disabled = false;
          return;
        }
        try {
          const updated = await apiRequest('/auth/me/', {
            method: 'PATCH',
            token,
            body: {
              last_name: payload.last_name,
              first_name: payload.first_name,
              middle_name: payload.middle_name,
              date_of_birth: payload.date_of_birth,
              email: payload.email,
              phone: payload.phone,
              city: String(payload.city || '').trim()
            }
          });
          storeSession(token, updated);
          setPreferredCity(updated.city || '');
          buildHeader(updated);
          renderAccountDetails(updated);
          fillAccountForm(updated);
          setText(success, 'Данные профиля сохранены.');
          show(success);
        } catch (error) {
          setText(formError, error.message || 'Не удалось сохранить профиль.');
          show(formError);
        } finally {
          saveButton.disabled = false;
        }
      });

      if (bookingsRefreshButton) bookingsRefreshButton.addEventListener('click', loadBookings);
      if (paymentsRefreshButton) paymentsRefreshButton.addEventListener('click', loadPayments);
      await loadBookings();
      await loadPayments();
      await loadReviewCandidates();
      if (returnedFromPayment) {
        setText(bookingsMessage, 'Вы вернулись со страницы оплаты. Списки обновлены.');
        show(bookingsMessage);
      }
      hide(loading); show(card);
    } catch (error) {
      hide(loading); show(errorCard); setText(errorText, error.message || 'Не удалось загрузить профиль.');
    }
  }


  function getVenueCityStats(items) {
    const grouped = {};
    items.forEach((venue) => {
      const city = String(venue.city || 'Без города').trim() || 'Без города';
      grouped[city] = (grouped[city] || 0) + 1;
    });
    return Object.entries(grouped).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }

  function createMapProjection(items) {
    const latValues = items.map((venue) => Number(venue.latitude)).filter((value) => Number.isFinite(value));
    const lngValues = items.map((venue) => Number(venue.longitude)).filter((value) => Number.isFinite(value));
    const minLat = Math.min(...latValues);
    const maxLat = Math.max(...latValues);
    const minLng = Math.min(...lngValues);
    const maxLng = Math.max(...lngValues);
    const latSpan = Math.max(maxLat - minLat, 0.08);
    const lngSpan = Math.max(maxLng - minLng, 0.08);
    return function project(venue) {
      const lat = Number(venue.latitude);
      const lng = Number(venue.longitude);
      const x = 8 + ((lng - minLng) / lngSpan) * 84;
      const y = 8 + ((maxLat - lat) / latSpan) * 84;
      return {
        x: Math.max(5, Math.min(95, x)),
        y: Math.max(5, Math.min(95, y))
      };
    };
  }

  async function mountVenuesPage() {
    if (!qs('#venues-grid')) return;
    const loading = qs('#venues-loading');
    const error = qs('#venues-error');
    const grid = qs('#venues-grid');
    const empty = qs('#venues-empty');
    const searchInput = qs('#venues-search');
    const cityFilter = qs('#venues-city-filter');
    const districtFilter = qs('#venues-district-filter');
    const cuisineFilter = qs('#venues-cuisine-filter');
    const cuisineOptions = qs('#venues-cuisine-options');
    const priceFilter = qs('#venues-price-filter');
    const themeFilter = qs('#venues-theme-filter');
    const confirmationFilter = qs('#venues-confirmation-filter');
    const guestsFilter = qs('#venues-guests-filter');
    const sortFilter = qs('#venues-sort-filter');
    const radiusFilter = qs('#venues-radius-filter');
    const nearbyButton = qs('#venues-nearby-button');
    const nearbyClear = qs('#venues-nearby-clear');
    const detectCityButton = qs('#venues-detect-city');
    const locationNote = qs('#venues-location-note');
    const summary = qs('#venues-summary');
    const mapOpenButton = qs('#venues-open-map');
    const listViewButton = qs('#venues-view-list');
    const mapModal = qs('#venues-map-modal');
    const mapBackdrop = qs('#venues-map-backdrop');
    const mapCloseButton = qs('#venues-map-close');
    const mapLocateButton = qs('#venues-map-locate');
    const mapCanvas = qs('#venues-map-canvas');
    const mapStats = qs('#venues-map-stats');
    const mapSelected = qs('#venues-map-selected');
    const mapList = qs('#venues-map-list');
    const currentUser = getUser();
    const mapsConfig = getMapsConfig();
    let venues = [];
    let nearbyPoint = null;
    let selectedMapSlug = null;
    let currentFilteredVenues = [];
    let currentCatalogView = 'list';
    let mapDataLoaded = false;
    let mapDataLoading = false;
    let userMapPoint = null;
    let externalMapState = null;

    const initialQuery = new URLSearchParams(window.location.search).get('q');
    if (initialQuery && searchInput) searchInput.value = initialQuery;

    function syncCatalogViewButtons() {
      if (listViewButton) {
        listViewButton.classList.toggle('button-primary', currentCatalogView === 'list');
        listViewButton.classList.toggle('button-secondary', currentCatalogView !== 'list');
      }
      if (mapOpenButton) {
        mapOpenButton.classList.toggle('button-primary', currentCatalogView === 'map');
        mapOpenButton.classList.toggle('button-secondary', currentCatalogView !== 'map');
      }
    }

    function setCatalogView(view) {
      currentCatalogView = view === 'map' ? 'map' : 'list';
      syncCatalogViewButtons();
      if (currentCatalogView === 'map') {
        hide(grid);
        hide(empty);
        show(mapModal);
        renderVenueMap().catch((err) => setMapErrorState(err.message || 'Не удалось открыть карту.'));
      } else {
        hide(mapModal);
        renderVenues();
      }
    }

    function setMapLoadingState(message) {
      if (mapCanvas) mapCanvas.innerHTML = `<div class="venue-map-empty">${escapeHtml(message || 'Загружаем карту заведений…')}</div>`;
      if (mapStats) mapStats.innerHTML = '<div><span>Статус</span><strong>...</strong></div>';
      if (mapSelected) mapSelected.innerHTML = '<p class="muted-block">Карта подготавливается.</p>';
      if (mapList) mapList.innerHTML = '';
    }

    function setMapErrorState(message) {
      const safeMessage = message || 'Не удалось загрузить точки карты.';
      if (mapCanvas) mapCanvas.innerHTML = `<div class="venue-map-empty">${escapeHtml(safeMessage)}</div>`;
      if (mapStats) mapStats.innerHTML = '<div><span>Статус</span><strong>Ошибка</strong></div>';
      if (mapSelected) mapSelected.innerHTML = `<p class="error-text">${escapeHtml(safeMessage)}</p>`;
      if (mapList) mapList.innerHTML = '';
    }

    async function loadMapDataIfNeeded() {
      if (mapDataLoaded || mapDataLoading) return;
      mapDataLoading = true;
      setMapLoadingState('Загружаем все партнёрские заведения…');
      try {
        const mapItems = await apiRequest('/venues/map_points/');
        if (Array.isArray(mapItems)) {
          venues = mapItems;
          mapDataLoaded = true;
          populateFilters(venues);
          renderVenues();
        }
      } finally {
        mapDataLoading = false;
      }
    }
    function externalMapProviderLabel() {
      if (mapsConfig.provider === 'google') return 'Google Maps';
      if (mapsConfig.provider === 'yandex') return 'Яндекс.Карты';
      return 'Локальная карта';
    }

    function externalMapConfigured() {
      if (mapsConfig.provider === 'yandex') return Boolean(mapsConfig.yandexApiKey);
      if (mapsConfig.provider === 'google') return Boolean(mapsConfig.googleApiKey);
      return false;
    }

    function buildMapHint(mode, errorMessage) {
      if (mode === 'external') return `Режим карты: ${externalMapProviderLabel()}. Геолокация устройства доступна по кнопке «Показать меня на карте».`;
      if (errorMessage) return `${errorMessage} Используется локальная карта без внешних API.`;
      if (mapsConfig.provider === 'local') return 'Режим карты: локальный. Для фактической подложки укажите MAPS_PROVIDER=yandex или google и API-ключ.';
      return `Режим карты: локальный. Для ${externalMapProviderLabel()} укажите API-ключ в .env.`;
    }

    function averagePoint(items) {
      const coords = items
        .map((venue) => ({ lat: Number(venue.latitude), lng: Number(venue.longitude) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (!coords.length) return { lat: 55.751244, lng: 37.618423 };
      return {
        lat: coords.reduce((sum, point) => sum + point.lat, 0) / coords.length,
        lng: coords.reduce((sum, point) => sum + point.lng, 0) / coords.length
      };
    }

    function clearExternalMap() {
      if (externalMapState && externalMapState.provider === 'yandex' && externalMapState.map && typeof externalMapState.map.destroy === 'function') {
        externalMapState.map.destroy();
      }
      externalMapState = null;
      if (mapCanvas) mapCanvas.classList.remove('external-map');
    }

    function updateMapSidebarStats(items, modeLabel) {
      const cityStats = getVenueCityStats(items);
      mapStats.innerHTML = `
        <div><span>Под фильтрами</span><strong>${items.length}</strong></div>
        <div><span>На карте</span><strong>${items.length}</strong></div>
        <div><span>Городов</span><strong>${cityStats.length}</strong></div>
        <div><span>Режим</span><strong>${escapeHtml(modeLabel)}</strong></div>
      `;
      return cityStats;
    }

    function renderMapList(items, cityStats) {
      const cityList = cityStats.map(([city, count]) => `<span class="pill muted-chip">${escapeHtml(city)} · ${count}</span>`).join('');
      mapList.innerHTML = `
        <div class="venue-map-city-list">${cityList}</div>
        ${items.map((venue) => `
          <button class="venue-map-list-button" type="button" data-slug="${escapeHtml(venue.slug)}">
            <strong>${escapeHtml(venue.name)}</strong>
            <span>${escapeHtml(venue.city)}${venue.district ? ` · ${escapeHtml(venue.district)}` : ''}</span>
          </button>
        `).join('')}
      `;
      qsa('.venue-map-list-button', mapList).forEach((button) => {
        button.addEventListener('click', function () {
          selectMapVenue(button.getAttribute('data-slug'));
        });
      });
    }

    function panExternalMapToVenue(venue) {
      if (!externalMapState || !venue) return;
      const lat = Number(venue.latitude);
      const lng = Number(venue.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (externalMapState.provider === 'yandex') {
        externalMapState.map.setCenter([lat, lng], Math.max(externalMapState.map.getZoom(), 13), { duration: 250 });
      }
      if (externalMapState.provider === 'google') {
        externalMapState.map.panTo({ lat, lng });
        if (externalMapState.map.getZoom() < 12) externalMapState.map.setZoom(12);
        const marker = externalMapState.markers && externalMapState.markers[venue.slug];
        if (marker && externalMapState.infoWindow) {
          externalMapState.infoWindow.setContent(buildGoogleInfoWindow(venue));
          externalMapState.infoWindow.open(externalMapState.map, marker);
        }
      }
    }

    function buildYandexBalloon(venue) {
      return `
        <div class="map-balloon">
          <strong>${escapeHtml(venue.name)}</strong><br>
          <span>${escapeHtml(venue.city)}${venue.district ? ` · ${escapeHtml(venue.district)}` : ''}</span><br>
          <a href="/venues/${encodeURIComponent(venue.slug)}/">Открыть заведение</a>
        </div>
      `;
    }

    function buildGoogleInfoWindow(venue) {
      return `
        <div style="max-width:240px">
          <strong>${escapeHtml(venue.name)}</strong><br>
          <span>${escapeHtml(venue.city)}${venue.district ? ` · ${escapeHtml(venue.district)}` : ''}</span><br>
          <a href="/venues/${encodeURIComponent(venue.slug)}/">Открыть заведение</a>
        </div>
      `;
    }

    function addOrUpdateUserMarker() {
      if (!externalMapState || !userMapPoint) return;
      const lat = Number(userMapPoint.lat);
      const lng = Number(userMapPoint.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (externalMapState.provider === 'yandex') {
        if (externalMapState.userObject) externalMapState.map.geoObjects.remove(externalMapState.userObject);
        externalMapState.userObject = new window.ymaps.Placemark([lat, lng], {
          balloonContent: 'Вы здесь'
        }, {
          preset: 'islands#blueCircleDotIcon',
          iconColor: '#2563eb'
        });
        externalMapState.map.geoObjects.add(externalMapState.userObject);
        externalMapState.map.setCenter([lat, lng], Math.max(externalMapState.map.getZoom(), 13), { duration: 250 });
      }
      if (externalMapState.provider === 'google') {
        const maps = window.google && window.google.maps;
        if (!maps) return;
        if (externalMapState.userObject) externalMapState.userObject.setMap(null);
        externalMapState.userObject = new maps.Marker({
          position: { lat, lng },
          map: externalMapState.map,
          title: 'Вы здесь',
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 4
          }
        });
        externalMapState.map.panTo({ lat, lng });
        if (externalMapState.map.getZoom() < 13) externalMapState.map.setZoom(13);
      }
    }

    async function renderYandexVenueMap(items) {
      const ymaps = await loadYandexMaps(mapsConfig.yandexApiKey);
      clearExternalMap();
      mapCanvas.innerHTML = '';
      mapCanvas.classList.add('external-map');
      const center = averagePoint(items);
      const map = new ymaps.Map(mapCanvas, {
        center: [center.lat, center.lng],
        zoom: items.length > 1 ? 5 : 13,
        controls: ['zoomControl', 'fullscreenControl']
      });
      const collection = new ymaps.GeoObjectCollection();
      items.forEach((venue) => {
        const lat = Number(venue.latitude);
        const lng = Number(venue.longitude);
        const placemark = new ymaps.Placemark([lat, lng], {
          hintContent: venue.name,
          balloonContent: buildYandexBalloon(venue)
        }, {
          preset: 'islands#brownFoodIcon',
          iconColor: '#a86b42'
        });
        placemark.events.add('click', () => selectMapVenue(venue.slug));
        collection.add(placemark);
      });
      map.geoObjects.add(collection);
      if (items.length > 1) {
        try {
          map.setBounds(collection.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
        } catch (error) {}
      }
      externalMapState = { provider: 'yandex', map, collection, userObject: null };
      addOrUpdateUserMarker();
    }

    async function renderGoogleVenueMap(items) {
      const maps = await loadGoogleMaps(mapsConfig.googleApiKey);
      clearExternalMap();
      mapCanvas.innerHTML = '';
      mapCanvas.classList.add('external-map');
      const center = averagePoint(items);
      const mapOptions = {
        center,
        zoom: items.length > 1 ? 5 : 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      };
      if (mapsConfig.googleMapId) mapOptions.mapId = mapsConfig.googleMapId;
      const map = new maps.Map(mapCanvas, mapOptions);
      const infoWindow = new maps.InfoWindow();
      const bounds = new maps.LatLngBounds();
      const markers = {};
      items.forEach((venue) => {
        const position = { lat: Number(venue.latitude), lng: Number(venue.longitude) };
        const marker = new maps.Marker({ position, map, title: venue.name });
        marker.addListener('click', () => {
          selectMapVenue(venue.slug);
          infoWindow.setContent(buildGoogleInfoWindow(venue));
          infoWindow.open(map, marker);
        });
        markers[venue.slug] = marker;
        bounds.extend(position);
      });
      if (items.length > 1) map.fitBounds(bounds, 42);
      externalMapState = { provider: 'google', map, markers, infoWindow, userObject: null };
      addOrUpdateUserMarker();
    }

    async function renderExternalVenueMap(items) {
      if (!externalMapConfigured()) return false;
      if (mapsConfig.provider === 'yandex') {
        await renderYandexVenueMap(items);
        return true;
      }
      if (mapsConfig.provider === 'google') {
        await renderGoogleVenueMap(items);
        return true;
      }
      return false;
    }


    function filteredDistrictsByCity(items, cityValue) {
      return Array.from(new Set(items.filter((venue) => !cityValue || venue.city === cityValue).map((venue) => String(venue.district || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
    }

    function populateFilters(items) {
      const cities = Array.from(new Set(items.map((venue) => String(venue.city || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
      const cuisines = Array.from(new Set(items.map((venue) => String(venue.cuisine || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
      if (cityFilter) cityFilter.innerHTML = '<option value="">Все города</option>' + cities.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      if (cuisineOptions) cuisineOptions.innerHTML = cuisines.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
      refreshDistrictFilter();
    }

    function refreshDistrictFilter() {
      if (!districtFilter) return;
      const current = districtFilter.value;
      const options = filteredDistrictsByCity(venues, String(cityFilter?.value || '').trim());
      districtFilter.innerHTML = '<option value="">Все районы</option>' + options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      if (options.includes(current)) districtFilter.value = current;
    }

    function setSelectedCity(value, sourceLabel) {
      const city = String(value || '').trim();
      if (!cityFilter) return false;
      const options = Array.from(cityFilter.options || []);
      const match = options.find((option) => String(option.value || '').trim().toLowerCase() === city.toLowerCase());
      if (!match) return false;
      cityFilter.value = match.value;
      setPreferredCity(match.value);
      refreshDistrictFilter();
      if (locationNote) {
        locationNote.textContent = sourceLabel ? `${sourceLabel}: ${match.value}` : `Текущий город: ${match.value}`;
        show(locationNote);
      }
      return true;
    }

    function venueDistance(venue) {
      if (!nearbyPoint || !venue.latitude || !venue.longitude) return null;
      return haversineKm(nearbyPoint.lat, nearbyPoint.lng, Number(venue.latitude), Number(venue.longitude));
    }

    function renderVenues() {
      const normalizedSearch = String(searchInput?.value || '').trim().toLowerCase();
      const cityValue = String(cityFilter?.value || '').trim();
      const districtValue = String(districtFilter?.value || '').trim();
      const cuisineValue = String(cuisineFilter?.value || '').trim().toLowerCase();
      const priceValue = String(priceFilter?.value || '').trim();
      const themeValue = String(themeFilter?.value || '').trim();
      const confirmationValue = String(confirmationFilter?.value || '').trim();
      const minGuests = Number(guestsFilter?.value || 0);
      const sortValue = String(sortFilter?.value || 'name').trim();
      let filtered = venues.filter((venue) => {
        const haystack = [venue.name, venue.city, venue.district, venue.address, venue.short_description, venue.cuisine]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
        if (cityValue && venue.city !== cityValue) return false;
        if (districtValue && venue.district !== districtValue) return false;
        if (cuisineValue && !String(venue.cuisine || '').toLowerCase().includes(cuisineValue)) return false;
        if (priceValue && venue.price_category !== priceValue) return false;
        if (themeValue && venue.venue_theme !== themeValue) return false;
        if (confirmationValue === 'manager' && !venue.requires_manager_confirmation) return false;
        if (confirmationValue === 'auto' && venue.requires_manager_confirmation) return false;
        if (minGuests && Number(venue.max_hall_capacity || 0) < minGuests) return false;
        const distance = venueDistance(venue);
        if (nearbyPoint && (distance === null || distance > nearbyPoint.radiusKm)) return false;
        return true;
      });

      filtered.sort((a, b) => {
        if (sortValue === 'rating') return Number(b.average_rating || 0) - Number(a.average_rating || 0);
        if (sortValue === 'capacity') return Number(b.max_hall_capacity || 0) - Number(a.max_hall_capacity || 0);
        if (sortValue === 'distance') {
          const dA = venueDistance(a);
          const dB = venueDistance(b);
          if (dA === null && dB === null) return 0;
          if (dA === null) return 1;
          if (dB === null) return -1;
          return dA - dB;
        }
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });

      currentFilteredVenues = filtered;
      if (currentCatalogView === 'map') {
        hide(grid);
        hide(empty);
        renderVenueMap().catch((err) => setMapErrorState(err.message || 'Не удалось обновить карту.'));
      }
      const districtNote = cityValue ? `Сейчас показываются районы для города «${cityValue}».` : 'Сейчас доступны районы всех городов каталога.';
      summary.textContent = filtered.length
        ? `Найдено заведений: ${filtered.length}. ${districtNote}`
        : 'По выбранным параметрам заведений не найдено. Попробуйте снять часть фильтров.';
      if (!filtered.length) { hide(grid); if (currentCatalogView === 'list') show(empty); return; }
      hide(empty);
      if (currentCatalogView === 'map') { hide(grid); return; }
      grid.innerHTML = filtered.map((venue) => {
        const distance = venueDistance(venue);
        const distanceText = distance !== null ? `${distance.toFixed(1)} км` : '';
        const coverUrl = resolveImageUrl(venue.cover_image_url || '');
        return `
        <article class="venue-card venue-card-with-cover">
          ${coverUrl ? `<div class="venue-card-cover"><img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(venue.name)}" loading="lazy"></div>` : `<div class="venue-card-cover venue-card-cover-empty"><span>WT</span></div>`}
          <div class="eyebrow-row">
            <span class="pill">${escapeHtml(venue.city)}${venue.district ? ` · ${escapeHtml(venue.district)}` : ''}</span>
            <span class="pill pill-rating">★ ${Number(venue.average_rating).toFixed(1)}</span>
          </div>
          <div class="venue-card-body">
            <h2>${escapeHtml(venue.name)}</h2>
            <p>${escapeHtml(venue.short_description || 'Описание пока не заполнено.')}</p>
            <div class="table-chip-list top-gap">
              <span class="pill muted-chip">${escapeHtml(venue.cuisine || 'Кухня уточняется')}</span>
              <span class="pill muted-chip">${escapeHtml(priceCategoryLabel(venue.price_category))}</span>
              <span class="pill muted-chip">${escapeHtml(venueThemeLabel(venue.venue_theme))}</span>
              <span class="pill muted-chip">до ${escapeHtml(venue.max_hall_capacity || 0)} гостей</span>
              ${distanceText ? `<span class="pill muted-chip">${escapeHtml(distanceText)}</span>` : ''}
            </div>
          </div>
          <div class="venue-card-footer">
            <span class="muted-block">${escapeHtml(venue.address)}</span>
            <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/">Открыть</a>
          </div>
        </article>`;
      }).join('');
      show(grid);
    }


    function mapReadyVenues() {
      const source = currentFilteredVenues.length ? currentFilteredVenues : venues;
      return source.filter((venue) => Number.isFinite(Number(venue.latitude)) && Number.isFinite(Number(venue.longitude)));
    }

    function closeVenueMap() {
      setCatalogView('list');
    }

    async function openVenueMap() {
      if (!mapModal) return;
      if (!venues.length || !mapDataLoaded) {
        try {
          await loadMapDataIfNeeded();
        } catch (error) {
          setMapErrorState(error.message || "Не удалось загрузить карту заведений.");
          return;
        }
      }
      setCatalogView('map');
    }

    function selectMapVenue(slug) {
      const items = mapReadyVenues();
      const selected = items.find((venue) => venue.slug === slug) || items[0];
      if (!selected) {
        selectedMapSlug = null;
        if (mapSelected) mapSelected.innerHTML = '<p class="muted-block">На карте пока нет заведений с координатами.</p>';
        return;
      }
      selectedMapSlug = selected.slug;
      if (mapSelected) {
        mapSelected.innerHTML = `
          <article class="map-selected-card">
            <span class="pill">${escapeHtml(selected.city)}${selected.district ? ` · ${escapeHtml(selected.district)}` : ''}</span>
            <h3>${escapeHtml(selected.name)}</h3>
            <p>${escapeHtml(selected.short_description || selected.address || 'Описание пока не заполнено.')}</p>
            <div class="table-chip-list">
              <span class="pill muted-chip">${escapeHtml(selected.cuisine || 'Кухня уточняется')}</span>
              <span class="pill muted-chip">★ ${Number(selected.average_rating || 0).toFixed(1)}</span>
              <span class="pill muted-chip">до ${escapeHtml(selected.max_hall_capacity || 0)} гостей</span>
            </div>
            <a class="button button-primary" href="/venues/${encodeURIComponent(selected.slug)}/">Открыть заведение</a>
          </article>
        `;
      }
      qsa('.venue-map-point', mapCanvas).forEach((point) => {
        point.classList.toggle('active', point.getAttribute('data-slug') === selected.slug);
      });
      qsa('.venue-map-list-button', mapList).forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-slug') === selected.slug);
      });
      panExternalMapToVenue(selected);
    }

    async function renderVenueMap() {
      if (!mapCanvas || !mapStats || !mapList) return;
      const items = mapReadyVenues();
      const cityStats = updateMapSidebarStats(items, externalMapConfigured() ? externalMapProviderLabel() : 'локальная');
      if (!items.length) {
        clearExternalMap();
        mapCanvas.innerHTML = '<div class="venue-map-empty">У заведений пока не заполнены координаты.</div>';
        mapList.innerHTML = '';
        selectMapVenue(null);
        return;
      }

      try {
        if (await renderExternalVenueMap(items)) {
          renderMapList(items, cityStats);
          selectMapVenue(selectedMapSlug || items[0].slug);
          if (mapSelected) mapSelected.insertAdjacentHTML('beforeend', `<p class="muted-block">${escapeHtml(buildMapHint('external'))}</p>`);
          return;
        }
      } catch (error) {
        clearExternalMap();
        if (mapSelected) mapSelected.innerHTML = `<p class="muted-block">${escapeHtml(buildMapHint('local', error.message || 'Внешняя карта не загрузилась.'))}</p>`;
      }

      clearExternalMap();
      const projectionSource = userMapPoint ? items.concat([{ latitude: userMapPoint.lat, longitude: userMapPoint.lng }]) : items;
      const project = createMapProjection(projectionSource);
      const userPoint = userMapPoint ? project({ latitude: userMapPoint.lat, longitude: userMapPoint.lng }) : null;
      mapCanvas.innerHTML = `
        <div class="venue-map-provider-note">${escapeHtml(buildMapHint('local'))}</div>
        <div class="venue-map-watermark">WebTavern map</div>
        <div class="venue-map-grid-bg"></div>
        ${userPoint ? `<div class="venue-map-user-point" style="left:${userPoint.x.toFixed(2)}%; top:${userPoint.y.toFixed(2)}%;"><span class="venue-map-user-dot"></span><span class="venue-map-user-label">Вы здесь</span></div>` : ''}
        ${items.map((venue) => {
          const point = project(venue);
          return `<button class="venue-map-point" type="button" data-slug="${escapeHtml(venue.slug)}" style="left:${point.x.toFixed(2)}%; top:${point.y.toFixed(2)}%;" title="${escapeHtml(venue.name)}">
            <span class="venue-map-point-dot"></span>
            <span class="venue-map-point-label">${escapeHtml(venue.name)}</span>
          </button>`;
        }).join('')}
      `;
      renderMapList(items, cityStats);
      qsa('.venue-map-point', mapCanvas).forEach((point) => {
        point.addEventListener('click', function () {
          selectMapVenue(point.getAttribute('data-slug'));
        });
      });
      selectMapVenue(selectedMapSlug || items[0].slug);
    }

    async function locateUserOnMap() {
      if (!mapModal || mapModal.classList.contains('hidden')) return;
      if (mapLocateButton) mapLocateButton.disabled = true;
      try {
        const position = await resolveCurrentPosition();
        userMapPoint = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude)
        };
        const radiusKm = Number(radiusFilter?.value || 20);
        nearbyPoint = { lat: userMapPoint.lat, lng: userMapPoint.lng, radiusKm };
        if (locationNote) {
          locationNote.textContent = `Геопозиция устройства получена. Радиус поиска: ${radiusKm} км.`;
          show(locationNote);
        }
        renderVenues();
        if (externalMapState) addOrUpdateUserMarker();
        else await renderVenueMap();
      } catch (error) {
        if (mapSelected) mapSelected.insertAdjacentHTML('beforeend', `<p class="error-text">${escapeHtml(error.message || 'Не удалось определить геопозицию устройства.')}</p>`);
      } finally {
        if (mapLocateButton) mapLocateButton.disabled = false;
      }
    }

    window.WebTavernOpenVenueMap = openVenueMap;
    if (listViewButton) listViewButton.addEventListener('click', closeVenueMap);
    if (mapOpenButton) mapOpenButton.addEventListener('click', function () { openVenueMap(); });
    if (mapCloseButton) mapCloseButton.addEventListener('click', closeVenueMap);
    if (mapLocateButton) mapLocateButton.addEventListener('click', function () { locateUserOnMap(); });
    if (mapBackdrop) mapBackdrop.addEventListener('click', closeVenueMap);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && mapModal && !mapModal.classList.contains('hidden')) closeVenueMap();
    });

    try {
      venues = await apiRequest('/venues/');
      mapDataLoaded = true;
      hide(loading);
      populateFilters(venues);
      const initialCity = (currentUser && currentUser.city) || getPreferredCity();
      if (initialCity) setSelectedCity(initialCity, currentUser && currentUser.city ? 'Ваш город проживания' : 'Выбранный город');
      [searchInput, cityFilter, districtFilter, cuisineFilter, priceFilter, themeFilter, confirmationFilter, guestsFilter, sortFilter, radiusFilter].forEach((control) => {
        if (!control) return;
        control.addEventListener('input', function () {
          if (control === cityFilter) refreshDistrictFilter();
          renderVenues();
        });
        if (control.tagName === 'SELECT') control.addEventListener('change', function () {
          if (control === cityFilter) refreshDistrictFilter();
          if (control === radiusFilter && nearbyPoint) nearbyPoint.radiusKm = Number(radiusFilter.value || 20);
          renderVenues();
        });
      });
      if (detectCityButton) detectCityButton.addEventListener('click', async function () {
        detectCityButton.disabled = true;
        if (locationNote) { locationNote.textContent = 'Определяем ваш город…'; show(locationNote); }
        try {
          const detected = await detectCurrentCity();
          if (detected.city && setSelectedCity(detected.city, 'Город определён автоматически')) {
            renderVenues();
          } else if (locationNote) {
            locationNote.textContent = detected.city ? `Город «${detected.city}» не найден в текущем каталоге.` : 'Город определить не удалось. Выберите его вручную.';
            show(locationNote);
          }
        } catch (error) {
          if (locationNote) { locationNote.textContent = error.message || 'Не удалось определить город.'; show(locationNote); }
        } finally {
          detectCityButton.disabled = false;
        }
      });
      if (nearbyButton) nearbyButton.addEventListener('click', async function () {
        nearbyButton.disabled = true;
        try {
          const detected = await detectCurrentCity();
          nearbyPoint = { lat: detected.lat, lng: detected.lng, radiusKm: Number(radiusFilter?.value || 20) };
          if (detected.city) setSelectedCity(detected.city, 'Город определён автоматически');
          if (sortFilter) sortFilter.value = 'distance';
          show(nearbyClear);
          renderVenues();
        } catch (error) {
          summary.textContent = error.message || 'Не удалось определить геопозицию.';
        } finally {
          nearbyButton.disabled = false;
        }
      });
      if (nearbyClear) nearbyClear.addEventListener('click', function () { nearbyPoint = null; hide(nearbyClear); if (sortFilter?.value === 'distance') sortFilter.value = 'name'; renderVenues(); });
      renderVenues();
      if (window.location.hash === '#catalog-map') openVenueMap();
      syncCatalogViewButtons();
    } catch (err) {
      hide(loading); error.textContent = `Ошибка: ${err.message || 'Не удалось загрузить каталог'}`; show(error);
    }
  }


function bookingOccupancyChipClass(state) {
  if (state === 'occupied') return 'venue-layout-status-chip busy';
  if (state === 'held_by_you') return 'venue-layout-status-chip waiting';
  return 'venue-layout-status-chip free';
}

function tableOccupancyClass(state) {
  return (state === 'occupied' || state === 'held_by_you') ? 'layout-viewer-item-occupied' : 'layout-viewer-item-free';
}

function formatDateTimeRu(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildOccupancyText(occupancy) {
  if (!occupancy) return 'Статус не рассчитан';
  if (occupancy.state === 'held_by_you') {
    return occupancy.hold_expires_at ? `Ваша бронь до ${formatDateTimeRu(occupancy.hold_expires_at)}` : 'Ваша бронь';
  }
  if (occupancy.mode === 'interval') {
    if (occupancy.state === 'occupied') {
      if (occupancy.status === 'hold') {
        return occupancy.hold_expires_at ? `Зарезервирован до ${formatDateTimeRu(occupancy.hold_expires_at)}` : 'Стол зарезервирован';
      }
      return occupancy.booking_end ? `Занят в интервале до ${formatDateTimeRu(occupancy.booking_end)}` : 'Занят в выбранный интервал';
    }
    return 'Свободен в выбранный интервал';
  }
  if (occupancy.state !== 'occupied') {
    if (occupancy.booking_end) {
      return `Свободен до ${formatDateTimeRu(occupancy.booking_end)}`;
    }
    return occupancy.label || 'Свободен сейчас';
  }
  if (occupancy.status === 'hold') {
    return occupancy.hold_expires_at ? `Зарезервирован до ${formatDateTimeRu(occupancy.hold_expires_at)}` : 'Стол зарезервирован';
  }
  return occupancy.booking_end ? `Занят до ${formatDateTimeRu(occupancy.booking_end)}` : (occupancy.label || 'Занят сейчас');
}


function activePriceRules(venue) {
  return Array.isArray(venue && venue.price_rules) ? venue.price_rules.filter((rule) => rule && rule.is_active !== false && Number(rule.price_amount || 0) > 0) : [];
}

function findVenueBookingPrice(venue, hall, tableCount, bookingType) {
  const rules = activePriceRules(venue);
  if (bookingType === 'hall' && hall) {
    const hallRule = rules.find((rule) => rule.rule_type === 'whole_hall' && String(rule.hall) === String(hall.id));
    if (hallRule) return hallRule;
  }
  const tableRule = rules.find((rule) => rule.rule_type === 'table_count' && Number(rule.table_count || 0) === Number(tableCount || 0));
  return tableRule || null;
}

function renderVenuePriceRulesSummary(venue) {
  const rules = activePriceRules(venue);
  if (!rules.length) return '<p class="muted-block">Отдельные акции и цены за количество столов не настроены. Если заведению нужна базовая предоплата, она указана в правилах бронирования.</p>';
  const tableRules = rules.filter((rule) => rule.rule_type === 'table_count').sort((a, b) => Number(a.table_count || 0) - Number(b.table_count || 0));
  const hallRules = rules.filter((rule) => rule.rule_type === 'whole_hall');
  return `
    <div class="definition-list compact-definition-list">
      ${tableRules.map((rule) => `<div><span>${escapeHtml(rule.title || `${rule.table_count} стол(ов)`)}</span><strong>${formatMoney(rule.price_amount, rule.price_currency || 'RUB')}</strong></div>`).join('')}
      ${hallRules.map((rule) => `<div><span>${escapeHtml(rule.title || `Зал ${rule.hall_name || ''}`)}</span><strong>${formatMoney(rule.price_amount, rule.price_currency || 'RUB')}</strong></div>`).join('')}
    </div>
  `;
}

async function mountVenueDetailPage() {
  const content = qs('#venue-detail-content');
  if (!content) return;
  const slug = document.body.getAttribute('data-venue-slug');
  const loading = qs('#venue-detail-loading');
  const error = qs('#venue-detail-error');
  try {
    const token = getToken();
    const currentUser = getUser();
    let venue = await apiRequest(`/venues/${slug}/`, token ? { token } : undefined);
    applyVenueBrandingToPage(venue.branding);
    let halls = Array.isArray(venue.halls) ? venue.halls.filter((hall) => hall.is_active !== false) : [];
    const slotStep = venue.booking_rule?.slot_step_minutes || 10;
    const defaultDuration = venue.booking_rule?.default_duration_minutes || 60;
    const minBookingNotice = venue.booking_rule?.min_booking_notice_minutes || 0;

    content.innerHTML = `
      <section class="hero hero-venue">
        <div class="eyebrow-row">
          <span class="pill">${escapeHtml(venue.city)}</span>
          <span class="pill pill-rating">★ ${Number(venue.average_rating).toFixed(1)}</span>
        </div>
        <h1>${escapeHtml(venue.name)}</h1>
        <p class="hero-text">${escapeHtml(venue.description || venue.short_description || 'Описание пока не заполнено.')}</p>
        <div class="info-grid">
          <div class="info-card"><span class="info-label">Адрес</span><strong>${escapeHtml(venue.address)}</strong></div>
          <div class="info-card"><span class="info-label">Стоимость брони</span><strong>${activePriceRules(venue).length ? 'По акциям' : (venue.booking_rule && Number(venue.booking_rule.deposit_amount || 0) > 0 ? `${escapeHtml(formatMoney(venue.booking_rule.deposit_amount, venue.booking_rule.deposit_currency || 'RUB'))}` : 'Без предоплаты')}</strong></div>
          <div class="info-card"><span class="info-label">Подтверждение</span><strong>${venue.booking_rule && venue.booking_rule.requires_manager_confirmation ? 'Менеджером' : 'Автоматически'}</strong></div>
        </div>
        <div class="button-row top-gap">
          <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/reviews/">Отзывы и ответы</a>
        </div>
      </section>
      <section class="venue-detail-columns">
        <div class="venue-detail-left-stack">
          <article class="panel">
          <div class="section-topline"><span class="section-kicker">Бронирование</span><h2>Правила посещения</h2></div>
          ${venue.booking_rule ? `
            <div class="definition-list">
              <div><span>Базовая длительность</span><strong>${venue.booking_rule.default_duration_minutes} мин.</strong></div>
              <div><span>Шаг временных слотов</span><strong>${venue.booking_rule.slot_step_minutes} мин.</strong></div>
              <div><span>Буфер уборки</span><strong>${venue.booking_rule.cleanup_buffer_minutes} мин.</strong></div>
              <div><span>Резерв слота</span><strong>до конца выбранного интервала</strong></div>
              <div><span>Минимум до начала брони</span><strong>${venue.booking_rule.min_booking_notice_minutes} мин.</strong></div>
              <div><span>Отмена без штрафа</span><strong>Не позже чем за ${venue.booking_rule.free_cancellation_before_minutes} мин.</strong></div>
              <div><span>Неявка</span><strong>Через ${venue.booking_rule.no_show_after_minutes} мин. после начала</strong></div>
              <div><span>Разрешено примерное время</span><strong>${venue.booking_rule.allow_client_approximate_time ? 'Да' : 'Нет'}</strong></div>
              <div><span>Объединение столов</span><strong>${venue.booking_rule.allow_table_combination ? 'Да' : 'Нет'}</strong></div>
              <div><span>Подсадка гостей</span><strong>${venue.booking_rule.allow_shared_seating ? 'Да' : 'Нет'}</strong></div>
            </div>` : '<p>Правила пока не настроены.</p>'}
          </article>
          <article class="panel">
            <div class="section-topline"><span class="section-kicker">Акции</span><h2>Стоимость бронирования</h2></div>
            ${renderVenuePriceRulesSummary(venue)}
          </article>
          ${renderVenuePhotoSection(venue.images, { subtitle: 'Фотографии помогают заранее оценить интерьер, атмосферу и расположение залов.' })}
        </div>
        <article class="panel venue-detail-booking-panel">
          <div class="section-topline"><span class="section-kicker">Залы</span><h2>Полный сценарий бронирования</h2></div>
          ${halls.length ? `
            <div class="venue-layout-toolbar top-gap">
              <label class="field selector-field venue-layout-select-field">
                <span>Помещение</span>
                <select id="client-hall-select">
                  ${halls.map((hall) => `<option value="${hall.id}">${escapeHtml(hall.name)}</option>`).join('')}
                </select>
              </label>
              <div class="venue-layout-legend">
                <span class="venue-layout-status-chip free">Свободен</span>
                <span class="venue-layout-status-chip busy">Занят</span>
                <span class="venue-layout-status-chip selected">Выбран</span>
              </div>
            </div>
            <div class="grid grid-two top-gap venue-layout-summary-grid">
              <article class="subcard stack-sm">
                <div class="hall-header">
                  <div>
                    <h3 id="client-hall-title"></h3>
                    <p id="client-hall-description"></p>
                  </div>
                  <span class="pill" id="client-hall-capacity-pill"></span>
                </div>
                <div class="definition-list" id="client-hall-stats"></div>
              </article>
              <article class="subcard stack-sm">
                <h3 class="subcard-title">Столы в помещении</h3>
                <div id="client-hall-table-list" class="venue-layout-table-list"></div>
              </article>
            </div>
            <div class="layout-zoom-toolbar top-gap">
              <button class="button button-secondary" type="button" id="client-layout-zoom-out">−</button>
              <button class="button button-secondary" type="button" id="client-layout-zoom-fit">Показать целиком</button>
              <button class="button button-secondary" type="button" id="client-layout-zoom-in">+</button>
              <span class="pill" id="client-layout-zoom-value">100%</span>
            </div>
            <div class="layout-shell layout-stage-wrapper venue-layout-viewer" id="client-layout-wrapper">
              <div class="layout-stage-sizer" id="client-layout-sizer">
                <div class="layout-stage" id="client-layout-stage">
                  <div class="layout-grid-overlay"></div>
                </div>
              </div>
            </div>
            <p class="muted-block hidden top-gap" id="client-layout-empty">Для этого помещения пока не собрана схема, но список столов уже доступен выше.</p>
            <article class="subcard top-gap booking-form-card">
              <div class="section-topline"><span class="section-kicker">Бронирование</span><h3>Выберите столы и время брони</h3></div>
              <p class="muted-block">Укажите дату и время визита прямо в этой форме. Затем выберите один или несколько свободных столов на схеме или в списке. Повторное нажатие снимает выбор. После отправки выбранные столы сразу резервируются на выбранный слот и становятся недоступны для других клиентов.</p>
              <div class="grid grid-two booking-form-grid top-gap">
                <div class="stack-sm">
                  <label class="field"><span>Тип бронирования</span>
                    <select id="client-booking-type" name="booking_type">
                      <option value="tables">Выбрать столы</option>
                      <option value="hall">Забронировать зал целиком</option>
                    </select>
                  </label>
                  <p class="booking-selected-inline" id="client-selected-table-inline">Столы пока не выбраны. Укажите дату и время, затем выберите один или несколько свободных столов на схеме или в списке выше.</p>
                  <p class="muted-block" id="client-booking-price-preview">Стоимость будет рассчитана после выбора столов или зала.</p>
                  <form class="form" id="client-booking-form">
                    <input type="hidden" id="client-booking-table" name="tables">
                    <div class="grid grid-two">
                      <label class="field"><span>Гостей</span><input type="number" id="client-booking-guests" name="guests_count" min="1" step="1" required></label>
                      <div class="field read-only-field"><span>Интервал брони</span><div class="booking-interval-preview" id="client-booking-interval-preview">Укажите дату и время посещения</div></div>
                    </div>
                    <div class="grid grid-two top-gap">
                      <label class="field"><span>Начало визита</span><input type="datetime-local" id="client-booking-start" name="booking_start" required></label>
                      <label class="field"><span>Окончание визита</span><input type="datetime-local" id="client-booking-end" name="booking_end" required></label>
                    </div>
                    <p class="success-text hidden top-gap" id="client-availability-message"></p>
                    <p class="muted-block hidden top-gap realtime-status-line" id="client-realtime-message"></p>
                    <p class="error-text hidden top-gap" id="client-availability-error"></p>
                    <label class="field"><span>Комментарий</span><textarea id="client-booking-comment" name="customer_comment" rows="4" placeholder="Например: нужен стол ближе к окну"></textarea></label>
                    <div class="button-row">
                      <button class="button button-primary" type="submit" id="client-booking-submit">Забронировать</button>
                    </div>
                  </form>
                  <p class="success-text hidden" id="client-booking-message"></p>
                  <p class="error-text hidden" id="client-booking-error"></p>
                  <p class="muted-block hidden" id="client-hold-note"></p>
                  <div class="top-gap hidden" id="client-payment-actions">
                    <div class="muted-block" id="client-payment-note">Бронь создана и ждёт оплаты.</div>
                    <div class="button-row top-gap">
                      <button class="button button-primary" type="button" id="client-booking-pay-now">Оплатить бронь</button>
                    </div>
                  </div>
                </div>
                <div class="stack-sm">
                  <div class="muted-block ${token ? 'hidden' : ''}" id="client-booking-auth-note">Чтобы создать бронь, сначала войдите в аккаунт. Клиентский режим доступен для любого авторизованного пользователя. После входа вернитесь на страницу заведения и выберите интервал и стол ещё раз.</div>
                  <div class="definition-list compact-definition-list">
                    <div><span>Статус новой брони</span><strong>Зарезервировано на выбранный слот</strong></div>
                    <div><span>Базовая длительность</span><strong>${venue.booking_rule ? `${venue.booking_rule.default_duration_minutes} мин.` : 'По настройке заведения'}</strong></div>
                    <div><span>Минимум до начала</span><strong>${venue.booking_rule ? `${venue.booking_rule.min_booking_notice_minutes} мин.` : 'По настройке заведения'}</strong></div>
                    <div><span>Отмена без штрафа</span><strong>${venue.booking_rule ? `Не позже чем за ${venue.booking_rule.free_cancellation_before_minutes} мин.` : 'По настройке заведения'}</strong></div>
                    <div><span>Неявка</span><strong>${venue.booking_rule ? `Через ${venue.booking_rule.no_show_after_minutes} мин. после начала` : 'По настройке заведения'}</strong></div>
                    <div><span>Резерв столов</span><strong>выбранные столы блокируются для других клиентов</strong></div>
                  </div>
                  ${token ? '<div class="muted-block">Вы вошли в систему и можете сразу отправить бронь. Выбранные столы будут сразу зарезервированы на выбранный интервал, а менеджер увидит бронь в кабинете.</div>' : '<div class="button-row"><a class="button button-primary" href="/login/">Войти, чтобы забронировать</a></div>'}
                </div>
              </div>
            </article>
          ` : '<p>Залы и столы ещё не настроены.</p>'}
        </article>
      </section>
    `;

    applyVenueBrandingToContainer(content, venue.branding);
    initializeVenuePhotoSliders(content);

    if (!halls.length) {
      hide(loading);
      show(content);
      return;
    }

    const hallSelect = qs('#client-hall-select', content);
    const hallTitle = qs('#client-hall-title', content);
    const hallDescription = qs('#client-hall-description', content);
    const hallCapacityPill = qs('#client-hall-capacity-pill', content);
    const hallStats = qs('#client-hall-stats', content);
    const tableList = qs('#client-hall-table-list', content);
    const layoutWrapper = qs('#client-layout-wrapper', content);
    const layoutSizer = qs('#client-layout-sizer', content);
    const layoutStage = qs('#client-layout-stage', content);
    const layoutEmpty = qs('#client-layout-empty', content);
    const zoomOutButton = qs('#client-layout-zoom-out', content);
    const zoomInButton = qs('#client-layout-zoom-in', content);
    const zoomFitButton = qs('#client-layout-zoom-fit', content);
    const zoomValue = qs('#client-layout-zoom-value', content);
    const bookingForm = qs('#client-booking-form', content);
    const bookingTableInput = qs('#client-booking-table', content);
    const bookingTypeSelect = qs('#client-booking-type', content);
    const bookingPricePreview = qs('#client-booking-price-preview', content);
    const bookingStartInput = qs('#client-booking-start', content);
    const bookingEndInput = qs('#client-booking-end', content);
    const bookingGuestsInput = qs('#client-booking-guests', content);
    const bookingCommentInput = qs('#client-booking-comment', content);
    const bookingSubmit = qs('#client-booking-submit', content);
    const bookingMessage = qs('#client-booking-message', content);
    const bookingError = qs('#client-booking-error', content);
    const selectedTableInline = qs('#client-selected-table-inline', content);
    const intervalPreview = qs('#client-booking-interval-preview', content);
    const availabilityMessage = qs('#client-availability-message', content);
    const realtimeMessage = qs('#client-realtime-message', content);
    const availabilityError = qs('#client-availability-error', content);
    const authNote = qs('#client-booking-auth-note', content);
    const paymentActions = qs('#client-payment-actions', content);
    const paymentNote = qs('#client-payment-note', content);
    const payNowButton = qs('#client-booking-pay-now', content);
    let pendingPaymentBookingId = null;
    let pendingHoldBookingId = null;
    let pendingHoldExpiresAt = null;
    let holdTimerId = null;
    const holdNote = qs('#client-hold-note', content);
    const layoutState = { zoom: 1, selectedTableIds: [], bookingType: 'tables' };

    function resetHoldUi() {
      pendingHoldBookingId = null;
      pendingHoldExpiresAt = null;
      if (holdTimerId) { window.clearInterval(holdTimerId); holdTimerId = null; }
      if (holdNote) { holdNote.textContent = ''; hide(holdNote); }
      if (bookingSubmit) bookingSubmit.textContent = 'Забронировать';
    }

    function showReservedNote(booking) {
      if (!holdNote) return;
      const untilText = booking?.hold_expires_at ? ` Резерв активен до ${formatDateTimeRu(booking.hold_expires_at)}.` : '';
      setText(holdNote, `Выбранные столы зарезервированы за вами на выбранный слот.${untilText} Менеджер уже видит эту бронь.`);
      show(holdNote);
    }

    function activateHoldState(booking) {
      pendingHoldBookingId = null;
      pendingHoldExpiresAt = booking?.hold_expires_at || null;
      if (holdTimerId) { window.clearInterval(holdTimerId); holdTimerId = null; }
      if (bookingSubmit) bookingSubmit.textContent = 'Забронировать';
      showReservedNote(booking);
    }

    async function releasePendingHoldSilently() {
      resetHoldUi();
    }

    function activeTablesForHall(hall) {
      return (Array.isArray(hall.tables) ? hall.tables : []).filter((table) => table.is_active !== false);
    }

    function getCurrentHall() {
      return halls.find((item) => String(item.id) === String(hallSelect.value)) || halls[0];
    }

    function getCurrentTables() {
      const hall = getCurrentHall();
      return hall ? activeTablesForHall(hall) : [];
    }

    function getSelectedInterval() {
      const startRaw = String(bookingStartInput.value || '').trim();
      const endRaw = String(bookingEndInput.value || '').trim();
      if (!startRaw || !endRaw) return null;
      const startDate = new Date(startRaw);
      const endDate = new Date(endRaw);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return null;
      return {
        startRaw,
        endRaw,
        startDate,
        endDate,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
      };
    }

    function updateIntervalPreview() {
      const interval = getSelectedInterval();
      if (!interval) {
        intervalPreview.textContent = 'Укажите корректные дату и время посещения';
        return;
      }
      intervalPreview.textContent = formatDateTimeRangeRu(interval.startIso, interval.endIso);
    }

    function syncEndInput(force = false) {
      bookingStartInput.min = buildDefaultBookingLocalValue(slotStep, minBookingNotice);
      bookingEndInput.min = bookingStartInput.value || '';
      const interval = getSelectedInterval();
      if (force || !interval) {
        const nextValue = shiftLocalDateTimeValue(bookingStartInput.value, defaultDuration);
        if (nextValue) bookingEndInput.value = nextValue;
      }
      bookingEndInput.min = bookingStartInput.value || '';
      updateIntervalPreview();
    }

    function setViewerZoom(value, hall) {
      const canvasWidth = hall.layout?.canvas_width || 960;
      const canvasHeight = hall.layout?.canvas_height || 680;
      layoutState.zoom = clampValue(Number(value) || 1, 0.35, 2.4);
      layoutStage.style.transform = `scale(${layoutState.zoom})`;
      layoutSizer.style.width = `${Math.round(canvasWidth * layoutState.zoom)}px`;
      layoutSizer.style.height = `${Math.round(canvasHeight * layoutState.zoom)}px`;
      zoomValue.textContent = `${Math.round(layoutState.zoom * 100)}%`;
    }

    function fitViewerZoom(hall) {
      if (!layoutWrapper) return;
      const width = hall.layout?.canvas_width || 960;
      const height = hall.layout?.canvas_height || 680;
      const availableWidth = Math.max(layoutWrapper.clientWidth - 28, 240);
      const availableHeight = Math.max(layoutWrapper.clientHeight - 28, 220);
      const nextZoom = Math.min(availableWidth / width, availableHeight / height, 1.35);
      setViewerZoom(nextZoom, hall);
      layoutWrapper.scrollLeft = 0;
      layoutWrapper.scrollTop = 0;
    }

    function selectedTableIdSet() {
      return new Set((layoutState.selectedTableIds || []).map((id) => String(id)));
    }

    function updateClientPricePreview(hall, selectedTables) {
      if (!bookingPricePreview) return;
      const type = bookingTypeSelect ? String(bookingTypeSelect.value || 'tables') : 'tables';
      const tableCount = selectedTables.length;
      if (type !== 'hall' && tableCount === 0) {
        bookingPricePreview.textContent = 'Выберите один или несколько столов — итоговая предоплата рассчитается автоматически.';
        return;
      }
      const rule = findVenueBookingPrice(venue, hall, tableCount, type);
      if (rule) {
        const label = rule.title || (type === 'hall' ? 'бронь зала целиком' : `${tableCount} стол(ов)`);
        bookingPricePreview.innerHTML = `<strong>Итоговая предоплата:</strong> ${escapeHtml(formatMoney(rule.price_amount, rule.price_currency || 'RUB'))}<br><span>Применено правило: ${escapeHtml(label)}.</span>`;
      } else if (venue.booking_rule && Number(venue.booking_rule.deposit_amount || 0) > 0) {
        bookingPricePreview.innerHTML = `<strong>Итоговая предоплата:</strong> ${escapeHtml(formatMoney(venue.booking_rule.deposit_amount, venue.booking_rule.deposit_currency || 'RUB'))}<br><span>Используется базовое правило заведения, потому что отдельная акция не настроена.</span>`;
      } else {
        bookingPricePreview.textContent = 'Для выбранного варианта предоплата не настроена. Бронь создаётся без обязательной оплаты.';
      }
    }

    function refreshTableSelectionStyles() {
      const selectedIds = selectedTableIdSet();
      qsa('[data-table-id]', content).forEach((node) => {
        const selected = selectedIds.has(String(node.getAttribute('data-table-id')));
        node.classList.toggle('is-selected', selected);
      });
    }

    function syncBookingSelection(hall) {
      const tables = activeTablesForHall(hall);
      if (!tables.length) {
        bookingTableInput.value = '';
        layoutState.selectedTableIds = [];
        bookingGuestsInput.value = '1';
        bookingGuestsInput.max = '1';
        selectedTableInline.innerHTML = '<strong>В этом помещении нет активных столов.</strong> Сначала владелец или менеджер должны добавить их в зал.';
        refreshTableSelectionStyles();
        return;
      }
      const bookingType = bookingTypeSelect ? String(bookingTypeSelect.value || 'tables') : 'tables';
      let selectedTables = [];
      if (bookingType === 'hall') {
        selectedTables = tables.slice();
        layoutState.selectedTableIds = selectedTables.map((table) => table.id);
      } else {
        const selectedIds = new Set((layoutState.selectedTableIds || []).map((id) => Number(id)));
        selectedTables = tables.filter((table) => selectedIds.has(Number(table.id)) && table.occupancy?.state !== 'occupied' && table.occupancy?.state !== 'held_by_you');
        layoutState.selectedTableIds = selectedTables.map((table) => table.id);
      }
      bookingTableInput.value = layoutState.selectedTableIds.join(',');
      if (!selectedTables.length) {
        bookingGuestsInput.value = '1';
        bookingGuestsInput.max = String(Math.max(...tables.map((table) => Number(table.seats_count) || 1), 1));
        selectedTableInline.innerHTML = bookingType === 'hall' ? 'В выбранном зале нет активных столов для бронирования целиком.' : 'Столы пока не выбраны. Укажите дату и время, затем выберите <strong>один или несколько свободных</strong> столов на схеме или в списке выше.';
        updateClientPricePreview(hall, []);
        refreshTableSelectionStyles();
        return;
      }
      const totalSeats = selectedTables.reduce((sum, table) => sum + (Number(table.seats_count) || 0), 0);
      const guestsDefault = Math.max(1, Math.min(Number(bookingGuestsInput.value) || totalSeats || 1, Math.max(totalSeats || 1, 1)));
      bookingGuestsInput.value = String(guestsDefault);
      bookingGuestsInput.max = String(Math.max(totalSeats || 1, 1));
      const names = selectedTables.map((table) => `${escapeHtml(table.name)} (${escapeHtml(table.seats_count)} мест)`).join(', ');
      if (bookingType === 'hall') {
        const busyCount = selectedTables.filter((table) => table.occupancy?.state === 'occupied' || table.occupancy?.state === 'held_by_you').length;
        selectedTableInline.innerHTML = `Выбран зал целиком: <strong>${escapeHtml(hall.name)}</strong> · ${escapeHtml(selectedTables.length)} столов · ${escapeHtml(totalSeats)} мест${busyCount ? `<br><span class="error-text">${busyCount} стол(ов) заняты в выбранный интервал. Для брони всего зала выберите другое время.</span>` : ''}`;
      } else {
        selectedTableInline.innerHTML = `Выбрано столов: <strong>${selectedTables.length}</strong> · ${escapeHtml(totalSeats)} мест суммарно<br><span>${names}</span>`;
      }
      updateClientPricePreview(hall, selectedTables);
      refreshTableSelectionStyles();
    }

    function selectTable(tableId) {
      const hall = getCurrentHall();
      if (!hall) return;
      if (bookingTypeSelect && bookingTypeSelect.value === 'hall') return;
      const candidate = activeTablesForHall(hall).find((table) => table.id === Number(tableId));
      if (!candidate || candidate.occupancy?.state === 'occupied' || candidate.occupancy?.state === 'held_by_you') return;
      const id = Number(candidate.id);
      const current = Array.isArray(layoutState.selectedTableIds) ? layoutState.selectedTableIds.map(Number) : [];
      if (current.includes(id)) {
        layoutState.selectedTableIds = current.filter((item) => item !== id);
      } else {
        layoutState.selectedTableIds = current.concat(id);
      }
      syncBookingSelection(hall);
    }

    function renderHall(hallId) {
      const hall = halls.find((item) => String(item.id) === String(hallId)) || halls[0];
      if (!hall) return;
      const tables = activeTablesForHall(hall);
      const occupiedCount = tables.filter((table) => table.occupancy && (table.occupancy.state === 'occupied' || table.occupancy.state === 'held_by_you')).length;
      const freeCount = Math.max(tables.length - occupiedCount, 0);
      const interval = getSelectedInterval();

      hallTitle.textContent = hall.name;
      hallDescription.textContent = hall.description || 'Описание помещения пока не заполнено.';
      hallCapacityPill.textContent = `до ${hall.capacity} гостей`;
      hallStats.innerHTML = `
        <div><span>Столов в помещении</span><strong>${tables.length}</strong></div>
        <div><span>${interval ? 'Свободно в интервал' : 'Свободно сейчас'}</span><strong>${freeCount}</strong></div>
        <div><span>${interval ? 'Недоступно в интервал' : 'Занято сейчас'}</span><strong>${occupiedCount}</strong></div>
        <div><span>Вместимость зала</span><strong>${hall.capacity || 0} мест</strong></div>
      `;
      tableList.innerHTML = tables.length ? tables.map((table) => {
        const occupied = table.occupancy && (table.occupancy.state === 'occupied' || table.occupancy.state === 'held_by_you');
        const selected = (layoutState.selectedTableIds || []).map(Number).includes(Number(table.id));
        return `
          <button type="button" class="venue-layout-table-card selectable ${occupied ? 'busy is-disabled' : (selected ? 'free is-selected' : 'free')}" data-table-id="${table.id}" ${occupied ? 'disabled' : ''}>
            <div>
              <strong>${escapeHtml(table.name)}</strong>
              <div class="muted-block">${escapeHtml(table.seats_count)} мест</div>
            </div>
            <span class="${bookingOccupancyChipClass(table.occupancy?.state)}">${escapeHtml(buildOccupancyText(table.occupancy))}</span>
          </button>
        `;
      }).join('') : '<p class="muted-block">Для этого помещения пока не добавлены столы.</p>';

      const canvasWidth = hall.layout?.canvas_width || 960;
      const canvasHeight = hall.layout?.canvas_height || 680;
      layoutStage.style.width = `${canvasWidth}px`;
      layoutStage.style.height = `${canvasHeight}px`;
      qsa('.layout-viewer-item', layoutStage).forEach((node) => node.remove());

      if (!hall.layout) {
        show(layoutEmpty);
      } else {
        hide(layoutEmpty);
        const decorItems = Array.isArray(hall.layout.decor_items) ? hall.layout.decor_items : [];
        decorItems.forEach((item) => {
          const renderPos = getItemRenderPosition({
            kind: 'decor',
            item_type: item.item_type,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation || 0,
          });
          const node = document.createElement('div');
          node.className = `layout-editor-item layout-viewer-item layout-editor-item-${item.item_type}`;
          node.style.left = `${renderPos.left}px`;
          node.style.top = `${renderPos.top}px`;
          node.style.width = `${item.width}px`;
          node.style.height = `${item.height}px`;
          node.style.transform = `rotate(${item.rotation || 0}deg)`;
          node.innerHTML = `<span>${escapeHtml(item.label || layoutDecorTypeLabel(item.item_type))}</span>`;
          layoutStage.appendChild(node);
        });
      }

      tables.forEach((table, index) => {
        const layoutItem = table.layout_item || {
          x: 36 + ((index % 4) * 150),
          y: 36 + (Math.floor(index / 4) * 120),
          width: FLOOR_ITEM_DEFAULTS.table.width,
          height: FLOOR_ITEM_DEFAULTS.table.height,
          rotation: 0,
        };
        const renderPos = getItemRenderPosition({
          kind: 'table',
          x: layoutItem.x,
          y: layoutItem.y,
          width: layoutItem.width,
          height: layoutItem.height,
          rotation: layoutItem.rotation || 0,
        });
        const occupied = table.occupancy?.state === 'occupied' || table.occupancy?.state === 'held_by_you';
        const selected = (layoutState.selectedTableIds || []).map(Number).includes(Number(table.id));
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `layout-editor-item layout-editor-item-table layout-viewer-item layout-viewer-table-button ${tableOccupancyClass(table.occupancy?.state)}${occupied ? ' is-disabled' : ''}${selected ? ' is-selected' : ''}`;
        node.setAttribute('data-table-id', String(table.id));
        node.style.left = `${renderPos.left}px`;
        node.style.top = `${renderPos.top}px`;
        node.style.width = `${layoutItem.width}px`;
        node.style.height = `${layoutItem.height}px`;
        node.style.transform = `rotate(${layoutItem.rotation || 0}deg)`;
        node.disabled = occupied;
        node.innerHTML = `
          <strong>${escapeHtml(table.name)}</strong>
          <span>${escapeHtml(table.seats_count)} мест</span>
          <small class="layout-viewer-table-meta">${escapeHtml(buildOccupancyText(table.occupancy))}</small>
        `;
        if (!occupied) {
          node.addEventListener('click', function () {
            selectTable(table.id);
          });
        }
        layoutStage.appendChild(node);
      });

      qsa('.venue-layout-table-card.selectable:not([disabled])', tableList).forEach((card) => {
        card.addEventListener('click', function () {
          selectTable(card.getAttribute('data-table-id'));
        });
      });

      syncBookingSelection(hall);
      fitViewerZoom(hall);
      zoomOutButton.onclick = function () { setViewerZoom(layoutState.zoom - 0.1, hall); };
      zoomInButton.onclick = function () { setViewerZoom(layoutState.zoom + 0.1, hall); };
      zoomFitButton.onclick = function () { fitViewerZoom(hall); };
    }

    async function refreshAvailability(silent = false) {
      const interval = getSelectedInterval();
      updateIntervalPreview();
      if (!interval) {
        setText(availabilityError, 'Укажите корректный интервал: окончание должно быть позже начала.');
        show(availabilityError);
        hide(availabilityMessage);
        return;
      }
      hide(availabilityError);
      const currentHallId = hallSelect.value;
      const selectedTableIds = Array.isArray(layoutState.selectedTableIds) ? layoutState.selectedTableIds.slice() : [];
      try {
        if (!silent) {
          setText(availabilityMessage, 'Обновляем доступность столов для выбранного интервала…');
          show(availabilityMessage);
        }
        const freshVenue = await apiRequest(`/venues/${slug}/?booking_start=${encodeURIComponent(interval.startIso)}&booking_end=${encodeURIComponent(interval.endIso)}`, token ? { token } : undefined);
        venue = freshVenue;
        halls = Array.isArray(freshVenue.halls) ? freshVenue.halls.filter((hall) => hall.is_active !== false) : [];
        hallSelect.innerHTML = halls.map((hall) => `<option value="${hall.id}">${escapeHtml(hall.name)}</option>`).join('');
        if (halls.some((hall) => String(hall.id) === String(currentHallId))) {
          hallSelect.value = String(currentHallId);
        }
        layoutState.selectedTableIds = selectedTableIds;
        renderHall(hallSelect.value);
        setText(availabilityMessage, `Доступность обновлена для интервала ${formatDateTimeRangeRu(interval.startIso, interval.endIso)}.`);
        show(availabilityMessage);
      } catch (err) {
        setText(availabilityError, err.message || 'Не удалось обновить доступность столов.');
        show(availabilityError);
      }
    }


    let realtimeRefreshTimer = null;
    const realtimeExpiryTimers = new Set();

    function scheduleRealtimeRefresh(payload, delay = 180) {
      if (payload && payload.venue_id && String(payload.venue_id) !== String(venue.id)) return;
      if (realtimeRefreshTimer) window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = window.setTimeout(async function () {
        realtimeRefreshTimer = null;
        const previousSelection = Array.isArray(layoutState.selectedTableIds) ? layoutState.selectedTableIds.slice() : [];
        await refreshAvailability(true);
        const stillSelected = (layoutState.selectedTableIds || []).filter((tableId) => {
          const currentHall = getCurrentHall();
          const table = (currentHall && Array.isArray(currentHall.tables) ? currentHall.tables : []).find((item) => Number(item.id) === Number(tableId));
          return table && table.occupancy && table.occupancy.state === 'free';
        });
        if (stillSelected.length !== previousSelection.length) {
          layoutState.selectedTableIds = stillSelected;
          renderHall(hallSelect.value);
        }
      }, delay);
    }

    function scheduleRefreshAt(value) {
      if (!value) return;
      const when = new Date(value).getTime();
      if (!when || Number.isNaN(when)) return;
      const delay = Math.max(0, Math.min(2147480000, when - Date.now() + 600));
      const id = window.setTimeout(function () {
        realtimeExpiryTimers.delete(id);
        scheduleRealtimeRefresh({ venue_id: venue.id }, 0);
      }, delay);
      realtimeExpiryTimers.add(id);
    }

    function handleVenueRealtimeEvent(payload) {
      const realtimeTypes = new Set([
        'table_occupancy_changed',
        'booking_hold_created',
        'booking_hold_confirmed',
        'booking_confirmed',
        'booking_rescheduled',
        'booking_cancelled',
        'booking_no_show',
        'payment_succeeded',
        'payment_cancelled',
        'payment_expired'
      ]);
      if (!payload || !realtimeTypes.has(payload.type || payload.event_type)) return;
      if (payload.venue_id && String(payload.venue_id) !== String(venue.id)) return;
      const statusText = payload.type === 'booking_cancelled' || payload.type === 'payment_cancelled' || payload.type === 'payment_expired'
        ? 'Сервер освободил столы. Доступность обновляется…'
        : 'Сервер обновил занятость столов. Схема обновляется…';
      if (realtimeMessage) {
        setText(realtimeMessage, statusText);
        show(realtimeMessage);
      }
      scheduleRefreshAt(payload.hold_expires_at);
      scheduleRefreshAt(payload.payment_deadline_at);
      scheduleRealtimeRefresh(payload, 120);
    }

    const refreshAvailabilityDebounced = debounce(() => refreshAvailability(true), 320);

    const minimumStartValue = buildDefaultBookingLocalValue(slotStep, minBookingNotice);
    bookingStartInput.min = minimumStartValue;
    bookingStartInput.value = minimumStartValue;
    syncEndInput(true);
    updateIntervalPreview();

    bookingStartInput.addEventListener('change', function () {
      syncEndInput();
      releasePendingHoldSilently();
      refreshAvailabilityDebounced();
    });
    bookingStartInput.addEventListener('input', function () { releasePendingHoldSilently(); refreshAvailabilityDebounced(); });
    bookingEndInput.addEventListener('change', function () {
      updateIntervalPreview();
      releasePendingHoldSilently();
      refreshAvailabilityDebounced();
    });
    bookingEndInput.addEventListener('input', function () { releasePendingHoldSilently(); refreshAvailabilityDebounced(); });

    hallSelect.addEventListener('change', function () {
      hide(bookingMessage);
      hide(bookingError);
      hide(paymentActions);
      pendingPaymentBookingId = null;
      releasePendingHoldSilently();
      layoutState.selectedTableIds = [];
      renderHall(hallSelect.value);
    });
    if (bookingTypeSelect) {
      bookingTypeSelect.addEventListener('change', function () {
        hide(bookingMessage);
        hide(bookingError);
        releasePendingHoldSilently();
        layoutState.selectedTableIds = [];
        renderHall(hallSelect.value);
      });
    }
    window.addEventListener('resize', function () {
      renderHall(hallSelect.value);
    });

    bookingForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(bookingMessage);
      hide(bookingError);
      if (!token) {
        setText(bookingError, 'Сначала войдите в аккаунт клиента, затем повторите попытку.');
        show(bookingError);
        show(authNote);
        return;
      }
      const interval = getSelectedInterval();
      if (!interval) {
        setText(bookingError, 'Укажите корректные дату и время посещения.');
        show(bookingError);
        return;
      }
      const hall = getCurrentHall();
      const tables = getCurrentTables();
      const bookingType = bookingTypeSelect ? String(bookingTypeSelect.value || 'tables') : 'tables';
      const selectedIds = (layoutState.selectedTableIds || []).map(Number);
      const selectedTables = bookingType === 'hall' ? tables.slice() : tables.filter((table) => selectedIds.includes(Number(table.id)));
      if (!hall || !selectedTables.length) {
        setText(bookingError, bookingType === 'hall' ? 'В выбранном зале нет активных столов для бронирования.' : 'Сначала выберите помещение и хотя бы один свободный стол.');
        show(bookingError);
        return;
      }
      const busySelected = selectedTables.find((table) => table.occupancy?.state === 'occupied' || table.occupancy?.state === 'held_by_you');
      if (busySelected) {
        setText(bookingError, bookingType === 'hall' ? `Зал нельзя забронировать целиком: стол «${busySelected.name}» уже занят в выбранный интервал.` : `Стол «${busySelected.name}» уже занят в выбранный интервал. Снимите его с выбора или выберите другой.`);
        show(bookingError);
        return;
      }
      bookingSubmit.disabled = true;
      try {
        const hold = await apiRequest('/bookings/hold/', {
          method: 'POST',
          token,
          body: {
            venue: venue.id,
            hall: hall.id,
            table: selectedTables[0].id,
            tables: selectedTables.map((table) => table.id),
            booking_type: bookingType,
            guests_count: Math.max(Number(bookingGuestsInput.value) || 1, 1),
            booking_start: interval.startIso,
            booking_end: interval.endIso,
            customer_comment: String(bookingCommentInput.value || '').trim(),
          },
        });
        activateHoldState(hold);
        hide(paymentActions);
        pendingPaymentBookingId = null;
        let finalBooking = hold;
        finalBooking = await apiRequest(`/bookings/${hold.id}/confirm-hold/`, { method: 'POST', token, body: {} });
        resetHoldUi();
        if (bookingNeedsPayment(finalBooking)) {
          pendingPaymentBookingId = finalBooking.id;
          const deadlineText = bookingPaymentDeadlineText(finalBooking);
          setText(paymentNote, `Бронь #${finalBooking.id} ожидает предоплату ${formatMoney(finalBooking.required_deposit_amount || finalBooking.payment_amount, finalBooking.required_deposit_currency || finalBooking.payment_currency || 'RUB')}.${deadlineText ? ` ${deadlineText}` : ''}`);
          show(paymentActions);
          setText(bookingMessage, `Бронь #${finalBooking.id} создана. Для закрепления брони завершите оплату.`);
        } else if (finalBooking.status === 'pending_confirmation') {
          setText(bookingMessage, `Бронь #${finalBooking.id} создана и ожидает подтверждения менеджера. После подтверждения вы получите уведомление.`);
        } else {
          setText(bookingMessage, `Бронь #${finalBooking.id} создана. ${bookingType === 'hall' ? `Зал «${hall.name}» зарезервирован целиком` : `Выбрано столов: ${selectedTables.length}. Они зарезервированы`} на выбранный слот и заблокированы для других клиентов. Менеджер уже видит бронь.`);
        }
        show(bookingMessage);
        bookingCommentInput.value = '';
        bookingTableInput.value = '';
        layoutState.selectedTableIds = [];
        await refreshAvailability(true);
      } catch (err) {
        setText(bookingError, err.message || 'Не удалось выполнить шаг бронирования.');
        show(bookingError);
      } finally {
        bookingSubmit.disabled = false;
      }
    });

    if (payNowButton) {
      payNowButton.addEventListener('click', async function () {
        hide(bookingMessage);
        hide(bookingError);
        if (!pendingPaymentBookingId) {
          setText(bookingError, 'Сначала создайте бронь, затем переходите к оплате.');
          show(bookingError);
          return;
        }
        payNowButton.disabled = true;
        try {
          const result = await startBookingPaymentFlow(pendingPaymentBookingId, token);
          if (result && result.cancelled) {
            setText(bookingError, 'Учебная оплата отменена. Бронь автоматически отменена, выбранный слот освобождён.');
            show(bookingError);
          } else if (result && result.completed) {
            hide(paymentActions);
            setText(bookingMessage, 'Предоплата внесена успешно. Бронь оплачена и закреплена за вами.');
            show(bookingMessage);
            pendingPaymentBookingId = null;
            await refreshAvailability(true);
          }
        } catch (err) {
          setText(bookingError, err.message || 'Не удалось провести оплату.');
          show(bookingError);
        } finally {
          payNowButton.disabled = false;
        }
      });
    }

    if (!currentUser) {
      bookingSubmit.disabled = false;
      show(authNote);
    }

    const realtimeSocket = connectRealtimeSocket({
      venueId: venue.id,
      token,
      onMessage: handleVenueRealtimeEvent,
      onStatus(statusValue) {
        if (!realtimeMessage) return;
        if (statusValue === 'online') {
          setText(realtimeMessage, 'Live-обновление занятости подключено.');
          show(realtimeMessage);
          window.setTimeout(function () { hide(realtimeMessage); }, 2500);
        } else if (statusValue === 'offline') {
          setText(realtimeMessage, 'Live-соединение временно недоступно. Доступность обновляется через API.');
          show(realtimeMessage);
        }
      }
    });
    window.addEventListener('beforeunload', function () {
      realtimeSocket.close();
      realtimeExpiryTimers.forEach((timerId) => window.clearTimeout(timerId));
    }, { once: true });

    await refreshAvailability(true);
    hide(loading);
    show(content);
    window.requestAnimationFrame(function () {
      renderHall(hallSelect.value);
    });
  } catch (err) {
    hide(loading);
    error.innerHTML = `<h1>Не удалось открыть страницу заведения</h1><p>${escapeHtml(err.message || 'Ошибка загрузки')}</p><div class="button-row"><a class="button button-primary" href="/venues/">Вернуться в каталог</a></div>`;
    show(error);
  }
}


  async function mountOwnerPage() {
    const dashboard = qs('#owner-dashboard');
    if (!dashboard) return;
    const warning = qs('#owner-auth-warning');
    const error = qs('#owner-error');
    const venuesCard = qs('#owner-venues-card');
    const venuesGrid = qs('#owner-venues');
    const summary = qs('#owner-summary');
    const form = qs('#owner-venue-form');
    const message = qs('#owner-venue-message');
    const formError = qs('#owner-venue-form-error');
    const submit = qs('#owner-venue-submit');
    const analyticsCard = qs('#owner-analytics-card');
    const analyticsSummary = qs('#owner-analytics-summary');
    const analyticsCaption = qs('#owner-analytics-caption');
    const analyticsReviews = qs('#owner-analytics-reviews');
    const token = getToken();
    let currentUser = null;

    function fillSummary(items) {
      if (!summary) return;
      const drafts = items.filter((item) => item.status === 'draft').length;
      const pending = items.filter((item) => item.status === 'pending_moderation').length;
      const active = items.filter((item) => item.status === 'active').length;
      summary.innerHTML = `
        <div><span>Черновики</span><strong>${drafts}</strong></div>
        <div><span>На модерации</span><strong>${pending}</strong></div>
        <div><span>Опубликовано</span><strong>${active}</strong></div>
      `;
    }

    async function loadAnalytics() {
      if (!analyticsCard) return;
      try {
        const overview = await apiRequest('/owner/overview/', { token });
        analyticsSummary.innerHTML = `
          <div><span>Всего заведений</span><strong>${overview.venues_total}</strong></div>
          <div><span>Опубликовано</span><strong>${overview.published_total}</strong></div>
          <div><span>Открытые брони</span><strong>${overview.open_bookings_total}</strong></div>
          <div><span>Средний рейтинг</span><strong>${Number(overview.average_rating || 0).toFixed(1)}</strong></div>
          <div><span>Завершено за 30 дней</span><strong>${overview.completed_last_30_days}</strong></div>
          <div><span>No-show за 30 дней</span><strong>${overview.no_show_last_30_days}</strong></div>
        `;
        analyticsCaption.textContent = `Черновиков: ${overview.draft_total}, на модерации: ${overview.pending_total}.`;
        analyticsReviews.innerHTML = overview.recent_reviews.length ? overview.recent_reviews.map((review) => `
          <article class="review-card compact-card">
            <div class="review-card-meta">
              <div>
                <span class="pill">${escapeHtml(review.venue_name)}</span>
                <h3>${escapeHtml(review.author_name)}</h3>
              </div>
              <span class="pill muted-chip">${'★'.repeat(Math.max(Number(review.rating) || 0, 0))}</span>
            </div>
            <p>${escapeHtml(review.text)}</p>
          </article>
        `).join('') : '<p class="muted-block">Свежих отзывов пока нет.</p>';
        show(analyticsCard);
      } catch (err) {
        analyticsCaption.textContent = err.message || 'Не удалось загрузить аналитику.';
        show(analyticsCard);
      }
    }

    async function loadOwnerVenues() {
      const items = await apiRequest('/venues/my/', { token });
      fillSummary(items);
      if (!items.length) {
        venuesGrid.innerHTML = '<article class="card compact-card"><p class="muted-block">У владельца пока нет заведений. Создайте первое заведение через форму выше.</p></article>';
        show(venuesCard);
        return;
      }
      venuesGrid.innerHTML = items.map((venue) => {
        const coverUrl = resolveImageUrl(venue.cover_image_url || '');
        return `
        <article class="card compact-card">
          ${coverUrl ? `<div class="venue-card-cover"><img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(venue.name)}" loading="lazy"></div>` : ''}
          <div class="section-topline">
            <span class="section-kicker">${escapeHtml(venue.city || 'Город не указан')}</span>
            <h3>${escapeHtml(venue.name)}</h3>
          </div>
          <p class="muted-block">${escapeHtml(venue.address || 'Адрес не указан')}</p>
          <p class="muted-block">Статус: <strong>${escapeHtml(venueStatusLabel(venue.status))}</strong></p>
          <div class="button-row top-gap">
            <a class="button button-primary" href="/owner/venues/${encodeURIComponent(venue.slug)}/edit/">Редактировать</a>
            <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/reviews/">Отзывы</a>
            ${venue.status === 'draft' ? `<button class="button button-secondary owner-submit-moderation" type="button" data-slug="${escapeHtml(venue.slug)}">На модерацию</button>` : ''}
          </div>
        </article>`;
      }).join('');
      show(venuesCard);
      qsa('.owner-submit-moderation', venuesGrid).forEach((button) => {
        button.addEventListener('click', async function () {
          hide(message); hide(formError);
          button.disabled = true;
          try {
            await apiRequest(`/venues/${encodeURIComponent(button.dataset.slug)}/submit_for_moderation/`, { method: 'POST', token });
            setText(message, 'Заведение отправлено на модерацию.'); show(message);
            await loadOwnerVenues();
            await loadAnalytics();
          } catch (err) { setText(formError, err.message || 'Не удалось отправить на модерацию.'); show(formError); }
          finally { button.disabled = false; }
        });
      });
    }

    try {
      currentUser = await apiRequest('/auth/me/', { token });
      storeSession(token, currentUser);
      buildHeader(currentUser);
      if (!(Array.isArray(currentUser.available_modes) ? currentUser.available_modes : []).includes('owner')) {
        throw new Error('Страница доступна только владельцу.');
      }
      hide(warning);
      show(dashboard);
      await loadOwnerVenues();
      await loadAnalytics();
    } catch (err) {
      hide(warning);
      error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть кабинет владельца.')}</p>`;
      show(error);
      return;
    }

    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(message); hide(formError);
      const legalEntityId = currentUser.legal_entities && currentUser.legal_entities.length ? currentUser.legal_entities[0].id : null;
      if (!legalEntityId) { setText(formError, 'У владельца нет юридического лица.'); show(formError); return; }
      const data = new FormData(form);
      const payload = {
        legal_entity: legalEntityId,
        name: String(data.get('name') || '').trim(),
        country: String(data.get('country') || 'Россия').trim(),
        city: String(data.get('city') || '').trim(),
        district: String(data.get('district') || '').trim(),
        address: String(data.get('address') || '').trim(),
        cuisine: String(data.get('cuisine') || '').trim(),
        price_category: String(data.get('price_category') || 'middle').trim(),
        venue_theme: String(data.get('venue_theme') || 'family').trim(),
        short_description: String(data.get('short_description') || '').trim(),
        description: String(data.get('description') || '').trim(),
      };
      submit.disabled = true;
      try {
        await apiRequest('/venues/', { method: 'POST', token, body: payload });
        setText(message, 'Черновик заведения создан.'); show(message);
        form.reset();
        if (form.elements.country) form.elements.country.value = 'Россия';
        if (form.elements.price_category) form.elements.price_category.value = 'middle';
        if (form.elements.venue_theme) form.elements.venue_theme.value = 'family';
        await loadOwnerVenues();
        await loadAnalytics();
      } catch (err) { setText(formError, err.message || 'Не удалось создать заведение.'); show(formError); }
      finally { submit.disabled = false; }
    });
  }

  async function mountManagerPage() {
    const grid = qs('#manager-venues');
    if (!grid) return;
    const warning = qs('#manager-auth-warning');
    const error = qs('#manager-error');
    const dashboard = qs('#manager-dashboard');
    const summary = qs('#manager-summary');
    const bookingsFilter = qs('#manager-bookings-venue-filter');
    const statusFilter = qs('#manager-bookings-status-filter');
    const hallFilter = qs('#manager-bookings-hall-filter');
    const tableFilter = qs('#manager-bookings-table-filter');
    const dateFromInput = qs('#manager-bookings-date-from');
    const dateToInput = qs('#manager-bookings-date-to');
    const resetFiltersButton = qs('#manager-bookings-reset-filters');
    const viewToggle = qs('#manager-view-toggle');
    const bookingsSummary = qs('#manager-bookings-summary');
    const bookingsList = qs('#manager-bookings-list');
    const bookingsCalendar = qs('#manager-bookings-calendar');
    const bookingsMessage = qs('#manager-bookings-message');
    const bookingsError = qs('#manager-bookings-error');
    const overviewSummary = qs('#manager-overview-summary');
    const auditLogList = qs('#manager-audit-log-list');
    const auditLogEmpty = qs('#manager-audit-log-empty');
    const token = getToken();

    const state = { venues: [], venueDetails: {}, allBookings: [], view: 'list', quickFilter: '' };
    let managerRealtimeTimer = null;
    let managerRealtimeSockets = [];

    function scheduleManagerRealtimeReload(payload) {
      const type = payload && (payload.type || payload.event_type);
      if (!['table_occupancy_changed', 'booking_hold_created', 'booking_hold_confirmed', 'booking_confirmed', 'booking_rescheduled', 'booking_cancelled', 'booking_no_show', 'payment_succeeded', 'payment_cancelled', 'payment_expired'].includes(type)) return;
      if (managerRealtimeTimer) window.clearTimeout(managerRealtimeTimer);
      managerRealtimeTimer = window.setTimeout(async function () {
        managerRealtimeTimer = null;
        try {
          await loadBookings();
          await loadManagerOverview();
          if (bookingsMessage) {
            setText(bookingsMessage, payload.message || 'Брони обновлены в реальном времени.');
            show(bookingsMessage);
          }
        } catch (err) {
          if (bookingsError) {
            setText(bookingsError, err.message || 'Не удалось обновить брони по realtime-событию.');
            show(bookingsError);
          }
        }
      }, 180);
    }

    function connectManagerRealtime(venues) {
      managerRealtimeSockets.forEach((socket) => socket.close());
      managerRealtimeSockets = (venues || []).map((venue) => connectRealtimeSocket({
        venueId: venue.id,
        token,
        onMessage: scheduleManagerRealtimeReload
      }));
      window.addEventListener('beforeunload', function () {
        managerRealtimeSockets.forEach((socket) => socket.close());
      }, { once: true });
    }

    if (!token) {
      warning.classList.add('error-card');
      warning.innerHTML = '<p>Сначала войдите под менеджером, затем откройте эту страницу снова.</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>';
      return;
    }

    function currentVenueDetail() {
      const venueId = String(bookingsFilter?.value || '');
      return venueId ? (state.venueDetails[venueId] || null) : null;
    }

    function syncDateDefaults() {
      const today = new Date();
      const local = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
      if (!dateFromInput.value) dateFromInput.value = local;
      if (!dateToInput.value) dateToInput.value = local;
    }

    function updateViewButtons() {
      qsa('[data-view]', viewToggle).forEach((button) => {
        const active = button.getAttribute('data-view') === state.view;
        button.classList.toggle('button-primary', active);
        button.classList.toggle('button-secondary', !active);
      });
      if (state.view === 'calendar') {
        hide(bookingsList);
        show(bookingsCalendar);
      } else {
        show(bookingsList);
        hide(bookingsCalendar);
      }
    }

    function fillHallFilter() {
      const detail = currentVenueDetail();
      const halls = detail ? (detail.halls || []) : [];
      const current = String(hallFilter.value || '');
      hallFilter.innerHTML = ['<option value="">Все залы</option>']
        .concat(halls.map((hall) => `<option value="${hall.id}">${escapeHtml(hall.name)}</option>`))
        .join('');
      if (halls.some((hall) => String(hall.id) === current)) hallFilter.value = current;
    }

    function fillTableFilter() {
      const detail = currentVenueDetail();
      const hallValue = String(hallFilter.value || '');
      const current = String(tableFilter.value || '');
      let tables = [];
      if (detail) {
        (detail.halls || []).forEach((hall) => {
          if (!hallValue || String(hall.id) === hallValue) {
            tables = tables.concat((hall.tables || []).map((table) => ({ ...table, hall_name: hall.name, hall_id: hall.id })));
          }
        });
      }
      tables.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
      tableFilter.innerHTML = ['<option value="">Все столы</option>']
        .concat(tables.map((table) => `<option value="${table.id}">${escapeHtml(table.name)}${table.hall_name ? ` — ${escapeHtml(table.hall_name)}` : ''}</option>`))
        .join('');
      if (tables.some((table) => String(table.id) === current)) tableFilter.value = current;
    }

    function updateSummary(items) {
      const pendingCount = items.filter((booking) => booking.status === 'pending_confirmation').length;
      const activeCount = items.filter((booking) => ['pending_confirmation', 'waiting_for_payment', 'paid', 'confirmed'].includes(booking.status)).length;
      bookingsSummary.innerHTML = `
        <div><span>Нужно подтвердить</span><strong>${pendingCount}</strong></div>
        <div><span>Активные</span><strong>${activeCount}</strong></div>
        <div><span>Всего в списке</span><strong>${items.length}</strong></div>
      `;
    }

    function filteredItems() {
      const venueValue = String(bookingsFilter.value || '');
      const hallValue = String(hallFilter.value || '');
      const tableValue = String(tableFilter.value || '');
      const statusValue = String(statusFilter.value || '');
      const dateFrom = String(dateFromInput.value || '');
      const dateTo = String(dateToInput.value || '');
      let items = Array.from(state.allBookings);
      if (venueValue) items = items.filter((booking) => String(booking.venue) === venueValue);
      if (hallValue) items = items.filter((booking) => String(booking.hall) === hallValue);
      if (tableValue) items = items.filter((booking) => String(booking.table) === tableValue || (Array.isArray(booking.table_ids) && booking.table_ids.map(String).includes(tableValue)));
      if (statusValue) items = items.filter((booking) => booking.status === statusValue);
      if (dateFrom || dateTo) {
        const startRaw = dateFrom || dateTo;
        const endRaw = dateTo || dateFrom;
        const rangeStart = new Date(`${startRaw}T00:00:00`);
        const rangeEnd = new Date(`${endRaw}T23:59:59`);
        items = items.filter((booking) => {
          const bookingStart = new Date(booking.booking_start);
          const bookingEnd = new Date(booking.booking_end);
          return bookingStart <= rangeEnd && bookingEnd >= rangeStart;
        });
      }
      if (state.quickFilter === 'next2h') {
        const now = new Date();
        const later = new Date(now.getTime() + (2 * 60 * 60 * 1000));
        items = items.filter((booking) => {
          const bookingStart = new Date(booking.booking_start);
          return bookingStart >= now && bookingStart <= later;
        });
      }
      items.sort((left, right) => new Date(left.booking_start) - new Date(right.booking_start));
      return items;
    }

    function bookingReservationNoteHtml(booking, audience = 'manager') {
      if (!booking || booking.status !== 'hold') return '';
      const until = booking.hold_expires_at ? ` до ${formatDateTimeRu(booking.hold_expires_at)}` : '';
      const tail = audience === 'manager' ? ' Клиент уже видит эту бронь в профиле.' : ' Менеджер уже видит эту бронь в кабинете.';
      return `<p class="muted-block top-gap"><strong>Резерв:</strong> выбранные столы заблокированы для других клиентов на выбранный слот${until}.${tail}</p>`;
    }

    function bookingActionButtons(booking) {
      return `
        ${booking.status === 'pending_confirmation' ? `<button class="button button-primary manager-booking-action" type="button" data-action="confirm" data-id="${booking.id}">Подтвердить</button>` : ''}
        ${!['cancelled', 'completed', 'no_show'].includes(booking.status) ? `<button class="button button-secondary manager-booking-action" type="button" data-action="cancel" data-id="${booking.id}">Отменить</button>` : ''}
        ${!['cancelled', 'completed', 'no_show'].includes(booking.status) ? `<button class="button button-secondary manager-booking-action" type="button" data-action="no_show" data-id="${booking.id}">Неявка</button>` : ''}
        ${booking.can_manager_reschedule ? `<button class="button button-secondary manager-booking-toggle-reschedule" type="button" data-id="${booking.id}">Перенести</button>` : ''}
      `;
    }

    function rescheduleFormHtml(booking) {
      const detail = state.venueDetails[String(booking.venue)] || null;
      const halls = detail ? (detail.halls || []) : [];
      const hallOptions = halls.map((hall) => `<option value="${hall.id}"${String(hall.id) === String(booking.hall) ? ' selected' : ''}>${escapeHtml(hall.name)}</option>`).join('');
      const tableOptions = halls.flatMap((hall) => (hall.tables || []).map((table) => ({ ...table, hall_id: hall.id, hall_name: hall.name })))
        .map((table) => `<option value="${table.id}" data-hall="${table.hall_id}"${String(table.id) === String(booking.table) ? ' selected' : ''}>${escapeHtml(table.name)} — ${escapeHtml(table.hall_name)}</option>`)
        .join('');
      const startValue = new Date(new Date(booking.booking_start).getTime() - (new Date(booking.booking_start).getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      const endValue = new Date(new Date(booking.booking_end).getTime() - (new Date(booking.booking_end).getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      return `
        <form class="manager-reschedule-form hidden top-gap" data-booking-id="${booking.id}">
          <div class="grid grid-two">
            <label class="field compact-field"><span>Начало</span><input type="datetime-local" name="booking_start" value="${escapeHtml(startValue)}" required></label>
            <label class="field compact-field"><span>Окончание</span><input type="datetime-local" name="booking_end" value="${escapeHtml(endValue)}" required></label>
          </div>
          <div class="grid grid-two">
            <label class="field selector-field"><span>Зал</span><select name="hall">${hallOptions}</select></label>
            <label class="field selector-field"><span>Стол</span><select name="table">${tableOptions}</select></label>
          </div>
          <label class="field"><span>Комментарий менеджера</span><textarea name="reason" rows="3" placeholder="Например, перенос по просьбе клиента"></textarea></label>
          <div class="button-row compact-row top-gap">
            <button class="button button-primary" type="submit">Сохранить перенос</button>
            <button class="button button-secondary manager-reschedule-close" type="button">Закрыть</button>
          </div>
          <p class="error-text hidden top-gap"></p>
        </form>
      `;
    }

    function renderList(items) {
      if (!items.length) {
        bookingsList.innerHTML = '<article class="subcard"><h3 class="subcard-title">Брони по выбранным фильтрам не найдены</h3><p>Измените фильтры или дождитесь новых заявок.</p></article>';
        return;
      }
      bookingsList.innerHTML = items.map((booking) => `
        <article class="subcard booking-card">
          <div class="booking-card-head">
            <div>
              <h3 class="subcard-title">${escapeHtml(booking.customer_full_name || booking.customer_email)}</h3>
              <p class="muted-block">${escapeHtml(booking.venue_name)} · ${escapeHtml(booking.hall_name)} · ${escapeHtml(bookingTablesSummary(booking))}</p>
            </div>
            <span class="${bookingStatusClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
          </div>
          <div class="compact-definition-list top-gap">
            <div><span>Интервал</span><strong>${escapeHtml(formatDateTimeRangeRu(booking.booking_start, booking.booking_end))}</strong></div>
            <div><span>Гостей</span><strong>${escapeHtml(booking.guests_count)}</strong></div>
            <div><span>Телефон</span><strong>${escapeHtml(booking.customer_phone || 'Не указан')}</strong></div>
            <div><span>Оплата</span><strong>${escapeHtml(bookingPaymentSummary(booking))}</strong></div>
            <div><span>Комментарий клиента</span><strong>${escapeHtml(booking.customer_comment || 'Не указан')}</strong></div>
          </div>
          ${bookingReservationNoteHtml(booking, 'manager')}
          <div class="button-row top-gap">${bookingActionButtons(booking)}</div>
          ${rescheduleFormHtml(booking)}
        </article>
      `).join('');
      wireBookingInteractions();
    }

    function renderCalendar(items) {
      if (!items.length) {
        bookingsCalendar.innerHTML = '<article class="subcard"><h3 class="subcard-title">Календарь пуст</h3><p>На выбранный период броней нет.</p></article>';
        return;
      }
      const grouped = new Map();
      items.forEach((booking) => {
        const dateKey = (booking.booking_start || '').slice(0, 10);
        const hallKey = `${booking.hall}__${booking.hall_name}`;
        if (!grouped.has(dateKey)) grouped.set(dateKey, new Map());
        if (!grouped.get(dateKey).has(hallKey)) grouped.get(dateKey).set(hallKey, []);
        grouped.get(dateKey).get(hallKey).push(booking);
      });
      bookingsCalendar.innerHTML = Array.from(grouped.entries()).map(([dateKey, hallMap]) => `
        <article class="subcard manager-calendar-day-card">
          <div class="section-topline"><span class="section-kicker">${escapeHtml(dateKey)}</span><h3>Календарь по залам</h3></div>
          <div class="page-stack top-gap">
            ${Array.from(hallMap.entries()).map(([hallKey, bookings]) => {
              const hallName = hallKey.split('__')[1] || 'Зал';
              return `
                <section class="manager-calendar-hall-group">
                  <h4 class="subcard-title">${escapeHtml(hallName)}</h4>
                  <div class="page-stack top-gap">
                    ${bookings.map((booking) => `
                      <article class="manager-calendar-row">
                        <div class="manager-calendar-time">${escapeHtml(formatDateTimeRangeRu(booking.booking_start, booking.booking_end))}</div>
                        <div class="manager-calendar-main">
                          <strong>${escapeHtml(booking.customer_full_name || booking.customer_email)}</strong>
                          <span class="muted-block">${escapeHtml(bookingTablesSummary(booking))} · ${escapeHtml(booking.guests_count)} гостей · ${escapeHtml(booking.customer_phone || 'телефон не указан')}</span>
                        </div>
                        <div class="manager-calendar-side">
                          <span class="${bookingStatusClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>
                          <div class="button-row top-gap compact-row">${bookingActionButtons(booking)}</div>
                          ${rescheduleFormHtml(booking)}
                        </div>
                      </article>
                    `).join('')}
                  </div>
                </section>
              `;
            }).join('')}
          </div>
        </article>
      `).join('');
      wireBookingInteractions();
    }

    function applyHallFilterToRescheduleForm(form) {
      const hallSelect = qs('select[name="hall"]', form);
      const tableSelect = qs('select[name="table"]', form);
      if (!hallSelect || !tableSelect) return;
      const sync = () => {
        const activeHall = String(hallSelect.value || '');
        qsa('option', tableSelect).forEach((option) => {
          const allowed = !activeHall || String(option.getAttribute('data-hall')) === activeHall;
          option.hidden = !allowed;
          option.disabled = !allowed;
        });
      };
      hallSelect.addEventListener('change', sync);
      sync();
    }

    function wireBookingInteractions() {
      qsa('.manager-booking-action', dashboard).forEach((button) => {
        button.onclick = async function () {
          const action = button.getAttribute('data-action');
          const bookingId = button.getAttribute('data-id');
          hide(bookingsMessage);
          hide(bookingsError);
          button.disabled = true;
          try {
            const result = await apiRequest(`/bookings/${bookingId}/${action}/`, { method: 'POST', token, body: {} });
            const actionMessage = action === 'confirm' ? `Бронь #${result.id} обновлена: ${bookingStatusLabel(result.status).toLowerCase()}.` : action === 'no_show' ? `Бронь #${result.id} отмечена как неявка.` : `Бронь #${result.id} отменена.`;
            setText(bookingsMessage, actionMessage);
            show(bookingsMessage);
            await loadBookings();
            await loadManagerOverview();
          } catch (err) {
            setText(bookingsError, err.message || 'Не удалось обновить статус брони.');
            show(bookingsError);
          } finally {
            button.disabled = false;
          }
        };
      });

      qsa('.manager-booking-toggle-reschedule', dashboard).forEach((button) => {
        button.onclick = function () {
          const bookingId = button.getAttribute('data-id');
          const form = qs(`.manager-reschedule-form[data-booking-id="${bookingId}"]`, dashboard);
          if (!form) return;
          qsa('.manager-reschedule-form', dashboard).forEach((node) => {
            if (node !== form) hide(node);
          });
          form.classList.toggle('hidden');
          if (!form.classList.contains('hidden')) applyHallFilterToRescheduleForm(form);
        };
      });

      qsa('.manager-reschedule-close', dashboard).forEach((button) => {
        button.onclick = function () {
          const form = button.closest('.manager-reschedule-form');
          if (form) hide(form);
        };
      });

      qsa('.manager-reschedule-form', dashboard).forEach((form) => {
        applyHallFilterToRescheduleForm(form);
        form.onsubmit = async function (event) {
          event.preventDefault();
          hide(bookingsMessage); hide(bookingsError);
          const inlineError = qs('.error-text', form);
          if (inlineError) hide(inlineError);
          const bookingId = form.getAttribute('data-booking-id');
          const submit = qs('button[type="submit"]', form);
          if (submit) submit.disabled = true;
          const payload = Object.fromEntries(new FormData(form).entries());
          payload.booking_start = new Date(payload.booking_start).toISOString();
          payload.booking_end = new Date(payload.booking_end).toISOString();
          try {
            const result = await apiRequest(`/bookings/${bookingId}/reschedule/`, { method: 'POST', token, body: payload });
            setText(bookingsMessage, `Бронь #${result.id} перенесена на ${formatDateTimeRangeRu(result.booking_start, result.booking_end)}.`);
            show(bookingsMessage);
            hide(form);
            await loadBookings();
            await loadManagerOverview();
          } catch (err) {
            if (inlineError) {
              setText(inlineError, err.message || 'Не удалось перенести бронь.');
              show(inlineError);
            } else {
              setText(bookingsError, err.message || 'Не удалось перенести бронь.');
              show(bookingsError);
            }
          } finally {
            if (submit) submit.disabled = false;
          }
        };
      });
    }

    async function loadBookings() {
      hide(bookingsMessage); hide(bookingsError);
      const params = new URLSearchParams({ scope: 'manageable' });
      if (bookingsFilter.value) params.set('venue', bookingsFilter.value);
      if (hallFilter.value) params.set('hall', hallFilter.value);
      if (tableFilter.value) params.set('table', tableFilter.value);
      if (statusFilter.value) params.set('status', statusFilter.value);
      if (dateFromInput.value) params.set('date_from', dateFromInput.value);
      if (dateToInput.value) params.set('date_to', dateToInput.value);
      const items = await apiRequest(`/bookings/?${params.toString()}`, { token });
      state.allBookings = items;
      const filtered = filteredItems();
      updateSummary(filtered);
      renderList(filtered);
      renderCalendar(filtered);
      updateViewButtons();
      return items;
    }

    async function loadVenueDetails(venues) {
      const details = await Promise.all(venues.map(async (venue) => {
        const detail = await apiRequest(`/venues/${encodeURIComponent(venue.slug)}/`, { token });
        return [String(venue.id), detail];
      }));
      state.venueDetails = Object.fromEntries(details);
    }

    function renderActionLogs(items) {
      if (!auditLogList) return;
      if (!items.length) {
        auditLogList.innerHTML = '';
        if (auditLogEmpty) show(auditLogEmpty);
        return;
      }
      if (auditLogEmpty) hide(auditLogEmpty);
      auditLogList.innerHTML = items.map((item) => `
        <article class="card compact-card">
          <div class="review-card-meta">
            <div>
              <div class="eyebrow-row">
                <span class="pill">${escapeHtml(item.venue_name)}</span>
                <span class="pill muted-chip">Бронь #${escapeHtml(item.booking)}</span>
              </div>
              <h3>${escapeHtml(item.actor_name)}</h3>
            </div>
            <span class="pill muted-chip">${escapeHtml(formatDateTimeRu(item.created_at) || '')}</span>
          </div>
          <p><strong>${escapeHtml(item.action)}</strong>${item.details ? ` — ${escapeHtml(item.details)}` : ''}</p>
        </article>
      `).join('');
    }

    async function loadManagerOverview() {
      try {
        const overview = await apiRequest('/manager/overview/', { token });
        if (overviewSummary) overviewSummary.textContent = `Непрочитанных уведомлений: ${overview.notifications_unread_total}. Ждут подтверждения: ${overview.pending_confirmation_total}. Ближайшие 2 часа: ${overview.next_two_hours_total}.`;
        renderActionLogs(overview.action_logs || []);
      } catch (err) {
        if (overviewSummary) overviewSummary.textContent = err.message || 'Не удалось загрузить сводку менеджера.';
      }
    }

    function applyQuickFilter(kind) {
      const now = new Date();
      const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
      const today = local.toISOString().slice(0, 10);
      state.quickFilter = kind;
      if (kind === 'today') {
        dateFromInput.value = today;
        dateToInput.value = today;
        statusFilter.value = '';
      } else if (kind === 'tomorrow') {
        const tomorrow = new Date(local);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const value = tomorrow.toISOString().slice(0, 10);
        dateFromInput.value = value;
        dateToInput.value = value;
        statusFilter.value = '';
      } else if (kind === 'next2h') {
        dateFromInput.value = today;
        dateToInput.value = today;
        statusFilter.value = '';
      } else if (kind === 'pending') {
        statusFilter.value = 'pending_confirmation';
      }
      loadBookings();
    }

    try {
      const me = await apiRequest('/auth/me/', { token });
      storeSession(token, me);
      buildHeader(me);
      const managerModes = Array.isArray(me.available_modes) ? me.available_modes : [];
      if (!(me.role === 'manager' || managerModes.includes('manager'))) throw new Error('Эта страница предназначена для менеджера.');
      const venues = await apiRequest('/venues/manageable/', { token });
      state.venues = venues;
      connectManagerRealtime(venues);
      await loadVenueDetails(venues);
      hide(warning);
      show(dashboard);
      const overallBookings = await apiRequest('/bookings/?scope=manageable', { token });
      const overallOpenCount = overallBookings.filter((booking) => ['pending_confirmation', 'waiting_for_payment', 'paid', 'confirmed'].includes(booking.status)).length;
      const rescheduleEnabledCount = venues.filter((venue) => state.venueDetails[String(venue.id)]?.booking_rule?.allow_manager_reschedule).length;
      summary.innerHTML = `
        <div><span>Доступных заведений</span><strong>${venues.length}</strong></div>
        <div><span>Открытых броней</span><strong>${overallOpenCount}</strong></div>
        <div><span>Перенос по правилам</span><strong>${rescheduleEnabledCount}/${venues.length || 1} площадок</strong></div>
      `;
      if (!venues.length) {
        grid.innerHTML = '<article class="subcard"><h3 class="subcard-title">Нет заведений</h3><p>Пока владельцы не выдали вам доступ ни к одной площадке.</p></article>';
        bookingsFilter.innerHTML = '<option value="">Нет заведений</option>';
        hallFilter.innerHTML = '<option value="">Нет залов</option>';
        tableFilter.innerHTML = '<option value="">Нет столов</option>';
        bookingsList.innerHTML = '<article class="subcard"><h3 class="subcard-title">Нет бронирований</h3><p>Сначала владельцу нужно назначить вам заведение.</p></article>';
        hide(bookingsCalendar);
        renderActionLogs([]);
        return;
      }
      grid.innerHTML = venues.map((venue) => `
        <article class="venue-card">
          <div class="eyebrow-row">
            <span class="pill">${escapeHtml(venue.city)}</span>
            <span class="${venueStatusClass(venue.status)}">${escapeHtml(venueStatusLabel(venue.status))}</span>
          </div>
          <div class="venue-card-body">
            <h2>${escapeHtml(venue.name)}</h2>
            <p>${escapeHtml(venue.short_description || 'Описание пока не заполнено.')}</p>
          </div>
          <div class="stack-sm">
            <span class="muted-block">${escapeHtml(venue.address)}</span>
            <div class="button-row">
              <a class="button button-primary" href="/manage/venues/${encodeURIComponent(venue.slug)}/edit/">Открыть редактирование</a>
              <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/">Открыть карточку</a>
            </div>
          </div>
        </article>
      `).join('');

      bookingsFilter.innerHTML = ['<option value="">Все доступные заведения</option>']
        .concat(venues.map((venue) => `<option value="${venue.id}">${escapeHtml(venue.name)} — ${escapeHtml(venue.city)}</option>`))
        .join('');
      fillHallFilter();
      fillTableFilter();
      syncDateDefaults();
      updateViewButtons();

      bookingsFilter.addEventListener('change', async function () {
        fillHallFilter();
        fillTableFilter();
        await loadBookings();
      });
      hallFilter.addEventListener('change', async function () {
        fillTableFilter();
        await loadBookings();
      });
      tableFilter.addEventListener('change', loadBookings);
      statusFilter.addEventListener('change', loadBookings);
      dateFromInput.addEventListener('change', loadBookings);
      dateToInput.addEventListener('change', loadBookings);
      if (resetFiltersButton) {
        resetFiltersButton.addEventListener('click', async function () {
          bookingsFilter.value = '';
          statusFilter.value = '';
          state.quickFilter = '';
          dateFromInput.value = '';
          dateToInput.value = '';
          fillHallFilter();
          fillTableFilter();
          syncDateDefaults();
          await loadBookings();
          await loadManagerOverview();
        });
      }
      qsa('[data-quick-filter]', dashboard).forEach((button) => {
        button.addEventListener('click', function () {
          applyQuickFilter(button.getAttribute('data-quick-filter'));
        });
      });
      qsa('[data-view]', viewToggle).forEach((button) => {
        button.addEventListener('click', function () {
          state.view = button.getAttribute('data-view') || 'list';
          updateViewButtons();
        });
      });
      await loadBookings();
      await loadManagerOverview();
    } catch (err) {
      hide(warning);
      error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть кабинет менеджера.')}</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>`;
      show(error);
    }
  }



  async function mountPlatformAdminPage() {
    if (!qs('#platform-admin-moderation-list')) return;
    const warning = qs('#platform-admin-auth-warning');
    const error = qs('#platform-admin-error');
    const dashboard = qs('#platform-admin-dashboard');
    const moderationCard = qs('#platform-admin-moderation-card');
    const moderationList = qs('#platform-admin-moderation-list');
    const summary = qs('#platform-admin-summary');
    const message = qs('#platform-admin-message');
    const token = getToken();

    if (!token) {
      warning.classList.add('error-card');
      warning.innerHTML = '<p>Сначала войдите под администратором платформы, затем откройте эту страницу снова.</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>';
      return;
    }

    async function loadModerationQueue() {
      const items = await apiRequest('/venues/moderation_queue/', { token });
      summary.innerHTML = `
        <div><span>Ожидают решения</span><strong>${items.length}</strong></div>
        <div><span>Доступное действие</span><strong>${items.length ? 'Публикация или возврат' : 'Новых заявок нет'}</strong></div>
      `;

      if (!items.length) {
        moderationList.innerHTML = '<article class="subcard"><h3 class="subcard-title">Очередь пуста</h3><p>Сейчас нет заведений, ожидающих решения администратора.</p></article>';
        return;
      }

      moderationList.innerHTML = items.map((venue) => `
        <article class="venue-card">
          <div class="eyebrow-row">
            <span class="pill">${escapeHtml(venue.city)}</span>
            <span class="pill">${escapeHtml(venueStatusLabel(venue.status))}</span>
          </div>
          <div class="venue-card-body">
            <h2>${escapeHtml(venue.name)}</h2>
            <p>${escapeHtml(venue.short_description || 'Описание пока не заполнено.')}</p>
          </div>
          <div class="stack-sm">
            <span class="muted-block">${escapeHtml(venue.address)}</span>
            <div class="button-row">
              <a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/">Открыть</a>
              <button class="button button-primary moderation-action" type="button" data-action="publish" data-slug="${escapeHtml(venue.slug)}">Подтвердить</button>
              <button class="button button-secondary moderation-action" type="button" data-action="return_to_draft" data-slug="${escapeHtml(venue.slug)}">Вернуть на доработку</button>
            </div>
          </div>
        </article>
      `).join('');

      qsa('.moderation-action', moderationList).forEach((button) => {
        button.addEventListener('click', async function () {
          const slug = button.getAttribute('data-slug');
          const action = button.getAttribute('data-action');
          button.disabled = true;
          hide(message);
          try {
            const result = await apiRequest(`/venues/${encodeURIComponent(slug)}/${action}/`, { method: 'POST', token });
            setText(message, result.detail || 'Статус заведения обновлён.');
            show(message);
            await loadModerationQueue();
          } catch (err) {
            setText(message, err.message || 'Не удалось изменить статус заведения.');
            message.classList.remove('success-text');
            message.classList.add('error-text');
            show(message);
            button.disabled = false;
          }
        });
      });
      message.classList.remove('error-text');
      message.classList.add('success-text');
    }

    try {
      const me = await apiRequest('/auth/me/', { token });
      storeSession(token, me);
      buildHeader(me);
      if (me.role !== 'platform_admin' && me.role !== 'moderator') throw new Error('Эта страница предназначена для администратора платформы.');
      hide(warning);
      show(dashboard);
      show(moderationCard);
      await loadModerationQueue();
    } catch (err) {
      hide(warning);
      error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть админ-панель.')}</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>`;
      show(error);
    }
  }


  const FLOOR_ITEM_DEFAULTS = {
    table: { width: 124, height: 88, label: 'Новый стол', seats_count: 4 },
    wall: { width: 220, height: 12, label: 'Стена' },
    window: { width: 180, height: 10, label: 'Окно' },
    bar: { width: 180, height: 56, label: 'Бар' },
    entrance: { width: 96, height: 46, label: 'Вход' },
    cashier: { width: 120, height: 56, label: 'Касса' },
    wc: { width: 96, height: 64, label: 'WC' },
    column: { width: 56, height: 56, label: 'Колонна' },
    plant: { width: 60, height: 60, label: 'Растение' },
    sofa: { width: 140, height: 64, label: 'Диван' },
    label: { width: 140, height: 34, label: 'Подпись' }
  };

  function clampValue(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function safeNumber(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeQuarterRotation(rotation) {
    const normalized = ((safeNumber(rotation, 0) % 360) + 360) % 360;
    return [0, 90, 180, 270].includes(normalized) ? normalized : null;
  }

  const layoutTransformMetricsCache = new Map();

  function getItemMetricCacheKey(item) {
    return [
      item.kind || 'item',
      item.item_type || 'generic',
      safeNumber(item.width, 0),
      safeNumber(item.height, 0),
      ((safeNumber(item.rotation, 0) % 360) + 360) % 360,
    ].join(':');
  }

  function measureItemTransformMetrics(item) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'visible';
    wrapper.style.visibility = 'hidden';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '-1';

    const node = document.createElement('div');
    node.className = `layout-editor-item layout-editor-item-${item.kind === 'table' ? 'table' : item.item_type}`;
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.top = '0';
    node.style.width = `${safeNumber(item.width, 0)}px`;
    node.style.height = `${safeNumber(item.height, 0)}px`;
    node.style.transformOrigin = 'top left';
    node.style.transform = `rotate(${safeNumber(item.rotation, 0)}deg)`;

    wrapper.appendChild(node);
    document.body.appendChild(wrapper);

    const wrapperRect = wrapper.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();

    wrapper.remove();

    return {
      minX: nodeRect.left - wrapperRect.left,
      minY: nodeRect.top - wrapperRect.top,
      width: Math.ceil(nodeRect.width),
      height: Math.ceil(nodeRect.height),
    };
  }

  function getItemTransformMetrics(item) {
    const key = getItemMetricCacheKey(item);
    if (!layoutTransformMetricsCache.has(key)) {
      layoutTransformMetricsCache.set(key, measureItemTransformMetrics(item));
    }
    return layoutTransformMetricsCache.get(key);
  }

  function getItemOccupiedSize(item) {
    const metrics = getItemTransformMetrics(item);
    return { width: metrics.width, height: metrics.height };
  }

  function getItemRenderPosition(item) {
    const metrics = getItemTransformMetrics(item);
    return {
      left: safeNumber(item.x, 0) - metrics.minX,
      top: safeNumber(item.y, 0) - metrics.minY,
    };
  }

  function layoutDecorTypeLabel(type) {
    switch (type) {
      case 'wall': return 'Стена';
      case 'window': return 'Окно';
      case 'bar': return 'Барная стойка';
      case 'entrance': return 'Вход';
      case 'cashier': return 'Касса';
      case 'wc': return 'Санузел';
      case 'column': return 'Колонна';
      case 'plant': return 'Растение';
      case 'sofa': return 'Диван';
      case 'label': return 'Подпись';
      default: return 'Элемент';
    }
  }

  function mountLayoutEditorPage(options) {
    const stage = qs('#layout-stage');
    if (!stage) return;
    if (stage.dataset.mounted === 'true') return;
    stage.dataset.mounted = 'true';

    const opts = options || {};
    const fixedVenueSlug = opts.fixedVenueSlug || null;
    const token = getToken();
    const warning = qs('#layout-editor-auth-warning') || qs('#venue-manage-auth-warning');
    const error = qs('#layout-editor-error') || qs('#venue-manage-error');
    const dashboard = qs('#layout-editor-dashboard') || qs('#venue-manage-dashboard');
    const venueSelectWrap = qs('#layout-venue-selector-wrap');
    const venueSelect = qs('#layout-venue-select');
    const hallSelect = qs('#layout-hall-select');
    const createHallButton = qs('#create-hall-button');
    const createHallMessage = qs('#create-hall-message');
    const createHallError = qs('#create-hall-error');
    const stageTitle = qs('#layout-stage-title');
    const canvasWidthInput = qs('#layout-canvas-width');
    const canvasHeightInput = qs('#layout-canvas-height');
    const saveButton = qs('#layout-save-button');
    const resetButton = qs('#layout-reset-button');
    const saveMessage = qs('#layout-save-message');
    const saveError = qs('#layout-save-error');
    const emptySelection = qs('#layout-empty-selection');
    const itemForm = qs('#layout-item-form');
    const itemLabelInput = qs('#item-label');
    const itemSeatsField = qs('#item-seats-field');
    const itemSeatsInput = qs('#item-seats');
    const itemXInput = qs('#item-x');
    const itemYInput = qs('#item-y');
    const itemWidthInput = qs('#item-width');
    const itemHeightInput = qs('#item-height');
    const itemRotationInput = qs('#item-rotation');
    const deleteButton = qs('#layout-delete-button');
    const duplicateButton = qs('#layout-duplicate-button');
    const stageWrapper = qs('#layout-stage-wrapper');
    const stageSizer = qs('#layout-stage-sizer');
    const zoomOutButton = qs('#layout-zoom-out');
    const zoomInButton = qs('#layout-zoom-in');
    const zoomFitButton = qs('#layout-zoom-fit');
    const zoomValue = qs('#layout-zoom-value');

    if (!token) {
      if (warning) {
        warning.classList.add('error-card');
        warning.innerHTML = '<p>Сначала войдите под владельцем или менеджером, затем откройте редактор снова.</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>';
      }
      return;
    }

    const state = {
      me: null,
      venues: [],
      halls: [],
      selectedVenueId: null,
      selectedHallId: null,
      layoutId: null,
      canvasWidth: 1200,
      canvasHeight: 800,
      tables: [],
      decorItems: [],
      selectedKey: null,
      localCounter: 1,
      snapshot: null,
      dragState: null,
      paletteType: null,
      zoom: 1,
      fixedVenueSlug,
      autoFitPending: true,
    };

    if (state.fixedVenueSlug && venueSelectWrap) hide(venueSelectWrap);

    function nextLocalId() {
      state.localCounter += 1;
      return state.localCounter;
    }

    function itemKey(item) {
      return `${item.kind}:${item.id || item.local_id}`;
    }

    function getAllItems() {
      return [...state.tables, ...state.decorItems];
    }

    function findItemByKey(key) {
      return getAllItems().find((item) => itemKey(item) === key) || null;
    }

    function getMinWidthForItem(item) {
      if (item.kind === 'table') return 40;
      if (item.item_type === 'wall' || item.item_type === 'window') return 20;
      return 20;
    }

    function getMinHeightForItem(item) {
      if (item.kind === 'table') return 40;
      if (item.item_type === 'wall' || item.item_type === 'window') return 10;
      return 10;
    }

    function clampItemToCanvas(item) {
      item.width = clampValue(safeNumber(item.width, 120), getMinWidthForItem(item), state.canvasWidth);
      item.height = clampValue(safeNumber(item.height, 60), getMinHeightForItem(item), state.canvasHeight);
      const occupied = getItemOccupiedSize(item);
      item.x = clampValue(safeNumber(item.x, 0), 0, Math.max(state.canvasWidth - occupied.width, 0));
      item.y = clampValue(safeNumber(item.y, 0), 0, Math.max(state.canvasHeight - occupied.height, 0));
      return item;
    }

    function removeSelectedItem() {
      if (!state.selectedKey) return;
      state.tables = state.tables.filter((item) => itemKey(item) !== state.selectedKey);
      state.decorItems = state.decorItems.filter((item) => itemKey(item) !== state.selectedKey);
      state.selectedKey = null;
      renderStage();
      syncSelectionForm();
    }

    function cloneEditorState() {
      return {
        layoutId: state.layoutId,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        tables: JSON.parse(JSON.stringify(state.tables)),
        decorItems: JSON.parse(JSON.stringify(state.decorItems)),
      };
    }

    function restoreSnapshot() {
      if (!state.snapshot) return;
      state.layoutId = state.snapshot.layoutId;
      state.canvasWidth = state.snapshot.canvasWidth;
      state.canvasHeight = state.snapshot.canvasHeight;
      state.tables = JSON.parse(JSON.stringify(state.snapshot.tables));
      state.decorItems = JSON.parse(JSON.stringify(state.snapshot.decorItems));
      state.selectedKey = null;
      canvasWidthInput.value = state.canvasWidth;
      canvasHeightInput.value = state.canvasHeight;
      hide(saveMessage);
      hide(saveError);
      renderStage();
      syncSelectionForm();
      fitZoomToCanvas();
    }

    function buildTableFromApi(table, index, layoutMap) {
      const layoutItem = layoutMap.get(table.id) || null;
      return {
        kind: 'table',
        id: table.id,
        local_id: null,
        name: table.name || `T${index + 1}`,
        seats_count: safeNumber(table.seats_count, 4),
        is_active: table.is_active !== false,
        is_combinable: Boolean(table.is_combinable),
        note: table.note || '',
        x: layoutItem ? layoutItem.x : 32 + ((index % 4) * 150),
        y: layoutItem ? layoutItem.y : 32 + (Math.floor(index / 4) * 120),
        width: layoutItem ? layoutItem.width : FLOOR_ITEM_DEFAULTS.table.width,
        height: layoutItem ? layoutItem.height : FLOOR_ITEM_DEFAULTS.table.height,
        rotation: layoutItem ? layoutItem.rotation : 0,
      };
    }

    function buildDecorFromApi(item) {
      return {
        kind: 'decor',
        id: item.id,
        local_id: null,
        item_type: item.item_type,
        label: item.label || layoutDecorTypeLabel(item.item_type),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation || 0,
      };
    }

    function createNewPaletteItem(type, x, y) {
      const defaults = FLOOR_ITEM_DEFAULTS[type] || { width: 120, height: 60, label: 'Элемент' };
      const maxX = Math.max(state.canvasWidth - defaults.width, 0);
      const maxY = Math.max(state.canvasHeight - defaults.height, 0);
      if (type === 'table') {
        const tableNumber = state.tables.length + 1;
        return {
          kind: 'table',
          id: null,
          local_id: nextLocalId(),
          name: `T${tableNumber}`,
          seats_count: defaults.seats_count || 4,
          is_active: true,
          is_combinable: false,
          note: '',
          x: clampValue(x, 0, maxX),
          y: clampValue(y, 0, maxY),
          width: defaults.width,
          height: defaults.height,
          rotation: 0,
        };
      }
      return {
        kind: 'decor',
        id: null,
        local_id: nextLocalId(),
        item_type: type,
        label: defaults.label || layoutDecorTypeLabel(type),
        x: clampValue(x, 0, maxX),
        y: clampValue(y, 0, maxY),
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
      };
    }

    function patchSelectedItem(mutator) {
      if (!state.selectedKey) return;
      state.tables = state.tables.map((item) => itemKey(item) === state.selectedKey ? clampItemToCanvas(mutator({ ...item })) : item);
      state.decorItems = state.decorItems.map((item) => itemKey(item) === state.selectedKey ? clampItemToCanvas(mutator({ ...item })) : item);
      renderStage();
      syncSelectionForm();
    }

    function syncSelectionForm() {
      const selected = state.selectedKey ? findItemByKey(state.selectedKey) : null;
      if (!selected) {
        show(emptySelection);
        hide(itemForm);
        return;
      }
      hide(emptySelection);
      show(itemForm);
      itemLabelInput.value = selected.kind === 'table' ? selected.name : selected.label;
      itemXInput.value = selected.x;
      itemYInput.value = selected.y;
      itemWidthInput.value = selected.width;
      itemHeightInput.value = selected.height;
      itemRotationInput.value = selected.rotation || 0;
      if (selected.kind === 'table') {
        show(itemSeatsField);
        itemSeatsInput.value = selected.seats_count || 4;
      } else {
        hide(itemSeatsField);
      }
    }

    function updateZoomUi() {
      if (zoomValue) zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    }

    function setZoom(value) {
      state.zoom = clampValue(Number(value) || 1, 0.35, 2.5);
      stage.style.transform = `scale(${state.zoom})`;
      if (stageSizer) {
        stageSizer.style.width = `${Math.round(state.canvasWidth * state.zoom)}px`;
        stageSizer.style.height = `${Math.round(state.canvasHeight * state.zoom)}px`;
      }
      updateZoomUi();
    }

    function fitZoomToCanvas() {
      if (!stageWrapper) {
        setZoom(1);
        return;
      }
      const availableWidth = Math.max(stageWrapper.clientWidth - 28, 240);
      const availableHeight = Math.max(stageWrapper.clientHeight - 28, 220);
      const zoom = Math.min(availableWidth / state.canvasWidth, availableHeight / state.canvasHeight);
      setZoom(clampValue(zoom, 0.35, 1.6));
      stageWrapper.scrollLeft = 0;
      stageWrapper.scrollTop = 0;
    }

    function renderStage() {
      state.canvasWidth = clampValue(safeNumber(canvasWidthInput.value, state.canvasWidth), 480, 2400);
      state.canvasHeight = clampValue(safeNumber(canvasHeightInput.value, state.canvasHeight), 320, 1600);
      canvasWidthInput.value = state.canvasWidth;
      canvasHeightInput.value = state.canvasHeight;
      stage.style.width = `${state.canvasWidth}px`;
      stage.style.height = `${state.canvasHeight}px`;
      getAllItems().forEach(clampItemToCanvas);
      qsa('.layout-editor-item', stage).forEach((node) => node.remove());
      if (state.selectedHallId) {
        const selectedHall = state.halls.find((hall) => hall.id === state.selectedHallId);
        stageTitle.textContent = selectedHall ? `Схема зала: ${selectedHall.name}` : 'Схема зала';
      }
      getAllItems().forEach((item) => {
        const key = itemKey(item);
        const isSelected = key === state.selectedKey;
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `layout-editor-item layout-editor-item-${item.kind === 'table' ? 'table' : item.item_type}`;
        if (isSelected) node.classList.add('layout-editor-item-selected');
        node.dataset.itemKey = key;
        const renderPosition = getItemRenderPosition(item);
        node.style.left = `${renderPosition.left}px`;
        node.style.top = `${renderPosition.top}px`;
        node.style.width = `${item.width}px`;
        node.style.height = `${item.height}px`;
        node.style.transform = `rotate(${item.rotation || 0}deg)`;
        if (item.kind === 'table') {
          node.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.seats_count)} мест</span>`;
        } else if (item.item_type === 'wall' || item.item_type === 'window') {
          node.innerHTML = `<span>${escapeHtml(item.label || layoutDecorTypeLabel(item.item_type))}</span>`;
        } else if (item.item_type === 'label') {
          node.innerHTML = `<span>${escapeHtml(item.label || 'Подпись')}</span>`;
        } else {
          node.innerHTML = `<strong>${escapeHtml(item.label || layoutDecorTypeLabel(item.item_type))}</strong>`;
        }
        if (isSelected) {
          const resizeHandle = document.createElement('span');
          resizeHandle.className = 'layout-resize-handle';
          resizeHandle.dataset.handleMode = 'resize';
          node.appendChild(resizeHandle);
          if (item.kind === 'decor' && (item.item_type === 'wall' || item.item_type === 'window')) {
            const startHandle = document.createElement('span');
            startHandle.className = 'layout-stretch-handle layout-stretch-handle-start';
            startHandle.dataset.handleMode = 'stretch-start';
            node.appendChild(startHandle);
            const endHandle = document.createElement('span');
            endHandle.className = 'layout-stretch-handle layout-stretch-handle-end';
            endHandle.dataset.handleMode = 'stretch-end';
            node.appendChild(endHandle);
          }
        }
        node.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          state.selectedKey = key;
          renderStage();
          syncSelectionForm();
        });
        node.addEventListener('pointerdown', function (event) {
          const mode = event.target && event.target.dataset ? event.target.dataset.handleMode : null;
          event.preventDefault();
          event.stopPropagation();
          state.selectedKey = key;
          const current = findItemByKey(key);
          if (!current) return;
          state.dragState = {
            key,
            mode: mode || 'move',
            startX: event.clientX,
            startY: event.clientY,
            originX: current.x,
            originY: current.y,
            originWidth: current.width,
            originHeight: current.height,
          };
          renderStage();
          syncSelectionForm();
        });
        stage.appendChild(node);
      });
      setZoom(state.zoom);
      if (state.autoFitPending) {
        fitZoomToCanvas();
        state.autoFitPending = false;
      }
    }

    async function loadHallData() {
      hide(saveMessage);
      hide(saveError);
      state.selectedKey = null;
      const hallId = safeNumber(hallSelect.value, 0);
      state.selectedHallId = hallId || null;
      if (!state.selectedHallId) {
        state.layoutId = null;
        state.tables = [];
        state.decorItems = [];
        stageTitle.textContent = 'Выберите зал';
        renderStage();
        syncSelectionForm();
        return;
      }
      const [layoutList, tables] = await Promise.all([
        apiRequest(`/layouts/?hall=${encodeURIComponent(state.selectedHallId)}`, { token }),
        apiRequest(`/tables/?hall=${encodeURIComponent(state.selectedHallId)}&include_inactive=1`, { token }),
      ]);
      const layout = Array.isArray(layoutList) && layoutList.length ? layoutList[0] : null;
      const layoutMap = new Map(((layout && layout.items) || []).map((item) => [item.table, item]));
      state.layoutId = layout ? layout.id : null;
      state.canvasWidth = layout ? layout.canvas_width : 1200;
      state.canvasHeight = layout ? layout.canvas_height : 800;
      canvasWidthInput.value = state.canvasWidth;
      canvasHeightInput.value = state.canvasHeight;
      state.tables = tables.map((table, index) => buildTableFromApi(table, index, layoutMap));
      state.decorItems = ((layout && layout.decor_items) || []).map(buildDecorFromApi);
      state.snapshot = cloneEditorState();
      state.autoFitPending = true;
      renderStage();
      syncSelectionForm();
    }

    async function loadHalls(selectHallId) {
      state.halls = await apiRequest(`/halls/?venue=${encodeURIComponent(state.selectedVenueId)}&include_inactive=1`, { token });
      if (!state.halls.length) {
        hallSelect.innerHTML = '<option value="">Сначала создайте зал</option>';
        state.selectedHallId = null;
        state.layoutId = null;
        state.tables = [];
        state.decorItems = [];
        stageTitle.textContent = 'Сначала создайте зал';
        renderStage();
        syncSelectionForm();
        return;
      }
      hallSelect.innerHTML = state.halls.map((hall) => `<option value="${hall.id}">${escapeHtml(hall.name)}</option>`).join('');
      const preferred = selectHallId && state.halls.some((hall) => hall.id === selectHallId) ? selectHallId : state.halls[0].id;
      hallSelect.value = String(preferred);
      await loadHallData();
    }

    async function loadVenues() {
      if (state.fixedVenueSlug) {
        const venue = await apiRequest(`/venues/${encodeURIComponent(state.fixedVenueSlug)}/`, { token });
        state.venues = [venue];
        state.selectedVenueId = venue.id;
        if (venueSelect) venueSelect.innerHTML = `<option value="${venue.id}">${escapeHtml(venue.name)} — ${escapeHtml(venue.city)}</option>`;
        await loadHalls();
        return;
      }
      state.venues = await apiRequest('/venues/manageable/', { token });
      if (!state.venues.length) {
        throw new Error('У вас пока нет заведений, доступных для редактирования схемы зала.');
      }
      venueSelect.innerHTML = state.venues.map((venue) => `<option value="${venue.id}">${escapeHtml(venue.name)} — ${escapeHtml(venue.city)}</option>`).join('');
      state.selectedVenueId = state.venues[0].id;
      venueSelect.value = String(state.selectedVenueId);
      await loadHalls();
    }

    async function createHall() {
      const name = String(qs('#new-hall-name').value || '').trim();
      const description = String(qs('#new-hall-description').value || '').trim();
      const capacity = clampValue(safeNumber(qs('#new-hall-capacity').value, 24), 1, 500);
      if (!state.selectedVenueId) {
        setText(createHallError, 'Сначала выберите заведение.');
        show(createHallError);
        return;
      }
      if (!name) {
        setText(createHallError, 'Введите название зала.');
        show(createHallError);
        return;
      }
      hide(createHallError);
      hide(createHallMessage);
      createHallButton.disabled = true;
      try {
        const hall = await apiRequest('/halls/', {
          method: 'POST',
          token,
          body: {
            venue: state.selectedVenueId,
            name,
            description,
            capacity,
            is_active: true,
            sort_order: state.halls.length + 1,
          },
        });
        setText(createHallMessage, `Зал «${hall.name}» создан.`);
        show(createHallMessage);
        qs('#new-hall-name').value = '';
        qs('#new-hall-description').value = '';
        qs('#new-hall-capacity').value = '24';
        await loadHalls(hall.id);
      } catch (err) {
        setText(createHallError, err.message || 'Не удалось создать зал.');
        show(createHallError);
      } finally {
        createHallButton.disabled = false;
      }
    }

    async function saveFloorPlan() {
      if (!state.selectedHallId) {
        setText(saveError, 'Сначала выберите зал.');
        show(saveError);
        return;
      }
      hide(saveError);
      hide(saveMessage);
      saveButton.disabled = true;
      try {
        const payload = {
          hall: state.selectedHallId,
          canvas_width: state.canvasWidth,
          canvas_height: state.canvasHeight,
          is_active: true,
          tables: state.tables.map((item) => ({
            ...(item.id ? { id: item.id } : {}),
            name: item.name,
            seats_count: item.seats_count,
            is_active: item.is_active !== false,
            is_combinable: Boolean(item.is_combinable),
            note: item.note || '',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation || 0,
          })),
          decor_items: state.decorItems.map((item) => ({
            ...(item.id ? { id: item.id } : {}),
            item_type: item.item_type,
            label: item.label || '',
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation || 0,
          })),
        };
        await apiRequest('/layouts/save-floor-plan/', { method: 'POST', token, body: payload });
        setText(saveMessage, 'Схема зала сохранена. Вместимость зала пересчитана по активным столам.');
        show(saveMessage);
        await loadHalls(state.selectedHallId);
      } catch (err) {
        setText(saveError, err.message || 'Не удалось сохранить схему.');
        show(saveError);
      } finally {
        saveButton.disabled = false;
      }
    }

    qsa('.palette-item').forEach((button) => {
      button.addEventListener('dragstart', function (event) {
        const type = button.getAttribute('data-palette-type');
        state.paletteType = type;
        if (event.dataTransfer) event.dataTransfer.setData('text/plain', type || '');
      });
      button.addEventListener('click', function () {
        const type = button.getAttribute('data-palette-type');
        if (!type) return;
        const item = createNewPaletteItem(type, 24 + (getAllItems().length * 12), 24 + (getAllItems().length * 12));
        if (item.kind === 'table') state.tables.push(item); else state.decorItems.push(item);
        state.selectedKey = itemKey(item);
        renderStage();
        syncSelectionForm();
      });
    });

    stage.addEventListener('click', function () {
      state.selectedKey = null;
      renderStage();
      syncSelectionForm();
    });

    stage.addEventListener('dragover', function (event) {
      event.preventDefault();
    });
    stage.addEventListener('drop', function (event) {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const type = (event.dataTransfer && event.dataTransfer.getData('text/plain')) || state.paletteType;
      if (!type) return;
      const item = createNewPaletteItem(type, (event.clientX - rect.left) / state.zoom - 30, (event.clientY - rect.top) / state.zoom - 20);
      if (item.kind === 'table') state.tables.push(item); else state.decorItems.push(item);
      state.selectedKey = itemKey(item);
      renderStage();
      syncSelectionForm();
    });

    window.addEventListener('pointermove', function (event) {
      if (!state.dragState) return;
      const item = findItemByKey(state.dragState.key);
      if (!item) return;
      const deltaX = (event.clientX - state.dragState.startX) / state.zoom;
      const deltaY = (event.clientY - state.dragState.startY) / state.zoom;
      if (state.dragState.mode === 'move') {
        const occupied = getItemOccupiedSize(item);
        item.x = clampValue(Math.round(state.dragState.originX + deltaX), 0, Math.max(state.canvasWidth - occupied.width, 0));
        item.y = clampValue(Math.round(state.dragState.originY + deltaY), 0, Math.max(state.canvasHeight - occupied.height, 0));
      } else if (state.dragState.mode === 'resize') {
        item.width = clampValue(Math.round(state.dragState.originWidth + deltaX), getMinWidthForItem(item), state.canvasWidth - state.dragState.originX);
        item.height = clampValue(Math.round(state.dragState.originHeight + deltaY), getMinHeightForItem(item), state.canvasHeight - state.dragState.originY);
      } else if (state.dragState.mode === 'stretch-end') {
        item.width = clampValue(Math.round(state.dragState.originWidth + deltaX), getMinWidthForItem(item), state.canvasWidth - state.dragState.originX);
      } else if (state.dragState.mode === 'stretch-start') {
        const maxX = state.dragState.originX + state.dragState.originWidth - getMinWidthForItem(item);
        const nextX = clampValue(Math.round(state.dragState.originX + deltaX), 0, maxX);
        item.x = nextX;
        item.width = Math.round(state.dragState.originWidth - (nextX - state.dragState.originX));
      }
      clampItemToCanvas(item);
      renderStage();
      syncSelectionForm();
    });
    window.addEventListener('pointerup', function () {
      state.dragState = null;
    });

    if (venueSelect) venueSelect.addEventListener('change', async function () {
      state.selectedVenueId = safeNumber(venueSelect.value, 0);
      await loadHalls();
    });
    hallSelect.addEventListener('change', loadHallData);
    canvasWidthInput.addEventListener('input', function () { state.autoFitPending = true; renderStage(); });
    canvasHeightInput.addEventListener('input', function () { state.autoFitPending = true; renderStage(); });
    createHallButton.addEventListener('click', createHall);
    saveButton.addEventListener('click', saveFloorPlan);
    resetButton.addEventListener('click', restoreSnapshot);
    deleteButton.addEventListener('click', removeSelectedItem);
    duplicateButton.addEventListener('click', function () {
      const selected = state.selectedKey ? findItemByKey(state.selectedKey) : null;
      if (!selected) return;
      const clone = JSON.parse(JSON.stringify(selected));
      clone.id = null;
      clone.local_id = nextLocalId();
      const cloneOccupied = getItemOccupiedSize(clone);
      clone.x = clampValue((clone.x || 0) + 24, 0, Math.max(state.canvasWidth - cloneOccupied.width, 0));
      clone.y = clampValue((clone.y || 0) + 24, 0, Math.max(state.canvasHeight - cloneOccupied.height, 0));
      if (clone.kind === 'table') {
        clone.name = `${clone.name || 'Стол'} copy`;
        state.tables.push(clone);
      } else {
        state.decorItems.push(clone);
      }
      state.selectedKey = itemKey(clone);
      renderStage();
      syncSelectionForm();
    });

    if (zoomOutButton) zoomOutButton.addEventListener('click', function () { setZoom(state.zoom - 0.1); });
    if (zoomInButton) zoomInButton.addEventListener('click', function () { setZoom(state.zoom + 0.1); });
    if (zoomFitButton) zoomFitButton.addEventListener('click', fitZoomToCanvas);
    window.addEventListener('resize', function () { if (dashboard && !dashboard.classList.contains('hidden')) fitZoomToCanvas(); });

    itemLabelInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        if (item.kind === 'table') item.name = itemLabelInput.value.trim() || 'Стол';
        else item.label = itemLabelInput.value.trim();
        return item;
      });
    });
    itemSeatsInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        if (item.kind === 'table') item.seats_count = clampValue(safeNumber(itemSeatsInput.value, item.seats_count || 4), 1, 24);
        return item;
      });
    });
    itemXInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        item.x = safeNumber(itemXInput.value, item.x);
        return item;
      });
    });
    itemYInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        item.y = safeNumber(itemYInput.value, item.y);
        return item;
      });
    });
    itemWidthInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        item.width = safeNumber(itemWidthInput.value, item.width);
        return item;
      });
    });
    itemHeightInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        item.height = safeNumber(itemHeightInput.value, item.height);
        return item;
      });
    });
    itemRotationInput.addEventListener('input', function () {
      patchSelectedItem((item) => {
        item.rotation = clampValue(safeNumber(itemRotationInput.value, item.rotation || 0), 0, 359);
        return item;
      });
    });

    (async function initLayoutEditor() {
      try {
        const me = await apiRequest('/auth/me/', { token });
        storeSession(token, me);
        buildHeader(me);
        if (!(me.role === 'owner' || me.role === 'manager')) {
          throw new Error('Редактор схемы доступен только владельцу и менеджеру.');
        }
        state.me = me;
        if (warning && warning.id === 'layout-editor-auth-warning') hide(warning);
        if (dashboard && dashboard.id === 'layout-editor-dashboard') show(dashboard);
        await loadVenues();
      } catch (err) {
        if (warning && warning.id === 'layout-editor-auth-warning') hide(warning);
        if (error) {
          error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть редактор схемы.')}</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>`;
          show(error);
        }
      }
    })();
  }


  async function mountVenueReviewsPage() {
    const content = qs('#venue-reviews-content');
    if (!content) return;
    const slug = document.body.getAttribute('data-venue-slug');
    const loading = qs('#venue-reviews-loading');
    const error = qs('#venue-reviews-error');
    const token = getToken();
    const currentUser = getUser();
    const reviewsState = { sort: 'new', withPhotos: false };

    function renderReviewCard(review) {
      const repliesHtml = (review.replies || []).map((reply) => `
        <article class="review-reply-card">
          <div class="review-card-meta">
            <strong>${escapeHtml(reply.author_name)}</strong>
            <span class="pill muted-chip">${escapeHtml(modeLabel(reply.author_role || 'manager'))}</span>
            <span>${escapeHtml(formatDateTimeRu(reply.created_at) || '')}</span>
          </div>
          <p>${escapeHtml(reply.text)}</p>
        </article>
      `).join('');
      return `
        <article class="review-card" data-review-id="${review.id}">
          <div class="review-card-meta">
            <div>
              <strong>${escapeHtml(review.author_name)}</strong>
              <div class="table-chip-list top-gap-xs">
                <span class="pill pill-rating">★ ${escapeHtml(review.rating || '-')}</span>
                <span class="pill muted-chip">${escapeHtml(formatDateTimeRu(review.created_at) || '')}</span>
              </div>
            </div>
            <button class="button button-secondary review-like-button" type="button" data-review-like="${review.id}">${review.liked_by_me ? 'Убрать лайк' : 'Лайк'} · ${review.likes_count || 0}</button>
          </div>
          <p>${escapeHtml(review.text)}</p>
          ${renderReviewImages(review.images)}
          <div class="button-row top-gap">
            ${review.can_reply ? `<button class="button button-secondary" type="button" data-review-reply-toggle="${review.id}">Ответить</button>` : ''}
          </div>
          <form class="form top-gap hidden" data-review-reply-form="${review.id}">
            <label class="field"><span>Ответ менеджера или владельца</span><textarea name="text" rows="3" placeholder="Спасибо за отзыв — можно ответить здесь"></textarea></label>
            <div class="button-row"><button class="button button-primary" type="submit">Отправить ответ</button></div>
          </form>
          ${repliesHtml ? `<div class="review-replies-list top-gap">${repliesHtml}</div>` : ''}
        </article>
      `;
    }

    async function loadReviews() {
      const venue = await apiRequest(`/venues/${slug}/`, token ? { token } : undefined);
      applyVenueBrandingToPage(venue.branding);
      const reviewParams = new URLSearchParams({ venue_slug: slug, sort: reviewsState.sort || 'new' });
      if (reviewsState.withPhotos) reviewParams.set('with_photos', 'true');
      const reviews = await apiRequest(`/reviews/?${reviewParams.toString()}`, token ? { token } : undefined);
      const total = reviews.length;
      const likesTotal = reviews.reduce((acc, item) => acc + Number(item.likes_count || 0), 0);
      content.innerHTML = `
        <section class="hero hero-compact venue-themed-surface" id="venue-reviews-hero">
          <span class="section-kicker">Отзывы о заведении</span>
          <h1>${escapeHtml(venue.name)}</h1>
          <p class="hero-text">Зарегистрированные пользователи могут оставлять отзывы даже без бронирования на сайте: гости часто приходят напрямую, а здесь могут поделиться впечатлениями и фотографиями после регистрации.</p>
          <div class="button-row top-gap"><a class="button button-secondary" href="/venues/${encodeURIComponent(venue.slug)}/">Назад к заведению</a></div>
        </section>
        <section class="grid grid-two">
          <article class="card">
            <div class="section-topline"><span class="section-kicker">Сводка</span><h2>Оценки и активность</h2></div>
            <div class="definition-list top-gap">
              <div><span>Средняя оценка</span><strong>${Number(venue.average_rating || 0).toFixed(1)}</strong></div>
              <div><span>Отзывов</span><strong>${total}</strong></div>
              <div><span>Лайков у отзывов</span><strong>${likesTotal}</strong></div>
            </div>
          </article>
          <article class="card">
            <div class="section-topline"><span class="section-kicker">Новый отзыв</span><h2>Поделитесь впечатлением</h2></div>
            ${token ? `
              <form class="form top-gap" id="venue-review-form">
                <div class="grid grid-two">
                  <label class="field"><span>Оценка</span>
                    <select name="rating" required>
                      <option value="5">5 — отлично</option>
                      <option value="4">4 — хорошо</option>
                      <option value="3">3 — нормально</option>
                      <option value="2">2 — слабо</option>
                      <option value="1">1 — плохо</option>
                    </select>
                  </label>
                  <div class="field read-only-field"><span>Кто пишет</span><div>${escapeHtml(currentUser?.first_name || currentUser?.email || 'Авторизованный пользователь')}</div></div>
                </div>
                <label class="field"><span>Текст отзыва</span><textarea name="text" rows="5" placeholder="Например: понравился интерьер, обслуживание, кухня или атмосфера" required></textarea></label>
                <label class="field"><span>Фото к отзыву, необязательно</span><input type="file" name="images" accept="image/*" multiple></label>
                <div class="button-row"><button class="button button-primary" type="submit">Оставить отзыв</button></div>
              </form>
              <p class="success-text hidden" id="venue-review-form-message"></p>
              <p class="error-text hidden" id="venue-review-form-error"></p>
            ` : `<p class="muted-block top-gap">Чтобы оставить отзыв или поставить лайк, сначала войдите в аккаунт. После входа доступна клиентская активность даже для менеджера и владельца.</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>`}
          </article>
        </section>
        <section class="card top-gap review-filter-card">
          <div class="section-topline"><span class="section-kicker">Фильтр</span><h2>Сортировка отзывов</h2></div>
          <div class="grid grid-two top-gap">
            <label class="field"><span>Порядок</span>
              <select id="venue-review-sort">
                <option value="new" ${reviewsState.sort === 'new' ? 'selected' : ''}>Сначала новые</option>
                <option value="old" ${reviewsState.sort === 'old' ? 'selected' : ''}>Сначала старые</option>
                <option value="rating_desc" ${reviewsState.sort === 'rating_desc' ? 'selected' : ''}>Сначала высокая оценка</option>
                <option value="rating_asc" ${reviewsState.sort === 'rating_asc' ? 'selected' : ''}>Сначала низкая оценка</option>
                <option value="liked" ${reviewsState.sort === 'liked' ? 'selected' : ''}>Сначала популярные</option>
              </select>
            </label>
            <label class="field checkbox-field"><span>Фото</span><label class="checkline"><input type="checkbox" id="venue-review-with-photos" ${reviewsState.withPhotos ? 'checked' : ''}> Только отзывы с фото</label></label>
          </div>
        </section>
        <section class="page-stack top-gap" id="venue-reviews-list">${reviews.length ? reviews.map(renderReviewCard).join('') : '<article class="card">Пока отзывов по выбранному фильтру нет.</article>'}</section>
      `;
      applyVenueBrandingToContainer(qs('#venue-reviews-hero', content), venue.branding);

      const reviewSort = qs('#venue-review-sort', content);
      const reviewWithPhotos = qs('#venue-review-with-photos', content);
      if (reviewSort) {
        reviewSort.addEventListener('change', async function () {
          reviewsState.sort = reviewSort.value || 'new';
          await loadReviews();
        });
      }
      if (reviewWithPhotos) {
        reviewWithPhotos.addEventListener('change', async function () {
          reviewsState.withPhotos = !!reviewWithPhotos.checked;
          await loadReviews();
        });
      }

      const reviewForm = qs('#venue-review-form', content);
      const reviewMessage = qs('#venue-review-form-message', content);
      const reviewError = qs('#venue-review-form-error', content);
      if (reviewForm) {
        reviewForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          hide(reviewMessage); hide(reviewError);
          const submit = qs('button[type="submit"]', reviewForm);
          submit.disabled = true;
          try {
            const data = new FormData(reviewForm);
            data.set('venue', String(venue.id));
            await apiUploadRequest('/reviews/', { method: 'POST', token, body: data });
            setText(reviewMessage, 'Отзыв сохранён. Он уже виден на странице заведения.');
            show(reviewMessage);
            reviewForm.reset();
            await loadReviews();
          } catch (err) {
            setText(reviewError, err.message || 'Не удалось сохранить отзыв.');
            show(reviewError);
          } finally {
            submit.disabled = false;
          }
        });
      }

      qsa('[data-review-like]', content).forEach((button) => {
        button.addEventListener('click', async function () {
          if (!token) { window.location.href = '/login/'; return; }
          button.disabled = true;
          try {
            await apiRequest(`/reviews/${button.getAttribute('data-review-like')}/toggle_like/`, { method: 'POST', token, body: {} });
            await loadReviews();
          } finally {
            button.disabled = false;
          }
        });
      });

      qsa('[data-review-reply-toggle]', content).forEach((button) => {
        button.addEventListener('click', function () {
          const form = qs(`[data-review-reply-form="${button.getAttribute('data-review-reply-toggle')}"]`, content);
          if (!form) return;
          form.classList.toggle('hidden');
        });
      });

      qsa('[data-review-reply-form]', content).forEach((form) => {
        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          const reviewId = form.getAttribute('data-review-reply-form');
          const textField = qs('textarea[name="text"]', form);
          const submit = qs('button[type="submit"]', form);
          submit.disabled = true;
          try {
            await apiRequest('/reviews/', { method: 'POST', token, body: { parent: Number(reviewId), text: String(textField.value || '').trim() } });
            await loadReviews();
          } catch (err) {
            alert(err.message || 'Не удалось отправить ответ.');
          } finally {
            submit.disabled = false;
          }
        });
      });
    }

    try {
      await loadReviews();
      hide(loading);
      show(content);
    } catch (err) {
      hide(loading);
      error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть страницу отзывов.')}</p>`;
      show(error);
    }
  }


  function renderManageVenueImageCard(image) {
    const url = resolveImageUrl(image);
    return `
      <article class="manage-image-card">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt_text || 'Фото заведения')}" loading="lazy">
        <div class="manage-image-card-body">
          <div class="eyebrow-row">
            ${image.is_cover ? '<span class="pill pill-rating">Обложка</span>' : '<span class="pill muted-chip">Фото</span>'}
            <span class="muted-block">${escapeHtml(formatDateTimeRu(image.created_at) || '')}</span>
          </div>
          <p class="muted-block">${escapeHtml(image.alt_text || 'Описание не указано')}</p>
          <div class="button-row compact-row">
            ${image.is_cover ? '' : `<button class="button button-secondary" type="button" data-image-cover="${image.id}">Сделать обложкой</button>`}
            <button class="button button-secondary" type="button" data-image-delete="${image.id}">Удалить</button>
          </div>
        </div>
      </article>
    `;
  }

  async function loadVenueImagesForManage(slug, token) {
    const imagesList = qs('#venue-images-list');
    const imagesEmpty = qs('#venue-images-empty');
    const imagesMessage = qs('#venue-images-message');
    const imagesError = qs('#venue-images-error');
    if (!imagesList || !slug || !token) return;
    try {
      const items = await apiRequest(`/venues/${encodeURIComponent(slug)}/images/`, { token });
      if (!Array.isArray(items) || !items.length) {
        imagesList.innerHTML = '';
        show(imagesEmpty);
        return;
      }
      hide(imagesEmpty);
      imagesList.innerHTML = items.map(renderManageVenueImageCard).join('');
      qsa('[data-image-cover]', imagesList).forEach((button) => {
        button.addEventListener('click', async function () {
          hide(imagesMessage); hide(imagesError);
          button.disabled = true;
          try {
            await apiRequest(`/venues/${encodeURIComponent(slug)}/images/${button.getAttribute('data-image-cover')}/set-cover/`, { method: 'POST', token, body: {} });
            setText(imagesMessage, 'Обложка обновлена.'); show(imagesMessage);
            await loadVenueImagesForManage(slug, token);
          } catch (err) {
            setText(imagesError, err.message || 'Не удалось назначить обложку.'); show(imagesError);
          } finally {
            button.disabled = false;
          }
        });
      });
      qsa('[data-image-delete]', imagesList).forEach((button) => {
        button.addEventListener('click', async function () {
          if (!window.confirm('Удалить это фото из галереи заведения?')) return;
          hide(imagesMessage); hide(imagesError);
          button.disabled = true;
          try {
            await apiRequest(`/venues/${encodeURIComponent(slug)}/images/${button.getAttribute('data-image-delete')}/`, { method: 'DELETE', token });
            setText(imagesMessage, 'Фотография удалена.'); show(imagesMessage);
            await loadVenueImagesForManage(slug, token);
          } catch (err) {
            setText(imagesError, err.message || 'Не удалось удалить фотографию.'); show(imagesError);
          } finally {
            button.disabled = false;
          }
        });
      });
    } catch (err) {
      imagesList.innerHTML = '';
      setText(imagesError, err.message || 'Не удалось загрузить список фотографий.');
      show(imagesError);
    }
  }

  function bindVenueImageUploadControls() {
    const imagesForm = qs('#venue-images-form');
    const imagesSubmit = qs('#venue-images-submit');
    const imagesMessage = qs('#venue-images-message');
    const imagesError = qs('#venue-images-error');
    if (!imagesForm || imagesForm.dataset.webtavernUploadBound === 'true') return;
    imagesForm.dataset.webtavernUploadBound = 'true';

    async function submitVenueImages(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const slug = document.body.getAttribute('data-manage-venue-slug') || document.body.getAttribute('data-venue-slug');
      const token = getToken();
      hide(imagesMessage); hide(imagesError);
      if (!slug) {
        setText(imagesError, 'Не удалось определить заведение для загрузки фотографий.'); show(imagesError);
        return false;
      }
      if (!token) {
        setText(imagesError, 'Сначала войдите в аккаунт владельца или менеджера.'); show(imagesError);
        return false;
      }
      const fileInput = imagesForm.querySelector('input[type="file"][name="images"]');
      const files = fileInput ? Array.from(fileInput.files || []).filter((file) => file && file.size) : [];
      if (!files.length) {
        setText(imagesError, 'Выберите хотя бы одно изображение.'); show(imagesError);
        return false;
      }
      const formData = new FormData();
      files.forEach((file) => formData.append('images', file));
      const altInput = imagesForm.querySelector('[name="alt_text"]');
      const coverInput = imagesForm.querySelector('[name="is_cover"]');
      formData.append('alt_text', String(altInput ? altInput.value : '').trim());
      if (coverInput && coverInput.checked) formData.append('is_cover', 'on');
      if (imagesSubmit) imagesSubmit.disabled = true;
      try {
        await apiUploadRequest(`/venues/${encodeURIComponent(slug)}/images/`, { method: 'POST', token, body: formData });
        setText(imagesMessage, 'Фотографии загружены и уже видны на странице заведения.'); show(imagesMessage);
        imagesForm.reset();
        await loadVenueImagesForManage(slug, token);
      } catch (err) {
        setText(imagesError, err.message || 'Не удалось загрузить фотографии.'); show(imagesError);
      } finally {
        if (imagesSubmit) imagesSubmit.disabled = false;
      }
      return false;
    }

    imagesForm.addEventListener('submit', submitVenueImages);
    if (imagesSubmit) imagesSubmit.addEventListener('click', submitVenueImages);
  }


  async function mountManageVenuePage() {
    const dashboard = qs('#venue-manage-dashboard');
    if (!dashboard) return;
    const warning = qs('#venue-manage-auth-warning');
    const error = qs('#venue-manage-error');
    const title = qs('#venue-manage-title');
    const subtitle = qs('#venue-manage-subtitle');
    const summary = qs('#venue-manage-summary');
    const form = qs('#venue-manage-form');
    const message = qs('#venue-manage-message');
    const formError = qs('#venue-manage-form-error');
    const submit = qs('#venue-manage-submit');
    const moderationButton = qs('#venue-manage-submit-moderation');
    const ownerLink = qs('#venue-manage-owner-link');
    const managerLink = qs('#venue-manage-manager-link');
    const managersAccordion = qs('#venue-managers-accordion');
    const managersForm = qs('#venue-managers-form');
    const managersList = qs('#venue-managers-list');
    const managersEmpty = qs('#venue-managers-empty');
    const managersMessage = qs('#venue-managers-message');
    const managersError = qs('#venue-managers-error');
    const managersSubmit = qs('#venue-managers-submit');
    const rulesForm = qs('#venue-booking-rules-form');
    const rulesMessage = qs('#venue-booking-rules-message');
    const rulesError = qs('#venue-booking-rules-error');
    const rulesSubmit = qs('#venue-booking-rules-submit');
    const rulesReadonly = qs('#venue-booking-rules-readonly');
    const pricingForm = qs('#venue-pricing-form');
    const pricingList = qs('#venue-pricing-list');
    const pricingEmpty = qs('#venue-pricing-empty');
    const pricingMessage = qs('#venue-pricing-message');
    const pricingError = qs('#venue-pricing-error');
    const pricingSubmit = qs('#venue-pricing-submit');
    const pricingReadonly = qs('#venue-pricing-readonly');
    const pricingRuleType = qs('#venue-pricing-rule-type');
    const pricingTableCountField = qs('#venue-pricing-table-count-field');
    const pricingHallField = qs('#venue-pricing-hall-field');
    const pricingHallSelect = qs('#venue-pricing-hall-select');
    const brandingForm = qs('#venue-branding-form');
    const brandingMessage = qs('#venue-branding-message');
    const brandingError = qs('#venue-branding-error');
    const brandingSubmit = qs('#venue-branding-submit');
    const brandingPreview = qs('#venue-branding-preview');
    const brandingPreviewBadge = qs('#venue-branding-preview-badge');
    const brandingPreviewCta = qs('#venue-branding-preview-cta');
    const brandingReset = qs('#venue-branding-reset');
    const brandingContrastReport = qs('#venue-branding-contrast-report');
    const imagesForm = qs('#venue-images-form');
    const imagesList = qs('#venue-images-list');
    const imagesEmpty = qs('#venue-images-empty');
    const imagesMessage = qs('#venue-images-message');
    const imagesError = qs('#venue-images-error');
    const imagesSubmit = qs('#venue-images-submit');
    const fillCoordinatesButton = qs('#venue-manage-fill-coordinates');
    const slug = document.body.getAttribute('data-manage-venue-slug') || document.body.getAttribute('data-venue-slug');
    const token = getToken();
    bindVenueImageUploadControls();

    if (!token) {
      warning.classList.add('error-card');
      warning.innerHTML = '<p>Сначала войдите под владельцем или менеджером, затем откройте редактирование снова.</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>';
      return;
    }

    const boolSelectValue = (value) => value ? 'true' : 'false';
    const parseBooleanValue = (value) => String(value) === 'true';

    function fillSummary(venue) {
      summary.innerHTML = `
        <div><span>Статус</span><strong>${escapeHtml(venueStatusLabel(venue.status))}</strong></div>
        <div><span>Публикация</span><strong>${venue.is_published ? 'Да' : 'Нет'}</strong></div>
        <div><span>Залы</span><strong>${Array.isArray(venue.halls) ? venue.halls.length : 0}</strong></div>
        <div><span>География</span><strong>${escapeHtml(venue.city)}${venue.district ? `, ${escapeHtml(venue.district)}` : ''}</strong></div>
      `;
    }

    function fillBookingRules(rule) {
      if (!rulesForm || !rule) return;
      rulesForm.elements.default_duration_minutes.value = rule.default_duration_minutes ?? 60;
      rulesForm.elements.slot_step_minutes.value = rule.slot_step_minutes ?? 10;
      rulesForm.elements.cleanup_buffer_minutes.value = rule.cleanup_buffer_minutes ?? 20;
      rulesForm.elements.payment_hold_minutes.value = rule.payment_hold_minutes ?? 30;
      if (rulesForm.elements.min_booking_notice_minutes) rulesForm.elements.min_booking_notice_minutes.value = rule.min_booking_notice_minutes ?? 60;
      if (rulesForm.elements.free_cancellation_before_minutes) rulesForm.elements.free_cancellation_before_minutes.value = rule.free_cancellation_before_minutes ?? 120;
      if (rulesForm.elements.no_show_after_minutes) rulesForm.elements.no_show_after_minutes.value = rule.no_show_after_minutes ?? 30;
      rulesForm.elements.requires_manager_confirmation.value = boolSelectValue(rule.requires_manager_confirmation);
      rulesForm.elements.allow_client_approximate_time.value = boolSelectValue(rule.allow_client_approximate_time);
      rulesForm.elements.allow_table_combination.value = boolSelectValue(rule.allow_table_combination);
      if (rulesForm.elements.allow_shared_seating) rulesForm.elements.allow_shared_seating.value = boolSelectValue(rule.allow_shared_seating);
      if (rulesForm.elements.allow_manager_reschedule) rulesForm.elements.allow_manager_reschedule.value = boolSelectValue(rule.allow_manager_reschedule);
      rulesForm.elements.deposit_amount.value = rule.deposit_amount ?? 0;
      rulesForm.elements.deposit_currency.value = rule.deposit_currency || 'RUB';
    }

    function setBookingRulesEditable(isEditable) {
      if (!rulesForm) return;
      qsa('input, select, textarea, button', rulesForm).forEach((element) => {
        if (element.id === 'venue-booking-rules-submit') return;
        element.disabled = !isEditable;
      });
      if (rulesSubmit) rulesSubmit.disabled = !isEditable;
      if (rulesReadonly) { if (isEditable) hide(rulesReadonly); else show(rulesReadonly); }
    }

    function setPricingEditable(isEditable) {
      if (!pricingForm) return;
      qsa('input, select, textarea, button', pricingForm).forEach((element) => {
        if (element.id === 'venue-pricing-submit') return;
        element.disabled = !isEditable;
      });
      if (pricingSubmit) pricingSubmit.disabled = !isEditable;
      if (pricingReadonly) { if (isEditable) hide(pricingReadonly); else show(pricingReadonly); }
    }

    function updatePricingFormMode() {
      if (!pricingRuleType) return;
      const type = String(pricingRuleType.value || 'table_count');
      if (pricingTableCountField) pricingTableCountField.classList.toggle('hidden', type !== 'table_count');
      if (pricingHallField) pricingHallField.classList.toggle('hidden', type !== 'whole_hall');
    }

    function fillPricingHallOptions(venue) {
      if (!pricingHallSelect) return;
      const halls = Array.isArray(venue.halls) ? venue.halls : [];
      pricingHallSelect.innerHTML = halls.length
        ? halls.map((hall) => `<option value="${hall.id}">${escapeHtml(hall.name)}</option>`).join('')
        : '<option value="">Сначала добавьте зал</option>';
    }

    async function loadVenuePriceRules(venueId) {
      if (!pricingList) return;
      pricingList.innerHTML = '<article class="subcard">Загружаем акции...</article>';
      hide(pricingEmpty);
      try {
        const rules = await apiRequest(`/booking-price-rules/?venue=${encodeURIComponent(venueId)}`, { token });
        if (!Array.isArray(rules) || !rules.length) {
          pricingList.innerHTML = '';
          show(pricingEmpty);
          return;
        }
        pricingList.innerHTML = rules.map((rule) => `
          <article class="subcard manager-assignment-card">
            <div>
              <strong>${escapeHtml(rule.title || rule.rule_type_label || 'Правило стоимости')}</strong>
              <p>${rule.rule_type === 'whole_hall' ? `Зал: ${escapeHtml(rule.hall_name || 'не выбран')}` : `Количество столов: ${escapeHtml(rule.table_count || '')}`}</p>
              <p>${escapeHtml(formatMoney(rule.price_amount, rule.price_currency || 'RUB'))}${rule.is_active ? '' : ' · выключено'}</p>
              ${rule.description ? `<p class="muted-small">${escapeHtml(rule.description)}</p>` : ''}
            </div>
            <div class="button-row">
              <button class="button button-secondary venue-pricing-delete" type="button" data-id="${rule.id}">Удалить</button>
            </div>
          </article>
        `).join('');
        qsa('.venue-pricing-delete', pricingList).forEach((button) => {
          button.addEventListener('click', async function () {
            if (!window.confirm('Удалить это правило стоимости?')) return;
            hide(pricingMessage); hide(pricingError);
            try {
              await apiRequest(`/booking-price-rules/${button.getAttribute('data-id')}/`, { method: 'DELETE', token });
              setText(pricingMessage, 'Правило стоимости удалено.'); show(pricingMessage);
              await loadVenuePriceRules(venueId);
            } catch (err) {
              setText(pricingError, err.message || 'Не удалось удалить правило стоимости.'); show(pricingError);
            }
          });
        });
      } catch (err) {
        pricingList.innerHTML = '';
        setText(pricingError, err.message || 'Не удалось загрузить акции.'); show(pricingError);
      }
    }


    function renderManageImageCard(image) {
      const url = resolveImageUrl(image);
      return `
        <article class="manage-image-card">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt_text || 'Фото заведения')}" loading="lazy">
          <div class="manage-image-card-body">
            <div class="eyebrow-row">
              ${image.is_cover ? '<span class="pill pill-rating">Обложка</span>' : '<span class="pill muted-chip">Фото</span>'}
              <span class="muted-block">${escapeHtml(formatDateTimeRu(image.created_at) || '')}</span>
            </div>
            <p class="muted-block">${escapeHtml(image.alt_text || 'Описание не указано')}</p>
            <div class="button-row compact-row">
              ${image.is_cover ? '' : `<button class="button button-secondary" type="button" data-image-cover="${image.id}">Сделать обложкой</button>`}
              <button class="button button-secondary" type="button" data-image-delete="${image.id}">Удалить</button>
            </div>
          </div>
        </article>
      `;
    }

    async function loadVenueImages() {
      if (!imagesList) return;
      try {
        const items = await apiRequest(`/venues/${encodeURIComponent(slug)}/images/`, { token });
        if (!Array.isArray(items) || !items.length) {
          imagesList.innerHTML = '';
          show(imagesEmpty);
          return;
        }
        hide(imagesEmpty);
        imagesList.innerHTML = items.map(renderManageImageCard).join('');
        qsa('[data-image-cover]', imagesList).forEach((button) => {
          button.addEventListener('click', async function () {
            hide(imagesMessage); hide(imagesError);
            button.disabled = true;
            try {
              await apiRequest(`/venues/${encodeURIComponent(slug)}/images/${button.getAttribute('data-image-cover')}/set-cover/`, { method: 'POST', token, body: {} });
              setText(imagesMessage, 'Обложка обновлена.'); show(imagesMessage);
              await loadVenueImages();
            } catch (err) { setText(imagesError, err.message || 'Не удалось назначить обложку.'); show(imagesError); }
            finally { button.disabled = false; }
          });
        });
        qsa('[data-image-delete]', imagesList).forEach((button) => {
          button.addEventListener('click', async function () {
            if (!window.confirm('Удалить это фото из галереи заведения?')) return;
            hide(imagesMessage); hide(imagesError);
            button.disabled = true;
            try {
              await apiRequest(`/venues/${encodeURIComponent(slug)}/images/${button.getAttribute('data-image-delete')}/`, { method: 'DELETE', token });
              setText(imagesMessage, 'Фотография удалена.'); show(imagesMessage);
              await loadVenueImages();
            } catch (err) { setText(imagesError, err.message || 'Не удалось удалить фотографию.'); show(imagesError); }
            finally { button.disabled = false; }
          });
        });
      } catch (err) {
        imagesList.innerHTML = '';
        setText(imagesError, err.message || 'Не удалось загрузить список фотографий.');
        show(imagesError);
      }
    }


    function renderManagerAssignment(item) {
      const name = item.manager_name || item.manager_email || 'Менеджер';
      return `
        <article class="manager-assignment-card">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(item.manager_email || '')}</span>
          </div>
          <button class="button button-secondary" type="button" data-manager-delete="${escapeHtml(item.id)}">Убрать доступ</button>
        </article>
      `;
    }

    async function loadVenueManagers() {
      if (!managersList) return;
      try {
        const items = await apiRequest(`/venues/${encodeURIComponent(slug)}/managers/`, { token });
        if (!Array.isArray(items) || !items.length) {
          managersList.innerHTML = '';
          show(managersEmpty);
          return;
        }
        hide(managersEmpty);
        managersList.innerHTML = items.map(renderManagerAssignment).join('');
        qsa('[data-manager-delete]', managersList).forEach((button) => {
          button.addEventListener('click', async function () {
            if (!window.confirm('Убрать этого менеджера из заведения?')) return;
            hide(managersMessage); hide(managersError);
            button.disabled = true;
            try {
              await apiRequest(`/venues/${encodeURIComponent(slug)}/managers/${button.getAttribute('data-manager-delete')}/`, { method: 'DELETE', token });
              setText(managersMessage, 'Доступ менеджера удалён.'); show(managersMessage);
              await loadVenueManagers();
            } catch (err) {
              setText(managersError, err.message || 'Не удалось удалить менеджера.'); show(managersError);
            } finally {
              button.disabled = false;
            }
          });
        });
      } catch (err) {
        managersList.innerHTML = '';
        setText(managersError, err.message || 'Не удалось загрузить менеджеров.');
        show(managersError);
      }
    }

    const presetPalettes = {
      northern_blue: { label: 'Northern blue', theme_mode: 'dark', background_variant: 'graphite-grid', accent_color: '#2563eb', text_color: '#e5eefc', card_background_color: '#0f172a', card_text_color: '#e5eefc', badge_background_color: '#dbeafe', badge_text_color: '#1e3a8a', cta_background_color: '#2563eb', cta_text_color: '#ffffff' },
      brick_house: { label: 'Brick house', theme_mode: 'light', background_variant: 'warm-gradient', accent_color: '#b45309', text_color: '#111827', card_background_color: '#fff7ed', card_text_color: '#7c2d12', badge_background_color: '#fed7aa', badge_text_color: '#9a3412', cta_background_color: '#c2410c', cta_text_color: '#ffffff' },
      sage_garden: { label: 'Sage garden', theme_mode: 'light', background_variant: 'pattern-soft', accent_color: '#166534', text_color: '#0f172a', card_background_color: '#f0fdf4', card_text_color: '#14532d', badge_background_color: '#dcfce7', badge_text_color: '#166534', cta_background_color: '#166534', cta_text_color: '#ffffff' },
      night_neon: { label: 'Night neon', theme_mode: 'dark', background_variant: 'dark-soft', accent_color: '#7c3aed', text_color: '#f5f3ff', card_background_color: '#111827', card_text_color: '#f5f3ff', badge_background_color: '#312e81', badge_text_color: '#e0e7ff', cta_background_color: '#7c3aed', cta_text_color: '#ffffff' },
      coffee_sand: { label: 'Coffee sand', theme_mode: 'light', background_variant: 'warm-gradient', accent_color: '#92400e', text_color: '#3f2b1c', card_background_color: '#fef3c7', card_text_color: '#78350f', badge_background_color: '#fde68a', badge_text_color: '#92400e', cta_background_color: '#92400e', cta_text_color: '#ffffff' },
      berry_lounge: { label: 'Berry lounge', theme_mode: 'dark', background_variant: 'dark-soft', accent_color: '#be185d', text_color: '#fff1f2', card_background_color: '#4c0519', card_text_color: '#ffe4e6', badge_background_color: '#fecdd3', badge_text_color: '#9f1239', cta_background_color: '#be185d', cta_text_color: '#ffffff' },
      forest_ember: { label: 'Forest ember', theme_mode: 'dark', background_variant: 'pattern-soft', accent_color: '#f97316', text_color: '#f7fee7', card_background_color: '#1f2a1d', card_text_color: '#f7fee7', badge_background_color: '#dcfce7', badge_text_color: '#14532d', cta_background_color: '#ea580c', cta_text_color: '#ffffff' },
      royal_indigo: { label: 'Royal indigo', theme_mode: 'dark', background_variant: 'graphite-grid', accent_color: '#a78bfa', text_color: '#eef2ff', card_background_color: '#1e1b4b', card_text_color: '#eef2ff', badge_background_color: '#e0e7ff', badge_text_color: '#3730a3', cta_background_color: '#6d28d9', cta_text_color: '#ffffff' },
      sea_breeze: { label: 'Sea breeze', theme_mode: 'light', background_variant: 'cool-gradient', accent_color: '#0284c7', text_color: '#0f172a', card_background_color: '#ecfeff', card_text_color: '#164e63', badge_background_color: '#cffafe', badge_text_color: '#155e75', cta_background_color: '#0369a1', cta_text_color: '#ffffff' },
      cherry_noir: { label: 'Cherry noir', theme_mode: 'dark', background_variant: 'dark-soft', accent_color: '#e11d48', text_color: '#fff1f2', card_background_color: '#2b0b12', card_text_color: '#ffe4e6', badge_background_color: '#ffe4e6', badge_text_color: '#9f1239', cta_background_color: '#be123c', cta_text_color: '#ffffff' },
      amber_craft: { label: 'Amber craft', theme_mode: 'light', background_variant: 'warm-gradient', accent_color: '#d97706', text_color: '#3f2b1c', card_background_color: '#fffbeb', card_text_color: '#78350f', badge_background_color: '#fef3c7', badge_text_color: '#92400e', cta_background_color: '#b45309', cta_text_color: '#ffffff' },
      mint_minimal: { label: 'Mint minimal', theme_mode: 'light', background_variant: 'neutral-surface', accent_color: '#0f766e', text_color: '#0f172a', card_background_color: '#f0fdfa', card_text_color: '#134e4a', badge_background_color: '#ccfbf1', badge_text_color: '#115e59', cta_background_color: '#0f766e', cta_text_color: '#ffffff' },
      steel_business: { label: 'Steel business', theme_mode: 'light', background_variant: 'neutral-surface', accent_color: '#475569', text_color: '#111827', card_background_color: '#f8fafc', card_text_color: '#1e293b', badge_background_color: '#e2e8f0', badge_text_color: '#334155', cta_background_color: '#334155', cta_text_color: '#ffffff' },
      sunset_orange: { label: 'Sunset orange', theme_mode: 'light', background_variant: 'warm-gradient', accent_color: '#ea580c', text_color: '#111827', card_background_color: '#fff7ed', card_text_color: '#7c2d12', badge_background_color: '#fed7aa', badge_text_color: '#9a3412', cta_background_color: '#ea580c', cta_text_color: '#ffffff' },
      lavender_soft: { label: 'Lavender soft', theme_mode: 'light', background_variant: 'soft-paper', accent_color: '#8b5cf6', text_color: '#1f2937', card_background_color: '#faf5ff', card_text_color: '#4c1d95', badge_background_color: '#ede9fe', badge_text_color: '#5b21b6', cta_background_color: '#7c3aed', cta_text_color: '#ffffff' },
      graphite_gold: { label: 'Graphite gold', theme_mode: 'dark', background_variant: 'graphite-grid', accent_color: '#f59e0b', text_color: '#f8fafc', card_background_color: '#111827', card_text_color: '#f8fafc', badge_background_color: '#fef3c7', badge_text_color: '#92400e', cta_background_color: '#d97706', cta_text_color: '#111827' },
      cyber_purple: { label: 'Cyber purple', theme_mode: 'dark', background_variant: 'dark-soft', accent_color: '#d946ef', text_color: '#fae8ff', card_background_color: '#2e1065', card_text_color: '#fae8ff', badge_background_color: '#f5d0fe', badge_text_color: '#86198f', cta_background_color: '#c026d3', cta_text_color: '#ffffff' },
      nordic_frost: { label: 'Nordic frost', theme_mode: 'light', background_variant: 'cool-gradient', accent_color: '#0369a1', text_color: '#0f172a', card_background_color: '#f0f9ff', card_text_color: '#0c4a6e', badge_background_color: '#e0f2fe', badge_text_color: '#075985', cta_background_color: '#0369a1', cta_text_color: '#ffffff' },
    };
    const brandingColorFields = ['accent_color', 'text_color', 'card_background_color', 'card_text_color', 'badge_background_color', 'badge_text_color', 'cta_background_color', 'cta_text_color'];

    function getSelectedPresetPalette() {
      if (!brandingForm) return presetPalettes.northern_blue;
      return presetPalettes[String(brandingForm.elements.theme_preset?.value || 'northern_blue')] || presetPalettes.northern_blue;
    }

    function applyPresetPalette() {
      if (!brandingForm) return;
      const preset = getSelectedPresetPalette();
      if (!brandingForm.elements.use_custom_palette.checked) {
        brandingColorFields.forEach((key) => {
          if (brandingForm.elements[key]) brandingForm.elements[key].value = preset[key];
        });
        if (brandingForm.elements.theme_mode && preset.theme_mode) {
          brandingForm.elements.theme_mode.value = preset.theme_mode;
        }
      }
    }

    function toggleBrandingFields() {
      if (!brandingForm) return;
      const useCustom = brandingForm.elements.use_custom_palette.checked;
      brandingForm.classList.toggle('is-custom-palette', useCustom);
      brandingForm.classList.toggle('is-preset-palette', !useCustom);
      brandingColorFields.forEach((key) => {
        const field = brandingForm.elements[key];
        if (!field) return;
        field.disabled = false;
        field.closest('.field')?.classList.toggle('preset-controlled-field', !useCustom);
        field.title = useCustom
          ? 'Ручной цвет. Изменение будет сохранено как своя палитра.'
          : 'Цвет берётся из выбранной готовой темы. Чтобы менять вручную, включите «Использовать свои цвета». ';
      });
    }

    function collectBrandingValues() {
      if (!brandingForm) return {};
      const values = {};
      ['theme_preset', 'theme_mode', 'background_variant', ...brandingColorFields].forEach((key) => {
        const field = brandingForm.elements[key];
        if (field) values[key] = String(field.value || '').trim();
      });
      values.use_custom_palette = Boolean(brandingForm.elements.use_custom_palette?.checked);
      return values;
    }

    function fillBranding(branding) {
      if (!brandingForm || !branding) return;
      Object.keys(branding).forEach((key) => {
        const field = brandingForm.elements[key];
        if (!field) return;
        if (field.type === 'checkbox') field.checked = Boolean(branding[key]);
        else field.value = branding[key] ?? field.value;
      });
      applyPresetPalette();
      toggleBrandingFields();
      updateBrandingPreview();
    }

    function updateBrandingPreview() {
      if (!brandingPreview || !brandingForm) return true;
      applyPresetPalette();
      toggleBrandingFields();
      const palette = collectBrandingValues();
      const useCustom = Boolean(palette.use_custom_palette);
      const selectedPreset = getSelectedPresetPalette();
      const cardBg = palette.card_background_color || selectedPreset.card_background_color || '#ffffff';
      const cardText = palette.card_text_color || selectedPreset.card_text_color || '#111827';
      const badgeBg = palette.badge_background_color || selectedPreset.badge_background_color || '#eef2ff';
      const badgeText = palette.badge_text_color || selectedPreset.badge_text_color || '#312e81';
      const ctaBg = palette.cta_background_color || selectedPreset.cta_background_color || '#111827';
      const ctaText = palette.cta_text_color || selectedPreset.cta_text_color || '#ffffff';
      brandingPreview.style.background = cardBg;
      brandingPreview.style.color = cardText;
      if (brandingPreviewBadge) { brandingPreviewBadge.style.background = badgeBg; brandingPreviewBadge.style.color = badgeText; }
      if (brandingPreviewCta) { brandingPreviewCta.style.background = ctaBg; brandingPreviewCta.style.color = ctaText; }
      const checks = [['Карточки', cardBg, cardText], ['Бейджи', badgeBg, badgeText], ['CTA', ctaBg, ctaText]];
      const reportItems = checks.map(([label, bg, fg]) => {
        const ratio = calcContrastRatio(bg, fg);
        return { label, ratio, safe: ratio >= 4.5 };
      });
      if (brandingContrastReport) {
        brandingContrastReport.innerHTML = reportItems.map((item) => `<span class="contrast-chip ${item.safe ? 'ok' : 'bad'}">${escapeHtml(item.label)}: ${item.ratio.toFixed(2)}</span>`).join('');
      }
      const safePalette = reportItems.every((item) => item.safe);
      const currentBranding = {
        ...selectedPreset,
        ...palette,
        use_custom_palette: useCustom,
        theme_preset: String(palette.theme_preset || brandingForm.elements.theme_preset?.value || 'northern_blue'),
        theme_mode: useCustom
          ? String(palette.theme_mode || selectedPreset.theme_mode || 'light')
          : String(selectedPreset.theme_mode || 'light'),
        background_variant: String(selectedPreset.background_variant || palette.background_variant || 'neutral-surface'),
      };
      applyVenueBrandingToPage(currentBranding);
      applyVenueBrandingToContainer(dashboard, currentBranding);
      brandingPreview.dataset.custom = useCustom ? 'true' : 'false';
      brandingPreview.title = reportItems.map((item) => `${item.label}: ${item.ratio.toFixed(2)}`).join(' · ');
      if (brandingSubmit) brandingSubmit.disabled = !safePalette;
      return safePalette;
    }

    try {
      const me = await apiRequest('/auth/me/', { token });
      storeSession(token, me);
      buildHeader(me);
      const availableModes = Array.isArray(me.available_modes) ? me.available_modes : [];
      const hasPlatformAccess = ['platform_admin', 'moderator'].includes(me.role);
      const hasOwnerAccess = hasPlatformAccess || me.role === 'owner' || availableModes.includes('owner');
      const hasManagerAccess = me.role === 'manager' || availableModes.includes('manager');
      const isManagerOnly = hasManagerAccess && !hasOwnerAccess;
      if (!(hasOwnerAccess || hasManagerAccess)) throw new Error('Редактирование заведения доступно только владельцу и менеджеру.');
      const venue = await apiRequest(`/venues/${encodeURIComponent(slug)}/`, { token });
      const branding = await apiRequest(`/venues/${encodeURIComponent(slug)}/branding/`, { token });
      title.textContent = `Редактирование: ${venue.name}`;
      subtitle.textContent = `${venue.city}, ${venue.address}. Здесь можно менять данные площадки, географию, тему страницы и схему залов.`;
      ['name', 'country', 'city', 'district', 'address', 'latitude', 'longitude', 'cuisine', 'price_category', 'venue_theme', 'short_description', 'description'].forEach((key) => { if (form.elements[key]) form.elements[key].value = venue[key] ?? ''; });
      fillSummary(venue);
      fillBookingRules(venue.booking_rule);
      fillBranding(branding);
      fillPricingHallOptions(venue);
      updatePricingFormMode();
      await loadVenueImagesForManage(slug, token);
      await loadVenuePriceRules(venue.id);
      if (hasOwnerAccess) await loadVenueManagers();
      if (isManagerOnly) {
        show(managerLink); hide(ownerLink); hide(moderationButton); if (managersAccordion) hide(managersAccordion); setBookingRulesEditable(false); setPricingEditable(false);
        if (brandingSubmit) brandingSubmit.disabled = true;
        qsa('input, select, textarea', brandingForm || dashboard).forEach((element) => { if (brandingForm && brandingForm.contains(element)) element.disabled = true; });
      } else {
        show(ownerLink); hide(managerLink); if (managersAccordion) show(managersAccordion); setBookingRulesEditable(true); setPricingEditable(true);
      }


      form.addEventListener('submit', async function (event) {
        event.preventDefault(); hide(message); hide(formError); submit.disabled = true;
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          const updated = await apiRequest(`/venues/${encodeURIComponent(slug)}/`, { method: 'PATCH', token, body: payload });
          title.textContent = `Редактирование: ${updated.name}`;
          subtitle.textContent = `${updated.city}, ${updated.address}. Здесь можно менять данные площадки, географию, тему страницы и схему залов.`;
          fillSummary(updated); setText(message, 'Изменения заведения сохранены.'); show(message);
        } catch (err) { setText(formError, err.message || 'Не удалось сохранить заведение.'); show(formError); }
        finally { submit.disabled = false; }
      });

      if (fillCoordinatesButton && !isManagerOnly) {
        fillCoordinatesButton.addEventListener('click', function () {
          if (!navigator.geolocation) { setText(formError, 'Браузер не поддерживает геолокацию.'); show(formError); return; }
          navigator.geolocation.getCurrentPosition((position) => {
            form.elements.latitude.value = position.coords.latitude.toFixed(6);
            form.elements.longitude.value = position.coords.longitude.toFixed(6);
            hide(formError);
            setText(message, 'Координаты подставлены из текущего местоположения браузера.');
            show(message);
          }, () => { setText(formError, 'Не удалось получить координаты. Разрешите доступ к геопозиции.'); show(formError); });
        });
      }

      if (brandingReset && !isManagerOnly) {
        brandingReset.addEventListener('click', function () {
          brandingForm.elements.use_custom_palette.checked = false;
          applyPresetPalette();
          updateBrandingPreview();
          hide(brandingError);
        });
      }

      if (brandingForm && !isManagerOnly) {
        const presetSelect = brandingForm.elements.theme_preset;
        const customCheckbox = brandingForm.elements.use_custom_palette;
        if (presetSelect) {
          presetSelect.addEventListener('change', function () {
            if (customCheckbox) customCheckbox.checked = false;
            applyPresetPalette();
            updateBrandingPreview();
          });
        }
        if (customCheckbox) {
          customCheckbox.addEventListener('change', function () {
            if (!customCheckbox.checked) applyPresetPalette();
            updateBrandingPreview();
          });
        }
        qsa('input[type="color"]', brandingForm).forEach((control) => {
          control.addEventListener('input', function () {
            if (customCheckbox) customCheckbox.checked = true;
            updateBrandingPreview();
          });
          control.addEventListener('change', function () {
            if (customCheckbox) customCheckbox.checked = true;
            updateBrandingPreview();
          });
        });
        const modeSelect = brandingForm.elements.theme_mode;
        if (modeSelect) {
          modeSelect.addEventListener('change', function () {
            if (customCheckbox) customCheckbox.checked = true;
            updateBrandingPreview();
          });
        }
        brandingForm.addEventListener('submit', async function (event) {
          event.preventDefault(); hide(brandingMessage); hide(brandingError); brandingSubmit.disabled = true;
          const selectedPreset = getSelectedPresetPalette();
          const payload = { ...selectedPreset, ...collectBrandingValues() };
          payload.use_custom_palette = Boolean(brandingForm.elements.use_custom_palette.checked);
          payload.theme_preset = String(brandingForm.elements.theme_preset?.value || payload.theme_preset || 'northern_blue');
          if (!payload.use_custom_palette) {
            Object.assign(payload, selectedPreset, {
              use_custom_palette: false,
              theme_preset: String(brandingForm.elements.theme_preset?.value || 'northern_blue'),
              theme_mode: selectedPreset.theme_mode || 'light',
              background_variant: selectedPreset.background_variant || 'neutral-surface',
            });
          }
          delete payload.label;
          if (!updateBrandingPreview()) { setText(brandingError, 'Палитра не прошла проверку контраста. Исправьте цвета карточек, бейджей или CTA.'); show(brandingError); brandingSubmit.disabled = false; return; }
          try {
            const updatedBranding = await apiRequest(`/venues/${encodeURIComponent(slug)}/branding/`, { method: 'PATCH', token, body: payload });
            fillBranding(updatedBranding);
            setText(brandingMessage, 'Палитра страницы сохранена. Контраст прошёл проверку.');
            show(brandingMessage);
          } catch (err) { setText(brandingError, err.message || 'Не удалось сохранить палитру.'); show(brandingError); }
          finally { brandingSubmit.disabled = false; }
        });
      }


      if (managersForm && hasOwnerAccess) {
        managersForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          hide(managersMessage); hide(managersError);
          if (managersSubmit) managersSubmit.disabled = true;
          const email = String(new FormData(managersForm).get('email') || '').trim();
          try {
            await apiRequest(`/venues/${encodeURIComponent(slug)}/managers/`, { method: 'POST', token, body: { email } });
            managersForm.reset();
            setText(managersMessage, 'Менеджер добавлен к заведению.'); show(managersMessage);
            await loadVenueManagers();
          } catch (err) {
            setText(managersError, err.message || 'Не удалось добавить менеджера.'); show(managersError);
          } finally {
            if (managersSubmit) managersSubmit.disabled = false;
          }
        });
      }

      if (pricingRuleType) {
        pricingRuleType.addEventListener('change', updatePricingFormMode);
      }

      if (pricingForm && hasOwnerAccess) {
        pricingForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          hide(pricingMessage); hide(pricingError);
          if (pricingSubmit) pricingSubmit.disabled = true;
          const formData = new FormData(pricingForm);
          const ruleType = String(formData.get('rule_type') || 'table_count');
          const payload = {
            venue: venue.id,
            rule_type: ruleType,
            title: String(formData.get('title') || '').trim(),
            table_count: ruleType === 'table_count' ? safeNumber(formData.get('table_count'), 1) : null,
            hall: ruleType === 'whole_hall' ? String(formData.get('hall') || '') : null,
            price_amount: String(formData.get('price_amount') || '0').trim() || '0',
            price_currency: String(formData.get('price_currency') || 'RUB').trim().toUpperCase(),
            description: String(formData.get('description') || '').trim(),
            is_active: Boolean(formData.get('is_active')),
          };
          try {
            await apiRequest('/booking-price-rules/', { method: 'POST', token, body: payload });
            pricingForm.reset();
            if (pricingForm.elements.is_active) pricingForm.elements.is_active.checked = true;
            updatePricingFormMode();
            setText(pricingMessage, 'Правило стоимости добавлено. Оно будет применяться на клиентской странице заведения.'); show(pricingMessage);
            await loadVenuePriceRules(venue.id);
          } catch (err) {
            setText(pricingError, err.message || 'Не удалось добавить правило стоимости.'); show(pricingError);
          } finally {
            if (pricingSubmit) pricingSubmit.disabled = false;
          }
        });
      }

      if (rulesForm && venue.booking_rule) {
        rulesForm.addEventListener('submit', async function (event) {
          event.preventDefault(); hide(rulesMessage); hide(rulesError); if (rulesSubmit) rulesSubmit.disabled = true;
          const formData = new FormData(rulesForm);
          const payload = {
            venue: venue.id,
            default_duration_minutes: safeNumber(formData.get('default_duration_minutes'), 60),
            slot_step_minutes: safeNumber(formData.get('slot_step_minutes'), 10),
            cleanup_buffer_minutes: safeNumber(formData.get('cleanup_buffer_minutes'), 20),
            payment_hold_minutes: safeNumber(formData.get('payment_hold_minutes'), 30),
            min_booking_notice_minutes: safeNumber(formData.get('min_booking_notice_minutes'), 60),
            free_cancellation_before_minutes: safeNumber(formData.get('free_cancellation_before_minutes'), 120),
            no_show_after_minutes: safeNumber(formData.get('no_show_after_minutes'), 30),
            requires_manager_confirmation: parseBooleanValue(formData.get('requires_manager_confirmation')),
            allow_client_approximate_time: parseBooleanValue(formData.get('allow_client_approximate_time')),
            allow_table_combination: parseBooleanValue(formData.get('allow_table_combination')),
            allow_shared_seating: parseBooleanValue(formData.get('allow_shared_seating')),
            allow_manager_reschedule: parseBooleanValue(formData.get('allow_manager_reschedule')),
            deposit_amount: String(formData.get('deposit_amount') || '0').trim() || '0',
            deposit_currency: String(formData.get('deposit_currency') || 'RUB').trim().toUpperCase(),
          };
          try {
            const updatedRule = await apiRequest(`/booking-rules/${venue.booking_rule.id}/`, { method: 'PATCH', token, body: payload });
            venue.booking_rule = updatedRule; fillBookingRules(updatedRule);
            setText(rulesMessage, 'Правила посещения сохранены. Изменения уже видны на клиентской странице заведения.'); show(rulesMessage);
          } catch (err) { setText(rulesError, err.message || 'Не удалось сохранить правила посещения.'); show(rulesError); }
          finally { if (rulesSubmit && !isManagerOnly) rulesSubmit.disabled = false; }
        });
      }

      moderationButton.addEventListener('click', async function () {
        hide(message); hide(formError); moderationButton.disabled = true;
        try {
          const result = await apiRequest(`/venues/${encodeURIComponent(slug)}/submit_for_moderation/`, { method: 'POST', token });
          setText(message, result.detail || 'Заведение отправлено на модерацию.'); show(message);
          const refreshed = await apiRequest(`/venues/${encodeURIComponent(slug)}/`, { token }); fillSummary(refreshed);
        } catch (err) { setText(formError, err.message || 'Не удалось отправить заведение на модерацию.'); show(formError); }
        finally { moderationButton.disabled = false; }
      });

      hide(warning); show(dashboard);
      const layoutAccordion = qs('#venue-layout-accordion');
      let layoutMounted = false;
      const ensureLayoutMounted = function () { if (layoutMounted) return; layoutMounted = true; mountLayoutEditorPage({ fixedVenueSlug: slug }); };
      if (layoutAccordion) { if (layoutAccordion.open) ensureLayoutMounted(); layoutAccordion.addEventListener('toggle', function () { if (layoutAccordion.open) ensureLayoutMounted(); }); } else { ensureLayoutMounted(); }
    } catch (err) {
      hide(warning); error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть редактирование заведения.')}</p><div class="button-row top-gap"><a class="button button-primary" href="/login/">Войти</a></div>`; show(error);
    }
  }



  async function mountNotificationsPage() {
    const dashboard = qs('#notifications-dashboard');
    if (!dashboard) return;
    const warning = qs('#notifications-auth-warning');
    const error = qs('#notifications-error');
    const summary = qs('#notifications-summary');
    const list = qs('#notifications-list');
    const empty = qs('#notifications-empty');
    const caption = qs('#notifications-caption');
    const readFilter = qs('#notifications-read-filter');
    const typeFilter = qs('#notifications-type-filter');
    const venueFilter = qs('#notifications-venue-filter');
    const readAllButton = qs('#notifications-read-all');
    const refreshButton = qs('#notifications-refresh');
    const deliveryList = qs('#notifications-delivery-list');
    const deliveryEmpty = qs('#notifications-delivery-empty');
    const prefEmail = qs('#pref-email-enabled');
    const prefSms = qs('#pref-sms-enabled');
    const prefBookingEmail = qs('#pref-booking-email-enabled');
    const prefBookingSms = qs('#pref-booking-sms-enabled');
    const prefMessage = qs('#notifications-preferences-message');
    const prefError = qs('#notifications-preferences-error');
    const savePreferencesButton = qs('#notifications-save-preferences');
    const testChannelsButton = qs('#notifications-test-channels');
    const token = getToken();

    if (!token) {
      hide(warning);
      error.innerHTML = '<p>Сначала войдите в систему, чтобы открыть центр уведомлений.</p>';
      show(error);
      return;
    }

    async function loadVenuesForFilter() {
      const me = await apiRequest('/auth/me/', { token });
      storeSession(token, me);
      buildHeader(me);
      const options = ['<option value="">Все заведения</option>'];
      const venues = [];
      if (Array.isArray(me.available_modes) && (me.available_modes.includes('owner') || me.available_modes.includes('manager'))) {
        try {
          const manageable = await apiRequest('/venues/manageable/', { token });
          venues.push(...manageable);
        } catch (err) {}
      }
      const seen = new Set();
      venues.forEach((venue) => {
        if (!venue || seen.has(venue.id)) return;
        seen.add(venue.id);
        options.push(`<option value="${venue.id}">${escapeHtml(venue.name)}</option>`);
      });
      venueFilter.innerHTML = options.join('');
    }

    async function loadNotifications() {
      const params = new URLSearchParams();
      if (readFilter && readFilter.value) params.set('is_read', readFilter.value);
      if (typeFilter && typeFilter.value) params.set('event_type', typeFilter.value);
      if (venueFilter && venueFilter.value) params.set('venue', venueFilter.value);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const [items, summaryData] = await Promise.all([
        apiRequest(`/notifications/${suffix}`, { token }),
        apiRequest(`/notifications/summary/${suffix}`, { token }),
      ]);
      const deliverySummary = summaryData.deliveries || {};
      summary.innerHTML = `
        <div><span>Непрочитанные</span><strong>${summaryData.unread_total || 0}</strong></div>
        <div><span>Сегодня</span><strong>${summaryData.today_total || 0}</strong></div>
        <div><span>Всего</span><strong>${summaryData.all_total || 0}</strong></div>
        <div><span>Email отправлено</span><strong>${deliverySummary.email_sent || 0}</strong></div>
        <div><span>SMS отправлено</span><strong>${deliverySummary.sms_sent || 0}</strong></div>
        <div><span>Ошибки каналов</span><strong>${(deliverySummary.email_failed || 0) + (deliverySummary.sms_failed || 0)}</strong></div>
      `;
      setText(caption, `Показано уведомлений: ${items.length}.`);
      if (!items.length) {
        list.innerHTML = '';
        show(empty);
      } else {
        hide(empty);
        list.innerHTML = items.map((item) => renderNotificationCard(item)).join('');
        qsa('[data-notification-read]', list).forEach((button) => {
          button.addEventListener('click', async function () {
            await apiRequest(`/notifications/${button.getAttribute('data-notification-read')}/mark_read/`, { method: 'POST', token, body: {} });
            await loadNotifications();
            await refreshNotificationBadge();
          });
        });
        qsa('[data-notification-open]', list).forEach((link) => {
          link.addEventListener('click', async function (event) {
            event.preventDefault();
            await apiRequest(`/notifications/${link.getAttribute('data-notification-open')}/mark_read/`, { method: 'POST', token, body: {} });
            await refreshNotificationBadge();
            window.location.href = link.getAttribute('data-target-url') || '/notifications/';
          });
        });
        bindNotificationCardOpenHandlers(list, token, async function () { await refreshNotificationBadge(); });
      }
      await refreshNotificationBadge();
    }

    async function loadPreferences() {
      const prefs = await apiRequest('/notifications/preferences/', { token });
      if (prefEmail) prefEmail.checked = !!prefs.email_enabled;
      if (prefSms) prefSms.checked = !!prefs.sms_enabled;
      if (prefBookingEmail) prefBookingEmail.checked = !!prefs.booking_email_enabled;
      if (prefBookingSms) prefBookingSms.checked = !!prefs.booking_sms_enabled;
    }

    async function savePreferences() {
      hide(prefMessage); hide(prefError);
      const payload = {
        email_enabled: !!(prefEmail && prefEmail.checked),
        sms_enabled: !!(prefSms && prefSms.checked),
        booking_email_enabled: !!(prefBookingEmail && prefBookingEmail.checked),
        booking_sms_enabled: !!(prefBookingSms && prefBookingSms.checked),
      };
      try {
        if (savePreferencesButton) savePreferencesButton.disabled = true;
        await apiRequest('/notifications/preferences/', { method: 'PATCH', token, body: payload });
        setText(prefMessage, 'Каналы уведомлений сохранены.'); show(prefMessage);
      } catch (err) {
        setText(prefError, err.message || 'Не удалось сохранить каналы уведомлений.'); show(prefError);
      } finally {
        if (savePreferencesButton) savePreferencesButton.disabled = false;
      }
    }

    async function loadDeliveries() {
      if (!deliveryList) return;
      const items = await apiRequest('/notifications/deliveries/', { token });
      if (!items.length) {
        deliveryList.innerHTML = '';
        if (deliveryEmpty) show(deliveryEmpty);
        return;
      }
      if (deliveryEmpty) hide(deliveryEmpty);
      deliveryList.innerHTML = items.map(renderDeliveryCard).join('');
    }

    async function sendTestChannels() {
      hide(prefMessage); hide(prefError);
      try {
        if (testChannelsButton) testChannelsButton.disabled = true;
        await apiRequest('/notifications/test-channels/', { method: 'POST', token, body: {} });
        setText(prefMessage, 'Тестовое уведомление создано. Проверьте MailHog, SMS-журнал и backend-логи.'); show(prefMessage);
        await loadNotifications();
        await loadDeliveries();
      } catch (err) {
        setText(prefError, err.message || 'Не удалось отправить тестовое уведомление.'); show(prefError);
      } finally {
        if (testChannelsButton) testChannelsButton.disabled = false;
      }
    }

    try {
      await loadVenuesForFilter();
      await loadPreferences();
      hide(warning);
      show(dashboard);
      await loadNotifications();
      await loadDeliveries();
      [readFilter, typeFilter, venueFilter].forEach((control) => {
        if (!control) return;
        control.addEventListener('change', loadNotifications);
      });
      if (refreshButton) refreshButton.addEventListener('click', async function () { await loadNotifications(); await loadDeliveries(); });
      if (savePreferencesButton) savePreferencesButton.addEventListener('click', savePreferences);
      if (testChannelsButton) testChannelsButton.addEventListener('click', sendTestChannels);
      if (readAllButton) readAllButton.addEventListener('click', async function () {
        await apiRequest('/notifications/mark_all_read/', { method: 'POST', token, body: {} });
        await loadNotifications();
      });
    } catch (err) {
      hide(warning);
      error.innerHTML = `<p>${escapeHtml(err.message || 'Не удалось открыть центр уведомлений.')}</p>`;
      show(error);
    }
  }

  function mountPartnerPage() {
    const form = qs('#partner-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(qs('#partner-message'));
      hide(qs('#partner-error'));
      const token = getToken();
      if (!token) {
        setText(qs('#partner-error'), 'Сначала войдите под владельцем, затем вернитесь к форме добавления заведения.');
        show(qs('#partner-error'));
        return;
      }
      const payload = Object.fromEntries(new FormData(form).entries());
      const submit = qs('#partner-submit');
      submit.disabled = true;
      try {
        const venue = await apiRequest('/venues/', { method: 'POST', token, body: payload });
        setText(qs('#partner-message'), `Черновик «${venue.name}» создан. Сейчас откроется кабинет владельца.`);
        show(qs('#partner-message'));
        window.setTimeout(function () { window.location.href = '/owner/'; }, 900);
      } catch (err) {
        setText(qs('#partner-error'), err.message || 'Ошибка создания заведения');
        show(qs('#partner-error'));
        submit.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initResponsiveHeader();
    await hydrateUser();
    const page = document.body.getAttribute('data-page');
    if (page !== 'venue-detail' && page !== 'venue-reviews') clearVenuePageTheme();
    if (page === 'home') mountHomePage();
    if (page === 'login') mountLoginPage();
    if (page === 'register') mountRegisterPage();
    if (page === 'account') mountAccountPage();
    if (page === 'venues') mountVenuesPage();
    if (page === 'venue-detail') mountVenueDetailPage();
    if (page === 'venue-reviews') mountVenueReviewsPage();
    if (page === 'notifications') mountNotificationsPage();
    if (page === 'owner') mountOwnerPage();
    if (page === 'manager') mountManagerPage();
    if (page === 'layout-editor') mountLayoutEditorPage();
    if (page === 'venue-manage') mountManageVenuePage();
    if (page === 'partner') mountPartnerPage();
    if (page === 'platform-admin') mountPlatformAdminPage();
    await mountNotificationWidgets();
    await refreshNotificationBadge();
  });
})();
