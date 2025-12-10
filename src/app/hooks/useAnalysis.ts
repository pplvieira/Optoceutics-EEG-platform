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
  setIsAnalyzing: (analyzing: boolean) => void; // Expose setter for comparison mode
  runAnalysis: (
    type: AnalysisType,
    parameters: AnalysisParameters,
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null,
    useResutilStyle?: boolean, // CRITICAL: Read at call time, not from state
    onSuccess?: (message: string) => void,
    onError?: (error: string) => void,
    onLoadingMessage?: (message: string) => void,
    calculateRealWorldTime?: (onset: number) => string | undefined
  ) => Promise<void>;
  runSSVEPAnalysis: (
    params: { target_frequency: number; pca_components: number; frequency_bands: number[] },
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null,
    onSuccess?: (message: string) => void,
    onError?: (error: string) => void,
    onLoadingMessage?: (message: string) => void
  ) => Promise<void>;
  clearResults: () => void;
  addResult: (result: AnalysisResult) => void;
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
    timeFrame?: { start: number; end: number } | null,
    useResutilStyle: boolean = false, // CRITICAL: Read at call time
    onSuccess?: (message: string) => void,
    onError?: (error: string) => void,
    onLoadingMessage?: (message: string) => void,
    calculateRealWorldTime?: (onset: number) => string | undefined
  ) => {
    setIsAnalyzing(true);
    setError(null);
    onLoadingMessage?.(`Running ${type} analysis...`);
    
    const progressInterval = simulateProgress(3000);

    try {
      // CRITICAL FIX: Merge resutil style into parameters at call time
      const finalParameters = {
        ...parameters,
        use_resutil_style: useResutilStyle // Read from parameter, not state
      };

      // Set parameters in Python
      pyodide.globals.set('analysis_type', type);
      pyodide.globals.set('parameters', pyodide.toPy(finalParameters));
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
        const finalError = errorMsg;
        setError(finalError);
        onError?.(finalError);
        return;
      }

      // Add time frame information to the result
      if (timeFrame) {
        parsedResult.time_frame = {
          start: timeFrame.start,
          end: timeFrame.end,
          start_real_time: calculateRealWorldTime?.(timeFrame.start),
          end_real_time: calculateRealWorldTime?.(timeFrame.end)
        };
      }

      // Add unique ID for plot selection
      parsedResult.id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      setAnalysisResults(prev => [...prev, parsedResult]);
      onSuccess?.(`${type} analysis completed!`);

    } catch (err) {
      console.error('Analysis error:', err);
      const errorMsg = `Analysis failed: ${err}`;
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      onLoadingMessage?.('');
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    }
  }, [simulateProgress]);

  const runSSVEPAnalysis = useCallback(async (
    params: { target_frequency: number; pca_components: number; frequency_bands: number[] },
    pyodide: PyodideInstance,
    selectedChannels: string[],
    timeFrame?: { start: number; end: number } | null,
    onSuccess?: (message: string) => void,
    onError?: (error: string) => void,
    onLoadingMessage?: (message: string) => void
  ) => {
    setIsAnalyzing(true);
    setError(null);
    onLoadingMessage?.('Running comprehensive SSVEP analysis...');
    
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
        onError?.(errorMsg);
        return;
      }

      setSSVEPResult(parsedResult);
      onSuccess?.('SSVEP analysis completed successfully!');

    } catch (err) {
      console.error('SSVEP analysis error:', err);
      const errorMsg = `Analysis failed: ${err}`;
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      onLoadingMessage?.('');
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
    }
  }, [simulateProgress]);

  const clearResults = useCallback(() => {
    setAnalysisResults([]);
    setSSVEPResult(null);
    setError(null);
  }, []);

  const addResult = useCallback((result: AnalysisResult) => {
    setAnalysisResults(prev => [...prev, result]);
  }, []);

  return {
    analysisResults,
    ssvepResult,
    isAnalyzing,
    error,
    progress,
    setIsAnalyzing,
    runAnalysis,
    runSSVEPAnalysis,
    clearResults,
    addResult
  };
}

