import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isCrisisMessage } from "./guardrails";

export const QUIET_MS = 3000;
export const MAX_BURST_MS = 12000;
export class SupersededInboundError extends Error {}
export function nextDue(first: Date, latest: Date, urgent = false) {
  return new Date(
    urgent
      ? latest.getTime()
      : Math.min(first.getTime() + MAX_BURST_MS, latest.getTime() + QUIET_MS),
  );
}
export type BufferedInput = {
  phone: string;
  text: string;
  patientId: string;
  source: "demo" | "whatsapp";
  demoAdminUserId?: string;
  providerMessageId: string;
};
export type BufferedTurn = {
  phone: string;
  text: string;
  patientId: string;
  source: "demo" | "whatsapp";
  demoAdminUserId?: string;
  conversationId: string;
  inboundMessageIds: string[];
  ensureCurrent: () => Promise<void>;
};
export function createInboundBufferService(deps: {
  prisma: PrismaClient;
  handle: (input: BufferedTurn) => Promise<unknown>;
  now?: () => Date;
}) {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  return {
    async enqueue(input: BufferedInput) {
      const text = input.text.trim();
      if (!text || text.length > 4000) throw new Error("Mesaj 1–4000 karakter olmalı.");
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inbound:${input.source}:${input.patientId}`}))`;
        const duplicate = await tx.message.findUnique({
          where: { providerMessageId: input.providerMessageId },
        });
        if (duplicate) {
          const owner = await tx.conversation.findUniqueOrThrow({
            where: { id: duplicate.conversationId },
          });
          if (owner.patientId !== input.patientId || owner.source !== input.source)
            throw new Error("Message owner mismatch");
          return { conversationId: duplicate.conversationId, messageId: duplicate.id };
        }
        let conversation = await tx.conversation.findFirst({
          where: { patientId: input.patientId, source: input.source },
          orderBy: { lastMessageAt: "desc" },
        });
        const receivedAt = now();
        if (!conversation)
          conversation = await tx.conversation.create({
            data: {
              patientId: input.patientId,
              phone: input.phone,
              source: input.source,
            },
          });
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            direction: "INBOUND",
            authorKind: "PATIENT",
            text,
            providerMessageId: input.providerMessageId,
            createdAt: receivedAt,
            processedAt: conversation.mode === "HUMAN" ? receivedAt : null,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: receivedAt },
        });
        if (conversation.mode !== "HUMAN") {
          const existing = await tx.inboundBuffer.findUnique({
            where: { conversationId: conversation.id },
          });
          const firstAt = existing?.firstAt ?? receivedAt;
          const dueAt = nextDue(firstAt, receivedAt, isCrisisMessage(text));
          await tx.inboundBuffer.upsert({
            where: { conversationId: conversation.id },
            create: {
              conversationId: conversation.id,
              firstAt,
              dueAt,
              demoAdminUserId: input.demoAdminUserId,
            },
            update: { dueAt, revision: { increment: 1 }, attempts: 0 },
          });
        }
        return { conversationId: conversation.id, messageId: message.id };
      });
    },
    async drain(limit = 4) {
      const due = await prisma.inboundBuffer.findMany({
        where: {
          dueAt: { lte: now() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now() } }],
        },
        orderBy: { dueAt: "asc" },
        take: limit,
      });
      return Promise.all(
        due.map(async (candidate) => {
          const token = randomUUID();
          const claimed = await prisma.inboundBuffer.updateMany({
            where: {
              conversationId: candidate.conversationId,
              revision: candidate.revision,
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: now() } }],
            },
            data: { leaseToken: token, leaseUntil: new Date(now().getTime() + 300000) },
          });
          if (!claimed.count) return "busy";
          const conversation = await prisma.conversation.findUniqueOrThrow({
            where: { id: candidate.conversationId },
          });
          const messages = await prisma.message.findMany({
            where: {
              conversationId: conversation.id,
              direction: "INBOUND",
              processedAt: null,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 20,
          });
          const ensureCurrent = async () => {
            const current = await prisma.inboundBuffer.findUnique({
              where: { conversationId: conversation.id },
              include: { conversation: { select: { mode: true } } },
            });
            if (
              !current ||
              current.revision !== candidate.revision ||
              current.leaseToken !== token ||
              current.conversation.mode === "HUMAN"
            )
              throw new SupersededInboundError();
          };
          try {
            if (conversation.mode !== "HUMAN") await ensureCurrent();
            const alreadyAnswered = messages.length
              ? await prisma.intentDecision.findUnique({
                  where: { messageId: messages[messages.length - 1]!.id },
                })
              : null;
            if (messages.length && conversation.mode !== "HUMAN" && !alreadyAnswered)
              await deps.handle({
                phone: conversation.phone,
                patientId: conversation.patientId,
                text: messages.map((m) => m.text).join("\n"),
                source: conversation.source === "demo" ? "demo" : "whatsapp",
                demoAdminUserId: candidate.demoAdminUserId ?? undefined,
                conversationId: conversation.id,
                inboundMessageIds: messages.map((m) => m.id),
                ensureCurrent,
              });
            await prisma.$transaction(async (tx) => {
              await tx.message.updateMany({
                where: { id: { in: messages.map((m) => m.id) } },
                data: { processedAt: now() },
              });
              const remaining = await tx.message.findFirst({
                where: {
                  conversationId: conversation.id,
                  direction: "INBOUND",
                  processedAt: null,
                },
                orderBy: { createdAt: "asc" },
              });
              if (remaining)
                await tx.inboundBuffer.updateMany({
                  where: { conversationId: conversation.id, leaseToken: token },
                  data: {
                    firstAt: remaining.createdAt,
                    leaseUntil: null,
                    leaseToken: null,
                    attempts: 0,
                  },
                });
              else
                await tx.inboundBuffer.deleteMany({
                  where: {
                    conversationId: conversation.id,
                    leaseToken: token,
                    revision: candidate.revision,
                  },
                });
            });
            return "processed";
          } catch (error) {
            if (error instanceof SupersededInboundError) {
              await prisma.inboundBuffer.updateMany({
                where: { conversationId: conversation.id, leaseToken: token },
                data: { leaseUntil: null, leaseToken: null },
              });
              return "superseded";
            }
            await prisma.$transaction(async (tx) => {
              const current = await tx.inboundBuffer.findUnique({
                where: { conversationId: conversation.id },
              });
              if (!current || current.leaseToken !== token) return;
              if (current.attempts >= 2) {
                await tx.conversation.update({
                  where: { id: conversation.id },
                  data: {
                    mode: "HUMAN",
                    handoffReason:
                      "Mesaj işleme üç denemede tamamlanamadı; çalışan kontrolü gerekiyor.",
                  },
                });
                await tx.inboundBuffer.delete({
                  where: { conversationId: conversation.id },
                });
              } else
                await tx.inboundBuffer.update({
                  where: { conversationId: conversation.id },
                  data: {
                    attempts: { increment: 1 },
                    dueAt: new Date(now().getTime() + 10000),
                    leaseUntil: null,
                    leaseToken: null,
                  },
                });
            });
            return "retry_or_handoff";
          }
        }),
      );
    },
  };
}
