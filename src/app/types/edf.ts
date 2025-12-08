export interface EDFFile {
  id: string;
  filename: string;
  name: string;
  file_size_mb: number;
  uploaded_at: string;
  duration_seconds?: number;
  sampling_frequency?: number;
  num_channels?: number;
  channel_names?: string[];
  is_processed: boolean;
  processing_message?: string;
  raw_file_data?: string; // base64 encoded file for serverless processing
}

export interface AnalysisResult {
  type?: string;
  analysis_type?: string;
  plot?: string;
  data?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  error?: string;
  message?: string;
}