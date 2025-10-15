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
