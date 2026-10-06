"use client";

import React, { useState, useEffect } from "react";
import { AuthUser } from "@/types";
import {
  Fingerprint,
  Users,
  Send,
  RotateCcw,
  Shield,
  Monitor,
  ChevronDown,
} from "lucide-react";

interface NavbarProps {
  currentUser: AuthUser;
  onUserSwitch: (user: AuthUser) => void;
  onOpenDispatchReport: () => void;
  onOpenKioskView: () => void;
  onResetSeed: () => void;
}

export function Navbar({
  currentUser,
  onUserSwitch,
  onOpenDispatchReport,
  onOpenKioskView,
  onResetSeed,
}: NavbarProps) {
  const [currentTime, setCurrentTime] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const demoAccounts: AuthUser[] = [
    {
      id: 1,
      name: "Sophie Laurent (DRH)",
      email: "drh@pointage-biometrique.fr",
      role: "drh",
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    },
    {
      id: 2,
      name: "Thomas Moreau (Manager Tech)",
      email: "manager@pointage-biometrique.fr",
      role: "manager",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
    {
      id: 3,
      name: "Borne Entrée (Mode Kiosque)",
      email: "kiosk@pointage-biometrique.fr",
      role: "kiosk",
      avatarUrl: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=150&auto=format&fit=crop&q=80",
    },
  ];

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
                Empreinte Digitale
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Pointage biométrique du pouce & suivi des heures pour DRH
            </p>
          </div>
        </div>

        {/* Center: Live Time indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Pointage actif • {currentTime}</span>
        </div>

        {/* Right: Actions & User */}
        <div className="flex items-center gap-2.5">
          {/* Quick Dispatch Report Button */}
          <button
            type="button"
            onClick={onOpenDispatchReport}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Envoyer Fichier aux DRH</span>
          </button>

          {/* Dedicated Kiosk Mode button */}
          <button
            type="button"
            onClick={onOpenKioskView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-medium border border-slate-700 transition"
            title="Ouvrir la borne d'entrée en mode plein écran"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mode Borne</span>
          </button>

          {/* Reset Demo Data button */}
          <button
            type="button"
            onClick={onResetSeed}
            className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-750 text-slate-400 hover:text-white transition"
            title="Réinitialiser les données de démonstration"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* User Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
            >
              <img
                src={currentUser.avatarUrl || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150"}
                alt={currentUser.name}
                className="w-7 h-7 rounded-lg object-cover"
              />
              <div className="text-left hidden lg:block">
                <div className="text-xs font-semibold text-white leading-tight">
                  {currentUser.name.split(" ")[0]}
                </div>
                <div className="text-[10px] text-cyan-400 uppercase font-mono">
                  {currentUser.role}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
                  <div className="font-semibold text-white">Changer de compte / rôle</div>
                  <div>Testez les différents profils</div>
                </div>

                <div className="py-1 space-y-1">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        onUserSwitch(acc);
                        setShowUserDropdown(false);
                      }}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition ${
                        currentUser.id === acc.id
                          ? "bg-cyan-500/15 text-cyan-300 font-semibold"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <img
                        src={acc.avatarUrl!}
                        alt={acc.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <div className="text-xs truncate">{acc.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono capitalize">
                          {acc.role === "drh"
                            ? "Direction RH & Paie"
                            : acc.role === "manager"
                            ? "Manager de Pôle"
                            : "Borne Entrée"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
