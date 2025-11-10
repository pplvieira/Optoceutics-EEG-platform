'use client'

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generatePatientReportPDF, generatePatientReportDOCX, downloadPDF, downloadDOCX, PatientReportData } from '../services/pdfExporter';

// Pyodide types
declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<any>;
    pyodide: any;
  }
}

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

interface EDFAnnotation {
  onset: number;        // Time in seconds from start
  duration: number;     // Duration in seconds
  description: string;  // Annotation text/title
  real_time?: string;   // Real-world timestamp
  id: string;          // Unique identifier
  is_custom?: boolean; // Whether this was added by user
}

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

export default function PyodideEDFProcessor() {
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EDFMetadata | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [ssvepResult, setSSVEPResult] = useState<SSVEPResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [dragActive, setDragActive] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [collapsedResults, setCollapsedResults] = useState<Set<number>>(new Set());
  const [timeFrameStart, setTimeFrameStart] = useState<number>(0);
  const [timeFrameEnd, setTimeFrameEnd] = useState<number>(0);
  const [showChannelRenamePopup, setShowChannelRenamePopup] = useState(false);
  const [channelToRename, setChannelToRename] = useState<string>('');
  const [newChannelName, setNewChannelName] = useState<string>('');
  const [channelRenameMap, setChannelRenameMap] = useState<Record<string, string>>({});
  const [useTimeFrame, setUseTimeFrame] = useState<boolean>(false);
  const [annotations, setAnnotations] = useState<EDFAnnotation[]>([]);
  const [annotationsNeedUpdate, setAnnotationsNeedUpdate] = useState<boolean>(false);
  const [generatingPDF, setGeneratingPDF] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pyodideRef = useRef<any>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Analysis parameters
  const [ssvepParams, setSSVEPParams] = useState({
    target_frequency: 40.0,
    pca_components: 5,
    frequency_bands: [8, 12, 30, 100]
  });

  const [analysisParams, setAnalysisParams] = useState({
    raw_signal: { duration: timeFrameEnd - timeFrameStart, start_time: 0 },
    psd: { fmin: 0.5, fmax: 50, method: 'welch' },
    snr: { fmin: 1, fmax: 40, method: 'welch' },
    theta_beta_ratio: { theta_min: 4, theta_max: 7, beta_min: 13, beta_max: 30, method: 'welch' },
    time_frequency: { freq_min: 1, freq_max: 50, freq_points: 100, time_points: 200, selected_channel: 0 }
  });

  // Advanced PSD settings
  const [showAdvancedPSDSettings, setShowAdvancedPSDSettings] = useState(false);
  const [advancedPSDSettings, setAdvancedPSDSettings] = useState({
    nperseg_seconds: 4.0,        // seconds (will be multiplied by sampling_frequency)
    noverlap_proportion: 0.5,     // proportion of nperseg (0 to 1)
    window: 'hann' as 'hann' | 'boxcar',  // window type
    use_db: false                 // true for dB, false for power units
  });

  // FOOOF analysis parameters
  const [showAdvancedFOOOFSettings, setShowAdvancedFOOOFSettings] = useState(false);
  const [fooofParams, setFooofParams] = useState({
    freq_range: [1, 50],           // Frequency range for fitting [min, max]
    peak_width_limits: [0.5, 12],  // Min/max peak width in Hz
    max_n_peaks: 6,                 // Maximum number of peaks to detect
    min_peak_height: 0.1,           // Minimum relative peak height
    aperiodic_mode: 'fixed' as 'fixed' | 'knee',  // Aperiodic fitting mode
    nperseg_seconds: 4.0,           // PSD computation window (seconds)
    noverlap_proportion: 0.5        // PSD overlap proportion (0-1)
  });

  // Update raw signal duration when time frame changes
  useEffect(() => {
    const newDuration = timeFrameEnd - timeFrameStart;
    setAnalysisParams(prev => ({
      ...prev,
      raw_signal: { ...prev.raw_signal, duration: newDuration }
    }));
  }, [timeFrameStart, timeFrameEnd]);

  // Initialize Pyodide
  const initializePyodide = useCallback(async () => {
    if (pyodideReady || pyodideLoading) return;
    
    setPyodideLoading(true);
    setLoadingMessage('Loading Python environment...');
    
    try {
      // Load Pyodide
      const pyodide: any = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
      });
      
      setLoadingMessage('Installing Python packages...');
      
      // Install required packages
      await pyodide.loadPackage([
        "numpy", 
        "scipy", 
        "matplotlib", 
        "scikit-learn",
        "micropip"
      ]);
      
      // Try to install MNE first, then pyedflib, with pure Python fallback
      setLoadingMessage('Installing EDF processing libraries...');
      let edf_library_available: string | boolean = false;
      try {
        const micropip = pyodide.pyimport("micropip");
        
        // First try MNE (your preferred library)
        try {
          setLoadingMessage('Installing MNE-Python...');
          await micropip.install(['mne']);
          setLoadingMessage('MNE-Python installed successfully');
          edf_library_available = 'mne';
        } catch {
          console.warn('MNE not available, trying pyedflib...');
          
          // Fallback to pyedflib
          try {
            setLoadingMessage('Installing pyedflib...');
            await micropip.install(['pyedflib']);
            setLoadingMessage('pyedflib installed successfully');
            edf_library_available = 'pyedflib';
          } catch {
            console.warn('Neither MNE nor pyedflib available, using pure Python EDF reader');
            setLoadingMessage('Using built-in pure Python EDF reader');
            edf_library_available = false;
          }
        }
      } catch {
        console.warn('Package installation failed, using pure Python EDF reader');
        setLoadingMessage('Using built-in pure Python EDF reader');
        edf_library_available = false;
      }
      
      console.log('EDF library available:', edf_library_available);

      // Install FOOOF library for spectral parameterization
      try {
        setLoadingMessage('Installing FOOOF library...');
        const micropip = pyodide.pyimport("micropip");
        await micropip.install(['fooof']);
        setLoadingMessage('FOOOF library installed successfully');
        console.log('FOOOF library installed');
      } catch (error) {
        console.warn('FOOOF installation failed:', error);
        setLoadingMessage('FOOOF library not available');
      }

      // Setup Python environment
      setLoadingMessage('Setting up analysis environment...');
      await pyodide.runPython(`
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
from scipy import signal
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import io
import base64
import json
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Try to import FOOOF for spectral parameterization
FOOOF_AVAILABLE = False
try:
    from fooof import FOOOF
    FOOOF_AVAILABLE = True
    print("FOOOF library available for spectral parameterization")
except ImportError:
    print("FOOOF library not available")

# Try to import MNE first, then pyedflib, with pure Python fallback
MNE_AVAILABLE = False
PYEDFLIB_AVAILABLE = False
EDF_LIBRARY = 'pure'

try:
    import mne
    MNE_AVAILABLE = True
    EDF_LIBRARY = 'mne'
    print("MNE-Python available for EDF processing")
except ImportError:
    try:
        import pyedflib
        PYEDFLIB_AVAILABLE = True
        EDF_LIBRARY = 'pyedflib'
        print("pyedflib available for EDF processing")
    except ImportError:
        print("Using pure Python EDF reader (MNE and pyedflib not available)")

# Global variables for file handling
current_edf_data = None
current_metadata = None

class PureEDFReader:
    """Pure Python EDF reader that actually reads EDF files properly"""
    def __init__(self, file_bytes):
        self.file_bytes = file_bytes
        self.header = None
        self.channel_headers = []
        self._data_offset = 256  # Default
        
        try:
            self.header = self._parse_header()
            self.channel_headers = self._parse_channel_headers()
            self._data_offset = self.header['header_bytes'] if self.header else 256
        except Exception as e:
            print(f"EDF parsing error: {e}")
            # Set minimal defaults for error case
            self.header = None
            self.channel_headers = []
            self._data_offset = 256
        
    def _parse_header(self):
        """Parse EDF main header (256 bytes)"""
        if len(self.file_bytes) < 256:
            raise ValueError(f"File too small to be valid EDF: {len(self.file_bytes)} bytes")
        
        header = {}
        try:
            # Parse basic header fields
            header['version'] = self.file_bytes[0:8].decode('ascii', errors='replace').strip()
            header['patient_id'] = self.file_bytes[8:88].decode('ascii', errors='replace').strip()
            header['recording_id'] = self.file_bytes[88:168].decode('ascii', errors='replace').strip()
            header['start_date'] = self.file_bytes[168:176].decode('ascii', errors='replace').strip()
            header['start_time'] = self.file_bytes[176:184].decode('ascii', errors='replace').strip()
            
            # Parse numeric fields with better error handling
            header_bytes_str = self.file_bytes[184:192].decode('ascii', errors='replace').strip()
            try:
                header['header_bytes'] = int(header_bytes_str)
                if header['header_bytes'] < 256:
                    print(f"Warning: header_bytes = {header['header_bytes']}, using 256")
                    header['header_bytes'] = 256
            except ValueError:
                print(f"Warning: Invalid header_bytes '{header_bytes_str}', using 256")
                header['header_bytes'] = 256
            
            header['reserved'] = self.file_bytes[192:236].decode('ascii', errors='replace').strip()
            
            num_records_str = self.file_bytes[236:244].decode('ascii', errors='replace').strip()
            try:
                header['num_records'] = int(num_records_str)
                if header['num_records'] <= 0:
                    print(f"Warning: num_records = {header['num_records']}, using 1")
                    header['num_records'] = 1
            except ValueError:
                print(f"Warning: Invalid num_records '{num_records_str}', using 1")
                header['num_records'] = 1
            
            record_duration_str = self.file_bytes[244:252].decode('ascii', errors='replace').strip()
            try:
                header['record_duration'] = float(record_duration_str)
                if header['record_duration'] <= 0:
                    print(f"Warning: record_duration = {header['record_duration']}, using 1.0")
                    header['record_duration'] = 1.0
            except ValueError:
                print(f"Warning: Invalid record_duration '{record_duration_str}', using 1.0")
                header['record_duration'] = 1.0
            
            num_signals_str = self.file_bytes[252:256].decode('ascii', errors='replace').strip()
            try:
                header['num_signals'] = int(num_signals_str)
                if header['num_signals'] <= 0:
                    print(f"Warning: num_signals = {header['num_signals']}, using 1")
                    header['num_signals'] = 1
            except ValueError:
                print(f"Warning: Invalid num_signals '{num_signals_str}', using 1")
                header['num_signals'] = 1
                
            print(f"EDF Header parsed successfully: {header['num_signals']} channels, {header['num_records']} records")
            
        except Exception as e:
            print(f"EDF header parsing failed: {e}")
            raise ValueError(f"Invalid EDF header: {e}")
        
        return header
    
    def _parse_channel_headers(self):
        """Parse individual channel headers"""
        if not self.header:
            raise ValueError("No main header available for channel parsing")
            
        if len(self.file_bytes) < self.header['header_bytes']:
            raise ValueError(f"File truncated during header: {len(self.file_bytes)} < {self.header['header_bytes']}")
        
        ns = self.header['num_signals']
        headers = []
        
        print(f"Parsing {ns} channel headers...")
        
        # Each channel property is stored as blocks in the header
        offset = 256  # After main header
        
        # Parse all channel properties
        labels = []
        transducer_types = []
        physical_dims = []
        physical_mins = []
        physical_maxs = []
        digital_mins = []
        digital_maxs = []
        prefilters = []
        samples_per_record = []
        reserveds = []
        
        for i in range(ns):
            start = offset + i * 16
            labels.append(self.file_bytes[start:start+16].decode('ascii', errors='replace').strip())
        offset += ns * 16
        
        for i in range(ns):
            start = offset + i * 80
            transducer_types.append(self.file_bytes[start:start+80].decode('ascii', errors='replace').strip())
        offset += ns * 80
        
        for i in range(ns):
            start = offset + i * 8
            physical_dims.append(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip())
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 8
            try:
                physical_mins.append(float(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip()))
            except ValueError:
                physical_mins.append(-1000.0)
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 8
            try:
                physical_maxs.append(float(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip()))
            except ValueError:
                physical_maxs.append(1000.0)
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 8
            try:
                digital_mins.append(int(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip()))
            except ValueError:
                digital_mins.append(-32768)
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 8
            try:
                digital_maxs.append(int(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip()))
            except ValueError:
                digital_maxs.append(32767)
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 80
            prefilters.append(self.file_bytes[start:start+80].decode('ascii', errors='replace').strip())
        offset += ns * 80
        
        for i in range(ns):
            start = offset + i * 8
            try:
                samples_per_record.append(int(self.file_bytes[start:start+8].decode('ascii', errors='replace').strip()))
            except ValueError:
                samples_per_record.append(256)
        offset += ns * 8
        
        for i in range(ns):
            start = offset + i * 32
            reserveds.append(self.file_bytes[start:start+32].decode('ascii', errors='replace').strip())
        
        # Combine into channel headers
        for i in range(ns):
            ch_header = {
                'label': labels[i],
                'transducer_type': transducer_types[i],
                'physical_dimension': physical_dims[i],
                'physical_minimum': physical_mins[i],
                'physical_maximum': physical_maxs[i],
                'digital_minimum': digital_mins[i],
                'digital_maximum': digital_maxs[i],
                'prefilter': prefilters[i],
                'samples_per_record': samples_per_record[i],
                'reserved': reserveds[i]
            }
            headers.append(ch_header)
        
        return headers
    
    @property
    def signals_in_file(self):
        return self.header['num_signals'] if self.header else 0
    
    @property
    def file_duration(self):
        if not self.header:
            return 0
        return self.header['num_records'] * self.header['record_duration']
    
    def getSignalLabels(self):
        """Get channel names"""
        if not self.channel_headers:
            return []
        return [ch['label'] for ch in self.channel_headers]
    
    def getSampleFrequency(self, channel):
        """Get sampling frequency for channel"""
        if not self.channel_headers or channel >= len(self.channel_headers) or not self.header:
            return 256
        return int(self.channel_headers[channel]['samples_per_record'] / self.header['record_duration'])
    
    def readSignal(self, channel, start_sample=0, num_samples=None):
        """Read actual signal data from EDF file"""
        if not self.channel_headers or channel >= len(self.channel_headers) or not self.header:
            return np.array([])
        
        ch_header = self.channel_headers[channel]
        samples_per_record = ch_header['samples_per_record']
        total_samples = samples_per_record * self.header['num_records']
        
        if num_samples is None:
            num_samples = total_samples - start_sample
        
        # Ensure bounds
        if start_sample >= total_samples:
            return np.array([])
        
        end_sample = min(start_sample + num_samples, total_samples)
        actual_samples = end_sample - start_sample
        
        if actual_samples <= 0:
            return np.array([])
        
        # Calculate which records to read
        start_record = start_sample // samples_per_record
        end_record = (end_sample - 1) // samples_per_record + 1
        
        # Calculate record size (sum of all channel samples per record)
        record_size = sum(ch['samples_per_record'] for ch in self.channel_headers) * 2  # 2 bytes per sample
        
        # Read data
        signal_data = []
        
        for record_idx in range(start_record, min(end_record, self.header['num_records'])):
            # Find offset for this channel in this record
            record_offset = self._data_offset + record_idx * record_size
            
            # Offset within the record for this channel
            channel_offset = sum(self.channel_headers[i]['samples_per_record'] * 2 
                               for i in range(channel)) 
            
            data_offset = record_offset + channel_offset
            data_end = data_offset + samples_per_record * 2
            
            if data_end > len(self.file_bytes):
                # File truncated, pad with zeros
                available_bytes = len(self.file_bytes) - data_offset
                available_samples = available_bytes // 2
                if available_samples > 0:
                    raw_data = self.file_bytes[data_offset:data_offset + available_samples * 2]
                    samples = np.frombuffer(raw_data, dtype=np.int16)
                    # Pad with zeros
                    padded = np.zeros(samples_per_record, dtype=np.int16)
                    padded[:len(samples)] = samples
                    signal_data.extend(padded)
                else:
                    signal_data.extend(np.zeros(samples_per_record, dtype=np.int16))
            else:
                raw_data = self.file_bytes[data_offset:data_end]
                samples = np.frombuffer(raw_data, dtype=np.int16)
                signal_data.extend(samples)
        
        # Convert to numpy array and extract requested range
        signal_array = np.array(signal_data)
        
        # Extract the specific sample range within the loaded records
        local_start = start_sample - start_record * samples_per_record
        local_end = local_start + actual_samples
        
        if local_end <= len(signal_array):
            signal_slice = signal_array[local_start:local_end]
        else:
            # Handle edge case
            signal_slice = signal_array[local_start:]
            if len(signal_slice) < actual_samples:
                # Pad if necessary
                padded = np.zeros(actual_samples)
                padded[:len(signal_slice)] = signal_slice
                signal_slice = padded
        
        # Convert from digital to physical units
        physical_min = ch_header['physical_minimum']
        physical_max = ch_header['physical_maximum'] 
        digital_min = ch_header['digital_minimum']
        digital_max = ch_header['digital_maximum']
        
        if digital_max != digital_min:
            # Scale from digital to physical units
            scale = (physical_max - physical_min) / (digital_max - digital_min)
            physical_signal = (signal_slice - digital_min) * scale + physical_min
        else:
            physical_signal = signal_slice.astype(float)
        
        return physical_signal
    
    def getLabel(self, channel):
        """Get label for specific channel"""
        if channel < len(self.channel_headers):
            return self.channel_headers[channel]['label']
        return f'Channel_{channel+1}'
    
    def _close(self):
        """Compatibility method for pyedflib"""
        pass

def read_edf_file(file_bytes, filename):
    """Read EDF file from bytes and extract metadata"""
    global current_edf_data, current_metadata
    
    # Debug: Show first few bytes to understand file structure
    print(f"File size: {len(file_bytes)} bytes")
    print(f"File bytes type: {type(file_bytes)}")
    
    if len(file_bytes) >= 256:
        print(f"First 256 bytes preview:")
        header_sample = file_bytes[:256]
        
        # Decode properly for display
        try:
            version = header_sample[0:8].decode('ascii', errors='replace').strip()
            patient_id_sample = header_sample[8:88].decode('ascii', errors='replace')[:20]
            num_signals = header_sample[252:256].decode('ascii', errors='replace').strip()
            
            print(f"Version (0-8): '{version}'")
            print(f"Patient ID (8-88): '{patient_id_sample}...'") 
            print(f"Num signals (252-256): '{num_signals}'")
            print(f"Raw bytes (0-8): {list(header_sample[0:8])}")
            print(f"Raw bytes (252-256): {list(header_sample[252:256])}")
        except Exception as e:
            print(f"Debug decode error: {e}")
            print(f"Raw file_bytes preview: {file_bytes[:50]}")
    else:
        print(f"File too small: only {len(file_bytes)} bytes")
    
    # Track which method succeeded
    method_used = None
    
    try:
        # Try MNE-Python first
        if MNE_AVAILABLE:
            try:
                print("Attempting to use MNE-Python for EDF processing...")
                import tempfile
                import os
                
                with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as tmp_file:
                    tmp_file.write(file_bytes)
                    tmp_path = tmp_file.name
                
                try:
                    try:
                        print(f"Reading EDF file with MNE from: {tmp_path}")
                        raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
                    except:
                        print(f"[###] Didn't work. Reading EDF file with FIF from: {tmp_path}")
                        print(f"Reading FIF file with MNE from: {tmp_path}")
                        raw = mne.io.read_raw_fif(tmp_path, preload=True, verbose=False)
                    
                    print(f"MNE successfully loaded: {len(raw.ch_names)} channels, {raw.info['sfreq']} Hz")
                    
                    # Filter out annotation channels
                    filtered_channels = [ch for ch in raw.ch_names if not ch.startswith('EDF Annotations')]
                    
                    # Extract recording start date and time
                    start_date = None
                    start_time = None
                    print(f"Extracting date/time from raw.info: {raw.info.get('meas_date', 'NOT FOUND')}")
                    if 'meas_date' in raw.info and raw.info['meas_date'] is not None:
                        meas_date = raw.info['meas_date']
                        print(f"Found meas_date: {meas_date}, type: {type(meas_date)}")
                        if hasattr(meas_date, 'strftime'):
                            start_date = meas_date.strftime('%Y-%m-%d')
                            start_time = meas_date.strftime('%H:%M:%S')
                            print(f"Formatted date/time: {start_date} {start_time}")
                        else:
                            print(f"meas_date doesn't have strftime method, trying direct conversion")
                            try:
                                # Try to convert if it's a different datetime format
                                from datetime import datetime
                                if isinstance(meas_date, (int, float)):
                                    # Unix timestamp
                                    dt = datetime.fromtimestamp(meas_date)
                                    start_date = dt.strftime('%Y-%m-%d')
                                    start_time = dt.strftime('%H:%M:%S')
                                    print(f"Converted timestamp to: {start_date} {start_time}")
                                else:
                                    print(f"Unknown meas_date format: {type(meas_date)}")
                            except Exception as e:
                                print(f"Error converting meas_date: {e}")
                    else:
                        print("No meas_date found in raw.info")
                    
                    # Extract annotations
                    print("About to extract annotations...")
                    file_annotations = extract_annotations(raw, start_date, start_time)
                    print(f"Annotations extracted successfully: {len(file_annotations)} annotations")
                    
                    # Safely extract subject_id
                    print("About to extract subject_id...")
                    try:
                        subject_info = raw.info.get('subject_info', {})
                        if subject_info is None:
                            subject_info = {}
                        subject_id = subject_info.get('id', 'Unknown') if isinstance(subject_info, dict) else 'Unknown'
                    except Exception as e:
                        print(f"Error extracting subject_id: {e}")
                        subject_id = 'Unknown'
                    
                    print("About to create metadata...")
                    metadata = {
                        'filename': filename,
                        'file_size_mb': round(len(file_bytes) / (1024 * 1024), 2),
                        'num_channels': len(filtered_channels),
                        'channel_names': filtered_channels,
                        'duration_seconds': raw.times[-1] - raw.times[0],
                        'sampling_frequency': int(raw.info['sfreq']),
                        'subject_id': subject_id,
                        'library_used': 'MNE-Python',
                        'real_data': True,
                        'start_date': start_date,
                        'start_time': start_time,
                        'annotations': file_annotations
                    }
                    print("Metadata created successfully")
                    
                    current_edf_data = raw
                    current_metadata = metadata
                    method_used = 'mne'
                    
                    print("MNE-Python processing completed successfully!")
                    return json.dumps(metadata)
                    
                finally:
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass
                        
            except Exception as mne_error:
                print(f"MNE-Python failed: {mne_error}")
                print(f"MNE error type: {type(mne_error)}")
                import traceback
                print("Full MNE error traceback:")
                traceback.print_exc()
                print("Falling back to pyedflib...")
                
        # Try pyedflib if MNE failed or not available
        if PYEDFLIB_AVAILABLE and method_used is None:
            try:
                print("Attempting to use pyedflib for EDF processing...")
                import tempfile
                import os
                
                with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as tmp_file:
                    tmp_file.write(file_bytes)
                    tmp_path = tmp_file.name
                
                try:
                    edf_reader = pyedflib.EdfReader(tmp_path)
                    
                    metadata = {
                        'filename': filename,
                        'file_size_mb': round(len(file_bytes) / (1024 * 1024), 2),
                        'num_channels': edf_reader.signals_in_file,
                        'channel_names': edf_reader.getSignalLabels(),
                        'duration_seconds': edf_reader.file_duration,
                        'sampling_frequency': edf_reader.getSampleFrequency(0) if edf_reader.signals_in_file > 0 else None,
                        'subject_id': 'Unknown',
                        'library_used': 'pyedflib',
                        'real_data': True
                    }
                    
                    try:
                        start_datetime = edf_reader.getStartdatetime()
                        if start_datetime:
                            metadata['start_date'] = start_datetime.strftime('%Y-%m-%d')
                            metadata['start_time'] = start_datetime.strftime('%H:%M:%S')
                    except:
                        pass
                    
                    try:
                        metadata['subject_id'] = edf_reader.getPatientName() or 'Unknown'
                    except:
                        pass
                    
                    # Extract annotations
                    file_annotations = extract_annotations(edf_reader, metadata.get('start_date'), metadata.get('start_time'))
                    metadata['annotations'] = file_annotations
                    
                    current_edf_data = edf_reader
                    current_metadata = metadata
                    method_used = 'pyedflib'
                    
                    print("pyedflib processing completed successfully!")
                    return json.dumps(metadata)
                    
                finally:
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass
                        
            except Exception as pyedflib_error:
                print(f"pyedflib failed: {pyedflib_error}")
                print("Falling back to Pure Python reader...")
                
        # Use Pure Python EDF reader as final fallback
        if method_used is None:
            print("Using Pure Python EDF reader as final fallback...")
            print(f"MNE_AVAILABLE: {MNE_AVAILABLE}, PYEDFLIB_AVAILABLE: {PYEDFLIB_AVAILABLE}")
            try:
                edf_reader = PureEDFReader(file_bytes)
                
                # Check if header parsing was successful
                if edf_reader.header is None:
                    raise ValueError("Failed to parse EDF header")
                
                metadata = {
                    'filename': filename,
                    'file_size_mb': round(len(file_bytes) / (1024 * 1024), 2),
                    'num_channels': edf_reader.signals_in_file,
                    'channel_names': edf_reader.getSignalLabels(),
                    'duration_seconds': edf_reader.file_duration,
                    'sampling_frequency': edf_reader.getSampleFrequency(0) if edf_reader.signals_in_file > 0 else None,
                    'subject_id': edf_reader.header.get('patient_id', 'Unknown') if edf_reader.header else 'Unknown',
                    'library_used': 'Pure Python EDF Reader',
                    'real_data': True,
                    'start_date': edf_reader.header.get('start_date', '') if edf_reader.header else '',
                    'start_time': edf_reader.header.get('start_time', '') if edf_reader.header else ''
                }
                
                # Extract annotations (pure Python reader has limited annotation support)
                file_annotations = extract_annotations(edf_reader, metadata.get('start_date'), metadata.get('start_time'))
                metadata['annotations'] = file_annotations
                
                current_edf_data = edf_reader
                current_metadata = metadata
                method_used = 'pure'
                
                print("Pure Python EDF reader processing completed successfully!")
                return json.dumps(metadata)
                
            except Exception as edf_error:
                print(f"Pure Python EDF reader failed: {edf_error}")
                # Create a fallback with basic file info - this ensures we always return valid JSON
                metadata = {
                    'filename': filename,
                    'file_size_mb': round(len(file_bytes) / (1024 * 1024), 2),
                    'error_info': f'All EDF parsing methods failed: {str(edf_error)}',
                    'library_used': 'Error - unable to parse EDF file',
                    'real_data': False,
                    'num_channels': 0,
                    'channel_names': [],
                    'duration_seconds': 0,
                    'sampling_frequency': 0
                }
                return json.dumps(metadata)
        
    except Exception as e:
        return json.dumps({'error': str(e), 'library_tried': EDF_LIBRARY})

def get_signal_data(edf_reader, channel, start_sample=0, num_samples=None):
    """Universal signal reader for different EDF libraries"""
    # Ensure parameters are integers
    start_sample = int(start_sample) if start_sample is not None else 0
    if num_samples is not None:
        num_samples = int(num_samples)
    
    if MNE_AVAILABLE and hasattr(edf_reader, 'get_data'):
        # MNE Raw object
        if isinstance(channel, str):
            ch_idx = edf_reader.ch_names.index(channel)
        else:
            ch_idx = channel
        
        # MNE get_data expects sample indices, not time in seconds
        start_idx = int(start_sample)
        if num_samples is None:
            stop_idx = None
        else:
            stop_idx = int(start_sample + num_samples)
        
        data = edf_reader.get_data(picks=[ch_idx], start=start_idx, stop=stop_idx)
        return data[0]  # Return 1D array
    else:
        # pyedflib or PureEDFReader
        return edf_reader.readSignal(channel, start_sample, num_samples)

def get_channel_names(edf_reader):
    """Universal channel name getter - filters out annotation channels"""
    if MNE_AVAILABLE and hasattr(edf_reader, 'ch_names'):
        # Filter out annotation channels in MNE
        return [ch for ch in edf_reader.ch_names if not ch.startswith('EDF Annotations')]
    else:
        # Filter out annotation channels in pyedflib/PureEDFReader
        all_channels = edf_reader.getSignalLabels()
        return [ch for ch in all_channels if not ch.startswith('EDF Annotations') and ch.strip() != '']

def get_sample_frequency(edf_reader, channel=0):
    """Universal sample frequency getter"""
    if MNE_AVAILABLE and hasattr(edf_reader, 'info'):
        return edf_reader.info['sfreq']
    else:
        return edf_reader.getSampleFrequency(channel)

def extract_annotations(edf_reader, start_date=None, start_time=None):
    """Extract annotations from EDF file"""
    annotations = []
    
    print(f"=== EXTRACTING ANNOTATIONS ===")
    print(f"MNE_AVAILABLE: {MNE_AVAILABLE}")
    print(f"PYEDFLIB_AVAILABLE: {PYEDFLIB_AVAILABLE}")
    print(f"EDF_LIBRARY: {EDF_LIBRARY}")
    print(f"edf_reader type: {type(edf_reader)}")
    print(f"edf_reader has annotations attr: {hasattr(edf_reader, 'annotations')}")
    print(f"start_date: {start_date}, start_time: {start_time}")
    
    try:
        if MNE_AVAILABLE and hasattr(edf_reader, 'annotations'):
            # MNE-Python annotations
            print(f"Found MNE reader with annotations attribute")
            mne_annotations = edf_reader.annotations
            print(f"Annotations object: {mne_annotations}")
            print(f"Annotations type: {type(mne_annotations)}")
            
            if mne_annotations is not None:
                print(f"Annotations length: {len(mne_annotations)}")
                # Always try to access the annotation arrays, even if length is 0
                try:
                    print(f"Annotations onset array: {mne_annotations.onset}")
                    print(f"Annotations duration array: {mne_annotations.duration}")  
                    print(f"Annotations description array: {mne_annotations.description}")
                    print(f"Length of onset array: {len(mne_annotations.onset) if hasattr(mne_annotations.onset, '__len__') else 'N/A'}")
                    print(f"Length of duration array: {len(mne_annotations.duration) if hasattr(mne_annotations.duration, '__len__') else 'N/A'}")
                    print(f"Length of description array: {len(mne_annotations.description) if hasattr(mne_annotations.description, '__len__') else 'N/A'}")
                except Exception as e:
                    print(f"Error accessing annotation arrays: {e}")
                
                # Try to process annotations even if len() check fails
                try:
                    # Check if we have actual annotation data in the arrays
                    has_annotations = (
                        hasattr(mne_annotations, 'onset') and 
                        hasattr(mne_annotations, 'duration') and 
                        hasattr(mne_annotations, 'description') and
                        len(mne_annotations.onset) > 0
                    )
                    
                    print(f"Has annotation data: {has_annotations}")
                    
                    if has_annotations:
                        # Also try to get meas_date directly from the raw object for more precise timing
                        meas_date = None
                        if hasattr(edf_reader, 'info') and 'meas_date' in edf_reader.info and edf_reader.info['meas_date'] is not None:
                            meas_date = edf_reader.info['meas_date']
                            print(f"Found meas_date: {meas_date}")
                        
                        for i, (onset, duration, description) in enumerate(zip(
                            mne_annotations.onset, mne_annotations.duration, mne_annotations.description
                        )):
                            print(f"Processing annotation {i}: onset={onset}, duration={duration}, description={description}")
                            
                            # Calculate real-world time using meas_date if available, otherwise fall back to start_date/start_time
                            real_time = None
                            if meas_date is not None:
                                try:
                                    from datetime import datetime, timedelta
                                    # meas_date should be a datetime object
                                    if hasattr(meas_date, 'timestamp'):
                                        # Convert to datetime if it's a timestamp
                                        start_datetime = datetime.fromtimestamp(meas_date.timestamp())
                                    else:
                                        start_datetime = meas_date
                                    annotation_datetime = start_datetime + timedelta(seconds=float(onset))
                                    real_time = annotation_datetime.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                                    print(f"Calculated real_time using meas_date: {real_time}")
                                except Exception as e:
                                    print(f"Error calculating real time using meas_date: {e}")
                                    real_time = None
                            
                            # Fall back to start_date/start_time if meas_date method failed
                            if real_time is None and start_date and start_time:
                                try:
                                    from datetime import datetime, timedelta
                                    start_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M:%S")
                                    annotation_datetime = start_datetime + timedelta(seconds=float(onset))
                                    real_time = annotation_datetime.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                                    print(f"Calculated real_time using start_date/start_time: {real_time}")
                                except Exception as e:
                                    print(f"Error calculating real time using start_date/start_time: {e}")
                                    real_time = None
                            
                            annotations.append({
                                'id': f'edf_ann_{i}',
                                'onset': float(onset),
                                'duration': float(duration),
                                'description': str(description),
                                'real_time': real_time,
                                'is_custom': False
                            })
                    else:
                        print("No annotation data found in arrays")
                except Exception as e:
                    print(f"Error processing annotations: {e}")
            else:
                print("Annotations object is None")
        
        elif PYEDFLIB_AVAILABLE and hasattr(edf_reader, 'readAnnotations'):
            # pyedflib annotations
            try:
                annotations_data = edf_reader.readAnnotations()
                if annotations_data and len(annotations_data) > 0:
                    onsets, durations, descriptions = annotations_data
                    for i, (onset, duration, description) in enumerate(zip(onsets, durations, descriptions)):
                        # Calculate real-world time if start date/time available
                        real_time = None
                        if start_date and start_time:
                            try:
                                from datetime import datetime, timedelta
                                start_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M:%S")
                                annotation_datetime = start_datetime + timedelta(seconds=float(onset))
                                real_time = annotation_datetime.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                            except:
                                real_time = None
                        
                        annotations.append({
                            'id': f'edf_ann_{i}',
                            'onset': float(onset),
                            'duration': float(duration),
                            'description': str(description),
                            'real_time': real_time,
                            'is_custom': False
                        })
            except:
                pass  # No annotations or error reading them
        
        # For pure Python reader, we would need to parse the EDF header for annotations
        # This is complex, so for now we'll return empty list
        
        print(f"Extracted {len(annotations)} annotations from EDF file")
        return annotations
        
    except Exception as e:
        print(f"Error extracting annotations: {e}")
        return []

def crop_edf_data(edf_reader, start_time=None, end_time=None):
    """Create a cropped copy of EDF data based on time range"""
    if start_time is None or end_time is None:
        return edf_reader  # Return original if no time range specified
    
    try:
        sample_rate = get_sample_frequency(edf_reader)
        
        # Convert time to samples
        start_sample = int(start_time * sample_rate)
        end_sample = int(end_time * sample_rate)
        
        if MNE_AVAILABLE and hasattr(edf_reader, 'crop'):
            # MNE has built-in cropping
            cropped_raw = edf_reader.copy().crop(tmin=start_time, tmax=end_time)
            return cropped_raw
        elif PYEDFLIB_AVAILABLE and hasattr(edf_reader, 'readSignal'):
            # For pyedflib, we need to create a virtual cropped reader
            class CroppedEDFReader:
                def __init__(self, original_reader, start_sample, end_sample):
                    self.original_reader = original_reader
                    self.start_sample = start_sample
                    self.end_sample = end_sample
                    self.duration_samples = end_sample - start_sample
                    
                def getSignalLabels(self):
                    return self.original_reader.getSignalLabels()
                    
                def getSampleFrequency(self, channel):
                    return self.original_reader.getSampleFrequency(channel)
                    
                def readSignal(self, channel, start=0, num_samples=None):
                    # Ensure start and num_samples are integers
                    start = int(start) if start is not None else 0
                    if num_samples is None:
                        num_samples = self.duration_samples - start
                    num_samples = int(num_samples)
                    
                    # Adjust to original file coordinates
                    original_start = self.start_sample + start
                    actual_samples = min(num_samples, self.duration_samples - start)
                    
                    if actual_samples <= 0:
                        return np.array([])
                    
                    return self.original_reader.readSignal(channel, original_start, actual_samples)
                
                def signals_in_file(self):
                    return self.original_reader.signals_in_file()
            
            return CroppedEDFReader(edf_reader, start_sample, end_sample)
        else:
            # For pure Python reader, create cropped version
            class CroppedPureEDFReader:
                def __init__(self, original_reader, start_sample, end_sample):
                    self.original_reader = original_reader
                    self.start_sample = start_sample
                    self.end_sample = end_sample
                    self.duration_samples = end_sample - start_sample
                    
                def getSignalLabels(self):
                    return self.original_reader.getSignalLabels()
                    
                def getSampleFrequency(self, channel):
                    return self.original_reader.getSampleFrequency(channel)
                    
                def readSignal(self, channel, start_sample=0, num_samples=None):
                    # Ensure parameters are integers
                    start_sample = int(start_sample) if start_sample is not None else 0
                    if num_samples is None:
                        num_samples = self.duration_samples - start_sample
                    num_samples = int(num_samples)
                    
                    # Adjust to original file coordinates
                    original_start = self.start_sample + start_sample
                    actual_samples = min(num_samples, self.duration_samples - start_sample)
                    
                    if actual_samples <= 0:
                        return np.array([])
                    
                    return self.original_reader.readSignal(channel, original_start, actual_samples)
                
                def signals_in_file(self):
                    return len(self.original_reader.getSignalLabels())
            
            return CroppedPureEDFReader(edf_reader, start_sample, end_sample)
            
    except Exception as e:
        print(f"Error cropping EDF data: {e}")
        return edf_reader  # Return original on error

def analyze_ssvep(target_freq=40.0, pca_components=5, frequency_bands=None, start_time=None, end_time=None):
    """Comprehensive SSVEP analysis with optional time frame cropping"""
    global current_edf_data, current_metadata
    
    if current_edf_data is None:
        return json.dumps({'error': 'No EDF file loaded'})
    
    if frequency_bands is None:
        frequency_bands = [8, 12, 30, 100]
    
    try:
        # Apply time frame cropping if specified
        edf_reader = crop_edf_data(current_edf_data, start_time, end_time)
        sample_rate = get_sample_frequency(edf_reader)
        
        # Use user-selected channels from the interface
        all_channels = get_channel_names(edf_reader)
        # selected_channels will be passed from JavaScript as global variable
        try:
            selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else all_channels
        except:
            selected_channels = all_channels
        
        # Filter selected channels to only include valid channels
        selected_channels = [ch for ch in selected_channels if ch in all_channels]
        
        # If no channels selected, use all available channels
        if not selected_channels:
            selected_channels = all_channels
        
        # Read signal data
        channel_data = {}
        for ch_name in selected_channels:
            ch_idx = all_channels.index(ch_name)
            signal_data = get_signal_data(edf_reader, ch_idx)
            channel_data[ch_name] = signal_data
        
        # SSVEP Detection
        ssvep_detection = {}
        for ch_name, signal_data in channel_data.items():
            # Bandpass filter around target frequency
            sos = signal.butter(4, [target_freq-2, target_freq+2], btype='band', fs=sample_rate, output='sos')
            filtered_signal = signal.sosfilt(sos, signal_data)
            
            # Compute PSD
            freqs, psd = signal.welch(filtered_signal, fs=sample_rate, nperseg=2048)
            
            # Find peak at target frequency
            target_idx = np.argmin(np.abs(freqs - target_freq))
            peak_power = psd[target_idx]
            
            # Calculate SNR
            noise_indices = np.where((freqs >= target_freq-10) & (freqs <= target_freq+10) & 
                                   (np.abs(freqs - target_freq) >= 3))[0]
            noise_power = np.mean(psd[noise_indices]) if len(noise_indices) > 0 else peak_power * 0.1
            
            snr_db = 10 * np.log10(peak_power / noise_power) if noise_power > 0 else 0
            
            # Determine confidence
            if snr_db > 6:
                confidence = 'high'
            elif snr_db > 3:
                confidence = 'medium'
            else:
                confidence = 'low'
            
            ssvep_detection[ch_name] = {
                'snr_db': float(snr_db),
                'peak_power': float(peak_power),
                'detection_confidence': confidence
            }
        
        # PCA Analysis
        pca_analysis = None
        if len(channel_data) > 1:
            data_matrix = np.array([channel_data[ch] for ch in selected_channels]).T
            scaler = StandardScaler()
            data_scaled = scaler.fit_transform(data_matrix)
            
            pca = PCA(n_components=min(pca_components, len(selected_channels)))
            pca.fit(data_scaled)
            
            pca_analysis = {
                'explained_variance_ratio': pca.explained_variance_ratio_.tolist(),
                'cumulative_variance': np.cumsum(pca.explained_variance_ratio_).tolist()
            }
        
        # Frequency band analysis
        frequency_analysis = {}
        band_names = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma']
        band_ranges = [(0.5, frequency_bands[0]), (frequency_bands[0], 8), (8, frequency_bands[1]), 
                       (frequency_bands[1], frequency_bands[2]), (frequency_bands[2], frequency_bands[3])]
        
        for ch_name, signal_data in channel_data.items():
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
            
            band_powers = {}
            for band_name, (fmin, fmax) in zip(band_names, band_ranges):
                band_mask = (freqs >= fmin) & (freqs <= fmax)
                band_power = np.trapz(psd[band_mask], freqs[band_mask])
                band_powers[band_name] = float(band_power)
            
            total_power = sum(band_powers.values())
            relative_powers = {band: power/total_power for band, power in band_powers.items()}
            
            frequency_analysis[ch_name] = {
                'relative_power': relative_powers
            }
        
        # Create comprehensive visualization
        fig = plt.figure(figsize=(16, 12))
        
        # SNR by Channel
        ax1 = plt.subplot(2, 3, 1)
        channels = list(ssvep_detection.keys())
        snr_values = [ssvep_detection[ch]['snr_db'] for ch in channels]
        
        bars = ax1.bar(range(len(channels)), snr_values, color='skyblue', alpha=0.7)
        ax1.set_xlabel('Channels')
        ax1.set_ylabel('SNR (dB)')
        ax1.set_title('SSVEP SNR by Channel')
        ax1.set_xticks(range(len(channels)))
        ax1.set_xticklabels([ch[:4] for ch in channels], rotation=45)
        ax1.grid(True, alpha=0.3)
        ax1.axhline(y=3, color='orange', linestyle='--', label='Medium threshold')
        ax1.axhline(y=6, color='red', linestyle='--', label='High threshold')
        ax1.legend()
        
        # PCA if available
        if pca_analysis:
            ax2 = plt.subplot(2, 3, 2)
            components = range(1, len(pca_analysis['explained_variance_ratio']) + 1)
            ax2.plot(components, pca_analysis['cumulative_variance'], 'bo-')
            ax2.set_xlabel('Principal Component')
            ax2.set_ylabel('Cumulative Explained Variance')
            ax2.set_title('PCA Cumulative Variance')
            ax2.grid(True, alpha=0.3)
            ax2.axhline(y=0.95, color='red', linestyle='--', alpha=0.5)
        
        # Frequency band pie chart
        ax3 = plt.subplot(2, 3, 3)
        if frequency_analysis:
            first_channel = list(frequency_analysis.keys())[0]
            band_data = frequency_analysis[first_channel]['relative_power']
            
            bands = list(band_data.keys())
            powers = list(band_data.values())
            
            ax3.pie(powers, labels=bands, autopct='%1.1f%%', startangle=90)
            ax3.set_title(f'Frequency Band Distribution\\n({first_channel})')
        
        # Detection confidence
        ax4 = plt.subplot(2, 3, 4)
        confidence_data = []
        colors = []
        
        for ch in channels:
            conf = ssvep_detection[ch]['detection_confidence']
            conf_val = {'high': 3, 'medium': 2, 'low': 1}[conf]
            confidence_data.append(conf_val)
            colors.append('green' if conf == 'high' else 'orange' if conf == 'medium' else 'red')
        
        ax4.bar(range(len(channels)), confidence_data, color=colors, alpha=0.7)
        ax4.set_ylabel('Confidence Level')
        ax4.set_title('SSVEP Detection Confidence')
        ax4.set_xticks(range(len(channels)))
        ax4.set_xticklabels([ch[:4] for ch in channels])
        ax4.set_yticks([1, 2, 3])
        ax4.set_yticklabels(['Low', 'Medium', 'High'])
        
        # Peak power
        ax5 = plt.subplot(2, 3, 5)
        peak_powers = [ssvep_detection[ch]['peak_power'] for ch in channels[:5]]  # First 5 channels
        ax5.bar(range(len(peak_powers)), peak_powers, alpha=0.7, color='purple')
        ax5.set_xlabel('Channels')
        ax5.set_ylabel('Power at Target Frequency')
        ax5.set_title(f'Peak Power at {target_freq}Hz')
        ax5.set_xticks(range(len(peak_powers)))
        ax5.set_xticklabels([channels[i][:4] for i in range(len(peak_powers))])
        
        # Summary text
        ax6 = plt.subplot(2, 3, 6)
        ax6.axis('off')
        
        best_channel = max(channels, key=lambda c: ssvep_detection[c]['snr_db'])
        avg_snr = np.mean(snr_values)
        high_conf = sum(1 for ch in channels if ssvep_detection[ch]['detection_confidence'] == 'high')
        medium_conf = sum(1 for ch in channels if ssvep_detection[ch]['detection_confidence'] == 'medium')
        low_conf = sum(1 for ch in channels if ssvep_detection[ch]['detection_confidence'] == 'low')
        
        summary_text = f'''SSVEP Analysis Summary

Target Frequency: {target_freq} Hz
Channels Analyzed: {len(channels)}
Analysis Time: {datetime.now().strftime("%H:%M:%S")}

Best Channel: {best_channel}
Best SNR: {max(snr_values):.2f} dB
Average SNR: {avg_snr:.2f} dB

Detection Quality:
• High: {high_conf}
• Medium: {medium_conf} 
• Low: {low_conf}'''
        
        ax6.text(0.05, 0.95, summary_text, transform=ax6.transAxes, fontsize=10,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='lightgray', alpha=0.8))
        
        plt.tight_layout()
        
        # Convert plot to base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        plot_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        # Prepare result
        result = {
            'target_frequency': target_freq,
            'channels_analyzed': selected_channels,
            'ssvep_detection': ssvep_detection,
            'pca_analysis': pca_analysis,
            'frequency_analysis': frequency_analysis,
            'visualization_base64': plot_base64,
            'summary': {
                'best_channel': best_channel,
                'average_snr': float(avg_snr),
                'high_confidence_channels': high_conf,
                'analysis_duration': f"{datetime.now().strftime('%H:%M:%S')}"
            }
        }
        
        return json.dumps(result)
        
    except Exception as e:
        import traceback
        return json.dumps({'error': f'Analysis failed: {str(e)}', 'traceback': traceback.format_exc()})

def analyze_traditional(analysis_type, parameters, start_time=None, end_time=None):
    """Traditional EEG analysis functions with optional time frame cropping"""
    global current_edf_data, current_metadata
    
    if current_edf_data is None:
        return json.dumps({'error': 'No EDF file loaded', 'success': False})
    
    try:
        # Apply time frame cropping if specified
        edf_reader = crop_edf_data(current_edf_data, start_time, end_time)
        
        if analysis_type == 'raw_signal':
            return analyze_raw_signal(edf_reader, parameters)
        elif analysis_type == 'psd':
            return analyze_psd(edf_reader, parameters)
        elif analysis_type == 'fooof':
            return analyze_fooof(edf_reader, parameters)
        elif analysis_type == 'snr':
            return analyze_snr(edf_reader, parameters)
        elif analysis_type == 'theta_beta_ratio':
            return analyze_theta_beta_ratio(edf_reader, parameters)
        elif analysis_type == 'time_frequency':
            return analyze_time_frequency(edf_reader, parameters)
        else:
            return json.dumps({'error': f'Unknown analysis type: {analysis_type}', 'success': False})
            
    except Exception as e:
        import traceback
        return json.dumps({
            'error': str(e), 
            'success': False,
            'traceback': traceback.format_exc(),
            'analysis_type': analysis_type,
            'parameters': parameters
        })

def analyze_raw_signal(edf_reader, parameters):
    """Plot raw EEG signal"""
    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            # Manual conversion for JsProxy objects
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except Exception as e:
        print(f"Parameter conversion error: {e}")
        params = {'duration': 10, 'start_time': 0}  # fallback defaults
    
    duration = params.get('duration', 10)
    start_time = params.get('start_time', 0)
    
    sample_rate = get_sample_frequency(edf_reader)
    all_channels = get_channel_names(edf_reader)
    
    # Use selected channels from interface
    try:
        selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else all_channels[:4]
    except:
        selected_channels = all_channels[:4]
    
    # Filter and limit channels
    selected_channels = [ch for ch in selected_channels if ch in all_channels]
    num_channels = min(4, len(selected_channels))  # Limit to 4 for readability
    selected_channels = selected_channels[:num_channels]
    
    start_sample = int(start_time * sample_rate)
    num_samples = int(duration * sample_rate)
    
    fig, axes = plt.subplots(num_channels, 1, figsize=(12, 2 * num_channels), sharex=True)
    if num_channels == 1:
        axes = [axes]
    
    time_axis = np.linspace(start_time, start_time + duration, num_samples)
    
    for i, ch_name in enumerate(selected_channels):
        ch_idx = all_channels.index(ch_name)
        signal_data = get_signal_data(edf_reader, ch_idx, start_sample, num_samples)
        
        # Check if signal_data is empty or has no valid data
        if signal_data is None or signal_data.size == 0 or len(signal_data) == 0:
            # Create a placeholder line for empty data
            axes[i].plot(time_axis, np.zeros(len(time_axis)), linewidth=0.5, color='red', linestyle='--')
            axes[i].text(start_time + duration/2, 0, 'No data available', 
                        ha='center', va='center', color='red', fontsize=8)
            ylabel_unit = 'µV'
        else:
            # Ensure we have a valid array with finite values
            signal_data = np.asarray(signal_data)
            
            # Remove any non-finite values (NaN, inf, -inf)
            if np.any(~np.isfinite(signal_data)):
                signal_data = signal_data[np.isfinite(signal_data)]
            
            # Double-check we still have data after cleanup
            if signal_data.size == 0:
                axes[i].plot(time_axis, np.zeros(len(time_axis)), linewidth=0.5, color='red', linestyle='--')
                axes[i].text(start_time + duration/2, 0, 'No valid data after cleanup', 
                            ha='center', va='center', color='red', fontsize=8)
                ylabel_unit = 'µV'
                continue
            
            # Ensure time_axis and signal_data have compatible lengths
            if len(time_axis) != len(signal_data):
                # Adjust time_axis to match signal_data length
                time_axis = np.linspace(start_time, start_time + duration, len(signal_data))
            
            # Convert to microvolts (assuming data is in volts) - with safe max calculation
            try:
                max_abs = np.max(np.abs(signal_data)) if signal_data.size > 0 else 0
            except (ValueError, RuntimeError) as e:
                # If we still get an error, fall back to a safe default
                print(f"Warning: Could not calculate max for channel {ch_name}: {e}")
                max_abs = 1  # Assume microvolts
                
            if max_abs < 1e-3 and max_abs > 0:  # Likely already in volts
                axes[i].plot(time_axis, signal_data * 1e6, linewidth=0.5)
                ylabel_unit = 'µV'
            else:  # Likely in microvolts already or zero data
                axes[i].plot(time_axis, signal_data, linewidth=0.5)
                ylabel_unit = 'µV'
        
        axes[i].set_ylabel(f'{ch_name} ({ylabel_unit})')
        axes[i].grid(True, alpha=0.3)
    
    axes[-1].set_xlabel('Time (s)')
    plt.title(f'Raw EEG Signal ({duration}s from {start_time}s)')
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return json.dumps({
        'analysis_type': 'raw_signal',
        'plot_base64': plot_base64,
        'parameters': params,  # Use the converted parameters
        'success': True,
        'message': f'Raw signal plotted for {duration}s starting at {start_time}s'
    })

def analyze_psd(edf_reader, parameters):
    """Compute Power Spectral Density"""
    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            # Manual conversion for JsProxy objects
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except Exception as e:
        print(f"Parameter conversion error: {e}")
        params = {'fmin': 0.5, 'fmax': 50, 'method': 'welch'}  # fallback defaults
    
    fmin = params.get('fmin', 0.5)
    fmax = params.get('fmax', 50)
    method = params.get('method', 'welch')

    # Extract advanced settings
    nperseg_seconds = params.get('nperseg_seconds', 4.0)
    noverlap_proportion = params.get('noverlap_proportion', 0.5)
    window = params.get('window', 'hann')
    use_db = params.get('use_db', False)

    all_channels = get_channel_names(edf_reader)

    # Use selected channels from interface
    try:
        selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else all_channels[:4]
    except:
        selected_channels = all_channels[:4]

    # Filter and limit channels
    selected_channels = [ch for ch in selected_channels if ch in all_channels]
    num_channels = min(4, len(selected_channels))  # Limit to 4 for readability
    selected_channels = selected_channels[:num_channels]

    sample_rate = get_sample_frequency(edf_reader)

    # Calculate nperseg and noverlap for Welch method
    nperseg = int(nperseg_seconds * sample_rate)
    noverlap = int(noverlap_proportion * nperseg)

    fig, ax = plt.subplots(figsize=(10, 6))

    for ch_name in selected_channels:
        ch_idx = all_channels.index(ch_name)
        signal_data = get_signal_data(edf_reader, ch_idx)

        # Compute PSD using selected method
        if method == 'welch':
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=nperseg,
                                     noverlap=noverlap, window=window)
        else:  # periodogram
            freqs = np.fft.rfftfreq(len(signal_data), 1/sample_rate)
            fft_vals = np.fft.rfft(signal_data)
            psd = (np.abs(fft_vals) ** 2) / (sample_rate * len(signal_data))

        # Apply dB conversion if requested
        if use_db:
            psd = 10 * np.log10(psd + 1e-20)  # Add small value to avoid log(0)

        # Filter frequency range
        freq_mask = (freqs >= fmin) & (freqs <= fmax)
        freqs_filtered = freqs[freq_mask]
        psd_filtered = psd[freq_mask]

        # Plot (use linear scale for dB, log scale for power)
        if use_db:
            ax.plot(freqs_filtered, psd_filtered, label=ch_name, alpha=0.7)
        else:
            ax.semilogy(freqs_filtered, psd_filtered, label=ch_name, alpha=0.7)

    ax.set_xlabel('Frequency (Hz)')
    # Set y-axis label based on units
    if use_db:
        ax.set_ylabel('Power Spectral Density (dB/Hz)')
    else:
        ax.set_ylabel('Power Spectral Density (V²/Hz)')
    method_title = method.capitalize()
    ax.set_title(f'Power Spectral Density ({method_title})')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xlim(fmin, fmax)
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return json.dumps({
        'analysis_type': 'psd',
        'plot_base64': plot_base64,
        'parameters': params,  # Use the converted parameters
        'success': True,
        'message': f'PSD computed using {method_title} method for frequency range {fmin}-{fmax} Hz'
    })

def analyze_fooof(edf_reader, parameters):
    """
    FOOOF (Fitting Oscillations & One Over F) Spectral Parameterization
    Separates periodic and aperiodic components from power spectra
    """
    if not FOOOF_AVAILABLE:
        return json.dumps({
            'analysis_type': 'fooof',
            'success': False,
            'error': 'FOOOF library not available. Please ensure fooof is installed.'
        })

    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except Exception as e:
        print(f"Parameter conversion error: {e}")
        params = {
            'freq_range': [1, 50],
            'peak_width_limits': [0.5, 12],
            'max_n_peaks': 6,
            'min_peak_height': 0.1,
            'aperiodic_mode': 'fixed',
            'nperseg_seconds': 4.0,
            'noverlap_proportion': 0.5
        }

    # Extract parameters
    freq_range = params.get('freq_range', [1, 50])
    peak_width_limits = params.get('peak_width_limits', [0.5, 12])
    max_n_peaks = params.get('max_n_peaks', 6)
    min_peak_height = params.get('min_peak_height', 0.1)
    aperiodic_mode = params.get('aperiodic_mode', 'fixed')
    nperseg_seconds = params.get('nperseg_seconds', 4.0)
    noverlap_proportion = params.get('noverlap_proportion', 0.5)

    all_channels = get_channel_names(edf_reader)

    # Use selected channels
    try:
        selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else all_channels[:4]
    except:
        selected_channels = all_channels[:4]

    selected_channels = [ch for ch in selected_channels if ch in all_channels]
    num_channels = min(4, len(selected_channels))
    selected_channels = selected_channels[:num_channels]

    sample_rate = get_sample_frequency(edf_reader)

    # Calculate PSD parameters
    nperseg = int(nperseg_seconds * sample_rate)
    noverlap = int(noverlap_proportion * nperseg)

    # Store results for each channel
    fooof_results = {}

    # Create figure with subplots for each channel
    num_rows = num_channels
    fig = plt.figure(figsize=(14, 4 * num_rows))

    for idx, ch_name in enumerate(selected_channels):
        ch_idx = all_channels.index(ch_name)
        signal_data = get_signal_data(edf_reader, ch_idx)

        # Compute PSD using Welch method
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=nperseg,
                                 noverlap=noverlap, window='hann')

        # Filter frequency range for FOOOF
        freq_mask = (freqs >= freq_range[0]) & (freqs <= freq_range[1])
        freqs_fit = freqs[freq_mask]
        psd_fit = psd[freq_mask]

        # Initialize and fit FOOOF model
        try:
            fm = FOOOF(
                peak_width_limits=peak_width_limits,
                max_n_peaks=max_n_peaks,
                min_peak_height=min_peak_height,
                aperiodic_mode=aperiodic_mode,
                verbose=False
            )
            fm.fit(freqs_fit, psd_fit)

            # Extract results
            aperiodic_params = fm.aperiodic_params_
            peak_params = fm.peak_params_
            r_squared = fm.r_squared_
            error = fm.error_

            # Get FOOOF model components
            model_fit = fm.fooofed_spectrum_
            aperiodic_fit = fm._ap_fit

            # Find alpha peaks (8-12 Hz)
            alpha_peaks = []
            if len(peak_params) > 0:
                for peak in peak_params:
                    center_freq, power, bandwidth = peak
                    if 8 <= center_freq <= 12:
                        alpha_peaks.append({
                            'frequency': float(center_freq),
                            'power': float(power),
                            'bandwidth': float(bandwidth)
                        })

            # Store results
            fooof_results[ch_name] = {
                'aperiodic_params': aperiodic_params.tolist(),
                'peak_params': peak_params.tolist() if len(peak_params) > 0 else [],
                'alpha_peaks': alpha_peaks,
                'r_squared': float(r_squared),
                'error': float(error),
                'n_peaks': len(peak_params)
            }

            # Create subplot for this channel (3 panels: original+fit, aperiodic, periodic)
            gs = fig.add_gridspec(num_rows, 3, hspace=0.3, wspace=0.3)

            # Panel 1: Original PSD + FOOOF Fit
            ax1 = fig.add_subplot(gs[idx, 0])
            ax1.semilogy(freqs_fit, psd_fit, color='black', linewidth=2, label='Original PSD', alpha=0.7)
            ax1.semilogy(freqs_fit, model_fit, color='red', linewidth=2, label='FOOOF Fit', linestyle='--')

            # Highlight alpha region
            ax1.axvspan(8, 12, alpha=0.2, color='green', label='Alpha Band')

            # Mark alpha peaks
            for alpha_peak in alpha_peaks:
                ax1.plot(alpha_peak['frequency'], 10**alpha_peak['power'], 'r*', markersize=15)

            ax1.set_xlabel('Frequency (Hz)', fontsize=10)
            ax1.set_ylabel('Power (V²/Hz)', fontsize=10)
            ax1.set_title(f'{ch_name} - Original PSD + FOOOF Fit', fontsize=11, fontweight='bold')
            ax1.legend(fontsize=8)
            ax1.grid(True, alpha=0.3)

            # Add text with aperiodic parameters
            if aperiodic_mode == 'fixed':
                offset, exponent = aperiodic_params
                text_str = f'Offset: {offset:.3f}\\nExponent: {exponent:.3f}\\nR²: {r_squared:.3f}'
            else:  # knee mode
                offset, knee, exponent = aperiodic_params
                text_str = f'Offset: {offset:.3f}\\nKnee: {knee:.3f}\\nExponent: {exponent:.3f}\\nR²: {r_squared:.3f}'

            ax1.text(0.02, 0.98, text_str, transform=ax1.transAxes,
                    fontsize=9, verticalalignment='top',
                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

            # Panel 2: Aperiodic Component
            ax2 = fig.add_subplot(gs[idx, 1])
            ax2.semilogy(freqs_fit, aperiodic_fit, color='blue', linewidth=2, label='Aperiodic (1/f)')
            ax2.set_xlabel('Frequency (Hz)', fontsize=10)
            ax2.set_ylabel('Power (V²/Hz)', fontsize=10)
            ax2.set_title(f'{ch_name} - Aperiodic Component', fontsize=11, fontweight='bold')
            ax2.legend(fontsize=8)
            ax2.grid(True, alpha=0.3)

            # Panel 3: Periodic Component (Flattened Spectrum)
            ax3 = fig.add_subplot(gs[idx, 2])
            # Compute periodic component (original - aperiodic in log space)
            periodic_component = psd_fit - aperiodic_fit
            ax3.plot(freqs_fit, periodic_component, color='purple', linewidth=2, label='Periodic Component')
            ax3.axhline(y=0, color='gray', linestyle='--', linewidth=1, alpha=0.5)

            # Highlight alpha region
            ax3.axvspan(8, 12, alpha=0.2, color='green', label='Alpha Band')

            # Mark detected peaks
            if len(peak_params) > 0:
                for peak in peak_params:
                    center_freq, power, bandwidth = peak
                    # Find closest frequency index
                    peak_idx = np.argmin(np.abs(freqs_fit - center_freq))
                    ax3.plot(center_freq, periodic_component[peak_idx], 'ro', markersize=8)

            ax3.set_xlabel('Frequency (Hz)', fontsize=10)
            ax3.set_ylabel('Power (V²/Hz)', fontsize=10)
            ax3.set_title(f'{ch_name} - Periodic Component', fontsize=11, fontweight='bold')
            ax3.legend(fontsize=8)
            ax3.grid(True, alpha=0.3)

        except Exception as e:
            print(f"FOOOF fitting error for channel {ch_name}: {e}")
            fooof_results[ch_name] = {
                'error': str(e),
                'success': False
            }

    plt.tight_layout()

    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight', facecolor='white')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()

    return json.dumps({
        'analysis_type': 'fooof',
        'plot_base64': plot_base64,
        'parameters': params,
        'results': fooof_results,
        'success': True,
        'message': f'FOOOF analysis completed for {len(selected_channels)} channel(s) in range {freq_range[0]}-{freq_range[1]} Hz'
    })

def analyze_snr(edf_reader, parameters):
    """Compute Signal-to-Noise Ratio"""
    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            # Manual conversion for JsProxy objects
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except Exception as e:
        print(f"Parameter conversion error: {e}")
        params = {'fmin': 1, 'fmax': 40, 'method': 'welch'}  # fallback defaults
    
    fmin = params.get('fmin', 1)
    fmax = params.get('fmax', 40)
    method = params.get('method', 'welch')
    all_channels = get_channel_names(edf_reader)
    
    # Use selected channels from interface
    try:
        selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else all_channels[:4]
    except:
        selected_channels = all_channels[:4]
    
    # Filter and limit channels
    selected_channels = [ch for ch in selected_channels if ch in all_channels]
    num_channels = min(4, len(selected_channels))  # Limit to 4 for readability
    selected_channels = selected_channels[:num_channels]
    
    sample_rate = get_sample_frequency(edf_reader)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    for ch_name in selected_channels:
        ch_idx = all_channels.index(ch_name)
        signal_data = get_signal_data(edf_reader, ch_idx)
        
        # Compute PSD using selected method
        print("METHOD", method)
        if method == 'welch':
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        else:  # periodogram
            freqs = np.fft.rfftfreq(len(signal_data), 1/sample_rate)
            fft_vals = np.fft.rfft(signal_data)
            psd = (np.abs(fft_vals) ** 2) / (sample_rate * len(signal_data))
        
        # Simple SNR estimation MODIFIED
        # noise_floor = np.percentile(psd, 10)
        # snr_db = 10 * np.log10(psd / noise_floor)
        print("TESTE")
        bw = 1.0 # temporary
        snr = np.zeros_like(psd)
        df = freqs[1] - freqs[0]
        half_bw_bins = int(np.round(bw / df))
        for i in range(len(freqs)):
            neigh_idx = np.arange(max(0, i - half_bw_bins), min(len(freqs), i + half_bw_bins + 1))
            neigh_idx = neigh_idx[neigh_idx != i]
            if len(neigh_idx) > 0:
                snr[i] = psd[i] / (psd[neigh_idx].mean() + 1e-16)
            else:
                snr[i] = np.nan
        snr_db = 10 * np.log10(snr)
        
        # Filter frequency range
        freq_mask = (freqs >= fmin) & (freqs <= fmax)
        freqs_filtered = freqs[freq_mask]
        snr_filtered = snr_db[freq_mask]
        
        # Plot
        ax.plot(freqs_filtered, snr_filtered, label=ch_name, alpha=0.7)
    
    ax.axhline(10, linestyle="--", label="10dB threshold", color="green")
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('SNR (dB)')
    method_title = method.capitalize()
    ax.set_title(f'Signal-to-Noise Ratio Spectrum ({method_title})')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xlim(fmin, fmax)
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return json.dumps({
        'analysis_type': 'snr',
        'plot_base64': plot_base64,
        'parameters': params,  # Use the converted parameters
        'success': True,
        'message': f'SNR computed using {method_title} method for frequency range {fmin}-{fmax} Hz'
    })

def analyze_theta_beta_ratio(edf_reader, parameters):
    """Compute Theta-Beta Ratio"""
    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            # Manual conversion for JsProxy objects
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except:
        params = dict(parameters)
    
    theta_min = params.get('theta_min', 4)
    theta_max = params.get('theta_max', 7)
    beta_min = params.get('beta_min', 13)
    beta_max = params.get('beta_max', 30)
    method = params.get('method', 'welch')
    selected_channels = params.get('selected_channels', ['all'])
    
    # Get basic info
    sample_rate = get_sample_frequency(edf_reader)
    all_channels = get_channel_names(edf_reader)
    
    if selected_channels == ['all'] or not selected_channels:
        selected_channels = all_channels[:min(len(all_channels), 5)]
    
    fig, ax = plt.subplots(1, 1, figsize=(12, 8))
    
    theta_powers = []
    beta_powers = []
    ratios = []
    
    for ch_name in selected_channels:
        ch_idx = all_channels.index(ch_name)
        signal_data = get_signal_data(edf_reader, ch_idx)
        
        # Compute PSD using selected method
        if method == 'welch':
            freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        else:  # periodogram
            freqs = np.fft.rfftfreq(len(signal_data), 1/sample_rate)
            fft_vals = np.fft.rfft(signal_data)
            psd = (np.abs(fft_vals) ** 2) / (sample_rate * len(signal_data))
        
        # Calculate theta and beta power
        theta_mask = (freqs >= theta_min) & (freqs <= theta_max)
        beta_mask = (freqs >= beta_min) & (freqs <= beta_max)
        
        theta_power = np.mean(psd[theta_mask])
        beta_power = np.mean(psd[beta_mask])
        ratio = theta_power / beta_power if beta_power > 0 else 0
        
        theta_powers.append(theta_power)
        beta_powers.append(beta_power)
        ratios.append(ratio)
        
        # Plot PSD with highlighted bands
        ax.semilogy(freqs, psd, label=f'{ch_name} (θ/β={ratio:.3f})', alpha=0.7)
        
        # Add semi-transparent bars for theta and beta ranges
        ax.axvspan(theta_min, theta_max, alpha=0.2, color='blue', label='Theta' if ch_name == selected_channels[0] else "")
        ax.axvspan(beta_min, beta_max, alpha=0.2, color='red', label='Beta' if ch_name == selected_channels[0] else "")
    
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('Power Spectral Density (V²/Hz)')
    method_title = method.capitalize()
    ax.set_title(f'Theta-Beta Ratio Analysis ({method_title})')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, max(beta_max + 5, 40))
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    # Calculate average values
    avg_theta_power = np.mean(theta_powers)
    avg_beta_power = np.mean(beta_powers)
    avg_ratio = avg_theta_power / avg_beta_power if avg_beta_power > 0 else 0
    
    return json.dumps({
        'analysis_type': 'theta_beta_ratio',
        'plot_base64': plot_base64,
        'data': {
            'ratio': avg_ratio,
            'theta_power': avg_theta_power,
            'beta_power': avg_beta_power,
            'individual_ratios': ratios,
            'channels': selected_channels
        },
        'parameters': params,
        'success': True,
        'message': f'Theta-Beta ratio computed using {method_title} method. Theta: {theta_min}-{theta_max} Hz, Beta: {beta_min}-{beta_max} Hz'
    })

def analyze_time_frequency(edf_reader, parameters):
    """Compute Time-Frequency Analysis (Spectrogram)"""
    # Convert parameters to Python dict to avoid JsProxy issues
    try:
        if hasattr(parameters, 'to_py'):
            params = parameters.to_py()
        elif str(type(parameters)) == "<class 'pyodide.ffi.JsProxy'>":
            # Manual conversion for JsProxy objects
            params = {}
            for key in parameters:
                params[key] = parameters[key]
        else:
            params = dict(parameters)
    except:
        params = dict(parameters)
    
    freq_min = params.get('freq_min', 1)
    freq_max = params.get('freq_max', 50)
    freq_points = params.get('freq_points', 100)
    time_points = params.get('time_points', 200)
    selected_channel_idx = params.get('selected_channel', 0)
    
    # Get basic info
    sample_rate = get_sample_frequency(edf_reader)
    all_channels = get_channel_names(edf_reader)
    
    # Use the selected channel from dropdown
    if selected_channel_idx < len(all_channels):
        ch_name = all_channels[selected_channel_idx]
    else:
        ch_name = all_channels[0]  # fallback to first channel
    
    fig, ax = plt.subplots(1, 1, figsize=(12, 8))
    
    # Get signal data for the selected channel
    signal_data = get_signal_data(edf_reader, selected_channel_idx)
    
    # Use the full signal (already cropped by time frame if enabled)
    signal_segment = signal_data
        
    # Compute spectrogram
    # Use scipy.signal.spectrogram for time-frequency analysis
    nperseg = min(len(signal_segment) // 8, 512)  # Window size
    noverlap = nperseg // 2  # Overlap
    
    frequencies, times, Sxx = signal.spectrogram(
        signal_segment, 
        fs=sample_rate,
        nperseg=nperseg,
        noverlap=noverlap
    )
    
    # Filter to desired frequency range
    freq_mask = (frequencies >= freq_min) & (frequencies <= freq_max)
    frequencies_filtered = frequencies[freq_mask]
    Sxx_filtered = Sxx[freq_mask, :]
    
    # Convert power to dB scale
    Sxx_db = 10 * np.log10(Sxx_filtered + 1e-12)  # Add small constant to avoid log(0)
    
    # Create spectrogram plot
    im = ax.pcolormesh(times, frequencies_filtered, Sxx_db, 
                       shading='gouraud', cmap='viridis')
    ax.set_xlabel('Time (s)')
    ax.set_ylabel('Frequency (Hz)')
    ax.set_title(f'Time-Frequency Analysis - {ch_name}')
    ax.set_ylim(freq_min, freq_max)
    
    # Add colorbar
    plt.colorbar(im, ax=ax, label='Power (dB)')
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    return json.dumps({
        'analysis_type': 'time_frequency',
        'plot_base64': plot_base64,
        'data': {
            'freq_range': [freq_min, freq_max],
            'channel': ch_name,
            'channel_index': selected_channel_idx
        },
        'parameters': params,
        'success': True,
        'message': f'Time-frequency analysis computed for channel {ch_name}. Frequency range: {freq_min}-{freq_max} Hz'
    })

def test_spectrum_methods():
    """Test function to verify Welch vs Periodogram methods produce different results"""
    import numpy as np
    import matplotlib.pyplot as plt
    from scipy import signal
    import json
    import io
    import base64
    
    # Generate synthetic test signal with known frequency components
    fs = 250  # Sample rate
    duration = 4  # seconds
    t = np.linspace(0, duration, fs * duration, endpoint=False)
    
    # Create signal with multiple frequency components + noise
    signal_clean = (np.sin(2 * np.pi * 10 * t) +     # 10 Hz
                   0.5 * np.sin(2 * np.pi * 40 * t) +  # 40 Hz  
                   0.3 * np.sin(2 * np.pi * 60 * t))   # 60 Hz
    
    # Add noise
    np.random.seed(42)  # For reproducible results
    noise = 0.2 * np.random.randn(len(t))
    test_signal = signal_clean + noise
    
    # Method 1: Welch
    freqs_welch, psd_welch = signal.welch(test_signal, fs=fs, nperseg=2048)
    
    # Method 2: Periodogram (full-time period)
    freqs_period = np.fft.rfftfreq(len(test_signal), 1/fs)
    fft_vals = np.fft.rfft(test_signal)
    psd_period = (np.abs(fft_vals) ** 2) / (fs * len(test_signal))
    
    # Create comparison plot
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10))
    
    # Plot 1: Original signal
    ax1.plot(t[:fs], test_signal[:fs])  # Show first second
    ax1.set_title('Test Signal (First Second)')
    ax1.set_xlabel('Time (s)')
    ax1.set_ylabel('Amplitude')
    ax1.grid(True, alpha=0.3)
    
    # Plot 2: Welch PSD
    ax2.semilogy(freqs_welch, psd_welch, 'b-', label='Welch Method')
    ax2.set_title('Power Spectral Density - Welch Method')
    ax2.set_xlabel('Frequency (Hz)')
    ax2.set_ylabel('PSD (V²/Hz)')
    ax2.set_xlim(0, 100)
    ax2.grid(True, alpha=0.3)
    ax2.legend()
    
    # Plot 3: Periodogram PSD
    ax3.semilogy(freqs_period, psd_period, 'r-', label='Periodogram Method')
    ax3.set_title('Power Spectral Density - Periodogram Method')
    ax3.set_xlabel('Frequency (Hz)')
    ax3.set_ylabel('PSD (V²/Hz)')
    ax3.set_xlim(0, 100)
    ax3.grid(True, alpha=0.3)
    ax3.legend()
    
    plt.tight_layout()
    
    # Convert to base64
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
    buffer.seek(0)
    plot_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    
    # Calculate some metrics for comparison
    welch_peak_10hz = psd_welch[np.argmin(np.abs(freqs_welch - 10))]
    period_peak_10hz = psd_period[np.argmin(np.abs(freqs_period - 10))]
    
    welch_peak_40hz = psd_welch[np.argmin(np.abs(freqs_welch - 40))]
    period_peak_40hz = psd_period[np.argmin(np.abs(freqs_period - 40))]
    
    # Calculate frequency resolution
    welch_freq_res = freqs_welch[1] - freqs_welch[0]
    period_freq_res = freqs_period[1] - freqs_period[0]
    
    comparison_text = f"""
SPECTRUM METHOD COMPARISON TEST

Frequency Resolution:
- Welch: {welch_freq_res:.3f} Hz
- Periodogram: {period_freq_res:.3f} Hz

Power at 10 Hz:
- Welch: {welch_peak_10hz:.2e}
- Periodogram: {period_peak_10hz:.2e}
- Ratio: {period_peak_10hz/welch_peak_10hz:.2f}

Power at 40 Hz:
- Welch: {welch_peak_40hz:.2e}  
- Periodogram: {period_peak_40hz:.2e}
- Ratio: {period_peak_40hz/welch_peak_40hz:.2f}

Expected Differences:
- Periodogram should have finer frequency resolution
- Periodogram should be noisier (more variance)
- Welch should be smoother due to averaging
"""
    
    return json.dumps({
        'analysis_type': 'spectrum_test',
        'plot_base64': plot_base64,
        'success': True,
        'message': comparison_text,
        'data': {
            'welch_freq_res': float(welch_freq_res),
            'period_freq_res': float(period_freq_res),
            'welch_10hz': float(welch_peak_10hz),
            'period_10hz': float(period_peak_10hz),
            'methods_different': abs(period_peak_10hz - welch_peak_10hz) / welch_peak_10hz > 0.1
        }
    })

print("Python EDF analysis environment ready!")
      `);
      
      pyodideRef.current = pyodide;
      setPyodideReady(true);
      setSuccess('Python environment loaded successfully!');
      
    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      setError(`Failed to load Python environment: ${error}`);
    } finally {
      setPyodideLoading(false);
      setLoadingMessage('');
    }
  }, [pyodideReady, pyodideLoading]);

  // Load Pyodide on component mount
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
    script.onload = initializePyodide;
    script.onerror = () => {
      setError('Failed to load Pyodide library');
      setPyodideLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [initializePyodide]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };
  
  // Helper function to calculate real-world time for annotations
  const calculateRealWorldTime = (onset: number): string | undefined => {
    if (!metadata) {
      return undefined;
    }
    
    if (!metadata.start_date || !metadata.start_time) {
      return undefined;
    }
    
    try {
      // Handle different date/time formats
      let startDate: Date;
      
      // Try multiple formats
      const formatAttempts = [
        // ISO format
        `${metadata.start_date}T${metadata.start_time}`,
        // Space separated
        `${metadata.start_date} ${metadata.start_time}`,
        // Alternative formats
        metadata.start_date.includes('/') ? `${metadata.start_date} ${metadata.start_time}` : null,
      ].filter(Boolean);
      
      let dateCreated = false;
      for (const dateStr of formatAttempts) {
        try {
          startDate = new Date(dateStr as string);
          if (!isNaN(startDate.getTime())) {
            dateCreated = true;
            break;
          }
        } catch {
          // Continue to next format attempt
        }
      }
      
      if (!dateCreated || isNaN(startDate!.getTime())) {
        return undefined;
      }
      
      // Calculate annotation time using start_time + timedelta(seconds=onset)
      const annotationTime = new Date(startDate!.getTime() + onset * 1000);
      const result = annotationTime.toISOString().slice(0, 23).replace('T', ' ');
      return result;
    } catch (error) {
      console.error('Error calculating real-world time:', error);
      return undefined;
    }
  };

  // Helper function to format real-world time in HH:MM:SS format only
  const formatTimeHMS = (timeInSeconds: number): string | undefined => {
    const fullTime = calculateRealWorldTime(timeInSeconds);
    if (!fullTime) return undefined;
    
    // Extract HH:MM:SS from the full datetime string
    // Full format is "YYYY-MM-DD HH:MM:SS.mmm"
    const timePart = fullTime.split(' ')[1];
    if (timePart) {
      return timePart.slice(0, 8); // Get HH:MM:SS part
    }
    return undefined;
  };

  // Channel rename functions
  const openChannelRenamePopup = () => {
    setChannelToRename(metadata?.channel_names?.[0] || '');
    setNewChannelName('');
    setShowChannelRenamePopup(true);
  };

  const submitChannelRename = () => {
    if (channelToRename && newChannelName.trim() && channelToRename !== newChannelName.trim()) {
      const newMap = { ...channelRenameMap };
      newMap[channelToRename] = newChannelName.trim();
      setChannelRenameMap(newMap);
      
      // Update selected channels if the renamed channel was selected
      setSelectedChannels(prev => 
        prev.map(ch => ch === channelToRename ? newChannelName.trim() : ch)
      );
      
      setShowChannelRenamePopup(false);
      setChannelToRename('');
      setNewChannelName('');
    }
  };

  // Get display name for a channel (renamed or original)
  const getChannelDisplayName = (originalName: string): string => {
    return channelRenameMap[originalName] || originalName;
  };


  // Download modified EDF file
  const downloadModifiedEDF = async () => {
    if (!pyodideRef.current || !metadata || !currentFile) {
      alert('EDF file not loaded or Pyodide not ready');
      return;
    }

    try {
      setLoadingMessage('Preparing modified EDF file for download...');

      // Set parameters in Python
      pyodideRef.current.globals.set('channel_rename_map', pyodideRef.current.toPy(channelRenameMap));
      pyodideRef.current.globals.set('custom_annotations', pyodideRef.current.toPy(annotations.filter(ann => ann.is_custom)));

      // Run the export function in Python
      const result = await pyodideRef.current.runPythonAsync(`
def export_modified_edf():
    """Export modified EDF file with renamed channels and custom annotations"""
    import io
    import base64
    import json
    from datetime import datetime, timedelta
    
    try:
        if not MNE_AVAILABLE:
            return json.dumps({
                'success': False,
                'error': 'MNE not available for EDF export'
            })
        
        # Get the current raw object
        raw = globals().get('edf_reader')
        if raw is None:
            return json.dumps({
                'success': False,
                'error': 'No EDF file loaded'
            })
        
        # Make a copy of the raw object
        raw_copy = raw.copy()
        
        # Apply channel renaming
        rename_map = {}
        if 'channel_rename_map' in globals():
            for old_name, new_name in channel_rename_map.items():
                if old_name in raw_copy.ch_names:
                    rename_map[old_name] = new_name
        
        if rename_map:
            raw_copy.rename_channels(rename_map)
        
        # Add custom annotations
        if 'custom_annotations' in globals() and len(custom_annotations) > 0:
            # Convert custom annotations to MNE format
            onsets = []
            durations = []
            descriptions = []
            
            for ann in custom_annotations:
                onsets.append(float(ann['onset']))
                durations.append(float(ann['duration']))
                descriptions.append(str(ann['description']))
            
            # Create new annotations object
            from mne import Annotations
            new_annotations = Annotations(
                onset=onsets,
                duration=durations,
                description=descriptions
            )
            
            # Add to existing annotations
            if raw_copy.annotations is not None and len(raw_copy.annotations) > 0:
                # Combine existing and new annotations
                combined_onsets = list(raw_copy.annotations.onset) + onsets
                combined_durations = list(raw_copy.annotations.duration) + durations
                combined_descriptions = list(raw_copy.annotations.description) + descriptions
                
                combined_annotations = Annotations(
                    onset=combined_onsets,
                    duration=combined_durations,
                    description=combined_descriptions
                )
                raw_copy.set_annotations(combined_annotations)
            else:
                raw_copy.set_annotations(new_annotations)
        
        # Export to EDF format
        # Create a temporary filename
        import tempfile
        import os
        
        # Create temporary file for export
        temp_fd, temp_path = tempfile.mkstemp(suffix='.edf')
        os.close(temp_fd)  # Close the file descriptor
        
        try:
            # Export to EDF
            raw_copy.export(temp_path, fmt='edf', overwrite=True)
            
            # Read the file back as binary data
            with open(temp_path, 'rb') as f:
                edf_data = f.read()
            
            # Encode as base64 for download
            edf_base64 = base64.b64encode(edf_data).decode('utf-8')
            
            return json.dumps({
                'success': True,
                'data': edf_base64,
                'filename': 'modified_recording.edf',
                'message': f'Modified EDF prepared for download ({len(rename_map)} channels renamed, {len(custom_annotations) if "custom_annotations" in globals() else 0} custom annotations added)'
            })
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        import traceback
        return json.dumps({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        })

# Run the export function
export_modified_edf()
      `);

      const parsedResult = JSON.parse(result);
      
      if (parsedResult.success) {
        // Create download link
        const binaryData = atob(parsedResult.data);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          bytes[i] = binaryData.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = parsedResult.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setSuccess(parsedResult.message);
      } else {
        setError(`Export failed: ${parsedResult.error}`);
        console.error('Export error:', parsedResult.traceback);
      }
      
    } catch (error) {
      console.error('Download error:', error);
      setError(`Download failed: ${error}`);
    } finally {
      setLoadingMessage('');
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pyodideReady) {
      setDragActive(true);
    }
  }, [pyodideReady]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pyodideReady) {
      setDragActive(false);
    }
  }, [pyodideReady]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!pyodideReady) {
      setError('Python environment not ready. Please wait for initialization.');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }, [pyodideReady]);

  // Progress simulation for better UX
  const simulateProgress = useCallback((duration: number) => {
    setAnalysisProgress(0);
    const steps = 20;
    const stepDuration = duration / steps;
    
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      currentStep++;
      setAnalysisProgress((currentStep / steps) * 100);
      
      if (currentStep >= steps) {
        clearInterval(progressInterval);
      }
    }, stepDuration);

    return progressInterval;
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!pyodideReady || !pyodideRef.current) {
      setError('Python environment not ready. Please wait for initialization.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.edf') && !file.name.toLowerCase().endsWith('.fif') && !file.name.toLowerCase().endsWith('.bdf')) {
      setError('Please select an EDF or BDF file');
      return;
    }

    clearMessages();
    setLoadingMessage('Reading EDF file...');

    try {
      // Read file as bytes
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Set file data in Python globals using proper Pyodide method
      pyodideRef.current.globals.set('js_uint8_array', uint8Array);
      pyodideRef.current.globals.set('filename', file.name);
      
      // Convert JavaScript Uint8Array to Python bytes
      const result = await pyodideRef.current.runPython(`
        # Convert JavaScript Uint8Array to Python bytes
        file_bytes = bytes(js_uint8_array)
        
        print(f"Converted to Python bytes: {len(file_bytes)} bytes, type: {type(file_bytes)}")
        
        read_edf_file(file_bytes, filename)
      `);
      
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.error) {
        setError(`Failed to read EDF file: ${parsedResult.error}`);
        return;
      }
      
      setCurrentFile(file);
      setMetadata(parsedResult);
      setSuccess(`File loaded: ${parsedResult.filename} (${parsedResult.num_channels} channels, ${parsedResult.duration_seconds?.toFixed(1)}s)`);
      
      // Set all channels as selected by default
      if (parsedResult.channel_names && parsedResult.channel_names.length > 0) {
        setSelectedChannels(parsedResult.channel_names);
      }
      
      // Initialize time frame to full duration
      if (parsedResult.duration_seconds) {
        setTimeFrameEnd(parsedResult.duration_seconds);
      }
      
      // Initialize annotations if available
      if (parsedResult.annotations && parsedResult.annotations.length > 0) {
        setAnnotations(parsedResult.annotations);
      } else {
        setAnnotations([]);
      }
      
      // Clear previous results
      setAnalysisResults([]);
      setSSVEPResult(null);
      
    } catch (error) {
      console.error('File processing error:', error);
      setError(`File processing failed: ${error}`);
    } finally {
      setLoadingMessage('');
    }
  }, [pyodideReady]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const runSSVEPAnalysis = async () => {
    if (!pyodideReady || !currentFile) {
      setError('File not loaded or Python environment not ready');
      return;
    }

    setIsAnalyzing(true);
    clearMessages();
    setLoadingMessage('Running comprehensive SSVEP analysis...');
    
    // Start progress simulation for SSVEP analysis (longer process)
    const progressInterval = simulateProgress(8000); // 8 seconds

    try {
      // Set parameters in Python
      pyodideRef.current.globals.set('target_freq', ssvepParams.target_frequency);
      pyodideRef.current.globals.set('pca_components', ssvepParams.pca_components);
      pyodideRef.current.globals.set('frequency_bands', ssvepParams.frequency_bands);
      pyodideRef.current.globals.set('js_selected_channels', selectedChannels);
      
      // Set time frame parameters if enabled
      if (useTimeFrame) {
        pyodideRef.current.globals.set('start_time', Math.floor(timeFrameStart));
        pyodideRef.current.globals.set('end_time', Math.ceil(timeFrameEnd));
      } else {
        pyodideRef.current.globals.set('start_time', null);
        pyodideRef.current.globals.set('end_time', null);
      }

      // Run analysis with time frame parameters
      const result = await pyodideRef.current.runPython(`
        analyze_ssvep(target_freq, pca_components, frequency_bands, start_time, end_time)
      `);

      const parsedResult = JSON.parse(result);

      if (parsedResult.error) {
        let errorMsg = `SSVEP analysis failed: ${parsedResult.error}`;
        if (parsedResult.traceback) {
          errorMsg += `\n\nPython traceback:\n${parsedResult.traceback}`;
          console.error('Python SSVEP analysis error:', parsedResult);
        }
        setError(errorMsg);
        return;
      }

      setSSVEPResult(parsedResult);
      setSuccess('SSVEP analysis completed successfully!');

    } catch (error) {
      console.error('SSVEP analysis error:', error);
      setError(`Analysis failed: ${error}`);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      setLoadingMessage('');
      setAnalysisProgress(100);
      setTimeout(() => setAnalysisProgress(0), 1000); // Clear progress after 1s
    }
  };

  const runTraditionalAnalysis = async (analysisType: string) => {
    if (!pyodideReady || !currentFile) {
      setError('File not loaded or Python environment not ready');
      return;
    }

    setIsAnalyzing(true);
    clearMessages();
    setLoadingMessage(`Running ${analysisType} analysis...`);
    
    // Start progress simulation for traditional analysis
    const progressInterval = simulateProgress(3000); // 3 seconds

    try {
      let parameters;
      if (analysisType === 'raw_signal') {
        parameters = analysisParams.raw_signal;
      } else if (analysisType === 'psd') {
        // Merge base parameters with advanced settings for PSD
        parameters = {
          ...analysisParams.psd,
          ...advancedPSDSettings
        };
      } else if (analysisType === 'fooof') {
        // Use FOOOF parameters
        parameters = fooofParams;
      } else if (analysisType === 'snr') {
        parameters = analysisParams.snr;
      } else if (analysisType === 'theta_beta_ratio') {
        parameters = analysisParams.theta_beta_ratio;
      } else if (analysisType === 'time_frequency') {
        parameters = analysisParams.time_frequency;
      }

      // Set parameters in Python - convert to ensure proper serialization
      pyodideRef.current.globals.set('analysis_type', analysisType);
      pyodideRef.current.globals.set('parameters', pyodideRef.current.toPy(parameters));
      pyodideRef.current.globals.set('js_selected_channels', selectedChannels);
      
      // Set time frame parameters if enabled
      if (useTimeFrame) {
        pyodideRef.current.globals.set('start_time', Math.floor(timeFrameStart));
        pyodideRef.current.globals.set('end_time', Math.ceil(timeFrameEnd));
      } else {
        pyodideRef.current.globals.set('start_time', null);
        pyodideRef.current.globals.set('end_time', null);
      }

      // Run analysis with time frame parameters
      const result = await pyodideRef.current.runPython(`
        analyze_traditional(analysis_type, parameters, start_time, end_time)
      `);

      const parsedResult = JSON.parse(result);

      if (!parsedResult.success) {
        let errorMsg = `Analysis failed: ${parsedResult.error}`;
        if (parsedResult.traceback) {
          errorMsg += `\n\nPython traceback:\n${parsedResult.traceback}`;
          console.error('Python analysis error:', parsedResult);
        }
        setError(errorMsg);
        return;
      }

      // Add time frame information to the result
      if (useTimeFrame) {
        parsedResult.time_frame = {
          start: timeFrameStart,
          end: timeFrameEnd,
          start_real_time: calculateRealWorldTime(timeFrameStart),
          end_real_time: calculateRealWorldTime(timeFrameEnd)
        };
      }

      setAnalysisResults(prev => [...prev, parsedResult]);
      setSuccess(`${analysisType} analysis completed!`);

    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Analysis failed: ${error}`);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      setLoadingMessage('');
      setAnalysisProgress(100);
      setTimeout(() => setAnalysisProgress(0), 1000); // Clear progress after 1s
    }
  };

  const toggleCollapse = (resultId: number) => {
    setCollapsedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resultId)) {
        newSet.delete(resultId);
      } else {
        newSet.add(resultId);
      }
      return newSet;
    });
  };

  const prepareReportData = (): PatientReportData | null => {
    if (!metadata || !currentFile) {
      return null;
    }

    // Find the LAST (most recent) PSD analysis result
    const psdResults = analysisResults.filter(r => r.analysis_type === 'psd');
    const psdResult = psdResults.length > 0 ? psdResults[psdResults.length - 1] : null;

    if (!psdResult) {
      return null;
    }

    return {
      // Patient information (can be extended to accept user input)
      patientName: 'Patient Name', // TODO: Add input fields for this
      patientId: metadata.subject_id || 'N/A',
      examDate: new Date().toISOString().split('T')[0],

      // File information
      fileName: currentFile.name,
      recordingDate: metadata.start_date && metadata.start_time
        ? `${metadata.start_date} ${metadata.start_time}`
        : 'N/A',
      duration: metadata.duration_seconds,
      samplingRate: metadata.sampling_frequency,
      numChannels: metadata.num_channels,
      channelNames: metadata.channel_names,

      // Analysis parameters
      selectedChannels: selectedChannels,
      timeFrame: psdResult.time_frame ? {
        start: psdResult.time_frame.start,
        end: psdResult.time_frame.end,
        start_real_time: psdResult.time_frame.start_real_time,
        end_real_time: psdResult.time_frame.end_real_time,
      } : undefined,

      // PSD analysis results
      psdMethod: psdResult.parameters?.method || 'welch',
      frequencyRange: {
        min: psdResult.parameters?.fmin || 0.5,
        max: psdResult.parameters?.fmax || 50,
      },
      psdPlotBase64: psdResult.plot_base64, // The base64 encoded plot

      // Annotations
      annotations: annotations.map(ann => ({
        time: ann.onset,
        type: 'event',
        description: ann.description || 'N/A',
      })),
    };
  };

  const generatePatientReport = async () => {
    if (!pyodideReady || !metadata || !currentFile) {
      setError('Cannot generate report: File not loaded or Python environment not ready');
      return;
    }

    const reportData = prepareReportData();

    if (!reportData) {
      setError('Please run PSD analysis first before generating the report');
      return;
    }

    setGeneratingPDF(true);
    clearMessages();
    setLoadingMessage('Generating patient report PDF...');

    try {
      // Generate PDF using Pyodide
      const pdfBase64 = await generatePatientReportPDF(pyodideRef.current, reportData);

      // Download the PDF
      const filename = `EEG_Report_${reportData.patientId}_${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPDF(pdfBase64, filename);

      setSuccess('Patient report PDF generated successfully!');

    } catch (error) {
      console.error('Report generation error:', error);
      setError(`Failed to generate PDF report: ${error}`);
    } finally {
      setGeneratingPDF(false);
      setLoadingMessage('');
    }
  };

  const generatePatientReportDOCXFile = async () => {
    if (!pyodideReady || !metadata || !currentFile) {
      setError('Cannot generate report: File not loaded or Python environment not ready');
      return;
    }

    const reportData = prepareReportData();

    if (!reportData) {
      setError('Please run PSD analysis first before generating the report');
      return;
    }

    setGeneratingPDF(true);
    clearMessages();
    setLoadingMessage('Generating patient report DOCX...');

    try {
      // Generate DOCX using Pyodide
      const docxBase64 = await generatePatientReportDOCX(pyodideRef.current, reportData);

      // Download the DOCX
      const filename = `EEG_Report_${reportData.patientId}_${new Date().toISOString().split('T')[0]}.docx`;
      downloadDOCX(docxBase64, filename);

      setSuccess('Patient report DOCX generated successfully! You can convert it to PDF locally for perfect formatting.');

    } catch (error) {
      console.error('Report generation error:', error);
      setError(`Failed to generate DOCX report: ${error}`);
    } finally {
      setGeneratingPDF(false);
      setLoadingMessage('');
    }
  };

  const renderSSVEPResults = () => {
    if (!ssvepResult) return null;

    const isCollapsed = collapsedResults.has(0);

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">SSVEP Analysis Results</h3>
          <button
            onClick={() => toggleCollapse(0)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            {isCollapsed ? '▼ Expand' : '▲ Collapse'}
          </button>
        </div>
        
        {!isCollapsed && (
        <>
        {/* Main visualization */}
        <div className="mb-6">
          <img 
            src={`data:image/png;base64,${ssvepResult.visualization_base64}`} 
            alt="SSVEP Comprehensive Analysis"
            className="w-full max-w-4xl mx-auto"
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <h4 className="font-semibold text-blue-900">Target Frequency</h4>
            <p className="text-2xl font-bold text-blue-700">{ssvepResult.target_frequency} Hz</p>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <h4 className="font-semibold text-green-900">Best Channel</h4>
            <p className="text-lg font-bold text-green-700">{ssvepResult.summary.best_channel}</p>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <h4 className="font-semibold text-purple-900">Average SNR</h4>
            <p className="text-xl font-bold text-purple-700">{ssvepResult.summary.average_snr.toFixed(2)} dB</p>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg text-center">
            <h4 className="font-semibold text-yellow-900">High Confidence</h4>
            <p className="text-xl font-bold text-yellow-700">{ssvepResult.summary.high_confidence_channels} channels</p>
          </div>
        </div>

        {/* Detailed results table */}
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SNR (dB)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peak Power</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ssvepResult.ssvep_detection).map(([channel, data]) => (
                <tr key={channel} className="border-t border-gray-200">
                  <td className="px-4 py-2 text-sm font-medium">{channel}</td>
                  <td className="px-4 py-2 text-sm">{data.snr_db.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm">{data.peak_power.toExponential(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      data.detection_confidence === 'high' ? 'bg-green-100 text-green-800' :
                      data.detection_confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {data.detection_confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    );
  };

  const renderAnalysisResults = () => {
    if (analysisResults.length === 0) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <h3 className="text-lg font-bold mb-4">Traditional Analysis Results</h3>
        
        {analysisResults.map((result, index) => {
          const resultId = index + 10; // Offset to avoid collision with SSVEP (id 0)
          const isCollapsed = collapsedResults.has(resultId);
          
          return (
            <div key={index} className="mb-6 border rounded-lg">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-t-lg">
                <h4 className="text-md font-semibold capitalize">
                  {result.analysis_type.replace('_', ' ')} Analysis
                  {(result.analysis_type === 'psd' || result.analysis_type === 'snr') && result.parameters?.method && (
                    <span className="text-sm font-normal text-blue-600 ml-2">
                      ({result.parameters.method.charAt(0).toUpperCase() + result.parameters.method.slice(1)})
                    </span>
                  )}
                  {result.time_frame && (
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      ({formatTimeHMS(result.time_frame.start) || result.time_frame.start.toFixed(1)+'s'} - {formatTimeHMS(result.time_frame.end) || result.time_frame.end.toFixed(1)+'s'})
                    </span>
                  )}
                </h4>
                <button
                  onClick={() => toggleCollapse(resultId)}
                  className="px-2 py-1 text-sm bg-white hover:bg-gray-100 rounded flex items-center gap-1"
                >
                  {isCollapsed ? '▼' : '▲'}
                </button>
              </div>
              
              {!isCollapsed && (
                <div className="p-3">
                  {/* Display theta-beta ratio result if available */}
                  {result.analysis_type === 'theta_beta_ratio' && result.data && typeof result.data === 'object' && result.data !== null && 'ratio' in result.data && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-2xl font-bold text-blue-800 mb-2">
                        Theta/Beta Ratio: {typeof result.data.ratio === 'number' ? result.data.ratio.toFixed(3) : String(result.data.ratio)}
                      </div>
                      {result.data.theta_power && result.data.beta_power && (
                        <div className="text-sm text-gray-600">
                          Theta Power: {(result.data.theta_power as number).toFixed(3)} | 
                          Beta Power: {(result.data.beta_power as number).toFixed(3)}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {result.plot_base64 && (
                    <div className="mb-4">
                      <img 
                        src={`data:image/png;base64,${result.plot_base64}`} 
                        alt={`${result.analysis_type} plot`}
                        className="w-full max-w-4xl mx-auto"
                      />
                    </div>
                  )}
                  
                  {result.message && (
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      {result.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <h1 className="text-xl font-bold text-center mb-2">
            Browser EEG/EDF Analysis
          </h1>
          <p className="text-gray-600 text-center text-sm mb-4">
            Python-powered EEG analysis in your browser • No server • No limits
          </p>

          {/* Status indicators */}
          <div className="flex justify-center space-x-3 mb-3">
            <div className={`px-3 py-1 rounded text-sm ${pyodideReady ? 'bg-green-100 text-green-800' : pyodideLoading ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
              🐍 Python: {pyodideReady ? 'Ready' : pyodideLoading ? 'Loading...' : 'Not Loaded'}
            </div>
            <div className={`px-3 py-1 rounded text-sm ${currentFile ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
              📁 File: {currentFile ? 'Loaded' : 'None'}
            </div>
            <div className={`px-3 py-1 rounded text-sm ${isAnalyzing ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'}`}>
              ⚡ Status: {isAnalyzing ? 'Analyzing...' : 'Ready'}
            </div>
          </div>
        </div>

        {/* Loading message and progress */}
        {loadingMessage && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            <div className="flex items-center justify-center mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
              {loadingMessage}
            </div>
            {/* Progress bar for analysis */}
            {isAnalyzing && analysisProgress > 0 && (
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          {!currentFile ? (
            <>
              <h2 className="text-lg font-semibold mb-3">Load EDF File</h2>
              <div 
                ref={dropZoneRef}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 ${
                  !pyodideReady
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400 cursor-pointer'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".edf,.bdf,.fif"
                  className="hidden"
                  disabled={!pyodideReady}
                />
                
                <div className="flex items-center justify-center space-x-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!pyodideReady}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50 transition-colors"
                    >
                      {pyodideReady ? 'Choose EDF/BDF File' : 'Waiting for Python...'}
                    </button>
                    
                    <p className="text-sm text-gray-600 mt-1">
                      {dragActive ? 'Drop your EDF file here!' : pyodideReady ? 'Or drag & drop your file here' : 'Please wait for Python environment to load...'}
                    </p>
                    <p className="text-xs text-gray-400">
                      Local processing • No uploads • No limits
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">File Loaded: {currentFile.name}</h3>
                    <p className="text-xs text-gray-500">Ready for analysis</p>
                  </div>
                </div>
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!pyodideReady}
                  className="bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-3 rounded disabled:opacity-50 transition-colors"
                >
                  Change File
                </button>
              </div>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".edf,.bdf,.fif"
                className="hidden"
                disabled={!pyodideReady}
              />
            </>
          )}
        </div>

        {/* File Information */}
        {metadata && (
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">File Information: {metadata.filename}</h3>
            
            {/* Library information */}
            <div className={`px-4 py-3 rounded mb-4 ${
              metadata.library_used === 'MNE-Python' ? 'bg-green-100 border border-green-400 text-green-800' :
              metadata.library_used === 'pyedflib' ? 'bg-blue-100 border border-blue-400 text-blue-800' :
              'bg-purple-100 border border-purple-400 text-purple-800'
            }`}>
              <div className="flex items-center">
                <div className="mr-2">
                  {metadata.library_used === 'MNE-Python' ? '🧠' : 
                   metadata.library_used === 'pyedflib' ? '📊' : '🔧'}
                </div>
                <div>
                  <p className="font-medium">
                    Processing Library: {metadata.library_used || 'Pure Python EDF Reader'}
                  </p>
                  <p className="text-sm">
                    {metadata.library_used === 'MNE-Python' ? 'Using MNE-Python for advanced neuroimaging analysis' :
                     metadata.library_used === 'pyedflib' ? 'Using pyedflib for standard EDF processing' :
                     'Using custom pure Python EDF reader - fully functional without external dependencies'}
                  </p>
                  {metadata.real_data && (
                    <p className="text-xs font-medium mt-1">✅ Reading actual EDF file data</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Size:</span> {metadata.file_size_mb} MB
              </div>
              <div>
                <span className="font-medium">Channels:</span> {metadata.num_channels}
              </div>
              <div>
                <span className="font-medium">Duration:</span> {metadata.duration_seconds.toFixed(1)}s
              </div>
              <div>
                <span className="font-medium">Sample Rate:</span> {metadata.sampling_frequency}Hz
              </div>
            </div>
            
            {metadata.channel_names && metadata.channel_names.length <= 20 && (
              <div className="mt-4">
                <span className="font-medium">Channels:</span>
                <div className="mt-2 text-xs">
                  {metadata.channel_names.join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Channel Selection */}
        {metadata && metadata.channel_names && (
          <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <h3 className="text-lg font-semibold mb-3">Channel Selection</h3>
            <p className="text-sm text-gray-600 mb-3">Select channels to include in analysis:</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => setSelectedChannels(metadata.channel_names || [])}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedChannels([])}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Clear All
              </button>
              <button
                onClick={openChannelRenamePopup}
                className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
              >
                Rename Channel
              </button>
              <button
                onClick={downloadModifiedEDF}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200"
              >
                Download Modified EDF
              </button>
            </div>
            
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {metadata.channel_names.map((channel) => (
                <label key={channel} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(channel)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedChannels([...selectedChannels, channel]);
                      } else {
                        setSelectedChannels(selectedChannels.filter(ch => ch !== channel));
                      }
                    }}
                    className="text-blue-600"
                  />
                  <span className="text-sm font-mono">
                    {getChannelDisplayName(channel)}
                    {channelRenameMap[channel] && (
                      <span className="text-xs text-gray-500 ml-1">({channel})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            
            <div className="mt-3 text-sm text-gray-600">
              Selected: {selectedChannels.length} of {metadata.channel_names.length} channels
            </div>
          </div>
        )}

        {/* Annotation Management */}
        {metadata && (
          <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Annotation Management</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const onset = timeFrameStart || 0;
                    const newAnnotation: EDFAnnotation = {
                      id: `custom_${Date.now()}`,
                      onset: onset,
                      duration: 1.0,
                      description: 'New Annotation',
                      is_custom: true,
                      real_time: calculateRealWorldTime(onset)
                    };
                    setAnnotations(prev => [...prev, newAnnotation]);
                    setAnnotationsNeedUpdate(true);
                  }}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  + Add Annotation
                </button>
                {annotationsNeedUpdate && (
                  <button
                    onClick={() => setAnnotationsNeedUpdate(false)}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Update Timeline
                  </button>
                )}
              </div>
            </div>
            
            {annotations.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-3">
                  Found {annotations.filter(a => !a.is_custom).length} EDF annotations, 
                  {annotations.filter(a => a.is_custom).length} custom annotations
                </p>
                
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {annotations.map((annotation, index) => (
                    <div 
                      key={annotation.id} 
                      className={`p-3 rounded border ${
                        annotation.is_custom 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description:
                          </label>
                          <input
                            type="text"
                            value={annotation.description}
                            onChange={(e) => {
                              const updated = [...annotations];
                              updated[index].description = e.target.value;
                              setAnnotations(updated);
                              if (!annotation.is_custom) setAnnotationsNeedUpdate(true);
                            }}
                            className="w-full p-2 text-sm border border-gray-300 rounded"
                            disabled={!annotation.is_custom && annotations.filter(a => a.id === annotation.id).length > 0}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Time (seconds):
                          </label>
                          <input
                            type="number"
                            value={annotation.onset}
                            onChange={(e) => {
                              const newOnset = Math.max(0, parseFloat(e.target.value) || 0);
                              const updated = [...annotations];
                              updated[index].onset = newOnset;
                              // Update real-world time if this is a custom annotation
                              if (updated[index].is_custom) {
                                updated[index].real_time = calculateRealWorldTime(newOnset);
                              }
                              setAnnotations(updated);
                              setAnnotationsNeedUpdate(true);
                            }}
                            step="0.1"
                            min={0}
                            max={metadata.duration_seconds || 0}
                            className="w-full p-2 text-sm border border-gray-300 rounded"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Duration (s):
                          </label>
                          <input
                            type="number"
                            value={annotation.duration}
                            onChange={(e) => {
                              const newDuration = Math.max(0.0, parseFloat(e.target.value) || 0.0);
                              const updated = [...annotations];
                              updated[index].duration = newDuration;
                              setAnnotations(updated);
                              setAnnotationsNeedUpdate(true);
                            }}
                            step="0.1"
                            min={0.0}
                            className="w-full p-2 text-sm border border-gray-300 rounded"
                          />
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {annotation.real_time && (
                            <div className="text-xs text-gray-600">
                              {annotation.real_time}
                            </div>
                          )}
                          
                          {annotation.is_custom && (
                            <button
                              onClick={() => {
                                setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
                                setAnnotationsNeedUpdate(true);
                              }}
                              className="p-1 text-red-500 hover:text-red-700 text-sm"
                              title="Delete annotation"
                            >
                              🗑️
                            </button>
                          )}
                          
                          <div className={`px-2 py-1 text-xs rounded ${
                            annotation.is_custom 
                              ? 'bg-teal-100 text-teal-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {annotation.is_custom ? 'Custom' : 'EDF'}
                          </div>
                        </div>
                      </div>
                      
                      {annotation.real_time && (
                        <div className="mt-2 text-xs text-gray-500">
                          <strong>Real-world time:</strong> {annotation.real_time}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-4">
                No annotations found in EDF file. You can add custom annotations using the button above.
              </div>
            )}
          </div>
        )}

        {/* Time Frame Selection */}
        {metadata && metadata.duration_seconds && (
          <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Time Frame Selection</h3>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={useTimeFrame}
                  onChange={(e) => setUseTimeFrame(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium">Use custom time frame</span>
              </label>
            </div>
            
            {useTimeFrame && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Select time range for analysis (seconds):</p>
                
                {/* Visual Timeline */}
                <div className="relative bg-gray-100 rounded-lg p-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>0s</span>
                    <span>{metadata.duration_seconds.toFixed(1)}s (Total: {metadata.duration_seconds.toFixed(1)}s)</span>
                  </div>
                  
                  {/* Timeline bar with annotation markers */}
                  <div className="relative h-6 bg-gray-100 rounded mb-4">
                    {/* Background timeline */}
                    <div className="absolute top-2 left-0 right-0 h-2 bg-gray-200 rounded-full">
                      {/* Selected time range */}
                      <div 
                        className="absolute h-2 bg-blue-500 rounded-full"
                        style={{
                          left: `${(timeFrameStart / metadata.duration_seconds) * 100}%`,
                          width: `${((timeFrameEnd - timeFrameStart) / metadata.duration_seconds) * 100}%`
                        }}
                      />
                    </div>
                    
                    {/* Annotation markers */}
                    {!annotationsNeedUpdate && annotations.map((annotation) => {
                      const position = (annotation.onset / metadata.duration_seconds) * 100;
                      const width = Math.max(0.5, (annotation.duration / metadata.duration_seconds) * 100);
                      
                      return (
                        <div
                          key={annotation.id}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                        >
                          {/* Marker line */}
                          <div 
                            className={`w-0.5 h-6 ${
                              annotation.is_custom ? 'bg-teal-500' : 'bg-orange-500'
                            }`}
                          />
                          
                          {/* Duration bar if significant */}
                          {width > 1 && (
                            <div
                              className={`absolute top-1.5 h-3 opacity-50 rounded ${
                                annotation.is_custom ? 'bg-teal-300' : 'bg-orange-300'
                              }`}
                              style={{ 
                                left: 0, 
                                width: `${width * (100 / position) || width}px`,
                                minWidth: '2px'
                              }}
                            />
                          )}
                          
                          {/* Tooltip on hover */}
                          <div className="absolute top-7 bg-black text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                            <div className="font-semibold">{annotation.description}</div>
                            <div>{annotation.onset.toFixed(1)}s</div>
                            {annotation.real_time && (
                              <div className="text-gray-300">{annotation.real_time}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {annotationsNeedUpdate && (
                      <div className="absolute top-0 right-0 text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                        Click &quot;Update Timeline&quot; to refresh markers
                      </div>
                    )}
                  </div>
                  
                  {/* Annotation Quick Jump */}
                  {annotations.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 rounded border">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Jump to Annotation:</label>
                      <div className="flex gap-2 items-center">
                        <select
                          className="flex-1 p-2 border border-gray-300 rounded text-sm"
                          onChange={(e) => {
                            const selectedOnset = parseFloat(e.target.value);
                            if (!isNaN(selectedOnset)) {
                              // Set time frame to center around the annotation
                              const padding = Math.min(5, metadata.duration_seconds * 0.1); // 5 seconds or 10% of recording
                              const newStart = Math.max(0, selectedOnset - padding);
                              const newEnd = Math.min(metadata.duration_seconds, selectedOnset + padding);
                              
                              setTimeFrameStart(newStart);
                              setTimeFrameEnd(newEnd);
                              setUseTimeFrame(true);
                              
                              console.log(`Jumped to annotation at ${selectedOnset}s, time frame: ${newStart}-${newEnd}`);
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Select an annotation...</option>
                          {annotations.map((annotation) => (
                            <option key={annotation.id} value={annotation.onset}>
                              {annotation.onset.toFixed(1)}s - {annotation.description}
                              {annotation.real_time ? ` (${annotation.real_time})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setUseTimeFrame(false);
                            setTimeFrameStart(0);
                            setTimeFrameEnd(metadata.duration_seconds);
                          }}
                          className="px-3 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                          title="Reset to full timeline"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Range sliders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Time (seconds):</label>
                      <input
                        type="range"
                        min={0}
                        max={metadata.duration_seconds}
                        step={0.1}
                        value={timeFrameStart}
                        onChange={(e) => {
                          const newStart = parseFloat(e.target.value);
                          setTimeFrameStart(newStart);
                          if (newStart >= timeFrameEnd) {
                            setTimeFrameEnd(Math.min(newStart + 1, metadata.duration_seconds));
                          }
                        }}
                        className="w-full mb-2"
                      />
                      <input
                        type="number"
                        value={timeFrameStart}
                        onChange={(e) => {
                          const newStart = Math.max(0, parseFloat(e.target.value) || 0);
                          setTimeFrameStart(Math.min(newStart, timeFrameEnd - 0.1));
                        }}
                        step="0.1"
                        min={0}
                        max={timeFrameEnd - 0.1}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="Start time"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Time (seconds):</label>
                      <input
                        type="range"
                        min={timeFrameStart + 0.1}
                        max={metadata.duration_seconds}
                        step={0.1}
                        value={timeFrameEnd}
                        onChange={(e) => setTimeFrameEnd(parseFloat(e.target.value))}
                        className="w-full mb-2"
                      />
                      <input
                        type="number"
                        value={timeFrameEnd}
                        onChange={(e) => {
                          const newEnd = Math.min(metadata.duration_seconds, parseFloat(e.target.value) || metadata.duration_seconds);
                          setTimeFrameEnd(Math.max(newEnd, timeFrameStart + 0.1));
                        }}
                        step="0.1"
                        min={timeFrameStart + 0.1}
                        max={metadata.duration_seconds}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="End time"
                      />
                    </div>
                  </div>
                  
                  {/* Quick selection buttons */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => {
                        setTimeFrameStart(0);
                        setTimeFrameEnd(metadata.duration_seconds);
                      }}
                      className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      Full Duration
                    </button>
                    <button
                      onClick={() => {
                        setTimeFrameStart(0);
                        setTimeFrameEnd(Math.min(60, metadata.duration_seconds));
                      }}
                      className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded"
                    >
                      First 60s
                    </button>
                    <button
                      onClick={() => {
                        const start = Math.max(0, metadata.duration_seconds - 60);
                        setTimeFrameStart(start);
                        setTimeFrameEnd(metadata.duration_seconds);
                      }}
                      className="px-3 py-1 text-xs bg-green-100 hover:bg-green-200 rounded"
                    >
                      Last 60s
                    </button>
                    <button
                      onClick={() => {
                        const duration = timeFrameEnd - timeFrameStart;
                        const center = metadata.duration_seconds / 2;
                        const start = Math.max(0, center - duration / 2);
                        const end = Math.min(metadata.duration_seconds, start + duration);
                        setTimeFrameStart(start);
                        setTimeFrameEnd(end);
                      }}
                      className="px-3 py-1 text-xs bg-purple-100 hover:bg-purple-200 rounded"
                    >
                      Center
                    </button>
                  </div>
                </div>
                
                <div className="bg-blue-50 p-3 rounded text-sm">
                  <strong>Selected Duration:</strong> {(timeFrameEnd - timeFrameStart).toFixed(1)} seconds 
                  ({timeFrameStart.toFixed(1)}s to {timeFrameEnd.toFixed(1)}s)
                  <br />
                  <strong>Percentage of total:</strong> {((timeFrameEnd - timeFrameStart) / metadata.duration_seconds * 100).toFixed(1)}%
                  {calculateRealWorldTime(timeFrameStart) && calculateRealWorldTime(timeFrameEnd) && (
                    <>
                      <br />
                      <strong>Real-world time:</strong> {calculateRealWorldTime(timeFrameStart)} to {calculateRealWorldTime(timeFrameEnd)}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {!useTimeFrame && (
              <div className="text-sm text-gray-600">
                Using full recording duration: {metadata.duration_seconds.toFixed(1)} seconds
              </div>
            )}
          </div>
        )}

        {/* Analysis Controls */}
        {currentFile && pyodideReady && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-6">Analysis Tools</h2>

            {/* SSVEP Analysis */}
            <div className="border-b pb-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">🎯 Comprehensive SSVEP Analysis</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Frequency (Hz):</label>
                  <input
                    type="number"
                    value={ssvepParams.target_frequency}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, target_frequency: parseFloat(e.target.value) }))}
                    step="0.1"
                    min="1"
                    max="100"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PCA Components:</label>
                  <input
                    type="number"
                    value={ssvepParams.pca_components}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, pca_components: parseInt(e.target.value) }))}
                    min="1"
                    max="20"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={runSSVEPAnalysis}
                    disabled={isAnalyzing}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center justify-center"
                  >
                    {isAnalyzing && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Run SSVEP Analysis'}
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-gray-600">
                Comprehensive SSVEP analysis including 40Hz detection, PCA, SNR calculation, and frequency band analysis
              </p>
            </div>

            {/* Traditional Analysis Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Raw Signal */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📈 Raw Signal Plot</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Duration (s):</label>
                  <input
                    type="number"
                    value={analysisParams.raw_signal.duration}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      raw_signal: { ...prev.raw_signal, duration: Math.min(parseFloat(e.target.value), timeFrameEnd - timeFrameStart) }
                    }))}
                    min="0.1"
                    max={timeFrameEnd - timeFrameStart}
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Start Time (s):</label>
                  <input
                    type="number"
                    value={analysisParams.raw_signal.start_time}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      raw_signal: { ...prev.raw_signal, start_time: parseInt(e.target.value) }
                    }))}
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('raw_signal')}
                  disabled={isAnalyzing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Plot Raw Signal
                </button>
              </div>

              {/* PSD */}
              <div className="bg-gray-50 p-4 rounded-lg relative">
                <h4 className="font-semibold mb-3">🌊 Power Spectral Density</h4>
                <div className="flex gap-4">
                  {/* Main PSD settings */}
                  <div className="flex-1">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                      <input
                        type="number"
                        value={analysisParams.psd.fmin}
                        onChange={(e) => setAnalysisParams(prev => ({
                          ...prev,
                          psd: { ...prev.psd, fmin: parseFloat(e.target.value) }
                        }))}
                        step="0.1"
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                      <input
                        type="number"
                        value={analysisParams.psd.fmax}
                        onChange={(e) => setAnalysisParams(prev => ({
                          ...prev,
                          psd: { ...prev.psd, fmax: parseFloat(e.target.value) }
                        }))}
                        step="0.1"
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setAnalysisParams(prev => ({
                            ...prev,
                            psd: { ...prev.psd, method: 'welch' }
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            analysisParams.psd.method === 'welch'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Welch
                        </button>
                        <button
                          onClick={() => setAnalysisParams(prev => ({
                            ...prev,
                            psd: { ...prev.psd, method: 'periodogram' }
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            analysisParams.psd.method === 'periodogram'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Periodogram
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runTraditionalAnalysis('psd')}
                        disabled={isAnalyzing}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                      >
                        {isAnalyzing && (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        )}
                        Compute PSD
                      </button>
                      <button
                        onClick={() => setShowAdvancedPSDSettings(!showAdvancedPSDSettings)}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                        title="Advanced Settings"
                      >
                        ⚙️
                      </button>
                    </div>
                  </div>

                  {/* Advanced settings panel */}
                  {showAdvancedPSDSettings && (
                    <div className="w-64 bg-white border-2 border-blue-200 rounded-lg p-3 shadow-lg">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className="font-semibold text-sm">⚙️ Advanced Settings</h5>
                        <button
                          onClick={() => setShowAdvancedPSDSettings(false)}
                          className="text-gray-500 hover:text-gray-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Welch-specific settings */}
                      {analysisParams.psd.method === 'welch' && (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Segment Length (seconds):</label>
                            <input
                              type="number"
                              value={advancedPSDSettings.nperseg_seconds}
                              onChange={(e) => setAdvancedPSDSettings(prev => ({
                                ...prev,
                                nperseg_seconds: parseFloat(e.target.value)
                              }))}
                              step="0.5"
                              min="0.5"
                              className="w-full p-2 border border-gray-300 rounded text-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">Default: 4s</p>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Overlap (0-1):</label>
                            <input
                              type="number"
                              value={advancedPSDSettings.noverlap_proportion}
                              onChange={(e) => setAdvancedPSDSettings(prev => ({
                                ...prev,
                                noverlap_proportion: Math.min(1, Math.max(0, parseFloat(e.target.value)))
                              }))}
                              step="0.1"
                              min="0"
                              max="1"
                              className="w-full p-2 border border-gray-300 rounded text-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">Proportion of segment length. Default: 0.5</p>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Window:</label>
                            <div className="flex bg-gray-100 rounded-lg p-1">
                              <button
                                onClick={() => setAdvancedPSDSettings(prev => ({
                                  ...prev,
                                  window: 'hann'
                                }))}
                                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                  advancedPSDSettings.window === 'hann'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                Hann
                              </button>
                              <button
                                onClick={() => setAdvancedPSDSettings(prev => ({
                                  ...prev,
                                  window: 'boxcar'
                                }))}
                                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                  advancedPSDSettings.window === 'boxcar'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                Boxcar
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {/* dB/Power toggle (for all methods) */}
                      <div className="mb-2">
                        <label className="block text-xs font-medium mb-1">Units:</label>
                        <div className="flex bg-gray-100 rounded-lg p-1">
                          <button
                            onClick={() => setAdvancedPSDSettings(prev => ({
                              ...prev,
                              use_db: false
                            }))}
                            className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              !advancedPSDSettings.use_db
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Power
                          </button>
                          <button
                            onClick={() => setAdvancedPSDSettings(prev => ({
                              ...prev,
                              use_db: true
                            }))}
                            className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              advancedPSDSettings.use_db
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            dB
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* FOOOF */}
              <div className="bg-gray-50 p-4 rounded-lg relative">
                <h4 className="font-semibold mb-3">🎵 FOOOF Spectral Parameterization</h4>
                <div className="flex gap-4">
                  {/* Main FOOOF settings */}
                  <div className="flex-1">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Freq Range (Hz):</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={fooofParams.freq_range[0]}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            freq_range: [parseFloat(e.target.value), prev.freq_range[1]]
                          }))}
                          step="0.5"
                          min="0"
                          className="w-1/2 p-2 border border-gray-300 rounded text-sm"
                          placeholder="Min"
                        />
                        <input
                          type="number"
                          value={fooofParams.freq_range[1]}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            freq_range: [prev.freq_range[0], parseFloat(e.target.value)]
                          }))}
                          step="0.5"
                          min="1"
                          className="w-1/2 p-2 border border-gray-300 rounded text-sm"
                          placeholder="Max"
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Max Peaks:</label>
                      <input
                        type="number"
                        value={fooofParams.max_n_peaks}
                        onChange={(e) => setFooofParams(prev => ({
                          ...prev,
                          max_n_peaks: parseInt(e.target.value)
                        }))}
                        min="1"
                        max="12"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Aperiodic Mode:</label>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setFooofParams(prev => ({
                            ...prev,
                            aperiodic_mode: 'fixed'
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            fooofParams.aperiodic_mode === 'fixed'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Fixed
                        </button>
                        <button
                          onClick={() => setFooofParams(prev => ({
                            ...prev,
                            aperiodic_mode: 'knee'
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            fooofParams.aperiodic_mode === 'knee'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Knee
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runTraditionalAnalysis('fooof')}
                        disabled={isAnalyzing}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                      >
                        {isAnalyzing && (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        )}
                        Run FOOOF
                      </button>
                      <button
                        onClick={() => setShowAdvancedFOOOFSettings(!showAdvancedFOOOFSettings)}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                        title="Advanced Settings"
                      >
                        ⚙️
                      </button>
                    </div>
                  </div>

                  {/* Advanced settings panel */}
                  {showAdvancedFOOOFSettings && (
                    <div className="w-64 bg-white border-2 border-purple-200 rounded-lg p-3 shadow-lg">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className="font-semibold text-sm">⚙️ Advanced Settings</h5>
                        <button
                          onClick={() => setShowAdvancedFOOOFSettings(false)}
                          className="text-gray-500 hover:text-gray-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">Peak Width Limits (Hz):</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={fooofParams.peak_width_limits[0]}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              peak_width_limits: [parseFloat(e.target.value), prev.peak_width_limits[1]]
                            }))}
                            step="0.1"
                            min="0.1"
                            className="w-1/2 p-2 border border-gray-300 rounded text-xs"
                            placeholder="Min"
                          />
                          <input
                            type="number"
                            value={fooofParams.peak_width_limits[1]}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              peak_width_limits: [prev.peak_width_limits[0], parseFloat(e.target.value)]
                            }))}
                            step="0.5"
                            min="0.5"
                            className="w-1/2 p-2 border border-gray-300 rounded text-xs"
                            placeholder="Max"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Default: 0.5-12 Hz</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">Min Peak Height:</label>
                        <input
                          type="number"
                          value={fooofParams.min_peak_height}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            min_peak_height: parseFloat(e.target.value)
                          }))}
                          step="0.05"
                          min="0"
                          max="1"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 0.1</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">PSD Window (seconds):</label>
                        <input
                          type="number"
                          value={fooofParams.nperseg_seconds}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            nperseg_seconds: parseFloat(e.target.value)
                          }))}
                          step="0.5"
                          min="0.5"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 4s</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">PSD Overlap:</label>
                        <input
                          type="number"
                          value={fooofParams.noverlap_proportion}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            noverlap_proportion: parseFloat(e.target.value)
                          }))}
                          step="0.1"
                          min="0"
                          max="1"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 0.5 (50%)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SNR */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📊 Signal-to-Noise Ratio</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                  <input
                    type="number"
                    value={analysisParams.snr.fmin}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      snr: { ...prev.snr, fmin: parseFloat(e.target.value) }
                    }))}
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                  <input
                    type="number"
                    value={analysisParams.snr.fmax}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      snr: { ...prev.snr, fmax: parseFloat(e.target.value) }
                    }))}
                    min="1"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        snr: { ...prev.snr, method: 'welch' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.snr.method === 'welch' 
                          ? 'bg-orange-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Welch
                    </button>
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        snr: { ...prev.snr, method: 'periodogram' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.snr.method === 'periodogram' 
                          ? 'bg-orange-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Periodogram
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('snr')}
                  disabled={isAnalyzing}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute SNR
                </button>
              </div>

              {/* Theta-Beta Ratio */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">🧠 Theta-Beta Ratio</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Theta Min (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.theta_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, theta_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Theta Max (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.theta_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, theta_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Beta Min (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.beta_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, beta_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Beta Max (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.beta_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, beta_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, method: 'welch' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.theta_beta_ratio.method === 'welch' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Welch
                    </button>
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, method: 'periodogram' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.theta_beta_ratio.method === 'periodogram' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Periodogram
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('theta_beta_ratio')}
                  disabled={isAnalyzing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute Theta-Beta Ratio
                </button>
              </div>

              {/* Time-Frequency Analysis */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📈 Time-Frequency Analysis</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="1"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Freq Points:</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_points}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_points: parseInt(e.target.value) }
                      }))}
                      min="10"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Time Points:</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.time_points}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, time_points: parseInt(e.target.value) }
                      }))}
                      min="10"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Channel:</label>
                    <select
                      value={analysisParams.time_frequency.selected_channel}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, selected_channel: parseInt(e.target.value) }
                      }))}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    >
                      {metadata?.channel_names?.map((channel: string, index: number) => (
                        <option key={index} value={index}>
                          {channel}
                        </option>
                      )) || <option value={0}>Loading channels...</option>}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('time_frequency')}
                  disabled={isAnalyzing}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute Spectrogram
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {renderSSVEPResults()}
        {renderAnalysisResults()}

        {/* Generate Patient Report PDF */}
        {analysisResults.some(r => r.analysis_type === 'psd') && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-4">
            <h3 className="text-lg font-bold mb-4">📄 Patient Report Generation</h3>
            <p className="text-gray-600 mb-4">
              Generate a comprehensive patient report PDF using the PSD analysis results.
              The report will include recording information, analysis parameters, frequency bands,
              and the Power Spectral Density plot for the selected time interval.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-blue-900 mb-2">Report will include:</h4>
              <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                <li>Patient and recording information</li>
                <li>Selected time frame and analysis parameters</li>
                <li>PSD plot for &quot;During 40 Hz Visual Stimulation with EVY Light&quot; section</li>
                <li>Channel information and annotations</li>
                <li>Analysis summary</li>
              </ul>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={generatePatientReportDOCXFile}
                disabled={generatingPDF || !pyodideReady}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg text-base font-medium flex items-center justify-center transition-colors shadow-md hover:shadow-lg"
              >
                {generatingPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generating DOCX...
                  </>
                ) : (
                  <>
                    <span className="text-2xl mr-2">📄</span>
                    Download DOCX (Perfect Formatting)
                  </>
                )}
              </button>
              <button
                // onClick={generatePatientReport}
                disabled={true}
                className="w-full bg-gray-300 cursor-not-allowed text-gray-500 py-3 px-6 rounded-lg text-base font-medium flex items-center justify-center transition-colors shadow-md"
              >
                <span className="text-2xl mr-2">📥</span>
                <span className="line-through">Generate PDF Report</span>
                <span className="ml-2 text-xs">(Coming Soon)</span>
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              💡 <strong>Tip:</strong> Download DOCX for perfect formatting preservation (headers, footers, fonts).
              You can convert it to PDF locally using Word or Google Docs.
            </p>
          </div>
        )}

        {/* Channel Rename Popup */}
        {showChannelRenamePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Rename Channel</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Select Channel:</label>
                <select
                  value={channelToRename}
                  onChange={(e) => setChannelToRename(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {metadata?.channel_names?.map((channel) => (
                    <option key={channel} value={channel}>
                      {getChannelDisplayName(channel)} {channelRenameMap[channel] && `(${channel})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">New Name:</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Enter new channel name"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      submitChannelRename();
                    }
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={submitChannelRename}
                  disabled={!channelToRename || !newChannelName.trim() || channelToRename === newChannelName.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Rename
                </button>
                <button
                  onClick={() => setShowChannelRenamePopup(false)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Browser-based EEG analysis with Python (Pyodide) • No servers • No file limits • Full privacy</p>
          <p>All processing happens locally in your browser using WebAssembly</p>
        </div>
      </div>
    </div>
  );
}