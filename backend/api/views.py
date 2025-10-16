from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailyTrainingLoad
from .serializers import DailyTrainingLoadSerializer, TrainingDataIngestionRequestSerializer
from .services import CSVIngestionError, ingest_training_load_from_csv


class DailyTrainingLoadViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DailyTrainingLoad.objects.all().order_by('athlete_id', 'date')
    serializer_class = DailyTrainingLoadSerializer


class TrainingDataIngestionView(APIView):
    def post(self, request):
        serializer = TrainingDataIngestionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            summary = ingest_training_load_from_csv(**serializer.validated_data)
        except CSVIngestionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(summary.as_dict(), status=status.HTTP_200_OK)


class LatestTrainingLoadView(APIView):
    def get(self, request):
        athlete_id = request.query_params.get('athlete_id')
        athlete_name = request.query_params.get('athlete_name')

        if not athlete_id and not athlete_name:
            return Response(
                {'detail': 'athlete_id または athlete_name を指定してください。'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = DailyTrainingLoad.objects.order_by('-date', '-id')
        if athlete_id:
            queryset = queryset.filter(athlete_id=str(athlete_id).strip())
        if athlete_name:
            queryset = queryset.filter(athlete_name=str(athlete_name).strip())

        latest_record = queryset.first()
        if not latest_record:
            return Response({'detail': '該当するデータが見つかりませんでした。'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DailyTrainingLoadSerializer(latest_record)
        return Response(serializer.data, status=status.HTTP_200_OK)
