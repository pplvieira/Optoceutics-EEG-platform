/**
 * Test utilities and helpers
 */

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';

/**
 * Custom render function with providers
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { ...options });
}

/**
 * Mock Pyodide instance for testing
 */
export function createMockPyodide() {
  return {
    runPython: jest.fn().mockResolvedValue('{}'),
    runPythonAsync: jest.fn().mockResolvedValue('{}'),
    loadPackage: jest.fn().mockResolvedValue(undefined),
    pyimport: jest.fn().mockReturnValue({}),
    globals: {
      set: jest.fn(),
      get: jest.fn().mockReturnValue(null),
    },
  };
}

/**
 * Mock EDF file for testing
 */
export function createMockEDFFile(): File {
  const blob = new Blob(['mock edf content'], { type: 'application/octet-stream' });
  return new File([blob], 'test.edf', { type: 'application/octet-stream' });
}

/**
 * Mock EDF metadata
 */
export const mockEDFMetadata = {
  filename: 'test.edf',
  file_size_mb: 1.5,
  num_channels: 32,
  channel_names: ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2'],
  duration_seconds: 3600,
  sampling_frequency: 256,
  start_date: '2024-01-01',
  start_time: '10:00:00',
  subject_id: 'TEST001',
  library_used: 'MNE-Python',
  real_data: true,
  annotations: [],
};

