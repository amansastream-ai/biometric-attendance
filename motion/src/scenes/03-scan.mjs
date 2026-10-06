/**
 * PLAN 3 — La borne : pointage réel (6,0 s → 12,0 s)
 * Terminal biométrique reconstruit : empreinte qui se scanne, phases techniques,
 * vérification cryptographique, salarié reconnu, pointage enregistré.
 */
import { C, W } from "../theme.mjs";
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
  drawTracked,
  measureTracked,
  mixHex,
  fillRoundRect,
  strokeRoundRect,
} from "../utils.mjs";
import { card, chip, bar, dot, avatar, iconFingerprint, iconCheck, iconShield } from "../primitives.mjs";
import { dustField, drawDust, burst, drawBurst } from "../stage.mjs";
import { typeText, shockwave, pulseHalo, countUp } from "../fx.mjs";

const dust = dustField(50, 21.7);
const sparks = burst(38, 5.5);

const PANEL = { x: 84, y: 392, w: 912, h: 980 };
const DISC = { x: W / 2, y: 800, r: 142 };
const OK_AT = 2.72;

const PHASES = [
  { t0: 0.95, txt: "Capture optique de l'empreinte…" },
  { t0: 1.62, txt: "Extraction des minuties (24 points)" },
  { t0: 2.28, txt: "Défi cryptographique → capteur FIDO2" },
];

