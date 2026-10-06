"use client";

import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { Employee, PunchRecord } from "@/types";

/**
 * Passerelle navigateur <-> API biométrique.
 *
 * Le doigt n'est jamais lu par le JavaScript : c'est le capteur du poste
 * (Touch ID, Windows Hello, capteur d'empreinte Android ou lecteur certifié
 * FIDO2) qui réalise la reconnaissance, puis qui **signe** le résultat. Le
 * serveur vérifie cette signature avec la clé publique enregistrée lors de
 * l'enrôlement. Le gabarit de l'empreinte ne quitte jamais le capteur.
 */

export type BiometricSupport = {
  webauthn: boolean;
  platformAuthenticator: boolean;
  inIframe: boolean;
  secureContext: boolean;
};

export async function detectBiometricSupport(): Promise<BiometricSupport> {
  const inIframe = typeof window !== "undefined" && window.self !== window.top;
  const secureContext = typeof window !== "undefined" ? window.isSecureContext !== false : false;

  let webauthn = false;
  let platformAuthenticator = false;

  try {
    webauthn = browserSupportsWebAuthn();
    if (webauthn) {
      platformAuthenticator = await platformAuthenticatorIsAvailable();
    }
  } catch {
    webauthn = false;
  }

  return { webauthn, platformAuthenticator, inIframe, secureContext };
}

export function describeWebAuthnError(error: unknown, support?: BiometricSupport): string {
  const err = error as { name?: string; message?: string };
  const name = err?.name || "";

  if (name === "NotAllowedError") {
    if (support?.inIframe) {
      return "Le navigateur a bloqué le capteur biométrique car l'application est affichée dans un cadre (iframe). Ouvrez BioPointage dans un onglet dédié puis réessayez.";
    }
    return "Capture biométrique annulée, ou aucun capteur d'empreinte disponible sur ce poste. Réessayez en posant le doigt sur le lecteur.";
  }
  if (name === "InvalidStateError") {
    return "Cette empreinte est déjà enregistrée sur ce capteur pour ce salarié.";
  }
  if (name === "NotSupportedError") {
    return "Aucun capteur biométrique compatible n'est disponible sur ce poste (WebAuthn/FIDO2 requis).";
  }
  if (name === "SecurityError") {
    return "Contexte non sécurisé : la reconnaissance d'empreinte exige HTTPS (ou localhost).";
  }
  if (name === "AbortError") {
    return "Opération biométrique interrompue. Reposez le doigt pour recommencer.";
  }
  if (name === "ConstraintError") {
    return "Le capteur du poste ne respecte pas les exigences de sécurité demandées (clé résidente + vérification de l'utilisateur).";
  }
  return err?.message || "Échec de l'opération biométrique.";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function postJson(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  if (!response.ok || data.success === false) {
    throw new Error(
      (typeof data.error === "string" && data.error) ||
        `Erreur serveur (${response.status}).`
    );
  }
  return data;
}

/** Enrôle réellement une empreinte sur le capteur du poste. */
export async function enrollFingerprint(params: {
  employeeId: number;
  finger: string;
  label?: string | null;
  onPhase?: (phase: "CAPTURE" | "VERIFICATION") => void;
}): Promise<{ employee: Employee; finger: string; credentialPreview: string; message: string }> {
  const optionsPayload = await postJson("/api/biometrics/register/options", {
    employeeId: params.employeeId,
  });

  params.onPhase?.("CAPTURE");

  const attestation: RegistrationResponseJSON = await startRegistration({
    optionsJSON: optionsPayload.options as PublicKeyCredentialCreationOptionsJSON,
  });

  params.onPhase?.("VERIFICATION");

  const verified = await postJson("/api/biometrics/register/verify", {
    employeeId: params.employeeId,
    finger: params.finger,
    label: params.label ?? null,
    response: attestation,
  });

  return {
    employee: verified.employee as Employee,
    finger: params.finger,
    credentialPreview:
      String((verified.credential as { id?: number })?.id ?? "") !== "undefined"
        ? `#${(verified.credential as { id?: number }).id}`
        : "",
    message: String(verified.message || "Empreinte enrôlée."),
  };
}

/** Reconnaissance d'empreinte + pointage. */
export async function punchWithFingerprint(params: {
  employeeId?: number | null;
  requestedType?: "IN" | "OUT" | "BREAK_START" | "BREAK_END" | null;
  kioskLocation?: string;
  onPhase?: (phase: "CAPTURE" | "VERIFICATION") => void;
}): Promise<{
  punch: PunchRecord;
  employee: Employee;
  verification: {
    finger: string;
    credentialIdPreview: string;
    deviceType: string;
    backedUp: boolean;
    counter: number;
  };
  message: string;
}> {
  const optionsPayload = await postJson("/api/biometrics/authenticate/options", {
    employeeId: params.employeeId ?? undefined,
  });

  params.onPhase?.("CAPTURE");

  const assertion: AuthenticationResponseJSON = await startAuthentication({
    optionsJSON: optionsPayload.options as PublicKeyCredentialRequestOptionsJSON,
  });

  params.onPhase?.("VERIFICATION");

  const verified = await postJson("/api/biometrics/authenticate/verify", {
    response: assertion,
    requestedType: params.requestedType ?? undefined,
    kioskLocation: params.kioskLocation,
  });

  return {
    punch: verified.punch as PunchRecord,
    employee: verified.employee as Employee,
    verification: verified.verification as {
      finger: string;
      credentialIdPreview: string;
      deviceType: string;
      backedUp: boolean;
      counter: number;
    },
    message: String(verified.message || "Empreinte reconnue."),
  };
}

/** Repli sans capteur : code salarié + PIN (tracé comme non biométrique). */
export async function punchWithPin(params: {
  employeeCode: string;
  pin: string;
  requestedType?: "IN" | "OUT" | "BREAK_START" | "BREAK_END" | null;
  kioskLocation?: string;
}): Promise<{ punch: PunchRecord; employee: Employee; message: string }> {
  const employeesPayload = await fetch("/api/employees").then(readJson);
  const list = (employeesPayload.employees as Employee[] | undefined) ?? [];
  const target = list.find(
    (employee) =>
      employee.employeeCode.toLowerCase() === params.employeeCode.trim().toLowerCase()
  );

  if (!target) {
    throw new Error("Code salarié inconnu.");
  }

  const data = await postJson("/api/punch", {
    employeeId: target.id,
    // Sans type explicite, le serveur déduit arrivée/pause/départ de la journée
    type: params.requestedType ?? undefined,
    punchMethod: "PIN_FALLBACK",
    pin: params.pin,
    kioskLocation: params.kioskLocation,
  });

  return {
    punch: data.punch as PunchRecord,
    employee: data.employee as Employee,
    message: String(data.message || "Pointage enregistré."),
  };
}
