from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workload", "0008_sync_status_reason_column"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE workload_features_daily
            ADD COLUMN IF NOT EXISTS risk_level varchar(20);
            ALTER TABLE workload_features_daily
            ADD COLUMN IF NOT EXISTS risk_reasons jsonb;
            UPDATE workload_features_daily
            SET risk_level = COALESCE(risk_level, 'safety'),
                risk_reasons = COALESCE(risk_reasons, '[]'::jsonb);
            ALTER TABLE workload_features_daily ALTER COLUMN risk_level SET DEFAULT 'safety';
            ALTER TABLE workload_features_daily ALTER COLUMN risk_level SET NOT NULL;
            ALTER TABLE workload_features_daily ALTER COLUMN risk_reasons SET DEFAULT '[]'::jsonb;
            ALTER TABLE workload_features_daily ALTER COLUMN risk_reasons SET NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="workloadfeaturesdaily",
                    name="risk_level",
                    field=models.CharField(default="safety", max_length=20),
                ),
                migrations.AddField(
                    model_name="workloadfeaturesdaily",
                    name="risk_reasons",
                    field=models.JSONField(default=list, blank=True),
                ),
            ],
            database_operations=[],
        ),
    ]
