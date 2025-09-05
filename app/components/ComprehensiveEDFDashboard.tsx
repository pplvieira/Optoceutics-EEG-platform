'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

interface EDFMetadata {
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
}

interface AnalysisResult {
  plot?: string;
  data?: Record<string, any>;
  parameters?: Record<string, any>;
  analysis_type: string;
  message?: string;
  [key: string]: any;
}

interface SSVEPAnalysisResult {
  target_frequency: number;
  channels_analyzed: string[];
  sample_rate: number;
  analysis_timestamp: string;
  ssvep_detection: Record<string, {
    peak_power: number;
    snr_db: number;
    target_frequency: number;
    detection_confidence: 'high' | 'medium' | 'low';
  }>;
  pca_analysis?: {
    n_components: number;
    explained_variance_ratio: number[];
    cumulative_variance: number[];
    component_loadings: number[][];
    channel_names: string[];
  };
  frequency_analysis: Record<string, {
    absolute_power: Record<string, number>;
    relative_power: Record<string, number>;
  }>;
  snr_analysis: Record<string, {
    signal_power: number;
    noise_power: number;
    snr_linear: number;
    snr_db: number;
  }>;
  visualization: string;
}

const API_BASE_URL = 'http://localhost:8000';

export default function ComprehensiveEDFDashboard() {
  const [currentFile, setCurrentFile] = useState<EDFMetadata | null>(null);
  const [channels, setChannels] = useState<{channel_names: string[], num_channels: number, sampling_frequency: number} | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [ssvepResults, setSSVEPResults] = useState<SSVEPAnalysisResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis parameters state
  const [rawSignalParams, setRawSignalParams] = useState({
    duration: 10,
    start_time: 0,
    channels: []
  });
  
  const [psdParams, setPSDParams] = useState({
    fmin: 0.5,
    fmax: 50,
    channels: []
  });
  
  const [ssvepParams, setSSVEPParams] = useState({
    target_frequency: 40.0,
    frequency_bands: [8, 12, 30, 100],
    channels: null as string[] | null,
    pca_components: 5
  });

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.edf') && !file.name.toLowerCase().endsWith('.bdf')) {
      setError('Please select an EDF or BDF file');
      return;
    }

    setIsUploading(true);
    clearMessages();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post<EDFMetadata>(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minutes timeout for large files
      });

      setCurrentFile(response.data);
      setSuccess(`File uploaded successfully: ${response.data.filename}`);
      
      // Get channel information
      const channelsResponse = await axios.get(`${API_BASE_URL}/channels/${response.data.id}`);
      setChannels(channelsResponse.data);
      
      // Reset analysis results
      setAnalysisResults([]);
      setSSVEPResults(null);

    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Upload failed';
      setError(errorMessage);
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const performAnalysis = async (analysisType: string, parameters: any) => {
    if (!currentFile) {
      setError('Please upload a file first');
      return;
    }

    setIsAnalyzing(true);
    clearMessages();

    try {
      const response = await axios.post<AnalysisResult>(`${API_BASE_URL}/analyze`, {
        file_id: currentFile.id,
        analysis_type: analysisType,
        parameters
      }, {
        timeout: 300000 // 5 minutes for complex analysis
      });

      setAnalysisResults(prev => [...prev, response.data]);
      setSuccess(`${analysisType} analysis completed successfully`);
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Analysis failed';
      setError(errorMessage);
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const performSSVEPAnalysis = async () => {
    if (!currentFile) {
      setError('Please upload a file first');
      return;
    }

    setIsAnalyzing(true);
    clearMessages();

    try {
      const response = await axios.post<SSVEPAnalysisResult>(`${API_BASE_URL}/analyze-ssvep`, {
        file_id: currentFile.id,
        target_frequency: ssvepParams.target_frequency,
        frequency_bands: ssvepParams.frequency_bands,
        channels: ssvepParams.channels,
        pca_components: ssvepParams.pca_components
      }, {
        timeout: 600000 // 10 minutes for comprehensive SSVEP analysis
      });

      setSSVEPResults(response.data);
      setSuccess('SSVEP analysis completed successfully');
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'SSVEP analysis failed';
      setError(errorMessage);
      console.error('SSVEP analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteFile = async () => {
    if (!currentFile) return;

    try {
      await axios.delete(`${API_BASE_URL}/files/${currentFile.id}`);
      setCurrentFile(null);
      setChannels(null);
      setAnalysisResults([]);
      setSSVEPResults(null);
      setSuccess('File deleted successfully');
    } catch (err: any) {
      setError('Failed to delete file');
    }
  };

  const renderChannelSelector = (selectedChannels: any, setSelectedChannels: (channels: any) => void, multiple: boolean = true) => {
    if (!channels) return null;

    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Channels {multiple ? '(multiple)' : ''}:
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto border border-gray-300 rounded p-2">
          {channels.channel_names.map((channel, idx) => (
            <label key={channel} className="flex items-center space-x-2">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={multiple ? undefined : "single-channel"}
                checked={multiple ? selectedChannels.includes(idx) : selectedChannels === idx}
                onChange={(e) => {
                  if (multiple) {
                    if (e.target.checked) {
                      setSelectedChannels([...selectedChannels, idx]);
                    } else {
                      setSelectedChannels(selectedChannels.filter((ch: number) => ch !== idx));
                    }
                  } else {
                    setSelectedChannels(idx);
                  }
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">{channel}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderSSVEPResults = () => {
    if (!ssvepResults) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">SSVEP Analysis Results</h3>
        
        {/* Comprehensive visualization */}
        <div className="mb-6">
          <img 
            src={`data:image/png;base64,${ssvepResults.visualization}`} 
            alt="SSVEP Comprehensive Analysis"
            className="w-full max-w-4xl mx-auto"
          />
        </div>

        {/* Key Metrics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Target Frequency</h4>
            <p className="text-2xl font-bold text-blue-700">{ssvepResults.target_frequency} Hz</p>
            <p className="text-sm text-blue-600">{ssvepResults.channels_analyzed.length} channels analyzed</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-2">Best Channel</h4>
            <p className="text-lg font-bold text-green-700">
              {Object.keys(ssvepResults.ssvep_detection).reduce((best, current) => 
                ssvepResults.ssvep_detection[current].snr_db > ssvepResults.ssvep_detection[best].snr_db ? current : best
              )}
            </p>
            <p className="text-sm text-green-600">
              SNR: {Math.max(...Object.values(ssvepResults.ssvep_detection).map(d => d.snr_db)).toFixed(2)} dB
            </p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="font-semibold text-purple-900 mb-2">Detection Quality</h4>
            <div className="text-sm text-purple-600">
              <p>High: {Object.values(ssvepResults.ssvep_detection).filter(d => d.detection_confidence === 'high').length}</p>
              <p>Medium: {Object.values(ssvepResults.ssvep_detection).filter(d => d.detection_confidence === 'medium').length}</p>
              <p>Low: {Object.values(ssvepResults.ssvep_detection).filter(d => d.detection_confidence === 'low').length}</p>
            </div>
          </div>
        </div>

        {/* Detailed Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Channel-by-Channel Results */}
          <div>
            <h4 className="font-semibold mb-3">SSVEP Detection by Channel</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SNR (dB)</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ssvepResults.ssvep_detection).map(([channel, data]) => (
                    <tr key={channel} className="border-t border-gray-200">
                      <td className="px-4 py-2 text-sm font-medium">{channel}</td>
                      <td className="px-4 py-2 text-sm">{data.snr_db.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          data.detection_confidence === 'high' ? 'bg-green-100 text-green-800' :
                          data.detection_confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {data.detection_confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PCA Results */}
          {ssvepResults.pca_analysis && (
            <div>
              <h4 className="font-semibold mb-3">PCA Analysis</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm mb-2">
                  <strong>Components:</strong> {ssvepResults.pca_analysis.n_components}
                </p>
                <p className="text-sm mb-2">
                  <strong>Total Variance Explained:</strong> {
                    (ssvepResults.pca_analysis.cumulative_variance[ssvepResults.pca_analysis.cumulative_variance.length - 1] * 100).toFixed(1)
                  }%
                </p>
                <div className="mt-3">
                  <h5 className="text-sm font-medium mb-2">Variance by Component:</h5>
                  {ssvepResults.pca_analysis.explained_variance_ratio.map((variance, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-1">
                      <span>PC{idx + 1}:</span>
                      <span>{(variance * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-3xl font-bold text-center mb-8">
            Comprehensive EEG/EDF Analysis Platform
          </h1>

          {/* Upload Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Upload EDF File</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".edf,.bdf"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Choose EDF/BDF File'}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Support for files up to 100MB. EDF and BDF formats accepted.
              </p>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              {success}
            </div>
          )}

          {/* File Information */}
          {currentFile && (
            <div className="bg-blue-50 rounded-lg p-6 mb-8">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">Current File: {currentFile.filename}</h3>
                <button
                  onClick={deleteFile}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                >
                  Delete File
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Size:</span> {currentFile.file_size_mb.toFixed(2)} MB
                </div>
                <div>
                  <span className="font-medium">Channels:</span> {currentFile.num_channels}
                </div>
                <div>
                  <span className="font-medium">Duration:</span> {currentFile.duration_seconds?.toFixed(1)}s
                </div>
                <div>
                  <span className="font-medium">Sample Rate:</span> {currentFile.sampling_frequency}Hz
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Controls */}
        {currentFile && channels && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-6">Analysis Tools</h2>

            {/* SSVEP Analysis Section */}
            <div className="border-b pb-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">🎯 Comprehensive SSVEP Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Frequency (Hz):</label>
                  <input
                    type="number"
                    value={ssvepParams.target_frequency}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, target_frequency: parseFloat(e.target.value) }))}
                    step="0.1"
                    min="1"
                    max="100"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PCA Components:</label>
                  <input
                    type="number"
                    value={ssvepParams.pca_components}
                    onChange={(e) => setSSVEPParams(prev => ({ ...prev, pca_components: parseInt(e.target.value) }))}
                    min="1"
                    max="20"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={performSSVEPAnalysis}
                  disabled={isAnalyzing}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Run SSVEP Analysis'}
                </button>
                <p className="text-sm text-gray-600 mt-2">
                  Comprehensive analysis including 40Hz detection, PCA, SNR calculation, and frequency band analysis
                </p>
              </div>
            </div>

            {/* Traditional Analysis Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Raw Signal Plot */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📈 Raw Signal Plot</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Duration (s):</label>
                  <input
                    type="number"
                    value={rawSignalParams.duration}
                    onChange={(e) => setRawSignalParams(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                    min="1"
                    max="60"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Start Time (s):</label>
                  <input
                    type="number"
                    value={rawSignalParams.start_time}
                    onChange={(e) => setRawSignalParams(prev => ({ ...prev, start_time: parseInt(e.target.value) }))}
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <button
                  onClick={() => performAnalysis('plot_raw', rawSignalParams)}
                  disabled={isAnalyzing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded disabled:opacity-50"
                >
                  Plot Raw Signal
                </button>
              </div>

              {/* PSD Analysis */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">🌊 Power Spectral Density</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                  <input
                    type="number"
                    value={psdParams.fmin}
                    onChange={(e) => setPSDParams(prev => ({ ...prev, fmin: parseFloat(e.target.value) }))}
                    step="0.1"
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                  <input
                    type="number"
                    value={psdParams.fmax}
                    onChange={(e) => setPSDParams(prev => ({ ...prev, fmax: parseFloat(e.target.value) }))}
                    step="0.1"
                    min="1"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <button
                  onClick={() => performAnalysis('psd', psdParams)}
                  disabled={isAnalyzing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
                >
                  Compute PSD
                </button>
              </div>

              {/* SNR Analysis */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">📊 Signal-to-Noise Ratio</h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                  <input
                    type="number"
                    value="1"
                    min="0"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                  <input
                    type="number"
                    value="40"
                    min="1"
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                <button
                  onClick={() => performAnalysis('snr', { fmin: 1, fmax: 40, channels: [0] })}
                  disabled={isAnalyzing}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded disabled:opacity-50"
                >
                  Compute SNR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SSVEP Results */}
        {ssvepResults && renderSSVEPResults()}

        {/* Traditional Analysis Results */}
        {analysisResults.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold mb-4">Analysis Results</h3>
            
            {analysisResults.map((result, index) => (
              <div key={index} className="mb-8 border-b pb-8 last:border-b-0 last:pb-0">
                <h4 className="text-lg font-semibold mb-4 capitalize">
                  {result.analysis_type.replace('_', ' ')} Analysis
                </h4>
                
                {result.plot && (
                  <div className="mb-4">
                    <img 
                      src={`data:image/png;base64,${result.plot}`} 
                      alt={`${result.analysis_type} plot`}
                      className="w-full max-w-4xl mx-auto"
                    />
                  </div>
                )}
                
                {result.message && (
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    {result.message}
                  </p>
                )}
                
                {result.parameters && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      Analysis Parameters
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                      {JSON.stringify(result.parameters, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Local Python backend integration with comprehensive EEG/SSVEP analysis capabilities</p>
          <p>Supports files up to 100MB • Real-time analysis • No cloud dependencies</p>
        </div>
      </div>
    </div>
  );
}