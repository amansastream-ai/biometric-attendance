import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, ne, and, sql } from "drizzle-orm";
import {
  destroyUserSessions,
  hashPassword,
  isStrongEnough,
  requireActor,
} from "@/lib/auth";
import { ROLE_LABELS, USER_MANAGER_ROLES, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "drh", "manager", "kiosk"];

async function countActiveAdmins(exceptId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, exceptId)));
  return Number(row?.count ?? 0);
}

/**
 * Mise à jour d'un compte : rôle, activation, identité, ou réinitialisation du
 * mot de passe. Toute modification de mot de passe ou de rôle révoque les
 * sessions de l'utilisateur concerné.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, USER_MANAGER_ROLES);
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { id } = await context.params;
    const userId = Number(id);
    const body = await request.json().catch(() => ({}));

    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) {
      return NextResponse.json({ success: false, error: "Compte introuvable." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    let revokeSessions = false;

    if (body?.name !== undefined) update.name = String(body.name).trim();
    if (body?.departmentId !== undefined) {
      update.departmentId = body.departmentId ? Number(body.departmentId) : null;
    }

    if (body?.role !== undefined) {
      const role = String(body.role) as Role;
      if (!ROLES.includes(role)) {
        return NextResponse.json({ success: false, error: "Rôle inconnu." }, { status: 400 });
      }
      if (role !== target.role) {
        if ((role === "admin" || target.role === "admin") && actor.role !== "admin") {
          return NextResponse.json(
            {
              success: false,
              error:
                "Seul un administrateur peut attribuer ou retirer le rôle administrateur.",
            },
            { status: 403 }
          );
        }
        if (target.role === "admin" && role !== "admin") {
          if (await countActiveAdmins(userId) === 0) {
            return NextResponse.json(
              {
                success: false,
                error: "Impossible : il doit rester au moins un administrateur actif.",
              },
              { status: 409 }
            );
          }
        }
        if (target.id === actor.id) {
          return NextResponse.json(
            { success: false, error: "Vous ne pouvez pas modifier votre propre rôle." },
            { status: 409 }
          );
        }
        update.role = role;
        revokeSessions = true;
      }
    }

    if (body?.isActive !== undefined) {
      const isActive = Boolean(body.isActive);
      if (!isActive && target.id === actor.id) {
        return NextResponse.json(
          { success: false, error: "Vous ne pouvez pas désactiver votre propre compte." },
          { status: 409 }
        );
      }
      if (!isActive && target.role === "admin" && (await countActiveAdmins(userId)) === 0) {
        return NextResponse.json(
          { success: false, error: "Impossible : il doit rester au moins un administrateur actif." },
          { status: 409 }
        );
      }
      update.isActive = isActive;
      if (!isActive) revokeSessions = true;
    }

    if (body?.password) {
      const password = String(body.password);
      const policyError = isStrongEnough(password);
      if (policyError) {
        return NextResponse.json({ success: false, error: policyError }, { status: 400 });
      }
      update.password = await hashPassword(password);
      revokeSessions = true;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, error: "Aucune modification demandée." },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(users)
      .set(update)
      .where(eq(users.id, userId))
      .returning();

    if (revokeSessions) {
      await destroyUserSessions(userId);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        roleLabel: ROLE_LABELS[updated.role as Role],
        isActive: updated.isActive,
      },
      sessionsRevoked: revokeSessions,
      message: revokeSessions
        ? "Compte mis à jour. Les sessions de cet utilisateur ont été révoquées."
        : "Compte mis à jour.",
    });
  } catch (error) {
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

/** Suppression d'un compte — réservée aux administrateurs. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, ["admin"]);
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { id } = await context.params;
    const userId = Number(id);

    if (userId === actor.id) {
      return NextResponse.json(
        { success: false, error: "Vous ne pouvez pas supprimer votre propre compte." },
        { status: 409 }
      );
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) {
      return NextResponse.json({ success: false, error: "Compte introuvable." }, { status: 404 });
    }
    if (target.role === "admin" && (await countActiveAdmins(userId)) === 0) {
      return NextResponse.json(
        { success: false, error: "Impossible : il doit rester au moins un administrateur." },
        { status: 409 }
      );
    }

    await destroyUserSessions(userId);
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true, message: "Compte supprimé." });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
