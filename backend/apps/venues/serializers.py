from math import pow

from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from apps.booking_rules.models import VenueBookingRule
from apps.booking_rules.serializers import BookingPriceRuleSerializer
from apps.bookings.models import Booking
from apps.bookings.utils import is_hold_active
from apps.halls.models import Hall
from apps.layouts.models import LayoutDecorItem, TableLayout, TableLayoutItem
from apps.tables.models import Table

from .models import Venue, VenueBranding, VenueImage, VenueManagerAssignment


PRESET_PALETTES = {
    'northern_blue': {
        'label': 'Northern blue', 'theme_mode': 'dark', 'background_variant': 'graphite-grid',
        'accent_color': '#2563eb', 'text_color': '#e5eefc', 'card_background_color': '#0f172a', 'card_text_color': '#e5eefc',
        'badge_background_color': '#dbeafe', 'badge_text_color': '#1e3a8a', 'cta_background_color': '#2563eb', 'cta_text_color': '#ffffff',
    },
    'brick_house': {
        'label': 'Brick house', 'theme_mode': 'light', 'background_variant': 'warm-gradient',
        'accent_color': '#b45309', 'text_color': '#111827', 'card_background_color': '#fff7ed', 'card_text_color': '#7c2d12',
        'badge_background_color': '#fed7aa', 'badge_text_color': '#9a3412', 'cta_background_color': '#c2410c', 'cta_text_color': '#ffffff',
    },
    'sage_garden': {
        'label': 'Sage garden', 'theme_mode': 'light', 'background_variant': 'pattern-soft',
        'accent_color': '#166534', 'text_color': '#0f172a', 'card_background_color': '#f0fdf4', 'card_text_color': '#14532d',
        'badge_background_color': '#dcfce7', 'badge_text_color': '#166534', 'cta_background_color': '#166534', 'cta_text_color': '#ffffff',
    },
    'night_neon': {
        'label': 'Night neon', 'theme_mode': 'dark', 'background_variant': 'dark-soft',
        'accent_color': '#7c3aed', 'text_color': '#f5f3ff', 'card_background_color': '#111827', 'card_text_color': '#f5f3ff',
        'badge_background_color': '#312e81', 'badge_text_color': '#e0e7ff', 'cta_background_color': '#7c3aed', 'cta_text_color': '#ffffff',
    },
    'coffee_sand': {
        'label': 'Coffee sand', 'theme_mode': 'light', 'background_variant': 'warm-gradient',
        'accent_color': '#92400e', 'text_color': '#3f2b1c', 'card_background_color': '#fef3c7', 'card_text_color': '#78350f',
        'badge_background_color': '#fde68a', 'badge_text_color': '#92400e', 'cta_background_color': '#92400e', 'cta_text_color': '#ffffff',
    },
    'berry_lounge': {
        'label': 'Berry lounge', 'theme_mode': 'dark', 'background_variant': 'dark-soft',
        'accent_color': '#be185d', 'text_color': '#fff1f2', 'card_background_color': '#4c0519', 'card_text_color': '#ffe4e6',
        'badge_background_color': '#fecdd3', 'badge_text_color': '#9f1239', 'cta_background_color': '#be185d', 'cta_text_color': '#ffffff',
    },
    'forest_ember': {
        'label': 'Forest ember', 'theme_mode': 'dark', 'background_variant': 'pattern-soft',
        'accent_color': '#f97316', 'text_color': '#f7fee7', 'card_background_color': '#1f2a1d', 'card_text_color': '#f7fee7',
        'badge_background_color': '#dcfce7', 'badge_text_color': '#14532d', 'cta_background_color': '#ea580c', 'cta_text_color': '#ffffff',
    },
    'royal_indigo': {
        'label': 'Royal indigo', 'theme_mode': 'dark', 'background_variant': 'graphite-grid',
        'accent_color': '#a78bfa', 'text_color': '#eef2ff', 'card_background_color': '#1e1b4b', 'card_text_color': '#eef2ff',
        'badge_background_color': '#e0e7ff', 'badge_text_color': '#3730a3', 'cta_background_color': '#6d28d9', 'cta_text_color': '#ffffff',
    },
    'sea_breeze': {
        'label': 'Sea breeze', 'theme_mode': 'light', 'background_variant': 'cool-gradient',
        'accent_color': '#0284c7', 'text_color': '#0f172a', 'card_background_color': '#ecfeff', 'card_text_color': '#164e63',
        'badge_background_color': '#cffafe', 'badge_text_color': '#155e75', 'cta_background_color': '#0369a1', 'cta_text_color': '#ffffff',
    },
    'cherry_noir': {
        'label': 'Cherry noir', 'theme_mode': 'dark', 'background_variant': 'dark-soft',
        'accent_color': '#e11d48', 'text_color': '#fff1f2', 'card_background_color': '#2b0b12', 'card_text_color': '#ffe4e6',
        'badge_background_color': '#ffe4e6', 'badge_text_color': '#9f1239', 'cta_background_color': '#be123c', 'cta_text_color': '#ffffff',
    },
    'amber_craft': {
        'label': 'Amber craft', 'theme_mode': 'light', 'background_variant': 'warm-gradient',
        'accent_color': '#d97706', 'text_color': '#3f2b1c', 'card_background_color': '#fffbeb', 'card_text_color': '#78350f',
        'badge_background_color': '#fef3c7', 'badge_text_color': '#92400e', 'cta_background_color': '#b45309', 'cta_text_color': '#ffffff',
    },
    'mint_minimal': {
        'label': 'Mint minimal', 'theme_mode': 'light', 'background_variant': 'neutral-surface',
        'accent_color': '#0f766e', 'text_color': '#0f172a', 'card_background_color': '#f0fdfa', 'card_text_color': '#134e4a',
        'badge_background_color': '#ccfbf1', 'badge_text_color': '#115e59', 'cta_background_color': '#0f766e', 'cta_text_color': '#ffffff',
    },
    'steel_business': {
        'label': 'Steel business', 'theme_mode': 'light', 'background_variant': 'neutral-surface',
        'accent_color': '#475569', 'text_color': '#111827', 'card_background_color': '#f8fafc', 'card_text_color': '#1e293b',
        'badge_background_color': '#e2e8f0', 'badge_text_color': '#334155', 'cta_background_color': '#334155', 'cta_text_color': '#ffffff',
    },
    'sunset_orange': {
        'label': 'Sunset orange', 'theme_mode': 'light', 'background_variant': 'warm-gradient',
        'accent_color': '#ea580c', 'text_color': '#111827', 'card_background_color': '#fff7ed', 'card_text_color': '#7c2d12',
        'badge_background_color': '#fed7aa', 'badge_text_color': '#9a3412', 'cta_background_color': '#ea580c', 'cta_text_color': '#ffffff',
    },
    'lavender_soft': {
        'label': 'Lavender soft', 'theme_mode': 'light', 'background_variant': 'soft-paper',
        'accent_color': '#8b5cf6', 'text_color': '#1f2937', 'card_background_color': '#faf5ff', 'card_text_color': '#4c1d95',
        'badge_background_color': '#ede9fe', 'badge_text_color': '#5b21b6', 'cta_background_color': '#7c3aed', 'cta_text_color': '#ffffff',
    },
    'graphite_gold': {
        'label': 'Graphite gold', 'theme_mode': 'dark', 'background_variant': 'graphite-grid',
        'accent_color': '#f59e0b', 'text_color': '#f8fafc', 'card_background_color': '#111827', 'card_text_color': '#f8fafc',
        'badge_background_color': '#fef3c7', 'badge_text_color': '#92400e', 'cta_background_color': '#d97706', 'cta_text_color': '#111827',
    },
    'cyber_purple': {
        'label': 'Cyber purple', 'theme_mode': 'dark', 'background_variant': 'dark-soft',
        'accent_color': '#d946ef', 'text_color': '#fae8ff', 'card_background_color': '#2e1065', 'card_text_color': '#fae8ff',
        'badge_background_color': '#f5d0fe', 'badge_text_color': '#86198f', 'cta_background_color': '#c026d3', 'cta_text_color': '#ffffff',
    },
    'nordic_frost': {
        'label': 'Nordic frost', 'theme_mode': 'light', 'background_variant': 'cool-gradient',
        'accent_color': '#0369a1', 'text_color': '#0f172a', 'card_background_color': '#f0f9ff', 'card_text_color': '#0c4a6e',
        'badge_background_color': '#e0f2fe', 'badge_text_color': '#075985', 'cta_background_color': '#0369a1', 'cta_text_color': '#ffffff',
    },
}


