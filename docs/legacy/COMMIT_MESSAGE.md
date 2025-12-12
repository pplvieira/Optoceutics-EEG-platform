feat: Major UI/UX improvements and bug fixes

Implement comprehensive layout refactoring, comparison mode enhancements,
and critical bug fixes for the EDF processor component.

## Major Features

### Two-Column Layout
- Implemented responsive two-column layout with full viewport width
- Left column: All controls/inputs (file upload, metadata, channels, time frame, annotations, analysis controls, comparison builder)
- Right column: All outputs (results, plots, reports)
- Independent scrolling per column with custom scrollbars
- Responsive stacking on mobile devices

### Comparison Mode Enhancements
- Darker background (bg-gray-800) with thicker navy border for visual emphasis
- All text colors changed to light gray (text-gray-200/300) for better readability
- Added gold borders (border-2 border-[var(--brand-gold)]) to all buttons for better visibility
- Updated PSD Parameters section styling to match dark theme

### Time Frame Selection Slider
- Restored interactive time frame slider with visual timeline
- Canvas-based timeline visualization showing full duration
- Selected time range highlighted in blue
- Annotation markers overlaid on timeline with labels
- Dual range sliders for start/end time selection
- Numeric inputs for precise control
- Real-time duration display

## Bug Fixes

### Critical Fixes
- Fixed resutil plt variable error: Import matplotlib.pyplot before resutil styling to prevent "cannot access local variable 'plt'" error
- Fixed BDF to EDF conversion: Improved toast notification handler with proper error handling and file loading after conversion
- Fixed default frequency limits: Set all frequency fields (PSD, SNR, FOOOF, Time-Frequency) to 1-45Hz default

### UI/UX Improvements
- Removed container max-width constraints for full viewport width
- Changed Analysis Tools grid to 2 columns per line (md:grid-cols-2)
- Applied custom scrollbar styling to column containers
- Enhanced toast notification system for BDF conversion warnings

## Technical Changes

- Updated TimeFrameSelector component with canvas-based timeline and annotation overlay
- Enhanced comparison mode styling throughout PyodideEDFProcessor component
- Improved error handling in BDF conversion flow
- Fixed matplotlib import order in PSD analysis function

## Files Modified

- src/app/components/edf-processor/PyodideEDFProcessor.tsx
- src/app/components/edf-processor/TimeFrameSelector.tsx
- src/app/hooks/usePyodide.ts
- docs/temp/IMPLEMENTATION_PLAN_FEATURES.md
- docs/temp/FIXES_PLAN.md

