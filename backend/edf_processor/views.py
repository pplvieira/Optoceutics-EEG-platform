from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.base import ContentFile
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
import tempfile
import os
import json

from .models import EDFFile, EDFProcessingSession, EDFAnalysisResult
from .serializers import (
    EDFFileSerializer, EDFProcessingSessionSerializer, 
    EDFUploadSerializer, AnalysisRequestSerializer,
    SignalProcessingRequestSerializer, EDFAnalysisResultSerializer
)
from .edf_utils import (
    read_edf_metadata, load_edf_data, plot_raw_signal,
    compute_psd, compute_snr_spectrum, apply_filter,
    reject_channels, rename_channels, perform_ica, save_edf
)


class EDFFileViewSet(viewsets.ModelViewSet):
    """ViewSet for EDF file management"""
    queryset = EDFFile.objects.all()
    serializer_class = EDFFileSerializer
    parser_classes = (MultiPartParser, FormParser)

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """Handle EDF file upload"""
        serializer = EDFUploadSerializer(data=request.data)
        if serializer.is_valid():
            file = serializer.validated_data['file']
            name = serializer.validated_data.get('name', file.name)
            
            # Create EDF file instance
            edf_file = EDFFile.objects.create(
                name=name,
                file=file
            )
            
            # Extract metadata in background
            try:
                metadata, error = read_edf_metadata(edf_file.file.path)
                if metadata:
                    # Update EDF file with metadata
                    for field, value in metadata.items():
                        setattr(edf_file, field, value)
                    edf_file.is_processed = True
                    edf_file.save()
                else:
                    edf_file.processing_error = error
                    edf_file.save()
            except Exception as e:
                edf_file.processing_error = str(e)
                edf_file.save()
            
            return Response(
                EDFFileSerializer(edf_file).data,
                status=status.HTTP_201_CREATED
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def metadata(self, request, pk=None):
        """Get detailed metadata for an EDF file"""
        edf_file = self.get_object()
        
        if not edf_file.is_processed:
            return Response(
                {'error': 'File not yet processed'},
                status=status.HTTP_202_ACCEPTED
            )
        
        metadata = {
            'id': str(edf_file.id),
            'name': edf_file.name,
            'subject_id': edf_file.subject_id,
            'recording_id': edf_file.recording_id,
            'start_date': edf_file.start_date,
            'start_time': edf_file.start_time,
            'duration_seconds': edf_file.duration_seconds,
            'sampling_frequency': edf_file.sampling_frequency,
            'num_channels': edf_file.num_channels,
            'channel_names': edf_file.channel_names,
            'file_size_mb': edf_file.file_size_mb,
        }
        
        return Response(metadata)

    @action(detail=True, methods=['post'])
    def plot_raw(self, request, pk=None):
        """Generate raw signal plot"""
        edf_file = self.get_object()
        
        # Get parameters
        duration = float(request.data.get('duration', 10))
        start_time = float(request.data.get('start_time', 0))
        channels = request.data.get('channels', None)
        
        try:
            # Load EDF data
            raw, error = load_edf_data(edf_file.file.path)
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            # Generate plot
            plot_data, error = plot_raw_signal(raw, duration, start_time, channels)
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            return Response({
                'plot': plot_data,
                'duration': duration,
                'start_time': start_time,
                'channels_plotted': channels or raw.ch_names[:8]
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def analyze(self, request, pk=None):
        """Perform analysis on EDF file"""
        edf_file = self.get_object()
        serializer = AnalysisRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        analysis_type = serializer.validated_data['analysis_type']
        parameters = serializer.validated_data.get('parameters', {})
        
        try:
            # Load EDF data
            raw, error = load_edf_data(edf_file.file.path)
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            # Create processing session
            session = EDFProcessingSession.objects.create(
                edf_file=edf_file,
                session_type='analysis',
                parameters=parameters
            )
            
            # Perform analysis
            result_data = None
            if analysis_type == 'psd':
                result_data, error = compute_psd(raw, **parameters)
            elif analysis_type == 'snr':
                result_data, error = compute_snr_spectrum(raw, **parameters)
            elif analysis_type == 'ica':
                result_data, error = perform_ica(raw, **parameters)
            
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            # Save analysis result
            analysis_result = EDFAnalysisResult.objects.create(
                session=session,
                analysis_type=analysis_type,
                data=result_data.get('data', {})
            )
            
            # Save plot if available
            if 'plot' in result_data:
                # You could save the plot as an image file here if needed
                pass
            
            return Response({
                'session_id': str(session.id),
                'analysis_result_id': str(analysis_result.id),
                'result': result_data
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def process_signal(self, request, pk=None):
        """Apply signal processing operations"""
        edf_file = self.get_object()
        serializer = SignalProcessingRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        operation = serializer.validated_data['operation']
        parameters = serializer.validated_data.get('parameters', {})
        
        try:
            # Load EDF data
            raw, error = load_edf_data(edf_file.file.path)
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            # Apply processing operation
            processed_raw = None
            if operation == 'filter':
                processed_raw, error = apply_filter(raw, **parameters)
            elif operation == 'reject_channels':
                processed_raw, error = reject_channels(raw, parameters.get('channels', []))
            elif operation == 'rename_channels':
                processed_raw, error = rename_channels(raw, parameters.get('mapping', {}))
            elif operation == 'ica_removal':
                # This would require a more complex implementation
                return Response({'error': 'ICA removal not yet implemented'}, status=status.HTTP_501_NOT_IMPLEMENTED)
            
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            
            # Create processing session
            session = EDFProcessingSession.objects.create(
                edf_file=edf_file,
                session_type='signal_processing',
                parameters={
                    'operation': operation,
                    **parameters
                }
            )
            
            # Save processed file temporarily
            temp_file = tempfile.NamedTemporaryFile(suffix='.edf', delete=False)
            success, error = save_edf(processed_raw, temp_file.name)
            
            if not success:
                return Response({'error': error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Save to session
            with open(temp_file.name, 'rb') as f:
                session.output_file.save(
                    f'processed_{edf_file.name}',
                    ContentFile(f.read()),
                    save=True
                )
            
            # Clean up temp file
            os.unlink(temp_file.name)
            
            return Response({
                'session_id': str(session.id),
                'processed_file_url': session.output_file.url if session.output_file else None,
                'operation': operation,
                'parameters': parameters
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def download_processed(self, request, pk=None):
        """Download processed EDF file"""
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response({'error': 'session_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        session = get_object_or_404(EDFProcessingSession, id=session_id)
        
        if not session.output_file:
            return Response({'error': 'No processed file available'}, status=status.HTTP_404_NOT_FOUND)
        
        # Serve file
        response = HttpResponse(
            session.output_file.read(),
            content_type='application/octet-stream'
        )
        response['Content-Disposition'] = f'attachment; filename="{os.path.basename(session.output_file.name)}"'
        
        return response


class EDFProcessingSessionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for processing sessions"""
    queryset = EDFProcessingSession.objects.all()
    serializer_class = EDFProcessingSessionSerializer


class EDFAnalysisResultViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for analysis results"""
    queryset = EDFAnalysisResult.objects.all()
    serializer_class = EDFAnalysisResultSerializer