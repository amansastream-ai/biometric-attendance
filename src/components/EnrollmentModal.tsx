"use client";

import React, { useState } from "react";
import { Employee } from "@/types";
import { biometricSound } from "@/utils/audio";
import {
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

interface EnrollmentModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: (updatedEmployee: Employee) => void;
}

export function EnrollmentModal({
  employee,
  isOpen,
  onClose,
  onEnrolled,
}: EnrollmentModalProps) {
  const [selectedFinger, setSelectedFinger] = useState<string>(
    employee.fingerprintFinger || "Pouce Droit"
  );
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Choose finger, 2: First Scan, 3: Second Scan, 4: Done
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartFirstScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    biometricSound.playScanLaser();

    setTimeout(() => {
      setScanProgress(45);
      biometricSound.playScanLaser();
    }, 400);

    setTimeout(() => {
      setScanProgress(100);
      setIsScanning(false);
      setStep(3); // Prompt for second confirmation scan
      biometricSound.playSuccessChime();
    }, 1100);
  };

  const handleStartSecondScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    biometricSound.playScanLaser();

    setTimeout(() => {
      setScanProgress(55);
      biometricSound.playScanLaser();
    }, 450);

    setTimeout(async () => {
      setScanProgress(100);
      setIsScanning(false);
      biometricSound.playSuccessChime();

      // Submit enrollment to server
      setLoading(true);
      setError(null);
      try {
        const templateId = `BIO-FP-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)
          .toUpperCase()}`;

        const res = await fetch(`/api/employees/${employee.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fingerprintEnrolled: true,
            fingerprintFinger: selectedFinger,
            fingerprintTemplateId: templateId,
          }),
        });

        const data = await res.json();
        if (data.success && data.employee) {
          setStep(4);
          onEnrolled(data.employee);
        } else {
          throw new Error(data.error || "Échec de l'enrôlement");
        }
      } catch (err) {
        setError((err as Error).message);
        biometricSound.playErrorBuzz();
      } finally {
        setLoading(false);
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Enrôlement Biométrique du Salarié
              </h3>
              <p className="text-xs text-slate-400">
                {employee.firstName} {employee.lastName} ({employee.employeeCode})
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

        {/* Wizard Steps indicator */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/40 text-center py-2.5 text-xs font-medium">
          <div
            className={`flex items-center justify-center gap-1.5 ${
              step >= 1 ? "text-cyan-400" : "text-slate-600"
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">
              1
            </span>
            <span>Choix du doigt</span>
          </div>
          <div
            className={`flex items-center justify-center gap-1.5 ${
              step >= 2 ? "text-cyan-400" : "text-slate-600"
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">
              2
            </span>
            <span>Acquisition</span>
          </div>
          <div
            className={`flex items-center justify-center gap-1.5 ${
              step === 4 ? "text-emerald-400" : "text-slate-600"
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">
              3
            </span>
            <span>Validation</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Sélectionnez le doigt de référence que l&apos;employé utilisera sur la borne de pointage :
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  "Pouce Droit",
                  "Pouce Gauche",
                  "Index Droit",
                  "Index Gauche",
                  "Majeur Droit",
                ].map((finger) => (
                  <button
                    key={finger}
                    type="button"
                    onClick={() => setSelectedFinger(finger)}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left border transition ${
                      selectedFinger === finger
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold shadow-inner"
                        : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <Fingerprint className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm">{finger}</span>
                  </button>
                ))}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20"
                >
                  Continuer vers l&apos;acquisition
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="text-xs uppercase tracking-wider font-mono text-cyan-400 font-semibold">
                Passe 1 / 2 : Capture Initiale
              </div>

              {/* Sensor graphic */}
              <div
                onClick={!isScanning ? handleStartFirstScan : undefined}
                className={`relative w-36 h-44 rounded-2xl flex flex-col items-center justify-center border-2 cursor-pointer transition shadow-xl overflow-hidden ${
                  isScanning
                    ? "bg-slate-950 border-cyan-400"
                    : "bg-slate-950/80 border-slate-700 hover:border-cyan-400"
                }`}
              >
                {isScanning && (
                  <div className="absolute inset-x-0 h-1 bg-cyan-400 shadow-[0_0_15px_#22d3ee] animate-scan-bounce pointer-events-none" />
                )}
                <Fingerprint
                  className={`w-20 h-20 transition-all ${
                    isScanning ? "text-cyan-400 scale-105" : "text-slate-500"
                  }`}
                />
                <span className="text-[10px] font-mono text-slate-400 mt-2 font-semibold">
                  {isScanning ? `${scanProgress}% ACQUISITION` : "CLIQUER / POSER LE DOIGT"}
                </span>
              </div>

              <p className="text-xs text-slate-400 max-w-xs">
                Demandez à {employee.firstName} de poser son <strong>{selectedFinger}</strong> bien à plat sur le capteur.
              </p>

              <button
                type="button"
                disabled={isScanning}
                onClick={handleStartFirstScan}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isScanning ? "Capture en cours..." : "Lancer le scan 1"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="text-xs uppercase tracking-wider font-mono text-emerald-400 font-semibold">
                Passe 2 / 2 : Vérification & Cohérence
              </div>

              {/* Sensor graphic */}
              <div
                onClick={!isScanning && !loading ? handleStartSecondScan : undefined}
                className={`relative w-36 h-44 rounded-2xl flex flex-col items-center justify-center border-2 cursor-pointer transition shadow-xl overflow-hidden ${
                  isScanning
                    ? "bg-slate-950 border-emerald-400"
                    : "bg-slate-950/80 border-slate-700 hover:border-emerald-400"
                }`}
              >
                {isScanning && (
                  <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_15px_#34d399] animate-scan-bounce pointer-events-none" />
                )}
                <Fingerprint
                  className={`w-20 h-20 transition-all ${
                    isScanning ? "text-emerald-400 scale-105" : "text-slate-500"
                  }`}
                />
                <span className="text-[10px] font-mono text-slate-400 mt-2 font-semibold">
                  {isScanning ? `${scanProgress}% VÉRIFICATION` : "REPOSER LE DOIGT"}
                </span>
              </div>

              <p className="text-xs text-slate-400 max-w-xs">
                Retirez puis reposez le même doigt pour valider la netteté des minuties et générer le gabarit chiffré.
              </p>

              <button
                type="button"
                disabled={isScanning || loading}
                onClick={handleStartSecondScan}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {isScanning ? "Validation..." : "Vérifier & Sauvegarder"}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h4 className="text-lg font-bold text-white">
                Enrôlement réussi avec succès !
              </h4>

              <p className="text-xs text-slate-400 max-w-xs">
                Le gabarit biométrique de {employee.firstName} ({selectedFinger}) a été chiffré et stocké dans le système. L&apos;employé peut désormais badger avec son pouce.
              </p>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-cyan-400 w-full max-w-xs text-center">
                ID Gabarit: BIO-{employee.employeeCode}-ENROLLED
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition border border-slate-700"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
