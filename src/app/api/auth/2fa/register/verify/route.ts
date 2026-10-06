import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { userCredentials, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clearPendingTwoFactor, requireActor } from "@/lib/auth";
import {
  clearTwoFactorChallengeCookie,
  getRpConfig,
  readTwoFactorChallengeCookie,
} from "@/lib/webauthn";
import { activeUserCredentials } from "@/lib/two-factor";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Étape 2 de l'enrôlement : le capteur renvoie l'attestation de la clé.
 * On vérifie la signature puis on enregistre la clé **publique** du compte.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, undefined, undefined, {
      allowPendingTwoFactor: true,
    });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const body = await request.json().catch(() => ({}));
    const response = body?.response as RegistrationResponseJSON | undefined;
    if (!response?.id) {
      return NextResponse.json(
        { success: false, error: "Réponse du capteur illisible." },
        { status: 400 }
      );
    }

    const challenge = readTwoFactorChallengeCookie(request, "two-factor-registration");
    if (!challenge || challenge.userId !== actor.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Session d'enrôlement expirée. Relancez l'ajout de la clé de sécurité.",
        },
        { status: 400 }
      );
    }

    const { rpID, origin } = getRpConfig(request);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });

    if (!verification.verified) {
      const failed = NextResponse.json(
        { success: false, error: "La clé de sécurité n'a pas validé l'enrôlement." },
        { status: 400 }
      );
      clearTwoFactorChallengeCookie(failed);
      return failed;
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
      verification.registrationInfo;

    const [duplicate] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.credentialId, credential.id));

    if (duplicate) {
      const conflict = NextResponse.json(
        {
          success: false,
          error:
            duplicate.userId === actor.id
              ? "Cette clé est déjà enregistrée sur votre compte."
              : "Cette clé est déjà rattachée à un autre compte.",
        },
        { status: 409 }
      );
      clearTwoFactorChallengeCookie(conflict);
      return conflict;
    }

    const label = challenge.label ?? "Clé de sécurité";

    const [stored] = await db
      .insert(userCredentials)
      .values({
        userId: actor.id,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter ?? 0,
        transports: (credential.transports ?? []).join(","),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid: typeof aaguid === "string" ? aaguid : null,
        label,
      })
      .returning();

    await db
      .update(users)
      .set({ twoFactorEnabled: true, twoFactorEnrolledAt: new Date() })
      .where(eq(users.id, actor.id));

    // Session restreinte : l'enrôlement vient d'être fait, on la déverrouille
    // pour ne pas obliger l'utilisateur à ressaisir son mot de passe.
    if (actor.twoFactorPending && actor.sessionId) {
      await clearPendingTwoFactor(actor.sessionId);
    }

    const total = await activeUserCredentials(actor.id);

    await recordAudit({
      action: "AUTH_2FA_ENROLL",
      actor,
      request,
      entityType: "user_credential",
      entityId: stored.id,
      summary: `Clé de sécurité « ${label} » enrôlée pour le compte ${actor.name} (${actor.role}).`,
      details: {
        cle: label,
        typeAppareil: credentialDeviceType,
        sauvegardeCle: credentialBackedUp,
        aaguid: typeof aaguid === "string" ? aaguid : null,
        totalCles: total.length,
        sessionDeverrouillee: Boolean(actor.twoFactorPending),
      },
    });

    const result = NextResponse.json({
      success: true,
      credential: {
        id: stored.id,
        label: stored.label,
        deviceType: stored.deviceType,
        createdAt: stored.createdAt,
      },
      credentialsCount: total.length,
      message: `Clé de sécurité « ${label} » enregistrée : elle sera demandée à chaque connexion.`,
    });

    clearTwoFactorChallengeCookie(result);
    return result;
  } catch (error) {
    console.error("POST /api/auth/2fa/register/verify error:", error);
    const failure = NextResponse.json(
      {
        success: false,
        error:
          (error as Error).message ||
          "Enrôlement impossible. Vérifiez que le poste dispose d'un capteur ou d'une clé FIDO2.",
      },
      { status: 400 }
    );
    clearTwoFactorChallengeCookie(failure);
    return failure;
  }
}
