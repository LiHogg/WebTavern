from django.db.models import Q
from rest_framework import permissions, response, viewsets

from apps.common.access import user_can_manage_venue, user_is_platform_staff, user_manageable_venue_ids

from .models import BookingPriceRule, VenueBookingRule
from .serializers import BookingPriceRuleSerializer, VenueBookingRuleSerializer


class VenueBookingRuleViewSet(viewsets.ModelViewSet):
    serializer_class = VenueBookingRuleSerializer

    def _can_edit_rules(self, user, venue):
        return bool(getattr(user, "is_authenticated", False) and (user_is_platform_staff(user) or venue.owner_id == user.id))

    def get_queryset(self):
        queryset = VenueBookingRule.objects.select_related("venue")
        user = self.request.user
        public_filter = Q(venue__is_published=True, venue__status='active')
        if getattr(user, 'is_authenticated', False):
            manageable_ids = list(user_manageable_venue_ids(user))
            queryset = queryset.filter(public_filter | Q(venue_id__in=manageable_ids)).distinct()
        else:
            queryset = queryset.filter(public_filter)
        venue_id = self.request.query_params.get("venue")
        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        return queryset

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        rule = self.get_object()
        if not self._can_edit_rules(request.user, rule.venue):
            return response.Response({"detail": "Изменять правила бронирования может только владелец заведения."}, status=403)
        partial = kwargs.pop("partial", False)
        return super().update(request, partial=partial, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        rule = self.get_object()
        if not self._can_edit_rules(request.user, rule.venue):
            return response.Response({"detail": "Изменять правила бронирования может только владелец заведения."}, status=403)
        return super().destroy(request, *args, **kwargs)


class BookingPriceRuleViewSet(viewsets.ModelViewSet):
    serializer_class = BookingPriceRuleSerializer

    def get_queryset(self):
        queryset = BookingPriceRule.objects.select_related('venue', 'hall').order_by('rule_type', 'hall__name', 'table_count', 'price_amount')
        user = self.request.user
        public_filter = Q(venue__is_published=True, venue__status='active', is_active=True)
        if getattr(user, 'is_authenticated', False):
            manageable_ids = list(user_manageable_venue_ids(user))
            queryset = queryset.filter(public_filter | Q(venue_id__in=manageable_ids)).distinct()
        else:
            queryset = queryset.filter(public_filter)
        venue_id = self.request.query_params.get('venue')
        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        rule_type = self.request.query_params.get('rule_type')
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)
        return queryset

    def get_permissions(self):
        if self.action in {'list', 'retrieve'}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def _can_edit_price_rule(self, user, venue):
        return bool(getattr(user, 'is_authenticated', False) and (user_is_platform_staff(user) or venue.owner_id == user.id))

    def perform_create(self, serializer):
        venue = serializer.validated_data.get('venue')
        if not self._can_edit_price_rule(self.request.user, venue):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Настраивать акции и стоимость брони может только владелец заведения.')
        serializer.save()

    def update(self, request, *args, **kwargs):
        price_rule = self.get_object()
        if not self._can_edit_price_rule(request.user, price_rule.venue):
            return response.Response({'detail': 'Настраивать акции и стоимость брони может только владелец заведения.'}, status=403)
        partial = kwargs.pop('partial', False)
        return super().update(request, partial=partial, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        price_rule = self.get_object()
        if not self._can_edit_price_rule(request.user, price_rule.venue):
            return response.Response({'detail': 'Настраивать акции и стоимость брони может только владелец заведения.'}, status=403)
        return super().destroy(request, *args, **kwargs)
