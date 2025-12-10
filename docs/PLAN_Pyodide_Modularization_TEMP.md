# PyodideEDFProcessor Modularization Plan

**Status:** Planning Phase (TEMP - Awaiting Review)  
**Date:** 2025-12-10  
**Component Size:** 6,373 lines  
**Target Size:** < 1,000 lines (main component)

## Executive Summary

This plan outlines the systematic refactoring of `PyodideEDFProcessor.tsx` from a monolithic 6,373-line component into a modular architecture using microprocesses. The refactoring will maintain all existing features while improving maintainability, testability, and code organization.

## Current State Analysis

### Existing Infrastructure (Already Created)
- ✅ `usePyodide` hook - Pyodide initialization (already in use)
- ✅ `useEDFFile` hook - EDF file loading (not yet integrated)
- ✅ `useAnalysis` hook - Analysis execution (not yet integrated)
- ✅ Sub-components: `FileUpload`, `MetadataDisplay`, `ChannelSelector`, `AnalysisControls`, `ResultsDisplay`
- ✅ Services: `pyodideService`, `edfService`, `pdfExporter`

### Current Component Structure
The component currently contains:
1. **Multi-file management** (loadedFiles, activeFileId, file switching)
2. **File handling** (BDF conversion, file upload, drag & drop)
3. **EDF loading** (Python environment setup, EDF reading)
4. **Channel management** (selection, renaming, display names)
5. **Time frame management** (start/end selection, real-time conversion)
6. **Annotation management** (loading, display, custom annotations)
7. **Analysis execution** (SSVEP, PSD, SNR, Theta-Beta, Time-Frequency, FOOOF)
8. **Comparison mode** (trace builder, comparison plots, PSD comparison)
9. **Results rendering** (SSVEP results, analysis results, plot selection)
10. **Report generation** (PDF/DOCX with plot selection)
11. **UI state management** (resutil toggle, alpha peaks, gamma peaks, etc.)

### Critical Issues to Address
1. **Resutil toggle bug**: Must check checkbox state at runtime when generating plots
2. **Python environment setup**: Duplicated between component and `usePyodide` hook
3. **File handling**: Not using `useEDFFile` hook
4. **Analysis execution**: Not using `useAnalysis` hook
5. **Report generation**: Inline code should be in service module
6. **Comparison mode**: Complex logic should be extracted

## Modularization Strategy

### Phase 1: Extract Report Generation Service
**Priority:** High  
**Estimated Lines Saved:** ~200 lines

**Action:**
- Create `src/app/services/reportService.ts`
- Extract `generatePatientReport` and `generatePatientReportDOCXFile` functions
- Extract `prepareReportData` function
- Extract plot selection management logic
- Service should accept: pyodide instance, report data, selected plots
- Service should return: base64 PDF/DOCX string or blob

**Files to Modify:**
- `src/app/services/reportService.ts` (new)
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (remove report generation code)

**Testing:**
- Verify PDF/DOCX generation still works
- Verify plot selection and ordering works
- Verify all report data is included correctly

---

### Phase 2: Extract Comparison Mode Logic
**Priority:** High  
**Estimated Lines Saved:** ~400 lines

**Action:**
- Create `src/app/hooks/useComparisonMode.ts`
- Extract comparison mode state management:
  - `comparisonMode`, `comparisonTraces`, `comparisonPlots`
  - `traceBuilderFileId`, `traceBuilderChannel`, etc.
  - `comparisonPsdParams`, `currentComparisonPlot`
- Extract comparison functions:
  - `addOrUpdateTrace`, `editTrace`, `removeTrace`
  - `moveTraceUp`, `moveTraceDown`
  - `saveComparisonPlot`, `deleteComparisonPlot`
  - `generateComparisonPlot`
- Create `src/app/components/edf-processor/ComparisonModePanel.tsx` component
- Extract comparison UI rendering

**Files to Create:**
- `src/app/hooks/useComparisonMode.ts`
- `src/app/components/edf-processor/ComparisonModePanel.tsx`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (remove comparison logic)

**Testing:**
- Verify trace builder works
- Verify comparison plot generation works
- Verify plot saving/deletion works
- Verify trace reordering works

---

