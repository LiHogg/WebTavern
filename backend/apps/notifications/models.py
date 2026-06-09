from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Notification(TimeStampedModel):
    class Channel(models.TextChoices):
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"
        BROWSER = "browser", "Browser"
        IN_APP = "in_app", "In-app"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name="Получатель",
    )
    venue = models.ForeignKey('venues.Venue', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications', verbose_name='Заведение')
    channel = models.CharField(max_length=32, choices=Channel.choices, verbose_name="Канал")
    title = models.CharField(max_length=255, verbose_name="Заголовок")
    message = models.TextField(verbose_name="Сообщение")
    event_type = models.CharField(max_length=64, blank=True, verbose_name='Тип события')
    target_url = models.CharField(max_length=255, blank=True, verbose_name='Ссылка перехода')
    is_read = models.BooleanField(default=False, verbose_name="Прочитано")

    class Meta:
        verbose_name = "Уведомление"
        verbose_name_plural = "Уведомления"
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f"{self.channel}: {self.title}"


class NotificationPreference(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preference',
        verbose_name='Пользователь',
    )
    email_enabled = models.BooleanField(default=True, verbose_name='Email-уведомления')
    sms_enabled = models.BooleanField(default=True, verbose_name='SMS-уведомления')
    booking_email_enabled = models.BooleanField(default=True, verbose_name='Email по бронированиям')
    booking_sms_enabled = models.BooleanField(default=True, verbose_name='SMS по бронированиям')
    marketing_enabled = models.BooleanField(default=False, verbose_name='Маркетинговые сообщения')

    class Meta:
        verbose_name = 'Настройки уведомлений'
        verbose_name_plural = 'Настройки уведомлений'

    def __str__(self) -> str:
        return f'Настройки уведомлений: {self.user}'


class NotificationDelivery(TimeStampedModel):
    class Channel(models.TextChoices):
        EMAIL = 'email', 'Email'
        SMS = 'sms', 'SMS'

    class Status(models.TextChoices):
        SENT = 'sent', 'Отправлено'
        FAILED = 'failed', 'Ошибка'
        SKIPPED = 'skipped', 'Пропущено'

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name='deliveries',
        verbose_name='Уведомление',
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_deliveries',
        verbose_name='Получатель',
    )
    channel = models.CharField(max_length=16, choices=Channel.choices, verbose_name='Канал')
    status = models.CharField(max_length=16, choices=Status.choices, verbose_name='Статус')
    provider = models.CharField(max_length=64, blank=True, verbose_name='Провайдер')
    destination = models.CharField(max_length=255, blank=True, verbose_name='Адрес/телефон')
    provider_message_id = models.CharField(max_length=255, blank=True, verbose_name='ID сообщения у провайдера')
    error = models.TextField(blank=True, verbose_name='Ошибка')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Отправлено в')

    class Meta:
        verbose_name = 'Доставка уведомления'
        verbose_name_plural = 'Доставки уведомлений'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.channel} {self.status}: {self.destination}'


class BrowserPushSubscription(TimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="browser_subscriptions")
    endpoint = models.URLField(verbose_name="Endpoint")
    p256dh = models.TextField(verbose_name="Key p256dh")
    auth = models.TextField(verbose_name="Auth key")

    class Meta:
        verbose_name = "Подписка browser push"
        verbose_name_plural = "Подписки browser push"
