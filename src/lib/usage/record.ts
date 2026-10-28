import { Prisma } from "@prisma/client";
import { tierConfiguration, type PricingSnapshot } from "./tiers";
import { currentModelConfiguration } from "./configuration";
import { prisma } from "@/lib/prisma";
import type { LlmCompleteResult } from "@/lib/llm/types";

export async function usagePricing() {
  const { pricing } = await currentModelConfiguration();
  return {
    inputPerMillion: pricing.customerInput,
    outputPerMillion: pricing.customerOutput,
    configured: pricing.configured,
  };
}

export function currentMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function usageBudgetStart(now: Date, resetAt?: Date | null) {
  const month = currentMonthStart(now);
  return resetAt && resetAt > month && resetAt <= now ? resetAt : month;
}

export async function getUsageBudgetStatus(now = new Date()) {
  const settings = await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", monthlyUsageLimitUsd: 50 },
    update: {},
  });
  const from = usageBudgetStart(now, settings.usageResetAt);
  const aggregate = await prisma.modelUsage.aggregate({
    where: { createdAt: { gte: from } },
    _sum: { billedCostUsd: true },
  });
  const spentUsd = Number(aggregate._sum.billedCostUsd ?? 0);
  const limitUsd = settings.monthlyUsageLimitUsd;
  return {
    from,
    resetAt: settings.usageResetAt,
    spentUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - spentUsd),
    ratio: limitUsd > 0 ? spentUsd / limitUsd : 1,
    exceeded: spentUsd >= limitUsd,
  };
}

export class UsageBudgetExceededError extends Error {
  constructor() {
    super("Aylık AI kullanım limiti doldu");
    this.name = "UsageBudgetExceededError";
  }
}

export async function assertUsageBudgetAvailable(snapshot?: PricingSnapshot) {
  const pricing = snapshot ?? (await usagePricing());
  if (!pricing.configured) return;
  const budget = await getUsageBudgetStatus();
  if (budget.exceeded) throw new UsageBudgetExceededError();
}

export async function recordModelUsage(
  result: LlmCompleteResult,
  context: {
    userId?: string | null;
    therapistId?: string | null;
    conversationId?: string | null;
    messageId?: string;
    task?: "understand" | "answer" | "review" | "safety" | "grounding" | "legacy";
    output?: unknown;
  },
) {
  if (result.provider === "fake" || !result.usage) return;
  const pricing = result.pricing ?? tierConfiguration().pricing;
  const amount = (input: number, output: number) =>
    new Prisma.Decimal(result.usage!.inputTokens)
      .mul(input)
      .add(new Prisma.Decimal(result.usage!.outputTokens).mul(output))
      .div(1_000_000)
      .toDecimalPlaces(8);
  const estimatedCostUsd = pricing.providerConfigured
    ? amount(pricing.providerInput, pricing.providerOutput).toNumber()
    : 0;
  const billedCostUsd = pricing.configured
    ? amount(pricing.customerInput, pricing.customerOutput)
    : null;

  const usage = await prisma.modelUsage.create({
    data: {
      userId: context.userId ?? null,
      therapistId: context.therapistId ?? null,
      conversationId: context.conversationId ?? null,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      estimatedCostUsd,
      billedCostUsd,
      tier: pricing.tier,
      tariffVersion: pricing.version,
      pricingSnapshot: pricing,
    },
  });
  if (context.messageId && context.task) {
    // Keep the measured usage even if optional trace storage is unavailable.
    // Only structured output/reply is supplied; never store credentials or hidden reasoning.
    await prisma.auditEvent
      .create({
        data: {
          action: "assistant.model_call",
          entityType: "ModelUsage",
          entityId: usage.id,
          metadata: JSON.parse(
            JSON.stringify({
              version: "model-call-v1",
              conversationId: context.conversationId,
              messageId: context.messageId,
              task: context.task,
              model: result.model,
              latencyMs: result.latencyMs > 0 ? result.latencyMs : null,
              output: context.output ?? result.turn.reply,
            }),
          ),
        },
      })
      .catch(() => undefined);
  }
  return usage;
}
