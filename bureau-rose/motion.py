"""
motion.py — boîte à outils "motion design" (rendu image par image avec numpy/PIL).

Contient : easing, typographie (tracking, glow, dégradés), composition alpha,
formes (ruban de sensibilisation, ECG, pastilles), fond animé, grain, vignette.
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# --------------------------------------------------------------------------- #
# Chemins / polices
# --------------------------------------------------------------------------- #
ROOT = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(ROOT, "assets", "fonts")

W, H = 1080, 1920          # format 9:16 (TikTok / Reels / Shorts)
_FONT_CACHE: dict = {}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    return _FONT_CACHE[key]


# Raccourcis polices
def sans(weight: int = 500, size: int = 40, italic: bool = False):
    if italic:
        return font(f"Montserrat-{weight}-Italic.ttf", size)
    return font(f"Montserrat-{weight}.ttf", size)


def serif(weight: int = 700, size: int = 40, italic: bool = False):
    if italic:
        return font(f"PlayfairDisplay-{weight}-Italic.ttf", size)
    return font(f"PlayfairDisplay-{weight}.ttf", size)


# --------------------------------------------------------------------------- #
# Couleurs
# --------------------------------------------------------------------------- #
def rgb(hexstr: str) -> np.ndarray:
    h = hexstr.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


INK       = rgb("#170810")   # prune très profond
INK2      = rgb("#2A0E20")
ROSE      = rgb("#F08AB0")
ROSE_DEEP = rgb("#C9517F")
ROSE_SOFT = rgb("#FFBED6")
GOLD      = rgb("#E9BE9A")
IVORY     = rgb("#FFF4F8")
WHITE     = rgb("#FFFFFF")
MUTED     = rgb("#E3B9CD")


# --------------------------------------------------------------------------- #
# Easing
# --------------------------------------------------------------------------- #
def _clamp01(t: float) -> float:
    return 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)


def ease_out_cubic(t):    return 1 - (1 - t) ** 3
def ease_out_quint(t):    return 1 - (1 - t) ** 5
def ease_out_expo(t):     return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)
def ease_in_cubic(t):     return t ** 3
def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_back(t, s: float = 1.6):
    t = t - 1
    return 1 + (s + 1) * t ** 3 + s * t ** 2


EASES = {
    "linear": lambda t: t,
    "out_cubic": ease_out_cubic,
    "out_quint": ease_out_quint,
    "out_expo": ease_out_expo,
    "in_cubic": ease_in_cubic,
    "in_out": ease_in_out_cubic,
    "out_back": ease_out_back,
}


def seg(t: float, t0: float, t1: float, kind: str = "out_cubic") -> float:
    """Progression 0→1 entre t0 et t1, avec easing."""
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return EASES[kind](_clamp01((t - t0) / (t1 - t0)))


def fade(t: float, t_in: float, t_out: float | None, dur_in: float = 0.6,
         dur_out: float = 0.4, kind_in: str = "out_cubic") -> float:
    """Fondu simple (montée, plateau, descente)."""
    a = seg(t, t_in, t_in + dur_in, kind_in)
    if t_out is not None:
        a *= 1.0 - seg(t, t_out, t_out + dur_out, "in_out")
    return a


# --------------------------------------------------------------------------- #
# Typographie -> masques (alpha) pré-rendus
# --------------------------------------------------------------------------- #
def text_mask(text: str, fnt, tracking: float = 0.0) -> np.ndarray:
    """Rend un texte en masque alpha float32 (0..1), cadré au plus juste."""
    widths = [fnt.getlength(ch) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    asc, desc = fnt.getmetrics()
    pad = 8
    img = Image.new("L", (int(math.ceil(total)) + 2 * pad + 4, asc + desc + 2 * pad), 0)
    d = ImageDraw.Draw(img)
    x = float(pad)
    for ch, w in zip(text, widths):
        if ch != " ":
            d.text((x, pad), ch, font=fnt, fill=255)
        x += w + tracking
    return _tight(img)


def _tight(img: Image.Image) -> np.ndarray:
    """Recadre le masque sur son contenu (bbox serré) et renvoie float32 0..1."""
    a = np.asarray(img, dtype=np.float32) / 255.0
    ys, xs = np.where(a > 0.02)
    if len(xs) == 0:
        return a[:1, :1]
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def letter_masks(text: str, fnt, tracking: float = 0.0):
    """Masques par lettre : [(mask, x_pen, largeur_avance), ...] pour les révélations."""
    widths = [fnt.getlength(ch) for ch in text]
    asc, desc = fnt.getmetrics()
    h = asc + desc + 16
    out, pen = [], 0.0
    for ch, w in zip(text, widths):
        if ch.strip():
            img = Image.new("L", (int(w) + 24, h), 0)
            ImageDraw.Draw(img).text((8, 8), ch, font=fnt, fill=255)
            m = np.asarray(img, dtype=np.float32) / 255.0
            ys, xs = np.where(m > 0.02)
            if len(xs):
                m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
                out.append((m, pen + xs.min() - 8, w))
            else:
                out.append((None, pen, w))
        pen += w + tracking
    total = pen - tracking if text else 0.0
    return out, total


def wrap_text(text: str, fnt, max_w: float, tracking: float = 0.0):
    words, lines, cur = text.split(), [], ""
    for w in words:
        probe = (cur + " " + w).strip()
        if fnt.getlength(probe) + tracking * max(0, len(probe) - 1) <= max_w or not cur:
            cur = probe
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def para_masks(text: str, fnt, max_w: float, line_gap: float = 1.28,
               tracking: float = 0.0, align: str = "center", pad: int = 10):
    """Paragraphe -> (masque global, mots).

    Chaque mot = (masque NON recadré, x, y) ; le masque se pose exactement à (x, y)
    dans le repère du paragraphe (utile pour les révélations mot à mot).
    """
    lines = wrap_text(text, fnt, max_w, tracking)
    if not lines:
        return np.zeros((2, 2), np.float32), []
    asc, desc = fnt.getmetrics()
    lh = int((asc + desc) * line_gap)
    tw = max(fnt.getlength(l) + tracking * max(0, len(l) - 1) for l in lines)
    width = int(tw) + 2 * pad
    height = lh * len(lines) + 2 * pad
    canvas = Image.new("L", (width, height), 0)
    d = ImageDraw.Draw(canvas)
    words = []
    for li, line in enumerate(lines):
        lw = fnt.getlength(line) + tracking * max(0, len(line) - 1)
        x = (width - lw) / 2 if align == "center" else pad
        y = pad + li * lh
        pen = x
        for wd in line.split(" "):
            wwd = fnt.getlength(wd)
            wimg = Image.new("L", (int(wwd) + 2 * pad + 4, asc + desc + 2 * pad), 0)
            ImageDraw.Draw(wimg).text((pad, pad), wd, font=fnt, fill=255)
            words.append((np.asarray(wimg, np.float32) / 255.0, pen - pad, y - pad))
            pen += wwd + fnt.getlength(" ") + tracking
        d.text((x, y), line, font=fnt, fill=255)
    return np.asarray(canvas, dtype=np.float32) / 255.0, words


def grad_sprite(mask: np.ndarray, top, bot):
    """Colore un masque avec un dégradé vertical (couleurs hex ou np float)."""
    h, w = mask.shape
    c0 = rgb(top) if isinstance(top, str) else np.asarray(top, np.float32)
    c1 = rgb(bot) if isinstance(bot, str) else np.asarray(bot, np.float32)
    ramp = np.linspace(0, 1, h, dtype=np.float32).reshape(h, 1, 1)
    out = c0.reshape(1, 1, 3) * (1 - ramp) + c1.reshape(1, 1, 3) * ramp
    return np.broadcast_to(out, (h, w, 3)).copy().astype(np.float32), mask


# --------------------------------------------------------------------------- #
# Conversions masque -> RGBA numpy, glow
# --------------------------------------------------------------------------- #
def colorize(mask: np.ndarray, color) -> tuple[np.ndarray, np.ndarray]:
    """masque -> (rgb float32 HxWx3, alpha float32 HxW)."""
    h, w = mask.shape
    if isinstance(color, (str, np.ndarray)) or (
            isinstance(color, (tuple, list)) and len(color) == 3
            and not isinstance(color[0], (tuple, list, str))):
        c = rgb(color) if isinstance(color, str) else np.asarray(color, np.float32)
        rgb_arr = np.broadcast_to(c.reshape(1, 1, 3), (h, w, 3)).copy()
    else:
        # ('grad', haut, bas) : dégradé vertical
        _, top, bot = color
        c0 = rgb(top) if isinstance(top, str) else np.asarray(top, np.float32)
        c1 = rgb(bot) if isinstance(bot, str) else np.asarray(bot, np.float32)
        ramp = np.linspace(0, 1, h, dtype=np.float32).reshape(h, 1, 1)
        rgb_arr = (c0.reshape(1, 1, 3) * (1 - ramp) + c1.reshape(1, 1, 3) * ramp)
        rgb_arr = np.broadcast_to(rgb_arr, (h, w, 3)).copy()
    return rgb_arr, mask.astype(np.float32)


def glow(mask: np.ndarray, radius: float, strength: float = 0.55,
         shrink: float = 0.0) -> np.ndarray:
    """Halo doux dérivé d'un masque (alpha)."""
    img = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), "L")
    if shrink > 0:
        k = max(1, int(shrink * 2 + 1))
        img = img.filter(ImageFilter.Filter)  # no-op garde-fou
        img = img.filter(ImageFilter.MaxFilter(3 if shrink < 2 else 5)).filter(
            ImageFilter.GaussianBlur(shrink))
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.clip(np.asarray(img, np.float32) / 255.0 * strength, 0, 1)


