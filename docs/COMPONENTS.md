# Component Documentation

## Overview

This document provides detailed documentation for all major components in the EEG Platform.

## Core Components

### 1. PyodideEDFProcessor.tsx

**Location:** `app/components/edf-processor/PyodideEDFProcessor.tsx`  
**Size:** ~3,136 lines (reduced from 4,287+ lines)  
**Purpose:** Main browser-based EDF processing component using Pyodide

#### Refactoring Status
✅ **Significantly refactored** - Python environment setup extracted, UI components integrated, code modularized

#### Key Features
- Pyodide initialization and package management (via `usePyodide` hook)
- EDF file reading (supports multiple libraries)
- Multiple analysis types (SSVEP, PSD, SNR, Theta-Beta, Time-Frequency, FOOOF)
- PDF/DOCX report generation
- Annotation management (via `useAnnotations` hook)
- Channel renaming (via `useChannelManager` hook)
- Multi-file management (via `useMultiFileManager` hook)
- Time frame selection (via `useTimeFrame` hook)

#### Props
None (self-contained component)

#### Hooks Used
The component now uses several custom hooks for modularity:

- **`usePyodide`** - Pyodide initialization, Python environment setup, file reloading
- **`useMultiFileManager`** - Multi-file loading, switching, nickname management
- **`useAnalysis`** - Analysis execution and results management
- **`useAnnotations`** - Annotation loading, custom annotation creation
- **`useChannelManager`** - Channel selection, renaming, display names
- **`useTimeFrame`** - Time frame selection and validation
- **`useEDFFile`** - EDF file loading (created but not yet fully integrated)

#### Components Used
The component uses several sub-components for UI:

- **`FileUpload`** - File upload UI with drag & drop
- **`MetadataDisplay`** - File metadata display
- **`ChannelSelector`** - Channel selection UI
- **`TimeFrameSelector`** - Time frame selection UI
- **`AnnotationPanel`** - Annotation management UI
- **`MultiFileListPanel`** - Multi-file list management
- **`ChannelRenamePopup`** - Channel renaming popup
- **`PlotSelectionPanel`** - Plot selection for reports
- **`ReportGenerationPanel`** - Report generation UI

#### State Management
State is now managed through hooks:
- Pyodide state: `usePyodide` hook
- File state: `useMultiFileManager` hook
- Analysis state: `useAnalysis` hook
- Annotation state: `useAnnotations` hook
- Channel state: `useChannelManager` hook
- Time frame state: `useTimeFrame` hook

#### Key Functions

##### Python Environment Setup
**Now handled by `usePyodide` hook:**
- `setupPythonEnvironment()` - Sets up Python environment, installs packages, loads modules
- `reloadActiveFile()` - Transfers active file data to Python environment

**Process:**
1. Load Pyodide from CDN
2. Install core packages (NumPy, SciPy, matplotlib, scikit-learn, micropip)
3. Install EDF libraries (MNE, pyedflib) with fallback to pure Python
4. Install resutil (multi-stage fallback)
5. Install FOOOF
6. Load external Python modules (fooof_analysis.py, comparison_psd.py, edf_analysis_code.py, resutil_oc.py)
7. Set up Python helper functions (~1860 lines of Python code)

##### `handleFileSelect(file: File)`
Processes selected EDF file.

**Process:**
1. Validate file type (.edf, .bdf, .fif)
2. Read file as ArrayBuffer
3. Convert to Uint8Array
4. Pass to Pyodide via `reloadActiveFile()`
5. Execute Python EDF reading function
6. Extract metadata
7. Update component state

**Parameters:**
- `file`: File - The EDF file to process

##### `runTraditionalAnalysis(analysisType: string)`
Executes traditional analysis on loaded file.

