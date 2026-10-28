import { expect, it } from "vitest";
import { applyClinicRules, type SimulationFixture } from "@/lib/simulator/rules";
import { normalizeBookingPreference } from "./booking-preference";
import type { LlmTurn } from "@/lib/llm/types";

const turn: LlmTurn = {
  intent: "NEW_BOOKING",
  confidence: 0.95,
  reply: "Uygun saatleri kontrol edip döneceğim.",
  entities: {},
  needsHandoff: false,
};
const intake = {
  hasFullName: false,
  age: null,
  hasTherapyHistory: false,
  availabilityNotes: null,
  alternativeDaysOkay: null,
};
it("asks for an unambiguous slot instead of claiming to have noted a request", () => {
  const result = applyClinicRules({
    llm: { turn, model: "test", provider: "fake", latencyMs: 0 },
    inbound: "1 alksjdlkasjkdja",
    now: new Date("2026-10-07T15:58:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
    knowledge: [],
    fixture: {
      awaitingSlotSelection: true,
      selectedTherapistName: "Yönetici Ömer",
      patients: [{ name: "Sentetik Hasta", phone: "test" }],
      appointments: [],
      intake: { ...intake, hasFullName: true, age: 28, availabilityNotes: "yarın 11" },
    },
  });
  expect(result.outbound).toContain("Henüz onay talebi oluşturmadım");
  expect(result.outbound).not.toContain("not aldım");
  expect(result.action).toBeNull();
  expect(result.botStopped).toBe(false);
});
function diagnose(profile: SimulationFixture["intake"]) {
  return applyClinicRules({
    llm: { turn, model: "test", provider: "fake", latencyMs: 0 },
    inbound: "Merve hanımla görüşeyim",
    now: new Date("2026-10-05T10:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: false,
    knowledge: [],
    fixture: {
      patients: [{ name: "Yeni Hasta", phone: "demo" }],
      appointments: [],
      selectedTherapistName: "Merve Nur Akıl",
      intake: profile,
    },
  });
}
it("collects missing name and age before handing off an inaccessible calendar", () => {
  const first = diagnose(intake);
  expect(first.botStopped).toBe(false);
  expect(first.action).toBeNull();
  expect(first.outbound).toContain("adınızı ve soyadınızı");
  expect(diagnose({ ...intake, hasFullName: true }).outbound).toContain("Yaşınızı");
});
it("does not ask therapy history again when the answer was no", () => {
  const result = diagnose({ ...intake, hasFullName: true, age: 29 });
  expect(result.outbound).toContain("hangi gün ve saatler");
  expect(result.botStopped).toBe(false);
});
it("hands calendar checking to staff only after the intake is complete", () => {
  const result = diagnose({
    ...intake,
    hasFullName: true,
    age: 29,
    availabilityNotes: "Salı 16.00",
  });
  expect(result.botStopped).toBe(true);
  expect(result.handoff?.reason).toContain("Calendar");
  expect(result.action).toBeNull();
});
it("treats a preference correction before any booking as new booking, preserving entities", () => {
  const change: LlmTurn = {
    ...turn,
    intent: "THERAPIST_CHANGE",
    needsHandoff: true,
    entities: { therapistName: "Yönetici Ömer", hasTherapyHistory: false },
  };
  const result = normalizeBookingPreference(change, false, false);
  expect(result.intent).toBe("NEW_BOOKING");
  expect(result.needsHandoff).toBe(false);
  expect(result.entities).toEqual({
    therapistName: "Yönetici Ömer",
    therapistPreference: "SELECTED",
    hasTherapyHistory: false,
  });
  expect(normalizeBookingPreference(change, true, false)).toBe(change);
  expect(normalizeBookingPreference(change, false, true)).toBe(change);
});

it("asks for the full name despite a model reply that skips to age", () => {
  const result = diagnose({
    ...intake,
    age: 27,
    hasTherapyHistory: false,
    availabilityNotes: "6 Ekim 15.00",
  });
  expect(result.outbound).toContain("adınızı ve soyadınızı");
  expect(result.botStopped).toBe(false);
  expect(result.action).toBeNull();
});

it("does not hand off a selected therapist's time restriction, even if the model flags it", () => {
  const result = applyClinicRules({
    llm: {
      turn: { ...turn, needsHandoff: true, entities: { alternativeDaysOkay: false } },
      model: "test",
      provider: "fake",
      latencyMs: 0,
    },
    inbound: "şuanlık sadece o saat",
    now: new Date("2026-10-05T10:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
    knowledge: [],
    fixture: {
      patients: [{ name: "Ali", phone: "demo" }],
      appointments: [],
      selectedTherapistName: "Yönetici Ömer",
      intake: { ...intake, age: 27, availabilityNotes: "6 Ekim 15.00" },
    },
  });
  expect(result.botStopped).toBe(false);
  expect(result.handoff).toBeNull();
  expect(result.outbound).toContain("adınızı ve soyadınızı");
  expect(result.action).toBeNull();
});

it("answers a mixed EMDR question before asking for the missing surname", () => {
  const result = applyClinicRules({
    llm: {
      provider: "openai",
      model: "test",
      latencyMs: 0,
      turn: {
        ...turn,
        reply: "Randevu için adınızı ve soyadınızı paylaşır mısınız?",
        questionAnswer:
          "EMDR, göz hareketleriyle duyarsızlaştırma ve yeniden işleme yaklaşımıdır.",
        entities: { therapistName: "Merve Nur Akıl", therapistPreference: "SELECTED" },
      },
    },
    inbound: "Merve hanımla çalışmak isterim çok teşekkürler, bu arada EMDR nedir?",
    now: new Date("2026-10-07T12:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: false,
    knowledge: [],
    fixture: {
      patients: [{ name: "Ömer", phone: "synthetic" }],
      appointments: [],
      selectedTherapistName: "Merve Nur Akıl",
      intake,
    },
  });
  expect(result.outbound).toMatch(/^EMDR/);
  expect(result.outbound).toContain("adınızı ve soyadınızı");
  expect(result.action).toBeNull();
  expect(result.botStopped).toBe(false);
});

it("acknowledges emotional context before continuing intake without diagnosis", () => {
  const result = applyClinicRules({
    llm: {
      provider: "openai",
      model: "test",
      latencyMs: 0,
      turn: {
        ...turn,
        acknowledgement: "Bunu paylaştığınız için teşekkür ederim.",
      },
    },
    inbound:
      "Hayır maalesef, kendimi depresif hissediyorum, bundan kaynaklı başlamak istedim",
    now: new Date("2026-10-07T12:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
    knowledge: [],
    fixture: {
      patients: [{ name: "Yasin Ömer Kara", phone: "synthetic" }],
      appointments: [],
      selectedTherapistName: "Merve Nur Akıl",
      intake: { ...intake, hasFullName: true, age: 27 },
    },
  });
  expect(result.outbound).toMatch(/^Bunu paylaştığınız/);
  expect(result.outbound).toContain("hangi gün ve saatler");
});

it.each([
  "Yeni bir terapi sürecine adım atmak cesaret ister, bu kararınızı değerli buluyorum.",
  "İlk kez terapiye başlamak heyecan verici ve cesaret isteyen bir adım; bunu takdir ediyorum.",
])("omits evaluative praise during routine intake: %s", (acknowledgement) => {
  const result = applyClinicRules({
    llm: { provider: "fake", model: "test", latencyMs: 0, turn: { ...turn, acknowledgement } },
    inbound: "hayır hiç olmadı",
    now: new Date("2026-10-07T12:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
    knowledge: [],
    fixture: {
      patients: [{ name: "Test Kişisi", phone: "synthetic" }],
      appointments: [],
      selectedTherapistName: "Merve Nur Akıl",
      intake: { ...intake, hasFullName: true, age: 50 },
    },
  });
  expect(result.outbound).toBe("Randevu için hangi gün ve saatler size uygun?");
  expect(result.botStopped).toBe(false);
});

it("keeps the information answer even after intake is complete and the calendar is offline", () => {
  const result = applyClinicRules({
    llm: {
      provider: "openai",
      model: "test",
      latencyMs: 0,
      turn: {
        ...turn,
        questionAnswer: "EMDR bir psikoterapi yaklaşımıdır.",
      },
    },
    inbound: "Merve Hanımla randevu istiyorum, EMDR nedir?",
    now: new Date("2026-10-07T12:00:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: false,
    knowledge: [],
    fixture: {
      patients: [{ name: "Sentetik Hasta", phone: "synthetic" }],
      appointments: [],
      selectedTherapistName: "Merve Nur Akıl",
      intake: { ...intake, hasFullName: true, age: 27, availabilityNotes: "Yarın 19" },
    },
  });
  expect(result.outbound).toBe("EMDR bir psikoterapi yaklaşımıdır.");
  expect(result.botStopped).toBe(false);
  expect(result.action).toBeNull();
});

it.each(["demo-only", "approved"])(
  "labels service answers only for a demo source (%s)",
  (source) => {
    const result = applyClinicRules({
      llm: {
        turn: { ...turn, questionAnswer: "Yönetici Ömer EMDR hizmeti sunar." },
        provider: "fake",
        model: "test",
        latencyMs: 0,
      },
      inbound: "Ömer ile randevu istiyorum, hangi hizmetleri veriyor?",
      now: new Date("2026-10-07T12:00:00Z"),
      timeZone: "Europe/Istanbul",
      calendarAvailable: false,
      knowledge: [
        {
          id: "synthetic",
          title: "Hizmetler",
          source,
          version: 1,
          content:
            "Yönetici Ömer, yalnızca bu demo senaryosunda EMDR hizmeti sunan test kişisidir.",
        },
      ],
      fixture: {
        patients: [{ name: "Ayşe Kara", phone: "synthetic" }],
        appointments: [],
        selectedTherapistName: "Yönetici Ömer",
        intake: { ...intake, hasFullName: true },
      },
    });
    expect(result.outbound.startsWith("Bu demo senaryosunda:")).toBe(
      source === "demo-only",
    );
    expect(result.outbound).toContain("Yaşınızı");
    expect(result.botStopped).toBe(false);
  },
);
