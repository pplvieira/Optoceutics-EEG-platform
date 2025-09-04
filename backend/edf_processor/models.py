from django.db import models
from django.utils import timezone
import uuid
import os


def edf_upload_path(instance, filename):
    """Generate upload path for EDF files"""
    return f'edf_files/{instance.id}/{filename}'


class EDFFile(models.Model):
    """Model to store EDF file information and metadata"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=edf_upload_path)
    uploaded_at = models.DateTimeField(default=timezone.now)
    
    # EDF Metadata fields
    subject_id = models.CharField(max_length=100, blank=True, null=True)
    recording_id = models.CharField(max_length=100, blank=True, null=True)
    start_date = models.CharField(max_length=20, blank=True, null=True)
    start_time = models.CharField(max_length=20, blank=True, null=True)
    duration_seconds = models.FloatField(blank=True, null=True)
    sampling_frequency = models.FloatField(blank=True, null=True)
    num_channels = models.IntegerField(blank=True, null=True)
    channel_names = models.JSONField(default=list, blank=True)
    
    # Processing status
    is_processed = models.BooleanField(default=False)
    processing_error = models.TextField(blank=True, null=True)
    
    class Meta:
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return self.name
    
    @property
    def file_size(self):
        """Get file size in bytes"""
        if self.file and os.path.exists(self.file.path):
            return os.path.getsize(self.file.path)
        return 0
    
    @property
    def file_size_mb(self):
        """Get file size in MB"""
        return round(self.file_size / (1024 * 1024), 2)


class EDFProcessingSession(models.Model):
    """Model to track processing sessions and cache results"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    edf_file = models.ForeignKey(EDFFile, on_delete=models.CASCADE, related_name='sessions')
    session_type = models.CharField(max_length=50, choices=[
        ('analysis', 'Analysis'),
        ('signal_processing', 'Signal Processing'),
    ])
    created_at = models.DateTimeField(default=timezone.now)
    
    # Processing parameters
    parameters = models.JSONField(default=dict, blank=True)
    
    # Results storage
    results = models.JSONField(default=dict, blank=True)
    
    # File outputs (for processed EDF files)
    output_file = models.FileField(upload_to='processed_edf/', blank=True, null=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.session_type} - {self.edf_file.name}"


class EDFAnalysisResult(models.Model):
    """Model to store specific analysis results"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(EDFProcessingSession, on_delete=models.CASCADE, related_name='analysis_results')
    analysis_type = models.CharField(max_length=50, choices=[
        ('psd', 'Power Spectral Density'),
        ('snr', 'Signal-to-Noise Ratio'),
        ('ica', 'Independent Component Analysis'),
        ('artifacts', 'Artifact Detection'),
        ('connectivity', 'Connectivity Analysis'),
    ])
    
    # Results data
    data = models.JSONField(default=dict)
    plot_image = models.ImageField(upload_to='analysis_plots/', blank=True, null=True)
    
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.analysis_type} - {self.session.edf_file.name}"