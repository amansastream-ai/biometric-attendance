import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { punchRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { PUNCH_TYPE_LABELS } from "@/lib/punch-labels";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "PUNCH_MANUAL_UPDATE",
      entityType: "punch",
      label: "modification d'un pointage",
    });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { id } = await context.params;
    const punchId = Number(id);
    const body = await request.json();
    const { punchTime, type, status, manualReason, notes } = body;
    const [before] = await db.select().from(punchRecords).where(eq(punchRecords.id, punchId));

    const updateData: Record<string, unknown> = {
      isManual: true,
      // Auteur repris de la session (non falsifiable par le client)
      manualEditedBy: actor.name,
    };

    if (punchTime) updateData.punchTime = new Date(punchTime);
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (manualReason !== undefined) updateData.manualReason = manualReason;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(punchRecords)
      .set(updateData)
      .where(eq(punchRecords.id, punchId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Pointage introuvable" }, { status: 404 });
    }

    await recordAudit({
      action: "PUNCH_MANUAL_UPDATE",
      actor,
      request,
      entityType: "punch",
      entityId: punchId,
      summary: `Modification d'un pointage du salarié n°${updated.employeeId}${
        before
          ? ` (${PUNCH_TYPE_LABELS[before.type as keyof typeof PUNCH_TYPE_LABELS] ?? before.type} → ${
              PUNCH_TYPE_LABELS[updated.type as keyof typeof PUNCH_TYPE_LABELS] ?? updated.type
            })`
          : ""
      } : ${manualReason || "modification DRH"}.`,
      details: {
        avant: before
          ? { horodatage: before.punchTime, type: before.type, statut: before.status }
          : null,
        apres: { horodatage: updated.punchTime, type: updated.type, statut: updated.status },
        motif: manualReason || null,
      },
    });

    return NextResponse.json({ success: true, punch: updated });
  } catch (error) {
    console.error("PUT /api/punch/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Supprimer un pointage est une opération sensible : réservée aux rôles RH
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "PUNCH_DELETE",
      entityType: "punch",
      label: "suppression d'un pointage",
    });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { id } = await context.params;
    const punchId = Number(id);

    const [deleted] = await db
      .delete(punchRecords)
      .where(eq(punchRecords.id, punchId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Pointage introuvable" }, { status: 404 });
    }

    await recordAudit({
      action: "PUNCH_DELETE",
      actor,
      request,
      entityType: "punch",
      entityId: punchId,
      summary: `Suppression d'un pointage du salarié n°${deleted.employeeId} (${
        PUNCH_TYPE_LABELS[deleted.type as keyof typeof PUNCH_TYPE_LABELS] ?? deleted.type
      } du ${new Date(deleted.punchTime).toLocaleString("fr-FR")}).`,
      details: {
        horodatage: deleted.punchTime,
        type: deleted.type,
        methode: deleted.punchMethod,
        etaitManuel: deleted.isManual,
      },
    });

    return NextResponse.json({ success: true, message: "Pointage supprimé avec succès" });
  } catch (error) {
    console.error("DELETE /api/punch/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
