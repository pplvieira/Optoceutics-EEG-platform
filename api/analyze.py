"""
Vercel serverless function for EDF signal analysis
"""
import json
import base64
import tempfile
import os
import io
from datetime import datetime

try:
    import pyedflib
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')  # Use non-interactive backend
    import matplotlib.pyplot as plt
    from scipy import signal
    from scipy.fft import fft, fftfreq
except ImportError as e:
    pyedflib = None
    np = None
    plt = None
    signal = None
    fft = None
    fftfreq = None

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
    
    if not all([pyedflib, np, plt]):
        return {
            'error': 'Required packages not available',
            'message': 'Analysis requires pyedflib, numpy, and matplotlib'
        }
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        
        if analysis_type == 'plot_raw':
            result = plot_raw_signal(edf_file, parameters)
        elif analysis_type == 'psd':
            result = compute_power_spectral_density(edf_file, parameters)
        elif analysis_type == 'snr':
            result = compute_signal_to_noise_ratio(edf_file, parameters)
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

def plot_raw_signal(edf_file, parameters):
    """Plot raw EEG signal"""
    
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
    
    fig, axes = plt.subplots(len(channels), 1, figsize=(12, 2 * len(channels)), sharex=True)
    if len(channels) == 1:
        axes = [axes]
    
    time_axis = np.linspace(start_time, start_time + duration, num_samples)
    
    for i, ch_idx in enumerate(channels):
        if ch_idx < edf_file.signals_in_file:
            # Read channel data
            signal_data = edf_file.readSignal(ch_idx, start_sample, num_samples)
            
            # Plot signal (convert to microvolts)
            axes[i].plot(time_axis, signal_data * 1e6, linewidth=0.5)
            axes[i].set_ylabel(f'{edf_file.getLabel(ch_idx)} (µV)')
            axes[i].grid(True, alpha=0.3)
    
    axes[-1].set_xlabel('Time (s)')
    plt.title(f'Raw EEG Signal ({duration}s from {start_time}s)')
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return {
        'plot': plot_base64,
        'duration': duration,
        'start_time': start_time,
        'channels_plotted': [edf_file.getLabel(i) for i in channels],
        'analysis_type': 'plot_raw'
    }

def compute_power_spectral_density(edf_file, parameters):
    """Compute Power Spectral Density"""
    
    fmin = parameters.get('fmin', 0.5)
    fmax = parameters.get('fmax', 50)
    channels = parameters.get('channels', [0])  # First channel by default
    
    if not isinstance(channels, list):
        channels = [channels]
    
    # Read signal data
    sample_rate = edf_file.getSampleFrequency(0)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    psd_data = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read entire channel
            signal_data = edf_file.readSignal(ch_idx)
            
            # Compute PSD using Welch's method
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
            
            # Filter frequency range
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            freqs_filtered = freqs[freq_mask]
            psd_filtered = psd[freq_mask]
            
            # Plot
            channel_label = edf_file.getLabel(ch_idx)
            ax.semilogy(freqs_filtered, psd_filtered, label=channel_label, alpha=0.7)
            
            # Store data
            psd_data[channel_label] = {
                'frequencies': freqs_filtered.tolist(),
                'psd_values': psd_filtered.tolist()
            }
    
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('Power Spectral Density (V²/Hz)')
    ax.set_title('Power Spectral Density')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xlim(fmin, fmax)
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return {
        'plot': plot_base64,
        'data': psd_data,
        'parameters': {'fmin': fmin, 'fmax': fmax, 'channels': channels},
        'analysis_type': 'psd'
    }

def compute_signal_to_noise_ratio(edf_file, parameters):
    """Compute Signal-to-Noise Ratio spectrum"""
    
    fmin = parameters.get('fmin', 1)
    fmax = parameters.get('fmax', 40)
    channels = parameters.get('channels', [0])
    
    if not isinstance(channels, list):
        channels = [channels]
    
    sample_rate = edf_file.getSampleFrequency(0)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    snr_data = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read signal
            signal_data = edf_file.readSignal(ch_idx)
            
            # Compute PSD
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
            
            # Simple SNR estimation (signal power / noise floor)
            noise_floor = np.percentile(psd, 10)  # 10th percentile as noise estimate
            snr_db = 10 * np.log10(psd / noise_floor)
            
            # Filter frequency range
            freq_mask = (freqs >= fmin) & (freqs <= fmax)
            freqs_filtered = freqs[freq_mask]
            snr_filtered = snr_db[freq_mask]
            
            # Plot
            channel_label = edf_file.getLabel(ch_idx)
            ax.plot(freqs_filtered, snr_filtered, label=channel_label, alpha=0.7)
            
            # Store data
            snr_data[channel_label] = {
                'frequencies': freqs_filtered.tolist(),
                'snr_values': snr_filtered.tolist()
            }
    
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('SNR (dB)')
    ax.set_title('Signal-to-Noise Ratio Spectrum')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xlim(fmin, fmax)
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return {
        'plot': plot_base64,
        'data': snr_data,
        'parameters': {'fmin': fmin, 'fmax': fmax, 'channels': channels},
        'analysis_type': 'snr'
    }