**Supported Analysis Types:**
- `raw_signal`: Plot raw EEG signal
- `psd`: Power Spectral Density
- `snr`: Signal-to-Noise Ratio
- `theta_beta_ratio`: Theta/Beta ratio calculation
- `time_frequency`: Time-frequency analysis
- `fooof`: FOOOF spectral parameterization

**Parameters:**
- `analysisType`: string - Type of analysis to perform

**Returns:** Promise<void> (results stored in `useAnalysis` hook state)

##### `runSSVEPAnalysis()`
Executes comprehensive SSVEP analysis.

**Process:**
1. Validates file and channels
2. Calls Python SSVEP analysis function
3. Processes results (40Hz detection, PCA, SNR, frequency bands)
4. Updates SSVEP results state

**Returns:** Promise<void> (results stored in `useAnalysis` hook state)

#### Analysis Parameters

##### Raw Signal Plot
```typescript
{
  duration: number;      // Duration in seconds
  start_time: number;   // Start time in seconds
  channels: number[];   // Channel indices
}
```

##### PSD Analysis
```typescript
{
  fmin: number;         // Minimum frequency (Hz)
  fmax: number;         // Maximum frequency (Hz)
  method: 'welch' | 'periodogram';
  nperseg_seconds?: number;  // Window length in seconds
  noverlap_proportion?: number;  // Overlap proportion
  window?: 'hann' | 'boxcar';
  use_db?: boolean;    // Use decibel scale
}
```

##### SSVEP Analysis
```typescript
{
  target_frequency: number;  // Target frequency (Hz), default 40
  pca_components: number;   // Number of PCA components, default 5
  frequency_bands: number[]; // [8, 12, 30, 100]
}
```

#### Usage Example
```typescript
// Component is self-contained, no props needed
<PyodideEDFProcessor />
```

#### Dependencies
- Pyodide runtime (loaded from CDN)
- Python packages: NumPy, SciPy, matplotlib, scikit-learn
- EDF libraries: pyedflib, MNE-Python, or pure Python fallback

---

### 2. ComprehensiveEDFDashboard.tsx

**Location:** `app/components/ComprehensiveEDFDashboard.tsx`  
**Size:** 831 lines  
**Purpose:** Local backend integration dashboard

#### Key Features
- File upload to FastAPI backend
- Channel selection UI
- Multiple analysis types
- Results visualization
- SSVEP analysis integration

#### Props
None (self-contained component)

#### State Management
- `currentFile`: EDFMetadata | null
- `channels`: Channel info | null
- `analysisResults`: AnalysisResult[]
- `ssvepResults`: SSVEPAnalysisResult | null
- `isUploading`: boolean
- `isAnalyzing`: boolean

#### Key Functions

##### `handleFileUpload(file: File)`
Uploads file to FastAPI backend.

**Process:**
1. Validate file type
2. Create FormData
3. POST to `/upload`
4. Receive file metadata
5. Fetch channel information
6. Update state

**Parameters:**
- `file`: File - EDF file to upload

##### `performAnalysis(analysisType: string, parameters: object)`
Sends analysis request to backend.

**Process:**
1. Validate file is loaded
2. POST to `/analyze` with file_id and parameters
3. Receive results (base64 plot + data)
4. Update analysis results state

**Parameters:**
- `analysisType`: string - Type of analysis
- `parameters`: object - Analysis parameters

##### `performSSVEPAnalysis()`
Executes comprehensive SSVEP analysis.

**Process:**
1. POST to `/analyze-ssvep`
2. Receive comprehensive SSVEP results
3. Update SSVEP results state

#### API Integration

**Base URL:** `http://localhost:8000`

**Endpoints Used:**
- `POST /upload` - Upload EDF file
- `POST /analyze` - Run analysis
- `POST /analyze-ssvep` - SSVEP analysis
- `GET /channels/{file_id}` - Get channels
- `DELETE /files/{file_id}` - Delete file

#### Usage Example
```typescript
<ComprehensiveEDFDashboard />
```

**Note:** Requires FastAPI backend running on localhost:8000

