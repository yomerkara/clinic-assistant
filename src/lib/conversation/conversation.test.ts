import { describe, expect, it } from "vitest";
import { isAbuseMessage, isCrisisMessage, isHumanRequest } from "./guardrails";
import { quickRepliesFor } from "./quick-replies";
import { clipReply, consecutiveLowUnknownCount, FALLBACK_OPTIONS } from "./style";
import { INTAKE_QUESTIONS } from "./booking-flow";

describe("conversation guardrails", () => {
  it("flags insults without treating a crisis as abuse", () => {
    expect(isAbuseMessage("Salak mısınız siz?")).toBe(true);
    expect(isCrisisMessage("Kriz halindeyim, kendimi öldürmek istiyorum.")).toBe(true);
    expect(isAbuseMessage("Kriz halindeyim, kendimi öldürmek istiyorum.")).toBe(false);
  });

  it("detects a request to speak with a person", () => {
    expect(isHumanRequest("Müşteri temsilcisiyle konuşmak istiyorum.")).toBe(true);
    expect(isHumanRequest("Birinizle konuşayım lütfen")).toBe(true);
    expect(isHumanRequest("Randevu saatini değiştirebilir miyiz?")).toBe(false);
  });
});

describe("conversation style", () => {
  it.each(Object.values(INTAKE_QUESTIONS))(
    "preserves the next intake step after long information: %s",
    (question) => {
      const clipped = clipReply(`${"Onaylı açıklama. ".repeat(90)}\n\n${question}`);
      expect(clipped.length).toBeLessThanOrEqual(720);
      expect(clipped.endsWith(question)).toBe(true);
    },
  );
  it("keeps slot lists when clipping long replies", () => {
    const prose = `${"Bu cümle çok uzun. ".repeat(80)}Son.`;
    const text = `${prose}\n\nUygun saatler:\n1) 3 Eylül 16:00`;
    const clipped = clipReply(text);
    expect(clipped.length).toBeLessThan(text.length);
    expect(clipped).toContain("Uygun saatler:");
    expect(clipped).toContain("3 Eylül 16:00");
  });

  it("counts consecutive low-confidence unknowns from the end", () => {
    expect(
      consecutiveLowUnknownCount([
        { intent: "NEW_BOOKING", confidence: 0.9 },
        { intent: "UNKNOWN", confidence: 0.4 },
      ]),
    ).toBe(1);
    expect(
      consecutiveLowUnknownCount([
        { intent: "UNKNOWN", confidence: 1 },
        { intent: "UNKNOWN", confidence: 0.4 },
      ]),
    ).toBe(2);
  });
});

describe("quick replies", () => {
  it("turns offered slots into numbered chips", () => {
    const chips = quickRepliesFor({
      outbound:
        "Kontrol ediyorum.\n\nUygun saatler:\n1) 3 Eylül Perşembe 16:00\n2) 3 Eylül Perşembe 17:00",
      intent: "NEW_BOOKING",
      hasAppointment: false,
    });
    expect(chips.map((item) => item.text)).toEqual(["1", "2"]);
  });

  it("offers core options after a fallback", () => {
    const chips = quickRepliesFor({
      outbound: FALLBACK_OPTIONS,
      intent: "UNKNOWN",
      hasAppointment: false,
    });
    expect(chips.some((item) => item.label === "Yeni randevu")).toBe(true);
    expect(chips.some((item) => item.label === "Çalışanla konuş")).toBe(true);
  });
});

it("retains the fee and invitation after a long introduction", () => {
  const reply = clipReply(
    `${"Klinik hakkında onaylı açıklama. ".repeat(50)}\n\nSeans ücretimiz 4.000 TL’dir.\n\nRandevu almak ister misiniz?`,
  );
  expect(reply).toContain("4.000 TL");
  expect(reply).toContain("Randevu almak ister misiniz?");
  expect(reply.length).toBeLessThanOrEqual(720);
});
