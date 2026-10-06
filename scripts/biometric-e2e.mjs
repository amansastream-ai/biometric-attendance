/**
 * Test de bout en bout du pointage biométrique.
 *
 * Simule un capteur d'empreinte FIDO2/WebAuthn (paire de clés P-256 + CBOR)
 * et vérifie, face à une instance réelle de l'application :
 *
 *   1. l'enrôlement d'une empreinte (clé publique enregistrée côté serveur) ;
 *   2. l'identification 1:N : le doigt présenté désigne le bon salarié ;
 *   3. le refus des pointages biométriques forgés (ancienne faille) ;
 *   4. le refus d'une signature produite par une autre clé ;
 *   5. le refus d'un rejeu de la même assertion ;
 *   6. le contrôle nominatif (un doigt ne peut pas pointer pour un collègue) ;
 *   7. la séquence arrivée → pause → reprise → départ + anti double-scan ;
 *   8. le repli code + PIN (et le refus d'un mauvais PIN) ;
 *   9. la régularisation DRH toujours autorisée ;
 *  10. la révocation RGPD d'une empreinte.
 *
 * Prérequis : base démarrée (`npm run db:local`), schéma poussé (`npm run db:push`),
 * données de démo (`POST /api/seed`) et application lancée (`npm run dev`).
 *
 * Lancement : npm run test:biometric
 */
import "dotenv/config";
import crypto from "node:crypto";
import { Client } from "pg";
import { VirtualAuthenticator, b64url } from "./lib/virtual-authenticator.mjs";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const ORIGIN = process.env.E2E_ORIGIN || BASE_URL;
const RP_ID = new URL(BASE_URL).hostname;

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
/* Client HTTP avec gestion des cookies (défi WebAuthn signé)          */
/* ------------------------------------------------------------------ */

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  capture(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value || /max-age=0/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

const jar = new CookieJar();

/** Requête sans session (pour vérifier que les routes protégées répondent 401). */
async function anonymousApi(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await response.json();
  } catch {
    /* pas de corps JSON */
  }
  return { status: response.status, json };
}

