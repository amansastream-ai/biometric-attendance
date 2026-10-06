import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { twoFactorPolicy } from "@/lib/webauthn";
import { activeUserCredentials } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/**
 * État du second facteur pour le compte connecté.
 *
 * Accessible même depuis une session « en attente de second facteur » : c'est
 * cet écran qui indique à l'utilisateur ce qu'il doit enrôler.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, undefined, undefined, {
      allowPendingTwoFactor: true,
    });
    if ("error" in guard) return guard.error;

    const { actor } = guard;
    const credentials = await activeUserCredentials(actor.id);
    const required = can(actor.role, "twoFactorRequired");

    return NextResponse.json({
      success: true,
      enabled: credentials.length > 0,
      required,
      policy: twoFactorPolicy(),
      role: actor.role,
      roleLabel: ROLE_LABELS[actor.role as Role] ?? actor.role,
      pending: Boolean(actor.twoFactorPending),
      credentials: credentials.map((credential) => ({
        id: credential.id,
        label: credential.label,
        deviceType: credential.deviceType,
        backedUp: credential.backedUp,
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/auth/2fa error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
