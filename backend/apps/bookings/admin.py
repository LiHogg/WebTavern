from django.contrib import admin

from .models import Booking, BookingStatusHistory

class BookingStatusHistoryInline(admin.TabularInline):
    model = BookingStatusHistory
    extra = 0
    readonly_fields = ("created_at",)

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("id", "venue", "customer", "booking_start", "booking_end", "status", "guests_count", "selected_tables")
    list_filter = ("venue", "status")
    search_fields = ("id", "customer__email", "customer__phone", "table__name", "tables__name")
    filter_horizontal = ("tables",)
    inlines = [BookingStatusHistoryInline]

    def selected_tables(self, obj):
        names = [table.name for table in obj.tables.all()]
        if obj.table_id and obj.table.name not in names:
            names.insert(0, obj.table.name)
        return ", ".join(names) or "—"
    selected_tables.short_description = "Столы"
