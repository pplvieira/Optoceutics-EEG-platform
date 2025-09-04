"""
Utility functions for EDF file processing using MNE-Python
"""
import mne
import numpy as np
import matplotlib.pyplot as plt
import io
import base64
from scipy import signal
from sklearn.decomposition import FastICA
import logging

logger = logging.getLogger(__name__)


def read_edf_metadata(file_path):
    """
    Extract metadata from EDF file without loading the full data
    """
    try:
        # Read EDF file
        raw = mne.io.read_raw_edf(file_path, preload=False, verbose=False)
        
        # Extract metadata
        info = raw.info
        metadata = {
            'sampling_frequency': info['sfreq'],
            'num_channels': len(info['ch_names']),
            'channel_names': info['ch_names'],
            'duration_seconds': raw.times[-1] if len(raw.times) > 0 else 0,
            'subject_id': info.get('subject_info', {}).get('id', 'Unknown'),
            'start_date': str(raw.info['meas_date'].date()) if raw.info.get('meas_date') else 'Unknown',
            'start_time': str(raw.info['meas_date'].time()) if raw.info.get('meas_date') else 'Unknown',
        }
        
        return metadata, None
    
    except Exception as e:
        logger.error(f"Error reading EDF metadata: {str(e)}")
        return None, str(e)


def load_edf_data(file_path, preload=True):
    """
    Load EDF file data using MNE
    """
    try:
        raw = mne.io.read_raw_edf(file_path, preload=preload, verbose=False)
        return raw, None
    except Exception as e:
        logger.error(f"Error loading EDF data: {str(e)}")
        return None, str(e)


def plot_raw_signal(raw, duration=10, start_time=0, channels=None):
    """
    Create a plot of raw EEG signal
    """
    try:
        if channels is None:
            channels = raw.ch_names[:8]  # Show first 8 channels by default
        
        # Get data for specified time window
        start_idx = int(start_time * raw.info['sfreq'])
        end_idx = int((start_time + duration) * raw.info['sfreq'])
        
        data, times = raw[channels, start_idx:end_idx]
        
        # Create plot
        fig, axes = plt.subplots(len(channels), 1, figsize=(12, 2*len(channels)), sharex=True)
        if len(channels) == 1:
            axes = [axes]
        
        for i, (ch_data, ch_name) in enumerate(zip(data, channels)):
            axes[i].plot(times[start_idx:end_idx], ch_data * 1e6)  # Convert to µV
            axes[i].set_ylabel(f'{ch_name} (µV)')
            axes[i].grid(True, alpha=0.3)
        
        axes[-1].set_xlabel('Time (s)')
        plt.title(f'Raw EEG Signal ({duration}s from {start_time}s)')
        plt.tight_layout()
        
        # Convert to base64 string
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        return image_base64, None
    
    except Exception as e:
        logger.error(f"Error plotting raw signal: {str(e)}")
        return None, str(e)


def compute_psd(raw, fmin=0.5, fmax=50, channels=None):
    """
    Compute Power Spectral Density
    """
    try:
        if channels is None:
            channels = raw.ch_names
        
        # Compute PSD
        psd, freqs = mne.time_frequency.psd_welch(
            raw, fmin=fmin, fmax=fmax, n_fft=2048, picks=channels, verbose=False
        )
        
        # Create plot
        fig, ax = plt.subplots(figsize=(10, 6))
        
        for i, ch_name in enumerate(channels):
            ax.semilogy(freqs, psd[i], label=ch_name, alpha=0.7)
        
        ax.set_xlabel('Frequency (Hz)')
        ax.set_ylabel('Power Spectral Density (V²/Hz)')
        ax.set_title('Power Spectral Density')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        # Convert to base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        # Prepare data for return
        psd_data = {
            'frequencies': freqs.tolist(),
            'psd_values': psd.tolist(),
            'channels': channels
        }
        
        return {'plot': image_base64, 'data': psd_data}, None
    
    except Exception as e:
        logger.error(f"Error computing PSD: {str(e)}")
        return None, str(e)


