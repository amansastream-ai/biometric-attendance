"""
audio.py — bande son d'ambiance synthétisée (pad, whooshs, cloches, battements).

Aucune musique sous licence : tout est synthétisé en numpy, 44.1 kHz stéréo.
À remplacer sans souci par un son tendance TikTok (le MP4 reste muet si --no-audio).
"""
from __future__ import annotations

import wave

import numpy as np

SR = 44100

# Repères temporels (doivent correspondre au montage de render.py)
CUE_TITLE = 0.70
CUE_PORTRAIT = 3.70
CUE_MESSAGE = 10.40
CUE_ENDCARD = 16.20
CUE_DATE = 18.10
DURATION = 21.0


def midi(n: int) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def env_ar(t: np.ndarray, dur: float, attack: float, release: float) -> np.ndarray:
    e = np.ones_like(t)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[-r:] *= np.linspace(1, 0, r) ** 1.4
    return e


def lowpass(x: np.ndarray, cutoff: float, taps: int = 201) -> np.ndarray:
    n = np.arange(taps) - (taps - 1) / 2
    fc = cutoff / SR
    h = 2 * fc * np.sinc(2 * fc * n) * np.hamming(taps)
    h /= h.sum()
    return np.convolve(x, h, mode="same")


def fft_convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = len(x) + len(ir) - 1
    nfft = 1 << int(np.ceil(np.log2(n)))
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:len(x)]
    return y


def reverb_ir(dur: float = 1.6, decay: float = 4.0, seed: int = 11) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = t_axis(dur)
    ir = rng.normal(0, 1, len(t)) * np.exp(-decay * t)
    ir = lowpass(ir, 3200)
    ir[:int(0.01 * SR)] = 0
    return ir / np.max(np.abs(ir)) * 0.5


def add(buf: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n] * gain


# --------------------------------------------------------------------------- #
# Éléments
# --------------------------------------------------------------------------- #
def pad(dur: float) -> np.ndarray:
    """Nappe d'accords douce (Am – F – C – G), stéréo."""
    chords = [
        [45, 48, 52, 57, 60, 64],
        [41, 45, 48, 53, 57, 60],
        [48, 52, 55, 60, 64, 67],
        [43, 47, 50, 55, 59, 62],
    ]
    seg_len = dur / len(chords)
    out = np.zeros((int(dur * SR), 2), np.float32)
    rng = np.random.default_rng(5)
    for ci, chord in enumerate(chords):
        start = ci * seg_len - (0.6 if ci else 0.0)
        length = seg_len + 2.2
        t = t_axis(length)
        e = env_ar(t, length, 1.7, 1.9)
        voice = np.zeros_like(t)
        for ni, note in enumerate(chord):
            f = midi(note)
            det = 1 + rng.uniform(-0.0016, 0.0016)
            amp = 0.32 / (1 + 0.25 * ni)
            vib = 1 + 0.0022 * np.sin(2 * np.pi * (0.14 + 0.03 * ni) * t + ni)
            ph = rng.uniform(0, 6.28)
            voice += amp * (np.sin(2 * np.pi * f * det * vib * t + ph)
                            + 0.30 * np.sin(2 * np.pi * 2 * f * det * vib * t + ph * 1.7)
                            + 0.12 * np.sin(2 * np.pi * 3 * f * det * t + ph * 2.3))
        # souffle haut perché
        shine = np.zeros_like(t)
        for note in chord[2:]:
            f = midi(note + 12)
            shine += np.sin(2 * np.pi * f * t) * 0.05
        shine *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t)
        voice = lowpass(voice * e, 2600) + lowpass(shine * e, 5200)
        voice = fft_convolve(voice, reverb_ir(1.9, 3.4, seed=3 + ci)) * 0.8 + voice
        # largeur stéréo
        l = voice * (1 + 0.05 * np.sin(2 * np.pi * 0.05 * t))
        r = np.roll(voice, 311) * (1 + 0.05 * np.cos(2 * np.pi * 0.05 * t))
        layer = np.stack([l, r], axis=1) * 0.5
        add(out, layer, start)
    return out * 0.55


def whoosh(dur: float = 1.5, seed: int = 21) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = t_axis(dur)
    n = rng.normal(0, 1, len(t))
    ramp = np.linspace(0, 1, len(t)) ** 2
    # balayage : du grave vers l'aigu (mix passe-bas -> passe-bande large)
    dark = lowpass(n, 700)
    bright = n - lowpass(n, 3800)
    sig = dark * (1 - ramp) + bright * ramp
    e = np.sin(np.linspace(0, np.pi, len(t))) ** 1.6
    sig = lowpass(sig * e, 6000)
    sig = np.stack([sig, np.roll(sig, 220)], axis=1) * 0.22
    return sig


