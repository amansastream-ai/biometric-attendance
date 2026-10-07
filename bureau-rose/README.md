# BUREAU ROSE — teaser motion design 9:16

Teaser vertical (1080×1920, 30 fps, 21 s, avec ambiance sonore) pour la mini-série
**BUREAU ROSE** — sensibilisation au cancer du sein et du col de l'utérus — autour du
portrait de **Mme FALL, directrice de LAMEX INSTITUT**, avec annonce de l'épisode 1
le **samedi 10 octobre 2026**.

> ⚠️ En attente de la photo officielle de Mme Fall : le rendu actuel utilise un portrait
> de substitution (`assets/placeholder_portrait.png`) uniquement pour valider la mise en page.

## Livrable

| Fichier | Description |
|---|---|
| `livrables/bureau-rose-teaser-9x16.mp4` | Vidéo finale H.264 + AAC, 1080×1920, prête pour TikTok / Reels / Shorts |
| `livrables/bureau-rose-teaser-9x16-cover-*.jpg` | Miniature (end card) |
| `livrables/audio.m4a` | Piste audio seule (remplaçable par un son tendance) |

## Structure du teaser (21 s)

| Temps | Séquence | Contenu |
|---|---|---|
| 0 – 3,4 s | Accroche | Ruban de sensibilisation en filigrane + titre « BUREAU ROSE » (révélation lettre par lettre) + « MINI-SÉRIE DE SENSIBILISATION — CANCER DU SEIN & DU COL DE L'UTÉRUS » |
| 3,4 – 10,4 s | Portrait | Photo **fixe** de Mme Fall dans un cadre éditorial animé (coins, liseré, balayage lumineux) — visage jamais déformé ni animé — légende : « Mme FALL — DIRECTRICE, LAMEX INSTITUT » + pastilles PARLER / SENSIBILISER / ACCOMPAGNER |
| 10,4 – 16,3 s | Message | Ligne ECG animée + « Le dépistage précoce sauve des vies. » + « PARLONS-EN. DANS L'ENTREPRISE, EN FAMILLE, PARTOUT. » |
| 16,3 – 21 s | Carte de fin | Ruban + wordmark + **ÉPISODE 1 — SAMEDI 10 OCTOBRE 2026** (plaque animée) + « ABONNE-TOI POUR NE RIEN MANQUER » + hashtags |

## Personnaliser

Tout le texte est en haut de `render.py` (constantes `KICKER`, `TITLE`, `NAME`, `ROLE`,
`CHIPS`, `MSG_L1`, `MSG_L2`, `MSG_SUB`, `DAYNAME`, `DATE`, `CTA`, `HASHTAGS`) ;
les temps sont dans le dictionnaire `T`.

## Rendu

```bash
# 1) déposer la photo officielle
cp /chemin/photo-mme-fall.jpg assets/portrait.jpg

# 2) rendu final (≈ 3 min 30 sur ce sandbox)
python3 render.py

# options utiles
python3 render.py --scale 0.5                 # aperçu rapide
python3 render.py --dump "2.4,7.9,19.2"       # images fixes de contrôle
python3 render.py --only 5.0 6.5              # extrait
python3 render.py --no-audio                  # version muette
python3 render.py --cover-at 19.3             # + miniature
```

Dépendances : Python 3 + `numpy`, `Pillow`, `imageio-ffmpeg` (ffmpeg embarqué).
Polices : Montserrat + Playfair Display (subset « latin »), dans `assets/fonts/`.

## Cadrage de la photo

Le script fait un **cover-crop** vers 780×910 (aucune déformation) puis cadre la tête
dans le tiers supérieur. Idéalement : portrait vertical, visage centré, lumière douce,
fond neutre — mais tout format fonctionne.
