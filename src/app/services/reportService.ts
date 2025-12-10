/**
 * Report Generation Service
 * 
 * This service handles patient report generation by:
 * 1. Preparing report data from analysis results
 * 2. Generating PDF/DOCX reports using the pdfExporter service
 * 3. Managing plot selection and ordering for multi-plot reports
 */

import type { PyodideInstance } from '../types/pyodide';
import { 
  generatePatientReportPDF, 
  generatePatientReportDOCX, 
  downloadPDF, 
  downloadDOCX,
  type PatientReportData 
} from './pdfExporter';

export interface AnalysisResult {
  id?: string;
  analysis_type: string;
  plot_base64?: string;
  parameters?: Record<string, unknown>;
  time_frame?: {
    start: number;
    end: number;
    start_real_time?: string;
    end_real_time?: string;
  };
}

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
  annotations?: Array<{
    onset: number;
    duration: number;
    description: string;
    real_time?: string;
    id: string;
    is_custom?: boolean;
  }>;
}

export interface ReportGenerationOptions {
  pyodide: PyodideInstance;
  metadata: EDFMetadata;
  currentFile: File;
  analysisResults: AnalysisResult[];
  selectedChannels: string[];
  annotations: Array<{
    onset: number;
    duration: number;
    description: string;
    real_time?: string;
    id: string;
    is_custom?: boolean;
  }>;
  plotSelectionOrder: string[];
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  onLoadingMessageChange?: (message: string) => void;
}

/**
 * Prepare report data from analysis results and metadata
 */
export function prepareReportData(
  metadata: EDFMetadata | null,
  currentFile: File | null,
  analysisResults: AnalysisResult[],
  selectedChannels: string[],
  annotations: Array<{
    onset: number;
    duration: number;
    description: string;
    real_time?: string;
    id: string;
    is_custom?: boolean;
  }>,
  plotSelectionOrder: string[]
): PatientReportData | null {
  if (!metadata || !currentFile) {
    return null;
  }

  // Build plots array from selection
  let plots: Array<{ plotBase64: string; caption: string; analysisType: string }> = [];
  let psdResult: AnalysisResult | null = null;

  if (plotSelectionOrder.length > 0) {
    // Multi-plot mode: use selected plots in custom order
    plots = plotSelectionOrder
      .map(plotId => {
        const result = analysisResults.find(r => r.id === plotId);
        if (!result || !result.plot_base64) return null;

        // Generate caption based on analysis type
        let caption = '';
        switch (result.analysis_type) {
          case 'psd':
            const psdFreqRange = result.parameters?.fmin && result.parameters?.fmax
              ? `${result.parameters.fmin}-${result.parameters.fmax} Hz`
              : '';
            caption = `Power Spectral Density Analysis ${psdFreqRange}`;
            break;
          case 'fooof':
            const fooofFreqRange = result.parameters?.freq_range;
            const fooofRange = Array.isArray(fooofFreqRange) && fooofFreqRange.length >= 2
              ? `${fooofFreqRange[0]}-${fooofFreqRange[1]} Hz`
              : '';
            caption = `FOOOF Spectral Parameterization ${fooofRange}`;
            break;
          case 'snr':
            caption = 'Signal-to-Noise Ratio Analysis';
            break;
          case 'ssvep':
            const targetFreq = result.parameters?.target_frequency || '40';
            caption = `SSVEP Analysis (Target: ${targetFreq} Hz)`;
            break;
          default:
            caption = `${result.analysis_type.toUpperCase()} Analysis`;
        }

        return {
          plotBase64: result.plot_base64,
          caption,
          analysisType: result.analysis_type
        };
      })
      .filter(plot => plot !== null) as Array<{ plotBase64: string; caption: string; analysisType: string }>;

    // Get first PSD result for legacy fields
    const psdResults = analysisResults.filter(r => r.analysis_type === 'psd');
    psdResult = psdResults.length > 0 ? psdResults[psdResults.length - 1] : null;
  } else {
    // Backward compatibility: if no plots selected, use last PSD
    const psdResults = analysisResults.filter(r => r.analysis_type === 'psd');
    psdResult = psdResults.length > 0 ? psdResults[psdResults.length - 1] : null;

    if (!psdResult) {
      return null;
    }

    // Single plot mode (legacy)
    plots = [{
      plotBase64: psdResult.plot_base64!,
      caption: 'Power Spectral Density Analysis',
      analysisType: 'psd'
    }];
  }

  // If no plots available, return null
  if (plots.length === 0 && !psdResult) {
    return null;
  }

  // Use first PSD or first available result for legacy fields
  const referenceResult = psdResult || analysisResults[0];

  return {
    // Patient information (can be extended to accept user input)
    patientName: 'Patient Name', // TODO: Add input fields for this
    patientId: metadata.subject_id || 'N/A',
    examDate: new Date().toISOString().split('T')[0],

    // File information
    fileName: currentFile.name,
    recordingDate: metadata.start_date && metadata.start_time
      ? `${metadata.start_date} ${metadata.start_time}`
      : 'N/A',
    duration: metadata.duration_seconds,
    samplingRate: metadata.sampling_frequency,
    numChannels: metadata.num_channels,
    channelNames: metadata.channel_names,

    // Analysis parameters
    selectedChannels: selectedChannels,
    timeFrame: referenceResult.time_frame ? {
      start: referenceResult.time_frame.start,
      end: referenceResult.time_frame.end,
      start_real_time: referenceResult.time_frame.start_real_time,
      end_real_time: referenceResult.time_frame.end_real_time,
    } : undefined,

    // PSD analysis results (legacy - for backward compatibility)
    psdMethod: (psdResult?.parameters?.method as 'welch' | 'periodogram' | undefined) || 'welch',
    frequencyRange: {
      min: (typeof psdResult?.parameters?.fmin === 'number' ? psdResult.parameters.fmin : 0.5),
      max: (typeof psdResult?.parameters?.fmax === 'number' ? psdResult.parameters.fmax : 50),
    },
    psdPlotBase64: psdResult?.plot_base64, // Legacy field

    // Multi-plot support (new)
    plots: plots,

    // Annotations
    annotations: annotations.map(ann => ({
      time: ann.onset,
      type: 'event',
      description: ann.description || 'N/A',
    })),
  };
}

