/**
 * PLAN 1 — Ouverture / logo animé (0,0 s → 2,6 s)
 * L'empreinte se construit anneau par anneau, le nom de marque apparaît lettre à lettre.
 */
import { C, W, H, PAD } from "../theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutExpo,
  easeOutBack,
  easeOutQuint,
  drawTracked,
  setFont,
  measureTracked,
} from "../utils.mjs";
import { iconFingerprint, dot, chip, radialGlow } from "../primitives.mjs";
import { dustField, drawDust } from "../stage.mjs";
import { staggerWords, staggerChars, pulseHalo, shockwave } from "../fx.mjs";

const dust = dustField(70, 3.1);

export default {
  id: "boot",
  label: "Ouverture",
  dur: 2.6,
  palette: [C.cyan, C.teal],

  draw(ctx, t) {
    const cx = W / 2;
    const cy = 760;
    const r = 196;

    /* --- halos + ondes derrière l'empreinte --- */
    pulseHalo(ctx, cx, cy, 620, t, { color: C.cyan, base: 0.14, amp: 0.09, speed: 2.2 });
    shockwave(ctx, cx, cy, clamp((t - 0.45) / 1.5), { color: C.cyan, rings: 3, r0: 120, r1: 520, dur: 1.4, alpha: 0.5, lw: 2.5 });

    /* --- balayage du capteur --- */
    const scanP = (t * 0.62) % 1;
    const scanY = cy - r * 1.5 + scanP * r * 3.0;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createLinearGradient(cx - r * 1.7, 0, cx + r * 1.7, 0);
    sg.addColorStop(0, rgba(C.cyan, 0));
    sg.addColorStop(0.5, rgba(C.cyan, 0.55 * (0.5 + 0.5 * Math.sin(scanP * Math.PI))));
    sg.addColorStop(1, rgba(C.cyan, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(cx - r * 1.7, scanY - 2.5, r * 3.4, 5);
    const g2 = ctx.createLinearGradient(0, scanY - 90, 0, scanY + 90);
    g2.addColorStop(0, rgba(C.cyan, 0));
    g2.addColorStop(1, rgba(C.cyan, 0.12));
    ctx.fillStyle = g2;
    ctx.fillRect(cx - r * 1.7, scanY - 90, r * 3.4, 90);
    ctx.restore();

    /* --- empreinte --- */
    const reveal = easeOutCubic(norm(t, 0.12, 1.25));
    const breathe = 1 + 0.02 * Math.sin(t * 2.4);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(breathe, breathe);
    ctx.shadowColor = rgba(C.cyan, 0.55);
    ctx.shadowBlur = 32;
    iconFingerprint(ctx, 0, 0, r, { color: C.cyan, progress: reveal, lw: 6.5, glow: 12 });
    ctx.restore();

    // point de scan sur le bord de l'empreinte
    if (reveal > 0.98) {
      const a = t * 1.5;
      dot(ctx, cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 1.15, 4.2, C.emerald, { glow: 16, alpha: 0.9 });
    }

    /* --- nom de marque --- */
    const size = 80;
    const tracking = 9;
    const w1 = staggerChars(ctx, "BIOPOINTAGE", {
      x: cx,
      y: 1218,
      size,
      weight: 800,
      tracking,
      color: C.text,
      t,
      start: 0.62,
      step: 0.05,
      dur: 0.6,
      rise: 34,
    });

    // « RH » qui vient se coller au mot
    const rhP = easeOutBack(clamp((t - 1.42) / 0.6), 1.5);
    if (rhP > 0) {
      const rhX = cx + w1 / 2 + 30;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - 1.42) / 0.4));
      ctx.translate(rhX, 1218 + (1 - rhP) * 26);
      ctx.scale(lerp(0.7, 1, rhP), lerp(0.7, 1, rhP));
      const g = ctx.createLinearGradient(0, -size, size * 1.6, size * 0.2);
      g.addColorStop(0, C.cyan);
      g.addColorStop(1, C.emerald);
      setFont(ctx, { size, weight: 800 });
      ctx.fillStyle = g;
      ctx.textAlign = "left";
      ctx.shadowColor = rgba(C.cyan, 0.6);
      ctx.shadowBlur = 26;
      ctx.fillText("RH", 0, 0);
      ctx.restore();
    }

    /* --- filet dégradé --- */
    const lineP = easeOutExpo(norm(t, 1.3, 2.05));
    if (lineP > 0) {
      const lw = 520 * lineP;
      const ly = 1262;
      const g = ctx.createLinearGradient(cx - lw / 2, ly, cx + lw / 2, ly);
      g.addColorStop(0, rgba(C.cyan, 0));
      g.addColorStop(0.5, rgba(C.cyan, 0.95));
      g.addColorStop(1, rgba(C.emerald, 0));
      ctx.save();
      ctx.shadowColor = rgba(C.cyan, 0.8);
      ctx.shadowBlur = 20;
      ctx.fillStyle = g;
      ctx.fillRect(cx - lw / 2, ly, lw, 2.5);
      ctx.restore();
    }

    /* --- signature technique --- */
    const tagP = easeOutCubic(norm(t, 1.55, 2.1));
    if (tagP > 0) {
      drawTracked(ctx, "POINTAGE BIOMÉTRIQUE  •  GESTION DES HEURES  •  TEMPS RÉEL", cx, 1338, 25, 4.4, {
        align: "center",
        weight: 500,
        mono: true,
        fill: rgba(C.textMuted, tagP),
      });
    }

    /* --- puces de promesse --- */
    const chips = ["WebAuthn / FIDO2", "Moins de 3 s", "Multi-sites"];
    let cxp = cx - 340;
    chips.forEach((c, i) => {
      const start = 1.9 + i * 0.14;
      const p = easeOutBack(clamp((t - start) / 0.55), 1.4);
      if (p <= 0) return;
      const wChip = measureTracked(ctx, c, 24, 0.8, 600) + 44;
      cxp += wChip / 2;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.4));
      ctx.translate(cxp, 1462 + (1 - p) * 24);
      chip(ctx, 0, 0, c, {
        size: 24,
        h: 54,
        padX: 22,
        fill: C.cyan,
        fillAlpha: i === 1 ? 0.16 : 0.07,
        stroke: i === 1 ? C.emerald : C.cyan,
        strokeAlpha: 0.3,
        color: i === 1 ? C.emerald : rgba(C.textMuted, 1),
        align: "center",
      });
      ctx.restore();
      cxp += wChip / 2 + 18;
    });

    drawDust(ctx, dust, t, { alpha: 0.55 });
  },
};
