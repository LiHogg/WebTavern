from django.contrib import admin

from .models import WaitlistEntry

@admin.register(WaitlistEntry)
class WaitlistEntryAdmin(admin.ModelAdmin):
    list_display = ("venue", "customer", "desired_date", "desired_time", "guests_count", "is_active")
