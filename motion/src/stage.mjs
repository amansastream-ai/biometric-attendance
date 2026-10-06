/**
 * Scène globale : décor persistant (grille, halos, grain), HUD discret,
 * transitions entre plans et particules déterministes.
 */
import { C, W, H } from "./theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutExpo,
  easeInOutCubic,
  mixHex,
  setFont,
  drawTracked,
  measureTracked,
  smoothNoise,
} from "./utils.mjs";
import {
  drawGrid,
  drawGridNodes,
  drawVignette,
  drawAmbient,
  drawGrain,
  drawScanlines,
  radialGlow,
  fillRoundRect,
  strokeRoundRect,
  dot,
} from "./primitives.mjs";

/* ------------------------------------------------------------------ */
/* PARTICULES DÉTERMINISTES                                            */
/* ------------------------------------------------------------------ */

const rnd = (seed) => {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

/** Particules "poussière lumineuse" : position analytique, donc rejouable à l'identique. */
export const dustField = (count, seed = 1) =>
  Array.from({ length: count }, (_, i) => ({
    x: rnd(seed + i) * W,
    y: rnd(seed + i * 3.3) * H,
    r: 1 + rnd(seed + i * 5.1) * 2.6,
    vx: (rnd(seed + i * 7.7) - 0.5) * 14,
    vy: -6 - rnd(seed + i * 9.2) * 22,
    tw: rnd(seed + i * 11.3) * Math.PI * 2,
    hue: rnd(seed + i * 13.9) > 0.55 ? "emerald" : "cyan",
  }));

export const drawDust = (ctx, parts, t, { alpha = 0.5, speed = 1 } = {}) => {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    const x = p.x + p.vx * t * speed * 4;
    const y = p.y + p.vy * t * speed * 4;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.tw));
    const col = p.hue === "emerald" ? C.emerald : C.cyan;
    ctx.fillStyle = rgba(col, alpha * tw * 0.8);
    ctx.beginPath();
    ctx.arc(((x % W) + W) % W, ((y % H) + H) % H, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/** Gerbe de particules (succès, validation) — explosion balistique analytique. */
export const burst = (count, seed = 7) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + rnd(seed + i) * 0.5;
    const sp = 260 + rnd(seed + i * 2.7) * 900;
    return { a, sp, r: 2 + rnd(seed + i * 4.3) * 5, life: 0.7 + rnd(seed + i * 6.1) * 0.9, hue: i % 3 === 0 ? "emerald" : "cyan" };
  });

