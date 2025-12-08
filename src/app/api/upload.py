"""
Vercel serverless function for EDF file upload and metadata extraction
"""
import json
import base64
import tempfile
import os
from datetime import datetime
try:
    import pyedflib
    import numpy as np
except ImportError:
    pyedflib = None
    np = None

def handler(request, context):
    """Handle EDF file upload and extract metadata"""
    
    if request.method != 'POST':
        return {
            'statusCode': 405,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': ''
        }
    
    try:
        # Parse request body
        body = json.loads(request.body) if isinstance(request.body, str) else request.body
        
        if 'file_data' not in body:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({'error': 'No file data provided'})
            }
        
        # Decode base64 file data
        file_data = base64.b64decode(body['file_data'])
        filename = body.get('filename', 'uploaded.edf')
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as temp_file:
            temp_file.write(file_data)
            temp_path = temp_file.name
        
        try:
            # Extract metadata using pyedflib
            metadata = extract_edf_metadata(temp_path, filename)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps(metadata)
            }
        
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'Failed to process EDF file'
            })
        }

def extract_edf_metadata(file_path, filename):
    """Extract metadata from EDF file"""
    
    if not pyedflib:
        return {
            'filename': filename,
            'error': 'pyedflib not available',
            'message': 'EDF processing requires pyedflib package'
        }
    
    try:
        # Read EDF file
        edf_file = pyedflib.EdfReader(file_path)
        
        # Extract metadata
        metadata = {
            'id': f"temp_{int(datetime.now().timestamp())}",
            'filename': filename,
            'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2),
            'uploaded_at': datetime.now().isoformat(),
            
            # EDF specific metadata
            'num_channels': edf_file.signals_in_file,
            'channel_names': edf_file.getSignalLabels(),
            'duration_seconds': edf_file.file_duration,
            'sampling_frequency': edf_file.getSampleFrequency(0) if edf_file.signals_in_file > 0 else None,
            'start_date': edf_file.getStartdatetime().strftime('%Y-%m-%d') if edf_file.getStartdatetime() else None,
            'start_time': edf_file.getStartdatetime().strftime('%H:%M:%S') if edf_file.getStartdatetime() else None,
            'subject_id': edf_file.getPatientName() if hasattr(edf_file, 'getPatientName') else 'Unknown',
            
            'is_processed': True,
            'processing_message': 'Metadata extracted successfully'
        }
        
        edf_file._close()
        return metadata
        
    except Exception as e:
        return {
            'filename': filename,
            'error': str(e),
            'message': 'Failed to read EDF file metadata'
        }