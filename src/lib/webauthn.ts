import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Utilitaires WebAuthn partagés par les routes /api/biometrics/*.
 *
 * Le "challenge" envoyé au capteur est stocké dans un cookie HttpOnly signé
 * (HMAC) plutôt qu'en base : il est donc impossible à falsifier côté client et
 * il expire au bout de 5 minutes. Le cookie est supprimé dès que la réponse du
 * capteur a été vérifiée (protection anti-rejeu).
 */

export const RP_NAME = "BioPointage";

const CHALLENGE_COOKIE = "bp_bio_challenge";
// Cookie distinct pour le second facteur : sur un poste partagé (borne), un
// enrôlement d'empreinte et une connexion 2FA peuvent se croiser, les deux
// défis ne doivent jamais s'écraser l'un l'autre.
const TWO_FACTOR_COOKIE = "bp_2fa_challenge";
const CHALLENGE_TTL_SECONDS = 300;

export type ChallengeKind = "registration" | "authentication";
export type TwoFactorChallengeKind = "two-factor-registration" | "login";

export type ChallengePayload = {
  challenge: string;
  kind: ChallengeKind | TwoFactorChallengeKind;
  employeeId?: number;
  userId?: number;
  label?: string;
  exp: number;
};

/**
 * Politique de second facteur.
 *
 * - `prompt` (défaut) : une clé enrôlée est exigée à la connexion ; un compte
 *   sensible qui n'en a pas encore est signalé (bannière + journal) mais peut
 *   se connecter pour aller l'enrôler.
 * - `enforce` : un compte sensible sans clé n'obtient qu'une session restreinte,
 *   limitée à l'enrôlement de sa clé — aucune donnée RH n'est accessible.
 *
 * `prompt` garde la démonstration utilisable ; la production doit viser
 * `enforce` (voir README-SECURITE.md).
 */
export type TwoFactorPolicy = "prompt" | "enforce";

export function twoFactorPolicy(): TwoFactorPolicy {
  return process.env.TWO_FACTOR_POLICY === "enforce" ? "enforce" : "prompt";
}

/** Domaine (RP ID) et origine attendus par le capteur, déduits de la requête. */
export function getRpConfig(request: NextRequest): { rpID: string; origin: string } {
  const rawHost = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000"
  )
    .split(",")[0]
    .trim();

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(rawHost);
  const protocol = forwardedProto || (isLocalhost ? "http" : "https");

  return {
    rpID: rawHost.replace(/:\d+$/, ""),
    origin: `${protocol}://${rawHost}`,
  };
}

function secret(): string {
  return (
    process.env.WEBAUTHN_SECRET ||
    process.env.SEED_SECRET ||
    "biopointage-cle-de-developpement-a-changer"
  );
}

/** Indique si l'application tourne encore avec la clé de développement. */
export function usingDevelopmentSecret(): boolean {
  return !process.env.WEBAUTHN_SECRET && !process.env.SEED_SECRET;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function setChallengeCookie(
  response: NextResponse,
  payload: Omit<ChallengePayload, "exp">
): void {
  writeChallenge(response, CHALLENGE_COOKIE, payload);
}

function writeChallenge(
  response: NextResponse,
  cookieName: string,
  payload: Omit<ChallengePayload, "exp">
): void {
  const fullPayload: ChallengePayload = {
    ...payload,
    exp: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");

  response.cookies.set({
    name: cookieName,
    value: `${encoded}.${sign(encoded)}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

export function readChallengeCookie(
  request: NextRequest,
  expectedKind: ChallengeKind
): ChallengePayload | null {
  return readChallenge(request, CHALLENGE_COOKIE, expectedKind);
}

function readChallenge(
  request: NextRequest,
  cookieName: string,
  expectedKind: ChallengeKind | TwoFactorChallengeKind
): ChallengePayload | null {
  const raw = request.cookies.get(cookieName)?.value;
  if (!raw) return null;

  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as ChallengePayload;

    if (payload.kind !== expectedKind) return null;
    if (!payload.challenge || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function clearChallengeCookie(response: NextResponse): void {
  clearCookie(response, CHALLENGE_COOKIE);
}

function clearCookie(response: NextResponse, cookieName: string): void {
  response.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Second facteur des comptes utilisateurs (clé WebAuthn du poste)     */
/* ------------------------------------------------------------------ */

export function setTwoFactorChallengeCookie(
  response: NextResponse,
  payload: Omit<ChallengePayload, "exp">
): void {
  writeChallenge(response, TWO_FACTOR_COOKIE, payload);
}

export function readTwoFactorChallengeCookie(
  request: NextRequest,
  expectedKind: TwoFactorChallengeKind
): ChallengePayload | null {
  return readChallenge(request, TWO_FACTOR_COOKIE, expectedKind);
}

export function clearTwoFactorChallengeCookie(response: NextResponse): void {
  clearCookie(response, TWO_FACTOR_COOKIE);
}
