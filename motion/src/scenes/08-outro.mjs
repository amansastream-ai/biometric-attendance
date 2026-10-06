/**
 * PLAN 8 — Signature finale (27,6 s → 30,15 s)
 * Retour au logo, promesse, appel à l'action, fondu au noir.
 */
import { C, W, H } from "../theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutExpo,
  easeOutQuint,
  easeOutBack,
  setFont,
  drawTracked,
  measureTracked,
} from "../utils.mjs";
import { iconFingerprint, iconCheck, dot } from "../primitives.mjs";
import { dustField, drawDust } from "../stage.mjs";
import { staggerChars, pulseHalo, shockwave } from "../fx.mjs";

const dust = dustField(64, 3.1);

export default {
  id: "outro",
  label: "Signature",
  dur: 3.0,
  palette: [C.cyan, C.emerald],

  draw(ctx, t) {
    const cx = W / 2;
    const cy = 800;
    const r = 178;

    pulseHalo(ctx, cx, cy, 640, t, { color: C.emerald, base: 0.13, amp: 0.07, speed: 2.2 });
    shockwave(ctx, cx, cy, clamp((t - 0.2) / 1.6), { color: C.emerald, rings: 3, r0: 140, r1: 560, dur: 1.4, alpha: 0.5, lw: 2.6 });

    // anneau de guidage + rotation lente
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.18);
    ctx.strokeStyle = rgba(C.cyan, 0.28);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 52 + i * 26, i * 0.9, i * 0.9 + 2.1);
      ctx.stroke();
    }
    ctx.restore();

    // empreinte
    const reveal = easeOutCubic(norm(t, 0.1, 1.15));
    ctx.save();
    ctx.translate(cx, cy);
    const br = 1 + 0.018 * Math.sin(t * 2.6);
    ctx.scale(br, br);
    ctx.shadowColor = rgba(C.cyan, 0.55);
    ctx.shadowBlur = 34;
    iconFingerprint(ctx, 0, 0, r, { color: C.cyan, progress: reveal, lw: 6.5, glow: 12 });
    ctx.restore();

    // coche de validation
    const ck = clamp((t - 1.05) / 0.5);
    if (ck > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(ck);
      iconCheck(ctx, cx + r * 0.72, cy + r * 0.72, 130, { color: C.emerald, progress: easeOutBack(ck, 1.5), lw: 13, glow: 26 });
      ctx.restore();
    }

    /* Wordmark */
    const wy = 1196;
    const w1 = staggerChars(ctx, "BIOPOINTAGE", {
      x: cx - 32,
      y: wy,
      size: 76,
      weight: 800,
      tracking: 8,
      color: C.text,
      t,
      start: 0.85,
      step: 0.045,
      dur: 0.6,
      rise: 30,
    });
    const rhP = easeOutBack(clamp((t - 1.5) / 0.55), 1.5);
    if (rhP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - 1.5) / 0.4));
      ctx.translate(cx - 32 + w1 / 2 + 26, wy + (1 - rhP) * 20);
      ctx.scale(lerp(0.75, 1, rhP), lerp(0.75, 1, rhP));
      const g = ctx.createLinearGradient(0, -76, 130, 16);
      g.addColorStop(0, C.cyan);
      g.addColorStop(1, C.emerald);
      setFont(ctx, { size: 76, weight: 800 });
      ctx.fillStyle = g;
      ctx.textAlign = "left";
      ctx.shadowColor = rgba(C.emerald, 0.55);
      ctx.shadowBlur = 24;
      ctx.fillText("RH", 0, 0);
      ctx.restore();
    }

    /* Filet + tagline */
    const lineP = easeOutExpo(clamp((t - 1.45) / 0.55));
    if (lineP > 0) {
      const lw = 460 * lineP;
      const ly = 1242;
      const g = ctx.createLinearGradient(cx - lw / 2, ly, cx + lw / 2, ly);
      g.addColorStop(0, rgba(C.cyan, 0));
      g.addColorStop(0.5, rgba(C.emerald, 0.95));
      g.addColorStop(1, rgba(C.cyan, 0));
      ctx.save();
      ctx.shadowColor = rgba(C.emerald, 0.7);
      ctx.shadowBlur = 18;
      ctx.fillStyle = g;
      ctx.fillRect(cx - lw / 2, ly, lw, 2.5);
      ctx.restore();
    }

    const tagP = clamp((t - 1.6) / 0.6);
    if (tagP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(tagP);
      ctx.translate(0, (1 - easeOutQuint(tagP)) * 26);
      drawTracked(ctx, "Le pointage qui se vérifie tout seul.", cx, 1322, 33, 0.4, {
        align: "center",
        weight: 500,
        fill: rgba(C.textMuted, 1),
      });
      ctx.restore();
    }

    /* Appel à l'action */
    const ctaP = easeOutBack(clamp((t - 1.95) / 0.6), 1.35);
    if (ctaP > 0) {
      const bw = 602;
      const bh = 104;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - 1.95) / 0.45));
      ctx.translate(cx, 1470 + (1 - ctaP) * 26);
      ctx.scale(ctaP, ctaP);
      const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      g.addColorStop(0, C.cyan);
      g.addColorStop(1, C.emerald);
      ctx.save();
      ctx.shadowColor = rgba(C.emerald, 0.5);
      ctx.shadowBlur = 40;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 30);
      ctx.fill();
      ctx.restore();
      const txt = "DEMANDEZ VOTRE DÉMO";
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
      drawTracked(ctx, txt, 0, 12, 34, 3.6, { align: "center", weight: 800, fill: "#04121f" });
      // reflet qui balaie
      const swp = ((t - 2.1) * 0.9) % 1.4;
      if (swp > 0 && swp < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 30);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        const sx = -bw / 2 + swp * bw * 1.2;
        const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,0.5)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
      // point d'attention
      dot(ctx, bw / 2 - 46 + pulse * 4, 0, 6, C.bg, { alpha: 0.25 });
      ctx.restore();
    }

    /* Mentions techniques */
    const techP = clamp((t - 2.25) / 0.5);
    if (techP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(techP) * 0.9;
      drawTracked(ctx, "WEBAUTHN  •  FIDO2  •  2FA  •  AUDIT  •  MULTI-SITES", cx, 1600, 22, 4, {
        align: "center",
        weight: 600,
        mono: true,
        fill: rgba(C.textDim, 1),
      });
      ctx.restore();
    }

    drawDust(ctx, dust, t, { alpha: 0.5, speed: 0.8 });

    /* Fondu au noir final */
    const fade = clamp((t - 2.35) / 0.6);
    if (fade > 0) {
      ctx.save();
      ctx.fillStyle = rgba("#01040c", fade ** 1.2);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  },
};
