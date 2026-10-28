import { describe, it, expect } from "vitest";
import { toIstanbulInput, parseIstanbulInput, validAppointmentRange } from "./dates";
describe("appointment timezone boundary", () => {
  it("roundtrips displayed İstanbul time regardless of server timezone", () => {
    const utc = "2026-10-05T16:00:00.000Z";
    expect(toIstanbulInput(utc)).toBe("2026-10-05T19:00");
    expect(parseIstanbulInput("2026-10-05T19:00").toISOString()).toBe(utc);
  });
  it("rejects impossible dates, past appointments and reversed intervals", () => {
    expect(Number.isNaN(parseIstanbulInput("2026-02-30T12:00").getTime())).toBe(true);
    expect(Number.isNaN(parseIstanbulInput("2026-10-05T24:30").getTime())).toBe(true);
    const now = new Date("2026-10-03T10:00Z");
    expect(
      validAppointmentRange(
        new Date("2026-10-02T10:00Z"),
        new Date("2026-10-02T11:00Z"),
        now,
      ),
    ).toBe(false);
    expect(
      validAppointmentRange(
        new Date("2026-10-04T10:00Z"),
        new Date("2026-10-04T09:00Z"),
        now,
      ),
    ).toBe(false);
  });
});
