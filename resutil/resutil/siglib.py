""" Utility functions for signal processing

This module contains handy eeg signal processing
functions.

"""

from __future__ import annotations
from functools import cache
from copy import deepcopy
import logging

import numpy as np
from numpy.typing import NDArray
from tqdm import tqdm
from scipy.signal import welch, find_peaks
from scipy.stats import norm, binom

# Optional imports for Pyodide compatibility
try:
    from numba import njit, bool_
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    # Dummy decorator that does nothing
    def njit(*args, **kwargs):
        def decorator(func):
            return func
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator
    bool_ = bool

try:
    from mne.io import Raw
    HAS_MNE = True
except ImportError:
    HAS_MNE = False
    Raw = None

try:
    from fooof import FOOOF
    HAS_FOOOF = True
except ImportError:
    HAS_FOOOF = False
    FOOOF = None


def cnr_by_band(
    freq: NDArray[np.float64],
    psd: NDArray[np.float64],
    peak_freq: float,
    band_limits: tuple[float, float],
) -> float:
    """Cacluclate the contrast-to-noise ratio (CNR)

    Caclulates the height of the peak above the mean of the
    noise and normalises it to the standard deviation of the
    noise in a specified band to estimate the contrast.

    The contrast is defined as:
        $SNR = \frac{S_f - \mu_S}{\sigma_S},$

    where $S_f$ is the peak SSVEP value, $\mu_S$ is the
    mean of the noise, and $\sigma_S$ is the standard
    deviation of the noise.

    Args:
        freq (NDArray[np.float64]): Frequency axis array.
        psd (NDArray[np.float64]): PSD estimate array (equal to shape of
            `freq`).
        peak_freq (float): Frequency of the peak.
        band_limits (tuple[float, float]): Lower and upper limits
            of the band across which the noise is estimated.

    Returns:
        float: Contrast-to-noise ratio (CNR).
    """

    band = np.ones_like(freq, dtype=bool)
    band[freq < band_limits[0]] = False
    band[freq > band_limits[1]] = False

    freq, psd = freq[band], psd[band]

    return cnr(freq, psd, peak_freq)


def cnr(freq: NDArray[np.float64], psd: NDArray[np.float64], peak_freq: float) -> float:
    """Cacluclate the contrast-to-noise ratio (CNR)

    Caclulates the height of the peak above the mean of the
    noise and normalises it to the standard deviation of the
    noise to estimate the contrast.

    The contrast is defined as:
        $SNR = \frac{S_f - \mu_S}{\sigma_S},$

    where $S_f$ is the peak SSVEP value, $\mu_S$ is the
    mean of the noise, and $\sigma_S$ is the standard
    deviation of the noise.

    NOTE: The entirety of `freq` and `psd` are used to estimate
    $\mu_S$ and $\sigma_S$, so if a certain band should be used,
    refer to `cnr_by_band`.

    Args:
        freq (NDArray[np.float64]): Frequency axis array.
        psd (NDArray[np.float64]): PSD estimate array (equal to shape of
            `freq`).
        peak_freq (float): Frequency of the peak.

    Returns:
        float: Contrast-to-noise ratio (CNR).
    """

    return _cnr(freq, psd, peak_freq)


@njit
def _cnr(
    freq: NDArray[np.float64], psd: NDArray[np.float64], peak_freq: float
) -> float:
    # Calculate the contrast-to-noise ratio (CNR):
    #
    # $SNR = \frac{S_f - \mu_S}{\sigma_S}$

    peak_idx = np.argmin(np.abs(freq - peak_freq))
    not_peak_indicator = np.ones_like(psd, dtype=bool_)
    not_peak_indicator[peak_idx] = False

    mu = np.mean(psd[not_peak_indicator])
    sigma = np.std(psd[not_peak_indicator])

    return (psd[peak_idx] - mu) / sigma


