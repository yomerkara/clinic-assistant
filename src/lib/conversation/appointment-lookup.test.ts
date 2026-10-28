import { expect, it } from "vitest";
import {
  asksAppointmentLookup,
  historicalLookup,
  appointmentLookupLabel,
} from "./appointment-lookup";
it.each([
  "Randevum ne zamandı?",
  "Randevum saat kaçta?",
  "Randevum hangi uzmanla?",
  "Yarın randevum var mı?",
  "Randevularımı listeler misiniz?",
  "Randevum onaylandı mı?",
  "Randevum ne zaman, faturamı da gönderin",
])("recognizes read-only lookup: %s", (text) =>
  expect(asksAppointmentLookup(text)).toBe(true),
);
it.each([
  "Randevumu iptal edin",
  "Randevumu değiştirin",
  "Randevu alacağım",
  "Bu hafta müsaitlik var mı?",
])("keeps other operations out of read-only lookup: %s", (text) =>
  expect(asksAppointmentLookup(text)).toBe(false),
);
it("marks explicit history and includes the year and Istanbul time", () => {
  expect(historicalLookup("Geçmiş randevularımı göster")).toBe(true);
  expect(historicalLookup("Randevum ne zamandı")).toBe(false);
  expect(appointmentLookupLabel(new Date("2026-10-12T13:00:00Z"))).toContain("16:00");
  expect(appointmentLookupLabel(new Date("2026-10-12T13:00:00Z"))).toContain("2026");
});

import { rescheduleParts } from "./appointment-lookup";
it.each([
  [
    "13 Ekim saat 14:00 randevumu 15 Ekim saat 16:00'a alabilir miyiz?",
    "13 ekim saat 14:00",
    "15 ekim",
  ],
  ["Salı randevumu cuma aynı saate erteleyelim", "sali", "cuma"],
  ["Yarın randevumu haftaya salıya taşıyalım", "yarin", "haftaya sali"],
])("separates source and destination: %s", (text, source, destination) => {
  expect(rescheduleParts(text)?.source).toBe(source);
  expect(rescheduleParts(text)?.destination).toContain(destination);
});
it("does not reinterpret cancellation as a move", () => {
  expect(
    rescheduleParts("Salı randevumu iptal edin, cuma için sonra konuşuruz"),
  ).toBeNull();
});

it("does not treat a real cancellation or rejected extra booking as an additional session", async () => {
  const { additionalBookingText } = await import("./appointment-lookup");
  expect(additionalBookingText("22 Ekim randevumu iptal edin. 29 Ekim için yeni randevu istiyorum.")).toBeNull();
  expect(additionalBookingText("22 Ekim randevum kalsın. Yeni randevu istemiyorum.")).toBeNull();
  expect(additionalBookingText("22 Ekim randevum kalsın. Diğer randevumu iptal etmek istiyorum.")).toBeNull();
});
