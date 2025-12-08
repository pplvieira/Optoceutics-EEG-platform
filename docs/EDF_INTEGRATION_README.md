# EEG Platform - EDF File Processing Integration

This guide covers the complete EDF file processing integration that has been added to your EEG platform, including Django backend setup and frontend components.

## 🎯 What Has Been Implemented

### Backend (Django + Python)
✅ **Complete Django backend** with EDF processing capabilities
✅ **MNE-Python integration** for EEG signal processing
✅ **File upload system** with drag & drop support
✅ **Metadata extraction** from EDF/BDF files
✅ **Signal analysis tools**: PSD, SNR, ICA
✅ **Signal processing operations**: filtering, channel management
✅ **File export functionality** for processed EDF files
✅ **REST API endpoints** for frontend integration

### Frontend (Next.js + React)
✅ **Drag & drop file upload** component
✅ **Analysis Tools tab** with EDF processing
✅ **Signal Processing tab** with preprocessing tools
✅ **Real-time visualization** of analysis results
✅ **File management interface**
✅ **Interactive parameter controls**

## 🚀 Quick Start Guide

### 1. Install Dependencies

```bash
# Install Node.js dependencies (includes concurrently for running both servers)
npm install

# Install Python dependencies for Django backend
npm run backend:install
```

### 2. Setup Backend Database

```bash
# Initialize Django database
npm run backend:migrate

# Optional: Create admin user for Django admin interface
npm run backend:admin
```

### 3. Start Development Servers

**Option A: Start both servers simultaneously**
```bash
npm run dev:full
```

**Option B: Start servers separately**
```bash
# Terminal 1: Start Next.js frontend (port 3001)
npm run dev

# Terminal 2: Start Django backend (port 8000)
npm run backend:dev
```

### 4. Access the Application

- **Frontend**: http://localhost:3001 (or 3000 if port 3000 is available)
- **Backend API**: http://localhost:8000/api/
- **Django Admin**: http://localhost:8000/admin/ (if admin user created)

## 📁 Project Structure

```
eeg-platform/
├── app/                          # Next.js frontend
│   ├── components/              
│   │   ├── EDFUpload.tsx        # File upload component
│   │   ├── EDFAnalysis.tsx      # Analysis interface
│   │   └── EDFSignalProcessing.tsx # Signal processing tools
│   └── page.tsx                 # Main application (updated)
│
├── backend/                     # Django backend
│   ├── eeg_backend/            # Django project settings
│   ├── edf_processor/          # Main EDF processing app
│   │   ├── models.py           # Database models
│   │   ├── views.py            # API endpoints
│   │   ├── serializers.py      # Data serialization
│   │   ├── edf_utils.py        # EDF processing utilities
│   │   └── urls.py             # URL routing
│   ├── requirements.txt        # Python dependencies
│   └── README.md               # Backend documentation
│
└── package.json                # Updated with backend scripts
```

## 🔧 Key Features

### File Upload & Management
- **Drag & drop interface** for EDF/BDF files
- **Automatic metadata extraction** (channels, sampling rate, duration)
- **File validation** and size limits (100MB max)
- **Progress indicators** and error handling

### Analysis Tools (Analysis Tools Tab)
- **Raw signal plotting** with customizable time windows
- **Power Spectral Density (PSD)** analysis
- **Signal-to-Noise Ratio (SNR)** computation  
- **Independent Component Analysis (ICA)**
- **Interactive parameter controls**
- **Base64 image plots** displayed in browser

### Signal Processing (Signal Processing Tab)
- **Frequency filtering** (bandpass, highpass, lowpass)
- **Channel management** (reject bad channels, rename channels)
- **Artifact removal** preparation (ICA-based)
- **Processed file export** as new EDF files
- **Session tracking** for processing operations

### API Endpoints

