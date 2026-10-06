# Reconnaissance d'empreinte — comment ça marche (et pourquoi ça ne marchait pas)

## 1. Le diagnostic : il n'y avait aucune reconnaissance d'empreinte

Dans la version d'origine, le « lecteur biométrique » de la borne était une
animation : trois `setTimeout` puis un appel à `POST /api/punch` contenant
l'identifiant du salarié **sélectionné à la souris dans une liste**.

```
BiometricTerminal.tsx (ancien)                     api/punch/route.ts (ancien)
────────────────────────────────                   ────────────────────────────
setTimeout(... 400 ms  → "Capture optique")        const [emp] = select employees
setTimeout(... 850 ms  → "Extraction minuties")      where id = employeeId   ← envoyé par le navigateur
setTimeout(... 1300 ms → POST /api/punch     ───►  insert into punch_records
   { employeeId: 42, punchMethod: "FINGERPRINT" })  (aucune vérification)
```

Conséquences :

- **N'importe qui pouvait badger pour n'importe qui** : le nom du salarié était
  le seul « justificatif ». Un simple `curl` sur `/api/punch` suffisait, et
  l'interface proposait même la liste complète des salariés sur la borne.
- Le « gabarit » créé à l'enrôlement (`BIO-FP-XXXX`) était une chaîne aléatoire
  générée dans le navigateur, sans lien avec un doigt.
- L'« indice de confiance » (96-99 %) était un `Math.random()`.

Autrement dit : la couche biométrique était décorative, et la décision
d'accepter un pointage reposait entièrement sur le client — donc sur rien.

## 2. La reconnaissance réelle : WebAuthn / FIDO2

Un navigateur **n'a pas accès à un capteur d'empreinte** (heureusement : pas de
lecture de gabarits en JavaScript). La seule reconnaissance d'empreinte
authentique possible depuis une application web est donc de déléguer la lecture
et la vérification au capteur du poste via **WebAuthn (FIDO2)** : Touch ID,
Windows Hello, capteur Android, lecteur certifié FIDO2.

Le principe : **le capteur signe**, et **le serveur vérifie la signature**.

```
Enrôlement (une fois, sur le poste équipé du capteur)
  1. POST /api/biometrics/register/options   → le serveur envoie un défi signé (cookie HttpOnly HMAC)
  2. navigator.credentials.create()          → le capteur lit le doigt ET génère une paire de clés
  3. POST /api/biometrics/register/verify    → le serveur vérifie l'attestation puis stocke
                                               la CLÉ PUBLIQUE (table biometric_credentials)
  → le gabarit de l'empreinte ne quitte jamais la puce du capteur.

Pointage (à chaque badge)
  1. POST /api/biometrics/authenticate/options  → nouveau défi (mode identification ou nominatif)
  2. navigator.credentials.get()                → le capteur reconnaît le doigt et signe l'assertion
  3. POST /api/biometrics/authenticate/verify   → le serveur :
        • vérifie la signature avec la clé publique de l'enrôlement ;
        • vérifie l'origine (anti-hameçonnage) et le défi (anti-rejeu) ;
        • retrouve le salarié À PARTIR DU CREDENTIAL SIGNÉ (jamais d'un identifiant client) ;
        • incrémente le compteur anti-rejeu ;
        • enregistre le pointage (méthode WEBAUTHN, doigt vérifié, séquence de la journée).
```

Points clés :

