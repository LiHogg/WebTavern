(function () {
  const TOKEN_KEY = 'webtavern-token';
  const apiBase = '/api/v1';
  const dayLabels = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function getToken() { return window.localStorage.getItem(TOKEN_KEY); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function setText(el, value) { if (el) el.textContent = value; }

  function normalizeTime(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{1,2})/);
    if (!match) return '00:00';
    const h = Math.min(Math.max(parseInt(match[1], 10) || 0, 0), 23);
    const m = Math.min(Math.max(parseInt(match[2], 10) || 0, 0), 59);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function normalizeSchedule(value) {
    const source = value && typeof value === 'object' ? value : {};
    const result = {};
    for (let day = 0; day < 7; day += 1) {
      const item = source[String(day)] || source[day] || {};
      result[String(day)] = {
        is_closed: Boolean(item.is_closed || item.closed),
        opens_at: normalizeTime(item.opens_at || '00:00'),
        closes_at: normalizeTime(item.closes_at || '00:00'),
      };
    }
    return result;
  }

  function timeParts(value) {
    const [h, m] = normalizeTime(value).split(':').map((part) => parseInt(part, 10) || 0);
    return { h, m };
  }

  function pythonWeekday(date) {
    return (date.getDay() + 6) % 7;
  }

  function candidateForDay(baseDate, rule) {
    if (!rule || rule.is_closed) return null;
    const open = timeParts(rule.opens_at);
    const close = timeParts(rule.closes_at);
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
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return 'Укажите корректный интервал бронирования.';
    }
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
    return `Выбранный интервал выходит за график работы: ${label}, ${rule?.opens_at || '00:00'}–${rule?.closes_at || '00:00'}.`;
  }

  async function loadSchedule(slug) {
    const headers = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Token ${token}`;
    const response = await fetch(`${apiBase}/venues/${encodeURIComponent(slug)}/working-hours/`, {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeSchedule(payload.working_hours);
  }

  const state = {
    slug: '',
    schedule: null,
    requested: false,
  };

  function currentVenueSlug() {
    return String(document.body.getAttribute('data-venue-slug') || '').trim();
  }

  function ensureScheduleLoaded() {
    const slug = currentVenueSlug();
    if (!slug || state.requested) return;
    state.slug = slug;
    state.requested = true;
    loadSchedule(slug).then((schedule) => {
      state.schedule = schedule;
    }).catch(() => {
      state.schedule = null;
    });
  }

  function showBookingError(message) {
    const errorNode = qs('#client-booking-error') || qs('#client-availability-error');
    if (!errorNode) return;
    setText(errorNode, message);
    show(errorNode);
  }

  document.addEventListener('submit', function (event) {
    const form = event.target && event.target.closest ? event.target.closest('#client-booking-form') : null;
    if (!form || !document.body.matches('[data-page="venue-detail"]')) return;
    ensureScheduleLoaded();
    if (!state.schedule) return;
    const startInput = qs('#client-booking-start', form) || qs('#client-booking-start');
    const endInput = qs('#client-booking-end', form) || qs('#client-booking-end');
    const message = intervalError(state.schedule, startInput?.value, endInput?.value);
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showBookingError(message);
  }, true);

  function mount() {
    if (!document.body.matches('[data-page="venue-detail"]')) return;
    ensureScheduleLoaded();
    const startInput = qs('#client-booking-start');
    const endInput = qs('#client-booking-end');
    function validateSoftly() {
      if (!state.schedule) return;
      const message = intervalError(state.schedule, startInput?.value, endInput?.value);
      if (message) showBookingError(message);
    }
    if (startInput) startInput.addEventListener('change', validateSoftly);
    if (endInput) endInput.addEventListener('change', validateSoftly);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
