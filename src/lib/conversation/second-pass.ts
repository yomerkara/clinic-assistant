// Second interpretation pass over the part of a message the first pass never
// explained. The first pass quotes the text it used, so the leftovers are known
// exactly; only those go to the second model, with the conversation for context.
// A stronger model can be used here through the gateway's review task.
//
// This pass may only ADD interpretation. It never rewrites a reply, never
// changes state and never authorises an action, so a wrong second opinion can
// delay an answer but cannot book, cancel or move an appointment.
import { prisma } from "@/lib/prisma";
import { createTaskLlm } from "@/lib/llm/task-client";
import { recordModelUsage } from "@/lib/usage/record";
import { type UnderstandingInput } from "@/lib/llm/understanding";
import {
  coverageReport,
  type CoverageReport,
  type Understanding,
} from "@/lib/llm/understanding-coverage";
import type { LlmMessage } from "@/lib/llm/types";

export const SECOND_PASS_VERSION = "second-pass-v1";

export const SECOND_PASS_PROMPT = `EK GÖREV: Önceki çözümleme mesajın bir kısmını açıklamadı. Sana açıklanmamış bölümler verilecek. Yalnızca bu bölümlerdeki niyet, soru, alan ve düzeltmeleri çıkar; önceki çözümlemenin doğru bulduğu alanları tekrar üretme. Evidence alıntısı mevcut mesajın tamamından alınabilir ama yalnızca açıklanmamış bölümle ilgili olmalı. Emin değilsen needsClarification true ver ve tahmin üretme.`;

export type SecondPassOutcome = {
  version: typeof SECOND_PASS_VERSION;
  status: "skipped" | "applied" | "no_change" | "unavailable";
  coverage: { ratio: number; uncovered: string[]; reasons: CoverageReport["reasons"] };
  model?: string | null;
  added?: { fields: number; questions: number; corrections: number; intents: number };
};

/** Merges the second reading into the first. Values already present win, so a
 *  second opinion cannot overwrite a field the first pass quoted evidence for. */
export function mergeUnderstanding(
  first: Understanding,
  second: Understanding,
): { merged: Understanding; added: NonNullable<SecondPassOutcome["added"]> } {
  const names = new Set(first.fields.map((field) => field.name));
  const fields = [
    ...first.fields,
    ...second.fields.filter((field) => !names.has(field.name)),
  ];
  const topics = new Set(first.questions.map((question) => question.topic));
  const questions = [
    ...first.questions,
    ...second.questions.filter((question) => !topics.has(question.topic)),
  ];
  const corrected = new Set(first.corrections.map((correction) => correction.field));
  const corrections = [
    ...first.corrections,
    ...second.corrections.filter((correction) => !corrected.has(correction.field)),
  ];
  const intents = [...new Set([...first.intents, ...second.intents])].slice(
    0,
    6,
  ) as Understanding["intents"];
  return {
    merged: {
      intents,
      fields: fields.slice(0, 5),
      questions: questions.slice(0, 6),
      corrections: corrections.slice(0, 5),
      // An unresolved ambiguity from either pass stays unresolved.
      needsClarification: first.needsClarification || second.needsClarification,
      clarification: first.clarification ?? second.clarification,
    },
    added: {
      fields: fields.length - first.fields.length,
      questions: questions.length - first.questions.length,
      corrections: corrections.length - first.corrections.length,
      intents: intents.length - first.intents.length,
    },
  };
}

export async function reviewUncoveredContext(input: {
  enabled: boolean;
  inbound: string;
  history: LlmMessage[];
  stage: string;
  known: UnderstandingInput["known"];
  nowIso: string;
  first: Understanding;
  conversationId: string;
  messageId: string;
}): Promise<{ understanding: Understanding; outcome: SecondPassOutcome }> {
  const coverage = coverageReport(input.inbound, input.first);
  const summary = {
    ratio: Number(coverage.ratio.toFixed(2)),
    uncovered: coverage.uncovered,
    reasons: coverage.reasons,
  };
  if (!input.enabled || !coverage.needsSecondPass)
    return {
      understanding: input.first,
      outcome: { version: SECOND_PASS_VERSION, status: "skipped", coverage: summary },
    };

  try {
    // The review task can point at a stronger model than the first pass.
    const llm = await createTaskLlm("review");
    const understandInput: UnderstandingInput = {
      inbound: input.inbound,
      history: input.history.slice(-8),
      stage: input.stage,
      known: input.known,
      nowIso: input.nowIso,
    };
    const result = await llm.understand(
      understandInput,
      [
        SECOND_PASS_PROMPT,
        `Açıklanmamış bölümler:\n${coverage.uncovered.map((part) => `- ${part}`).join("\n")}`,
      ].join("\n"),
    );
    await recordModelUsage(
      {
        ...result,
        provider: "openai",
        turn: {
          intent: "UNKNOWN",
          confidence: 0,
          reply: SECOND_PASS_VERSION,
          entities: {},
          needsHandoff: false,
        },
      },
      {
        conversationId: input.conversationId,
        messageId: input.messageId,
        task: "review",
        output: result.interpretation ?? { status: result.status },
      },
    ).catch(() => undefined);
    if (result.status !== "valid" || !result.interpretation)
      throw new Error("second pass unusable");
    const second = result.interpretation;
    const { merged, added } = mergeUnderstanding(input.first, second);
    const changed = Object.values(added).some((count) => count > 0);
    await prisma.auditEvent
      .create({
        data: {
          action: "assistant.second_pass",
          entityType: "Message",
          entityId: input.messageId,
          metadata: JSON.parse(
            JSON.stringify({
              version: SECOND_PASS_VERSION,
              coverage: summary,
              model: result.model,
              added,
              before: input.first,
              after: merged,
            }),
          ),
        },
      })
      .catch(() => undefined);
    return {
      understanding: merged,
      outcome: {
        version: SECOND_PASS_VERSION,
        status: changed ? "applied" : "no_change",
        coverage: summary,
        model: result.model,
        added,
      },
    };
  } catch {
    // A failed or unusable second opinion leaves the first reading untouched;
    // the turn continues rather than stalling on an optional check.
    await prisma.auditEvent
      .create({
        data: {
          action: "assistant.second_pass_unavailable",
          entityType: "Message",
          entityId: input.messageId,
          metadata: JSON.parse(
            JSON.stringify({ version: SECOND_PASS_VERSION, coverage: summary }),
          ),
        },
      })
      .catch(() => undefined);
    return {
      understanding: input.first,
      outcome: {
        version: SECOND_PASS_VERSION,
        status: "unavailable",
        coverage: summary,
      },
    };
  }
}
