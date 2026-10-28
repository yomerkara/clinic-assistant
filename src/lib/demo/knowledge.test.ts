import { expect, it } from "vitest";
import { demoTherapistKnowledge } from "./knowledge";
import { applyClinicRules } from "@/lib/simulator/rules";
import { buildFixture, defaultConditions } from "@/lib/simulator/conditions";
import { therapistInformation } from "@/lib/conversation/therapist-information";

it("answers the named demo person's fields even with conflicting honorifics", () => {
  const inbound = "öncelikle yönetici Ömer Bey hanımın çalışma alanlarından bahsedebilir misiniz benim için uygun mu bilmiyorun";
  const result = therapistInformation(inbound, demoTherapistKnowledge("demo", profile, base));
  expect(result?.source.id).toBe("demo_omer_services");
  expect(result?.answer).toContain("yalnızca bu demo senaryosunda");
  expect(result?.answer).toContain("EMDR");
  expect(therapistInformation(inbound, base)).toBeUndefined();
  expect(therapistInformation("Selin Hanımın çalışma alanları neler?", base)).toBeUndefined();
});

const base = [
  {
    id: "official_santa_therapists",
    title: "Santa psikologları",
    content: "Klinik Psikolog Merve Nur Akıl — EMDR, Bilişsel Davranışçı Terapi.",
    source: "official",
    version: 1,
  },
];
const profile = { displayName: "Yönetici Ömer (test)" };

it("never adds demo services to WhatsApp or a demo without a connected profile", () => {
  expect(demoTherapistKnowledge("whatsapp", profile, base)).toBe(base);
  expect(demoTherapistKnowledge("demo", null, base)).toBe(base);
  expect(demoTherapistKnowledge("demo", profile, [])).toEqual([]);
});

it("grounds Ömer's services in Merve's demo reference without handing off", () => {
  const knowledge = demoTherapistKnowledge("demo", profile, base);
  expect(knowledge.at(-1)?.content).toContain("EMDR");
  expect(base).toHaveLength(1);
  const now = new Date("2026-10-05T10:00:00Z");
  const diagnosis = applyClinicRules({
    llm: {
      turn: {
        intent: "THERAPIST_INFO",
        confidence: 0.99,
        reply:
          "Demo kapsamında Ömer Bey EMDR ve Bilişsel Davranışçı Terapi hizmetlerini temsil ediyor.",
        entities: {},
        needsHandoff: false,
      },
      model: "test",
      provider: "fake",
      latencyMs: 0,
    },
    inbound:
      "ben Ali Kara, yönetici ömer'in hangi hizmetleri verdiğini öğrenmek istiyordum",
    knowledge,
    fixture: buildFixture(defaultConditions(now)),
    now,
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
  });
  expect(diagnosis.botStopped).toBe(false);
  expect(diagnosis.handoff).toBeFalsy();
  expect(diagnosis.knowledge?.id).toBe("demo_omer_services");
});

it("uses the approved demo reference for mixed booking and service questions", async () => {
  const { demoServiceAnswer } = await import("./knowledge");
  const docs = demoTherapistKnowledge("demo", profile, base);
  const question =
    "Yönetici Ömer ile yarın saat 19'a randevu istiyorum, hangi hizmetleri veriyor?";
  const answer = demoServiceAnswer(question, profile.displayName, docs);
  expect(answer).toContain(base[0].content);
  expect(answer).toContain("yalnızca bu demo senaryosunda");
  expect(answer).not.toContain("takvimini kullan");
  expect(demoServiceAnswer(question, "Merve Nur Akıl", docs)).toBeUndefined();
  expect(demoServiceAnswer(question, profile.displayName, base)).toBeUndefined();
  expect(
    demoServiceAnswer(
      "Hangi hizmetleri veriyor, EMDR bana iyi gelir mi?",
      profile.displayName,
      docs,
    ),
  ).toBeUndefined();
});

it("replaces a model's service embellishment while preserving the intake question", () => {
  const now = new Date("2026-10-07T13:00:00Z");
  const diagnosis = applyClinicRules({
    llm: {
      provider: "fake",
      model: "test",
      latencyMs: 0,
      turn: {
        intent: "NEW_BOOKING",
        confidence: 0.95,
        reply: "Yaşınızı paylaşır mısınız?",
        questionAnswer: "Ömer Bey sizi kesin iyileştirir.",
        entities: {},
        needsHandoff: false,
      },
    },
    inbound: "Ömer ile yarın saat 19'a randevu istiyorum, hangi hizmetleri veriyor?",
    knowledge: demoTherapistKnowledge("demo", profile, base),
    fixture: {
      patients: [{ name: "Ayşe Kara", phone: "synthetic" }],
      appointments: [],
      selectedTherapistName: profile.displayName,
      intake: {
        hasFullName: true,
        age: null,
        hasTherapyHistory: null,
        availabilityNotes: "yarın 19",
        alternativeDaysOkay: null,
      },
    },
    now,
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
  });
  expect(diagnosis.outbound).toContain("EMDR");
  expect(diagnosis.outbound).toContain("Yaşınızı");
  expect(diagnosis.outbound).not.toContain("kesin iyileştirir");
  expect(diagnosis.botStopped).toBe(false);
  expect(diagnosis.action).toBeNull();
});
