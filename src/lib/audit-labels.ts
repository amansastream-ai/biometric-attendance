/**
 * Libellés du journal d'audit — module **sans dépendance serveur**.
 *
 * `@/lib/audit` importe la base de données et `NextRequest` : il ne doit jamais
 * être chargé par un composant client. Les libellés afﬁchés dans l'interface
 * vivent donc ici, et `@/lib/audit` les ré-exporte pour le serveur.
 */

export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILED";

export type AuditAction =
  | "AUTH_LOGIN"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_LOGIN_BLOCKED"
  | "AUTH_LOGOUT"
  | "AUTH_PASSWORD_CHANGE"
  | "AUTH_2FA_REQUIRED"
  | "AUTH_2FA_SUCCESS"
  | "AUTH_2FA_FAILED"
  | "AUTH_2FA_BLOCKED"
  | "AUTH_2FA_ENROLL"
  | "AUTH_2FA_REVOKE"
  | "AUTH_2FA_MISSING"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "EMPLOYEE_CREATE"
  | "EMPLOYEE_UPDATE"
  | "EMPLOYEE_DELETE"
  | "DEPARTMENT_CREATE"
  | "DEPARTMENT_UPDATE"
  | "DEPARTMENT_DELETE"
  | "PUNCH_MANUAL_CREATE"
  | "PUNCH_MANUAL_UPDATE"
  | "PUNCH_DELETE"
  | "PUNCH_PIN_FALLBACK"
  | "BIOMETRIC_ENROLL"
  | "BIOMETRIC_REVOKE"
  | "BIOMETRIC_PUNCH"
  | "BIOMETRIC_REJECTED"
  | "REPORT_DISPATCH"
  | "REPORT_DELETE"
  | "DATA_EXPORT"
  | "SEED_RESET"
  | "ACCESS_DENIED";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  AUTH_LOGIN: "Connexion réussie",
  AUTH_LOGIN_FAILED: "Échec de connexion",
  AUTH_LOGIN_BLOCKED: "Connexion bloquée (tentatives répétées)",
  AUTH_LOGOUT: "Déconnexion",
  AUTH_PASSWORD_CHANGE: "Changement de mot de passe",
  AUTH_2FA_REQUIRED: "Second facteur demandé",
  AUTH_2FA_SUCCESS: "Second facteur validé",
  AUTH_2FA_FAILED: "Second facteur refusé",
  AUTH_2FA_BLOCKED: "Second facteur bloqué (tentatives répétées)",
  AUTH_2FA_ENROLL: "Enrôlement d'une clé de sécurité",
  AUTH_2FA_REVOKE: "Révocation d'une clé de sécurité",
  AUTH_2FA_MISSING: "Connexion sans second facteur (non configuré)",
  USER_CREATE: "Création de compte",
  USER_UPDATE: "Modification de compte",
  USER_DELETE: "Suppression de compte",
  EMPLOYEE_CREATE: "Création de salarié",
  EMPLOYEE_UPDATE: "Modification de salarié",
  EMPLOYEE_DELETE: "Suppression de salarié",
  DEPARTMENT_CREATE: "Création de pôle",
  DEPARTMENT_UPDATE: "Modification de pôle",
  DEPARTMENT_DELETE: "Suppression de pôle",
  PUNCH_MANUAL_CREATE: "Pointage manuel (DRH)",
  PUNCH_MANUAL_UPDATE: "Modification de pointage",
  PUNCH_DELETE: "Suppression de pointage",
  PUNCH_PIN_FALLBACK: "Pointage par code + PIN",
  BIOMETRIC_ENROLL: "Enrôlement d'empreinte",
  BIOMETRIC_REVOKE: "Révocation d'empreinte",
  BIOMETRIC_PUNCH: "Pointage par empreinte vérifiée",
  BIOMETRIC_REJECTED: "Pointage biométrique refusé",
  REPORT_DISPATCH: "Envoi de fichier de présence",
  REPORT_DELETE: "Suppression d'un envoi",
  DATA_EXPORT: "Export de données (paie)",
  SEED_RESET: "Réinitialisation des données de démo",
  ACCESS_DENIED: "Accès refusé",
};

export const AUDIT_OUTCOME_LABELS: Record<AuditOutcome, string> = {
  SUCCESS: "Effectué",
  DENIED: "Refusé",
  FAILED: "Échoué",
};

/** Libellé d'une action inconnue (ancienne entrée, action retirée du code). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

/** Libellé d'un résultat d'audit. */
export function auditOutcomeLabel(outcome: string): string {
  return AUDIT_OUTCOME_LABELS[outcome as AuditOutcome] ?? outcome;
}

/** Libellé lisible d'un rôle, sans dépendre du module de permissions. */
export function roleLabel(role: string | null | undefined): string {
  const labels: Record<string, string> = {
    admin: "administrateur",
    drh: "DRH",
    manager: "manager",
    kiosk: "borne",
  };
  return role ? labels[role] ?? role : "inconnu";
}

/** Libellé lisible d'un type d'entité journalisée. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: "Compte utilisateur",
  employee: "Salarié",
  department: "Pôle",
  punch: "Pointage",
  biometric_credential: "Empreinte",
  report: "Envoi de fichier",
  seed: "Données de démonstration",
  session: "Session",
  user_credential: "Clé de sécurité",
};
