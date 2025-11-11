import unittest

import numpy as np
from mne.io import RawArray
from mne import create_info, set_log_level
from numpy.typing import NDArray

from resutil.siglib import find_peak, fit_mne_sfreq, snr_by_band, cnr_by_band

SEED = 123456
RNG = np.random.RandomState(SEED)

# Reduce mne verbosity
set_log_level(verbose="ERROR")


class TestSiglib(unittest.TestCase):
    def test_find_peak(self) -> None:
        # Create a raw object with a simulated
        # 40 Hz eeg signal and random normal noise
        ssvep_freq = 40.0
        ssvep_amplitude = 1e-4
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz
        raw = create_ssvep_raw(
            ssvep_freq=ssvep_freq,
            ssvep_amplitude=ssvep_amplitude,
            noise_amplitude=noise_amplitude,
            data_len=data_len,
            sfreq=sfreq,
        )

        # Calculate periodogram
        freqs, psd = get_periodogram_data(raw)

        # Find the peak location
        peak_freq = find_peak(freq=freqs, psd=psd, peak_freq=ssvep_freq)

        # Assert that the estimated peak frequency bin in `freqs`
        # is the one closest possobly to `ssvep_freq`
        self.assertEqual(peak_freq, freqs[np.argmin(abs(freqs - ssvep_freq))])

    def test_sfreq_fit_convergence(self) -> None:
        # Given a 3-channels EEG time series consisting
        # of random normal noise and a 50.2 Hz line noise
        line_f = 50.2  # Hz
        line_amplitude = 1e-4
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz

        raw = create_ssvep_raw(
            ssvep_freq=line_f,
            ssvep_amplitude=line_amplitude,
            noise_amplitude=noise_amplitude,
            data_len=data_len,
            sfreq=sfreq,
        )

        # Try to fit the sfreq until line noise is
        # at 50 Hz. This should succeed.
        fit_mne_sfreq(raw, disable_tqdm=True, pink_normalise=True, max_its=100)

    def test_sfreq_fit_drift_error(self) -> None:
        # Given a 3-channels EEG time series consisting
        # of random normal noise and a 55 Hz line noise
        line_f = 55.0  # Hz
        line_amplitude = 1e-4
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz

        raw = create_ssvep_raw(
            ssvep_freq=line_f,
            ssvep_amplitude=line_amplitude,
            noise_amplitude=noise_amplitude,
            data_len=data_len,
            sfreq=sfreq,
        )

        # Try to fit the sfreq until line noise is
        # at 50 Hz
        with self.assertRaises(RuntimeError):
            # We will drift beyond 5 Hz from the
            # initial line noise frequency which
            # raises a runetime error
            fit_mne_sfreq(raw, disable_tqdm=True, max_its=20)

    def test_sfreq_fit_convergence_error(self) -> None:
        # Given a 3-channels EEG time series consisting
        # of random normal noise and a 52 Hz line noise
        line_f = 52.0  # Hz
        line_amplitude = 1e-4
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz

        raw = create_ssvep_raw(
            ssvep_freq=line_f,
            ssvep_amplitude=line_amplitude,
            noise_amplitude=noise_amplitude,
            data_len=data_len,
            sfreq=sfreq,
        )

        # Try to fit the sfreq until line noise is
        # at 50 Hz, but provide too few iterations
        with self.assertRaises(RuntimeError):
            # We will fail to deliver on the
            # uncertainty stopping criteria
            # and raise a runtime error (convergence error)
            fit_mne_sfreq(raw, disable_tqdm=True, max_its=2)

    def test_snr_by_band(self) -> None:
        # Create a raw object with a simulated
        # 40 Hz eeg signal and random normal noise
        ssvep_freq = 40.0
        ssvep_amplitudes = (0, 1e-6, 5e-5, 1e-5, 5e-4, 1e-4, 1e-3)
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz

        iterations = 100
        snrs = np.ones(shape=(iterations,), dtype=float) * np.nan
        for ssvep_amplitude in ssvep_amplitudes:
            with self.subTest(ssvep_amplitude=ssvep_amplitude):
                for i in range(iterations):
                    raw = create_ssvep_raw(
                        ssvep_freq=ssvep_freq,
                        ssvep_amplitude=ssvep_amplitude,
                        noise_amplitude=noise_amplitude,
                        data_len=data_len,
                        sfreq=sfreq,
                    )

                    # Calculate periodogram
                    freqs, psd = get_periodogram_data(raw)

                    # Calcluate the SNR
                    snr_ = snr_by_band(
                        freq=freqs,
                        psd=psd,
                        peak_freq=ssvep_freq,
                        band_limits=(38, 42),
                    )
                    snrs[i] = 10 * np.log10(snr_)
                snr_average = snrs.mean()

                # Check that the SNR is in the proximity of the expectation
                theoretical_snr = 20 * np.log10(
                    (ssvep_amplitude + noise_amplitude) ** 2 / noise_amplitude**2
                )

                dif = np.log10(np.abs(snr_average - theoretical_snr))
                check_ = np.log10(np.abs(snr_average) + np.abs(theoretical_snr))

                self.assertLessEqual(dif, check_)

    def test_cnr_by_band(self) -> None:
        # Create a power spectrum with a 40 Hz component
        # of size `ssvep_amplitudes[i]` and random normal
        # noise with mean and standard deviation `noise_amplitude`.
        #
        # Check that the estimated cnr_by_band on average over
        # `iterations` iterations is within `deltas[i]` of
        # the theoretical cnr

        # Spectrum parameters
        ssvep_freq = 40.0  # Hz
        ssvep_amplitudes = (0, 1e-3)
        noise_amplitude = 1e-5
        data_len = 10000
        sfreq = 500.0  # Hz

        # Acceptable difference between estimate and
        # theoretical contrast
        deltas = (0.5, 5)

        # Define the frequency axis
        freq = np.arange(5001, dtype=float) / (data_len / sfreq)

        # Create 100 random iterations of noise + ssvep
        # spectrum and estimate the CNRs
        iterations = 100
        # Pre-allocate cnr estimate output array
        cnrs = np.ones(shape=(iterations,), dtype=float) * np.nan
        for s, ssvep_amplitude in enumerate(ssvep_amplitudes):
            with self.subTest(ssvep_amplitude=ssvep_amplitude):
                for i in range(iterations):
                    # Create random normal noise
                    psd = RNG.normal(size=freq.shape, loc=1, scale=1) * noise_amplitude
                    # Add the ssvep to the `ssvep_freq` frequency bin
                    psd[np.argmin(np.abs(freq - ssvep_freq))] += ssvep_amplitude

                    # Estimate the CNR
                    cnrs[i] = cnr_by_band(
                        freq=freq,
                        psd=psd,
                        peak_freq=ssvep_freq,
                        band_limits=(38, 42),
                    )

                # Average over iterations
                cnr_average = cnrs.mean()

                # Calculate theoretical CNR
                theoretical_cnr = (
                    (ssvep_amplitude + noise_amplitude) - noise_amplitude
                ) / noise_amplitude

                # Compare estimate and theoretical CNR with
                # acceptable difference `delta[i]`
                self.assertAlmostEqual(cnr_average, theoretical_cnr, delta=deltas[s])


