from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailyTrainingLoad
from .serializers import DailyTrainingLoadSerializer, TrainingDataIngestionRequestSerializer
from .services import CSVIngestionError, ingest_training_load_from_csv


class DailyTrainingLoadViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DailyTrainingLoad.objects.all().order_by('athlete_id', 'date')
    serializer_class = DailyTrainingLoadSerializer


class TrainingDataIngestionView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def post(self, request):
        serializer = TrainingDataIngestionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data.get('file')
        temp_path: Path | None = None

        try:
            target_filename: str
            if uploaded_file:
                data_dir = Path(
                    getattr(settings, 'TRAINING_DATA_DIR', settings.BASE_DIR / 'data')
                )
                data_dir.mkdir(parents=True, exist_ok=True)

                suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix or '.csv'
                with NamedTemporaryFile(
                    suffix=suffix,
                    delete=False,
                    dir=data_dir,
                ) as tmp_file:
                    for chunk in uploaded_file.chunks():
                        tmp_file.write(chunk)
                    temp_path = Path(tmp_file.name)

                target_filename = str(temp_path)
            else:
                target_filename = serializer.validated_data['filename']

            summary = ingest_training_load_from_csv(
                target_filename,
                dry_run=False,
            )
        except CSVIngestionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

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
