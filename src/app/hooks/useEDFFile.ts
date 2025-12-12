/**
 * Custom hook for EDF file reading and management
 * Supports EDF, BDF, and FIF files with BDF conversion
 */

import { useState, useCallback } from 'react';
import type { PyodideInstance } from '../types/pyodide';
import type { EDFMetadata, EDFAnnotation } from '../types/edfProcessor';

export type LoadFileResult = EDFMetadata & {
  effectiveFile?: File;
  convertedFromBdf?: boolean;
};

export interface LoadFileOptions {
  convertBdf?: boolean; // Whether to convert BDF to EDF (default: prompt user)
  onBdfConversionPrompt?: () => Promise<boolean>; // Custom prompt function
  onLoadingMessage?: (message: string) => void; // Loading message callback
  onSuccess?: (message: string) => void; // Success message callback
  highpassBdf?: boolean; // Apply light high-pass (0.1 Hz) to BDF to mimic AC coupling (default: false)
  useAverageReference?: boolean; // Use average reference (mixes channels) vs DC offset correction (per channel, default: false)
}

interface UseEDFFileReturn {
  currentFile: File | null;
  metadata: EDFMetadata | null;
  error: string | null;
  loading: boolean;
  loadFile: (file: File, pyodide: PyodideInstance, options?: LoadFileOptions) => Promise<LoadFileResult | null>;
  convertBdfToEdf: () => Promise<{ success: boolean; data?: string; error?: string }>;
  clearFile: () => void;
}

