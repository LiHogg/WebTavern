from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.booking_rules.models import VenueBookingRule
from apps.booking_rules.pricing import calculate_booking_price
from apps.halls.models import Hall
from apps.tables.models import Table
from apps.venues.models import Venue

from .models import Booking, BookingStatusHistory
from .utils import booking_required_payment_amount, final_status_for_new_booking, has_any_booking_overlap, has_booking_overlap, payment_deadline_for_booking


class BookingStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_email = serializers.EmailField(source="changed_by.email", read_only=True)

    class Meta:
        model = BookingStatusHistory
        fields = ["id", "old_status", "new_status", "changed_by", "changed_by_email", "reason", "created_at"]


class BookingSerializer(serializers.ModelSerializer):
    status_history = BookingStatusHistorySerializer(many=True, read_only=True)
    venue_name = serializers.CharField(source="venue.name", read_only=True)
    venue_slug = serializers.SlugField(source="venue.slug", read_only=True)
    hall_name = serializers.CharField(source="hall.name", read_only=True)
    table_name = serializers.CharField(source="table.name", read_only=True)
    table_ids = serializers.SerializerMethodField()
    table_names = serializers.SerializerMethodField()
    tables_summary = serializers.SerializerMethodField()
    total_seats_count = serializers.SerializerMethodField()
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_full_name = serializers.SerializerMethodField()
    table_seats_count = serializers.IntegerField(source="table.seats_count", read_only=True)
    payment_status = serializers.SerializerMethodField()
    payment_provider = serializers.SerializerMethodField()
    payment_amount = serializers.SerializerMethodField()
    payment_currency = serializers.SerializerMethodField()
    required_deposit_amount = serializers.SerializerMethodField()
    required_deposit_currency = serializers.SerializerMethodField()
    can_manager_reschedule = serializers.SerializerMethodField()
    cancelled_without_penalty = serializers.BooleanField(read_only=True)
    cancellation_penalty_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cancellation_penalty_currency = serializers.CharField(read_only=True)
    free_cancellation_deadline = serializers.SerializerMethodField()
    can_cancel_without_penalty = serializers.SerializerMethodField()
    min_booking_notice_minutes = serializers.SerializerMethodField()
    no_show_marked_at = serializers.DateTimeField(read_only=True)
    no_show_after_minutes = serializers.SerializerMethodField()
    payment_deadline_at = serializers.SerializerMethodField()
    payment_time_left_seconds = serializers.SerializerMethodField()
    can_pay_now = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "customer",
            "customer_email",
            "customer_phone",
            "customer_full_name",
            "venue",
            "venue_name",
            "venue_slug",
            "hall",
            "hall_name",
            "table",
            "table_name",
            "table_ids",
            "table_names",
            "tables_summary",
            "table_seats_count",
            "total_seats_count",
            "booking_type",
            "price_amount",
            "price_currency",
            "pricing_note",
            "payment_status",
            "payment_provider",
            "payment_amount",
            "payment_currency",
            "required_deposit_amount",
            "required_deposit_currency",
            "can_manager_reschedule",
            "guests_count",
            "booking_start",
            "booking_end",
            "hold_expires_at",
            "status",
            "cancelled_without_penalty",
            "cancellation_penalty_amount",
            "cancellation_penalty_currency",
            "free_cancellation_deadline",
            "can_cancel_without_penalty",
            "min_booking_notice_minutes",
            "no_show_marked_at",
            "no_show_after_minutes",
            "payment_deadline_at",
            "payment_time_left_seconds",
            "can_pay_now",
            "customer_comment",
            "manager_comment",
            "status_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "hold_expires_at",
            "status",
            "status_history",
            "created_at",
            "updated_at",
        ]

    def _selected_tables(self, obj):
        tables = []
        try:
            tables = list(obj.tables.all())
        except Exception:
            tables = []
        if obj.table_id and not any(table.id == obj.table_id for table in tables):
            tables.insert(0, obj.table)
        return tables

    def get_table_ids(self, obj):
        return [table.id for table in self._selected_tables(obj)]

    def get_table_names(self, obj):
        return [table.name for table in self._selected_tables(obj)]

    def get_tables_summary(self, obj):
        names = self.get_table_names(obj)
        return ", ".join(names) if names else getattr(obj.table, "name", "")

    def get_total_seats_count(self, obj):
        return sum(max(int(getattr(table, "seats_count", 0) or 0), 0) for table in self._selected_tables(obj))

    def get_customer_full_name(self, obj):
        parts = [obj.customer.last_name, obj.customer.first_name, obj.customer.middle_name]
        return " ".join([part for part in parts if part]).strip() or obj.customer.email

    def _payment(self, obj):
        try:
            return obj.payment
        except Exception:
            return None

    def get_payment_status(self, obj):
        payment = self._payment(obj)
        return getattr(payment, "status", None)

    def get_payment_provider(self, obj):
        payment = self._payment(obj)
        return getattr(payment, "provider", None)

    def get_payment_amount(self, obj):
        payment = self._payment(obj)
        return getattr(payment, "amount", None)

    def get_payment_currency(self, obj):
        payment = self._payment(obj)
        return getattr(payment, "currency", None)

    def get_required_deposit_amount(self, obj):
        if getattr(obj, "price_amount", 0) and obj.price_amount > 0:
            return obj.price_amount
        rule = getattr(obj.venue, "booking_rule", None)
        if not rule:
            return None
        return rule.deposit_amount

    def get_required_deposit_currency(self, obj):
        if getattr(obj, "price_amount", 0) and obj.price_amount > 0:
            return obj.price_currency or "RUB"
        rule = getattr(obj.venue, "booking_rule", None)
        if not rule:
            return None
        return rule.deposit_currency


    def get_can_manager_reschedule(self, obj):
        rule = getattr(obj.venue, "booking_rule", None)
        if not rule:
            return False
        return bool(rule.allow_manager_reschedule and obj.status not in {Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.NO_SHOW})

    def get_free_cancellation_deadline(self, obj):
        rule = getattr(obj.venue, "booking_rule", None)
        if not rule or not obj.booking_start:
            return None
        return obj.booking_start - timedelta(minutes=rule.free_cancellation_before_minutes)

    def get_can_cancel_without_penalty(self, obj):
        deadline = self.get_free_cancellation_deadline(obj)
        if not deadline:
            return True
        return timezone.now() <= deadline

    def get_min_booking_notice_minutes(self, obj):
        rule = getattr(obj.venue, "booking_rule", None)
        return getattr(rule, "min_booking_notice_minutes", None)

    def get_no_show_after_minutes(self, obj):
        rule = getattr(obj.venue, "booking_rule", None)
        return getattr(rule, "no_show_after_minutes", None)

    def get_payment_deadline_at(self, obj):
        return payment_deadline_for_booking(obj)

    def get_payment_time_left_seconds(self, obj):
        deadline = payment_deadline_for_booking(obj)
        if not deadline:
            return None
        return max(int((deadline - timezone.now()).total_seconds()), 0)

    def get_can_pay_now(self, obj):
        return bool(obj.status == Booking.Status.WAITING_FOR_PAYMENT and booking_required_payment_amount(obj) > 0)


