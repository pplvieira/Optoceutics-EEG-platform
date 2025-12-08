# Project <PROJECT-NAME>

1. [Contact Information](#contact)
2. [Organization of the Project](#organization)
    1.  [Structure](#structure)
3. [Data](#data)
    1. [Origin](#origin)
    2. [Availability](#availability)
4. [Processing](#processing)
    1. [Dependencies](#dependencies)
    2. [BIDS Conversion](#bids-conversion)
    3. [Functional- & Anatomical MRI Pre-Processing](#preprocessing)
    4. [Notes](#preprocessing-notes)

## Organization of the Project <a name="organization"></a>

### Contact Information <a name="contact"></a>

* Project owner:
* Email:
* Phone:

### Stucture <a name="structure"></a>

├── p-<PROJECT-NAME>                <br/>
│   ├── analysis                    <br/>
│   └── data                        <br/>
│   │   ├── sourcedata              <br/>
│   │   └── raw                     <br/>
│   │   │   ├── sub-01              <br/>
│   │   │   │   ├── ses-01          <br/>
│   │   │   │   │   ├── anat        <br/>
│   │   │   │   │   └── func        <br/>
│   │   │   │   └── ses-02          <br/>
│   │   │   └── sub-02              <br/>
│   │   └── derivatives             <br/>

## Data <a name="data"></a>

### Origin <a name="origin"></a>

Data originates from the study _ISFLIGHT_, collected under the protocol:

 _A Study of the Critical Flicker Fusion Frequency Color Dependency
and EEG SVEEP Signal Response Extended Beyond RGB (ISFLIGHT
Pilot): a pilot exploratory study_,

with application number `COMP-IRB-2021-01`, approved by the DTU Compute IRB on 25-April-2021.

### Availability <a name="availability"></a>

The data is currently only available to the data controller, DTU Compute, and the data processor, DTU Fotonik.

### Variability

To be described

## Processing <a name="processing"></a>

### Dependencies <a name="dependencies"></a>

Python libraries are specified by `analysis/requirements.txt` and can be installed with 

```bash
python -m pip install -r requirements.txt
```

### BIDS Conversion <a name="bids-conversion"></a>

Conversion of source DICOM data from `data/sourcedata/DICOM/` to BIDS-compliant raw data in `data/raw/` is performed in the latter part of the `analysis/bidsify_adni.py` script. This will generate a batch file, `analysis/dcim2niix_batch_config.yml`, for `dcim2niix`, which, is subsequently used to make the conversion from source data in DICOM format to raw data in NIfTI (gzip archvive) format.

### Functional- & Anatomical MRI Pre-Processing <a name="preprocessing"></a>

Pre-processing is controlled through the `analysis/run_fmriprep.sh` script, which specifies subjects to pre-process and runs _fMRIPrep V21.0.1_ through a _singularity_ container. The array of subjects can be modified to handle processing of specific subjects or simple iterate over the subjects available in the `data/raw/` directory. Boilerplate text about the specific pre-processing steps is available on a by-subject level in the `derivatives/` directory.

### Notes <a name="preprocessing-notes"></a>

1. At initial conversion of source- to raw data, it was not at first discovered that som sessions contained multiple runs, and thus `dcim2niix` handled the duplicate file names by appending alphabetical characters to files. At executing, `analysis/run_fmriprep.sh` iterates over all subjects, and if offending (to the BIDS specification) file names are found, the given subjects is ignored. This lead to several subjects not being pre-processed, so to rectify the situation, the script `analysis/check_mdata.py` was written to find discrepencies between the raw- and derivative data and write the subject- and session IDs to the file `analysis/unprocessed_data.csv`. This was used in the re-run of pre-processing, specified in `analysis/run_fmriprep.sh`, to select which subjects to retry.
2. It was discovered that some runs had been prematurely terminated and retried, and thus had a similar issue at converting from DICOM to NIfTI. Thus, `analysis/unprocessed_data.csv` was modified to analyze the fMRI file sizes from the subjects that were skipped ind the first round and delete those smaller than 5 MBytes.