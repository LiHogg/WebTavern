from datetime import timedelta

from django.db.models import Avg, Count, Max
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.audit_logs.models import ManagerActionLog
from apps.bookings.models import Booking
from apps.notifications.models import Notification
from apps.reviews.models import Review
from apps.venues.models import Venue
from apps.venues.serializers import VenueListSerializer
from apps.common.access import user_manageable_venue_ids


def healthcheck(request):
    return JsonResponse({"status": "ok", "service": "backend"})


def _review_payload(review: Review) -> dict:
    author_name = ' '.join(part for part in [review.author.first_name, review.author.last_name] if part).strip() or review.author.email
    reply = review.replies.filter(is_visible=True).select_related('author').order_by('created_at').first()
    images = []
    for image in review.images.all()[:5]:
        if image.image:
            images.append({'id': image.id, 'image_url': image.image.url, 'alt_text': image.alt_text})
    return {
        'id': review.id,
        'venue_name': review.venue.name,
        'venue_slug': review.venue.slug,
        'author_name': author_name,
        'rating': review.rating,
        'text': review.text,
        'images': images,
        'likes_count': review.likes.count(),
        'created_at': review.created_at,
        'reply': {
            'author_name': ' '.join(part for part in [reply.author.first_name, reply.author.last_name] if part).strip() or reply.author.email,
            'text': reply.text,
            'created_at': reply.created_at,
        } if reply else None,
    }


def _eligible_review_venues_for_user(user):
    if not getattr(user, 'is_authenticated', False):
        return []
    reviewed_ids = set(Review.objects.filter(author=user, parent__isnull=True).values_list('venue_id', flat=True))
    venues = (
        Venue.objects
        .filter(is_published=True, status=Venue.Status.ACTIVE)
        .exclude(id__in=reviewed_ids)
        .order_by('city', 'name')[:6]
    )
    return [
        {
            'venue_id': venue.id,
            'venue_name': venue.name,
            'venue_slug': venue.slug,
            'city': venue.city,
            'visits_count': 0,
            'latest_booking_end': None,
        }
        for venue in venues
    ]


@api_view(['GET'])
@permission_classes([AllowAny])
def home_overview(request):
    active_venues = Venue.objects.filter(is_published=True, status=Venue.Status.ACTIVE).select_related('booking_rule', 'branding')
    top_rated = active_venues.order_by('-average_rating', 'name')[:6]
    popular_ids = (
        Booking.objects.filter(venue__is_published=True, venue__status=Venue.Status.ACTIVE)
        .exclude(status=Booking.Status.CANCELLED)
        .values('venue_id')
        .annotate(total=Count('id'))
        .order_by('-total')[:6]
    )
    popularity_map = {row['venue_id']: row['total'] for row in popular_ids}
    popular_venues = list(active_venues.filter(id__in=popularity_map.keys()))
    popular_venues.sort(key=lambda venue: (-popularity_map.get(venue.id, 0), venue.name.lower()))
    recent_reviews = Review.objects.filter(is_visible=True, parent__isnull=True).select_related('author', 'venue').prefetch_related('likes', 'images', 'replies__author').order_by('-created_at')[:6]
    cities_total = active_venues.values('city').distinct().count()
    stats = {
        'venues_total': active_venues.count(),
        'cities_total': cities_total,
        'reviews_total': Review.objects.filter(parent__isnull=True, is_visible=True).count(),
        'bookings_total': Booking.objects.exclude(status=Booking.Status.CANCELLED).count(),
    }
    payload = {
        'stats': stats,
        'top_rated': VenueListSerializer(top_rated, many=True, context={'request': request}).data,
        'popular': [dict(VenueListSerializer(venue, context={'request': request}).data, visits_total=popularity_map.get(venue.id, 0)) for venue in popular_venues],
        'recent_reviews': [_review_payload(review) for review in recent_reviews],
        'review_candidates': _eligible_review_venues_for_user(request.user),
    }
    return Response(payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def owner_overview(request):
    venues = Venue.objects.filter(owner=request.user)
    venue_ids = list(venues.values_list('id', flat=True))
    bookings = Booking.objects.filter(venue_id__in=venue_ids)
    recent_reviews = Review.objects.filter(venue_id__in=venue_ids, parent__isnull=True, is_visible=True).select_related('author', 'venue').prefetch_related('likes', 'images', 'replies__author').order_by('-created_at')[:5]
    now = timezone.now()
    last_30 = now - timedelta(days=30)
    payload = {
        'venues_total': venues.count(),
        'published_total': venues.filter(is_published=True, status=Venue.Status.ACTIVE).count(),
        'pending_total': venues.filter(status=Venue.Status.PENDING_MODERATION).count(),
        'draft_total': venues.filter(status=Venue.Status.DRAFT).count(),
        'open_bookings_total': bookings.filter(status__in=[Booking.Status.PENDING_CONFIRMATION, Booking.Status.WAITING_FOR_PAYMENT, Booking.Status.PAID, Booking.Status.CONFIRMED]).count(),
        'completed_last_30_days': bookings.filter(status=Booking.Status.COMPLETED, booking_end__gte=last_30).count(),
        'no_show_last_30_days': bookings.filter(status=Booking.Status.NO_SHOW, booking_start__gte=last_30).count(),
        'average_rating': float(venues.aggregate(value=Avg('average_rating')).get('value') or 0),
        'recent_reviews': [_review_payload(review) for review in recent_reviews],
    }
    return Response(payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def manager_overview(request):
    manageable_ids = list(user_manageable_venue_ids(request.user))
    bookings = Booking.objects.filter(venue_id__in=manageable_ids)
    now = timezone.now()
    later = now + timedelta(hours=2)
    logs = ManagerActionLog.objects.filter(venue_id__in=manageable_ids).select_related('actor', 'venue', 'booking')[:10]
    notifications_unread = Notification.objects.filter(recipient=request.user, is_read=False).count()
    payload = {
        'pending_confirmation_total': bookings.filter(status=Booking.Status.PENDING_CONFIRMATION).count(),
        'waiting_payment_total': bookings.filter(status=Booking.Status.WAITING_FOR_PAYMENT).count(),
        'today_total': bookings.filter(booking_start__date=timezone.localdate()).count(),
        'next_two_hours_total': bookings.filter(booking_start__gte=now, booking_start__lte=later).count(),
        'notifications_unread_total': notifications_unread,
        'action_logs': [
            {
                'id': log.id,
                'action': log.action,
                'details': log.details,
                'created_at': log.created_at,
                'venue_name': log.venue.name,
                'venue_slug': log.venue.slug,
                'booking_id': log.booking_id,
                'actor_name': (' '.join(part for part in [getattr(log.actor, 'first_name', ''), getattr(log.actor, 'last_name', '')] if part).strip() or getattr(log.actor, 'email', 'Система')),
            }
            for log in logs
        ],
    }
    return Response(payload)
