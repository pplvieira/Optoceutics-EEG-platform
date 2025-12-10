/**
 * Custom hook for time frame management
 * Handles time frame selection for analysis
 */

import { useState, useCallback, useEffect } from 'react';

export interface UseTimeFrameReturn {
  timeFrameStart: number;
  timeFrameEnd: number;
  useTimeFrame: boolean;
  setTimeFrameStart: React.Dispatch<React.SetStateAction<number>>;
  setTimeFrameEnd: React.Dispatch<React.SetStateAction<number>>;
  setUseTimeFrame: React.Dispatch<React.SetStateAction<boolean>>;
  duration: number;
  resetToFullDuration: (maxDuration: number) => void;
  setTimeRange: (start: number, end: number) => void;
  validateTimeRange: () => boolean;
}

export function useTimeFrame(initialMaxDuration: number = 0): UseTimeFrameReturn {
  const [timeFrameStart, setTimeFrameStart] = useState<number>(0);
  const [timeFrameEnd, setTimeFrameEnd] = useState<number>(initialMaxDuration);
  const [useTimeFrame, setUseTimeFrame] = useState<boolean>(false);

  const duration = timeFrameEnd - timeFrameStart;

  const resetToFullDuration = useCallback((maxDuration: number) => {
    setTimeFrameStart(0);
    setTimeFrameEnd(maxDuration);
  }, []);

  const setTimeRange = useCallback((start: number, end: number) => {
    setTimeFrameStart(start);
    setTimeFrameEnd(end);
  }, []);

  const validateTimeRange = useCallback((): boolean => {
    return timeFrameStart >= 0 && 
           timeFrameEnd > timeFrameStart && 
           timeFrameEnd > 0;
  }, [timeFrameStart, timeFrameEnd]);

  // Update end time when max duration changes
  useEffect(() => {
    if (initialMaxDuration > 0 && timeFrameEnd === 0) {
      setTimeFrameEnd(initialMaxDuration);
    }
  }, [initialMaxDuration, timeFrameEnd]);

  return {
    timeFrameStart,
    timeFrameEnd,
    useTimeFrame,
    setTimeFrameStart,
    setTimeFrameEnd,
    setUseTimeFrame,
    duration,
    resetToFullDuration,
    setTimeRange,
    validateTimeRange
  };
}

