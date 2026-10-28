import { expect, it } from "vitest";
import { applyClinicRules, applySafetyOverlay } from "./rules";
import type { AssistantIntent } from "@/lib/llm/types";

const services =
  "Klinik Psikolog Merve Nur Akıl EMDR ve bilişsel davranışçı terapi alanlarında çalışır.";
function run(inbound: string, intent: AssistantIntent = "THERAPIST_INFO") {
  return applyClinicRules({
    inbound,
    now: new Date("2026-10-07T13:50:00Z"),
    timeZone: "Europe/Istanbul",
    calendarAvailable: true,
    knowledge: [
      {
        id: "therapists",
        title: "Terapistler",
        content: services,
        source: "synthetic",
        version: 1,
      },
    ],
    fixture: { patients: [{ name: "Elifnur", phone: "synthetic" }], appointments: [] },
    llm: {
      provider: "fake",
      model: "test",
      latencyMs: 0,
      turn: {
        intent,
        confidence: 0.95,
        reply: services,
        questionAnswer: services,
        entities: {},
        knowledgeDocId: "therapists",
        needsHandoff: false,
      },
    },
  });
}
it.each(["THERAPIST_INFO", "PRICE_REQUEST"] as const)(
  "preserves therapist information and queues fees with intent %s",
  (intent) => {
    const result = run(
      "randevu alacaktım ama ilk defa santaya geliyorum terapistleriniz hakkında bilgi alabilir miyim ve ücretler hakkında",
      intent,
    );
    expect(result.outbound).toContain(services);
    expect(result.outbound).toContain("Güncel seans ücretini yetkili ekibimiz");
    expect(result.outbound).not.toContain("uygun olup olmadığına");
    expect(result.outbound).not.toContain("ilaç");
    expect(result.botStopped).toBe(false);
    expect(result.handoff).toBeNull();
    expect(result.intent).toBe("PRICE_REQUEST");
    expect(result.action?.type).toBe("PRICE_REQUEST");
  },
);
it.each(["bilgi", "randevu", "fatura"])(
  "does not treat receiving %s as treatment suitability",
  (noun) => {
    expect(run(`${noun} alabilir miyim?`).botStopped).toBe(false);
  },
);
it.each([
  "Terapistler hakkında bilgi alabilir miyim, EMDR bana uygun mu?",
  "Ben ergen terapisi alabiliyor muyum?",
  "EMDR alabilir miyim?",
])("still routes actual suitability questions to staff: %s", (text) => {
  const result = run(text);
  expect(result.botStopped).toBe(true);
  expect(result.action).toBeNull();
  expect(result.outbound).toContain("terapistimizle birlikte değerlendirebilirsiniz");
});

const directory = {
  id: "kd_therapists",
  title: "Onaylı test uzmanları",
  content: "Klinik Psikolog Merve Nur Akıl — EMDR, Bilişsel Davranışçı Terapi. Profil: https://example.org/merve\nPsikolog Hazal Gül Akkuş — Aile Danışmanlığı. Profil: https://example.org/hazal",
  source: "synthetic",
  version: 2,
};

it.each(["THERAPIST_INFO", "NEW_BOOKING", "HUMAN_REQUEST"] as const)(
  "answers the therapist question before suitability handoff for %s",
  (intent) => {
    const inbound = "öncelikle merve hanımın çalışma alanlarından bahsedebilir misiniz benim için uygun mu bilmiyorun";
    const result = applySafetyOverlay(run(inbound, intent), inbound, [directory]);
    expect(result.outbound).toMatch(/^Klinik Psikolog Merve Nur Akıl — EMDR/);
    expect(result.outbound).not.toContain("Hazal");
    expect(result.outbound).not.toContain("Profil:");
    expect(result.outbound).toContain("talebinizi ekibimize iletiyorum");
    expect(result.knowledge?.id).toBe(directory.id);
    expect(result.botStopped).toBe(true);
    expect(result.action).toBeNull();
    expect(result.additionalActions).toEqual([]);
  },
);

it("does not repeat an unverified model claim during suitability handoff", () => {
  const inbound = "Merve Hanımın çalışma alanları neler, bana uygun mu?";
  const candidate = { ...run(inbound), outbound: "Merve Hanım kesinlikle size uygundur." };
  const result = applySafetyOverlay(candidate, inbound, []);
  expect(result.outbound).not.toContain("kesinlikle");
  expect(result.outbound).not.toContain("EMDR");
  expect(result.botStopped).toBe(true);
});

it("does not hand off a therapist information question without suitability", () => {
  const inbound = "merve hanım hangi alanlarda çalışıyor";
  const result = applySafetyOverlay(run(inbound), inbound, [directory]);
  expect(result.botStopped).toBe(false);
  expect(result.handoff).toBeNull();
});
