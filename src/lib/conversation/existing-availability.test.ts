import { expect, it } from "vitest";
import {
  asksExistingAvailability,
  availabilityWindow,
  namedAvailabilityTherapists,
} from "./existing-availability";
it("routes availability independently of therapist information", () => {
  expect(
    asksExistingAvailability(
      "Selamlar bu hafta yönetici Ömer Beyin müsaitliği var mı acaba",
    ),
  ).toBe(true);
  for (const t of [
    "Merve Hanımın hangi hizmetleri var?",
    "Benim için Merve Hanım uygun mu?",
    "Randevumu iptal edip uygun saatlere bakalım",
  ])
    expect(asksExistingAvailability(t)).toBe(false);
});
it("keeps availability in a mixed fee question for the shared information composer", () => {
  expect(asksExistingAvailability("Ücret nedir, yarın müsait mi?")).toBe(true);
});
it("matches explicitly named therapists including Turkish suffixes", () => {
  const roster = [
    { displayName: "Klinik Psikolog Merve Nur Akıl" },
    { displayName: "Yönetici Ömer (test)" },
  ];
  expect(namedAvailabilityTherapists("Ömer Beyin müsaitliği", roster)).toEqual([
    roster[1],
  ]);
  expect(namedAvailabilityTherapists("Merve'nin müsaitliği", roster)).toEqual([
    roster[0],
  ]);
  expect(namedAvailabilityTherapists("Cem Bey müsait mi", roster)).toEqual([]);
});
it("keeps this week and next week within Istanbul calendar boundaries", () => {
  const now = new Date("2026-10-09T08:28:00Z");
  expect(availabilityWindow("bu hafta", now).to.toISOString()).toBe(
    "2026-10-11T21:00:00.000Z",
  );
  expect(availabilityWindow("haftaya", now).from.toISOString()).toBe(
    "2026-10-11T21:00:00.000Z",
  );
  expect(availabilityWindow("yarın", now).to.toISOString()).toBe(
    "2026-10-10T21:00:00.000Z",
  );
});
