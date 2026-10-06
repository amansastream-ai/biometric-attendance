/**
 * Composition d'une frame : décor + plan courant + HUD + post-traitement.
 * Utilisé par le rendu complet comme par l'outil de prévisualisation.
 */
import { C, W, H } from "./theme.mjs";
import { clamp, lerp, mixHex, rgba, easeInOutCubic, norm } from "./utils.mjs";
import { backdrop, postFX, planEnvelope, cameraTransform, drawHud, drawBrandHud } from "./stage.mjs";

/** Tangage : chaque plan démarre un peu avant la fin du précédent (crossfade). */
export const OVERLAP = 0.45;

/** Calcule les bornes temporelles de chaque plan (mutation douce, appelée une fois). */
export const layout = (scenes) => {
  let t = 0;
  scenes.forEach((s, i) => {
    s.start = t;
    t += s.dur - (i < scenes.length - 1 ? OVERLAP : 0);
    s.end = s.start + s.dur;
  });
  return scenes[scenes.length - 1].end;
};

export const TOTAL = (scenes) => (scenes[0].start === undefined ? layout(scenes) : scenes[scenes.length - 1].end);

/** Localise le(s) plan(s) à l'instant gt : le plan sortant est conservé sous le suivant. */
export const locate = (scenes, gt) => {
  TOTAL(scenes);
  let idx = 0;
  for (let i = 0; i < scenes.length; i++) if (scenes[i].start <= gt) idx = i;
  const scene = scenes[idx];
  const layers = [];
  const prev = scenes[idx - 1];
  if (prev && prev.end > gt) layers.push({ scene: prev, index: idx - 1, local: clamp(gt - prev.start, 0, prev.dur) });
  layers.push({ scene, index: idx, local: clamp(gt - scene.start, 0, scene.dur) });
  return { scene, index: idx, local: layers[layers.length - 1].local, prev: prev ?? null, layers };
};

/** Palette mixée entre le plan précédent et le plan courant (transition douce des couleurs). */
const blendPalette = (prev, cur, local, dur) => {
  const k = prev ? easeInOutCubic(norm(local, 0, Math.min(0.8, dur * 0.35))) : 1;
  return [mixHex(prev ? prev.palette[0] : cur.palette[0], cur.palette[0], k), mixHex(prev ? prev.palette[1] : cur.palette[1], cur.palette[1], k)];
};

export const composeFrame = (ctx, gt, scenes, { hud = true, brand = true, title = null } = {}) => {
  const total = TOTAL(scenes);
  const { scene, index, local, prev, layers } = locate(scenes, gt);
  const env = planEnvelope(local, scene.dur, { inDur: index === 0 ? 0.85 : 0.5, outDur: OVERLAP + 0.02 });
  const palette = blendPalette(prev, scene, local, scene.dur);

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  /* Décor (avant-plan caméra : pas de zoom sur le décor pour créer de la profondeur) */
  const bgScale = 1 + 0.035 * easeInOutCubic(clamp((gt % 6) / 6));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(bgScale, bgScale);
  ctx.translate(-W / 2, -H / 2);
  backdrop(ctx, gt, { palette, energy: 0.85 + 0.3 * env.inP, gridAlpha: 0.44, flash: env.flash });
  ctx.restore();

  /* Plans (sortant sous l'entrant) avec leur propre enveloppe caméra */
  for (const L of layers) {
    if (L.index === index && L.scene !== scene) continue;
    const e = planEnvelope(L.local, L.scene.dur, { inDur: L.index === 0 ? 0.85 : 0.5, outDur: L.index === layers[layers.length - 1].index ? 0.3 : OVERLAP + 0.02 });
    ctx.save();
    ctx.globalAlpha = e.alpha;
    cameraTransform(ctx, { scale: e.scale, dy: e.dy }, () => {
      L.scene.draw(ctx, L.local, gt, { total, index: L.index, own: e });
    });
    ctx.restore();
  }

  /* Fondu : voile sombre uniquement lors d'un plan isolé (hors recouvrement) */
  if (layers.length === 1 && env.alpha < 0.999) {
    ctx.save();
    ctx.fillStyle = rgba("#01050f", (1 - env.alpha) ** 1.1);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (brand && gt > 2.2 && scene.id !== "outro") drawBrandHud(ctx, gt, { alpha: clamp((gt - 2.2) / 0.6) * 0.9 });
  if (hud && scene.id !== "outro") drawHud(ctx, gt, total, { alpha: 0.75 * clamp(gt / 1.5) });

  postFX(ctx, gt, { scanlines: 0.045, grain: 0.05 });
  ctx.restore();
};