export default {
  id: "scan",
  label: "Borne biométrique",
  dur: 6.0,
  palette: [C.emerald, C.cyan],

  draw(ctx, t) {
    const ok = t >= OK_AT;
    const accent = ok ? C.emerald : C.cyan;

    /* ---------------- PANNEAU TERMINAL ---------------- */
    const panelP = easeOutBack(clamp((t - 0.12) / 0.8), 1.15);
    ctx.save();
    ctx.globalAlpha = easeOutCubic(clamp((t - 0.05) / 0.4));
    ctx.translate(0, (1 - panelP) * 120);

    card(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, {
      r: 40,
      fill: "#08111f",
      fillAlpha: 0.88,
      stroke: mixHex(C.stroke, accent, ok ? 0.4 : 0.08),
      strokeAlpha: 0.9,
      lw: 1.6,
      shadow: accent,
      shadowBlur: ok ? 54 : 30,
    });

    /* En-tête */
    const iconSize = 62;
    const iconX = PANEL.x + 32;
    const iconY = PANEL.y + 30;
    const ig = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
    ig.addColorStop(0, C.emerald);
    ig.addColorStop(1, C.cyan600);
    fillRoundRect(ctx, iconX, iconY, iconSize, iconSize, 18, ig);
    iconFingerprint(ctx, iconX + iconSize / 2, iconY + iconSize / 2, 19, { color: "#04121f", progress: 1, lw: 2.6 });

    setFont(ctx, { size: 33, weight: 700 });
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.fillText("Terminal biométrique", iconX + iconSize + 20, iconY + 29);

    const pulse = 0.5 + 0.5 * Math.sin(t * 3.6);
    dot(ctx, iconX + iconSize + 30, iconY + 51, 5, accent, { glow: 10 + pulse * 12, alpha: 0.6 + pulse * 0.4 });
    drawTracked(ctx, ok ? "Vérification réussie" : "Capteur actif • WebAuthn", iconX + iconSize + 44, iconY + 58, 21, 0.4, {
      weight: 500,
      mono: true,
      fill: ok ? C.emerald : C.textMuted,
    });

    const secs = 2 + Math.floor(t * 1.35);
    const clock = `08:0${2}:${String(47 + secs).padStart(2, "0")}`;
    ctx.save();
    ctx.shadowColor = rgba(C.cyan, 0.45);
    ctx.shadowBlur = 16;
    drawTracked(ctx, clock, PANEL.x + PANEL.w - 32, iconY + 32, 40, 1.6, { align: "right", weight: 700, mono: true, fill: C.cyan });
    ctx.restore();
    drawTracked(ctx, "mardi 6 octobre", PANEL.x + PANEL.w - 32, iconY + 64, 21, 0.8, { align: "right", weight: 500, fill: C.textDim });

    ctx.strokeStyle = rgba(C.stroke, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(PANEL.x + 26, PANEL.y + 124);
    ctx.lineTo(PANEL.x + PANEL.w - 26, PANEL.y + 124);
    ctx.stroke();

    /* ---------------- EMPREINTE + SCAN ---------------- */
    const discP = easeOutBack(clamp((t - 0.45) / 0.85), 1.3);
    if (discP > 0) {
      const cx = DISC.x;
      const cy = DISC.y;
      const r = DISC.r * lerp(0.82, 1, discP);
      const breathe = 1 + 0.022 * Math.sin(t * 2.8);

      pulseHalo(ctx, cx, cy, r * 3.2, t, { color: accent, base: 0.13, amp: 0.07, speed: 2.4 });

      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - 0.45) / 0.5));
      ctx.translate(cx, cy);
      ctx.scale(breathe, breathe);

      // anneau de guidage
      ctx.strokeStyle = rgba(C.stroke, 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 40, 0, Math.PI * 2);
      ctx.stroke();

      const prog = ok ? 1 : easeInOutCubic(norm(t, 0.9, OK_AT)) * 0.98;
      ctx.save();
      ctx.shadowColor = rgba(accent, 0.85);
      ctx.shadowBlur = 16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, r + 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
      ctx.restore();

      // tiges du capteur
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2;
        const active = i / 44 <= prog;
        const len = 11 + (active ? 6 : 0);
        ctx.strokeStyle = rgba(active ? accent : C.stroke, active ? 0.85 : 0.45);
        ctx.lineWidth = active ? 2.6 : 1.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r + 58), Math.sin(a) * (r + 58));
        ctx.lineTo(Math.cos(a) * (r + 58 + len), Math.sin(a) * (r + 58 + len));
        ctx.stroke();
      }

      const dg = ctx.createRadialGradient(0, 0, 10, 0, 0, r);
      dg.addColorStop(0, rgba(mixHex(C.bg, accent, 0.16), 0.95));
      dg.addColorStop(1, rgba(C.bg, 0.55));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      const reveal = ok ? 1 : easeOutCubic(norm(t, 0.55, 1.5)) * 0.94 + 0.06;
      ctx.save();
      ctx.shadowColor = rgba(accent, 0.7);
      ctx.shadowBlur = ok ? 36 : 20;
      iconFingerprint(ctx, 0, 0, r * 0.78, { color: ok ? C.emerald : C.cyan, progress: reveal, lw: 6, glow: 10 });
      ctx.restore();

      if (!ok) {
        const sp = ((t - 0.75) * 0.55) % 1;
        const sy = -r + sp * r * 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
        ctx.clip();
        const sg = ctx.createLinearGradient(-r, 0, r, 0);
        sg.addColorStop(0, rgba(C.emerald, 0));
        sg.addColorStop(0.5, rgba(C.emerald, 0.8 * (0.45 + 0.55 * Math.sin(sp * Math.PI))));
        sg.addColorStop(1, rgba(C.emerald, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(-r, sy - 3, r * 2, 6);
        const g2 = ctx.createLinearGradient(0, sy - 70, 0, sy);
        g2.addColorStop(0, rgba(C.emerald, 0));
        g2.addColorStop(1, rgba(C.emerald, 0.14));
        ctx.fillStyle = g2;
        ctx.fillRect(-r, sy - 70, r * 2, 70);
        ctx.restore();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(mixHex(C.bg, C.emerald, 0.2), 0.7);
        ctx.fill();
        iconCheck(ctx, 0, 0, r * 1.1, { color: C.emerald, progress: easeOutBack(clamp((t - 2.8) / 0.5), 1.6), lw: 14, glow: 28 });
        ctx.restore();
      }
      ctx.restore();
    }

    if (ok) {
      shockwave(ctx, DISC.x, DISC.y, t - OK_AT, { color: C.emerald, rings: 3, r0: 130, r1: 470, dur: 1.0, alpha: 0.55, lw: 3 });
      drawBurst(ctx, sparks, t - OK_AT, DISC.x, DISC.y, { alpha: 0.85, gravity: 700, drag: 2.6, scale: 1.0 });
    }

    /* ---------------- JAUGE / PHASE ---------------- */
    drawTracked(ctx, ok ? "VÉRIFIÉ EN 2,4 S" : `VÉRIFICATION ${String(Math.min(99, Math.round(countUp(100, t, 0.9, 1.82, { ease: easeInOutCubic })))).padStart(3, " ")} %`, W / 2, 1006, 24, 3.4, {
      align: "center",
      weight: 600,
      mono: true,
      fill: ok ? C.emerald : rgba(C.cyan, 0.95),
    });
    bar(ctx, W / 2 - 250, 1030, 500, 9, ok ? 1 : easeOutQuint(norm(t, 0.9, OK_AT)), { color: accent });

    if (ok) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - OK_AT) / 0.5));
      drawTracked(ctx, "POINTAGE ENREGISTRÉ", W / 2, 1116, 40, 5.6, { align: "center", weight: 800, fill: C.emerald });
      ctx.restore();
    } else {
      const idx = PHASES.findIndex((p, i) => t >= p.t0 && (i === PHASES.length - 1 || t < PHASES[i + 1].t0));
      if (idx >= 0) {
        const ph = PHASES[idx];
        typeText(ctx, ph.txt, W / 2, 1116, { size: 27, color: rgba(C.textMuted, 1), t, start: ph.t0, cps: 44, align: "center", tracking: 0.8 });
      }
    }

    /* ---------------- SALARIÉ RECONNU ---------------- */
    const empP = clamp((t - 3.2) / 0.6);
    if (empP > 0) {
      const ep = easeOutBack(empP, 1.2);
      const y = 1152;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(empP);
      ctx.translate(0, (1 - ep) * 40);

      avatar(ctx, PANEL.x + 92, y + 40, 44, "AD", { color: C.emerald });
      setFont(ctx, { size: 36, weight: 700 });
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.fillText("Alexandre Dubois", PANEL.x + 158, y + 30);
      drawTracked(ctx, "DEV-001  •  R&D  •  Développeur Full-Stack", PANEL.x + 158, y + 66, 22, 0.4, {
        weight: 500,
        fill: C.textMuted,
      });

      const badgeP = clamp((t - 3.55) / 0.5);
      if (badgeP > 0) {
        ctx.save();
        ctx.globalAlpha = easeOutCubic(badgeP);
        const wB = 246;
        const bx = PANEL.x + PANEL.w - 30 - wB;
        fillRoundRect(ctx, bx, y + 8, wB, 68, 20, rgba(C.emerald, 0.12));
        strokeRoundRect(ctx, bx, y + 8, wB, 68, 20, rgba(C.emerald, 0.4), 1.4);
        iconCheck(ctx, bx + 38, y + 42, 28, { color: C.emerald, progress: 1, lw: 4.2 });
        drawTracked(ctx, "ENTRÉE 08:02", bx + 62, y + 34, 24, 0.2, { weight: 700, mono: true, fill: C.emerald });
        drawTracked(ctx, "À L'HEURE", bx + 62, y + 62, 19, 1.6, { weight: 600, mono: true, fill: C.textMuted });
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore(); // panneau

    /* ---------------- PREUVES TECHNIQUES ---------------- */
    const proofs = [
      { txt: "Signature FIDO2", tone: C.cyan },
      { txt: "Vérifié côté serveur", tone: C.emerald },
      { txt: "Aucun gabarit stocké", tone: C.emerald },
    ];
    let px = W / 2 - 408;
    proofs.forEach((p, i) => {
      const start = 3.95 + i * 0.13;
      const sp = easeOutBack(clamp((t - start) / 0.55), 1.3);
      if (sp <= 0) return;
      setFont(ctx, { size: 23, weight: 600 });
      const wChip = ctx.measureText(p.txt).width + 62;
      ctx.save();
      ctx.globalAlpha = easeOutCubic(clamp((t - start) / 0.4));
      ctx.translate(px + wChip / 2, 1430 + (1 - sp) * 26);
      chip(ctx, 0, 0, p.txt, {
        size: 23,
        h: 56,
        padX: 22,
        align: "center",
        fill: p.tone,
        fillAlpha: 0.1,
        stroke: p.tone,
        strokeAlpha: 0.3,
        color: p.tone,
        icon: iconShield,
      });
      ctx.restore();
      px += wChip + 16;
    });

    typeText(ctx, "POST /api/punch → 201 CREATED", W / 2, 1532, {
      size: 26,
      color: rgba(C.cyan, 0.85),
      t,
      start: 4.4,
      cps: 30,
      align: "center",
      tracking: 1.4,
    });

    /* ---------------- STAT FINALE ---------------- */
    const statP = clamp((t - 4.85) / 0.6);
    if (statP > 0) {
      const p = easeOutQuint(statP);
      ctx.save();
      ctx.globalAlpha = easeOutCubic(statP);
      ctx.translate(W / 2, 1656 + (1 - p) * 30);
      setFont(ctx, { size: 30, weight: 600 });
      const t1 = "Du doigt au pointage enregistré en";
      const t2 = "2,4 s";
      const w1 = measureTracked(ctx, t1, 30, 0.6, 600);
      const w2 = measureTracked(ctx, t2, 52, 0.5, 800, true);
      const totalW = w1 + 24 + w2;
      drawTracked(ctx, t1, -totalW / 2, 0, 30, 0.6, { weight: 600, fill: rgba(C.textMuted, 1) });
      ctx.save();
      ctx.shadowColor = rgba(C.emerald, 0.75);
      ctx.shadowBlur = 24;
      drawTracked(ctx, t2, -totalW / 2 + w1 + 24, 4, 52, 0.5, { weight: 800, mono: true, fill: C.emerald });
      ctx.restore();
      ctx.restore();
    }

    drawDust(ctx, dust, t, { alpha: 0.4, speed: 0.7 });
  },
};
