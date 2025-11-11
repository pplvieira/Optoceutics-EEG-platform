"""
Multi-trace PSD Comparison Plot Generator
Generates power spectral density comparison plots from multiple files/channels/time periods
"""

import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import signal
import io
import base64

def generate_comparison_psd(traces_config, psd_params, use_resutil_style=False):
    """
    Generate a comparison PSD plot with multiple traces

    Parameters:
    -----------
    traces_config : list of dict
        Each dict contains:
        - file_bytes: bytes of the EDF file
        - filename: str
        - channel: str (channel name)
        - label: str (legend label)
        - time_start: float (optional, start time in seconds)
        - time_end: float (optional, end time in seconds)
        - color: str (optional, hex color code)

    psd_params : dict
        - method: 'welch' or 'periodogram'
        - fmin: float (min frequency in Hz)
        - fmax: float (max frequency in Hz)
        - nperseg_seconds: float (window size in seconds, for Welch)
        - noverlap_proportion: float (overlap proportion, for Welch)
        - window: str (window type, for Welch)

    use_resutil_style : bool
        Whether to apply Optoceutics custom styling

    Returns:
    --------
    str : JSON string with base64 encoded plot or error
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

        # Create figure
        fig, ax = plt.subplots(figsize=(12, 6))

        # Color palette if colors not specified
        default_colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
                         '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

        # Process each trace
        for idx, trace in enumerate(traces_config):
            try:
                # Load EDF file
                file_bytes = trace['file_bytes']
                filename = trace['filename']
                channel = trace['channel']
                label = trace['label']

                # Import EDF reading library
                try:
                    import mne
                    # Create a file-like object from bytes
                    from io import BytesIO
                    file_obj = BytesIO(file_bytes)
                    raw = mne.io.read_raw_edf(file_obj, preload=True, verbose=False)

                    # Get channel data
                    if channel not in raw.ch_names:
                        print(f"Warning: Channel {channel} not found in {filename}, skipping")
                        continue

                    # Pick the channel
                    raw_copy = raw.copy().pick_channels([channel])
                    data = raw_copy.get_data()[0]  # Get first (and only) channel
                    sfreq = raw_copy.info['sfreq']

                except ImportError:
                    # Fallback to pyedflib
                    try:
                        import pyedflib
                        from io import BytesIO

                        file_obj = BytesIO(file_bytes)
                        f = pyedflib.EdfReader(file_obj)

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

                    except Exception as e:
                        print(f"Error reading {filename} with pyedflib: {e}")
                        continue

                # Apply time window if specified
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

                # Calculate PSD
                method = psd_params['method']
                fmin = psd_params['fmin']
                fmax = psd_params['fmax']

                if method == 'welch':
                    nperseg = int(psd_params['nperseg_seconds'] * sfreq)
                    noverlap = int(nperseg * psd_params['noverlap_proportion'])
                    window = psd_params['window']

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

                # Convert to dB
                psd_db = 10 * np.log10(psd_filtered)

                # Get color
                color = trace.get('color', default_colors[idx % len(default_colors)])

                # Plot
                ax.plot(freqs_filtered, psd_db, label=label, color=color, linewidth=2, alpha=0.8)

                print(f"✓ Plotted trace: {label}")

            except Exception as e:
                print(f"Error processing trace {label}: {e}")
                import traceback
                traceback.print_exc()
                continue

        # Configure plot
        ax.set_xlabel('Frequency (Hz)', fontsize=12, fontweight='bold')
        ax.set_ylabel('Power Spectral Density (dB/Hz)', fontsize=12, fontweight='bold')
        ax.set_title('PSD Comparison', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend(loc='best', fontsize=10, framealpha=0.9)

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
