from rest_framework import serializers

from .models import ManagerActionLog


class ManagerActionLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    venue_name = serializers.CharField(source='venue.name', read_only=True)
    venue_slug = serializers.CharField(source='venue.slug', read_only=True)
    booking_status = serializers.CharField(source='booking.status', read_only=True)

    class Meta:
        model = ManagerActionLog
        fields = [
            'id', 'action', 'details', 'created_at', 'actor_name', 'venue_name', 'venue_slug', 'booking', 'booking_status'
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        actor = obj.actor
        if not actor:
            return 'Система'
        return ' '.join(part for part in [actor.first_name, actor.last_name] if part).strip() or actor.email
