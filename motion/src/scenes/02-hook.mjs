/**
 * PLAN 2 — Accroche (2,6 s → 6,0 s)
 * « Fini les feuilles de présence. » barré en rouge, puis « Un doigt suffit. »
 */
import { C, W } from "../theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutExpo,
  easeOutBack,
  easeOutQuint,
  easeInCubic,
  setFont,
  drawTracked,
  roundRectPath,
  fillRoundRect,
  strokeRoundRect,
  smoothNoise,
  gradientText,
} from "../utils.mjs";
import { dot, chip, iconFingerprint } from "../primitives.mjs";
import { burst, drawBurst, dustField, drawDust } from "../stage.mjs";
import { staggerWords, label, shockwave } from "../fx.mjs";

const dust = dustField(60, 8.4);
const paperBits = burst(26, 12);

/* Petite feuille de présence dessinée (le "avant"). */
const drawTimesheet = (ctx, x, y, w, h, t, local) => {
  const rise = easeOutBack(clamp((local - 0.05) / 0.7), 1.25);
  const out = clamp((local - 1.28) / 0.62);
  const rot = -0.075 + smoothNoise(local * 6) * 0.012 + easeInCubic(out) * 0.42;
  const yy = y + (1 - rise) * 110 + easeInCubic(out) * 340;
  const alpha = (1 - out) * easeOutCubic(clamp(local / 0.3));
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, yy + h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);

  // ombre
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 22;
  fillRoundRect(ctx, 0, 0, w, h, 20, "#eef3fb");
  ctx.restore();

  // en-tête du document
  setFont(ctx, { size: 19, weight: 700, mono: true });
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "left";
  ctx.fillText("FEUILLE DE PRÉSENCE — OCTOBRE", 26, 44);
  ctx.fillStyle = "#0f172a";
  setFont(ctx, { size: 30, weight: 700 });
  ctx.fillText("Semaine 41", 26, 84);

  // lignes du tableau
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const p = clamp((local - 0.22 - i * 0.055) / 0.3);
    const y0 = 116 + i * 46;
    ctx.fillStyle = `rgba(148,163,184,${0.5 * p})`;
    ctx.fillRect(26, y0, w - 52, 1.6);
    ctx.fillStyle = `rgba(100,116,139,${0.55 * p})`;
    const lw = (w - 150) * (0.35 + ((i * 37) % 60) / 100) * p;
    ctx.fillRect(26, y0 + 14, lw, 7);
    // petite coche manuscrite aléatoire
    ctx.fillStyle = `rgba(16,185,129,${0.55 * p})`;
    ctx.fillRect(w - 86, y0 + 12, 46 * p, 7);
  }

  // tampon "À RESAISIR"
  const stampP = easeOutBack(clamp((local - 0.62) / 0.4), 2.2);
  if (stampP > 0) {
    ctx.save();
    ctx.globalAlpha = 0.9 * (1 - out);
    ctx.translate(w - 110, h - 60);
    ctx.rotate(-0.22 + (1 - stampP) * 0.5);
    ctx.scale(lerp(1.6, 1, stampP), lerp(1.6, 1, stampP));
    ctx.strokeStyle = "rgba(225,29,72,0.85)";
    ctx.lineWidth = 3.4;
    roundRectPath(ctx, -96, -26, 196, 52, 10);
    ctx.stroke();
    setFont(ctx, { size: 23, weight: 800, mono: true });
    ctx.fillStyle = "rgba(225,29,72,0.9)";
    ctx.textAlign = "center";
    ctx.fillText("ERREURS DE PAIE", 0, 9);
    ctx.restore();
  }
  ctx.restore();

  // éclat de particules quand la feuille s'envole
  if (out > 0.02 && out < 0.9) {
    drawBurst(ctx, paperBits, (local - 1.28) * 1.4, x + w / 2, yy + h * 0.7, { gravity: 520, drag: 3.2, scale: 1.1, alpha: 0.75 });
  }
};