export function useEDFFile(): UseEDFFileReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EDFMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Deprecated: kept for API shape, but not used anymore. BDF handled in-memory.
  const convertBdfToEdf = useCallback(async (): Promise<{ success: boolean; data?: string; error?: string }> => {
    console.warn('[BDF->EDF] convertBdfToEdf is deprecated; using in-memory BDF load instead.');
    return { success: false, error: 'Conversion disabled; use in-memory BDF load.' };
  }, []);

  const loadFile = useCallback(async (
    file: File,
    pyodide: PyodideInstance,
    options?: LoadFileOptions
  ): Promise<LoadFileResult | null> => {
    if (!file.name.toLowerCase().endsWith('.edf') && 
        !file.name.toLowerCase().endsWith('.fif') && 
        !file.name.toLowerCase().endsWith('.bdf')) {
      setError('Please select an EDF, BDF, or FIF file');
      return null;
    }

    setLoading(true);
    setError(null);
    options?.onLoadingMessage?.('Reading file...');

    try {
      let effectiveFile: File | undefined = file;
      // Read file as bytes
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let effectiveFilename = file.name;

      // Handle BDF in-memory (no conversion)
      if (file.name.toLowerCase().endsWith('.bdf')) {
        options?.onLoadingMessage?.('Reading BDF (avg ref + annotations)...');
        pyodide.globals.set('js_bdf_bytes', uint8Array);
        pyodide.globals.set('js_bdf_name', file.name);
        pyodide.globals.set('js_apply_highpass', options?.highpassBdf ?? false);
        pyodide.globals.set('js_use_avg_ref', options?.useAverageReference ?? false);
        const pyResult = await pyodide.runPythonAsync(`
import json, traceback, tempfile, os, mne, numpy as np

result_json = ""

try:
    # Globals set from JS
    bdf_bytes = bytes(js_bdf_bytes)
    bdf_name = str(js_bdf_name)
    apply_hp = bool(js_apply_highpass)
    use_avg_ref = bool(js_use_avg_ref)
    print("[BDF][py] Received globals", {"name": bdf_name, "bytes": len(bdf_bytes), "hp": apply_hp, "avg_ref": use_avg_ref})

    with tempfile.NamedTemporaryFile(delete=False, suffix=".bdf") as tmp:
        tmp.write(bdf_bytes)
        src_path = tmp.name

    raw = mne.io.read_raw_bdf(src_path, preload=True, verbose=False)
    print("[BDF][py] Loaded", bdf_name, "channels", raw.ch_names)

    # Fix DC offset (magnitude issue) - default to per-channel DC correction, not average reference
    data_before = raw.get_data()
    print(f"[BDF][py] Data shape: {data_before.shape}, mean before correction: {np.mean(data_before):.6f}, std: {np.std(data_before):.6f}")

    if use_avg_ref:
        # Traditional average reference (mixes channels)
        raw.set_eeg_reference(ref_channels="average", projection=False)
        print("[BDF][py] Applied average reference (channels mixed)")
    else:
        # DC offset correction per channel (preserves channel relationships)
        dc_offsets = np.mean(data_before, axis=1, keepdims=True)
        raw._data -= dc_offsets
        print(f"[BDF][py] Applied DC offset correction (per channel). Max offset: {np.max(np.abs(dc_offsets)) * 1e6:.2f} uV")

    # Check data after correction
    data_after = raw.get_data()
    print(f"[BDF][py] Data after correction - mean: {np.mean(data_after):.6f}, std: {np.std(data_after):.6f}")

    if apply_hp:
        raw.filter(l_freq=0.1, h_freq=None)
        print("[BDF][py] Applied 0.1 Hz high-pass")

    # MNE should handle BDF annotations automatically, just like EDF
    print(f"[BDF][py] Annotations after loading: {len(raw.annotations)}")

    drops = []
    for ch in ['Status', 'TimeStamp']:
        if ch in raw.ch_names:
            raw.drop_channels([ch])
            drops.append(ch)
    if drops:
        print("[BDF][py] Dropped channels:", drops)

    # Process annotations the same way as EDF files
    annotations = []
    if len(raw.annotations) > 0:
        print(f"[BDF][py] Processing {len(raw.annotations)} annotations from MNE")
        # Use the same extract_annotations function as EDF files
        # But since we're in the inline script, we'll do it manually for now
        meas_date = raw.info.get('meas_date')
        print(f"[BDF][py] meas_date: {meas_date}")

        for i, ann in enumerate(raw.annotations):
            # Calculate real_time like EDF files do
            real_time = None
            if meas_date is not None:
                try:
                    from datetime import datetime, timedelta
                    if hasattr(meas_date, 'timestamp'):
                        start_datetime = datetime.fromtimestamp(meas_date.timestamp())
                    else:
                        start_datetime = meas_date
                    annotation_datetime = start_datetime + timedelta(seconds=float(ann['onset']))
                    real_time = annotation_datetime.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                    print(f"[BDF][py] Annotation {i}: {ann['description']} at {ann['onset']}s -> {real_time}")
                except Exception as e:
                    print(f"[BDF][py] Error calculating real_time for annotation {i}: {e}")

            annotations.append({
                "id": f'bdf_ann_{i}',
                "onset": float(ann['onset']),
                "duration": float(ann['duration']),
                "description": str(ann['description']),
                "real_time": real_time,
                "is_custom": False
            })

    # Store processed raw object globally like EDF files do
    global current_edf_data, current_metadata
    current_edf_data = raw

    metadata = {
        "filename": bdf_name.replace('.bdf', '.edf'),
        "file_size_mb": len(bdf_bytes) / (1024 * 1024),
        "num_channels": len(raw.ch_names),
        "channel_names": raw.ch_names,
        "duration_seconds": float(raw.n_times / raw.info['sfreq']),
        "sampling_frequency": float(raw.info['sfreq']),
        "annotations": annotations,
        "library_used": "MNE-Python (BDF)",
        "real_data": True,
        "convertedFromBdf": True
    }
    current_metadata = metadata

    result = {
        "success": True,
        **metadata
    }

    try:
        if os.path.exists(src_path):
            os.unlink(src_path)
    except Exception:
        pass

    result_json = json.dumps(result)

except Exception as e:
    tb = traceback.format_exc()
    print("[BDF][py] FAILED", e, tb)
    result_json = json.dumps({"success": False, "error": f"{e}\\n{tb}"})

result_json
        `);

        let parsedPy: { success: boolean; error?: string; filename?: string; num_channels?: number; channel_names?: string[]; duration_seconds?: number; sfreq?: number; sampling_frequency?: number; annotations?: EDFAnnotation[] };
        try {
          parsedPy = JSON.parse(pyResult as string);
        } catch (parseErr) {
          console.error('[BDF] JSON parse error:', parseErr, pyResult);
          setError('BDF load failed: invalid response from Python');
          setLoading(false);
          options?.onLoadingMessage?.('');
          return null;
        }

        if (!parsedPy.success) {
          setError(`BDF load failed: ${parsedPy.error || 'unknown error'}`);
          setLoading(false);
          options?.onLoadingMessage?.('');
          return null;
        }

        // Create metadata from parsed result
        const bdfMetadata: EDFMetadata = {
          filename: parsedPy.filename || effectiveFilename,
          file_size_mb: file.size / (1024 * 1024),
          num_channels: parsedPy.num_channels || 0,
          channel_names: parsedPy.channel_names || [],
          duration_seconds: parsedPy.duration_seconds || 0,
          sampling_frequency: parsedPy.sampling_frequency || 256, // Use sampling_frequency from Python
          annotations: parsedPy.annotations || [],
          library_used: 'MNE-Python (BDF)',
          real_data: true
        };


        console.log('[BDF][UI] Created metadata:', {
          filename: bdfMetadata.filename,
          channels: bdfMetadata.num_channels,
          duration: bdfMetadata.duration_seconds,
          annotations: bdfMetadata.annotations?.length || 0
        });

        // Set state and return - ensure no exceptions here
        try {
          effectiveFilename = bdfMetadata.filename;
          effectiveFile = file;
          const correction_method = options?.useAverageReference ? 'avg ref' : 'DC offset';
          options?.onSuccess?.(`BDF loaded in-memory (${correction_method}${options?.highpassBdf ? ' + HP 0.1Hz' : ''}), ${bdfMetadata.annotations?.length || 0} annotations recovered.`);

          setCurrentFile(effectiveFile);
          setMetadata(bdfMetadata);
          setLoading(false);
          options?.onLoadingMessage?.('');

          const result = {
            ...bdfMetadata,
            effectiveFile,
            convertedFromBdf: true
          };

          console.log('[BDF][UI] Returning BDF result:', result.filename);
          return result;
        } catch (stateError) {
          console.error('[BDF][UI] Error setting state:', stateError);
          setError(`BDF load failed during state update: ${stateError}`);
          setLoading(false);
          options?.onLoadingMessage?.('');
          return null;
        }
      } else {
        // Handle EDF/FIF files (non-BDF)
        // Set file data in Python globals
      pyodide.globals.set('js_uint8_array', uint8Array);
      pyodide.globals.set('filename', effectiveFilename);
      
      // Convert JavaScript Uint8Array to Python bytes and read EDF
      const result = await pyodide.runPython(`
        # Convert JavaScript Uint8Array to Python bytes
        file_bytes = bytes(js_uint8_array)
        
        print(f"Converted to Python bytes: {len(file_bytes)} bytes, type: {type(file_bytes)}")
        
        read_edf_file(file_bytes, filename)
      `);
      
      const parsedResult = JSON.parse(result as string) as EDFMetadata & { error?: string };
      
      if (parsedResult.error) {
        setError(`Failed to read EDF file: ${parsedResult.error}`);
        return null;
      }
      
      setCurrentFile(effectiveFile ?? file);
      setMetadata(parsedResult);
      options?.onSuccess?.(`File loaded: ${parsedResult.filename} (${parsedResult.num_channels} channels, ${parsedResult.duration_seconds?.toFixed(1)}s)`);
      
      return {
        ...parsedResult,
        effectiveFile,
        convertedFromBdf: file.name.toLowerCase().endsWith('.bdf')
      };
      } // end else (EDF/FIF processing)

    } catch (err) {
      console.error('File processing error:', err);
      setError(`File processing failed: ${err}`);
      return null;
    } finally {
      setLoading(false);
      options?.onLoadingMessage?.('');
    }
  }, []);

  const clearFile = useCallback(() => {
    setCurrentFile(null);
    setMetadata(null);
    setError(null);
  }, []);

  return {
    currentFile,
    metadata,
    error,
    loading,
    loadFile,
    convertBdfToEdf,
    clearFile
  };
}

