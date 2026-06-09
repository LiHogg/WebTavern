from rest_framework import serializers

from .models import Table


class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = ["id", "hall", "name", "seats_count", "is_active", "is_combinable", "note"]
