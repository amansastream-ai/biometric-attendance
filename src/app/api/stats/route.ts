import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, departments, punchRecords } from "@/db/schema";
import { gte, lte, and, desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const allEmps = await db.select().from(employees);
    const allDepts = await db.select().from(departments);
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));

    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Punches today
    const todayPunches = await db
      .select({
        id: punchRecords.id,
        employeeId: punchRecords.employeeId,
        punchTime: punchRecords.punchTime,
        type: punchRecords.type,
        punchMethod: punchRecords.punchMethod,
        fingerMatched: punchRecords.fingerMatched,
        biometricConfidence: punchRecords.biometricConfidence,
        kioskLocation: punchRecords.kioskLocation,
        status: punchRecords.status,
      })
      .from(punchRecords)
      .where(and(gte(punchRecords.punchTime, startOfToday), lte(punchRecords.punchTime, endOfToday)))
      .orderBy(desc(punchRecords.punchTime));

    // Calculate employee current statuses
    const employeeLatestPunch = new Map<number, (typeof todayPunches)[0]>();
    const punchedEmployeeIds = new Set<number>();
    let lateCountToday = 0;

    for (const p of todayPunches) {
      punchedEmployeeIds.add(p.employeeId);
      if (!employeeLatestPunch.has(p.employeeId)) {
        employeeLatestPunch.set(p.employeeId, p);
      }
      if (p.type === "IN" && p.status === "LATE") {
        lateCountToday++;
      }
    }

    let currentlyPresent = 0;
    let currentlyOnBreak = 0;
    let currentlyDeparted = 0;

    for (const emp of allEmps) {
      const latest = employeeLatestPunch.get(emp.id);
      if (latest) {
        if (latest.type === "IN" || latest.type === "BREAK_END") {
          currentlyPresent++;
        } else if (latest.type === "BREAK_START") {
          currentlyOnBreak++;
        } else if (latest.type === "OUT") {
          currentlyDeparted++;
        }
      }
    }

    const totalEmployees = allEmps.length;
    const notPunchedToday = Math.max(0, totalEmployees - punchedEmployeeIds.size);
    const attendanceRate = totalEmployees > 0 ? Math.round((punchedEmployeeIds.size / totalEmployees) * 100) : 0;

    // Monthly totals (first day of current month to now)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const monthPunches = await db
      .select()
      .from(punchRecords)
      .where(and(gte(punchRecords.punchTime, startOfMonth), lte(punchRecords.punchTime, endOfToday)));

    // Group month punches by day and employee for rough hours approximation
    const monthEmpDayMap = new Map<string, typeof monthPunches>();
    for (const p of monthPunches) {
      const dStr = new Date(p.punchTime).toISOString().split("T")[0];
      const key = `${p.employeeId}_${dStr}`;
      const list = monthEmpDayMap.get(key) || [];
      list.push(p);
      monthEmpDayMap.set(key, list);
    }

    let monthTotalHours = 0;
    let monthOvertimeHours = 0;

    for (const dayPunches of monthEmpDayMap.values()) {
      const inPunch = dayPunches.find((p) => p.type === "IN");
      const outPunch = [...dayPunches].reverse().find((p) => p.type === "OUT");
      if (inPunch && outPunch) {
        const diffH = Math.max(0, (new Date(outPunch.punchTime).getTime() - new Date(inPunch.punchTime).getTime()) / 3600000 - 1);
        monthTotalHours += diffH;
        if (diffH > 7) {
          monthOvertimeHours += diffH - 7;
        }
      }
    }

    // Recent 10 punches with employee info
    const recentPunches = await db
      .select({
        id: punchRecords.id,
        employeeId: punchRecords.employeeId,
        punchTime: punchRecords.punchTime,
        type: punchRecords.type,
        punchMethod: punchRecords.punchMethod,
        fingerMatched: punchRecords.fingerMatched,
        biometricConfidence: punchRecords.biometricConfidence,
        kioskLocation: punchRecords.kioskLocation,
        status: punchRecords.status,
        employee: {
          id: employees.id,
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
      .limit(8);

    const enrichedRecent = recentPunches.map((r) => ({
      ...r,
      employee: {
        ...r.employee,
        department: deptMap.get(r.employee.departmentId) || null,
      },
    }));

    // Department presence breakdown
    const deptStats = allDepts.map((d) => {
      const deptsEmps = allEmps.filter((e) => e.departmentId === d.id);
      const presentCount = deptsEmps.filter((e) => {
        const lp = employeeLatestPunch.get(e.id);
        return lp && (lp.type === "IN" || lp.type === "BREAK_END");
      }).length;
      return {
        id: d.id,
        name: d.name,
        code: d.code,
        color: d.color,
        total: deptsEmps.length,
        present: presentCount,
        rate: deptsEmps.length > 0 ? Math.round((presentCount / deptsEmps.length) * 100) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalEmployees,
        currentlyPresent,
        currentlyOnBreak,
        currentlyDeparted,
        notPunchedToday,
        attendanceRate,
        lateCountToday,
        monthTotalHours: Math.round(monthTotalHours),
        monthOvertimeHours: Math.round(monthOvertimeHours),
        deptStats,
        recentPunches: enrichedRecent,
      },
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
