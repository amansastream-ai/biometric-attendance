import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "@/db";
import { biometricCredentials } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getRpConfig, setChallengeCookie } from "@/lib/webauthn";
import { requireActor } from "@/lib/auth";
import { TERMINAL_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function parseTransports(value: string): AuthenticatorTransportFuture[] | undefined {
  const transports = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[];
  return transports.length > 0 ? transports : undefined;
}

/**
 * Prépare une demande de reconnaissance d'empreinte.
 *
 * - Sans `employeeId` : **identification 1:N**. Le capteur cherche lui-même
 *   l'empreinte présentée parmi toutes les empreintes enrôlées sur la borne.
 *   Le salarié n'a rien à sélectionner, c'est le doigt qui l'identifie.
 * - Avec `employeeId` : vérification 1:1 du salarié annoncé (contrôle nominatif).
 *
 * Dans les deux cas le serveur retrouve le salarié à partir du credential
 * réellement signé par le capteur : impossible d'usurper un collègue en
 * modifiant le navigateur.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, TERMINAL_ROLES);
    if ("error" in guard) return guard.error;

    const body = await request.json().catch(() => ({}));
    const employeeId = body?.employeeId ? Number(body.employeeId) : null;

    const { rpID } = getRpConfig(request);

    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

    if (employeeId) {
      const credentials = await db
        .select()
        .from(biometricCredentials)
        .where(
          and(
            eq(biometricCredentials.employeeId, employeeId),
            isNull(biometricCredentials.revokedAt)
          )
        );

      if (credentials.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Aucune empreinte n'est enrôlée pour ce salarié. Lancez d'abord l'enrôlement biométrique.",
          },
          { status: 400 }
        );
      }

      allowCredentials = credentials.map((credential) => ({
        id: credential.credentialId,
        transports: parseTransports(credential.transports),
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "required",
      timeout: 120_000,
    });

    const response = NextResponse.json({
      success: true,
      options,
      mode: employeeId ? "VERIFY" : "IDENTIFY",
    });

    setChallengeCookie(response, {
      challenge: options.challenge,
      kind: "authentication",
      employeeId: employeeId ?? undefined,
    });

    return response;
  } catch (error) {
    console.error("POST /api/biometrics/authenticate/options error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
