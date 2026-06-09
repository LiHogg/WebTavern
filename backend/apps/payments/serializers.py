from rest_framework import serializers

from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    confirmation_url = serializers.SerializerMethodField()
    checkout_mode = serializers.SerializerMethodField()
    is_demo = serializers.SerializerMethodField()
    booking_status = serializers.CharField(source='booking.status', read_only=True)
    venue_name = serializers.CharField(source='booking.venue.name', read_only=True)
    venue_slug = serializers.CharField(source='booking.venue.slug', read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "booking",
            "booking_status",
            "venue_name",
            "venue_slug",
            "provider",
            "status",
            "amount",
            "currency",
            "provider_payment_id",
            "raw_payload",
            "confirmation_url",
            "checkout_mode",
            "is_demo",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_confirmation_url(self, obj):
        return obj.raw_payload.get("confirmation_url")


    def get_checkout_mode(self, obj):
        payload = obj.raw_payload or {}
        if payload.get("mode"):
            return payload.get("mode")
        if payload.get("confirmation_url"):
            return "redirect"
        return "unknown"

    def get_is_demo(self, obj):
        payload = obj.raw_payload or {}
        return payload.get("mode") == "stub"
