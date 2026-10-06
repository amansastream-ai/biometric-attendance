import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { hashPassword, isStrongEnough, requireActor } from "@/lib/auth";
import { ROLE_LABELS, USER_MANAGER_ROLES, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "drh", "manager", "kiosk"];

/** Liste des comptes (réservée aux gestionnaires : admin & DRH). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, USER_MANAGER_ROLES);
    if ("error" in guard) return guard.error;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        activeSessions: sql<number>`(
          SELECT count(*) FROM ${sessions}
          WHERE ${sessions.userId} = ${users.id} AND ${sessions.expiresAt} > now()
        )`.mapWith(Number),
      })
      .from(users)
      .orderBy(desc(users.isActive), users.name);

    return NextResponse.json({
      success: true,
      // Aucune empreinte de mot de passe ne sort de la base
      users: rows.map((row) => ({
        ...row,
        roleLabel: ROLE_LABELS[row.role as Role] ?? row.role,
      })),
      roles: ROLES.map((role) => ({ id: role, label: ROLE_LABELS[role] })),
      canPromoteAdmin: guard.actor.role === "admin",
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

/** Création d'un compte. Seul un administrateur peut créer un administrateur. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, USER_MANAGER_ROLES);
    if ("error" in guard) return guard.error;

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "drh") as Role;
    const departmentId = body?.departmentId ? Number(body.departmentId) : null;

    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: "Nom et email sont requis." },
        { status: 400 }
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Adresse email invalide." }, { status: 400 });
    }
    if (!ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: "Rôle inconnu." }, { status: 400 });
    }
    if (role === "admin" && guard.actor.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Seul un administrateur peut créer un compte administrateur." },
        { status: 403 }
      );
    }

    const policyError = isStrongEnough(password);
    if (policyError) {
      return NextResponse.json({ success: false, error: policyError }, { status: 400 });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Un compte utilise déjà cet email." },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        name,
        email,
        password: await hashPassword(password),
        role,
        departmentId,
        isActive: true,
      })
      .returning();

    return NextResponse.json({
      success: true,
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        roleLabel: ROLE_LABELS[created.role as Role],
        isActive: created.isActive,
      },
      message: `Compte créé pour ${created.name}.`,
    });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
