import { expect, it } from "vitest";
import { hasFullPatientName } from "./identity";
import { isAvailabilityConstraintReply } from "./booking-preference";
it.each(["Ali", "ALi", "Ali Bey", "Elif Hanım", "Yeni Hasta", "Ali randevu"])(
  "does not treat %s as a full name",
  (name) => {
    expect(hasFullPatientName(name)).toBe(false);
  },
);
it.each(["Ali Kara", "Merve Nur Akıl", "Ömer Çelik"])("accepts %s", (name) => {
  expect(hasFullPatientName(name)).toBe(true);
});
it("never treats appended help or safety requests as only scheduling", () => {
  expect(isAvailabilityConstraintReply("şuanlık sadece o saat")).toBe(true);
  expect(isAvailabilityConstraintReply("şu an sadece o saat uygun")).toBe(true);
  expect(
    isAvailabilityConstraintReply("sadece o saat, çalışanla konuşmak istiyorum"),
  ).toBe(false);
  expect(isAvailabilityConstraintReply("sadece o saat kendime zarar vereceğim")).toBe(
    false,
  );
});
