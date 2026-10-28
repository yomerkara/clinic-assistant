import { describe, expect, it } from "vitest";
import { ModelCallError } from "@/lib/llm/types";
import { modelFailure } from "@/lib/llm/failure";
import { serviceFailureReply } from "./service-failure";

const reply = (detail: string, budgetExceeded = false) =>
  serviceFailureReply({
    failure: modelFailure(new ModelCallError("failed", detail)),
    budgetExceeded,
  });

describe("serviceFailureReply", () => {
  it("asks the patient to retry a transient transport error and keeps the bot active", () => {
    for (const detail of ["HTTP 429", "HTTP 503", "request timed out"]) {
      const result = reply(detail);
      expect(result.botStopped).toBe(false);
      expect(result.handoff).toBeNull();
      expect(result.outbound).toContain("tekrar gönderebilir misiniz");
    }
  });

  it("hands an unrecoverable failure to the team and stops the bot", () => {
    for (const detail of ["HTTP 403", "HTTP 400", "Unexpected token"]) {
      const result = reply(detail);
      expect(result.botStopped).toBe(true);
      expect(result.handoff?.reason).toBe("Model yanıtı alınamadı.");
      expect(result.outbound).toContain("ekibe ilettim");
    }
  });

  it("stops the bot when the monthly budget is spent, whatever the transport said", () => {
    const result = reply("HTTP 429", true);
    expect(result.botStopped).toBe(true);
    expect(result.handoff?.reason).toContain("kullanım limiti");
    expect(result.rule).toContain("Aylık kullanım sınırı");
    expect(result.outbound).toContain("ekibimize aktarıyorum");
  });

  it("never implies an appointment or a queue record was created", () => {
    for (const detail of ["HTTP 429", "HTTP 403", "HTTP 401"])
      for (const budget of [false, true]) {
        const result = reply(detail, budget);
        expect(result.outbound).not.toMatch(/randevu(?:nuz)?\s+(?:oluştur|kesinleş|onayla)/iu);
        expect(result.outbound).not.toContain("Uygun saatler");
      }
  });

  it("records the failure category in the rule without the provider body", () => {
    const result = reply("HTTP 503");
    expect(result.rule).toContain("provider_unavailable");
    expect(result.rule).toContain("Hiçbir randevu veya işlem oluşturulmadı");
    expect(result.rule).not.toContain("HTTP 503");
  });
});
