import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userCredentials, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { can, TWO_FACTOR_ROLES, type Role } from "@/lib/permissions";
import { activeUserCredentials } from "@/lib/two-factor";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Révocation d'une clé de sécurité (perte, remplacement, départ du salarié).
 *
 * Règles :
 *  - chacun peut révoquer ses propres clés ; un gestionnaire de comptes peut
 *    révoquer celles d'un autre utilisateur (`?userId=`) ;
 *  - la **dernière** clé d'un compte sensible ne peut pas être révoquée sans
 *    être remplacée : sinon le second facteur tomberait silencieusement ;
 *  - la révocation est tracée, et la clé n'est jamais supprimée de la base
 *    (seule `revoked_at` est posée) : l'historique reste vérifiable.
 */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireActor(request, undefined, {
      action: "AUTH_2FA_REVOKE",
      entityType: "user_credential",
      label: "révocation d'une clé de sécurité",
    }, { allowPendingTwoFactor: true });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { searchParams } = new URL(request.url);
    const rawCredentialId = searchParams.get("credentialId");
    const rawId = searchParams.get("id");
    const requestedUserId = searchParams.get("userId");

    const targetUserId = requestedUserId ? Number(requestedUserId) : actor.id;
    if (!Number.isFinite(targetUserId)) {
      return NextResponse.json({ success: false, error: "Compte cible invalide." }, { status: 400 });
    }

    // Révoquer la clé d'un autre compte exige la gestion des comptes
    if (targetUserId !== actor.id && !can(actor.role, "manageUsers")) {
      await recordAudit({
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        actor,
        request,
        entityType: "user_credential",
        summary: `Accès refusé à ${actor.name} (rôle ${actor.role}) : tentative de révocation de la clé du compte n°${targetUserId}.`,
        details: { compteCible: targetUserId, action: "AUTH_2FA_REVOKE" },
      });
      return NextResponse.json(
        { success: false, error: "Accès refusé : votre rôle ne permet pas cette action." },
        { status: 403 }
      );
    }

    const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!target) {
      return NextResponse.json({ success: false, error: "Compte introuvable." }, { status: 404 });
    }

    const [credential] = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.userId, targetUserId),
          isNull(userCredentials.revokedAt),
          rawCredentialId
            ? eq(userCredentials.credentialId, rawCredentialId)
            : rawId
              ? eq(userCredentials.id, Number(rawId))
              : undefined
        )
      );

    if (!credential) {
      return NextResponse.json(
        { success: false, error: "Clé de sécurité introuvable pour ce compte." },
        { status: 404 }
      );
    }

    const active = await activeUserCredentials(targetUserId);
    const targetIsSensitive = TWO_FACTOR_ROLES.includes(target.role as Role);

    if (targetIsSensitive && active.length <= 1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ce compte sensible n'a qu'une seule clé : enrôlez une nouvelle clé avant de révoquer celle-ci, sinon le second facteur ne serait plus exigé.",
        },
        { status: 409 }
      );
    }

    await db
      .update(userCredentials)
      .set({ revokedAt: new Date() })
      .where(eq(userCredentials.id, credential.id));

    const remaining = active.length - 1;
    if (remaining === 0) {
      await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, targetUserId));
    }

    await recordAudit({
      action: "AUTH_2FA_REVOKE",
      actor,
      request,
      entityType: "user_credential",
      entityId: credential.id,
      summary:
        targetUserId === actor.id
          ? `Clé de sécurité « ${credential.label ?? "sans nom"} » révoquée par son propriétaire (${actor.name}).`
          : `Clé de sécurité « ${credential.label ?? "sans nom"} » du compte ${target.name} révoquée par ${actor.name} (${actor.role}).`,
      details: {
        proprietaire: target.name,
        cle: credential.label ?? null,
        clesRestantes: remaining,
        secondFacteurActif: remaining > 0,
      },
    });

    return NextResponse.json({
      success: true,
      remaining,
      twoFactorEnabled: remaining > 0,
      message:
        remaining > 0
          ? `Clé révoquée. ${remaining} clé(s) encore active(s) sur ce compte.`
          : "Clé révoquée. Ce compte n'a plus de second facteur.",
    });
  } catch (error) {
    console.error("DELETE /api/auth/2fa/revoke error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
