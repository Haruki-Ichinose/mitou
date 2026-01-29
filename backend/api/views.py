from pathlib import Path
from tempfile import NamedTemporaryFile

from datetime import date
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
    parse_date as parse_stats_date,
    safe_number,
    to_float,
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


def _save_uploaded_file(uploaded_file, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(getattr(uploaded_file, "name", "") or "").suffix or ".csv"
    with NamedTemporaryFile(suffix=suffix, delete=False, dir=target_dir) as tmp_file:
        for chunk in uploaded_file.chunks():
            tmp_file.write(chunk)
    return Path(tmp_file.name)


def _run_pipeline_for_uploaded_file(
    uploaded_file,
    *,
    uploaded_by: str,
    allow_duplicate: bool,
    target_dir: Path,
    source_filename: str | None = None,
    use_transaction: bool = False,
):
    temp_path: Path | None = None
    try:
        temp_path = _save_uploaded_file(uploaded_file, target_dir)
        if use_transaction:
            with transaction.atomic():
                return run_gps_pipeline(
                    temp_path,
                    uploaded_by=uploaded_by,
                    source_filename=source_filename,
                    allow_duplicate=allow_duplicate,
                )
        return run_gps_pipeline(
            temp_path,
            uploaded_by=uploaded_by,
            source_filename=source_filename,
            allow_duplicate=allow_duplicate,
        )
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


class WorkloadIngestionView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def post(self, request):
        serializer = WorkloadIngestionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data.get('file')
        uploaded_by = serializer.validated_data.get('uploaded_by') or ""
        allow_duplicate = serializer.validated_data.get("allow_duplicate", False)

        try:
            target_filename: str
            if uploaded_file:
                data_dir = Path(
                    getattr(settings, 'TRAINING_DATA_DIR', settings.BASE_DIR / 'data')
                )
                original_filename = Path(getattr(uploaded_file, "name", "") or "").name
                summary, features = _run_pipeline_for_uploaded_file(
                    uploaded_file,
                    uploaded_by=uploaded_by,
                    allow_duplicate=allow_duplicate,
                    target_dir=data_dir,
                    source_filename=original_filename or None,
                )
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
        try:
            upload_root = Path(getattr(settings, "MEDIA_ROOT", settings.BASE_DIR / "media"))
            upload_dir = upload_root / "uploads"
            summary, features = _run_pipeline_for_uploaded_file(
                uploaded_file,
                uploaded_by=uploaded_by,
                allow_duplicate=allow_duplicate,
                target_dir=upload_dir,
                use_transaction=True,
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

class WorkloadAthleteDetailView(APIView):
    def delete(self, request, athlete_id: str):
        try:
            athlete = Athlete.objects.get(athlete_id=athlete_id)
        except Athlete.DoesNotExist:
            return Response(
                {"detail": "選手が見つかりません。"},
                status=status.HTTP_404_NOT_FOUND,
            )

        athlete.athlete_name = ""
        athlete.jersey_number = ""
        athlete.uniform_name = ""
        athlete.is_active = False
        athlete.save(
            update_fields=[
                "athlete_name",
                "jersey_number",
                "uniform_name",
                "is_active",
            ]
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

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
                    "acwr_ima_decel": (w.get("params") or {}).get("acwr_ima_decel") if w else None,
                    "metabolic_ratio": (w.get("params") or {}).get("metabolic_ratio") if w else None,
                    "high_metabolic_dist": (w.get("params") or {}).get("high_metabolic_dist") if w else None,
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


def _resolve_row_date(row) -> date | None:
    if row.date:
        return row.date
    payload = row.raw_payload or {}
    return parse_stats_date(
        payload.get("date_")
        or payload.get("date")
        or payload.get("Date")
        or payload.get("session_date")
    )


def _extract_session_label(row) -> str:
    if row.session_name:
        return str(row.session_name)
    payload = row.raw_payload or {}
    return str(payload.get("activity_name") or payload.get("period_name") or "")


def _is_match_session(label: str) -> bool:
    return "vs" in label.lower()


def _collect_match_stats(
    athlete_id: str,
    *,
    start: date | None = None,
    end: date | None = None,
) -> list[dict]:
    qs = (
        GpsSessionRaw.objects.filter(athlete_id=athlete_id)
        .order_by("date", "id")
        .only("date", "session_name", "raw_payload")
    )

    buckets: dict[datetime.date, dict] = {}

    for row in qs.iterator(chunk_size=2000):
        row_date = _resolve_row_date(row)
        if not row_date:
            continue
        if start and row_date < start:
            continue
        if end and row_date > end:
            continue

        session_label = _extract_session_label(row)
        if not _is_match_session(session_label):
            continue

        payload = row.raw_payload or {}
        bucket = buckets.setdefault(
            row_date,
            {
                "date": row_date,
                "session_names": set(),
                "total_duration": 0.0,
                "total_distance": 0.0,
                "total_player_load": 0.0,
                "hsr_distance": 0.0,
                "high_decel_count": 0.0,
                "max_vel": 0.0,
                "max_heart_rate": 0.0,
                "mean_hr_duration": 0.0,
                "mean_hr_sum": 0.0,
                "total_dive_count": 0.0,
                "dive_left_count": 0.0,
                "dive_right_count": 0.0,
                "total_time_to_feet": 0.0,
                "total_jumps": 0.0,
            },
        )

        if session_label:
            bucket["session_names"].add(session_label)

        duration = to_float(payload.get("total_duration"))
        bucket["total_duration"] += duration
        bucket["total_distance"] += to_float(payload.get("total_distance"))
        bucket["total_player_load"] += to_float(payload.get("total_player_load"))

        band5 = to_float(payload.get("velocity_band5_total_distance"))
        band6 = to_float(payload.get("velocity_band6_total_distance"))
        bucket["hsr_distance"] += band5 + band6

        max_vel = safe_number(payload.get("max_vel") or payload.get("Max Velocity"))
        if max_vel is not None:
            bucket["max_vel"] = max(bucket["max_vel"], max_vel)

        max_hr = safe_number(payload.get("max_heart_rate") or payload.get("Max HR"))
        if max_hr is not None:
            bucket["max_heart_rate"] = max(bucket["max_heart_rate"], max_hr)

        mean_hr = safe_number(payload.get("mean_heart_rate") or payload.get("Avg HR"))
        if mean_hr is not None and duration > 0:
            bucket["mean_hr_sum"] += mean_hr * duration
            bucket["mean_hr_duration"] += duration

        decel = safe_number(payload.get("high_decel_count"))
        if decel is None:
            decel = to_float(payload.get("ima_band2_decel_count")) + to_float(
                payload.get("ima_band3_decel_count")
            )
        bucket["high_decel_count"] += decel

        dive_left = to_float(payload.get("dive_left_count"))
        dive_right = to_float(payload.get("dive_right_count"))
        dive_centre = to_float(payload.get("dive_centre_count"))
        bucket["dive_left_count"] += dive_left
        bucket["dive_right_count"] += dive_right
        total_dive_count = safe_number(payload.get("total_dive_count"))
        if total_dive_count is None:
            total_dive_count = dive_left + dive_right + dive_centre
        bucket["total_dive_count"] += total_dive_count

        bucket["total_time_to_feet"] += to_float(payload.get("total_time_to_feet"))
        for key, value in payload.items():
            if str(key).startswith("total_time_to_feet_"):
                bucket["total_time_to_feet"] += to_float(value)

        bucket["total_jumps"] += to_float(payload.get("total_jumps"))

    results = []
    for row_date in sorted(buckets.keys()):
        entry = buckets[row_date]
        total_dive_count = entry["total_dive_count"]
        dive_total_lr = entry["dive_left_count"] + entry["dive_right_count"]
        dive_asymmetry = (
            abs(entry["dive_left_count"] - entry["dive_right_count"]) / dive_total_lr
            if dive_total_lr > 0
            else None
        )
        avg_time_to_feet = (
            entry["total_time_to_feet"] / total_dive_count if total_dive_count > 0 else None
        )
        mean_heart_rate = (
            entry["mean_hr_sum"] / entry["mean_hr_duration"]
            if entry["mean_hr_duration"] > 0
            else None
        )
        efficiency_index = (
            entry["total_player_load"] / mean_heart_rate
            if mean_heart_rate and mean_heart_rate > 0
            else None
        )
        results.append(
            {
                "date": entry["date"].isoformat(),
                "session_names": sorted(entry["session_names"]),
                "total_duration": entry["total_duration"],
                "total_distance": entry["total_distance"],
                "total_player_load": entry["total_player_load"],
                "hsr_distance": entry["hsr_distance"],
                "high_decel_count": int(entry["high_decel_count"]),
                "max_vel": entry["max_vel"] or 0.0,
                "max_heart_rate": entry["max_heart_rate"] or 0.0,
                "mean_heart_rate": mean_heart_rate,
                "efficiency_index": efficiency_index,
                "total_dive_count": int(total_dive_count),
                "dive_asymmetry": dive_asymmetry,
                "avg_time_to_feet": avg_time_to_feet,
                "total_jumps": entry["total_jumps"],
            }
        )
    return results


class WorkloadAthleteCalendarView(APIView):
    def get(self, request, athlete_id: str):
        start = _parse_ymd(request.query_params.get("start"))
        end = _parse_ymd(request.query_params.get("end"))

        qs = WorkloadFeaturesDaily.objects.filter(athlete_id=athlete_id).order_by("date")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)

        data = [
            {
                "date": row.date.isoformat(),
                "risk_level": row.risk_level,
                "risk_reasons": row.risk_reasons or [],
            }
            for row in qs
        ]
        return Response(data, status=status.HTTP_200_OK)


class WorkloadAthleteMatchStatsView(APIView):
    def get(self, request, athlete_id: str):
        start = _parse_ymd(request.query_params.get("start"))
        end = _parse_ymd(request.query_params.get("end"))

        data = _collect_match_stats(athlete_id, start=start, end=end)
        return Response(data, status=status.HTTP_200_OK)
