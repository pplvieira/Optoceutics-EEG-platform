/**
 * Custom hook for comparison mode management
 * Handles trace building, comparison plots, and PSD comparison generation
 */

import { useState, useCallback } from 'react';
import type { PyodideInstance } from '../types/pyodide';

import type { EDFMetadata } from '../types/edfProcessor';

export interface LoadedFile {
  id: string;
  file: File;
  metadata: EDFMetadata;
  nickname: string;
  loadedAt: Date;
}

export interface ComparisonTrace {
  id: string;
  fileId: string;
  label: string;
  channel: string;
  timeFrame?: {
    start: number;
    end: number;
  };
  color?: string;
}

export interface ComparisonPlot {
  id: string;
  name: string;
  traces: ComparisonTrace[];
  parameters: {
    method: 'welch' | 'periodogram';
    fmin: number;
    fmax: number;
    nperseg_seconds: number;
    noverlap_proportion: number;
    window: string;
  };
  plotBase64?: string;
  createdAt: Date;
}

export interface UseComparisonModeReturn {
  // State
  comparisonMode: boolean;
  comparisonTraces: ComparisonTrace[];
  comparisonPlots: ComparisonPlot[];
  traceBuilderFileId: string;
  traceBuilderChannel: string;
  traceBuilderUseTimeFrame: boolean;
  traceBuilderTimeStart: number;
  traceBuilderTimeEnd: number;
  traceBuilderLabel: string;
  traceBuilderColor: string;
  editingTraceId: string | null;
  comparisonPsdParams: {
    method: 'welch' | 'periodogram';
    fmin: number;
    fmax: number;
    nperseg_seconds: number;
    noverlap_proportion: number;
    window: string;
  };
  currentComparisonPlot: string;
  comparisonPlotName: string;

  // Setters
  setComparisonMode: (mode: boolean) => void;
  setTraceBuilderFileId: (id: string) => void;
  setTraceBuilderChannel: (channel: string) => void;
  setTraceBuilderUseTimeFrame: (use: boolean) => void;
  setTraceBuilderTimeStart: (start: number) => void;
  setTraceBuilderTimeEnd: (end: number) => void;
  setTraceBuilderLabel: (label: string) => void;
  setTraceBuilderColor: (color: string) => void;
  setComparisonPsdParams: (params: {
    method: 'welch' | 'periodogram';
    fmin: number;
    fmax: number;
    nperseg_seconds: number;
    noverlap_proportion: number;
    window: string;
  }) => void;
  setCurrentComparisonPlot: (plot: string) => void;
  setComparisonPlotName: (name: string) => void;

