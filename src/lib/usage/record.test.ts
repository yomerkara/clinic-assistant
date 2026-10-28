import { expect, it, vi, afterEach } from "vitest";
import { recordModelUsage, usageBudgetStart } from "./record";
import { prisma } from "@/lib/prisma";
import { catalogConfiguration, catalogModel } from "./catalog";
vi.mock("@/lib/prisma", () => ({
  prisma: { modelUsage: { create: vi.fn() }, auditEvent: { create: vi.fn() } },
}));
afterEach(() => vi.resetAllMocks());
it("starts budget after reset without carrying a prior month's reset forward", () => {
  const reset = new Date("2026-10-09T10:00:00Z");
  expect(usageBudgetStart(new Date("2026-10-09T11:00:00Z"), reset)).toEqual(reset);
  expect(usageBudgetStart(new Date("2026-11-01T11:00:00Z"), reset)).toEqual(
    new Date("2026-11-01T00:00:00Z"),
  );
  expect(usageBudgetStart(new Date("2026-10-01T11:00:00Z"), reset)).toEqual(
    new Date("2026-10-01T00:00:00Z"),
  );
});
it("records actual per-call pricing and ties the model output to exactly one message", async () => {
  vi.mocked(prisma.modelUsage.create).mockResolvedValue({ id: "usage-one" } as never);
  vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as never);
  await recordModelUsage(
    {
      provider: "openai",
      model: "claude-sonnet-4-5",
      latencyMs: 900,
      pricing: catalogConfiguration(catalogModel("claude-sonnet-4-5")!).pricing,
      usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
      turn: {
        intent: "UNKNOWN",
        confidence: 0,
        reply: "internal",
        entities: {},
        needsHandoff: false,
      },
    },
    {
      conversationId: "conversation",
      messageId: "message",
      task: "understand",
      output: { intents: ["NEW_BOOKING"] },
    },
  );
  const data = vi.mocked(prisma.modelUsage.create).mock.calls[0][0].data;
  expect(Number(data.billedCostUsd)).toBeCloseTo(0.00495, 8);
  expect(data.conversationId).toBe("conversation");
  expect(prisma.auditEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        entityId: "usage-one",
        metadata: expect.objectContaining({
          messageId: "message",
          task: "understand",
          output: { intents: ["NEW_BOOKING"] },
        }),
      }),
    }),
  );
});
it("does not count deterministic code as a model call", async () => {
  await recordModelUsage(
    {
      provider: "fake",
      model: "code",
      latencyMs: 0,
      turn: {
        intent: "UNKNOWN",
        confidence: 1,
        reply: "hello",
        entities: {},
        needsHandoff: false,
      },
    },
    { conversationId: "c", messageId: "m", task: "answer" },
  );
  expect(prisma.modelUsage.create).not.toHaveBeenCalled();
});
