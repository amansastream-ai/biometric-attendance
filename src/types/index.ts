export interface Department {
  id: number;
  name: string;
  code: string;
  color: string;
  standardStart: string;
  standardEnd: string;
  breakDurationMinutes: number;
  weeklyTargetHours: number;
  gracePeriodMinutes: number;
  managerName?: string | null;
  employeeCount?: number;
}

export interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  departmentId: number;
  jobTitle: string;
  avatarUrl?: string | null;
  fingerprintEnrolled: boolean;
  fingerprintFinger: string;
  fingerprintTemplateId?: string | null;
  fingerprintRegisteredAt?: string | null;
  hourlyRate: string;
  contractType: string;
  weeklyHours: number;
  status: string;
  pinCode?: string | null;
  notes?: string | null;
  department?: Department | null;
  currentStatus?: "PRESENT" | "ON_BREAK" | "DEPARTED" | "ABSENT";
  arrivalTime?: string | null;
  departureTime?: string | null;
  latestPunch?: PunchRecord | null;
}

export interface PunchRecord {
  id: number;
  employeeId: number;
  punchTime: string;
  type: "IN" | "OUT" | "BREAK_START" | "BREAK_END";
  punchMethod:
    | "WEBAUTHN"
    | "FINGERPRINT"
    | "KIOSK_PAD"
    | "MANUAL_DRH"
    | "PIN_FALLBACK"
    | "DEMO_SEED";
  fingerMatched?: string | null;
  biometricConfidence?: number | null;
  kioskLocation: string;
  isManual: boolean;
  manualReason?: string | null;
  manualEditedBy?: string | null;
  status: "VALID" | "LATE" | "OVERTIME" | "EARLY_DEPARTURE";
  notes?: string | null;
  employee?: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
    jobTitle: string;
    departmentId: number;
    department?: Department | null;
  };
}

export interface DailySummary {
  date: string;
  dateFormatted: string;
  dayName: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  arrivalTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  departureTime: string | null;
  grossHours: number;
  breakMinutes: number;
  netHoursWorked: number;
  netHoursFormatted: string;
  standardDailyHours: number;
  overtimeHours: number;
  overtimeFormatted: string;
  lateMinutes: number;
  status: "NORMAL" | "OVERTIME" | "LATE" | "INCOMPLETE" | "ONGOING";
  punchesCount: number;
}

export interface EmployeeAggregate {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  department?: { name: string; code: string; color: string } | null;
  daysWorked: number;
  totalHours: number;
  totalHoursFormatted: string;
  overtimeHours: number;
  overtimeFormatted: string;
  lateMinutes: number;
  hourlyRate: string;
  estimatedPay: string;
  fingerprintEnrolled: boolean;
}

export interface ReportDispatch {
  id: number;
  title: string;
  recipientEmail: string;
  recipientName: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  departmentId?: number | null;
  fileFormat: string;
  totalEmployees: number;
  totalHoursWorked: string;
  totalOvertimeHours: string;
  totalLateMinutes: number;
  status: string;
  sentAt: string;
  sentBy: string;
  notes?: string | null;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "drh" | "admin" | "manager" | "kiosk";
  avatarUrl?: string | null;
}