class BookingManagerRescheduleSerializer(serializers.Serializer):
    hall = serializers.PrimaryKeyRelatedField(queryset=Hall.objects.select_related("venue").all(), required=False)
    table = serializers.PrimaryKeyRelatedField(queryset=Table.objects.select_related("hall", "hall__venue").all(), required=False)
    booking_start = serializers.DateTimeField()
    booking_end = serializers.DateTimeField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        booking = self.context["booking"]
        venue = booking.venue
        hall = attrs.get("hall") or booking.hall
        table = attrs.get("table") or booking.table
        booking_start = attrs["booking_start"]
        booking_end = attrs["booking_end"]

        if hall.venue_id != venue.id:
            raise serializers.ValidationError({"hall": "Выбранный зал не относится к заведению брони."})
        if table.hall_id != hall.id:
            raise serializers.ValidationError({"table": "Выбранный стол не относится к выбранному залу."})
        if booking_end <= booking_start:
            raise serializers.ValidationError({"booking_end": "Окончание должно быть позже начала."})
        if booking_start <= timezone.now():
            raise serializers.ValidationError({"booking_start": "Новое время должно быть в будущем."})
        rule = getattr(venue, "booking_rule", None) or VenueBookingRule.objects.get_or_create(venue=venue)[0]
        min_notice = max(int(getattr(rule, "min_booking_notice_minutes", 0) or 0), 0)
        if booking_start < timezone.now() + timedelta(minutes=min_notice):
            raise serializers.ValidationError({"booking_start": f"Новое время должно быть минимум за {min_notice} минут до визита."})
        if booking.guests_count > table.seats_count and not table.is_combinable:
            raise serializers.ValidationError({"table": "Количество гостей превышает вместимость выбранного стола."})

        if has_booking_overlap(table_id=table.id, booking_start=booking_start, booking_end=booking_end, exclude_booking_id=booking.pk):
            raise serializers.ValidationError("Выбранный стол уже занят в указанный интервал.")

        attrs["hall"] = hall
        attrs["table"] = table
        return attrs


