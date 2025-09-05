# EEG/EDF Analysis Platform

A revolutionary web-based platform for EEG/EDF file analysis with **Python running directly in your browser**. No servers, no uploads, no limits.

## 🚀 NEW: Browser-Based Python Processing

**The breakthrough you've been waiting for:**
- **Full Python stack in browser** - pyedflib, NumPy, SciPy, scikit-learn via WebAssembly
- **No servers required** - Deploy to Vercel, works everywhere
- **No file uploads** - Process files locally, complete privacy
- **No size limits** - Handle 100MB+ files without restrictions
- **Zero setup** - Just open the browser and analyze

## Architecture Options

### 🌐 Browser Python Mode (Recommended)
- **Pyodide/WebAssembly** for full Python in browser
- **Complete scientific stack** - all libraries you need
- **Local file processing** - no network transfer
- **Instant deployment** - works on any static host
- **Maximum privacy** - data never leaves your computer

### 🏠 Local Backend Mode (Alternative)
- **FastAPI/Python** backend for traditional server setup
- **Advanced SSVEP analysis** (40Hz detection, PCA, SNR) 
- **Session-based processing** with temporary storage
- **Full control** over computational resources

### 📊 Developer Mode
- **Multi-mode interface** for developers and researchers
- **Legacy Vercel functions** for comparison
- **Experiment protocols** for structured data collection

## Features

### 🎯 SSVEP Analysis
- **Target frequency detection** (configurable, default 40Hz)
- **Signal-to-noise ratio** calculation with confidence levels
- **PCA-based artifact removal**
- **Comprehensive frequency band analysis**

### 🔬 Advanced Analytics
- **Principal Component Analysis** for noise reduction
- **Power Spectral Density** with Welch's method
- **Time-frequency analysis** and bandpass filtering
- **Multi-channel coherence analysis**

### 📊 Visualization
- **Interactive dashboards** with real-time updates
- **Comprehensive plots** using matplotlib/seaborn
- **Channel-by-channel analysis** results
- **Statistical summaries** and detection confidence

## Quick Start

### 🌐 Browser Python Mode (Recommended)

```bash
# Install dependencies
npm install

# Start development server (or deploy to Vercel)
npm run dev
```

1. Open [http://localhost:3000](http://localhost:3000)
2. Select **"Browser Python"** mode  
3. Wait for Python environment to load (~30 seconds first time)
4. Choose your EDF file - **no upload required!**
5. Run comprehensive SSVEP analysis with full Python stack

**That's it!** No servers, no Python installation, no configuration.

### 🏠 Local Backend Mode (Optional)

If you prefer traditional server setup:

```bash
cd python-backend
pip install -r requirements.txt
python main.py
```

Then select "Local Backend" mode in the interface.

## Usage Guide

### Step 1: Upload EDF File
1. Switch to "Local Backend" mode in the interface
2. Click "Choose EDF/BDF File" and select your file
3. View extracted metadata (channels, duration, sampling rate)

### Step 2: SSVEP Analysis
1. Configure parameters:
   - **Target Frequency**: 40Hz (default, adjustable)
   - **PCA Components**: 5 (default)
   - **Channel Selection**: Auto-detect occipital channels (O1, O2, Oz)
2. Click "Run SSVEP Analysis"
3. Wait for comprehensive analysis (may take 1-5 minutes)

### Step 3: View Results
- **Detection confidence** per channel (high/medium/low)
- **SNR values** and statistical summaries
- **PCA analysis** with variance explained
- **Frequency band distribution** (Delta, Theta, Alpha, Beta, Gamma)

## API Endpoints

- `POST /upload`: Upload EDF/BDF files
- `POST /analyze-ssvep`: Comprehensive SSVEP analysis
- `GET /channels/{file_id}`: Get channel information
- `POST /analyze`: Traditional analysis (PSD, SNR, raw plots)
- `DELETE /files/{file_id}`: Clean up files

## Technical Specifications

### Supported Formats
- **EDF** (European Data Format)
- **BDF** (BioSemi Data Format)

### Analysis Capabilities
- **File Sizes**: Up to 100MB+ (tested)
- **Sampling Rates**: Up to 10kHz
- **Channels**: Unlimited (tested up to 256)
- **Memory Efficient**: Streaming processing

## Dependencies

### Python Backend
- FastAPI, pyedflib, NumPy, SciPy
- scikit-learn, matplotlib, seaborn
- See `python-backend/requirements.txt`

### Frontend
- Next.js 15, React 19, TypeScript
- Tailwind CSS, Axios, Plotly.js
- See `package.json`

## Architecture Benefits

### Local Backend Approach
1. **Full Scientific Stack**: Access to all Python scientific libraries
2. **Large File Support**: No serverless function limitations
3. **Data Privacy**: EEG data stays local
4. **Processing Power**: Complex analysis without timeout constraints

### SSVEP Analysis Features
1. **Research-Grade**: Implements published SSVEP detection algorithms
2. **Artifact Removal**: PCA-based noise reduction
3. **Statistical Validation**: Confidence levels based on SNR thresholds
4. **Comprehensive Reporting**: Multi-panel visualization

## Troubleshooting

### Backend Issues
- **Import Errors**: Check `pip install -r requirements.txt`
- **Port 8000 in use**: Kill existing processes or change port
- **Memory Issues**: Restart backend for very large files

### Frontend Issues
- **CORS Errors**: Ensure backend is running on localhost:8000
- **Upload Failures**: Check file format (EDF/BDF only)
- **Analysis Timeouts**: Normal for large files (up to 10 minutes)

## File Structure

```
eeg-platform/
├── app/
│   ├── components/
│   │   ├── ComprehensiveEDFDashboard.tsx  # Main analysis interface
│   │   └── ...
│   ├── page.tsx                          # Multi-mode application
│   └── types/
├── python-backend/
│   ├── main.py                          # FastAPI server + SSVEP analysis
│   └── requirements.txt
└── api/                                # Legacy serverless functions
```

## Research Applications

- **SSVEP Brain-Computer Interfaces**
- **Cognitive Neuroscience Research**
- **EEG Signal Processing Education**
- **Clinical EEG Analysis Tools**

## Future Enhancements

- Real-time streaming analysis
- Advanced ML models for pattern recognition
- Multi-session comparison tools
- Export capabilities (PDF, CSV)

---

*This platform implements research-grade SSVEP analysis suitable for scientific applications. Ensure compliance with data handling policies when processing EEG data.*

<!-- Build fix commit -->
