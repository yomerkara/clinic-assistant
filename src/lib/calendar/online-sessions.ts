import type { PrismaClient } from "@prisma/client";
import type { CalendarPort } from "@/lib/adapters/calendar";
import type { WhatsAppPort } from "@/lib/adapters/whatsapp";
import { appointmentLabel } from "@/lib/reminders/service";

type Deps = {
  prisma: PrismaClient;
  calendar: CalendarPort;
  whatsapp: WhatsAppPort;
  now?: () => Date;
};
export async function processOnlineSession(deps: Deps, id: string, sendNow = false) {
  const now = deps.now ?? (() => new Date());
  return deps.prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${id}`}))`;
      const a = await tx.appointment.findUnique({
        where: { id },
        include: {
          therapist: true,
          patient: {
            include: { conversations: { orderBy: { lastMessageAt: "desc" }, take: 1 } },
          },
        },
      });
      if (
        !a ||
        a.sessionMode !== "ONLINE" ||
        !["CONFIRMED", "SCHEDULED"].includes(a.status) ||
        a.endAt <= now()
      )
        return "ineligible";
      if (!a.calendarEventId || !deps.calendar.ensureMeeting)
        throw new Error("Takvim bağlantısı gerekli.");
      // Re-read Google before delivery: a meeting can be removed outside our app.
      const url = await deps.calendar.ensureMeeting({
        ownerUserId: a.therapist.userId,
        calendarEventId: a.calendarEventId,
      });
      if (!url) return "pending";
      await tx.appointment.update({ where: { id }, data: { meetingUrl: url } });
      if (a.meetingSentAt) return "already_sent";
      if (
        !sendNow &&
        (a.startAt <= now() || a.startAt.getTime() - now().getTime() > 10 * 60000)
      )
        return "ready";
      const conversation = a.patient.conversations[0];
      if (!conversation) return "no_conversation";
      const text = `${appointmentLabel(a.startAt, "Europe/Istanbul")} tarihindeki online seansınıza bu bağlantıdan katılabilirsiniz: ${url}`;
      const key = `online:${a.id}:${a.startAt.toISOString()}`;
      await deps.whatsapp.sendMessage({
        phone: a.patient.phone,
        conversationId: conversation.id,
        text,
        idempotencyKey: key,
      });
      await tx.message.upsert({
        where: { providerMessageId: key },
        create: {
          providerMessageId: key,
          conversationId: conversation.id,
          direction: "OUTBOUND",
          authorKind: "BOT",
          text,
        },
        update: {},
      });
      await tx.appointment.update({ where: { id }, data: { meetingSentAt: now() } });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now() },
      });
      return "sent";
    },
    { timeout: 45000 },
  );
}
export async function runAppointmentLifecycle(deps: Deps) {
  const now = (deps.now ?? (() => new Date()))();
  const completed = await deps.prisma.appointment.updateMany({
    where: { status: { in: ["SCHEDULED", "CONFIRMED"] }, endAt: { lte: now } },
    data: {
      status: "COMPLETED",
      completedAutomaticallyAt: now,
      version: { increment: 1 },
    },
  });
  const due = await deps.prisma.appointment.findMany({
    where: {
      sessionMode: "ONLINE",
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      startAt: { gt: now, lte: new Date(now.getTime() + 86400000) },
      OR: [
        { meetingUrl: null },
        { meetingSentAt: null, startAt: { lte: new Date(now.getTime() + 10 * 60000) } },
      ],
    },
    select: { id: true },
    take: 100,
  });
  let sent = 0,
    failed = 0;
  for (const a of due) {
    try {
      if ((await processOnlineSession(deps, a.id)) === "sent") sent++;
    } catch {
      failed++;
    }
  }
  return { completed: completed.count, checked: due.length, sent, failed };
}
