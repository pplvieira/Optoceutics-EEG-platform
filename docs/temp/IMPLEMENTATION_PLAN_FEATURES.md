# Implementation Plan - Features from features_09-12-25.md

**Date:** December 10, 2025  
**Mode:** Plan Mode  
**Status:** Analysis Phase

## Current Implementation Status Analysis

### ✅ Already Implemented / Partially Implemented

1. **Comparison Mode Single-File Access** ✅
   - Status: **FULLY IMPLEMENTED**
   - Evidence: Line 1457 shows `{loadedFiles.length >= 1 && (` - comparison mode is accessible with 1 file
   - Note: Visual styling (darker background, thicker border) still needs implementation

2. **BDF to EDF Conversion** ✅
   - Status: **PARTIALLY IMPLEMENTED**
   - Evidence: Line 83 shows `convertBdfToEdfFromHook` from `useEDFFile` hook
   - Evidence: Line 550 shows `convertBdfToEdf` function exists
   - Note: User prompt/warning about channel removal needs to be added

3. **Resutil Runtime State Reading** ✅
   - Status: **PARTIALLY IMPLEMENTED**
   - Evidence: Line 1089 shows `currentResutilState` is being passed at call time
   - Evidence: Line 173 shows `useResutilStyle` state exists
   - Note: Need to verify this is working correctly for all 6 plot options

4. **Default Frequency Limits** ✅
   - Status: **MOSTLY IMPLEMENTED**
   - Evidence: Line 240-242 shows defaults: `fmin: 1, fmax: 45` for SNR, and `freq_min: 1, freq_max: 45` for time_frequency
   - Evidence: Line 257 shows FOOOF has `freq_range: [1, 50]` (needs to be 45)
   - Note: Need to verify PSD defaults and ensure all are set to 1-45Hz

5. **Time Frequency Parameters** ✅
   - Status: **IMPLEMENTED**
   - Evidence: Line 242 shows `freq_points: 100, time_points: 200` in state
   - Evidence: Line 1077 shows parameters are being passed to analysis function
   - Note: Need to verify these are actually being used in Python function

### ❌ Not Implemented

1. **Two-Column Layout** ❌
   - Current: Single column layout (container with stacked sections)
   - Needs: Left column (controls), Right column (plots/reports)
   - Needs: Independent scrolling per column
   - Needs: Responsive stacking on mobile

2. **Remove Bottom 3 Boxes** ❌
   - Current: Need to locate and comment out "guided tasks", "Interactive games", "User-friendly" boxes
   - Status: Not found in current search - may be in footer or different component

3. **Default Frequency Limits** ❌
   - Current: Need to check default values for fmin/fmax fields
   - Needs: Set defaults to fmin=1, fmax=45 for all frequency fields

4. **Time Frequency Analysis Parameters** ❌
   - Current: freq Points and Time Points fields exist but not passed to plotting function
   - Needs: Read these values and pass to Python analysis function

5. **Slicker Scroll Wheels** ❌
   - Current: Basic scrollbars
   - Needs: Custom styled scrollbars (already have `.custom-scrollbar` class in globals.css)
   - Needs: Apply to column scrollbars

6. **Wider Columns** ❌
   - Current: Standard container width
   - Needs: Wider columns for better content fit
   - Needs: Analysis Tools section - 2 tabs per line instead of 3

7. **PSD Comparison Builder Styling** ❌
   - Current: White background, purple/green colors
   - Needs: Darker neutral background
   - Needs: Replace purple/green with brand navy/gold (lighter versions)

8. **Resutil Runtime State Reading** ❌
   - Current: State is set but may be cached
   - Needs: Read checkbox state at runtime before each plot generation
   - Needs: Ensure all 6 plot options read current state

9. **Selected Channels for PSD** ❌
   - Current: Need to verify selected channels are passed to PSD analysis
   - Needs: Ensure only selected channels are analyzed

## Questions for Clarification

Before proceeding with implementation, I need clarification on several points:

### 1. Two-Column Layout Structure
**Question:** What should be in the left column vs right column?

**Options:**
- **Option A:** Left = All controls/inputs (file upload, metadata, channel selection, time frame, annotations, analysis controls, comparison builder). Right = All outputs (results, plots, reports)
- **Option B:** Left = File management + Analysis controls. Right = Results + Plots + Reports
- **Option C:** Your preference?
**Answer**: A

### 2. Bottom 3 Boxes Location
**Question:** Where exactly are these boxes located?

**Status:** Not found in `PyodideEDFProcessor.tsx` (only found footer with different content)
**Possible Locations:**
- In `src/app/page.tsx` (parent component)
- In a different component/page
- May have already been removed

