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

# Try to import FOOOF for alpha peak detection
FOOOF_AVAILABLE = False
try:
    from fooof import FOOOF
    FOOOF_AVAILABLE = True
except ImportError:
    print("FOOOF not available - alpha peak detection will be disabled")

def generate_comparison_psd(traces_config, psd_params, use_resutil_style=False, show_alpha_peaks=False):
    """
    Generate a comparison PSD plot with multiple traces
    Uses the same loading and processing methods as the existing PSD tool
    """
    try:
        # Apply resutil styling if requested
        resutil_colors = None
        if use_resutil_style:
            try:
                from resutil import plotlib
                plotlib.set_oc_style()
                plotlib.set_oc_font()
                print("Applied Optoceutics custom styling (resutil.plotlib)")

                # Extract color cycle from matplotlib after applying resutil style
                import matplotlib as mpl
                prop_cycle = mpl.rcParams['axes.prop_cycle']
                resutil_colors = [c['color'] for c in prop_cycle]
                # Ensure colors have '#' prefix
                resutil_colors = ['#' + c if not c.startswith('#') else c for c in resutil_colors]
                print(f"Using resutil color palette: {resutil_colors}")
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

        # Color palette - use resutil colors if available, otherwise default
        if resutil_colors:
            default_colors = resutil_colors
        else:
            default_colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
                             '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

        # Import MNE if available
        try:
            import mne
            mne.set_log_level('WARNING')  # Reduce MNE verbosity
            MNE_AVAILABLE = True
        except ImportError:
            MNE_AVAILABLE = False
            print("Warning: MNE not available, falling back to pyedflib")

        # Store alpha peak information for each trace
        trace_alpha_peaks = []

        # Process each trace
        for idx, trace in enumerate(traces_config):
            try:
                file_bytes = trace['file_bytes']
                filename = trace['filename']
                channel = trace['channel']
                label = trace['label']

                print(f"Processing trace: {label} (file: {filename}, channel: {channel})")

                # Determine file extension from filename
                file_ext = os.path.splitext(filename)[1]
                if not file_ext:
                    file_ext = '.edf'  # Default to EDF

                # Write bytes to temporary file with correct extension
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                    tmp_file.write(file_bytes)
                    tmp_path = tmp_file.name

                try:
                    if MNE_AVAILABLE:
                        # Use MNE's auto-detection for file format
                        raw = mne.io.read_raw(tmp_path, preload=True, verbose=False)

                        # Check if channel exists
                        if channel not in raw.ch_names:
                            print(f"Warning: Channel {channel} not found in {filename}, skipping")
                            continue

                        # Get channel data
                        raw_copy = raw.copy().pick_channels([channel])
                        data = raw_copy.get_data()[0]  # Get first (and only) channel
                        sfreq = raw_copy.info['sfreq']

                    else:
                        # Fallback to pyedflib for EDF files only
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

                # Compute alpha peaks using FOOOF if requested
                alpha_peak_info = None
                if show_alpha_peaks and FOOOF_AVAILABLE:
                    try:
                        # Run FOOOF to detect alpha peaks (8-12 Hz)
                        fm = FOOOF(
                            peak_width_limits=[0.5, 12],
                            max_n_peaks=6,
                            min_peak_height=0.1,
                            aperiodic_mode='fixed',
                            verbose=False
                        )

                        # Fit FOOOF model on full frequency range (not just fmin-fmax)
                        # Use 1-50 Hz range for better FOOOF fitting
                        fooof_freq_mask = (freqs >= 1) & (freqs <= 50)
                        freqs_fooof = freqs[fooof_freq_mask]
                        psd_fooof = psd[fooof_freq_mask]

                        fm.fit(freqs_fooof, psd_fooof)

                        # Extract alpha peaks (8-12 Hz)
                        peak_params = fm.peak_params_
                        if len(peak_params) > 0:
                            for peak in peak_params:
                                center_freq, power, bandwidth = peak
                                if 8 <= center_freq <= 12:
                                    alpha_peak_info = {
                                        'frequency': float(center_freq),
                                        'power': float(power),
                                        'bandwidth': float(bandwidth),
                                        'label': label,
                                        'color': trace.get('color', default_colors[idx % len(default_colors)])
                                    }
                                    print(f"  Found alpha peak at {center_freq:.1f} Hz for {label}")
                                    break  # Use first alpha peak found
                    except Exception as e:
                        print(f"  Warning: FOOOF analysis failed for {label}: {e}")

                # Store alpha peak info
                trace_alpha_peaks.append(alpha_peak_info)

                # Get color - use custom color if specified, otherwise use palette
                color = trace.get('color', default_colors[idx % len(default_colors)])

                # Plot with log scale
                # When resutil styling is enabled, let it control linewidth
                if use_resutil_style:
                    # Use style defaults for linewidth, let resutil control it
                    ax.semilogy(freqs_filtered, psd_filtered, label=label, color=color)
                else:
                    # Use explicit styling for non-resutil mode
                    ax.semilogy(freqs_filtered, psd_filtered, label=label, color=color, linewidth=2, alpha=0.8)

                print(f"✓ Plotted trace: {label}")

            except Exception as e:
                print(f"Error processing trace {label}: {e}")
                import traceback
                traceback.print_exc()
                continue

        # Add alpha peak labels if computed
        if show_alpha_peaks:
            # Collect valid alpha peaks
            valid_peaks = [p for p in trace_alpha_peaks if p is not None]

            if valid_peaks:
                print(f"\nAdding alpha peak labels to plot ({len(valid_peaks)} peaks found)")

                # Add labels for each trace with alpha peak
                for peak_info in valid_peaks:
                    freq = peak_info['frequency']
                    label_text = peak_info['label']
                    color = peak_info['color']

                    # Find the y-position at this frequency (approximate from plot limits)
                    # Place label at the top of the plot area
                    ylim = ax.get_ylim()
                    label_y = ylim[1] * 0.8  # Place at 80% of max y

                    # Add text annotation
                    ax.annotate(
                        f'{label_text}\nα: {freq:.1f} Hz',
                        xy=(freq, label_y),
                        xytext=(0, 10),
                        textcoords='offset points',
                        ha='center',
                        fontsize=8 if use_resutil_style else 7,
                        color=color,
                        fontweight='bold',
                        bbox=dict(
                            boxstyle='round,pad=0.4',
                            facecolor='white',
                            edgecolor=color,
                            alpha=0.9,
                            linewidth=1.5
                        ),
                        arrowprops=dict(
                            arrowstyle='->',
                            color=color,
                            linewidth=1.5,
                            connectionstyle='arc3,rad=0'
                        )
                    )

                print(f"✓ Added {len(valid_peaks)} alpha peak labels to plot")
            elif show_alpha_peaks and FOOOF_AVAILABLE:
                print("  No alpha peaks detected in the 8-12 Hz range for any trace")
            elif show_alpha_peaks and not FOOOF_AVAILABLE:
                print("  Warning: FOOOF not available - cannot compute alpha peaks")

        # Configure plot
        # When resutil styling is enabled, let it control font settings
        if use_resutil_style:
            ax.set_xlabel('Frequency (Hz)')
            ax.set_ylabel('Power Spectral Density (V²/Hz)')
            ax.set_title('PSD Comparison')
            # Grid is already set by resutil style
            ax.legend(loc='best')
        else:
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
