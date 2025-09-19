# JsProxy fixes applied - version 2.3 with enhanced debugging for time windows
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend
import matplotlib.pyplot as plt
import json
import base64
from io import BytesIO
import warnings
warnings.filterwarnings('ignore')


class StimulationPeriod:
    def __init__(self, start, duration, label=None):
        self.start = start
        self.duration = duration
        self.label = label
        self.raw_segment = None
        self.analysis_results = {}

class Experiment:
    def __init__(self, name, edf_file=None):
        self.name = name
        self.edf_file = edf_file
        self.stimulation_periods = []

class Session:
    def __init__(self, subject_id, date):
        self.subject_id = subject_id
        self.date = date
        self.experiments = []

def parse_csv_annotations(csv_content):
    """Parse CSV content and return DataFrame"""
    try:
        # Handle different CSV formats
        lines = csv_content.strip().split('\n')
        if not lines:
            raise Exception("CSV file is empty")

        print(f"[CSV] PARSING CSV ANNOTATIONS:")
        print(f"   CSV content type: {type(csv_content)}")
        print(f"   CSV content length: {len(csv_content)} characters")
        print(f"   First 200 chars of raw CSV: '{csv_content[:200]}'")
        print(f"   Total lines: {len(lines)}")

        if len(lines) > 0:
            print(f"   First line (header): '{lines[0]}'")
            print(f"   Header length: {len(lines[0])} chars")

        # DEBUG: Show first few raw lines to understand the data structure
        print(f"   [DEBUG] First 5 raw CSV lines:")
        for i, line in enumerate(lines[:5]):
            print(f"     Line {i}: '{line}' (length: {len(line)} chars)")

        # Try different delimiter approaches
        potential_delimiters = [',', ';', '\t']
        best_delimiter = ','
        max_columns = 0

        for delimiter in potential_delimiters:
            test_cols = len(lines[0].split(delimiter))
            if test_cols > max_columns:
                max_columns = test_cols
                best_delimiter = delimiter

        print(f"   Using delimiter: '{best_delimiter}' ({max_columns} columns)")

        header = [col.strip().strip('"\'') for col in lines[0].split(best_delimiter)]
        print(f"   Headers: {header}")

        data = []
        for i, line in enumerate(lines[1:], 1):
            if line.strip():
                row = [col.strip().strip('"\'') for col in line.split(best_delimiter)]
                if len(row) == len(header):
                    data.append(row)
                    if i <= 3:  # Show first few data rows
                        print(f"   Row {i}: {row}")
                else:
                    print(f"   Warning: Row {i} has {len(row)} columns, expected {len(header)}: {row}")

        if not data:
            raise Exception("No valid data rows found in CSV")

        print(f"   Total valid data rows: {len(data)}")

        df = pd.DataFrame(data, columns=header)

        # Convert numeric columns with enhanced debugging and validation
        numeric_cols = ['start_time', 'duration']
        for col in numeric_cols:
            if col in df.columns:
                original_values = df[col].tolist()
                print(f"   [DEBUG] Raw {col} values: {original_values}")

                # Check for any problematic values BEFORE conversion
                for i, val in enumerate(original_values[:5]):
                    print(f"     Row {i}: '{val}' (type: {type(val)})")
                    # Validate that the value looks numeric
                    if isinstance(val, str):
                        val_stripped = val.strip()
                        if not val_stripped or val_stripped.lower() in ['na', 'n/a', 'null', 'none', '']:
                            raise Exception(f"Invalid non-numeric value '{val}' found in {col} at row {i}. CSV contains missing or invalid data.")
                        try:
                            float(val_stripped)
                        except ValueError:
                            raise Exception(f"Cannot convert '{val}' to numeric in {col} at row {i}. Check CSV format and data.")

                # Convert to numeric, but FAIL if any conversion fails
                try:
                    df[col] = pd.to_numeric(df[col], errors='raise')  # Changed from 'coerce' to 'raise'
                except (ValueError, TypeError) as e:
                    raise Exception(f"Failed to convert {col} column to numeric values. Error: {e}. Check that all {col} values in CSV are valid numbers.")

                converted_values = df[col].tolist()

                # Verify no NaN values remain (this should never trigger with errors='raise')
                nan_count = df[col].isna().sum()
                if nan_count > 0:
                    raise Exception(f"After conversion, {nan_count} NaN values found in {col}. This indicates a data parsing error.")

                # Verify all values are positive (for timestamps and durations)
                if col in ['start_time', 'duration']:
                    invalid_values = df[df[col] < 0]
                    if len(invalid_values) > 0:
                        raise Exception(f"Found negative values in {col}: {invalid_values[col].tolist()}. Timestamps and durations must be positive.")

                print(f"   [OK] Successfully converted {col}: {original_values[:3]} -> {converted_values[:3]}")
            else:
                raise Exception(f"Required column '{col}' not found in CSV. Available columns: {list(df.columns)}")

        # Check for required columns with flexible naming
        required_cols = ['experiment', 'start_time', 'duration']

        # Create column mapping for flexible column names
        column_mapping = {}
        available_cols = [col.lower().strip() for col in df.columns]

        # Map experiment column
        for col in df.columns:
            if col.lower().strip() in ['experiment', 'exp', 'condition']:
                column_mapping['experiment'] = col
                break

        # Map start_time column
        for col in df.columns:
            if col.lower().strip() in ['start_time', 'start', 'onset', 'begin', 'time']:
                column_mapping['start_time'] = col
                break

        # Map duration column
        for col in df.columns:
            if col.lower().strip() in ['duration', 'length', 'dur']:
                column_mapping['duration'] = col
                break

        print(f"   Column mapping: {column_mapping}")

        # Check if we found all required columns
        missing_cols = [col for col in required_cols if col not in column_mapping]
        if missing_cols:
            available_cols = list(df.columns)
            print(f"   [ERROR] Could not map columns: {missing_cols}")
            print(f"   Available columns: {available_cols}")
            raise Exception(f"Could not find required columns: {missing_cols}. Available columns: {available_cols}")

        # Rename columns to standard names if needed
        if column_mapping:
            df = df.rename(columns={v: k for k, v in column_mapping.items()})
            print(f"   Renamed columns to standard format: {list(df.columns)}")

        # Debug experiment grouping
        unique_experiments = df['experiment'].unique()
        print(f"   Unique experiments found: {unique_experiments}")
        for exp in unique_experiments:
            exp_rows = df[df['experiment'] == exp]
            print(f"     {exp}: {len(exp_rows)} periods")

        return df
    except Exception as e:
        raise Exception(f"Error parsing CSV: {str(e)}")

def create_session_from_csv(csv_content, subject_id="Unknown", date=None):
    """Create session object from CSV annotations"""
    if date is None:
        import datetime
        date = datetime.datetime.now().strftime("%Y-%m-%d")
    
    session = Session(subject_id, date)
    
    try:
        df = parse_csv_annotations(csv_content)
        print(f"Parsed CSV with {len(df)} rows")
        print(f"CSV columns: {list(df.columns)}")
        print(f"First few rows:")
        for i, row in df.head(3).iterrows():
            print(f"  Row {i}: {dict(row)}")

        # Group by experiment manually (avoid pandas groupby issues)
        experiments = {}
        for index, row in df.iterrows():
            exp_name = str(row['experiment']).strip()
            if exp_name not in experiments:
                experiments[exp_name] = []
            experiments[exp_name].append(row)

        print(f"[SESSION] CREATING SESSION:")
        print(f"   Found {len(experiments)} unique experiments")

        # Create experiment objects
        for exp_name, rows in experiments.items():
            print(f"   Processing experiment: '{exp_name}' with {len(rows)} periods")
            exp = Experiment(exp_name)

            for i, row in enumerate(rows):
                try:
                    # Handle NaN values that might come from CSV parsing
                    start_time_raw = row['start_time']
                    duration_raw = row['duration']

                    print(f"     [ROW DEBUG] Row {i+1} raw values: start_time='{start_time_raw}' ({type(start_time_raw)}), duration='{duration_raw}' ({type(duration_raw)})")

                    # CRITICAL: Check for NaN or invalid values and STOP if they occur
                    if pd.isna(start_time_raw) or start_time_raw == 'N/A' or start_time_raw is None:
                        raise Exception(f"CRITICAL ERROR: Invalid start_time '{start_time_raw}' in row {i+1} for experiment {exp_name}. This means CSV parsing failed to read the actual timestamp values. Check your CSV file format and ensure timestamps are numeric.")

                    if pd.isna(duration_raw) or duration_raw == 'N/A' or duration_raw is None:
                        raise Exception(f"CRITICAL ERROR: Invalid duration '{duration_raw}' in row {i+1} for experiment {exp_name}. This means CSV parsing failed to read the actual duration values. Check your CSV file format and ensure durations are numeric.")

                    # Additional validation for string values that shouldn't be there
                    if isinstance(start_time_raw, str) and start_time_raw.strip().lower() in ['n/a', 'na', 'null', 'none', '']:
                        raise Exception(f"CRITICAL ERROR: start_time contains invalid string '{start_time_raw}' in row {i+1}. Expected a numeric timestamp.")

                    if isinstance(duration_raw, str) and duration_raw.strip().lower() in ['n/a', 'na', 'null', 'none', '']:
                        raise Exception(f"CRITICAL ERROR: duration contains invalid string '{duration_raw}' in row {i+1}. Expected a numeric duration.")

                    # Convert to float with explicit error handling
                    try:
                        start_time = float(start_time_raw)
                    except (ValueError, TypeError) as e:
                        raise Exception(f"Cannot convert start_time '{start_time_raw}' to float in row {i+1}: {e}")

                    try:
                        duration = float(duration_raw)
                    except (ValueError, TypeError) as e:
                        raise Exception(f"Cannot convert duration '{duration_raw}' to float in row {i+1}: {e}")

                    # Validate the converted values make sense
                    if start_time < 0:
                        raise Exception(f"Invalid negative start_time {start_time} in row {i+1}. Timestamps must be positive.")

                    if duration <= 0:
                        raise Exception(f"Invalid non-positive duration {duration} in row {i+1}. Durations must be positive.")

                    print(f"     [VALIDATION OK] Successfully converted: start_time={start_time}s, duration={duration}s")

                    label = str(row.get('label', f'Period_{i+1}')).strip()

                    stim = StimulationPeriod(
                        start=start_time,
                        duration=duration,
                        label=label
                    )

                    # Check for duplicate timestamps immediately after creating each period
                    for existing_period in exp.stimulation_periods:
                        if (abs(existing_period.start - start_time) < 0.001 and
                            abs(existing_period.duration - duration) < 0.001):
                            print(f"     [CSV ERROR] DUPLICATE TIMESTAMP DETECTED in CSV for experiment '{exp_name}'!")
                            print(f"                 Existing period '{existing_period.label}': {existing_period.start}s for {existing_period.duration}s")
                            print(f"                 New period '{label}': {start_time}s for {duration}s")
                            print(f"                 This is likely a problem with the CSV file itself!")
                            print(f"                 Check for duplicate rows or incorrect timestamp values.")

                    exp.stimulation_periods.append(stim)
                    print(f"     Period {i+1}: {label} at {start_time}s for {duration}s")
                except Exception as e:
                    print(f"     Warning: Could not process row {i+1} for experiment {exp_name}: {e}")
                    print(f"     Row data: {dict(row)}")

            if exp.stimulation_periods:  # Only add experiments with valid periods
                session.experiments.append(exp)
            else:
                print(f"   Warning: Skipping experiment '{exp_name}' - no valid periods")

        print(f"   Session created successfully with {len(session.experiments)} experiments")
        return session
        
    except Exception as e:
        print(f"Exception in create_session_from_csv: {str(e)}")
        import traceback
        traceback.print_exc()
        raise Exception(f"Error creating session from CSV: {str(e)}")

