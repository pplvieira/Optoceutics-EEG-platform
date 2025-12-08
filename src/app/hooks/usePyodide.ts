/**
 * Custom hook for Pyodide initialization and management
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PyodideInstance, EDFLibrary } from '../types/pyodide';

interface UsePyodideReturn {
  pyodide: PyodideInstance | null;
  pyodideReady: boolean;
  pyodideLoading: boolean;
  loadingMessage: string;
  edfLibrary: EDFLibrary;
  initializePyodide: () => Promise<void>;
}

const PYODIDE_VERSION = 'v0.24.1';
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

export function usePyodide(): UsePyodideReturn {
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [edfLibrary, setEdfLibrary] = useState<EDFLibrary>(false);
  const pyodideRef = useRef<PyodideInstance | null>(null);

  const initializePyodide = useCallback(async () => {
    if (pyodideReady || pyodideLoading) return;

    setPyodideLoading(true);
    setLoadingMessage('Loading Python environment...');

    try {
      // Load Pyodide
      if (!window.loadPyodide) {
        // Load script if not already loaded
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${PYODIDE_CDN_URL}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Pyodide script'));
          document.head.appendChild(script);
        });
      }

      const pyodideInstance: PyodideInstance = await window.loadPyodide({
        indexURL: PYODIDE_CDN_URL
      });

      setLoadingMessage('Installing Python packages...');

      // Install required packages
      await pyodideInstance.loadPackage([
        'numpy',
        'scipy',
        'matplotlib',
        'scikit-learn',
        'micropip'
      ]);

      // Try to install EDF libraries
      setLoadingMessage('Installing EDF processing libraries...');
      let library: EDFLibrary = false;

      try {
        const micropip = pyodideInstance.pyimport('micropip') as {
          install: (packages: string[]) => Promise<void>;
        };

        // Try MNE first
        try {
          setLoadingMessage('Installing MNE-Python...');
          await micropip.install(['mne']);
          setLoadingMessage('MNE-Python installed successfully');
          library = 'mne';
        } catch {
          console.warn('MNE not available, trying pyedflib...');
          // Fallback to pyedflib
          try {
            setLoadingMessage('Installing pyedflib...');
            await micropip.install(['pyedflib']);
            setLoadingMessage('pyedflib installed successfully');
            library = 'pyedflib';
          } catch {
            console.warn('Neither MNE nor pyedflib available, using pure Python EDF reader');
            setLoadingMessage('Using built-in pure Python EDF reader');
            library = 'pure';
          }
        }
      } catch {
        console.warn('Package installation failed, using pure Python EDF reader');
        setLoadingMessage('Using built-in pure Python EDF reader');
        library = 'pure';
      }

      // Install custom resutil package
      try {
        setLoadingMessage('Installing resutil package...');
        const micropip = pyodideInstance.pyimport('micropip') as {
          install: (packages: string[]) => Promise<void>;
        };
        await micropip.install(['/pyodide-packages/resutil-0.4.0-py3-none-any.whl']);
        setLoadingMessage('resutil installed successfully');
        await pyodideInstance.runPython('import resutil');
        console.log('resutil package loaded successfully');
      } catch (error) {
        console.warn('Failed to install resutil package:', error);
      }

      setEdfLibrary(library);
      pyodideRef.current = pyodideInstance;
      setPyodide(pyodideInstance);
      setPyodideReady(true);
      setLoadingMessage('');

    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      setLoadingMessage('');
      throw error;
    } finally {
      setPyodideLoading(false);
    }
  }, [pyodideReady, pyodideLoading]);

  // Auto-initialize on mount
  useEffect(() => {
    initializePyodide().catch((error) => {
      console.error('Auto-initialization failed:', error);
    });
  }, []);

  return {
    pyodide: pyodideRef.current,
    pyodideReady,
    pyodideLoading,
    loadingMessage,
    edfLibrary,
    initializePyodide
  };
}

