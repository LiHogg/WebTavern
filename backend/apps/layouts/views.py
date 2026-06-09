from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, response, status, viewsets
from rest_framework.decorators import action

from apps.common.access import user_can_manage_venue, user_manageable_venue_ids
from apps.halls.models import Hall
from apps.tables.models import Table

from .models import LayoutDecorItem, TableLayout, TableLayoutItem
from .serializers import TableLayoutSerializer, TableLayoutSyncSerializer


class TableLayoutViewSet(viewsets.ModelViewSet):
    serializer_class = TableLayoutSerializer

    def get_queryset(self):
        queryset = TableLayout.objects.select_related("hall", "hall__venue").prefetch_related("items", "decor_items")
        user = self.request.user
        hall_id = self.request.query_params.get("hall")
        if hall_id:
            queryset = queryset.filter(hall_id=hall_id)
        if self.request.method == "GET":
            public_filter = Q(hall__venue__is_published=True, hall__venue__status='active', hall__is_active=True)
            manageable_ids = list(user_manageable_venue_ids(user)) if getattr(user, 'is_authenticated', False) else []
            queryset = queryset.filter(public_filter | Q(hall__venue_id__in=manageable_ids)).distinct()
        return queryset

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not user_can_manage_venue(request.user, serializer.validated_data["hall"].venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        layout = self.get_object()
        if not user_can_manage_venue(request.user, layout.hall.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=403)
        return super().update(request, *args, **kwargs)

    partial_update = update

    @action(detail=False, methods=["post"], url_path="save-for-hall")
    def save_for_hall(self, request):
        return self._save_floor_plan(request)

    @action(detail=False, methods=["post"], url_path="save-floor-plan")
    def save_floor_plan(self, request):
        return self._save_floor_plan(request)

    def _save_floor_plan(self, request):
        payload_serializer = TableLayoutSyncSerializer(data=request.data)
        payload_serializer.is_valid(raise_exception=True)
        validated = payload_serializer.validated_data

        hall = get_object_or_404(Hall.objects.select_related("venue"), pk=validated["hall"])
        if not user_can_manage_venue(request.user, hall.venue):
            return response.Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        submitted_tables = validated.get("tables") or validated.get("items") or []
        submitted_decor_items = validated.get("decor_items") or []

        existing_table_ids = set(Table.objects.filter(hall=hall).values_list("id", flat=True))
        referenced_existing_ids = [item.get("id") or item.get("table") for item in submitted_tables if item.get("id") or item.get("table")]
        unknown_table_ids = [table_id for table_id in referenced_existing_ids if table_id not in existing_table_ids]
        if unknown_table_ids:
            return response.Response(
                {"detail": f"Найдены столы, не принадлежащие залу: {', '.join(map(str, unknown_table_ids))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(set(referenced_existing_ids)) != len(referenced_existing_ids):
            return response.Response(
                {"detail": "В схеме не должно быть повторяющихся столов."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            layout, _ = TableLayout.objects.get_or_create(
                hall=hall,
                defaults={
                    "canvas_width": validated["canvas_width"],
                    "canvas_height": validated["canvas_height"],
                    "is_active": validated["is_active"],
                },
            )
            layout.canvas_width = validated["canvas_width"]
            layout.canvas_height = validated["canvas_height"]
            layout.is_active = validated["is_active"]
            layout.save(update_fields=["canvas_width", "canvas_height", "is_active", "updated_at"])

            persisted_table_ids = []
            for index, item in enumerate(submitted_tables, start=1):
                table_id = item.get("id") or item.get("table")
                table_defaults = {
                    "name": item["name"],
                    "seats_count": item["seats_count"],
                    "is_active": item.get("is_active", True),
                    "is_combinable": item.get("is_combinable", False),
                    "note": item.get("note", ""),
                }
                if table_id:
                    table = get_object_or_404(Table, pk=table_id, hall=hall)
                    for field, value in table_defaults.items():
                        setattr(table, field, value)
                    table.save(update_fields=[*table_defaults.keys(), "updated_at"])
                else:
                    base_name = item["name"] or f"T{index}"
                    candidate_name = base_name
                    suffix = 2
                    while Table.objects.filter(hall=hall, name=candidate_name).exists():
                        candidate_name = f"{base_name}-{suffix}"
                        suffix += 1
                    table = Table.objects.create(hall=hall, **{**table_defaults, "name": candidate_name})
                persisted_table_ids.append(table.id)
                TableLayoutItem.objects.update_or_create(
                    table=table,
                    defaults={
                        "layout": layout,
                        "x": item["x"],
                        "y": item["y"],
                        "width": item["width"],
                        "height": item["height"],
                        "rotation": item.get("rotation", 0),
                    },
                )

            if submitted_tables:
                TableLayoutItem.objects.filter(layout=layout).exclude(table_id__in=persisted_table_ids).delete()
                Table.objects.filter(hall=hall).exclude(id__in=persisted_table_ids).delete()
            else:
                TableLayoutItem.objects.filter(layout=layout).delete()
                Table.objects.filter(hall=hall).delete()

            persisted_decor_ids = []
            for item in submitted_decor_items:
                decor_id = item.get("id")
                defaults = {
                    "layout": layout,
                    "item_type": item["item_type"],
                    "label": item.get("label", ""),
                    "x": item["x"],
                    "y": item["y"],
                    "width": item["width"],
                    "height": item["height"],
                    "rotation": item.get("rotation", 0),
                }
                if decor_id:
                    decor_item = get_object_or_404(LayoutDecorItem, pk=decor_id, layout=layout)
                    for field, value in defaults.items():
                        setattr(decor_item, field, value)
                    decor_item.save(update_fields=[*defaults.keys(), "updated_at"])
                else:
                    decor_item = LayoutDecorItem.objects.create(**defaults)
                persisted_decor_ids.append(decor_item.id)

            if persisted_decor_ids:
                LayoutDecorItem.objects.filter(layout=layout).exclude(id__in=persisted_decor_ids).delete()
            else:
                LayoutDecorItem.objects.filter(layout=layout).delete()

            hall.recalculate_capacity()

        serializer = self.get_serializer(layout)
        return response.Response(serializer.data, status=status.HTTP_200_OK)
