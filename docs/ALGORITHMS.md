# Analysis Algorithms Documentation

## Overview

This document describes the signal processing and analysis algorithms implemented in the EEG Platform.

---

## SSVEP Detection Algorithm

### Overview

Steady-State Visual Evoked Potential (SSVEP) detection identifies neural responses to periodic visual stimulation, typically at frequencies like 40Hz. The platform implements multiple detection methods for robust analysis.

### Implementation Location

- **Backend:** `python-backend/main.py` (lines 506-537, 783-846)
- **Browser:** Python code executed via Pyodide

### Algorithm 1: Frequency Domain Detection

**Function:** `detect_frequency_domain()`

**Method:**
1. **Bandpass Filtering**
   - Filter signal around target frequency (±2 Hz)
   - Butterworth filter, 4th order
   - Filter type: `sos` (second-order sections)

2. **Power Spectral Density (PSD)**
   - Method: Welch's method
   - Window length: 2048 samples
   - Overlap: 50% (default)

3. **Peak Detection**
   - Find frequency bin closest to target frequency
   - Extract power at target frequency

4. **Noise Estimation**
   - Define noise band: ±10 Hz around target, excluding ±3 Hz
   - Calculate mean power in noise band

5. **SNR Calculation**
   ```
   SNR (dB) = 10 * log10(peak_power / noise_power)
   ```

6. **Confidence Classification**
   - **High**: SNR > 6 dB
   - **Medium**: 3 dB < SNR ≤ 6 dB
   - **Low**: SNR ≤ 3 dB

**Code Reference:**
```python
def detect_frequency_domain(signal_data, sample_rate, target_freq):
    # Bandpass filter
    sos = signal.butter(4, [target_freq-2, target_freq+2], 
                       btype='band', fs=sample_rate, output='sos')
    filtered_signal = signal.sosfilt(sos, signal_data)
    
    # Compute PSD
    freqs, psd = signal.welch(filtered_signal, fs=sample_rate, nperseg=2048)
    
    # Find peak
    target_idx = np.argmin(np.abs(freqs - target_freq))
    peak_power = psd[target_idx]
    
    # Noise estimation
    noise_band = (freqs >= target_freq-10) & (freqs <= target_freq+10) & 
                 (np.abs(freqs - target_freq) >= 3)
    noise_power = np.mean(psd[noise_band])
    
    # SNR
    snr_db = 10 * np.log10(peak_power / noise_power)
    
    return {
        'peak_power': peak_power,
        'noise_power': noise_power,
        'snr_db': snr_db,
        'detection_threshold': snr_db > 3
    }
```

**Advantages:**
- Standard frequency-domain approach
- Robust to noise
- Well-established method

**Limitations:**
- Fixed window size
- Assumes stationary signal
- No harmonic detection

---

### Algorithm 2: Time Domain Detection

**Function:** `detect_time_domain()`

**Method:**
1. **Template Creation**
   - Generate 1-second sinusoidal template at target frequency
   - Sample rate matches signal

2. **Cross-Correlation**
   - Compute cross-correlation between signal and template
   - Find maximum correlation value

3. **Normalization**
   - Normalize by signal and template energy
   ```
   normalized_correlation = max_correlation / sqrt(signal_energy * template_energy)
   ```

4. **Detection Threshold**
   - Threshold: > 0.3 for detection

**Code Reference:**
```python
def detect_time_domain(signal_data, sample_rate, target_freq):
    # Create template
    duration = 1.0
    t = np.linspace(0, duration, int(sample_rate * duration))
    template = np.sin(2 * np.pi * target_freq * t)
    
    # Cross-correlation
    correlation = np.correlate(signal_data, template, mode='valid')
    max_correlation = np.max(np.abs(correlation))
    
    # Normalize
    signal_energy = np.sum(signal_data**2)
    template_energy = np.sum(template**2)
    normalized_correlation = max_correlation / np.sqrt(signal_energy * template_energy)
    
    return {
        'max_correlation': max_correlation,
        'normalized_correlation': normalized_correlation,
        'detection_threshold': normalized_correlation > 0.3
    }
```

