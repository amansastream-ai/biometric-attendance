#!/usr/bin/env node
/**
 * Bande sonore 100 % générée (aucun sample externe) :
 *   - musique électronique douce (pad, sub, arpèges, kick, hats) synchronisée au montage
 *   - sound design : whooshes de transition, impacts, validation, clic
 *
 * Sortie : build/audio/music.wav et build/audio/sfx.wav (44,1 kHz stéréo 16 bits)
 * Le mixage final et l'encodage AAC sont faits par ffmpeg (voir render.mjs).
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "build", "audio");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

/* ------------------------------------------------------------------ */
/* Montage : mêmes instants que la vidéo                               */
/* ------------------------------------------------------------------ */
const MARKS = {
  boot: 0.0,
  hook: 2.15,
  reveal: 4.15,
  scan: 5.1,
  scanOk: 7.82,
  granted: 9.3,
  trust: 10.65,
  dashboard: 13.8,
  features: 18.4,
  exportScene: 23.4,
  download: 26.35,
  outro: 26.4,
  end: 29.6,
};

/* ------------------------------------------------------------------ */
/* Synthèse                                                            */
/* ------------------------------------------------------------------ */
class Buf {
  constructor(dur) {
    this.n = Math.ceil(dur * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  add(i, l, r) {
    if (i < 0 || i >= this.n) return;
    this.L[i] += l;
    this.R[i] += r ?? l;
  }
}

const T = (t) => Math.round(t * SR);

/** Oscillateur additif avec enveloppe ADSR, appliqué à une voix stéréo. */
const voice = (buf, t0, dur, { freq, type = "sine", a = 0.01, d = 0.2, s = 0.6, r = 0.3, gain = 0.2, pan = 0, detune = 0, glide = 0 } = {}) => {
  const start = T(t0);
  const n = T(dur + r + 0.05);
  const gL = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gR = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env;
    if (t < a) env = t / a;
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
    else if (t < dur) env = s;
    else env = s * Math.max(0, 1 - (t - dur) / r);
    if (env <= 0) continue;
    const f = freq * (glide ? Math.pow(glide, t / dur) : 1);
    phase += (2 * Math.PI * f) / SR;
    phase2 += (2 * Math.PI * f * (1 + detune)) / SR;
    let v;
    if (type === "sine") v = (Math.sin(phase) + 0.6 * Math.sin(phase2)) / 1.6;
    else if (type === "tri") v = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else if (type === "saw") v = ((phase / Math.PI) % 2) - 1;
    else if (type === "square") v = Math.sin(phase) > 0 ? 1 : -1;
    else v = Math.sin(phase);
    buf.add(start + i, v * env * gL, v * env * gR);
  }
};

/** Percussion : sinus avec chute de hauteur (kick) ou bruit filtré (hat/snare). */
const kick = (buf, t0, { gain = 0.75, dur = 0.45, f0 = 118, f1 = 44 } = {}) => {
  const start = T(t0);
  const n = T(dur);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 9.5) * (1 - Math.exp(-t * 400));
    const f = f1 + (f0 - f1) * Math.exp(-t * 34);
    phase += (2 * Math.PI * f) / SR;
    const v = Math.sin(phase) * env * gain;
    buf.add(start + i, v, v);
  }
};

let noiseSeed = 20261006;
const rnd = () => {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) % 4294967296;
  return noiseSeed / 4294967296 - 0.5;
};

/** Bruit passe-bande à un pôle (approx. résonante) — hats, whooshes, risers. */
const noise = (buf, t0, dur, { gain = 0.2, fc = 6000, q = 0.6, pan = 0, a = 0.002, curve = 4, sweep = null, hp = 0 } = {}) => {
  const start = T(t0);
  const n = T(dur);
  let lp = 0;
  let hpv = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    const env = p < a / dur ? p / (a / dur) : Math.pow(1 - p, curve);
    const freq = sweep ? sweep[0] * Math.pow(sweep[1] / sweep[0], p) : fc;
    const x = rnd() * 2;
    // filtre passe-bas à un pôle
    const alpha = Math.min(1, (2 * Math.PI * freq) / SR);
    lp += alpha * (x - lp);
    let v = x - lp * (1 - q); // mélange passe-haut/passe-bande
    if (hp) {
      hpv += Math.min(1, (2 * Math.PI * hp) / SR) * (v - hpv);
      v -= hpv;
    }
    const gL = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    buf.add(start + i, v * env * gL, v * env * gR);
    last = v;
  }
  return last;
};

