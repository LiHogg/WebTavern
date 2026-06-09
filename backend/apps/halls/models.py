from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.venues.models import Venue

class Hall(TimeStampedModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="halls", verbose_name="Заведение")
    name = models.CharField(max_length=255, verbose_name="Название зала")
    description = models.TextField(blank=True, verbose_name="Описание")
    capacity = models.PositiveIntegerField(default=0, verbose_name="Вместимость")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Порядок")

    class Meta:
        verbose_name = "Зал"
        verbose_name_plural = "Залы"
        ordering = ["sort_order", "name"]


    def recalculate_capacity(self, *, save: bool = True) -> int:
        total_seats = self.tables.filter(is_active=True).aggregate(total=Sum("seats_count")).get("total") or 0
        self.capacity = total_seats
        if save and self.pk:
            type(self).objects.filter(pk=self.pk).update(capacity=total_seats, updated_at=timezone.now())
        return total_seats

    def __str__(self) -> str:
        return f"{self.venue.name} — {self.name}"
