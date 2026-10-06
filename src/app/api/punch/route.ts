import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { punchRecords, employees, departments } from "@/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const departmentId = searchParams.get("departmentId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Number(searchParams.get("limit") || 100);

    const conditions = [];

    if (employeeId && employeeId !== "all") {
      conditions.push(eq(punchRecords.employeeId, Number(employeeId)));
    }
    if (type && type !== "all") {
      conditions.push(eq(punchRecords.type, type));
    }
    if (status && status !== "all") {
      conditions.push(eq(punchRecords.status, status));
    }
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      conditions.push(gte(punchRecords.punchTime, fromDate));
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(punchRecords.punchTime, toDate));
    }

    const query = db
      .select({
        id: punchRecords.id,
        employeeId: punchRecords.employeeId,
        punchTime: punchRecords.punchTime,
        type: punchRecords.type,
        punchMethod: punchRecords.punchMethod,
        fingerMatched: punchRecords.fingerMatched,
        biometricConfidence: punchRecords.biometricConfidence,
        kioskLocation: punchRecords.kioskLocation,
        isManual: punchRecords.isManual,
        manualReason: punchRecords.manualReason,
        manualEditedBy: punchRecords.manualEditedBy,
        status: punchRecords.status,
        notes: punchRecords.notes,
        createdAt: punchRecords.createdAt,
        employee: {
          id: employees.id,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          avatarUrl: employees.avatarUrl,
          jobTitle: employees.jobTitle,
          departmentId: employees.departmentId,
        },
      })
      .from(punchRecords)
      .innerJoin(employees, eq(punchRecords.employeeId, employees.id))
      .orderBy(desc(punchRecords.punchTime))
      .limit(limit);

    let rows;
    if (conditions.length > 0) {
      rows = await query.where(and(...conditions));
    } else {
      rows = await query;
    }

    // Filter department if requested
    if (departmentId && departmentId !== "all") {
      rows = rows.filter((r) => r.employee.departmentId === Number(departmentId));
    }

    // Also enrich with department details
    const allDepts = await db.select().from(departments);
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));

    const enriched = rows.map((r) => ({
      ...r,
      employee: {
        ...r.employee,
        department: deptMap.get(r.employee.departmentId) || null,
      },
    }));

    return NextResponse.json({ success: true, punches: enriched });
  } catch (error) {
    console.error("GET /api/punch error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeId,
      type, // 'IN', 'OUT', 'BREAK_START', 'BREAK_END'
      punchMethod = "FINGERPRINT",
      fingerMatched = "Pouce Droit",
      biometricConfidence = 98,
      kioskLocation = "Borne Entrée Principale",
      isManual = false,
      manualReason,
      manualEditedBy,
      punchTime: customPunchTime,
      notes,
    } = body;

    if (!employeeId || !type) {
      return NextResponse.json(
        { success: false, error: "L'employé et le type de pointage sont requis." },
        { status: 400 }
      );
    }

    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, Number(employeeId)));

    if (!emp) {
      return NextResponse.json({ success: false, error: "Employé non trouvé." }, { status: 404 });
    }

    const [dept] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, emp.departmentId));

    const punchDate = customPunchTime ? new Date(customPunchTime) : new Date();

    // Check status logic based on department schedule
    let status = "VALID";
    if (dept) {
      const punchHours = punchDate.getHours();
      const punchMinutes = punchDate.getMinutes();
      const punchTotalMinutes = punchHours * 60 + punchMinutes;

      if (type === "IN") {
        const [stdStartH, stdStartM] = dept.standardStart.split(":").map(Number);
        const standardStartMinutes = stdStartH * 60 + stdStartM;
        const grace = dept.gracePeriodMinutes || 10;

        if (punchTotalMinutes > standardStartMinutes + grace) {
          status = "LATE";
        }
      } else if (type === "OUT") {
        const [stdEndH, stdEndM] = dept.standardEnd.split(":").map(Number);
        const standardEndMinutes = stdEndH * 60 + stdEndM;

        if (punchTotalMinutes > standardEndMinutes + 20) {
          status = "OVERTIME";
        } else if (punchTotalMinutes < standardEndMinutes - 30) {
          status = "EARLY_DEPARTURE";
        }
      }
    }

    const [inserted] = await db
      .insert(punchRecords)
      .values({
        employeeId: Number(employeeId),
        punchTime: punchDate,
        type,
        punchMethod,
        fingerMatched: emp.fingerprintFinger || fingerMatched,
        biometricConfidence: punchMethod === "FINGERPRINT" ? biometricConfidence : 100,
        kioskLocation,
        isManual: Boolean(isManual),
        manualReason: manualReason || null,
        manualEditedBy: manualEditedBy || null,
        status,
        notes: notes || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      punch: inserted,
      employee: {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        jobTitle: emp.jobTitle,
        avatarUrl: emp.avatarUrl,
        fingerprintFinger: emp.fingerprintFinger,
        department: dept ? { name: dept.name, code: dept.code, color: dept.color } : null,
      },
      message: `Pointage ${type === "IN" ? "d'Arrivée" : type === "OUT" ? "de Départ" : type === "BREAK_START" ? "de Début de Pause" : "de Reprise"} enregistré avec succès`,
    });
  } catch (error) {
    console.error("POST /api/punch error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
