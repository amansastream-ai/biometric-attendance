"use client";

import React, { useState, useEffect } from "react";
import { UserMenu } from "@/components/UserMenu";
import type { Capability, Role } from "@/lib/permissions";
import { Fingerprint, Send, RotateCcw, Monitor } from "lucide-react";

interface NavbarProps {
  currentUser: {
    id: number;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string | null;
  };
  capabilities: Record<Capability, boolean>;
  onOpenDispatchReport: () => void;
  onOpenKioskView: () => void;
  onResetSeed: () => void;
  onNavigateUsers: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}

export function Navbar({
  currentUser,
  capabilities,
  onOpenDispatchReport,
  onOpenKioskView,
  onResetSeed,
  onNavigateUsers,
  onChangePassword,
  onLogout,
}: NavbarProps) {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">
                BioPointage<span className="text-cyan-400">RH</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 font-semibold uppercase">
                Empreinte digitale
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Pointage biométrique vérifié & suivi des heures
            </p>
          </div>
        </div>

        {/* Center: Live time indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Pointage actif • {currentTime}</span>
        </div>

        {/* Right: Actions & User */}
        <div className="flex items-center gap-2.5">
          {capabilities.dispatchReports && (
            <button
              type="button"
              onClick={onOpenDispatchReport}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Envoyer fichier aux DRH</span>
            </button>
          )}

          {capabilities.punchTerminal && (
            <button
              type="button"
              onClick={onOpenKioskView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-medium border border-slate-700 transition"
              title="Ouvrir la borne d'entrée en mode plein écran"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mode borne</span>
            </button>
          )}

          {capabilities.manageUsers && (
            <button
              type="button"
              onClick={onResetSeed}
              className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-750 text-slate-400 hover:text-white transition"
              title="Réinitialiser les données de démonstration"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <UserMenu
            user={{
              name: currentUser.name,
              role: currentUser.role,
              avatarUrl: currentUser.avatarUrl,
              email: currentUser.email,
            }}
            canManageUsers={capabilities.manageUsers}
            onNavigateUsers={onNavigateUsers}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}
