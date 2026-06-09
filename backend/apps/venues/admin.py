from django.contrib import admin

from .models import Venue, VenueBranding, VenueImage, VenueManagerAssignment


class VenueImageInline(admin.TabularInline):
    model = VenueImage
    extra = 0


class VenueManagerAssignmentInline(admin.TabularInline):
    model = VenueManagerAssignment
    extra = 0


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "owner", "status", "is_published", "average_rating")
    search_fields = ("name", "city", "address")
    list_filter = ("status", "city")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [VenueImageInline, VenueManagerAssignmentInline]


@admin.register(VenueBranding)
class VenueBrandingAdmin(admin.ModelAdmin):
    list_display = ("venue", "theme_mode", "accent_color", "contrast_warning")
