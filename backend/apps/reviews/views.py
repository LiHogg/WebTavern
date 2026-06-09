from django.db.models import Count, Prefetch
from rest_framework import decorators, mixins, parsers, permissions, response, status, viewsets

from apps.notifications.services import create_notification
from apps.venues.models import Venue

from .models import Review
from .serializers import ReviewSerializer


class ReviewViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReviewSerializer
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def _notify_review_participants(self, review):
        target_url = f"/venues/{review.venue.slug}/reviews/"
        if review.parent_id:
            original_author = review.parent.author
            if original_author_id := getattr(original_author, 'id', None):
                if original_author_id != review.author_id:
                    create_notification(
                        recipient=original_author,
                        venue=review.venue,
                        title='На ваш отзыв ответили',
                        message=f'Заведение {review.venue.name} ответило на ваш отзыв.',
                        event_type='review_reply',
                        target_url=target_url,
                    )
            return

        recipients = []
        if review.venue.owner_id:
            recipients.append(review.venue.owner)
        recipients.extend([assignment.manager for assignment in review.venue.manager_assignments.filter(is_active=True).select_related('manager')])
        seen = set()
        for user in recipients:
            if not user or user.id in seen or user.id == review.author_id:
                continue
            seen.add(user.id)
            create_notification(
                recipient=user,
                venue=review.venue,
                title='Новый отзыв о заведении',
                message=f'Появился новый отзыв о заведении {review.venue.name}.',
                event_type='review_created',
                target_url=target_url,
            )

    def perform_create(self, serializer):
        review = serializer.save()
        self._notify_review_participants(review)

    def get_permissions(self):
        if self.action in {'list'}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        queryset = Review.objects.filter(is_visible=True, parent__isnull=True).select_related('author', 'venue').prefetch_related(
            'likes',
            'images',
            Prefetch(
                'replies',
                queryset=Review.objects.filter(is_visible=True).select_related('author').prefetch_related('likes', 'images').order_by('created_at'),
                to_attr='prefetched_visible_replies',
            ),
        ).annotate(likes_total=Count('likes', distinct=True))
        venue_slug = self.request.query_params.get('venue_slug')
        sort = self.request.query_params.get('sort') or 'new'
        with_photos = self.request.query_params.get('with_photos')
        if venue_slug:
            queryset = queryset.filter(venue__slug=venue_slug)
        if with_photos in {'1', 'true', 'yes'}:
            queryset = queryset.filter(images__isnull=False).distinct()
        if sort == 'old':
            queryset = queryset.order_by('created_at')
        elif sort == 'rating_desc':
            queryset = queryset.order_by('-rating', '-created_at')
        elif sort == 'rating_asc':
            queryset = queryset.order_by('rating', '-created_at')
        elif sort == 'liked':
            queryset = queryset.order_by('-likes_total', '-created_at')
        else:
            queryset = queryset.order_by('-created_at')
        return queryset

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated], url_path='eligible')
    def eligible(self, request):
        reviewed_ids = set(Review.objects.filter(author=request.user, parent__isnull=True).values_list('venue_id', flat=True))
        venues = (
            Venue.objects
            .filter(is_published=True, status=Venue.Status.ACTIVE)
            .exclude(id__in=reviewed_ids)
            .order_by('city', 'name')[:12]
        )
        payload = [
            {
                'venue_id': venue.id,
                'venue_name': venue.name,
                'venue_slug': venue.slug,
                'city': venue.city,
                'visits_count': 0,
                'last_visit': None,
            }
            for venue in venues
        ]
        return response.Response(payload, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def toggle_like(self, request, pk=None):
        review = Review.objects.filter(is_visible=True).get(pk=pk)
        user = request.user
        if review.likes.filter(id=user.id).exists():
            review.likes.remove(user)
            liked = False
        else:
            review.likes.add(user)
            liked = True
            if review.author_id != user.id:
                create_notification(
                    recipient=review.author,
                    venue=review.venue,
                    title='Ваш отзыв понравился',
                    message=f'Пользователь поставил лайк вашему отзыву о заведении {review.venue.name}.',
                    event_type='review_liked',
                    target_url=f'/venues/{review.venue.slug}/reviews/',
                )
        return response.Response({'liked': liked, 'likes_count': review.likes.count()}, status=status.HTTP_200_OK)
