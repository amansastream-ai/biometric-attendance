"use client";

import React, { useState, useEffect, useRef } from "react";
import { Employee, PunchRecord } from "@/types";
import { biometricSound } from "@/utils/audio";
import {
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  UserCheck,
  ShieldCheck,
  Coffee,
  LogOut,
  LogIn,
  RotateCcw,
  Search,
} from "lucide-react";

interface BiometricTerminalProps {
  employees: Employee[];
  onPunchSuccess?: (punch: PunchRecord, emp: Employee) => void;
  standalone?: boolean;
}

export function BiometricTerminal({
  employees,
  onPunchSuccess,
  standalone = false,
}: BiometricTerminalProps) {
  // Terminal state
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [punchType, setPunchType] = useState<"IN" | "BREAK_START" | "BREAK_END" | "OUT">("IN");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanPhaseText, setScanPhaseText] = useState<string>("En attente de pose du doigt...");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(standalone);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("Borne Entrée Bâtiment A");

  // Punch result modal / card
  const [lastPunchResult, setLastPunchResult] = useState<{
    punch: PunchRecord;
    employee: Employee;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setCurrentDate(
        now.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-select first employee if none selected
  useEffect(() => {
    if (employees.length > 0 && selectedEmpId === null) {
      setSelectedEmpId(employees[0].id);
    }
  }, [employees, selectedEmpId]);

  // Adjust suggested punch type based on selected employee's current status
  const currentSelectedEmp = employees.find((e) => e.id === selectedEmpId);
  useEffect(() => {
    if (currentSelectedEmp) {
      if (currentSelectedEmp.currentStatus === "ABSENT" || !currentSelectedEmp.currentStatus) {
        setPunchType("IN");
      } else if (currentSelectedEmp.currentStatus === "PRESENT") {
        setPunchType("BREAK_START");
      } else if (currentSelectedEmp.currentStatus === "ON_BREAK") {
        setPunchType("BREAK_END");
      } else if (currentSelectedEmp.currentStatus === "DEPARTED") {
        setPunchType("IN");
      }
    }
  }, [selectedEmpId, currentSelectedEmp?.currentStatus]);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      terminalRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Perform Biometric Scan Simulation
  const handleTriggerScan = async (forcedEmpId?: number) => {
    const empIdToUse = forcedEmpId || selectedEmpId;
    const targetEmp = employees.find((e) => e.id === empIdToUse);

    if (!targetEmp) {
      setErrorMessage("Veuillez sélectionner un employé.");
      return;
    }

    setErrorMessage(null);
    setIsScanning(true);
    setScanProgress(0);
    setScanPhaseText("Détection de pression sur le prisme...");

    if (audioEnabled) {
      biometricSound.playScanLaser();
    }

    // Step 1: Laser acquisition
    setTimeout(() => {
      setScanProgress(30);
      setScanPhaseText("Capture optique du gabarit 500 DPI...");
      if (audioEnabled) biometricSound.playScanLaser();
    }, 400);

    // Step 2: Minutiae analysis
    setTimeout(() => {
      setScanProgress(68);
      setScanPhaseText(
        `Extraction des minuties... Correspondance avec le ${targetEmp.fingerprintFinger || "Pouce Droit"}`
      );
    }, 850);

    // Step 3: Server validation
    setTimeout(async () => {
      setScanProgress(98);
      setScanPhaseText("Vérification signature biométrique...");

      try {
        const res = await fetch("/api/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: targetEmp.id,
            type: punchType,
            punchMethod: "FINGERPRINT",
            fingerMatched: targetEmp.fingerprintFinger || "Pouce Droit",
            biometricConfidence: Math.floor(Math.random() * 4) + 96,
            kioskLocation: locationName,
          }),
        });

        const data = await res.json();

        if (data.success && data.punch) {
          setScanProgress(100);
          setScanPhaseText("Empreinte biométrique validée !");
          if (audioEnabled) biometricSound.playSuccessChime();

          const resultPayload = {
            punch: data.punch,
            employee: targetEmp,
          };
          setLastPunchResult(resultPayload);
          if (onPunchSuccess) {
            onPunchSuccess(data.punch, targetEmp);
          }

          // Auto-hide success overlay after 5 seconds
          setTimeout(() => {
            setIsScanning(false);
            setScanProgress(0);
            setScanPhaseText("En attente de pose du doigt...");
          }, 4500);
        } else {
          throw new Error(data.error || "Erreur de validation");
        }
      } catch (err) {
        setIsScanning(false);
        setScanProgress(0);
        setErrorMessage((err as Error).message);
        if (audioEnabled) biometricSound.playErrorBuzz();
      }
    }, 1300);
  };

  // Optional WebAuthn trigger (Hardware Touch ID/Windows Hello/Android biometrics)
  const handleWebAuthnBiometrics = async () => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      alert("Votre navigateur ne supporte pas l'API WebAuthn biométrique native. Le capteur tactile visuel ci-dessous est actif.");
      return;
    }
    // Fall back smoothly to optical scanner scan
    handleTriggerScan();
  };

  const filteredEmployees = employees.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      e.jobTitle.toLowerCase().includes(q)
    );
  });

  return (
    <div
      ref={terminalRef}
      className={`relative w-full rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white shadow-2xl border border-slate-800 overflow-hidden ${
        isFullscreen ? "p-8 md:p-12 min-h-[90vh]" : "p-6 md:p-8"
      }`}
    >
      {/* Background cyber grid & glow effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20 text-white">
            <Fingerprint className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-100">
                Terminal Biométrique
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Capteur Actif 500 DPI
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{locationName}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-500">Reconnaissance de l&apos;empreinte du pouce</span>
            </p>
          </div>
        </div>

        {/* Live Clock & Actions */}
        <div className="flex items-center gap-3 self-end md:self-center">
          {/* Live digital time */}
          <div className="text-right px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner">
            <div className="text-2xl font-mono font-bold tracking-wider text-cyan-400">
              {currentTime || "--:--:--"}
            </div>
            <div className="text-[11px] font-medium text-slate-400 capitalize">
              {currentDate}
            </div>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60"
            title={audioEnabled ? "Désactiver le son" : "Activer le son"}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60"
            title={isFullscreen ? "Quitter le plein écran" : "Mode Borne Plein Écran"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* Left Column: Employee Selection & Status Info (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                Salarié à pointer
              </label>
              <span className="text-xs text-slate-500">
                {employees.length} collaborateurs enregistrés
              </span>
            </div>

            {/* Employee search bar */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, matricule..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/70 transition"
              />
            </div>

            {/* Employee Cards List */}
            <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1 select-none custom-scrollbar">
              {filteredEmployees.map((emp) => {
                const isSelected = emp.id === selectedEmpId;
                const statusColor =
                  emp.currentStatus === "PRESENT"
                    ? "bg-emerald-500"
                    : emp.currentStatus === "ON_BREAK"
                    ? "bg-amber-500"
                    : emp.currentStatus === "DEPARTED"
                    ? "bg-slate-500"
                    : "bg-rose-500/70";

                const statusLabel =
                  emp.currentStatus === "PRESENT"
                    ? "Sur site"
                    : emp.currentStatus === "ON_BREAK"
                    ? "En pause"
                    : emp.currentStatus === "DEPARTED"
                    ? "Parti(e)"
                    : "Non pointé";

                return (
                  <div
                    key={emp.id}
                    onClick={() => {
                      setSelectedEmpId(emp.id);
                      setErrorMessage(null);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition border ${
                      isSelected
                        ? "bg-slate-800/90 border-cyan-500/70 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50"
                        : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <img
                          src={
                            emp.avatarUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              emp.firstName + " " + emp.lastName
                            )}&background=0284c7&color=fff`
                          }
                          alt={emp.firstName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-700"
                        />
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${statusColor}`}
                          title={statusLabel}
                        />
                      </div>

                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-100 truncate">
                            {emp.firstName} {emp.lastName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {emp.employeeCode}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          {emp.jobTitle} • {emp.department?.name || "Général"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          emp.currentStatus === "PRESENT"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : emp.currentStatus === "ON_BREAK"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {statusLabel}
                      </span>
                      <div className="text-[10px] text-cyan-400 font-mono mt-1 flex items-center justify-end gap-1">
                        <Fingerprint className="w-2.5 h-2.5" />
                        <span>{emp.fingerprintFinger || "Pouce"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredEmployees.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Aucun employé ne correspond à la recherche.
                </div>
              )}
            </div>
          </div>

          {/* Current Punch Type Selector */}
          <div className="pt-2">
            <label className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2 block">
              Type de pointage à enregistrer
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPunchType("IN")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition border ${
                  punchType === "IN"
                    ? "bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700"
                }`}
              >
                <LogIn className="w-4 h-4 text-emerald-300" />
                <span>Arrivée (Matin)</span>
              </button>

              <button
                type="button"
                onClick={() => setPunchType("BREAK_START")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition border ${
                  punchType === "BREAK_START"
                    ? "bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30 ring-1 ring-amber-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700"
                }`}
              >
                <Coffee className="w-4 h-4 text-amber-300" />
                <span>Début Pause</span>
              </button>

              <button
                type="button"
                onClick={() => setPunchType("BREAK_END")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition border ${
                  punchType === "BREAK_END"
                    ? "bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-600/30 ring-1 ring-cyan-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700"
                }`}
              >
                <RotateCcw className="w-4 h-4 text-cyan-300" />
                <span>Reprise / Fin Pause</span>
              </button>

              <button
                type="button"
                onClick={() => setPunchType("OUT")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition border ${
                  punchType === "OUT"
                    ? "bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-1 ring-rose-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700"
                }`}
              >
                <LogOut className="w-4 h-4 text-rose-300" />
                <span>Départ (Soir)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Biometric Scanner (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-900/50 rounded-2xl border border-slate-800/80 p-6 relative overflow-hidden min-h-[460px]">
          {/* Hologram Scanner Area */}
          <div className="relative flex flex-col items-center w-full max-w-sm">
            {/* Active Finger Guide Header */}
            <div className="text-center mb-6">
              <span className="text-xs uppercase tracking-widest font-mono text-cyan-400/90 font-semibold flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Scanner Optique Biométrique
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-1">
                {currentSelectedEmp
                  ? `Placez le ${currentSelectedEmp.fingerprintFinger || "pouce"} sur le lecteur`
                  : "Sélectionnez un employé pour poser le pouce"}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Capteur à reconnaissance d&apos;empreintes par diffraction optique
              </p>
            </div>

            {/* The Tactile Biometric Pad */}
            <div className="relative group">
              {/* Outer glowing pulsing circles */}
              <div
                className={`absolute -inset-4 rounded-full blur-xl transition duration-500 ${
                  isScanning
                    ? "bg-gradient-to-r from-cyan-500/50 via-emerald-500/50 to-cyan-500/50 animate-pulse"
                    : "bg-cyan-500/20 group-hover:bg-cyan-500/30"
                }`}
              />

              {/* Pad Container */}
              <button
                type="button"
                disabled={isScanning || !currentSelectedEmp}
                onClick={() => handleTriggerScan()}
                className={`relative w-48 h-56 rounded-3xl flex flex-col items-center justify-center border-2 transition-all duration-300 cursor-pointer shadow-2xl overflow-hidden ${
                  isScanning
                    ? "bg-slate-950 border-cyan-400 shadow-cyan-500/40"
                    : "bg-slate-950/90 border-slate-700 hover:border-cyan-400/80 shadow-inner group-hover:scale-[1.02]"
                }`}
              >
                {/* Fingerprint Prisme Texture */}
                <div className="absolute inset-0 bg-[radial-gradient(#06b6d418_1px,transparent_1px)] bg-[size:10px_10px]" />

                {/* Animated Laser Scanning Line */}
                {isScanning && (
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan-bounce pointer-events-none z-20" />
                )}

                {/* Fingerprint Vector Graphic */}
                <div className="relative z-10 flex flex-col items-center">
                  <Fingerprint
                    className={`w-28 h-28 transition-all duration-500 ${
                      isScanning
                        ? "text-cyan-400 drop-shadow-[0_0_20px_rgba(6,182,212,0.8)] scale-105"
                        : "text-slate-500 group-hover:text-cyan-400/80"
                    }`}
                  />
                  <span
                    className={`text-[11px] font-mono tracking-wider font-semibold mt-3 px-2 py-0.5 rounded-full transition ${
                      isScanning
                        ? "text-cyan-300 bg-cyan-950/80 border border-cyan-500/40"
                        : "text-slate-400 bg-slate-900 border border-slate-800"
                    }`}
                  >
                    {isScanning ? `${scanProgress}% ANALYSE` : "POSER LE POUCE ICI"}
                  </span>
                </div>

                {/* Minutiae matching dots when scanning */}
                {isScanning && (
                  <>
                    <span className="absolute top-12 left-12 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-ping" />
                    <span className="absolute bottom-16 right-12 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-ping delay-200" />
                    <span className="absolute top-24 right-14 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-ping delay-500" />
                  </>
                )}
              </button>
            </div>

            {/* Scan Progress Bar & Live Text */}
            <div className="w-full mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">
                  {scanPhaseText}
                </span>
                {isScanning && (
                  <span className="font-mono text-cyan-400 font-semibold">
                    {scanProgress}%
                  </span>
                )}
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>

            {/* Manual Click or WebAuthn Touch Button */}
            <div className="flex items-center gap-3 w-full mt-5">
              <button
                type="button"
                disabled={isScanning || !currentSelectedEmp}
                onClick={() => handleTriggerScan()}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4" />
                Valider l&apos;Empreinte
              </button>

              <button
                type="button"
                disabled={isScanning}
                onClick={handleWebAuthnBiometrics}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 transition flex items-center gap-1.5"
                title="Scanner avec Touch ID ou capteur biométrique matériel"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Touch ID</span>
              </button>
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* SUCCESS MODAL POPUP OVERLAY */}
          {lastPunchResult && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30 animate-in fade-in zoom-in-95 duration-300 text-center">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.5)]">
                  <CheckCircle2 className="w-10 h-10 animate-bounce" />
                </div>
                <img
                  src={
                    lastPunchResult.employee.avatarUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      lastPunchResult.employee.firstName + " " + lastPunchResult.employee.lastName
                    )}`
                  }
                  alt={lastPunchResult.employee.firstName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-slate-900 absolute -bottom-1 -right-1 shadow-md"
                />
              </div>

              <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold">
                Pointage Biométrique Enregistré
              </span>

              <h4 className="text-2xl font-bold text-white mt-1">
                {lastPunchResult.employee.firstName} {lastPunchResult.employee.lastName}
              </h4>
              <p className="text-sm text-slate-400">
                {lastPunchResult.employee.jobTitle} • {lastPunchResult.employee.department?.name || "Entreprise"}
              </p>

              {/* Punch Badge Details */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    lastPunchResult.punch.type === "IN"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : lastPunchResult.punch.type === "OUT"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {lastPunchResult.punch.type === "IN"
                    ? "Arrivée Confirmée"
                    : lastPunchResult.punch.type === "OUT"
                    ? "Départ Confirmé"
                    : lastPunchResult.punch.type === "BREAK_START"
                    ? "Début Pause Confirmé"
                    : "Reprise Confirmée"}
                </span>

                <span className="px-3 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  {new Date(lastPunchResult.punch.punchTime).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>

                {lastPunchResult.punch.status === "LATE" && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Retard Notifié
                  </span>
                )}
                {lastPunchResult.punch.status === "OVERTIME" && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    Heures Sup Compta
                  </span>
                )}
              </div>

              {/* Biometric verification details */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 mt-4 max-w-xs w-full text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Doigt reconnu :</span>
                  <span className="text-slate-200 font-medium">
                    {lastPunchResult.employee.fingerprintFinger || "Pouce Droit"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Indice de confiance :</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {lastPunchResult.punch.biometricConfidence || 99}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Borne :</span>
                  <span className="text-slate-300 truncate max-w-[150px]">
                    {lastPunchResult.punch.kioskLocation}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLastPunchResult(null)}
                className="mt-5 px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold tracking-wide transition border border-slate-700"
              >
                Employé suivant
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
