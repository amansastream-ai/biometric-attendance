# Déploiement — Pointage biométrique

Cette application est une application Next.js full-stack utilisant PostgreSQL et Drizzle ORM.

> 🔐 **Sécurité** : le pointage par empreinte repose sur une **vraie vérification
> biométrique WebAuthn/FIDO2** (le capteur signe, le serveur vérifie) et les
> écrans DRH sont **protégés par authentification et rôles**. Voir
> [`README-BIOMETRIE.md`](./README-BIOMETRIE.md) (empreintes) et
> [`README-SECURITE.md`](./README-SECURITE.md) (comptes, rôles, sessions).

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
- `SESSION_TTL_HOURS` = durée de vie d'une session en heures (facultatif, 12 par défaut)

## 5 bis. Première utilisation : inscrire le premier administrateur

Sur une base **vide** (aucun compte), l'écran de connexion bascule
automatiquement en mode « première utilisation » : au lieu du formulaire de
connexion, il affiche l'inscription du **premier administrateur**.

- Le premier compte créé reçoit le rôle **Administrateur système** et ouvre une
  session immédiatement (même cookie HttpOnly qu'une connexion).
- Le mot de passe est haché (scrypt + sel) avant d'être écrit en base : jamais
  de valeur lisible.
- Dès que ce compte existe, le **portail d'inscription se ferme définitivement**
  (`POST /api/auth/signup` → 403, quel que soit l'email fourni) : les comptes
  suivants ne peuvent plus être créés que par un administrateur ou la DRH
  (onglet **Comptes & rôles**).
- Chaque tentative — succès, refus, échec de validation — est tracée dans le
  journal d'audit sous l'action `AUTH_SIGNUP`.

Pour tester ce flux de bout en bout (il vide la base puis la re-seede) :

```bash
npm run test:signup   # 43 vérifications attendues ✅
```

## 5 ter. Se connecter la première fois (instance avec seed)

L'application affiche un écran de connexion : **aucune donnée RH n'est accessible
sans compte**. Les comptes de démonstration créés par le seed sont :

| Email | Mot de passe | Rôle |
| --- | --- | --- |
| `admin@pointage-biometrique.fr` | `password123` | Administrateur système |
| `drh@pointage-biometrique.fr` | `password123` | Direction RH & Paie |
| `manager@pointage-biometrique.fr` | `password123` | Manager de pôle (lecture seule) |
| `kiosk@pointage-biometrique.fr` | `password123` | Borne de pointage |

**Avant toute utilisation réelle** : connecte-toi, ouvre le menu utilisateur →
« Modifier mon mot de passe », puis crée les comptes nominaux dans **Comptes &
rôles** et désactive ou supprime les comptes de démonstration. Les mots de passe
sont stockés hachés (scrypt + sel) et les sessions sont révocables
individuellement (désactiver un compte déconnecte immédiatement l'utilisateur).

## 5 quater. Protéger les comptes sensibles (second facteur)

Les rôles **administrateur** et **DRH** peuvent activer un second facteur : une
clé de sécurité WebAuthn du poste (Touch ID, Windows Hello, capteur Android, clé
USB FIDO2). Elle est demandée **en plus du mot de passe** à chaque connexion.

1. Se connecter, puis menu utilisateur (en haut à droite) → **« Sécurité du
   compte (second facteur) »** ;
2. saisir un nom de clé (ex. « MacBook de Nadia ») puis **« Enregistrer une clé
   de sécurité »** ;
3. valider avec le capteur du poste.

Une fois une clé enregistrée, la connexion se fait en deux temps : mot de passe,
puis validation par la clé. Points utiles :

- une **bannière** rappelle aux rôles sensibles qui n'ont pas encore de clé
  qu'ils doivent en enrôler une ;
- la **dernière clé** d'un compte sensible ne peut pas être révoquée : enrôlez la
  nouvelle avant de retirer l'ancienne ;
- clé perdue : un administrateur peut révoquer la clé depuis **Comptes & rôles**
  (l'utilisateur en enregistre une nouvelle à la connexion suivante) ;
- pour rendre le second facteur **obligatoire** (session restreinte à
  l'enrôlement tant qu'aucune clé n'est présente), ajoutez
  `TWO_FACTOR_POLICY=enforce` dans les variables d'environnement. À faire une
  fois les clés de l'administrateur et de la DRH enrôlées.

Le capteur ne transmet qu'une clé publique : aucune empreinte, aucun code, aucun
secret ne circule ni n'est stocké côté serveur.

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

Ce test simule un capteur FIDO2 réel et vérifie 46 assertions, dont le refus des
pointages biométriques forgés (l'ancienne faille), des signatures invalides, des
rejeux et des pointages au nom d'un collègue.

Les suites complémentaires couvrent les habilitations, la traçabilité et le
second facteur :

```bash
npm run test:auth     # 65 assertions : sessions, rôles, anti-force brute, garde-fous
npm run test:audit    # 65 assertions : journal d'audit, immuabilité, aucun secret en base
npm run test:twofa    # 76 assertions : clé de sécurité, anti-rejeu, session restreinte
```

## Important avant une utilisation réelle

Le projet fourni est une base de démonstration. Déjà en place : biométrie vérifiée
par le capteur, authentification, mots de passe hachés, rôles, sessions
révocables, protection anti-CSRF et anti-force brute, **journal d'audit en
écriture seule** consultable par l'administrateur et la DRH (onglet *Journal
d'audit*) et **second facteur** par clé de sécurité pour les rôles sensibles
(voir `README-SECURITE.md`).

Avant de l'utiliser avec de vrais employés, il reste notamment à :

- activer **HTTPS** partout (cookies `Secure`, biométrie, RGPD) et changer les
  comptes/mots de passe de démonstration ;
- définir une **durée de conservation du journal d'audit** (12 mois recommandés),
  avec export scellé avant purge : la conservation est aujourd'hui illimitée ;
- enrôler les clés de sécurité de l'administrateur et de la DRH (§5 ter), puis
  passer `TWO_FACTOR_POLICY=enforce` pour rendre le second facteur obligatoire ;
- déplacer la limitation des tentatives de connexion vers un stockage partagé
  (Redis/base) si l'application tourne sur plusieurs instances ;
- documenter la conformité RGPD : information des salariés, base légale,
  durée de conservation, procédure de révocation des empreintes
  (`DELETE /api/biometrics/credentials`) et alternative non biométrique ;
- pour une borne partagée par de nombreux salariés, prévoir un lecteur
  d'empreinte USB avec agent local (voir §7 de `README-BIOMETRIE.md`).
