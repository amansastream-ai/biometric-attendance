import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { userCredentials, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  clearLoginFailures,
  createSession,
  recordLoginFailure,
  sameOrigin,
  setSessionCookie,
} from "@/lib/auth";
import { ROLE_LABELS, capabilitiesFor, type Role } from "@/lib/permissions";
import {
  clearTwoFactorChallengeCookie,
  getRpConfig,
  readTwoFactorChallengeCookie,
  twoFactorPolicy,
} from "@/lib/webauthn";
import { parseTransports } from "@/lib/two-factor";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Étape 2 de la connexion avec second facteur.
 *
 * La signature de la clé est vérifiée ici (défi, origine, compteur anti-rejeu)
 * **avant** la création de la session : c'est seulement à cette étape que
 * l'utilisateur est considéré comme authentifié.
 */
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { success: false, error: "Requête refusée : origine non autorisée." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const response = body?.response as AuthenticationResponseJSON | undefined;

    if (!response?.id) {
      return NextResponse.json(
        { success: false, error: "Réponse du capteur illisible." },
        { status: 400 }
      );
    }

    const challenge = readTwoFactorChallengeCookie(request, "login");
    if (!challenge?.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Vérification expirée. Saisissez de nouveau votre mot de passe.",
        },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

    const refuse = async (status: number, message: string) => {
      await recordAudit({
        action: "AUTH_2FA_FAILED",
        outcome: status === 401 ? "FAILED" : "DENIED",
        request,
        entityType: "user",
        entityId: challenge.userId,
        summary: `Second facteur refusé (${message})`,
        details: { motif: message },
      });
      const failed = NextResponse.json({ success: false, error: message }, { status });
      clearTwoFactorChallengeCookie(failed);
      return failed;
    };

    const [user] = await db.select().from(users).where(eq(users.id, challenge.userId));
    if (!user || !user.isActive) {
      return refuse(401, "Identifiants incorrects.");
    }

    const throttleKey = `${user.email}|${clientIp}`;
    const [credential] = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.credentialId, response.id),
          eq(userCredentials.userId, user.id),
          isNull(userCredentials.revokedAt)
        )
      );

    if (!credential) {
      recordLoginFailure(throttleKey);
      return refuse(401, "Clé de sécurité inconnue pour ce compte.");
    }

    const { rpID, origin } = getRpConfig(request);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: isoBase64URL.toBuffer(credential.publicKey),
          counter: credential.counter,
          transports: parseTransports(credential.transports),
        },
      });
    } catch (verificationError) {
      console.warn("2FA assertion rejected:", (verificationError as Error).message);
      recordLoginFailure(throttleKey);
      return refuse(401, "Signature de la clé invalide.");
    }

    if (!verification.verified) {
      recordLoginFailure(throttleKey);
      return refuse(401, "Signature de la clé invalide.");
    }

    const newCounter = verification.authenticationInfo.newCounter;
    await db
      .update(userCredentials)
      .set({ counter: newCounter, lastUsedAt: new Date() })
      .where(eq(userCredentials.id, credential.id));

    // Le second facteur est validé : la session complète peut être créée.
    const { token, expiresAt } = await createSession(user.id, request);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    clearLoginFailures(throttleKey);

    await recordAudit({
      action: "AUTH_2FA_SUCCESS",
      actor: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        avatarUrl: user.avatarUrl,
        departmentId: user.departmentId,
      },
      request,
      entityType: "user",
      entityId: user.id,
      summary: `Second facteur validé pour ${user.name} (clé « ${
        credential.label ?? "sans nom"
      } », ${ROLE_LABELS[user.role as Role] ?? user.role}) — session ouverte.`,
      details: {
        cle: credential.label ?? null,
        typeAppareil: credential.deviceType,
        compteur: newCounter,
      },
    });

    const result = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        roleLabel: ROLE_LABELS[user.role as Role] ?? user.role,
        avatarUrl: user.avatarUrl,
      },
      capabilities: capabilitiesFor(user.role as Role),
      twoFactorPolicy: twoFactorPolicy(),
      expiresAt,
      message: "Connexion réussie (second facteur validé).",
    });

    setSessionCookie(result, token, expiresAt);
    clearTwoFactorChallengeCookie(result);
    return result;
  } catch (error) {
    console.error("POST /api/auth/2fa/verify error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
