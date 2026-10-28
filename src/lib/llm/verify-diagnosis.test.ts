import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyDiagnosis } from "./verify-diagnosis";
import { assertUsageBudgetAvailable, recordModelUsage } from "@/lib/usage/record";
import { CONTENT_SAFETY_VERSION } from "./content-safety";
import { assistantIntentSchema } from "./types";
import {
  BOOKING_ACKNOWLEDGEMENT,
  INVOICE_REQUEST_REPLY,
  CALENDAR_UNAVAILABLE_REPLY,
} from "@/lib/conversation/administrative-replies";
import { applyClinicRules, type SimulationDiagnosis } from "@/lib/simulator/rules";
import { buildFixture, defaultConditions } from "@/lib/simulator/conditions";
vi.mock("@/lib/usage/record", () => ({
  assertUsageBudgetAvailable: vi.fn(),
  recordModelUsage: vi.fn(),
}));
const candidate = (extra: Partial<SimulationDiagnosis> = {}): SimulationDiagnosis => ({
  id: "probe",
  inbound: "Terapi nedir?",
  outbound: "Aday cevap",
  createdAt: new Date().toISOString(),
  intent: "THERAPY_INFO",
  intentLabel: "Terapi bilgisi",
  confidence: 1,
  entities: {},
  knowledge: null,
  action: null,
  handoff: null,
  botStopped: false,
  rules: [],
  raw: {},
  latencyMs: 0,
  model: "test",
  promptVersion: "test",
  provider: "openai",
  ...extra,
});
const verifier = () => ({
  verifyContentSafety: vi
    .fn()
    .mockResolvedValue({ safe: true, requiresGrounding: false, issues: [] }),
  verifyGrounding: vi
    .fn()
    .mockResolvedValue({ supported: true, evidence: [], reason: "test" }),
});
beforeEach(() => vi.resetAllMocks());
describe("mandatory candidate safety boundary", () => {
  it("keeps an invoice action despite a spurious grounding requirement", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    const invoice = candidate({
      intent: "INVOICE_REQUEST",
      outbound: INVOICE_REQUEST_REPLY,
      action: {
        id: "invoice-test",
        type: "INVOICE_REQUEST",
        status: "PENDING",
        currentLabel: "Fatura talebi",
        proposedLabel: "Kontrol bekliyor",
        therapistName: "Hazal Gül Akkuş",
      },
    });
    const result = await verifyDiagnosis(invoice, llm, [], {});
    expect(result.action?.type).toBe("INVOICE_REQUEST");
    expect(result.botStopped).toBe(false);
    expect(llm.verifyContentSafety).toHaveBeenCalledOnce();
    expect(llm.verifyGrounding).not.toHaveBeenCalled();
  });
  it("does not exempt invoice text that claims delivery or adds unsupported facts", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    await verifyDiagnosis(
      candidate({
        intent: "INVOICE_REQUEST",
        outbound: INVOICE_REQUEST_REPLY + " Faturanızı e-posta ile gönderdim.",
      }),
      llm,
      [],
      {},
    );
    expect(llm.verifyGrounding).toHaveBeenCalledOnce();
  });
  it("preserves the real calendar outage reason instead of replacing it with missing sources", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    const result = await verifyDiagnosis(
      candidate({
        intent: "NEW_BOOKING",
        outbound: CALENDAR_UNAVAILABLE_REPLY,
        botStopped: true,
        handoff: { reason: "Google Calendar erişimi yok" },
      }),
      llm,
      [],
      {},
    );
    expect(result.handoff?.reason).toContain("Calendar");
    expect(result.outbound).toBe(CALENDAR_UNAVAILABLE_REPLY);
    expect(llm.verifyGrounding).not.toHaveBeenCalled();
  });
  it("does not spend a grounding call on an exact application-owned status message", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    const result = await verifyDiagnosis(
      candidate({ intent: "NEW_BOOKING", outbound: BOOKING_ACKNOWLEDGEMENT }),
      llm,
      [],
      {},
    );
    expect(result.botStopped).toBe(false);
    expect(llm.verifyContentSafety).toHaveBeenCalledOnce();
    expect(llm.verifyGrounding).not.toHaveBeenCalled();
  });
  it("still blocks an unsafe context even with an exact administrative message", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: false,
      requiresGrounding: false,
      issues: ["unsafe_crisis_response"],
    });
    const result = await verifyDiagnosis(
      candidate({ intent: "NEW_BOOKING", outbound: BOOKING_ACKNOWLEDGEMENT }),
      llm,
      [],
      {},
    );
    expect(result.botStopped).toBe(true);
  });
  it("does not exempt appended institutional claims from grounding", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    await verifyDiagnosis(
      candidate({
        intent: "NEW_BOOKING",
        outbound: BOOKING_ACKNOWLEDGEMENT + " EMDR hizmetimiz var.",
      }),
      llm,
      [],
      {},
    );
    expect(llm.verifyGrounding).toHaveBeenCalledOnce();
  });
  it.each(assistantIntentSchema.options)(
    "blocks unsafe %s independently of intent/confidence",
    async (intent) => {
      const llm = verifier();
      llm.verifyContentSafety.mockResolvedValue({
        safe: false,
        requiresGrounding: false,
        issues: ["personal_treatment"],
      });
      const result = await verifyDiagnosis(candidate({ intent }), llm, [], {});
      expect(result.outbound).not.toContain("Aday cevap");
      expect(result.botStopped).toBe(true);
      expect(result.contentSafety?.status).toBe("blocked");
      expect(llm.verifyGrounding).not.toHaveBeenCalled();
    },
  );
  it("allows safe general psychoeducation without inventing a source requirement", async () => {
    const llm = verifier();
    const result = await verifyDiagnosis(candidate(), llm, [], {});
    expect(result.outbound).toBe("Aday cevap");
    expect(result.contentSafety?.status).toBe("passed");
    expect(llm.verifyGrounding).not.toHaveBeenCalled();
    expect(recordModelUsage).toHaveBeenCalledOnce();
  });
  it.each(["handoff", "action"])("does not bypass safety for %s", async (kind) => {
    const input = candidate(
      kind === "handoff"
        ? { handoff: { reason: "already handed off" }, botStopped: true }
        : {
            action: {
              id: "a",
              type: "CANCEL",
              status: "PENDING",
              currentLabel: "",
              proposedLabel: "",
              therapistName: "",
            },
          },
    );
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: false,
      requiresGrounding: false,
      issues: ["medication_advice"],
    });
    const result = await verifyDiagnosis(input, llm, [], {});
    expect(result.action).toBeNull();
    expect(result.outbound).not.toBe(input.outbound);
  });
  it("requires grounding for institutional claims even under THERAPY_INFO", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: true,
      requiresGrounding: true,
      issues: [],
    });
    llm.verifyGrounding.mockResolvedValue({
      supported: false,
      evidence: [],
      reason: "no source",
    });
    const result = await verifyDiagnosis(candidate(), llm, [], {});
    expect(result.botStopped).toBe(true);
    expect(result.grounding?.supported).toBe(false);
  });
  it("source approval cannot override a safety rejection", async () => {
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: false,
      requiresGrounding: true,
      issues: ["personal_diagnosis"],
    });
    const result = await verifyDiagnosis(
      candidate({ knowledge: { id: "k", source: "s", title: "t", version: 1 } }),
      llm,
      [],
      {},
    );
    expect(result.botStopped).toBe(true);
    expect(llm.verifyGrounding).not.toHaveBeenCalled();
  });
  it.each(["timeout", "malformed", "budget", "usage-log"])(
    "fails closed on %s",
    async (failure) => {
      const llm = verifier();
      if (failure === "budget")
        vi.mocked(assertUsageBudgetAvailable).mockRejectedValue(new Error("budget"));
      else if (failure === "usage-log")
        vi.mocked(recordModelUsage).mockRejectedValue(new Error("database"));
      else llm.verifyContentSafety.mockRejectedValue(new Error(failure));
      const result = await verifyDiagnosis(candidate(), llm, [], {});
      expect(result.contentSafety?.status).toBe("unavailable");
      expect(result.contentSafety?.failureStage).toBe(
        failure === "budget"
          ? "budget"
          : failure === "usage-log"
            ? "usage_recording"
            : "verifier",
      );
      expect(result.botStopped).toBe(true);
      expect(result.action).toBeNull();
      if (failure === "budget") expect(llm.verifyContentSafety).not.toHaveBeenCalled();
    },
  );
  it("forwards recent context and rechecks a previously approved cached answer", async () => {
    const llm = verifier();
    const history = [{ role: "patient" as const, text: "önceki riskli bağlam" }];
    await verifyDiagnosis(
      candidate({
        provider: "fake",
        raw: { faqCacheHit: true },
        contentSafety: { version: CONTENT_SAFETY_VERSION, status: "passed", issues: [] },
      }),
      llm,
      [],
      {},
      history,
    );
    expect(llm.verifyContentSafety).toHaveBeenCalledWith(
      "Aday cevap",
      "Terapi nedir?",
      history,
    );
  });
  it("reproduces the audited source-free therapy branch and blocks its unchecked candidate", async () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const diagnosis = applyClinicRules({
      llm: {
        provider: "openai",
        model: "test",
        latencyMs: 0,
        turn: {
          intent: "THERAPY_INFO",
          confidence: 1,
          reply: "AUDIT_UNSAFE_CANDIDATE",
          entities: {},
          needsHandoff: false,
        },
      },
      inbound: "Terapi nedir?",
      now,
      timeZone: "Europe/Istanbul",
      calendarAvailable: true,
      knowledge: [],
      fixture: buildFixture(defaultConditions(now)),
    });
    expect(diagnosis.rules.join(" ")).not.toContain("önerisi verilmedi");
    const llm = verifier();
    llm.verifyContentSafety.mockResolvedValue({
      safe: false,
      requiresGrounding: false,
      issues: ["personal_treatment"],
    });
    const result = await verifyDiagnosis(diagnosis, llm, [], {});
    expect(result.outbound).not.toContain("AUDIT_UNSAFE_CANDIDATE");
  });
});

