"use client";

import React from "react";
import type { Capability, Role } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  LayoutDashboard,
  Fingerprint,
  Clock,
  Users,
  CalendarCheck2,
  FileSpreadsheet,
  Building2,
  Shield,
  UserCog,
  ScrollText,
} from "lucide-react";

export type TabType =
  | "dashboard"
  | "terminal"
  | "punches"
  | "employees"
  | "timesheets"
  | "reports"
  | "departments"
  | "users"
  | "audit";

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  presentCount: number;
  totalEmployees: number;
  role: Role;
  capabilities: Record<Capability, boolean>;
}

export function Sidebar({
  currentTab,
  onTabChange,
  presentCount,
  totalEmployees,
  role,
  capabilities,
}: SidebarProps) {
  const allItems: {
    id: TabType;
    label: string;
    icon: React.ElementType;
    badge?: string;
    visible: boolean;
  }[] = [
    {
      id: "dashboard",
      label: "Tableau de bord DRH",
      icon: LayoutDashboard,
      visible: capabilities.viewPortal,
    },
    {
      id: "terminal",
      label: "Borne de pointage",
      icon: Fingerprint,
      badge: "Scanner",
      visible: capabilities.punchTerminal,
    },
    {
      id: "punches",
      label: "Pointages & présences",
      icon: Clock,
      visible: capabilities.viewPortal,
    },
    {
      id: "employees",
      label: "Salariés & biométrie",
      icon: Users,
      badge: String(totalEmployees),
      visible: capabilities.viewPortal,
    },
    {
      id: "timesheets",
      label: "Feuilles d'heures & paie",
      icon: CalendarCheck2,
      visible: capabilities.viewPortal,
    },
    {
      id: "reports",
      label: "Envoi de fichiers",
      icon: FileSpreadsheet,
      badge: "DRH",
      visible: capabilities.dispatchReports,
    },
    {
      id: "departments",
      label: "Pôles & horaires",
      icon: Building2,
      visible: capabilities.viewPortal,
    },
    {
      id: "users",
      label: "Comptes & rôles",
      icon: UserCog,
      badge: "Admin",
      visible: capabilities.manageUsers,
    },
    {
      id: "audit",
      label: "Journal d'audit",
      icon: ScrollText,
      badge: "Traçabilité",
      visible: capabilities.viewAudit,
    },
  ];

  const menuItems = allItems.filter((item) => item.visible);

  return (
    <aside className="w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col justify-between p-4 text-slate-300">
      <div className="space-y-6">
        {/* Presence mini card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/90 rounded-2xl p-4 border border-slate-700/60 shadow-inner">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Présence en direct</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{presentCount}</span>
            <span className="text-xs text-slate-400 font-mono">
              / {totalEmployees} salariés sur site
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500 rounded-full"
              style={{
                width: `${totalEmployees > 0 ? (presentCount / totalEmployees) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Menu Navigation */}
        <nav className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Navigation principale
          </div>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold ${
                      isActive ? "bg-cyan-400/20 text-cyan-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom system security stamp */}
      <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-500 space-y-1">
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span>Accès contrôlé</span>
        </div>
        <p className="text-[10px] leading-tight text-slate-500">
          Connecté en tant que <strong className="text-slate-400">{ROLE_LABELS[role]}</strong>.
          Chaque action est rattachée à votre compte.
        </p>
      </div>
    </aside>
  );
}
