from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class ManagerActionLog(TimeStampedModel):
    class Action(models.TextChoices):
        CONFIRM = 'confirm', 'Подтверждение'
        CANCEL = 'cancel', 'Отмена'
        RESCHEDULE = 'reschedule', 'Перенос'
        NO_SHOW = 'no_show', 'Неявка'

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manager_action_logs',
        verbose_name='Кто выполнил',
    )
    venue = models.ForeignKey('venues.Venue', on_delete=models.CASCADE, related_name='manager_action_logs', verbose_name='Заведение')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, related_name='action_logs', verbose_name='Бронь')
    action = models.CharField(max_length=32, choices=Action.choices, verbose_name='Действие')
    details = models.TextField(blank=True, verbose_name='Подробности')

    class Meta:
        verbose_name = 'Лог действий менеджера'
        verbose_name_plural = 'Логи действий менеджера'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.get_action_display()} #{self.booking_id}'
