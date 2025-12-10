/**
 * Python environment setup code for Pyodide
 * This contains the complete Python code that needs to be executed in Pyodide
 */

export const PYTHON_ENVIRONMENT_SETUP = `
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

# Note: The rest of the Python functions (read_edf_file, get_signal_data, etc.) 
# are too large to include here. They will be loaded from the component's setupPythonEnvironment
# or we can create a separate file for them. For now, we'll keep them in the hook's setup function.
`;

