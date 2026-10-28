import { describe, expect, it } from "vitest";
import { formatClinicClock, formatClinicDateTime } from "./clinic-clock";

describe("clinic clock rendering", () => {
  it("reads an instant in clinic time regardless of the host zone", () => {
    // 12:27 UTC is 15:27 in Istanbul; a UTC server must not render 12:27,
    // otherwise React discards the markup the browser re-renders (error #418).
    expect(formatClinicClock("2026-10-27T12:27:00.000Z")).toBe("15:27");
    expect(formatClinicDateTime("2026-10-27T12:27:00.000Z")).toContain("15:27");
  });

  it("returns an empty string for an unusable value instead of Invalid Date", () => {
    expect(formatClinicClock("not-a-date")).toBe("");
    expect(formatClinicDateTime("")).toBe("");
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(formatClinicClock(new Date("2026-10-27T12:27:00.000Z"))).toBe("15:27");
  });

  it("keeps the same wall clock in winter, when Türkiye stays on UTC+3", () => {
    expect(formatClinicClock("2027-01-15T12:00:00.000Z")).toBe("15:00");
  });

  it("names the day and month for a longer label", () => {
    expect(formatClinicDateTime("2026-10-27T12:00:00.000Z")).toMatch(/27 Eki/);
  });
});
