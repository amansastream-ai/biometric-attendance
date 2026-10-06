import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  checkLoginThrottle,
  clearLoginFailures,
  createSession,
  hashPassword,
  recordLoginFailure,
  sameOrigin,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Connexion. L'identité n'est plus déclarée par le client : elle est vérifiée
 * ici (mot de passe haché) puis scellée dans une session serveur.
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
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email et mot de passe requis." },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const throttleKey = `${email}|${clientIp}`;

    const throttle = checkLoginThrottle(throttleKey);
    if (throttle.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Trop de tentatives échouées. Réessayez dans ${throttle.retryInMinutes} minute(s).`,
        },
        { status: 429 }
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));

    // Message identique dans les deux cas : on n'indique pas si l'email existe
    const invalid = NextResponse.json(
      { success: false, error: "Identifiants incorrects." },
      { status: 401 }
    );

    if (!user) {
      recordLoginFailure(throttleKey);
      return invalid;
    }

    const verification = await verifyPassword(password, user.password);
    if (!verification.ok) {
      recordLoginFailure(throttleKey);
      return invalid;
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: "Ce compte est désactivé. Contactez un administrateur." },
        { status: 403 }
      );
    }

    // Migration transparente des anciens mots de passe en clair
    if (verification.needsRehash) {
      await db
        .update(users)
        .set({ password: await hashPassword(password) })
        .where(eq(users.id, user.id));
    }

    const { token, expiresAt } = await createSession(user.id, request);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    clearLoginFailures(throttleKey);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        roleLabel: ROLE_LABELS[user.role as Role] ?? user.role,
        avatarUrl: user.avatarUrl,
      },
      expiresAt,
      message: "Connexion réussie.",
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
