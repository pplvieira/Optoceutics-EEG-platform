# Python EDF Processing Backend

Local FastAPI backend for processing EDF files with full Python scientific computing capabilities.

## Features

- **No size limits** - Process files of any size locally
- **Full Python ecosystem** - scipy, matplotlib, numpy, pyedflib
- **Local processing only** - Files never leave your machine
- **Session-based** - Temporary file handling with automatic cleanup
- **CORS enabled** - Works with Next.js frontend on localhost:3000

## Quick Start

### Windows
```bash
cd python-backend
start.bat
```

### macOS/Linux  
```bash
cd python-backend
chmod +x start.sh
./start.sh
```

### Manual Setup
```bash
cd python-backend
pip install -r requirements.txt
python main.py
```

The backend will start on `http://localhost:8000`

## API Endpoints

### File Upload
- `POST /upload` - Upload EDF file for processing
- Returns metadata including channels, duration, sampling frequency

### Analysis
- `POST /analyze` - Perform analysis on uploaded file
  - `plot_raw` - Plot raw EEG signals
  - `psd` - Power Spectral Density analysis
  - `snr` - Signal-to-Noise Ratio computation

### File Management
- `GET /files` - List uploaded files
- `DELETE /files/{file_id}` - Clean up specific file

### Health Check
- `GET /` - Backend status

## Usage with Frontend

1. Start the Python backend: `python main.py`
2. Start the Next.js frontend: `npm run dev`
3. Use the LocalEDFUpload component instead of VercelEDFUpload
4. Upload and analyze EDF files locally without size limits

## Dependencies

- **FastAPI** - Modern Python web framework
- **pyedflib** - EDF file reading/writing
- **numpy** - Numerical computing
- **scipy** - Scientific computing
- **matplotlib** - Plotting and visualization
- **uvicorn** - ASGI server

## File Processing Flow

1. Upload EDF file via multipart form data
2. Save to temporary file with unique ID
3. Extract metadata using pyedflib
4. Store file path for analysis requests
5. Perform analysis and return results with plots
6. Clean up temporary files when done