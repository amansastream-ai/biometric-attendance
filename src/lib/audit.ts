import type { NextRequest } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { Actor } from "@/lib/auth";
import type { AuditAction, AuditOutcome } from "@/lib/audit-labels";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_OUTCOME_LABELS,
  auditActionLabel,
  auditOutcomeLabel,
  roleLabel,
} from "@/lib/audit-labels";

// Les libellés vivent dans @/lib/audit-labels (importable côté navigateur) ;
// on les ré-exporte pour que les routes API n'aient qu'un seul import.
export {
  AUDIT_ACTION_LABELS,
  AUDIT_OUTCOME_LABELS,
  auditActionLabel,
  auditOutcomeLabel,
  roleLabel,
};
export type { AuditAction, AuditOutcome } from "@/lib/audit-labels";

/**
 * Journal d'audit.
 *
 * Règle d'or : écrire une trace ne doit **jamais** faire échouer l'action
 * métier. `recordAudit()` ne lève donc aucune exception : en cas de problème,
 * l'incident est signalé dans les logs serveur et l'opération continue.
 */

/**
 * Clés jamais écrites dans le journal, même par accident (variantes anglaises
 * et françaises). La comparaison ignore la casse, les underscores et les tirets.
 */
const FORBIDDEN_KEYS = [
  "password",
  "passwd",
  "pwd",
  "newpassword",
  "currentpassword",
  "oldpassword",
  "pin",
  "pincode",
  "code",
  "codepin",
  "token",
  "tokenhash",
  "sessiontoken",
  "secret",
  "publickey",
  "credentialid",
  "response",
  "motdepasse",
  "nouveaumotdepasse",
  "motdepasseactuel",
];

const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_-]/g, "");

const isForbidden = (key: string) => FORBIDDEN_KEYS.includes(normalizeKey(key));

/**
 * Retire tout secret d'un objet de détails et borne la taille stockée.
 * Les valeurs sensibles deviennent « ••• » plutôt que d'être supprimées :
 * la trace indique qu'un changement a eu lieu, sans en révéler le contenu.
 */
export function redactDetails(details: unknown): unknown {
  if (details === null || details === undefined) return null;
  if (typeof details !== "object") return details;
  if (Array.isArray(details)) return details.map(redactDetails);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (isForbidden(key)) {
      sanitized[key] = "•••";
      continue;
    }
    sanitized[key] = typeof value === "object" ? redactDetails(value) : value;
  }
  return sanitized;
}

export type AuditInput = {
  action: AuditAction;
  summary: string;
  actor?: Actor | null;
  request?: NextRequest;
  entityType?: string;
  entityId?: string | number | null;
  outcome?: AuditOutcome;
  details?: Record<string, unknown> | null;
};

function requestMeta(request?: NextRequest): { ip: string | null; userAgent: string | null } {
  if (!request) return { ip: null, userAgent: null };
  return {
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      null,
    userAgent: request.headers.get("user-agent")?.slice(0, 250) ?? null,
  };
}

/** Écrit une entrée d'audit. N'échoue jamais : l'action métier continue. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = requestMeta(input.request);
    const details = redactDetails(input.details ?? null);
    const serialized = details ? JSON.stringify(details).slice(0, 4000) : null;

    await db.insert(auditLogs).values({
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? "Système",
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId != null ? String(input.entityId) : null,
      outcome: input.outcome ?? "SUCCESS",
      summary: input.summary.slice(0, 500),
      details: serialized,
      ipAddress: ip,
      userAgent,
    });
  } catch (error) {
    console.error("[audit] écriture impossible:", (error as Error).message);
  }
}

/**
 * Décrit un changement sans exposer les données personnelles :
 * « Promotion : CDD → CDI » plutôt que la fiche salarié complète.
 */
export function describeChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: string[]
): Record<string, { avant: unknown; apres: unknown }> {
  const changes: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const field of fields) {
    const previous = before?.[field];
    const next = after?.[field];
    if (before && next !== undefined && JSON.stringify(previous) !== JSON.stringify(next)) {
      changes[field] = { avant: previous ?? null, apres: next ?? null };
    }
  }
  return changes;
}