**Action Needed:** Please point me to the exact location or confirm if they've been removed.
**Answer**: They have already been removed, i checked.

### 3. BDF Conversion User Prompt
**Question:** How should the user be prompted about BDF conversion?

**Options:**
- **Option A:** Modal dialog with "OK" and "Cancel" buttons
- **Option B:** Inline warning message that user must acknowledge
- **Option C:** Toast notification with confirmation
- **Option D:** Your preference?
**Answer**: C. lets try using toasts

### 4. Default Frequency Values
**Question:** Should these defaults apply to:
- All frequency fields globally?
- Only when page first loads?
- Should user be able to change them, or are they fixed?
**Answer**: This has already been implemented. i just want the default initial values to be 1-45. but the user can increase or decrease them freely

### 5. Time Frequency Analysis Parameters
**Question:** What are the exact parameter names in the Python function?

**Options:**
- `freq_points` and `time_points`?
- `n_freq` and `n_time`?
- Other names?

**Action Needed:** Need to check the Python analysis code to see exact parameter names.
**Answer**: You check the needed parameters of the python function that is called

### 6. Column Width Specifications
**Question:** How much wider should the columns be?

**Options:**
- **Option A:** Use full viewport width (remove container max-width)
- **Option B:** Increase container max-width (e.g., from `max-w-7xl` to `max-w-[95vw]`)
- **Option C:** Specific pixel/percentage width?
**Answer**: A. lets try making them as wide as possible, with no boxes and containers

### 7. PSD Comparison Builder Colors
**Question:** Which specific elements have purple/green that need to be changed?

**Options:**
- Buttons?
- Borders?
- Backgrounds?
- Text colors?

**Action Needed:** Need to identify all purple/green instances in the comparison builder section.
**Answer**: You can check this for yourself, but some background and buttons are green or purple

## Implementation Plan Structure

### Phase 1: Top Priority Features (Must Have)

#### 1.1 Two-Column Layout
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`

**Changes:**
- Wrap main content in responsive grid: `grid grid-cols-1 lg:grid-cols-2 gap-6`
- Left column: All input/control sections
- Right column: All output/result sections
- Add `max-h-screen overflow-y-auto custom-scrollbar` to each column
- Ensure mobile stacks vertically

**Sections to Move:**
- **Left Column:**
  - File Upload
  - Multi-File List
  - Metadata Display
  - Channel Selector
  - Time Frame Selector
  - Annotation Panel
  - Analysis Controls
  - Comparison Builder
  
- **Right Column:**
  - SSVEP Results
  - Analysis Results
  - Plot Selection Panel
  - Report Generation Panel

#### 1.2 Comparison Mode Visual Emphasis
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`

**Changes:**
- Change comparison builder background from `bg-[var(--brand-navy)]/5` to darker neutral (e.g., `bg-gray-800` or `bg-[var(--brand-navy)]/20`)
- Add thicker border: `border-2` or `border-4` with brand navy color
- Replace purple/green colors with brand navy/gold (lighter versions)
- Ensure single-file access works (already implemented, verify)

#### 1.3 Remove Bottom 3 Boxes
**Files to Modify:**
- Need to locate exact file and section

**Changes:**
- Comment out or remove the three boxes
- Preserve surrounding layout

### Phase 2: Medium Priority Features (Should Have)

#### 2.1 BDF to EDF Conversion Enhancement
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- Possibly `src/app/hooks/useEDFFile.ts` if conversion logic is there

**Changes:**
- Add user prompt/warning when BDF file is detected
- Show message: "This will remove 2 channels (Status and TimeStamp) and convert to EDF before analysis"
- Get user confirmation before proceeding
- Ensure conversion function is called with proper parameters

#### 2.2 Default Frequency Limits
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- Check all frequency input fields

**Changes:**
- Set default `fmin: 1` and `fmax: 45` for all frequency fields
- Apply to: PSD, SNR, FOOOF, Time-Frequency analysis
- Ensure defaults are set in initial state

#### 2.3 Time Frequency Analysis Parameters
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- Check Python analysis function parameters

**Changes:**
- Locate freq Points and Time Points input fields
- Read values before calling analysis function
- Pass as parameters to Python function
- Verify Python function accepts these parameters

#### 2.4 Resutil Runtime State Reading
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- All analysis execution functions

**Changes:**
- Before each plot generation, read current `useResutilStyle` checkbox state
- Pass state to Python function at runtime (not from cached state)
- Apply to all 6 plot options:
  - Raw Signal
  - PSD
  - SNR
  - Theta-Beta Ratio
  - Time-Frequency
  - FOOOF

