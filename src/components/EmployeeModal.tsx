"use client";

import React, { useState, useEffect } from "react";
import { Employee, Department } from "@/types";
import { User, Mail, Phone, Briefcase, DollarSign, X, Check, Fingerprint } from "lucide-react";

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  employeeToEdit?: Employee | null;
  onSaved: () => void;
  onOpenEnrollment?: (employee: Employee) => void;
}

export function EmployeeModal({
  isOpen,
  onClose,
  departments,
  employeeToEdit,
  onSaved,
  onOpenEnrollment,
}: EmployeeModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState<number>(departments[0]?.id || 1);
  const [jobTitle, setJobTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("22.50");
  const [contractType, setContractType] = useState("CDI");
  const [fingerprintFinger, setFingerprintFinger] = useState("Pouce Droit");
  const [weeklyHours, setWeeklyHours] = useState(35);
  const [pinCode, setPinCode] = useState("1234");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (employeeToEdit) {
      setFirstName(employeeToEdit.firstName);
      setLastName(employeeToEdit.lastName);
      setEmail(employeeToEdit.email);
      setPhone(employeeToEdit.phone || "");
      setDepartmentId(employeeToEdit.departmentId);
      setJobTitle(employeeToEdit.jobTitle);
      setHourlyRate(employeeToEdit.hourlyRate || "22.50");
      setContractType(employeeToEdit.contractType || "CDI");
      setFingerprintFinger(employeeToEdit.fingerprintFinger || "Pouce Droit");
      setWeeklyHours(employeeToEdit.weeklyHours || 35);
      setPinCode(employeeToEdit.pinCode || "1234");
      setNotes(employeeToEdit.notes || "");
    } else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      if (departments.length > 0) setDepartmentId(departments[0].id);
      setJobTitle("");
      setHourlyRate("22.50");
      setContractType("CDI");
      setFingerprintFinger("Pouce Droit");
      setWeeklyHours(35);
      setPinCode("1234");
      setNotes("");
    }
    setError(null);
  }, [employeeToEdit, isOpen, departments]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        firstName,
        lastName,
        email,
        phone,
        departmentId,
        jobTitle,
        hourlyRate,
        contractType,
        fingerprintFinger,
        weeklyHours,
        pinCode,
        notes,
      };

      if (employeeToEdit) {
        const res = await fetch(`/api/employees/${employeeToEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      } else {
        const res = await fetch("/api/employees", {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {employeeToEdit ? "Modifier la fiche salarié" : "Nouveau Salarié"}
              </h3>
              <p className="text-xs text-slate-400">
                Informations du contrat et configuration de l&apos;empreinte
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Prénom *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex: Alexandre"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Nom *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ex: Dubois"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                Email professionnel *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@entreprise.fr"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-cyan-400" />
                Téléphone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                Département / Pôle *
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Poste / Titre *
              </label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ex: Développeur Senior"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Taux horaire (€)
              </label>
              <input
                type="number"
                step="0.5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Contrat
              </label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="Alternance">Alternance</option>
                <option value="Stage">Stage</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Doigt de référence
              </label>
              <select
                value={fingerprintFinger}
                onChange={(e) => setFingerprintFinger(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="Pouce Droit">Pouce Droit</option>
                <option value="Pouce Gauche">Pouce Gauche</option>
                <option value="Index Droit">Index Droit</option>
                <option value="Index Gauche">Index Gauche</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Notes DRH / Spécificités horaires
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Télétravail les mardis, astreinte week-end..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {employeeToEdit && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-300 block">
                  Empreinte biométrique
                </span>
                <span className="text-[11px] text-slate-500">
                  {employeeToEdit.fingerprintEnrolled
                    ? `Enrôlée (${employeeToEdit.fingerprintFinger || "Pouce"})`
                    : "Non enregistrée"}
                </span>
              </div>
              {onOpenEnrollment && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEnrollment(employeeToEdit);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-medium border border-cyan-500/30 flex items-center gap-1.5 transition"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  Scanner empreinte
                </button>
              )}
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
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
              <span>{employeeToEdit ? "Enregistrer" : "Créer le salarié"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
