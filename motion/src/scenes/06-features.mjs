/**
 * PLAN 6 — La suite RH en 5 blocs (19,6 s → 24,6 s)
 * Chaque ligne entre en cascade : icône, titre, bénéfice.
 */
import { C, W } from "../theme.mjs";
import {
  clamp,
  rgba,
  easeOutCubic,
  easeOutBack,
  easeOutQuint,
  setFont,
  drawTracked,
  fillRoundRect,
  mixHex,
  smoothNoise,
} from "../utils.mjs";
import {
  iconFile,
  iconBarChart,
  iconUsers,
  iconShield,
  iconClock,
  iconDownload,
  iconCheck,
} from "../primitives.mjs";
import { dustField, drawDust } from "../stage.mjs";
import { staggerWords, pulseHalo, shockwave } from "../fx.mjs";

const dust = dustField(40, 77.3);

const ROWS = [
  { icon: iconDownload, tone: C.emerald, title: "Export paie", desc: "CSV / Excel prêt pour les variables de paie" },
  { icon: iconClock, tone: C.amber, title: "Horaires & pauses", desc: "Retards, heures sup et pauses selon vos règles" },
  { icon: iconBarChart, tone: C.cyan, title: "Multi-sites", desc: "Une borne par bâtiment, chantier ou agence" },
  { icon: iconUsers, tone: C.violet, title: "Rôles & permissions", desc: "DRH, manager, kiosque, lecture seule" },
  { icon: iconShield, tone: C.emerald, title: "Audit & double authentification", desc: "Journal inaltérable, 2FA TOTP, WebAuthn" },
];

export default {
  id: "features",
  label: "Suite RH",
  dur: 5.45,
  palette: [C.teal, C.emerald],

  draw(ctx, t) {
    const cx = W / 2;

    pulseHalo(ctx, cx, 620, 760, t, { color: C.emerald, base: 0.08, amp: 0.05, speed: 1.8 });

    staggerWords(ctx, ["Bien plus", "que le pointage."], {
      x: cx,
      y: 360,
      size: 84,
      lineHeight: 1.12,
      weight: 800,
      color: C.text,
      t,
      start: 0.12,
      step: 0.14,
      dur: 0.58,
      rise: 46,
      gradientAt: 1,
    });

    drawTracked(ctx, "UNE SUITE RH COMPLÈTE, SUR VOS RÈGLES", cx, 550, 23, 3, {
      align: "center",
      weight: 600,
      mono: true,
      fill: rgba(C.textDim, easeOutCubic(clamp((t - 0.5) / 0.5))),
    });

    /* Lignes */
    ROWS.forEach((r, i) => {
      const start = 0.85 + i * 0.19;
      const p = easeOutBack(clamp((t - start) / 0.62), 1.22);
      if (p <= 0) return;
      const y = 680 + i * 176;
      const x = 96;
      const w = W - 192;
      const h = 148;
      const active = t > start + 0.35 && t < start + 1.15;

      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.45));
      ctx.translate((1 - p) * -70, (1 - p) * 18);

      // carte
      ctx.save();
      ctx.shadowColor = rgba(r.tone, active ? 0.5 : 0.22);
      ctx.shadowBlur = active ? 42 : 22;
      fillRoundRect(ctx, x, y, w, h, 30, rgba(mixHex("#08121f", r.tone, 0.05), 0.94));
      ctx.restore();
      ctx.strokeStyle = rgba(mixHex(C.stroke, r.tone, active ? 0.5 : 0.18), 1);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 30);
      ctx.stroke();

      // pastille d'icône
      const ip = easeOutQuint(clamp((t - start - 0.05) / 0.6));
      fillRoundRect(ctx, x + 26, y + 26, 96, 96, 28, rgba(r.tone, 0.13));
      ctx.strokeStyle = rgba(r.tone, 0.25);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(x + 26, y + 26, 96, 96, 28);
      ctx.stroke();
      r.icon(ctx, x + 74, y + 74, 50, { color: r.tone, progress: ip });

      // textes
      setFont(ctx, { size: 35, weight: 700 });
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.fillText(r.title, x + 152, y + 62);
      setFont(ctx, { size: 24, weight: 500 });
      ctx.fillStyle = rgba(C.textMuted, 1);
      ctx.fillText(r.desc, x + 152, y + 104);

      // coche à droite
      const cp = clamp((t - start - 0.4) / 0.4);
      if (cp > 0) {
        ctx.save();
        ctx.globalAlpha = cp;
        iconCheck(ctx, x + w - 54, y + 74, 40, { color: r.tone, progress: cp, lw: 4.6, glow: 14 });
        ctx.restore();
      }
      ctx.restore();
    });

    // double onde d'ambiance à mi-parcours
    shockwave(ctx, cx, 1200, clamp((t - 1.6) / 1.4), { color: C.emerald, rings: 2, r0: 300, r1: 720, dur: 1.2, alpha: 0.18, lw: 2 });

    drawDust(ctx, dust, t, { alpha: 0.35, speed: 0.55 });
  },
};
