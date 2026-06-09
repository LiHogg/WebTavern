from django.db import models

from apps.common.models import TimeStampedModel
from apps.halls.models import Hall

class Table(TimeStampedModel):
    hall = models.ForeignKey(Hall, on_delete=models.CASCADE, related_name="tables", verbose_name="Зал")
    name = models.CharField(max_length=64, verbose_name="Стол")
    seats_count = models.PositiveIntegerField(default=2, verbose_name="Количество мест")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    is_combinable = models.BooleanField(default=False, verbose_name="Можно объединять")
    note = models.CharField(max_length=255, blank=True, verbose_name="Комментарий")

    class Meta:
        verbose_name = "Стол"
        verbose_name_plural = "Столы"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.hall} / {self.name}"
