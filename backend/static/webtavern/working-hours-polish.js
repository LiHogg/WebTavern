(function () {
  const TOKEN_KEY = 'webtavern-token';
  const apiBase = '/api/v1';
  const dayLabels = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function setText(el, value) { if (el) el.textContent = value; }

  async function apiRequest(path, options = {}) {
    const headers = { 'Accept': 'application/json' };
    const token = options.token || getToken();
    if (token) headers.Authorization = `Token ${token}`;
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { detail: text }; }
    }
    if (!response.ok) {
      const detail = payload && (payload.detail || payload.booking_start || payload.non_field_errors || payload.message || JSON.stringify(payload));
      throw new Error(Array.isArray(detail) ? detail.join(' ') : String(detail || `HTTP ${response.status}`));
    }
    return payload;
  }

  function normalizeSchedule(value) {
    const source = value && typeof value === 'object' ? value : {};
    const result = {};
    for (let day = 0; day < 7; day += 1) {
      const item = source[String(day)] || source[day] || {};
      result[String(day)] = {
        is_closed: Boolean(item.is_closed || item.closed),
        opens_at: normalizeTime(item.opens_at || '00:00'),
        closes_at: normalizeTime(item.closes_at || '23:59'),
      };
    }
    return result;
  }

  function normalizeTime(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{1,2})/);
    if (!match) return '00:00';
    const h = Math.min(Math.max(parseInt(match[1], 10) || 0, 0), 23);
    const m = Math.min(Math.max(parseInt(match[2], 10) || 0, 0), 59);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function timeToParts(value) {
    const [h, m] = normalizeTime(value).split(':').map((part) => parseInt(part, 10) || 0);
    return { h, m };
  }

  function pythonWeekday(date) {
    return (date.getDay() + 6) % 7;
  }

  function candidateForDay(baseDate, rule) {
    if (!rule || rule.is_closed) return null;
    const open = timeToParts(rule.opens_at);
    const close = timeToParts(rule.closes_at);
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), open.h, open.m, 0, 0);
    let end = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), close.h, close.m, 0, 0);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  function intervalError(scheduleInput, startValue, endValue) {
    const schedule = normalizeSchedule(scheduleInput);
    if (!startValue || !endValue) return '';
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!start.getTime() || !end.getTime() || end <= start) return 'Укажите корректный интервал бронирования.';
    const currentMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const candidates = [];
    [-1, 0].forEach((offset) => {
      const base = new Date(currentMidnight.getTime() + offset * 24 * 60 * 60 * 1000);
      const rule = schedule[String(pythonWeekday(base))];
      const candidate = candidateForDay(base, rule);
      if (candidate) candidates.push(candidate);
    });
    if (candidates.some((item) => item.start <= start && end <= item.end)) return '';
    const rule = schedule[String(pythonWeekday(start))];
    const label = dayLabels[pythonWeekday(start)] || 'выбранный день';
    if (rule && rule.is_closed) return `Заведение закрыто в выбранный день: ${label}.`;
    return `Выбранный интервал выходит за график работы: ${label}, ${rule?.opens_at || '00:00'}–${rule?.closes_at || '23:59'}.`;
  }

  function renderScheduleSummary(scheduleInput) {
    const schedule = normalizeSchedule(scheduleInput);
    return `<div class="working-hours-summary">${dayLabels.map((label, index) => {
      const item = schedule[String(index)];
      const text = item.is_closed ? 'закрыто' : `${item.opens_at}–${item.closes_at}`;
      return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
    }).join('')}</div>`;
  }

  function buildScheduleForm(scheduleInput) {
    const schedule = normalizeSchedule(scheduleInput);
    return dayLabels.map((label, day) => {
      const item = schedule[String(day)];
      return `
        <div class="working-hours-row" data-working-hours-row="${day}">
          <label class="working-hours-day"><input type="checkbox" name="is_open_${day}" ${item.is_closed ? '' : 'checked'}> <span>${escapeHtml(label)}</span></label>
          <label class="field compact-field"><span>Открытие</span><input type="time" name="opens_at_${day}" value="${escapeHtml(item.opens_at)}"></label>
          <label class="field compact-field"><span>Закрытие</span><input type="time" name="closes_at_${day}" value="${escapeHtml(item.closes_at)}"></label>
          <span class="muted-small">Если закрытие меньше открытия, график считается ночным и переходит на следующий день.</span>
        </div>`;
    }).join('');
  }

  function collectSchedule(form) {
    const schedule = {};
    for (let day = 0; day < 7; day += 1) {
      schedule[String(day)] = {
        is_closed: !form.elements[`is_open_${day}`]?.checked,
        opens_at: normalizeTime(form.elements[`opens_at_${day}`]?.value || '00:00'),
        closes_at: normalizeTime(form.elements[`closes_at_${day}`]?.value || '23:59'),
      };
    }
    return schedule;
  }

  async function mountManageWorkingHours() {
    const page = document.body.getAttribute('data-page');
    if (page !== 'venue-manage') return;
    const slug = document.body.getAttribute('data-manage-venue-slug') || document.body.getAttribute('data-venue-slug');
    const rulesForm = qs('#venue-booking-rules-form');
    if (!slug || !rulesForm || qs('#venue-working-hours-card')) return;

    const card = document.createElement('section');
    card.className = 'subcard working-hours-card';
    card.id = 'venue-working-hours-card';
    card.innerHTML = `
      <div class="section-topline"><span class="section-kicker">График</span><h3>Время работы заведения</h3></div>
      <p class="muted-block">Настройте интервалы, когда клиент может создавать бронь. Ночные заведения поддерживаются: например 18:00–03:00.</p>
      <form class="form top-gap" id="venue-working-hours-form">
        <div class="working-hours-form-grid" id="venue-working-hours-fields"></div>
        <div class="button-row top-gap"><button class="button button-primary" type="submit" id="venue-working-hours-submit">Сохранить график работы</button></div>
      </form>
      <p class="success-text hidden" id="venue-working-hours-message"></p>
      <p class="error-text hidden" id="venue-working-hours-error"></p>
    `;
    rulesForm.insertAdjacentElement('afterend', card);

    const fields = qs('#venue-working-hours-fields', card);
    const form = qs('#venue-working-hours-form', card);
    const message = qs('#venue-working-hours-message', card);
    const error = qs('#venue-working-hours-error', card);
    const submit = qs('#venue-working-hours-submit', card);
    let schedule = normalizeSchedule({});

    function render() {
      fields.innerHTML = buildScheduleForm(schedule);
      qsa('[data-working-hours-row]', fields).forEach((row) => {
        const checkbox = qs('input[type="checkbox"]', row);
        const controls = qsa('input[type="time"]', row);
        function sync() { controls.forEach((item) => { item.disabled = !checkbox.checked; }); }
        checkbox.addEventListener('change', sync);
        sync();
      });
    }

    try {
      const payload = await apiRequest(`/venues/${encodeURIComponent(slug)}/working-hours/`);
      schedule = normalizeSchedule(payload.working_hours);
      render();
    } catch (err) {
      render();
      setText(error, err.message || 'Не удалось загрузить график работы.');
      show(error);
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      hide(message); hide(error);
      submit.disabled = true;
      try {
        schedule = collectSchedule(form);
        const payload = await apiRequest(`/venues/${encodeURIComponent(slug)}/working-hours/`, {
          method: 'PATCH',
          body: { working_hours: schedule },
        });
        schedule = normalizeSchedule(payload.working_hours);
        render();
        setText(message, 'График работы сохранён. Клиенты больше не смогут бронировать вне этих интервалов.');
        show(message);
      } catch (err) {
        setText(error, err.message || 'Не удалось сохранить график работы.');
        show(error);
      } finally {
        submit.disabled = false;
      }
    });
  }

  async function mountVenueDetailWorkingHours() {
    const page = document.body.getAttribute('data-page');
    if (page !== 'venue-detail') return;
    const slug = document.body.getAttribute('data-venue-slug');
    if (!slug) return;
    let schedule;
    try {
      const payload = await apiRequest(`/venues/${encodeURIComponent(slug)}/working-hours/`);
      schedule = normalizeSchedule(payload.working_hours);
    } catch (err) {
      return;
    }

    function bindWhenReady(attempt = 0) {
      const form = qs('#client-booking-form');
      const startInput = qs('#client-booking-start');
      const endInput = qs('#client-booking-end');
      if (!form || !startInput || !endInput) {
        if (attempt < 40) window.setTimeout(() => bindWhenReady(attempt + 1), 150);
        return;
      }
      if (!qs('#client-working-hours-summary')) {
        const summary = document.createElement('article');
        summary.className = 'subcard working-hours-client-summary';
        summary.id = 'client-working-hours-summary';
        summary.innerHTML = `
          <div class="section-topline"><span class="section-kicker">График</span><h3>Время работы</h3></div>
          ${renderScheduleSummary(schedule)}
        `;
        form.insertAdjacentElement('beforebegin', summary);
      }
      function validateCurrentInterval() {
        const errorNode = qs('#client-availability-error') || qs('#client-booking-error');
        const message = intervalError(schedule, startInput.value, endInput.value);
        if (message && errorNode) {
          setText(errorNode, message);
          show(errorNode);
        }
        return message;
      }
      startInput.addEventListener('change', validateCurrentInterval);
      endInput.addEventListener('change', validateCurrentInterval);
      form.addEventListener('submit', function (event) {
        const message = validateCurrentInterval();
        if (message) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
    bindWhenReady();
  }

  function mount() {
    mountManageWorkingHours();
    mountVenueDetailWorkingHours();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
