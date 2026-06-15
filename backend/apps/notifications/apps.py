from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Notifications"

    def ready(self):
        try:
            from .brevo_email_patch import apply_patch

            apply_patch()
        except Exception:
            # Notification delivery must not block Django startup. Any delivery
            # problem is recorded later in NotificationDelivery.
            pass
