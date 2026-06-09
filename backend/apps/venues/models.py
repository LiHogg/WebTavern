from django.conf import settings
from django.db import models
from django.utils.text import slugify

from apps.common.models import TimeStampedModel
from apps.organizations.models import LegalEntity


class Venue(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        PENDING_MODERATION = "pending_moderation", "На модерации"
        ACTIVE = "active", "Активно"
        BLOCKED = "blocked", "Заблокировано"

    class PriceCategory(models.TextChoices):
        BUDGET = 'budget', 'Доступно'
        MIDDLE = 'middle', 'Средний чек'
        HIGH = 'high', 'Выше среднего'
        PREMIUM = 'premium', 'Премиум'

    class Theme(models.TextChoices):
        FAMILY = 'family', 'Семейное'
        ROMANTIC = 'romantic', 'Романтика'
        BUSINESS = 'business', 'Деловое'
        GEEK = 'geek', 'Гик / настолки'
        PANORAMIC = 'panoramic', 'Панорамное'
        ETHNIC = 'ethnic', 'Этническое'
        ART = 'art', 'Арт-пространство'
        LOUNGE = 'lounge', 'Lounge'
        LIVE_MUSIC = 'live_music', 'Живая музыка'
        FAST_CASUAL = 'fast_casual', 'Fast casual'

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="venues",
        verbose_name="Владелец",
    )
    legal_entity = models.ForeignKey(
        LegalEntity,
        on_delete=models.SET_NULL,
        related_name="venues",
        null=True,
        blank=True,
        verbose_name="Юридическое лицо",
    )
    name = models.CharField(max_length=255, verbose_name="Название")
    slug = models.SlugField(unique=True, max_length=255, verbose_name="Slug")
    country = models.CharField(max_length=128, default='Россия', verbose_name='Страна')
    city = models.CharField(max_length=128, verbose_name="Город")
    district = models.CharField(max_length=128, blank=True, verbose_name='Район')
    address = models.CharField(max_length=255, verbose_name="Адрес")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, verbose_name='Широта')
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, verbose_name='Долгота')
    cuisine = models.CharField(max_length=128, blank=True, verbose_name='Кухня')
    price_category = models.CharField(max_length=32, choices=PriceCategory.choices, default=PriceCategory.MIDDLE, verbose_name='Ценовая категория')
    venue_theme = models.CharField(max_length=32, choices=Theme.choices, default=Theme.FAMILY, verbose_name='Тема заведения')
    short_description = models.CharField(max_length=255, blank=True, verbose_name="Краткое описание")
    description = models.TextField(blank=True, verbose_name="Описание")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT, verbose_name="Статус")
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0, verbose_name="Средний рейтинг")
    is_published = models.BooleanField(default=False, verbose_name="Опубликовано")

    class Meta:
        verbose_name = "Заведение"
        verbose_name_plural = "Заведения"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 2
            while Venue.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class VenueManagerAssignment(TimeStampedModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="manager_assignments", verbose_name="Заведение")
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="venue_assignments",
        verbose_name="Менеджер",
    )
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        verbose_name = "Назначение менеджера"
        verbose_name_plural = "Назначения менеджеров"
        unique_together = ("venue", "manager")

    def __str__(self) -> str:
        return f"{self.manager.email} -> {self.venue.name}"


class VenueBranding(TimeStampedModel):
    PRESET_CHOICES = [
        ('northern_blue', 'Northern blue'),
        ('brick_house', 'Brick house'),
        ('sage_garden', 'Sage garden'),
        ('night_neon', 'Night neon'),
        ('coffee_sand', 'Coffee sand'),
        ('berry_lounge', 'Berry lounge'),
        ('forest_ember', 'Forest ember'),
        ('royal_indigo', 'Royal indigo'),
        ('sea_breeze', 'Sea breeze'),
        ('cherry_noir', 'Cherry noir'),
        ('amber_craft', 'Amber craft'),
        ('mint_minimal', 'Mint minimal'),
        ('steel_business', 'Steel business'),
        ('sunset_orange', 'Sunset orange'),
        ('lavender_soft', 'Lavender soft'),
        ('graphite_gold', 'Graphite gold'),
        ('cyber_purple', 'Cyber purple'),
        ('nordic_frost', 'Nordic frost'),
    ]

    venue = models.OneToOneField(Venue, on_delete=models.CASCADE, related_name="branding", verbose_name="Заведение")
    theme_mode = models.CharField(max_length=32, default="light", verbose_name="Тема")
    theme_preset = models.CharField(max_length=32, choices=PRESET_CHOICES, default='northern_blue', verbose_name='Готовая тема')
    use_custom_palette = models.BooleanField(default=False, verbose_name='Своя палитра')
    accent_color = models.CharField(max_length=32, default="#111827", verbose_name="Акцентный цвет")
    background_variant = models.CharField(max_length=64, default="neutral-surface", verbose_name="Фон")
    text_color = models.CharField(max_length=32, default="#111827", verbose_name="Цвет текста")
    card_background_color = models.CharField(max_length=32, default='#ffffff', verbose_name='Фон карточек')
    card_text_color = models.CharField(max_length=32, default='#111827', verbose_name='Текст карточек')
    badge_background_color = models.CharField(max_length=32, default='#eef2ff', verbose_name='Фон бейджей')
    badge_text_color = models.CharField(max_length=32, default='#312e81', verbose_name='Текст бейджей')
    cta_background_color = models.CharField(max_length=32, default='#111827', verbose_name='Фон CTA')
    cta_text_color = models.CharField(max_length=32, default='#ffffff', verbose_name='Текст CTA')
    contrast_warning = models.BooleanField(default=False, verbose_name="Есть предупреждение по контрастности")

    class Meta:
        verbose_name = "Брендирование заведения"
        verbose_name_plural = "Брендирование заведений"

    def __str__(self) -> str:
        return f"Branding: {self.venue.name}"


class VenueImage(TimeStampedModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="images", verbose_name="Заведение")
    image = models.ImageField(upload_to="venues/", verbose_name="Изображение")
    alt_text = models.CharField(max_length=255, blank=True, verbose_name="Alt")
    is_cover = models.BooleanField(default=False, verbose_name="Обложка")

    class Meta:
        verbose_name = "Изображение заведения"
        verbose_name_plural = "Изображения заведений"

    def __str__(self) -> str:
        return f"Image for {self.venue.name}"
