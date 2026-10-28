import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { CalendarPort } from "@/lib/adapters/calendar";
import type { WhatsAppPort } from "@/lib/adapters/whatsapp";

const TEXT = "İptal talebiniz onaylandı. Randevunuz iptal edildi.";

export function createCancellationDelivery(deps: {
  prisma: PrismaClient;
  calendar: CalendarPort;
  whatsapp: WhatsAppPort;
  now?: () => Date;
}) {
  const { prisma, calendar, whatsapp } = deps;
  const now = deps.now ?? (() => new Date());

  async function deliver(actionId: string) {
    const token = randomUUID();
    const started = now();
    // A crashed worker's lease expires. Fencing prevents a late worker from
    // recording completion after a replacement has claimed the operation.
    const claimed = await prisma.cancellationDelivery.updateMany({
      where: {
        actionId,
        completedAt: null,
        nextAttemptAt: { lte: started },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: started } }],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(started.getTime() + 120_000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return "skipped" as const;
    const job = await prisma.cancellationDelivery.findUniqueOrThrow({
      where: { actionId },
      include: { action: { include: { conversation: true } } },
    });
    try {
      if (!job.calendarSyncedAt) {
        await calendar.cancelEvent({
          calendarEventId: job.calendarEventId,
          calendarId: job.calendarId,
          ownerUserId: job.ownerUserId,
        });
        const saved = await prisma.cancellationDelivery.updateMany({
          where: { actionId, leaseToken: token },
          data: { calendarSyncedAt: now() },
        });
        if (!saved.count) return "skipped" as const;
      }
      const conversation = job.action.conversation;
      const messageKey = `cancel:${actionId}`;
      if (conversation) {
        const renewed = await prisma.cancellationDelivery.updateMany({
          where: { actionId, leaseToken: token },
          data: { leaseUntil: new Date(now().getTime() + 120_000) },
        });
        if (!renewed.count) return "skipped" as const;
        await whatsapp.sendMessage({
          phone: conversation.phone,
          conversationId: conversation.id,
          text: TEXT,
          idempotencyKey: messageKey,
        });
      }
      await prisma.$transaction(async (tx) => {
        const completed = await tx.cancellationDelivery.updateMany({
          where: { actionId, leaseToken: token },
          data: {
            completedAt: now(),
            leaseToken: null,
            leaseUntil: null,
            lastError: null,
          },
        });
        if (!completed.count) return;
        if (conversation) {
          await tx.message.upsert({
            where: { providerMessageId: messageKey },
            update: {},
            create: {
              conversationId: conversation.id,
              direction: "OUTBOUND",
              authorKind: "BOT",
              text: TEXT,
              providerMessageId: messageKey,
            },
          });
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: now() },
          });
        }
        await tx.auditEvent.create({
          data: {
            action: "cancellation.delivered",
            entityType: "ActionRequest",
            entityId: actionId,
            metadata: {},
          },
        });
      });
      return "completed" as const;
    } catch {
      // Never persist provider errors that might contain tokens or patient data.
      await prisma.cancellationDelivery.updateMany({
        where: { actionId, leaseToken: token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          lastError: "delivery_failed",
          nextAttemptAt: new Date(
            now().getTime() +
              Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts - 1, 7)),
          ),
        },
      });
      return "retry" as const;
    }
  }

  async function drain() {
    const jobs = await prisma.cancellationDelivery.findMany({
      where: {
        completedAt: null,
        nextAttemptAt: { lte: now() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now() } }],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: 5,
      select: { actionId: true },
    });
    return Promise.all(
      jobs.map(async ({ actionId }) => ({ actionId, status: await deliver(actionId) })),
    );
  }
  return { deliver, drain };
}
