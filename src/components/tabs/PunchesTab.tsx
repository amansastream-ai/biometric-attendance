"use client";

import React, { useState, useEffect } from "react";
import { PunchRecord, Employee, Department } from "@/types";
import {
  Clock,
  Filter,
  Plus,
  Download,
  Fingerprint,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface PunchesTabProps {
  employees: Employee[];
  departments: Department[];
  onOpenManualPunch: (punch?: PunchRecord) => void;
  onRefreshNeeded: () => void;
}

export function PunchesTab({
  employees,
  departments,
  onOpenManualPunch,
  onRefreshNeeded,
}: PunchesTabProps) {
  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmpFilter, setSelectedEmpFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPunches = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedEmpFilter !== "all") params.set("employeeId", selectedEmpFilter);
      if (selectedTypeFilter !== "all") params.set("type", selectedTypeFilter);
      if (selectedStatusFilter !== "all") params.set("status", selectedStatusFilter);
      params.set("limit", "150");

      const res = await fetch(`/api/punch?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPunches(data.punches || []);
      }
    } catch (err) {
      console.error("Error fetching punches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPunches();
  }, [selectedEmpFilter, selectedTypeFilter, selectedStatusFilter]);

  const handleDeletePunch = async (id: number) => {
    if (!confirm("Voulez-vous vraiment supprimer ce pointage ?")) return;
    try {
      const res = await fetch(`/api/punch/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchPunches();
        onRefreshNeeded();
      } else {
        alert(data.error || "Erreur de suppression");
      }
    } catch (err) {
      alert("Erreur réseau");
    }
  };

  const filteredPunches = punches.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const fullName = `${p.employee?.firstName || ""} ${p.employee?.lastName || ""}`.toLowerCase();
    const code = (p.employee?.employeeCode || "").toLowerCase();
    const reason = (p.manualReason || "").toLowerCase();
    return fullName.includes(q) || code.includes(q) || reason.includes(q);
  });

  const exportCurrentViewCsv = () => {
    window.open("/api/reports/export?period=THIS_MONTH", "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            Historique Complet des Pointages
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Journal d&apos;émargement biométrique certifié • Heures d&apos;arrivée, pause et départ
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={exportCurrentViewCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => onOpenManualPunch()}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Pointage Manuel
          </button>
          <button
            type="button"
            onClick={fetchPunches}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 transition"
            title="Actualiser la liste"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher salarié, motif..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Employee Filter */}
        <div>
          <select
            value={selectedEmpFilter}
            onChange={(e) => setSelectedEmpFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous les collaborateurs</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.lastName} {e.firstName} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>

        {/* Punch Type Filter */}
        <div>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous les types de pointage</option>
            <option value="IN">Arrivée (Matin)</option>
            <option value="BREAK_START">Début Pause</option>
            <option value="BREAK_END">Fin Pause / Reprise</option>
            <option value="OUT">Départ (Soir)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="VALID">Conforme / À l&apos;heure</option>
            <option value="LATE">Retard</option>
            <option value="OVERTIME">Heures Supplémentaires</option>
          </select>
        </div>
      </div>

      {/* Punches Data Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Salarié</th>
                <th className="px-4 py-3.5">Date & Heure</th>
                <th className="px-4 py-3.5">Événement</th>
                <th className="px-4 py-3.5">Biométrie & Doigt</th>
                <th className="px-4 py-3.5">Statut / Tolérance</th>
                <th className="px-4 py-3.5">Borne / Lieu</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPunches.map((punch) => {
                const dateObj = new Date(punch.punchTime);
                const dateFormatted = dateObj.toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                const timeFormatted = dateObj.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });

                return (
                  <tr
                    key={punch.id}
                    className="hover:bg-slate-850/50 transition-colors"
                  >
                    {/* Employee */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            punch.employee?.avatarUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              (punch.employee?.firstName || "") + " " + (punch.employee?.lastName || "")
                            )}`
                          }
                          alt="Avatar"
                          className="w-8 h-8 rounded-full object-cover border border-slate-700"
                        />
                        <div>
                          <div className="font-semibold text-white">
                            {punch.employee?.firstName} {punch.employee?.lastName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {punch.employee?.employeeCode} • {punch.employee?.department?.name || "Général"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-cyan-300 font-semibold">
                        {timeFormatted}
                      </div>
                      <div className="text-[11px] text-slate-400 capitalize">
                        {dateFormatted}
                      </div>
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          punch.type === "IN"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : punch.type === "OUT"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : punch.type === "BREAK_START"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                        }`}
                      >
                        {punch.type === "IN"
                          ? "Arrivée"
                          : punch.type === "OUT"
                          ? "Départ"
                          : punch.type === "BREAK_START"
                          ? "Pause Déjeuner"
                          : "Reprise"}
                      </span>
                      {punch.isManual && (
                        <div className="text-[10px] text-amber-400 mt-1 italic">
                          Manuel: {punch.manualReason || "DRH"}
                        </div>
                      )}
                    </td>

                    {/* Biometrics */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-medium">
                          {punch.fingerMatched || "Pouce Droit"}
                        </span>
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono">
                        {punch.punchMethod === "FINGERPRINT"
                          ? `${punch.biometricConfidence || 98}% match optique`
                          : "Saisie DRH"}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {punch.status === "LATE" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          Retard
                        </span>
                      ) : punch.status === "OVERTIME" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/30">
                          Heure Sup
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Conforme
                        </span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {punch.kioskLocation}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenManualPunch(punch)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          title="Modifier le pointage"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePunch(punch.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Supprimer le pointage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredPunches.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500 text-xs">
                    {loading ? "Chargement des pointages..." : "Aucun enregistrement trouvé."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
