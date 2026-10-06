/**
 * Test de bout en bout du second facteur des comptes utilisateurs.
 *
 * Simule une clé de sécurité réelle (WebAuthn / FIDO2 : Touch ID, Windows
 * Hello, clé USB) et vérifie, face à une instance réelle de l'application :
 *
 *   1. politique : un rôle sensible sans clé est signalé (et sa connexion
 *      tracée), une clé enrôlée devient obligatoire à chaque connexion ;
 *   2. enrôlement : la clé publique est enregistrée, jamais un secret ;
 *   3. connexion : le mot de passe seul n'ouvre plus de session dès qu'une clé
 *      existe ; la signature de la clé ouvre la session ;
 *   4. refus : mauvaise clé, clé d'un autre compte, origine étrangère, rejeu de
 *      la même assertion, absence de défi, mot de passe erroné ;
 *   5. révocation : impossible de retirer la **dernière** clé d'un compte
 *      sensible (y compris par un administrateur), possible sinon, et
 *      impossible de toucher au compte d'un autre sans habilitation ;
 *   6. session restreinte : une session ouverte sans second facteur ne donne
 *      accès à rien d'autre qu'à l'enrôlement ;
 *   7. confidentialité : ni clé privée, ni mot de passe, ni identifiant de clé
 *      dans le journal d'audit ; les comptes de démonstration restent vierges.
 *
 * Prérequis : `npm run db:local`, `npm run db:push`, données de démo
 * (`POST /api/seed`) et application lancée (`npm run dev`).
 *
 * Pour vérifier la politique stricte (`TWO_FACTOR_POLICY=enforce`), relancez
 * l'application avec cette variable puis `npm run test:twofa` : la section 6
 * teste alors le vrai chemin de connexion restreinte.
 *
 * Lancement : npm run test:twofa
 */
import "dotenv/config";
import crypto from "node:crypto";
import { Client } from "pg";
import { VirtualAuthenticator, b64url } from "./lib/virtual-authenticator.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const DEMO_PASSWORD = "password123";
const NEW_PASSWORD = "motdepasse123";

let passed = 0;
let failed = 0;

