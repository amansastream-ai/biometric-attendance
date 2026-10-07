#!/usr/bin/env python3
"""
render.py — Teaser motion design 9:16 « BUREAU ROSE » (LAMEX INSTITUT)

Sortie : MP4 H.264 1080x1920 @30 fps, AAC, prêt pour TikTok / Reels / Shorts.

  python3 render.py                                   # rendu final avec assets/portrait.jpg
  python3 render.py --photo assets/portrait.jpg --out out/bureau-rose-teaser.mp4
  python3 render.py --scale 0.5 --no-audio            # test rapide
  python3 render.py --only 4.5 6.0                    # ne rend qu'un extrait (tests)

Le portrait est utilisé en photo FIXE (cadre éditorial) : le visage n'est jamais
déformé ni animé, seuls le cadre, la lumière et la typographie bougent.
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import audio as A
import motion as M

ROOT = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------- #
# Contenus (à personnaliser ici)
# --------------------------------------------------------------------------- #
KICKER     = "LAMEX INSTITUT PRÉSENTE"
TITLE      = "BUREAU ROSE"
SUBTITLE1  = "MINI-SÉRIE DE SENSIBILISATION"
SUBTITLE2  = "CANCER DU SEIN & DU COL DE L'UTÉRUS"

NAME       = "Mme FALL"
ROLE       = "DIRECTRICE — LAMEX INSTITUT"
CHIPS      = ["PARLER", "SENSIBILISER", "ACCOMPAGNER"]

MSG_L1     = "Le dépistage précoce"
MSG_L2     = "sauve des vies."
MSG_SUB    = "PARLONS-EN. DANS L'ENTREPRISE, EN FAMILLE, PARTOUT."

EPISODE    = "ÉPISODE 1"
DAYNAME    = "SAMEDI"
DATE       = "10 OCTOBRE 2026"
CTA        = "ABONNE-TOI POUR NE RIEN MANQUER"
FOOTER     = "LAMEX INSTITUT   •   MINI-SÉRIE BUREAU ROSE"
HASHTAGS   = "#BureauRose   •   #DépistagePrécoce   •   #OctobreRose"

# --------------------------------------------------------------------------- #
# Temps (30 fps, 21 s)
# --------------------------------------------------------------------------- #
FPS = 30
DUR = 21.0
T = dict(title=0.70, portrait=3.85, message=10.50, endcard=16.35, date=18.10)


def now() -> str:
    return time.strftime("%H:%M:%S")


# --------------------------------------------------------------------------- #
def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        p = shutil.which("ffmpeg")
        if not p:
            raise SystemExit("ffmpeg introuvable (pip install imageio-ffmpeg)")
        return p


def best_photo(explicit: str | None) -> str:
    """Photo à utiliser : argument explicite, sinon carte préparée, sinon photo, sinon placeholder."""
    if explicit:
        return explicit
    for cand in ("assets/portrait_card.png", "assets/portrait.jpg", "assets/portrait.png"):
        p = os.path.join(ROOT, cand)
        if os.path.exists(p):
            return p
    return os.path.join(ROOT, "assets", "placeholder_portrait.png")


def load_photo(path: str, w: int, h: int, anchor_y: float = 0.34) -> np.ndarray:
    """Photo -> cover-crop (w,h) en float32 0..1. Aucune déformation du visage."""
    if not os.path.exists(path):
        print(f"  ! photo absente ({path}) → portrait de substitution")
        path = os.path.join(ROOT, "assets", "placeholder_portrait.png")
    img = Image.open(path).convert("RGB")
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = int(math.ceil(iw * scale)), int(math.ceil(ih * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = int((nh - h) * anchor_y)
    top = max(0, min(nh - h, top))
    img = img.crop((left, top, left + w, top + h))
    return np.asarray(img, np.float32) / 255.0


# --------------------------------------------------------------------------- #
# Sprites utilitaires
# --------------------------------------------------------------------------- #
def sprite_rotated(sprite, angle: float, cache: dict, key: str):
    """Rotation (degrés) d'un sprite RGBA numpy, mise en cache par pas de 0.5°."""
    q = round(angle * 2) / 2
    if abs(q) < 0.25:
        return sprite
    k = (key, q)
    if k in cache:
        return cache[k]
    rgb_arr, alpha = sprite
    rgba = np.concatenate([rgb_arr, alpha[..., None]], axis=2)
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
    img = img.rotate(q, resample=Image.BICUBIC, center=(img.width / 2, img.height / 2))
    out = M.np_from_pil(img)
    if len(cache) < 160:
        cache[k] = out
    return out


def sweep_sprite(w: int, h: int, span: int, mask_alpha: np.ndarray,
                 angle_deg: float = 22.0, band: float = 0.075, soft: float = 0.055,
                 strength: float = 0.5, height_full: int | None = None):
    """Bande lumineuse diagonale, découpée par le masque de la carte (colonnes w..2w)."""
    W3 = w + 2 * span
    HH = height_full or h
    yy, xx = np.mgrid[0:HH, 0:W3].astype(np.float32)
    u = (xx + (yy - HH * 0.5) * math.tan(math.radians(angle_deg))) / W3
    band_a = np.exp(-((u - 0.25) ** 2) / (2 * band ** 2)) - np.exp(
        -((u - 0.25) ** 2) / (2 * (band + soft) ** 2))
    a = np.clip(band_a, 0, 1) * strength
    m = np.zeros((HH, W3), np.float32)
    y0 = int((HH - h) / 2)
    m[y0:y0 + h, span:span + w] = mask_alpha
    a = a * m
    rgb_arr = np.ones((HH, W3, 3), np.float32)
    return rgb_arr, a.astype(np.float32)


def slice_pad(arr: np.ndarray, y: int, x: int, h: int, w: int) -> np.ndarray:
    """Découpe (h,w) dans arr en tolérant les débordements (bord recopié)."""
    ay0, ax0 = max(0, y), max(0, x)
    ay1, ax1 = min(arr.shape[0], y + h), min(arr.shape[1], x + w)
    if ay1 <= ay0 or ax1 <= ax0:
        return np.zeros((h, w) + arr.shape[2:], arr.dtype)
    sub = arr[ay0:ay1, ax0:ax1]
    if sub.shape[0] == h and sub.shape[1] == w:
        return sub
    out = np.zeros((h, w) + arr.shape[2:], arr.dtype)
    oy, ox = ay0 - y, ax0 - x
    out[oy:oy + sub.shape[0], ox:ox + sub.shape[1]] = sub
    return out


