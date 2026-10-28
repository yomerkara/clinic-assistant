import { uiReviewExamples } from "@/lib/llm/ui-review-examples";
import { prisma } from "@/lib/prisma";
import { createTaskLlm } from "@/lib/llm/task-client";
import {
  shouldUnderstand,
  validateUnderstanding,
  UNDERSTANDING_VERSION,
  type UnderstandingInput,
} from "@/lib/llm/understanding";
import { recordModelUsage } from "@/lib/usage/record";
import type { LlmTurn } from "@/lib/llm/types";

// Active mode supplies validated language interpretation only. The planner owns
// state transitions; this hook never writes patient, appointment or action records.
export async function observeUnderstanding(
  input: UnderstandingInput & {
    source?: string;
    conversationId: string;
    messageId: string;
    codeTurn: LlmTurn;
  },
) {
  const mode = process.env.AI_UNDERSTAND_MODE;
  if (!["shadow", "active"].includes(mode ?? "") || input.source !== "demo") return;
  const base = {
    version: UNDERSTANDING_VERSION,
    mode,
    changedFlow: mode === "shadow" ? false : undefined,
    hooks: ["beforeUnderstand", "afterUnderstand"],
    datasetVersion: "ui-review-100-v1",
    exampleIds: uiReviewExamples(input.inbound).ids,
  };
  try {
    const previous = await prisma.auditEvent.findFirst({
      where: { action: "assistant.understanding", entityId: input.messageId },
    });
    if (previous) {
      const metadata = previous.metadata as {
        status?: string;
        interpretation?: unknown;
      } | null;
      return mode === "active" && metadata?.status === "valid"
        ? validateUnderstanding(metadata.interpretation, input)
        : undefined;
    }
    const trivial =
      /^(?:\d{1,3}|evet|hayır|hayir|tamam|olur|merhaba|selam|selamlar)[.!\s]*$/iu.test(
        input.inbound.trim(),
      );
    if (mode === "active" ? trivial : !shouldUnderstand(input.inbound)) {
      await prisma.auditEvent.create({
        data: {
          action: "assistant.understanding",
          entityType: "Message",
          entityId: input.messageId,
          metadata: { ...base, status: "code_only" },
        },
      });
      return;
    }
    const llm = await createTaskLlm("understand");
    const result = await llm.understand({
      inbound: input.inbound,
      history: input.history.slice(-8),
      stage: input.stage,
      known: input.known,
      nowIso: input.nowIso,
    });
    await recordModelUsage(
      {
        ...result,
        provider: "openai",
        turn: {
          intent: "UNKNOWN",
          confidence: 0,
          reply: "understanding-shadow",
          entities: {},
          needsHandoff: false,
        },
      },
      {
        conversationId: input.conversationId,
        messageId: input.messageId,
        task: "understand",
        output: result.interpretation ?? { status: result.status },
      },
    );
    const interpretation =
      mode === "active" && result.status === "valid" && result.interpretation
        ? validateUnderstanding(result.interpretation, input)
        : undefined;
    await prisma.auditEvent.create({
      data: {
        action: "assistant.understanding",
        entityType: "Message",
        entityId: input.messageId,
        metadata: JSON.parse(
          JSON.stringify({
            ...base,
            ...result,
            suppliedToPlanner: Boolean(interpretation),
            code: {
              intent: input.codeTurn.intent,
              entities: input.codeTurn.entities,
              requests: input.codeTurn.requests,
            },
          }),
        ),
      },
    });
    return interpretation;
  } catch {
    try {
      await prisma.auditEvent.create({
        data: {
          action: "assistant.understanding",
          entityType: "Message",
          entityId: input.messageId,
          metadata: { ...base, status: "unavailable" },
        },
      });
    } catch {
      /* A failed observer cannot break the conversation. */
    }
  }
}
