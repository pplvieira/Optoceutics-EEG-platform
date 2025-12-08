# Architecture Documentation

## System Architecture Overview

The EEG Platform implements a **hybrid multi-architecture** design that supports three primary operational modes, each optimized for different use cases.

## Architecture Modes

### 1. Browser Python Mode (Primary)

**Technology Stack:**
- Pyodide 0.24.1/0.26.4 (WebAssembly Python runtime)
- Next.js 15.5.2 frontend
- Zero backend dependencies

**Architecture Diagram:**
```
┌─────────────────────────────────────────┐
│         User's Browser                  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Next.js React Application      │  │
│  │   (PyodideEDFProcessor.tsx)      │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│  ┌──────────────▼───────────────────┐  │
│  │   Pyodide Runtime (WebAssembly)   │  │
│  │   - Python 3.11                  │  │
│  │   - NumPy, SciPy, matplotlib     │  │
│  │   - pyedflib/MNE-Python          │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│  ┌──────────────▼───────────────────┐  │
│  │   EDF File (Local Memory)         │  │
│  │   - Never uploaded               │  │
│  │   - Processed in browser         │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Results Visualization           │  │
│  │   - Plotly.js / Recharts         │  │
│  │   - Base64 PNG images             │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Key Characteristics:**
- ✅ **Zero Server Costs**: Runs entirely in browser
- ✅ **Complete Privacy**: Files never leave device
- ✅ **No Size Limits**: Limited only by browser memory
- ✅ **Instant Deployment**: Static hosting (Vercel, Netlify)
- ⚠️ **Initial Load Time**: 30-90 seconds first load
- ⚠️ **Memory Intensive**: Can use 500MB+ for large files

**File Flow:**
1. User selects EDF file via file input
2. File read as `ArrayBuffer` in JavaScript
3. Converted to `Uint8Array`
4. Passed to Pyodide via `globals.set()`
5. Python converts to `bytes` object
6. EDF library reads file (pyedflib/MNE/pure Python)
7. Analysis executed in Python
8. Results serialized to JSON
9. Plots encoded as base64 PNG
10. React components render results

### 2. Local Backend Mode (Optional)

**Technology Stack:**
- FastAPI (Python) backend
- Next.js frontend
- Session-based file storage

**Architecture Diagram:**
```
┌─────────────────────────────────────────┐
│         User's Browser                  │
│  ┌──────────────────────────────────┐  │
│  │   Next.js React Application      │  │
│  │   (ComprehensiveEDFDashboard)    │  │
│  └──────────────┬───────────────────┘  │
└─────────────────┼───────────────────────┘
                  │ HTTP/REST API
                  │ (localhost:8000)
┌─────────────────▼───────────────────────┐
│      FastAPI Backend (Python)            │
│  ┌──────────────────────────────────┐   │
│  │   FastAPI Server                 │   │
│  │   - /upload                      │   │
│  │   - /analyze                     │   │
│  │   - /analyze-ssvep               │   │
│  │   - /channels/{file_id}          │   │
│  └──────────────┬───────────────────┘   │
│                 │                       │
│  ┌──────────────▼───────────────────┐   │
│  │   Temporary File Storage         │   │
│  │   (Session-based, in-memory)     │   │
│  └──────────────┬───────────────────┘   │
│                 │                       │
│  ┌──────────────▼───────────────────┐   │
│  │   Analysis Engine                │   │
│  │   - pyedflib                     │   │
│  │   - NumPy, SciPy                 │   │
│  │   - scikit-learn                 │   │
│  │   - matplotlib                   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key Characteristics:**
- ✅ **Faster Processing**: Native Python (no WebAssembly overhead)
- ✅ **Better Memory Management**: Server-side resources
- ✅ **Larger File Support**: More reliable for 100MB+ files
- ⚠️ **Requires Backend**: Must run Python server
- ⚠️ **Network Dependency**: Requires localhost connection
- ⚠️ **Session-Based**: Files deleted when session ends

