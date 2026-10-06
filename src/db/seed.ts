import { db } from "./index";
import { users, departments, employees, punchRecords, reportDispatches } from "./schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  // Check if already seeded
  const existingUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
  if (Number(existingUsers[0]?.count ?? 0) > 0) {
    return { message: "Database already seeded", count: existingUsers[0].count };
  }

  console.log("Seeding database with demo data...");

  // Important : les salariés de démonstration sont créés SANS empreinte.
  // Une empreinte ne peut être enregistrée que par un capteur réel, via
  // l'onglet Salariés > « Enrôler » (WebAuthn). L'historique de pointage
  // ci-dessous est marqué DEMO_SEED et ne prétend pas venir d'un capteur.

  // 1. Users
  await db.insert(users).values([
    {
      name: "Sophie Laurent (DRH)",
      email: "drh@pointage-biometrique.fr",
      password: "password123",
      role: "drh",
      avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    },
    {
      name: "Thomas Moreau (Manager)",
      email: "manager@pointage-biometrique.fr",
      password: "password123",
      role: "manager",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
    {
      name: "Terminal Borne Kiosk",
      email: "kiosk@pointage-biometrique.fr",
      password: "password123",
      role: "kiosk",
      avatarUrl: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=150&auto=format&fit=crop&q=80",
    },
  ]);

  // 2. Departments
  const insertedDepts = await db
    .insert(departments)
    .values([
      {
        name: "R&D & Ingénierie Logicielle",
        code: "TECH",
        color: "#2563eb",
        standardStart: "08:30",
        standardEnd: "17:30",
        breakDurationMinutes: 60,
        weeklyTargetHours: 35,
        gracePeriodMinutes: 15,
        managerName: "Thomas Moreau",
      },
      {
        name: "Ressources Humaines & Paie",
        code: "RH",
        color: "#ec4899",
        standardStart: "09:00",
        standardEnd: "17:30",
        breakDurationMinutes: 60,
        weeklyTargetHours: 35,
        gracePeriodMinutes: 10,
        managerName: "Sophie Laurent",
      },
      {
        name: "Marketing & Ventes",
        code: "MKT",
        color: "#f59e0b",
        standardStart: "09:00",
        standardEnd: "18:00",
        breakDurationMinutes: 60,
        weeklyTargetHours: 35,
        gracePeriodMinutes: 15,
        managerName: "Julie Garcia",
      },
      {
        name: "Logistique & Exploitation",
        code: "OPS",
        color: "#10b981",
        standardStart: "07:30",
        standardEnd: "16:30",
        breakDurationMinutes: 60,
        weeklyTargetHours: 35,
        gracePeriodMinutes: 10,
        managerName: "Karim Meziani",
      },
      {
        name: "Finance & Contrôle de Gestion",
        code: "FIN",
        color: "#8b5cf6",
        standardStart: "08:45",
        standardEnd: "17:45",
        breakDurationMinutes: 60,
        weeklyTargetHours: 35,
        gracePeriodMinutes: 10,
        managerName: "Hélène Fontaine",
      },
    ])
    .returning();

  const deptTech = insertedDepts.find((d) => d.code === "TECH")!.id;
  const deptRh = insertedDepts.find((d) => d.code === "RH")!.id;
  const deptMkt = insertedDepts.find((d) => d.code === "MKT")!.id;
  const deptOps = insertedDepts.find((d) => d.code === "OPS")!.id;
  const deptFin = insertedDepts.find((d) => d.code === "FIN")!.id;

  // 3. Employees
  const insertedEmployees = await db
    .insert(employees)
    .values([
      {
        employeeCode: "EMP-001",
        firstName: "Alexandre",
        lastName: "Dubois",
        email: "alexandre.dubois@entreprise-demo.fr",
        phone: "+33 6 12 34 56 78",
        departmentId: deptTech,
        jobTitle: "Développeur Full-Stack Senior",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "28.50",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1001",
        notes: "Membre équipe Core API. Télétravail le vendredi.",
      },
      {
        employeeCode: "EMP-002",
        firstName: "Camille",
        lastName: "Laurent",
        email: "camille.laurent@entreprise-demo.fr",
        phone: "+33 6 23 45 67 89",
        departmentId: deptRh,
        jobTitle: "Chargée de Recrutement & RH",
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "24.00",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1002",
        notes: "Gère les entretiens candidats et intégration.",
      },
      {
        employeeCode: "EMP-003",
        firstName: "Thomas",
        lastName: "Moreau",
        email: "thomas.moreau@entreprise-demo.fr",
        phone: "+33 6 34 56 78 90",
        departmentId: deptTech,
        jobTitle: "Lead Architecte & Manager",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Gauche",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "35.00",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1003",
        notes: "Responsable pôle technique.",
      },
      {
        employeeCode: "EMP-004",
        firstName: "Sarah",
        lastName: "Benali",
        email: "sarah.benali@entreprise-demo.fr",
        phone: "+33 6 45 67 89 01",
        departmentId: deptMkt,
        jobTitle: "Responsable Grands Comptes",
        avatarUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Index Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "27.50",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1004",
        notes: "Déplacements fréquents clientèle.",
      },
      {
        employeeCode: "EMP-005",
        firstName: "Lucas",
        lastName: "Martin",
        email: "lucas.martin@entreprise-demo.fr",
        phone: "+33 6 56 78 90 12",
        departmentId: deptOps,
        jobTitle: "Technicien Logistique & Stock",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "19.50",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1005",
        notes: "Atelier expédition. Horaires du matin.",
      },
      {
        employeeCode: "EMP-006",
        firstName: "Élodie",
        lastName: "Bernard",
        email: "elodie.bernard@entreprise-demo.fr",
        phone: "+33 6 67 89 01 23",
        departmentId: deptFin,
        jobTitle: "Contrôleuse de Gestion & Paie",
        avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "25.00",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1006",
        notes: "Audite les rapports de pointage chaque fin de mois.",
      },
      {
        employeeCode: "EMP-007",
        firstName: "Nicolas",
        lastName: "Petit",
        email: "nicolas.petit@entreprise-demo.fr",
        phone: "+33 6 78 90 12 34",
        departmentId: deptTech,
        jobTitle: "Ingénieur DevOps & Cloud",
        avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Gauche",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "30.00",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1007",
        notes: "Astreintes serveurs ponctuelles.",
      },
      {
        employeeCode: "EMP-008",
        firstName: "Amina",
        lastName: "Diop",
        email: "amina.diop@entreprise-demo.fr",
        phone: "+33 6 89 01 23 45",
        departmentId: deptRh,
        jobTitle: "Assistante Ressources Humaines",
        avatarUrl: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "18.50",
        contractType: "Alternance",
        weeklyHours: 35,
        status: "active",
        pinCode: "1008",
        notes: "En alternance Master RH.",
      },
      {
        employeeCode: "EMP-009",
        firstName: "Julien",
        lastName: "Leroy",
        email: "julien.leroy@entreprise-demo.fr",
        phone: "+33 6 90 12 34 56",
        departmentId: deptOps,
        jobTitle: "Préparateur de Commandes",
        avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Pouce Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "16.00",
        contractType: "CDD",
        weeklyHours: 35,
        status: "active",
        pinCode: "1009",
        notes: "Empreinte en attente d'enrôlement par le DRH.",
      },
      {
        employeeCode: "EMP-010",
        firstName: "Clara",
        lastName: "Rousseau",
        email: "clara.rousseau@entreprise-demo.fr",
        phone: "+33 6 01 23 45 67",
        departmentId: deptMkt,
        jobTitle: "Content & Brand Specialist",
        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        fingerprintEnrolled: false,
        fingerprintFinger: "Index Droit",
        fingerprintTemplateId: null,
        fingerprintRegisteredAt: null,
        hourlyRate: "23.50",
        contractType: "CDI",
        weeklyHours: 35,
        status: "active",
        pinCode: "1010",
        notes: "Gestion réseaux sociaux & relations presse.",
      },
    ])
    .returning();

  // 4. Punch Records Generation (Past 7 days + Today)
  const punchesToInsert = [];
  const now = new Date();

  // Historical punches (past 5 working days)
  for (let daysAgo = 5; daysAgo >= 1; daysAgo--) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    // skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    for (const emp of insertedEmployees.slice(0, 8)) {
      // morning punch in
      const inTime = new Date(d);
      const isLate = Math.random() < 0.2;
      const inHour = isLate ? 9 : 8;
      const inMin = isLate ? Math.floor(Math.random() * 20) + 10 : Math.floor(Math.random() * 28) + 15;
      inTime.setHours(inHour, inMin, Math.floor(Math.random() * 59));

      punchesToInsert.push({
        employeeId: emp.id,
        punchTime: inTime,
        type: "IN",
        punchMethod: "DEMO_SEED",
        kioskLocation: "Borne Entrée Principale - Bâtiment A",
        status: isLate ? "LATE" : "VALID",
        isManual: false,
      });

      // lunch break start
      const lunchStart = new Date(d);
      lunchStart.setHours(12, Math.floor(Math.random() * 20) + 20, 10);
      punchesToInsert.push({
        employeeId: emp.id,
        punchTime: lunchStart,
        type: "BREAK_START",
        punchMethod: "DEMO_SEED",
        kioskLocation: "Borne Entrée Principale - Bâtiment A",
        status: "VALID",
        isManual: false,
      });

      // lunch break end
      const lunchEnd = new Date(d);
      lunchEnd.setHours(13, Math.floor(Math.random() * 20) + 20, 25);
      punchesToInsert.push({
        employeeId: emp.id,
        punchTime: lunchEnd,
        type: "BREAK_END",
        punchMethod: "DEMO_SEED",
        kioskLocation: "Borne Entrée Principale - Bâtiment A",
        status: "VALID",
        isManual: false,
      });

      // punch out (departure)
      const outTime = new Date(d);
      const isOvertime = Math.random() < 0.25;
      const outHour = isOvertime ? 18 : 17;
      const outMin = isOvertime ? Math.floor(Math.random() * 40) + 20 : Math.floor(Math.random() * 25) + 25;
      outTime.setHours(outHour, outMin, Math.floor(Math.random() * 59));

      punchesToInsert.push({
        employeeId: emp.id,
        punchTime: outTime,
        type: "OUT",
        punchMethod: "DEMO_SEED",
        kioskLocation: "Borne Entrée Principale - Bâtiment A",
        status: isOvertime ? "OVERTIME" : "VALID",
        isManual: false,
      });
    }
  }

  // Today's realistic punches
  // EMP 1: Alexandre Dubois - Arrived 08:24, currently present
  const today = new Date();
  const tIn1 = new Date(today);
  tIn1.setHours(8, 24, 12);
  punchesToInsert.push({
    employeeId: insertedEmployees[0].id,
    punchTime: tIn1,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "VALID",
    isManual: false,
  });

  // EMP 2: Camille Laurent - Arrived 08:45, Pause déjeuner 12:30, Reprise 13:28
  const tIn2 = new Date(today);
  tIn2.setHours(8, 45, 30);
  const tBrk1 = new Date(today);
  tBrk1.setHours(12, 30, 15);
  const tBrk2 = new Date(today);
  tBrk2.setHours(13, 28, 40);
  punchesToInsert.push(
    {
      employeeId: insertedEmployees[1].id,
      punchTime: tIn2,
      type: "IN",
      punchMethod: "DEMO_SEED",
      kioskLocation: "Borne Entrée Principale - Bâtiment A",
      status: "VALID",
      isManual: false,
    },
    {
      employeeId: insertedEmployees[1].id,
      punchTime: tBrk1,
      type: "BREAK_START",
      punchMethod: "DEMO_SEED",
      kioskLocation: "Borne Cafétéria",
      status: "VALID",
      isManual: false,
    },
    {
      employeeId: insertedEmployees[1].id,
      punchTime: tBrk2,
      type: "BREAK_END",
      punchMethod: "DEMO_SEED",
      kioskLocation: "Borne Cafétéria",
      status: "VALID",
      isManual: false,
    }
  );

  // EMP 3: Thomas Moreau - Arrived 08:15
  const tIn3 = new Date(today);
  tIn3.setHours(8, 15, 5);
  punchesToInsert.push({
    employeeId: insertedEmployees[2].id,
    punchTime: tIn3,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "VALID",
    isManual: false,
  });

  // EMP 4: Sarah Benali - Arrived 09:25 (LATE)
  const tIn4 = new Date(today);
  tIn4.setHours(9, 25, 45);
  punchesToInsert.push({
    employeeId: insertedEmployees[3].id,
    punchTime: tIn4,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "LATE",
    isManual: false,
    notes: "Retard de 25 min (Rendez-vous client sur la route)",
  });

  // EMP 5: Lucas Martin - Arrived 07:22 (Early)
  const tIn5 = new Date(today);
  tIn5.setHours(7, 22, 18);
  punchesToInsert.push({
    employeeId: insertedEmployees[4].id,
    punchTime: tIn5,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrepôt & Logistique",
    status: "VALID",
    isManual: false,
  });

  // EMP 6: Élodie Bernard - Arrived 08:40, Break at 12:15 (currently on lunch)
  const tIn6 = new Date(today);
  tIn6.setHours(8, 40, 10);
  const tBrk3 = new Date(today);
  tBrk3.setHours(12, 15, 30);
  punchesToInsert.push(
    {
      employeeId: insertedEmployees[5].id,
      punchTime: tIn6,
      type: "IN",
      punchMethod: "DEMO_SEED",
      kioskLocation: "Borne Entrée Principale - Bâtiment A",
      status: "VALID",
      isManual: false,
    },
    {
      employeeId: insertedEmployees[5].id,
      punchTime: tBrk3,
      type: "BREAK_START",
      punchMethod: "DEMO_SEED",
      kioskLocation: "Borne Cafétéria",
      status: "VALID",
      isManual: false,
    }
  );

  // EMP 7: Nicolas Petit - Arrived 08:32
  const tIn7 = new Date(today);
  tIn7.setHours(8, 32, 50);
  punchesToInsert.push({
    employeeId: insertedEmployees[6].id,
    punchTime: tIn7,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "VALID",
    isManual: false,
  });

  // EMP 8: Amina Diop - Arrived 08:58
  const tIn8 = new Date(today);
  tIn8.setHours(8, 58, 20);
  punchesToInsert.push({
    employeeId: insertedEmployees[7].id,
    punchTime: tIn8,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "VALID",
    isManual: false,
  });

  // EMP 9 (Julien Leroy) is not punched today yet (allows demonstration of punching!)
  // EMP 10: Clara Rousseau - Arrived 09:02
  const tIn10 = new Date(today);
  tIn10.setHours(9, 2, 14);
  punchesToInsert.push({
    employeeId: insertedEmployees[9].id,
    punchTime: tIn10,
    type: "IN",
    punchMethod: "DEMO_SEED",
    kioskLocation: "Borne Entrée Principale - Bâtiment A",
    status: "VALID",
    isManual: false,
  });

  await db.insert(punchRecords).values(punchesToInsert);

  // 5. Past Dispatched Reports (Historique des envois de fichiers)
  await db.insert(reportDispatches).values([
    {
      title: "Rapport Mensuel des Présences & Heures Réalisées - Février 2025",
      recipientEmail: "drh@pointage-biometrique.fr",
      recipientName: "Sophie Laurent (Direction RH)",
      periodType: "LAST_MONTH",
      periodStart: "2025-02-01",
      periodEnd: "2025-02-28",
      fileFormat: "CSV",
      totalEmployees: 10,
      totalHoursWorked: "1480.50",
      totalOvertimeHours: "38.25",
      totalLateMinutes: 145,
      status: "DELIVERED",
      sentAt: new Date("2025-03-01T08:30:00Z"),
      sentBy: "Système Automatique / DRH",
      notes: "Envoi automatique de clôture mensuelle pour calcul des bulletins de paie.",
    },
    {
      title: "Feuille d'Heures & Heures Supplémentaires - Semaine 11",
      recipientEmail: "paie@cabinet-expertise.fr",
      recipientName: "Cabinet Expertise Comptable & Paie",
      periodType: "THIS_WEEK",
      periodStart: "2025-03-10",
      periodEnd: "2025-03-16",
      departmentId: null,
      fileFormat: "XLSX_CSV",
      totalEmployees: 10,
      totalHoursWorked: "365.75",
      totalOvertimeHours: "12.50",
      totalLateMinutes: 40,
      status: "DELIVERED",
      sentAt: new Date("2025-03-17T09:00:00Z"),
      sentBy: "Sophie Laurent (DRH)",
      notes: "Fichier préparatoire virement et déclarations URSSAF.",
    },
    {
      title: "Relevé Biométrique & Assiduité R&D Ingénierie",
      recipientEmail: "thomas.moreau@pointage-biometrique.fr",
      recipientName: "Thomas Moreau (Lead Tech)",
      periodType: "THIS_MONTH",
      periodStart: "2025-03-01",
      periodEnd: "2025-03-24",
      departmentId: deptTech,
      fileFormat: "PDF_BULLETIN",
      totalEmployees: 3,
      totalHoursWorked: "410.00",
      totalOvertimeHours: "16.00",
      totalLateMinutes: 15,
      status: "SENT",
      sentAt: new Date("2025-03-24T18:15:00Z"),
      sentBy: "Sophie Laurent (DRH)",
      notes: "Suivi des heures de projet et R&D crédit impôt recherche (CIR).",
    },
  ]);

  console.log("Database successfully seeded!");
  return { message: "Database successfully seeded" };
}
