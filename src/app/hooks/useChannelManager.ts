/**
 * Custom hook for channel management
 * Handles channel selection, renaming, and mapping
 */

import { useState, useCallback } from 'react';

export interface UseChannelManagerReturn {
  selectedChannels: string[];
  setSelectedChannels: React.Dispatch<React.SetStateAction<string[]>>;
  channelRenameMap: Record<string, string>;
  setChannelRenameMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  newChannelName: string;
  setNewChannelName: React.Dispatch<React.SetStateAction<string>>;
  renameChannel: (originalName: string, newName: string) => void;
  getDisplayName: (originalName: string) => string;
  clearRenames: () => void;
  selectAllChannels: (availableChannels: string[]) => void;
  deselectAllChannels: () => void;
  toggleChannel: (channelName: string) => void;
}

export function useChannelManager(): UseChannelManagerReturn {
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelRenameMap, setChannelRenameMap] = useState<Record<string, string>>({});
  const [newChannelName, setNewChannelName] = useState<string>('');

  const renameChannel = useCallback((originalName: string, newName: string) => {
    if (!newName.trim() || originalName === newName.trim()) {
      return;
    }

    setChannelRenameMap(prev => ({
      ...prev,
      [originalName]: newName.trim()
    }));

    // Update selected channels if the renamed channel is selected
    setSelectedChannels(prev =>
      prev.map(ch => ch === originalName ? newName.trim() : ch)
    );
  }, []);

  const getDisplayName = useCallback((originalName: string): string => {
    return channelRenameMap[originalName] || originalName;
  }, [channelRenameMap]);

  const clearRenames = useCallback(() => {
    setChannelRenameMap({});
  }, []);

  const selectAllChannels = useCallback((availableChannels: string[]) => {
    setSelectedChannels([...availableChannels]);
  }, []);

  const deselectAllChannels = useCallback(() => {
    setSelectedChannels([]);
  }, []);

  const toggleChannel = useCallback((channelName: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelName)) {
        return prev.filter(ch => ch !== channelName);
      } else {
        return [...prev, channelName];
      }
    });
  }, []);

  return {
    selectedChannels,
    setSelectedChannels,
    channelRenameMap,
    setChannelRenameMap,
    newChannelName,
    setNewChannelName,
    renameChannel,
    getDisplayName,
    clearRenames,
    selectAllChannels,
    deselectAllChannels,
    toggleChannel
  };
}

