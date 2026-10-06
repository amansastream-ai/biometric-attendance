import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  destroySession,
  destroyUserSessions,
  hashPassword,
  isStrongEnough,
  requireActor,
  setSessionCookie,
  createSession,
  verifyPassword,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Changement de mot de passe par l'utilisateur lui-même.
 * L'ancien mot de passe est exigé, toutes les autres sessions sont révoquées,
 * puis une nouvelle session est émise pour l'appareil courant.
 */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireActor(request);
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");

    const policyError = isStrongEnough(newPassword);
    if (policyError) {
      return NextResponse.json({ success: false, error: policyError }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, actor.id));
    if (!user) {
      return NextResponse.json({ success: false, error: "Compte introuvable." }, { status: 404 });
    }

    const verification = await verifyPassword(currentPassword, user.password);
    if (!verification.ok) {
      await recordAudit({
        action: "AUTH_PASSWORD_CHANGE",
        outcome: "FAILED",
        actor,
        request,
        entityType: "user",
        entityId: actor.id,
        summary: `Échec de changement de mot de passe : mot de passe actuel incorrect (${actor.name}).`,
      });
      return NextResponse.json(
        { success: false, error: "Mot de passe actuel incorrect." },
        { status: 401 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "Le nouveau mot de passe doit être différent de l'ancien." },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ password: await hashPassword(newPassword) })
      .where(eq(users.id, actor.id));

    // Révoque toutes les sessions de l'utilisateur…
    await destroyUserSessions(actor.id);

    await recordAudit({
      action: "AUTH_PASSWORD_CHANGE",
      actor,
      request,
      entityType: "user",
      entityId: actor.id,
      summary: `Mot de passe modifié par ${actor.name} ; toutes ses autres sessions ont été révoquées.`,
      // On ne journalise jamais le mot de passe, même haché : seulement sa longueur
      details: { longueurMotDePasse: newPassword.length },
    });

    // …puis ré-ouvre une session propre pour l'appareil courant
    const { token, expiresAt } = await createSession(actor.id, request);
    const response = NextResponse.json({
      success: true,
      message: "Mot de passe modifié. Les autres appareils ont été déconnectés.",
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error("PUT /api/auth/password error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

/** Déconnexion explicite (supprime la session courante). */
export async function DELETE(request: NextRequest) {
  await destroySession(request);
  return NextResponse.json({ success: true });
}
