import { verifyDiagnosis } from "@/lib/llm/verify-diagnosis";
import { createTaskLlm } from "@/lib/llm/task-client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { FakeLlm } from "@/lib/llm/fake";
import { OpenAiLlm } from "@/lib/llm/openai";
import { ModelCallError, type KnowledgeSnippet, type LlmPort } from "@/lib/llm/types";
import {
  appointmentsSummary,
  buildFixture,
  defaultConditions,
  simulationConditionsSchema,
  type SimulationConditions,
} from "@/lib/simulator/conditions";
import {
  applyClinicRules,
  buildAbuseDiagnosis,
  buildHumanRequestDiagnosis,
  buildScopeGuardDiagnosis,
  type SimulationDiagnosis,
} from "@/lib/simulator/rules";
import { decideScope } from "@/lib/simulator/scope";
import { isAbuseMessage, isHumanRequest } from "@/lib/conversation/guardrails";
import {
  consecutiveLowUnknownCount,
  finalizeOutbound,
  HISTORY_MESSAGES,
} from "@/lib/conversation/style";
import { recordModelUsage } from "@/lib/usage/record";

/** One simulated message, matching the demo studio's ceiling. */
export const SIMULATOR_MESSAGE_LIMIT = 4000;
/** The stored thread keeps only recent turns: the model reads the last few and
 *  an unbounded history would grow the row and the admin payload forever. */
export const SIMULATOR_TURN_LIMIT = 40;

/** Keeps the most recent turns so the stored row and the admin payload stay bounded. */
export function keepRecentTurns<T>(turns: T[], limit = SIMULATOR_TURN_LIMIT): T[] {
  return turns.length > limit ? turns.slice(-limit) : turns;
}

export type SimulationThreadView = {
  conditions: SimulationConditions;
  turns: SimulationDiagnosis[];
};

function parseThread(
  raw: { conditions: unknown; turns: unknown } | null,
): SimulationThreadView {
  const parsed = raw
    ? simulationConditionsSchema.parse(raw.conditions)
    : defaultConditions();
  return {
    conditions: { ...parsed, provider: "openai" },
    turns: Array.isArray(raw?.turns) ? (raw.turns as SimulationDiagnosis[]) : [],
  };
}

export async function loadSimulationThread(
  adminUserId: string,
): Promise<SimulationThreadView> {
  const row = await prisma.simulationThread.findUnique({ where: { adminUserId } });
  return parseThread(row);
}

export async function saveConditions(
  adminUserId: string,
  patch: Partial<SimulationConditions>,
) {
  const current = await loadSimulationThread(adminUserId);
  const conditions = simulationConditionsSchema.parse({
    ...current.conditions,
    ...patch,
    provider: "openai",
  });
  await prisma.simulationThread.upsert({
    where: { adminUserId },
    create: { adminUserId, conditions, turns: current.turns as Prisma.InputJsonValue },
    update: { conditions },
  });
  return { conditions, turns: current.turns };
}

export async function resetSimulation(adminUserId: string) {
  const current = await loadSimulationThread(adminUserId);
  await prisma.simulationThread.upsert({
    where: { adminUserId },
    create: { adminUserId, conditions: current.conditions, turns: [] },
    update: { turns: [] },
  });
  return { conditions: current.conditions, turns: [] as SimulationDiagnosis[] };
}

async function saveTurns(
  adminUserId: string,
  conditions: SimulationConditions,
  turns: SimulationDiagnosis[],
) {
  const kept = keepRecentTurns(turns);
  await prisma.simulationThread.upsert({
    where: { adminUserId },
    create: { adminUserId, conditions, turns: kept as Prisma.InputJsonValue },
    update: { turns: kept as Prisma.InputJsonValue },
  });
  return { conditions, turns: kept };
}

