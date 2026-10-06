/**
 * Blocs animés réutilisables : texte en cascade, compteurs, pastilles,
 * ondes de choc, paquets de données, cartes glissantes.
 */
import { C, W } from "./theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutExpo,
  easeOutQuint,
  easeOutBack,
  easeInOutCubic,
  setFont,
  measureTracked,
  drawTracked,
  roundRectPath,
  fillRoundRect,
  strokeRoundRect,
  mixHex,
} from "./utils.mjs";
import { dot, iconCheck } from "./primitives.mjs";

/* ------------------------------------------------------------------ */
/* TEXTE                                                               */
/* ------------------------------------------------------------------ */

/**
 * Mots en cascade : chaque mot monte, se met à l'échelle et s'allume.
 * words: string[] ; renvoie la hauteur occupée.
 */
export const staggerWords = (
  ctx,
  words,
  { x = W / 2, y = 0, size = 88, lineHeight = 1.12, weight = 800, align = "center", color = C.text, t = 0, start = 0, step = 0.12, dur = 0.62, tracking = -1, rise = 46, scaleFrom = 0.94, gradientAt = -1 } = {}
) => {
  setFont(ctx, { size, weight });
  const widths = words.map((w) => ctx.measureText(w).width + tracking * (w.length - 1));
  const maxW = Math.max(...widths);
  const total = words.length;
  for (let i = 0; i < total; i++) {
    const p = easeOutBack(clamp((t - (start + i * step)) / dur), 1.35);
    const pa = easeOutCubic(clamp((t - (start + i * step)) / (dur * 0.75)));
    if (pa <= 0) continue;
    const w = widths[i];
    const isLast = i === total - 1;
    const cx = align === "center" ? x - maxW / 2 + w / 2 : x + w / 2;
    const cy = y + i * size * lineHeight;
    ctx.save();
    ctx.translate(cx, cy + (1 - p) * rise);
    ctx.scale(lerp(scaleFrom, 1, p), lerp(scaleFrom, 1, p));
    ctx.globalAlpha = pa;
    if (gradientAt >= 0 && i >= gradientAt) {
      const g = ctx.createLinearGradient(-w / 2, -size * 0.7, w / 2, size * 0.25);
      g.addColorStop(0, C.cyan);
      g.addColorStop(1, C.emerald);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = color;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(words[i], 0, 0);
    ctx.restore();
  }
  return size * lineHeight * (total - 1) + size;
};

/** Titre lettre par lettre (kinetic typo d'ouverture). */
export const staggerChars = (ctx, text, { x = W / 2, y = 0, size = 72, weight = 700, tracking = 8, color = C.text, t = 0, start = 0, step = 0.035, dur = 0.55, alpha = 1, rise = 30, mono = false } = {}) => {
  const chars = [...text];
  const widths = chars.map((ch) => {
    setFont(ctx, { size, weight, mono });
    return ctx.measureText(ch).width;
  });
  const totalW = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = x - totalW / 2;
  for (let i = 0; i < chars.length; i++) {
    const p = easeOutQuint(clamp((t - (start + i * step)) / dur));
    if (p <= 0) {
      cx += widths[i] + tracking;
      continue;
    }
    ctx.save();
    ctx.globalAlpha = alpha * p;
    ctx.translate(cx + widths[i] / 2, y + (1 - p) * rise);
    ctx.fillStyle = color;
    setFont(ctx, { size, weight, mono });
    ctx.textAlign = "center";
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    cx += widths[i] + tracking;
  }
  return totalW;
};

/** Texte technique qui se "tape" (effet terminal). */
export const typeText = (ctx, text, x, y, { size = 28, color = C.cyan, t = 0, start = 0, cps = 26, mono = true, tracking = 0.6, weight = 500, caret = true, align = "left" } = {}) => {
  const n = Math.floor(clamp((t - start) * cps / 1, 0, text.length + 1));
  const shown = text.slice(0, Math.max(0, Math.min(text.length, n)));
  drawTracked(ctx, shown, x, y, size, tracking, { weight, mono, fill: color, align });
  if (caret && n < text.length + 6) {
    const w = measureTracked(ctx, shown, size, tracking, weight, mono);
    const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 9));
    const cx = align === "center" ? x + w / 2 + 6 : x + w + 6;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.fillRect(cx, y - size * 0.78, size * 0.5, size * 0.92);
    ctx.restore();
  }
};

