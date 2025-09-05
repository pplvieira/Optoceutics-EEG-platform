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
    from sklearn.decomposition import PCA
    from sklearn.preprocessing import StandardScaler
    import seaborn as sns
except ImportError as e:
    raise ImportError(f"Required packages not installed: {e}")

app = FastAPI(title="EDF Processing API", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],
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

class SSVEPAnalysisRequest(BaseModel):
    file_id: str
    target_frequency: float = 40.0
    frequency_bands: List[float] = [8, 12, 30, 100]  # Alpha, Beta, Gamma ranges
    channels: Optional[List[str]] = None  # Specific channels for analysis
    pca_components: Optional[int] = None  # Number of PCA components

@app.get("/")
async def root():
    return {"message": "EDF Processing API", "status": "running"}

@app.post("/upload", response_model=EDFMetadata)
async def upload_edf_file(file: UploadFile = File(...)):
    """Upload and process EDF file locally"""
    
    print(f"Received upload request for file: {file.filename}")
    
    if not file.filename or not file.filename.lower().endswith(('.edf', '.bdf')):
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

@app.post("/analyze-ssvep")
async def analyze_ssvep(request: SSVEPAnalysisRequest):
    """Perform comprehensive SSVEP analysis"""
    
    if request.file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="File not found. Please upload file first.")
    
    file_path = uploaded_files[request.file_id]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")
    
    try:
        result = perform_ssvep_analysis(file_path, request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SSVEP analysis failed: {str(e)}")

@app.get("/channels/{file_id}")
async def get_channels(file_id: str):
    """Get available channels for the uploaded file"""
    
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = uploaded_files[file_id]
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        channels = {
            'channel_names': edf_file.getSignalLabels(),
            'num_channels': edf_file.signals_in_file,
            'sampling_frequency': edf_file.getSampleFrequency(0) if edf_file.signals_in_file > 0 else None
        }
        edf_file._close()
        return channels
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read channels: {str(e)}")

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
        elif analysis_type == 'ssvep_detection':
            result = detect_ssvep_response(edf_file, parameters)
        elif analysis_type == 'pca_analysis':
            result = perform_pca_analysis(edf_file, parameters)
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

def perform_ssvep_analysis(file_path: str, request: SSVEPAnalysisRequest) -> Dict[str, Any]:
    """Comprehensive SSVEP analysis including 40Hz detection, PCA, and SNR"""
    
    try:
        edf_file = pyedflib.EdfReader(file_path)
        
        # Get channel information
        all_channels = edf_file.getSignalLabels()
        sample_rate = edf_file.getSampleFrequency(0)
        
        # Select channels for analysis (prefer occipital channels)
        if request.channels is None:
            # Look for occipital channels (O1, O2, Oz) first, then use all
            occipital_channels = [ch for ch in all_channels if any(occ in ch.upper() for occ in ['O1', 'O2', 'OZ', 'PO'])]
            selected_channels = occipital_channels if occipital_channels else all_channels[:min(8, len(all_channels))]
        else:
            selected_channels = request.channels
        
        # Read signal data for selected channels
        channel_data = {}
        channel_indices = []
        
        for ch_name in selected_channels:
            if ch_name in all_channels:
                ch_idx = all_channels.index(ch_name)
                channel_indices.append(ch_idx)
                signal_data = edf_file.readSignal(ch_idx)
                channel_data[ch_name] = signal_data
        
        edf_file._close()
        
        # Perform comprehensive analysis
        results = {
            'target_frequency': request.target_frequency,
            'channels_analyzed': selected_channels,
            'sample_rate': sample_rate,
            'analysis_timestamp': datetime.now().isoformat()
        }
        
        # 1. SSVEP Detection at target frequency
        ssvep_detection = detect_ssvep_at_frequency(channel_data, sample_rate, request.target_frequency)
        results['ssvep_detection'] = ssvep_detection
        
        # 2. PCA Analysis for artifact removal
        if len(channel_data) > 1:
            pca_results = perform_pca_on_channels(channel_data, request.pca_components)
            results['pca_analysis'] = pca_results
        
        # 3. Comprehensive frequency analysis
        freq_analysis = analyze_frequency_bands(channel_data, sample_rate, request.frequency_bands)
        results['frequency_analysis'] = freq_analysis
        
        # 4. SNR analysis specifically around target frequency
        snr_analysis = compute_ssvep_snr(channel_data, sample_rate, request.target_frequency)
        results['snr_analysis'] = snr_analysis
        
        # 5. Generate comprehensive visualization
        visualization = create_ssvep_visualization(results)
        results['visualization'] = visualization
        
        return results
        
    except Exception as e:
        raise Exception(f"SSVEP analysis failed: {str(e)}")

def detect_ssvep_at_frequency(channel_data: Dict[str, np.ndarray], sample_rate: float, target_freq: float) -> Dict[str, Any]:
    """Detect SSVEP response at specific frequency (e.g., 40Hz)"""
    
    results = {}
    
    for ch_name, signal_data in channel_data.items():
        # Bandpass filter around target frequency (±2 Hz)
        sos = signal.butter(4, [target_freq-2, target_freq+2], btype='band', fs=sample_rate, output='sos')
        filtered_signal = signal.sosfilt(sos, signal_data)
        
        # Compute PSD using Welch's method
        freqs, psd = signal.welch(filtered_signal, fs=sample_rate, nperseg=2048)
        
        # Find peak at target frequency
        target_idx = np.argmin(np.abs(freqs - target_freq))
        peak_power = psd[target_idx]
        
        # Calculate SNR at target frequency
        noise_indices = np.where((freqs >= target_freq-10) & (freqs <= target_freq+10) & 
                               (np.abs(freqs - target_freq) >= 3))[0]
        noise_power = np.mean(psd[noise_indices]) if len(noise_indices) > 0 else peak_power * 0.1
        
        snr_db = 10 * np.log10(peak_power / noise_power) if noise_power > 0 else 0
        
        results[ch_name] = {
            'peak_power': float(peak_power),
            'snr_db': float(snr_db),
            'target_frequency': target_freq,
            'detection_confidence': 'high' if snr_db > 6 else 'medium' if snr_db > 3 else 'low'
        }
    
    return results

def perform_pca_on_channels(channel_data: Dict[str, np.ndarray], n_components: Optional[int] = None) -> Dict[str, Any]:
    """Perform PCA analysis on EEG channels for artifact removal"""
    
    # Prepare data matrix (samples x channels)
    channel_names = list(channel_data.keys())
    data_matrix = np.array([channel_data[ch] for ch in channel_names]).T
    
    # Standardize data
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data_matrix)
    
    # Determine number of components
    if n_components is None:
        n_components = min(len(channel_names), 5)  # Use up to 5 components by default
    
    # Perform PCA
    pca = PCA(n_components=n_components)
    components = pca.fit_transform(data_scaled)
    
    results = {
        'n_components': n_components,
        'explained_variance_ratio': pca.explained_variance_ratio_.tolist(),
        'cumulative_variance': np.cumsum(pca.explained_variance_ratio_).tolist(),
        'component_loadings': pca.components_.tolist(),
        'channel_names': channel_names
    }
    
    return results

