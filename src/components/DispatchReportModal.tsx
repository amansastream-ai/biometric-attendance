"use client";

import React, { useState } from "react";
import { Department } from "@/types";
import {
  Mail,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  Calendar,
  Building,
} from "lucide-react";

interface DispatchReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  totalEmployeesCount: number;
  totalHoursMonth: number;
  totalOvertimeMonth: number;
  onReportDispatched?: () => void;
}

export function DispatchReportModal({
  isOpen,
  onClose,
  departments,
  totalEmployeesCount,
  totalHoursMonth,
  totalOvertimeMonth,
  onReportDispatched,
}: DispatchReportModalProps) {
  const [recipientPreset, setRecipientPreset] = useState<string>("drh");
  const [recipientEmail, setRecipientEmail] = useState<string>("drh@pointage-biometrique.fr");
  const [recipientName, setRecipientName] = useState<string>("Sophie Laurent (Direction RH)");
  const [periodType, setPeriodType] = useState<string>("THIS_MONTH");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [fileFormat, setFileFormat] = useState<string>("CSV");
  const [notes, setNotes] = useState<string>(
    "Relevé des présences biométriques et heures de travail validées pour la paie."
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [successResult, setSuccessResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePresetChange = (preset: string) => {
    setRecipientPreset(preset);
    if (preset === "drh") {
      setRecipientEmail("drh@pointage-biometrique.fr");
      setRecipientName("Sophie Laurent (Direction RH)");
    } else if (preset === "paie") {
      setRecipientEmail("paie@cabinet-expertise.fr");
      setRecipientName("Cabinet Expertise Comptable & Social");
    } else if (preset === "direction") {
      setRecipientEmail("direction@pointage-biometrique.fr");
      setRecipientName("Direction Générale");
    }
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessResult(null);

    try {
      const title = `Fichier Présences & Heures Réalisées - ${
        periodType === "THIS_MONTH"
          ? "Ce Mois-ci"
          : periodType === "THIS_WEEK"
          ? "Cette Semaine"
          : "Mois Dernier"
      }`;

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          recipientEmail,
          recipientName,
          periodType,
          departmentId: departmentId === "all" ? null : Number(departmentId),
          fileFormat,
          totalEmployees: totalEmployeesCount,
          totalHoursWorked: totalHoursMonth.toFixed(2),
          totalOvertimeHours: totalOvertimeMonth.toFixed(2),
          notes,
          sentBy: "Sophie Laurent (DRH)",
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setSuccessResult(
        `Le fichier des présences et des heures a été transmis avec succès à ${recipientEmail} !`
      );
      if (onReportDispatched) {
        onReportDispatched();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDownloadCsv = () => {
    const params = new URLSearchParams();
    params.set("period", periodType);
    if (departmentId !== "all") params.set("departmentId", departmentId);
    params.set("format", fileFormat);

    window.open(`/api/reports/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Envoi du Fichier de Présences & Heures
              </h3>
              <p className="text-xs text-slate-400">
                Transmission directe aux DRH, gestionnaires de paie ou comptables
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {successResult ? (
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-white">Transmission Réussie !</h4>
              <p className="text-sm text-slate-300 max-w-md">{successResult}</p>
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 text-left w-full space-y-1">
                <div>
                  <strong>Format du fichier :</strong> {fileFormat} compatible Excel & Logiciels Paie
                </div>
                <div>
                  <strong>Destinataire certifié :</strong> {recipientName} ({recipientEmail})
                </div>
                <div>
                  <strong>Total salariés inclus :</strong> {totalEmployeesCount}
                </div>
                <div>
                  <strong>Volume d&apos;heures transmises :</strong> ~{totalHoursMonth} heures
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDirectDownloadCsv}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 border border-slate-700"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  Télécharger une copie CSV
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider"
                >
                  Terminer
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendReport} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Fast Presets */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Destinataire du rapport
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handlePresetChange("drh")}
                    className={`p-2.5 rounded-xl text-xs font-medium border text-center transition ${
                      recipientPreset === "drh"
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Direction RH
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange("paie")}
                    className={`p-2.5 rounded-xl text-xs font-medium border text-center transition ${
                      recipientPreset === "paie"
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Cabinet Paie
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange("direction")}
                    className={`p-2.5 rounded-xl text-xs font-medium border text-center transition ${
                      recipientPreset === "direction"
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Direction Générale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="Email destinataire"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Nom ou Titre du destinataire"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Period & Department Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    Période d&apos;extraction
                  </label>
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="THIS_MONTH">Mois en cours (Clôture paie)</option>
                    <option value="LAST_MONTH">Mois dernier (Archives)</option>
                    <option value="THIS_WEEK">Semaine en cours</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-cyan-400" />
                    Périmètre
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">Toute l&apos;entreprise (Tous pôles)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                  Format du fichier joint
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "CSV", label: "CSV Universel", desc: "Excel & Calc" },
                    { id: "XLSX_CSV", label: "Export Paie", desc: "Sage / Cegid" },
                    { id: "PDF_BULLETIN", label: "Bulletin Imprimable", desc: "Format A4" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFileFormat(f.id)}
                      className={`p-2 rounded-xl text-left border transition ${
                        fileFormat === f.id
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-bold">{f.label}</div>
                      <div className="text-[10px] text-slate-500">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note / Message */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Note d&apos;accompagnement pour la comptabilité / DRH
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleDirectDownloadCsv}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  Télécharger CSV
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{loading ? "Envoi en cours..." : "Envoyer par email"}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