def np_from_pil(img: Image.Image):
    """PIL RGBA -> (rgb, alpha) float32."""
    arr = np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0
    return np.ascontiguousarray(arr[..., :3]), np.ascontiguousarray(arr[..., 3])


# --------------------------------------------------------------------------- #
# Composition
# --------------------------------------------------------------------------- #
def blit(canvas: np.ndarray, rgb_arr: np.ndarray, alpha: np.ndarray,
         x: float, y: float, a: float = 1.0) -> None:
    """Composition alpha classique d'un sprite sur le canvas float32 (H,W,3)."""
    if a <= 0.003:
        return
    CH, CW, _ = canvas.shape
    sh, sw = alpha.shape
    x0, y0 = int(round(x)), int(round(y))
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(CW, x0 + sw), min(CH, y0 + sh)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    sx0, sy0 = dx0 - x0, dy0 - y0
    h, w = dy1 - dy0, dx1 - dx0
    sub_a = (alpha[sy0:sy0 + h, sx0:sx0 + w] * a)[..., None]
    sub_rgb = rgb_arr[sy0:sy0 + h, sx0:sx0 + w]
    dst = canvas[dy0:dy1, dx0:dx1]
    dst *= (1.0 - sub_a)
    dst += sub_rgb * sub_a


def blit_add(canvas: np.ndarray, rgb_arr: np.ndarray, alpha: np.ndarray,
             x: float, y: float, a: float = 1.0) -> None:
    """Composition additive (lumières, halos, reflets)."""
    if a <= 0.003:
        return
    CH, CW, _ = canvas.shape
    sh, sw = alpha.shape
    x0, y0 = int(round(x)), int(round(y))
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(CW, x0 + sw), min(CH, y0 + sh)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    sx0, sy0 = dx0 - x0, dy0 - y0
    h, w = dy1 - dy0, dx1 - dx0
    sub_a = (alpha[sy0:sy0 + h, sx0:sx0 + w] * a)[..., None]
    sub_rgb = rgb_arr[sy0:sy0 + h, sx0:sx0 + w]
    canvas[dy0:dy1, dx0:dx1] += sub_rgb * sub_a