def apply_sync_offset(session, sync_offset):
    """Apply synchronization offset to all stimulation periods"""
    for exp in session.experiments:
        for stim in exp.stimulation_periods:
            stim.start += sync_offset
    return session

def read_edf_file_data(js_uint8_array, filename="uploaded.edf"):
    """Read EDF file data from JavaScript Uint8Array"""
    try:
        import tempfile
        import os

        # Convert JavaScript Uint8Array to Python bytes
        print(f"[EDF] PROCESSING EDF FILE: {filename}")
        print(f"   Data type: {type(js_uint8_array)}")
        print(f"   Data length: {len(js_uint8_array)}")

        # Convert to bytes properly
        if hasattr(js_uint8_array, 'tobytes'):
            file_bytes = js_uint8_array.tobytes()
        else:
            # Alternative method for different Pyodide versions
            file_bytes = bytes(js_uint8_array)

        print(f"   Converted to bytes: {len(file_bytes)} bytes")

        # Write bytes to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as temp_file:
            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        # Try pyedflib first
        try:
            import pyedflib
            print("[OK] pyedflib available - reading actual EDF file with pyedflib")

            # Read actual EDF file
            edf_file = pyedflib.EdfReader(temp_file_path)

            # Extract metadata
            n_channels = edf_file.signals_in_file
            channel_names = edf_file.getSignalLabels()
            duration_seconds = edf_file.file_duration
            fs = edf_file.getSampleFrequency(0) if n_channels > 0 else 256

            print(f"[EDF] ACTUAL EDF DATA VALIDATION (pyedflib):")
            print(f"   Duration: {duration_seconds:.1f} seconds")
            print(f"   Sampling Frequency: {fs} Hz")
            print(f"   Channel Names: {channel_names}")
            print(f"   Number of Channels: {n_channels}")

            # Read signal data
            n_samples = int(duration_seconds * fs)
            data = []
            times = np.linspace(0, duration_seconds, n_samples)

            for ch_idx in range(min(n_channels, 32)):  # Limit to 32 channels for memory
                try:
                    signal_data = edf_file.readSignal(ch_idx)
                    # Resample if needed to match expected sample rate
                    if len(signal_data) != n_samples:
                        from scipy import signal as scipy_signal
                        signal_data = scipy_signal.resample(signal_data, n_samples)
                    data.append(signal_data)
                except Exception as e:
                    print(f"Warning: Could not read channel {ch_idx}: {e}")
                    # Fill with zeros if channel can't be read
                    data.append(np.zeros(n_samples))

            edf_file._close()
            os.unlink(temp_file_path)  # Clean up temp file

            return {
                'data': np.array(data),
                'fs': fs,
                'channel_names': channel_names[:len(data)],
                'times': times,
                'duration_seconds': duration_seconds
            }

        except ImportError:
            print("⚠️  pyedflib not available - trying MNE-Python")

            # Try MNE as fallback
            try:
                import mne
                print("✅ MNE-Python available - reading actual EDF file with MNE")

                # Read EDF file with MNE
                raw = mne.io.read_raw_edf(temp_file_path, preload=True, verbose=False)

                # Extract metadata
                fs = raw.info['sfreq']
                n_channels = len(raw.ch_names)
                channel_names = raw.ch_names
                duration_seconds = raw.times[-1]

                print(f"📊 ACTUAL EDF DATA VALIDATION (MNE):")
                print(f"   Duration: {duration_seconds:.1f} seconds")
                print(f"   Sampling Frequency: {fs} Hz")
                print(f"   Channel Names: {channel_names}")
                print(f"   Number of Channels: {n_channels}")

                # Get signal data
                data = raw.get_data()  # Shape: (n_channels, n_samples)
                times = raw.times

                os.unlink(temp_file_path)  # Clean up temp file

                print("== MADE IT HERE")

                return {
                    'data': data,
                    'fs': fs,
                    'channel_names': channel_names,
                    'times': times,
                    'duration_seconds': duration_seconds
                }

            except ImportError:
                print("⚠️  MNE-Python not available either - using simulation")
                os.unlink(temp_file_path)
                # Use file size to estimate duration
                file_size_mb = len(edf_file_bytes) / (1024 * 1024)
                estimated_duration = max(int(file_size_mb * 60), 300)
                return simulate_edf_data(duration_seconds=estimated_duration, n_channels=8, fs=256)

            except Exception as e:
                print(f"Error reading EDF file with MNE: {e}")
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                # Use file size to estimate duration
                file_size_mb = len(edf_file_bytes) / (1024 * 1024)
                estimated_duration = max(int(file_size_mb * 60), 300)
                return simulate_edf_data(duration_seconds=estimated_duration, n_channels=8, fs=256)

        except Exception as e:
            print(f"Error reading EDF file with pyedflib: {e}")
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            # Use file size to estimate duration
            file_size_mb = len(edf_file_bytes) / (1024 * 1024)
            estimated_duration = max(int(file_size_mb * 60), 300)
            return simulate_edf_data(duration_seconds=estimated_duration, n_channels=8, fs=256)

    except Exception as e:
        print(f"Error reading EDF file: {e}")
        return simulate_edf_data(duration_seconds=300, n_channels=8, fs=256)

def simulate_edf_data(duration_seconds=300, n_channels=8, fs=256):
    """Simulate EDF-like data for testing"""
    n_samples = int(duration_seconds * fs)
    t = np.linspace(0, duration_seconds, n_samples)

    # Simulate multichannel data
    data = []
    channel_names = [f'Ch{i+1}' for i in range(n_channels)]

    print(f"[SIM] SIMULATED EDF DATA VALIDATION:")
    print(f"   Duration: {duration_seconds:.1f} seconds")
    print(f"   Sampling Frequency: {fs} Hz")
    print(f"   Channel Names: {channel_names}")
    print(f"   Total Samples: {n_samples}")
    print(f"   Data Shape: ({n_channels}, {n_samples})")

    for i in range(n_channels):
        # Base EEG-like signal
        signal_data = (
            np.random.randn(n_samples) * 0.1 +  # Noise
            np.sin(2 * np.pi * 10 * t) * 0.05 +  # Alpha waves
            np.sin(2 * np.pi * 15 * t) * 0.03    # SSVEP-like response
        )
        data.append(signal_data)

    return {
        'data': np.array(data),
        'fs': fs,
        'channel_names': channel_names,
        'times': t
    }

def extract_stimulation_periods(raw_data, session):
    """Extract stimulation periods from raw EEG data"""
    fs = raw_data.get('fs') if hasattr(raw_data, 'get') else raw_data['fs']
    data = raw_data.get('data') if hasattr(raw_data, 'get') else raw_data['data']
    
    for exp in session.experiments:
        for stim in exp.stimulation_periods:
            start_sample = int(stim.start * fs)
            end_sample = int((stim.start + stim.duration) * fs)
            
            if start_sample >= 0 and end_sample <= data.shape[1]:
                stim.raw_segment = data[:, start_sample:end_sample]
            else:
                print(f"Warning: Stimulation period {stim.label} extends beyond data range")
                stim.raw_segment = None
    
    return session

