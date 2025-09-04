from django.apps import AppConfig


class EdfProcessorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'edf_processor'
    verbose_name = 'EDF File Processor'