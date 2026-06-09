from django.db import models

from apps.bookings.models import Booking
from apps.common.models import TimeStampedModel

class Payment(TimeStampedModel):
    class Provider(models.TextChoices):
        YOOKASSA = "yookassa", "ЮKassa"

    class Status(models.TextChoices):
        CREATED = "created", "Создан"
        PENDING = "pending", "Ожидает"
        SUCCEEDED = "succeeded", "Успешно"
        FAILED = "failed", "Ошибка"
        CANCELLED = "cancelled", "Отменён"

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="payment", verbose_name="Бронь")
    provider = models.CharField(max_length=32, choices=Provider.choices, default=Provider.YOOKASSA, verbose_name="Провайдер")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.CREATED, verbose_name="Статус")
    amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Сумма")
    currency = models.CharField(max_length=8, default="RUB", verbose_name="Валюта")
    provider_payment_id = models.CharField(max_length=128, blank=True, verbose_name="ID платежа провайдера")
    idempotence_key = models.CharField(max_length=128, blank=True, verbose_name="Idempotence key")
    raw_payload = models.JSONField(default=dict, blank=True, verbose_name="Payload")

    class Meta:
        verbose_name = "Платёж"
        verbose_name_plural = "Платежи"

    def __str__(self) -> str:
        return f"Payment for booking #{self.booking_id}"
