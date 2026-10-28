import { EMDR_DEFINITION } from "./general-definitions";
import { expect, it } from "vitest";
import { applyClinicRules } from "@/lib/simulator/rules";
import { llmTurnSchema, type LlmTurn } from "@/lib/llm/types";

const directory = {
  id: "kd_therapists",
  title: "Terapistler",
  content: "Merve Nur Akıl EMDR ile çalışır. Hazal Gül Akkuş aile danışmanlığı sunar.",
  source: "synthetic",
  version: 1,
};
function run(extra: Partial<LlmTurn> = {}, text?: string) {
  const turn: LlmTurn = {
    intent: "NEW_BOOKING",
    confidence: 0.95,
    reply: "Model cevabı",
    entities: {},
    needsHandoff: false,
    ...extra,
  };
  return applyClinicRules({
    llm: { turn, provider: "fake", model: "test", latencyMs: 0 },
    inbound:
      text ??
      "İlk randevum olacak, terapistleriniz hakkında bilgi alabilir miyim ve ücretler hakkında?",
    now: new Date("2026-10-07T14:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: false,
    knowledge: [directory],
    fixture: {
      patients: [{ name: "Elifnur", phone: "synthetic" }],
      appointments: [],
      intake: {
        hasFullName: false,
        age: null,
        hasTherapyHistory: null,
        availabilityNotes: null,
        alternativeDaysOkay: null,
      },
    },
  });
}
it("composes the directory and fee request before intake, without model-written service claims", () => {
  const result = run({
    requests: [
      { kind: "THERAPIST_INFO", answer: "Uydurma uzman" },
      { kind: "PRICE_REQUEST" },
      { kind: "NEW_BOOKING" },
    ],
  });
  expect(result.outbound).toContain(directory.content);
  expect(result.outbound).toContain("Güncel seans ücretini");
  expect(result.outbound).not.toContain("Uydurma");
  expect(result.outbound).not.toContain("soyadınızı");
  expect(result.outbound.match(/\?/g)).toHaveLength(1);
  expect(result.action?.type).toBe("PRICE_REQUEST");
  expect(result.botStopped).toBe(false);
  expect(result.routing).toEqual([
    { kind: "THERAPIST_INFO", handler: "approved_source", sourceId: "kd_therapists" },
    { kind: "PRICE_REQUEST", handler: "code" },
    { kind: "NEW_BOOKING", handler: "code" },
  ]);
});
it("answers a therapy question before asking for the surname even if the calendar is offline", () => {
  const result = run(
    {
      requests: [
        { kind: "THERAPY_INFO", answer: "EMDR genel bir psikoterapi yaklaşımıdır." },
        { kind: "NEW_BOOKING" },
      ],
      entities: { therapistName: "Merve Nur Akıl" },
    },
    "Merve ile randevu alacağım, EMDR nedir?",
  );
  expect(result.outbound).toContain(EMDR_DEFINITION);
  expect(result.outbound).toContain("soyadınızı");
  expect(result.botStopped).toBe(false);
  expect(result.action).toBeNull();
});
it("keeps invoice and fee requests separately and deduplicates repeated handler selections", () => {
  const result = run({
    intent: "INVOICE_REQUEST",
    requests: [
      { kind: "PRICE_REQUEST" },
      { kind: "INVOICE_REQUEST" },
      { kind: "PRICE_REQUEST" },
    ],
  });
  expect(
    [result.action?.type, ...result.additionalActions!.map((a) => a.type)].sort(),
  ).toEqual(["INVOICE_REQUEST", "PRICE_REQUEST"]);
  expect(result.outbound).toContain("Fatura talebinizi");
  expect(result.outbound).toContain("Güncel seans ücretini");
});
it.each(["SENSITIVE_OR_EMERGENCY", "HUMAN_REQUEST", "UNKNOWN"] as const)(
  "cannot bypass exclusive intent %s",
  (intent) => {
    const result = run({
      intent,
      requests: [{ kind: "PRICE_REQUEST" }, { kind: "INVOICE_REQUEST" }],
    });
    expect(result.routing).toBeUndefined();
    expect(result.action).toBeNull();
    expect(result.additionalActions).toBeUndefined();
  },
);
it("does not execute low-confidence requests", () => {
  expect(
    run({ confidence: 0.4, requests: [{ kind: "PRICE_REQUEST" }] }).action,
  ).toBeNull();
});
it("rejects arbitrary handler names in model output", () => {
  expect(() =>
    llmTurnSchema.parse({
      intent: "NEW_BOOKING",
      confidence: 1,
      reply: "x",
      requests: [{ kind: "WRITE_CALENDAR" }],
    }),
  ).toThrow();
});

it("handles operational requests before intake regardless of model ordering", () => {
  const result = run(
    { requests: [{ kind: "NEW_BOOKING" }, { kind: "INVOICE_REQUEST" }] },
    "Yeni randevu alacağım, önce faturamı iletir misiniz?",
  );
  expect(result.action?.type).toBe("INVOICE_REQUEST");
  expect(result.outbound).toContain("Fatura talebinizi");
  expect(result.outbound).not.toContain("soyadınızı");
  expect(result.botStopped).toBe(false);
});

it("does not attach an unrelated document by a shared title word to general psychoeducation", () => {
  const result = run(
    {
      intent: "THERAPY_INFO",
      requests: [{ kind: "THERAPY_INFO", answer: "EMDR bir psikoterapi yaklaşımıdır." }],
    },
    "Terapistler EMDR derken neyi kastediyor?",
  );
  expect(result.knowledge).toBeNull();
  expect(result.routing?.[0].handler).toBe("ai");
  expect(result.botStopped).toBe(false);
});

it("uses a neutral definition for EMDR, keeps the time preference and drops an irrelevant source", () => {
  const result = run(
    {
      entities: { date: "2026-10-08", time: "19:00" },
      requests: [
        {
          kind: "THERAPY_INFO",
          knowledgeDocId: "kd_therapists",
          answer: "EMDR kesin iyileştirir.",
        },
        { kind: "NEW_BOOKING" },
      ],
    },
    "yarın saat 19 bu arada EMDR nedir?",
  );
  expect(result.outbound).toContain(EMDR_DEFINITION);
  expect(result.outbound).not.toContain("kesin iyileştirir");
  expect(result.entities.time).toBe("19:00");
  expect(result.knowledge).toBeNull();
  expect(result.routing?.[0]).toEqual({ kind: "THERAPY_INFO", handler: "code" });
});