def compute_snr_spectrum(raw, noise_cov=None, fmin=1, fmax=40):
    """
    Compute Signal-to-Noise Ratio spectrum
    """
    try:
        # For now, implement a simple SNR estimation
        # This is a placeholder - you can enhance this with more sophisticated methods
        
        psd, freqs = mne.time_frequency.psd_welch(raw, fmin=fmin, fmax=fmax, verbose=False)
        
        # Simple SNR estimation (signal power / noise floor)
        # This is a basic implementation - enhance as needed
        noise_floor = np.percentile(psd, 10, axis=1, keepdims=True)
        snr = 10 * np.log10(psd / noise_floor)
        
        # Create plot
        fig, ax = plt.subplots(figsize=(10, 6))
        
        for i, ch_name in enumerate(raw.ch_names):
            ax.plot(freqs, snr[i], label=ch_name, alpha=0.7)
        
        ax.set_xlabel('Frequency (Hz)')
        ax.set_ylabel('SNR (dB)')
        ax.set_title('Signal-to-Noise Ratio Spectrum')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        # Convert to base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        snr_data = {
            'frequencies': freqs.tolist(),
            'snr_values': snr.tolist(),
            'channels': raw.ch_names
        }
        
        return {'plot': image_base64, 'data': snr_data}, None
    
    except Exception as e:
        logger.error(f"Error computing SNR: {str(e)}")
        return None, str(e)


def apply_filter(raw, l_freq=None, h_freq=None, filter_type='fir'):
    """
    Apply frequency filter to EEG data
    """
    try:
        raw_filtered = raw.copy()
        raw_filtered.filter(l_freq=l_freq, h_freq=h_freq, method=filter_type, verbose=False)
        return raw_filtered, None
    except Exception as e:
        logger.error(f"Error applying filter: {str(e)}")
        return None, str(e)


def reject_channels(raw, channels_to_reject):
    """
    Remove specified channels from EEG data
    """
    try:
        raw_cleaned = raw.copy()
        raw_cleaned.drop_channels(channels_to_reject)
        return raw_cleaned, None
    except Exception as e:
        logger.error(f"Error rejecting channels: {str(e)}")
        return None, str(e)


def rename_channels(raw, channel_mapping):
    """
    Rename channels in EEG data
    """
    try:
        raw_renamed = raw.copy()
        raw_renamed.rename_channels(channel_mapping)
        return raw_renamed, None
    except Exception as e:
        logger.error(f"Error renaming channels: {str(e)}")
        return None, str(e)


def perform_ica(raw, n_components=None, max_iter=500):
    """
    Perform Independent Component Analysis
    """
    try:
        # Prepare data
        raw_copy = raw.copy()
        raw_copy.filter(1, 40, verbose=False)  # Filter for ICA
        
        # Set up ICA
        n_components = n_components or min(20, len(raw.ch_names))
        ica = mne.preprocessing.ICA(n_components=n_components, max_iter=max_iter, verbose=False)
        
        # Fit ICA
        ica.fit(raw_copy)
        
        # Create component plot
        fig = ica.plot_components(show=False, figsize=(12, 8))
        
        # Convert to base64
        buffer = io.BytesIO()
        fig.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        ica_data = {
            'n_components': n_components,
            'explained_variance': ica.pca_explained_variance_.tolist() if hasattr(ica, 'pca_explained_variance_') else []
        }
        
        return {'plot': image_base64, 'data': ica_data, 'ica_object': ica}, None
    
    except Exception as e:
        logger.error(f"Error performing ICA: {str(e)}")
        return None, str(e)


def save_edf(raw, output_path):
    """
    Save processed EEG data as EDF file
    """
    try:
        raw.export(output_path, fmt='edf', overwrite=True, verbose=False)
        return True, None
    except Exception as e:
        logger.error(f"Error saving EDF: {str(e)}")
        return False, str(e)