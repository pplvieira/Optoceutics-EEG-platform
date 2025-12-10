/**
 * Component for report generation controls
 */

'use client';

import React from 'react';

interface ReportGenerationPanelProps {
  generatingPDF: boolean;
  onGeneratePDF: () => void;
  onGenerateDOCX: () => void;
  selectedPlotsCount: number;
}

export default function ReportGenerationPanel({
  generatingPDF,
  onGeneratePDF,
  onGenerateDOCX,
  selectedPlotsCount
}: ReportGenerationPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">Generate Report</h3>
      
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onGeneratePDF}
          disabled={generatingPDF || selectedPlotsCount === 0}
          className="flex-1 bg-brand-navy hover:opacity-90 text-white font-medium py-2 px-4 rounded disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
        >
          {generatingPDF && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          )}
          <span>{generatingPDF ? 'Generating...' : 'Generate PDF Report'}</span>
        </button>
        
        <button
          onClick={onGenerateDOCX}
          disabled={generatingPDF || selectedPlotsCount === 0}
          className="flex-1 bg-brand-blue hover:opacity-90 text-white font-medium py-2 px-4 rounded disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
        >
          <span>Generate DOCX Report</span>
        </button>
      </div>
      
      {selectedPlotsCount === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          Select at least one plot to include in the report
        </p>
      )}
    </div>
  );
}

