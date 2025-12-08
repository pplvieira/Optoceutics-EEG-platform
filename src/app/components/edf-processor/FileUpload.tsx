/**
 * File upload component for EDF files
 */

'use client';

import React, { useRef, useCallback } from 'react';

interface FileUploadProps {
  pyodideReady: boolean;
  dragActive: boolean;
  onFileSelect: (file: File) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  currentFile: File | null;
}

export default function FileUpload({
  pyodideReady,
  dragActive,
  onFileSelect,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  currentFile
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  if (currentFile) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[var(--brand-green)]/20 rounded-full flex items-center justify-center border border-[var(--brand-green)]/30">
              <svg className="w-4 h-4 text-brand-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">File Loaded: {currentFile.name}</h3>
              <p className="text-xs text-gray-500">Ready for analysis</p>
            </div>
          </div>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!pyodideReady}
            className="bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-3 rounded disabled:opacity-50 transition-colors"
          >
            Change File
          </button>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept=".edf,.bdf,.fif"
          className="hidden"
          disabled={!pyodideReady}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
      <h2 className="text-lg font-semibold mb-3">Load EDF File</h2>
      <div 
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 ${
          !pyodideReady
            ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
            : dragActive 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400 cursor-pointer'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept=".edf,.bdf,.fif"
          className="hidden"
          disabled={!pyodideReady}
        />
        
        <div className="flex items-center justify-center space-x-4">
          <div className="w-10 h-10 bg-[var(--brand-blue)]/20 rounded-full flex items-center justify-center border border-[var(--brand-blue)]/30">
            <svg className="w-5 h-5 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          
          <div className="flex-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!pyodideReady}
              className="bg-brand-blue hover:opacity-90 text-white font-medium py-2 px-4 rounded disabled:opacity-50 transition-colors"
            >
              {pyodideReady ? 'Choose EDF/BDF File' : 'Waiting for Python...'}
            </button>
            
            <p className="text-sm text-gray-600 mt-1">
              {dragActive ? 'Drop your EDF file here!' : pyodideReady ? 'Or drag & drop your file here' : 'Please wait for Python environment to load...'}
            </p>
            <p className="text-xs text-gray-400">
              Local processing • No uploads • No limits
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

