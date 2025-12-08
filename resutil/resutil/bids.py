"""BIDS specification utility functions

Utilities for complying to the BIDS specification and CRE procedure:
 - https://bids-specification.readthedocs.io/en/stable/
 - https://optoceutics.greenlight.guru/documents/0182de5d-1475-495e-9fa8-76d5336b46eb/revision/69e5e7b0-91f1-4322-b38e-63e0a8f03ef4/view

Correspondance: Mark Henney, mah@optoceutics.com
"""

from __future__ import annotations
import re
from pathlib import Path
import json
import shutil
import pdb

# Optional imports for Pyodide compatibility
try:
    import mne
    from mne_bids import BIDSPath, write_raw_bids
    HAS_MNE = True
except ImportError:
    HAS_MNE = False
    mne = None
    BIDSPath = None
    write_raw_bids = None

_base_dir = Path(__file__).parent

def build_bids_structure(root: str|Path, project_name: str = None):
    """Build generic EEG-BIDS folder structure

    This function will build the main data folder structure for a project in its
    `<PROJECT-NAME>/data/` folder along with mandatory descriptor files. This
    creates the `sourcedata`, `raw`, and `derivatives` data directories, the 
    `<PROJECT-NAME>/info` directory, and the `info/README.md`,
    `data/dataset_description.json`, and `data/stimuli/stimuli_description.json` files.

    Args:
        root (str | Path): Base path to the main data folder, i.e. `<PROJECT-NAME>/data/`.
        project_name (str, optional): Name of the project.

    Raises:
        ValueError: A value error is raised if the `root` is not given as `str` or 
            a `pathlib.Path` object.

    Example:
        >>> # Assuming your project is compliant with CRE organization (DOC-517)
        >>> root = Path(__file__).parent / "data"
        >>> build_bids_structure(root)

    """

    if isinstance(root, str):
        root = Path(root)
    elif isinstance(root, Path):
        pass
    else:
        raise ValueError("Specify bids_base_dir as `str` or `Path`.")

    root.mkdir(exist_ok=True)

    subdirs = ["sourcedata", "raw", "derivatives", "stimuli"]
    for dir in subdirs:
        subdir = root / dir
        if not subdir.exists():
            subdir.mkdir()

    _make_generic_description(root, project=project_name)
    _make_generic_readme(root)
    _make_generic_stimlus_file(root)
    
def _make_generic_readme(root):
    # Make a generic README files from templates
    info_dir = root.parent / "info" 
    readme_file =  info_dir / "README.md"
    if not readme_file.exists():
        info_dir.mkdir(exist_ok=True)
        src = _base_dir / "templates" / "template_README.md"
        dst = info_dir / "README.md"
        shutil.copy(src, dst)

def _make_generic_description(root, project):
    # Make a genereric dataset description file to be expanded on
    dataset_description_file = root / "dataset_description.json"
    
    if not dataset_description_file.exists():
        if project is None:
            project = root.parent.stem

        generic_dataset_description = {
                "Name": project,
                "BIDSVersion": "v1.7.0"
            }

        with open(root / "dataset_description.json", "w") as write_file:
            json.dump(generic_dataset_description, write_file, indent=4)

def _make_generic_stimlus_file(root):
    # Make a generic stimulus file from templates
    stimuli_dir = root / "stimuli"
    stimuli_dir.mkdir(exist_ok=True)
    stimuli_description_file = stimuli_dir / "stimuli_description.json"

    if not stimuli_description_file.exists():
        template_source = _base_dir / "templates" / "template_STIMULI.json"
        dst = stimuli_dir / "stimuli_description.json"
        print(f"Saving stimulus template to {dst.as_posix()}")
        shutil.copy(template_source, dst)

def _test_bids_structure(clean_: bool = False):
    # Unit test of build_bids_structure.
    # Builds a test structure and asserts the right items are included,
    # then removes the test structure.

    # Safety precaution
    global resutil_test_in_progress
    resutil_test_in_progress = True

    project_name = "test"
    data_dir = Path("./data").resolve()

    # Build temp project folder
    build_bids_structure(root=data_dir, project_name=project_name)
    
    ## Check content
    _check_bids_structure(root=data_dir)

    # Remove again
    if clean_:
        _remove_bids_structure(root=data_dir, project_name=project_name)

