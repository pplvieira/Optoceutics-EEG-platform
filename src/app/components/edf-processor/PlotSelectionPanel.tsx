/**
 * Component for selecting plots for report generation
 */

'use client';

import React from 'react';

interface PlotSelectionPanelProps {
  selectedPlots: string[];
  plotSelectionOrder: string[];
  availablePlots: string[];
  onPlotToggle: (plotId: string) => void;
  onPlotOrderChange: (plotId: string, direction: 'up' | 'down') => void;
}

export default function PlotSelectionPanel({
  selectedPlots,
  plotSelectionOrder,
  availablePlots,
  onPlotToggle,
  onPlotOrderChange
}: PlotSelectionPanelProps) {
  if (availablePlots.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">Select Plots for Report</h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {availablePlots.map((plotId) => {
          const isSelected = selectedPlots.includes(plotId);
          const orderIndex = plotSelectionOrder.indexOf(plotId);
          const isInOrder = orderIndex !== -1;
          
          return (
            <div
              key={plotId}
              className={`flex items-center justify-between p-2 rounded border ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
            >
              <label className="flex items-center space-x-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onPlotToggle(plotId)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{plotId}</span>
                {isInOrder && (
                  <span className="text-xs text-gray-500">
                    (Order: {orderIndex + 1})
                  </span>
                )}
              </label>
              
              {isSelected && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onPlotOrderChange(plotId, 'up')}
                    disabled={orderIndex === 0}
                    className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onPlotOrderChange(plotId, 'down')}
                    disabled={orderIndex === plotSelectionOrder.length - 1}
                    className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {selectedPlots.length > 0 && (
        <div className="mt-3 text-sm text-gray-600">
          {selectedPlots.length} plot{selectedPlots.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