**Advantages:**
- Time-domain approach complements frequency-domain
- Good for non-stationary signals
- Template matching is intuitive

**Limitations:**
- Sensitive to phase shifts
- Fixed template duration
- Computationally intensive

---

### Algorithm 3: Coherence Analysis

**Function:** `compute_coherence_measure()`

**Method:**
1. **Reference Signal**
   - Generate sinusoidal reference at target frequency
   - Same length as signal

2. **Coherence Calculation**
   - Use SciPy's coherence function
   - Window length: 2048 samples

3. **Extract Coherence Value**
   - Find coherence at target frequency
   - Threshold: > 0.5 for detection

**Code Reference:**
```python
def compute_coherence_measure(signal_data, sample_rate, target_freq):
    # Create reference
    t = np.arange(len(signal_data)) / sample_rate
    reference = np.sin(2 * np.pi * target_freq * t)
    
    # Compute coherence
    freqs, coherence = signal.coherence(signal_data, reference, 
                                       fs=sample_rate, nperseg=2048)
    
    # Extract at target frequency
    target_idx = np.argmin(np.abs(freqs - target_freq))
    coherence_value = coherence[target_idx]
    
    return {
        'coherence_value': coherence_value,
        'detection_threshold': coherence_value > 0.5
    }
```

**Advantages:**
- Measures phase-locking
- Robust to amplitude variations
- Standard coherence metric

**Limitations:**
- Requires reference signal
- Sensitive to noise
- Computationally expensive

---

## Principal Component Analysis (PCA)

### Overview

PCA is used for artifact removal and dimensionality reduction in multi-channel EEG data.

### Implementation

**Function:** `perform_pca_on_channels()`

**Location:** `python-backend/main.py` (lines 539-566)

**Method:**
1. **Data Preparation**
   - Stack channels into matrix (samples × channels)
   - Standardize using StandardScaler

2. **PCA Computation**
   - Number of components: Configurable (default: 5)
   - Use scikit-learn's PCA

3. **Variance Analysis**
   - Calculate explained variance ratio per component
   - Compute cumulative variance

4. **Component Loadings**
   - Extract component loadings (channels × components)

**Code Reference:**
```python
def perform_pca_on_channels(channel_data, n_components=None):
    # Prepare data matrix
    channel_names = list(channel_data.keys())
    data_matrix = np.array([channel_data[ch] for ch in channel_names]).T
    
    # Standardize
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data_matrix)
    
    # Determine components
    if n_components is None:
        n_components = min(len(channel_names), 5)
    
    # Perform PCA
    pca = PCA(n_components=n_components)
    components = pca.fit_transform(data_scaled)
    
    return {
        'n_components': n_components,
        'explained_variance_ratio': pca.explained_variance_ratio_.tolist(),
        'cumulative_variance': np.cumsum(pca.explained_variance_ratio_).tolist(),
        'component_loadings': pca.components_.tolist(),
        'channel_names': channel_names
    }
```

**Use Cases:**
- Artifact removal (eye blinks, muscle activity)
- Dimensionality reduction
- Noise reduction

**Parameters:**
- `n_components`: Number of principal components (default: 5)
- Auto-selection: Uses minimum of available channels or 5

---

## Power Spectral Density (PSD)

### Overview

PSD analysis computes the power distribution across frequencies in the EEG signal.

### Implementation

**Function:** `compute_power_spectral_density()`

**Location:** `python-backend/main.py` (lines 317-375)

**Method:**
1. **Signal Reading**
   - Read entire channel or specified segment

2. **Welch's Method**
   - Window length: 2048 samples (default)
   - Overlap: 50% (default)
   - Window function: Hann (default)

3. **Frequency Filtering**
   - Filter to specified range (fmin, fmax)

4. **Visualization**
   - Logarithmic scale (semilogy)
   - Multi-channel overlay

