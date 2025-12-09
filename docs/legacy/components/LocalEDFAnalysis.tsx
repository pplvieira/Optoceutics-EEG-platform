// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { EDFFile, AnalysisResult } from '../types/edf';

interface LocalEDFAnalysisProps {
  file: EDFFile;
  isDarkMode?: boolean;
}

const BACKEND_URL = 'http://localhost:8000';

export default function LocalEDFAnalysis({ file, isDarkMode = false }: LocalEDFAnalysisProps) {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  const performAnalysis = async (analysisType: string, parameters: Record<string, unknown> = {}) => {
    setLoading({ ...loading, [analysisType]: true });
    
    try {
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: file.id,
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
        alert(`Analysis failed: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Failed to perform ${analysisType} analysis:`, error);
      alert('Analysis failed. Please check that Python backend is running.');
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
        
        {file.channel_names && (
          <details className="mt-2">
            <summary className={`text-sm cursor-pointer ${
              isDarkMode ? 'text-[var(--gold)]' : 'text-blue-600'
            }`}>
              View Channel Names ({file.channel_names.length})
            </summary>
            <div className={`mt-1 text-xs ${
              isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-500'
            }`}>
              {file.channel_names.join(', ')}
            </div>
          </details>
        )}
      </div>

      {/* Analysis Controls */}
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

          <button
            onClick={() => performAnalysis('theta_beta_ratio')}
            disabled={loading.theta_beta_ratio}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDarkMode
                ? 'bg-blue-700 text-white hover:bg-blue-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {loading.theta_beta_ratio ? 'Computing...' : 'Theta-Beta Ratio'}
          </button>

          <button
            onClick={() => performAnalysis('time_frequency')}
            disabled={loading.time_frequency}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDarkMode
                ? 'bg-red-700 text-white hover:bg-red-600'
                : 'bg-red-600 text-white hover:bg-red-700'
            } disabled:opacity-50`}
          >
            {loading.time_frequency ? 'Computing...' : 'Time-Frequency'}
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
                max={Math.floor(file.duration_seconds || 60)}
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
                max={Math.floor((file.duration_seconds || 60) - 10)}
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

        {/* PSD Parameters */}
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Frequency Analysis Parameters
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Min Freq (Hz)
              </label>
              <input
                type="number"
                defaultValue={0.5}
                min={0.1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="fmin"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Max Freq (Hz)
              </label>
              <input
                type="number"
                defaultValue={50}
                min={1}
                max={Math.floor((file.sampling_frequency || 100) / 2)}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="fmax"
              />
            </div>
            
            <button
              onClick={() => {
                const fmin = (document.getElementById('fmin') as HTMLInputElement)?.value;
                const fmax = (document.getElementById('fmax') as HTMLInputElement)?.value;
                performAnalysis('psd', {
                  fmin: fmin ? parseFloat(fmin) : 0.5,
                  fmax: fmax ? parseFloat(fmax) : 60
                });
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-purple-700 text-white hover:bg-purple-600'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              Compute PSD
            </button>

            <button
              onClick={() => {
                const fmin = (document.getElementById('fmin') as HTMLInputElement)?.value;
                const fmax = (document.getElementById('fmax') as HTMLInputElement)?.value;
                performAnalysis('snr', {
                  fmin: fmin ? parseFloat(fmin) : 1,
                  fmax: fmax ? parseFloat(fmax) : 60
                });
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-orange-700 text-white hover:bg-orange-600'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
            >
              Compute SNR
            </button>
          </div>
        </div>

        {/* Theta-Beta Ratio Parameters */}
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Theta-Beta Ratio Parameters
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Theta Min (Hz)
              </label>
              <input
                type="number"
                defaultValue={4}
                min={0.1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="thetaMin"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Theta Max (Hz)
              </label>
              <input
                type="number"
                defaultValue={7}
                min={0.1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="thetaMax"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Beta Min (Hz)
              </label>
              <input
                type="number"
                defaultValue={13}
                min={1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="betaMin"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Beta Max (Hz)
              </label>
              <input
                type="number"
                defaultValue={30}
                min={1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="betaMax"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Method
              </label>
              <select
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="thetaBetaMethod"
                defaultValue="welch"
              >
                <option value="welch">Welch</option>
                <option value="periodogram">Periodogram</option>
              </select>
            </div>
            
            <button
              onClick={() => {
                const thetaMin = (document.getElementById('thetaMin') as HTMLInputElement)?.value;
                const thetaMax = (document.getElementById('thetaMax') as HTMLInputElement)?.value;
                const betaMin = (document.getElementById('betaMin') as HTMLInputElement)?.value;
                const betaMax = (document.getElementById('betaMax') as HTMLInputElement)?.value;
                const method = (document.getElementById('thetaBetaMethod') as HTMLSelectElement)?.value;
                performAnalysis('theta_beta_ratio', {
                  theta_min: thetaMin ? parseFloat(thetaMin) : 4,
                  theta_max: thetaMax ? parseFloat(thetaMax) : 7,
                  beta_min: betaMin ? parseFloat(betaMin) : 13,
                  beta_max: betaMax ? parseFloat(betaMax) : 30,
                  method: method || 'welch'
                });
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-blue-700 text-white hover:bg-blue-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Compute Ratio
            </button>
          </div>
        </div>

        {/* Time-Frequency Analysis Parameters */}
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Time-Frequency Analysis Parameters
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Min Freq (Hz)
              </label>
              <input
                type="number"
                defaultValue={1}
                min={0.1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="tfFreqMin"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Max Freq (Hz)
              </label>
              <input
                type="number"
                defaultValue={50}
                min={1}
                step={0.1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="tfFreqMax"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Freq Points
              </label>
              <input
                type="number"
                defaultValue={100}
                min={10}
                step={1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="tfFreqPoints"
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Time Points
              </label>
              <input
                type="number"
                defaultValue={200}
                min={10}
                step={1}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                    : 'bg-white border-gray-300'
                }`}
                id="tfTimePoints"
              />
            </div>
            
            <button
              onClick={() => {
                const freqMin = (document.getElementById('tfFreqMin') as HTMLInputElement)?.value;
                const freqMax = (document.getElementById('tfFreqMax') as HTMLInputElement)?.value;
                const freqPoints = (document.getElementById('tfFreqPoints') as HTMLInputElement)?.value;
                const timePoints = (document.getElementById('tfTimePoints') as HTMLInputElement)?.value;
                const duration = (document.getElementById('plotDuration') as HTMLInputElement)?.value;
                const startTime = (document.getElementById('startTime') as HTMLInputElement)?.value;
                
                performAnalysis('time_frequency', {
                  freq_min: freqMin ? parseFloat(freqMin) : 1,
                  freq_max: freqMax ? parseFloat(freqMax) : 50,
                  freq_points: freqPoints ? parseInt(freqPoints) : 100,
                  time_points: timePoints ? parseInt(timePoints) : 200,
                  duration: duration ? parseFloat(duration) : 10,
                  start_time: startTime ? parseFloat(startTime) : 0
                });
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-red-700 text-white hover:bg-red-600'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Compute Spectrogram
            </button>
          </div>
        </div>
      </div>

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
            Analysis Results ({analysisResult.analysis_type?.toUpperCase() || analysisResult.type?.toUpperCase()})
          </h4>
          
          {/* Display theta-beta ratio result if available */}
          {analysisResult.data && typeof analysisResult.data === 'object' && analysisResult.data !== null && 'ratio' in analysisResult.data && (
            <div className={`mb-4 p-3 rounded border ${
              isDarkMode 
                ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className={`text-lg font-bold ${
                isDarkMode ? 'text-[var(--gold)]' : 'text-blue-800'
              }`}>
                Theta/Beta Ratio: {typeof (analysisResult.data as Record<string, unknown>).ratio === 'number' ? ((analysisResult.data as Record<string, unknown>).ratio as number).toFixed(3) : String((analysisResult.data as Record<string, unknown>).ratio)}
              </div>
              {typeof (analysisResult.data as Record<string, unknown>).theta_power === 'number' && typeof (analysisResult.data as Record<string, unknown>).beta_power === 'number' && (
                <div className={`text-sm mt-1 ${
                  isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
                }`}>
                  Theta Power: {((analysisResult.data as Record<string, unknown>).theta_power as number).toFixed(3)} | 
                  Beta Power: {((analysisResult.data as Record<string, unknown>).beta_power as number).toFixed(3)}
                </div>
              )}
            </div>
          )}
          
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

      {/* Local Processing Info */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-tertiary)] border-[var(--dark-border)] text-[var(--gold)]' 
          : 'bg-green-50 border-green-200 text-green-800'
      }`}>
        <p className="text-sm">
          <strong>Local Python Processing:</strong> Analysis performed by your local Python backend 
          with full scientific computing capabilities (scipy, matplotlib, numpy). 
          Files remain on your machine.
        </p>
      </div>
    </div>
  );
}