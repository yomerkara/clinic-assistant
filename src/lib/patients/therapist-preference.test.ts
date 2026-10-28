import { describe, expect, it } from "vitest";
import { resolveTherapist } from "./therapist-preference";
import { applyClinicRules } from "@/lib/simulator/rules";
import type { LlmTurn } from "@/lib/llm/types";
import { normalizeBookingPreference } from "./booking-preference";
const roster = [
  { displayName: "Psikolog & Aile Danışmanı Hazal Gül Akkuş" },
  { displayName: "Klinik Psikolog Merve Nur Akıl" },
];
function diagnose(overrides: Partial<LlmTurn> = {}, selected: string | null = null) {
  return applyClinicRules({
    llm: {
      turn: {
        intent: "NEW_BOOKING",
        confidence: 0.95,
        reply: "Randevu alalım",
        entities: {},
        needsHandoff: false,
        ...overrides,
      },
      model: "test",
      provider: "fake",
      latencyMs: 0,
    },
    inbound: "Randevu istiyorum",
    now: new Date("2026-10-05T09:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: false,
    knowledge: [],
    fixture: {
      patients: [{ name: "Test Hasta", phone: "test" }],
      appointments: [],
      selectedTherapistName: selected,
    },
  });
}
describe("therapist choice", () => {
  it("keeps a uniquely named referral through neutral intake replies", () => {
    const turn: LlmTurn = { intent: "NEW_BOOKING", confidence: 0.95, reply: "", entities: {}, needsHandoff: false };
    const chosen = normalizeBookingPreference(turn, false, false, {
      inbound: "merhaba arkadaşım merve hanımı önerdi de terapiye başlamak istiyorum",
      roster, selectedName: null,
    });
    expect(chosen.entities.therapistName).toBe(roster[1].displayName);
    expect(chosen.entities.therapistPreference).toBe("SELECTED");
    const next = normalizeBookingPreference({ ...turn, entities: { therapistPreference: "UNDECIDED" } }, false, false, {
      inbound: "hayır hiç olmadı", roster, selectedName: roster[1].displayName,
    });
    expect(next.entities.therapistName).toBe(roster[1].displayName);
    expect(next.entities.therapistPreference).toBe("SELECTED");
  });
  it.each([
    "Merve Hanımı önerdiler ama başka biriyle başlamak istiyorum",
    "Merve Hanımı önerdiler, benim için uygun mu?",
    "Selin Hanımı önerdiler, terapiye başlamak istiyorum",
  ])("does not infer an unsupported choice: %s", (inbound) => {
    const turn: LlmTurn = { intent: "NEW_BOOKING", confidence: 0.95, reply: "", entities: {}, needsHandoff: false };
    expect(normalizeBookingPreference(turn, false, false, { inbound, roster, selectedName: null }).entities.therapistPreference).toBeUndefined();
  });
  it("preserves a named booking choice when its redundant flag is omitted", () => {
    const turn: LlmTurn = {
      intent: "NEW_BOOKING",
      confidence: 0.95,
      reply: "",
      entities: { therapistName: "Yönetici Ömer" },
      needsHandoff: false,
    };
    expect(
      normalizeBookingPreference(turn, false, false).entities.therapistPreference,
    ).toBe("SELECTED");
    expect(
      normalizeBookingPreference({ ...turn, intent: "THERAPIST_INFO" }, false, false)
        .entities.therapistPreference,
    ).toBeUndefined();
    expect(
      normalizeBookingPreference(
        { ...turn, entities: { ...turn.entities, therapistPreference: "UNDECIDED" } },
        false,
        false,
      ).entities.therapistPreference,
    ).toBe("UNDECIDED");
  });
  it("asks before consulting a disconnected calendar or creating a booking", () => {
    const d = diagnose();
    expect(d.outbound).toContain("Hangi terapist");
    expect(d.action).toBeNull();
    expect(d.botStopped).toBe(false);
  });
  it("keeps an explicit choice instead of asking again", () => {
    expect(diagnose({}, roster[1].displayName).outbound).not.toContain("Hangi terapist");
  });
  it("hands off selection support without creating a booking", () => {
    const d = diagnose({
      needsHandoff: true,
      handoffReason: "Hasta seçimi ekibe bıraktı",
    });
    expect(d.botStopped).toBe(true);
    expect(d.handoff?.reason).toContain("ekibe");
    expect(d.action).toBeNull();
  });
  it("resolves names and rejects absent or ambiguous therapists", () => {
    expect(resolveTherapist("Hazal Hanım", roster)).toEqual(roster[0]);
    expect(resolveTherapist("Merve Nur Akıl", roster)).toEqual(roster[1]);
    expect(resolveTherapist("Selin", roster)).toBeNull();
    expect(resolveTherapist(null, roster)).toBeNull();
    expect(
      resolveTherapist("Hazal", [...roster, { displayName: "Hazal Başka" }]),
    ).toBeNull();
  });
});
