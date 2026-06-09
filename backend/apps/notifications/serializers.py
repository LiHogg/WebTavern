from rest_framework import serializers

from .models import Notification, NotificationDelivery, NotificationPreference


class NotificationDeliverySerializer(serializers.ModelSerializer):
    channel_label = serializers.CharField(source='get_channel_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    notification_title = serializers.CharField(source='notification.title', read_only=True)
    notification_message = serializers.CharField(source='notification.message', read_only=True)

    class Meta:
        model = NotificationDelivery
        fields = [
            'id',
            'notification',
            'notification_title',
            'notification_message',
            'channel',
            'channel_label',
            'status',
            'status_label',
            'provider',
            'destination',
            'provider_message_id',
            'error',
            'sent_at',
            'created_at',
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            'email_enabled',
            'sms_enabled',
            'booking_email_enabled',
            'booking_sms_enabled',
            'marketing_enabled',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class NotificationSerializer(serializers.ModelSerializer):
    venue_name = serializers.CharField(source='venue.name', read_only=True)
    target_url = serializers.SerializerMethodField()
    deliveries = NotificationDeliverySerializer(many=True, read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'channel', 'event_type', 'target_url', 'venue', 'venue_name', 'is_read', 'deliveries', 'created_at']

    def get_target_url(self, obj):
        if obj.target_url:
            return obj.target_url
        event_type = obj.event_type or ''
        venue = obj.venue
        if event_type.startswith('review') and venue:
            return f'/venues/{venue.slug}/reviews/'
        if event_type.startswith('payment'):
            request = self.context.get('request')
            user = getattr(request, 'user', None)
            if getattr(user, 'is_authenticated', False) and getattr(user, 'role', '') in {'owner', 'manager', 'platform_admin'}:
                return '/manager/'
            return '/account/payments/'
        if event_type.startswith('booking'):
            request = self.context.get('request')
            user = getattr(request, 'user', None)
            if getattr(user, 'is_authenticated', False) and getattr(user, 'role', '') in {'owner', 'manager', 'platform_admin'}:
                return '/manager/'
            return '/account/'
        if venue:
            return f'/venues/{venue.slug}/'
        return '/notifications/'
