import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportDispatches } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
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
      sentBy = "Sophie Laurent (DRH)",
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
        sentBy,
        notes: notes || null,
      })
      .returning();

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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID manquant" }, { status: 400 });
    }

    await db.delete(reportDispatches).where(eq(reportDispatches.id, Number(id)));
    return NextResponse.json({ success: true, message: "Rapport supprimé de l'historique" });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
