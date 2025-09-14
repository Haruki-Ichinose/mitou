# backend/api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PlayerViewSet

router = DefaultRouter()
router.register('players', PlayerViewSet)

urlpatterns = [
    path('', include(router.urls)),
]