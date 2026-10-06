"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  enrollTwoFactorKey,
  fetchTwoFactorStatus,
  revokeTwoFactorKey,
  twoFactorSupported,
  type TwoFactorStatus,
} from "@/lib/two-factor-client";
import {
  KeyRound,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plus,
  X,
  LogOut,
  Cpu,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

interface TwoFactorSetupProps {
  isOpen: boolean;
  /** `forced` : session restreinte, la fenêtre ne peut pas être fermée. */
  mode: "forced" | "manage";
  onClose: () => void;
  onStatusChanged?: (status: TwoFactorStatus) => void;
  onNotify: (message: string, isError?: boolean) => void;
  onLogout: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function TwoFactorSetup({
  isOpen,
  mode,
  onClose,
  onStatusChanged,
  onNotify,
  onLogout,
}: TwoFactorSetupProps) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => twoFactorSupported());

  const load = useCallback(async () => {
    try {
      const next = await fetchTwoFactorStatus();
      setStatus(next);
      onStatusChanged?.(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [onStatusChanged]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen) return () => {
      cancelled = true;
    };
    fetchTwoFactorStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const forced = mode === "forced";

  const handleEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enrollTwoFactorKey(label);
      setLabel("");
      await load();
      onNotify(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (credentialId: number, credentialLabel: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const result = await revokeTwoFactorKey(credentialId);
      await load();
      onNotify(`${result.message} (${credentialLabel ?? "clé sans nom"})`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl ${
                forced
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-cyan-500/15 text-cyan-300"
              }`}
            >
              {forced ? <ShieldAlert className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {forced ? "Second facteur à configurer" : "Sécurité du compte"}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Clé de sécurité (Touch ID, Windows Hello, clé USB FIDO2) demandée à chaque
                connexion.
              </p>
            </div>
          </div>
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {forced && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Votre rôle donne accès aux données RH : tant qu&apos;aucune clé n&apos;est
                enregistrée, la session reste limitée à cet écran. Enregistrez une clé pour
                continuer, ou déconnectez-vous.
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!supported && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <Cpu className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-500" />
              <span>
                Ce navigateur ne peut pas utiliser de clé de sécurité (contexte non sécurisé ou
                WebAuthn indisponible). Ouvrez l&apos;application en HTTPS ou sur{" "}
                <code className="px-1 rounded bg-slate-900">http://localhost:3000</code> dans un
                onglet.
              </span>
            </div>
          )}

          {/* Clés enregistrées */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Clés enregistrées {status ? `(${status.credentials.length})` : ""}
            </div>

            {status?.credentials.length ? (
              <ul className="space-y-2">
                {status.credentials.map((credential) => (
                  <li
                    key={credential.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800"
                  >
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          {credential.label || "Clé de sécurité"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {credential.deviceType === "multiDevice"
                            ? "Clé synchronisée"
                            : "Clé liée à cet appareil"}{" "}
                          • ajoutée le {formatDate(credential.createdAt)} • dernière utilisation :{" "}
                          {formatDate(credential.lastUsedAt)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRevoke(credential.id, credential.label)}
                      className="p-2 rounded-lg bg-slate-800/70 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 transition disabled:opacity-50"
                      title="Révoquer cette clé"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                {status?.required
                  ? "Aucune clé : votre rôle exige un second facteur."
                  : "Aucune clé : la connexion se fait uniquement au mot de passe."}
              </div>
            )}
          </div>

          {/* Ajout d'une clé */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Ajouter une clé
            </div>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Nom de la clé (ex. « MacBook de Nadia », « YubiKey bureau »)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 transition"
            />
            <button
              type="button"
              onClick={handleEnroll}
              disabled={busy || !supported}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {busy ? "En attente du capteur..." : "Enregistrer une clé de sécurité"}
            </button>
            <p className="text-[10px] text-slate-500 flex items-start gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
              Le capteur ne transmet qu&apos;une clé publique : ni empreinte, ni code, ni secret ne
              quitte votre appareil. La clé est liée à ce domaine.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-800">
          {status?.policy === "enforce" ? (
            <span className="text-[10px] text-slate-500">
              Politique serveur : second facteur <strong className="text-slate-300">obligatoire</strong> pour les
              rôles sensibles.
            </span>
          ) : (
            <span className="text-[10px] text-slate-500">
              Politique serveur : second facteur <strong className="text-slate-300">recommandé</strong> (à
              basculer en obligatoire en production).
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/40 hover:text-rose-300 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Se déconnecter
            </button>
            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold transition"
              >
                Terminé
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