def blit_sprite(canvas, sprite, x, y, a=1.0, additive=False) -> None:
    """sprite = (rgb, alpha)."""
    fn = blit_add if additive else blit
    fn(canvas, sprite[0], sprite[1], x, y, a)


def scaled_sprite(sprite, scale: float, cache: dict, key: str):
    """Redimensionne un sprite (avec cache) — utilisé pour les mouvements d'échelle."""
    if abs(scale - 1.0) < 0.004:
        return sprite
    rgb_arr, alpha = sprite
    big = alpha.size > 400_000
    q = 0.01 if big else 0.002
    s_q = round(scale / q) * q
    k = (key, s_q)
    if k in cache:
        return cache[k]
    h, w = alpha.shape
    nh, nw = max(2, int(h * scale)), max(2, int(w * scale))
    a_img = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), "L").resize(
        (nw, nh), Image.LANCZOS)
    r_img = Image.fromarray((np.clip(rgb_arr, 0, 1) * 255).astype(np.uint8), "RGB").resize(
        (nw, nh), Image.LANCZOS)
    out = (np.asarray(r_img, np.float32) / 255.0, np.asarray(a_img, np.float32) / 255.0)
    if len(cache) < 220 and not big:
        cache[k] = out
    return out


# --------------------------------------------------------------------------- #
# Formes
# --------------------------------------------------------------------------- #
def rounded_mask(w: int, h: int, r: int, feather: float = 1.0) -> np.ndarray:
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    if feather > 0:
        img = img.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(img, np.float32) / 255.0


