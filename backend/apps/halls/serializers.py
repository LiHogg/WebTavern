from rest_framework import serializers

from .models import Hall


class HallSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hall
        fields = ["id", "venue", "name", "description", "capacity", "is_active", "sort_order"]
