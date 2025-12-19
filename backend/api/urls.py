# backend/api/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import DailyTrainingLoadViewSet, LatestTrainingLoadView, TrainingDataIngestionView

urlpatterns = [
    path('daily-training-loads/latest/', LatestTrainingLoadView.as_view(), name='daily-training-load-latest'),
]

router = DefaultRouter()
router.register('daily-training-loads', DailyTrainingLoadViewSet, basename='daily-training-load')

urlpatterns += [
    path('', include(router.urls)),
    path('ingest/training-load/', TrainingDataIngestionView.as_view(), name='training-load-ingest'),
]

# backend/api/urls.py
from .views import (
    DailyTrainingLoadViewSet, LatestTrainingLoadView, TrainingDataIngestionView,
    WorkloadAthleteListView, WorkloadRunsView, WorkloadAthleteTimeseriesView, WorkloadDynamicAnomaliesView,
)

urlpatterns = [
    path('daily-training-loads/latest/', LatestTrainingLoadView.as_view(), name='daily-training-load-latest'),

    # ★追加（workload DB 用）
    path('workload/athletes/', WorkloadAthleteListView.as_view(), name='workload-athletes'),
    path('workload/runs/', WorkloadRunsView.as_view(), name='workload-runs'),
    path('workload/athletes/<str:athlete_id>/timeseries/', WorkloadAthleteTimeseriesView.as_view(), name='workload-athlete-timeseries'),
    path('workload/anomalies/dynamic/', WorkloadDynamicAnomaliesView.as_view(), name='workload-dynamic-anomalies'),
]
