from django.contrib import admin
from .models import EDFFile, EDFProcessingSession, EDFAnalysisResult


@admin.register(EDFFile)
class EDFFileAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'subject_id', 'num_channels', 'duration_seconds',
        'sampling_frequency', 'is_processed', 'uploaded_at'
    ]
    list_filter = ['is_processed', 'uploaded_at', 'num_channels']
    search_fields = ['name', 'subject_id', 'recording_id']
    readonly_fields = [
        'id', 'uploaded_at', 'subject_id', 'recording_id', 
        'start_date', 'start_time', 'duration_seconds', 
        'sampling_frequency', 'num_channels', 'channel_names'
    ]


@admin.register(EDFProcessingSession)
class EDFProcessingSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'edf_file', 'session_type', 'created_at']
    list_filter = ['session_type', 'created_at']
    search_fields = ['edf_file__name']
    readonly_fields = ['id', 'created_at']


@admin.register(EDFAnalysisResult)
class EDFAnalysisResultAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'analysis_type', 'created_at']
    list_filter = ['analysis_type', 'created_at']
    readonly_fields = ['id', 'created_at']