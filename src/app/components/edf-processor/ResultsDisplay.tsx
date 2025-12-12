/**
 * Component for displaying analysis results
 */

'use client';

import React, { useState } from 'react';
import type { AnalysisResult } from '../../types/edfProcessor';

interface SSVEPResult {
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

interface ResultsDisplayProps {
  ssvepResult: SSVEPResult | null;
  analysisResults: AnalysisResult[];
  formatTimeHMS?: (time: number) => string | undefined;
}

export default function ResultsDisplay({
  ssvepResult,
  analysisResults,
  formatTimeHMS
}: ResultsDisplayProps) {
  const [collapsedResults, setCollapsedResults] = useState<Set<number>>(new Set());

  const toggleCollapse = (resultId: number) => {
    setCollapsedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resultId)) {
        newSet.delete(resultId);
      } else {
        newSet.add(resultId);
      }
      return newSet;
    });
  };

  const renderSSVEPResults = () => {
    if (!ssvepResult) return null;

    const isCollapsed = collapsedResults.has(0);

    return (
      <div id="ssvep-result" className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">SSVEP Analysis Results</h3>
          <button
            onClick={() => toggleCollapse(0)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            {isCollapsed ? '▼ Expand' : '▲ Collapse'}
          </button>
        </div>
        
        {!isCollapsed && (
          <>
            {/* Main visualization */}
            <div className="mb-6">
              <img 
                src={`data:image/png;base64,${ssvepResult.visualization_base64}`} 
                alt="SSVEP Comprehensive Analysis"
                className="w-full max-w-4xl mx-auto"
              />
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--brand-blue)]/10 p-4 rounded-lg text-center border border-[var(--brand-blue)]/20">
                <h4 className="font-semibold text-brand-navy">Target Frequency</h4>
                <p className="text-2xl font-bold text-brand-blue">{ssvepResult.target_frequency} Hz</p>
              </div>
              
              <div className="bg-[var(--brand-green)]/10 p-4 rounded-lg text-center border border-[var(--brand-green)]/20">
                <h4 className="font-semibold text-brand-navy">Best Channel</h4>
                <p className="text-lg font-bold text-brand-green">{ssvepResult.summary.best_channel}</p>
              </div>
              
              <div className="bg-[var(--brand-navy)]/10 p-4 rounded-lg text-center border border-[var(--brand-navy)]/20">
                <h4 className="font-semibold text-brand-navy">Average SNR</h4>
                <p className="text-xl font-bold text-brand-navy">{ssvepResult.summary.average_snr.toFixed(2)} dB</p>
              </div>
              
              <div className="bg-[var(--brand-light-gold)]/20 p-4 rounded-lg text-center border border-[var(--brand-gold)]/30">
                <h4 className="font-semibold text-brand-navy">High Confidence</h4>
                <p className="text-xl font-bold text-brand-gold">{ssvepResult.summary.high_confidence_channels} channels</p>
              </div>
            </div>

            {/* Detailed results table */}
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SNR (dB)</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peak Power</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ssvepResult.ssvep_detection).map(([channel, data]) => (
                    <tr key={channel} className="border-t border-gray-200">
                      <td className="px-4 py-2 text-sm font-medium">{channel}</td>
                      <td className="px-4 py-2 text-sm">{data.snr_db.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm">{data.peak_power.toExponential(2)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          data.detection_confidence === 'high' ? 'bg-[var(--brand-green)]/20 text-brand-green border border-[var(--brand-green)]/30' :
                          data.detection_confidence === 'medium' ? 'bg-[var(--brand-light-gold)]/20 text-brand-gold border border-[var(--brand-gold)]/30' :
                          'bg-[var(--brand-red)]/20 text-brand-red border border-[var(--brand-red)]/30'
                        }`}>
                          {data.detection_confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAnalysisResults = () => {
    if (analysisResults.length === 0) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
        <h3 className="text-lg font-bold mb-4">Traditional Analysis Results</h3>
        
        {analysisResults.map((result, index) => {
          const resultId = index + 10;
          const isCollapsed = collapsedResults.has(resultId);
          return (
            <div
              key={index}
              id={`analysis-result-${result.id ?? index}`}
              className="mb-6 border rounded-lg"
            >
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-t-lg">
                <h4 className="text-md font-semibold capitalize">
                  {result.analysis_type.replace('_', ' ')}
                  {(result.analysis_type === 'psd' || result.analysis_type === 'snr') && result.parameters && typeof result.parameters === 'object' && 'method' in result.parameters && (
                    <span className="text-sm font-normal text-brand-blue ml-2">
                      ({String(result.parameters.method).charAt(0).toUpperCase() + String(result.parameters.method).slice(1)})
                    </span>
                  )}
                  {result.filename && (
                    <span className="text-sm font-normal text-green-600 ml-2">
                      - {result.filename}
                    </span>
                  )}
                  {result.time_frame && formatTimeHMS && (
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      ({formatTimeHMS(result.time_frame.start) || result.time_frame.start.toFixed(1)+'s'} - {formatTimeHMS(result.time_frame.end) || result.time_frame.end.toFixed(1)+'s'})
                    </span>
                  )}
                </h4>
                <button
                  onClick={() => toggleCollapse(resultId)}
                  className="px-2 py-1 text-sm bg-white hover:bg-gray-100 rounded flex items-center gap-1"
                >
                  {isCollapsed ? '▼' : '▲'}
                </button>
              </div>
              
              {!isCollapsed && (
                <div className="p-3">
                  {/* Display theta-beta ratio result if available */}
                  {result.analysis_type === 'theta_beta_ratio' && result.data && typeof result.data === 'object' && result.data !== null && 'ratio' in result.data && (
                    <div className="mb-4 p-4 bg-[var(--brand-blue)]/10 border border-[var(--brand-blue)]/30 rounded-lg">
                      <div className="text-2xl font-bold text-brand-navy mb-2">
                        Theta/Beta Ratio: {typeof result.data.ratio === 'number' ? result.data.ratio.toFixed(3) : String(result.data.ratio)}
                      </div>
                      {result.data && typeof result.data === 'object' && 'theta_power' in result.data && 'beta_power' in result.data && (
                        <div className="text-sm text-gray-600">
                          Theta Power: {typeof result.data.theta_power === 'number' ? result.data.theta_power.toFixed(3) : 'N/A'} | 
                          Beta Power: {typeof result.data.beta_power === 'number' ? result.data.beta_power.toFixed(3) : 'N/A'}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {result.plot_base64 && (
                    <div className="mb-4">
                      <img 
                        src={`data:image/png;base64,${result.plot_base64}`} 
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {renderSSVEPResults()}
      {renderAnalysisResults()}
    </>
  );
}