def rounded_ring(w: int, h: int, r: int, thickness: float, blur: float = 0.6) -> np.ndarray:
    """Anneau (contour) arrondi -> masque alpha."""
    ss = 3  # supersampling pour un trait net et fin
    img = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([ss - 1, ss - 1, w * ss - ss, h * ss - ss], radius=r * ss,
                        outline=255, width=max(1, int(thickness * ss)))
    img = img.resize((w, h), Image.LANCZOS)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, np.float32) / 255.0


def soft_shadow(w: int, h: int, r: int, blur: float = 34, spread: int = 0,
                strength: float = 0.55) -> np.ndarray:
    m = rounded_mask(w + 2 * spread, h + 2 * spread, r + spread, 0.0)
    img = Image.fromarray((m * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, np.float32) / 255.0 * strength


def bezier(p0, p1, p2, p3, n: int = 64):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(p, np.float32) for p in (p0, p1, p2, p3))
    return ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
            + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)


def catmull(points, samples_per_seg: int = 40) -> np.ndarray:
    """Lissage Catmull-Rom d'une liste de points (courbes fluides)."""
    pts = np.asarray(points, np.float32)
    if len(pts) < 2:
        return pts
    ext = np.vstack([pts[0], pts, pts[-1]])
    out = []
    for i in range(len(ext) - 3):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        t = np.linspace(0, 1, samples_per_seg, endpoint=False)[:, None]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                          + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1][None, :])
    return np.vstack(out)


def stroke_mask(points: np.ndarray, width: float, box_w: int, box_h: int,
                blur: float = 1.2, tapered: bool = False) -> np.ndarray:
    """Trace une polyligne épaisse (bouts ronds) dans un masque de la taille du cadre.

    points : coordonnées (x, y) dans le repère du cadre.
    """
    ss = 2
    img = Image.new("L", (box_w * ss, box_h * ss), 0)
    d = ImageDraw.Draw(img)
    pts = [(float(x) * ss, float(y) * ss) for x, y in points]
    if len(pts) >= 2:
        d.line(pts, fill=255, width=max(1, int(width * ss)), joint="curve")
    for (cx, cy) in (pts[:1] + pts[-1:]):
        rr = max(1, int(width * ss / 2))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=255)
    img = img.resize((box_w, box_h), Image.LANCZOS)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, np.float32) / 255.0


def ribbon_path(n: int = 70) -> np.ndarray:
    """Ruban de sensibilisation : un seul tracé continu (queue G -> boucle -> queue D)."""
    A, B, L, D, E, F = ((-0.46, 0.62), (0.0, 0.10), (-0.34, -0.14), (0.0, -0.56),
                        (0.34, -0.14), (0.46, 0.62))
    segs = [
        (A, (-0.34, 0.40), (-0.14, 0.26), B),      # queue gauche -> croisement
        (B, (-0.13, 0.02), (-0.27, -0.06), L),     # croisement -> flanc gauche
        (L, (-0.38, -0.24), (-0.25, -0.50), D),    # flanc gauche -> sommet
        (D, (0.25, -0.50), (0.38, -0.24), E),      # sommet -> flanc droit
        (E, (0.27, -0.06), (0.13, 0.02), B),       # flanc droit -> croisement
        (B, (0.14, 0.26), (0.34, 0.40), F),        # croisement -> queue droite
    ]
    return np.vstack([bezier(*sg, n) for sg in segs])