def calculate_psd_welch(data, fs, nperseg=None):
    """Calculate PSD using Welch method (simplified implementation)"""
    if nperseg is None:
        nperseg = min(2048, data.shape[-1] // 4)
    
    # Simplified Welch method using overlapping windows
    if data.ndim == 1:
        data = data.reshape(1, -1)
    
    n_channels, n_samples = data.shape
    
    # Calculate number of windows
    noverlap = nperseg // 2
    step = nperseg - noverlap
    n_windows = (n_samples - noverlap) // step
    
    freqs = np.fft.rfftfreq(nperseg, 1/fs)
    psd = np.zeros((n_channels, len(freqs)))
    
    for ch in range(n_channels):
        psd_windows = []
        for i in range(n_windows):
            start = i * step
            end = start + nperseg
            if end <= n_samples:
                window = data[ch, start:end]
                # Apply Hanning window
                window = window * np.hanning(nperseg)
                # Calculate FFT
                fft_vals = np.fft.rfft(window)
                psd_window = (np.abs(fft_vals) ** 2) / (fs * nperseg)
                psd_windows.append(psd_window)
        
        if psd_windows:
            psd[ch] = np.mean(psd_windows, axis=0)
    
    return freqs, psd


def calculate_psd_periodogram(data, fs):
    """Calculate PSD using periodogram (FFT)"""
    n_samples = data.shape[-1]
    freqs = np.fft.rfftfreq(n_samples, 1/fs)
    fft_vals = np.fft.rfft(data, axis=-1)
    psd = (np.abs(fft_vals) ** 2) / (fs * n_samples)
    return freqs, psd


def calculate_snr(psd, freqs, target_freq, bandwidth=1.0):
    """Calculate SNR at target frequency"""
    # Find frequency bins around target
    freq_mask = (freqs >= target_freq - bandwidth/2) & (freqs <= target_freq + bandwidth/2)
    signal_power = np.mean(psd[..., freq_mask], axis=-1)

    # Calculate noise power (excluding signal band)
    noise_mask = (freqs >= 1) & (freqs <= 50) & ~freq_mask
    noise_power = np.mean(psd[..., noise_mask], axis=-1)

    snr_db = 10 * np.log10(signal_power / noise_power)
    return snr_db


def calculate_snr_spectrum(psd, freqs, bw=1.0):
    """
    Calculate SNR spectrum across frequencies using surrounding frequency approach

    Args:
        psd: Power spectral density array (n_channels, n_freqs)
        freqs: Frequency array
        bw: Bandwidth in Hz for computing surrounding frequencies (default 1.0 Hz)

    Returns:
        freqs: Original frequency array
        snr_spectrum_db: SNR spectrum in dB (n_channels, n_freqs)
    """
    print(f"        [SNR] Computing SNR spectrum with {bw}Hz bandwidth")
    print(f"        PSD shape: {psd.shape}, Freq range: {freqs.min():.1f}-{freqs.max():.1f} Hz")

    # Initialize SNR spectrum array
    snr_spectrum = np.zeros_like(psd)

    # Calculate frequency resolution
    df = freqs[1] - freqs[0]
    half_bw_bins = int(np.round(bw / df / 2))  # Half bandwidth in frequency bins

    print(f"        Frequency resolution: {df:.3f} Hz, Half bandwidth: {half_bw_bins} bins")

    # Compute SNR for each frequency bin
    for freq_idx in range(len(freqs)):
        # Define neighboring frequency indices (excluding the center frequency)
        neigh_start = max(0, freq_idx - half_bw_bins)
        neigh_end = min(len(freqs), freq_idx + half_bw_bins + 1)
        neigh_idx = np.arange(neigh_start, neigh_end)
        neigh_idx = neigh_idx[neigh_idx != freq_idx]  # Exclude center frequency

        if len(neigh_idx) > 0:
            # For each channel, compute SNR as signal/mean(neighbors)
            for ch_idx in range(psd.shape[0]):
                signal_power = psd[ch_idx, freq_idx]
                neighbor_power_mean = np.mean(psd[ch_idx, neigh_idx]) + 1e-16  # Add small epsilon
                snr_spectrum[ch_idx, freq_idx] = signal_power / neighbor_power_mean
        else:
            # If no neighbors available, set to NaN
            snr_spectrum[:, freq_idx] = np.nan

    # Convert to dB
    snr_spectrum_db = 10 * np.log10(np.maximum(snr_spectrum, 1e-16))

    # Replace NaN values with 0 for plotting
    snr_spectrum_db = np.nan_to_num(snr_spectrum_db, nan=0.0)

    print(f"        [OK] SNR spectrum computed - range: {np.nanmin(snr_spectrum_db):.1f} to {np.nanmax(snr_spectrum_db):.1f} dB")

    return freqs, snr_spectrum_db

def analyze_experiment(experiment, fs=256, target_frequencies=[40], psd_method='welch', selected_channels=None):
    """Analyze a single experiment"""
    if not experiment.stimulation_periods:
        print(f"        [ERROR] No stimulation periods found for experiment")
        return None

    # Filter out periods without data
    valid_periods = [p for p in experiment.stimulation_periods if hasattr(p, 'raw_segment') and p.raw_segment is not None]

    if not valid_periods:
        print(f"        [ERROR] No valid periods with raw_segment data found")
        return None

    # Safety checks for parameters
    if target_frequencies is None:
        target_frequencies = [40]
    if selected_channels is None:
        selected_channels = []
    if psd_method is None:
        psd_method = 'welch'

    exp_name = getattr(experiment, 'name', 'Unknown')
    print(f"     [ANALYZE] ANALYZING EXPERIMENT: {exp_name}")
    print(f"        [INFO] Total stimulation periods: {len(experiment.stimulation_periods)}")
    print(f"        [INFO] Valid periods with data: {len(valid_periods)}")

    # DEBUG: Show experiment context - is this using the same data as previous experiments?
    exp_file_pair_id = getattr(experiment, 'file_pair_id', 'Unknown')
    print(f"        [CONTEXT] Experiment {exp_name} belongs to file_pair_id: {exp_file_pair_id}")
    print(f"        [CONTEXT] This experiment should have UNIQUE data extracted from this specific EDF file")

    # Detailed debug info for each period
    for i, period in enumerate(experiment.stimulation_periods):
        period_label = getattr(period, 'label', 'Unknown')
        period_start = getattr(period, 'start', 'Unknown')
        period_duration = getattr(period, 'duration', 'Unknown')
        has_raw_segment = hasattr(period, 'raw_segment') and period.raw_segment is not None
        segment_shape = period.raw_segment.shape if has_raw_segment else 'N/A'
        segment_stats = f"min={np.min(period.raw_segment):.3f}, max={np.max(period.raw_segment):.3f}, mean={np.mean(period.raw_segment):.3f}" if has_raw_segment else 'N/A'

        print(f"        [PERIOD] Period {i+1}: {period_label}")
        print(f"            Time: {period_start}s - {period_start + period_duration if isinstance(period_start, (int, float)) and isinstance(period_duration, (int, float)) else 'Unknown'}s")
        print(f"            Has data: {has_raw_segment}")
        print(f"            Shape: {segment_shape}")
        print(f"            Stats: {segment_stats}")

    print(f"        Analysis parameters:")
    print(f"          PSD Method: {psd_method}")
    print(f"          Selected Channels: {selected_channels}")
    print(f"          Target Frequencies: {target_frequencies}")

    # Get channel names - prioritize actual channel names over generated ones
    all_channel_names = None

    # First try to get real channel names from global current_raw_data
    try:
        from __main__ import current_raw_data
        # Try to convert JsProxy to Python object if needed
        if hasattr(current_raw_data, 'to_py'):
            current_raw_data_py = current_raw_data.to_py()
        else:
            current_raw_data_py = current_raw_data

        # Handle multi-file scenario - look for channel names in file pairs
        if hasattr(current_raw_data_py, 'get') and 'file_pairs' in current_raw_data_py:
            file_pairs = current_raw_data_py.get('file_pairs', [])
            if file_pairs and len(file_pairs) > 0:
                # Get channel names from the first file pair
                first_pair = file_pairs[0]
                if hasattr(first_pair, 'get'):
                    pair_raw_data = first_pair.get('raw_data')
                    if pair_raw_data and hasattr(pair_raw_data, 'get'):
                        all_channel_names = pair_raw_data.get('channel_names')
                        print(f"        [CHANNELS] Using channel names from file pair: {all_channel_names}")
                elif 'raw_data' in first_pair and 'channel_names' in first_pair['raw_data']:
                    all_channel_names = first_pair['raw_data']['channel_names']
                    print(f"        [CHANNELS] Using channel names from file pair: {all_channel_names}")

        # Fallback to global channel names
        if all_channel_names is None:
            if hasattr(current_raw_data_py, 'get') and 'channel_names' in current_raw_data_py:
                all_channel_names = current_raw_data_py.get('channel_names')
            elif 'channel_names' in current_raw_data_py:
                all_channel_names = current_raw_data_py['channel_names']
            elif hasattr(current_raw_data_py, 'channel_names'):
                all_channel_names = current_raw_data_py.channel_names

            if all_channel_names:
                print(f"        [CHANNELS] Using channel names from global data: {all_channel_names}")

    except Exception as e:
        print(f"        [WARN] Could not get channel names from global data: {e}")

    # Final fallback: generate channel names from experiment data shape
    if all_channel_names is None and valid_periods and hasattr(valid_periods[0], 'raw_segment'):
        n_channels = valid_periods[0].raw_segment.shape[0]
        all_channel_names = [f'Ch{i+1}' for i in range(n_channels)]
        print(f"        [FALLBACK] Generated channel names from experiment data: {all_channel_names}")

    # Ultimate fallback
    if all_channel_names is None:
        all_channel_names = [f'Ch{i+1}' for i in range(8)]
        print(f"        [DEFAULT] Using default channel names: {all_channel_names}")

    if all_channel_names is None:
        print(f"        [ERROR] Could not determine channel names!")
        return None

    # Create channel index mapping with detailed debugging
    if selected_channels is None or len(selected_channels) == 0:
        channel_indices = list(range(len(all_channel_names)))
        print(f"        [MAPPING] Using all {len(channel_indices)} channels")
    else:
        channel_indices = []
        print(f"        [MAPPING] Attempting to map selected channels:")
        print(f"        [MAPPING]   Selected: {selected_channels}")
        print(f"        [MAPPING]   Available: {all_channel_names}")

        for ch_name in selected_channels:
            if ch_name in all_channel_names:
                idx = all_channel_names.index(ch_name)
                channel_indices.append(idx)
                print(f"        [MAPPING]   [OK] '{ch_name}' -> index {idx}")
            else:
                print(f"        [MAPPING]   [MISS] '{ch_name}' not found in available channels")

        print(f"        [MAPPING] Final mapping: {len(channel_indices)} channels selected")
        if channel_indices:
            selected_names = [all_channel_names[i] for i in channel_indices]
            print(f"        [MAPPING] Selected channel names: {selected_names}")

    if not channel_indices:
        print(f"        [ERROR] No valid channels selected!")
        print(f"        [ERROR] This usually means the selected channel names don't match the available channel names")
        print(f"        [ERROR] Selected: {selected_channels}")
        print(f"        [ERROR] Available: {all_channel_names}")
        print(f"        [SUGGESTION] Check if channel names in frontend match EDF file channel names")
        return None

    all_psds_welch = []
    all_psds_period = []

    # Ensure target_frequencies is valid before creating dictionary
    if not target_frequencies or len(target_frequencies) == 0:
        print(f"        [ERROR] Invalid target_frequencies: {target_frequencies}")
        return None

    all_snrs = {}
    for freq in target_frequencies:
        if freq is not None:
            all_snrs[freq] = []
        else:
            print(f"        [ERROR] Found None frequency in target_frequencies: {target_frequencies}")
            return None

    all_snr_spectrums = []  # Store SNR spectrums for each period

    print(f"        [READY] Ready to analyze {len(valid_periods)} periods for frequencies: {list(all_snrs.keys())}")

    # Create a dictionary to track data fingerprints across periods
    period_fingerprints = {}

    for period_idx, stim in enumerate(valid_periods):
        period_label = getattr(stim, 'label', f'Period_{period_idx+1}')
        print(f"        [PROCESS] Processing period {period_idx + 1}/{len(valid_periods)}: {period_label}")
        print(f"           Raw segment shape: {stim.raw_segment.shape}")
        print(f"           Raw segment range: {np.min(stim.raw_segment):.3f} to {np.max(stim.raw_segment):.3f}")

        # Validate that this data segment is unique
        segment_fingerprint = np.sum(stim.raw_segment) + np.mean(stim.raw_segment) * 1000
        first_10_samples = stim.raw_segment[0, :min(10, stim.raw_segment.shape[1])]
        print(f"           [UNIQUENESS CHECK] Data fingerprint: {segment_fingerprint:.6f}")
        print(f"           [UNIQUENESS CHECK] First 10 samples of channel 0: {first_10_samples}")

        # Check if this fingerprint matches any previous period (indicating data reuse)
        period_fingerprints[period_label] = segment_fingerprint
        for prev_label, prev_fingerprint in period_fingerprints.items():
            if prev_label != period_label and abs(prev_fingerprint - segment_fingerprint) < 0.001:
                print(f"           [WARNING] Data fingerprint matches period '{prev_label}' - possible data reuse!")
                print(f"           [WARNING] Current: {segment_fingerprint:.6f}, Previous: {prev_fingerprint:.6f}")

        # Additional check for exact data duplication
        for prev_period_idx in range(period_idx):
            if prev_period_idx < len(valid_periods):
                prev_stim = valid_periods[prev_period_idx]
                if hasattr(prev_stim, 'raw_segment') and prev_stim.raw_segment is not None:
                    if np.array_equal(stim.raw_segment, prev_stim.raw_segment):
                        prev_label = getattr(prev_stim, 'label', f'Period_{prev_period_idx+1}')
                        print(f"           [ERROR] EXACT DATA DUPLICATION detected with period '{prev_label}'!")
                        print(f"           [ERROR] This indicates the same data segment is being used for different periods!")

        # Filter data to selected channels
        filtered_data = stim.raw_segment[channel_indices, :]
        print(f"           Data shape after channel filtering: {filtered_data.shape}")

        # Additional validation that filtered data is also unique
        filtered_fingerprint = np.sum(filtered_data) + np.mean(filtered_data) * 1000
        print(f"           [FILTERED CHECK] Filtered data fingerprint: {filtered_fingerprint:.6f}")

        # Verify we have actual varying data
        channel_means = np.mean(filtered_data, axis=1)
        channel_stds = np.std(filtered_data, axis=1)
        print(f"           Channel stats - means: {channel_means[:min(4, len(channel_means))]}")
        print(f"           Channel stats - stds: {channel_stds[:min(4, len(channel_stds))]}")

        # Calculate PSD using selected method
        if psd_method == 'welch':
            freqs_main, psd_main = calculate_psd_welch(filtered_data, fs)
        else:  # periodogram
            freqs_main, psd_main = calculate_psd_periodogram(filtered_data, fs)

        # Also calculate both for comparison in results
        freqs_welch, psd_welch = calculate_psd_welch(filtered_data, fs)
        freqs_period, psd_period = calculate_psd_periodogram(filtered_data, fs)

        all_psds_welch.append(psd_welch)
        all_psds_period.append(psd_period)

        # Calculate SNR spectrum for this period
        snr_freqs, snr_spectrum = calculate_snr_spectrum(psd_main, freqs_main, bw=1.0)
        all_snr_spectrums.append(snr_spectrum)

        # Calculate SNR for each target frequency using the selected method
        for target_freq in target_frequencies:
            if target_freq in all_snrs:
                snr = calculate_snr(psd_main, freqs_main, target_freq)
                all_snrs[target_freq].append(snr)
                print(f"           SNR at {target_freq}Hz: {np.mean(snr):.2f} dB (avg across channels)")
            else:
                print(f"        [ERROR] target_freq {target_freq} not found in all_snrs keys: {list(all_snrs.keys())}")
                return None

    if not all_psds_welch:
        print(f"        [ERROR] No PSD data computed!")
        return None
    
    # Aggregate results
    mean_psd_welch = np.mean(all_psds_welch, axis=0)
    mean_psd_period = np.mean(all_psds_period, axis=0)

    mean_snrs = {}
    for freq in target_frequencies:
        if all_snrs[freq]:
            mean_snrs[freq] = np.mean(all_snrs[freq], axis=0)

    # Aggregate SNR spectrum across periods
    mean_snr_spectrum = None
    if all_snr_spectrums:
        mean_snr_spectrum = np.mean(all_snr_spectrums, axis=0)

    # Get selected channel names for results
    selected_channel_names = [all_channel_names[i] for i in channel_indices]

    # Precompute 40Hz SNR values for summary plots
    snr_40hz_values = None
    snr_40hz_frequencies = None
    if mean_snr_spectrum is not None and snr_freqs is not None:
        # Find SNR peak around 40Hz using the same method as in visualization
        around40_mask = (snr_freqs >= 39.9) & (snr_freqs <= 40.1)
        around40_mean_snr_spectrum = np.copy(mean_snr_spectrum)
        around40_mean_snr_spectrum[:, ~around40_mask] = -1000
        around40_maxSNR_idxs = np.argmax(around40_mean_snr_spectrum, axis=1)

        snr_40hz_frequencies = np.array([snr_freqs[max_freq_idx_chi] for max_freq_idx_chi in around40_maxSNR_idxs])
        snr_40hz_values = np.array([mean_snr_spectrum[chi, max_freq_idx_chi] for chi, max_freq_idx_chi in enumerate(around40_maxSNR_idxs)])

        print(f"        [SNR40] Precomputed 40Hz SNR: {len(snr_40hz_values)} channels, range {snr_40hz_values.min():.2f}-{snr_40hz_values.max():.2f} dB")

    print(f"        [DONE] Analysis completed - {len(selected_channel_names)} channels analyzed")

    return {
        'experiment_name': experiment.name,
        'stimulation_periods': len(valid_periods),
        'freqs_welch': freqs_welch,
        'mean_psd_welch': mean_psd_welch,
        'freqs_period': freqs_period,
        'mean_psd_period': mean_psd_period,
        'mean_snrs': mean_snrs,
        'target_frequencies': target_frequencies,
        'selected_channels': selected_channel_names,
        'snr_spectrum_freqs': snr_freqs if all_snr_spectrums else None,
        'mean_snr_spectrum': mean_snr_spectrum,
        'psd_method_used': psd_method,
        'snr_40hz_values': snr_40hz_values,
        'snr_40hz_frequencies': snr_40hz_frequencies,
        "SSVEP_detected_matrix": None #ssvep_detected_matrix ## HERE
    }

def create_ssvep_visualization(results, plot_types=None, summary_plots=None, max_freq=45): # MAX FREQ FOR PLOTS
    """Create comprehensive SSVEP analysis visualization"""
    if not results:
        return None

    # Default plot types if none provided
    if plot_types is None:
        plot_types = {'psd': True, 'snr': True, 'snrSpectrum': False, 'timeSeries': False, 'topography': False}

    # Default summary plots if none provided
    if summary_plots is None:
        summary_plots = {'channelSnrHeatmap': False, 'frequencyResponse': False, 'channelComparison': False,
                        'snrDistribution': False, 'experimentOverview': False}

    print(f"📈 CREATING SSVEP VISUALIZATION:")
    print(f"   Number of experiments: {len(results)}")
    for i, result in enumerate(results):
        exp_name = result.get('experiment_name') if hasattr(result, 'get') else result['experiment_name']
        periods = result.get('stimulation_periods') if hasattr(result, 'get') else result['stimulation_periods']
        print(f"   Experiment {i+1}: {exp_name} - {periods} periods")

    # Count number of plot types selected
    selected_plots = [k for k, v in plot_types.items() if v]
    selected_summary_plots = [k for k, v in summary_plots.items() if v]
    n_plot_types = len(selected_plots)
    n_experiments = len(results)

    print(f"   Plot types selected: {selected_plots}")
    print(f"   Summary plots selected: {selected_summary_plots}")
    print(f"   Creating {n_plot_types} x {n_experiments} subplot grid for experiments")

    if n_plot_types == 0:
        print("   No plot types selected!")
        return None

    # Create subplot grid: n_plot_types rows, n_experiments columns
    fig, axes = plt.subplots(n_plot_types, n_experiments, figsize=(6*n_experiments, 4*n_plot_types))

    # Ensure axes is always 2D array
    if n_plot_types == 1 and n_experiments == 1:
        axes = np.array([[axes]])
    elif n_plot_types == 1:
        axes = axes.reshape(1, -1)
    elif n_experiments == 1:
        axes = axes.reshape(-1, 1)

    for exp_idx, result in enumerate(results):
        exp_name = result.get('experiment_name') if hasattr(result, 'get') else result['experiment_name']

        # Get frequency and PSD data based on method used
        psd_method_used = result.get('psd_method_used') if hasattr(result, 'get') else result['psd_method_used']
        if psd_method_used == "welch":
            freqs_welch = result.get('freqs_welch') if hasattr(result, 'get') else result['freqs_welch']
            mean_psd_welch = result.get('mean_psd_welch') if hasattr(result, 'get') else result['mean_psd_welch']
        elif psd_method_used == "periodogram":
            freqs_welch = result.get('freqs_period') if hasattr(result, 'get') else result['freqs_period']
            mean_psd_welch = result.get('mean_psd_period') if hasattr(result, 'get') else result['mean_psd_period']

        mean_snrs = result.get('mean_snrs') if hasattr(result, 'get') else result['mean_snrs']
        selected_channels = result.get('selected_channels', [f'Ch{i+1}' for i in range(mean_psd_welch.shape[0])])

        # Get SNR spectrum data for more accurate 40Hz SNR values
        snr_spectrum_freqs = result.get('snr_spectrum_freqs')
        mean_snr_spectrum = result.get('mean_snr_spectrum')

        print(f"   📊 Plotting Experiment {exp_idx+1}: {exp_name}")
        print(f"      PSD data shape: {mean_psd_welch.shape}")
        print(f"      Frequency range: {freqs_welch.min():.1f} - {freqs_welch.max():.1f} Hz")
        print(f"      Selected channels: {selected_channels}")

        # Find 40Hz SNR from the spectrum data (more accurate)
        if snr_spectrum_freqs is not None and mean_snr_spectrum is not None:
            # Find the frequency bin closest to 40 Hz
            freq_40hz_idx = np.argmin(np.abs(snr_spectrum_freqs - 40))
            actual_freq = snr_spectrum_freqs[freq_40hz_idx]
            snr_40hz_values = mean_snr_spectrum[:, freq_40hz_idx]  # All channels at 40Hz
            print(f"      40Hz SNR values (at {actual_freq:.1f}Hz): {[f'{snr:.2f}' for snr in snr_40hz_values[:min(8, len(snr_40hz_values))]]}")
        
            # FIND SNR PEAK AROUND 40Hz
            # freq_39hz_idx = np.argmin(np.abs(snr_spectrum_freqs - 39))
            # freq_41hz_idx = np.argmin(np.abs(snr_spectrum_freqs - 41))
            # freq_mask = (snr_spectrum_freqs >= 39) & (snr_spectrum_freqs <= 41)
            

        elif mean_snrs and 40 in mean_snrs:
            # Fallback to old method if spectrum not available
            print(f"      40Hz SNR values (target-based): {[f'{snr:.2f}' for snr in mean_snrs[40][:min(8, len(mean_snrs[40]))]]}")

        plot_row = 0  # Current row in the subplot grid

        # Plot 1: Mean PSD across all channels (if selected)
        if plot_types.get('psd', False):
            ax = axes[plot_row, exp_idx]

            for ch_idx in range(min(len(selected_channels), mean_psd_welch.shape[0])):
                freq_mask = (freqs_welch >= 0) & (freqs_welch <= 60)  # Limit to 0-60 Hz
                ax.semilogy(freqs_welch[freq_mask], mean_psd_welch[ch_idx, freq_mask],
                           alpha=0.7, label=selected_channels[ch_idx])

            ax.set_xlabel('Frequency (Hz)')
            ax.set_ylabel('Power Spectral Density')
            method_name = (result.get('psd_method_used') if hasattr(result, 'get') else result['psd_method_used']).capitalize()
            ax.set_title(f'{exp_name}: Mean PSD ({method_name})')
            ax.set_xlim(0, max_freq) # was 60
            ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
            ax.grid(True, alpha=0.3)

            # Highlight 40Hz target frequency
            # ax.axvline(40, color='red', alpha=0.2, linestyle='--', linewidth=2) #alpha0.8

            plot_row += 1

        # Plot 2: SNR at target frequencies (if selected)
        if plot_types.get('snr', False):
            ax = axes[plot_row, exp_idx]

            # Use spectrum data for accurate 40Hz SNR (same approach as print statement)
            if snr_spectrum_freqs is not None and mean_snr_spectrum is not None:
                # Find the frequency bin closest to 40 Hz
                freq_40hz_idx = np.argmin(np.abs(snr_spectrum_freqs - 40))
                actual_freq = snr_spectrum_freqs[freq_40hz_idx]
                snr_40hz_values = mean_snr_spectrum[:, freq_40hz_idx]  # All channels at 40Hz

                # FIND SNR PEAK AROUND 40Hz
                mean_mean_snr_spectrum = np.mean(mean_snr_spectrum, axis=0)
                around40_mask = (snr_spectrum_freqs >= 39.9) & (snr_spectrum_freqs <= 40.1) #39-41
                print("[TEST1]:", mean_snr_spectrum.shape, "->", mean_mean_snr_spectrum.shape, around40_mask.shape)
                around40_mean_snr_spectrum = np.copy(mean_snr_spectrum)
                around40_mean_snr_spectrum[:, ~around40_mask] = -1000
                # around40_maxSNR_idxs = np.argmax(around40_mean_snr_spectrum, axis=0) #chose one of these
                # print("[TEST2]", around40_mask.shape, around40_maxSNR_idxs)
                around40_maxSNR_idxs = np.argmax(around40_mean_snr_spectrum, axis=1) #chose one of these
                print("[TEST3]", around40_mask.shape, around40_maxSNR_idxs)
                max_snr_freqs  = np.array([snr_spectrum_freqs[max_freq_idx_chi] for max_freq_idx_chi in around40_maxSNR_idxs])
                max_snr_values = np.array([mean_snr_spectrum[chi, max_freq_idx_chi] for chi,max_freq_idx_chi in enumerate(around40_maxSNR_idxs)])
                print("[TEST4]", max_snr_freqs, max_snr_values)

                n_channels_to_plot = min(len(selected_channels), len(max_snr_values))
                channel_names = selected_channels[:n_channels_to_plot]
                snr_values = max_snr_values[:n_channels_to_plot]
                snr_frequencies = max_snr_freqs[:n_channels_to_plot]

                print(f"      Plot 2 using max SNR values: {[f'{snr:.2f}@{freq:.2f}Hz' for snr, freq in zip(snr_values[:4], snr_frequencies[:4])]}")

                bars = ax.bar(channel_names, snr_values, alpha=0.7, color='steelblue')

                # Color bars based on SNR threshold
                for bar, snr in zip(bars, snr_values):
                    if snr > 10:  # Good SNR
                        bar.set_color('green')
                    elif snr > 7.5:  # Positive SNR
                        bar.set_color('orange')
                    else:  # Negative SNR
                        bar.set_color('red')

                # Add frequency annotations above each bar
                for i, (bar, freq) in enumerate(zip(bars, snr_frequencies)):
                    height = bar.get_height()
                    ax.annotate(f'{freq:.2f}Hz',
                               xy=(bar.get_x() + bar.get_width() / 2, height),
                               xytext=(0, 3),  # 3 points vertical offset
                               textcoords="offset points",
                               ha='center', va='bottom',
                               fontsize=8, color='black',
                               bbox=dict(boxstyle='round,pad=0.2', facecolor='white', alpha=0.7))

                ax.set_title(f'{exp_name}: Peak SNR around 40 Hz')

            elif mean_snrs and 40 in mean_snrs:
                # Fallback to old method if spectrum not available
                n_channels_to_plot = min(len(selected_channels), len(mean_snrs[40]))
                channel_names = selected_channels[:n_channels_to_plot]
                snr_values = [mean_snrs[40][ch_idx] for ch_idx in range(n_channels_to_plot)]

                print(f"      Plot 2 using fallback method: {[f'{snr:.2f}' for snr in snr_values[:4]]}")

                bars = ax.bar(channel_names, snr_values, alpha=0.7, color='steelblue')

                # Color bars based on SNR threshold
                for bar, snr in zip(bars, snr_values):
                    if snr > 3:  # Good SNR
                        bar.set_color('green')
                    elif snr > 0:  # Positive SNR
                        bar.set_color('orange')
                    else:  # Negative SNR
                        bar.set_color('red')

                ax.set_title(f'{exp_name}: SNR at 40 Hz (target-based)')
            else:
                # No SNR data available
                ax.text(0.5, 0.5, 'SNR Data\nNot Available',
                       transform=ax.transAxes, ha='center', va='center',
                       fontsize=12, color='gray')
                ax.set_title(f'{exp_name}: SNR at 40 Hz (N/A)')

            ax.set_xlabel('Channel')
            ax.set_ylabel('SNR (dB)')
            ax.grid(True, alpha=0.3)
            ax.axhline(0, color='black', alpha=0.5, linestyle='-')
            ax.set_ylim(-5, max(15, max(snr_values)*1.15))  # Set reasonable y-axis limits (-5 to 15)

            plot_row += 1

        # Plot 3: SNR Spectrum (if selected)
        if plot_types.get('snrSpectrum', False):
            ax = axes[plot_row, exp_idx]

            # snr_spectrum_freqs = result.get('snr_spectrum_freqs')
            # mean_snr_spectrum = result.get('mean_snr_spectrum')
            snr_spectrum_freqs = result.get('snr_spectrum_freqs') if hasattr(result, 'get') else result['snr_spectrum_freqs']
            mean_snr_spectrum = result.get('mean_snr_spectrum') if hasattr(result, 'get') else result['mean_snr_spectrum']

            if snr_spectrum_freqs is not None and mean_snr_spectrum is not None:
                print(f"      Plotting SNR spectrum: {mean_snr_spectrum.shape}")

                # Plot SNR spectrum for each selected channel
                for ch_idx in range(min(len(selected_channels), mean_snr_spectrum.shape[0])):
                    ax.plot(snr_spectrum_freqs, mean_snr_spectrum[ch_idx, :],
                           alpha=0.7, label=selected_channels[ch_idx])

                ax.set_xlabel('Frequency (Hz)')
                ax.set_ylabel('SNR (dB)')
                ax.set_title(f'{exp_name}: SNR Spectrum')
                ax.set_xlim(1, max_freq) # was 50
                ax.axhline(0, color='black', alpha=0.5, linestyle='-')
                ax.axhline(10, color='green', alpha=0.5, linestyle='--', label="10dB")
                ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
                ax.grid(True, alpha=0.3)

                # Highlight 40Hz target frequency
                # ax.axvline(40, color='red', alpha=0.2, linestyle='--', linewidth=2) #alpha0.8
            else:
                ax.text(0.5, 0.5, 'SNR Spectrum\nNot Available',
                       transform=ax.transAxes, ha='center', va='center',
                       fontsize=12, color='gray')
                ax.set_title(f'{exp_name}: SNR Spectrum (N/A)')

            plot_row += 1

        # Plot 4: Time Series (if selected) - Placeholder
        if plot_types.get('timeSeries', False):
            ax = axes[plot_row, exp_idx]
            ax.text(0.5, 0.5, 'Time Series\nPlot\n(Not Implemented)',
                   transform=ax.transAxes, ha='center', va='center',
                   fontsize=12, color='gray')
            ax.set_title(f'{exp_name}: Time Series')
            plot_row += 1

        # Plot 5: Topography (if selected) - Placeholder
        if plot_types.get('topography', False):
            ax = axes[plot_row, exp_idx]
            ax.text(0.5, 0.5, 'Topographical\nMap\n(Not Implemented)',
                   transform=ax.transAxes, ha='center', va='center',
                   fontsize=12, color='gray')
            ax.set_title(f'{exp_name}: Topography')
            plot_row += 1
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    # Create summary plots if requested
    summary_plot_base64 = None
    if len(selected_summary_plots) > 0:
        summary_plot_base64 = create_summary_plots(results, summary_plots, max_freq)

    # Create summary
    total_periods = sum((r.get('stimulation_periods') if hasattr(r, 'get') else r['stimulation_periods']) for r in results)
    all_snrs = []
    for result in results:
        mean_snrs = result.get('mean_snrs') if hasattr(result, 'get') else result['mean_snrs']
        for freq_snrs in mean_snrs.values():
            all_snrs.extend(freq_snrs.flatten())

    avg_snr = np.mean(all_snrs) if all_snrs else 0

    return {
        'plot_base64': plot_base64,
        'summary_plot_base64': summary_plot_base64,
        'summary': {
            'total_experiments': n_experiments,
            'total_periods': total_periods,
            'avg_snr': float(avg_snr),
            'analysis_duration': f"{n_experiments} experiments analyzed"
        }
    }

def create_summary_plots(results, summary_plots, max_freq=45, snr_threshold=10):
    """Create summary plots across all experiments"""
    print(f"📊 CREATING SUMMARY PLOTS:")

    # Count selected summary plots
    selected_summary_plots = [k for k, v in summary_plots.items() if v]
    n_summary_plots = len(selected_summary_plots)

    if n_summary_plots == 0:
        return None

    print(f"   Creating {n_summary_plots} summary plots")

    # Create subplot grid for summary plots
    if n_summary_plots == 1:
        fig, axes = plt.subplots(1, 1, figsize=(10, 8))
        axes = [axes]  # Make it iterable
    elif n_summary_plots == 2:
        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    elif n_summary_plots <= 4:
        fig, axes = plt.subplots(2, 2, figsize=(16, 12))
        axes = axes.flatten()
    else:
        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        axes = axes.flatten()

    plot_idx = 0

    # Channel SNR Heatmap (the main implemented one)
    if summary_plots.get('channelSnrHeatmap', False):
        ax = axes[plot_idx]
        create_channel_snr_heatmap(ax, results, snr_threshold)
        plot_idx += 1

    # Placeholder plots for other summary options
    if summary_plots.get('frequencyResponse', False):
        ax = axes[plot_idx]
        ax.text(0.5, 0.5, 'Frequency Response\nSummary Plot\n(Placeholder)',
                transform=ax.transAxes, ha='center', va='center',
                fontsize=14, color='gray', bbox=dict(boxstyle='round', facecolor='lightgray'))
        ax.set_title('Overall Frequency Response')
        ax.set_xlabel('Frequency (Hz)')
        ax.set_ylabel('Average Response')
        plot_idx += 1

    if summary_plots.get('channelComparison', False):
        ax = axes[plot_idx]
        ax.text(0.5, 0.5, 'Channel Comparison\nSummary Plot\n(Placeholder)',
                transform=ax.transAxes, ha='center', va='center',
                fontsize=14, color='gray', bbox=dict(boxstyle='round', facecolor='lightgray'))
        ax.set_title('Channel Performance Comparison')
        ax.set_xlabel('Channels')
        ax.set_ylabel('Performance Metric')
        plot_idx += 1

    if summary_plots.get('snrDistribution', False):
        ax = axes[plot_idx]
        ax.text(0.5, 0.5, 'SNR Distribution\nSummary Plot\n(Placeholder)',
                transform=ax.transAxes, ha='center', va='center',
                fontsize=14, color='gray', bbox=dict(boxstyle='round', facecolor='lightgray'))
        ax.set_title('SNR Distribution Analysis')
        ax.set_xlabel('SNR (dB)')
        ax.set_ylabel('Frequency')
        plot_idx += 1

    if summary_plots.get('experimentOverview', False):
        ax = axes[plot_idx]
        ax.text(0.5, 0.5, 'Experiment Overview\nSummary Plot\n(Placeholder)',
                transform=ax.transAxes, ha='center', va='center',
                fontsize=14, color='gray', bbox=dict(boxstyle='round', facecolor='lightgray'))
        ax.set_title('Experiment Overview')
        ax.set_xlabel('Experiments')
        ax.set_ylabel('Overall Performance')
        plot_idx += 1

    # Hide unused subplots
    for i in range(plot_idx, len(axes)):
        axes[i].set_visible(False)

    plt.suptitle('SSVEP Analysis Summary', fontsize=16, fontweight='bold')
    plt.tight_layout()

    # Convert to base64
    buffer = BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
    buffer.seek(0)
    summary_plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()

    print(f"   ✅ Summary plots created successfully")
    return summary_plot_base64

def create_channel_snr_heatmap(ax, results, snr_threshold=10):
    """Create a heatmap showing which channels have SNR above threshold for each experiment"""
    print(f"   📊 Creating Channel SNR Heatmap (threshold: {snr_threshold} dB)")

    # Extract experiment names and channel names
    experiment_names = [(result.get('experiment_name') if hasattr(result, 'get') else result['experiment_name']) for result in results]
    all_channels = set()

    # Get all unique channel names from all experiments
    for result in results:
        if result.get('selected_channels'):
            selected_channels = result.get('selected_channels') if hasattr(result, 'get') else result['selected_channels']
            all_channels.update(selected_channels)

    all_channels = sorted(list(all_channels))
    n_experiments = len(experiment_names)
    n_channels = len(all_channels)

    print(f"   Found {n_experiments} experiments and {n_channels} channels")

    # Create SNR matrix
    snr_matrix = np.full((n_channels, n_experiments), np.nan)

    for exp_idx, result in enumerate(results):
        if result.get('snr_40hz_values') is not None and result.get('selected_channels'):
            exp_channels = result.get('selected_channels') if hasattr(result, 'get') else result['selected_channels']
            snr_values = result.get('snr_40hz_values') if hasattr(result, 'get') else result['snr_40hz_values']

            for ch_idx, ch_name in enumerate(exp_channels):
                if ch_name in all_channels and ch_idx < len(snr_values):
                    channel_row = all_channels.index(ch_name)
                    snr_matrix[channel_row, exp_idx] = snr_values[ch_idx]

    # Create heatmap
    # im = ax.imshow(snr_matrix, cmap='RdYlGn', aspect='auto', vmin=0, vmax=10) # 0-20 
    im = ax.imshow(snr_matrix, cmap='RdYlGn', aspect='equal', vmin=0, vmax=10) # 0-20 

    # Set ticks and labels
    ax.set_xticks(range(n_experiments))
    ax.set_xticklabels(experiment_names, rotation=45, ha='right')
    ax.set_yticks(range(n_channels))
    ax.set_yticklabels(all_channels)

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax)
    cbar.set_label('40Hz SNR (dB)', rotation=270, labelpad=15)

    # Add threshold line indication ### REMOVED
    # ax.axhline(y=-0.5, color='black', linewidth=0.5)
    # for i in range(1, n_channels):
    #     ax.axhline(y=i-0.5, color='black', linewidth=0.5)

    # Add text annotations for SNR values
    for i in range(n_channels):
        for j in range(n_experiments):
            if not np.isnan(snr_matrix[i, j]):
                value = snr_matrix[i, j]
                # color = 'white' if value < snr_threshold else 'black'
                color = 'black' if value < snr_threshold else 'white'
                text = f'{value:.1f}'
                # ax.text(j, i, text, ha='center', va='center', color=color, fontsize=8)
                ax.text(j, i, text, ha='center', va='center', color=color, fontsize=16)

    # Add threshold reference line in legend ### REMOVED
    # from matplotlib.patches import Rectangle
    # threshold_patch = Rectangle((0, 0), 1, 1, facecolor='red', alpha=0.3)
    # ax.legend([threshold_patch], [f'Below {snr_threshold} dB threshold'], loc='upper left', bbox_to_anchor=(1.15, 1))

    ax.set_title(f'Channel SNR Heatmap (40Hz, threshold: {snr_threshold} dB)')
    ax.set_xlabel('Experiments')
    ax.set_ylabel('Channels')

    print(f"   ✅ Channel SNR Heatmap completed")

