from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

class LegalEntity(TimeStampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="legal_entities",
        verbose_name="Владелец",
    )
    company_name = models.CharField(max_length=255, verbose_name="Название организации")
    tax_number = models.CharField(max_length=32, blank=True, verbose_name="ИНН")
    registration_number = models.CharField(max_length=64, blank=True, verbose_name="ОГРН/рег. номер")
    legal_address = models.CharField(max_length=255, blank=True, verbose_name="Юридический адрес")
    is_active = models.BooleanField(default=True, verbose_name="Активна")

    class Meta:
        verbose_name = "Юридическое лицо"
        verbose_name_plural = "Юридические лица"

    def __str__(self) -> str:
        return self.company_name
