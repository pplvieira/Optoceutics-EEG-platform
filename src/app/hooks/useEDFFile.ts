/**
 * Custom hook for EDF file reading and management
 * Supports EDF, BDF, and FIF files with BDF conversion
 */

import { useState, useCallback } from 'react';
import type { PyodideInstance } from '../types/pyodide';
import type { EDFMetadata } from '../types/edfProcessor';

export interface LoadFileOptions {
  convertBdf?: boolean; // Whether to convert BDF to EDF (default: prompt user)
  onBdfConversionPrompt?: () => Promise<boolean>; // Custom prompt function
  onLoadingMessage?: (message: string) => void; // Loading message callback
  onSuccess?: (message: string) => void; // Success message callback
}

interface UseEDFFileReturn {
  currentFile: File | null;
  metadata: EDFMetadata | null;
  error: string | null;
  loading: boolean;
  loadFile: (file: File, pyodide: PyodideInstance, options?: LoadFileOptions) => Promise<EDFMetadata | null>;
  convertBdfToEdf: (fileName: string, fileBytes: Uint8Array, pyodide: PyodideInstance) => Promise<{ success: boolean; data?: string; error?: string }>;
  clearFile: () => void;
}

export function useEDFFile(): UseEDFFileReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EDFMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const convertBdfToEdf = useCallback(async (
    fileName: string,
    fileBytes: Uint8Array,
    pyodide: PyodideInstance
  ): Promise<{ success: boolean; data?: string; error?: string }> => {
    try {
      pyodide.globals.set('js_bdf_bytes', fileBytes);
      pyodide.globals.set('js_bdf_name', fileName);

      const conversionResult = await pyodide.runPythonAsync(`
import base64, json, tempfile, os

result = {'success': False, 'error': 'Unknown'}
try:
    import mne
    have_mne = True
except Exception as e:
    have_mne = False
    result = {'success': False, 'error': f'MNE not available: {e}'}

if have_mne:
    src_path = None
    dest_path = None
    try:
        bdf_bytes = bytes(js_bdf_bytes)
        # write input
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bdf") as tmp:
            tmp.write(bdf_bytes)
            src_path = tmp.name

        raw = mne.io.read_raw_bdf(src_path, preload=True, verbose=False)

        # add annotations if missing
        if len(raw.annotations) == 0:
            try:
                events = mne.find_events(raw, verbose=False)
                annot = mne.annotations_from_events(events, sfreq=raw.info['sfreq'])
                raw.set_annotations(annot)
            except Exception:
                pass

        # drop problematic channels
        for ch in ['Status', 'TimeStamp']:
            if ch in raw.ch_names:
                raw.drop_channels([ch])

        raw_new_ref = raw.copy()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".edf") as out_f:
            dest_path = out_f.name

        mne.export.export_raw(dest_path, raw_new_ref, fmt='edf', overwrite=True)

        with open(dest_path, 'rb') as f:
            edf_bytes = f.read()

        result = {
            'success': True,
            'data': base64.b64encode(edf_bytes).decode('utf-8'),
            'filename': os.path.basename(dest_path)
        }
    except Exception as e:
        result = {'success': False, 'error': str(e)}
    finally:
        try:
            if src_path and os.path.exists(src_path):
                os.unlink(src_path)
        except Exception:
            pass
        try:
            if dest_path and os.path.exists(dest_path):
                os.unlink(dest_path)
        except Exception:
            pass

json.dumps(result)
      `);

      const parsed = JSON.parse(conversionResult as string);
      return parsed;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }, []);

  const loadFile = useCallback(async (
    file: File,
    pyodide: PyodideInstance,
    options?: LoadFileOptions
  ): Promise<EDFMetadata | null> => {
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
      // Read file as bytes
      const arrayBuffer = await file.arrayBuffer();
      let uint8Array = new Uint8Array(arrayBuffer);
      let effectiveFilename = file.name;

      // Handle BDF conversion
      if (file.name.toLowerCase().endsWith('.bdf')) {
        let shouldConvert = options?.convertBdf;
        
        if (shouldConvert === undefined) {
          // Prompt user if no option provided
          if (options?.onBdfConversionPrompt) {
            shouldConvert = await options.onBdfConversionPrompt();
          } else {
            shouldConvert = window.confirm(
              'You uploaded a BDF file. We will drop Status/TimeStamp channels and convert it to EDF before analysis. Proceed?'
            );
          }
        }

        if (!shouldConvert) {
          setLoading(false);
          options?.onLoadingMessage?.('');
          return null;
        }

        options?.onLoadingMessage?.('Converting BDF to EDF (dropping Status/TimeStamp)...');
        const conversion = await convertBdfToEdf(file.name, uint8Array, pyodide);
        
        if (conversion?.success && conversion.data) {
          const binary = atob(conversion.data);
          const convertedBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            convertedBytes[i] = binary.charCodeAt(i);
          }
          uint8Array = convertedBytes;
          effectiveFilename = file.name.replace(/\.bdf$/i, '.edf');
          options?.onSuccess?.('BDF converted to EDF successfully.');
        } else {
          setError(`BDF conversion failed: ${conversion?.error || 'unknown error'}`);
          setLoading(false);
          options?.onLoadingMessage?.('');
          return null;
        }
      }
      
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
      
      const parsedResult = JSON.parse(result as string);
      
      if (parsedResult.error) {
        setError(`Failed to read EDF file: ${parsedResult.error}`);
        return null;
      }
      
      setCurrentFile(file);
      setMetadata(parsedResult);
      options?.onSuccess?.(`File loaded: ${parsedResult.filename} (${parsedResult.num_channels} channels, ${parsedResult.duration_seconds?.toFixed(1)}s)`);
      
      return parsedResult;
      
    } catch (err) {
      console.error('File processing error:', err);
      setError(`File processing failed: ${err}`);
      return null;
    } finally {
      setLoading(false);
      options?.onLoadingMessage?.('');
    }
  }, [convertBdfToEdf]);

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

