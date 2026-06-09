from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.conf import settings

from apps.booking_rules.models import VenueBookingRule
from apps.bookings.models import Booking
from apps.bookings.utils import booking_required_payment_amount, payment_deadline_for_booking

from .models import Payment


def get_booking_deposit_amount(booking: Booking) -> Decimal:
    amount = booking_required_payment_amount(booking)
    return Decimal(amount or 0)


def create_or_initialize_payment(booking: Booking) -> Payment:
    amount = get_booking_deposit_amount(booking)
    payment, _ = Payment.objects.get_or_create(
        booking=booking,
        defaults={
            "amount": amount,
            "currency": booking.price_currency or "RUB",
            "provider": Payment.Provider.YOOKASSA,
            "status": Payment.Status.CREATED,
            "idempotence_key": str(uuid4()),
            "raw_payload": {},
        },
    )

    if payment.status == Payment.Status.SUCCEEDED:
        return payment

    if payment.raw_payload.get("confirmation_url"):
        return payment

    deadline = payment_deadline_for_booking(booking)

    if settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY:
        try:
            from yookassa import Configuration
            from yookassa import Payment as YooKassaPayment

            Configuration.account_id = settings.YOOKASSA_SHOP_ID
            Configuration.secret_key = settings.YOOKASSA_SECRET_KEY

            remote_payment = YooKassaPayment.create(
                {
                    "amount": {
                        "value": str(payment.amount),
                        "currency": payment.currency,
                    },
                    "capture": True,
                    "confirmation": {
                        "type": "redirect",
                        "return_url": settings.YOOKASSA_RETURN_URL,
                    },
                    "description": f"Предоплата по брони #{booking.id}",
                    "metadata": {
                        "booking_id": str(booking.id),
                        "venue_id": str(booking.venue_id),
                    },
                },
                payment.idempotence_key or str(uuid4()),
            )
            payment.provider_payment_id = getattr(remote_payment, "id", "")
            payment.status = Payment.Status.PENDING
            payment.raw_payload = {
                "confirmation_url": getattr(getattr(remote_payment, "confirmation", None), "confirmation_url", ""),
                "provider_object": getattr(remote_payment, "__dict__", {}),
                "mode": "redirect",
                "expires_at": deadline.isoformat() if deadline else "",
            }
        except Exception as exc:  # pragma: no cover - runtime integration safety
            payment.status = Payment.Status.PENDING
            payment.raw_payload = {
                "confirmation_url": f"{settings.YOOKASSA_RETURN_URL}?booking_id={booking.id}&mode=stub",
                "error": str(exc),
                "mode": "stub",
                "expires_at": deadline.isoformat() if deadline else "",
            }
    else:
        payment.status = Payment.Status.PENDING
        payment.raw_payload = {
            "confirmation_url": f"{settings.YOOKASSA_RETURN_URL}?booking_id={booking.id}&mode=stub",
            "mode": "stub",
            "expires_at": deadline.isoformat() if deadline else "",
        }

    payment.save()
    return payment
