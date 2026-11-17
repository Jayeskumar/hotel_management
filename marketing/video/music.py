"""Original soundtrack for the TableWise product video (royalty-free: synthesised from scratch).

Warm, upbeat 100 BPM groove in D major with plucked strings, a bansuri-style flute,
light tabla-flavoured percussion and scene-change whooshes, timed to build/compose-data.json.
Usage: python3 music.py  ->  build/music.wav
"""
import json
import os
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'build', 'compose-data.json')))
scenes = {s['id']: s for s in data['scenes']}
TOTAL = data['total']
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(7)

BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
DROP = scenes['dashboard']['start']          # groove starts with the first feature
BREAK = (scenes['tamil']['start'], scenes['phone']['start'])   # lighter section
LIFT = scenes['recap']['start']
OUTRO = scenes['outro']['start']

dry = np.zeros((N, 2))
wet = np.zeros((N, 2))      # reverb send
duck_src = np.zeros(N)      # kick envelope for side-chain


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = np.array(sig[: N - i], dtype=float)
    k = min(len(sig), int(0.008 * SR))
    if k > 1:
        sig[-k:] *= np.linspace(1, 0, k)
    l = gain * np.cos((pan + 1) * np.pi / 4)
    r = gain * np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * l
    buf[i:i + len(sig), 1] += sig * r


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    env = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return env[:n] if len(env) >= n else np.pad(env, (0, n - len(env)))


def onepole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    # vectorised IIR via lfilter-like recursion using cumulative trick is hard; use FFT filter instead
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (f / cutoff) ** 2)
    return np.fft.irfft(X * H, len(x))


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / np.sqrt(1 + (f / hi) ** 4))
    return np.fft.irfft(X * H, len(x))


# ---------------------------------------------------------------- instruments
def pluck(freq, dur=1.4, bright=1.0):
    t = t_axis(dur)
    sig = np.zeros_like(t)
    for k in range(1, 14):
        inh = k * (1 + 0.0007 * k * k)
        amp = (1 / k ** 1.15) * bright ** (k / 6)
        sig += amp * np.sin(2 * np.pi * freq * inh * t + rng.uniform(0, 1)) * np.exp(-t * (2.2 + 0.55 * k))
    sig *= np.minimum(1, t / 0.002)
    return sig / 2.2


def pad(freqs, dur):
    t = t_axis(dur)
    sig = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            for k in range(1, 9):
                sig += (1 / k) * np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) * (0.55 ** (k - 1))
    sig = onepole_lp(sig, 1400)
    sig *= adsr(len(t), 0.8, 0.5, 0.85, 1.0)
    return sig / (len(freqs) * 6)


def bass(freq, dur):
    t = t_axis(dur)
    sig = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    return sig * adsr(len(t), 0.005, 0.12, 0.6, 0.08) * 0.55


def flute(freq, dur):
    t = t_axis(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, np.maximum(0, (t - 0.18) / 0.3))
    phase = 2 * np.pi * freq * np.cumsum(vib) / SR
    tone = np.sin(phase) + 0.22 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    breath = bandpass(rng.standard_normal(len(t)), freq * 0.9, freq * 4) * 0.12
    # small grace-note scoop typical of bansuri phrasing
    scoop = np.exp(-t * 18)
    tone = np.sin(phase - 0.6 * scoop) + 0.22 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    return (tone + breath) * adsr(len(t), 0.07, 0.15, 0.8, min(0.25, dur * 0.4)) * 0.38


def kick():
    t = t_axis(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    sig += 0.25 * rng.standard_normal(len(t)) * np.exp(-t * 300)
    return sig * 0.9


def clap():
    t = t_axis(0.35)
    n = rng.standard_normal(len(t))
    env = np.zeros_like(t)
    for off in (0, 0.011, 0.022):
        env += np.where(t >= off, np.exp(-(t - off) * (60 if off < 0.02 else 14)), 0)
    return bandpass(n * env, 900, 5000) * 0.5


def hat(open_=False):
    t = t_axis(0.25 if open_ else 0.06)
    n = rng.standard_normal(len(t))
    sig = bandpass(n, 7000, 16000) * np.exp(-t * (14 if open_ else 70))
    return sig * 0.35


def shaker():
    t = t_axis(0.09)
    return bandpass(rng.standard_normal(len(t)), 4000, 12000) * np.exp(-((t - 0.03) / 0.025) ** 2) * 0.16


def tabla_na():
    t = t_axis(0.35)
    f = 420 * (1 - 0.04 * np.exp(-t * 30))
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = (np.sin(ph) + 0.5 * np.sin(2.72 * ph) + 0.3 * np.sin(4.1 * ph)) * np.exp(-t * 16)
    sig += 0.3 * bandpass(rng.standard_normal(len(t)), 2000, 6000) * np.exp(-t * 120)
    return sig * 0.28


def tabla_ge():
    t = t_axis(0.5)
    f = 82 + 30 * (1 - np.exp(-t * 9))   # characteristic upward bend
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    return sig * 0.45


def sweep_noise(n, _unused, start_hz, end_hz, curve=1, bands=8):
    """Noise whose centre frequency glides from start_hz to end_hz, built by cross-fading
    fixed band-passed copies (no block seams, so no zipper noise)."""
    centres = np.geomspace(min(start_hz, end_hz), max(start_hz, end_hz), bands)
    layers = [bandpass(n, c * 0.6, c * 1.8) for c in centres]
    p = np.linspace(0, 1, len(n)) ** curve
    pos = p * (bands - 1) if end_hz >= start_hz else (1 - p) * (bands - 1)
    out = np.zeros(len(n))
    for i, layer in enumerate(layers):
        w = np.clip(1 - np.abs(pos - i), 0, 1)
        out += layer * w
    return out


def whoosh(dur=0.9, up=True):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    env = np.sin(np.pi * t / dur) ** 2
    return sweep_noise(n, 300, 3000 if up else 300, 300 if not up else 3000) * env * 0.22


def riser(dur):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    out = sweep_noise(n, 400, 400, 6000, curve=2)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 600 * (t / dur) ** 2) / SR) * 0.15
    return (out * 0.3 + sweep) * (t / dur) ** 2


