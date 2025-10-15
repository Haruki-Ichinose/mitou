# backend/api/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import DailyTrainingLoadViewSet, TrainingDataIngestionView

router = DefaultRouter()
router.register('daily-training-loads', DailyTrainingLoadViewSet, basename='daily-training-load')

urlpatterns = [
    path('', include(router.urls)),
    path('ingest/training-load/', TrainingDataIngestionView.as_view(), name='training-load-ingest'),
]