def find_peak(
    freq: NDArray[np.float64],
    psd: NDArray[np.float64],
    peak_freq: float,
    search_width: float = 0.2,
    alpha: float = 0.01,
):
    """Adjust for minor signal peak offset.

        Search for the local maximum in a frequency band, and
        return it as the peak frequency if it surpases a contrast
        threshold. The threshold is determined by a controllable
        false positive rate, see:
        https://sites.google.com/optoceutics.com/opto-wiki/research/methods#h.qojsj9r911ue

        If a peak does note surpass the threshold, the frequency bin
        in `freq` closest to `peak_freq` is returned.


    Args:
        freq (NDArray[np.float64]): Power spectral density frequency bins.
        psd (NDArray[np.float64]): Power spectral density estimates.
        peak_freq (float): Expected signal peak center frequency.
        search_width (float, optional): Width of band (on either side of `peak_freq`)
            in which the peak should be searched for. Please note that the number of
            bins in the band affects the threshold. Defaults to .2 [Hz].
        alpha (float, optional): Accepted false positive rate. Defaults to .01.

    Returns:
        float: Signal frequency bin.
    """

    freq_resolution = freq[1] - freq[0]

    # Define range of interest in which to find peak
    search_width = 0.2
    search_samples = int(search_width / freq_resolution)
    if not search_samples > 0:
        msg = (
            f"Search width ({search_width} Hz) is the size of the frequency resolution ({freq_resolution} Hz). "
            + "Search width should be atleast twice the frequency resolution."
        )
        raise ValueError(msg)
    exp_peak_idx = np.argmin(abs(freq - peak_freq))
    peak_range = np.arange(exp_peak_idx - search_samples, exp_peak_idx + search_samples)

    # Extract the band in question
    noise = psd[peak_range]

    # Caclulate the FPR corrected peak threshold
    height = np.mean(noise) + _calc_fpr_normal_threshold(
        alpha, len(peak_range)
    ) * np.std(noise)

    # Try finding a peak
    peaks, props = find_peaks(psd[peak_range], height=height)
    try:
        peak = peaks[np.argmax(props["peak_heights"])]
        # index of frequency bin closest to measured peak frequency
        peak_bin = peak_range[peak]
    except ValueError:
        # If no peak is found, select the best matching frequency bin
        peak_bin = np.argmin(abs(freq - peak_freq))

    peak_freq = freq[peak_bin]

    return peak_freq


@cache
def _calc_fpr_normal_threshold(
    alpha: float, n: int, stopping_crit: float = 0.0001
) -> float:
    # Calculate the FPR-corrected threshold
    # on the standard normal distribution
    # which gives a FPR of `alpha` on normally
    # distributed noise; see
    # https://sites.google.com/optoceutics.com/opto-wiki/research/resources
    #
    # As `alpha` and `n` are prone to be the same
    # across many iterations, we cache the results
    # to speed up the process
    #
    # TODO: Currently, the estimation of q is done iteratively,
    # though someone smarter may be able to find a
    # shorthand expression for calculating it.
    # Meanwhile, caching should mostly take care
    # of this.

    # Probability of the event with probability
    # alpha occuring atleast once is
    # 1 - binom.cdf(k=0, n=N, p=alpha)
    # which equals:
    q_ = 1 - binom.pmf(k=0, n=n, p=alpha)

    # We iteratively modify alpha_ until
    # q equals alpha.
    p = deepcopy(alpha)
    dif = q_ - alpha
    while abs(dif) > stopping_crit:
        if dif > 0:
            p -= p * p / q_
        else:
            p += p * p / q_

        q_ = 1 - binom.pmf(k=0, n=n, p=p)
        dif = q_ - alpha

    # Return the percent point function
    # to get the threshold in standard normal
    # space (i.e. number of standard deviations)
    return norm.ppf(1 - p)


def snr_by_band(
    freq: NDArray[np.float64],
    psd: NDArray[np.float64],
    peak_freq: float,
    band_limits: tuple[float, float],
) -> float:
    """Calculate signal-to-noise ratio (SNR) in a band

    Caclulates the SNR as the peak value
    normalised by the mean of the noise in the band.

    The SNR is defined as:
        $SNR = \frac{S_f}{\mu_S},$

    where $S_f$ is the peak SSVEP value, and $\mu_S$ is the
    mean of the noise.

    Args:
        freq (NDArray[np.float64]): Frequency axis array.
        psd (NDArray[np.float64]): PSD estimate array (equal to shape of
            `freq`).
        peak_freq (float): Frequency of the peak.
        band_limits (tuple[float, float]): Lower and upper limits
            of the band across which the noise is estimated.
        alpha (float | None): False discovery rate of peak
            detection. Defaults to 1%.

    Returns:
        float: signal-to-noise ratio (SNR).
    """

    band = np.ones_like(freq, dtype=bool)
    band[freq < band_limits[0]] = False
    band[freq > band_limits[1]] = False

    freq, psd = freq[band], psd[band]

    return snr(freq, psd, peak_freq)


