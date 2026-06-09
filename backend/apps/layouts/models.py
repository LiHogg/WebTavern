from django.db import models

from apps.common.models import TimeStampedModel
from apps.halls.models import Hall
from apps.tables.models import Table


class TableLayout(TimeStampedModel):
    hall = models.OneToOneField(Hall, on_delete=models.CASCADE, related_name="layout", verbose_name="Зал")
    canvas_width = models.PositiveIntegerField(default=1200, verbose_name="Ширина canvas")
    canvas_height = models.PositiveIntegerField(default=800, verbose_name="Высота canvas")
    background_image = models.ImageField(upload_to="layouts/", null=True, blank=True, verbose_name="Фон")
    is_active = models.BooleanField(default=True, verbose_name="Активна")

    class Meta:
        verbose_name = "Схема зала"
        verbose_name_plural = "Схемы залов"

    def __str__(self) -> str:
        return f"Layout for {self.hall}"


class TableLayoutItem(TimeStampedModel):
    layout = models.ForeignKey(TableLayout, on_delete=models.CASCADE, related_name="items", verbose_name="Схема")
    table = models.OneToOneField(Table, on_delete=models.CASCADE, related_name="layout_item", verbose_name="Стол")
    x = models.IntegerField(default=0, verbose_name="X")
    y = models.IntegerField(default=0, verbose_name="Y")
    width = models.PositiveIntegerField(default=120, verbose_name="Ширина")
    height = models.PositiveIntegerField(default=120, verbose_name="Высота")
    rotation = models.IntegerField(default=0, verbose_name="Поворот")

    class Meta:
        verbose_name = "Элемент схемы"
        verbose_name_plural = "Элементы схемы"

    def __str__(self) -> str:
        return f"{self.table} on layout"


class LayoutDecorItem(TimeStampedModel):
    class ItemType(models.TextChoices):
        WALL = "wall", "Стена"
        WINDOW = "window", "Окно"
        BAR = "bar", "Барная стойка"
        ENTRANCE = "entrance", "Вход"
        CASHIER = "cashier", "Касса"
        WC = "wc", "Санузел"
        COLUMN = "column", "Колонна"
        PLANT = "plant", "Растение"
        SOFA = "sofa", "Диван"
        LABEL = "label", "Подпись"

    layout = models.ForeignKey(TableLayout, on_delete=models.CASCADE, related_name="decor_items", verbose_name="Схема")
    item_type = models.CharField(max_length=32, choices=ItemType.choices, verbose_name="Тип элемента")
    label = models.CharField(max_length=120, blank=True, verbose_name="Подпись")
    x = models.IntegerField(default=0, verbose_name="X")
    y = models.IntegerField(default=0, verbose_name="Y")
    width = models.PositiveIntegerField(default=120, verbose_name="Ширина")
    height = models.PositiveIntegerField(default=40, verbose_name="Высота")
    rotation = models.IntegerField(default=0, verbose_name="Поворот")

    class Meta:
        verbose_name = "Декоративный элемент схемы"
        verbose_name_plural = "Декоративные элементы схемы"

    def __str__(self) -> str:
        return f"{self.get_item_type_display()} ({self.layout.hall})"