---

### 3. SSVEPAnalysisTool.tsx

**Location:** `app/components/SSVEPAnalysisTool.tsx`  
**Size:** 2,737 lines  
**Purpose:** Specialized SSVEP analysis with CSV annotation support

#### Key Features
- Multi-file upload (EDF + CSV pairs)
- File pairing and synchronization
- Stimulation period extraction
- Batch analysis across experiments
- Comprehensive visualization

#### Props
None (self-contained component)

#### State Management
- `pyodideReady`: boolean
- `edfFiles`: File[]
- `csvFiles`: File[]
- `filePairs`: FilePair[]
- `session`: Session | null
- `currentStep`: 'upload' | 'pairing' | 'sync' | 'manual_adjust' | 'analysis' | 'results'
- `analysisResults`: AnalysisResult[]
- `visualizationResults`: SSVEPVisualizationResult[]

#### Workflow Steps

##### Step 1: Upload
- Upload multiple EDF files
- Upload corresponding CSV annotation files
- Validate file formats

##### Step 2: Pairing
- Match EDF files with CSV files
- Validate pairs
- Create FilePair objects

##### Step 3: Synchronization
- Extract timestamps from EDF and CSV
- Calculate synchronization offset
- Align stimulation periods

##### Step 4: Manual Adjustment (Optional)
- Review synchronization
- Manually adjust time offsets if needed

##### Step 5: Analysis
- Extract stimulation periods
- Compute PSD for each period
- Calculate SNR
- Generate visualizations

##### Step 6: Results
- Display per-experiment results
- Show summary statistics
- Provide comprehensive plots

#### Key Functions

##### `initializePyodide()`
Initializes Pyodide and loads SSVEP analysis script.

##### `pairFiles()`
Pairs EDF files with CSV annotation files.

##### `synchronizeFiles()`
Calculates time synchronization between EDF and CSV.

##### `runAnalysis()`
Executes batch SSVEP analysis across all experiments.

#### Usage Example
```typescript
<SSVEPAnalysisTool />
```

---

### 4. page.tsx

**Location:** `app/page.tsx`  
**Size:** 997 lines  
**Purpose:** Main application entry point and mode router

#### Key Features
- Mode selection (Browser Python, SSVEP Tool, Experiment, Developer)
- Tab-based navigation
- Experiment management
- Questionnaire system integration
- Results dashboard

#### Props
None (root component)

#### State Management
- `currentMode`: 'developer' | 'experiment' | 'ssvep' | 'browser' | 'edf-viewer'
- `activeTab`: number
- `uploadedFiles`: EDFFile[]
- `selectedFile`: EDFFile | null
- `runningExperiment`: object | null
- `experimentResults`: object[]

#### Modes

##### Browser Python Mode
- Component: `<PyodideEDFProcessor />`
- Description: Browser-based Python processing

##### SSVEP Tool Mode
- Component: `<SSVEPAnalysisTool />`
- Description: Specialized SSVEP analysis

##### Experiment Mode
- Components: `<P300Experiment />`, `<AuditoryStimulus40Hz />`, `<QuestionnaireSystem />`
- Description: Participant interface for experiments

##### Developer Mode (Disabled)
- Description: Technical dashboard (currently disabled)

##### EDF Viewer Mode (Disabled)
- Description: EDF viewer tool (currently disabled)

#### Usage
This is the root component, automatically rendered by Next.js.

---

## Supporting Components

### 5. P300Experiment.tsx

**Purpose:** P300 ERP experiment component  
**Features:**
- Visual stimulus presentation
- Periodic and random flickers
- Response collection
- Reaction time measurement

### 6. AuditoryStimulus40Hz.tsx

**Purpose:** 40Hz auditory stimulus presentation  
**Features:**
- Audio playback
- Duration control
- Response tracking

### 7. QuestionnaireSystem.tsx