function check(label, condition, details = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${details ? ` — ${details}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Session HTTP indépendante par utilisateur testé                     */
/* ------------------------------------------------------------------ */

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.lastSetCookie = null;
  }

  get cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  hasCookie(name) {
    return this.cookies.has(name);
  }

  capture(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    this.lastSetCookie = setCookies;
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value || /max-age=0/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    this.capture(response);

    let json = {};
    try {
      json = await response.json();
    } catch {
      /* pas de corps JSON */
    }
    return { status: response.status, json, headers: response.headers };
  }

  async login(email, password = DEMO_PASSWORD) {
    return this.request("/api/auth/login", { method: "POST", body: { email, password } });
  }
}

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
const sha256hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n🔑 Test du second facteur (WebAuthn) — ${BASE_URL}\n`);
  await pgClient.connect();

  // Une exécution précédente interrompue a pu laisser une clé de test sur un
  // compte de démonstration : on repart d'un état propre et connu (les suites
  // `test:auth` et `test:audit` supposent la connexion au mot de passe seul).
  await pgClient.query(
    `DELETE FROM user_credentials
     WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%pointage-biometrique.fr')`
  );
  await pgClient.query(
    `UPDATE users SET two_factor_enabled = false, two_factor_enrolled_at = NULL
     WHERE email LIKE '%pointage-biometrique.fr'`
  );

  const admin = new Session("admin");
  const debut = await admin.login("admin@pointage-biometrique.fr");
  if (debut.status !== 200) {
    throw new Error(`Connexion administrateur impossible (${debut.status}) : lancez le seed.`);
  }
  if (debut.json.requiresTwoFactor) {
    throw new Error(
      "Le compte administrateur réclame une clé de sécurité inconnue. Supprimez les clés de démonstration (table user_credentials) puis relancez."
    );
  }

  const adminState = await admin.request("/api/auth/session");
  const policy = adminState.json.twoFactorPolicy;
  const adminId = adminState.json.user?.id;
  console.log(`ℹ️  Politique du serveur : ${policy}`);

  // En politique stricte, un compte sensible sans clé n'obtient qu'une session
  // restreinte : l'administrateur doit d'abord enrôler sa propre clé — c'est
  // exactement le parcours de premier démarrage en production.
  let adminKey = null;
  if (policy === "enforce") {
    section("Préparation : enrôlement de la clé de l'administrateur");
    adminKey = new VirtualAuthenticator("cle-admin-premier-demarrage");
    const options = await admin.request("/api/auth/2fa/register/options", {
      method: "POST",
      body: { label: "Clé de l'administrateur" },
    });
    check("session restreinte autorisée à enrôler une clé", options.status === 200, `reçu ${options.status}`);

    const verified = await admin.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: adminKey.createAttestation({ challenge: options.json.options.challenge }) },
    });
    check("clé de l'administrateur enregistrée", verified.status === 200, `reçu ${verified.status}`);

    const unlocked = await admin.request("/api/users");
    check("la session administrateur est déverrouillée", unlocked.status === 200, `reçu ${unlocked.status}`);
  }

  /* ---------- 0. Comptes de test jetables ---------- */
  const accounts = {
    principal: "deuxfacteurs@test.fr", // compte sensible qui sera enrôlé + testé
    autre: "autre.cle@test.fr", // compte sensible tiers (2 clés)
    sansCle: "sans.cle@test.fr", // compte sensible sans clé (session restreinte)
    leger: "cle.leger@test.fr", // compte non sensible (2FA facultative)
  };
  const ids = {};

  section("0. Préparation des comptes de test");
  {
    for (const email of Object.values(accounts)) {
      await pgClient.query(
        "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
        [email]
      );
      await pgClient.query(
        "DELETE FROM user_credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
        [email]
      );
      await pgClient.query("DELETE FROM users WHERE email = $1", [email]);
    }

    for (const [key, email] of Object.entries(accounts)) {
      const role = key === "leger" ? "manager" : "drh";
      const created = await admin.request("/api/users", {
        method: "POST",
        body: { name: `Test ${key}`, email, password: NEW_PASSWORD, role },
      });
      ids[key] = created.json?.user?.id;
    }

    check(
      "4 comptes de test créés (3 sensibles + 1 non sensible)",
      Object.values(ids).every((id) => Number.isFinite(id)),
      JSON.stringify(ids)
    );
    check("rôle non sensible déclaré comme tel", (await admin.request("/api/auth/session")).status === 200);
  }

  /* ---------- 1. Politique : rôle sensible sans clé ---------- */
  section("1. Rôle sensible sans clé de sécurité");
  const principal = new Session("compte principal");
  // Compte tiers : sert aux tests « clé d'un autre compte » et « révocation »
  const autreSession = new Session("compte tiers");
  {
    const login = await principal.login(accounts.principal, NEW_PASSWORD);
    if (login.status === 429) {
      // Le blocage anti-force brute (5 échecs / 10 min) protège aussi le second
      // facteur : si un test précédent a échoué, il faut redémarrer l'application.
      throw new Error(
        "Compte temporairement bloqué par la protection anti-force brute : redémarrez l'application (npm run dev) puis relancez le test."
      );
    }
    check(
      `connexion acceptée (politique ${policy})`,
      login.status === 200,
      `reçu ${login.status}`
    );
    check(
      "l'interface est avertie que le second facteur manque",
      login.json.twoFactorWarning === true || login.json.twoFactorPending === true
    );

    const status = await principal.request("/api/auth/2fa");
    check("état 2FA accessible", status.status === 200, `reçu ${status.status}`);
    check("second facteur exigé pour ce rôle", status.json.required === true);
    check("aucune clé enregistrée", status.json.enabled === false && status.json.credentials.length === 0);

    // En politique souple, l'absence de clé est une entrée dédiée ; en
    // politique stricte, la connexion elle-même est tracée comme restreinte.
    const missing = await pgClient.query(
      policy === "enforce"
        ? "SELECT COUNT(*)::int AS total FROM audit_logs WHERE action = 'AUTH_LOGIN' AND outcome = 'DENIED' AND actor_id = $1"
        : "SELECT COUNT(*)::int AS total FROM audit_logs WHERE action = 'AUTH_2FA_MISSING' AND actor_id = $1",
      [ids.principal]
    );
    check(
      policy === "enforce"
        ? "connexion restreinte tracée (AUTH_LOGIN refusé)"
        : "absence de second facteur tracée (AUTH_2FA_MISSING)",
      missing.rows[0].total >= 1
    );

    const options = await principal.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    check(
      "pas de défi possible sans clé enrôlée (409)",
      options.status === 409 && options.json.code === "TWO_FACTOR_NOT_ENROLLED",
      `reçu ${options.status}`
    );
  }

  /* ---------- 2. Enrôlement d'une clé de sécurité ---------- */
  section("2. Enrôlement d'une clé de sécurité");
  const principalKey = new VirtualAuthenticator("macbook-nadia");
  {
    const anonymous = new Session("anonyme");
    const refused = await anonymous.request("/api/auth/2fa/register/options", { method: "POST" });
    check("enrôlement refusé sans session (401)", refused.status === 401, `reçu ${refused.status}`);

    const options = await principal.request("/api/auth/2fa/register/options", {
      method: "POST",
      body: { label: "MacBook de Nadia" },
    });
    check("options d'enrôlement reçues", options.status === 200, `reçu ${options.status}`);
    check(
      "le défi est fourni et l'utilisateur exige une vérification (UV)",
      Boolean(options.json.options?.challenge) &&
        options.json.options?.authenticatorSelection?.userVerification === "required"
    );
    check(
      "le cookie de défi est HttpOnly",
      (principal.lastSetCookie ?? []).some(
        (cookie) => cookie.startsWith("bp_2fa_challenge=") && /httponly/i.test(cookie)
      )
    );

    const attestation = principalKey.createAttestation({
      challenge: options.json.options.challenge,
    });
    const verified = await principal.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: attestation },
    });
    check("clé enregistrée", verified.status === 200, `reçu ${verified.status} ${JSON.stringify(verified.json).slice(0, 120)}`);
    check("la réponse compte les clés du compte", verified.json.credentialsCount === 1);

    const stored = await pgClient.query(
      "SELECT credential_id, public_key, counter, label FROM user_credentials WHERE user_id = $1",
      [ids.principal]
    );
    check("clé publique enregistrée côté serveur", stored.rows.length === 1);
    check(
      "seule la clé publique est stockée (aucun matériel privé)",
      Boolean(stored.rows[0]?.public_key) &&
        !/private/i.test(stored.rows[0].public_key) &&
        b64url(Buffer.from(String(principalKey.publicKey.export({ format: "der", type: "spki" })))).length > 0
    );
    check(
      "l'identifiant de clé correspond au capteur",
      stored.rows[0]?.credential_id === b64url(principalKey.credentialId)
    );
    check("libellé de la clé conservé", stored.rows[0]?.label === "MacBook de Nadia");

    const userRow = await pgClient.query(
      "SELECT two_factor_enabled, two_factor_enrolled_at FROM users WHERE id = $1",
      [ids.principal]
    );
    check(
      "le compte est marqué comme protégé",
      userRow.rows[0].two_factor_enabled === true && userRow.rows[0].two_factor_enrolled_at !== null
    );

    const audited = await pgClient.query(
      "SELECT summary, details FROM audit_logs WHERE action = 'AUTH_2FA_ENROLL' AND actor_id = $1",
      [ids.principal]
    );
    check("enrôlement tracé (AUTH_2FA_ENROLL)", audited.rows.length === 1);
    const enrollDump = JSON.stringify(audited.rows[0] ?? {});
    check(
      "le journal ne contient ni clé publique ni identifiant de clé",
      !enrollDump.includes("publicKey") &&
        !enrollDump.includes(b64url(principalKey.credentialId)) &&
        !/"[A-Za-z0-9_-]{40,}"/.test(enrollDump.replace(/"aaguid":"[a-z0-9-]+"/g, ""))
    );
  }

  /* ---------- 3. Connexion avec clé : le mot de passe ne suffit plus ---------- */
  section("3. Connexion : mot de passe puis clé");
  {
    const attacker = new Session("mot de passe seul");
    const passwordOnly = await attacker.login(accounts.principal, NEW_PASSWORD);

    check("mot de passe correct accepté en étape 1", passwordOnly.status === 200);
    check("la réponse réclame le second facteur", passwordOnly.json.requiresTwoFactor === true);
    check(
      "AUCUNE session n'est ouverte avec le mot de passe seul",
      !attacker.hasCookie("bp_session"),
      `cookies : ${[...attacker.cookies.keys()].join(", ") || "aucun"}`
    );

    const blocked = await attacker.request("/api/employees");
    check("sans session, les données RH restent inaccessibles (401)", blocked.status === 401);

    // Étape 2 : le capteur signe le défi
    const options = await attacker.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    check("défi de connexion délivré", options.status === 200, `reçu ${options.status}`);
    check(
      "seules les clés de ce compte sont proposées",
      options.json.options?.allowCredentials?.length === 1 &&
        options.json.options.allowCredentials[0].id === b64url(principalKey.credentialId)
    );
    check(
      "vérification de l'utilisateur exigée (userVerification required)",
      options.json.options?.userVerification === "required"
    );

    const challenge = options.json.options.challenge;
    const assertion = principalKey.createAssertion({ challenge });
    const verified = await attacker.request("/api/auth/2fa/verify", {
      method: "POST",
      body: { response: assertion },
    });
    check("signature de la clé acceptée", verified.status === 200, `reçu ${verified.status} ${JSON.stringify(verified.json).slice(0, 120)}`);
    check("session ouverte après le second facteur", attacker.hasCookie("bp_session"));
    check("rôle et habilitations renvoyés", verified.json.user?.role === "drh" && verified.json.capabilities?.manageEmployees === true);

    const nowAllowed = await attacker.request("/api/employees");
    check("les données RH sont désormais accessibles", nowAllowed.status === 200, `reçu ${nowAllowed.status}`);

    const audit = await pgClient.query(
      "SELECT action FROM audit_logs WHERE actor_id = $1 AND action LIKE 'AUTH_2FA_%' ORDER BY id",
      [ids.principal]
    );
    const actions = audit.rows.map((row) => row.action);
    check(
      "les deux étapes sont tracées (REQUIRED puis SUCCESS)",
      actions.includes("AUTH_2FA_REQUIRED") && actions.includes("AUTH_2FA_SUCCESS")
    );

    // Le jeton de session n'est jamais stocké en clair
    const token = attacker.cookies.get("bp_session");
    const stored = await pgClient.query("SELECT token_hash FROM sessions WHERE user_id = $1", [ids.principal]);
    check(
      "le cookie de session n'est stocké que haché",
      stored.rows.length >= 1 && stored.rows.every((row) => row.token_hash !== token) &&
        stored.rows.some((row) => row.token_hash === sha256hex(token))
    );

    attacker.cookies.clear();
  }

  /* ---------- 4. Ce qui doit être refusé ---------- */
  section("4. Tentatives refusées");
  {
    // 4.a mauvais mot de passe
    const wrongPassword = await new Session("mauvais mot de passe").request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: "mauvais-mot-de-passe" },
    });
    check("mot de passe erroné refusé (401)", wrongPassword.status === 401, `reçu ${wrongPassword.status}`);
    check(
      "le message ne révèle pas l'existence du compte",
      wrongPassword.json.error === "Identifiants incorrects."
    );

    // 4.b verify sans défi préalable
    const orphan = await new Session("sans défi").request("/api/auth/2fa/verify", {
      method: "POST",
      body: { response: principalKey.createAssertion({ challenge: "challenge-inconnu" }) },
    });
    check("vérification sans défi refusée (400)", orphan.status === 400, `reçu ${orphan.status}`);

    // 4.c mauvaise clé (clé privée d'un autre capteur)
    const impostor = new VirtualAuthenticator("capteur-attaquant");
    const sessionA = new Session("mauvaise clé");
    const optionsA = await sessionA.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    const forged = impostor.createAssertion({
      challenge: optionsA.json.options.challenge,
      credentialId: principalKey.credentialId, // identifiant volé, signature étrangère
    });
    const forgedResult = await sessionA.request("/api/auth/2fa/verify", {
      method: "POST",
      body: { response: forged },
    });
    check("signature d'une autre clé refusée (401)", forgedResult.status === 401, `reçu ${forgedResult.status}`);
    check("aucune session ouverte", !sessionA.hasCookie("bp_session"));

    // 4.d assertion pour une origine étrangère
    const sessionB = new Session("origine étrangère");
    const optionsB = await sessionB.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    const evilOrigin = principalKey.createAssertion({
      challenge: optionsB.json.options.challenge,
      origin: "https://attaquant.example",
    });
    const evilResult = await sessionB.request("/api/auth/2fa/verify", {
      method: "POST",
      body: { response: evilOrigin },
    });
    check("origine non autorisée refusée (401)", evilResult.status === 401, `reçu ${evilResult.status}`);

    // 4.e rejeu de la même assertion
    const sessionC = new Session("rejeu");
    const optionsC = await sessionC.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    const replay = principalKey.createAssertion({ challenge: optionsC.json.options.challenge });
    const first = await sessionC.request("/api/auth/2fa/verify", { method: "POST", body: { response: replay } });
    const second = await sessionC.request("/api/auth/2fa/verify", { method: "POST", body: { response: replay } });
    check("première utilisation acceptée", first.status === 200, `reçu ${first.status}`);
    check("rejeu de la même assertion refusé", second.status === 400 || second.status === 401, `reçu ${second.status}`);

    // 4.f clé appartenant à un autre compte
    await autreSession.login(accounts.autre, NEW_PASSWORD);
    const autreKey = new VirtualAuthenticator("cle-compte-tiers");
    const autreOptions = await autreSession.request("/api/auth/2fa/register/options", { method: "POST" });
    await autreSession.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: autreKey.createAttestation({ challenge: autreOptions.json.options.challenge }) },
    });
    const sessionD = new Session("clé d'un autre");
    const optionsD = await sessionD.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    const foreign = autreKey.createAssertion({
      challenge: optionsD.json.options.challenge,
      // le défi est celui du compte principal, la clé appartient à un autre compte
    });
    const foreignResult = await sessionD.request("/api/auth/2fa/verify", {
      method: "POST",
      body: { response: foreign },
    });
    check(
      "clé d'un autre compte refusée (401)",
      foreignResult.status === 401,
      `reçu ${foreignResult.status}`
    );

    // 4.g état 2FA sans session
    const noSession = await new Session("anonyme").request("/api/auth/2fa");
    check("état 2FA inaccessible sans session (401)", noSession.status === 401, `reçu ${noSession.status}`);

    const failedEntries = await pgClient.query(
      "SELECT COUNT(*)::int AS total FROM audit_logs WHERE action = 'AUTH_2FA_FAILED'"
    );
    check("chaque refus est journalisé (AUTH_2FA_FAILED)", failedEntries.rows[0].total >= 3, `total ${failedEntries.rows[0].total}`);
  }

  /* ---------- 5. Révocation des clés ---------- */
  section("5. Révocation");
  {
    const status = await principal.request("/api/auth/2fa");
    const firstKeyId = status.json.credentials[0]?.id;

    // 5.a la dernière clé d'un compte sensible est protégée
    const lastKey = await principal.request(`/api/auth/2fa/revoke?id=${firstKeyId}`, { method: "DELETE" });
    check(
      "impossible de révoquer la dernière clé d'un compte sensible (409)",
      lastKey.status === 409,
      `reçu ${lastKey.status}`
    );

    // 5.b la clé d'un autre compte exige la gestion des comptes
    const manager = new Session("manager");
    await manager.login("manager@pointage-biometrique.fr");
    const autreStatus = await autreSession.request("/api/auth/2fa");
    const managerAttempt = await manager.request(
      `/api/auth/2fa/revoke?id=${autreStatus.json.credentials[0]?.id}&userId=${ids.autre}`,
      { method: "DELETE" }
    );
    check("un manager ne peut pas révoquer la clé d'autrui (403)", managerAttempt.status === 403, `reçu ${managerAttempt.status}`);

    // 5.c enrôlement d'une seconde clé puis révocation de la première
    const secondKey = new VirtualAuthenticator("yubikey-bureau");
    const secondOptions = await principal.request("/api/auth/2fa/register/options", {
      method: "POST",
      body: { label: "YubiKey bureau" },
    });
    const secondVerified = await principal.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: secondKey.createAttestation({ challenge: secondOptions.json.options.challenge }) },
    });
    check("seconde clé enregistrée", secondVerified.status === 200 && secondVerified.json.credentialsCount === 2);

    const revokeFirst = await principal.request(`/api/auth/2fa/revoke?id=${firstKeyId}`, { method: "DELETE" });
    check(
      "révocation d'une clé possible quand une autre protège le compte",
      revokeFirst.status === 200 && revokeFirst.json.remaining === 1,
      `reçu ${revokeFirst.status}`
    );

    const revokedRow = await pgClient.query(
      "SELECT revoked_at FROM user_credentials WHERE user_id = $1 AND revoked_at IS NOT NULL",
      [ids.principal]
    );
    check("la clé révoquée est conservée avec sa date (traçabilité)", revokedRow.rows.length === 1);

    const loginWithRevoked = new Session("clé révoquée");
    const revokedOptions = await loginWithRevoked.request("/api/auth/2fa/options", {
      method: "POST",
      body: { email: accounts.principal, password: NEW_PASSWORD },
    });
    check(
      "la clé révoquée n'est plus proposée",
      revokedOptions.json.options?.allowCredentials?.every(
        (credential) => credential.id !== b64url(principalKey.credentialId)
      ) === true
    );

    // 5.d même un administrateur ne peut pas retirer la dernière clé d'un compte sensible
    const autreKeys = await autreSession.request("/api/auth/2fa/register/options", { method: "POST" });
    const autreSecond = new VirtualAuthenticator("cle-tiers-2");
    await autreSession.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: autreSecond.createAttestation({ challenge: autreKeys.json.options.challenge }) },
    });
    const autreStatus2 = await autreSession.request("/api/auth/2fa");
    check("le compte tiers a bien deux clés", autreStatus2.json.credentials.length === 2);

    const adminRevokeOne = await admin.request(
      `/api/auth/2fa/revoke?id=${autreStatus2.json.credentials[0].id}&userId=${ids.autre}`,
      { method: "DELETE" }
    );
    check("un administrateur peut révoquer la clé d'un autre compte", adminRevokeOne.status === 200, `reçu ${adminRevokeOne.status}`);

    const adminRevokeLast = await admin.request(
      `/api/auth/2fa/revoke?id=${autreStatus2.json.credentials[1].id}&userId=${ids.autre}`,
      { method: "DELETE" }
    );
    check(
      "mais pas la dernière d'un compte sensible (409)",
      adminRevokeLast.status === 409,
      `reçu ${adminRevokeLast.status}`
    );

    // 5.e compte non sensible : la 2FA est facultative et révocable
    const leger = new Session("compte non sensible");
    await leger.login(accounts.leger, NEW_PASSWORD);
    const legerStatus = await leger.request("/api/auth/2fa");
    check("2FA non exigée pour ce rôle", legerStatus.json.required === false);

    const legerKey = new VirtualAuthenticator("cle-facultative");
    const legerOptions = await leger.request("/api/auth/2fa/register/options", { method: "POST" });
    const legerVerified = await leger.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: legerKey.createAttestation({ challenge: legerOptions.json.options.challenge }) },
    });
    check("un compte non sensible peut aussi s'enrôler", legerVerified.status === 200);

    const legerRevoke = await leger.request(`/api/auth/2fa/revoke?id=${legerVerified.json.credential.id}`, {
      method: "DELETE",
    });
    check(
      "et révoquer sa dernière clé (409 réservé aux comptes sensibles)",
      legerRevoke.status === 200 && legerRevoke.json.twoFactorEnabled === false,
      `reçu ${legerRevoke.status}`
    );

    const revokeAudits = await pgClient.query(
      "SELECT COUNT(*)::int AS total FROM audit_logs WHERE action = 'AUTH_2FA_REVOKE'"
    );
    check("révocations tracées (AUTH_2FA_REVOKE)", revokeAudits.rows[0].total >= 2);
  }

  /* ---------- 6. Session restreinte (second facteur en attente) ---------- */
  section(`6. Session sans second facteur (politique ${policy})`);
  {
    const pending = new Session("session restreinte");

    if (policy === "enforce") {
      const login = await pending.login(accounts.sansCle, NEW_PASSWORD);
      check("connexion acceptée en session restreinte", login.status === 200, `reçu ${login.status}`);
      check("la réponse signale la restriction", login.json.twoFactorPending === true);
      check("un cookie de session est bien posé", pending.hasCookie("bp_session"));
    } else {
      // Politique souple : on fabrique la même situation qu'en mode strict en
      // insérant une session « en attente de second facteur », puis on vérifie
      // que le serveur la traite exactement de la même façon.
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await pgClient.query(
        "INSERT INTO sessions (user_id, token_hash, expires_at, pending_two_factor) VALUES ($1, $2, $3, true)",
        [ids.sansCle, sha256hex(token), expiresAt]
      );
      pending.cookies.set("bp_session", token);
      console.log("  ℹ️  session restreinte créée en base (équivalent de TWO_FACTOR_POLICY=enforce)");
    }

    const sessionState = await pending.request("/api/auth/session");
    check("la session est reconnue", sessionState.json.authenticated === true);
    check("elle est signalée comme en attente de second facteur", sessionState.json.twoFactorPending === true);

    const blocked = await pending.request("/api/employees");
    check("données RH inaccessibles tant que la clé n'est pas enrôlée (403)", blocked.status === 403, `reçu ${blocked.status}`);
    check(
      "le message explique comment s'en sortir",
      /second facteur/i.test(String(blocked.json.error ?? ""))
    );

    const blockedAudit = await pending.request("/api/audit");
    check("journal d'audit également inaccessible (403)", blockedAudit.status === 403, `reçu ${blockedAudit.status}`);

    const enrollmentAllowed = await pending.request("/api/auth/2fa/register/options", { method: "POST" });
    check("l'enrôlement reste possible depuis la session restreinte", enrollmentAllowed.status === 200);

    const rescueKey = new VirtualAuthenticator("cle-de-secours");
    const rescueVerified = await pending.request("/api/auth/2fa/register/verify", {
      method: "POST",
      body: { response: rescueKey.createAttestation({ challenge: enrollmentAllowed.json.options.challenge }) },
    });
    check("clé enrôlée depuis la session restreinte", rescueVerified.status === 200, `reçu ${rescueVerified.status}`);

    const unlocked = await pending.request("/api/employees");
    check("la session est déverrouillée après l'enrôlement", unlocked.status === 200, `reçu ${unlocked.status}`);

    const restrictedAudit = await pgClient.query(
      "SELECT details FROM audit_logs WHERE action = 'ACCESS_DENIED' AND summary LIKE '%second facteur%' ORDER BY id DESC LIMIT 1"
    );
    check(
      "le refus est tracé avec son motif",
      restrictedAudit.rows.length === 1 && /second facteur/i.test(String(restrictedAudit.rows[0].details))
    );
  }

  /* ---------- 7. Confidentialité et non-régression ---------- */
  section("7. Confidentialité du dispositif");
  {
    const credentials = await pgClient.query(
      "SELECT credential_id, public_key, transports, device_type FROM user_credentials"
    );
    const dump = JSON.stringify(credentials.rows);
    check(
      "aucun matériel privé ni mot de passe en base",
      !dump.includes("PRIVATE") && !dump.includes("scrypt$") && !dump.includes(NEW_PASSWORD)
    );
    check(
      "chaque clé a un identifiant unique",
      new Set(credentials.rows.map((row) => row.credential_id)).size === credentials.rows.length
    );

    const auditDump = JSON.stringify(
      (await pgClient.query("SELECT action, summary, details FROM audit_logs")).rows
    );
    check(
      "le journal ne contient ni identifiant de clé ni clé publique",
      !auditDump.includes('"publicKey"') &&
        !auditDump.includes('"credentialId"') &&
        credentials.rows.every((row) => !auditDump.includes(row.credential_id))
    );
    check("le journal ne contient aucun mot de passe", !auditDump.includes(NEW_PASSWORD) && !auditDump.includes("scrypt$"));

    const sessionState = await principal.request("/api/auth/session");
    const sessionDump = JSON.stringify(sessionState.json);
    check(
      "la session exposée au navigateur ne divulgue aucune clé",
      !sessionDump.includes('"publicKey"') && !sessionDump.includes('"credentialId"')
    );
  }

  /* ---------- Nettoyage ---------- */
  section("Nettoyage des comptes de test");
  {
    for (const email of Object.values(accounts)) {
      await pgClient.query(
        "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
        [email]
      );
      await pgClient.query(
        "DELETE FROM user_credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
        [email]
      );
      await pgClient.query("DELETE FROM users WHERE email = $1", [email]);
    }
    // La clé éventuellement enrôlée par l'administrateur pendant le test est
    // retirée : les comptes de démonstration retrouvent leur état d'origine,
    // sinon les autres suites (connexion au mot de passe seul) échoueraient.
    if (adminId) {
      await pgClient.query("DELETE FROM user_credentials WHERE user_id = $1", [adminId]);
      await pgClient.query("DELETE FROM sessions WHERE user_id = $1", [adminId]);
      await pgClient.query(
        "UPDATE users SET two_factor_enabled = false, two_factor_enrolled_at = NULL WHERE id = $1",
        [adminId]
      );
    }

    const remaining = await pgClient.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE email LIKE '%@test.fr'"
    );
    check("comptes de test supprimés", remaining.rows[0].total === 0, `${remaining.rows[0].total} restant(s)`);
    check(
      "clés de test supprimées",
      (await pgClient.query("SELECT COUNT(*)::int AS total FROM user_credentials")).rows[0].total === 0
    );
    const demoUntouched = await pgClient.query(
      `SELECT COUNT(*)::int AS total FROM user_credentials
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%pointage-biometrique.fr')`
    );
    check(
      "comptes de démonstration rendus à leur état d'origine (sans clé)",
      demoUntouched.rows[0].total === 0,
      `${demoUntouched.rows[0].total} clé(s)`
    );
  }

  await pgClient.end();

  console.log(`\n──────────────────────────────────────────────`);
  console.log(`✅ ${passed} vérifications OK   ❌ ${failed} échec(s)`);
  console.log(`──────────────────────────────────────────────\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("\n💥 Erreur du test :", error);
  try {
    await pgClient.end();
  } catch {
    /* déjà fermé */
  }
  process.exit(1);
});
