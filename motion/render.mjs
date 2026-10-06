#!/usr/bin/env node
/**
 * Rendu du teaser : frames dessinées sur canvas → tuyau brut → x264, en parallèle,
 * puis mixage audio (musique + sound design) et export MP4 (vertical + version web).
 *
 *   node render.mjs              → rendu complet
 *   node render.mjs --web        → + version 720×1280 allégée
 *   node render.mjs --keep       → conserve les segments intermédiaires
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, statSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import { W, H, FPS } from "./src/theme.mjs";
import { scenes } from "./src/scenes/index.mjs";
import { composeFrame, TOTAL, layout } from "./src/compose.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = join(here, "bin", "ffmpeg");
const BUILD = join(here, "build");
const FRAG = join(BUILD, "fragments");
const OUT = join(here, "export");
const MASTER = join(BUILD, "audio", "mix.wav");

const args = process.argv.slice(2);
const WANT_WEB = args.includes("--web");
const KEEP = args.includes("--keep");

for (const d of [BUILD, FRAG, OUT]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
for (const f of readdirSync(join(here, "fonts")).filter((f) => f.endsWith(".ttf"))) {
  GlobalFonts.registerFromPath(join(here, "fonts", f));
}

const DURATION = TOTAL(scenes);
const FRAMES = Math.round(DURATION * FPS);
const WORKERS = Math.max(1, Math.min(4, cpus().length));

console.log(`\n▸ TEASER BIOPOINTAGE RH — 1080×1920 • ${FPS} i/s • ${DURATION.toFixed(2)} s • ${FRAMES} frames`);
console.log(`▸ ${scenes.length} plans, ${WORKERS} processus de rendu\n`);
console.log(
  scenes.map((s) => `   ${s.start.toFixed(2).padStart(6)} → ${s.end.toFixed(2).padStart(6)}  ${s.label}`).join("\n") + "\n"
);

const run = (cmd, cmdArgs, { pipe = false } = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: [pipe ? "pipe" : "inherit", pipe ? "pipe" : "inherit", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 8000) err = err.slice(-4000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ stderr: err }) : reject(new Error(`${cmd} a échoué (${code})\n${err}`))));
  });

/** Rend une plage de frames dans un segment mp4 (une frame brute RGBA par écriture). */
const renderSegment = async (from, to, index) => {
  const segPath = join(FRAG, `seg_${String(index).padStart(2, "0")}.mp4`);
  const ff = spawn(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${W}x${H}`,
      "-r", String(FPS),
      "-i", "pipe:0",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-g", String(FPS * 2),
      "-keyint_min", String(FPS * 2),
      "-sc_threshold", "0",
      "-y", segPath,
    ],
    { stdio: ["pipe", "inherit", "pipe"] }
  );
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const done = new Promise((res, rej) => {
    ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`x264 segment ${index} a échoué (${code})\n${ffErr}`))));
    ff.on("error", rej);
  });

  for (let f = from; f < to; f++) {
    const t = (f + 0.5) / FPS;
    composeFrame(ctx, Math.min(t, DURATION - 0.0001), scenes);
    const buf = canvas.data();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  return to - from;
};

const t0 = Date.now();
const REUSE = args.includes("--reuse-video");
const videoOnly = join(BUILD, "video-only.mp4");
if (!(REUSE && existsSync(videoOnly))) {
const per = Math.ceil(FRAMES / WORKERS);
const jobs = [];
for (let i = 0; i < WORKERS; i++) {
  const from = i * per;
  const to = Math.min(FRAMES, from + per);
  if (from >= to) continue;
  jobs.push(
    renderSegment(from, to, i).then((n) => {
      console.log(`   • segment ${i + 1} terminé (${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s écoulées)`);
      return n;
    })
  );
}
const counts = await Promise.all(jobs);
const totalFrames = counts.reduce((a, b) => a + b, 0);
console.log(`\n▸ Images rendues : ${totalFrames} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/* ---------- assemblage vidéo ---------- */
const listPath = join(FRAG, "concat.txt");
const segs = readdirSync(FRAG).filter((f) => f.startsWith("seg_")).sort();
writeFileSync(listPath, segs.map((s) => `file '${join(FRAG, s)}'`).join("\n"));
console.log("▸ Assemblage des segments…");
await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", videoOnly]);
} else {
  console.log("▸ Réutilisation du montage vidéo déjà rendu (--reuse-video) : " + videoOnly);
}

/* ---------- audio ---------- */
console.log("▸ Génération de la bande son…");
if (!existsSync(MASTER) || args.includes("--audio")) {
  await run(process.execPath, [join(here, "src", "audio.mjs")]);
}

/* ---------- export final ---------- */
const outMain = join(OUT, "biopointage-rh-teaser-9x16.mp4");
console.log("▸ Mixage audio + encapsulage MP4…");
await run(FFMPEG, [
  "-hide_banner", "-loglevel", "error",
  "-i", videoOnly,
  "-i", MASTER,
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy",
  "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
  "-movflags", "+faststart",
  "-shortest",
  "-y", outMain,
]);

if (WANT_WEB) {
  const outWeb = join(OUT, "biopointage-rh-teaser-9x16-web.mp4");
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error",
    "-i", outMain,
    "-vf", "scale=720:1280",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", outWeb,
  ]);
  console.log(`   ${outWeb} — ${(statSync(outWeb).size / 1e6).toFixed(2)} Mo`);
}

if (!KEEP) rmSync(FRAG, { recursive: true, force: true });

const size = statSync(outMain).size / 1e6;
console.log(`\n✅ Export terminé : ${outMain}`);
console.log(`   ${(DURATION).toFixed(2)} s • 1080×1920 • ${FPS} i/s • H.264 + AAC • ${size.toFixed(2)} Mo`);
console.log(`   Durée totale du rendu : ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min\n`);
