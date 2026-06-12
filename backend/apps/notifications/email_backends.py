"""Email backends used by WebTavern notification delivery."""

from __future__ import annotations

import socket
from contextlib import contextmanager
from typing import Iterator

from django.conf import settings
from django.core.mail.backends.smtp import EmailBackend as DjangoSMTPEmailBackend


@contextmanager
def _prefer_ipv4_dns() -> Iterator[None]:
    """Temporarily make SMTP socket resolution prefer IPv4 addresses.

    Some hosting environments can resolve smtp hosts to IPv6 first while not
    having a working IPv6 route. That produces errors such as
    ``[Errno 101] Network is unreachable`` before Python tries IPv4. The SMTP
    backend only needs this patch while opening the connection, so the global
    resolver is restored immediately after Django creates the SMTP socket.
    """

    original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):  # noqa: A002 - socket API name
        if family in (0, socket.AF_UNSPEC):
            family = socket.AF_INET
        return original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = getaddrinfo_ipv4
    try:
        yield
    finally:
        socket.getaddrinfo = original_getaddrinfo


class IPv4SMTPEmailBackend(DjangoSMTPEmailBackend):
    """SMTP backend that avoids broken IPv6 routes on managed hosting."""

    def open(self):
        force_ipv4 = str(getattr(settings, 'EMAIL_FORCE_IPV4', True)).lower() in {
            '1',
            'true',
            'yes',
            'on',
        }
        if not force_ipv4:
            return super().open()

        with _prefer_ipv4_dns():
            return super().open()