  // Functions
  resetTraceBuilder: () => void;
  addOrUpdateTrace: () => void;
  editTrace: (traceId: string) => void;
  removeTrace: (traceId: string) => void;
  moveTraceUp: (traceId: string) => void;
  moveTraceDown: (traceId: string) => void;
  saveComparisonPlot: () => void;
  deleteComparisonPlot: (plotId: string) => void;
  generateComparisonPlot: (
    pyodide: PyodideInstance,
    loadedFiles: LoadedFile[],
    useResutilStyle: boolean,
    showAlphaPeaks: boolean,
    hideComparisonTitle: boolean,
    useDbScale: boolean,
    showGammaPeaks: boolean,
    showSnr40Hz: boolean,
    onError: (error: string) => void,
    onSuccess: (message: string) => void,
    setIsAnalyzing: (analyzing: boolean) => void,
    setLoadingMessage: (message: string) => void,
    setAnalysisResults: (updater: (prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => void,
    clearMessages: () => void
  ) => Promise<void>;
}

export function useComparisonMode(
  loadedFiles: LoadedFile[],
  onError?: (error: string) => void,
  onSuccess?: (message: string) => void
): UseComparisonModeReturn {
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [comparisonTraces, setComparisonTraces] = useState<ComparisonTrace[]>([]);
  const [comparisonPlots, setComparisonPlots] = useState<ComparisonPlot[]>([]);
  const [traceBuilderFileId, setTraceBuilderFileId] = useState<string>('');
  const [traceBuilderChannel, setTraceBuilderChannel] = useState<string>('');
  const [traceBuilderUseTimeFrame, setTraceBuilderUseTimeFrame] = useState<boolean>(false);
  const [traceBuilderTimeStart, setTraceBuilderTimeStart] = useState<number>(0);
  const [traceBuilderTimeEnd, setTraceBuilderTimeEnd] = useState<number>(0);
  const [traceBuilderLabel, setTraceBuilderLabel] = useState<string>('');
  const [traceBuilderColor, setTraceBuilderColor] = useState<string>('');
  const [editingTraceId, setEditingTraceId] = useState<string | null>(null);
  const [comparisonPsdParams, setComparisonPsdParams] = useState({
    method: 'welch' as 'welch' | 'periodogram',
    fmin: 1,
    fmax: 45,
    nperseg_seconds: 4,
    noverlap_proportion: 0.5,
    window: 'hamming'
  });
  const [currentComparisonPlot, setCurrentComparisonPlot] = useState<string>('');
  const [comparisonPlotName, setComparisonPlotName] = useState<string>('');

  const resetTraceBuilder = useCallback(() => {
    setTraceBuilderFileId('');
    setTraceBuilderChannel('');
    setTraceBuilderUseTimeFrame(false);
    setTraceBuilderTimeStart(0);
    setTraceBuilderTimeEnd(0);
    setTraceBuilderLabel('');
    setTraceBuilderColor('');
    setEditingTraceId(null);
  }, []);

  const addOrUpdateTrace = useCallback(() => {
    if (!traceBuilderFileId || !traceBuilderChannel) {
      onError?.('Please select a file and channel for the trace');
      return;
    }

    const selectedFile = loadedFiles.find(f => f.id === traceBuilderFileId);
    if (!selectedFile) return;

    // Generate smart default label if not provided
    const defaultLabel = traceBuilderLabel ||
      `${selectedFile.nickname} - ${traceBuilderChannel}${
        traceBuilderUseTimeFrame ? ` (${traceBuilderTimeStart.toFixed(1)}-${traceBuilderTimeEnd.toFixed(1)}s)` : ''
      }`;

    const trace: ComparisonTrace = {
      id: editingTraceId || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileId: traceBuilderFileId,
      channel: traceBuilderChannel,
      label: defaultLabel,
      timeFrame: traceBuilderUseTimeFrame ? {
        start: traceBuilderTimeStart,
        end: traceBuilderTimeEnd
      } : undefined,
      color: traceBuilderColor || undefined
    };

    if (editingTraceId) {
      // Update existing trace
      setComparisonTraces(prev => prev.map(t => t.id === editingTraceId ? trace : t));
      onSuccess?.(`Updated trace: ${defaultLabel}`);
    } else {
      // Add new trace
      setComparisonTraces(prev => [...prev, trace]);
      onSuccess?.(`Added trace: ${defaultLabel}`);
    }

    resetTraceBuilder();
  }, [
    traceBuilderFileId,
    traceBuilderChannel,
    traceBuilderUseTimeFrame,
    traceBuilderTimeStart,
    traceBuilderTimeEnd,
    traceBuilderLabel,
    traceBuilderColor,
    editingTraceId,
    loadedFiles,
    resetTraceBuilder,
    onError,
    onSuccess
  ]);

  const editTrace = useCallback((traceId: string) => {
    const trace = comparisonTraces.find(t => t.id === traceId);
    if (!trace) return;

    setTraceBuilderFileId(trace.fileId);
    setTraceBuilderChannel(trace.channel);
    setTraceBuilderLabel(trace.label);
    setTraceBuilderColor(trace.color || '');

    if (trace.timeFrame) {
      setTraceBuilderUseTimeFrame(true);
      setTraceBuilderTimeStart(trace.timeFrame.start);
      setTraceBuilderTimeEnd(trace.timeFrame.end);
    } else {
      setTraceBuilderUseTimeFrame(false);
      setTraceBuilderTimeStart(0);
      setTraceBuilderTimeEnd(0);
    }

    setEditingTraceId(traceId);
  }, [comparisonTraces]);

  const removeTrace = useCallback((traceId: string) => {
    setComparisonTraces(prev => prev.filter(t => t.id !== traceId));
    if (editingTraceId === traceId) {
      resetTraceBuilder();
    }
  }, [editingTraceId, resetTraceBuilder]);

  const moveTraceUp = useCallback((traceId: string) => {
    setComparisonTraces(prev => {
      const index = prev.findIndex(t => t.id === traceId);
      if (index <= 0) return prev;
      const newTraces = [...prev];
      [newTraces[index - 1], newTraces[index]] = [newTraces[index], newTraces[index - 1]];
      return newTraces;
    });
  }, []);

  const moveTraceDown = useCallback((traceId: string) => {
    setComparisonTraces(prev => {
      const index = prev.findIndex(t => t.id === traceId);
      if (index < 0 || index >= prev.length - 1) return prev;
      const newTraces = [...prev];
      [newTraces[index], newTraces[index + 1]] = [newTraces[index + 1], newTraces[index]];
      return newTraces;
    });
  }, []);

  const saveComparisonPlot = useCallback(() => {
    if (!currentComparisonPlot || !comparisonPlotName.trim()) {
      onError?.('Please provide a name for the comparison plot');
      return;
    }

    const comparisonPlot: ComparisonPlot = {
      id: `comparison_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: comparisonPlotName,
      traces: [...comparisonTraces],
      parameters: { ...comparisonPsdParams },
      plotBase64: currentComparisonPlot,
      createdAt: new Date()
    };

    setComparisonPlots(prev => [...prev, comparisonPlot]);
    onSuccess?.(`Saved comparison plot: ${comparisonPlotName}`);

    // Reset for next comparison
    setComparisonPlotName('');
    setCurrentComparisonPlot('');
    setComparisonTraces([]);
    setComparisonMode(false);
  }, [currentComparisonPlot, comparisonPlotName, comparisonTraces, comparisonPsdParams, onError, onSuccess]);

  const deleteComparisonPlot = useCallback((plotId: string) => {
    const plot = comparisonPlots.find(p => p.id === plotId);
    if (!plot) return;

    const confirmed = window.confirm(`Delete comparison plot "${plot.name}"?`);
    if (!confirmed) return;

    setComparisonPlots(prev => prev.filter(p => p.id !== plotId));
    onSuccess?.(`Deleted comparison plot: ${plot.name}`);
  }, [comparisonPlots, onSuccess]);

  const generateComparisonPlot = useCallback(async (
    pyodide: PyodideInstance,
    loadedFiles: LoadedFile[],
    useResutilStyle: boolean,
    showAlphaPeaks: boolean,
    hideComparisonTitle: boolean,
    useDbScale: boolean,
    showGammaPeaks: boolean,
    showSnr40Hz: boolean,
    onError: (error: string) => void,
    onSuccess: (message: string) => void,
    setIsAnalyzing: (analyzing: boolean) => void,
    setLoadingMessage: (message: string) => void,
    setAnalysisResults: (updater: (prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => void,
    clearMessages: () => void
  ) => {
    if (!pyodide) {
      onError('Python environment not ready');
      return;
    }

    if (comparisonTraces.length < 2) {
      onError('Please add at least 2 traces for comparison');
      return;
    }

    setIsAnalyzing(true);
    clearMessages();
    setLoadingMessage('Generating comparison PSD plot...');

    try {
      // Prepare traces - we need to set file bytes separately for each trace
      const traceMetadata = [];

      for (let idx = 0; idx < comparisonTraces.length; idx++) {
        const trace = comparisonTraces[idx];

        // Find the file
        const loadedFile = loadedFiles.find(f => f.id === trace.fileId);
        if (!loadedFile) {
          console.warn(`File not found for trace: ${trace.label}`);
          continue;
        }

        // Read file as bytes
        const arrayBuffer = await loadedFile.file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Set this file's bytes in Python globals with unique name
        pyodide.globals.set(`file_bytes_${idx}`, uint8Array);

        // Create trace metadata (without the binary data)
        const traceMeta: {
          file_bytes_var: string;
          filename: string;
          channel: string;
          label: string;
          time_start?: number;
          time_end?: number;
          color?: string;
        } = {
          file_bytes_var: `file_bytes_${idx}`,
          filename: loadedFile.file.name,
          channel: trace.channel,
          label: trace.label
        };

        // Add time window if specified
        if (trace.timeFrame) {
          traceMeta.time_start = trace.timeFrame.start;
          traceMeta.time_end = trace.timeFrame.end;
        }

        // Add color if specified
        if (trace.color) {
          traceMeta.color = trace.color;
        }

        traceMetadata.push(traceMeta);
      }

      if (traceMetadata.length < 2) {
        onError('Could not load data for enough traces (minimum 2 required)');
        setIsAnalyzing(false);
        setLoadingMessage('');
        return;
      }

      // Set metadata and params in Python globals
      pyodide.globals.set('traces_metadata', traceMetadata);
      pyodide.globals.set('comparison_psd_params', comparisonPsdParams);
      pyodide.globals.set('use_resutil_style', useResutilStyle);
      pyodide.globals.set('show_alpha_peaks', showAlphaPeaks);
      pyodide.globals.set('hide_comparison_title', hideComparisonTitle);
      pyodide.globals.set('use_db_scale', useDbScale);
      pyodide.globals.set('show_gamma_peaks', showGammaPeaks);
      pyodide.globals.set('show_snr_40hz', showSnr40Hz);

      // Build traces config in Python by converting bytes and merging with metadata
      const result = await pyodide.runPythonAsync(`
import json

# Convert JsProxy objects to Python objects
traces_metadata_py = traces_metadata.to_py()
comparison_psd_params_py = comparison_psd_params.to_py()

# Build traces config by converting JS bytes to Python bytes
traces_config = []
for trace_meta in traces_metadata_py:
    # Get the file bytes variable name
    file_bytes_var = trace_meta['file_bytes_var']

    # Convert JS Uint8Array to Python bytes
    js_bytes = globals()[file_bytes_var]
    py_bytes = bytes(js_bytes)

    # Build trace config with Python bytes
    trace_config = {
        'file_bytes': py_bytes,
        'filename': trace_meta['filename'],
        'channel': trace_meta['channel'],
        'label': trace_meta['label']
    }

    # Add optional fields
    if 'time_start' in trace_meta:
        trace_config['time_start'] = trace_meta['time_start']
    if 'time_end' in trace_meta:
        trace_config['time_end'] = trace_meta['time_end']
    if 'color' in trace_meta:
        trace_config['color'] = trace_meta['color']

    traces_config.append(trace_config)

print(f"Built {len(traces_config)} trace configurations")

# Call the comparison PSD function
result_json = generate_comparison_psd(
    traces_config,
    comparison_psd_params_py,
    use_resutil_style,
    show_alpha_peaks,
    hide_comparison_title,
    use_db_scale,
    show_gamma_peaks,
    show_snr_40hz
)

result_json
      `);

      const parsedResult = JSON.parse(result as string);

      if (parsedResult.success) {
        setCurrentComparisonPlot(parsedResult.plot_base64);

        // Add to analysis results so it can be included in reports
        const comparisonResult = {
          id: `comparison_${Date.now()}`,
          analysis_type: 'PSD Comparison',
          plot_base64: parsedResult.plot_base64,
          success: true,
          message: comparisonPlotName || `PSD Comparison (${comparisonTraces.length} traces)`,
          parameters: { ...comparisonPsdParams },
          data: {
            traces: comparisonTraces.map(t => ({
              label: t.label,
              channel: t.channel,
              fileId: t.fileId,
              timeFrame: t.timeFrame
            })),
            trace_count: comparisonTraces.length
          }
        };

        setAnalysisResults(prev => [...prev, comparisonResult]);
        onSuccess(`Successfully generated comparison plot with ${comparisonTraces.length} traces. Added to analysis results.`);
        console.log('Comparison plot generated successfully and added to analysis results');
      } else {
        onError(`Failed to generate comparison plot: ${parsedResult.error}`);
        console.error('Comparison plot error:', parsedResult.error);
        if (parsedResult.traceback) {
          console.error('Python traceback:', parsedResult.traceback);
        }
      }

    } catch (error) {
      console.error('Error generating comparison plot:', error);
      onError(`Failed to generate comparison plot: ${error}`);
    } finally {
      setIsAnalyzing(false);
      setLoadingMessage('');
    }
  }, [comparisonTraces, comparisonPsdParams, comparisonPlotName]);

  return {
    // State
    comparisonMode,
    comparisonTraces,
    comparisonPlots,
    traceBuilderFileId,
    traceBuilderChannel,
    traceBuilderUseTimeFrame,
    traceBuilderTimeStart,
    traceBuilderTimeEnd,
    traceBuilderLabel,
    traceBuilderColor,
    editingTraceId,
    comparisonPsdParams,
    currentComparisonPlot,
    comparisonPlotName,

    // Setters
    setComparisonMode,
    setTraceBuilderFileId,
    setTraceBuilderChannel,
    setTraceBuilderUseTimeFrame,
    setTraceBuilderTimeStart,
    setTraceBuilderTimeEnd,
    setTraceBuilderLabel,
    setTraceBuilderColor,
    setComparisonPsdParams,
    setCurrentComparisonPlot,
    setComparisonPlotName,

    // Functions
    resetTraceBuilder,
    addOrUpdateTrace,
    editTrace,
    removeTrace,
    moveTraceUp,
    moveTraceDown,
    saveComparisonPlot,
    deleteComparisonPlot,
    generateComparisonPlot
  };
}

