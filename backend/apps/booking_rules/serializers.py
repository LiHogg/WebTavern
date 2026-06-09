from rest_framework import serializers

from .models import BookingPriceRule, VenueBookingRule


class VenueBookingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = VenueBookingRule
        fields = [
            "id",
            "venue",
            "default_duration_minutes",
            "slot_step_minutes",
            "cleanup_buffer_minutes",
            "payment_hold_minutes",
            "min_booking_notice_minutes",
            "free_cancellation_before_minutes",
            "no_show_after_minutes",
            "requires_manager_confirmation",
            "allow_client_approximate_time",
            "allow_table_combination",
            "allow_shared_seating",
            "allow_manager_reschedule",
            "deposit_amount",
            "deposit_currency",
        ]

class BookingPriceRuleSerializer(serializers.ModelSerializer):
    hall_name = serializers.CharField(source="hall.name", read_only=True)
    rule_type_label = serializers.CharField(source="get_rule_type_display", read_only=True)

    class Meta:
        model = BookingPriceRule
        fields = [
            "id",
            "venue",
            "hall",
            "hall_name",
            "rule_type",
            "rule_type_label",
            "title",
            "table_count",
            "price_amount",
            "price_currency",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "hall_name", "rule_type_label", "created_at", "updated_at"]

    def validate(self, attrs):
        rule_type = attrs.get("rule_type", getattr(self.instance, "rule_type", BookingPriceRule.RuleType.TABLE_COUNT))
        venue = attrs.get("venue", getattr(self.instance, "venue", None))
        hall = attrs.get("hall", getattr(self.instance, "hall", None))
        table_count = attrs.get("table_count", getattr(self.instance, "table_count", None))
        if hall and venue and hall.venue_id != venue.id:
            raise serializers.ValidationError({"hall": "Зал не относится к выбранному заведению."})
        if rule_type == BookingPriceRule.RuleType.WHOLE_HALL:
            if not hall:
                raise serializers.ValidationError({"hall": "Для брони целого зала выберите зал."})
            attrs["table_count"] = None
        if rule_type == BookingPriceRule.RuleType.TABLE_COUNT:
            if not table_count or int(table_count) < 1:
                raise serializers.ValidationError({"table_count": "Для правила по столам укажите количество столов от 1."})
            attrs["hall"] = None
        return attrs

