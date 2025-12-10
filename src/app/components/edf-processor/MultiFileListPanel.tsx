/**
 * Component for displaying and managing multiple loaded files
 */

'use client';

import React from 'react';
import type { LoadedFile } from '../../hooks/useMultiFileManager';

interface MultiFileListPanelProps {
  loadedFiles: LoadedFile[];
  activeFileId: string | null;
  onSwitchToFile: (fileId: string) => void;
  onRemoveFile: (fileId: string) => void;
  onUpdateNickname: (fileId: string, nickname: string) => void;
  onAddFile: () => void;
  pyodideReady: boolean;
}

export default function MultiFileListPanel({
  loadedFiles,
  activeFileId,
  onSwitchToFile,
  onRemoveFile,
  onUpdateNickname,
  onAddFile,
  pyodideReady
}: MultiFileListPanelProps) {
  if (loadedFiles.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[var(--brand-green)]/20 rounded-full flex items-center justify-center border border-[var(--brand-green)]/30">
            <svg className="w-4 h-4 text-brand-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Loaded Files ({loadedFiles.length})</h2>
        </div>
      </div>
      
      {/* File list */}
      <div className="space-y-2 mb-4">
        {loadedFiles.map((loadedFile) => (
          <div
            key={loadedFile.id}
            className={`border rounded-lg p-3 transition-all ${
              loadedFile.id === activeFileId
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                {/* Active indicator */}
                {loadedFile.id === activeFileId ? (
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <button
                    onClick={() => onSwitchToFile(loadedFile.id)}
                    className="w-6 h-6 border-2 border-gray-300 rounded-full hover:border-blue-500 transition-colors flex-shrink-0"
                    title="Switch to this file"
                  />
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={loadedFile.nickname}
                    onChange={(e) => onUpdateNickname(loadedFile.id, e.target.value)}
                    className="font-medium text-sm text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-full"
                    placeholder="File nickname"
                  />
                  <p className="text-xs text-gray-500 truncate">
                    {loadedFile.metadata.filename} • {loadedFile.metadata.num_channels} channels • {loadedFile.metadata.duration_seconds?.toFixed(1)}s
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  {loadedFile.id !== activeFileId && (
                    <button
                      onClick={() => onSwitchToFile(loadedFile.id)}
                      className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors"
                    >
                      Switch
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveFile(loadedFile.id)}
                    className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another file button */}
      <button
        onClick={onAddFile}
        disabled={!pyodideReady}
        className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Add Another File</span>
      </button>
    </div>
  );
}

