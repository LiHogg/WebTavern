"""Brevo HTTP email delivery for WebTavern notifications.

This module patches the notification email delivery function when
EMAIL_PROVIDER=http. It keeps the existing SMTP flow as a fallback for local
or demo environments where SMTP is still used.
"""

from __future__ import annotations

import json
import logging
from email.utils import parseaddr
from html import escape
from urllib import error as urlerror
from urllib import request as urlrequest

from django.conf import settings

from . import services
from .models import Notification, NotificationDelivery

logger = logging.getLogger(__name__)


_ORIGINAL_SEND_EMAIL_NOTIFICATION = getattr(
    services,
    '_original_send_email_notification',
    services.send_email_notification,
)


def _provider_enabled() -> bool:
    return str(getattr(settings, 'EMAIL_PROVIDER', 'smtp') or 'smtp').strip().lower() == 'http'


def _parse_sender() -> tuple[str, str]:
    raw_sender = str(
        getattr(settings, 'DEFAULT_FROM_EMAIL', '')
        or getattr(settings, 'SERVER_EMAIL', '')
        or getattr(settings, 'EMAIL_HOST_USER', '')
        or 'WebTavern <no-reply@webtavern.local>'
    ).strip()
    name, email = parseaddr(raw_sender)
    if not email:
        email = raw_sender
        name = ''
    return name or 'WebTavern', email


def _html_message(text: str) -> str:
    safe = escape(text or '').replace('\n', '<br>')
    return f'<p>{safe}</p>'


def _auth_headers() -> dict[str, str]:
    token = str(getattr(settings, 'EMAIL_HTTP_API_TOKEN', '') or '').strip()
    header_name = str(getattr(settings, 'EMAIL_HTTP_API_AUTH_HEADER', 'Authorization') or 'Authorization').strip()
    token_prefix = str(getattr(settings, 'EMAIL_HTTP_API_TOKEN_PREFIX', 'Bearer') or '').strip()

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    if token and header_name:
        headers[header_name] = f'{token_prefix} {token}'.strip() if token_prefix else token
    return headers


def _build_brevo_payload(*, destination: str, subject: str, body: str) -> dict:
    sender_name, sender_email = _parse_sender()
    return {
        'sender': {
            'name': sender_name,
            'email': sender_email,
        },
        'to': [
            {
                'email': destination,
            }
        ],
        'subject': subject,
        'textContent': body,
        'htmlContent': _html_message(body),
    }


def _build_generic_payload(*, destination: str, subject: str, body: str) -> dict:
    sender_name, sender_email = _parse_sender()
    return {
        'from': f'{sender_name} <{sender_email}>'.strip(),
        'from_email': sender_email,
        'from_name': sender_name,
        'to': destination,
        'recipient': destination,
        'subject': subject,
        'text': body,
        'message': body,
        'project': 'WebTavern',
    }


def _send_email_via_http_api(*, destination: str, subject: str, body: str) -> str:
    api_url = str(getattr(settings, 'EMAIL_HTTP_API_URL', '') or '').strip()
    if not api_url:
        raise RuntimeError('EMAIL_HTTP_API_URL не указан.')

    is_brevo = 'brevo.com' in api_url.lower()
    payload = _build_brevo_payload(destination=destination, subject=subject, body=body) if is_brevo else _build_generic_payload(destination=destination, subject=subject, body=body)
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    timeout = int(getattr(settings, 'EMAIL_HTTP_TIMEOUT_SECONDS', 20) or 20)

    req = urlrequest.Request(api_url, data=data, headers=_auth_headers(), method='POST')
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            if not raw:
                return ''
            try:
                response_data = json.loads(raw)
            except json.JSONDecodeError:
                return raw[:255]
            return str(response_data.get('messageId') or response_data.get('id') or raw[:255])
    except urlerror.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {exc.code}: {raw}') from exc


def send_email_notification(notification: Notification) -> NotificationDelivery:
    if not _provider_enabled():
        return _ORIGINAL_SEND_EMAIL_NOTIFICATION(notification)

    original_destination = getattr(notification.recipient, 'email', '') or ''
    destination, source_destination, override_used = services._resolve_email_destination(original_destination)
    provider_name = 'brevo-http' if 'brevo.com' in str(getattr(settings, 'EMAIL_HTTP_API_URL', '') or '').lower() else 'http'

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
        provider_message_id = _send_email_via_http_api(destination=destination, subject=subject, body=body)
        provider = f'{provider_name}:override' if override_used else provider_name
        return services._delivery_status(
            NotificationDelivery.Channel.EMAIL,
            NotificationDelivery.Status.SENT,
            notification,
            provider=provider,
            destination=destination,
            provider_message_id=provider_message_id,
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


def apply_patch() -> None:
    if getattr(services, '_brevo_http_patch_applied', False):
        return
    services._original_send_email_notification = _ORIGINAL_SEND_EMAIL_NOTIFICATION
    services.send_email_notification = send_email_notification
    services._brevo_http_patch_applied = True
