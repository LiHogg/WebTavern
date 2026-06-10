def apply_booking_flow_patch():
    from django.db import transaction
    from rest_framework import response, status

    from apps.audit_logs.models import ManagerActionLog
    from apps.common.access import user_can_manage_venue
    from apps.notifications.services import broadcast_booking_update, broadcast_notification

    from .models import Booking, BookingStatusHistory
    from .serializers import BookingSerializer
    from .utils import booking_required_payment_amount, final_status_for_new_booking
    from .views import BookingViewSet

    original_confirm_hold = getattr(BookingViewSet, "confirm_hold", None)
    original_confirm = getattr(BookingViewSet, "confirm", None)

    def _serialize(booking, request):
        return BookingSerializer(booking, context={"request": request}).data

    def _copy_action_metadata(source, target):
        if not source:
            return target
        for attr in ("mapping", "detail", "url_path", "url_name", "kwargs"):
            if hasattr(source, attr):
                setattr(target, attr, getattr(source, attr))
        return target

    def _manager_confirm_booking(self, request, booking):
        if not user_can_manage_venue(request.user, booking.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.NO_SHOW}:
            return response.Response({"detail": "Эту бронь уже нельзя подтвердить."}, status=status.HTTP_400_BAD_REQUEST)
        if booking.status in {Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.PAID, Booking.Status.CONFIRMED}:
            return response.Response(_serialize(booking, request), status=status.HTTP_200_OK)

        old_status = booking.status
        if booking_required_payment_amount(booking) > 0:
            booking.status = Booking.Status.WAITING_FOR_PAYMENT
            reason = request.data.get("reason", "Бронь подтверждена менеджером и ожидает оплаты")
            message = f"Бронь #{booking.id} подтверждена и ожидает оплаты."
        else:
            booking.status = Booking.Status.CONFIRMED
            reason = request.data.get("reason", "Бронь подтверждена менеджером")
            message = f"Бронь #{booking.id} подтверждена менеджером."
        booking.hold_expires_at = None
        booking.save(update_fields=["status", "hold_expires_at", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=request.user,
            reason=reason,
        )

        self._log_manager_action(booking=booking, actor=request.user, action=ManagerActionLog.Action.CONFIRM, details=reason)
        self._notify_customer(booking, title="Статус брони обновлён", message=message, event_type="booking_confirmed")
        self._notify_venue_team(booking, title="Бронь подтверждена", message=message, event_type="booking_confirmed")
        broadcast_notification(
            {"type": "booking_confirmed", "booking_id": booking.id, "venue_id": booking.venue_id, "message": message},
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(booking, event_type="booking_confirmed", message=message)
        return response.Response(_serialize(booking, request), status=status.HTTP_200_OK)

    def confirm_hold(self, request, pk=None):
        with transaction.atomic():
            booking = Booking.objects.select_for_update().select_related(
                "customer", "venue", "venue__booking_rule", "hall", "table"
            ).prefetch_related("tables", "status_history").get(pk=pk)

            # Backward compatibility: old frontend builds could call confirm-hold from
            # the manager card. Treat that as manager confirmation instead of failing.
            if booking.customer_id != request.user.id:
                if user_can_manage_venue(request.user, booking.venue):
                    return _manager_confirm_booking(self, request, booking)
                return response.Response(
                    {"detail": "Подтвердить резерв может только клиент, который его создал."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if booking.status in {Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.PAID, Booking.Status.CONFIRMED}:
                return response.Response(_serialize(booking, request), status=status.HTTP_200_OK)
            if booking.status != Booking.Status.HOLD:
                return response.Response({"detail": "Эта бронь уже не находится в режиме резерва."}, status=status.HTTP_400_BAD_REQUEST)

            old_status = booking.status
            rule = getattr(booking.venue, "booking_rule", None)
            booking.status, reason = final_status_for_new_booking(rule, booking=booking)
            booking.hold_expires_at = None
            booking.save(update_fields=["status", "hold_expires_at", "updated_at"])
            BookingStatusHistory.objects.create(
                booking=booking,
                old_status=old_status,
                new_status=booking.status,
                changed_by=request.user,
                reason=reason,
            )

        self._notify_venue_team(booking, title="Бронь подтверждена клиентом", message=f"Клиент подтвердил резерв по брони #{booking.id}.", event_type="booking_confirmed_after_hold")
        self._notify_customer(booking, title="Резерв подтверждён", message=f"Бронь #{booking.id} подтверждена. Текущий статус: {booking.get_status_display()}.", event_type="booking_hold_confirmed")
        self._safe_broadcast({"type": "booking_hold_confirmed", "booking_id": booking.id, "venue_id": booking.venue_id, "message": f"Резерв по брони #{booking.id} подтверждён."}, venue_id=booking.venue_id)
        broadcast_booking_update(booking, event_type="booking_hold_confirmed", message=f"Резерв по брони #{booking.id} подтверждён.")
        return response.Response(_serialize(booking, request), status=status.HTTP_200_OK)

    def confirm(self, request, pk=None):
        with transaction.atomic():
            booking = Booking.objects.select_for_update().select_related(
                "customer", "venue", "venue__booking_rule", "hall", "table"
            ).prefetch_related("tables", "status_history").get(pk=pk)
            return _manager_confirm_booking(self, request, booking)

    BookingViewSet.confirm_hold = _copy_action_metadata(original_confirm_hold, confirm_hold)
    BookingViewSet.confirm = _copy_action_metadata(original_confirm, confirm)
