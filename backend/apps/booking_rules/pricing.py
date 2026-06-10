from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from .models import BookingPriceRule


def _decimal(value) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _active_table_count_rules(venue):
    rules = (
        BookingPriceRule.objects
        .filter(
            venue=venue,
            rule_type=BookingPriceRule.RuleType.TABLE_COUNT,
            is_active=True,
            price_amount__gt=0,
            table_count__isnull=False,
        )
        .filter(hall__isnull=True)
        .order_by("table_count", "-updated_at", "-id")
    )
    by_count = {}
    for rule in rules:
        count = int(rule.table_count or 0)
        if count > 0 and count not in by_count:
            by_count[count] = rule
    return by_count


def _calculate_table_count_price(*, venue, table_count: int, currency: str) -> dict | None:
    """Calculate table pricing as a cumulative package.

    A table-count rule is treated as a package price for the first N selected
    tables. If the client selects more tables than the largest package rule, the
    price grows by the one-table price for every additional table. Exact package
    rules are accepted only when they do not make the total cheaper than a
    smaller already calculated package. This prevents invalid data like
    1 table = 600, 2 tables = 1100, 3 tables = 700 from reducing the total.
    """
    table_count = max(int(table_count or 0), 0)
    if table_count <= 0:
        return None

    rules_by_count = _active_table_count_rules(venue)
    if not rules_by_count:
        return None

    one_table_rule = rules_by_count.get(1)
    if one_table_rule:
        unit_amount = _decimal(one_table_rule.price_amount)
        unit_currency = one_table_rule.price_currency or currency
    else:
        booking_rule = getattr(venue, "booking_rule", None)
        unit_amount = _decimal(getattr(booking_rule, "deposit_amount", 0))
        unit_currency = getattr(booking_rule, "deposit_currency", currency) or currency

    calculated = {0: Decimal("0")}
    applied_rule = None
    applied_note = ""
    applied_currency = unit_currency or currency

    for count in range(1, table_count + 1):
        previous_amount = calculated.get(count - 1, Decimal("0"))
        additive_amount = previous_amount + unit_amount if unit_amount > 0 else None
        exact_rule = rules_by_count.get(count)
        exact_amount = _decimal(exact_rule.price_amount) if exact_rule else None

        if exact_rule and (count == 1 or exact_amount >= previous_amount):
            amount = exact_amount
            applied_rule = exact_rule
            applied_note = exact_rule.title or f"Бронь {count} стол(ов)"
            applied_currency = exact_rule.price_currency or applied_currency or currency
        elif additive_amount is not None:
            amount = additive_amount
            if exact_rule and exact_amount < previous_amount:
                applied_note = f"Накопительная стоимость {count} стол(ов): акция меньшего набора + доплата за стол"
            else:
                applied_note = f"Накопительная стоимость {count} стол(ов)"
        elif exact_rule and exact_amount >= previous_amount:
            amount = exact_amount
            applied_rule = exact_rule
            applied_note = exact_rule.title or f"Бронь {count} стол(ов)"
            applied_currency = exact_rule.price_currency or applied_currency or currency
        else:
            amount = previous_amount
            if exact_rule:
                applied_note = f"Накопительная стоимость {count} стол(ов): правило с меньшей суммой пропущено"

        calculated[count] = amount

    if calculated[table_count] <= 0:
        return None

    if not applied_note:
        applied_note = f"Накопительная стоимость {table_count} стол(ов)"

    return {
        "amount": calculated[table_count],
        "currency": applied_currency or currency,
        "note": applied_note,
        "rule_id": applied_rule.id if applied_rule else None,
    }


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
    table_price = _calculate_table_count_price(venue=venue, table_count=table_count, currency=currency)
    if table_price:
        return table_price

    return {'amount': Decimal('0'), 'currency': currency, 'note': '', 'rule_id': None}
