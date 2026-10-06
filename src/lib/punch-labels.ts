/**
 * Libellés partagés (client + serveur) — ce fichier ne doit importer
 * aucune dépendance serveur afin de rester utilisable côté navigateur.
 */

export type PunchType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

export type PunchMethod =
  | "WEBAUTHN" // capteur biométrique vérifié cryptographiquement (WebAuthn/FIDO2)
  | "FINGERPRINT" // ancien libellé « simulation » — plus émis par le système
  | "KIOSK_PAD"
  | "MANUAL_DRH"
  | "PIN_FALLBACK" // repli code salarié + PIN, tracé comme non biométrique
  | "DEMO_SEED"; // historique de démonstration généré par /api/seed

export const PUNCH_TYPE_LABELS: Record<PunchType, string> = {
  IN: "Arrivée",
  OUT: "Départ",
  BREAK_START: "Début de pause",
  BREAK_END: "Reprise de pause",
};

export const PUNCH_METHOD_LABELS: Record<PunchMethod, string> = {
  WEBAUTHN: "Empreinte / biométrie vérifiée (WebAuthn)",
  FINGERPRINT: "Ancien pointage non vérifié",
  KIOSK_PAD: "Saisie sur borne",
  MANUAL_DRH: "Régularisation DRH",
  PIN_FALLBACK: "Code + PIN (non biométrique)",
  DEMO_SEED: "Historique de démonstration",
};

export const PUNCH_METHOD_SHORT_LABELS: Record<PunchMethod, string> = {
  WEBAUTHN: "Capteur vérifié",
  FINGERPRINT: "Non vérifié",
  KIOSK_PAD: "Borne",
  MANUAL_DRH: "Saisie DRH",
  PIN_FALLBACK: "Code + PIN",
  DEMO_SEED: "Démo",
};

export function punchMethodLabel(method: string): string {
  return (
    PUNCH_METHOD_SHORT_LABELS[method as PunchMethod] ??
    PUNCH_METHOD_LABELS[method as PunchMethod] ??
    method
  );
}

export function isVerifiedBiometricMethod(method: string): boolean {
  return method === "WEBAUTHN";
}
