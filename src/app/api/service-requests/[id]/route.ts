import { taskProgressLabels } from "@/lib/conversation/task-progress";
import { parseIstanbulInput } from "@/lib/calendar/dates";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { publicOrigin } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (user.role === "INTERN")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  const { id } = await context.params;
  const form = await request.formData();
  if (form.get("intent") === "track") {
    const progress = String(form.get("progress") ?? "");
    const ownerId = String(form.get("ownerId") ?? "") || null;
    const rawDate = String(form.get("followUpAt") ?? "");
    const followUpAt = rawDate ? parseIstanbulInput(rawDate) : null;
    if (
      !Object.hasOwn(taskProgressLabels, progress) ||
      (followUpAt && !Number.isFinite(followUpAt.getTime()))
    )
      return NextResponse.json(
        { error: "Geçerli durum ve takip tarihi seçin." },
        { status: 400 },
      );
    if (ownerId) {
      if (user.role !== "ADMIN" && ownerId !== user.id)
        return NextResponse.json(
          { error: "Yalnızca kendinize atayabilirsiniz." },
          { status: 403 },
        );
      const owner = await prisma.user.findFirst({
        where: { id: ownerId, active: true, role: { in: ["ADMIN", "THERAPIST"] } },
        include: { therapistProfile: true },
      });
      if (
        !owner ||
        !(await prisma.serviceRequest.findFirst({
          where: { id, conversation: { patient: patientScope(toActor(owner)) } },
          select: { id: true },
        }))
      )
        return NextResponse.json(
          { error: "Sorumlu kişinin bu danışana erişimi yok." },
          { status: 400 },
        );
    }
    const changed = await prisma.$transaction(async (tx) => {
      const r = await tx.serviceRequest.updateMany({
        where: {
          id,
          status: "OPEN",
          conversation: { patient: patientScope(toActor(user)) },
        },
        data: { progress, ownerId, followUpAt },
      });
      if (r.count)
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "service_request.tracked",
            entityType: "ServiceRequest",
            entityId: id,
            metadata: {
              progress,
              ownerId,
              followUpAt: followUpAt?.toISOString() ?? null,
            },
          },
        });
      return r.count;
    });
    if (!changed)
      return NextResponse.json(
        { error: "Talep bulunamadı veya kapatıldı." },
        { status: 409 },
      );
    revalidatePath("/requests");
    revalidatePath("/conversations");
    return NextResponse.redirect(
      new URL(`/requests#request-${id}`, publicOrigin(request)),
      303,
    );
  }
  const resolution = String(form.get("resolution") ?? "").trim();
  if (resolution.length < 5 || resolution.length > 2000)
    return NextResponse.json({ error: "Sonuç notu gerekli." }, { status: 400 });
  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.serviceRequest.updateMany({
      where: {
        id,
        status: "OPEN",
        conversation: { patient: patientScope(toActor(user)) },
      },
      data: { status: "RESOLVED", resolution, resolvedById: user.id },
    });
    if (result.count)
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "service_request.resolved",
          entityType: "ServiceRequest",
          entityId: id,
          metadata: { resolution },
        },
      });
    return result.count;
  });
  if (!changed)
    return NextResponse.json(
      { error: "Talep bulunamadı veya zaten kapatıldı." },
      { status: 409 },
    );
  revalidatePath("/requests");
  return NextResponse.redirect(new URL("/requests", publicOrigin(request)), 303);
}
