from rest_framework import serializers


class WorkloadIngestionRequestSerializer(serializers.Serializer):
    filename = serializers.CharField(required=False, allow_blank=False)
    file = serializers.FileField(required=False)
    uploaded_by = serializers.CharField(required=False, allow_blank=True)
    allow_duplicate = serializers.BooleanField(required=False, default=False)

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