**Code Reference:**
```python
def compute_power_spectral_density(edf_file, parameters):
    fmin = parameters.get('fmin', 0.5)
    fmax = parameters.get('fmax', 50)
    channels = parameters.get('channels', [0])
    
    sample_rate = edf_file.getSampleFrequency(0)
    
    for ch_idx in channels:
        signal_data = edf_file.readSignal(ch_idx)
        
        # Compute PSD using Welch's method
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        
        # Filter frequency range
        freq_mask = (freqs >= fmin) & (freqs <= fmax)
        freqs_filtered = freqs[freq_mask]
        psd_filtered = psd[freq_mask]
        
        # Store results
        psd_data[channel_label] = {
            'frequencies': freqs_filtered.tolist(),
            'psd_values': psd_filtered.tolist()
        }
    
    return {
        'plot': plot_base64,
        'data': psd_data,
        'analysis_type': 'psd'
    }
```

**Parameters:**
- `fmin`: Minimum frequency (Hz), default: 0.5
- `fmax`: Maximum frequency (Hz), default: 50
- `channels`: Channel indices to analyze
- `nperseg`: Window length in samples, default: 2048

**Output:**
- Frequency array (Hz)
- PSD values (V²/Hz)
- Base64-encoded plot image

---

## Signal-to-Noise Ratio (SNR)

### Overview

SNR analysis quantifies the signal quality by comparing signal power to noise power.

### Implementation

**Function:** `compute_signal_to_noise_ratio()`

**Location:** `python-backend/main.py` (lines 377-439)

**Method 1: Simple SNR (General)**
1. **PSD Computation**
   - Compute PSD using Welch's method

2. **Noise Floor Estimation**
   - Use 10th percentile of PSD as noise floor

3. **SNR Calculation**
   ```
   SNR (dB) = 10 * log10(PSD / noise_floor)
   ```

**Method 2: SSVEP-Specific SNR**
1. **Target Frequency Detection**
   - Find power at target frequency (±0.5 Hz)

2. **Noise Estimation**
   - Define noise band: ±10 Hz around target, excluding ±2 Hz
   - Calculate mean noise power

3. **SNR Calculation**
   ```
   SNR (linear) = signal_power / noise_power
   SNR (dB) = 10 * log10(SNR_linear)
   ```

**Code Reference:**
```python
def compute_ssvep_snr(channel_data, sample_rate, target_freq):
    # Compute PSD
    freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=4096)
    
    # Signal power at target frequency
    target_idx = np.argmin(np.abs(freqs - target_freq))
    signal_range = (freqs >= target_freq - 0.5) & (freqs <= target_freq + 0.5)
    signal_power = np.max(psd[signal_range])
    
    # Noise power
    noise_range = ((freqs >= target_freq - 10) & (freqs <= target_freq - 2)) | \
                  ((freqs >= target_freq + 2) & (freqs <= target_freq + 10))
    noise_power = np.mean(psd[noise_range])
    
    # SNR
    snr_linear = signal_power / noise_power
    snr_db = 10 * np.log10(snr_linear)
    
    return {
        'signal_power': signal_power,
        'noise_power': noise_power,
        'snr_linear': snr_linear,
        'snr_db': snr_db
    }
```

**Interpretation:**
- **SNR > 6 dB**: High quality signal
- **SNR 3-6 dB**: Medium quality
- **SNR < 3 dB**: Low quality, high noise

---

## Frequency Band Analysis

### Overview

Analyzes power in standard EEG frequency bands: Delta, Theta, Alpha, Beta, Gamma.

### Implementation

**Function:** `analyze_frequency_bands()`

**Location:** `python-backend/main.py` (lines 568-595)

**Method:**
1. **Band Definitions**
   - Delta: 0.5 - 4 Hz (or custom)
   - Theta: 4 - 8 Hz
   - Alpha: 8 - 12 Hz (or custom)
   - Beta: 12 - 30 Hz (or custom)
   - Gamma: 30 - 100 Hz (or custom)

2. **PSD Computation**
   - Compute PSD using Welch's method

3. **Band Power Calculation**
   - Integrate PSD over each band (trapezoidal integration)

4. **Relative Power**
   - Calculate percentage of total power in each band

