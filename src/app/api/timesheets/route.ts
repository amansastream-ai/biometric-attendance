import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { punchRecords, employees, departments } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { PORTAL_ROLES } from "@/lib/permissions";

interface DailySummary {
  date: string; // YYYY-MM-DD
  dateFormatted: string;
  dayName: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  arrivalTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  departureTime: string | null;
  grossHours: number;
  breakMinutes: number;
  netHoursWorked: number; // in hours with decimals
  netHoursFormatted: string; // "7h 45m"
  standardDailyHours: number; // e.g. 7
  overtimeHours: number;
  overtimeFormatted: string;
  lateMinutes: number;
  status: "NORMAL" | "OVERTIME" | "LATE" | "INCOMPLETE" | "ONGOING";
  punchesCount: number;
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, PORTAL_ROLES);
    if ("error" in guard) return guard.error;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const departmentId = searchParams.get("departmentId");
    const period = searchParams.get("period") || "THIS_MONTH"; // THIS_WEEK, THIS_MONTH, LAST_MONTH, ALL, CUSTOM
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (period === "THIS_WEEK") {
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diffToMonday));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === "THIS_MONTH") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === "LAST_MONTH") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === "CUSTOM" && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Default to past 30 days
      startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    // Fetch employees and departments
    const allEmps = await db.select().from(employees);
    const allDepts = await db.select().from(departments);
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));
    const empMap = new Map(allEmps.map((e) => [e.id, e]));

    // Fetch punches in range
    const punchConditions = [
      gte(punchRecords.punchTime, startDate),
      lte(punchRecords.punchTime, endDate),
    ];

    if (employeeId && employeeId !== "all") {
      punchConditions.push(eq(punchRecords.employeeId, Number(employeeId)));
    }

    const punches = await db
      .select()
      .from(punchRecords)
      .where(and(...punchConditions))
      .orderBy(punchRecords.punchTime);

    // Group punches by employee and date string (YYYY-MM-DD)
    const empDayPunches = new Map<string, typeof punches>();

    for (const p of punches) {
      const pDate = new Date(p.punchTime);
      const dateStr = pDate.toISOString().split("T")[0];
      const key = `${p.employeeId}_${dateStr}`;
      const list = empDayPunches.get(key) || [];
      list.push(p);
      empDayPunches.set(key, list);
    }

    const dailySummaries: DailySummary[] = [];

    for (const [key, dayPunches] of empDayPunches.entries()) {
      const [empIdStr, dateStr] = key.split("_");
      const empId = Number(empIdStr);
      const emp = empMap.get(empId);
      if (!emp) continue;

      // Filter by department if requested
      if (departmentId && departmentId !== "all" && emp.departmentId !== Number(departmentId)) {
        continue;
      }

      const dept = deptMap.get(emp.departmentId);
      const dateObj = new Date(`${dateStr}T12:00:00Z`);

      const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "long" });
      const dateFormatted = dateObj.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      // Find punches
      const inPunch = dayPunches.find((p) => p.type === "IN");
      const breakStart = dayPunches.find((p) => p.type === "BREAK_START");
      const breakEnd = dayPunches.find((p) => p.type === "BREAK_END");
      const outPunch = [...dayPunches].reverse().find((p) => p.type === "OUT");

      const arrivalTime = inPunch
        ? new Date(inPunch.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null;

      const breakStartTime = breakStart
        ? new Date(breakStart.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null;

      const breakEndTime = breakEnd
        ? new Date(breakEnd.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null;

      const departureTime = outPunch
        ? new Date(outPunch.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null;

      // Calculate break duration
      let breakMinutes = dept?.breakDurationMinutes || 60;
      if (breakStart && breakEnd) {
        const diffMs = new Date(breakEnd.punchTime).getTime() - new Date(breakStart.punchTime).getTime();
        breakMinutes = Math.max(0, Math.round(diffMs / (60 * 1000)));
      }

      // Calculate hours
      let grossHours = 0;
      let netHoursWorked = 0;
      const standardDaily = (emp.weeklyHours || 35) / 5; // e.g. 7.0 hours

      if (inPunch && outPunch) {
        const diffMs = new Date(outPunch.punchTime).getTime() - new Date(inPunch.punchTime).getTime();
        grossHours = Math.max(0, diffMs / (3600 * 1000));
        netHoursWorked = Math.max(0, grossHours - breakMinutes / 60);
      } else if (inPunch && !outPunch) {
        // Still ongoing today
        const isToday = new Date().toISOString().split("T")[0] === dateStr;
        if (isToday) {
          const diffMs = Date.now() - new Date(inPunch.punchTime).getTime();
          grossHours = Math.max(0, diffMs / (3600 * 1000));
          netHoursWorked = Math.max(0, grossHours - (breakStart && !breakEnd ? 0 : breakMinutes / 60));
        }
      }

      // Late minutes calculation
      let lateMinutes = 0;
      if (inPunch && dept?.standardStart) {
        const pTime = new Date(inPunch.punchTime);
        const [sH, sM] = dept.standardStart.split(":").map(Number);
        const punchMin = pTime.getHours() * 60 + pTime.getMinutes();
        const stdMin = sH * 60 + sM;
        const grace = dept.gracePeriodMinutes || 10;
        if (punchMin > stdMin + grace) {
          lateMinutes = punchMin - stdMin;
        }
      }

      const overtimeHours = Math.max(0, netHoursWorked - standardDaily);

      let status: DailySummary["status"] = "NORMAL";
      if (!outPunch) {
        status = "ONGOING";
      } else if (overtimeHours > 0.1) {
        status = "OVERTIME";
      } else if (lateMinutes > 0) {
        status = "LATE";
      }

      const netHoursH = Math.floor(netHoursWorked);
      const netHoursM = Math.round((netHoursWorked - netHoursH) * 60);
      const netHoursFormatted = `${netHoursH}h ${netHoursM.toString().padStart(2, "0")}m`;

      const otH = Math.floor(overtimeHours);
      const otM = Math.round((overtimeHours - otH) * 60);
      const overtimeFormatted = overtimeHours > 0 ? `+${otH}h ${otM.toString().padStart(2, "0")}m` : "0h 00m";

      dailySummaries.push({
        date: dateStr,
        dateFormatted,
        dayName,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        departmentName: dept?.name || "Non assigné",
        arrivalTime,
        breakStartTime,
        breakEndTime,
        departureTime,
        grossHours: Number(grossHours.toFixed(2)),
        breakMinutes,
        netHoursWorked: Number(netHoursWorked.toFixed(2)),
        netHoursFormatted,
        standardDailyHours: standardDaily,
        overtimeHours: Number(overtimeHours.toFixed(2)),
        overtimeFormatted,
        lateMinutes,
        status,
        punchesCount: dayPunches.length,
      });
    }

    // Sort descending by date, then employee name
    dailySummaries.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName));

    // Calculate overall totals
    const totalNetHours = dailySummaries.reduce((sum, d) => sum + d.netHoursWorked, 0);
    const totalOvertime = dailySummaries.reduce((sum, d) => sum + d.overtimeHours, 0);
    const totalLateMinutes = dailySummaries.reduce((sum, d) => sum + d.lateMinutes, 0);
    const uniqueEmployeesCount = new Set(dailySummaries.map((d) => d.employeeId)).size;

    // Per-employee aggregations
    const employeeAggregates = allEmps
      .filter((e) => {
        if (employeeId && employeeId !== "all" && e.id !== Number(employeeId)) return false;
        if (departmentId && departmentId !== "all" && e.departmentId !== Number(departmentId)) return false;
        return true;
      })
      .map((emp) => {
        const empDays = dailySummaries.filter((d) => d.employeeId === emp.id);
        const empHours = empDays.reduce((sum, d) => sum + d.netHoursWorked, 0);
        const empOt = empDays.reduce((sum, d) => sum + d.overtimeHours, 0);
        const empLate = empDays.reduce((sum, d) => sum + d.lateMinutes, 0);
        const hourlyRateNum = parseFloat(emp.hourlyRate) || 22.5;
        const estimatedPay = (empHours * hourlyRateNum).toFixed(2);
        const dept = deptMap.get(emp.departmentId);

        return {
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          fullName: `${emp.firstName} ${emp.lastName}`,
          jobTitle: emp.jobTitle,
          department: dept ? { name: dept.name, code: dept.code, color: dept.color } : null,
          daysWorked: empDays.length,
          totalHours: Number(empHours.toFixed(2)),
          totalHoursFormatted: `${Math.floor(empHours)}h ${Math.round((empHours % 1) * 60)}m`,
          overtimeHours: Number(empOt.toFixed(2)),
          overtimeFormatted: `${Math.floor(empOt)}h ${Math.round((empOt % 1) * 60)}m`,
          lateMinutes: empLate,
          hourlyRate: emp.hourlyRate,
          estimatedPay: `${estimatedPay} €`,
          fingerprintEnrolled: emp.fingerprintEnrolled,
        };
      });

    return NextResponse.json({
      success: true,
      period,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      totalNetHours: Number(totalNetHours.toFixed(2)),
      totalOvertime: Number(totalOvertime.toFixed(2)),
      totalLateMinutes,
      uniqueEmployeesCount,
      dailySummaries,
      employeeAggregates,
    });
  } catch (error) {
    console.error("GET /api/timesheets error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
