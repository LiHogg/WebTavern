(function () {
  const TOKEN_KEY = 'webtavern-token';
  const apiBase = '/api/v1';

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function isManagerPage() { return window.location.pathname.startsWith('/manager'); }
  function isAccountPage() { return window.location.pathname.startsWith('/account'); }

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

  async function confirmCustomerHold(bookingId, button) {
    button.disabled = true;
    try {
      await apiRequest(`/bookings/${bookingId}/confirm-hold/`, { method: 'POST', body: {} });
      window.location.reload();
    } catch (error) {
      const card = button.closest('.booking-card') || button.closest('article') || document.body;
      setInlineMessage(card, error.message || 'Не удалось подтвердить резерв.', true);
      button.disabled = false;
    }
  }

  function formatMoney(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${amount || 0} ${currency || 'RUB'}`;
    try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB' }).format(value); }
    catch { return `${value.toFixed(2)} ${currency || 'RUB'}`; }
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

  function addCustomerHoldAndPayButtons(root) {
    if (!isAccountPage()) return;
    const accountRoot = qs('#account-active-bookings', root) || root;
    qsa('.booking-card', accountRoot).forEach((card) => {
      const text = statusText(card);
      const bookingId = bookingIdFromCard(card);
      const row = qs('.button-row', card);
      if (!bookingId || !row) return;

      if (text.includes('зарезервировано') && !qs('.account-booking-confirm-hold', card)) {
        const button = document.createElement('button');
        button.className = 'button button-primary account-booking-confirm-hold';
        button.type = 'button';
        button.textContent = 'Подтвердить резерв';
        button.addEventListener('click', () => confirmCustomerHold(bookingId, button));
        row.insertAdjacentElement('afterbegin', button);
      }

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

  function patchBookingActions() {
    addManagerHoldConfirmButtons(document);
    addCustomerHoldAndPayButtons(document);
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
