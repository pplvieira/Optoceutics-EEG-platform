# EEG Analysis Dashboard - User Guide

A comprehensive guide to using the Optoceutics EEG Analysis Platform for analyzing EEG/EDF data and generating professional reports.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [PSD Comparison Tool](#psd-comparison-tool)
3. [SSVEP Analysis Tool](#ssvep-analysis-tool)
4. [FOOOF Analysis Tool](#fooof-analysis-tool)
5. [Single-File EDF Analysis](#single-file-edf-analysis)
6. [Generating Reports](#generating-reports)
7. [Tips and Best Practices](#tips-and-best-practices)

---

## Getting Started

### Accessing the Dashboard

1. **Open the web application** in your browser
2. **Select your analysis mode**:
   - **Browser Python Mode** (Recommended): No setup required, runs entirely in your browser
   - **Local Backend Mode**: Requires Python backend running on localhost:8000
3. **Wait for initialization**: Browser Python mode takes ~30 seconds on first load

### Uploading EEG Files

The platform supports:
- **EDF** (European Data Format)
- **BDF** (BioSemi Data Format)
- Files up to **100MB+**

**Privacy Note**: In Browser Python mode, files are processed locally and never uploaded to a server.

---

## PSD Comparison Tool

The PSD Comparison Tool allows you to overlay and compare Power Spectral Density plots from multiple EEG recordings or channels.

### Step 1: Add Traces

1. Click **"Add Trace"** button
2. For each trace, configure:
   - **File Upload**: Select your EDF/BDF file
   - **Channel Selection**: Choose the EEG channel (e.g., O1, O2, Oz, Fp1, etc.)
   - **Label**: Give your trace a descriptive name (e.g., "Pre-stimulation O1", "Post-stimulation O2")
   - **Color**: Select a color for the trace line (optional)
   - **Time Window** (optional): Specify start and end times in seconds to analyze a specific segment

3. Repeat for additional traces (up to 10 recommended for clarity)

### Step 2: Configure PSD Parameters

Adjust the Power Spectral Density calculation settings:

- **Method**:
  - *Welch* (recommended): More stable, uses overlapping windows
  - *Periodogram*: Faster but noisier

- **Frequency Range**:
  - **Min Frequency** (fmin): Typically 0.5 Hz
  - **Max Frequency** (fmax): Typically 50 Hz (adjust based on sampling rate)

- **Window Parameters** (for Welch method):
  - **Window Length**: 4 seconds (default) - longer windows = better frequency resolution
  - **Overlap**: 50% (default) - more overlap = smoother estimates
  - **Window Type**: Hamming (default), Hanning, Blackman, etc.

### Step 3: Enable Advanced Features

#### Alpha Peak Detection
- **Enable**: Check "Show Alpha Peaks"
- **What it does**: Automatically detects and labels the dominant alpha rhythm (8-12 Hz)
- **Annotations show**:
  - Peak frequency (e.g., 10.2 Hz)
  - Power amplitude
  - Bandwidth
- **Use case**: Comparing resting-state EEG, meditation studies, eyes-closed vs eyes-open conditions

#### Gamma Peak Detection (40Hz SSVEP)
- **Enable**: Check "Show Gamma Peaks (40Hz)"
- **What it does**: Detects gamma-band activity around 40 Hz (typical for SSVEP experiments)
- **Annotations show**:
  - Peak frequency near 40 Hz
  - Power amplitude
  - Bandwidth
- **Optional SNR**: Check "Show SNR at 40Hz" to calculate signal-to-noise ratio
- **Use case**: Auditory/visual stimulation experiments, brain-computer interfaces

#### Display Options
- **Use dB Scale**: Convert power to decibels (10*log10) for better visualization of weak signals
- **Apply Resutil Styling**: Use Optoceutics custom plot styling (professional appearance)
- **Hide Title**: Remove plot title for cleaner figures in reports

### Step 4: Generate and Interpret Plot

1. Click **"Generate Comparison Plot"**
2. Wait for processing (typically 5-30 seconds depending on file sizes)
3. **Interpret the results**:
   - **Trace lines**: Each colored line represents one recording/channel
   - **Alpha annotations**: Labels at 8-12 Hz region showing dominant alpha peaks
   - **Gamma annotations**: Labels near 40 Hz (if enabled) showing SSVEP response
   - **Y-axis**: Power (μV²/Hz) or Power (dB)
   - **X-axis**: Frequency (Hz)

### Annotation Layout Guide

**Alpha Peak Labels** (when 2-3 traces):
- 2 traces: Side-by-side at top of plot
- 3 traces: One centered above, two below side-by-side

**Gamma Peak Labels**:
- Always arranged side-by-side at lower portion of plot
- Centered symmetrically around 40 Hz
- Labeled with power, bandwidth, and SNR (if enabled)

### Step 5: Export Results

- **Right-click on plot** → Save image as PNG
- **Copy to clipboard** → Paste directly into reports
- **Screenshot** → Use system screenshot tool for quick captures

### Common Use Cases

1. **Pre/Post Intervention Comparison**
   - Trace 1: Baseline recording (O1)
   - Trace 2: Post-intervention recording (O1)
   - Look for: Changes in alpha power, gamma response

2. **Multi-Channel Analysis**
   - Trace 1: O1 (left occipital)
   - Trace 2: O2 (right occipital)
   - Trace 3: Oz (midline occipital)
   - Look for: Channel-specific responses, lateralization

3. **Time-Segment Comparison**
   - Same file, different time windows
   - Trace 1: 0-60s (baseline)
   - Trace 2: 60-120s (stimulation)
   - Trace 3: 120-180s (recovery)

---

## SSVEP Analysis Tool

Steady-State Visually Evoked Potentials (SSVEP) analysis for 40Hz stimulation experiments.

### Overview

The SSVEP tool performs comprehensive analysis to detect brain responses to rhythmic visual or auditory stimulation at specific frequencies (typically 40 Hz).

### Step 1: Upload and Configure

1. **Upload EDF file** with SSVEP recording
2. **Select channels**: Tool auto-detects occipital channels (O1, O2, Oz) or manually select
3. **Set target frequency**: Default 40 Hz (adjustable for other stimulation frequencies)

### Step 2: Configure Analysis Parameters

- **Target Frequency**: 40 Hz (or your stimulation frequency)
- **PCA Components**: Number of principal components for artifact removal (default: 5)
- **Frequency Bands**: Delta, Theta, Alpha, Beta, Gamma ranges

### Step 3: Run Analysis

Click **"Run SSVEP Analysis"** and wait for results (1-5 minutes for typical files).

### Interpreting Results

**Detection Confidence** (per channel):
- **High**: Strong SSVEP response detected (SNR > 3 dB)
- **Medium**: Moderate response (SNR 1-3 dB)
- **Low**: Weak or no response (SNR < 1 dB)

**Visualizations**:
1. **Power Spectral Density**: Shows frequency content with peak at target frequency
2. **SNR Plot**: Signal-to-noise ratio across channels
3. **PCA Analysis**: Variance explained by principal components
4. **Frequency Band Distribution**: Power distribution across brain rhythms

**Statistical Summary**:
- Mean SNR across channels
- Peak detection at target frequency
- Variance explained by PCA

### Use Cases

- **40Hz Auditory Stimulation**: Gamma-band entrainment studies
- **SSVEP BCI**: Brain-computer interface applications
- **Sensory Processing**: Neural response to rhythmic stimuli
- **Clinical Assessment**: Gamma oscillation abnormalities

---

## FOOOF Analysis Tool

Fitting Oscillations & One-Over-F (FOOOF) analysis for parametric spectral decomposition.

### Overview

FOOOF separates the power spectrum into:
1. **Aperiodic component**: 1/f background activity
2. **Periodic components**: Oscillatory peaks (alpha, beta, gamma)

### Step 1: Upload and Select Data

1. Upload EDF file
2. Select channel for analysis
3. Choose frequency range (typically 1-50 Hz)

### Step 2: Configure FOOOF Parameters

- **Peak Width Limits**: Minimum and maximum width of oscillatory peaks
- **Max Number of Peaks**: Maximum peaks to detect (default: 6)
- **Min Peak Height**: Minimum relative peak height (default: 0.1)
- **Aperiodic Mode**: 'fixed' (knee-free) or 'knee' (with knee parameter)

### Step 3: Interpret Results

**Aperiodic Parameters**:
- **Offset**: Overall power level
- **Exponent**: Slope of 1/f background (steeper = more low-frequency power)

**Peak Parameters** (for each detected peak):
- **Center Frequency**: Peak location (Hz)
- **Power**: Peak amplitude above background
- **Bandwidth**: Width of the peak

**Visualizations**:
1. **Original vs Model Fit**: Shows how well FOOOF fits your data
2. **Aperiodic Fit**: The 1/f background component
3. **Peak Fit**: Isolated oscillatory components

### Applications

- **Alpha Peak Characterization**: Precise measurement of alpha rhythm
- **Aging Studies**: 1/f exponent changes with age
- **Clinical Research**: Abnormal oscillations in neurological conditions
- **Development Studies**: Maturation of brain rhythms

---

## Single-File EDF Analysis

Basic single-file analysis for quick exploratory data analysis.

### Features

1. **File Metadata Display**:
   - Number of channels
   - Sampling rate
   - Recording duration
   - Channel labels

2. **Channel Selection**: Choose specific channels for analysis

3. **Basic PSD Plot**: Quick power spectral density visualization

4. **Raw Signal Viewer**: Time-domain signal inspection

### Quick Workflow

1. Upload file
2. Review metadata
3. Select channel of interest
4. View PSD and raw signal
5. Identify frequencies of interest
6. Proceed to advanced tools (SSVEP, FOOOF, Comparison)

---

## Generating Reports

### Using the Report Template

The platform includes a professional **Customer Report Template** for documenting analysis results.

#### Report Structure

The template includes sections for:

1. **Executive Summary**
   - Subject information
   - Recording details
   - Key findings

2. **Methodology**
   - Equipment used
   - Recording parameters
   - Analysis methods
   - Software version

3. **Results**
   - **PSD Comparison Plots**: Insert your multi-trace comparisons
   - **SSVEP Analysis Results**: Detection confidence, SNR values
   - **FOOOF Analysis**: Aperiodic and periodic parameters
   - **Statistical Tables**: Quantitative results

4. **Interpretation**
   - Clinical or research interpretation
   - Comparison to normative data
   - Recommendations

5. **Appendices**
   - Technical specifications
   - Raw data tables
   - Additional plots

#### Workflow for Report Generation

1. **Perform All Analyses**:
   - Run PSD comparisons for all conditions
   - Complete SSVEP analysis if applicable
   - Run FOOOF on key channels
   - Export all plots as PNG images

2. **Organize Figures**:
   - Label each figure clearly (Figure 1, Figure 2, etc.)
   - Include descriptive captions
   - Note any special settings (dB scale, time windows, etc.)

3. **Fill Template**:
   - Open `Customer Report Template.docx`
   - **Do not modify formatting** - maintain professional appearance
   - Replace placeholder text with your data
   - Insert plots in designated figure positions
   - Update tables with quantitative results

4. **Quality Check**:
   - Verify all subject information
   - Check figure numbering and captions
   - Proofread interpretation sections
   - Ensure all tables are complete

5. **Export Final Report**:
   - Save as PDF for distribution
   - Keep .docx version for future edits
   - Archive with raw data files

#### Report Writing Tips

**For PSD Comparison Plots**:
```
Figure 1: Power Spectral Density Comparison
Multi-trace PSD comparison showing pre-stimulation (blue) and
post-stimulation (red) recordings from channel O1. Analysis performed
using Welch method (4-second windows, 50% overlap). Alpha peak detected
at 10.2 Hz (pre) and 10.5 Hz (post), indicating [interpretation].
Gamma peak at 40.1 Hz visible only post-stimulation (SNR = 4.2 dB),
confirming successful SSVEP entrainment.
```

**For SSVEP Results**:
```
SSVEP analysis revealed high-confidence 40 Hz entrainment across all
occipital channels (O1, O2, Oz). Mean SNR = 3.8 dB (±0.6 SD). PCA
analysis explained 82% of variance in first 5 components. Results
indicate robust gamma-band response to auditory stimulation.
```

**For FOOOF Results**:
```
FOOOF analysis identified a dominant alpha peak at 10.2 Hz (bandwidth:
2.1 Hz, power: 1.8 above aperiodic). Aperiodic exponent = -1.2,
consistent with healthy adult norms. No significant beta or gamma
peaks detected during resting state.
```

### Automated Report Features (Future)

*Note: Full automated report generation is planned for future releases*

Planned features:
- One-click report generation from analysis results
- Automatic figure insertion and numbering
- Template customization for different use cases
- PDF export with embedded plots
- Multi-session comparison tables

---

## Tips and Best Practices

### Data Quality

1. **Check Signal Quality First**:
   - View raw signals before analysis
   - Identify and note artifacts (movement, eye blinks)
   - Consider excluding bad segments using time windows

2. **Sampling Rate Considerations**:
   - For 40 Hz SSVEP: minimum 200 Hz sampling rate
   - Higher sampling rates allow analysis of higher frequencies
   - Nyquist frequency = sampling_rate / 2

3. **Channel Selection**:
   - **Occipital channels (O1, O2, Oz)**: Visual processing, alpha rhythm
   - **Frontal channels (Fp1, Fp2)**: Prefrontal activity, susceptible to eye artifacts
   - **Central channels (C3, C4, Cz)**: Motor cortex, sensorimotor rhythms

### Analysis Parameters

**PSD Window Length**:
- Shorter (1-2s): Better time resolution, noisier frequency estimates
- Longer (4-8s): Better frequency resolution, smoother estimates
- **Recommendation**: 4s for most applications

**Frequency Range**:
- **0.5-4 Hz**: Delta (sleep, deep states)
- **4-8 Hz**: Theta (drowsiness, meditation)
- **8-12 Hz**: Alpha (relaxed wakefulness, eyes closed)
- **12-30 Hz**: Beta (active thinking, focus)
- **30-50 Hz**: Gamma (sensory processing, SSVEP)

**Alpha Peak Detection**:
- Works best on **resting-state, eyes-closed** data
- **Occipital channels** show strongest alpha
- May fail if subject has weak or no alpha rhythm

**Gamma Peak Detection**:
- Designed for **SSVEP experiments** (40 Hz stimulation)
- Requires **stimulation period** in recording
- SNR calculation needs clean baseline

### Comparison Best Practices

1. **Limit Trace Count**: 2-4 traces for clarity, up to 6 maximum
2. **Consistent Parameters**: Use same PSD settings across comparisons
3. **Color Choice**: High contrast colors for adjacent traces
4. **Time Matching**: Compare equivalent time segments when possible

### Troubleshooting

**"Alpha peaks not detected"**:
- Verify subject had eyes closed during recording
- Try different channels (O1, O2, Oz)
- Check if subject has naturally weak alpha rhythm
- Ensure frequency range includes 8-12 Hz

**"Gamma peak not found"**:
- Verify stimulation was active during recorded segment
- Check time window includes stimulation period
- Confirm stimulation frequency matches target (40 Hz)
- Try different channels

**"Plot is too noisy"**:
- Increase window length (e.g., 4s → 8s)
- Increase overlap (50% → 75%)
- Use Welch method instead of periodogram
- Check for artifacts in raw signal

**"Annotations overlap"**:
- Reduce number of traces
- This should be minimized in latest version with improved positioning
- Use dB scale to compress dynamic range

**"Processing is slow"**:
- Large files (>50 MB) may take several minutes
- Browser Python mode: First load includes package download
- Reduce time window to analyze shorter segments
- Consider using fewer PCA components for SSVEP

### File Organization

Recommended folder structure for projects:
```
Project_Name/
├── raw_data/
│   ├── subject_01_baseline.edf
│   ├── subject_01_stimulation.edf
│   └── ...
├── analysis_results/
│   ├── psd_comparisons/
│   │   ├── subject_01_pre_post.png
│   │   └── ...
│   ├── ssvep_results/
│   │   └── ...
│   └── fooof_results/
│       └── ...
└── reports/
    ├── subject_01_report.docx
    ├── subject_01_report.pdf
    └── ...
```

---

## Additional Resources

### Understanding EEG Rhythms

- **Delta (0.5-4 Hz)**: Deep sleep, unconsciousness
- **Theta (4-8 Hz)**: Light sleep, drowsiness, meditation
- **Alpha (8-12 Hz)**: Relaxed wakefulness, eyes closed
- **Beta (12-30 Hz)**: Active thinking, concentration, anxiety
- **Gamma (30-100 Hz)**: Sensory processing, cognition, SSVEP

### Common Artifacts

- **Eye blinks**: Sharp spikes in frontal channels (Fp1, Fp2)
- **Muscle tension**: High-frequency noise (>30 Hz)
- **Movement**: Large amplitude, slow drifts
- **Electrode issues**: Flat line, extreme values, sudden jumps

### Quality Control Checklist

- [ ] Signal appears clean in raw viewer
- [ ] No flat-lining or disconnected channels
- [ ] Minimal eye blink artifacts in time window
- [ ] Appropriate channels selected for analysis
- [ ] Sampling rate sufficient for frequency of interest
- [ ] PSD parameters appropriate for data
- [ ] Results make sense physiologically
- [ ] Annotations clearly visible and non-overlapping
- [ ] Figures labeled and captioned in report
- [ ] Report proofread and quality checked

---

## Support and Feedback

For technical support, bug reports, or feature requests:
- Check documentation in repository
- Review example analyses
- Contact Optoceutics support team

---

**Document Version**: 1.0
**Last Updated**: November 2024
**Platform Version**: Compatible with latest master branch

---

*This guide is part of the Optoceutics EEG Analysis Platform. For technical documentation, see README.md and other project documentation files.*
