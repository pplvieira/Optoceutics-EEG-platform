/**
 * Custom hook for annotation management
 * Handles loading, displaying, and managing EDF file annotations
 */

import { useState, useCallback } from 'react';
import type { EDFAnnotation } from '../types/edfProcessor';

export interface UseAnnotationsReturn {
  annotations: EDFAnnotation[];
  annotationsNeedUpdate: boolean;
  setAnnotations: React.Dispatch<React.SetStateAction<EDFAnnotation[]>>;
  setAnnotationsNeedUpdate: (needUpdate: boolean) => void;
  clearAnnotations: () => void;
  getAnnotationsInTimeRange: (start: number, end: number) => EDFAnnotation[];
  getAnnotationCount: () => number;
}

export function useAnnotations(): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<EDFAnnotation[]>([]);
  const [annotationsNeedUpdate, setAnnotationsNeedUpdate] = useState<boolean>(false);

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
    setAnnotationsNeedUpdate(false);
  }, []);

  const getAnnotationsInTimeRange = useCallback((start: number, end: number): EDFAnnotation[] => {
    return annotations.filter(ann => {
      const onset = typeof ann.onset === 'number' ? ann.onset : parseFloat(ann.onset);
      return onset >= start && onset <= end;
    });
  }, [annotations]);

  const getAnnotationCount = useCallback((): number => {
    return annotations.length;
  }, [annotations]);

  return {
    annotations,
    annotationsNeedUpdate,
    setAnnotations,
    setAnnotationsNeedUpdate,
    clearAnnotations,
    getAnnotationsInTimeRange,
    getAnnotationCount
  };
}