/* ------------------------------------------------------------------ */
/* CHIFFRES                                                            */
/* ------------------------------------------------------------------ */

export const countUp = (v, t, start, dur, { ease = easeOutQuint } = {}) => v * ease(clamp((t - start) / dur));

export const formatNumber = (n, { decimals = 0, pad = 0, sep = "" } = {}) => {
  const s = n.toFixed(decimals);
  const [i, d] = s.split(".");
  const ip = pad ? i.padStart(pad, "0") : i;
  const spaced = sep ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : ip;
  return d ? `${spaced},${d}` : spaced;
};

/** Grand nombre en mono avec halo, pour les KPI. */
export const bigNumber = (ctx, x, y, text, { size = 120, color = C.text, align = "center", glow = 0, alpha = 1, weight = 700, tracking = -2 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.shadowColor = rgba(color, 0.65);
    ctx.shadowBlur = glow;
  }
  drawTracked(ctx, text, x, y, size, tracking, { align, weight, mono: true, fill: color });
  ctx.restore();
};

export const label = (ctx, text, x, y, { size = 27, color = C.textDim, tracking = 3.2, weight = 600, align = "left", alpha = 1, mono = true, t = 0, start = 0 } = {}) => {
  const p = easeOutCubic(clamp((t - start) / 0.45));
  if (p <= 0) return 0;
  drawTracked(ctx, text, x + (1 - p) * (align === "center" ? 0 : -16), y, size, tracking, { align, weight, mono, fill: color, alpha: alpha * p });
  return measureTracked(ctx, text, size, tracking, weight, mono);
};

/* ------------------------------------------------------------------ */
/* ONDES / LUEURS                                                      */
/* ------------------------------------------------------------------ */

/** Onde de choc circulaire (révélation, validation). */
export const shockwave = (ctx, cx, cy, t, { color = C.emerald, rings = 3, r0 = 40, r1 = 460, dur = 0.9, stagger = 0.13, lw = 3, alpha = 0.85 } = {}) => {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < rings; i++) {
    const ti = t - i * stagger;
    if (ti < 0 || ti > dur) continue;
    const p = ti / dur;
    const r = lerp(r0, r1, easeOutExpo(p));
    ctx.strokeStyle = rgba(color, alpha * (1 - p) ** 1.5);
    ctx.lineWidth = lw * (1 - p * 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

/** Halo pulsé derrière un élément focal. */
export const pulseHalo = (ctx, cx, cy, r, t, { color = C.cyan, base = 0.16, amp = 0.1, speed = 2.6, alpha = 1 } = {}) => {
  const g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
  const a = (base + amp * (0.5 + 0.5 * Math.sin(t * speed))) * alpha;
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.5, rgba(color, a * 0.32));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

/** Carte qui glisse depuis la droite (ou la gauche) avec léger overshoot. */
export const slideCard = (ctx, x, y, w, h, t, { start = 0, dur = 0.6, from = "right", dist = 90, opts = {} } = {}) => {
  const p = t < start ? 0 : easeOutBack(clamp((t - start) / dur), 1.25);
  if (p <= 0) return;
  const dx = from === "right" ? (1 - p) * dist : from === "left" ? -(1 - p) * dist : 0;
  const dy = from === "top" ? (1 - p) * dist : from === "bottom" ? -(1 - p) * dist : 0;
  ctx.save();
  ctx.globalAlpha = easeOutCubic(clamp((t - start) / (dur * 0.7)));
  ctx.translate(dx, dy);
  fillRoundRect(ctx, x, y, w, h, opts.r ?? 26, rgba(opts.fill ?? C.panel, opts.fillAlpha ?? 0.92));
  strokeRoundRect(ctx, x, y, w, h, opts.r ?? 26, rgba(opts.stroke ?? C.stroke, opts.strokeAlpha ?? 1), opts.lw ?? 1.5);
  ctx.restore();
  return p;
};

/** Flèche horizontale/verticale avec paquets de données qui circulent. */
export const dataArrow = (ctx, x0, y0, x1, y1, t, { color = C.emerald, packets = 3, lw = 2.4, alpha = 1, speed = 0.55 } = {}) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = rgba(color, 0.4);
  ctx.lineWidth = lw;
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  // tête de flèche
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(ang);
  ctx.fillStyle = rgba(color, 0.75);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-16, -9);
  ctx.lineTo(-16, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < packets; i++) {
    const p = ((t * speed + i / packets) % 1 + 1) % 1;
    const px = lerp(x0, x1, p);
    const py = lerp(y0, y1, p);
    const a = Math.sin(p * Math.PI) ** 0.7;
    dot(ctx, px, py, 5.5, color, { glow: 18, alpha: 0.9 * a });
  }
  ctx.restore();
};

