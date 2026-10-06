"use client";

import React from "react";
import { Employee, PunchRecord } from "@/types";
import {
  Users,
  Clock,
  AlertTriangle,
  Fingerprint,
  TrendingUp,
  CheckCircle2,
  Coffee,
  Calendar,
  Send,
  Plus,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

interface DashboardTabProps {
  stats: {
    totalEmployees: number;
    currentlyPresent: number;
    currentlyOnBreak: number;
    currentlyDeparted: number;
    notPunchedToday: number;
    attendanceRate: number;
    lateCountToday: number;
    monthTotalHours: number;
    monthOvertimeHours: number;
    deptStats?: Array<{
      id: number;
      name: string;
      code: string;
      color: string;
      total: number;
      present: number;
      rate: number;
    }>;
    recentPunches?: PunchRecord[];
  };
  onNavigateTab: (tab: any) => void;
  onOpenManualPunch: () => void;
  onOpenDispatchReport: () => void;
}

export function DashboardTab({
  stats,
  onNavigateTab,
  onOpenManualPunch,
  onOpenDispatchReport,
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Tableau de Bord DRH & Présences
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              Direct
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Suivi en temps réel des pointages par empreinte digitale du pouce, calcul automatique des heures et transmission paie.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigateTab("terminal")}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
          >
            <Fingerprint className="w-4 h-4" />
            Scanner Empreinte
          </button>
          <button
            type="button"
            onClick={onOpenDispatchReport}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Envoyer Fichier aux DRH
          </button>
          <button
            type="button"
            onClick={onOpenManualPunch}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            Pointage Manuel
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Présents */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Sur Site</span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats.currentlyPresent}
          </div>
          <p className="text-[11px] text-emerald-400/90 font-medium mt-1">
            {stats.attendanceRate}% de l&apos;effectif
          </p>
        </div>

        {/* Card 2: En Pause Déjeuner */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">En Pause</span>
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <Coffee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats.currentlyOnBreak}
          </div>
          <p className="text-[11px] text-amber-400/90 font-medium mt-1">
            Pause repas en cours
          </p>
        </div>

        {/* Card 3: Retards */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Retards du jour</span>
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats.lateCountToday}
          </div>
          <p className="text-[11px] text-rose-400/90 font-medium mt-1">
            &gt; tolérance horaire
          </p>
        </div>

        {/* Card 4: Non pointés */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Non pointés</span>
            <div className="p-2 rounded-xl bg-slate-800 text-slate-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats.notPunchedToday}
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            En attente de pointage
          </p>
        </div>

        {/* Card 5: Heures Mois */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Heures Mois</span>
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats.monthTotalHours}h
          </div>
          <p className="text-[11px] text-cyan-400 font-medium mt-1">
            Cumul net entreprises
          </p>
        </div>

        {/* Card 6: Heures Sup */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Heures Sup</span>
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            +{stats.monthOvertimeHours}h
          </div>
          <p className="text-[11px] text-purple-400 font-medium mt-1">
            Comptabilisées pour paie
          </p>
        </div>
      </div>

      {/* Grid: Live Feed (7 cols) + Department breakdown (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Attendance Stream */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h3 className="font-bold text-sm text-white">
                Flux des Pointages Biométriques en Direct
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("punches")}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
            >
              <span>Voir tout l&apos;historique</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {stats.recentPunches && stats.recentPunches.length > 0 ? (
              stats.recentPunches.map((punch) => {
                const punchDate = new Date(punch.punchTime);
                const timeString = punchDate.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });

                return (
                  <div
                    key={punch.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={
                          punch.employee?.avatarUrl ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            (punch.employee?.firstName || "E") + " " + (punch.employee?.lastName || "")
                          )}`
                        }
                        alt="Avatar"
                        className="w-9 h-9 rounded-full object-cover border border-slate-700 flex-shrink-0"
                      />
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-xs text-white">
                            {punch.employee?.firstName} {punch.employee?.lastName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {punch.employee?.department?.code || "GEN"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Fingerprint className="w-3 h-3 text-cyan-400" />
                          <span>{punch.fingerMatched || "Pouce Droit"}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-emerald-400 font-mono">
                            {punch.biometricConfidence || 98}% match
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3 flex-shrink-0">
                      <div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            punch.type === "IN"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : punch.type === "OUT"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : punch.type === "BREAK_START"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          }`}
                        >
                          {punch.type === "IN"
                            ? "Arrivée"
                            : punch.type === "OUT"
                            ? "Départ"
                            : punch.type === "BREAK_START"
                            ? "Pause"
                            : "Reprise"}
                        </span>
                        <div className="text-[11px] font-mono text-slate-300 mt-0.5">
                          {timeString}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">
                Aucun pointage enregistré pour le moment aujourd&apos;hui.
              </div>
            )}
          </div>
        </div>

        {/* Right: Department breakdown & Quick Actions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Department Breakdown */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white">
                Taux de Présence par Pôle
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab("departments")}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Gérer pôles
              </button>
            </div>

            <div className="space-y-3">
              {stats.deptStats && stats.deptStats.length > 0 ? (
                stats.deptStats.map((dept) => (
                  <div key={dept.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">
                        {dept.name}
                      </span>
                      <span className="font-mono text-slate-400">
                        {dept.present} / {dept.total} ({dept.rate}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${dept.rate}%`,
                          backgroundColor: dept.color || "#06b6d4",
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">Chargement...</div>
              )}
            </div>
          </div>

          {/* Quick Help / Biometric Verification Info */}
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
              <h4 className="font-bold text-xs uppercase tracking-wider">
                Protocole Biométrique Certifié
              </h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Le pointage par empreinte digitale du pouce calcule les minuties et crée un gabarit cryptographique à sens unique. Les fichiers d&apos;heures sont certifiés pour la comptabilité et l&apos;inspection du travail.
            </p>
            <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Résolution capteur : 500 DPI</span>
              <span>Rejet faux : &lt; 0.01%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
