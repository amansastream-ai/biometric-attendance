import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { departments, employees } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deptId = Number(id);
    const body = await request.json();

    const [updated] = await db
      .update(departments)
      .set({
        name: body.name,
        code: body.code ? body.code.toUpperCase() : undefined,
        color: body.color,
        standardStart: body.standardStart,
        standardEnd: body.standardEnd,
        breakDurationMinutes: body.breakDurationMinutes ? Number(body.breakDurationMinutes) : undefined,
        weeklyTargetHours: body.weeklyTargetHours ? Number(body.weeklyTargetHours) : undefined,
        gracePeriodMinutes: body.gracePeriodMinutes ? Number(body.gracePeriodMinutes) : undefined,
        managerName: body.managerName,
      })
      .where(eq(departments.id, deptId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Département introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, department: updated });
  } catch (error) {
    console.error("PUT /api/departments/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deptId = Number(id);

    // Check if any employees in this department
    const linked = await db.select().from(employees).where(eq(employees.departmentId, deptId));
    if (linked.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Impossible de supprimer ce département : ${linked.length} employé(s) y sont rattaché(s). Réassignez-les d'abord.`,
        },
        { status: 400 }
      );
    }

    const [deleted] = await db.delete(departments).where(eq(departments.id, deptId)).returning();
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Département introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Département supprimé" });
  } catch (error) {
    console.error("DELETE /api/departments/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
