import { describe, it, expect } from "vitest";
import { firstSetupStep, visibleSetupStep, normalizeSetupPhone } from "./onboarding";
const ready = {
  role: "THERAPIST",
  emailVerifiedAt: new Date(),
  phone: "+905321234567",
  username: "therapist",
  mustChangePassword: false,
  mfaEnabledAt: new Date(),
};
describe("persistent onboarding order", () => {
  it("locks future steps until their prerequisites are met", () => {
    expect(visibleSetupStep({ ...ready, emailVerifiedAt: null }, true, "4")).toBe(0);
    expect(firstSetupStep({ ...ready, phone: null }, true)).toBe(1);
    expect(firstSetupStep({ ...ready, mustChangePassword: true }, true)).toBe(2);
    expect(firstSetupStep({ ...ready, mfaEnabledAt: null }, true)).toBe(2);
    expect(firstSetupStep(ready, false)).toBe(2);
    expect(firstSetupStep(ready, true)).toBe(2);
  });
  it("requires therapist calendars, allows administrators to proceed and skips intern calendars", () => {
    expect(visibleSetupStep(ready, false, "4")).toBe(2);
    expect(visibleSetupStep({ ...ready, role: "ADMIN" }, false, "4")).toBe(2);
    expect(firstSetupStep({ ...ready, role: "INTERN" }, false)).toBe(2);
  });
  it("ignores invalid requested steps and permits reviewing earlier steps", () => {
    expect(visibleSetupStep(ready, true, "0")).toBe(0);
    expect(visibleSetupStep(ready, true, "-1")).toBe(2);
    expect(visibleSetupStep(ready, true, "99")).toBe(2);
  });
  it.each(["0532 123 45 67", "5321234567", "+90 (532) 123-45-67"])(
    "normalizes %s",
    (value) => expect(normalizeSetupPhone(value)).toBe("+905321234567"),
  );
  it.each(["abc", "++905321234567", "123", "+000000000", "5321234567<script>"])(
    "rejects invalid phone %s",
    (value) => expect(normalizeSetupPhone(value)).toBeNull(),
  );
});
