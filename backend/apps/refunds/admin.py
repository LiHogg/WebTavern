from django.contrib import admin

from .models import Refund

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("payment", "amount", "status", "requested_by", "created_at")
