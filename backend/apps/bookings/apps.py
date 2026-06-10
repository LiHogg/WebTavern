from django.apps import AppConfig


class BookingsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.bookings"
    verbose_name = "Bookings"

    def ready(self):
        from .flow_patch import apply_booking_flow_patch
        apply_booking_flow_patch()
