import { Prisma, type PrismaClient } from "@prisma/client";
import type { CalendarPort } from "@/lib/adapters/calendar";
import type { WhatsAppPort } from "@/lib/adapters/whatsapp";
import { effectiveWorkingHours, withinClinicHours } from "@/lib/calendar/clinic-hours";
import { proposeSlots, formatSlotOptions } from "@/lib/calendar/availability";
import { missingBookingProfile } from "@/lib/patients/profile";

type Deps = {
  prisma: PrismaClient;
  calendar: CalendarPort;
  whatsapp: WhatsAppPort;
  now?: () => Date;
};
export type WaitingPlan = {
  type: "WAITLIST";
  therapistId: string;
  from: string;
  until: string;
  startMinute: number;
  endMinute: number;
};
export function validateWaitingPlan(plan: WaitingPlan, now: Date) {
  if (
    !Number.isFinite(Date.parse(plan.from)) ||
    !Number.isFinite(Date.parse(plan.until)) ||
    Date.parse(plan.until) <= Math.max(now.getTime(), Date.parse(plan.from)) ||
    Date.parse(plan.until) - Date.parse(plan.from) > 90 * 86400000 ||
    !Number.isInteger(plan.startMinute) ||
    !Number.isInteger(plan.endMinute) ||
    plan.startMinute < 480 ||
    plan.endMinute > 1380 ||
    plan.endMinute - plan.startMinute < 50
  )
    throw new Error("Geçerli bir tarih ve saat aralığı seçin (en fazla 90 gün).");
}
export async function notifyWaitingList(deps: Deps) {
  const now = (deps.now ?? (() => new Date()))();
  const pending = await deps.prisma.serviceRequest.findMany({
    where: {
      kind: "WAITLIST",
      status: "OPEN",
      workflow: { not: Prisma.DbNull },
      notificationSentAt: null,
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let offered = 0,
    failed = 0;
  for (const request of pending) {
    try {
      const delivered = await deps.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conversation:${request.conversationId}`}))`;
          const fresh = await tx.serviceRequest.findUniqueOrThrow({
            where: { id: request.id },
            include: { conversation: { include: { patient: true } } },
          });
          if (fresh.status !== "OPEN" || fresh.notificationSentAt) return false;
          const recordCheck = async (lastCheckResult: string) => {
            await tx.serviceRequest.update({
              where: { id: fresh.id },
              data: { lastCheckedAt: now, lastCheckResult },
            });
            return false;
          };
          const plan = fresh.workflow as unknown as WaitingPlan;
          if (plan?.type !== "WAITLIST" || Date.parse(plan.until) <= now.getTime())
            return recordCheck("EXPIRED");
          validateWaitingPlan(plan, now);
          const c = fresh.conversation;
          // Do not replace an active selection or a staff-owned conversation.
          if (
            c.mode === "HUMAN" ||
            (c.offeredAt && c.offeredAt.getTime() > now.getTime() - 30 * 60000) ||
            (await tx.actionRequest.count({
              where: {
                conversationId: c.id,
                status: "PENDING",
                type: { in: ["NEW_BOOKING", "RESCHEDULE"] },
              },
            }))
          )
            return recordCheck("PAUSED");
          const therapist = await tx.therapistProfile.findUnique({
            where: { id: plan.therapistId },
            include: { workingBlocks: true },
          });
          if (!therapist?.active) return false;
          const from = new Date(Math.max(now.getTime(), Date.parse(plan.from)));
          const until = new Date(plan.until);
          const busy = await deps.calendar.listBusy({
            ownerUserId: therapist.userId,
            from,
            to: until,
          });
          const local = await tx.appointment.findMany({
            where: {
              therapistId: therapist.id,
              status: { in: ["SCHEDULED", "CONFIRMED"] },
              startAt: { lt: until },
              endAt: { gt: from },
            },
            select: { startAt: true, endAt: true },
          });
          const hours = effectiveWorkingHours(therapist.workingBlocks)
            .map((h) => ({
              ...h,
              startMinute: Math.max(h.startMinute, plan.startMinute),
              endMinute: Math.min(h.endMinute, plan.endMinute),
            }))
            .filter((h) => h.endMinute > h.startMinute);
          const slots = proposeSlots({
            now: new Date(Math.max(now.getTime(), from.getTime() - 3600001)),
            workingHours: hours,
            busy: [...busy, ...local],
            windowDays: Math.ceil((until.getTime() - from.getTime()) / 86400000) + 1,
            count: 2000,
          })
            .filter((d) => d >= from && d.getTime() + 50 * 60000 <= until.getTime())
            .slice(0, 3);
          if (!slots.length) return recordCheck("NO_SLOT");
          const text = `${therapist.displayName} için istediğiniz aralıkta uygun saat bulundu. Seçiminiz ekip onayıyla kesinleşir.\n${formatSlotOptions(slots)}\nHangi saati tercih edersiniz?`;
          const key = `waitlist:${fresh.id}`;
          await deps.whatsapp.sendMessage({
            phone: c.phone,
            conversationId: c.id,
            text,
            idempotencyKey: key,
          });
          await tx.message.upsert({
            where: { providerMessageId: key },
            create: {
              providerMessageId: key,
              conversationId: c.id,
              direction: "OUTBOUND",
              authorKind: "BOT",
              text,
            },
            update: {},
          });
          await tx.conversation.update({
            where: { id: c.id },
            data: {
              bookingPurpose: "NEW",
              bookingStage: "SLOT_SELECTION",
              appointmentSelection: Prisma.DbNull,
              offeredSlots: slots.map((d) => d.toISOString()),
              offeredAt: now,
              offeredTherapistId: therapist.id,
              preferredTherapistId: therapist.id,
              lastMessageAt: now,
            },
          });
          await tx.serviceRequest.update({
            where: { id: fresh.id },
            data: {
              notificationSentAt: now,
              lastCheckedAt: now,
              lastCheckResult: "OFFERED",
            },
          });
          return true;
        },
        { timeout: 45000 },
      );
      if (delivered) offered++;
    } catch {
      failed++;
      await deps.prisma.serviceRequest
        .updateMany({
          where: { id: request.id, status: "OPEN", notificationSentAt: null },
          data: { lastCheckedAt: now, lastCheckResult: "ERROR" },
        })
        .catch(() => {});
    }
  }
  return { checked: pending.length, offered, failed };
}
export async function planRecurringAppointments(
  deps: Deps,
  input: {
    requestId: string;
    therapistId: string;
    startAt: Date;
    count: number;
    actorId: string;
  },
) {
  const now = (deps.now ?? (() => new Date()))();
  if (
    !Number.isInteger(input.count) ||
    input.count < 2 ||
    input.count > 12 ||
    input.startAt <= now ||
    !Number.isFinite(input.startAt.getTime())
  )
    throw new Error("2–12 seans ve gelecekte bir başlangıç seçin.");
  return deps.prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurring:${input.requestId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.therapistId}))`;
      const request = await tx.serviceRequest.findUniqueOrThrow({
        where: { id: input.requestId },
        include: { conversation: { include: { patient: true } } },
      });
      if (request.kind !== "RECURRING" || request.status !== "OPEN")
        throw new Error("Açık seri talebi bulunamadı.");
      if (missingBookingProfile(request.conversation.patient).length)
        throw new Error("Önce hastanın eksik profil bilgilerini tamamlayın.");
      const therapist = await tx.therapistProfile.findUniqueOrThrow({
        where: { id: input.therapistId },
        include: { workingBlocks: true },
      });
      if (!therapist.active) throw new Error("Uzman aktif değil.");
      const slots = Array.from({ length: input.count }, (_, i) => ({
        startAt: new Date(input.startAt.getTime() + i * 7 * 86400000),
        endAt: new Date(input.startAt.getTime() + i * 7 * 86400000 + 50 * 60000),
      }));
      const hours = effectiveWorkingHours(therapist.workingBlocks);
      for (const slot of slots) {
        const local = new Date(slot.startAt.getTime() + 3 * 3600000);
        const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
        if (
          !withinClinicHours(slot.startAt) ||
          !hours.some(
            (h) =>
              h.weekday === (local.getUTCDay() || 7) &&
              minute >= h.startMinute &&
              minute + 50 <= h.endMinute,
          )
        )
          throw new Error("Serinin bir saati çalışma saatleri dışında.");
      }
      const busy = await deps.calendar.listBusy({
        ownerUserId: therapist.userId,
        from: slots[0].startAt,
        to: slots.at(-1)!.endAt,
      });
      const local = await tx.appointment.findMany({
        where: {
          therapistId: therapist.id,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          startAt: { lt: slots.at(-1)!.endAt },
          endAt: { gt: slots[0].startAt },
        },
        select: { startAt: true, endAt: true },
      });
      if (
        slots.some((s) =>
          [...busy, ...local].some((b) => b.startAt < s.endAt && b.endAt > s.startAt),
        )
      )
        throw new Error("Seride dolu bir saat var; hiçbir talep oluşturulmadı.");
      const ids: string[] = [];
      for (const [i, slot] of slots.entries()) {
        const action = await tx.actionRequest.create({
          data: {
            id: `series_${request.id}_${i}`,
            type: "NEW_BOOKING",
            conversationId: request.conversationId,
            requestedBy: input.actorId,
            proposedChanges: {
              patientId: request.conversation.patientId,
              therapistId: therapist.id,
              sessionMode: request.conversation.sessionMode,
              startAt: slot.startAt.toISOString(),
              endAt: slot.endAt.toISOString(),
              operationalSummary: `Haftalık seri ${i + 1}/${input.count}. Onayda müsaitlik tekrar kontrol edilir.`,
            },
          },
        });
        ids.push(action.id);
      }
      await tx.serviceRequest.update({
        where: { id: request.id },
        data: {
          status: "RESOLVED",
          resolvedById: input.actorId,
          resolution: `${input.count} haftalık seans onay kuyruğuna eklendi. Her seans ayrıca onaylanmalıdır.`,
          workflow: {
            type: "RECURRING",
            actionIds: ids,
            starts: slots.map((s) => s.startAt.toISOString()),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.actorId,
          action: "recurring.planned",
          entityType: "ServiceRequest",
          entityId: request.id,
          metadata: { actionIds: ids },
        },
      });
      return ids;
    },
    { timeout: 45000 },
  );
}
