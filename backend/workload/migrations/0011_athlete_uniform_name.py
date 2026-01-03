from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0010_merge_0005_athlete_jersey_number_0009_add_risk_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="athlete",
            name="uniform_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
