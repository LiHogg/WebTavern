from rest_framework import permissions, viewsets

from apps.common.access import user_manageable_venue_ids

from .models import ManagerActionLog
from .serializers import ManagerActionLogSerializer


class ManagerActionLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ManagerActionLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ManagerActionLog.objects.select_related('actor', 'venue', 'booking')
        scope = self.request.query_params.get('scope')
        venue_id = self.request.query_params.get('venue')
        manageable_ids = list(user_manageable_venue_ids(user))
        if scope == 'manageable' or manageable_ids:
            queryset = queryset.filter(venue_id__in=manageable_ids)
        else:
            queryset = queryset.none()
        if venue_id:
            queryset = queryset.filter(venue_id=venue_id)
        return queryset
