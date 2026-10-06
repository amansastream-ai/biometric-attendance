/**
 * Test de bout en bout de l'inscription du premier administrateur.
 *
 * Vérifie, face à une instance réelle de l'application :
 *
 *   1. instance vierge : le portail est ouvert (GET /api/auth/signup) et ne
 *      révèle rien — ni identité, ni nombre de comptes ;
 *   2. validation des identifiants (nom, email, mot de passe) : chaque
 *      échec est refusé (400) et journalisé ;
 *   3. protection contre les abus : origine étrangère refusée (CSRF), aucun
 *     cookie de session émis sur un refus ;
 *   4. inscription : compte « administrateur système », mot de passe haché
 *     (scrypt), email normalisé, session immédiate (cookie HttpOnly), trace
 *     d'audit sans aucune fuite du mot de passe ;
 *   5. le portail se ferme après l'initialisation : toute nouvelle tentative
 *     est refusée (403) sans révéler l'existence d'un compte ;
 *   6. le nouvel administrateur utilise l'application : déconnexion,
 *     reconnexion, ressources protégées, journal d'audit en lecture seule ;
 *   7. remise en état : les données de démonstration sont restaurées
 *     (POST /api/seed) pour que les autres suites de test retrouvent leur
 *     état habituel.
 *
 * Le script vide la base au départ (état de « première utilisation ») et la
 * re-seede à la fin : il est donc ré-exécutable.
 *
 * Prérequis : `npm run db:local`, `npm run db:push`, `SEED_SECRET` dans
 * l'environnement, application lancée (`npm run dev`).
 *
 * Lancement : npm run test:signup
 */
import "dotenv/config";
import { Client } from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED_SECRET = process.env.SEED_SECRET;

if (!SEED_SECRET) {
  console.error(
    "❌ SEED_SECRET absent de l'environnement : impossible de restaurer les données de démonstration à la fin du test."
  );
  process.exit(1);
}

const SIGNUP_NAME = "Claire Dumont";
const SIGNUP_EMAIL = "Premier.Admin@BioPointage.fr"; // volontairement en majuscules
const SIGNUP_PASSWORD = "PremierAdmin!2026";

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
/* Session HTTP indépendante (cookies gérés manuellement)              */
/* ------------------------------------------------------------------ */

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  get cookieHeader() {
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
    return { status: response.status, json };
  }

  async login(email, password) {
    return this.request("/api/auth/login", { method: "POST", body: { email, password } });
  }
}

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

async function countUsers() {
  const { rows } = await pgClient.query("SELECT count(*)::int AS n FROM users");
  return rows[0].n;
}

async function auditRows(where, params = []) {
  const { rows } = await pgClient.query(
    `SELECT summary, details, actor_name, outcome FROM audit_logs
     WHERE ${where} ORDER BY id`,
    params
  );
  return rows;
}

/**
 * Vide toute la base : état d'une instance jamais provisionnée.
 * RESTART IDENTITY remet les séquences à 1 : les identifiants attribués par le
 * re-seed final (salariés 1..N, pôles 1..N) restent identiques à ceux d'une
 * base neuve, ce que supposent les autres suites de test.
 */