### Phase 3: Extract Multi-File Management
**Priority:** Medium  
**Estimated Lines Saved:** ~150 lines

**Action:**
- Create `src/app/hooks/useMultiFileManager.ts`
- Extract multi-file state:
  - `loadedFiles`, `activeFileId`
  - Computed `currentFile` and `metadata`
- Extract file management functions:
  - `addFile`, `switchToFile`, `removeFile`, `updateFileNickname`
  - `handleFileSelect`, `handleFileInputChange`
- Integrate with `useEDFFile` hook for actual file loading
- Update `FileUpload` component to support multi-file mode

**Files to Create:**
- `src/app/hooks/useMultiFileManager.ts`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use new hook)
- `src/app/components/edf-processor/FileUpload.tsx` (add multi-file support)

**Testing:**
- Verify multiple files can be loaded
- Verify file switching works
- Verify file removal works
- Verify nickname updates work

---

### Phase 4: Extract Annotation Management
**Priority:** Medium  
**Estimated Lines Saved:** ~100 lines

**Action:**
- Create `src/app/hooks/useAnnotations.ts`
- Extract annotation state: `annotations`, `annotationsNeedUpdate`
- Extract annotation functions:
  - `calculateRealWorldTime`, `formatTimeHMS`
  - Annotation loading from EDF metadata
  - Custom annotation creation
- Create `src/app/components/edf-processor/AnnotationPanel.tsx` component
- Extract annotation UI rendering

**Files to Create:**
- `src/app/hooks/useAnnotations.ts`
- `src/app/components/edf-processor/AnnotationPanel.tsx`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use new hook)

**Testing:**
- Verify annotations load from EDF
- Verify custom annotations can be added
- Verify real-time conversion works
- Verify annotation display works

---

### Phase 5: Extract Channel Management
**Priority:** Medium  
**Estimated Lines Saved:** ~150 lines

**Action:**
- Create `src/app/hooks/useChannelManager.ts`
- Extract channel state:
  - `selectedChannels`
  - `channelRenameMap`, `showChannelRenamePopup`
  - `channelToRename`, `newChannelName`
- Extract channel functions:
  - `openChannelRenamePopup`, `submitChannelRename`
  - `getChannelDisplayName`
  - `downloadModifiedEDF`
- Update `ChannelSelector` component to use hook
- Extract channel rename popup to separate component

**Files to Create:**
- `src/app/hooks/useChannelManager.ts`
- `src/app/components/edf-processor/ChannelRenamePopup.tsx`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use new hook)
- `src/app/components/edf-processor/ChannelSelector.tsx` (integrate hook)

**Testing:**
- Verify channel selection works
- Verify channel renaming works
- Verify modified EDF download works
- Verify display names work correctly

---

### Phase 6: Extract Time Frame Management
**Priority:** Low  
**Estimated Lines Saved:** ~50 lines

**Action:**
- Create `src/app/hooks/useTimeFrame.ts`
- Extract time frame state:
  - `timeFrameStart`, `timeFrameEnd`
  - `useTimeFrame`
- Extract time frame functions:
  - Real-time conversion helpers
  - Time frame validation
- Create `src/app/components/edf-processor/TimeFrameSelector.tsx` component
- Extract time frame UI

**Files to Create:**
- `src/app/hooks/useTimeFrame.ts`
- `src/app/components/edf-processor/TimeFrameSelector.tsx`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use new hook)

**Testing:**
- Verify time frame selection works
- Verify real-time conversion works
- Verify time frame is passed to analyses correctly

---

### Phase 7: Integrate useEDFFile Hook
**Priority:** High  
**Estimated Lines Saved:** ~200 lines

**Action:**
- Replace inline EDF loading with `useEDFFile` hook
- Remove duplicate file reading logic
- Update `useEDFFile` hook if needed to support:
  - BDF conversion
  - Multi-file mode
  - Python environment setup
- Remove Python environment setup from component (should be in `usePyodide`)

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use hook)
- `src/app/hooks/useEDFFile.ts` (enhance if needed)
- `src/app/hooks/usePyodide.ts` (move Python setup here if not already)

**Testing:**
- Verify EDF files load correctly
- Verify BDF conversion works
- Verify metadata extraction works
- Verify error handling works

---

