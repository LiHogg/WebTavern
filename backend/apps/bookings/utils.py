from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import Booking, BookingStatusHistory

CONFLICT_STATUSES = {
    Booking.Status.HOLD,
    Booking.Status.PENDING_CONFIRMATION,
    Booking.Status.WAITING_FOR_PAYMENT,
    Booking.Status.PAID,
    Booking.Status.CONFIRMED,
}


def get_hold_minutes(rule) -> int:
    raw = int(getattr(rule, 'payment_hold_minutes', 5) or 5)
    return max(2, min(raw, 5))


def expire_outdated_holds(*, table_id: int | None = None, customer_id: int | None = None) -> int:
    now = timezone.now()
    qs = Booking.objects.filter(status=Booking.Status.HOLD, hold_expires_at__isnull=False, hold_expires_at__lte=now)
    if table_id is not None:
        qs = qs.filter(Q(table_id=table_id) | Q(tables__id=table_id)).distinct()
    if customer_id is not None:
        qs = qs.filter(customer_id=customer_id)
    return qs.update(status=Booking.Status.CANCELLED, manager_comment='Резерв истёк автоматически после окончания выбранного слота', updated_at=now)



def payment_deadline_for_booking(booking: Booking):
    if booking.status != Booking.Status.WAITING_FOR_PAYMENT:
        return None
    rule = getattr(booking.venue, 'booking_rule', None)
    raw_minutes = int(getattr(rule, 'payment_hold_minutes', 30) or 30)
    hold_minutes = max(1, raw_minutes)
    return booking.updated_at + timedelta(minutes=hold_minutes)


def expire_overdue_payment_bookings(*, now=None) -> int:
    """Cancel bookings that waited for prepayment longer than venue rules allow."""
    now = now or timezone.now()
    expired_count = 0
    qs = Booking.objects.select_related('venue', 'venue__booking_rule').filter(status=Booking.Status.WAITING_FOR_PAYMENT)
    for booking in qs:
        deadline = payment_deadline_for_booking(booking)
        if not deadline or deadline > now:
            continue
        old_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.cancelled_without_penalty = True
        booking.cancellation_penalty_amount = 0
        booking.manager_comment = 'Время на предоплату истекло, бронь автоматически отменена'
        booking.save(update_fields=['status', 'cancelled_without_penalty', 'cancellation_penalty_amount', 'manager_comment', 'updated_at'])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=None,
            reason='Время на предоплату истекло, бронь автоматически отменена',
        )
        try:
            payment = booking.payment
        except Exception:
            payment = None
        if payment and payment.status in {'created', 'pending'}:
            payload = dict(payment.raw_payload or {})
            payload['last_status'] = 'cancelled'
            payload['reason'] = 'payment_time_expired'
            payment.status = 'cancelled'
            payment.raw_payload = payload
            payment.save(update_fields=['status', 'raw_payload', 'updated_at'])
        try:
            from apps.notifications.services import broadcast_booking_update
            broadcast_booking_update(
                booking,
                event_type='payment_expired',
                message=f'Время на предоплату брони #{booking.id} истекло. Слот освобождён.',
            )
        except Exception:
            pass
        expired_count += 1
    return expired_count

def active_conflict_queryset():
    expire_overdue_payment_bookings()
    now = timezone.now()
    return Booking.objects.filter(status__in=CONFLICT_STATUSES).exclude(
        Q(status=Booking.Status.HOLD) & Q(hold_expires_at__isnull=False) & Q(hold_expires_at__lte=now)
    )


def normalize_table_ids(table_ids) -> list[int]:
    ids = []
    for raw_id in table_ids or []:
        try:
            value = int(raw_id)
        except (TypeError, ValueError):
            continue
        if value > 0 and value not in ids:
            ids.append(value)
    return ids


def has_any_booking_overlap(*, table_ids, booking_start, booking_end, exclude_booking_id: int | None = None) -> bool:
    ids = normalize_table_ids(table_ids)
    if not ids:
        return False
    qs = active_conflict_queryset().filter(
        booking_start__lt=booking_end,
        booking_end__gt=booking_start,
    ).filter(
        Q(table_id__in=ids) | Q(tables__id__in=ids)
    ).distinct()
    if exclude_booking_id is not None:
        qs = qs.exclude(pk=exclude_booking_id)
    return qs.exists()


def has_booking_overlap(*, table_id: int, booking_start, booking_end, exclude_booking_id: int | None = None) -> bool:
    return has_any_booking_overlap(
        table_ids=[table_id],
        booking_start=booking_start,
        booking_end=booking_end,
        exclude_booking_id=exclude_booking_id,
    )


def is_hold_active(booking: Booking) -> bool:
    if booking.status != Booking.Status.HOLD:
        return False
    if booking.hold_expires_at and booking.hold_expires_at <= timezone.now():
        return False
    return True


def booking_required_payment_amount(booking: Booking):
    if getattr(booking, 'price_amount', 0) and booking.price_amount > 0:
        return booking.price_amount
    rule = getattr(booking.venue, 'booking_rule', None)
    if rule and rule.deposit_amount and rule.deposit_amount > 0:
        return rule.deposit_amount
    return 0


def final_status_for_new_booking(rule, booking: Booking | None = None) -> tuple[str, str]:
    if rule.requires_manager_confirmation:
        return Booking.Status.PENDING_CONFIRMATION, 'Бронь подтверждена после резерва и ожидает решения менеджера'
    if booking is not None and booking_required_payment_amount(booking) > 0:
        return Booking.Status.WAITING_FOR_PAYMENT, 'Бронь подтверждена после резерва и ожидает оплаты'
    if rule.deposit_amount and rule.deposit_amount > 0:
        return Booking.Status.WAITING_FOR_PAYMENT, 'Бронь подтверждена после резерва и ожидает оплаты'
    return Booking.Status.CONFIRMED, 'Бронь подтверждена после резерва и активирована автоматически'
