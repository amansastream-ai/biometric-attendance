import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, currentActor, destroySession, sameOrigin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Déconnexion : la session est supprimée en base, le cookie effacé. */
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { success: false, error: "Requête refusée : origine non autorisée." },
        { status: 403 }
      );
    }

    // L'acteur est lu avant de détruire la session, pour la piste d'audit
    const actor = await currentActor(request);
    await destroySession(request);

    if (actor) {
      await recordAudit({
        action: "AUTH_LOGOUT",
        actor,
        request,
        entityType: "user",
        entityId: actor.id,
        summary: `Déconnexion de ${actor.name}.`,
      });
    }

    const response = NextResponse.json({ success: true, message: "Déconnecté." });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