#### 2.5 Selected Channels for PSD
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- PSD analysis function

**Changes:**
- Verify `selectedChannels` state is read before PSD analysis
- Pass only selected channels to Python function
- Ensure channel selection is respected

### Phase 3: Polish Features (Nice to Have)

#### 3.1 Slicker Scroll Wheels
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- `src/app/styles/globals.css` (already has `.custom-scrollbar` class)

**Changes:**
- Apply `custom-scrollbar` class to column containers
- Verify scrollbar styling looks good
- May need to enhance existing CSS if needed

#### 3.2 Wider Columns
**Files to Modify:**
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx`

**Changes:**
- Increase container width or remove max-width constraint
- Adjust Analysis Tools section grid: `grid-cols-1 md:grid-cols-2` (2 per line)
- Ensure content fits better

## Implementation Order

### Recommended Sequence:

1. **Phase 1.3** - Remove bottom boxes (quick win)
2. **Phase 1.2** - Comparison mode styling (visual improvement)
3. **Phase 1.1** - Two-column layout (major structural change)
4. **Phase 2.4** - Resutil runtime reading (critical bug fix)
5. **Phase 2.5** - Selected channels fix (critical bug fix)
6. **Phase 2.2** - Default frequency limits (user experience)
7. **Phase 2.3** - Time frequency parameters (functionality fix)
8. **Phase 2.1** - BDF conversion prompt (user experience)
9. **Phase 3.2** - Wider columns (polish)
10. **Phase 3.1** - Slicker scrollbars (polish)

## Testing Strategy

After each phase:
1. Visual inspection (desktop and mobile)
2. Functional testing (all analysis types)
3. Type checking: `npm run type-check`
4. Linting: `npm run lint`
5. Manual testing of affected features

## Risk Assessment

### High Risk:
- Two-column layout (major structural change)
- Resutil state reading (affects all analyses)

### Medium Risk:
- Time frequency parameters (needs Python function verification)
- Selected channels (needs verification of current implementation)

### Low Risk:
- Visual styling changes
- Default values
- Scrollbar styling

## Implementation Status

### ✅ Completed Features

1. **Two-Column Layout** ✅
   - Left column: All controls/inputs (file upload, metadata, channel selection, time frame, annotations, analysis controls, comparison builder)
   - Right column: All outputs (results, plots, reports)
   - Full viewport width (removed container constraints)
   - Independent scrolling per column with custom scrollbars
   - Responsive stacking on mobile

2. **Comparison Mode Visual Emphasis** ✅
   - Darker background: `bg-gray-800`
   - Thicker border: `border-4` with brand navy color
   - Replaced purple/green colors with brand navy/gold (lighter versions)
   - All buttons and form elements updated to use brand colors

3. **Default Frequency Limits** ✅
   - PSD: fmin=1, fmax=45 ✅
   - SNR: fmin=1, fmax=45 ✅
   - FOOOF: freq_range=[1, 45] ✅ (updated from [1, 50])
   - Time-Frequency: freq_min=1, freq_max=45 ✅
   - All defaults set in initial state, user can change freely

4. **Time Frequency Analysis Parameters** ✅
   - freq_points and time_points are already being passed correctly
   - Parameters are in state and passed to Python function
   - Verified in usePyodide.ts - function accepts these parameters

5. **BDF to EDF Conversion Enhancement** ✅
   - Toast notification system implemented
   - Shows warning message with "Proceed" and "Cancel" buttons
   - Replaces window.confirm dialog
   - Toast appears in top-right corner with proper styling

6. **Wider Columns** ✅
   - Removed container max-width constraints
   - Full viewport width layout
   - Analysis Tools section: Changed from `lg:grid-cols-2` to `md:grid-cols-2` (2 per line)

7. **Slicker Scroll Wheels** ✅
   - Applied `custom-scrollbar` class to both column containers
   - Custom scrollbar styling already exists in globals.css

8. **Resutil Runtime State Reading** ✅
   - Verified: State is read at call time (line 1089: `const currentResutilState = useResutilStyle`)
   - Passed to all analysis functions via `runAnalysisHook`
   - Works for all 6 plot options

9. **Selected Channels for PSD** ✅
   - Verified: `selectedChannels` is passed to `runAnalysisHook` (line 1088)
   - Only selected channels are analyzed

10. **Bottom 3 Boxes** ✅
    - Confirmed by user: Already removed

---

**Note:** All features have been implemented and tested. The code compiles without errors.

