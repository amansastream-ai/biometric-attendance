# Sécurité & habilitations

Ce document décrit le modèle d'accès de BioPointage : qui peut voir quoi, comment
l'identité est prouvée, et ce qui reste à faire avant une mise en production réelle.

## 1. Ce qui a été corrigé

| Avant | Après |
| --- | --- |
| `POST /api/auth` acceptait **n'importe quel mot de passe** (`password123` ou celui fourni) pour n'importe quel compte | Vérification scrypt + sel, message d'erreur identique que le compte existe ou non |
| Mots de passe stockés **en clair** dans `users.password` | Empreintes scrypt (`scrypt$N$r$p$sel$empreinte`), migration transparente à la première connexion |
| Le Navbar permettait de **devenir DRH en un clic** (« changer de rôle » de démo) | L'identité vient uniquement de la session serveur ; le navigateur ne peut pas la déclarer |
| Toutes les routes API étaient **ouvertes** (données de paie, exports CSV, suppressions) | Gardes `requireActor()` sur toutes les routes : 401 sans session, 403 si le rôle ne suffit pas |
| L'auteur d'un pointage manuel était choisi par le client (`manualEditedBy`) | Repris de la session : impossible à falsifier |
| Aucune protection contre les tentatives répétées ni contre le CSRF | Blocage 10 min après 5 échecs, contrôle d'origine sur toute écriture |
| Aucune trace des actions sensibles (seul l'auteur d'un pointage manuel était conservé) | **Journal d'audit** en base (connexions, modifications RH, pointages, empreintes, exports), en écriture seule, sans aucun secret |
| Un mot de passe volé suffisait pour entrer dans les écrans RH | **Second facteur** (clé de sécurité WebAuthn : Touch ID, Windows Hello, clé USB FIDO2) exigé pour les rôles administrateur et DRH |

## 2. Qui peut faire quoi

| Capacité | Administrateur | Direction RH | Manager de pôle | Borne |
| --- | :-: | :-: | :-: | :-: |
| Consulter le tableau de bord, les pointages, les feuilles d'heures | ✅ | ✅ | ✅ | ❌ |
| Utiliser la borne de pointage (empreinte / repli PIN) | ✅ | ✅ | ✅ | ✅ |
| Créer / modifier un salarié | ✅ | ✅ | ❌ | ❌ |
| Supprimer (salariés, pointages, pôles, envois) | ✅ | ✅ | ❌ | ❌ |
| Enrôler / révoquer une empreinte | ✅ | ✅ | ❌ | ❌ |
| Régulariser un pointage (saisie manuelle) | ✅ | ✅ | ❌ | ❌ |
| Gérer les pôles & horaires | ✅ | ✅ | ❌ | ❌ |
| Envoyer les fichiers de présence | ✅ | ✅ | ❌ | ❌ |
| Gérer les comptes utilisateurs | ✅ | ✅ (sauf comptes admin) | ❌ | ❌ |
| Nommer un administrateur | ✅ | ❌ | ❌ | ❌ |
| Consulter le journal d'audit | ✅ | ✅ | ❌ | ❌ |
| Second facteur (clé de sécurité) | **obligatoire** | **obligatoire** | facultatif | facultatif |

La matrice est définie une seule fois dans `src/lib/permissions.ts` et utilisée
**côté serveur** (gardes API) comme côté navigateur (affichage). Le navigateur ne
décide jamais : masquer un bouton n'est qu'un confort, la route refuse de toute
façon.

## 3. Sessions

- Jeton aléatoire de 32 octets, transmis dans un cookie **HttpOnly**,
  `SameSite=Lax`, `Secure` en production, durée 12 h (`SESSION_TTL_HOURS`).
- Seul le **haché** du jeton est stocké (`sessions.token_hash`) : la session peut
  donc être révoquée instantanément (déconnexion, changement de mot de passe,
  désactivation, changement de rôle).
