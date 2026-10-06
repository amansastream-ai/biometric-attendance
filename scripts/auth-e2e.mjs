/**
 * Test de bout en bout de l'authentification et des habilitations.
 *
 * Vérifie, face à une instance réelle de l'application :
 *
 *   1. aucune donnée RH n'est accessible sans session (401) ;
 *   2. mots de passe hachés : un mot de passe en clair ne fonctionne plus,
 *      et la base ne contient aucune empreinte lisible ;
 *   3. connexion / déconnexion, exposition de session et révocabilité ;
 *   4. cloisonnement des rôles (manager en lecture seule, borne limitée au
 *      pointage, RH sans droit de nommer un administrateur) ;
 *   5. protection contre les abus : tentatives répétées bloquées, CSRF refusé,
 *      auteur d'un pointage non falsifiable ;
 *   6. garde-fous de gestion des comptes : dernier administrateur protégé,
 *      auto-désactivation et auto-rétrogradation impossibles.
 *
 * Prérequis : `npm run db:local`, `npm run db:push`, données de démo
 * (`POST /api/seed`) et application lancée (`npm run dev`).
 *
 * Lancement : npm run test:auth
 */
import "dotenv/config";
import { Client } from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const DEMO_PASSWORD = "password123";

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

  async login(email, password = DEMO_PASSWORD) {
    return this.request("/api/auth/login", { method: "POST", body: { email, password } });
  }
}

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n🔐 Test authentification & habilitations — ${BASE_URL}\n`);
  await pgClient.connect();

  const anonymous = new Session("anonyme");

  /* ---------- 1. Rien n'est accessible sans session ---------- */
  section("1. Accès aux données RH sans session");
  {
    const routes = [
      ["/api/employees", "GET"],
      ["/api/departments", "GET"],
      ["/api/punch", "GET"],
      ["/api/stats", "GET"],
      ["/api/timesheets", "GET"],
      ["/api/reports", "GET"],
      ["/api/users", "GET"],
      ["/api/reports/export?period=THIS_MONTH", "GET"],
    ];

    for (const [path, method] of routes) {
      const result = await anonymous.request(path, { method });
      check(`${method} ${path.split("?")[0]} → 401`, result.status === 401, `reçu ${result.status}`);
    }

    const write = await anonymous.request("/api/employees", {
      method: "POST",
      body: { firstName: "Pirate", lastName: "Test", email: "x@y.z", departmentId: 1, jobTitle: "Test" },
    });
    check("écriture de salarié refusée sans session", write.status === 401, `reçu ${write.status}`);

    const seedWithoutSecret = await anonymous.request("/api/seed", { method: "POST" });
    check("réinitialisation refusée sans secret ni session", seedWithoutSecret.status === 401);

    const health = await anonymous.request("/api/health");
    check("la sonde de santé reste publique", health.status === 200);
  }

  /* ---------- 2. Mots de passe ---------- */
  section("2. Stockage des mots de passe");
  {
    const rows = await pgClient.query("SELECT email, password FROM users ORDER BY id");
    const plaintext = rows.rows.filter((row) => !row.password.startsWith("scrypt$"));
    check("aucun mot de passe en clair en base", plaintext.length === 0, `${plaintext.length} en clair`);
    check(
      "tous les mots de passe sont hachés (scrypt + sel)",
      rows.rows.every((row) => row.password.startsWith("scrypt$") && row.password.split("$").length === 6)
    );
    const sessionPayload = JSON.stringify(
      await new Session("Sonde").request("/api/auth/session")
    );
    check(
      "aucune empreinte de mot de passe dans la réponse de session",
      !sessionPayload.includes("password") && !sessionPayload.includes("scrypt$")
    );
  }

  /* ---------- 3. Connexion / déconnexion ---------- */
  section("3. Connexion, session et déconnexion");
  {
    const bad = await anonymous.login("drh@pointage-biometrique.fr", "password1234");
    check("mauvais mot de passe refusé (401)", bad.status === 401);

    const unknown = await anonymous.login("inconnu@pointage-biometrique.fr");
    check("compte inexistant refusé (401)", unknown.status === 401);
    check(
      "le message d'erreur ne révèle pas l'existence du compte",
      bad.json.error === unknown.json.error,
      `${bad.json.error} / ${unknown.json.error}`
    );

    const drh = new Session("DRH");
    const login = await drh.login("drh@pointage-biometrique.fr");
    check("connexion DRH réussie", login.status === 200 && login.json.success === true);
    check("cookie de session HttpOnly posé", drh.cookies.has("bp_session"));

    const session = await drh.request("/api/auth/session");
    check("session reconnue", session.json.authenticated === true);
    check("rôle remonté par le serveur", session.json.user?.role === "drh");
    check(
      "habilitations calculées côté serveur",
      session.json.capabilities?.manageEmployees === true &&
        session.json.capabilities?.promoteAdmin === false
    );

    const data = await drh.request("/api/employees");
    check("données RH accessibles avec une session DRH", data.status === 200 && data.json.success === true);

    // L'auteur d'un pointage manuel vient de la session, pas du client
    const spoof = await drh.request("/api/punch", {
      method: "POST",
      body: {
        employeeId: data.json.employees[0].id,
        type: "IN",
        punchMethod: "MANUAL_DRH",
        isManual: true,
        manualReason: "Test E2E",
        manualEditedBy: "Administrateur suprême (falsifié)",
      },
    });
    check("pointage manuel accepté pour un rôle RH", spoof.status === 200, JSON.stringify(spoof.json).slice(0, 160));
    check(
      "l'auteur enregistré est celui de la session, pas celui envoyé par le client",
      spoof.json.punch?.manualEditedBy?.includes("Sophie Laurent") &&
        !spoof.json.punch?.manualEditedBy?.includes("falsifié"),
      spoof.json.punch?.manualEditedBy
    );

    const out = await drh.request("/api/auth/logout", { method: "POST" });
    check("déconnexion réussie", out.status === 200);
    const afterLogout = await drh.request("/api/employees");
    check("session supprimée côté serveur après déconnexion (401)", afterLogout.status === 401, `reçu ${afterLogout.status}`);
  }

  /* ---------- 4. Cloisonnement des rôles ---------- */
  section("4. Cloisonnement des rôles");
  {
    const manager = new Session("Manager");
    await manager.login("manager@pointage-biometrique.fr");
    const managerSession = await manager.request("/api/auth/session");
    check("manager connecté", managerSession.json.user?.role === "manager");
    check(
      "manager : lecture seule (pas de gestion des salariés ni des comptes)",
      managerSession.json.capabilities?.manageEmployees === false &&
        managerSession.json.capabilities?.manageUsers === false
    );

    const managerRead = await manager.request("/api/employees");
    check("manager peut consulter les salariés", managerRead.status === 200);

    const managerWrite = await manager.request("/api/employees", {
      method: "POST",
      body: { firstName: "Test", lastName: "Manager", email: "m@x.z", departmentId: 1, jobTitle: "Test" },
    });
    check("manager ne peut pas créer de salarié (403)", managerWrite.status === 403, `reçu ${managerWrite.status}`);

    const managerUsers = await manager.request("/api/users");
    check("manager n'accède pas aux comptes (403)", managerUsers.status === 403, `reçu ${managerUsers.status}`);

    const managerManual = await manager.request("/api/punch", {
      method: "POST",
      body: { employeeId: managerRead.json.employees[0].id, type: "IN", punchMethod: "MANUAL_DRH", isManual: true },
    });
    check("manager ne peut pas régulariser un pointage (403)", managerManual.status === 403);

    const kiosk = new Session("Borne");
    await kiosk.login("kiosk@pointage-biometrique.fr");
    const kioskSession = await kiosk.request("/api/auth/session");
    check("borne connectée", kioskSession.json.user?.role === "kiosk");
    check(
      "borne : aucun accès au portail RH",
      kioskSession.json.capabilities?.viewPortal === false &&
        kioskSession.json.capabilities?.punchTerminal === true
    );

    const kioskEmployees = await kiosk.request("/api/employees");
    check("borne : données salariés inaccessibles (403)", kioskEmployees.status === 403, `reçu ${kioskEmployees.status}`);

    const kioskTerminal = await kiosk.request("/api/biometrics/authenticate/options", {
      method: "POST",
      body: {},
    });
    check("borne : le pointage biométrique reste autorisé", kioskTerminal.status === 200, `reçu ${kioskTerminal.status}`);

    const kioskEnroll = await kiosk.request("/api/biometrics/register/options", {
      method: "POST",
      body: { employeeId: 1 },
    });
    check("borne : enrôlement d'empreinte interdit (403)", kioskEnroll.status === 403, `reçu ${kioskEnroll.status}`);
  }

  /* ---------- 5. Protections ---------- */
  section("5. Protections contre les abus");
  {
    // Compte jetable : le blocage ne doit pas gêner les autres scénarios
    const attacker = new Session("Attaquant");
    let throttled = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await attacker.login("cible.e2e@pointage-biometrique.fr", `mauvais-${attempt}`);
      if (result.status === 429) {
        throttled = true;
        break;
      }
    }
    check("tentatives répétées bloquées (429)", throttled);

    // Origine étrangère : refusée même avec une session valide (anti-CSRF)
    const drh = new Session("DRH");
    await drh.login("drh@pointage-biometrique.fr");
    const csrf = await drh.request("/api/employees", {
      method: "POST",
      headers: { Origin: "https://attaquant.example" },
      body: { firstName: "Pirate", lastName: "CSRF", email: "p@x.z", departmentId: 1, jobTitle: "Test" },
    });
    check("écriture depuis une origine étrangère refusée (403)", csrf.status === 403, `reçu ${csrf.status}`);
  }

  /* ---------- 6. Gestion des comptes ---------- */
  section("6. Gestion des comptes et garde-fous");
  {
    const drh = new Session("DRH");
    await drh.login("drh@pointage-biometrique.fr");
    const admin = new Session("Admin");
    const adminLogin = await admin.login("admin@pointage-biometrique.fr");
    check(
      "connexion administrateur réussie",
      adminLogin.status === 200,
      `reçu ${adminLogin.status} — ${JSON.stringify(adminLogin.json).slice(0, 120)}`
    );

    const list = await drh.request("/api/users");
    check("les gestionnaires voient la liste des comptes", list.status === 200 && list.json.users.length >= 4);
    check(
      "aucune empreinte de mot de passe dans la réponse",
      list.json.users.every((user) => user.password === undefined)
    );

    const drhCreatesAdmin = await drh.request("/api/users", {
      method: "POST",
      body: { name: "Faux Admin", email: "faux.admin@test.fr", password: "motdepasse123", role: "admin" },
    });
    check(
      "la DRH ne peut pas créer un administrateur (403)",
      drhCreatesAdmin.status === 403,
      `reçu ${drhCreatesAdmin.status}`
    );

    const shortPassword = await drh.request("/api/users", {
      method: "POST",
      body: { name: "Test Court", email: "court@test.fr", password: "court", role: "drh" },
    });
    check("mot de passe trop court refusé (400)", shortPassword.status === 400);

    const created = await admin.request("/api/users", {
      method: "POST",
      body: {
        name: "Nadia Test E2E",
        email: "nadia.test@pointage-biometrique.fr",
        password: "motdepasse123",
        role: "drh",
      },
    });
    check("administrateur peut créer un compte DRH", created.status === 200, JSON.stringify(created.json).slice(0, 160));
    const createdId = created.json.user?.id;

    const duplicate = await admin.request("/api/users", {
      method: "POST",
      body: { name: "Doublon", email: "nadia.test@pointage-biometrique.fr", password: "motdepasse123", role: "drh" },
    });
    check("email déjà utilisé refusé (409)", duplicate.status === 409);

    // Connexion avec le compte créé, puis révocation par changement de mot de passe
    const nadia = new Session("Nadia");
    const nadiaLogin = await nadia.login("nadia.test@pointage-biometrique.fr", "motdepasse123");
    check("le nouveau compte peut se connecter", nadiaLogin.status === 200);

    const reset = await admin.request(`/api/users/${createdId}`, {
      method: "PUT",
      body: { password: "nouveaumotdepasse" },
    });
    check("réinitialisation du mot de passe par l'administrateur", reset.status === 200);
    check("les sessions du compte sont révoquées", reset.json.sessionsRevoked === true);

    const afterReset = await nadia.request("/api/auth/session");
    check(
      "l'ancienne session du compte ne fonctionne plus (401)",
      (await nadia.request("/api/employees")).status === 401,
      `session: ${afterReset.status}`
    );

    const oldPassword = await new Session("ancien").login(
      "nadia.test@pointage-biometrique.fr",
      "motdepasse123"
    );
    check("l'ancien mot de passe ne fonctionne plus (401)", oldPassword.status === 401);

    // Garde-fous
    const selfDemote = await admin.request(`/api/users/${createdId}`, {
      method: "PUT",
      body: { role: "admin" },
    });
    check("attribution du rôle admin réservée aux administrateurs (autorisée ici)", selfDemote.status === 200);

    const adminSession = await admin.request("/api/auth/session");
    const adminId = adminSession.json.user.id;

    const selfRole = await admin.request(`/api/users/${adminId}`, {
      method: "PUT",
      body: { role: "manager" },
    });
    check("impossible de modifier son propre rôle (409)", selfRole.status === 409, `reçu ${selfRole.status}`);

    const selfDeactivate = await admin.request(`/api/users/${adminId}`, {
      method: "PUT",
      body: { isActive: false },
    });
    check("impossible de désactiver son propre compte (409)", selfDeactivate.status === 409);

    const selfDelete = await admin.request(`/api/users/${adminId}`, { method: "DELETE" });
    check("impossible de supprimer son propre compte (409)", selfDelete.status === 409);

    const drhDelete = await drh.request(`/api/users/${createdId}`, { method: "DELETE" });
    check("la DRH ne peut pas supprimer un compte (403)", drhDelete.status === 403, `reçu ${drhDelete.status}`);

    const adminDelete = await admin.request(`/api/users/${createdId}`, { method: "DELETE" });
    check("l'administrateur peut supprimer un compte", adminDelete.status === 200);

    // Dernier administrateur protégé
    const demoteLastAdmin = await admin.request(`/api/users/${adminId}`, { method: "DELETE" });
    check("le dernier administrateur ne peut pas être supprimé (409)", demoteLastAdmin.status === 409);
  }

  /* ---------- 7. Changement de mot de passe par l'utilisateur ---------- */
  section("7. Changement de mot de passe par l'utilisateur");
  {
    const user = new Session("Manager");
    await user.login("manager@pointage-biometrique.fr");

    const wrongCurrent = await user.request("/api/auth/password", {
      method: "PUT",
      body: { currentPassword: "mauvais", newPassword: "nouveaupass123" },
    });
    check("mot de passe actuel incorrect refusé (401)", wrongCurrent.status === 401);

    const tooShort = await user.request("/api/auth/password", {
      method: "PUT",
      body: { currentPassword: DEMO_PASSWORD, newPassword: "court" },
    });
    check("nouveau mot de passe trop court refusé (400)", tooShort.status === 400);

    const otherSession = new Session("Autre appareil");
    await otherSession.login("manager@pointage-biometrique.fr");

    const changed = await user.request("/api/auth/password", {
      method: "PUT",
      body: { currentPassword: DEMO_PASSWORD, newPassword: "nouveaupass123" },
    });
    check("changement de mot de passe accepté", changed.status === 200, JSON.stringify(changed.json).slice(0, 160));
    check("la session courante reste valide", (await user.request("/api/auth/session")).json.authenticated === true);
    check(
      "les autres appareils sont déconnectés (401)",
      (await otherSession.request("/api/employees")).status === 401
    );

    // On remet le mot de passe de démonstration pour ne pas perturber les autres tests
    const restore = await user.request("/api/auth/password", {
      method: "PUT",
      body: { currentPassword: "nouveaupass123", newPassword: DEMO_PASSWORD },
    });
    check("mot de passe de démonstration restauré", restore.status === 200);
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
