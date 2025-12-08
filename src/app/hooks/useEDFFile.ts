/**
 * Custom hook for EDF file reading and management
 */

import { useState, useCallback } from 'react';
import type { PyodideInstance } from '../types/pyodide';
import type { EDFMetadata, EDFAnnotation } from '../types/edfProcessor';

interface UseEDFFileReturn {
  currentFile: File | null;
  metadata: EDFMetadata | null;
  error: string | null;
  loading: boolean;
  loadFile: (file: File, pyodide: PyodideInstance) => Promise<void>;
  clearFile: () => void;
}

export function useEDFFile(): UseEDFFileReturn {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EDFMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFile = useCallback(async (file: File, pyodide: PyodideInstance) => {
    if (!file.name.toLowerCase().endsWith('.edf') && 
        !file.name.toLowerCase().endsWith('.fif') && 
        !file.name.toLowerCase().endsWith('.bdf')) {
      setError('Please select an EDF or BDF file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Read file as bytes
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Set file data in Python globals
      pyodide.globals.set('js_uint8_array', uint8Array);
      pyodide.globals.set('filename', file.name);
      
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
        return;
      }
      
      setCurrentFile(file);
      setMetadata(parsedResult);
      
    } catch (err) {
      console.error('File processing error:', err);
      setError(`File processing failed: ${err}`);
    } finally {
      setLoading(false);
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
    clearFile
  };
}

