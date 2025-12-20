from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DailyTrainingLoadViewSet, 
    LatestTrainingLoadView, 
    TrainingDataIngestionView,
    WorkloadAthleteListView,
    WorkloadAthleteTimeseriesView
)

router = DefaultRouter()
router.register(r'daily-training-load', DailyTrainingLoadViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('ingest/', TrainingDataIngestionView.as_view(), name='ingest'),
    path('latest-training-load/', LatestTrainingLoadView.as_view(), name='latest-training-load'),
    
    # Workload endpoints
    path('workload/athletes/', WorkloadAthleteListView.as_view(), name='workload-athletes'),
    
    # 【ここを修正】フロントエンドに合わせてパスを変更
    path('workload/athletes/<str:athlete_id>/timeseries/', WorkloadAthleteTimeseriesView.as_view(), name='workload-timeseries'),
]