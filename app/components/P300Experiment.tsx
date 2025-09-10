'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { experimentDB, ExperimentResult, AnnotationData } from '../utils/experimentDatabase';

/**
 * P300 EXPERIMENT - EEG SYNCHRONIZATION GUIDE
 * ==========================================
 * 
 * This component generates precise stimulus timing data for EEG synchronization.
 * 
 * EXTRACTING STIMULUS ANNOTATIONS:
 * The onComplete callback receives a data object with:
 * 
 * 1. stimulusAnnotations.annotations[] - Array of stimulus events with:
 *    - timestamp: milliseconds from experiment start (relative timing)
 *    - absoluteTime: Unix timestamp (absolute timing)
 *    - stimulusType: 'target' | 'standard'
 *    - isTarget: boolean (true for oddball stimuli)
 *    - duration: stimulus duration in milliseconds
 *    - patternType: 'red-yellow-checkerboard' | 'black-white-checkerboard'
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
 * - Send trigger signals to EEG during stimulus_on events
 * - Use timestamp values for relative timing verification
 * - Most reliable for precise neural timing
 * 
 * Method 3: Manual Synchronization
 * - Record experiment start time manually
 * - Use relative timestamps (data.stimulusAnnotations.annotations[].timestamp)
 * - Add to EEG recording start time
 * 
 * EXAMPLE USAGE:
 * ```javascript
 * const handleExperimentComplete = (data) => {
 *   const annotations = data.stimulusAnnotations.annotations;
 *   
 *   // For EEG analysis software (e.g., MNE-Python, EEGLAB)
 *   const eegMarkers = annotations.map(ann => ({
 *     time: ann.timestamp / 1000, // Convert to seconds
 *     type: ann.isTarget ? 'target' : 'standard',
 *     description: ann.patternType
 *   }));
 *   
 *   // Export as CSV for manual import
 *   const csvData = data.csvAnnotations;
 * };
 * ```
 */

interface P300ExperimentProps {
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
    type: 'stimulus_on' | 'stimulus_off' | 'user_response' | 'experiment_start' | 'experiment_end' | 'consent_given';
    data: Record<string, unknown>;
  }>;
  stimulusSequence: Array<{
    timestamp: number;
    duration: number;
    type: 'target' | 'standard' | 'periodic' | 'random';
  }>;
}

type ExperimentPhase = 'consent' | 'countdown' | 'stimulus' | 'complete';

