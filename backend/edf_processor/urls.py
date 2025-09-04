from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'edf-files', views.EDFFileViewSet)
router.register(r'sessions', views.EDFProcessingSessionViewSet)
router.register(r'analysis-results', views.EDFAnalysisResultViewSet)

urlpatterns = [
    path('', include(router.urls)),
]