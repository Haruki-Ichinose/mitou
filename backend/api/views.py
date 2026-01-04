from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from django.db import transaction
from django.utils.dateparse import parse_date
from django.db.models import Count, OuterRef, Subquery, Value, Q
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import WorkloadIngestionRequestSerializer
from .services import (
    WorkloadIngestionError,
    run_gps_pipeline,
)

from .models import (
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


def _is_truthy(value) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


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
                original_filename = Path(getattr(uploaded_file, "name", "") or "").name
            else:
                target_filename = serializer.validated_data['filename']
                original_filename = ""

            summary, features = run_gps_pipeline(
                target_filename,
                uploaded_by=uploaded_by,
                source_filename=original_filename or None,
                allow_duplicate=allow_duplicate,
            )
        except WorkloadIngestionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

        payload = summary.as_dict()
        payload["updated_features"] = features
        return Response(payload, status=status.HTTP_200_OK)


class GpsUploadView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"status": "error", "message": "file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_by = request.data.get("user") or request.data.get("uploaded_by") or ""
        allow_duplicate = _is_truthy(request.data.get("allow_duplicate"))
        temp_path: Path | None = None

        try:
            upload_root = Path(getattr(settings, "MEDIA_ROOT", settings.BASE_DIR / "media"))
            upload_dir = upload_root / "uploads"
            upload_dir.mkdir(parents=True, exist_ok=True)

            suffix = Path(getattr(uploaded_file, "name", "") or "").suffix or ".csv"
            with NamedTemporaryFile(suffix=suffix, delete=False, dir=upload_dir) as tmp_file:
                for chunk in uploaded_file.chunks():
                    tmp_file.write(chunk)
                temp_path = Path(tmp_file.name)

            with transaction.atomic():
                summary, features = run_gps_pipeline(
                    temp_path,
                    uploaded_by=uploaded_by,
                    allow_duplicate=allow_duplicate,
                )

            if summary.skipped:
                return Response(
                    {
                        "status": "skipped",
                        "message": f"Duplicate file (upload id={summary.duplicate_of}).",
                    },
                    status=status.HTTP_200_OK,
                )

            return Response(
                {
                    "status": "success",
                    "imported_rows": summary.rows_imported,
                    "updated_features": features,
                },
                status=status.HTTP_201_CREATED,
            )
        except WorkloadIngestionError as exc:
            return Response(
                {"status": "error", "message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"status": "error", "message": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)


# === 以下、Workload関連ビュー（修正版） ===

class WorkloadAthleteListView(APIView):
    def get(self, request):
        include_unregistered = _is_truthy(request.query_params.get("include_unregistered"))
        only_unregistered = _is_truthy(request.query_params.get("only_unregistered"))

        # 登録済み（名前と背番号がある）選手のみ表示
        risk_level_sq = WorkloadFeaturesDaily.objects.filter(
            athlete_id=OuterRef("athlete_id")
        ).order_by("-date", "-id").values("risk_level")[:1]

        qs = Athlete.objects.all()
        if only_unregistered:
            qs = qs.filter(
                Q(athlete_name="") | Q(jersey_number="") | Q(uniform_name="")
            )
        elif not include_unregistered:
            qs = qs.filter(
                athlete_name__gt="", jersey_number__gt="", uniform_name__gt=""
            )

        qs = qs.annotate(
            risk_level=Coalesce(Subquery(risk_level_sq), Value("safety"))
        )
        if include_unregistered:
            qs = qs.order_by("athlete_id")
        else:
            qs = qs.order_by("jersey_number", "athlete_name")
        data = []
        for a in qs:
            data.append({
                "athlete_id": a.athlete_id,
                "athlete_name": a.athlete_name,
                "jersey_number": a.jersey_number,
                "uniform_name": a.uniform_name,
                "is_active": a.is_active,
                "position": a.position,  # ★DBの値 ("GK" or "FP")
                "risk_level": a.risk_level,
            })
            
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        athlete_id = str(request.data.get("athlete_id", "")).strip()
        athlete_name = str(request.data.get("athlete_name", "")).strip()
        jersey_number = str(request.data.get("jersey_number", "")).strip()
        uniform_name = str(request.data.get("uniform_name", "")).strip()

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
        if not uniform_name:
            return Response(
                {"detail": "uniform_name を指定してください。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        athlete, created = Athlete.objects.update_or_create(
            athlete_id=athlete_id,
            defaults={
                "athlete_name": athlete_name,
                "jersey_number": jersey_number,
                "uniform_name": uniform_name,
                "is_active": True,
            },
        )

        return Response(
            {
                "athlete_id": athlete.athlete_id,
                "athlete_name": athlete.athlete_name,
                "jersey_number": athlete.jersey_number,
                "uniform_name": athlete.uniform_name,
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
            metrics = d.metrics or {}
            total_dive_load = metrics.get("total_dive_load")
            if total_dive_load is None:
                total_dive_load = (
                    (metrics.get("total_dive_load_left") or 0)
                    + (metrics.get("total_dive_load_right") or 0)
                    + (metrics.get("total_dive_load_centre") or 0)
                )
            rows.append({
                "date": d.date,
                "is_match_day": d.is_match_day,
                "md_offset": d.md_offset,
                
                "total_duration": d.total_duration,
                "total_distance": d.total_distance,
                "total_player_load": d.total_player_load,
                "max_vel": d.max_vel,
                "mean_heart_rate": d.mean_heart_rate,
                "hsr_distance": d.hsr_distance,
                "high_decel_count": d.high_decel_count,
                "total_dive_count": d.total_dive_count,
                "avg_time_to_feet": d.avg_time_to_feet,
                "total_dive_load": total_dive_load,
                "total_jumps": d.total_jumps,
                
                "metrics": metrics,
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
            "acwr_load",
            "acwr_hsr",
            "acwr_dive",
            "efficiency_index",
            "monotony_load",
            "load_per_meter",
            "risk_level",
            "risk_reasons",
            "params",
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
                    "acwr_load": w.get("acwr_load") if w else None,
                    "acwr_total_distance": w.get("acwr_load") if w else None,
                    "acwr_hsr": w.get("acwr_hsr") if w else None,
                    "acwr_dive": w.get("acwr_dive") if w else None,
                    "efficiency_index": w.get("efficiency_index") if w else None,
                    "monotony_load": w.get("monotony_load") if w else None,
                    "load_per_meter": w.get("load_per_meter") if w else None,
                    "val_asymmetry": (w.get("params") or {}).get("val_asymmetry") if w else None,
                    "decel_density": (w.get("params") or {}).get("decel_density") if w else None,
                    "time_to_feet": (w.get("params") or {}).get("time_to_feet") if w else None,
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
                    "uploaded_by": upload.uploaded_by,
                    "status": upload.parse_status,
                    "rows": stat.get("rows", 0),
                    "athletes": stat.get("athletes", 0),
                }
            )

        return Response(data, status=status.HTTP_200_OK)