def boom(dur: float = 1.4) -> np.ndarray:
    t = t_axis(dur)
    e = np.exp(-3.4 * t)
    sig = (np.sin(2 * np.pi * 52 * t) + 0.4 * np.sin(2 * np.pi * 78 * t)
           + 0.2 * np.sin(2 * np.pi * 104 * t)) * e
    sig = fft_convolve(sig, reverb_ir(1.2, 4.0, seed=9)) * 0.35 + sig
    return np.stack([sig, sig], axis=1) * 0.42


def bell(freq: float = 880.0, dur: float = 2.6, gain: float = 0.5) -> np.ndarray:
    t = t_axis(dur)
    partials = [(1.0, 1.0, 2.2), (2.01, 0.5, 3.0), (2.98, 0.3, 4.1),
                (4.15, 0.16, 5.6), (5.4, 0.08, 7.0)]
    sig = np.zeros_like(t)
    for ratio, amp, dec in partials:
        sig += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-dec * t)
    sig = fft_convolve(sig, reverb_ir(2.6, 2.2, seed=17)) * 0.5 + sig
    return np.stack([sig, np.roll(sig, 180)], axis=1) * 0.5 * gain


def heartbeat(dur: float, interval: float = 2.4, start: float = 0.0) -> np.ndarray:
    """Battement 'lub-dub' très discret."""
    out = np.zeros((int(dur * SR), 2), np.float32)
    t0 = start
    while t0 < dur:
        for k, (off, gain) in enumerate(((0.0, 1.0), (0.30, 0.62))):
            lt = t_axis(0.55)
            e = np.exp(-9 * lt)
            sig = (np.sin(2 * np.pi * 58 * lt) * 0.9
                   + np.sin(2 * np.pi * 116 * lt) * 0.25) * e
            sig = lowpass(sig, 900) * 0.5 * gain
            add(out, np.stack([sig, sig], axis=1), t0 + off)
        t0 += interval
    return out * 0.5


# --------------------------------------------------------------------------- #
def build(duration: float = DURATION) -> np.ndarray:
    n = int(duration * SR)
    mix = np.zeros((n, 2), np.float32)

    add(mix, pad(duration), 0.0, 0.9)

    # transitions
    for cu in (CUE_PORTRAIT, CUE_MESSAGE, CUE_ENDCARD):
        add(mix, whoosh(1.6, seed=int(cu * 10) % 97), cu - 1.15, 0.85)
        add(mix, boom(), cu - 0.06, 1.0)

    # accents
    add(mix, bell(1046.5, 2.6, 0.42), CUE_TITLE, 1.0)     # titre
    add(mix, bell(1568.0, 3.0, 0.38), CUE_ENDCARD + 0.55, 1.0)  # carte de fin
    add(mix, bell(1318.5, 2.8, 0.34), CUE_DATE, 1.0)      # date
    add(mix, bell(784.0, 2.2, 0.22), CUE_MESSAGE + 0.4, 1.0)

    # battements de cœur sous le message
    hb = heartbeat(duration, interval=2.4, start=0.4)
    gate = np.zeros(n, np.float32)
    for a, b, lvl in ((0.6, 3.6, 0.35), (CUE_MESSAGE, CUE_ENDCARD, 1.0),
                      (CUE_ENDCARD, 20.4, 0.35)):
        i, j = int(a * SR), int(min(b, duration) * SR)
        gate[i:j] = lvl
    gate = np.convolve(gate, np.ones(int(0.35 * SR)) / (0.35 * SR), mode="same")
    mix += hb * gate[:, None]

    # fondu global
    fade_in = np.linspace(0, 1, int(0.8 * SR)) ** 1.5
    fade_out = np.linspace(1, 0, int(1.6 * SR)) ** 1.2
    mix[:len(fade_in)] *= fade_in[:, None]
    mix[-len(fade_out):] *= fade_out[:, None]

    # normalisation douce
    peak = float(np.max(np.abs(mix))) or 1.0
    mix = np.tanh(mix / peak * 1.15) * 0.82
    return mix.astype(np.float32)


def write_wav(path: str, sig: np.ndarray) -> None:
    data = np.clip(sig, -1, 1)
    pcm = (data * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/audio.wav"
    write_wav(out, build())
    print("wav ->", out)
