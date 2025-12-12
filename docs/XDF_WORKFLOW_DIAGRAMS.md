# XDF Workflow Diagrams

## Overview
This document outlines the data and metadata flow for EDF and BDF files through the EEG platform, from file upload to UI display.

## EDF File Workflow

```
File Upload → loadEDFFile() → read_edf_file() (Python)
    ↓
MNE.read_raw_edf() → Extracts annotations automatically
    ↓
extract_annotations() → Creates annotation objects with IDs
    ↓
Returns metadata {annotations: [...], ...}
    ↓
PyodideEDFProcessor.addFile() → setAnnotations(parsedResult.annotations)
    ↓
useAnnotations hook → annotations state
    ↓
AnnotationPanel → UI display ✅
```

**Key Points:**
- Annotations extracted by MNE's built-in EDF reader
- Annotations have IDs: `edf_ann_0`, `edf_ann_1`, etc.
- Annotations include `real_time` calculated from `meas_date`
- `setAnnotations()` called in `addFile()` function
- "Reloaded file data into Python" happens after loading

## BDF File Workflow (Fixed)

```
File Upload → loadEDFFile() → BDF in-memory processing (Python)
    ↓
mne.read_raw_bdf() → MNE handles annotations automatically
    ↓
raw.annotations (same as EDF) → Processed with IDs: bdf_ann_0, bdf_ann_1, etc.
    ↓
Returns metadata {annotations: [...], ...}
    ↓
PyodideEDFProcessor.addFile() → setAnnotations(parsedResult.annotations) ✅
    ↓
useAnnotations hook → annotations state ✅
    ↓
AnnotationPanel → UI display ✅
```

**Fixed Issues:**
- ✅ Use MNE's built-in BDF annotation handling (same as EDF)
- ✅ Added `setAnnotations()` call for BDF files in addFile()
- ✅ File switching properly updates annotations via switchToFile()

## BDF File Workflow (Proposed Fix)

```
File Upload → loadEDFFile() → BDF processing (Python)
    ↓
mne.read_raw_bdf() → Let MNE handle annotations automatically
    ↓
raw.annotations (should work same as EDF)
    ↓
extract_annotations() → Same logic as EDF
    ↓
Returns metadata {annotations: [...], ...}
    ↓
PyodideEDFProcessor.addFile() → setAnnotations(parsedResult.annotations)
    ↓
useAnnotations hook → annotations state
    ↓
AnnotationPanel → UI display ✅
```

## File Switching Workflow

```
User clicks file in Loaded Files tab
    ↓
setActiveFileId(fileId)
    ↓
useEffect(activeFileId) → switchToFile(fileId)
    ↓
Updates currentFile, metadata, annotations
    ↓
Should trigger analysis tab updates ❓
```

**Potential Issues:**
- Analysis tab may not be listening to activeFileId changes
- May need additional useEffect to update analysis data

## Data Flow Summary

### Variables Passed Around:

**EDF:**
- `parsedResult.annotations` → `setAnnotations()` → `useAnnotations.annotations`
- `current_edf_data` (Python global) → MNE Raw object
- `metadata` → UI display

**BDF:**
- `bdfMetadata.annotations` → `setAnnotations()` ❓ → `useAnnotations.annotations` ❓
- `current_edf_data` (Python global) → MNE Raw object
- `metadata` → UI display

### Key Differences:
1. EDF uses `read_edf_file()` → automatic annotation extraction
2. BDF uses custom in-memory processing → should use same annotation logic
3. Both should call `setAnnotations()` in `addFile()` but BDF may be missing this
4. File switching should update all UI components but may not be working for analysis tab
