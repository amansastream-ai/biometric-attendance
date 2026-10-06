"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Employee } from "@/types";
import {
  UserCog,
  Plus,
  Trash2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  Users2,
} from "lucide-react";

interface UsersTabProps {
  currentUserId: number;
  isAdmin: boolean;
  employees: Employee[];
  onNotify: (message: string, isError?: boolean) => void;
}

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  departmentId: number | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  activeSessions: number;
};

export function UsersTab({ currentUserId, isAdmin, employees, onNotify }: UsersTabProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire de création
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("drh");
  const [newDepartmentId, setNewDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: ManagedUser[] }>("/api/users");
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ users: ManagedUser[] }>("/api/users")
      .then((data) => {
        if (!cancelled) setUsers(data.users || []);
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
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          departmentId: newDepartmentId ? Number(newDepartmentId) : null,
        }),
      });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("drh");
      setNewDepartmentId("");
      setIsCreating(false);
      onNotify("Compte créé avec succès.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const patchUser = async (id: number, body: Record<string, unknown>, successMessage: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ message?: string }>(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      onNotify(result.message || successMessage);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResetPassword = async (user: ManagedUser) => {
    const password = prompt(
      `Nouveau mot de passe pour ${user.name} (8 caractères minimum) :`
    );
    if (!password) return;
    await patchUser(user.id, { password }, `Mot de passe réinitialisé pour ${user.name}.`);
  };

  const handleDelete = async (user: ManagedUser) => {
    if (
      !confirm(
        `Supprimer définitivement le compte de ${user.name} ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      onNotify("Compte supprimé.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserCog className="w-5 h-5 text-cyan-400" />
            Comptes & habilitations
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Qui peut accéder aux données RH, enrôler des empreintes ou utiliser la borne
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau compte
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Nom complet
              </label>
              <input
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Nadia Diallo (DRH)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="nadia.diallo@entreprise.fr"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Mot de passe initial
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="8 caractères minimum"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Rôle
              </label>
              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as Role)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              >
                <option value="drh">{ROLE_LABELS.drh}</option>
                <option value="manager">{ROLE_LABELS.manager}</option>
                <option value="kiosk">{ROLE_LABELS.kiosk}</option>
                {isAdmin && <option value="admin">{ROLE_LABELS.admin}</option>}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Collaborateur rattaché (facultatif — utile pour le suivi par direction)
              </label>
              <select
                value={newDepartmentId}
                onChange={(event) => setNewDepartmentId(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/70 transition"
              >
                <option value="">— Aucun rattachement —</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.lastName} {employee.firstName} ({employee.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Créer le compte
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Utilisateur</th>
              <th className="text-left px-4 py-3 font-semibold">Rôle</th>
              <th className="text-left px-4 py-3 font-semibold">État</th>
              <th className="text-left px-4 py-3 font-semibold">Dernière connexion</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                  Chargement des comptes...
                </td>
              </tr>
            )}

            {!loading &&
              users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            user.avatarUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              user.name
                            )}&background=0891b2&color=fff`
                          }
                          alt={user.name}
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <div className="text-slate-100 font-medium flex items-center gap-1.5">
                            {user.name}
                            {isSelf && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 font-semibold">
                                vous
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        disabled={isSelf}
                        onChange={(event) =>
                          patchUser(
                            user.id,
                            { role: event.target.value },
                            `Rôle mis à jour pour ${user.name}.`
                          )
                        }
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 disabled:opacity-60 transition"
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/25">
                          <CheckCircle2 className="w-3 h-3" />
                          Actif
                          {user.activeSessions > 0 && (
                            <span className="text-emerald-300/80 font-mono">
                              • {user.activeSessions} session(s)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/25">
                          <AlertCircle className="w-3 h-3" />
                          Désactivé
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[11px] text-slate-400 font-mono">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "jamais"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleResetPassword(user)}
                          className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition"
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() =>
                            patchUser(
                              user.id,
                              { isActive: !user.isActive },
                              user.isActive
                                ? `Compte de ${user.name} désactivé.`
                                : `Compte de ${user.name} réactivé.`
                            )
                          }
                          className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 transition disabled:opacity-40"
                          title={user.isActive ? "Désactiver le compte" : "Réactiver le compte"}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => handleDelete(user)}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 transition disabled:opacity-40"
                            title="Supprimer le compte"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <Users2 className="w-3.5 h-3.5 text-cyan-400" />
          Rappel des habilitations
        </div>
        <ul className="space-y-1 pl-1">
          <li>
            <strong className="text-slate-300">Administrateur</strong> : tout, y compris la
            gestion des comptes et l&apos;attribution du rôle administrateur.
          </li>
          <li>
            <strong className="text-slate-300">Direction RH & Paie</strong> : salariés,
            pointages, paie, rapports, enrôlement des empreintes, comptes non-admin.
          </li>
          <li>
            <strong className="text-slate-300">Manager de pôle</strong> : consultation seule
            (aucune modification, aucune donnée de paie exportable).
          </li>
          <li>
            <strong className="text-slate-300">Borne de pointage</strong> : uniquement le
            pointage par empreinte (aucun accès aux données RH).
          </li>
        </ul>
        <p className="text-slate-500 pt-1">
          Toute modification de rôle ou de mot de passe révoque immédiatement les sessions de
          l&apos;utilisateur concerné.
        </p>
      </div>
    </div>
  );
}