def snr(freq: NDArray[np.float64], psd: NDArray[np.float64], peak_freq: float) -> float:
    """Calculate signal-to-noise ratio (SNR)

    Caclulates the SNR as the peak value
    normalised by the mean of the noise in the band.

    The SNR is defined as:
        $SNR = \frac{S_f}{\mu_S},$

    where $S_f$ is the peak SSVEP value, and $\mu_S$ is the
    mean of the noise.

    Args:
        freq (NDArray[np.float64]): Frequency axis array.
        psd (NDArray[np.float64]): PSD estimate array (equal to shape of
            `freq`).
        peak_freq (float): Frequency of the peak.

    Returns:
        float: signal-to-noise ratio (SNR).
    """

    return _snr(freq, psd, peak_freq)


@njit
def _snr(
    freq: NDArray[np.float64], psd: NDArray[np.float64], peak_freq: float
) -> float:
    # Calculate the contrast SNR:
    #
    # $SNR = \frac{S_f - \mu_S}{\sigma_S}$

    peak_idx = np.argmin(np.abs(freq - peak_freq))
    not_peak_indicator = np.ones_like(psd, dtype=bool_)
    not_peak_indicator[peak_idx] = False

    mu = np.mean(psd[not_peak_indicator])

    return psd[peak_idx] / mu


def fit_mne_sfreq(
    raw: Raw,
    unc_stop_crit: float = 0.01,
    freq_range: tuple[int, int] = (46, 80),
    target_line_freq: float = 50,
    max_its: int = 50,
    disable_tqdm=False,
    pink_normalise=False,
) -> Raw:
    """Obtain the empirical sampling frequency from mne Raw object

    This module will attempt to fit the line noise in
    the power spectrum of a signal to the expected line
    frequency (50 Hz EU). That is done by iteratively modifying
    (using a binary search algorthim) the sampling frequency
    to minimise the difference between the empirical line frequency.

    Args:
        raw (mne.io.Raw): Instance of the EEG data.
        unc_stop_crit (float, optional): Uncertainty stopping criteria [Hz]. The
            tollerance for difference bewteen expected target line freq and
            the encoded the estimated line freq. Defaults to .01.
        freq_range (tuple[int]): Lower and upper bounds [Hz] for where FOOOF should
            try to fit the line noise.
        target_line_freq (float, optional): Expected mains line noise freq [Hz]. Defaults to 50.
        max_its (int, optional): Maximum number of iterations. Defaults to 50.

    Returns:
        mne.io.Raw: The raw object with modified sampling frequency.
    """
    timeseries = np.average(raw.get_data("eeg"), axis=0)

    sfreq = fit_sfreq(
        timeseries,
        raw.info["sfreq"],
        freq_range,
        unc_stop_crit,
        target_line_freq,
        max_its,
        disable_tqdm=disable_tqdm,
        pink_normalise=pink_normalise,
    )
    logging.info(f"Updating sfreq from {raw.info['sfreq']} to {sfreq}.")

    return set_mne_info_sfreq(raw, sfreq)


