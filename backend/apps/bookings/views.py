from datetime import datetime, time, timedelta
import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import decorators, permissions, response, status, viewsets

from apps.audit_logs.models import ManagerActionLog
from apps.common.access import user_can_manage_venue, user_manageable_venue_ids
from apps.notifications.services import broadcast_booking_update, broadcast_notification, create_notification
from apps.tables.models import Table

from .models import Booking, BookingStatusHistory
from .serializers import BookingCreateSerializer, BookingHoldConfirmSerializer, BookingManagerRescheduleSerializer, BookingSerializer
from .utils import booking_required_payment_amount, expire_outdated_holds, expire_overdue_payment_bookings, has_any_booking_overlap, has_booking_overlap, is_hold_active


logger = logging.getLogger(__name__)


class BookingViewSet(viewsets.ModelViewSet):
    def _safe_broadcast(self, payload, *, venue_id=None, user_id=None):
        try:
            broadcast_notification(payload, venue_id=venue_id, user_id=user_id)
        except Exception:
            logger.exception("Notification broadcast failed")

    def _notify_venue_team(self, booking, *, title, message, event_type):
        try:
            recipients = []
            if booking.venue.owner_id:
                recipients.append(booking.venue.owner)
            recipients.extend([
                assignment.manager
                for assignment in booking.venue.manager_assignments.filter(is_active=True).select_related('manager')
            ])
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
                    target_url=f'/manager/?booking={booking.id}#booking-{booking.id}',
                    send_email_copy=True,
                    send_sms_copy=True,
                )
        except Exception:
            logger.exception("Venue team notification failed for booking %s", getattr(booking, 'id', None))

    def _notify_customer(self, booking, *, title, message, event_type):
        try:
            create_notification(
                recipient=booking.customer,
                venue=booking.venue,
                title=title,
                message=message,
                event_type=event_type,
                target_url=f'/account/?booking={booking.id}#booking-{booking.id}',
                send_email_copy=True,
                send_sms_copy=True,
            )
        except Exception:
            logger.exception("Customer notification failed for booking %s", getattr(booking, 'id', None))

    def _log_manager_action(self, *, booking, actor, action, details=''):
        try:
            ManagerActionLog.objects.create(actor=actor, venue=booking.venue, booking=booking, action=action, details=details)
        except Exception:
            logger.exception("Manager action log failed for booking %s", getattr(booking, 'id', None))

    queryset = Booking.objects.select_related("customer", "venue", "venue__booking_rule", "hall", "table", "payment").prefetch_related("status_history", "tables")

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def _active_booking_statuses(self):
        return [
            Booking.Status.HOLD,
            Booking.Status.PENDING_CONFIRMATION,
            Booking.Status.WAITING_FOR_PAYMENT,
            Booking.Status.PAID,
            Booking.Status.CONFIRMED,
        ]

    def _parse_date_param(self, name):
        raw = self.request.query_params.get(name)
        if not raw:
            return None
        return parse_date(raw)

    def get_queryset(self):
        expire_overdue_payment_bookings()
        user = self.request.user
        queryset = self.queryset
        scope = self.request.query_params.get("scope")
        venue_id = self.request.query_params.get("venue")
        hall_id = self.request.query_params.get("hall")
        table_id = self.request.query_params.get("table")
        status_value = self.request.query_params.get("status")
        date_from = self._parse_date_param("date_from")
        date_to = self._parse_date_param("date_to")

        manageable_ids = list(user_manageable_venue_ids(user))
        if scope == "mine":
            queryset = queryset.filter(customer=user)
        elif scope == "manageable":
            queryset = queryset.filter(venue_id__in=manageable_ids)
        elif manageable_ids:
            queryset = queryset.filter(Q(customer=user) | Q(venue_id__in=manageable_ids)).distinct()
        else:
            queryset = queryset.filter(customer=user)

        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        if hall_id:
            queryset = queryset.filter(hall_id=hall_id)
        if table_id:
            queryset = queryset.filter(Q(table_id=table_id) | Q(tables__id=table_id)).distinct()
        if status_value:
            queryset = queryset.filter(status=status_value)

        if date_from or date_to:
            start_date = date_from or date_to
            end_date = date_to or date_from
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), timezone.get_current_timezone())
            end_dt = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min), timezone.get_current_timezone())
            queryset = queryset.filter(booking_start__lt=end_dt, booking_end__gt=start_dt)

        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return BookingCreateSerializer
        return BookingSerializer

    def perform_create(self, serializer):
        booking = serializer.save()
        self._notify_venue_team(booking, title='Стол зарезервирован', message=f'Клиент зарезервировал стол по брони #{booking.id} для {booking.venue.name}.', event_type='booking_hold_created')
        broadcast_notification(
            {
                "type": "booking_hold_created",
                "booking_id": booking.id,
                "venue_id": booking.venue_id,
                "message": f"Клиент зарезервировал стол по брони #{booking.id}.",
            },
            venue_id=booking.venue_id,
        )

    @decorators.action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="hold")
    def hold(self, request):
        serializer = BookingCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            validated = serializer.validated_data
            with transaction.atomic():
                selected_tables = list(validated.get('tables') or [validated['table']])
                table_ids = [table.id for table in selected_tables]
                locked_tables = list(
                    Table.objects.select_for_update()
                    .select_related('hall', 'hall__venue')
                    .filter(pk__in=table_ids)
                    .order_by('pk')
                )
                if len(locked_tables) != len(set(table_ids)):
                    return response.Response({"detail": "Один или несколько выбранных столов не найдены."}, status=400)
                for table in locked_tables:
                    expire_outdated_holds(table_id=table.id)
                if has_any_booking_overlap(table_ids=table_ids, booking_start=validated['booking_start'], booking_end=validated['booking_end']):
                    return response.Response({"detail": "Один или несколько выбранных столов уже заняты на выбранный интервал. Зарезервировать бронь не удалось."}, status=409)
                booking = serializer.save()
        except Exception:
            logger.exception("Booking hold creation failed. Payload: %s", request.data)
            return response.Response(
                {"detail": "Не удалось зарезервировать стол. Проверьте выбранный стол и время, затем повторите попытку."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        self._notify_venue_team(
            booking,
            title='Стол зарезервирован',
            message=f'Клиент зарезервировал стол по брони #{booking.id} для {booking.venue.name}.',
            event_type='booking_hold_created',
        )
        self._safe_broadcast(
            {"type": "booking_hold_created", "booking_id": booking.id, "venue_id": booking.venue_id, "message": f"Клиент зарезервировал стол по брони #{booking.id}."},
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(
            booking,
            event_type="table_occupancy_changed",
            message=f"Столы по брони #{booking.id} моментально зарезервированы.",
        )
        return response.Response(BookingSerializer(booking, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="confirm-hold")
    def confirm_hold(self, request, pk=None):
        try:
            with transaction.atomic():
                booking = self.queryset.select_for_update().get(pk=pk)
                if booking.customer_id != request.user.id:
                    return response.Response({"detail": "Подтвердить резерв может только тот пользователь, который его создал."}, status=403)
                if booking.status != Booking.Status.HOLD:
                    return response.Response({"detail": "Эта бронь уже не находится в режиме резерва."}, status=400)
                table_ids = list(booking.tables.values_list('id', flat=True)) or [booking.table_id]
                for table_id in table_ids:
                    expire_outdated_holds(table_id=table_id, customer_id=request.user.id)
                booking.refresh_from_db()
                if booking.status != Booking.Status.HOLD or not is_hold_active(booking):
                    return response.Response({"detail": "Резерв уже истёк. Выберите стол заново."}, status=409)
                list(Table.objects.select_for_update().filter(pk__in=table_ids).order_by('pk'))
                if has_any_booking_overlap(table_ids=table_ids, booking_start=booking.booking_start, booking_end=booking.booking_end, exclude_booking_id=booking.id):
                    booking.status = Booking.Status.CANCELLED
                    booking.manager_comment = 'Резерв не удалось подтвердить: слот успел занять другой запрос'
                    booking.save(update_fields=['status', 'manager_comment', 'updated_at'])
                    BookingStatusHistory.objects.create(booking=booking, old_status=Booking.Status.HOLD, new_status=Booking.Status.CANCELLED, changed_by=request.user, reason='Резерв потерял актуальность из-за пересечения по времени')
                    return response.Response({"detail": "Пока вы подтверждали бронь, слот уже стал недоступен. Резерв снят."}, status=409)
                serializer = BookingHoldConfirmSerializer(booking, data={}, partial=True, context={"request": request})
                serializer.is_valid(raise_exception=True)
                booking = serializer.save()
        except Exception:
            logger.exception("Booking hold confirmation failed. Booking id: %s", pk)
            return response.Response(
                {"detail": "Не удалось подтвердить резерв. Обновите доступность столов и повторите бронирование."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        self._notify_venue_team(booking, title='Бронь подтверждена клиентом', message=f'Клиент подтвердил резерв по брони #{booking.id}.', event_type='booking_confirmed_after_hold')
        self._notify_customer(booking, title='Резерв подтверждён', message=f'Бронь #{booking.id} подтверждена. Текущий статус: {booking.get_status_display()}.', event_type='booking_hold_confirmed')
        self._safe_broadcast({"type": "booking_hold_confirmed", "booking_id": booking.id, "venue_id": booking.venue_id, "message": f"Резерв по брони #{booking.id} подтверждён."}, venue_id=booking.venue_id)
        broadcast_booking_update(
            booking,
            event_type="booking_hold_confirmed",
            message=f"Резерв по брони #{booking.id} подтверждён и статус брони обновлён.",
        )
        return response.Response(BookingSerializer(booking, context={"request": request}).data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def confirm(self, request, pk=None):
        booking = self.get_object()
        if not user_can_manage_venue(request.user, booking.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        rule = getattr(booking.venue, "booking_rule", None)
        old_status = booking.status
        if booking_required_payment_amount(booking) > 0:
            booking.status = Booking.Status.WAITING_FOR_PAYMENT
            reason = request.data.get("reason", "Бронь подтверждена менеджером и ожидает оплаты")
            broadcast_message = f"Бронь #{booking.id} подтверждена и ожидает оплаты."
        else:
            booking.status = Booking.Status.CONFIRMED
            reason = request.data.get("reason", "Бронь подтверждена менеджером")
            broadcast_message = f"Бронь #{booking.id} подтверждена менеджером."
        booking.save(update_fields=["status", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=request.user,
            reason=reason,
        )
        self._log_manager_action(booking=booking, actor=request.user, action=ManagerActionLog.Action.CONFIRM, details=reason)
        self._notify_customer(booking, title='Статус брони обновлён', message=broadcast_message, event_type='booking_confirmed')
        self._notify_venue_team(booking, title='Бронь подтверждена', message=broadcast_message, event_type='booking_confirmed')
        broadcast_notification(
            {
                "type": "booking_confirmed",
                "booking_id": booking.id,
                "venue_id": booking.venue_id,
                "message": broadcast_message,
            },
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(booking, event_type="booking_confirmed", message=broadcast_message)
        return response.Response(BookingSerializer(booking).data)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def reschedule(self, request, pk=None):
        booking = self.get_object()
        if not user_can_manage_venue(request.user, booking.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        rule = getattr(booking.venue, "booking_rule", None)
        if not rule or not rule.allow_manager_reschedule:
            return response.Response({"detail": "Правила заведения запрещают перенос брони менеджером."}, status=400)
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.NO_SHOW}:
            return response.Response({"detail": "Эту бронь уже нельзя перенести."}, status=400)

        with transaction.atomic():
            booking = self.queryset.select_for_update().get(pk=booking.pk)
            serializer = BookingManagerRescheduleSerializer(data=request.data, context={"booking": booking})
            serializer.is_valid(raise_exception=True)
            validated = serializer.validated_data
            old_start = booking.booking_start
            old_end = booking.booking_end
            old_table_name = booking.table.name
            booking.hall = validated["hall"]
            booking.table = validated["table"]
            booking.booking_start = validated["booking_start"]
            booking.booking_end = validated["booking_end"]
            if validated.get("reason"):
                booking.manager_comment = validated["reason"]
            booking.save(update_fields=["hall", "table", "booking_start", "booking_end", "manager_comment", "updated_at"])
            booking.tables.set([validated["table"]])

        reason = validated.get("reason") or "Бронь перенесена менеджером"
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=booking.status,
            new_status=booking.status,
            changed_by=request.user,
            reason=f"{reason}. Было: {timezone.localtime(old_start).strftime('%d.%m %H:%M')} — {timezone.localtime(old_end).strftime('%H:%M')}, стол {old_table_name}.",
        )
        self._log_manager_action(booking=booking, actor=request.user, action=ManagerActionLog.Action.RESCHEDULE, details=reason)
        self._notify_customer(booking, title='Бронь перенесена', message=f'Бронь #{booking.id} перенесена менеджером. Проверьте новое время в профиле.', event_type='booking_rescheduled')
        broadcast_notification(
            {
                "type": "booking_rescheduled",
                "booking_id": booking.id,
                "venue_id": booking.venue_id,
                "message": f"Бронь #{booking.id} перенесена менеджером.",
            },
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(booking, event_type="booking_rescheduled", message=f"Бронь #{booking.id} перенесена менеджером.")
        return response.Response(BookingSerializer(booking).data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        user = request.user
        if booking.customer_id != user.id and not user_can_manage_venue(user, booking.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.NO_SHOW}:
            return response.Response({"detail": "Эта бронь уже завершена и не может быть отменена."}, status=400)

        rule = getattr(booking.venue, "booking_rule", None)
        now = timezone.now()
        free_cancel_minutes = max(int(getattr(rule, "free_cancellation_before_minutes", 0) or 0), 0)
        free_cancel_deadline = booking.booking_start - timedelta(minutes=free_cancel_minutes)
        cancelled_without_penalty = now <= free_cancel_deadline

        penalty_amount = 0
        penalty_currency = getattr(booking, "price_currency", None) or (getattr(rule, "deposit_currency", "RUB") if rule else "RUB")
        required_amount = booking_required_payment_amount(booking)
        if not cancelled_without_penalty and required_amount and required_amount > 0:
            penalty_amount = required_amount

        old_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.cancelled_without_penalty = cancelled_without_penalty
        booking.cancellation_penalty_amount = penalty_amount
        booking.cancellation_penalty_currency = penalty_currency
        booking.save(update_fields=[
            "status",
            "cancelled_without_penalty",
            "cancellation_penalty_amount",
            "cancellation_penalty_currency",
            "updated_at",
        ])

        default_reason = "Бронь отменена без штрафа" if cancelled_without_penalty else "Бронь отменена с удержанием депозита"
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=user,
            reason=request.data.get("reason", default_reason),
        )
        penalty_suffix = " без штрафа" if cancelled_without_penalty else f" со штрафом {penalty_amount} {penalty_currency}"
        if user_can_manage_venue(user, booking.venue):
            self._log_manager_action(booking=booking, actor=user, action=ManagerActionLog.Action.CANCEL, details=request.data.get('reason', default_reason))
        self._notify_customer(booking, title='Бронь отменена', message=f'Бронь #{booking.id} отменена{penalty_suffix}.', event_type='booking_cancelled')
        self._notify_venue_team(booking, title='Бронь отменена', message=f'Бронь #{booking.id} отменена{penalty_suffix}.', event_type='booking_cancelled')
        broadcast_notification(
            {
                "type": "booking_cancelled",
                "booking_id": booking.id,
                "venue_id": booking.venue_id,
                "message": f"Бронь #{booking.id} отменена{penalty_suffix}.",
            },
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(booking, event_type="booking_cancelled", message=f"Бронь #{booking.id} отменена{penalty_suffix}.")
        return response.Response(BookingSerializer(booking).data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def no_show(self, request, pk=None):
        booking = self.get_object()
        if not user_can_manage_venue(request.user, booking.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.NO_SHOW}:
            return response.Response({"detail": "Эту бронь уже нельзя отметить как неявку."}, status=400)

        rule = getattr(booking.venue, "booking_rule", None)
        grace_minutes = max(int(getattr(rule, "no_show_after_minutes", 0) or 0), 0)
        allowed_from = booking.booking_start + timedelta(minutes=grace_minutes)
        if timezone.now() < allowed_from:
            return response.Response({"detail": f"Неявку можно отметить только через {grace_minutes} минут после начала брони."}, status=400)

        old_status = booking.status
        booking.status = Booking.Status.NO_SHOW
        booking.no_show_marked_at = timezone.now()
        booking.save(update_fields=["status", "no_show_marked_at", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=booking,
            old_status=old_status,
            new_status=booking.status,
            changed_by=request.user,
            reason=request.data.get("reason", "Гость не пришёл, менеджер отметил неявку"),
        )
        self._log_manager_action(booking=booking, actor=request.user, action=ManagerActionLog.Action.NO_SHOW, details=request.data.get('reason', 'Гость не пришёл'))
        self._notify_customer(booking, title='Бронь отмечена как неявка', message=f'Бронь #{booking.id} отмечена как неявка.', event_type='booking_no_show')
        self._notify_venue_team(booking, title='Отмечена неявка', message=f'Бронь #{booking.id} отмечена как неявка.', event_type='booking_no_show')
        broadcast_notification(
            {
                "type": "booking_no_show",
                "booking_id": booking.id,
                "venue_id": booking.venue_id,
                "message": f"Бронь #{booking.id} отмечена как неявка.",
            },
            venue_id=booking.venue_id,
        )
        broadcast_booking_update(booking, event_type="booking_no_show", message=f"Бронь #{booking.id} отмечена как неявка.")
        return response.Response(BookingSerializer(booking).data, status=status.HTTP_200_OK)
