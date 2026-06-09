from django.contrib import admin

from .models import LayoutDecorItem, TableLayout, TableLayoutItem


class TableLayoutItemInline(admin.TabularInline):
    model = TableLayoutItem
    extra = 0


class LayoutDecorItemInline(admin.TabularInline):
    model = LayoutDecorItem
    extra = 0


@admin.register(TableLayout)
class TableLayoutAdmin(admin.ModelAdmin):
    list_display = ("hall", "canvas_width", "canvas_height", "is_active")
    inlines = [TableLayoutItemInline, LayoutDecorItemInline]
