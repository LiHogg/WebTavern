from django.contrib import admin

from .models import BookingPriceRule, VenueBookingRule


@admin.register(VenueBookingRule)
class VenueBookingRuleAdmin(admin.ModelAdmin):
    list_display = (
        "venue",
        "default_duration_minutes",
        "slot_step_minutes",
        "cleanup_buffer_minutes",
        "payment_hold_minutes",
    )


@admin.register(BookingPriceRule)
class BookingPriceRuleAdmin(admin.ModelAdmin):
    list_display = ("venue", "rule_type", "hall", "table_count", "price_amount", "price_currency", "is_active")
    list_filter = ("rule_type", "is_active", "price_currency")
    search_fields = ("venue__name", "hall__name", "title")
