from django.db import models


class DataUpload(models.Model):
    source_filename = models.CharField(max_length=255, blank=True, default="")
    file_hash = models.CharField(max_length=64, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.CharField(max_length=255, blank=True, default="")
    parse_status = models.CharField(
        max_length=20,
        default="pending",
        choices=[
            ("pending", "pending"),
            ("success", "success"),
            ("failed", "failed"),
        ],
    )
    note = models.TextField(blank=True, default="")
    error_log = models.TextField(blank=True, default="")

    class Meta:
        db_table = "data_uploads"

    def __str__(self):
        return f"Upload#{self.id} {self.source_filename}"


class Athlete(models.Model):
    athlete_id = models.CharField(max_length=64, primary_key=True)
    athlete_name = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "athletes"

    def __str__(self):
        return self.athlete_id


class GpsSessionRaw(models.Model):
    upload = models.ForeignKey(DataUpload, on_delete=models.PROTECT, related_name="raw_rows")
    row_number = models.IntegerField()
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="raw_sessions")

    # Pythonフィールド名は date、DB列名だけ date_ にする
    date = models.DateField(null=True, blank=True, db_column="date_")

    session_name = models.CharField(max_length=255, blank=True, default="")
    raw_payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gps_sessions_raw"
        indexes = [
            models.Index(fields=["upload"]),
            models.Index(fields=["athlete", "date"]),  # ← date_ じゃなく date
        ]

    def __str__(self):
        return f"raw#{self.id} athlete={self.athlete.athlete_id} date={self.date}"


class GpsDaily(models.Model):
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="daily")
    date = models.DateField(db_column="date_")  # Python側は date

    is_match_day = models.BooleanField(default=False)
    md_offset = models.IntegerField(null=True, blank=True)
    md_phase = models.CharField(max_length=20, blank=True, default="")

    total_distance = models.FloatField(null=True, blank=True)
    total_player_load = models.FloatField(null=True, blank=True)

    metrics = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gps_daily"
        constraints = [
            models.UniqueConstraint(
                fields=["athlete", "date"],
                name="uniq_gps_daily_athlete_date",  # ← ここがコピペミスってた
            ),
        ]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["athlete", "date"]),
            models.Index(fields=["md_phase", "date"]),
        ]

    def __str__(self):
        return f"daily athlete={self.athlete.athlete_id} date={self.date}"


class WorkloadFeaturesDaily(models.Model):
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="workload_features")
    date = models.DateField(db_column="date_")

    ewma7_total_distance = models.FloatField(null=True, blank=True)
    ewma28_total_distance = models.FloatField(null=True, blank=True)
    acwr_ewma_total_distance = models.FloatField(null=True, blank=True)

    ewma7_total_player_load = models.FloatField(null=True, blank=True)
    ewma28_total_player_load = models.FloatField(null=True, blank=True)
    acwr_ewma_total_player_load = models.FloatField(null=True, blank=True)

    params = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "workload_features_daily"
        constraints = [
            models.UniqueConstraint(fields=["athlete", "date"], name="uniq_workload_features_athlete_date"),
        ]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["athlete", "date"]),
        ]

    def __str__(self):
        return f"acwr athlete={self.athlete.athlete_id} date={self.date}"

class FeatureRun(models.Model):
    """
    1回の実行（static / dynamic）をまとめて管理。
    artifacts: feature_cols, impute_median, threshold, scaler_params などを丸ごと保存できる。
    """
    RUN_TYPES = (
        ("static", "static"),
        ("dynamic", "dynamic"),
    )

    run_type = models.CharField(max_length=20, choices=RUN_TYPES)
    method = models.CharField(max_length=100, default="")
    params = models.JSONField(default=dict, blank=True)      # config等
    artifacts = models.JSONField(default=dict, blank=True)   # feature_cols, impute_median等
    note = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "feature_runs"
        indexes = [
            models.Index(fields=["run_type", "created_at"]),
        ]

    def __str__(self):
        return f"{self.run_type}#{self.id} {self.method}"


class StaticAnomalyDaily(models.Model):
    run = models.ForeignKey(FeatureRun, on_delete=models.PROTECT, related_name="static_rows")
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="static_anomalies")
    date = models.DateField(db_column="date_")

    static_score = models.FloatField(null=True, blank=True)
    static_thr = models.FloatField(null=True, blank=True)
    static_anomaly = models.BooleanField(default=False)

    # notebookの top_features（[{feature,z}...] をjson文字列で持ってたが、DBではJSONでOK）
    top_features = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "static_anomaly_daily"
        constraints = [
            models.UniqueConstraint(fields=["run", "athlete", "date"], name="uniq_static_run_athlete_date"),
        ]
        indexes = [
            models.Index(fields=["athlete", "date"]),
            models.Index(fields=["date"]),
        ]


class DynamicAnomalyDaily(models.Model):
    run = models.ForeignKey(FeatureRun, on_delete=models.PROTECT, related_name="dynamic_rows")
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="dynamic_anomalies")
    date = models.DateField(db_column="date_")

    dyn_error = models.FloatField(null=True, blank=True)
    dyn_thr = models.FloatField(null=True, blank=True)
    dyn_anomaly = models.BooleanField(default=False)
    dyn_streak = models.IntegerField(null=True, blank=True)

    season_block = models.IntegerField(null=True, blank=True)
    season_reset_zone = models.BooleanField(default=False)
    static_anomaly = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dynamic_anomaly_daily"
        constraints = [
            models.UniqueConstraint(fields=["run", "athlete", "date"], name="uniq_dynamic_run_athlete_date"),
        ]
        indexes = [
            models.Index(fields=["athlete", "date"]),
            models.Index(fields=["date"]),
        ]
