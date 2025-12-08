/**
 * Error handling utilities
 */

export class EDFProcessingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EDFProcessingError';
    Object.setPrototypeOf(this, EDFProcessingError.prototype);
  }
}

export class PyodideError extends Error {
  constructor(
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PyodideError';
    Object.setPrototypeOf(this, PyodideError.prototype);
  }
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public analysisType: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AnalysisError';
    Object.setPrototypeOf(this, AnalysisError.prototype);
  }
}

/**
 * Centralized error handler
 */
export function handleError(error: unknown, context: string): {
  message: string;
  code?: string;
  details?: unknown;
} {
  console.error(`[${context}] Error:`, error);

  if (error instanceof EDFProcessingError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details
    };
  }

  if (error instanceof PyodideError) {
    return {
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof AnalysisError) {
    return {
      message: error.message,
      code: error.analysisType,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack
    };
  }

  return {
    message: 'An unknown error occurred',
    details: error
  };
}

/**
 * User-friendly error messages
 */
export function getUserFriendlyMessage(error: unknown): string {
  const handled = handleError(error, 'UserMessage');

  // Map technical errors to user-friendly messages
  if (handled.code === 'FILE_TOO_LARGE') {
    return 'The file is too large to process. Please try a smaller file.';
  }

  if (handled.code === 'INVALID_FORMAT') {
    return 'Invalid file format. Please upload an EDF or BDF file.';
  }

  if (handled.message.includes('Pyodide')) {
    return 'Failed to load Python environment. Please refresh the page and try again.';
  }

  if (handled.message.includes('EDF')) {
    return 'Failed to read EDF file. Please check that the file is not corrupted.';
  }

  return handled.message || 'An error occurred. Please try again.';
}

