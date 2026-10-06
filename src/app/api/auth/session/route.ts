import { NextRequest, NextResponse } from "next/server";
import { currentActor, destroySession, jsonError, sameOrigin } from "@/lib/auth";
import { ROLE_LABELS, can, type Capability, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const CAPABILITIES: Capability[] = [
  "viewPortal",
  "punchTerminal",
  "manageEmployees",
  "deleteRecords",
  "enrollBiometrics",
  "manualPunch",
  "manageDepartments",
  "dispatchReports",
  "manageUsers",
  "viewAudit",
  "promoteAdmin",
];

/** Session courante : qui suis-je, et que puis-je faire ? */
export async function GET(request: NextRequest) {
  const actor = await currentActor(request);
  if (!actor) {
    return NextResponse.json({ success: true, authenticated: false, user: null });
  }

  const capabilities = Object.fromEntries(
    CAPABILITIES.map((capability) => [capability, can(actor.role, capability)])
  );

  return NextResponse.json({
    success: true,
    authenticated: true,
    user: {
      ...actor,
      roleLabel: ROLE_LABELS[actor.role as Role] ?? actor.role,
    },
    capabilities,
  });
}

/** Déconnexion par suppression de session (alias REST de /api/auth/logout). */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Origine non autorisée.", 403);
  await destroySession(request);
  const response = NextResponse.json({ success: true, message: "Déconnecté." });
  response.cookies.set({ name: "bp_session", value: "", path: "/", maxAge: 0 });
  return response;
}
