/**
 * PLAN 4 — Sécurité / anti-fraude (12,0 s → 15,0 s)
 * « Chaque pointage est une signature » : comparaison sans/avec + journal d'audit qui se tape.
 */
import { C, W } from "../theme.mjs";
import {
  clamp,
  norm,
  lerp,
  rgba,
  easeOutCubic,
  easeOutQuint,
  easeOutBack,
  setFont,
  drawTracked,
  measureTracked,
} from "../utils.mjs";
import { card, chip, dot, iconShield, iconPin, iconCheck } from "../primitives.mjs";
import { dustField, drawDust, burst, drawBurst } from "../stage.mjs";
import { staggerWords, typeText, label, pulseHalo } from "../fx.mjs";

const dust = dustField(44, 33.2);
const sparks = burst(24, 9.9);

const drawCompareCard = (ctx, x, y, w, h, { ok, t, start, dir }) => {
  const p = easeOutBack(clamp((t - start) / 0.7), 1.2);
  if (p <= 0) return;
  const accent = ok ? C.emerald : C.rose;
  const dx = (1 - p) * 110 * dir;
  ctx.save();
  ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.45));
  ctx.translate(dx, 0);

  card(ctx, x, y, w, h, {
    r: 30,
    fill: ok ? "#07161a" : "#150a12",
    fillAlpha: 0.9,
    stroke: rgba(accent, ok ? 0.45 : 0.35),
    strokeAlpha: 1,
    lw: 1.8,
    shadow: accent,
    shadowBlur: ok ? 44 : 26,
  });

  // en-tête
  drawTracked(ctx, ok ? "AVEC BIOPOINTAGE" : "SANS CONTRÔLE", x + 28, y + 46, 23, 2.2, {
    weight: 700,
    mono: true,
    fill: ok ? C.emerald : C.rose,
  });

  // icône principale
  const iconP = easeOutQuint(clamp((t - start - 0.15) / 0.7));
  if (ok) iconShield(ctx, x + 74, y + 128, 74, { color: C.emerald, progress: iconP, lw: 5 });
  else iconPin(ctx, x + 74, y + 128, 74, { color: C.rose, progress: iconP, lw: 5 });

  // état du réseau
  const netP = easeOutQuint(clamp((t - start - 0.35) / 0.7));
  if (netP > 0) {
    const lines = ok ? ["Signature par doigt", "Vérifié serveur", "Preuve horodatée"] : ["Badge partagé", "PIN connu de tous", "Confiance aveugle"];
    lines.forEach((l, i) => {
      const lp = clamp(netP * 1.5 - i * 0.22);
      if (lp <= 0) return;
      const ly = y + 196 + i * 40;
      ctx.save();
      ctx.globalAlpha = lp;
      dot(ctx, x + 34, ly - 8, 4, accent, { alpha: 0.85 });
      drawTracked(ctx, l, x + 52, ly, 24, 0.4, { weight: 500, fill: rgba(C.textMuted, 1) });
      ctx.restore();
    });
  }
  ctx.restore();
};

export default {
  id: "trust",
  label: "Sécurité",
  dur: 3.6,
  palette: [C.emerald, C.violet],

  draw(ctx, t) {
    const cx = W / 2;

    pulseHalo(ctx, cx, 780, 700, t, { color: C.emerald, base: 0.09, amp: 0.05, speed: 1.9 });

    label(ctx, "SÉCURITÉ • ANTI-FRAUDE", cx, 470, { size: 25, color: C.cyan, align: "center", t, start: 0.15, weight: 600 });

    staggerWords(ctx, ["Chaque", "pointage", "est une", "signature."], {
      x: cx,
      y: 590,
      size: 92,
      lineHeight: 1.14,
      weight: 800,
      color: C.text,
      t,
      start: 0.3,
      step: 0.1,
      dur: 0.6,
      rise: 54,
      scaleFrom: 0.93,
      gradientAt: 3,
    });

    const subP = easeOutCubic(clamp((t - 0.95) / 0.6));
    if (subP > 0) {
      ctx.save();
      ctx.globalAlpha = subP;
      drawTracked(ctx, "Le capteur signe, le serveur vérifie.", cx, 1030, 30, 0.6, { align: "center", weight: 500, fill: rgba(C.textMuted, 1) });
      drawTracked(ctx, "Impossible de badger pour un collègue.", cx, 1078, 30, 0.6, { align: "center", weight: 500, fill: rgba(C.textMuted, 1) });
      ctx.restore();
    }

    /* Comparaison */
    const cw = 424;
    drawCompareCard(ctx, 84, 1150, cw, 448, { ok: false, t, start: 1.35, dir: -1 });
    drawCompareCard(ctx, W - 84 - cw, 1150, cw, 448, { ok: true, t, start: 1.5, dir: 1 });

    // étincelles sur la carte verte
    if (t > 1.9 && t < 2.9) drawBurst(ctx, sparks, t - 1.9, W - 84 - cw / 2, 1260, { alpha: 0.55, gravity: 600, drag: 2.8, scale: 0.8 });

    // "VS" au centre
    const vsP = easeOutBack(clamp((t - 1.8) / 0.5), 1.6);
    if (vsP > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(vsP);
      ctx.translate(cx, 1374);
      ctx.scale(lerp(0.5, 1, vsP), lerp(0.5, 1, vsP));
      ctx.fillStyle = rgba(C.textDim, 1);
      setFont(ctx, { size: 30, weight: 800, mono: true });
      ctx.textAlign = "center";
      ctx.fillText("VS", 0, 0);
      ctx.restore();
    }

    /* Journal d'audit */
    const logP = clamp((t - 2.15) / 0.5);
    if (logP > 0) {
      const y = 1680;
      const w = 912;
      const x = 84;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(logP);
      card(ctx, x, y - 46, w, 168, { r: 24, fill: "#050e1c", fillAlpha: 0.9, stroke: rgba(C.stroke, 0.95), lw: 1.4 });
      drawTracked(ctx, "JOURNAL D'AUDIT", x + 26, y - 8, 20, 2.6, { weight: 700, mono: true, fill: rgba(C.textDim, 1) });
      const lines = [
        "08:02:47  PUNCH_OK   DEV-001   verified=webauthn",
        "08:14:03  PUNCH_OK   RH-002    verified=webauthn",
        "08:41:12  PUNCH_LATE OPS-005   verified=webauthn",
      ];
      lines.forEach((l, i) => {
        const tp = clamp((t - 2.35 - i * 0.16) * 3.2);
        if (tp <= 0) return;
        const shown = l.slice(0, Math.floor(tp * l.length));
        const isLate = l.includes("LATE");
        drawTracked(ctx, shown, x + 26, y + 30 + i * 32, 20, 0.4, {
          weight: 500,
          mono: true,
          fill: isLate ? rgba(C.amber, 0.9) : rgba(C.emerald, 0.85),
        });
      });
      ctx.restore();
    }

    drawDust(ctx, dust, t, { alpha: 0.35, speed: 0.5 });
  },
};
