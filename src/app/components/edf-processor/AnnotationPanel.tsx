/**
 * Component for displaying and managing annotations
 */

'use client';

import React from 'react';
import type { EDFAnnotation } from '../../types/edfProcessor';

interface AnnotationPanelProps {
  annotations: EDFAnnotation[];
  metadata: { duration_seconds?: number } | null;
  onAnnotationUpdate: (index: number, field: 'onset' | 'duration' | 'description', value: number | string) => void;
  onAnnotationDelete: (id: string) => void;
  calculateRealWorldTime: (onset: number) => string | undefined;
  onAddCustomAnnotation?: () => void;
}

export default function AnnotationPanel({
  annotations,
  metadata,
  onAnnotationUpdate,
  onAnnotationDelete,
  calculateRealWorldTime,
  onAddCustomAnnotation
}: AnnotationPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Annotations</h3>
        {onAddCustomAnnotation && (
          <button
            onClick={onAddCustomAnnotation}
            className="px-3 py-1 bg-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/90 text-white text-sm rounded"
          >
            + Add Custom Annotation
          </button>
        )}
      </div>
      
      {annotations.length > 0 ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {annotations.map((annotation, index) => (
            <div
              key={annotation.id}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm">
                  {annotation.description}
                </div>
                <div className={`px-2 py-1 text-xs rounded ${
                  annotation.is_custom 
                    ? 'bg-teal-100 text-teal-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {annotation.is_custom ? 'Custom' : 'EDF'}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Description:
                  </label>
                  <input
                    type="text"
                    value={annotation.description}
                    onChange={(e) => onAnnotationUpdate(index, 'description', e.target.value)}
                    className="w-full p-2 text-sm border border-gray-300 rounded"
                    disabled={!annotation.is_custom}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Onset (s):
                  </label>
                  <input
                    type="number"
                    value={annotation.onset}
                    onChange={(e) => {
                      const newOnset = Math.max(0, Math.min(parseFloat(e.target.value) || 0, metadata?.duration_seconds || 0));
                      onAnnotationUpdate(index, 'onset', newOnset);
                    }}
                    step="0.1"
                    min={0}
                    max={metadata?.duration_seconds || 0}
                    className="w-full p-2 text-sm border border-gray-300 rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Duration (s):
                  </label>
                  <input
                    type="number"
                    value={annotation.duration}
                    onChange={(e) => {
                      const newDuration = Math.max(0.0, parseFloat(e.target.value) || 0.0);
                      onAnnotationUpdate(index, 'duration', newDuration);
                    }}
                    step="0.1"
                    min={0.0}
                    className="w-full p-2 text-sm border border-gray-300 rounded"
                  />
                </div>
                
                <div className="flex items-center space-x-2 col-span-2">
                  {annotation.real_time && (
                    <div className="text-xs text-gray-600">
                      {annotation.real_time}
                    </div>
                  )}
                  
                  {annotation.is_custom && (
                    <button
                      onClick={() => onAnnotationDelete(annotation.id)}
                      className="p-1 text-brand-red hover:opacity-80 text-sm"
                      title="Delete annotation"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              
              {annotation.real_time && (
                <div className="mt-2 text-xs text-gray-500">
                  <strong>Real-world time:</strong> {annotation.real_time}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-4">
          No annotations found in EDF file. You can add custom annotations using the button above.
        </div>
      )}
    </div>
  );
}