def analyze_frequency_bands(channel_data: Dict[str, np.ndarray], sample_rate: float, frequency_bands: List[float]) -> Dict[str, Any]:
    """Analyze power in different frequency bands"""
    
    band_names = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma']
    band_ranges = [(0.5, frequency_bands[0]), (frequency_bands[0], 8), (8, frequency_bands[1]), 
                   (frequency_bands[1], frequency_bands[2]), (frequency_bands[2], frequency_bands[3])]
    
    results = {}
    
    for ch_name, signal_data in channel_data.items():
        # Compute PSD
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        
        band_powers = {}
        for band_name, (fmin, fmax) in zip(band_names, band_ranges):
            band_mask = (freqs >= fmin) & (freqs <= fmax)
            band_power = np.trapz(psd[band_mask], freqs[band_mask])
            band_powers[band_name] = float(band_power)
        
        total_power = sum(band_powers.values())
        relative_powers = {band: power/total_power for band, power in band_powers.items()}
        
        results[ch_name] = {
            'absolute_power': band_powers,
            'relative_power': relative_powers
        }
    
    return results

def compute_ssvep_snr(channel_data: Dict[str, np.ndarray], sample_rate: float, target_freq: float) -> Dict[str, Any]:
    """Compute SNR specifically for SSVEP analysis"""
    
    results = {}
    
    for ch_name, signal_data in channel_data.items():
        # Compute PSD
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=4096)
        
        # Find target frequency bin
        target_idx = np.argmin(np.abs(freqs - target_freq))
        
        # Signal power at target frequency (±0.5 Hz)
        signal_range = (freqs >= target_freq - 0.5) & (freqs <= target_freq + 0.5)
        signal_power = np.max(psd[signal_range])
        
        # Noise power in surrounding frequencies (excluding ±2 Hz around target)
        noise_range = ((freqs >= target_freq - 10) & (freqs <= target_freq - 2)) | \
                     ((freqs >= target_freq + 2) & (freqs <= target_freq + 10))
        noise_power = np.mean(psd[noise_range]) if np.any(noise_range) else signal_power * 0.1
        
        # Calculate SNR
        snr_linear = signal_power / noise_power if noise_power > 0 else 1
        snr_db = 10 * np.log10(snr_linear)
        
        results[ch_name] = {
            'signal_power': float(signal_power),
            'noise_power': float(noise_power),
            'snr_linear': float(snr_linear),
            'snr_db': float(snr_db)
        }
    
    return results

