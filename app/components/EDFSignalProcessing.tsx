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

interface EDFSignalProcessingProps {
  file: EDFFile;
  isDarkMode?: boolean;
}

export default function EDFSignalProcessing({ file, isDarkMode = false }: EDFSignalProcessingProps) {
  const [processingResult, setProcessingResult] = useState<any>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [filterParams, setFilterParams] = useState({ lowFreq: 1, highFreq: 40 });
  const [channelsToReject, setChannelsToReject] = useState<string[]>([]);
  const [channelRenameMap, setChannelRenameMap] = useState<{ [key: string]: string }>({});

  const applyFilter = async () => {
    setLoading({ ...loading, filter: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/process_signal/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'filter',
          parameters: {
            l_freq: filterParams.lowFreq,
            h_freq: filterParams.highFreq,
            filter_type: 'fir'
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setProcessingResult(data);
      }
    } catch (error) {
      console.error('Failed to apply filter:', error);
    } finally {
      setLoading({ ...loading, filter: false });
    }
  };

  const rejectChannels = async () => {
    if (channelsToReject.length === 0) {
      alert('Please select channels to reject');
      return;
    }

    setLoading({ ...loading, reject: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/process_signal/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'reject_channels',
          parameters: {
            channels: channelsToReject
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setProcessingResult(data);
      }
    } catch (error) {
      console.error('Failed to reject channels:', error);
    } finally {
      setLoading({ ...loading, reject: false });
    }
  };

  const renameChannels = async () => {
    if (Object.keys(channelRenameMap).length === 0) {
      alert('Please specify channel renames');
      return;
    }

    setLoading({ ...loading, rename: true });
    try {
      const response = await fetch(`http://localhost:8000/api/edf-files/${file.id}/process_signal/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rename_channels',
          parameters: {
            mapping: channelRenameMap
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setProcessingResult(data);
      }
    } catch (error) {
      console.error('Failed to rename channels:', error);
    } finally {
      setLoading({ ...loading, rename: false });
    }
  };

  const downloadProcessedFile = async () => {
    if (!processingResult?.session_id) {
      alert('No processed file available');
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/api/edf-files/${file.id}/download_processed/?session_id=${processingResult.session_id}`
      );
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_${file.name}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to download processed file:', error);
    }
  };

  const toggleChannelReject = (channel: string) => {
    setChannelsToReject(prev => 
      prev.includes(channel) 
        ? prev.filter(ch => ch !== channel)
        : [...prev, channel]
    );
  };

  const updateChannelRename = (oldName: string, newName: string) => {
    setChannelRenameMap(prev => ({
      ...prev,
      [oldName]: newName
    }));
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
          Signal Processing: {file.name}
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

      {/* Filtering Section */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <h4 className={`text-md font-semibold mb-3 ${
          isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
        }`}>
          Frequency Filtering
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
            }`}>
              Low Frequency (Hz)
            </label>
            <input
              type="number"
              value={filterParams.lowFreq}
              onChange={(e) => setFilterParams({ ...filterParams, lowFreq: parseFloat(e.target.value) })}
              className={`w-full px-3 py-2 rounded border ${
                isDarkMode 
                  ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                  : 'bg-white border-gray-300'
              }`}
            />
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
            }`}>
              High Frequency (Hz)
            </label>
            <input
              type="number"
              value={filterParams.highFreq}
              onChange={(e) => setFilterParams({ ...filterParams, highFreq: parseFloat(e.target.value) })}
              className={`w-full px-3 py-2 rounded border ${
                isDarkMode 
                  ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                  : 'bg-white border-gray-300'
              }`}
            />
          </div>
          
          <button
            onClick={applyFilter}
            disabled={loading.filter}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDarkMode
                ? 'bg-blue-700 text-white hover:bg-blue-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {loading.filter ? 'Applying...' : 'Apply Filter'}
          </button>
        </div>
      </div>

      {/* Channel Management Section */}
      {file.channel_names && file.channel_names.length > 0 && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Channel Management
          </h4>
          
          <div className="space-y-4">
            {/* Channel Rejection */}
            <div>
              <h5 className={`text-sm font-medium mb-2 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Select Channels to Reject:
              </h5>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {file.channel_names.map((channel) => (
                  <label key={channel} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={channelsToReject.includes(channel)}
                      onChange={() => toggleChannelReject(channel)}
                      className="rounded"
                    />
                    <span className={`text-sm ${
                      isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-700'
                    }`}>
                      {channel}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={rejectChannels}
                disabled={loading.reject || channelsToReject.length === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-red-700 text-white hover:bg-red-600'
                    : 'bg-red-600 text-white hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {loading.reject ? 'Rejecting...' : 'Reject Selected Channels'}
              </button>
            </div>

            {/* Channel Renaming */}
            <div>
              <h5 className={`text-sm font-medium mb-2 ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-700'
              }`}>
                Rename Channels:
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                {file.channel_names.slice(0, 8).map((channel) => (
                  <div key={channel} className="flex items-center space-x-2">
                    <span className={`text-sm w-16 ${
                      isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-700'
                    }`}>
                      {channel}:
                    </span>
                    <input
                      type="text"
                      placeholder="New name"
                      onChange={(e) => updateChannelRename(channel, e.target.value)}
                      className={`flex-1 px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-[var(--dark-card)] border-[var(--dark-border)] text-[var(--dark-text)]' 
                          : 'bg-white border-gray-300'
                      }`}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={renameChannels}
                disabled={loading.rename || Object.keys(channelRenameMap).length === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-green-700 text-white hover:bg-green-600'
                    : 'bg-green-600 text-white hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {loading.rename ? 'Renaming...' : 'Rename Channels'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Result */}
      {processingResult && (
        <div className={`p-4 rounded-lg border ${
          isDarkMode 
            ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
            : 'bg-green-50 border-green-200'
        }`}>
          <h4 className={`text-md font-semibold mb-3 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Processing Complete
          </h4>
          
          <div className={`mb-4 ${
            isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
          }`}>
            <p><strong>Operation:</strong> {processingResult.operation}</p>
            <p><strong>Session ID:</strong> {processingResult.session_id}</p>
            {processingResult.processed_file_url && (
              <p><strong>Processed File:</strong> Available for download</p>
            )}
          </div>

          {processingResult.processed_file_url && (
            <button
              onClick={downloadProcessedFile}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-[var(--gold)] text-[var(--navy)] hover:bg-yellow-500'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Download Processed EDF File
            </button>
          )}
        </div>
      )}

      {/* Future Processing Options */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-tertiary)] border-[var(--dark-border)]' 
          : 'bg-yellow-50 border-yellow-200'
      }`}>
        <h4 className={`text-md font-semibold mb-2 ${
          isDarkMode ? 'text-[var(--gold)]' : 'text-yellow-800'
        }`}>
          Coming Soon
        </h4>
        <div className={`space-y-2 text-sm ${
          isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-yellow-700'
        }`}>
          <p>• <strong>ICA Component Removal:</strong> Remove eye blinks and muscle artifacts</p>
          <p>• <strong>Epoch Extraction:</strong> Split continuous data into time-locked segments</p>
          <p>• <strong>Artifact Detection:</strong> Automatic identification of noisy segments</p>
          <p>• <strong>Rereferencing:</strong> Change reference electrode configuration</p>
        </div>
      </div>
    </div>
  );
}