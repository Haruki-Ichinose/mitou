from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0004_athlete_position"),
    ]

    operations = [
        migrations.AddField(
            model_name="workloadfeaturesdaily",
            name="decel_density",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workloadfeaturesdaily",
            name="load_per_meter",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
