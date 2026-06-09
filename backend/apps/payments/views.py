from django.db.models import Q
from django.utils import timezone
from rest_framework import decorators, permissions, response, status, viewsets
from rest_framework.decorators import api_view, permission_classes

from apps.bookings.models import Booking, BookingStatusHistory
from apps.bookings.utils import booking_required_payment_amount, expire_overdue_payment_bookings, payment_deadline_for_booking
from apps.common.access import user_can_manage_venue, user_manageable_venue_ids
from apps.notifications.services import broadcast_booking_update, broadcast_notification, create_notification

from .models import Payment
from .serializers import PaymentSerializer
from .services import create_or_initialize_payment


def _notify_payment_update(booking, *, title, message, event_type):
    recipients = [booking.customer]
    if booking.venue.owner_id:
        recipients.append(booking.venue.owner)
    recipients.extend([assignment.manager for assignment in booking.venue.manager_assignments.filter(is_active=True).select_related('manager')])
    seen = set()
    for user in recipients:
        if not user or user.id in seen:
            continue
        seen.add(user.id)
        create_notification(
            recipient=user,
            venue=booking.venue,
            title=title,
            message=message,
            event_type=event_type,
            target_url=f'/account/payments/?payment={booking.payment.id}#payment-{booking.payment.id}' if user.id == booking.customer_id and hasattr(booking, 'payment') else f'/manager/?booking={booking.id}#booking-{booking.id}',
        )
    broadcast_notification(
        {
            'type': event_type,
            'booking_id': booking.id,
            'venue_id': booking.venue_id,
            'message': message,
        },
        venue_id=booking.venue_id,
    )
    broadcast_booking_update(booking, event_type=event_type, message=message)


