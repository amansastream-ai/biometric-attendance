#!/usr/bin/env node
/**
 * Aperçu rapide : rend une ou plusieurs frames en PNG pour valider le cadrage.
 *   node src/preview.mjs 1.5 4.2 8.0          → plan actif à ces instants
 *   node src/preview.mjs --all                → 1 frame par plan (milieu de plan)
 *   node src/preview.mjs --film 0.5          → toutes les 2 s (planche contact)
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { W, H } from "./theme.mjs";
import { scenes } from "./scenes/index.mjs";
import { composeFrame, TOTAL } from "./compose.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = join(here, "..", "fonts");
for (const f of readdirSync(fontDir).filter((f) => f.endsWith(".ttf"))) {
  GlobalFonts.registerFromPath(join(fontDir, f));
}

const outDir = join(here, "..", "previews");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

const args = process.argv.slice(2);
let times = args.filter((a) => !a.startsWith("--")).map(Number);
if (args.includes("--all")) {
  let acc = 0;
  times = [];
  for (const s of scenes) {
    times.push(acc + s.dur * 0.55);
    acc += s.dur;
  }
}
if (args.includes("--film")) {
  const step = Number(args[args.indexOf("--film") + 1] || 2);
  times = [];
  for (let t = step * 0.35; t < TOTAL(scenes); t += step) times.push(t);
}
if (args.includes("--clean")) {
  for (const f of readdirSync(outDir)) rmSync(join(outDir, f));
  console.log("previews/ vidé");
  process.exit(0);
}
if (!times.length) times = [1.4];

for (const t of times) {
  composeFrame(ctx, t, scenes);
  const p = join(outDir, `frame_${t.toFixed(2).padStart(6, "0")}s.png`);
  writeFileSync(p, canvas.toBuffer("image/png"));
  console.log("écrit", p);
}
