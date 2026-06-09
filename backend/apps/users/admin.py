from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User

@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = ("email", "last_name", "first_name", "role", "account_type", "is_active", "is_staff")
    search_fields = ("email", "phone", "last_name", "first_name")
    readonly_fields = ("created_at", "updated_at", "last_login")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Личные данные",
            {"fields": ("last_name", "first_name", "middle_name", "phone", "date_of_birth")},
        ),
        ("Роль и тип", {"fields": ("role", "account_type")}),
        ("Права", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Системные поля", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "first_name", "last_name", "password1", "password2"),
            },
        ),
    )
