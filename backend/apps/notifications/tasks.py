from celery import shared_task

from .models import Notification
from .services import deliver_external_copies


@shared_task
def send_notification_task(notification_id: int, *, email: bool = False, sms: bool = False) -> None:
    try:
        notification = Notification.objects.select_related('recipient', 'venue').get(pk=notification_id)
    except Notification.DoesNotExist:
        return None
    deliver_external_copies(notification, send_email_copy=email, send_sms_copy=sms)
    return None
