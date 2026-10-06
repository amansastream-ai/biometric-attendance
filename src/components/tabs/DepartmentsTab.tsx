"use client";

import React from "react";
import { Department } from "@/types";
import {
  Building2,
  Plus,
  Clock,
  Coffee,
  ShieldAlert,
  Users,
  Edit2,
  Trash2,
} from "lucide-react";

interface DepartmentsTabProps {
  departments: Department[];
  onOpenDepartmentModal: (dept?: Department) => void;
  onRefreshNeeded: () => void;
}

export function DepartmentsTab({
  departments,
  onOpenDepartmentModal,
  onRefreshNeeded,
}: DepartmentsTabProps) {
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer le département "${name}" ?`)) return;
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onRefreshNeeded();
      } else {
        alert(data.error || "Impossible de supprimer ce département");
      }
    } catch {
      alert("Erreur de connexion");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            Départements & Horaires de Référence
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configurez les plages de travail, tolérances de retard et pauses par service
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenDepartmentModal()}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouveau Pôle
        </button>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {departments.map((dept) => {
          return (
            <div
              key={dept.id}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div>
                {/* Header with color badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-md"
                      style={{ backgroundColor: dept.color || "#3b82f6" }}
                    >
                      {dept.code}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{dept.name}</h3>
                      <p className="text-xs text-slate-400">
                        Responsable : {dept.managerName || "Non spécifié"}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                    <Users className="w-3 h-3 text-cyan-400" />
                    {dept.employeeCount || 0}
                  </span>
                </div>

                {/* Schedules specs */}
                <div className="space-y-2.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 text-xs mb-4">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Horaires de travail
                    </span>
                    <span className="font-mono font-semibold text-white">
                      {dept.standardStart} - {dept.standardEnd}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Coffee className="w-3.5 h-3.5 text-amber-400" />
                      Pause déjeuner
                    </span>
                    <span className="font-mono text-slate-200">
                      {dept.breakDurationMinutes} minutes
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      Tolérance retard
                    </span>
                    <span className="font-mono text-rose-300">
                      +{dept.gracePeriodMinutes} min
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Forfait cible</span>
                    <span className="font-mono text-emerald-400">
                      {dept.weeklyTargetHours}h / semaine
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Code Pôle : <strong>{dept.code}</strong>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenDepartmentModal(dept)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Modifier les horaires du pôle"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(dept.id, dept.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Supprimer ce pôle"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
