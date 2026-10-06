import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportDispatches } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { PORTAL_ROLES, WRITE_ROLES } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, PORTAL_ROLES, {
      action: "DATA_EXPORT",
      entityType: "report",
      label: "consultation de l'historique des envois",
    });
    if ("error" in guard) return guard.error;

    const reports = await db
      .select()
      .from(reportDispatches)
      .orderBy(desc(reportDispatches.sentAt));

    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "REPORT_DISPATCH",
      entityType: "report",
      label: "envoi d'un fichier de présence",
    });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const body = await request.json();
    const {
      title,
      recipientEmail,
      recipientName,
      periodType = "THIS_MONTH",
      periodStart,
      periodEnd,
      departmentId,
      fileFormat = "CSV",
      totalEmployees = 0,
      totalHoursWorked = "0",
      totalOvertimeHours = "0",
      totalLateMinutes = 0,
      sentBy,
      notes,
    } = body;

    if (!recipientEmail || !title) {
      return NextResponse.json(
        { success: false, error: "Email du destinataire et intitulé du rapport requis" },
        { status: 400 }
      );
    }

    const [newReport] = await db
      .insert(reportDispatches)
      .values({
        title,
        recipientEmail,
        recipientName: recipientName || "Direction RH / Comptabilité",
        periodType,
        periodStart: periodStart || new Date().toISOString().split("T")[0],
        periodEnd: periodEnd || new Date().toISOString().split("T")[0],
        departmentId: departmentId ? Number(departmentId) : null,
        fileFormat,
        totalEmployees: Number(totalEmployees),
        totalHoursWorked: String(totalHoursWorked),
        totalOvertimeHours: String(totalOvertimeHours),
        totalLateMinutes: Number(totalLateMinutes),
        status: "DELIVERED",
        sentAt: new Date(),
        // L'émetteur réel vient de la session, jamais du navigateur
        sentBy: actor.name,
        notes: notes || null,
      })
      .returning();

    await recordAudit({
      action: "REPORT_DISPATCH",
      actor,
      request,
      entityType: "report",
      entityId: newReport.id,
      summary: `Envoi du fichier « ${newReport.title} » à ${newReport.recipientName} (${newReport.recipientEmail}) — ${newReport.fileFormat}.`,
      details: {
        periode: `${newReport.periodStart} → ${newReport.periodEnd}`,
        departementId: newReport.departmentId,
        salariesConcernes: newReport.totalEmployees,
        heuresTotales: newReport.totalHoursWorked,
        heuresSupplementaires: newReport.totalOvertimeHours,
        minutesRetard: newReport.totalLateMinutes,
      },
    });

    return NextResponse.json({
      success: true,
      report: newReport,
      message: `Fichier de présences et d'heures envoyé avec succès à ${recipientEmail} !`,
    });
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "REPORT_DELETE",
      entityType: "report",
      label: "suppression d'un envoi de fichier",
    });
    if ("error" in guard) return guard.error;
    const { actor } = guard;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID manquant" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(reportDispatches)
      .where(eq(reportDispatches.id, Number(id)))
      .returning();

    await recordAudit({
      action: "REPORT_DELETE",
      actor,
      request,
      entityType: "report",
      entityId: id,
      summary: deleted
        ? `Suppression de l'historique d'envoi « ${deleted.title} » (${deleted.recipientEmail}).`
        : `Suppression d'un envoi de fichier (id ${id}).`,
      details: deleted
        ? { destinataire: deleted.recipientEmail, periode: `${deleted.periodStart} → ${deleted.periodEnd}` }
        : null,
    });

    return NextResponse.json({ success: true, message: "Rapport supprimé de l'historique" });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
