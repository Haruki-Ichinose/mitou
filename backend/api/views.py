from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from django.utils.dateparse import parse_date
from django.db.models import Count, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import WorkloadIngestionRequestSerializer
from workload.services import (
    WorkloadIngestionError,
    detect_positions,
    import_statsallgroup_csv,
    rebuild_gps_daily,
    rebuild_workload_features,
)

from workload.models import (
    Athlete,
    DataUpload,
    GpsDaily,
    GpsSessionRaw,
    WorkloadFeaturesDaily,
)

def _parse_ymd(s: str | None):
    if not s:
        return None
    d = parse_date(s)
    return d


class WorkloadIngestionView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def post(self, request):
        serializer = WorkloadIngestionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data.get('file')
        temp_path: Path | None = None
        uploaded_by = serializer.validated_data.get('uploaded_by') or ""
        allow_duplicate = serializer.validated_data.get("allow_duplicate", False)

        try:
            target_filename: str
            if uploaded_file:
                data_dir = Path(
                    getattr(settings, 'TRAINING_DATA_DIR', settings.BASE_DIR / 'data')
                )
                data_dir.mkdir(parents=True, exist_ok=True)

                suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix or '.csv'
                with NamedTemporaryFile(suffix=suffix, delete=False, dir=data_dir) as tmp_file:
                    for chunk in uploaded_file.chunks():
                        tmp_file.write(chunk)
                    temp_path = Path(tmp_file.name)
                target_filename = str(temp_path)
            else:
                target_filename = serializer.validated_data['filename']

            summary = import_statsallgroup_csv(
                target_filename,
                uploaded_by=uploaded_by,
                allow_duplicate=allow_duplicate,
            )
            if summary.rows_imported > 0 and summary.athletes:
                rebuild_gps_daily(athlete_ids=summary.athletes)
                detect_positions(athlete_ids=summary.athletes)
                rebuild_workload_features(athlete_ids=summary.athletes)
        except WorkloadIngestionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

        return Response(summary.as_dict(), status=status.HTTP_200_OK)


# === 以下、Workload関連ビュー（修正版） ===

class WorkloadAthleteListView(APIView):
    def get(self, request):
        # 登録済み（名前と背番号がある）選手のみ表示
        risk_level_sq = WorkloadFeaturesDaily.objects.filter(
            athlete_id=OuterRef("athlete_id")
        ).order_by("-date", "-id").values("risk_level")[:1]

        qs = Athlete.objects.filter(
            athlete_name__gt="", jersey_number__gt=""
        ).annotate(
            risk_level=Coalesce(Subquery(risk_level_sq), Value("safety"))
        ).order_by("jersey_number", "athlete_name")
        data = []
        for a in qs:
            data.append({
                "athlete_id": a.athlete_id,
                "athlete_name": a.athlete_name,
                "jersey_number": a.jersey_number,
                "is_active": a.is_active,
                "position": a.position,  # ★DBの値 ("GK" or "FP")
                "risk_level": a.risk_level,
            })
            
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        athlete_id = str(request.data.get("athlete_id", "")).strip()
        athlete_name = str(request.data.get("athlete_name", "")).strip()
        jersey_number = str(request.data.get("jersey_number", "")).strip()

        if not athlete_id:
            return Response(
                {"detail": "athlete_id を指定してください。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not athlete_name:
            return Response(
                {"detail": "athlete_name を指定してください。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not jersey_number:
            return Response(
                {"detail": "jersey_number を指定してください。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        athlete, created = Athlete.objects.update_or_create(
            athlete_id=athlete_id,
            defaults={
                "athlete_name": athlete_name,
                "jersey_number": jersey_number,
                "is_active": True,
            },
        )

        return Response(
            {
                "athlete_id": athlete.athlete_id,
                "athlete_name": athlete.athlete_name,
                "jersey_number": athlete.jersey_number,
                "is_active": athlete.is_active,
                "position": athlete.position,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

class WorkloadAthleteTimeseriesView(APIView):
    def get(self, request, athlete_id: str):
        start = _parse_ymd(request.query_params.get("start"))
        end = _parse_ymd(request.query_params.get("end"))

        # 1. GpsDaily (基本データ)
        gqs = GpsDaily.objects.filter(athlete_id=athlete_id).order_by("date")
        if start:
            gqs = gqs.filter(date__gte=start)
        if end:
            gqs = gqs.filter(date__lte=end)

        rows = []
        for d in gqs.iterator(chunk_size=2000):
            rows.append({
                "date": d.date,
                "is_match_day": d.is_match_day,
                "md_offset": d.md_offset,
                "md_phase": d.md_phase,
                
                "total_distance": d.total_distance,
                "total_player_load": d.total_player_load,
                "hsr_distance": d.hsr_distance,
                "ima_asymmetry": d.ima_asymmetry,
                "total_dive_load": d.total_dive_load,
                "total_jumps": d.total_jumps,
                "dive_asymmetry": d.dive_asymmetry,
                
                "metrics": d.metrics or {},
            })

        # 2. WorkloadFeaturesDaily (ACWRなどの分析値)
        wmap = {}
        wqs = WorkloadFeaturesDaily.objects.filter(athlete_id=athlete_id)
        if start:
            wqs = wqs.filter(date__gte=start)
        if end:
            wqs = wqs.filter(date__lte=end)
            
        w_cols = [
            "date", 
            "acwr_total_distance", "acwr_hsr", "acwr_dive", "acwr_jump",
            "monotony_load", "val_asymmetry", "load_per_meter", "decel_density",
            "risk_level", "risk_reasons"
        ]
        for w in wqs.values(*w_cols):
            wmap[w["date"]] = w

        # 3. 結合
        out = []
        for r in rows:
            dt = r["date"]
            w = wmap.get(dt)
            
            out.append({
                **r,
                "workload": {
                    "acwr_total_distance": w.get("acwr_total_distance") if w else None,
                    "acwr_hsr": w.get("acwr_hsr") if w else None,
                    "acwr_dive": w.get("acwr_dive") if w else None,
                    "acwr_jump": w.get("acwr_jump") if w else None,
                    "monotony_load": w.get("monotony_load") if w else None,
                    "val_asymmetry": w.get("val_asymmetry") if w else None,
                    "load_per_meter": w.get("load_per_meter") if w else None,
                    "decel_density": w.get("decel_density") if w else None,
                    "risk_level": w.get("risk_level") if w else None,
                    "risk_reasons": w.get("risk_reasons") if w else [],
                },
            })

        return Response(out, status=status.HTTP_200_OK)


class WorkloadUploadHistoryView(APIView):
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20

        uploads = DataUpload.objects.order_by("-uploaded_at")[:limit]
        upload_ids = [upload.id for upload in uploads]

        stats_map = {}
        if upload_ids:
            stats = (
                GpsSessionRaw.objects.filter(upload_id__in=upload_ids)
                .values("upload_id")
                .annotate(rows=Count("id"), athletes=Count("athlete_id", distinct=True))
            )
            stats_map = {row["upload_id"]: row for row in stats}

        data = []
        for upload in uploads:
            stat = stats_map.get(upload.id, {})
            data.append(
                {
                    "upload_id": upload.id,
                    "filename": upload.source_filename,
                    "uploaded_at": upload.uploaded_at,
                    "status": upload.parse_status,
                    "rows": stat.get("rows", 0),
                    "athletes": stat.get("athletes", 0),
                }
            )

        return Response(data, status=status.HTTP_200_OK)