### Phase 8: Integrate useAnalysis Hook
**Priority:** High  
**Estimated Lines Saved:** ~300 lines

**Action:**
- Replace `runSSVEPAnalysis` with `useAnalysis` hook's `runSSVEPAnalysis`
- Replace `runTraditionalAnalysis` with `useAnalysis` hook's `runAnalysis`
- **CRITICAL FIX**: Ensure resutil toggle is checked at runtime
  - Pass `useResutilStyle` state to analysis functions
  - Check checkbox state when analysis is triggered, not when state is set
  - Update Python code to use resutil based on parameter passed
- Remove duplicate analysis execution logic
- Update `useAnalysis` hook if needed to support:
  - Resutil toggle parameter
  - All analysis types (PSD, SNR, Theta-Beta, Time-Frequency, FOOOF)
  - Advanced PSD settings
  - FOOOF parameters

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use hook)
- `src/app/hooks/useAnalysis.ts` (enhance to support all analysis types and resutil)

**Testing:**
- Verify all analysis types work
- **CRITICAL**: Verify resutil toggle is checked at runtime (not cached)
- Verify analysis parameters are passed correctly
- Verify results are displayed correctly

---

### Phase 9: Extract Python Environment Setup
**Priority:** Medium  
**Estimated Lines Saved:** ~300 lines

**Action:**
- Move Python environment setup from component to `usePyodide` hook
- This includes:
  - EDF library installation (MNE, pyedflib, pure Python)
  - Resutil installation (multi-stage fallback)
  - FOOOF installation
  - Loading external Python modules (fooof_analysis.py, comparison_psd.py)
  - Python helper function setup
- Component should only use the ready Pyodide instance

**Files to Modify:**
- `src/app/hooks/usePyodide.ts` (add Python setup)
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (remove setup code)

**Testing:**
- Verify Pyodide initializes correctly
- Verify all Python packages install
- Verify external modules load
- Verify all analyses still work

---

### Phase 10: Replace UI Components
**Priority:** Medium  
**Estimated Lines Saved:** ~500 lines

**Action:**
- Replace inline file upload UI with `FileUpload` component
- Replace inline metadata display with `MetadataDisplay` component
- Replace inline channel selector with `ChannelSelector` component
- Replace inline analysis controls with `AnalysisControls` component
- Replace inline results display with `ResultsDisplay` component
- Extract remaining UI sections to smaller components:
  - SSVEP parameters panel
  - Analysis parameters panels (PSD, SNR, etc.)
  - Plot selection panel
  - Report generation panel

**Files to Create:**
- `src/app/components/edf-processor/SSVEPParamsPanel.tsx`
- `src/app/components/edf-processor/AnalysisParamsPanel.tsx`
- `src/app/components/edf-processor/PlotSelectionPanel.tsx`
- `src/app/components/edf-processor/ReportGenerationPanel.tsx`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use components)
- Update existing sub-components to accept all needed props

**Testing:**
- Verify all UI renders correctly
- Verify all interactions work
- Verify props are passed correctly
- Verify state updates work

---

### Phase 11: Extract Utility Functions
**Priority:** Low  
**Estimated Lines Saved:** ~100 lines

**Action:**
- Create `src/app/utils/edfUtils.ts`
- Extract utility functions:
  - `clearMessages`
  - `simulateProgress` (if not in hook)
  - `handleDragEnter`, `handleDragLeave`, `handleDragOver`, `handleDrop`
  - File validation helpers
  - Time formatting helpers

**Files to Create:**
- `src/app/utils/edfUtils.ts`

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (use utilities)

**Testing:**
- Verify all utilities work correctly
- Verify drag & drop works
- Verify file validation works

---

### Phase 12: Cleanup and Type Safety
**Priority:** Low  
**Estimated Lines Saved:** ~50 lines

**Action:**
- Remove unused state variables
- Remove duplicate code
- Update type definitions to use centralized types
- Add JSDoc comments to all public functions
- Remove `eslint-disable` comments where possible
- Optimize imports

**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- All new hooks and components

**Testing:**
- Run `npm run typecheck` - must pass
- Run `npm run lint` - must pass
- Verify no console errors
- Verify all functionality works

---

## Implementation Order

