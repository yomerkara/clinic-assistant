import { describe, expect, it } from "vitest";
import { canDeferSetup } from "./setup-deferral";
describe("local setup deferral", () => {
  it("requires explicit opt-in and a loopback application origin", () => {
    expect(canDeferSetup({ APP_URL: "http://localhost:3000" })).toBe(false);
    expect(canDeferSetup({ ALLOW_LOCAL_SETUP_SKIP: "true", APP_URL: "http://localhost:3000" })).toBe(true);
    for (const APP_URL of ["https://clinic.example", "https://localhost.evil.test", "invalid", ""]) {
      expect(canDeferSetup({ ALLOW_LOCAL_SETUP_SKIP: "true", APP_URL })).toBe(false);
    }
  });
});
