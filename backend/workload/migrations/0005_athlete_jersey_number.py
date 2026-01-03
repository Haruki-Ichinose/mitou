from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0004_athlete_position"),
    ]

    operations = [
        migrations.AddField(
            model_name="athlete",
            name="jersey_number",
            field=models.CharField(blank=True, default="", max_length=12),
        ),
    ]
