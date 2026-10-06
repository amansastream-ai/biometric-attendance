import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { biometricCredentials, employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clearChallengeCookie, getRpConfig, readChallengeCookie } from "@/lib/webauthn";
import { requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Étape 2 de l'enrôlement : le capteur renvoie l'attestation signée de la
 * nouvelle empreinte. On la vérifie ici (signature, origine, défi) puis on
 * enregistre la clé publique : c'est cette vérification qui rend le pointage
 * biométrique infalsifiable.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, ["admin", "drh"]);
    if ("error" in guard) return guard.error;

    const body = await request.json().catch(() => ({}));
    const employeeId = Number(body?.employeeId);
    const finger: string = body?.finger || "Pouce Droit";
    const label: string | null = body?.label || null;
    const response = body?.response as RegistrationResponseJSON | undefined;

    if (!employeeId || !response) {
      return NextResponse.json(
        { success: false, error: "Requête d'enrôlement incomplète." },
        { status: 400 }
      );
    }

    const challenge = readChallengeCookie(request, "registration");
    if (!challenge || challenge.employeeId !== employeeId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Session d'enrôlement expirée ou invalide. Relancez la capture de l'empreinte.",
        },
        { status: 400 }
      );
    }

    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) {
      return NextResponse.json({ success: false, error: "Salarié introuvable." }, { status: 404 });
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
        { success: false, error: "Le capteur n'a pas validé la capture de l'empreinte." },
        { status: 400 }
      );
      clearChallengeCookie(failed);
      return failed;
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
      verification.registrationInfo;

    const [duplicate] = await db
      .select()
      .from(biometricCredentials)
      .where(eq(biometricCredentials.credentialId, credential.id));

    if (duplicate) {
      const conflict = NextResponse.json(
        {
          success: false,
          error:
            duplicate.employeeId === employeeId
              ? "Cette empreinte est déjà enrôlée pour ce salarié."
              : "Cette empreinte est déjà rattachée à un autre salarié. Révoquez-la d'abord depuis sa fiche.",
        },
        { status: 409 }
      );
      clearChallengeCookie(conflict);
      return conflict;
    }

    const [stored] = await db
      .insert(biometricCredentials)
      .values({
        employeeId,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter ?? 0,
        transports: (credential.transports ?? []).join(","),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid: typeof aaguid === "string" ? aaguid : null,
        finger,
        label,
        lastUsedAt: null,
      })
      .returning();

    const [updatedEmployee] = await db
      .update(employees)
      .set({
        fingerprintEnrolled: true,
        fingerprintFinger: finger,
        fingerprintTemplateId: credential.id,
        fingerprintRegisteredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId))
      .returning();

    const result = NextResponse.json({
      success: true,
      employee: updatedEmployee,
      credential: {
        id: stored.id,
        finger: stored.finger,
        deviceType: stored.deviceType,
        backedUp: stored.backedUp,
        transports: stored.transports,
      },
      message: `Empreinte (${finger}) enrôlée et vérifiée par le capteur.`,
    });

    clearChallengeCookie(result);
    return result;
  } catch (error) {
    console.error("POST /api/biometrics/register/verify error:", error);
    const failure = NextResponse.json(
      {
        success: false,
        error:
          (error as Error).message ||
          "Vérification de l'empreinte impossible. Réessayez sur le poste équipé du capteur.",
      },
      { status: 400 }
    );
    clearChallengeCookie(failure);
    return failure;
  }
}
