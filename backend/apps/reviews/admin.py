from django.contrib import admin

from .models import Review, ReviewImage


class ReviewImageInline(admin.TabularInline):
    model = ReviewImage
    extra = 0


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'venue', 'author', 'parent', 'rating', 'created_at', 'is_visible')
    list_filter = ('venue', 'is_visible', 'rating')
    search_fields = ('text', 'author__email', 'venue__name')
    inlines = [ReviewImageInline]
