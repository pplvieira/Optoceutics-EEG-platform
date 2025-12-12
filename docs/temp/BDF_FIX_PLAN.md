# BDF Processing Fix Plan

## Issues Identified
1. After BDF in-memory processing, system re-reads original BDF file as EDF, losing processed data & annotations
2. UI shows raw BDF data (high DC offset) instead of avg-ref processed data
3. Annotations from BDF processing not used in UI

## Implementation Steps
1. Modify useEDFFile.ts: For BDF files, store processed Raw object in Pyodide globals (like EDF files)
2. Update usePyodide.ts: Check if BDF-processed data exists, use it instead of re-reading file
3. Keep EDF reading logic unchanged for actual EDF files
4. Ensure annotations from BDF processing are passed to annotation manager
5. Test with BDF file to confirm avg ref, annotations, and no errors

## Questions for User
1. Store processed MNE Raw in globals? **YES** - store just like EDF files
2. Apply volt scaling in Python? **NO** - just what we discussed (avg ref + optional HP)
3. Keep EDF fallback for non-BDF? **YES** - EDF files should read directly as EDF, no BDF workflow

## Implementation Summary
- ✅ Modified BDF Python script to store `current_edf_data = raw` and `current_metadata = metadata` in globals
- ✅ Added `convertedFromBdf: true` flag to EDFMetadata interface and BDF processing
- ✅ Modified reloadActiveFile useEffect to skip reloading for BDF files
- ✅ All linting and type checking passes
