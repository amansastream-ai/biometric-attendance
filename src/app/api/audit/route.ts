import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit — lecture du journal d'audit (administrateur et DRH).
 *
 * Le journal est **en écriture seule** depuis l'application : cette route
 * n'expose volontairement ni PUT, ni PATCH, ni DELETE. Une entrée ne peut être
 * ni modifiée ni effacée par un utilisateur, même administrateur : c'est ce qui
 * donne sa valeur à la piste d'audit. Seul un accès direct à la base (DBA,
 * sauvegarde, RGPD) permet d'agir sur les données.
 *
 * Filtres acceptés :
 *   action    — code technique (« AUTH_LOGIN », « EMPLOYEE_DELETE »…)
 *   outcome   — SUCCESS | DENIED | FAILED
 *   actorId   — numéro de l'auteur
 *   entityId  — identifiant du salarié / compte / pointage concerné
 *   from, to  — bornes de date (AAAA-MM-JJ ou ISO complet)
 *   q         — recherche libre dans le résumé et le nom de l'auteur
 *   limit / offset — pagination (limit max 200, défaut 50)
 */
const MAX_LIMIT = 200;

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Une date seule (« 2026-10-06 ») couvre toute la journée
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireActor(request, AUDIT_ROLES, {
      action: "ACCESS_DENIED",
      entityType: "audit",
      label: "lecture du journal d'audit",
    });
    if ("error" in guard) return guard.error;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action")?.trim();
    const outcome = searchParams.get("outcome")?.trim();
    const actorId = searchParams.get("actorId")?.trim();
    const entityId = searchParams.get("entityId")?.trim();
    const query = searchParams.get("q")?.trim();

    const rawLimit = Number(searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 50;
    const rawOffset = Number(searchParams.get("offset"));
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"), true);

    const filters = [
      action ? eq(auditLogs.action, action) : undefined,
      outcome ? eq(auditLogs.outcome, outcome) : undefined,
      actorId && Number.isFinite(Number(actorId)) ? eq(auditLogs.actorId, Number(actorId)) : undefined,
      entityId ? eq(auditLogs.entityId, entityId) : undefined,
      from ? gte(auditLogs.createdAt, from) : undefined,
      to ? lte(auditLogs.createdAt, to) : undefined,
      query
        ? sql`(${auditLogs.summary} ILIKE ${`%${query}%`} OR ${auditLogs.actorName} ILIKE ${`%${query}%`})`
        : undefined,
    ].filter((clause) => clause !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit)
      .offset(offset);

    const [totals] = await db.select({ value: count() }).from(auditLogs).where(where);

    // Le détail est stocké en JSON expurgé : on le renvoie déjà analysé pour
    // que l'interface n'ait pas à le refaire (et n'affiche jamais de secret,
    // puisqu'il n'y en a pas en base).
    const entries = rows.map((row) => {
      let details: Record<string, unknown> | null = null;
      if (row.details) {
        try {
          details = JSON.parse(row.details) as Record<string, unknown>;
        } catch {
          details = { brut: row.details };
        }
      }
      return { ...row, details };
    });

    return NextResponse.json({
      success: true,
      entries,
      total: totals?.value ?? entries.length,
      limit,
      offset,
      readOnly: true,
      message: "Journal d'audit — écriture seule, aucune modification ni suppression possible.",
    });
  } catch (error) {
    console.error("GET /api/audit error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
