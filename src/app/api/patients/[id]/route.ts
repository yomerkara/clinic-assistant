import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/http";
import { patientEditSchema } from "@/lib/patients/edit";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const origin = publicOrigin(request);
  const go = (status: string) =>
    NextResponse.redirect(
      new URL(`/patients/${encodeURIComponent(id)}?edit=${status}`, origin),
      303,
    );
  const form = await request.formData();
  const parsed = patientEditSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return go("invalid");
  const { version, ...data } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id, ...patientScope(toActor(user)) },
      select: { id: true },
    });
    if (!patient) return "forbidden";
    const changed = await tx.patient.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!changed.count) return "conflict";
    // Summaries may contain the old identity/intake. Keep the transcript as history.
    await tx.conversation.updateMany({
      where: { patientId: id },
      data: {
        memorySummary: null,
        offeredSlots: [],
        offeredAt: null,
        offeredTherapistId: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "patient_profile_updated",
        entityType: "Patient",
        entityId: id,
        metadata: { fields: Object.keys(data), version: version + 1 },
      },
    });
    return "saved";
  });
  if (result === "forbidden")
    return NextResponse.json({ error: "Bu müşteri için yetkiniz yok." }, { status: 403 });
  if (result === "saved") revalidatePath("/", "layout");
  return go(result);
}
