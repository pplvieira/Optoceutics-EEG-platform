'use client';

import React, { useState, useRef } from 'react';
import { EDFFile } from '../types/edf';

interface LocalEDFUploadProps {
  isDarkMode?: boolean;
  onFileUploaded?: (file: EDFFile) => void;
}

const BACKEND_URL = 'http://localhost:8000';

export default function LocalEDFUpload({ isDarkMode = false, onFileUploaded }: LocalEDFUploadProps) {
  const [files, setFiles] = useState<EDFFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check backend status on mount
  React.useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/`);
      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const edfFiles = droppedFiles.filter(file => 
      file.name.toLowerCase().endsWith('.edf') || file.name.toLowerCase().endsWith('.bdf')
    );

    if (edfFiles.length > 0) {
      uploadFiles(edfFiles);
    } else {
      alert('Please upload only EDF or BDF files.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    uploadFiles(selectedFiles);
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (backendStatus !== 'online') {
      alert('Python backend is not running. Please start it first.');
      return;
    }

    setUploading(true);

    try {
      for (const file of filesToUpload) {
        console.log(`Uploading file: ${file.name}, size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${BACKEND_URL}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const uploadedFile: EDFFile = await response.json();
          console.log('Upload successful:', uploadedFile);
          setFiles(prev => [...prev, uploadedFile]);
          onFileUploaded?.(uploadedFile);
        } else {
          const errorData = await response.json();
          console.error('Upload failed:', errorData);
          alert(`Failed to upload ${file.name}: ${errorData.detail || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (fileId: string) => {
    try {
      await fetch(`${BACKEND_URL}/files/${fileId}`, {
        method: 'DELETE',
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (error) {
      console.error('Failed to delete file:', error);
      // Remove from UI anyway
      setFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  return (
    <div className="space-y-6">
      {/* Backend Status */}
      <div className={`p-4 rounded-lg border ${
        backendStatus === 'online'
          ? isDarkMode
            ? 'bg-green-900 border-green-700 text-green-200'
            : 'bg-green-50 border-green-200 text-green-800'
          : backendStatus === 'offline'
          ? isDarkMode
            ? 'bg-red-900 border-red-700 text-red-200'
            : 'bg-red-50 border-red-200 text-red-800'
          : isDarkMode
          ? 'bg-yellow-900 border-yellow-700 text-yellow-200'
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <strong>Python Backend Status:</strong>{' '}
            {backendStatus === 'online' && '🟢 Online'}
            {backendStatus === 'offline' && '🔴 Offline'}
            {backendStatus === 'checking' && '🟡 Checking...'}
          </div>
          <button
            onClick={checkBackendStatus}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isDarkMode
                ? 'bg-white bg-opacity-20 hover:bg-opacity-30'
                : 'bg-black bg-opacity-10 hover:bg-opacity-20'
            }`}
          >
            Refresh
          </button>
        </div>
        
        {backendStatus === 'offline' && (
          <div className="mt-2 text-sm">
            <p>To start the Python backend:</p>
            <code className={`block mt-1 p-2 rounded ${
              isDarkMode ? 'bg-black bg-opacity-30' : 'bg-white bg-opacity-50'
            }`}>
              cd python-backend && pip install -r requirements.txt && python main.py
            </code>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          backendStatus !== 'online' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${
          dragActive
            ? isDarkMode
              ? 'border-[var(--gold)] bg-[var(--dark-bg-secondary)]'
              : 'border-blue-500 bg-blue-50'
            : isDarkMode
            ? 'border-[var(--dark-border)] hover:border-[var(--gold)]'
            : 'border-gray-300 hover:border-blue-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => backendStatus === 'online' && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".edf,.bdf"
          onChange={handleFileSelect}
          className="hidden"
          disabled={backendStatus !== 'online'}
        />

        {uploading ? (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--gold)] mx-auto"></div>
            <p className={isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-600'}>
              Processing files with local Python backend...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-4xl">🐍</div>
            <div>
              <p className={`text-lg font-medium ${
                isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-700'
              }`}>
                Drop EDF files here or click to browse
              </p>
              <p className={`text-sm ${
                isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-500'
              }`}>
                Supports .edf and .bdf files (processed locally with Python)
              </p>
              <p className={`text-xs mt-1 ${
                isDarkMode ? 'text-[var(--gold)]' : 'text-blue-600'
              }`}>
                No size limits • Full Python scientific stack • Local processing only
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div className={`rounded-lg border p-4 ${
          isDarkMode 
            ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
          }`}>
            Processed Files ({files.length})
          </h3>
          
          <div className="space-y-3">
            {files.map(file => (
              <div
                key={file.id}
                className={`flex items-center justify-between p-3 rounded border ${
                  isDarkMode 
                    ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className={`font-medium ${
                      isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
                    }`}>
                      {file.filename}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      isDarkMode
                        ? 'bg-green-900 text-green-200'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      Ready
                    </span>
                  </div>
                  
                  <div className={`text-sm mt-1 space-x-4 ${
                    isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-500'
                  }`}>
                    <span>Size: {file.file_size_mb} MB</span>
                    {file.duration_seconds && (
                      <span>Duration: {Math.round(file.duration_seconds)}s</span>
                    )}
                    {file.sampling_frequency && (
                      <span>Fs: {file.sampling_frequency} Hz</span>
                    )}
                    {file.num_channels && (
                      <span>Channels: {file.num_channels}</span>
                    )}
                  </div>
                  
                  {file.processing_message && (
                    <p className={`text-xs mt-1 ${
                      isDarkMode ? 'text-[var(--gold)]' : 'text-blue-600'
                    }`}>
                      {file.processing_message}
                    </p>
                  )}
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.id);
                  }}
                  className={`ml-4 p-2 rounded-full hover:bg-red-100 ${
                    isDarkMode ? 'text-red-400 hover:bg-red-900' : 'text-red-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className={`p-4 rounded-lg border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-tertiary)] border-[var(--dark-border)] text-[var(--gold)]' 
          : 'bg-blue-50 border-blue-200 text-blue-800'
      }`}>
        <p className="text-sm">
          <strong>Local Processing:</strong> Files are processed by your local Python backend. 
          No size limits, full scientific computing capabilities, and complete privacy.
        </p>
      </div>
    </div>
  );
}