from __future__ import annotations

_applied = False


def apply_venue_working_hours_patch():
    """Expose venue working hours as a public/readable and manager-editable action."""
    global _applied
    if _applied:
        return

    from rest_framework import decorators, permissions, response, status

    from apps.booking_rules.models import VenueBookingRule
    from apps.booking_rules.working_hours import normalize_working_hours, summarize_working_hours
    from apps.common.access import user_can_manage_venue
    from .views import VenueViewSet

    def working_hours(self, request, slug=None):
        venue = self.get_object()
        if request.method.lower() in {'patch', 'post'}:
            if not user_can_manage_venue(request.user, venue):
                return response.Response({'detail': 'Настраивать график работы может владелец или менеджер заведения.'}, status=status.HTTP_403_FORBIDDEN)

        if not (venue.is_published and venue.status == venue.Status.ACTIVE) and not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'График этого заведения недоступен.'}, status=status.HTTP_403_FORBIDDEN)

        rule, _ = VenueBookingRule.objects.get_or_create(venue=venue)

        if request.method.lower() in {'patch', 'post'}:
            raw_hours = request.data.get('working_hours', request.data)
            rule.working_hours = normalize_working_hours(raw_hours)
            rule.save(update_fields=['working_hours', 'updated_at'])

        return response.Response({
            'venue': venue.id,
            'venue_slug': venue.slug,
            'working_hours': normalize_working_hours(rule.working_hours),
            'working_hours_summary': summarize_working_hours(rule.working_hours),
        })

    VenueViewSet.working_hours = decorators.action(
        detail=True,
        methods=['get', 'patch', 'post'],
        permission_classes=[permissions.AllowAny],
        url_path='working-hours',
    )(working_hours)
    _applied = True
