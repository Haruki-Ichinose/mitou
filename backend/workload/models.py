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
    
    # ★追加: ポジション情報 (GK判定のSingle Source of Truth)
    position = models.CharField(
        max_length=10, 
        default="FP", 
        choices=[("GK", "GK"), ("FP", "FP")]
    )

    class Meta:
        db_table = "athletes"

    def __str__(self):
        return f"{self.athlete_name} ({self.position})"


class GpsSessionRaw(models.Model):
    upload = models.ForeignKey(DataUpload, on_delete=models.PROTECT, related_name="raw_rows")
    row_number = models.IntegerField()
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="raw_sessions")
    date = models.DateField(null=True, blank=True, db_column="date_")
    session_name = models.CharField(max_length=255, blank=True, default="")
    raw_payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gps_sessions_raw"
        indexes = [
            models.Index(fields=["upload"]),
            models.Index(fields=["athlete", "date"]),
        ]

    def __str__(self):
        return f"raw#{self.id} athlete={self.athlete.athlete_id} date={self.date}"


class GpsDaily(models.Model):
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="daily")
    date = models.DateField(db_column="date_")

    is_match_day = models.BooleanField(default=False)
    md_offset = models.IntegerField(null=True, blank=True)
    md_phase = models.CharField(max_length=20, blank=True, default="")

    # === Main Metrics (FP & GK) ===
    total_distance = models.FloatField(null=True, blank=True, default=0)
    total_player_load = models.FloatField(null=True, blank=True, default=0)
    
    # FP Specific
    hsr_distance = models.FloatField(null=True, blank=True, default=0)
    ima_total = models.FloatField(null=True, blank=True, default=0)
    ima_asymmetry = models.FloatField(null=True, blank=True)

    # GK Specific
    total_dive_load = models.FloatField(null=True, blank=True, default=0)
    total_jumps = models.FloatField(null=True, blank=True, default=0)
    dive_asymmetry = models.FloatField(null=True, blank=True)

    # Other raw metrics
    metrics = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gps_daily"
        constraints = [
            models.UniqueConstraint(
                fields=["athlete", "date"],
                name="uniq_gps_daily_athlete_date",
            ),
        ]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["athlete", "date"]),
        ]

    def __str__(self):
        return f"daily athlete={self.athlete.athlete_id} date={self.date}"


class WorkloadFeaturesDaily(models.Model):
    athlete = models.ForeignKey(Athlete, on_delete=models.PROTECT, related_name="workload_features")
    date = models.DateField(db_column="date_")

    # === Analysis Results ===
    # 1. ACWR (Acute:Chronic Workload Ratio)
    acwr_total_distance = models.FloatField(null=True, blank=True)
    acwr_hsr = models.FloatField(null=True, blank=True)  # for FP
    acwr_dive = models.FloatField(null=True, blank=True) # for GK
    acwr_jump = models.FloatField(null=True, blank=True) # for GK

    # 2. Condition & Risk
    monotony_load = models.FloatField(null=True, blank=True)
    val_asymmetry = models.FloatField(null=True, blank=True) 

    # For debugging / metadata
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
        return f"features athlete={self.athlete.athlete_id} date={self.date}"