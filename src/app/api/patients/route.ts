import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { patientEditSchema } from "@/lib/patients/edit";
import { hasFullPatientName, normalizePatientName } from "@/lib/patients/identity";
import { normalizeImportPhone } from "@/lib/patients/import";
import { z } from "zod";

const schema = patientEditSchema.omit({ version: true }).extend({
  displayName: z.string().trim().min(3).max(120).refine(hasFullPatientName),
  phone: z
    .string()
    .max(40)
    .transform(normalizeImportPhone)
    .refine((phone): phone is string => phone !== null),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Müşteri eklemek için yönetici yetkisi gerekir." },
      { status: 403 },
    );
  if (!(await allowAuthAttempt("patient-create", user.id, 30, 300)))
    return NextResponse.json(
      { error: "Çok fazla deneme. Birkaç dakika sonra tekrar deneyin." },
      { status: 429 },
    );
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Form bilgileri okunamadı." }, { status: 400 });
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Ad-soyad, geçerli telefon ve varsa 0–120 arasında yaş girin. Uygunluk notu en fazla 500 karakter olabilir.",
      },
      { status: 400 },
    );
  try {
    const patient = await prisma.$transaction(async (tx) => {
      // Share the import lock so simultaneous manual/import requests cannot duplicate an identity.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('patient-import'))`;
      const existing = await tx.patient.findMany({
        select: { id: true, displayName: true, phone: true },
      });
      const duplicate = existing.find(
        (p) =>
          normalizeImportPhone(p.phone) === parsed.data.phone &&
          normalizePatientName(p.displayName) ===
            normalizePatientName(parsed.data.displayName),
      );
      if (duplicate) return { id: duplicate.id, duplicate: true };
      const created = await tx.patient.create({
        data: parsed.data,
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "patient_created_manually",
          entityType: "Patient",
          entityId: created.id,
          metadata: { source: "manual" },
        },
      });
      return { id: created.id, duplicate: false };
    });
    if (patient.duplicate)
      return NextResponse.json(
        {
          error: "Bu ad ve telefonla bir müşteri zaten kayıtlı.",
          existingId: patient.id,
        },
        { status: 409 },
      );
    revalidatePath("/patients");
    return NextResponse.json({ id: patient.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        error:
          "Kayıt oluşturulamadı. Bilgileriniz formda duruyor; tekrar deneyebilirsiniz.",
      },
      { status: 500 },
    );
  }
}
