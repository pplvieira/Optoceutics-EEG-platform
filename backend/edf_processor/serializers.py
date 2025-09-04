from rest_framework import serializers
from .models import EDFFile, EDFProcessingSession, EDFAnalysisResult


class EDFFileSerializer(serializers.ModelSerializer):
    file_size_mb = serializers.ReadOnlyField()
    
    class Meta:
        model = EDFFile
        fields = [
            'id', 'name', 'file', 'uploaded_at', 'subject_id', 'recording_id',
            'start_date', 'start_time', 'duration_seconds', 'sampling_frequency',
            'num_channels', 'channel_names', 'is_processed', 'processing_error',
            'file_size_mb'
        ]
        read_only_fields = [
            'id', 'uploaded_at', 'subject_id', 'recording_id', 'start_date',
            'start_time', 'duration_seconds', 'sampling_frequency', 'num_channels',
            'channel_names', 'is_processed', 'processing_error', 'file_size_mb'
        ]


class EDFAnalysisResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = EDFAnalysisResult
        fields = ['id', 'analysis_type', 'data', 'plot_image', 'created_at']


class EDFProcessingSessionSerializer(serializers.ModelSerializer):
    analysis_results = EDFAnalysisResultSerializer(many=True, read_only=True)
    
    class Meta:
        model = EDFProcessingSession
        fields = [
            'id', 'edf_file', 'session_type', 'created_at', 'parameters',
            'results', 'output_file', 'analysis_results'
        ]


class EDFUploadSerializer(serializers.Serializer):
    """Serializer for handling file uploads"""
    file = serializers.FileField()
    name = serializers.CharField(max_length=255, required=False)
    
    def validate_file(self, value):
        """Validate that the uploaded file is an EDF file"""
        if not value.name.lower().endswith(('.edf', '.bdf')):
            raise serializers.ValidationError("Only EDF and BDF files are supported.")
        
        # Check file size (max 100MB)
        if value.size > 100 * 1024 * 1024:
            raise serializers.ValidationError("File size cannot exceed 100MB.")
        
        return value


class AnalysisRequestSerializer(serializers.Serializer):
    """Serializer for analysis requests"""
    analysis_type = serializers.ChoiceField(choices=[
        'psd', 'snr', 'ica', 'artifacts', 'connectivity'
    ])
    parameters = serializers.JSONField(required=False, default=dict)


class SignalProcessingRequestSerializer(serializers.Serializer):
    """Serializer for signal processing requests"""
    operation = serializers.ChoiceField(choices=[
        'filter', 'epoch', 'reject_channels', 'rename_channels', 
        'ica_removal', 'artifact_removal'
    ])
    parameters = serializers.JSONField(required=False, default=dict)