**API Endpoints:**
- `POST /upload` - Upload EDF file, returns metadata
- `POST /analyze` - Run analysis on uploaded file
- `POST /analyze-ssvep` - Comprehensive SSVEP analysis
- `GET /channels/{file_id}` - Get channel information
- `DELETE /files/{file_id}` - Clean up file

### 3. SSVEP Analysis Tool (Specialized)

**Technology Stack:**
- Pyodide for EDF processing
- Custom Python analysis scripts
- CSV annotation parsing

**Architecture Diagram:**
```
┌─────────────────────────────────────────┐
│   SSVEP Analysis Workflow                │
│                                         │
│  Step 1: File Upload                    │
│  ├── EDF Files (multiple)              │
│  └── CSV Files (annotations)            │
│                                         │
│  Step 2: File Pairing                  │
│  ├── Match EDF ↔ CSV                   │
│  └── Validate pairs                     │
│                                         │
│  Step 3: Synchronization               │
│  ├── Extract timestamps                 │
│  ├── Calculate sync offset             │
│  └── Align stimulation periods          │
│                                         │
│  Step 4: Analysis                      │
│  ├── Extract stimulation segments       │
│  ├── Compute PSD per period            │
│  ├── Calculate SNR                     │
│  └── Generate visualizations            │
│                                         │
│  Step 5: Results                        │
│  ├── Per-experiment results             │
│  ├── Summary statistics                │
│  └── Comprehensive plots               │
└─────────────────────────────────────────┘
```

**Key Features:**
- Multi-file batch processing
- Time synchronization between EDF and annotations
- Stimulation period extraction
- Batch analysis across experiments
- Comprehensive reporting

## Component Architecture

### Frontend Components

```
app/
├── page.tsx                    # Main entry, mode router
├── components/
│   ├── PyodideEDFProcessor.tsx    # Browser Python mode (4,287 lines)
│   ├── ComprehensiveEDFDashboard.tsx  # Local backend mode (831 lines)
│   ├── SSVEPAnalysisTool.tsx      # SSVEP specialized tool (2,737 lines)
│   ├── EDFViewerTool.tsx          # EDF viewer (disabled)
│   ├── P300Experiment.tsx         # P300 experiment component
│   ├── AuditoryStimulus40Hz.tsx    # 40Hz auditory stimulus
│   └── QuestionnaireSystem.tsx     # Questionnaire management
├── services/
│   └── pdfExporter.ts             # PDF/DOCX report generation
├── types/
│   └── edf.ts                     # TypeScript interfaces
└── utils/
    └── experimentDatabase.ts      # In-memory experiment storage
```

### Backend Components

```
python-backend/
├── main.py                    # FastAPI server + analysis
└── requirements.txt           # Python dependencies
```

### Public Assets

```
public/
├── pyodide-packages/          # Custom Python wheels
│   └── resutil-0.4.0-py3-none-any.whl
├── ssvep_analysis.py          # SSVEP analysis script (Pyodide)
├── questionnaires/            # JSON questionnaire definitions
└── assets/                   # Images, logos
```

## Data Flow

### Browser Python Mode Data Flow

```
User Action: Select EDF File
    ↓
File Input Handler
    ↓
Read as ArrayBuffer
    ↓
Convert to Uint8Array
    ↓
Pyodide.globals.set('js_uint8_array', uint8Array)
    ↓
Python: bytes(js_uint8_array)
    ↓
EDF Library (pyedflib/MNE/pure Python)
    ↓
Extract Metadata & Signal Data
    ↓
Analysis Functions (Python)
    ↓
Results Dictionary
    ↓
JSON Serialization
    ↓
Base64 Plot Encoding
    ↓
React State Update
    ↓
Component Re-render
    ↓
Visualization Display
```

### Local Backend Mode Data Flow