def fit_sfreq(
    timeseries: np.ndarray,
    initial_fs: float,
    freq_range: tuple[int, int] = (46, 80),
    unc_stop_crit: float = 0.01,
    target_line_freq: float = 50,
    max_its: int = 50,
    disable_tqdm=False,
    pink_normalise=False,
) -> float:
    """Obtain the empirical sampling frequency from array

    This module will attempt to fit the line noise in
    the power spectrum of a signal to the expected line
    frequency (50 Hz EU). That is done by iteratively modifying
    (using a binary search algorthim) the sampling frequency
    to minimise the difference between the empirical line frequency.

    Keep in mind that the mains frequency is nominally 50 (in EU) but
    may vary +- .5 Hz..

    Args:
        raw (mne.io.Raw): Instance of the EEG data.
        unc_stop_crit (float, optional): Uncertainty stopping criteria [Hz]. The
            tollerance for difference bewteen expected target line freq and
            the encoded the estimated line freq. Defaults to .01.
        freq_range (tuple[int]): Lower and upper bounds [Hz] for where FOOOF should
            try to fit the line noise.
        target_line_freq (float, optional): Expected mains line noise freq [Hz]. Defaults to 50.
        max_its (int, optional): Maximum number of iterations. Defaults to 50.

    Returns:
        float: Empirical sampling frequency.

    Raises:
        RuntimeError: If fitting does not satisfy stopping criteria within
            the maximum specified number of iterations.
    """

    sfreq = initial_fs
    peak_center = np.inf

    # We set a hard limit for how far away the
    # empirical sampling frequency can get from the original.
    # If it exceeds this, you have bigger issues.
    LIM = 5  # Hz

    # Iteratively fit and adjust the empirical sampling frequency
    # by fitting the line noise. Stop and raise a runtime error,
    # if it is not successful within `max_its` iterations.
    # The `tqdm` wrapper provides some visual feedback to the
    # user thoughout the iterations.
    for _ in tqdm(range(max_its), disable=disable_tqdm):
        if np.abs(sfreq - initial_fs) > LIM:
            msg = """The search for an empirical sampling frequency has
                    drifted more than 5 Hz from the specified sampling frequency.
                    This is unreasonably far and should indicate that something
                    else is wrong."""
            raise RuntimeError(msg)

        # Check if the difference between the estimated line noise
        # peak center and the target frequency is less than the
        # stopping criteria; if so, return the empirical sampling
        # freq.
        if np.abs(peak_center - target_line_freq) < unc_stop_crit:
            return sfreq

        # Estimate a power spectral density based on the current
        # best estimate for the sampling frequency. Skip the
        # first frequency bins, as they in some instances disrupt
        # the fitting process. Also, they should never be used for
        # this purpose anyway.
        freq, psd = _calc_psd_for_fooof(
            timeseries, sfreq, pink_normalise=pink_normalise
        )
        freq, psd = freq[20:], psd[20:]

        # Set peak width limits based on the closest we can get to
        # a delta function and still comply with FOOOF's recommendations.
        pwl = (2 * (freq[1] - freq[0]), 1)

        # Define the FOOOF model
        fm = FOOOF(
            peak_width_limits=pwl,
            verbose=True,
            max_n_peaks=1,
            aperiodic_mode="knee",
            peak_threshold=4,
        )

        # Fit model and get the results
        fm.fit(freq, psd, freq_range=freq_range)
        res = fm.get_results()

        # If we do not succeed fitting the model
        # (i.e. `res` is empty), we raise a runtime error
        if res.peak_params.ravel().shape[0] == 0:
            msg = """Could not succesfully fit the line noise.
                    This might be because the data has been notch
                    filtered to suppress the line noise."""
            raise RuntimeError(msg)

        # Get the center frequency of the line noise peak
        peak_center = res.peak_params.ravel()[0]

        # Adjust the empirical sampling frequency based on
        # the difference between the estimated line noise peak
        # center and the expection therof.
        dif = peak_center - target_line_freq
        sfreq -= dif / 2

    raise RuntimeError(
        f"Did not satisfy stopping criteria ({unc_stop_crit} Hz) "
        + f"within max number of iterations ({max_its}). "
        + f"At termination, sfreq was {sfreq} with estimated line peak "
        + f"{peak_center} for target {target_line_freq}."
    )


def set_mne_info_sfreq(raw: Raw, sfreq: float) -> Raw:
    """Update the sampling frequency of MNE Raw

    Args:
        raw (Raw): MNE Raw object.
        sfreq (float): New sampling frequency.

    Returns:
        Raw: Raw object with updated samlping frequency.
    """
    sfreq = float(sfreq)
    raw.info._unlocked = True
    raw.info.update({"sfreq": sfreq})
    raw.info._unlocked = False

    return raw


def _calc_psd_for_fooof(timeseries, sfreq, pink_normalise: bool = False):
    # Calculate the power spectral density by Welch's method
    # TODO: Revise settings to best accomodate FOOOF's fitting

    win_len = np.min((len(timeseries) / sfreq, 5))
    nseg = win_len * sfreq
    overlap = 0.5
    win = "hann"

    freq, psd = welch(
        timeseries,
        fs=sfreq,
        nperseg=nseg,
        noverlap=int(nseg * overlap),
        average="median",
        window=win,
    )

    if pink_normalise:
        pink_normaliser = 1 / freq
        psd *= pink_normaliser

    return freq, psd
