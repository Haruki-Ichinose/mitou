from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ImportRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(max_length=64)),
                ('file_hash', models.CharField(db_index=True, max_length=64)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('STARTED', 'STARTED'), ('SUCCESS', 'SUCCESS'), ('FAILED', 'FAILED')], db_index=True, max_length=16)),
                ('rows_total', models.IntegerField(default=0)),
                ('rows_ok', models.IntegerField(default=0)),
                ('rows_error', models.IntegerField(default=0)),
                ('error_summary', models.JSONField(blank=True, null=True)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['source', 'file_hash'], name='api_import_source_1df0f1_idx'),
                    models.Index(fields=['started_at'], name='api_import_started_0c6a69_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='StatsAllGroupDailyRaw',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('athlete_id', models.UUIDField(db_index=True)),
                ('date', models.DateField(db_index=True)),
                ('metrics', models.JSONField()),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_run', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='raw_daily_rows', to='api.importrun')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('athlete_id', 'date'), name='uniq_raw_daily_athlete_date'),
                ],
            },
        ),
        migrations.CreateModel(
            name='DailyMetric',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('athlete_id', models.UUIDField(db_index=True)),
                ('date', models.DateField(db_index=True)),
                ('metric_name', models.CharField(db_index=True, max_length=128)),
                ('value', models.FloatField()),
                ('meta', models.JSONField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('athlete_id', 'date', 'metric_name'), name='uniq_metric_athlete_date_name'),
                ],
            },
        ),
    ]
