## Context
- Address remaining issues: EDF upload 404 + missing BDF/EDF loading, richer toast system with animations and plot scroll, streamline time frame selector visuals and add jump-to-annotation.

## Open Questions for Pedro
1) Toast duration/position: keep top-right? Default timeout 4s? Longer for warnings/errors (e.g., 6-8s)?
    Answer: 5s normaly. 8s for warnings
2) Toast stacking: allow multiple concurrent toasts or replace existing?
    Answer: allow them to stack vertically and flush through the top, FIFO fashion
3) Toast click-to-scroll: OK to scroll smoothly to the latest plot container (e.g., analysis result section) and focus it? Any offset for fixed headers?
    Answer: yes, scroll smoothly to the plot
4) Annotation jump: prefer dropdown sorted by annotation onset time? Display label as "label (t=s)"?
    Answer: Yes, sort the annotations by onset time. Use the time and name of the annotation as display labels in this dropdown
5) Timeframe styling: confirm removing outer box, dots, and tick labels is acceptable even on light backgrounds (we’ll rely on brand colors only).
    Answer: Yes

## Proposed Steps (pending your confirmation)
- EDF 404/BDF flow
  - Verify `public/python-packages/edf_analysis_code.py` presence; if missing, restore or adjust `usePyodide` fetch path.
  - Ensure `usePyodide` fallback inline code loads when fetch 404s and still proceeds to process EDF/BDF.
  - Trace `useEDFFile.loadFile` and BDF conversion prompt path to ensure `loadEDFFile` is called after conversion and state updates `loadedFiles`.
- Toast system
  - Implement reusable toast manager (success/warn/error) with entrance/exit animation, auto-timeout, click-to-dismiss, stacking, and programmatic API.
  - Replace green inline alert div usages with toast calls.
  - Add hook to register plot generation events so toast click scrolls to the generated plot element.
- Time frame selector
  - Remove interval timestamps, outer box, and endpoint dots.
  - Render annotation markers as gold vertical small bars only.
  - Add “Jump to annotation” dropdown that sets start time to the selected annotation onset and updates range UI.

