from django.db import models

from apps.common.models import TimeStampedModel
from apps.venues.models import Venue

class VenueBookingRule(TimeStampedModel):
    venue = models.OneToOneField(Venue, on_delete=models.CASCADE, related_name="booking_rule", verbose_name="Заведение")
    default_duration_minutes = models.PositiveIntegerField(default=60, verbose_name="Длительность по умолчанию")
    slot_step_minutes = models.PositiveIntegerField(default=10, verbose_name="Шаг слота")
    cleanup_buffer_minutes = models.PositiveIntegerField(default=20, verbose_name="Буфер на уборку")
    payment_hold_minutes = models.PositiveIntegerField(default=30, verbose_name="Удержание неоплаченной брони")
    min_booking_notice_minutes = models.PositiveIntegerField(default=60, verbose_name="Минимальное время до начала брони")
    free_cancellation_before_minutes = models.PositiveIntegerField(default=120, verbose_name="Бесплатная отмена до начала брони")
    no_show_after_minutes = models.PositiveIntegerField(default=30, verbose_name="Через сколько минут считать гостя неявившимся")
    requires_manager_confirmation = models.BooleanField(default=True, verbose_name="Требует подтверждения")
    allow_client_approximate_time = models.BooleanField(default=False, verbose_name="Разрешить клиенту примерное время")
    allow_table_combination = models.BooleanField(default=False, verbose_name="Разрешить объединение столов")
    allow_shared_seating = models.BooleanField(default=False, verbose_name="Разрешить подсадку к занятым столам")
    allow_manager_reschedule = models.BooleanField(default=True, verbose_name="Разрешить менеджеру переносить бронь")
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Сумма предоплаты")
    deposit_currency = models.CharField(max_length=8, default="RUB", verbose_name="Валюта")

    class Meta:
        verbose_name = "Правило бронирования"
        verbose_name_plural = "Правила бронирования"

    def __str__(self) -> str:
        return f"Booking rules for {self.venue.name}"

class BookingPriceRule(TimeStampedModel):
    class RuleType(models.TextChoices):
        TABLE_COUNT = "table_count", "По количеству столов"
        WHOLE_HALL = "whole_hall", "Бронь всего зала"

    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="price_rules", verbose_name="Заведение")
    hall = models.ForeignKey(
        "halls.Hall",
        on_delete=models.CASCADE,
        related_name="price_rules",
        null=True,
        blank=True,
        verbose_name="Зал",
    )
    rule_type = models.CharField(max_length=32, choices=RuleType.choices, default=RuleType.TABLE_COUNT, verbose_name="Тип правила")
    title = models.CharField(max_length=255, blank=True, verbose_name="Название акции")
    table_count = models.PositiveIntegerField(null=True, blank=True, verbose_name="Количество столов")
    price_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Стоимость брони")
    price_currency = models.CharField(max_length=8, default="RUB", verbose_name="Валюта")
    description = models.TextField(blank=True, verbose_name="Описание")
    is_active = models.BooleanField(default=True, verbose_name="Активно")

    class Meta:
        verbose_name = "Правило стоимости бронирования"
        verbose_name_plural = "Правила стоимости бронирования"
        ordering = ["rule_type", "hall__name", "table_count", "price_amount"]

    def __str__(self) -> str:
        base = self.title or self.get_rule_type_display()
        return f"{self.venue.name} — {base}: {self.price_amount} {self.price_currency}"

