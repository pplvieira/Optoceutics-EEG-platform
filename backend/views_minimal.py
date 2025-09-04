"""
Minimal version of views.py without MNE dependencies for initial deployment
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import JsonResponse

from .models import EDFFile, EDFProcessingSession, EDFAnalysisResult
from .serializers import (
    EDFFileSerializer, EDFUploadSerializer
)


class EDFFileViewSet(viewsets.ModelViewSet):
    """Minimal ViewSet for EDF file management - without MNE processing"""
    queryset = EDFFile.objects.all()
    serializer_class = EDFFileSerializer
    parser_classes = (MultiPartParser, FormParser)

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """Handle EDF file upload - basic version without processing"""
        serializer = EDFUploadSerializer(data=request.data)
        if serializer.is_valid():
            file = serializer.validated_data['file']
            name = serializer.validated_data.get('name', file.name)
            
            # Create EDF file instance - mark as processed for now
            edf_file = EDFFile.objects.create(
                name=name,
                file=file,
                is_processed=True  # Skip actual processing for minimal version
            )
            
            return Response(
                EDFFileSerializer(edf_file).data,
                status=status.HTTP_201_CREATED
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def metadata(self, request, pk=None):
        """Get basic metadata for an EDF file"""
        edf_file = self.get_object()
        
        metadata = {
            'id': str(edf_file.id),
            'name': edf_file.name,
            'file_size_mb': edf_file.file_size_mb,
            'message': 'Basic file info only - full EEG processing requires MNE installation'
        }
        
        return Response(metadata)

    @action(detail=True, methods=['post'])
    def plot_raw(self, request, pk=None):
        """Placeholder for raw signal plotting"""
        return Response({
            'error': 'Signal plotting requires MNE-Python installation',
            'message': 'This is a minimal deployment without scientific packages'
        }, status=status.HTTP_501_NOT_IMPLEMENTED)

    @action(detail=True, methods=['post'])
    def analyze(self, request, pk=None):
        """Placeholder for analysis"""
        return Response({
            'error': 'Analysis features require MNE-Python installation',
            'message': 'This is a minimal deployment without scientific packages'
        }, status=status.HTTP_501_NOT_IMPLEMENTED)