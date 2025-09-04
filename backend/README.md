# EEG Platform Django Backend

This Django backend provides EDF file processing capabilities for the EEG Platform, including:

- EDF/BDF file upload and metadata extraction
- Raw signal visualization
- Signal analysis (PSD, SNR, ICA)
- Signal processing operations (filtering, channel management)
- File export capabilities

## Quick Setup

### 1. Install Python Dependencies

```bash
# Navigate to backend directory
cd backend

# Install required packages
pip install -r requirements.txt
```

### 2. Initialize Database

```bash
# Run database migrations
python manage.py migrate

# Create admin user (optional)
python manage.py createsuperuser
```

### 3. Start Development Server

```bash
# Start Django development server
python manage.py runserver 8000
```

The backend will be available at `http://localhost:8000/`

## API Endpoints

### EDF File Management
- `POST /api/edf-files/upload/` - Upload EDF files
- `GET /api/edf-files/` - List uploaded files  
- `GET /api/edf-files/{id}/metadata/` - Get file metadata
- `POST /api/edf-files/{id}/plot_raw/` - Generate raw signal plots

### Analysis Operations
- `POST /api/edf-files/{id}/analyze/` - Perform analysis (PSD, SNR, ICA)
- `GET /api/analysis-results/` - List analysis results

### Signal Processing  
- `POST /api/edf-files/{id}/process_signal/` - Apply signal processing
- `GET /api/edf-files/{id}/download_processed/` - Download processed files
- `GET /api/sessions/` - List processing sessions

## Key Features

### Supported File Formats
- EDF (European Data Format)
- BDF (BioSemi Data Format)
- Maximum file size: 100MB per file

### Analysis Capabilities
- **Power Spectral Density (PSD)**: Frequency domain analysis
- **Signal-to-Noise Ratio (SNR)**: Signal quality assessment  
- **Independent Component Analysis (ICA)**: Source separation
- **Raw Signal Plotting**: Time domain visualization

### Signal Processing Operations
- **Frequency Filtering**: Bandpass, highpass, lowpass filters
- **Channel Management**: Reject bad channels, rename channels
- **Artifact Removal**: Manual and automated artifact detection
- **File Export**: Save processed data as new EDF files

## Python Libraries Used

- **MNE-Python**: Primary EEG/MEG analysis library
- **Django REST Framework**: API development
- **NumPy & SciPy**: Numerical computing
- **Matplotlib**: Plotting and visualization  
- **PyEDFLib**: EDF file I/O operations
- **Scikit-learn**: Machine learning algorithms

## Development Notes

### Model Structure
- `EDFFile`: Stores file metadata and processing status
- `EDFProcessingSession`: Tracks analysis and processing operations
- `EDFAnalysisResult`: Stores analysis results and plots

### Key Utilities (`edf_utils.py`)
- `read_edf_metadata()`: Extract file information
- `load_edf_data()`: Load signal data using MNE
- `plot_raw_signal()`: Generate time series plots
- `compute_psd()`: Power spectral density analysis
- `apply_filter()`: Signal filtering operations

### Admin Interface
Access the Django admin at `http://localhost:8000/admin/` to manage:
- Uploaded EDF files
- Processing sessions  
- Analysis results
- User accounts

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all packages in `requirements.txt` are installed
2. **File Upload Errors**: Check file permissions and MEDIA_ROOT settings
3. **Plot Generation Issues**: Verify matplotlib backend configuration
4. **Memory Issues**: Large EDF files may require increased memory limits

### Performance Tips

- Use file streaming for large EDF files
- Cache frequently accessed analysis results
- Consider using Celery for long-running operations
- Implement pagination for file lists

## Future Enhancements

- Real-time EEG streaming support
- Advanced artifact removal algorithms  
- Machine learning model integration
- Multi-user collaboration features
- Cloud storage integration
- Docker containerization