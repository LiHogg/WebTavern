from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from .models import BookingPriceRule


def calculate_booking_price(*, venue, hall, tables: Iterable, booking_type: str = 'tables') -> dict:
    """Return applied price rule for a booking.

    Pricing is optional. If no active rule matches, amount is zero and booking can
    follow the ordinary confirmation flow without mandatory payment.
    """
    selected_tables = list(tables or [])
    currency = 'RUB'
    rule = None

    if booking_type == 'hall' and hall is not None:
        rule = (
            BookingPriceRule.objects
            .filter(
                venue=venue,
                rule_type=BookingPriceRule.RuleType.WHOLE_HALL,
                hall=hall,
                is_active=True,
                price_amount__gt=0,
            )
            .order_by('-updated_at', '-id')
            .first()
        )
        if rule:
            return {
                'amount': Decimal(rule.price_amount),
                'currency': rule.price_currency or currency,
                'note': rule.title or f'Бронь зала «{hall.name}»',
                'rule_id': rule.id,
            }

    table_count = len(selected_tables)
    if table_count > 0:
        rule = (
            BookingPriceRule.objects
            .filter(
                venue=venue,
                rule_type=BookingPriceRule.RuleType.TABLE_COUNT,
                table_count=table_count,
                is_active=True,
                price_amount__gt=0,
            )
            .filter(hall__isnull=True)
            .order_by('-updated_at', '-id')
            .first()
        )
        if rule:
            return {
                'amount': Decimal(rule.price_amount),
                'currency': rule.price_currency or currency,
                'note': rule.title or f'Бронь {table_count} стол(ов)',
                'rule_id': rule.id,
            }

    return {'amount': Decimal('0'), 'currency': currency, 'note': '', 'rule_id': None}
