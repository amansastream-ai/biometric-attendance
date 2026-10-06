import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, departments, punchRecords } from "@/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const search = searchParams.get("search");

    const allDepts = await db.select().from(departments);
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));

    const allEmps = await db.select().from(employees).orderBy(employees.lastName);

    // Get today's punch records to compute live presence status
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayPunches = await db
      .select()
      .from(punchRecords)
      .where(
        and(
          gte(punchRecords.punchTime, startOfToday),
          lte(punchRecords.punchTime, endOfToday)
        )
      )
      .orderBy(desc(punchRecords.punchTime));

    // Map latest punch for each employee today
    const employeeLatestPunch = new Map<number, (typeof todayPunches)[0]>();
    const employeeAllPunchesToday = new Map<number, typeof todayPunches>();

    for (const p of todayPunches) {
      if (!employeeLatestPunch.has(p.employeeId)) {
        employeeLatestPunch.set(p.employeeId, p);
      }
      const existing = employeeAllPunchesToday.get(p.employeeId) || [];
      existing.push(p);
      employeeAllPunchesToday.set(p.employeeId, existing);
    }

    // Enrich employees with department & current status
    const enriched = allEmps.map((emp) => {
      const dept = deptMap.get(emp.departmentId);
      const latest = employeeLatestPunch.get(emp.id);
      const punches = employeeAllPunchesToday.get(emp.id) || [];

      let currentStatus: "PRESENT" | "ON_BREAK" | "DEPARTED" | "ABSENT" = "ABSENT";
      let arrivalTime: string | null = null;
      let departureTime: string | null = null;

      // Find first IN
      const firstIn = [...punches].reverse().find((p) => p.type === "IN");
      if (firstIn) {
        arrivalTime = new Date(firstIn.punchTime).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      if (latest) {
        if (latest.type === "IN" || latest.type === "BREAK_END") {
          currentStatus = "PRESENT";
        } else if (latest.type === "BREAK_START") {
          currentStatus = "ON_BREAK";
        } else if (latest.type === "OUT") {
          currentStatus = "DEPARTED";
          departureTime = new Date(latest.punchTime).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }

      return {
        ...emp,
        department: dept || null,
        currentStatus,
        arrivalTime,
        departureTime,
        latestPunch: latest || null,
      };
    });

    let filtered = enriched;
    if (departmentId && departmentId !== "all") {
      filtered = filtered.filter((e) => e.departmentId === Number(departmentId));
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ success: true, employees: filtered });
  } catch (error) {
    console.error("GET /api/employees error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      jobTitle,
      avatarUrl,
      hourlyRate,
      contractType,
      weeklyHours,
      fingerprintFinger,
      pinCode,
      notes,
    } = body;

    if (!firstName || !lastName || !email || !departmentId || !jobTitle) {
      return NextResponse.json(
        { success: false, error: "Nom, prénom, email, département et poste sont obligatoires" },
        { status: 400 }
      );
    }

    // Generate unique employee code
    const count = await db.select().from(employees);
    const codeNum = (count.length + 1).toString().padStart(3, "0");
    const employeeCode = `EMP-${codeNum}`;

    // Auto-generate avatar if not provided
    const defaultAvatar = `https://images.unsplash.com/photo-${1530000000000 + (count.length * 1234567) % 9999999}?w=150&auto=format&fit=crop&q=80`;

    const [newEmp] = await db
      .insert(employees)
      .values({
        employeeCode,
        firstName,
        lastName,
        email,
        phone: phone || null,
        departmentId: Number(departmentId),
        jobTitle,
        avatarUrl: avatarUrl || defaultAvatar,
        fingerprintEnrolled: false,
        fingerprintFinger: fingerprintFinger || "Pouce Droit",
        hourlyRate: hourlyRate || "22.50",
        contractType: contractType || "CDI",
        weeklyHours: weeklyHours ? Number(weeklyHours) : 35,
        status: "active",
        pinCode: pinCode || "1234",
        notes: notes || null,
      })
      .returning();

    return NextResponse.json({ success: true, employee: newEmp });
  } catch (error) {
    console.error("POST /api/employees error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
