import json
import logging
import os
from urllib import parse, request as urlrequest

from asgiref.sync import async_to_sync
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification, NotificationDelivery, NotificationPreference

logger = logging.getLogger(__name__)

try:
    from channels.layers import get_channel_layer
except Exception:
    get_channel_layer = None


BOOKING_EVENT_PREFIXES = ('booking_', 'payment_')


def get_notification_preference(user) -> NotificationPreference:
    preference, _ = NotificationPreference.objects.get_or_create(user=user)
    return preference


def _is_booking_event(event_type: str) -> bool:
    return str(event_type or '').startswith(BOOKING_EVENT_PREFIXES)


def _delivery_status(channel: str, status: str, notification: Notification, *, provider: str = '', destination: str = '', provider_message_id: str = '', error: str = '') -> NotificationDelivery:
    return NotificationDelivery.objects.create(
        notification=notification,
        recipient=notification.recipient,
        channel=channel,
        status=status,
        provider=provider,
        destination=destination,
        provider_message_id=provider_message_id,
        error=error,
        sent_at=timezone.now() if status == NotificationDelivery.Status.SENT else None,
    )


def _get_email_provider_name() -> str:
    backend = str(getattr(settings, 'EMAIL_BACKEND', 'email') or 'email')
    parts = backend.split('.')[-2:]
    return '.'.join(parts) if parts else 'email'


def _resolve_email_destination(original_email: str | None) -> tuple[str, str, bool]:
    """
    Returns: actual destination, original destination, whether override was used.

    EMAIL_RECIPIENT_OVERRIDE lets the project send every real SMTP email to one
    verified mailbox during local/demo testing. Business logic still stores and
    displays the original user email, but the outgoing message is redirected.
    """
    original_destination = (original_email or '').strip()
    override_destination = str(getattr(settings, 'EMAIL_RECIPIENT_OVERRIDE', '') or '').strip()

    if override_destination:
        return override_destination, original_destination, True

    return original_destination, original_destination, False


def _email_body(notification: Notification, *, original_destination: str = '', override_used: bool = False) -> str:
    lines = [notification.message]
    if notification.venue:
        lines.append(f'Заведение: {notification.venue.name}')
    if notification.target_url:
        site_url = getattr(settings, 'PUBLIC_SITE_URL', 'http://localhost:8080').rstrip('/')
        lines.append(f'Открыть в WebTavern: {site_url}{notification.target_url}')
    if override_used and getattr(settings, 'EMAIL_ADD_OVERRIDE_NOTE', True):
        lines.append('')
        lines.append('Тестовый режим email: письмо переадресовано на контрольную почту.')
        if original_destination:
            lines.append(f'Исходный получатель: {original_destination}')
    lines.append('')
    lines.append('Это автоматическое уведомление WebTavern.')
    return '\n'.join(lines)


def send_email_notification(notification: Notification) -> NotificationDelivery:
    original_destination = getattr(notification.recipient, 'email', '') or ''
    destination, source_destination, override_used = _resolve_email_destination(original_destination)
    provider_name = _get_email_provider_name()

    if not getattr(settings, 'ENABLE_EMAIL_NOTIFICATIONS', True):
        return _delivery_status(NotificationDelivery.Channel.EMAIL, NotificationDelivery.Status.SKIPPED, notification, provider=provider_name, destination=destination or source_destination, error='Email-уведомления отключены в настройках проекта.')
    if not destination:
        return _delivery_status(NotificationDelivery.Channel.EMAIL, NotificationDelivery.Status.SKIPPED, notification, provider=provider_name, destination='', error='У пользователя не указан email и EMAIL_RECIPIENT_OVERRIDE пустой.')

    try:
        subject_prefix = getattr(settings, 'EMAIL_SUBJECT_PREFIX', '[WebTavern]')
        subject = f'{subject_prefix} {notification.title}'.strip()
        send_mail(
            subject,
            _email_body(notification, original_destination=source_destination, override_used=override_used),
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@webtavern.local'),
            [destination],
            fail_silently=False,
        )
        provider = f'{provider_name}:override' if override_used else provider_name
        return _delivery_status(NotificationDelivery.Channel.EMAIL, NotificationDelivery.Status.SENT, notification, provider=provider, destination=destination)
    except Exception as exc:
        logger.exception('Email notification failed for notification %s', getattr(notification, 'id', None))
        provider = f'{provider_name}:override' if override_used else provider_name
        return _delivery_status(NotificationDelivery.Channel.EMAIL, NotificationDelivery.Status.FAILED, notification, provider=provider, destination=destination, error=str(exc))


def _sms_text(notification: Notification) -> str:
    """Build a short SMS text.

    SMS.RU bills long Cyrillic messages as several SMS segments, so booking
    messages are intentionally compact. The full text and link stay available in
    the in-app notification and email copy.
    """
    title = ' '.join(str(notification.title or '').split())
    message = ' '.join(str(notification.message or '').split())
    text = f'WebTavern: {title}. {message}'.strip()
    configured_length = os.getenv('SMS_MAX_LENGTH', getattr(settings, 'SMS_MAX_LENGTH', 120))
    max_length = int(configured_length or 120)
    if len(text) > max_length:
        return text[: max_length - 3] + '...'
    return text


