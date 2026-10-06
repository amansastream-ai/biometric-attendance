/**
 * Utilitaires motion design : maths, easings, couleurs, typographie.
 * Aucune dépendance : tout est déterministe pour un rendu frame-par-frame reproductible.
 */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Position relative de t dans [a,b], bornée à [0,1]. */
export const norm = (t, a, b) => clamp((t - a) / (b - a === 0 ? 1e-6 : b - a));

/** Progression locale d'une plage animée : renvoie {p, on} */
export const seg = (t, a, b) => {
  const p = norm(t, a, b);
  return { p, on: t >= a && t <= b, done: t > b };
};

export const smootherstep = (t) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const smoothstep = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeInOutExpo = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

export const easeOutBack = (t, s = 1.9) => {
  const c3 = s + 1;
  const x = clamp(t) - 1;
  return 1 + c3 * x * x * x + s * x * x;
};

export const easeOutElastic = (t) => {
  const x = clamp(t);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
};

/** Petit overshoot doux, idéal pour les entrées d'UI. */
export const easeOutSoftBack = (t, s = 1.2) => easeOutBack(t, s);

/** Impulsion (0 → 1 → 0) centrée sur [a,b]. */
export const pulse = (t, a, b, sharp = 1) => {
  const p = norm(t, a, b);
  return Math.sin(Math.PI * p) ** (1 / (sharp || 1));
};

/** Décroissance exponentielle après un instant de départ. */
export const decay = (t, start, tau) => (t < start ? 0 : Math.exp(-(t - start) / tau));

export const stagger = (i, step, delay = 0) => delay + i * step;

/** Bruit déterministe (pas de Math.random -> rendu reproductible). */
export const noise1 = (x) => {
  const s = Math.sin(x * 12.9898) * 43758.5453123;
  return s - Math.floor(s);
};
export const noise2 = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
/** Bruit lissé 1D (interpolation cubique) — parfait pour les tremblements organiques. */
export const smoothNoise = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(noise1(i), noise1(i + 1), u) * 2 - 1;
};

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */

export const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = ([r, g, b]) =>
  "#" + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("");

export const mixHex = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};

/** hex + alpha → rgba(...) */
export const rgba = (hex, a = 1) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`;
};

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

export const roundRectPath = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
};

export const fillRoundRect = (ctx, x, y, w, h, r, fill) => {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
};

export const strokeRoundRect = (ctx, x, y, w, h, r, stroke, lw = 1) => {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
};

/** Dégradé linéaire vertical/horizontal à partir de stops [pos, couleur]. */
export const linearGradient = (ctx, x0, y0, x1, y1, stops) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [p, c] of stops) g.addColorStop(clamp(p), c);
  return g;
};

export const radialGlow = (ctx, x, y, r, colorHex, alpha = 0.5, inner = 0) => {
  const g = ctx.createRadialGradient(x, y, inner, x, y, r);
  g.addColorStop(0, rgba(colorHex, alpha));
  g.addColorStop(0.45, rgba(colorHex, alpha * 0.35));
  g.addColorStop(1, rgba(colorHex, 0));
  return g;
};

/** Ombre portée douce et colorée (glow). */
export const withShadow = (ctx, color, blur, dx = 0, dy = 0, fn) => {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = dx;
  ctx.shadowOffsetY = dy;
  fn();
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/* Typographie                                                         */
/* ------------------------------------------------------------------ */

export const setFont = (ctx, { size = 48, weight = 600, family = "Poppins", mono = false } = {}) => {
  ctx.font = `${weight} ${size}px ${mono ? "JetBrains Mono" : family}`;
};

/** Texte avec interlettrage manuel (le canvas n'a pas de letter-spacing fiable). */
export const drawTracked = (ctx, text, x, y, size, tracking = 0, opts = {}) => {
  const {
    align = "left",
    weight = 700,
    mono = false,
    fill = "#e2e8f0",
    alpha = 1,
  } = opts;
  setFont(ctx, { size, weight, mono });
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + tracking;
  total -= tracking;
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  ctx.restore();
  return total;
};

export const measureTracked = (ctx, text, size, tracking = 0, weight = 700, mono = false) => {
  setFont(ctx, { size, weight, mono });
  let total = 0;
  for (const ch of [...text]) total += ctx.measureText(ch).width + tracking;
  return total - tracking;
};

/** Découpe un texte en lignes tenant dans maxWidth. */
export const wrapText = (ctx, text, maxWidth, size, weight = 600, mono = false) => {
  setFont(ctx, { size, weight, mono });
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Dégradé horizontal appliqué à un texte. */
export const gradientText = (ctx, text, x, y, size, opts = {}) => {
  const {
    align = "center",
    weight = 800,
    tracking = 0,
    stops = [[0, "#22d3ee"], [1, "#34d399"]],
    alpha = 1,
    mono = false,
  } = opts;
  setFont(ctx, { size, weight, mono });
  const w = measureTracked(ctx, text, size, tracking, weight, mono);
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const g = ctx.createLinearGradient(x0, y - size * 0.9, x0 + w, y + size * 0.2);
  for (const [p, c] of stops) g.addColorStop(clamp(p), c);
  drawTracked(ctx, text, x, y, size, tracking, { align, weight, mono, fill: g, alpha });
  return w;
};
