/**
 * Primitives graphiques : fonds, halos, grain, cartes, pastilles, icônes vectorielles.
 * Tout est dessiné à la main sur le canvas (aucun asset externe).
 */
import { createCanvas } from "@napi-rs/canvas";
import {
  C,
  W,
  H,
} from "./theme.mjs";
import {
  clamp,
  lerp,
  rgba,
  roundRectPath,
  fillRoundRect,
  strokeRoundRect,
  radialGlow,
  mixHex,
  smoothNoise,
  setFont,
} from "./utils.mjs";

/* ------------------------------------------------------------------ */
/* FONDS                                                               */
/* ------------------------------------------------------------------ */

/** Grille technique en perspective douce, avec dérive lente. */
export const drawGrid = (ctx, { t = 0, alpha = 0.5, size = 64, driftX = 0, driftY = 6, color = C.stroke } = {}) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(color, 0.55);
  const ox = (-driftX * t) % size;
  const oy = (driftY * t) % size;
  ctx.beginPath();
  for (let x = -size + ox; x <= W + size; x += size) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, H);
  }
  for (let y = -size + oy; y <= H + size; y += size) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
};

/** Nœuds lumineux sur la grille (profondeur). */
export const drawGridNodes = (ctx, { t = 0, alpha = 0.35, size = 64, count = 90 } = {}) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const seed = i * 7.3;
    const gx = (Math.sin(seed) * 0.5 + 0.5) * W;
    const gy = (Math.cos(seed * 1.7) * 0.5 + 0.5) * H;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.7 + i));
    ctx.fillStyle = rgba(i % 3 === 0 ? C.emerald : C.cyan, 0.5 * tw);
    const r = 1.4 + (i % 4) * 0.4;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawVignette = (ctx, strength = 0.85) => {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.18, W / 2, H * 0.5, H * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.6, `rgba(2,6,23,${0.35 * strength})`);
  g.addColorStop(1, `rgba(0,2,10,${0.92 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

/** Deux gros halos colorés façon "glow" Tailwind (blur-3xl). */
export const drawAmbient = (ctx, { t = 0, colorA = C.cyan, colorB = C.emerald, intensity = 1 } = {}) => {
  const cx = W / 2 + Math.sin(t * 0.31) * 90;
  const cy = H * 0.34 + Math.cos(t * 0.24) * 60;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = radialGlow(ctx, cx, cy, 760, colorA, 0.17 * intensity);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radialGlow(ctx, W * 0.78 - Math.sin(t * 0.21) * 80, H * 0.74, 720, colorB, 0.15 * intensity);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
};

let grainTile = null;
const getGrainTile = () => {
  if (grainTile) return grainTile;
  const s = 256;
  const c = createCanvas(s, s);
  const x = c.getContext("2d");
  const img = x.createImageData(s, s);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < s * s; i++) {
    const v = 120 + rnd() * 135;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 22 + rnd() * 26;
  }
  x.putImageData(img, 0, 0);
  grainTile = c;
  return grainTile;
};

/** Grain de film : donne tout de suite un rendu "vibe motion design". */
export const drawGrain = (ctx, { t = 0, alpha = 0.055 } = {}) => {
  const tile = getGrainTile();
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const ox = -Math.round(smoothNoise(t * 9.1) * 60);
  const oy = -Math.round(smoothNoise(t * 7.7 + 30) * 60);
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W + 120, H + 120);
  ctx.restore();
};

export const drawScanlines = (ctx, { alpha = 0.05, gap = 4, drift = 0 } = {}) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#9ad9ff";
  const off = ((drift * 18) % gap + gap) % gap;
  for (let y = off; y < H; y += gap) ctx.fillRect(0, y, W, 1);
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* LUMIÈRE                                                             */
/* ------------------------------------------------------------------ */

/** Bande lumineuse qui traverse une zone (sheen). */
export const drawSweep = (ctx, x, y, w, h, p, { color = "#ffffff", alpha = 0.16, width = 220, angle = 0.32 } = {}) => {
  if (p < -0.2 || p > 1.2) return;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, Math.min(28, h / 2));
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const cx = x - width + p * (w + width * 2.2);
  ctx.translate(cx, y + h / 2);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(-width, 0, width, 0);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.5, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-width, -h * 1.6, width * 2, h * 3.2);
  ctx.restore();
};

export const drawHLine = (ctx, x, y, w, hex, alpha = 1, lw = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = hex;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* CARTES / CHIPS                                                      */
/* ------------------------------------------------------------------ */

export const card = (
  ctx,
  x,
  y,
  w,
  h,
  { r = 26, fill = C.panel, fillAlpha = 0.92, stroke = C.stroke, strokeAlpha = 1, lw = 1.5, shadow, shadowBlur = 40, alpha = 1 } = {}
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (shadow) {
    ctx.shadowColor = rgba(shadow, 0.35);
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetY = 12;
  }
  fillRoundRect(ctx, x, y, w, h, r, rgba(fill, fillAlpha));
  ctx.restore();
  strokeRoundRect(ctx, x, y, w, h, r, rgba(stroke, strokeAlpha), lw);
};

export const chip = (
  ctx,
  x,
  y,
  text,
  {
    size = 26,
    padX = 20,
    h = 46,
    r = 999,
    fill = C.cyan,
    fillAlpha = 0.14,
    stroke = C.cyan,
    strokeAlpha = 0.38,
    color = C.cyan,
    weight = 600,
    mono = false,
    tracking = 0.6,
    align = "left",
    alpha = 1,
    icon = null,
  } = {}
) => {
  setFont(ctx, { size, weight, mono });
  const tw = ctx.measureText(text).width + tracking * Math.max(0, text.length - 1) + (icon ? size * 1.5 : 0);
  const w = tw + padX * 2;
  const cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  fillRoundRect(ctx, cx, y, w, h, r === 999 ? h / 2 : r, rgba(fill, fillAlpha));
  strokeRoundRect(ctx, cx, y, w, h, r === 999 ? h / 2 : r, rgba(stroke, strokeAlpha), 1.4);
  if (icon) icon(ctx, cx + padX + size * 0.45, y + h / 2, size * 0.55, { color, progress: 1 });
  setFont(ctx, { size, weight, mono });
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, cx + padX + (icon ? size * 1.5 : 0), y + h / 2 + size * 0.06);
  ctx.restore();
  return w;
};

export const bar = (ctx, x, y, w, h, p, { r = 999, color = C.emerald, track = C.stroke, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  fillRoundRect(ctx, x, y, w, h, r === 999 ? h / 2 : r, rgba(track, 0.65));
  const ww = Math.max(0, w * clamp(p));
  if (ww > 0.5) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, rgba(color, 0.55));
    g.addColorStop(1, color);
    fillRoundRect(ctx, x, y, ww, h, r === 999 ? h / 2 : r, g);
    if (p > 0.02) {
      ctx.save();
      ctx.shadowColor = rgba(color, 0.85);
      ctx.shadowBlur = 22;
      ctx.fillStyle = color;
      ctx.fillRect(x + ww - h / 2, y - h * 0.15, h * 0.5, h * 1.3);
      ctx.restore();
    }
  }
  ctx.restore();
};

export const dot = (ctx, x, y, r, color, { glow = 0, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* ICÔNES (style ligne, lisibles en petit)                             */
/* ------------------------------------------------------------------ */

const strokeStyle = (ctx, color, lw = 3) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
};

/** Empreinte digitale : anneaux elliptiques partiels, révélés par `progress`. */
export const iconFingerprint = (ctx, cx, cy, r, { color = C.cyan, progress = 1, lw = 3, alpha = 1, glow = 0 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.shadowColor = rgba(color, 0.85);
    ctx.shadowBlur = glow;
  }
  strokeStyle(ctx, color, lw);
  const rings = 6;
  const total = rings + 1;
  for (let i = 0; i < rings; i++) {
    const rp = clamp((progress * total - i) / 1);
    if (rp <= 0) continue;
    const rx = r * (0.19 + i * 0.145);
    const ry = rx * 1.24;
    const a0 = -Math.PI * 0.86 + i * 0.16;
    const a1 = Math.PI * 0.86 - i * 0.06;
    const mid = (a0 + a1) / 2;
    const span = ((a1 - a0) / 2) * clamp(rp);
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.05, rx, ry, 0, mid - span, mid + span);
    ctx.stroke();
  }
  // goutte centrale
  if (progress > 0.9) {
    const g = clamp((progress - 0.9) / 0.1);
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.05, r * 0.07, r * 0.09, 0, Math.PI * 0.15, Math.PI * 2.05 * g - Math.PI * 0.1);
    ctx.stroke();
  }
  ctx.restore();
};

export const iconCheck = (ctx, cx, cy, size, { color = C.emerald, progress = 1, lw = null, alpha = 1, glow = 0 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = glow;
  }
  strokeStyle(ctx, color, lw ?? size * 0.19);
  const s = size / 2;
  const p = clamp(progress);
  const pts = [
    [cx - s * 0.82, cy + s * 0.06],
    [cx - s * 0.2, cy + s * 0.66],
    [cx + s * 0.86, cy - s * 0.62],
  ];
  const seg1 = 0.42;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (p <= seg1) {
    const k = p / seg1;
    ctx.lineTo(lerp(pts[0][0], pts[1][0], k), lerp(pts[0][1], pts[1][1], k));
  } else {
    ctx.lineTo(pts[1][0], pts[1][1]);
    const k = (p - seg1) / (1 - seg1);
    ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k));
  }
  ctx.stroke();
  ctx.restore();
};

export const iconClock = (ctx, cx, cy, size, { color = C.cyan, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.16);
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2 * clamp(progress));
  ctx.stroke();
  if (progress > 0.9) {
    const k = clamp((progress - 0.9) / 0.1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.52 * k);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.4 * k, cy + r * 0.25 * k);
    ctx.stroke();
  }
  ctx.restore();
};

export const iconBarChart = (ctx, cx, cy, size, { color = C.cyan, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.15);
  const w = size / 2;
  const heights = [0.42, 0.72, 0.56, 0.92];
  heights.forEach((hh, i) => {
    const g = clamp(progress * 1.3 - i * 0.1);
    if (g <= 0) return;
    const x = cx - w + i * (size * 0.29);
    const h = size * hh * g;
    ctx.beginPath();
    ctx.moveTo(x, cy + w * 0.62);
    ctx.lineTo(x, cy + w * 0.62 - h);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(cx - w * 1.15, cy + w * 0.86);
  ctx.lineTo(cx + w * 1.15, cy + w * 0.86);
  ctx.stroke();
  ctx.restore();
};

export const iconShield = (ctx, cx, cy, size, { color = C.emerald, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.15);
  const s = size / 2;
  const p = clamp(progress);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.95);
  ctx.lineTo(cx + s * 0.78, cy - s * 0.55 * clamp(p * 2));
  ctx.lineTo(cx + s * 0.78, cy + s * 0.1 * clamp(p * 2));
  const k = clamp((p - 0.5) / 0.5);
  if (k > 0) {
    ctx.quadraticCurveTo(cx + s * 0.78, cy + s * 0.86 * k, cx, cy + s * 0.98 * k);
    ctx.quadraticCurveTo(cx - s * 0.78, cy + s * 0.86 * k, cx - s * 0.78, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.78, cy - s * 0.55);
  }
  ctx.lineTo(cx, cy - s * 0.95);
  ctx.stroke();
  if (progress > 0.75) {
    iconCheck(ctx, cx, cy + s * 0.08, size * 0.42, { color, progress: clamp((progress - 0.75) / 0.25), lw: size * 0.11 });
  }
  ctx.restore();
};

export const iconUsers = (ctx, cx, cy, size, { color = C.cyan, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.15);
  const s = size / 2;
  const p = clamp(progress);
  if (p > 0.05) {
    ctx.beginPath();
    ctx.arc(cx - s * 0.28, cy - s * 0.4, s * 0.34 * clamp(p * 1.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p > 0.4) {
    const k = clamp((p - 0.4) / 0.6);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.86, cy + s * 0.82);
    ctx.quadraticCurveTo(cx - s * 0.86, cy + s * 0.05, cx - s * 0.28, cy + s * 0.05 * k + s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.05, cx + s * 0.3, cy + s * 0.82);
    ctx.stroke();
  }
  if (p > 0.6) {
    const k = clamp((p - 0.6) / 0.4);
    ctx.beginPath();
    ctx.arc(cx + s * 0.62, cy - s * 0.42, s * 0.26 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.42, cy + s * 0.82);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.2, cx + s * 0.86, cy + s * 0.32 * k + s * 0.2);
    ctx.stroke();
  }
  ctx.restore();
};

export const iconDownload = (ctx, cx, cy, size, { color = C.emerald, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.15);
  const s = size / 2;
  const p = clamp(progress);
  if (p > 0.1) {
    const k = clamp((p - 0.1) / 0.6);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.82);
    ctx.lineTo(cx, cy - s * 0.82 + size * 0.9 * k);
    ctx.stroke();
    if (k > 0.6) {
      const kk = clamp((k - 0.6) / 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.42 * kk, cy + s * 0.5 - s * 0.42 * kk);
      ctx.lineTo(cx, cy + s * 0.06);
      ctx.lineTo(cx + s * 0.42 * kk, cy + s * 0.5 - s * 0.42 * kk);
      ctx.stroke();
    }
  }
  if (p > 0.7) {
    const k = clamp((p - 0.7) / 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.76, cy + s * 0.84);
    ctx.lineTo(cx - s * 0.76 + size * 0.28 * k, cy + s * 0.84);
    ctx.moveTo(cx + s * 0.76 - size * 0.28 * k, cy + s * 0.84);
    ctx.lineTo(cx + s * 0.76, cy + s * 0.84);
    ctx.stroke();
  }
  ctx.restore();
};

export const iconFile = (ctx, cx, cy, size, { color = C.cyan, progress = 1, lw = null, alpha = 1, rows = 3 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.13);
  const w = size * 0.72;
  const h = size * 0.94;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const p = clamp(progress);
  const fold = w * 0.32;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.1);
  ctx.lineTo(x, y + h * clamp(p * 1.6));
  ctx.lineTo(x + w * clamp(p * 1.6), y + h);
  ctx.lineTo(x + w, y + fold);
  ctx.lineTo(x + w - fold, y);
  ctx.lineTo(x, y);
  ctx.stroke();
  if (p > 0.55) {
    const k = clamp((p - 0.55) / 0.45);
    for (let i = 0; i < rows; i++) {
      const g = clamp(k * 1.6 - i * 0.22);
      if (g <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, y + h * (0.34 + i * 0.2));
      ctx.lineTo(x + w * 0.18 + w * 0.6 * g, y + h * (0.34 + i * 0.2));
      ctx.stroke();
    }
  }
  ctx.restore();
};

export const iconPin = (ctx, cx, cy, size, { color = C.rose, progress = 1, lw = null, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeStyle(ctx, color, lw ?? size * 0.15);
  const s = size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.42, s * 0.52, Math.PI * 0.85, Math.PI * 0.15);
  ctx.stroke();
  const k = clamp(progress);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.1);
  ctx.lineTo(cx - s * 0.42, cy + s * 0.85 * k);
  ctx.moveTo(cx + s * 0.42, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.85 * k);
  ctx.stroke();
  ctx.restore();
};

export const iconSparkle = (ctx, cx, cy, size, { color = C.amber, progress = 1, alpha = 1 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha * clamp(progress);
  ctx.fillStyle = color;
  const s = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const r1 = s * (i % 2 === 0 ? 1 : 0.34);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* AVATARS / BADGES                                                    */
/* ------------------------------------------------------------------ */

/** Petite pastille d'avatar (initiales) — évoque la liste des salariés. */
export const avatar = (ctx, cx, cy, r, initials, { color = C.cyan, alpha = 1, ring = true } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, rgba(mixHex(color, "#ffffff", 0.15), 0.9));
  g.addColorStop(1, rgba(mixHex(color, C.bg, 0.55), 0.95));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  setFont(ctx, { size: r * 0.86, weight: 700 });
  ctx.fillStyle = "#04101f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, cx, cy + r * 0.05);
  ctx.restore();
};

/** Anneau de progression (jauges, compteurs). */
export const ring = (ctx, cx, cy, r, p, { color = C.emerald, track = C.stroke, lw = 10, alpha = 1, glow = 0, start = -Math.PI / 2 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(track, 0.7);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  if (glow) {
    ctx.shadowColor = rgba(color, 0.8);
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.PI * 2 * clamp(p));
  ctx.stroke();
  ctx.restore();
};

/* Ré-exports pratiques (canvas helpers) pour les plans et la scène. */
export { roundRectPath, fillRoundRect, strokeRoundRect, radialGlow, linearGradient } from "./utils.mjs";
