import { expect, it } from "vitest";
import { patientEditSchema } from "./edit";
const form = {
  version: "0",
  displayName: "Ali Kara",
  age: "",
  hasTherapyHistory: "false",
  availabilityNotes: "",
  alternativeDaysOkay: "",
};
it("preserves false and clears unknown values without converting blank age to zero", () => {
  expect(patientEditSchema.parse(form)).toEqual({
    version: 0,
    displayName: "Ali Kara",
    age: null,
    hasTherapyHistory: false,
    availabilityNotes: null,
    alternativeDaysOkay: null,
  });
});
it.each([
  { age: "121" },
  { age: "-1" },
  { age: "12.5" },
  { displayName: " " },
  { version: "-1" },
  { hasTherapyHistory: "maybe" },
  { availabilityNotes: "x".repeat(501) },
])("rejects invalid profile fields: %j", (invalid) => {
  expect(patientEditSchema.safeParse({ ...form, ...invalid }).success).toBe(false);
});