def _send_sms_via_smsru(phone: str, text: str) -> tuple[bool, str, str]:
    api_id = getattr(settings, 'SMSRU_API_ID', '')
    if not api_id:
        return False, '', 'SMSRU_API_ID не указан.'

    phone_digits = ''.join(ch for ch in phone if ch.isdigit())
    if not phone_digits:
        return False, '', 'Телефон не содержит цифр.'

    payload_data = {
        'api_id': api_id,
        'to': phone_digits,
        'msg': text,
        'json': 1,
    }

    # SMS.RU rejects unregistered sender names. In demo mode it is safer not to
    # pass the sender unless the owner explicitly enabled it in env.
    configured_sender_flag = os.getenv('SMS_RU_USE_SENDER', getattr(settings, 'SMS_RU_USE_SENDER', 'false'))
    use_sender = str(configured_sender_flag or 'false').lower() in {'1', 'true', 'yes', 'on'}
    sender = str(getattr(settings, 'SMS_FROM', '') or '').strip()
    if use_sender and sender:
        payload_data['from'] = sender

    payload = parse.urlencode(payload_data).encode('utf-8')
    timeout = int(getattr(settings, 'SMS_TIMEOUT_SECONDS', 10) or 10)
    req = urlrequest.Request('https://sms.ru/sms/send', data=payload, method='POST')
    with urlrequest.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    if data.get('status') != 'OK':
        return False, '', str(data.get('status_text') or data)

    sms_data = data.get('sms') or {}
    first = next(iter(sms_data.values()), {}) if isinstance(sms_data, dict) else {}
    if first and first.get('status') != 'OK':
        return False, str(first.get('sms_id', '') or ''), str(first.get('status_text') or first)

    return True, str(first.get('sms_id', '') or ''), ''


