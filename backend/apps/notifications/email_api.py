import json
from email.utils import parseaddr
from urllib import error as urlerror, request as urlrequest

from django.conf import settings


def _sender_parts() -> tuple[str, str]:
    configured_sender = str(getattr(settings, 'DEFAULT_FROM_EMAIL', '') or '').strip()
    sender_name, sender_email = parseaddr(configured_sender)
    if not sender_email and configured_sender and '@' in configured_sender:
        sender_email = configured_sender
    sender_name = sender_name or 'WebTavern'
    sender_email = sender_email or str(getattr(settings, 'SERVER_EMAIL', '') or '').strip() or 'no-reply@webtavern.local'
    return sender_name, sender_email


def send_via_http_api(*, to_email: str, subject: str, text: str) -> tuple[bool, str, str]:
    """Send an email notification through a JSON HTTP API endpoint.

    The endpoint receives a neutral JSON payload. It can be connected to an
    email provider directly or through a small integration layer.
    """
    api_url = str(getattr(settings, 'EMAIL_HTTP_API_URL', '') or '').strip()
    if not api_url:
        return False, '', 'EMAIL_HTTP_API_URL не указан.'

    token = str(getattr(settings, 'EMAIL_HTTP_API_TOKEN', '') or '').strip()
    auth_header = str(getattr(settings, 'EMAIL_HTTP_API_AUTH_HEADER', 'Authorization') or 'Authorization').strip()
    token_prefix = str(getattr(settings, 'EMAIL_HTTP_API_TOKEN_PREFIX', 'Bearer') or '').strip()
    timeout = int(getattr(settings, 'EMAIL_HTTP_TIMEOUT_SECONDS', getattr(settings, 'EMAIL_TIMEOUT', 10)) or 10)
    sender_name, sender_email = _sender_parts()

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
    }
    if token:
        headers[auth_header] = f'{token_prefix} {token}'.strip() if token_prefix else token

    payload = {
        'from': getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@webtavern.local'),
        'from_email': sender_email,
        'from_name': sender_name,
        'to': to_email,
        'recipient': to_email,
        'subject': subject,
        'text': text,
        'message': text,
        'project': 'WebTavern',
    }

    request_body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urlrequest.Request(api_url, data=request_body, headers=headers, method='POST')

    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            status_code = getattr(resp, 'status', None) or resp.getcode()
            raw = resp.read().decode('utf-8', errors='replace')
    except urlerror.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace') if exc.fp else ''
        return False, '', f'HTTP {exc.code}: {raw[:700] or exc.reason}'
    except Exception as exc:
        return False, '', str(exc)

    if status_code < 200 or status_code >= 300:
        return False, '', f'HTTP {status_code}: {raw[:700]}'

    message_id = ''
    try:
        data = json.loads(raw) if raw else {}
        if isinstance(data, dict):
            message_id = str(data.get('messageId') or data.get('message_id') or data.get('id') or data.get('uuid') or '')
    except Exception:
        message_id = raw[:255]

    return True, message_id[:255], ''