# Multi-file processing functions
def extract_stimulation_periods_multi_file(raw_data_dict, session):
    """Extract stimulation periods for multi-file sessions"""
    print(f"[EXTRACT] EXTRACTING STIMULATION PERIODS (MULTI-FILE):")
    print(f"   Session experiments: {len(session.experiments)}")

    # DEBUG: First, let's see what experiments and their periods look like at the very start
    print(f"[DEBUG] FULL SESSION OVERVIEW before any processing:")
    for exp_idx, exp in enumerate(session.experiments):
        exp_py = exp.to_py() if hasattr(exp, 'to_py') else exp
        exp_name = exp_py.get('name', 'Unknown') if hasattr(exp_py, 'get') else getattr(exp_py, 'name', 'Unknown')
        exp_file_pair_id = exp_py.get('file_pair_id', 'Unknown') if hasattr(exp_py, 'get') else getattr(exp_py, 'file_pair_id', 'Unknown')
        periods = getattr(exp, 'stimulation_periods', [])

        print(f"   Exp {exp_idx+1}: '{exp_name}' (file_pair_id: {exp_file_pair_id}) - {len(periods)} periods:")
        for p_idx, period in enumerate(periods):
            # Direct attribute access for StimulationPeriod objects
            p_start = getattr(period, 'start', 'N/A')
            p_duration = getattr(period, 'duration', 'N/A')
            p_label = getattr(period, 'label', 'N/A')
            print(f"     Period {p_idx+1}: {p_label} at {p_start}s for {p_duration}s")

    # Convert JsProxy to Python dict to avoid compatibility issues
    raw_data_dict_py = raw_data_dict.to_py() if hasattr(raw_data_dict, 'to_py') else raw_data_dict

    # Get file_pairs safely
    file_pairs = None
    if hasattr(raw_data_dict_py, 'get'):
        file_pairs = raw_data_dict_py.get('file_pairs', [])
    elif hasattr(raw_data_dict_py, '__getitem__') and 'file_pairs' in raw_data_dict_py:
        file_pairs = raw_data_dict_py.get('file_pairs') if hasattr(raw_data_dict_py, 'get') else raw_data_dict_py['file_pairs']
    else:
        file_pairs = []

    # Convert file_pairs to Python list if needed
    if hasattr(file_pairs, 'to_py'):
        file_pairs = file_pairs.to_py()

    file_pairs_len = len(file_pairs) if file_pairs else 0
    print(f"   File pairs available: {file_pairs_len}")

    # Map file pairs to raw data
    file_pair_data = {}
    if file_pairs:
        for file_pair in file_pairs:
            # Convert file_pair to Python dict as well
            file_pair_py = file_pair.to_py() if hasattr(file_pair, 'to_py') else file_pair
            # Get id safely
            fp_id = file_pair_py.get('id') if hasattr(file_pair_py, 'get') else getattr(file_pair_py, 'id', None)
            if fp_id:
                file_pair_data[fp_id] = file_pair_py
                print(f"   [MAPPED] File pair {fp_id}")

    updated_experiments = []

    for exp in session.experiments:
        # Convert experiment to Python dict
        exp_py = exp.to_py() if hasattr(exp, 'to_py') else exp
        exp_name = exp_py.get('name', 'Unknown') if hasattr(exp_py, 'get') else getattr(exp_py, 'name', 'Unknown')
        file_pair_id = exp_py.get('file_pair_id') if hasattr(exp_py, 'get') else getattr(exp_py, 'file_pair_id', None)

        print(f"   [EXP] Processing experiment: {exp_name} (file_pair_id: {file_pair_id})")

        # DEBUG: Show stimulation periods for this experiment before extraction
        experiment_periods = getattr(exp, 'stimulation_periods', [])
        print(f"     [BEFORE] This experiment has {len(experiment_periods)} stimulation periods:")
        print(f"     [DEBUG] CRITICAL: Let's check if all periods have the SAME timestamps (indicating the bug):")

        # Collect all timestamps to check for duplicates
        timestamps = []
        has_duplicate_timestamps = False

        for p_idx, period in enumerate(experiment_periods):
            # Direct attribute access for StimulationPeriod objects
            p_start = getattr(period, 'start', 'N/A')
            p_duration = getattr(period, 'duration', 'N/A')
            p_label = getattr(period, 'label', 'N/A')
            print(f"       Period {p_idx+1}: {p_label} at {p_start}s for {p_duration}s")

            if isinstance(p_start, (int, float)) and isinstance(p_duration, (int, float)):
                timestamps.append((p_start, p_duration, p_label))

        # Check for duplicate timestamps
        for i in range(len(timestamps)):
            for j in range(i + 1, len(timestamps)):
                start1, dur1, label1 = timestamps[i]
                start2, dur2, label2 = timestamps[j]
                if abs(start1 - start2) < 0.001 and abs(dur1 - dur2) < 0.001:
                    print(f"       [BUG DETECTED] Periods '{label1}' and '{label2}' have IDENTICAL timestamps!")
                    print(f"                      This indicates CSV data was not parsed correctly!")
                    print(f"                      {label1}: {start1}s for {dur1}s")
                    print(f"                      {label2}: {start2}s for {dur2}s")
                    has_duplicate_timestamps = True

        # If we detected duplicate timestamps, skip this experiment and provide helpful error message
        if has_duplicate_timestamps:
            print(f"     [ERROR] Skipping experiment '{exp_name}' due to duplicate timestamps in CSV data.")
            print(f"     [SOLUTION] Please check your CSV file for experiment '{exp_name}' and ensure:")
            print(f"                1. Each period has unique start times")
            print(f"                2. The CSV format is correct (experiment,start_time,duration,label)")
            print(f"                3. No duplicate rows exist for the same experiment")
            continue  # Skip this experiment instead of crashing

        # Find the corresponding file pair for this experiment
        if not file_pair_id or file_pair_id not in file_pair_data:
            print(f"     ❌ No file pair found for experiment {exp_name} with ID {file_pair_id}")
            print(f"     Available file pair IDs: {list(file_pair_data.keys())}")
            continue

        # Get raw_data safely
        file_pair_info = file_pair_data[file_pair_id]
        pair_raw_data = file_pair_info.get('raw_data') if hasattr(file_pair_info, 'get') else getattr(file_pair_info, 'raw_data', None)

        # Convert to Python dict if it's a JsProxy
        pair_raw_data_py = pair_raw_data.to_py() if hasattr(pair_raw_data, 'to_py') else pair_raw_data

        # Check for data safely
        has_data = False
        if hasattr(pair_raw_data_py, 'get'):
            has_data = 'data' in pair_raw_data_py and pair_raw_data_py.get('data') is not None
        elif hasattr(pair_raw_data_py, '__getitem__'):
            has_data = 'data' in pair_raw_data_py and (pair_raw_data_py.get('data') if hasattr(pair_raw_data_py, 'get') else pair_raw_data_py['data']) is not None
        else:
            has_data = hasattr(pair_raw_data_py, 'data') and pair_raw_data_py.data is not None

        if not pair_raw_data_py or not has_data:
            print(f"     ❌ No raw data available for file pair {file_pair_id}")
            continue

        # Extract stimulation periods for this specific experiment using the correct EDF file
        # Get data safely
        data = pair_raw_data_py.get('data') if hasattr(pair_raw_data_py, 'get') else pair_raw_data_py['data']
        fs = pair_raw_data_py.get('fs') if hasattr(pair_raw_data_py, 'get') else pair_raw_data_py['fs']
        # Get duration safely - handle numpy arrays properly
        if 'duration_seconds' in pair_raw_data_py:
            duration_seconds = pair_raw_data_py.get('duration_seconds')
        else:
            # Calculate duration from data shape
            if hasattr(data, 'shape') and len(data.shape) >= 2:
                duration_seconds = data.shape[1] / fs
            elif isinstance(data, (list, tuple)) and len(data) > 0:
                duration_seconds = len(data[0]) / fs
            else:
                duration_seconds = 0

        raw_data_array = np.array(data)
        print(f"     [EDF] EDF data: shape={raw_data_array.shape}, fs={fs}Hz, duration={duration_seconds:.1f}s")

        updated_periods = []
        for period_idx, period in enumerate(exp.stimulation_periods):
            print(f"       [DEBUG] Processing period {period_idx+1}:")
            print(f"               Type: {type(period)}")
            print(f"               Has to_py: {hasattr(period, 'to_py')}")
            print(f"               Has start: {hasattr(period, 'start')}")
            print(f"               Has duration: {hasattr(period, 'duration')}")
            print(f"               Has label: {hasattr(period, 'label')}")

            # Convert period to Python dict
            period_py = period.to_py() if hasattr(period, 'to_py') else period
            print(f"               period_py type: {type(period_py)}")
            if isinstance(period_py, dict):
                print(f"               period_py keys: {list(period_py.keys())}")
                print(f"               period_py values: {period_py}")
            else:
                print(f"               period_py attributes: {dir(period_py)}")

            # CRITICAL BUG FIX: Robust period data extraction
            # Try multiple methods to extract the correct timestamp information

            start = None
            duration = None
            label = None

            # Method 1: Direct attribute access (most reliable for StimulationPeriod objects)
            try:
                if hasattr(period, 'start') and hasattr(period, 'duration') and hasattr(period, 'label'):
                    start = getattr(period, 'start')
                    duration = getattr(period, 'duration')
                    label = getattr(period, 'label')
                    if start is not None and duration is not None and label is not None:
                        print(f"       [METHOD 1 SUCCESS] Using direct attributes: {label} at {start}s for {duration}s")
                    else:
                        print(f"       [METHOD 1 PARTIAL] Some attributes are None: start={start}, duration={duration}, label={label}")
                        start = duration = label = None
            except Exception as e:
                print(f"       [METHOD 1 FAILED] Direct attribute access failed: {e}")
                start = duration = label = None

            # Method 2: Dictionary/object access (for converted objects)
            if start is None or duration is None or label is None:
                try:
                    if hasattr(period_py, 'get'):
                        # Try both 'start' and 'start_time' keys
                        start = period_py.get('start') or period_py.get('start_time')
                        duration = period_py.get('duration')
                        label = period_py.get('label')
                        if start is not None and duration is not None and label is not None:
                            print(f"       [METHOD 2 SUCCESS] Using dictionary access: {label} at {start}s for {duration}s")
                        else:
                            print(f"       [METHOD 2 PARTIAL] Some values are None: start={start}, duration={duration}, label={label}")
                            # Don't reset to None if we got some values
                            if start is None:
                                start = period_py.get('start_time')
                            if start is None or duration is None or label is None:
                                start = duration = label = None
                except Exception as e:
                    print(f"       [METHOD 2 FAILED] Dictionary access failed: {e}")
                    start = duration = label = None

            # Method 3: getattr fallback
            if start is None or duration is None or label is None:
                try:
                    # Try both 'start' and 'start_time' attributes
                    start = getattr(period_py, 'start', None) or getattr(period_py, 'start_time', None)
                    duration = getattr(period_py, 'duration', None)
                    label = getattr(period_py, 'label', None)
                    if start is not None and duration is not None and label is not None:
                        print(f"       [METHOD 3 SUCCESS] Using getattr fallback: {label} at {start}s for {duration}s")
                    else:
                        print(f"       [METHOD 3 PARTIAL] Some values are None: start={start}, duration={duration}, label={label}")
                except Exception as e:
                    print(f"       [METHOD 3 FAILED] getattr fallback failed: {e}")

            # If we still can't extract the data after all methods, report error and skip
            if start is None or duration is None or label is None:
                print(f"       [ERROR] Failed to extract period data after all methods:")
                print(f"                start={start}, duration={duration}, label={label}")
                print(f"       [SKIP] Skipping this period - cannot process without complete data")
                continue

            # Note: Duplicate timestamp validation was moved earlier in the function
            # We now skip experiments with duplicate timestamps instead of crashing

            print(f"     [PERIOD] Processing period {period_idx+1}: {label} ({start:.1f}s - {start + duration:.1f}s)")

            start_sample = int(start * fs)
            end_sample = int((start + duration) * fs)

            print(f"       [EXTRACTION DEBUG] Converting time to samples:")
            print(f"         Sampling Rate: {fs} Hz")
            print(f"         Time Range: {start:.3f}s to {start + duration:.3f}s")
            print(f"         Sample Range: {start_sample} to {end_sample} (total: {end_sample - start_sample} samples)")
            print(f"         Expected Duration in Samples: {duration * fs:.1f}")

            # Validate sample indices against this specific EDF file's duration
            max_samples = raw_data_array.shape[1]
            print(f"         EDF File Total Samples: {max_samples} (duration: {max_samples/fs:.1f}s)")
            if start_sample < 0:
                print(f"       [WARN] Start time {start:.1f}s is negative, clipping to 0")
                start_sample = 0
                start = 0

            if end_sample > max_samples:
                print(f"       [WARN] End time {start + duration:.1f}s extends beyond EDF duration {duration_seconds:.1f}s")
                print(f"       Sample range {start_sample}-{end_sample} vs max {max_samples}")
                end_sample = max_samples
                duration = (end_sample - start_sample) / fs
                print(f"       Adjusted to {start:.1f}s - {start + duration:.1f}s")

            if start_sample >= end_sample:
                print(f"       [ERROR] Invalid time range after adjustment, skipping period")
                continue

            # Extract the data segment for this specific experiment from this specific EDF
            raw_segment = raw_data_array[:, start_sample:end_sample]

            print(f"       [SLICE DEBUG] Data extraction:")
            print(f"         Source array shape: {raw_data_array.shape}")
            print(f"         Extracted slice: [:, {start_sample}:{end_sample}]")
            print(f"         Extracted shape: {raw_segment.shape}")

            # Verify extracted data has meaningful content
            if raw_segment.size == 0:
                print(f"       [ERROR] Empty data segment extracted, skipping period")
                continue

            data_stats = {
                'min': np.min(raw_segment),
                'max': np.max(raw_segment),
                'mean': np.mean(raw_segment),
                'std': np.std(raw_segment)
            }

            print(f"       [DATA VALIDATION] Extracted data uniqueness check:")
            # Check first channel for uniqueness
            if raw_segment.shape[0] > 0:
                first_channel = raw_segment[0, :]
                unique_values = len(np.unique(first_channel))
                sample_values = first_channel[:min(10, len(first_channel))]
                print(f"         First channel: {unique_values} unique values out of {len(first_channel)} samples")
                print(f"         Sample values: {sample_values}")

            # Create a unique fingerprint for this data segment
            segment_fingerprint = np.sum(raw_segment) + np.mean(raw_segment) * 1000
            print(f"         Data fingerprint: {segment_fingerprint:.6f} (unique identifier for this segment)")

            # Create a new StimulationPeriod with the corrected data
            # This ensures we have a clean period object with proper attributes
            new_period = StimulationPeriod(
                start=start,
                duration=duration,
                label=label
            )
            new_period.raw_segment = raw_segment

            print(f"       [PERIOD CREATED] New period object with corrected timestamps:")
            print(f"                       {label} at {start}s for {duration}s")
            print(f"       [VERIFICATION] New period attributes:")
            print(f"                     start={getattr(new_period, 'start', 'MISSING')}")
            print(f"                     duration={getattr(new_period, 'duration', 'MISSING')}")
            print(f"                     label={getattr(new_period, 'label', 'MISSING')}")

            updated_periods.append(new_period)

            print(f"       [OK] Extracted segment: {raw_segment.shape} samples")
            print(f"       [DATA] Data range: {data_stats['min']:.3f} to {data_stats['max']:.3f}, mean={data_stats['mean']:.3f}, std={data_stats['std']:.3f}")

        exp.stimulation_periods = updated_periods
        if updated_periods:
            updated_experiments.append(exp)
            print(f"     [OK] Updated experiment {exp_name} with {len(updated_periods)} periods")
        else:
            print(f"     [ERROR] No valid periods found for experiment {exp_name}, skipping")

    session.experiments = updated_experiments
    print(f"   [OK] Multi-file extraction completed: {len(updated_experiments)} experiments processed with valid data")

    # Summary of what was extracted
    total_periods = sum(len(exp.stimulation_periods) for exp in updated_experiments)
    print(f"   [SUMMARY] EXTRACTION SUMMARY: {len(updated_experiments)} experiments, {total_periods} total periods")

    return session

