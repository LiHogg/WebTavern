from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.layouts.models import LayoutDecorItem, TableLayout, TableLayoutItem
from apps.venues.models import Venue


PRESERVED_VENUE_SLUGS = {
    # This venue was manually adjusted in the UI and is used as a visual reference.
    "city-cafe-dzerzhinsk",
}

VENUE_VARIANT_BY_SLUG = {
    "north-harbor": "harbor",
    "black-sea-table": "panorama",
    "barkas-sevastopol": "harbor",
    "benuar-vladivostok": "show",
    "everjazz-ekaterinburg": "stage",
    "don-lane": "stage",
    "dodo-dzerzhinsk-tsiolkovskogo": "compact",
    "white-rabbit-moscow": "panorama",
    "neva-loft": "loft",
    "indigo-table": "art",
    "pixel-sakura": "geek",
    "ural-yard": "geek",
    "mitrich-steakhouse-nn": "steak",
    "pyatkin-nn": "classic",
    "literary-cafe-spb": "classic",
    "palkin-spb": "classic",
    "zuma-vladivostok": "panasia",
}

TABLE_POSITIONS = {
    "classic": [
        (115, 125, 112, 108, 0), (295, 125, 112, 108, 0), (505, 145, 138, 116, 0),
        (735, 145, 138, 116, 0), (260, 360, 150, 120, 0), (545, 360, 150, 120, 0),
        (815, 365, 150, 120, 0), (880, 570, 112, 108, 0), (520, 575, 138, 116, 0),
        (220, 575, 112, 108, 0),
    ],
    "harbor": [
        (120, 120, 112, 108, 0), (290, 120, 112, 108, 0), (470, 145, 138, 116, 0),
        (680, 145, 138, 116, 0), (170, 335, 170, 120, 0), (450, 350, 170, 120, 0),
        (730, 360, 170, 120, 0), (900, 565, 112, 108, 0), (585, 585, 138, 116, 0),
    ],
    "panorama": [
        (135, 110, 112, 108, 0), (315, 110, 112, 108, 0), (505, 120, 138, 116, 0),
        (705, 120, 138, 116, 0), (200, 350, 170, 120, 0), (520, 365, 170, 120, 0),
        (810, 380, 150, 120, 0), (965, 575, 112, 108, 0),
    ],
    "loft": [
        (110, 130, 112, 108, 0), (280, 130, 112, 108, 0), (485, 130, 138, 116, 0),
        (720, 135, 138, 116, 0), (175, 375, 170, 120, 0), (470, 380, 170, 120, 0),
        (770, 390, 138, 116, 0), (965, 585, 112, 108, 0),
    ],
    "stage": [
        (130, 360, 112, 108, 0), (295, 360, 112, 108, 0), (465, 355, 138, 116, 0),
        (675, 355, 138, 116, 0), (220, 555, 150, 120, 0), (500, 560, 150, 120, 0),
        (775, 565, 138, 116, 0), (950, 455, 112, 108, 0),
    ],
    "compact": [
        (120, 135, 104, 100, 0), (270, 135, 104, 100, 0), (430, 140, 124, 108, 0),
        (600, 140, 124, 108, 0), (245, 345, 124, 108, 0), (435, 345, 124, 108, 0),
        (635, 360, 104, 100, 0), (835, 345, 104, 100, 0),
    ],
    "art": [
        (120, 140, 112, 108, -4), (310, 130, 112, 108, 4), (510, 155, 138, 116, -3),
        (735, 150, 138, 116, 3), (190, 385, 160, 120, 5), (500, 390, 160, 120, -5),
        (790, 405, 138, 116, 4), (930, 585, 112, 108, 0),
    ],
    "geek": [
        (115, 140, 112, 108, 0), (285, 140, 112, 108, 0), (500, 130, 150, 120, 0),
        (740, 145, 150, 120, 0), (150, 390, 150, 120, 0), (425, 400, 170, 125, 0),
        (710, 405, 170, 125, 0), (925, 590, 112, 108, 0),
    ],
    "steak": [
        (110, 120, 112, 108, 0), (110, 280, 112, 108, 0), (335, 135, 138, 116, 0),
        (535, 135, 138, 116, 0), (760, 180, 170, 120, 0), (335, 400, 150, 120, 0),
        (560, 405, 150, 120, 0), (865, 520, 112, 108, 0),
    ],
    "show": [
        (125, 380, 112, 108, 0), (300, 380, 112, 108, 0), (485, 370, 138, 116, 0),
        (700, 370, 138, 116, 0), (180, 575, 150, 120, 0), (465, 575, 150, 120, 0),
        (755, 580, 150, 120, 0), (940, 440, 112, 108, 0),
    ],
    "panasia": [
        (115, 130, 112, 108, 0), (290, 130, 112, 108, 0), (495, 140, 138, 116, 0),
        (700, 140, 138, 116, 0), (185, 355, 150, 120, 0), (455, 370, 150, 120, 0),
        (725, 370, 150, 120, 0), (940, 570, 112, 108, 0),
    ],
}