def create_ssvep_visualization(results: Dict[str, Any]) -> str:
    """Create comprehensive SSVEP analysis visualization"""
    
    fig = plt.figure(figsize=(16, 12))
    
    # 1. SNR by Channel (top left)
    ax1 = plt.subplot(2, 3, 1)
    channels = list(results['ssvep_detection'].keys())
    snr_values = [results['ssvep_detection'][ch]['snr_db'] for ch in channels]
    
    bars = ax1.bar(range(len(channels)), snr_values, color='skyblue', alpha=0.7)
    ax1.set_xlabel('Channels')
    ax1.set_ylabel('SNR (dB)')
    ax1.set_title('SSVEP SNR by Channel')
    ax1.set_xticks(range(len(channels)))
    ax1.set_xticklabels(channels, rotation=45)
    ax1.grid(True, alpha=0.3)
    
    # Add threshold line
    ax1.axhline(y=3, color='orange', linestyle='--', label='Medium threshold')
    ax1.axhline(y=6, color='red', linestyle='--', label='High threshold')
    ax1.legend()
    
    # 2. PCA Explained Variance (top middle)
    if 'pca_analysis' in results:
        ax2 = plt.subplot(2, 3, 2)
        components = range(1, len(results['pca_analysis']['explained_variance_ratio']) + 1)
        ax2.plot(components, results['pca_analysis']['cumulative_variance'], 'bo-')
        ax2.set_xlabel('Principal Component')
        ax2.set_ylabel('Cumulative Explained Variance')
        ax2.set_title('PCA Cumulative Variance')
        ax2.grid(True, alpha=0.3)
        ax2.axhline(y=0.95, color='red', linestyle='--', alpha=0.5)
    
    # 3. Frequency Band Analysis (top right)
    ax3 = plt.subplot(2, 3, 3)
    if 'frequency_analysis' in results and results['frequency_analysis']:
        first_channel = list(results['frequency_analysis'].keys())[0]
        band_data = results['frequency_analysis'][first_channel]['relative_power']
        
        bands = list(band_data.keys())
        powers = list(band_data.values())
        
        wedges, texts, autotexts = ax3.pie(powers, labels=bands, autopct='%1.1f%%', startangle=90)
        ax3.set_title(f'Frequency Band Distribution\n({first_channel})')
    
    # 4. Detection Confidence Matrix (bottom left)
    ax4 = plt.subplot(2, 3, 4)
    confidence_data = []
    confidence_labels = []
    
    for ch in channels:
        conf = results['ssvep_detection'][ch]['detection_confidence']
        conf_val = {'high': 3, 'medium': 2, 'low': 1}[conf]
        confidence_data.append(conf_val)
        confidence_labels.append(f"{ch}\n{conf}")
    
    colors = ['red' if c == 1 else 'orange' if c == 2 else 'green' for c in confidence_data]
    ax4.bar(range(len(channels)), confidence_data, color=colors, alpha=0.7)
    ax4.set_ylabel('Confidence Level')
    ax4.set_title('SSVEP Detection Confidence')
    ax4.set_xticks(range(len(channels)))
    ax4.set_xticklabels([ch[:4] for ch in channels])
    ax4.set_yticks([1, 2, 3])
    ax4.set_yticklabels(['Low', 'Medium', 'High'])
    
    # 5. Power Spectrum Summary (bottom middle)
    ax5 = plt.subplot(2, 3, 5)
    target_freq = results['target_frequency']
    
    for i, ch in enumerate(channels[:3]):  # Show first 3 channels
        # This is a simplified representation - in real implementation you'd plot actual PSD
        peak_power = results['ssvep_detection'][ch]['peak_power']
        ax5.bar(i, peak_power, alpha=0.7, label=ch)
    
    ax5.set_xlabel('Channels')
    ax5.set_ylabel('Power at Target Frequency')
    ax5.set_title(f'Peak Power at {target_freq}Hz')
    ax5.legend()
    
    # 6. Analysis Summary (bottom right)
    ax6 = plt.subplot(2, 3, 6)
    ax6.axis('off')
    
    # Create summary text
    summary_text = f"""SSVEP Analysis Summary
    
Target Frequency: {target_freq} Hz
Channels Analyzed: {len(channels)}
Analysis Time: {results['analysis_timestamp'][:19]}

Best Channel: {max(channels, key=lambda c: results['ssvep_detection'][c]['snr_db'])}
Average SNR: {np.mean(snr_values):.2f} dB

Detection Quality:
• High: {sum(1 for ch in channels if results['ssvep_detection'][ch]['detection_confidence'] == 'high')}
• Medium: {sum(1 for ch in channels if results['ssvep_detection'][ch]['detection_confidence'] == 'medium')}
• Low: {sum(1 for ch in channels if results['ssvep_detection'][ch]['detection_confidence'] == 'low')}"""
    
    ax6.text(0.05, 0.95, summary_text, transform=ax6.transAxes, fontsize=10, 
             verticalalignment='top', bbox=dict(boxstyle='round', facecolor='lightgray', alpha=0.8))
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return plot_base64