def _check_bids_structure(root):
    # Check if all the expected content was created correctly
    # /data/
    data_dir = root
    assert data_dir.exists()

    data_content = [cnt.name for cnt in data_dir.glob("*")]
    data_items = ("sourcedata", "raw", "derivatives", "dataset_description.json")
    assert _check_content(data_content, data_items)

    # /data/stimuli
    stimuli_content = [cnt.name for cnt in (data_dir / "stimuli").glob("*")]
    stimuli_items = ("stimuli_description.json",)
    assert _check_content(stimuli_content, stimuli_items)

    # /info/
    info_dir = root.parent / "info"
    assert info_dir.exists()

    info_content = [cnt.name for cnt in info_dir.glob("*")]
    info_items = ("README.md",)
    assert _check_content(info_content, info_items)

def _check_content(content, items) -> bool:
    for _, item in enumerate(items):
        if not item in content:
            return False
    return True

def _remove_bids_structure(root: str|Path, project_name: str = None):
    if not resutil_test_in_progress:
        raise Exception("This is only for unit testing - I don't want to remove your data.")
    
    shutil.rmtree(root)                     # /<PROJECT>/data/
    #shutil.rmtree(root / "stimuli" )        # /<PROJECT>/data/stimuli/
    shutil.rmtree(root.parent / "info" )    # /<PROJECT>/info/
    
