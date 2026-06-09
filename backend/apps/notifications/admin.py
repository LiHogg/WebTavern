from django.contrib import admin

from .models import BrowserPushSubscription, Notification, NotificationDelivery, NotificationPreference


class NotificationDeliveryInline(admin.TabularInline):
    model = NotificationDelivery
    extra = 0
    readonly_fields = ('recipient', 'channel', 'status', 'provider', 'destination', 'provider_message_id', 'error', 'sent_at', 'created_at')
    can_delete = False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'venue', 'channel', 'title', 'event_type', 'is_read', 'created_at')
    list_filter = ('channel', 'event_type', 'is_read')
    search_fields = ('title', 'message', 'recipient__email', 'recipient__phone', 'venue__name')
    inlines = [NotificationDeliveryInline]


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'email_enabled', 'sms_enabled', 'booking_email_enabled', 'booking_sms_enabled', 'marketing_enabled')
    list_filter = ('email_enabled', 'sms_enabled', 'booking_email_enabled', 'booking_sms_enabled', 'marketing_enabled')
    search_fields = ('user__email', 'user__phone')


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'channel', 'status', 'provider', 'destination', 'sent_at', 'created_at')
    list_filter = ('channel', 'status', 'provider')
    search_fields = ('recipient__email', 'recipient__phone', 'destination', 'notification__title', 'error')
    readonly_fields = ('notification', 'recipient', 'channel', 'status', 'provider', 'destination', 'provider_message_id', 'error', 'sent_at', 'created_at', 'updated_at')


@admin.register(BrowserPushSubscription)
class BrowserPushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'endpoint', 'created_at')
