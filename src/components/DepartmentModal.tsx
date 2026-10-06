"use client";

import React, { useState, useEffect } from "react";
import { Department } from "@/types";
import { Building, Clock, Check, X, Trash2 } from "lucide-react";

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentToEdit?: Department | null;
  onSaved: () => void;
}

export function DepartmentModal({
  isOpen,
  onClose,
  departmentToEdit,
  onSaved,
}: DepartmentModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [standardStart, setStandardStart] = useState("08:30");
  const [standardEnd, setStandardEnd] = useState("17:30");
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(60);
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(35);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(10);
  const [managerName, setManagerName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (departmentToEdit) {
      setName(departmentToEdit.name);
      setCode(departmentToEdit.code);
      setColor(departmentToEdit.color);
      setStandardStart(departmentToEdit.standardStart);
      setStandardEnd(departmentToEdit.standardEnd);
      setBreakDurationMinutes(departmentToEdit.breakDurationMinutes);
      setWeeklyTargetHours(departmentToEdit.weeklyTargetHours);
      setGracePeriodMinutes(departmentToEdit.gracePeriodMinutes);
      setManagerName(departmentToEdit.managerName || "");
    } else {
      setName("");
      setCode("");
      setColor("#2563eb");
      setStandardStart("08:30");
      setStandardEnd("17:30");
      setBreakDurationMinutes(60);
      setWeeklyTargetHours(35);
      setGracePeriodMinutes(10);
      setManagerName("");
    }
    setError(null);
  }, [departmentToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name,
        code,
        color,
        standardStart,
        standardEnd,
        breakDurationMinutes,
        weeklyTargetHours,
        gracePeriodMinutes,
        managerName,
      };

      if (departmentToEdit) {
        const res = await fetch(`/api/departments/${departmentToEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      } else {
        const res = await fetch("/api/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
    if (!departmentToEdit) return;
    if (!confirm(`Supprimer le pôle "${departmentToEdit.name}" ?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/departments/${departmentToEdit.id}`, {
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
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {departmentToEdit ? "Modifier le pôle" : "Nouveau pôle"}
              </h3>
              <p className="text-xs text-slate-400">
                Horaires de référence et tolérance de retard
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Nom du département *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: R&D & Tech"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Code *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="TECH"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 uppercase focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Arrivée standard
              </label>
              <input
                type="time"
                required
                value={standardStart}
                onChange={(e) => setStandardStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Départ standard
              </label>
              <input
                type="time"
                required
                value={standardEnd}
                onChange={(e) => setStandardEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Tolérance retard (min)
              </label>
              <input
                type="number"
                value={gracePeriodMinutes}
                onChange={(e) => setGracePeriodMinutes(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Pause standard (min)
              </label>
              <input
                type="number"
                value={breakDurationMinutes}
                onChange={(e) => setBreakDurationMinutes(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Responsable du pôle
              </label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Ex: Thomas Moreau"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Couleur d&apos;identification
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-9 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer p-0.5"
                />
                <span className="text-xs font-mono text-slate-400">{color}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-slate-800">
            {departmentToEdit ? (
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
                <span>{departmentToEdit ? "Enregistrer" : "Créer le pôle"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
