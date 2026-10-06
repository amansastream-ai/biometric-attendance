"use client";

import React, { useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import {
  ChevronDown,
  LogOut,
  KeyRound,
  UserCog,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from "lucide-react";

interface UserMenuProps {
  user: { name: string; role: Role; avatarUrl?: string | null; email: string };
  canManageUsers: boolean;
  /** Rôle sensible : la clé de sécurité (second facteur) est exigée. */
  twoFactorRequired: boolean;
  onNavigateUsers: () => void;
  onChangePassword: () => void;
  onOpenSecurity: () => void;
  onLogout: () => void;
}

export function UserMenu({
  user,
  canManageUsers,
  twoFactorRequired,
  onNavigateUsers,
  onChangePassword,
  onOpenSecurity,
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
      >
        <img
          src={
            user.avatarUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0891b2&color=fff`
          }
          alt={user.name}
          className="w-7 h-7 rounded-lg object-cover"
        />
        <div className="text-left hidden lg:block">
          <div className="text-xs font-semibold text-white leading-tight">
            {user.name.split(" ")[0]}
          </div>
          <div className="text-[10px] text-cyan-400 uppercase font-mono">{user.role}</div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                {user.name}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{user.email}</div>
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold uppercase tracking-wide">
                {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>

            <div className="py-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChangePassword();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Modifier mon mot de passe
              </button>

              {twoFactorRequired && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSecurity();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:bg-slate-800 transition"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                  Sécurité du compte (second facteur)
                </button>
              )}

              {canManageUsers && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigateUsers();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:bg-slate-800 transition"
                >
                  <UserCog className="w-3.5 h-3.5 text-cyan-400" />
                  Gérer les comptes & rôles
                </button>
              )}
            </div>

            <div className="border-t border-slate-800 pt-1">
              <div className="px-3 py-1.5 text-[10px] text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Session expirée automatiquement après 12 h
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-rose-300 hover:bg-rose-500/10 transition font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Se déconnecter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
