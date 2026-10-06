# Motion design — BioPointage RH

Teaser vertical (9:16) **entièrement généré par code** : chaque image est dessinée sur
canvas, la musique et le sound design sont synthétisés, le tout est encodé en MP4 par
ffmpeg. Aucun logiciel de montage, aucun asset externe, aucune bibliothèque de stock.

```
motion/
├── render.mjs            ← rendu complet → MP4 (1080×1920 + version web 720×1280)
├── src/
│   ├── theme.mjs         ← direction artistique (couleurs de l'app, cadence, marges)
│   ├── utils.mjs         ← maths, easings, couleurs, typographie (interlettrage, retours ligne)
│   ├── primitives.mjs    ← fonds, halos, grain, cartes, icônes dessinées à la main
│   ├── stage.mjs         ← décor persistant, particules, transitions, HUD
│   ├── fx.mjs            ← blocs animés (kinetic typo, compteurs, ondes, graphes)
│   ├── compose.mjs       ← assemblage d'une image : décor + plan + HUD + post-FX
│   ├── preview.mjs       ← aperçu PNG (itération rapide sur le cadrage)
│   ├── audio.mjs         ← musique + sound design + master (WAV)
│   └── scenes/           ← les 8 plans du teaser
├── fonts/                ← Poppins + JetBrains Mono (SIL OFL 1.1)
├── export/               ← MP4 livrés (+ page de prévisualisation)
└── build/                ← intermédiaires (ignorés par git)
```

## Produire la vidéo

```bash
cd motion
npm install              # une seule fois (@napi-rs/canvas)
node render.mjs --web    # MP4 principal + version allégée
```

Le binaire ffmpeg est embarqué dans `motion/bin/ffmpeg` (build statique GPL), il n'y a
donc rien à installer côté système.

### Autres commandes

```bash
node src/preview.mjs 4.2 9.6     # 2 images PNG à ces instants
node src/preview.mjs --all       # 1 image par plan
node src/preview.mjs --clean     # vide le dossier previews/
node src/audio.mjs               # regénère seulement la bande son
node render.mjs --audio          # regénère le son puis remonte la vidéo
```

## Montage (29,4 s)

| # | Plan | Début | Rôle |
|---|------|-------|------|
| 1 | Ouverture | 0,00 s | Logo : l'empreinte se construit, le wordmark se pose |
| 2 | Accroche | 2,15 s | « Fini les feuilles de présence. » → « Un doigt suffit. » |
| 3 | Borne biométrique | 5,10 s | Pointage réel : scan, vérification FIDO2, salarié reconnu |
| 4 | Sécurité | 10,65 s | Sans contrôle / avec BioPointage + journal d'audit |
| 5 | Tableau de bord DRH | 13,80 s | KPI temps réel, heures par département, derniers pointages |
| 6 | Suite RH | 18,40 s | Export paie, horaires, multi-sites, rôles, audit |
| 7 | Export paie | 23,40 s | Pipeline pointages → calcul → fichier, téléchargement |
| 8 | Signature | 26,40 s | Logo, promesse, appel à l'action |

Les plans se chevauchent de 0,45 s : chaque entrée enchaîne sur la sortie du précédent
(glissement + fondu), sans coupure noire.

## Design

- **Couleurs** : celles de l'application (`slate-950`, `cyan-500`, `emerald-500`), pour que
  la vidéo et le produit soient indiscernables.
- **Typographie** : Poppins (800 pour les titres, 500 pour le texte courant) et
  JetBrains Mono pour tout ce qui est chiffres, horodatages et logs.
- **Caméra** : chaque plan a sa propre enveloppe (montée + zoom d'entrée, léger push en
  sortie) ; le décor de fond bouge plus lentement que le premier plan → profondeur.
- **Finitions** : grain de film, scanlines discrètes, halos colorés, poussière lumineuse
  et vignettage. Tout est calculé à partir du temps `t`, jamais avec `Math.random()`,
  donc le rendu est **reproductible image par image**.

## Bande son

`src/audio.mjs` synthétise tout : nappe d'accords (Am–F–C–G), basse pulsée, arpèges,
kick, cymbales, risers et impacts, plus le sound design (whooshes de transition, accord
de validation, clic du bouton de téléchargement, confirmation). Chaîne de traitement :
espace (réverbération à délais), égalisation de présence, coupe infra, limiteur doux,
normalisation (crête −1,6 dBFS, RMS ≈ −16 dBFS).

Les packs sont calés sur les mêmes instants que le montage (`MARKS` dans `audio.mjs` et
`dur`/`OVERLAP` dans `compose.mjs`) : changez une durée de plan et la musique suit.

## Adapter

- **Palette / cadence** : `src/theme.mjs`.
- **Durées et ordre des plans** : le champ `dur` de chaque fichier `src/scenes/*.mjs`
  et le tableau `scenes` de `src/scenes/index.mjs`.
- **Textes** : directement dans les plans (les mots du kinetic typo sont des tableaux).
- **Version carrée ou 16:9** : `W`/`H` dans `theme.mjs` sont lus par tout le pipeline ;
  les plans utilisent des marges relatives, mais un cadrage horizontal demandera
  d'ajuster quelques positions verticales.

## Licences

- ffmpeg embarqué : build statique GPL (johnvansickle.com) — utilisable pour produire vos
  vidéos ; si vous redistribuez le binaire, gardez la licence GPL.
- Poppins et JetBrains Mono : SIL Open Font License 1.1 (`fonts/`).
