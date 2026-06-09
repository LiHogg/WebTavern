from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from apps.common.models import TimeStampedModel
from .managers import UserManager

class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    class Role(models.TextChoices):
        CLIENT = "client", "Клиент"
        MANAGER = "manager", "Менеджер"
        OWNER = "owner", "Владелец"
        MODERATOR = "moderator", "Модератор"
        PLATFORM_ADMIN = "platform_admin", "Администратор платформы"

    class AccountType(models.TextChoices):
        INDIVIDUAL = "individual", "Физическое лицо"
        LEGAL = "legal", "Юридическое лицо"

    email = models.EmailField(unique=True, verbose_name="Email")
    phone = models.CharField(max_length=32, unique=True, null=True, blank=True, verbose_name="Телефон")
    first_name = models.CharField(max_length=150, verbose_name="Имя")
    last_name = models.CharField(max_length=150, verbose_name="Фамилия")
    middle_name = models.CharField(max_length=150, blank=True, verbose_name="Отчество")
    date_of_birth = models.DateField(null=True, blank=True, verbose_name="Дата рождения")
    city = models.CharField(max_length=120, blank=True, verbose_name="Город проживания")

    role = models.CharField(max_length=32, choices=Role.choices, default=Role.CLIENT, verbose_name="Роль")
    account_type = models.CharField(
        max_length=32,
        choices=AccountType.choices,
        default=AccountType.INDIVIDUAL,
        verbose_name="Тип аккаунта",
    )

    is_active = models.BooleanField(default=True, verbose_name="Активен")
    is_staff = models.BooleanField(default=False, verbose_name="Доступ в админку")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"
        ordering = ["-created_at"]


    @property
    def client_mode_enabled(self) -> bool:
        return True

    @property
    def primary_role(self) -> str:
        return self.role

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"
