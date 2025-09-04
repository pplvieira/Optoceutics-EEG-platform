"""
Local FastAPI backend for EDF processing
Runs on http://localhost:8000
"""
import io
import base64
import tempfile
import os
from datetime import datetime
from typing import List, Optional, Dict, Any
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import pyedflib
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    from scipy import signal
    from scipy.fft import fft, fftfreq
except ImportError as e:
    raise ImportError(f"Required packages not installed: {e}")

app = FastAPI(title="EDF Processing API", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for session-based file handling
uploaded_files: Dict[str, str] = {}  # file_id -> temp_path

class EDFMetadata(BaseModel):
    id: str
    filename: str
    name: str
    file_size_mb: float
    uploaded_at: str
    duration_seconds: Optional[float] = None
    sampling_frequency: Optional[float] = None
    num_channels: Optional[int] = None
    channel_names: Optional[List[str]] = None
    is_processed: bool = True
    processing_message: Optional[str] = None

class AnalysisRequest(BaseModel):
    file_id: str
    analysis_type: str
    parameters: Dict[str, Any] = {}

@app.get("/")
async def root():
    return {"message": "EDF Processing API", "status": "running"}

@app.post("/upload", response_model=EDFMetadata)
async def upload_edf_file(file: UploadFile = File(...)):
    """Upload and process EDF file locally"""
    
    if not file.filename.lower().endswith(('.edf', '.bdf')):
        raise HTTPException(status_code=400, detail="Only EDF/BDF files are supported")
    
    # Generate unique file ID
    file_id = str(uuid.uuid4())
    
    # Create temporary file
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.edf')
    
    try:
        # Save uploaded file
        content = await file.read()
        temp_file.write(content)
        temp_file.close()
        
        # Store file path for later processing
        uploaded_files[file_id] = temp_file.name
        
        # Extract metadata
        metadata = extract_edf_metadata(temp_file.name, file.filename, file_id)
        
        return metadata
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_file.name):
            os.unlink(temp_file.name)
        if file_id in uploaded_files:
            del uploaded_files[file_id]
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.post("/analyze")
async def analyze_edf_file(request: AnalysisRequest):
    """Perform analysis on uploaded EDF file"""
    
    if request.file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="File not found. Please upload file first.")
    
    file_path = uploaded_files[request.file_id]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")
    
    try:
        result = perform_analysis(file_path, request.analysis_type, request.parameters)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Clean up temporary file"""
    
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = uploaded_files[file_id]
    
    # Clean up file
    if os.path.exists(file_path):
        os.unlink(file_path)
    
    del uploaded_files[file_id]
    
    return {"message": "File deleted successfully"}

@app.get("/files")
async def list_files():
    """List all uploaded files in session"""
    
    active_files = []
    to_remove = []
    
    for file_id, file_path in uploaded_files.items():
        if os.path.exists(file_path):
            active_files.append({
                "file_id": file_id,
                "path": file_path,
                "size_mb": round(os.path.getsize(file_path) / (1024 * 1024), 2)
            })
        else:
            to_remove.append(file_id)
    
    # Clean up missing files
    for file_id in to_remove:
        del uploaded_files[file_id]
    
    return {"files": active_files, "count": len(active_files)}

def extract_edf_metadata(file_path: str, filename: str, file_id: str) -> EDFMetadata:
    """Extract metadata from EDF file"""
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        
        metadata = EDFMetadata(
            id=file_id,
            filename=filename,
            name=filename,
            file_size_mb=round(os.path.getsize(file_path) / (1024 * 1024), 2),
            uploaded_at=datetime.now().isoformat(),
            
            # EDF specific metadata
            num_channels=edf_file.signals_in_file,
            channel_names=edf_file.getSignalLabels(),
            duration_seconds=edf_file.file_duration,
            sampling_frequency=edf_file.getSampleFrequency(0) if edf_file.signals_in_file > 0 else None,
            is_processed=True,
            processing_message=f"Successfully processed {edf_file.signals_in_file} channels"
        )
        
        edf_file._close()
        return metadata
        
    except Exception as e:
        raise Exception(f"Failed to read EDF metadata: {str(e)}")

def perform_analysis(file_path: str, analysis_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Perform analysis on EDF file"""
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        
        if analysis_type == 'plot_raw':
            result = plot_raw_signal(edf_file, parameters)
        elif analysis_type == 'psd':
            result = compute_power_spectral_density(edf_file, parameters)
        elif analysis_type == 'snr':
            result = compute_signal_to_noise_ratio(edf_file, parameters)
        else:
            raise ValueError(f"Unknown analysis type: {analysis_type}")
        
        edf_file._close()
        return result
        
    except Exception as e:
        raise Exception(f"Analysis failed: {str(e)}")

def plot_raw_signal(edf_file, parameters: Dict[str, Any]) -> Dict[str, Any]:
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

def compute_power_spectral_density(edf_file, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Compute Power Spectral Density"""
    
    fmin = parameters.get('fmin', 0.5)
    fmax = parameters.get('fmax', 50)
    channels = parameters.get('channels', [0])
    
    if not isinstance(channels, list):
        channels = [channels]
    
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

def compute_signal_to_noise_ratio(edf_file, parameters: Dict[str, Any]) -> Dict[str, Any]:
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
            
            # Simple SNR estimation
            noise_floor = np.percentile(psd, 10)
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)