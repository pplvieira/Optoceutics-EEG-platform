/**
 * Component for time frame selection with sliders and annotation markers
 */

'use client';

import React, { useRef, useEffect } from 'react';

interface EDFAnnotation {
  id: string;
  onset: number;
  duration: number;
  description: string;
  is_custom?: boolean;
  real_time?: string;
}

interface TimeFrameSelectorProps {
  duration: number;
  timeFrameStart: number;
  timeFrameEnd: number;
  useTimeFrame: boolean;
  onTimeFrameStartChange: (value: number) => void;
  onTimeFrameEndChange: (value: number) => void;
  onUseTimeFrameChange: (value: boolean) => void;
  formatTimeHMS: (time: number) => string | undefined;
  annotations?: EDFAnnotation[];
}

export default function TimeFrameSelector({
  duration,
  timeFrameStart,
  timeFrameEnd,
  useTimeFrame,
  onTimeFrameStartChange,
  onTimeFrameEndChange,
  onUseTimeFrameChange,
  formatTimeHMS,
  annotations = []
}: TimeFrameSelectorProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!duration) return null;

  // Draw timeline with annotations
  useEffect(() => {
    if (!canvasRef.current || !useTimeFrame) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, width, height);

    // Draw timeline bar
    const barHeight = 8;
    const barY = height / 2 - barHeight / 2;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, barY, width, barHeight);

    // Draw selected range
    const startPercent = (timeFrameStart / duration) * 100;
    const endPercent = (timeFrameEnd / duration) * 100;
    const rangeWidth = ((endPercent - startPercent) / 100) * width;
    const rangeX = (startPercent / 100) * width;
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(rangeX, barY, rangeWidth, barHeight);

    // Draw time markers
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';

    const numMarkers = 10;
    for (let i = 0; i <= numMarkers; i++) {
      const x = (i / numMarkers) * width;
      const time = (i / numMarkers) * duration;

      ctx.beginPath();
      ctx.moveTo(x, barY - 5);
      ctx.lineTo(x, barY + barHeight + 5);
      ctx.stroke();

      ctx.fillText(time.toFixed(1) + 's', x, barY - 10);
    }

    // Draw annotation markers
    annotations.forEach(annotation => {
      const annotationPercent = (annotation.onset / duration) * 100;
      const x = (annotationPercent / 100) * width;

      if (x >= 0 && x <= width) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, height / 2, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Draw label
        ctx.fillStyle = '#1f2937';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(annotation.description || 'Annotation', x, height / 2 - 12);
      }
    });

    // Draw slider handles
    const handleSize = 12;
    const startX = (startPercent / 100) * width;
    const endX = (endPercent / 100) * width;

    // Start handle
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(startX, height / 2, handleSize / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End handle
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(endX, height / 2, handleSize / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [duration, timeFrameStart, timeFrameEnd, useTimeFrame, annotations]);

  const handleSliderStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onTimeFrameStartChange(Math.max(0, Math.min(value, timeFrameEnd - 0.1)));
  };

  const handleSliderEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onTimeFrameEndChange(Math.max(timeFrameStart + 0.1, Math.min(value, duration)));
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Time Frame Selection</h3>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={useTimeFrame}
            onChange={(e) => onUseTimeFrameChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium">Use custom time frame</span>
        </label>
      </div>
      
      {useTimeFrame && (
        <div className="space-y-4">
          {/* Timeline visualization with annotations */}
          <div ref={timelineRef} className="relative">
            <canvas
              ref={canvasRef}
              width={800}
              height={80}
              className="w-full h-20 border border-gray-300 rounded"
            />
          </div>

          {/* Range sliders */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time: {timeFrameStart.toFixed(2)}s
                {formatTimeHMS && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({formatTimeHMS(timeFrameStart)})
                  </span>
                )}
              </label>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={timeFrameStart}
                onChange={handleSliderStart}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(timeFrameStart / duration) * 100}%, #e5e7eb ${(timeFrameStart / duration) * 100}%, #e5e7eb 100%)`
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time: {timeFrameEnd.toFixed(2)}s
                {formatTimeHMS && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({formatTimeHMS(timeFrameEnd)})
                  </span>
                )}
              </label>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={timeFrameEnd}
                onChange={handleSliderEnd}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${(timeFrameEnd / duration) * 100}%, #3b82f6 ${(timeFrameEnd / duration) * 100}%, #3b82f6 100%)`
                }}
              />
            </div>
          </div>

          {/* Numeric inputs for precise control */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time (s):
              </label>
              <input
                type="number"
                value={timeFrameStart}
                onChange={(e) => onTimeFrameStartChange(Math.max(0, Math.min(parseFloat(e.target.value) || 0, timeFrameEnd - 0.1)))}
                step="0.1"
                min={0}
                max={timeFrameEnd - 0.1}
                className="w-full p-2 text-sm border border-gray-300 rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time (s):
              </label>
              <input
                type="number"
                value={timeFrameEnd}
                onChange={(e) => onTimeFrameEndChange(Math.max(timeFrameStart + 0.1, Math.min(parseFloat(e.target.value) || duration, duration)))}
                step="0.1"
                min={timeFrameStart + 0.1}
                max={duration}
                className="w-full p-2 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Duration: {(timeFrameEnd - timeFrameStart).toFixed(1)}s
            {formatTimeHMS && (
              <span className="ml-2">
                ({formatTimeHMS(timeFrameEnd - timeFrameStart)})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

