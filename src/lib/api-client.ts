"use client";

import type { Capability, Role } from "@/lib/permissions";

/**
 * Petit client HTTP de l'application.
 *
 * Il ne s'occupe pas de l'identité (c'est le cookie de session, HttpOnly, géré
 * par le navigateur) mais il signale les sessions expirées : quand le serveur
 * répond 401, on prévient l'application pour qu'elle réaffiche l'écran de
 * connexion au lieu de laisser des écrans vides.
 */

export class SessionExpiredError extends Error {
  constructor() {
    super("Votre session a expiré. Merci de vous reconnecter.");
    this.name = "SessionExpiredError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** Abonnement à l'événement « session expirée » (utilisé par la page racine). */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** Signale qu'une session n'est plus valide (utilisé aussi par la couche biométrique). */
export function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit,
  { notifyOn401 = true }: { notifyOn401?: boolean } = {}
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    /* réponse sans corps JSON */
  }

  if (response.status === 401) {
    // Un échec de connexion n'est pas une session expirée : on ne notifie pas
    if (notifyOn401) notifySessionExpired();
    throw new SessionExpiredError();
  }

  if (!response.ok || payload.success === false) {
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : `Erreur serveur (${response.status})`,
      response.status
    );
  }

  return payload as T;
}

export type SessionState = {
  authenticated: boolean;
  user: {
    id: number;
    name: string;
    email: string;
    role: Role;
    roleLabel: string;
    avatarUrl: string | null;
    departmentId: number | null;
  } | null;
  capabilities: Record<Capability, boolean>;
  /** Session ouverte avant le second facteur : enrôlement obligatoire. */
  twoFactorPending?: boolean;
  twoFactorPolicy?: "prompt" | "enforce";
};

export async function fetchSession(): Promise<SessionState> {
  const response = await fetch("/api/auth/session");
  const payload = (await response.json().catch(() => ({}))) as SessionState;
  if (!payload?.authenticated) {
    return {
      authenticated: false,
      user: null,
      capabilities: {} as Record<Capability, boolean>,
    };
  }
  return payload;
}

// La connexion (et le second facteur) vit dans src/lib/two-factor-client.ts :
// un seul chemin d'authentification, pour qu'aucun écran n'ouvre de session en
// sautant l'étape de la clé de sécurité.

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
