#!/usr/bin/env python3
"""
pipeline.py — finalise le teaser BUREAU ROSE en une commande.

  1. trouve la photo du portrait (par défaut : la plus récente de assets/incoming/) ;
  2. la prépare en carte 780x910 (cadrage sans déformation + étalonnage) ;
  3. lance le rendu MP4 9:16 complet avec ambiance sonore ;
  4. extrait la miniature de couverture (end card).

Exemples
--------
python3 pipeline.py                        # preset « serre », photo la plus récente
python3 pipeline.py --preset buste
python3 pipeline.py --photo "/chemin/Mme FALL.png"
python3 pipeline.py --photo photo.jpg --dry-run      # prépare seulement (aperçu)
"""
from __future__ import annotations

import argparse
import glob
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG_EXT = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp", "*.tif", "*.tiff")


def candidates():
    """Photos utilisables, de la plus récente à la plus ancienne."""
    found = []
    for sub in ("assets/incoming", "assets"):
        for ext in IMG_EXT:
            found += glob.glob(os.path.join(ROOT, sub, ext))
    return sorted({f for f in found if "placeholder" not in os.path.basename(f)
                   and "portrait_card" not in os.path.basename(f)},
                  key=os.path.getmtime, reverse=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Finalise le teaser Bureau Rose")
    ap.add_argument("--photo", default=None, help="photo du portrait (défaut : auto)")
    ap.add_argument("--preset", default="serre",
                    choices=["serre", "buste", "large", "centre"])
    ap.add_argument("--out", default=os.path.join(ROOT, "livrables",
                                                  "bureau-rose-teaser-9x16.mp4"))
    ap.add_argument("--cover-at", type=float, default=19.3)
    ap.add_argument("--dry-run", action="store_true", help="prépare la photo seulement")
    ap.add_argument("--scale", type=float, default=1.0)
    args = ap.parse_args(argv)

    photo = args.photo
    if not photo:
        found = candidates()
        if not found:
            print("Aucune photo trouvée.\n"
                  "→ Dépose la photo dans bureau-rose/assets/incoming/ "
                  "(ou utilise --photo /chemin/vers/photo.jpg).")
            return 2
        photo = found[0]
    print(f"[{time.strftime('%H:%M:%S')}] photo retenue : {os.path.relpath(photo, ROOT)}")
    for other in candidates()[1:4]:
        print(f"               (autre candidate ignorée : {os.path.relpath(other, ROOT)})")

    # 1) carte portrait ------------------------------------------------------ #
    cmd = [sys.executable, os.path.join(ROOT, "prepare_photo.py"),
           "--src", photo, "--preset", args.preset,
           "--out", os.path.join(ROOT, "assets", "portrait_card.png"),
           "--preview", os.path.join(ROOT, "livrables", "portrait-card-preview.jpg")]
    subprocess.run(cmd, check=True, cwd=ROOT)
    if args.dry_run:
        print("--dry-run : carte préparée, rendu non lancé.")
        return 0

    # 2) rendu complet ------------------------------------------------------- #
    cmd = [sys.executable, os.path.join(ROOT, "render.py"), "--out", args.out,
           "--cover-at", str(args.cover_at)]
    if args.scale != 1.0:
        cmd += ["--scale", str(args.scale)]
    subprocess.run(cmd, check=True, cwd=ROOT)

    # 3) récapitulatif ------------------------------------------------------- #
    print("\n=== LIVRABLES ===")
    for f in sorted(glob.glob(os.path.join(ROOT, "livrables", "*"))):
        if os.path.isfile(f):
            print(f"  {os.path.relpath(f, ROOT):60s} {os.path.getsize(f) / 1e6:6.1f} Mo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
