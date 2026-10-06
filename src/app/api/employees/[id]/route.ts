import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, punchRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth";
import { PORTAL_ROLES, WRITE_ROLES } from "@/lib/permissions";
import { describeChanges, recordAudit } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, PORTAL_ROLES);
    if ("error" in guard) return guard.error;

    const { id } = await context.params;
    const empId = Number(id);
    const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
    if (!emp) {
      return NextResponse.json({ success: false, error: "Employé introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, employee: emp });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "EMPLOYEE_UPDATE",
      entityType: "employee",
      label: "modification d'une fiche salarié",
    });
    if ("error" in guard) return guard.error;

    const { id } = await context.params;
    const empId = Number(id);
    const body = await request.json();
    const [before] = await db.select().from(employees).where(eq(employees.id, empId));

    const {
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      jobTitle,
      avatarUrl,
      hourlyRate,
      contractType,
      weeklyHours,
      status,
      pinCode,
      notes,
      fingerprintEnrolled,
      fingerprintFinger,
      fingerprintTemplateId,
    } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (departmentId !== undefined) updateData.departmentId = Number(departmentId);
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;
    if (contractType !== undefined) updateData.contractType = contractType;
    if (weeklyHours !== undefined) updateData.weeklyHours = Number(weeklyHours);
    if (status !== undefined) updateData.status = status;
    if (pinCode !== undefined) updateData.pinCode = pinCode;
    if (notes !== undefined) updateData.notes = notes;

    // Biometrics enrollment payload
    if (fingerprintEnrolled !== undefined) {
      updateData.fingerprintEnrolled = Boolean(fingerprintEnrolled);
      if (fingerprintEnrolled) {
        updateData.fingerprintRegisteredAt = new Date();
        updateData.fingerprintFinger = fingerprintFinger || "Pouce Droit";
        updateData.fingerprintTemplateId =
          fingerprintTemplateId || `BIO-FP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      } else {
        updateData.fingerprintTemplateId = null;
        updateData.fingerprintRegisteredAt = null;
      }
    }

    const [updated] = await db
      .update(employees)
      .set(updateData)
      .where(eq(employees.id, empId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Employé introuvable" }, { status: 404 });
    }

    // On journalise les champs réellement modifiés, sans recopier la fiche entière
    const changes = describeChanges(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["jobTitle", "contractType", "hourlyRate", "weeklyHours", "status", "departmentId", "email", "phone"]
    );

    await recordAudit({
      action: "EMPLOYEE_UPDATE",
      actor: guard.actor,
      request,
      entityType: "employee",
      entityId: empId,
      summary: `Modification de la fiche de ${updated.firstName} ${updated.lastName} (${updated.employeeCode})${guard.actor.id === empId ? " — sa propre fiche" : ""}.`,
      details: {
        champsModifies: Object.keys(changes),
        changements: changes,
        empreinteEnrolee: updateData.fingerprintEnrolled ?? undefined,
      },
    });

    return NextResponse.json({ success: true, employee: updated });
  } catch (error) {
    console.error("PUT /api/employees/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActor(request, WRITE_ROLES, {
      action: "EMPLOYEE_DELETE",
      entityType: "employee",
      label: "suppression d'un salarié",
    });
    if ("error" in guard) return guard.error;

    const { id } = await context.params;
    const empId = Number(id);

    // Also delete associated punch records
    await db.delete(punchRecords).where(eq(punchRecords.employeeId, empId));
    const [deleted] = await db.delete(employees).where(eq(employees.id, empId)).returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Employé introuvable" }, { status: 404 });
    }

    await recordAudit({
      action: "EMPLOYEE_DELETE",
      actor: guard.actor,
      request,
      entityType: "employee",
      entityId: empId,
      summary: `Suppression définitive de ${deleted.firstName} ${deleted.lastName} (${deleted.employeeCode}) et de son historique de pointage.`,
      details: {
        matricule: deleted.employeeCode,
        poste: deleted.jobTitle,
        empreinteEnrolee: deleted.fingerprintEnrolled,
      },
    });

    return NextResponse.json({ success: true, message: "Employé supprimé avec succès" });
  } catch (error) {
    console.error("DELETE /api/employees/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