def analyze_experiment_multi_file(experiment, file_pair_data, target_frequencies=[40], psd_method='welch', selected_channels=None):
    """Analyze experiment from multi-file session with specific file pair data"""

    # Convert JsProxy objects to Python equivalents
    experiment_py = experiment.to_py() if hasattr(experiment, 'to_py') else experiment
    file_pair_data_py = {}
    for key, value in file_pair_data.items():
        file_pair_data_py[key] = value.to_py() if hasattr(value, 'to_py') else value

    exp_name = experiment_py.get('name', 'Unknown') if hasattr(experiment_py, 'get') else getattr(experiment_py, 'name', 'Unknown')
    print(f"[MULTI-ANALYZE] ANALYZING EXPERIMENT (MULTI-FILE): {exp_name}")

    # Get raw data for this specific experiment
    file_pair_id = experiment_py.get('file_pair_id') if hasattr(experiment_py, 'get') else getattr(experiment_py, 'file_pair_id', None)
    if not file_pair_id or file_pair_id not in file_pair_data_py:
        print(f"  [ERROR] No file pair data found for experiment {exp_name}")
        return None

    # Get raw_data safely
    file_pair_info = file_pair_data_py.get(file_pair_id) if hasattr(file_pair_data_py, 'get') else file_pair_data_py[file_pair_id]
    pair_raw_data = file_pair_info.get('raw_data') if hasattr(file_pair_info, 'get') else file_pair_info['raw_data']
    if not pair_raw_data:
        print(f"  [ERROR] No raw data available for file pair {file_pair_id}")
        return None

    # Use the regular analyze_experiment function with specific raw data
    fs = pair_raw_data.get('fs') if hasattr(pair_raw_data, 'get') else pair_raw_data['fs']
    channel_names = pair_raw_data.get('channel_names') if hasattr(pair_raw_data, 'get') else pair_raw_data['channel_names']

    # Get file names safely for logging
    edf_file = file_pair_info.get('edf_file', 'Unknown') if hasattr(file_pair_info, 'get') else file_pair_info.get('edf_file', 'Unknown')
    csv_file = file_pair_info.get('csv_file', 'Unknown') if hasattr(file_pair_info, 'get') else file_pair_info.get('csv_file', 'Unknown')

    print(f"  [FILES] File pair: {edf_file} + {csv_file}")
    print(f"  [FILES] Channels: {len(channel_names)}, Sampling rate: {fs} Hz")

    # IMPORTANT: Set up a temporary global current_raw_data context for this experiment
    # This allows analyze_experiment to access the correct channel names for this specific file pair
    global current_raw_data
    original_current_raw_data = current_raw_data  # Save original

    # Create a temporary raw_data context with the correct channel names for this experiment
    temp_raw_data = {
        'fs': fs,
        'channel_names': channel_names,
        'duration_seconds': pair_raw_data.get('duration_seconds', 0),
        'n_channels': len(channel_names),
        # Include file_pairs structure so analyze_experiment can find the right data
        'file_pairs': [{
            'id': file_pair_id,
            'raw_data': pair_raw_data
        }]
    }

    try:
        # Temporarily replace global context
        current_raw_data = temp_raw_data

        print(f"  [CONTEXT] Temporarily set context with channel names: {channel_names}")

        # Call the original analyze_experiment function
        # Note: The experiment should already have its raw_segment data extracted by extract_stimulation_periods_multi_file
        result = analyze_experiment(experiment, fs=fs, target_frequencies=target_frequencies,
                                psd_method=psd_method, selected_channels=selected_channels)

        return result

    finally:
        # Always restore the original context
        current_raw_data = original_current_raw_data

# Global variables to store current session
current_session = None
current_raw_data = None
current_analysis_results = None