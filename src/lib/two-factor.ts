import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "@/db";
import { userCredentials } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

/**
 * Second facteur des comptes utilisateurs (clé WebAuthn du poste).
 *
 * Différence avec les empreintes des salariés : ici la clé protège l'accès aux
 * écrans RH. Le serveur ne conserve que la clé **publique** ; le gabarit
 * biométrique, le code du téléphone ou la clé privée ne quittent jamais le
 * capteur de l'utilisateur.
 */

export function parseTransports(value: string): AuthenticatorTransportFuture[] | undefined {
  const transports = value
    .split(",")
    .map((transport) => transport.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[];
  return transports.length > 0 ? transports : undefined;
}

/** Clés actives d'un compte (les clés révoquées sont conservées pour l'audit). */
export async function activeUserCredentials(userId: number) {
  return db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.userId, userId), isNull(userCredentials.revokedAt)));
}

/** Libellé proposé pour une clé, à partir de l'appareil qui se présente. */
export function credentialLabel(request: NextRequest, provided?: string): string {
  if (provided && provided.trim()) return provided.trim().slice(0, 80);
  const agent = request.headers.get("user-agent") ?? "";
  if (/iphone|ipad|ios/i.test(agent)) return "Appareil iOS";
  if (/android/i.test(agent)) return "Appareil Android";
  if (/macintosh|mac os/i.test(agent)) return "Mac (Touch ID)";
  if (/windows/i.test(agent)) return "PC Windows (Windows Hello)";
  if (/linux/i.test(agent)) return "Poste Linux";
  return "Clé de sécurité";
}
