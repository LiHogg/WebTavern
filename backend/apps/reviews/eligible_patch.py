from django.db.models import Count, Max
from django.utils import timezone
from rest_framework import decorators, permissions, response, status

from apps.bookings.models import Booking
from apps.venues.models import Venue

from .models import Review
from .views import ReviewViewSet


@decorators.action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='eligible')
def eligible_visited_only(self, request):
    """Return only venues where the current user has already had a real past booking."""
    reviewed_ids = set(
        Review.objects
        .filter(author=request.user, parent__isnull=True)
        .values_list('venue_id', flat=True)
    )
    visited_statuses = [
        Booking.Status.PAID,
        Booking.Status.CONFIRMED,
        Booking.Status.COMPLETED,
    ]
    visits = (
        Booking.objects
        .filter(
            customer=request.user,
            booking_end__lte=timezone.now(),
            status__in=visited_statuses,
            venue__is_published=True,
            venue__status=Venue.Status.ACTIVE,
        )
        .exclude(venue_id__in=reviewed_ids)
        .values('venue_id')
        .annotate(visits_count=Count('id'), last_visit=Max('booking_end'))
        .order_by('-last_visit')[:12]
    )
    stats_by_venue = {item['venue_id']: item for item in visits}
    venues_by_id = Venue.objects.in_bulk(stats_by_venue.keys())
    payload = []
    for venue_id, stats in stats_by_venue.items():
        venue = venues_by_id.get(venue_id)
        if not venue:
            continue
        payload.append({
            'venue_id': venue.id,
            'venue_name': venue.name,
            'venue_slug': venue.slug,
            'city': venue.city,
            'visits_count': stats.get('visits_count') or 0,
            'last_visit': stats.get('last_visit'),
        })
    return response.Response(payload, status=status.HTTP_200_OK)


ReviewViewSet.eligible = eligible_visited_only