/** Réverbération simple : peigne + délai (donne de la profondeur à peu de frais). */
const space = (buf, { delay = 0.27, fb = 0.34, mix = 0.3, taps = [0, 0.37, 0.53, 0.79] } = {}) => {
  const d = T(delay);
  const L = new Float32Array(buf.n);
  const R = new Float32Array(buf.n);
  for (const tap of taps) {
    const off = T(delay * tap * 2.2);
    for (let i = d; i < buf.n; i++) {
      L[i] = buf.L[i - d] * fb + L[i - d] * fb * 0.6;
      R[i] = buf.R[i - d] * fb * 1.1 + R[i - d] * fb * 0.5;
    }
    for (let i = 0; i < buf.n; i++) {
      const j = i + off;
      if (j < buf.n) {
        buf.L[j] += L[i] * mix * 0.5;
        buf.R[j] += R[i] * mix * 0.5;
      }
    }
  }
  return buf;
};

/** Égalisation "présence" : ajoute le contenu au-dessus de ~400 Hz (audible sur mobile). */
const presence = (buf, { fc = 400, amount = 1.15, keep = 0.62 } = {}) => {
  const a = Math.min(1, (2 * Math.PI * fc) / SR);
  let lp = 0;
  for (let i = 0; i < buf.n; i++) {
    lp += a * (buf.L[i] - lp);
    const hp = buf.L[i] - lp;
    buf.L[i] = buf.L[i] * keep + hp * amount;
  }
  lp = 0;
  for (let i = 0; i < buf.n; i++) {
    lp += a * (buf.R[i] - lp);
    const hp = buf.R[i] - lp;
    buf.R[i] = buf.R[i] * keep + hp * amount;
  }
};

const lowpass = (buf, fc = 9000) => {
  const alpha = Math.min(1, (2 * Math.PI * fc) / SR);
  let l = 0;
  let r = 0;
  for (let i = 0; i < buf.n; i++) {
    l += alpha * (buf.L[i] - l);
    r += alpha * (buf.R[i] - r);
    buf.L[i] = l;
    buf.R[i] = r;
  }
};

const peakNormalize = (buf, target = 0.92) => {
  let peak = 0;
  for (let i = 0; i < buf.n; i++) {
    const a = Math.abs(buf.L[i]);
    const b = Math.abs(buf.R[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const k = peak > 0 ? target / peak : 1;
  for (let i = 0; i < buf.n; i++) {
    buf.L[i] *= k;
    buf.R[i] *= k;
  }
};

/** Fondu global (intro / outro) pour éviter les clics. */
const fadeEdges = (buf, fin = 0.6, fout = 1.2) => {
  const a = T(fin);
  const b = T(fout);
  for (let i = 0; i < a; i++) {
    const k = i / a;
    buf.L[i] *= k;
    buf.R[i] *= k;
  }
  for (let i = 0; i < b; i++) {
    const k = i / b;
    buf.L[buf.n - 1 - i] *= k;
    buf.R[buf.n - 1 - i] *= k;
  }
};

/* ------------------------------------------------------------------ */
/* Écriture WAV                                                        */
/* ------------------------------------------------------------------ */
const writeWav = (path, buf) => {
  const n = buf.n;
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, buf.L[i]));
    const r = Math.max(-1, Math.min(1, buf.R[i]));
    data.writeInt16LE(Math.round(l * 32767), o);
    data.writeInt16LE(Math.round(r * 32767), o + 2);
    o += 4;
  }
  writeFileSync(path, data);
  console.log(`  ${path.split("/").pop()} : ${(n / SR).toFixed(2)} s`);
};

/* ------------------------------------------------------------------ */
/* 1. MUSIQUE                                                          */
/* ------------------------------------------------------------------ */
const DUR = MARKS.end;
const music = new Buf(DUR);

const BPM = 120;
const beat = 60 / BPM; // 0,5 s
const bar = beat * 4; // 2 s

// Fond : sub continue + nappe par accord (Am – F – C – G)
const CHORDS = [
  { root: 110.0, notes: [220.0, 261.63, 329.63], name: "Am" },
  { root: 87.31, notes: [174.61, 220.0, 261.63], name: "F" },
  { root: 130.81, notes: [196.0, 261.63, 329.63], name: "C" },
  { root: 98.0, notes: [196.0, 246.94, 293.66], name: "G" },
];

