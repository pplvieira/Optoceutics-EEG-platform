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
  onJumpToAnnotation?: (onset: number) => void;
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
  annotations = [],
  onJumpToAnnotation
}: TimeFrameSelectorProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw timeline with annotations
  useEffect(() => {
    if (!canvasRef.current || !useTimeFrame) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Base bar
    const barHeight = 8;
    const barY = height / 2 - barHeight / 2;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, barY, width, barHeight);

    // Selected range
    const startPercent = (timeFrameStart / duration) * 100;
    const endPercent = (timeFrameEnd / duration) * 100;
    const rangeWidth = ((endPercent - startPercent) / 100) * width;
    const rangeX = (startPercent / 100) * width;

    ctx.fillStyle = 'rgba(0,45,95,0.25)'; // brand navy tint
    ctx.fillRect(rangeX, barY, rangeWidth, barHeight);

    // Annotation markers as thin gold bars
    const sortedAnnotations = [...annotations].sort((a, b) => a.onset - b.onset);
    sortedAnnotations.forEach((annotation) => {
      const annotationPercent = (annotation.onset / duration) * 100;
      const x = (annotationPercent / 100) * width;
      if (x >= 0 && x <= width) {
        ctx.fillStyle = 'rgba(212, 164, 57, 0.9)'; // brand gold
        ctx.fillRect(x - 1, barY - 6, 2, barHeight + 12);
      }
    });
  }, [duration, timeFrameStart, timeFrameEnd, useTimeFrame, annotations]);

  const handleSliderStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onTimeFrameStartChange(Math.max(0, Math.min(value, timeFrameEnd - 0.1)));
  };

  const handleSliderEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onTimeFrameEndChange(Math.max(timeFrameStart + 0.1, Math.min(value, duration)));
  };

  const sortedAnnotations = [...annotations].sort((a, b) => a.onset - b.onset);

  if (!duration) return null;

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
              height={72}
              className="w-full h-[72px]"
            />
          </div>

          {/* Jump to annotation */}
          {sortedAnnotations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jump to annotation
                </label>
                <select
                  onChange={(e) => {
                    const target = sortedAnnotations.find((a) => a.id === e.target.value);
                    if (target) {
                      const newStart = Math.min(target.onset, duration - 0.1);
                      const currentSpan = timeFrameEnd - timeFrameStart;
                      const suggestedEnd = Math.min(duration, newStart + Math.max(0.1, currentSpan));
                      onTimeFrameStartChange(newStart);
                      onTimeFrameEndChange(Math.max(suggestedEnd, newStart + 0.1));
                      onJumpToAnnotation?.(target.onset);
                    }
                  }}
                  defaultValue=""
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] text-sm"
                >
                  <option value="">Select annotation...</option>
                  {sortedAnnotations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {`${formatTimeHMS ? formatTimeHMS(a.onset) : `${a.onset.toFixed(2)}s`} • ${a.description || 'Annotation'}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end text-sm text-gray-600">
                <div>
                  <div className="font-semibold text-gray-700">Selected range</div>
                  <div>
                    {timeFrameStart.toFixed(2)}s → {timeFrameEnd.toFixed(2)}s ({(timeFrameEnd - timeFrameStart).toFixed(1)}s)
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  background: `linear-gradient(to right, rgba(0,45,95,0.35) 0%, rgba(0,45,95,0.35) ${(timeFrameStart / duration) * 100}%, #e5e7eb ${(timeFrameStart / duration) * 100}%, #e5e7eb 100%)`
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
                  background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${(timeFrameEnd / duration) * 100}%, rgba(0,45,95,0.35) ${(timeFrameEnd / duration) * 100}%, rgba(0,45,95,0.35) 100%)`
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