def make_raw_bids(root: str | Path, subject_folder_pattern: str, ses_folder_pattern: str | None, 
                task_id_dict: dict | None, run_id_dict: dict | None, filename_pattern: str, 
                trigger_pattern: str, datatype: str = "EEG"):
    """ Build raw folder content from source.

    This function builds BIDS-compatible raw folder structure and files. It requires specification
    of several project-specific naming patterns to properly navigate the source directory and build
    the raw directory, including the subject-, session-, run-, datafile-, and triggerfile patterns.
    All patterns are required explicitly as inputs, though session- and run patterns can be `None` to
    indicate that there are not multiple of these.

    :ivar str|Path root: 
    :ivar str subject_folder_pattern: 
    :ivar str|None ses_folder_pattern: 
    :ivar dict|None run_id_dict: D
    :ivar str filename_pattern: 
    :ivar str trigger_pattern: 
    :ivar dict|None task_id_dict: 

    Args:
        root (str | Path): Path to project data directory: `/projects/p-<PROJECT-NAME>/data`.
        subject_folder_pattern (str): Entire pattern that prepends the subject number in subject
            folders.
        ses_folder_pattern (str | None): Entire pattern that prepends the session number in session
            folders.
        run_id_dict (dict | None): Dictionary of patterns to map run names to numbers. As there is
            not necessarily more than one run, this can be `None`.
        filename_pattern (str): Pattern to recognize the data file.
        trigger_pattern (str): Pattern to recognize the trigger file.
        task_id_dict (dict | None): Dictionary of patterns to map task names to tasks. As it not 
        uncommon on OC EEG studies to include several tasks (conditions, stimulus types) in a
        single record, this can be `None`.
        datatype (str, optional): Modality from which data was recorded, e.g. EEG or fMRI. Currently
            only implemented for EEG. Defaults to "EEG".

    Raises:
        NotImplemented: If datatype other than "EEG" is given, this exception is raised.
        ValueError: A value error is raised if the `root` is not given as `str` or 
            a `pathlib.Path` object.
    
    Example:
        >>> root = root = Path(__file__).parent / "data"
        >>> subj_pattern = "RESONANCE_P"
        >>> file_pattern = "^RESONANCE_P(\d\d).edf"
        >>> trigger_pattern = "^Record-"

        >>> make_raw_bids(root=root, subject_folder_pattern=subj_pattern,
                        ses_folder_pattern=None, run_pattern=None, task_pattern=None,
                        filename_pattern=file_pattern, trigger_pattern=trigger_pattern)
    """

    if not datatype in ["EEG", "eeg"]:
        raise NotImplemented("Only implemented for EEG at the moment")

    if isinstance(root, str):
        root = Path(root)
    elif isinstance(root, Path):
        pass
    else:
        raise ValueError("Specify project_dir as `str` or `Path`.")
    
    source_dir = root / "sourcedata"
    raw_dir = root / "raw"

    # Iterate over subject folders
    for subj_itm in source_dir.iterdir():
        subject, session, run_no, task = False, False, False, False

        if not source_dir.is_dir():
            continue

        sre = re.search(subject_folder_pattern, subj_itm.name)
        if not sre:
            continue

        subject = int(sre.group(1))

        #subj_dir = source_dir / subj_itm

        # If single session
        if ses_folder_pattern is None:
            session = 1
            
            # If single session
                # iterate over files
            for data_itm in subj_itm.iterdir():
                # Set run number of applicable
                if run_id_dict is None:
                    run_no = 1
                else:
                    # Search for run number pattern identifier
                    for key, value in run_id_dict.items():
                        if re.search(key, data_itm.name):
                            run_no = value
                
                # Set task if applicable
                if task_id_dict is None:
                    task = "na"
                else:
                    # Search for task pattern identifier
                    for key, value in task_id_dict.items():
                        if re.search(key, data_itm.name):
                            task = value

                if re.search(filename_pattern, data_itm.name):
                    file = data_itm
                    assert all((subject, session, run_no, task))
                    _eeg_move_source_to_raw(project_dir=root, data_file_path=file, task=task, 
                                        subject=subject, session=session, run_no=run_no)

                elif re.search(trigger_pattern, data_itm.name):
                    trigger = data_itm
                    trigger_raw_filename = f"sub-{subject:02d}_ses-{session:02d}_run-{run_no:02d}_task-{task}_events.csv"
                    full_dir = raw_dir / f"sub-{subject:02d}" / f"ses-{session:02d}"
                    if not full_dir.exists():
                        full_dir.mkdir(exist_ok=True, parents=True)
                    shutil.copyfile(trigger, full_dir / trigger_raw_filename)

        # if multiple sessions
        else:
            for ses_itm in subj_itm.iterdir():
                sre = re.search(ses_folder_pattern, ses_itm.name)
                session = int(sre.group(1))

                for data_itm in ses_itm.iterdir():
                    # Set run number of applicable
                    if run_id_dict is None:
                        run_no = 1
                    else:
                        # Search for run number pattern identifier
                        for key, value in run_id_dict.items():
                            if re.search(key, data_itm.name):
                                run_no = value
                    
                    # Set task if applicable
                    if task_id_dict is None:
                        task = "na"
                    else:
                        # Search for task pattern identifier
                        for key, value in task_id_dict.items():
                            if re.search(key, data_itm.name):
                                task = value
                    
                    if re.search(filename_pattern, data_itm.name):
                        file = data_itm
                        assert all((subject, session, run_no, task))
                        _eeg_move_source_to_raw(project_dir=root, data_file_path=file, task=task, 
                                            subject=subject, session=session, run_no=run_no)

                    elif re.search(trigger_pattern, data_itm.name):
                        trigger = data_itm
                        trigger_raw_filename = f"sub-{subject:02d}_ses-{session:02d}_run-{run_no:02d}_task-{task}_events.csv"
                        full_dir = raw_dir / f"sub-{subject:02d}" / f"ses-{session:02d}"
                        if not full_dir.exists():
                            full_dir.mkdir(exist_ok=True, parents=True)
                        shutil.copyfile(trigger, full_dir / trigger_raw_filename)

def _eeg_move_source_to_raw(project_dir: Path, data_file_path: str|Path,  
                task: str, subject: int, session: int, run_no: int, line_freq: int = 50):
    # Moves file from source to raw with encoding of subject, session, run numbers.
    # TODO Make annotations here?

    raw_dir = project_dir / "raw"

    if not isinstance(data_file_path, str):
        data_file_path = data_file_path.as_posix()

    raw = mne.io.read_raw_edf(data_file_path)
    raw.info["line_freq"] = line_freq

    session = f"{session:02d}"
    subject = f"{subject:02d}"
    run_no = f"{run_no:02d}"
    bids_file_path = BIDSPath(subject=subject, session=session,
                            task=task, run=run_no, root=raw_dir)

    write_raw_bids(raw, bids_file_path, overwrite=True, verbose=0)