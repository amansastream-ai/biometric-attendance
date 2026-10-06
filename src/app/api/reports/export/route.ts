import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, departments, punchRecords } from "@/db/schema";
import { gte, lte, and, eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { PORTAL_ROLES } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    // Les exports contiennent des données de paie : réservés aux rôles RH
    const guard = await requireActor(request, PORTAL_ROLES, {
      action: "DATA_EXPORT",
      entityType: "report",
      label: "export des données de paie",
    });
    if ("error" in guard) return guard.error;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "THIS_MONTH";
    const departmentId = searchParams.get("departmentId");
    const format = searchParams.get("format") || "CSV";

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
    } else {
      startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    const allEmps = await db.select().from(employees);
    const allDepts = await db.select().from(departments);
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));
    const empMap = new Map(allEmps.map((e) => [e.id, e]));

    const punchConditions = [
      gte(punchRecords.punchTime, startDate),
      lte(punchRecords.punchTime, endDate),
    ];

    const punches = await db
      .select()
      .from(punchRecords)
      .where(and(...punchConditions))
      .orderBy(punchRecords.punchTime);

    // Group by employee and date
    const empDayPunches = new Map<string, typeof punches>();
    for (const p of punches) {
      const pDate = new Date(p.punchTime);
      const dateStr = pDate.toISOString().split("T")[0];
      const key = `${p.employeeId}_${dateStr}`;
      const list = empDayPunches.get(key) || [];
      list.push(p);
      empDayPunches.set(key, list);
    }

    const rows: string[][] = [
      [
        "Matricule",
        "Nom",
        "Prénom",
        "Département",
        "Poste",
        "Date",
        "Heure Arrivée (Pouce)",
        "Début Pause",
        "Fin Pause",
        "Heure Départ (Pouce)",
        "Pause (min)",
        "Heures Effectives (h)",
        "Heures Sup (h)",
        "Retard (min)",
        "Statut Journée",
        "Méthode Pointage",
        "Indice Biométrique (%)",
      ],
    ];

    const keys = Array.from(empDayPunches.keys()).sort();

    for (const key of keys) {
      const [empIdStr, dateStr] = key.split("_");
      const empId = Number(empIdStr);
      const emp = empMap.get(empId);
      if (!emp) continue;

      if (departmentId && departmentId !== "all" && emp.departmentId !== Number(departmentId)) {
        continue;
      }

      const dept = deptMap.get(emp.departmentId);
      const dayPunches = empDayPunches.get(key) || [];

      const inPunch = dayPunches.find((p) => p.type === "IN");
      const breakStart = dayPunches.find((p) => p.type === "BREAK_START");
      const breakEnd = dayPunches.find((p) => p.type === "BREAK_END");
      const outPunch = [...dayPunches].reverse().find((p) => p.type === "OUT");

      const arrivalTime = inPunch ? new Date(inPunch.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--";
      const breakStartTime = breakStart ? new Date(breakStart.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--";
      const breakEndTime = breakEnd ? new Date(breakEnd.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--";
      const departureTime = outPunch ? new Date(outPunch.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--";

      let breakMin = dept?.breakDurationMinutes || 60;
      if (breakStart && breakEnd) {
        breakMin = Math.max(0, Math.round((new Date(breakEnd.punchTime).getTime() - new Date(breakStart.punchTime).getTime()) / 60000));
      }

      let netHours = 0;
      if (inPunch && outPunch) {
        const grossH = Math.max(0, (new Date(outPunch.punchTime).getTime() - new Date(inPunch.punchTime).getTime()) / 3600000);
        netHours = Math.max(0, grossH - breakMin / 60);
      } else if (inPunch) {
        const grossH = Math.max(0, (Date.now() - new Date(inPunch.punchTime).getTime()) / 3600000);
        netHours = Math.max(0, grossH - breakMin / 60);
      }

      const standardDaily = (emp.weeklyHours || 35) / 5;
      const overtimeH = Math.max(0, netHours - standardDaily);

      let lateMin = 0;
      if (inPunch && dept?.standardStart) {
        const pTime = new Date(inPunch.punchTime);
        const [sH, sM] = dept.standardStart.split(":").map(Number);
        const punchM = pTime.getHours() * 60 + pTime.getMinutes();
        const stdM = sH * 60 + sM;
        const grace = dept.gracePeriodMinutes || 10;
        if (punchM > stdM + grace) {
          lateMin = punchM - stdM;
        }
      }

      // Seul un pointage signé par le capteur est présenté comme biométrique
      const bioScore =
        inPunch?.punchMethod === "WEBAUTHN" && inPunch?.biometricConfidence
          ? `${inPunch.biometricConfidence}%`
          : "non biométrique";

      rows.push([
        emp.employeeCode,
        emp.lastName,
        emp.firstName,
        dept?.name || "",
        emp.jobTitle,
        dateStr,
        arrivalTime,
        breakStartTime,
        breakEndTime,
        departureTime,
        String(breakMin),
        netHours.toFixed(2),
        overtimeH.toFixed(2),
        String(lateMin),
        !outPunch ? "En cours" : overtimeH > 0.1 ? "Heures Sup" : lateMin > 0 ? "Retard" : "Normal",
        inPunch?.punchMethod || "FINGERPRINT",
        bioScore,
      ]);
    }

    // Convert to CSV with semicolon (French standard for Excel)
    const csvContent = "\uFEFF" + rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

    const filename = `presences-heures-pointage-${startDate.toISOString().split("T")[0]}_au_${endDate.toISOString().split("T")[0]}.csv`;

    // Un export contient des données de paie : la sortie de données est tracée
    await recordAudit({
      action: "DATA_EXPORT",
      actor: guard.actor,
      request,
      entityType: "report",
      summary: `Export CSV des présences et heures (${startDate.toISOString().split("T")[0]} → ${
        endDate.toISOString().split("T")[0]
      }) : ${rows.length} ligne(s), données de paie incluses.`,
      details: {
        fichier: filename,
        periode: period,
        lignes: rows.length,
        departementId: searchParams.get("departmentId") ?? null,
      },
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/reports/export error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
