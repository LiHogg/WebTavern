from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.payments.models import Payment

class Refund(TimeStampedModel):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Запрошен"
        SUCCEEDED = "succeeded", "Выполнен"
        FAILED = "failed", "Ошибка"

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="refunds", verbose_name="Платёж")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="requested_refunds",
        null=True,
        blank=True,
        verbose_name="Запросил",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Сумма")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.REQUESTED, verbose_name="Статус")
    provider_refund_id = models.CharField(max_length=128, blank=True, verbose_name="ID возврата провайдера")
    reason = models.CharField(max_length=255, blank=True, verbose_name="Причина")

    class Meta:
        verbose_name = "Возврат"
        verbose_name_plural = "Возвраты"

    def __str__(self) -> str:
        return f"Refund for payment #{self.payment_id}"
