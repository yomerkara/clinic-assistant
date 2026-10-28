import { expect, it } from "vitest";
import { bookingFlow } from "./booking-flow";
const intake = {
  hasFullName: false,
  age: null as number | null,
  hasTherapyHistory: null as boolean | null,
  availabilityNotes: null as string | null,
};
it("enforces the whole booking sequence and does not enroll information enquiries", () => {
  expect(bookingFlow({ requested: false, intake, therapistSelected: false }).stage).toBe(
    "GREETING",
  );
  expect(bookingFlow({ requested: true, intake, therapistSelected: false }).stage).toBe(
    "INTAKE",
  );
  const complete = { ...intake, hasFullName: true, age: 27, hasTherapyHistory: false };
  expect(
    bookingFlow({ requested: true, intake: complete, therapistSelected: false }).stage,
  ).toBe("THERAPIST_PREFERENCE");
  expect(
    bookingFlow({ requested: true, intake: complete, therapistSelected: true }).stage,
  ).toBe("AVAILABILITY");
  const ready = { ...complete, availabilityNotes: "Yarın 15" };
  expect(
    bookingFlow({
      requested: true,
      intake: ready,
      therapistSelected: true,
      slotsOffered: true,
    }).stage,
  ).toBe("SLOT_SELECTION");
  expect(
    bookingFlow({
      requested: true,
      intake: ready,
      therapistSelected: true,
      pendingApproval: true,
    }).stage,
  ).toBe("PENDING_APPROVAL");
  expect(
    bookingFlow({
      requested: true,
      intake: ready,
      therapistSelected: true,
      confirmed: true,
    }).stage,
  ).toBe("CONFIRMED");
});
it("keeps an early therapist choice but still asks the missing surname", () => {
  const result = bookingFlow({
    requested: true,
    intake: {
      ...intake,
      age: 27,
      hasTherapyHistory: false,
      availabilityNotes: "Yarın 15",
    },
    therapistSelected: true,
  });
  expect(result.stage).toBe("INTAKE");
  expect(result.question).toMatch(/soyad/);
});
