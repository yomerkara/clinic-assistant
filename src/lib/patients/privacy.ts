import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { CalendarPort } from "@/lib/adapters/calendar";

export async function exportPatientData(
  prisma: PrismaClient,
  patientId: string,
  actorId: string,
) {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      appointments: { include: { notes: true } },
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          serviceRequests: true,
          actionRequests: true,
        },
      },
    },
  });
  // A shared phone may contain another person's messages in the same conversation.
  if ((await prisma.patient.count({ where: { phone: patient.phone } })) > 1)
    throw new Error(
      "Ortak telefon kaydı var. Diğer kişilerin verileri için çalışan incelemesi gerekli; otomatik dışa aktarma yapılmadı.",
    );
  await prisma.auditEvent.create({
    data: {
      actorId,
      action: "privacy.export",
      entityType: "Patient",
      entityId: patientId,
      metadata: { identityVerified: true },
    },
  });
  return {
    exportedAt: new Date().toISOString(),
    scope:
      "Uygulamadaki hasta profili, randevular, notlar ve konuşmalar. Teslimden önce çalışan tarafından incelenmelidir.",
    patient,
  };
}
export async function erasePatientData(
  prisma: PrismaClient,
  calendar: CalendarPort,
  patientId: string,
  actorId: string,
) {
  // Explicit staff review is required before calling this destructive operation.
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id = ${patientId} FOR UPDATE`;
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: patientId },
        include: {
          appointments: { include: { therapist: true, actionRequests: true } },
          conversations: {
            include: {
              actionRequests: true,
              messages: { select: { id: true } },
              serviceRequests: { select: { id: true } },
            },
          },
        },
      });
      if ((await tx.patient.count({ where: { phone: patient.phone } })) > 1)
        throw new Error(
          "Ortak telefon kaydı var; diğer kişinin verilerini korumak için manuel inceleme gerekli.",
        );
      if (
        patient.appointments.some((a) =>
          ["SCHEDULED", "CONFIRMED", "NO_SHOW_REVIEW"].includes(a.status),
        ) ||
        patient.conversations.some((c) =>
          c.actionRequests.some((a) => a.status === "PENDING"),
        )
      )
        throw new Error("Önce aktif randevuları ve bekleyen talepleri sonuçlandırın.");
      if (patient.appointments.length > 30)
        throw new Error(
          "30 üzeri takvim kaydı için kademeli çalışan incelemesi gerekli.",
        );
      for (const appointment of patient.appointments) {
        if (appointment.calendarEventId)
          await calendar.cancelEvent({
            ownerUserId: appointment.therapist.userId,
            calendarEventId: appointment.calendarEventId,
          });
      }
      const conversationIds = patient.conversations.map((c) => c.id);
      const appointmentIds = patient.appointments.map((a) => a.id);
      const actions = await tx.actionRequest.findMany({
        where: {
          OR: [
            { conversationId: { in: conversationIds } },
            { appointmentId: { in: appointmentIds } },
          ],
        },
        select: { id: true },
      });
      const entities = [
        patient.id,
        ...conversationIds,
        ...appointmentIds,
        ...actions.map((a) => a.id),
        ...patient.conversations.flatMap((c) => [
          ...c.messages.map((m) => m.id),
          ...c.serviceRequests.map((r) => r.id),
        ]),
      ];
      // Audit payloads may contain names, notes and raw model traces; remove those too.
      await tx.auditEvent.deleteMany({ where: { entityId: { in: entities } } });
      await tx.notification.deleteMany({
        where: {
          OR: conversationIds.map((id) => ({
            payload: { path: ["conversationId"], equals: id },
          })),
        },
      });
      await tx.actionRequest.deleteMany({
        where: { id: { in: actions.map((a) => a.id) } },
      });
      await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
      await tx.patient.delete({ where: { id: patientId } });
      await tx.faqAnswerCache.deleteMany({});
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "privacy.erased",
          entityType: "PrivacyOperation",
          entityId: createHash("sha256").update(patientId).digest("hex"),
          metadata: {
            identityVerified: true,
            retentionReviewed: true,
            appointments: appointmentIds.length,
            conversations: conversationIds.length,
            scope:
              "Application database and linked calendar events. Backups and external message-provider copies are outside this operation.",
          },
        },
      });
      return { erased: true };
    },
    { timeout: 120000 },
  );
}
