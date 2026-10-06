"use client";

import React, { useState, useEffect } from "react";
import { ReportDispatch, Department } from "@/types";
import {
  FileSpreadsheet,
  Mail,
  Download,
  Send,
  CheckCircle2,
  Calendar,
  Building,
  Users,
  Clock,
  Trash2,
  RefreshCw,
  FileCheck,
} from "lucide-react";

interface ReportsTabProps {
  departments: Department[];
  totalEmployeesCount: number;
  totalHoursMonth: number;
  totalOvertimeMonth: number;
  onOpenDispatchModal: () => void;
}

export function ReportsTab({
  departments,
  totalEmployeesCount,
  totalHoursMonth,
  totalOvertimeMonth,
  onOpenDispatchModal,
}: ReportsTabProps) {
  const [reports, setReports] = useState<ReportDispatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce rapport de l'historique des envois ?")) return;
    try {
      const res = await fetch(`/api/reports?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchReports();
      }
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  const handleDownloadCsv = (period: string = "THIS_MONTH") => {
    window.open(`/api/reports/export?period=${period}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
              Transmission des Fichiers de Présences & Heures
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
              Certifié DRH
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-2xl">
            Générez et expédiez les relevés de pointage biométrique et les décomptes d&apos;heures par e-mail directement à la Direction des Ressources Humaines ou au cabinet comptable.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenDispatchModal}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/25 flex items-center gap-2 self-start md:self-auto"
        >
          <Send className="w-4 h-4" />
          Transmettre un Nouveau Fichier
        </button>
      </div>

      {/* Quick Download Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Ce Mois */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-cyan-400 uppercase tracking-wider">
                Export Mensuel Paie
              </span>
              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
            </div>
            <h4 className="font-bold text-sm text-white">Mois en Cours (Clôture)</h4>
            <p className="text-xs text-slate-400 mt-1">
              Fichier CSV prêt pour import paie (Sage, Cegid, PayFit) avec heures nettes et heures supplémentaires.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadCsv("THIS_MONTH")}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger le fichier CSV
          </button>
        </div>

        {/* Card 2: Semaine en cours */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-emerald-400 uppercase tracking-wider">
                Relevé Hebdomadaire
              </span>
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="font-bold text-sm text-white">Semaine en Cours</h4>
            <p className="text-xs text-slate-400 mt-1">
              Suivi d&apos;activité de la semaine, analyse des retards du matin et des présences par département.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadCsv("THIS_WEEK")}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger la semaine (CSV)
          </button>
        </div>

        {/* Card 3: Mois Dernier */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-purple-400 uppercase tracking-wider">
                Archives Déclarations
              </span>
              <FileCheck className="w-4 h-4 text-purple-400" />
            </div>
            <h4 className="font-bold text-sm text-white">Mois Précédent</h4>
            <p className="text-xs text-slate-400 mt-1">
              Historique complet archivé pour contrôle URSSAF et fiches de présence signées.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadCsv("LAST_MONTH")}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger archives (CSV)
          </button>
        </div>
      </div>

      {/* Dispatched Reports History */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              Historique des Fichiers Transmis aux DRH & Comptables
            </h3>
            <p className="text-xs text-slate-400">
              Traçabilité des envois de feuilles de présences avec accusé de réception
            </p>
          </div>

          <button
            type="button"
            onClick={fetchReports}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Actualiser la liste"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Intitulé du Fichier</th>
                <th className="px-4 py-3.5">Destinataire</th>
                <th className="px-4 py-3.5">Date d&apos;Envoi</th>
                <th className="px-4 py-3.5">Période</th>
                <th className="px-4 py-3.5">Volume Transmis</th>
                <th className="px-4 py-3.5">Format</th>
                <th className="px-4 py-3.5">Statut</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {reports.map((rep) => {
                const dateObj = new Date(rep.sentAt);
                const dateStr = dateObj.toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
                const timeStr = dateObj.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <tr key={rep.id} className="hover:bg-slate-850/50 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{rep.title}</div>
                      <div className="text-[11px] text-slate-400">
                        Émis par : {rep.sentBy}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-200">
                        {rep.recipientName}
                      </div>
                      <div className="text-[10px] text-cyan-400 font-mono">
                        {rep.recipientEmail}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-mono text-slate-300">{dateStr}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{timeStr}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-mono text-slate-300">
                        {rep.periodStart} au {rep.periodEnd}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-mono text-slate-200 font-semibold">
                        {rep.totalHoursWorked}h faites
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {rep.totalEmployees} salariés • +{rep.totalOvertimeHours}h sup
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {rep.fileFormat}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Délivré
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadCsv("THIS_MONTH")}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                          title="Télécharger à nouveau"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rep.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Supprimer l'entrée"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {reports.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500 text-xs">
                    {loading ? "Chargement des transmissions..." : "Aucun fichier transmis pour le moment."}
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