def _normalize_hex(value: str) -> str:
    value = str(value or '').strip()
    if not value:
        return '#000000'
    if not value.startswith('#'):
        value = f'#{value}'
    if len(value) == 4:
        value = '#' + ''.join(ch * 2 for ch in value[1:])
    return value.lower()


def _channel(value: str) -> float:
    numeric = int(value, 16) / 255
    return numeric / 12.92 if numeric <= 0.03928 else pow((numeric + 0.055) / 1.055, 2.4)


def contrast_ratio(bg: str, fg: str) -> float:
    bg = _normalize_hex(bg)
    fg = _normalize_hex(fg)
    bg_l = 0.2126 * _channel(bg[1:3]) + 0.7152 * _channel(bg[3:5]) + 0.0722 * _channel(bg[5:7])
    fg_l = 0.2126 * _channel(fg[1:3]) + 0.7152 * _channel(fg[3:5]) + 0.0722 * _channel(fg[5:7])
    lighter = max(bg_l, fg_l)
    darker = min(bg_l, fg_l)
    return (lighter + 0.05) / (darker + 0.05)


class VenueBrandingSerializer(serializers.ModelSerializer):
    class Meta:
        model = VenueBranding
        fields = [
            'theme_mode', 'theme_preset', 'use_custom_palette', 'accent_color', 'background_variant', 'text_color',
            'card_background_color', 'card_text_color', 'badge_background_color', 'badge_text_color',
            'cta_background_color', 'cta_text_color', 'contrast_warning',
        ]

    def validate(self, attrs):
        use_custom = attrs.get('use_custom_palette', getattr(self.instance, 'use_custom_palette', False))
        preset = attrs.get('theme_preset', getattr(self.instance, 'theme_preset', 'northern_blue'))
        palette = {key: value for key, value in PRESET_PALETTES.get(preset, PRESET_PALETTES['northern_blue']).items() if key != 'label'}
        if use_custom:
            palette.update({
                'card_background_color': attrs.get('card_background_color', getattr(self.instance, 'card_background_color', '#ffffff')),
                'card_text_color': attrs.get('card_text_color', getattr(self.instance, 'card_text_color', '#111827')),
                'badge_background_color': attrs.get('badge_background_color', getattr(self.instance, 'badge_background_color', '#eef2ff')),
                'badge_text_color': attrs.get('badge_text_color', getattr(self.instance, 'badge_text_color', '#312e81')),
                'cta_background_color': attrs.get('cta_background_color', getattr(self.instance, 'cta_background_color', '#111827')),
                'cta_text_color': attrs.get('cta_text_color', getattr(self.instance, 'cta_text_color', '#ffffff')),
                'accent_color': attrs.get('accent_color', getattr(self.instance, 'accent_color', '#111827')),
                'text_color': attrs.get('text_color', getattr(self.instance, 'text_color', '#111827')),
            })

        if not use_custom:
            attrs.update(palette)

        checks = [
            ('Карточки', palette['card_background_color'], palette['card_text_color']),
            ('Бейджи', palette['badge_background_color'], palette['badge_text_color']),
            ('CTA', palette['cta_background_color'], palette['cta_text_color']),
        ]
        warnings = []
        for label, bg, fg in checks:
            ratio = contrast_ratio(bg, fg)
            if ratio < 4.5:
                warnings.append(f'{label}: недостаточный контраст ({ratio:.2f})')
        if warnings:
            raise serializers.ValidationError({'contrast_warning': ' | '.join(warnings)})
        attrs['contrast_warning'] = False
        return attrs


class VenueImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = VenueImage
        fields = ['id', 'venue', 'image', 'image_url', 'alt_text', 'is_cover', 'created_at']
        read_only_fields = ['id', 'venue', 'image_url', 'created_at']

    def get_image_url(self, obj):
        if not obj.image:
            return ''
        # Возвращаем относительный путь, чтобы фронт всегда открывал фото через текущий хост
        # и порт сайта, например /media/venues/photo.jpg. Иначе за nginx URL мог
        # собираться как http://localhost/media/... без :8080 и уходить в локальный Apache.
        return obj.image.url




class VenueManagerAssignmentSerializer(serializers.ModelSerializer):
    manager_email = serializers.EmailField(source='manager.email', read_only=True)
    manager_name = serializers.SerializerMethodField()
    manager_role = serializers.CharField(source='manager.role', read_only=True)

    class Meta:
        model = VenueManagerAssignment
        fields = ['id', 'venue', 'manager', 'manager_email', 'manager_name', 'manager_role', 'is_active', 'created_at']
        read_only_fields = ['id', 'venue', 'manager', 'manager_email', 'manager_name', 'manager_role', 'created_at']

    def get_manager_name(self, obj):
        parts = [obj.manager.last_name, obj.manager.first_name, obj.manager.middle_name]
        return ' '.join([part for part in parts if part]).strip() or obj.manager.email


