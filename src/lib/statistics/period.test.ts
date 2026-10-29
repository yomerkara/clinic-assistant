import { describe, expect, it } from "vitest";
import { clinicMonth, compare } from "./period";

describe("clinicMonth", () => {
  it("starts the month on the clinic's clock, not the server's", () => {
    const period = clinicMonth(new Date("2026-10-28T19:00:00.000Z"));
    // 1 October 00:00 in Istanbul is 30 September 21:00 UTC.
    expect(period.from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(period.label).toContain("Ekim");
  });

  it("keeps a late-evening instant in the month the clinic is still in", () => {
    // 31 October 23:30 Istanbul is 1 November 20:30 UTC on the host clock.
    const period = clinicMonth(new Date("2026-10-31T20:30:00.000Z"));
    expect(period.label).toContain("Ekim");
  });

  it("walks back over a year boundary", () => {
    const period = clinicMonth(new Date("2027-01-15T09:00:00.000Z"), 1);
    expect(period.label).toContain("Aralık");
    expect(period.from.toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("produces windows that touch without overlapping", () => {
    const now = new Date("2026-10-15T09:00:00.000Z");
    const current = clinicMonth(now);
    const previous = clinicMonth(now, 1);
    expect(previous.to.getTime()).toBe(current.from.getTime());
    expect(previous.from.getTime()).toBeLessThan(previous.to.getTime());
  });
});

describe("compare", () => {
  it("reports growth and decline with the previous figure", () => {
    expect(compare(12, 10)).toMatchObject({ direction: "up", percent: 20 });
    expect(compare(8, 10)).toMatchObject({ direction: "down", percent: -20 });
    expect(compare(12, 10).label).toContain("geçen ay 10");
  });

  it("does not invent a percentage when the previous month was empty", () => {
    const change = compare(5, 0);
    expect(change.direction).toBe("new");
    expect(change.percent).toBeNull();
    expect(change.label).toContain("kayıt yoktu");
  });

  it("treats two empty months as no change", () => {
    expect(compare(0, 0)).toMatchObject({ direction: "flat", percent: 0 });
  });

  it("reports a drop to zero as -100%, which is real information", () => {
    expect(compare(0, 7)).toMatchObject({ direction: "down", percent: -100 });
  });

  it("rounds rather than showing a long fraction", () => {
    expect(compare(10, 3).percent).toBe(233);
  });
});
