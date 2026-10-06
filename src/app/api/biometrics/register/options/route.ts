import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "@/db";
import { biometricCredentials, employees } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { RP_NAME, getRpConfig, setChallengeCookie } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

function parseTransports(value: string): AuthenticatorTransportFuture[] | undefined {
  const transports = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[];
  return transports.length > 0 ? transports : undefined;
}

/**
 * Étape 1 de l'enrôlement : prépare les options envoyées au capteur
 * biométrique du poste (Touch ID, Windows Hello, capteur Android...).
 * Le défi ("challenge") est stocké dans un cookie signé, jamais en clair
 * côté client, et le gabarit ne quitte jamais le capteur.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const employeeId = Number(body?.employeeId);

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "Identifiant du salarié manquant." },
        { status: 400 }
      );
    }

    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) {
      return NextResponse.json({ success: false, error: "Salarié introuvable." }, { status: 404 });
    }

    const existing = await db
      .select()
      .from(biometricCredentials)
      .where(
        and(
          eq(biometricCredentials.employeeId, employeeId),
          isNull(biometricCredentials.revokedAt)
        )
      );

    const { rpID } = getRpConfig(request);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(`employe-${employee.id}`),
      userName: employee.email || employee.employeeCode,
      userDisplayName: `${employee.firstName} ${employee.lastName}`,
      attestationType: "none",
      // Empreintes déjà connues pour ce salarié : le capteur refusera un doublon
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
        transports: parseTransports(credential.transports),
      })),
      authenticatorSelection: {
        // Clé résidente = le capteur peut retrouver le salarié tout seul (1:N)
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      preferredAuthenticatorType: "localDevice",
      supportedAlgorithmIDs: [-7, -257],
      timeout: 120_000,
    });

    const response = NextResponse.json({
      success: true,
      options,
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeCode,
      },
      alreadyEnrolled: existing.length,
    });

    setChallengeCookie(response, {
      challenge: options.challenge,
      kind: "registration",
      employeeId,
    });

    return response;
  } catch (error) {
    console.error("POST /api/biometrics/register/options error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
