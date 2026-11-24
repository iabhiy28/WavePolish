# Audio processing

Effects are evaluated in rack order on a fresh copy of the current edit. The imported PCM is retained during the session for restoration. EQ types, notch frequencies, dynamics and gains are calculated with ordinary numerical methods.

| Effect | Algorithm |
| --- | --- |
| High-pass and low-pass | Cascaded second-order IIR biquads. Cutoff and Q determine each section. Each stage adds approximately 12 dB/octave of asymptotic slope. |
| Hum removal | Narrow IIR notch filters at the selected fundamental and its harmonics below Nyquist. |
| Noise reduction | Radix-2 STFT using periodic Hann windows and a hop of one quarter window. Average power from the selected original region is subtracted from each frame before conversion to a gain. Frequency and temporal smoothing, gain floor, wet/dry mixing, inverse FFT and weighted overlap-add limit artifacts. |
| Noise gate | Smoothed peak envelope, hysteresis and hold determine open/closed state. Separate attack and release constants smooth gain. |
| Parametric EQ | Low shelf or high pass, peaking mid band, and high shelf or low pass. The graph evaluates the product of the biquad transfer functions and supports pointer adjustment. |
| De-esser | A band-pass detector estimates sibilance level. A smoothed threshold-dependent gain reduces that band and recombines it with the full signal. |
| Compressor | Peak envelope detection, threshold, ratio, and quadratic soft knee feed a smoothed gain stage with makeup gain. A decimated trace provides gain-reduction readout during processed playback. |
| Normalization | Sample peak, RMS, or integrated loudness determines global gain, constrained by a peak ceiling. Integrated normalization uses K-weighting and overlapping 400 ms blocks with absolute and relative gates, based on ITU-R BS.1770. The generalized filter coefficients, short-clip fallback and surround layout assumptions have not been validated against a conformance suite. |
| Limiter | A sliding maximum anticipates peaks across channels. Immediate gain reduction and exponential release apply a linked sample-peak ceiling. |
| Click and pop removal | Large first differences are compared with a smoothed local baseline. Short excursions that return toward the baseline are repaired with linear interpolation. |
| Plosive reduction | A low-pass detector estimates low-frequency bursts, attenuates the low band based on threshold and envelope, and adds the correction back to the full signal. |
| Silence detection | 20 ms RMS measurements find silence below −40 dBFS lasting at least 300 ms. Removal requires confirmation. |

The limiter measures sample peaks without oversampling. The included tests use deterministic synthetic signals and verify attenuation, an SNR improvement against a clean reference, filter behavior, impulse repair, clipping, layout and duration preservation, and WAV serialization. Browser tests exercise the actual editor and exports.

[ITU-R BS.1770 specification](https://www.itu.int/rec/R-REC-BS.1770/en)
