"""
Vercel serverless function for EDF signal analysis
Simplified version without matplotlib/scipy to stay under 250MB limit
"""
import json
import base64
import tempfile
import os
from datetime import datetime

try:
    import pyedflib
    import numpy as np
except ImportError as e:
    pyedflib = None
    np = None

def handler(request, context):
    """Handle EDF signal analysis requests"""
    
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
    
    if request.method != 'POST':
        return {
            'statusCode': 405,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    try:
        # Parse request body
        body = json.loads(request.body) if isinstance(request.body, str) else request.body
        
        file_data = base64.b64decode(body['file_data'])
        analysis_type = body.get('analysis_type', 'psd')
        parameters = body.get('parameters', {})
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as temp_file:
            temp_file.write(file_data)
            temp_path = temp_file.name
        
        try:
            # Perform analysis
            result = perform_analysis(temp_path, analysis_type, parameters)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps(result)
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
                'analysis_type': analysis_type,
                'message': 'Analysis failed'
            })
        }

def perform_analysis(file_path, analysis_type, parameters):
    """Perform the requested analysis on EDF file"""
    
    if not all([pyedflib, np]):
        return {
            'error': 'Required packages not available',
            'message': 'Analysis requires pyedflib and numpy'
        }
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        
        if analysis_type == 'plot_raw':
            result = get_raw_signal_data(edf_file, parameters)
        elif analysis_type == 'psd':
            result = compute_basic_psd(edf_file, parameters)
        elif analysis_type == 'snr':
            result = compute_basic_snr(edf_file, parameters)
        else:
            result = {'error': f'Unknown analysis type: {analysis_type}'}
        
        edf_file._close()
        return result
        
    except Exception as e:
        return {
            'error': str(e),
            'analysis_type': analysis_type,
            'message': 'Failed to perform analysis'
        }

def get_raw_signal_data(edf_file, parameters):
    """Get raw EEG signal data (no plotting to avoid matplotlib dependency)"""
    
    duration = parameters.get('duration', 10)
    start_time = parameters.get('start_time', 0)
    channels = parameters.get('channels', None)
    
    if channels is None:
        # Use first 4 channels by default
        channels = list(range(min(4, edf_file.signals_in_file)))
    
    # Read signal data
    sample_rate = edf_file.getSampleFrequency(0)
    start_sample = int(start_time * sample_rate)
    num_samples = int(duration * sample_rate)
    
    time_axis = np.linspace(start_time, start_time + duration, num_samples)
    signal_data = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read channel data (convert to microvolts)
            channel_data = edf_file.readSignal(ch_idx, start_sample, num_samples) * 1e6
            signal_data[edf_file.getLabel(ch_idx)] = {
                'time': time_axis.tolist(),
                'amplitude': channel_data.tolist(),
                'unit': 'µV'
            }
    
    return {
        'data': signal_data,
        'duration': duration,
        'start_time': start_time,
        'sample_rate': sample_rate,
        'channels_plotted': [edf_file.getLabel(i) for i in channels if i < edf_file.signals_in_file],
        'analysis_type': 'plot_raw',
        'message': 'Raw signal data extracted successfully. Use frontend plotting library to visualize.'
    }

def compute_basic_psd(edf_file, parameters):
    """Compute basic Power Spectral Density using numpy FFT"""
    
    fmin = parameters.get('fmin', 0.5)
    fmax = parameters.get('fmax', 50)
    channels = parameters.get('channels', [0])  # First channel by default
    
    if not isinstance(channels, list):
        channels = [channels]
    
    # Read signal data
    sample_rate = edf_file.getSampleFrequency(0)
    
    psd_data = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read entire channel
            signal_data = edf_file.readSignal(ch_idx)
            
            # Basic PSD using numpy FFT (simplified Welch-like method)
            N = len(signal_data)
            freqs = np.fft.fftfreq(N, 1/sample_rate)[:N//2]
            fft_data = np.fft.fft(signal_data)
            psd = (np.abs(fft_data[:N//2])**2) / (sample_rate * N)
            
            # Filter frequency range
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            freqs_filtered = freqs[freq_mask]
            psd_filtered = psd[freq_mask]
            
            # Store data
            channel_label = edf_file.getLabel(ch_idx)
            psd_data[channel_label] = {
                'frequencies': freqs_filtered.tolist(),
                'psd_values': psd_filtered.tolist()
            }
    
    return {
        'data': psd_data,
        'parameters': {'fmin': fmin, 'fmax': fmax, 'channels': channels},
        'analysis_type': 'psd',
        'message': 'Basic PSD computed using numpy FFT. Use frontend plotting library to visualize.'
    }

def compute_basic_snr(edf_file, parameters):
    """Compute basic Signal-to-Noise Ratio using numpy FFT"""
    
    fmin = parameters.get('fmin', 1)
    fmax = parameters.get('fmax', 40)
    channels = parameters.get('channels', [0])
    
    if not isinstance(channels, list):
        channels = [channels]
    
    sample_rate = edf_file.getSampleFrequency(0)
    
    snr_data = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read signal
            signal_data = edf_file.readSignal(ch_idx)
            
            # Basic PSD using numpy FFT
            N = len(signal_data)
            freqs = np.fft.fftfreq(N, 1/sample_rate)[:N//2]
            fft_data = np.fft.fft(signal_data)
            psd = (np.abs(fft_data[:N//2])**2) / (sample_rate * N)
            
            # Simple SNR estimation (signal power / noise floor)
            noise_floor = np.percentile(psd, 10)  # 10th percentile as noise estimate
            snr_db = 10 * np.log10(psd / noise_floor)
            
            # Filter frequency range
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            freqs_filtered = freqs[freq_mask]
            snr_filtered = snr_db[freq_mask]
            
            # Store data
            channel_label = edf_file.getLabel(ch_idx)
            snr_data[channel_label] = {
                'frequencies': freqs_filtered.tolist(),
                'snr_values': snr_filtered.tolist()
            }
    
    return {
        'data': snr_data,
        'parameters': {'fmin': fmin, 'fmax': fmax, 'channels': channels},
        'analysis_type': 'snr',
        'message': 'Basic SNR computed using numpy FFT. Use frontend plotting library to visualize.'
    }