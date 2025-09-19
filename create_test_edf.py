#!/usr/bin/env python3
"""
Create a dummy EDF file for testing SSVEP analysis.
This script creates a synthetic EEG recording with embedded SSVEP responses.
"""

import numpy as np
import os
from datetime import datetime

def create_synthetic_edf_data(duration_minutes=3, fs=256, n_channels=8):
    """Create synthetic EEG data with SSVEP responses"""
    duration_seconds = duration_minutes * 60
    n_samples = int(duration_seconds * fs)
    t = np.linspace(0, duration_seconds, n_samples)
    
    data = []
    channel_names = [f'Fp1', f'Fp2', f'F3', f'F4', f'C3', f'C4', f'P3', f'P4'][:n_channels]
    
    for i in range(n_channels):
        # Base EEG signal with realistic characteristics
        signal = (
            # Background EEG (alpha, beta, theta rhythms)
            np.random.randn(n_samples) * 20 +  # Random noise
            10 * np.sin(2 * np.pi * 10 * t + np.random.rand() * 2 * np.pi) +  # Alpha (10 Hz)
            5 * np.sin(2 * np.pi * 20 * t + np.random.rand() * 2 * np.pi) +   # Beta (20 Hz)
            8 * np.sin(2 * np.pi * 7 * t + np.random.rand() * 2 * np.pi)     # Theta (7 Hz)
        )
        
        # Add SSVEP responses during stimulation periods
        # 15 Hz SSVEP (10-30s, stronger in posterior channels)
        ssvep_strength = 15 if i >= 4 else 8  # Stronger in P3, P4
        mask_15hz = (t >= 10) & (t < 30)
        signal[mask_15hz] += ssvep_strength * np.sin(2 * np.pi * 15 * t[mask_15hz])
        
        # 20 Hz SSVEP (45-65s)
        mask_20hz = (t >= 45) & (t < 65)
        signal[mask_20hz] += ssvep_strength * np.sin(2 * np.pi * 20 * t[mask_20hz])
        
        # 25 Hz SSVEP (80-100s)
        mask_25hz = (t >= 80) & (t < 100)
        signal[mask_25hz] += ssvep_strength * np.sin(2 * np.pi * 25 * t[mask_25hz])
        
        # 30 Hz SSVEP (115-135s)
        mask_30hz = (t >= 115) & (t < 135)
        signal[mask_30hz] += ssvep_strength * np.sin(2 * np.pi * 30 * t[mask_30hz])
        
        data.append(signal)
    
    return np.array(data), channel_names, fs

def write_simple_edf(filename, data, channel_names, fs):
    """Write a simplified EDF-like file for testing"""
    n_channels, n_samples = data.shape
    duration_seconds = n_samples / fs
    
    # Create a simple binary file with header information
    with open(filename, 'wb') as f:
        # EDF header (simplified)
        header = bytearray(256 * (1 + n_channels))  # 256 bytes for main header + 256 per channel
        
        # Main header (first 256 bytes)
        header[0:8] = b'0       '  # Version
        header[8:88] = b'Test Subject                                                                    '  # Patient ID (80 chars)
        header[88:168] = b'Test Recording                                                                  '  # Recording info (80 chars)
        header[168:176] = datetime.now().strftime('%d.%m.%y').encode().ljust(8)  # Start date
        header[176:184] = datetime.now().strftime('%H.%M.%S').encode().ljust(8)  # Start time
        header[184:192] = str(256 * (1 + n_channels)).encode().ljust(8)  # Header size
        header[192:236] = b'EDF+C                                       '  # Reserved
        header[236:244] = str(1).encode().ljust(8)  # Number of data records
        header[244:252] = str(int(duration_seconds)).encode().ljust(8)  # Duration of each record
        header[252:256] = str(n_channels).encode().ljust(4)  # Number of channels
        
        # Channel headers (256 bytes per channel)
        for i, ch_name in enumerate(channel_names):
            offset = 256 + i * 256
            header[offset:offset+16] = ch_name.encode().ljust(16)  # Channel name
            header[offset+16:offset+96] = b'                                                                                '  # Transducer type
            header[offset+96:offset+104] = b'uV      '  # Physical dimension
            header[offset+104:offset+112] = b'-1000   '  # Physical minimum
            header[offset+112:offset+120] = b'1000    '  # Physical maximum
            header[offset+120:offset+128] = b'-32768  '  # Digital minimum
            header[offset+128:offset+136] = b'32767   '  # Digital maximum
            header[offset+136:offset+216] = b'                                                                                '  # Prefiltering
            header[offset+216:offset+224] = str(n_samples).encode().ljust(8)  # Samples per record
            header[offset+224:offset+256] = b'                                '  # Reserved
        
        f.write(header)
        
        # Write data as 16-bit signed integers
        data_int = np.clip(data * 100, -32768, 32767).astype(np.int16)  # Scale and convert
        for sample_idx in range(n_samples):
            for ch_idx in range(n_channels):
                f.write(data_int[ch_idx, sample_idx].tobytes())

if __name__ == "__main__":
    print("Creating test EDF file...")
    
    # Generate synthetic data
    data, channel_names, fs = create_synthetic_edf_data(duration_minutes=3, fs=256, n_channels=8)
    
    # Save to public directory
    output_file = os.path.join("public", "test_ssvep_recording.edf")
    write_simple_edf(output_file, data, channel_names, fs)
    
    print(f"Created test EDF file: {output_file}")
    print(f"Duration: {data.shape[1] / fs:.1f} seconds")
    print(f"Channels: {len(channel_names)} ({', '.join(channel_names)})")
    print(f"Sampling rate: {fs} Hz")
    print("\nSSVEP stimulation periods:")
    print("- 15 Hz: 10-30s (Exp1)")
    print("- 20 Hz: 45-65s (Exp2)")  
    print("- 25 Hz: 80-100s (Exp3)")
    print("- 30 Hz: 115-135s (Exp4)")