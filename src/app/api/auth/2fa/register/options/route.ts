import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { RP_NAME, getRpConfig, setTwoFactorChallengeCookie } from "@/lib/webauthn";
import { activeUserCredentials, credentialLabel, parseTransports } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/**
 * Étape 1 de l'enrôlement d'une clé de sécurité (second facteur).
 *
 * Accessible à tout compte connecté, y compris depuis une session restreinte
 * (« second facteur à configurer ») : c'est le seul moyen d'en sortir.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, undefined, undefined, {
      allowPendingTwoFactor: true,
    });
    if ("error" in guard) return guard.error;

    const { actor } = guard;
    const body = await request.json().catch(() => ({}));
    const label = credentialLabel(request, body?.label);

    const existing = await activeUserCredentials(actor.id);
    const { rpID } = getRpConfig(request);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(`utilisateur-${actor.id}`),
      userName: actor.email,
      userDisplayName: actor.name,
      attestationType: "none",
      // Une clé déjà enrôlée ne peut pas être enregistrée deux fois
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
        transports: parseTransports(credential.transports),
      })),
      authenticatorSelection: {
        // Clé découvrable non exigée : on liste explicitement les clés du
        // compte au moment de la connexion. Capteur intégré (Touch ID,
        // Windows Hello) comme clé USB FIDO2 sont acceptés.
        residentKey: "preferred",
        userVerification: "required",
      },
      supportedAlgorithmIDs: [-7, -257],
      timeout: 120_000,
    });

    const response = NextResponse.json({
      success: true,
      options,
      user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
      existingCredentials: existing.length,
      message: "Validez avec votre capteur (Touch ID, Windows Hello, clé USB FIDO2).",
    });

    setTwoFactorChallengeCookie(response, {
      challenge: options.challenge,
      kind: "two-factor-registration",
      userId: actor.id,
      label,
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/2fa/register/options error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
