import { pgTable, serial, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Empreinte scrypt du mot de passe (« scrypt$N$r$p$sel$empreinte »).
  // Jamais de mot de passe en clair : voir src/lib/auth.ts
  password: text("password").notNull(),
  role: text("role").notNull().default("drh"), // 'admin' | 'drh' | 'manager' | 'kiosk'
  departmentId: integer("department_id"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  // Second facteur (clé WebAuthn / Touch ID / Windows Hello) : obligatoire
  // pour les rôles sensibles dès qu'une clé est enrôlée (voir
  // src/app/api/auth/2fa/*). Le drapeau évite une requête à chaque connexion.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorEnrolledAt: timestamp("two_factor_enrolled_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Clés de sécurité du **compte utilisateur** (second facteur), distinctes des
 * empreintes des salariés : ici, la clé protège l'accès aux écrans RH.
 *
 * Seule la clé publique est conservée : elle permet au serveur de vérifier la
 * signature du capteur au moment de la connexion. Aucun gabarit biométrique,
 * aucun secret ne quitte le poste de l'utilisateur.
 */
export const userCredentials = pgTable(
  "user_credentials",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").notNull().default(""),
    deviceType: text("device_type").notNull().default("singleDevice"),
    backedUp: boolean("backed_up").notNull().default(false),
    aaguid: text("aaguid"),
    label: text("label"), // ex: « MacBook de Sophie », « YubiKey bureau »
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_credentials_user_idx").on(table.userId)]
);

/**
 * Sessions authentifiées : le jeton du cookie n'est stocké que haché, il peut
 * donc être révoqué (déconnexion, changement de mot de passe, désactivation).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    // Session « en attente de second facteur » : elle ouvre uniquement
    // l'enrôlement de la clé, jamais les données RH (voir requireActor).
    pendingTwoFactor: boolean("pending_two_factor").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)]
);

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  color: text("color").notNull().default("#3b82f6"),
  standardStart: text("standard_start").notNull().default("08:30"),
  standardEnd: text("standard_end").notNull().default("17:30"),
  breakDurationMinutes: integer("break_duration_minutes").notNull().default(60),
  weeklyTargetHours: integer("weekly_target_hours").notNull().default(35),
  gracePeriodMinutes: integer("grace_period_minutes").notNull().default(10),
  managerName: text("manager_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  departmentId: integer("department_id").notNull(),
  jobTitle: text("job_title").notNull(),
  avatarUrl: text("avatar_url"),
  fingerprintEnrolled: boolean("fingerprint_enrolled").notNull().default(false),
  fingerprintFinger: text("fingerprint_finger").notNull().default("Pouce Droit"),
  fingerprintTemplateId: text("fingerprint_template_id"),
  fingerprintRegisteredAt: timestamp("fingerprint_registered_at"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("22.50"),
  contractType: text("contract_type").notNull().default("CDI"), // CDI, CDD, Alternance, Stage
  weeklyHours: integer("weekly_hours").notNull().default(35),
  status: text("status").notNull().default("active"), // 'active', 'inactive', 'on_leave'
  pinCode: text("pin_code").default("1234"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Empreintes réellement enrôlées sur un capteur biométrique (WebAuthn / FIDO2).
 *
 * La clé publique est fournie par le capteur (Secure Enclave, TPM, capteur
 * d'empreinte Android/Windows Hello...). Elle permet au serveur de **vérifier
 * cryptographiquement** que c'est bien le doigt du salarié qui a été présenté
 * au moment du pointage : le gabarit biométrique ne quitte jamais le capteur.
 */
export const biometricCredentials = pgTable(
  "biometric_credentials",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull(),
    // Identifiant opaque du credential (base64url) renvoyé par le capteur
    credentialId: text("credential_id").notNull().unique(),
    // Clé publique COSE du capteur (base64url) — sert à vérifier les signatures
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").notNull().default(""),
    deviceType: text("device_type").notNull().default("singleDevice"), // singleDevice | multiDevice
    backedUp: boolean("backed_up").notNull().default(false),
    aaguid: text("aaguid"),
    finger: text("finger").notNull().default("Pouce Droit"),
    label: text("label"), // ex: "MacBook de Fatou", "Borne entrée A"
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("biometric_credentials_employee_idx").on(table.employeeId)]
);

/**
 * Journal d'audit : trace inaltérable des actions sensibles.
 *
 * Aucune route ne permet de modifier ou supprimer une entrée (pas d'API de
 * mise à jour) : c'est ce qui donne sa valeur à la piste d'audit en cas de
 * contrôle RGPD ou de litige sur un pointage. Aucun secret (mot de passe, PIN,
 * jeton) n'y est jamais écrit : voir `redactDetails()` dans src/lib/audit.ts.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    // Auteur (null pour une action système ou une tentative anonyme)
    actorId: integer("actor_id"),
    actorName: text("actor_name").notNull().default("Système"),
    actorRole: text("actor_role"),
    // Code technique de l'action, ex. 'AUTH_LOGIN', 'EMPLOYEE_DELETE'
    action: text("action").notNull(),
    entityType: text("entity_type"), // 'employee' | 'user' | 'punch' | 'biometric_credential'...
    entityId: text("entity_id"),
    outcome: text("outcome").notNull().default("SUCCESS"), // SUCCESS | DENIED | FAILED
    // Phrase lisible en français, affichée telle quelle dans l'interface
    summary: text("summary").notNull(),
    details: text("details"), // JSON sérialisé, expurgé de tout secret
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_action_idx").on(table.action),
  ]
);

export const punchRecords = pgTable("punch_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  punchTime: timestamp("punch_time", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(), // 'IN' (Arrivée), 'OUT' (Départ), 'BREAK_START' (Pause), 'BREAK_END' (Reprise)
  punchMethod: text("punch_method").notNull().default("MANUAL_DRH"), // 'WEBAUTHN' (capteur vérifié), 'PIN_FALLBACK', 'KIOSK_PAD', 'MANUAL_DRH', 'DEMO_SEED'
  fingerMatched: text("finger_matched"),
  biometricConfidence: integer("biometric_confidence"),
  kioskLocation: text("kiosk_location").notNull().default("Borne Entrée Principale"),
  isManual: boolean("is_manual").notNull().default(false),
  manualReason: text("manual_reason"),
  manualEditedBy: text("manual_edited_by"),
  status: text("status").notNull().default("VALID"), // 'VALID', 'LATE', 'OVERTIME', 'EARLY_DEPARTURE'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reportDispatches = pgTable("report_dispatches", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name").notNull(),
  periodType: text("period_type").notNull().default("THIS_MONTH"), // THIS_WEEK, THIS_MONTH, LAST_MONTH, CUSTOM
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  departmentId: integer("department_id"),
  fileFormat: text("file_format").notNull().default("CSV"), // 'CSV', 'XLSX_CSV', 'PDF_BULLETIN'
  totalEmployees: integer("total_employees").notNull().default(0),
  totalHoursWorked: numeric("total_hours_worked", { precision: 10, scale: 2 }).notNull().default("0"),
  totalOvertimeHours: numeric("total_overtime_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  totalLateMinutes: integer("total_late_minutes").notNull().default(0),
  status: text("status").notNull().default("SENT"), // 'SENT', 'DELIVERED', 'SCHEDULED'
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentBy: text("sent_by").notNull().default("DRH Admin"),
  notes: text("notes"),
});
