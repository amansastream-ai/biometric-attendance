import { pgTable, serial, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("drh"), // 'admin' | 'drh' | 'manager' | 'kiosk'
  departmentId: integer("department_id"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