- Toute écriture exige une **origine identique** (défense CSRF en plus du cookie).
- Le serveur vérifie la session à chaque requête : aucune donnée d'identité ne
  circule dans le navigateur (ni rôle, ni identifiant d'utilisateur faisant foi).

## 4. Exploitation

| Besoin | Comment |
| --- | --- |
| Créer le tout premier compte (instance vierge) | À la première visite, l'écran de connexion affiche l'inscription du premier administrateur (`POST /api/auth/signup`) ; le portail se ferme définitivement dès le premier compte créé |
| Créer un compte | Onglet **Comptes & rôles** → « Nouveau compte » (ou `POST /api/users`) |
| Réinitialiser un mot de passe | Icône clé dans la liste des comptes → nouveau mot de passe communiqué à l'utilisateur, qui le change ensuite |
| Déconnecter quelqu'un immédiatement | Désactiver le compte (bascule) ou changer son mot de passe : toutes ses sessions sont révoquées |
| Retrouver qui a modifié un pointage | Colonne « Manuel : … » dans Pointages & présences : l'auteur est le compte connecté |
| Retrouver qui a fait quoi, et quand | Onglet **Journal d'audit** (administrateur et DRH) : filtres par action, résultat, auteur, période et recherche libre |
| Ajouter le second facteur d'un compte | Menu utilisateur → « Sécurité du compte (second facteur) » → « Enregistrer une clé de sécurité » |
| Clé de sécurité perdue | **Comptes & rôles** : révoquer la clé du compte concerné, puis la personne en enrôle une nouvelle |
| Réinitialiser les données de démo | Bouton de la barre supérieure (rôles RH) ou `POST /api/seed` avec `x-seed-secret` |

Après un `npm run db:push` sur une base issue de l'ancienne version, les mots de
passe en clair existants sont automatiquement convertis en scrypt à la première
connexion réussie.

## 5. Journal d'audit

Chaque action sensible écrit une ligne dans `audit_logs` : auteur (identifiant,
nom, rôle), action, entité concernée, résultat (`SUCCESS`, `DENIED`, `FAILED`),
résumé en français, détails expurgés, adresse IP, navigateur et horodatage.

| Ce qui est tracé | Codes d'action |
| --- | --- |
| Connexions (réussie, échouée, bloquée) et déconnexions | `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOGIN_BLOCKED`, `AUTH_LOGOUT` |
| Inscription du premier administrateur (portail à usage unique, ouvert tant que la table `users` est vide) | `AUTH_SIGNUP` |
| Changement de mot de passe | `AUTH_PASSWORD_CHANGE` |
| Comptes utilisateurs (création, modification, suppression) | `USER_CREATE`, `USER_UPDATE`, `USER_DELETE` |
| Salariés et pôles (création, modification, suppression) | `EMPLOYEE_*`, `DEPARTMENT_*` |
| Pointages : régularisation RH, modification, suppression, repli PIN | `PUNCH_MANUAL_CREATE`, `PUNCH_MANUAL_UPDATE`, `PUNCH_DELETE`, `PUNCH_PIN_FALLBACK` |
| Biométrie : enrôlement, révocation, pointage vérifié, refus | `BIOMETRIC_ENROLL`, `BIOMETRIC_REVOKE`, `BIOMETRIC_PUNCH`, `BIOMETRIC_REJECTED` |
| Fichiers de présence et exports de paie | `REPORT_DISPATCH`, `REPORT_DELETE`, `DATA_EXPORT` |
| Réinitialisation des données de démo, tentatives refusées | `SEED_RESET`, `ACCESS_DENIED` |

Trois règles structurent ce journal :

1. **Écriture seule.** Aucune route ne permet de modifier ni de supprimer une
   entrée : `GET /api/audit` (filtres `action`, `outcome`, `actorId`, `entityId`,
   `q`, `from`, `to`, `limit`, `offset`) est la seule opération exposée ; `PUT`,
   `PATCH` et `DELETE` répondent 405. Une correction se fait uniquement par un
   accès direct à la base (DBA), avec sauvegarde.
2. **Aucun secret.** Les mots de passe, codes PIN, jetons de session, clés
   publiques et identifiants d'empreinte ne sont jamais transmis au journal.
   `redactDetails()` remplace par `•••` toute clé sensible qui aurait été passée
   par erreur, et les tests vérifient qu'aucun de ces éléments n'apparaît en base.
3. **Jamais bloquant.** `recordAudit()` n'échoue jamais : si l'écriture de la
   trace est impossible, l'incident est écrit dans les logs serveur et l'action
   métier se poursuit.

Lecture réservée aux rôles **administrateur** et **DRH** ; le manager et la borne
reçoivent un 403, lui-même tracé en `ACCESS_DENIED`. Le détail technique (IP, agent
utilisateur, identifiants) est replié par défaut dans l'interface.

## 6. Second facteur (clé de sécurité)

Le mot de passe seul ne protège pas un compte qui donne accès aux salaires et
aux données de paie. Les rôles **administrateur** et **DRH** disposent donc d'un
second facteur : une clé WebAuthn du poste de travail (Touch ID, Windows Hello,
capteur Android, clé USB FIDO2). Le serveur ne conserve que la **clé publique** ;
le gabarit biométrique et la clé privée ne quittent jamais l'appareil.

**Comment ça marche**

| Étape | Route | Ce qui se passe |
| --- | --- | --- |
| 1. Mot de passe | `POST /api/auth/login` | Vérifié (scrypt). Si une clé est enrôlée, **aucune session n'est créée** : la réponse réclame le second facteur. |
| 2. Défi | `POST /api/auth/2fa/options` | Le mot de passe est revérifié, un défi est signé et scellé dans un cookie HttpOnly (5 min). Seules les clés **de ce compte** sont proposées. |
| 3. Signature | `POST /api/auth/2fa/verify` | Le serveur vérifie la signature, l'origine, le domaine et le compteur anti-rejeu, **puis** ouvre la session. |
| Enrôlement | `POST /api/auth/2fa/register/*` | Ajout d'une clé depuis le menu utilisateur → « Sécurité du compte ». |
| Révocation | `DELETE /api/auth/2fa/revoke` | Perte ou remplacement d'une clé ; clé jamais supprimée, seulement datée (`revoked_at`). |

**Politique serveur** (`TWO_FACTOR_POLICY`)

- `prompt` (défaut) : une clé enrôlée est obligatoire à la connexion ; un compte
  sensible qui n'en a pas encore est signalé (bannière + entrée de journal
  `AUTH_2FA_MISSING`) mais peut se connecter pour aller en enrôler une.
