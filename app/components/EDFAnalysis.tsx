'use client';

import React, { useState } from 'react';

interface EDFFile {
  id: string;
  name: string;
  file_size_mb: number;
  uploaded_at: string;
  duration_seconds?: number;
  sampling_frequency?: number;
  num_channels?: number;
  channel_names?: string[];
  is_processed: boolean;
}

interface EDFAnalysisProps {
  file: EDFFile;
  isDarkMode?: boolean;
}

export default function EDFAnalysis({ file, isDarkMode = false }: EDFAnalysisProps) {
  const [metadata, setMetadata] = useState<any>(null);
  const [rawPlot, setRawPlot] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  const loadMetadata = async () => {
    setLoading({ ...loading, metadata: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/metadata/`);
      if (response.ok) {
        const data = await response.json();
        setMetadata(data);
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setLoading({ ...loading, metadata: false });
    }
  };

  const plotRawSignal = async (duration = 10, startTime = 0, channels?: string[]) => {
    setLoading({ ...loading, plot: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/plot_raw/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration,
          start_time: startTime,
          channels
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setRawPlot(data.plot);
      }
    } catch (error) {
      console.error('Failed to plot signal:', error);
    } finally {
      setLoading({ ...loading, plot: false });
    }
  };

  const performAnalysis = async (analysisType: string, parameters: any = {}) => {
    setLoading({ ...loading, [analysisType]: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/analyze/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_type: analysisType,
          parameters
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalysisResult({ type: analysisType, ...data });
      }
    } catch (error) {
      console.error(`Failed to perform ${analysisType} analysis:`, error);
    } finally {
      setLoading({ ...loading, [analysisType]: false });
    }
  };

  return (
    <div className="space-y-6">
      {/* File Info Header */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
          : 'bg-blue-50 border-blue-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-2 ${
          isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
        }`}>
          {file.name}
        </h3>
        <div className={`text-sm space-x-4 ${
          isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
        }`}>
          <span>Size: {file.file_size_mb} MB</span>
          {file.duration_seconds && <span>Duration: {Math.round(file.duration_seconds)}s</span>}
          {file.sampling_frequency && <span>Fs: {file.sampling_frequency} Hz</span>}
          {file.num_channels && <span>Channels: {file.num_channels}</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={loadMetadata}
          disabled={loading.metadata}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDarkMode
              ? 'bg-[var(--gold)] text-[var(--navy)] hover:bg-yellow-500'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50`}
        >
          {loading.metadata ? 'Loading...' : 'Load Metadata'}
        </button>

        <button
          onClick={() => plotRawSignal()}
          disabled={loading.plot}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDarkMode
              ? 'bg-green-700 text-white hover:bg-green-600'
              : 'bg-green-600 text-white hover:bg-green-700'
          } disabled:opacity-50`}
        >
          {loading.plot ? 'Plotting...' : 'Plot Raw Signal'}
        </button>

        <button
          onClick={() => performAnalysis('psd')}
          disabled={loading.psd}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDarkMode
              ? 'bg-purple-700 text-white hover:bg-purple-600'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          } disabled:opacity-50`}
        >
          {loading.psd ? 'Computing...' : 'Power Spectral Density'}
        </button>

        <button
          onClick={() => performAnalysis('snr')}
          disabled={loading.snr}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDarkMode
              ? 'bg-orange-700 text-white hover:bg-orange-600'
              : 'bg-orange-600 text-white hover:bg-orange-700'
          } disabled:opacity-50`}
        >
          {loading.snr ? 'Computing...' : 'SNR Spectrum'}
        </button>

        <button
          onClick={() => performAnalysis('ica')}
          disabled={loading.ica}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDarkMode
              ? 'bg-red-700 text-white hover:bg-red-600'
              : 'bg-red-600 text-white hover:bg-red-700'
          } disabled:opacity-50`}
        >
          {loading.ica ? 'Computing...' : 'ICA Analysis'}
        </button>
      </div>

      {/* Metadata Display */}
      {metadata && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            File Metadata
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Subject ID:</strong> {metadata.subject_id || 'N/A'}
              </p>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Recording Date:</strong> {metadata.start_date || 'N/A'}
              </p>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Start Time:</strong> {metadata.start_time || 'N/A'}
              </p>
            </div>
            <div>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Duration:</strong> {metadata.duration_seconds ? `${Math.round(metadata.duration_seconds)}s` : 'N/A'}
              </p>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Sampling Frequency:</strong> {metadata.sampling_frequency ? `${metadata.sampling_frequency} Hz` : 'N/A'}
              </p>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
              }`}>
                <strong>Number of Channels:</strong> {metadata.num_channels || 'N/A'}
              </p>
            </div>
          </div>

          {metadata.channel_names && metadata.channel_names.length > 0 && (
            <div className="mt-4">
              <p className={`text-sm font-medium mb-2 ${
                isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-700'
              }`}>
                Channel Names:
              </p>
              <div className="flex flex-wrap gap-2">
                {metadata.channel_names.map((channel: string, index: number) => (
                  <span
                    key={index}
                    className={`px-2 py-1 rounded text-xs ${
                      isDarkMode 
                        ? 'bg-[var(--dark-card)] text-[var(--gold)] border border-[var(--dark-border)]' 
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {channel}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw Signal Plot */}
      {rawPlot && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Raw EEG Signal
          </h4>
          <div className="text-center">
            <img
              src={`data:image/png;base64,${rawPlot}`}
              alt="Raw EEG Signal"
              className="max-w-full h-auto rounded border"
            />
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Analysis Results ({analysisResult.type.toUpperCase()})
          </h4>
          
          {analysisResult.result?.plot && (
            <div className="text-center mb-4">
              <img
                src={`data:image/png;base64,${analysisResult.result.plot}`}
                alt={`${analysisResult.type} Analysis`}
                className="max-w-full h-auto rounded border"
              />
            </div>
          )}
          
          {analysisResult.result?.data && (
            <div className={`p-3 rounded border text-sm font-mono ${
              isDarkMode 
                ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text-secondary)]' 
                : 'bg-white border-gray-200 text-gray-600'
            }`}>
              <pre>{JSON.stringify(analysisResult.result.data, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}