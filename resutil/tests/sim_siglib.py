from pathlib import Path
import logging
from functools import cache

import numpy as np
from numba import njit
from mne import create_info
from mne.io import RawArray
from matplotlib import pyplot as plt
import seaborn as sns

from resutil.siglib import fit_mne_sfreq, set_mne_info_sfreq, cnr, snr, find_peak
from resutil.plotlib import set_oc_font, set_oc_style

root_dir = Path(__file__).parent.parent.absolute()
log_dir = root_dir / "logs"
log_dir.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, filename=log_dir / "siglib_test.log", filemode="w")

set_oc_font()
set_oc_style()

SEED = 123456

def test_snr():
    ssvep_freq = 40.
    freq, psd = simulate_ssvep_spectrum((35, 45), 
                                        mu=1, sigma=1,
                                        peak_freq=ssvep_freq,
                                        peak_height=3,
                                        fs=100000)
    
    snr_val = snr(freq=freq, psd=psd, peak_freq=ssvep_freq)
    
def test_find_peak():
    # Create a raw object with a simulated
    # 40 Hz eeg signal and random normal noise
    ssvep_freq = 40.
    raw = create_ssvep_raw(ssvep_freq=ssvep_freq,
                           ssvep_amplitude=1e-4,
                           noise_amplitude=1e-5)

    # Calculate periodogram
    win_len = raw.get_data().shape[1] / raw.info["sfreq"]
    nseg = win_len * raw.info["sfreq"]
    overlap = 0
    win = "boxcar"
    spectrum = raw.compute_psd(method="welch",
                                  n_per_seg=int(nseg),
                                  n_fft=int(nseg),
                                  n_overlap=int(nseg * overlap),
                                  window=win)
    
    # Retrieve and check power spectrum
    psds, freqs = spectrum.get_data(return_freqs=True)
    psd = psds[0]               # We'll use a single channel
    assert psd.base is not None # Just checking that we're viewing and not copying
    assert psd.shape == freqs.shape

    # Find the peak location
    peak_freq = find_peak(freq=freqs,
                          psd=psd,
                          peak_freq=ssvep_freq)
    
    # Assert that the estimated peak frequency bin in `freqs`
    # is the one closest possobly to `ssvep_freq`
    assert peak_freq == freqs[np.argmin(abs(freqs - ssvep_freq))]

