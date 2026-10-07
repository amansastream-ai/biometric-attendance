#!/usr/bin/env python3
"""Portrait de substitution (élégant) utilisé tant que la vraie photo n'est pas fournie."""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 1400


def main():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    y = yy / H
    top = np.array([0.98, 0.86, 0.91], np.float32)
    bot = np.array([0.80, 0.55, 0.70], np.float32)
    img = top.reshape(1, 1, 3) * (1 - y[..., None]) + bot.reshape(1, 1, 3) * y[..., None]
    d = np.sqrt(((xx - W * 0.5) / (W * 0.75)) ** 2 + ((yy - H * 0.22) / (H * 0.6)) ** 2)
    img += np.clip(1 - d, 0, 1)[..., None] ** 2 * np.array([0.14, 0.06, 0.09], np.float32)

    base = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    cx = W // 2
    # halo derrière le sujet
    dr.ellipse([cx - 430, 120, cx + 430, 1080], fill=(255, 236, 244, 90))
    # buste
    dr.rounded_rectangle([cx - 360, 880, cx + 360, H + 120], radius=260,
                         fill=(58, 20, 42, 255))
    # épaules fondues
    dr.ellipse([cx - 430, 940, cx + 430, H + 320], fill=(58, 20, 42, 255))
    # cou
    dr.rounded_rectangle([cx - 78, 700, cx + 78, 950], radius=40, fill=(58, 20, 42, 255))
    # tête
    dr.ellipse([cx - 205, 210, cx + 205, 760], fill=(58, 20, 42, 255))
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    out = Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")

    arr = np.asarray(out, np.float32) / 255.0
    rng = np.random.default_rng(4)
    arr += rng.normal(0, 0.012, arr.shape[:2])[..., None]
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    arr *= np.clip(1 - r ** 2 * 0.35, 0.45, 1)[..., None]
    out = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGB")
    path = os.path.join(ROOT, "assets", "placeholder_portrait.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path)
    print("placeholder ->", path, out.size)


if __name__ == "__main__":
    main()