for (let b = 0; b * bar < DUR + 2; b++) {
  const t0 = b * bar;
  const ch = CHORDS[b % 4];
  const full = t0 >= MARKS.scan;
  // nappe : attaque douce, longue tenue + couche d'octave (présence médium)
  for (let i = 0; i < ch.notes.length; i++) {
    voice(music, t0, bar * 0.98, {
      freq: ch.notes[i],
      type: "sine",
      a: 0.35,
      d: 0.4,
      s: 0.75,
      r: 0.9,
      gain: (full ? 0.1 : 0.075) / (i + 1.2),
      pan: i === 0 ? -0.35 : i === 1 ? 0.3 : 0.0,
      detune: 0.004 * (i % 2 ? 1 : -1),
    });
    voice(music, t0, bar * 0.98, {
      freq: ch.notes[i] * 2,
      type: "tri",
      a: 0.28,
      d: 0.5,
      s: 0.55,
      r: 0.8,
      gain: (full ? 0.055 : 0.038) / (i + 1),
      pan: i === 0 ? 0.3 : i === 2 ? -0.28 : 0.05,
      detune: 0.003,
    });
  }
  // sub : pulsation sur les temps
  if (t0 >= MARKS.boot + bar) {
    for (let k = 0; k < 4; k++) {
      const strong = k % 2 === 0;
      voice(music, t0 + k * beat, beat * 0.9, {
        freq: ch.root,
        a: 0.006,
        d: 0.22,
        s: strong ? 0.5 : 0.3,
        r: 0.24,
        gain: strong ? 0.072 : 0.046,
      });
    }
  }
  // arpèges : à partir de la borne
  if (t0 >= MARKS.scan - bar) {
    const scale = ch.notes.map((f) => f * 2);
    for (let s = 0; s < 16; s++) {
      const idx = [0, 1, 2, 1][s % 4] + (s % 8 === 7 ? 1 : 0);
      const f = scale[idx % scale.length] * (s % 8 >= 4 ? 2 : 1);
      const pan = ((s % 4) / 3) * 1.3 - 0.65;
      voice(music, t0 + s * (beat / 4), beat * 0.34, {
        freq: f,
        type: "tri",
        a: 0.004,
        d: 0.1,
        s: 0.12,
        r: 0.16,
        gain: t0 >= MARKS.dashboard ? 0.115 : 0.085,
        pan,
      });
      voice(music, t0 + s * (beat / 4) + 0.012, beat * 0.26, {
        freq: f * 2,
        type: "sine",
        a: 0.003,
        d: 0.07,
        s: 0.08,
        r: 0.12,
        gain: t0 >= MARKS.dashboard ? 0.05 : 0.032,
        pan: -pan,
      });
    }
  }
}

// Batterie : kick + hats à partir de la borne
for (let t0 = MARKS.scan - beat; t0 < MARKS.outro; t0 += beat) {
  const inOutro = t0 >= MARKS.outro;
  const b = Math.round((t0 - (MARKS.scan - beat)) / beat);
  if (!inOutro) kick(music, t0, { gain: b % 4 === 0 ? 0.3 : 0.21, f0: 118, f1: 52 });
  // hats sur les contretemps
  noise(music, t0 + beat / 2, 0.07, { gain: 0.1, fc: 11000, hp: 6500, curve: 5, pan: b % 2 ? 0.35 : -0.35 });
  noise(music, t0 + beat * 0.25, 0.035, { gain: 0.045, fc: 13000, hp: 8000, curve: 7, pan: b % 2 ? -0.5 : 0.5 });
}
// caisse claire légère sur les temps 2 et 4
for (let t0 = MARKS.trust; t0 < MARKS.outro; t0 += bar) {
  for (const off of [beat, beat * 3]) {
    noise(music, t0 + off, 0.17, { gain: 0.12, fc: 4200, q: 0.3, curve: 3, pan: 0.05 });
  }
}

// Risers avant les grands moments
for (const m of [MARKS.hook, MARKS.scan, MARKS.dashboard, MARKS.features, MARKS.outro]) {
  noise(music, m - 1.1, 1.05, { gain: 0.085, sweep: [300, 6200], curve: 1.1, a: 0.9, pan: 0 });
}
// Impacts (graves) sur les moments clés
for (const [m, g] of [
  [MARKS.reveal, 0.5],
  [MARKS.scanOk, 0.45],
  [MARKS.dashboard, 0.5],
  [MARKS.features, 0.45],
  [MARKS.exportScene, 0.42],
  [MARKS.outro, 0.55],
]) {
  voice(music, m, 1.6, { freq: 62, type: "sine", a: 0.004, d: 0.5, s: 0.22, r: 1.0, gain: g * 0.3, glide: 0.62 });
  noise(music, m, 0.6, { gain: 0.06, fc: 1400, q: 0.2, curve: 3 });
}

