import { expect, it } from "vitest";
import { approvedPolicy, policyAnswers } from "./approved-policies";
import { planSimpleFlow, renderSimpleFlow } from "./simple-flow";
import { applyClinicRules, type SimulationFixture } from "@/lib/simulator/rules";

const knowledge = [
  { id: "clinic_policy_price", content: "Seans ücretimiz 4.000 TL’dir." },
  { id: "clinic_policy_online", content: "Online seans imkânımız bulunmaktadır." },
  { id: "clinic_policy_guardian", content: "Veli onayı ve eşliği gereklidir." },
].map((d) => ({ ...d, title: d.id, source: "clinic-operator", version: 1 }));
const fixture: SimulationFixture = {
  patients: [{ name: "Ali Kara", phone: "test" }],
  appointments: [],
  intake: {
    hasFullName: true,
    age: 29,
    hasTherapyHistory: false,
    availabilityNotes: null,
    alternativeDaysOkay: null,
  },
};
function render(text: string) {
  const now = new Date("2026-10-09T09:00:00Z");
  const plan = planSimpleFlow({
    text,
    now,
    stage: "INTAKE",
    lastReply: "",
    fixture,
    roster: [],
    knowledge,
  });
  return renderSimpleFlow(
    plan,
    applyClinicRules({
      llm: plan.result,
      inbound: text,
      now,
      fixture,
      knowledge,
      calendarAvailable: true,
      timeZone: "Europe/Istanbul",
    }),
    fixture,
    false,
  );
}
it("does not invent policy when its approved document is absent", () => {
  expect(approvedPolicy([], "price")).toBeUndefined();
  expect(policyAnswers("Online ve çocuk seansı var mı?", [])).toEqual([]);
});
it("answers approved fee without opening an unnecessary price request", () => {
  const result = render("Randevu alacağım, ücret ne kadar?");
  expect(result.outbound).toContain("4.000 TL");
  expect(result.outbound).not.toContain("Ücret talebinizi ekibimize ilettim");
  expect(result.additionalActions?.some((a) => a.type === "PRICE_REQUEST")).toBeFalsy();
});
it("keeps invoice independent of booking intake and fee information", () => {
  const result = render(
    "Yeni randevu alacağım, faturamı gönderir misiniz, bir de ücret ne kadar?",
  );
  expect(result.intent).toBe("NEW_BOOKING");
  expect(result.outbound).toContain("4.000 TL");
  expect(result.outbound).toContain("Fatura talebinizi");
  expect(
    result.additionalActions?.filter((a) => a.type === "INVOICE_REQUEST"),
  ).toHaveLength(1);
});
it("answers online and guardian questions together without a generic clinic dump", () => {
  const result = render("Online seans var mı, çocuk için veli gerekli mi?");
  expect(result.outbound).toContain("Online seans");
  expect(result.outbound).toContain("Veli onayı ve eşliği");
});
it("recognises a guardian question however the Turkish stem is inflected", () => {
  for (const text of [
    "15 yaşındaki çocuğumu getireceğim, veli gerekli mi?",
    "çocuğum için randevu almak istiyorum",
    "Çocuk için veli gerekli mi?",
    "Oğlumu getireceğim",
    "kızım 10 yaşında",
    "ergen danışanlık var mı",
    "veli onayı şart mı",
    "velinin gelmesi gerekiyor mu",
  ]) {
    const answers = policyAnswers(text, knowledge);
    expect(
      answers.map((a) => a.source.id),
      text,
    ).toContain("clinic_policy_guardian");
  }
});
it("does not read an adult's own appointment as a guardian question", () => {
  for (const text of [
    "Randevu almak istiyorum, 29 yaşındayım",
    "Seans ücreti ne kadar?",
    "EMDR nedir?",
  ])
    expect(
      policyAnswers(text, knowledge).map((a) => a.source.id),
      text,
    ).not.toContain("clinic_policy_guardian");
});
it("answers the guardian requirement instead of a generic clinic description", () => {
  const result = render("15 yaşındaki çocuğumu getireceğim, veli gerekli mi?");
  expect(result.outbound).toContain("Veli onayı ve eşliği");
});
