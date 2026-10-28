import { describe, expect, it, vi } from "vitest";
import { OpenAiLlm, parseLlmJson } from "@/lib/llm/openai";

describe("model appointment fields", () => {
  it.each([
    { date: "2026-02-30" },
    { date: "2026-13-01" },
    { date: "yarın" },
    { time: "24:00" },
    { time: "15:60" },
    { time: "öğleden sonra" },
  ])("rejects invalid extracted fields %j", (entities) => {
    expect(() =>
      parseLlmJson(
        JSON.stringify({
          intent: "NEW_BOOKING",
          confidence: 1,
          reply: "Talebinizi aldım.",
          entities,
        }),
      ),
    ).toThrow();
  });
  it("accepts leap days and missing optional dates", () => {
    for (const entities of [{ date: "2028-02-29", time: "15:00" }, { date: null }, {}]) {
      expect(
        parseLlmJson(
          JSON.stringify({
            intent: "NEW_BOOKING",
            confidence: 1,
            reply: "Talebinizi aldım.",
            entities,
          }),
        ).entities,
      ).toEqual(entities);
    }
  });
});

describe("OpenAiLlm tarih bağlamı", () => {
  it("rejects a truncated completion even when its partial JSON is valid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: {
                content: JSON.stringify({
                  intent: "NEW_BOOKING",
                  confidence: 1,
                  reply: "Randevunuz onaylandı.",
                  entities: {},
                  needsHandoff: false,
                }),
              },
            },
          ],
        }),
      ),
    );
    const llm = new OpenAiLlm({ apiKey: "test", model: "test", fetchImpl });
    await expect(
      llm.complete({
        history: [],
        inbound: "1",
        nowIso: "2026-10-07T10:00:00Z",
        appointmentsSummary: "Yok",
        knowledge: [],
        modelVersion: "test",
      }),
    ).rejects.toMatchObject({ detail: "Incomplete model response" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a truncated grounding verdict instead of approving a partial result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: '{"supported":true,"evidence":[],"reason":"ok"}' },
            },
          ],
        }),
      ),
    );
    const llm = new OpenAiLlm({ apiKey: "test", model: "test", fetchImpl });
    await expect(llm.verifyGrounding("Klinik bilgisi", [])).rejects.toThrow(
      "Incomplete grounding verdict",
    );
  });

  it("modele bugünün İstanbul tarihini açık biçimde gönderir", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
        max_tokens?: number;
      };
      expect(body.messages[1]?.content).toContain("Bugünün İstanbul tarihi: 2026-08-25");
      expect(body.messages[1]?.content).toContain("Salı");
      expect(body.max_tokens).toBe(1200);
      expect(body.messages[0]?.content).toContain("Sıcak");
      expect(body.messages[0]?.content).toContain("doğal biçimde ilerlet");
      expect(body.messages[0]?.content).toContain("genel psikoeğitim");
      expect(body.messages[0]?.content).toContain("Konuşma hafızası");
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                content:
                  '{"intent":"NEW_BOOKING","confidence":0.95,"reply":"Elbette.","entities":{},"needsHandoff":false}',
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const llm = new OpenAiLlm({ apiKey: "test", model: "test-model", fetchImpl });
    await llm.complete({
      history: [],
      inbound: "26 Ağustos saat 14.00 uygun mu?",
      nowIso: "2026-08-25T17:30:00.000Z",
      appointmentsSummary: "Randevu yok",
      knowledge: [],
      modelVersion: "intent-v3",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
