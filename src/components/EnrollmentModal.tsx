"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Employee } from "@/types";
import { biometricSound } from "@/utils/audio";
import {
  enrollFingerprint,
  detectBiometricSupport,
  describeWebAuthnError,
  type BiometricSupport,
} from "@/lib/biometric-client";
import {
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Info,
  ExternalLink,
} from "lucide-react";

interface EnrollmentModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: (updatedEmployee: Employee) => void;
}

type StoredCredential = {
  id: number;
  finger: string;
  label?: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
  credentialIdPreview: string;
};

const FINGERS = ["Pouce Droit", "Pouce Gauche", "Index Droit", "Index Gauche", "Majeur Droit"];

export function EnrollmentModal({
  employee,
  isOpen,
  onClose,
  onEnrolled,
}: EnrollmentModalProps) {
  const [selectedFinger, setSelectedFinger] = useState<string>(
    employee.fingerprintFinger || "Pouce Droit"
  );
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: choix du doigt, 2: capture réelle, 3: terminé
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [phaseText, setPhaseText] = useState<string>("En attente du capteur...");
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState<boolean>(true);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const fetchCredentials = useCallback(async (): Promise<StoredCredential[]> => {
    const res = await fetch(`/api/biometrics/credentials?employeeId=${employee.id}`);
    const data = await res.json();
    return data.success ? ((data.credentials || []) as StoredCredential[]) : [];
  }, [employee.id]);

  // Le composant est démonté à la fermeture (voir page.tsx) : l'état repart de zéro.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    detectBiometricSupport().then((result) => {
      if (!cancelled) setSupport(result);
    });

    fetchCredentials()
      .then((list) => {
        if (!cancelled) setCredentials(list);
      })
      .catch(() => {
        /* silencieux : l'écran reste utilisable */
      })
      .finally(() => {
        if (!cancelled) setLoadingCredentials(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, fetchCredentials]);

  if (!isOpen) return null;

  const handleEnroll = async () => {
    setError(null);
    setResultMessage(null);
    setIsScanning(true);
    setScanProgress(8);
    setPhaseText("Demande au capteur d'empreinte du poste...");
    biometricSound.playScanLaser();

    try {
      const result = await enrollFingerprint({
        employeeId: employee.id,
        finger: selectedFinger,
        label: maskLabel(),
        onPhase: (phase) => {
          if (phase === "CAPTURE") {
            setScanProgress(45);
            setPhaseText(
              `Posez le doigt sur le capteur (${selectedFinger}). La reconnaissance est faite par le capteur du poste.`
            );
            biometricSound.playScanLaser();
          } else {
            setScanProgress(88);
            setPhaseText("Vérification de la signature du capteur côté serveur...");
          }
        },
      });

      setScanProgress(100);
      setPhaseText("Empreinte enrôlée et vérifiée.");
      biometricSound.playSuccessChime();
      setResultMessage(result.message);
      setStep(3);
      onEnrolled(result.employee);
      fetchCredentials().then(setCredentials).catch(() => {});
    } catch (err) {
      biometricSound.playErrorBuzz();
      setError(describeWebAuthnError(err, support ?? undefined));
      setScanProgress(0);
      setPhaseText("En attente du capteur...");
    } finally {
      setIsScanning(false);
    }
  };

  const maskLabel = () => {
    if (typeof window === "undefined") return null;
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return "Appareil iOS";
    if (/Android/.test(ua)) return "Capteur Android";
    if (/Macintosh/.test(ua)) return "Mac (Touch ID)";
    if (/Windows/.test(ua)) return "PC Windows Hello";
    if (/Linux/.test(ua)) return "Poste Linux";
    return "Poste de travail";
  };

  const handleRevoke = async (credentialId: number) => {
    if (!confirm("Révoquer cette empreinte ? Le capteur ne pourra plus badger avec, le salarié devra réenrôler.")) {
      return;
    }
    try {
      const res = await fetch(`/api/biometrics/credentials?id=${credentialId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCredentials(await fetchCredentials());
      const refreshed = await fetch(`/api/employees/${employee.id}`).then((r) => r.json());
      if (refreshed.success) onEnrolled(refreshed.employee);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-white overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Enrôlement biométrique du salarié
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
            <span>Capteur</span>
          </div>
          <div
            className={`flex items-center justify-center gap-1.5 ${
              step === 3 ? "text-emerald-400" : "text-slate-600"
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
          {/* État du capteur du poste */}
          {support && (
            <div
              className={`mb-4 p-3 rounded-xl border text-xs flex items-start gap-2 ${
                support.secureContext && support.platformAuthenticator
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/25 text-amber-300"
              }`}
            >
              {support.secureContext && support.platformAuthenticator ? (
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">
                  {!support.secureContext
                    ? "Contexte non sécurisé : le navigateur bloquera le capteur"
                    : support.platformAuthenticator
                    ? "Capteur biométrique détecté sur ce poste"
                    : "Aucun capteur d'empreinte compatible détecté sur ce poste"}
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {!support.secureContext
                    ? "L'enrôlement doit être fait en HTTPS ou via http://localhost:3000. Une adresse du type http://192.168.x.x:3000 est refusée par les navigateurs pour raisons de sécurité."
                    : support.platformAuthenticator
                    ? "L'empreinte est lue par le capteur du poste (Touch ID, Windows Hello, lecteur FIDO2...). Le gabarit reste dans le capteur : seul le résultat signé est transmis au serveur."
                    : "Installez/enrôlez d'abord une empreinte dans le système du poste (Touch ID, Windows Hello ou lecteur FIDO2), ou utilisez le repli code + PIN pour le pointage."}
                </p>
                {support.inIframe && (
                  <p className="text-[11px] font-semibold flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Application détectée dans un cadre : ouvrez BioPointage dans un onglet dédié pour que le navigateur autorise le capteur.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Sélectionnez le doigt que {employee.firstName} utilisera sur la borne de
                pointage :
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {FINGERS.map((finger) => (
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

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>
                  L&apos;enrôlement doit être effectué <strong>sur le poste équipé du capteur</strong> :
                  la reconnaissance d&apos;empreinte est liée au lecteur sur lequel le doigt est
                  enregistré. Sur une borne partagée, enrôlez chaque salarié sur la borne elle-même.
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20"
                >
                  Continuer vers la capture
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="text-xs uppercase tracking-wider font-mono text-cyan-400 font-semibold">
                Capture réelle par le capteur du poste — {selectedFinger}
              </div>

              <div
                onClick={!isScanning ? handleEnroll : undefined}
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
                  {isScanning ? `${scanProgress}%` : "CLIQUER POUR DÉMARRER"}
                </span>
              </div>

              <div className="w-full max-w-xs space-y-2">
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{phaseText}</p>
              </div>

              <button
                type="button"
                disabled={isScanning}
                onClick={handleEnroll}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isScanning && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {isScanning ? "Capture en cours..." : `Enrôler ${selectedFinger}`}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline"
              >
                Changer de doigt
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h4 className="text-lg font-bold text-white">Empreinte enrôlée !</h4>

              <p className="text-xs text-slate-400 max-w-xs">
                {resultMessage ||
                  `Le capteur a validé l'empreinte (${selectedFinger}) de ${employee.firstName}.`}{" "}
                Elle est désormais la seule empreinte capable de badger pour ce salarié.
              </p>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2 text-left">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>
                  Le gabarit de l&apos;empreinte n&apos;a jamais quitté le capteur : le serveur ne
                  stocke qu&apos;une clé publique, qui sert à vérifier les pointages.
                </span>
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

          {/* Empreintes existantes */}
          {credentials.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Empreintes actives ({credentials.length})
                </span>
                {loadingCredentials && <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />}
              </div>
              <div className="space-y-1.5">
                {credentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium flex items-center gap-1.5">
                        <Fingerprint className="w-3 h-3 text-cyan-400" />
                        {credential.finger}
                        {credential.backedUp && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                            sauvegardé
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 font-mono">
                        {credential.credentialIdPreview} • {credential.label || credential.deviceType}
                        {credential.lastUsedAt
                          ? ` • dernier pointage : ${new Date(credential.lastUsedAt).toLocaleDateString("fr-FR")}`
                          : " • jamais utilisé"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(credential.id)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 transition"
                      title="Révoquer cette empreinte (RGPD)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
