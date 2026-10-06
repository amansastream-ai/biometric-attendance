import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, punchRecords } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
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
    const { id } = await context.params;
    const empId = Number(id);
    const body = await request.json();

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
    const { id } = await context.params;
    const empId = Number(id);

    // Also delete associated punch records
    await db.delete(punchRecords).where(eq(punchRecords.employeeId, empId));
    const [deleted] = await db.delete(employees).where(eq(employees.id, empId)).returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Employé introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Employé supprimé avec succès" });
  } catch (error) {
    console.error("DELETE /api/employees/[id] error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
