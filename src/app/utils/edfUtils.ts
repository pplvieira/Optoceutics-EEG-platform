/**
 * Utility functions for EDF file processing
 */

import type { EDFMetadata } from '../types/edfProcessor';

/**
 * Calculate real-world time for an annotation based on EDF file metadata
 */
export function calculateRealWorldTime(
  onset: number,
  metadata: EDFMetadata | null
): string | undefined {
  if (!metadata) {
    return undefined;
  }
  
  if (!metadata.start_date || !metadata.start_time) {
    return undefined;
  }
  
  try {
    // Handle different date/time formats
    let startDate: Date;
    
    // Try multiple formats
    const formatAttempts = [
      // ISO format
      `${metadata.start_date}T${metadata.start_time}`,
      // Space separated
      `${metadata.start_date} ${metadata.start_time}`,
      // Alternative formats
      metadata.start_date.includes('/') ? `${metadata.start_date} ${metadata.start_time}` : null,
    ].filter(Boolean);
    
    let dateCreated = false;
    for (const dateStr of formatAttempts) {
      try {
        startDate = new Date(dateStr as string);
        if (!isNaN(startDate.getTime())) {
          dateCreated = true;
          break;
        }
      } catch {
        // Continue to next format attempt
      }
    }
    
    if (!dateCreated || isNaN(startDate!.getTime())) {
      return undefined;
    }
    
    // Calculate annotation time using start_time + timedelta(seconds=onset)
    const annotationTime = new Date(startDate!.getTime() + onset * 1000);
    const result = annotationTime.toISOString().slice(0, 23).replace('T', ' ');
    return result;
  } catch (error) {
    console.error('Error calculating real-world time:', error);
    return undefined;
  }
}

/**
 * Format real-world time in HH:MM:SS format only
 */
export function formatTimeHMS(
  timeInSeconds: number,
  metadata: EDFMetadata | null
): string | undefined {
  const fullTime = calculateRealWorldTime(timeInSeconds, metadata);
  if (!fullTime) return undefined;
  
  // Extract HH:MM:SS from the full datetime string
  // Full format is "YYYY-MM-DD HH:MM:SS.mmm"
  const timePart = fullTime.split(' ')[1];
  if (timePart) {
    return timePart.slice(0, 8); // Get HH:MM:SS part
  }
  return undefined;
}

/**
 * Validate EDF/BDF file
 */
export function validateEDFFile(file: File): { valid: boolean; error?: string } {
  const validExtensions = ['.edf', '.bdf', '.fif'];
  const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(fileExtension)) {
    return {
      valid: false,
      error: `Invalid file type. Please upload an EDF, BDF, or FIF file.`
    };
  }
  
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty.'
    };
  }
  
  return { valid: true };
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs.toFixed(0)}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs.toFixed(0)}s`;
  }
}


