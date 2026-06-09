from django.apps import AppConfig

class TablesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tables"
    verbose_name = "Tables"


    def ready(self):
        from . import signals  # noqa: F401
