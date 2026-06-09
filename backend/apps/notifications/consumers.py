import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer


class NotificationsConsumer(AsyncWebsocketConsumer):
    """Realtime socket for venue occupancy and user notifications.

    The frontend usually connects with:
      /ws/notifications/?venue_id=<id>&token=<drf-token>

    A venue group is intentionally public for published venue pages: it only receives
    technical booking lifecycle events needed to redraw table availability. A user
    group is attached only when a valid DRF token is passed or session auth exists.
    """

    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode("utf-8"))
        venue_id = query.get("venue_id", [None])[0]
        token = query.get("token", [None])[0]
        self.groups = []

        user = self.scope.get("user")
        if token and not getattr(user, "is_authenticated", False):
            user = await self._get_user_by_token(token)
            self.scope["user"] = user

        if venue_id:
            self.groups.append(f"venue_{venue_id}_notifications")
        if getattr(user, "is_authenticated", False):
            self.groups.append(f"user_{user.id}_notifications")
        if not self.groups:
            self.groups.append("global_notifications")

        for group_name in self.groups:
            await self.channel_layer.group_add(group_name, self.channel_name)

        await self.accept()
        await self.send(text_data=json.dumps({"type": "connected", "groups": self.groups}))

    @database_sync_to_async
    def _get_user_by_token(self, token):
        if not token:
            return None
        try:
            from django.contrib.auth.models import AnonymousUser
            from rest_framework.authtoken.models import Token

            return Token.objects.select_related("user").get(key=token).user
        except Exception:
            from django.contrib.auth.models import AnonymousUser

            return AnonymousUser()

    async def disconnect(self, close_code):
        for group_name in getattr(self, "groups", []):
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        payload = json.loads(text_data or "{}")
        if payload.get("type") == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return
        await self.send(text_data=json.dumps({"echo": payload, "type": "debug"}))

    async def broadcast_notification(self, event):
        await self.send(text_data=json.dumps(event["payload"], default=str))
