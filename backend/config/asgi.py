import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.local"))

try:
    from channels.auth import AuthMiddlewareStack
    from channels.routing import ProtocolTypeRouter, URLRouter
    from django.core.asgi import get_asgi_application

    from apps.notifications.routing import websocket_urlpatterns

    django_asgi_app = get_asgi_application()

    application = ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
        }
    )
except Exception:
    from django.core.asgi import get_asgi_application

    application = get_asgi_application()
