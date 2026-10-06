import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, destroySession, sameOrigin } from "@/lib/auth";

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

    await destroySession(request);
    const response = NextResponse.json({ success: true, message: "Déconnecté." });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