The phases should be implemented in this order to minimize breaking changes:

1. **Phase 1** - Report Generation Service (isolated, low risk)
2. **Phase 2** - Comparison Mode Logic (isolated feature)
3. **Phase 7** - Integrate useEDFFile (foundation for file handling)
4. **Phase 3** - Multi-File Management (builds on Phase 7)
5. **Phase 8** - Integrate useAnalysis (critical for resutil fix)
6. **Phase 9** - Python Environment Setup (cleanup)
7. **Phase 4** - Annotation Management (isolated feature)
8. **Phase 5** - Channel Management (isolated feature)
9. **Phase 6** - Time Frame Management (small, isolated)
10. **Phase 10** - Replace UI Components (visual refactor)
11. **Phase 11** - Extract Utilities (cleanup)
12. **Phase 12** - Final Cleanup (polish)

## Critical Requirements

### Resutil Toggle Fix (Phase 8)
**Problem:** Resutil toggle state is cached/not checked at runtime.

**Solution:**
1. When analysis is triggered, read the current checkbox state
2. Pass `useResutilStyle` as a parameter to analysis functions
3. Update Python code to check this parameter at execution time
4. Do NOT rely on state that was set earlier

**Code Pattern:**
```typescript
// In runTraditionalAnalysis or runSSVEPAnalysis
const currentResutilState = useResutilStyle; // Read at call time
// Pass to Python
pyodide.globals.set('use_resutil_style', currentResutilState);
```

### Type Safety
- All new hooks must have proper TypeScript types
- All new components must have proper prop types
- Remove all `any` types where possible
- Use centralized type definitions from `src/app/types/`

### Testing Strategy
After each phase:
1. Run `npm run typecheck`
2. Run `npm run lint`
3. Manual testing:
   - File upload
   - EDF loading
   - Channel selection
   - At least one analysis type
   - Results display
   - Report generation (if applicable)

## Success Criteria

The refactoring is complete when:
- [ ] `PyodideEDFProcessor.tsx` is under 1,000 lines
- [ ] All functionality works as before
- [ ] Resutil toggle is checked at runtime (bug fixed)
- [ ] All hooks and sub-components are being used
- [ ] No duplicate code remains
- [ ] Type safety is improved (no `any` types)
- [ ] All tests pass (`npm run typecheck`, `npm run lint`)
- [ ] Code is more maintainable and testable
- [ ] Architecture documentation is updated

## Risk Mitigation

1. **Keep original component as backup** - Commit after each successful phase
2. **Test incrementally** - Don't move to next phase until current one is tested
3. **Use feature flags if needed** - Can toggle between old/new implementations
4. **Document breaking changes** - Update migration guide if needed

## Documentation Updates

After completion, update:
- `docs/ARCHITECTURE.md` - Reflect new modular structure
- `docs/COMPONENTS.md` - Document new hooks and components
- `docs/REFACTORING_STATUS.md` - Mark as complete
- `.cursor/memory.md` - Update project state

---

## Questions for Review

1. **Report Service Location**: Should report generation be in `reportService.ts` or stay in `pdfExporter.ts`?
   - Recommendation: Create new `reportService.ts` that uses `pdfExporter.ts` internally
   - Answer: create new exporter service yes.

2. **Comparison Mode**: Should comparison mode be a separate page/route or stay in the same component?
   - Recommendation: Keep in same component but extract to hook/component

3. **Multi-File Support**: Should we maintain backward compatibility with single-file mode?
   - Recommendation: Yes, support both modes

4. **Python Setup**: Should Python environment setup be in `usePyodide` or a separate service?
   - Recommendation: In `usePyodide` hook for simplicity
   - Answer: keep in usePyodide. i want the functionality to remain the same. just focus on refactoring the code without changing functionality 

5. **Resutil Toggle**: Should we add a visual indicator when resutil is active?
   - Recommendation: Yes, add a badge/indicator in the UI
   - Answer: no, no need. I already have the user-toggleable checkbox. that is all the indication and control you need. When calling the plotting functions, just read the state of this checkbox and pass it along as the "Use resutil" flag

---

**Next Steps:**
1. Review this plan
2. Answer questions above
3. Make any modifications to the plan
4. Proceed with Phase 1 implementation

