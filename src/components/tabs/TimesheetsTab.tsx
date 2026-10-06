"use client";

import React, { useState, useEffect } from "react";
import { Employee, Department, DailySummary, EmployeeAggregate } from "@/types";
import {
  CalendarCheck2,
  Clock,
  Download,
  Send,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  RefreshCw,
} from "lucide-react";

interface TimesheetsTabProps {
  employees: Employee[];
  departments: Department[];
  onOpenDispatchReport: () => void;
}

export function TimesheetsTab({
  employees,
  departments,
  onOpenDispatchReport,
}: TimesheetsTabProps) {
  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");
  const [period, setPeriod] = useState<string>("THIS_MONTH");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [employeeAggregates, setEmployeeAggregates] = useState<EmployeeAggregate[]>([]);
  const [totalNetHours, setTotalNetHours] = useState(0);
  const [totalOvertime, setTotalOvertime] = useState(0);
  const [totalLateMinutes, setTotalLateMinutes] = useState(0);

  const fetchTimesheets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("period", period);
      if (departmentId !== "all") params.set("departmentId", departmentId);
      if (employeeId !== "all") params.set("employeeId", employeeId);

      const res = await fetch(`/api/timesheets?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDailySummaries(data.dailySummaries || []);
        setEmployeeAggregates(data.employeeAggregates || []);
        setTotalNetHours(data.totalNetHours || 0);
        setTotalOvertime(data.totalOvertime || 0);
        setTotalLateMinutes(data.totalLateMinutes || 0);
      }
    } catch (err) {
      console.error("Error fetching timesheets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimesheets();
  }, [period, departmentId, employeeId]);

  const handleDownloadCsv = () => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (departmentId !== "all") params.set("departmentId", departmentId);
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
  };

  const filteredAggregates = employeeAggregates.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      e.jobTitle.toLowerCase().includes(q)
    );
  });

  const filteredDaily = dailySummaries.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.employeeName.toLowerCase().includes(q) ||
      d.employeeCode.toLowerCase().includes(q) ||
      d.departmentName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <CalendarCheck2 className="w-5 h-5 text-cyan-400" />
            Feuilles d&apos;Heures & Décompte de Présence
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Calcul automatisé des heures travaillées, heures supplémentaires (+25%) et retards
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Télécharger CSV
          </button>
          <button
            type="button"
            onClick={onOpenDispatchReport}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Envoyer Fichier aux DRH
          </button>
        </div>
      </div>

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">
              Total Heures Effectives
            </span>
            <span className="text-2xl font-bold font-mono text-cyan-400">
              {totalNetHours.toFixed(1)}h
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Net après déduction des pauses
            </span>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/15 text-cyan-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">
              Heures Supplémentaires
            </span>
            <span className="text-2xl font-bold font-mono text-purple-400">
              +{totalOvertime.toFixed(1)}h
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Au-delà du forfait contrat (35h)
            </span>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/15 text-purple-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">
              Cumul Retards Constatés
            </span>
            <span className="text-2xl font-bold font-mono text-rose-400">
              {totalLateMinutes} min
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Dépassements de tolérance
            </span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* View Switcher & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setViewMode("summary")}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === "summary"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Récapitulatif par Salarié (Paie)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("detailed")}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === "detailed"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Détail Journalier (Émargement)
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Period filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="THIS_MONTH">Mois en cours</option>
            <option value="LAST_MONTH">Mois dernier</option>
            <option value="THIS_WEEK">Cette semaine</option>
          </select>

          {/* Department filter */}
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous pôles</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Chercher salarié..."
              className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-36 sm:w-44"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === "summary" ? (
        /* SUMMARY TABLE BY EMPLOYEE */
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Salarié</th>
                  <th className="px-4 py-3.5">Pôle</th>
                  <th className="px-4 py-3.5 text-center">Jours Travaillés</th>
                  <th className="px-4 py-3.5">Heures Effectives</th>
                  <th className="px-4 py-3.5">Heures Sup (+25%)</th>
                  <th className="px-4 py-3.5">Retard Total</th>
                  <th className="px-4 py-3.5 text-right">Montant Brut Estimé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAggregates.map((agg) => (
                  <tr key={agg.employeeId} className="hover:bg-slate-850/50 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{agg.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {agg.employeeCode} • {agg.jobTitle}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${agg.department?.color || "#3b82f6"}20`,
                          color: agg.department?.color || "#3b82f6",
                        }}
                      >
                        {agg.department?.name || "Général"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono text-slate-300">
                      {agg.daysWorked} j
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono font-bold text-cyan-300 text-sm">
                        {agg.totalHoursFormatted}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        ({agg.totalHours}h décimal)
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {agg.overtimeHours > 0 ? (
                        <span className="font-mono font-semibold text-purple-400">
                          {agg.overtimeFormatted}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {agg.lateMinutes > 0 ? (
                        <span className="text-rose-400 font-semibold font-mono">
                          {agg.lateMinutes} min
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-medium">0 min</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        {agg.estimatedPay}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ({agg.hourlyRate} €/h)
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredAggregates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500 text-xs">
                      {loading ? "Calcul des heures en cours..." : "Aucune donnée de présence pour cette période."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* DETAILED DAY-BY-DAY TABLE */
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Salarié</th>
                  <th className="px-3 py-3.5 text-center">Arrivée</th>
                  <th className="px-3 py-3.5 text-center">Début Pause</th>
                  <th className="px-3 py-3.5 text-center">Fin Pause</th>
                  <th className="px-3 py-3.5 text-center">Départ</th>
                  <th className="px-3 py-3.5 text-center">Pause (min)</th>
                  <th className="px-4 py-3.5">Heures Nettes</th>
                  <th className="px-4 py-3.5">Heures Sup</th>
                  <th className="px-4 py-3.5">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDaily.map((d, idx) => (
                  <tr key={`${d.employeeId}-${d.date}-${idx}`} className="hover:bg-slate-850/50 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-slate-200">{d.dateFormatted}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{d.dayName}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white">{d.employeeName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {d.employeeCode}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-center font-mono font-medium text-cyan-300">
                      {d.arrivalTime || "--:--"}
                    </td>
                    <td className="px-3 py-3.5 text-center font-mono text-slate-400">
                      {d.breakStartTime || "--:--"}
                    </td>
                    <td className="px-3 py-3.5 text-center font-mono text-slate-400">
                      {d.breakEndTime || "--:--"}
                    </td>
                    <td className="px-3 py-3.5 text-center font-mono font-medium text-rose-300">
                      {d.departureTime || "--:--"}
                    </td>
                    <td className="px-3 py-3.5 text-center font-mono text-slate-400">
                      {d.breakMinutes} min
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono font-bold text-white text-sm">
                        {d.netHoursFormatted}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {d.overtimeHours > 0 ? (
                        <span className="font-mono font-semibold text-purple-400">
                          {d.overtimeFormatted}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono">0h</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {d.status === "ONGOING" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          En cours
                        </span>
                      ) : d.status === "OVERTIME" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          Heure Sup
                        </span>
                      ) : d.status === "LATE" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          Retard (+{d.lateMinutes}m)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Conforme
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredDaily.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-slate-500 text-xs">
                      {loading ? "Chargement des feuilles de présence..." : "Aucun pointage détaillé pour cette sélection."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
