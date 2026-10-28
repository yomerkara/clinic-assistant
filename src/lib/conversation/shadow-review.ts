import { prisma } from "@/lib/prisma";
import { createTaskLlm } from "@/lib/llm/task-client";
import { recordModelUsage } from "@/lib/usage/record";
import { CONTEXT_REVIEW_VERSION } from "@/lib/llm/context-review";
import { demoTherapistKnowledge } from "@/lib/demo/knowledge";
import type { SimulationDiagnosis } from "@/lib/simulator/rules";

// Observation only. Never returns a replacement diagnosis or writes operational state.
export async function observeReply(input: {
  conversationId: string;
  messageId: string;
  inbound: string;
  diagnosis: SimulationDiagnosis;
  demoAdminUserId?: string;
}) {
  if (process.env.CONTEXT_REVIEW !== "shadow") return;
  const started = Date.now();
  const base = { version: CONTEXT_REVIEW_VERSION, mode: "shadow", changedReply: false };
  try {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
      include: { patient: true },
    });
    if (conversation.source !== "demo") return;
    if (
      await prisma.auditEvent.findFirst({
        where: { action: "assistant.context_review", entityId: input.messageId },
      })
    )
      return;
    const [messages, documents, actions, demoProfile] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 14,
      }),
      prisma.knowledgeDocument.findMany({ where: { approvalStatus: "APPROVED" } }),
      prisma.actionRequest.findMany({
        where: { conversationId: conversation.id, status: "PENDING" },
        select: { type: true, status: true },
      }),
      input.demoAdminUserId
        ? prisma.therapistProfile.findUnique({
            where: { userId: input.demoAdminUserId },
            select: { displayName: true },
          })
        : Promise.resolve(null),
    ]);
    const llm = await createTaskLlm("review");
    const inboundIndex = messages.findIndex((m) => m.id === input.messageId);
    const result = await llm.reviewContext({
      inbound: input.inbound,
      candidate: input.diagnosis.outbound,
      history: (inboundIndex < 0 ? [] : messages.slice(inboundIndex + 1))
        .reverse()
        .map((m) => ({
          role: m.direction === "INBOUND" ? "patient" : "assistant",
          text: m.text.slice(0, 2500),
        })),
      profile: {
        name: conversation.patient.displayName,
        age: conversation.patient.age,
        hasTherapyHistory: conversation.patient.hasTherapyHistory,
        availabilityNotes: conversation.patient.availabilityNotes,
      },
      stage: conversation.bookingStage,
      therapistId: conversation.preferredTherapistId,
      calendar: {
        offeredSlots: input.diagnosis.offeredSlots ?? [],
        checked: input.diagnosis.offeredSlots !== undefined,
      },
      actions,
      knowledge: demoTherapistKnowledge(
        "demo",
        demoProfile,
        documents.map((d) => ({
          id: d.id,
          title: d.title,
          content: d.content,
          source: d.sourceUrl ?? d.source,
          version: d.version,
        })),
      ),
    });
    await recordModelUsage(
      {
        ...result,
        provider: "openai",
        turn: {
          intent: "UNKNOWN",
          confidence: 0,
          reply: "shadow-review",
          entities: {},
          needsHandoff: false,
        },
      },
      {
        conversationId: conversation.id,
        messageId: input.messageId,
        task: "review",
        output: result.verdict ?? { status: result.status },
      },
    );
    await prisma.auditEvent.create({
      data: {
        action: "assistant.context_review",
        entityType: "Message",
        entityId: input.messageId,
        metadata: JSON.parse(
          JSON.stringify({ ...base, ...result, elapsedMs: Date.now() - started }),
        ),
      },
    });
  } catch {
    // Do not leak transport errors, credentials or patient text to logs.
    try {
      await prisma.auditEvent.create({
        data: {
          action: "assistant.context_review",
          entityType: "Message",
          entityId: input.messageId,
          metadata: { ...base, status: "unavailable", elapsedMs: Date.now() - started },
        },
      });
    } catch {
      /* Audit storage failure must not stop the original conversation. */
    }
  }
}
