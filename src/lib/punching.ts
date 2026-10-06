import { db } from "@/db";
import { punchRecords, employees, departments } from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { PunchMethod, PunchType } from "@/lib/punch-labels";

export type { PunchMethod, PunchType };

/** Délai minimum entre deux pointages d'un même salarié (anti double-scan). */
const DOUBLE_SCAN_WINDOW_MS = 15_000;

export async function getLastPunchOfDay(employeeId: number) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [lastPunch] = await db
    .select()
    .from(punchRecords)
    .where(
      and(
        eq(punchRecords.employeeId, employeeId),
        gte(punchRecords.punchTime, startOfToday),
        lte(punchRecords.punchTime, endOfToday)
      )
    )
    .orderBy(desc(punchRecords.punchTime))
    .limit(1);

  return lastPunch ?? null;
}

/** Type de pointage logique suivant, sur la base du dernier pointage du jour. */
export function inferPunchType(lastType: PunchType | null): PunchType {
  if (!lastType || lastType === "OUT") return "IN";
  if (lastType === "BREAK_START") return "BREAK_END";
  return "OUT";
}

/**
 * Vérifie qu'un pointage "borne" respecte l'ordre logique de la journée.
 * Retourne un message d'erreur en français, ou null si la séquence est valide.
 */
export function validateSequence(
  lastType: PunchType | null,
  requestedType: PunchType
): string | null {
  if (requestedType === "IN") {
    if (lastType && lastType !== "OUT") {
      return "Une arrivée a déjà été enregistrée aujourd'hui. Scannez plutôt un départ ou une pause.";
    }
    return null;
  }
  if (!lastType) {
    return "Aucune arrivée enregistrée aujourd'hui : commencez par un pointage d'arrivée.";
  }
  if (requestedType === "BREAK_START") {
    return lastType === "IN"
      ? null
      : "Le début de pause ne peut être enregistré qu'après une arrivée (et avant tout départ).";
  }
  if (requestedType === "BREAK_END") {
    return lastType === "BREAK_START"
      ? null
      : "Aucun début de pause n'a été enregistré : impossible d'enregistrer la reprise.";
  }
  // OUT
  return lastType === "IN" || lastType === "BREAK_END"
    ? null
    : "Un départ a déjà été enregistré. Scannez plutôt une arrivée.";
}

/** Statut règlementaire du pointage vis-à-vis des horaires du pôle. */
export function computePunchStatus(
  department: { standardStart: string; standardEnd: string; gracePeriodMinutes: number | null } | null,
  type: PunchType,
  punchDate: Date
): "VALID" | "LATE" | "OVERTIME" | "EARLY_DEPARTURE" {
  if (!department) return "VALID";

  const punchTotalMinutes = punchDate.getHours() * 60 + punchDate.getMinutes();

  if (type === "IN") {
    const [hours, minutes] = department.standardStart.split(":").map(Number);
    const grace = department.gracePeriodMinutes || 10;
    if (punchTotalMinutes > hours * 60 + minutes + grace) return "LATE";
  } else if (type === "OUT") {
    const [hours, minutes] = department.standardEnd.split(":").map(Number);
    const standardEndMinutes = hours * 60 + minutes;
    if (punchTotalMinutes > standardEndMinutes + 20) return "OVERTIME";
    if (punchTotalMinutes < standardEndMinutes - 30) return "EARLY_DEPARTURE";
  }

  return "VALID";
}

export type CreatePunchInput = {
  employeeId: number;
  type: PunchType;
  punchMethod: PunchMethod;
  fingerMatched?: string | null;
  biometricConfidence?: number | null;
  kioskLocation: string;
  isManual?: boolean;
  manualReason?: string | null;
  manualEditedBy?: string | null;
  notes?: string | null;
  punchTime?: Date;
};

/**
 * Enregistre un pointage. Aucune règle de sécurité ici : la vérification
 * d'identité (capteur, PIN, régularisation DRH) est faite par les routes
 * appelantes **avant** d'arriver ici.
 */
export async function createPunch(input: CreatePunchInput) {
  const punchDate = input.punchTime ?? new Date();

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, input.employeeId));

  if (!employee) return null;

  const [department] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, employee.departmentId));

  const status = computePunchStatus(department ?? null, input.type, punchDate);

  const [punch] = await db
    .insert(punchRecords)
    .values({
      employeeId: input.employeeId,
      punchTime: punchDate,
      type: input.type,
      punchMethod: input.punchMethod,
      fingerMatched: input.fingerMatched ?? null,
      biometricConfidence: input.biometricConfidence ?? null,
      kioskLocation: input.kioskLocation,
      isManual: Boolean(input.isManual),
      manualReason: input.manualReason ?? null,
      manualEditedBy: input.manualEditedBy ?? null,
      status,
      notes: input.notes ?? null,
    })
    .returning();

  return {
    punch,
    employee: {
      ...employee,
      department: department ?? null,
    },
  };
}

/**
 * Anti double-scan : refuse un second pointage trop rapproché.
 * Un pointage horodaté dans le futur (données de démo, dérive d'horloge) ne
 * doit jamais bloquer un salarié : on ignore les écarts négatifs.
 */
export function isDoubleScan(lastPunchTime: Date | null | undefined): boolean {
  if (!lastPunchTime) return false;
  const elapsed = Date.now() - new Date(lastPunchTime).getTime();
  return elapsed >= 0 && elapsed < DOUBLE_SCAN_WINDOW_MS;
}
