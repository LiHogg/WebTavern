from rest_framework import serializers

from .models import LayoutDecorItem, TableLayout, TableLayoutItem


class TableLayoutItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TableLayoutItem
        fields = ["id", "layout", "table", "x", "y", "width", "height", "rotation"]


class LayoutDecorItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LayoutDecorItem
        fields = ["id", "layout", "item_type", "label", "x", "y", "width", "height", "rotation"]


class TableLayoutSerializer(serializers.ModelSerializer):
    items = TableLayoutItemSerializer(many=True, read_only=True)
    decor_items = LayoutDecorItemSerializer(many=True, read_only=True)

    class Meta:
        model = TableLayout
        fields = [
            "id",
            "hall",
            "canvas_width",
            "canvas_height",
            "background_image",
            "is_active",
            "items",
            "decor_items",
        ]


class TableLayoutSyncItemSerializer(serializers.Serializer):
    table = serializers.IntegerField(min_value=1, required=False)
    id = serializers.IntegerField(min_value=1, required=False)
    name = serializers.CharField(max_length=64)
    seats_count = serializers.IntegerField(min_value=1, max_value=24)
    is_active = serializers.BooleanField(required=False, default=True)
    is_combinable = serializers.BooleanField(required=False, default=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    x = serializers.IntegerField()
    y = serializers.IntegerField()
    width = serializers.IntegerField(min_value=40)
    height = serializers.IntegerField(min_value=40)
    rotation = serializers.IntegerField(min_value=0, max_value=359, required=False, default=0)


class LayoutDecorSyncItemSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1, required=False)
    item_type = serializers.ChoiceField(choices=LayoutDecorItem.ItemType.choices)
    label = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    x = serializers.IntegerField()
    y = serializers.IntegerField()
    width = serializers.IntegerField(min_value=20)
    height = serializers.IntegerField(min_value=10)
    rotation = serializers.IntegerField(min_value=0, max_value=359, required=False, default=0)


class TableLayoutSyncSerializer(serializers.Serializer):
    hall = serializers.IntegerField(min_value=1)
    canvas_width = serializers.IntegerField(min_value=480)
    canvas_height = serializers.IntegerField(min_value=320)
    is_active = serializers.BooleanField(required=False, default=True)
    tables = TableLayoutSyncItemSerializer(many=True, required=False, default=list)
    decor_items = LayoutDecorSyncItemSerializer(many=True, required=False, default=list)
    items = TableLayoutSyncItemSerializer(many=True, required=False, default=list)
