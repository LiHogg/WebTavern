from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from .models import Notification, NotificationDelivery
from .serializers import NotificationDeliverySerializer, NotificationPreferenceSerializer, NotificationSerializer
from .services import create_notification, get_notification_preference


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