def _apply_payment_state(payment: Payment, new_status: str, *, actor=None, reason: str = ''):
    booking = payment.booking
    payment.status = new_status
    payload = dict(payment.raw_payload or {})
    payload['last_status'] = new_status
    if reason:
        payload['reason'] = reason
    payment.raw_payload = payload
    payment.save(update_fields=['status', 'raw_payload', 'updated_at'])

    if new_status == Payment.Status.SUCCEEDED and booking.status == Booking.Status.WAITING_FOR_PAYMENT:
        old_status = booking.status
        booking.status = Booking.Status.PAID
        booking.save(update_fields=['status', 'updated_at'])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=actor,
            reason=reason or 'Предоплата успешно внесена',
        )
        _notify_payment_update(
            booking,
            title='Оплата прошла успешно',
            message=f'Бронь #{booking.id} оплачена. Статус обновлён на «Оплачено».',
            event_type='payment_succeeded',
        )
    elif new_status in {Payment.Status.CANCELLED, Payment.Status.FAILED} and booking.status == Booking.Status.WAITING_FOR_PAYMENT:
        old_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.cancelled_without_penalty = True
        booking.cancellation_penalty_amount = 0
        booking.manager_comment = reason or 'Оплата не была завершена, бронь автоматически отменена'
        booking.save(update_fields=['status', 'cancelled_without_penalty', 'cancellation_penalty_amount', 'manager_comment', 'updated_at'])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=actor,
            reason=reason or 'Оплата не завершена, бронь отменена автоматически',
        )
        _notify_payment_update(
            booking,
            title='Оплата не завершена',
            message=f'Бронь #{booking.id} была отменена, потому что оплата не завершилась.',
            event_type='payment_cancelled',
        )
    return payment, booking


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        expire_overdue_payment_bookings()
        user = self.request.user
        queryset = Payment.objects.select_related('booking', 'booking__venue', 'booking__customer')
        if not user.is_authenticated:
            return queryset.none()

        scope = self.request.query_params.get('scope')
        manageable_ids = list(user_manageable_venue_ids(user))

        if scope == 'mine':
            return queryset.filter(booking__customer=user)

        if scope == 'manageable':
            return queryset.filter(booking__venue_id__in=manageable_ids).distinct()

        if manageable_ids:
            return queryset.filter(Q(booking__venue_id__in=manageable_ids) | Q(booking__customer=user)).distinct()

        return queryset.filter(booking__customer=user)

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path='simulate-success')
    def simulate_success(self, request, pk=None):
        payment = self.get_object()
        booking = payment.booking

        if booking.customer_id != request.user.id and not user_can_manage_venue(request.user, booking.venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)

        if booking.status == Booking.Status.PAID and payment.status == Payment.Status.SUCCEEDED:
            return response.Response(self.get_serializer(payment).data)

        if booking.status != Booking.Status.WAITING_FOR_PAYMENT:
            return response.Response({'detail': 'Эту бронь сейчас нельзя оплатить.'}, status=400)

        payment, _ = _apply_payment_state(payment, Payment.Status.SUCCEEDED, actor=request.user, reason='Предоплата успешно внесена')
        return response.Response(self.get_serializer(payment).data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path='simulate-cancel')
    def simulate_cancel(self, request, pk=None):
        payment = self.get_object()
        booking = payment.booking
        if booking.customer_id != request.user.id and not user_can_manage_venue(request.user, booking.venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        if booking.status != Booking.Status.WAITING_FOR_PAYMENT:
            return response.Response({'detail': 'Эту оплату сейчас нельзя отменить.'}, status=400)
        payment, _ = _apply_payment_state(payment, Payment.Status.CANCELLED, actor=request.user, reason='Пользователь прервал учебную оплату')
        return response.Response(self.get_serializer(payment).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def initialize_payment(request):
    expire_overdue_payment_bookings()
    booking_id = request.data.get('booking_id')
    if not booking_id:
        return response.Response({'detail': 'booking_id обязателен.'}, status=400)
    try:
        booking = Booking.objects.select_related('venue', 'customer', 'venue__booking_rule').get(pk=booking_id)
    except Booking.DoesNotExist:
        return response.Response({'detail': 'Бронь не найдена.'}, status=404)

    if booking.customer_id != request.user.id and not user_can_manage_venue(request.user, booking.venue):
        return response.Response({'detail': 'Недостаточно прав.'}, status=403)

    booking.refresh_from_db()
    if booking.status == Booking.Status.CANCELLED:
        return response.Response({'detail': 'Время на оплату истекло. Бронь отменена и слот освобождён.'}, status=400)

    if booking_required_payment_amount(booking) <= 0:
        return response.Response({'detail': 'Для этой брони предоплата не требуется.'}, status=400)
    if booking.status == Booking.Status.PAID and hasattr(booking, 'payment'):
        return response.Response(PaymentSerializer(booking.payment).data)
    if booking.status != Booking.Status.WAITING_FOR_PAYMENT:
        return response.Response({'detail': 'Сейчас оплатить эту бронь нельзя.'}, status=400)

    deadline = payment_deadline_for_booking(booking)
    if deadline and deadline <= timezone.now():
        expire_overdue_payment_bookings()
        return response.Response({'detail': 'Время на оплату истекло. Бронь отменена и слот освобождён.'}, status=400)
    payment = create_or_initialize_payment(booking)
    return response.Response(PaymentSerializer(payment).data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def payment_webhook_stub(request):
    payment_id = request.data.get('payment_id')
    provider_payment_id = request.data.get('provider_payment_id')
    new_status = str(request.data.get('status') or '').strip().lower()
    if new_status not in {Payment.Status.PENDING, Payment.Status.SUCCEEDED, Payment.Status.FAILED, Payment.Status.CANCELLED}:
        return response.Response({'detail': 'Укажите корректный статус платежа.'}, status=400)
    payment = None
    if payment_id:
        payment = Payment.objects.select_related('booking', 'booking__venue', 'booking__customer').filter(pk=payment_id).first()
    elif provider_payment_id:
        payment = Payment.objects.select_related('booking', 'booking__venue', 'booking__customer').filter(provider_payment_id=provider_payment_id).first()
    if not payment:
        return response.Response({'detail': 'Платёж не найден.'}, status=404)
    payment, booking = _apply_payment_state(payment, new_status, actor=None, reason='Webhook stub обновил статус платежа')
    return response.Response({'payment': PaymentSerializer(payment).data, 'booking_status': booking.status}, status=status.HTTP_200_OK)
