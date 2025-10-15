from rest_framework import serializers
from .models import DailyTrainingLoad


class DailyTrainingLoadSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyTrainingLoad
        fields = (
            'id',
            'athlete_id',
            'athlete_name',
            'date',
            'total_distance',
            'acwr',
        )


class TrainingDataIngestionRequestSerializer(serializers.Serializer):
    filename = serializers.CharField()
    dry_run = serializers.BooleanField(default=False)
