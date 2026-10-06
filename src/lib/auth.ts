import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";
import { recordAudit, type AuditAction } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

/**
 * Authentification et sessions.
 *
 * - Les mots de passe sont stockés **hachés** (scrypt + sel, paramètres
 *   inclus dans l'empreinte) : la base ne contient plus de mot de passe lisible.
 * - La session est un jeton aléatoire de 32 octets, conservé **haché** en base
 *   (table `sessions`) et transmis dans un cookie HttpOnly / SameSite=Lax.
 *   Aucune donnée d'identité ne circule dans le navigateur : le serveur décide
 *   qui agit, jamais le client.
 * - `requireActor()` est utilisé par toutes les routes API sensibles ; il
 *   répond 401 (non connecté) ou 403 (rôle insuffisant).
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

export const SESSION_COOKIE = "bp_session";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type Actor = {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  departmentId: number | null;
  /** Identifiant de la session courante (permet de la « déverrouiller »). */
  sessionId?: number;
  /**
   * Session créée avant le second facteur : elle n'ouvre que l'enrôlement de
   * la clé de sécurité. Absent = session pleinement authentifiée.
   */
  twoFactorPending?: boolean;
};

/* ------------------------------------------------------------------ */
/* Mots de passe                                                       */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Vérifie un mot de passe. Accepte encore les anciennes valeurs en clair de la
 * base de démonstration et signale qu'il faut les ré-hacher (`needsRehash`).
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };

  if (!stored.startsWith("scrypt$")) {
    // Ancien stockage en clair (démo) : comparaison à temps constant puis migration
    const given = Buffer.from(password.normalize("NFKC"));
    const expected = Buffer.from(stored);
    const ok =
      given.length === expected.length && timingSafeEqual(given, expected);
    return { ok, needsRehash: ok };
  }

  const [, n, r, p, saltB64, hashB64] = stored.split("$");
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });

  return {
    ok: derived.length === expected.length && timingSafeEqual(derived, expected),
    needsRehash: false,
  };
}

export function isStrongEnough(password: string): string | null {
  if (!password || password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (password.length > 200) return "Mot de passe trop long.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(
  userId: number,
  request: NextRequest,
  { pendingTwoFactor = false }: { pendingTwoFactor?: boolean } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  await db.insert(sessions).values({
    userId,
    pendingTwoFactor,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: request.headers.get("user-agent")?.slice(0, 250) ?? null,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 60) ?? null,
  });

  // Purge opportuniste des sessions expirées
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  return { token, expiresAt };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Utilisateur connecté pour cette requête, ou null. */
export async function currentActor(request: NextRequest): Promise<Actor | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      pendingTwoFactor: sessions.pendingTwoFactor,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      departmentId: users.departmentId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));

  if (!row) return null;

  // Trace du dernier usage (utile pour l'audit et la page Utilisateurs)
  await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, row.sessionId));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    avatarUrl: row.avatarUrl,
    departmentId: row.departmentId,
    sessionId: row.sessionId,
    twoFactorPending: row.pendingTwoFactor,
  };
}

/** Lève la restriction « second facteur » d'une session après enrôlement. */
export async function clearPendingTwoFactor(sessionId: number): Promise<void> {
  await db
    .update(sessions)
    .set({ pendingTwoFactor: false })
    .where(eq(sessions.id, sessionId));
}

export async function destroySession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe, désactivation). */
export async function destroyUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/* ------------------------------------------------------------------ */
/* Gardes de routes                                                    */
/* ------------------------------------------------------------------ */

export function jsonError(message: string, status: number) {
  return Response.json({ success: false, error: message }, { status });
}

/**
 * Vérifie que la requête vient bien du site lui-même (défense CSRF en plus du
 * cookie SameSite=Lax). Les clients non-navigateur (scripts) n'envoient pas
 * d'en-tête Origin : ils restent autorisés.
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type AuditContext = {
  action: AuditAction;
  entityType?: string;
  entityId?: string | number | null;
  /** Description de l'opération tentée, affichée dans le journal. */
  label?: string;
};

