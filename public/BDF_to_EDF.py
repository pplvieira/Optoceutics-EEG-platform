#%%
import glob
import mne
import os

#%%
# FIND FILES
folder = 'Pedro/Pedro/session 2' ### CHANGE FOLDER

files = glob.glob(folder + '/*ExG.bdf')
files = glob.glob(folder + '**/*ExG.bdf', recursive=True)
files_str = "\n  -" + '\n  -'.join(files)
files_str = "".join([f'\n  - [{i}] - {file}' for i,file in enumerate(files)])
print(f"FILES FOUND: {files_str} \n")

#%%
### CHOSE FILE FROM LIST
fname = files[0] # change number

print(f"File chosen: {fname}")

#%%
# 1. Load the BDF file
# explicit encoding helps with BioSemi status parsing
# fname = "your_file.bdf"
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


# 4. Re reference
do_rereferencing = False ###
if do_rereferencing:
    raw_new_ref = raw.copy().set_eeg_reference(ref_channels="average")
else:
    raw_new_ref = raw.copy()


# 4. Export to EDF
output_fname = fname[:-4] + ".edf"
# Only use this if dropping the channel is not an option
mne.export.export_raw(
    files[0][:-4] + ".edf", 
    raw_new_ref, 
    fmt='edf',
    # Force the header to write 'auto' or a specific range like [-1000, 1000]
    # Note: This might distort the signal scaling if not careful.
    #physical_range="auto" 
    # physical_range=[-1000000, 1000000],
    overwrite=True 
)

print("Export successful!")
# %%