def impact():
    t = t_axis(2.5)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 10)) / SR) * np.exp(-t * 2.2)
    air = bandpass(rng.standard_normal(len(t)), 200, 6000) * np.exp(-t * 5) * 0.35
    return (boom + air) * 0.8


# ---------------------------------------------------------------- harmony (D major: I – V – vi – IV)
D, A, Bm, G = [62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]
PROG = [D, A, Bm, G]
ROOTS = [38, 33, 35, 31]


def chord_at(t):
    i = int(np.floor((t - DROP) / BAR)) % 4 if t >= DROP else 0
    return i


# Intro: pad swell, sparse plucks and a flute call
add(wet, 0.0, pad([hz(n) for n in D + [74]], DROP + 0.4), 0.55)
add(dry, 0.0, pad([hz(n) for n in D + [74]], DROP + 0.4), 0.35)
for k, (beat, note) in enumerate([(0.0, 74), (1.5, 78), (3.0, 81), (4.5, 78), (6.0, 76), (7.5, 74)]):
    add(dry, 1.2 + beat * BEAT, pluck(hz(note), 1.6), 0.32, pan=0.25 if k % 2 else -0.25)
    add(wet, 1.2 + beat * BEAT, pluck(hz(note), 1.6), 0.2)
intro_flute = [(0, 81, 1.5), (1.5, 83, 0.5), (2.0, 81, 0.5), (2.5, 78, 1.0), (3.5, 76, 0.5), (4.0, 78, 2.5)]
for b, n, l in intro_flute:
    add(dry, 3.2 + b * BEAT, flute(hz(n), l * BEAT), 0.5, 0.1)
    add(wet, 3.2 + b * BEAT, flute(hz(n), l * BEAT), 0.35)
# "One app." accent and the build into the drop
one_app = scenes['hook']['start'] + 2.0
add(dry, one_app, pluck(hz(86), 2.0, 1.3), 0.35)
add(wet, one_app, pluck(hz(86), 2.0, 1.3), 0.4)
add(dry, DROP - 2.4, riser(2.4), 0.8)
add(dry, DROP, impact(), 0.9)
add(wet, DROP, impact(), 0.3)

# Groove
bars = int(np.ceil((OUTRO - DROP) / BAR))
for b in range(bars):
    t0 = DROP + b * BAR
    chord = PROG[b % 4]
    root = ROOTS[b % 4]
    in_break = BREAK[0] - 0.3 <= t0 < BREAK[1] - 0.3
    lifted = t0 >= LIFT - 0.3
    # pad
    add(dry, t0, pad([hz(n) for n in chord], BAR + 0.6), 0.34 if not in_break else 0.42)
    add(wet, t0, pad([hz(n) for n in chord], BAR + 0.6), 0.25)
    # bass: syncopated pattern
    if not in_break:
        for beat, l in [(0, 0.75), (1.5, 0.4), (2.0, 0.75), (3.5, 0.4)]:
            add(dry, t0 + beat * BEAT, bass(hz(root), l * BEAT), 0.85)
    # plucked arpeggio, 16ths
    arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12, chord[0] + 24, chord[2] + 12, chord[1] + 12, chord[2] + 12]
    if lifted:
        arp = [n + 12 for n in arp]
    for i in range(16):
        n = arp[i % 8]
        accent = 1.0 if i % 4 == 0 else 0.7
        pan = -0.35 if i % 2 else 0.35
        add(dry, t0 + i * BEAT / 4, pluck(hz(n), 0.6, 0.9), 0.17 * accent, pan)
        add(wet, t0 + i * BEAT / 4, pluck(hz(n), 0.6, 0.9), 0.06 * accent)
    # drums
    if not in_break:
        for beat in (0, 1.75, 2.0):
            add(dry, t0 + beat * BEAT, kick(), 0.72)
            k = kick()
            i0 = int((t0 + beat * BEAT) * SR)
            duck_src[i0:i0 + len(k)] = np.maximum(duck_src[i0:i0 + len(k)], np.exp(-np.arange(min(len(k), N - i0)) / SR * 9)[: N - i0])
        for beat in (1, 3):
            add(dry, t0 + beat * BEAT, clap(), 0.42 if not lifted else 0.55)
            add(wet, t0 + beat * BEAT, clap(), 0.25)
    for i in range(8):
        swing = 0.03 if i % 2 else 0
        add(dry, t0 + (i * 0.5 + swing) * BEAT, hat(open_=(i == 7 and b % 2 == 1)), 0.5 if not in_break else 0.35, 0.3)
    for i in range(16):
        add(dry, t0 + i * BEAT / 4 + 0.01, shaker(), 0.8 if i % 2 else 0.5, -0.4)
    # tabla accents every other bar
    if b % 2 == 1 or in_break:
        for beat in (0.5, 2.5, 3.25):
            add(dry, t0 + beat * BEAT, tabla_na(), 0.8, 0.2)
        add(dry, t0 + 3.0 * BEAT, tabla_ge(), 0.8, -0.1)

