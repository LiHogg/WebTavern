from django.contrib import admin

from .models import LegalEntity

@admin.register(LegalEntity)
class LegalEntityAdmin(admin.ModelAdmin):
    list_display = ("company_name", "owner", "tax_number", "is_active")
    search_fields = ("company_name", "tax_number")
