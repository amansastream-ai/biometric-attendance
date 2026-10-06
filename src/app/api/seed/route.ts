import { NextRequest, NextResponse } from "next/server";
import { seedDatabase } from "@/db/seed";
import { currentActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Réinitialisation des données de démonstration.
 *
 * Deux voies possibles :
 *  - l'en-tête `x-seed-secret` (déploiement initial, scripts) ;
 *  - une session authentifiée avec un rôle administrateur / DRH (bouton de
 *    l'interface), ce qui évite de faire circuler le secret dans le navigateur.
 *
 * Le seed lui-même ne s'exécute que si la base ne contient aucun utilisateur.
 */
function hasSeedSecret(request: NextRequest) {
  const configuredSecret = process.env.SEED_SECRET;
  const providedSecret = request.headers.get("x-seed-secret");
  return Boolean(configuredSecret && providedSecret && providedSecret === configuredSecret);
}

async function isAuthorized(request: NextRequest) {
  if (hasSeedSecret(request)) return true;
  const actor = await currentActor(request);
  return actor?.role === "admin" || actor?.role === "drh";
}

async function runSeed(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Non autorisé : fournissez l'en-tête x-seed-secret ou connectez-vous avec un compte DRH/administrateur.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await seedDatabase();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return runSeed(request);
}

export async function POST(request: NextRequest) {
  return runSeed(request);
}
