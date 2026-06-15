from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from django.utils import timezone

DAY_LABELS = {
    0: 'Понедельник',
    1: 'Вторник',
    2: 'Среда',
    3: 'Четверг',
    4: 'Пятница',
    5: 'Суббота',
    6: 'Воскресенье',
}


def default_working_hours() -> dict[str, dict[str, Any]]:
    """Default schedule keeps old behaviour: bookings are allowed almost all day."""
    return {
        str(day): {
            'is_closed': False,
            'opens_at': '00:00',
            'closes_at': '23:59',
        }
        for day in range(7)
    }


def _parse_time(value: Any, fallback: str) -> time:
    raw = str(value or fallback).strip()[:5]
    try:
        hour, minute = raw.split(':', 1)
        return time(hour=max(0, min(int(hour), 23)), minute=max(0, min(int(minute), 59)))
    except Exception:
        hour, minute = fallback.split(':', 1)
        return time(hour=int(hour), minute=int(minute))


def _format_time(value: time) -> str:
    return f'{value.hour:02d}:{value.minute:02d}'


def normalize_working_hours(value: Any) -> dict[str, dict[str, Any]]:
    source = value if isinstance(value, dict) else {}
    normalized: dict[str, dict[str, Any]] = {}
    for day in range(7):
        item = source.get(str(day)) or source.get(day) or {}
        if not isinstance(item, dict):
            item = {}
        is_closed = bool(item.get('is_closed') or item.get('closed'))
        opens_at = _parse_time(item.get('opens_at'), '00:00')
        closes_at = _parse_time(item.get('closes_at'), '23:59')
        normalized[str(day)] = {
            'is_closed': is_closed,
            'opens_at': _format_time(opens_at),
            'closes_at': _format_time(closes_at),
        }
    return normalized


def _candidate_interval_for_day(day_start: datetime, rule: dict[str, Any]) -> tuple[datetime, datetime] | None:
    if not rule or rule.get('is_closed'):
        return None
    opens_at = _parse_time(rule.get('opens_at'), '00:00')
    closes_at = _parse_time(rule.get('closes_at'), '23:59')
    start_dt = timezone.make_aware(datetime.combine(day_start.date(), opens_at), timezone.get_current_timezone())
    end_dt = timezone.make_aware(datetime.combine(day_start.date(), closes_at), timezone.get_current_timezone())
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return timezone.localtime(start_dt), timezone.localtime(end_dt)


def get_working_interval_candidates(working_hours: Any, reference_dt: datetime) -> list[tuple[datetime, datetime]]:
    schedule = normalize_working_hours(working_hours)
    local_reference = timezone.localtime(reference_dt)
    current_day_start = local_reference.replace(hour=0, minute=0, second=0, microsecond=0)
    candidates: list[tuple[datetime, datetime]] = []
    for offset in (-1, 0):
        day_start = current_day_start + timedelta(days=offset)
        weekday = day_start.weekday()
        interval = _candidate_interval_for_day(day_start, schedule.get(str(weekday), {}))
        if interval:
            candidates.append(interval)
    return candidates


def booking_interval_working_hours_error(venue, booking_start: datetime, booking_end: datetime) -> str:
    if not venue or not booking_start or not booking_end:
        return ''
    if booking_end <= booking_start:
        return ''
    rule = getattr(venue, 'booking_rule', None)
    working_hours = getattr(rule, 'working_hours', None) if rule else None
    schedule = normalize_working_hours(working_hours)
    start = timezone.localtime(booking_start)
    end = timezone.localtime(booking_end)
    for candidate_start, candidate_end in get_working_interval_candidates(schedule, start):
        if candidate_start <= start and end <= candidate_end:
            return ''
    weekday_label = DAY_LABELS.get(start.weekday(), 'выбранный день')
    day_rule = schedule.get(str(start.weekday()), {})
    if day_rule.get('is_closed'):
        return f'Заведение закрыто в выбранный день ({weekday_label}). Выберите другое время.'
    opens_at = day_rule.get('opens_at', '00:00')
    closes_at = day_rule.get('closes_at', '23:59')
    return f'Выбранный интервал выходит за график работы заведения: {weekday_label}, {opens_at}–{closes_at}. Измените время бронирования.'


def summarize_working_hours(working_hours: Any) -> list[dict[str, Any]]:
    schedule = normalize_working_hours(working_hours)
    result = []
    for day in range(7):
        item = schedule[str(day)]
        result.append({
            'day': day,
            'label': DAY_LABELS[day],
            **item,
        })
    return result
