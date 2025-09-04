"""
WSGI config for eeg_backend project.
"""

import os

from django.core.wsgi import get_wsgi_application

# Use production settings if RAILWAY_ENVIRONMENT is set
if os.environ.get('RAILWAY_ENVIRONMENT'):
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'production_settings')
else:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'eeg_backend.settings')

application = get_wsgi_application()