**Code Reference:**
```python
def analyze_frequency_bands(channel_data, sample_rate, frequency_bands):
    band_names = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma']
    band_ranges = [
        (0.5, frequency_bands[0]),      # Delta
        (frequency_bands[0], 8),        # Theta
        (8, frequency_bands[1]),        # Alpha
        (frequency_bands[1], frequency_bands[2]),  # Beta
        (frequency_bands[2], frequency_bands[3])     # Gamma
    ]
    
    for ch_name, signal_data in channel_data.items():
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        
        band_powers = {}
        for band_name, (fmin, fmax) in zip(band_names, band_ranges):
            band_mask = (freqs >= fmin) & (freqs <= fmax)
            band_power = np.trapz(psd[band_mask], freqs[band_mask])
            band_powers[band_name] = float(band_power)
        
        total_power = sum(band_powers.values())
        relative_powers = {band: power/total_power 
                          for band, power in band_powers.items()}
        
        results[ch_name] = {
            'absolute_power': band_powers,
            'relative_power': relative_powers
        }
    
    return results
```

**Output:**
- Absolute power per band (V²)
- Relative power per band (percentage)

---

## Theta-Beta Ratio

### Overview

Calculates the ratio of theta to beta power, commonly used in ADHD research.

### Implementation

**Function:** Part of `perform_analysis()` with type `theta_beta_ratio`

**Method:**
1. **Band Power Calculation**
   - Theta: 4-7 Hz (configurable)
   - Beta: 13-30 Hz (configurable)

2. **Ratio Calculation**
   ```
   Theta-Beta Ratio = theta_power / beta_power
   ```

**Parameters:**
- `theta_min`: Lower theta frequency (Hz), default: 4
- `theta_max`: Upper theta frequency (Hz), default: 7
- `beta_min`: Lower beta frequency (Hz), default: 13
- `beta_max`: Upper beta frequency (Hz), default: 30
- `method`: PSD method ('welch' or 'periodogram')

**Output:**
- Theta power
- Beta power
- Theta-Beta ratio

**Interpretation:**
- Higher ratio may indicate attention issues
- Research-specific thresholds apply

---

## Time-Frequency Analysis

### Overview

Computes spectrogram showing frequency content over time.

### Implementation

**Method:**
1. **Short-Time Fourier Transform (STFT)**
   - Windowed FFT over time
   - Configurable frequency and time resolution

2. **Visualization**
   - Spectrogram plot (time × frequency × power)

**Parameters:**
- `freq_min`: Minimum frequency (Hz)
- `freq_max`: Maximum frequency (Hz)
- `freq_points`: Frequency resolution
- `time_points`: Time resolution
- `duration`: Analysis duration (seconds)
- `start_time`: Start time (seconds)

**Output:**
- Base64-encoded spectrogram image

---

## Algorithm Parameters Summary

### SSVEP Detection
- Target frequency: 40 Hz (default, configurable)
- Bandpass filter: ±2 Hz around target
- PSD window: 2048 samples
- SNR thresholds: 3 dB (medium), 6 dB (high)

### PCA
- Components: 5 (default, configurable)
- Standardization: Yes (StandardScaler)
- Variance threshold: 95% (visualization only)

### PSD
- Method: Welch's method (default)
- Window length: 2048 samples
- Overlap: 50%
- Window function: Hann

### Frequency Bands
- Delta: 0.5 - 4 Hz
- Theta: 4 - 8 Hz
- Alpha: 8 - 12 Hz
- Beta: 12 - 30 Hz
- Gamma: 30 - 100 Hz

---

## Performance Considerations

### Computational Complexity
- **PSD**: O(N log N) per channel
- **PCA**: O(N × M²) where N=samples, M=channels
- **SSVEP Detection**: O(N log N) per channel
- **Time-Frequency**: O(N × F × T) where F=freq points, T=time points

### Optimization Opportunities
- Parallel processing for multi-channel analysis
- Chunked processing for large files
- Caching of intermediate results
- Web Workers for browser-based processing

---

**Last Updated:** December 2024

