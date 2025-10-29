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
    filename = serializers.CharField(required=False, allow_blank=False)
    file = serializers.FileField(required=False)

    def validate(self, attrs):
        filename = attrs.get('filename')
        uploaded_file = attrs.get('file')

        if not filename and not uploaded_file:
            raise serializers.ValidationError(
                'filename または file のいずれかを指定してください。'
            )

        if filename and uploaded_file:
            raise serializers.ValidationError(
                'filename と file を同時に指定することはできません。'
            )

        return attrs
