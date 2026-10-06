import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  createSession,
  hashPassword,
  isStrongEnough,
  sameOrigin,
  setSessionCookie,
} from "@/lib/auth";
import { ROLE_LABELS, capabilitiesFor, type Role } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Inscription du premier administrateur — portail à usage unique.
 *
 * Cette route sert au provisionnement initial d'une instance vierge : tant
 * que la table `users` est vide, la première personne qui se connecte crée
 * le tout premier compte, qui reçoit automatiquement le rôle
 * « administrateur système ». Dès que le premier compte est inscrit, le
 * portail se ferme définitivement : les comptes suivants ne peuvent plus être
 * créés que par un administrateur ou la DRH (onglet Utilisateurs).
 *
 * Garanties :
 *   - le mot de passe est haché (scrypt + sel) avant insertion : jamais de
 *     valeur lisible en base ;
 *   - une session est ouverte au moment de l'inscription (connexion
 *     immédiate), avec le même cookie HttpOnly que la route de connexion ;
 *   - chaque tentative est journalisée dans l'audit (AUTH_SIGNUP), qu'elle
 *     aboutisse ou non ;
 *   - les refus ne révèlent jamais l'existence d'un compte (message unique,
 *     quel que soit l'email fourni).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function userCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0);
}

/** GET — état public du portail, lu par l'écran de connexion. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, available: (await userCount()) === 0 });
  } catch (error) {
    console.error("GET /api/auth/signup error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Garde CSRF avant toute logique : un navigateur d'une autre origine ne
    // peut ni consulter ni créer le premier compte.
    if (!sameOrigin(request)) {
      await recordAudit({
        action: "AUTH_SIGNUP",
        outcome: "DENIED",
        request,
        entityType: "user",
        summary: "Tentative d'inscription du premier administrateur refusée : origine non autorisée.",
        details: { origine: request.headers.get("origin") },
      });
      return NextResponse.json(
        { success: false, error: "Requête refusée : origine non autorisée." },
        { status: 403 }
      );
    }

    // Instance déjà provisionnée : le portail est fermé. Le message est
    // identique pour un email connu ou inconnu — on ne révèle jamais
    // l'existence d'un compte.
    if ((await userCount()) > 0) {
      await recordAudit({
        action: "AUTH_SIGNUP",
        outcome: "DENIED",
        request,
        entityType: "user",
        summary: "Tentative d'inscription du premier administrateur refusée : instance déjà initialisée.",
      });
      return NextResponse.json(
        { success: false, error: "L'inscription du premier administrateur est déjà effectuée." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      await recordAudit({
        action: "AUTH_SIGNUP",
        outcome: "FAILED",
        request,
        entityType: "user",
        summary: "Échec de l'inscription du premier administrateur : requête invalide.",
      });
      return NextResponse.json(
        { success: false, error: "Requête invalide : vérifiez les informations saisies." },
        { status: 400 }
      );
    }

    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const problem =
      name.length < 2
        ? "Veuillez saisir le nom complet."
        : name.length > 120
          ? "Nom trop long."
          : !EMAIL_PATTERN.test(email)
            ? "Veuillez saisir une adresse email valide."
            : isStrongEnough(password);

    if (problem) {
      await recordAudit({
        action: "AUTH_SIGNUP",
        outcome: "FAILED",
        request,
        entityType: "user",
        summary: `Échec de l'inscription du premier administrateur : ${problem}`,
        details: { email },
      });
      return NextResponse.json({ success: false, error: problem }, { status: 400 });
    }

    const inserted = await db
      .insert(users)
      .values({
        name,
        email,
        password: await hashPassword(password),
        role: "admin",
        isActive: true,
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    const user = inserted[0];

    // Connexion immédiate : la session est créée avec le compte.
    const { token, expiresAt } = await createSession(user.id, request);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    await recordAudit({
      action: "AUTH_SIGNUP",
      outcome: "SUCCESS",
      actor: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "admin" as Role,
        avatarUrl: null,
        departmentId: null,
      },
      request,
      entityType: "user",
      entityId: user.id,
      summary: `Inscription du premier administrateur : ${user.name} (${user.email}). Le portail d'inscription est désormais fermé.`,
      details: { role: "admin", premierCompte: true },
    });

    const response = NextResponse.json(
      {
        success: true,
        firstAdmin: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as Role,
          roleLabel: ROLE_LABELS[user.role as Role],
          avatarUrl: null,
        },
        capabilities: capabilitiesFor(user.role as Role),
        expiresAt,
        message: "Compte administrateur créé : cette instance est maintenant initialisée.",
      },
      { status: 201 }
    );
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error("POST /api/auth/signup error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