def base_walls():
    return [
        {"item_type": "wall", "label": "Стена", "x": 24, "y": 26, "width": 1152, "height": 18},
        {"item_type": "wall", "label": "Стена", "x": 24, "y": 756, "width": 1152, "height": 18},
        {"item_type": "wall", "label": "Стена", "x": 24, "y": 26, "width": 18, "height": 748},
        {"item_type": "wall", "label": "Стена", "x": 1158, "y": 26, "width": 18, "height": 748},
    ]


def decor_for_variant(variant: str, *, has_bar: bool = True, hall_index: int = 0):
    decor = base_walls()
    decor.extend([
        {"item_type": "entrance", "label": "Вход", "x": 56, "y": 688, "width": 160, "height": 48},
        {"item_type": "wc", "label": "Санузел", "x": 1015, "y": 625, "width": 105, "height": 88},
        {"item_type": "plant", "label": "Зелень", "x": 1045, "y": 500, "width": 72, "height": 72},
    ])

    if variant in {"panorama", "harbor"}:
        decor.extend([
            {"item_type": "window", "label": "Панорамные окна", "x": 155, "y": 50, "width": 700, "height": 34},
            {"item_type": "sofa", "label": "Диванная линия", "x": 70, "y": 525, "width": 360, "height": 72},
            {"item_type": "bar", "label": "Бар у окна", "x": 905, "y": 88, "width": 210, "height": 86},
            {"item_type": "label", "label": "Проход к окнам", "x": 470, "y": 265, "width": 230, "height": 54},
        ])
    elif variant == "stage":
        decor.extend([
            {"item_type": "label", "label": "Сцена", "x": 90, "y": 70, "width": 360, "height": 150},
            {"item_type": "bar", "label": "Бар", "x": 870, "y": 80, "width": 240, "height": 92},
            {"item_type": "sofa", "label": "Lounge", "x": 760, "y": 590, "width": 210, "height": 68},
            {"item_type": "column", "label": "Колонна", "x": 560, "y": 255, "width": 62, "height": 62},
        ])
    elif variant == "show":
        decor.extend([
            {"item_type": "label", "label": "Шоу-сцена", "x": 110, "y": 70, "width": 420, "height": 155},
            {"item_type": "bar", "label": "Бар", "x": 870, "y": 78, "width": 240, "height": 90},
            {"item_type": "window", "label": "Витражи", "x": 575, "y": 54, "width": 230, "height": 34},
            {"item_type": "column", "label": "Колонна", "x": 585, "y": 300, "width": 62, "height": 62},
        ])
    elif variant == "compact":
        decor.extend([
            {"item_type": "cashier", "label": "Касса / выдача", "x": 845, "y": 86, "width": 245, "height": 82},
            {"item_type": "window", "label": "Окна", "x": 145, "y": 54, "width": 420, "height": 34},
            {"item_type": "sofa", "label": "Диван", "x": 80, "y": 520, "width": 310, "height": 72},
            {"item_type": "label", "label": "Свободный проход", "x": 745, "y": 260, "width": 210, "height": 56},
        ])
    elif variant == "art":
        decor.extend([
            {"item_type": "label", "label": "Арт-стена", "x": 95, "y": 70, "width": 305, "height": 95},
            {"item_type": "bar", "label": "Бар", "x": 845, "y": 90, "width": 250, "height": 92},
            {"item_type": "window", "label": "Высокие окна", "x": 430, "y": 54, "width": 310, "height": 34},
            {"item_type": "column", "label": "Колонна", "x": 585, "y": 300, "width": 60, "height": 60},
        ])
    elif variant == "geek":
        decor.extend([
            {"item_type": "label", "label": "Игровая полка", "x": 805, "y": 86, "width": 250, "height": 75},
            {"item_type": "bar", "label": "Бар", "x": 870, "y": 215, "width": 220, "height": 80},
            {"item_type": "window", "label": "Окна", "x": 150, "y": 54, "width": 425, "height": 34},
            {"item_type": "sofa", "label": "Командная зона", "x": 70, "y": 535, "width": 330, "height": 72},
        ])
    elif variant == "steak":
        decor.extend([
            {"item_type": "bar", "label": "Барная стойка", "x": 870, "y": 78, "width": 240, "height": 92},
            {"item_type": "window", "label": "Окна", "x": 245, "y": 54, "width": 390, "height": 34},
            {"item_type": "sofa", "label": "Кожаный диван", "x": 70, "y": 520, "width": 345, "height": 72},
            {"item_type": "column", "label": "Колонна", "x": 640, "y": 320, "width": 62, "height": 62},
        ])
    else:
        if has_bar:
            decor.append({"item_type": "bar", "label": "Бар", "x": 880, "y": 82, "width": 225, "height": 86})
        decor.extend([
            {"item_type": "window", "label": "Окна", "x": 245, "y": 54, "width": 470, "height": 34},
            {"item_type": "sofa", "label": "Диванная зона", "x": 72, "y": 520, "width": 330, "height": 72},
            {"item_type": "column", "label": "Колонна", "x": 655, "y": 300, "width": 62, "height": 62},
        ])

    if hall_index > 0:
        decor.append({"item_type": "label", "label": "Тихая зона", "x": 470, "y": 92, "width": 210, "height": 58})
    return decor


