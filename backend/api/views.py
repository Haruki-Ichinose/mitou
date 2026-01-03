from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from django.utils.dateparse import parse_date
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
    GpsDaily,
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
        # ★修正: 集計処理を削除し、DBに保存されたポジション情報をそのまま返す
        qs = Athlete.objects.all().order_by("athlete_id")
        data = []
        for a in qs:
            # 名前が空ならIDを表示名にする
            display_name = a.athlete_name if a.athlete_name else a.athlete_id
            
            data.append({
                "athlete_id": a.athlete_id,
                "athlete_name": display_name,
                "is_active": a.is_active,
                "position": a.position  # ★DBの値 ("GK" or "FP")
            })
            
        return Response(data, status=status.HTTP_200_OK)

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
