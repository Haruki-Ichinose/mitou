from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='DailyTrainingLoad',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('athlete_id', models.CharField(max_length=50)),
                ('date', models.DateField()),
                ('total_distance', models.FloatField()),
                ('acwr', models.FloatField(blank=True, null=True)),
            ],
            options={
                'ordering': ['athlete_id', 'date'],
                'unique_together': {('athlete_id', 'date')},
            },
        ),
        migrations.AddIndex(
            model_name='dailytrainingload',
            index=models.Index(fields=['athlete_id', 'date'], name='api_load_athlete_date_idx'),
        ),
    ]