def determine_variant(venue: Venue) -> str:
    slug_variant = VENUE_VARIANT_BY_SLUG.get(venue.slug)
    if slug_variant:
        return slug_variant
    if venue.venue_theme == "panoramic":
        return "panorama"
    if venue.venue_theme == "live_music":
        return "stage"
    if venue.venue_theme == "art":
        return "art"
    if venue.venue_theme == "geek":
        return "geek"
    if venue.venue_theme == "fast_casual":
        return "compact"
    if venue.venue_theme == "lounge":
        return "loft"
    if "стейк" in (venue.cuisine or "").lower():
        return "steak"
    return "classic"


def has_bar_for(venue: Venue, variant: str) -> bool:
    if variant == "compact" and venue.venue_theme == "fast_casual":
        return False
    return True


def table_dimensions(table):
    seats = int(table.seats_count or 2)
    if seats >= 8:
        return 190, 130
    if seats >= 6:
        return 170, 122
    if seats >= 4:
        return 138, 116
    return 110, 106


class Command(BaseCommand):
    help = "Обновляет демонстрационные схемы залов: стены, окна, бар/касса, санузел и аккуратная посадка столов."

    @transaction.atomic
    def handle(self, *args, **options):
        venues = (
            Venue.objects
            .filter(status=Venue.Status.ACTIVE, is_published=True)
            .prefetch_related("halls__tables")
            .order_by("name")
        )
        updated_venues = 0
        updated_halls = 0
        updated_tables = 0

        for venue in venues:
            if venue.slug in PRESERVED_VENUE_SLUGS:
                self.stdout.write(f"[layouts] skipped manual layout: {venue.slug}")
                continue

            variant = determine_variant(venue)
            has_bar = has_bar_for(venue, variant)
            venue_touched = False

            for hall_index, hall in enumerate(venue.halls.filter(is_active=True).order_by("sort_order", "name")):
                layout, _ = TableLayout.objects.update_or_create(
                    hall=hall,
                    defaults={"canvas_width": 1200, "canvas_height": 800, "is_active": True},
                )

                LayoutDecorItem.objects.filter(layout=layout).delete()
                for decor in decor_for_variant(variant, has_bar=has_bar, hall_index=hall_index):
                    LayoutDecorItem.objects.create(layout=layout, **decor)

                positions = TABLE_POSITIONS.get(variant, TABLE_POSITIONS["classic"])
                tables = list(hall.tables.filter(is_active=True).order_by("name"))
                for index, table in enumerate(tables):
                    if index < len(positions):
                        x, y, width, height, rotation = positions[index]
                    else:
                        width, height = table_dimensions(table)
                        x = 120 + ((index % 4) * 210)
                        y = 140 + ((index // 4) * 175)
                        rotation = 0
                    if index < len(positions):
                        default_width, default_height = table_dimensions(table)
                        width = max(width, default_width)
                        height = max(height, default_height)
                    TableLayoutItem.objects.update_or_create(
                        layout=layout,
                        table=table,
                        defaults={"x": x, "y": y, "width": width, "height": height, "rotation": rotation},
                    )
                    updated_tables += 1

                updated_halls += 1
                venue_touched = True

            if venue_touched:
                updated_venues += 1

        self.stdout.write(self.style.SUCCESS(
            f"[layouts] updated venues={updated_venues}, halls={updated_halls}, tables={updated_tables}"
        ))
