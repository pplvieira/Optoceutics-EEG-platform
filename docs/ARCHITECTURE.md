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

**File Flow (Refactored):**
1. User selects EDF file via `FileUpload` component
2. File read as `ArrayBuffer` in JavaScript
3. Converted to `Uint8Array`
4. `useMultiFileManager` hook manages file state
5. `reloadActiveFile()` from `usePyodide` hook transfers file to Python
6. Python converts to `bytes` object
7. EDF library reads file (pyedflib/MNE/pure Python)
8. Analysis executed via `useAnalysis` hook
9. Results serialized to JSON
10. Plots encoded as base64 PNG
11. React components render results via `ResultsDisplay` component

**Python Environment Setup Flow:**
1. `usePyodide` hook initializes Pyodide runtime
2. `setupPythonEnvironment()` installs packages:
   - Core: NumPy, SciPy, matplotlib, scikit-learn, micropip
   - EDF libraries: MNE, pyedflib (with pure Python fallback)
   - Custom: resutil (multi-stage fallback), FOOOF
3. External Python modules loaded:
   - `fooof_analysis.py`
   - `comparison_psd.py`
   - `edf_analysis_code.py` (~1860 lines of Python code)
   - `resutil_oc.py`
4. Python helper functions set up in global scope
5. Component ready for analysis

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
- **Custom React Hooks** for modular state management
- React `useState` hooks for local component state
- No global state management library
- Props drilling minimized through hook composition
- In-memory database for experiments (`experimentDatabase.ts`)

### Modular Hook Architecture

The application uses a **hook-based architecture** for state management and logic separation:

#### Core Hooks

**`usePyodide`** - Pyodide Runtime Management
- Manages Pyodide initialization
- Handles Python environment setup
- Manages package installation
- Provides file reloading functionality

**`useMultiFileManager`** - Multi-File Management
- Manages multiple loaded EDF files
- Handles file switching and selection
- Manages file nicknames
- Provides current file and metadata access

**`useAnalysis`** - Analysis Execution
- Manages analysis execution
- Stores analysis results
- Tracks analysis progress
- Handles analysis errors

**`useAnnotations`** - Annotation Management
- Loads annotations from EDF files
- Manages custom annotations
- Handles annotation updates
- Calculates real-world time

**`useChannelManager`** - Channel Management
- Manages channel selection
- Handles channel renaming
- Provides display name mapping
- Supports modified EDF download

**`useTimeFrame`** - Time Frame Selection
- Manages time frame start/end
- Validates time ranges
- Calculates durations
- Converts to real-world time

**`useEDFFile`** - EDF File Loading (Created, pending integration)
- Handles EDF file reading
- Extracts metadata
- Manages file state

### State Structure Example (PyodideEDFProcessor - Refactored)

```typescript
// Pyodide state (via usePyodide hook)
const {
  pyodide,
  pyodideReady,
  pyodideLoading,
  setupPythonEnvironment,
  reloadActiveFile
} = usePyodide();

// File state (via useMultiFileManager hook)
const {
  loadedFiles,
  activeFileId,
  currentFile,
  metadata,
  switchToFile,
  removeFile
} = useMultiFileManager();

// Analysis state (via useAnalysis hook)
const {
  analysisResults,
  ssvepResult,
  isAnalyzing,
  runAnalysis,
  runSSVEPAnalysis
} = useAnalysis();

// Annotation state (via useAnnotations hook)
const {
  annotations,
  addCustomAnnotation,
  updateAnnotation
} = useAnnotations();

// Channel state (via useChannelManager hook)
const {
  selectedChannels,
  channelRenameMap,
  renameChannel,
  getDisplayName
} = useChannelManager();

// Time frame state (via useTimeFrame hook)
const {
  timeFrameStart,
  timeFrameEnd,
  useTimeFrame,
  setTimeFrameStart,
  setTimeFrameEnd
} = useTimeFrame(metadata?.duration_seconds || 0);

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

