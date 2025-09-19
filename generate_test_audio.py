#!/usr/bin/env python3
"""
Generate a test audio file with 2000Hz carrier amplitude modulated at 40Hz
This file can be used to verify the expected audio characteristics
"""

import numpy as np
import wave
import struct

def generate_am_audio(duration=5.0, carrier_freq=2000.0, mod_freq=40.0, sample_rate=44100, amplitude=0.3):
    """
    Generate amplitude modulated audio
    AM signal = carrier * (1 + modulation_depth * modulator)
    """
    
    # Time array
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Carrier wave (2000Hz)
    carrier = np.sin(2 * np.pi * carrier_freq * t)
    
    # Modulator wave (40Hz)
    modulator = np.sin(2 * np.pi * mod_freq * t)
    
    # Amplitude modulation with 50% modulation depth
    modulation_depth = 0.5
    am_signal = carrier * (1 + modulation_depth * modulator)
    
    # Apply amplitude scaling
    am_signal = am_signal * amplitude
    
    # Convert to 16-bit integers
    audio_data = (am_signal * 32767).astype(np.int16)
    
    return audio_data, sample_rate

def save_wav_file(filename, audio_data, sample_rate):
    """Save audio data as WAV file"""
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())

if __name__ == "__main__":
    print("Generating 40Hz amplitude modulated test audio...")
    print("Parameters:")
    print("- Carrier frequency: 2000Hz")
    print("- Modulation frequency: 40Hz") 
    print("- Modulation depth: 50%")
    print("- Duration: 5 seconds")
    print("- Sample rate: 44.1kHz")
    
    # Generate the audio
    audio_data, sample_rate = generate_am_audio()
    
    # Save to file
    filename = "test_40hz_am_audio.wav"
    save_wav_file(filename, audio_data, sample_rate)
    
    print(f"Audio file saved as: {filename}")
    print("You can play this file to hear what the experiment should sound like.")
    print("The audio should have a 2000Hz tone that pulses/beats 40 times per second.")