# Flute melody: in the breakdown and over the recap
def melody(start, phrase):
    for b, n, l in phrase:
        add(dry, start + b * BEAT, flute(hz(n), l * BEAT), 0.42, 0.1)
        add(wet, start + b * BEAT, flute(hz(n), l * BEAT), 0.3)


phrase_a = [(0, 81, 1.0), (1, 83, 0.5), (1.5, 81, 0.5), (2, 78, 1.5), (3.5, 76, 0.5), (4, 74, 1.0), (5, 76, 0.5), (5.5, 78, 0.5),
            (6, 81, 2.0), (8, 83, 1.0), (9, 86, 1.0), (10, 83, 0.5), (10.5, 81, 0.5), (11, 78, 1.0), (12, 76, 0.5), (12.5, 78, 0.5), (13, 74, 3.0)]
brk = DROP + np.ceil((BREAK[0] - DROP) / BAR) * BAR
melody(brk, phrase_a)
lift_bar = DROP + np.ceil((LIFT - 0.3 - DROP) / BAR) * BAR
melody(lift_bar, [(0, 86, 1.0), (1, 88, 0.5), (1.5, 86, 0.5), (2, 83, 1.0), (3, 81, 1.0), (4, 83, 2.0)])

# Scene-change whooshes (centred on each cross-fade)
for s in data['scenes'][2:]:
    add(dry, s['start'] - 0.45, whoosh(0.9), 0.55, pan=float(rng.uniform(-0.3, 0.3)))

# Outro: resolve on D with a final flute phrase and a soft impact
add(dry, OUTRO, impact(), 0.55)
add(wet, OUTRO, pad([hz(n) for n in D + [74, 78]], TOTAL - OUTRO + 1), 0.6)
add(dry, OUTRO, pad([hz(n) for n in D + [74, 78]], TOTAL - OUTRO + 1), 0.35)
add(dry, OUTRO, bass(hz(38), 3.0), 0.7)
for k, n in enumerate([74, 78, 81, 86]):
    add(dry, OUTRO + k * BEAT / 2, pluck(hz(n), 2.5, 1.2), 0.3, pan=-0.3 + 0.2 * k)
    add(wet, OUTRO + k * BEAT / 2, pluck(hz(n), 2.5, 1.2), 0.3)
melody(OUTRO + 1.2, [(0, 81, 1.0), (1, 78, 0.5), (1.5, 76, 0.5), (2, 74, 4.0)])

# ---------------------------------------------------------------- mix
# Side-chain: duck the sustained parts under the kick
duck = 1 - 0.35 * duck_src
dry *= duck[:, None] ** 0.6

# Reverb: stereo exponentially-decaying noise impulse, FFT convolution
ir_len = int(2.6 * SR)
tt = np.arange(ir_len) / SR
ir = rng.standard_normal((ir_len, 2)) * np.exp(-tt * 2.4)[:, None]
ir[:int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=0))
size = 1 << int(np.ceil(np.log2(N + ir_len)))
rev = np.zeros((N, 2))
for c in range(2):
    rev[:, c] = np.fft.irfft(np.fft.rfft(wet[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:N]
mix = dry + 0.55 * rev

# Gentle high-shelf air and low cut
for c in range(2):
    X = np.fft.rfft(mix[:, c])
    f = np.fft.rfftfreq(N, 1 / SR)
    H = (1 / np.sqrt(1 + (30 / np.maximum(f, 1)) ** 4)) * (1 + 0.15 / (1 + (8000 / np.maximum(f, 1)) ** 2))
    mix[:, c] = np.fft.irfft(X * H, N)

mix = mix[: int(TOTAL * SR)]
fade_in = int(0.05 * SR)
fade_out = int(2.6 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= (np.linspace(1, 0, fade_out) ** 1.5)[:, None]
mix = mix / np.max(np.abs(mix))
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix *= 10 ** (-1.0 / 20)

out = os.path.join(HERE, 'build', 'music.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'music → {out} ({TOTAL:.1f}s), drop at {DROP:.1f}s, break {BREAK[0]:.1f}-{BREAK[1]:.1f}s, outro {OUTRO:.1f}s')
