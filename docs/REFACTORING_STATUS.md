# Refactoring Status Update

## ✅ Completed Tasks

### 1. Color System Update
**Status:** ✅ Complete

All frontend colors have been updated to use the new brand color palette:
- Replaced green/red/purple/blue/orange buttons with brand colors
- Updated all UI components to use `brand-navy`, `brand-gold`, `brand-green`, `brand-red`, `brand-blue`
- Maintained Python plotting colors (unchanged as requested)
- Updated components:
  - `ResultsDisplay.tsx`
  - `AnalysisControls.tsx`
  - `ChannelSelector.tsx`
  - `FileUpload.tsx`
  - `MetadataDisplay.tsx`
  - `PyodideEDFProcessor.tsx` (main component)

**Color Mapping:**
- Green (success) → `brand-green`
- Red (error) → `brand-red`
- Purple → `brand-navy`
- Blue → `brand-blue`
- Orange → `brand-gold` (for actions)
- Yellow → `brand-light-gold`

### 2. Infrastructure Created
**Status:** ✅ Complete

The following hooks and components have been created and are ready for integration:
- `usePyodide` hook - Pyodide initialization and management
- `useEDFFile` hook - EDF file loading and metadata management
- `useAnalysis` hook - Analysis execution logic
- Sub-components:
  - `FileUpload.tsx`
  - `MetadataDisplay.tsx`
  - `ChannelSelector.tsx`
  - `AnalysisControls.tsx`
  - `ResultsDisplay.tsx`

## 🔄 In Progress: Component Refactoring

### Current State
The `PyodideEDFProcessor.tsx` component is **4282 lines** and contains:
- Pyodide initialization logic (lines 138-600+)
- File upload and handling (lines 600-1000+)
- EDF file parsing (Python code embedded)
- Channel selection and management
- Annotation management
- Time frame selection
- Analysis execution (SSVEP, PSD, SNR, etc.)
- Results rendering
- PDF/DOCX report generation

### Refactoring Strategy

The refactoring should be done incrementally in these steps:

#### Step 1: Replace Pyodide Initialization (Priority: High)
**Current:** Lines 138-600+ contain Pyodide initialization
**Target:** Use `usePyodide` hook

**Changes needed:**
1. Import `usePyodide` hook
2. Replace `initializePyodide` function with hook usage
3. Replace `pyodideRef` with hook's `pyodide` instance
4. Update `pyodideReady`, `pyodideLoading`, `loadingMessage` to use hook state
5. Remove duplicate initialization code

**Testing:** Verify Pyodide loads correctly and all analyses still work

#### Step 2: Replace File Handling (Priority: High)
**Current:** Lines 600-1000+ contain file upload and EDF loading
**Target:** Use `useEDFFile` hook and `FileUpload` component

**Changes needed:**
1. Import `useEDFFile` hook
2. Replace file upload logic with `FileUpload` component
3. Replace EDF loading logic with hook's `loadEDFFile` function
4. Update metadata state to use hook's `metadata`
5. Remove duplicate file handling code

**Testing:** Verify file upload, EDF loading, and metadata display work correctly

#### Step 3: Replace Analysis Logic (Priority: Medium)
**Current:** Lines 1000-2500+ contain analysis execution
**Target:** Use `useAnalysis` hook

**Changes needed:**
1. Import `useAnalysis` hook
2. Replace analysis execution functions with hook's `runAnalysis` function
3. Update analysis results state to use hook's `results`
4. Remove duplicate analysis code

**Testing:** Verify all analysis types (SSVEP, PSD, SNR, etc.) still work

#### Step 4: Replace UI Components (Priority: Medium)
**Current:** Various sections render UI inline
**Target:** Use sub-components

**Changes needed:**
1. Replace metadata display with `MetadataDisplay` component
2. Replace channel selection with `ChannelSelector` component
3. Replace analysis controls with `AnalysisControls` component
4. Replace results display with `ResultsDisplay` component

**Testing:** Verify UI renders correctly and all interactions work

#### Step 5: Clean Up (Priority: Low)
**Remaining tasks:**
- Remove unused state variables
- Remove duplicate code
- Update type definitions to use centralized types
- Add JSDoc comments
- Optimize performance

## 📋 Next Steps

### Immediate Actions:
1. **Start with Step 1** - Replace Pyodide initialization
   - This is the safest first step as it's isolated
   - Test thoroughly after completion
   
2. **Continue with Step 2** - Replace file handling
   - Builds on Step 1
   - Test file upload and loading

3. **Proceed incrementally** - One step at a time with testing

### Testing Strategy:
- After each step, test:
  - Pyodide initialization
  - File upload
  - EDF loading
  - Metadata display
  - Channel selection
  - At least one analysis type
  - Results display

### Risk Mitigation:
- Keep the original component as backup
- Use feature flags if needed
- Test in development environment first
- Commit after each successful step

## 📝 Notes

- The component is very large (4282 lines), so refactoring will take time
- Each step should be tested independently
- The hooks and sub-components are already created and ready to use
- Color updates are complete and working
- No functionality should be broken during refactoring

## 🎯 Success Criteria

The refactoring is complete when:
- [ ] `PyodideEDFProcessor.tsx` is under 1000 lines
- [ ] All functionality works as before
- [ ] Code is more maintainable and testable
- [ ] All hooks and sub-components are being used
- [ ] No duplicate code remains
- [ ] Type safety is improved

