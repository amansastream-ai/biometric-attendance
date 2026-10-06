import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { punchRecords, employees, departments } from "@/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import {
  createPunch,
  getLastPunchOfDay,
  inferPunchType,
  isDoubleScan,
  validateSequence,
  type PunchMethod,
  type PunchType,
} from "@/lib/punching";

const PUNCH_TYPES: PunchType[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

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

/**
 * Cette route n'enregistre **jamais** de pointage biométrique.
 *
 * Un pointage « empreinte » n'est accepté que par
 * `POST /api/biometrics/authenticate/verify`, après vérification de la
 * signature du capteur. Ici on ne gère que :
 *  - les régularisations saisies par les RH (`MANUAL_DRH`, isManual = true) ;
 *  - le repli code salarié + PIN (`PIN_FALLBACK`), tracé comme non biométrique.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeId,
      type,
      punchMethod = "MANUAL_DRH",
      kioskLocation = "Borne Entrée Principale",
      isManual = false,
      manualReason,
      manualEditedBy,
      punchTime: customPunchTime,
      notes,
      pin,
    } = body;

    const isPinFallback = punchMethod === "PIN_FALLBACK";

    if (!employeeId || (!type && !isPinFallback)) {
      return NextResponse.json(
        { success: false, error: "L'employé et le type de pointage sont requis." },
        { status: 400 }
      );
    }

    if (type && !PUNCH_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: "Type de pointage inconnu." }, { status: 400 });
    }

    // 1. Aucun pointage biométrique ne peut être fabriqué depuis le navigateur.
    if (punchMethod === "WEBAUTHN" || punchMethod === "FINGERPRINT") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Pointage biométrique refusé : une empreinte doit être signée par le capteur du poste. Utilisez la borne de pointage.",
        },
        { status: 403 }
      );
    }

    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, Number(employeeId)));

    if (!emp) {
      return NextResponse.json({ success: false, error: "Employé non trouvé." }, { status: 404 });
    }

    const punchDate = customPunchTime ? new Date(customPunchTime) : new Date();
    let resolvedNotes: string | null = notes || null;
    let resolvedMethod: PunchMethod = "MANUAL_DRH";
    let resolvedType: PunchType = type as PunchType;

    if (punchMethod === "PIN_FALLBACK") {
      // 2. Repli code salarié + PIN (personnes non enrôlées / poste sans capteur)
      if (!emp.pinCode) {
        return NextResponse.json(
          {
            success: false,
            error: "Aucun code PIN n'est défini pour ce salarié. Contactez les RH.",
          },
          { status: 403 }
        );
      }
      if (!pin || String(pin) !== String(emp.pinCode)) {
        return NextResponse.json({ success: false, error: "Code PIN incorrect." }, { status: 401 });
      }

      const lastPunch = await getLastPunchOfDay(emp.id);
      if (isDoubleScan(lastPunch?.punchTime)) {
        return NextResponse.json(
          {
            success: false,
            error: "Un pointage vient d'être enregistré pour ce salarié. Patientez quelques secondes.",
          },
          { status: 429 }
        );
      }

      const lastType = (lastPunch?.type as PunchType) ?? null;
      resolvedType = (type as PunchType) ?? inferPunchType(lastType);

      const sequenceError = validateSequence(lastType, resolvedType);
      if (sequenceError) {
        return NextResponse.json({ success: false, error: sequenceError }, { status: 409 });
      }

      resolvedMethod = "PIN_FALLBACK";
      resolvedNotes = `${resolvedNotes ? `${resolvedNotes} • ` : ""}Repli code + PIN : aucune vérification biométrique n'a été effectuée.`;
    } else if (!isManual) {
      // 3. Toute autre écriture doit être une régularisation RH explicite.
      return NextResponse.json(
        {
          success: false,
          error:
            "Un pointage non biométrique doit être enregistré comme régularisation RH (isManual = true).",
        },
        { status: 403 }
      );
    } else {
      resolvedMethod = "MANUAL_DRH";
    }

    const created = await createPunch({
      employeeId: emp.id,
      type: resolvedType,
      punchMethod: resolvedMethod,
      // Un pointage non biométrique n'a ni doigt ni indice de confiance
      fingerMatched: null,
      biometricConfidence: null,
      kioskLocation,
      isManual: resolvedMethod === "MANUAL_DRH",
      manualReason: manualReason || "Régularisation manuelle DRH",
      manualEditedBy: manualEditedBy || "Direction RH",
      notes: resolvedNotes,
      punchTime: punchDate,
    });

    if (!created) {
      return NextResponse.json({ success: false, error: "Employé non trouvé." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      punch: created.punch,
      employee: {
        id: created.employee.id,
        firstName: created.employee.firstName,
        lastName: created.employee.lastName,
        jobTitle: created.employee.jobTitle,
        avatarUrl: created.employee.avatarUrl,
        fingerprintFinger: created.employee.fingerprintFinger,
        department: created.employee.department
          ? {
              name: created.employee.department.name,
              code: created.employee.department.code,
              color: created.employee.department.color,
            }
          : null,
      },
      message: `Pointage ${resolvedType === "IN" ? "d'Arrivée" : resolvedType === "OUT" ? "de Départ" : resolvedType === "BREAK_START" ? "de Début de Pause" : "de Reprise"} enregistré avec succès`,
    });
  } catch (error) {
    console.error("POST /api/punch error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