| Exigence demandée au capteur | Pourquoi |
| --- | --- |
| `authenticatorAttachment: "platform"` | utilise le capteur intégré au poste, pas une clé USB externe |
| `userVerification: "required"` | le doigt (ou l'UV du système) doit être vérifié à chaque pointage |
| `residentKey: "required"` | permet l'identification **1:N** : le salarié n'a rien à sélectionner |
| `attestation: "none"` | aucune donnée constructeur transmise (minimisation RGPD) |

### Identification 1:N vs contrôle nominatif

- **Identification (par défaut)** : `allowCredentials` est vide. Le capteur
  cherche seul l'empreinte présentée parmi celles enrôlées sur le poste. Le
  salarié pose son doigt, la borne affiche **son** nom — il n'y a plus de liste
  dans laquelle choisir qui pointer.
- **Contrôle nominatif** : l'opérateur clique sur un salarié ; le serveur
  restreint le défi à *ses* credentials et refuse toute autre empreinte (403),
  même si le client est modifié.

## 3. Ce qui a été verrouillé côté serveur

- `POST /api/punch` **refuse désormais tout pointage biométrique** (403) : plus
  aucun `employeeId` forgé ne peut créer un pointage « empreinte ».
- Il ne reste que deux écritures non signées par un capteur :
  - `MANUAL_DRH` (régularisation RH, `isManual: true`) — tracée comme manuelle ;
  - `PIN_FALLBACK` (code salarié + PIN) — **tracée comme non biométrique**
    (`biometricConfidence = null`, note explicite dans l'historique).
- Séquence de la journée validée côté serveur : arrivée → pause → reprise →
  départ. Un départ sans arrivée, une double arrivée ou une reprise sans pause
  sont refusés (409).
- Anti double-scan : deux pointages à moins de 15 secondes sont refusés (429).
- Compteur anti-rejeu du capteur persisté : une assertion rejouée est refusée.
- Salarié désactivé → pointage refusé.
- Révocation RGPD : `DELETE /api/biometrics/credentials?id=…` supprime la clé
  publique ; le doigt ne peut plus badger, la fiche repasse « non enrôlée ».

## 4. Ce que la reconnaissance garantit… et ce qu'elle ne garantit pas

✅ **Garanti** : un pointage marqué `WEBAUTHN` a été signé par un capteur qui a
vérifié l'utilisateur, sur le domaine exact de l'application, avec une clé
publique enregistrée lors de l'enrôlement. Impossible à fabriquer depuis le
navigateur, un `curl` ou un autre site.

⚠️ **À connaître avant la mise en production** :

1. **Le capteur est lié au poste.** Une empreinte enrôlée sur le PC A ne
   fonctionne pas sur la borne B : enrôlez chaque salarié **sur la borne
   elle-même** (bouton « Enrôler » du terminal ou onglet Salariés).
2. **Windows Hello / macOS peuvent demander un PIN ou un visage** selon la
   configuration du poste : `userVerification: "required"` garantit une
   vérification utilisateur, pas nécessairement une empreinte. Pour exiger un
   doigt, utilisez un lecteur d'empreinte dédié (voir §7) ou configurez le poste
   en biométrie obligatoire.
3. **Borne partagée.** Un compte système partagé ne peut porter qu'un seul jeu
   de biométries : sur une borne unique partagée par 50 salariés, le chemin
   réellement adapté est un **lecteur d'empreinte USB** avec un agent local
   (§7). WebAuthn est parfait pour 1 poste = 1 salarié (BYOD, bureaux
   individuels, tablettes nominatives).
4. **Contexte sécurisé obligatoire** : HTTPS (ou `localhost`). Dans une iframe
   d'aperçu, le navigateur bloque WebAuthn — ouvrez l'application dans un onglet.
5. La RLS/authentification des écrans DRH reste à faire (mots de passe en clair
   dans la démo) : voir la note en fin de `README-DEPLOIEMENT.md`.

## 5. API

| Route | Rôle |
| --- | --- |
| `POST /api/biometrics/register/options` | défi d'enrôlement pour un salarié |
| `POST /api/biometrics/register/verify` | vérifie l'attestation, stocke la clé publique |
| `POST /api/biometrics/authenticate/options` | défi de pointage (`employeeId` optionnel = contrôle nominatif) |
| `POST /api/biometrics/authenticate/verify` | vérifie la signature, identifie le salarié, enregistre le pointage |
| `GET /api/biometrics/credentials?employeeId=…` | liste les empreintes enrôlées |
| `DELETE /api/biometrics/credentials?id=…` | révoque une empreinte (RGPD) |

Tables : `biometric_credentials` (clé publique, compteur, doigt, appareil,
dernier usage). Les défis WebAuthn transitent par un cookie `HttpOnly` signé
(HMAC, 5 min, usage unique) : rien à stocker côté serveur.

## 6. Développement et test

```bash
npm install
npm run db:local     # PostgreSQL local sans Docker (PGlite) sur 127.0.0.1:5432
npm run db:push      # crée / met à jour les tables
npm run dev          # http://localhost:3000  (WebAuthn exige localhost ou HTTPS)
curl -X POST http://localhost:3000/api/seed -H "x-seed-secret: $SEED_SECRET"
npm run test:biometric   # test de bout en bout avec un capteur biométrique simulé
```

Le test `npm run test:biometric` reproduit un capteur FIDO2 complet (paire de
clés P-256, CBOR, signatures ES256) et vérifie 40 assertions : enrôlement,
identification 1:N, refus d'un pointage forgé via `/api/punch`, refus d'une
signature produite par une autre clé, refus d'un rejeu, refus du pointage d'un
collègue en contrôle nominatif, séquence de la journée, repli PIN, révocation
RGPD. Il s'exécute contre une instance réelle de l'application.

## 7. Aller plus loin : lecteur d'empreinte USB dédié

Pour une borne unique partagée par de nombreux salariés, la chaîne recommandée est :

```
lecteur USB (ZKTeco / DigitalPersona / SecuGen / lecteur Windows Hello certifié)
        │  SDK du fabricant
        ▼
agent local sur la borne  ──►  galerie 1:N des gabarits (stockage chiffré local)
        │  HTTP signé (HMAC) + horodatage
        ▼
POST /api/biometrics/agent/punch   ← à implémenter si besoin (même logique que
                                      authenticate/verify : le serveur vérifie la
                                      preuve avant d'écrire le pointage)
```

L'architecture serveur actuelle est déjà prête pour ce branchement : la route de
pointage ne fait confiance à aucun identifiant client, elle n'accepte que ce qui
est prouvé. Un lecteur USB ne doit **jamais** poster directement un `employeeId`
sans preuve : c'est exactement la faille corrigée ici.