class BookingCreateSerializer(serializers.ModelSerializer):
    tables = serializers.PrimaryKeyRelatedField(
        queryset=Table.objects.select_related("hall", "hall__venue").all(),
        many=True,
        required=False,
        allow_empty=False,
    )

    class Meta:
        model = Booking
        fields = [
            "venue",
            "hall",
            "table",
            "tables",
            "booking_type",
            "guests_count",
            "booking_start",
            "booking_end",
            "customer_comment",
        ]
        extra_kwargs = {
            "table": {"required": False, "allow_null": True},
            "booking_end": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        venue: Venue = attrs["venue"]
        hall: Hall = attrs["hall"]
        booking_type = attrs.get("booking_type") or Booking.BookingType.TABLES
        primary_table = attrs.get("table")
        selected_tables = list(attrs.get("tables") or [])

        if booking_type == Booking.BookingType.HALL:
            selected_tables = list(hall.tables.filter(is_active=True).order_by("id"))
            if not selected_tables:
                raise serializers.ValidationError({"hall": "В выбранном зале нет активных столов, поэтому забронировать зал целиком нельзя."})
            primary_table = selected_tables[0]
        else:
            if primary_table and not any(table.id == primary_table.id for table in selected_tables):
                selected_tables.insert(0, primary_table)
            # remove duplicates while preserving click order
            unique_tables = []
            seen_ids = set()
            for table in selected_tables:
                if table.id in seen_ids:
                    continue
                seen_ids.add(table.id)
                unique_tables.append(table)
            selected_tables = unique_tables
            if not selected_tables:
                raise serializers.ValidationError({"tables": "Выберите хотя бы один свободный стол или включите бронь всего зала."})
            primary_table = selected_tables[0]

        attrs["booking_type"] = booking_type
        attrs["table"] = primary_table
        attrs["tables"] = selected_tables

        booking_start = attrs["booking_start"]
        booking_end = attrs.get("booking_end")
        guests_count = attrs["guests_count"]

        if hall.venue_id != venue.id:
            raise serializers.ValidationError("Выбранный зал не относится к заведению.")
        for table in selected_tables:
            if table.hall_id != hall.id:
                raise serializers.ValidationError({"tables": f"Стол «{table.name}» не относится к выбранному залу."})
            if table.is_active is False:
                raise serializers.ValidationError({"tables": f"Стол «{table.name}» отключён и недоступен для бронирования."})
        if booking_start <= timezone.now():
            raise serializers.ValidationError("Дата и время бронирования должны быть в будущем.")

        total_capacity = sum(max(int(table.seats_count or 0), 0) for table in selected_tables)
        if guests_count > total_capacity:
            raise serializers.ValidationError(f"Количество гостей превышает суммарную вместимость выбранных столов: {total_capacity}.")

        rule = getattr(venue, "booking_rule", None) or VenueBookingRule.objects.get_or_create(venue=venue)[0]
        min_notice = max(int(getattr(rule, "min_booking_notice_minutes", 0) or 0), 0)
        if booking_start < timezone.now() + timedelta(minutes=min_notice):
            raise serializers.ValidationError(f"Бронь нужно создавать минимум за {min_notice} минут до начала визита.")
        if booking_end is None:
            attrs["booking_end"] = booking_start + timedelta(minutes=rule.default_duration_minutes + rule.cleanup_buffer_minutes)
        elif attrs["booking_end"] <= booking_start:
            raise serializers.ValidationError("Время окончания должно быть позже начала.")

        table_ids = [table.id for table in selected_tables]
        if has_any_booking_overlap(table_ids=table_ids, booking_start=booking_start, booking_end=attrs["booking_end"]):
            raise serializers.ValidationError("Один или несколько выбранных столов уже заняты в указанный интервал.")

        price = calculate_booking_price(venue=venue, hall=hall, tables=selected_tables, booking_type=booking_type)
        attrs["price_amount"] = price["amount"]
        attrs["price_currency"] = price["currency"]
        attrs["pricing_note"] = price["note"]
        attrs["hold_expires_at"] = attrs["booking_end"]
        return attrs

    def create(self, validated_data):
        selected_tables = list(validated_data.pop("tables", []) or [])
        if not selected_tables and validated_data.get("table"):
            selected_tables = [validated_data["table"]]
        validated_data["customer"] = self.context["request"].user
        validated_data["status"] = Booking.Status.HOLD
        booking = Booking.objects.create(**validated_data)
        if selected_tables:
            booking.tables.set(selected_tables)
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status="",
            new_status=booking.status,
            changed_by=self.context["request"].user,
            reason="Создана бронь в статусе hold: выбранные столы зарезервированы на выбранный слот",
        )
        return booking

class BookingHoldConfirmSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = []

    def update(self, instance, validated_data):
        rule = getattr(instance.venue, "booking_rule", None) or VenueBookingRule.objects.get_or_create(venue=instance.venue)[0]
        instance.status, reason = final_status_for_new_booking(rule, booking=instance)
        instance.hold_expires_at = None
        instance.save(update_fields=["status", "hold_expires_at", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=instance,
            old_status=Booking.Status.HOLD,
            new_status=instance.status,
            changed_by=self.context["request"].user,
            reason=reason,
        )

        return instance
