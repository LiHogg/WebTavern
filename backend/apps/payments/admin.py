from django.contrib import admin

from .models import Payment

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("booking", "provider", "status", "amount", "currency", "created_at")
    list_filter = ("provider", "status")
