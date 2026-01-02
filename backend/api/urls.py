from django.urls import path
from .views import (
    WorkloadIngestionView,
    WorkloadAthleteListView,
    WorkloadAthleteTimeseriesView
)

urlpatterns = [
    # Workload endpoints
    path('workload/athletes/', WorkloadAthleteListView.as_view(), name='workload-athletes'),
    # 【ここを修正】フロントエンドに合わせてパスを変更
    path('workload/athletes/<str:athlete_id>/timeseries/', WorkloadAthleteTimeseriesView.as_view(), name='workload-timeseries'),
    path('workload/ingest/', WorkloadIngestionView.as_view(), name='workload-ingest'),
    path('ingest/', WorkloadIngestionView.as_view(), name='ingest'),
]