it("requires evidence for information attached to a price request and clears unsupported actions", async () => {
  const llm = verifier();
  llm.verifyGrounding.mockResolvedValue({
    supported: false,
    evidence: [],
    reason: "Unsupported service",
  });
  const result = await verifyDiagnosis(
    candidate({
      intent: "PRICE_REQUEST",
      outbound: "Uzmanımız EMDR sunuyor. Güncel ücret için ekibimiz dönüş yapacak.",
      action: {
        id: "price",
        type: "PRICE_REQUEST",
        status: "PENDING",
        currentLabel: "Ücret",
        proposedLabel: "Dönüş",
        therapistName: "Santa",
      },
    }),
    llm,
    [],
    {},
  );
  expect(llm.verifyContentSafety).toHaveBeenCalledOnce();
  expect(llm.verifyGrounding).toHaveBeenCalledOnce();
  expect(result.action).toBeNull();
  expect(result.botStopped).toBe(true);
});
it("blocks dismissive reassurance even if the model verifier would approve", async () => {
  const llm = verifier();
  const result = await verifyDiagnosis(
    candidate({ outbound: "İlk görüşme için endişelenmenize gerek yok." }),
    llm,
    [],
    {},
  );
  expect(result.botStopped).toBe(true);
  expect(result.contentSafety?.issues).toContain("invalidating_tone");
  expect(llm.verifyContentSafety).not.toHaveBeenCalled();
});
