import { afterEach, expect, it, vi } from "vitest";
import { createTaskLlm, taskModelConfiguration } from "./task-client";
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    OPENAI_API_KEY: "provider-test",
    LLM_BASE_URL: "https://provider.invalid/v1",
  }),
}));
vi.mock("@/lib/usage/configuration", () => ({
  currentModelConfiguration: async () => ({
    model: "qwen-3.6-35b-sovereign",
    pricing: { configured: false },
  }),
}));
vi.mock("@/lib/usage/record", () => ({ assertUsageBudgetAvailable: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses role overrides without changing the UI model for legacy", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODEL", "claude-sonnet-4-5");
  expect((await taskModelConfiguration("understand")).model).toBe("claude-sonnet-4-5");
  expect((await taskModelConfiguration("legacy")).model).toBe("qwen-3.6-35b-sovereign");
  vi.stubEnv("AI_UNDERSTAND_MODEL", "unknown-model");
  await expect(taskModelConfiguration("understand")).rejects.toThrow();
});
it("sends only gateway credentials with explicit task metadata; no silent direct fallback", async () => {
  vi.stubEnv("AI_GATEWAY", "litellm");
  vi.stubEnv("AI_GATEWAY_KEY", "gateway-test");
  vi.stubEnv("AI_GATEWAY_URL", "http://gateway:4000/v1");
  const fake = vi.fn(async (url, init) => {
    expect(url).toBe("http://gateway:4000/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer gateway-test");
    expect(JSON.parse(init.body).metadata.santa_task).toBe("review");
    throw new Error("gateway offline");
  });
  vi.stubGlobal("fetch", fake);
  const llm = await createTaskLlm("review");
  await expect(
    llm.reviewContext({
      inbound: "Merhaba",
      candidate: "Merhaba",
      history: [],
      profile: {
        name: "Yeni hasta",
        age: null,
        hasTherapyHistory: null,
        availabilityNotes: null,
      },
      stage: "GREETING",
      therapistId: null,
      actions: [],
      calendar: { checked: false, offeredSlots: [] },
      knowledge: [],
    }),
  ).rejects.toThrow();
  expect(fake).toHaveBeenCalledTimes(1);
});
