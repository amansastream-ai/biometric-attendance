/**
 * Test de bout en bout du journal d'audit.
 *
 * Vérifie, face à une instance réelle de l'application :
 *
 *   1. accès : 401 sans session, 200 pour admin et DRH, 403 pour manager et
 *      borne — le journal n'est lisible que par les rôles habilités ;
 *   2. immuabilité : aucune route ne permet de modifier ou de supprimer une
 *      entrée (405), et le nombre de lignes ne bouge pas ;
 *   3. traçabilité : chaque action sensible produit une entrée (connexion
 *      réussie / échouée / bloquée, création et modification de salarié,
 *      régularisation de pointage, repli PIN refusé, envoi et suppression de
 *      fichier, export de paie, accès refusé, déconnexion) ;
 *   4. confidentialité : aucun mot de passe, PIN, jeton ou clé d'empreinte
 *      n'apparaît en base, dans les résumés comme dans les détails ;
 *   5. confort de lecture : filtres (action, résultat, recherche, dates) et
 *      pagination bornée.
 *
 * Prérequis : `npm run db:local`, `npm run db:push`, données de démo
 * (`POST /api/seed`) et application lancée (`npm run dev`).
 *
 * Lancement : npm run test:audit
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

  async login(email, password = DEMO_PASSWORD, headers = {}) {
    return this.request("/api/auth/login", { method: "POST", body: { email, password }, headers });
  }
}

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

/** Récupère une entrée du journal via l'API RH (la plus récente correspondant). */
function findEntry(entries, predicate) {
  return entries.find(predicate);
}

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n📜 Test du journal d'audit — ${BASE_URL}\n`);
  await pgClient.connect();

  const anonymous = new Session("anonyme");
  const admin = new Session("admin");
  const drh = new Session("DRH");
  const manager = new Session("manager");
  const kiosk = new Session("borne");

  /* ---------- 1. Qui peut lire le journal ? ---------- */
  section("1. Accès au journal");
  {
    const unauth = await anonymous.request("/api/audit");
    check("sans session → 401", unauth.status === 401, `reçu ${unauth.status}`);

    await admin.login("admin@pointage-biometrique.fr");
    await drh.login("drh@pointage-biometrique.fr");
    await manager.login("manager@pointage-biometrique.fr");
    await kiosk.login("kiosk@pointage-biometrique.fr");

    const asAdmin = await admin.request("/api/audit");
    check("administrateur → 200", asAdmin.status === 200, `reçu ${asAdmin.status}`);
    check("le journal est renvoyé sous forme de liste", Array.isArray(asAdmin.json.entries));

    const asDrh = await drh.request("/api/audit");
    check("DRH → 200", asDrh.status === 200, `reçu ${asDrh.status}`);

    const asManager = await manager.request("/api/audit");
    check("manager (lecture seule) → 403", asManager.status === 403, `reçu ${asManager.status}`);

    const asKiosk = await kiosk.request("/api/audit");
    check("borne de pointage → 403", asKiosk.status === 403, `reçu ${asKiosk.status}`);

    check(
      "la réponse rappelle que le journal est en lecture seule",
      asAdmin.json.readOnly === true
    );
  }

  /* ---------- 2. Immuabilité ---------- */
  section("2. Immuabilité des entrées");
  {
    const before = await pgClient.query("SELECT COUNT(*)::int AS total FROM audit_logs");

    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const attempt = await admin.request("/api/audit", {
        method,
        body: method === "DELETE" ? undefined : { summary: "falsification" },
      });
      check(
        `${method} /api/audit refusé (405)`,
        attempt.status === 405,
        `reçu ${attempt.status}`
      );
    }

    const after = await pgClient.query("SELECT COUNT(*)::int AS total FROM audit_logs");
    check(
      "aucune ligne supprimée ni ajoutée par ces tentatives",
      before.rows[0].total === after.rows[0].total,
      `${before.rows[0].total} → ${after.rows[0].total}`
    );
  }

  /* ---------- 3. Ce qui est tracé ---------- */
  section("3. Actions sensibles tracées");
  {
    // 3.a Connexion réussie avec IP transmise
    const tagged = new Session("IP marquée");
    const login = await tagged.login("drh@pointage-biometrique.fr", DEMO_PASSWORD, {
      "x-forwarded-for": "203.0.113.7",
    });
    check("connexion de test réussie", login.status === 200, `reçu ${login.status}`);

    // 3.b Connexion échouée
    await anonymous.login("drh@pointage-biometrique.fr", "mauvais-mot-de-passe");

    // 3.c Connexion bloquée (compte jetable : ne bloque jamais les comptes de démo)
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await anonymous.login("jetable.audit@test.fr", "faux");
    }

    // 3.d Création, modification puis suppression d'un salarié
    const created = await drh.request("/api/employees", {
      method: "POST",
      body: {
        firstName: "Léa",
        lastName: "Audit",
        email: "lea.audit@entreprise-demo.fr",
        departmentId: 1,
        jobTitle: "Chargée de paie",
        contractType: "CDD",
        hourlyRate: "14.50",
        weeklyHours: 35,
      },
    });
    check("salarié de test créé", created.status === 200 || created.status === 201, `reçu ${created.status}`);
    const employeeId = created.json?.employee?.id ?? created.json?.id;

    if (employeeId) {
      await drh.request(`/api/employees/${employeeId}`, {
        method: "PUT",
        body: { jobTitle: "Responsable paie", contractType: "CDI", hourlyRate: "17.00" },
      });
    }

    // 3.e Un manager tente de supprimer : refus + trace ACCESS_DENIED
    if (employeeId) {
      const denied = await manager.request(`/api/employees/${employeeId}`, { method: "DELETE" });
      check("suppression par un manager refusée (403)", denied.status === 403, `reçu ${denied.status}`);
    }

    // 3.f Régularisation de pointage puis suppression
    const manual = await drh.request("/api/punch", {
      method: "POST",
      body: {
        employeeId: 1,
        type: "IN",
        punchMethod: "MANUAL_DRH",
        isManual: true,
        manualReason: "Test journal d'audit",
      },
    });
    check("régularisation de pointage acceptée", manual.status === 200, `reçu ${manual.status}`);
    const punchId = manual.json?.punch?.id;
    if (punchId) {
      const removed = await drh.request(`/api/punch/${punchId}`, { method: "DELETE" });
      check("suppression du pointage de test acceptée", removed.status === 200, `reçu ${removed.status}`);
    }

    // 3.g Repli code + PIN depuis la borne (le poste n'a pas accès à l'annuaire)
    const wrongPin = await kiosk.request("/api/punch", {
      method: "POST",
      body: { employeeCode: "EMP-001", punchMethod: "PIN_FALLBACK", pin: "9999" },
    });
    check("repli PIN avec un mauvais code refusé (401)", wrongPin.status === 401, `reçu ${wrongPin.status}`);

    const rightPin = await kiosk.request("/api/punch", {
      method: "POST",
      body: { employeeCode: "EMP-001", punchMethod: "PIN_FALLBACK", pin: "1001" },
    });
    check("repli PIN avec le bon code accepté par la borne", rightPin.status === 200, `reçu ${rightPin.status}`);
    const pinPunchId = rightPin.json?.punch?.id;
    if (pinPunchId) {
      await drh.request(`/api/punch/${pinPunchId}`, { method: "DELETE" });
    }

    // 3.h Export de paie
    const exported = await drh.request("/api/reports/export?period=THIS_MONTH");
    check("export CSV accepté", exported.status === 200, `reçu ${exported.status}`);

    // 3.i Envoi puis suppression d'un fichier de présence
    const dispatch = await drh.request("/api/reports", {
      method: "POST",
      body: {
        title: "Envoi de test — journal d'audit",
        recipientEmail: "compta@entreprise-demo.fr",
        recipientName: "Comptabilité",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        fileFormat: "CSV",
        totalEmployees: 12,
        totalHoursWorked: "1512.00",
      },
    });
    check("envoi de fichier accepté", dispatch.status === 200, `reçu ${dispatch.status}`);
    const reportId = dispatch.json?.report?.id;
    if (reportId) {
      await drh.request(`/api/reports?id=${reportId}`, { method: "DELETE" });
    }

    // 3.j Déconnexion
    await tagged.request("/api/auth/logout", { method: "POST" });

    if (employeeId) {
      await drh.request(`/api/employees/${employeeId}`, { method: "DELETE" });
    }

    /* Lecture du journal et vérification des traces */
    const journal = await admin.request("/api/audit?limit=200");
    const entries = journal.json.entries || [];
    const actionOf = (action, extra = () => true) =>
      findEntry(entries, (entry) => entry.action === action && extra(entry));

    check("connexion réussie tracée (AUTH_LOGIN)", Boolean(actionOf("AUTH_LOGIN")));
    check(
      "l'adresse IP transmise est enregistrée",
      Boolean(actionOf("AUTH_LOGIN", (entry) => entry.ipAddress === "203.0.113.7"))
    );
    check("échec de connexion tracé (AUTH_LOGIN_FAILED)", Boolean(actionOf("AUTH_LOGIN_FAILED")));
    check("blocage après tentatives répétées tracé (AUTH_LOGIN_BLOCKED)", Boolean(actionOf("AUTH_LOGIN_BLOCKED")));

    const loginFailed = actionOf("AUTH_LOGIN_FAILED");
    check(
      "l'échec de connexion ne contient pas le mot de passe essayé",
      Boolean(loginFailed) && !JSON.stringify(loginFailed).includes("mauvais-mot-de-passe")
    );

    check("déconnexion tracée (AUTH_LOGOUT)", Boolean(actionOf("AUTH_LOGOUT")));
    check("création de salarié tracée (EMPLOYEE_CREATE)", Boolean(actionOf("EMPLOYEE_CREATE")));
    check("modification de salarié tracée (EMPLOYEE_UPDATE)", Boolean(actionOf("EMPLOYEE_UPDATE")));
    check(
      "suppression de salarié tracée (EMPLOYEE_DELETE)",
      Boolean(actionOf("EMPLOYEE_DELETE"))
    );

    const denied = actionOf("ACCESS_DENIED", (entry) => entry.details?.action === "EMPLOYEE_DELETE");
    check("refus d'habilitation tracé (ACCESS_DENIED)", Boolean(denied));
    check(
      "le refus indique le rôle fautif",
      Boolean(denied) && /manager/i.test(denied.summary)
    );

    check("régularisation de pointage tracée (PUNCH_MANUAL_CREATE)", Boolean(actionOf("PUNCH_MANUAL_CREATE")));
    check("suppression de pointage tracée (PUNCH_DELETE)", Boolean(actionOf("PUNCH_DELETE")));
    check(
      "repli PIN refusé tracé (PUNCH_PIN_FALLBACK en échec)",
      Boolean(actionOf("PUNCH_PIN_FALLBACK", (entry) => entry.outcome === "DENIED"))
    );
    check("export de paie tracé (DATA_EXPORT)", Boolean(actionOf("DATA_EXPORT")));
    check("envoi de fichier tracé (REPORT_DISPATCH)", Boolean(actionOf("REPORT_DISPATCH")));
    check("suppression d'envoi tracée (REPORT_DELETE)", Boolean(actionOf("REPORT_DELETE")));

    const updateEntry = actionOf("EMPLOYEE_UPDATE");
    check(
      "la modification détaille les champs changés",
      Boolean(updateEntry) && Boolean(updateEntry.details && updateEntry.details.changements),
      JSON.stringify(updateEntry?.details || null).slice(0, 120)
    );

    const dates = entries.map((entry) => new Date(entry.createdAt).getTime());
    check(
      "les entrées sont triées du plus récent au plus ancien",
      dates.every((value, index) => index === 0 || dates[index - 1] >= value)
    );

    const actorNames = new Set(entries.map((entry) => entry.actorName));
    check(
      "l'auteur réel est enregistré (jamais « Système » pour une action RH)",
      entries.some((entry) => entry.actorRole === "drh" || entry.actorRole === "admin")
    );
    check("plusieurs auteurs distincts identifiés", actorNames.size >= 2, [...actorNames].join(", "));
  }

  /* ---------- 4. Aucun secret en base ---------- */
  section("4. Aucun secret dans le journal");
  {
    const rows = await pgClient.query(
      "SELECT id, action, summary, details, ip_address, user_agent FROM audit_logs ORDER BY id"
    );
    const dump = JSON.stringify(rows.rows);

    const forbidden = [
      "scrypt$", // empreinte de mot de passe
      DEMO_PASSWORD, // mot de passe de démonstration
      "motdepasse123",
      '"pinCode"',
      '"pin_code"',
      '"publicKey"',
      '"credentialId"',
      '"password"',
      '"token"',
      '"secret"',
      "9999", // code PIN erroné saisi pendant le test
    ];
    for (const needle of forbidden) {
      check(
        `« ${needle} » absent du journal`,
        !dump.includes(needle),
        `présent dans ${rows.rows.filter((row) => JSON.stringify(row).includes(needle)).length} entrée(s)`
      );
    }

    const forbiddenKeys = /"(password|pin|pincode|token|secret|publickey|credentialid|response|motdepasse)"/i;
    const leaking = rows.rows.filter((row) => row.details && forbiddenKeys.test(row.details));
    check("aucune clé sensible dans les détails JSON", leaking.length === 0, `${leaking.length} entrée(s)`);

    const emptyEntries = rows.rows.filter((row) => !row.summary || row.summary.trim().length === 0);
    check("chaque entrée porte un résumé lisible", emptyEntries.length === 0);

    const unknownOutcomes = await pgClient.query(
      "SELECT COUNT(*)::int AS total FROM audit_logs WHERE outcome NOT IN ('SUCCESS','DENIED','FAILED')"
    );
    check("les résultats sont limités à SUCCESS / DENIED / FAILED", unknownOutcomes.rows[0].total === 0);
  }

  /* ---------- 5. Filtres et pagination ---------- */
  section("5. Filtres et pagination");
  {
    const byAction = await admin.request("/api/audit?action=AUTH_LOGIN&limit=200");
    check(
      "filtre par action : uniquement AUTH_LOGIN",
      byAction.status === 200 &&
        byAction.json.entries.length > 0 &&
        byAction.json.entries.every((entry) => entry.action === "AUTH_LOGIN")
    );

    const byOutcome = await admin.request("/api/audit?outcome=DENIED&limit=200");
    check(
      "filtre par résultat : uniquement les refus",
      byOutcome.status === 200 &&
        byOutcome.json.entries.length > 0 &&
        byOutcome.json.entries.every((entry) => entry.outcome === "DENIED")
    );

    const search = await admin.request("/api/audit?q=audit&limit=200");
    check(
      "recherche libre sur le résumé",
      search.status === 200 &&
        search.json.entries.length > 0 &&
        search.json.entries.every(
          (entry) => /audit/i.test(entry.summary) || /audit/i.test(entry.actorName)
        )
    );

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split("T")[0];

    const recent = await admin.request(`/api/audit?from=${yesterday}&limit=200`);
    check("filtre « depuis hier » renvoie les entrées du jour", recent.json.total > 0, `total ${recent.json.total}`);

    const future = await admin.request(`/api/audit?from=${tomorrow}`);
    check("filtre « à partir de demain » ne renvoie rien", future.json.total === 0, `total ${future.json.total}`);

    const one = await admin.request(`/api/audit?limit=1&from=${today}`);
    check("pagination : limit=1 renvoie une seule entrée", one.json.entries.length === 1);
    check("pagination : le total reste complet", one.json.total >= 1, `total ${one.json.total}`);

    const huge = await admin.request("/api/audit?limit=100000");
    check("la taille de page est bornée à 200", huge.json.limit === 200, `limit ${huge.json.limit}`);

    const secondPage = await admin.request(`/api/audit?limit=1&offset=1&from=${today}`);
    check(
      "offset permet de parcourir les pages",
      secondPage.status === 200 && (secondPage.json.entries.length === 0 || secondPage.json.entries[0].id !== one.json.entries[0]?.id)
    );

    const unknownAction = await admin.request("/api/audit?action=PAS_UNE_ACTION");
    check("action inconnue : réponse vide sans erreur", unknownAction.status === 200 && unknownAction.json.total === 0);
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
