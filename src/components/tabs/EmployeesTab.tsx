"use client";

import React, { useState } from "react";
import { Employee, Department } from "@/types";
import {
  Users,
  Plus,
  Fingerprint,
  Mail,
  Phone,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Search,
  ShieldCheck,
} from "lucide-react";

interface EmployeesTabProps {
  employees: Employee[];
  departments: Department[];
  onOpenEmployeeModal: (emp?: Employee) => void;
  onOpenEnrollment: (emp: Employee) => void;
  onRefreshNeeded: () => void;
}

export function EmployeesTab({
  employees,
  departments,
  onOpenEmployeeModal,
  onOpenEnrollment,
  onRefreshNeeded,
}: EmployeesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer définitivement le collaborateur "${name}" et ses pointages ?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onRefreshNeeded();
      } else {
        alert(data.error || "Erreur de suppression");
      }
    } catch {
      alert("Erreur de connexion");
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (departmentFilter !== "all" && emp.departmentId !== Number(departmentFilter)) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q) ||
      emp.jobTitle.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Gestion des Salariés & Enrôlement Biométrique
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {employees.length} collaborateurs enregistrés • Gabarits d&apos;empreintes digitales certifiés
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenEmployeeModal()}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouveau Salarié
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, matricule, email, fonction..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
        >
          <option value="all">Tous les départements</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.code})
            </option>
          ))}
        </select>
      </div>

      {/* Employee Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((emp) => {
          return (
            <div
              key={emp.id}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div>
                {/* Employee Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        emp.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          emp.firstName + " " + emp.lastName
                        )}&background=0284c7&color=fff`
                      }
                      alt={emp.firstName}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-700 flex-shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white">
                          {emp.firstName} {emp.lastName}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block mt-0.5">
                        {emp.employeeCode}
                      </span>
                    </div>
                  </div>

                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                    style={{
                      backgroundColor: `${emp.department?.color || "#3b82f6"}20`,
                      color: emp.department?.color || "#3b82f6",
                      border: `1px solid ${emp.department?.color || "#3b82f6"}40`,
                    }}
                  >
                    {emp.department?.code || "GEN"}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                  <div className="flex items-center gap-2 text-slate-300 font-medium">
                    <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{emp.jobTitle}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  {emp.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{emp.phone}</span>
                    </div>
                  )}
                </div>

                {/* Contract & Pay Info */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80 text-[11px] mb-4">
                  <div>
                    <span className="text-slate-500 block">Contrat</span>
                    <span className="text-slate-200 font-semibold">{emp.contractType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Taux hor.</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {emp.hourlyRate} €/h
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Quota</span>
                    <span className="text-slate-200 font-mono">{emp.weeklyHours}h/sem</span>
                  </div>
                </div>

                {/* Biometric Status Banner */}
                <div className="mb-4">
                  {emp.fingerprintEnrolled ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <Fingerprint className="w-4 h-4" />
                        <span>{emp.fingerprintFinger || "Pouce Droit"} Enrôlé</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-500/80">
                        Gabarit Actif
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>Empreinte non enrôlée</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenEnrollment(emp)}
                        className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] uppercase hover:bg-amber-400 transition"
                      >
                        Scanner
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenEnrollment(emp)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-medium border border-cyan-500/30 flex items-center gap-1.5 transition"
                  title="Enrôler ou réinitialiser l'empreinte biométrique"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>{emp.fingerprintEnrolled ? "Re-scanner pouce" : "Enrôler pouce"}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenEmployeeModal(emp)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Modifier les informations"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.id, `${emp.firstName} ${emp.lastName}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredEmployees.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs">
            Aucun salarié ne correspond aux critères de recherche.
          </div>
        )}
      </div>
    </div>
  );
}
