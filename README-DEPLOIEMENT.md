# Déploiement — Pointage biométrique

Cette application est une application Next.js full-stack utilisant PostgreSQL et Drizzle ORM.

> 🔐 **Nouveauté importante** : le pointage par empreinte repose désormais sur une
> **vraie vérification biométrique WebAuthn/FIDO2** (le capteur signe, le serveur
> vérifie). Voir [`README-BIOMETRIE.md`](./README-BIOMETRIE.md) pour le
> fonctionnement, les limites et le modèle de sécurité.

## 1. PostgreSQL

Crée une base PostgreSQL chez Neon (ou un autre fournisseur PostgreSQL compatible), puis récupère sa chaîne de connexion.

Exemple de variable :

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Ne mets jamais cette valeur dans GitHub. Configure-la dans Vercel > Project > Settings > Environment Variables.

### Développer sans base distante

Un PostgreSQL local (PGlite, sans Docker) est fourni :

```bash
npm run db:local   # démarre la base sur 127.0.0.1:5432
npm run db:push    # crée les tables
npm run dev        # http://localhost:3000
```

Puis, dans `.env` (voir `.env.example`) :

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
WEBAUTHN_SECRET=une-longue-valeur-aleatoire   # signature des défis biométriques
SEED_SECRET=une-autre-valeur-secrete
```

## 2. GitHub

Envoie le contenu de ce dossier dans un dépôt GitHub. Le fichier `package.json` doit être à la racine.

## 3. Vercel

Importe le dépôt GitHub dans Vercel.

Framework : Next.js
Build command : `npm run build`

Ajoute les variables d'environnement :

- `DATABASE_URL` = URL PostgreSQL Neon
- `WEBAUTHN_SECRET` = une longue valeur secrète (obligatoire : elle signe les défis d'enrôlement et de pointage)
- `SEED_SECRET` = une longue valeur secrète de ton choix

## 4. Créer les tables PostgreSQL

Après avoir configuré `DATABASE_URL` sur ton ordinateur, tu peux synchroniser le schéma avec :

```bash
npm install
npm run db:push
```

Tu peux aussi utiliser Drizzle Kit avec une connexion PostgreSQL distante.

## 5. Charger les données de démonstration

Après le premier déploiement Vercel, appelle `/api/seed` avec l'en-tête :

```text
x-seed-secret: TA_VALEUR_SEED_SECRET
```

Exemple avec curl :

```bash
curl -X POST https://TON-DOMAINE.vercel.app/api/seed \
  -H "x-seed-secret: TA_VALEUR_SEED_SECRET"
```

Le seed ne s'exécute que si la base ne contient pas déjà d'utilisateur.

## 6. Enrôler les empreintes (après le seed)

Le jeu de démonstration ne contient **aucune empreinte** : un gabarit ne peut
être créé que par un vrai capteur. Pour rendre la borne opérationnelle :

1. ouvrez l'application **sur le poste qui possède le capteur d'empreinte**
   (ordinateur avec Touch ID / Windows Hello, tablette, borne équipée d'un
   lecteur FIDO2) — en HTTPS ou sur `localhost` ;
2. onglet **Salariés** → **Enrôler** (ou bouton *Enrôler* directement sur la borne) ;
3. le salarié pose son doigt : le capteur crée la clé, le serveur enregistre la
   clé publique ;
4. recommencez pour chaque salarié **sur ce même poste**.

Sans capteur disponible, le pointage reste possible en **repli code salarié +
PIN** (clairement tracé comme non biométrique dans l'historique) — utile pour les
tests et les postes non équipés.

## 7. Vérifier que la biométrie fonctionne

```bash
npm run test:biometric
```

Ce test simule un capteur FIDO2 réel et vérifie 40 assertions, dont le refus des
pointages biométriques forgés (l'ancienne faille), des signatures invalides, des
rejeux et des pointages au nom d'un collègue.

## Important avant une utilisation réelle

Le projet fourni est une base de démonstration. Avant de l'utiliser avec de vrais employés, il faut notamment :

- remplacer les mots de passe en clair par un vrai système de hash/session et
  protéger les écrans DRH (la biométrie est vérifiée, mais l'accès à
  l'administration ne l'est pas encore) ;
- sécuriser les routes API (authentification, rôles, journalisation) ;
- documenter la conformité RGPD : information des salariés, base légale,
  durée de conservation, procédure de révocation des empreintes
  (`DELETE /api/biometrics/credentials`) et alternative non biométrique ;
- pour une borne partagée par de nombreux salariés, prévoir un lecteur
  d'empreinte USB avec agent local (voir §7 de `README-BIOMETRIE.md`).
