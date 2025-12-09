/**
 * Type definitions for Pyodide integration
 */

export interface PyodideInstance {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (packages: string[]) => Promise<void>;
  pyimport: (module: string) => unknown;
  FS?: {
    writeFile: (path: string, data: Uint8Array) => void;
  };
  toPy: (value: unknown) => unknown;
  globals: {
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
  };
}

export interface PyodideConfig {
  indexURL?: string;
}

declare global {
  interface Window {
    loadPyodide: (config?: PyodideConfig) => Promise<PyodideInstance>;
    pyodide?: PyodideInstance;
  }
}

export type EDFLibrary = 'mne' | 'pyedflib' | 'pure' | false;

