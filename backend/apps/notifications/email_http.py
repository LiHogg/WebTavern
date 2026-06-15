import html
import json
import logging
from email.utils import parseaddr
from urllib import error as urlerror, request as urlrequest

from django.conf import settings

logger = logging.getLogger(__name__)


def _split_email_address(value: str, *, fallback_name: str = 'WebTavern') -> tuple[str, str]:
    name, email_address = parseaddr(value or '')
    name = (name or fallback_name or '').strip()
    email_address = (email_address or value or '').strip()
    return name, email_address


def _html_body(text: str) -> str:
    rows = []
    for line in str(text or '').splitlines():
        line = line.strip()
        rows.append(f'<p>{html.escape(line)}</p>' if line else '<br>')
    return ''.join(rows) or '<p>WebTavern</p>'


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


def _brevo_payload(*, destination: str, subject: str, body: str, from_email: str) -> dict:
    sender_name, sender_email = _split_email_address(from_email)
    recipient_name, recipient_email = _split_email_address(destination, fallback_name='')
    sender = {'email': sender_email}
    if sender_name:
        sender['name'] = sender_name
    recipient = {'email': recipient_email}
    if recipient_name:
        recipient['name'] = recipient_name
    return {
        'sender': sender,
        'to': [recipient],
        'subject': subject,
        'textContent': body,
        'htmlContent': _html_body(body),
    }


def _generic_payload(*, destination: str, subject: str, body: str, from_email: str) -> dict:
    sender_name, sender_email = _split_email_address(from_email)
    return {
        'from': from_email,
        'from_email': sender_email,
        'from_name': sender_name,
        'to': destination,
        'recipient': destination,
        'subject': subject,
        'text': body,
        'message': body,
        'html': _html_body(body),
        'project': 'WebTavern',
    }


def _payload(*, destination: str, subject: str, body: str, from_email: str) -> dict:
    api_url = str(getattr(settings, 'EMAIL_HTTP_API_URL', '') or '').lower()
    auth_header = str(getattr(settings, 'EMAIL_HTTP_API_AUTH_HEADER', '') or '').lower()
    if 'brevo.com' in api_url or auth_header == 'api-key':
        return _brevo_payload(destination=destination, subject=subject, body=body, from_email=from_email)
    return _generic_payload(destination=destination, subject=subject, body=body, from_email=from_email)


def send_email_via_http(destination: str, subject: str, body: str, from_email: str) -> tuple[bool, str, str]:
    api_url = str(getattr(settings, 'EMAIL_HTTP_API_URL', '') or '').strip()
    if not api_url:
        return False, '', 'EMAIL_HTTP_API_URL не указан.'

    data = json.dumps(_payload(destination=destination, subject=subject, body=body, from_email=from_email), ensure_ascii=False).encode('utf-8')
    timeout = int(getattr(settings, 'EMAIL_HTTP_TIMEOUT_SECONDS', 20) or 20)
    req = urlrequest.Request(api_url, data=data, headers=_auth_headers(), method='POST')
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8')
            status_code = getattr(resp, 'status', 200)
    except urlerror.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        return False, '', f'HTTP {exc.code}: {raw[:500]}'

    if status_code >= 400:
        return False, '', f'HTTP {status_code}: {raw[:500]}'

    try:
        payload = json.loads(raw or '{}')
        provider_message_id = str(payload.get('messageId') or payload.get('id') or payload.get('message_id') or '')
    except Exception:
        provider_message_id = raw[:255]
    return True, provider_message_id, ''
