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

# backend/api/views.py （末尾に追記でOK）
from datetime import date
from django.utils.dateparse import parse_date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

# workload側のモデルを読む
from workload.models import (
    Athlete,
    GpsDaily,
    WorkloadFeaturesDaily,
    FeatureRun,
    StaticAnomalyDaily,
    DynamicAnomalyDaily,
)

def _parse_ymd(s: str | None):
    if not s:
        return None
    d = parse_date(s)
    return d

class WorkloadAthleteListView(APIView):
    def get(self, request):
        qs = Athlete.objects.all().order_by("athlete_id").values("athlete_id", "athlete_name", "is_active")
        return Response(list(qs), status=status.HTTP_200_OK)

class WorkloadRunsView(APIView):
    def get(self, request):
        qs = FeatureRun.objects.all().order_by("-id").values("id", "run_type", "method", "params", "created_at")
        return Response(list(qs), status=status.HTTP_200_OK)

class WorkloadAthleteTimeseriesView(APIView):
    """
    GpsDaily + WorkloadFeaturesDaily + (任意で) static/dynamic anomaly を date で突合して返す
    """
    def get(self, request, athlete_id: str):
        start = _parse_ymd(request.query_params.get("start"))
        end = _parse_ymd(request.query_params.get("end"))

        gqs = GpsDaily.objects.filter(athlete_id=athlete_id).order_by("date")
        if start:
            gqs = gqs.filter(date__gte=start)
        if end:
            gqs = gqs.filter(date__lte=end)

        rows = []
        dates = []

        for d in gqs.iterator(chunk_size=2000):
            dates.append(d.date)
            rows.append({
                "date": d.date,
                "is_match_day": d.is_match_day,
                "md_offset": d.md_offset,
                "md_phase": d.md_phase,
                "total_distance": d.total_distance,
                "total_player_load": d.total_player_load,
                "metrics": d.metrics or {},
            })

        # ACWR等を date で突合
        wmap = {}
        wqs = WorkloadFeaturesDaily.objects.filter(athlete_id=athlete_id)
        if start:
            wqs = wqs.filter(date__gte=start)
        if end:
            wqs = wqs.filter(date__lte=end)
        for w in wqs.values(
            "date",
            "ewma7_total_distance", "ewma28_total_distance", "acwr_ewma_total_distance",
            "ewma7_total_player_load", "ewma28_total_player_load", "acwr_ewma_total_player_load",
        ):
            wmap[w["date"]] = w

        # 最新のrun（指定がなければ最新を使う）
        static_run_id = request.query_params.get("static_run_id")
        dynamic_run_id = request.query_params.get("dynamic_run_id")

        if not static_run_id:
            sr = FeatureRun.objects.filter(run_type="static").order_by("-id").first()
            static_run_id = sr.id if sr else None
        else:
            static_run_id = int(static_run_id)

        if not dynamic_run_id:
            dr = FeatureRun.objects.filter(run_type="dynamic").order_by("-id").first()
            dynamic_run_id = dr.id if dr else None
        else:
            dynamic_run_id = int(dynamic_run_id)

        static_set = set()
        if static_run_id:
            sqs = StaticAnomalyDaily.objects.filter(run_id=static_run_id, athlete_id=athlete_id, static_anomaly=True)
            if start:
                sqs = sqs.filter(date__gte=start)
            if end:
                sqs = sqs.filter(date__lte=end)
            static_set = set(sqs.values_list("date", flat=True))

        dyn_map = {}
        if dynamic_run_id:
            dqs = DynamicAnomalyDaily.objects.filter(run_id=dynamic_run_id, athlete_id=athlete_id)
            if start:
                dqs = dqs.filter(date__gte=start)
            if end:
                dqs = dqs.filter(date__lte=end)
            for r in dqs.values("date", "dyn_error", "dyn_thr", "dyn_anomaly", "dyn_streak"):
                dyn_map[r["date"]] = r

        # rowsに合流
        out = []
        for r in rows:
            dt = r["date"]
            w = wmap.get(dt)
            dyn = dyn_map.get(dt)

            out.append({
                **r,
                "workload": {
                    "ewma7_total_distance": w.get("ewma7_total_distance") if w else None,
                    "ewma28_total_distance": w.get("ewma28_total_distance") if w else None,
                    "acwr_ewma_total_distance": w.get("acwr_ewma_total_distance") if w else None,
                    "ewma7_total_player_load": w.get("ewma7_total_player_load") if w else None,
                    "ewma28_total_player_load": w.get("ewma28_total_player_load") if w else None,
                    "acwr_ewma_total_player_load": w.get("acwr_ewma_total_player_load") if w else None,
                },
                "static_anomaly": (dt in static_set),
                "dynamic": {
                    "dyn_error": dyn.get("dyn_error") if dyn else None,
                    "dyn_thr": dyn.get("dyn_thr") if dyn else None,
                    "dyn_anomaly": bool(dyn.get("dyn_anomaly")) if dyn else False,
                    "dyn_streak": dyn.get("dyn_streak") if dyn else 0,
                },
                "used_run_ids": {"static": static_run_id, "dynamic": dynamic_run_id},
            })

        return Response(out, status=status.HTTP_200_OK)

class WorkloadDynamicAnomaliesView(APIView):
    def get(self, request):
        run_id = request.query_params.get("run_id")
        athlete_id = request.query_params.get("athlete_id")
        only_anom = request.query_params.get("only_anom", "1")  # default: 異常だけ

        if not run_id:
            dr = FeatureRun.objects.filter(run_type="dynamic").order_by("-id").first()
            if not dr:
                return Response({"detail": "dynamic run not found"}, status=404)
            run_id = dr.id
        else:
            run_id = int(run_id)

        qs = DynamicAnomalyDaily.objects.filter(run_id=run_id)
        if athlete_id:
            qs = qs.filter(athlete_id=athlete_id)
        if only_anom == "1":
            qs = qs.filter(dyn_anomaly=True)

        qs = qs.order_by("-date").values(
            "athlete_id", "date", "dyn_error", "dyn_thr", "dyn_anomaly", "dyn_streak",
            "season_block", "season_reset_zone", "static_anomaly",
        )
        return Response(list(qs), status=200)
