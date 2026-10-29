import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, usage } = vi.hoisted(() => ({ create: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { create } } }));
vi.mock("@/lib/usage/record", () => ({ recordModelUsage: usage }));
const { understand, createTaskLlm } = vi.hoisted(() => ({
  understand: vi.fn(),
  createTaskLlm: vi.fn(),
}));
vi.mock("@/lib/llm/task-client", () => ({ createTaskLlm }));

import {
  mergeUnderstanding,
  reviewUncoveredContext,
  SECOND_PASS_VERSION,
} from "./second-pass";
import type { Understanding } from "@/lib/llm/understanding-coverage";

beforeEach(() => {
  vi.clearAllMocks();
  // Audit writing and usage recording are awaited with .catch(), so the mocks
  // must behave like promises.
  create.mockResolvedValue({});
  usage.mockResolvedValue(undefined);
});

const base: Understanding = {
  intents: ["NEW_BOOKING"],
  fields: [],
  questions: [],
  corrections: [],
  needsClarification: false,
  clarification: null,
};
const u = (patch: Partial<Understanding>): Understanding => ({ ...base, ...patch });

describe("mergeUnderstanding", () => {
  it("adds what the second pass found", () => {
    const { merged, added } = mergeUnderstanding(
      u({ fields: [{ name: "patientName", value: "Ali Deneme", evidence: "Ali Deneme" }] }),
      u({ questions: [{ topic: "PRICE_REQUEST", evidence: "ücret ne kadar" }] }),
    );
    expect(merged.fields).toHaveLength(1);
    expect(merged.questions).toHaveLength(1);
    expect(added.questions).toBe(1);
  });

  it("never lets the second opinion overwrite a field the first pass quoted", () => {
    const { merged, added } = mergeUnderstanding(
      u({ fields: [{ name: "age", value: 29, evidence: "29" }] }),
      u({ fields: [{ name: "age", value: 35, evidence: "35" }] }),
    );
    expect(merged.fields).toHaveLength(1);
    expect(merged.fields[0]!.value).toBe(29);
    expect(added.fields).toBe(0);
  });

  it("keeps an unresolved ambiguity from either pass", () => {
    expect(
      mergeUnderstanding(u({}), u({ needsClarification: true, clarification: "16:00 mı?" }))
        .merged.needsClarification,
    ).toBe(true);
    expect(
      mergeUnderstanding(u({ needsClarification: true, clarification: "a" }), u({}))
        .merged.needsClarification,
    ).toBe(true);
  });

  it("unions intents without duplicating them", () => {
    const { merged } = mergeUnderstanding(
      u({ intents: ["NEW_BOOKING"] }),
      u({ intents: ["NEW_BOOKING", "PRICE_REQUEST"] }),
    );
    expect(merged.intents).toEqual(["NEW_BOOKING", "PRICE_REQUEST"]);
  });

  it("respects the schema's maximum counts", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      topic: "OTHER" as const,
      evidence: `soru ${i}`,
    }));
    const { merged } = mergeUnderstanding(u({}), u({ questions: many }));
    expect(merged.questions.length).toBeLessThanOrEqual(6);
  });
});

const call = (over: Partial<Parameters<typeof reviewUncoveredContext>[0]> = {}) =>
  reviewUncoveredContext({
    enabled: true,
    inbound: "Yarın 16:00 randevu istiyorum bir de ücret ne kadar",
    history: [],
    stage: "INTAKE",
    known: { name: "Ali Deneme", age: 29, hasTherapyHistory: false },
    nowIso: "2026-10-29T09:00:00.000Z",
    first: u({
      fields: [
        {
          name: "availabilityNotes",
          value: "Yarın 16:00",
          evidence: "Yarın 16:00 randevu istiyorum",
        },
      ],
    }),
    conversationId: "conv_1",
    messageId: "msg_1",
    ...over,
  });

describe("reviewUncoveredContext", () => {
  it("does nothing when the feature is off, even with uncovered text", async () => {
    const { outcome, understanding } = await call({ enabled: false });
    expect(outcome.status).toBe("skipped");
    expect(outcome.coverage.uncovered[0]).toContain("ücret");
    expect(createTaskLlm).not.toHaveBeenCalled();
    expect(understanding.questions).toHaveLength(0);
  });

  it("does not call a model when the first pass explained everything", async () => {
    const { outcome } = await call({
      inbound: "Ali Deneme",
      first: u({ fields: [{ name: "patientName", value: "Ali Deneme", evidence: "Ali Deneme" }] }),
    });
    expect(outcome.status).toBe("skipped");
    expect(createTaskLlm).not.toHaveBeenCalled();
  });

  it("asks the review model only about the part nobody explained", async () => {
    understand.mockResolvedValue({
      status: "valid",
      model: "stronger-model",
      interpretation: u({
        intents: ["PRICE_REQUEST"],
        questions: [{ topic: "PRICE_REQUEST", evidence: "ücret ne kadar" }],
      }),
    });
    createTaskLlm.mockResolvedValue({ understand });
    const { outcome, understanding } = await call();
    expect(createTaskLlm).toHaveBeenCalledWith("review");
    const instruction = understand.mock.calls.at(-1)?.[1] as string;
    expect(instruction).toContain("Açıklanmamış bölümler");
    expect(instruction).toContain("ücret");
    expect(instruction).not.toContain("Yarın 16:00 randevu istiyorum");
    expect(outcome.status).toBe("applied");
    expect(outcome.model).toBe("stronger-model");
    expect(understanding.questions).toHaveLength(1);
    expect(understanding.intents).toContain("PRICE_REQUEST");
  });

  it("reports no change when the second reading adds nothing", async () => {
    understand.mockResolvedValue({ status: "valid", model: "m", interpretation: u({}) });
    createTaskLlm.mockResolvedValue({ understand });
    const { outcome } = await call();
    expect(outcome.status).toBe("no_change");
  });

  it("keeps the first reading when the second pass is unusable", async () => {
    understand.mockResolvedValue({ status: "invalid", interpretation: null });
    createTaskLlm.mockResolvedValue({ understand });
    const { outcome, understanding } = await call();
    expect(outcome.status).toBe("unavailable");
    expect(understanding.fields).toHaveLength(1);
    expect(understanding.questions).toHaveLength(0);
  });

  it("keeps the first reading when the model call throws", async () => {
    createTaskLlm.mockRejectedValue(new Error("gateway down"));
    const { outcome, understanding } = await call();
    expect(outcome.status).toBe("unavailable");
    expect(understanding.fields).toHaveLength(1);
  });

  it("always reports the measured coverage, whatever happened", async () => {
    createTaskLlm.mockRejectedValue(new Error("down"));
    const { outcome } = await call();
    expect(outcome.version).toBe(SECOND_PASS_VERSION);
    expect(outcome.coverage.ratio).toBeLessThan(1);
    expect(outcome.coverage.reasons).toContain("uncovered_clause");
  });
});
