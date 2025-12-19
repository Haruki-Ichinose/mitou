from django.db import models

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
