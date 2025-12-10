/**
 * Channel Rename Popup Component
 * Allows users to rename EDF file channels
 */

import React from 'react';
import type { EDFMetadata } from '../../types/edfProcessor';

interface ChannelRenamePopupProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: EDFMetadata | null;
  channelToRename: string;
  newChannelName: string;
  channelRenameMap: Record<string, string>;
  onChannelSelect: (channel: string) => void;
  onNewNameChange: (name: string) => void;
  onSubmit: () => void;
  getChannelDisplayName: (originalName: string) => string;
}

export function ChannelRenamePopup({
  isOpen,
  onClose,
  metadata,
  channelToRename,
  newChannelName,
  channelRenameMap,
  onChannelSelect,
  onNewNameChange,
  onSubmit,
  getChannelDisplayName
}: ChannelRenamePopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Rename Channel</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Channel:</label>
          <select
            value={channelToRename}
            onChange={(e) => onChannelSelect(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {metadata?.channel_names?.map((channel) => (
              <option key={channel} value={channel}>
                {getChannelDisplayName(channel)} {channelRenameMap[channel] && `(${channel})`}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">New Name:</label>
          <input
            type="text"
            value={newChannelName}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder="Enter new channel name"
            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                onSubmit();
              }
            }}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSubmit}
            disabled={!channelToRename || !newChannelName.trim() || channelToRename === newChannelName.trim()}
            className="flex-1 bg-brand-green hover:opacity-90 text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rename
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


