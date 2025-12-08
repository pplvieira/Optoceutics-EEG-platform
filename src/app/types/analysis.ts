/**
 * Type definitions for analysis results
 */

export interface PSDResult {
  frequencies: number[];
  psd_values: number[];
  channel: string;
}

export interface SNRResult {
  frequencies: number[];
  snr_values: number[];
  channel: string;
  snr_db: number;
}

export interface SSVEPDetectionResult {
  peak_power: number;
  snr_db: number;
  target_frequency: number;
  detection_confidence: 'high' | 'medium' | 'low';
}

export interface PCAResult {
  n_components: number;
  explained_variance_ratio: number[];
  cumulative_variance: number[];
  component_loadings: number[][];
  channel_names: string[];
}

export interface FrequencyBandAnalysis {
  absolute_power: Record<string, number>;
  relative_power: Record<string, number>;
}

export interface ThetaBetaRatioResult {
  ratio: number;
  theta_power: number;
  beta_power: number;
  individual_ratios: number[];
  channels: string[];
}

export interface TimeFrequencyResult {
  freq_range: [number, number];
  channel: string;
  channel_index: number;
}

export type AnalysisType = 
  | 'raw_signal'
  | 'psd'
  | 'snr'
  | 'theta_beta_ratio'
  | 'time_frequency'
  | 'ssvep';

export interface AnalysisParameters {
  raw_signal?: {
    duration: number;
    start_time: number;
    channels?: number[];
  };
  psd?: {
    fmin: number;
    fmax: number;
    method: 'welch' | 'periodogram';
    nperseg_seconds?: number;
    noverlap_proportion?: number;
    window?: 'hann' | 'boxcar';
    use_db?: boolean;
  };
  snr?: {
    fmin: number;
    fmax: number;
    method: 'welch' | 'periodogram';
  };
  theta_beta_ratio?: {
    theta_min: number;
    theta_max: number;
    beta_min: number;
    beta_max: number;
    method: 'welch' | 'periodogram';
  };
  time_frequency?: {
    freq_min: number;
    freq_max: number;
    freq_points: number;
    time_points: number;
    selected_channel: number;
  };
  ssvep?: {
    target_frequency: number;
    pca_components: number;
    frequency_bands: number[];
  };
}