export const drawBurst = (ctx, parts, t, cx, cy, { alpha = 1, gravity = 900, drag = 2.4, scale = 1 } = {}) => {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    const tl = clamp(t / p.life);
    if (tl >= 1) continue;
    const k = (1 - Math.exp(-drag * t)) / drag;
    const x = cx + Math.cos(p.a) * p.sp * k * scale;
    const y = cy + Math.sin(p.a) * p.sp * k * scale + 0.5 * gravity * t * t * scale;
    const a = (1 - tl) ** 1.6;
    const col = p.hue === "emerald" ? C.emerald : C.cyan;
    ctx.fillStyle = rgba(col, 0.9 * a * alpha);
    ctx.beginPath();
    ctx.arc(x, y, p.r * scale * (1 - tl * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* DÉCOR                                                               */
/* ------------------------------------------------------------------ */

/** Fond commun à tous les plans : profond, lumineux, jamais plat. */
export const backdrop = (ctx, t, { palette = [C.cyan, C.emerald], energy = 1, gridAlpha = 0.5, flash = 0 } = {}) => {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, C.bg);
  g.addColorStop(0.55, "#03091a");
  g.addColorStop(1, "#01040f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawAmbient(ctx, { t, colorA: palette[0], colorB: palette[1], intensity: energy });
  drawGrid(ctx, { t, alpha: gridAlpha, size: 72, driftX: 3.2, driftY: 5 });
  drawGridNodes(ctx, { t, alpha: 0.3 * energy, count: 70 });

  // voile diagonal lumineux très doux
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const band = ctx.createLinearGradient(W, 0, 0, H * 0.9);
  band.addColorStop(0, rgba(palette[0], 0.05));
  band.addColorStop(0.5, "rgba(0,0,0,0)");
  band.addColorStop(1, rgba(palette[1], 0.045));
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  drawVignette(ctx, 0.9);

  if (flash > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("#dffcff", 0.5 * flash);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
};

/** Couche "post" finale : scanlines + grain + léger bloom. */
export const postFX = (ctx, t, { scanlines = 0.05, grain = 0.055 } = {}) => {
  drawScanlines(ctx, { alpha: scanlines, gap: 4, drift: t });
  drawGrain(ctx, { t, alpha: grain });
};

/* ------------------------------------------------------------------ */
/* TRANSITIONS / CAMÉRA                                                */
/* ------------------------------------------------------------------ */

/** Enveloppe de plan : entrée (montée + zoom), sortie (fondu + léger push). */
export const planEnvelope = (t, dur, { inDur = 0.5, outDur = 0.42 } = {}) => {
  const inP = norm(t, 0, inDur);
  const outP = norm(t, dur - outDur, dur);
  const alpha = easeOutCubic(inP) * (1 - easeInOutCubic(outP));
  const scale = lerp(1.045, 1, easeOutExpo(inP)) * lerp(1, 1.04, easeInOutCubic(outP));
  const dy = lerp(26, 0, easeOutExpo(inP)) + lerp(0, -22, easeInOutCubic(outP));
  const flash = Math.max(0, 1 - inP * 5.5) ** 2 * 0.5;
  return { alpha, scale, dy, inP, outP, flash };
};

/** Applique zoom/translation autour du centre de l'écran. */
export const cameraTransform = (ctx, { scale = 1, dy = 0, dx = 0, rot = 0 }, draw) => {
  ctx.save();
  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);
  draw();
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

const CHAPTERS = [
  { label: "Pointage", start: 0 },
  { label: "Sécurité", start: 12.0 },
  { label: "DRH", start: 15.0 },
  { label: "Export", start: 24.5 },
];

/** Barre de progression fine + repères de chapitres (repère temporel subtil). */
export const drawHud = (ctx, gt, total, { alpha = 1 } = {}) => {
  const y = H - 46;
  const x = 96;
  const w = W - 192;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(C.stroke, 0.85);
  fillRoundRect(ctx, x, y, w, 3, 2, rgba(C.stroke, 0.9));
  const p = clamp(gt / total);
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, rgba(C.cyan, 0.9));
  g.addColorStop(1, rgba(C.emerald, 0.95));
  ctx.save();
  ctx.shadowColor = rgba(C.cyan, 0.7);
  ctx.shadowBlur = 12;
  fillRoundRect(ctx, x, y, w * p, 3, 2, g);
  ctx.restore();
  // tête lumineuse
  dot(ctx, x + w * p, y + 1.5, 4.5, C.cyan, { glow: 14 });
  for (const ch of CHAPTERS) {
    const cx = x + w * clamp(ch.start / total);
    dot(ctx, cx, y + 1.5, 2.6, ch.start / total <= p ? rgba(C.emerald, 0.95) : rgba(C.stroke, 1));
  }
  ctx.restore();
};

/** Bandeau marque discret en haut du cadre. */
export const drawBrandHud = (ctx, t, { alpha = 1, label = "BioPointage RH", tag = "MODE DÉMO" } = {}) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  const x = 96;
  const y = 92;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
  dot(ctx, x + 6, y + 8, 5, C.emerald, { glow: 12 + pulse * 10, alpha: 0.75 + pulse * 0.25 });
  drawTracked(ctx, label, x + 24, y + 15, 25, 1.4, { weight: 600, fill: rgba(C.textMuted, 1) });
  const wl = measureTracked(ctx, label, 25, 1.4, 600);
  drawTracked(ctx, tag, x + 24 + wl + 20, y + 15, 20, 2.6, { weight: 500, mono: true, fill: rgba(C.cyan, 0.8) });
  ctx.restore();
};
