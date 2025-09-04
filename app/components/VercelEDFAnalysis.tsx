'use client';

import React, { useState } from 'react';
import { EDFFile, AnalysisResult } from '../types/edf';

interface VercelEDFAnalysisProps {
  file: EDFFile;
  isDarkMode?: boolean;
}

export default function VercelEDFAnalysis({ file, isDarkMode = false }: VercelEDFAnalysisProps) {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  // Store file data for analysis (temporary, session-based)
  const [fileData, setFileData] = useState<string | null>(null);

  // Helper to convert File to base64 for serverless functions
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (uploadedFile: File) => {
    try {
      const base64Data = await fileToBase64(uploadedFile);
      setFileData(base64Data);
    } catch (error) {
      console.error('Failed to process file:', error);
    }
  };

  const performAnalysis = async (analysisType: string, parameters: Record<string, unknown> = {}) => {
    if (!fileData) {
      alert('Please upload a file first');
      return;
    }

    setLoading({ ...loading, [analysisType]: true });
    
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_data: fileData,
          analysis_type: analysisType,
          parameters
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysisResult({ type: analysisType, ...data });
      } else {
        const errorData = await response.json();
        console.error(`Failed to perform ${analysisType} analysis:`, errorData);
        alert(`Analysis failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Failed to perform ${analysisType} analysis:`, error);
      alert('Analysis failed. Please try again.');
    } finally {
      setLoading({ ...loading, [analysisType]: false });
    }
  };

  const plotRawSignal = async (duration = 10, startTime = 0, channels?: number[]) => {
    await performAnalysis('plot_raw', {
      duration,
      start_time: startTime,
      channels
    });
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
          {file.filename}
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

      {/* File Upload for Analysis */}
      {!fileData && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <h4 className={`text-md font-semibold mb-2 ${
            isDarkMode ? 'text-[var(--gold)]' : 'text-yellow-800'
          }`}>
            Upload File for Analysis
          </h4>
          <p className={`text-sm mb-3 ${
            isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-yellow-700'
          }`}>
            Please upload the EDF file again for serverless processing:
          </p>
          <input
            type="file"
            accept=".edf,.bdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`block w-full text-sm ${
              isDarkMode 
                ? 'text-[var(--dark-text)] file:bg-[var(--gold)] file:text-[var(--navy)]' 
                : 'text-gray-500 file:bg-blue-50 file:text-blue-700'
            } file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold hover:file:bg-blue-100`}
          />
        </div>
      )}

      {/* Analysis Controls */}
      {fileData && (
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => plotRawSignal()}
              disabled={loading.plot_raw}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-green-700 text-white hover:bg-green-600'
                  : 'bg-green-600 text-white hover:bg-green-700'
              } disabled:opacity-50`}
            >
              {loading.plot_raw ? 'Plotting...' : 'Plot Raw Signal'}
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
          </div>

          {/* Parameter Controls */}
          <div className={`p-4 rounded-lg border ${
            isDarkMode 
              ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <h4 className={`text-md font-semibold mb-3 ${
              isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
            }`}>
              Analysis Parameters
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${
                  isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
                }`}>
                  Plot Duration (s)
                </label>
                <input
                  type="number"
                  defaultValue={10}
                  min={1}
                  max={60}
                  className={`w-full px-3 py-2 rounded border ${
                    isDarkMode 
                      ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                      : 'bg-white border-gray-300'
                  }`}
                  id="plotDuration"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-1 ${
                  isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
                }`}>
                  Start Time (s)
                </label>
                <input
                  type="number"
                  defaultValue={0}
                  min={0}
                  className={`w-full px-3 py-2 rounded border ${
                    isDarkMode 
                      ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                      : 'bg-white border-gray-300'
                  }`}
                  id="startTime"
                />
              </div>
              
              <button
                onClick={() => {
                  const duration = (document.getElementById('plotDuration') as HTMLInputElement)?.value;
                  const startTime = (document.getElementById('startTime') as HTMLInputElement)?.value;
                  plotRawSignal(
                    duration ? parseFloat(duration) : 10,
                    startTime ? parseFloat(startTime) : 0
                  );
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-[var(--gold)] text-[var(--navy)] hover:bg-yellow-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Update Plot
              </button>
            </div>
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
            Analysis Results ({analysisResult.analysis_type?.toUpperCase() || analysisResult.type})
          </h4>
          
          {analysisResult.plot && (
            <div className="text-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${analysisResult.plot}`}
                alt={`${analysisResult.analysis_type || analysisResult.type} Analysis`}
                className="max-w-full h-auto rounded border mx-auto"
              />
            </div>
          )}
          
          {analysisResult.data && (
            <div className={`p-3 rounded border text-sm ${
              isDarkMode 
                ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text-secondary)]' 
                : 'bg-white border-gray-200 text-gray-600'
            }`}>
              <details>
                <summary className="cursor-pointer font-medium mb-2">
                  View Raw Data
                </summary>
                <pre className="text-xs overflow-auto max-h-64">
                  {JSON.stringify(analysisResult.data, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {analysisResult.parameters && (
            <div className={`mt-3 text-sm ${
              isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
            }`}>
              <strong>Parameters:</strong> {JSON.stringify(analysisResult.parameters)}
            </div>
          )}
        </div>
      )}

      {/* Session Info */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-tertiary)] border-[var(--dark-border)] text-[var(--gold)]' 
          : 'bg-green-50 border-green-200 text-green-800'
      }`}>
        <p className="text-sm">
          <strong>Serverless Processing:</strong> Your EDF file is processed using Vercel&apos;s Python functions. 
          Files are temporarily processed in memory and automatically deleted after analysis.
        </p>
      </div>
    </div>
  );
}