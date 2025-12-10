'use client'

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  generatePatientReportPDFFile as generatePDFReport, 
  generatePatientReportDOCXFile as generateDOCXReport 
} from '../../services/reportService';

// Pyodide types are now in ../types/pyodide.ts
import type { PyodideInstance } from '../../types/pyodide';
import { usePyodide } from '../../hooks/usePyodide';
import { useEDFFile } from '../../hooks/useEDFFile';
import { useMultiFileManager } from '../../hooks/useMultiFileManager';
import { useAnalysis } from '../../hooks/useAnalysis';
import { useAnnotations } from '../../hooks/useAnnotations';
import { useChannelManager } from '../../hooks/useChannelManager';
import { useTimeFrame } from '../../hooks/useTimeFrame';
import type { AnalysisResult, EDFMetadata, EDFAnnotation } from '../../types/edfProcessor';
import { calculateRealWorldTime, formatTimeHMS } from '../../utils/edfUtils';
import { ChannelRenamePopup } from './ChannelRenamePopup';
import TimeFrameSelector from './TimeFrameSelector';
import AnnotationPanel from './AnnotationPanel';
import AnalysisControls from './AnalysisControls';
import ResultsDisplay from './ResultsDisplay';
import FileUpload from './FileUpload';
import MetadataDisplay from './MetadataDisplay';
import ChannelSelector from './ChannelSelector';
import MultiFileListPanel from './MultiFileListPanel';
import PlotSelectionPanel from './PlotSelectionPanel';
import ReportGenerationPanel from './ReportGenerationPanel';

// Multi-file comparison interfaces
interface LoadedFile {
  id: string;                    // Unique identifier
  file: File;                    // Original file object
  metadata: EDFMetadata;         // File metadata
  nickname: string;              // User-friendly label (e.g., "Pre-Treatment", "Post-Treatment")
  loadedAt: Date;               // Timestamp
}

interface ComparisonTrace {
  id: string;                    // Unique identifier
  fileId: string;               // Which file this trace comes from
  label: string;                // Custom label for legend (e.g., "Baseline - O1")
  channel: string;              // Channel name
  timeFrame?: {                 // Optional time window
    start: number;
    end: number;
  };
  color?: string;               // Optional custom color
}

interface ComparisonPlot {
  id: string;
  name: string;                 // User-given name (e.g., "Pre vs Post Treatment")
  traces: ComparisonTrace[];    // Array of traces to overlay
  parameters: {                 // Common PSD parameters
    method: 'welch' | 'periodogram';
    fmin: number;
    fmax: number;
    nperseg_seconds: number;
    noverlap_proportion: number;
    window: string;
  };
  plotBase64?: string;          // Generated plot
  createdAt: Date;
}

