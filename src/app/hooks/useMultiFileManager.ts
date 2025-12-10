/**
 * Custom hook for multi-file management
 * Handles loading, switching, and managing multiple EDF files
 */

import { useState, useCallback, useMemo } from 'react';
import type { EDFMetadata } from '../types/edfProcessor';

export interface LoadedFile {
  id: string;
  file: File;
  metadata: EDFMetadata;
  nickname: string;
  loadedAt: Date;
}

export interface UseMultiFileManagerReturn {
  // State
  loadedFiles: LoadedFile[];
  activeFileId: string | null;
  currentFile: File | null;
  metadata: EDFMetadata | null;

  // Setters
  setLoadedFiles: React.Dispatch<React.SetStateAction<LoadedFile[]>>;
  setActiveFileId: React.Dispatch<React.SetStateAction<string | null>>;

  // Functions
  addLoadedFile: (file: File, metadata: EDFMetadata) => string; // Returns fileId
  switchToFile: (fileId: string) => LoadedFile | null;
  removeFile: (fileId: string) => boolean; // Returns true if file was removed
  updateFileNickname: (fileId: string, newNickname: string) => void;
  clearAllFiles: () => void;
}

export function useMultiFileManager(): UseMultiFileManagerReturn {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Computed values for backward compatibility
  const currentFile = useMemo(() =>
    loadedFiles.find(f => f.id === activeFileId)?.file || null,
    [loadedFiles, activeFileId]
  );

  const metadata = useMemo(() =>
    loadedFiles.find(f => f.id === activeFileId)?.metadata || null,
    [loadedFiles, activeFileId]
  );

  const addLoadedFile = useCallback((file: File, metadata: EDFMetadata): string => {
    // Create unique ID for this file
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create LoadedFile object
    const loadedFile: LoadedFile = {
      id: fileId,
      file: file,
      metadata: metadata,
      nickname: file.name.replace(/\.(edf|bdf|fif)$/i, ''),
      loadedAt: new Date()
    };

    // Add to loaded files and set as active
    setLoadedFiles(prev => [...prev, loadedFile]);
    setActiveFileId(fileId);

    return fileId;
  }, []);

  const switchToFile = useCallback((fileId: string): LoadedFile | null => {
    const targetFile = loadedFiles.find(f => f.id === fileId);
    if (!targetFile) return null;

    setActiveFileId(fileId);
    return targetFile;
  }, [loadedFiles]);

  const removeFile = useCallback((fileId: string): boolean => {
    const fileToRemove = loadedFiles.find(f => f.id === fileId);
    if (!fileToRemove) return false;

    const confirmed = window.confirm(`Remove "${fileToRemove.nickname}"?`);
    if (!confirmed) return false;

    const newLoadedFiles = loadedFiles.filter(f => f.id !== fileId);
    setLoadedFiles(newLoadedFiles);

    // If we removed the active file, switch to another or clear
    if (activeFileId === fileId) {
      if (newLoadedFiles.length > 0) {
        setActiveFileId(newLoadedFiles[0].id);
      } else {
        setActiveFileId(null);
      }
    }

    return true;
  }, [loadedFiles, activeFileId]);

  const updateFileNickname = useCallback((fileId: string, newNickname: string) => {
    setLoadedFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, nickname: newNickname } : f
    ));
  }, []);

  const clearAllFiles = useCallback(() => {
    setLoadedFiles([]);
    setActiveFileId(null);
  }, []);

  return {
    loadedFiles,
    activeFileId,
    currentFile,
    metadata,
    setLoadedFiles,
    setActiveFileId,
    addLoadedFile,
    switchToFile,
    removeFile,
    updateFileNickname,
    clearAllFiles
  };
}