/**
 * Garde d'accès : renvoie soit l'auteur de la requête, soit la réponse d'erreur
 * à retourner telle quelle.
 *
 *   const guard = await requireActor(request, ["admin", "drh"], auditContext);
 *   if ("error" in guard) return guard.error;
 *   // guard.actor est fiable : identité issue de la session serveur
 *
 * Un refus (403) est journalisé lorsque le contexte d'audit est fourni :
 * les tentatives hors périmètre apparaissent dans le journal d'audit.
 */
export async function requireActor(
  request: NextRequest,
  roles?: Role[],
  audit?: AuditContext,
  options?: { allowPendingTwoFactor?: boolean }
): Promise<{ actor: Actor } | { error: Response }> {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !sameOrigin(request)) {
    if (audit) {
      await recordAudit({
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        request,
        entityType: audit.entityType,
        entityId: audit.entityId,
        summary: `Requête refusée : origine non autorisée (${audit.label ?? audit.action}).`,
        details: { origine: request.headers.get("origin"), action: audit.action },
      });
    }
    return { error: jsonError("Requête refusée : origine non autorisée.", 403) };
  }

  const actor = await currentActor(request);
  if (!actor) {
    return {
      error: jsonError(
        "Authentification requise : connectez-vous pour accéder à cette ressource.",
        401
      ),
    };
  }

  // Session créée avant le second facteur : seuls les écrans d'enrôlement y
  // sont accessibles. Sans cette garde, un mot de passe volé suffirait.
  if (actor.twoFactorPending && !options?.allowPendingTwoFactor) {
    if (audit) {
      await recordAudit({
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        actor,
        request,
        entityType: audit.entityType,
        entityId: audit.entityId,
        summary: `Accès refusé à ${actor.name} : second facteur non encore configuré (tentative de ${
          audit.label ?? audit.action
        }).`,
        details: { action: audit.action, motif: "second facteur en attente" },
      });
    }
    return {
      error: jsonError(
        "Second facteur à configurer : enrôlez votre clé de sécurité pour accéder aux données RH.",
        403
      ),
    };
  }

  if (roles && !roles.includes(actor.role)) {
    if (audit) {
      await recordAudit({
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        actor,
        request,
        entityType: audit.entityType,
        entityId: audit.entityId,
        summary: `Accès refusé à ${actor.name} (rôle ${actor.role}) : tentative de ${
          audit.label ?? audit.action
        }.`,
        details: { action: audit.action, role: actor.role, rolesAttendus: roles },
      });
    }
    return {
      error: jsonError(
        "Accès refusé : votre rôle ne permet pas cette action.",
        403
      ),
    };
  }

  return { actor };
}

/* ------------------------------------------------------------------ */
/* Limitation des tentatives de connexion                              */
/* ------------------------------------------------------------------ */

type Attempt = { count: number; firstAt: number; blockedUntil?: number };
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 10 * 60 * 1000;

export function checkLoginThrottle(key: string): { blocked: boolean; retryInMinutes?: number } {
  const attempt = attempts.get(key);
  if (!attempt) return { blocked: false };
  if (attempt.blockedUntil && attempt.blockedUntil > Date.now()) {
    return {
      blocked: true,
      retryInMinutes: Math.max(1, Math.ceil((attempt.blockedUntil - Date.now()) / 60000)),
    };
  }
  if (Date.now() - attempt.firstAt > WINDOW_MS) {
    attempts.delete(key);
  }
  return { blocked: false };
}

export function recordLoginFailure(key: string): void {
  const attempt = attempts.get(key);
  const now = Date.now();

  if (!attempt || now - attempt.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }

  attempt.count += 1;
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.blockedUntil = now + BLOCK_MS;
    attempt.count = 0;
    attempt.firstAt = now;
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
