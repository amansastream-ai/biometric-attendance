/**
 * PLAN 5 — Tableau de bord DRH (15,0 s → 19,6 s)
 * Vue temps réel reconstruite : KPI qui comptent, répartition par département, flux du jour.
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
  easeInOutCubic,
  setFont,
  drawTracked,
  measureTracked,
  mixHex,
  fillRoundRect,
  strokeRoundRect,
  roundRectPath,
} from "../utils.mjs";
import { card, chip, dot, avatar, iconCheck, iconClock, iconUsers, iconBarChart } from "../primitives.mjs";
import { dustField, drawDust } from "../stage.mjs";
import { countUp, formatNumber, label, pulseHalo, barChart, staggerWords, statusPill } from "../fx.mjs";

const dust = dustField(38, 55.1);

const PANEL = { x: 84, y: 424, w: 912, h: 1240 };
const KPIS = [
  { icon: iconCheck, tone: C.emerald, value: 74, suffix: "", caption: "Sur site", trend: "+12 depuis 7h" },
  { icon: iconClock, tone: C.cyan, value: 6, suffix: "", caption: "En pause", trend: "3 pauses en cours" },
  { icon: iconUsers, tone: C.amber, value: 9, suffix: "", caption: "Retards du jour", trend: "seuil 08:15" },
  { icon: iconBarChart, tone: C.violet, value: 92.4, suffix: "%", decimals: 1, caption: "Taux de présence", trend: "objectif 90 %" },
];

const FEED = [
  { name: "Alexandre Dubois", ini: "AD", time: "08:02", tone: "ok", status: "À l'heure", color: C.cyan },
  { name: "Amina Diop", ini: "AD", time: "08:14", tone: "ok", status: "À l'heure", color: C.emerald },
  { name: "Julien Leroy", ini: "JL", time: "08:41", tone: "late", status: "Retard", color: C.rose },
  { name: "Camille Laurent", ini: "CL", time: "12:31", tone: "break", status: "En pause", color: C.violet },
];

export default {
  id: "dashboard",
  label: "Tableau de bord DRH",
  dur: 5.05,
  palette: [C.cyan, "#38bdf8"],

  draw(ctx, t) {
    const cx = W / 2;

    // caméra : léger push-in puis stabilisation
    const camK = 1 + 0.012 * (1 - easeOutQuint(clamp(t / 2.2)));
    ctx.save();
    ctx.translate(cx, 900);
    ctx.scale(camK, camK);
    ctx.translate(-cx, -900);

    pulseHalo(ctx, cx, 700, 820, t, { color: C.cyan, base: 0.07, amp: 0.04, speed: 1.5 });

    /* Titre de plan */
    staggerWords(ctx, ["Le pouls", "de l'entreprise."], {
      x: cx,
      y: 300,
      size: 78,
      lineHeight: 1.1,
      weight: 800,
      color: C.text,
      t,
      start: 0.1,
      step: 0.12,
      dur: 0.55,
      rise: 42,
      gradientAt: 1,
    });

    /* Panneau */
    const panelP = easeOutBack(clamp((t - 0.3) / 0.85), 1.12);
    ctx.save();
    ctx.globalAlpha = easeOutCubic(clamp((t - 0.25) / 0.45));
    ctx.translate(0, (1 - panelP) * 90);
    card(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, {
      r: 38,
      fill: "#071022",
      fillAlpha: 0.9,
      stroke: rgba(C.stroke, 1),
      lw: 1.5,
      shadow: C.cyan,
      shadowBlur: 30,
    });

    /* En-tête du panneau */
    setFont(ctx, { size: 34, weight: 700 });
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.fillText("Tableau de bord DRH", PANEL.x + 32, PANEL.y + 58);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    chip(ctx, PANEL.x + PANEL.w - 32, PANEL.y + 26, "TEMPS RÉEL", {
      size: 21,
      h: 44,
      padX: 18,
      align: "right",
      fill: C.emerald,
      fillAlpha: 0.12,
      stroke: C.emerald,
      strokeAlpha: 0.35,
      color: C.emerald,
      weight: 700,
      mono: true,
      tracking: 2,
      alpha: 0.75 + pulse * 0.25,
    });
    drawTracked(ctx, "mardi 6 octobre 2026", PANEL.x + PANEL.w - 32, PANEL.y + 92, 22, 0.4, { align: "right", weight: 500, fill: C.textDim });
    ctx.strokeStyle = rgba(C.stroke, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(PANEL.x + 28, PANEL.y + 118);
    ctx.lineTo(PANEL.x + PANEL.w - 28, PANEL.y + 118);
    ctx.stroke();

    /* KPI 2×2 */
    const kw = (PANEL.w - 64 - 24) / 2;
    const kh = 176;
    KPIS.forEach((k, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PANEL.x + 32 + col * (kw + 24);
      const y = PANEL.y + 146 + row * (kh + 22);
      const start = 0.75 + i * 0.13;
      const p = easeOutBack(clamp((t - start) / 0.65), 1.2);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.45));
      ctx.translate(0, (1 - p) * 34);

      card(ctx, x, y, kw, kh, {
        r: 26,
        fill: "#0a1526",
        fillAlpha: 0.95,
        stroke: rgba(mixHex(C.stroke, k.tone, 0.25), 1),
        lw: 1.4,
      });

      // pastille d'icône
      fillRoundRect(ctx, x + 22, y + 22, 56, 56, 18, rgba(k.tone, 0.14));
      k.icon(ctx, x + 50, y + 50, 30, { color: k.tone, progress: clamp((t - start) * 1.6) });

      // valeur
      const vp = easeOutQuint(clamp((t - start - 0.15) / 0.9));
      const val = k.value * vp;
      ctx.save();
      ctx.shadowColor = rgba(k.tone, 0.45);
      ctx.shadowBlur = 18;
      drawTracked(ctx, `${formatNumber(val, { decimals: k.decimals ?? 0, sep: "" })}${k.suffix}`, x + kw - 24, y + 74, 58, -1.4, {
        align: "right",
        weight: 700,
        mono: true,
        fill: C.text,
      });
      ctx.restore();

      drawTracked(ctx, k.caption, x + 22, y + 118, 25, 0.4, { weight: 600, fill: rgba(C.textMuted, 1) });
      drawTracked(ctx, k.trend, x + 22, y + 150, 20, 0.4, { weight: 500, mono: true, fill: rgba(k.tone, 0.85) });
      ctx.restore();
    });

    /* Répartition par département */
    const chartY = PANEL.y + 552;
    const chartP = clamp((t - 1.45) / 0.5);
    if (chartP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(chartP);
      drawTracked(ctx, "HEURES TRAVAILLÉES PAR DÉPARTEMENT", PANEL.x + 32, chartY, 21, 2.2, { weight: 700, mono: true, fill: rgba(C.textDim, 1) });
      barChart(ctx, PANEL.x + 34, chartY + 42, PANEL.w - 68, 250, [142, 96, 78, 124, 61], t, {
        start: 1.7,
        stagger: 0.1,
        labels: ["TECH", "RH", "MKT", "OPS", "FIN"],
        color: C.cyan,
        color2: C.emerald,
        valueFmt: (v) => `${v} h`,
      });
      ctx.restore();
    }

    /* Flux du jour */
    const feedY = chartY + 356;
    const feedP = clamp((t - 2.5) / 0.5);
    if (feedP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(feedP);
      drawTracked(ctx, "DERNIERS POINTAGES", PANEL.x + 32, feedY, 21, 2.2, { weight: 700, mono: true, fill: rgba(C.textDim, 1) });
      FEED.forEach((f, i) => {
        const start = 2.65 + i * 0.14;
        const p = easeOutBack(clamp((t - start) / 0.55), 1.18);
        if (p <= 0) return;
        const ry = feedY + 26 + i * 70;
        ctx.save();
        ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.4));
        ctx.translate((1 - p) * -60, 0);
        fillRoundRect(ctx, PANEL.x + 28, ry, PANEL.w - 56, 60, 16, rgba("#0a1526", 0.9));
        avatar(ctx, PANEL.x + 60, ry + 30, 20, f.ini, { color: f.color, ring: false });
        setFont(ctx, { size: 24, weight: 600 });
        ctx.fillStyle = C.text;
        ctx.textAlign = "left";
        ctx.fillText(f.name, PANEL.x + 92, ry + 38);
        drawTracked(ctx, f.time, PANEL.x + 470, ry + 38, 23, 0.4, { weight: 500, mono: true, fill: rgba(C.textMuted, 1) });
        statusPill(ctx, PANEL.x + PANEL.w - 210, ry + 12, f.status, { tone: f.tone, size: 20 });
        ctx.restore();
      });
      ctx.restore();
    }
    ctx.restore(); // panneau

    ctx.restore(); // caméra

    drawDust(ctx, dust, t, { alpha: 0.3, speed: 0.4 });
  },
};
