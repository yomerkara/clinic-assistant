import { describe, expect, it } from "vitest";
import { googleCallbackUrl } from "./google-callback";

describe("Google callback during local HTTPS migration", () => {
  it.each(["auth", "calendar"] as const)("uses the public origin for %s", (kind) => {
    expect(googleCallbackUrl(kind, "https://clinic.example", "")).toBe(
      `https://clinic.example/api/${kind}/google/callback`,
    );
  });
  it.each(["auth", "calendar"] as const)(
    "preserves the registered loopback %s URI",
    (kind) => {
      expect(googleCallbackUrl(kind, "https://localhost", "http://localhost:3000")).toBe(
        `http://localhost:3000/api/${kind}/google/callback`,
      );
    },
  );
  it("rejects the local relay in public deployments", () => {
    expect(() =>
      googleCallbackUrl("auth", "https://clinic.example", "http://localhost:3000"),
    ).toThrow();
  });
  it.each([
    "https://evil.example",
    "http://localhost:3000/other",
    "http://localhost:3001",
  ])("rejects unconfigured relay %s", (relay) => {
    expect(() => googleCallbackUrl("auth", "https://localhost", relay)).toThrow();
  });
});