#### EDF File Operations
```
POST /api/edf-files/upload/              # Upload EDF files
GET  /api/edf-files/                     # List files
GET  /api/edf-files/{id}/metadata/       # Get metadata
POST /api/edf-files/{id}/plot_raw/       # Plot raw signals
POST /api/edf-files/{id}/analyze/        # Perform analysis
POST /api/edf-files/{id}/process_signal/ # Apply processing
GET  /api/edf-files/{id}/download_processed/ # Download processed files
```

## 🧠 Python Libraries Used

The backend leverages these key libraries:
- **MNE-Python 1.5.1**: Primary EEG/MEG analysis library
- **Django 4.2.7**: Web framework and API
- **Django REST Framework**: API development
- **PyEDFLib**: EDF file I/O operations
- **NumPy & SciPy**: Numerical computing
- **Matplotlib**: Signal plotting and visualization
- **Scikit-learn**: Machine learning algorithms (ICA)
- **Pandas**: Data manipulation

## 💡 Usage Instructions

### Developer Mode - Analysis Tools Tab

1. **Upload EDF Files**: Drag & drop EDF/BDF files into the upload area
2. **Select File**: Choose a file from the uploaded list for analysis
3. **View Metadata**: Click "Load Metadata" to see file information
4. **Plot Raw Signal**: Generate time-series plots of EEG channels
5. **Run Analysis**: Use buttons for PSD, SNR, or ICA analysis
6. **View Results**: Analysis plots and data appear below

### Developer Mode - Signal Processing Tab

1. **Upload EDF Files**: Same drag & drop interface
2. **Select File**: Choose file for processing operations
3. **Apply Filters**: Set frequency ranges and apply bandpass filters
4. **Manage Channels**: Reject bad channels or rename them
5. **Download Results**: Export processed EDF files
6. **Track Sessions**: View processing history in Django admin

## 🎨 Frontend Integration Details

### Component Architecture
- **EDFUpload**: Reusable drag & drop upload component
- **EDFAnalysis**: Analysis interface with plot display
- **EDFSignalProcessing**: Signal processing tools interface
- **Updated page.tsx**: Integrated components into existing tabs

### State Management
- **File state**: Tracks uploaded files across components
- **Selected file**: Currently active file for operations
- **Loading states**: Per-operation loading indicators
- **Error handling**: User-friendly error messages

### Styling
- **Dark mode support**: Consistent with existing theme
- **Responsive design**: Works on different screen sizes
- **Interactive elements**: Hover states and transitions
- **Color coding**: Status indicators and file types

## 🔮 Future Enhancements Ready for Development

### Planned Features (Backend Foundation Ready)
- **Real-time EEG streaming** support
- **Advanced artifact removal** algorithms
- **Machine learning model** integration
- **Multi-user collaboration** features
- **Cloud storage** integration
- **Batch processing** capabilities

### Extensibility Points
- **Custom analysis plugins**: Easy to add new analysis types
- **Processing pipelines**: Chain multiple operations
- **Export formats**: Additional file format support
- **Visualization options**: More plot types and interactions

## 🚨 Important Notes

### Requirements
- **Python 3.9+** (for MNE-Python compatibility)
- **Node.js 18+** (for Next.js 15)
- **Sufficient RAM**: Large EDF files require memory
- **File permissions**: Ensure write access for uploads

### Development Tips
- Backend runs on **port 8000**, frontend on **port 3001/3000**
- Use **Django admin** at `/admin/` for data inspection
- Check browser console for frontend errors
- Monitor Django console for backend errors
- Files stored in `backend/media/` directory

### Deployment Considerations
- Configure **CORS settings** for production domains
- Set **SECRET_KEY** for Django production
- Configure **file storage** (local vs cloud)
- Set up **database** (PostgreSQL for production)
- Consider **containerization** with Docker

This implementation provides a solid foundation for EEG data analysis with room for extensive customization and feature additions. The modular architecture makes it easy to extend with additional analysis methods and signal processing techniques.