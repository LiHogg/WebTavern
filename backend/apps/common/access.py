from __future__ import annotations

from typing import Iterable

from apps.venues.models import Venue, VenueManagerAssignment

PLATFORM_ROLES = {"platform_admin", "moderator"}
MANAGEMENT_ROLES = {"owner", "manager"}


def user_is_platform_staff(user) -> bool:
    return bool(getattr(user, "is_authenticated", False) and (user.is_superuser or getattr(user, "role", None) in PLATFORM_ROLES))


def user_can_manage_venue(user, venue: Venue) -> bool:
    if not getattr(user, "is_authenticated", False):
        return False
    if user_is_platform_staff(user):
        return True
    if venue.owner_id == user.id:
        return True
    return VenueManagerAssignment.objects.filter(venue=venue, manager=user, is_active=True).exists()


def user_manageable_venue_ids(user) -> Iterable[int]:
    if not getattr(user, "is_authenticated", False):
        return []
    if user_is_platform_staff(user):
        return Venue.objects.values_list("id", flat=True)
    owned = Venue.objects.filter(owner=user).values_list("id", flat=True)
    managed = VenueManagerAssignment.objects.filter(manager=user, is_active=True).values_list("venue_id", flat=True)
    return list(set([*owned, *managed]))


def user_can_use_client_mode(user) -> bool:
    return bool(getattr(user, "is_authenticated", False))