def title_letters(text: str, fnt, tracking: float, top_c, bot_c, pad: int = 20):
    """Titre avec dégradé continu : masque global + sprite (mask, rgb) par lettre.

    Le dégradé est calculé sur la hauteur du bloc, donc identique d'une lettre à
    l'autre (effet typographique continu).
    """
    widths = [fnt.getlength(c) for c in text]
    asc, desc = fnt.getmetrics()
    lh = asc + desc
    total = sum(widths) + tracking * (len(text) - 1)
    canvas = Image.new("L", (int(total) + 2 * pad, lh + 2 * pad), 0)
    d = ImageDraw.Draw(canvas)
    pen = float(pad)
    for c, w in zip(text, widths):
        d.text((pen, pad), c, font=fnt, fill=255)
        pen += w + tracking
    full = np.asarray(canvas, np.float32) / 255.0
    ys, xs = np.where(full > 0.02)
    ox, oy = int(xs.min()), int(ys.min())
    block = full[oy:ys.max() + 1, ox:xs.max() + 1]
    bh, bw = block.shape
    c_top = M.rgb(top_c) if isinstance(top_c, str) else np.asarray(top_c, np.float32)
    c_bot = M.rgb(bot_c) if isinstance(bot_c, str) else np.asarray(bot_c, np.float32)

    sprites = []
    pen = float(pad)
    for c, w in zip(text, widths):
        if c.strip():
            cw = int(math.ceil(w)) + 2 * pad
            img = Image.new("L", (cw, lh + 2 * pad), 0)
            ImageDraw.Draw(img).text((pad, pad), c, font=fnt, fill=255)
            m = np.asarray(img, np.float32) / 255.0
            yy, xx = np.where(m > 0.02)
            x0, y0 = int(xx.min()), int(yy.min())
            mm = m[y0:yy.max() + 1, x0:xx.max() + 1]
            bx = int(round(pen - ox)) + (x0 - pad)
            by = (y0 - pad) - oy
            f0 = min(1.0, max(0.0, by / bh))
            f1 = min(1.0, max(0.0, (by + mm.shape[0]) / bh))
            col_top = c_top * (1 - f0) + c_bot * f0
            col_bot = c_top * (1 - f1) + c_bot * f1
            rgb_sub, _ = M.grad_sprite(mm, col_top, col_bot)
            sprites.append({"c": c, "mask": mm, "rgb": rgb_sub, "x": bx, "y": by})
        pen += w + tracking
    return {"mask": block, "w": bw, "h": bh, "letters": sprites}



def path_ribbon(size: int, color, progress: float, width: float = 9.0, glow_r: float = 0.0):
    return M.ribbon_sprite(size, color, width, progress)


def radial_dot(size: int, color, hardness: float = 2.0):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    a = np.clip(1 - d, 0, 1) ** hardness
    c = M.rgb(color) if isinstance(color, str) else np.asarray(color, np.float32)
    return np.broadcast_to(c.reshape(1, 1, 3), (size, size, 3)).copy(), a.astype(np.float32)


def pill(text, size, tracking=4.0, color=M.IVORY, border=(0.78, 0.50, 0.63)):
    f = M.sans(600, size)
    return M.pill_sprite(text, f, pad_x=size * 1.8, pad_y=size * 0.82, border=border,
                         text_color=color, letterspacing=tracking)


def line_sprite(w: int, thickness: float, color, horizontal=True):
    if horizontal:
        m = np.ones((max(2, int(thickness)), int(w)), np.float32)
    else:
        m = np.ones((int(w), max(2, int(thickness))), np.float32)
    return M.colorize(m, color)


def gradient_rule(w: int, thickness: float, top="#FFE3EE", bot="#C9517F"):
    m = np.ones((max(2, int(thickness)), int(w)), np.float32)
    m *= np.hanning(int(w)).astype(np.float32)[None, :] ** 0.35
    return M.colorize(m, ("grad", top, bot))


