"""
FOOOF (Fitting Oscillations & One Over F) Spectral Parameterization

This module provides FOOOF analysis functionality for EEG data, separating
periodic (oscillatory) and aperiodic (1/f) components from power spectra.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend
import matplotlib.pyplot as plt
from scipy import signal
import json
import base64
from io import BytesIO
import warnings
warnings.filterwarnings('ignore')

# Try to import FOOOF
FOOOF_AVAILABLE = False
try:
    from fooof import FOOOF
    FOOOF_AVAILABLE = True
    print("FOOOF library available for spectral parameterization")
except ImportError:
    print("FOOOF library not available")


def analyze_fooof_spectrum(freqs, psd, channel_name, parameters):
    """
    Analyze a single channel's power spectrum using FOOOF.

    Parameters:
    -----------
    freqs : array
        Frequency values
    psd : array
        Power spectral density values
    channel_name : str
        Name of the channel
    parameters : dict
        FOOOF parameters including:
        - freq_range: [min, max] frequency range
        - peak_width_limits: [min, max] peak width
        - max_n_peaks: maximum number of peaks
        - min_peak_height: minimum peak height
        - aperiodic_mode: 'fixed' or 'knee'

    Returns:
    --------
    dict : Analysis results including fitted parameters and components
    """
    if not FOOOF_AVAILABLE:
        return {
            'success': False,
            'error': 'FOOOF library not available'
        }

    try:
        # Extract parameters
        freq_range = parameters.get('freq_range', [1, 50])
        peak_width_limits = parameters.get('peak_width_limits', [0.5, 12])
        max_n_peaks = parameters.get('max_n_peaks', 6)
        min_peak_height = parameters.get('min_peak_height', 0.1)
        aperiodic_mode = parameters.get('aperiodic_mode', 'fixed')

        # Filter frequency range
        freq_mask = (freqs >= freq_range[0]) & (freqs <= freq_range[1])
        freqs_fit = freqs[freq_mask]
        psd_fit = psd[freq_mask]

        # Initialize and fit FOOOF model
        fm = FOOOF(
            peak_width_limits=peak_width_limits,
            max_n_peaks=max_n_peaks,
            min_peak_height=min_peak_height,
            aperiodic_mode=aperiodic_mode,
            verbose=False
        )
        fm.fit(freqs_fit, psd_fit)

        # Extract results
        aperiodic_params = fm.aperiodic_params_
        peak_params = fm.peak_params_
        r_squared = fm.r_squared_
        error = fm.error_

        # Get FOOOF model components
        model_fit = fm.fooofed_spectrum_
        aperiodic_fit = fm._ap_fit

        # Calculate periodic component
        periodic_fit = model_fit - aperiodic_fit

        # Find alpha peaks (8-12 Hz)
        alpha_peaks = []
        if len(peak_params) > 0:
            for peak in peak_params:
                center_freq, power, bandwidth = peak
                if 8 <= center_freq <= 12:
                    alpha_peaks.append({
                        'frequency': float(center_freq),
                        'power': float(power),
                        'bandwidth': float(bandwidth)
                    })

        return {
            'success': True,
            'channel': channel_name,
            'freqs': freqs_fit.tolist(),
            'psd_original': psd_fit.tolist(),
            'model_fit': model_fit.tolist(),
            'aperiodic_fit': aperiodic_fit.tolist(),
            'periodic_fit': periodic_fit.tolist(),
            'aperiodic_params': aperiodic_params.tolist(),
            'peak_params': peak_params.tolist() if len(peak_params) > 0 else [],
            'alpha_peaks': alpha_peaks,
            'r_squared': float(r_squared),
            'error': float(error),
            'n_peaks': len(peak_params),
            'aperiodic_mode': aperiodic_mode
        }

    except Exception as e:
        return {
            'success': False,
            'channel': channel_name,
            'error': str(e)
        }


def create_fooof_plot(results_list, freq_range):
    """
    Create a single comprehensive plot showing FOOOF results for all channels.

    Parameters:
    -----------
    results_list : list
        List of analysis results (one per channel)
    freq_range : list
        [min, max] frequency range

    Returns:
    --------
    str : Base64 encoded PNG image
    """
    num_channels = len(results_list)

    # Create figure with subplots (one row per channel)
    fig, axes = plt.subplots(num_channels, 1, figsize=(12, 4 * num_channels))

    # Handle single channel case
    if num_channels == 1:
        axes = [axes]

    for idx, result in enumerate(results_list):
        if not result['success']:
            # Show error message
            axes[idx].text(0.5, 0.5, f"Error: {result.get('error', 'Unknown error')}",
                          ha='center', va='center', transform=axes[idx].transAxes,
                          fontsize=12, color='red')
            axes[idx].set_title(f"{result['channel']} - Analysis Failed", fontweight='bold')
            continue

        ax = axes[idx]
        freqs = np.array(result['freqs'])
        psd_original = np.array(result['psd_original'])
        model_fit = np.array(result['model_fit'])
        aperiodic_fit = np.array(result['aperiodic_fit'])
        periodic_fit = np.array(result['periodic_fit'])

        # Plot original PSD
        ax.semilogy(freqs, psd_original, 'k-', linewidth=2, label='Original PSD', alpha=0.7)

        # Plot FOOOF model fit
        ax.semilogy(freqs, model_fit, 'r--', linewidth=2, label='FOOOF Fit', alpha=0.9)

        # Plot aperiodic component
        ax.semilogy(freqs, aperiodic_fit, 'b-', linewidth=1.5, label='Aperiodic (1/f)', alpha=0.7)

        # Plot periodic component as filled area above aperiodic
        # Convert to log space for proper visualization
        periodic_power = aperiodic_fit * (1 + periodic_fit / np.max(np.abs(periodic_fit)) * 0.3)
        ax.fill_between(freqs, aperiodic_fit, periodic_power,
                        color='purple', alpha=0.3, label='Periodic Component')

        # Highlight alpha region
        ax.axvspan(8, 12, alpha=0.15, color='green', label='Alpha Band (8-12 Hz)')

        # Mark alpha peaks if found
        alpha_peaks = result['alpha_peaks']
        for alpha_peak in alpha_peaks:
            peak_freq = alpha_peak['frequency']
            # Find closest frequency index
            peak_idx = np.argmin(np.abs(freqs - peak_freq))
            ax.plot(peak_freq, psd_original[peak_idx], 'r*', markersize=20,
                   markeredgecolor='darkred', markeredgewidth=1.5,
                   label='Alpha Peak' if alpha_peaks.index(alpha_peak) == 0 else '')

        # Formatting
        ax.set_xlabel('Frequency (Hz)', fontsize=11)
        ax.set_ylabel('Power (V²/Hz)', fontsize=11)
        ax.set_title(f'{result["channel"]} - FOOOF Spectral Parameterization',
                    fontsize=12, fontweight='bold')
        ax.legend(loc='upper right', fontsize=9)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(freq_range[0], freq_range[1])

        # Add text box with aperiodic parameters
        aperiodic_params = result['aperiodic_params']
        r_squared = result['r_squared']
        n_peaks = result['n_peaks']
        aperiodic_mode = result['aperiodic_mode']

        if aperiodic_mode == 'fixed':
            offset, exponent = aperiodic_params
            text_str = (f'Aperiodic Parameters:\n'
                       f'  Offset: {offset:.3f}\n'
                       f'  Exponent: {exponent:.3f}\n'
                       f'  R²: {r_squared:.3f}\n'
                       f'  Peaks: {n_peaks}')
        else:  # knee mode
            offset, knee, exponent = aperiodic_params
            text_str = (f'Aperiodic Parameters:\n'
                       f'  Offset: {offset:.3f}\n'
                       f'  Knee: {knee:.3f}\n'
                       f'  Exponent: {exponent:.3f}\n'
                       f'  R²: {r_squared:.3f}\n'
                       f'  Peaks: {n_peaks}')

        # Add alpha peak info if found
        if alpha_peaks:
            text_str += f'\n\nAlpha Peaks:'
            for i, peak in enumerate(alpha_peaks[:3]):  # Show max 3 peaks
                text_str += f'\n  {peak["frequency"]:.1f} Hz (BW: {peak["bandwidth"]:.1f})'

        ax.text(0.02, 0.98, text_str, transform=ax.transAxes,
               fontsize=9, verticalalignment='top',
               bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.85,
                        edgecolor='gray', linewidth=1.5),
               family='monospace')

    plt.tight_layout()

    # Convert to base64
    buffer = BytesIO()
    plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight', facecolor='white')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()

    return plot_base64


def run_fooof_analysis(edf_reader, selected_channels, parameters,
                       get_channel_names_func, get_signal_data_func,
                       get_sample_frequency_func):
    """
    Main function to run FOOOF analysis on selected channels.

    Parameters:
    -----------
    edf_reader : object
        EDF reader object (MNE, pyedflib, or pure Python reader)
    selected_channels : list
        List of channel names to analyze
    parameters : dict
        Analysis parameters
    get_channel_names_func : callable
        Function to get channel names from reader
    get_signal_data_func : callable
        Function to get signal data from reader
    get_sample_frequency_func : callable
        Function to get sample frequency from reader

    Returns:
    --------
    str : JSON string with analysis results
    """
    if not FOOOF_AVAILABLE:
        return json.dumps({
            'analysis_type': 'fooof',
            'success': False,
            'error': 'FOOOF library not available. Please ensure fooof is installed.'
        })

    try:
        # Extract parameters
        nperseg_seconds = parameters.get('nperseg_seconds', 4.0)
        noverlap_proportion = parameters.get('noverlap_proportion', 0.5)
        freq_range = parameters.get('freq_range', [1, 50])

        # Get channel information
        all_channels = get_channel_names_func(edf_reader)
        sample_rate = get_sample_frequency_func(edf_reader)

        # Filter selected channels
        selected_channels = [ch for ch in selected_channels if ch in all_channels]
        if not selected_channels:
            selected_channels = all_channels[:4]  # Default to first 4

        # Limit to 4 channels for readability
        num_channels = min(4, len(selected_channels))
        selected_channels = selected_channels[:num_channels]

        # Calculate PSD parameters
        nperseg = int(nperseg_seconds * sample_rate)
        noverlap = int(noverlap_proportion * nperseg)

        # Analyze each channel
        results_list = []
        fooof_results = {}

        for ch_name in selected_channels:
            ch_idx = all_channels.index(ch_name)
            signal_data = get_signal_data_func(edf_reader, ch_idx)

            # Compute PSD using Welch method
            freqs, psd = signal.welch(signal_data, fs=sample_rate,
                                     nperseg=nperseg, noverlap=noverlap,
                                     window='hann')

            # Run FOOOF analysis
            result = analyze_fooof_spectrum(freqs, psd, ch_name, parameters)
            results_list.append(result)

            if result['success']:
                fooof_results[ch_name] = {
                    'aperiodic_params': result['aperiodic_params'],
                    'peak_params': result['peak_params'],
                    'alpha_peaks': result['alpha_peaks'],
                    'r_squared': result['r_squared'],
                    'error': result['error'],
                    'n_peaks': result['n_peaks']
                }
            else:
                fooof_results[ch_name] = {
                    'error': result['error'],
                    'success': False
                }

        # Create plot
        plot_base64 = create_fooof_plot(results_list, freq_range)

        return json.dumps({
            'analysis_type': 'fooof',
            'plot_base64': plot_base64,
            'parameters': parameters,
            'results': fooof_results,
            'success': True,
            'message': f'FOOOF analysis completed for {len(selected_channels)} channel(s) in range {freq_range[0]}-{freq_range[1]} Hz'
        })

    except Exception as e:
        import traceback
        return json.dumps({
            'analysis_type': 'fooof',
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        })