export default function PyodideEDFProcessor() {
  // Use Pyodide hook for initialization
  const { 
    pyodide, 
    pyodideReady, 
    pyodideLoading, 
    loadingMessage: pyodideLoadingMessage,
    setupPythonEnvironment,
    reloadActiveFile: reloadActiveFileFromHook
  } = usePyodide();
  
  // Use EDF file hook for file loading
  const { loadFile: loadEDFFile, convertBdfToEdf: convertBdfToEdfFromHook } = useEDFFile();
  
  // Use multi-file manager hook
  const {
    loadedFiles,
    activeFileId,
    currentFile,
    metadata,
    setLoadedFiles,
    setActiveFileId,
    addLoadedFile,
    switchToFile: switchToFileHook,
    removeFile: removeFileHook,
    updateFileNickname,
    clearAllFiles
  } = useMultiFileManager();

  // Use analysis hook - this manages analysisResults and ssvepResult
  const {
    analysisResults,
    ssvepResult,
    isAnalyzing,
    error: analysisError,
    progress: analysisProgress,
    setIsAnalyzing: setIsAnalyzingHook,
    runAnalysis: runAnalysisHook,
    runSSVEPAnalysis: runSSVEPAnalysisHook,
    clearResults: clearAnalysisResults,
    addResult: addAnalysisResult
  } = useAnalysis();

  // Sync analysis error with main error state
  useEffect(() => {
    if (analysisError) {
      setError(analysisError);
    }
  }, [analysisError]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warning' | 'success' | 'error'; action?: { label: string; onClick: () => void } } | null>(null);
  
  // Combine Pyodide loading message with analysis loading message
  const displayLoadingMessage = loadingMessage || pyodideLoadingMessage;
  const [dragActive, setDragActive] = useState(false);
  
  // Use channel manager hook
  const {
    selectedChannels,
    setSelectedChannels,
    channelRenameMap,
    setChannelRenameMap,
    newChannelName,
    setNewChannelName,
    renameChannel: renameChannelHook,
    getDisplayName: getChannelDisplayNameHook
  } = useChannelManager();
  
  const [collapsedResults, setCollapsedResults] = useState<Set<number>>(new Set());
  const [showChannelRenamePopup, setShowChannelRenamePopup] = useState(false);
  const [channelToRename, setChannelToRename] = useState<string>('');
  
  // Use time frame hook
  const {
    timeFrameStart,
    timeFrameEnd,
    useTimeFrame: useTimeFrameFilter,
    setTimeFrameStart,
    setTimeFrameEnd,
    setUseTimeFrame,
    duration: timeFrameDuration,
    resetToFullDuration: resetTimeFrame,
    setTimeRange: setTimeFrameRange,
    validateTimeRange: validateTimeFrame
  } = useTimeFrame(metadata?.duration_seconds || 0);
  
  // Use annotations hook
  const {
    annotations,
    annotationsNeedUpdate,
    setAnnotations,
    setAnnotationsNeedUpdate,
    clearAnnotations: clearAnnotationsHook
  } = useAnnotations();
  const [generatingPDF, setGeneratingPDF] = useState<boolean>(false);

  // Plot selection for reports
  const [selectedPlotsForReport, setSelectedPlotsForReport] = useState<string[]>([]);
  const [plotSelectionOrder, setPlotSelectionOrder] = useState<string[]>([]);

  // Resutil styling toggle
  const [useResutilStyle, setUseResutilStyle] = useState(false);

  // Alpha peaks toggle for comparison plots
  const [showAlphaPeaks, setShowAlphaPeaks] = useState(false);

  // Hide title toggle for comparison plots
  const [hideComparisonTitle, setHideComparisonTitle] = useState(false);

  // Power vs dB toggle for comparison plots
  const [useDbScale, setUseDbScale] = useState(false);

  // Gamma peak toggle for comparison plots
  const [showGammaPeaks, setShowGammaPeaks] = useState(false);

  // SNR at 40Hz toggle for comparison plots
  const [showSnr40Hz, setShowSnr40Hz] = useState(false);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [comparisonTraces, setComparisonTraces] = useState<ComparisonTrace[]>([]);
  const [comparisonPlots, setComparisonPlots] = useState<ComparisonPlot[]>([]);

  // Trace builder form state
  const [traceBuilderFileId, setTraceBuilderFileId] = useState<string>('');
  const [traceBuilderChannel, setTraceBuilderChannel] = useState<string>('');
  const [traceBuilderUseTimeFrame, setTraceBuilderUseTimeFrame] = useState<boolean>(false);
  const [traceBuilderTimeStart, setTraceBuilderTimeStart] = useState<number>(0);
  const [traceBuilderTimeEnd, setTraceBuilderTimeEnd] = useState<number>(0);
  const [traceBuilderLabel, setTraceBuilderLabel] = useState<string>('');
  const [traceBuilderColor, setTraceBuilderColor] = useState<string>('');
  const [editingTraceId, setEditingTraceId] = useState<string | null>(null);

  // Comparison PSD parameters
  const [comparisonPsdParams, setComparisonPsdParams] = useState({
    method: 'welch' as 'welch' | 'periodogram',
    fmin: 1,
    fmax: 45,
    nperseg_seconds: 4,
    noverlap_proportion: 0.5,
    window: 'hamming'
  });

  // Current comparison plot and name
  const [currentComparisonPlot, setCurrentComparisonPlot] = useState<string>('');
  const [comparisonPlotName, setComparisonPlotName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pyodideRef = useRef<PyodideInstance | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  
  // Update pyodideRef when pyodide from hook changes
  useEffect(() => {
    if (pyodide) {
      pyodideRef.current = pyodide;
    }
  }, [pyodide]);

  // Analysis parameters
  const [ssvepParams, setSSVEPParams] = useState({
    target_frequency: 40.0,
    pca_components: 5,
    frequency_bands: [8, 12, 30, 100]
  });

  const [analysisParams, setAnalysisParams] = useState({
    raw_signal: { duration: timeFrameEnd - timeFrameStart, start_time: 0 },
    psd: { fmin: 1, fmax: 45, method: 'welch' },
    snr: { fmin: 1, fmax: 45, method: 'welch' },
    theta_beta_ratio: { theta_min: 4, theta_max: 7, beta_min: 13, beta_max: 30, method: 'welch' },
    time_frequency: { freq_min: 1, freq_max: 45, freq_points: 100, time_points: 200, selected_channel: 0 }
  });

  // Advanced PSD settings
  const [showAdvancedPSDSettings, setShowAdvancedPSDSettings] = useState(false);
  const [advancedPSDSettings, setAdvancedPSDSettings] = useState({
    nperseg_seconds: 4.0,        // seconds (will be multiplied by sampling_frequency)
    noverlap_proportion: 0.5,     // proportion of nperseg (0 to 1)
    window: 'hann' as 'hann' | 'boxcar',  // window type
    use_db: false                 // true for dB, false for power units
  });

  // FOOOF analysis parameters
  const [showAdvancedFOOOFSettings, setShowAdvancedFOOOFSettings] = useState(false);
  const [fooofParams, setFooofParams] = useState({
    freq_range: [1, 45],           // Frequency range for fitting [min, max] - Updated to 45Hz default
    peak_width_limits: [0.5, 12],  // Min/max peak width in Hz
    max_n_peaks: 6,                 // Maximum number of peaks to detect
    min_peak_height: 0.1,           // Minimum relative peak height
    aperiodic_mode: 'fixed' as 'fixed' | 'knee',  // Aperiodic fitting mode
    nperseg_seconds: 4.0,           // PSD computation window (seconds)
    noverlap_proportion: 0.5,       // PSD overlap proportion (0-1)
    show_aperiodic: true,           // Show aperiodic component in plot
    show_periodic: true             // Show periodic component in plot
  });

  // Update raw signal duration when time frame changes
  useEffect(() => {
    const newDuration = timeFrameEnd - timeFrameStart;
    setAnalysisParams(prev => ({
      ...prev,
      raw_signal: { ...prev.raw_signal, duration: newDuration }
    }));
  }, [timeFrameStart, timeFrameEnd]);

  // Setup Python environment when Pyodide is ready
  useEffect(() => {
    if (!pyodideReady || !pyodide || !setupPythonEnvironment) return;
    
    const setupEnv = async () => {
      await setupPythonEnvironment(pyodide, {
        setLoadingMessage,
        setSuccess,
        setError
      });
    };
    
    setupEnv();
  }, [pyodideReady, pyodide, setupPythonEnvironment]);

  // Reload file data into Python when active file changes
  useEffect(() => {
    if (!pyodideReady || !pyodide || !activeFileId || !reloadActiveFileFromHook) return;

    reloadActiveFileFromHook(pyodide, activeFileId, loadedFiles);
  }, [pyodideReady, pyodide, activeFileId, loadedFiles, reloadActiveFileFromHook]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };
  
  // Helper functions for time formatting (using utilities)
  const calculateRealWorldTimeWrapper = (onset: number): string | undefined => {
    return calculateRealWorldTime(onset, metadata);
  };

  const formatTimeHMSWrapper = (timeInSeconds: number): string | undefined => {
    return formatTimeHMS(timeInSeconds, metadata);
  };

  // Channel rename functions
  const openChannelRenamePopup = () => {
    setChannelToRename(metadata?.channel_names?.[0] || '');
    setNewChannelName('');
    setShowChannelRenamePopup(true);
  };

  const submitChannelRename = () => {
    if (channelToRename && newChannelName.trim() && channelToRename !== newChannelName.trim()) {
      const newMap = { ...channelRenameMap };
      newMap[channelToRename] = newChannelName.trim();
      setChannelRenameMap(newMap);
      
      // Update selected channels if the renamed channel was selected
      setSelectedChannels(prev => 
        prev.map(ch => ch === channelToRename ? newChannelName.trim() : ch)
      );
      
      setShowChannelRenamePopup(false);
      setChannelToRename('');
      setNewChannelName('');
    }
  };

  // Get display name for a channel (renamed or original)
  const getChannelDisplayName = (originalName: string): string => {
    return channelRenameMap[originalName] || originalName;
  };


  // Download modified EDF file
  const downloadModifiedEDF = async () => {
    if (!pyodideRef.current || !metadata || !currentFile) {
      alert('EDF file not loaded or Pyodide not ready');
      return;
    }

    try {
      setLoadingMessage('Preparing modified EDF file for download...');

      // Set parameters in Python
      pyodideRef.current.globals.set('channel_rename_map', pyodideRef.current.toPy(channelRenameMap));
      pyodideRef.current.globals.set('custom_annotations', pyodideRef.current.toPy(annotations.filter(ann => ann.is_custom)));

      // Run the export function in Python
      const result = await pyodideRef.current.runPythonAsync(`
def export_modified_edf():
    """Export modified EDF file with renamed channels and custom annotations"""
    import io
    import base64
    import json
    from datetime import datetime, timedelta
    
    try:
        if not MNE_AVAILABLE:
            return json.dumps({
                'success': False,
                'error': 'MNE not available for EDF export'
            })
        
        # Get the current raw object
        raw = globals().get('edf_reader')
        if raw is None:
            return json.dumps({
                'success': False,
                'error': 'No EDF file loaded'
            })
        
        # Make a copy of the raw object
        raw_copy = raw.copy()
        
        # Apply channel renaming
        rename_map = {}
        if 'channel_rename_map' in globals():
            for old_name, new_name in channel_rename_map.items():
                if old_name in raw_copy.ch_names:
                    rename_map[old_name] = new_name
        
        if rename_map:
            raw_copy.rename_channels(rename_map)
        
        # Add custom annotations
        if 'custom_annotations' in globals() and len(custom_annotations) > 0:
            # Convert custom annotations to MNE format
            onsets = []
            durations = []
            descriptions = []
            
            for ann in custom_annotations:
                onsets.append(float(ann['onset']))
                durations.append(float(ann['duration']))
                descriptions.append(str(ann['description']))
            
            # Create new annotations object
            from mne import Annotations
            new_annotations = Annotations(
                onset=onsets,
                duration=durations,
                description=descriptions
            )
            
            # Add to existing annotations
            if raw_copy.annotations is not None and len(raw_copy.annotations) > 0:
                # Combine existing and new annotations
                combined_onsets = list(raw_copy.annotations.onset) + onsets
                combined_durations = list(raw_copy.annotations.duration) + durations
                combined_descriptions = list(raw_copy.annotations.description) + descriptions
                
                combined_annotations = Annotations(
                    onset=combined_onsets,
                    duration=combined_durations,
                    description=combined_descriptions
                )
                raw_copy.set_annotations(combined_annotations)
            else:
                raw_copy.set_annotations(new_annotations)
        
        # Export to EDF format
        # Create a temporary filename
        import tempfile
        import os
        
        # Create temporary file for export
        temp_fd, temp_path = tempfile.mkstemp(suffix='.edf')
        os.close(temp_fd)  # Close the file descriptor
        
        try:
            # Export to EDF
            raw_copy.export(temp_path, fmt='edf', overwrite=True)
            
            # Read the file back as binary data
            with open(temp_path, 'rb') as f:
                edf_data = f.read()
            
            # Encode as base64 for download
            edf_base64 = base64.b64encode(edf_data).decode('utf-8')
            
            return json.dumps({
                'success': True,
                'data': edf_base64,
                'filename': 'modified_recording.edf',
                'message': f'Modified EDF prepared for download ({len(rename_map)} channels renamed, {len(custom_annotations) if "custom_annotations" in globals() else 0} custom annotations added)'
            })
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        import traceback
        return json.dumps({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        })

# Run the export function
export_modified_edf()
      `);

      const parsedResult = JSON.parse(result as string);
      
      if (parsedResult.success) {
        // Create download link
        const binaryData = atob(parsedResult.data);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          bytes[i] = binaryData.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = parsedResult.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setSuccess(parsedResult.message);
      } else {
        setError(`Export failed: ${parsedResult.error}`);
        console.error('Export error:', parsedResult.traceback);
      }
      
    } catch (error) {
      console.error('Download error:', error);
      setError(`Download failed: ${error}`);
    } finally {
      setLoadingMessage('');
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pyodideReady) {
      setDragActive(true);
    }
  }, [pyodideReady]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pyodideReady) {
      setDragActive(false);
    }
  }, [pyodideReady]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!pyodideReady) {
      setError('Python environment not ready. Please wait for initialization.');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }, [pyodideReady]);

  // Progress simulation is handled by useAnalysis hook

  // Helper: convert BDF to EDF using the hook
  const convertBdfToEdf = useCallback(async (fileName: string, fileBytes: Uint8Array) => {
    if (!pyodide) return { success: false, error: 'Pyodide not ready' };
    return await convertBdfToEdfFromHook(fileName, fileBytes, pyodide);
  }, [pyodide, convertBdfToEdfFromHook]);

  // Helper function to add a file to the loaded files array
  const addFile = useCallback(async (file: File): Promise<boolean> => {
    if (!pyodideReady || !pyodide) {
      setError('Python environment not ready. Please wait for initialization.');
      return false;
    }

    clearMessages();

    // Check if BDF file and show toast notification
    if (file.name.toLowerCase().endsWith('.bdf')) {
      // Show toast and wait for user confirmation
      return new Promise<boolean>((resolve) => {
        setToast({
          message: 'This will remove 2 channels (Status and TimeStamp) and convert to EDF before analysis.',
          type: 'warning',
          action: {
            label: 'Proceed',
            onClick: async () => {
              setToast(null);
              try {
                // Use the useEDFFile hook to load the file
                const parsedResult = await loadEDFFile(file, pyodide, {
                  onLoadingMessage: setLoadingMessage,
                  onSuccess: setSuccess,
                  onBdfConversionPrompt: async () => true // Auto-confirm since user already confirmed via toast
                });
                if (parsedResult) {
                  // Create a new File object with the converted EDF data if needed
                  const fileToAdd = file.name.toLowerCase().endsWith('.bdf') 
                    ? new File([file], file.name.replace(/\.bdf$/i, '.edf'), { type: 'application/octet-stream' })
                    : file;
                  addLoadedFile(fileToAdd, parsedResult);
                  if (parsedResult.channel_names && parsedResult.channel_names.length > 0) {
                    setSelectedChannels(parsedResult.channel_names);
                  }
                  if (parsedResult.duration_seconds) {
                    setTimeFrameStart(0);
                    setTimeFrameEnd(parsedResult.duration_seconds);
                  }
                  resolve(true);
                } else {
                  setError('Failed to load BDF file after conversion');
                  resolve(false);
                }
              } catch (error) {
                console.error('BDF conversion error:', error);
                setError(`BDF conversion failed: ${error}`);
                resolve(false);
              }
            }
          }
        });
      });
    }

    // Use the useEDFFile hook to load the file (non-BDF files)
    const parsedResult = await loadEDFFile(file, pyodide, {
      onLoadingMessage: setLoadingMessage,
      onSuccess: setSuccess,
      onBdfConversionPrompt: async () => true
    });

    if (!parsedResult) {
      // Error already set by hook
      return false;
    }
    
    // Use multi-file manager to add the file
    addLoadedFile(file, parsedResult);
      
    // Set all channels as selected by default
    if (parsedResult.channel_names && parsedResult.channel_names.length > 0) {
      setSelectedChannels(parsedResult.channel_names);
    }
      
    // Initialize time frame to full duration
    if (parsedResult.duration_seconds) {
      setTimeFrameEnd(parsedResult.duration_seconds);
    }
      
    // Initialize annotations if available
    if (parsedResult.annotations && parsedResult.annotations.length > 0) {
      setAnnotations(parsedResult.annotations);
    } else {
      setAnnotations([]);
    }
      
    // Clear previous results when loading first file
    if (loadedFiles.length === 0) {
      clearAnalysisResults();
    }

    return true;
  }, [pyodideReady, pyodide, loadedFiles.length, loadEDFFile, addLoadedFile, setSelectedChannels, setTimeFrameEnd, setAnnotations, clearAnalysisResults]);

  const handleFileSelect = useCallback(async (file: File) => {
    // Check if this is the first file or an additional file
    if (loadedFiles.length === 0) {
      // First file - load normally
      await addFile(file);
    } else {
      // Additional file - ask for confirmation
      const shouldAdd = window.confirm(
        `You already have ${loadedFiles.length} file(s) loaded. Would you like to add "${file.name}" for comparison?\n\nClick OK to add, or Cancel to replace existing files.`
      );

      if (shouldAdd) {
        await addFile(file);
      } else {
        // Replace all files with this new one
        clearAllFiles();
        clearAnalysisResults();
        await addFile(file);
      }
    }
  }, [pyodideReady, loadedFiles, addFile]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Helper function to switch active file
  const switchToFile = useCallback((fileId: string) => {
    const targetFile = switchToFileHook(fileId);
    if (!targetFile) return;

    // Update UI state for the new file
    if (targetFile.metadata.channel_names && targetFile.metadata.channel_names.length > 0) {
      setSelectedChannels(targetFile.metadata.channel_names);
    }

    if (targetFile.metadata.duration_seconds) {
      setTimeFrameEnd(targetFile.metadata.duration_seconds);
      setTimeFrameStart(0);
    }

    if (targetFile.metadata.annotations && targetFile.metadata.annotations.length > 0) {
      setAnnotations(targetFile.metadata.annotations);
    } else {
      setAnnotations([]);
    }

    setSuccess(`Switched to file: ${targetFile.metadata.filename}`);
  }, [switchToFileHook, setSelectedChannels, setTimeFrameEnd, setTimeFrameStart, setAnnotations, setSuccess]);

  // Helper function to remove a file
  const removeFile = useCallback((fileId: string) => {
    const wasRemoved = removeFileHook(fileId);
    if (!wasRemoved) return;

    // If we removed the active file and there are no more files, clear state
    if (activeFileId === fileId && loadedFiles.length === 1) {
      clearAnalysisResults();
      setAnnotations([]);
    } else if (activeFileId === fileId && loadedFiles.length > 1) {
      // Switch to the first remaining file
      const remainingFiles = loadedFiles.filter(f => f.id !== fileId);
      if (remainingFiles.length > 0) {
        switchToFile(remainingFiles[0].id);
      }
    }

    const fileToRemove = loadedFiles.find(f => f.id === fileId);
    if (fileToRemove) {
      setSuccess(`Removed file: ${fileToRemove.nickname}`);
    }
  }, [removeFileHook, activeFileId, loadedFiles, switchToFile, clearAnalysisResults, setAnnotations, setSuccess]);

  // updateFileNickname is already provided by the hook, no need to redefine

  // Trace builder helper functions
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
      setError('Please select a file and channel for the trace');
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
      setSuccess(`Updated trace: ${defaultLabel}`);
    } else {
      // Add new trace
      setComparisonTraces(prev => [...prev, trace]);
      setSuccess(`Added trace: ${defaultLabel}`);
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
    resetTraceBuilder
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
      setError('Please provide a name for the comparison plot');
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
    setSuccess(`Saved comparison plot: ${comparisonPlotName}`);

    // Reset for next comparison
    setComparisonPlotName('');
    setCurrentComparisonPlot('');
    setComparisonTraces([]);
    setComparisonMode(false);
  }, [currentComparisonPlot, comparisonPlotName, comparisonTraces, comparisonPsdParams]);

  const deleteComparisonPlot = useCallback((plotId: string) => {
    const plot = comparisonPlots.find(p => p.id === plotId);
    if (!plot) return;

    const confirmed = window.confirm(`Delete comparison plot "${plot.name}"?`);
    if (!confirmed) return;

    setComparisonPlots(prev => prev.filter(p => p.id !== plotId));
    setSuccess(`Deleted comparison plot: ${plot.name}`);
  }, [comparisonPlots]);

  // Generate comparison PSD plot
  const generateComparisonPlot = useCallback(async () => {
    if (!pyodideReady || !pyodideRef.current) {
      setError('Python environment not ready');
      return;
    }

    if (comparisonTraces.length < 2) {
      setError('Please add at least 2 traces for comparison');
      return;
    }

    setIsAnalyzingHook(true);
    clearMessages();
    setLoadingMessage('Generating comparison PSD plot...');

    try {
      // Prepare traces - we need to set file bytes separately for each trace
      // because Pyodide doesn't handle nested Uint8Arrays well
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
        pyodideRef.current.globals.set(`file_bytes_${idx}`, uint8Array);

        // Create trace metadata (without the binary data)
        const traceMeta: any = {
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
        setError('Could not load data for enough traces (minimum 2 required)');
        setIsAnalyzingHook(false);
        setLoadingMessage('');
        return;
      }

      // Set metadata and params in Python globals
      pyodideRef.current.globals.set('traces_metadata', traceMetadata);
      pyodideRef.current.globals.set('comparison_psd_params', comparisonPsdParams);
      pyodideRef.current.globals.set('use_resutil_style', useResutilStyle);
      pyodideRef.current.globals.set('show_alpha_peaks', showAlphaPeaks);
      pyodideRef.current.globals.set('hide_comparison_title', hideComparisonTitle);
      pyodideRef.current.globals.set('use_db_scale', useDbScale);
      pyodideRef.current.globals.set('show_gamma_peaks', showGammaPeaks);
      pyodideRef.current.globals.set('show_snr_40hz', showSnr40Hz);

      // Build traces config in Python by converting bytes and merging with metadata
      const result = await pyodideRef.current.runPythonAsync(`
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
        const comparisonResult: AnalysisResult = {
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

        addAnalysisResult(comparisonResult);
        setSuccess(`Successfully generated comparison plot with ${comparisonTraces.length} traces. Added to analysis results.`);
        console.log('Comparison plot generated successfully and added to analysis results');
      } else {
        setError(`Failed to generate comparison plot: ${parsedResult.error}`);
        console.error('Comparison plot error:', parsedResult.error);
        if (parsedResult.traceback) {
          console.error('Python traceback:', parsedResult.traceback);
        }
      }

    } catch (error) {
      console.error('Error generating comparison plot:', error);
      setError(`Failed to generate comparison plot: ${error}`);
    } finally {
      setIsAnalyzingHook(false);
      setLoadingMessage('');
    }
  }, [
    pyodideReady,
    comparisonTraces,
    loadedFiles,
    comparisonPsdParams,
    useResutilStyle,
    showAlphaPeaks,
    hideComparisonTitle,
    useDbScale,
    showGammaPeaks,
    showSnr40Hz
  ]);

  const runSSVEPAnalysis = async () => {
    if (!pyodideReady || !pyodide || !currentFile) {
      setError('File not loaded or Python environment not ready');
      return;
    }

    clearMessages();

    // CRITICAL: Read resutil state at call time, not from closure
    const currentResutilState = useResutilStyle;

    await runSSVEPAnalysisHook(
      {
        target_frequency: ssvepParams.target_frequency,
        pca_components: ssvepParams.pca_components,
        frequency_bands: ssvepParams.frequency_bands
      },
      pyodide,
      selectedChannels,
      useTimeFrameFilter ? { start: timeFrameStart, end: timeFrameEnd } : null,
      setSuccess,
      setError,
      setLoadingMessage
    );
  };

  const runTraditionalAnalysis = async (analysisType: string) => {
    if (!pyodideReady || !pyodide || !currentFile) {
      setError('File not loaded or Python environment not ready');
      return;
    }

    clearMessages();

    // CRITICAL FIX: Read resutil state at call time, not from closure
    const currentResutilState = useResutilStyle;

    let parameters: Record<string, unknown>;
    if (analysisType === 'raw_signal') {
      parameters = analysisParams.raw_signal;
    } else if (analysisType === 'psd') {
      // Merge base parameters with advanced settings for PSD
      parameters = {
        ...analysisParams.psd,
        ...advancedPSDSettings
        // Note: use_resutil_style will be added by the hook at call time
      };
    } else if (analysisType === 'fooof') {
      // Use FOOOF parameters
      parameters = {
        ...fooofParams
        // Note: use_resutil_style will be added by the hook at call time
      };
    } else if (analysisType === 'snr') {
      parameters = analysisParams.snr;
    } else if (analysisType === 'theta_beta_ratio') {
      parameters = analysisParams.theta_beta_ratio;
    } else if (analysisType === 'time_frequency') {
      parameters = analysisParams.time_frequency;
    } else {
      setError(`Unknown analysis type: ${analysisType}`);
      return;
    }

    await runAnalysisHook(
      analysisType as any,
      parameters as any,
      pyodide,
      selectedChannels,
      useTimeFrameFilter ? { start: timeFrameStart, end: timeFrameEnd } : null,
      currentResutilState, // CRITICAL: Pass current state at call time
      setSuccess,
      setError,
      setLoadingMessage,
      calculateRealWorldTimeWrapper
    );
  };

  const toggleCollapse = (resultId: number) => {
    setCollapsedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resultId)) {
        newSet.delete(resultId);
      } else {
        newSet.add(resultId);
      }
      return newSet;
    });
  };

  // Plot selection handlers for reports
  const handlePlotSelection = (plotId: string, selected: boolean) => {
    if (selected) {
      setSelectedPlotsForReport(prev => [...prev, plotId]);
      setPlotSelectionOrder(prev => [...prev, plotId]);
    } else {
      setSelectedPlotsForReport(prev => prev.filter(id => id !== plotId));
      setPlotSelectionOrder(prev => prev.filter(id => id !== plotId));
    }
  };

  const movePlotUp = (plotId: string) => {
    setPlotSelectionOrder(prev => {
      const index = prev.indexOf(plotId);
      if (index <= 0) return prev;
      const newOrder = [...prev];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      return newOrder;
    });
  };

  const movePlotDown = (plotId: string) => {
    setPlotSelectionOrder(prev => {
      const index = prev.indexOf(plotId);
      if (index < 0 || index >= prev.length - 1) return prev;
      const newOrder = [...prev];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  const generatePatientReport = async () => {
    if (!pyodideReady || !pyodide || !metadata || !currentFile) {
      setError('Cannot generate report: File not loaded or Python environment not ready');
      return;
    }

    clearMessages();
    await generatePDFReport({
      pyodide,
      metadata,
      currentFile,
      analysisResults,
      selectedChannels,
      annotations,
      plotSelectionOrder,
      onError: setError,
      onSuccess: setSuccess,
      onLoadingChange: setGeneratingPDF,
      onLoadingMessageChange: setLoadingMessage
    });
  };

  const generatePatientReportDOCXFile = async () => {
    if (!pyodideReady || !pyodide || !metadata || !currentFile) {
      setError('Cannot generate report: File not loaded or Python environment not ready');
      return;
    }

    clearMessages();
    await generateDOCXReport({
      pyodide,
      metadata,
      currentFile,
      analysisResults,
      selectedChannels,
      annotations,
      plotSelectionOrder,
      onError: setError,
      onSuccess: setSuccess,
      onLoadingChange: setGeneratingPDF,
      onLoadingMessageChange: setLoadingMessage
    });
  };

  const renderSSVEPResults = () => {
    if (!ssvepResult) return null;

    const isCollapsed = collapsedResults.has(0);

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">SSVEP Analysis Results</h3>
          <button
            onClick={() => toggleCollapse(0)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            {isCollapsed ? '▼ Expand' : '▲ Collapse'}
          </button>
        </div>
        
        {!isCollapsed && (
        <>
        {/* Main visualization */}
        <div className="mb-6">
          <img 
            src={`data:image/png;base64,${ssvepResult.visualization_base64}`} 
            alt="SSVEP Comprehensive Analysis"
            className="w-full max-w-4xl mx-auto"
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--brand-blue)]/10 p-4 rounded-lg text-center border border-[var(--brand-blue)]/20">
            <h4 className="font-semibold text-brand-navy">Target Frequency</h4>
            <p className="text-2xl font-bold text-brand-blue">{ssvepResult.target_frequency} Hz</p>
          </div>
          
          <div className="bg-[var(--brand-green)]/10 p-4 rounded-lg text-center border border-[var(--brand-green)]/20">
            <h4 className="font-semibold text-brand-navy">Best Channel</h4>
            <p className="text-lg font-bold text-brand-green">{ssvepResult.summary.best_channel}</p>
          </div>
          
          <div className="bg-[var(--brand-navy)]/10 p-4 rounded-lg text-center border border-[var(--brand-navy)]/20">
            <h4 className="font-semibold text-brand-navy">Average SNR</h4>
            <p className="text-xl font-bold text-brand-navy">{ssvepResult.summary.average_snr.toFixed(2)} dB</p>
          </div>
          
          <div className="bg-[var(--brand-light-gold)]/20 p-4 rounded-lg text-center border border-[var(--brand-gold)]/30">
            <h4 className="font-semibold text-brand-navy">High Confidence</h4>
            <p className="text-xl font-bold text-brand-gold">{ssvepResult.summary.high_confidence_channels} channels</p>
          </div>
        </div>

        {/* Detailed results table */}
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SNR (dB)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peak Power</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ssvepResult.ssvep_detection).map(([channel, data]) => (
                <tr key={channel} className="border-t border-gray-200">
                  <td className="px-4 py-2 text-sm font-medium">{channel}</td>
                  <td className="px-4 py-2 text-sm">{data.snr_db.toFixed(2)}</td>
                  <td className="px-4 py-2 text-sm">{data.peak_power.toExponential(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      data.detection_confidence === 'high' ? 'bg-[var(--brand-green)]/20 text-brand-green border border-[var(--brand-green)]/30' :
                      data.detection_confidence === 'medium' ? 'bg-[var(--brand-light-gold)]/20 text-brand-gold border border-[var(--brand-gold)]/30' :
                      'bg-[var(--brand-red)]/20 text-brand-red border border-[var(--brand-red)]/30'
                    }`}>
                      {data.detection_confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    );
  };

  const renderAnalysisResults = () => {
    if (analysisResults.length === 0) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <h3 className="text-lg font-bold mb-4">Traditional Analysis Results</h3>
        
        {analysisResults.map((result, index) => {
          const resultId = index + 10; // Offset to avoid collision with SSVEP (id 0)
          const isCollapsed = collapsedResults.has(resultId);
          const isSelected = selectedPlotsForReport.includes((result.id as string) || '');
          
          return (
            <div key={index} className="mb-6 border rounded-lg">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-t-lg">
                <div className="flex items-center gap-3 flex-1">
                  {/* Plot selection checkbox */}
                  {result.plot_base64 && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handlePlotSelection((result.id as string) || '', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      title="Include in report"
                    />
                  )}
                <h4 className="text-md font-semibold capitalize">
                  {result.analysis_type.replace('_', ' ')} Analysis
                  {(result.analysis_type === 'psd' || result.analysis_type === 'snr') && result.parameters?.method && typeof result.parameters.method === 'string' ? (
                    <span className="text-sm font-normal text-blue-600 ml-2">
                      ({result.parameters.method.charAt(0).toUpperCase() + result.parameters.method.slice(1)})
                    </span>
                  ) : null}
                  {result.time_frame && (
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      ({formatTimeHMSWrapper(result.time_frame.start) || result.time_frame.start.toFixed(1)+'s'} - {formatTimeHMSWrapper(result.time_frame.end) || result.time_frame.end.toFixed(1)+'s'})
                    </span>
                  )}
                </h4>
                </div>
                <button
                  onClick={() => toggleCollapse(resultId)}
                  className="px-2 py-1 text-sm bg-white hover:bg-gray-100 rounded flex items-center gap-1"
                >
                  {isCollapsed ? '▼' : '▲'}
                </button>
              </div>
              
              {!isCollapsed && (
                <div className="p-3">
                  {/* Display theta-beta ratio result if available */}
                  {result.analysis_type === 'theta_beta_ratio' && result.data && typeof result.data === 'object' && result.data !== null && 'ratio' in result.data && (
                    <div className="mb-4 p-4 bg-[var(--brand-blue)]/10 border border-[var(--brand-blue)]/30 rounded-lg">
                      <div className="text-2xl font-bold text-brand-navy mb-2">
                        Theta/Beta Ratio: {typeof result.data.ratio === 'number' ? result.data.ratio.toFixed(3) : String(result.data.ratio)}
                      </div>
                      {'theta_power' in result.data && 'beta_power' in result.data && typeof result.data.theta_power === 'number' && typeof result.data.beta_power === 'number' ? (
                        <div className="text-sm text-gray-600">
                          Theta Power: {result.data.theta_power.toFixed(3)} | 
                          Beta Power: {result.data.beta_power.toFixed(3)}
                        </div>
                      ) : null}
                    </div>
                  )}
                  
                  {result.plot_base64 && (
                    <div className="mb-4">
                      <img 
                        src={`data:image/png;base64,${result.plot_base64}`} 
                        alt={`${result.analysis_type} plot`}
                        className="w-full max-w-4xl mx-auto"
                      />
                    </div>
                  )}
                  
                  {result.message && (
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      {result.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Full Width */}
      <div className="w-full px-6 pt-6">
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <h1 className="text-xl font-bold text-center mb-2">
            Browser EEG/EDF Analysis
          </h1>
          <p className="text-gray-600 text-center text-sm mb-4">
            Python-powered EEG analysis in your browser • No server • No limits
          </p>

          {/* Status indicators */}
          <div className="flex justify-center space-x-3 mb-3">
            <div className={`px-3 py-1 rounded text-sm ${pyodideReady ? 'bg-[var(--brand-green)]/20 text-brand-green border border-[var(--brand-green)]/30' : pyodideLoading ? 'bg-[var(--brand-light-gold)]/20 text-brand-gold border border-[var(--brand-gold)]/30' : 'bg-gray-100 text-gray-600'}`}>
              🐍 Python: {pyodideReady ? 'Ready' : pyodideLoading ? 'Loading...' : 'Not Loaded'}
            </div>
            <div className={`px-3 py-1 rounded text-sm ${currentFile ? 'bg-[var(--brand-blue)]/20 text-brand-blue border border-[var(--brand-blue)]/30' : 'bg-gray-100 text-gray-600'}`}>
              📁 File: {currentFile ? 'Loaded' : 'None'}
            </div>
            <div className={`px-3 py-1 rounded text-sm ${isAnalyzing ? 'bg-[var(--brand-navy)]/20 text-brand-navy border border-[var(--brand-navy)]/30' : 'bg-gray-100 text-gray-600'}`}>
              ⚡ Status: {isAnalyzing ? 'Analyzing...' : 'Ready'}
            </div>
          </div>
        </div>

        {/* Loading message and progress */}
        {loadingMessage && (
          <div className="bg-[var(--brand-blue)]/20 border border-[var(--brand-blue)]/40 text-brand-blue px-4 py-3 rounded mb-4">
            <div className="flex items-center justify-center mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
              {loadingMessage}
            </div>
            {/* Progress bar for analysis */}
            {isAnalyzing && analysisProgress > 0 && (
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-brand-blue h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="bg-[var(--brand-red)]/20 border border-[var(--brand-red)]/40 text-brand-red px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-[var(--brand-green)]/20 border border-[var(--brand-green)]/40 text-brand-green px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 min-w-[300px] max-w-md">
            <div className="flex items-start space-x-3">
              <div className={`flex-shrink-0 text-2xl ${
                toast.type === 'warning' ? 'text-[var(--brand-gold)]' :
                toast.type === 'error' ? 'text-[var(--brand-red)]' :
                toast.type === 'success' ? 'text-[var(--brand-green)]' :
                'text-[var(--brand-blue)]'
              }`}>
                {toast.type === 'warning' ? '⚠️' : toast.type === 'error' ? '❌' : toast.type === 'success' ? '✅' : 'ℹ️'}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{toast.message}</p>
                {toast.action && (
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={toast.action.onClick}
                      className="px-4 py-2 bg-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/90 text-white rounded text-sm font-medium transition-colors"
                    >
                      {toast.action.label}
                    </button>
                    <button
                      onClick={() => setToast(null)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setToast(null)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Two-Column Layout - Full Width */}
      <div className="w-full px-6 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-250px)]">
          {/* Left Column - All Controls/Inputs */}
          <div className="flex flex-col space-y-6 overflow-y-auto custom-scrollbar pr-2">
            {/* File Upload Section */}
        {!currentFile ? (
          <FileUpload
            pyodideReady={pyodideReady}
            dragActive={dragActive}
            onFileSelect={handleFileSelect}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            currentFile={null}
          />
        ) : (
          <>
            <MultiFileListPanel
              loadedFiles={loadedFiles}
              activeFileId={activeFileId}
              onSwitchToFile={switchToFile}
              onRemoveFile={removeFile}
              onUpdateNickname={updateFileNickname}
              onAddFile={() => fileInputRef.current?.click()}
              pyodideReady={pyodideReady}
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".edf,.bdf,.fif"
              className="hidden"
              disabled={!pyodideReady}
            />
          </>
        )}

        {/* File Information */}
        {metadata && <MetadataDisplay metadata={metadata} />}

        {/* Comparison Builder - now available after first file */}
        {loadedFiles.length >= 1 && (
          <div className="bg-gray-800 border-4 border-[var(--brand-navy)] rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">PSD Comparison Builder</h3>
                <p className="text-sm text-gray-300">Compare power spectra from multiple files or time periods</p>
              </div>
              <button
                onClick={() => {
                  setComparisonMode(!comparisonMode);
                  if (!comparisonMode) {
                    // Entering comparison mode - reset traces
                    setComparisonTraces([]);
                    resetTraceBuilder();
                  }
                }}
                className={`px-4 py-2 rounded font-medium transition-colors border-2 border-[var(--brand-gold)] ${
                  comparisonMode
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/90 text-white'
                }`}
              >
                {comparisonMode ? 'Exit Comparison Mode' : 'Enter Comparison Mode'}
              </button>
            </div>

            {comparisonMode && (
              <div className="space-y-6">
                {loadedFiles.length === 1 && (
                  <div className="bg-[var(--brand-gold)]/10 border border-[var(--brand-gold)]/30 text-gray-200 rounded p-3 text-sm">
                    Comparison mode is active with one file. Add a second file (or multiple traces/time windows from the same file) to build richer comparisons.
                  </div>
                )}
                {/* Trace Builder Form */}
                <div className="border border-[var(--brand-navy)]/30 rounded-lg p-4 bg-[var(--brand-navy)]/10">
                  <h4 className="font-semibold mb-3 text-gray-200">
                    {editingTraceId ? 'Edit Trace' : 'Add New Trace'}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* File Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        File *
                      </label>
                      <select
                        value={traceBuilderFileId}
                        onChange={(e) => {
                          setTraceBuilderFileId(e.target.value);
                          const file = loadedFiles.find(f => f.id === e.target.value);
                          if (file && file.metadata.channel_names && file.metadata.channel_names.length > 0) {
                            setTraceBuilderChannel(file.metadata.channel_names[0]);
                          }
                          if (file && file.metadata.duration_seconds) {
                            setTraceBuilderTimeEnd(file.metadata.duration_seconds);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                      >
                        <option value="">Select a file...</option>
                        {loadedFiles.map(file => (
                          <option key={file.id} value={file.id}>
                            {file.nickname} ({file.metadata.filename})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Channel Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Channel *
                      </label>
                      <select
                        value={traceBuilderChannel}
                        onChange={(e) => setTraceBuilderChannel(e.target.value)}
                        disabled={!traceBuilderFileId}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] disabled:bg-gray-100"
                      >
                        <option value="">Select a channel...</option>
                        {traceBuilderFileId &&
                          loadedFiles
                            .find(f => f.id === traceBuilderFileId)
                            ?.metadata.channel_names?.map(channel => (
                              <option key={channel} value={channel}>
                                {channel}
                              </option>
                            ))}
                      </select>
                    </div>

                    {/* Time Frame Toggle */}
                    <div className="md:col-span-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={traceBuilderUseTimeFrame}
                          onChange={(e) => setTraceBuilderUseTimeFrame(e.target.checked)}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-gray-300">
                          Use custom time window (optional)
                        </span>
                      </label>
                    </div>

                    {/* Time Window */}
                    {traceBuilderUseTimeFrame && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">
                            Start Time (seconds)
                          </label>
                          <input
                            type="number"
                            value={traceBuilderTimeStart}
                            onChange={(e) => setTraceBuilderTimeStart(parseFloat(e.target.value))}
                            min={0}
                            max={traceBuilderTimeEnd}
                            step={0.1}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">
                            End Time (seconds)
                          </label>
                          <input
                            type="number"
                            value={traceBuilderTimeEnd}
                            onChange={(e) => setTraceBuilderTimeEnd(parseFloat(e.target.value))}
                            min={traceBuilderTimeStart}
                            max={
                              traceBuilderFileId
                                ? loadedFiles.find(f => f.id === traceBuilderFileId)?.metadata.duration_seconds || 100
                                : 100
                            }
                            step={0.1}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                          />
                        </div>
                      </>
                    )}

                    {/* Legend Label */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Legend Label (optional)
                      </label>
                      <input
                        type="text"
                        value={traceBuilderLabel}
                        onChange={(e) => setTraceBuilderLabel(e.target.value)}
                        placeholder="Auto-generated if left empty"
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)]"
                      />
                    </div>

                    {/* Color Picker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Line Color (optional)
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="color"
                          value={traceBuilderColor || '#3B82F6'}
                          onChange={(e) => setTraceBuilderColor(e.target.value)}
                          className="h-10 w-16 border border-gray-300 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={traceBuilderColor}
                          onChange={(e) => setTraceBuilderColor(e.target.value)}
                          placeholder="#RRGGBB (auto if empty)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end space-x-2 mt-4">
                    {editingTraceId && (
                      <button
                        onClick={resetTraceBuilder}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors border-2 border-[var(--brand-gold)]"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      onClick={addOrUpdateTrace}
                      disabled={!traceBuilderFileId || !traceBuilderChannel}
                      className="px-4 py-2 bg-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/90 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-[var(--brand-gold)]"
                    >
                      {editingTraceId ? 'Update Trace' : 'Add Trace'}
                    </button>
                  </div>
                </div>

                {/* Configured Traces List */}
                {comparisonTraces.length > 0 && (
                  <div className="border border-gray-300 rounded-lg p-4">
                    <h4 className="font-semibold mb-3 text-gray-200">
                      Configured Traces ({comparisonTraces.length})
                    </h4>
                    <div className="space-y-2">
                      {comparisonTraces.map((trace, index) => {
                        const traceFile = loadedFiles.find(f => f.id === trace.fileId);
                        return (
                          <div
                            key={trace.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
                          >
                            <div className="flex items-center space-x-3 flex-1">
                              {/* Color indicator */}
                              {trace.color && (
                                <div
                                  className="w-4 h-4 rounded-full border border-gray-300"
                                  style={{ backgroundColor: trace.color }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate text-gray-200">{trace.label}</p>
                                <p className="text-xs text-gray-300">
                                  {traceFile?.nickname} • {trace.channel}
                                  {trace.timeFrame &&
                                    ` • ${trace.timeFrame.start.toFixed(1)}-${trace.timeFrame.end.toFixed(1)}s`}
                                </p>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => moveTraceUp(trace.id)}
                                disabled={index === 0}
                                className="p-1 text-gray-600 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move up"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => moveTraceDown(trace.id)}
                                disabled={index === comparisonTraces.length - 1}
                                className="p-1 text-gray-600 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move down"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => editTrace(trace.id)}
                                className="p-1 text-blue-600 hover:text-blue-800"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => removeTrace(trace.id)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Remove"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PSD Parameters for Comparison */}
                {comparisonTraces.length > 0 && (
                  <div className="border border-[var(--brand-gold)]/30 rounded-lg p-4 bg-[var(--brand-navy)]/10">
                    <h4 className="font-semibold mb-3 text-gray-200">
                      PSD Parameters (Shared Across All Traces)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Method */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Method
                        </label>
                        <select
                          value={comparisonPsdParams.method}
                          onChange={(e) =>
                            setComparisonPsdParams({
                              ...comparisonPsdParams,
                              method: e.target.value as 'welch' | 'periodogram'
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="welch">Welch</option>
                          <option value="periodogram">Periodogram</option>
                        </select>
                      </div>

                      {/* Frequency Min */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Min Frequency (Hz)
                        </label>
                        <input
                          type="number"
                          value={comparisonPsdParams.fmin}
                          onChange={(e) =>
                            setComparisonPsdParams({
                              ...comparisonPsdParams,
                              fmin: parseFloat(e.target.value)
                            })
                          }
                          min={0}
                          step={0.1}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Frequency Max */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Max Frequency (Hz)
                        </label>
                        <input
                          type="number"
                          value={comparisonPsdParams.fmax}
                          onChange={(e) =>
                            setComparisonPsdParams({
                              ...comparisonPsdParams,
                              fmax: parseFloat(e.target.value)
                            })
                          }
                          min={comparisonPsdParams.fmin}
                          step={0.1}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Welch-specific parameters */}
                      {comparisonPsdParams.method === 'welch' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              Window Size (seconds)
                            </label>
                            <input
                              type="number"
                              value={comparisonPsdParams.nperseg_seconds}
                              onChange={(e) =>
                                setComparisonPsdParams({
                                  ...comparisonPsdParams,
                                  nperseg_seconds: parseFloat(e.target.value)
                                })
                              }
                              min={0.1}
                              step={0.1}
                              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              Overlap Proportion
                            </label>
                            <input
                              type="number"
                              value={comparisonPsdParams.noverlap_proportion}
                              onChange={(e) =>
                                setComparisonPsdParams({
                                  ...comparisonPsdParams,
                                  noverlap_proportion: parseFloat(e.target.value)
                                })
                              }
                              min={0}
                              max={0.99}
                              step={0.05}
                              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                              Window Type
                            </label>
                            <select
                              value={comparisonPsdParams.window}
                              onChange={(e) =>
                                setComparisonPsdParams({
                                  ...comparisonPsdParams,
                                  window: e.target.value
                                })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="hamming">Hamming</option>
                              <option value="hann">Hann</option>
                              <option value="blackman">Blackman</option>
                              <option value="bartlett">Bartlett</option>
                            </select>
                          </div>
                        </>
                      )}

                      {/* Resutil styling toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={useResutilStyle}
                            onChange={(e) => setUseResutilStyle(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Use Optoceutics custom styling (resutil)
                          </span>
                        </label>
                      </div>

                      {/* Alpha peaks toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={showAlphaPeaks}
                            onChange={(e) => setShowAlphaPeaks(e.target.checked)}
                            className="rounded text-green-600 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Show alpha peak centroids (FOOOF)
                          </span>
                        </label>
                        <p className="text-xs text-gray-400 ml-6 mt-1">
                          Compute and display alpha peak (8-12 Hz) frequencies using FOOOF analysis
                        </p>
                      </div>

                      {/* Hide title toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={hideComparisonTitle}
                            onChange={(e) => setHideComparisonTitle(e.target.checked)}
                            className="rounded text-gray-600 focus:ring-gray-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Hide plot title
                          </span>
                        </label>
                        <p className="text-xs text-gray-400 ml-6 mt-1">
                          Remove the title from the comparison plot
                        </p>
                      </div>

                      {/* Power/dB scale toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={useDbScale}
                            onChange={(e) => setUseDbScale(e.target.checked)}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Use dB scale instead of power
                          </span>
                        </label>
                        <p className="text-xs text-gray-400 ml-6 mt-1">
                          Convert PSD to decibels (10*log10) with linear y-axis
                        </p>
                      </div>

                      {/* Gamma peak toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={showGammaPeaks}
                            onChange={(e) => setShowGammaPeaks(e.target.checked)}
                            className="rounded text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Show gamma (40Hz) SSVEP peaks
                          </span>
                        </label>
                        <p className="text-xs text-gray-400 ml-6 mt-1">
                          Detect and display 40Hz SSVEP peaks using FOOOF
                        </p>
                      </div>

                      {/* SNR at 40Hz toggle */}
                      <div className="md:col-span-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={showSnr40Hz}
                            onChange={(e) => setShowSnr40Hz(e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span className="text-sm font-medium text-gray-300">
                            Show SNR at 40Hz
                          </span>
                        </label>
                        <p className="text-xs text-gray-400 ml-6 mt-1">
                          Compute and display SNR at 40Hz (requires gamma peaks)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generate Comparison Plot Button */}
                {comparisonTraces.length >= 2 && (
                  <div className="text-center">
                    <button
                      onClick={generateComparisonPlot}
                      disabled={isAnalyzing}
                      className="px-6 py-3 bg-gradient-to-r from-[var(--brand-navy)] to-[var(--brand-gold)] hover:from-[var(--brand-navy)]/90 hover:to-[var(--brand-gold)]/90 text-white font-semibold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all border-2 border-[var(--brand-gold)]"
                    >
                      {isAnalyzing ? 'Generating...' : `Generate Comparison Plot (${comparisonTraces.length} traces)`}
                    </button>
                    <p className="text-xs text-gray-300 mt-2">
                      Minimum 2 traces required for comparison
                    </p>
                  </div>
                )}

                {/* Current Comparison Plot Display */}
                {currentComparisonPlot && (
                  <div className="border border-[var(--brand-gold)]/30 rounded-lg p-4 bg-[var(--brand-gold)]/10">
                    <h4 className="font-semibold mb-3 text-gray-200">Generated Comparison Plot</h4>
                    <img
                      src={`data:image/png;base64,${currentComparisonPlot}`}
                      alt="Comparison PSD Plot"
                      className="w-full rounded border border-gray-300 mb-3"
                    />

                    {/* Save comparison plot */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={comparisonPlotName}
                        onChange={(e) => setComparisonPlotName(e.target.value)}
                        placeholder="Enter comparison name..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-gold)]"
                      />
                      <button
                        onClick={saveComparisonPlot}
                        disabled={!comparisonPlotName.trim()}
                        className="px-4 py-2 bg-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/90 text-[var(--brand-navy)] rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border-2 border-[var(--brand-gold)]"
                      >
                        Save Comparison
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Saved Comparison Plots */}
        {comparisonPlots.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Saved Comparison Plots ({comparisonPlots.length})</h3>
            <div className="space-y-3">
              {comparisonPlots.map(plot => (
                <div key={plot.id} className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{plot.name}</h4>
                      <p className="text-sm text-gray-600">
                        {plot.traces.length} traces • {plot.parameters.method} • {plot.parameters.fmin}-{plot.parameters.fmax} Hz
                      </p>
                      <p className="text-xs text-gray-500">
                        Created: {new Date(plot.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteComparisonPlot(plot.id)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Collapsible plot preview */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                      View plot and details
                    </summary>
                    <div className="mt-3 space-y-2">
                      <img
                        src={`data:image/png;base64,${plot.plotBase64}`}
                        alt={plot.name}
                        className="w-full rounded border border-gray-300"
                      />
                      <div className="text-xs text-gray-700">
                        <p className="font-semibold mb-1">Traces:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {plot.traces.map(trace => {
                            const traceFile = loadedFiles.find(f => f.id === trace.fileId);
                            return (
                              <li key={trace.id}>
                                {trace.label} ({traceFile?.nickname || 'Unknown file'} - {trace.channel})
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channel Selection */}
        {metadata && metadata.channel_names && (
          <ChannelSelector
            metadata={metadata}
            selectedChannels={selectedChannels}
            onSelectionChange={setSelectedChannels}
            channelRenameMap={channelRenameMap}
            getChannelDisplayName={getChannelDisplayName}
            onRenameClick={openChannelRenamePopup}
            onDownloadModifiedEDF={downloadModifiedEDF}
          />
        )}

        {/* Annotation Management */}
        {metadata && (
          <AnnotationPanel
            annotations={annotations}
            metadata={metadata}
            onAnnotationUpdate={(index, field, value) => {
              const updated = [...annotations];
              if (field === 'onset' || field === 'duration') {
                updated[index][field] = value as number;
                if (field === 'onset' && updated[index].is_custom) {
                  updated[index].real_time = calculateRealWorldTimeWrapper(value as number);
                }
              } else {
                updated[index][field] = value as string;
              }
              setAnnotations(updated);
              setAnnotationsNeedUpdate(true);
            }}
            onAnnotationDelete={(id) => {
              setAnnotations(prev => prev.filter(a => a.id !== id));
              setAnnotationsNeedUpdate(true);
            }}
            calculateRealWorldTime={calculateRealWorldTimeWrapper}
            onAddCustomAnnotation={() => {
              const onset = timeFrameStart || 0;
              const newAnnotation: EDFAnnotation = {
                id: `custom_${Date.now()}`,
                onset: onset,
                duration: 1.0,
                description: 'New Annotation',
                is_custom: true,
                real_time: calculateRealWorldTimeWrapper(onset)
              };
              setAnnotations(prev => [...prev, newAnnotation]);
              setAnnotationsNeedUpdate(true);
            }}
          />
        )}

        {/* Time Frame Selection */}
        {metadata && metadata.duration_seconds && (
          <TimeFrameSelector
            duration={metadata.duration_seconds}
            timeFrameStart={timeFrameStart}
            timeFrameEnd={timeFrameEnd}
            useTimeFrame={useTimeFrameFilter}
            onTimeFrameStartChange={setTimeFrameStart}
            onTimeFrameEndChange={setTimeFrameEnd}
            onUseTimeFrameChange={setUseTimeFrame}
            formatTimeHMS={(time) => calculateRealWorldTime(time, metadata)}
            annotations={annotations}
          />
        )}

        {/* Legacy inline UI removed - using TimeFrameSelector component */}

        {/* Analysis Controls */}
        {currentFile && pyodideReady && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-6">Analysis Tools</h2>

            {/* Plot Styling Options */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold mb-3 text-purple-900">🎨 Plot Styling Options</h3>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="useResutilStyle"
                  checked={useResutilStyle}
                  onChange={(e) => setUseResutilStyle(e.target.checked)}
                  className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                />
                <label htmlFor="useResutilStyle" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Use Optoceutics Custom Styling (resutil library)
                </label>
              </div>
              <p className="text-xs text-gray-600 mt-2 ml-8">
                When enabled, all new plots will use custom Optoceutics fonts and color schemes for professional reports.
              </p>
            </div>

            {/* SSVEP Analysis */}
            <div className="border-b pb-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">🎯 Comprehensive SSVEP Analysis</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Frequency (Hz):</label>
                  <input
                    type="number"
                    value={ssvepParams.target_frequency}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, target_frequency: parseFloat(e.target.value) }))}
                    step="0.1"
                    min="1"
                    max="100"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PCA Components:</label>
                  <input
                    type="number"
                    value={ssvepParams.pca_components}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, pca_components: parseInt(e.target.value) }))}
                    min="1"
                    max="20"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={runSSVEPAnalysis}
                    disabled={isAnalyzing}
                    className="w-full bg-brand-navy hover:opacity-90 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center justify-center"
                  >
                    {isAnalyzing && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Run SSVEP Analysis'}
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-gray-600">
                Comprehensive SSVEP analysis including 40Hz detection, PCA, SNR calculation, and frequency band analysis
              </p>
            </div>

            {/* Traditional Analysis Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Raw Signal */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📈 Raw Signal Plot</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Duration (s):</label>
                  <input
                    type="number"
                    value={analysisParams.raw_signal.duration}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      raw_signal: { ...prev.raw_signal, duration: Math.min(parseFloat(e.target.value), timeFrameEnd - timeFrameStart) }
                    }))}
                    min="0.1"
                    max={timeFrameEnd - timeFrameStart}
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Start Time (s):</label>
                  <input
                    type="number"
                    value={analysisParams.raw_signal.start_time}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      raw_signal: { ...prev.raw_signal, start_time: parseInt(e.target.value) }
                    }))}
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('raw_signal')}
                  disabled={isAnalyzing}
                  className="w-full bg-brand-green hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Plot Raw Signal
                </button>
              </div>

              {/* PSD */}
              <div className="bg-gray-50 p-4 rounded-lg relative">
                <h4 className="font-semibold mb-3">🌊 Power Spectral Density</h4>
                <div className="flex gap-4">
                  {/* Main PSD settings */}
                  <div className="flex-1">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                      <input
                        type="number"
                        value={analysisParams.psd.fmin}
                        onChange={(e) => setAnalysisParams(prev => ({
                          ...prev,
                          psd: { ...prev.psd, fmin: parseFloat(e.target.value) }
                        }))}
                        step="0.1"
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                      <input
                        type="number"
                        value={analysisParams.psd.fmax}
                        onChange={(e) => setAnalysisParams(prev => ({
                          ...prev,
                          psd: { ...prev.psd, fmax: parseFloat(e.target.value) }
                        }))}
                        step="0.1"
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setAnalysisParams(prev => ({
                            ...prev,
                            psd: { ...prev.psd, method: 'welch' }
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            analysisParams.psd.method === 'welch'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Welch
                        </button>
                        <button
                          onClick={() => setAnalysisParams(prev => ({
                            ...prev,
                            psd: { ...prev.psd, method: 'periodogram' }
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            analysisParams.psd.method === 'periodogram'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Periodogram
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runTraditionalAnalysis('psd')}
                        disabled={isAnalyzing}
                        className="flex-1 bg-brand-blue hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                      >
                        {isAnalyzing && (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        )}
                        Compute PSD
                      </button>
                      <button
                        onClick={() => setShowAdvancedPSDSettings(!showAdvancedPSDSettings)}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                        title="Advanced Settings"
                      >
                        ⚙️
                      </button>
                    </div>
                  </div>

                  {/* Advanced settings panel */}
                  {showAdvancedPSDSettings && (
                    <div className="w-64 bg-white border-2 border-blue-200 rounded-lg p-3 shadow-lg">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className="font-semibold text-sm">⚙️ Advanced Settings</h5>
                        <button
                          onClick={() => setShowAdvancedPSDSettings(false)}
                          className="text-gray-500 hover:text-gray-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Welch-specific settings */}
                      {analysisParams.psd.method === 'welch' && (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Segment Length (seconds):</label>
                            <input
                              type="number"
                              value={advancedPSDSettings.nperseg_seconds}
                              onChange={(e) => setAdvancedPSDSettings(prev => ({
                                ...prev,
                                nperseg_seconds: parseFloat(e.target.value)
                              }))}
                              step="0.5"
                              min="0.5"
                              className="w-full p-2 border border-gray-300 rounded text-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">Default: 4s</p>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Overlap (0-1):</label>
                            <input
                              type="number"
                              value={advancedPSDSettings.noverlap_proportion}
                              onChange={(e) => setAdvancedPSDSettings(prev => ({
                                ...prev,
                                noverlap_proportion: Math.min(1, Math.max(0, parseFloat(e.target.value)))
                              }))}
                              step="0.1"
                              min="0"
                              max="1"
                              className="w-full p-2 border border-gray-300 rounded text-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">Proportion of segment length. Default: 0.5</p>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium mb-1">Window:</label>
                            <div className="flex bg-gray-100 rounded-lg p-1">
                              <button
                                onClick={() => setAdvancedPSDSettings(prev => ({
                                  ...prev,
                                  window: 'hann'
                                }))}
                                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                  advancedPSDSettings.window === 'hann'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                Hann
                              </button>
                              <button
                                onClick={() => setAdvancedPSDSettings(prev => ({
                                  ...prev,
                                  window: 'boxcar'
                                }))}
                                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                  advancedPSDSettings.window === 'boxcar'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                Boxcar
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {/* dB/Power toggle (for all methods) */}
                      <div className="mb-2">
                        <label className="block text-xs font-medium mb-1">Units:</label>
                        <div className="flex bg-gray-100 rounded-lg p-1">
                          <button
                            onClick={() => setAdvancedPSDSettings(prev => ({
                              ...prev,
                              use_db: false
                            }))}
                            className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              !advancedPSDSettings.use_db
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Power
                          </button>
                          <button
                            onClick={() => setAdvancedPSDSettings(prev => ({
                              ...prev,
                              use_db: true
                            }))}
                            className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              advancedPSDSettings.use_db
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            dB
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* FOOOF */}
              <div className="bg-gray-50 p-4 rounded-lg relative">
                <h4 className="font-semibold mb-3">🎵 FOOOF Spectral Parameterization</h4>
                <div className="flex gap-4">
                  {/* Main FOOOF settings */}
                  <div className="flex-1">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Freq Range (Hz):</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={fooofParams.freq_range[0]}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            freq_range: [parseFloat(e.target.value), prev.freq_range[1]]
                          }))}
                          step="0.5"
                          min="0"
                          className="w-1/2 p-2 border border-gray-300 rounded text-sm"
                          placeholder="Min"
                        />
                        <input
                          type="number"
                          value={fooofParams.freq_range[1]}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            freq_range: [prev.freq_range[0], parseFloat(e.target.value)]
                          }))}
                          step="0.5"
                          min="1"
                          className="w-1/2 p-2 border border-gray-300 rounded text-sm"
                          placeholder="Max"
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Max Peaks:</label>
                      <input
                        type="number"
                        value={fooofParams.max_n_peaks}
                        onChange={(e) => setFooofParams(prev => ({
                          ...prev,
                          max_n_peaks: parseInt(e.target.value)
                        }))}
                        min="1"
                        max="12"
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">Aperiodic Mode:</label>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setFooofParams(prev => ({
                            ...prev,
                            aperiodic_mode: 'fixed'
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            fooofParams.aperiodic_mode === 'fixed'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Fixed
                        </button>
                        <button
                          onClick={() => setFooofParams(prev => ({
                            ...prev,
                            aperiodic_mode: 'knee'
                          }))}
                          className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            fooofParams.aperiodic_mode === 'knee'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Knee
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runTraditionalAnalysis('fooof')}
                        disabled={isAnalyzing}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                      >
                        {isAnalyzing && (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                        )}
                        Run FOOOF
                      </button>
                      <button
                        onClick={() => setShowAdvancedFOOOFSettings(!showAdvancedFOOOFSettings)}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                        title="Advanced Settings"
                      >
                        ⚙️
                      </button>
                    </div>
                  </div>

                  {/* Advanced settings panel */}
                  {showAdvancedFOOOFSettings && (
                    <div className="w-64 bg-white border-2 border-purple-200 rounded-lg p-3 shadow-lg">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className="font-semibold text-sm">⚙️ Advanced Settings</h5>
                        <button
                          onClick={() => setShowAdvancedFOOOFSettings(false)}
                          className="text-gray-500 hover:text-gray-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">Peak Width Limits (Hz):</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={fooofParams.peak_width_limits[0]}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              peak_width_limits: [parseFloat(e.target.value), prev.peak_width_limits[1]]
                            }))}
                            step="0.1"
                            min="0.1"
                            className="w-1/2 p-2 border border-gray-300 rounded text-xs"
                            placeholder="Min"
                          />
                          <input
                            type="number"
                            value={fooofParams.peak_width_limits[1]}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              peak_width_limits: [prev.peak_width_limits[0], parseFloat(e.target.value)]
                            }))}
                            step="0.5"
                            min="0.5"
                            className="w-1/2 p-2 border border-gray-300 rounded text-xs"
                            placeholder="Max"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Default: 0.5-12 Hz</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">Min Peak Height:</label>
                        <input
                          type="number"
                          value={fooofParams.min_peak_height}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            min_peak_height: parseFloat(e.target.value)
                          }))}
                          step="0.05"
                          min="0"
                          max="1"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 0.1</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">PSD Window (seconds):</label>
                        <input
                          type="number"
                          value={fooofParams.nperseg_seconds}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            nperseg_seconds: parseFloat(e.target.value)
                          }))}
                          step="0.5"
                          min="0.5"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 4s</p>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">PSD Overlap:</label>
                        <input
                          type="number"
                          value={fooofParams.noverlap_proportion}
                          onChange={(e) => setFooofParams(prev => ({
                            ...prev,
                            noverlap_proportion: parseFloat(e.target.value)
                          }))}
                          step="0.1"
                          min="0"
                          max="1"
                          className="w-full p-2 border border-gray-300 rounded text-xs"
                        />
                        <p className="text-xs text-gray-500 mt-1">Default: 0.5 (50%)</p>
                      </div>

                      {/* Plot display options */}
                      <div className="border-t border-purple-200 pt-3 mt-3">
                        <label className="block text-xs font-semibold mb-2">Plot Display Options:</label>

                        <div className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            id="show-aperiodic"
                            checked={fooofParams.show_aperiodic}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              show_aperiodic: e.target.checked
                            }))}
                            className="mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <label htmlFor="show-aperiodic" className="text-xs text-gray-700">
                            Show Aperiodic (1/f) Component
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="show-periodic"
                            checked={fooofParams.show_periodic}
                            onChange={(e) => setFooofParams(prev => ({
                              ...prev,
                              show_periodic: e.target.checked
                            }))}
                            className="mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <label htmlFor="show-periodic" className="text-xs text-gray-700">
                            Show Periodic Component
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SNR */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📊 Signal-to-Noise Ratio</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                  <input
                    type="number"
                    value={analysisParams.snr.fmin}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      snr: { ...prev.snr, fmin: parseFloat(e.target.value) }
                    }))}
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                  <input
                    type="number"
                    value={analysisParams.snr.fmax}
                    onChange={(e) => setAnalysisParams(prev => ({
                      ...prev,
                      snr: { ...prev.snr, fmax: parseFloat(e.target.value) }
                    }))}
                    min="1"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        snr: { ...prev.snr, method: 'welch' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.snr.method === 'welch' 
                          ? 'bg-brand-gold text-brand-navy shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Welch
                    </button>
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        snr: { ...prev.snr, method: 'periodogram' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.snr.method === 'periodogram' 
                          ? 'bg-brand-gold text-brand-navy shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Periodogram
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('snr')}
                  disabled={isAnalyzing}
                  className="w-full bg-brand-gold hover:bg-brand-light-gold text-brand-navy py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center font-medium"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute SNR
                </button>
              </div>

              {/* Theta-Beta Ratio */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">🧠 Theta-Beta Ratio</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Theta Min (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.theta_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, theta_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Theta Max (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.theta_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, theta_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Beta Min (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.beta_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, beta_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Beta Max (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.theta_beta_ratio.beta_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, beta_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, method: 'welch' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.theta_beta_ratio.method === 'welch' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Welch
                    </button>
                    <button
                      onClick={() => setAnalysisParams(prev => ({
                        ...prev,
                        theta_beta_ratio: { ...prev.theta_beta_ratio, method: 'periodogram' }
                      }))}
                      className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        analysisParams.theta_beta_ratio.method === 'periodogram' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Periodogram
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('theta_beta_ratio')}
                  disabled={isAnalyzing}
                  className="w-full bg-brand-blue hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute Theta-Beta Ratio
                </button>
              </div>

              {/* Time-Frequency Analysis */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📈 Time-Frequency Analysis</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_min}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_min: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="0"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_max}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_max: parseFloat(e.target.value) }
                      }))}
                      step="0.1"
                      min="1"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Freq Points:</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.freq_points}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, freq_points: parseInt(e.target.value) }
                      }))}
                      min="10"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Time Points:</label>
                    <input
                      type="number"
                      value={analysisParams.time_frequency.time_points}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, time_points: parseInt(e.target.value) }
                      }))}
                      min="10"
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Channel:</label>
                    <select
                      value={analysisParams.time_frequency.selected_channel}
                      onChange={(e) => setAnalysisParams(prev => ({
                        ...prev,
                        time_frequency: { ...prev.time_frequency, selected_channel: parseInt(e.target.value) }
                      }))}
                      className="w-full p-2 border border-gray-300 rounded text-sm"
                    >
                      {metadata?.channel_names?.map((channel: string, index: number) => (
                        <option key={index} value={index}>
                          {channel}
                        </option>
                      )) || <option value={0}>Loading channels...</option>}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => runTraditionalAnalysis('time_frequency')}
                  disabled={isAnalyzing}
                  className="w-full bg-brand-red hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute Spectrogram
                </button>
              </div>
            </div>
          </div>
        )}
          </div>

          {/* Right Column - All Outputs/Results */}
          <div className="flex flex-col space-y-6 overflow-y-auto custom-scrollbar pl-2">
            {/* Results */}
            {renderSSVEPResults()}
            {renderAnalysisResults()}

        {/* Plot Selection Panel for Reports */}
        {plotSelectionOrder.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-4">
            <h3 className="text-lg font-bold mb-4">📊 Selected Plots for Report</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Use the buttons below to reorder the plots. They will appear in this order in the generated report.
            </p>
            <div className="space-y-2">
              {plotSelectionOrder.map((plotId, index) => {
                const result = analysisResults.find(r => (r.id as string) === plotId);
                if (!result) return null;

                return (
                  <div key={plotId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                    <span className="font-semibold text-gray-700 min-w-[24px]">{index + 1}.</span>
                    <div className="flex-1">
                      <span className="font-medium capitalize">
                        {result.analysis_type.replace('_', ' ')} Analysis
                      </span>
                      {result.parameters?.freq_range && Array.isArray(result.parameters.freq_range) && result.parameters.freq_range.length >= 2 ? (
                        <span className="text-sm text-gray-600 ml-2">
                          ({String(result.parameters.freq_range[0])}-{String(result.parameters.freq_range[1])} Hz)
                        </span>
                      ) : null}
                      {result.parameters?.fmin && result.parameters?.fmax && typeof result.parameters.fmin === 'number' && typeof result.parameters.fmax === 'number' ? (
                        <span className="text-sm text-gray-600 ml-2">
                          ({result.parameters.fmin}-{result.parameters.fmax} Hz)
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => movePlotUp(plotId)}
                        disabled={index === 0}
                        className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-blue-700 rounded transition-colors"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => movePlotDown(plotId)}
                        disabled={index === plotSelectionOrder.length - 1}
                        className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-blue-700 rounded transition-colors"
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => handlePlotSelection(plotId, false)}
                        className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                        title="Remove from report"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Generate Patient Report PDF */}
        {(analysisResults.some(r => r.analysis_type === 'psd') || plotSelectionOrder.length > 0) && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-4">
            <h3 className="text-lg font-bold mb-4">📄 Patient Report Generation</h3>
            <p className="text-gray-600 mb-4">
              Generate a comprehensive patient report using your analysis results.
              {plotSelectionOrder.length > 0 ? (
                <span className="font-semibold text-blue-700">
                  {' '}Your report will include {plotSelectionOrder.length} selected plot{plotSelectionOrder.length > 1 ? 's' : ''} in the custom order shown above.
                </span>
              ) : (
                <span>
                  {' '}Tip: Check the boxes next to plots above to include them in your report with custom ordering.
                </span>
              )}
            </p>
            <div className="bg-[var(--brand-blue)]/10 border border-[var(--brand-blue)]/30 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-brand-navy mb-2">Report will include:</h4>
              <ul className="list-disc list-inside text-sm text-brand-navy space-y-1">
                <li>Patient and recording information</li>
                <li>Selected time frame and analysis parameters</li>
                {plotSelectionOrder.length > 0 ? (
                  <li>{plotSelectionOrder.length} selected plot{plotSelectionOrder.length > 1 ? 's' : ''} with captions in custom order</li>
                ) : (
                  <li>Most recent PSD analysis plot (default)</li>
                )}
                <li>Channel information and annotations</li>
                <li>Analysis summary</li>
              </ul>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={generatePatientReportDOCXFile}
                disabled={generatingPDF || !pyodideReady}
                className="w-full bg-brand-blue hover:opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg text-base font-medium flex items-center justify-center transition-colors shadow-md hover:shadow-lg"
              >
                {generatingPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generating DOCX...
                  </>
                ) : (
                  <>
                    <span className="text-2xl mr-2">📄</span>
                    Download DOCX (Perfect Formatting)
                  </>
                )}
              </button>
              <button
                // onClick={generatePatientReport}
                disabled={true}
                className="w-full bg-gray-300 cursor-not-allowed text-gray-500 py-3 px-6 rounded-lg text-base font-medium flex items-center justify-center transition-colors shadow-md"
              >
                <span className="text-2xl mr-2">📥</span>
                <span className="line-through">Generate PDF Report</span>
                <span className="ml-2 text-xs">(Coming Soon)</span>
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              💡 <strong>Tip:</strong> Download DOCX for perfect formatting preservation (headers, footers, fonts).
              You can convert it to PDF locally using Word or Google Docs.
            </p>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Footer - Full Width */}
      <div className="w-full px-6 pb-6">
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Browser-based EEG analysis with Python (Pyodide) • No servers • No file limits • Full privacy</p>
          <p>All processing happens locally in your browser using WebAssembly</p>
        </div>
      </div>

      {/* Channel Rename Popup */}
      <ChannelRenamePopup
        isOpen={showChannelRenamePopup}
        onClose={() => setShowChannelRenamePopup(false)}
        metadata={metadata}
        channelToRename={channelToRename}
        newChannelName={newChannelName}
        channelRenameMap={channelRenameMap}
        onChannelSelect={setChannelToRename}
        onNewNameChange={setNewChannelName}
        onSubmit={submitChannelRename}
        getChannelDisplayName={getChannelDisplayName}
      />
    </div>
  );
}