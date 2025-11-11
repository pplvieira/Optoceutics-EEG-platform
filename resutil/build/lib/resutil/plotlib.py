"""OC plot style library


"""
from __future__ import annotations

from pathlib import Path
import numpy as np
from matplotlib import rcParams
from matplotlib import pyplot as plt
import matplotlib.font_manager as font_manager

_base_dir = Path(__file__).parent.parent

def set_oc_style(style: Path|str = None):
    """Set plot style to OC standard

    Set matplotlib style. Defaults to the OC standard.

    Args:
        style: pathlib.Path

    Example:
        >>> from resutil import plotlib
        >>> plotlib.set_oc_style()
    """

    if style is None:
        style = _base_dir / "resutil" / "templates" / "_oc_style.mplstyle"
    else:
        if isinstance(style, str):
            style = Path(style)
    if not style.exists():
        raise Exception(f"The files {style.as_posix()} does not exist.")
    
    plt.style.use(style)

def set_oc_font(font: Path|str = None):
    """Set font style to OC standard

    Example:
        >>> from resutil import plotlib
        >>> plotlib.set_oc_font()
    """

    if font is None:
        font = _base_dir / "resutil" / "fonts" / "Montserrat"
    else:
        if isinstance(font, str):
            font = Path(font)
    if not font.exists():
        raise Exception(f"The files {font.as_posix()} does not exist.")

    for font in font_manager.findSystemFonts(font.as_posix()):
        font_manager.fontManager.addfont(font)
    rcParams['font.family'] = 'Montserrat'

def _plot_scatter(ax, prng, nb_samples=50):
    # Scatter plot

    for mu, sigma, marker in [(-.5, 0.75, 'o'), (0.75, 1., 's'), (1.2, 0.6, 'v')]:
        x, y = prng.normal(loc=mu, scale=sigma, size=(2, nb_samples))
        ax.plot(x, y, ls='none', marker=marker)
    ax.set_xlabel('x label')
    ax.set_ylabel('y label')
    ax.set_title('Scatter Plot')
    return ax


def _plot_colored_lines(ax):
    # Plot lines with colors following the style color cycle

    t = np.linspace(-10, 10, 100)

    def sigmoid(t, t0):
        return 1 / (1 + np.exp(-(t - t0)))

    nb_colors = len(plt.rcParams['axes.prop_cycle'])
    shifts = np.linspace(-5, 5, nb_colors)
    amplitudes = np.linspace(1, 1.5, nb_colors)
    for t0, a in zip(shifts, amplitudes):
        ax.plot(t, a * sigmoid(t, t0), '-')
    ax.set_xlim(-10, 10)
    ax.set_title("Colored Lines")
    return ax


def _plot_bar_graphs(ax, prng, min_value=5, max_value=25, nb_samples=5):
    # Plot two bar graphs side by side, with letters as x-tick labels

    labels = ['a', 'b', 'c', 'd', 'e']
    x = np.arange(nb_samples)
    ya, yb, yc = prng.randint(min_value, max_value, size=(3, nb_samples))
    width = 0.25
    ax.bar(x, ya, width)
    ax.bar(x + width, yb, width, color='C1')
    ax.bar(x + width*2, yc, width, color='C2')
    ax.set_xticks(x + width, labels)
    ax.set_title('Bar Plot')
    return ax

def _plot_histograms(ax, prng, nb_samples=10000):
    # Plot 4 histograms and a text annotation

    params = ((10, 10), (4, 12), (50, 12), (6, 55))
    for a, b in params:
        values = prng.beta(a, b, size=nb_samples)
        ax.hist(values, histtype="stepfilled", bins=30,
                alpha=0.8, density=True)
    
    # Add a small annotation.
    ax.annotate('Annotation', xy=(0.25, 4.25),
                xytext=(0.9, 0.9), textcoords=ax.transAxes,
                va="top", ha="right",
                bbox=dict(boxstyle="round", alpha=0.2),
                arrowprops=dict(
                          arrowstyle="->",
                          connectionstyle="angle,angleA=-95,angleB=35,rad=10"),
                )
    ax.set_title("Histograms")
    return ax

def _plot_figure():
    # Setup and plot the demonstration figure with a given style
    
    # Use a dedicated RandomState instance to draw the same "random" values
    # across the different figures.
    prng = np.random.RandomState(42)

    fig, axs = plt.subplots(ncols=2, nrows=2, num="OC Style",
                            figsize=(10, 10), constrained_layout=True)

    fig.suptitle("OC style", x=0.99, ha='right')

    _plot_scatter(axs[0,0], prng)
    _plot_bar_graphs(axs[0,1], prng)
    _plot_colored_lines(axs[1,0])
    _plot_histograms(axs[1,1], prng)

    return fig

def _test_plotlib(save: bool = False):
    # Unit test of `set_oc_style`
    # Requires user to verify style change

    plt.style.use("classic")
    _plot_figure()
    if save:
        plt.savefig(fname=_base_dir / "img" / "plotlib_pre.png")
    plt.show()

    set_oc_style()
    set_oc_font()
    
    _plot_figure()
    if save:
        plt.savefig(fname=_base_dir / "img" / "plotlib_post.png")
    plt.show()


if __name__ == "__main__":
    
    # Plot a demonstration figure before and after applying styling
    _test_plotlib()
