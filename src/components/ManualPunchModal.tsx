"use client";

import React, { useState, useEffect } from "react";
import { Employee, PunchRecord } from "@/types";
import { Clock, AlertCircle, X, Check, Trash2 } from "lucide-react";

interface ManualPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  existingPunch?: PunchRecord | null;
  onSaved: () => void;
}

export function ManualPunchModal({
  isOpen,
  onClose,
  employees,
  existingPunch,
  onSaved,
}: ManualPunchModalProps) {
  const [employeeId, setEmployeeId] = useState<number>(employees[0]?.id || 1);
  const [type, setType] = useState<"IN" | "OUT" | "BREAK_START" | "BREAK_END">("IN");
  const [dateStr, setDateStr] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");
  const [manualReason, setManualReason] = useState<string>("");
  const [status, setStatus] = useState<string>("VALID");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingPunch) {
      setEmployeeId(existingPunch.employeeId);
      setType(existingPunch.type);
      setStatus(existingPunch.status);
      setManualReason(existingPunch.manualReason || "");
      const d = new Date(existingPunch.punchTime);
      setDateStr(d.toISOString().split("T")[0]);
      setTimeStr(
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    } else {
      const now = new Date();
      setDateStr(now.toISOString().split("T")[0]);
      setTimeStr(
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false })
      );
      setManualReason("");
      setType("IN");
      setStatus("VALID");
      if (employees.length > 0) setEmployeeId(employees[0].id);
    }
    setError(null);
  }, [existingPunch, isOpen, employees]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);

      if (existingPunch) {
        // Edit existing punch
        const res = await fetch(`/api/punch/${existingPunch.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            punchTime: combinedDateTime.toISOString(),
            type,
            status,
            manualReason: manualReason || "Modification DRH",
            manualEditedBy: "Sophie Laurent (DRH)",
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      } else {
        // Create manual punch
        const res = await fetch("/api/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            type,
            punchMethod: "MANUAL_DRH",
            punchTime: combinedDateTime.toISOString(),
            isManual: true,
            manualReason: manualReason || "Régularisation manuelle DRH",
            manualEditedBy: "Sophie Laurent (DRH)",
            kioskLocation: "Saisie Direction RH",
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingPunch) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce pointage ?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/punch/${existingPunch.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {existingPunch ? "Modifier le pointage" : "Ajouter un pointage manuel"}
              </h3>
              <p className="text-xs text-slate-400">
                Régularisation par la Direction des Ressources Humaines
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Employee selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Salarié
            </label>
            <select
              value={employeeId}
              disabled={Boolean(existingPunch)}
              onChange={(e) => setEmployeeId(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName} ({e.employeeCode}) - {e.jobTitle}
                </option>
              ))}
            </select>
          </div>

          {/* Type of Punch */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Événement de pointage
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "IN", label: "Arrivée (Matin)" },
                { id: "BREAK_START", label: "Début Pause" },
                { id: "BREAK_END", label: "Fin Pause" },
                { id: "OUT", label: "Départ (Soir)" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setType(opt.id as typeof type)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition ${
                    type === opt.id
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Heure exacte
              </label>
              <input
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Justification / Motif */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Motif de la régularisation DRH
            </label>
            <input
              type="text"
              placeholder="Ex: Oubli de pointage pouce, coupure réseau, mission externe..."
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-800">
            {existingPunch ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleDelete}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium border border-rose-500/30 transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{existingPunch ? "Enregistrer" : "Créer le pointage"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
