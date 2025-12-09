/**
 * Component for displaying EDF file metadata
 */

'use client';

import React from 'react';
import type { EDFMetadata } from '../../types/edfProcessor';

interface MetadataDisplayProps {
  metadata: EDFMetadata;
}

export default function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  return (
    <div className="bg-[var(--brand-blue)]/5 rounded-lg p-6 mb-6 border border-[var(--brand-blue)]/10">
      <h3 className="text-lg font-semibold mb-4">File Information: {metadata.filename}</h3>
      
      {/* Library information */}
      <div className={`px-4 py-3 rounded mb-4 ${
        metadata.library_used === 'MNE-Python' ? 'bg-[var(--brand-green)]/20 border border-[var(--brand-green)]/40 text-brand-green' :
        metadata.library_used === 'pyedflib' ? 'bg-[var(--brand-blue)]/20 border border-[var(--brand-blue)]/40 text-brand-blue' :
        'bg-[var(--brand-navy)]/20 border border-[var(--brand-navy)]/40 text-brand-navy'
      }`}>
        <div className="flex items-center">
          <div className="mr-2">
            {metadata.library_used === 'MNE-Python' ? '🧠' : 
             metadata.library_used === 'pyedflib' ? '📊' : '🔧'}
          </div>
          <div>
            <p className="font-medium">
              Processing Library: {metadata.library_used || 'Pure Python EDF Reader'}
            </p>
            <p className="text-sm">
              {metadata.library_used === 'MNE-Python' ? 'Using MNE-Python for advanced neuroimaging analysis' :
               metadata.library_used === 'pyedflib' ? 'Using pyedflib for standard EDF processing' :
               'Using custom pure Python EDF reader - fully functional without external dependencies'}
            </p>
            {metadata.real_data && (
              <p className="text-xs font-medium mt-1">✅ Reading actual EDF file data</p>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="font-medium">Size:</span> {metadata.file_size_mb} MB
        </div>
        <div>
          <span className="font-medium">Channels:</span> {metadata.num_channels}
        </div>
        <div>
          <span className="font-medium">Duration:</span> {metadata.duration_seconds.toFixed(1)}s
        </div>
        <div>
          <span className="font-medium">Sample Rate:</span> {metadata.sampling_frequency}Hz
        </div>
      </div>
      
      {metadata.channel_names && metadata.channel_names.length <= 20 && (
        <div className="mt-4">
          <span className="font-medium">Channels:</span>
          <div className="mt-2 text-xs">
            {metadata.channel_names.join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}

