'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { experimentDB, ExperimentResult, AnnotationData } from '../../utils/experimentDatabase';

// Extend Window interface for webkitAudioContext compatibility
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

/**
 * 40Hz AUDITORY STIMULUS EXPERIMENT - EEG SYNCHRONIZATION GUIDE
 * =============================================================
 * 
 * This component generates 40Hz auditory stimulation for gamma wave entrainment research.
 * 
 * EXTRACTING STIMULUS ANNOTATIONS:
 * The onComplete callback receives a data object with:
 * 
 * 1. stimulusAnnotations.annotations[] - Array of audio events with:
 *    - timestamp: milliseconds from experiment start (relative timing)
 *    - absoluteTime: Unix timestamp (absolute timing)
 *    - stimulusType: 'audio_tone'
 *    - frequency: 40 (Hz)
 *    - duration: tone duration in milliseconds
 *    - amplitude: audio amplitude (0-1)
 * 
 * 2. csvAnnotations[] - CSV-ready format for easy export
 * 
 * EEG SYNCHRONIZATION METHODS:
 * 
 * Method 1: Unix Timestamp Synchronization
 * - Use absoluteTime values to align with EEG recording timestamps
 * - Requires synchronized system clocks between devices
 * - Most accurate for multi-device setups
 * 
 * Method 2: Trigger Signal Synchronization  
 * - Send trigger signals to EEG during audio_start events
 * - Use timestamp values for relative timing verification
 * - Most reliable for precise neural timing
 * 
 * Method 3: Manual Synchronization
 * - Record experiment start time manually
 * - Use relative timestamps (data.stimulusAnnotations.annotations[].timestamp)
 * - Add to EEG recording start time
 */

interface AuditoryStimulus40HzProps {
  onComplete: (data: ExperimentData) => void;
  onCancel: () => void;
  config?: {
    id: string;
    duration: number;
  };
}

interface ExperimentData {
  experimentId: string;
  startTime: number;
  endTime: number;
  events: Array<{
    timestamp: number;
    type: 'audio_start' | 'audio_stop' | 'experiment_start' | 'experiment_end' | 'consent_given';
    data: Record<string, unknown>;
  }>;
  stimulusSequence: Array<{
    timestamp: number;
    duration: number;
    type: 'audio_tone';
    frequency: number;
  }>;
}

type ExperimentPhase = 'consent' | 'countdown' | 'stimulus' | 'complete';

