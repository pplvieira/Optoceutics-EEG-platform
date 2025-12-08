/**
 * EDF file reading service
 */

import type { PyodideInstance } from '../types/pyodide';
import type { EDFMetadata } from '../types/edfProcessor';

export interface EDFReadOptions {
  filename: string;
  fileBytes: Uint8Array;
}

export class EDFService {
  /**
   * Read EDF file metadata using Pyodide
   */
  async readEDFFile(
    pyodide: PyodideInstance,
    options: EDFReadOptions
  ): Promise<EDFMetadata> {
    // Set file data in Python globals
    pyodide.globals.set('js_uint8_array', options.fileBytes);
    pyodide.globals.set('filename', options.filename);

    // Execute Python EDF reading function
    const result = await pyodide.runPython(`
      file_bytes = bytes(js_uint8_array)
      read_edf_file(file_bytes, filename)
    `);

    const parsedResult = JSON.parse(result as string) as EDFMetadata & { error?: string };

    if (parsedResult.error) {
      throw new Error(`Failed to read EDF file: ${parsedResult.error}`);
    }

    return parsedResult;
  }

  /**
   * Validate EDF file
   */
  validateEDFFile(file: File): boolean {
    const validExtensions = ['.edf', '.bdf', '.fif'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return validExtensions.includes(extension);
  }

  /**
   * Read file as Uint8Array
   */
  async readFileAsBytes(file: File): Promise<Uint8Array> {
    const arrayBuffer = await file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

export const edfService = new EDFService();

