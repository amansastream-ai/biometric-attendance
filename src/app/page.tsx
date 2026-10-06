"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Employee, Department, PunchRecord } from "@/types";
import { Navbar } from "@/components/Navbar";
import { Sidebar, TabType } from "@/components/Sidebar";
import { BiometricTerminal } from "@/components/BiometricTerminal";
import { DashboardTab } from "@/components/tabs/DashboardTab";
import { PunchesTab } from "@/components/tabs/PunchesTab";
import { EmployeesTab } from "@/components/tabs/EmployeesTab";
import { TimesheetsTab } from "@/components/tabs/TimesheetsTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { DepartmentsTab } from "@/components/tabs/DepartmentsTab";
import { UsersTab } from "@/components/tabs/UsersTab";

import { LoginScreen } from "@/components/LoginScreen";
import { PasswordModal } from "@/components/PasswordModal";
import { EnrollmentModal } from "@/components/EnrollmentModal";
import { ManualPunchModal } from "@/components/ManualPunchModal";
import { DispatchReportModal } from "@/components/DispatchReportModal";
import { EmployeeModal } from "@/components/EmployeeModal";
import { DepartmentModal } from "@/components/DepartmentModal";

import {
  fetchSession,
  logout as logoutRequest,
  onSessionExpired,
  type SessionState,
} from "@/lib/api-client";
import type { Capability, Role } from "@/lib/permissions";
import { Menu, X, Fingerprint, Monitor, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

type SessionUser = NonNullable<SessionState["user"]>;

export default function HomePage() {
  // ---- Session (source de vérité : le serveur) ----
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [capabilities, setCapabilities] = useState<Record<Capability, boolean> | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Navigation State
  const [currentTab, setCurrentTab] = useState<TabType>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStandaloneKiosk, setIsStandaloneKiosk] = useState(false);

  // Core Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    currentlyPresent: 0,
    currentlyOnBreak: 0,
    currentlyDeparted: 0,
    notPunchedToday: 0,
    attendanceRate: 0,
    lateCountToday: 0,
    monthTotalHours: 0,
    monthOvertimeHours: 0,
    deptStats: [] as any[],
    recentPunches: [] as PunchRecord[],
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
  const [enrollmentTargetEmp, setEnrollmentTargetEmp] = useState<Employee | null>(null);

  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [editingPunch, setEditingPunch] = useState<PunchRecord | null>(null);

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const isKioskRole = sessionUser?.role === "kiosk";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // ---- Chargement / rafraîchissement de la session ----
  const applySession = useCallback((state: SessionState) => {
    if (!state.authenticated || !state.user) {
      setSessionUser(null);
      setCapabilities(null);
      return;
    }
    setSessionUser(state.user);
    setCapabilities(state.capabilities);
    if (state.user.role === "kiosk") {
      // Une borne n'a pas accès aux données RH : elle ouvre directement le terminal
      setIsStandaloneKiosk(true);
      setCurrentTab("terminal");
    } else {
      setIsStandaloneKiosk(false);
      setCurrentTab((previous) => (previous === "terminal" ? previous : "dashboard"));
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setLoadingSession(true);
    try {
      const state = await fetchSession();
      applySession(state);
    } catch {
      setSessionUser(null);
      setCapabilities(null);
    } finally {
      setLoadingSession(false);
    }
  }, [applySession]);

  useEffect(() => {
    // Chargement initial de la session (le serveur est seul juge de l'identité)
    let cancelled = false;
    fetchSession()
      .then((state) => {
        if (!cancelled) applySession(state);
      })
      .catch(() => {
        if (!cancelled) {
          setSessionUser(null);
          setCapabilities(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  // Si une requête reçoit un 401 (session expirée/révoquée), on revient à l'écran de connexion
  useEffect(() => {
    return onSessionExpired(() => {
      setSessionUser(null);
      setCapabilities(null);
      setSessionNotice("Votre session a expiré. Merci de vous reconnecter.");
    });
  }, []);

  // ---- Données ----
  const fetchData = useCallback(async () => {
    try {
      const [empRes, deptRes, statRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/departments"),
        fetch("/api/stats"),
      ]);

      // Session invalide : inutile d'insister, l'écran de connexion reprend la main
      if (empRes.status === 401 || deptRes.status === 401 || statRes.status === 401) {
        setSessionUser(null);
        setCapabilities(null);
        return;
      }

      const [empData, deptData, statData] = await Promise.all([
        empRes.json(),
        deptRes.json(),
        statRes.json(),
      ]);

      if (empData.success) setEmployees(empData.employees || []);
      if (deptData.success) setDepartments(deptData.departments || []);
      if (statData.success) setStats(statData.stats);
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
    }
  }, []);

  // Ne charge les données RH que si le rôle y a droit
  useEffect(() => {
    if (sessionUser) fetchData();
  }, [sessionUser, fetchData]);

  const can = useCallback(
    (capability: Capability) => Boolean(capabilities?.[capability]),
    [capabilities]
  );

  const handleLogout = async () => {
    await logoutRequest();
    setSessionUser(null);
    setCapabilities(null);
    setIsStandaloneKiosk(false);
    setSessionNotice(null);
  };

  const handleResetSeed = async () => {
    if (!confirm("Réinitialiser les données de démonstration avec les employés et pointages d'exemple ?")) {
      return;
    }
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchData();
        showToast("Données réinitialisées avec succès !");
      } else {
        showToast(data.error || "Réinitialisation impossible.");
      }
    } catch {
      alert("Erreur lors de la réinitialisation");
    }
  };

  const handlePunchSuccess = (punch: PunchRecord, emp: Employee) => {
    showToast(
      `Pointage de ${emp.firstName} ${emp.lastName} enregistré (${punch.type === "IN" ? "arrivée" : punch.type === "OUT" ? "départ" : "pause"})`
    );
    if (!isKioskRole) fetchData();
  };

  // ---- Écrans intermédiaires ----
  if (loadingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-3">
        <Fingerprint className="w-10 h-10 text-cyan-400 animate-pulse" />
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Vérification de votre session...
        </p>
      </div>
    );
  }

  if (!sessionUser || !capabilities) {
    return (
      <>
        {sessionNotice && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {sessionNotice}
          </div>
        )}
        <LoginScreen
          onAuthenticated={() => {
            setSessionNotice(null);
            refreshSession();
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in slide-in-from-bottom-5 duration-300 max-w-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Standalone Kiosk Mode (rôle borne, ou bouton « Mode borne ») */}
      {isStandaloneKiosk ? (
        <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500 text-slate-950">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">
                  BioPointage Kiosk • Borne entrée
                </h1>
                <p className="text-xs text-slate-400">
                  {isKioskRole
                    ? "Session borne : accès limité au pointage"
                    : "Borne active en continu pour le pointage des salariés"}
                </p>
              </div>
            </div>

            {isKioskRole ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:inline">{sessionUser.name}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                >
                  Fermer la session borne
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsStandaloneKiosk(false);
                  setCurrentTab("dashboard");
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              >
                Quitter la borne
              </button>
            )}
          </div>

          <div className="my-auto py-6">
            <BiometricTerminal
              employees={employees}
              onPunchSuccess={handlePunchSuccess}
              onOpenEnrollment={
                can("enrollBiometrics")
                  ? (emp) => {
                      setEnrollmentTargetEmp(emp);
                      setIsEnrollmentOpen(true);
                    }
                  : undefined
              }
              standalone={true}
            />
          </div>

          <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
            Système de reconnaissance d&apos;empreintes conforme RGPD • {stats.totalEmployees}{" "}
            salariés enregistrés
          </div>
        </div>
      ) : (
        /* Portal DRH / Admin / Manager */
        <>
          <Navbar
            currentUser={sessionUser}
            capabilities={capabilities}
            onOpenDispatchReport={() => setIsDispatchModalOpen(true)}
            onOpenKioskView={() => setIsStandaloneKiosk(true)}
            onResetSeed={handleResetSeed}
            onNavigateUsers={() => setCurrentTab("users")}
            onChangePassword={() => setIsPasswordModalOpen(true)}
            onLogout={handleLogout}
          />

          <div className="flex-1 flex overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <Sidebar
                currentTab={currentTab}
                onTabChange={setCurrentTab}
                presentCount={stats.currentlyPresent}
                totalEmployees={stats.totalEmployees}
                role={sessionUser.role as Role}
                capabilities={capabilities}
              />
            </div>

            {/* Mobile Drawer */}
            {isMobileMenuOpen && (
              <div className="fixed inset-0 z-50 flex lg:hidden">
                <div
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
                  onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className="relative w-72 bg-slate-900 border-r border-slate-800 z-10 flex flex-col">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <span className="font-bold text-white text-sm">Menu navigation</span>
                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <Sidebar
                    currentTab={currentTab}
                    onTabChange={(tab) => {
                      setCurrentTab(tab);
                      setIsMobileMenuOpen(false);
                    }}
                    presentCount={stats.currentlyPresent}
                    totalEmployees={stats.totalEmployees}
                    role={sessionUser.role as Role}
                    capabilities={capabilities}
                  />
                </div>
              </div>
            )}

            {/* Main Content View */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
              {/* Mobile menu trigger */}
              <div className="lg:hidden flex items-center justify-between pb-2 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-2 text-xs"
                >
                  <Menu className="w-4 h-4 text-cyan-400" />
                  <span>Menu principal</span>
                </button>

                <div className="text-xs text-slate-400 font-mono">
                  {stats.currentlyPresent} / {stats.totalEmployees} présents
                </div>
              </div>

              {currentTab === "dashboard" && can("viewPortal") && (
                <DashboardTab
                  stats={stats}
                  onNavigateTab={(tab) => setCurrentTab(tab as TabType)}
                  onOpenManualPunch={
                    can("manualPunch")
                      ? () => {
                          setEditingPunch(null);
                          setIsManualPunchOpen(true);
                        }
                      : () => showToast("Votre rôle ne permet pas de saisir un pointage manuel.")
                  }
                  onOpenDispatchReport={
                    can("dispatchReports")
                      ? () => setIsDispatchModalOpen(true)
                      : () => showToast("Votre rôle ne permet pas l'envoi de fichiers.")
                  }
                />
              )}

              {currentTab === "terminal" && can("punchTerminal") && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white">Borne de pointage empreinte</h2>
                      <p className="text-xs text-slate-400">
                        Le salarié pose son doigt : le capteur l&apos;identifie et signe le pointage
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStandaloneKiosk(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      Plein écran
                    </button>
                  </div>

                  <BiometricTerminal
                    employees={employees}
                    onPunchSuccess={handlePunchSuccess}
                    onOpenEnrollment={
                      can("enrollBiometrics")
                        ? (emp) => {
                            setEnrollmentTargetEmp(emp);
                            setIsEnrollmentOpen(true);
                          }
                        : undefined
                    }
                  />
                </div>
              )}

              {currentTab === "punches" && can("viewPortal") && (
                <PunchesTab
                  employees={employees}
                  departments={departments}
                  onOpenManualPunch={(punch) => {
                    if (!can("manualPunch")) {
                      showToast("Votre rôle ne permet pas de modifier un pointage.");
                      return;
                    }
                    setEditingPunch(punch || null);
                    setIsManualPunchOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}

              {currentTab === "employees" && can("viewPortal") && (
                <EmployeesTab
                  employees={employees}
                  departments={departments}
                  onOpenEmployeeModal={(emp) => {
                    if (!can("manageEmployees")) {
                      showToast("Votre rôle ne permet pas de modifier un salarié.");
                      return;
                    }
                    setEditingEmployee(emp || null);
                    setIsEmployeeModalOpen(true);
                  }}
                  onOpenEnrollment={(emp) => {
                    if (!can("enrollBiometrics")) {
                      showToast("Votre rôle ne permet pas d'enrôler une empreinte.");
                      return;
                    }
                    setEnrollmentTargetEmp(emp);
                    setIsEnrollmentOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}

              {currentTab === "timesheets" && can("viewPortal") && (
                <TimesheetsTab
                  employees={employees}
                  departments={departments}
                  onOpenDispatchReport={
                    can("dispatchReports")
                      ? () => setIsDispatchModalOpen(true)
                      : () => showToast("Votre rôle ne permet pas l'envoi de fichiers.")
                  }
                />
              )}

              {currentTab === "reports" && can("dispatchReports") && (
                <ReportsTab
                  departments={departments}
                  totalEmployeesCount={stats.totalEmployees}
                  totalHoursMonth={stats.monthTotalHours}
                  totalOvertimeMonth={stats.monthOvertimeHours}
                  onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
                />
              )}

              {currentTab === "departments" && can("viewPortal") && (
                <DepartmentsTab
                  departments={departments}
                  onOpenDepartmentModal={(dept) => {
                    if (!can("manageDepartments")) {
                      showToast("Votre rôle ne permet pas de modifier un pôle.");
                      return;
                    }
                    setEditingDepartment(dept || null);
                    setIsDepartmentModalOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}

              {currentTab === "users" && can("manageUsers") && (
                <UsersTab
                  currentUserId={sessionUser.id}
                  isAdmin={sessionUser.role === "admin"}
                  employees={employees}
                  onNotify={showToast}
                />
              )}
            </main>
          </div>
        </>
      )}

      {/* MODALS */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onChanged={() => showToast("Mot de passe modifié.")}
      />

      {enrollmentTargetEmp && can("enrollBiometrics") && (
        <EnrollmentModal
          key={`enrollment-${enrollmentTargetEmp.id}`}
          isOpen={isEnrollmentOpen}
          onClose={() => {
            setIsEnrollmentOpen(false);
            setEnrollmentTargetEmp(null);
          }}
          employee={enrollmentTargetEmp}
          onEnrolled={(updated) => {
            fetchData();
            showToast(
              `Empreinte du ${updated.fingerprintFinger} enrôlée pour ${updated.firstName} ${updated.lastName}`
            );
          }}
        />
      )}

      {can("manualPunch") && (
        <ManualPunchModal
          isOpen={isManualPunchOpen}
          onClose={() => {
            setIsManualPunchOpen(false);
            setEditingPunch(null);
          }}
          employees={employees}
          existingPunch={editingPunch}
          onSaved={() => {
            fetchData();
            showToast(editingPunch ? "Pointage modifié" : "Pointage manuel enregistré");
          }}
        />
      )}

      {can("dispatchReports") && (
        <DispatchReportModal
          isOpen={isDispatchModalOpen}
          onClose={() => setIsDispatchModalOpen(false)}
          departments={departments}
          totalEmployeesCount={stats.totalEmployees}
          totalHoursMonth={stats.monthTotalHours}
          totalOvertimeMonth={stats.monthOvertimeHours}
          onReportDispatched={() => {
            fetchData();
            showToast("Fichier de présence transmis avec succès !");
          }}
        />
      )}

      {can("manageEmployees") && (
        <>
          <EmployeeModal
            isOpen={isEmployeeModalOpen}
            onClose={() => {
              setIsEmployeeModalOpen(false);
              setEditingEmployee(null);
            }}
            departments={departments}
            employeeToEdit={editingEmployee}
            onSaved={() => {
              fetchData();
              showToast(editingEmployee ? "Salarié mis à jour" : "Nouveau salarié créé");
            }}
            onOpenEnrollment={(emp) => {
              setEnrollmentTargetEmp(emp);
              setIsEnrollmentOpen(true);
            }}
          />

          <DepartmentModal
            isOpen={isDepartmentModalOpen}
            onClose={() => {
              setIsDepartmentModalOpen(false);
              setEditingDepartment(null);
            }}
            departmentToEdit={editingDepartment}
            onSaved={() => {
              fetchData();
              showToast(editingDepartment ? "Pôle mis à jour" : "Nouveau pôle créé");
            }}
          />
        </>
      )}
    </div>
  );
}
