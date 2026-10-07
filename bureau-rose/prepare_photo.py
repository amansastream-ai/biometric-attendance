#!/usr/bin/env python3
"""
prepare_photo.py — prépare le portrait pour la carte du teaser BUREAU ROSE.

  • recadrage « cover » vers le format de la carte (780x910) SANS déformation ;
  • cadrage intelligent : le visage (détection par teintes de peau) est placé au
    point voulu, avec décalage possible (règle du regard) ;
  • étalonnage éditorial léger : balance des blancs, contraste, saturation,
    accentuation, vignettage interne → la photo s'intègre au décor prune/rose ;
  • option --watermark pour écarter une zone (ex. filigrane en bas à droite).

Exemples
--------
python3 prepare_photo.py --src "/chemin/Mme FALL.png"
python3 prepare_photo.py --src photo.jpg --zoom 1.15 --focus-x 0.46 --rule-of-gaze right
python3 prepare_photo.py --src photo.jpg --no-smart            # cadrage centré simple
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
CARD_W, CARD_H = 780, 910          # format de la carte dans le montage
SS = 2                             # rendu à 2x puis réduction (netteté)


# --------------------------------------------------------------------------- #
def skin_mask(arr: np.ndarray) -> np.ndarray:
    """Heuristique de détection de peau (RGB) — suffisante pour cadrer un visage."""
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    m = ((r > 0.20) & (g > 0.12) & (b > 0.06)
         & (r >= g) & (g >= b - 0.02)
         & ((mx - mn) > 0.03)
         & (r - g > 0.02) & (r - g < 0.45)
         & (r / np.maximum(mx, 1e-6) > 0.45))
    # nettoyage : on ne garde que les zones un peu denses
    m = m.astype(np.float32)
    img = Image.fromarray((m * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(max(2, arr.shape[1] // 150)))
    m = np.asarray(img, np.float32) / 255.0
    return m > 0.35


def skin_focus(arr: np.ndarray):
    """Centre de gravité + boîte englobante de la zone de peau (coordonnées normalisées)."""
    m = skin_mask(arr)
    ys, xs = np.where(m)
    h, w = arr.shape[:2]
    if len(xs) < (w * h) * 0.002:
        return None
    # on limite au plus grand amas verticalement (le visage) via la médiane pondérée
    x0, x1 = np.percentile(xs, [12, 88])
    y0, y1 = np.percentile(ys, [12, 88])
    cx = float(np.mean(xs[(xs >= x0) & (xs <= x1)])) / w
    cy = float(np.mean(ys[(ys >= y0) & (ys <= y1)])) / h
    return {"cx": cx, "cy": cy,
            "box": (x0 / w, y0 / h, x1 / w, y1 / h),
            "density": float(len(xs)) / (w * h)}


# --------------------------------------------------------------------------- #
def white_balance(arr: np.ndarray, target=(0.955, 0.925, 0.945), max_gain=0.18):
    """Balance des blancs auto (percentile clair) avec cible légèrement rosée."""
    flat = arr.reshape(-1, 3)
    ref = np.percentile(flat, 96, axis=0)
    ref = np.maximum(ref, 0.05)
    gains = np.asarray(target, np.float32) / ref
    gains = np.clip(gains, 1 - max_gain, 1 + max_gain)
    return np.clip(arr * gains.reshape(1, 1, 3), 0, 1), gains


def grade(arr: np.ndarray, contrast=1.07, sat=0.92, lift=0.012):
    """Étalonnage doux : contraste, saturation, léger voile prune dans les ombres."""
    out = (arr - 0.5) * contrast + 0.5
    lum = out @ np.array([0.299, 0.587, 0.114], np.float32)
    out = lum[..., None] + (out - lum[..., None]) * sat
    # ombres légèrement froides/prune, hautes lumières chaudes (split-tone discret)
    shadow_tint = np.array([0.98, 0.94, 1.0], np.float32)
    high_tint = np.array([1.012, 0.996, 0.994], np.float32)
    t = np.clip(lum[..., None], 0, 1)
    out = out * (shadow_tint * (1 - t) + high_tint * t)
    out = out + lift * (1 - t) * np.array([0.10, 0.0, 0.10], np.float32)
    return np.clip(out, 0, 1)


def inner_vignette(arr: np.ndarray, strength=0.20, top_shade=0.06):
    """Assombrit légèrement les bords pour asseoir la photo dans le cadre."""
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h * 0.44
    d = np.sqrt(((xx - cx) / (w * 0.60)) ** 2 + ((yy - cy) / (h * 0.58)) ** 2)
    v = 1 - np.clip(d, 0, 1.5) ** 2.2 * strength
    v = v * (1 - top_shade * np.clip((cy - yy) / (h * 0.5), 0, 1))
    return np.clip(arr * v[..., None], 0, 1)


# --------------------------------------------------------------------------- #
def crop_window(iw, ih, out_w, out_h, focus, anchor_x, anchor_y, zoom, rule):
    """Calcule la fenêtre de recadrage (cover) en pixel source."""
    base = max(out_w / iw, out_h / ih) * zoom
    sw, sh = iw * base, ih * base                      # taille après mise à l'échelle

    if focus is not None:
        fx, fy = focus["cx"], focus["cy"]
        # règle du regard : elle regarde vers la droite → on décale le visage à gauche
        if rule == "right":
            tx = 0.44
        elif rule == "left":
            tx = 0.56
        else:
            tx = 0.50
    else:
        fx, fy, tx = anchor_x, anchor_y, anchor_x

    left = fx * sw - tx * out_w
    top = fy * sh - anchor_y * out_h
    left = float(np.clip(left, 0, max(0, sw - out_w)))
    top = float(np.clip(top, 0, max(0, sh - out_h)))
    return base, left, top


def main(argv=None):
    ap = argparse.ArgumentParser(description="Prépare le portrait de la carte Bureau Rose")
    ap.add_argument("--src", required=True, help="photo d'origine (tout format)")
    ap.add_argument("--out", default=os.path.join(ROOT, "assets", "portrait_card.png"))
    ap.add_argument("--preview", default=os.path.join(ROOT, "livrables", "portrait-card-preview.jpg"))
    ap.add_argument("--anchor-x", type=float, default=0.5)
    ap.add_argument("--anchor-y", type=float, default=0.44)
    ap.add_argument("--zoom", type=float, default=1.0)
    ap.add_argument("--rule-of-gaze", choices=["right", "left", "none"], default="right")
    ap.add_argument("--no-smart", action="store_true", help="désactive la détection de visage")
    ap.add_argument("--no-grade", action="store_true")
    ap.add_argument("--sharpen", type=float, default=1.0)
    args = ap.parse_args(argv)

    im = Image.open(args.src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im).convert("RGB")
    else:
        im = im.convert("RGB")
    iw, ih = im.size
    src = np.asarray(im, np.float32) / 255.0
    print(f"source : {iw}x{ih}  ({iw / ih:.2f}:1)")

    focus = None if args.no_smart else skin_focus(src)
    if focus:
        print(f"  visage détecté : centre ({focus['cx']:.2f}, {focus['cy']:.2f})  "
              f"densité peau {focus['density'] * 100:.1f}%")
    else:
        print("  pas de détection de visage → cadrage paramétré")

    ow, oh = CARD_W * SS, CARD_H * SS
    base, left, top = crop_window(iw, ih, ow, oh, focus, args.anchor_x, args.anchor_y,
                                  args.zoom, args.rule_of_gaze)
    print(f"  échelle x{base:.3f}  fenêtre ({left:.0f}, {top:.0f})")

    resample = Image.LANCZOS
    big = im.resize((int(round(iw * base)), int(round(ih * base))), resample)
    card = big.crop((int(round(left)), int(round(top)),
                     int(round(left)) + ow, int(round(top)) + oh))

    arr = np.asarray(card, np.float32) / 255.0
    if not args.no_grade:
        arr, gains = white_balance(arr)
        print(f"  balance des blancs gains R{gains[0]:.3f} V{gains[1]:.3f} B{gains[2]:.3f}")
        arr = grade(arr)
    if args.sharpen > 0:
        pil = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
        pil = pil.filter(ImageFilter.UnsharpMask(radius=int(2.4 * SS),
                                                 percent=int(52 * args.sharpen),
                                                 threshold=3))
        arr = np.asarray(pil, np.float32) / 255.0
    arr = inner_vignette(arr)

    out_img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize(
        (CARD_W, CARD_H), Image.LANCZOS)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out_img.save(args.out)
    os.makedirs(os.path.dirname(args.preview), exist_ok=True)
    out_img.save(args.preview, quality=92)
    print(f"✔ carte portrait : {args.out}  ({CARD_W}x{CARD_H})")
    print(f"✔ aperçu        : {args.preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