# --------------------------------------------------------------------------- #
class Renderer:
    def __init__(self, photo_path: str, W: int, H: int):
        self.sc = H / 1920.0
        self.W, self.H = W, H
        self.cache: dict = {}
        self.build(photo_path)

    # --- helpers de mise à l'échelle ---------------------------------------- #
    def X(self, v): return v * self.sc
    def Y(self, v): return v * self.sc
    def P(self, v): return max(1, int(round(v * self.sc)))

    def path(self, p):  # (x, y) design -> écran
        return (self.X(p[0]), self.Y(p[1]))

    # ---------------------------------------------------------------------- #
    def build(self, photo_path: str):
        W, H, sc = self.W, self.H, self.sc
        self.bg = M.base_background(W, H)
        self.vignette = M.vignette(W, H, 0.52)
        self.grain = M.grain_tiles(6, W, H)
        self.bokeh = M.bokeh_set(11)

        # ---- carte portrait ------------------------------------------------- #
        cw, chh = self.P(780), self.P(910)
        self.card_w, self.card_h = cw, chh
        photo = load_photo(photo_path, cw, chh)
        radius = self.P(44)
        base_mask = M.rounded_mask(cw, chh, radius, 0.5)
        self.card_rgb = photo.copy()
        self.card_a = base_mask

        inner = M.rounded_ring(cw, chh, radius, self.P(2.0), 0.4)
        self.card_ring_rgb, self.card_ring_a = M.colorize(inner * 0.9, "#FFE8F1")

        outer = M.rounded_ring(cw + self.P(38), chh + self.P(38),
                               radius + self.P(19), self.P(2.0), 0.5)
        self.frame_rgb, self.frame_a = M.colorize(outer * 0.75, "#E7A9C4")

        sh = M.soft_shadow(cw, chh, radius, blur=self.P(46), spread=self.P(24),
                           strength=0.60)
        self.shadow_rgb, self.shadow_a = M.colorize(sh, "#000000")
        self.shadow_pad = self.P(24)

        # version floutée + assombrie (scène 3)
        small = Image.fromarray((np.clip(photo, 0, 1) * 255).astype(np.uint8))
        small = small.filter(ImageFilter.GaussianBlur(self.P(16)))
        dim = np.asarray(small, np.float32) / 255.0 * 0.62 + 0.05
        self.card_soft_rgb = np.clip(dim, 0, 1)

        # balayage lumineux de la carte
        self.sweep = sweep_sprite(cw, chh, cw,
                                  M.rounded_mask(cw, chh, radius, 1.0),
                                  angle_deg=20, band=0.055, soft=0.05, strength=0.42)
        self.sweep_span = cw

        # coins "éditoriaux" autour du cadre
        self.corners = []
        L = self.P(74)
        th = self.P(4)
        for cx_, cy_, sx_, sy_ in ((-1, -1, 1, 1), (1, -1, -1, 1),
                                   (-1, 1, 1, -1), (1, 1, -1, -1)):
            m = np.zeros((L, L), np.float32)
            m[:th, :] = 1.0
            m[:, :th] = 1.0
            if sx_ < 0:
                m = m[:, ::-1]
            if sy_ < 0:
                m = m[::-1, :]
            m = m.copy()
            rgb_arr, a = M.colorize(m, "#F2BBD2")
            self.corners.append((rgb_arr, a, cx_, cy_, sx_, sy_))

        # ---- scène 1 : titre ------------------------------------------------- #
        t_font = M.serif(900, self.P(132))
        while t_font.getlength(TITLE) + 10 * self.P(10) > W * 0.87:
            t_font = M.serif(900, int(t_font.size * 0.96))
        self.title = title_letters(TITLE, t_font, self.P(10), "#FFF7FA", "#F0A6C6")
        for L in self.title["letters"]:
            L["glow"] = M.glow(L["mask"], self.P(16), 0.42)
        self.title_font_size = t_font.size

        kick_f = M.sans(600, self.P(31))
        self.kicker = M.colorize(M.text_mask(KICKER, kick_f, self.P(13)), "#EBC4D6")
        self.sub1 = M.colorize(M.text_mask(SUBTITLE1, M.sans(500, self.P(28)), self.P(8)),
                               "#E7B9CD")
        self.sub2 = M.colorize(M.text_mask(SUBTITLE2, M.sans(300, self.P(28)), self.P(8)),
                               "#D9A6BF")
        self.rule1 = gradient_rule(self.P(300), self.P(3))
        self.wmark = M.ribbon_sprite(int(H * 0.62), "#F2A9C8", width=self.P(10))

        # ---- scène 2 : légendes ---------------------------------------------- #
        self.kicker2 = M.colorize(M.text_mask("PORTRAIT", M.sans(700, self.P(30)),
                                              self.P(14)), "#F3C1D6")
        dash = np.ones((self.P(3), self.P(46)), np.float32)
        self.dash = M.colorize(dash, "#D98CB0")
        self.name_spr = M.colorize(M.text_mask(NAME, M.serif(700, self.P(104)),
                                               self.P(4)), ("grad", "#FFF6F9", "#F5B9D3"))
        self.role_spr = M.colorize(M.text_mask(ROLE, M.sans(600, self.P(30)),
                                               self.P(7)), "#E9BE9A")
        self.name_glow = M.glow(self.name_spr[1], self.P(18), 0.30)
        self.rule2 = gradient_rule(self.P(240), self.P(3))
        self.pills = [pill(c, self.P(30)) for c in CHIPS]

        # ---- scène 3 : message ----------------------------------------------- #
        mf1 = M.serif(700, self.P(84))
        self.msg1_mask, self.msg1_words = M.para_masks(MSG_L1, mf1, W * 0.88,
                                                       tracking=0)
        self.msg1_rgb = np.broadcast_to(M.IVORY.reshape(1, 1, 3),
                                        (self.msg1_mask.shape[0],
                                         self.msg1_mask.shape[1], 3)).copy()
        self.msg1_box = (0, 0)
        mf2 = M.serif(700, self.P(92))
        self.msg2_mask, self.msg2_words = M.para_masks(MSG_L2, mf2, W * 0.88)
        self.msg2_rgb, _ = M.colorize(self.msg2_mask, ("grad", "#FFD9E8", "#F08AB0"))
        self.msg2_glow = M.glow(self.msg2_mask, self.P(22), 0.55)
        self.msg2_word_glows = [M.glow(wm, self.P(22), 0.55) for (wm, _, _) in self.msg2_words]

        self.msgs_mask, self.msgs_words = M.para_masks(
            MSG_SUB, M.sans(500, self.P(27)), W * 0.86, tracking=self.P(5),
            line_gap=1.5)
        self.msgs_rgb = np.broadcast_to(M.MUTED.reshape(1, 1, 3),
                                        (self.msgs_mask.shape[0],
                                         self.msgs_mask.shape[1], 3)).copy()
        self.diamond = []
        for s in (self.P(14),):
            yy, xx = np.mgrid[0:s * 2, 0:s * 2].astype(np.float32)
            m = np.clip(1 - (np.abs(xx - s + 0.5) + np.abs(yy - s + 0.5)) / s, 0, 1)
            self.diamond.append(M.colorize(m ** 0.8, "#F0A6C6"))

        # ECG
        self.ecg_w = int(W * 0.84)
        self.ecg_h = self.P(150)
        self.ecg_amp = self.P(50)
        ecg = M.ecg_path(self.ecg_w, self.ecg_amp, beats=3.0)
        self.ecg_pts = np.stack([ecg[:, 0] + 8, ecg[:, 1] + self.ecg_h / 2], axis=1)
        self.ecg_steps = 48
        self.ecg_cache: dict = {}
        self.ecg_dot = radial_dot(self.P(84), "#FFD8E8", 2.2)
        self.ecg_dot_core = radial_dot(self.P(26), "#FFFFFF", 1.6)

        # ---- scène 4 : carte de fin ------------------------------------------ #
        self.emblem = M.ribbon_sprite(int(H * 0.19), "#F5A8C9", width=self.P(11))
        self.emblem_glow = None
        self.wordmark = M.colorize(M.text_mask(TITLE, M.serif(900, self.P(78)),
                                               self.P(9)), ("grad", "#FFF7FA", "#EEA3C4"))
        self.rule3 = gradient_rule(self.P(220), self.P(3))
        self.episode = M.colorize(M.text_mask(EPISODE, M.sans(800, self.P(58)),
                                              self.P(16)), ("grad", "#FFFFFF", "#F6C3DA"))
        self.episode_glow = M.glow(self.episode[1], self.P(18), 0.5)

        # plaque de date
        pw, ph = self.P(830), self.P(360)
        self.plate_w, self.plate_h = pw, ph
        pr = self.P(46)
        self.plate_mask = M.rounded_mask(pw, ph, pr, 0.6)
        plate_fill = np.zeros((ph, pw, 3), np.float32) + M.rgb("#2C0F22") * 1.0
        self.plate_rgb = plate_fill
        self.plate_a = self.plate_mask * 0.86
        self.plate_ring_rgb, self.plate_ring_a = M.colorize(
            M.rounded_ring(pw, ph, pr, self.P(2.4), 0.5) * 0.95, "#E7A9C4")
        self.plate_inner_rgb, self.plate_inner_a = M.colorize(
            M.rounded_ring(pw - self.P(20), ph - self.P(20), pr - self.P(10),
                           self.P(1.2), 0.6) * 0.6, "#B9759A")
        self.plate_shadow_rgb, self.plate_shadow_a = M.colorize(
            M.soft_shadow(pw, ph, pr, blur=self.P(40), spread=self.P(18),
                          strength=0.5), "#000000")
        self.plate_sweep = sweep_sprite(pw, ph, pw, self.plate_mask, angle_deg=26,
                                        band=0.06, soft=0.05, strength=0.30)

        self.day = M.colorize(M.text_mask(DAYNAME, M.sans(600, self.P(34)),
                                          self.P(14)), "#E9BE9A")
        d_font = M.serif(900, self.P(92))
        while d_font.getlength(DATE) > pw * 0.84:
            d_font = M.serif(900, int(d_font.size * 0.96))
        self.date_spr = M.colorize(M.text_mask(DATE, d_font, self.P(4)),
                                   ("grad", "#FFFFFF", "#F3AECB"))
        self.date_spr_glow = M.glow(self.date_spr[1], self.P(20), 0.45)

        self.cta = M.colorize(M.text_mask(CTA, M.sans(700, self.P(29)), self.P(9)),
                              "#F6D5E5")
        self.footer = M.colorize(M.text_mask(FOOTER, M.sans(500, self.P(23)), self.P(8)),
                                 "#C79BB2")
        self.tags = M.colorize(M.text_mask(HASHTAGS, M.sans(600, self.P(24)), self.P(6)),
                               "#E5A9C6")

        # particules
        rng = np.random.default_rng(23)
        self.particles = []
        for _ in range(30):
            s = int(rng.uniform(self.P(8), self.P(26)))
            self.particles.append({
                "spr": radial_dot(s, rng.choice(["#FFC9DE", "#E9BE9A", "#FFFFFF"]), 2.6),
                "x": rng.uniform(0, W), "y": rng.uniform(0, H),
                "sp": rng.uniform(self.P(14), self.P(40)),
                "ph": rng.uniform(0, 6.28), "amp": rng.uniform(6, 34) * self.sc,
                "a": rng.uniform(0.10, 0.30), "sp2": rng.uniform(0.10, 0.28)})

        # lueur de fond pour la carte de fin
        self.bloom = radial_dot(int(H * 0.9), "#F08AB0", 2.6)

        # flash de transition
        self.flash_rgb = np.ones((H, W, 3), np.float32)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
        self.flash_a = np.clip(1 - d, 0, 1) ** 2.2

    # ---------------------------------------------------------------------- #
    def sprite(self, key, builder=None):
        if key not in self.cache:
            self.cache[key] = builder()
        return self.cache[key]

    def scale_of(self, sprite, s, key):
        return M.scaled_sprite(sprite, s, self.cache, key)

    # ---------------------------------------------------------------------- #
    def frame(self, t: float) -> np.ndarray:
        W, H, sc = self.W, self.H, self.sc
        canvas = self.bg.copy()
        M.draw_bokeh(canvas, self.bokeh, t)

        # particules (à partir du message)
        if t > T["message"] - 0.3:
            pa = M.seg(t, T["message"] - 0.2, T["message"] + 1.6) * (
                1 - M.seg(t, 20.35, 21.0, "in_out"))
            for p in self.particles:
                yy = (p["y"] - (t * p["sp"])) % (H + 120) - 60
                xx = p["x"] + math.sin(t * 0.25 + p["ph"]) * p["amp"]
                tw = 0.65 + 0.35 * math.sin(t * 1.6 + p["ph"] * 1.7)
                M.blit_sprite(canvas, p["spr"], xx, yy, p["a"] * pa * tw, additive=True)

        self.scene_title(canvas, t)
        self.scene_portrait(canvas, t)
        self.scene_message(canvas, t)
        self.scene_endcard(canvas, t)

        # flash de transition
        for cu, strength in ((T["portrait"], 0.22), (T["message"], 0.26), (T["endcard"], 0.30)):
            a = M.seg(t, cu - 0.10, cu + 0.02) * (1 - M.seg(t, cu + 0.02, cu + 0.55, "out_quint"))
            if a > 0.002:
                M.blit_sprite(canvas, (self.flash_rgb, self.flash_a), 0, 0,
                              a * strength, additive=True)

        # vignette + grain
        canvas *= self.vignette
        tile = self.grain[int(t * FPS) % len(self.grain)]
        canvas += (tile - 0.5) * 0.055

        # fin : fondu vers le prune
        k = M.seg(t, 20.35, 21.0, "out_cubic")
        if k > 0:
            canvas *= (1 - k)
            canvas += M.INK.reshape(1, 1, 3) * k
        return canvas

    # ---------------------------------------------------------------------- #
    def scene_title(self, canvas, t: float):
        o = M.seg(t, 3.30, 3.90, "in_out")           # sortie de scène
        drift = -self.Y(40) * o
        vis = 1.0 - o

        # filigrane ruban
        rp = M.seg(t, 0.25, 2.15, "out_cubic")
        if rp > 0:
            spr = self.sprite("wmark", lambda: M.ribbon_sprite(
                int(self.H * 0.62), "#F2A9C8", width=self.P(10)))
            spr = self.scale_of(spr, 1.0 + 0.02 * M.seg(t, 0.3, 3.8), "wmark_s")
            spr = sprite_rotated(spr, -5 + 3.2 * t * 0.25, self.cache, "wmark_r")
            a = 0.15 * vis * M.seg(t, 0.25, 1.4)
            w0, h0 = spr[1].shape[1], spr[1].shape[0]
            M.blit_sprite(canvas, spr, self.W / 2 - w0 / 2, self.Y(880) - h0 / 2 + drift,
                          a, additive=True)

        # pastille kicker
        if vis > 0.01:
            a = M.fade(t, 0.35, 3.30, 0.7)
            k_rgb, k_a = self.kicker
            M.blit_sprite(canvas, (k_rgb, k_a), self.W / 2 - k_a.shape[1] / 2,
                          self.Y(662) - k_a.shape[0] / 2 + drift, a * 0.95)

        # titre lettre par lettre
        tl = self.title
        block_w, block_h = tl["w"], tl["h"]
        x0 = self.W / 2 - block_w / 2
        y0 = self.Y(874) - block_h / 2
        for i, L in enumerate(tl["letters"]):
            st = 0.55 + i * 0.062
            a = M.seg(t, st, st + 0.75, "out_quint")
            if a <= 0.004:
                continue
            dy = (1 - M.EASES["out_back"](a)) * self.P(64)
            g = L["glow"]
            M.blit_sprite(canvas, (L["rgb"], g), x0 + L["x"], y0 + L["y"] + dy + drift,
                          a * 0.5 * vis, additive=True)
            M.blit_sprite(canvas, (L["rgb"], L["mask"]), x0 + L["x"], y0 + L["y"] + dy + drift,
                          a * vis)

        # filet
        a = M.seg(t, 1.55, 2.35, "out_cubic")
        if a > 0:
            spr = self.scale_of(self.rule1, 0.25 + 0.75 * a, "rule1_s")
            r_rgb, r_a, = spr
            M.blit_sprite(canvas, spr, self.W / 2 - r_a.shape[1] / 2,
                          self.Y(1021) - r_a.shape[0] / 2 + drift, a * 0.9 * vis)

        for spr, yy, t0 in ((self.sub1, 1090, 2.0), (self.sub2, 1148, 2.3)):
            a = M.fade(t, t0, 3.30, 0.8)
            if a > 0.01:
                rgb_arr, al = spr
                M.blit_sprite(canvas, spr, self.W / 2 - al.shape[1] / 2,
                              self.Y(yy) - al.shape[0] / 2 + drift, a * 0.95 * vis)

    # ---------------------------------------------------------------------- #
    def card_state(self, t: float):
        """Position/échelle/opacité de la carte, et fondu net -> flou (scène 3)."""
        e = M.seg(t, T["portrait"] + 0.02, T["portrait"] + 1.05, "out_back")
        top = self.Y(288) + (1 - e) * self.Y(90)
        s = 0.94 + 0.06 * e if e < 1 else 1.0
        alpha = M.seg(t, T["portrait"] + 0.02, T["portrait"] + 0.8)

        # transition vers la scène 3
        k = M.seg(t, T["message"] - 0.35, T["message"] + 0.45, "in_out")
        top = top * (1 - k) + self.Y(156) * k
        s = s * (1 - k) + 0.78 * k
        alpha = alpha * (1 - k) + 0.62 * k
        # sortie de scène 3
        out = M.seg(t, 15.95, 16.45, "in_out")
        top -= self.Y(30) * out
        alpha *= (1 - out)
        return top, s, alpha, k

    def scene_portrait(self, canvas, t: float):
        if t < T["portrait"] - 0.02 or t > 16.6:
            return
        top, s, alpha, k = self.card_state(t)
        if alpha < 0.005:
            return
        x0 = self.W / 2 - self.card_w * s / 2

        # ombre
        sh = self.scale_of((self.shadow_rgb, self.shadow_a), s, "shadow_s")
        spad = self.shadow_pad * s
        M.blit_sprite(canvas, sh, x0 - spad, top - spad + self.Y(16), alpha * 0.85)

        # photo (ou version floue)
        card = self.scale_of((self.card_rgb, self.card_a), s, "card_s")
        soft = self.scale_of((self.card_soft_rgb, self.card_a), s, "card_soft_s")
        if k < 0.999:
            M.blit_sprite(canvas, card, x0, top, alpha * (1 - k))
        if k > 0.001:
            M.blit_sprite(canvas, soft, x0, top, alpha * k)

        # liseré intérieur + cadre extérieur
        ring = self.scale_of((self.card_ring_rgb, self.card_ring_a), s, "ring_s")
        M.blit_sprite(canvas, ring, x0, top, alpha * 0.55)
        fr = self.scale_of((self.frame_rgb, self.frame_a), s, "frame_s")
        pad = self.P(19) * s
        M.blit_sprite(canvas, fr, x0 - pad, top - pad, alpha * 0.85)

        # coins
        a = M.seg(t, 4.55, 5.5, "out_back") * (1 - M.seg(t, 10.0, 10.45, "in_out"))
        if a > 0.004:
            cw_, ch_ = self.corners[0][1].shape[1], self.corners[0][1].shape[0]
            gap = self.P(52) * s
            ext = gap + self.P(26) * (1 - a)
            for rgb_arr, al, cx_, cy_, sx_, sy_ in self.corners:
                cxp = x0 + (gap if cx_ < 0 else self.card_w * s - gap) - (cw_ if cx_ > 0 else 0)
                cyp = top + (gap if cy_ < 0 else self.card_h * s - gap) - (ch_ if cy_ > 0 else 0)
                cxp += -sx_ * (ext - gap) if sx_ < 0 else sx_ * (ext - gap)
                cyp += -sy_ * (ext - gap) if sy_ < 0 else sy_ * (ext - gap)
                M.blit_sprite(canvas, (rgb_arr, al), cxp, cyp, a * alpha * 0.85)

        # balayage lumineux
        for (t0, t1) in ((5.30, 6.30), (8.9, 9.6)):
            p = M.seg(t, t0, t1)
            if 0.001 < p < 0.999:
                sw = self.scale_of(self.sweep, s, "sweep_s")
                W3 = sw[1].shape[1]
                off = (self.card_w * 3 * s)
                px = x0 + (-1.25 + 2.0 * p) * self.card_w * s
                hh = sw[1].shape[0]
                M.blit_sprite(canvas, sw, px, top + (self.card_h * s - hh) / 2,
                              alpha * (1 - k) * 0.9, additive=True)

        # légendes (masquées pendant la scène 3)
        vis = (1 - M.seg(t, 10.0, 10.45, "in_out")) * (1 - k * 0.9)
        if vis > 0.01:
            # kicker PORTRAIT + tirets
            a = M.fade(t, 4.15, 10.05, 0.8) * vis
            if a > 0.01:
                rgb_arr, al = self.kicker2
                dx = self.dash[1].shape[1]
                M.blit_sprite(canvas, self.dash, self.W / 2 - al.shape[1] / 2 - dx - self.P(24),
                              self.Y(222) - self.dash[1].shape[0] / 2, a * 0.8)
                M.blit_sprite(canvas, self.dash, self.W / 2 + al.shape[1] / 2 + self.P(24),
                              self.Y(222) - self.dash[1].shape[0] / 2, a * 0.8)
                M.blit_sprite(canvas, self.kicker2, self.W / 2 - al.shape[1] / 2,
                              self.Y(222) - al.shape[0] / 2, a)

            # nom
            a = M.fade(t, 5.05, 10.05, 0.9)
            if a > 0.01:
                rgb_arr, al = self.name_spr
                rise = (1 - M.EASES["out_quint"](M.seg(t, 5.05, 5.95))) * self.P(34)
                M.blit_sprite(canvas, (rgb_arr, self.name_glow),
                              self.W / 2 - al.shape[1] / 2, self.Y(1272) - al.shape[0] / 2 + rise,
                              a * 0.40 * vis, additive=True)
                M.blit_sprite(canvas, self.name_spr, self.W / 2 - al.shape[1] / 2,
                              self.Y(1272) - al.shape[0] / 2 + rise, a * vis)

            # filet + rôle
            a2 = M.seg(t, 5.5, 6.2, "out_cubic")
            if a2 > 0.01:
                spr = self.scale_of(self.rule2, 0.3 + 0.7 * a2, "rule2_s")
                M.blit_sprite(canvas, spr, self.W / 2 - spr[1].shape[1] / 2,
                              self.Y(1334) - spr[1].shape[0] / 2, a2 * 0.9 * vis)
            a = M.fade(t, 5.75, 10.05, 0.7)
            if a > 0.01:
                rgb_arr, al = self.role_spr
                M.blit_sprite(canvas, self.role_spr, self.W / 2 - al.shape[1] / 2,
                              self.Y(1392) - al.shape[0] / 2, a * vis)

            # pastilles
            gap = self.P(30)
            widths = [p[1].shape[1] for p in self.pills]
            total = sum(widths) + gap * (len(widths) - 1)
            px = self.W / 2 - total / 2
            for i, p in enumerate(self.pills):
                a = M.seg(t, 6.65 + i * 0.42, 7.45 + i * 0.42, "out_back") * vis
                if a > 0.004:
                    ph_ = p[1].shape[0]
                    dy = (1 - M.EASES["out_cubic"](min(1.0, a))) * self.P(24)
                    sc2 = 0.9 + 0.1 * min(1.0, a)
                    spr = M.scaled_sprite(p, sc2, self.cache, f"pill{i}")
                    w2, h2 = spr[1].shape[1], spr[1].shape[0]
                    M.blit_sprite(canvas, spr, px + (p[1].shape[1] - w2) / 2,
                                  self.Y(1472) - h2 / 2 + dy, a)
                px += p[1].shape[1] + gap

    # ---------------------------------------------------------------------- #
    def scene_message(self, canvas, t: float):
        if t < T["message"] - 0.4 or t > 16.5:
            return
        vis = (1 - M.seg(t, 15.95, 16.45, "in_out"))
        if vis < 0.01:
            return

        # ECG
        p = M.seg(t, T["message"] + 0.25, T["message"] + 1.9, "out_cubic")
        if p > 0.001:
            k = max(3, int(len(self.ecg_pts) * p))
            step = min(self.ecg_steps, int(math.ceil(p * self.ecg_steps)))
            if step not in self.ecg_cache:
                pts = self.ecg_pts[:max(3, int(len(self.ecg_pts) * step / self.ecg_steps))]
                m = M.stroke_mask(pts, self.P(4.0), self.ecg_w + 16, self.ecg_h,
                                  blur=self.P(1.1))
                rgb_arr, al = M.colorize(m, ("grad", "#FFE6F0", "#F0A6C6"))
                self.ecg_cache[step] = (rgb_arr, al, M.glow(al, self.P(16), 0.5))
            rgb_arr, al, gl = self.ecg_cache[step]
            pts = self.ecg_pts[:k]
            x0 = self.W / 2 - (self.ecg_w + 16) / 2
            y0 = self.Y(908) - self.ecg_h / 2
            M.blit_sprite(canvas, (rgb_arr, gl), x0, y0, vis * 0.6, additive=True)
            M.blit_sprite(canvas, (rgb_arr, al), x0, y0, vis * 0.95)
            # point lumineux en tête de tracé
            if p < 1.0:
                hx, hy = pts[-1]
                d = self.ecg_dot
                s2 = d[1].shape[0]
                M.blit_sprite(canvas, d, x0 + hx - s2 / 2, y0 + hy - s2 / 2,
                              vis * 0.75, additive=True)
                c = self.ecg_dot_core
                s3 = c[1].shape[0]
                M.blit_sprite(canvas, c, x0 + hx - s3 / 2, y0 + hy - s3 / 2,
                              vis * 0.9, additive=True)
            else:
                # pulsation finale
                pu = 0.5 + 0.5 * math.sin((t - (T["message"] + 1.9)) * 3.0)
                hx, hy = pts[-1]
                s2 = int(self.P(84) * (0.8 + 0.35 * pu))
                d = M.scaled_sprite(self.ecg_dot, s2 / self.P(84), self.cache, "eghdot")
                M.blit_sprite(canvas, d, x0 + hx - s2 / 2, y0 + hy - s2 / 2,
                              vis * 0.5 * (0.7 + 0.3 * pu), additive=True)

        # message principal
        self.blit_words(canvas, self.msg1_mask, self.msg1_rgb, self.msg1_words,
                        center_y=self.Y(1032), t0=T["message"] + 0.65, stagger=0.16,
                        dur=0.7, vis=vis, rise=self.P(30), t=t)
        self.blit_words(canvas, self.msg2_mask, self.msg2_rgb, self.msg2_words,
                        center_y=self.Y(1168), t0=T["message"] + 1.35, stagger=0.20,
                        dur=0.8, vis=vis, rise=self.P(36), word_glows=self.msg2_word_glows,
                        t=t)

        # diamants + sous-titre
        a = M.seg(t, T["message"] + 2.9, T["message"] + 3.6, "out_cubic") * vis
        if a > 0.01:
            for i, dx in enumerate((-1, 0, 1)):
                d = self.diamond[0]
                s2 = d[1].shape[0]
                M.blit_sprite(canvas, d, self.W / 2 + dx * self.P(54) - s2 / 2,
                              self.Y(1292) - s2 / 2, a * (0.5 if dx == 0 else 0.85))
        self.blit_words(canvas, self.msgs_mask, self.msgs_rgb, self.msgs_words,
                        center_y=self.Y(1396), t0=T["message"] + 3.35, stagger=0.05,
                        dur=0.5, vis=vis, rise=self.P(18), t=t)

    def blit_words(self, canvas, mask, rgb_arr, words, center_y, t0, stagger, dur,
                   vis, rise, word_glows=None, t=None, additive_glow=0.5):
        """Révélation mot à mot (montée + fondu), avec halo optionnel."""
        h, w = mask.shape
        x0 = self.W / 2 - w / 2
        y0 = center_y - h / 2
        for i, (wm, wx, wy) in enumerate(words):
            st = t0 + i * stagger
            a = M.seg(t, st, st + dur, "out_quint") * vis
            if a <= 0.004:
                continue
            dy = (1 - M.EASES["out_quint"](M.seg(t, st, st + dur, "out_quint"))) * rise
            wh, ww = wm.shape
            gy, gx = int(wy), int(wx)
            sub_rgb = slice_pad(rgb_arr, gy, gx, wh, ww)
            px, py = x0 + wx, y0 + wy + dy
            if word_glows is not None and word_glows[i] is not None:
                M.blit_sprite(canvas, (sub_rgb, word_glows[i] * wm), px, py,
                              a * additive_glow, additive=True)
            M.blit_sprite(canvas, (sub_rgb, wm), px, py, a)

    # ---------------------------------------------------------------------- #
    def scene_endcard(self, canvas, t: float):
        if t < T["endcard"] - 0.15:
            return
        vis = 1.0 - M.seg(t, 20.35, 21.0, "out_cubic")

        # halo de fond
        b_a = M.seg(t, T["endcard"], T["endcard"] + 1.2) * vis
        if b_a > 0.01:
            d = self.bloom
            s2 = d[1].shape[0]
            pu = 0.9 + 0.1 * math.sin((t - T["endcard"]) * 1.4)
            M.blit_sprite(canvas, d, self.W / 2 - s2 / 2, self.Y(1000) - s2 / 2,
                          b_a * 0.16 * pu, additive=True)

        # emblème ruban
        p = M.seg(t, T["endcard"] + 0.15, T["endcard"] + 1.35, "out_cubic")
        if p > 0:
            qs = max(1, int(math.ceil(p * 16)))
            spr = self.sprite(f"emblem_{qs}", lambda qs=qs: M.ribbon_sprite(
                int(self.H * 0.19), "#F5A8C9", width=self.P(11), progress=qs / 16))
            h0, w0 = spr[1].shape
            cy = self.Y(288)
            M.blit_sprite(canvas, (spr[0], M.glow(spr[1], self.P(26), 0.5)),
                          self.W / 2 - w0 / 2, cy - h0 / 2, 0.7 * vis, additive=True)
            M.blit_sprite(canvas, spr, self.W / 2 - w0 / 2, cy - h0 / 2, vis)

        # wordmark
        a = M.fade(t, 17.0, 20.6, 0.8) * vis
        if a > 0.01:
            rgb_arr, al = self.wordmark
            M.blit_sprite(canvas, self.wordmark, self.W / 2 - al.shape[1] / 2,
                          self.Y(492) - al.shape[0] / 2, a)
            spr = self.scale_of(self.rule3, 0.4 + 0.6 * M.seg(t, 17.1, 17.9), "rule3_s")
            M.blit_sprite(canvas, spr, self.W / 2 - spr[1].shape[1] / 2,
                          self.Y(556) - spr[1].shape[0] / 2, a * 0.9)

        # ÉPISODE 1 + brillance
        a = M.seg(t, 17.25, 18.0, "out_back") * vis
        if a > 0.004:
            rgb_arr, al = self.episode
            ex, ey = self.W / 2 - al.shape[1] / 2, self.Y(628) - al.shape[0] / 2
            M.blit_sprite(canvas, (rgb_arr, self.episode_glow), ex, ey, a * 0.5, additive=True)
            M.blit_sprite(canvas, self.episode, ex, ey, a)
            # balayage sur le texte
            p = M.seg(t, 18.7, 19.5)
            if 0.001 < p < 0.999:
                m = np.zeros_like(al)
                xx = np.linspace(0, 1, al.shape[1])[None, :]
                band = np.exp(-((xx - (-0.3 + 1.6 * p)) ** 2) / (2 * 0.09 ** 2))
                m = al * band
                M.blit_sprite(canvas, (np.ones_like(rgb_arr), m), ex, ey, 0.85 * vis,
                              additive=True)

        # plaque de date
        pe = M.seg(t, 17.95, 18.85, "out_back")
        if pe > 0.002:
            pw, ph_ = self.plate_w, self.plate_h
            s_pl = 0.94 + 0.06 * pe
            x0 = self.W / 2 - pw * s_pl / 2
            y0 = self.Y(858) - ph_ * s_pl / 2 + (1 - M.EASES["out_cubic"](pe)) * self.P(30)
            keep = vis
            sh = self.scale_of((self.plate_shadow_rgb, self.plate_shadow_a), s_pl, "plsh")
            M.blit_sprite(canvas, sh, x0 - self.P(18) * s_pl,
                          y0 - self.P(18) * s_pl + self.Y(14), keep * 0.9)
            pl = self.scale_of((self.plate_rgb, self.plate_a), s_pl, "pl")
            M.blit_sprite(canvas, pl, x0, y0, keep * pe)
            rg = self.scale_of((self.plate_ring_rgb, self.plate_ring_a), s_pl, "plr")
            M.blit_sprite(canvas, rg, x0, y0, keep * pe * 0.95)
            ig = self.scale_of((self.plate_inner_rgb, self.plate_inner_a), s_pl, "pli")
            pad = self.P(10) * s_pl
            M.blit_sprite(canvas, ig, x0 + pad, y0 + pad, keep * pe * 0.8)
            # balayage de la plaque
            p = M.seg(t, 18.8, 19.8)
            if 0.001 < p < 0.999:
                sw = self.scale_of(self.plate_sweep, s_pl, "plsw")
                px = x0 + (-1.25 + 2.0 * p) * pw * s_pl
                hh = sw[1].shape[0]
                M.blit_sprite(canvas, sw, px, y0 + (ph_ * s_pl - hh) / 2,
                              keep * pe, additive=True)

            # contenus de la plaque
            a1 = M.seg(t, 18.10, 18.75, "out_quint") * keep
            if a1 > 0.01:
                rgb_arr, al = self.day
                M.blit_sprite(canvas, self.day, self.W / 2 - al.shape[1] / 2,
                              y0 + self.P(96) * s_pl - al.shape[0] / 2, a1 * 0.95)
            a2 = M.seg(t, 18.35, 19.05, "out_quint") * keep
            if a2 > 0.004:
                rgb_arr, al = self.date_spr
                dy = (1 - M.EASES["out_cubic"](a2)) * self.P(26)
                ex = self.W / 2 - al.shape[1] / 2
                ey = y0 + self.P(232) * s_pl - al.shape[0] / 2 + dy
                M.blit_sprite(canvas, (rgb_arr, self.date_spr_glow), ex, ey,
                              a2 * 0.55, additive=True)
                M.blit_sprite(canvas, self.date_spr, ex, ey, a2)

        # CTA + pied de page
        a = M.fade(t, 18.9, 20.6, 0.8) * vis
        if a > 0.01:
            rgb_arr, al = self.cta
            M.blit_sprite(canvas, self.cta, self.W / 2 - al.shape[1] / 2,
                          self.Y(1150) - al.shape[0] / 2, a)
        a = M.fade(t, 19.25, 20.6, 0.8) * vis
        if a > 0.01:
            rgb_arr, al = self.tags
            M.blit_sprite(canvas, self.tags, self.W / 2 - al.shape[1] / 2,
                          self.Y(1236) - al.shape[0] / 2, a * 0.95)
        a = M.fade(t, 19.5, 20.6, 0.8) * vis
        if a > 0.01:
            rgb_arr, al = self.footer
            M.blit_sprite(canvas, self.footer, self.W / 2 - al.shape[1] / 2,
                          self.Y(1408) - al.shape[0] / 2, a * 0.8)


