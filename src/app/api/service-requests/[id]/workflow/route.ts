import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { getCalendar, whatsappPort } from "@/lib/queue/ports";
import { publicOrigin } from "@/lib/http";
import { parseIstanbulInput } from "@/lib/calendar/dates";
import {
  planRecurringAppointments,
  validateWaitingPlan,
  type WaitingPlan,
} from "@/lib/conversation/service-workflows";
import { exportPatientData, erasePatientData } from "@/lib/patients/privacy";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (user.role === "INTERN")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  const { id } = await context.params;
  const item = await prisma.serviceRequest.findFirst({
    where: { id, status: "OPEN", conversation: { patient: patientScope(toActor(user)) } },
    include: { conversation: true },
  });
  if (!item)
    return NextResponse.json({ error: "Açık talep bulunamadı." }, { status: 404 });
  const form = await request.formData();
  const operation = String(form.get("operation") ?? "");
  try {
    if (operation === "ONLINE") {
      if (item.kind !== "ONLINE") throw new Error("Talep türü uyuşmuyor.");
      await prisma.$transaction(
        async (tx) => {
          const appointmentId = String(form.get("appointmentId") ?? "");
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${appointmentId}`}))`;
          const a = await tx.appointment.findFirst({
            where: {
              id: appointmentId,
              patientId: item.conversation.patientId,
              status: { in: ["SCHEDULED", "CONFIRMED"] },
              startAt: { gt: new Date() },
              ...(user.role === "THERAPIST" ? { therapist: { userId: user.id } } : {}),
            },
            include: { patient: true, therapist: true },
          });
          if (!a?.calendarEventId) throw new Error("Bağlı aktif randevu bulunamadı.");
          await getCalendar().updateEvent({
            ownerUserId: a.therapist.userId,
            calendarEventId: a.calendarEventId,
            startAt: a.startAt,
            endAt: a.endAt,
            summary: `${a.patient.displayName} · ${a.therapist.displayName}`,
            sessionMode: "ONLINE",
          });
          await tx.appointment.update({
            where: { id: a.id },
            data: { sessionMode: "ONLINE", version: { increment: 1 } },
          });
          await tx.serviceRequest.update({
            where: { id },
            data: {
              status: "RESOLVED",
              resolvedById: user.id,
              resolution: "Seçilen randevu online olarak güncellendi.",
              workflow: { type: "ONLINE", appointmentId: a.id },
            },
          });
          await tx.auditEvent.create({
            data: {
              actorId: user.id,
              action: "appointment.online",
              entityType: "Appointment",
              entityId: a.id,
              metadata: { requestId: id },
            },
          });
        },
        { timeout: 45000 },
      );
    } else if (operation === "WAITLIST" || operation === "RECURRING") {
      if (item.kind !== operation) throw new Error("Talep türü uyuşmuyor.");
      const therapist = await prisma.therapistProfile.findFirst({
        where: {
          id: String(form.get("therapistId") ?? ""),
          active: true,
          ...(user.role === "THERAPIST" ? { userId: user.id } : {}),
        },
      });
      if (!therapist)
        return NextResponse.json({ error: "Uzman için yetkiniz yok." }, { status: 403 });
      if (operation === "WAITLIST") {
        const clock = (v: FormDataEntryValue | null) => {
          const m = String(v).match(/^(\d{2}):(\d{2})$/);
          return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
        };
        const plan: WaitingPlan = {
          type: "WAITLIST",
          therapistId: therapist.id,
          from: parseIstanbulInput(String(form.get("from")))?.toISOString() ?? "",
          until: parseIstanbulInput(String(form.get("until")))?.toISOString() ?? "",
          startMinute: clock(form.get("startTime")),
          endMinute: clock(form.get("endTime")),
        };
        validateWaitingPlan(plan, new Date());
        await prisma.serviceRequest.update({
          where: { id },
          data: { workflow: plan, notificationSentAt: null, lastCheckedAt: null, lastCheckResult: null },
        });
        await prisma.conversation.update({
          where: { id: item.conversationId },
          data: { mode: "BOT", handoffReason: null },
        });
        await prisma.auditEvent.create({
          data: {
            actorId: user.id,
            action: "waitlist.configured",
            entityType: "ServiceRequest",
            entityId: id,
            metadata: plan,
          },
        });
      } else {
        await planRecurringAppointments(
          { prisma, calendar: getCalendar(), whatsapp: whatsappPort },
          {
            requestId: id,
            therapistId: therapist.id,
            startAt: parseIstanbulInput(String(form.get("startAt"))) ?? new Date(NaN),
            count: Number(form.get("count")),
            actorId: user.id,
          },
        );
      }
    } else if (["EXPORT", "ERASE"].includes(operation)) {
      if (user.role !== "ADMIN" || item.kind !== "DATA_REQUEST")
        return NextResponse.json({ error: "Yönetici yetkisi gerekli." }, { status: 403 });
      if (form.get("identityVerified") !== "yes")
        throw new Error("Önce talep sahibinin kimliğini teyit edin.");
      if (operation === "EXPORT") {
        const result = await exportPatientData(
          prisma,
          item.conversation.patientId,
          user.id,
        );
        return new Response(JSON.stringify(result, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="hasta-verileri.json"',
            "Cache-Control": "no-store",
          },
        });
      }
      if (form.get("retentionReviewed") !== "yes" || form.get("confirmation") !== "SİL")
        throw new Error("Saklama gerekliliklerini inceleyip SİL yazarak onaylayın.");
      await erasePatientData(prisma, getCalendar(), item.conversation.patientId, user.id);
    } else throw new Error("Geçersiz işlem.");
    revalidatePath("/requests");
    revalidatePath("/queue");
    revalidatePath("/calendar");
    return NextResponse.redirect(new URL("/requests", publicOrigin(request)), 303);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "İşlem tamamlanamadı." },
      { status: 409 },
    );
  }
}
