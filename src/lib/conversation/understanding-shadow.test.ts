import { afterEach, expect, it, vi } from "vitest";
import { observeUnderstanding } from "./understanding-shadow";
import { prisma } from "@/lib/prisma";
import { createTaskLlm } from "@/lib/llm/task-client";
vi.mock("@/lib/prisma", () => ({
  prisma: { auditEvent: { findFirst: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/llm/task-client", () => ({ createTaskLlm: vi.fn() }));
vi.mock("@/lib/usage/record", () => ({ recordModelUsage: vi.fn() }));
const input: Parameters<typeof observeUnderstanding>[0] = {
  source: "demo",
  conversationId: "c",
  messageId: "m",
  inbound: "Ben Duru Örnek, EMDR nedir, randevu da istiyorum",
  history: [],
  stage: "INTAKE",
  known: { name: "Yeni hasta", age: null, hasTherapyHistory: null },
  nowIso: "2026-10-08T12:00:00Z",
  codeTurn: {
    intent: "NEW_BOOKING",
    confidence: 1,
    reply: "Adınız?",
    entities: {},
    needsHandoff: false,
  },
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("off and WhatsApp traffic do not call the observer", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "off");
  await observeUnderstanding(input);
  vi.stubEnv("AI_UNDERSTAND_MODE", "shadow");
  await observeUnderstanding({ ...input, source: "whatsapp" });
  expect(createTaskLlm).not.toHaveBeenCalled();
  expect(prisma.auditEvent.findFirst).not.toHaveBeenCalled();
});
it("simple replies are recorded as code-only without paid calls", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "shadow");
  await observeUnderstanding({ ...input, inbound: "29" });
  expect(createTaskLlm).not.toHaveBeenCalled();
  expect(prisma.auditEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ status: "code_only" }),
      }),
    }),
  );
});
it("a model or budget outage cannot reject or change the original decision", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "shadow");
  vi.mocked(createTaskLlm).mockRejectedValue(new Error("budget exhausted"));
  vi.mocked(prisma.auditEvent.create).mockRejectedValue(new Error("storage offline"));
  const before = structuredClone(input);
  await expect(observeUnderstanding(input)).resolves.toBeUndefined();
  expect(input).toEqual(before);
});
it("model output is audit data only and leaves code intent and fields unchanged", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "shadow");
  vi.mocked(createTaskLlm).mockResolvedValue({
    understand: async () => ({
      model: "test",
      latencyMs: 1,
      status: "valid",
      interpretation: {
        intents: ["CANCEL"],
        fields: [{ name: "age", value: 29, evidence: "29" }],
      },
    }),
  } as never);
  const before = structuredClone(input);
  await observeUnderstanding(input);
  expect(input).toEqual(before);
  expect(prisma.auditEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ changedFlow: false }),
      }),
    }),
  );
});
it("active mode returns only validated interpretation without mutating code input", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "active");
  const interpretation = {
    intents: ["NEW_BOOKING"],
    fields: [{ name: "patientName", value: "Duru Örnek", evidence: "Duru Örnek" }],
    questions: [],
    corrections: [],
    needsClarification: false,
    clarification: null,
  };
  vi.mocked(createTaskLlm).mockResolvedValue({
    understand: async () => ({ status: "valid", interpretation }),
  } as never);
  const before = structuredClone(input);
  expect(await observeUnderstanding(input)).toEqual(interpretation);
  expect(input).toEqual(before);
});
it("active mode rejects fabricated fields and falls back to code", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "active");
  vi.mocked(createTaskLlm).mockResolvedValue({
    understand: async () => ({
      status: "valid",
      interpretation: {
        intents: ["NEW_BOOKING"],
        fields: [{ name: "age", value: 29, evidence: "29" }],
        questions: [],
        corrections: [],
        needsClarification: false,
        clarification: null,
      },
    }),
  } as never);
  await expect(observeUnderstanding(input)).resolves.toBeUndefined();
});
it("active mode preserves the cheap numeric reply path", async () => {
  vi.stubEnv("AI_UNDERSTAND_MODE", "active");
  await observeUnderstanding({ ...input, inbound: "30" });
  expect(createTaskLlm).not.toHaveBeenCalled();
});
