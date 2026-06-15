from django.apps import AppConfig

class VenuesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.venues"
    verbose_name = "Venues"

    def ready(self):
        from .working_hours_patch import apply_venue_working_hours_patch
        apply_venue_working_hours_patch()
