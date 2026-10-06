import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db } from "@/db";
import { biometricCredentials, employees } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { clearChallengeCookie, getRpConfig, readChallengeCookie } from "@/lib/webauthn";
import {
  createPunch,
  getLastPunchOfDay,
  inferPunchType,
  isDoubleScan,
  validateSequence,
  type PunchType,
} from "@/lib/punching";
import { requireActor } from "@/lib/auth";
import { TERMINAL_ROLES } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { PUNCH_TYPE_LABELS } from "@/lib/punch-labels";

export const dynamic = "force-dynamic";

const PUNCH_TYPES: PunchType[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

function parseTransports(value: string): AuthenticatorTransportFuture[] | undefined {
  const transports = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[];
  return transports.length > 0 ? transports : undefined;
}

function errorResponse(message: string, status: number, request: NextRequest) {
  const response = NextResponse.json({ success: false, error: message }, { status });
  clearChallengeCookie(response);
  return response;
}

/**
 * Pointage biométrique : le capteur signe une assertion avec l'empreinte
 * présentée. Le serveur :
 *   1. vérifie la signature avec la clé publique stockée à l'enrôlement,
 *   2. retrouve le salarié **à partir du credential signé** (jamais depuis un
 *      identifiant envoyé par le navigateur — c'est ce qui empêche de badger
 *      pour un collègue),
 *   3. enregistre le pointage avec le type déduit de sa journée.
 */
export async function POST(request: NextRequest) {
  try {
    // La borne doit être ouverte par un compte autorisé (kiosque inclus)
    const guard = await requireActor(request, TERMINAL_ROLES);
    if ("error" in guard) return guard.error;
    const actor = guard.actor;

    const body = await request.json().catch(() => ({}));
    const response = body?.response as AuthenticationResponseJSON | undefined;
    const requestedType: PunchType | undefined =
      body?.requestedType && PUNCH_TYPES.includes(body.requestedType) ? body.requestedType : undefined;
    const kioskLocation: string = body?.kioskLocation || "Borne Entrée Principale";

    if (!response?.id) {
      return errorResponse("Réponse du capteur biométrique illisible.", 400, request);
    }

    const challenge = readChallengeCookie(request, "authentication");
    if (!challenge) {
      return errorResponse(
        "Session de reconnaissance expirée. Reposez le doigt sur le capteur.",
        400,
        request
      );
    }

    const [credential] = await db
      .select()
      .from(biometricCredentials)
      .where(
        and(
          eq(biometricCredentials.credentialId, response.id),
          isNull(biometricCredentials.revokedAt)
        )
      );

    if (!credential) {
      return errorResponse(
        "Empreinte inconnue de cette borne. Le salarié doit d'abord être enrôlé sur ce poste.",
        404,
        request
      );
    }

    // Contrôle nominatif : l'empreinte présentée doit être celle du salarié annoncé
    if (challenge.employeeId && challenge.employeeId !== credential.employeeId) {
      // Tentative de pointage pour un collègue (ou erreur de contrôle) : tracée
      await recordAudit({
        action: "BIOMETRIC_REJECTED",
        outcome: "DENIED",
        actor,
        request,
        entityType: "employee",
        entityId: challenge.employeeId,
        summary: `Pointage refusé : une empreinte n'appartenant pas au salarié n°${challenge.employeeId} a été présentée en contrôle nominatif.`,
        details: {
          salarieAttendu: challenge.employeeId,
          proprietaireReel: credential.employeeId,
          borne: kioskLocation,
        },
      });
      return errorResponse(
        "L'empreinte présentée ne correspond pas au salarié sélectionné. Pointage refusé.",
        403,
        request
      );
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, credential.employeeId));

    if (!employee) {
      return errorResponse("Salarié rattaché à cette empreinte introuvable.", 404, request);
    }
    if (employee.status === "inactive") {
      return errorResponse(
        "Ce compte salarié est désactivé : pointage refusé. Contactez les RH.",
        403,
        request
      );
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
      console.warn("Biometric assertion rejected:", (verificationError as Error).message);
      return errorResponse(
        "Signature biométrique invalide : l'empreinte présentée ne correspond pas à celle enrôlée.",
        401,
        request
      );
    }

    if (!verification.verified) {
      await recordAudit({
        action: "BIOMETRIC_REJECTED",
        outcome: "DENIED",
        actor,
        request,
        entityType: "biometric_credential",
        entityId: credential.id,
        summary: `Pointage refusé : signature biométrique invalide (credential ${credential.credentialId.slice(0, 10)}…).`,
        details: { borne: kioskLocation, motif: "signature non vérifiée" },
      });
      return errorResponse(
        "Signature biométrique invalide : pointage refusé.",
        401,
        request
      );
    }

    const { newCounter, credentialDeviceType, credentialBackedUp } = verification.authenticationInfo;

    // Le compteur ne doit jamais reculer (détection de rejeu). Certains capteurs
    // (Apple notamment) renvoient toujours 0 : on conserve alors la valeur.
    await db
      .update(biometricCredentials)
      .set({
        counter: newCounter > credential.counter ? newCounter : credential.counter,
        deviceType: credentialDeviceType ?? credential.deviceType,
        backedUp: credentialBackedUp ?? credential.backedUp,
        lastUsedAt: new Date(),
      })
      .where(eq(biometricCredentials.id, credential.id));

    // Détermine le type de pointage (auto : arrivée -> pause -> départ)
    const lastPunch = await getLastPunchOfDay(employee.id);

    if (isDoubleScan(lastPunch?.punchTime)) {
      return errorResponse(
        "Un pointage vient d'être enregistré pour ce salarié (moins de 15 secondes). Patientez avant de repasser le doigt.",
        429,
        request
      );
    }

    const lastType = (lastPunch?.type as PunchType | undefined) ?? null;
    const punchType = requestedType ?? inferPunchType(lastType);

    const sequenceError = validateSequence(lastType, punchType);
    if (sequenceError) {
      return errorResponse(sequenceError, 409, request);
    }

    const created = await createPunch({
      employeeId: employee.id,
      type: punchType,
      punchMethod: "WEBAUTHN",
      fingerMatched: credential.finger,
      biometricConfidence: 100,
      kioskLocation,
      notes: `WebAuthn vérifié • credential ${credential.credentialId.slice(0, 10)}… • ${credentialDeviceType} • UV=oui • compteur=${newCounter}${
        requestedType ? "" : " • type déduit automatiquement"
      }`,
    });

    if (!created) {
      return errorResponse("Enregistrement du pointage impossible.", 500, request);
    }

    await recordAudit({
      action: "BIOMETRIC_PUNCH",
      actor,
      request,
      entityType: "punch",
      entityId: created.punch.id,
      summary: `Pointage par empreinte vérifiée : ${employee.firstName} ${employee.lastName} — ${
        PUNCH_TYPE_LABELS[created.punch.type as keyof typeof PUNCH_TYPE_LABELS] ?? created.punch.type
      }${created.punch.status === "LATE" ? " (retard)" : ""}.`,
      details: {
        doigt: credential.finger,
        credential: `${credential.credentialId.slice(0, 10)}…`,
        typeAppareil: credentialDeviceType,
        compteur: newCounter,
        borne: kioskLocation,
        verificationUtilisateur: true,
        typeDeduit: !requestedType,
      },
    });

    const result = NextResponse.json({
      success: true,
      punch: created.punch,
      employee: created.employee,
      verification: {
        method: "WEBAUTHN",
        finger: credential.finger,
        credentialIdPreview: `${credential.credentialId.slice(0, 10)}…`,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        counter: newCounter,
        userVerified: true,
      },
      message: `Empreinte reconnue : ${employee.firstName} ${employee.lastName}`,
    });

    clearChallengeCookie(result);
    return result;
  } catch (error) {
    console.error("POST /api/biometrics/authenticate/verify error:", error);
    return errorResponse((error as Error).message || "Erreur de vérification biométrique.", 500, request);
  }
}
