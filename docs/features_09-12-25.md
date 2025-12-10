
# New features


## Features overview - top priority

### 2 columns
- The web app under the browser python tab should have 2 columns. One on the left with all the analysis commands and buttons, and one on the right just for the plots when they eventually are generated along with the auto report function. 
- Each column can have their own independent scroll function. Dont change any of the functionality, this is mostly visual
- In mobile mode, or in a thin window, these 2 columns can go on top of each other like they are doing now

### Comparison mode
- I want comparison mode to stand out from the other analysis tabs. Change the background of the comparison mode tab to be darker, and include a thicker line separating it from the other tabs.
- Another thing: make it so users can access comparison mode after just one EDF has been submitted instead of only after 2.

### Remove 3 boxes in bottom of the screen
- There are 3 boxes in the bottom of the screen ("guided tasks", "Interactive games" and "User-friendly"). I want you to comment those out, as they are not appropriate.

### Note on recent infra/validation update
- Next.js upgraded to **15.5.5/15.5.7** (resolves prior Vercel warning).
- Validation commands now passing: `npm run type-check`, `npm run lint` (warnings acknowledged), `npm test`, `npm run build`.
- Pre-deploy helper: `npm run validate` (type-check + build).


## Features overview - medium priority
### BDF to EDF conversion
- There is a weird problem when uploading BDF files, that the numeric data is in a different basis and there is a conversion problem when reading it as a EDF.
- I will paste here a snippet of code i was using to convert BDF to EDF files before analyzing them. I want you to prompt the user when they upload a .BDF file, saying that this will remove 2 channels from the data and convert to EDF before analysis. Adapt the code below and call it when the user uploads a BDF file.
```python
raw = mne.io.read_raw_bdf(fname, preload=True)

# 2. Extract events (if they aren't already in raw.annotations)
# MNE usually does this automatically, but just in case:
if len(raw.annotations) == 0:
    events = mne.find_events(raw)
    annot = mne.annotations_from_events(events, sfreq=raw.info['sfreq'])
    raw.set_annotations(annot)

# 3. Drop the Status channel
# BioSemi status channel is usually named 'Status'
if 'Status' in raw.ch_names:
    print("Dropping 'Status' channel to prevent EDF header overflow...")
    raw.drop_channels(['Status'])

if 'TimeStamp' in raw.ch_names:
    print("Dropping 'TimeStamp' channel to prevent EDF header overflow...")
    raw.drop_channels(['TimeStamp'])


raw_new_ref = raw.copy()


# 4. Export to EDF
output_fname = fname[:-4] + ".edf"
# Only use this if dropping the channel is not an option
mne.export.export_raw(
    output_fname + ".edf", 
    raw_new_ref, 
    fmt='edf',
    # Force the header to write 'auto' or a specific range like [-1000, 1000]
    # Note: This might distort the signal scaling if not careful.
    #physical_range="auto" 
    # physical_range=[-1000000, 1000000],
    overwrite=True 
)
```


### Default frequency limits
- Make sure that, for all fields in the web app that have a Min freq and max freq field, the min freq is defaulted to 1 and the max to 45Hz when the page is first loaded
- In the time frequency analysis tab, changing the freq Points or Time Points doesnt change anything in the plot itself. Meaning that i think the web app fields are not read and passed on to the plotting function before calling it

### Slicker scroll wheels
- Make the 2 scroll wheels of each of the 2 columns slicker and more discrete, with a prettier custom design

### Wider columns
- Make the 2 vertical columns wider so the stuff inside them fits better.
- In the Analysis Tools section, make the 6 plot option tabs be 2 per each line (instead of 3 as they are now).

### Make the PSD Comparison Builder stand out more
- by changing the background color of the PSD Comparison Builder white background tab to something a bit darker but still neutral. 
- There are also some purple and green colors in this tab. Swap them for some other color from the brand design guide (@src/app/styles/globals.css). Possibly a much lighter version of the brand navy or gold.

### Resutil deselection problem
- In the Analysis Tools tab, when I select then deselect the Resutil button, the plots come out with the resutil on. I want the plots to be generated with the actual settings selected in the web app. 
- Make sure that before every one of the 6 plot options is pressed, the functions actually read the page buttons, toggles and fields for the user information and sends that information to the plotting functions. This is especially a problem with the time frequency analysis. 
- Also make sure that the selected channels on the top of the page are the ones being sent for plotting the PSD and none else




## Detailed Implementation plan
(HERE YOU WILL OUTLINE THE IMPLEMENTATION PLAN FOR EACH OF THE FEATURES)

### Top Priority Features

#### Two-column layout (Browser Python tab)
- Files to adjust: main Browser Python page/layout that renders analysis controls and plots (e.g., `src/app/components/edf-processor/PyodideEDFProcessor.tsx` or its parent container).
- Layout/styling:
  - Use a responsive grid/flex: desktop → two columns (left: controls/actions; right: plots/reports), mobile → stacked (current behavior).
  - Apply brand palette from `src/app/styles/globals.css`; preserve existing spacing/containers.
  - Independent scroll: add `max-h` and `overflow-auto` per column while keeping the overall page scrollable on small screens.
- Functionality:
  - No logic changes to analysis; only layout/structure adjustments.
- Testing:
  - Desktop: verify split columns and independent scrolling; ensure no horizontal overflow.
  - Mobile/narrow: verify stacked layout and usable scroll.

#### Comparison mode emphasis + single-file access
- Files to adjust: comparison tab/panel within the Browser Python UI (where comparison mode is toggled/enabled).
- Visual changes:
  - Darker background for the comparison tab and thicker divider/border to distinguish it from other tabs, using brand colors.
  - Maintain consistent typography and padding with existing tabs.
- Logic changes:
  - Allow entering comparison mode when at least one EDF is loaded (remove the two-file gating).
  - If only one file is present, show inline guidance to add a second file but do not block access.
- Testing:
  - One-file scenario: comparison tab accessible; guidance displayed instead of blocking.
  - Two-file scenario: existing comparison flow unchanged.

#### Remove bottom three boxes
- Files to adjust: section rendering “guided tasks”, “Interactive games”, “User-friendly” at the bottom of the Browser Python view/page.
- Change:
  - Comment out or remove the rendering of these three boxes; leave surrounding layout intact.
- Testing:
  - Verify the bottom section no longer displays these boxes and the layout remains clean on desktop/mobile.