async function wipeDatabase() {
  const tables = [
    "audit_logs",
    "user_credentials",
    "sessions",
    "biometric_credentials",
    "punch_records",
    "report_dispatches",
    "employees",
    "departments",
    "users",
  ];
  await pgClient.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n🔑 Test inscription du premier administrateur — ${BASE_URL}\n`);
  await pgClient.connect();
  await wipeDatabase();

  const anonymous = new Session("anonyme");

  /* ---------- 0. Prérequis ---------- */
  section("0. Prérequis");
  const health = await fetch(`${BASE_URL}/api/health`);
  const healthJson = await health.json().catch(() => ({}));
  check("L'application répond (GET /api/health)", health.ok && healthJson.ok === true);

  /* ---------- 1. Instance vierge ---------- */
  section("1. Instance vierge : le portail est ouvert, sans révéler rien");
  const status1 = await anonymous.request("/api/auth/signup");
  check("GET /api/auth/signup répond 200", status1.status === 200);
  check("L'inscription est ouverte (available = true)", status1.json.available === true);
  check(
    "La réponse ne révèle aucune identité ni nombre de comptes",
    !("users" in status1.json) && !("user" in status1.json) && !("count" in status1.json),
    JSON.stringify(status1.json)
  );

  const loginBefore = await anonymous.request("/api/auth/login", {
    method: "POST",
    body: { email: SIGNUP_EMAIL.toLowerCase(), password: SIGNUP_PASSWORD },
  });
  check("La connexion est impossible tant qu'aucun compte n'existe (401)", loginBefore.status === 401);

  /* ---------- 2. Validation des identifiants ---------- */
  section("2. Validation des identifiants (base vide)");
  const emptyBody = await anonymous.request("/api/auth/signup", { method: "POST", body: {} });
  check("Requête vide refusée (400)", emptyBody.status === 400);

  const noName = await anonymous.request("/api/auth/signup", {
    method: "POST",
    body: { email: SIGNUP_EMAIL, password: SIGNUP_PASSWORD },
  });
  check("Nom manquant refusé (400)", noName.status === 400);

  const badEmail = await anonymous.request("/api/auth/signup", {
    method: "POST",
    body: { name: SIGNUP_NAME, email: "pas-un-email", password: SIGNUP_PASSWORD },
  });
  check("Email invalide refusé (400)", badEmail.status === 400);

  const shortPassword = await anonymous.request("/api/auth/signup", {
    method: "POST",
    body: { name: SIGNUP_NAME, email: SIGNUP_EMAIL, password: "court" },
  });
  check("Mot de passe trop court refusé (400)", shortPassword.status === 400);

  const badJsonResponse = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalide",
  });
  check("Corps JSON malformé refusé (400)", badJsonResponse.status === 400);

  check("Aucun compte créé après les tentatives invalides (0 utilisateur en base)", (await countUsers()) === 0);

  const failedAudit = await auditRows("action = 'AUTH_SIGNUP' AND outcome = 'FAILED'");
  check(
    "Les échecs d'inscription sont journalisés (5 × AUTH_SIGNUP, résultat « Échoué »)",
    failedAudit.length === 5,
    `(${failedAudit.length})`
  );

  /* ---------- 3. Protection contre les abus ---------- */
  section("3. Protection contre les abus");
  const csrfResponse = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://autre-site.example" },
    body: JSON.stringify({ name: "Attaquant", email: "attaquant@exemple.fr", password: "attaquant1234" }),
  });
  check("Origine étrangère refusée (CSRF, 403)", csrfResponse.status === 403);

  check("L'essai CSRF n'a créé aucun compte (0 utilisateur en base)", (await countUsers()) === 0);

  const deniedCsrf = await auditRows("action = 'AUTH_SIGNUP' AND outcome = 'DENIED'");
  check("L'essai CSRF est tracé dans le journal d'audit (résultat « Refusé »)", deniedCsrf.length === 1, `(${deniedCsrf.length})`);

  const csrfCookies = csrfResponse.headers.getSetCookie?.() ?? [];
  check("Aucun cookie de session émis sur un refus", !csrfCookies.some((cookie) => cookie.startsWith("bp_session=")));

  /* ---------- 4. Inscription du premier administrateur ---------- */
  section("4. Inscription du premier administrateur");
  const createdResponse = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: SIGNUP_NAME, email: SIGNUP_EMAIL, password: SIGNUP_PASSWORD }),
  });
  const created = await createdResponse.json().catch(() => ({}));
  const setCookies = createdResponse.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookies.find((cookie) => cookie.startsWith("bp_session=")) ?? "";

  check("Inscription acceptée (201)", createdResponse.status === 201, JSON.stringify(created).slice(0, 160));
  check("Le compte renvoyé porte bien le rôle administrateur", created.user?.role === "admin");
  check("Un cookie de session est émis au moment de l'inscription (bp_session)", sessionCookie.length > 0);
  check("Le cookie de session est HttpOnly (illisible par le navigateur)", /httponly/i.test(sessionCookie));

  const admin = new Session("nouvel administrateur");
  if (sessionCookie) {
    const separator = sessionCookie.indexOf("=");
    admin.cookies.set(sessionCookie.slice(0, separator).trim(), sessionCookie.slice(separator + 1).trim());
  }
  const whoAmI = await admin.request("/api/auth/session");
  check(
    "La session est immédiatement active (GET /api/auth/session → authentifié, rôle admin)",
    whoAmI.json.authenticated === true && whoAmI.json.user?.role === "admin",
    JSON.stringify(whoAmI.json).slice(0, 160)
  );

  const userRow = (await pgClient.query("SELECT email, password FROM users LIMIT 1")).rows[0];
  check("En base, le mot de passe est haché (préfixe scrypt$)", typeof userRow?.password === "string" && userRow.password.startsWith("scrypt$"));
  check("Le mot de passe en clair n'apparaît pas dans la colonne password", Boolean(userRow) && !userRow.password.includes(SIGNUP_PASSWORD));
  check("L'email est stocké normalisé en minuscules", userRow?.email === SIGNUP_EMAIL.toLowerCase());

  const successAudit = await auditRows("action = 'AUTH_SIGNUP' AND outcome = 'SUCCESS'");
  check("Le journal d'audit contient l'inscription (1 × AUTH_SIGNUP, résultat « Effectué »)", successAudit.length === 1, `(${successAudit.length})`);
  check("L'entrée d'audit identifie le nouveau compte (acteur = nom saisi)", successAudit[0]?.actor_name === SIGNUP_NAME);
  const leaked = successAudit.some(
    (row) => (row.summary ?? "").includes(SIGNUP_PASSWORD) || (row.details ?? "").includes(SIGNUP_PASSWORD)
  );
  check("Ni le résumé ni les détails d'audit ne contiennent le mot de passe", !leaked);

  /* ---------- 5. Le portail se ferme après l'initialisation ---------- */
  section("5. Le portail se ferme après l'initialisation");
  const status2 = await anonymous.request("/api/auth/signup");
  check("GET /api/auth/signup : inscription fermée (available = false)", status2.status === 200 && status2.json.available === false);

  const second = await anonymous.request("/api/auth/signup", {
    method: "POST",
    body: { name: "Second Utilisateur", email: "second@exemple.fr", password: "secondaire1234" },
  });
  check("Une deuxième inscription est refusée (403), même avec de bonnes valeurs", second.status === 403);

  const sameEmail = await anonymous.request("/api/auth/signup", {
    method: "POST",
    body: { name: SIGNUP_NAME, email: SIGNUP_EMAIL, password: SIGNUP_PASSWORD },
  });
  check(
    "Refus identique pour un email connu et un inconnu (aucune fuite d'existence)",
    sameEmail.status === 403 && sameEmail.json.error === second.json.error
  );

  check("Aucun second compte n'a été créé (1 utilisateur en base)", (await countUsers()) === 1);

  const deniedTotal = await auditRows("action = 'AUTH_SIGNUP' AND outcome = 'DENIED'");
  check(
    "Les tentatives de ré-inscription sont tracées (3 × résultat « Refusé » : CSRF + 2 porte fermé)",
    deniedTotal.length === 3,
    `(${deniedTotal.length})`
  );

  /* ---------- 6. Le nouvel administrateur utilise l'application ---------- */
  section("6. Le nouvel administrateur utilise l'application");
  const logout = await admin.request("/api/auth/logout", { method: "POST" });
  const afterLogout = await admin.request("/api/auth/session");
  check("Déconnexion : la session est révoquée (plus authentifié)", logout.status === 200 && afterLogout.json.authenticated === false);

  const relogin = await admin.request("/api/auth/login", {
    method: "POST",
    body: { email: SIGNUP_EMAIL.toLowerCase(), password: SIGNUP_PASSWORD },
  });
  check("Reconnexion possible via /api/auth/login avec le mot de passe choisi", relogin.status === 200 && relogin.json.success === true);

  const wrongPassword = await admin.request("/api/auth/login", {
    method: "POST",
    body: { email: SIGNUP_EMAIL.toLowerCase(), password: "mauvais-mot-de-passe" },
  });
  check("Mot de passe erroné refusé à la reconnexion (401)", wrongPassword.status === 401);

  const employees = await admin.request("/api/employees");
  check("GET /api/employees répond 200 avec la session du nouvel administrateur", employees.status === 200 && Array.isArray(employees.json.employees));

  const users = await admin.request("/api/users");
  check(
    "GET /api/users liste le nouveau compte (email normalisé)",
    users.status === 200 && (users.json.users ?? []).some((user) => user.email === SIGNUP_EMAIL.toLowerCase())
  );

  const auditList = await admin.request("/api/audit");
  check("GET /api/audit est accessible au nouvel administrateur (200, lecture seule)", auditList.status === 200 && auditList.json.readOnly === true);

  const auditPut = await admin.request("/api/audit", { method: "PUT", body: { id: 1 } });
  check("Le journal d'audit reste en écriture seule (PUT refusé, 405)", auditPut.status === 405);

  /* ---------- 7. Restauration des données de démonstration ---------- */
  section("7. Restauration des données de démonstration");
  // Suppression du compte de test et de ses sessions, puis remise de la
  // séquence à 1 : le re-seed attribue aux comptes de démonstration les mêmes
  // identifiants qu'une base neuve (1..4).
  await pgClient.query("DELETE FROM sessions");
  await pgClient.query("TRUNCATE TABLE users RESTART IDENTITY");

  const seedResponse = await fetch(`${BASE_URL}/api/seed`, {
    method: "POST",
    headers: { "x-seed-secret": SEED_SECRET },
  });
  const seed = await seedResponse.json().catch(() => ({}));
  check("Réinitialisation via le secret de déploiement acceptée (POST /api/seed)", seedResponse.status === 200 && seed.success === true, JSON.stringify(seed).slice(0, 160));

  check("Les quatre comptes de démonstration sont restaurés en base", (await countUsers()) === 4);

  const status3 = await anonymous.request("/api/auth/signup");
  check("Le portail d'inscription est à nouveau fermé (available = false)", status3.json.available === false);

  const demoAdmin = new Session("administrateur de démonstration");
  const demoLogin = await demoAdmin.login("admin@pointage-biometrique.fr", "password123");
  check("L'administrateur de démonstration se reconnecte (password123)", demoLogin.status === 200 && demoLogin.json.success === true);

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
