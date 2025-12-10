/**
 * Type definitions for EDF Processor component
 */

export interface EDFMetadata {
  filename: string;
  file_size_mb: number;
  num_channels: number;
  channel_names: string[];
  duration_seconds: number;
  sampling_frequency: number;
  start_date?: string;
  start_time?: string;
  subject_id?: string;
  library_used?: string;
  real_data?: boolean;
  annotations?: EDFAnnotation[];
}

export interface EDFAnnotation {
  onset: number;        // Time in seconds from start
  duration: number;     // Duration in seconds
  description: string;  // Annotation text/title
  real_time?: string;   // Real-world timestamp
  id: string;          // Unique identifier
  is_custom?: boolean; // Whether this was added by user
}

export interface AnalysisResult {
  id?: string;
  analysis_type: string;
  plot_base64?: string;
  data?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  message?: string;
  success: boolean;
  error?: string;
  time_frame?: {
    start: number;
    end: number;
    start_real_time?: string;
    end_real_time?: string;
  };
}

export interface SSVEPResult {
  target_frequency: number;
  channels_analyzed: string[];
  ssvep_detection: Record<string, {
    snr_db: number;
    peak_power: number;
    detection_confidence: 'high' | 'medium' | 'low';
  }>;
  pca_analysis?: {
    explained_variance_ratio: number[];
    cumulative_variance: number[];
  };
  frequency_analysis: Record<string, {
    relative_power: Record<string, number>;
  }>;
  visualization_base64: string;
  summary: {
    best_channel: string;
    average_snr: number;
    high_confidence_channels: number;
    analysis_duration: string;
  };
}

export interface SSVEPParams {
  target_frequency: number;
  pca_components: number;
  frequency_bands: number[];
}

export interface AnalysisParams {
  raw_signal: {
    duration: number;
    start_time: number;
  };
  psd: {
    fmin: number;
    fmax: number;
    method: 'welch' | 'periodogram';
  };
  snr: {
    fmin: number;
    fmax: number;
    method: 'welch' | 'periodogram';
  };
  theta_beta_ratio: {
    theta_min: number;
    theta_max: number;
    beta_min: number;
    beta_max: number;
    method: 'welch' | 'periodogram';
  };
  time_frequency: {
    freq_min: number;
    freq_max: number;
    freq_points: number;
    time_points: number;
    selected_channel: number;
  };
}

export interface AdvancedPSDSettings {
  nperseg_seconds: number;
  noverlap_proportion: number;
  window: 'hann' | 'boxcar';
  use_db: boolean;
}

