/**
 * PLAN 7 — La paie, livrée (24,6 s → 27,6 s)
 * Pipeline pointages → calcul → fichier de paie, puis téléchargement du CSV.
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
  easeOutExpo,
  setFont,
  drawTracked,
  measureTracked,
  mixHex,
  fillRoundRect,
  strokeRoundRect,
  roundRectPath,
} from "../utils.mjs";
import { card, chip, dot, iconDownload, iconClock, iconFile, iconFingerprint, iconCheck } from "../primitives.mjs";
import { dustField, drawDust, burst, drawBurst } from "../stage.mjs";
import { staggerWords, dataArrow, bar, pulseHalo, shockwave, label, typeText, countUp } from "../fx.mjs";

const dust = dustField(40, 91.4);
const sparks = burst(30, 3.3);

const NODES = [
  { icon: iconFingerprint, label: "Pointages", sub: "bornes & mobile", tone: C.cyan },
  { icon: iconClock, label: "Calcul des heures", sub: "règles & pauses", tone: C.teal },
  { icon: iconDownload, label: "Fichier de paie", sub: "CSV / Excel / API", tone: C.emerald },
];

export default {
  id: "export",
  label: "Export paie",
  dur: 3.45,
  palette: [C.emerald, C.cyan],

  draw(ctx, t) {
    const cx = W / 2;

    pulseHalo(ctx, cx, 700, 720, t, { color: C.emerald, base: 0.09, amp: 0.05, speed: 2 });

    staggerWords(ctx, ["Le fichier", "de paie, prêt."], {
      x: cx,
      y: 340,
      size: 86,
      lineHeight: 1.12,
      weight: 800,
      color: C.text,
      t,
      start: 0.1,
      step: 0.13,
      dur: 0.58,
      rise: 48,
      gradientAt: 1,
    });

    drawTracked(ctx, "UN CLIC, ZÉRO RESSAISIE", cx, 540, 23, 3, {
      align: "center",
      weight: 600,
      mono: true,
      fill: rgba(C.textDim, easeOutCubic(clamp((t - 0.4) / 0.5))),
    });

    /* ---------- PIPELINE ---------- */
    const NODE_W = 268;
    const NODE_H = 190;
    const gap = 54;
    const totalW = NODE_W * 3 + gap * 2;
    const x0 = cx - totalW / 2;
    const ny = 660;

    NODES.forEach((n, i) => {
      const start = 0.5 + i * 0.3;
      const p = easeOutBack(clamp((t - start) / 0.6), 1.25);
      if (p <= 0) return;
      const x = x0 + i * (NODE_W + gap);
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.45));
      ctx.translate(0, (1 - p) * 50);

      card(ctx, x, ny, NODE_W, NODE_H, {
        r: 28,
        fill: "#08121f",
        fillAlpha: 0.94,
        stroke: rgba(mixHex(C.stroke, n.tone, 0.45), 1),
        lw: 1.6,
        shadow: n.tone,
        shadowBlur: 30,
      });
      const tile = 70;
      fillRoundRect(ctx, x + NODE_W / 2 - tile / 2, ny + 20, tile, tile, 22, rgba(n.tone, 0.14));
      ctx.strokeStyle = rgba(n.tone, 0.28);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(x + NODE_W / 2 - tile / 2, ny + 20, tile, tile, 22);
      ctx.stroke();
      n.icon(ctx, x + NODE_W / 2, ny + 20 + tile / 2, 30, { color: n.tone, progress: easeOutQuint(clamp((t - start - 0.1) / 0.6)) });
      setFont(ctx, { size: 26, weight: 700 });
      ctx.fillStyle = C.text;
      ctx.textAlign = "center";
      ctx.fillText(n.label, x + NODE_W / 2, ny + 128);
      drawTracked(ctx, n.sub, x + NODE_W / 2, ny + 160, 19, 0.3, { align: "center", weight: 500, fill: rgba(C.textMuted, 1) });
      ctx.restore();
    });

    // flèches avec paquets
    for (let i = 0; i < 2; i++) {
      const start = 1.15 + i * 0.3;
      const a = easeOutCubic(clamp((t - start) / 0.5));
      if (a <= 0) continue;
      const xA = x0 + (i + 1) * NODE_W + i * gap;
      ctx.save();
      ctx.globalAlpha = a;
      dataArrow(ctx, xA + 8, ny + NODE_H / 2, xA + gap - 8, ny + NODE_H / 2, t, { color: C.emerald, packets: 3, speed: 0.8, lw: 2.6 });
      ctx.restore();
    }

    /* ---------- DOCUMENT QUI SE TÉLÉCHARGE ---------- */
    const docP = clamp((t - 1.8) / 0.55);
    if (docP > 0) {
      const p = easeOutBack(docP, 1.15);
      const dx = cx;
      const dy = 1000;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(docP);

      card(ctx, 132, dy, 816, 300, {
        r: 34,
        fill: "#07121f",
        fillAlpha: 0.94,
        stroke: rgba(mixHex(C.stroke, C.emerald, 0.3), 1),
        lw: 1.6,
        shadow: C.emerald,
        shadowBlur: 34,
      });

      // icône fichier
      iconFile(ctx, 226, dy + 150, 108, { color: C.cyan, progress: easeOutQuint(clamp((t - 1.95) / 0.7)), rows: 4 });

      setFont(ctx, { size: 32, weight: 700, family: "JetBrains Mono", mono: true });
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      const nameP = clamp((t - 2.05) / 0.4);
      ctx.fillText("export_paie_octobre.csv".slice(0, Math.floor(nameP * 24)), 316, dy + 128);
      drawTracked(ctx, "128 salariés • 1 946 pointages • heures sup incluses", 316, dy + 168, 22, 0.4, {
        weight: 500,
        fill: rgba(C.textMuted, 1),
      });

      // jauge de préparation
      const gP = easeOutQuint(clamp((t - 2.15) / 0.55));
      bar(ctx, 316, dy + 190, 560, 10, gP, { color: C.emerald });

      // bouton télécharger
      const btnP = easeOutBack(clamp((t - 2.35) / 0.55), 1.4);
      if (btnP > 0) {
        const bw = 340;
        const bh = 78;
        const bx = dx - bw / 2;
        const by = dy + 246 - bh / 2;
        const clicked = t > 2.75;
        const press = clicked ? Math.max(0, 1 - (t - 2.75) / 0.22) : 0;
        ctx.save();
        ctx.translate(bx + bw / 2, by + bh / 2);
        ctx.scale(btnP * (1 - press * 0.06), btnP * (1 - press * 0.06));
        const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        g.addColorStop(0, C.emerald600);
        g.addColorStop(1, C.teal);
        ctx.save();
        if (!clicked) {
          ctx.shadowColor = rgba(C.emerald, 0.6);
          ctx.shadowBlur = 34;
        }
        fillRoundRect(ctx, -bw / 2, -bh / 2, bw, bh, 24, g);
        ctx.restore();
        const done = t > 2.95;
        const label = done ? "FICHIER PRÊT" : "TÉLÉCHARGER";
        const lw = measureTracked(ctx, label, 30, 1.6, 800);
        const group = 44 + 18 + lw;
        const gx = -group / 2;
        if (done) iconCheck(ctx, gx + 22, 0, 40, { color: "#04121f", progress: 1, lw: 5.4 });
        else iconDownload(ctx, gx + 22, 2, 40, { color: "#04121f", progress: 1, lw: 5 });
        drawTracked(ctx, label, gx + 44 + 18, 12, 30, 1.6, { weight: 800, fill: "#04121f" });
        ctx.restore();

        // onde de clic
        if (t > 2.75 && t < 3.3) {
          shockwave(ctx, bx + bw / 2, by + bh / 2, t - 2.75, { color: C.emerald, rings: 2, r0: 40, r1: 260, dur: 0.6, alpha: 0.6, lw: 3 });
        }
        if (t > 2.95) drawBurst(ctx, sparks, t - 2.95, bx + bw / 2, by + bh / 2, { alpha: 0.85, gravity: 620, drag: 2.6, scale: 0.9 });
      }
      ctx.restore();
    }

    /* ---------- COMPATIBILITÉS ---------- */
    const compP = clamp((t - 2.6) / 0.5);
    if (compP > 0) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(compP);
      const items = ["CSV", "Excel", "API REST", "Sage / Silae"];
      let px = cx - 400;
      items.forEach((it, i) => {
        const start = 2.6 + i * 0.1;
        const sp = easeOutBack(clamp((t - start) / 0.5), 1.3);
        if (sp <= 0) return;
        setFont(ctx, { size: 24, weight: 600 });
        const wChip = ctx.measureText(it).width + 52;
        ctx.save();
        ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.4));
        ctx.translate(px + wChip / 2, 1470 + (1 - sp) * 20);
        chip(ctx, 0, 0, it, {
          size: 24,
          h: 56,
          padX: 20,
          align: "center",
          fill: C.cyan,
          fillAlpha: 0.08,
          stroke: C.cyan,
          strokeAlpha: 0.28,
          color: rgba(C.textMuted, 1),
        });
        ctx.restore();
        px += wChip + 14;
      });
      ctx.restore();
    }

    drawDust(ctx, dust, t, { alpha: 0.35, speed: 0.6 });
  },
};