**Purpose:** Questionnaire management system  
**Features:**
- Multiple questionnaire types (AD8, IQCODE-16)
- Response collection
- Scoring and interpretation
- Results storage

### 8. EDFViewerTool.tsx

**Purpose:** EDF file viewer (currently disabled)  
**Features:**
- File visualization
- Annotation viewing
- Report generation

---

## Services

### pdfExporter.ts

**Location:** `app/services/pdfExporter.ts`  
**Purpose:** PDF and DOCX report generation

#### Key Functions

##### `generatePatientReportPDF(pyodide, reportData)`
Generates PDF report using Pyodide and reportlab.

**Process:**
1. Install required Python packages (python-docx, reportlab)
2. Fetch DOCX template
3. Fill in patient data
4. Insert PSD plot image
5. Convert to PDF
6. Return base64 string

**Parameters:**
- `pyodide`: Pyodide instance
- `reportData`: PatientReportData object

**Returns:** Promise<string> (base64 PDF)

##### `generatePatientReportDOCX(pyodide, reportData)`
Generates DOCX report using Pyodide and python-docx.

**Process:**
1. Install required Python packages
2. Fetch DOCX template
3. Fill in patient data
4. Insert PSD plot image
5. Return base64 string

**Returns:** Promise<string> (base64 DOCX)

---

## Utilities

### experimentDatabase.ts

**Location:** `app/utils/experimentDatabase.ts`  
**Purpose:** In-memory experiment storage

#### Features
- Singleton pattern
- Experiment CRUD operations
- CSV export
- Type-safe interfaces

#### Key Functions
- `saveExperiment(result)`: Save experiment result
- `getExperiment(id)`: Get experiment by ID
- `getAllExperiments()`: Get all experiments
- `exportToCSV(experimentId?)`: Export to CSV
- `downloadCSV(experimentId?, filename?)`: Download CSV file

---

## Type Definitions

### EDFMetadata
```typescript
interface EDFMetadata {
  filename: string;
  file_size_mb: number;
  num_channels: number;
  channel_names: string[];
  duration_seconds: number;
  sampling_frequency: number;
  start_date?: string;
  start_time?: string;
  subject_id?: string;
  library_used?: string;
  real_data?: boolean;
  annotations?: EDFAnnotation[];
}
```

### AnalysisResult
```typescript
interface AnalysisResult {
  analysis_type: string;
  plot_base64?: string;
  data?: Record<string, any>;
  parameters?: Record<string, any>;
  message?: string;
  success: boolean;
  error?: string;
  time_frame?: {
    start: number;
    end: number;
    start_real_time?: string;
    end_real_time?: string;
  };
}
```

### SSVEPResult
```typescript
interface SSVEPResult {
  target_frequency: number;
  channels_analyzed: string[];
  ssvep_detection: Record<string, {
    snr_db: number;
    peak_power: number;
    detection_confidence: 'high' | 'medium' | 'low';
  }>;
  pca_analysis?: {
    explained_variance_ratio: number[];
    cumulative_variance: number[];
  };
  frequency_analysis: Record<string, {
    relative_power: Record<string, number>;
  }>;
  visualization_base64: string;
  summary: {
    best_channel: string;
    average_snr: number;
    high_confidence_channels: number;
    analysis_duration: string;
  };
}
```

---

## Component Relationships

```
page.tsx (Root)
├── PyodideEDFProcessor (Browser Python Mode)
│   └── Uses: pdfExporter service
├── ComprehensiveEDFDashboard (Local Backend Mode)
│   └── Connects to: FastAPI backend
├── SSVEPAnalysisTool (SSVEP Mode)
│   └── Uses: Pyodide + custom Python scripts
└── Experiment Components
    ├── P300Experiment
    ├── AuditoryStimulus40Hz
    └── QuestionnaireSystem
    └── Uses: experimentDatabase utility
```

---

**Last Updated:** December 2024

