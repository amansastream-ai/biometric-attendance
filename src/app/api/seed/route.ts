import { NextRequest, NextResponse } from "next/server";
import { seedDatabase } from "@/db/seed";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.SEED_SECRET;
  const providedSecret = request.headers.get("x-seed-secret");
  return Boolean(configuredSecret && providedSecret && providedSecret === configuredSecret);
}

async function runSeed(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Non autorisé" },
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
