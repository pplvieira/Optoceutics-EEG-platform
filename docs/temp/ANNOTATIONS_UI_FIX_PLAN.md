# Annotations & UI Fix Plan

## Issues Identified
1. BDF annotations extracted but not showing in annotations tab
2. React key warning when switching files (missing annotation IDs)
3. Average reference vs baseline correction consideration

## Implementation Steps
1. ✅ Check how annotations flow from metadata to useAnnotations hook
2. ✅ Add unique IDs to BDF annotations (missing for React keys)
3. ✅ Switch to baseline correction (DC offset per channel) as default, keep avg ref as toggle
4. 🔄 Test annotation display and file switching

## Questions for User
1. Switch to baseline correction? **YES** - make it a toggle, default to DC offset
2. Keep average reference? **YES** - as toggle option
3. Any specific annotation ID format needed? **NO** - recover manually from BDF reading

## Implementation Summary
- ✅ Added toggle for average reference vs DC offset correction, defaulting to DC offset
- ✅ Added unique IDs (`bdf_ann_{i}`) and real_time calculation to BDF annotations
- ✅ Updated BDF processing to use DC offset correction by default (preserves channel relationships)
- ✅ Ensured BDF annotations flow to UI with proper structure like EDF annotations
- ✅ All linting and type checking passes
