(function () {
  const TOKEN_KEY = 'webtavern-token';
  const apiBase = '/api/v1';

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function isManagerPage() { return window.location.pathname.startsWith('/manager'); }
  function isAccountPage() { return window.location.pathname.startsWith('/account'); }
  function isVenueDetailPage() { return /^\/venues\/[^/]+\/?$/.test(window.location.pathname || ''); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function setText(el, value) { if (el) el.textContent = value; }

  async function parseApiResponse(response) {
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { throw new Error(`API вернул не JSON (${response.status}). Проверьте логи backend.`); }
    }
    if (!response.ok) {
      const detail = data && (data.detail || data.non_field_errors || data.error);
      if (Array.isArray(detail)) throw new Error(detail.join(' '));
      if (detail) throw new Error(String(detail));
      throw new Error(`Ошибка запроса: ${response.status}`);
    }
    return data;
  }

  async function apiRequest(path, options) {
    const opts = options || {};
    const token = getToken();
    const response = await fetch(`${apiBase}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Token ${token}` } : {})
      },
      cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return parseApiResponse(response);
  }

  function statusText(card) {
    const pill = qs('.booking-status-pill', card) || qs('[class*="booking-status"]', card) || qs('.pill', card);
    return String(pill ? pill.textContent : '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function bookingIdFromCard(card) {
    const withId = qs('[data-id]', card) || qs('[data-booking-id]', card);
    return withId ? (withId.getAttribute('data-id') || withId.getAttribute('data-booking-id')) : '';
  }

  function setInlineMessage(card, text, isError) {
    let node = qs('.booking-polish-message', card);
    if (!node) {
      node = document.createElement('p');
      node.className = 'booking-polish-message top-gap';
      const row = qs('.button-row', card) || card;
      row.insertAdjacentElement('afterend', node);
    }
    node.classList.toggle('error-text', !!isError);
    node.classList.toggle('success-text', !isError);
    node.textContent = text;
  }

  function formatMoney(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${amount || 0} ${currency || 'RUB'}`;
    try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB' }).format(value); }
    catch { return `${value.toFixed(2)} ${currency || 'RUB'}`; }
  }

  async function confirmManagerBooking(bookingId, button) {
    button.disabled = true;
    try {
      await apiRequest(`/bookings/${bookingId}/confirm/`, { method: 'POST', body: {} });
      window.location.reload();
    } catch (error) {
      const card = button.closest('.booking-card') || button.closest('article') || document.body;
      setInlineMessage(card, error.message || 'Не удалось подтвердить бронь.', true);
      button.disabled = false;
    }
  }

  async function completeDemoPayment(bookingId, button) {
    button.disabled = true;
    try {
      const payment = await apiRequest('/payments/initialize/', { method: 'POST', body: { booking_id: Number(bookingId) } });
      const isDemo = payment.is_demo || payment.checkout_mode === 'stub' || (payment.raw_payload && payment.raw_payload.mode === 'stub');
      if (isDemo) {
        const approved = window.confirm(`Учебная оплата брони #${bookingId} на сумму ${formatMoney(payment.amount, payment.currency)}. Реального списания не будет. Продолжить?`);
        if (!approved) {
          await apiRequest(`/payments/${payment.id}/simulate-cancel/`, { method: 'POST', body: {} });
          window.location.reload();
          return;
        }
        await apiRequest(`/payments/${payment.id}/simulate-success/`, { method: 'POST', body: {} });
        window.location.reload();
        return;
      }
      if (payment.confirmation_url) {
        window.location.href = payment.confirmation_url;
        return;
      }
      throw new Error('Платёж создан, но ссылка на оплату не получена.');
    } catch (error) {
      const card = button.closest('.booking-card') || button.closest('article') || document.body;
      setInlineMessage(card, error.message || 'Не удалось запустить оплату.', true);
      button.disabled = false;
    }
  }

  function addManagerHoldConfirmButtons(root) {
    if (!isManagerPage()) return;
    qsa('.booking-card', root).forEach((card) => {
      const text = statusText(card);
      if (!text.includes('зарезервировано')) return;
      if (qs('.manager-booking-confirm-hold', card)) return;
      const bookingId = bookingIdFromCard(card);
      const row = qs('.button-row', card);
      if (!bookingId || !row) return;
      const button = document.createElement('button');
      button.className = 'button button-primary manager-booking-confirm-hold';
      button.type = 'button';
      button.textContent = 'Подтвердить';
      button.addEventListener('click', () => confirmManagerBooking(bookingId, button));
      row.insertAdjacentElement('afterbegin', button);
    });
  }

  function addCustomerPayButtons(root) {
    if (!isAccountPage()) return;
    const accountRoot = qs('#account-active-bookings', root) || root;
    qsa('.booking-card', accountRoot).forEach((card) => {
      const text = statusText(card);
      const bookingId = bookingIdFromCard(card);
      const row = qs('.button-row', card);
      if (!bookingId || !row) return;

      if (text.includes('ожидает оплаты') && !qs('.account-booking-pay, .account-booking-pay-polish', card)) {
        const button = document.createElement('button');
        button.className = 'button button-primary account-booking-pay-polish';
        button.type = 'button';
        button.textContent = 'Оплатить бронь';
        button.addEventListener('click', () => completeDemoPayment(bookingId, button));
        const openLink = qs('a.button', row);
        if (openLink) openLink.insertAdjacentElement('afterend', button);
        else row.insertAdjacentElement('afterbegin', button);
      }
    });
  }

  function localDateTimeToIso(value) {
    const date = new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  }

  function selectedTableIdsFromForm() {
    const raw = String(qs('#client-booking-table')?.value || '').trim();
    return raw.split(',').map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  }

  async function handleStableVenueBookingSubmit(event) {
    if (!isVenueDetailPage()) return;
    const form = event.target && event.target.closest ? event.target.closest('#client-booking-form') : null;
    if (!form) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const token = getToken();
    const message = qs('#client-booking-message');
    const error = qs('#client-booking-error');
    const paymentActions = qs('#client-payment-actions');
    const submit = qs('#client-booking-submit');
    hide(message); hide(error); hide(paymentActions);

    if (!token) {
      setText(error, 'Сначала войдите в аккаунт клиента, затем повторите попытку.');
      show(error);
      return;
    }

    const slug = document.body.getAttribute('data-venue-slug');
    const hallId = Number(qs('#client-hall-select')?.value || 0);
    const bookingType = String(qs('#client-booking-type')?.value || 'tables');
    const startIso = localDateTimeToIso(qs('#client-booking-start')?.value);
    const endIso = localDateTimeToIso(qs('#client-booking-end')?.value);
    const tableIds = selectedTableIdsFromForm();
    const guests = Math.max(Number(qs('#client-booking-guests')?.value || 1), 1);
    const comment = String(qs('#client-booking-comment')?.value || '').trim();

    if (!slug || !hallId || !startIso || !endIso) {
      setText(error, 'Проверьте зал, дату и время бронирования.');
      show(error);
      return;
    }
    if (bookingType !== 'hall' && !tableIds.length) {
      setText(error, 'Выберите хотя бы один свободный стол.');
      show(error);
      return;
    }

    if (submit) submit.disabled = true;
    try {
      const venue = await apiRequest(`/venues/${encodeURIComponent(slug)}/?booking_start=${encodeURIComponent(startIso)}&booking_end=${encodeURIComponent(endIso)}`);
      const hall = (Array.isArray(venue.halls) ? venue.halls : []).find((item) => Number(item.id) === hallId);
      const hallTables = Array.isArray(hall && hall.tables) ? hall.tables.filter((table) => table.is_active !== false) : [];
      const selectedTables = bookingType === 'hall'
        ? hallTables
        : hallTables.filter((table) => tableIds.includes(Number(table.id)));
      const freeTables = selectedTables.filter((table) => !(table.occupancy && (table.occupancy.state === 'occupied' || table.occupancy.state === 'held_by_you')));

      if (!selectedTables.length || freeTables.length !== selectedTables.length) {
        throw new Error('Один или несколько выбранных столов уже недоступны. Обновите интервал и выберите столы заново.');
      }

      const hold = await apiRequest('/bookings/hold/', {
        method: 'POST',
        body: {
          venue: venue.id,
          hall: hallId,
          table: selectedTables[0].id,
          tables: selectedTables.map((table) => table.id),
          booking_type: bookingType,
          guests_count: guests,
          booking_start: startIso,
          booking_end: endIso,
          customer_comment: comment,
        },
      });

      setText(message, `Бронь #${hold.id} создана. Выбранные столы зарезервированы на слот. Менеджер подтвердит бронь, после этого оплата появится в профиле клиента.`);
      show(message);
      if (qs('#client-booking-comment')) qs('#client-booking-comment').value = '';
      if (qs('#client-booking-table')) qs('#client-booking-table').value = '';
      window.setTimeout(() => window.location.href = `/account/?booking=${encodeURIComponent(hold.id)}#booking-${encodeURIComponent(hold.id)}`, 1200);
    } catch (err) {
      setText(error, err.message || 'Не удалось создать бронь. Проверьте доступность столов и повторите попытку.');
      show(error);
      if (submit) submit.disabled = false;
    }
  }

  function bindStableVenueBookingSubmit(root) {
    if (!isVenueDetailPage()) return;
    const form = qs('#client-booking-form', root || document);
    if (!form || form.dataset.stableBookingSubmitBound === 'true') return;
    form.dataset.stableBookingSubmitBound = 'true';
    form.addEventListener('submit', handleStableVenueBookingSubmit, true);
  }

  function patchBookingActions() {
    addManagerHoldConfirmButtons(document);
    addCustomerPayButtons(document);
    bindStableVenueBookingSubmit(document);
  }

  function schedulePatch() {
    window.requestAnimationFrame(patchBookingActions);
    window.setTimeout(patchBookingActions, 250);
    window.setTimeout(patchBookingActions, 900);
  }

  document.addEventListener('DOMContentLoaded', schedulePatch);
  window.addEventListener('load', schedulePatch);

  const observer = new MutationObserver(() => schedulePatch());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();