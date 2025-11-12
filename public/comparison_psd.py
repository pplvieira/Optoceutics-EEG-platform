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

def generate_comparison_psd(traces_config, psd_params, use_resutil_style=False, show_alpha_peaks=False, hide_title=False, use_db_scale=False, show_gamma_peaks=False, show_snr_40hz=False):
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

        # Create figure with 4:3 aspect ratio (more square-like)
        fig, ax = plt.subplots(figsize=(12, 9))

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

        # Store gamma peak information for each trace
        trace_gamma_peaks = []

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

                        # Extract alpha peaks (8-12 Hz) and select the one with highest power
                        peak_params = fm.peak_params_
                        alpha_peaks_in_range = []
                        if len(peak_params) > 0:
                            for peak in peak_params:
                                center_freq, power, bandwidth = peak
                                if 8 <= center_freq <= 12:
                                    alpha_peaks_in_range.append(peak)

                            # Select alpha peak with highest power
                            if alpha_peaks_in_range:
                                best_peak = max(alpha_peaks_in_range, key=lambda p: p[1])  # p[1] is power
                                center_freq, power, bandwidth = best_peak

                                # Find the actual PSD value at this frequency
                                freq_idx = np.argmin(np.abs(freqs - center_freq))
                                psd_value = psd[freq_idx]

                                alpha_peak_info = {
                                    'frequency': float(center_freq),
                                    'power': float(power),
                                    'bandwidth': float(bandwidth),
                                    'label': label,
                                    'color': trace.get('color', default_colors[idx % len(default_colors)]),
                                    'psd_value': float(psd_value)  # Store actual PSD value
                                }

                                if len(alpha_peaks_in_range) > 1:
                                    print(f"  Found {len(alpha_peaks_in_range)} alpha peaks, selected highest power at {center_freq:.1f} Hz for {label}")
                                else:
                                    print(f"  Found alpha peak at {center_freq:.1f} Hz for {label}")
                    except Exception as e:
                        print(f"  Warning: FOOOF analysis failed for {label}: {e}")

                # Store alpha peak info
                trace_alpha_peaks.append(alpha_peak_info)

                # Compute gamma peaks (40Hz SSVEP) using FOOOF if requested
                gamma_peak_info = None
                if show_gamma_peaks and FOOOF_AVAILABLE:
                    try:
                        # Run FOOOF to detect gamma peaks (38-42 Hz)
                        fm_gamma = FOOOF(
                            peak_width_limits=[0.5, 12],
                            max_n_peaks=6,
                            min_peak_height=0.1,
                            aperiodic_mode='fixed',
                            verbose=False
                        )

                        # Fit FOOOF model on full frequency range
                        fooof_freq_mask_gamma = (freqs >= 1) & (freqs <= 50)
                        freqs_fooof_gamma = freqs[fooof_freq_mask_gamma]
                        psd_fooof_gamma = psd[fooof_freq_mask_gamma]

                        fm_gamma.fit(freqs_fooof_gamma, psd_fooof_gamma)

                        # Extract gamma peaks (38-42 Hz) and select the one with highest power
                        peak_params_gamma = fm_gamma.peak_params_
                        gamma_peaks_in_range = []
                        if len(peak_params_gamma) > 0:
                            for peak in peak_params_gamma:
                                center_freq, power, bandwidth = peak
                                if 38 <= center_freq <= 42:
                                    gamma_peaks_in_range.append(peak)

                            # Select gamma peak with highest power
                            if gamma_peaks_in_range:
                                best_gamma_peak = max(gamma_peaks_in_range, key=lambda p: p[1])
                                center_freq, power, bandwidth = best_gamma_peak

                                # Find the actual PSD value at this frequency
                                freq_idx = np.argmin(np.abs(freqs - center_freq))
                                psd_value = psd[freq_idx]

                                # Calculate SNR at 40Hz if requested
                                snr_40hz = None
                                if show_snr_40hz:
                                    # SNR = peak power / average power at 1-2 Hz away
                                    freq_1hz_away = ((freqs >= (center_freq - 2)) & (freqs <= (center_freq - 1))) | ((freqs >= (center_freq + 1)) & (freqs <= (center_freq + 2)))
                                    if np.any(freq_1hz_away):
                                        avg_power_away = np.mean(psd[freq_1hz_away])
                                        if avg_power_away > 0:
                                            snr_40hz = psd_value / avg_power_away

                                gamma_peak_info = {
                                    'frequency': float(center_freq),
                                    'power': float(power),
                                    'bandwidth': float(bandwidth),
                                    'label': label,
                                    'color': trace.get('color', default_colors[idx % len(default_colors)]),
                                    'psd_value': float(psd_value),
                                    'snr': float(snr_40hz) if snr_40hz is not None else None
                                }

                                if len(gamma_peaks_in_range) > 1:
                                    print(f"  Found {len(gamma_peaks_in_range)} gamma peaks, selected highest power at {center_freq:.1f} Hz for {label}")
                                else:
                                    print(f"  Found gamma peak at {center_freq:.1f} Hz for {label}")
                    except Exception as e:
                        print(f"  Warning: FOOOF gamma analysis failed for {label}: {e}")

                # Store gamma peak info
                trace_gamma_peaks.append(gamma_peak_info)

                # Get color - use custom color if specified, otherwise use palette
                color = trace.get('color', default_colors[idx % len(default_colors)])

                # Convert to dB if requested
                if use_db_scale:
                    psd_to_plot = 10 * np.log10(psd_filtered)
                else:
                    psd_to_plot = psd_filtered

                # Plot with appropriate scale
                if use_db_scale:
                    # Linear scale for dB
                    if use_resutil_style:
                        ax.plot(freqs_filtered, psd_to_plot, label=label, color=color)
                    else:
                        ax.plot(freqs_filtered, psd_to_plot, label=label, color=color, linewidth=2, alpha=0.8)
                else:
                    # Log scale for power
                    if use_resutil_style:
                        ax.semilogy(freqs_filtered, psd_to_plot, label=label, color=color)
                    else:
                        ax.semilogy(freqs_filtered, psd_to_plot, label=label, color=color, linewidth=2, alpha=0.8)

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

                # Sort peaks by frequency (left to right ordering)
                valid_peaks = sorted(valid_peaks, key=lambda p: p['frequency'])

                # Get y-axis limits for positioning
                ylim = ax.get_ylim()
                y_range = ylim[1] - ylim[0]

                # Define vertical positions for labels to avoid overlap
                # Distribute labels across different heights with very large spacing
                num_peaks = len(valid_peaks)
                if num_peaks == 1:
                    y_positions = [0.85]  # Single peak at 85%
                    x_offsets = [0]  # No horizontal offset for single peak
                elif num_peaks == 2:
                    y_positions = [0.95, 0.58]  # Two peaks with 37% gap
                    x_offsets = [-2, 2]  # Offset left and right
                elif num_peaks == 3:
                    y_positions = [0.95, 0.67, 0.39]  # Three peaks with 28% gaps
                    x_offsets = [-3, 0, 3]  # Left, center, right
                elif num_peaks == 4:
                    y_positions = [0.95, 0.72, 0.49, 0.26]  # Four peaks with 23% gaps
                    x_offsets = [-3, 0, 3, -3]
                elif num_peaks == 5:
                    y_positions = [0.95, 0.76, 0.57, 0.38, 0.19]  # Five peaks with 19% gaps
                    x_offsets = [-3, 0, 3, -3, 0]
                else:
                    # For 6+ peaks, distribute evenly between 15-95% with even spacing
                    spacing = 0.80 / (num_peaks - 1)  # Distribute across 80% of height
                    y_positions = [0.95 - (i * spacing) for i in range(num_peaks)]
                    # Alternate left and right offsets
                    x_offsets = [(-3 if i % 2 == 0 else 3) for i in range(num_peaks)]

                # Add labels for each trace with alpha peak
                for idx, peak_info in enumerate(valid_peaks):
                    freq = peak_info['frequency']
                    color = peak_info['color']
                    psd_value = peak_info.get('psd_value')

                    # Get y-position for this label
                    y_fraction = y_positions[idx % len(y_positions)]
                    label_y = ylim[0] + (y_range * y_fraction)

                    # Get x-offset for angled arrow
                    x_offset = x_offsets[idx % len(x_offsets)]
                    label_x = freq + x_offset

                    # Point arrow to actual PSD value if available, otherwise use approximation
                    if psd_value is not None:
                        arrow_y = psd_value
                    else:
                        arrow_y = ylim[0] + (y_range * 0.3)

                    # Enhanced label with frequency, power, and bandwidth
                    power = peak_info.get('power', 0)
                    bandwidth = peak_info.get('bandwidth', 0)
                    label_text = f'Alpha: {freq:.1f} Hz\nPwr: {power:.2f}\nBW: {bandwidth:.1f} Hz'

                    # Add text annotation with angled arrow, no box
                    # Font size: 12-14pt (15% smaller than previous 14-17pt)
                    ax.annotate(
                        label_text,
                        xy=(freq, arrow_y),  # Arrow points to actual peak location
                        xytext=(label_x, label_y),  # Text appears here (offset creates angle)
                        ha='center',
                        va='bottom',
                        fontsize=14 if use_resutil_style else 12,  # 15% smaller
                        color=color,
                        fontweight='semibold',  # Less bold than 'bold'
                        arrowprops=dict(
                            arrowstyle='->',
                            color=color,
                            linewidth=1.2,
                            alpha=0.8,
                            shrinkA=0,
                            shrinkB=5
                        )
                    )

                print(f"✓ Added {len(valid_peaks)} alpha peak labels to plot")
            elif show_alpha_peaks and FOOOF_AVAILABLE:
                print("  No alpha peaks detected in the 8-12 Hz range for any trace")
            elif show_alpha_peaks and not FOOOF_AVAILABLE:
                print("  Warning: FOOOF not available - cannot compute alpha peaks")

        # Add gamma peak (40Hz) labels if computed
        if show_gamma_peaks:
            # Collect gamma peaks (can be None)
            valid_gamma_peaks = []
            for idx, peak in enumerate(trace_gamma_peaks):
                trace = traces_config[idx] if idx < len(traces_config) else {}
                valid_gamma_peaks.append({
                    'peak': peak,
                    'trace_label': trace.get('label', f'Trace {idx+1}'),
                    'color': trace.get('color', default_colors[idx % len(default_colors)])
                })

            if valid_gamma_peaks:
                print(f"\nAdding gamma (40Hz) peak labels to plot")

                # Sort by frequency if peaks exist, otherwise maintain order
                gamma_with_peaks = [(i, vp) for i, vp in enumerate(valid_gamma_peaks) if vp['peak'] is not None]
                gamma_without_peaks = [(i, vp) for i, vp in enumerate(valid_gamma_peaks) if vp['peak'] is None]

                sorted_gamma = sorted(gamma_with_peaks, key=lambda x: x[1]['peak']['frequency']) + gamma_without_peaks

                # Get y-axis limits
                ylim = ax.get_ylim()
                y_range = ylim[1] - ylim[0]

                # Position gamma labels on the right side (different from alpha)
                num_gamma = len(sorted_gamma)
                if num_gamma == 1:
                    y_positions_gamma = [0.50]
                    x_offsets_gamma = [4]
                elif num_gamma == 2:
                    y_positions_gamma = [0.60, 0.35]
                    x_offsets_gamma = [4, 4]
                elif num_gamma == 3:
                    y_positions_gamma = [0.65, 0.45, 0.25]
                    x_offsets_gamma = [4, 4, 4]
                else:
                    spacing = 0.50 / (num_gamma - 1) if num_gamma > 1 else 0
                    y_positions_gamma = [0.65 - (i * spacing) for i in range(num_gamma)]
                    x_offsets_gamma = [4] * num_gamma

                # Add labels for each gamma peak
                for idx, (orig_idx, gamma_item) in enumerate(sorted_gamma):
                    peak = gamma_item['peak']
                    color = gamma_item['color']
                    trace_label = gamma_item['trace_label']

                    # Get y-position for this label
                    y_fraction = y_positions_gamma[idx % len(y_positions_gamma)]
                    label_y = ylim[0] + (y_range * y_fraction)

                    # Get x-offset (on the right side)
                    x_offset = x_offsets_gamma[idx % len(x_offsets_gamma)]

                    if peak is not None:
                        freq = peak['frequency']
                        power = peak.get('power', 0)
                        bandwidth = peak.get('bandwidth', 0)
                        psd_value = peak.get('psd_value')
                        snr = peak.get('snr')

                        label_x = freq + x_offset

                        # Point arrow to actual PSD value
                        if psd_value is not None:
                            arrow_y = psd_value
                        else:
                            arrow_y = ylim[0] + (y_range * 0.3)

                        # Build label text
                        if show_snr_40hz and snr is not None:
                            label_text = f'γ: {freq:.1f} Hz\nPwr: {power:.2f}\nBW: {bandwidth:.1f}\nSNR: {snr:.1f}'
                        else:
                            label_text = f'γ: {freq:.1f} Hz\nPwr: {power:.2f}\nBW: {bandwidth:.1f} Hz'

                        ax.annotate(
                            label_text,
                            xy=(freq, arrow_y),
                            xytext=(label_x, label_y),
                            ha='center',
                            va='bottom',
                            fontsize=14 if use_resutil_style else 12,
                            color=color,
                            fontweight='semibold',
                            arrowprops=dict(
                                arrowstyle='->',
                                color=color,
                                linewidth=1.2,
                                alpha=0.8,
                                shrinkA=0,
                                shrinkB=5
                            )
                        )
                    else:
                        # No peak found, show "--"
                        label_x = 40 + x_offset  # Position at 40 Hz
                        label_y_pos = ylim[0] + (y_range * y_fraction)

                        label_text = f'{trace_label}\nγ: --'

                        ax.text(
                            label_x, label_y_pos, label_text,
                            ha='center', va='bottom',
                            fontsize=14 if use_resutil_style else 12,
                            color=color,
                            fontweight='semibold'
                        )

                print(f"✓ Added gamma peak labels for {len(valid_gamma_peaks)} traces")
            elif show_gamma_peaks and not FOOOF_AVAILABLE:
                print("  Warning: FOOOF not available - cannot compute gamma peaks")

        # Configure plot
        # Determine ylabel based on scale
        ylabel = 'PSD [dB]' if use_db_scale else 'Power Spectral Density (V²/Hz)'

        # When resutil styling is enabled, let it control font settings
        if use_resutil_style:
            ax.set_xlabel('Frequency (Hz)')
            ax.set_ylabel(ylabel)
            if not hide_title:
                ax.set_title('PSD Comparison')
            # Grid is already set by resutil style
            ax.legend(loc='best')
        else:
            ax.set_xlabel('Frequency (Hz)', fontsize=12, fontweight='bold')
            ax.set_ylabel(ylabel, fontsize=12, fontweight='bold')
            if not hide_title:
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