/** Ouvre une session (le cookie est conservé dans le pot commun). */
async function login(email, password) {
  return api("/api/auth/login", { method: "POST", body: { email, password } });
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(jar.header() ? { Cookie: jar.header() } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar.capture(response);

  let json = {};
  try {
    json = await response.json();
  } catch {
    /* réponse sans corps JSON */
  }
  return { status: response.status, json };
}

/* ------------------------------------------------------------------ */
/* Utilitaires base de données (pour horodater les pointages de test)  */
/* ------------------------------------------------------------------ */

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

async function backdateLastPunch(employeeId, minutes = 5) {
  await pgClient.query(
    `UPDATE punch_records SET punch_time = punch_time - ($2 || ' minutes')::interval
     WHERE id = (SELECT id FROM punch_records WHERE employee_id = $1 ORDER BY punch_time DESC LIMIT 1)`,
    [employeeId, String(minutes)]
  );
}

/** Repart d'une journée vierge pour un scénario déterministe. */
async function resetTodayPunches(employeeIds) {
  await pgClient.query(
    `DELETE FROM punch_records
     WHERE employee_id = ANY($1::int[]) AND punch_time >= date_trunc('day', now())`,
    [employeeIds]
  );
}

/** Supprime les empreintes enrôlées par d'anciens tests. */
async function resetCredentials(employeeIds) {
  await pgClient.query(`DELETE FROM biometric_credentials WHERE employee_id = ANY($1::int[])`, [
    employeeIds,
  ]);
  await pgClient.query(
    `UPDATE employees SET fingerprint_enrolled = false, fingerprint_template_id = NULL,
     fingerprint_registered_at = NULL WHERE id = ANY($1::int[])`,
    [employeeIds]
  );
}

async function lastPunchInfo(employeeId) {
  const result = await pgClient.query(
    `SELECT type, punch_time, (now() - punch_time) AS elapsed
     FROM punch_records WHERE employee_id = $1 ORDER BY punch_time DESC LIMIT 1`,
    [employeeId]
  );
  return result.rows[0] ?? null;
}

async function enrolledCredentialCount(employeeId) {
  const result = await pgClient.query(
    "SELECT count(*)::int AS count FROM biometric_credentials WHERE employee_id = $1",
    [employeeId]
  );
  return result.rows[0].count;
}

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n🧪 Test biométrique — ${BASE_URL} (RP ID: ${RP_ID})\n`);
  await pgClient.connect();

  /* ---------- 0. Accès protégé ---------- */
  section("0. Le pointage biométrique exige une session authentifiée");
  {
    const employees = await anonymousApi("/api/employees");
    check("données salariés refusées sans session (401)", employees.status === 401, `reçu ${employees.status}`);

    const registerOptions = await anonymousApi("/api/biometrics/register/options", {
      method: "POST",
      body: { employeeId: 1 },
    });
    check(
      "enrôlement biométrique refusé sans session (401)",
      registerOptions.status === 401,
      `reçu ${registerOptions.status}`
    );

    const authenticateOptions = await anonymousApi("/api/biometrics/authenticate/options", {
      method: "POST",
      body: {},
    });
    check(
      "pointage refusé sans session (401)",
      authenticateOptions.status === 401,
      `reçu ${authenticateOptions.status}`
    );

    // CSRF : une origine étrangère est refusée même avec des identifiants valides
    const crossOrigin = await anonymousApi("/api/auth/login", {
      method: "POST",
      headers: { Origin: "https://attaquant.example" },
      body: { email: "drh@pointage-biometrique.fr", password: "password123" },
    });
    check("connexion depuis une origine étrangère refusée (403)", crossOrigin.status === 403);

    const badLogin = await login("drh@pointage-biometrique.fr", "mauvais-mot-de-passe");
    check("connexion avec un mauvais mot de passe refusée (401)", badLogin.status === 401);

    const goodLogin = await login("drh@pointage-biometrique.fr", "password123");
    check(
      "connexion DRH réussie (session ouverte)",
      goodLogin.status === 200 && goodLogin.json.success === true,
      JSON.stringify(goodLogin.json).slice(0, 160)
    );
  }

  const employeesResponse = await api("/api/employees");
  const employees = employeesResponse.json.employees || [];
  if (employees.length < 2) throw new Error("Jeu de données insuffisant : lancez POST /api/seed");
  const [alice, bob] = employees;

  const aliceDevice = new VirtualAuthenticator("poste-alice");
  const bobDevice = new VirtualAuthenticator("poste-bob");

  // Environnement déterministe : aucun pointage du jour, aucune empreinte résiduelle
  await resetTodayPunches([alice.id, bob.id]);
  await resetCredentials([alice.id, bob.id]);

  /* ---------- 1. Enrôlement d'Alice ---------- */
  section("1. Enrôlement de l'empreinte d'Alice (capteur réel simulé)");
  {
    const options = await api("/api/biometrics/register/options", {
      method: "POST",
      body: { employeeId: alice.id },
    });
    check("options d'enrôlement générées", options.status === 200 && !!options.json.options, JSON.stringify(options.json).slice(0, 200));
    check(
      "exigence : clé résidente + vérification utilisateur + capteur embarqué",
      options.json.options?.authenticatorSelection?.residentKey === "required" &&
        options.json.options?.authenticatorSelection?.userVerification === "required" &&
        options.json.options?.authenticatorSelection?.authenticatorAttachment === "platform"
    );

    const attestation = aliceDevice.createAttestation({ challenge: options.json.options.challenge });
    const verified = await api("/api/biometrics/register/verify", {
      method: "POST",
      body: { employeeId: alice.id, finger: "Pouce Droit", response: attestation },
    });
    check("enrôlement vérifié et enregistré", verified.status === 200 && verified.json.success === true, JSON.stringify(verified.json).slice(0, 220));
    check(
      "la fiche salarié passe en « empreinte enrôlée »",
      verified.json.employee?.fingerprintEnrolled === true &&
        verified.json.employee?.fingerprintTemplateId === b64url(aliceDevice.credentialId)
    );
    check("clé publique stockée côté serveur", (await enrolledCredentialCount(alice.id)) === 1);
  }
  {
    // Bob s'enrôle aussi : nécessaire pour tester le contrôle nominatif
    const options = await api("/api/biometrics/register/options", {
      method: "POST",
      body: { employeeId: bob.id },
    });
    const attestation = bobDevice.createAttestation({ challenge: options.json.options.challenge });
    const verified = await api("/api/biometrics/register/verify", {
      method: "POST",
      body: { employeeId: bob.id, finger: "Index Droit", response: attestation },
    });
    check("enrôlement de Bob (second capteur) vérifié", verified.status === 200);
  }

  /* ---------- 2. Identification 1:N ---------- */
  section("2. Identification 1:N — le doigt présenté désigne le salarié");
  {
    const options = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
    check("demande de reconnaissance générée sans imposer de salarié", options.status === 200 && options.json.mode === "IDENTIFY");
    check(
      "aucun credential imposé : c'est le capteur qui identifie",
      Array.isArray(options.json.options?.allowCredentials) &&
        options.json.options.allowCredentials.length === 0
    );

    const assertion = aliceDevice.createAssertion({ challenge: options.json.options.challenge });
    const punch = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: assertion, kioskLocation: "Borne Test E2E" },
    });

    check("pointage accepté", punch.status === 200 && punch.json.success === true, JSON.stringify(punch.json).slice(0, 240));
    check("salarié reconnu = propriétaire de l'empreinte", punch.json.employee?.id === alice.id, `attendu ${alice.id}, reçu ${punch.json.employee?.id}`);
    check("type déduit automatiquement (arrivée)", punch.json.punch?.type === "IN");
    check(
      "pointage marqué comme vérifié par le capteur",
      punch.json.punch?.punchMethod === "WEBAUTHN" && punch.json.punch?.biometricConfidence === 100
    );
    check("compteur anti-rejeu renvoyé", typeof punch.json.verification?.counter === "number");
  }
  await backdateLastPunch(alice.id);

  /* ---------- 3. Le doigt de Bob identifie Bob ---------- */
  section("3. Le doigt de Bob identifie Bob (pas de confusion entre empreintes)");
  {
    const options = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
    const assertion = bobDevice.createAssertion({ challenge: options.json.options.challenge });
    const punch = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: assertion, kioskLocation: "Borne Test E2E" },
    });
    check("pointage de Bob accepté", punch.status === 200);
    check("salarié reconnu = Bob", punch.json.employee?.id === bob.id, `attendu ${bob.id}, reçu ${punch.json.employee?.id}`);
  }
  await backdateLastPunch(bob.id);

  /* ---------- 4. Ancienne faille : pointage biométrique forgé ---------- */
  section("4. Refus des pointages biométriques forgés (l'ancienne faille)");
  {
    const forged = await api("/api/punch", {
      method: "POST",
      body: {
        employeeId: bob.id,
        type: "IN",
        punchMethod: "FINGERPRINT",
        biometricConfidence: 99,
        kioskLocation: "Faux navigateur",
      },
    });
    check(
      "un POST /api/punch avec punchMethod FINGERPRINT est refusé (403)",
      forged.status === 403,
      `reçu ${forged.status}`
    );

    const forgedWebAuthn = await api("/api/punch", {
      method: "POST",
      body: { employeeId: alice.id, type: "OUT", punchMethod: "WEBAUTHN" },
    });
    check("un POST /api/punch avec punchMethod WEBAUTHN est refusé (403)", forgedWebAuthn.status === 403);

    const anonymous = await api("/api/punch", {
      method: "POST",
      body: { employeeId: alice.id, type: "OUT" },
    });
    check(
      "un pointage sans régularisation DRH est refusé",
      anonymous.status === 403,
      `reçu ${anonymous.status}`
    );
  }

  /* ---------- 5. Autre clé privée / mauvais défi ---------- */
  section("5. Vérification cryptographique de la signature");
  {
    const intruderKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;

    const options = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
    const wrongKeyAssertion = aliceDevice.createAssertion({
      challenge: options.json.options.challenge,
      signingKey: intruderKey,
    });
    const rejected = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: wrongKeyAssertion },
    });
    check(
      "assertion signée par une autre clé refusée (401)",
      rejected.status === 401,
      `reçu ${rejected.status} — ${JSON.stringify(rejected.json).slice(0, 160)}`
    );

    // Le défi a été consommé : un rejeu de la même assertion doit échouer
    const replay = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: wrongKeyAssertion },
    });
    check("rejeu de la même assertion refusé", replay.status >= 400, `reçu ${replay.status}`);

    // Mauvaise origine dans clientDataJSON (hameçonnage)
    const options2 = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
    const wrongOrigin = aliceDevice.createAssertion({
      challenge: options2.json.options.challenge,
      origin: "https://attaquant.example",
    });
    const originRejected = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: wrongOrigin },
    });
    check(
      "assertion émise pour une autre origine refusée",
      originRejected.status === 401,
      `reçu ${originRejected.status}`
    );
  }

  /* ---------- 6. Contrôle nominatif ---------- */
  section("6. Contrôle nominatif : impossible de pointer pour un collègue");
  {
    const options = await api("/api/biometrics/authenticate/options", {
      method: "POST",
      body: { employeeId: bob.id },
    });
    check("mode contrôle nominatif activé", options.json.mode === "VERIFY");
    check(
      "seul le credential de Bob est proposé au capteur",
      options.json.options?.allowCredentials?.length === 1 &&
        options.json.options.allowCredentials[0].id === b64url(bobDevice.credentialId)
    );

    // Alice pose son doigt alors que la borne demande Bob
    const aliceFinger = aliceDevice.createAssertion({ challenge: options.json.options.challenge });
    const refused = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: aliceFinger },
    });
    check(
      "l'empreinte d'Alice est refusée pour un pointage au nom de Bob (403)",
      refused.status === 403,
      `reçu ${refused.status} — ${JSON.stringify(refused.json).slice(0, 160)}`
    );
  }

  /* ---------- 7. Séquence de la journée ---------- */
  section("7. Séquence arrivée → pause → reprise → départ (et anti double-scan)");
  {
    await resetTodayPunches([alice.id]);

    const punchWith = async (requestedType) => {
      const opts = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
      return api("/api/biometrics/authenticate/verify", {
        method: "POST",
        body: {
          response: aliceDevice.createAssertion({ challenge: opts.json.options.challenge }),
          ...(requestedType ? { requestedType } : {}),
        },
      });
    };

    const arrival = await punchWith();
    check(
      "journée vierge : le premier pointage est une arrivée",
      arrival.json.punch?.type === "IN",
      JSON.stringify(arrival.json).slice(0, 160)
    );

    const doubleScan = await punchWith();
    check(
      "double pointage immédiat refusé (429)",
      doubleScan.status === 429,
      `reçu ${doubleScan.status} (${JSON.stringify(await lastPunchInfo(alice.id))})`
    );

    await backdateLastPunch(alice.id);
    const breakStart = await punchWith("BREAK_START");
    check(
      "début de pause accepté",
      breakStart.json.punch?.type === "BREAK_START",
      JSON.stringify(breakStart.json).slice(0, 160)
    );

    await backdateLastPunch(alice.id);
    const breakEnd = await punchWith();
    check("reprise déduite automatiquement", breakEnd.json.punch?.type === "BREAK_END");

    await backdateLastPunch(alice.id);
    const departure = await punchWith();
    check("départ déduit automatiquement", departure.json.punch?.type === "OUT");

    await backdateLastPunch(alice.id);
    const incoherent = await punchWith("OUT");
    check(
      "départ incohérent (déjà pointé) refusé (409)",
      incoherent.status === 409,
      `reçu ${incoherent.status} — ${JSON.stringify(incoherent.json).slice(0, 140)}`
    );

    await backdateLastPunch(alice.id);
    const wrongBreak = await punchWith("BREAK_END");
    check("reprise sans pause en cours refusée (409)", wrongBreak.status === 409);
  }

  /* ---------- 8. Repli code + PIN ---------- */
  section("8. Repli code salarié + PIN (tracé comme non biométrique)");
  {
    await resetTodayPunches([alice.id]);

    const wrongPin = await api("/api/punch", {
      method: "POST",
      body: { employeeId: alice.id, punchMethod: "PIN_FALLBACK", pin: "0000" },
    });
    check("PIN erroné refusé (401)", wrongPin.status === 401, `reçu ${wrongPin.status}`);

    const goodPin = await api("/api/punch", {
      method: "POST",
      body: { employeeId: alice.id, punchMethod: "PIN_FALLBACK", pin: alice.pinCode },
    });
    check("PIN correct accepté", goodPin.status === 200 && goodPin.json.success === true, JSON.stringify(goodPin.json).slice(0, 200));
    check("pointage tracé comme non biométrique", goodPin.json.punch?.punchMethod === "PIN_FALLBACK" && !goodPin.json.punch?.biometricConfidence);
  }

  /* ---------- 9. Régularisation DRH ---------- */
  section("9. Régularisation DRH toujours possible");
  {
    const manual = await api("/api/punch", {
      method: "POST",
      body: {
        employeeId: bob.id,
        type: "BREAK_START",
        punchMethod: "MANUAL_DRH",
        isManual: true,
        manualReason: "Test E2E",
        manualEditedBy: "DRH",
      },
    });
    check("pointage manuel DRH accepté", manual.status === 200 && manual.json.success === true, JSON.stringify(manual.json).slice(0, 200));
    check("marqué comme manuel", manual.json.punch?.isManual === true);
  }

  /* ---------- 10. Révocation RGPD ---------- */
  section("10. Révocation de l'empreinte (RGPD)");
  {
    const list = await api(`/api/biometrics/credentials?employeeId=${alice.id}`);
    check("empreinte listée", list.json.credentials?.length === 1);

    const revoke = await api(`/api/biometrics/credentials?id=${list.json.credentials[0].id}`, {
      method: "DELETE",
    });
    check("révocation effectuée", revoke.status === 200 && revoke.json.remaining === 0);
    check("clé publique supprimée", (await enrolledCredentialCount(alice.id)) === 0);

    const options = await api("/api/biometrics/authenticate/options", { method: "POST", body: {} });
    const afterRevoke = await api("/api/biometrics/authenticate/verify", {
      method: "POST",
      body: { response: aliceDevice.createAssertion({ challenge: options.json.options.challenge }) },
    });
    check(
      "l'empreinte révoquée ne peut plus pointer (404)",
      afterRevoke.status === 404,
      `reçu ${afterRevoke.status}`
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
