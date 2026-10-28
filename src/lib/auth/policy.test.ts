import { it, expect, vi, afterEach } from "vitest";
import { needsAccountSetup, passwordExpiry, passwordPolicyError } from "./policy";
afterEach(() => vi.unstubAllEnvs());
it("requires credentials and verified recovery before access", () => {
  expect(
    needsAccountSetup({
      username: null,
      emailVerifiedAt: null,
      mustChangePassword: true,
    }),
  ).toBe(true);
  expect(
    needsAccountSetup({
      username: "test",
      emailVerifiedAt: new Date(),
      mfaEnabledAt: new Date(),
      mustChangePassword: false,
    }),
  ).toBe(false);
  expect(
    needsAccountSetup({
      username: "test",
      emailVerifiedAt: new Date(),
      mfaEnabledAt: new Date(),
      mustChangePassword: false,
      passwordExpiresAt: new Date(0),
    }),
  ).toBe(true);
});
it("requires a six-calendar-month renewal and handles month-end dates", () => {
  vi.stubEnv("PASSWORD_ROTATION_MONTHS", "6");
  expect(passwordExpiry(new Date("2026-08-31T10:00:00Z")).toISOString()).toBe(
    "2027-02-28T10:00:00.000Z",
  );
  expect(passwordPolicyError("short")).not.toBe(null);
});