def _send_sms_via_webhook(phone: str, text: str) -> tuple[bool, str, str]:
    webhook_url = getattr(settings, 'SMS_WEBHOOK_URL', '')
    if not webhook_url:
        return False, '', 'SMS_WEBHOOK_URL не указан.'
    timeout = int(getattr(settings, 'SMS_TIMEOUT_SECONDS', 10) or 10)
    body = json.dumps({'phone': phone, 'message': text, 'sender': getattr(settings, 'SMS_FROM', 'WebTavern')}).encode('utf-8')
    req = urlrequest.Request(webhook_url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urlrequest.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode('utf-8')
    return True, raw[:255], ''


def send_sms_notification(notification: Notification) -> NotificationDelivery:
    destination = getattr(notification.recipient, 'phone', '') or ''
    provider = str(getattr(settings, 'SMS_PROVIDER', 'console') or 'console').strip().lower()
    if not getattr(settings, 'ENABLE_SMS_NOTIFICATIONS', True):
        return _delivery_status(NotificationDelivery.Channel.SMS, NotificationDelivery.Status.SKIPPED, notification, provider=provider, destination=destination, error='SMS-уведомления отключены в настройках проекта.')
    if not destination:
        return _delivery_status(NotificationDelivery.Channel.SMS, NotificationDelivery.Status.SKIPPED, notification, provider=provider, destination='', error='У пользователя не указан телефон.')

    text = _sms_text(notification)
    try:
        if provider == 'smsru':
            ok, provider_message_id, error = _send_sms_via_smsru(destination, text)
            status = NotificationDelivery.Status.SENT if ok else NotificationDelivery.Status.FAILED
            return _delivery_status(NotificationDelivery.Channel.SMS, status, notification, provider=provider, destination=destination, provider_message_id=provider_message_id, error=error)
        if provider == 'webhook':
            ok, provider_message_id, error = _send_sms_via_webhook(destination, text)
            status = NotificationDelivery.Status.SENT if ok else NotificationDelivery.Status.FAILED
            return _delivery_status(NotificationDelivery.Channel.SMS, status, notification, provider=provider, destination=destination, provider_message_id=provider_message_id, error=error)

        logger.info('SMS notification to %s: %s', destination, text)
        return _delivery_status(NotificationDelivery.Channel.SMS, NotificationDelivery.Status.SENT, notification, provider=provider, destination=destination, provider_message_id='console-log')
    except Exception as exc:
        logger.exception('SMS notification failed for notification %s', getattr(notification, 'id', None))
        return _delivery_status(NotificationDelivery.Channel.SMS, NotificationDelivery.Status.FAILED, notification, provider=provider, destination=destination, error=str(exc))


def deliver_external_copies(notification: Notification, *, send_email_copy: bool = False, send_sms_copy: bool = False) -> list[NotificationDelivery]:
    preference = get_notification_preference(notification.recipient)
    booking_event = _is_booking_event(notification.event_type)
    deliveries: list[NotificationDelivery] = []

    if send_email_copy:
        if preference.email_enabled and (not booking_event or preference.booking_email_enabled):
            deliveries.append(send_email_notification(notification))
        else:
            deliveries.append(_delivery_status(NotificationDelivery.Channel.EMAIL, NotificationDelivery.Status.SKIPPED, notification, provider='preference', destination=getattr(notification.recipient, 'email', ''), error='Email-канал отключён пользователем.'))

    if send_sms_copy:
        if preference.sms_enabled and (not booking_event or preference.booking_sms_enabled):
            deliveries.append(send_sms_notification(notification))
        else:
            deliveries.append(_delivery_status(NotificationDelivery.Channel.SMS, NotificationDelivery.Status.SKIPPED, notification, provider='preference', destination=getattr(notification.recipient, 'phone', ''), error='SMS-канал отключён пользователем.'))

    return deliveries


def create_notification(*, recipient, title: str, message: str, venue=None, event_type: str = '', target_url: str = '', channel: str = Notification.Channel.IN_APP, send_email_copy: bool = False, send_sms_copy: bool = False):
    notification = Notification.objects.create(
        recipient=recipient,
        venue=venue,
        channel=channel,
        title=title,
        message=message,
        event_type=event_type,
        target_url=target_url,
    )
    try:
        broadcast_notification({
            'type': event_type or 'notification',
            'notification_id': notification.id,
            'title': title,
            'message': message,
            'target_url': target_url,
        }, venue_id=getattr(venue, 'id', None), user_id=recipient.id)
    except Exception:
        logger.exception('Realtime notification broadcast failed for notification %s', getattr(notification, 'id', None))

    try:
        deliver_external_copies(notification, send_email_copy=send_email_copy, send_sms_copy=send_sms_copy)
    except Exception:
        logger.exception('External notification delivery failed for notification %s', getattr(notification, 'id', None))
    return notification


def broadcast_notification(payload: dict, venue_id: int | None = None, user_id: int | None = None):
    if get_channel_layer is None:
        return
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        groups = []
        if venue_id:
            groups.append(f'venue_{venue_id}_notifications')
        if user_id:
            groups.append(f'user_{user_id}_notifications')
        if not groups:
            groups.append('global_notifications')
        for group_name in groups:
            async_to_sync(channel_layer.group_send)(group_name, {'type': 'broadcast_notification', 'payload': payload})
    except Exception:
        logger.exception('Realtime notification failed')


def _iso_datetime(value):
    if not value:
        return None
    try:
        from django.utils import timezone
        return timezone.localtime(value).isoformat()
    except Exception:
        return str(value)


def build_booking_realtime_payload(booking, *, event_type: str, message: str = '') -> dict:
    """Compact booking payload for realtime UI updates.

    It is intentionally not a full serializer: the venue page only needs enough
    information to decide whether to refresh table availability immediately.
    """
    table_ids = []
    try:
        table_ids = list(booking.tables.values_list('id', flat=True))
    except Exception:
        table_ids = []
    if getattr(booking, 'table_id', None) and booking.table_id not in table_ids:
        table_ids.insert(0, booking.table_id)
    payment_deadline_at = None
    try:
        from apps.bookings.utils import payment_deadline_for_booking
        payment_deadline_at = _iso_datetime(payment_deadline_for_booking(booking))
    except Exception:
        payment_deadline_at = None
    payment_status = None
    try:
        payment_status = getattr(booking.payment, 'status', None)
    except Exception:
        payment_status = None
    return {
        'type': event_type,
        'event_type': event_type,
        'booking_id': getattr(booking, 'id', None),
        'venue_id': getattr(booking, 'venue_id', None),
        'hall_id': getattr(booking, 'hall_id', None),
        'table_id': getattr(booking, 'table_id', None),
        'table_ids': table_ids,
        'booking_type': getattr(booking, 'booking_type', 'tables'),
        'booking_status': getattr(booking, 'status', ''),
        'status': getattr(booking, 'status', ''),
        'booking_start': _iso_datetime(getattr(booking, 'booking_start', None)),
        'booking_end': _iso_datetime(getattr(booking, 'booking_end', None)),
        'hold_expires_at': _iso_datetime(getattr(booking, 'hold_expires_at', None)),
        'payment_deadline_at': payment_deadline_at,
        'payment_status': payment_status,
        'message': message or f'Бронь #{getattr(booking, "id", "")} обновлена.',
        'realtime': True,
    }


def broadcast_booking_update(booking, *, event_type: str, message: str = '', include_customer: bool = True):
    """Broadcast booking changes to venue pages and the customer account socket."""
    payload = build_booking_realtime_payload(booking, event_type=event_type, message=message)
    broadcast_notification(
        payload,
        venue_id=getattr(booking, 'venue_id', None),
        user_id=getattr(booking, 'customer_id', None) if include_customer else None,
    )
    return payload
