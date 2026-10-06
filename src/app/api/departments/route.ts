import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { departments, employees } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const allDepts = await db.select().from(departments).orderBy(departments.name);
    const empCounts = await db
      .select({
        departmentId: employees.departmentId,
        count: sql<number>`count(*)`,
      })
      .from(employees)
      .groupBy(employees.departmentId);

    const countMap = new Map(empCounts.map((c) => [c.departmentId, Number(c.count)]));

    const enriched = allDepts.map((d) => ({
      ...d,
      employeeCount: countMap.get(d.id) || 0,
    }));

    return NextResponse.json({ success: true, departments: enriched });
  } catch (error) {
    console.error("GET /api/departments error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      code,
      color = "#3b82f6",
      standardStart = "08:30",
      standardEnd = "17:30",
      breakDurationMinutes = 60,
      weeklyTargetHours = 35,
      gracePeriodMinutes = 10,
      managerName,
    } = body;

    if (!name || !code) {
      return NextResponse.json(
        { success: false, error: "Nom et code du département requis" },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(departments)
      .values({
        name,
        code: code.toUpperCase(),
        color,
        standardStart,
        standardEnd,
        breakDurationMinutes: Number(breakDurationMinutes),
        weeklyTargetHours: Number(weeklyTargetHours),
        gracePeriodMinutes: Number(gracePeriodMinutes),
        managerName: managerName || null,
      })
      .returning();

    return NextResponse.json({ success: true, department: created });
  } catch (error) {
    console.error("POST /api/departments error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
