'use client'

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from 'react';

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
}

interface AnalysisResult {
  analysis_type: string;
  plot_base64?: string;
  data?: Record<string, any>;
  parameters?: Record<string, any>;
  message?: string;
  success: boolean;
  error?: string;
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
    raw_signal: { duration: 10, start_time: 0 },
    psd: { fmin: 0.5, fmax: 50 },
    snr: { fmin: 1, fmax: 40 }
  });

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
                    print(f"Reading EDF file with MNE from: {tmp_path}")
                    raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
                    
                    print(f"MNE successfully loaded: {len(raw.ch_names)} channels, {raw.info['sfreq']} Hz")
                    
                    # Filter out annotation channels
                    filtered_channels = [ch for ch in raw.ch_names if not ch.startswith('EDF Annotations')]
                    
                    metadata = {
                        'filename': filename,
                        'file_size_mb': round(len(file_bytes) / (1024 * 1024), 2),
                        'num_channels': len(filtered_channels),
                        'channel_names': filtered_channels,
                        'duration_seconds': raw.times[-1] - raw.times[0],
                        'sampling_frequency': int(raw.info['sfreq']),
                        'subject_id': raw.info.get('subject_info', {}).get('id', 'Unknown'),
                        'library_used': 'MNE-Python',
                        'real_data': True
                    }
                    
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
    if MNE_AVAILABLE and hasattr(edf_reader, 'get_data'):
        # MNE Raw object
        if isinstance(channel, str):
            ch_idx = edf_reader.ch_names.index(channel)
        else:
            ch_idx = channel
        
        start_time = start_sample / edf_reader.info['sfreq']
        if num_samples is None:
            stop_time = None
        else:
            stop_time = (start_sample + num_samples) / edf_reader.info['sfreq']
        
        data = edf_reader.get_data(picks=[ch_idx], start=start_time, stop=stop_time)
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

def analyze_ssvep(target_freq=40.0, pca_components=5, frequency_bands=None):
    """Comprehensive SSVEP analysis"""
    global current_edf_data, current_metadata
    
    if current_edf_data is None:
        return json.dumps({'error': 'No EDF file loaded'})
    
    if frequency_bands is None:
        frequency_bands = [8, 12, 30, 100]
    
    try:
        edf_reader = current_edf_data
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

def analyze_traditional(analysis_type, parameters):
    """Traditional EEG analysis functions"""
    global current_edf_data, current_metadata
    
    if current_edf_data is None:
        return json.dumps({'error': 'No EDF file loaded', 'success': False})
    
    try:
        edf_reader = current_edf_data
        
        if analysis_type == 'raw_signal':
            return analyze_raw_signal(edf_reader, parameters)
        elif analysis_type == 'psd':
            return analyze_psd(edf_reader, parameters)
        elif analysis_type == 'snr':
            return analyze_snr(edf_reader, parameters)
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
        
        # Convert to microvolts (assuming data is in volts)
        if np.max(np.abs(signal_data)) < 1e-3:  # Likely already in volts
            axes[i].plot(time_axis, signal_data * 1e6, linewidth=0.5)
            ylabel_unit = 'µV'
        else:  # Likely in microvolts already
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
        params = {'fmin': 0.5, 'fmax': 50}  # fallback defaults
    
    fmin = params.get('fmin', 0.5)
    fmax = params.get('fmax', 50)
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
        
        # Compute PSD using Welch's method
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        
        # Filter frequency range
        freq_mask = (freqs >= fmin) & (freqs <= fmax)
        freqs_filtered = freqs[freq_mask]
        psd_filtered = psd[freq_mask]
        
        # Plot
        ax.semilogy(freqs_filtered, psd_filtered, label=ch_name, alpha=0.7)
    
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('Power Spectral Density (V²/Hz)')
    ax.set_title('Power Spectral Density')
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
        'message': f'PSD computed for frequency range {fmin}-{fmax} Hz'
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
        params = {'fmin': 1, 'fmax': 40}  # fallback defaults
    
    fmin = params.get('fmin', 1)
    fmax = params.get('fmax', 40)
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
        
        # Compute PSD
        freqs, psd = signal.welch(signal_data, fs=sample_rate, nperseg=2048)
        
        # Simple SNR estimation
        noise_floor = np.percentile(psd, 10)
        snr_db = 10 * np.log10(psd / noise_floor)
        
        # Filter frequency range
        freq_mask = (freqs >= fmin) & (freqs <= fmax)
        freqs_filtered = freqs[freq_mask]
        snr_filtered = snr_db[freq_mask]
        
        # Plot
        ax.plot(freqs_filtered, snr_filtered, label=ch_name, alpha=0.7)
    
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('SNR (dB)')
    ax.set_title('Signal-to-Noise Ratio Spectrum')
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
        'message': f'SNR computed for frequency range {fmin}-{fmax} Hz'
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

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }, []);

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
    if (!pyodideReady) {
      setError('Python environment not ready. Please wait for initialization.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.edf') && !file.name.toLowerCase().endsWith('.bdf')) {
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

      // Run analysis
      const result = await pyodideRef.current.runPython(`
        analyze_ssvep(target_freq, pca_components, frequency_bands)
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
        parameters = analysisParams.psd;
      } else if (analysisType === 'snr') {
        parameters = analysisParams.snr;
      }

      // Set parameters in Python - convert to ensure proper serialization
      pyodideRef.current.globals.set('analysis_type', analysisType);
      pyodideRef.current.globals.set('parameters', pyodideRef.current.toPy(parameters));
      pyodideRef.current.globals.set('js_selected_channels', selectedChannels);

      // Run analysis
      const result = await pyodideRef.current.runPython(`
        analyze_traditional(analysis_type, parameters)
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
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".edf,.bdf"
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
                      {dragActive ? 'Drop your EDF file here!' : 'Or drag & drop your file here'}
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
                accept=".edf,.bdf"
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
                  <span className="text-sm font-mono">{channel}</span>
                </label>
              ))}
            </div>
            
            <div className="mt-3 text-sm text-gray-600">
              Selected: {selectedChannels.length} of {metadata.channel_names.length} channels
            </div>
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
                      raw_signal: { ...prev.raw_signal, duration: parseInt(e.target.value) }
                    }))}
                    min="1"
                    max="60"
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
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">🌊 Power Spectral Density</h4>
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
                <button
                  onClick={() => runTraditionalAnalysis('psd')}
                  disabled={isAnalyzing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute PSD
                </button>
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
            </div>
          </div>
        )}

        {/* Results */}
        {renderSSVEPResults()}
        {renderAnalysisResults()}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Browser-based EEG analysis with Python (Pyodide) • No servers • No file limits • Full privacy</p>
          <p>All processing happens locally in your browser using WebAssembly</p>
        </div>
      </div>
    </div>
  );
}