export async function addSimulationTurn(
  adminUserId: string,
  inbound: string,
): Promise<SimulationThreadView> {
  const text = inbound.trim();
  if (!text) {
    throw new Error("empty");
  }
  if (text.length > SIMULATOR_MESSAGE_LIMIT) {
    throw new Error("too_long");
  }
  const current = await loadSimulationThread(adminUserId);
  const now = new Date();
  const conditions = { ...current.conditions, nowAt: now.toISOString() };
  const env = getEnv();
  const recentTurns = current.turns.slice(-Math.ceil(HISTORY_MESSAGES / 2));
  const context = recentTurns.flatMap((turn) => [turn.inbound, turn.outbound]);

  if (isAbuseMessage(text)) {
    const diagnosis = buildAbuseDiagnosis({ inbound: text, now, model: env.LLM_MODEL });
    diagnosis.outbound = finalizeOutbound(diagnosis.outbound, text);
    return saveTurns(adminUserId, conditions, [...current.turns, diagnosis]);
  }
  if (isHumanRequest(text)) {
    const diagnosis = buildHumanRequestDiagnosis({
      inbound: text,
      now,
      model: env.LLM_MODEL,
    });
    diagnosis.outbound = finalizeOutbound(diagnosis.outbound, text);
    return saveTurns(adminUserId, conditions, [...current.turns, diagnosis]);
  }

  const scope = decideScope(text, context);
  if (scope.kind === "out_of_scope") {
    const diagnosis = buildScopeGuardDiagnosis({
      inbound: text,
      now,
      model: env.LLM_MODEL,
      greeting: false,
      reason: scope.reason,
    });
    diagnosis.outbound = finalizeOutbound(diagnosis.outbound, text);
    return saveTurns(adminUserId, conditions, [...current.turns, diagnosis]);
  }
  if (conditions.scenario === "model_fail") {
    throw new ModelCallError("Çözümleme yapılamadı", "zaman aşımı · 30 s · intent-v3");
  }

  const knowledge = await loadKnowledge(conditions.scenario === "missing_knowledge");
  const fixture = buildFixture(conditions);
  const llm = await createLlm(conditions.provider);
  const history = recentTurns.flatMap((turn) => [
    { role: "patient" as const, text: turn.inbound },
    { role: "assistant" as const, text: turn.outbound },
  ]);
  const llmResult = await llm.complete({
    history,
    inbound: text,
    nowIso: conditions.nowAt,
    appointmentsSummary: appointmentsSummary(fixture),
    knowledge,
    modelVersion: conditions.modelVersion,
  });
  await recordModelUsage(llmResult, { userId: adminUserId }).catch(() => undefined);

  let diagnosis = applyClinicRules({
    llm: llmResult,
    inbound: text,
    fixture,
    now,
    timeZone: env.APP_TIMEZONE,
    calendarAvailable:
      conditions.calendar === "available" && conditions.scenario !== "calendar_down",
    knowledge,
    emergencyText: env.CLINIC_EMERGENCY_TEXT,
    unknownStreak: consecutiveLowUnknownCount(current.turns),
  });
  if (llm instanceof OpenAiLlm)
    diagnosis = await verifyDiagnosis(
      diagnosis,
      llm,
      knowledge,
      { userId: adminUserId },
      history,
    );
  diagnosis.outbound = finalizeOutbound(diagnosis.outbound, text);
  return saveTurns(adminUserId, conditions, [...current.turns, diagnosis]);
}

async function loadKnowledge(hideAll: boolean): Promise<KnowledgeSnippet[]> {
  if (hideAll) {
    return [];
  }
  const docs = await prisma.knowledgeDocument.findMany({
    where: { approvalStatus: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    source: doc.sourceUrl ?? doc.source,
    version: doc.version,
  }));
}

async function createLlm(provider: SimulationConditions["provider"]): Promise<LlmPort> {
  if (provider === "fake") {
    return new FakeLlm();
  }
  return createTaskLlm("legacy");
}
