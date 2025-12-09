/**
 * Component for channel selection
 */

'use client';

import React from 'react';
import type { EDFMetadata } from '../../types/edfProcessor';

interface ChannelSelectorProps {
  metadata: EDFMetadata;
  selectedChannels: string[];
  onSelectionChange: (channels: string[]) => void;
  channelRenameMap: Record<string, string>;
  getChannelDisplayName: (originalName: string) => string;
  onRenameClick: () => void;
  onDownloadModifiedEDF: () => void;
}

export default function ChannelSelector({
  metadata,
  selectedChannels,
  onSelectionChange,
  channelRenameMap,
  getChannelDisplayName,
  onRenameClick,
  onDownloadModifiedEDF
}: ChannelSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">Channel Selection</h3>
      <p className="text-sm text-gray-600 mb-3">Select channels to include in analysis:</p>
      
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => onSelectionChange(metadata.channel_names || [])}
          className="px-3 py-1 bg-[var(--brand-blue)]/20 text-brand-blue rounded text-sm hover:bg-[var(--brand-blue)]/30 border border-[var(--brand-blue)]/30"
        >
          Select All
        </button>
        <button
          onClick={() => onSelectionChange([])}
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
        >
          Clear All
        </button>
        <button
          onClick={onRenameClick}
          className="px-3 py-1 bg-[var(--brand-green)]/20 text-brand-green rounded text-sm hover:bg-[var(--brand-green)]/30 border border-[var(--brand-green)]/30"
        >
          Rename Channel
        </button>
        <button
          onClick={onDownloadModifiedEDF}
          className="px-3 py-1 bg-[var(--brand-navy)]/20 text-brand-navy rounded text-sm hover:bg-[var(--brand-navy)]/30 border border-[var(--brand-navy)]/30"
        >
          Download Modified EDF
        </button>
      </div>
      
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {metadata.channel_names.map((channel) => (
          <label key={channel} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selectedChannels.includes(channel)}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectionChange([...selectedChannels, channel]);
                } else {
                  onSelectionChange(selectedChannels.filter(ch => ch !== channel));
                }
              }}
              className="text-brand-blue"
            />
            <span className="text-sm font-mono">
              {getChannelDisplayName(channel)}
              {channelRenameMap[channel] && (
                <span className="text-xs text-gray-500 ml-1">({channel})</span>
              )}
            </span>
          </label>
        ))}
      </div>
      
      <div className="mt-3 text-sm text-gray-600">
        Selected: {selectedChannels.length} of {metadata.channel_names.length} channels
      </div>
    </div>
  );
}