class VenueBookingRuleEmbeddedSerializer(serializers.ModelSerializer):
    class Meta:
        model = VenueBookingRule
        fields = [
            'id', 'venue', 'default_duration_minutes', 'slot_step_minutes', 'cleanup_buffer_minutes', 'payment_hold_minutes',
            'min_booking_notice_minutes', 'free_cancellation_before_minutes', 'no_show_after_minutes',
            'requires_manager_confirmation', 'allow_client_approximate_time', 'allow_table_combination', 'allow_shared_seating',
            'allow_manager_reschedule', 'deposit_amount', 'deposit_currency',
        ]


class LayoutItemSerializer(serializers.ModelSerializer):
    table = serializers.IntegerField(source='table_id', read_only=True)

    class Meta:
        model = TableLayoutItem
        fields = ['table', 'x', 'y', 'width', 'height', 'rotation']


class LayoutDecorEmbeddedSerializer(serializers.ModelSerializer):
    class Meta:
        model = LayoutDecorItem
        fields = ['id', 'item_type', 'label', 'x', 'y', 'width', 'height', 'rotation']


class HallLayoutEmbeddedSerializer(serializers.ModelSerializer):
    items = LayoutItemSerializer(many=True, read_only=True)
    decor_items = LayoutDecorEmbeddedSerializer(many=True, read_only=True)

    class Meta:
        model = TableLayout
        fields = ['id', 'hall', 'canvas_width', 'canvas_height', 'is_active', 'items', 'decor_items']


ACTIVE_OCCUPANCY_STATUSES = {
    Booking.Status.HOLD,
    Booking.Status.PENDING_CONFIRMATION,
    Booking.Status.WAITING_FOR_PAYMENT,
    Booking.Status.PAID,
    Booking.Status.CONFIRMED,
}


class TableEmbeddedSerializer(serializers.ModelSerializer):
    layout_item = LayoutItemSerializer(read_only=True)
    occupancy = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = ['id', 'name', 'seats_count', 'is_active', 'is_combinable', 'note', 'layout_item', 'occupancy']

    def get_occupancy(self, obj):
        reference_dt = self.context.get('occupancy_at') or timezone.localtime()
        interval_start = self.context.get('occupancy_interval_start')
        interval_end = self.context.get('occupancy_interval_end')
        request = self.context.get('request')
        current_user_id = getattr(getattr(request, 'user', None), 'id', None)
        bookings_by_id = {}
        for booking in list(obj.bookings.all()) + list(obj.multi_bookings.all()):
            bookings_by_id[booking.id] = booking
        bookings = list(bookings_by_id.values())
        active_bookings = [booking for booking in bookings if booking.status in ACTIVE_OCCUPANCY_STATUSES and (booking.status != Booking.Status.HOLD or is_hold_active(booking))]

        def build_payload(current_booking, *, mode, occupied_label, free_label, next_booking=None):
            if current_booking:
                if current_booking.status == Booking.Status.HOLD and current_booking.customer_id == current_user_id:
                    return {'state': 'held_by_you', 'label': 'Ваша бронь', 'mode': mode, 'status': current_booking.status, 'guests_count': current_booking.guests_count, 'booking_start': current_booking.booking_start, 'booking_end': current_booking.booking_end, 'hold_expires_at': current_booking.hold_expires_at}
                label = occupied_label
                if current_booking.status == Booking.Status.HOLD:
                    label = 'Зарезервирован'
                return {'state': 'occupied', 'label': label, 'mode': mode, 'status': current_booking.status, 'guests_count': current_booking.guests_count, 'booking_start': current_booking.booking_start, 'booking_end': current_booking.booking_end, 'hold_expires_at': current_booking.hold_expires_at}
            free_until = next_booking.booking_start if next_booking else None
            return {'state': 'free', 'label': free_label, 'mode': mode, 'status': None, 'guests_count': None, 'booking_start': None, 'booking_end': free_until, 'hold_expires_at': None}

        if interval_start and interval_end and interval_end > interval_start:
            overlapping = [booking for booking in active_bookings if booking.booking_start < interval_end and booking.booking_end > interval_start]
            overlapping.sort(key=lambda booking: booking.booking_start)
            current_booking = overlapping[0] if overlapping else None
            next_bookings = [booking for booking in active_bookings if booking.booking_start >= interval_start]
            next_bookings.sort(key=lambda booking: booking.booking_start)
            next_booking = next_bookings[0] if next_bookings else None
            return build_payload(current_booking, mode='interval', occupied_label='Занят в выбранный интервал', free_label='Свободен в выбранный интервал', next_booking=next_booking)
        current = [booking for booking in active_bookings if booking.booking_start <= reference_dt < booking.booking_end]
        current.sort(key=lambda booking: booking.booking_start)
        next_bookings = [booking for booking in active_bookings if booking.booking_start >= reference_dt]
        next_bookings.sort(key=lambda booking: booking.booking_start)
        current_booking = current[0] if current else None
        next_booking = next_bookings[0] if next_bookings else None
        return build_payload(current_booking, mode='now', occupied_label='Занят сейчас', free_label='Свободен сейчас', next_booking=next_booking)