const P300Experiment: React.FC<P300ExperimentProps> = ({ onComplete, onCancel, config }) => {
  const [phase, setPhase] = useState<ExperimentPhase>('consent');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [currentStimulusType, setCurrentStimulusType] = useState<'target' | 'standard' | null>(null);
  const [completedData, setCompletedData] = useState<ExperimentData | null>(null);
  const [completionStatus, setCompletionStatus] = useState<'completed' | 'interrupted' | null>(null);
  const [experimentData, setExperimentData] = useState<ExperimentData>({
    experimentId: 'p300-1',
    startTime: 0,
    endTime: 0,
    events: [],
    stimulusSequence: []
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const experimentTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stimulusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const experimentCompletedRef = useRef<boolean>(false);
  const handleCompleteCalledRef = useRef<boolean>(false);
  const startExperimentRef = useRef<(() => void) | null>(null);

  // Experiment parameters
  const EXPERIMENT_DURATION = config?.duration || 15000; // Use config or default
  const TARGET_FLICKER_RATE = 6.67; // Hz (P300 oddball paradigm)
  const INTER_STIMULUS_INTERVAL = 1000 / TARGET_FLICKER_RATE; // ~150ms
  const STIMULUS_DURATION = 75; // 75ms flash (typical for P300)
  const TARGET_PROBABILITY = 0.20; // 20% target stimuli (oddball)
  const JITTER_RANGE = 0; //50; // ±50ms jitter for more realistic timing

  const addEvent = useCallback((type: ExperimentData['events'][0]['type'], data: Record<string, unknown> = {}) => {
    const absoluteTimestamp = Date.now(); // Use absolute timestamp
    const relativeTimestamp = absoluteTimestamp - startTimeRef.current; // Keep relative for compatibility
    console.log('📝 addEvent called:', type, 'at absolute:', absoluteTimestamp, 'relative:', relativeTimestamp, 'with data:', data);
    setExperimentData(prev => {
      const newEvent = { timestamp: absoluteTimestamp, type, data }; // Store absolute timestamp
      const newEvents = [...prev.events, newEvent];
      const newState = {
        ...prev,
        events: newEvents
      };
      console.log('📝 Added event to array, new length:', newEvents.length, 'event:', newEvent);
      
      return newState;
    });
  }, []);

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

  const scheduleNextStimulus = useCallback(() => {
    // Don't schedule if experiment is completed
    console.log('🔍 scheduleNextStimulus called, experimentCompletedRef.current:', experimentCompletedRef.current);
    if (experimentCompletedRef.current) {
      console.log('🚫 scheduleNextStimulus called but experiment already completed');
      return;
    }
    
    console.log('=== scheduleNextStimulus CALLED ===');
    console.log('startTimeRef.current:', startTimeRef.current);
    console.log('Date.now():', Date.now());
    
    // Check if experiment should still be running
    const currentTime = Date.now() - startTimeRef.current;
    console.log('Current time elapsed:', currentTime, 'ms');
    console.log('Experiment duration limit:', EXPERIMENT_DURATION, 'ms');
    
    if (currentTime >= EXPERIMENT_DURATION) {
      console.log('❌ Experiment duration reached, stopping stimuli at:', currentTime, 'ms');
      return; // Stop scheduling if duration exceeded
    }
    
    // Calculate next stimulus timing with jitter
    const baseInterval = INTER_STIMULUS_INTERVAL;
    const jitter = (Math.random() - 0.5) * 2 * JITTER_RANGE; // ±JITTER_RANGE ms
    const delay = Math.max(50, baseInterval + jitter); // Minimum 50ms delay
    console.log('Calculated delay:', delay, 'ms (base:', baseInterval, 'jitter:', jitter, ')');
    
    // Make sure we don't schedule beyond the experiment duration
    const timeRemaining = EXPERIMENT_DURATION - currentTime;
    console.log('⏰ Time check - remaining:', timeRemaining, 'ms, delay:', delay, 'ms');
    if (delay >= timeRemaining) {
      console.log('❌ Not enough time remaining for next stimulus. Time remaining:', timeRemaining, 'ms, delay would be:', delay, 'ms');
      return;
    }
    
    console.log('✅ Scheduling stimulus in', delay, 'ms');
    console.log('About to set stimulusTimerRef.current timeout...');
    stimulusTimerRef.current = setTimeout(() => {
      console.log('=== STIMULUS TIMER FIRED ===');
      
      // Triple-check duration before showing stimulus
      const flickerStartTime = Date.now() - startTimeRef.current;
      console.log('Flicker start time:', flickerStartTime, 'ms');
      
      if (flickerStartTime >= EXPERIMENT_DURATION) {
        console.log('❌ Experiment duration reached during stimulus, stopping at:', flickerStartTime, 'ms');
        return;
      }
      
      // Determine if this is a target (oddball) or standard stimulus
      const isTarget = Math.random() < TARGET_PROBABILITY;
      const stimulusType = isTarget ? 'target' : 'standard';
      console.log('Selected stimulus type:', stimulusType, '(isTarget:', isTarget, ')');
      
      console.log('🔥 Setting stimulus state: visible=true, type=', stimulusType);
      console.log('Step 1: About to setStimulusVisible(true)');
      setStimulusVisible(true);
      console.log('Step 2: About to setCurrentStimulusType:', stimulusType);
      setCurrentStimulusType(stimulusType);
      console.log('Step 3: About to call addEvent stimulus_on');
      addEvent('stimulus_on', { type: stimulusType, flickerStartTime, isTarget, duration: EXPERIMENT_DURATION });
      console.log('Step 4: addEvent completed successfully');
      
      console.log('🔵 STIMULUS ON:', stimulusType.toUpperCase(), 'at:', flickerStartTime, 'ms');
      
      // Add to stimulus sequence
      setExperimentData(prev => ({
        ...prev,
        stimulusSequence: [...prev.stimulusSequence, {
          timestamp: flickerStartTime,
          duration: STIMULUS_DURATION,
          type: stimulusType
        }]
      }));

      // Turn off stimulus after duration
      console.log('⏰ Setting timeout to turn off stimulus in', STIMULUS_DURATION, 'ms');
      setTimeout(() => {
        console.log('🔴 STIMULUS OFF TIMER FIRED');
        setStimulusVisible(false);
        setCurrentStimulusType(null);
        addEvent('stimulus_off', { type: stimulusType, isTarget });
        console.log('🔴 STIMULUS OFF:', stimulusType.toUpperCase());
        
        // Schedule next stimulus only if we haven't exceeded duration
        const timeAfterStimulus = Date.now() - startTimeRef.current;
        const remainingTime = EXPERIMENT_DURATION - timeAfterStimulus;
        console.log('Time after stimulus:', timeAfterStimulus, 'ms, remaining:', remainingTime, 'ms');
        
        if (remainingTime > INTER_STIMULUS_INTERVAL) {
          console.log('⏭️ Scheduling next stimulus...');
          // Use direct recursion with a small delay to avoid stack issues
          setTimeout(() => {
            console.log('About to recursively call scheduleNextStimulus...');
            scheduleNextStimulus();
          }, 10);
        } else {
          console.log('⏹️ Not scheduling next stimulus - insufficient time remaining:', remainingTime, 'ms needed:', INTER_STIMULUS_INTERVAL, 'ms');
        }
      }, STIMULUS_DURATION);
    }, delay);
  }, [addEvent, EXPERIMENT_DURATION, INTER_STIMULUS_INTERVAL, STIMULUS_DURATION, TARGET_PROBABILITY, JITTER_RANGE]);

  // Helper function to extract stimulus annotations for EEG synchronization
  const extractStimulusAnnotations = useCallback((data: ExperimentData) => {
    const annotations = data.events
      .filter(event => event.type === 'stimulus_on')
      .map(event => ({
        timestamp: event.timestamp - data.startTime, // Convert back to relative milliseconds from experiment start
        absoluteTime: event.timestamp, // Already absolute timestamp
        stimulusType: event.data.type, // 'target' or 'standard'
        isTarget: event.data.isTarget,
        duration: STIMULUS_DURATION,
        patternType: event.data.isTarget ? 'red-yellow-checkerboard' : 'black-white-checkerboard'
      }));

    // Also extract experiment metadata for synchronization
    const syncData = {
      experimentId: data.experimentId,
      startTime: data.startTime, // absolute start time (Unix timestamp)
      endTime: data.endTime, // absolute end time (Unix timestamp)
      duration: data.endTime - data.startTime, // actual experiment duration in ms
      totalStimuli: annotations.length,
      targetStimuli: annotations.filter(a => a.isTarget).length,
      standardStimuli: annotations.filter(a => a.isTarget === false).length,
      targetPercentage: (annotations.filter(a => a.isTarget).length / annotations.length) * 100,
      stimulusRate: TARGET_FLICKER_RATE,
      annotations: annotations
    };

    console.log('📊 STIMULUS ANNOTATIONS FOR EEG SYNC:', syncData);
    return syncData;
  }, [STIMULUS_DURATION, TARGET_FLICKER_RATE]);

  const completeExperiment = useCallback((reason: 'duration_completed' | 'user_cancelled') => {
    console.log('🏁 completeExperiment called with reason:', reason);
    
    // Prevent duplicate completions
    if (experimentCompletedRef.current) {
      console.log('🚫 Experiment already completed, ignoring duplicate completion attempt');
      return;
    }
    
    experimentCompletedRef.current = true;
    console.log('🏁 Proceeding with experiment completion, reason:', reason);
    
    // Clean up any running timers
    if (experimentTimerRef.current) {
      console.log('🧹 Clearing main experiment timer with ID:', experimentTimerRef.current);
      clearTimeout(experimentTimerRef.current);
      experimentTimerRef.current = null;
    } else {
      console.log('⚠️ Main experiment timer was already null');
    }
    if (stimulusTimerRef.current) {
      console.log('🧹 Clearing stimulus timer');
      clearTimeout(stimulusTimerRef.current);
      stimulusTimerRef.current = null;
    }
    
    // Clear any visible stimulus
    setStimulusVisible(false);
    setCurrentStimulusType(null);
    
    const endTime = Date.now();
    console.log('🔚 Experiment ended at:', endTime, 'reason:', reason);
    
    // Use state updater function to access current state
    setExperimentData(currentData => {
      console.log('🔍 experimentData in state updater:', currentData);
      console.log('🔍 currentData.events.length:', currentData.events.length);
      console.log('🔍 currentData event types:', currentData.events.map(e => e.type));
      
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
      
      console.log('🔍 finalData after creation (using current):');
      console.log('🔍 finalData.events.length:', finalData.events.length);
      console.log('🔍 finalData event types:', finalData.events.map(e => e.type));
      console.log('📋 Final experiment data:', finalData);
      console.log('📈 Final events count:', finalData.events.length);
      console.log('🎯 Final stimulus sequence count:', finalData.stimulusSequence.length);
      console.log('🔍 All event types in finalData:', finalData.events.map(e => e.type));
      console.log('🔍 Stimulus_on events in finalData:', finalData.events.filter(e => e.type === 'stimulus_on').length);
      
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
  }, [experimentTimerRef, stimulusTimerRef, exitFullscreen]);

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
    console.log('🔍 handleComplete dataToUse:', dataToUse);
    console.log('📝 Events count:', dataToUse.events.length);
    console.log('📊 Stimulus sequence count:', dataToUse.stimulusSequence.length);
    console.log('🔍 Event types:', dataToUse.events.map(e => e.type));
    console.log('🔍 Stimulus_on events:', dataToUse.events.filter(e => e.type === 'stimulus_on').length);
    
    if (finalData) {
      console.log('🔍 Passed finalData details:');
      console.log('  - events.length:', finalData.events.length);
      console.log('  - event types:', finalData.events.map(e => e.type));
      console.log('  - stimulus_on count:', finalData.events.filter(e => e.type === 'stimulus_on').length);
    }
    
    // Extract stimulus annotations for EEG synchronization
    const stimulusAnnotations = extractStimulusAnnotations(dataToUse);
    console.log('🔬 Raw stimulusAnnotations:', stimulusAnnotations);
    console.log('🔬 stimulusAnnotations.annotations length:', stimulusAnnotations.annotations.length);
    
    // Convert annotations to database format
    const annotations: AnnotationData[] = stimulusAnnotations.annotations.map(ann => ({
      timestamp: ann.absoluteTime, // Use absolute timestamp for CSV
      stimulusType: String(ann.stimulusType),
      stimulusValue: ann.patternType,
      response: dataToUse.events.find(e => 
        e.type === 'user_response' && 
        Math.abs(e.timestamp - ann.absoluteTime) < 2000
      )?.data?.key as 'spacebar' | 'escape' | undefined,
      reactionTime: dataToUse.events.find(e => 
        e.type === 'user_response' && 
        Math.abs(e.timestamp - ann.absoluteTime) < 2000
      )?.timestamp ? dataToUse.events.find(e => 
        e.type === 'user_response' && 
        Math.abs(e.timestamp - ann.absoluteTime) < 2000
      )!.timestamp - ann.absoluteTime : undefined
    }));

    console.log('📋 Final annotations array length:', annotations.length);
    console.log('📋 Sample annotation (if any):', annotations[0]);

    // Determine completion status from the experiment end event
    const endEvent = dataToUse.events.find(e => e.type === 'experiment_end');
    const completionStatus = endEvent?.data?.reason === 'duration_completed' ? 'completed' : 'interrupted';
    
    // Create experiment result for database
    const experimentResult: ExperimentResult = {
      id: dataToUse.experimentId + '_' + Date.now(),
      experimentType: 'P300',
      experimentName: config?.id || 'P300#1',
      timestamp: dataToUse.startTime, // Use actual experiment start time (Date.now() when experiment started)
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
        is_target: ann.isTarget ? 1 : 0,
        duration_ms: ann.duration,
        pattern: ann.patternType
      }))
    };
    
    console.log('💾 Saved experiment to database:', experimentResult.id);
    
    // Store the completed data but don't call onComplete yet
    // The user needs to interact with the completion screen first
    setCompletedData(completeData);
    
    // Don't call onComplete here - wait for user interaction
  }, [experimentData, extractStimulusAnnotations, config?.id]);

  const handleCancel = useCallback(() => {
    // Clean up timers
    console.log('🛑 handleCancel: Cleaning up timers...');
    if (experimentTimerRef.current) {
      console.log('🛑 Clearing experiment timer');
      clearTimeout(experimentTimerRef.current);
    }
    if (stimulusTimerRef.current) {
      console.log('🛑 Clearing stimulus timer');
      clearTimeout(stimulusTimerRef.current);
    }
    
    exitFullscreen();
    onCancel();
  }, [onCancel, exitFullscreen]);

  const startExperiment = useCallback(() => {
    console.log('=== STARTING EXPERIMENT ===');
    console.log('Current phase:', phase);
    console.log('experimentCompletedRef.current:', experimentCompletedRef.current);
    
    // Reset completion flags for new experiment
    experimentCompletedRef.current = false;
    handleCompleteCalledRef.current = false;
    console.log('✅ Reset completion flags to false');
    
    console.log('Duration:', EXPERIMENT_DURATION, 'ms');
    console.log('Target flicker rate:', TARGET_FLICKER_RATE, 'Hz');
    console.log('Inter-stimulus interval:', INTER_STIMULUS_INTERVAL, 'ms');
    console.log('Stimulus duration:', STIMULUS_DURATION, 'ms');
    
    // Clear any existing timers first
    if (experimentTimerRef.current) {
      console.log('🧹 Clearing existing experiment timer before starting new one, ID:', experimentTimerRef.current);
      clearTimeout(experimentTimerRef.current);
      experimentTimerRef.current = null;
    }
    if (stimulusTimerRef.current) {
      console.log('🧹 Clearing existing stimulus timer before starting new one');
      clearTimeout(stimulusTimerRef.current);
      stimulusTimerRef.current = null;
    }
    
    setPhase('stimulus');
    startTimeRef.current = Date.now();
    
    setExperimentData(prev => ({
      ...prev,
      startTime: Date.now(),
      experimentId: config?.id || 'p300-1'
    }));
    
    addEvent('experiment_start', { duration: EXPERIMENT_DURATION, targetRate: TARGET_FLICKER_RATE });

    // Start the P300 oddball stimulus sequence immediately with a small delay
    console.log('About to schedule first stimulus in 100ms...');
    setTimeout(() => {
      console.log('Now calling scheduleNextStimulus...');
      scheduleNextStimulus();
    }, 100);

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
    
    // Add a backup check every 2 seconds to see if timer is still active
    const checkTimer = () => {
      if (experimentTimerRef.current === timerId) {
        console.log('✅ Main timer still active, ID:', timerId);
      } else {
        console.log('❌ Main timer has been replaced or cleared! Was:', timerId, 'Now:', experimentTimerRef.current);
      }
    };
    setTimeout(checkTimer, 2000);
    setTimeout(checkTimer, 4000);
    setTimeout(checkTimer, 6000);
    setTimeout(checkTimer, 8000);
    
    // Add a backup completion mechanism in case the main timer fails
    const backupTimer = setTimeout(() => {
      console.log('⚠️ BACKUP TIMER FIRED - main timer may have been cleared');
      if (!experimentCompletedRef.current) {
        console.log('🔄 Triggering backup completion');
        completeExperiment('duration_completed');
      }
    }, EXPERIMENT_DURATION + 1000); // Fire 1 second after main timer should have fired
    
    console.log('🛡️ Backup timer set with ID:', backupTimer);
  }, [phase, addEvent, scheduleNextStimulus, config, EXPERIMENT_DURATION, completeExperiment]);

  // Update the ref whenever startExperiment changes
  useEffect(() => {
    startExperimentRef.current = startExperiment;
  }, [startExperiment]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    console.log('🔑 Key pressed:', event.key, 'in phase:', phase);
    if (phase === 'consent' && event.key === ' ') {
      console.log('✅ Space pressed in consent phase, starting experiment flow');
      addEvent('consent_given');
      enterFullscreen();
      startCountdown();
    } else if (phase === 'stimulus') {
      if (event.key === 'Escape') {
        // Stop experiment early but complete with data
        console.log('🛑 User pressed ESC, ending experiment early...');
        completeExperiment('user_cancelled');
      } else {
        addEvent('user_response', { key: event.key, timestamp: Date.now() - startTimeRef.current });
      }
    } else if (phase === 'complete' && (event.key === 'Escape' || event.key === ' ')) {
      // User wants to return to experiments tab
      console.log('👋 User pressed key to return to experiments tab:', event.key);
      if (completedData) {
        onComplete(completedData);
      } else {
        // Fallback if no data is stored
        onCancel();
      }
    } else {
      console.log('❌ Key pressed but conditions not met. Phase:', phase, 'Key:', event.key);
    }
  }, [phase, addEvent, enterFullscreen, exitFullscreen, startCountdown, completeExperiment, completedData, onComplete, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      
      // Clean up timers on unmount
      if (experimentTimerRef.current) {
        clearTimeout(experimentTimerRef.current);
      }
      if (stimulusTimerRef.current) {
        clearTimeout(stimulusTimerRef.current);
      }
    };
  }, [handleKeyPress]);

  const renderConsentScreen = () => (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8">
      <h1 className="text-4xl font-bold text-[var(--navy)] mb-4">P300 Experiment</h1>
      <div className="max-w-2xl space-y-6">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-2xl font-semibold text-[var(--navy)] mb-4">Experiment Instructions</h2>
          <div className="text-left space-y-4 text-gray-700">
            <p>• You will see black-white checkerboard patterns (standard) and rare red-yellow patterns (target)</p>
            <p>• The experiment will run for {Math.round((config?.duration || 15000) / 1000)} seconds</p>
            <p>• Focus on the center dot and count the colorful target patterns</p>
            <p>• Target patterns appear ~20% of the time (oddball paradigm)</p>
            <p>• Patterns flash at ~{TARGET_FLICKER_RATE.toFixed(1)} Hz with natural timing jitter</p>
            <p>• The screen will enter fullscreen mode for better focus</p>
            <p>• Press ESC during the experiment to exit early</p>
          </div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 font-medium">
            ⚠️ Make sure you are comfortable and ready to begin
          </p>
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

  const renderStimulus = () => {
    
    // Create checkerboard pattern
    const renderCheckerboard = (color1: string, color2: string) => {
      const squares = [];
      const squareSize = 50; // 50px squares
      const rows = Math.ceil(window.innerHeight / squareSize) + 1;
      const cols = Math.ceil(window.innerWidth / squareSize) + 1;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const isEven = (row + col) % 2 === 0;
          const color = isEven ? color1 : color2;
          squares.push(
            <div
              key={`${row}-${col}`}
              className={`absolute ${color}`}
              style={{
                left: col * squareSize,
                top: row * squareSize,
                width: squareSize,
                height: squareSize,
              }}
            />
          );
        }
      }
      return squares;
    };
    
    return (
      <div className="flex flex-col items-center justify-center h-full relative bg-gray-900 overflow-hidden">
        {/* Checkerboard pattern based on stimulus state */}
        {stimulusVisible && (
          <div className="absolute inset-0 z-10">
            {currentStimulusType === 'target' 
              ? renderCheckerboard('bg-red-500', 'bg-yellow-400') // Red-yellow checkerboard for target (oddball)
              : renderCheckerboard('bg-white', 'bg-black') // Black-white checkerboard for standard
            }
          </div>
        )}
        
        {/* Central fixation point */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <div className={`w-0 h-0 rounded-full border-2 ${ // `w-6 h-6 rounded-full border-2
             stimulusVisible 
              ? currentStimulusType === 'target' 
                ? 'bg-white border-black' // White dot with black border on colorful background
                : 'bg-gray-500 border-white'  // Gray dot with white border on checkerboard
              : 'bg-white border-gray-600'    // White dot with gray border on dark background
          }`}></div>
        </div>
        
        {/* Debug overlay */}
        <div className="absolute top-16 left-8 z-50 bg-black bg-opacity-75 text-white p-2 rounded text-xs font-mono">
          <div>Visible: {stimulusVisible ? 'YES' : 'NO'}</div>
          <div>Type: {currentStimulusType || 'none'}</div>
          <div>Phase: {phase}</div>
          <div>Pattern: {
            stimulusVisible 
              ? currentStimulusType === 'target' ? 'Red-Yellow' : 'B&W' 
              : 'None'
          }</div>
        </div>
        
        {/* Progress indicator */}
        <div className="absolute top-8 right-8 z-30">
          <div className="bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
            Experiment ({Math.round(EXPERIMENT_DURATION / 1000)}s) • ~{TARGET_FLICKER_RATE.toFixed(1)} Hz
          </div>
        </div>
        
        {/* Debug indicator */}
        <div className="absolute top-8 left-8 z-30">
          <div className={`w-6 h-6 transition-all duration-75 border-2 border-white ${
            stimulusVisible 
              ? currentStimulusType === 'target' 
                ? 'bg-gradient-to-br from-red-500 to-yellow-400' 
                : 'bg-gradient-to-br from-white to-black'
              : 'bg-gray-600'
          }`}></div>
          <div className="bg-black bg-opacity-75 text-white text-xs mt-1 font-mono px-1 rounded">
            {stimulusVisible 
              ? currentStimulusType === 'target' ? 'TARGET' : 'STANDARD'
              : 'OFF'
            }
          </div>
        </div>
        
        {/* Instructions */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30 text-center">
          <div className="bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg">
            <p className="mb-2">
              Focus on the center dot • Count colorful target patterns
            </p>
            <p className="text-sm text-gray-300">
              Standard: B&W Checkerboard • Target: Red-Yellow (20%) • Press ESC to exit
            </p>
          </div>
        </div>
      </div>
    );
  };

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
            <p>• Total stimuli: {experimentData.stimulusSequence.length}</p>
            <p>• Target (red) flashes: {experimentData.stimulusSequence.filter(s => s.type === 'target').length}</p>
            <p>• Standard (white) flashes: {experimentData.stimulusSequence.filter(s => s.type === 'standard').length}</p>
            <p>• Target percentage: {((experimentData.stimulusSequence.filter(s => s.type === 'target').length / experimentData.stimulusSequence.length) * 100).toFixed(1)}%</p>
            <p>• Duration: {Math.round((experimentData.endTime - experimentData.startTime) / 1000)}s</p>
            <p>• User responses: {experimentData.events.filter(e => e.type === 'user_response').length}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            {isCompleted 
              ? 'Thank you for participating! Your data has been recorded.'
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

export default P300Experiment;