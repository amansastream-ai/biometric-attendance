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
import { ROLE_LABELS, TWO_FACTOR_ROLES, capabilitiesFor, type Role } from "@/lib/permissions";
import { twoFactorPolicy } from "@/lib/webauthn";
import { activeUserCredentials } from "@/lib/two-factor";
import { recordAudit } from "@/lib/audit";

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
      await recordAudit({
        action: "AUTH_LOGIN_BLOCKED",
        outcome: "DENIED",
        request,
        entityType: "user",
        summary: `Connexion bloquée pour ${email} (trop de tentatives échouées).`,
        details: { email, retryInMinutes: throttle.retryInMinutes },
      });
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
      await recordAudit({
        action: "AUTH_LOGIN_FAILED",
        outcome: "FAILED",
        request,
        entityType: "user",
        summary: `Échec de connexion : compte inconnu (${email}).`,
        details: { email, motif: "compte inconnu" },
      });
      return invalid;
    }

    const verification = await verifyPassword(password, user.password);
    if (!verification.ok) {
      recordLoginFailure(throttleKey);
      await recordAudit({
        action: "AUTH_LOGIN_FAILED",
        outcome: "FAILED",
        request,
        entityType: "user",
        entityId: user.id,
        summary: `Échec de connexion : mot de passe incorrect pour ${user.name}.`,
        details: { email, motif: "mot de passe incorrect" },
      });
      return invalid;
    }

    if (!user.isActive) {
      await recordAudit({
        action: "AUTH_LOGIN_FAILED",
        outcome: "DENIED",
        request,
        entityType: "user",
        entityId: user.id,
        summary: `Connexion refusée : compte désactivé (${user.name}).`,
      });
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

    const actor = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      avatarUrl: user.avatarUrl,
      departmentId: user.departmentId,
    };
    const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role;
    const credentials = await activeUserCredentials(user.id);

    // 1. Une clé de sécurité est enrôlée : le mot de passe seul ne suffit plus.
    //    Aucune session n'est créée ici — l'étape 2 (/api/auth/2fa/*) vérifiera
    //    la signature du capteur avant d'ouvrir la session.
    if (credentials.length > 0) {
      return NextResponse.json({
        success: true,
        requiresTwoFactor: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role as Role, roleLabel, avatarUrl: user.avatarUrl },
        message: "Mot de passe vérifié. Validez avec votre clé de sécurité.",
      });
    }

    // 2. Rôle sensible sans clé : selon la politique, session restreinte
    //    (enforce) ou avertissement (prompt).
    const sensitive = TWO_FACTOR_ROLES.includes(user.role as Role);
    const policy = twoFactorPolicy();
    const restricted = sensitive && policy === "enforce";

    const { token, expiresAt } = await createSession(user.id, request, {
      pendingTwoFactor: restricted,
    });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    clearLoginFailures(throttleKey);

    // Une entrée par connexion. « DENIED » signifie ici : session ouverte mais
    // portée limitée à l'enrôlement du second facteur.
    await recordAudit({
      action: "AUTH_LOGIN",
      outcome: restricted ? "DENIED" : "SUCCESS",
      actor,
      request,
      entityType: "user",
      entityId: user.id,
      summary: restricted
        ? `Connexion de ${user.name} (${roleLabel}) : session restreinte, second facteur obligatoire non configuré (accès aux données RH refusé).`
        : `Connexion réussie de ${user.name} (${roleLabel}).`,
      details: {
        migrationMotDePasse: verification.needsRehash || undefined,
        secondFacteurManquant: sensitive || undefined,
        politique: sensitive ? policy : undefined,
        portee: restricted ? "enrôlement du second facteur uniquement" : undefined,
      },
    });

    // Rôle sensible sans clé : signalé distinctement pour que le contrôle
    // interne le retrouve en un filtre (politique souple : accès autorisé).
    if (sensitive && !restricted) {
      await recordAudit({
        action: "AUTH_2FA_MISSING",
        actor,
        request,
        entityType: "user",
        entityId: user.id,
        summary: `Second facteur non configuré pour ${user.name} (${roleLabel}) : accès autorisé mais clé de sécurité à enrôler sans délai.`,
        details: { politique: policy },
      });
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        roleLabel,
        avatarUrl: user.avatarUrl,
      },
      capabilities: capabilitiesFor(user.role as Role),
      twoFactorWarning: sensitive && !restricted,
      twoFactorPending: restricted,
      twoFactorPolicy: policy,
      expiresAt,
      message: restricted
        ? "Connexion limitée : configurez votre second facteur pour accéder aux données RH."
        : "Connexion réussie.",
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
