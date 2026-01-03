from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0006_add_missing_load_per_meter_column"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE workload_features_daily
            ADD COLUMN IF NOT EXISTS status varchar(20);
            UPDATE workload_features_daily SET status = COALESCE(status, 'ok');
            ALTER TABLE workload_features_daily ALTER COLUMN status SET DEFAULT 'ok';
            ALTER TABLE workload_features_daily ALTER COLUMN status SET NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="workloadfeaturesdaily",
                    name="status",
                    field=models.CharField(default="ok", max_length=20),
                ),
            ],
            database_operations=[],
        ),
    ]
