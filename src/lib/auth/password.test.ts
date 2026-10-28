import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password and rejects a wrong one", () => {
    const stored = hashPassword("DemoSifre1!");
    expect(verifyPassword("DemoSifre1!", stored)).toBe(true);
    expect(verifyPassword("wrong-pass", stored)).toBe(false);
  });
});
