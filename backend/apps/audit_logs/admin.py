from django.contrib import admin

from .models import ManagerActionLog


@admin.register(ManagerActionLog)
class ManagerActionLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor', 'action', 'venue', 'booking')
    list_filter = ('action', 'venue')
    search_fields = ('details', 'actor__email', 'venue__name')