def ribbon_sprite(size: int, color, width: float = 8.0, progress: float = 1.0,
                  blur: float = 1.2):
    """Sprite du ruban, révélé progressivement de 0 à 1 (tracé + halo)."""
    box = int(size)
    pad = max(2, int(size * 0.05))
    path = ribbon_path()
    px = (path[:, 0] * 0.5 + 0.5)
    py = (path[:, 1] * 0.5 + 0.5)
    x0, x1 = px.min(), px.max()
    y0, y1 = py.min(), py.max()
    span = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    sc = (box - 2 * pad) / max(span)
    ox = pad + ((box - 2 * pad) - (x1 - x0) * sc) / 2 - x0 * sc
    oy = pad + ((box - 2 * pad) - (y1 - y0) * sc) / 2 - y0 * sc
    pts = np.stack([px * sc + ox, py * sc + oy], axis=1).astype(np.float32)
    p = _clamp01(progress)
    k = max(2, int(len(pts) * p)) if p < 1 else len(pts)
    m = stroke_mask(pts[:k], width, box, box, blur)
    return colorize(m, color)


# --------------------------------------------------------------------------- #
# Fond, vignette, grain
# --------------------------------------------------------------------------- #
def base_background(w: int, h: int) -> np.ndarray:
    """Dégradé de fond prune/rose, avec halos fixes."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x = (xx / w).reshape(h, w, 1)
    y = (yy / h).reshape(h, w, 1)
    top = INK2.reshape(1, 1, 3)
    bot = INK.reshape(1, 1, 3)
    img = top * (1 - y) + bot * y
    # halo chaud en haut
    r = np.sqrt((x - 0.5) ** 2 + (y - 0.12) ** 2 * 1.6)
    img = img + np.clip(1 - r / 0.55, 0, 1) ** 2 * ROSE_DEEP.reshape(1, 1, 3) * 0.30
    # halo froid en bas
    r2 = np.sqrt((x - 0.5) ** 2 + (y - 0.95) ** 2 * 1.4)
    img = img + np.clip(1 - r2 / 0.7, 0, 1) ** 2 * rgb("#3A1030").reshape(1, 1, 3) * 0.9
    return np.clip(img, 0, 1)


def bokeh_set(n: int = 16, seed: int = 7):
    """Ensemble de halos flous (bokeh) à faire dériver en fond."""
    rng = np.random.default_rng(seed)
    blobs = []
    for i in range(n):
        size = int(rng.uniform(360, 1000))
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
        d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
        a = np.clip(1 - d, 0, 1) ** 2.4
        hue = rng.integers(0, 3)
        c = [ROSE, GOLD, ROSE_SOFT][hue] if hue < 2 else rgb("#FF7FB0")
        blobs.append({
            "rgb": np.broadcast_to(c.reshape(1, 1, 3), (size, size, 3)).copy(),
            "a": a.astype(np.float32),
            "x0": rng.uniform(-200, W + 200), "y0": rng.uniform(-150, H + 150),
            "dx": rng.uniform(-60, 60), "dy": rng.uniform(-90, 90),
            "ph": rng.uniform(0, 6.28), "sp": rng.uniform(0.05, 0.16),
            "base": rng.uniform(0.05, 0.13),
        })
    return blobs


def draw_bokeh(canvas: np.ndarray, blobs, t: float) -> None:
    for b in blobs:
        ph = math.sin(b["ph"] + t * b["sp"] * 6.283)
        x = b["x0"] + b["dx"] * math.sin(t * 0.06 + b["ph"]) - b["a"].shape[1] / 2
        y = b["y0"] + b["dy"] * math.cos(t * 0.05 + b["ph"]) - b["a"].shape[0] / 2
        blit_add(canvas, b["rgb"], b["a"], x, y, b["base"] * (0.85 + 0.22 * ph))


def vignette(w: int, h: int, strength: float = 0.55) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h * 0.46
    d = np.sqrt(((xx - cx) / (w * 0.62)) ** 2 + ((yy - cy) / (h * 0.58)) ** 2)
    v = 1 - np.clip(d, 0, 1.6) ** 2 * strength
    return np.clip(v, 0.25, 1).astype(np.float32)[..., None]


def grain_tiles(n: int = 6, w: int = W, h: int = H, seed: int = 3):
    rng = np.random.default_rng(seed)
    tiles = []
    for _ in range(n):
        small = rng.normal(0.5, 0.16, (h // 3 + 1, w // 3 + 1)).astype(np.float32)
        img = Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8), "L").resize(
            (w, h), Image.BILINEAR)
        tiles.append(np.asarray(img, np.float32)[..., None] / 255.0)
    return tiles


# --------------------------------------------------------------------------- #
# Motifs utilitaires
# --------------------------------------------------------------------------- #
def ecg_path(width: float, amp: float, beats: float = 3.0, offset: float = 0.0):
    """Ligne d'électrocardiogramme stylisée (0..width, y centré, +y vers le bas)."""
    xs = np.linspace(0, width, 1400, dtype=np.float32)
    u = (xs / width) * beats + offset
    frac = u % 1.0
    y = np.zeros_like(xs)
    def bump(center, half, height):
        m = np.abs(frac - center) < half
        nz = np.where(m)[0]
        if len(nz):
            tt = (frac[nz] - (center - half)) / (2 * half)
            y[nz] += height * np.sin(tt * np.pi)
    bump(0.30, 0.030, -0.10 * amp)
    bump(0.36, 0.012, 0.34 * amp)
    bump(0.395, 0.012, -0.55 * amp)
    bump(0.43, 0.016, 1.00 * amp)
    bump(0.465, 0.018, -0.22 * amp)
    bump(0.58, 0.075, -0.30 * amp)
    return np.stack([xs, y], axis=1)


