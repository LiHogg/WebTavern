from django.contrib import admin

from .models import Hall

@admin.register(Hall)
class HallAdmin(admin.ModelAdmin):
    list_display = ("name", "venue", "capacity", "is_active", "sort_order")
    list_filter = ("venue", "is_active")
