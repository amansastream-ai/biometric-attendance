import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { biometricCredentials, employees } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { PORTAL_ROLES } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Liste les empreintes enrôlées (utile pour l'écran d'enrôlement et l'audit RGPD). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, PORTAL_ROLES);
    if ("error" in guard) return guard.error;

    const { searchParams } = new URL(request.url);
    const employeeId = Number(searchParams.get("employeeId"));

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId requis." },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(biometricCredentials)
      .where(
        and(
          eq(biometricCredentials.employeeId, employeeId),
          isNull(biometricCredentials.revokedAt)
        )
      )
      .orderBy(desc(biometricCredentials.createdAt));

    return NextResponse.json({
      success: true,
      credentials: rows.map((row) => ({
        id: row.id,
        finger: row.finger,
        label: row.label,
        deviceType: row.deviceType,
        backedUp: row.backedUp,
        transports: row.transports,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        credentialIdPreview: `${row.credentialId.slice(0, 10)}…`,
      })),
    });
  } catch (error) {
    console.error("GET /api/biometrics/credentials error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

/**
 * Révoque une ou toutes les empreintes d'un salarié (droit à l'effacement).
 * La clé publique est supprimée : le capteur ne pourra plus badger avec.
 */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireActor(request, ["admin", "drh"], {
      action: "BIOMETRIC_REVOKE",
      entityType: "biometric_credential",
      label: "révocation d'une empreinte",
    });
    if ("error" in guard) return guard.error;

    const { searchParams } = new URL(request.url);
    const credentialId = Number(searchParams.get("id"));
    const employeeId = Number(searchParams.get("employeeId"));

    if (!credentialId && !employeeId) {
      return NextResponse.json(
        { success: false, error: "id ou employeeId requis." },
        { status: 400 }
      );
    }

    let deletedEmployeeId = employeeId;

    if (credentialId) {
      const [deleted] = await db
        .delete(biometricCredentials)
        .where(eq(biometricCredentials.id, credentialId))
        .returning();
      if (!deleted) {
        return NextResponse.json({ success: false, error: "Empreinte introuvable." }, { status: 404 });
      }
      deletedEmployeeId = deleted.employeeId;
    } else {
      await db.delete(biometricCredentials).where(eq(biometricCredentials.employeeId, employeeId));
    }

    // Recalcule l'état d'enrôlement du salarié
    const remaining = await db
      .select()
      .from(biometricCredentials)
      .where(eq(biometricCredentials.employeeId, deletedEmployeeId))
      .orderBy(desc(biometricCredentials.createdAt));

    if (remaining.length === 0) {
      await db
        .update(employees)
        .set({
          fingerprintEnrolled: false,
          fingerprintTemplateId: null,
          fingerprintRegisteredAt: null,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, deletedEmployeeId));
    } else {
      await db
        .update(employees)
        .set({
          fingerprintEnrolled: true,
          fingerprintFinger: remaining[0].finger,
          fingerprintTemplateId: remaining[0].credentialId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, deletedEmployeeId));
    }

    const [concerned] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, deletedEmployeeId));

    await recordAudit({
      action: "BIOMETRIC_REVOKE",
      actor: guard.actor,
      request,
      entityType: "biometric_credential",
      entityId: credentialId || deletedEmployeeId,
      summary: concerned
        ? `Empreinte révoquée pour ${concerned.firstName} ${concerned.lastName} (${concerned.employeeCode}) — ${
            credentialId ? "empreinte ciblée" : "toutes les empreintes"
          }, ${remaining.length} restante(s).`
        : `Empreinte révoquée (salarié n°${deletedEmployeeId}).`,
      details: {
        salarieId: deletedEmployeeId,
        empreintesRestantes: remaining.length,
        portee: credentialId ? "empreinte ciblée" : "toutes les empreintes du salarié",
      },
    });

    return NextResponse.json({
      success: true,
      employeeId: deletedEmployeeId,
      remaining: remaining.length,
      message: "Empreinte supprimée du système. Le capteur ne pourra plus l'utiliser.",
    });
  } catch (error) {
    console.error("DELETE /api/biometrics/credentials error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
