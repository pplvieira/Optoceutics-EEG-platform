# Medium-Priority Features – Draft Plan (TEMP)

## Scope
- BDF ➜ EDF conversion prompt & pipeline (drop Status/TimeStamp; convert before analysis).
- Default frequency limits + ensure time-frequency params propagate to plotting.
- UI polish: slicker scrollbars, wider columns, 2-per-row plot option tabs.
- PSD Comparison Builder styling refresh (neutral darker bg, brand-friendly accents).
- Resutil toggle correctness: plots must respect current toggles/channels at click time.

## Proposed approach (outline)
1) BDF conversion flow
   - Detect .bdf upload; prompt user about channel drop + conversion.
   - Run conversion in Pyodide (or client worker) using mne logic; ensure temp naming and state updates.
   - Store converted EDF bytes and metadata; proceed as normal EDF load.

2) Frequency defaults & param propagation
   - Initialize all min/max freq fields to 1/45 on mount.
   - Verify time-frequency (freq_points/time_points) are read before calling Python; pass along channel selection.
   - Add guards to ensure current UI selections are pushed into Python globals at execution time.

3) UI polish
   - Scrollbars: apply custom slim styles (brand-neutral) to the two main columns.
   - Wider columns + 2-per-row plot option tabs; adjust responsive breakpoints.
   - PSD Comparison Builder: darker neutral background; swap purple/green accents to light navy/gold variants.

4) Resutil toggle correctness
   - Before each analysis run, read the current toggles (resutil, channels, params) and pass to Python.
   - Add tests/console assertions to verify toggles propagate.

## Open questions for you
- Do you want the BDF→EDF conversion to always auto-run after consent, or allow “analyze BDF without conversion” as a fallback?
  - A: Autorun the conversion, but if it somehow fails, make a fallback exception to analyze without conversion, warning the user that the conversion failed
- Any preference for scrollbar colors (light navy vs subtle gray), and for the comparison builder background (light navy tint vs light gold tint)?
  - Just make the scrollwheels thinner and more invisible. For the comparison plot, make it light gold
- Time-frequency: OK to clamp user freq inputs to [1, 45] as defaults and prevent invalid ranges?
  - No, i just want you to set the defaults in the fields when the user refreshes the page to be 1-45. The user can than manually go below or above those limits
- For resutil toggle, is the desired default OFF when page loads?
   - yes it is off and the plots are without resutil as expected. But the problem is as soon as i check the resutil the first time, all the subsequent plots use resutil, even if the checkbox is off when i use it.

## Files likely touched (estimate)
- `src/app/components/edf-processor/PyodideEDFProcessor.tsx` (upload flow, defaults, param wiring, layout tweaks, styling hooks).
- `src/app/components/edf-processor/ResultsDisplay.tsx` (if any layout/tab grid tweaks spill over).
- `src/app/hooks/usePyodide.ts` or upload handlers (BDF detection and conversion glue).
- `src/app/styles/globals.css` (scrollbar and neutral color tokens) or a scoped CSS module.

## Validation
- Commands: `npm run type-check`, `npm run lint`, `npm test`, `npm run build`.
- Manual: upload BDF → see prompt → conversion runs → EDF loads → channels reduced; run each analysis tab ensuring params respected and resutil toggle honored; verify layout changes and scrollbars visually.

