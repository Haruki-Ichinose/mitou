from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0007_sync_status_column"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE workload_features_daily
            ADD COLUMN IF NOT EXISTS status_reason varchar(255);
            UPDATE workload_features_daily SET status_reason = COALESCE(status_reason, '');
            ALTER TABLE workload_features_daily ALTER COLUMN status_reason SET DEFAULT '';
            ALTER TABLE workload_features_daily ALTER COLUMN status_reason SET NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="workloadfeaturesdaily",
                    name="status_reason",
                    field=models.CharField(default="", max_length=255, blank=True),
                ),
            ],
            database_operations=[],
        ),
    ]
