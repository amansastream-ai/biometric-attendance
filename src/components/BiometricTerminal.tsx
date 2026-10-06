"use client";

import React, { useState, useEffect, useRef } from "react";
import { Employee, PunchRecord } from "@/types";
import { biometricSound } from "@/utils/audio";
import {
  detectBiometricSupport,
  describeWebAuthnError,
  punchWithFingerprint,
  punchWithPin,
  type BiometricSupport,
} from "@/lib/biometric-client";
import {
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  ShieldCheck,
  Coffee,
  LogOut,
  LogIn,
  RotateCcw,
  Search,
  KeyRound,
  UserSearch,
  Target,
  X,
  ExternalLink,
} from "lucide-react";

interface BiometricTerminalProps {
  employees: Employee[];
  onPunchSuccess?: (punch: PunchRecord, emp: Employee) => void;
  onOpenEnrollment?: (emp: Employee) => void;
  standalone?: boolean;
}

type PunchMode = "AUTO" | "BREAK_START" | "BREAK_END";

type LastPunchResult = {
  punch: PunchRecord;
  employee: Employee;
  verification?: {
    finger: string;
    credentialIdPreview: string;
    deviceType: string;
    backedUp: boolean;
    counter: number;
  };
  viaPin?: boolean;
};

export function BiometricTerminal({
  employees,
  onPunchSuccess,
  onOpenEnrollment,
  standalone = false,
}: BiometricTerminalProps) {
  // Terminal state
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [punchMode, setPunchMode] = useState<PunchMode>("AUTO");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanPhaseText, setScanPhaseText] = useState<string>("En attente de la pose du doigt...");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(standalone);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [locationName] = useState<string>("Borne Entrée Bâtiment A");
  const [support, setSupport] = useState<BiometricSupport | null>(null);

  // PIN fallback
  const [isPinPanelOpen, setIsPinPanelOpen] = useState<boolean>(false);
  const [pinEmployeeCode, setPinEmployeeCode] = useState<string>("");
  const [pinValue, setPinValue] = useState<string>("");

  // Punch result modal / card
  const [lastPunchResult, setLastPunchResult] = useState<LastPunchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const enrolledEmployees = employees.filter((emp) => emp.fingerprintEnrolled);
  const currentSelectedEmp = employees.find((emp) => emp.id === selectedEmpId) || null;

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
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

  // Détection du capteur biométrique du poste
  useEffect(() => {
    detectBiometricSupport().then(setSupport);
  }, []);

  const resetScanner = () => {
    setIsScanning(false);
    setScanProgress(0);
    setScanPhaseText("En attente de la pose du doigt...");
  };

  /**
   * Reconnaissance d'empreinte :
   * 1. le capteur du poste lit le doigt (le navigateur ne voit jamais le gabarit) ;
   * 2. le capteur signe une assertion ;
   * 3. le serveur vérifie la signature avec la clé publique de l'enrôlement et
   *    retrouve lui-même le salarié — le navigateur ne peut pas choisir qui pointe.
   */
  const handleTriggerScan = async () => {
    setErrorMessage(null);

    if (support && !support.platformAuthenticator) {
      setErrorMessage(
        "Aucun capteur d'empreinte disponible sur ce poste. Utilisez le repli code + PIN ou enrôlez une empreinte dans le système (Touch ID / Windows Hello / lecteur FIDO2)."
      );
      biometricSound.playErrorBuzz();
      return;
    }

    if (enrolledEmployees.length === 0) {
      setErrorMessage(
        "Aucune empreinte n'est encore enrôlée sur cette borne. Enrôlez d'abord les salariés depuis l'onglet Salariés, sur ce poste."
      );
      biometricSound.playErrorBuzz();
      return;
    }

    setIsScanning(true);
    setScanProgress(10);
    setScanPhaseText("Initialisation du lecteur d'empreinte...");
    if (audioEnabled) biometricSound.playScanLaser();

    try {
      const result = await punchWithFingerprint({
        employeeId: selectedEmpId,
        requestedType: punchMode === "AUTO" ? null : punchMode,
        kioskLocation: locationName,
        onPhase: (phase) => {
          if (phase === "CAPTURE") {
            setScanProgress(45);
            setScanPhaseText(
              selectedEmpId
                ? `Contrôle nominatif : posez le doigt de ${currentSelectedEmp?.firstName ?? "le salarié"}...`
                : "Posez le doigt sur le capteur : identification en cours..."
            );
            if (audioEnabled) biometricSound.playScanLaser();
          } else {
            setScanProgress(85);
            setScanPhaseText("Vérification de la signature du capteur...");
          }
        },
      });

      setScanProgress(100);
      setScanPhaseText(`Empreinte reconnue : ${result.employee.firstName} ${result.employee.lastName}`);
      if (audioEnabled) biometricSound.playSuccessChime();

      setLastPunchResult({
        punch: result.punch,
        employee: result.employee,
        verification: result.verification,
      });
      onPunchSuccess?.(result.punch, result.employee);

      setTimeout(() => {
        resetScanner();
        setLastPunchResult(null);
        setSelectedEmpId(null);
      }, 6000);
    } catch (err) {
      resetScanner();
      setErrorMessage(describeWebAuthnError(err, support ?? undefined));
      if (audioEnabled) biometricSound.playErrorBuzz();
    } finally {
      setIsScanning(false);
    }
  };

  const handlePinPunch = async () => {
    setErrorMessage(null);
    if (!pinEmployeeCode || !pinValue) {
      setErrorMessage("Saisissez le code salarié et le code PIN.");
      return;
    }
    setIsScanning(true);
    setScanProgress(60);
    setScanPhaseText("Vérification du code et du PIN...");
    try {
      const result = await punchWithPin({
        employeeCode: pinEmployeeCode,
        pin: pinValue,
        requestedType: punchMode === "AUTO" ? null : punchMode,
        kioskLocation: `${locationName} (repli PIN)`,
      });
      if (audioEnabled) biometricSound.playSuccessChime();
      setLastPunchResult({
        punch: result.punch,
        employee: result.employee,
        viaPin: true,
      });
      onPunchSuccess?.(result.punch, result.employee);
      setPinValue("");
      setPinEmployeeCode("");
      setIsPinPanelOpen(false);
      setTimeout(() => {
        resetScanner();
        setLastPunchResult(null);
      }, 6000);
    } catch (err) {
      if (audioEnabled) biometricSound.playErrorBuzz();
      setErrorMessage((err as Error).message);
      resetScanner();
    } finally {
      setIsScanning(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      terminalRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q) ||
      emp.jobTitle.toLowerCase().includes(q)
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
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-100">
                Terminal biométrique
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  support?.platformAuthenticator
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    support?.platformAuthenticator ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                  }`}
                />
                {support === null
                  ? "Détection du capteur..."
                  : support.platformAuthenticator
                  ? "Capteur d'empreinte actif"
                  : "Aucun capteur détecté"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{locationName}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-500">
                {enrolledEmployees.length} empreinte(s) enrôlée(s) sur cette borne
              </span>
            </p>
          </div>
        </div>

        {/* Live Clock & Actions */}
        <div className="flex items-center gap-3 self-end md:self-center">
          <div className="text-right px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner">
            <div className="text-2xl font-mono font-bold tracking-wider text-cyan-400">
              {currentTime || "--:--:--"}
            </div>
            <div className="text-[11px] font-medium text-slate-400 capitalize">{currentDate}</div>
          </div>

          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60"
            title={audioEnabled ? "Désactiver le son" : "Activer le son"}
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

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
        {/* Left Column: contrôle nominatif optionnel + état des salariés */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                Mode de reconnaissance
              </label>
              <span className="text-xs text-slate-500">
                {selectedEmpId
                  ? `Contrôle nominatif : ${currentSelectedEmp?.firstName ?? ""}`
                  : "Identification 1:N par l'empreinte"}
              </span>
            </div>

            {selectedEmpId ? (
              <div className="mb-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-3">
                <div className="text-xs text-cyan-200 flex items-center gap-2">
                  <UserSearch className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>
                    Seule l&apos;empreinte de{" "}
                    <strong>
                      {currentSelectedEmp?.firstName} {currentSelectedEmp?.lastName}
                    </strong>{" "}
                    sera acceptée. Si un autre doigt est posé, le pointage est refusé.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmpId(null)}
                  className="p-1.5 rounded-lg text-cyan-300 hover:bg-cyan-500/20 transition flex-shrink-0"
                  title="Revenir à l'identification automatique"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mb-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  Le salarié pose simplement son doigt : la borne reconnaît elle-même à qui
                  appartient l&apos;empreinte. Aucun nom à sélectionner.
                </span>
              </div>
            )}

            {/* Employee search bar */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un salarié (contrôle nominatif, enrôlement...)"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/70 transition"
              />
            </div>

            {/* Employee Cards List (état du jour) */}
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 select-none custom-scrollbar">
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
                      setSelectedEmpId(isSelected ? null : emp.id);
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
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <Fingerprint
                            className={`w-2.5 h-2.5 ${
                              emp.fingerprintEnrolled ? "text-emerald-400" : "text-amber-400"
                            }`}
                          />
                          <span>
                            {emp.fingerprintEnrolled
                              ? `Empreinte enrôlée (${emp.fingerprintFinger})`
                              : "Aucune empreinte enrôlée"}
                          </span>
                        </div>
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
                      {!emp.fingerprintEnrolled && onOpenEnrollment && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenEnrollment(emp);
                          }}
                          className="block mt-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 underline"
                        >
                          Enrôler
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredEmployees.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Aucun salarié ne correspond à la recherche.
                </div>
              )}
            </div>
          </div>

          {/* Punch type (pour les pauses ; sinon déduit automatiquement) */}
          <div className="pt-2">
            <label className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2 block">
              Événement à enregistrer
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPunchMode("AUTO")}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-[11px] font-semibold transition border ${
                  punchMode === "AUTO"
                    ? "bg-emerald-600 text-white border-emerald-400 ring-1 ring-emerald-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <LogIn className="w-4 h-4 text-emerald-200" />
                <span>Auto arrivée / départ</span>
              </button>
              <button
                type="button"
                onClick={() => setPunchMode("BREAK_START")}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-[11px] font-semibold transition border ${
                  punchMode === "BREAK_START"
                    ? "bg-amber-600 text-white border-amber-400 ring-1 ring-amber-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <Coffee className="w-4 h-4 text-amber-200" />
                <span>Début de pause</span>
              </button>
              <button
                type="button"
                onClick={() => setPunchMode("BREAK_END")}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl text-[11px] font-semibold transition border ${
                  punchMode === "BREAK_END"
                    ? "bg-cyan-600 text-white border-cyan-400 ring-1 ring-cyan-400"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
                }`}
              >
                <RotateCcw className="w-4 h-4 text-cyan-200" />
                <span>Reprise de pause</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Le départ est enregistré après vérification de la séquence de la journée (arrivée →
              pause → reprise → départ). Toute incohérence est refusée par le serveur.
            </p>
          </div>
        </div>

        {/* Right Column: lecteur biométrique */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-900/50 rounded-2xl border border-slate-800/80 p-6 relative overflow-hidden min-h-[460px]">
          <div className="relative flex flex-col items-center w-full max-w-sm">
            <div className="text-center mb-5">
              <span className="text-xs uppercase tracking-widest font-mono text-cyan-400/90 font-semibold flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Lecteur d&apos;empreinte du poste
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-1">
                {selectedEmpId && currentSelectedEmp
                  ? `Contrôle nominatif : posez le doigt de ${currentSelectedEmp.firstName}`
                  : "Posez votre doigt sur le capteur"}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Reconnaissance et signature réalisées par le capteur (WebAuthn / FIDO2)
              </p>
            </div>

            <div className="relative group">
              <div
                className={`absolute -inset-4 rounded-full blur-xl transition duration-500 ${
                  isScanning
                    ? "bg-gradient-to-r from-cyan-500/50 via-emerald-500/50 to-cyan-500/50 animate-pulse"
                    : "bg-cyan-500/20 group-hover:bg-cyan-500/30"
                }`}
              />

              <button
                type="button"
                disabled={isScanning || support?.platformAuthenticator === false}
                onClick={handleTriggerScan}
                className={`relative w-48 h-56 rounded-3xl flex flex-col items-center justify-center border-2 transition-all duration-300 cursor-pointer shadow-2xl overflow-hidden ${
                  isScanning
                    ? "bg-slate-950 border-cyan-400 shadow-cyan-500/40"
                    : "bg-slate-950/90 border-slate-700 hover:border-cyan-400/80 shadow-inner group-hover:scale-[1.02] disabled:opacity-50"
                }`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(#06b6d418_1px,transparent_1px)] bg-[size:10px_10px]" />

                {isScanning && (
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan-bounce pointer-events-none z-20" />
                )}

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
                    {isScanning ? `${scanProgress}% ANALYSE` : "POSER LE DOIGT ICI"}
                  </span>
                </div>
              </button>
            </div>

            {/* Progression */}
            <div className="w-full mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">{scanPhaseText}</span>
                {isScanning && (
                  <span className="font-mono text-cyan-400 font-semibold">{scanProgress}%</span>
                )}
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>

            <div className="w-full mt-5">
              <button
                type="button"
                disabled={isScanning}
                onClick={handleTriggerScan}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4" />
                Scanner l&apos;empreinte
              </button>
            </div>

            {/* Repli code + PIN */}
            <div className="w-full mt-3">
              <button
                type="button"
                onClick={() => setIsPinPanelOpen(!isPinPanelOpen)}
                className="w-full py-2 px-4 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700 transition flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                {isPinPanelOpen ? "Masquer le repli code + PIN" : "Pas de capteur ? Repli code + PIN"}
              </button>

              {isPinPanelOpen && (
                <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <p className="text-[10px] text-amber-300/90">
                    Ce repli n&apos;est pas biométrique : il est enregistré comme tel dans
                    l&apos;historique (traçabilité RGPD).
                  </p>
                  <input
                    type="text"
                    value={pinEmployeeCode}
                    onChange={(e) => setPinEmployeeCode(e.target.value)}
                    placeholder="Code salarié (ex : EMP-001)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    type="password"
                    value={pinValue}
                    onChange={(e) => setPinValue(e.target.value)}
                    placeholder="Code PIN"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                  />
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={handlePinPunch}
                    className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] uppercase tracking-wide transition disabled:opacity-50"
                  >
                    Valider le pointage
                  </button>
                </div>
              )}
            </div>

            {support && !support.platformAuthenticator && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Ce poste ne dispose pas de capteur d&apos;empreinte exploitable par le
                  navigateur{support.inIframe ? " (ou l'application est affichée dans un cadre)" : ""}.
                  Installez une empreinte au niveau du système (Touch ID, Windows Hello, lecteur
                  FIDO2) puis rechargez la page, ou utilisez le repli code + PIN.
                  {support.inIframe && (
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, "_blank")}
                      className="ml-1 underline font-semibold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ouvrir dans un onglet
                    </button>
                  )}
                </span>
              </div>
            )}

            {enrolledEmployees.length === 0 && (
              <div className="mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-[11px] flex items-start gap-2">
                <Fingerprint className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Aucune empreinte n&apos;est enrôlée sur cette borne. Cliquez sur
                  &laquo;&nbsp;Enrôler&nbsp;&raquo; à côté d&apos;un salarié (ou depuis l&apos;onglet
                  Salariés) pour capturer son doigt sur ce poste.
                </span>
              </div>
            )}

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
                {lastPunchResult.viaPin
                  ? "Pointage enregistré (code + PIN)"
                  : "Empreinte reconnue — pointage enregistré"}
              </span>

              <h4 className="text-2xl font-bold text-white mt-1">
                {lastPunchResult.employee.firstName} {lastPunchResult.employee.lastName}
              </h4>
              <p className="text-sm text-slate-400">
                {lastPunchResult.employee.jobTitle} •{" "}
                {lastPunchResult.employee.department?.name || "Entreprise"}
              </p>

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
                    ? "Arrivée confirmée"
                    : lastPunchResult.punch.type === "OUT"
                    ? "Départ confirmé"
                    : lastPunchResult.punch.type === "BREAK_START"
                    ? "Début de pause confirmé"
                    : "Reprise confirmée"}
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
                    Retard notifié
                  </span>
                )}
                {lastPunchResult.punch.status === "OVERTIME" && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    Heures sup comptabilisées
                  </span>
                )}
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 mt-4 max-w-xs w-full text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Doigt vérifié :</span>
                  <span className="text-slate-200 font-medium">
                    {lastPunchResult.verification?.finger ||
                      lastPunchResult.employee.fingerprintFinger ||
                      "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Méthode :</span>
                  <span className="text-emerald-400 font-mono font-bold text-[11px]">
                    {lastPunchResult.viaPin ? "Code + PIN (non biométrique)" : "Capteur WebAuthn"}
                  </span>
                </div>
                {lastPunchResult.verification && (
                  <>
                    <div className="flex justify-between">
                      <span>Credential :</span>
                      <span className="text-slate-300 font-mono">
                        {lastPunchResult.verification.credentialIdPreview}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Compteur anti-rejeu :</span>
                      <span className="text-slate-300 font-mono">
                        {lastPunchResult.verification.counter}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span>Borne :</span>
                  <span className="text-slate-300 truncate max-w-[150px]">
                    {lastPunchResult.punch.kioskLocation}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLastPunchResult(null);
                  resetScanner();
                  setSelectedEmpId(null);
                }}
                className="mt-5 px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold tracking-wide transition border border-slate-700"
              >
                Salarié suivant
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
