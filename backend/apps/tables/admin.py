from django.contrib import admin

from .models import Table

@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ("name", "hall", "seats_count", "is_active", "is_combinable")
    list_filter = ("hall", "is_active", "is_combinable")
