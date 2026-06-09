from decimal import Decimal
from math import asin, cos, radians, sin, sqrt

from django.contrib.auth import get_user_model
from django.db.models import Case, IntegerField, Prefetch, Q, When
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import decorators, exceptions, parsers, permissions, response, status, viewsets

from apps.bookings.models import Booking
from apps.bookings.utils import expire_overdue_payment_bookings
from apps.common.access import user_can_manage_venue, user_manageable_venue_ids, user_is_platform_staff

from .models import Venue, VenueBranding, VenueImage, VenueManagerAssignment
from .serializers import PRESET_PALETTES, VenueBrandingSerializer, VenueDetailSerializer, VenueImageSerializer, VenueListSerializer, VenueManagerAssignmentSerializer, VenueWriteSerializer


def haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return radius * c


User = get_user_model()


class VenueViewSet(viewsets.ModelViewSet):
    lookup_field = 'slug'

    def initial(self, request, *args, **kwargs):
        self._distance_by_venue_id = {}
        super().initial(request, *args, **kwargs)

    def get_queryset(self):
        expire_overdue_payment_bookings()
        queryset = Venue.objects.select_related('branding', 'booking_rule', 'owner').prefetch_related(
            'halls__tables__layout_item',
            'halls__layout__decor_items',
            'images',
            'price_rules',
            Prefetch(
                'halls__tables__bookings',
                queryset=Booking.objects.only('id', 'table_id', 'customer_id', 'guests_count', 'booking_start', 'booking_end', 'status', 'hold_expires_at').order_by('booking_start'),
            ),
            Prefetch(
                'halls__tables__multi_bookings',
                queryset=Booking.objects.only('id', 'table_id', 'customer_id', 'guests_count', 'booking_start', 'booking_end', 'status', 'hold_expires_at').order_by('booking_start'),
            ),
        )
        if self.action in {'list', 'retrieve'}:
            user = self.request.user
            if user.is_authenticated:
                manageable_ids = list(user_manageable_venue_ids(user))
                if manageable_ids:
                    queryset = queryset.filter(Q(is_published=True, status=Venue.Status.ACTIVE) | Q(id__in=manageable_ids)).distinct()
                else:
                    queryset = queryset.filter(is_published=True, status=Venue.Status.ACTIVE)
            else:
                queryset = queryset.filter(is_published=True, status=Venue.Status.ACTIVE)
        return self.apply_catalog_filters(queryset)

    def apply_catalog_filters(self, queryset):
        params = self.request.query_params
        q_value = (params.get('q') or '').strip()
        city = (params.get('city') or '').strip()
        district = (params.get('district') or '').strip()
        cuisine = (params.get('cuisine') or '').strip()
        price_category = (params.get('price_category') or '').strip()
        venue_theme = (params.get('venue_theme') or '').strip()
        if q_value:
            queryset = queryset.filter(
                Q(name__icontains=q_value)
                | Q(city__icontains=q_value)
                | Q(district__icontains=q_value)
                | Q(address__icontains=q_value)
                | Q(cuisine__icontains=q_value)
                | Q(short_description__icontains=q_value)
            )
        if city:
            queryset = queryset.filter(city__iexact=city)
        if district:
            queryset = queryset.filter(district__iexact=district)
        if cuisine:
            queryset = queryset.filter(cuisine__icontains=cuisine)
        if price_category:
            queryset = queryset.filter(price_category=price_category)
        if venue_theme:
            queryset = queryset.filter(venue_theme=venue_theme)

        lat = params.get('lat')
        lng = params.get('lng')
        radius_km = params.get('radius_km')
        self._distance_by_venue_id = {}
        if lat and lng:
            try:
                lat = float(lat)
                lng = float(lng)
                radius_km = float(radius_km or 15)
                candidate_list = list(queryset.exclude(latitude__isnull=True).exclude(longitude__isnull=True))
                distance_pairs = []
                for venue in candidate_list:
                    distance = haversine_km(lat, lng, float(venue.latitude), float(venue.longitude))
                    if distance <= radius_km:
                        distance_pairs.append((venue.id, distance))
                distance_pairs.sort(key=lambda item: item[1])
                matched_ids = [venue_id for venue_id, _ in distance_pairs]
                self._distance_by_venue_id = dict(distance_pairs)
                if matched_ids:
                    ordering = Case(
                        *[When(id=venue_id, then=position) for position, venue_id in enumerate(matched_ids)],
                        output_field=IntegerField(),
                    )
                    queryset = queryset.filter(id__in=matched_ids).order_by(ordering)
                else:
                    queryset = queryset.none()
            except (TypeError, ValueError):
                pass
        return queryset

    def get_permissions(self):
        if self.action in {'list', 'retrieve', 'geo_options', 'detect_city', 'branding_presets', 'map_points'}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in {'list', 'my', 'manageable'}:
            return VenueListSerializer
        if self.action == 'retrieve':
            return VenueDetailSerializer
        if self.action == 'branding':
            return VenueBrandingSerializer
        return VenueWriteSerializer

    def _parse_dt_query(self, name):
        raw_value = self.request.query_params.get(name)
        if not raw_value:
            return None
        parsed = parse_datetime(raw_value)
        if not parsed:
            return None
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        return timezone.localtime(parsed)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        interval_start = self._parse_dt_query('booking_start')
        interval_end = self._parse_dt_query('booking_end')
        context['occupancy_at'] = interval_start or timezone.localtime()
        context['distance_by_venue_id'] = getattr(self, '_distance_by_venue_id', {})
        if interval_start and interval_end and interval_end > interval_start:
            context['occupancy_interval_start'] = interval_start
            context['occupancy_interval_end'] = interval_end
        return context

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def map_points(self, request):
        queryset = (
            Venue.objects
            .filter(is_published=True, status=Venue.Status.ACTIVE)
            .select_related('branding', 'booking_rule')
            .prefetch_related('halls')
            .order_by('city', 'district', 'name')
        )
        serializer = VenueListSerializer(queryset, many=True, context=self.get_serializer_context())
        return response.Response(serializer.data)

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def geo_options(self, request):
        published = Venue.objects.filter(is_published=True, status=Venue.Status.ACTIVE)
        cities = []
        for city in published.exclude(city='').values_list('city', flat=True).distinct().order_by('city'):
            districts = list(
                published.filter(city__iexact=city)
                .exclude(district='')
                .values_list('district', flat=True)
                .distinct()
                .order_by('district')
            )
            cities.append({'city': city, 'districts': districts})
        cuisines = list(published.exclude(cuisine='').values_list('cuisine', flat=True).distinct().order_by('cuisine'))
        price_categories = [{'value': value, 'label': label} for value, label in Venue.PriceCategory.choices]
        venue_themes = [{'value': value, 'label': label} for value, label in Venue.Theme.choices]
        return response.Response({
            'cities': cities,
            'cuisines': cuisines,
            'price_categories': price_categories,
            'venue_themes': venue_themes,
        })

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def detect_city(self, request):
        lat = request.query_params.get('lat')
        lng = request.query_params.get('lng')
        if not lat or not lng:
            return response.Response({'detail': 'Передайте lat и lng.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lat_value = float(lat)
            lng_value = float(lng)
        except (TypeError, ValueError):
            return response.Response({'detail': 'Координаты должны быть числами.'}, status=status.HTTP_400_BAD_REQUEST)
        venues = Venue.objects.filter(is_published=True, status=Venue.Status.ACTIVE).exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        nearest = None
        for venue in venues:
            distance = haversine_km(lat_value, lng_value, float(venue.latitude), float(venue.longitude))
            if nearest is None or distance < nearest['distance_km']:
                nearest = {
                    'city': venue.city,
                    'district': venue.district,
                    'distance_km': distance,
                    'latitude': float(venue.latitude),
                    'longitude': float(venue.longitude),
                    'venue_slug': venue.slug,
                    'venue_name': venue.name,
                }
        if nearest is None:
            return response.Response({'detail': 'В каталоге пока нет заведений с координатами.'}, status=status.HTTP_404_NOT_FOUND)
        nearest['distance_km'] = round(nearest['distance_km'], 1)
        return response.Response(nearest)

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def branding_presets(self, request):
        return response.Response([
            {'value': key, **value}
            for key, value in PRESET_PALETTES.items()
        ])


    def _can_manage_staff(self, user, venue):
        return bool(getattr(user, 'is_authenticated', False) and (user_is_platform_staff(user) or venue.owner_id == user.id))

    def _validate_legal_entity_for_user(self, serializer):
        legal_entity = serializer.validated_data.get('legal_entity')
        if legal_entity and legal_entity.owner_id != self.request.user.id and not user_is_platform_staff(self.request.user):
            raise exceptions.PermissionDenied('Нельзя привязать к заведению чужое юридическое лицо.')

    def perform_create(self, serializer):
        self._validate_legal_entity_for_user(serializer)
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        self._validate_legal_entity_for_user(serializer)
        serializer.save()

    def create(self, request, *args, **kwargs):
        if request.user.role != 'owner' and not user_is_platform_staff(request.user):
            return response.Response({'detail': 'Только владелец может создавать заведения.'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        return super().update(request, *args, **kwargs)

    partial_update = update

    def destroy(self, request, *args, **kwargs):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        return super().destroy(request, *args, **kwargs)


    @decorators.action(detail=True, methods=['get', 'post'], permission_classes=[permissions.IsAuthenticated], parser_classes=[parsers.JSONParser, parsers.FormParser])
    def managers(self, request, slug=None):
        venue = self.get_object()
        if not self._can_manage_staff(request.user, venue):
            return response.Response({'detail': 'Управлять менеджерами может только владелец заведения или администратор платформы.'}, status=403)

        if request.method.lower() == 'get':
            queryset = venue.manager_assignments.filter(is_active=True).select_related('manager').order_by('manager__last_name', 'manager__first_name', 'manager__email')
            serializer = VenueManagerAssignmentSerializer(queryset, many=True, context=self.get_serializer_context())
            return response.Response(serializer.data)

        email = str(request.data.get('email') or '').strip().lower()
        if not email:
            return response.Response({'email': 'Укажите email зарегистрированного пользователя.'}, status=status.HTTP_400_BAD_REQUEST)
        manager = User.objects.filter(email__iexact=email, is_active=True).first()
        if not manager:
            return response.Response({'email': 'Пользователь с таким email не найден. Сначала он должен зарегистрироваться на платформе.'}, status=status.HTTP_404_NOT_FOUND)
        if manager.id == venue.owner_id:
            return response.Response({'email': 'Владелец уже управляет этим заведением. Его не нужно добавлять менеджером.'}, status=status.HTTP_400_BAD_REQUEST)
        if user_is_platform_staff(manager):
            return response.Response({'email': 'Администратора или модератора платформы не нужно назначать менеджером заведения.'}, status=status.HTTP_400_BAD_REQUEST)

        assignment, _ = VenueManagerAssignment.objects.update_or_create(
            venue=venue,
            manager=manager,
            defaults={'is_active': True},
        )
        serializer = VenueManagerAssignmentSerializer(assignment, context=self.get_serializer_context())
        return response.Response(serializer.data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['delete'], permission_classes=[permissions.IsAuthenticated], url_path=r'managers/(?P<assignment_id>[^/.]+)')
    def delete_manager(self, request, slug=None, assignment_id=None):
        venue = self.get_object()
        if not self._can_manage_staff(request.user, venue):
            return response.Response({'detail': 'Управлять менеджерами может только владелец заведения или администратор платформы.'}, status=403)
        assignment = venue.manager_assignments.filter(id=assignment_id).first()
        if not assignment:
            return response.Response({'detail': 'Назначение менеджера не найдено.'}, status=status.HTTP_404_NOT_FOUND)
        assignment.delete()
        return response.Response(status=status.HTTP_204_NO_CONTENT)


    @decorators.action(
        detail=True,
        methods=['get', 'post'],
        permission_classes=[permissions.AllowAny],
        parser_classes=[parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser],
    )
    def images(self, request, slug=None):
        venue = self.get_object()
        if request.method.lower() == 'get':
            if not (venue.is_published and venue.status == Venue.Status.ACTIVE) and not user_can_manage_venue(request.user, venue):
                return response.Response({'detail': 'Фотографии этого заведения недоступны.'}, status=403)
            queryset = venue.images.order_by('-is_cover', '-created_at', 'id')
            serializer = VenueImageSerializer(queryset, many=True, context=self.get_serializer_context())
            return response.Response(serializer.data)

        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Добавлять фотографии может только владелец или менеджер этого заведения.'}, status=403)

        uploaded_files = []
        uploaded_files.extend(request.FILES.getlist('images'))
        uploaded_files.extend(request.FILES.getlist('image'))
        uploaded_files = [item for item in uploaded_files if item]
        if not uploaded_files:
            return response.Response({'image': 'Выберите хотя бы одно изображение.'}, status=status.HTTP_400_BAD_REQUEST)

        alt_text = str(request.data.get('alt_text') or '').strip()
        is_cover = str(request.data.get('is_cover') or '').strip().lower() in {'1', 'true', 'yes', 'on'}
        created = []
        for index, uploaded in enumerate(uploaded_files[:8]):
            image = VenueImage.objects.create(
                venue=venue,
                image=uploaded,
                alt_text=alt_text or f'{venue.name}: фото',
                is_cover=is_cover and index == 0,
            )
            if image.is_cover:
                VenueImage.objects.filter(venue=venue).exclude(id=image.id).update(is_cover=False)
            created.append(image)
        serializer = VenueImageSerializer(created, many=True, context=self.get_serializer_context())
        return response.Response(serializer.data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated], url_path=r'images/(?P<image_id>[^/.]+)/set-cover')
    def set_cover_image(self, request, slug=None, image_id=None):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        image = venue.images.filter(id=image_id).first()
        if not image:
            return response.Response({'detail': 'Изображение не найдено.'}, status=status.HTTP_404_NOT_FOUND)
        VenueImage.objects.filter(venue=venue).update(is_cover=False)
        image.is_cover = True
        image.save(update_fields=['is_cover', 'updated_at'])
        return response.Response(VenueImageSerializer(image, context=self.get_serializer_context()).data)

    @decorators.action(detail=True, methods=['delete'], permission_classes=[permissions.IsAuthenticated], url_path=r'images/(?P<image_id>[^/.]+)')
    def delete_image(self, request, slug=None, image_id=None):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        image = venue.images.filter(id=image_id).first()
        if not image:
            return response.Response({'detail': 'Изображение не найдено.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        first_image = venue.images.order_by('-created_at').first()
        if first_image and not venue.images.filter(is_cover=True).exists():
            first_image.is_cover = True
            first_image.save(update_fields=['is_cover', 'updated_at'])
        return response.Response(status=status.HTTP_204_NO_CONTENT)

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def manageable(self, request):
        queryset = Venue.objects.filter(id__in=user_manageable_venue_ids(request.user)).select_related('branding', 'booking_rule').distinct()
        queryset = self.apply_catalog_filters(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return response.Response(serializer.data)

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def my(self, request):
        queryset = Venue.objects.filter(owner=request.user).select_related('branding', 'booking_rule')
        queryset = self.apply_catalog_filters(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return response.Response(serializer.data)

    @decorators.action(detail=True, methods=['get', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def branding(self, request, slug=None):
        venue = self.get_object()
        branding, _ = VenueBranding.objects.get_or_create(venue=venue)
        if request.method.lower() == 'get':
            if not (venue.is_published and venue.status == Venue.Status.ACTIVE) and not user_can_manage_venue(request.user, venue):
                return response.Response({'detail': 'Тема этого заведения недоступна.'}, status=403)
            return response.Response(VenueBrandingSerializer(branding).data)
        if not user_can_manage_venue(request.user, venue):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        serializer = VenueBrandingSerializer(branding, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return response.Response(serializer.data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def submit_for_moderation(self, request, slug=None):
        venue = self.get_object()
        if venue.owner_id != request.user.id and not user_is_platform_staff(request.user):
            return response.Response({'detail': 'Недостаточно прав.'}, status=403)
        venue.status = Venue.Status.PENDING_MODERATION
        venue.is_published = False
        venue.save(update_fields=['status', 'is_published', 'updated_at'])
        return response.Response({'detail': 'Заведение отправлено на модерацию.', 'status': venue.status})

    @decorators.action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def moderation_queue(self, request):
        if not user_is_platform_staff(request.user):
            return response.Response({'detail': 'Только модератор платформы может просматривать очередь модерации.'}, status=403)
        queryset = Venue.objects.filter(status=Venue.Status.PENDING_MODERATION).select_related('owner', 'branding', 'booking_rule').order_by('created_at')
        serializer = VenueListSerializer(queryset, many=True)
        return response.Response(serializer.data)

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def publish(self, request, slug=None):
        venue = self.get_object()
        if not user_is_platform_staff(request.user):
            return response.Response({'detail': 'Только модератор платформы может публиковать заведения.'}, status=403)
        venue.status = Venue.Status.ACTIVE
        venue.is_published = True
        venue.save(update_fields=['status', 'is_published', 'updated_at'])
        return response.Response({'detail': 'Заведение опубликовано.', 'status': venue.status})

    @decorators.action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def return_to_draft(self, request, slug=None):
        venue = self.get_object()
        if not user_is_platform_staff(request.user):
            return response.Response({'detail': 'Только модератор платформы может возвращать заведения на доработку.'}, status=403)
        venue.status = Venue.Status.DRAFT
        venue.is_published = False
        venue.save(update_fields=['status', 'is_published', 'updated_at'])
        return response.Response({'detail': 'Заведение возвращено владельцу на доработку.', 'status': venue.status})
