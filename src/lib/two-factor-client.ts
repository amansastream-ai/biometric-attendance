"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { Capability, Role } from "@/lib/permissions";

/**
 * Second facteur côté navigateur.
 *
 * Le mot de passe est vérifié par le serveur (étape 1), puis la clé du poste
 * signe le défi (Touch ID, Windows Hello, clé USB FIDO2). Aucun secret ne
 * transite : seule une signature est envoyée, et le gabarit biométrique reste
 * dans le capteur.
 */

export type TwoFactorUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  avatarUrl: string | null;
};

export type TwoFactorStatus = {
  enabled: boolean;
  required: boolean;
  policy: "prompt" | "enforce";
  pending: boolean;
  role: Role;
  roleLabel: string;
  credentials: {
    id: number;
    label: string | null;
    deviceType: string;
    backedUp: boolean;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
};

export type LoginOutcome =
  | { kind: "SESSION"; user: TwoFactorUser; capabilities: Record<Capability, boolean>; warning: boolean }
  | { kind: "TWO_FACTOR"; user: TwoFactorUser };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Indique si le navigateur peut utiliser un capteur (contexte sécurisé requis). */
export function twoFactorSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * Étape 1 : mot de passe. Si une clé est enrôlée, aucun session n'est ouverte —
 * l'appelant doit alors enchaîner sur `verifyTwoFactor`.
 */
export async function startLogin(email: string, password: string): Promise<LoginOutcome> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson(response);

  if (!response.ok || payload.success === false) {
    throw new Error(
      (typeof payload.error === "string" && payload.error) || "Identifiants incorrects."
    );
  }

  const user = payload.user as TwoFactorUser;
  if (payload.requiresTwoFactor) return { kind: "TWO_FACTOR", user };

  return {
    kind: "SESSION",
    user,
    capabilities: (payload.capabilities ?? {}) as Record<Capability, boolean>,
    warning: Boolean(payload.twoFactorWarning || payload.twoFactorPending),
  };
}

/** Étape 2 : défi signé par la clé du poste, puis ouverture de la session. */
export async function verifyTwoFactor(email: string, password: string): Promise<TwoFactorUser> {
  const optionsResponse = await fetch("/api/auth/2fa/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const optionsPayload = await readJson(optionsResponse);
  if (!optionsResponse.ok || optionsPayload.success === false) {
    throw new Error(
      (typeof optionsPayload.error === "string" && optionsPayload.error) ||
        "Impossible de préparer la vérification."
    );
  }

  let assertion: AuthenticationResponseJSON;
  try {
    assertion = await startAuthentication({
      optionsJSON: optionsPayload.options as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (error) {
    const message = (error as Error).name === "NotAllowedError"
      ? "Clé de sécurité non validée (délai dépassé ou annulé). Réessayez."
      : (error as Error).message;
    throw new Error(message);
  }

  const verifyResponse = await fetch("/api/auth/2fa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: assertion }),
  });
  const verified = await readJson(verifyResponse);
  if (!verifyResponse.ok || verified.success === false) {
    throw new Error(
      (typeof verified.error === "string" && verified.error) || "Vérification refusée."
    );
  }

  return verified.user as TwoFactorUser;
}

/** État du second facteur du compte connecté. */
export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const response = await fetch("/api/auth/2fa");
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      (typeof payload.error === "string" && payload.error) || "État du second facteur indisponible."
    );
  }
  return payload as unknown as TwoFactorStatus;
}

/** Enrôle une nouvelle clé de sécurité sur le compte connecté. */
export async function enrollTwoFactorKey(label?: string): Promise<{
  credentialsCount: number;
  message: string;
}> {
  const optionsResponse = await fetch("/api/auth/2fa/register/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label ?? null }),
  });
  const optionsPayload = await readJson(optionsResponse);
  if (!optionsResponse.ok || optionsPayload.success === false) {
    throw new Error(
      (typeof optionsPayload.error === "string" && optionsPayload.error) ||
        "Impossible de préparer l'enrôlement."
    );
  }

  let attestation: RegistrationResponseJSON;
  try {
    attestation = await startRegistration({
      optionsJSON: optionsPayload.options as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (error) {
    throw new Error(
      (error as Error).name === "NotAllowedError"
        ? "Enrôlement annulé ou délai dépassé. Réessayez."
        : (error as Error).message
    );
  }

  const verifyResponse = await fetch("/api/auth/2fa/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: attestation }),
  });
  const verified = await readJson(verifyResponse);
  if (!verifyResponse.ok || verified.success === false) {
    throw new Error(
      (typeof verified.error === "string" && verified.error) || "Enrôlement refusé."
    );
  }

  return {
    credentialsCount: Number(verified.credentialsCount ?? 1),
    message: String(verified.message || "Clé de sécurité enregistrée."),
  };
}

/** Révoque une clé (la sienne, ou celle d'un autre compte si gestionnaire). */
export async function revokeTwoFactorKey(
  credentialId: number,
  userId?: number
): Promise<{ remaining: number; message: string }> {
  const params = new URLSearchParams({ id: String(credentialId) });
  if (userId) params.set("userId", String(userId));

  const response = await fetch(`/api/auth/2fa/revoke?${params.toString()}`, { method: "DELETE" });
  const payload = await readJson(response);
  if (!response.ok || payload.success === false) {
    throw new Error(
      (typeof payload.error === "string" && payload.error) || "Révocation impossible."
    );
  }

  return {
    remaining: Number(payload.remaining ?? 0),
    message: String(payload.message || "Clé révoquée."),
  };
}
