# Small Features & Fixes Plan - COMPLETED

## Issues Addressed & Fixed
1. ✅ **BDF sampling frequency**: Fixed key mismatch (`sfreq` vs `sampling_frequency`) - now reads true value
2. ✅ **Plot headers**: Made static with filename included in display
3. ❌ **Drag & drop layout**: Reverted due to complexity - keeping current layout for now
4. ✅ **Toast notifications**: Unified to single toast per plot generation with scroll-to-plot

## Implementation Summary
- ✅ Fixed BDF `sampling_frequency` extraction by correcting key name mismatch
- ✅ Added filename to `AnalysisResult` interface and plot headers display
- ✅ Added filename parameter to `runAnalysis` and passed from UI
- ✅ Removed duplicate `onSuccess` calls from `useAnalysis` to prevent double toasts
- ✅ Plot headers now show static time frames and filename
- ❌ Layout changes reverted - current layout works well enough

## Technical Details
- **BDF Sampling**: Python returns `sampling_frequency`, JS expects `sampling_frequency` (fixed key mismatch)
- **Plot Headers**: Added `filename` to `AnalysisResult` interface, displayed in `ResultsDisplay.tsx`
- **Toast Unification**: Removed `onSuccess` calls from analysis hooks, let results useEffect handle toasts
- **Layout**: Kept current responsive design - drag & drop area works in left column
