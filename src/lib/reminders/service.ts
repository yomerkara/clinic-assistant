import type { PrismaClient } from "@prisma/client";
import type { WhatsAppPort } from "@/lib/adapters/whatsapp";
import { addressedName } from "@/lib/patients/honorific";

type ReminderDeps = {
  prisma: PrismaClient;
  whatsapp: WhatsAppPort;
  now?: () => Date;
  timeZone?: string;
};

export function appointmentLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function reminderText(input: {
  patientName: string;
  therapistName: string;
  startAt: Date;
  timeZone?: string;
}) {
  const address = addressedName(input.patientName);
  const greeting = address ? `Merhaba ${address},` : "Merhaba,";
  return `${greeting} ${appointmentLabel(input.startAt, input.timeZone ?? "Europe/Istanbul")} tarihindeki ${input.therapistName} randevunuzu hatırlatmak isterim. Katılımınızı teyit eder misiniz?`;
}

export function createReminderService(deps: ReminderDeps) {
  const now = deps.now ?? (() => new Date());
  const timeZone = deps.timeZone ?? "Europe/Istanbul";
  return {
    async sendDueReminders() {
      const current = now();
      const until = new Date(current.getTime() + 24 * 60 * 60 * 1000);
      const appointments = await deps.prisma.appointment.findMany({
        where: {
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          reminderSentAt: null,
          startAt: { gt: current, lte: until },
        },
        include: {
          therapist: true,
          patient: {
            include: { conversations: { orderBy: { lastMessageAt: "desc" }, take: 1 } },
          },
        },
        orderBy: { startAt: "asc" },
      });
      let sent = 0;
      let failed = 0;
      for (const appointment of appointments) {
        try {
          const delivered = await deps.prisma.$transaction(
            async (tx) => {
              // Share the appointment lock with approval, cancellation and rescheduling.
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${appointment.id}`}))`;
              await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${appointment.id} FOR UPDATE`;
              const fresh = await tx.appointment.findUnique({
                where: { id: appointment.id },
                include: {
                  therapist: true,
                  patient: {
                    include: {
                      conversations: { orderBy: { lastMessageAt: "desc" }, take: 1 },
                    },
                  },
                },
              });
              const checkedAt = now();
              if (
                !fresh ||
                fresh.reminderSentAt ||
                !["SCHEDULED", "CONFIRMED"].includes(fresh.status) ||
                fresh.startAt <= checkedAt ||
                fresh.startAt.getTime() > checkedAt.getTime() + 24 * 60 * 60 * 1000
              )
                return false;
              const conversation = fresh.patient.conversations[0];
              if (!conversation) return false;
              const text = reminderText({
                patientName: fresh.patient.displayName,
                therapistName: fresh.therapist.displayName,
                startAt: fresh.startAt,
                timeZone,
              });
              const key = `reminder:24h:${fresh.id}:${fresh.startAt.toISOString()}`;
              await deps.whatsapp.sendMessage({
                phone: fresh.patient.phone,
                text,
                conversationId: conversation.id,
                idempotencyKey: key,
              });
              await tx.message.upsert({
                where: { providerMessageId: key },
                create: {
                  conversationId: conversation.id,
                  direction: "OUTBOUND",
                  authorKind: "BOT",
                  text,
                  providerMessageId: key,
                },
                update: {},
              });
              await tx.appointment.update({
                where: { id: fresh.id },
                data: { reminderSentAt: checkedAt },
              });
              await tx.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: checkedAt },
              });
              return true;
            },
            { timeout: 15000 },
          );
          if (delivered) sent += 1;
        } catch {
          // A failing recipient must not prevent reminders for other patients.
          failed += 1;
        }
      }
      return { checked: appointments.length, sent, failed };
    },
  };
}
