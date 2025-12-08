"""
Optoceutics Custom Plotting Utilities (resutil_oc)
Custom matplotlib styling for Optoceutics EEG analysis reports
"""

import matplotlib.pyplot as plt
import matplotlib as mpl

def set_oc_style():
    """
    Apply Optoceutics custom plot styling using matplotlib rcParams
    """
    # Set custom style parameters
    plt.style.use('seaborn-v0_8-darkgrid' if 'seaborn-v0_8-darkgrid' in plt.style.available else 'default')

    # Custom color palette (Optoceutics brand colors)
    colors = ['#2E86AB', '#A23B72', '#F18F01', '#C73E1D', '#6A994E']
    mpl.rcParams['axes.prop_cycle'] = mpl.cycler(color=colors)

    # Grid and background
    mpl.rcParams['axes.facecolor'] = '#F8F9FA'
    mpl.rcParams['axes.edgecolor'] = '#2C3E50'
    mpl.rcParams['axes.linewidth'] = 1.2
    mpl.rcParams['axes.grid'] = True
    mpl.rcParams['grid.alpha'] = 0.3
    mpl.rcParams['grid.linestyle'] = '--'
    mpl.rcParams['grid.linewidth'] = 0.8

    # Figure background
    mpl.rcParams['figure.facecolor'] = 'white'
    mpl.rcParams['savefig.facecolor'] = 'white'
    mpl.rcParams['savefig.edgecolor'] = 'none'

    # Legend
    mpl.rcParams['legend.frameon'] = True
    mpl.rcParams['legend.framealpha'] = 0.9
    mpl.rcParams['legend.fancybox'] = True
    mpl.rcParams['legend.shadow'] = False

    # Lines
    mpl.rcParams['lines.linewidth'] = 2.0
    mpl.rcParams['lines.markersize'] = 8

    print("✓ Applied Optoceutics custom style (resutil_oc)")


def set_oc_font():
    """
    Apply Optoceutics custom font settings
    """
    # Font settings (use commonly available fonts)
    font_family = 'sans-serif'

    # Try to use specific fonts if available, fallback to defaults
    mpl.rcParams['font.family'] = font_family
    mpl.rcParams['font.sans-serif'] = [
        'DejaVu Sans', 'Arial', 'Helvetica', 'Liberation Sans',
        'Bitstream Vera Sans', 'sans-serif'
    ]

    # Font sizes
    mpl.rcParams['font.size'] = 11
    mpl.rcParams['axes.titlesize'] = 14
    mpl.rcParams['axes.labelsize'] = 12
    mpl.rcParams['xtick.labelsize'] = 10
    mpl.rcParams['ytick.labelsize'] = 10
    mpl.rcParams['legend.fontsize'] = 10
    mpl.rcParams['figure.titlesize'] = 16

    # Font weight
    mpl.rcParams['axes.titleweight'] = 'bold'
    mpl.rcParams['axes.labelweight'] = 'normal'

    print("✓ Applied Optoceutics custom fonts (resutil_oc)")


def apply_oc_styling():
    """
    Convenience function to apply both style and font settings
    """
    set_oc_style()
    set_oc_font()
