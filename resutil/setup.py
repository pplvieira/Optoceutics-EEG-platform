import os
import os.path as op
import setuptools
from resutil._version import __version__

def package_tree(pkgroot):
    """Get the submodule list."""
    # Adapted from VisPy
    path = op.dirname(__file__)
    subdirs = [op.relpath(i[0], path).replace(op.sep, '.')
               for i in os.walk(op.join(path, pkgroot))
               if '__init__.py' in i[2]]
    return sorted(subdirs)

package = "resutil"

with open("README.md", "r") as fh:
   long_description = fh.read()

setuptools.setup(
    name=package,
    version=__version__,
    author="OptoCeutics",
    author_email="mah@optoceutics.com",
    description="Research utility functions.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://optogit.optoceutics.com/optoceutics/research/resutil",
    install_requires=[
        "matplotlib",
        "markdown",
    ],
    extras_require={
        "full": [
            "mne",
            "mne_bids",
            "EDFlib-Python>=1.0.6",
            "numba",
            "fooof"
        ]
    },
    packages=package_tree('resutil'),
    package_data={package: [
        op.join("templates", "_oc_style.mplstyle"),
        op.join("templates", "template_README.md"),
        op.join("templates", "template_STIMULI.json"),
        op.join("fonts", "Montserrat", "*.ttf"),
        op.join("fonts", "Montserrat", "*.txt"),
        op.join("fonts", "Montserrat", "static", "*.ttf")
    ] },
    #package_dir={"": package},
    include_package_data=True,
    python_requires='>3.7',
)
