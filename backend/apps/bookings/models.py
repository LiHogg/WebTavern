from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.halls.models import Hall
from apps.tables.models import Table
from apps.venues.models import Venue

class Booking(TimeStampedModel):
    class BookingType(models.TextChoices):
        TABLES = "tables", "Столы"
        HALL = "hall", "Зал целиком"

    class Status(models.TextChoices):
        HOLD = "hold", "Зарезервировано"
        PENDING_CONFIRMATION = "pending_confirmation", "Ожидает подтверждения"
        WAITING_FOR_PAYMENT = "waiting_for_payment", "Ожидает оплаты"
        PAID = "paid", "Оплачено"
        CONFIRMED = "confirmed", "Подтверждено"
        CANCELLED = "cancelled", "Отменено"
        COMPLETED = "completed", "Завершено"
        NO_SHOW = "no_show", "Неявка"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bookings",
        verbose_name="Клиент",
    )
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="bookings", verbose_name="Заведение")
    hall = models.ForeignKey(Hall, on_delete=models.CASCADE, related_name="bookings", verbose_name="Зал")
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name="bookings", verbose_name="Основной стол")
    tables = models.ManyToManyField(Table, related_name="multi_bookings", blank=True, verbose_name="Столы брони")
    booking_type = models.CharField(max_length=24, choices=BookingType.choices, default=BookingType.TABLES, verbose_name="Тип брони")
    price_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Стоимость брони")
    price_currency = models.CharField(max_length=8, default="RUB", verbose_name="Валюта стоимости")
    pricing_note = models.CharField(max_length=255, blank=True, verbose_name="Применённое правило стоимости")
    guests_count = models.PositiveIntegerField(default=1, verbose_name="Количество гостей")
    booking_start = models.DateTimeField(verbose_name="Начало брони")
    booking_end = models.DateTimeField(verbose_name="Конец брони")
    hold_expires_at = models.DateTimeField(null=True, blank=True, verbose_name="Бронь истекает")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING_CONFIRMATION, verbose_name="Статус")
    cancelled_without_penalty = models.BooleanField(default=True, verbose_name="Отменена без штрафа")
    cancellation_penalty_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Сумма штрафа при отмене")
    cancellation_penalty_currency = models.CharField(max_length=8, default="RUB", verbose_name="Валюта штрафа")
    no_show_marked_at = models.DateTimeField(null=True, blank=True, verbose_name="Когда отмечена неявка")
    customer_comment = models.TextField(blank=True, verbose_name="Комментарий клиента")
    manager_comment = models.TextField(blank=True, verbose_name="Комментарий менеджера")

    class Meta:
        verbose_name = "Бронь"
        verbose_name_plural = "Брони"
        ordering = ["-booking_start"]

    def __str__(self) -> str:
        return f"Booking #{self.pk} — {self.venue.name}"


class BookingStatusHistory(TimeStampedModel):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="status_history", verbose_name="Бронь")
    old_status = models.CharField(max_length=32, blank=True, verbose_name="Старый статус")
    new_status = models.CharField(max_length=32, verbose_name="Новый статус")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="booking_status_changes",
        null=True,
        blank=True,
        verbose_name="Кем изменено",
    )
    reason = models.CharField(max_length=255, blank=True, verbose_name="Причина")

    class Meta:
        verbose_name = "История статуса брони"
        verbose_name_plural = "История статусов брони"
