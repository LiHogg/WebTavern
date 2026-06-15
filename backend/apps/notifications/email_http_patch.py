import logging

from django.conf import settings

from .email_api import send_via_http_api
from .models import NotificationDelivery

logger = logging.getLogger(__name__)

HTTP_EMAIL_PROVIDERS = {'http', 'api', 'webhook'}


def install_http_email_delivery():
    """Switch notification email copies to HTTP API mode when EMAIL_PROVIDER=http.

    The original SMTP delivery remains available for local/demo setups. This is
    intentionally installed as a small patch so the notification service can keep
    its existing booking/SMS behavior unchanged.
    """
    from . import services

    if getattr(services, '_original_send_email_notification', None):
        return

    services._original_send_email_notification = services.send_email_notification

    def send_email_notification(notification):
        provider_mode = str(getattr(settings, 'EMAIL_PROVIDER', 'smtp') or 'smtp').strip().lower()
        if provider_mode not in HTTP_EMAIL_PROVIDERS:
            return services._original_send_email_notification(notification)

        original_destination = getattr(notification.recipient, 'email', '') or ''
        destination, source_destination, override_used = services._resolve_email_destination(original_destination)
        provider_name = provider_mode

        if not getattr(settings, 'ENABLE_EMAIL_NOTIFICATIONS', True):
            return services._delivery_status(
                NotificationDelivery.Channel.EMAIL,
                NotificationDelivery.Status.SKIPPED,
                notification,
                provider=provider_name,
                destination=destination or source_destination,
                error='Email-уведомления отключены в настройках проекта.',
            )
        if not destination:
            return services._delivery_status(
                NotificationDelivery.Channel.EMAIL,
                NotificationDelivery.Status.SKIPPED,
                notification,
                provider=provider_name,
                destination='',
                error='У пользователя не указан email и EMAIL_RECIPIENT_OVERRIDE пустой.',
            )

        try:
            subject_prefix = getattr(settings, 'EMAIL_SUBJECT_PREFIX', '[WebTavern]')
            subject = f'{subject_prefix} {notification.title}'.strip()
            body = services._email_body(notification, original_destination=source_destination, override_used=override_used)
            ok, provider_message_id, error = send_via_http_api(to_email=destination, subject=subject, text=body)
            status = NotificationDelivery.Status.SENT if ok else NotificationDelivery.Status.FAILED
            provider = f'{provider_name}:override' if override_used else provider_name
            return services._delivery_status(
                NotificationDelivery.Channel.EMAIL,
                status,
                notification,
                provider=provider,
                destination=destination,
                provider_message_id=provider_message_id,
                error=error,
            )
        except Exception as exc:
            logger.exception('HTTP email notification failed for notification %s', getattr(notification, 'id', None))
            provider = f'{provider_name}:override' if override_used else provider_name
            return services._delivery_status(
                NotificationDelivery.Channel.EMAIL,
                NotificationDelivery.Status.FAILED,
                notification,
                provider=provider,
                destination=destination,
                error=str(exc),
            )

    services.send_email_notification = send_email_notification