def create_ssvep_raw(
    ssvep_freq: float,
    ssvep_amplitude: float = 1e-4,
    noise_amplitude: float = 1e-5,
    data_len: int = 10000,
    sfreq: float = 500,
) -> RawArray:
    """Create a RawArray with SSVEP signal

    Simulate an SSVEP EEG time series with random noise. The SSVEP
    component is modelled as a sine with amplitude `ssvep_amplitude`, and
    the noise is modelled as random normal with zero mean and variance
    of `noise_amplitude`.

    Args:
        ssvep_freq (float): SSVEP signal frequency.
        ssvep_amplitude (float, optional): SSVEP signal amplitude. Defaults to 1e-4.
        noise_amplitude (float, optional): Noise amplitude. Defaults to 1e-5.
        data_len (int, optional): Length of the generated data. Defaults to 10000.
        sfreq (float, optional): Sampling frequency. Defaults to 500.

    Returns:
        RawArray: Simulated SSVEP signal with noise.
    """

    # Create subject info
    ch_types = ["eeg", "eeg", "eeg"]
    info = create_info(len(ch_types), sfreq=sfreq, ch_types=ch_types)
    info["subject_info"] = dict(
        first_name="opto",
        last_name="ceutics",
        birthday=(1992, 1, 20),
        sex=1,
        hand=3,
    )

    # Create pure noise data
    data = RNG.normal(size=(len(ch_types), data_len)) * noise_amplitude

    # Add SSVEP signal with a fixed amplitude
    samples = np.arange(data.shape[1]) / sfreq
    signal = np.sin(2 * np.pi * ssvep_freq * samples) * ssvep_amplitude
    weight = np.ones(len(ch_types))
    data += np.outer(weight, signal)

    # Create Raw object
    return RawArray(data, info)


def get_periodogram_data(raw: RawArray) -> tuple[NDArray, NDArray]:
    # Calculate periodogram
    win_len = raw.get_data().shape[1] / raw.info["sfreq"]
    nseg = win_len * raw.info["sfreq"]
    overlap = 0
    win = "boxcar"
    spectrum = raw.compute_psd(
        method="welch",
        n_per_seg=int(nseg),
        n_fft=int(nseg),
        n_overlap=int(nseg * overlap),
        window=win,
    )

    # Retrieve and check power spectrum
    psds, freqs = spectrum.get_data(return_freqs=True)
    psd = psds[0]  # We'll use a single channel

    return freqs, psd
