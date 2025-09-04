// API configuration for EDF backend

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? process.env.NEXT_PUBLIC_API_URL || 'https://your-railway-backend.railway.app'
  : 'http://localhost:8000';

export const API_ENDPOINTS = {
  edfFiles: `${API_BASE_URL}/api/edf-files/`,
  upload: `${API_BASE_URL}/api/edf-files/upload/`,
  sessions: `${API_BASE_URL}/api/sessions/`,
  analysisResults: `${API_BASE_URL}/api/analysis-results/`,
};

// Helper function to construct full API URLs
export function getApiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint}`;
}

// Function to get file-specific endpoints
export function getFileEndpoints(fileId: string) {
  return {
    metadata: `${API_BASE_URL}/api/edf-files/${fileId}/metadata/`,
    plotRaw: `${API_BASE_URL}/api/edf-files/${fileId}/plot_raw/`,
    analyze: `${API_BASE_URL}/api/edf-files/${fileId}/analyze/`,
    processSignal: `${API_BASE_URL}/api/edf-files/${fileId}/process_signal/`,
    downloadProcessed: `${API_BASE_URL}/api/edf-files/${fileId}/download_processed/`,
  };
}