def detect_ssvep_response(edf_file, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Detect SSVEP response using advanced signal processing"""
    
    target_freq = parameters.get('target_frequency', 40.0)
    channels = parameters.get('channels', [0])
    
    if not isinstance(channels, list):
        channels = [channels]
    
    sample_rate = edf_file.getSampleFrequency(0)
    
    results = {}
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            # Read signal
            signal_data = edf_file.readSignal(ch_idx)
            
            # Apply bandpass filter around target frequency
            sos = signal.butter(6, [target_freq-5, target_freq+5], btype='band', fs=sample_rate, output='sos')
            filtered_signal = signal.sosfilt(sos, signal_data)
            
            # Detect SSVEP using multiple methods
            detection_results = {
                'frequency_domain': detect_frequency_domain(filtered_signal, sample_rate, target_freq),
                'time_domain': detect_time_domain(filtered_signal, sample_rate, target_freq),
                'coherence': compute_coherence_measure(signal_data, sample_rate, target_freq)
            }
            
            channel_label = edf_file.getLabel(ch_idx)
            results[channel_label] = detection_results
    
    return {
        'detection_results': results,
        'target_frequency': target_freq,
        'analysis_type': 'ssvep_detection',
        'parameters': parameters
    }

def detect_frequency_domain(signal_data: np.ndarray, sample_rate: float, target_freq: float) -> Dict[str, Any]:
    """Frequency domain SSVEP detection"""
    
    # Compute PSD
    freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=4096)
    
    # Find peak at target frequency
    target_idx = np.argmin(np.abs(freqs - target_freq))
    peak_power = psd[target_idx]
    
    # Calculate SNR
    noise_band = (freqs >= target_freq-10) & (freqs <= target_freq+10) & (np.abs(freqs - target_freq) >= 3)
    noise_power = np.mean(psd[noise_band]) if np.any(noise_band) else peak_power * 0.1
    
    snr_db = 10 * np.log10(peak_power / noise_power) if noise_power > 0 else 0
    
    return {
        'peak_power': float(peak_power),
        'noise_power': float(noise_power),
        'snr_db': float(snr_db),
        'detection_threshold': snr_db > 3
    }

def detect_time_domain(signal_data: np.ndarray, sample_rate: float, target_freq: float) -> Dict[str, Any]:
    """Time domain SSVEP detection using template matching"""
    
    # Create template signal
    duration = 1.0  # 1 second template
    t = np.linspace(0, duration, int(sample_rate * duration))
    template = np.sin(2 * np.pi * target_freq * t)
    
    # Cross-correlation with template
    correlation = np.correlate(signal_data, template, mode='valid')
    max_correlation = np.max(np.abs(correlation))
    
    # Normalize by signal energy
    signal_energy = np.sum(signal_data**2)
    template_energy = np.sum(template**2)
    normalized_correlation = max_correlation / np.sqrt(signal_energy * template_energy)
    
    return {
        'max_correlation': float(max_correlation),
        'normalized_correlation': float(normalized_correlation),
        'detection_threshold': normalized_correlation > 0.3
    }

def compute_coherence_measure(signal_data: np.ndarray, sample_rate: float, target_freq: float) -> Dict[str, Any]:
    """Compute coherence measure for SSVEP detection"""
    
    # Create reference signal at target frequency
    t = np.arange(len(signal_data)) / sample_rate
    reference = np.sin(2 * np.pi * target_freq * t)
    
    # Compute coherence
    freqs, coherence = signal.coherence(signal_data, reference, fs=sample_rate, nperseg=2048)
    
    # Find coherence at target frequency
    target_idx = np.argmin(np.abs(freqs - target_freq))
    coherence_value = coherence[target_idx]
    
    return {
        'coherence_value': float(coherence_value),
        'detection_threshold': coherence_value > 0.5
    }

def perform_pca_analysis(edf_file, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Perform PCA analysis on EEG data"""
    
    n_components = parameters.get('n_components', 5)
    channels = parameters.get('channels', list(range(min(8, edf_file.signals_in_file))))
    
    # Read data from multiple channels
    data_matrix = []
    channel_labels = []
    
    for ch_idx in channels:
        if ch_idx < edf_file.signals_in_file:
            signal_data = edf_file.readSignal(ch_idx)
            data_matrix.append(signal_data)
            channel_labels.append(edf_file.getLabel(ch_idx))
    
    if len(data_matrix) < 2:
        return {'error': 'Need at least 2 channels for PCA analysis'}
    
    # Prepare data (samples x features)
    data_matrix = np.array(data_matrix).T
    
    # Standardize data
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data_matrix)
    
    # Perform PCA
    pca = PCA(n_components=min(n_components, len(channel_labels)))
    components = pca.fit_transform(data_scaled)
    
    # Create visualization
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # Plot explained variance
    axes[0, 0].bar(range(1, len(pca.explained_variance_ratio_) + 1), pca.explained_variance_ratio_)
    axes[0, 0].set_xlabel('Principal Component')
    axes[0, 0].set_ylabel('Explained Variance Ratio')
    axes[0, 0].set_title('PCA Explained Variance')
    
    # Plot cumulative variance
    axes[0, 1].plot(range(1, len(pca.explained_variance_ratio_) + 1), np.cumsum(pca.explained_variance_ratio_), 'bo-')
    axes[0, 1].set_xlabel('Principal Component')
    axes[0, 1].set_ylabel('Cumulative Explained Variance')
    axes[0, 1].set_title('Cumulative Explained Variance')
    axes[0, 1].axhline(y=0.95, color='r', linestyle='--', alpha=0.7)
    
    # Plot component loadings heatmap
    sns.heatmap(pca.components_[:4], xticklabels=channel_labels, yticklabels=[f'PC{i+1}' for i in range(4)], 
                annot=True, cmap='coolwarm', center=0, ax=axes[1, 0])
    axes[1, 0].set_title('Component Loadings')
    
    # Plot first two principal components
    axes[1, 1].scatter(components[:, 0], components[:, 1], alpha=0.6)
    axes[1, 1].set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%} variance)')
    axes[1, 1].set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%} variance)')
    axes[1, 1].set_title('First Two Principal Components')
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return {
        'plot': plot_base64,
        'explained_variance_ratio': pca.explained_variance_ratio_.tolist(),
        'cumulative_variance': np.cumsum(pca.explained_variance_ratio_).tolist(),
        'n_components': len(pca.explained_variance_ratio_),
        'channels_analyzed': channel_labels,
        'analysis_type': 'pca_analysis'
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)