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
    jersey_number = models.CharField(max_length=12, blank=True, default="")
    uniform_name = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    position = models.CharField(
        max_length=10,
        default="FP",
        choices=[("GK", "GK"), ("FP", "FP")],
    )

    class Meta:
        db_table = "athletes"

    def __str__(self):
        label = self.athlete_name or self.athlete_id
        uniform = f"{self.uniform_name} " if self.uniform_name else ""
        number = f"#{self.jersey_number} " if self.jersey_number else ""
        return f"{number}{uniform}{label} ({self.position})"


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

    # --- 1. 基本ボリューム (全員必須) ---
    # 練習時間を入れないと「1分あたりの強度」が出せないので必須です
    total_duration = models.FloatField(default=0)  # [追加] (秒 or 分)
    total_distance = models.FloatField(default=0)
    total_player_load = models.FloatField(default=0)
    
    # --- 2. 強度・コンディション基礎 (全員必須) ---
    # 90%max速度のチェックや、心拍効率計算の元データとして必須
    max_vel = models.FloatField(default=0)         # [追加]
    mean_heart_rate = models.FloatField(null=True, blank=True) # [追加]

    # --- 3. FP（フィールドプレーヤー）重要指標 ---
    # ハムストリング(HSR)と膝(減速)のリスク管理用
    hsr_distance = models.FloatField(default=0)    # Band5+6
    high_decel_count = models.IntegerField(default=0) # [追加] 膝への負荷回数

    # --- 4. GK（ゴールキーパー）重要指標 ---
    # 「量(回数)」と「キレ(時間)」の管理用
    total_dive_count = models.IntegerField(default=0) # [追加] Loadより回数の方が直感的
    avg_time_to_feet = models.FloatField(null=True, blank=True) # [追加] コンディション判定の肝
    total_jumps = models.FloatField(default=0)

    # --- その他 (JSONへ) ---
    # ima_total, dive_load, asymmetries など、
    # 頻繁にフィルタリングしないものは metrics JSON に逃がしてもOK
    metrics = models.JSONField(default=dict, blank=True)

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

    # 1. ACWR (Acute:Chronic Workload Ratio)
    acwr_load = models.FloatField(null=True, blank=True) # Loadベースに変更推奨
    acwr_hsr = models.FloatField(null=True, blank=True)
    acwr_dive = models.FloatField(null=True, blank=True)

    # 2. Quality & Condition
    efficiency_index = models.FloatField(null=True, blank=True) # [New] 心拍効率
    load_per_meter = models.FloatField(null=True, blank=True)   # 練習の質
    monotony_load = models.FloatField(null=True, blank=True)    # 単調性

    # --- 3. Risk Status (修正箇所) ---
    RISK_LEVEL_CHOICES = [
        ('safety', 'Safety (Green)'),   # 安全
        ('caution', 'Caution (Yellow)'), # 要注意
        ('risky', 'Risky (Red)'),       # 危険・要リカバリー
    ]

    risk_level = models.CharField(
        max_length=20,
        choices=RISK_LEVEL_CHOICES,
        default='safety',
        db_index=True,  # ダッシュボードで「Riskyな選手」を即座に抽出するために必須
    )

    # 具体的なリスク要因のリスト (例: ["HSR ACWR > 1.5", "Efficiency Low"])
    risk_reasons = models.JSONField(default=list, blank=True)
    
    # 細かいリスク要因やパラメータはJSONへ
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
