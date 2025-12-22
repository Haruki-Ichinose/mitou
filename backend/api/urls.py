# backend/api/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    DailyTrainingLoadViewSet,
    LatestTrainingLoadView,
    LogoutView,
    TrainingDataIngestionView,
)

urlpatterns = [
    path('daily-training-loads/latest/', LatestTrainingLoadView.as_view(), name='daily-training-load-latest'),
    path('auth/login/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='token_logout'),
]

router = DefaultRouter()
router.register('daily-training-loads', DailyTrainingLoadViewSet, basename='daily-training-load')

urlpatterns += [
    path('', include(router.urls)),
    path('ingest/training-load/', TrainingDataIngestionView.as_view(), name='training-load-ingest'),
]