/**
 * Generate and download a patient report PDF
 */
export async function generatePatientReportPDFFile(
  options: ReportGenerationOptions
): Promise<void> {
  const {
    pyodide,
    metadata,
    currentFile,
    analysisResults,
    selectedChannels,
    annotations,
    plotSelectionOrder,
    onError,
    onSuccess,
    onLoadingChange,
    onLoadingMessageChange
  } = options;

  if (!metadata || !currentFile) {
    onError?.('Cannot generate report: File not loaded');
    return;
  }

  const reportData = prepareReportData(
    metadata,
    currentFile,
    analysisResults,
    selectedChannels,
    annotations,
    plotSelectionOrder
  );

  if (!reportData) {
    onError?.('Please run PSD analysis first before generating the report');
    return;
  }

  onLoadingChange?.(true);
  onLoadingMessageChange?.('Generating patient report PDF...');

  try {
    // Generate PDF using Pyodide
    const pdfBase64 = await generatePatientReportPDF(pyodide, reportData);

    // Download the PDF
    const filename = `EEG_Report_${reportData.patientId}_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(pdfBase64, filename);

    onSuccess?.('Patient report PDF generated successfully!');
  } catch (error) {
    console.error('Report generation error:', error);
    onError?.(`Failed to generate PDF report: ${error}`);
  } finally {
    onLoadingChange?.(false);
    onLoadingMessageChange?.('');
  }
}

/**
 * Generate and download a patient report DOCX
 */
export async function generatePatientReportDOCXFile(
  options: ReportGenerationOptions
): Promise<void> {
  const {
    pyodide,
    metadata,
    currentFile,
    analysisResults,
    selectedChannels,
    annotations,
    plotSelectionOrder,
    onError,
    onSuccess,
    onLoadingChange,
    onLoadingMessageChange
  } = options;

  if (!metadata || !currentFile) {
    onError?.('Cannot generate report: File not loaded');
    return;
  }

  const reportData = prepareReportData(
    metadata,
    currentFile,
    analysisResults,
    selectedChannels,
    annotations,
    plotSelectionOrder
  );

  if (!reportData) {
    onError?.('Please run PSD analysis first before generating the report');
    return;
  }

  onLoadingChange?.(true);
  onLoadingMessageChange?.('Generating patient report DOCX...');

  try {
    // Generate DOCX using Pyodide
    const docxBase64 = await generatePatientReportDOCX(pyodide, reportData);

    // Download the DOCX
    const filename = `EEG_Report_${reportData.patientId}_${new Date().toISOString().split('T')[0]}.docx`;
    downloadDOCX(docxBase64, filename);

    onSuccess?.('Patient report DOCX generated successfully! You can convert it to PDF locally for perfect formatting.');
  } catch (error) {
    console.error('Report generation error:', error);
    onError?.(`Failed to generate DOCX report: ${error}`);
  } finally {
    onLoadingChange?.(false);
    onLoadingMessageChange?.('');
  }
}