/** Badge de statut arrondi avec compteur (tableau DRH). */
export const statusPill = (ctx, x, y, text, { tone = "ok", size = 24, alpha = 1 } = {}) => {
  const map = {
    ok: [C.emerald, "rgba(16,185,129,0.14)"],
    late: [C.rose, "rgba(251,113,133,0.14)"],
    break: [C.amber, "rgba(251,191,36,0.14)"],
    neutral: [C.textMuted, "rgba(148,163,184,0.12)"],
  };
  const [col, bg] = map[tone] ?? map.neutral;
  setFont(ctx, { size, weight: 600 });
  const w = ctx.measureText(text).width + 34;
  ctx.save();
  ctx.globalAlpha *= alpha;
  fillRoundRect(ctx, x, y, w, size * 1.7, size * 0.85, bg);
  ctx.fillStyle = col;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 17, y + size * 0.9);
  ctx.restore();
  return w;
};

/** Petit graphique en barres verticales animées (heures par département). */
export const barChart = (ctx, x, y, w, h, values, t, { start = 0, stagger = 0.09, labels = [], color = C.cyan, color2 = C.emerald, valueFmt = (v) => String(v), alpha = 1 } = {}) => {
  const n = values.length;
  const gap = 18;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(...values) * 1.08;
  ctx.save();
  ctx.globalAlpha *= alpha;
  // lignes de repère
  ctx.strokeStyle = rgba(C.stroke, 0.6);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const gy = y + (h / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const p = easeOutQuint(clamp((t - (start + i * stagger)) / 0.75));
    if (p <= 0) continue;
    const bh = (values[i] / max) * h * p;
    const bx = x + i * (bw + gap);
    const by = y + h - bh;
    const g = ctx.createLinearGradient(bx, by, bx, y + h);
    g.addColorStop(0, rgba(mixHex(color, "#ffffff", 0.18), 0.95));
    g.addColorStop(1, rgba(color2, 0.35));
    fillRoundRect(ctx, bx, by, bw, bh, Math.min(10, bw / 3), g);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = rgba(color, 0.5);
    ctx.shadowBlur = 16;
    ctx.fillStyle = rgba(color, 0.25);
    ctx.fillRect(bx, by, bw, 3);
    ctx.restore();
    // valeur
    if (labels.length) {
      setFont(ctx, { size: 20, weight: 600, family: "JetBrains Mono", mono: true });
      ctx.fillStyle = rgba(C.textMuted, clamp(p * 1.4));
      ctx.textAlign = "center";
      ctx.fillText(labels[i], bx + bw / 2, y + h + 28);
      if (p > 0.85) {
        ctx.fillStyle = rgba(C.text, clamp((p - 0.85) / 0.15));
        ctx.fillText(valueFmt(values[i]), bx + bw / 2, by - 10);
      }
    }
  }
  ctx.restore();
};

/* Ré-exports : certains plans importent les primitives via ../fx.mjs. */
export { bar, dot, chip, card, avatar, iconCheck, iconDownload, iconFile } from "./primitives.mjs";