class HallEmbeddedSerializer(serializers.ModelSerializer):
    tables = TableEmbeddedSerializer(many=True, read_only=True)
    layout = HallLayoutEmbeddedSerializer(read_only=True)

    class Meta:
        model = Hall
        fields = ['id', 'name', 'description', 'capacity', 'is_active', 'sort_order', 'tables', 'layout']


class VenueListSerializer(serializers.ModelSerializer):
    hall_count = serializers.SerializerMethodField()
    cover_image_url = serializers.SerializerMethodField()
    max_hall_capacity = serializers.SerializerMethodField()
    requires_manager_confirmation = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = [
            'id', 'name', 'slug', 'country', 'city', 'district', 'address', 'latitude', 'longitude', 'cuisine', 'price_category', 'venue_theme',
            'short_description', 'average_rating', 'review_count', 'cover_image_url', 'status', 'is_published', 'hall_count', 'max_hall_capacity', 'requires_manager_confirmation', 'distance_km',
        ]

    def get_hall_count(self, obj):
        return obj.halls.filter(is_active=True).count()

    def get_cover_image_url(self, obj):
        image = None
        images = list(getattr(obj, '_prefetched_objects_cache', {}).get('images', []))
        if images:
            image = next((item for item in images if item.is_cover), images[0])
        else:
            image = obj.images.filter(is_cover=True).first() or obj.images.first()
        if not image or not image.image:
            return ''
        # Относительный путь безопаснее абсолютного: браузер сам добавит текущий origin.
        return image.image.url

    def get_max_hall_capacity(self, obj):
        return obj.halls.filter(is_active=True).aggregate(value=Max('capacity')).get('value') or 0

    def get_requires_manager_confirmation(self, obj):
        rule = getattr(obj, 'booking_rule', None)
        return bool(rule and rule.requires_manager_confirmation)

    def get_review_count(self, obj):
        return obj.reviews.filter(parent__isnull=True, is_visible=True).count()

    def get_distance_km(self, obj):
        distances = self.context.get('distance_by_venue_id') or {}
        value = distances.get(obj.id)
        return round(value, 1) if value is not None else None


class VenueDetailSerializer(serializers.ModelSerializer):
    branding = VenueBrandingSerializer(read_only=True)
    images = VenueImageSerializer(many=True, read_only=True)
    booking_rule = VenueBookingRuleEmbeddedSerializer(read_only=True)
    price_rules = BookingPriceRuleSerializer(many=True, read_only=True)
    halls = HallEmbeddedSerializer(many=True, read_only=True)
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = [
            'id', 'name', 'slug', 'country', 'city', 'district', 'address', 'latitude', 'longitude', 'cuisine', 'price_category', 'venue_theme',
            'short_description', 'description', 'average_rating', 'review_count', 'status', 'is_published', 'images', 'branding', 'booking_rule', 'price_rules', 'halls',
        ]


    def get_review_count(self, obj):
        return obj.reviews.filter(parent__isnull=True, is_visible=True).count()


class VenueWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = [
            'id', 'legal_entity', 'name', 'slug', 'country', 'city', 'district', 'address', 'latitude', 'longitude', 'cuisine', 'price_category', 'venue_theme',
            'short_description', 'description', 'status', 'is_published',
        ]
        read_only_fields = ['id', 'status', 'is_published']
        extra_kwargs = {'slug': {'required': False, 'allow_blank': True}}
