import { ModelCallError } from "@/lib/llm/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiLlm } from "@/lib/llm/openai";
import { handleInbound } from "./inbound";
import { prisma } from "@/lib/prisma";
import { normalizeFaqQuestion } from "@/lib/conversation/faq-cache";

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasourceUrl:
        process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost/unused",
    }),
  };
});
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    APP_TIMEZONE: "Europe/Istanbul",
    LLM_MODEL: "test",
    OPENAI_API_KEY: "synthetic",
    APP_URL: "https://localhost",
  }),
}));
vi.mock("@/lib/usage/configuration", () => ({
  currentModelConfiguration: async () => ({
    model: "test",
    pricing: { configured: false },
  }),
}));
vi.mock("@/lib/usage/record", () => ({
  assertUsageBudgetAvailable: vi.fn(),
  recordModelUsage: vi.fn().mockResolvedValue(undefined),
  UsageBudgetExceededError: class extends Error {},
}));
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw Error("Separate test database required");
describe.skipIf(!url)("AI response delivery boundary with PostgreSQL", () => {
  const patients: string[] = [];
  const docs: string[] = [];
  const caches: string[] = [];
  const users: string[] = [];
  const unsafe = "UNSAFE_CANDIDATE_MARKER";
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("CONVERSATION_FLOW", "legacy");
    vi.spyOn(OpenAiLlm.prototype, "complete").mockResolvedValue({
      turn: {
        intent: "THERAPY_INFO",
        confidence: 1,
        reply: unsafe,
        entities: {},
        needsHandoff: false,
      },
      latencyMs: 0,
      model: "test",
      provider: "openai",
      pricing: undefined,
      usage: undefined,
    });
    vi.spyOn(OpenAiLlm.prototype, "verifyContentSafety").mockResolvedValue({
      safe: false,
      requiresGrounding: false,
      issues: ["personal_treatment"],
    });
    vi.spyOn(OpenAiLlm.prototype, "verifyGrounding").mockResolvedValue({
      supported: true,
      evidence: [],
      reason: "test",
    });
  });
  async function patient() {
    const p = await prisma.patient.create({
      data: { phone: `safety:${crypto.randomUUID()}`, displayName: "sentetik hasta" },
    });
    patients.push(p.id);
    return p;
  }
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.conversation.deleteMany({ where: { patientId: { in: patients } } });
    await prisma.patient.deleteMany({ where: { id: { in: patients } } });
    await prisma.therapistProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.faqAnswerCache.deleteMany({ where: { id: { in: caches } } });
    await prisma.knowledgeDocument.deleteMany({ where: { id: { in: docs } } });
    await prisma.$disconnect();
  });
  it("persists the invoice and answers the approved price without model calls", async () => {
    vi.stubEnv("CONVERSATION_FLOW", "simple");
    const p = await patient();
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "Faturamı istiyorum, ayrıca yeni seans ücretini öğrenebilir miyim?",
      source: "whatsapp",
    });
    const actions = await prisma.actionRequest.findMany({
      where: { conversationId: result.conversationId },
    });
    expect(actions.map((a) => a.type).sort()).toEqual(["INVOICE_REQUEST"]);
    expect(result.diagnosis.outbound).toContain("4.000 TL");
    expect(OpenAiLlm.prototype.complete).not.toHaveBeenCalled();
  });
  it("simple answer model cannot write invented profile fields or dispatch operations", async () => {
    vi.stubEnv("CONVERSATION_FLOW", "simple");
    const p = await patient();
    vi.mocked(OpenAiLlm.prototype.complete).mockResolvedValue({
      provider: "openai",
      model: "test",
      latencyMs: 0,
      usage: undefined,
      pricing: undefined,
      turn: {
        intent: "NEW_BOOKING",
        confidence: 1,
        reply: unsafe,
        entities: { age: 99, hasTherapyHistory: true, patientName: "invented identity" },
        needsHandoff: true,
      },
    });
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "Terapide aktarım kavramı nedir?",
      source: "whatsapp",
    });
    expect(result.diagnosis.outbound).not.toContain(unsafe);
    expect(result.diagnosis.botStopped).toBe(false);
    expect(result.actionId).toBeNull();
    const saved = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
    expect(saved.age).toBeNull();
    expect(saved.hasTherapyHistory).toBeNull();
    expect(saved.displayName).toBe(p.displayName);
    expect(OpenAiLlm.prototype.verifyContentSafety).toHaveBeenCalledOnce();
  });
  it("simple answer verifier outage preserves the booking intake", async () => {
    vi.stubEnv("CONVERSATION_FLOW", "simple");
    const p = await patient();
    await prisma.patient.update({ where: { id: p.id }, data: { age: 28 } });
    const conversation = await prisma.conversation.create({
      data: { phone: p.phone, patientId: p.id, bookingStage: "INTAKE", sessionModeConfirmed: true },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        authorKind: "BOT",
        text: "Daha önce terapi deneyiminiz oldu mu?",
      },
    });
    vi.mocked(OpenAiLlm.prototype.verifyContentSafety).mockRejectedValue(
      new Error("unavailable"),
    );
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      conversationId: conversation.id,
      text: "Hayır, terapide aktarım kavramı nedir?",
      source: "whatsapp",
    });
    expect(result.diagnosis.botStopped).toBe(false);
    expect(result.diagnosis.outbound).toContain("doğrulanmış bir yanıt");
    expect(result.diagnosis.outbound).toContain("Hangi terapistimizle");
    expect(
      (await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).hasTherapyHistory,
    ).toBe(false);
  });
  it("simple template reply never reaches the patient even if a verifier would approve", async () => {
    vi.stubEnv("CONVERSATION_FLOW", "simple");
    const p = await patient();
    vi.mocked(OpenAiLlm.prototype.complete).mockResolvedValue({
      provider: "openai",
      model: "test",
      latencyMs: 0,
      usage: undefined,
      pricing: undefined,
      turn: {
        intent: "THERAPY_INFO",
        confidence: 1,
        reply: "Yalnızca bu soruya yanıt",
        entities: {},
        needsHandoff: false,
      },
    });
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "Terapide aktarım kavramı nedir?",
      source: "whatsapp",
    });
    expect(result.diagnosis.outbound).not.toContain("Yalnızca bu soruya yanıt");
    expect(result.diagnosis.outbound).toContain("doğrulanmış bir yanıt");
    expect(result.diagnosis.botStopped).toBe(false);
  });
  it("persists slot clarification without creating a request for a noisy selection", async () => {
    const p = await patient();
    await prisma.patient.update({
      where: { id: p.id },
      data: { age: 28, hasTherapyHistory: false, availabilityNotes: "yarın 11" },
    });
    const user = await prisma.user.create({
      data: {
        name: "Test Uzmanı",
        email: `slot-${crypto.randomUUID()}@test.local`,
        passwordHash: "synthetic",
        role: "THERAPIST",
      },
    });
    users.push(user.id);
    const therapist = await prisma.therapistProfile.create({
      data: { userId: user.id, displayName: "Test Uzmanı", specialties: [] },
    });
    const conversation = await prisma.conversation.create({
      data: {
        patientId: p.id,
        phone: p.phone,
        mode: "BOT",
        preferredTherapistId: therapist.id,
        offeredTherapistId: therapist.id,
        offeredAt: new Date(),
        offeredSlots: [new Date(Date.now() + 86400000).toISOString()],
        bookingStage: "SLOT_SELECTION",
        sessionModeConfirmed: true,
      },
    });
    vi.mocked(OpenAiLlm.prototype.complete).mockResolvedValue({
      provider: "openai",
      model: "test",
      latencyMs: 0,
      usage: undefined,
      pricing: undefined,
      turn: {
        intent: "NEW_BOOKING",
        confidence: 1,
        reply: "Not aldım",
        entities: {},
        needsHandoff: false,
      },
    });
    vi.mocked(OpenAiLlm.prototype.verifyContentSafety).mockResolvedValue({
      safe: true,
      requiresGrounding: false,
      issues: [],
    });
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      conversationId: conversation.id,
      text: "1 alksjdlkasjkdja",
      source: "whatsapp",
    });
    expect(result.diagnosis.outbound).toContain("Henüz onay talebi oluşturmadım");
    expect(result.actionId).toBeNull();
    expect(result.diagnosis.botStopped).toBe(false);
    expect(
      await prisma.actionRequest.count({ where: { conversationId: conversation.id } }),
    ).toBe(0);
  });
  it("clarifies clinic information without model calls or a handoff", async () => {
    const p = await patient();
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "klinik bilgisi",
      source: "whatsapp",
    });
    expect(result.diagnosis.outbound).toContain("hangi bilgiyi öğrenmek istersiniz");
    expect(result.diagnosis.handoff).toBeNull();
    expect(result.actionId).toBeNull();
    expect(OpenAiLlm.prototype.complete).not.toHaveBeenCalled();
    expect(OpenAiLlm.prototype.verifyGrounding).not.toHaveBeenCalled();
    expect(OpenAiLlm.prototype.verifyContentSafety).not.toHaveBeenCalled();
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
    });
    expect(conversation.mode).toBe("BOT");
    const saved = await prisma.message.findMany({
      where: { conversationId: result.conversationId, direction: "OUTBOUND" },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].text).toBe(result.diagnosis.outbound);
  });
  it("persists only the safe handoff and stops automation for source-free therapy", async () => {
    const p = await patient();
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "Terapi süreci hakkında genel bilgi verir misiniz?",
      source: "whatsapp",
    });
    expect(OpenAiLlm.prototype.verifyContentSafety).toHaveBeenCalledOnce();
    expect(result.actionId).toBeNull();
    expect(result.diagnosis.contentSafety?.status).toBe("blocked");
    const saved = await prisma.message.findMany({
      where: { conversationId: result.conversationId, direction: "OUTBOUND" },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].text).not.toContain(unsafe);
    expect(
      await prisma.conversation.findUnique({ where: { id: result.conversationId } }),
    ).toMatchObject({ mode: "HUMAN" });
  });
  it("rechecks a legacy cache entry and cannot deliver its unsafe text", async () => {
    const p = await patient();
    const question = `Terapi hakkında ${crypto.randomUUID()} nedir?`;
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title: "Sentetik",
        content: "Terapi hakkında genel bir kaynak metni.",
        source: "test",
        approvalStatus: "APPROVED",
        version: 1,
      },
    });
    docs.push(doc.id);
    const cache = await prisma.faqAnswerCache.create({
      data: {
        normalizedQuestion: normalizeFaqQuestion(question),
        answer: unsafe,
        intent: "THERAPY_INFO",
        knowledgeDocId: doc.id,
        knowledgeVersion: 1,
      },
    });
    caches.push(cache.id);
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: question,
      source: "whatsapp",
    });
    expect(OpenAiLlm.prototype.complete).not.toHaveBeenCalled();
    expect(OpenAiLlm.prototype.verifyContentSafety).toHaveBeenCalledOnce();
    expect(result.diagnosis.outbound).not.toContain(unsafe);
    expect(result.diagnosis.botStopped).toBe(true);
    expect(
      await prisma.conversation.findUnique({ where: { id: result.conversationId } }),
    ).toMatchObject({ mode: "HUMAN" });
  });
  it.each([true, false])(
    "persists both routed operational requests only after safety approval (%s)",
    async (safe) => {
      const p = await patient();
      vi.spyOn(OpenAiLlm.prototype, "complete").mockResolvedValue({
        provider: "openai",
        model: "test",
        latencyMs: 0,
        pricing: undefined,
        usage: undefined,
        turn: {
          intent: "INVOICE_REQUEST",
          confidence: 0.95,
          reply: "İşlem",
          entities: {},
          needsHandoff: false,
          requests: [{ kind: "INVOICE_REQUEST" }, { kind: "PRICE_REQUEST" }],
        },
      });
      vi.spyOn(OpenAiLlm.prototype, "verifyContentSafety").mockResolvedValue({
        safe,
        requiresGrounding: false,
        issues: safe ? [] : ["personal_treatment"],
      });
      const result = await handleInbound({
        phone: p.phone,
        patientId: p.id,
        text: "Faturamı istiyorum, ayrıca yeni seans ücretini öğrenebilir miyim?",
        source: "whatsapp",
      });
      const actions = await prisma.actionRequest.findMany({
        where: { conversationId: result.conversationId },
      });
      expect(actions.map((a) => a.type).sort()).toEqual(
        safe ? ["INVOICE_REQUEST", "PRICE_REQUEST"] : [],
      );
      expect(result.diagnosis.botStopped).toBe(!safe);
      if (safe) expect(result.diagnosis.routing).toHaveLength(2);
    },
  );
  it("keeps transient model failures recoverable, records the category, and excludes them from ambiguity counts", async () => {
    const p = await patient();
    vi.spyOn(OpenAiLlm.prototype, "complete").mockRejectedValue(
      new ModelCallError("failed", "This operation was aborted"),
    );
    const first = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "İlk kez terapiye geleceğim, bir uzman önerdiler.",
      source: "whatsapp",
    });
    const second = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      conversationId: first.conversationId,
      text: "Randevu hakkında bilgi almak istiyorum.",
      source: "whatsapp",
    });
    for (const result of [first, second]) {
      expect(result.diagnosis.botStopped).toBe(false);
      expect(result.diagnosis.handoff).toBeNull();
      expect(result.diagnosis.serviceFailure?.kind).toBe("timeout");
      expect(result.diagnosis.outbound).not.toContain("ekibe ilettim");
      expect(result.actionId).toBeNull();
    }
    expect(
      await prisma.conversation.findUnique({ where: { id: first.conversationId } }),
    ).toMatchObject({ mode: "BOT" });
    expect(
      await prisma.actionRequest.count({
        where: { conversationId: first.conversationId },
      }),
    ).toBe(0);
    const decisions = await prisma.intentDecision.findMany({
      where: { message: { conversationId: first.conversationId } },
    });
    expect(decisions.map((d) => d.intent)).toEqual([
      "MODEL_UNAVAILABLE",
      "MODEL_UNAVAILABLE",
    ]);
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: decisions[0].messageId, action: "assistant.decision" },
    });
    expect(audit?.metadata).toMatchObject({
      serviceFailure: { kind: "timeout", retryable: true },
    });
    vi.spyOn(OpenAiLlm.prototype, "complete").mockResolvedValue({
      provider: "openai",
      model: "test",
      latencyMs: 0,
      pricing: undefined,
      usage: undefined,
      turn: {
        intent: "UNKNOWN",
        confidence: 0.5,
        reply: "Biraz açıklar mısınız?",
        entities: {},
        needsHandoff: false,
      },
    });
    vi.spyOn(OpenAiLlm.prototype, "verifyContentSafety").mockResolvedValue({
      safe: true,
      requiresGrounding: false,
      issues: [],
    });
    const recovered = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      conversationId: first.conversationId,
      text: "Randevum hakkında bir şey soracağım.",
      source: "whatsapp",
    });
    expect(recovered.diagnosis.botStopped).toBe(false);
    expect(recovered.diagnosis.outbound).toContain("açıklayabilir");
  });
  it("still hands invalid structured model output to staff", async () => {
    const p = await patient();
    vi.spyOn(OpenAiLlm.prototype, "complete").mockRejectedValue(
      new ModelCallError("failed", "Unexpected token in JSON"),
    );
    const result = await handleInbound({
      phone: p.phone,
      patientId: p.id,
      text: "Yeni randevu istiyorum.",
      source: "whatsapp",
    });
    expect(result.diagnosis.botStopped).toBe(true);
    expect(result.diagnosis.serviceFailure?.kind).toBe("invalid_response");
    expect(result.actionId).toBeNull();
  });
});
