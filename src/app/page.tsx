"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Employee, Department, PunchRecord, AuthUser } from "@/types";
import { Navbar } from "@/components/Navbar";
import { Sidebar, TabType } from "@/components/Sidebar";
import { BiometricTerminal } from "@/components/BiometricTerminal";
import { DashboardTab } from "@/components/tabs/DashboardTab";
import { PunchesTab } from "@/components/tabs/PunchesTab";
import { EmployeesTab } from "@/components/tabs/EmployeesTab";
import { TimesheetsTab } from "@/components/tabs/TimesheetsTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { DepartmentsTab } from "@/components/tabs/DepartmentsTab";

import { EnrollmentModal } from "@/components/EnrollmentModal";
import { ManualPunchModal } from "@/components/ManualPunchModal";
import { DispatchReportModal } from "@/components/DispatchReportModal";
import { EmployeeModal } from "@/components/EmployeeModal";
import { DepartmentModal } from "@/components/DepartmentModal";

import {
  Menu,
  X,
  Fingerprint,
  RotateCcw,
  Monitor,
  Shield,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function HomePage() {
  // Navigation State
  const [currentTab, setCurrentTab] = useState<TabType>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isStandaloneKiosk, setIsStandaloneKiosk] = useState(false);

  // Authenticated User State
  const [currentUser, setCurrentUser] = useState<AuthUser>({
    id: 1,
    name: "Sophie Laurent (DRH)",
    email: "drh@pointage-biometrique.fr",
    role: "drh",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  });

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

  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
  const [enrollmentTargetEmp, setEnrollmentTargetEmp] = useState<Employee | null>(null);

  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [editingPunch, setEditingPunch] = useState<PunchRecord | null>(null);

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  // Show temporary toast message
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Fetch all core data
  const fetchData = useCallback(async () => {
    try {
      const [empRes, deptRes, statRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/departments"),
        fetch("/api/stats"),
      ]);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle user role switch
  const handleUserSwitch = (user: AuthUser) => {
    setCurrentUser(user);
    if (user.role === "kiosk") {
      setIsStandaloneKiosk(true);
      setCurrentTab("terminal");
    } else {
      setIsStandaloneKiosk(false);
    }
    showToast(`Session basculée sur : ${user.name}`);
  };

  // Reset Demo data
  const handleResetSeed = async () => {
    if (!confirm("Réinitialiser les données de démonstration avec les employés et pointages d'exemple ?")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchData();
        showToast("Données réinitialisées avec succès !");
      }
    } catch {
      alert("Erreur lors de la réinitialisation");
    } finally {
      setLoading(false);
    }
  };

  // When a punch is performed on the BiometricTerminal
  const handlePunchSuccess = (punch: PunchRecord, emp: Employee) => {
    showToast(
      `Pointage de ${emp.firstName} ${emp.lastName} validé avec le ${emp.fingerprintFinger || "pouce"} (${punch.type === "IN" ? "Arrivée" : punch.type === "OUT" ? "Départ" : "Pause"})`
    );
    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in slide-in-from-bottom-5 duration-300 max-w-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Standalone Kiosk Mode */}
      {isStandaloneKiosk ? (
        <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500 text-slate-950">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">
                  BioPointage Kiosk • Borne Entrée
                </h1>
                <p className="text-xs text-slate-400">
                  Borne active en continu pour le pointage des salariés
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsStandaloneKiosk(false);
                setCurrentTab("dashboard");
                setCurrentUser({
                  id: 1,
                  name: "Sophie Laurent (DRH)",
                  email: "drh@pointage-biometrique.fr",
                  role: "drh",
                  avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150",
                });
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              Quitter la borne (Retour DRH)
            </button>
          </div>

          <div className="my-auto py-6">
            <BiometricTerminal
              employees={employees}
              onPunchSuccess={handlePunchSuccess}
              standalone={true}
            />
          </div>

          <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
            Système de reconnaissance d&apos;empreintes conforme RGPD • {stats.totalEmployees} salariés enregistrés
          </div>
        </div>
      ) : (
        /* Regular DRH / Enterprise Portal View */
        <>
          <Navbar
            currentUser={currentUser}
            onUserSwitch={handleUserSwitch}
            onOpenDispatchReport={() => setIsDispatchModalOpen(true)}
            onOpenKioskView={() => setIsStandaloneKiosk(true)}
            onResetSeed={handleResetSeed}
          />

          <div className="flex-1 flex overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <Sidebar
                currentTab={currentTab}
                onTabChange={setCurrentTab}
                presentCount={stats.currentlyPresent}
                totalEmployees={stats.totalEmployees}
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
                    <span className="font-bold text-white text-sm">Menu Navigation</span>
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
                  <span>Menu Principal</span>
                </button>

                <div className="text-xs text-slate-400 font-mono">
                  {stats.currentlyPresent} / {stats.totalEmployees} présents
                </div>
              </div>

              {/* Dynamic Tabs */}
              {currentTab === "dashboard" && (
                <DashboardTab
                  stats={stats}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                  onOpenManualPunch={() => {
                    setEditingPunch(null);
                    setIsManualPunchOpen(true);
                  }}
                  onOpenDispatchReport={() => setIsDispatchModalOpen(true)}
                />
              )}

              {currentTab === "terminal" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        Borne de Pointage Empreinte
                      </h2>
                      <p className="text-xs text-slate-400">
                        Posez le pouce sur le capteur pour enregistrer l&apos;arrivée ou le départ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStandaloneKiosk(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      Plein Écran
                    </button>
                  </div>

                  <BiometricTerminal
                    employees={employees}
                    onPunchSuccess={handlePunchSuccess}
                  />
                </div>
              )}

              {currentTab === "punches" && (
                <PunchesTab
                  employees={employees}
                  departments={departments}
                  onOpenManualPunch={(punch) => {
                    setEditingPunch(punch || null);
                    setIsManualPunchOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}

              {currentTab === "employees" && (
                <EmployeesTab
                  employees={employees}
                  departments={departments}
                  onOpenEmployeeModal={(emp) => {
                    setEditingEmployee(emp || null);
                    setIsEmployeeModalOpen(true);
                  }}
                  onOpenEnrollment={(emp) => {
                    setEnrollmentTargetEmp(emp);
                    setIsEnrollmentOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}

              {currentTab === "timesheets" && (
                <TimesheetsTab
                  employees={employees}
                  departments={departments}
                  onOpenDispatchReport={() => setIsDispatchModalOpen(true)}
                />
              )}

              {currentTab === "reports" && (
                <ReportsTab
                  departments={departments}
                  totalEmployeesCount={stats.totalEmployees}
                  totalHoursMonth={stats.monthTotalHours}
                  totalOvertimeMonth={stats.monthOvertimeHours}
                  onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
                />
              )}

              {currentTab === "departments" && (
                <DepartmentsTab
                  departments={departments}
                  onOpenDepartmentModal={(dept) => {
                    setEditingDepartment(dept || null);
                    setIsDepartmentModalOpen(true);
                  }}
                  onRefreshNeeded={fetchData}
                />
              )}
            </main>
          </div>
        </>
      )}

      {/* MODALS */}
      {/* Biometric Enrollment Wizard */}
      {enrollmentTargetEmp && (
        <EnrollmentModal
          isOpen={isEnrollmentOpen}
          onClose={() => {
            setIsEnrollmentOpen(false);
            setEnrollmentTargetEmp(null);
          }}
          employee={enrollmentTargetEmp}
          onEnrolled={(updated) => {
            fetchData();
            showToast(`Empreinte du ${updated.fingerprintFinger} enrôlée pour ${updated.firstName} ${updated.lastName}`);
          }}
        />
      )}

      {/* Manual Punch Form (Create or Edit) */}
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

      {/* Dispatch Presence Report Modal */}
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

      {/* Employee Modal (Create or Edit) */}
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

      {/* Department Modal (Create or Edit) */}
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
    </div>
  );
}
