"""
Multi-trace PSD Comparison Plot Generator
Uses the same EDF loading and PSD computation methods as the existing PSD tool
"""

import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import signal
import io
import base64
import tempfile
import os

def generate_comparison_psd(traces_config, psd_params, use_resutil_style=False):
    """
    Generate a comparison PSD plot with multiple traces
    Uses the same loading and processing methods as the existing PSD tool
    """
    try:
        # Apply resutil styling if requested
        if use_resutil_style:
            try:
                from resutil import plotlib
                plotlib.set_oc_style()
                plotlib.set_oc_font()
                print("Applied Optoceutics custom styling (resutil.plotlib)")
            except ImportError:
                print("Resutil not available, using default matplotlib styling")
            except Exception as e:
                print(f"Failed to apply resutil styling: {e}")

        # Extract PSD parameters
        method = psd_params.get('method', 'welch')
        fmin = psd_params.get('fmin', 0.5)
        fmax = psd_params.get('fmax', 50)
        nperseg_seconds = psd_params.get('nperseg_seconds', 4.0)
        noverlap_proportion = psd_params.get('noverlap_proportion', 0.5)
        window = psd_params.get('window', 'hamming')

        # Create figure
        fig, ax = plt.subplots(figsize=(12, 6))

        # Color palette if colors not specified
        default_colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
                         '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

        # Process each trace
        for idx, trace in enumerate(traces_config):
            try:
                file_bytes = trace['file_bytes']
                filename = trace['filename']
                channel = trace['channel']
                label = trace['label']

                print(f"Processing trace: {label} (file: {filename}, channel: {channel})")

                # Write bytes to temporary file (same as existing code)
                with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as tmp_file:
                    tmp_file.write(file_bytes)
                    tmp_path = tmp_file.name

                try:
                    # Try to load with MNE (same as existing code)
                    try:
                        import mne
                        MNE_AVAILABLE = True
                    except ImportError:
                        MNE_AVAILABLE = False

                    if MNE_AVAILABLE:
                        try:
                            # Try EDF first
                            raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
                        except:
                            # Try FIF if EDF fails
                            raw = mne.io.read_raw_fif(tmp_path, preload=True, verbose=False)

                        # Check if channel exists
                        if channel not in raw.ch_names:
                            print(f"Warning: Channel {channel} not found in {filename}, skipping")
                            continue

                        # Get channel data
                        raw_copy = raw.copy().pick_channels([channel])
                        data = raw_copy.get_data()[0]  # Get first (and only) channel
                        sfreq = raw_copy.info['sfreq']

                    else:
                        # Fallback to pyedflib (same as existing code)
                        import pyedflib
                        f = pyedflib.EdfReader(tmp_path)

                        # Find channel index
                        channel_names = f.getSignalLabels()
                        if channel not in channel_names:
                            print(f"Warning: Channel {channel} not found in {filename}, skipping")
                            f.close()
                            continue

                        channel_idx = channel_names.index(channel)
                        data = f.readSignal(channel_idx)
                        sfreq = f.getSampleFrequency(channel_idx)
                        f.close()

                finally:
                    # Clean up temporary file
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass

                # Apply time window if specified (same as existing code)
                if 'time_start' in trace and 'time_end' in trace:
                    time_start = trace['time_start']
                    time_end = trace['time_end']

                    start_sample = int(time_start * sfreq)
                    end_sample = int(time_end * sfreq)

                    # Validate bounds
                    start_sample = max(0, start_sample)
                    end_sample = min(len(data), end_sample)

                    if start_sample >= end_sample:
                        print(f"Warning: Invalid time window for {label}, using full data")
                    else:
                        data = data[start_sample:end_sample]
                        print(f"Applied time window {time_start}-{time_end}s to {label}")

                # Calculate PSD using the same method as existing PSD tool
                if method == 'welch':
                    nperseg = int(nperseg_seconds * sfreq)
                    noverlap = int(noverlap_proportion * nperseg)
                    freqs, psd = signal.welch(
                        data,
                        fs=sfreq,
                        window=window,
                        nperseg=nperseg,
                        noverlap=noverlap
                    )
                else:  # periodogram
                    freqs, psd = signal.periodogram(data, fs=sfreq)

                # Filter frequency range
                freq_mask = (freqs >= fmin) & (freqs <= fmax)
                freqs_filtered = freqs[freq_mask]
                psd_filtered = psd[freq_mask]

                # Get color
                color = trace.get('color', default_colors[idx % len(default_colors)])

                # Plot with log scale (same as existing PSD tool)
                ax.semilogy(freqs_filtered, psd_filtered, label=label, color=color, linewidth=2, alpha=0.8)

                print(f"✓ Plotted trace: {label}")

            except Exception as e:
                print(f"Error processing trace {label}: {e}")
                import traceback
                traceback.print_exc()
                continue

        # Configure plot (same as existing PSD tool)
        ax.set_xlabel('Frequency (Hz)', fontsize=12, fontweight='bold')
        ax.set_ylabel('Power Spectral Density (V²/Hz)', fontsize=12, fontweight='bold')
        ax.set_title('PSD Comparison', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend(loc='best', fontsize=10, framealpha=0.9)
        ax.set_xlim(fmin, fmax)

        # Tight layout
        plt.tight_layout()

        # Convert to base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.read()).decode()
        plt.close()

        return json.dumps({
            'success': True,
            'plot_base64': image_base64,
            'message': f'Generated comparison plot with {len(traces_config)} traces'
        })

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in generate_comparison_psd: {e}")
        print(error_trace)
        return json.dumps({
            'success': False,
            'error': str(e),
            'traceback': error_trace
        })