# --------------------------------------------------------------------------- #
def main(argv=None):
    global FPS
    ap = argparse.ArgumentParser(description="Teaser motion design Bureau Rose")
    ap.add_argument("--photo", default=None,
                    help="photo du portrait (défaut : assets/portrait_card.png, sinon "
                         "assets/portrait.jpg, sinon portrait de substitution)")
    ap.add_argument("--out", default=os.path.join(ROOT, "livrables",
                                                  "bureau-rose-teaser-9x16.mp4"))
    ap.add_argument("--scale", type=float, default=1.0, help="0.5 = rendu rapide de test")
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--duration", type=float, default=DUR)
    ap.add_argument("--only", nargs=2, type=float, metavar=("DEBUT", "FIN"),
                    help="ne rendre que cet intervalle (secondes) — pour les tests")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--cover-at", type=float, default=0.0,
                    help="extraire une couverture (miniature) à cet instant")
    ap.add_argument("--dump", type=str, default="",
                    help="rendre des images fixes (PNG) : '1.2,5.0,12.3' + dossier")
    ap.add_argument("--dump-dir", type=str, default=os.path.join(ROOT, "livrables", "frames"))
    args = ap.parse_args(argv)

    FPS = args.fps
    W = int(round(1080 * args.scale / 2) * 2)
    H = int(round(1920 * args.scale / 2) * 2)
    if args.only:
        t_start, t_end = args.only
    else:
        t_start, t_end = 0.0, args.duration
    n_frames = int(round((t_end - t_start) * FPS))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    print(f"[{now()}] Bureau Rose — rendu {W}x{H} @{FPS}fps  "
          f"({n_frames} images, {t_start:.2f}s → {t_end:.2f}s)")

    # audio
    wav = os.path.join(ROOT, "assets", "audio.wav")
    if not args.no_audio:
        if not os.path.exists(wav) or os.path.getmtime(wav) < os.path.getmtime(
                os.path.join(ROOT, "audio.py")):
            print(f"[{now()}] synthèse de l'ambiance sonore…")
            A.write_wav(wav, A.build(DUR))
        else:
            print(f"[{now()}] ambiance sonore en cache ({wav})")

    photo = best_photo(args.photo)
    print(f"[{now()}] photo : {os.path.relpath(photo, ROOT)}")
    r = Renderer(photo, W, H)
    print(f"[{now()}] sprites prêts — rendu des images…")

    if args.dump:
        os.makedirs(args.dump_dir, exist_ok=True)
        for item in args.dump.split(","):
            tt = float(item)
            img = np.clip(r.frame(tt), 0, 1)
            out = os.path.join(args.dump_dir, f"t{tt:05.2f}.png")
            Image.fromarray((img * 255).astype(np.uint8)).save(out)
            print(f"  image fixe t={tt:.2f}s -> {out}")
        return 0

    ff = ffmpeg_exe()
    out_dir = os.path.dirname(args.out)
    os.makedirs(out_dir, exist_ok=True)
    vid_path = args.out + ".video.mp4" if not args.only else args.out
    aud_path = os.path.join(out_dir, "audio.m4a")

    cmd = [ff, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-",
           "-c:v", "libx264", "-preset", "medium", "-crf", "17",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
           "-colorspace", "bt709", "-movflags", "+faststart", vid_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    t0 = time.time()
    try:
        for i in range(n_frames):
            t = t_start + i / FPS
            frame = np.clip(r.frame(t), 0, 1)
            proc.stdin.write((frame * 255).astype(np.uint8).tobytes())
            if i % 15 == 0 or i == n_frames - 1:
                el = time.time() - t0
                eta = el / max(1, i + 1) * (n_frames - i - 1)
                print(f"  [{now()}] image {i + 1}/{n_frames}  "
                      f"({el:.0f}s écoulées, ~{eta:.0f}s restantes)", flush=True)
    finally:
        proc.stdin.close()
        proc.wait()

    if proc.returncode != 0:
        raise SystemExit("échec de l'encodage vidéo (ffmpeg)")

    # 2) audio -> AAC (séparé : pas de filtre lourd dans le pipeline vidéo)
    if not args.no_audio and not args.only:
        print(f"[{now()}] encodage audio…")
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", wav,
                        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", aud_path],
                       check=True)
        # 3) mux final
        print(f"[{now()}] assemblage final…")
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", vid_path,
                        "-i", aud_path, "-map", "0:v:0", "-map", "1:a:0",
                        "-c", "copy", "-shortest", "-movflags", "+faststart",
                        args.out], check=True)
        os.remove(vid_path)

    size = os.path.getsize(args.out) / 1e6
    print(f"[{now()}] ✔ {args.out}  ({size:.1f} Mo, {time.time() - t0:.0f}s)")

    if args.cover_at > 0:
        cover = os.path.splitext(args.out)[0] + f"-cover-{args.cover_at:.1f}s.jpg"
        subprocess.run([ff, "-y", "-loglevel", "error", "-ss", str(args.cover_at),
                        "-i", args.out, "-frames:v", "1", "-q:v", "2", cover], check=True)
        print(f"[{now()}] ✔ couverture : {cover}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