def create_ssvep_raw(ssvep_freq: float,
                     ssvep_amplitude: float = 1e-4,
                     noise_amplitude: float = 1e-5,
                     data_len: int = 10000,
                     sfreq: float = 500) -> RawArray:
    """ Create a RawArray with SSVEP signal

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
    rng = np.random.RandomState(SEED)

    # Create subject info
    ch_types = ['eeg', 'eeg', 'eeg']
    info = create_info(len(ch_types), sfreq=sfreq, ch_types=ch_types)
    info['subject_info'] = dict(first_name='opto', last_name='ceutics',
                                birthday=(1992, 1, 20), sex=1, hand=3)
    
    # Create pure noise data
    data = rng.random(size=(len(ch_types), data_len)) * noise_amplitude

    # Add SSVEP signal with a fixed amplitude
    samples = np.arange(data.shape[1]) / sfreq
    signal = np.sin(2 * np.pi * ssvep_freq * samples) * ssvep_amplitude
    weight = np.ones(len(ch_types))
    data += np.outer(weight, signal)

    # Create Raw object
    return RawArray(data, info)

def test_sfreq():
    logging.debug(f"Running `{test_sfreq.__name__}`")

    rng = np.random.RandomState(SEED)
    sfreq = 500
    data_len = 10000
    ch_types = ['eeg', 'eeg', 'stim', 'ecog', 'ecog', 'seeg', 'eog', 'ecg',
                'emg', 'dbs', 'bio']
    info = create_info(len(ch_types), sfreq=sfreq, ch_types=ch_types)
    data = rng.random(size=(len(ch_types), data_len)) * 1e-5

    # include subject info and measurement date
    info['subject_info'] = dict(first_name='opto', last_name='ceutics',
                                birthday=(1992, 1, 20), sex=1, hand=3)

    # Add "50 Hz" line noise to data (offset from expected)
    f = 49.5 # Hz
    samples = np.arange(data.shape[1]) / sfreq
    signal = np.sin(2 * np.pi * f * samples) * 1e-4
    weight = rng.random(size=(len(ch_types),))
    data += np.outer(weight, signal)

    raw = RawArray(data, info)
    orig_sfreq = raw.info["sfreq"]

    # Test fitting of sfreq
    raw_fitted = fit_mne_sfreq(raw, max_its=200)
    fitted_sfreq = raw_fitted.info["sfreq"]
    try:
        assert orig_sfreq == fitted_sfreq
        error_msg = "Failed to fit and set new sampling frequency with `fit_mne_sfreq`."
        raise ValueError(error_msg)
    except AssertionError:
        logging.info(f"Correctly set sfreq from {orig_sfreq} to fitted {fitted_sfreq} Hz")

    # Test setting sfreq directly
    new_sfreq = set_mne_info_sfreq(raw, sfreq - 50).info["sfreq"]
    try:
        assert orig_sfreq == new_sfreq
        error_msg = "Failed to set new sampling frequency with `set_mne_info_sfreq`."
        raise ValueError(error_msg)
    except AssertionError:
        logging.info(f"Correctly set new sfreq from {orig_sfreq} to {new_sfreq} Hz")

@njit
def simulate_ssvep_spectrum(freq_range: tuple[float, float],
                            mu: float, sigma: float,
                            peak_freq: float = 40,
                            peak_height: float = 3,
                            fs: float = 250,
                            return_distribution: bool = False):
    """ Simulate part of an SSVEP spectrum

    Simulate an SSVEP spectrum in a specified range with
    a specified normal noise distribution, peak frequency,
    and peak height.

    XXX: Currently, this does not take into account the 1/f
    shape of the aperiodic noise.
    TODO: Add 1/f component.

    Args:
        freq_range (tuple[float, float]): Frequency range (upper- and
            lower limits) of spectrum.
        mu (float): Mean of the random normal noise.
        sigma (float): Std of the random normal noise.
        peak_freq (float, optional): Frequency of the SSVEP peak. Defaults to 40.
        peak_height (float, optional): Height of SSVEP peak. Defaults to 3.
        fs (float, optional): Sampling frequency. Defaults to 250.

    Returns:
        tuple[np.ndarray, np.ndarray]: Frequency axis and simulated PSD.
    """
    rng = np.random.RandomState(SEED)
    
    freq = np.arange(freq_range[0], freq_range[1], step = 1/fs)
    psd = rng.normal(loc=mu, scale=sigma, size=freq.shape)
    
    peak_idx = np.argmin(np.abs(freq - peak_freq))
    psd[peak_idx] = peak_height

    return freq, psd

@cache
def _theoretical_contrast(h: float, mu: float, sigma: float):
    # Calculate the theoretical SNR contrast based on
    # simulation parameters
    return (h - mu) / sigma

@cache
def _theoretical_snr(h: float, mu: float, sigma: float):
    # Calculate the theoretical SNR contrast based on
    # simulation parameters
    return h / mu

def simulate_height(alpha=0.001):
    # Run simulations of PSDs with varying peak heights.
    # Caclulates and plots both SNR and SNC
    # TODO: Clean this up

    FIG_SCALING = .8
    plt.rcParams['figure.figsize'] = [16 * FIG_SCALING, 9 * FIG_SCALING]
    
    N = 500         # Simulation iterations
    MU = 1          # Noise Mean
    SIGMA = 1       # Noise Std.
    LOWER_LIM = -5  # SSVEP Peak height LL
    UPPER_LIM = 10  # SSVEP Peak height UL
    peak_heights = np.random.uniform(LOWER_LIM, UPPER_LIM, N)   # SSVEP Peak heights

    contrasts = np.empty(len(peak_heights), dtype=float)
    snrs = np.empty(len(peak_heights), dtype=float)

    for k, h in enumerate(peak_heights):
        freq, psd = simulate_ssvep_spectrum((39, 41), MU, SIGMA, 40, h)
        peak_freq = find_peak(freq, psd, peak_freq=40,
                              search_width=0.2, alpha=alpha)
        contrasts[k] = cnr(freq, psd, peak_freq)
        snrs[k] = snr(freq, psd, peak_freq)
    
    fig, _ = plt.subplots(1)
    sns.regplot(peak_heights, contrasts, color="#414B65")
    plt.plot((min(peak_heights), max(peak_heights)), 
             (_theoretical_contrast(min(peak_heights), MU, SIGMA), _theoretical_contrast(max(peak_heights), MU, SIGMA)), color="#E2BF6F")
    plt.title(f"SSVEP Simulation: $\mu_S$ = {MU}, $\sigma_S$ = {SIGMA}")
    plt.xlim(min(peak_heights) - 1, max(peak_heights) + 1)
    plt.xlabel(r"Simulation $S_f$")
    plt.ylabel(r"Detected Contrast: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.legend(("Simulation Data", "Linear Regression", "95% Confidence Interval", "Theoretical Relationship"),
               loc="upper left")
    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-contrast_par-height.png")
    
    fig, _ = plt.subplots(1)
    sns.regplot(peak_heights, snrs, color="#414B65")
    plt.plot((min(peak_heights), max(peak_heights)), 
             (_theoretical_snr(min(peak_heights), MU, SIGMA), _theoretical_snr(max(peak_heights), MU, SIGMA)), color="#E2BF6F")
    plt.title(f"SSVEP Simulation: $\mu_S$ = {MU}, $\sigma_S$ = {SIGMA}")
    plt.xlim(min(peak_heights) - 1, max(peak_heights) + 1)
    plt.xlabel(r"Simulation $S_f$")
    plt.ylabel(r"Detected SNR: $\frac{S_f}{\mu_S}$")
    plt.legend(("Simulation Data", "Linear Regression", "95% Confidence Interval", "Theoretical Relationship"),
               loc="upper left")
    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-snr_par-height.png")

def simulate_mu(alpha: float = .001):
    # Run simulations with varying noise mean.
    # TODO: Clean this up

    FIG_SCALING = .8
    plt.rcParams['figure.figsize'] = [16 * FIG_SCALING, 9 * FIG_SCALING]

    N = 500         # Simulation iterations
    HEIGHT = 5      # Peak values
    SIGMA = 1       # Noise standard dev.
    LOWER_LIM = -1  # Mu LL
    UPPER_LIM = 1   # Mu UL
    mus = np.random.uniform(LOWER_LIM, UPPER_LIM, N)   # Mean noise

    contrasts = np.empty(len(mus), dtype=float)
    theo_contrasts = np.empty(len(mus), dtype=float)
    snrs = np.empty(len(mus), dtype=float)
    theo_snrs = np.empty(len(mus), dtype=float)

    for k, mu in enumerate(mus):
        freq, psd = simulate_ssvep_spectrum((39, 41), mu, SIGMA, 40, HEIGHT)
        peak_freq = find_peak(freq, psd, peak_freq=40,
                              search_width=0.2, alpha=alpha)
        contrasts[k] = cnr(freq, psd, peak_freq) 
        snrs[k] = snr(freq, psd, peak_freq)
        theo_contrasts[k] = _theoretical_contrast(HEIGHT, mu, SIGMA)
        theo_snrs[k] = _theoretical_snr(HEIGHT, mu, SIGMA)
    
    fig, _ = plt.subplots(1)
    sns.regplot(mus, contrasts, color="#414B65")
    order_ = np.argsort(mus)
    plt.plot(mus[order_], theo_contrasts[order_], color="#E2BF6F")
    plt.xlim(min(mus) - .1, max(mus) + .1)
    plt.ylim(min(contrasts) - .1, max(contrasts) + .1)
    plt.xlabel(r"Simulation $\mu_S$ values")
    plt.ylabel(r"Detected Contrast: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.title(f"SSVEP Simulation: $\sigma_S$ = {SIGMA}, $S_f$ = {HEIGHT}")
    plt.legend(("Simulation Data",
                "Linear Regression",
                "95% Confidence Interval",
                "Theoretical Relationship"),
               loc="upper right")
    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-contrast_par-mu.png")
    
    fig, _ = plt.subplots(1)
    sns.regplot(mus, snrs, color="#414B65")
    plt.plot(mus[order_], theo_snrs[order_], color="#E2BF6F")
    plt.xlim(min(mus) - .1, max(mus) + .1)
    plt.ylim(-500, 500)
    plt.xlabel(r"Simulation $\mu_S$ values")
    plt.ylabel(r"Detected SNR: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.title(f"SSVEP Simulation: $\sigma_S$ = {SIGMA}, $S_f$ = {HEIGHT}")
    plt.legend(("Simulation Data",
                "Linear Regression",
                "95% Confidence Interval",
                "Theoretical Relationship"),
               loc="upper right")
    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-snr_par-mu.png")

def simulate_sigma(alpha: float = 0.001):
    # Run simulations with varying noise variance.
    # TODO: Clean this up
    
    FIG_SCALING = .8
    plt.rcParams['figure.figsize'] = [16 * FIG_SCALING, 9 * FIG_SCALING]

    # Simulation parameters
    N = 500             # Simulation iterations
    MU = 1              # Mean noise
    HEIGHT = 15         # Peak values
    LOWER_LIM = .5      # Sigma LL
    UPPER_LIM = 3       # Sigma UL
    sigmas = np.random.uniform(LOWER_LIM, UPPER_LIM, N) # Noise STD
    
    contrasts = np.empty(len(sigmas), dtype=float)
    theo_contrasts = np.empty(len(sigmas), dtype=float)
    snrs = np.empty(len(sigmas), dtype=float)
    theo_snrs = np.empty(len(sigmas), dtype=float)

    for k, sigma in enumerate(sigmas):
        freq, psd = simulate_ssvep_spectrum((39, 41), MU, sigma, 40, HEIGHT)
        peak_freq = find_peak(freq, psd, peak_freq=40,
                              search_width=0.2, alpha=alpha)
        contrasts[k] = cnr(freq, psd, peak_freq)
        theo_contrasts[k] = _theoretical_contrast(HEIGHT, MU, sigma)
        snrs[k] = snr(freq, psd, peak_freq)
        theo_snrs[k] = _theoretical_snr(HEIGHT, MU, sigma)
    
    fig, _ = plt.subplots(1)
    plt.scatter(sigmas, contrasts, color="#414B65")

    sigmas = np.sort(sigmas)
    theo_contrasts = np.sort(theo_contrasts)
    plt.plot(sigmas, theo_contrasts[::-1], color="#E2BF6F")
    
    plt.xlabel(r"Simulation $\sigma_S$ values")
    plt.ylabel(r"Detected Contrast: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.title(f"SSVEP Simulation: $\mu_S$ = {MU}, $S_f$ = {HEIGHT}")
    plt.legend(("Simulation Data", "Theoretical Relationship"))

    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-contrast_par-sigma.png")
    
    fig, _ = plt.subplots(1)
    plt.scatter(sigmas, snrs, color="#414B65")

    theo_snrs = np.sort(theo_snrs)
    plt.plot(sigmas, theo_snrs[::-1], color="#E2BF6F")
    
    plt.xlabel(r"Simulation $\sigma_S$ values")
    plt.ylabel(r"Detected SNR: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.title(f"SSVEP Simulation: $\mu_S$ = {MU}, $S_f$ = {HEIGHT}")
    plt.legend(("Simulation Data", "Theoretical Relationship"))

    fig.tight_layout()
    
    fig.savefig(root_dir / "img" / "sim-snr_par-sigma.png")

def snr_simulation(alpha: float = .000001):
    # Run several simulations to compare the effects of changing
    # SSVEP simulation parameters
    #
    # We set alpha to essentially 0 to produce
    # very strict plots and avoid confounding them
    # with effects caused by peak-finding.
    
    FIG_SCALING = 1
    plt.rcParams['figure.figsize'] = [16 * FIG_SCALING, 14 * FIG_SCALING]
    colours = ("#414B65", "#E2BF6F")

    # Simulation parameters
    MU = (1, 2)             # Mean noise
    HEIGHTS = (0, 1, 2)     # Peak values
    SIGMA = (1, 2)          # Noise STD
    N = 1000

    # Simulate and plot reponses in all combinations
    fig, axes = plt.subplots(len(HEIGHTS), len(SIGMA))
    for m, mu in enumerate(MU):
        for h, height in enumerate(HEIGHTS):
            for s, sigma in enumerate(SIGMA):
                contrasts = np.empty(N, dtype=float)
                for n in range(N):
                    freq, psd = simulate_ssvep_spectrum((39, 41), mu, sigma, peak_freq=40,
                                                        peak_height=h)
                    peak_freq = find_peak(freq, psd, peak_freq=40,
                                          search_width=0.2, alpha=alpha)
                    contrasts[n] = cnr(freq, psd, peak_freq=peak_freq)
            
                sns.histplot(contrasts, color=colours[m], kde=True, ax=axes[h,s])

                axes[h,s].set_xlabel(r"Detected Contrast: $\frac{S_f - \mu_S}{\sigma_S}$")
                axes[h,s].set_xlim((-3, 3))
                axes[h,s].title.set_text(f"SSVEP Simulation: $S_f$ = {height}, $\sigma_S$ = {sigma}")
                axes[h,s].legend((f"$\mu_S$ = {MU[0]}",f"$\mu_S$ = {MU[1]}"), loc="upper left")
    
    fig.tight_layout()
    fig.savefig(root_dir / "img" / "sim-contrast_par-all.png")

    fig, axes = plt.subplots(len(HEIGHTS), len(SIGMA))
    for m, mu in enumerate(MU):
        for h, height in enumerate(HEIGHTS):
            for s, sigma in enumerate(SIGMA):
                snrs = np.empty(N, dtype=float)
                for n in range(N):
                    freq, psd = simulate_ssvep_spectrum((39, 41), mu, sigma, peak_freq=40,
                                                        peak_height=h)
                    peak_freq = find_peak(freq, psd, peak_freq=40,
                                          search_width=0.2, alpha=alpha)
                    snrs[n] = snr(freq, psd, peak_freq=peak_freq)
            
                sns.histplot(snrs, color=colours[m], kde=True, ax=axes[h,s])

                axes[h,s].set_xlabel(r"Detected SNR: $\frac{S_f}{\mu_S}$")
                axes[h,s].set_xlim((-3, 3))
                axes[h,s].title.set_text(f"SSVEP Simulation: $S_f$ = {height}, $\sigma_S$ = {sigma}")
                axes[h,s].legend((f"$\mu_S$ = {MU[0]}",f"$\mu_S$ = {MU[1]}"), loc="upper left")
    
    fig.tight_layout()
    fig.savefig(root_dir / "img" / "sim-snr_par-all.png")

def fpr_alpha_simulation():
    # Simulate PSDs to investigate the
    # effects of peak-finding FPR on
    # the estimated contrasts
    FIG_SCALING = 1
    plt.rcParams['figure.figsize'] = [16 * FIG_SCALING, 14 * FIG_SCALING]
    
    MU = 0
    SIGMA = 1
    N = 1000
    ALPHAS = (.5, .2, .1, .01)
    LOWER_LIM = -5
    UPPER_LIM = 10
    peak_heights = np.random.uniform(LOWER_LIM, UPPER_LIM, N)
    
    fig, axes = plt.subplots(2,2)
    for i, alpha in enumerate(ALPHAS):
        contrasts = np.empty(N, dtype=float)
        for n in range(N):
            freq, psd = simulate_ssvep_spectrum((39, 41), MU,
                                                SIGMA, peak_freq=40,
                                                peak_height=peak_heights[n])
            peak_freq = find_peak(freq, psd, peak_freq=40,
                                          search_width=0.2, alpha=alpha)
            contrasts[n] = cnr(freq, psd, peak_freq=peak_freq)

        sns.regplot(peak_heights, contrasts, color="#414B65", ax=axes[int((i/2)), i%2])
        axes[int((i/2)), i%2].set_xlabel(r"Simulation $S_f$")
        axes[int((i/2)), i%2].set_ylabel(r"Detected Contrast: $\frac{S_f - \mu_S}{\sigma_S}$")
        axes[int((i/2)), i%2].title.set_text(r"$\alpha$: " + f"{alpha}")
        sns.lineplot((min(peak_heights),
                  max(peak_heights)), 
                 (_theoretical_contrast(min(peak_heights), MU, SIGMA),
                 _theoretical_contrast(max(peak_heights), MU, SIGMA)),
                  color="#E2BF6F",
                  ax=axes[int((i/2)), i%2])
        plt.legend(("Simulation Data", "Linear Regression", "95% Confidence Interval", "Theoretical Relationship"),
                    loc="upper left")
        
    fig.tight_layout()
    fig.savefig(root_dir / "img" / "sim-contrast_alpha.png")

def test_real_data():
    # XXX Not complete
    raise NotImplementedError("Method incomplete")

    import pandas as pd
    from scipy.signal import welch
    set_plot_settings()

    data_path = Path(__file__).parent.parent / "data" / "S-10_office.csv"
    timeseries = pd.read_csv(data_path).iloc[:,0].values
    initial_fs = 250
    #fs = fit_sfreq(timeseries, initial_fs)
    fs = 250.4180513
    
    n_per_seg = 2 * fs
    percent_overlap = 0.5
    n_overlap = n_per_seg * percent_overlap
    freq, psd = welch(timeseries, fs=fs, window="boxcar", nperseg=n_per_seg, noverlap=n_overlap)
    
    _, axes = plt.subplots(1,2)
    sns.lineplot(freq, 10 * np.log10(psd), ax=axes[0])
    sns.lineplot(freq, 10 * np.log10(psd), ax=axes[1])
    axes[0].set_xlim((1, 45))
    axes[0].set_ylim((-20, 20))
    axes[1].set_xlim((35, 41))
    axes[1].set_ylim((-20, 20))

    step = int(len(timeseries) / 30)
    no_chuncks = int(len(timeseries) / step)
    snrs = np.empty(no_chuncks)
    for i, x in enumerate(np.arange(0, len(timeseries), step)):
        if i == no_chuncks:
            break
        ts = timeseries[x:x+step]
        freq, psd = welch(ts, fs=fs, window="boxcar", nperseg=n_per_seg, noverlap=n_overlap)
        snrs[i] = cnr_byband(freq=freq, psd=psd, peak_freq=40, band_limits=(39, 41))
    
    _, ax = plt.subplots(1)
    sns.histplot(10 * np.log10(snrs), color="#414B65", kde=True, ax=ax)
    ax.set_xlabel(r"Detected SNR: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.show()
    
    for i, x in enumerate(np.arange(0, len(timeseries), step)):
        if i == no_chuncks:
            break
        ts = timeseries[x:x+step]
        freq, psd = welch(ts, fs=fs, window="boxcar", nperseg=n_per_seg, noverlap=n_overlap)
        snrs[i] = cnr_byband(freq=freq, psd=psd, peak_freq=37, band_limits=(36, 38))

    _, ax = plt.subplots(1)
    sns.histplot(10 * np.log10(snrs), color="#414B65", kde=True, ax=ax)
    ax.set_xlabel(r"Detected SNR: $\frac{S_f - \mu_S}{\sigma_S}$")
    plt.show()

if __name__ == "__main__":
    # test_sfreq()
    # simulate_height()
    # simulate_mu()
    # simulate_sigma()
    # fpr_alpha_simulation()
    test_find_peak()
