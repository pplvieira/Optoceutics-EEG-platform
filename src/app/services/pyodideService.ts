/**
 * Pyodide service for Python execution
 */

import type { PyodideInstance } from '../types/pyodide';

const PYODIDE_SETUP_CODE = `
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
from scipy import signal
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import io
import base64
import json
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# EDF library detection
MNE_AVAILABLE = False
PYEDFLIB_AVAILABLE = False
EDF_LIBRARY = 'pure'

try:
    import mne
    MNE_AVAILABLE = True
    EDF_LIBRARY = 'mne'
    print("MNE-Python available for EDF processing")
except ImportError:
    try:
        import pyedflib
        PYEDFLIB_AVAILABLE = True
        EDF_LIBRARY = 'pyedflib'
        print("pyedflib available for EDF processing")
    except ImportError:
        print("Using pure Python EDF reader")

# Global variables
current_edf_data = None
current_metadata = None
`;

export class PyodideService {
  private pyodide: PyodideInstance | null = null;
  private initialized = false;

  async initialize(pyodideInstance: PyodideInstance): Promise<void> {
    if (this.initialized && this.pyodide) {
      return;
    }

    this.pyodide = pyodideInstance;
    
    // Setup Python environment
    await pyodideInstance.runPython(PYODIDE_SETUP_CODE);
    
    this.initialized = true;
  }

  getInstance(): PyodideInstance | null {
    return this.pyodide;
  }

  async runPython(code: string): Promise<unknown> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }
    return this.pyodide.runPython(code);
  }

  async runPythonAsync(code: string): Promise<unknown> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }
    return this.pyodide.runPythonAsync(code);
  }

  setGlobal(key: string, value: unknown): void {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }
    this.pyodide.globals.set(key, value);
  }

  getGlobal(key: string): unknown {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }
    return this.pyodide.globals.get(key);
  }
}

export const pyodideService = new PyodideService();

