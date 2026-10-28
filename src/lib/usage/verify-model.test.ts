import { beforeEach, expect, it, vi } from "vitest";
import { OpenAiLlm } from "@/lib/llm/openai";
import { verifyModel } from "./verify-model";
import { catalogModel } from "./catalog";
vi.mock("@/lib/env", () => ({ getEnv: () => ({ OPENAI_API_KEY: "synthetic" }) }));
vi.mock("./record", () => ({
  assertUsageBudgetAvailable: vi.fn(),
  recordModelUsage: vi.fn(),
}));
beforeEach(() => vi.restoreAllMocks());
function mockModel(wrongSensitive = false) {
  let active = 0;
  let maxActive = 0;
  vi.spyOn(OpenAiLlm.prototype, "complete").mockImplementation(async (input) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active--;
    const sensitive = input.inbound.includes("zarar");
    const human = input.inbound.includes("çalışanla");
    return {
      model: "test",
      provider: "openai",
      latencyMs: 0,
      pricing: undefined,
      usage: undefined,
      turn: {
        intent: sensitive
          ? "SENSITIVE_OR_EMERGENCY"
          : human
            ? "HUMAN_REQUEST"
            : "NEW_BOOKING",
        confidence: 0.95,
        reply: "sentetik cevap",
        needsHandoff: sensitive ? !wrongSensitive : human,
        entities: { hasTherapyHistory: false },
      },
    };
  });
  return () => maxActive;
}
it("runs all readiness scenarios sequentially for shared model capacity", async () => {
  const maxActive = mockModel();
  await verifyModel(catalogModel("deepseek-v4-flash-sovereign")!, "synthetic-user");
  expect(OpenAiLlm.prototype.complete).toHaveBeenCalledTimes(4);
  expect(maxActive()).toBe(1);
});
it("still rejects an unsafe handoff result and identifies the failed scenario", async () => {
  mockModel(true);
  await expect(
    verifyModel(catalogModel("deepseek-v4-flash-sovereign")!, "synthetic-user"),
  ).rejects.toThrow("sensitive");
});
