"use client";

import React, { useState } from "react";
import { login } from "@/lib/api-client";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Fingerprint, Lock, Mail, AlertCircle, ShieldCheck, RefreshCw } from "lucide-react";

interface LoginScreenProps {
  onAuthenticated: (user: {
    id: number;
    name: string;
    email: string;
    role: Role;
    roleLabel: string;
    avatarUrl: string | null;
    departmentId: number | null;
  }) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user) onAuthenticated(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Fingerprint className="w-8 h-8" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            BioPointage<span className="text-cyan-400">RH</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pointage biométrique & suivi des heures — accès protégé
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
        >
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Email professionnel
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="prenom.nom@entreprise.fr"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/50 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {loading ? "Vérification..." : "Se connecter"}
          </button>

          <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              Session chiffrée par cookie HttpOnly et mots de passe hachés (scrypt). Après 5
              tentatives échouées, l&apos;accès est temporairement bloqué.
            </span>
          </div>
        </form>

        <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">
            Comptes de démonstration (mot de passe : password123)
          </div>
          <ul className="space-y-0.5 font-mono">
            <li>admin@pointage-biometrique.fr — {ROLE_LABELS.admin}</li>
            <li>drh@pointage-biometrique.fr — {ROLE_LABELS.drh}</li>
            <li>manager@pointage-biometrique.fr — {ROLE_LABELS.manager}</li>
            <li>kiosk@pointage-biometrique.fr — {ROLE_LABELS.kiosk}</li>
          </ul>
          <p className="mt-2 text-slate-500">
            À changer avant toute utilisation réelle (menu utilisateur → Modifier mon mot de
            passe).
          </p>
        </div>
      </div>
    </div>
  );
}
