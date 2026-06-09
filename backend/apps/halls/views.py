from django.db.models import Q
from rest_framework import permissions, response, viewsets

from apps.common.access import user_can_manage_venue, user_manageable_venue_ids

from .models import Hall
from .serializers import HallSerializer


class HallViewSet(viewsets.ModelViewSet):
    serializer_class = HallSerializer

    def get_queryset(self):
        queryset = Hall.objects.select_related("venue")
        user = self.request.user
        venue_id = self.request.query_params.get("venue")
        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        if self.request.method == "GET":
            public_filter = Q(venue__is_published=True, venue__status='active')
            manageable_ids = list(user_manageable_venue_ids(user)) if getattr(user, 'is_authenticated', False) else []
            queryset = queryset.filter(public_filter | Q(venue_id__in=manageable_ids)).distinct()
            include_inactive = self.request.query_params.get("include_inactive") in {"1", "true", "True"}
            if not include_inactive or not manageable_ids:
                queryset = queryset.filter(is_active=True)
        return queryset

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not user_can_manage_venue(request.user, serializer.validated_data["venue"]):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        hall = self.get_object()
        if not user_can_manage_venue(request.user, hall.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        return super().update(request, *args, **kwargs)

    partial_update = update

    def destroy(self, request, *args, **kwargs):
        hall = self.get_object()
        if not user_can_manage_venue(request.user, hall.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        return super().destroy(request, *args, **kwargs)