const AuditoryStimulus40Hz: React.FC<AuditoryStimulus40HzProps> = ({ onComplete, onCancel, config }) => {
  const [phase, setPhase] = useState<ExperimentPhase>('consent');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedData, setCompletedData] = useState<ExperimentData | null>(null);
  const [completionStatus, setCompletionStatus] = useState<'completed' | 'interrupted' | null>(null);
  const [audioPermissionStatus, setAudioPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [audioDebugInfo, setAudioDebugInfo] = useState<string>('');
  const [experimentData, setExperimentData] = useState<ExperimentData>({
    experimentId: '40hz-audio-1',
    startTime: 0,
    endTime: 0,
    events: [],
    stimulusSequence: []
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const experimentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const carrierOscillatorRef = useRef<OscillatorNode | null>(null);
  const modulatorOscillatorRef = useRef<OscillatorNode | null>(null);
  const modulatorGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const constantSourceRef = useRef<ConstantSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const experimentCompletedRef = useRef<boolean>(false);
  const handleCompleteCalledRef = useRef<boolean>(false);
  const startExperimentRef = useRef<(() => void) | null>(null);
  const isPlayingRef = useRef<boolean>(false); // Add ref for immediate state tracking

  // Experiment parameters
  const EXPERIMENT_DURATION = config?.duration || 15000; // Use config or default
  const CARRIER_FREQUENCY = 600; // 2000Hz carrier wave
  const MODULATION_FREQUENCY = 40; // 40Hz modulation frequency
  const AUDIO_AMPLITUDE = 0.2; // 20% volume to be audible but comfortable

  const addEvent = useCallback((type: ExperimentData['events'][0]['type'], data: Record<string, unknown> = {}) => {
    const absoluteTimestamp = Date.now();
    const relativeTimestamp = absoluteTimestamp - startTimeRef.current;
    console.log('📝 addEvent called:', type, 'at absolute:', absoluteTimestamp, 'relative:', relativeTimestamp, 'with data:', data);
    setExperimentData(prev => {
      const newEvent = { timestamp: absoluteTimestamp, type, data };
      const newEvents = [...prev.events, newEvent];
      const newState = {
        ...prev,
        events: newEvents
      };
      console.log('📝 Added event to array, new length:', newEvents.length, 'event:', newEvent);
      
      return newState;
    });
  }, []);

  const playTestSound = useCallback(async () => {
    try {
      console.log('🔔 Playing test sound...');
      
      // Create a temporary audio context for the test sound
      const testContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume if suspended
      if (testContext.state === 'suspended') {
        await testContext.resume();
      }
      
      // Create a simple 800Hz beep for 0.3 seconds
      const oscillator = testContext.createOscillator();
      const gainNode = testContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(testContext.destination);
      
      oscillator.frequency.value = 800; // 800Hz beep
      oscillator.type = 'sine';
      
      // Volume envelope
      gainNode.gain.setValueAtTime(0, testContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, testContext.currentTime + 0.05); // Fade in
      gainNode.gain.exponentialRampToValueAtTime(0.001, testContext.currentTime + 0.3); // Fade out
      
      oscillator.start(testContext.currentTime);
      oscillator.stop(testContext.currentTime + 0.3);
      
      // Clean up after the sound finishes
      setTimeout(() => {
        testContext.close();
      }, 500);
      
      console.log('🔔 Test sound played successfully');
      setAudioDebugInfo('🔔 Test sound played - 800Hz beep');
      
    } catch (error) {
      console.error('❌ Test sound failed:', error);
      setAudioDebugInfo(`❌ Test sound failed: ${error}`);
    }
  }, []);

  const checkAudioPermissions = useCallback(async () => {
    try {
      // Check if the browser supports the permissions API
      if ('permissions' in navigator) {
        // Note: 'microphone' permission is closest - there's no 'audio-output' permission
        console.log('🔍 Checking audio permissions...');
        setAudioDebugInfo('Checking browser audio permissions...');
      }
      
      // Test if we can create an AudioContext WITHOUT closing it
      // This prevents the "closed" state issue
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const testContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('✅ AudioContext creation test passed, state:', testContext.state);
        setAudioPermissionStatus('granted');
        setAudioDebugInfo(`Audio context state: ${testContext.state}`);
        
        // Store the context instead of closing it
        audioContextRef.current = testContext;
        
        // If suspended, we'll resume it later with user interaction
        if (testContext.state === 'suspended') {
          setAudioDebugInfo(`Audio context created but suspended (will resume on user interaction)`);
        }
      } else {
        console.log('✅ AudioContext already exists, state:', audioContextRef.current.state);
        setAudioPermissionStatus('granted');
        setAudioDebugInfo(`Audio context state: ${audioContextRef.current.state}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Audio permissions check failed:', error);
      setAudioPermissionStatus('denied');
      setAudioDebugInfo(`Audio permission denied: ${error}`);
      return false;
    }
  }, []);

  const initializeAudioContext = useCallback(async () => {
    try {
      setAudioDebugInfo('Initializing audio context...');
      
      // Always use existing context from checkAudioPermissions, or create fresh one
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        // Create new AudioContext
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log('🔊 AudioContext created, state:', audioContextRef.current.state);
        setAudioDebugInfo(`AudioContext created, state: ${audioContextRef.current.state}`);
      }
      
      // Ensure context is running (required for user interaction in Chrome)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('🔊 AudioContext resumed, state:', audioContextRef.current.state);
        setAudioDebugInfo(`AudioContext resumed, state: ${audioContextRef.current.state}`);
      }
      
      // Verify context is actually running before proceeding
      if (audioContextRef.current.state !== 'running') {
        throw new Error(`AudioContext failed to start, state: ${audioContextRef.current.state}`);
      }
      
      // Test audio capability with a brief audible test beep
      const testOsc = audioContextRef.current.createOscillator();
      const testGain = audioContextRef.current.createGain();
      
      // Make it briefly audible to test audio output
      testGain.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
      testGain.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.1);
      
      testOsc.frequency.setValueAtTime(800, audioContextRef.current.currentTime); // 800Hz test tone
      testOsc.connect(testGain);
      testGain.connect(audioContextRef.current.destination);
      testOsc.start();
      testOsc.stop(audioContextRef.current.currentTime + 0.1); // 100ms test beep
      
      console.log('🔊 AudioContext initialized with test beep, state:', audioContextRef.current.state);
      setAudioDebugInfo(`Audio test completed. Context state: ${audioContextRef.current.state}`);
      setAudioPermissionStatus('granted');
      
    } catch (error) {
      console.error('❌ Failed to initialize AudioContext:', error);
      setAudioDebugInfo(`Audio initialization failed: ${error}`);
      setAudioPermissionStatus('denied');
      throw error; // Re-throw to prevent audio start
    }
  }, []);

  const startAudio = useCallback(async () => {
    try {
      // Ensure we have a fresh audio context
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        await initializeAudioContext();
      }

      if (!audioContextRef.current) {
        console.error('❌ Failed to initialize AudioContext');
        return;
      }

      // Resume context if needed
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('🔊 AudioContext resumed');
      }

      // Check if audio context is actually running
      if (audioContextRef.current.state !== 'running') {
        console.error('❌ AudioContext is not running, state:', audioContextRef.current.state);
        return;
      }

      // Always create fresh oscillators to ensure proper frequency setting
      if (audioContextRef.current) {
        const audioContext = audioContextRef.current;
        
        // Clean up any existing oscillators first
        if (carrierOscillatorRef.current) {
          try { carrierOscillatorRef.current.stop(); } catch (e) { /* ignore */ }
          carrierOscillatorRef.current = null;
        }
        if (modulatorOscillatorRef.current) {
          try { modulatorOscillatorRef.current.stop(); } catch (e) { /* ignore */ }
          modulatorOscillatorRef.current = null;
        }
        if (constantSourceRef.current) {
          try { constantSourceRef.current.stop(); } catch (e) { /* ignore */ }
          constantSourceRef.current = null;
        }
        
        // Create amplitude modulated signal:
        // AM signal = carrier * (1 + modulation_depth * modulator)
        
        // 1. Create 2000Hz carrier oscillator
        const carrierOscillator = audioContext.createOscillator();
        carrierOscillator.frequency.value = CARRIER_FREQUENCY; // Use .value instead of setValueAtTime for immediate setting
        carrierOscillator.type = 'sine';
        
        // 2. Create 40Hz modulator oscillator
        const modulatorOscillator = audioContext.createOscillator();
        modulatorOscillator.frequency.value = MODULATION_FREQUENCY; // Use .value for immediate setting
        modulatorOscillator.type = 'sine';
        
        // 3. Create gain node for modulator (controls modulation depth)
        const modulatorGain = audioContext.createGain();
        modulatorGain.gain.value = 0.3; // Reduced modulation depth (30% instead of 50%) for smoother AM
        
        // 4. Create low-pass filter to smooth the modulation signal (anti-aliasing)
        const modulatorFilter = audioContext.createBiquadFilter();
        modulatorFilter.type = 'lowpass';
        modulatorFilter.frequency.value = 80; // Filter at 2x modulation frequency (40Hz * 2) to reduce artifacts
        modulatorFilter.Q.value = 0.7; // Gentle filtering
        
        // 5. Create amplitude control gain node (for AM modulation)
        const amplitudeGain = audioContext.createGain();
        amplitudeGain.gain.value = 0; // Start at 0, will be controlled by modulation
        
        // 6. Create final output gain node (for volume control with fade-in)
        const outputGain = audioContext.createGain();
        outputGain.gain.setValueAtTime(0, audioContext.currentTime); // Start silent
        outputGain.gain.linearRampToValueAtTime(AUDIO_AMPLITUDE, audioContext.currentTime + 0.1); // 100ms fade-in
        
        // 7. Create low-pass filter for final output (removes high-frequency artifacts)
        const outputFilter = audioContext.createBiquadFilter();
        outputFilter.type = 'lowpass';
        outputFilter.frequency.value = 4000; // Remove frequencies above 4kHz to reduce clicking
        outputFilter.Q.value = 0.5; // Gentle roll-off
        
        // Connect the smoothed AM chain: 
        // Carrier -> AmplitudeGain -> OutputGain -> OutputFilter -> Destination
        carrierOscillator.connect(amplitudeGain);
        amplitudeGain.connect(outputGain);
        outputGain.connect(outputFilter);
        outputFilter.connect(audioContext.destination);
        
        // Create filtered AM modulation: 
        // Modulator -> ModulatorGain -> ModulatorFilter -> AmplitudeGain
        modulatorOscillator.connect(modulatorGain);
        modulatorGain.connect(modulatorFilter);
        modulatorFilter.connect(amplitudeGain.gain);
        
        // Create constant source for DC offset in AM signal
        const constantSource = audioContext.createConstantSource();
        constantSource.offset.value = 0.8; // Higher DC offset (0.8 + 0.3*[-1,1] = [0.5, 1.1]) for smoother modulation
        constantSource.connect(amplitudeGain.gain);
        constantSource.start();
        
        // Start both oscillators
        carrierOscillator.start();
        modulatorOscillator.start();
        
        // Store references
        carrierOscillatorRef.current = carrierOscillator;
        modulatorOscillatorRef.current = modulatorOscillator;
        modulatorGainRef.current = modulatorGain;
        outputGainRef.current = outputGain;
        constantSourceRef.current = constantSource;
        
        console.log('🔊 Setting isPlaying to TRUE');
        setIsPlaying(true);
        isPlayingRef.current = true;

        console.log('🔊 AM audio started - Carrier:', CARRIER_FREQUENCY, 'Hz, Modulation:', MODULATION_FREQUENCY, 'Hz');
        console.log('🔊 Audio nodes created and connected:');
        console.log('  - Carrier oscillator frequency:', carrierOscillator.frequency.value, 'Hz');
        console.log('  - Modulator oscillator frequency:', modulatorOscillator.frequency.value, 'Hz');
        console.log('  - Amplitude gain (AM controlled):', amplitudeGain.gain.value);
        console.log('  - Output gain (volume):', outputGain.gain.value);
        console.log('  - Modulator gain (depth):', modulatorGain.gain.value, '(reduced for smoother AM)');
        console.log('  - Modulator filter cutoff:', modulatorFilter.frequency.value, 'Hz (anti-aliasing)');
        console.log('  - Output filter cutoff:', outputFilter.frequency.value, 'Hz (artifact reduction)');
        console.log('  - Constant source offset:', constantSource.offset.value);
        console.log('  - AudioContext state:', audioContext.state);
        console.log('  - AudioContext destination connected:', !!audioContext.destination);
        
        setAudioDebugInfo(`🔊 AUDIO PLAYING: ${CARRIER_FREQUENCY}Hz AM @ ${MODULATION_FREQUENCY}Hz`);
        
        addEvent('audio_start', { 
          carrierFrequency: CARRIER_FREQUENCY,
          modulationFrequency: MODULATION_FREQUENCY, 
          amplitude: AUDIO_AMPLITUDE,
          timestamp: Date.now() - startTimeRef.current 
        });

        // Add to stimulus sequence
        setExperimentData(prev => ({
          ...prev,
          stimulusSequence: [...prev.stimulusSequence, {
            timestamp: Date.now() - startTimeRef.current,
            duration: EXPERIMENT_DURATION,
            type: 'audio_tone',
            frequency: MODULATION_FREQUENCY // Record the modulation frequency as the key parameter
          }]
        }));
      }
    } catch (error) {
      console.error('❌ Error starting audio:', error);
    }
  }, [addEvent, CARRIER_FREQUENCY, MODULATION_FREQUENCY, AUDIO_AMPLITUDE, EXPERIMENT_DURATION, initializeAudioContext]);

  const stopAudio = useCallback(() => {
    try {
      // Debug: Log the current isPlaying state and oscillator states with stack trace
      console.log('🔇 stopAudio called - isPlaying state:', isPlaying, 'isPlayingRef:', isPlayingRef.current, 'hasCarrierOsc:', !!carrierOscillatorRef.current, 'hasModulatorOsc:', !!modulatorOscillatorRef.current);
      console.trace('🔍 stopAudio call stack:');
      
      // Only stop if audio is actually playing OR if we have oscillator references
      // Use ref for immediate state check
      if (!isPlayingRef.current && !carrierOscillatorRef.current && !modulatorOscillatorRef.current) {
        console.log('🔇 Audio already stopped and no oscillators exist, skipping');
        return;
      }

      // Set playing to false immediately to prevent duplicate calls
      setIsPlaying(false);
      isPlayingRef.current = false;

      // Add fade-out to prevent clicking when stopping
      if (outputGainRef.current && audioContextRef.current) {
        try {
          const currentTime = audioContextRef.current.currentTime;
          outputGainRef.current.gain.cancelScheduledValues(currentTime);
          outputGainRef.current.gain.setValueAtTime(outputGainRef.current.gain.value, currentTime);
          outputGainRef.current.gain.linearRampToValueAtTime(0, currentTime + 0.05); // 50ms fade-out
        } catch (e) {
          console.warn('Warning applying fade-out:', e);
        }
      }

      // Stop oscillators after fade-out
      setTimeout(() => {
        if (carrierOscillatorRef.current) {
          try {
            carrierOscillatorRef.current.stop();
          } catch (e) {
            console.warn('Warning stopping carrier oscillator:', e);
          }
          carrierOscillatorRef.current = null;
        }
        if (modulatorOscillatorRef.current) {
          try {
            modulatorOscillatorRef.current.stop();
          } catch (e) {
            console.warn('Warning stopping modulator oscillator:', e);
          }
          modulatorOscillatorRef.current = null;
        }
        if (constantSourceRef.current) {
          try {
            constantSourceRef.current.stop();
          } catch (e) {
            console.warn('Warning stopping constant source:', e);
          }
          constantSourceRef.current = null;
        }
      }, 60); // Wait slightly longer than fade-out
      
      modulatorGainRef.current = null;
      outputGainRef.current = null;
      
      console.log('🔇 AM audio stopped');
      addEvent('audio_stop', { 
        carrierFrequency: CARRIER_FREQUENCY,
        modulationFrequency: MODULATION_FREQUENCY,
        timestamp: Date.now() - startTimeRef.current 
      });

      setAudioDebugInfo('🔇 Audio stopped');
    } catch (error) {
      console.error('❌ Error stopping audio:', error);
      setAudioDebugInfo(`❌ Error stopping audio: ${error}`);
    }
  }, [addEvent, CARRIER_FREQUENCY, MODULATION_FREQUENCY]);

  const enterFullscreen = useCallback(async () => {
    if (containerRef.current) {
      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (containerRef.current as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        } else if ((containerRef.current as unknown as { msRequestFullscreen?: () => Promise<void> }).msRequestFullscreen) {
          await (containerRef.current as unknown as { msRequestFullscreen: () => Promise<void> }).msRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (error) {
        console.warn('Fullscreen not supported or denied:', error);
        setIsFullscreen(true); // Continue anyway
      }
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
        await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
      } else if ((document as unknown as { msExitFullscreen?: () => Promise<void> }).msExitFullscreen) {
        await (document as unknown as { msExitFullscreen: () => Promise<void> }).msExitFullscreen();
      }
    } catch (error) {
      console.warn('Error exiting fullscreen:', error);
    }
    setIsFullscreen(false);
  }, []);

  const startCountdown = useCallback(() => {
    console.log('🟡 Starting countdown...');
    setPhase('countdown');
    let count = 3;
    setCountdown(count);
    
    const countdownInterval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      
      if (count === 0) {
        console.log('🕐 Countdown finished, starting experiment');
        clearInterval(countdownInterval);
        if (startExperimentRef.current) {
          console.log('🚀 Calling startExperimentRef.current()');
          startExperimentRef.current();
        } else {
          console.log('❌ startExperimentRef.current is null!');
        }
      }
    }, 1000);
  }, []);

  // Helper function to extract stimulus annotations for EEG synchronization
  const extractStimulusAnnotations = useCallback((data: ExperimentData) => {
    const annotations = data.events
      .filter(event => event.type === 'audio_start')
      .map(event => ({
        timestamp: event.timestamp - data.startTime, // Convert back to relative milliseconds from experiment start
        absoluteTime: event.timestamp, // Already absolute timestamp
        stimulusType: 'audio_tone',
        frequency: MODULATION_FREQUENCY,
        amplitude: AUDIO_AMPLITUDE,
        duration: EXPERIMENT_DURATION
      }));

    // Also extract experiment metadata for synchronization
    const syncData = {
      experimentId: data.experimentId,
      startTime: data.startTime, // absolute start time (Unix timestamp)
      endTime: data.endTime, // absolute end time (Unix timestamp)
      duration: data.endTime - data.startTime, // actual experiment duration in ms
      totalAudioEvents: annotations.length,
      carrierFrequency: CARRIER_FREQUENCY,
      modulationFrequency: MODULATION_FREQUENCY,
      audioAmplitude: AUDIO_AMPLITUDE,
      annotations: annotations
    };

    console.log('📊 STIMULUS ANNOTATIONS FOR EEG SYNC:', syncData);
    return syncData;
  }, [CARRIER_FREQUENCY, MODULATION_FREQUENCY, AUDIO_AMPLITUDE, EXPERIMENT_DURATION]);

  const completeExperiment = useCallback((reason: 'duration_completed' | 'user_cancelled') => {
    console.log('🏁 completeExperiment called with reason:', reason);
    
    // Prevent duplicate completions
    if (experimentCompletedRef.current) {
      console.log('🚫 Experiment already completed, ignoring duplicate completion attempt');
      return;
    }
    
    experimentCompletedRef.current = true;
    console.log('🏁 Proceeding with experiment completion, reason:', reason);
    
    // Stop audio and clean up
    stopAudio();
    
    // Clean up any running timers
    if (experimentTimerRef.current) {
      console.log('🧹 Clearing main experiment timer with ID:', experimentTimerRef.current);
      clearTimeout(experimentTimerRef.current);
      experimentTimerRef.current = null;
    }
    
    const endTime = Date.now();
    console.log('🔚 Experiment ended at:', endTime, 'reason:', reason);
    
    // Use state updater function to access current state
    setExperimentData(currentData => {
      console.log('🔍 experimentData in state updater:', currentData);
      console.log('🔍 currentData.events.length:', currentData.events.length);
      
      // Create the final data with current state
      const finalData: ExperimentData = {
        ...currentData,
        startTime: startTimeRef.current, // Use the actual start time
        endTime: endTime,
        events: [
          ...currentData.events,
          {
            timestamp: endTime, // Use absolute timestamp
            type: 'experiment_end' as const,
            data: { reason }
          }
        ]
      };
      
      console.log('📋 Final experiment data:', finalData);
      console.log('📈 Final events count:', finalData.events.length);
      console.log('🎯 Final stimulus sequence count:', finalData.stimulusSequence.length);
      
      // Set completion status and phase to complete to show summary screen
      setCompletionStatus(reason === 'duration_completed' ? 'completed' : 'interrupted');
      setPhase('complete');
      
      // Exit fullscreen and process data
      exitFullscreen()
        .finally(() => {
          // Process the data regardless of fullscreen exit success/failure
          setTimeout(() => {
            handleComplete(finalData);
          }, 500);
        });
      
      return finalData; // Return the updated state
    });
  }, [stopAudio, exitFullscreen]);

  const handleComplete = useCallback((finalData?: ExperimentData) => {
    // Prevent duplicate calls
    if (handleCompleteCalledRef.current) {
      console.log('🚫 handleComplete already called, ignoring duplicate call');
      return;
    }
    
    handleCompleteCalledRef.current = true;
    console.log('✅ handleComplete executing for the first time');
    
    // Use provided data or current state
    const dataToUse = finalData || experimentData;
    
    console.log('🔍 handleComplete called with finalData provided:', !!finalData);
    console.log('📝 Events count:', dataToUse.events.length);
    console.log('📊 Stimulus sequence count:', dataToUse.stimulusSequence.length);
    
    // Extract stimulus annotations for EEG synchronization
    const stimulusAnnotations = extractStimulusAnnotations(dataToUse);
    console.log('🔬 Raw stimulusAnnotations:', stimulusAnnotations);
    
    // Convert annotations to database format
    const annotations: AnnotationData[] = stimulusAnnotations.annotations.map(ann => ({
      timestamp: ann.absoluteTime, // Use absolute timestamp for CSV
      stimulusType: String(ann.stimulusType),
      stimulusValue: `${CARRIER_FREQUENCY}Hz_AM_${MODULATION_FREQUENCY}Hz`,
      response: undefined, // No user responses in this experiment
      reactionTime: undefined
    }));

    console.log('📋 Final annotations array length:', annotations.length);

    // Determine completion status from the experiment end event
    const endEvent = dataToUse.events.find(e => e.type === 'experiment_end');
    const completionStatus = endEvent?.data?.reason === 'duration_completed' ? 'completed' : 'interrupted';
    
    // Create experiment result for database
    const experimentResult: ExperimentResult = {
      id: dataToUse.experimentId + '_' + Date.now(),
      experimentType: '40Hz_Auditory',
      experimentName: config?.id || '40Hz_Audio#1',
      timestamp: dataToUse.startTime,
      duration: dataToUse.endTime - dataToUse.startTime,
      completed: true,
      completionStatus: completionStatus as 'completed' | 'interrupted',
      annotations: annotations,
      rawData: dataToUse as unknown as Record<string, unknown>
    };

    // Save to volatile database
    experimentDB.saveExperiment(experimentResult);
    
    // Include annotations in the completion data
    const completeData = {
      ...dataToUse,
      stimulusAnnotations,
      // Add CSV-ready format for easy export
      csvAnnotations: stimulusAnnotations.annotations.map(ann => ({
        timestamp_ms: ann.timestamp,
        absolute_time: ann.absoluteTime,
        stimulus_type: ann.stimulusType,
        carrier_frequency_hz: CARRIER_FREQUENCY,
        modulation_frequency_hz: MODULATION_FREQUENCY,
        amplitude: ann.amplitude,
        duration_ms: ann.duration
      }))
    };
    
    console.log('💾 Saved experiment to database:', experimentResult.id);
    
    // Store the completed data
    setCompletedData(completeData);
    
  }, [experimentData, extractStimulusAnnotations, config?.id]);

  const handleCancel = useCallback(() => {
    console.log('🛑 handleCancel: Cleaning up...');
    
    // Stop audio first
    stopAudio();
    
    // Clean up timers
    if (experimentTimerRef.current) {
      console.log('🛑 Clearing experiment timer');
      clearTimeout(experimentTimerRef.current);
      experimentTimerRef.current = null;
    }
    
    // Clean up audio context safely
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().then(() => {
        audioContextRef.current = null;
      }).catch(error => {
        console.warn('Error closing AudioContext:', error);
        audioContextRef.current = null;
      });
    }
    
    exitFullscreen();
    onCancel();
  }, [onCancel, exitFullscreen, stopAudio]);

  const startExperiment = useCallback(async () => {
    console.log('=== STARTING 40Hz AUDITORY EXPERIMENT ===');
    console.log('Duration:', EXPERIMENT_DURATION, 'ms');
    console.log('Carrier frequency:', CARRIER_FREQUENCY, 'Hz');
    console.log('Modulation frequency:', MODULATION_FREQUENCY, 'Hz');
    console.log('Audio amplitude:', AUDIO_AMPLITUDE);
    
    // Reset completion flags for new experiment
    experimentCompletedRef.current = false;
    handleCompleteCalledRef.current = false;
    console.log('✅ Reset completion flags to false');
    
    // Clear any existing timers first
    if (experimentTimerRef.current) {
      console.log('🧹 Clearing existing experiment timer');
      clearTimeout(experimentTimerRef.current);
      experimentTimerRef.current = null;
    }
    
    setPhase('stimulus');
    startTimeRef.current = Date.now();
    
    setExperimentData(prev => ({
      ...prev,
      startTime: Date.now(),
      experimentId: config?.id || '40hz-audio-1'
    }));
    
    addEvent('experiment_start', { 
      duration: EXPERIMENT_DURATION, 
      carrierFrequency: CARRIER_FREQUENCY,
      modulationFrequency: MODULATION_FREQUENCY 
    });

    // Initialize audio context with user interaction (required for browsers)
    initializeAudioContext()
      .then(() => {
        // Start audio after a small delay to ensure context is ready
        setTimeout(async () => {
          await startAudio();
        }, 200);
      })
      .catch(error => {
        console.error('❌ Error initializing audio context:', error);
      });

    // End experiment after duration
    console.log('🕐 Setting main experiment timer for', EXPERIMENT_DURATION, 'ms');
    const timerId = setTimeout(() => {
      console.log('=== MAIN EXPERIMENT TIMER ENDED ===');
      console.log('🕐 Timer fired after', EXPERIMENT_DURATION, 'ms - calling completeExperiment');
      if (!experimentCompletedRef.current) {
        completeExperiment('duration_completed');
      } else {
        console.log('🚫 Timer fired but experiment already completed');
      }
    }, EXPERIMENT_DURATION);
    experimentTimerRef.current = timerId;
    console.log('🕐 Timer set with ID:', timerId);
    
    // Add backup timer like P300 experiment
    const backupTimer = setTimeout(() => {
      console.log('⚠️ BACKUP TIMER FIRED - main timer may have been cleared');
      if (!experimentCompletedRef.current) {
        console.log('🔄 Triggering backup completion');
        completeExperiment('duration_completed');
      }
    }, EXPERIMENT_DURATION + 1000); // Fire 1 second after main timer
    console.log('🛡️ Backup timer set with ID:', backupTimer);
    
  }, [addEvent, config, EXPERIMENT_DURATION, CARRIER_FREQUENCY, MODULATION_FREQUENCY, AUDIO_AMPLITUDE, initializeAudioContext, startAudio, completeExperiment]);

  // Update the ref whenever startExperiment changes
  useEffect(() => {
    startExperimentRef.current = startExperiment;
  }, [startExperiment]);

  // Check audio permissions on mount
  useEffect(() => {
    checkAudioPermissions();
  }, [checkAudioPermissions]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    console.log('🔑 Key pressed:', event.key, 'in phase:', phase);
    if (phase === 'consent' && event.key === ' ') {
      console.log('✅ Space pressed in consent phase, starting experiment flow');
      addEvent('consent_given');
      
      // Initialize audio context with user interaction (required for Chrome)
      initializeAudioContext().then(() => {
        console.log('🔊 Audio context ready after user interaction');
        enterFullscreen();
        startCountdown();
      }).catch(error => {
        console.error('❌ Audio context initialization failed:', error);
        // Continue anyway
        enterFullscreen();
        startCountdown();
      });
    } else if (phase === 'stimulus') {
      if (event.key === 'Escape') {
        console.log('🛑 User pressed ESC, ending experiment early...');
        completeExperiment('user_cancelled');
      }
    } else if (phase === 'complete' && (event.key === 'Escape' || event.key === ' ')) {
      console.log('👋 User pressed key to return to experiments tab:', event.key);
      if (completedData) {
        onComplete(completedData);
      } else {
        onCancel();
      }
    }
  }, [phase, addEvent, enterFullscreen, startCountdown, completeExperiment, completedData, onComplete, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      
      // Clean up timers and audio on unmount
      if (experimentTimerRef.current) {
        clearTimeout(experimentTimerRef.current);
      }
      
      stopAudio();
      
      // Safely close AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(error => {
          console.warn('Error closing AudioContext on unmount:', error);
        });
      }
    };
  }, [handleKeyPress, stopAudio]);

  const renderConsentScreen = () => (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8">
      <h1 className="text-4xl font-bold text-[var(--navy)] mb-4">40Hz Sound Stimulation</h1>
      <div className="max-w-2xl space-y-6">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-2xl font-semibold text-[var(--navy)] mb-4">Experiment Instructions</h2>
          <div className="text-left space-y-4 text-gray-700">
            <p>• You will hear a 2000Hz carrier wave modulated at 40Hz (amplitude modulation)</p>
            <p>• The experiment will run for {Math.round((config?.duration || 15000) / 1000)} seconds</p>
            <p>• Simply relax and listen to the audio stimulus</p>
            <p>• The 40Hz modulation is designed to stimulate gamma brain wave activity</p>
            <p>• The audio volume is set to a comfortable level</p>
            <p>• The screen will enter fullscreen mode with a dark gray background</p>
            <p>• Press ESC during the experiment to exit early</p>
          </div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 font-medium">
            ⚠️ Make sure your audio is enabled and at a comfortable volume
          </p>
        </div>

        {/* Audio Debug Panel */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Audio System Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Permission:</span>
              <span className={`px-2 py-1 rounded text-xs ${
                audioPermissionStatus === 'granted' ? 'bg-green-100 text-green-800' :
                audioPermissionStatus === 'denied' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {audioPermissionStatus.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">Debug Info:</span>
              <span className="text-gray-600 font-mono text-xs">{audioDebugInfo || 'Not initialized'}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={checkAudioPermissions}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
              >
                Test Audio Permissions
              </button>
              <button
                onClick={playTestSound}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
              >
                🔔 Test Sound
              </button>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <p className="text-xl font-semibold text-[var(--navy)]">
            Press SPACEBAR when you&apos;re ready to begin
          </p>
          <p className="text-gray-600">
            The experiment will start after a 3-second countdown
          </p>
        </div>
      </div>
      
      <div className="mt-8">
        <button
          onClick={handleCancel}
          className="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors"
        >
          Cancel Experiment
        </button>
      </div>
    </div>
  );

  const renderCountdown = () => (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-8xl font-bold text-[var(--gold)] animate-pulse">
        {countdown}
      </div>
      <p className="text-2xl text-[var(--navy)] mt-8">
        Get ready...
      </p>
    </div>
  );

  const renderStimulus = () => (
    <div className="flex flex-col items-center justify-center h-full relative bg-gray-700 overflow-hidden">
      {/* Audio indicator */}
      <div className="absolute top-8 left-8 z-30">
        <div className={`w-6 h-6 transition-all duration-200 border-2 border-white rounded-full ${
          isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
        }`}></div>
        <div className="bg-black bg-opacity-75 text-white text-xs mt-1 font-mono px-1 rounded">
          {isPlaying ? '🔊 2kHz@40Hz' : '🔇 OFF'}
        </div>
        {/* Audio debug info during experiment */}
        <div className="bg-black bg-opacity-75 text-white text-xs mt-1 px-2 py-1 rounded max-w-48 break-words">
          {audioDebugInfo}
        </div>
        <div className="bg-black bg-opacity-75 text-white text-xs mt-1 px-1 rounded">
          Audio: {audioPermissionStatus}
        </div>
      </div>
      
      {/* Progress indicator */}
      <div className="absolute top-8 right-8 z-30">
        <div className="bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
          2kHz AM @ 40Hz ({Math.round(EXPERIMENT_DURATION / 1000)}s)
        </div>
      </div>
      
      {/* Center content */}
      <div className="text-center">
        <div className="text-6xl mb-8">🎵</div>
        <h2 className="text-3xl text-white font-light mb-4">2kHz AM @ 40Hz</h2>
        <p className="text-white text-opacity-75 text-lg">
          Relax and listen to the amplitude modulated audio
        </p>
      </div>
      
      {/* Instructions */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30 text-center">
        <div className="bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
          <p className="mb-2">
            Listen to the 2kHz carrier modulated at 40Hz for gamma wave entrainment
          </p>
          <p className="text-sm text-gray-300">
            Carrier: {CARRIER_FREQUENCY}Hz • Modulation: {MODULATION_FREQUENCY}Hz • Press ESC to exit
          </p>
        </div>
      </div>
    </div>
  );

  const renderComplete = () => {
    const isCompleted = completionStatus === 'completed';
    const bgColor = isCompleted ? 'bg-green-50' : 'bg-yellow-50';
    const borderColor = isCompleted ? 'border-green-200' : 'border-yellow-200';
    const textColor = isCompleted ? 'text-green-800' : 'text-yellow-800';
    const titleColor = isCompleted ? 'text-green-700' : 'text-yellow-700';
    const emoji = isCompleted ? '✅' : '⚠️';
    const title = isCompleted ? 'Experiment Complete!' : 'Experiment Interrupted';
    const statusText = isCompleted ? 'Session Summary' : 'Session Summary (Terminated Early)';

    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8">
        <div className="text-6xl mb-4">{emoji}</div>
        <h1 className="text-4xl font-bold text-[var(--navy)]">{title}</h1>
        
        <div className={`${bgColor} p-6 rounded-lg ${borderColor} border max-w-2xl`}>
          <h2 className={`text-xl font-semibold ${textColor} mb-4`}>{statusText}</h2>
          <div className={`text-left space-y-2 ${titleColor}`}>
            <p>• Total events recorded: {experimentData.events.length}</p>
            <p>• Carrier frequency: {CARRIER_FREQUENCY}Hz</p>
            <p>• Modulation frequency: {MODULATION_FREQUENCY}Hz</p>
            <p>• Audio amplitude: {(AUDIO_AMPLITUDE * 100).toFixed(1)}%</p>
            <p>• Duration: {Math.round((experimentData.endTime - experimentData.startTime) / 1000)}s</p>
            <p>• Stimulus type: Amplitude modulated carrier wave</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            {isCompleted 
              ? 'Thank you for participating! Your 40Hz auditory stimulation data has been recorded.'
              : 'Thank you for participating! The experiment was terminated early, but your data has been recorded.'
            }
          </p>
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-blue-800 font-semibold">
              Press <span className="bg-blue-200 px-2 py-1 rounded font-mono">SPACEBAR</span> or 
              <span className="bg-blue-200 px-2 py-1 rounded font-mono mx-1">ESC</span> to return to experiments
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`${isFullscreen ? 'fixed inset-0 z-[9999]' : 'fixed inset-0 z-50'} bg-gray-200 overflow-hidden`}
      style={{ cursor: phase === 'stimulus' ? 'none' : 'default' }}
    >
      {phase === 'consent' && renderConsentScreen()}
      {phase === 'countdown' && renderCountdown()}
      {phase === 'stimulus' && renderStimulus()}
      {phase === 'complete' && renderComplete()}
    </div>
  );
};

export default AuditoryStimulus40Hz;