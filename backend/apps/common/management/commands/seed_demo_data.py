from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.booking_rules.models import BookingPriceRule, VenueBookingRule
from apps.bookings.models import Booking, BookingStatusHistory
from apps.common.demo_seed import DEMO_LEGAL_ENTITIES, DEMO_PASSWORD, DEMO_USERS, DEMO_VENUES
from apps.halls.models import Hall
from apps.layouts.models import LayoutDecorItem, TableLayout, TableLayoutItem
from apps.notifications.models import Notification
from apps.organizations.models import LegalEntity
from apps.payments.models import Payment
from apps.reviews.models import Review
from apps.tables.models import Table
from apps.users.models import User
from apps.venues.models import Venue, VenueBranding, VenueImage, VenueManagerAssignment
from apps.waitlist.models import WaitlistEntry


class Command(BaseCommand):
    help = "Создаёт лёгкий демонстрационный набор данных для локального запуска проекта."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-demo",
            action="store_true",
            help="Удалить ранее созданные демо-данные по e-mail webtavern.local и создать заново.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset_demo"]:
            self._reset_demo_data()

        users = self._seed_users()
        legal_entities = self._seed_legal_entities(users)
        context = self._seed_venues(users, legal_entities)
        self._seed_venue_images(context)
        self._seed_bookings(context)
        self._seed_reviews(context)
        self._seed_notifications(users, context)
        self._seed_waitlist(context)

        self.stdout.write(self.style.SUCCESS("Демо-данные успешно созданы."))
        self.stdout.write("\nТестовые аккаунты:")
        for user in DEMO_USERS:
            self.stdout.write(f"- {user['role']}: {user['email']} / {DEMO_PASSWORD}")

    def _reset_demo_data(self):
        demo_emails = [item["email"] for item in DEMO_USERS]
        demo_users = list(User.objects.filter(email__in=demo_emails))
        if not demo_users:
            return
        demo_user_ids = [user.id for user in demo_users]
        VenueManagerAssignment.objects.filter(manager_id__in=demo_user_ids).delete()
        User.objects.filter(id__in=demo_user_ids).delete()
        self.stdout.write(self.style.WARNING("Старые demo-аккаунты и связанные записи удалены."))

    def _seed_users(self):
        users = {}
        for data in DEMO_USERS:
            defaults = {
                "phone": data["phone"],
                "first_name": data["first_name"],
                "last_name": data["last_name"],
                "middle_name": data["middle_name"],
                "role": data["role"],
                "account_type": data["account_type"],
                "date_of_birth": date.fromisoformat(data["date_of_birth"]),
                "city": data.get("city", ""),
                "is_staff": data["is_staff"],
                "is_active": True,
                "is_superuser": data["role"] == "platform_admin",
            }
            user, created = User.objects.get_or_create(email=data["email"], defaults=defaults)
            changed = False
            for field, value in defaults.items():
                if getattr(user, field) != value:
                    setattr(user, field, value)
                    changed = True
            if created or not user.check_password(DEMO_PASSWORD):
                user.set_password(DEMO_PASSWORD)
                changed = True
            if changed:
                user.save()
            users[data["key"]] = user
        return users

    def _seed_legal_entities(self, users):
        entities = {}
        for data in DEMO_LEGAL_ENTITIES:
            entity, _ = LegalEntity.objects.update_or_create(
                owner=users[data["owner"]],
                company_name=data["company_name"],
                defaults={
                    "tax_number": data["tax_number"],
                    "registration_number": data["registration_number"],
                    "legal_address": data["legal_address"],
                    "is_active": True,
                },
            )
            entities[data["key"]] = entity
        return entities

    def _seed_venues(self, users, legal_entities):
        halls = {}
        tables = {}
        venues = {}
        for venue_data in DEMO_VENUES:
            venue, _ = Venue.objects.update_or_create(
                slug=venue_data["slug"],
                defaults={
                    "owner": users[venue_data["owner"]],
                    "legal_entity": legal_entities.get(venue_data["legal_entity"]),
                    "name": venue_data["name"],
                    "country": venue_data.get("country", "Россия"),
                    "city": venue_data["city"],
                    "district": venue_data.get("district", ""),
                    "address": venue_data["address"],
                    "latitude": venue_data.get("latitude"),
                    "longitude": venue_data.get("longitude"),
                    "cuisine": venue_data.get("cuisine", ""),
                    "price_category": venue_data.get("price_category", Venue.PriceCategory.MIDDLE),
                    "venue_theme": venue_data.get("venue_theme", Venue.Theme.FAMILY),
                    "short_description": venue_data["short_description"],
                    "description": venue_data["description"],
                    "status": venue_data["status"],
                    "average_rating": venue_data["average_rating"],
                    "is_published": venue_data["is_published"],
                },
            )
            venues[venue_data["key"]] = venue
            VenueBranding.objects.update_or_create(
                venue=venue,
                defaults=venue_data["branding"],
            )
            VenueBookingRule.objects.update_or_create(
                venue=venue,
                defaults=venue_data["booking_rule"],
            )
            for manager_key in venue_data.get("manager_keys", []):
                VenueManagerAssignment.objects.update_or_create(
                    venue=venue,
                    manager=users[manager_key],
                    defaults={"is_active": True},
                )
            for hall_data in venue_data.get("halls", []):
                hall, _ = Hall.objects.update_or_create(
                    venue=venue,
                    name=hall_data["name"],
                    defaults={
                        "description": hall_data["description"],
                        "capacity": hall_data["capacity"],
                        "is_active": True,
                        "sort_order": hall_data["sort_order"],
                    },
                )
                halls[hall_data["key"]] = hall
                layout, _ = TableLayout.objects.update_or_create(
                    hall=hall,
                    defaults={
                        "canvas_width": hall_data["layout"]["canvas_width"],
                        "canvas_height": hall_data["layout"]["canvas_height"],
                        "is_active": True,
                    },
                )
                for table_data in hall_data.get("tables", []):
                    table, _ = Table.objects.update_or_create(
                        hall=hall,
                        name=table_data["name"],
                        defaults={
                            "seats_count": table_data["seats_count"],
                            "is_active": True,
                            "is_combinable": table_data["is_combinable"],
                            "note": "Демо-стол для первичного наполнения.",
                        },
                    )
                    tables[table_data["key"]] = table
                    TableLayoutItem.objects.update_or_create(
                        layout=layout,
                        table=table,
                        defaults={
                            "x": table_data["x"],
                            "y": table_data["y"],
                            "width": table_data.get("width", 120),
                            "height": table_data.get("height", 120),
                            "rotation": table_data.get("rotation", 0),
                        },
                    )
                if hall_data.get("decor_items"):
                    LayoutDecorItem.objects.filter(layout=layout).delete()
                    for decor in hall_data["decor_items"]:
                        LayoutDecorItem.objects.create(
                            layout=layout,
                            item_type=decor["item_type"],
                            label=decor.get("label", ""),
                            x=decor["x"],
                            y=decor["y"],
                            width=decor.get("width", 120),
                            height=decor.get("height", 40),
                            rotation=decor.get("rotation", 0),
                        )

            active_halls = list(venue.halls.filter(is_active=True).order_by("sort_order", "name"))
            BookingPriceRule.objects.update_or_create(
                venue=venue,
                rule_type=BookingPriceRule.RuleType.TABLE_COUNT,
                table_count=1,
                hall=None,
                defaults={"title": "Бронь одного стола", "price_amount": Decimal("600"), "price_currency": "RUB", "description": "Демо-правило стоимости для одного стола", "is_active": True},
            )
            BookingPriceRule.objects.update_or_create(
                venue=venue,
                rule_type=BookingPriceRule.RuleType.TABLE_COUNT,
                table_count=2,
                hall=None,
                defaults={"title": "Два стола выгоднее", "price_amount": Decimal("1100"), "price_currency": "RUB", "description": "Демо-правило стоимости для двух столов", "is_active": True},
            )
            if active_halls:
                BookingPriceRule.objects.update_or_create(
                    venue=venue,
                    rule_type=BookingPriceRule.RuleType.WHOLE_HALL,
                    hall=active_halls[0],
                    defaults={"title": f"Зал «{active_halls[0].name}» целиком", "table_count": None, "price_amount": Decimal("3500"), "price_currency": "RUB", "description": "Демо-стоимость брони целого зала", "is_active": True},
                )
        return {"users": users, "venues": venues, "halls": halls, "tables": tables}


    def _seed_venue_images(self, context):
        """Создаёт локальные демонстрационные изображения для части заведений."""
        venues = context["venues"]
        demo_specs = [
            ("north_harbor", ["Зал у воды", "Вечерняя посадка"], (37, 99, 235), (15, 23, 42)),
            ("pixel_sakura", ["Игровой зал", "Неоновая зона"], (124, 58, 237), (17, 24, 39)),
            ("aurora_moscow", ["Панорамный зал", "Деловой ужин"], (14, 165, 233), (30, 41, 59)),
            ("city_cafe_dzerzhinsk", ["Светлый зал", "Окна и кофе"], (217, 119, 6), (255, 247, 237)),
            ("literary_cafe_spb", ["Классический зал", "Вечер у окна"], (120, 53, 15), (254, 243, 199)),
            ("everjazz_ekb", ["Сцена", "Музыкальный вечер"], (190, 24, 93), (31, 41, 55)),
            ("seaside_vladivostok", ["Вид на бухту", "Морская зона"], (8, 145, 178), (240, 253, 250)),
            ("sevastopol_harbor", ["Терраса", "Южный вечер"], (22, 163, 74), (240, 253, 244)),
        ]
        media_dir = Path(settings.MEDIA_ROOT) / 'venues' / 'demo'
        media_dir.mkdir(parents=True, exist_ok=True)

        for venue_key, titles, primary, secondary in demo_specs:
            venue = venues.get(venue_key)
            if not venue:
                continue
            has_any_image = venue.images.exists()
            for index, title in enumerate(titles, start=1):
                relative_path = f'venues/demo/{venue.slug}-{index}.svg'
                file_path = Path(settings.MEDIA_ROOT) / relative_path
                if not file_path.exists():
                    file_path.write_text(self._demo_svg(venue.name, title, primary, secondary, index), encoding='utf-8')
                image, created = VenueImage.objects.get_or_create(
                    venue=venue,
                    image=relative_path,
                    defaults={
                        'alt_text': f'{venue.name}: {title.lower()}',
                        'is_cover': index == 1 and not has_any_image,
                    },
                )
                if created and image.is_cover:
                    VenueImage.objects.filter(venue=venue).exclude(id=image.id).update(is_cover=False)

    def _demo_svg(self, venue_name, title, primary, secondary, index):
        p = '#%02x%02x%02x' % primary
        s = '#%02x%02x%02x' % secondary
        text_color = '#ffffff' if index % 2 else '#111827'
        overlay = 'rgba(15, 23, 42, 0.52)' if text_color == '#ffffff' else 'rgba(255, 255, 255, 0.66)'
        venue_safe = str(venue_name).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        title_safe = str(title).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return '''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="760" viewBox="0 0 1280 760" role="img" aria-label="{venue}: {title}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{p}"/>
      <stop offset="1" stop-color="{s}"/>
    </linearGradient>
    <radialGradient id="light" cx="70%" cy="20%" r="65%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="760" fill="url(#g)"/>
  <rect width="1280" height="760" fill="url(#light)"/>
  <g opacity="0.18" fill="#ffffff">
    <circle cx="180" cy="170" r="92"/>
    <circle cx="1110" cy="590" r="130"/>
    <rect x="710" y="120" width="410" height="230" rx="42"/>
    <rect x="110" y="470" width="520" height="170" rx="40"/>
  </g>
  <rect x="80" y="90" width="1120" height="580" rx="46" fill="{overlay}"/>
  <text x="130" y="325" font-family="Arial, Helvetica, sans-serif" font-size="66" font-weight="700" fill="{text_color}">{venue}</text>
  <text x="132" y="405" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="500" fill="{text_color}" opacity="0.88">{title}</text>
  <text x="132" y="505" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="{text_color}" opacity="0.72">Демонстрационная фотография для каталога WebTavern</text>
</svg>'''.format(venue=venue_safe, title=title_safe, p=p, s=s, overlay=overlay, text_color=text_color)

    def _seed_bookings(self, context):
        users = context["users"]
        venues = context["venues"]
        halls = context["halls"]
        tables = context["tables"]

        now = timezone.localtime()
        current_booking_start = (now - timedelta(minutes=25)).replace(second=0, microsecond=0)
        base_start = (now + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)

        scenarios = [
            {
                "key": "booking_current",
                "customer": users["client_main"],
                "venue": venues["north_harbor"],
                "hall": halls["north_main_hall"],
                "table": tables["north_t2"],
                "guests_count": 2,
                "booking_start": current_booking_start,
                "duration_minutes": 90,
                "status": Booking.Status.CONFIRMED,
                "payment": {"status": Payment.Status.SUCCEEDED, "amount": Decimal("600.00")},
                "history": [
                    (Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, users["manager_main"], "Подтверждена менеджером"),
                    (Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.CONFIRMED, users["manager_main"], "Посадка подтверждена менеджером"),
                ],
            },
            {
                "key": "booking_paid",
                "customer": users["client_main"],
                "venue": venues["north_harbor"],
                "hall": halls["north_main_hall"],
                "table": tables["north_t3"],
                "guests_count": 4,
                "booking_start": base_start.replace(hour=19),
                "duration_minutes": 60,
                "status": Booking.Status.PAID,
                "payment": {"status": Payment.Status.SUCCEEDED, "amount": Decimal("600.00")},
                "history": [
                    (Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, users["manager_main"], "Подтверждена менеджером"),
                    (Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.PAID, users["client_main"], "Клиент успешно оплатил бронь"),
                ],
            },
            {
                "key": "booking_wait_payment",
                "customer": users["client_legal"],
                "venue": venues["north_harbor"],
                "hall": halls["north_lounge"],
                "table": tables["north_l1"],
                "guests_count": 3,
                "booking_start": base_start.replace(hour=21),
                "duration_minutes": 90,
                "status": Booking.Status.WAITING_FOR_PAYMENT,
                "payment": {"status": Payment.Status.PENDING, "amount": Decimal("600.00")},
                "history": [
                    (Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, users["manager_main"], "Ожидаем внесения предоплаты"),
                ],
            },
            {
                "key": "booking_pending",
                "customer": users["client_main"],
                "venue": venues["pixel_sakura"],
                "hall": halls["pixel_event"],
                "table": tables["pixel_e1"],
                "guests_count": 2,
                "booking_start": base_start.replace(hour=18) + timedelta(days=1),
                "duration_minutes": 90,
                "status": Booking.Status.PENDING_CONFIRMATION,
                "payment": None,
                "history": [],
            },
            {
                "key": "booking_cancelled",
                "customer": users["client_legal"],
                "venue": venues["north_harbor"],
                "hall": halls["north_main_hall"],
                "table": tables["north_t4"],
                "guests_count": 5,
                "booking_start": base_start.replace(hour=16) + timedelta(days=2),
                "duration_minutes": 60,
                "status": Booking.Status.CANCELLED,
                "payment": {"status": Payment.Status.CANCELLED, "amount": Decimal("600.00")},
                "history": [
                    (Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, users["manager_main"], "Подтверждена менеджером"),
                    (Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.CANCELLED, users["client_legal"], "Клиент отменил бронь"),
                ],
            },
            {
                "key": "booking_completed",
                "customer": users["client_main"],
                "venue": venues["north_harbor"],
                "hall": halls["north_lounge"],
                "table": tables["north_l2"],
                "guests_count": 4,
                "booking_start": (now - timedelta(days=3)).replace(hour=18, minute=0, second=0, microsecond=0),
                "duration_minutes": 90,
                "status": Booking.Status.COMPLETED,
                "payment": {"status": Payment.Status.SUCCEEDED, "amount": Decimal("600.00")},
                "history": [
                    (Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, users["manager_main"], "Подтверждена менеджером"),
                    (Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.PAID, users["client_main"], "Клиент успешно оплатил бронь"),
                    (Booking.Status.PAID, Booking.Status.COMPLETED, users["manager_main"], "Посещение завершено"),
                ],
            },
        ]

        for scenario in scenarios:
            booking_end = scenario["booking_start"] + timedelta(minutes=scenario["duration_minutes"])
            hold_expires_at = None
            if scenario["status"] in {Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT}:
                hold_expires_at = timezone.now() + timedelta(minutes=30)
            booking, _ = Booking.objects.update_or_create(
                customer=scenario["customer"],
                venue=scenario["venue"],
                hall=scenario["hall"],
                table=scenario["table"],
                booking_start=scenario["booking_start"],
                defaults={
                    "booking_end": booking_end,
                    "guests_count": scenario["guests_count"],
                    "hold_expires_at": hold_expires_at,
                    "status": scenario["status"],
                    "customer_comment": "Демо-запись для первичного наполнения.",
                    "manager_comment": "Создано командой seed_demo_data.",
                },
            )
            BookingStatusHistory.objects.filter(booking=booking).delete()
            for old_status, new_status, changed_by, reason in scenario["history"]:
                BookingStatusHistory.objects.create(
                    booking=booking,
                    old_status=old_status,
                    new_status=new_status,
                    changed_by=changed_by,
                    reason=reason,
                )
            payment_data = scenario.get("payment")
            if payment_data:
                Payment.objects.update_or_create(
                    booking=booking,
                    defaults={
                        "provider": Payment.Provider.YOOKASSA,
                        "status": payment_data["status"],
                        "amount": payment_data["amount"],
                        "currency": "RUB",
                        "provider_payment_id": f"demo-{scenario['key']}",
                        "idempotence_key": f"demo-{scenario['key']}",
                        "raw_payload": {"seed": True, "scenario": scenario["key"]},
                    },
                )
            else:
                Payment.objects.filter(booking=booking).delete()


    def _seed_reviews(self, context):
        users = context["users"]
        venues = context["venues"]

        review_specs = [
            {
                "venue": venues.get("north_harbor"),
                "author": users["client_main"],
                "rating": 5,
                "text": "Удобно выбрал стол на схеме, бронь быстро подтвердили, а интерьер действительно совпадает с карточкой заведения.",
                "likes": [users["client_legal"]],
                "reply": "Спасибо! Мы как раз добивались, чтобы схема и реальный зал совпадали без сюрпризов.",
            },
            {
                "venue": venues.get("north_harbor"),
                "author": users["client_legal"],
                "rating": 4,
                "text": "Понравилась возможность сразу увидеть занятость столов по времени. Хотелось бы чуть больше десертов в меню.",
                "likes": [users["client_main"]],
                "reply": "Учли замечание про десерты и уже расширяем вечернее меню. Спасибо за отзыв!",
            },
            {
                "venue": venues.get("aurora_moscow"),
                "author": users["client_main"],
                "rating": 5,
                "text": "Отличный вариант для делового ужина, удобно что видно район, кухню и расстояние прямо в каталоге.",
                "likes": [],
                "reply": None,
            },
        ]

        for item in review_specs:
            venue = item.get("venue")
            if venue is None:
                continue
            review, _ = Review.objects.update_or_create(
                venue=venue,
                author=item["author"],
                parent=None,
                text=item["text"],
                defaults={
                    "rating": item["rating"],
                    "is_visible": True,
                },
            )
            review.likes.set(item.get("likes", []))
            if item.get("reply"):
                Review.objects.update_or_create(
                    venue=venue,
                    author=users["manager_main"],
                    parent=review,
                    text=item["reply"],
                    defaults={"rating": None, "is_visible": True},
                )

        for venue in Venue.objects.all():
            top_level = venue.reviews.filter(parent__isnull=True, is_visible=True)
            if top_level.exists():
                venue.average_rating = sum((r.rating or 0) for r in top_level) / top_level.count()
                venue.save(update_fields=["average_rating", "updated_at"])

    def _seed_notifications(self, users, context):
        venues = context["venues"]
        notifications = [
            {
                "recipient": users["manager_main"],
                "venue": venues.get("pixel_sakura"),
                "channel": Notification.Channel.IN_APP,
                "title": "Новая бронь требует подтверждения",
                "message": "В Pixel Sakura появилась новая бронь, ожидающая ответа менеджера.",
                "event_type": "booking_created",
                "target_url": "/manager/",
            },
            {
                "recipient": users["client_main"],
                "venue": venues.get("north_harbor"),
                "channel": Notification.Channel.EMAIL,
                "title": "Бронь подтверждена",
                "message": "Ваша бронь в North Harbor подтверждена и ожидает внесения предоплаты.",
                "event_type": "booking_confirmed",
                "target_url": "/account/",
            },
            {
                "recipient": users["client_legal"],
                "venue": venues.get("north_harbor"),
                "channel": Notification.Channel.BROWSER,
                "title": "Статус оплаты обновлён",
                "message": "Проверьте оплату брони в личном кабинете юридического клиента.",
                "event_type": "payment_updated",
                "target_url": "/account/payments/",
            },
        ]
        for data in notifications:
            Notification.objects.update_or_create(
                recipient=data["recipient"],
                channel=data["channel"],
                title=data["title"],
                defaults={
                    "venue": data.get("venue"),
                    "message": data["message"],
                    "event_type": data.get("event_type", ""),
                    "target_url": data.get("target_url", ""),
                    "is_read": False,
                },
            )

    def _seed_waitlist(self, context):
        WaitlistEntry.objects.get_or_create(
            customer=context["users"]["client_main"],
            venue=context["venues"]["north_harbor"],
            desired_date=timezone.localdate() + timedelta(days=3),
            desired_time=time(hour=20, minute=30),
            defaults={
                "guests_count": 4,
                "is_active": True,
            },
        )
