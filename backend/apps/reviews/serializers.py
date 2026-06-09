from django.db.models import Avg
from rest_framework import serializers

from apps.common.access import user_can_manage_venue
from apps.venues.models import Venue

from .models import Review, ReviewImage


class ReviewImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ReviewImage
        fields = ['id', 'image', 'image_url', 'alt_text', 'created_at']
        read_only_fields = ['id', 'image_url', 'created_at']

    def get_image_url(self, obj):
        if not obj.image:
            return ''
        return obj.image.url


class ReviewReplySerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_role = serializers.CharField(source='author.role', read_only=True)
    likes_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    images = ReviewImageSerializer(many=True, read_only=True)

    class Meta:
        model = Review
        fields = [
            'id', 'venue', 'parent', 'author', 'author_name', 'author_role', 'text', 'rating',
            'images', 'likes_count', 'liked_by_me', 'created_at',
        ]
        read_only_fields = ['id', 'author', 'author_name', 'author_role', 'images', 'likes_count', 'liked_by_me', 'created_at']

    def get_author_name(self, obj):
        return ' '.join(part for part in [obj.author.first_name, obj.author.last_name] if part).strip() or obj.author.email

    def get_likes_count(self, obj):
        return getattr(obj, 'likes_total', None) or obj.likes.count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            return False
        return obj.likes.filter(id=user.id).exists()


class ReviewSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_role = serializers.CharField(source='author.role', read_only=True)
    likes_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()
    can_reply = serializers.SerializerMethodField()
    images = ReviewImageSerializer(many=True, read_only=True)

    class Meta:
        model = Review
        fields = [
            'id', 'venue', 'parent', 'author', 'author_name', 'author_role', 'rating', 'text',
            'images', 'likes_count', 'liked_by_me', 'replies', 'can_reply', 'created_at',
        ]
        read_only_fields = ['id', 'author', 'author_name', 'author_role', 'images', 'likes_count', 'liked_by_me', 'replies', 'can_reply', 'created_at']

    def get_author_name(self, obj):
        return ' '.join(part for part in [obj.author.first_name, obj.author.last_name] if part).strip() or obj.author.email

    def get_likes_count(self, obj):
        return getattr(obj, 'likes_total', None) or obj.likes.count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            return False
        return obj.likes.filter(id=user.id).exists()

    def get_replies(self, obj):
        replies = getattr(obj, 'prefetched_visible_replies', None)
        if replies is None:
            replies = obj.replies.filter(is_visible=True).select_related('author').prefetch_related('likes', 'images').order_by('created_at')
        return ReviewReplySerializer(replies, many=True, context=self.context).data

    def get_can_reply(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(getattr(user, 'is_authenticated', False) and user_can_manage_venue(user, obj.venue))

    def validate(self, attrs):
        request = self.context['request']
        user = request.user
        parent = attrs.get('parent')
        venue = attrs.get('venue')

        if parent:
            venue = parent.venue
            attrs['venue'] = venue
            attrs['rating'] = None
            if not user_can_manage_venue(user, venue):
                raise serializers.ValidationError({'parent': 'Ответы на отзывы доступны только владельцу или менеджеру этого заведения.'})
        else:
            if not venue:
                raise serializers.ValidationError({'venue': 'Нужно указать заведение.'})
            rating = attrs.get('rating')
            if rating is None:
                raise serializers.ValidationError({'rating': 'Для отзыва нужна оценка.'})
            if rating < 1 or rating > 5:
                raise serializers.ValidationError({'rating': 'Оценка должна быть от 1 до 5.'})
            if Review.objects.filter(venue=venue, author=user, parent__isnull=True).exists():
                raise serializers.ValidationError({'venue': 'Вы уже оставили отзыв об этом заведении.'})
        return attrs

    def create(self, validated_data):
        request = self.context['request']
        validated_data['author'] = request.user
        review = super().create(validated_data)

        if not review.parent_id:
            uploaded_files = []
            uploaded_files.extend(request.FILES.getlist('images'))
            uploaded_files.extend(request.FILES.getlist('image'))
            for uploaded in [item for item in uploaded_files if item][:5]:
                ReviewImage.objects.create(
                    review=review,
                    image=uploaded,
                    alt_text=f'{review.venue.name}: фото из отзыва',
                )

        refresh_venue_rating(review.venue)
        return review


def refresh_venue_rating(venue: Venue):
    stats = venue.reviews.filter(parent__isnull=True, is_visible=True).aggregate(avg_rating=Avg('rating'))
    venue.average_rating = stats['avg_rating'] or 0
    venue.save(update_fields=['average_rating', 'updated_at'])
