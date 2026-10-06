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
const CHALLENGE_TTL_SECONDS = 300;

export type ChallengeKind = "registration" | "authentication";

export type ChallengePayload = {
  challenge: string;
  kind: ChallengeKind;
  employeeId?: number;
  exp: number;
};

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
  const fullPayload: ChallengePayload = {
    ...payload,
    exp: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");

  response.cookies.set({
    name: CHALLENGE_COOKIE,
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
  const raw = request.cookies.get(CHALLENGE_COOKIE)?.value;
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
  response.cookies.set({
    name: CHALLENGE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
