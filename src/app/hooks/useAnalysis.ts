/**
 * Custom hook for analysis execution
 */

import { useState, useCallback } from 'react';
import type { PyodideInstance } from '../types/pyodide';
import type { AnalysisType, AnalysisParameters } from '../types/analysis';
import type { AnalysisResult, SSVEPResult } from '../types/edfProcessor';

interface UseAnalysisReturn {
  analysisResults: AnalysisResult[];
  ssvepResult: SSVEPResult | null;
  isAnalyzing: boolean;
  error: string | null;
  progress: number;
  runAnalysis: (
    type: AnalysisType,
    parameters: AnalysisParameters,
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null
  ) => Promise<void>;
  runSSVEPAnalysis: (
    params: { target_frequency: number; pca_components: number; frequency_bands: number[] },
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null
  ) => Promise<void>;
  clearResults: () => void;
}

export function useAnalysis(): UseAnalysisReturn {
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [ssvepResult, setSSVEPResult] = useState<SSVEPResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const simulateProgress = useCallback((duration: number) => {
    setProgress(0);
    const steps = 20;
    const stepDuration = duration / steps;
    
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      currentStep++;
      setProgress((currentStep / steps) * 100);
      
      if (currentStep >= steps) {
        clearInterval(progressInterval);
      }
    }, stepDuration);

    return progressInterval;
  }, []);

  const runAnalysis = useCallback(async (
    type: AnalysisType,
    parameters: AnalysisParameters,
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null
  ) => {
    setIsAnalyzing(true);
    setError(null);
    
    const progressInterval = simulateProgress(3000);

    try {
      // Set parameters in Python
      pyodide.globals.set('analysis_type', type);
      pyodide.globals.set('parameters', pyodide.toPy(parameters));
      pyodide.globals.set('js_selected_channels', selectedChannels);
      
      // Set time frame parameters if enabled
      if (timeFrame) {
        pyodide.globals.set('start_time', Math.floor(timeFrame.start));
        pyodide.globals.set('end_time', Math.ceil(timeFrame.end));
      } else {
        pyodide.globals.set('start_time', null);
        pyodide.globals.set('end_time', null);
      }

      // Run analysis
      const result = await pyodide.runPython(`
        analyze_traditional(analysis_type, parameters, start_time, end_time)
      `);

      const parsedResult = JSON.parse(result as string);

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
      if (timeFrame) {
        parsedResult.time_frame = {
          start: timeFrame.start,
          end: timeFrame.end
        };
      }

      setAnalysisResults(prev => [...prev, parsedResult]);

    } catch (err) {
      console.error('Analysis error:', err);
      setError(`Analysis failed: ${err}`);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    }
  }, [simulateProgress]);

  const runSSVEPAnalysis = useCallback(async (
    params: { target_frequency: number; pca_components: number; frequency_bands: number[] },
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null
  ) => {
    setIsAnalyzing(true);
    setError(null);
    
    const progressInterval = simulateProgress(8000);

    try {
      // Set parameters in Python
      pyodide.globals.set('target_freq', params.target_frequency);
      pyodide.globals.set('pca_components', params.pca_components);
      pyodide.globals.set('frequency_bands', params.frequency_bands);
      pyodide.globals.set('js_selected_channels', selectedChannels);
      
      // Set time frame parameters if enabled
      if (timeFrame) {
        pyodide.globals.set('start_time', Math.floor(timeFrame.start));
        pyodide.globals.set('end_time', Math.ceil(timeFrame.end));
      } else {
        pyodide.globals.set('start_time', null);
        pyodide.globals.set('end_time', null);
      }

      // Run analysis
      const result = await pyodide.runPython(`
        analyze_ssvep(target_freq, pca_components, frequency_bands, start_time, end_time)
      `);

      const parsedResult = JSON.parse(result as string);

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

    } catch (err) {
      console.error('SSVEP analysis error:', err);
      setError(`Analysis failed: ${err}`);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    }
  }, [simulateProgress]);

  const clearResults = useCallback(() => {
    setAnalysisResults([]);
    setSSVEPResult(null);
    setError(null);
  }, []);

  return {
    analysisResults,
    ssvepResult,
    isAnalyzing,
    error,
    progress,
    runAnalysis,
    runSSVEPAnalysis,
    clearResults
  };
}