space(music, { delay: 0.25, fb: 0.28, mix: 0.28 });
presence(music, { fc: 420, amount: 1.5, keep: 0.6 });
lowpass(music, 11000);
// coupe-infra : enlève la boue sous 38 Hz
{
  let lp = 0;
  for (let i = 0; i < music.n; i++) {
    const alpha = Math.min(1, (2 * Math.PI * 38) / SR);
    lp += alpha * (music.L[i] - lp);
    music.L[i] -= lp * 0.9;
  }
  lp = 0;
  for (let i = 0; i < music.n; i++) {
    const alpha = Math.min(1, (2 * Math.PI * 38) / SR);
    lp += alpha * (music.R[i] - lp);
    music.R[i] -= lp * 0.9;
  }
}
fadeEdges(music, 0.8, 1.4);
peakNormalize(music, 0.7);

/* ------------------------------------------------------------------ */
/* 2. SOUND DESIGN                                                     */
/* ------------------------------------------------------------------ */
const sfx = new Buf(DUR);

// Whooshes de transition
for (const m of [MARKS.hook, MARKS.scan, MARKS.trust, MARKS.dashboard, MARKS.features, MARKS.exportScene, MARKS.outro]) {
  noise(sfx, m - 0.34, 0.68, { gain: 0.16, sweep: [260, 7200], q: 0.55, curve: 1.6, a: 0.28, pan: -0.25 });
  noise(sfx, m - 0.28, 0.58, { gain: 0.12, sweep: [7200, 400], q: 0.6, curve: 1.4, a: 0.2, pan: 0.3 });
}

// Validation du pointage : accord cristallin
for (const [f, g, dly] of [
  [659.25, 0.16, 0.0],
  [987.77, 0.13, 0.055],
  [1318.5, 0.09, 0.11],
]) {
  voice(sfx, MARKS.scanOk + dly, 0.9, { freq: f, type: "sine", a: 0.004, d: 0.28, s: 0.3, r: 0.6, gain: g, pan: 0.1 });
}
noise(sfx, MARKS.scanOk, 0.22, { gain: 0.1, fc: 7000, hp: 3000, curve: 4 });

// Enregistrement serveur : petit "tick"
voice(sfx, MARKS.granted, 0.22, { freq: 1760, type: "sine", a: 0.002, d: 0.05, s: 0.1, r: 0.12, gain: 0.1, pan: 0.35 });

// Clic du bouton de téléchargement + confirmation
noise(sfx, MARKS.download, 0.04, { gain: 0.2, fc: 4200, q: 0.25, curve: 6 });
voice(sfx, MARKS.download + 0.02, 0.16, { freq: 880, type: "sine", a: 0.002, d: 0.05, s: 0.15, r: 0.1, gain: 0.12 });
voice(sfx, MARKS.download + 0.42, 0.7, { freq: 1174.66, type: "sine", a: 0.004, d: 0.2, s: 0.25, r: 0.5, gain: 0.12, pan: -0.15 });
voice(sfx, MARKS.download + 0.46, 0.7, { freq: 1567.98, type: "sine", a: 0.004, d: 0.2, s: 0.25, r: 0.5, gain: 0.08, pan: 0.15 });

space(sfx, { delay: 0.19, fb: 0.3, mix: 0.3 });
presence(sfx, { fc: 700, amount: 1.2, keep: 0.7 });
lowpass(sfx, 13000);
fadeEdges(sfx, 0.05, 0.4);
peakNormalize(sfx, 0.5);

/* ------------------------------------------------------------------ */
/* 3. MASTER (mix + limiteur doux + normalisation)                     */
/* ------------------------------------------------------------------ */
const mix = new Buf(DUR);
for (let i = 0; i < mix.n; i++) {
  const l = music.L[i] * 0.92 + sfx.L[i] * 0.7;
  const r = music.R[i] * 0.92 + sfx.R[i] * 0.7;
  mix.L[i] = Math.tanh(l * 1.12);
  mix.R[i] = Math.tanh(r * 1.12);
}
fadeEdges(mix, 0.35, 1.1);
peakNormalize(mix, 0.83);

// mesure de crête / RMS pour contrôle
let peak = 0;
let sum = 0;
for (let i = 0; i < mix.n; i++) {
  peak = Math.max(peak, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  sum += mix.L[i] * mix.L[i] + mix.R[i] * mix.R[i];
}
const rms = Math.sqrt(sum / (mix.n * 2));
console.log(`Piste musicale et sound design générés.`);
console.log(`  master : crête ${peak.toFixed(3)} (${(20 * Math.log10(peak)).toFixed(1)} dBFS) • RMS ${rms.toFixed(3)} (≈ ${(20 * Math.log10(rms)).toFixed(1)} dBFS)`);
writeWav(join(outDir, "music.wav"), music);
writeWav(join(outDir, "sfx.wav"), sfx);
writeWav(join(outDir, "mix.wav"), mix);
