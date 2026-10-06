/**
 * Rôles et permissions — partagé entre le serveur (gardes API) et le navigateur
 * (affichage des actions autorisées). Aucune dépendance serveur ici.
 */

export type Role = "admin" | "drh" | "manager" | "kiosk";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur système",
  drh: "Direction RH & Paie",
  manager: "Manager de pôle (lecture seule)",
  kiosk: "Borne de pointage",
};

export type Capability =
  | "viewPortal" // accès aux écrans DRH (tableau de bord, salariés, paie...)
  | "punchTerminal" // utiliser la borne de pointage (empreinte / PIN)
  | "manageEmployees" // créer / modifier des salariés
  | "deleteRecords" // suppressions (salariés, pointages, pôles, envois)
  | "enrollBiometrics" // enrôler / révoquer les empreintes
  | "manualPunch" // régulariser un pointage
  | "manageDepartments" // créer / modifier des pôles et horaires
  | "dispatchReports" // envoyer des fichiers de présence
  | "manageUsers" // gérer les comptes et les rôles
  | "viewAudit" // consulter le journal d'audit
  | "promoteAdmin"; // attribuer le rôle admin

const MATRIX: Record<Role, Record<Capability, boolean>> = {
  admin: {
    viewPortal: true,
    punchTerminal: true,
    manageEmployees: true,
    deleteRecords: true,
    enrollBiometrics: true,
    manualPunch: true,
    manageDepartments: true,
    dispatchReports: true,
    manageUsers: true,
    viewAudit: true,
    promoteAdmin: true,
  },
  drh: {
    viewPortal: true,
    punchTerminal: true,
    manageEmployees: true,
    deleteRecords: true,
    enrollBiometrics: true,
    manualPunch: true,
    manageDepartments: true,
    dispatchReports: true,
    manageUsers: true,
    // Le journal d'audit est réservé à l'administration et à la DRH
    viewAudit: true,
    // Seul un administrateur peut créer un autre administrateur
    promoteAdmin: false,
  },
  manager: {
    viewPortal: true,
    punchTerminal: true,
    manageEmployees: false,
    deleteRecords: false,
    enrollBiometrics: false,
    manualPunch: false,
    manageDepartments: false,
    dispatchReports: false,
    manageUsers: false,
    viewAudit: false,
    promoteAdmin: false,
  },
  kiosk: {
    viewPortal: false,
    punchTerminal: true,
    manageEmployees: false,
    deleteRecords: false,
    enrollBiometrics: false,
    manualPunch: false,
    manageDepartments: false,
    dispatchReports: false,
    manageUsers: false,
    viewAudit: false,
    promoteAdmin: false,
  },
};

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.[capability] ?? false;
}

/** Rôles autorisés à lire les données RH (salariés, pointages, paie, rapports). */
export const PORTAL_ROLES: Role[] = ["admin", "drh", "manager"];
/** Rôles autorisés à écrire les données RH. */
export const WRITE_ROLES: Role[] = ["admin", "drh"];
/** Rôles autorisés à lire le journal d'audit. */
export const AUDIT_ROLES: Role[] = ["admin", "drh"];
/** Rôles autorisés à gérer les comptes utilisateurs. */
export const USER_MANAGER_ROLES: Role[] = ["admin", "drh"];
/** Rôles autorisés à utiliser la borne de pointage. */
export const TERMINAL_ROLES: Role[] = ["admin", "drh", "manager", "kiosk"];
