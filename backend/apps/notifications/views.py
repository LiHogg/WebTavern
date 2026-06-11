from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from .models import Notification, NotificationDelivery
from .serializers import NotificationDeliverySerializer, NotificationPreferenceSerializer, NotificationSerializer
from .services import create_notification, get_notification_preference


def _mask_value(value: str) -> str:
    value = str(value or '').strip()
    if not value:
        return ''
    if len(value) <= 8:
        return '*' * len(value)
    return f'{value[:4]}...{value[-4:]}'


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user).select_related('venue').prefetch_related('deliveries')
        is_read = self.request.query_params.get('is_read')
        event_type = self.request.query_params.get('event_type')
        venue_id = self.request.query_params.get('venue')
        q = self.request.query_params.get('q')
        if is_read in {'true', 'false'}:
            queryset = queryset.filter(is_read=(is_read == 'true'))
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        if q:
            queryset = queryset.filter(Q(title__icontains=q) | Q(message__icontains=q))
        return queryset

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        unread_total = queryset.filter(is_read=False).count()
        today_total = queryset.filter(created_at__date=timezone.localdate()).count()
        all_total = queryset.count()
        by_type = list(queryset.values('event_type').annotate(total=Count('id')).order_by('-total'))
        deliveries = NotificationDelivery.objects.filter(recipient=request.user)
        delivery_summary = {
            'email_sent': deliveries.filter(channel=NotificationDelivery.Channel.EMAIL, status=NotificationDelivery.Status.SENT).count(),
            'email_failed': deliveries.filter(channel=NotificationDelivery.Channel.EMAIL, status=NotificationDelivery.Status.FAILED).count(),
            'sms_sent': deliveries.filter(channel=NotificationDelivery.Channel.SMS, status=NotificationDelivery.Status.SENT).count(),
            'sms_failed': deliveries.filter(channel=NotificationDelivery.Channel.SMS, status=NotificationDelivery.Status.FAILED).count(),
        }
        return response.Response({
            'unread_total': unread_total,
            'today_total': today_total,
            'all_total': all_total,
            'by_type': by_type,
            'deliveries': delivery_summary,
        })

    @decorators.action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read', 'updated_at'])
        return response.Response(NotificationSerializer(notification, context={'request': request}).data)

    @decorators.action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return response.Response({'detail': 'Все уведомления отмечены как прочитанные.'})

    @decorators.action(detail=False, methods=['get', 'patch'], url_path='preferences')
    def preferences(self, request):
        preference = get_notification_preference(request.user)
        if request.method.lower() == 'patch':
            serializer = NotificationPreferenceSerializer(preference, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return response.Response(serializer.data)
        return response.Response(NotificationPreferenceSerializer(preference).data)

    @decorators.action(detail=False, methods=['get'], url_path='deliveries')
    def deliveries(self, request):
        queryset = NotificationDelivery.objects.filter(recipient=request.user).select_related('notification').order_by('-created_at')[:30]
        return response.Response(NotificationDeliverySerializer(queryset, many=True).data)

    @decorators.action(detail=False, methods=['get'], url_path='diagnostics')
    def diagnostics(self, request):
        preference = get_notification_preference(request.user)
        deliveries = NotificationDelivery.objects.filter(recipient=request.user).select_related('notification').order_by('-created_at')[:10]
        return response.Response({
            'project': {
                'email_enabled': bool(getattr(settings, 'ENABLE_EMAIL_NOTIFICATIONS', False)),
                'email_backend': str(getattr(settings, 'EMAIL_BACKEND', '') or ''),
                'email_host': str(getattr(settings, 'EMAIL_HOST', '') or ''),
                'email_port': getattr(settings, 'EMAIL_PORT', ''),
                'email_user': str(getattr(settings, 'EMAIL_HOST_USER', '') or ''),
                'email_password_set': bool(getattr(settings, 'EMAIL_HOST_PASSWORD', '')),
                'email_use_ssl': bool(getattr(settings, 'EMAIL_USE_SSL', False)),
                'email_use_tls': bool(getattr(settings, 'EMAIL_USE_TLS', False)),
                'default_from_email': str(getattr(settings, 'DEFAULT_FROM_EMAIL', '') or ''),
                'email_recipient_override': str(getattr(settings, 'EMAIL_RECIPIENT_OVERRIDE', '') or ''),
                'sms_enabled': bool(getattr(settings, 'ENABLE_SMS_NOTIFICATIONS', False)),
                'sms_provider': str(getattr(settings, 'SMS_PROVIDER', '') or ''),
                'smsru_api_id_set': bool(getattr(settings, 'SMSRU_API_ID', '')),
                'smsru_api_id_masked': _mask_value(getattr(settings, 'SMSRU_API_ID', '')),
                'sms_from': str(getattr(settings, 'SMS_FROM', '') or ''),
                'sms_ru_use_sender': bool(getattr(settings, 'SMS_RU_USE_SENDER', False)),
                'sms_max_length': getattr(settings, 'SMS_MAX_LENGTH', ''),
                'public_site_url': str(getattr(settings, 'PUBLIC_SITE_URL', '') or ''),
            },
            'user': {
                'email': getattr(request.user, 'email', '') or '',
                'phone': getattr(request.user, 'phone', '') or '',
                'has_email': bool(getattr(request.user, 'email', '') or ''),
                'has_phone': bool(getattr(request.user, 'phone', '') or ''),
            },
            'preferences': NotificationPreferenceSerializer(preference).data,
            'recent_deliveries': NotificationDeliverySerializer(deliveries, many=True).data,
        })

    @decorators.action(detail=False, methods=['post'], url_path='test-channels')
    def test_channels(self, request):
        notification = create_notification(
            recipient=request.user,
            title='Тестовое уведомление WebTavern',
            message='Если вы видите это сообщение в центре уведомлений, email или SMS-логе — внешние каналы подключены корректно.',
            event_type='notification_test',
            target_url='/notifications/',
            send_email_copy=True,
            send_sms_copy=True,
        )
        return response.Response(NotificationSerializer(notification, context={'request': request}).data, status=201)