export default {
  id: "hook",
  label: "Accroche",
  dur: 3.4,
  palette: [C.cyan, C.violet],

  draw(ctx, t) {
    const cx = W / 2;

    /* ---------- PHASE A : la feuille papier ---------- */
    const paperOut = clamp((t - 1.28) / 0.62);
    drawTimesheet(ctx, cx - 220, 395, 440, 480, t, t);

    /* Titre barré */
    const headP = easeOutQuint(clamp((t - 0.28) / 0.6));
    if (headP > 0 && paperOut < 0.85) {
      ctx.save();
      ctx.globalAlpha = (1 - paperOut) * easeOutCubic(clamp(t / 0.3));
      ctx.translate(0, (1 - headP) * 40 - paperOut * 60);
      staggerWords(ctx, ["Fini", "les feuilles", "de présence."], {
        x: cx,
        y: 1210,
        size: 90,
        lineHeight: 1.16,
        weight: 800,
        color: C.text,
        t,
        start: 0.3,
        step: 0.075,
        dur: 0.55,
      });

      // barré rouge qui raye la phrase
      const strikeP = easeOutExpo(clamp((t - 0.95) / 0.42));
      if (strikeP > 0) {
        const wS = 640 * strikeP;
        ctx.save();
        ctx.globalAlpha = 1 - paperOut;
        ctx.shadowColor = rgba(C.rose, 0.8);
        ctx.shadowBlur = 22;
        ctx.strokeStyle = rgba(C.rose, 0.95);
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - wS / 2, 1272 - 7);
        ctx.lineTo(cx + wS / 2, 1272 + 7);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    /* ---------- PHASE B : la révélation ---------- */
    const revP = clamp((t - 1.95) / 0.5);
    if (revP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(revP);

      // onde de fond
      const g = ctx.createRadialGradient(cx, 1010, 40, cx, 1010, 640);
      g.addColorStop(0, rgba(C.emerald, 0.14 * revP));
      g.addColorStop(0.6, rgba(C.cyan, 0.06 * revP));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 1920);

      const upP = easeOutQuint(clamp((t - 1.95) / 0.85));
      shockwave(ctx, cx, 960, clamp((t - 2.0) / 1.5), { color: C.emerald, rings: 3, r0: 90, r1: 560, dur: 1.3, alpha: 0.45, lw: 2.5 });
      // empreinte fantôme en fond de plan
      ctx.save();
      ctx.globalAlpha = 0.16 * revP;
      iconFingerprint(ctx, cx, 905, 300, { color: C.cyan, progress: 1, lw: 4 });
      ctx.restore();

      ctx.save();
      ctx.translate(0, (1 - upP) * 60);
      staggerWords(ctx, ["Un doigt", "suffit."], {
        x: cx,
        y: 900,
        size: 134,
        lineHeight: 1.1,
        weight: 800,
        color: C.text,
        t,
        start: 2.0,
        step: 0.14,
        dur: 0.62,
        rise: 70,
        scaleFrom: 0.9,
        gradientAt: 1,
      });
      ctx.restore();

      // filet lumineux sous le titre
      const uP = easeOutExpo(clamp((t - 2.5) / 0.5));
      if (uP > 0) {
        const lw = 620 * uP;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = rgba(C.emerald, 0.9);
        ctx.shadowBlur = 26;
        const lg = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
        lg.addColorStop(0, rgba(C.cyan, 0));
        lg.addColorStop(0.5, rgba(C.emerald, 1));
        lg.addColorStop(1, rgba(C.cyan, 0));
        ctx.fillStyle = lg;
        ctx.fillRect(cx - lw / 2, 1064, lw, 3);
        ctx.restore();
      }

      // les trois promesses
      const promises = ["Zéro papier", "Zéro tableur", "Zéro erreur de paie"];
      const totalW = promises.reduce((a, p) => a + (ctx.measureText(p).width + 0), 0);
      setFont(ctx, { size: 25, weight: 600 });
      let px = cx - 430;
      promises.forEach((p, i) => {
        const start = 2.55 + i * 0.15;
        const sp = easeOutBack(clamp((t - start) / 0.55), 1.4);
        if (sp <= 0) return;
        const wChip = ctx.measureText(p).width + 46;
        ctx.save();
        ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.4));
        ctx.translate(px + wChip / 2, 1168 + (1 - sp) * 26);
        chip(ctx, 0, 0, p, {
          size: 25,
          h: 58,
          padX: 23,
          align: "center",
          fill: i === 2 ? C.emerald : C.cyan,
          fillAlpha: 0.1,
          stroke: i === 2 ? C.emerald : C.cyan,
          strokeAlpha: 0.3,
          color: i === 2 ? C.emerald : C.textMuted,
        });
        ctx.restore();
        px += wChip + 20;
      });
      ctx.restore();
    }

    drawDust(ctx, dust, t, { alpha: 0.45, speed: 0.6 });
  },
};
