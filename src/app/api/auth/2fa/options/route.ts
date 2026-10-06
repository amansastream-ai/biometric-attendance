import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "@/db";
import { userCredentials, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  checkLoginThrottle,
  recordLoginFailure,
  sameOrigin,
  verifyPassword,
} from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { getRpConfig, setTwoFactorChallengeCookie } from "@/lib/webauthn";
import { activeUserCredentials, parseTransports } from "@/lib/two-factor";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Étape 1 de la connexion avec second facteur.
 *
 * Le mot de passe est vérifié ici, mais **aucune session n'est créée** : on
 * renvoie seulement le défi à signer par la clé du poste. Le défi est scellé
 * dans un cookie HttpOnly signé (impossible à falsifier, valable 5 minutes).
 *
 * Le message d'erreur est identique à celui de `/api/auth/login` : impossible
 * de savoir si l'email existe.
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
    // Même compteur que la connexion simple : mélanger les deux voies ne doit
    // pas permettre de contourner le blocage après trop de tentatives.
    const throttleKey = `${email}|${clientIp}`;

    const throttle = checkLoginThrottle(throttleKey);
    if (throttle.blocked) {
      await recordAudit({
        action: "AUTH_2FA_BLOCKED",
        outcome: "DENIED",
        request,
        entityType: "user",
        summary: `Second facteur bloqué pour ${email} (trop de tentatives échouées).`,
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
    const invalid = NextResponse.json(
      { success: false, error: "Identifiants incorrects." },
      { status: 401 }
    );

    // Même réponse si le compte n'existe pas, est désactivé ou si le mot de
    // passe est faux : rien ne doit permettre d'énumérer les comptes.
    if (!user || !user.isActive) {
      recordLoginFailure(throttleKey);
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
        summary: `Échec de connexion (second facteur) : mot de passe incorrect pour ${user.name}.`,
        details: { email, etape: "mot de passe" },
      });
      return invalid;
    }

    const credentials = await activeUserCredentials(user.id);
    if (credentials.length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: "TWO_FACTOR_NOT_ENROLLED",
          error:
            "Aucune clé de sécurité n'est enregistrée pour ce compte. Connectez-vous puis enrôlez-en une depuis le menu utilisateur.",
        },
        { status: 409 }
      );
    }

    const { rpID } = getRpConfig(request);

    const options = await generateAuthenticationOptions({
      rpID,
      // Seules les clés de CE compte sont proposées : une clé d'un autre
      // utilisateur ne pourra pas être présentée.
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: parseTransports(credential.transports),
      })),
      userVerification: "required",
      timeout: 120_000,
    });

    await recordAudit({
      action: "AUTH_2FA_REQUIRED",
      actor: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        avatarUrl: user.avatarUrl,
        departmentId: user.departmentId,
      },
      request,
      entityType: "user",
      entityId: user.id,
      summary: `Second facteur demandé à ${user.name} (${ROLE_LABELS[user.role as Role] ?? user.role}) après vérification du mot de passe.`,
      details: { clesProposees: credentials.length },
    });

    const response = NextResponse.json({
      success: true,
      options,
      requiresTwoFactor: true,
      message: "Mot de passe vérifié. Validez maintenant avec votre clé de sécurité.",
    });

    setTwoFactorChallengeCookie(response, {
      challenge: options.challenge,
      kind: "login",
      userId: user.id,
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/2fa/options error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
