""" Make Mockup Figure(s)

This module creates a figure to illustrate the SNR
calculation procedure.

It runs from the `stat_analysis_Ia.Rmd` script in a
slightly hacky way: All the below code runs when
`stat_analysis_Ia.Rmd` calls:

`from mk_mockup_figs import *`

This makes and saves the figure which is then imported
during knitting of the Rmd file.
"""

#%%
from pathlib import Path

import numpy as np
from matplotlib import pyplot as plt

from resutil import plotlib

# %%
plotlib.set_oc_style()
plotlib.set_oc_font()

# Dirs
img_dir = Path(__file__).parent.parent.absolute()

# Define a frequency range
f = np.arange(37, 43, .01)

## Simulate a 40 Hz response PSD
# Create a pure-noise 'signal' with an offset
y = np.random.normal(1, size=f.shape) + 2
# Scale it bac a bit
y /= 3
# And add a peak in the middle (40 Hz)
y[int(len(y)/2)] += 3

# Plot the PSD
fig, _ = plt.subplots(1)
plt.plot(f, y)

## Define an indicator function (k(f, f_i))
ind = np.zeros(f.shape)
# It should be able to extract parts of the PSD
# in the neighbouring frequencies to f_i
ind[100:201] +=1
ind[-200:-99] +=1

# Extract the noise
noise = y * ind

# Calculate the average noise value
n_avg = np.mean(y[np.array(ind,dtype=bool)])

# Plot the noise function which is equal to the PSD
# when k(f,f_i)) is 1 and 0 otherwise
plt.plot(f, noise, linestyle = 'dashed', color='#e27070')

# Plot the indicator function as well
plt.plot(f, ind, color="#6fa8dc")

# Formatting
plt.ylim((-.5,5))
plt.legend((r"$\hat{S}_{i}^w(f)$", 
            r"$\hat{S}_{i}^w(f) \odot k(f, f_i)$",
            r"$k(f, f_i)$"))

plt.plot((39.5, 39.9), (max(y), max(y)), linewidth=2, color="#e2bf70")
plt.plot((39.5, 39.9), (n_avg, n_avg), linewidth=2, color="#e2bf70")
plt.plot((39.7, 39.7), (n_avg, max(y)), linewidth=2, color="#e2bf70")

long_expr = r"$\mathrm{SNR}_i=10 \operatorname{log}_{10} \left(\frac{\hat{S}_{i}^w(f_i)}{\hat{S}_{i}^w(f) \odot k(f, f_i)}\right)$"
plt.text(x=37.5, y=max(y)*1.1, s=long_expr, size=20)
plt.text(x=37.5, y=max(y)*.95, s=r"$f_i =\mathrm{40\ Hz}$", size=20)
plt.xlabel("Frequency [Hz]")
plt.ylabel("PSD")

fig.tight_layout()

# Save output
fig.savefig(img_dir / "img" / "snr-mockup.png")
# %%
