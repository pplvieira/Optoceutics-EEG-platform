# Fixes Plan - Systematic Issue Resolution

**Date:** December 10, 2025  
**Mode:** Plan Mode  
**Status:** Analysis Phase

## Issues Identified

### 1. BDF to EDF Conversion Missing
**Problem:**
- Error: `GET /python-packages/edf_analysis_code.py 404`
- Console log: `pyodide.asm.js:9 Overwriting existing file.`
- Toast appears but file doesn't show in UI after selection

**Root Cause Analysis:**
- The file `/python-packages/edf_analysis_code.py` doesn't exist in `public/` folder
- Code falls back to `getPythonAnalysisCode()` which should work
- The toast handler in `addFile` function may not be properly handling the BDF conversion flow
- The conversion happens but the file loading logic might be broken

**Investigation Needed:**
- Check if `getPythonAnalysisCode()` function exists and works
- Verify the BDF conversion toast handler properly calls `loadEDFFile` after user confirms
- Check if the converted file is properly added to `loadedFiles` state
- Verify the file appears in MultiFileListPanel

**Solution:**
1. Ensure `edf_analysis_code.py` exists OR verify fallback works correctly
2. Fix the toast handler to properly await and handle the conversion
3. Ensure converted file is properly added to the file list
4. Test BDF file upload end-to-end

---

### 2. Comparison Mode Text Color
**Problem:**
- Text is navy color, impossible to see against dark background (`bg-gray-800`)

**Solution:**
- Change all text colors in comparison mode section to light gray (`text-gray-300` or `text-gray-200`)
- Update headings, labels, descriptions, and form text
- Ensure good contrast for readability

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (lines ~1464-2032)

---

### 3. Comparison Mode Button Outlines
**Problem:**
- Buttons need gold outlines to stand out better on dark background

**Solution:**
- Add gold border/outline to all buttons in comparison mode
- Use `border-2 border-[var(--brand-gold)]` or similar
- Ensure buttons are visible and accessible

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (comparison mode buttons)

---

### 4. Time Frame Selection Slider Missing
**Problem:**
- The slider with time bar and annotation overlays was removed
- Current `TimeFrameSelector.tsx` only has number inputs
- Need to recover slider functionality from previous commits

**Investigation Needed:**
- Check git history for previous TimeFrameSelector implementation
- Look for slider/range input components
- Check if EDFViewerTool.tsx has similar slider implementation (it has timeline canvas)

**Solution:**
1. Search git history for previous TimeFrameSelector with sliders
2. If found, restore the slider implementation
3. If not found, create new slider component with:
   - Range sliders for start/end time
   - Time bar visualization
   - Annotation markers overlayed
   - Real-time updates

**Files to Modify:**
- `src/app/components/edf-processor/TimeFrameSelector.tsx`

---

### 5. Resutil plt Variable Error
**Problem:**
- Error: `cannot access local variable 'plt' where it is not associated with a value`
- Occurs when resutil box is ticked
- Error in `usePyodide.ts` around line 1735-1751

**Root Cause Analysis:**
- When `use_resutil_style` is True, code tries to use resutil but plt might not be imported
- The plt import happens later in the function, but resutil styling tries to use it early
- Need to ensure matplotlib.pyplot is imported before resutil styling is applied

**Solution:**
1. Import `matplotlib.pyplot as plt` at the beginning of the PSD analysis function
2. Ensure plt is available before resutil styling code runs
3. Verify the order of imports and styling application

**Files to Modify:**
- `src/app/hooks/usePyodide.ts` (PSD analysis function, around line 1735)

---

## Implementation Order

### Phase 1: Critical Fixes (Must Fix)
1. **Resutil plt Error** - Blocks functionality
2. **BDF Conversion** - Blocks file loading

### Phase 2: UI/UX Fixes
3. **Comparison Mode Text Color** - Usability issue
4. **Comparison Mode Button Outlines** - Usability issue
5. **Time Frame Slider** - Feature restoration

---

## Questions for Clarification

### 1. Time Frame Slider
- **Question:** Do you have a backup/previous version of TimeFrameSelector with sliders?
- **Question:** Should the slider show annotations as markers on the time bar?
- **Question:** Should it be a single range slider or two separate sliders?

### 2. BDF Conversion
- **Question:** Should we create the missing `edf_analysis_code.py` file, or rely on the fallback?
- **Question:** Is the conversion working but just not showing the file, or is conversion failing?

---

## Testing Strategy

After each fix:
1. Visual inspection
2. Functional testing
3. Console error checking
4. Type checking: `npm run type-check`
5. Linting: `npm run lint`

---

## Next Steps

1. **Answer Questions:** Please answer the clarification questions above
2. **Review Plan:** Review this implementation plan
3. **Proceed:** Once questions are answered, I'll proceed with implementation

---

**Note:** This is a living document. It will be updated as we discover more about the issues and implement fixes.

