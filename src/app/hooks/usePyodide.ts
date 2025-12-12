/**
 * Custom hook for Pyodide initialization and management
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PyodideInstance, EDFLibrary } from '../types/pyodide';
import type { LoadedFile } from './useMultiFileManager';

interface UsePyodideReturn {
  pyodide: PyodideInstance | null;
  pyodideReady: boolean;
  pyodideLoading: boolean;
  loadingMessage: string;
  edfLibrary: EDFLibrary;
  initializePyodide: () => Promise<void>;
  setupPythonEnvironment: (
    pyodideInstance: PyodideInstance,
    callbacks: {
      setLoadingMessage: (message: string) => void;
      setSuccess: (message: string) => void;
      setError: (error: string) => void;
    }
  ) => Promise<void>;
  reloadActiveFile: (
    pyodideInstance: PyodideInstance,
    activeFileId: string | null,
    loadedFiles: LoadedFile[]
  ) => Promise<void>;
}

const PYODIDE_VERSION = 'v0.24.1';
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

export function usePyodide(): UsePyodideReturn {
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [edfLibrary, setEdfLibrary] = useState<EDFLibrary>(false);
  const pyodideRef = useRef<PyodideInstance | null>(null);

  const initializePyodide = useCallback(async () => {
    if (pyodideReady || pyodideLoading) return;

    setPyodideLoading(true);
    setLoadingMessage('Loading Python environment...');

    try {
      // Load Pyodide
      if (!window.loadPyodide) {
        // Load script if not already loaded
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${PYODIDE_CDN_URL}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Pyodide script'));
          document.head.appendChild(script);
        });
      }

      const pyodideInstance: PyodideInstance = await window.loadPyodide({
        indexURL: PYODIDE_CDN_URL
      });

      setLoadingMessage('Installing Python packages...');

      // Install required packages
      await pyodideInstance.loadPackage([
        'numpy',
        'scipy',
        'matplotlib',
        'scikit-learn',
        'micropip'
      ]);

      // Try to install EDF libraries (MNE)
      setLoadingMessage('Installing EDF processing libraries...');
      let library: EDFLibrary = false;

      try {
        const micropip = pyodideInstance.pyimport('micropip') as {
          install: (packages: string | string[]) => Promise<void>;
        };

        // Try MNE first
        try {
          setLoadingMessage('Installing MNE-Python...');
          await micropip.install(['mne']);
          setLoadingMessage('MNE-Python installed successfully');
          library = 'mne';
        } catch (errMne) {
          console.warn('MNE install failed:', errMne);
          library = 'pure';
          setLoadingMessage('Using built-in pure Python EDF reader');
        }
      } catch (err) {
        console.warn('Package installation failed, using pure Python EDF reader', err);
        setLoadingMessage('Using built-in pure Python EDF reader');
        library = 'pure';
      }

      // Install custom resutil package
      try {
        setLoadingMessage('Installing resutil package...');
        const micropip = pyodideInstance.pyimport('micropip') as {
          install: (packages: string[]) => Promise<void>;
        };
        await micropip.install(['/pyodide-packages/resutil-0.4.0-py3-none-any.whl']);
        setLoadingMessage('resutil installed successfully');
        await pyodideInstance.runPython('import resutil');
        console.log('resutil package loaded successfully');
      } catch (error) {
        console.warn('Failed to install resutil package:', error);
      }

      setEdfLibrary(library);
      pyodideRef.current = pyodideInstance;
      setPyodide(pyodideInstance);
      setPyodideReady(true);
      setLoadingMessage('');

    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      setLoadingMessage('');
      throw error;
    } finally {
      setPyodideLoading(false);
    }
  }, [pyodideReady, pyodideLoading]);

  // Auto-initialize on mount
  useEffect(() => {
    initializePyodide().catch((error) => {
      console.error('Auto-initialization failed:', error);
    });
  }, []);

  /**
   * Sets up the complete Python environment including FOOOF, resutil, external modules, and analysis code
   * This function is extracted from PyodideEDFProcessor.tsx to centralize Python setup logic
   */
  const setupPythonEnvironment = useCallback(async (
    pyodideInstance: PyodideInstance,
    callbacks: {
      setLoadingMessage: (message: string) => void;
      setSuccess: (message: string) => void;
      setError: (error: string) => void;
    }
  ) => {
    const { setLoadingMessage, setSuccess, setError } = callbacks;
    let edf_library_available: 'mne' | false = false;
    
    try {
      setLoadingMessage('Setting up analysis environment...');
      const micropip = pyodideInstance.pyimport('micropip') as {
        install: (packages: string | string[]) => Promise<void>;
      };
      
      // First try MNE (preferred)
      try {
        setLoadingMessage('Installing MNE-Python...');
        await micropip.install(['mne']);
        setLoadingMessage('MNE-Python installed successfully');
        edf_library_available = 'mne';
      } catch (e) {
        console.warn('MNE not available, using pure Python EDF reader', e);
        setLoadingMessage('Using built-in pure Python EDF reader');
        edf_library_available = false;
      }
    } catch (error) {
      console.warn('Package installation failed, using pure Python EDF reader', error);
      setLoadingMessage('Using built-in pure Python EDF reader');
      edf_library_available = false;
    }

    // Install custom resutil package (initial attempt)
    try {
      setLoadingMessage('Installing resutil package...');
      const micropip = pyodideInstance.pyimport('micropip') as {
        install: (packages: string | string[]) => Promise<void>;
      };
      await micropip.install('/pyodide-packages/resutil-0.4.0-py3-none-any.whl');
      setLoadingMessage('resutil installed successfully');
      await pyodideInstance.runPython('import resutil');
      console.log('resutil package loaded successfully');
    } catch (error) {
      console.warn('Failed to install resutil package:', error);
    }

    console.log('EDF library available:', edf_library_available);

    // Install FOOOF library for spectral parameterization
    try {
      setLoadingMessage('Installing FOOOF library...');
      const micropip = pyodideInstance.pyimport('micropip') as {
        install: (packages: string | string[]) => Promise<void>;
      };
      await micropip.install(['fooof']);
      setLoadingMessage('FOOOF library installed successfully');
      console.log('FOOOF library installed');
    } catch (error) {
      console.warn('FOOOF installation failed:', error);
      setLoadingMessage('FOOOF library not available');
    }

    // Load FOOOF analysis module from external file
    try {
      setLoadingMessage('Loading FOOOF analysis module...');
      const fooofResponse = await fetch('/fooof_analysis.py');
      if (!fooofResponse.ok) {
        throw new Error(`Failed to load fooof_analysis.py: ${fooofResponse.statusText}`);
      }
      const fooofCode = await fooofResponse.text();
      await pyodideInstance.runPython(fooofCode);
      console.log('FOOOF analysis module loaded successfully');
    } catch (error) {
      console.warn('Failed to load FOOOF analysis module:', error);
      setLoadingMessage('FOOOF analysis module not available');
    }

    // Load comparison PSD module from external file
    try {
      setLoadingMessage('Loading comparison PSD module...');
      const comparisonResponse = await fetch('/comparison_psd.py');
      if (!comparisonResponse.ok) {
        throw new Error(`Failed to load comparison_psd.py: ${comparisonResponse.statusText}`);
      }
      const comparisonCode = await comparisonResponse.text();
      await pyodideInstance.runPython(comparisonCode);
      console.log('Comparison PSD module loaded successfully');
    } catch (error) {
      console.warn('Failed to load comparison PSD module:', error);
      setLoadingMessage('Comparison PSD module not available');
    }

    // Install resutil for custom Optoceutics plot styling
    // Multi-stage fallback approach to handle dependency issues
    let resutilInstalled = false;

    try {
      setLoadingMessage('Installing resutil (Optoceutics styling library)...');
      const micropip = pyodideInstance.pyimport('micropip') as {
        install: (packages: string | string[]) => Promise<void>;
      };

      // Install markdown dependency (required by resutil core)
      await micropip.install(['markdown']);
      console.log('Markdown library installed');

      // Stage 1: Try installing with keep_going=True (ignores missing optional dependencies)
      try {
        setLoadingMessage('Installing resutil from local wheel (Stage 1)...');
        await pyodideInstance.runPythonAsync(`
import micropip
await micropip.install('/pyodide-packages/resutil-0.4.0-py3-none-any.whl', keep_going=True)
`);

        // Verify it works
        await pyodideInstance.runPythonAsync(`
import resutil
from resutil import plotlib
print("✓ Resutil (v0.4.0) loaded successfully with plotlib module (Stage 1)")
`);
        resutilInstalled = true;
        console.log('Resutil installed successfully (Stage 1: keep_going=True)');
      } catch (stage1Error) {
        console.warn('Stage 1 failed, trying Stage 2 (manual extraction)...', stage1Error);

        // Stage 2: Manual wheel extraction (bypass micropip completely)
        try {
          setLoadingMessage('Installing resutil via manual extraction (Stage 2)...');

          // Fetch the wheel file
          const wheelResponse = await fetch('/pyodide-packages/resutil-0.4.0-py3-none-any.whl');
          if (!wheelResponse.ok) {
            throw new Error(`Failed to fetch wheel: ${wheelResponse.status}`);
          }
          const wheelBytes = await wheelResponse.arrayBuffer();

          // Write to Pyodide filesystem
          if (!pyodideInstance.FS) {
            throw new Error('Pyodide FS is not available for writing the wheel.');
          }
          pyodideInstance.FS.writeFile('/tmp/resutil.whl', new Uint8Array(wheelBytes));

          // Extract and install manually
          await pyodideInstance.runPythonAsync(`
import sys
import zipfile
import os

# Extract wheel to temporary directory
wheel_path = '/tmp/resutil.whl'
extract_path = '/tmp/resutil_pkg'

# Create extraction directory
if os.path.exists(extract_path):
    import shutil
    shutil.rmtree(extract_path)
os.makedirs(extract_path)

# Unzip the wheel
with zipfile.ZipFile(wheel_path, 'r') as zip_ref:
    zip_ref.extractall(extract_path)

# Add to sys.path (highest priority)
if extract_path not in sys.path:
    sys.path.insert(0, extract_path)

# Verify resutil is importable
import resutil
from resutil import plotlib
print(f"✓ Resutil (v0.4.0) loaded successfully with plotlib module (Stage 2: manual extraction)")
print(f"  Loaded from: {resutil.__file__}")
`);
          resutilInstalled = true;
          console.log('Resutil installed successfully (Stage 2: manual extraction)');
        } catch (stage2Error) {
          console.warn('Stage 2 failed, trying Stage 3 (lightweight module)...', stage2Error);

          // Stage 3: Use lightweight custom module as ultimate fallback
          try {
            setLoadingMessage('Loading lightweight styling module (Stage 3)...');

            const resutilResponse = await fetch('/python-packages/resutil_oc.py');
            if (!resutilResponse.ok) {
              throw new Error(`Failed to fetch resutil_oc.py: ${resutilResponse.status}`);
            }
            const resutilCode = await resutilResponse.text();

            await pyodideInstance.runPythonAsync(`
import sys
from types import ModuleType

# Create resutil module
resutil = ModuleType('resutil')

# Create plotlib submodule
plotlib = ModuleType('plotlib')

# Execute the lightweight code in plotlib's namespace
exec('''${resutilCode.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''', plotlib.__dict__)

# Add plotlib to resutil
resutil.plotlib = plotlib

# Add to sys.modules
sys.modules['resutil'] = resutil
sys.modules['resutil.plotlib'] = plotlib

print("✓ Resutil loaded successfully with lightweight plotlib module (Stage 3: fallback)")
`);
            resutilInstalled = true;
            console.log('Resutil installed successfully (Stage 3: lightweight fallback)');
          } catch (stage3Error) {
            console.error('All stages failed:', stage3Error);
            throw stage3Error;
          }
        }
      }

      if (resutilInstalled) {
        setLoadingMessage('Resutil library ready');
        console.log('Resutil installation complete and verified');
      }
    } catch (error) {
      console.warn('Resutil installation failed completely (will use default matplotlib styling):', error);
      setLoadingMessage('Using default matplotlib styling');
    }
    
    // Setup Python environment - execute the massive Python code string
    // NOTE: The Python code string (1860 lines) is extracted from PyodideEDFProcessor.tsx lines 516-2375
    // Due to size constraints, we'll load it dynamically from the component or include it inline
    try {
      setLoadingMessage('Setting up analysis environment...');
      
      // Import the Python code string - prefer inline to avoid 404 noise in dev
      // If we later add /python-packages/edf_analysis_code.py to public, we can switch back to fetch.
      const pythonCode = getPythonAnalysisCode();
      await pyodideInstance.runPython(pythonCode);
      
      setSuccess('Python environment loaded successfully!');
      setLoadingMessage('');
    } catch (error) {
      console.error('Failed to setup Python environment:', error);
      setError(`Failed to setup Python environment: ${error}`);
      setLoadingMessage('');
      throw error;
    }
  }, []);

  /**
   * Returns the complete Python analysis code string
   * This is extracted from PyodideEDFProcessor.tsx lines 516-2375
   * TODO: Consider moving this to a separate file for better maintainability
   */
  const getPythonAnalysisCode = (): string => {
    // This function returns the complete Python analysis code (1860 lines)
    // Extracted from PyodideEDFProcessor.tsx lines 516-2375
    return `import numpy as np
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
    use_resutil_style = params.get('use_resutil_style', False)

    # Import matplotlib.pyplot - required for all plotting
    import matplotlib.pyplot as plt

    # Apply resutil styling if requested; otherwise reset to defaults
    if use_resutil_style:
        try:
            from resutil import plotlib
            plotlib.set_oc_style()
            plotlib.set_oc_font()
            print("Applied Optoceutics custom styling to PSD plot (resutil.plotlib)")
        except ImportError:
            print("Resutil not available for PSD, using default matplotlib styling")
        except Exception as e:
            print(f"Failed to apply resutil styling to PSD: {e}")
    else:
        try:
            plt.style.use('default')
            print("Reset matplotlib style to default (resutil disabled)")
        except Exception as e:
            print(f"Could not reset matplotlib style: {e}")

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
    Wrapper function that calls the external fooof_analysis module
    """
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

    # Get selected channels
    try:
        selected_channels = list(js_selected_channels) if 'js_selected_channels' in globals() else []
    except:
        selected_channels = []

    # Call the external module function
    return run_fooof_analysis(
        edf_reader,
        selected_channels,
        params,
        get_channel_names,
        get_signal_data,
        get_sample_frequency
    )

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
        
    # Compute spectrogram using user-defined resolution
    # Derive window size from desired time_points; cap for stability
    nperseg = min(len(signal_segment) // max(1, time_points // 2), 1024)
    nperseg = max(nperseg, 64)
    noverlap = max(0, int(nperseg * 0.5))
    # Derive FFT size from freq_points for finer frequency resolution
    nfft = max(int(freq_points), nperseg)
    
    frequencies, times, Sxx = signal.spectrogram(
        signal_segment, 
        fs=sample_rate,
        nperseg=nperseg,
        noverlap=noverlap,
        nfft=nfft
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
`;
  };

  /**
   * Reloads the active file data into Python environment
   * This function is extracted from PyodideEDFProcessor.tsx to centralize file reloading logic
   */
  const reloadActiveFile = useCallback(async (
    pyodideInstance: PyodideInstance,
    activeFileId: string | null,
    loadedFiles: LoadedFile[]
  ) => {
    if (!activeFileId) return;
    const activeFile = loadedFiles.find(f => f.id === activeFileId);
    if (!activeFile) return;

    // Skip reloading for BDF files that have already been processed in-memory
    if (activeFile.metadata.convertedFromBdf) {
      console.log('[BDF][SKIP] Skipping reload for BDF-processed file:', activeFile.metadata.filename);
      return;
    }

    try {
      // Read file as bytes
      const arrayBuffer = await activeFile.file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Set file data in Python globals
      pyodideInstance.globals.set('js_uint8_array', uint8Array);
      pyodideInstance.globals.set('filename', activeFile.file.name);

      // Reload the file data into Python global variables
      await pyodideInstance.runPython(`
        # Convert JavaScript Uint8Array to Python bytes
        file_bytes = bytes(js_uint8_array)
        read_edf_file(file_bytes, filename)
      `);

      console.log(`Reloaded file data into Python for: ${activeFile.file.name}`);
    } catch (error) {
      console.error('Error reloading file data into Python:', error);
    }
  }, []);

  return {
    pyodide: pyodideRef.current,
    pyodideReady,
    pyodideLoading,
    loadingMessage,
    edfLibrary,
    initializePyodide,
    setupPythonEnvironment,
    reloadActiveFile
  };
}

