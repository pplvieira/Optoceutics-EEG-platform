/**
 * Component for analysis parameter controls
 */

'use client';

import React, { useState } from 'react';
import type { AnalysisParameters } from '../../types/analysis';

type SSVEPParams = {
  target_frequency: number;
  pca_components: number;
  frequency_bands: number[];
};

type AdvancedPSDSettings = {
  nperseg_seconds: number;
  noverlap_proportion: number;
  window: 'hann' | 'boxcar';
  use_db: boolean;
};

interface AnalysisControlsProps {
  ssvepParams: SSVEPParams;
  analysisParams: AnalysisParameters;
  advancedPSDSettings: AdvancedPSDSettings;
  isAnalyzing: boolean;
  onSSVEPParamsChange: (params: SSVEPParams) => void;
  onAnalysisParamsChange: (params: AnalysisParameters) => void;
  onAdvancedPSDSettingsChange: (settings: AdvancedPSDSettings) => void;
  onRunSSVEP: () => void;
  onRunAnalysis: (type: string) => void;
}

export default function AnalysisControls({
  ssvepParams,
  analysisParams,
  advancedPSDSettings,
  isAnalyzing,
  onSSVEPParamsChange,
  onAnalysisParamsChange,
  onAdvancedPSDSettingsChange,
  onRunSSVEP,
  onRunAnalysis
}: AnalysisControlsProps) {
  const [showAdvancedPSDSettings, setShowAdvancedPSDSettings] = useState(false);

  const baseRaw = analysisParams.raw_signal ?? { duration: 10, start_time: 0 };
  const basePsd = analysisParams.psd ?? { fmin: 0.5, fmax: 50, method: 'welch' as const };
  const baseSnr = analysisParams.snr ?? { fmin: 0.5, fmax: 50, method: 'welch' as const };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-6">Analysis Tools</h2>

      {/* SSVEP Analysis */}
      <div className="border-b pb-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">🎯 Comprehensive SSVEP Analysis</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Frequency (Hz):</label>
            <input
              type="number"
              value={ssvepParams.target_frequency}
              onChange={(e) => onSSVEPParamsChange({ ...ssvepParams, target_frequency: parseFloat(e.target.value) })}
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
              onChange={(e) => onSSVEPParamsChange({ ...ssvepParams, pca_components: parseInt(e.target.value) })}
              min="1"
              max="20"
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onRunSSVEP}
              disabled={isAnalyzing}
              className="w-full bg-brand-navy hover:opacity-90 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center justify-center"
            >
              {isAnalyzing && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              )}
              {isAnalyzing ? 'Analyzing...' : 'Run SSVEP Analysis'}
            </button>
          </div>
        </div>
        
        <p className="text-sm text-gray-600">
          Comprehensive SSVEP analysis including 40Hz detection, PCA, SNR calculation, and frequency band analysis
        </p>
      </div>

      {/* Traditional Analysis Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Raw Signal */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold mb-3">📈 Raw Signal Plot</h4>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Duration (s):</label>
            <input
              type="number"
              value={baseRaw.duration || 10}
              onChange={(e) => onAnalysisParamsChange({
                ...analysisParams,
                raw_signal: { ...baseRaw, duration: parseFloat(e.target.value) }
              })}
              min="0.1"
              step="0.1"
              className="w-full p-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Start Time (s):</label>
            <input
              type="number"
              value={baseRaw.start_time || 0}
              onChange={(e) => onAnalysisParamsChange({
                ...analysisParams,
                raw_signal: { ...baseRaw, start_time: parseInt(e.target.value) }
              })}
              min="0"
              className="w-full p-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            onClick={() => onRunAnalysis('raw_signal')}
            disabled={isAnalyzing}
            className="w-full bg-brand-green hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
          >
            {isAnalyzing && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
            )}
            Plot Raw Signal
          </button>
        </div>

        {/* PSD */}
        <div className="bg-gray-50 p-4 rounded-lg relative">
          <h4 className="font-semibold mb-3">🌊 Power Spectral Density</h4>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
                <input
                  type="number"
                  value={basePsd.fmin || 0.5}
                  onChange={(e) => onAnalysisParamsChange({
                    ...analysisParams,
                    psd: { ...basePsd, fmin: parseFloat(e.target.value) }
                  })}
                  step="0.1"
                  min="0"
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
                <input
                  type="number"
                  value={basePsd.fmax || 50}
                  onChange={(e) => onAnalysisParamsChange({
                    ...analysisParams,
                    psd: { ...basePsd, fmax: parseFloat(e.target.value) }
                  })}
                  step="0.1"
                  min="1"
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Spectrum Method:</label>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => onAnalysisParamsChange({
                      ...analysisParams,
                      psd: { ...basePsd, method: 'welch' }
                    })}
                  className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    basePsd.method === 'welch'
                        ? 'bg-brand-blue text-white shadow-sm'
                        : 'text-brand-med-gray hover:bg-brand-light-gray'
                    }`}
                  >
                    Welch
                  </button>
                  <button
                    onClick={() => onAnalysisParamsChange({
                      ...analysisParams,
                      psd: { ...basePsd, method: 'periodogram' }
                    })}
                  className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    basePsd.method === 'periodogram'
                        ? 'bg-brand-blue text-white shadow-sm'
                        : 'text-brand-med-gray hover:bg-brand-light-gray'
                    }`}
                  >
                    Periodogram
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRunAnalysis('psd')}
                  disabled={isAnalyzing}
                  className="flex-1 bg-brand-blue hover:opacity-90 text-white py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isAnalyzing && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  )}
                  Compute PSD
                </button>
                <button
                  onClick={() => setShowAdvancedPSDSettings(!showAdvancedPSDSettings)}
                  className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm font-medium transition-colors"
                  title="Advanced Settings"
                >
                  ⚙️
                </button>
              </div>
            </div>

            {/* Advanced settings panel */}
            {showAdvancedPSDSettings && (
              <div className="w-64 bg-white border-2 border-blue-200 rounded-lg p-3 shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="font-semibold text-sm">⚙️ Advanced Settings</h5>
                  <button
                    onClick={() => setShowAdvancedPSDSettings(false)}
                    className="text-gray-500 hover:text-gray-700 font-bold"
                  >
                    ✕
                  </button>
                </div>

                {analysisParams.psd?.method === 'welch' && (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">Segment Length (seconds):</label>
                      <input
                        type="number"
                        value={advancedPSDSettings.nperseg_seconds}
                        onChange={(e) => onAdvancedPSDSettingsChange({
                          ...advancedPSDSettings,
                          nperseg_seconds: parseFloat(e.target.value)
                        })}
                        step="0.5"
                        min="0.5"
                        className="w-full p-2 border border-gray-300 rounded text-xs"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">Overlap (0-1):</label>
                      <input
                        type="number"
                        value={advancedPSDSettings.noverlap_proportion}
                        onChange={(e) => onAdvancedPSDSettingsChange({
                          ...advancedPSDSettings,
                          noverlap_proportion: Math.min(1, Math.max(0, parseFloat(e.target.value)))
                        })}
                        step="0.1"
                        min="0"
                        max="1"
                        className="w-full p-2 border border-gray-300 rounded text-xs"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs font-medium mb-1">Window:</label>
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => onAdvancedPSDSettingsChange({
                            ...advancedPSDSettings,
                            window: 'hann'
                          })}
                          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            advancedPSDSettings.window === 'hann'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Hann
                        </button>
                        <button
                          onClick={() => onAdvancedPSDSettingsChange({
                            ...advancedPSDSettings,
                            window: 'boxcar'
                          })}
                          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            advancedPSDSettings.window === 'boxcar'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Boxcar
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="mb-2">
                  <label className="block text-xs font-medium mb-1">Units:</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => onAdvancedPSDSettingsChange({
                        ...advancedPSDSettings,
                        use_db: false
                      })}
                      className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        !advancedPSDSettings.use_db
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Power
                    </button>
                    <button
                      onClick={() => onAdvancedPSDSettingsChange({
                        ...advancedPSDSettings,
                        use_db: true
                      })}
                      className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        advancedPSDSettings.use_db
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      dB
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SNR */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold mb-3">📊 Signal-to-Noise Ratio</h4>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Min Freq (Hz):</label>
            <input
              type="number"
              value={baseSnr.fmin || 1}
              onChange={(e) => onAnalysisParamsChange({
                ...analysisParams,
                snr: { ...baseSnr, fmin: parseFloat(e.target.value) }
              })}
              min="0"
              className="w-full p-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Max Freq (Hz):</label>
            <input
              type="number"
              value={baseSnr.fmax || 40}
              onChange={(e) => onAnalysisParamsChange({
                ...analysisParams,
                snr: { ...baseSnr, fmax: parseFloat(e.target.value) }
              })}
              min="1"
              className="w-full p-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            onClick={() => onRunAnalysis('snr')}
            disabled={isAnalyzing}
            className="w-full bg-brand-gold hover:bg-brand-light-gold text-brand-navy py-2 px-4 rounded text-sm disabled:opacity-50 flex items-center justify-center font-medium"
          >
            {isAnalyzing && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
            )}
            Compute SNR
          </button>
        </div>
      </div>
    </div>
  );
}

