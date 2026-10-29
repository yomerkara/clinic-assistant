import { describe, expect, it } from "vitest";
import {
  coverageReport,
  isFiller,
  messageSegments,
  type Understanding,
} from "./understanding-coverage";

const base: Understanding = {
  intents: ["NEW_BOOKING"],
  fields: [],
  questions: [],
  corrections: [],
  needsClarification: false,
  clarification: null,
};
const understanding = (patch: Partial<Understanding>): Understanding => ({
  ...base,
  ...patch,
});

describe("messageSegments", () => {
  it("splits on sentence marks", () => {
    expect(
      messageSegments("Merhaba. Randevu almak istiyorum! Ücret ne kadar?").map(
        (s) => s.text,
      ),
    ).toEqual(["Merhaba.", "Randevu almak istiyorum!", "Ücret ne kadar?"]);
  });

  it("splits where Turkish staples a second request onto one sentence", () => {
    const parts = messageSegments(
      "Yarın 16:00 randevu almak istiyorum bir de ücret ne kadar",
    ).map((s) => s.text);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toContain("bir de ücret");
  });

  it("splits a comma only when both sides are real clauses", () => {
    expect(messageSegments("Ali Deneme, 29").map((s) => s.text)).toEqual([
      "Ali Deneme, 29",
    ]);
    const parts = messageSegments(
      "Ben Yasin Deneme ve 35 yaşındayım, yarın saat 16:00 uygun olur mu",
    );
    expect(parts.length).toBeGreaterThan(1);
  });

  it("returns the whole message when there is nothing to split", () => {
    expect(messageSegments("29").map((s) => s.text)).toEqual(["29"]);
    expect(messageSegments("   ")).toEqual([]);
  });
});

describe("isFiller", () => {
  it("recognises courtesy that carries no request", () => {
    for (const text of ["Merhaba", "teşekkürler", "Tamamdır.", "iyi akşamlar", "evet"])
      expect(isFiller(text), text).toBe(true);
  });

  it("does not treat a request as courtesy", () => {
    for (const text of ["randevu almak istiyorum", "ücret ne kadar?", "29 yaşındayım"])
      expect(isFiller(text), text).toBe(false);
  });
});

describe("coverageReport", () => {
  it("reports full coverage when every clause was quoted", () => {
    const inbound = "Ben Ali Deneme. 29 yaşındayım.";
    const report = coverageReport(
      inbound,
      understanding({
        fields: [
          { name: "patientName", value: "Ali Deneme", evidence: "Ben Ali Deneme." },
          { name: "age", value: 29, evidence: "29 yaşındayım." },
        ],
      }),
    );
    expect(report.ratio).toBe(1);
    expect(report.uncovered).toEqual([]);
    expect(report.needsSecondPass).toBe(false);
  });

  it("finds the clause the interpretation never explained", () => {
    const inbound = "Yarın 16:00 randevu istiyorum bir de ücret ne kadar";
    const report = coverageReport(
      inbound,
      understanding({
        fields: [
          {
            name: "availabilityNotes",
            value: "Yarın 16:00",
            evidence: "Yarın 16:00 randevu istiyorum",
          },
        ],
      }),
    );
    expect(report.uncovered).toHaveLength(1);
    expect(report.uncovered[0]).toContain("ücret");
    expect(report.needsSecondPass).toBe(true);
    expect(report.reasons).toContain("uncovered_clause");
    expect(report.ratio).toBeLessThan(1);
  });

  it("flags an unquoted question as the most costly miss", () => {
    const report = coverageReport(
      "Adım Ece Deneme. EMDR nedir?",
      understanding({
        fields: [{ name: "patientName", value: "Ece Deneme", evidence: "Adım Ece Deneme." }],
      }),
    );
    expect(report.reasons).toContain("open_question");
    expect(report.needsSecondPass).toBe(true);
  });

  it("does not ask for a second pass over courtesy alone", () => {
    const report = coverageReport("Merhaba, teşekkürler", understanding({}));
    expect(report.needsSecondPass).toBe(false);
    expect(report.ratio).toBe(1);
  });

  it("asks for a second pass when the model said it was unsure", () => {
    const report = coverageReport(
      "Saat 4 olur",
      understanding({
        fields: [{ name: "availabilityNotes", value: "Saat 4", evidence: "Saat 4 olur" }],
        needsClarification: true,
        clarification: "16:00 mı 04:00 mı?",
      }),
    );
    expect(report.needsSecondPass).toBe(true);
    expect(report.reasons).toContain("model_unsure");
  });

  it("counts a clause as covered when a quote only overlaps part of it", () => {
    const report = coverageReport(
      "yarın saat 16:00 uygun",
      understanding({
        fields: [{ name: "availabilityNotes", value: "16:00", evidence: "saat 16:00" }],
      }),
    );
    expect(report.uncovered).toEqual([]);
  });

  it("ignores a quote that is not in the message, rather than crediting it", () => {
    const report = coverageReport(
      "ücret ne kadar",
      understanding({
        questions: [{ topic: "PRICE_REQUEST", evidence: "başka bir mesajdan alıntı" }],
      }),
    );
    expect(report.uncovered).toEqual(["ücret ne kadar"]);
    expect(report.needsSecondPass).toBe(true);
  });

  it("treats an empty message as nothing to review", () => {
    const report = coverageReport("", understanding({}));
    expect(report.ratio).toBe(1);
    expect(report.needsSecondPass).toBe(false);
  });

  it("credits a correction quote as coverage", () => {
    const report = coverageReport(
      "Adımı yanlış yazdım, adım Veli Deneme",
      understanding({
        corrections: [{ field: "patientName", evidence: "Adımı yanlış yazdım" }],
        fields: [{ name: "patientName", value: "Veli Deneme", evidence: "adım Veli Deneme" }],
      }),
    );
    expect(report.uncovered).toEqual([]);
  });
});
