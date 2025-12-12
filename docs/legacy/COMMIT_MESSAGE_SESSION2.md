feat: BDF workflow fixes, UI improvements, and debug instrumentation cleanup

## Bug Fixes

### BDF File Processing
- Fixed BDF sampling frequency extraction (was defaulting to 256Hz, now reads from `raw.info['sfreq']`)
- Fixed BDF annotations not appearing in UI (missing `setAnnotations()` call in toast callback)
- Fixed BDF reload overwrite issue (skip `reloadActiveFile` for already-processed BDF files via `convertedFromBdf` flag)

### Analysis Results
- Fixed toast "View Plot" scroll not working (added `id` attribute to analysis result containers)
- Fixed time frame resetting when switching between files (removed automatic reset in `switchToFile`)
- Added filename display in plot headers (shows source file in green text)

## UI/UX Improvements

### Responsive Upload Layout
- Full-width upload area when no files are loaded (larger drop zone, centered layout)
- Switches to two-column layout after first file upload
- Returns to full-width when all files removed

### Empty State
- Added placeholder message in right column when no analysis results exist
- Shows chart icon with helper text: "Use the controls on the left to run an analysis"

## Files Modified

- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` - Layout conditionals, annotations fix, plot IDs, empty state
- `src/app/components/edf-processor/FileUpload.tsx` - Added `isFullWidth` prop for responsive layout
- `src/app/hooks/useEDFFile.ts` - BDF sampling frequency extraction fix
- `src/app/hooks/useAnalysis.ts` - Added filename to analysis results
- `src/app/hooks/usePyodide.ts` - BDF reload skip logic
- `src/app/types/edfProcessor.ts` - Added `filename` to `AnalysisResult` interface
- `src/app/components/edf-processor/ResultsDisplay.tsx` - Filename display in headers
- `src/app/components/edf-processor/AnnotationPanel.tsx` - Debug cleanup

## Technical Notes

- All debug instrumentation has been removed after verification
- BDF files now use `convertedFromBdf` metadata flag to prevent re-processing

