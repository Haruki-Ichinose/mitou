from django.db import models


class ImportRun(models.Model):
    source = models.CharField(max_length=64)
    file_hash = models.CharField(max_length=64, db_index=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=[
            ('STARTED', 'STARTED'),
            ('SUCCESS', 'SUCCESS'),
            ('FAILED', 'FAILED'),
        ],
        db_index=True,
    )
    rows_total = models.IntegerField(default=0)
    rows_ok = models.IntegerField(default=0)
    rows_error = models.IntegerField(default=0)
    error_summary = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['source', 'file_hash']),
            models.Index(fields=['started_at']),
        ]


class StatsAllGroupDailyRaw(models.Model):
    athlete_id = models.UUIDField(db_index=True)
    date = models.DateField(db_index=True)
    metrics = models.JSONField()
    source_run = models.ForeignKey(
        ImportRun,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='raw_daily_rows',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['athlete_id', 'date'],
                name='uniq_raw_daily_athlete_date',
            ),
        ]


class DailyMetric(models.Model):
    athlete_id = models.UUIDField(db_index=True)
    date = models.DateField(db_index=True)
    metric_name = models.CharField(max_length=128, db_index=True)
    value = models.FloatField()
    meta = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['athlete_id', 'date', 'metric_name'],
                name='uniq_metric_athlete_date_name',
            ),
        ]


class DailyTrainingLoad(models.Model):
    athlete_id = models.CharField(max_length=50)
    athlete_name = models.CharField(max_length=100)
    date = models.DateField()
    total_distance = models.FloatField()
    acwr = models.FloatField(null=True, blank=True)

    class Meta:
        unique_together = ('athlete_id', 'date')
        ordering = ['athlete_id', 'date']
        indexes = [
            models.Index(fields=['athlete_id', 'date']),
        ]

    def __str__(self):
        return f'{self.athlete_id} @ {self.date}: {self.total_distance}'
