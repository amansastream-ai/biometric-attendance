import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { punchRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/permissions";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, WRITE_ROLES);
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { id } = await context.params;
    const punchId = Number(id);
    const body = await request.json();
    const { punchTime, type, status, manualReason, notes } = body;

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
    const guard = await requireActor(request, WRITE_ROLES);
    if ("error" in guard) return guard.error;

    const { id } = await context.params;
    const punchId = Number(id);

    const [deleted] = await db
      .delete(punchRecords)
      .where(eq(punchRecords.id, punchId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Pointage introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Pointage supprimé avec succès" });
  } catch (error) {
    console.error("DELETE /api/punch/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
