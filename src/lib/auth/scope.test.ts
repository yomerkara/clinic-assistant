import { it, expect } from "vitest";
import { patientScope, canReadPatient } from "./scope";
it("does not grant unassigned therapists global or orphan-record access", () => {
  const unassigned = {
    userId: "u",
    role: "THERAPIST" as const,
    therapistProfileId: null,
  };
  expect(patientScope(unassigned)).toEqual({ id: { in: [] } });
  expect(canReadPatient(unassigned, [])).toBe(false);
  const actor = { ...unassigned, therapistProfileId: "mine" };
  expect(canReadPatient(actor, [])).toBe(false);
  expect(canReadPatient(actor, [{ therapistId: "other" }])).toBe(false);
  expect(canReadPatient(actor, [{ therapistId: "mine" }])).toBe(true);
});
