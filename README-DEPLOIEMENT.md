# Déploiement — Pointage biométrique

Cette application est une application Next.js full-stack utilisant PostgreSQL et Drizzle ORM.

## 1. PostgreSQL

Crée une base PostgreSQL chez Neon (ou un autre fournisseur PostgreSQL compatible), puis récupère sa chaîne de connexion.

Exemple de variable :

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Ne mets jamais cette valeur dans GitHub. Configure-la dans Vercel > Project > Settings > Environment Variables.

## 2. GitHub

Envoie le contenu de ce dossier dans un dépôt GitHub. Le fichier `package.json` doit être à la racine.

## 3. Vercel

Importe le dépôt GitHub dans Vercel.

Framework : Next.js
Build command : `npm run build`

Ajoute les variables d'environnement :

- `DATABASE_URL` = URL PostgreSQL Neon
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

## Important avant une utilisation réelle

Le projet fourni est une base de démonstration. Avant de l'utiliser avec de vrais employés, il faut notamment remplacer les mots de passe en clair par un vrai système de hash/session, sécuriser les routes API et mettre en place une vraie gestion des données biométriques.