```
User Action: Upload EDF File
    ↓
FormData Creation
    ↓
POST /upload (Axios)
    ↓
FastAPI Receives File
    ↓
Temporary File Storage
    ↓
Extract Metadata (pyedflib)
    ↓
Return File ID + Metadata
    ↓
User Selects Analysis
    ↓
POST /analyze-ssvep
    ↓
FastAPI Analysis Engine
    ↓
Python Processing
    ↓
Base64 Plot Generation
    ↓
JSON Response
    ↓
React State Update
    ↓
Visualization Display
```

## State Management

### Current Approach
- React `useState` hooks for local component state
- No global state management library
- Props drilling for shared state
- In-memory database for experiments (`experimentDatabase.ts`)

### State Structure Example (PyodideEDFProcessor)

```typescript
// File state
const [currentFile, setCurrentFile] = useState<File | null>(null);
const [metadata, setMetadata] = useState<EDFMetadata | null>(null);

// Pyodide state
const [pyodideReady, setPyodideReady] = useState(false);
const [pyodideLoading, setPyodideLoading] = useState(false);

// Analysis state
const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
const [isAnalyzing, setIsAnalyzing] = useState(false);

// UI state
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState<string | null>(null);
const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
```

## Security Architecture

### Browser Python Mode
- ✅ **No Data Transmission**: Files never leave device
- ✅ **No Server Storage**: No persistent storage
- ✅ **Memory-Only**: Files cleared on page refresh
- ⚠️ **CDN Dependencies**: Pyodide loaded from jsDelivr CDN

### Local Backend Mode
- ✅ **CORS Protection**: Configured for localhost only
- ✅ **Session-Based**: Files deleted after processing
- ✅ **No Authentication**: Local use only (by design)
- ⚠️ **Temporary Files**: Stored in system temp directory

## Performance Considerations

### Browser Python Mode
- **Initial Load**: 30-90 seconds (one-time)
- **File Processing**: 5-120 seconds (depends on size)
- **Memory Usage**: 50-500MB+ (depends on file size)
- **Optimization**: Lazy loading, Web Workers (not yet implemented)

### Local Backend Mode
- **Initial Load**: Instant (backend already running)
- **File Processing**: 1-60 seconds (faster than browser)
- **Memory Usage**: Server-side (better management)
- **Optimization**: Native Python performance

## Deployment Architecture

### Recommended: Vercel (Frontend Only)

```
┌─────────────────────────────────────────┐
│         Vercel CDN                      │
│  ┌──────────────────────────────────┐  │
│  │   Next.js Static Export          │  │
│  │   - Browser Python Mode          │  │
│  │   - Pyodide from CDN             │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Benefits:**
- Zero cost (free tier)
- Global CDN
- Automatic HTTPS
- Easy deployment

### Optional: Hybrid Deployment

```
┌─────────────────────────────────────────┐
│         Vercel (Frontend)               │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Render.com (Backend)              │
│  ┌──────────────────────────────────┐  │
│  │   FastAPI Server                  │  │
│  │   - Free tier (750 hrs/month)     │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Technology Decisions

### Why Pyodide?
- ✅ Full Python scientific stack in browser
- ✅ No server required
- ✅ Complete privacy
- ✅ Standard Python libraries

### Why FastAPI for Backend?
- ✅ Modern Python async framework
- ✅ Automatic API documentation
- ✅ Type validation with Pydantic
- ✅ Easy to deploy

### Why Next.js?
- ✅ React framework with SSR/SSG
- ✅ Easy deployment (Vercel)
- ✅ Good TypeScript support
- ✅ Modern tooling

## Future Architecture Considerations

### Potential Improvements
1. **Web Workers**: Move heavy computation to background threads
2. **IndexedDB Caching**: Cache Pyodide and processed files
3. **Streaming Processing**: Process large files in chunks
4. **Service Worker**: Offline support
5. **State Management**: Consider Zustand or Redux for complex state

### Scalability
- **Current**: Single-user, browser-based
- **Future**: Could add user authentication and cloud storage (optional)
- **Limitation**: Browser memory constraints for very large files

---

**Last Updated:** December 2024