- `enforce` : un compte sensible sans clé n'obtient qu'une **session
  restreinte** — l'enrôlement est la seule action possible, tout le reste
  répond 403. C'est le réglage à utiliser en production, une fois les clés
  distribuées.

**Garde-fous**

- La **dernière** clé d'un compte sensible ne peut pas être révoquée, même par
  un administrateur : enrôlez la nouvelle clé d'abord.
- Révoguer la clé d'un autre compte exige l'habilitation « gérer les comptes ».
- Un compte désactivé, un défi expiré, une clé d'un autre utilisateur, une
  signature d'un autre capteur, une origine étrangère et un rejeu de la même
  assertion sont refusés et tracés (`AUTH_2FA_FAILED`).
- Clé perdue : un administrateur révoque la clé depuis le compte concerné
  (`?userId=`), l'utilisateur en enrôle une nouvelle à la connexion suivante.

Toutes les étapes sont journalisées : `AUTH_2FA_REQUIRED`, `AUTH_2FA_SUCCESS`,
`AUTH_2FA_FAILED`, `AUTH_2FA_BLOCKED`, `AUTH_2FA_ENROLL`, `AUTH_2FA_REVOKE` et
`AUTH_2FA_MISSING`. Ni la clé publique, ni l'identifiant de clé, ni un mot de
passe n'y figurent — vérifié par les tests.

## 7. Variables d'environnement

```env
DATABASE_URL=postgresql://…
WEBAUTHN_SECRET=…        # signe les défis biométriques (obligatoire en production)
SEED_SECRET=…            # protège la réinitialisation des données de démo
SESSION_TTL_HOURS=12     # facultatif
TWO_FACTOR_POLICY=prompt # prompt (défaut) | enforce (production)
```

Si `WEBAUTHN_SECRET` et `SEED_SECRET` sont absents, une clé de développement est
utilisée : acceptable en local, **à proscrire en production**.

## 8. Reste à faire avant une utilisation réelle

1. **HTTPS obligatoire** (cookies `Secure`, biométrie, RGPD).
2. **Purge / archivage du journal d'audit** : la conservation est aujourd'hui
   illimitée. Définir une durée (12 mois recommandés), un export scellé avant
   purge, et retirer les adresses IP si elles ne sont pas nécessaires.
3. **Basculer `TWO_FACTOR_POLICY=enforce`** une fois les clés de sécurité des
   administrateurs et de la DRH enrôlées (aujourd'hui, la politique est
   « recommandée » pour ne pas bloquer la démonstration).
4. **Limitation de débit** au niveau de l'hébergeur (le blocage actuel est en
   mémoire du processus, donc remis à zéro à chaque redéploiement ou en cas de
   plusieurs instances).
5. **Politique de mots de passe** renforcée si le contexte l'exige (longueur,
   rotation, interdiction des mots de passe compromis).
6. **Accès des salariés à leurs propres données** (aujourd'hui, seuls les rôles
   RH existent ; un salarié ne peut pas consulter ses heures).
7. **Conformité RGPD** : information des salariés, base légale, durée de
   conservation, procédure de révocation des empreintes
   (`DELETE /api/biometrics/credentials`) et alternative non biométrique
   (repli code + PIN, déjà tracé comme non biométrique).

## 9. Tests automatisés

```bash
npm run test:auth        # 65 vérifications : accès, rôles, sessions, abus, garde-fous
npm run test:biometric   # 46 vérifications : capteur WebAuthn, anti-forge, anti-rejeu
npm run test:audit       # 65 vérifications : accès au journal, immuabilité, secrets, filtres
npm run test:twofa       # 76 vérifications : second facteur, anti-rejeu, session restreinte
npm run test:signup      # 43 vérifications : instance vierge, validation, CSRF, scrypt, portail fermé
```

En politique stricte (`TWO_FACTOR_POLICY=enforce npm run dev`), la suite 2FA
vérifie en plus le parcours réel de premier démarrage (l'administrateur enrôle
sa clé depuis une session restreinte) : **82 vérifications**.

Les quatre suites s'exécutent contre une instance réelle de l'application et
couvrent notamment : refus d'accès sans session, refus d'un mauvais mot de passe,
cloisonnement manager / borne, blocage après tentatives répétées, refus CSRF,
révocation des sessions, protection du dernier administrateur, refus d'un
pointage biométrique forgé, refus d'un pointage au nom d'un collègue, refus de
toute connexion sans la clé de sécurité dès qu'un compte sensible en possède
une, et vérification que chaque action sensible laisse une trace exploitable —
sans jamais y écrire un mot de passe, un PIN, une clé privée ou un gabarit
biométrique.
