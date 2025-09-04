# Use Python 3.9 slim image for faster builds
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND noninteractive

# Install system dependencies for scientific packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY backend/requirements-minimal.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY backend/ /app/

# Collect static files
RUN python manage.py collectstatic --noinput --settings=production_settings

# Expose port
EXPOSE $PORT

# Start command
CMD python manage.py migrate --settings=production_settings && \
    gunicorn --bind 0.0.0.0:$PORT --timeout 120 eeg_backend.wsgi:application