def pill_sprite(text: str, fnt, pad_x: float = 34, pad_y: float = 18,
                border=(0.55, 0.32, 0.42), dot=None, text_color=MUTED,
                radius_extra: float = 0.0, letterspacing: float = 3.0):
    """Pastille (pill) arrondie avec texte + point lumineux optionnel."""
    m = text_mask(text, fnt, letterspacing)
    th, tw = m.shape
    w = int(tw + 2 * pad_x + (46 if dot else 0))
    h = int(th + 2 * pad_y)
    r = int(h / 2 + radius_extra)
    ring = rounded_ring(w, h, r, 2.0)
    rgb_arr = np.zeros((h, w, 3), np.float32) + 0.0
    alpha = ring * 0.85
    inner = rounded_mask(w, h, r, 0.6)
    alpha = np.maximum(alpha, inner * 0.16)
    # texte
    tx = int(pad_x + (46 if dot else 0))
    tm = np.zeros((h, w), np.float32)
    tm[int(pad_y):int(pad_y) + th, tx:tx + tw] = m
    tc = np.asarray(text_color, np.float32).reshape(1, 1, 3)
    rgb_arr = rgb_arr * (1 - tm[..., None]) + tc * tm[..., None]
    alpha = np.clip(alpha * (1 - tm) + tm, 0, 1)
    if dot:
        cy, cx = h / 2, pad_x - 8
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        dot_a = np.clip(1 - d / 7.0, 0, 1) ** 1.2
        dot_rgb = np.broadcast_to(ROSE.reshape(1, 1, 3), (h, w, 3))
        rgb_arr = rgb_arr * (1 - dot_a[..., None]) + dot_rgb * dot_a[..., None]
        alpha = np.clip(alpha + dot_a * 0.95, 0, 1)
    # teinte rose-gold du contour
    br = np.asarray(border, np.float32).reshape(1, 1, 3)
    rgb_arr = np.where(ring[..., None] > 0.05, br * np.ones((1, 1, 3), np.float32),
                       rgb_arr)
    return rgb_arr.astype(np.float32), alpha.astype(np.float32)
