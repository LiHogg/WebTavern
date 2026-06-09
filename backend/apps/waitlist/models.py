from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.venues.models import Venue

class WaitlistEntry(TimeStampedModel):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="waitlist_entries",
        verbose_name="Клиент",
    )
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="waitlist_entries", verbose_name="Заведение")
    desired_date = models.DateField(verbose_name="Желаемая дата")
    desired_time = models.TimeField(verbose_name="Желаемое время")
    guests_count = models.PositiveIntegerField(default=1, verbose_name="Количество гостей")
    is_active = models.BooleanField(default=True, verbose_name="Активна")

    class Meta:
        verbose_name = "Запись листа ожидания"
        verbose_name_plural = "Лист ожидания"

    def __str__(self) -> str:
        return f"Waitlist: {self.venue.name} / {self.customer.email}"
