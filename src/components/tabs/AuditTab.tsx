"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_OUTCOME_LABELS,
  auditActionLabel,
  auditOutcomeLabel,
  type AuditAction,
  type AuditOutcome,
} from "@/lib/audit-labels";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import {
  ScrollText,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Lock,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  User as UserIcon,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type AuditEntry = {
  id: number;
  actorId: number | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  outcome: string;
  summary: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

interface AuditTabProps {
  onNotify: (message: string, isError?: boolean) => void;
}

const PAGE_SIZE = 50;

const OUTCOME_STYLES: Record<AuditOutcome, string> = {
  SUCCESS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DENIED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const ACTION_GROUPS: { label: string; actions: AuditAction[] }[] = [
  {
    label: "Connexions",
    actions: ["AUTH_LOGIN", "AUTH_LOGIN_FAILED", "AUTH_LOGIN_BLOCKED", "AUTH_LOGOUT", "AUTH_PASSWORD_CHANGE"],
  },
  { label: "Comptes", actions: ["USER_CREATE", "USER_UPDATE", "USER_DELETE"] },
  {
    label: "Salariés & pôles",
    actions: [
      "EMPLOYEE_CREATE",
      "EMPLOYEE_UPDATE",
      "EMPLOYEE_DELETE",
      "DEPARTMENT_CREATE",
      "DEPARTMENT_UPDATE",
      "DEPARTMENT_DELETE",
    ],
  },
  {
    label: "Pointages",
    actions: ["PUNCH_MANUAL_CREATE", "PUNCH_MANUAL_UPDATE", "PUNCH_DELETE", "PUNCH_PIN_FALLBACK"],
  },
  {
    label: "Biométrie",
    actions: ["BIOMETRIC_ENROLL", "BIOMETRIC_REVOKE", "BIOMETRIC_PUNCH", "BIOMETRIC_REJECTED"],
  },
  { label: "Fichiers & exports", actions: ["REPORT_DISPATCH", "REPORT_DELETE", "DATA_EXPORT"] },
  { label: "Système", actions: ["SEED_RESET", "ACCESS_DENIED"] },
];

function formatDateTime(value: string): { date: string; time: string } {
  const dateObj = new Date(value);
  if (Number.isNaN(dateObj.getTime())) return { date: value, time: "" };
  return {
    date: dateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    time: dateObj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

/** Rend une valeur de détail sans jamais interpréter du HTML. */
function renderDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.length === 0 ? "aucun" : value.map(renderDetailValue).join(", ");
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${key} : ${renderDetailValue(inner)}`)
      .join(" • ");
  }
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

export function AuditTab({ onNotify }: AuditTabProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filtres
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(
    async (nextOffset = offset) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(nextOffset));
        if (query.trim()) params.set("q", query.trim());
        if (action) params.set("action", action);
        if (outcome) params.set("outcome", outcome);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const data = await apiFetch<{ entries: AuditEntry[]; total: number }>(
          `/api/audit?${params.toString()}`
        );
        setEntries(data.entries || []);
        setTotal(data.total || 0);
        setOffset(nextOffset);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [action, from, offset, outcome, query, to]
  );

  // Premier chargement et rechargement lorsque les filtres changent
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", "0");
    if (query.trim()) params.set("q", query.trim());
    if (action) params.set("action", action);
    if (outcome) params.set("outcome", outcome);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    apiFetch<{ entries: AuditEntry[]; total: number }>(`/api/audit?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries || []);
        setTotal(data.total || 0);
        setOffset(0);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, action, outcome, from, to]);

  const resetFilters = () => {
    setQuery("");
    setAction("");
    setOutcome("");
    setFrom("");
    setTo("");
  };

  const activeFilterCount = [query, action, outcome, from, to].filter(Boolean).length;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-cyan-400" />
            Journal d&apos;audit
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Qui a fait quoi, quand, depuis quelle adresse — connexions, modifications RH, pointages
            manuels, empreintes et exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
              activeFilterCount > 0
                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                : "bg-slate-900/70 border-slate-800 text-slate-300 hover:text-white"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtres
            {activeFilterCount > 0 && (
              <span className="px-1.5 rounded-md bg-cyan-400/20 text-[10px] font-mono">{activeFilterCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              load(offset);
              onNotify("Journal d'audit actualisé.");
            }}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Rappel : immuabilité */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <span>
          Journal en <strong className="text-slate-200">écriture seule</strong> : aucune interface
          ne permet de modifier ni de supprimer une entrée. Les mots de passe, codes PIN et clés
          d&apos;empreinte n&apos;y sont jamais enregistrés.
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filtres */}
      {showFilters && (
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Recherche
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Résumé ou nom de l'auteur…"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Action
            </label>
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
            >
              <option value="">Toutes les actions</option>
              {ACTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.actions.map((entry) => (
                    <option key={entry} value={entry}>
                      {AUDIT_ACTION_LABELS[entry]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Résultat
            </label>
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
            >
              <option value="">Tous les résultats</option>
              {(Object.keys(AUDIT_OUTCOME_LABELS) as AuditOutcome[]).map((key) => (
                <option key={key} value={key}>
                  {AUDIT_OUTCOME_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Du
              </label>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Au
              </label>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
          </div>
          <div className="md:col-span-5 flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
            >
              Réinitialiser les filtres
            </button>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Horodatage</th>
                <th className="px-4 py-3.5">Auteur</th>
                <th className="px-4 py-3.5">Action</th>
                <th className="px-4 py-3.5">Résultat</th>
                <th className="px-4 py-3.5">Détail de l&apos;événement</th>
                <th className="px-4 py-3.5 text-right">Infos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {entries.map((entry) => {
                const { date, time } = formatDateTime(entry.createdAt);
                const outcomeKey = (
                  Object.keys(AUDIT_OUTCOME_LABELS).includes(entry.outcome) ? entry.outcome : "SUCCESS"
                ) as AuditOutcome;
                const isExpanded = expandedId === entry.id;
                const details =
                  entry.details && Object.keys(entry.details).length > 0 ? entry.details : null;

                return (
                  <React.Fragment key={entry.id}>
                    <tr className="hover:bg-slate-850/50 transition-colors align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-slate-200 font-mono">{time}</div>
                        <div className="text-[10px] text-slate-500">{date}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-200">
                          <UserIcon className="w-3 h-3 text-slate-500" />
                          <span className="font-semibold">{entry.actorName}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {entry.actorRole
                            ? ROLE_LABELS[entry.actorRole as Role] ?? entry.actorRole
                            : "action système"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-200">{auditActionLabel(entry.action)}</div>
                        {entry.entityType && (
                          <div className="text-[10px] text-slate-500">
                            {AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                            {entry.entityId ? ` n°${entry.entityId}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${OUTCOME_STYLES[outcomeKey]}`}
                        >
                          {entry.outcome === "SUCCESS" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : entry.outcome === "DENIED" ? (
                            <ShieldAlert className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {auditOutcomeLabel(entry.outcome)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-md text-slate-300">{entry.summary}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                          className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 transition"
                          title="Détails techniques"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-950/60">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                            <div className="space-y-1">
                              <div className="text-slate-400 font-semibold uppercase tracking-wider">
                                Contexte technique
                              </div>
                              <div className="text-slate-300 flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                IP : <span className="font-mono">{entry.ipAddress ?? "non transmise"}</span>
                              </div>
                              <div className="text-slate-400">
                                Entrée n°{entry.id} • action <span className="font-mono">{entry.action}</span>
                                {entry.actorId ? (
                                  <>
                                    {" "}
                                    • auteur n°<span className="font-mono">{entry.actorId}</span>
                                  </>
                                ) : null}
                              </div>
                              {entry.userAgent && (
                                <div className="text-slate-500 break-all">Navigateur : {entry.userAgent}</div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="text-slate-400 font-semibold uppercase tracking-wider">
                                Détails enregistrés
                              </div>
                              {details ? (
                                <ul className="space-y-0.5">
                                  {Object.entries(details).map(([key, value]) => (
                                    <li key={key} className="text-slate-300">
                                      <span className="text-slate-500">{key} :</span>{" "}
                                      {renderDetailValue(value)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-slate-500">Aucun détail complémentaire.</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Aucune entrée pour ces critères. Les actions sensibles apparaîtront ici dès
                    qu&apos;elles seront effectuées.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-[11px] text-slate-400">
          <span>
            {loading
              ? "Chargement…"
              : `${total} entrée${total > 1 ? "s" : ""} — page ${page} / ${pageCount}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 disabled:opacity-40 flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-3 h-3" />
              Précédent
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => load(offset + PAGE_SIZE)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 disabled:opacity-40 flex items-center gap-1 transition"
            >
              Suivant
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
