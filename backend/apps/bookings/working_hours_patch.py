from __future__ import annotations

_applied = False


def apply_booking_working_hours_patch():
    """Validate new and rescheduled bookings against venue working hours."""
    global _applied
    if _applied:
        return

    from rest_framework import serializers

    from apps.booking_rules.working_hours import booking_interval_working_hours_error
    from .serializers import BookingCreateSerializer, BookingManagerRescheduleSerializer

    original_create_validate = BookingCreateSerializer.validate
    original_reschedule_validate = BookingManagerRescheduleSerializer.validate

    def create_validate(self, attrs):
        validated = original_create_validate(self, attrs)
        venue = validated.get('venue')
        booking_start = validated.get('booking_start')
        booking_end = validated.get('booking_end')
        error = booking_interval_working_hours_error(venue, booking_start, booking_end)
        if error:
            raise serializers.ValidationError({'detail': error})
        return validated

    def reschedule_validate(self, attrs):
        validated = original_reschedule_validate(self, attrs)
        booking = self.context['booking']
        venue = booking.venue
        booking_start = validated.get('booking_start')
        booking_end = validated.get('booking_end')
        error = booking_interval_working_hours_error(venue, booking_start, booking_end)
        if error:
            raise serializers.ValidationError({'detail': error})
        return validated

    BookingCreateSerializer.validate = create_validate
    BookingManagerRescheduleSerializer.validate = reschedule_validate
    _applied = True
