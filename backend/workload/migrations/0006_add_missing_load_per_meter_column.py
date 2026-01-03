from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0005_workloadfeaturesdaily_load_per_meter_and_decel_density"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE workload_features_daily
            ADD COLUMN IF NOT EXISTS load_per_meter double precision;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
