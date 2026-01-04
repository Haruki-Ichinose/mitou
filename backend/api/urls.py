from django.urls import path
from .views import (
    GpsUploadView,
    WorkloadIngestionView,
    WorkloadAthleteListView,
    WorkloadAthleteDetailView,
    WorkloadAthleteTimeseriesView,
    WorkloadUploadHistoryView,
)

urlpatterns = [
    # Workload endpoints
    path('workload/athletes/', WorkloadAthleteListView.as_view(), name='workload-athletes'),
    path('workload/athletes/<str:athlete_id>/', WorkloadAthleteDetailView.as_view(), name='workload-athlete-detail'),
    # 【ここを修正】フロントエンドに合わせてパスを変更
    path('workload/athletes/<str:athlete_id>/timeseries/', WorkloadAthleteTimeseriesView.as_view(), name='workload-timeseries'),
    path('workload/ingest/', WorkloadIngestionView.as_view(), name='workload-ingest'),
    path('workload/uploads/', WorkloadUploadHistoryView.as_view(), name='workload-uploads'),
    path('ingest/', WorkloadIngestionView.as_view(), name='ingest'),
    path('upload/gps/', GpsUploadView.as_view(), name='upload-gps'),
]
